/*
 * The type-ahead on a picture's reference field.
 *
 * One job: bind Obsidian's own `AbstractInputSuggest` to a picture's field,
 * answer its queries from the vault's own file list, and write the embed a
 * reader would have got from dragging the file in or pasting it, on a
 * selection. It knows no component and writes no note itself: an accept is a
 * commit through the field's own `EditableHandle`, which is what
 * `picture-frame.ts` already uses for every other edit to this field
 * (`docs/features/picture-fit-and-suggest.md`).
 *
 * **Simpler than `editor/formula-suggest.ts`'s `FormulaSuggest`, and worth
 * saying why.** That class resolves a *fragment* under the caret, because a
 * formula field's value is an expression the accepted name is spliced into.
 * This field's whole value *is* the reference — there is nothing beside it to
 * preserve — so `getSuggestions` reads the query the platform already hands
 * it and there is no caret to track, no splice, and no "armed" state to keep a
 * popup from opening on a `focus` it did not ask for: opening immediately on
 * focus is the right behaviour here, since focusing this field is always the
 * reader asking to replace its whole value (`picture-frame.ts`'s own click
 * handler selects the text on the way in), never merely arriving to read
 * something else.
 *
 * **The platform's own class, not a panel of this plugin's**, for the reasons
 * `formula-suggest.ts`'s header already gives in full — placement, flipping,
 * repositioning on scroll and a keymap scope are all the app's — and it is not
 * repeated here.
 *
 * **Every vault file, not only recognised image extensions — a correction
 * from the feature's own draft.** The proposal there was a fixed image
 * extension list, on the reasoning that anything else is certain to fail the
 * picture frame's own draw. Built against `image.ts`'s own repository-wide
 * guard (`image.test.ts`'s "holds no extension list anywhere in `src/`"), that
 * turns out to be exactly the shape the guard exists to catch: a plugin
 * deciding for itself which formats count, which is how webp came to render
 * outside a component and not inside it. Obsidian's own `![[` suggester does
 * not filter by type either — any file can be embedded, a note included — so
 * this is the more faithful behaviour as well as the one the guard allows: a
 * reader who picks a non-picture meets the same "is not a picture" refusal a
 * mistyped one already would.
 */

import { AbstractInputSuggest, App, TFile } from 'obsidian';

/**
 * The filename a reader is typing, stripped of the embed brackets and any
 * size or alias segment after a `|` — so suggestions still match while editing
 * an existing reference, `![[Thora.png` and `Thora` alike.
 */
function typedName(query: string): string {
	let text = query.trim();
	if (text.startsWith('![[')) text = text.slice(3);
	else if (text.startsWith('[[')) text = text.slice(2);
	if (text.endsWith(']]')) text = text.slice(0, -2);
	const pipe = text.indexOf('|');
	return (pipe === -1 ? text : text.slice(0, pipe)).trim();
}

/** The suggester on one picture's reference field. */
export class FileSuggest extends AbstractInputSuggest<TFile> {
	constructor(
		app: App,
		input: HTMLInputElement,
		private readonly commit: (next: string) => void,
		/**
		 * The character note's own path, so a relative link format resolves
		 * against the note the picture is actually in rather than the vault
		 * root — the same value `sheet-view.ts` already computes for
		 * `linkContext` and `markdown.begin`.
		 */
		private readonly sourcePath: string,
	) {
		super(app, input);
	}

	protected getSuggestions(query: string): TFile[] {
		const needle = typedName(query).toLowerCase();
		const files = this.app.vault.getFiles();
		return needle === ''
			? files
			: files.filter((file) => file.name.toLowerCase().includes(needle));
	}

	/**
	 * The name in the app's own title rank, the folder underneath it where the
	 * file is not at the vault's root — `formula-suggest.ts`'s `mod-complex`
	 * argument applies verbatim: without it, the name and its folder draw at
	 * one size and one colour, which reads as two names rather than a name and
	 * its place.
	 */
	renderSuggestion(file: TFile, el: HTMLElement): void {
		const folder = file.parent !== null && file.parent.path !== '/' ? file.parent.path : '';
		if (folder === '') {
			el.createSpan({ text: file.name });
			return;
		}
		el.addClass('mod-complex');
		const content = el.createDiv('suggestion-content');
		content.createDiv({ cls: 'suggestion-title', text: file.name });
		content.createDiv({ cls: 'suggestion-note', text: folder });
	}

	/**
	 * Write the reference Obsidian's own paste or drag-and-drop would have
	 * produced, and commit it through the field's own gesture.
	 *
	 * `generateMarkdownLink` rather than a reference assembled here: the text a
	 * reader gets from picking a suggestion is then identical to the text they
	 * would get pasting the file in directly, embed brackets included, and it
	 * already answers the reader's own **Use \[\[Wikilinks\]]** and shortest-path
	 * settings rather than this plugin inventing a second opinion about either.
	 */
	selectSuggestion(file: TFile): void {
		const link = this.app.fileManager.generateMarkdownLink(file, this.sourcePath);
		this.setValue(link);
		this.commit(link);
		this.close();
	}
}

/** Bind the suggester to a picture's reference field. */
export function attachFileSuggest(
	app: App,
	input: HTMLInputElement,
	commit: (next: string) => void,
	sourcePath: string,
): FileSuggest {
	const suggest = new FileSuggest(app, input, commit, sourcePath);
	// An honest statement about the field's own behaviour, `formula-suggest.ts`'s
	// own reasoning: a list of completions may appear, and neither
	// `aria-expanded` nor `aria-controls` is offered, since the platform gives
	// this module no handle on whether its popup is open.
	input.setAttribute('aria-autocomplete', 'list');
	return suggest;
}
