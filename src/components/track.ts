/*
 * Track — one or more runs of segments filled in order.
 * Covers exhaustion, stress, XP, uses per day, death saves,
 * clocks, and spell slots.
 *
 * A Pool and a Track both hold a number under a ceiling, which is why the
 * build order called this a simpler Pool. What differs is what the number is
 * for. A pool is read as a proportion, so it draws a bar and prints its
 * numerals; a track is read as a count of things that each mean something —
 * the third exhaustion segment, the second death save — so its segments are
 * already both the proportion and the count and the card carries no numerals
 * at all. That also settles the ceiling's name: a quantity has a `max`, a run
 * has a `count`.
 *
 * The atom is the mark, not the segment. `marks` is how many presses fill one
 * segment and the stored value counts marks, so an Ironsworn progress track of
 * ten four-mark segments stores `value: 22` rather than a segment count and a
 * remainder that can disagree with each other. At the default of one the two
 * are the same number and the note reads exactly as every other track's does.
 *
 * A track may be a set of runs, and the set is Stat group's shape: `rows`
 * names them and one fenced block holds an entry per key. Spell slots are five
 * first-level, three second and one third — three runs differing in nothing
 * but their length and their name, which as three components would be three
 * headings, three labels and three reset bindings kept in step by hand.
 */

import { GESTURE_COMMIT } from '../interaction/commit-window';
import { levelGlyph, levelName, parseLevel } from './level-ring';
import { bindLongPress } from '../ui/popover';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	ReadResult,
	ResetResult,
	ScopeEntry,
	ScopeValues,
} from '../types';

/** SPEC §3.1: a single-value component stores its value under `value`. */
const VALUE_KEY = 'value';

/** One run in a set, named for the note and for the card. */
export interface TrackRow {
	/** Entry key in the fenced block. */
	key: string;
	/** Display name beside the run. Falls back to the key. */
	name?: string;
	/** This run's own length. Falls back to the component's `count`. */
	count?: string | number;
	/**
	 * Which end of this run is the bad end, where it differs from the rest of
	 * the card. Falls back to the component's `sense`.
	 *
	 * A set whose rows all mean the same thing sets it once above; death saves
	 * are the case that needs it per row, since three successes and three
	 * failures are the same shape pointed in opposite directions and a card
	 * that painted both alike would say the wrong thing about one of them.
	 */
	sense?: 'progress' | 'harm';
}

export interface TrackConfig extends ComponentConfig {
	type: 'track';
	/**
	 * How many segments a run holds, as a literal or an expression. Ignored
	 * where `levels` is set, since naming the steps settles how many there
	 * are; where `rows` is set it is the fallback for a row without its own.
	 */
	count?: string | number;
	/** How many presses fill one segment. Defaults to 1, and applies to every row. */
	marks?: number;
	/** One run per entry. Absent is a single unnamed run. */
	rows?: TrackRow[];
	/**
	 * Names for the steps from none upwards, in the syntax a `level` column
	 * uses and parsed by the same code — including a glyph after a colon.
	 */
	levels?: string[];
	/**
	 * Which end of the run is the bad end. The same line of segments fills
	 * toward an achievement in one system and a catastrophe in the next, and
	 * no property of the data distinguishes them.
	 */
	sense?: 'progress' | 'harm';
	/** Leave the heading off the sheet, as on a Stat. */
	hideLabel?: boolean;
}

export interface TrackData {
	/**
	 * Raw stored marks by fenced key, the single run living under `value`.
	 *
	 * On read this holds every entry a run maps to; on write only the entries
	 * present are touched, so an edit reported as a single-key delta can never
	 * clobber a sibling run with a stale snapshot — the rule Stat group's
	 * values already follow, and the reason a row set is safe under two
	 * commits racing one rebuild.
	 */
	values: Record<string, string>;
}

/**
 * The most segments a run may draw. A track is three to ten units wide in
 * every system that has one, and the bound is what stands between a mis-typed
 * formula — or a `count` reading a level that just went up by three orders of
 * magnitude — and a hang. It clamps rather than erroring, because a run too
 * long to draw is still a run, and the number in the note is untouched.
 */
export const MAX_SEGMENTS = 100;

/**
 * The furthest a run travels past either end of itself, in pixels, and how
 * hard the pointer has to work to get there. A hard stop reads as a frozen
 * control; a few pixels of give reads as a responsive one with nothing
 * further to offer. The value itself is held inside the run — unlike a Pool,
 * whose boundary is a rule of the game the plugin must not enforce, a track's
 * ends are the run's own extent and there is no segment beyond the last one.
 */
const OVERSCROLL_MAX = 10;
const OVERSCROLL_RESIST = 60;

/** How many presses fill one segment. Anything unusable is one. */
export function markSize(config: TrackConfig): number {
	const marks = Math.floor(config.marks ?? 1);
	return Number.isFinite(marks) && marks >= 1 ? marks : 1;
}

/** The runs this track draws, in order, with the config each one reads. */
export function runsOf(config: TrackConfig): TrackRow[] {
	const rows = config.rows;
	if (rows === undefined || rows.length === 0) {
		// The single run is a row set of one whose key is the storage key
		// every scalar component uses, so nothing downstream needs a second
		// shape for it.
		return [{ key: VALUE_KEY }];
	}
	return rows;
}

/** Whether this track is a named set rather than one anonymous run. */
export function isRowSet(config: TrackConfig): boolean {
	return config.rows !== undefined && config.rows.length > 0;
}

/**
 * Configuration that makes the card undrawable rather than merely empty.
 * Reported on this component alone, per SPEC §10.
 */
export function configError(config: TrackConfig): string | null {
	if (config.marks !== undefined) {
		const marks = config.marks;
		if (!Number.isInteger(marks) || marks < 1) {
			return 'Marks per segment has to be a whole number, 1 or more.';
		}
	}
	if (isRowSet(config) && config.levels !== undefined) {
		// Named steps are one run's meaning and rows are many runs'
		// identities; together they would ask for step names per row, which
		// is a third axis of configuration for a case nobody has had.
		return 'A track has either named levels or rows, not both. A layout wanting both is describing several ladders, which are several components.';
	}
	if (config.levels !== undefined) {
		if (config.levels.length < 2) {
			// The first name is what "none" is called, so a single name
			// describes a run with no step to reach.
			return 'A named track needs at least two level names, starting with the one for none.';
		}
		if (config.levels.some((entry) => parseLevel(entry).name === '')) {
			// A glyph stands for the level's name; it does not replace it. The
			// name is what a screen reader is given and what the step line
			// reads, and a glyph alone leaves both with nothing to say.
			return 'A level has a glyph but no name.';
		}
		return null;
	}
	if (isRowSet(config)) {
		const seen = new Set<string>();
		for (const row of config.rows ?? []) {
			const key = (row.key ?? '').trim();
			if (key === '') return 'Every row needs a key.';
			if (/[:\r\n]/.test(key)) {
				return `The row key "${key}" cannot contain a colon or a line break, because the sheet block separates key from value with a colon.`;
			}
			if (seen.has(key)) return `Two rows are both called "${key}".`;
			seen.add(key);
		}
		return null;
	}
	if (config.count === undefined) {
		return 'This track needs a number of segments, named levels, or rows.';
	}
	return null;
}

/**
 * How many segments a run holds, or null where its count is present and did
 * not resolve — the one case "?" is reserved for (SPEC §5).
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

/**
 * What a step is called: its name where the levels are named, its count
 * otherwise.
 */
export function stepLabel(
	config: TrackConfig,
	segments: number,
	of: number,
): string {
	if (config.levels !== undefined) {
		return levelName({ levels: config.levels }, segments);
	}
	return `${segments} of ${of}`;
}

/** A segment's rectangle, as the run measures it. */
export interface SegmentBox {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * The mark count a pointer is asking for, in one run's own geometry.
 *
 * Pure, and given rectangles rather than elements, because a run wider than
 * its cell wraps to a second line and the arithmetic that survives that is
 * not a division. A wrap resets x, which is how the lines are found: a segment
 * starting no further right than the one before it begins a new line.
 *
 * Where a segment holds several marks the pointer reaches each of them inside
 * the segment's own width, so a four-mark segment is four positions.
 */
export function marksAtPoint(
	boxes: readonly SegmentBox[],
	x: number,
	y: number,
	marks: number,
): number {
	if (boxes.length === 0) return 0;

	const lines: number[][] = [];
	boxes.forEach((box, index) => {
		const previous = boxes[index - 1];
		if (previous === undefined || box.left <= previous.left) lines.push([]);
		lines[lines.length - 1]?.push(index);
	});

	// The line the pointer is on, or the nearest one: a pointer that has left
	// the run vertically is still asking about the line it left through.
	let line = lines[lines.length - 1] as number[];
	for (const candidate of lines) {
		const bottom = Math.max(...candidate.map((i) => boxes[i]?.bottom ?? 0));
		if (y < bottom) {
			line = candidate;
			break;
		}
	}

	const first = line[0] as number;
	const last = line[line.length - 1] as number;
	// Left of the line is everything before it filled and nothing in it.
	if (x < (boxes[first] as SegmentBox).left) return first * marks;
	for (const index of line) {
		const box = boxes[index] as SegmentBox;
		if (x < box.left) return index * marks;
		if (x > box.right) continue;
		const width = box.right - box.left;
		const share = width > 0 ? (x - box.left) / width : 1;
		// Ceiling, so touching a segment at all fills its first mark: there is
		// no position inside a segment that means "this segment, empty".
		const inside = Math.min(marks, Math.max(1, Math.ceil(share * marks)));
		return index * marks + inside;
	}
	return (last + 1) * marks;
}

/**
 * How full one segment is, from a mark total. Shared by the committed fill
 * and the pending one, which is what keeps a preview from disagreeing with
 * the outcome it is previewing — the rule the Pool's `landing` already keeps.
 */
function segmentFill(total: number, index: number, marks: number): number {
	return Math.max(0, Math.min(1, (total - index * marks) / marks));
}

/** The stored marks for one key, as a number. Unreadable counts as none. */
function storedMarks(data: TrackData | null, key: string): number {
	const raw = data?.values[key]?.trim() ?? '';
	if (raw === '') return 0;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * One run's length, resolved. A row's own `count` is a formula field at its
 * own path, so the resolver is asked for that path rather than the shared one.
 */
function countFor(
	config: TrackConfig,
	row: TrackRow,
	index: number,
	resolve: FieldResolver,
	shared: string | number | boolean | null | undefined,
): number | null {
	if (!isRowSet(config)) return segmentCount(config, shared);
	if (row.count !== undefined) {
		return segmentCount(config, resolve(`rows.${index}.count`, {}));
	}
	// A row without its own falls back to the component's, which is the point
	// of the component still carrying one.
	return config.count === undefined ? null : segmentCount(config, shared);
}

export const track: ComponentDefinition<TrackConfig, TrackData> = {
	type: 'track',
	storage: 'fenced',
	// `reset.*.to` rather than `reset.to`: the bindings are a list, so each
	// one's expression lives at its own index and the sheet rewrites the
	// logical name to that index before the component asks for it.
	// `rows.*.count` is the same idea for a set — a caster whose slots come
	// from a level table writes each row's length as an expression.
	formulaFields: ['count', 'rows.*.count', 'reset.*.to'],
	configFields: [
		{
			key: 'count',
			kind: 'formula',
			label: 'Segments',
			description:
				'How many segments a run holds, as a number or a formula, e.g. 10, or 2 + if(abilities.PHY >= 3, 2, 1). Ignored where the levels below are named. Where there are rows it is the fallback for a row that sets no length of its own.',
		},
		{
			key: 'marks',
			kind: 'number',
			label: 'Marks per segment',
			description:
				'How many presses fill one segment. Defaults to 1, and applies to every row. An Ironsworn progress track is ten segments of four marks. The note stores marks either way, so a segment count and a remainder can never disagree.',
		},
		{
			key: 'sense',
			kind: 'select',
			label: 'Sense',
			description:
				'Which end of a run is the bad end. XP and a countdown clock are the same widget pointed in opposite directions, and nothing in the data says which this is. Harm grades the run toward the boundary colour; it never stops a press, since whether a track may be pushed past its last segment is a rule of the game. Where there are rows this is what a row falls back to, as the segment count above is.',
			options: ['progress', 'harm'],
		},
		{
			key: 'rows',
			kind: 'track-rows',
			label: 'Rows',
			description:
				'One run per entry, sharing a heading, a reset binding and a write. Spell slots are five first-level, three second and one third. Each key names the entry in the character note; a row with no length of its own falls back to the segment count above. Rows and named levels do not combine.',
		},
		{
			key: 'levels',
			kind: 'text-list',
			label: 'Level names',
			description:
				'Names the steps from none upwards, comma separated, e.g. Rested, Exhaustion 1, Exhaustion 2. A name may carry one glyph after a colon, as in "Exhaustion 6:☠". Naming the levels settles how many segments there are, so this wins over the count above.',
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

	read(body, config): ReadResult<TrackData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty card, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const values: Record<string, string> = {};
		for (const row of runsOf(config)) {
			const raw = parsed.values.get(row.key);
			if (raw === undefined) continue;
			const text = raw.trim();
			// A number the run cannot represent is still a number and is left
			// exactly as it is (§7). Something that is not one at all is a
			// malformed section, reported on this component alone.
			if (text !== '' && !Number.isFinite(Number(text))) {
				return { ok: false, error: `"${text}" is not a number of marks.` };
			}
			values[row.key] = raw;
		}
		// An entry no row maps to is not read, and `write` touches only the
		// entries it is given — so it stays in the note untouched, which is
		// what makes a slot table safe to re-cut (§7).
		return { ok: true, data: { values } };
	},

	scopeValues(data, config): ScopeValues {
		const marks = markSize(config);
		const filled = (key: string): number | undefined => {
			const raw = data?.values[key]?.trim() ?? '';
			if (raw === '') return undefined;
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? Math.floor(parsed / marks) : undefined;
		};

		/*
		 * The stored marks, and the segments they fill, on one entry. A name is
		 * worth the boxes a reader can see — `exhaustion - 1` is written about
		 * those, not about a mark total whose size depends on a config field no
		 * formula can see — and §5 still wants the raw number reachable, which
		 * `<name>.value` is. Where a segment holds one mark the two are the
		 * same number and this says nothing new.
		 *
		 * `compute` rather than `display` because dividing the marks by the
		 * marks a segment holds is not one of this component's formula fields
		 * and could not be made into one: how many marks a segment holds is
		 * layout configuration, not a name any formula on the sheet can see.
		 */
		const run = (key: string): ScopeEntry => ({
			value: data?.values[key],
			compute: () => filled(key),
		});

		if (isRowSet(config)) {
			// A component holding several values answers to `<id>.<name>`, as
			// `abilities.DEX` does, and not under its bare id: there is no one
			// number a set of runs could mean.
			const named: Record<string, ScopeEntry> = {};
			for (const row of config.rows ?? []) {
				named[row.key] = run(row.key);
			}
			return { named };
		}

		const named: Record<string, ScopeEntry> = {};
		if (config.levels !== undefined) {
			named.count = { value: config.levels.length - 1 };
		} else if (config.count !== undefined) {
			// A formula like a Pool's max, evaluated lazily because it may
			// reference another component.
			named.count = { display: { field: 'count', scope: {} } };
		}
		return { self: run(VALUE_KEY), named };
	},

	write(data, body): string {
		const updates = new Map<string, string>();
		for (const [key, value] of Object.entries(data.values)) {
			updates.set(key, value);
		}
		return writeFenced(body, updates);
	},

	applyReset(data, config, reset, context): ResetResult<TrackData> {
		const marks = markSize(config);
		const rows = runsOf(config);
		const values: Record<string, string> = {};

		if (reset.action === 'empty') {
			// Nothing to resolve: empty is zero whatever a run's length is, so
			// a track whose count is broken can still be cleared.
			for (const row of rows) values[row.key] = '0';
			return { ok: true, data: { values } };
		}

		if (reset.action === 'full') {
			/*
			 * Every row, in one write. This is the concrete argument for rows
			 * over three components: a long rest that has to find three Tracks
			 * is three bindings kept in step by hand and three writes the undo
			 * has to be pressed three times to reverse.
			 */
			for (const [index, row] of rows.entries()) {
				const count = countFor(
					config,
					row,
					index,
					(field, scope) => context.resolve(field, scope),
					context.resolve('count', {}),
				);
				if (count === null) {
					const where = isRowSet(config) ? ` for "${row.name ?? row.key}"` : '';
					return {
						ok: false,
						error:
							context.explain(
								row.count !== undefined ? `rows.${index}.count` : 'count',
								{},
							) ?? `it has no segments to fill${where}.`,
					};
				}
				values[row.key] = String(count * marks);
			}
			return { ok: true, data: { values } };
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
			// The expression is written in segments, because that is what the
			// run publishes and what an author counts. Down to the nearest
			// mark, so half a segment of an Ironsworn track lands on a mark
			// boundary rather than storing a fraction the note cannot mean.
			const next = String(Math.floor(segments * marks));
			for (const row of rows) values[row.key] = next;
			return { ok: true, data: { values } };
		}

		// A binding carrying only a buffer instruction, which a track has none
		// of. Nothing to do, and nothing failed.
		return { ok: true, data: { values } };
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
		const rows = runsOf(config);
		const rowSet = isRowSet(config);
		const named = config.levels !== undefined;
		const cardHarm = config.sense === 'harm';
		const reduced =
			view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

		const list = doc.createElement('div');
		list.classList.add('sheetsmith-track-rows');
		if (rowSet) {
			list.classList.add('sheetsmith-track-set');
			// The set is one control made of several, and a reader arriving on
			// it should be told what the several are of before being handed
			// the first one.
			list.setAttribute('role', 'group');
			list.setAttribute('aria-label', config.label);
		}
		card.appendChild(list);

		/** One run on the card: its own value, its own geometry, its own gesture. */
		interface Run {
			key: string;
			el: HTMLElement;
			segments: HTMLElement[];
			total: number;
			/** Marks currently shown, which is not yet what the note holds. */
			value: number;
			/** What the note holds, as text. Faint fill is the gap to it. */
			sent: string;
			/** Where a gesture in flight would land, or null when none is. */
			pending: number | null;
			paint: () => void;
			setMarks: (next: number) => void;
		}

		const runs: Run[] = [];
		let commitTimer: number | undefined;

		/**
		 * Write every run that moved, in one change to the note.
		 *
		 * One write for the card rather than one per run: a rest that empties
		 * three slot levels is one edit and one undo, which is the whole
		 * argument for a row set over three components.
		 */
		const commit = (): void => {
			if (commitTimer !== undefined) {
				view?.clearTimeout(commitTimer);
				commitTimer = undefined;
			}
			// A rebuild replaces the card, and a commit arriving after that
			// would be writing out of a detached control.
			if (!card.isConnected) return;
			const values: Record<string, string> = {};
			for (const run of runs) {
				const next = String(run.value);
				if (next === run.sent) continue;
				values[run.key] = next;
				run.sent = next;
			}
			if (Object.keys(values).length === 0) return;
			// The write is what the solid fill means, so every run settles
			// here rather than waiting for the rebuild the change will cause.
			for (const run of runs) run.paint();
			context.onChange({ values });
		};

		/** Write at the end of the run of presses, unless something ends it sooner. */
		const commitSoon = (): void => {
			if (commitTimer !== undefined) view?.clearTimeout(commitTimer);
			commitTimer = view?.setTimeout(() => {
				commitTimer = undefined;
				commit();
			}, GESTURE_COMMIT);
		};

		/**
		 * Move the keyboard to one run, and make it the card's only tab stop.
		 *
		 * A roving index rather than a stop per run: nine slot levels must not
		 * be nine stops on the way past the card, and the axis the rows are
		 * laid out on is the one that should move between them.
		 */
		const focusRun = (index: number): void => {
			const next = Math.max(0, Math.min(runs.length - 1, index));
			runs.forEach((run, i) => {
				run.el.tabIndex = i === next ? 0 : -1;
			});
			runs[next]?.el.focus();
		};

		rows.forEach((row, index) => {
			// A row's own sense wins over the card's, on the pattern `count`
			// already set: the component states what the set means and a row
			// says where it differs.
			const harm = row.sense === undefined ? cardHarm : row.sense === 'harm';
			const line = doc.createElement('div');
			line.classList.add('sheetsmith-track-row');
			list.appendChild(line);

			if (rowSet) {
				// Immediately left of its run, in the clothes the step name
				// wears. Proximity is what says a name belongs to the run
				// beside it rather than the one above it, and the column is
				// what lets the runs be read down as a shape.
				const name = doc.createElement('span');
				name.classList.add('sheetsmith-track-row-name');
				name.textContent = row.name ?? row.key;
				line.appendChild(name);
			}

			const count = countFor(
				config,
				row,
				index,
				context.resolveField,
				context.resolved['count'],
			);

			if (count === null) {
				/*
				 * Present and unresolved, which is exactly what "?" is for. On
				 * that row alone: one failure must not take the card down, which
				 * is SPEC §5's rule applied inside a component rather than
				 * across the sheet.
				 *
				 * No delay here, unlike a card's derived display: that one waits
				 * out UNRESOLVED_DELAY because it repaints from a draft being
				 * typed and a half-typed value is not wrong yet. A count is
				 * layout config resolved once per render, so there is no
				 * in-between state to wait through and the delay would only make
				 * the answer late.
				 */
				const unresolved = doc.createElement('div');
				unresolved.classList.add('sheetsmith-track-unresolved');
				unresolved.textContent = '?';
				unresolved.setAttribute(
					'title',
					context.explainField?.(
						row.count !== undefined ? `rows.${index}.count` : 'count',
						{},
					) ?? 'The number of segments did not resolve.',
				);
				line.appendChild(unresolved);
				return;
			}

			const total = count * marks;
			const el = doc.createElement('div');
			el.classList.add('sheetsmith-track-run');
			if (harm) el.classList.add('sheetsmith-track-harm');
			if (marks > 1) {
				// A segment holding several marks is several targets, so it is
				// drawn wider and its divisions are drawn in. Both are the same
				// point: a position you cannot see is a position you cannot aim
				// at, and the drag that reaches these is worth having only if
				// the reader can tell one quarter of a segment from another.
				el.classList.add('sheetsmith-track-marked');
				el.style.setProperty('--sheetsmith-track-marks', String(marks));
			}
			el.setAttribute('role', 'slider');
			el.setAttribute('aria-valuemin', '0');
			el.setAttribute('aria-valuemax', String(total));
			// One tab stop for the card, whatever it is a run of: nine slot
			// levels must not be nine stops on the way past it. The rest are
			// reachable, by the axis they are laid out on.
			el.tabIndex = runs.length === 0 ? 0 : -1;
			line.appendChild(el);

			const segments: HTMLElement[] = [];
			for (let at = 0; at < count; at++) {
				const segment = doc.createElement('span');
				segment.classList.add('sheetsmith-track-segment');
				// How far along the run this segment is. A harm run mixes its
				// fill from it, so the escalation is read as a shape before a
				// single name is; a progress run takes the accent whole. The
				// share comes in from here because the stylesheet cannot know
				// how long this run is — the same reason a level ring is
				// handed its own.
				if (harm) {
					segment.style.setProperty(
						'--sheetsmith-track-grade',
						String((at + 1) / count),
					);
				}

				const solid = doc.createElement('span');
				solid.classList.add('sheetsmith-track-segment-fill');
				segment.appendChild(solid);
				const ghost = doc.createElement('span');
				ghost.classList.add('sheetsmith-track-segment-ghost');
				segment.appendChild(ghost);

				/*
				 * A divider per boundary *between* marks, so a segment holding
				 * n of them gets n - 1. The segment's own border is already the
				 * outer two, and drawing those again is what a repeating
				 * gradient does: it puts a line at the end of every mark,
				 * including the last, which lands on the inner edge of the
				 * right border and doubles it.
				 *
				 * Elements rather than a background, and the count is the
				 * reason. The gradient's own edge behaviour is not something a
				 * test can look at, so "one line too many" was invisible to
				 * everything except the eye; three spans at three offsets is a
				 * number a test can assert.
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

				// Last, and positioned, so it paints over the fills rather
				// than under them. As the segment's own inline text it did
				// not: a positioned descendant paints after its parent's
				// inline content, so the one segment a layout bothered to
				// letter lost its letter at exactly the moment it filled.
				if (named) {
					const glyph = parseLevel(config.levels?.[at + 1] ?? '').glyph;
					if (glyph !== null && glyph !== '') {
						const letter = doc.createElement('span');
						letter.classList.add('sheetsmith-track-segment-glyph');
						letter.textContent = levelGlyph({ levels: config.levels }, at + 1);
						segment.appendChild(letter);
					}
				}

				el.appendChild(segment);
				segments.push(segment);
			}

			const step = named ? doc.createElement('div') : null;
			if (step !== null) {
				step.classList.add('sheetsmith-track-step');
				line.appendChild(step);
			}

			const run: Run = {
				key: row.key,
				el,
				segments,
				total,
				value: storedMarks(data, row.key),
				sent: data?.values[row.key] ?? '',
				pending: null,
				paint: () => undefined,
				setMarks: () => undefined,
			};

			/** The mark count the note holds for this run. */
			const written = (): number => {
				const raw = run.sent.trim();
				if (raw === '') return 0;
				const parsed = Number(raw);
				return Number.isFinite(parsed) ? parsed : 0;
			};

			run.paint = (): void => {
				const landing = run.pending ?? run.value;
				/*
				 * Solid is what the note holds; faint is everything the run is
				 * showing that the note does not hold yet. One rule, and the
				 * faint region always means exactly "this much is not saved".
				 *
				 * It used to be measured from the run's live value instead,
				 * which made it a preview of the gesture under the finger and
				 * nothing else. Every path that moves the value without a
				 * pointer then had no representation at all: an arrow key drew
				 * a solid segment and the note caught up to it as much as seven
				 * hundred milliseconds later, so the screen said "written" for
				 * the whole of the window where it was not.
				 */
				const held = written();
				const solidMarks = Math.min(held, landing);
				const ghostMarks = Math.max(held, landing);
				run.segments.forEach((segment, at) => {
					const solid = segmentFill(solidMarks, at, marks);
					const ghost = segmentFill(ghostMarks, at, marks);
					segment.style.setProperty('--sheetsmith-track-fill', String(solid));
					segment.style.setProperty(
						'--sheetsmith-track-ghost',
						String(held === landing ? 0 : ghost),
					);
					segment.classList.toggle('sheetsmith-track-segment-on', solid > 0);
				});
				// Held inside the run for what the control reports, however the
				// note happens to be spelled: a hand-edited 9 on a six-segment
				// run fills every segment and stays 9 in the note (§7).
				const shown = Math.max(0, Math.min(run.total, landing));
				const filled = Math.floor(shown / marks);
				const reading = stepLabel(config, filled, count);
				el.setAttribute('aria-valuenow', String(shown));
				el.setAttribute('aria-valuetext', reading);
				el.setAttribute(
					'aria-label',
					rowSet
						? `${row.name ?? row.key}, ${reading}`
						: `${config.label}, ${reading}`,
				);
				if (step !== null) step.textContent = reading;
				// Only a named run earns one. An unnamed step's name is the
				// count, which the segments already state — and a tooltip
				// repeating what is legible is noise fired at every pass, as
				// the stat card's label and the level ring both learned.
				if (named) el.title = reading;
			};

			/** Move the run without writing. Feedback is continuous (SPEC §4.2). */
			run.setMarks = (next: number): void => {
				const held = Math.max(0, Math.min(run.total, Math.round(next)));
				if (held === run.value) return;
				run.value = held;
				run.paint();
			};

			runs.push(run);

			/* --- Pointer: a press answers on the way down --- */

			/** How far the run gives past either end, and springing back. */
			const overscroll = (beyond: number): void => {
				if (reduced || beyond === 0) {
					el.style.removeProperty('transform');
					return;
				}
				// Saturating, so the give increases in resistance and stops at
				// a few pixels rather than following the finger off the card.
				const px =
					Math.sign(beyond) *
					OVERSCROLL_MAX *
					(1 - 1 / (1 + Math.abs(beyond) / OVERSCROLL_RESIST));
				el.style.setProperty('transform', `translateX(${px}px)`);
			};

			const boxes = (): SegmentBox[] =>
				segments.map((segment) => {
					const box = segment.getBoundingClientRect();
					return {
						left: box.left,
						right: box.right,
						top: box.top,
						bottom: box.bottom,
					};
				});

			/**
			 * Whether a point is still on this run, which is a question about
			 * y alone.
			 *
			 * Going past either end horizontally is not leaving: it is the case
			 * the end resistance exists for, where the value holds at empty or
			 * full and the run gives a few pixels. If x counted here the two
			 * rules would be unreachable together — every drag that reached a
			 * boundary would be reported as having left the control, and the
			 * resistance would never fire.
			 *
			 * With rows on the card this is also what keeps a gesture on the
			 * first-level slots from drifting twenty pixels down and silently
			 * setting the second-level ones: the band is this run's own.
			 */
			const onRun = (y: number): boolean => {
				const box = el.getBoundingClientRect();
				return y >= box.top && y <= box.bottom;
			};

			let pointer: number | null = null;
			/**
			 * Whether the pointer has moved at all since it went down. It
			 * decides one thing only — whether the fill tracks the finger or
			 * eases into place — and deliberately not whether the movement
			 * counts.
			 *
			 * There is no drag threshold on this control, and the absence is
			 * the decision. A Pool needs one because its number is a text field
			 * where a press places a caret and a drag scrubs, so the two
			 * gestures genuinely compete and one has to win. Here the press
			 * already fills on the way down: a press is a drag of no length,
			 * the same code path reading the same position, and there is
			 * nothing to disambiguate. A threshold would only have been dead
			 * distance at the start of every gesture — and with a mark about
			 * thirteen pixels wide, ten of them is most of the way to the next
			 * one, so it took away exactly the correction that makes a
			 * mark-sized target recoverable.
			 *
			 * What stops a resting hand from twitching the value is
			 * quantisation, not hysteresis: the run answers in whole marks, so
			 * a wobble inside one is not a different answer.
			 */
			let moved = false;
			/**
			 * The mark this gesture armed a clear on, or null where it is an
			 * ordinary set.
			 *
			 * Clearing and setting are the same press on the same pixel, and
			 * without this the two answers to it depended on something the
			 * screen never showed: landing on the mark the value stands on
			 * previews one less, and the first pointermove two pixels later
			 * read the position afresh and previewed the same mark again. One
			 * position, two values, separated only by whether the finger had
			 * twitched.
			 *
			 * The mark rather than the segment, because at several marks to a
			 * segment those are different lines and only the finer one is the
			 * target: a run at twenty-two of a forty-mark track has its
			 * boundary two marks into the sixth segment, and that segment is
			 * both the one a press should clear from and the one whose third
			 * mark a press should set. The disarming boundary follows the
			 * target down, and the line it survives inside is a division the
			 * card actually draws.
			 */
			let clearing: number | null = null;
			/**
			 * Whether the press now ending was a long press that already did
			 * its job. Assigned below, where the naming is set up.
			 */
			let longPressed: (() => boolean) | null = null;

			el.addEventListener('pointerdown', (event) => {
				if (event.button !== 0) return;
				event.preventDefault();
				pointer = event.pointerId;
				moved = false;
				// Captured on the way down rather than once some distance is
				// travelled: the gesture is live from the first frame, so the
				// pointer belongs to this run from the first frame too. With
				// rows that is also what claims it — a drag that drifts onto a
				// neighbouring run keeps reporting here, and the neighbour is
				// never touched by a gesture it did not start.
				el.setPointerCapture(event.pointerId);
				// A slider takes focus from the press that operates it, so the
				// keyboard picks up where the finger left off.
				focusRun(runs.indexOf(run));

				const wanted = marksAtPoint(boxes(), event.clientX, event.clientY, marks);
				// Pressing the mark the value stands on clears it, so one
				// control both fills and clears without a modifier — and the
				// run can never show the states nobody means, which is the
				// argument a level column already made against a row of
				// checkboxes. Armed here and resolved on release, so what the
				// fill previews on the way down is what the release commits.
				clearing = wanted === run.value ? wanted : null;
				run.pending = Math.max(
					0,
					Math.min(run.total, clearing !== null ? wanted - 1 : wanted),
				);
				run.paint();
			});

			el.addEventListener('pointermove', (event) => {
				if (pointer !== event.pointerId) return;

				if (!onRun(event.clientY)) {
					// Off the run the committed value comes back and nothing is
					// pending. Coming back resumes the gesture; releasing out
					// here commits nothing at all. Leaving the run is leaving
					// its mark, so a clear armed on the way down does not
					// survive it.
					clearing = null;
					if (run.pending !== null) {
						run.pending = null;
						overscroll(0);
						run.paint();
					}
					return;
				}

				if (!moved) {
					// From here the fill is glued to the finger rather than
					// easing after it. A press that never moves keeps the ease,
					// because there a jump is what happened.
					moved = true;
					el.classList.add('sheetsmith-track-dragging');
				}
				event.preventDefault();
				const measured = boxes();
				const at = marksAtPoint(measured, event.clientX, event.clientY, marks);
				// A clear holds for as long as the pointer is on the mark that
				// armed it, so a wobble cannot silently turn it back into a set.
				if (clearing !== null && at !== clearing) clearing = null;
				const wanted = clearing !== null ? clearing - 1 : at;
				run.pending = Math.max(0, Math.min(run.total, wanted));

				/*
				 * The give at the ends belongs to the ends of the *run*, which
				 * on a wrapped run is not the ends of a line.
				 *
				 * Measured against the run's box, every line shared its right
				 * edge with the last one, so pushing past the end of line one —
				 * five segments of ten — resisted exactly as if the run were
				 * full. The rubber band was saying "there is nothing more here"
				 * at the halfway point, about a run with a whole second line
				 * below it.
				 *
				 * So the condition is the value, not the geometry: the run
				 * gives only where the pointer is pushing at a value that has
				 * nowhere left to go, past the first or last segment itself.
				 */
				const firstBox = measured[0];
				const lastBox = measured[measured.length - 1];
				overscroll(
					run.pending >= run.total &&
						lastBox !== undefined &&
						event.clientX > lastBox.right
						? event.clientX - lastBox.right
						: run.pending <= 0 &&
							  firstBox !== undefined &&
							  event.clientX < firstBox.left
							? event.clientX - firstBox.left
							: 0,
				);
				run.paint();
			});

			const release = (event: PointerEvent): void => {
				if (pointer !== event.pointerId) return;
				pointer = null;
				moved = false;
				clearing = null;
				el.classList.remove('sheetsmith-track-dragging');
				overscroll(0);
				const landing = run.pending;
				run.pending = null;
				// A press held long enough to ask what the step is called was a
				// question, not an instruction: the bubble is already up and
				// the run goes back to where it was.
				if (longPressed?.() === true) {
					run.paint();
					return;
				}
				// Nothing pending is a release that happened off the run, and
				// the gesture ends where the finger does — there is no throw to
				// carry it anywhere else.
				if (landing !== null) run.setMarks(landing);
				run.paint();
				commit();
			};

			el.addEventListener('pointerup', release);
			el.addEventListener('pointercancel', release);
			el.addEventListener('blur', commit);

			/* --- Keyboard --- */

			el.addEventListener('keydown', (event) => {
				// Up and down move between rows rather than stepping, which is
				// why they are not a second way to change the value: the axis
				// the rows are laid out on is the one that should move between
				// them, and nine slot levels must not be nine tab stops.
				if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
					if (runs.length < 2) return;
					event.preventDefault();
					focusRun(runs.indexOf(run) + (event.key === 'ArrowDown' ? 1 : -1));
					return;
				}
				let next: number | null = null;
				if (event.key === 'ArrowRight') {
					// Shift steps a mark where a segment holds several — the
					// inverse of a card's shift-by-ten, because a track's fine
					// grain lies below its unit rather than above it.
					next = run.value + (event.shiftKey ? 1 : marks);
				} else if (event.key === 'ArrowLeft') {
					next = run.value - (event.shiftKey ? 1 : marks);
				} else if (event.key === 'Home') {
					next = 0;
				} else if (event.key === 'End') {
					next = run.total;
				} else if (event.key === ' ' || event.key === 'Spacebar') {
					// The next segment, not the next mark: Space is the plain
					// "one more" and a partial segment finishes before the next
					// begins.
					next = (Math.floor(run.value / marks) + 1) * marks;
				}
				if (next === null) return;
				event.preventDefault();
				run.setMarks(next);
				commitSoon();
			});

			/*
			 * A named step's name, on a pointer and on a phone alike. The line
			 * under the run carries it where the card has the room; this is the
			 * route that survives a run squeezed into one grid unit, and it is
			 * the only route at all to a segment's glyph, which is an
			 * abbreviation like any other.
			 */
			if (named) {
				longPressed = bindLongPress(el, () =>
					stepLabel(config, Math.floor(run.value / marks), count),
				);
			}

			run.paint();
		});
	},
};
