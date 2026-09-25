/*
 * An `execCommand('insertText')` for a document that has none.
 *
 * happy-dom 20 implements no `execCommand`, and `interaction/markdown-typing.ts`
 * writes every edit through it, because it is the one call that joins a
 * textarea's native undo stack (docs/features/prose-field-editing.md). Without
 * this the module's every insertion would report failure and leave the
 * keystroke to a browser the test DOM does not simulate, so nothing past the
 * fallback could be driven.
 *
 * The shim does what the browser's editing path does to a text control, and no
 * more: it replaces the focused control's selection with the text, collapses
 * the caret after it, and dispatches `input`. It does not fire a nested
 * `beforeinput`, which the Chrome probe showed the real call does not either.
 * The native undo stack itself is not simulated; the probe is the evidence for
 * that, and what a test can assert is that every write went through here.
 *
 * It installs on the document it is handed, which a test takes from the field's
 * own `ownerDocument`, so a call that reached for a different realm's document
 * finds no shim and records nothing. `calls` holds each call with the document
 * it arrived on. `result: false` makes the call refuse without editing, which
 * is the not-lost fallback's case, and `throws: true` makes it throw, which is
 * the same fallback reached through the module's `catch`; to test a missing
 * call, do not install.
 *
 * `writing` is true while the shim itself assigns the control's `value`, so a
 * test watching that setter can tell the browser's edit from a module that
 * bypassed it, without wrapping the shim in a second `execCommand`.
 *
 * The one spelling of this shim (PATTERNS §10): both prose-field consumers'
 * test files use it.
 */

export interface ExecCommandCall {
	command: string;
	value: string | undefined;
	doc: Document;
}

export interface ExecCommandShim {
	/** Every call, in order, whether or not it edited. */
	calls: ExecCommandCall[];
	/** True only while the shim is assigning the control's `value`. */
	writing: boolean;
	/** Removes the shim, leaving the document as it was found. */
	restore: () => void;
}

const KEY = 'execCommand';

export function installExecCommand(
	doc: Document,
	options: { result?: boolean; throws?: boolean } = {},
): ExecCommandShim {
	const calls: ExecCommandCall[] = [];
	const shim: ExecCommandShim = {
		calls,
		writing: false,
		restore: () => {
			if (had) target[KEY] = previous;
			else delete target[KEY];
		},
	};
	// Reached through an untyped view: the DOM's `Document` type declares
	// the member, deprecated, which is the lint the module under test is
	// scoped out of and this file has no reason to be.
	const target = doc as unknown as Record<string, unknown>;
	const had = Object.prototype.hasOwnProperty.call(target, KEY);
	const previous = target[KEY];

	target[KEY] = (command: string, _ui?: boolean, value?: string): boolean => {
		calls.push({ command, value, doc });
		if (options.throws === true) throw new Error('execCommand failed');
		if (options.result === false || command !== 'insertText') return false;
		const control = doc.activeElement;
		if (
			!(control instanceof doc.defaultView!.HTMLTextAreaElement) &&
			!(control instanceof doc.defaultView!.HTMLInputElement)
		)
			return false;
		const text = value ?? '';
		const start = control.selectionStart ?? control.value.length;
		const end = control.selectionEnd ?? start;
		shim.writing = true;
		try {
			control.value =
				control.value.slice(0, start) + text + control.value.slice(end);
		} finally {
			shim.writing = false;
		}
		const caret = start + text.length;
		control.setSelectionRange(caret, caret);
		const InputEventCtor = doc.defaultView!.InputEvent;
		control.dispatchEvent(
			new InputEventCtor('input', {
				bubbles: true,
				inputType: 'insertText',
				data: text,
			}),
		);
		return true;
	};

	return shim;
}
