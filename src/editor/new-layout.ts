/*
 * Starting a new layout: a blank grid, an existing layout, or pasted JSON
 * (`docs/features/starting-a-new-layout.md`).
 *
 * **One gesture with three sources, not three controls.** Duplicate is not a
 * file operation beside create; it is create *with a source*, and so is import.
 * What that buys is one place that enumerates which sources exist — derived,
 * `hasLayouts` deciding whether there is a layout to copy — where two controls
 * would need the empty-folder state to list them a second time
 * (`docs/PATTERNS.md` §1's policy tier).
 *
 * **What it is not: a writer.** Every arm goes through `startLayout` in
 * `src/layouts.ts`, which owns the branch, the ordering that parses before it
 * writes, the refusals and the sentence a write announces. This module is a
 * form: three boxes, which one is on screen, and what to do with each arm of
 * the one answer it gets back. In particular **the copy arm hands over a
 * basename and reads no file**, which is what makes "a copy reads the source's
 * file rather than editor state" a guarantee of the writer rather than a habit
 * of the surface.
 *
 * No sheet UI and no CSS of its own: a `Modal` of `Setting` rows and a
 * `Notice`, which is Obsidian's own chrome throughout, so `docs/UI.md`'s
 * vocabulary and the `.sheetsmith-view` scope are untouched. Two existing class
 * names are borrowed on the **Start from** row, and `docs/UI.md` §9 requires
 * rather than permits them — see that row below.
 *
 * **The modal lives beside its one consumer rather than in `src/ui/`**, which is
 * `ConfirmModal`'s, `NameModal`'s and `StarterModal`'s shared precedent: one
 * consumer earns no generalisation (`docs/PATTERNS.md` §1). It grew out of
 * `layout-import.ts`, whose paste box, refusal behaviour and whole argument are
 * one of the three sources now.
 */

import {
	App,
	ButtonComponent,
	Modal,
	Notice,
	Setting,
	TextComponent,
} from 'obsidian';
import { describedRow } from './described-row';
import {
	hasLayouts,
	LayoutSource,
	listLayouts,
	nameRequiredFor,
	startLayout,
	suggestCopyName,
} from '../layouts';

/**
 * The gesture's name, in one place.
 *
 * Three sites read it — the **Layout file** row's button, the vacant state's
 * CTA, and this modal's own title — and two literals is the drift
 * `docs/PATTERNS.md` §1's one-step tier is about: the only thing a guard test
 * over them could assert is that they still read the same, which is what one
 * name says for free. It lives here rather than in the pane because the modal
 * is the thing being named.
 */
export const NEW_LAYOUT_LABEL = 'New layout';

/** Which of the three sources the form is currently offering. */
type SourceKind = 'blank' | 'copy' | 'paste';

/**
 * What each source does, under the dropdown that chose it.
 *
 * The **Add component** row's own `describe` mechanism: a menu line is two or
 * three words, and what a source actually *does* — that a copy leaves the
 * original alone, that a paste is checked before anything is written — has to be
 * on screen rather than only in this file. `docs/PATTERNS.md` §8's rule for a
 * config field's description read on a modal: the consequence, not a
 * restatement of the label.
 */
const SOURCE_DESCRIPTIONS: Record<SourceKind, string> = {
	blank: 'The new layout starts empty, on a six-column grid.',
	copy: 'The new layout starts as a copy of the one you choose. Editing it never touches the original.',
	paste:
		'The new layout is read from the JSON you paste, and checked before anything is written. Leave the name below empty to use the one inside it.',
};

/**
 * How many of these have been opened, which is what makes the description's id
 * per instance.
 *
 * The pane's `ADD_DESCRIPTION_ID` is a module literal and safe where it lives,
 * because a redraw replaces the whole container so only one element ever
 * carries it. A modal is a different lifetime — opened, closed and opened
 * again — and two elements sharing an id point a reader's screen reader at the
 * wrong description with nothing on screen to show it.
 */
let opened = 0;

/**
 * Ask what the new layout starts from and what it is called, write it, and hand
 * back the name it landed under.
 *
 * Exported as a function rather than the class, on `chooseStarterLayout`'s own
 * argument: the caller names a gesture and not a constructor, and the modal
 * stays this module's own.
 *
 * `openLayout` is what **Layout to copy** prefills to, because the layout the
 * author is looking at is the one they are most likely to be copying; `null` is
 * a pane with nothing open, which prefills to the first. `onCreated` is handed
 * the name the *file* landed under, asked for rather than re-derived: only the
 * write knows whether the box or the source decided it.
 *
 * **There is no `onCancel`.** The dropdown-as-verb needed one — choosing a
 * sentinel option left the `<select>` showing the wrong value, so cancelling had
 * to redraw the pane purely to snap it back — and a button press changes no
 * `<select>` value, so the whole mechanism goes.
 */
export function promptNewLayout(
	app: App,
	folder: string,
	openLayout: string | null,
	onCreated: (name: string) => void,
): void {
	new NewLayoutModal(app, folder, openLayout, onCreated).open();
}

class NewLayoutModal extends Modal {
	private folder: string;
	private openLayout: string | null;
	private onCreated: (name: string) => void;

	/** Which source is chosen, and the three boxes as they stand. */
	private source: SourceKind = 'blank';
	private copyOf = '';
	private text = '';
	private name = '';
	/**
	 * Whether the reader has typed in **Name**.
	 *
	 * The box is either theirs or the tool's, and once it is theirs it is never
	 * taken back: a later prefill is skipped rather than merged, and a source
	 * switch leaves it alone. Without the flag the two rules this form needs —
	 * refill on a new source, never overwrite what was typed — contradict each
	 * other.
	 */
	private nameTouched = false;

	private nameField: TextComponent | null = null;
	private create: ButtonComponent | null = null;
	/** The two source rows, held so the unused one can be hidden. */
	private copyRow: HTMLElement | null = null;
	private pasteRow: HTMLElement | null = null;

	constructor(
		app: App,
		folder: string,
		openLayout: string | null,
		onCreated: (name: string) => void,
	) {
		super(app);
		this.folder = folder;
		this.openLayout = openLayout;
		this.onCreated = onCreated;
	}

	onOpen(): void {
		this.titleEl.setText(NEW_LAYOUT_LABEL);
		// **No `data-sheetsmith-focus` on anything here**, and the absence is
		// deliberate: that attribute is the pane's focus-restoration vocabulary,
		// resolved by `focus-token.ts` to put an author back on the control a
		// *rebuild* replaced. A modal is built once in `onOpen` and emptied in
		// `onClose`, so nothing ever resolves one — it would be a test selector
		// wearing a production name, and the next reader could not tell which
		// tokens are live addresses. A case addresses these fields by their
		// row's name, which is what a reader chooses them by.

		const layouts = listLayouts(this.app, this.folder).map(
			(file) => file.basename,
		);
		// The one the author is looking at, or the first where the pane has
		// nothing open. A name the folder no longer holds falls through to the
		// same place, because a dropdown cannot show it.
		this.copyOf =
			this.openLayout !== null && layouts.includes(this.openLayout)
				? this.openLayout
				: (layouts[0] ?? '');

		this.renderSourceRow();
		this.renderCopyRow(layouts);
		this.renderPasteRow();
		this.renderNameRow();
		this.renderButtons();

		this.showChosenSource();
		this.refreshCreate();
	}

	private renderSourceRow(): void {
		const row = new Setting(this.contentEl).setName('Start from');
		/*
		 * `docs/UI.md` §9's settled rule, through the module that holds it
		 * (`editor/described-row.ts`): a settings row is one centred flex line,
		 * so copy growing in the info column squeezes the control the reader is
		 * reaching for — here **Create**. That rule's own words are that "the
		 * second settings row with growing copy reuses it rather than inventing
		 * a second answer", and this is that second row.
		 *
		 * **The id is generated per instance**, which is the one part of the
		 * treatment the two consumers cannot share: a modal can be opened,
		 * closed and opened again, where the pane's row is replaced whole by a
		 * redraw.
		 */
		opened += 1;
		const described = describedRow(
			row,
			`sheetsmith-new-layout-source-${opened}`,
			(value) => SOURCE_DESCRIPTIONS[value as SourceKind],
		);

		row.addDropdown((dropdown) => {
			dropdown.addOption('blank', 'A blank grid');
			// Only where there is a layout to copy, which is the **Add
			// component** row's own omission read one row over: "a dropdown
			// offering the sheet and nothing else says a layout has containers
			// when it has none". In the vacant state the predicate and the
			// branch agree by construction — that branch was reached *because*
			// this is false.
			if (hasLayouts(this.app, this.folder)) {
				dropdown.addOption('copy', 'An existing layout');
			}
			dropdown.addOption('paste', 'Pasted JSON');
			dropdown.setValue(this.source);
			described.describes(dropdown.selectEl);
			dropdown.onChange((value) => {
				this.chooseSource(value as SourceKind);
				described.describe(this.source);
			});
		});
		described.describe(this.source);
	}

	private renderCopyRow(layouts: string[]): void {
		// **Layout to copy** rather than **Layout**, which would read as a
		// second answer to the question the row above already asked.
		const row = new Setting(this.contentEl)
			.setName('Layout to copy')
			.addDropdown((dropdown) => {
				for (const name of layouts) dropdown.addOption(name, name);
				dropdown.setValue(this.copyOf);
				dropdown.onChange((value) => {
					this.copyOf = value;
					this.prefillName();
				});
			});
		this.copyRow = row.settingEl;
	}

	private renderPasteRow(): void {
		const row = new Setting(this.contentEl)
			.setName('Layout JSON')
			.addTextArea((area) => {
				// A few rows, deliberately: a real layout is 7-24KB and nobody
				// reads that in a textarea. It is a paste target, not an editor.
				area.setPlaceholder("Paste the layout's JSON here");
				area.inputEl.rows = 6;
				area.onChange((value) => {
					this.text = value;
					this.refreshCreate();
				});
			});
		this.pasteRow = row.settingEl;
	}

	private renderNameRow(): void {
		new Setting(this.contentEl)
			.setName('Name')
			/*
			 * The consequence rather than a restatement (`docs/PATTERNS.md`
			 * §8), and **only the consequence that holds for every source**.
			 * This row is the one static row in a per-source form, so a second
			 * sentence about what an empty box means on one of the three arms
			 * was dead advice on the other two — and it was the longest string
			 * in the modal by half again. The row immediately above owns the
			 * per-source copy, so the advice moved into
			 * `SOURCE_DESCRIPTIONS.paste`, beside the branch it is about.
			 */
			.setDesc(
				'What the file is called, and a name the folder already holds is refused rather than overwritten.',
			)
			.addText((text) => {
				this.nameField = text;
				text.onChange((value) => {
					// Typed, so the box is the reader's from here on.
					this.nameTouched = true;
					this.name = value;
					this.refreshCreate();
				});
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key !== 'Enter') return;
					event.preventDefault();
					// `NameModal`'s shipped Enter, carried over — and guarded on
					// exactly the condition that disables **Create**, so what
					// does not come with it is that modal's silent return on a
					// blank name.
					if (this.canCreate()) void this.attempt();
				});
				text.inputEl.focus();
			});
	}

	private renderButtons(): void {
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) => {
				this.create = button;
				button
					.setButtonText('Create')
					.setCta()
					.onClick(() => void this.attempt());
			});
	}

	/**
	 * Move to a source, and settle what that means for the other two boxes.
	 *
	 * The rows are hidden rather than rebuilt, so a 23KB paste survives a look
	 * at another source; the name is cleared only where the *tool* wrote it.
	 */
	private chooseSource(kind: SourceKind): void {
		this.source = kind;
		this.showChosenSource();
		if (kind === 'copy') this.prefillName();
		else this.clearPrefill();
		// The disabled rule is per source — a blank name blocks two arms and a
		// blank paste the third — so it is recomputed here and not only in the
		// inputs' own handlers. Otherwise a reader who left **Name** empty,
		// switched to **Pasted JSON** and pasted a layout meets a dead
		// **Create** for a gesture that would succeed.
		this.refreshCreate();
	}

	/**
	 * Only the chosen source's row is on screen, and `toggleVisibility` is the
	 * mechanism rather than `hidden`.
	 *
	 * `settingEl.hidden = true` leaves both rows visible in the app:
	 * Obsidian's `app.css` declares `.setting-item { display: flex }` at author
	 * level, which beats the UA sheet's `[hidden] { display: none }`, and no
	 * `[hidden]` rule anywhere puts it back. `toggleVisibility` writes an
	 * inline `display`, which wins over the class.
	 */
	private showChosenSource(): void {
		this.copyRow?.toggleVisibility(this.source === 'copy');
		this.pasteRow?.toggleVisibility(this.source === 'paste');
	}

	/** The tool's name for a copy, where the box is still the tool's. */
	private prefillName(): void {
		if (this.nameTouched || this.source !== 'copy' || this.copyOf === '') {
			return;
		}
		this.setName(suggestCopyName(this.app, this.folder, this.copyOf));
	}

	/**
	 * Take back a prefill nobody typed, when the source it was for is left.
	 *
	 * Otherwise `Cutter copy` sits in the box after a switch to **Pasted
	 * JSON**, where it would silently override the pasted layout's own name and
	 * contradict this row's own description. Costs nothing, because nobody
	 * typed it.
	 */
	private clearPrefill(): void {
		if (this.nameTouched) return;
		this.setName('');
	}

	/**
	 * Write the box without claiming it.
	 *
	 * `setValue` fires no `change`, in the app and in the double alike, which is
	 * what keeps `nameTouched` about the reader rather than about us.
	 */
	private setName(value: string): void {
		this.name = value;
		this.nameField?.setValue(value);
	}

	/**
	 * Whether the gesture can succeed as it stands.
	 *
	 * **Which sources need a name is `nameRequiredFor`'s**, not a second
	 * derivation of the same split: this used to key on the control's own
	 * `'paste'` while `startLayout` keyed on the shape of the source, and two
	 * copies of that could only ever be tested for still agreeing
	 * (`docs/PATTERNS.md` §1).
	 *
	 * The other two conditions are the *surface's* own and are duplicated
	 * nowhere. A blank paste is not a writer-side refusal at all — it ends in the
	 * parser's "not valid JSON", which is a true sentence and a pointless press —
	 * and a source dropdown with nothing in it can only end in the writer's
	 * "was not found", so neither is worth offering a live button for.
	 */
	private canCreate(): boolean {
		const source = this.chosenSource();
		// Unreachable while the option is offered only where `hasLayouts` holds,
		// and the guard is what makes the row safe by itself rather than by that
		// omission.
		if ('copyOf' in source && source.copyOf === '') return false;
		if (nameRequiredFor(source)) return this.name.trim() !== '';
		return this.text.trim() !== '';
	}

	/**
	 * A live button that silently does nothing is indistinguishable from a
	 * broken one — `NameModal`'s stated reason, and it reaches the paint here:
	 * Obsidian styles `button[disabled]` with `cursor: not-allowed` and
	 * `opacity: 0.7`, which a `.clickable-icon` has no rule for. So this is not
	 * the invisible-disabled state `docs/BACKLOG.md` is waiting on a ruling
	 * about.
	 */
	private refreshCreate(): void {
		this.create?.setDisabled(!this.canCreate());
	}

	/**
	 * Try it and say what happened.
	 *
	 * **A refusal leaves the modal open with every box exactly as typed**, which
	 * is the one place this departs from `StarterModal`, which closes and
	 * announces. Two reasons: the input is expensive to reproduce — a 23KB paste
	 * and a typed name — and the fix for the commonest refusal is *in the
	 * modal*, since a taken name is answered by typing a different one in the
	 * box already on screen. Nothing is rebuilt on this path, so "as typed"
	 * costs no code.
	 *
	 * A method rather than the click handler's own body because the handler
	 * cannot be `async`: the write, the refusal and the close all sit behind an
	 * await, and `void` on one call is the whole of what the button says about
	 * it.
	 */
	private async attempt(): Promise<void> {
		// The name box goes across untrimmed: what a blank one means is
		// `startLayout`'s rule, per arm, and a `.trim()` here would be a second
		// copy of it (`docs/PATTERNS.md` §1).
		const result = await startLayout(
			this.app,
			this.folder,
			this.name,
			this.chosenSource(),
		);
		// `'error' in` rather than `'ok' in`, which is §4's documented spelling for
		// a two-armed result: the failure arm is the one a caller must not forget.
		if ('error' in result) {
			new Notice(result.error);
			return;
		}
		this.close();
		new Notice(result.message);
		// The name the writer settled on, asked for rather than re-derived: the
		// pane must open the file that actually landed, and only the write knows
		// whether the box or the source decided its name.
		this.onCreated(result.name);
	}

	/**
	 * What the *visible* source says, and nothing else.
	 *
	 * A paste held behind a blank source is ignored and preserved, which is what
	 * makes hiding a row rather than clearing it safe.
	 */
	private chosenSource(): LayoutSource {
		if (this.source === 'copy') return { copyOf: this.copyOf };
		if (this.source === 'paste') return { text: this.text };
		return { blank: true };
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
