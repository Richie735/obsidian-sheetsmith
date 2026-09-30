// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LayoutEditorView } from '../view/layout-editor-view';
import { parseLayout, serialiseLayout } from '../parse/layout';
import { openModal, pressModalButton } from '../test/modal';
import { App, Notice } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { openView, showFile } from '../test/workspace';
import {
	Harness,
	tick,
	open,
	control,
} from '../test/layout-editor-pane';

/*
 * The **Layout file** row (`editor/layout-file-row.ts`), driven through the pane
 * it heads.
 *
 * Its controls beyond the dropdown, the dropdown's options, and what the pane
 * has open once a layout lands or is trashed — all read off a real pane
 * (`src/test/layout-editor-pane.ts`), since a delete ending on no file and a
 * create ending on the new one are the pane's posture, not the row's.
 *
 * **Moved here from `layout-editor.test.ts` whole**, not one assertion changed.
 * Two blocks near the row stayed there, three cases between them: `a layout file
 * the editor cannot read`, which keeps the row and reports under it, and `a
 * vault with no layouts in it`, which draws no row at all and a vacant state
 * instead. Both are the render's rules, which `layout-editor.ts` states at its
 * call site, not the row's.
 */

let harness: Harness;

/** The button in the open confirmation modal that goes through with it. */
function confirmAction(): void {
	const button = document.body.querySelector('.modal-container .mod-warning');
	if (!button) throw new Error('no confirmation is open');
	(button as HTMLButtonElement).click();
}

/*
 * The **Layout file** row's controls beyond the dropdown
 * (`docs/features/layout-import-export.md`,
 * `docs/features/starting-a-new-layout.md`).
 *
 * What is here is the row's controls, the dropdown's options, and what the pane
 * has open once a layout lands. The modal's own arms — every refusal, the
 * source switch, the prefilled name, the file it writes — are
 * `new-layout.test.ts`'s, which needs no pane at all.
 *
 * The row was two gestures when this was written and is three now: export, and
 * one **New layout** button that absorbed the dropdown's two verbs.
 */
describe('copying the open layout out', () => {
	/** What the fake clipboard was handed, in order. */
	let copied: string[];
	/** Whether the next write is refused, which is a real browser state. */
	let refuse: boolean;

	/**
	 * A clipboard the test owns.
	 *
	 * happy-dom declares `navigator.clipboard` as a getter on the prototype, so
	 * an own property on `navigator` shadows it and `delete` puts the original
	 * back. The pane reads it off the container's own window
	 * (`docs/PATTERNS.md` §5), which under happy-dom is this one.
	 */
	beforeEach(() => {
		copied = [];
		refuse = false;
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string): Promise<void> => {
					if (refuse) throw new Error('The user said no.');
					copied.push(text);
				},
			},
		});
		Notice.messages = [];
		for (const el of Array.from(
			document.body.querySelectorAll('.modal-container'),
		)) {
			el.remove();
		}
	});

	afterEach(() => {
		delete (navigator as unknown as { clipboard?: unknown }).clipboard;
	});

	/** The row's copy control, which the tooltip names. */
	function copyButton(from: Harness): HTMLButtonElement {
		const el = from.container.querySelector('[aria-label="Copy layout JSON"]');
		if (!el) throw new Error('no copy control on the layout row');
		return el as HTMLButtonElement;
	}

	/**
	 * Every clickable icon on the **Layout file** row, in order.
	 *
	 * Scoped to that row rather than to the pane, because the pane draws three
	 * `.setting-item-control`s and the claim is about this one — and returned
	 * whole rather than sliced, so a third icon appended after the trash is what
	 * goes red. A slice cannot see the thing "the trash stays last" is for.
	 */
	function rowIcons(from: Harness): (string | undefined)[] {
		for (const item of Array.from(
			from.container.querySelectorAll('.setting-item'),
		)) {
			if (item.querySelector('.setting-item-name')?.textContent !== 'Layout file') {
				continue;
			}
			return Array.from(
				item.querySelectorAll('.setting-item-control .clickable-icon'),
			).map((el) => (el as HTMLElement).dataset.icon);
		}
		throw new Error('no Layout file row');
	}

	it('is a clickable icon beside the trash, and the trash stays last', async () => {
		harness = await open();
		// The one irreversible control on the row stays at the end of it, so the
		// whole list is compared: a third icon appended after the trash fails
		// here, which is the only failure this case exists for.
		expect(rowIcons(harness)).toEqual(['copy', 'trash']);
	});

	it('puts the file’s own bytes on the clipboard, not a re-serialisation', async () => {
		/*
		 * The file is written compact where `serialiseLayout` writes tabs and a
		 * trailing newline, so the two spellings cannot be confused. This is the
		 * case that goes red if export ever starts reformatting: a layout
		 * carrying a key this parser does not know would have it silently
		 * dropped by a parse-then-serialise round trip, which is the one thing a
		 * share must not do.
		 */
		const app = new App();
		await app.vault.createFolder(LAYOUT_FOLDER);
		const bytes = JSON.stringify({
			name: 'Hand written',
			columns: 12,
			components: [],
			unknownToThisParser: 'kept',
		});
		await app.vault.create(`${LAYOUT_FOLDER}/Hand written.sheetsmith`, bytes);
		const pane = await openView(
			app,
			document.body,
			LayoutEditorView,
			fakePlugin(app),
		);
		await showFile(pane, `${LAYOUT_FOLDER}/Hand written.sheetsmith`);
		const el = pane.contentEl.querySelector('[aria-label="Copy layout JSON"]');
		(el as HTMLButtonElement).click();
		await tick();

		expect(copied).toEqual([bytes]);
		expect(copied[0]).not.toBe(serialiseLayout(parseLayout(bytes)));
	});

	it('names the layout in the notice', async () => {
		harness = await open();
		copyButton(harness).click();
		await tick();

		// The row shows one layout at a time, so a bare "Copied." leaves a
		// reader wondering which; "to the clipboard" says where.
		expect(Notice.messages).toEqual([
			'Copied "Test sheet" to the clipboard.',
		]);
	});

	it('says so when the clipboard refuses, and nothing else happens', async () => {
		harness = await open();
		const before = await harness.raw();
		refuse = true;

		copyButton(harness).click();
		await tick();

		// Deliberately the same words `src/editor/copyable-name.ts` gives. Why
		// the code is not shared is argued at the site, not cited there.
		expect(Notice.messages).toEqual(['Could not copy to the clipboard.']);
		expect(copied).toEqual([]);
		// Nothing is written in this direction at all: the clipboard is not the
		// vault, and a refused copy leaves the file exactly as it was.
		expect(await harness.raw()).toBe(before);
	});

	it('reports the vault’s own reason when the file cannot be read', async () => {
		harness = await open();
		harness.app.vault.read = async () => {
			throw new Error('The file is gone.');
		};

		copyButton(harness).click();
		await tick();

		expect(Notice.messages).toEqual(['The file is gone.']);
		expect(copied).toEqual([]);
	});

	it('guards rather than disabling, and says nothing when it guards', async () => {
		/*
		 * The state the guard is for, reached the way a reader reaches it: the
		 * control is left behind by a redraw that took the layout with it. It is
		 * `deleteLayout`'s existing spelling one control to the right, and
		 * deliberately **not** `setDisabled` — that reaches no paint on a
		 * `.clickable-icon`, so a disabled copy icon would look identical to a
		 * live one and this feature would become the fifth member of a
		 * `docs/BACKLOG.md` row waiting on one decision about four.
		 */
		harness = await open();
		const stale = copyButton(harness);
		expect(stale.hasAttribute('disabled')).toBe(false);

		const trash = harness.container.querySelector(
			'[aria-label="Delete layout"]',
		) as HTMLButtonElement;
		trash.click();
		confirmAction();
		await tick();
		// The pane has nothing open now, which is the premise.
		expect(
			harness.container.querySelector('[data-sheetsmith-focus="layout-picker"]'),
		).toBeNull();

		stale.click();
		await tick();

		expect(copied).toEqual([]);
		expect(Notice.messages).toEqual([]);
	});
});

describe('starting a new layout from the pane', () => {
	beforeEach(() => {
		Notice.messages = [];
		for (const el of Array.from(
			document.body.querySelectorAll('.modal-container'),
		)) {
			el.remove();
		}
	});

	/** The row's **New layout** button. */
	function newLayoutButton(from: Harness): HTMLButtonElement {
		const row = control(from, 'layout-picker').closest('.setting-item');
		for (const el of Array.from(row?.querySelectorAll('button') ?? [])) {
			if (el.textContent === 'New layout') return el;
		}
		throw new Error('no New layout button on the row');
	}

	it('holds layout names in the dropdown and nothing else', async () => {
		/*
		 * **Nouns only.** Both verbs used to live in here, and the row rule that
		 * put them there — the dropdown answers *which layout is open*, the
		 * row's buttons *act on* the one that is — does not reach create at all:
		 * it acts on the folder, which is a third kind of thing
		 * (`docs/features/starting-a-new-layout.md`). Asserted as the whole
		 * option list rather than as two absences, because what is being claimed
		 * is that the dropdown is a list of files.
		 */
		harness = await open();
		const picker = control<HTMLSelectElement>(harness, 'layout-picker');
		expect(
			Array.from(picker.options).map((option) => option.textContent),
		).toEqual(['Test sheet']);
	});

	it('carries the gesture as a button, before the two icon buttons', async () => {
		harness = await open();
		const row = control(harness, 'layout-picker').closest('.setting-item');
		const controls = Array.from(
			row?.querySelectorAll('.setting-item-control > *') ?? [],
		);

		// A dropdown, then a plain button, then the two `.clickable-icon`s: the
		// **Add component** row's own shape, and the trash stays last so a press
		// that lands one control off its mark hits the harmless one.
		expect(controls.map((el) => el.tagName)).toEqual([
			'SELECT',
			'BUTTON',
			'BUTTON',
			'BUTTON',
		]);
		expect(controls[1]?.textContent).toBe('New layout');
		// Not a CTA: creating a layout is not this pane's primary action.
		expect(controls[1]?.classList.contains('mod-cta')).toBe(false);
		expect(controls[2]?.getAttribute('aria-label')).toBe('Copy layout JSON');
		expect(controls[3]?.getAttribute('aria-label')).toBe('Delete layout');
	});

	it('opens the modal when the button is pressed', async () => {
		harness = await open();
		newLayoutButton(harness).click();
		await tick();

		const modal = document.body.querySelector('.modal-container');
		expect(modal?.querySelector('.modal-title')?.textContent).toBe(
			'New layout',
		);
	});

	it('leaves the pane exactly as it was when the modal is cancelled', async () => {
		/*
		 * The mechanism this placement deleted: a sentinel option left the
		 * `<select>` showing the wrong value, so both modals took an `onCancel`
		 * that redrew the pane purely to snap it back. A button press changes no
		 * `<select>` value, so there is nothing to snap and nothing to redraw —
		 * asserted as the picker still showing the open layout *and* the tree
		 * being the same element it was, which a redraw would have replaced.
		 */
		harness = await open();
		const tree = harness.container.querySelector('.sheetsmith-editor-tree');
		newLayoutButton(harness).click();
		await tick();
		pressModalButton('Cancel');
		await tick();

		expect(control<HTMLSelectElement>(harness, 'layout-picker').value).toBe(
			`${LAYOUT_FOLDER}/Test sheet.sheetsmith`,
		);
		expect(harness.container.querySelector('.sheetsmith-editor-tree')).toBe(
			tree,
		);
	});

	it('leaves the pane open on the layout that landed', async () => {
		harness = await open();
		newLayoutButton(harness).click();
		await tick();

		const modal = openModal();
		// The paste arm, because it is the one that lands under a name the pane
		// did not choose: only the write knows whether the box or the source
		// decided it, which is why the pane is handed the name rather than
		// re-deriving one.
		const source = modal.querySelector('select') as HTMLSelectElement;
		source.value = 'paste';
		source.dispatchEvent(new Event('change'));
		// By tag inside the modal: the modal sets no focus tokens, on the
		// argument at its own `onOpen`.
		const paste = modal.querySelector('textarea') as HTMLTextAreaElement;
		paste.value = serialiseLayout({
			name: 'Shared sheet',
			columns: 12,
			components: [],
		});
		paste.dispatchEvent(new Event('input'));
		pressModalButton('Create');
		await tick();
		await tick();

		// The pane opened what it just wrote, in its own leaf, as the file the
		// write produced — a `.sheetsmith`, whatever the pasted source was.
		expect(
			control<HTMLSelectElement>(harness, 'layout-picker').value,
		).toBe(`${LAYOUT_FOLDER}/Shared sheet.sheetsmith`);
		expect(harness.pane.file?.path).toBe(
			`${LAYOUT_FOLDER}/Shared sheet.sheetsmith`,
		);
		expect(await harness.stored()).toMatchObject({ name: 'Test sheet' });
		expect(Notice.messages).toEqual([
			`Added "Shared sheet" to ${LAYOUT_FOLDER}.`,
		]);
	});
});
