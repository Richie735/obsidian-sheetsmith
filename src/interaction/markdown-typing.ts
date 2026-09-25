/*
 * Turn a keystroke in a markdown textarea into the edit an editor would make of
 * it (docs/features/prose-field-editing.md).
 *
 * Brackets that close as they are typed: a keystroke over a string and nothing
 * taken from the app. `bindMultiline` calls this on its textarea, so a Rich text block and a
 * record body both have it and neither component knows it exists. Nothing here
 * commits, restores, trims or refuses — that is `editable.ts`'s policy, and
 * keeping the two apart is what leaves that policy exactly as it was.
 *
 * **Built on `beforeinput`, never `keydown`, and that is the whole reason this
 * is the second attempt.** The first keyed on physical keys, and a keyboard
 * layout that composes `[` with Option never reached it: every unit test passed
 * and the app did nothing. `beforeinput` carries the character actually going
 * in, whatever produced it.
 *
 * **Every edit goes through `execCommand('insertText')`**, deprecated and still
 * the only write that joins a textarea's native undo stack. A probe in Chromium
 * showed that one `setRangeText` does not merely skip its own undo step — it
 * leaves undo able to do nothing at all, so a reader's Cmd-Z after a closed
 * bracket would lose the paragraph before it. `editor/formula-suggest.ts` made
 * the opposite choice for a one-line formula field, on an argument about
 * `change` events that never weighed undo; here undo is the whole question.
 * The lint exception is scoped to this file in `eslint.config.mts`.
 *
 * **A keystroke is never lost.** The event is cancelled only once the insertion
 * reports success; where the call is missing or refuses, the browser's own
 * keystroke goes through untouched.
 *
 * **What this deliberately is not**, each a difference from Obsidian 1.13.7's
 * editor, read from its `app.js` rather than recalled:
 *
 * - The pairs are fixed. Obsidian's **Auto pair brackets** and **Auto pair
 *   Markdown syntax** are read through `app.vault.getConfig`, which the
 *   typings do not declare, and this module holds no `app`.
 * - Quotes are not paired: an apostrophe in prose is not an opener.
 * - `*`, `_` and a backtick wrap a selection and are never paired on a bare
 *   caret, since `**` typed by hand would become `****`. No triple backtick.
 * - Tab is not taken. It is the keyboard's route off the field (UI §6).
 */

/** Openers and the closer each one pairs with. */
const PAIRS: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };

const CLOSERS = new Set(Object.values(PAIRS));

/**
 * The characters an opener may sit in front of and still be paired: CodeMirror's
 * `closeBrackets` default `before` set, which is what Obsidian's editor runs.
 * Before a word character the opener goes in alone, so `[` typed in front of an
 * existing word does not produce `[]word`.
 */
const PAIRS_BEFORE = new Set([')', ']', '}', ':', ';', '>']);

/**
 * Characters that wrap a selection and do nothing else. Replacing a selection
 * with one of these would destroy the text the reader had just chosen, which
 * is the case worth answering; a bare caret gets the character alone.
 */
const WRAPS_ONLY = new Set(['*', '_', '`']);

/** A pair this binding inserted, as offsets of its two characters. */
interface TrackedPair {
	open: number;
	close: number;
}

/** A replaced range and what replaced it, in offsets of the value before. */
interface Change {
	from: number;
	to: number;
	inserted: number;
}

export function bindMarkdownTyping(textarea: HTMLTextAreaElement): void {
	/**
	 * The pairs whose closer a typed closer steps over. Mapped through every
	 * change to the value, the binding's own and the browser's alike, the way
	 * `closeBrackets`' state field is: typing a name inside `[[|]]` is an edit
	 * too, and dropping the pairs on it would make `]]` produce `[[Name]]]]`.
	 */
	let pairs: TrackedPair[] = [];
	/** The value every tracked offset is an offset into. */
	let seen = textarea.value;
	/**
	 * Where the next change starts, where it is known before it happens: the
	 * binding's own edit, or the selection a browser edit is about to replace.
	 * A prefix-and-suffix diff alone cannot place an edit inside a run of equal
	 * characters — `[` typed into `[[` could be either — and a closer offset
	 * inside such a run would shift by the wrong side of it.
	 */
	let expected: Change | null = null;
	let expectedStart: number | null = null;

	const diff = (before: string, after: string): Change => {
		const shorter = Math.min(before.length, after.length);
		let prefix = 0;
		while (prefix < shorter && before[prefix] === after[prefix]) prefix++;
		if (expectedStart !== null) prefix = Math.min(prefix, expectedStart);
		let suffix = 0;
		while (
			suffix < shorter - prefix &&
			before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
		)
			suffix++;
		return {
			from: prefix,
			to: before.length - suffix,
			inserted: after.length - suffix - prefix,
		};
	};

	/** Bring every tracked offset up to date with the value as it now reads. */
	const sync = () => {
		const now = textarea.value;
		if (now === seen) return;
		const change =
			expected !== null &&
			seen.length - (expected.to - expected.from) + expected.inserted ===
				now.length
				? expected
				: diff(seen, now);
		expected = null;
		expectedStart = null;
		seen = now;
		const shift = change.inserted - (change.to - change.from);
		const covered = (at: number) => at >= change.from && at < change.to;
		const moved = (at: number) => (at >= change.to ? at + shift : at);
		pairs = pairs
			.filter((pair) => !covered(pair.open) && !covered(pair.close))
			.map((pair) => ({ open: moved(pair.open), close: moved(pair.close) }));
	};

	/**
	 * Replace `[from, to)` with `text` through the one call that keeps undo,
	 * then put the selection where the edit leaves it. False where the call is
	 * missing or refused, with the reader's selection put back, so the caller
	 * leaves the event to the browser.
	 */
	const replace = (
		from: number,
		to: number,
		text: string,
		selectStart: number,
		selectEnd = selectStart,
	): boolean => {
		const doc = textarea.ownerDocument;
		const { selectionStart, selectionEnd, selectionDirection } = textarea;
		sync();
		textarea.setSelectionRange(from, to);
		expected = { from, to, inserted: text.length };
		expectedStart = from;
		let done = false;
		try {
			done =
				typeof doc.execCommand === 'function' &&
				doc.execCommand('insertText', false, text);
		} catch {
			done = false;
		}
		if (!done) {
			expected = null;
			expectedStart = null;
			textarea.setSelectionRange(
				selectionStart,
				selectionEnd,
				selectionDirection ?? undefined,
			);
			return false;
		}
		// The browser reports its own edit through `input`, which has usually
		// synced already; this covers the one that does not.
		sync();
		textarea.setSelectionRange(selectStart, selectEnd);
		return true;
	};

	const onText = (data: string, start: number, end: number): boolean => {
		if (data.length !== 1) return false;
		const value = textarea.value;
		if (start !== end) {
			const closer = PAIRS[data] ?? (WRAPS_ONLY.has(data) ? data : null);
			if (closer === null) return false;
			// The selection stays on the text, so a second `*` makes `**text**`.
			return replace(
				start,
				end,
				data + value.slice(start, end) + closer,
				start + 1,
				end + 1,
			);
		}
		if (CLOSERS.has(data) && value[start] === data) {
			const pair = pairs.find((p) => p.close === start);
			if (pair === undefined) return false;
			pairs = pairs.filter((p) => p !== pair);
			// A caret move rather than an edit, so there is nothing to refuse.
			textarea.setSelectionRange(start + 1, start + 1);
			return true;
		}
		const closer = PAIRS[data];
		if (closer === undefined) return false;
		const next = value[start];
		if (next !== undefined && !/\s/.test(next) && !PAIRS_BEFORE.has(next))
			return false;
		if (!replace(start, start, data + closer, start + 1)) return false;
		pairs.push({ open: start, close: start + 1 });
		return true;
	};

	const onBackspace = (start: number, end: number): boolean => {
		if (start !== end || start === 0) return false;
		const value = textarea.value;
		// Any adjacent matching pair, tracked or not: `closeBrackets`'
		// `deleteBracketPair` asks nothing about who typed it.
		const opener = value[start - 1] ?? '';
		if (PAIRS[opener] === undefined || value[start] !== PAIRS[opener])
			return false;
		return replace(start - 1, start + 1, '', start - 1);
	};

	textarea.addEventListener('beforeinput', (event: InputEvent) => {
		// An IME composing text owns its keystrokes.
		if (event.isComposing) return;
		const { selectionStart: start, selectionEnd: end } = textarea;
		let handled = false;
		switch (event.inputType) {
			case 'insertText':
				handled = onText(event.data ?? '', start, end);
				break;
			case 'deleteContentBackward':
				handled = onBackspace(start, end);
				break;
		}
		if (handled) {
			event.preventDefault();
			return;
		}
		// The browser's own edit is about to replace the selection, which is
		// where the diff on `input` should look for it.
		expectedStart = Math.min(start, end);
		// And a pair inside that selection is covered now, not when the diff
		// sees it: `)` typed over a selected `)` leaves the value as it was, so
		// no diff ever would. Not for undo or redo, which replace whatever the
		// history holds rather than the selection; the diff maps those.
		if (start !== end && !event.inputType.startsWith('history')) {
			const covered = (at: number) => at >= start && at < end;
			pairs = pairs.filter(
				(pair) => !covered(pair.open) && !covered(pair.close),
			);
		}
	});
	textarea.addEventListener('input', sync);
	// Leaving a pair ends it: a closer typed later, somewhere else, is the
	// reader's own. Listened for on the field rather than the document, so
	// nothing outlives the element when the sheet rebuilds.
	textarea.addEventListener('selectionchange', () => {
		sync();
		const { selectionStart: start, selectionEnd: end } = textarea;
		pairs = pairs.filter((pair) => start >= pair.open + 1 && end <= pair.close);
	});
	// Escape restores by assigning `value` and then blurs, which is the one
	// change no `input` reports — so a blur, and a focus after it, start over.
	const reset = () => {
		pairs = [];
		seen = textarea.value;
		expected = null;
		expectedStart = null;
	};
	textarea.addEventListener('blur', reset);
	textarea.addEventListener('focus', reset);
}
