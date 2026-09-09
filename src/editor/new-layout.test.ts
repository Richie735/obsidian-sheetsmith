// @vitest-environment happy-dom
/*
 * Starting a new layout, from each of its three sources
 * (`docs/features/starting-a-new-layout.md`).
 *
 * Grown out of `layout-import.test.ts` rather than rewritten: a paste is one of
 * three sources now, so every case that was about the paste is still about the
 * paste, and what is new is the **Start from** row around it.
 *
 * The vault here is `src/test/obsidian-stub.ts`'s, which is a real map of paths
 * to content: a folder that does not exist is a folder that does not exist, and
 * `create` on a taken path is the refusal `createLayout` already owns. So every
 * arm this feature can end in is reachable without the app.
 *
 * **A file of its own**, under `docs/PATTERNS.md` §10's boundary: a module in
 * `editor/` with its own entry point *and* its own reportable output earns one,
 * and `promptNewLayout` has both — it is called by name rather than reached
 * by pressing something the editor drew, and what it reports is a file in the
 * vault and a sentence. The two cases that are the *pane's* — that the row's
 * button opens this, and that a successful create leaves the pane on the
 * layout that landed — stay in `layout-editor.test.ts` with the pane harness.
 *
 * **The writer's own arms are not here either.** `startLayout`'s refusals, its
 * missing-source arm and its blank-name guard are `src/layouts.test.ts`'s,
 * because they belong to the module that owns the folder and are driveable with
 * no modal in existence. What this file asserts about a refusal is what the
 * *form* does with it: the modal stays open, the boxes hold what was typed, and
 * the sentence is the writer's rather than a second copy of it.
 *
 * **A refusal case asserts what is still there, not that the new thing is
 * absent.** The closest prior art has an open defect where importing into an
 * existing item template deleted it, so "the layout was not created" is only
 * half the claim: the other half is that nothing which was already there moved.
 *
 * Six of the seven cases under `a refusal` are about the vault; the seventh is
 * about the surface — the modal staying open with what was typed — and asserts
 * no vault state at all. Five of the six make the claim as a count of the
 * folder's contents. **The sixth cannot, and says so at the case**: where the
 * folder's own path is held by a file, `listLayouts` has no folder to list and
 * answers `[]` for a vault that had lost everything, so that one asserts the
 * existing file's bytes instead — the same claim by the only route open to it.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { expectDescribedRow } from '../test/described-row';
import { App, Notice } from '../test/obsidian-stub';
import { LAYOUT_FOLDER } from '../test/plugin';
import { serialiseLayout } from '../parse/layout';
import { layoutPaths } from '../test/layout-folder';
import {
	modalButton,
	modalIsOpen,
	openModal,
	pressModalButton,
} from '../test/modal';
import { promptNewLayout } from './new-layout';

/** A layout as somebody would paste it: valid, and named. */
const SOURCE = JSON.stringify({
	name: 'Shared sheet',
	columns: 12,
	components: [
		{
			id: 'armour',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 1, width: 2, height: 1 },
		},
	],
});

const pathOf = (name: string): string => `${LAYOUT_FOLDER}/${name}.json`;

let app: App;
/** The names handed back, in order. */
let created: string[];

/**
 * The stub app where the real one is asked for.
 *
 * `picker.test.ts`'s own helper and its reason: the stub is a *double* for
 * `App` rather than an implementation of it, so every call site would otherwise
 * carry the same `as unknown` and the same paragraph.
 */
const vault = () => app as unknown as ObsidianApp;

/** One turn of the event loop, which flushes the awaited write behind a click. */
async function tick(): Promise<void> {
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * Open the modal the way the pane does.
 *
 * `openLayout` is what **Layout to copy** prefills to; `null` is a pane with
 * nothing open. There is no cancel arm to pass, which is what the button on the
 * row bought over the dropdown option it replaced.
 */
function open(folder = LAYOUT_FOLDER, openLayout: string | null = null): void {
	promptNewLayout(vault(), folder, openLayout, (name) => created.push(name));
}

/**
 * The field in the setting row carrying this name.
 *
 * By row name rather than by a `data-sheetsmith-focus` token, which the modal
 * deliberately sets none of: that attribute is the pane's focus-restoration
 * vocabulary and a modal never rebuilds, so a token here would be a test
 * selector in shipped markup. The name is the label a reader picks the field by,
 * which is `layout-editor.test.ts`'s own `checkbox(harness, name)` route.
 */
function field<T extends HTMLElement = HTMLElement>(name: string): T {
	for (const item of Array.from(openModal().querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		const el = item.querySelector(
			'.setting-item-control textarea, .setting-item-control input',
		);
		if (el) return el as T;
	}
	throw new Error(`no field in a row named "${name}"`);
}

/** The setting row carrying this name, whatever it holds. */
function row(name: string): HTMLElement {
	for (const item of Array.from(openModal().querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent === name) {
			return item as HTMLElement;
		}
	}
	throw new Error(`no row named "${name}"`);
}

/**
 * Whether a row is on screen, by the same means the app uses.
 *
 * **The inline `display`, never the `hidden` attribute.** `app.css` declares
 * `.setting-item { display: flex }` at author level, which beats the UA sheet's
 * `[hidden] { display: none }`, so a row hidden with the attribute stays on
 * screen in the app while a case asserting the attribute passes — green in the
 * suite and wrong in the app. `toggleVisibility` writes the one thing that wins.
 */
function shown(name: string): boolean {
	return row(name).style.display !== 'none';
}

/** The dropdown in the row carrying this name. */
function select(name: string): HTMLSelectElement {
	const el = row(name).querySelector('select');
	if (!el) throw new Error(`no dropdown in a row named "${name}"`);
	return el;
}

/** Choose a source the way a reader does. */
function chooseSource(kind: 'blank' | 'copy' | 'paste'): void {
	const el = select('Start from');
	el.value = kind;
	el.dispatchEvent(new Event('change'));
}

/** Type into a field the way a paste does: the value, then the event. */
function type(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input'));
}

/**
 * Paste a source, optionally name it, and press **Create**.
 *
 * The source is chosen first, because only the *visible* source is read: a
 * paste typed behind another source is preserved and ignored, which is the
 * whole point of hiding a row rather than clearing it.
 */
async function pasting(source: string, name?: string): Promise<void> {
	open();
	chooseSource('paste');
	type(field<HTMLTextAreaElement>('Layout JSON'), source);
	if (name !== undefined) type(field<HTMLInputElement>('Name'), name);
	pressModalButton('Create');
	await tick();
}

/** Choose a layout to copy, take or change the name, and press **Create**. */
async function copying(
	source: string,
	name?: string,
	openLayout: string | null = null,
): Promise<void> {
	open(LAYOUT_FOLDER, openLayout);
	chooseSource('copy');
	const which = select('Layout to copy');
	which.value = source;
	which.dispatchEvent(new Event('change'));
	if (name !== undefined) type(field<HTMLInputElement>('Name'), name);
	pressModalButton('Create');
	await tick();
}

/** Name a blank layout and press **Create**. */
async function blank(name: string): Promise<void> {
	open();
	type(field<HTMLInputElement>('Name'), name);
	pressModalButton('Create');
	await tick();
}

beforeEach(() => {
	app = new App();
	Notice.messages = [];
	created = [];
	document.body.replaceChildren();
});

describe('importing a pasted layout', () => {
	it('writes the layout under the name inside it, creating the folder', async () => {
		// The premise: without this the assertions below could be passing over a
		// folder or a file some other case left behind.
		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).toBeNull();

		await pasting(SOURCE);

		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).not.toBeNull();
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Shared sheet')]);
	});

	it('writes what serialiseLayout says rather than the pasted bytes', async () => {
		// One writer, one spelling: a layout that lands is formatted exactly as
		// one the pane edited is, whatever whitespace the paste arrived with.
		await pasting(`   ${SOURCE}   `);

		const file = app.vault.getFileByPath(pathOf('Shared sheet'));
		expect(file).not.toBeNull();
		expect(await app.vault.read(file as NonNullable<typeof file>)).toBe(
			serialiseLayout({
				name: 'Shared sheet',
				columns: 12,
				components: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 2, height: 1 },
					},
				],
			}),
		);
	});

	it('says where it went, in the one sentence the one writer gives', async () => {
		// The same words `installStarter` gives, because it is the same function
		// saying them. The folder is named because it is configurable.
		await pasting(SOURCE);
		expect(Notice.messages).toEqual([
			`Added "Shared sheet" to ${LAYOUT_FOLDER}.`,
		]);
	});

	it('follows the configured folder rather than the default', async () => {
		open('Elsewhere/Sheets');
		chooseSource('paste');
		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);
		pressModalButton('Create');
		await tick();

		expect(layoutPaths(vault(), 'Elsewhere/Sheets')).toEqual([
			'Elsewhere/Sheets/Shared sheet.json',
		]);
		expect(Notice.messages).toEqual([
			'Added "Shared sheet" to Elsewhere/Sheets.',
		]);
	});

	it('hands the caller the name the file landed under', async () => {
		await pasting(SOURCE);
		expect(created).toEqual(['Shared sheet']);
	});

	it('closes on success', async () => {
		await pasting(SOURCE);
		expect(modalIsOpen()).toBe(false);
	});
});

describe('the optional name', () => {
	it('overrides the name inside the JSON, in the file and in the key', async () => {
		await pasting(SOURCE, 'Borrowed sheet');

		// The filename and the `name` key still agree, which is the invariant
		// `loadLayout` and `listLayouts` both rest on.
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Borrowed sheet')]);
		const file = app.vault.getFileByPath(pathOf('Borrowed sheet'));
		const written = await app.vault.read(file as NonNullable<typeof file>);
		expect((JSON.parse(written) as { name: string }).name).toBe(
			'Borrowed sheet',
		);
		expect(Notice.messages).toEqual([
			`Added "Borrowed sheet" to ${LAYOUT_FOLDER}.`,
		]);
		expect(created).toEqual(['Borrowed sheet']);
	});

	it('treats a blank box as absent rather than as a name', async () => {
		// "Leave empty to use the name inside the JSON" is the field's own copy,
		// and whitespace is what an accidental space bar leaves behind.
		await pasting(SOURCE, '   ');
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Shared sheet')]);
		// And the caller is handed what the file got. This is the one path where
		// the blank-means-absent rule actually decides something, so it is the
		// one place a name the write settled on could disagree with the name the
		// pane then opens — which is why the `ok` arm carries it.
		expect(created).toEqual(['Shared sheet']);
	});

	it('answers a taken name once it is changed', async () => {
		// The refusal below is actionable precisely because this works: the fix
		// for the commonest failure is the box already on screen.
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Shared sheet'), 'mine, edited');

		await pasting(SOURCE, 'Shared sheet copy');

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([
			pathOf('Shared sheet copy'),
			pathOf('Shared sheet'),
		].sort());
		const mine = app.vault.getFileByPath(pathOf('Shared sheet'));
		expect(await app.vault.read(mine as NonNullable<typeof mine>)).toBe(
			'mine, edited',
		);
	});
});

describe('a refusal', () => {
	it('writes no file at all for text that is not JSON', async () => {
		await pasting('this is not a layout');

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
		// The parser's own sentence, rather than a second one composed here.
		expect(Notice.messages).toHaveLength(1);
		expect(Notice.messages[0]).toContain('Layout file is not valid JSON:');
		// And the paste is still in the box: the fix for a bad paste is the box
		// it is in, so nothing is cleared on a refusal.
		expect(modalIsOpen()).toBe(true);
		expect(field<HTMLTextAreaElement>('Layout JSON').value).toBe(
			'this is not a layout',
		);
	});

	it('writes nothing for JSON with no name, and no name typed', async () => {
		await pasting(JSON.stringify({ columns: 6, components: [] }));

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
		expect(Notice.messages).toEqual([
			'The layout needs a non-empty "name" string.',
		]);
	});

	it('still refuses nameless JSON when a name is typed', async () => {
		/*
		 * The gate runs before the rename, which is the whole of the ordering
		 * `installLayoutSource` exists to hold: nothing is written until the
		 * source has parsed, and the source cannot parse without a name. The
		 * **Name** field's own copy says "change it", not "supply it", so this
		 * is the field's boundary rather than a hole in it: a layout with no
		 * `name` is malformed, and inventing one on the author's behalf is the
		 * plugin editing content it does not own. Settled rather than pinned —
		 * the spec's failure table and criterion 4 both say so now.
		 */
		await pasting(JSON.stringify({ columns: 6, components: [] }), 'Named');

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
		expect(Notice.messages).toEqual([
			'The layout needs a non-empty "name" string.',
		]);
	});

	it('writes nothing for JSON the schema refuses', async () => {
		await pasting(JSON.stringify({ name: 'Stale' }));

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
		expect(Notice.messages).toEqual([
			'The layout needs a "components" array.',
		]);
	});

	it('leaves the existing file’s bytes unchanged when the name is taken', async () => {
		/*
		 * The criterion Custom System Builder issue 516 is the evidence for:
		 * importing into an existing template there deletes it. Import here has
		 * no gesture that targets an existing layout at all, so the guarantee is
		 * structural — and it is asserted as the bytes rather than as the path,
		 * because a file overwritten with something else still exists.
		 */
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Shared sheet'), 'mine, edited');

		await pasting(SOURCE);

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Shared sheet')]);
		const file = app.vault.getFileByPath(pathOf('Shared sheet'));
		expect(await app.vault.read(file as NonNullable<typeof file>)).toBe(
			'mine, edited',
		);
		expect(Notice.messages).toEqual([
			'A layout named "Shared sheet" already exists.',
		]);
	});

	it('reports the vault’s own reason when the write itself fails', async () => {
		/*
		 * A file sitting where the layout folder must go, which is one of the
		 * three the spec's failure table names and the one this double actually
		 * refuses: `createFolder` asks `adapter.exists` in the app, so a *file*
		 * at that path refuses in the app's own words.
		 *
		 * **Not the `/`-in-a-name arm the criterion names**, because the double
		 * disagrees with the app there — Obsidian's adapter writes through
		 * `fs`, so a path under a folder that does not exist is `ENOENT`, while
		 * this vault is a flat map of paths and writes it happily. A green case
		 * over that would be the kind instrument `docs/UI.md` §11 warns about,
		 * so the gap is a `docs/BACKLOG.md` row rather than an assertion.
		 */
		await app.vault.create(LAYOUT_FOLDER, 'not a folder');

		await pasting(SOURCE);

		// **The file that was already there, byte for byte.** `layoutPaths` is no
		// use on this arm — with a file at the folder's own path it answers `[]`
		// for a vault that had lost everything — so what carries the claim is
		// the one thing that existed before the press.
		const held = app.vault.getFileByPath(LAYOUT_FOLDER);
		expect(held).not.toBeNull();
		expect(await app.vault.read(held as NonNullable<typeof held>)).toBe(
			'not a folder',
		);
		expect(app.vault.getFileByPath(pathOf('Shared sheet'))).toBeNull();
		// The vault's own sentence, not one composed here, and not "Added".
		expect(Notice.messages).toEqual(['Folder already exists.']);
	});

	it('leaves the modal open with the paste and the name as typed', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Shared sheet'), 'mine, edited');

		await pasting(SOURCE, 'Shared sheet');

		// A 23KB paste and a typed name are expensive to reproduce, and the fix
		// for this refusal is the box that is already on screen.
		expect(modalIsOpen()).toBe(true);
		expect(field<HTMLTextAreaElement>('Layout JSON').value).toBe(SOURCE);
		expect(field<HTMLInputElement>('Name').value).toBe(
			'Shared sheet',
		);
		expect(created).toEqual([]);
	});
});

describe('the modal itself', () => {
	it('disables Create while the paste box is blank or whitespace', () => {
		open();
		chooseSource('paste');
		const submit = modalButton('Create');
		// **The attribute, not the property**, at every step. They are two
		// separate writes in `setDisabled` — in the double and in the app — and
		// the attribute is the one Obsidian's `button[disabled] { cursor:
		// not-allowed; opacity: 0.7 }` rule matches, so a property assertion
		// proves the behaviour and not the paint.
		expect(submit.hasAttribute('disabled')).toBe(true);

		type(field<HTMLTextAreaElement>('Layout JSON'), '   \n  ');
		expect(submit.hasAttribute('disabled')).toBe(true);

		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);
		expect(submit.hasAttribute('disabled')).toBe(false);

		type(field<HTMLTextAreaElement>('Layout JSON'), '');
		expect(submit.hasAttribute('disabled')).toBe(true);
	});

	it('tells the caller nothing at all when it is cancelled', () => {
		open();
		pressModalButton('Cancel');

		expect(modalIsOpen()).toBe(false);
		expect(created).toEqual([]);
		// **And there is nothing else to fire.** The dropdown-as-verb needed an
		// `onCancel` to snap the `<select>` off the sentinel it was left showing;
		// a button press changes no `<select>` value, so cancelling is silent
		// and the pane is not redrawn at all.
		expect(Notice.messages).toEqual([]);
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
	});

	it('names itself and says what each box is for', () => {
		open();
		expect(openModal().querySelector('.modal-title')?.textContent).toBe(
			'New layout',
		);
		// What it starts from, exactly which, then what it is called — and the
		// button row last, which has no name.
		const names = Array.from(
			openModal().querySelectorAll('.setting-item-name'),
		).map((el) => el.textContent);
		expect(names).toEqual([
			'Start from',
			'Layout to copy',
			'Layout JSON',
			'Name',
			'',
		]);
		expect(
			field<HTMLTextAreaElement>('Layout JSON').placeholder,
		).toBe("Paste the layout's JSON here");
		// The attribute, because a DOM double may answer the property as a
		// string: six rows is the shipped decision either way.
		expect(
			field<HTMLTextAreaElement>('Layout JSON').getAttribute('rows'),
		).toBe('6');
		// The description states the consequence — what a taken name does, and
		// the one source where leaving the box empty is the right answer —
		// rather than restating the label (`docs/PATTERNS.md` §8).
		expect(
			Array.from(openModal().querySelectorAll('.setting-item-description')).map(
				(el) => el.textContent,
			),
		).toContain(
			'What the file is called, and a name the folder already holds is refused rather than overwritten.',
		);
	});

	it('focuses Name, so a blank layout is name, press, done', () => {
		open();
		expect(document.activeElement).toBe(field<HTMLInputElement>('Name'));
	});
});

describe('the Start from row', () => {
	it('defaults to a blank grid, with no source input on screen', () => {
		open();

		expect(select('Start from').value).toBe('blank');
		// The floor this design keeps: name, press, done, never touching this
		// row. So neither source input may be in the way of it.
		expect(shown('Layout to copy')).toBe(false);
		expect(shown('Layout JSON')).toBe(false);
	});

	it('offers no existing layout where the folder holds none', () => {
		open();

		expect(
			Array.from(select('Start from').options).map((o) => o.textContent),
		).toEqual(['A blank grid', 'Pasted JSON']);
	});

	it('offers an existing layout as soon as the folder holds one', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Cutter'), SOURCE);
		open();

		expect(
			Array.from(select('Start from').options).map((o) => o.textContent),
		).toEqual(['A blank grid', 'An existing layout', 'Pasted JSON']);
	});

	it('says what each source does, under the menu that chose it', () => {
		open();
		const description = () =>
			row('Start from').querySelector('.setting-item-description')
				?.textContent;

		expect(description()).toBe(
			'The new layout starts empty, on a six-column grid.',
		);
		chooseSource('paste');
		expect(description()).toBe(
			'The new layout is read from the JSON you paste, and checked before anything is written. Leave the name below empty to use the one inside it.',
		);
	});

	it('carries the empty-name advice on the one source it holds for', () => {
		/*
		 * It used to sit in the **Name** row, which is the one static row in a
		 * per-source form: on screen for all three sources and dead advice on
		 * two of them, and the longest string in the modal. Here it is beside
		 * the branch it is about, which is what the row above is for.
		 */
		open();
		const nameRow = row('Name').querySelector(
			'.setting-item-description',
		)?.textContent;
		expect(nameRow).toBe(
			'What the file is called, and a name the folder already holds is refused rather than overwritten.',
		);
		chooseSource('paste');
		expect(
			row('Start from').querySelector('.setting-item-description')
				?.textContent,
		).toContain('Leave the name below empty');
	});

	it('wears the described-row treatment, in a modal', () => {
		/*
		 * `docs/UI.md` §9's settled rule, through `editor/described-row.ts`: a
		 * settings row is one centred flex line wherever it is drawn, so copy
		 * growing in the info column squeezes the control the reader is reaching
		 * for — here **Create**. What this consumer adds to the module's own
		 * claim is that it holds *in a modal*, which is the scoping test
		 * `.sheetsmith-input-invalid` failed.
		 */
		open();
		expectDescribedRow(row('Start from'), select('Start from'));
	});

	it('gives each modal its own description id', () => {
		/*
		 * A module literal is safe on the pane's own row, because a redraw
		 * replaces the whole container so only one element ever carries it. A
		 * modal is a different lifetime: opened, closed, opened again — and two
		 * elements sharing an id point a reader's screen reader at the wrong
		 * description with nothing on screen to show it.
		 */
		open();
		const first = select('Start from').getAttribute('aria-describedby');
		pressModalButton('Cancel');
		open();
		const second = select('Start from').getAttribute('aria-describedby');

		expect(first).toBeTruthy();
		expect(second).not.toBe(first);
	});
});

describe('the source input that is not in use', () => {
	it('shows only the chosen one, whichever it is', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Cutter'), SOURCE);
		open();

		chooseSource('copy');
		expect(shown('Layout to copy')).toBe(true);
		expect(shown('Layout JSON')).toBe(false);

		chooseSource('paste');
		expect(shown('Layout to copy')).toBe(false);
		expect(shown('Layout JSON')).toBe(true);

		chooseSource('blank');
		expect(shown('Layout to copy')).toBe(false);
		expect(shown('Layout JSON')).toBe(false);
	});

	it('keeps what was typed, because the input is never rebuilt', () => {
		// A reader who pastes 23KB, switches to a blank grid to look at
		// something and switches back still has their paste: the same element,
		// not a repopulated one.
		open();
		chooseSource('paste');
		const box = field<HTMLTextAreaElement>('Layout JSON');
		type(box, SOURCE);

		chooseSource('blank');
		chooseSource('paste');

		expect(field<HTMLTextAreaElement>('Layout JSON')).toBe(box);
		expect(box.value).toBe(SOURCE);
	});

	it('is not read, so a paste behind a blank grid is ignored', async () => {
		open();
		chooseSource('paste');
		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);
		chooseSource('blank');
		type(field<HTMLInputElement>('Name'), 'Scratch');
		pressModalButton('Create');
		await tick();

		// The blank layout, under the typed name — and the paste preserved
		// rather than written under any name at all.
		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Scratch')]);
		expect(created).toEqual(['Scratch']);
	});
});

describe('starting from a blank grid', () => {
	it('writes the empty layout and says where it went', async () => {
		await blank('Scratch');

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Scratch')]);
		// **A blank create used to be silent**, which is the one deliberate
		// change to shipped behaviour here: one gesture with three sources that
		// announces two of them invites a reader to infer the quiet one did
		// something different.
		expect(Notice.messages).toEqual([
			`Added "Scratch" to ${LAYOUT_FOLDER}.`,
		]);
		expect(created).toEqual(['Scratch']);
		expect(modalIsOpen()).toBe(false);
	});

	it('disables Create while the name is blank or whitespace', () => {
		open();
		const submit = modalButton('Create');
		// The attribute, not just the property: it is the selector Obsidian's
		// own `button[disabled] { cursor: not-allowed; opacity: 0.7 }` rule
		// matches, which is what makes this state reach the paint at all.
		expect(submit.hasAttribute('disabled')).toBe(true);

		type(field<HTMLInputElement>('Name'), '   ');
		expect(submit.hasAttribute('disabled')).toBe(true);

		type(field<HTMLInputElement>('Name'), 'Scratch');
		expect(submit.hasAttribute('disabled')).toBe(false);

		type(field<HTMLInputElement>('Name'), '');
		expect(submit.hasAttribute('disabled')).toBe(true);
	});

	it('creates on Enter in the name box', async () => {
		open();
		const name = field<HTMLInputElement>('Name');
		type(name, 'Scratch');
		name.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		);
		await tick();

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([pathOf('Scratch')]);
	});

	it('does nothing on Enter while Create is disabled', async () => {
		// `NameModal`'s Enter came across; its silent return on a blank name did
		// not, because the guard is the same condition that disables the button.
		open();
		field<HTMLInputElement>('Name').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		);
		await tick();

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([]);
		expect(created).toEqual([]);
		expect(Notice.messages).toEqual([]);
		expect(modalIsOpen()).toBe(true);
	});
});

describe('the disabled rule follows the chosen source', () => {
	it('goes live when a paste arrives behind an empty name', () => {
		// The rule is per source — a blank name blocks two arms and a blank
		// paste the third — so switching has to recompute it. Otherwise a reader
		// who left the name empty meets a dead **Create** for a gesture that
		// would succeed.
		open();
		expect(modalButton('Create').hasAttribute('disabled')).toBe(true);

		chooseSource('paste');
		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);

		expect(modalButton('Create').hasAttribute('disabled')).toBe(false);
	});

	it('goes dead when a blank grid arrives behind an empty name', () => {
		open();
		chooseSource('paste');
		type(field<HTMLTextAreaElement>('Layout JSON'), SOURCE);
		expect(modalButton('Create').hasAttribute('disabled')).toBe(false);

		chooseSource('blank');

		expect(modalButton('Create').hasAttribute('disabled')).toBe(true);
	});
});

describe('starting from an existing layout', () => {
	beforeEach(async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf('Cutter'), SOURCE);
		await app.vault.create(
			pathOf('Whisper'),
			serialiseLayout({ name: 'Whisper', columns: 8, components: [] }),
		);
	});

	it('lists the folder’s layouts and prefills the one the pane has open', () => {
		open(LAYOUT_FOLDER, 'Whisper');
		chooseSource('copy');

		expect(
			Array.from(select('Layout to copy').options).map((o) => o.textContent),
		).toEqual(['Cutter', 'Whisper']);
		// The layout the author is looking at is the one they are most likely to
		// be copying.
		expect(select('Layout to copy').value).toBe('Whisper');
	});

	it('prefills the first where the pane has nothing open', () => {
		open();
		chooseSource('copy');
		expect(select('Layout to copy').value).toBe('Cutter');
	});

	it('proposes a name for the copy, and reproposes it for a new source', () => {
		open(LAYOUT_FOLDER, 'Cutter');
		chooseSource('copy');
		const name = field<HTMLInputElement>('Name');
		expect(name.value).toBe('Cutter copy');

		const which = select('Layout to copy');
		which.value = 'Whisper';
		which.dispatchEvent(new Event('change'));

		expect(name.value).toBe('Whisper copy');
	});

	it('climbs the suffix past a copy already in the folder', async () => {
		await app.vault.create(pathOf('Cutter copy'), SOURCE);
		open(LAYOUT_FOLDER, 'Cutter');
		chooseSource('copy');

		// The suffix is searched when the source is chosen, so in the ordinary
		// case the writer's refusal is never met.
		expect(field<HTMLInputElement>('Name').value).toBe('Cutter copy 2');
	});

	it('never touches a name the reader typed', () => {
		/*
		 * The box is either the reader's or the tool's, and once it is theirs it
		 * is never taken back — not by a later prefill, and not by a source
		 * switch. Without that flag the two rules this form needs contradict
		 * each other.
		 */
		open(LAYOUT_FOLDER, 'Cutter');
		const name = field<HTMLInputElement>('Name');
		type(name, 'Mine');

		chooseSource('copy');
		expect(name.value).toBe('Mine');

		const which = select('Layout to copy');
		which.value = 'Whisper';
		which.dispatchEvent(new Event('change'));
		expect(name.value).toBe('Mine');

		chooseSource('paste');
		expect(name.value).toBe('Mine');
	});

	it('takes back its own proposal when the source it was for is left', () => {
		/*
		 * Otherwise `Cutter copy` sits in the box after a switch to **Pasted
		 * JSON**, where it would silently override the pasted layout's own name
		 * — and contradict the **Name** row's own description, which tells the
		 * reader to leave the box empty for exactly that source. Costs nothing,
		 * because nobody typed it.
		 */
		open(LAYOUT_FOLDER, 'Cutter');
		chooseSource('copy');
		expect(field<HTMLInputElement>('Name').value).toBe('Cutter copy');

		chooseSource('paste');

		expect(field<HTMLInputElement>('Name').value).toBe('');
	});

	it('disables Create when the reader clears the prefilled name', () => {
		/*
		 * The third arm of the disabled rule, and the only one a reader reaches
		 * by *emptying* a box rather than by never filling one: choosing this
		 * source fills **Name**, so clearing it is a deliberate act — and it
		 * marks the box as theirs, so nothing refills it. The name is required
		 * here for the same reason as on a blank grid: a copy has no other
		 * source of one.
		 */
		open(LAYOUT_FOLDER, 'Cutter');
		chooseSource('copy');
		const submit = modalButton('Create');
		expect(submit.hasAttribute('disabled')).toBe(false);

		type(field<HTMLInputElement>('Name'), '');
		expect(submit.hasAttribute('disabled')).toBe(true);

		type(field<HTMLInputElement>('Name'), '   ');
		expect(submit.hasAttribute('disabled')).toBe(true);

		type(field<HTMLInputElement>('Name'), 'Mine');
		expect(submit.hasAttribute('disabled')).toBe(false);
	});

	it('writes the copy from the source file, and leaves the source alone', async () => {
		const before = SOURCE;
		await copying('Cutter', undefined, 'Cutter');

		expect(layoutPaths(vault(), LAYOUT_FOLDER)).toEqual([
			pathOf('Cutter copy'),
			pathOf('Cutter'),
			pathOf('Whisper'),
		].sort());
		const copy = app.vault.getFileByPath(pathOf('Cutter copy'));
		const written = await app.vault.read(copy as NonNullable<typeof copy>);
		// The filename and the `name` key agree, which is the invariant
		// `loadLayout` and `listLayouts` both rest on.
		expect((JSON.parse(written) as { name: string }).name).toBe(
			'Cutter copy',
		);
		const source = app.vault.getFileByPath(pathOf('Cutter'));
		expect(await app.vault.read(source as NonNullable<typeof source>)).toBe(
			before,
		);
		expect(created).toEqual(['Cutter copy']);
		// The third arm announcing in the same sentence as the other two.
		expect(Notice.messages).toEqual([
			`Added "Cutter copy" to ${LAYOUT_FOLDER}.`,
		]);
	});

	it('stays open with the source and the name as they were when refused', async () => {
		// The commonest refusal on this arm — a second copy under the name a
		// first one already took — and its fix is the box already on screen.
		await app.vault.create(pathOf('Cutter copy'), 'mine, edited');
		open(LAYOUT_FOLDER, 'Cutter');
		chooseSource('copy');
		type(field<HTMLInputElement>('Name'), 'Cutter copy');
		pressModalButton('Create');
		await tick();

		expect(modalIsOpen()).toBe(true);
		expect(select('Layout to copy').value).toBe('Cutter');
		expect(field<HTMLInputElement>('Name').value).toBe('Cutter copy');
		// `createLayout`'s own words, not a second copy of them.
		expect(Notice.messages).toEqual([
			'A layout named "Cutter copy" already exists.',
		]);
		const held = app.vault.getFileByPath(pathOf('Cutter copy'));
		expect(await app.vault.read(held as NonNullable<typeof held>)).toBe(
			'mine, edited',
		);
		expect(created).toEqual([]);
	});
});
