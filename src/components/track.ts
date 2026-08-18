/*
 * Track — a run of segments filled in order (SPEC §4.2, docs/track.md). Covers
 * exhaustion, stress, XP, uses per day, death saves and clocks: the trackers
 * whose state is a count of discrete things rather than a quantity.
 *
 * A Pool and a Track both hold a number under a ceiling, which is why the
 * build order called this a simpler Pool. What differs is what the number is
 * for. A pool is read as a proportion, so it draws a bar and prints its
 * numerals; a track is read as a count of things that each mean something —
 * the third exhaustion segment, the second death save — so its segments are already
 * both the proportion and the count and the card carries no numerals at all.
 * That also settles the ceiling's name: a quantity has a `max`, a run has a
 * `count`.
 *
 * The atom is the mark, not the segment. `marks` is how many presses fill one
 * segment and the stored value counts marks, so an Ironsworn progress track of
 * ten four-mark segments stores `value: 22` rather than a segment count and a
 * remainder that can disagree with each other. At the default of one the two
 * are the same number and the note reads exactly as every other track's does.
 */

import { levelGlyph, levelName, parseLevel } from './level-ring';
import { bindLongPress } from './popover';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ResetResult,
	ScopeEntry,
	ScopeValues,
} from '../types';

/** SPEC §3.1: a single-value component stores its value under `value`. */
const VALUE_KEY = 'value';

export interface TrackConfig extends ComponentConfig {
	type: 'track';
	/**
	 * How many segments the run holds, as a literal or an expression. Ignored
	 * where `levels` is set, since naming the steps settles how many there
	 * are.
	 */
	count?: string | number;
	/** How many presses fill one segment. Defaults to 1. */
	marks?: number;
	/**
	 * Names for the steps from none upwards, in the syntax a `level` column
	 * uses and parsed by the same code — including a mark after a colon.
	 */
	levels?: string[];
	/**
	 * Which end of the run is the bad end. The same row of segments fills toward
	 * an achievement in one system and a catastrophe in the next, and no
	 * property of the data distinguishes them.
	 */
	sense?: 'progress' | 'harm';
	/** Leave the heading off the sheet, as on a Stat. */
	hideLabel?: boolean;
}

export interface TrackData {
	/**
	 * Stored marks. Absent means "not part of this change", the delta rule
	 * every component's data follows.
	 */
	value?: string;
}

/**
 * The most segments a run may draw. A track is three to ten units wide in every
 * system that has one, and the bound is what stands between a mis-typed
 * formula — or a `count` reading a level that just went up by three orders of
 * magnitude — and a hang. It clamps rather than erroring, because a run too
 * long to draw is still a run, and the number in the note is untouched.
 */
export const MAX_SEGMENTS = 100;

/**
 * How long a run of keyboard steps stays open before it is written. The rule
 * the Pool's held button already follows: feedback is continuous, persistence
 * is discrete, and a five-press climb is one change to the note rather than
 * five saves racing each other's re-renders.
 */
const GESTURE_COMMIT = 700;

/**
 * The furthest the run travels past either end of itself, in pixels, and how
 * hard the pointer has to work to get there. A hard stop reads as a frozen
 * control; a few pixels of give reads as a responsive one with nothing
 * further to offer. The value itself is held inside the run — unlike a Pool,
 * whose boundary is a rule of the game the plugin must not enforce, a track's
 * ends are the run's own extent and there is no segment beyond the last one to
 * fill.
 */
const OVERSCROLL_MAX = 10;
const OVERSCROLL_RESIST = 60;

/** How many presses fill one segment. Anything unusable is one. */
export function markSize(config: TrackConfig): number {
	const marks = Math.floor(config.marks ?? 1);
	return Number.isFinite(marks) && marks >= 1 ? marks : 1;
}

/**
 * Configuration that makes the run undrawable rather than merely empty.
 * Reported on this component alone, per SPEC §10.
 */
export function configError(config: TrackConfig): string | null {
	if (config.marks !== undefined) {
		const marks = config.marks;
		if (!Number.isInteger(marks) || marks < 1) {
			return 'Marks per segment has to be a whole number, 1 or more.';
		}
	}
	if (config.levels !== undefined) {
		if (config.levels.length < 2) {
			// The first name is what "none" is called, so a single name
			// describes a run with no step to reach.
			return 'A named track needs at least two level names, starting with the one for none.';
		}
		if (config.levels.some((entry) => parseLevel(entry).name === '')) {
			// A mark stands for the level's name; it does not replace it. The
			// name is what a screen reader is given and what the step line
			// reads, and a glyph alone leaves both with nothing to say.
			return 'A level has a mark but no name.';
		}
		return null;
	}
	if (config.count === undefined) {
		return 'This track needs a number of segments, or named levels to count.';
	}
	return null;
}

/**
 * How many segments the run holds, or null where the count is present and did
 * not resolve — which is the one case "?" is reserved for (SPEC §5).
 *
 * Naming the levels settles how many there are, so `levels` wins outright and
 * cannot fail. Everything else is a formula field like a Pool's `max`, and
 * fails like one. A resolved count below one is a failure too: a run of no
 * segments is not something a reader can be shown, and reporting it as an
 * unresolved count is the honest answer.
 */
export function segmentCount(
	config: TrackConfig,
	resolved: string | number | boolean | null | undefined,
): number | null {
	if (config.levels !== undefined) return config.levels.length - 1;
	const value = typeof resolved === 'number' ? resolved : Number(resolved);
	if (!Number.isFinite(value)) return null;
	const segments = Math.floor(value);
	if (segments < 1) return null;
	return Math.min(MAX_SEGMENTS, segments);
}

/** What a step is called: its name where the levels are named, its count otherwise. */
export function stepLabel(config: TrackConfig, segments: number, of: number): string {
	if (config.levels !== undefined) return levelName({ levels: config.levels }, segments);
	return `${segments} of ${of}`;
}

/** A segment's rectangle, as the run measures it. */
export interface SegmentRect {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * The mark count a pointer is asking for, in the run's own geometry.
 *
 * Pure, and given rectangles rather than elements, because a run wider than
 * its cell wraps to a second line and the arithmetic that survives that is
 * not a division. A wrap resets x, which is how the rows are found: a segment
 * starting no further right than the one before it begins a new row.
 *
 * Where a segment holds several marks the pointer reaches each of them inside
 * the segment's own width, so a four-mark segment is four positions rather than one.
 */
export function marksAtPoint(
	rects: readonly SegmentRect[],
	x: number,
	y: number,
	marks: number,
): number {
	if (rects.length === 0) return 0;

	const rows: number[][] = [];
	rects.forEach((rect, index) => {
		const previous = rects[index - 1];
		if (previous === undefined || rect.left <= previous.left) rows.push([]);
		rows[rows.length - 1]?.push(index);
	});

	// The row the pointer is in, or the nearest one: a pointer that has left
	// the run vertically is still asking about the row it left through.
	let row = rows[rows.length - 1] as number[];
	for (const candidate of rows) {
		const bottom = Math.max(...candidate.map((i) => rects[i]?.bottom ?? 0));
		if (y < bottom) {
			row = candidate;
			break;
		}
	}

	const first = row[0] as number;
	const last = row[row.length - 1] as number;
	// Left of the row is everything before it filled and nothing in it.
	if (x < (rects[first] as SegmentRect).left) return first * marks;
	for (const index of row) {
		const rect = rects[index] as SegmentRect;
		if (x < rect.left) return index * marks;
		if (x > rect.right) continue;
		const width = rect.right - rect.left;
		const share = width > 0 ? (x - rect.left) / width : 1;
		// Ceiling, so touching a segment at all fills its first mark: there is no
		// position inside a segment that means "this segment, empty".
		const inside = Math.min(marks, Math.max(1, Math.ceil(share * marks)));
		return index * marks + inside;
	}
	return (last + 1) * marks;
}

/**
 * How full one segment is, from a mark total. Shared by the committed fill and
 * the pending one, which is what keeps a preview from disagreeing with the
 * outcome it is previewing — the rule the Pool's `landing` already keeps.
 */
function segmentFill(total: number, index: number, marks: number): number {
	return Math.max(0, Math.min(1, (total - index * marks) / marks));
}

export const track: ComponentDefinition<TrackConfig, TrackData> = {
	type: 'track',
	storage: 'fenced',
	// `reset.*.to` rather than `reset.to`: the bindings are a list, so each
	// one's expression lives at its own index and the sheet rewrites the
	// logical name to that index before the component asks for it.
	formulaFields: ['count', 'reset.*.to'],
	configFields: [
		{
			key: 'count',
			kind: 'formula',
			label: 'Segments',
			description:
				'How many segments the run holds, as a number or a formula, e.g. 10, or 2 + if(abilities.PHY >= 3, 2, 1). Ignored where the levels below are named, since naming them settles how many there are.',
		},
		{
			key: 'marks',
			kind: 'number',
			label: 'Marks per segment',
			description:
				'How many presses fill one segment. Defaults to 1. An Ironsworn progress track is ten segments of four marks. The note stores marks either way, so a segment count and a remainder can never disagree.',
		},
		{
			key: 'levels',
			kind: 'text-list',
			label: 'Level names',
			description:
				'Names the steps from none upwards, comma separated, e.g. Rested, Exhaustion 1, Exhaustion 2. A name may carry one segment after a colon, as in "Exhaustion 6:☠". Naming the levels settles how many segments there are, so this wins over the count above.',
		},
		{
			key: 'sense',
			kind: 'select',
			label: 'Sense',
			description:
				'Which end of the run is the bad end. XP and a countdown clock are the same widget pointed in opposite directions, and nothing in the data says which this is. Harm grades the run toward the boundary colour; it never stops a press, since whether a track may be pushed past its last segment is a rule of the game.',
			options: ['progress', 'harm'],
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description:
				'Leave the heading off the sheet. Worth it only under a heading that already names the run.',
			default: false,
		},
	],

	read(body): ReadResult<TrackData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty run, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const data: TrackData = {};
		const value = parsed.values.get(VALUE_KEY);
		if (value !== undefined) {
			const text = value.trim();
			// A number the run cannot represent is still a number and is left
			// exactly as it is (§7). Something that is not one at all is a
			// malformed section, reported on this component alone.
			if (text !== '' && !Number.isFinite(Number(text))) {
				return {
					ok: false,
					error: `"${text}" is not a number of marks.`,
				};
			}
			data.value = value;
		}
		// Entries under any other key are left where they are, untouched.
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		const marks = markSize(config);
		const stored = data?.value?.trim() ?? '';
		const raw = stored === '' ? null : Number(stored);
		const segments =
			raw !== null && Number.isFinite(raw) ? Math.floor(raw / marks) : undefined;

		const named: Record<string, ScopeEntry> = {
			/*
			 * `<id>.value` is the stored mark count, and it is restated here
			 * rather than left to the name table's own `.value`, which would
			 * take it from `self`. The bare id has to be the filled segments —
			 * `exhaustion - 1` is written about the segments a reader can see,
			 * not about a mark total whose size depends on a config field the
			 * formula cannot see — and §5 still wants the raw number
			 * reachable. Where a segment holds one mark the two are the same
			 * number and this changes nothing.
			 */
			value: { value: data?.value },
		};
		if (config.levels !== undefined) {
			named.count = { value: config.levels.length - 1 };
		} else if (config.count !== undefined) {
			// A formula like a Pool's max, evaluated lazily because it may
			// reference another component.
			named.count = { display: { field: 'count', scope: {} } };
		}

		return { self: { value: segments }, named };
	},

	applyReset(data, config, reset, context): ResetResult<TrackData> {
		const marks = markSize(config);

		if (reset.action === 'empty') {
			// Nothing to resolve: empty is zero whatever the run's length is,
			// so a track whose count is broken can still be cleared.
			return { ok: true, data: { value: '0' } };
		}

		if (reset.action === 'full') {
			const segments =
				config.levels !== undefined
					? config.levels.length - 1
					: segmentCount(config, context.resolve('count', {}));
			if (segments === null) {
				return {
					ok: false,
					error: context.explain('count', {}) ?? 'it has no segments to fill.',
				};
			}
			return { ok: true, data: { value: String(segments * marks) } };
		}

		if (reset.action === 'formula') {
			const value = context.resolve('reset.to', {});
			if (value === null) {
				return {
					ok: false,
					error: context.explain('reset.to', {}) ?? 'its reset formula is empty.',
				};
			}
			const segments = Number(value);
			if (!Number.isFinite(segments)) {
				return {
					ok: false,
					error: `its reset formula produced "${String(value)}", which is not a number of segments.`,
				};
			}
			// The expression is written in segments, because that is what the run
			// publishes and what an author counts. Down to the nearest mark,
			// so half a segment of an Ironsworn track lands on a mark boundary
			// rather than storing a fraction the note cannot mean.
			return { ok: true, data: { value: String(Math.floor(segments * marks)) } };
		}

		// A binding carrying only a buffer instruction, which a track has none
		// of. Nothing to do, and nothing failed.
		return { ok: true, data: {} };
	},

	write(data, body): string {
		const updates = new Map<string, string>();
		if (data.value !== undefined) updates.set(VALUE_KEY, data.value);
		return writeFenced(body, updates);
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		const view = doc.defaultView;
		container.replaceChildren();

		const card = doc.createElement('div');
		card.classList.add('sheetsmith-track');
		container.appendChild(card);

		const problem = configError(config);
		if (problem !== null) {
			// A misconfigured component reports on itself; SPEC §10 keeps the
			// rest of the sheet rendering and editable.
			const error = doc.createElement('div');
			error.classList.add('sheetsmith-error');
			error.textContent = problem;
			card.appendChild(error);
			return;
		}

		if (config.hideLabel !== true) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-track-label');
			label.textContent = config.label;
			card.appendChild(label);
		}

		const marks = markSize(config);
		const count = segmentCount(config, context.resolved['count']);

		if (count === null) {
			// Present and unresolved, which is exactly what "?" is for. No
			// delay here, unlike a card's derived display: that one waits out
			// UNRESOLVED_DELAY because it repaints from a draft being typed and
			// a half-typed value is not wrong yet. A count is layout config
			// resolved once per render, so there is no in-between state to
			// wait through and the delay would only make the answer late.
			const unresolved = doc.createElement('div');
			unresolved.classList.add('sheetsmith-track-unresolved');
			unresolved.textContent = '?';
			unresolved.setAttribute(
				'title',
				context.explainField?.('count', {}) ??
					'The number of segments did not resolve.',
			);
			card.appendChild(unresolved);
			return;
		}

		const total = count * marks;
		const harm = config.sense === 'harm';
		const named = config.levels !== undefined;

		/** The stored value in marks. Anything unreadable is an empty run. */
		const storedMarks = ((): number => {
			const raw = data?.value?.trim() ?? '';
			if (raw === '') return 0;
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : 0;
		})();

		/*
		 * What has actually been reported, tracked rather than read back off
		 * `data`: the rendered data is a snapshot from the last paint and a
		 * commit re-renders asynchronously, so two gestures in quick
		 * succession would both compare against the same stale value and the
		 * second would be dropped as "no change".
		 */
		let sent = data?.value ?? '';
		/** The run's own value, moved by a gesture and written when it ends. */
		let value = storedMarks;
		/** Where a gesture in flight would land, or null when none is. */
		let pending: number | null = null;

		const run = doc.createElement('div');
		run.classList.add('sheetsmith-track-run');
		if (harm) run.classList.add('sheetsmith-track-harm');
		if (marks > 1) {
			// A segment holding several marks is several targets, so it is drawn
			// wider and its divisions are drawn in. Both are the same point:
			// a position you cannot see is a position you cannot aim at, and
			// the drag that reaches these is worth having only if the reader
			// can tell one quarter of a segment from another.
			run.classList.add('sheetsmith-track-marked');
			run.style.setProperty('--sheetsmith-track-marks', String(marks));
		}
		run.setAttribute('role', 'slider');
		run.setAttribute('aria-valuemin', '0');
		run.setAttribute('aria-valuemax', String(total));
		run.tabIndex = 0;
		card.appendChild(run);

		const segments: HTMLElement[] = [];
		for (let index = 0; index < count; index++) {
			const segment = doc.createElement('span');
			segment.classList.add('sheetsmith-track-segment');
			// How far along the run this segment is. A harm run mixes its fill
			// from it, so the escalation is read as a shape before a single
			// name is; a progress run takes the accent whole. The share comes
			// in from here because the stylesheet cannot know how long this
			// run is — the same reason a level ring is handed its own.
			if (harm) {
				segment.style.setProperty(
					'--sheetsmith-track-grade',
					String((index + 1) / count),
				);
			}
			// Only a glyph the level asked for, never the initial a ring falls
			// back to: six segments each carrying an "E" is noise, where one ☠ on
			// the last is the layout saying something the run cannot.
			const solid = doc.createElement('span');
			solid.classList.add('sheetsmith-track-segment-fill');
			segment.appendChild(solid);
			const ghost = doc.createElement('span');
			ghost.classList.add('sheetsmith-track-segment-ghost');
			segment.appendChild(ghost);

			/*
			 * A divider per boundary *between* marks, so a segment holding n of
			 * them gets n - 1. The segment's own border is already the outer two,
			 * and drawing those again is what a repeating gradient does: it
			 * puts a line at the end of every mark, including the last, which
			 * lands on the inner edge of the right border and doubles it.
			 *
			 * Elements rather than a background, and the count is the reason.
			 * The gradient's own edge behaviour is not something a test can
			 * look at, so "one line too many" was invisible to everything
			 * except the eye; three spans at three offsets is a number a test
			 * can assert.
			 */
			for (let division = 1; division < marks; division++) {
				const divider = doc.createElement('span');
				divider.classList.add('sheetsmith-track-mark');
				divider.style.setProperty(
					'--sheetsmith-track-at',
					String(division / marks),
				);
				segment.appendChild(divider);
			}

			// Last, and positioned, so it paints over the fills rather than
			// under them. As the segment's own inline text it did not: a
			// positioned descendant paints after its parent's inline content,
			// so the one segment a layout bothered to letter lost its letter at
			// exactly the moment the segment filled.
			if (named) {
				const glyph = parseLevel(config.levels?.[index + 1] ?? '').glyph;
				if (glyph !== null && glyph !== '') {
					const letter = doc.createElement('span');
					letter.classList.add('sheetsmith-track-segment-glyph');
					letter.textContent = levelGlyph(
						{ levels: config.levels },
						index + 1,
					);
					segment.appendChild(letter);
				}
			}
			run.appendChild(segment);
			segments.push(segment);
		}

		const step = named ? doc.createElement('div') : null;
		if (step !== null) {
			step.classList.add('sheetsmith-track-step');
			card.appendChild(step);
		}

		/**
		 * Repaint everything derived from the run's state: each segment's fill,
		 * the pending fill reaching past it, the step name, and what the
		 * control says it is on.
		 *
		 * With a gesture in flight the solid fill is the smaller of where the
		 * run is and where it would land and the faint one reaches the larger
		 * — the Pool's bar rule exactly, and for the same reason: a spend
		 * reads as "this much stays" and a restore as "this much arrives".
		 */
		/** The mark count the note actually holds. Unreadable counts as none. */
		const writtenMarks = (): number => {
			const raw = sent.trim();
			if (raw === '') return 0;
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : 0;
		};

		const paint = (): void => {
			const landing = pending ?? value;
			/*
			 * Solid is what the note holds; faint is everything the run is
			 * showing that the note does not hold yet. One rule, and the
			 * faint region always means exactly "this much is not saved".
			 *
			 * It used to be measured from the run's live value instead, which
			 * made it a preview of the gesture under the finger and nothing
			 * else. Every path that moves the value without a pointer then had
			 * no representation at all: an arrow key drew a solid segment and the
			 * note caught up to it as much as seven hundred milliseconds
			 * later, so the screen said "written" for the whole of the window
			 * where it was not. Measuring from the note covers the pointer
			 * exactly as before — nothing about a press or a drag changes —
			 * and covers the keyboard and the debounce with the same ink.
			 */
			const written = writtenMarks();
			const solidMarks = Math.min(written, landing);
			const ghostMarks = Math.max(written, landing);
			segments.forEach((segment, index) => {
				const solid = segmentFill(solidMarks, index, marks);
				const ghost = segmentFill(ghostMarks, index, marks);
				segment.style.setProperty('--sheetsmith-track-fill', String(solid));
				segment.style.setProperty(
					'--sheetsmith-track-ghost',
					String(written === landing ? 0 : ghost),
				);
				segment.classList.toggle('sheetsmith-track-segment-on', solid > 0);
			});
			// Held inside the run for what the control reports, however the
			// note happens to be spelled: a hand-edited 9 on a six-segment run
			// fills every segment and stays 9 in the note (§7).
			const shown = Math.max(0, Math.min(total, landing));
			const filled = Math.floor(shown / marks);
			run.setAttribute('aria-valuenow', String(shown));
			run.setAttribute('aria-valuetext', stepLabel(config, filled, count));
			run.setAttribute(
				'aria-label',
				`${config.label}, ${stepLabel(config, filled, count)}`,
			);
			if (step !== null) step.textContent = stepLabel(config, filled, count);
			// Only a named run earns one. An unnamed step's name is the count,
			// which the segments already state — and a tooltip repeating what is
			// legible is noise fired at every pass, as the stat card's label
			// and the level ring both learned.
			if (named) run.title = stepLabel(config, filled, count);
		};

		/** Move the run without writing. Feedback is continuous (SPEC §4.2). */
		const setMarks = (next: number): void => {
			const held = Math.max(0, Math.min(total, Math.round(next)));
			if (held === value) return;
			value = held;
			paint();
		};

		let commitTimer: number | undefined;

		const commit = (): void => {
			if (commitTimer !== undefined) {
				view?.clearTimeout(commitTimer);
				commitTimer = undefined;
			}
			// A rebuild replaces the run, and a commit arriving after that
			// would be writing out of a detached control.
			if (!run.isConnected) return;
			const next = String(value);
			if (next === sent) return;
			sent = next;
			// The write is what the solid fill means, so the fill settles here
			// rather than waiting for the rebuild the change will cause. This
			// is the only moment on the card that says "saved".
			paint();
			context.onChange({ value: next });
		};

		/** Write at the end of the run of presses, unless something ends it sooner. */
		const commitSoon = (): void => {
			if (commitTimer !== undefined) view?.clearTimeout(commitTimer);
			commitTimer = view?.setTimeout(() => {
				commitTimer = undefined;
				commit();
			}, GESTURE_COMMIT);
		};

		run.addEventListener('blur', commit);

		/* --- Pointer: a press answers on the way down, a drag sets it live --- */

		const reduced =
			view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

		/** How far the run gives past either end, and springing back. */
		const overscroll = (beyond: number): void => {
			if (reduced || beyond === 0) {
				run.style.removeProperty('transform');
				return;
			}
			// Saturating, so the give increases in resistance and stops at a
			// few pixels rather than following the finger off the card.
			const px =
				Math.sign(beyond) *
				OVERSCROLL_MAX *
				(1 - 1 / (1 + Math.abs(beyond) / OVERSCROLL_RESIST));
			run.style.setProperty('transform', `translateX(${px}px)`);
		};

		const rects = (): SegmentRect[] =>
			segments.map((segment) => {
				const rect = segment.getBoundingClientRect();
				return {
					left: rect.left,
					right: rect.right,
					top: rect.top,
					bottom: rect.bottom,
				};
			});

		/**
		 * Whether a point is still on the run, which is a question about y
		 * alone.
		 *
		 * Going past either end horizontally is not leaving: it is the case the
		 * end resistance exists for, where the value holds at empty or full and
		 * the run gives a few pixels. If x counted here the two rules would be
		 * unreachable together — every drag that reached a boundary would be
		 * reported as having left the control, and the resistance would never
		 * fire. Leaving is a movement away from the run, and that is vertical.
		 */
		const onRun = (y: number): boolean => {
			const rect = run.getBoundingClientRect();
			return y >= rect.top && y <= rect.bottom;
		};

		let pointer: number | null = null;
		/**
		 * Whether the pointer has moved at all since it went down. It decides
		 * one thing only — whether the fill tracks the finger or eases into
		 * place — and deliberately not whether the movement counts.
		 *
		 * There is no drag threshold on this control, and the absence is the
		 * decision. A Pool needs one because its number is a text field where
		 * a press places a caret and a drag scrubs, so the two gestures
		 * genuinely compete and one has to win. Here the press already fills
		 * on the way down: a press is a drag of no length, the same code path
		 * reading the same position, and there is nothing to disambiguate. A
		 * threshold would only have been dead distance at the start of every
		 * gesture — and with a mark about thirteen pixels wide, ten of them
		 * is most of the way to the next one, so it took away exactly the
		 * correction that makes a mark-sized target recoverable.
		 *
		 * What stops a resting hand from twitching the value is quantisation,
		 * not hysteresis: the run answers in whole marks, so a wobble inside
		 * one is not a different answer.
		 */
		let moved = false;
		/**
		 * Whether the press now ending was a long press that already did its
		 * job. Assigned below, where the naming is set up, and consulted here
		 * because a press held to read a name must not also change the value —
		 * the level ring swallows the click it grew out of for the same
		 * reason, and on a run the press has already moved the pending fill.
		 */
		let longPressed: (() => boolean) | null = null;
		/**
		 * The segment this gesture armed a clear on, 1-based, or null where it is
		 * an ordinary set.
		 *
		 * Clearing and setting are the same press on the same pixel, and
		 * without this the two answers to it depended on something the screen
		 * never showed. At a run of three, landing on the third segment previews
		 * two — and the first pointermove, two pixels later and still inside
		 * that segment, read the position afresh and previewed three. One
		 * position, two values, and the only thing separating them was whether
		 * the finger had twitched: a mode with no way to see which one you were
		 * in.
		 *
		 * So the clear belongs to the segment it was pressed on and survives any
		 * movement inside it, which is what makes the preview shown on the way
		 * down the thing that actually commits. Leaving the segment is a
		 * deliberate movement across a boundary the fill redraws at, and it
		 * disarms: from there the segment under the pointer means what it says.
		 * Coming back does not re-arm, because that would restore the same two
		 * readings of one position by a longer route.
		 */
		let clearing: number | null = null;

		run.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) return;
			event.preventDefault();
			pointer = event.pointerId;
			moved = false;
			// Captured on the way down rather than once some distance is
			// travelled: the gesture is live from the first frame, so the
			// pointer belongs to the run from the first frame too. It is also
			// what guarantees the release arrives here at all when the finger
			// has wandered off the control, which the rule about committing
			// nothing out there depends on.
			run.setPointerCapture(event.pointerId);
			// A slider takes focus from the press that operates it, so the
			// keyboard picks up where the finger left off.
			run.focus();
			/*
			 * A press reaches a mark, exactly as a drag does. What makes that
			 * a target rather than a coin toss is the segment's width: a segment
			 * holding several marks is drawn wide enough for each of them to
			 * be its own, which is the stylesheet's job and not this
			 * gesture's. Taking the marks off the press would also have made
			 * it aimable, and it would have cost the thing the press is for —
			 * marking two marks is what an Ironsworn track does all day, and
			 * routing it through a drag makes the common case the awkward one.
			 *
			 * The press is also the start of a drag, which is what makes a
			 * near miss recoverable: it answers on the way down and commits
			 * on the way up, so a finger that landed a mark out slides to the
			 * right one without ever letting go.
			 */
			const wanted = marksAtPoint(rects(), event.clientX, event.clientY, marks);
			// Pressing where the run already ends clears that segment, so one
			// control both fills and clears without a modifier — and the run
			// can never show the states nobody means, which is the argument a
			// level column already made against a row of checkboxes.
			//
			// Armed here and resolved on release, so what the fill previews on
			// the way down is what the release commits.
			clearing =
				wanted === value
					? marksAtPoint(rects(), event.clientX, event.clientY, 1)
					: null;
			pending = Math.max(
				0,
				Math.min(total, clearing !== null ? wanted - marks : wanted),
			);
			paint();
		});

		run.addEventListener('pointermove', (event) => {
			if (pointer !== event.pointerId) return;

			if (!onRun(event.clientY)) {
				// Off the run the committed value comes back and nothing is
				// pending. Coming back resumes the gesture; releasing out here
				// commits nothing at all. Leaving the run is leaving the segment,
				// so a clear armed on the way down does not survive it.
				clearing = null;
				if (pending !== null) {
					pending = null;
					overscroll(0);
					paint();
				}
				return;
			}

			if (!moved) {
				// From here the fill is glued to the finger rather than easing
				// after it. A press that never moves keeps the ease, because
				// there a jump is what happened.
				moved = true;
				run.classList.add('sheetsmith-track-dragging');
			}
			event.preventDefault();
			const measured = rects();
			// A clear holds for as long as the pointer is on the segment that
			// armed it, so a wobble cannot silently turn it back into a set.
			if (
				clearing !== null &&
				marksAtPoint(measured, event.clientX, event.clientY, 1) !== clearing
			) {
				clearing = null;
			}
			const wanted =
				clearing !== null
					? value - marks
					: marksAtPoint(measured, event.clientX, event.clientY, marks);
			pending = Math.max(0, Math.min(total, wanted));

			/*
			 * The give at the ends belongs to the ends of the *run*, which on
			 * a wrapped run is not the ends of a row.
			 *
			 * Measured against the run's segment, every row shared its right edge
			 * with the last one, so pushing past the end of row one — five
			 * segments of ten — resisted exactly as if the run were full. The
			 * rubber band was saying "there is nothing more here" at the
			 * halfway point, about a run with a whole second row below it.
			 *
			 * So the condition is the value, not the geometry: the run gives
			 * only where the pointer is pushing at a value that has nowhere
			 * left to go, past the first or last segment itself. Row one's right
			 * edge pins nothing, so it does not give.
			 */
			const firstBox = measured[0];
			const lastBox = measured[measured.length - 1];
			overscroll(
				pending >= total && lastBox !== undefined && event.clientX > lastBox.right
					? event.clientX - lastBox.right
					: pending <= 0 &&
						  firstBox !== undefined &&
						  event.clientX < firstBox.left
						? event.clientX - firstBox.left
						: 0,
			);
			paint();
		});

		const release = (event: PointerEvent): void => {
			if (pointer !== event.pointerId) return;
			pointer = null;
			moved = false;
			clearing = null;
			run.classList.remove('sheetsmith-track-dragging');
			overscroll(0);
			const landing = pending;
			pending = null;
			// A press held long enough to ask what the step is called was a
			// question, not an instruction: the bubble is already up and the
			// run goes back to where it was.
			if (longPressed?.() === true) {
				paint();
				return;
			}
			// Nothing pending is a release that happened off the run, and the
			// gesture ends where the finger does — there is no throw to carry
			// it anywhere else.
			if (landing !== null) setMarks(landing);
			paint();
			commit();
		};

		run.addEventListener('pointerup', release);
		run.addEventListener('pointercancel', release);

		/* --- Keyboard: one tab stop, and the fine grain below the unit --- */

		run.addEventListener('keydown', (event) => {
			let next: number | null = null;
			if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
				// Shift steps a mark where a segment holds several — the inverse
				// of a card's shift-by-ten, because a track's fine grain lies
				// below its unit rather than above it.
				next = value + (event.shiftKey ? 1 : marks);
			} else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
				next = value - (event.shiftKey ? 1 : marks);
			} else if (event.key === 'Home') {
				next = 0;
			} else if (event.key === 'End') {
				next = total;
			} else if (event.key === ' ' || event.key === 'Spacebar') {
				// The next segment, not the next mark: Space is the plain "one
				// more" and a partial segment finishes before the next begins.
				next = (Math.floor(value / marks) + 1) * marks;
			}
			if (next === null) return;
			event.preventDefault();
			setMarks(next);
			commitSoon();
		});

		/*
		 * A named step's name, on a pointer and on a phone alike. The line
		 * under the run carries it where the card has the room; this is the
		 * route that survives a run squeezed into one grid unit, and it is the
		 * only route at all to a segment's glyph, which is an abbreviation like
		 * any other.
		 */
		if (named) {
			longPressed = bindLongPress(run, () =>
				stepLabel(config, Math.floor(value / marks), count),
			);
		}

		paint();
	},
};
