/*
 * The editing gesture, shared by every stored value on a sheet: stat cards
 * and table cells alike (SPEC §4.2, "Card interaction").
 *
 * Feedback and persistence are deliberately separate. Typing, Enter, and
 * arrow steps all only change the draft; leaving the field commits it, and
 * Escape abandons it. Nothing reaches the file until a commit.
 */

/**
 * How long a draft may fail to resolve before a computed display says so. A
 * value on its way to being valid passes through states that are not wrong
 * yet ("-" before "-1"), and marking those unresolved fires a warning at
 * input the user is still in the middle of. Only a settled bad value earns
 * the glyph.
 */
export const UNRESOLVED_DELAY = 300;

export interface EditableOptions {
	initial: string;
	/** Arrow keys step a numeric draft, exactly like typing the number. */
	step?: boolean;
	/** Bounds for the stepped value, when the field has any. */
	min?: number;
	max?: number;
	/** Live feedback per keystroke, before anything is committed. */
	onDraft?: () => void;
	/** Where Enter goes once it has committed, if anywhere. */
	onEnter?: () => void;
	/** Announced once per commit, before the view reacts to the change. */
	announceCommit?: (next: string) => void;
	/** Announced when Escape puts the stored value back. */
	announceRestore?: (restored: string) => void;
	onCommit: (next: string) => void;
}

/** Clamp a stepped value, where the field declares bounds. */
function clamp(value: number, options: EditableOptions): number {
	let next = value;
	if (options.min !== undefined) next = Math.max(options.min, next);
	if (options.max !== undefined) next = Math.min(options.max, next);
	return next;
}

/** What a caller keeps hold of after binding, for the edits it drives itself. */
export interface EditableHandle {
	/**
	 * Set the field from outside and commit it, as a Pool's step buttons do.
	 *
	 * It goes through the same commit as the keyboard rather than writing
	 * `input.value` directly, because the binding remembers what is committed
	 * in order to know whether a blur changed anything. A caller that set the
	 * value behind its back would leave that stale, and the next blur would
	 * report a change that had already been saved.
	 */
	set(next: string): void;
}

export function bindEditable(
	input: HTMLInputElement,
	options: EditableOptions,
): EditableHandle {
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
			input.value = String(
				clamp(current + (event.key === 'ArrowUp' ? size : -size), options),
			);
			redraw();
		}
	});

	return {
		set: (next) => {
			input.value = next;
			redraw();
			commitIfChanged();
		},
	};
}
