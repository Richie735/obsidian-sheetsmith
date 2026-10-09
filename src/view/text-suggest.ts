/*
 * The type-ahead on a free-text field that names a group
 * (`docs/features/free-text-group-key.md`).
 *
 * One job: bind Obsidian's own `AbstractInputSuggest` to one text field, offer
 * the names it was handed that contain what is typed, and commit a pick through
 * the field's own gesture. It knows no component, reads no note and holds no
 * list of its own: the names arrive as an argument, which is what lets a Record
 * set decide that its groups' first-seen spellings are what is on offer without
 * this module learning that a group exists.
 *
 * **`file-suggest.ts`'s seam and `formula-suggest.ts`'s rule, and which one
 * governs the opening.** A picture's reference opens on focus because focusing
 * it is always the reader asking to replace the whole value. A group name does
 * not: a reader tabs into it to *read* a class, and a popup over the text they
 * were reading is the failure `formula-suggest.ts` argues against. So the class's
 * own `focus` and `input` refreshes are told apart the way that module does,
 * through `ui/arm-on-typing.ts`, which both modules share: typing arms the one
 * flag, focus and blur disarm it, a caret move or a press inside the field
 * disarms and closes, and nothing is offered while it is down. A pick disarms it
 * too, so the popup is not reopened over the name just chosen.
 *
 * **Matching is the grouping's own** (`groupMatchKey`): a substring of the match
 * key, so `blood` finds `Blood Hunter` whatever case either was typed in. It
 * offers a name even when its match key is what is typed, because the pick is
 * what chooses the *spelling*; only a name identical to what is in the field,
 * character for character, is left out, since offering a field its own value says
 * nothing.
 *
 * Nothing here prevents a typo. It makes the correct name one pick away.
 */

import { AbstractInputSuggest, App } from 'obsidian';
import { groupMatchKey } from '../parse/record-groups';
import { armOnTyping } from '../ui/arm-on-typing';

/** Whether the reader has asked for a list, which only typing does. */
interface SuggestState {
	armed: boolean;
}

/** The suggester on one text field. */
export class TextSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		input: HTMLInputElement,
		private readonly names: readonly string[],
		private readonly commit: (next: string) => void,
		private readonly state: SuggestState,
	) {
		super(app, input);
	}

	protected getSuggestions(query: string): string[] {
		if (!this.state.armed) return [];
		const needle = groupMatchKey(query);
		const typed = query.trim();
		return this.names.filter(
			(name) =>
				name !== typed &&
				(needle === '' || groupMatchKey(name).includes(needle)),
		);
	}

	renderSuggestion(name: string, el: HTMLElement): void {
		el.createSpan({ text: name });
	}

	/**
	 * Fill the field and commit it through the field's own gesture. Disarmed
	 * first, so nothing the commit does can reopen the list over the pick.
	 */
	selectSuggestion(name: string): void {
		this.state.armed = false;
		this.setValue(name);
		this.commit(name);
		this.close();
	}
}

/** Bind the suggester to a text field, offering `names`. */
export function attachTextSuggest(
	app: App,
	input: HTMLInputElement,
	names: readonly string[],
	commit: (next: string) => void,
): TextSuggest {
	const state: SuggestState = { armed: false };
	// Before the class is constructed, so its own handlers find the flag set.
	const closeOnCaretMove = armOnTyping(input, state);
	const suggest = new TextSuggest(app, input, names, commit, state);
	closeOnCaretMove(suggest);
	// The honest half of the ARIA the platform lets this module state: a list of
	// completions may appear. No `aria-expanded` or `aria-controls`, which would
	// be claims about a popup this module has no handle on
	// (`docs/BACKLOG.md` § Patterns, the suggestion popup's row).
	input.setAttribute('aria-autocomplete', 'list');
	return suggest;
}
