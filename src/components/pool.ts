/*
 * Pool — a current-and-max resource with adjust controls (SPEC §4.2). Covers
 * HP, spell slots, rage, ki, sanity: the numbers that move constantly during
 * play and are the whole reason a sheet is open at a table.
 *
 * The max is layout config, not character data. It is a formula field, so a
 * stored copy in the note would be the stale-derived-value problem Skill
 * card's storage rules already refuse. A system whose max is rolled per
 * character rather than computed points the formula at a component the
 * character owns — `max_hp` — which is what §5 makes ids for.
 *
 * A reset acts on `current` and leaves `temp` where it is. Temporary points
 * are a separate quantity with their own lifetime, and which rest clears them
 * is a rule of the game rather than of a pool — the plugin knowing that would
 * be the plugin knowing 5e.
 */

import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ResetResult,
	ScopeEntry,
	ScopeValues,
} from '../types';
import { bindEditable, EditableHandle } from './editable';
import { formatDerived } from './stat-card';

/** Entry keys in the fenced block. Fixed, so hand-editing reads the same. */
const CURRENT_KEY = 'current';
const TEMP_KEY = 'temp';

export interface PoolConfig extends ComponentConfig {
	type: 'pool';
	/** The pool's ceiling, as a literal or an expression. */
	max?: string | number;
	/** Show a second field for temporary points above the max. */
	hasTemp?: boolean;
}

export interface PoolData {
	/**
	 * Absent means "not part of this change": an edit is reported as a delta
	 * of the one field touched, so a commit racing a rebuild can never write
	 * back a stale sibling.
	 */
	current?: string;
	temp?: string;
}

/** How far one press of a step button moves the pool. */
const STEP = 1;
const STEP_SHIFT = 10;

/** Before a held step button starts repeating, and the floor it accelerates to. */
const HOLD_DELAY = 400;
const HOLD_FLOOR = 40;
/** Each repeat lands sooner than the last, so a long press covers real ground. */
const HOLD_RAMP = 0.8;

/** How far the pointer travels per unit while scrubbing the value. */
const SCRUB_PX_PER_UNIT = 6;
/** Movement before a press on the number becomes a scrub rather than a caret. */
const SCRUB_THRESHOLD = 10;
/** Velocity samples older than this say nothing about where the finger is going. */
const VELOCITY_WINDOW = 100;

/**
 * Where a flick would come to rest: the exponential-decay form scroll
 * deceleration uses, not the textbook v²/2a.
 *
 * Deliberately not the 0.998 that suits scrolling. That constant is
 * calibrated in pixels of content, where a 1000px/s flick throwing 499px is
 * exactly right; divided by six pixels per hit point it throws a 54-point
 * pool by 83, and a gentle release with a little residual motion moves it by
 * 25. A pool is a small range read precisely, not a long list skimmed, so it
 * decelerates roughly five times harder.
 */
function project(velocity: number, deceleration = 0.99): number {
	return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/** A throw may not move a pool by more than this share of its ceiling. */
const MAX_THROW_SHARE = 0.25;

/**
 * A step button that repeats while held.
 *
 * The most-pressed control on a sheet, and a table deals damage in sevens
 * rather than ones — seven discrete presses for one hit is the largest single
 * miss in the component. It answers on pointer-down rather than on click,
 * because feedback that waits for release reads as lag.
 *
 * Every repeat moves the draft only; the note is written once on release.
 * That is SPEC §4.2's rule — feedback continuous, persistence discrete — and
 * it is also what stops a two-second hold writing the note twenty times and
 * rebuilding the sheet under the finger.
 */
function stepButton(
	doc: Document,
	field: HTMLInputElement,
	name: string,
	direction: 1 | -1,
	stepDraft: (delta: number) => void,
	commitDraft: () => void,
	small = false,
): HTMLButtonElement {
	const button = doc.createElement('button');
	button.type = 'button';
	button.classList.add('sheetsmith-pool-step');
	if (small) button.classList.add('sheetsmith-pool-step-small');
	button.textContent = direction === 1 ? '+' : '−';
	const verb = direction === 1 ? 'Increase' : 'Decrease';
	button.setAttribute('aria-label', `${verb} ${name}`);
	// Shift for ten was implemented and announced nowhere, which makes it an
	// affordance nobody can find. The tooltip is the cheapest place to say so.
	button.title = `${verb} ${name}. Hold to repeat, Shift for ten.`;

	const view = doc.defaultView;
	let timer: number | undefined;
	let delay = HOLD_DELAY;

	const stop = (): void => {
		if (timer !== undefined) view?.clearTimeout(timer);
		timer = undefined;
		delay = HOLD_DELAY;
	};

	const begin = (event: PointerEvent): void => {
		// A second pointer arriving before the first lifts would overwrite the
		// timer and leave the old one repeating forever. Stylus plus finger is
		// enough to do it.
		stop();
		// Keep focus where it is: letting the press blur the field would commit
		// the draft, and the step would land on top of a write already gone.
		event.preventDefault();
		button.setPointerCapture(event.pointerId);
		const size = event.shiftKey ? STEP_SHIFT : STEP;
		stepDraft(direction * size);
		const tick = (): void => {
			stepDraft(direction * size);
			delay = Math.max(HOLD_FLOOR, delay * HOLD_RAMP);
			timer = view?.setTimeout(tick, delay);
		};
		timer = view?.setTimeout(tick, HOLD_DELAY);
	};

	const end = (): void => {
		// A pointerup with no press behind it — capture lost, or a release that
		// began outside — has nothing to commit.
		if (timer === undefined) return;
		stop();
		commitDraft();
	};

	button.addEventListener('pointerdown', begin);
	button.addEventListener('pointerup', end);
	button.addEventListener('pointercancel', () => {
		stop();
		commitDraft();
	});
	// A keyboard activation produces a click with no preceding pointerdown;
	// detail is 0 there and non-zero for a pointer, which is what tells the
	// two apart without double-stepping a mouse press.
	button.addEventListener('click', (event) => {
		if (event.detail !== 0) return;
		stepDraft(direction * (event.shiftKey ? STEP_SHIFT : STEP));
		commitDraft();
	});

	return button;
}

/**
 * Drag the number sideways to change it.
 *
 * A pool is the draggable value on a character sheet, and buttons alone make
 * every large change a counting exercise. The gesture tracks the pointer 1:1
 * from where it was grabbed, and on release the flick's velocity is projected
 * forward so a fast drag throws the value further than the finger travelled.
 *
 * A press below the threshold is left alone, so tapping the number still puts
 * a caret in it and typing an exact value is unaffected.
 */
function bindScrub(
	card: HTMLElement,
	input: HTMLInputElement,
	stepDraft: (delta: number) => void,
	commitDraft: () => void,
	ceiling: number | null,
): void {
	let pointer: number | null = null;
	let startX = 0;
	let applied = 0;
	let scrubbing = false;
	let history: { x: number; t: number }[] = [];

	input.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		pointer = event.pointerId;
		startX = event.clientX;
		applied = 0;
		scrubbing = false;
		history = [{ x: event.clientX, t: event.timeStamp }];
	});

	input.addEventListener('pointermove', (event) => {
		if (pointer !== event.pointerId) return;
		const dx = event.clientX - startX;
		if (!scrubbing) {
			// Hysteresis: a press is a caret until it has clearly become a drag.
			if (Math.abs(dx) < SCRUB_THRESHOLD) return;
			scrubbing = true;
			input.setPointerCapture(event.pointerId);
			card.classList.add('sheetsmith-pool-scrubbing');
			// A native selection drag has already started inside the field by
			// now; user-select alone does not unpaint it.
			card.ownerDocument.getSelection?.()?.removeAllRanges();
		}
		event.preventDefault();
		history.push({ x: event.clientX, t: event.timeStamp });
		if (history.length > 8) history.shift();
		// Recomputed from the grab point every frame rather than accumulated,
		// so the value stays glued to the finger instead of drifting.
		const wanted = Math.round(dx / SCRUB_PX_PER_UNIT);
		if (wanted !== applied) {
			stepDraft(wanted - applied);
			applied = wanted;
		}
	});

	const release = (event: PointerEvent): void => {
		if (pointer !== event.pointerId) return;
		pointer = null;
		if (!scrubbing) return;
		scrubbing = false;
		card.classList.remove('sheetsmith-pool-scrubbing');

		// Velocity over the last few samples only: what the finger was doing
		// on the way out, not its average across the whole gesture.
		const last = history.at(-1);
		const first = history.find((point) => last && last.t - point.t <= VELOCITY_WINDOW);
		if (last && first && last.t > first.t) {
			const pxPerSecond = ((last.x - first.x) / (last.t - first.t)) * 1000;
			let thrown = Math.round(project(pxPerSecond) / SCRUB_PX_PER_UNIT);
			// However hard it was thrown, a flick may not cross the whole pool.
			// The gesture is worth having because it covers ground quickly, not
			// because it can empty a character in one movement.
			if (ceiling !== null) {
				const cap = Math.max(1, Math.round(ceiling * MAX_THROW_SHARE));
				thrown = Math.max(-cap, Math.min(cap, thrown));
			}
			if (thrown !== 0) stepDraft(thrown);
		}
		commitDraft();
	};

	input.addEventListener('pointerup', release);
	input.addEventListener('pointercancel', release);
}

export const pool: ComponentDefinition<PoolConfig, PoolData> = {
	type: 'pool',
	storage: 'fenced',
	formulaFields: ['max', 'reset.to'],
	configFields: [
		{
			key: 'max',
			kind: 'formula',
			label: 'Max',
			description:
				'The pool\'s ceiling, as a number or a formula, e.g. 8 + mod(abilities.CON) * level. Leave it empty for a pool that only counts up. It is not stored per character — for a max the character owns, such as rolled hit points, point this at a component holding it.',
		},
		{
			key: 'hasTemp',
			kind: 'boolean',
			label: 'Temporary points',
			description:
				'Show a second field for points above the max, such as temporary hit points.',
			default: false,
		},
	],

	read(body): ReadResult<PoolData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty pool, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const data: PoolData = {};
		const current = parsed.values.get(CURRENT_KEY);
		if (current !== undefined) data.current = current;
		const temp = parsed.values.get(TEMP_KEY);
		if (temp !== undefined) data.temp = temp;
		// Entries under any other key are left where they are, untouched —
		// including a `max` from a note written against an older layout.
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		// The bare id is the current value, which is what a formula asking
		// about a pool almost always means. The ceiling and the temporary
		// points are reachable by name, so `hp.max / 2` is writable without
		// the layout repeating the expression.
		const named: Record<string, ScopeEntry> = {};
		if (config.max !== undefined) {
			named['max'] = { display: { field: 'max', scope: {} } };
		}
		if (config.hasTemp === true) {
			named[TEMP_KEY] = { value: data?.temp };
		}
		return {
			self: { value: data?.current },
			...(Object.keys(named).length > 0 ? { named } : {}),
		};
	},

	applyReset(data, config, reset, context): ResetResult<PoolData> {
		// Emptying needs nothing resolved: zero is zero whatever the max is,
		// and a pool whose max is broken can still be spent.
		if (reset.action === 'empty') return { ok: true, data: { current: '0' } };

		// `full` restores to the ceiling, which is a formula and can fail like
		// one — the case a plain data return could not distinguish from a pool
		// that was already full.
		const field = reset.action === 'formula' ? 'reset.to' : 'max';
		const value = context.resolve(field, {});
		if (value === null) {
			return {
				ok: false,
				error:
					context.explain(field, {}) ??
					(field === 'max'
						? 'it has no max to restore to.'
						: 'its reset formula is empty.'),
			};
		}
		// Only `current` moves. See the note at the top on temporary points.
		return { ok: true, data: { current: String(value) } };
	},

	write(data, body): string {
		const updates = new Map<string, string>();
		if (data.current !== undefined) updates.set(CURRENT_KEY, data.current);
		if (data.temp !== undefined) updates.set(TEMP_KEY, data.temp);
		return writeFenced(body, updates);
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		// The card is a child of the cell, not the cell itself, exactly as a
		// lone stat card is: the cell is grid placement and the card is the
		// object. It also takes the same width cap, so a pool spanning three
		// columns does not become an expanse of clickable card around a
		// two-digit number while the stat cards beside it stay tile-sized.
		const card = doc.createElement('div');
		card.classList.add('sheetsmith-pool');
		container.appendChild(card);

		const label = doc.createElement('div');
		label.classList.add('sheetsmith-pool-label');
		label.textContent = config.label;
		card.appendChild(label);

		// Announces once per commit, whether the change came from the keyboard,
		// a step button, or a scrub. Attached before anything writes to it,
		// because a live region has to be in the document before its text
		// changes.
		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');

		const row = doc.createElement('div');
		row.classList.add('sheetsmith-pool-row');
		card.appendChild(row);

		const input = doc.createElement('input');
		input.type = 'text';
		input.inputMode = 'numeric';
		input.classList.add('sheetsmith-pool-current');
		input.value = data?.current ?? '';
		// SPEC §4.2: an empty value shows "—" everywhere.
		input.placeholder = '—';
		input.setAttribute('aria-label', config.label);

		// The max is a formula like any other, so it can fail like one. "?" is
		// reserved for present-but-unresolved, which is exactly this case.
		const resolvedMax = context.resolved['max'];
		const maxText =
			config.max === undefined ? null : formatDerived(resolvedMax, false);
		// A proportion needs a ceiling the layout actually configured *and* a
		// number it resolved to. Reading the resolved value alone would let a
		// stale entry draw a bar for a pool that has no max at all.
		const ceilingValue =
			config.max !== undefined &&
			typeof resolvedMax === 'number' &&
			Number.isFinite(resolvedMax) &&
			resolvedMax > 0
				? resolvedMax
				: null;

		const announce = (next: string): void => {
			const of = maxText === null ? '' : ` of ${maxText}`;
			// The spent and over states are a colour on screen, so they have to
			// be words here: a reader who cannot see the colour otherwise gets
			// no boundary at all.
			const value = next.trim() === '' ? null : Number(next);
			const numeric = value !== null && Number.isFinite(value) ? value : null;
			let state = '';
			if (numeric !== null && numeric <= 0) state = ', empty';
			else if (numeric !== null && ceilingValue !== null && numeric > ceilingValue) {
				state = ', above maximum';
			}
			status.textContent = `${config.label} ${next === '' ? 'empty' : next}${of}${state}`;
		};

		let handle: EditableHandle | null = null;
		let tempInput: HTMLInputElement | null = null;

		/** The draft as a number, or null where it is empty or not one. */
		const draftValue = (): number | null => {
			const raw = input.value.trim();
			if (raw === '') return null;
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : null;
		};

		/**
		 * Repaint everything derived from the draft: the proportional fill and
		 * the boundary state. Called on every keystroke, step and scrub frame,
		 * because a pool that only tells you where you are once you stop is
		 * back to being two numerals.
		 */
		const paint = (): void => {
			const value = draftValue();
			if (ceilingValue !== null && value !== null) {
				// Clamped for the bar only. The value itself is free to sit
				// above the max or below zero; the fill just has nowhere
				// further to go, and the number says the rest.
				const ratio = Math.max(0, Math.min(1, value / ceilingValue));
				card.style.setProperty('--sheetsmith-pool-fill', String(ratio));
			} else {
				card.style.removeProperty('--sheetsmith-pool-fill');
			}
			// A status, not a rule: the plugin does not know whether this game
			// lets a pool run negative, only that a reader should be able to
			// see at a glance that it has.
			input.classList.toggle(
				'sheetsmith-pool-spent',
				value !== null && value <= 0,
			);
			input.classList.toggle(
				'sheetsmith-pool-over',
				value !== null && ceilingValue !== null && value > ceilingValue,
			);
		};

		/**
		 * Move the draft without committing. Feedback is continuous and
		 * persistence is discrete (SPEC §4.2), which is also what keeps a
		 * held button from writing to the note ten times a second and
		 * rebuilding the sheet under the finger.
		 */
		const stepDraft = (delta: number): void => {
			// Text that is not a number is not a number to step, the same rule
			// the arrow keys follow — stepping it would silently replace what
			// the user wrote with a 1.
			const raw = input.value.trim();
			if (raw !== '' && draftValue() === null) return;
			// An empty pool steps from zero, the same rule the arrow keys
			// follow: pressing minus on a fresh pool must not be a dead key.
			const current = draftValue() ?? 0;
			input.value = String(current + delta);
			paint();
		};

		/** Commit whatever the draft now holds, once. */
		const commitDraft = (): void => handle?.set(input.value.trim());

		row.appendChild(stepButton(doc, input, config.label, -1, stepDraft, commitDraft));

		// The value and its ceiling are one reading, and the value holds the
		// card's centre line on its own; see the stylesheet.
		const reading = doc.createElement('div');
		reading.classList.add('sheetsmith-pool-reading');
		reading.appendChild(input);
		row.appendChild(reading);

		if (maxText !== null) {
			const ceiling = doc.createElement('span');
			ceiling.classList.add('sheetsmith-pool-ceiling');
			reading.appendChild(ceiling);

			const separator = doc.createElement('span');
			separator.classList.add('sheetsmith-pool-separator');
			separator.textContent = '/';
			ceiling.appendChild(separator);

			const max = doc.createElement('span');
			max.classList.add('sheetsmith-pool-max');
			max.textContent = maxText;
			if (resolvedMax === null) {
				max.classList.add('sheetsmith-pool-max-unresolved');
				max.setAttribute(
					'title',
					context.explainField?.('max', {}) ?? 'The formula did not resolve.',
				);
			}
			// No aria-label here: a bare span is role=generic, which prohibits
			// naming, so most assistive tech drops it. The visible text and the
			// live region already carry the ceiling.
			ceiling.appendChild(max);
		}

		row.appendChild(stepButton(doc, input, config.label, 1, stepDraft, commitDraft));

		handle = bindEditable(input, {
			initial: data?.current ?? '',
			step: true,
			onDraft: paint,
			onEnter: () => {
				tempInput?.focus();
				tempInput?.select();
			},
			announceCommit: (next) => {
				paint();
				announce(next);
			},
			announceRestore: (restored) => {
				paint();
				status.textContent = `${config.label} restored to ${restored}`;
			},
			onCommit: (next) => context.onChange({ current: next }),
		});

		bindScrub(card, input, stepDraft, commitDraft, ceilingValue);

		if (config.hasTemp === true) {
			const temp = doc.createElement('div');
			temp.classList.add('sheetsmith-pool-temp');
			card.appendChild(temp);

			const tempLabel = doc.createElement('span');
			tempLabel.classList.add('sheetsmith-pool-temp-label');
			tempLabel.textContent = 'Temp';
			temp.appendChild(tempLabel);

			tempInput = doc.createElement('input');
			tempInput.type = 'text';
			tempInput.inputMode = 'numeric';
			tempInput.classList.add('sheetsmith-pool-temp-input');
			tempInput.value = data?.temp ?? '';
			tempInput.placeholder = '—';
			tempInput.setAttribute('aria-label', `${config.label} temporary`);

			const field = tempInput;
			let tempHandle: EditableHandle | null = null;
			const stepTemp = (delta: number): void => {
				field.value = String((Number(field.value.trim()) || 0) + delta);
			};
			const commitTemp = (): void => tempHandle?.set(field.value.trim());

			// Temporary points get the same controls as the pool itself. Two
			// numbers on one card that answer differently is a mapping the
			// reader has to learn, and temp is usually what depletes first.
			temp.appendChild(
				stepButton(doc, field, `${config.label} temporary`, -1, stepTemp, commitTemp, true),
			);
			temp.appendChild(field);
			temp.appendChild(
				stepButton(doc, field, `${config.label} temporary`, 1, stepTemp, commitTemp, true),
			);

			tempHandle = bindEditable(field, {
				initial: data?.temp ?? '',
				step: true,
				announceCommit: (next) => {
					status.textContent =
						next === ''
							? `${config.label} temporary cleared`
							: `${config.label} temporary ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${config.label} temporary restored to ${restored}`;
				},
				onCommit: (next) => context.onChange({ temp: next }),
			});
		}

		// The proportional read (SPEC §4.2). A pool is the one component whose
		// state is inherently a proportion, and the only one that was making the
		// reader do the division.
		//
		// Appended last, and that is load-bearing rather than incidental. Between
		// the number and the temp pill it was a full-width horizontal line with
		// content on both sides, which is a divider whatever the spacing around
		// it says — tightening the gaps did not and could not fix that. At the
		// foot with nothing beneath it, it cannot divide anything: it stops being
		// content in the stack and becomes the card's own status strip. The
		// stylesheet then bleeds it past the padding onto the border, because an
		// inset line at the bottom would read as a mis-sized rule instead.
		if (ceilingValue !== null) {
			const track = doc.createElement('div');
			track.classList.add('sheetsmith-pool-track');
			// The numbers above already say this; the bar is the shape of them.
			track.setAttribute('aria-hidden', 'true');
			track.appendChild(doc.createElement('div')).classList.add(
				'sheetsmith-pool-track-fill',
			);
			card.appendChild(track);
		}

		card.appendChild(status);
		paint();

		// The whole card is the hit target, and it answers on press rather than
		// on release: a tap on a tablet has no hover to say which of two fields
		// it is about to land in, so the routing has to happen while the finger
		// is still down and the focus ring is the signal.
		const fields = [input, ...(tempInput ? [tempInput] : [])];
		card.addEventListener('pointerdown', (event) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest('button')) return;
			if (fields.some((f) => f === target)) return;
			const selection = doc.getSelection?.();
			if (selection && !selection.isCollapsed) return;
			let nearest = input;
			let closest = Infinity;
			for (const f of fields) {
				const box = f.getBoundingClientRect();
				const distance = Math.abs(event.clientY - (box.top + box.height / 2));
				if (distance < closest) {
					closest = distance;
					nearest = f;
				}
			}
			// Nothing else wanted this press, and preventing it stops the card
			// taking a text selection instead of handing focus over.
			event.preventDefault();
			nearest.focus();
		});
	},
};
