/*
 * The type-ahead on a formula input in the layout editor pane.
 *
 * One job: bind Obsidian's own `AbstractInputSuggest` to one `<input>`, answer
 * its queries from `formula/completion.ts` and `formula/vocabulary.ts`, and
 * splice an accepted name over the fragment under the caret. It knows no
 * component, reads no layout of its own — the vocabulary arrives as a thunk —
 * and writes no file: an accept is an edit to an input, and the field's own
 * `change` commit (`field-commit.ts`) remains the one thing that writes.
 *
 * **The platform's own class rather than a panel of this plugin's**, because it
 * already answers the four things a hand-rolled popup gets subtly wrong —
 * placement at the notice layer, flipping and clamping against the window,
 * repositioning on scroll, and a keymap scope that owns the arrows and Escape
 * only while it is open. Four costs come with it and each is handled here or
 * accepted in the feature doc: no teardown (nothing survives a pane rebuild, and
 * the render loop closes what it bound), a press on the popup's own padding
 * blurs and commits (accepted — it is what a press anywhere else already does),
 * no way to ask whether it is open (nothing here asks), and no ARIA on the popup
 * (`aria-autocomplete="list"` on the input is the honest half, and the rest is a
 * backlog row).
 *
 * **Nothing is offered unsolicited.** The class calls `getSuggestions` on
 * `focus` as well as on `input`, with no way to tell the two apart from inside,
 * so the binding registers its own listeners on the element *before*
 * constructing it — listeners fire in registration order — and keeps one flag.
 * A field tabbed into does not pop a list over the text the author was reading;
 * it pops when they type.
 */

import { AbstractInputSuggest, App } from 'obsidian';
import { Completion, completionAt } from '../formula/completion';
import {
	Candidate,
	candidatesAt,
	matchCandidates,
	Vocabulary,
} from '../formula/vocabulary';

/**
 * Whether the author has asked for a list, and whether an accept is in flight.
 *
 * Held outside the class because the listeners that write it are registered
 * before the class exists, which is the whole of how "nothing on focus" is
 * achieved. `accepting` is the second half of the same problem: the splice
 * dispatches `input` so anything watching the field sees the edit, and without
 * this the binding's own `input` listener would read that as the author asking
 * for a list again and the popup would reopen over the name just accepted.
 */
interface SuggestState {
	armed: boolean;
	accepting: boolean;
}

/** The suggester on one formula input. */
export class FormulaSuggest extends AbstractInputSuggest<Candidate> {
	/**
	 * Where the last answered query said the fragment was.
	 *
	 * Read again at the accept rather than recomputed, so the splice replaces
	 * exactly the range the offer was made about. Recomputing would be a second
	 * reading of a caret that may since have moved.
	 */
	private fragment: Completion | null = null;

	constructor(
		app: App,
		private readonly input: HTMLInputElement,
		private readonly vocabulary: () => Vocabulary,
		private readonly state: SuggestState,
		/**
		 * The component whose own row vocabulary this field reads first — a
		 * computed column's **Formula**, which is evaluated once per row. Absent
		 * on every field evaluated against the sheet.
		 */
		private readonly owner?: string,
	) {
		super(app, input);
	}

	/**
	 * The platform hands over the whole input value, so the fragment is resolved
	 * here from the caret instead. An empty answer closes the popup, which is how
	 * every refusal in `completionAt` reaches the screen.
	 */
	protected getSuggestions(): Candidate[] {
		// **Both flags, and `accepting` is the one that is easy to leave out.**
		// The class reads its suggestions *synchronously* at the top of the
		// handler and opens the popup a microtask later, so disarming after the
		// accept's own `input` dispatch is too late: the answer has already been
		// taken, and the list reopens over the name just written.
		if (this.state.accepting || !this.state.armed) return [];
		const caret = this.input.selectionStart ?? this.input.value.length;
		const fragment = completionAt(this.input.value, caret);
		this.fragment = fragment;
		if (fragment === null) return [];
		return matchCandidates(
			candidatesAt(this.vocabulary(), fragment, this.owner),
			fragment.prefix,
		);
	}

	/**
	 * The name in code type, with the owner underneath in the app's own
	 * secondary rank — which is where this feature's copy budget is spent, a
	 * label per name on demand rather than a fifth line under a field.
	 *
	 * **`mod-complex` and `suggestion-content` are load bearing, not
	 * decoration.** Obsidian styles `.suggestion-note` in exactly one place, and
	 * it is `.suggestion-item.mod-complex .suggestion-note` — the `0.8em` and
	 * the `--text-muted` that make it *secondary* live there and nowhere else.
	 * An item without the class draws its note at the item's own size and
	 * colour, so a name and its owner come out as two identical lines: not a
	 * name and a label but two names, six times over on a members list. The
	 * column layout the two children need is on `.suggestion-content` under the
	 * same class, and `mod-complex` is what makes the item the flex row that
	 * expects it.
	 *
	 * Worth the paragraph because nothing here could have caught it. The popup
	 * is the app's chrome, so no rule of this plugin's was missing; the harness
	 * painted it correctly for a whole wave from a fallback of its own that was
	 * *less* specific than the app's real rule and so matched where the app
	 * matches nothing (`docs/UI.md` §11).
	 */
	renderSuggestion(value: Candidate, el: HTMLElement): void {
		el.addClass('mod-complex');
		const content = el.createDiv('suggestion-content');
		content.createEl('code', {
			cls: ['sheetsmith-suggestion-name', 'suggestion-title'],
			text: value.name,
		});
		content.createDiv({ cls: 'suggestion-note', text: value.note });
	}

	/**
	 * Splice the name over the fragment and close.
	 *
	 * **`setRangeText` and a dispatched `input`, and the reason is a
	 * measurement.** The design argued for `document.execCommand('insertText')`
	 * on the claim that Chromium resets an input's change-tracking baseline on a
	 * programmatic write, so a name accepted this way and followed by Enter would
	 * fire no `change` and the layout would silently not be written. Measured in
	 * Obsidian's own renderer (Chromium 142) over real key events: after any user
	 * edit at all — which is the only state this popup can be open in, since an
	 * empty fragment offers nothing — all three of `value =`, `setRangeText` and
	 * `execCommand` fire exactly one `change` on Enter and one on blur. The
	 * baseline reset is real but reachable only where the *whole* value came from
	 * the write and the author never typed, which no accept can be.
	 *
	 * So the deprecated call buys nothing, and what the standard one buys is that
	 * production and the tests drive the same path — `execCommand` is absent from
	 * the test DOM, so it would have shipped a branch no case here could reach.
	 *
	 * **The range and not the whole value**, which is the pain point this feature
	 * exists downstream of: an insertion that replaced the field would take the
	 * `)` and the `floor(` beside it with the name.
	 */
	selectSuggestion(value: Candidate): void {
		const fragment = this.fragment;
		if (fragment === null) {
			this.close();
			return;
		}
		this.state.accepting = true;
		this.input.setRangeText(value.insert, fragment.start, fragment.end, 'end');
		// The caret lands after the inserted text. `'end'` above is specified to
		// do exactly this and Chromium does, but the test DOM puts it at the end
		// of the whole *value* instead — so the claim is stated rather than
		// inherited, which also makes it something a case can assert.
		const caret = fragment.start + value.insert.length;
		this.input.setSelectionRange(caret, caret);
		/*
		 * **The global `Event`, and it is the only bare global constructor left
		 * in `src/`.** `PATTERNS.md` §5 asks for the element's own `window`, and
		 * a popout pane is a second realm where the two differ — but nothing
		 * here does an `instanceof Event`, so there is no failure to name, and
		 * every spelling of the rule was tried and refused: `this.input.win` is
		 * typed `Window`, which declares no constructors (the gap §5 already
		 * records for `prefer-create-el`'s own suggestion); casting past that
		 * trips `obsidianmd/no-global-this`, which under `--max-warnings 0`
		 * fails the build; `activeWindow` has the same typing and is not in the
		 * stub; and `ownerDocument.defaultView` is nullable with nothing to bail
		 * to but this. `docs/BACKLOG.md` § Patterns holds the row.
		 */
		this.input.dispatchEvent(new Event('input', { bubbles: true }));
		this.state.accepting = false;
		// Disarmed rather than merely closed: the dispatch above reaches the
		// class's own `input` listener, which would otherwise reopen the list
		// over the name just accepted. The author reopens it by typing.
		this.state.armed = false;
		this.close();
	}
}

/**
 * Bind the suggester to a formula input.
 *
 * `vocabulary` is a thunk, read on every query, so the list reflects the layout
 * as the pane last rendered it and nothing rebuilds the name tree on every
 * keystroke of every field.
 *
 * The returned handle is for one thing only: closing. An input removed while its
 * popup is open fires no `blur` — a removed focused element does not — so a
 * redraw driven from the keyboard would orphan the list at the notice layer, and
 * the render loop closes what it bound.
 */
export function attachFormulaSuggest(
	app: App,
	input: HTMLInputElement,
	vocabulary: () => Vocabulary,
	owner?: string,
): FormulaSuggest {
	const state: SuggestState = { armed: false, accepting: false };
	// Before the class is constructed, so these run first: `focus` disarms and
	// `input` arms, and the class's own handler for each then finds the flag
	// already saying which of the two it is.
	input.addEventListener('focus', () => {
		state.armed = false;
	});
	input.addEventListener('input', () => {
		if (!state.accepting) state.armed = true;
	});
	input.addEventListener('blur', () => {
		state.armed = false;
	});

	const suggest = new FormulaSuggest(app, input, vocabulary, state, owner);

	// An honest statement about the input's own behaviour: a list of completions
	// may appear. Deliberately not `aria-expanded` or `aria-controls`, which
	// would be claims about a popup the platform exposes no handle to
	// (`docs/BACKLOG.md` § Patterns).
	input.setAttribute('aria-autocomplete', 'list');

	// A caret move that is not typing leaves the list talking about text the
	// caret has left. Up and Down are the popup's own while it is open, so only
	// the horizontal pair and a press inside the field reach this.
	input.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			state.armed = false;
			suggest.close();
		}
	});
	input.addEventListener('pointerdown', () => {
		state.armed = false;
		suggest.close();
	});

	return suggest;
}
