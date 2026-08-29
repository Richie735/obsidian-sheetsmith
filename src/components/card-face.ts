/*
 * The face of one card: title, abbreviation, derived number, editable value,
 * editable note line. Card renders its lone card through here, Card set one
 * per entry, and Pool takes the derived formatting; any future component
 * wanting the same look renders through here too.
 *
 * Named for the face rather than for the card because `card.ts` is the
 * component (SPEC §2), and the shared painter is what a card looks like
 * rather than the thing a layout places.
 *
 * The editing gesture itself lives in editable.ts, because a table cell has
 * to behave the same way under the hand as a card does.
 */

import { bindEditable, UNRESOLVED_DELAY } from '../interaction/editable';
import { showPopover } from '../ui/popover';
import { revealWhenTruncated } from '../ui/truncation';
import { MODIFIED_CLASS } from './modifier-breakdown';

/**
 * What nothing stored looks like in the value slot (SPEC §4.2). One constant
 * because the two controls in this file have to agree about it: the field
 * shows it as a placeholder, the menu as its first line, and the whole
 * argument for that line is that it is the mark the field already shows.
 * Spelled twice, changing one silently left the menu disagreeing with the
 * field it was justified by.
 */
const EMPTY_MARK = '—';

/** Said of the one line in the menu that the layout did not put there. */
const STRAY_TITLE =
	'Not one of this card\'s options. The note keeps it until something else is chosen.';

/**
 * Ids for the sr-only breakdown twins, so each anchor names its own.
 *
 * Module scope for `popover.ts`'s reason: an id has to be unique across every
 * card on the sheet, and a counter inside one render would restart at every card.
 */
let breakdowns = 0;

export interface CardFaceDerived {
	text: string;
	/** True when the formula did not resolve; styled as status, not data. */
	unresolved?: boolean;
	/**
	 * Why it did not resolve, in words. Same rule as a computed table cell:
	 * "mod() takes 1 argument, got 2" is a next action, and "did not
	 * resolve" is a status. Omitted where the caller has no explainer.
	 */
	reason?: string | null;
}

export interface CardFaceOptions {
	title: string;
	/**
	 * Hide the title text. It still names the card's controls for assistive
	 * tech, so hiding it costs nothing to a screen reader.
	 */
	hideTitle?: boolean;
	/** Small line under the title, e.g. "WIS" under "Wisdom". */
	abbreviation?: string;
	/**
	 * Keep the abbreviation's slot even when it is empty, so cards in a row
	 * share a baseline. Defaults to true; a lone card has no row to align
	 * with, and an empty slot there is just a gap.
	 */
	reserveAbbreviation?: boolean;
	/** Editable stored value; omit to hide the value entirely. */
	value?: {
		current: string;
		/**
		 * What the pill reads **at rest**, where that differs from what is stored.
		 *
		 * The one case is a score something else is layered over: a Strength of 15
		 * with an item +2 on it is a 17, and 17 is the number a player looks for.
		 * Absent — every card that declares no `effective` formula — leaves the
		 * pill exactly what it has always been, the number that was typed.
		 *
		 * **It is display only, and the field goes back to `current` the moment it
		 * is focused.** That is not a nicety: `current` is `bindEditable`'s
		 * `initial`, which is the baseline Escape restores to, the number an arrow
		 * step increments, and what a blur compares against to decide whether
		 * anything changed. A field left reading 17 would step to 18 and commit 18
		 * as the *stored* score, which is character data drifting under a reader
		 * who only pressed an arrow key (CLAUDE.md 4). So the swap is what makes
		 * the whole feature safe rather than what makes it pretty: at rest the
		 * effective number, under a caret the number you typed.
		 */
		shown?: string;
		/**
		 * Closed list of choices, which turns the value slot into a menu over
		 * them. Absent is the field, and that is the whole switch: a card with
		 * options is a dropdown and a card without is a field (SPEC §4.2), so
		 * there is nothing here saying which control to draw.
		 *
		 * Each choice stores its `value` and shows its `label`, or its value
		 * where it has no label.
		 *
		 * **`shown` is ignored here**, and a dropdown never takes one: its text is
		 * a *label* for the stored value, chosen from a closed list, so a
		 * computed reading would be a word the list does not contain.
		 */
		options?: readonly { value: string; label?: string }[];
		onCommit: (next: string) => void;
	};
	/**
	 * Derived display. When present it is the card's big number, and the
	 * stored value drops into a small pill beneath it. `compute` re-derives
	 * the display from a draft value while the user types.
	 */
	derived?: CardFaceDerived & {
		compute?: (draft: string) => CardFaceDerived;
		/**
		 * What has been pushed at the name this number publishes, as one block of
		 * text, or null where nothing has (SPEC §5).
		 *
		 * **The floor is nearly free and that is worth noticing.** A modifiable
		 * value has a `derived` by construction, and the card already shows the
		 * derived number in large type over the stored value — so "this number is
		 * not the number you typed" is on screen the moment a target reads its
		 * slot. What this adds is the answer to "why", which is the half nothing
		 * in the surveyed category puts at the number.
		 *
		 * A block of text rather than the lines themselves, because the same text
		 * has to reach two carriers — the popover and an `.sheetsmith-sr-only`
		 * twin — and one builder is what stops them saying different things
		 * (`modifier-breakdown.ts`).
		 */
		modifiers?: string | null;
	};
	/**
	 * Editable free-text line under the value, for the qualifier a number
	 * cannot carry — "chain mail, shield" under an armour class. Omit to
	 * leave the line off the card.
	 */
	note?: {
		current: string;
		placeholder?: string;
		onCommit: (next: string) => void;
	};
}

/**
 * Turn one field resolution into the card's derived display.
 *
 * The three fields always move together — the text, whether it resolved, and
 * why it did not — so deriving them together is what keeps a card from ever
 * showing "?" with no reason, or a reason for a number that came out fine.
 * The explanation is asked for only where the value already failed, so the
 * second evaluation is paid on the error path alone.
 */
export function toDerived(
	resolved: string | number | boolean | null | undefined,
	signed: boolean,
	explain?: () => string | null,
): CardFaceDerived {
	const unresolved = resolved === null;
	return {
		text: formatDerived(resolved, signed),
		unresolved,
		reason: unresolved ? (explain?.() ?? null) : null,
	};
}

/** "?" while unresolved; signed numbers read like modifiers ("+4", "-1"). */
export function formatDerived(
	value: string | number | boolean | null | undefined,
	signed: boolean,
): string {
	if (value === null || value === undefined) return '?';
	if (typeof value === 'number' && signed && value >= 0) return `+${value}`;
	return String(value);
}

function setDerived(el: HTMLElement, derived: CardFaceDerived): void {
	el.textContent = derived.text;
	el.classList.toggle(
		'sheetsmith-card-derived-unresolved',
		derived.unresolved === true,
	);
	if (derived.unresolved === true) {
		el.setAttribute('title', derived.reason ?? 'The formula did not resolve.');
	} else {
		el.removeAttribute('title');
	}
}

/**
 * The value slot as a menu over a closed list.
 *
 * A native `<select>`, and there is no custom menu behind it: Obsidian's own
 * property editor uses one, and on a phone it is the OS picker, which is
 * better than anything drawn here and free (docs/UI.md §7). It also has no
 * draft, which is why none of the card's Enter, Escape or arrow rules reach
 * it — those are about a value on its way to being committed, and choosing an
 * option *is* the commit.
 */
function renderDropdown(
	slot: HTMLElement,
	title: string,
	current: string,
	options: readonly { value: string; label?: string }[],
	on: {
		onCommit: (next: string) => void;
		showDerived: (draft: string) => void;
		/**
		 * Blank the empty line's text, which is what the field does with its
		 * placeholder when a `derived` owns the headline: the em dash would be
		 * the card's second copy of the same nothing, and the smaller of the two
		 * would be the control. The line stays — it is what clears the value —
		 * and the chevron is what says the pill is still a menu.
		 */
		quietEmpty: boolean;
	},
): HTMLSelectElement {
	const doc = slot.ownerDocument;
	const select = doc.createElement('select');
	select.classList.add('sheetsmith-card-select');
	// The card's own label. A control whose visible content is a value rather
	// than a name has to take its name from somewhere, and the label is on
	// screen where a reader can see it agree (docs/UI.md §6).
	select.setAttribute('aria-label', title);

	const line = (value: string, text: string) => {
		const option = doc.createElement('option');
		option.value = value;
		option.textContent = text;
		select.appendChild(option);
		return option;
	};

	// First, and not one of the options: it is what the card already shows for
	// an empty value, so the empty state reads the same whether the card is a
	// field or a menu — and it is what makes "no option is a default" true
	// rather than merely intended (SPEC §4.2).
	line('', on.quietEmpty ? '' : EMPTY_MARK);
	// A blank label shows the value, which is the ordinary case: a list of
	// plain words pays nothing for the split.
	for (const option of options) line(option.value, option.label || option.value);

	/*
	 * A stored value the layout no longer offers is rendered, not corrected.
	 * Snapping to the first option, or to blank, would be a layout edit
	 * deleting character data (Constraint 4), and this is the Track rule one
	 * level down: a stored value outside a run is rendered rather than fixed.
	 *
	 * Last rather than first, so the layout's own list keeps the shape its
	 * author gave it and the anomaly is not the first thing the eye meets.
	 */
	const stray =
		current !== '' && !options.some((option) => option.value === current)
			? line(current, current)
			: null;
	select.value = current;
	// Adds to the name rather than replacing it, because the control's visible
	// content is words (docs/UI.md §6). No status colour and no "?": that glyph
	// is for a value that did not resolve, and this one resolved fine — it is
	// exactly what the note says.
	if (stray) select.setAttribute('title', STRAY_TITLE);

	select.addEventListener('change', () => {
		if (stray && select.value !== stray.value) {
			stray.remove();
			select.removeAttribute('title');
		}
		// Painted before the change is reported (docs/PATTERNS.md §5).
		on.showDerived(select.value);
		on.onCommit(select.value);
	});

	slot.appendChild(select);
	return select;
}

export function renderCardFace(
	container: HTMLElement,
	options: CardFaceOptions,
): void {
	// Rendering twice into one element must replace, not duplicate — and
	// state classes must be re-derived, not merely accumulated.
	container.replaceChildren();
	const doc = container.ownerDocument;
	container.classList.add('sheetsmith-card');
	container.classList.toggle(
		'sheetsmith-card-has-derived',
		options.derived !== undefined,
	);

	if (options.hideTitle !== true) {
		const label = doc.createElement('div');
		// The shared rank (docs/UI.md §9); the card's own class carries only the
		// narrow-card widening, which needs a container to ask about.
		label.classList.add('sheetsmith-component-label', 'sheetsmith-card-label');
		label.textContent = options.title;
		// The label ellipsises in narrow cards, and the full text has to stay
		// reachable — but a tooltip repeating a label that is already fully
		// legible is noise, and the whole card is a hover target, so a row of
		// wide cards would pop one on every pass. The shared helper decides on
		// hover, when the text has been laid out and truncation is a fact.
		revealWhenTruncated(label);
		container.appendChild(label);
	}

	if (options.reserveAbbreviation !== false || options.abbreviation) {
		const abbreviation = doc.createElement('div');
		abbreviation.classList.add('sheetsmith-card-abbreviation');
		abbreviation.textContent = options.abbreviation ?? '';
		container.appendChild(abbreviation);
	}

	/**
	 * The sr-only breakdown's id, for the value control to point at. The card
	 * holds one builder's text in two carriers, so the field's `aria-describedby`
	 * and the popover cannot describe the number differently.
	 */
	let describedBy: string | null = null;
	let derivedEl: HTMLElement | null = null;
	/** The breakdown, where this number has one, for the press routing below. */
	const breakdown = options.derived?.modifiers ?? null;
	if (options.derived) {
		derivedEl = doc.createElement('div');
		derivedEl.classList.add('sheetsmith-card-derived');
		// A per-keystroke live region is noise; announcements happen once
		// per commit, via the status element below.
		if (!options.value) derivedEl.setAttribute('aria-label', options.title);
		setDerived(derivedEl, options.derived);
		container.appendChild(derivedEl);
		if (breakdown !== null) {
			/*
			 * A dotted underline and `cursor: help`, opening the shared popover
			 * on a press. No new gesture (UI §6, §9): a press on the derived is
			 * the same second door a computed cell and a level ring already use,
			 * and on touch it is an ordinary tap — a read-only number has no
			 * other use for one, so the tap is free to mean "why this number?".
			 *
			 * Its own listener rather than a branch of the card's hit target,
			 * because a card with `hideValue` and no note has no controls and so
			 * installs no `onclick` at all — and the routing below stands aside
			 * for it rather than focusing the field underneath.
			 */
			derivedEl.classList.add(MODIFIED_CLASS);
			const anchor = derivedEl;
			anchor.addEventListener('click', () => showPopover(anchor, breakdown));
			/*
			 * The same text where a pointer is not available. `showPopover`
			 * already sets `role="tooltip"` and `aria-describedby` while it is
			 * open, and this is what makes the breakdown reachable without one:
			 * the value's own field points at it below.
			 *
			 * **What is not fixed here** is that the anchor is not a tab stop.
			 * That is the existing computed cell's gap carried across rather than
			 * one this introduces — making a value display focusable would add a
			 * tab stop per modified card, which is a change to the card's
			 * keyboard model and not to this.
			 */
			const twin = doc.createElement('div');
			twin.classList.add('sheetsmith-sr-only');
			twin.id = `sheetsmith-breakdown-${++breakdowns}`;
			twin.textContent = breakdown;
			container.appendChild(twin);
			describedBy = twin.id;
		}
	}

	// Announces once per commit. Built up front and attached below, because a
	// live region has to be in the document before its text changes; updated
	// synchronously before the view reacts, so the message queues while the
	// node is still attached.
	const status =
		options.value || options.note ? doc.createElement('div') : null;
	if (status) {
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');
	}

	// Every control the card holds, in top-to-bottom order: the click routing
	// below aims at the nearest one, and a menu is as much a target as a field.
	const controls: (HTMLInputElement | HTMLSelectElement)[] = [];
	// Filled in by the note block below; the value's Enter reads it later.
	let noteInput: HTMLInputElement | null = null;

	/**
	 * The value's place on the card, whichever control ends up in it. One slot
	 * for both, so a menu and a field share the card's typography, its pill
	 * treatment and its position rather than agreeing about them twice.
	 */
	const valueSlot = () => {
		const el = doc.createElement('div');
		el.classList.add('sheetsmith-card-value');
		container.appendChild(el);
		return el;
	};

	if (options.value?.options) {
		const value = valueSlot();
		// The chevron rides on the slot rather than on the control: a select
		// cannot carry a pseudo-element, and painting one into its background
		// would mean a colour of this plugin's own (docs/UI.md §1).
		value.classList.add('sheetsmith-card-dropdown');
		const compute = options.derived?.compute;
		controls.push(
			renderDropdown(
				value,
				options.title,
				options.value.current,
				options.value.options,
				{
					onCommit: options.value.onCommit,
					// A menu has no draft, so the display is never held back:
					// the choice is settled the moment it is made, and the pill
					// under it must not lag the word above it (PATTERNS §5).
					showDerived: (draft) => {
						if (derivedEl && compute) setDerived(derivedEl, compute(draft));
					},
					// The same branch the field takes on its placeholder, three
					// lines down: with a derived above it the card must not show
					// the same nothing twice.
					quietEmpty: options.derived !== undefined,
				},
			),
		);
	} else if (options.value) {
		const compute = options.derived?.compute;
		const value = valueSlot();

		const input = doc.createElement('input');
		input.type = 'text';
		// A derived formula implies the value is used numerically.
		if (options.derived) input.inputMode = 'numeric';
		input.classList.add('sheetsmith-card-input');
		/*
		 * At rest the effective number, where the layout declared one. Focus puts
		 * the stored number back before a caret can reach it — see `shown` — and
		 * the two listeners below are the whole of that swap.
		 */
		const stored = options.value.current;
		const atRest = options.value.shown ?? stored;
		input.value = atRest;
		if (atRest !== stored) {
			// A number the reader did not type reads as one they did, so the
			// difference is said rather than only painted (docs/UI.md §6). The
			// breakdown behind the big number is where the *why* already lives.
			input.classList.add('sheetsmith-card-input-effective');
			input.setAttribute('title', `${atRest} with modifiers · ${stored} stored`);
		}
		// With a derived above it, the em dash would be the card's second
		// copy of the same nothing; the pill's own outline says "field".
		input.placeholder = options.derived ? '' : EMPTY_MARK;
		input.setAttribute('aria-label', options.title);
		value.appendChild(input);
		controls.push(input);

		const view = doc.defaultView;
		let pending: number | undefined;
		/**
		 * Repaint the derived display from the draft. An unresolved result
		 * waits out UNRESOLVED_DELAY before it is allowed to show, so a
		 * half-typed value keeps the last good display instead of flashing
		 * a warning; a settled draft (a commit) shows the truth at once.
		 */
		const showDerived = (settled: boolean) => {
			const el = derivedEl;
			if (!el || !compute) return;
			if (pending !== undefined) {
				view?.clearTimeout(pending);
				pending = undefined;
			}
			const next = compute(input.value.trim());
			if (settled || next.unresolved !== true) {
				setDerived(el, next);
				return;
			}
			pending = view?.setTimeout(() => {
				pending = undefined;
				setDerived(el, next);
			}, UNRESOLVED_DELAY);
		};

		bindEditable(input, {
			initial: options.value.current,
			step: true,
			onDraft: () => showDerived(false),
			onEnter: () => {
				// Enter means "done with this field", and on a card with a
				// note the next field is the obvious place to be.
				noteInput?.focus();
				noteInput?.select();
			},
			announceCommit: (next) => {
				// Settle the display first: the announcement quotes it, and a
				// held draft would be quoted stale.
				showDerived(true);
				if (!status) return;
				status.textContent = derivedEl
					? `${options.title} ${next}, ${derivedEl.textContent ?? ''}`
					: `${options.title} ${next}`;
			},
			announceRestore: (restored) => {
				if (status) status.textContent = `${options.title} restored to ${restored}`;
			},
			onCommit: options.value.onCommit,
		});

		/*
		 * **The swap, and it is bound after `bindEditable` on purpose.** Listeners
		 * on one element fire in the order they were added, so the binding's own
		 * blur — the one that commits — runs before this one puts the effective
		 * number back. Bound first, this would hand the commit a number nobody
		 * typed.
		 *
		 * A commit re-renders the sheet and rebuilds this face with a fresh
		 * `shown`, so the restore below is for the other blur: a reader who focused
		 * the field, changed nothing, and moved on.
		 */
		if (atRest !== stored) {
			input.addEventListener('focus', () => {
				// Before any caret, any arrow key and any draft: from here on the
				// field is the stored score and every gesture acts on that.
				input.value = stored;
			});
			input.addEventListener('blur', () => {
				// Only where the field still holds what it was given. Anything else
				// is a draft the binding has just committed, and the re-render that
				// follows owns the display.
				if (input.value.trim() === stored) input.value = atRest;
			});
		}
	}

	if (options.note) {
		const note = doc.createElement('div');
		note.classList.add('sheetsmith-card-note');
		container.appendChild(note);

		const input = doc.createElement('input');
		input.type = 'text';
		input.classList.add('sheetsmith-card-note-input');
		input.value = options.note.current;
		if (options.note.placeholder) input.placeholder = options.note.placeholder;
		input.setAttribute('aria-label', `${options.title} note`);
		note.appendChild(input);
		controls.push(input);
		noteInput = input;

		bindEditable(input, {
			initial: options.note.current,
			announceCommit: (next) => {
				if (!status) return;
				status.textContent =
					next === ''
						? `${options.title} note cleared`
						: `${options.title} note ${next}`;
			},
			announceRestore: () => {
				if (status) status.textContent = `${options.title} note restored`;
			},
			onCommit: options.note.onCommit,
		});
	}

	if (status) container.appendChild(status);

	// The breakdown reaches the keyboard through the control the reader is already
	// on, because the number itself is not a tab stop (see above).
	if (describedBy !== null && controls[0]) {
		controls[0].setAttribute('aria-describedby', describedBy);
	}

	const primary = controls[0];
	if (primary) {
		// The card only promises an edit when it has one to give; the cursor
		// and the hover and press states hang off this class.
		container.classList.add('sheetsmith-card-editable');
		// The whole card is the hit target, not just the small inputs — but
		// never at the cost of a text selection in progress, and never
		// stealing focus from a field the click already landed in.
		container.onclick = (event) => {
			if (controls.some((candidate) => candidate === event.target)) return;
			// The derived owns its own press where it has a breakdown to show, so
			// the routing stands aside rather than focusing the field under it.
			// Everywhere else on the card the press still goes to the nearest
			// control — the padding under the note belongs to the note.
			if (derivedEl?.contains(event.target as Node | null) === true && breakdown) {
				return;
			}
			const selection = doc.getSelection?.();
			if (selection && !selection.isCollapsed) return;
			// Proximity has to mean something: a click in the padding under
			// the note belongs to the note, not to the number at the top.
			let target = primary;
			let closest = Infinity;
			for (const candidate of controls) {
				const box = candidate.getBoundingClientRect();
				const distance = Math.abs(event.clientY - (box.top + box.height / 2));
				if (distance < closest) {
					closest = distance;
					target = candidate;
				}
			}
			target.focus();
			/*
			 * A menu needs the press to *open* it, where a field only needed
			 * focus. Focus on an `<input>` is the edit gesture — a caret lands
			 * and a phone raises its keyboard — and focus on a `<select>` shows
			 * a ring on a desktop and produces nothing observable at all under
			 * a finger. So the card was answering its own hit target with
			 * silence, which is what docs/UI.md §7 rules out: the target is the
			 * card, not the mark.
			 *
			 * The measurement is why this reversed a decision the spec had
			 * taken the other way. A menu's own box is as wide as the chosen
			 * option and no wider, so at 1400 an Alignment card gives 196x29
			 * against a plain card's 432x29, a Heritage card 73x29, and the
			 * same card with nothing stored — the one a reader is most likely
			 * to press — 28x29, or 16x14 inside a derived's pill. None of that
			 * grows under a coarse pointer, while the level ring beside it does.
			 *
			 * `showPicker` throws where the platform will not honour it, and
			 * the focus above is already the outcome the spec originally
			 * described, so the catch is a fallback rather than a swallowed
			 * error.
			 */
			if (target.tagName === 'SELECT') {
				try {
					target.showPicker();
				} catch {
					// Focused, which is where this landed before.
				}
			}
		};
	} else {
		container.classList.remove('sheetsmith-card-editable');
		container.onclick = null;
	}
}
