/*
 * Card DOM for stat-like displays: title, abbreviation, derived number,
 * editable value. Used by Stat group for each attribute card; any future
 * component wanting the same look renders through here.
 *
 * Feedback and persistence are deliberately separate: the derived display
 * recomputes live on every keystroke, while the value commits (and reaches
 * the file) only on change — blur, Enter, or an arrow-key step.
 */

export interface StatCardDerived {
	text: string;
	/** True when the formula did not resolve; styled as status, not data. */
	unresolved?: boolean;
}

export interface StatCardOptions {
	title: string;
	/** Small line under the title, e.g. "WIS" under "Wisdom". The slot is
	 * always reserved so cards in a row share a baseline. */
	abbreviation?: string;
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

	const label = doc.createElement('div');
	label.classList.add('sheetsmith-stat-label');
	label.textContent = options.title;
	// The label ellipsises in narrow cards; the full text must be reachable.
	label.title = options.title;
	container.appendChild(label);

	const abbreviation = doc.createElement('div');
	abbreviation.classList.add('sheetsmith-stat-abbreviation');
	abbreviation.textContent = options.abbreviation ?? '';
	container.appendChild(abbreviation);

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

	if (options.value) {
		const commit = options.value.onCommit;
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
		input.placeholder = '—';
		input.setAttribute('aria-label', options.title);

		// Announces once per commit. Updated synchronously before the view
		// reacts, so the message queues while the node is still attached.
		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');
		container.appendChild(status);

		let committed = options.value.current;

		const updateDerived = () => {
			if (derivedEl && compute) {
				setDerived(derivedEl, compute(input.value.trim()));
			}
		};

		// One commit path for every gesture: typing, Enter, and arrow
		// steps all just change the draft; leaving the field commits it.
		const commitIfChanged = () => {
			const next = input.value.trim();
			if (next === committed) return;
			committed = next;
			status.textContent = derivedEl
				? `${options.title} ${next}, ${derivedEl.textContent ?? ''}`
				: `${options.title} ${next}`;
			commit(next);
		};

		// Live feedback on every keystroke; persistence only on commit.
		input.addEventListener('input', updateDerived);
		input.addEventListener('blur', commitIfChanged);
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				input.blur();
			} else if (event.key === 'Escape') {
				// Forgiveness: abandon the draft, restore what is stored.
				input.value = committed;
				updateDerived();
				input.blur();
			} else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
				const current = Number(input.value.trim());
				if (input.value.trim() === '' || !Number.isFinite(current)) return;
				event.preventDefault();
				input.value = String(current + (event.key === 'ArrowUp' ? 1 : -1));
				updateDerived();
			}
		});
		value.appendChild(input);

		// The whole card is the hit target, not just the small input — but
		// never at the cost of a text selection in progress.
		container.onclick = (event) => {
			if (event.target === input) return;
			const selection = doc.getSelection?.();
			if (selection && !selection.isCollapsed) return;
			input.focus();
		};
	}
}
