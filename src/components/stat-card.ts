/*
 * Card DOM for stat-like displays: title, abbreviation, derived number,
 * editable value, editable note line. Used by Stat group for each attribute
 * card and by Stat for its lone card; any future component wanting the same
 * look renders through here.
 *
 * Feedback and persistence are deliberately separate: the derived display
 * recomputes live on every keystroke, while stored text commits (and reaches
 * the file) only on change — blur, Enter, or an arrow-key step.
 */

/**
 * How long a draft may fail to resolve before the card says so. A value on
 * its way to being valid passes through states that are not wrong yet ("-"
 * before "-1"), and marking those unresolved fires a warning at input the
 * user is still in the middle of. Only a settled bad value earns the glyph.
 */
const UNRESOLVED_DELAY = 300;

export interface StatCardDerived {
	text: string;
	/** True when the formula did not resolve; styled as status, not data. */
	unresolved?: boolean;
}

export interface StatCardOptions {
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
		onCommit: (next: string) => void;
	};
	/**
	 * Derived display. When present it is the card's big number, and the
	 * stored value drops into a small pill beneath it. `compute` re-derives
	 * the display from a draft value while the user types.
	 */
	derived?: StatCardDerived & {
		compute?: (draft: string) => StatCardDerived;
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

/** "?" while unresolved; signed numbers read like modifiers ("+4", "-1"). */
export function formatDerived(
	value: string | number | boolean | null | undefined,
	signed: boolean,
): string {
	if (value === null || value === undefined) return '?';
	if (typeof value === 'number' && signed && value >= 0) return `+${value}`;
	return String(value);
}

function setDerived(el: HTMLElement, derived: StatCardDerived): void {
	el.textContent = derived.text;
	el.classList.toggle(
		'sheetsmith-stat-derived-unresolved',
		derived.unresolved === true,
	);
	if (derived.unresolved === true) {
		el.setAttribute('title', 'The formula did not resolve.');
	} else {
		el.removeAttribute('title');
	}
}

/**
 * One commit path for every gesture: typing, Enter, and arrow steps all just
 * change the draft; leaving the field commits it, and Escape abandons it.
 * Nothing reaches the file until a commit.
 */
function bindEditable(
	input: HTMLInputElement,
	options: {
		initial: string;
		/** Arrow keys step a numeric draft, exactly like typing the number. */
		step?: boolean;
		/** Live feedback per keystroke, before anything is committed. */
		onDraft?: () => void;
		/** Where Enter goes once it has committed, if anywhere. */
		onEnter?: () => void;
		/** Announced once per commit, before the view reacts to the change. */
		announceCommit?: (next: string) => void;
		/** Announced when Escape puts the stored value back. */
		announceRestore?: (restored: string) => void;
		onCommit: (next: string) => void;
	},
): void {
	let committed = options.initial;
	const redraw = () => options.onDraft?.();

	const commitIfChanged = () => {
		const next = input.value.trim();
		if (next === committed) return;
		committed = next;
		options.announceCommit?.(next);
		options.onCommit(next);
	};

	// Live feedback on every keystroke; persistence only on commit.
	input.addEventListener('input', redraw);
	input.addEventListener('blur', commitIfChanged);
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') {
			// Commit in place. Blurring would also throw away the user's
			// position in the document, and Enter never asked for that.
			event.preventDefault();
			commitIfChanged();
			options.onEnter?.();
		} else if (event.key === 'Escape') {
			// Forgiveness: abandon the draft, restore what is stored — and
			// say so, since an undo nobody can perceive is not obviously one.
			const abandoned = input.value.trim() !== committed;
			input.value = committed;
			redraw();
			if (abandoned) options.announceRestore?.(committed);
			input.blur();
		} else if (
			options.step === true &&
			(event.key === 'ArrowUp' || event.key === 'ArrowDown')
		) {
			const raw = input.value.trim();
			// An empty field steps from zero: pressing up on a fresh card is
			// the obvious first gesture, and it should not be a dead key.
			// Genuinely non-numeric text is not a number to step, so the
			// arrows stay caret movement there.
			const current = raw === '' ? 0 : Number(raw);
			if (!Number.isFinite(current)) return;
			event.preventDefault();
			const size = event.shiftKey ? 10 : 1;
			input.value = String(current + (event.key === 'ArrowUp' ? size : -size));
			redraw();
		}
	});
}

export function renderStatCard(
	container: HTMLElement,
	options: StatCardOptions,
): void {
	// Rendering twice into one element must replace, not duplicate — and
	// state classes must be re-derived, not merely accumulated.
	container.replaceChildren();
	const doc = container.ownerDocument;
	container.classList.add('sheetsmith-stat');
	container.classList.toggle(
		'sheetsmith-stat-has-derived',
		options.derived !== undefined,
	);

	if (options.hideTitle !== true) {
		const label = doc.createElement('div');
		label.classList.add('sheetsmith-stat-label');
		label.textContent = options.title;
		// The label ellipsises in narrow cards, and the full text has to stay
		// reachable — but a tooltip repeating a label that is already fully
		// legible is noise, and the whole card is a hover target, so a row of
		// wide cards would pop one on every pass. Decide on hover, when the
		// text has been laid out and truncation is a fact rather than a guess.
		label.addEventListener('pointerenter', () => {
			if (label.scrollWidth > label.clientWidth) label.title = options.title;
			else label.removeAttribute('title');
		});
		container.appendChild(label);
	}

	if (options.reserveAbbreviation !== false || options.abbreviation) {
		const abbreviation = doc.createElement('div');
		abbreviation.classList.add('sheetsmith-stat-abbreviation');
		abbreviation.textContent = options.abbreviation ?? '';
		container.appendChild(abbreviation);
	}

	let derivedEl: HTMLElement | null = null;
	if (options.derived) {
		derivedEl = doc.createElement('div');
		derivedEl.classList.add('sheetsmith-stat-derived');
		// A per-keystroke live region is noise; announcements happen once
		// per commit, via the status element below.
		if (!options.value) derivedEl.setAttribute('aria-label', options.title);
		setDerived(derivedEl, options.derived);
		container.appendChild(derivedEl);
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

	const inputs: HTMLInputElement[] = [];
	// Filled in by the note block below; the value's Enter reads it later.
	let noteInput: HTMLInputElement | null = null;

	if (options.value) {
		const compute = options.derived?.compute;
		const value = doc.createElement('div');
		value.classList.add('sheetsmith-stat-value');
		container.appendChild(value);

		const input = doc.createElement('input');
		input.type = 'text';
		// A derived formula implies the value is used numerically.
		if (options.derived) input.inputMode = 'numeric';
		input.classList.add('sheetsmith-stat-input');
		input.value = options.value.current;
		// With a derived above it, the em dash would be the card's second
		// copy of the same nothing; the pill's own outline says "field".
		input.placeholder = options.derived ? '' : '—';
		input.setAttribute('aria-label', options.title);
		value.appendChild(input);
		inputs.push(input);

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
	}

	if (options.note) {
		const note = doc.createElement('div');
		note.classList.add('sheetsmith-stat-note');
		container.appendChild(note);

		const input = doc.createElement('input');
		input.type = 'text';
		input.classList.add('sheetsmith-stat-note-input');
		input.value = options.note.current;
		if (options.note.placeholder) input.placeholder = options.note.placeholder;
		input.setAttribute('aria-label', `${options.title} note`);
		note.appendChild(input);
		inputs.push(input);
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

	const primary = inputs[0];
	if (primary) {
		// The card only promises an edit when it has one to give; the cursor
		// and the hover and press states hang off this class.
		container.classList.add('sheetsmith-stat-editable');
		// The whole card is the hit target, not just the small inputs — but
		// never at the cost of a text selection in progress, and never
		// stealing focus from a field the click already landed in.
		container.onclick = (event) => {
			if (inputs.some((candidate) => candidate === event.target)) return;
			const selection = doc.getSelection?.();
			if (selection && !selection.isCollapsed) return;
			// Proximity has to mean something: a click in the padding under
			// the note belongs to the note, not to the number at the top.
			let target = primary;
			let closest = Infinity;
			for (const candidate of inputs) {
				const box = candidate.getBoundingClientRect();
				const distance = Math.abs(event.clientY - (box.top + box.height / 2));
				if (distance < closest) {
					closest = distance;
					target = candidate;
				}
			}
			target.focus();
		};
	} else {
		container.classList.remove('sheetsmith-stat-editable');
		container.onclick = null;
	}
}
