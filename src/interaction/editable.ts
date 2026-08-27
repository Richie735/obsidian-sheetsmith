/*
 * The editing gesture, shared by every stored value on a sheet: cards, table
 * cells and a block of prose alike (SPEC §4.2, "Card interaction").
 *
 * Feedback and persistence are deliberately separate. Typing, Enter, and
 * arrow steps all only change the draft; leaving the field commits it, and
 * Escape abandons it. Nothing reaches the file until a commit.
 *
 * Two bindings, over one policy. `bindEditable` is the one-line field, and
 * `bindMultiline` at the foot of the file is the same policy on a `<textarea>`:
 * what differs is mechanical — Enter is a newline rather than a commit, the
 * arrows are caret movement, the value is not flattened to one line, and nothing
 * is drawn per keystroke — and what is identical is the part that matters, that
 * typing only drafts, blur commits, and Escape restores the stored value and
 * says so.
 */

import { EMPTY_SCOPE, evaluate } from '../formula/expression';

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
	/**
	 * Take over what a step means. Given the signed amount, and responsible for
	 * writing the field itself.
	 *
	 * For the field whose arithmetic is not simply "add one to this number": a
	 * pool spends its temporary points before itself, so a step down may not
	 * touch this field at all. Without this the arrow keys would be the one
	 * gesture that skipped the buffer, and the same key and button on one
	 * control would disagree.
	 */
	onStep?: (delta: number) => void;
	/**
	 * Read arithmetic on commit, so `43-7` settles as `36`.
	 *
	 * The one thing a sheet with an expression parser in it should never do is
	 * ask the user to do the sum themselves, and a field that only accepted a
	 * settled number did exactly that.
	 *
	 * Unambiguous by construction, which is the whole reason it can live on the
	 * value field while an *amount* cannot: it differs from a plain number only
	 * when an operator follows one, so `-7` sets the field to minus seven and
	 * `0-17` sets it to minus seventeen. Text that is not arithmetic is left
	 * exactly as typed, because a field may legitimately hold a word.
	 */
	arithmetic?: boolean;
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

/**
 * Evaluate an amount, allowing the leading `+` the parser has no form for.
 *
 * Exported for the control that owns an amount rather than a value: a Pool's
 * adjust control takes `17`, `+17` or `-2*3` and applies it as a change, and it
 * has to read them the same way a field reads its own arithmetic — the same
 * parser, never an evaluated string (CLAUDE.md 1).
 */
export function amountOf(source: string): number | null {
	const body = source.startsWith('+') ? source.slice(1) : source;
	if (body.trim() === '') return null;
	try {
		const value = evaluate(body, EMPTY_SCOPE);
		return typeof value === 'number' && Number.isFinite(value) ? value : null;
	} catch {
		return null;
	}
}

/**
 * The value a committed entry settles to.
 *
 * A plain number is itself — checked first, so a leading minus is never read
 * as an operator on nothing. Anything else is offered to the expression
 * parser, and taken only if it produces a real number; there is no `eval`
 * anywhere near this (CLAUDE.md 1), it is the same parser the formula engine
 * runs. An entry the parser refuses is returned untouched.
 */
function settleEntry(raw: string, arithmetic: boolean): string {
	if (!arithmetic || raw === '') return raw;
	if (Number.isFinite(Number(raw))) return raw;
	try {
		const value = evaluate(raw, EMPTY_SCOPE);
		return typeof value === 'number' && Number.isFinite(value)
			? String(value)
			: raw;
	} catch {
		return raw;
	}
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
	 * Set the field and take it as committed, without reporting it.
	 *
	 * For the caller reporting several fields together: a pool spending temp
	 * and current in one gesture writes both in one change, so each field is
	 * settled here and the combined report is made once. Without it the
	 * binding's idea of what is committed goes stale and the next blur reports
	 * a change that has already been saved.
	 */
	sync(next: string): void;
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
		const typed = input.value.trim();
		// A value, always. A field that also read an amount — `-17` meaning
		// "take seventeen" — could not tell the two apart from its own text, and
		// the ambiguity cost more than the shortcut was worth: a caret landing
		// left of the digits turned a spend of two into a value of minus twenty,
		// and everything painted from the field read the amount as the value
		// while it sat there. A Pool now owns that gesture in a control of its
		// own, where the direction is a button rather than a character.
		const next = settleEntry(typed, options.arithmetic === true);
		// Show the answer, not the sum: the field has to agree with what was
		// committed, and everything derived from it repaints from the field.
		if (next !== input.value.trim()) {
			input.value = next;
			redraw();
		}
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
			const size = event.shiftKey ? 10 : 1;
			const delta = event.key === 'ArrowUp' ? size : -size;
			// A field that defines its own step owns the whole arithmetic:
			// which field ends up holding the change, and whether a step can
			// apply at all. It is reached before the numeric check below,
			// because refusing visibly is better than a dead key — the check
			// exists to leave a *text* field's arrows as caret movement, and a
			// field with its own step is not one.
			if (options.onStep) {
				event.preventDefault();
				options.onStep(delta);
				return;
			}
			const raw = input.value.trim();
			// An empty field steps from zero: pressing up on a fresh card is
			// the obvious first gesture, and it should not be a dead key.
			// Genuinely non-numeric text is not a number to step, so the
			// arrows stay caret movement there.
			const current = raw === '' ? 0 : Number(raw);
			if (!Number.isFinite(current)) return;
			event.preventDefault();
			input.value = String(clamp(current + delta, options));
			redraw();
		}
	});

	return {
		set: (next) => {
			input.value = next;
			redraw();
			commitIfChanged();
		},
		sync: (next) => {
			input.value = next;
			committed = next;
			redraw();
		},
	};
}


/** A multi-line draft, for the component whose value is a block of prose. */
export interface MultilineOptions {
	initial: string;
	/** Announced once per commit, before the view reacts to the change. */
	announceCommit?: (next: string) => void;
	/** Announced when Escape puts the stored value back. */
	announceRestore?: (restored: string) => void;
	onCommit: (next: string) => void;
}

/**
 * Bind the editing gesture to a `<textarea>`.
 *
 * A binding here rather than in the component that wanted it, because the
 * policy is exactly what must not drift: `docs/UI.md` §9 names `editable.ts` as
 * the editing gesture for "every stored value on a sheet", and a block of prose
 * that abandoned a draft differently from a card would be the instrument
 * disagreeing with itself. Three differences from the field above, each
 * mechanical rather than a departure from the policy:
 *
 * - **Enter inserts a newline and commits nothing.** A paragraph break is what
 *   the key means inside prose, and a block whose Enter committed could not hold
 *   a second paragraph. Blur is what commits, which the field already agrees on.
 * - **The arrows are caret movement.** There is no `step`, no `onStep` and no
 *   `arithmetic`: none of the three has a reading over prose, and a block of
 *   text is the case the field's own numeric check already declines to step.
 * - **The value is not flattened.** It is trimmed at each end, which is what
 *   `read` stores, and untouched in between.
 *
 * **Three of the field's members are deliberately absent**, on one rule —
 * PATTERNS §1's "do not generalise ahead of evidence" — and the third of them was
 * declared here and caught in review, which is why they are listed rather than
 * left to symmetry with the field above:
 *
 * - No `set` or `sync`, and so no `EditableHandle`: nothing sets a block of prose
 *   from outside, the way a Pool's step buttons set its value.
 * - No `step`, `onStep`, `arithmetic`, `min` or `max`, per the second bullet
 *   above.
 * - **No `onDraft`**, and it has a reason of its own rather than only the rule:
 *   there is nothing on a prose block derived from its draft. A card repaints a
 *   `derived` per keystroke and a table repaints its totals; the rendered layer
 *   here is deliberately not repainted even on *commit*, since the rebuild always
 *   comes and a repaint would destroy an anchor the browser had just focused. A
 *   component that later finds something to draw per keystroke adds the member
 *   back with its caller.
 */
export function bindMultiline(
	textarea: HTMLTextAreaElement,
	options: MultilineOptions,
): void {
	let committed = options.initial;

	const commitIfChanged = () => {
		// Trimmed at each end and nowhere else, because that is what `read`
		// hands back: a body's own leading and trailing whitespace is the
		// note's spelling and belongs to `write`, not to the draft.
		const next = textarea.value.trim();
		if (next === committed) return;
		committed = next;
		options.announceCommit?.(next);
		options.onCommit(next);
	};

	// No `input` listener: with nothing drawn from the draft there is nothing for
	// one to do. Typing changes the textarea and nothing else until a commit.
	textarea.addEventListener('blur', commitIfChanged);
	textarea.addEventListener('keydown', (event) => {
		// Enter is deliberately not handled: the browser's own newline is the
		// whole of what it should do here, and intercepting it to commit is the
		// one change that would make a two-paragraph block impossible to type.
		if (event.key !== 'Escape') return;
		// Forgiveness, unchanged from the field: abandon the draft, restore what
		// is stored — and say so, since an undo nobody can perceive is not
		// obviously one (SPEC §5).
		const abandoned = textarea.value.trim() !== committed;
		textarea.value = committed;
		if (abandoned) options.announceRestore?.(committed);
		textarea.blur();
	});
}
