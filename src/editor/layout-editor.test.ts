// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHEET_DESTINATION } from './layout-editor';
import { LayoutEditorView } from '../view/layout-editor-view';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { renderGrid } from '../view/grid-cells';
import { modalButton, modalIsOpen, openModal, pressModalButton } from '../test/modal';
import { encodeComponentCopy, layoutFingerprint } from '../parse/component-clipboard';
import { cardSet, CardSetConfig } from '../components/card-set';
import { App, Notice } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { cancel, pressDown, release } from '../test/pointer';
import { openView, showFile } from '../test/workspace';
import { ComponentConfig, GridPosition } from '../types';
import { getComponent, listComponentTypes, paletteEntries } from '../components';

/*
 * The layout editor, driven through its own DOM.
 *
 * This is the surface where every layout is authored, and it had no coverage
 * at all: it was unreachable while the obsidian stub carried only `Platform`
 * and `setIcon`, and by the time the stub grew `Setting`, the builders, an
 * in-memory vault and `Modal`, nothing came back to write the tests.
 *
 * **Driven through the pane it lives in**, not by calling `render` directly.
 * The editor asks its host for the two pieces of posture the pane owns — which
 * layout is open, and what is selected — so a test supplying its own host would
 * be testing the editor against a second answer to those, and the pane's own is
 * the one that ships.
 *
 * Everything below goes through the rendered controls rather than calling a
 * method, because almost the whole module is private — a test reaching past that
 * would be asserting on an implementation the editor is free to change. The
 * editor gives every control a `data-sheetsmith-focus` token so it can restore
 * focus across its own rebuilds; that token is a stable address, and these tests
 * use it as one.
 *
 * What is checked here is the editor's contract with the *file*: which edit
 * lands as which key, what is left out, and what is never touched. How it
 * looks is `docs/UI.md`'s business and the harness's.
 *
 * **Half the code these drive now lives in `config-panel.ts`, and the cases
 * stayed.** That is the same departure from §10 the gesture block below records,
 * and by now a different reason: `src/test/workspace.ts` and `src/test/plugin.ts`
 * exist, so a sibling file *can* open a real pane — `layout-editor-view.test.ts`
 * does. What it cannot import is the harness above, which is a test file's own
 * and not scaffolding (§2), and the panel has no entry point of its own anyway:
 * every case below reaches a form by pressing a tree row or a schematic block,
 * both of which are the outline's. Several make one claim about both regions at
 * once on purpose — a container that may hold nothing gets no grid *and* a
 * sentence saying why; a tab set draws no schematic *and* lists its tabs — and
 * splitting those means rewriting them, which is the one thing a movement may
 * not do.
 *
 * **The extraction itself left them untouched:** not one assertion changed and no
 * import either. Three were added *after* it, and the boundary matters because
 * commits are split against these records: `reads a typed definition back`,
 * `reads both fields back`, and `keeps an inline error on a field the rebuild
 * draws again`. Each is coverage the new seam owed — `commitPending` and the
 * errors map are the two members of `ConfigPanelHost` that carry state across a
 * rebuild, and nothing here could tell either of them from a no-op.
 */

/** A layout with one plain component and one that can act on a reset. */
function fixture(): Layout {
	return {
		name: 'Test sheet',
		columns: 12,
		components: [
			{
				id: 'armour',
				type: 'card',
				label: 'Armour class',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			{
				id: 'hit_points',
				type: 'pool',
				label: 'Hit points',
				position: { col: 3, row: 1, width: 4, height: 1 },
			},
		],
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest'],
	};
}

interface Harness {
	/** The pane's content element, which is the whole of what it draws into. */
	container: HTMLElement;
	pane: LayoutEditorView;
	app: App;
	/**
	 * The plugin the pane was opened on, for a case about a *setting* rather
	 * than a control — the pane's own reference is private, and reaching past
	 * that would be asserting on an implementation the view may change.
	 */
	plugin: ReturnType<typeof fakePlugin>;
	/** The layout as the file currently holds it. */
	stored: () => Promise<Layout>;
	/** The file's exact bytes, for the round-trip check. */
	raw: () => Promise<string>;
	/** Re-render, the way an edit does. */
	redraw: () => Promise<void>;
}

/** One turn of the event loop, which is what an unawaited render needs. */
async function tick(): Promise<void> {
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * The editor writes through a debounce and persists without awaiting, so a
 * test that asserted straight after a click would read the file as it was
 * before the edit. `flush` runs the pending write; the tick lets the unawaited
 * promise inside it, and the redraw it triggers, settle.
 */
async function settle(pane: LayoutEditorView): Promise<void> {
	pane.flush();
	await tick();
}

async function open(layout: Layout = fixture()): Promise<Harness> {
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	const path = `${LAYOUT_FOLDER}/${layout.name}.sheetsmith`;
	await app.vault.create(path, serialiseLayout(layout));

	const plugin = fakePlugin(app);
	const pane = await openView(app, document.body, LayoutEditorView, plugin);
	// The pane is bound to a file and never picks one for itself, so it is
	// opened on this one the way a click in the file explorer would.
	await showFile(pane, path);

	const raw = async () => {
		const file = app.vault.getFileByPath(path);
		if (!file) throw new Error(`${path} is gone`);
		return app.vault.read(file);
	};

	return {
		container: pane.contentEl,
		pane,
		app,
		plugin,
		raw,
		stored: async () => parseLayout(await raw()),
		redraw: async () => {
			pane.redraw();
			await tick();
		},
	};
}

/** The control the editor addresses by this focus token. */
function control<T extends HTMLElement = HTMLElement>(
	harness: Harness,
	token: string,
): T {
	const el = harness.container.querySelector(
		`[data-sheetsmith-focus="${token}"]`,
	);
	if (!el) throw new Error(`no control for "${token}"`);
	return el as T;
}

function has(harness: Harness, token: string): boolean {
	return (
		harness.container.querySelector(`[data-sheetsmith-focus="${token}"]`) !==
		null
	);
}

/** Open the component picker, where it is not open already. */
function openPicker(harness: Harness): void {
	const toggle = control<HTMLButtonElement>(harness, 'picker-toggle');
	if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
}

/**
 * Make one picker line active the way a press does, by the value that addresses
 * it: a type, or `type:index` for a palette entry.
 */
function pick(harness: Harness, value: string): void {
	openPicker(harness);
	const option = harness.container.querySelector<HTMLElement>(
		`[data-sheetsmith-choice="${value}"]`,
	);
	if (!option) throw new Error(`no picker line for "${value}"`);
	option.click();
}

/** Every line the picker is showing, by value, in the order it shows them. */
function pickerLines(harness: Harness): string[] {
	openPicker(harness);
	return Array.from(
		harness.container.querySelectorAll<HTMLElement>('[data-sheetsmith-choice]'),
	).map((option) => option.dataset.sheetsmithChoice ?? '');
}

/**
 * Type into a text field and leave it, which is what commits.
 *
 * Both events, because the editor does not use one wiring throughout: config
 * fields commit on `change` through `onCommit`, and the label field reacts to
 * `input` so the component row's heading tracks what is being typed. A test
 * firing only one would pass against half the form.
 */
function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input'));
	input.dispatchEvent(new Event('change'));
}

function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event('change'));
}

function toggle(input: HTMLInputElement, checked: boolean): void {
	input.checked = checked;
	input.dispatchEvent(new Event('change'));
}

/**
 * The checkbox in the setting row with this name.
 *
 * By row name rather than by focus token, which booleans now carry too: the
 * name is the label the author reads, which makes it the right thing for a test
 * to name. `settings.test.ts` is where the token itself is load bearing.
 */
function checkbox(harness: Harness, name: string): HTMLInputElement {
	for (const item of Array.from(
		harness.container.querySelectorAll('.setting-item'),
	)) {
		const label = item.querySelector('.setting-item-name')?.textContent;
		if (label !== name) continue;
		const input = item.querySelector('input[type="checkbox"]');
		if (input) return input as HTMLInputElement;
	}
	throw new Error(`no toggle in a row named "${name}"`);
}

/** The button in the open confirmation modal that goes through with it. */
function confirmAction(): void {
	const button = document.body.querySelector('.modal-container .mod-warning');
	if (!button) throw new Error('no confirmation is open');
	(button as HTMLButtonElement).click();
}

/**
 * Open a tree row's menu the way a press on its menu button does.
 *
 * The app's menu draws onto `document.body`, outside the pane, so what it holds
 * is read from there. A press with `detail` of 1 is a pointer's, which is the
 * route that shows the menu at the pointer rather than under the button.
 */
function openRowMenu(harness: Harness, id: string): void {
	control(harness, `tree-menu-${id}`).dispatchEvent(
		new MouseEvent('click', { bubbles: true, detail: 1 }),
	);
}

/** The open menu's lines, items and separators alike, in order. */
function menuLines(): string[] {
	return Array.from(document.body.querySelectorAll('.menu .menu-scroll > *')).map(
		(el) =>
			el.classList.contains('menu-separator')
				? '---'
				: (el.querySelector('.menu-item-title')?.textContent ?? ''),
	);
}

/** The open menu's item with this title. */
function menuItem(title: string): HTMLElement {
	for (const el of Array.from(document.body.querySelectorAll('.menu .menu-item'))) {
		if (el.querySelector('.menu-item-title')?.textContent === title) {
			return el as HTMLElement;
		}
	}
	throw new Error(`no menu item "${title}" among ${JSON.stringify(menuLines())}`);
}

/** Open a row's menu and press one of its items, by title. */
function pressMenu(harness: Harness, id: string, title: string): void {
	openRowMenu(harness, id);
	menuItem(title).click();
}

/** Remove a component from its tree row's menu, which asks nothing. */
function removeRow(harness: Harness, id: string): void {
	pressMenu(harness, id, 'Remove');
}

/** Press one of the tree's Alt+arrow chords on the control this token names. */
function chord(harness: Harness, token: string, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		key,
		altKey: true,
		bubbles: true,
		cancelable: true,
	});
	control(harness, token).dispatchEvent(event);
	return event;
}

/**
 * How many times the layout file has been written since this was installed.
 *
 * Counted rather than compared. Asserting the bytes are unchanged passes just as
 * well when the editor rewrote the file with identical content — and passes
 * trivially, so it would go on passing if the round trip ever broke. What the
 * three callers each claim is about *writes*: that opening a form is not an
 * edit, that a drag persists once on release rather than once a frame, and that
 * a run of arrow keys goes through one debounce.
 *
 * **When it is counted is half of what it says.** The two gesture callers make
 * opposite claims about the same number, and both are only readable either side
 * of a flush: the drag counts its write after a bare tick, before `settle` runs
 * any pending timer, so a debounced write there fails; the arrow run counts 0
 * before `settle` and 1 after. Count both after the flush and the two policies
 * are indistinguishable.
 */
function writes(harness: Harness): () => number {
	let count = 0;
	const modify = harness.app.vault.modify.bind(harness.app.vault);
	harness.app.vault.modify = async (file, content) => {
		count++;
		return modify(file, content);
	};
	return () => count;
}

/** A named setting row's text, for asserting on what the editor offers. */
function labels(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll('.setting-item-name'),
	).map((el) => el.textContent ?? '');
}

/**
 * Whose grid each container schematic draws, in the order they are stacked.
 *
 * The sheet's own schematic carries no id and is not in this list, so what comes
 * back is the containers: where the selection sits, then what it holds.
 */
function grids(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll('[data-sheetsmith-grid]'),
	).map((el) => (el as HTMLElement).dataset.sheetsmithGrid ?? '');
}

/** The subheadings the open component form is divided into. */
function groups(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll('.sheetsmith-form-group-title'),
	).map((el) => el.textContent ?? '');
}

let harness: Harness;

describe('opening a layout', () => {
	beforeEach(async () => {
		harness = await open();
	});

	it('lists every component in the layout', () => {
		expect(labels(harness)).toContain('Armour class');
		expect(labels(harness)).toContain('Hit points');
	});

	it('gives the preview a cell for each component', () => {
		expect(has(harness, 'preview-armour')).toBe(true);
		expect(has(harness, 'preview-hit_points')).toBe(true);
	});

	it('does not write the file for having been opened', async () => {
		// The claim is that opening a form is not an edit, and that is a claim
		// about writes rather than about bytes; `writes` carries the argument.
		const wrote = writes(harness);
		await settle(harness.pane);
		expect(wrote()).toBe(0);
	});

	it('restores the file exactly when an edit is undone', async () => {
		// Constraint 3 is about character notes, but a layout that comes back
		// spelled differently after a change and its reversal is the same
		// broken promise: the file is the user's, and the editor is not
		// entitled to reformat it in passing.
		const before = await harness.raw();

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		expect(await harness.raw()).not.toBe(before);

		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), '');
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
	});
});

describe('adding and removing a component', () => {
	beforeEach(async () => {
		harness = await open();
	});

	it('appends the chosen type and opens it for editing', async () => {
		pick(harness, 'track');
		pressAdd(harness);
		await settle(harness.pane);

		const components = (await harness.stored()).components;
		expect(components).toHaveLength(3);
		expect(components[2]?.type).toBe('track');
		// Opened, so the author lands in the form rather than having to find
		// the row they just created.
		expect(has(harness, `cfg-${components[2]?.id}-count`)).toBe(true);
	});

	it('offers every type, with each entry indented under the type it prefills', () => {
		// The vocabulary is still the whole catalog: an author who wants a plain
		// Track has to be able to ask for one, and an entry is a starting point
		// they then edit rather than a variant with capabilities of its own.
		const lines = pickerLines(harness);
		for (const type of listComponentTypes()) expect(lines).toContain(type);
		const checkbox = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-choice="track:0"]',
		);
		expect(checkbox?.querySelector('.sheetsmith-picker-name')?.textContent).toBe(
			'Checkbox',
		);
		// Indented by a class of its own rather than by figure spaces, and in the
		// group its type heads, directly under it.
		expect(checkbox?.classList.contains('sheetsmith-picker-entry')).toBe(true);
		expect(lines.indexOf('track:0')).toBe(lines.indexOf('track') + 1);
		const group = checkbox?.closest('[role="group"]');
		expect(group?.querySelector('[data-sheetsmith-choice="track"]')).not.toBeNull();
	});

	it('runs each type, then every prefill of it, then the next type', () => {
		/*
		 * The list's whole structure in one assertion, written as the rule rather
		 * than against the catalog of the day. The shape is what the line *value*
		 * scheme rests on: `paletteEntries` returns a list and the value is
		 * `type:index`, so a second entry is a second line rather than one
		 * displacing the other.
		 *
		 * Expected from `paletteEntries` — the registry — and not from
		 * `pickerCatalog`, which is the thing under test.
		 */
		expect(pickerLines(harness)).toEqual(
			listComponentTypes().flatMap((type) => [
				type,
				...paletteEntries(type).map((_entry, index) => `${type}:${index}`),
			]),
		);
	});

	it('adds one entry twice under names the layout parser accepts', async () => {
		/*
		 * The entry's name is also the label the component starts with, so two
		 * Inventories are two components asking for one label — and labels key
		 * note sections globally, which `parseLayout` refuses a duplicate of. The
		 * answer is the one the editor already had for two of anything:
		 * `uniqueLabel` suffixes the second and the id is derived from the label
		 * it settled on, so the second is "Inventory 2" and `inventory_2`. That is
		 * acceptable rather than merely tolerated — a second inventory is a real
		 * layout, and the suffix is the author's cue to rename it.
		 */
		pick(harness, 'table:0');
		pressAdd(harness);
		await settle(harness.pane);
		pick(harness, 'table:0');
		pressAdd(harness);
		await settle(harness.pane);

		// Through the parser, which is what would have thrown.
		const components = (await harness.stored()).components;
		expect(components.map((c) => c.label)).toContain('Inventory');
		expect(components.map((c) => c.label)).toContain('Inventory 2');
		expect(new Set(components.map((c) => c.id)).size).toBe(components.length);
	});

	it('writes the config of the entry its index names, for each entry on a type', async () => {
		/*
		 * The index in the option value is the only thing telling two entries on
		 * one type apart, so this walks every entry a type has rather than
		 * naming one — the first draft asserted that `table:1` is Features, which
		 * holds only until an entry is inserted above it and then fails while
		 * pointing at another entry's columns, which is not what broke.
		 *
		 * Expected from the registry, as the menu-run check above is, so what is
		 * compared is the component the editor wrote against the entry it was
		 * asked for.
		 */
		// **Whichever type offers two, asked of the registry rather than named.**
		// Table had two entries and has one since Features moved to Record set, so
		// a spelled-out type is a case that goes red for a reason unrelated to what
		// it tests. What the subject needs is only that some type offers more than
		// one, which is what the disambiguation is about.
		const type = listComponentTypes().find(
			(candidate) => paletteEntries(candidate).length > 1,
		);
		expect(type, 'no type offers two palette entries').toBeDefined();
		const entries = paletteEntries(type ?? '');
		// A loop over one entry would pass without exercising the disambiguation
		// at all, which is the whole subject here.
		expect(entries.length).toBeGreaterThan(1);

		for (const [index, entry] of entries.entries()) {
			pick(harness, `${type ?? ''}:${index}`);
			pressAdd(harness);
			await settle(harness.pane);

			const components = (await harness.stored()).components;
			const added = components[
				components.length - 1
			] as unknown as Record<string, unknown>;
			expect(added.type).toBe(type);
			// The entry's own name, so an author who chose Spellbook has a
			// component called Spellbook until they rename it.
			expect(added.label).toBe(entry.name);
			for (const [key, value] of Object.entries(entry.config)) {
				expect(added[key], `${entry.name} wrote ${key}`).toEqual(value);
			}
		}
	});

	it('writes the entry\'s config, its name and an ordinary component', async () => {
		pick(harness, 'track:0');
		pressAdd(harness);
		await settle(harness.pane);

		const components = (await harness.stored()).components;
		const added = components[components.length - 1];
		// A layout stores the component an entry produced and never the entry:
		// there is no palette key in the file, and the author edits this like
		// anything else.
		expect(added).toMatchObject({
			type: 'track',
			label: 'Checkbox',
			count: 1,
		});
		expect(added).not.toHaveProperty('palette');
		// And the form it opens is Track's own.
		expect(has(harness, `cfg-${added?.id ?? ''}-count`)).toBe(true);
	});

	it('gives every line its own sentence, a type\'s and an entry\'s alike', () => {
		/*
		 * SPEC §13's warning is that a menu nobody can read is worse than the type
		 * list it replaced. A bare type used to say nothing at all; it now has a
		 * description of its own, and an entry keeps its own.
		 */
		const sentence = (value: string): string =>
			harness.container.querySelector(
				`[data-sheetsmith-choice="${value}"] .sheetsmith-picker-description`,
			)?.textContent ?? '';
		openPicker(harness);
		expect(sentence('track:0')).toBe(paletteEntries('track')[0]?.description);
		expect(sentence('pool')).toBe(getComponent('pool')?.description);
		// An option is named by its name and described by its sentence.
		const option = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-choice="pool"]',
		);
		const describedBy = option?.getAttribute('aria-describedby') ?? '';
		expect(harness.container.querySelector(`#${describedBy}`)?.textContent).toBe(
			getComponent('pool')?.description,
		);
		const labelledBy = option?.getAttribute('aria-labelledby') ?? '';
		expect(harness.container.querySelector(`#${labelledBy}`)?.textContent).toBe('Pool');
	});

	it('names an entry against the whole sheet, as a type is named', async () => {
		pick(harness, 'track:0');
		pressAdd(harness);
		await settle(harness.pane);
		pick(harness, 'track:0');
		pressAdd(harness);
		await settle(harness.pane);

		const labelled = (await harness.stored()).components.map((c) => c.label);
		expect(labelled).toContain('Checkbox');
		expect(labelled).toContain('Checkbox 2');
	});

	it('removes from the row menu with no confirmation to take', async () => {
		// The confirmation moved to after the fact (`docs/features/layout-editor-tree.md`
		// §5): a notice saying what went, with an undo. So nothing is open to take.
		removeRow(harness, 'armour');
		expect(document.body.querySelector('.modal-container')).toBeNull();
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'hit_points',
		]);
	});
});

describe('editing a component', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
	});

	it('renames the label without moving the id', async () => {
		// The id is what formulas reference (SPEC §4.1), so a rename that
		// changed it would break every expression naming this component while
		// looking like a cosmetic edit.
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		const component = (await harness.stored()).components[0];
		expect(component?.label).toBe('Defence');
		expect(component?.id).toBe('armour');
	});

	it('writes a config value under the field\'s own key', async () => {
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).toMatchObject({ key: 'AC' });
	});

	it('leaves out a boolean that matches its own default', async () => {
		// `signed` defaults to true. Storing it anyway would make the config
		// carry a key that says nothing, and `visibleWhen` matches effective
		// values precisely so absence can mean the default (PATTERNS §8).
		toggle(checkbox(harness, 'Signed'), true);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).not.toHaveProperty('signed');

		toggle(checkbox(harness, 'Signed'), false);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).toMatchObject({ signed: false });
	});

	it('refuses a label another component already uses, and says so', async () => {
		/*
		 * The label keys a section in a flat note, so two components sharing one
		 * would have two forms writing the same heading. Rejected rather than
		 * disambiguated, because the author is renaming something and the name
		 * they typed is the one thing here they meant.
		 *
		 * **Added after the panel moved out.** The branch was the one validation
		 * site in the form that did not put its message in the errors map — the
		 * argument is optional, so nothing said so — and it had no case at all,
		 * which is why no mutation over the seam could reach it.
		 */
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'label-armour');
		type(input, 'Hit points');
		await settle(harness.pane);

		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(input.parentElement?.textContent).toContain(
			'Another component already uses this label.',
		);
		// The edit is refused, not applied under another name.
		const stored = await harness.stored();
		expect(stored.components[0]?.label).toBe('Armour class');
		expect(stored.components[1]?.label).toBe('Hit points');
	});

	it('keeps that refusal visible when the pane is rebuilt around it', async () => {
		/*
		 * `field-error.ts` states the policy this holds: every message goes
		 * through the errors map, because the pane rebuilds on most changes and
		 * the replay can only put back what the map holds. This is the case that
		 * makes the label field's duplicate branch obey it.
		 *
		 * **What it also pins is a question nobody has asked**, and
		 * `docs/PATTERNS.md` §11 holds it: the rebuild puts the *old, valid* label
		 * back in the field, so the message that survives is standing over text
		 * that no longer earns it. Three cases now assert that it survives. If the
		 * answer is that a refused edit's complaint should go with the text it was
		 * about, all three change together and that is the row's business, not
		 * this case's.
		 */
		// The pool, because a rebuild is what this needs and only a control that
		// may change what the form *offers* asks for one — a select does, and the
		// position fields deliberately do not, since a redraw would take the field
		// the author is typing in down with them.
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);

		type(control<HTMLInputElement>(harness, 'label-hit_points'), 'Armour class');
		choose(
			control<HTMLSelectElement>(harness, 'cfg-hit_points-maxSource'),
			'character',
		);
		await settle(harness.pane);

		const redrawn = control<HTMLInputElement>(harness, 'label-hit_points');
		expect(redrawn.value).toBe('Hit points');
		expect(redrawn.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(redrawn.parentElement?.textContent).toContain(
			'Another component already uses this label.',
		);
	});

	it('never touches the other components', async () => {
		const before = (await harness.stored()).components[1];
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		expect((await harness.stored()).components[1]).toEqual(before);
	});
});

/*
 * A formula field says what the parser makes of what it holds
 * (`docs/features/formula-field-errors.md`).
 *
 * Both moments are asserted here because they answer different failures: the
 * render half is what a hand-edited layout file needs, and the commit half is
 * what a blur needs on a panel that persists without redrawing.
 */
describe('a formula field that will not parse', () => {
	/** A card holding an expression a hand edit could have left behind. */
	function broken(): Layout {
		return {
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'armour',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
					derived: 'floor((value - 10) / 2',
					effective: 'value + mod.self',
				},
				{
					id: 'hit_points',
					type: 'pool',
					label: 'Hit points',
					position: { col: 3, row: 1, width: 4, height: 1 },
					reset: [{ trigger: 'Long rest', action: 'formula', to: 'max /' }],
				},
			] as unknown as Layout['components'],
			triggers: ['Long rest'],
		};
	}

	/** The message drawn under one field, or the empty string where there is none. */
	function problem(input: HTMLElement): string {
		return (
			input.parentElement?.querySelector('.sheetsmith-field-error')
				?.textContent ?? ''
		);
	}

	it('says so on the first paint of a stored expression', async () => {
		harness = await open(broken());
		const rewrites = writes(harness);
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(problem(input)).toBe('Expected ")" in formula.');
		// Drawing a form is not an edit: the message came from the model, not
		// from a commit this test provoked.
		expect(rewrites()).toBe(0);
	});

	it('says nothing about the field beside it, which parses', async () => {
		harness = await open(broken());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-effective');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(false);
		expect(problem(input)).toBe('');
	});

	it('stores what was typed and says what is wrong with it', async () => {
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		type(input, '10 + value +');
		await settle(harness.pane);

		expect(problem(input)).toBe('Expected a value in formula.');
		expect(input.value).toBe('10 + value +');
		// The record, not only the DOM: a field that refuses what its own
		// checker refuses is one an author cannot type into, so the commit is
		// unchanged and the text is in the file.
		expect((await harness.stored()).components[0]).toMatchObject({
			derived: '10 + value +',
		});
	});

	it('clears the message when the expression is corrected', async () => {
		harness = await open(broken());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		type(input, 'floor((value - 10) / 2)');
		await settle(harness.pane);

		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(false);
		expect(problem(input)).toBe('');
		expect((await harness.stored()).components[0]).toMatchObject({
			derived: 'floor((value - 10) / 2)',
		});
	});

	it('clears the message when the field is emptied', async () => {
		// Blank is a state the component reads rather than a hole: a Card with
		// no derived formula publishes its stored value.
		harness = await open(broken());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		type(input, '   ');
		await settle(harness.pane);

		expect(problem(input)).toBe('');
		expect((await harness.stored()).components[0]).not.toHaveProperty('derived');
	});

	it('reaches a reset binding too, which was this feature\'s largest cut', async () => {
		/*
		 * `reset.*.to` was reserved for the pass over `reset-field.ts` and
		 * `modifier-definitions-field.ts` so that its required rule and its
		 * parse rule would arrive together
		 * (`docs/features/reset-and-modifier-render-validation.md`). This case
		 * asserted the cut and now asserts that it was taken: the pane is what
		 * proves the two fields say the same thing about the same expression,
		 * since each module's own file drives only its own.
		 */
		harness = await open(broken());
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'reset-to-hit_points-0');
		expect(input.value).toBe('max /');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(problem(input)).toBe('Expected a value in formula.');
	});
});

describe('a field shown only under a condition', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);
	});

	it('is shown while the controlling key is absent and defaults to the match', async () => {
		// `max` is visible when maxSource is 'calculated', which is the first
		// option and therefore omitted from the config. The condition has to be
		// met by the absence, or a field could only ever be hidden in the
		// ordinary case — the opposite of what a default is for.
		expect((await harness.stored()).components[1]).not.toHaveProperty('maxSource');
		expect(has(harness, 'cfg-hit_points-max')).toBe(true);
	});

	it('is hidden once the controlling key says otherwise', async () => {
		choose(
			control<HTMLSelectElement>(harness, 'cfg-hit_points-maxSource'),
			'character',
		);
		await settle(harness.pane);
		expect(has(harness, 'cfg-hit_points-max')).toBe(false);
	});
});

describe('the reset binding', () => {
	// Asked of the component through `applyReset`, never inferred from its
	// type. The editor knowing that a Pool can be restored and a Card cannot
	// is exactly the coupling the component contract exists to prevent.

	it('is offered to a component that can act on a reset', async () => {
		harness = await open();
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);
		// The heading carries a count badge, so match its start.
		expect(groups(harness).some((t) => t.startsWith('Resets on'))).toBe(true);
	});

	it('is never offered to one that holds no state', async () => {
		// A binding on a component with nothing to restore is a control that
		// does nothing, which is worse than a missing one: it tells the layout
		// author they have configured something.
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		expect(groups(harness).some((t) => t.startsWith('Resets on'))).toBe(false);
	});
});

/*
 * The convention every control on this tab follows, held over the whole catalog
 * rather than one component at a time.
 *
 * `settings.ts` restores focus across a redraw by reading
 * `data-sheetsmith-focus` off whatever was focused, so a control without one is
 * a control focus falls off — and the boolean fields were exactly that for as
 * long as no boolean redrew the tab. Found by hand, on one field, after the
 * redraw arrived. It is mechanically checkable, so it is checked.
 */
describe('every control in a component form is addressable', () => {
	/** One component of every registered type, so a new one is covered on arrival. */
	function everyType(): Layout {
		return {
			name: 'Catalog',
			columns: 12,
			components: listComponentTypes().map((type, index) => ({
				id: `c${index}`,
				type,
				label: `C${index}`,
				position: { col: 1, row: index + 1, width: 2, height: 1 },
			})),
			triggers: ['Long rest'],
		};
	}

	it.each(listComponentTypes().map((type, index) => [type, index] as const))(
		'gives every field of a "%s" form a focus token',
		async (_type, index) => {
			harness = await open(everyType());
			control(harness, `edit-c${index}`).click();
			await settle(harness.pane);

			const form = harness.container.querySelector('.sheetsmith-component-form');
			expect(form).not.toBeNull();
			const fields = Array.from(
				(form as HTMLElement).querySelectorAll('input, select, textarea'),
			);
			// A form the query stopped finding would pass by iterating nothing.
			expect(fields.length).toBeGreaterThan(3);

			const bare = fields.filter((el) => {
				const host = el as HTMLElement;
				// On the control, or on the wrapper that actually takes focus.
				// Obsidian's toggle is a focusable `.checkbox-container` div around
				// an invisible checkbox, and the stub makes the input itself that
				// element — so requiring it on the input would describe the stub
				// rather than the app, and pass while the app kept losing focus.
				return (
					host.dataset.sheetsmithFocus === undefined &&
					host.parentElement?.dataset.sheetsmithFocus === undefined
				);
			});
			expect(
				bare.map(
					(el) =>
						`${el.tagName} ${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? ''}`,
				),
			).toEqual([]);
		},
	);
});

describe('a layout file the editor cannot read', () => {
	it('reports it rather than throwing', async () => {
		const app = new App();
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Broken.sheetsmith`, '{ not json');

		const pane = await openView(app, document.body, LayoutEditorView, fakePlugin(app));
		await showFile(pane, `${LAYOUT_FOLDER}/Broken.sheetsmith`);

		const error = pane.contentEl.querySelector('.sheetsmith-error');
		expect(error?.textContent).toContain('cannot be edited');
		// Named, because the pane opens on whatever file was clicked.
		expect(error?.textContent).toContain('"Broken"');
		// The picker survives, because it is how an author leaves a layout they
		// cannot edit — the message goes where the tree would be, under it.
		expect(
			pane.contentEl.querySelector('[data-sheetsmith-focus="layout-picker"]'),
		).not.toBeNull();
		// And no panel, so the two-column rule reserves no track: a grid column
		// the template declares is 620px wide whether or not anything is in it,
		// and one line of error text beside 620px of empty pane is the state this
		// pane was designed to stop inheriting from the settings tab.
		expect(
			pane.contentEl.querySelector('.sheetsmith-editor-panel'),
		).toBeNull();
	});
});

/*
 * Components inside components (SPEC §4.2).
 *
 * Nesting is where the prior art says the pain is, so the interim editor gets
 * the smallest thing that is honestly authorable: one level of disclosure in the
 * list, a destination on the add row, a schematic per open container, and a
 * removal that moves children out rather than deleting them. What is checked
 * here is the editor's contract with the file — which edit lands where, and what
 * survives a removal.
 */

/** A layout with a Group holding one card, and a plain card beside it. */
function nested(): Layout {
	return {
		name: 'Nested sheet',
		columns: 12,
		components: [
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 3, height: 1 },
					},
				],
			},
			{
				id: 'hit_points',
				type: 'pool',
				label: 'Hit points',
				position: { col: 7, row: 1, width: 4, height: 1 },
			},
		],
		triggers: ['Long rest'],
	};
}

/**
 * A layout two containers deep, plus a container holding nothing.
 *
 * `nested()` cannot reach either case: its only container is at the top level
 * and already has a child, so nothing there is at the depth that may hold
 * nothing, and nothing there has an absent `children`.
 */
function deep(): Layout {
	return {
		name: 'Deep sheet',
		columns: 12,
		components: [
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'melee',
						type: 'group',
						label: 'Melee',
						position: { col: 1, row: 1, width: 4, height: 1 },
						children: [
							{
								id: 'armour',
								type: 'card',
								label: 'Armour class',
								position: { col: 1, row: 1, width: 2, height: 1 },
							},
						],
					},
				],
			},
			{
				id: 'spellbook',
				type: 'group',
				label: 'Spellbook',
				position: { col: 7, row: 1, width: 4, height: 1 },
			},
		],
		triggers: ['Long rest'],
	};
}

/** The "Add component" row's destination dropdown, or nothing if absent. */
function destinations(harness: Harness): string[] | null {
	openPicker(harness);
	const select = harness.container.querySelector(
		'[data-sheetsmith-focus="add-destination"]',
	);
	if (!select) return null;
	return Array.from((select as HTMLSelectElement).options).map(
		(option) => option.text,
	);
}

/** Press **Add** on the component picker, opening it first where it is shut. */
function pressAdd(harness: Harness): void {
	openPicker(harness);
	control<HTMLButtonElement>(harness, 'picker-add').click();
}

/** Choose where the next insert goes, on the picker's action bar. */
function chooseDestination(harness: Harness, value: string): void {
	openPicker(harness);
	choose(control<HTMLSelectElement>(harness, 'add-destination'), value);
}

/** The picker's active line's value, read off the search field's own ARIA. */
function activeLine(harness: Harness): string {
	const id = control(harness, 'picker-search').getAttribute('aria-activedescendant');
	const option = id === null ? null : harness.container.querySelector<HTMLElement>(`#${id}`);
	return option?.dataset.sheetsmithChoice ?? '';
}

/** A key pressed on a picker control. */
function key(harness: Harness, token: string, name: string): void {
	control(harness, token).dispatchEvent(
		new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
	);
}

/** Type into the picker's search field. */
function search(harness: Harness, query: string): void {
	const field = control<HTMLInputElement>(harness, 'picker-search');
	field.value = query;
	field.dispatchEvent(new Event('input'));
}

describe('the component picker', () => {
	beforeEach(async () => {
		harness = await open();
	});

	it('opens from Choose, which says what it controls, onto the search field with Card active', () => {
		const toggle = control(harness, 'picker-toggle');
		expect(toggle.textContent).toBe('Choose');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(has(harness, 'picker-search')).toBe(false);
		toggle.click();
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.textContent).toBe('Done');
		const region = harness.container.querySelector(
			`#${toggle.getAttribute('aria-controls') ?? ''}`,
		);
		expect(region?.contains(control(harness, 'picker-search'))).toBe(true);
		expect(document.activeElement).toBe(control(harness, 'picker-search'));
		expect(activeLine(harness)).toBe(listComponentTypes()[0]);
		expect(activeLine(harness)).toBe('card');
	});

	it('moves the active line across groups with the arrows, stopping at both ends', () => {
		openPicker(harness);
		const lines = pickerLines(harness);
		key(harness, 'picker-search', 'ArrowUp');
		expect(activeLine(harness)).toBe(lines[0]);
		key(harness, 'picker-search', 'ArrowDown');
		expect(activeLine(harness)).toBe(lines[1]);
		key(harness, 'picker-search', 'ArrowDown');
		// Out of Card's group and into Card set's.
		expect(activeLine(harness)).toBe(lines[2]);
		for (let press = 0; press < lines.length + 2; press++) {
			key(harness, 'picker-search', 'ArrowDown');
		}
		expect(activeLine(harness)).toBe(lines.at(-1));
		// The list answers the same keys, and names the same line.
		key(harness, 'picker-list', 'ArrowUp');
		expect(activeLine(harness)).toBe(lines.at(-2));
		expect(control(harness, 'picker-list').getAttribute('aria-activedescendant')).toBe(
			control(harness, 'picker-search').getAttribute('aria-activedescendant'),
		);
	});

	it('adds the active line on Enter, and keeps focus in the search field', async () => {
		openPicker(harness);
		key(harness, 'picker-search', 'ArrowDown');
		key(harness, 'picker-search', 'Enter');
		await settle(harness.pane);
		const added = (await harness.stored()).components.at(-1);
		expect(added).toMatchObject({ type: 'card', label: 'Dropdown' });
		// The redraw rebuilt the field; focus is on the new one, so a second
		// Enter adds a second.
		expect(document.activeElement).toBe(control(harness, 'picker-search'));
	});

	it('adds on Enter from the list, and keeps focus on the list', async () => {
		pick(harness, 'pool');
		expect(document.activeElement).toBe(control(harness, 'picker-list'));
		key(harness, 'picker-list', 'Enter');
		await settle(harness.pane);
		expect((await harness.stored()).components.at(-1)).toMatchObject({ type: 'pool' });
		expect(document.activeElement).toBe(control(harness, 'picker-list'));
	});

	it('scrolls the field and the active line into view on opening, and never on Add', async () => {
		/*
		 * In a short pane the picker opens below the fold, and a focused field
		 * under the pinned bar is focus nobody can see (WCAG 2.4.11). Opening and
		 * moving the active line scroll; an insert's redraw must not, or the
		 * pane's own scroll restore would be undone by the picker.
		 */
		const scrolled: string[] = [];
		const spy = vi
			.spyOn(HTMLElement.prototype, 'scrollIntoView')
			.mockImplementation(function (this: HTMLElement) {
				scrolled.push(this.dataset.sheetsmithFocus ?? this.dataset.sheetsmithChoice ?? '');
			});
		try {
			openPicker(harness);
			expect(scrolled).toEqual(['card', 'picker-search']);
			key(harness, 'picker-search', 'ArrowDown');
			expect(scrolled.at(-1)).toBe('card:0');
			scrolled.length = 0;
			pressAdd(harness);
			await settle(harness.pane);
			expect(scrolled).toEqual([]);
		} finally {
			spy.mockRestore();
		}
	});

	it('leaves the outline scrolled where it was after Add', async () => {
		/*
		 * The picker holds no scroll of its own: it lives in the outline column,
		 * and the pane restores that column's scroll across every redraw
		 * (`layout-editor-view.ts` `redraw`). So "scroll kept" is that restore,
		 * reached through an insert — which also selects the new component, and
		 * nothing on that path moves the view: `ensureSelectionVisible` only
		 * switches Tab set tabs, and focus comes back with `preventScroll`.
		 * Happy-dom does not clamp `scrollTop` to a layout, which is what lets a
		 * number stand for a position here.
		 */
		pick(harness, 'pool');
		const outline = harness.container.querySelector<HTMLElement>(
			'.sheetsmith-editor-outline',
		);
		if (!outline) throw new Error('no outline');
		outline.scrollTop = 300;
		pressAdd(harness);
		await settle(harness.pane);
		const redrawn = harness.container.querySelector<HTMLElement>(
			'.sheetsmith-editor-outline',
		);
		expect(redrawn).not.toBe(outline);
		expect(redrawn?.scrollTop).toBe(300);
	});

	it('activates a line on a press and inserts nothing', async () => {
		const wrote = writes(harness);
		pick(harness, 'pool');
		await settle(harness.pane);
		expect(activeLine(harness)).toBe('pool');
		expect(document.activeElement).toBe(control(harness, 'picker-list'));
		expect(wrote()).toBe(0);
		expect((await harness.stored()).components).toHaveLength(2);
	});

	it('draws exactly one preview, inert and hidden from assistive tech', () => {
		for (const value of ['card', 'track', 'table:0']) {
			pick(harness, value);
			const previews = harness.container.querySelectorAll('.sheetsmith-picker-preview');
			expect(previews).toHaveLength(1);
			const preview = previews[0] as HTMLElement;
			expect(preview.hasAttribute('inert')).toBe(true);
			expect(preview.getAttribute('aria-hidden')).toBe('true');
			expect(preview.closest(`[data-sheetsmith-choice="${value}"]`)).not.toBeNull();
		}
	});

	it('labels an example for the bare types that draw one and for no other line', () => {
		const examples = ['card-set', 'roster', 'table', 'track', 'group', 'tab-set'];
		for (const value of pickerLines(harness)) {
			pick(harness, value);
			const option = harness.container.querySelector(
				`[data-sheetsmith-choice="${value}"]`,
			);
			const tagged = option?.querySelector('.sheetsmith-picker-example') !== null;
			const said = (option?.querySelector('.sheetsmith-picker-description')?.textContent ?? '')
				.includes('The preview is an example. It is added empty.');
			expect(tagged, `${value} tag`).toBe(examples.includes(value));
			expect(said, `${value} sentence`).toBe(examples.includes(value));
		}
	});

	it('draws a bare Track from its example, never from Checkbox', () => {
		pick(harness, 'track');
		const preview = harness.container.querySelector('.sheetsmith-picker-preview');
		// Five segments, and not Checkbox's one ring.
		expect(preview?.querySelectorAll('.sheetsmith-track-segment')).toHaveLength(5);
		expect(preview?.querySelector('.sheetsmith-level-ring')).toBeNull();
		pick(harness, 'track:0');
		const checkbox = harness.container.querySelector('.sheetsmith-picker-preview');
		expect(checkbox?.querySelector('.sheetsmith-level-ring')).not.toBeNull();
	});

	it('draws a container with two placeholder children', () => {
		pick(harness, 'tab-set');
		const preview = harness.container.querySelector('.sheetsmith-picker-preview');
		expect(preview?.textContent).toContain('Component 1');
		expect(preview?.textContent).toContain('Component 2');
		pick(harness, 'group');
		const group = harness.container.querySelector('.sheetsmith-picker-preview');
		expect(group?.querySelectorAll('.sheetsmith-subgrid .sheetsmith-cell')).toHaveLength(2);
	});

	it('inserts a bare type empty, never with its example', async () => {
		pick(harness, 'track');
		pressAdd(harness);
		await settle(harness.pane);
		const added = (await harness.stored()).components.at(-1) as unknown as Record<
			string,
			unknown
		>;
		expect(Object.keys(added).sort()).toEqual(['id', 'label', 'position', 'type']);
	});

	/*
	 * The example tag's sentence says a bare type "is added empty", and empty is
	 * not broken: a Track once arrived drawing a configuration error after its
	 * preview showed a working run (`docs/features/component-picker.md`
	 * § Amendment). Walked off the registry, so the next type is held to it
	 * without being named here.
	 */
	it('inserts every bare type without a configuration error', async () => {
		const canvasErrors = () =>
			harness.container.querySelectorAll('.sheetsmith-editor-canvas .sheetsmith-error');
		const cells = () =>
			harness.container.querySelectorAll('.sheetsmith-editor-canvas .sheetsmith-cell')
				.length;
		expect(canvasErrors()).toHaveLength(0);
		const types = listComponentTypes();
		expect(types.length).toBeGreaterThan(2);
		for (const type of types) {
			const before = cells();
			pick(harness, type);
			pressAdd(harness);
			await settle(harness.pane);
			// The insert really reached the canvas, so a clean canvas means
			// something.
			expect(cells(), `${type} drawn`).toBe(before + 1);
			expect(
				Array.from(canvasErrors()).map((error) => error.textContent),
				type,
			).toEqual([]);
		}
	});

	it('stays open after Add, keeping the query, the line and the report', async () => {
		openPicker(harness);
		search(harness, 'box');
		pick(harness, 'track:0');
		pressAdd(harness);
		await settle(harness.pane);

		expect(control(harness, 'picker-toggle').getAttribute('aria-expanded')).toBe('true');
		expect(control<HTMLInputElement>(harness, 'picker-search').value).toBe('box');
		expect(activeLine(harness)).toBe('track:0');
		const status = harness.container.querySelector('.sheetsmith-picker-status');
		expect(status?.getAttribute('role')).toBe('status');
		expect(status?.textContent).toBe('Added Checkbox on the sheet');
		// Focus is back on the control that added.
		expect(document.activeElement).toBe(control(harness, 'picker-add'));

		pressAdd(harness);
		await settle(harness.pane);
		const labels = (await harness.stored()).components.map((c) => c.label);
		expect(labels).toEqual(expect.arrayContaining(['Checkbox', 'Checkbox 2']));
		expect(
			harness.container.querySelector('.sheetsmith-picker-status')?.textContent,
		).toBe('Added Checkbox 2 on the sheet');
	});

	it('clears a query on Escape, then closes and hands focus back to Choose', () => {
		openPicker(harness);
		search(harness, 'box');
		key(harness, 'picker-search', 'Escape');
		expect(control<HTMLInputElement>(harness, 'picker-search').value).toBe('');
		expect(pickerLines(harness).length).toBeGreaterThan(2);
		key(harness, 'picker-search', 'Escape');
		expect(has(harness, 'picker-search')).toBe(false);
		expect(document.activeElement).toBe(control(harness, 'picker-toggle'));
	});

	it('closes on Done', () => {
		openPicker(harness);
		control(harness, 'picker-toggle').click();
		expect(has(harness, 'picker-search')).toBe(false);
		expect(control(harness, 'picker-toggle').textContent).toBe('Choose');
	});

	it('says what does work when a query finds nothing, and cannot add', () => {
		openPicker(harness);
		search(harness, 'stress');
		expect(pickerLines(harness)).toEqual([]);
		expect(harness.container.querySelector('.sheetsmith-picker-empty')?.textContent).toBe(
			'Nothing matches "stress". Search by shape: number, boxes, list, table, picture, text.',
		);
		expect(control<HTMLButtonElement>(harness, 'picker-add').disabled).toBe(true);
	});

	it('survives an undo and a panel edit while open', async () => {
		pick(harness, 'pool');
		pressAdd(harness);
		await settle(harness.pane);
		expect(await undo(harness)).toBe(true);
		expect(activeLine(harness)).toBe('pool');

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		expect(control(harness, 'picker-toggle').getAttribute('aria-expanded')).toBe('true');
		expect(activeLine(harness)).toBe('pool');
	});

	it('closes when the pane opens another layout', async () => {
		openPicker(harness);
		await harness.app.vault.create(
			`${LAYOUT_FOLDER}/Second sheet.sheetsmith`,
			serialiseLayout({ name: 'Second sheet', columns: 12, components: [], triggers: [] }),
		);
		await harness.redraw();
		expect(control(harness, 'picker-toggle').getAttribute('aria-expanded')).toBe('true');
		choose(
			control<HTMLSelectElement>(harness, 'layout-picker'),
			`${LAYOUT_FOLDER}/Second sheet.sheetsmith`,
		);
		await settle(harness.pane);
		expect(control(harness, 'picker-toggle').getAttribute('aria-expanded')).toBe('false');
		expect(has(harness, 'picker-search')).toBe(false);
	});
});

describe('the component picker on a layout with a container', () => {
	beforeEach(async () => {
		harness = await open(nested());
	});

	it('keeps the destination across inserts and reports where each went', async () => {
		pick(harness, 'card');
		chooseDestination(harness, 'defences');
		pressAdd(harness);
		await settle(harness.pane);
		expect(
			harness.container.querySelector('.sheetsmith-picker-status')?.textContent,
		).toBe('Added Card in Defences');
		expect(control<HTMLSelectElement>(harness, 'add-destination').value).toBe('defences');

		pressAdd(harness);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]?.children).toHaveLength(3);
	});

	it('draws no destination on a layout without a container', async () => {
		harness = await open();
		openPicker(harness);
		expect(has(harness, 'add-destination')).toBe(false);
	});
});

describe('the component list', () => {
	beforeEach(async () => {
		harness = await open(nested());
	});

	it('lists the children of a container beneath it, inside a group named for it', () => {
		// The same depth-first walk the sheet reads in, so what the list shows in
		// order is what the sheet reflows and tabs through in order: a child sits
		// between its container and the container's next neighbour.
		const rows = labels(harness);
		expect(rows.indexOf('Armour class')).toBe(rows.indexOf('Defences') + 1);
		expect(rows.indexOf('Hit points')).toBe(rows.indexOf('Armour class') + 1);
		// Nested in the DOM the way the layout nests, rather than indented by a
		// class on the row: the wrapper is what carries the step and the guide.
		const row = control(harness, 'edit-armour').closest('.setting-item');
		const wrapper = row?.parentElement;
		expect(wrapper?.classList.contains('sheetsmith-tree-children')).toBe(true);
		expect(wrapper?.getAttribute('role')).toBe('group');
		expect(wrapper?.getAttribute('aria-label')).toBe('Inside Defences');
		expect(row?.classList.contains('sheetsmith-row-child')).toBe(false);
		// Hit points is back at the top level, outside the wrapper.
		expect(
			control(harness, 'edit-hit_points').closest('.sheetsmith-tree-children'),
		).toBeNull();
	});

	it('orders the list by the walk the sheet reads in, not by file order', async () => {
		// One exported function, and this is the caller that could most easily
		// have had its own copy: the list used to iterate `layout.components` and
		// index into it. A layout whose file order and grid order disagree is the
		// only shape where the two are distinguishable.
		const scrambled = nested();
		scrambled.components.reverse();
		harness = await open(scrambled);

		const walked = walkComponents((await harness.stored()).components);
		expect(walked.map((entry) => entry.config.label)).toEqual([
			'Defences',
			'Armour class',
			'Hit points',
		]);
		const shown = labels(harness);
		const positions = walked.map((entry) => shown.indexOf(entry.config.label));
		expect(positions).not.toContain(-1);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	it('gives a child its own name and menu', () => {
		expect(has(harness, 'edit-armour')).toBe(true);
		expect(has(harness, 'tree-menu-armour')).toBe(true);
	});

	it('draws both the container and what it holds, live', () => {
		// The canvas draws every grid-placing container's own grid in the same
		// pass, whatever is selected (`docs/features/grid-canvas.md` §4) — so a
		// nested component's overlay always exists, unlike the interim
		// schematic which drew a container as one block with nothing reachable
		// inside it.
		expect(has(harness, 'preview-defences')).toBe(true);
		expect(has(harness, 'preview-armour')).toBe(true);
	});
});

describe('adding a component into a container', () => {
	beforeEach(async () => {
		harness = await open(nested());
	});

	it('offers the sheet and every container that may still take one', () => {
		expect(destinations(harness)).toEqual(['On the sheet', 'In Defences']);
	});

	it('puts the new component in the chosen container', async () => {
		pick(harness, 'card');
		chooseDestination(harness, 'defences',
		);
		pressAdd(harness);
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components).toHaveLength(2);
		expect(stored.components[0]?.children).toHaveLength(2);
		// Never wider than the grid it lands on: a child spanning past its
		// container's last column would open an implicit column.
		expect(stored.components[0]?.children?.[1]?.position).toMatchObject({
			col: 1,
			row: 2,
			width: 2,
		});
	});

	it('leaves it on the sheet where no container was chosen', async () => {
		pick(harness, 'card');
		pressAdd(harness);
		await settle(harness.pane);
		expect((await harness.stored()).components).toHaveLength(3);
	});

	it('names the new component against the whole sheet, not one level', async () => {
		// A label keys a note section and an id is what a formula writes, and
		// containment scopes neither — so a child may not take a name a
		// component in another container already has.
		pick(harness, 'pool');
		chooseDestination(harness, 'defences');
		pressAdd(harness);
		await settle(harness.pane);

		const added = (await harness.stored()).components[0]?.children?.[1];
		expect(added?.label).not.toBe('Hit points');
		expect(added?.id).not.toBe('hit_points');
	});

	it('puts a palette entry in a container, prefilled and named against the sheet', async () => {
		/*
		 * The composition none of the tests above reach: an entry, a container
		 * destination, and a name already taken somewhere else on the sheet. The
		 * three interact — the label comes from the entry rather than from the
		 * type, the position comes from the container rather than from the sheet,
		 * and uniqueness is checked against every component rather than against
		 * this container's children.
		 */
		pick(harness, 'track:0');
		pressAdd(harness);
		await settle(harness.pane);

		pick(harness, 'track:0');
		chooseDestination(harness, 'defences');
		pressAdd(harness);
		await settle(harness.pane);

		const stored = await harness.stored();
		const onSheet = stored.components.find((c) => c.label === 'Checkbox');
		const inside = stored.components[0]?.children?.at(-1);
		expect(onSheet).toBeDefined();
		// Containment scopes neither a label nor an id, so the child takes the
		// next name rather than the one its sibling outside already has.
		expect(inside?.label).toBe('Checkbox 2');
		expect(inside?.id).not.toBe(onSheet?.id);
		// Prefilled, on the child's own placement rather than the sheet's.
		expect(inside).toMatchObject({ type: 'track', count: 1 });
		expect(inside?.position.col).toBe(1);
	});

	it('offers no container that is already two deep', async () => {
		// The parser refuses a third container, so the editor must not be able to
		// walk into it. A Group inside a Group is still a destination for a card;
		// a component inside *that* is not a destination at all.
		pick(harness, 'group');
		chooseDestination(harness, 'defences');
		pressAdd(harness);
		await settle(harness.pane);

		const inner = (await harness.stored()).components[0]?.children?.[1];
		expect(inner?.type).toBe('group');
		// The inner group is offered; nothing below it can be, because it has no
		// children to be a container of yet — and once it has, it is two deep.
		expect(destinations(harness)).toEqual([
			'On the sheet',
			'In Defences',
			`\u2007\u2007In ${inner?.label ?? ''}`,
		]);

		pick(harness, 'group');
		chooseDestination(harness, inner?.id ?? '',
		);
		pressAdd(harness);
		await settle(harness.pane);

		// Three containers deep is where it stops being offered.
		const deepest = (await harness.stored()).components[0]?.children?.[1]
			?.children?.[0];
		expect(deepest?.type).toBe('group');
		expect(destinations(harness)).not.toContain(
			`\u2007\u2007\u2007\u2007In ${deepest?.label ?? ''}`,
		);
	});

	it('offers no destination at all where the layout has no container', async () => {
		// A dropdown naming the sheet and nothing else says a layout has
		// containers when it has none.
		harness = await open();
		expect(destinations(harness)).toBeNull();
	});
});

describe('removing a container', () => {
	beforeEach(async () => {
		harness = await open(nested());
	});

	it('says what happened to the components inside it, after the fact', async () => {
		Notice.instances = [];
		removeRow(harness, 'defences');
		await settle(harness.pane);
		expect(Notice.instances.at(-1)?.messageEl.textContent).toBe(
			'Removed "Defences". The component inside it moved to the bottom of the sheet. Undo',
		);
	});

	it('keeps its children, at the top level', async () => {
		// A component config is not character data, but losing six components'
		// formulas to one click is the same failure in miniature — and the modal
		// only ever promised that the notes survived.
		removeRow(harness, 'defences');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual(['hit_points', 'armour']);
		const moved = stored.components[1];
		expect(moved?.children).toBeUndefined();
		// At the bottom of the sheet, where a newly added component goes, so
		// nothing arrives overlapping.
		expect(moved?.position).toMatchObject({ col: 1, row: 2, width: 3 });
	});

	it('removes a child without touching its container', async () => {
		removeRow(harness, 'armour');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
		]);
		expect(stored.components[0]?.children).toBeUndefined();
	});

	it('stacks two promoted children without overlapping each other or a sibling', async () => {
		// `nextFreeRow` is recomputed against `layout.components` fresh on each
		// iteration of the promotion loop, so it already sees the previous
		// child once pushed — this is the case that would show it if it did not.
		harness = await open(containerWithTwoChildren());
		removeRow(harness, 'defences');
		await settle(harness.pane);

		const stored = await harness.stored();
		const armour = stored.components.find((c) => c.id === 'armour');
		const shield = stored.components.find((c) => c.id === 'shield');
		const hitPoints = stored.components.find((c) => c.id === 'hit_points');
		expect(armour?.position).toEqual({ col: 1, row: 2, width: 3, height: 1 });
		expect(shield?.position).toEqual({ col: 1, row: 3, width: 3, height: 1 });
		// Untouched: it was never a held child.
		expect(hitPoints?.position).toEqual({ col: 7, row: 1, width: 4, height: 1 });
	});

	it('promotes a container holding a container, keeping the grandchild subtree intact', async () => {
		harness = await open(deep());
		removeRow(harness, 'defences');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual(['spellbook', 'melee']);
		const melee = stored.components.find((c) => c.id === 'melee');
		expect(melee?.position).toEqual({ col: 1, row: 2, width: 4, height: 1 });
		// Untouched: its own children are still relative to its own subgrid,
		// which does not depend on where `melee` itself now sits.
		expect(melee?.children).toEqual([
			{
				id: 'armour',
				type: 'card',
				label: 'Armour class',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
		]);
	});

	it('gives a promoted tab the size it was actually drawn at, not its own stale one', async () => {
		/*
		 * A container that is itself a tab is never sized by its own stored
		 * width/height while nested — `innerPlacement` (`view/grid-cells.ts`)
		 * draws it at the tab set's own placement instead, so its own numbers
		 * are free to go stale exactly as `staleTab()` above demonstrates for
		 * rendering. Removing the tab set promotes each tab as a direct held
		 * child, and until this was fixed the promotion copied that stale
		 * width/height straight onto a now-independent top-level container:
		 * `combat` came out 4x2 while its own child `strike` was placed at
		 * row 4, landing `strike` entirely outside its own container's box —
		 * and directly on top of `spells`, promoted right after it. Constraint
		 * 4 is not about `strike`'s section text here, but the same failure in
		 * miniature: character data surviving into a placement that overlaps
		 * another component is not "kept".
		 */
		harness = await open(staleTabSheet());
		removeRow(harness, 'pages');
		await settle(harness.pane);

		const stored = await harness.stored();
		const combat = stored.components.find((c) => c.id === 'combat');
		const spells = stored.components.find((c) => c.id === 'spells');
		const strike = combat?.children?.find((c) => c.id === 'strike');
		// The tab set's own real size (8x5), not the stale stored one (4x2).
		expect(combat?.position).toEqual({ col: 1, row: 2, width: 8, height: 5 });
		expect(strike?.position).toEqual({ col: 1, row: 4, width: 2, height: 1 });
		// `strike`'s row is relative to `combat`'s own subgrid, so it has to
		// fit inside `combat`'s own declared height in that same local space —
		// which the stale 4x2 did not, and the real 8x5 does.
		const strikeBottom = (strike?.position.row ?? 0) + (strike?.position.height ?? 0) - 1;
		expect(strikeBottom).toBeLessThanOrEqual(combat?.position.height ?? 0);
		// `spells` starts only after `combat`'s real (not stale) height.
		expect(spells?.position.row).toBe(7);
	});
});

function staleTabSheet(): Layout {
	return {
		name: 'Stale tab sheet',
		columns: 12,
		components: [
			{
				id: 'pages',
				type: 'tab-set',
				label: 'Pages',
				position: { col: 1, row: 1, width: 8, height: 5 },
				children: [
					{
						id: 'combat',
						type: 'group',
						label: 'Combat',
						// Stale: what the add row wrote when the tab set was smaller.
						position: { col: 1, row: 1, width: 4, height: 2 },
						children: [
							{
								id: 'strike',
								type: 'card',
								label: 'Strike bonus',
								// Placed using the tab set's real, current size (8x5),
								// which `innerPlacement` supplies while nested.
								position: { col: 1, row: 4, width: 2, height: 1 },
							},
						],
					},
					{
						id: 'spells',
						type: 'group',
						label: 'Spells',
						position: { col: 1, row: 1, width: 8, height: 5 },
					},
				],
			},
			{
				id: 'other',
				type: 'card',
				label: 'Other',
				position: { col: 9, row: 1, width: 2, height: 1 },
			},
		],
		triggers: [],
	};
}

function containerWithTwoChildren(): Layout {
	return {
		name: 'Two children sheet',
		columns: 12,
		components: [
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 3, height: 1 },
					},
					{
						id: 'shield',
						type: 'card',
						label: 'Shield',
						position: { col: 4, row: 1, width: 3, height: 1 },
					},
				],
			},
			{
				id: 'hit_points',
				type: 'pool',
				label: 'Hit points',
				position: { col: 7, row: 1, width: 4, height: 1 },
			},
		],
		triggers: ['Long rest'],
	};
}

describe('a container that may hold nothing', () => {
	/*
	 * The add row and the form have to give one answer. The add row withholds a
	 * container two levels deep as a destination, correctly; the form was still
	 * offering that same container a grid to fill and a sentence saying it holds
	 * components on it — which is also how the empty `children` of the finding
	 * above got written onto one.
	 */
	beforeEach(async () => {
		harness = await open(deep());
		pick(harness, 'group');
		chooseDestination(harness, 'melee');
		pressAdd(harness);
		await settle(harness.pane);
	});

	it('is not offered a grid to put components on', async () => {
		const inner = (await harness.stored()).components[0]?.children?.[0]
			?.children?.[1];
		expect(inner?.type).toBe('group');
		// A grid of its own is what it does not get, whatever else the canvas
		// is showing — `melee`'s own grid is drawn either way, because it has a
		// position and four editable numbers with no grid to read them against
		// is worse than no mark at all.
		expect(grids(harness)).toContain('melee');
		expect(grids(harness)).not.toContain(inner?.id);
	});

	it('says why, rather than saying nothing', () => {
		// The author picked this type deliberately, so silence reads as a
		// container that simply does not work.
		expect(harness.container.textContent).toContain(
			'sits inside two containers, so it can hold nothing',
		);
	});

	it('still offers a grid to a container that may hold one', async () => {
		// The other side of the same rule: `melee` is one level in, so it takes
		// children and gets its own grid — live and always drawn now, not
		// gated behind selecting it.
		expect(grids(harness)).toContain('melee');
		expect(grids(harness)).toContain('defences');
	});

	it('draws the grid a nested component sits on, and marks its block', async () => {
		/*
		 * The panel offers `col`, `row`, `width` and `height` for anything with a
		 * placement, wherever it sits. Those four numbers address one grid, and
		 * the canvas draws every such grid at once, so the grid a selected card
		 * sits on is always already on screen — closing the UI §12 row the
		 * grid canvas spec names.
		 */
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		expect(grids(harness)).toContain('melee');
		expect(has(harness, 'pos-armour-col')).toBe(true);
		expect(
			control(harness, 'preview-armour').classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
	});
});

describe('drawing a container form is not an edit', () => {
	it('does not write a children key for a container that holds nothing', async () => {
		// A schematic reads the list; it must not create one. `??=` here wrote
		// `children: []` into the config for having drawn a form, which is the
		// editor touching a key nothing had put anything in (PATTERNS §7).
		//
		// Asserted after an unrelated edit, because drawing a form persists
		// nothing on its own: the mutation sat in memory until the next save
		// carried it, which is exactly what made it invisible.
		harness = await open(deep());
		control(harness, 'edit-spellbook').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-spellbook'), 'Spells');
		await settle(harness.pane);

		expect((await harness.stored()).components[1]?.label).toBe('Spells');
		expect(await harness.raw()).not.toContain('"children": []');
	});

	it('keeps saving after a container two deep has been opened', async () => {
		// The bite, driven rather than described. A component two containers
		// deep may hold nothing, so a `children: []` written onto one is a
		// layout `parseLayout` refuses — and `persist` validates before it
		// writes, so the file stays intact while every later save is silently
		// refused and the author loses edits to a message about a depth rule
		// they never broke.
		harness = await open(deep());
		pick(harness, 'group');
		chooseDestination(harness, 'melee');
		pressAdd(harness);
		await settle(harness.pane);

		const added = (await harness.stored()).components[0]?.children?.[0]
			?.children?.[1];
		expect(added?.type).toBe('group');
		// Its form is open, which is what used to create the key.
		expect(has(harness, `label-${added?.id ?? ''}`)).toBe(true);

		type(control<HTMLInputElement>(harness, `label-${added?.id ?? ''}`), 'Renamed');
		await settle(harness.pane);
		expect(
			(await harness.stored()).components[0]?.children?.[0]?.children?.[1]
				?.label,
		).toBe('Renamed');
	});
});

describe('the form of an open container', () => {
	beforeEach(async () => {
		harness = await open(nested());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);
	});

	it('offers the container its own settings and nothing it does not have', () => {
		// A group has one setting. This asserted a withdrawal until the collapse
		// went (SPEC §13): `Hide the heading` was offered only while
		// `Collapsible` was off, and with no collapse there is no combination to
		// withdraw. Kept, pointing the other way, because the failure it now
		// catches is the one that matters — a form that offered a container the
		// fields of the component it used to be.
		expect(labels(harness)).toContain('Hide the heading');
		expect(labels(harness)).not.toContain('Collapsible');
		expect(labels(harness)).not.toContain('Start collapsed');
	});

	it('draws a grid for the children, on the container\'s own grid, live', () => {
		// Found by id rather than by counting how many grids are on screen —
		// the canvas draws every container's grid at once now, not only a
		// selected one.
		const defencesGrid = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-grid="defences"]',
		);
		// Six columns, which is the container's width rather than the layout's.
		expect(defencesGrid?.style.getPropertyValue('--sheetsmith-columns')).toBe(
			'6',
		);
		expect(defencesGrid?.querySelector('.sheetsmith-cell')).not.toBeNull();
	});
});

/** A layout whose container shows one child at a time, which is a Tab set. */
function tabbed(): Layout {
	return {
		name: 'Tabbed sheet',
		columns: 12,
		components: [
			{
				id: 'pages',
				type: 'tab-set',
				label: 'Pages',
				position: { col: 1, row: 1, width: 6, height: 3 },
				children: [
					// Every tab at the same position, which is the ordinary case and
					// the whole reason a grid cannot edit these.
					{
						id: 'combat',
						type: 'card',
						label: 'Combat',
						position: { col: 1, row: 1, width: 6, height: 3 },
					},
					{
						id: 'spells',
						type: 'table',
						label: 'Spells',
						position: { col: 1, row: 1, width: 6, height: 3 },
					},
					{
						id: 'rest',
						type: 'group',
						label: 'Rest',
						position: { col: 1, row: 1, width: 6, height: 3 },
					},
				],
			},
		],
		triggers: [],
	};
}

describe('a container that shows one child at a time', () => {
	/*
	 * The editor half of Tab set, and it is the half that was broken first: every
	 * tab sits at the same position, so the grid schematic drew all three on top
	 * of one another and `findOverlaps` reported each as overlapping the others.
	 * A grid could not have edited the one thing there is to edit either, because
	 * the order of a strip is not a rectangle.
	 */
	let harness: Harness;

	beforeEach(async () => {
		harness = await open(tabbed());
		control(harness, 'edit-pages').click();
		await settle(harness.pane);
	});

	it('draws no schematic for it, and lists its tabs in order instead', async () => {
		// A tab has no placement, so there is nothing to drag it onto — where
		// an open Group gets its own grid, the tab set gets none.
		expect(grids(harness)).not.toContain('pages');
		expect(labels(harness)).toContain('1. Combat');
		expect(labels(harness)).toContain('2. Spells');
		expect(labels(harness)).toContain('3. Rest');
	});

	it('offers no position fields on a tab', async () => {
		// None of the four is read for a tab, and a field that edits a number
		// nothing reads is worse than no field.
		control(harness, 'edit-spells').click();
		await settle(harness.pane);
		expect(has(harness, 'pos-spells-col')).toBe(false);
		expect(has(harness, 'pos-spells-row')).toBe(false);
		expect(has(harness, 'pos-spells-width')).toBe(false);
		expect(has(harness, 'pos-spells-height')).toBe(false);
		// And still offers everything a component's form is for.
		expect(has(harness, 'label-spells')).toBe(true);
	});

	it('still offers position fields on a child that is placed', async () => {
		// The vacuity guard on the test above: if the fields had simply stopped
		// rendering everywhere, both would pass and neither would mean anything.
		const grouped = await open(nested());
		control(grouped, 'edit-armour').click();
		await settle(grouped.pane);
		expect(has(grouped, 'pos-armour-col')).toBe(true);
	});

	it('reorders the tabs, and that is what the strip order is', async () => {
		control(harness, 'tab-down-combat').click();
		await settle(harness.pane);
		const stored = await harness.stored();
		expect(stored.components[0]?.children?.map((tab) => tab.id)).toEqual([
			'spells',
			'combat',
			'rest',
		]);
	});

	it('will not move the first tab earlier or the last later', async () => {
		// The outcome, not the styling: the buttons are disabled, and `moveItem`
		// refuses an out-of-range move besides, so pressing them anyway has to
		// leave the order alone. Asserting the class would have been asserting
		// which of two `setDisabled` implementations the stub happens to be.
		const first = control<HTMLElement>(harness, 'tab-up-combat');
		const last = control<HTMLElement>(harness, 'tab-down-rest');
		expect(first.hasAttribute('disabled')).toBe(true);
		expect(last.hasAttribute('disabled')).toBe(true);
		first.click();
		last.click();
		await settle(harness.pane);
		expect(
			(await harness.stored()).components[0]?.children?.map((tab) => tab.id),
		).toEqual(['combat', 'spells', 'rest']);
	});

	it('gives a tab it adds the container\'s own size rather than a free row', async () => {
		// The numbers are not read, but they are in the file: `row: 4` on a tab
		// would tell a hand-editor it sits somewhere. The box it actually fills is
		// the honest thing to write.
		chooseDestination(harness, 'pages');
		pressAdd(harness);
		await settle(harness.pane);
		const added = (await harness.stored()).components[0]?.children?.[3];
		expect(added?.position).toEqual({ col: 1, row: 1, width: 6, height: 3 });
	});
});

describe('a container that is itself a tab', () => {
	/*
	 * The one place a container's own four numbers are read by nothing: a Group
	 * that is a tab fills the tab set's panel, so the tab set's placement is the
	 * box its children sit on.
	 *
	 * This is a regression fixture rather than an ordinary one. The editor used to
	 * draw this schematic from the Group's own stored width — the number the add
	 * row copies off the parent at creation and nothing keeps in step — so
	 * resizing the tab set afterwards left the sheet laying the children out on
	 * the new width while the editor drew them, described them and clamped every
	 * drag to the old one. The stored width here is deliberately the stale value.
	 */
	function staleTab(): Layout {
		return {
			name: 'Resized sheet',
			columns: 12,
			components: [
				{
					id: 'pages',
					type: 'tab-set',
					label: 'Pages',
					// Widened since the tab was added.
					position: { col: 1, row: 1, width: 6, height: 3 },
					children: [
						{
							id: 'combat',
							type: 'group',
							label: 'Combat',
							// What the add row wrote when the set was 4 wide.
							position: { col: 1, row: 1, width: 4, height: 3 },
							children: [
								{
									id: 'strike',
									type: 'card',
									label: 'Strike bonus',
									position: { col: 1, row: 1, width: 2, height: 1 },
								},
							],
						},
					],
				},
			],
			triggers: [],
		};
	}

	it('draws its grid at the tab set\'s width, not its own stale one', async () => {
		const harness = await open(staleTab());
		const combatGrid = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-grid="combat"]',
		);
		// Six, the tab set's. Four would be the Group's own stored width, which is
		// what the sheet ignores and what this used to draw.
		expect(combatGrid?.style.getPropertyValue('--sheetsmith-columns')).toBe(
			'6',
		);
	});

	it('draws the declared rows, so the preview shows the box not the content', async () => {
		// The premise of a tab set is that its box is its placement — and the
		// canvas is the same real `openSubgrid` the sheet itself opens, so an
		// author sees the same box on both. The box arrives as a min-height
		// floor rather than a row template, so the rows themselves stay
		// content-sized like the sheet's own (see `openSubgrid`). Three rows
		// here rather than four, because the stale fixture's tab set is what
		// governs — `innerPlacement` again, the same function the columns come
		// from.
		const harness = await open(staleTab());
		const combatGrid = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-grid="combat"]',
		);
		expect(combatGrid?.style.minHeight).toBe(
			'calc(3 * var(--sheetsmith-grid-row))',
		);
	});

	it('leaves the sheet\'s own schematic to grow, as the sheet does', async () => {
		// Not an omission: the top-level grid carries no declared height, so the
		// sheet grows down as components are added. A floor here would preview a
		// box the sheet does not have — the opposite of the bug above, and the
		// reason `rows` is optional rather than always set.
		const harness = await open(staleTab());
		const sheet = harness.container.querySelector(
			'.sheetsmith-editor-canvas .sheetsmith-grid',
		) as HTMLElement;
		expect(sheet.style.minHeight).toBe('');
	});

	it('agrees with the sheet, which is the divergence that mattered', async () => {
		// Both drawings through one function: the canvas's own grid for this
		// container and the subgrid `renderGrid` opens for the same component —
		// which on the canvas is now literally the same call, since the canvas
		// draws through `renderGrid` directly rather than a copy of it.
		// Asserted against each other rather than against 6 twice, so a change
		// to either side has to move both.
		const layout = staleTab();
		const harness = await open(layout);
		const drawn = harness.container
			.querySelector<HTMLElement>('[data-sheetsmith-grid="combat"]')
			?.style.getPropertyValue('--sheetsmith-columns');

		const stage = document.createElement('div');
		document.body.appendChild(stage);
		const walk = walkComponents(layout.components);
		renderGrid(
			stage,
			walk,
			walk.map(({ config }) => ({
				config,
				component: getComponent(config.type),
				data: null,
				error: null,
			})),
			() => ({
				resolved: {},
				resolveField: () => null,
				onChange: () => undefined,
			}),
		);
		const sheet = stage.querySelector<HTMLElement>('.sheetsmith-grid');
		// Vacuity guard: two empty strings would compare equal and this test would
		// pass on a schematic that had stopped setting the property at all.
		expect(drawn).not.toBe('');
		expect(sheet?.style.getPropertyValue('--sheetsmith-columns')).toBe(drawn);
		stage.remove();
	});
});

describe('overlap inside a tab, and never across tabs', () => {
	/*
	 * `findOverlaps` runs per schematic over one list, so which blocks can be
	 * reported as overlapping each other is decided entirely by which list a
	 * schematic draws. That makes "never across tabs" true by construction rather
	 * than by a check: tabs share one position by definition, and no schematic
	 * ever draws them, so there is nothing to compare.
	 *
	 * What is left to assert is the other half — that a tab's own children are
	 * still compared with each other, on the container tab's own schematic. This
	 * feature's criterion named the tab set's schematic as the driver, which the
	 * editor deliberately does not create; corrected, and driven here.
	 */
	function overlappingTabs(): Layout {
		const fill = { col: 1, row: 1, width: 6, height: 2 };
		return {
			name: 'Overlapping sheet',
			columns: 12,
			components: [
				{
					id: 'pages',
					type: 'tab-set',
					label: 'Pages',
					position: { col: 1, row: 1, width: 6, height: 2 },
					children: [
						{
							id: 'combat',
							type: 'group',
							label: 'Combat',
							position: fill,
							children: [
								// Two blocks on one cell of the Combat tab's own grid.
								{
									id: 'one',
									type: 'card',
									label: 'One',
									position: { col: 1, row: 1, width: 3, height: 1 },
								},
								{
									id: 'two',
									type: 'card',
									label: 'Two',
									position: { col: 1, row: 1, width: 3, height: 1 },
								},
							],
						},
						{
							// Same position as Combat's children, but on another tab's
							// grid entirely: it must never be implicated.
							id: 'spells',
							type: 'group',
							label: 'Spells',
							position: fill,
							children: [
								{
									id: 'three',
									type: 'card',
									label: 'Three',
									position: { col: 1, row: 1, width: 3, height: 1 },
								},
							],
						},
					],
				},
			],
			triggers: [],
		};
	}

	/** The label an overlay's own `describeCell` aria-label leads with. */
	function overlayLabel(el: Element): string | undefined {
		return el.getAttribute('aria-label')?.split(':')[0];
	}

	it('marks the two blocks sharing a cell inside the open tab', async () => {
		const harness = await open(overlappingTabs());

		// Combat's own grid, always drawn now rather than gated behind
		// selecting it — the tab set itself contributes none.
		const combatGrid = harness.container.querySelector(
			'[data-sheetsmith-grid="combat"]',
		);
		const marked = Array.from(
			combatGrid?.querySelectorAll('.sheetsmith-preview-overlap') ?? [],
		).map(overlayLabel);
		expect(marked.sort()).toEqual(['One', 'Two']);
	});

	it('draws one cell per component, in the order the list holds them', async () => {
		/*
		 * The invariant `markOverlaps` rests on, and the reason it is worth an
		 * assertion of its own.
		 *
		 * The two cases either side of this one check the marks as `wireLevel`
		 * paints them, and there the mark is set inside the same loop that
		 * wires the cell, so it cannot land on the wrong one. The *repaint* is
		 * the hazard: `markOverlaps` maps `schematic.el`'s direct children onto
		 * `schematic.components` **by index**, and `renderGrid` keys by
		 * identity for exactly the reason that breaks — a list indexed against
		 * another breaks silently the moment either side grows a filter, which
		 * is how those two diverged once already.
		 */
		const layout = overlappingTabs();
		const harness = await open(layout);

		// Scoped to one level's *direct* cells, since combat's own grid is now
		// genuinely nested inside the top grid's own DOM (live rendering,
		// unlike the interim schematic's separate, sibling elements).
		const cellsIn = (grid: Element): (string | undefined)[] =>
			Array.from(grid.children).map((cell) =>
				overlayLabel(cell.querySelector(':scope > .sheetsmith-canvas-overlay')!),
			);

		const tabs = layout.components[0]?.children ?? [];
		const combat = tabs.find((tab) => tab.id === 'combat')?.children ?? [];
		expect(combat.length).toBeGreaterThan(1);

		const topGrid = harness.container.querySelector(
			'.sheetsmith-editor-canvas .sheetsmith-grid',
		) as Element;
		const combatGrid = harness.container.querySelector(
			'[data-sheetsmith-grid="combat"]',
		) as Element;
		expect(cellsIn(topGrid)).toEqual(
			layout.components.map((component) => component.label),
		);
		expect(cellsIn(combatGrid)).toEqual(combat.map((child) => child.label));
	});

	it('never marks a block on another tab, whatever position it shares', async () => {
		const harness = await open(overlappingTabs());
		// "Three" sits at the same coordinates as both of the above and is on no
		// grid that draws them, so it is marked nowhere.
		const all = Array.from(
			harness.container.querySelectorAll('.sheetsmith-preview-overlap'),
		).map(overlayLabel);
		expect(all).not.toContain('Three');
		// And the tabs themselves, which share one position, are never compared:
		// no grid draws them, so neither can be marked.
		expect(all).not.toContain('Combat');
		expect(all).not.toContain('Spells');
		// Vacuity guard: One and Two are still marked, so this is not passing
		// because nothing was found at all.
		expect(all.sort()).toEqual(['One', 'Two']);
	});
});

/*
 * The two-column list field, under two vocabularies.
 *
 * A Card set's entries are a key and a full name; a Card's options are a value
 * and a label, and they could not be spelled `key` and `name` because a Card
 * already has a `key` (SPEC §13). So the field takes its two property names and
 * its two headings from the field spec, and what is checked here is that both
 * callers get their own words out of one editor.
 */
function twoLists(): Layout {
	return {
		name: 'Two lists',
		columns: 12,
		components: [
			{
				id: 'race',
				type: 'card',
				label: 'Race',
				options: [{ value: 'Elf', label: 'Elf' }, { value: 'Dwarf' }],
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			{
				id: 'abilities',
				type: 'card-set',
				label: 'Abilities',
				entries: [{ key: 'STR', name: 'Strength' }],
				position: { col: 3, row: 1, width: 4, height: 1 },
			},
			// The three list fields with nothing in them, which is where an
			// empty list has to stay out of the file: a Card that is still a
			// field, a Card set with no entries, a Track with no rows.
			{
				id: 'level',
				type: 'card',
				label: 'Level',
				position: { col: 7, row: 1, width: 2, height: 1 },
			},
			{
				id: 'bare_set',
				type: 'card-set',
				label: 'Bare set',
				position: { col: 9, row: 1, width: 2, height: 1 },
			},
			{
				id: 'bare_track',
				type: 'track',
				label: 'Bare track',
				position: { col: 11, row: 1, width: 2, height: 1 },
			},
		] as unknown as Layout['components'],
		triggers: [],
	};
}

describe('a list field naming its own columns', () => {
	beforeEach(async () => {
		harness = await open(twoLists());
	});

	/** The headings over the open form's list, in order. */
	function headings(): string[] {
		return Array.from(
			harness.container.querySelectorAll('.sheetsmith-entry-columns > span'),
		).map((el) => el.textContent ?? '');
	}

	/** Every accessible name in the open form's list rows. */
	function names(): string[] {
		return Array.from(
			harness.container.querySelectorAll('.sheetsmith-entry-row input'),
		).map((el) => el.getAttribute('aria-label') ?? '');
	}

	async function openForm(token: string): Promise<void> {
		control(harness, token).click();
		await settle(harness.pane);
	}

	it('heads a card\'s options Value and Label', async () => {
		await openForm('edit-race');
		expect(headings()).toEqual(['Value', 'Label']);
		expect(names()).toEqual(['Value', 'Label', 'Value', 'Label']);
	});

	it('leaves a card set\'s entries exactly as they were', async () => {
		await openForm('edit-abilities');
		expect(headings()).toEqual(['Key', 'Full name']);
		expect(names()).toEqual(['Key', 'Full name']);
	});

	it('calls a card with options a Dropdown, and a card without one a Card', () => {
		/*
		 * An author picks **Dropdown** off the add menu and the row under it
		 * used to say "Card", which is the menu and the list disagreeing about
		 * the thing that was just added. The component answers — the editor
		 * asking whether a config has options would be this module knowing what
		 * a Card is.
		 */
		const named = (label: string) =>
			Array.from(harness.container.querySelectorAll('.setting-item'))
				.find(
					(item) =>
						item.querySelector('.setting-item-name')?.textContent === label,
				)
				?.querySelector('.setting-item-description')?.textContent;
		expect(named('Race')).toBe('Dropdown');
		expect(named('Level')).toBe('Card');
		// Nothing about the type changed, so a set is still a set.
		expect(named('Abilities')).toBe('Card set');
	});

	it('goes back to calling it a Card when the last option is removed', async () => {
		// Derived from the config every time, never stored: a layout keeps the
		// component an entry produced and never the entry (SPEC §13).
		control(harness, 'edit-race').click();
		await settle(harness.pane);
		for (const remove of Array.from(
			harness.container.querySelectorAll<HTMLButtonElement>(
				'.sheetsmith-entry-row button[aria-label="Remove entry"]',
			),
		).reverse()) {
			remove.click();
			await settle(harness.pane);
		}

		const row = Array.from(
			harness.container.querySelectorAll('.setting-item'),
		).find(
			(item) => item.querySelector('.setting-item-name')?.textContent === 'Race',
		);
		expect(row?.querySelector('.setting-item-description')?.textContent).toBe(
			'Card',
		);
	});

	it('gives a list whose first column holds a word the width for it', async () => {
		/*
		 * The class is the whole contract between this module and the
		 * stylesheet, and nothing else would report its loss: the list still
		 * renders, still round-trips, and quietly clips "The Dagger Isles" in a
		 * track sized for `STR` while an empty Label box takes five times the
		 * width (docs/PATTERNS.md §10).
		 */
		const wide = () =>
			harness.container
				.querySelector('.sheetsmith-entry-list')
				?.classList.contains('sheetsmith-entry-wide-first');
		await openForm('edit-race');
		expect(wide()).toBe(true);
		// Card set's key really is an abbreviation, so its geometry is the one
		// the field was built with and must not move.
		await openForm('edit-abilities');
		expect(wide()).toBe(false);
	});

	it('says "Attribute" nowhere, in either list', async () => {
		// The one place the "Abilities" mistake was still live: `attributes`
		// became `entries` in the config (SPEC §13) and these two labels kept
		// the word, where only a screen reader would ever meet it.
		for (const token of ['edit-race', 'edit-abilities']) {
			await openForm(token);
			expect(names().join(' ')).not.toContain('Attribute');
		}
	});

	it('writes an edit under the property name its column carries', async () => {
		await openForm('edit-race');
		const row = harness.container.querySelectorAll('.sheetsmith-entry-row')[1];
		const value = row?.querySelector('input[aria-label="Value"]');
		type(value as HTMLInputElement, 'Half-elf');
		await settle(harness.pane);

		const stored = (await harness.stored()).components[0] as unknown as {
			options: { value: string; label?: string }[];
		};
		// The list the layout holds, not a `key` beside it: one word meaning two
		// things on one component is the defect this spelling exists to avoid.
		expect(stored.options).toEqual([
			{ value: 'Elf', label: 'Elf' },
			{ value: 'Half-elf' },
		]);
	});

	it('names the column in the error for a cleared cell', async () => {
		await openForm('edit-race');
		const value = harness.container.querySelector('input[aria-label="Value"]');
		type(value as HTMLInputElement, '');
		await settle(harness.pane);
		/*
		 * The column's own word, and only that: "A key is required" over a
		 * column headed Value points at nothing on screen. Deliberately not the
		 * whole sentence — `list-fields.test.ts` owns the wording, and spelling
		 * it in both files means a copy change has to find both. What this case
		 * is for is that the *component's* heading reached the message, which is
		 * the half only a pane can show.
		 */
		expect(
			harness.container.querySelector('.sheetsmith-field-error')?.textContent,
		).toContain('A value is required');
		// And the list is unchanged: a refused edit writes nothing.
		const stored = (await harness.stored()).components[0] as unknown as {
			options: { value: string }[];
		};
		expect(stored.options[0]?.value).toBe('Elf');
	});

	it('writes no empty list into a layout for having shown the form', async () => {
		/*
		 * A list is a key an author has to ask for. Materialising the array on
		 * render put `options: []`, `entries: []` or `rows: []` into the file
		 * for every component whose form was merely opened, which is the editor
		 * reformatting what it was only asked to show.
		 *
		 * All three kinds, not only the Card this feature added the field to:
		 * the write predates it on the other two, and a test driving one would
		 * go on passing while either of the others came back.
		 *
		 * **The edit is what makes this a test.** Opening a form mutates the
		 * layout in memory and persists nothing, so asserting the bytes straight
		 * after an open passes whether or not the array was materialised — the
		 * first draft did exactly that, and restoring the line it forbids left it
		 * green. The empty list reaches the file on the *next* write, whatever
		 * that write was for, which is how it was found in the first place: by
		 * the undo round-trip above, three tests away from the cause.
		 */
		for (const id of ['level', 'bare_set', 'bare_track']) {
			await openForm(`edit-${id}`);
			type(control<HTMLInputElement>(harness, `label-${id}`), `${id} renamed`);
			await settle(harness.pane);

			const written = (await harness.stored()).components.find(
				(component) => component.id === id,
			) as unknown as Record<string, unknown>;
			expect(written?.label, id).toBe(`${id} renamed`);
			// The rename is the only thing the file gained.
			for (const list of ['options', 'entries', 'rows']) {
				expect(Object.keys(written ?? {}), `${id} wrote ${list}`).not.toContain(
					list,
				);
			}
		}
	});
});

describe('the Dropdown entry on Card', () => {
	beforeEach(async () => {
		harness = await open();
	});

	it('sits indented under Card in the picker', () => {
		const lines = pickerLines(harness);
		const dropdown = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-choice="card:0"]',
		);
		expect(dropdown?.querySelector('.sheetsmith-picker-name')?.textContent).toBe(
			'Dropdown',
		);
		expect(dropdown?.classList.contains('sheetsmith-picker-entry')).toBe(true);
		expect(lines.indexOf('card:0')).toBe(lines.indexOf('card') + 1);
	});

	it('adds a card carrying two options, labelled Dropdown', async () => {
		pick(harness, 'card:0');
		pressAdd(harness);
		await settle(harness.pane);

		const components = (await harness.stored()).components;
		const added = components[components.length - 1];
		expect(added).toMatchObject({
			type: 'card',
			label: 'Dropdown',
			options: [{ value: 'First choice' }, { value: 'Second choice' }],
		});
		// Declaring options is the only thing that makes the card a dropdown,
		// so an entry that prefilled none would have produced a text card.
		expect(added).not.toHaveProperty('input');
	});
});

/*
 * The pane's two regions, and the one selection that decides what is in them.
 *
 * The tree is everything the layout holds, with the layout itself as its first
 * row; the panel is the settings of whichever one is selected. What is checked
 * below is that the two agree — a row and its schematic block are one selection
 * seen twice — and that nothing about *looking* at a layout writes to it, which
 * is the claim the whole editor rests on and the one a bigger surface makes
 * easier to break.
 */

/** A layout with a card set and a container, whose forms carry every field kind. */
function furnished(): Layout {
	return {
		name: 'Furnished sheet',
		columns: 12,
		components: [
			{
				id: 'abilities',
				type: 'card-set',
				label: 'Abilities',
				position: { col: 7, row: 1, width: 6, height: 1 },
				entries: [{ key: 'STR' }],
			} as ComponentConfig,
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 2, height: 1 },
					},
				],
			},
		],
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest'],
	};
}

/** The tree row carrying this focus token, as a settings row. */
function treeRow(harness: Harness, token: string): HTMLElement {
	const button = control(harness, token);
	const row = button.closest('.setting-item');
	if (!row) throw new Error(`"${token}" is not in a settings row`);
	return row as HTMLElement;
}

describe('the tree', () => {
	beforeEach(async () => {
		harness = await open(furnished());
	});

	it('puts the layout itself first, then everything in it', () => {
		// The reading order the sheet uses, with one row in front of it. The
		// layout's row is what makes this one selection rather than two: there is
		// no second kind of panel and no mode switch, because selecting the
		// layout is an ordinary selection.
		expect(labels(harness).slice(0, 7)).toEqual([
			// The picker, then the tree. Named apart on purpose: this one chooses
			// which layout is open and the next configures the one that is.
			'Layout file',
			// The pane's own chrome rather than the tree: it governs the canvas
			// below it and writes nothing (`docs/features/preview-sample-values.md`
			// §3), so it sits between the picker and the layout's own row.
			'Sample values',
			// Above the tree it adds into, not below it: a long component list
			// otherwise buries the one row that can grow it.
			'Add component',
			'Layout',
			'Defences',
			'Armour class',
			'Abilities',
		]);
	});

	it('starts on the layout, so nothing nobody chose is open', () => {
		expect(
			treeRow(harness, `edit-${SHEET_DESTINATION}`).classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
	});

	it('marks the row and the block for one selection, not two', async () => {
		// Two paints of one piece of state. They were one thing when the form sat
		// under its own row and the block was the only other way in; with the
		// form in a panel, a row and a block that disagreed would leave nothing
		// on screen saying which component the panel belongs to.
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		expect(
			treeRow(harness, 'edit-abilities').classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
		expect(
			control(harness, 'preview-abilities').classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
	});

	it('selects from the schematic block exactly as from the row', async () => {
		control(harness, 'preview-abilities').click();
		await settle(harness.pane);

		expect(
			treeRow(harness, 'edit-abilities').classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
		expect(has(harness, 'cfg-abilities-direction')).toBe(true);
	});

	it('selects from anywhere on the row, not only the name', async () => {
		// The whole card is the hit target (docs/PATTERNS.md §6) — a press on
		// its description line, well away from the name button, still opens
		// the component.
		const description = treeRow(harness, 'edit-abilities').querySelector(
			'.setting-item-description',
		);
		if (!description) throw new Error('row has no description to press');
		description.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle(harness.pane);

		// A rebuild replaces the row, so it is re-read rather than reused
		// (the same staleness `writes`' own comment warns against).
		expect(
			treeRow(harness, 'edit-abilities').classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
		expect(has(harness, 'cfg-abilities-direction')).toBe(true);
	});

	it('does not select a row for a press on its own icon buttons', async () => {
		// Real controls own their own presses (PATTERNS §6): opening the menu on
		// `Abilities`, a row that is not selected, and collapsing `Defences` must
		// not also select either as a side effect of the click bubbling to the row.
		expect(has(harness, 'cfg-abilities-direction')).toBe(false);
		openRowMenu(harness, 'abilities');
		await settle(harness.pane);
		expect(has(harness, 'cfg-abilities-direction')).toBe(false);
		document.body.querySelector('.menu')?.remove();
		control(harness, 'tree-disclosure-defences').click();
		await settle(harness.pane);

		expect(has(harness, 'cfg-abilities-direction')).toBe(false);
		expect(
			treeRow(harness, `edit-${SHEET_DESTINATION}`).classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
	});

	it('keeps the selection when the selected row is pressed again', async () => {
		// Deselecting to nowhere would leave the panel empty, and nothing is the
		// wrong thing to configure. The `Layout` row is the way back out.
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		expect(has(harness, 'cfg-abilities-direction')).toBe(true);
	});

	it('puts nothing between a container and the rows of what it holds', async () => {
		// docs/UI.md §12's open-container row, as an assertion. The form used to
		// go directly under the row it belonged to, which put around 500px of it
		// between a container and its own children.
		control(harness, 'edit-defences').click();
		await settle(harness.pane);

		// The wrapper follows the row directly, and its first row is the child.
		const container = treeRow(harness, 'edit-defences');
		const child = treeRow(harness, 'edit-armour');
		expect(container.nextElementSibling).toBe(child.parentElement);
		expect(child.parentElement?.firstElementChild).toBe(child);
	});
});

/** Three plain leaves at the top level, for a reorder that involves no container. */
function threeLeaves(): Layout {
	return {
		name: 'Three leaves',
		columns: 12,
		components: [
			{ id: 'a', type: 'card', label: 'A', position: { col: 1, row: 1, width: 2, height: 1 } },
			{ id: 'b', type: 'card', label: 'B', position: { col: 3, row: 1, width: 2, height: 1 } },
			{ id: 'c', type: 'card', label: 'C', position: { col: 5, row: 1, width: 2, height: 1 } },
		],
		triggers: [],
	};
}

/**
 * Drag `fromId`'s tree row onto `toId`'s, dispatched directly by focus
 * token. The drag itself starts on the row's own handle, not the row —
 * `bindDragSource`'s drag source is the handle alone, the same split
 * `list-fields.ts` already draws, so a real drag never begins from the name
 * button or the up/down/indent/outdent/trash controls.
 */
function dragRow(harness: Harness, fromId: string, toId: string): void {
	const from = control(harness, `tree-handle-${fromId}`);
	const to = treeRow(harness, `edit-${toId}`);
	from.dispatchEvent(new Event('dragstart', { bubbles: true }));
	to.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
	to.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
	from.dispatchEvent(new Event('dragend', { bubbles: true }));
}

/**
 * A container holding two containers, the second of which holds a leaf — the
 * one shape where moving a row into its previous sibling pushes a subtree past
 * the depth cap.
 */
function depthCapped(): Layout {
	return {
		name: 'Depth-capped sheet',
		columns: 12,
		components: [
			{
				id: 'zone',
				type: 'group',
				label: 'Zone',
				position: { col: 1, row: 1, width: 6, height: 3 },
				children: [
					{
						id: 'holder',
						type: 'group',
						label: 'Holder',
						position: { col: 1, row: 1, width: 3, height: 1 },
					},
					{
						id: 'nested',
						type: 'group',
						label: 'Nested',
						position: { col: 1, row: 2, width: 3, height: 1 },
						children: [
							{
								id: 'leaf',
								type: 'card',
								label: 'Leaf',
								position: { col: 1, row: 1, width: 2, height: 1 },
							},
						],
					},
				],
			},
		],
		triggers: [],
	};
}

describe('reparenting a tree row', () => {
	it('drops onto a container row and appends the dragged component as its last child', async () => {
		harness = await open(nested());
		const wrote = writes(harness);
		dragRow(harness, 'hit_points', 'defences');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(
			stored.components.find((c) => c.id === 'defences')?.children?.map(
				(c) => c.id,
			),
		).toEqual(['armour', 'hit_points']);
		expect(wrote()).toBeGreaterThan(0);
	});

	it('drops onto a sibling within its own current parent and reorders it there', async () => {
		harness = await open(threeLeaves());
		dragRow(harness, 'a', 'c');
		await settle(harness.pane);

		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'b',
			'c',
			'a',
		]);
	});

	it('refuses a drop that would push a container past the depth cap, with no write', async () => {
		harness = await open(deep());
		const before = await harness.raw();
		const wrote = writes(harness);

		// `defences` holds `melee`, which holds `armour` — dropping the whole
		// subtree into `spellbook` would land `melee` two containers deep,
		// where a container may hold no children at all.
		dragRow(harness, 'defences', 'spellbook');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a drop onto a non-container, with no write', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);

		dragRow(harness, 'hit_points', 'armour');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a row dropped onto itself, with no write', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);

		dragRow(harness, 'defences', 'defences');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a row dropped onto one of its own descendants, with no write', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);

		dragRow(harness, 'defences', 'armour');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('shows a refused drop inline, naming the fix, rather than ignoring it silently', async () => {
		harness = await open(nested());
		dragRow(harness, 'hit_points', 'armour');
		await settle(harness.pane);

		const row = treeRow(harness, 'edit-armour');
		const message = row.querySelector('.sheetsmith-field-error')?.textContent;
		expect(message).toContain('is not a container');
	});

	it('reparents from the menu into the previous sibling, no pointer event dispatched', async () => {
		// The keyboard-operable equivalent of dropping a row onto the row
		// before it: `hit_points` moves into `defences`, its only earlier
		// sibling, with nothing but a press on the menu item.
		harness = await open(nested());
		pressMenu(harness, 'hit_points', 'Move into "Defences"');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(
			stored.components.find((c) => c.id === 'defences')?.children?.map(
				(c) => c.id,
			),
		).toEqual(['armour', 'hit_points']);
	});

	it('reparents from the menu out to the level above', async () => {
		harness = await open(nested());
		pressMenu(harness, 'armour', 'Move out of "Defences"');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
			'armour',
		]);
		expect(stored.components[0]?.children).toBeUndefined();
	});

	it('reorders from the menu, moving up and down among siblings', async () => {
		// `list-fields.ts`'s own `moveItem` semantics, reused rather than
		// reinvented, exactly as the drag-based reorder test above already
		// proves for the pointer.
		harness = await open(threeLeaves());
		pressMenu(harness, 'a', 'Move down');
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'b',
			'a',
			'c',
		]);

		pressMenu(harness, 'c', 'Move up');
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'b',
			'c',
			'a',
		]);
	});

	it('lists the eight items in order, with three separators and Remove warned', async () => {
		harness = await open(deep());
		openRowMenu(harness, 'melee');
		expect(menuLines()).toEqual([
			'Move up',
			'Move down',
			'---',
			'Move into a container',
			'Move out of "Defences"',
			'---',
			'Copy',
			'Paste',
			'Paste configuration',
			'---',
			'Remove',
		]);
		expect(menuItem('Remove').classList.contains('is-warning')).toBe(true);
	});

	it('names the previous sibling and the parent, and falls back to a generic item', async () => {
		harness = await open(nested());
		openRowMenu(harness, 'hit_points');
		// The other party only: the menu is reached through a button already
		// named for its row, so the row itself is not named again.
		expect(menuItem('Move into "Defences"').classList.contains('is-disabled')).toBe(
			false,
		);
		// At the top level there is no parent to leave.
		expect(
			menuItem('Move out of a container').classList.contains('is-disabled'),
		).toBe(true);

		openRowMenu(harness, 'defences');
		// First among its siblings, so nothing above it to move into.
		expect(
			menuItem('Move into a container').classList.contains('is-disabled'),
		).toBe(true);
		expect(menuItem('Move up').classList.contains('is-disabled')).toBe(true);
		expect(menuItem('Move down').classList.contains('is-disabled')).toBe(false);
	});

	it('writes nothing for a disabled item pressed anyway', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);
		for (const title of ['Move up', 'Move into a container', 'Move out of a container']) {
			pressMenu(harness, 'defences', title);
			await settle(harness.pane);
		}
		// Last among the top level, so nothing below it to swap with.
		openRowMenu(harness, 'hit_points');
		expect(menuItem('Move down').classList.contains('is-disabled')).toBe(true);
		menuItem('Move down').click();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('disables the move into exactly where it would push a subtree past the depth cap', async () => {
		/*
		 * The trivial cases above never reach the interesting refusal the drag
		 * path has its own dedicated test for (`refuses a drop that would push a
		 * container past the depth cap, with no write`, against `deep()`): a
		 * container that holds components, moved into a sibling that is
		 * already one level in. `zone` holds two depth-1 children — `holder`,
		 * empty, and `nested`, which holds the Card `leaf` — so moving `nested`
		 * into its previous sibling `holder` would put `nested` inside two
		 * containers, where it may hold nothing. `deep()` is the other case,
		 * where the container too deep is one inside the one dragged.
		 */
		harness = await open(depthCapped());
		openRowMenu(harness, 'nested');
		expect(menuItem('Move into "Holder"').classList.contains('is-disabled')).toBe(
			true,
		);
	});

	it('refuses the same move from its chord, saying why under the row and writing nothing', async () => {
		harness = await open(depthCapped());
		const before = await harness.raw();
		const wrote = writes(harness);
		chord(harness, 'edit-nested', 'ArrowRight');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
		const message = treeRow(harness, 'edit-nested').querySelector(
			'.sheetsmith-field-error',
		);
		// Exact, not a fragment: `nested` holds a Card rather than a container,
		// and an assertion on the shared tail passed on a sentence that said
		// it held "a container of its own".
		expect(message?.textContent).toBe(
			'"Nested" holds components, and moving it here would put it inside two containers, where it could hold nothing. Move its components out first.',
		);
		expect(message?.getAttribute('role')).toBe('alert');
	});

	/*
	 * The refusal above names its fix: "Move its components out first." These
	 * two follow it, by each route that empties a container, and then make the
	 * move it refused. Emptying used to leave `children: []`, which
	 * `canReparent` read as holding nothing and `parseChildren` refuses two
	 * containers deep, so the move was allowed, drawn, and never saved.
	 */
	it('saves the refused move once its components are moved out, as the refusal says', async () => {
		harness = await open(depthCapped());
		chord(harness, 'edit-leaf', 'ArrowLeft');
		await settle(harness.pane);
		const emptied = await harness.raw();
		chord(harness, 'edit-nested', 'ArrowRight');
		await settle(harness.pane);

		expect(await harness.raw()).not.toBe(emptied);
		const zone = (await harness.stored()).components.find((c) => c.id === 'zone');
		const holder = zone?.children?.find((c) => c.id === 'holder');
		expect(holder?.children?.map((c) => c.id)).toEqual(['nested']);
		expect(holder?.children?.[0]).not.toHaveProperty('children');
	});

	it('saves the refused move once its last component is removed', async () => {
		harness = await open(depthCapped());
		removeRow(harness, 'leaf');
		await settle(harness.pane);
		const emptied = await harness.raw();
		chord(harness, 'edit-nested', 'ArrowRight');
		await settle(harness.pane);

		expect(await harness.raw()).not.toBe(emptied);
		const zone = (await harness.stored()).components.find((c) => c.id === 'zone');
		const holder = zone?.children?.find((c) => c.id === 'holder');
		expect(holder?.children?.map((c) => c.id)).toEqual(['nested']);
	});

	it('refuses each chord where its menu item is disabled, in its own words', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);
		const said = (key: string): string | null | undefined => {
			chord(harness, 'edit-defences', key);
			return treeRow(harness, 'edit-defences').querySelector(
				'.sheetsmith-field-error',
			)?.textContent;
		};
		expect(said('ArrowUp')).toBe('Already first.');
		expect(said('ArrowRight')).toBe('No container above to move into.');
		expect(said('ArrowLeft')).toBe('Already at the top level.');
		// Hit points is last among the top level.
		chord(harness, 'edit-hit_points', 'ArrowDown');
		expect(
			treeRow(harness, 'edit-hit_points').querySelector('.sheetsmith-field-error')
				?.textContent,
		).toBe('Already last.');
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('reparents from a chord with no pointer event, as one undo step', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const event = chord(harness, 'edit-hit_points', 'ArrowRight');
		expect(event.defaultPrevented).toBe(true);
		await settle(harness.pane);
		const moved = await harness.raw();
		expect(
			(await harness.stored()).components
				.find((c) => c.id === 'defences')
				?.children?.map((c) => c.id),
		).toEqual(['armour', 'hit_points']);

		expect(await undo(harness)).toBe(true);
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(await redo(harness)).toBe(true);
		await settle(harness.pane);
		expect(await harness.raw()).toBe(moved);
	});

	it('reorders and moves out from the other three chords', async () => {
		harness = await open(threeLeaves());
		chord(harness, 'edit-a', 'ArrowDown');
		await settle(harness.pane);
		chord(harness, 'edit-c', 'ArrowUp');
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'b',
			'c',
			'a',
		]);

		harness = await open(nested());
		chord(harness, 'edit-armour', 'ArrowLeft');
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
			'armour',
		]);
	});

	it('moves focus to the moved row\'s name, from the menu and from a chord', async () => {
		harness = await open(nested());
		pressMenu(harness, 'hit_points', 'Move into "Defences"');
		await settle(harness.pane);
		expect(document.activeElement).toBe(control(harness, 'edit-hit_points'));

		chord(harness, 'edit-hit_points', 'ArrowLeft');
		await settle(harness.pane);
		expect(document.activeElement).toBe(control(harness, 'edit-hit_points'));
	});

	it('answers the chords on the name button and nowhere else on the row', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);
		for (const token of ['tree-handle-armour', 'tree-menu-armour']) {
			chord(harness, token, 'ArrowLeft');
		}
		chord(harness, 'tree-disclosure-defences', 'ArrowDown');
		// Plain arrows are not a chord, on the name button either.
		control(harness, 'edit-armour').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
		);
		// Nor Alt with a second modifier, which is somebody else's chord.
		for (const second of ['shiftKey', 'ctrlKey', 'metaKey'] as const) {
			control(harness, 'edit-armour').dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'ArrowLeft',
					altKey: true,
					[second]: true,
					bubbles: true,
				}),
			);
		}
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('declares the chords on the name button, and says them after the name', async () => {
		harness = await open(nested());
		const name = control(harness, 'edit-armour');
		// The four moves, then the clipboard's two chords
		// (`docs/features/component-copy-paste.md` §2), Control away from a Mac.
		expect(name.getAttribute('aria-keyshortcuts')).toBe(
			'Alt+ArrowUp Alt+ArrowDown Alt+ArrowRight Alt+ArrowLeft Control+C Control+V',
		);
		expect(name.getAttribute('title')?.startsWith('Armour class')).toBe(true);
		expect(name.getAttribute('title')).toContain('Alt+↑ ↓ reorder');
		// The layout's own row cannot move, so it declares nothing.
		expect(
			control(harness, `edit-${SHEET_DESTINATION}`).hasAttribute('aria-keyshortcuts'),
		).toBe(false);
	});

	it('undoes a reparent at depth as one step', async () => {
		/*
		 * `dragRow` rather than the outdent button — CSB #486/#366, the prior
		 * art §5 was written against, is undo/redo failing to restore a
		 * *drag*-triggered move at depth specifically, so this is the trigger
		 * the criterion actually names. `dragRow(harness, 'armour',
		 * 'defences')` reaches the exact same write the outdent button does
		 * (both call `reparent(layout, armour, defences)`), which is what lets
		 * this reuse that test's own assertions unchanged.
		 */
		harness = await open(deep());
		const before = await harness.raw();

		dragRow(harness, 'armour', 'defences');
		await settle(harness.pane);
		expect(await harness.raw()).not.toBe(before);

		harness.pane.undo();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
	});

	it('redoes an undone reparent back to the moved state', async () => {
		// `dragRow`, the same drag-based trigger the undo test above uses,
		// for the same reason: the risk named at depth is a drag, not a button.
		harness = await open(deep());
		dragRow(harness, 'armour', 'defences');
		await settle(harness.pane);
		const afterMove = await harness.raw();

		harness.pane.undo();
		await settle(harness.pane);
		harness.pane.redo();
		await settle(harness.pane);

		expect(await harness.raw()).toBe(afterMove);
	});
});

describe('a tree row at rest', () => {
	it('carries a drag handle and a menu button, and none of the old controls', async () => {
		harness = await open(deep());
		for (const id of ['defences', 'melee', 'armour', 'spellbook']) {
			const controls = Array.from(
				treeRow(harness, `edit-${id}`).querySelectorAll('.setting-item-control > *'),
			).map((el) => (el as HTMLElement).dataset.sheetsmithFocus);
			expect(controls).toEqual([`tree-handle-${id}`, `tree-menu-${id}`]);
		}
		for (const prefix of ['tree-up-', 'tree-down-', 'tree-indent-', 'tree-outdent-', 'remove-']) {
			expect(
				harness.container.querySelector(`[data-sheetsmith-focus^="${prefix}"]`),
				prefix,
			).toBeNull();
		}
		expect(control(harness, 'tree-menu-melee').getAttribute('aria-label')).toBe(
			'More options for "Melee"',
		);
	});

	it('gives a container a disclosure and every other row a spacer in its place', async () => {
		harness = await open(deep());
		const chevron = control(harness, 'tree-disclosure-melee');
		expect(chevron.getAttribute('aria-expanded')).toBe('true');
		expect(chevron.getAttribute('aria-controls')).toBe('sheetsmith-tree-children-melee');
		expect(harness.container.querySelector('#sheetsmith-tree-children-melee')).not.toBeNull();
		expect(chevron.getAttribute('aria-label')).toBe('Collapse "Melee"');
		// An empty container is still a container, and still folds — but open, it
		// discloses no region, so it names none.
		expect(has(harness, 'tree-disclosure-spellbook')).toBe(true);
		expect(
			control(harness, 'tree-disclosure-spellbook').hasAttribute('aria-controls'),
		).toBe(false);
		// A leaf has the slot and nothing in it; the layout's row has neither.
		const leafSlot = treeRow(harness, 'edit-armour').querySelector('.sheetsmith-tree-slot');
		expect(leafSlot?.childElementCount).toBe(0);
		expect(
			treeRow(harness, `edit-${SHEET_DESTINATION}`).querySelector('.sheetsmith-tree-slot'),
		).toBeNull();
	});

	it('nests two containers deep as two wrappers', async () => {
		harness = await open(deep());
		const row = treeRow(harness, 'edit-armour');
		const wrappers: string[] = [];
		for (let el = row.parentElement; el !== null; el = el.parentElement) {
			if (el.classList.contains('sheetsmith-tree-children')) {
				wrappers.push(el.getAttribute('aria-label') ?? '');
			}
		}
		expect(wrappers).toEqual(['Inside Melee', 'Inside Defences']);
	});
});

describe('removing from the tree', () => {
	beforeEach(() => {
		Notice.instances = [];
		Notice.messages = [];
	});

	/** The last notice raised, as its reader reads it. */
	function lastNotice(): string | null | undefined {
		return Notice.instances.at(-1)?.messageEl.textContent;
	}

	/** Press the last notice's Undo link. */
	function pressUndo(): void {
		const link = Notice.instances.at(-1)?.messageEl.querySelector('a.sheetsmith-undo');
		if (!link) throw new Error('no undo in the last notice');
		(link as HTMLElement).click();
	}

	it('names a leaf and says its section stays', async () => {
		harness = await open();
		removeRow(harness, 'armour');
		await settle(harness.pane);
		expect(lastNotice()).toBe(
			'Removed "Armour class". Character notes keep its section. Undo',
		);
	});

	it('counts what a container held, and says nothing about a section it never had', async () => {
		harness = await open(containerWithTwoChildren());
		removeRow(harness, 'defences');
		await settle(harness.pane);
		expect(lastNotice()).toBe(
			'Removed "Defences". The 2 components inside it moved to the bottom of the sheet. Undo',
		);

		harness = await open(deep());
		removeRow(harness, 'spellbook');
		await settle(harness.pane);
		expect(lastNotice()).toBe('Removed "Spellbook". Undo');
	});

	it('puts the pre-removal bytes back from the notice', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		removeRow(harness, 'defences');
		await settle(harness.pane);
		expect(await harness.raw()).not.toBe(before);

		pressUndo();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(Notice.instances.at(-1)?.hidden).toBe(true);
	});

	it('refuses a stale undo after an intervening edit, and writes nothing', async () => {
		harness = await open(nested());
		removeRow(harness, 'armour');
		await settle(harness.pane);
		const undo = Notice.instances.at(-1);
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-hit_points'), 'Health');
		await settle(harness.pane);
		const edited = await harness.raw();
		const wrote = writes(harness);

		(undo?.messageEl.querySelector('a.sheetsmith-undo') as HTMLElement).click();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(edited);
		expect(wrote()).toBe(0);
		expect(Notice.messages).toContain(
			'Sheetsmith did not undo: this layout has changed since.',
		);
	});

	it('lands the selection and the focus on the layout\'s own row', async () => {
		harness = await open(nested());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		removeRow(harness, 'armour');
		await settle(harness.pane);
		expect(panelHeading(harness)).toBe('Layout');
		expect(document.activeElement).toBe(control(harness, `edit-${SHEET_DESTINATION}`));
	});
});

describe('collapsing a container in the tree', () => {
	/** Press a container's chevron. */
	async function fold(harness: Harness, id: string): Promise<void> {
		control(harness, `tree-disclosure-${id}`).click();
		await settle(harness.pane);
	}

	/** A component row's description line. */
	function description(harness: Harness, id: string): string | null | undefined {
		return treeRow(harness, `edit-${id}`).querySelector('.setting-item-description')
			?.textContent;
	}

	it('stops listing what it holds, at every depth, and writes nothing', async () => {
		harness = await open(deep());
		const before = await harness.raw();
		const wrote = writes(harness);
		await fold(harness, 'defences');

		expect(has(harness, 'edit-melee')).toBe(false);
		expect(has(harness, 'edit-armour')).toBe(false);
		expect(has(harness, 'edit-spellbook')).toBe(true);
		expect(harness.container.querySelector('#sheetsmith-tree-children-defences')).toBeNull();
		const chevron = control(harness, 'tree-disclosure-defences');
		expect(chevron.getAttribute('aria-expanded')).toBe('false');
		expect(chevron.getAttribute('aria-label')).toBe('Expand "Defences"');
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
		// Not an edit, so nothing for undo to take back.
		expect(harness.pane.undo()).toBe(false);
		// And the chevron keeps the focus across the redraw.
		expect(document.activeElement).toBe(chevron);
	});

	it('counts every component it hides, and says when it hides none', async () => {
		harness = await open(deep());
		expect(description(harness, 'defences')).toBe('Group');
		await fold(harness, 'defences');
		expect(description(harness, 'defences')).toBe('Group · 2 inside');
		await fold(harness, 'spellbook');
		expect(description(harness, 'spellbook')).toBe('Group · empty');
		await fold(harness, 'defences');
		expect(description(harness, 'defences')).toBe('Group');
		expect(has(harness, 'edit-armour')).toBe(true);
	});

	it('asks the workspace to remember the fold', async () => {
		harness = await open(deep());
		const asked = harness.app.workspace.layoutSavesRequested;
		await fold(harness, 'defences');
		expect(harness.app.workspace.layoutSavesRequested).toBe(asked + 1);
		expect(harness.pane.getState().collapsed).toEqual(['defences']);
	});

	it('selects the container when the selection is inside it', async () => {
		harness = await open(deep());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		await fold(harness, 'defences');
		expect(panelHeading(harness)).toBe('Defences');
		expect(has(harness, 'edit-armour')).toBe(false);
	});

	it('opens every shut ancestor of a selection made on the canvas', async () => {
		harness = await open(deep());
		await fold(harness, 'melee');
		await fold(harness, 'defences');
		control(harness, 'preview-armour').click();
		await settle(harness.pane);
		expect(has(harness, 'edit-armour')).toBe(true);
		expect(harness.pane.collapsed.size).toBe(0);
	});

	it('opens a shut container the picker inserts into', async () => {
		harness = await open(deep());
		await fold(harness, 'spellbook');
		pick(harness, 'card');
		chooseDestination(harness, 'spellbook');
		pressAdd(harness);
		await settle(harness.pane);
		const added = (await harness.stored()).components.find((c) => c.id === 'spellbook')
			?.children?.[0];
		expect(added).toBeDefined();
		expect(has(harness, `edit-${added?.id ?? ''}`)).toBe(true);
		expect(harness.pane.collapsed.has('spellbook')).toBe(false);
	});

	it('takes a drop and stays shut, counting one more', async () => {
		harness = await open(deep());
		await fold(harness, 'defences');
		dragRow(harness, 'spellbook', 'defences');
		await settle(harness.pane);
		expect(description(harness, 'defences')).toBe('Group · 3 inside');
		expect(has(harness, 'edit-spellbook')).toBe(false);
	});

	it('opens for a drop of the selected row, which it would otherwise hide', async () => {
		harness = await open(deep());
		control(harness, 'edit-spellbook').click();
		await settle(harness.pane);
		await fold(harness, 'defences');
		dragRow(harness, 'spellbook', 'defences');
		await settle(harness.pane);
		expect(has(harness, 'edit-spellbook')).toBe(true);
		expect(harness.pane.collapsed.has('defences')).toBe(false);
	});

	it('opens for a menu move into it', async () => {
		harness = await open(nested());
		await fold(harness, 'defences');
		pressMenu(harness, 'hit_points', 'Move into "Defences"');
		await settle(harness.pane);
		expect(has(harness, 'edit-hit_points')).toBe(true);
		expect(harness.pane.collapsed.has('defences')).toBe(false);
		expect(document.activeElement).toBe(control(harness, 'edit-hit_points'));
	});

	it('drags with everything it holds', async () => {
		harness = await open(deep());
		await fold(harness, 'melee');
		dragRow(harness, 'melee', 'spellbook');
		await settle(harness.pane);
		const stored = await harness.stored();
		const spellbook = stored.components.find((c) => c.id === 'spellbook');
		expect(spellbook?.children?.map((c) => c.id)).toEqual(['melee']);
		expect(spellbook?.children?.[0]?.children?.map((c) => c.id)).toEqual(['armour']);
		expect(stored.components.find((c) => c.id === 'defences')?.children).toBeUndefined();
	});

	it('reads the rows in the order it always did, expanded', async () => {
		harness = await open(furnished());
		// After the picker's three rows, and before the panel's own.
		expect(labels(harness).slice(3, 7)).toEqual([
			'Layout',
			'Defences',
			'Armour class',
			'Abilities',
		]);
	});
});

describe('a selection the layout cannot honour', () => {
	it('falls back to the layout, never to the first component', async () => {
		// Landing an author in a form nobody chose is the failure the reset
		// binding's dropdown already guards against for the same reason.
		harness = await open(furnished());
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		treeRow(harness, 'edit-abilities');
		removeRow(harness, 'abilities');
		await settle(harness.pane);

		expect(
			treeRow(harness, `edit-${SHEET_DESTINATION}`).classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
		expect(has(harness, 'layout-columns')).toBe(true);
	});
});

describe('the layout is not written for having been looked at', () => {
	it('leaves the file byte-identical after selecting every component in turn', async () => {
		/*
		 * The stronger form of the two guards above, and the one that covers the
		 * traps by construction rather than by naming them. `children: []` on a
		 * container, `options: []` on a card, `columns: 12` on a layout that
		 * omitted the key: each is a key a form materialised for having been
		 * drawn, and each was found late because the write lands on the *next*
		 * save rather than at the moment of the draw.
		 *
		 * Containers included, which is the half that matters: a `children: []`
		 * written onto a component two containers deep is a layout `parseLayout`
		 * refuses, so `persist` would refuse every later save and the author
		 * would lose edits to a message about a depth rule they never broke.
		 */
		harness = await open(furnished());
		const before = await harness.raw();

		const ids = walkComponents(furnished().components).map(
			(entry) => entry.config.id,
		);
		// The walk found something to select, or this passes by selecting nothing.
		expect(ids.length).toBeGreaterThan(2);
		for (const id of [SHEET_DESTINATION, ...ids, SHEET_DESTINATION]) {
			control(harness, `edit-${id}`).click();
			await settle(harness.pane);
		}

		expect(await harness.raw()).toBe(before);
	});
});

describe("the layout's own settings", () => {
	beforeEach(async () => {
		harness = await open(furnished());
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
	});

	it('draws the grid, the library, the triggers and the bonus types together', () => {
		// The function library's own header asked for this: below the component
		// forms, "the definitions are a scroll away from the formulas calling
		// them, which is a side panel's job to fix". The bonus types sit beside
		// the library because they are the same category — the layout's own
		// vocabulary, shared by every component using it (SPEC §5).
		expect(has(harness, 'layout-columns')).toBe(true);
		expect(
			harness.container.querySelector('.sheetsmith-function-library'),
		).not.toBeNull();
		expect(
			harness.container.querySelector('.sheetsmith-trigger-list'),
		).not.toBeNull();
		expect(
			harness.container.querySelector('.sheetsmith-modifier-types'),
		).not.toBeNull();
	});

	it('reads the bonus types back without waiting for a change event', async () => {
		// The third field on this panel, and `commitPending` has to read all
		// three: `||` over the commits would short-circuit past the later ones
		// whenever an earlier one changed, which is how a list gets lost.
		const types = control<HTMLTextAreaElement>(harness, 'modifier-types');
		types.value = 'item\nstatus';
		await settle(harness.pane);
		expect((await harness.stored()).modifierTypes).toEqual(['item', 'status']);
	});

	it('reads all three fields back, not only the first one that changed', async () => {
		const triggers = control<HTMLTextAreaElement>(harness, 'trigger-list');
		const library = control<HTMLTextAreaElement>(harness, 'function-library');
		const types = control<HTMLTextAreaElement>(harness, 'modifier-types');
		triggers.value = 'Long rest\nShort rest';
		library.value = 'double(n) = n * 2';
		types.value = 'item';
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.triggers).toEqual(['Long rest', 'Short rest']);
		expect(stored.functions).toEqual(['double(n) = n * 2']);
		expect(stored.modifierTypes).toEqual(['item']);
	});

	it('leaves the key absent where the list is cleared', async () => {
		// An absent key stays absent, so a layout that never wanted bonus types
		// does not grow one on first save.
		const types = control<HTMLTextAreaElement>(harness, 'modifier-types');
		types.value = 'item';
		await settle(harness.pane);
		types.value = '';
		types.dispatchEvent(new Event('change'));
		await settle(harness.pane);
		expect('modifierTypes' in (await harness.stored())).toBe(false);
	});

});

/*
 * The editor's half of item modifiers (SPEC §5, §7).
 *
 * Two things it can say that the sheet cannot: which values this layout takes a
 * modifier for, and — where that set is empty — that the layout's modifiers do
 * nothing at all. Both are computed from the layout alone, so neither needs a
 * character in hand. The sheet's half is at the row, because an open row's
 * target is character data in a file the layout has never opened.
 */
describe('a layout with modifier definitions', () => {
	/**
	 * A magic-items table whose rows enrol, and an armour class that reads its
	 * slot.
	 *
	 * `modifiers` is a parameter because the interesting states are the
	 * definitions' — a target that reads no modifier, a bonus type nothing
	 * declares — and the columns are now a fixed one-line thing.
	 */
	function modifying(
		derived: string,
		modifiers: readonly unknown[] = [
			{ name: 'Ring of Protection', target: 'armour', amount: '1', bonusType: 'item' },
		],
		columns: readonly unknown[] = [{ key: 'Effect', type: 'modifier' }],
	): Layout {
		return {
			name: 'Modifier sheet',
			columns: 12,
			components: [
				{
					id: 'armour',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
					derived,
				} as ComponentConfig,
				{
					id: 'items',
					type: 'table',
					label: 'Magic items',
					position: { col: 3, row: 1, width: 6, height: 2 },
					openRows: true,
					columns,
				} as unknown as ComponentConfig,
			],
			modifierTypes: ['item'],
			// Absent rather than empty where a case declares none, which is what a
			// layout that never wanted definitions actually holds.
			...(modifiers.length > 0 ? { modifiers } : {}),
		} as unknown as Layout;
	}

	/** The panel's text, for the statements this pane can make. */
	const said = (): string =>
		harness.container.querySelector('.sheetsmith-editor-panel')?.textContent ??
		'';

	/*
	 * **What is here is what needs the pane.** The field's own cases — the report,
	 * the count, the empty state, the two write rules, the stray lines and the
	 * refusals — moved to `modifier-definitions-field.test.ts` when
	 * `docs/PATTERNS.md` §11 settled that a module with its own entry point and its
	 * own reportable output earns a file. What stays is the seam: that the Layout
	 * panel draws the field at all, that a *real* layout's accepting set reaches the
	 * picker, that a redraw survives, and that an edit reaches the file on disk.
	 * Keeping both copies would be the duplication §1 forbids.
	 */

	async function openLayoutPanel(layout: Layout) {
		harness = await open(layout);
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
	}

	it('counts the layout\'s modifiers under the columns of a table that has one', async () => {
		// The note the columns list gains: how many a modifier cell will offer. The
		// target picker moved to the Layout panel, where a target is chosen once.
		// A count rather than the names, which grew with the layout and restated
		// the Modifiers list one panel away.
		harness = await open(modifying('10 + mod.self'));
		control(harness, 'edit-items').click();
		await settle(harness.pane);
		expect(said()).toContain('This layout names 1 of them');
		expect(said()).not.toContain('Ring of Protection.');
	});

	it('says nothing at all on a component with no modifier column', async () => {
		harness = await open(modifying('10 + mod.self'));
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		expect(said()).not.toContain('This layout names');
	});

	it('says no error on a modifier column where the layout names none', async () => {
		/*
		 * **The one report this wave retires rather than adds.** It said a table with
		 * a modifier column on a layout declaring no definitions had cells nobody
		 * could fill, which was true while a cell could only *name* one. A row can
		 * now type its own effect, so that layout is ordinary and the error would be
		 * false — and the note still says how the cell works, counting zero.
		 */
		harness = await open(modifying('10 + mod.self', []));
		control(harness, 'edit-items').click();
		await settle(harness.pane);
		const error = harness.container.querySelector(
			'.sheetsmith-entry-list .sheetsmith-field-error',
		);
		expect(error).toBeNull();
		expect(said()).toContain('This layout names 0 of them');
	});

	it('draws the Modifiers list in the Layout panel, beside the bonus types', async () => {
		// The category SPEC §2 already names as the layout's own: a system's
		// vocabulary, shared by every component using it.
		await openLayoutPanel(modifying('10 + mod.self'));
		expect(said()).toContain('Modifiers');
		expect(control(harness, 'modifier-0-name')).toBeDefined();
	});

	it('offers the accepting targets to the Changes picker, and nothing else', async () => {
		/*
		 * Foundry's own Active Effects article tells users to press F12 and run a
		 * console script to enumerate attribute keys. This is the answer to that,
		 * moved from the sheet to the one place a target is chosen — and it is the
		 * *accepting* set rather than every published name, which is what keeps it
		 * short enough to read.
		 */
		await openLayoutPanel(modifying('10 + mod.self'));
		const picker = control<HTMLSelectElement>(harness, 'modifier-Ring of Protection-0-target');
		expect(Array.from(picker.options).map((one) => one.value)).toEqual([
			'',
			'armour',
		]);
		expect(picker.value).toBe('armour');
	});

	it('is not fooled by a mod.self inside an if', async () => {
		// The language's `if` is lazy, so an observed set would report this as
		// accepting nothing on a character whose item is stowed.
		await openLayoutPanel(modifying('if(worn, 10 + mod.self, 10)'));
		const picker = control<HTMLSelectElement>(harness, 'modifier-Ring of Protection-0-target');
		expect(Array.from(picker.options).map((one) => one.value)).toContain('armour');
	});




	it('offers Adds to and Sets, and hides the bonus type on Sets', async () => {
		/*
		 * An override is not contested by type, so the control goes rather than
		 * standing there meaning nothing — the same call **Publish per row** makes
		 * in the columns list, and the redraw is what carries it.
		 */
		await openLayoutPanel(modifying('10 + mod.self'));
		const operator = control<HTMLSelectElement>(
			harness,
			'modifier-Ring of Protection-0-operator',
		);
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual([
			'Adds to',
			'Sets',
		]);
		expect(has(harness, 'modifier-Ring of Protection-0-bonus-type')).toBe(true);
		choose(operator, 'override');
		await settle(harness.pane);
		expect(has(harness, 'modifier-Ring of Protection-0-bonus-type')).toBe(false);
		// And the layout says so, with the default left out of the file.
		expect((await harness.stored()).modifiers?.[0]?.operator).toBe('override');
	});


	it('reports a definition typed against a type the layout does not declare', async () => {
		/*
		 * The shipped check with its input moved: `parse/modifier-types.ts` reads
		 * the definitions where it used to walk every component's columns. It lives
		 * there rather than in a component's own `configError`, which is handed a
		 * config and never the layout — and a definition is not a component's at
		 * all now.
		 */
		await openLayoutPanel(
			modifying('10 + mod.self', [
				{
					name: 'Ring of Protection',
					target: 'armour',
					amount: '1',
					bonusType: 'circumstance',
				},
			]),
		);
		const said =
			harness.container.querySelector('#sheetsmith-modifier-type-problems')
				?.textContent ?? '';
		expect(said).toContain('circumstance');
		expect(said).toContain('does not declare');
	});

	it('adds a modifier, and does not write the key until one is added', async () => {
		// `parse/layout.ts`'s recorded trap: a layout that never wanted definitions
		// must not grow the key from a pane that was merely opened.
		await openLayoutPanel(modifying('10 + mod.self', []));
		expect((await harness.stored()).modifiers).toBeUndefined();
		expect(said()).toContain('No modifiers yet.');
		const add = Array.from(
			harness.container.querySelectorAll<HTMLButtonElement>('button'),
		).find((one) => one.textContent === 'Add modifier');
		add?.click();
		await settle(harness.pane);
		expect((await harness.stored()).modifiers?.[0]?.name).toBe('New modifier');
	});



	it('writes the amount and the condition, and omits a blank condition', async () => {
		await openLayoutPanel(modifying('10 + mod.self'));
		type(control<HTMLInputElement>(harness, 'modifier-Ring of Protection-0-amount'), '2');
		await settle(harness.pane);
		expect((await harness.stored()).modifiers?.[0]?.amount).toBe('2');
		type(control<HTMLInputElement>(harness, 'modifier-Ring of Protection-when'), 'Worn');
		await settle(harness.pane);
		expect((await harness.stored()).modifiers?.[0]?.when).toBe('Worn');
		type(control<HTMLInputElement>(harness, 'modifier-Ring of Protection-when'), '  ');
		await settle(harness.pane);
		expect((await harness.stored()).modifiers?.[0]).not.toHaveProperty('when');
	});

});

describe('a Record set with its field names shown', () => {
	/** One list, with the strip off. */
	function listed(): Layout {
		return {
			name: 'Listed sheet',
			components: [
				{
					id: 'traits',
					type: 'record-set',
					label: 'Traits',
					position: { col: 1, row: 1, width: 7, height: 3 },
					fields: [{ key: 'Uses', type: 'number' }],
				} as unknown as ComponentConfig,
			],
			triggers: [],
		};
	}

	it('offers the setting in Appearance, and writes it only while it is on', async () => {
		const harness = await open(listed());
		control(harness, 'edit-traits').click();
		await settle(harness.pane);

		// Offered beside **Hide the heading**, the other Appearance toggle.
		const name = 'Field names over the list';
		expect(checkbox(harness, name).checked).toBe(false);
		expect(checkbox(harness, 'Hide the heading')).toBeTruthy();

		toggle(checkbox(harness, name), true);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).toMatchObject({
			fieldHeadings: true,
		});

		// Back to the default: the key goes rather than saying `false`, so an
		// author turning it off leaves a layout the way it was before they turned it on.
		toggle(checkbox(harness, name), false);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).not.toHaveProperty(
			'fieldHeadings',
		);
	});
});

describe('a layout that omits its column count', () => {
	/** No `columns` key at all, which is a layout the parser accepts. */
	function bare(): Layout {
		return {
			name: 'Bare sheet',
			components: [
				{
					id: 'armour',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
			],
			triggers: [],
		};
	}

	beforeEach(async () => {
		harness = await open(bare());
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
	});

	it('still omits it after the field has been shown and set back to the default', async () => {
		// The `options: []` and `children: []` trap a third time. An absent
		// `columns` has to stay absent through a round trip, so a value matching
		// the default deletes the key rather than writing `"columns": 12`.
		expect(control<HTMLInputElement>(harness, 'layout-columns').value).toBe(
			'12',
		);
		type(control<HTMLInputElement>(harness, 'layout-columns'), '12');
		await settle(harness.pane);
		expect(Object.keys(await harness.stored())).not.toContain('columns');
	});

	it('shows an inline error for a count below one, rather than persisting it', async () => {
		// `parseLayout` refuses anything that is not a positive integer, so
		// letting this through would have `persist` refuse the whole file with a
		// notice and drop the edit — an error about the layout, on a keystroke.
		const input = control<HTMLInputElement>(harness, 'layout-columns');
		type(input, '0');
		await settle(harness.pane);

		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(Object.keys(await harness.stored())).not.toContain('columns');
	});
});

/*
 * The schematic's pointer gestures: dragging a block, dragging its corner, and
 * the arrow keys.
 *
 * **The layer these drive now lives in `schematic-gestures.ts`, and these cases
 * stayed.** That is a departure from §10's one test file per module, and the
 * reason is the harness above rather than the cases below: every one of them is
 * driven through a real pane — `open` writes a layout file into a stub vault and
 * renders `LayoutEditorView` — because the pane's answers to what is open and
 * what is selected are the ones that ship. A sibling test file cannot import
 * that harness: §2 keeps `src/test/` for scaffolding and a test file is not
 * scaffolding, so moving these means designing the workspace fixture §11's third
 * row prices as its own piece of work. The cheaper alternative — a
 * `SchematicGestures` built over a fake host and a hand-made cell — would
 * rewrite every assertion here to test the seam instead of the gesture.
 *
 * So the cases did not move when the code did, and this comment is the record of
 * why rather than an oversight. **The extraction itself left them untouched:** not
 * one assertion changed and no import either, which is the strongest thing that
 * can be said for a pure movement.
 *
 * One assertion has been added *since*, and the boundary matters because commits
 * are split against these records. `follows the pointer on the cell itself` now
 * counts the drag's write after a bare `tick()` as well as after `settle`. That
 * is coverage the new seam owed rather than fallout from the move: `persist` and
 * `persistSoon` became two members of `SchematicHost` precisely because which one
 * a gesture uses is its own policy, and counting only after the flush could not
 * tell them apart.
 */

/**
 * A layout whose three blocks are placed for the gestures, not for the tree.
 *
 * `fixture()` and `furnished()` are both shaped by what they were written for —
 * a component with a reset binding, a container with a child — and every drag
 * below needs a block with known room on each side of it. Stating that here is
 * cheaper than reading a bound off a fixture that owes it to something else.
 */
function schematic(): Layout {
	return {
		name: 'Gesture sheet',
		columns: 12,
		components: [
			// Room on the right and hard against the top and left, so a clamp is
			// several columns away rather than one.
			{
				id: 'left',
				type: 'card',
				label: 'Left',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			// What `left` is dragged onto, so an overlap is one gesture away —
			// and off both edges, so all four arrows have somewhere to go.
			{
				id: 'right',
				type: 'card',
				label: 'Right',
				position: { col: 5, row: 2, width: 2, height: 1 },
			},
			// Ends flush at column 12, so it is against the right-hand bound
			// before anything touches it.
			{
				id: 'edge',
				type: 'card',
				label: 'Edge',
				position: { col: 11, row: 1, width: 2, height: 1 },
			},
		],
		triggers: [],
	};
}

/*
 * The geometry happy-dom does not have.
 *
 * `previewMetrics` divides the schematic's `clientWidth` by its column count to
 * get a track, and happy-dom reports 0 — so `track > 0` is false, the metrics
 * come back null, and `beginDrag` returns before its first line of arithmetic.
 * That is the whole reason this file had no pointer case until now, and it is
 * the enabling step rather than a detail.
 *
 * **Spelled here rather than in `src/test/`**, on both rules that bear on it.
 * §2 keeps that folder for scaffolding shared across tests, and `pointer.ts`'s
 * own header is explicit that what lives there is the event *shape* every
 * control is driven by; a grid's track width is not that. §1 is the other half:
 * one consumer earns no shared module, and this has exactly one — the schematic
 * is the only surface in the plugin a pointer lands on by grid cell. If a second
 * ever appears, this moves and the header there says why.
 *
 * Only `clientWidth` is faked. Everything else `previewMetrics` reads resolves
 * to nothing under happy-dom and falls back deliberately: the gaps and the
 * padding to 0, `getBoundingClientRect` to the origin, and `grid-auto-rows` to
 * the 44 the module itself names. So `ROW` is that fallback read back rather
 * than a number chosen here, and a column is exactly `TRACK` wide with the grid
 * starting at the viewport origin.
 *
 * **What that leaves undriven, and why it is left.** `previewMetrics` reads the
 * gaps and the padding so that a theme moving either moves the drop targets with
 * it, and nothing below holds it to that. Half of it cannot be held: `left` and
 * `top` are a uniform offset and every gesture here is a *delta* from where the
 * block was picked up, so the offset cancels and no drag can observe it. The
 * other half — the gap coming out of the track width — is observable, but only
 * at coordinates picked to straddle a cell boundary, since a gap-blind track is
 * `W / n` against a gap-aware `(W + gap) / n` and the two agree almost
 * everywhere. A case built on that would fail more readily over its own
 * coordinates than over the code, which is why the padding and the gap are 0
 * here and this paragraph is the record instead.
 */
const TRACK = 10;
const ROW = 44;

/** Give a schematic a measurable width: `columns` tracks of `TRACK` px. */
function measure(el: HTMLElement, columns = 12): HTMLElement {
	Object.defineProperty(el, 'clientWidth', {
		value: columns * TRACK,
		configurable: true,
	});
	return el;
}

/**
 * The sheet's own canvas grid, measured so a pointer can land on a cell of
 * it.
 *
 * `.sheetsmith-editor-canvas .sheetsmith-grid` rather than the interim
 * schematic's `.sheetsmith-layout-preview`: the canvas renders the layout's
 * real components on the sheet's own grid class
 * (`docs/features/grid-canvas.md`), and that grid element is exactly what
 * `previewMetrics` reads geometry off.
 */
function sheetGrid(harness: Harness, columns = 12): HTMLElement {
	const el = harness.container.querySelector(
		'.sheetsmith-editor-canvas .sheetsmith-grid',
	);
	if (!el) throw new Error('no canvas grid');
	return measure(el as HTMLElement, columns);
}

/** The middle of grid cell (col, row), in client coordinates. */
function at(col: number, row: number): PointerEventInit {
	return {
		clientX: (col - 1) * TRACK + TRACK / 2,
		clientY: (row - 1) * ROW + ROW / 2,
	};
}

/**
 * Run the pointer to the middle of a grid cell.
 *
 * Dispatched directly rather than through `src/test/pointer.ts`, which is
 * exactly where that module's header puts it: a `pointermove` is only ever part
 * of a drag, and a drag chooses its own coordinates. `pointer-gestures.test.ts`
 * scans for the down and the up, and both of those do go through it.
 */
function dragTo(cell: HTMLElement, col: number, row: number): void {
	cell.dispatchEvent(
		new PointerEvent('pointermove', { pointerId: 1, ...at(col, row) }),
	);
}

/** What a block's cell says it is: `describeCell`, as a reader hears it. */
function reads(harness: Harness, id: string): string {
	return control(harness, `preview-${id}`).getAttribute('aria-label') ?? '';
}

/**
 * The inline grid placement a gesture writes.
 *
 * Read off the overlay's own parent `.sheetsmith-cell` rather than off the
 * overlay itself: the overlay is what receives the gesture, but the canvas
 * writes the grid placement onto the live cell so the real component
 * reflows during the drag (§3) — `control(harness, 'preview-<id>')` is the
 * overlay, one level in from the cell this reads.
 */
function box(overlay: HTMLElement): string {
	const cell = overlay.parentElement ?? overlay;
	return `${cell.style.gridColumn}, ${cell.style.gridRow}`;
}

/** A block's position as the layout file holds it. */
async function position(
	harness: Harness,
	id: string,
): Promise<GridPosition> {
	const found = (await harness.stored()).components.find(
		(component) => component.id === id,
	);
	if (!found) throw new Error(`no "${id}" in the stored layout`);
	return found.position;
}

/**
 * Press a key on a block, re-querying the cell every time.
 *
 * `nudge` redraws the schematic, so the element that took the last key is
 * detached by the time the next one is pressed. A test holding one reference
 * would be typing into a block that is no longer on screen.
 *
 * Hands the event back, and always `cancelable`, because whether the block
 * consumed the key is half of what there is to assert: a key the schematic does
 * not answer has to reach the browser.
 *
 * The third `pressKey` in the repository, after Card's and Track's, and
 * `src/test/pointer.ts`'s header carries the argument for why three of these and
 * one pointer press is the right split — read it there rather than trusting a
 * restatement here. What is local to this one: it addresses a block by focus
 * token, which is this module's own convention, and it hands the event back.
 *
 * **The re-query is a workaround, and it hides something.** Sending every key to
 * a freshly resolved cell hand-delivers a run a keyboard could not: in the app
 * the second key of a run reaches the block only because `drawSchematics`
 * restores focus across the redraw it just caused. So the cases built on this
 * helper drive the arithmetic and not the thing that lets a run happen at all,
 * which is §10's `hold-repeat` failure — a caller that never exercises the path
 * it depends on. `keeps the block focused across its own redraw` presses a run
 * the way a keyboard does and holds that path; nothing else here does.
 */
function pressKey(
	harness: Harness,
	id: string,
	key: string,
	shift = false,
): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		key,
		shiftKey: shift,
		cancelable: true,
	});
	control(harness, `preview-${id}`).dispatchEvent(event);
	return event;
}

describe('dragging a block around the schematic', () => {
	beforeEach(async () => {
		harness = await open(schematic());
	});

	it('starts nothing on a grid it cannot measure, or a press that is not the primary button', () => {
		/*
		 * Both of `beginDrag`'s refusals, and between them the vacuity guard for
		 * every case below (§10). The first half is the untouched happy-dom
		 * geometry: a schematic of no measurable width has no cell for a pointer
		 * to be over, and a track of zero width divides every coordinate into an
		 * infinite column. It is also the proof that `measure` is load bearing —
		 * if these cases ever start passing without it, they have stopped driving
		 * `place`.
		 */
		const unmeasured = control(harness, 'preview-left');
		pressDown(unmeasured, at(1, 1));
		dragTo(unmeasured, 4, 1);
		expect(box(unmeasured)).toBe('1 / span 2, 1 / span 1');
		expect(unmeasured.hasPointerCapture(1)).toBe(false);

		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, { button: 2, ...at(1, 1) });
		dragTo(cell, 4, 1);
		expect(box(cell)).toBe('1 / span 2, 1 / span 1');
		expect(cell.hasPointerCapture(1)).toBe(false);
	});

	it('follows the pointer on the cell itself, and writes the file once on release', async () => {
		/*
		 * The gesture's two halves at once, because they are the same claim seen
		 * from either end. Only the dragged block's own grid position is written
		 * while the pointer is down — rebuilding the preview would destroy the
		 * element holding the pointer capture, and the drag would end on the
		 * first move — and the rebuild and the write happen once, at the end.
		 *
		 * `unevenSchematic()` rather than the `beforeEach`'s own `schematic()`:
		 * this is the spec's canonical drag proof, asked to run against a
		 * fixture with a real multi-row component sharing it — `left` sits at
		 * the same place either fixture holds it, so nothing below changes.
		 */
		harness = await open(unevenSchematic());
		sheetGrid(harness);
		const wrote = writes(harness);
		const cell = control(harness, 'preview-left');

		// Read off the event rather than asserted about the browser: the press
		// suppresses the text selection and the native button drag, and it is
		// also what suppresses the focus change — which is why `redraw` commits
		// the function library rather than trusting a blur.
		let down: Event | undefined;
		cell.addEventListener('pointerdown', (event) => {
			down = event;
		});
		pressDown(cell, { cancelable: true, ...at(1, 1) });
		expect(down?.defaultPrevented).toBe(true);
		expect(cell.hasPointerCapture(1)).toBe(true);
		dragTo(cell, 2, 1);
		expect(box(cell)).toBe('2 / span 2, 1 / span 1');
		expect(cell.classList.contains('sheetsmith-preview-dragging')).toBe(true);
		// Not a resize: the corner is the only thing that sets this.
		expect(cell.classList.contains('sheetsmith-preview-resizing')).toBe(false);

		dragTo(cell, 4, 3);
		expect(box(cell)).toBe('4 / span 2, 3 / span 1');
		// The same element throughout, so the capture it holds is still live.
		expect(harness.container.contains(cell)).toBe(true);
		expect(wrote()).toBe(0);

		release(cell);
		// Counted before anything flushes, which is what makes this the drag's own
		// write rather than a debounce's. `settle` runs the pending timer, so a
		// `persistSoon` here would land one write too and read the same after it —
		// and `nudge`, which is meant to be debounced, is held to the reverse.
		await tick();
		expect(wrote()).toBe(1);

		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 4,
			row: 3,
			width: 2,
			height: 1,
		});
		expect(wrote()).toBe(1);
		// One rebuild, on release: the cell that held the capture is gone, and
		// the block reads out its new place.
		expect(harness.container.contains(cell)).toBe(false);
		expect(cell.classList.contains('sheetsmith-preview-dragging')).toBe(false);
		expect(cell.hasPointerCapture(1)).toBe(false);
		expect(reads(harness, 'left')).toBe('Left: column 4, row 3, 2×1');
	});

	it('measures the delta from where the block was picked up, not from the last frame', async () => {
		/*
		 * `place`'s own claim: a pointer that runs past a bound and comes back
		 * resumes exactly. Accumulate the delta instead and the first frame
		 * spends the block's whole remaining travel, so coming back one column
		 * from the origin lands it at the bound rather than at column 2.
		 */
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));

		dragTo(cell, 20, 1);
		expect(box(cell)).toBe('11 / span 2, 1 / span 1');

		// Out the other side, where the bound is a floor rather than a computed
		// edge. The block is already against it, so an unclamped column shows up
		// as a negative one the grid has no cell for.
		dragTo(cell, -3, 1);
		expect(box(cell)).toBe('1 / span 2, 1 / span 1');

		dragTo(cell, 2, 1);
		expect(box(cell)).toBe('2 / span 2, 1 / span 1');

		// The row axis has a bound of its own — there is no row 0 for the grid to
		// place a block on — and it is the same claim: held at 1 on the way out,
		// and resumed from the origin on the way back rather than from the 1.
		dragTo(cell, 2, -1);
		expect(box(cell)).toBe('2 / span 2, 1 / span 1');
		dragTo(cell, 2, 3);
		expect(box(cell)).toBe('2 / span 2, 3 / span 1');

		release(cell);
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 2,
			row: 3,
			width: 2,
			height: 1,
		});
	});

	it('marks a block held at the right-hand bound from the first frame', () => {
		/*
		 * The bail-out order inside `place`, which was chosen for this case: the
		 * mark is about where the block *is*, not about it having just moved. A
		 * block already flush at the last column is held on the frame it is
		 * picked up on — the frame that changes nothing and returns early — so a
		 * no-op check first would never show the feedback in the one case it
		 * exists for.
		 */
		sheetGrid(harness);
		const held = control(harness, 'preview-edge');
		pressDown(held, at(11, 1));
		dragTo(held, 11, 1);
		expect(held.classList.contains('sheetsmith-preview-clamped')).toBe(true);
		// And the frame really did change nothing, which is what makes this the
		// early-return path rather than an ordinary move.
		expect(box(held)).toBe('11 / span 2, 1 / span 1');
		expect(held.classList.contains('sheetsmith-preview-dragging')).toBe(false);
		release(held);

		// The other half of the same toggle: a block with room is not marked, and
		// gains the mark on the frame that spends the last of it.
		const free = control(harness, 'preview-left');
		pressDown(free, at(1, 1));
		dragTo(free, 2, 1);
		expect(free.classList.contains('sheetsmith-preview-clamped')).toBe(false);
		dragTo(free, 11, 1);
		expect(free.classList.contains('sheetsmith-preview-clamped')).toBe(true);
		// And off again on the way back, or the block would read as held for the
		// rest of a gesture that has room on both sides of it.
		dragTo(free, 2, 1);
		expect(free.classList.contains('sheetsmith-preview-clamped')).toBe(false);
		release(free);
	});

	it('repaints the overlap marks and rewrites the labels mid-gesture', async () => {
		/*
		 * `markOverlaps`, driven. The paint-time case above pins the index
		 * mapping it rests on without a pointer and says so; this is the half it
		 * could not reach — the marks and the labels being kept true *during* a
		 * drag, on both blocks of the collision and in both directions.
		 *
		 * The label is the part worth the assertion: it carries the block's
		 * position and size, so a gesture that changes either has to rewrite it
		 * rather than leave it describing where the block used to be.
		 */
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));

		// Onto `right`, which spans columns 5-6 of row 2.
		dragTo(cell, 4, 2);
		expect(reads(harness, 'left')).toBe(
			'Left: column 4, row 2, 2×1. Overlaps another component',
		);
		expect(reads(harness, 'right')).toBe(
			'Right: column 5, row 2, 2×1. Overlaps another component',
		);
		expect(
			Array.from(
				harness.container.querySelectorAll('.sheetsmith-preview-overlap'),
			).map((el) => el.getAttribute('aria-label')?.split(':')[0]),
		).toEqual(['Left', 'Right']);

		// And off it again, which has to clear the mark on the block that never
		// moved as well as on the one that did.
		dragTo(cell, 8, 2);
		expect(reads(harness, 'left')).toBe('Left: column 8, row 2, 2×1');
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 2×1');
		expect(
			harness.container.querySelectorAll('.sheetsmith-preview-overlap'),
		).toHaveLength(0);

		release(cell);
		await settle(harness.pane);
	});

	it('resizes from the corner without also picking the whole block up', async () => {
		/*
		 * What the handle's `stopPropagation` is for. Both `pointerdown`
		 * listeners are live — the handle's and, one hop up, the cell's — so
		 * without it the corner starts a resize *and* a move, and every frame
		 * writes the same delta into both pairs of numbers. `col` staying at 1 is
		 * the whole assertion: the block grows to the right rather than walking
		 * there.
		 *
		 * `unevenSchematic()`, the spec's canonical resize proof: `left` grows
		 * to column 4 at most, well clear of `right`'s columns 5-6, so nothing
		 * about the resize below changes for sharing a schematic with `tall`.
		 */
		harness = await open(unevenSchematic());
		// Open on the block being resized, so the form's own numbers are on
		// screen to follow. `finish` writes them the way `nudge` does — the drag
		// is the other call site, and the panel showing a stale size after a
		// gesture that changed it is the same failure at either.
		control(harness, 'edit-left').click();
		await settle(harness.pane);
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		const handle = cell.querySelector('.sheetsmith-preview-resize');
		if (!handle) throw new Error('no resize handle');
		// Bubbling on purpose, and it is what makes the case a case: an event
		// that never reaches the cell would pass with the guard deleted.
		pressDown(handle, { bubbles: true, ...at(2, 1) });

		dragTo(cell, 4, 2);
		expect(box(cell)).toBe('1 / span 4, 1 / span 2');
		expect(cell.classList.contains('sheetsmith-preview-resizing')).toBe(true);
		expect(cell.classList.contains('sheetsmith-preview-dragging')).toBe(true);

		// A corner dragged back past the block's own origin: a block is at least
		// one cell, and a zero-width or zero-height one is a block the grid
		// cannot place at all.
		dragTo(cell, -2, -2);
		expect(box(cell)).toBe('1 / span 1, 1 / span 1');
		dragTo(cell, 4, 2);

		release(cell);
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 1,
			row: 1,
			width: 4,
			height: 2,
		});
		expect(control<HTMLInputElement>(harness, 'pos-left-width').value).toBe('4');
		expect(control<HTMLInputElement>(harness, 'pos-left-height').value).toBe('2');
		expect(control<HTMLInputElement>(harness, 'pos-left-col').value).toBe('1');
	});

	it('puts the block back when the gesture is abandoned, whichever way it ends', async () => {
		/*
		 * Forgiveness on the one gesture where a mistake is a slip of the hand.
		 * Escape and `pointercancel` are the same restore — no delta from the
		 * origin is where the block was picked up — and neither may leave a
		 * changed position in the file. The write still happens, because the
		 * gesture did touch the layout and putting it back is a change to undo,
		 * so the claim is about the numbers rather than about the write.
		 *
		 * `unevenSchematic()`, the spec's canonical Escape proof: both drags
		 * below land at column 6, row 3, clear of `right`'s row 2 and `tall`'s
		 * columns 9-10, so the restore below is unaffected by sharing the
		 * schematic with a real multi-row component.
		 */
		harness = await open(unevenSchematic());
		sheetGrid(harness);
		const escaped = control(harness, 'preview-left');
		pressDown(escaped, at(1, 1));
		dragTo(escaped, 6, 3);
		expect(box(escaped)).toBe('6 / span 2, 3 / span 1');
		escaped.ownerDocument.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape' }),
		);
		expect(box(escaped)).toBe('1 / span 2, 1 / span 1');
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 1,
			row: 1,
			width: 2,
			height: 1,
		});

		sheetGrid(harness);
		const cancelled = control(harness, 'preview-left');
		pressDown(cancelled, at(1, 1));
		dragTo(cancelled, 6, 3);
		cancel(cancelled);
		expect(box(cancelled)).toBe('1 / span 2, 1 / span 1');
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 1,
			row: 1,
			width: 2,
			height: 1,
		});
	});

	it("writes into a container's own list, against the container's own grid", async () => {
		/*
		 * The gesture is parameterised over which list it writes rather than
		 * copied per level, so both parameters have to follow the schematic and
		 * not the sheet: the child's new position lands in `defences.children`,
		 * and the bound it stops at is the container's six columns rather than
		 * the twelve the sheet has. Every other case here drags on the sheet's
		 * own schematic, where a column count read from a literal would pass.
		 */
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);

		const inner = harness.container.querySelector(
			'[data-sheetsmith-grid="defences"]',
		);
		if (!inner) throw new Error('no schematic for the container');
		measure(inner as HTMLElement, 6);

		const cell = control(harness, 'preview-armour');
		pressDown(cell, at(1, 1));
		dragTo(cell, 20, 2);
		// Six columns, so a 2-wide child ends flush at column 6 and is held at 5.
		// A sheet-width bound would have let it out to 11.
		expect(box(cell)).toBe('5 / span 2, 2 / span 1');
		// The repaint follows the schematic too, not the sheet's: the child's
		// label is rewritten mid-gesture, which only happens if `markOverlaps`
		// indexed the list it was handed.
		expect(reads(harness, 'armour')).toBe('Armour class: column 5, row 2, 2×1');

		release(cell);
		await settle(harness.pane);
		const stored = (await harness.stored()).components.find(
			(component) => component.id === 'defences',
		);
		expect(stored?.children?.[0]?.position).toEqual({
			col: 5,
			row: 2,
			width: 2,
			height: 1,
		});
		// And nothing was written into the sheet's own list on the way past.
		expect(await position(harness, 'abilities')).toEqual({
			col: 7,
			row: 1,
			width: 6,
			height: 1,
		});
	});

	it('swallows the click a drag leaves behind, and only that one', async () => {
		/*
		 * A drag ends in a click on the same element, and that click meant "put
		 * it here" rather than "select it". The panel's heading is what says
		 * which: it stays on the layout's own settings through the drag, and an
		 * ordinary press on the same block still selects — which is the half that
		 * keeps the guard from being a way to break selection outright.
		 */
		sheetGrid(harness);
		const heading = () =>
			harness.container
				.querySelector('.sheetsmith-editor-panel')
				?.querySelector('.setting-item-heading')?.textContent;
		expect(heading()).toBe('Layout');

		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		dragTo(cell, 4, 1);
		release(cell);
		// Synchronously, the way the browser dispatches it: `dragged` is cleared
		// on the next turn of the loop.
		cell.click();
		await settle(harness.pane);
		expect(heading()).toBe('Layout');

		// A whole press with no move in it, which is what the guard has to tell
		// apart from the drag above: `finish` leaves early when nothing moved, so
		// the click that follows is an ordinary one.
		const pressed = control(harness, 'preview-left');
		pressDown(pressed, at(4, 1));
		release(pressed);
		pressed.click();
		await settle(harness.pane);
		expect(heading()).toBe('Left');
	});
});

/**
 * Give a schematic explicit, unequal row tracks — the geometry a browser
 * reports once a grid's rows are no longer alike, which is exactly what a
 * live component's rows are not (§3 of the grid canvas spec).
 *
 * Monkeypatches `getComputedStyle` for this one element, on the same argument
 * `measure` already makes for `clientWidth`: happy-dom does not run layout, so
 * `grid-template-rows` never resolves into pixels on its own. Restored is not
 * needed — the whole environment is disposed with the test.
 */
function measureRows(
	el: HTMLElement,
	tracks: string,
	property: 'gridTemplateRows' | 'gridTemplateColumns' = 'gridTemplateRows',
): void {
	const view = el.ownerDocument.defaultView;
	if (!view) throw new Error('no window');
	const original = view.getComputedStyle.bind(view);
	view.getComputedStyle = ((target: Element, pseudo?: string | null) => {
		const styles = original(target, pseudo);
		if (target === el) {
			Object.defineProperty(styles, property, {
				value: tracks,
				configurable: true,
			});
		}
		return styles;
	});
}

/**
 * The same, for columns: what a browser reports once content has widened some
 * `1fr` tracks and squeezed the empty ones, which is what an eight-column sheet
 * with three occupied columns looked like when the drag divided it evenly.
 * Chains onto `measureRows`'s patch rather than replacing it, so a case can set
 * both.
 */
function measureColumns(el: HTMLElement, tracks: string): void {
	measureRows(el, tracks, 'gridTemplateColumns');
}

/**
 * A schematic with a real two-row-tall component sharing space with a
 * one-row one.
 *
 * `schematic()`'s own three blocks (`left`, `right`, `edge`) are all
 * `height: 1` — a dozen other tests key off their exact placements, so
 * reshaping one of them risks every test that drags onto or clamps against
 * it rather than proving anything new here. `docs/features/grid-canvas.md`'s
 * "canvas gestures" criterion asks for a fixture where a multi-row component
 * genuinely shares a schematic with a one-row one, so this is its own small
 * fixture rather than a `schematic()` edit: `tall` spans two real grid rows,
 * `short` is one row directly beneath it, and `left` is what the row-boundary
 * tests below drag down across the boundary between them.
 *
 * **`right` is `schematic()`'s own block, unchanged, at the same place.** The
 * spec's own "all four" line does not stop at the row-boundary drag — the
 * plain drag, resize, Escape and keyboard-nudge proofs are asked to run
 * against a fixture with a real multi-row component in it too, and the
 * cheapest way to give them that without rewriting their own numbers is a
 * component here they already know. `tall`/`short` move to a column of their
 * own to make room, which nothing below depends on: the row-boundary tests
 * only ever read `left`'s column off a fixed pointer X, never `tall`'s.
 */
function unevenSchematic(): Layout {
	return {
		name: 'Uneven gesture sheet',
		columns: 12,
		components: [
			// Dragged across the row boundary below — starts level with `tall`.
			{
				id: 'left',
				type: 'card',
				label: 'Left',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			// `schematic()`'s own `right`, same place — what the nudge tests
			// below drag and step, now sharing a schematic with a real
			// multi-row component rather than only ever `height: 1` siblings.
			{
				id: 'right',
				type: 'card',
				label: 'Right',
				position: { col: 5, row: 2, width: 2, height: 1 },
			},
			// Two rows tall — the real multi-row placement the drag below
			// crosses, moved off `right`'s columns so the two never overlap.
			{
				id: 'tall',
				type: 'card',
				label: 'Tall',
				position: { col: 9, row: 1, width: 2, height: 2 },
			},
			// One row, directly under `tall` — the one-row component's band
			// the drag below lands in once it passes `tall`'s own two rows.
			{
				id: 'short',
				type: 'card',
				label: 'Short',
				position: { col: 9, row: 3, width: 2, height: 1 },
			},
		],
		triggers: [],
	};
}

describe('row geometry read off the grid rather than assumed', () => {
	it('lands a drag in the row the pointer is actually over, not a uniform pitch\'s', async () => {
		harness = await open(unevenSchematic());
		const grid = sheetGrid(harness);
		// `tall`'s own two rows, resolved to 88px then 44px — so a uniform
		// 44px pitch (the old behaviour, and what `measure`'s own ROW
		// constant is) would place a pointer at y=100 one row further down
		// than the grid it is actually drawn on says: still inside `tall`'s
		// own band (its second row), not past it.
		measureRows(grid, '88px 44px');

		const cell = control(harness, 'preview-left');
		pressDown(cell, { clientX: TRACK / 2, clientY: 10 });
		cell.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: TRACK / 2,
				clientY: 100,
			}),
		);
		expect(box(cell)).toBe('1 / span 2, 2 / span 1');
		release(cell);
	});

	it('drags across a two-row-tall component into a one-row component\'s band', async () => {
		harness = await open(unevenSchematic());
		const grid = sheetGrid(harness);
		measureRows(grid, '88px 44px');

		const cell = control(harness, 'preview-left');
		pressDown(cell, { clientX: TRACK / 2, clientY: 10 });
		// 88 + 44 = 132 is the end of `tall`'s own two resolved rows; ten
		// pixels past it is still short of a further 44px pitch, so it counts
		// as the first row after the known ones — row 3, which is exactly
		// where `short`, the one-row component, already sits.
		cell.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: TRACK / 2,
				clientY: 132 + 10,
			}),
		);
		expect(box(cell)).toBe('1 / span 2, 3 / span 1');
		release(cell);
	});
});

/**
 * Every guide line the schematic is showing, by axis, in the order drawn.
 *
 * Read off each line's own `style` and not off a rule, because the geometry is
 * the one thing about a guide that cannot be in the stylesheet: a grid whose
 * rows are content-sized has no pitch a CSS rule could name.
 */
function guides(grid: HTMLElement): { columns: number[]; rows: number[] } {
	// This grid's own guide and not a nested container's, on `canvas.ts`'s own
	// rule about reading a level locally: a `querySelectorAll` from the sheet's
	// grid finds every line a container inside it is drawing too, and the case
	// below turns on the sheet drawing none while a container draws five.
	const box = grid.querySelector<HTMLElement>(':scope > .sheetsmith-grid-guides');
	const read = (name: string, side: 'left' | 'top') =>
		Array.from(
			box?.querySelectorAll<HTMLElement>(`.sheetsmith-grid-guide-${name}`) ?? [],
		).map((line) => parseFloat(line.style[side]));
	return { columns: read('column', 'left'), rows: read('row', 'top') };
}

describe('the grid drawn behind a gesture', () => {
	beforeEach(async () => {
		harness = await open(schematic());
	});

	it('draws itself on the first movement and takes itself down on release', async () => {
		/*
		 * **When**, and the second half is the reason for the first: every
		 * selection on this canvas is a press on the same overlay a drag starts
		 * on, so a grid drawn at `pointerdown` would flash the whole lattice each
		 * time an author opened a component's form.
		 */
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');

		pressDown(cell, at(1, 1));
		expect(guides(grid).columns).toEqual([]);
		expect(grid.classList.contains('sheetsmith-grid-guided')).toBe(false);

		dragTo(cell, 2, 1);
		// Eleven interior boundaries across twelve columns, one every `TRACK`.
		// The outer two edges take no line: there is no gutter there, and a line
		// on them would read as a frame around the canvas rather than as the
		// grid inside it.
		expect(guides(grid).columns).toEqual([
			10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
		]);
		expect(grid.classList.contains('sheetsmith-grid-guided')).toBe(true);

		release(cell);
		expect(guides(grid).columns).toEqual([]);
		expect(grid.classList.contains('sheetsmith-grid-guided')).toBe(false);
		await settle(harness.pane);
	});

	it('leaves a press that only selects with no grid behind it', async () => {
		// The whole press, which the case above stops halfway through: what the
		// first-movement rule has to tell apart from a drag is a press that ends
		// where it started, and that is how an author opens a form.
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		release(cell);
		cell.click();
		await settle(harness.pane);
		expect(guides(grid).columns).toEqual([]);
		expect(guides(grid).rows).toEqual([]);
	});

	it('puts a row line where the drag changes row, not where a uniform pitch would', async () => {
		/*
		 * The claim the whole guide rests on: what is drawn is what the gesture
		 * snaps to, because both come from one reading of the grid. The fixture
		 * is `row geometry read off the grid`'s own — a two-row component beside
		 * a one-row one, resolving to `88px 44px` — where a uniform 44px pitch
		 * would draw lines at 44 and 88 and the grid actually changes row at 88
		 * and 132. The drag to y=100 lands in row 2, the band between the two
		 * lines that are drawn.
		 */
		harness = await open(unevenSchematic());
		const grid = sheetGrid(harness);
		measureRows(grid, '88px 44px');
		const cell = control(harness, 'preview-left');

		pressDown(cell, { clientX: TRACK / 2, clientY: 10 });
		cell.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: TRACK / 2,
				clientY: 100,
			}),
		);
		expect(guides(grid).rows).toEqual([88, 132]);
		expect(box(cell)).toBe('1 / span 2, 2 / span 1');
		release(cell);
		await settle(harness.pane);
	});

	it('snaps to columns the content has widened, and draws them where they are', async () => {
		/*
		 * The defect this was reported on. `repeat(12, 1fr)` is not twelve equal
		 * columns once a component's content will not shrink: its track grows and
		 * the empty ones give up the width. Here the first two columns resolve to
		 * 40px and the rest to nothing much, so column 3 starts at 80 — where an
		 * even division of the 120px grid would put column 9. A pointer at x=82
		 * is over column 3, the line is drawn at 80, and the block lands there.
		 */
		const grid = sheetGrid(harness);
		measureColumns(grid, '40px 40px 4px 4px 4px 4px 4px 4px 4px 4px 4px 4px');
		const cell = control(harness, 'preview-left');

		pressDown(cell, { clientX: 5, clientY: ROW / 2 });
		cell.dispatchEvent(
			new PointerEvent('pointermove', { pointerId: 1, clientX: 82, clientY: ROW / 2 }),
		);
		expect(box(cell)).toBe('3 / span 2, 1 / span 1');
		expect(guides(grid).columns.slice(0, 3)).toEqual([40, 80, 84]);
		release(cell);
		await settle(harness.pane);
	});

	it('holds the tracks still for the gesture, and lets them go at the end', async () => {
		/*
		 * The grid's tracks are content-sized, so the block being dragged resizes
		 * the columns it passes through, and the lines and the target measured at
		 * the press would drift off the grid on screen. What is asserted is the
		 * mechanism: the measured sizes pinned inline at the press, and cleared
		 * whichever way the gesture ends — including a press that moved nothing,
		 * which returns before any other clean-up runs.
		 */
		const grid = sheetGrid(harness);
		measureColumns(grid, '40px 40px 4px 4px 4px 4px 4px 4px 4px 4px 4px 4px');
		measureRows(grid, '88px 44px');
		const cell = control(harness, 'preview-left');

		pressDown(cell, at(1, 1));
		expect(grid.style.gridTemplateColumns).toBe(
			'40px 40px 4px 4px 4px 4px 4px 4px 4px 4px 4px 4px',
		);
		expect(grid.style.gridTemplateRows).toBe('88px 44px');
		expect(grid.style.gridAutoRows).toBe(`${ROW}px`);
		release(cell);
		expect(grid.style.gridTemplateColumns).toBe('');
		expect(grid.style.gridTemplateRows).toBe('');
		expect(grid.style.gridAutoRows).toBe('');
		await settle(harness.pane);
	});

	it('marks the cells the block will occupy, and follows it', async () => {
		/*
		 * The lattice says where the lines are; the target says which cells this
		 * block is about to take, which is the question a drag is actually asking.
		 * Drawn from the tracks and not from the block's own box, so it is the
		 * placement the file will hold.
		 */
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		const target = () =>
			grid.querySelector<HTMLElement>(':scope > .sheetsmith-grid-target');

		pressDown(cell, at(1, 1));
		expect(target()).toBeNull();
		dragTo(cell, 2, 1);
		// `left` is two columns wide: columns 2 and 3, one row.
		expect(target()?.style.left).toBe('10px');
		expect(target()?.style.width).toBe('20px');
		expect(target()?.style.top).toBe('0px');
		expect(target()?.style.height).toBe(`${ROW}px`);

		dragTo(cell, 5, 3);
		expect(target()?.style.left).toBe('40px');
		expect(target()?.style.top).toBe(`${2 * ROW}px`);

		release(cell);
		expect(target()).toBeNull();
		await settle(harness.pane);
	});

	it('goes down on an Escape as well as on a release', async () => {
		// The restore is the other way a gesture ends, and a grid left behind by
		// it would sit over a layout nobody is dragging.
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		dragTo(cell, 6, 3);
		expect(guides(grid).columns.length).toBe(11);

		cell.ownerDocument.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape' }),
		);
		expect(guides(grid).columns).toEqual([]);
		expect(box(cell)).toBe('1 / span 2, 1 / span 1');
		await settle(harness.pane);
	});

	it("draws the container's own grid for a drag inside one, and not the sheet's", async () => {
		/*
		 * The guide is parameterised over the schematic exactly as the gesture
		 * is: a child dragged inside a six-column container is snapping to six
		 * columns, so that is the grid that appears, and the sheet's twelve stay
		 * out of it. Reading the sheet's own grid as well is what makes this a
		 * claim about *which* schematic rather than about any grid appearing.
		 */
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);
		const inner = harness.container.querySelector(
			'[data-sheetsmith-grid="defences"]',
		);
		if (!inner) throw new Error('no schematic for the container');
		measure(inner as HTMLElement, 6);

		const cell = control(harness, 'preview-armour');
		pressDown(cell, at(1, 1));
		dragTo(cell, 2, 1);
		expect(guides(inner as HTMLElement).columns).toEqual([10, 20, 30, 40, 50]);
		expect(guides(sheetGrid(harness)).columns).toEqual([]);
		release(cell);
		await settle(harness.pane);
	});
});

describe('nudging a block', () => {
	it('writes the panel\'s four position fields without rebuilding the pane', async () => {
		/*
		 * Holding an arrow key is the one rapid-fire gesture here, and a teardown
		 * per repeat is the latency cliff `nudge` was written to avoid. The write
		 * is debounced; this is the other half of that, and with the form in a
		 * panel rather than under the row it is a different element being written
		 * into.
		 */
		harness = await open(furnished());
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		const panel = harness.container.querySelector('.sheetsmith-editor-panel');
		const col = control<HTMLInputElement>(harness, 'pos-abilities-col');
		expect(col.value).toBe('7');

		control(harness, 'preview-abilities').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
		);

		expect(col.value).toBe('6');
		// The same node, not merely a node with the same value: a rebuild would
		// have replaced both the panel and the field inside it.
		expect(harness.container.querySelector('.sheetsmith-editor-panel')).toBe(
			panel,
		);
		expect(control(harness, 'pos-abilities-col')).toBe(col);
	});

	it('moves the block with each of the four arrows, and never above row 1', async () => {
		/*
		 * All four deltas and the row floor in one run, because they are one
		 * table: a missing entry is a key the block ignores, and the floor is the
		 * `Math.max(1, …)` under it. Read off the block's own label rather than
		 * the file, so what a reader hears is held to the same numbers.
		 *
		 * `unevenSchematic()`, the spec's canonical keyboard-nudge proof:
		 * `right` never leaves columns 5-7, clear of `tall`/`short` at 9-10, so
		 * every number below is unchanged from `schematic()`'s own `right`.
		 */
		harness = await open(unevenSchematic());
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 2×1');

		pressKey(harness, 'right', 'ArrowRight');
		expect(reads(harness, 'right')).toBe('Right: column 6, row 2, 2×1');
		pressKey(harness, 'right', 'ArrowLeft');
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 2×1');
		pressKey(harness, 'right', 'ArrowDown');
		expect(reads(harness, 'right')).toBe('Right: column 5, row 3, 2×1');
		pressKey(harness, 'right', 'ArrowUp');
		pressKey(harness, 'right', 'ArrowUp');
		expect(reads(harness, 'right')).toBe('Right: column 5, row 1, 2×1');
		// Already at the top, so this one has nowhere to go and must not write a
		// row 0 the sheet's grid has no cell for.
		pressKey(harness, 'right', 'ArrowUp');
		expect(reads(harness, 'right')).toBe('Right: column 5, row 1, 2×1');

		await settle(harness.pane);
		expect(await position(harness, 'right')).toEqual({
			col: 5,
			row: 1,
			width: 2,
			height: 1,
		});
	});

	it('resizes with shift held, and never below one row', async () => {
		// The same table read the other way: shift writes the other pair of
		// numbers, and `height` has the same floor `row` does.
		//
		// `unevenSchematic()`, the spec's canonical keyboard-resize proof —
		// `right` grows only as far as row 3, column 7, clear of `tall`/`short`.
		harness = await open(unevenSchematic());

		pressKey(harness, 'right', 'ArrowRight', true);
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 3×1');
		pressKey(harness, 'right', 'ArrowDown', true);
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 3×2');
		pressKey(harness, 'right', 'ArrowLeft', true);
		pressKey(harness, 'right', 'ArrowUp', true);
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 2×1');
		// A block one row tall cannot shrink further; a zero-height block is one
		// the grid cannot place.
		pressKey(harness, 'right', 'ArrowUp', true);
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 2×1');

		await settle(harness.pane);
		expect(await position(harness, 'right')).toEqual({
			col: 5,
			row: 2,
			width: 2,
			height: 1,
		});
	});

	it('stops where the drag stops, moving and growing alike', async () => {
		/*
		 * The failure `preview-grid.test.ts` says it exists to catch, driven
		 * through the gestures rather than through the function they share. That
		 * file can only hold the arithmetic half — `lastColumn` returning these
		 * numbers for these arguments — and not that the callers pass it the same
		 * ones. The arguments are the part that has already differed: `nudge`
		 * spells the moving pair `(columns, position.width, position.col)` and the
		 * drag spells it `(metrics.columns, width, start.col)`, in two places
		 * nothing keeps in step, and each gesture spells the growing pair a third
		 * and fourth time.
		 *
		 * A fresh layout per run, deliberately. `lastColumn`'s floor lets a block
		 * already past the edge stay there, so a second gesture on a block the
		 * first has walked out to the bound would agree for the wrong reason.
		 */
		const pushed = async (
			run: (fresh: Harness) => void,
		): Promise<GridPosition> => {
			const fresh = await open(schematic());
			sheetGrid(fresh);
			run(fresh);
			await settle(fresh.pane);
			return position(fresh, 'left');
		};

		const byArrows = await pushed((fresh) => {
			for (let i = 0; i < 20; i++) pressKey(fresh, 'left', 'ArrowRight');
		});
		const byDrag = await pushed((fresh) => {
			const cell = control(fresh, 'preview-left');
			pressDown(cell, at(1, 1));
			dragTo(cell, 20, 1);
			release(cell);
		});
		const byShiftArrows = await pushed((fresh) => {
			for (let i = 0; i < 20; i++) pressKey(fresh, 'left', 'ArrowRight', true);
		});
		const byCorner = await pushed((fresh) => {
			const cell = control(fresh, 'preview-left');
			// Unguarded, which `pointer.ts` allows only where something after the
			// gesture would notice a selector that missed: a handle that is not
			// there presses nothing, and the width below stays at 2.
			pressDown(cell.querySelector('.sheetsmith-preview-resize'), {
				bubbles: true,
				...at(2, 1),
			});
			dragTo(cell, 20, 1);
			release(cell);
		});
		// The panel's own numeral, a fourth way to move the same block and the
		// one gesture that types a number rather than counting a delta from it —
		// which is exactly why it went unguarded once: nothing here shares an
		// argument list with `nudge` or `beginDrag` for a test to catch drifting.
		const byField = await pushed((fresh) => {
			control(fresh, 'edit-left').click();
			type(control<HTMLInputElement>(fresh, 'pos-left-col'), '50');
		});

		// Real numbers, not merely equal ones. A 2-wide block pushed right ends
		// flush at column 12, so its `col` stops at 11; grown from column 1 the
		// same edge is a width of 12.
		expect(byArrows.col).toBe(11);
		expect(byDrag.col).toBe(byArrows.col);
		expect(byField.col).toBe(byArrows.col);
		expect(byShiftArrows.width).toBe(12);
		expect(byCorner.width).toBe(byShiftArrows.width);
	});

	it('says why a typed position came back lower than what was typed', async () => {
		// A drag or an arrow key stops at the edge and the stopping is itself
		// the feedback; a typed number has none, so the field says why it did
		// not keep what was typed.
		const message = (input: HTMLElement): string =>
			input.parentElement?.querySelector('.sheetsmith-field-error')
				?.textContent ?? '';

		harness = await open(schematic());
		control(harness, 'edit-left').click();
		const input = control<HTMLInputElement>(harness, 'pos-left-col');

		type(input, '50');
		expect(input.value).toBe('11');
		expect(message(input)).toBe(
			'Held to 12 columns. Raise "Grid columns" in the layout\'s own settings to place this further out.',
		);

		// Back inside the grid, the message clears — this is a boundary, not a
		// standing error on the field.
		type(input, '3');
		expect(input.value).toBe('3');
		expect(message(input)).toBe('');
	});

	it('keeps the block focused across its own redraw, so a run of keys lands', async () => {
		/*
		 * `nudge` redraws the schematic under the block that just took the key, so
		 * every other case here re-queries the cell between presses. This is the
		 * one that does not: focus lands on the block once, and every key after
		 * that goes to whatever holds focus — which is a run only if
		 * `drawSchematics` put the focus back on the block it redrew out from
		 * under.
		 *
		 * Distinct from the panel's restore below, which is the same idea at a
		 * different scope: that one is `pendingFocus` across a whole pane rebuild,
		 * keyed on a control the author was standing in. This is the schematic's
		 * own, which no rebuild of the pane is involved in.
		 */
		/** Whatever holds focus, refusing to carry on once it is the body. */
		const focused = (): HTMLElement => {
			const active = document.activeElement;
			if (!active || active === document.body) {
				throw new Error('focus was dropped to the body');
			}
			return active as HTMLElement;
		};

		/** Three keys, each sent to whatever holds focus rather than to a cell. */
		const run = (into: Harness, id: string): void => {
			control(into, `preview-${id}`).focus();
			for (let i = 0; i < 3; i++) {
				const before = focused();
				before.dispatchEvent(
					new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }),
				);
				// A different element every time — `drawSchematic` empties the grid
				// in place — so the focus followed the block by its token rather
				// than staying on a node no longer in the document.
				expect(focused()).not.toBe(before);
				expect(focused()).toBe(control(into, `preview-${id}`));
			}
		};

		harness = await open(schematic());
		run(harness, 'right');
		await settle(harness.pane);
		// All three keys landed on the block, which is what the focus was for.
		expect(await position(harness, 'right')).toEqual({
			col: 8,
			row: 2,
			width: 2,
			height: 1,
		});

		// And on a container's own schematic, which is what the restore is scoped
		// for: it searches the grid the block came out of, and a child is not in
		// the sheet's.
		const nested = await open(furnished());
		control(nested, 'edit-defences').click();
		await settle(nested.pane);
		run(nested, 'armour');
		await settle(nested.pane);
		const stored = (await nested.stored()).components.find(
			(component) => component.id === 'defences',
		);
		expect(stored?.children?.[0]?.position.col).toBe(4);
	});

	it('leaves a key it does not answer to the browser', async () => {
		// Four keys and nothing else, which is what lets Tab out of the schematic
		// and Enter through to the click that selects. Both halves are the claim:
		// the block does not move, and the key is not consumed.
		harness = await open(schematic());
		const before = reads(harness, 'right');

		for (const key of ['Tab', 'Enter', 'Home', 'PageDown']) {
			expect(pressKey(harness, 'right', key).defaultPrevented).toBe(false);
			expect(reads(harness, 'right')).toBe(before);
		}
		// And an arrow is consumed, or the schematic would scroll under the block
		// it just moved.
		expect(pressKey(harness, 'right', 'ArrowRight').defaultPrevented).toBe(true);
	});

	it('writes once for a run of arrows, however many were pressed', async () => {
		// The other half of what `nudge` avoids a rebuild for. Holding an arrow
		// key is the one rapid-fire gesture in the editor, and a write per repeat
		// is a file rewritten as fast as the key repeats.
		harness = await open(schematic());
		const wrote = writes(harness);

		pressKey(harness, 'right', 'ArrowRight');
		pressKey(harness, 'right', 'ArrowRight');
		pressKey(harness, 'right', 'ArrowDown');
		pressKey(harness, 'right', 'ArrowDown');
		expect(wrote()).toBe(0);

		await settle(harness.pane);
		expect(wrote()).toBe(1);
		expect(await position(harness, 'right')).toEqual({
			col: 7,
			row: 4,
			width: 2,
			height: 1,
		});
	});
});

describe('a control that redraws the pane', () => {
	/*
	 * Focus across the rebuild, which is the editor's own job rather than the
	 * pane's: the focus token is this module's convention, so restoring across a
	 * teardown this module asked for is too. The pane owns the scroll, which is
	 * the half it can see.
	 *
	 * Both of these lived in `settings.test.ts` while the tab held the editor and
	 * did the restoring. Moved rather than rewritten — what they check did not
	 * change, only which module owes it.
	 */
	beforeEach(async () => {
		harness = await open(furnished());
	});

	it('keeps focus across the redraw when it is a dropdown', async () => {
		// The kind that has always redrawn, so it holds the mechanism the
		// checkbox below depends on: if this one breaks the fault is the restore,
		// not the checkbox's token.
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		const select = control<HTMLSelectElement>(
			harness,
			'cfg-abilities-direction',
		);
		select.focus();
		choose(select, 'vertical');
		await settle(harness.pane);

		expect(document.activeElement).toBe(
			control(harness, 'cfg-abilities-direction'),
		);
	});

	it('gives a checkbox the token the redraw would need', async () => {
		// **This holds the precondition, not the behaviour, and the difference is
		// worth stating.** A boolean that decides another field's visibility
		// redraws the pane, and a control the editor cannot address by token is a
		// control focus falls off — landing the author on the body with the form
		// rebuilt around them. `Collapsible` was the only such boolean on any
		// component, and it went with the group's collapse (SPEC §13); the two
		// `visibleWhen`s left are both keyed on selects, which the test above
		// drives. So there is nothing to press here that redraws, and asserting
		// the token is on the checkbox is what is left: it is the one thing that
		// makes the redraw survivable, and it fails the moment the boolean
		// control stops carrying one.
		//
		// When a component next gains a boolean that controls visibility, this
		// goes back to driving it — press, redraw, assert focus — which is the
		// standing row in docs/PATTERNS.md §11.
		control(harness, 'edit-defences').click();
		await settle(harness.pane);

		// On the `.checkbox-container`, which is the element the app gives focus
		// to and the one the token has to address. This asserted on the input
		// while the stub made the input *be* that container — describing the
		// stub rather than the app, and passing while the app lost focus.
		const input = checkbox(harness, 'Hide the heading');
		const toggle = input.parentElement as HTMLElement;
		expect(toggle.classList.contains('checkbox-container')).toBe(true);
		expect(toggle.dataset.sheetsmithFocus).toBeTruthy();
		expect(control(harness, toggle.dataset.sheetsmithFocus ?? '')).toBe(toggle);
	});

	it('keeps an inline error on a field the rebuild draws again', async () => {
		/*
		 * The other half of surviving a redraw, and the half focus does not
		 * cover: an error is drawn into DOM the rebuild tears down, so it lives in
		 * a map keyed by focus token and is replayed afterwards. Correcting one
		 * field must not silently clear the message on another, and a message
		 * about a control that has gone is worse than none — which is why the
		 * replay also forgets what it cannot find.
		 *
		 * **Added after the panel moved out, not during.** The map is now the one
		 * member of `ConfigPanelHost` that is not a command, precisely because it
		 * outlives the panel that writes into it; handing the panel a map of its
		 * own left every case green, which made the decision §11 left open
		 * unfalsifiable either way.
		 */
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'pos-abilities-col');
		type(input, '0');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);

		// A control on the same form that redraws the pane, so the field comes
		// back under the same token rather than going away.
		choose(control<HTMLSelectElement>(harness, 'cfg-abilities-direction'), 'vertical');
		await settle(harness.pane);

		const redrawn = control<HTMLInputElement>(harness, 'pos-abilities-col');
		expect(redrawn).not.toBe(input);
		expect(redrawn.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(redrawn.parentElement?.textContent).toContain(
			'Whole number, 1 or more.',
		);
	});
});

describe('a vault with no layouts in it', () => {
	/** The pane in the one state with no tree and no panel to draw. */
	async function vacantPane(): Promise<LayoutEditorView> {
		const app = new App();
		return openView(app, document.body, LayoutEditorView, fakePlugin(app));
	}

	it('offers one sentence and a way to create one, and nothing else', async () => {
		// The first thing a new user sees, and the state the settings tab drew as
		// a row: one line in the top-left corner of an empty rectangle. Centred
		// here, with no tree and no panel — asserted as the absence of both,
		// because a grid drawn around a single sentence is what this replaced.
		const pane = await vacantPane();

		const vacant = pane.contentEl.querySelector('.sheetsmith-editor-vacant');
		expect(vacant?.textContent).toContain('No layouts yet.');
		// The row's own words. One gesture, so one name for it, and the CTA is
		// kept here because here it is the only thing on screen — where on the
		// row it is one control among four and takes no accent.
		const cta = vacant?.querySelector('button');
		expect(cta?.textContent).toBe('New layout');
		expect(cta?.classList.contains('mod-cta')).toBe(true);
		expect(pane.contentEl.querySelector('.sheetsmith-editor-panel')).toBeNull();
		expect(pane.contentEl.querySelector('.setting-item')).toBeNull();
	});

	it('offers the same modal, with a blank grid and a paste and no third source', async () => {
		/*
		 * **The cold-start gap this closes.** A reader with no layouts is the
		 * most likely person to be holding one somebody sent them, and until now
		 * they had to make a layout they did not want, or run a starter command,
		 * before the control that accepts theirs existed at all
		 * (`docs/features/starting-a-new-layout.md`).
		 *
		 * **An existing layout is absent here by construction rather than by
		 * agreement**: `hasLayouts` is false *because* this branch was reached.
		 */
		const pane = await vacantPane();
		const cta = pane.contentEl.querySelector(
			'.sheetsmith-editor-vacant button',
		) as HTMLButtonElement;
		cta.click();
		await tick();

		const modal = openModal();
		expect(modal.querySelector('.modal-title')?.textContent).toBe(
			'New layout',
		);
		const source = modal.querySelector('select') as HTMLSelectElement;
		expect(
			Array.from(source.options).map((option) => option.textContent),
		).toEqual(['A blank grid', 'Pasted JSON']);

		// Closed rather than left standing: a modal in `document.body` outlives
		// this case, and the next one to look for one would find this.
		pressModalButton('Cancel');
	});
});

describe('the panel says what it is configuring', () => {
	/*
	 * The one thing tying the two columns together when the tree has scrolled
	 * away. A form under its own row needed no title; a panel beside a tree does,
	 * and without it the identity of what is being edited lives in the contents
	 * of a text field.
	 */
	it('heads a component form with the component, not only the label field', async () => {
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);

		const panel = harness.container.querySelector(
			'.sheetsmith-editor-panel',
		) as HTMLElement;
		const heading = panel.querySelector('.setting-item-heading');
		expect(heading?.textContent).toBe('Defences');
		// Above the reference line and the fields, which is what makes it a title
		// rather than another row.
		expect(panel.querySelector('.sheetsmith-component-form')?.firstElementChild)
			.toBe(heading);
	});

	it('heads the layout\'s own settings too', async () => {
		harness = await open(furnished());
		const panel = harness.container.querySelector(
			'.sheetsmith-editor-panel',
		) as HTMLElement;
		expect(panel.querySelector('.setting-item-heading')?.textContent).toBe(
			'Layout',
		);
	});

	it('follows a rename, so the title is never the old name', async () => {
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-defences'), 'Saves');
		await settle(harness.pane);

		expect(
			harness.container
				.querySelector('.sheetsmith-editor-panel')
				?.querySelector('.setting-item-heading')?.textContent,
		).toBe('Saves');
	});
});

/*
 * `docs/features/preview-sample-values.md` §3: the row above the canvas that
 * fills it or empties it. Driven through the rendered control, like everything
 * else here, and asserted against the *file* as well as the canvas — the whole
 * claim of this row is that it changes what is drawn and nothing that is
 * stored.
 */
describe('the sample values row', () => {
	/** The value in the armour card's own input on the canvas, if it has one. */
	function drawnValue(): string {
		const cell = control(harness, 'preview-armour').parentElement;
		return (
			cell?.querySelector<HTMLInputElement>('.sheetsmith-card-input')?.value ?? ''
		);
	}

	beforeEach(async () => {
		harness = await open();
	});

	it('opens on, so a pane that has just opened shows a filled canvas', () => {
		// An empty canvas is the state that hides what a preview exists to
		// reveal, and a feature defaulted off is one most authors never see.
		expect(checkbox(harness, 'Sample values').checked).toBe(true);
		expect(drawnValue()).not.toBe('');
	});

	it('empties the canvas when it is turned off, and fills it again', () => {
		toggle(checkbox(harness, 'Sample values'), false);
		expect(drawnValue()).toBe('');
		toggle(checkbox(harness, 'Sample values'), true);
		expect(drawnValue()).not.toBe('');
	});

	it('writes nothing and pushes no undo step, however often it is toggled', async () => {
		/*
		 * **Measured across a real edit, not from an empty stack.** Asserting that
		 * `undo` answers false after two toggles says only that the stack is
		 * empty, which it was before them — it cannot tell a toggle that pushed
		 * nothing from one that pushed a step something else popped, and it says
		 * nothing at all about a toggle *consuming* a step. With one edit
		 * underneath, both directions are visible: one undo has to reach past the
		 * toggles to the edit, and then there has to be nothing left under it.
		 */
		const before = await harness.raw();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		const edited = await harness.raw();
		expect(edited).not.toBe(before);

		const wrote = writes(harness);
		toggle(checkbox(harness, 'Sample values'), false);
		toggle(checkbox(harness, 'Sample values'), true);
		await settle(harness.pane);
		expect(wrote()).toBe(0);
		expect(await harness.raw()).toBe(edited);

		// Straight past the toggles to the edit: a toggle that had pushed a step
		// would be undone here instead, leaving the edit in the file.
		expect(await undo(harness)).toBe(true);
		expect(await harness.raw()).toBe(before);
		// And nothing under it, so neither toggle pushed a step the edit hid.
		expect(harness.pane.undo()).toBe(false);
	});

	it('keeps the selection and the open form exactly as they were', async () => {
		// It redraws the canvas and nothing else, so the panel it sits beside is
		// not rebuilt at all — the fields keep their values and their focus.
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);

		toggle(checkbox(harness, 'Sample values'), false);

		expect(panelHeading(harness)).toBe('Armour class');
		expect(control<HTMLInputElement>(harness, 'cfg-armour-key').value).toBe('AC');
		expect(
			treeRow(harness, 'edit-armour').classList.contains(
				'sheetsmith-preview-editing',
			),
		).toBe(true);
	});

	it('carries a focus token, on the element the app gives focus to', () => {
		// On the container `addToggle` builds rather than on the input inside it,
		// which is both where every boolean in the pane carries one and the
		// element the app actually focuses.
		expect(has(harness, 'sample-values')).toBe(true);
		expect(
			control(harness, 'sample-values').querySelector('input[type="checkbox"]'),
		).toBe(checkbox(harness, 'Sample values'));
	});

	it('gets focus back when the pane is redrawn for some other reason', async () => {
		/*
		 * The behaviour, not the precondition. The sibling case at "gives a
		 * checkbox the token the redraw would need" can only assert the token,
		 * because no boolean on a component redraws the pane any more — this one
		 * has no such excuse: it sits beside a tree whose every row redraws, so an
		 * author standing on this control while anything else rebuilds the pane is
		 * an ordinary Tuesday, and a token that did not survive it would land them
		 * on the body.
		 */
		const row = control(harness, 'sample-values');
		row.focus();
		expect(document.activeElement).toBe(row);

		// A selection from the canvas, which rebuilds both regions without moving
		// focus — the canvas's own pointerdown suppresses it — so the toggle's own
		// element is gone by the time this resolves, and what comes back is a
		// fresh one carrying the same token. A tree row's press used to stand in
		// for this and no longer can: a press on a row puts focus on that row's
		// name, which is the point of pressing it.
		control(harness, 'preview-armour').click();
		await settle(harness.pane);

		expect(panelHeading(harness)).toBe('Armour class');
		expect(document.activeElement).toBe(control(harness, 'sample-values'));
		expect(document.activeElement).not.toBe(row);
	});
});

/*
 * `docs/features/editor-undo.md`: every mutation the pane makes is one step on
 * an undo stack, because `persist()` is the one place every one of them
 * already funnels through. What is driven below is every mutation kind the
 * feature's acceptance criteria name, plus the stack's own cross-cutting
 * rules — the depth cap has its own unit test beside `undo-stack.ts`, on
 * `docs/PATTERNS.md` §10: it is far cheaper to prove by pushing 101 strings
 * onto the module directly than by driving 101 edits through this pane.
 *
 * Undo is driven through `LayoutEditorView.undo`/`.redo` rather than through
 * the commands in `commands.ts`: those are a `checkCallback` gating an
 * `App.workspace.getActiveViewOfType` lookup and a `Notice`, the same shape
 * `open-as-sheet` and `open-as-markdown` already have with no test of their
 * own, and the pane's own methods are what they call.
 */

/** Undo, and let the write and the redraw it triggers settle. */
async function undo(harness: Harness): Promise<boolean> {
	const result = harness.pane.undo();
	await tick();
	return result;
}

/** Redo, and let the write and the redraw it triggers settle. */
async function redo(harness: Harness): Promise<boolean> {
	const result = harness.pane.redo();
	await tick();
	return result;
}

/** A button anywhere in the pane, found by its exact text. */
function button(harness: Harness, text: string): HTMLButtonElement {
	const found = Array.from(harness.container.querySelectorAll('button')).find(
		(el) => el.textContent === text,
	);
	if (!found) throw new Error(`no button "${text}"`);
	return found;
}

/** The panel's own heading, for asserting on what is selected. */
function panelHeading(harness: Harness): string | null | undefined {
	return harness.container
		.querySelector('.sheetsmith-editor-panel')
		?.querySelector('.setting-item-heading')?.textContent;
}

/** A Table with one computed column carrying a formula, and one row. */
function withComputedColumn(): Layout {
	return {
		name: 'Table sheet',
		columns: 12,
		components: [
			{
				id: 'skills',
				type: 'table',
				label: 'Skills',
				columns: [
					{
						key: 'total',
						name: 'Total',
						type: 'computed',
						formula: 'ability + 2',
					},
				],
				rows: [{ label: 'Acrobatics' }],
				position: { col: 1, row: 1, width: 6, height: 3 },
			},
		] as unknown as Layout['components'],
		triggers: [],
	};
}

describe('undo and redo', () => {
	describe('one step per mutation kind', () => {
		it('undoes a field commit', async () => {
			harness = await open();
			const before = await harness.raw();
			control(harness, 'edit-armour').click();
			await settle(harness.pane);
			type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a rename', async () => {
			harness = await open();
			const before = await harness.raw();
			control(harness, 'edit-armour').click();
			await settle(harness.pane);
			type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes adding a component', async () => {
			harness = await open();
			const before = await harness.raw();
			pick(harness, 'track:0');
			pressAdd(harness);
			await settle(harness.pane);
			expect((await harness.stored()).components).toHaveLength(3);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes removing a component whose children move to the sheet', async () => {
			harness = await open(nested());
			const before = await harness.raw();
			removeRow(harness, 'defences');
			await settle(harness.pane);
			expect((await harness.stored()).components.map((c) => c.id)).toEqual([
				'hit_points',
				'armour',
			]);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a drag to release', async () => {
			harness = await open(schematic());
			const before = await harness.raw();
			sheetGrid(harness);
			const cell = control(harness, 'preview-left');
			pressDown(cell, at(1, 1));
			dragTo(cell, 4, 3);
			release(cell);
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a resize to release', async () => {
			harness = await open(schematic());
			const before = await harness.raw();
			control(harness, 'edit-left').click();
			await settle(harness.pane);
			sheetGrid(harness);
			const cell = control(harness, 'preview-left');
			const handle = cell.querySelector('.sheetsmith-preview-resize');
			if (!handle) throw new Error('no resize handle');
			pressDown(handle, { bubbles: true, ...at(2, 1) });
			dragTo(cell, 4, 2);
			release(cell);
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a whole debounced run of nudges as one step', async () => {
			harness = await open(schematic());
			const before = await harness.raw();
			pressKey(harness, 'right', 'ArrowRight');
			pressKey(harness, 'right', 'ArrowRight');
			pressKey(harness, 'right', 'ArrowDown');
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a list entry being added', async () => {
			harness = await open(twoLists());
			control(harness, 'edit-abilities').click();
			await settle(harness.pane);
			const before = await harness.raw();
			button(harness, 'Add entry').click();
			await settle(harness.pane);
			expect(
				(await harness.stored()).components.find((c) => c.id === 'abilities'),
			).toMatchObject({
				entries: [{ key: 'STR', name: 'Strength' }, { key: 'New entry' }],
			});

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a list entry being removed, which confirms nothing today', async () => {
			harness = await open(twoLists());
			control(harness, 'edit-abilities').click();
			await settle(harness.pane);
			const before = await harness.raw();

			control(harness, 'attr-abilities-STR-remove').click();
			await settle(harness.pane);
			expect(document.body.querySelector('.modal-container')).toBeNull();
			expect(
				(await harness.stored()).components.find((c) => c.id === 'abilities'),
			).toMatchObject({ entries: [] });

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a list reorder', async () => {
			harness = await open(twoLists());
			control(harness, 'edit-abilities').click();
			await settle(harness.pane);
			// A second entry to reorder the first one against.
			button(harness, 'Add entry').click();
			await settle(harness.pane);
			const before = await harness.raw();

			control(harness, 'attr-abilities-STR-handle').dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown' }),
			);
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a reset binding being added', async () => {
			harness = await open();
			control(harness, 'edit-hit_points').click();
			await settle(harness.pane);
			const before = await harness.raw();
			button(harness, 'Add reset').click();
			await settle(harness.pane);
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a reset binding being removed, which confirms nothing today', async () => {
			harness = await open();
			control(harness, 'edit-hit_points').click();
			await settle(harness.pane);
			button(harness, 'Add reset').click();
			await settle(harness.pane);
			const before = await harness.raw();

			const remove = harness.container.querySelector(
				'[aria-label="Remove this reset"]',
			);
			if (!remove) throw new Error('no remove-reset button');
			(remove as HTMLButtonElement).click();
			await settle(harness.pane);
			expect(document.body.querySelector('.modal-container')).toBeNull();
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes a column-type change away from computed, which confirms nothing today', async () => {
			harness = await open(withComputedColumn());
			control(harness, 'edit-skills').click();
			await settle(harness.pane);
			const before = await harness.raw();

			choose(
				control<HTMLSelectElement>(harness, 'skills-col-total-type'),
				'number',
			);
			await settle(harness.pane);
			expect(document.body.querySelector('.modal-container')).toBeNull();
			expect(await harness.raw()).not.toBe(before);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});
	});

	describe('redo', () => {
		it('restores what undo took back, until the next author edit clears it', async () => {
			harness = await open();
			const original = await harness.raw();
			control(harness, 'edit-armour').click();
			await settle(harness.pane);
			type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
			await settle(harness.pane);
			const edited = await harness.raw();

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(original);
			expect(await redo(harness)).toBe(true);
			expect(await harness.raw()).toBe(edited);

			// Undo again so there is something to lose, then make a fresh edit —
			// which is an author-triggered `persist()` at its default, and that
			// clears whatever redo could have replayed.
			expect(await undo(harness)).toBe(true);
			type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'CA');
			await settle(harness.pane);
			expect(await redo(harness)).toBe(false);
		});

		it('reports nothing to redo where nothing has been undone', async () => {
			harness = await open();
			expect(await redo(harness)).toBe(false);
		});
	});

	describe('scoped per open layout', () => {
		it('clears both stacks when the pane switches to a different layout', async () => {
			harness = await open();
			control(harness, 'edit-armour').click();
			await settle(harness.pane);
			type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
			await settle(harness.pane);

			await harness.app.vault.create(
				`${LAYOUT_FOLDER}/Second sheet.sheetsmith`,
				serialiseLayout({
					name: 'Second sheet',
					columns: 12,
					components: [],
					triggers: [],
				}),
			);
			await harness.redraw();

			choose(
				control<HTMLSelectElement>(harness, 'layout-picker'),
				`${LAYOUT_FOLDER}/Second sheet.sheetsmith`,
			);
			await settle(harness.pane);

			expect(await undo(harness)).toBe(false);
		});

		it('does not share a stack between two panes open on different layouts', async () => {
			const a = await open(fixture());
			const b = await open({
				name: 'Other sheet',
				columns: 12,
				components: [],
				triggers: [],
			});

			control(a, 'edit-armour').click();
			await settle(a.pane);
			type(control<HTMLInputElement>(a, 'cfg-armour-key'), 'AC');
			await settle(a.pane);

			expect(await undo(b)).toBe(false);
			expect(await undo(a)).toBe(true);
		});
	});

	describe('the stale-selection fallback', () => {
		it('falls back to the Layout row when undo removes what was selected', async () => {
			harness = await open();
			pick(harness, 'track:0');
			pressAdd(harness);
			await settle(harness.pane);
			// Opened for editing, per "appends the chosen type and opens it".
			expect(panelHeading(harness)).not.toBe('Layout');

			expect(await undo(harness)).toBe(true);
			expect(panelHeading(harness)).toBe('Layout');
		});

		it('falls back to the Layout row when redo removes what was selected', async () => {
			harness = await open();
			control(harness, 'edit-armour').click();
			await settle(harness.pane);
			removeRow(harness, 'armour');
			await settle(harness.pane);
			// Already the ordinary fallback `render` has always had: the
			// removal itself dropped the selection it held.
			expect(panelHeading(harness)).toBe('Layout');

			expect(await undo(harness)).toBe(true);
			// Armour is back. Select it again before replaying the removal,
			// so redo is the thing that makes the selection stale rather than
			// it having been stale all along.
			control(harness, 'edit-armour').click();
			await settle(harness.pane);
			expect(panelHeading(harness)).toBe('Armour class');

			expect(await redo(harness)).toBe(true);
			expect(panelHeading(harness)).toBe('Layout');
		});
	});
});

/*
 * The **Layout file** row's controls beyond the dropdown
 * (`docs/features/layout-import-export.md`,
 * `docs/features/starting-a-new-layout.md`).
 *
 * Both live here rather than beside their own modules because both are the
 * *pane's* half: the row's controls, the dropdown's options, and what the pane
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

/*
 * Formula name suggestions (`docs/features/formula-name-suggestions.md`).
 *
 * The wiring half: which inputs are bound, what each one offers, and that a
 * rebuild of the pane takes any open list down with it. What a candidate list
 * holds is `formula/vocabulary.test.ts`, and how one input behaves is
 * `formula-suggest.test.ts`; here the claim is that every field the design names
 * is actually one of them.
 */
describe('formula fields suggest the names the layout publishes', () => {
	/** A layout holding one of every field the design's §1 table names. */
	function suggestFixture(): Layout {
		return {
			name: 'Suggest sheet',
			columns: 12,
			components: [
				{
					id: 'armour_class',
					type: 'card',
					label: 'Armour class',
					derived: '10',
					effective: 'value',
					position: { col: 1, row: 1, width: 2, height: 1 },
				} as unknown as ComponentConfig,
				{
					id: 'abilities',
					type: 'card-set',
					label: 'Abilities',
					derived: 'mod(value)',
					effective: 'value',
					entries: [{ key: 'STR', name: 'Strength' }],
					position: { col: 3, row: 1, width: 4, height: 1 },
				} as unknown as ComponentConfig,
				{
					id: 'hit_points',
					type: 'pool',
					label: 'Hit points',
					max: 'level',
					reset: [{ trigger: 'Long rest', action: 'formula', to: 'level' }],
					position: { col: 7, row: 1, width: 3, height: 1 },
				} as unknown as ComponentConfig,
				{
					id: 'identity',
					type: 'passport',
					label: 'Identity',
					nameKey: '',
					fields: [{ key: 'Race', name: 'Ancestry' }],
					position: { col: 1, row: 5, width: 6, height: 2 },
					// `nameKey` commits through `config-panel.ts`'s own text-field
					// branch and declares `whenBlank: 'name'`, so naming it for the
					// first time is a migration off that default — Card's case on a
					// second component. `fields` reaches the shared entries editor.
				} as ComponentConfig,
				{
					id: 'gear',
					type: 'table',
					label: 'Gear',
					rowHeader: 'Item',
					columns: [{ key: 'Qty', type: 'number' }],
					position: { col: 7, row: 5, width: 6, height: 2 },
					// Out of scope end to end: a column key is a markdown-table
					// header, not a fence entry, so renaming it must migrate
					// nothing and say nothing.
				} as ComponentConfig,
				{
					id: 'slots',
					type: 'track',
					label: 'Spell slots',
					rows: [{ key: 'L1', name: '1st', count: '2' }],
					position: { col: 10, row: 1, width: 3, height: 1 },
				} as unknown as ComponentConfig,
				{
					id: 'inventory',
					type: 'table',
					label: 'Inventory',
					rows: [{ label: 'Sword', values: { ability: 'abilities.STR' } }],
					columns: [
						{ key: 'Weight', type: 'number', total: true },
						{ key: 'Total', type: 'computed', formula: 'Weight' },
					],
					position: { col: 1, row: 2, width: 6, height: 2 },
				} as unknown as ComponentConfig,
				{
					id: 'traits',
					type: 'record-set',
					label: 'Traits',
					fields: [
						{ key: 'uses', type: 'number' },
						{ key: 'left', type: 'computed', formula: 'uses' },
					],
					position: { col: 7, row: 2, width: 6, height: 2 },
				} as unknown as ComponentConfig,
			],
			functions: ['mod(score) = floor((score - 10) / 2)'],
			triggers: ['Long rest'],
		};
	}

	/** Open a component's form and let the panel draw. */
	async function form(harness: Harness, id: string): Promise<void> {
		control(harness, `edit-${id}`).click();
		await tick();
	}

	/**
	 * Type into a field, without committing.
	 *
	 * Focused first, because the app gates every query on
	 * `textInputEl.isActiveElement()`: an unfocused field is a path Obsidian
	 * refuses outright, so a case driving one would prove nothing about the pane.
	 */
	function typing(input: HTMLInputElement, text: string): void {
		input.focus();
		input.value = text;
		input.setSelectionRange(text.length, text.length);
		input.dispatchEvent(new Event('input'));
	}

	function popupNames(): string[] {
		return Array.from(
			document.body.querySelectorAll('.suggestion-container .suggestion-item code'),
		).map((code) => code.textContent ?? '');
	}

	it('binds every formula field the design names', async () => {
		const harness = await open(suggestFixture());
		// Component id, then the token of each of its formula fields.
		const bound: [string, string[]][] = [
			['armour_class', ['cfg-armour_class-derived', 'cfg-armour_class-effective']],
			['abilities', ['cfg-abilities-derived', 'cfg-abilities-effective']],
			// The pool's own maximum, and the expression its reset restores.
			['hit_points', ['cfg-hit_points-max', 'reset-to-hit_points-0']],
			// The track's own **Segments** field on the panel, and a row's own
			// count in the entry list — two of the six §1 names, and the only
			// component that draws one of each.
			['slots', ['cfg-slots-count', 'attr-slots-L1-count']],
			// A computed column's formula, and a row value cell beside it.
			['inventory', ['inventory-col-Total-formula', 'inventory-row-0-ability']],
			// A record field is a `columns`-kind list, so it is the same cell.
			['traits', ['traits-col-left-formula']],
		];
		for (const [id, tokens] of bound) {
			await form(harness, id);
			for (const token of tokens) {
				expect(
					control(harness, token).getAttribute('aria-autocomplete'),
					token,
				).toBe('list');
			}
		}
	});

	it('leaves a field that holds no expression unbound', async () => {
		const harness = await open(suggestFixture());
		await form(harness, 'armour_class');
		// The label is a name in the note, not a name in the language.
		expect(
			control(harness, 'label-armour_class').getAttribute('aria-autocomplete'),
		).toBeNull();
	});

	it('offers a table its own column keys on a computed cell', async () => {
		const harness = await open(suggestFixture());
		await form(harness, 'inventory');
		typing(control<HTMLInputElement>(harness, 'inventory-col-Total-formula'), 'W');
		expect(popupNames()[0]).toBe('Weight');
	});

	it('withholds the computed column whose value the cell is', async () => {
		// A self-reference: `table.ts`'s `rowScope` resolves a computed column
		// against the stored layer alone, so completing `Total` here would write
		// a formula that cannot resolve.
		const harness = await open(suggestFixture());
		await form(harness, 'inventory');
		typing(control<HTMLInputElement>(harness, 'inventory-col-Total-formula'), 'T');
		expect(popupNames()).not.toContain('Total');
	});

	it('offers no other component column keys on a field of the sheet', async () => {
		const harness = await open(suggestFixture());
		await form(harness, 'hit_points');
		typing(control<HTMLInputElement>(harness, 'cfg-hit_points-max'), 'W');
		expect(popupNames()).not.toContain('Weight');
		// Not a vacuous pass: a popup that never opened contains nothing at all,
		// which is the same assertion for the wrong reason.
		typing(control<HTMLInputElement>(harness, 'cfg-hit_points-max'), 'abil');
		expect(popupNames()).toEqual(['abilities']);
	});

	it('takes an open list down with the render that replaces its field', async () => {
		// An input removed while its popup is open fires no `blur`, so a redraw
		// driven from the keyboard would otherwise orphan the list.
		const harness = await open(suggestFixture());
		await form(harness, 'armour_class');
		typing(control<HTMLInputElement>(harness, 'cfg-armour_class-derived'), 'abil');
		expect(popupNames()).toEqual(['abilities']);
		await harness.redraw();
		expect(document.body.querySelector('.suggestion-container')).toBeNull();
	});
});

describe('the panel says what a component publishes', () => {
	it('lists every name as a chip rather than the bare id', async () => {
		const harness = await open({
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'abilities',
					type: 'card-set',
					label: 'Abilities',
					entries: [
						{ key: 'STR', name: 'Strength' },
						{ key: 'DEX', name: 'Dexterity' },
					],
					position: { col: 1, row: 1, width: 4, height: 1 },
				} as unknown as ComponentConfig,
			],
			functions: [],
			triggers: [],
		});
		control(harness, 'edit-abilities').click();
		await tick();
		const chips = Array.from(
			harness.container.querySelectorAll('.sheetsmith-published-name code'),
		).map((code) => code.textContent);
		expect(chips).toEqual([
			'abilities.STR',
			'.value',
			'mod.',
			'abilities.DEX',
			'.value',
			'mod.',
		]);
	});

	it('teaches no name as a placeholder pattern anywhere in the pane', async () => {
		/*
		 * The copy budget this feature relieves (`SPEC` §13): the panel used to
		 * spell the grammar as `"<component id>.<column key>"` under the list
		 * where a key is typed, leaving the reader to substitute two placeholders
		 * to get a string they could have copied. The inventory shows the real
		 * names, so the pattern goes.
		 */
		const harness = await open({
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'inventory',
					type: 'table',
					label: 'Inventory',
					rows: [{ label: 'Sword', key: 'sword' }],
					columns: [
						{ key: 'Weight', type: 'number', total: true },
						{ key: 'Worn', type: 'toggle', publish: true },
					],
					position: { col: 1, row: 1, width: 6, height: 2 },
				} as unknown as ComponentConfig,
			],
			functions: [],
			triggers: [],
		});
		control(harness, 'edit-inventory').click();
		await tick();
		const text = harness.container.textContent ?? '';
		expect(text).not.toContain('"<component id>.');
		// The pattern in *either* spelling now, since the two clauses the guard
		// above cannot see were the last places it appeared as UI copy.
		expect(text).not.toContain('<component id>');
		expect(text).toContain(
			'A total is a name formulas read, so a totalled column\'s key is letters, digits and underscores, where a column without a total may be headed anything.',
		);
		expect(text).toContain(
			'A published column gives every row below a name of its own, so a formula elsewhere on the sheet can read that row.',
		);
		/*
		 * The third and fourth trims, and the two the `not.toContain` guard above
		 * cannot catch: each removed a `sum(<component id>, <expression>)` clause,
		 * which carries neither the leading quote nor the trailing dot that guard
		 * matches on. Only reading the sentences proves they went.
		 */
		expect(text).toContain(
			"A column's total sums what the note stores; a formula elsewhere can sum any expression over the rows instead.",
		);
		expect(text).toContain(
			'total a column, or aggregate over the rows instead.',
		);
	});
});

/*
 * The vault-wide rename migration (`docs/features/component-rename-
 * migration.md`), reached the way it ships: a Label field's commit and a
 * Card set entry's commit, both through this pane's own controls, both
 * landing on a real character note in the same `App`.
 *
 * `parse/character.test.ts`, `parse/fenced.test.ts` and
 * `component-rename-migration.test.ts` already hold the not-present,
 * collision and byte-identical cases for the two `parse/` primitives and the
 * vault scan around them. What is worth asserting here is what only this
 * seam owns: that the editor's own commit — a blur on a rendered field —
 * actually reaches `persist()` with a rename intent and the migration runs
 * after the layout file's own write, on a note this test can read back.
 */
describe('the component rename migration', () => {
	/** `fixture()` plus a Card set whose entries address a fence key. */
	function renameFixture(): Layout {
		return {
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'armour',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
				{
					id: 'hit_points',
					type: 'pool',
					label: 'Hit points',
					position: { col: 3, row: 1, width: 4, height: 1 },
				},
				{
					id: 'abilities',
					type: 'card-set',
					label: 'Abilities',
					entries: [{ key: 'DEX', name: 'Dexterity' }],
					position: { col: 1, row: 2, width: 12, height: 1 },
					// `entries` is a Card set's own config, not a member of the
					// shared `ComponentConfig` every fixture in this file is typed
					// against — the same assertion `furnished()` writes for the
					// identical literal.
				} as ComponentConfig,
				{
					id: 'spells',
					type: 'record-set',
					label: 'Spells',
					recordName: 'Spell',
					fields: [{ key: 'Level', type: 'number' }],
					position: { col: 1, row: 3, width: 6, height: 2 },
					// A Record set's `fields` is the shared *columns* editor, so its
					// key commits through a different function from the entries
					// editor above — and it is the one component whose section holds
					// one fence per record, which is the only `perRecord` intent
					// this feature builds.
				} as ComponentConfig,
				{
					id: 'identity',
					type: 'passport',
					label: 'Identity',
					nameKey: '',
					fields: [{ key: 'Race', name: 'Ancestry' }],
					position: { col: 1, row: 5, width: 6, height: 2 },
					// `nameKey` commits through `config-panel.ts`'s own text-field
					// branch and declares `whenBlank: 'name'`, so naming it for the
					// first time is a migration off that default — Card's case on a
					// second component. `fields` reaches the shared entries editor.
				} as ComponentConfig,
				{
					id: 'gear',
					type: 'table',
					label: 'Gear',
					rowHeader: 'Item',
					columns: [{ key: 'Qty', type: 'number' }],
					position: { col: 7, row: 5, width: 6, height: 2 },
					// Out of scope end to end: a column key is a markdown-table
					// header, not a fence entry, so renaming it must migrate
					// nothing and say nothing.
				} as ComponentConfig,
				{
					id: 'slots',
					type: 'track',
					label: 'Spell slots',
					rows: [{ key: 'L1', name: 'First' }],
					position: { col: 7, row: 3, width: 6, height: 2 },
					// Track's `rows` reaches the shared entries editor under its own
					// `track-rows` kind, which is a third route into the same
					// migration and the one with no commit-path case of its own.
				} as ComponentConfig,
			],
			functions: ['mod(score) = floor((score - 10) / 2)'],
			triggers: ['Long rest'],
		};
	}

	const CHARACTER =
		'---\nsheet-layout: Test sheet\n---\n\n## Armour class\n```sheet\nvalue: 14\n```\n\n## Abilities\n```sheet\nDEX: 16\n```\n\n## Spells\n\n### Fireball\n```sheet\nLevel: 3\n```\n\n### Shield\n```sheet\nLevel: 1\n```\n\n## Spell slots\n```sheet\nL1: 2\n```\n\n## Identity\n```sheet\nname: Aramil\nRace: Elf\n```\n\n## Gear\n\n| Item | Qty |\n|---|---|\n| Rope | 1 |\n';

	beforeEach(async () => {
		harness = await open(renameFixture());
		Notice.messages = [];
	});

	it('migrates a renamed label into every character note for this layout, and reports it', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);
		// A note for a different layout, correctly left alone.
		await harness.app.vault.create(
			'Thora.md',
			'---\nsheet-layout: Other sheet\n---\n\n## Armour class\n```sheet\nvalue: 9\n```\n',
		);

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.replace('## Armour class', '## Defence'),
		);
		expect(
			await harness.app.vault.read(harness.app.vault.getFileByPath('Thora.md')!),
		).toBe('---\nsheet-layout: Other sheet\n---\n\n## Armour class\n```sheet\nvalue: 9\n```\n');
		expect(Notice.messages).toEqual([
			'Renamed "Armour class" to "Defence" in 1 character note.',
		]);
	});

	it('migrates a renamed entry key inside a Card set’s own fence, and reports it', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-abilities').click();
		await settle(harness.pane);
		type(
			control<HTMLInputElement>(harness, 'attr-abilities-0-key'),
			'Dexterity',
		);
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.replace('DEX: 16', 'Dexterity: 16'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "DEX" to "Dexterity" in 1 character note.',
		]);
	});

	/*
	 * The two remaining routes into the migration, each driven through the
	 * control that ships rather than through the module.
	 *
	 * `component-rename-migration.test.ts` covers both shapes at the module
	 * level, so what these add is the half only this seam owns: that the
	 * *editor's* own commit reaches `persist()` with the right intent from these
	 * two fields too. They were the last two of the feature's key surfaces with
	 * no case at this level, and the spec review counted that as a criterion met
	 * in a weaker form than it is written.
	 */
	it('migrates a renamed Record set field key in every record of every note', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-spells').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'spells-col-0-key'), 'Spell level');
		await settle(harness.pane);

		// Both records, which is what makes this component's intent its own:
		// one section holding one fence per `### ` record.
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.split('Level: 3').join('Spell level: 3').split('Level: 1').join('Spell level: 1'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "Level" to "Spell level" in 1 character note.',
		]);
	});

	it('migrates a renamed Track row key, which reaches the same migration', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-slots').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'attr-slots-0-key'), 'Level 1');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.replace('L1: 2', 'Level 1: 2'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "L1" to "Level 1" in 1 character note.',
		]);
	});

	/*
	 * The last two key surfaces with no case at this level, both on Passport, and
	 * both pre-specified by the spec review rather than chosen here.
	 */
	it('migrates a Passport name key named for the first time, off its default', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-identity').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-identity-nameKey'), 'Character');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.replace('name: Aramil', 'Character: Aramil'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "name" to "Character" in 1 character note.',
		]);
	});

	it('migrates a renamed Passport field key through the shared entries editor', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-identity').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'attr-identity-0-key'), 'Ancestry');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.replace('Race: Elf', 'Ancestry: Elf'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "Race" to "Ancestry" in 1 character note.',
		]);
	});

	it('migrates nothing when a Table column’s key is renamed', async () => {
		// Criterion 6 asked for this directly rather than by absence of a hook: a
		// column key is a markdown-table header, so the fence primitive has
		// nothing to operate on and the whole feature must pass it over.
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-gear').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'gear-col-0-key'), 'Count');
		await settle(harness.pane);

		// Vacuity guard: the rename did land in the layout, so a green below is
		// not a commit that never happened.
		expect(await harness.raw()).toContain('Count');
		expect(Notice.messages).toEqual([]);
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER,
		);
	});

	it('touches no note, and says nothing, when the layout write rejects', async () => {
		/*
		 * Criterion 9's own words: "a layout write that fails leaves every
		 * character note untouched and triggers no migration attempt". A write
		 * that *rejects* rather than one that hangs, which is the difference
		 * between proving the guard and proving only that nothing happened yet.
		 */
		await harness.app.vault.create('Aramil.md', CHARACTER);
		const scans = vi.spyOn(harness.app.vault, 'process');
		vi.spyOn(harness.app.vault, 'modify').mockRejectedValue(
			new Error('disk full'),
		);

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		// No candidate was even opened, and the author is told the layout did not
		// save rather than being told nothing at all — which is what writing this
		// case found: the write was unwrapped, so the rejection reached no one
		// and surfaced as an unhandled rejection in the run.
		expect(scans).not.toHaveBeenCalled();
		expect(Notice.messages).toEqual([
			'Sheetsmith could not save this layout: disk full',
		]);
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER,
		);
	});

	it('fires no Notice, and touches no note, where nothing matches', async () => {
		await harness.app.vault.create(
			'Aramil.md',
			'---\nsheet-layout: Other sheet\n---\n\n## Armour class\n```sheet\nvalue: 9\n```\n',
		);
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		expect(Notice.messages).toEqual([]);
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			'---\nsheet-layout: Other sheet\n---\n\n## Armour class\n```sheet\nvalue: 9\n```\n',
		);
	});

	/*
	 * A Card that never set a key stores under the component's own default,
	 * `value`, so naming the key for the first time is a rename off that
	 * default and not the arrival of a name from nowhere. The same in reverse:
	 * clearing the field puts the note back on `value`.
	 *
	 * `renameFixture()`'s `armour` card declares no `key`, and `CHARACTER`
	 * holds `value: 14` under it, which is the state every character on a
	 * freshly drafted layout is in.
	 */
	it('migrates off a key’s own default when the field is named for the first time', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER.replace('value: 14', 'AC: 14'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "value" to "AC" in 1 character note.',
		]);
	});

	it('migrates back onto the default when the key field is cleared', async () => {
		await harness.app.vault.create(
			'Aramil.md',
			CHARACTER.replace('value: 14', 'AC: 14'),
		);
		// The layout has to be holding the explicit key for clearing it to be a
		// rename, so this commits one and then clears it.
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		Notice.messages = [];

		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), '');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER,
		);
		expect(Notice.messages).toEqual([
			'Renamed "AC" to "value" in 1 character note.',
		]);
	});

	/*
	 * A key holding a colon cannot be stored: the fence splits a line at the
	 * first one, so `Armor: class: 14` reads back as `Armor` holding
	 * `class: 14` and nothing can ever find `Armor: class` again. Before the
	 * migration existed that was a config error on one component with every
	 * note untouched; with it, a committed key is written into every character
	 * note, so the commit is where it has to be refused.
	 */
	it('refuses a colon in a Card’s key, writing no note and no layout', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		const input = control<HTMLInputElement>(harness, 'cfg-armour-key');
		type(input, 'Armor: class');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER,
		);
		expect(Notice.messages).toEqual([]);
		expect(await harness.raw()).not.toContain('Armor: class');
		expect(
			input.parentElement?.querySelector('.sheetsmith-field-error')
				?.textContent,
		).toBe(
			'A key cannot contain a colon or a line break, because the sheet block separates key from value with a colon, so this one was left empty.',
		);
	});

	it('refuses a colon in a Card set entry’s key the same way', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);
		const input = control<HTMLInputElement>(harness, 'attr-abilities-0-key');
		type(input, 'DEX: mod');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER,
		);
		expect(Notice.messages).toEqual([]);
		expect(await harness.raw()).not.toContain('DEX: mod');
	});

	/*
	 * The owner's own sequence, which shipped broken: a character note living
	 * beside the folder new characters are written to.
	 *
	 * `characterFolder` is a *creation destination* — "New characters are
	 * written here" — and the migration used to narrow its vault scan by it.
	 * On a vault whose characters sit in `Characters/` while the setting names
	 * `Characters/new`, every one of them was invisible: the rename reported
	 * nothing, wrote nothing, and the note then rendered empty under a heading
	 * the layout no longer named. Driven through the pane rather than the
	 * module, because the editor's call site is what passed the folder.
	 */
	it('migrates a note beside the folder new characters are written to', async () => {
		harness.plugin.settings.characterFolder = 'Characters/new';
		await harness.app.vault.createFolder('Characters');
		await harness.app.vault.create('Characters/Aramil.md', CHARACTER);

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Armor Classs');
		await settle(harness.pane);

		expect(
			await harness.app.vault.read(
				harness.app.vault.getFileByPath('Characters/Aramil.md')!,
			),
		).toBe(CHARACTER.replace('## Armour class', '## Armor Classs'));
		expect(Notice.messages).toEqual([
			'Renamed "Armour class" to "Armor Classs" in 1 character note.',
		]);
	});

	it('writes the layout before it touches a single character note', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);
		const order: string[] = [];
		vi.spyOn(harness.app.vault, 'modify').mockImplementation(() => {
			order.push('layout');
			return Promise.resolve();
		});
		const process = harness.app.vault.process.bind(harness.app.vault);
		vi.spyOn(harness.app.vault, 'process').mockImplementation((file, fn) => {
			order.push('note');
			return process(file, fn);
		});

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		// The first two writes, in order: the layout file, then the note. The
		// redraw the commit triggers persists the layout again afterwards,
		// carrying no rename of its own, which is why this reads the head of
		// the sequence rather than the whole of it.
		expect(order.slice(0, 2)).toEqual(['layout', 'note']);
	});

	it('touches no note while the layout write has not resolved', async () => {
		await harness.app.vault.create('Aramil.md', CHARACTER);
		// A layout write that never resolves stands in for one that fails: both
		// leave the `await` in `persist` unfinished, which is the whole of what
		// keeps the migration from running. Its own `modify` is bypassed, so
		// the layout file below is deliberately still the old spelling too.
		vi.spyOn(harness.app.vault, 'modify').mockImplementation(
			() => new Promise<void>(() => undefined),
		);
		const spy = vi.spyOn(harness.app.vault, 'process');

		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		expect(spy).not.toHaveBeenCalled();
		expect(Notice.messages).toEqual([]);
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			CHARACTER,
		);
	});

	/*
	 * Roster's three `key`-shaped fields, one in scope and two out. Its
	 * `stats[].key` names a fence entry and migrates; `columns[].key` is a
	 * markdown-table header and `rows[].key` is a formula-facing publish name,
	 * and neither addresses anything a character note stores under that name.
	 *
	 * The note below baits both. Its fence holds entries spelled exactly like
	 * the column key and exactly like the row's publish key — which is not how
	 * a Roster stores either — so a careless wiring pass reaching those two
	 * fields, both also called `key` and both on the same component as a field
	 * that does migrate, would rename one of those entries and fire a Notice.
	 * That is what the feature doc asks be verified directly rather than
	 * inferred from the absence of a hook.
	 */
	function rosterFixture(): Layout {
		return {
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'skills',
					type: 'roster',
					label: 'Skills',
					rowHeader: 'Skill',
					stats: [{ key: 'STR', name: 'Strength' }],
					rows: [{ label: 'Athletics', stat: 'STR', key: 'athletics' }],
					columns: [
						{
							key: 'Training',
							type: 'computed',
							formula: 'stat',
							publish: true,
						},
					],
					position: { col: 1, row: 1, width: 12, height: 2 },
				} as unknown as ComponentConfig,
			],
			functions: [],
			triggers: [],
		};
	}

	const ROSTER_CHARACTER = [
		'---',
		'sheet-layout: Test sheet',
		'---',
		'',
		'## Skills',
		'```sheet',
		'STR: 16',
		'Training: 1',
		'athletics: 2',
		'```',
		'',
		'| Skill | Training |',
		'|---|---|',
		'| Athletics | 1 |',
		'',
	].join('\n');

	it('migrates a Roster stat’s key, which is the one of its three that a note stores', async () => {
		harness = await open(rosterFixture());
		Notice.messages = [];
		await harness.app.vault.create('Aramil.md', ROSTER_CHARACTER);

		control(harness, 'edit-skills').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'attr-skills-0-key'), 'Strength');
		await settle(harness.pane);

		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			ROSTER_CHARACTER.replace('STR: 16', 'Strength: 16'),
		);
		expect(Notice.messages).toEqual([
			'Renamed "STR" to "Strength" in 1 character note.',
		]);
	});

	it('migrates nothing when a Roster column’s key is renamed', async () => {
		harness = await open(rosterFixture());
		Notice.messages = [];
		await harness.app.vault.create('Aramil.md', ROSTER_CHARACTER);

		control(harness, 'edit-skills').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'skills-col-0-key'), 'Practice');
		await settle(harness.pane);

		// Vacuity guard: the rename itself did land in the layout, so this is
		// not passing because the commit never happened.
		expect(await harness.raw()).toContain('Practice');
		expect(Notice.messages).toEqual([]);
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			ROSTER_CHARACTER,
		);
	});

	it('migrates nothing when a Roster row’s publish key is renamed', async () => {
		harness = await open(rosterFixture());
		Notice.messages = [];
		await harness.app.vault.create('Aramil.md', ROSTER_CHARACTER);

		control(harness, 'edit-skills').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'skills-row-0-key'), 'acrobatics');
		await settle(harness.pane);

		expect(await harness.raw()).toContain('acrobatics');
		expect(Notice.messages).toEqual([]);
		expect(await harness.app.vault.read(harness.app.vault.getFileByPath('Aramil.md')!)).toBe(
			ROSTER_CHARACTER,
		);
	});
});

/*
 * The Layout panel's promoted fields (SPEC §9), at the seam only the pane has.
 *
 * **What is here is what needs the pane.** The field's own cases — the picker's
 * options, the two error surfaces, the empty state, the count, the confirmation
 * and the two write rules — are `promoted-fields-field.test.ts`'s, under
 * `docs/PATTERNS.md` §10's rule about a module with its own entry point and its
 * own reportable output. What stays is that the panel draws the field at all,
 * that a *real* layout's published set reaches the picker, and that an edit
 * reaches the file on disk.
 */
describe('a layout with promoted fields', () => {
	let harness: Harness;

	/**
	 * An armour class and a pool, with whatever the case lists.
	 *
	 * **`promoting` beside `modifying` above**, which is what keeps the
	 * inflection unambiguous in this file: that one builds a layout with modifier
	 * definitions, this one a layout with promoted fields, and the two senses of
	 * the word have a helper each rather than sharing a name. The spec's rule
	 * forbids the bare `promote`, `promoted`, `promotion` and `promoteFlow`;
	 * neither of these is one.
	 */
	function promoting(promotedFields?: readonly unknown[]): Layout {
		return {
			name: 'Promoting sheet',
			columns: 12,
			components: [
				{
					id: 'armour_class',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
				} as ComponentConfig,
				{
					id: 'hp',
					type: 'pool',
					label: 'Hit points',
					position: { col: 3, row: 1, width: 2, height: 1 },
					max: '10',
				} as unknown as ComponentConfig,
			],
			// Absent rather than empty where a case promotes nothing, which is
			// what a layout that never wanted the key actually holds — and what
			// the sheet's own pass is gated on.
			...(promotedFields ? { promotedFields } : {}),
		} as unknown as Layout;
	}

	async function openLayoutPanel(layout: Layout) {
		harness = await open(layout);
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
	}

	const said = (): string =>
		harness.container.querySelector('.sheetsmith-editor-panel')?.textContent ??
		'';

	it('draws the list in the Layout panel, after the modifiers', async () => {
		// Last because it reads *from* everything above it: a promoted value may
		// be a formula calling the library and a number a modifier changed.
		await openLayoutPanel(promoting([{ name: 'armour_class', property: 'ac' }]));
		expect(said()).toContain('Promoted fields');
		expect(said().indexOf('Modifiers')).toBeLessThan(
			said().indexOf('Promoted fields'),
		);
		expect(has(harness, 'promoted-field-0-value')).toBe(true);
	});

	it('offers a real layout’s published names to the Value picker', async () => {
		/*
		 * Through the same assembly the sheet's own write reads, which is what
		 * stops the picker offering a name no render could resolve — and what
		 * `promotableNames` exists for: every published name plus the suffix
		 * forms each one answers to.
		 */
		await openLayoutPanel(promoting([{ name: 'armour_class', property: 'ac' }]));
		const picker = control<HTMLSelectElement>(harness, 'promoted-field-0-value');
		expect(Array.from(picker.options).map((one) => one.value)).toEqual([
			'',
			'armour_class',
			'armour_class.value',
			'hp',
			'hp.value',
			'hp.max',
			'hp.max.value',
		]);
		expect(picker.value).toBe('armour_class');
	});

	it('writes a chosen value and a typed property to the file', async () => {
		await openLayoutPanel(promoting([{}]));
		choose(control<HTMLSelectElement>(harness, 'promoted-field-0-value'), 'hp.max');
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'promoted-field-0-property'), 'hp_max');
		await settle(harness.pane);
		expect((await harness.stored()).promotedFields).toEqual([
			{ name: 'hp.max', property: 'hp_max' },
		]);
	});

	it('does not write the key into a layout that was only opened', async () => {
		// The off-by-default promise reaching the file: a pane that merely drew
		// the field must not make every character note's render read frontmatter.
		await openLayoutPanel(promoting());
		expect('promotedFields' in (await harness.stored())).toBe(false);
	});

	it('keeps an inline refusal across the rebuild a commit causes', async () => {
		// The pane's own errors map is what carries it, which is the half no
		// field-level case can drive.
		await openLayoutPanel(promoting([{ name: 'armour_class', property: 'ac' }]));
		type(control<HTMLInputElement>(harness, 'promoted-field-0-property'), 'sheet-layout');
		await settle(harness.pane);
		expect(said()).toContain("is this plugin's own property");
		expect((await harness.stored()).promotedFields).toEqual([
			{ name: 'armour_class', property: 'ac' },
		]);
	});
});

describe('copying and pasting a component from the tree', () => {
	/** What the fake clipboard was handed, in order. */
	let written: string[];
	/** What `readText` does: resolve with this, reject, or not exist at all. */
	let reading: { text: string } | 'reject' | 'absent';
	/** How many times `readText` was asked, for the claim that a menu makes no read. */
	let reads: number;
	let refuseWrite: boolean;

	/**
	 * A clipboard the test owns, shadowing happy-dom's prototype getter; the
	 * pane reads it off its own window, which under happy-dom is this one.
	 */
	beforeEach(() => {
		written = [];
		reading = 'absent';
		reads = 0;
		refuseWrite = false;
		const clipboard: Record<string, unknown> = {
			writeText: async (text: string): Promise<void> => {
				if (refuseWrite) throw new Error('The user said no.');
				written.push(text);
			},
		};
		Object.defineProperty(clipboard, 'readText', {
			enumerable: true,
			get: () =>
				reading === 'absent'
					? undefined
					: async (): Promise<string> => {
							reads++;
							if (reading === 'reject') throw new Error('Not allowed.');
							return (reading as { text: string }).text;
						},
		});
		Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
		Notice.messages = [];
		Notice.instances = [];
		for (const el of Array.from(document.body.querySelectorAll('.modal-container'))) {
			el.remove();
		}
	});

	afterEach(() => {
		delete (navigator as unknown as { clipboard?: unknown }).clipboard;
	});

	/** The last notice, as its reader reads it. */
	function lastNotice(): string | null | undefined {
		return Notice.instances.at(-1)?.messageEl.textContent;
	}

	/** Press the last notice's Undo link. */
	function pressUndo(): void {
		const link = Notice.instances.at(-1)?.messageEl.querySelector('a.sheetsmith-undo');
		if (!link) throw new Error('no undo in the last notice');
		(link as HTMLElement).click();
	}

	/** Let a clipboard read, the paste it feeds and the write it makes settle. */
	async function landed(from: Harness): Promise<void> {
		await tick();
		await settle(from.pane);
		await tick();
	}

	/** The refusal line under a tree row, or null. */
	function refusal(from: Harness, id: string): string | null {
		return treeRow(from, `edit-${id}`).querySelector('.sheetsmith-field-error')?.textContent ?? null;
	}

	/** Copy a row from its menu, and hand back what the clipboard now holds. */
	async function copyRow(from: Harness, id: string): Promise<string> {
		pressMenu(from, id, 'Copy');
		await tick();
		const text = written.at(-1);
		if (text === undefined) throw new Error('nothing was copied');
		return text;
	}

	/** A `copy` or `paste` event on the document, as Mod+C and Mod+V send one. */
	function clipboardEvent(type: 'copy' | 'paste', text?: string): Event {
		const event = new Event(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'clipboardData', {
			value: { getData: (kind: string) => (kind === 'text/plain' ? (text ?? '') : '') },
		});
		document.body.dispatchEvent(event);
		return event;
	}

	/** A layout with a group of two cards, one reading the other. */
	function sheet(): Layout {
		return {
			name: 'Paste sheet',
			columns: 12,
			components: [
				{
					id: 'level',
					type: 'card',
					label: 'Level',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
				{
					id: 'defences',
					type: 'group',
					label: 'Defences',
					position: { col: 3, row: 1, width: 6, height: 2 },
					children: [
						{
							id: 'armour',
							type: 'card',
							label: 'Armour class',
							position: { col: 1, row: 1, width: 3, height: 1 },
							derived: '10 + level',
						},
						{
							id: 'ward',
							type: 'card',
							label: 'Ward',
							position: { col: 4, row: 1, width: 3, height: 1 },
							derived: 'armour + 1',
						},
					],
				},
				{
					id: 'abilities',
					type: 'card-set',
					label: 'Abilities',
					position: { col: 1, row: 3, width: 6, height: 1 },
					entries: [{ key: 'STR' }, { key: 'DEX' }],
				},
				{
					id: 'saves',
					type: 'card-set',
					label: 'Saves',
					position: { col: 7, row: 3, width: 6, height: 1 },
					entries: [{ key: 'STR' }, { key: 'DEX' }, { key: 'CON' }],
				},
				{
					id: 'hit_points',
					type: 'pool',
					label: 'Hit points',
					position: { col: 1, row: 4, width: 4, height: 1 },
					max: '10',
				},
			] as unknown as Layout['components'],
			triggers: ['Long rest'],
		};
	}

	it('offers the three items, never disabled, and opening the menu reads nothing', async () => {
		harness = await open(sheet());
		reading = { text: 'anything' };
		openRowMenu(harness, 'level');
		for (const title of ['Copy', 'Paste', 'Paste configuration']) {
			expect(menuItem(title).classList.contains('is-disabled'), title).toBe(false);
		}
		expect(reads).toBe(0);
	});

	it('copies the wrapper, names the component, and says nothing about the vault or the folder', async () => {
		harness = await open(sheet());
		const text = await copyRow(harness, 'defences');
		const wrapper = JSON.parse(text) as Record<string, unknown>;
		expect(wrapper.sheetsmith).toBe('component');
		expect(wrapper.version).toBe(1);
		expect(wrapper.from).toEqual({
			layout: 'Paste sheet',
			fingerprint: layoutFingerprint('Test vault', `${LAYOUT_FOLDER}/Paste sheet.sheetsmith`),
		});
		expect((wrapper.component as ComponentConfig).children).toHaveLength(2);
		expect(wrapper.context).toEqual({ functions: {}, definitions: [] });
		expect(Notice.messages).toEqual(['Copied "Defences" to the clipboard.']);
		expect(text).not.toContain('Test vault');
		expect(text).not.toContain(LAYOUT_FOLDER);
	});

	it('says so when the clipboard refuses a copy, and writes nothing to the layout', async () => {
		harness = await open(sheet());
		refuseWrite = true;
		const wrote = writes(harness);
		pressMenu(harness, 'level', 'Copy');
		await landed(harness);
		expect(Notice.messages).toEqual(['Could not copy to the clipboard.']);
		expect(wrote()).toBe(0);
	});

	it('pastes a group into its own layout as a working copy, selected and focused', async () => {
		harness = await open(sheet());
		reading = { text: await copyRow(harness, 'defences') };
		pressMenu(harness, 'defences', 'Paste');
		await landed(harness);

		const stored = await harness.stored();
		const copy = stored.components.find((one) => one.id === 'defences_2');
		expect(copy?.label).toBe('Defences 2');
		expect(
			copy?.children?.map((one) => [
				one.id,
				one.label,
				(one as unknown as Record<string, unknown>).derived,
			]),
		).toEqual([
			['armour_2', 'Armour class 2', '10 + level'],
			['ward_2', 'Ward 2', 'armour_2 + 1'],
		]);
		// Spliced after its row in the file, and placed at the foot of the grid.
		expect(stored.components.map((one) => one.id).slice(0, 3)).toEqual([
			'level',
			'defences',
			'defences_2',
		]);
		expect(copy?.position).toEqual({ col: 1, row: 5, width: 6, height: 2 });
		expect(panelHeading(harness)).toContain('Defences 2');
		expect(document.activeElement).toBe(control(harness, 'edit-defences_2'));
		expect(treeRow(harness, 'edit-defences_2').classList.contains('sheetsmith-flash')).toBe(true);
		// Within one layout, one sentence and nothing to check.
		expect(lastNotice()).toBe('Pasted "Defences 2" with the 2 components inside it. Undo');
	});

	it('is one undo step, from the notice or the pane, and a stale undo is refused', async () => {
		harness = await open(sheet());
		const before = await harness.raw();
		reading = { text: await copyRow(harness, 'level') };
		pressMenu(harness, 'level', 'Paste');
		await landed(harness);
		expect(await harness.raw()).not.toBe(before);
		pressUndo();
		await landed(harness);
		expect(await harness.raw()).toBe(before);

		pressMenu(harness, 'level', 'Paste');
		await landed(harness);
		const undoOffer = Notice.instances.at(-1);
		expect(await undo(harness)).toBe(true);
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);

		pressMenu(harness, 'level', 'Paste');
		await landed(harness);
		const stale = Notice.instances.at(-1);
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-hit_points'), 'Health');
		await settle(harness.pane);
		const edited = await harness.raw();
		(stale?.messageEl.querySelector('a.sheetsmith-undo') as HTMLElement).click();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(edited);
		expect(Notice.messages).toContain('Sheetsmith did not undo: this layout has changed since.');
		expect(undoOffer).not.toBe(stale);
	});

	it('names what to check when the copy came from another layout', async () => {
		harness = await open(sheet());
		const copy = encodeComponentCopy({
			from: { layout: '5e 2014', fingerprint: 'elsewhere' },
			component: {
				id: 'hit_dice',
				type: 'track',
				label: 'Hit dice',
				position: { col: 1, row: 1, width: 4, height: 1 },
				count: 'level + mod(con) + prof',
				reset: [{ trigger: 'long rest', action: 'formula', to: 'floor(level / 2)' }],
			} as unknown as ComponentConfig,
			context: { functions: { mod: 'mod(score) = floor((score - 10) / 2)' }, definitions: [] },
		});
		reading = { text: copy };
		pressMenu(harness, 'level', 'Paste');
		await landed(harness);
		const stored = await harness.stored();
		expect(stored.components.some((one) => one.id === 'hit_dice')).toBe(true);
		expect(lastNotice()).toBe(
			'Pasted "Hit dice" from "5e 2014". Check what these mean here: the "long rest" reset, mod(), level, con, prof. Undo',
		);
	});

	it('reads a copy from the same file renamed as one from another layout', async () => {
		harness = await open(sheet());
		reading = { text: await copyRow(harness, 'level') };
		const file = harness.app.vault.getFileByPath(`${LAYOUT_FOLDER}/Paste sheet.sheetsmith`);
		if (!file) throw new Error('no layout file');
		await harness.app.fileManager.renameFile(file, `${LAYOUT_FOLDER}/Renamed sheet.sheetsmith`);
		await tick();
		pressMenu(harness, 'level', 'Paste');
		await landed(harness);
		// Cross-layout, so it says where it came from; the names are still right.
		expect(lastNotice()).toBe('Pasted "Level 2" from "Paste sheet". Undo');
	});

	it('refuses what is not a copied component under the row, and writes nothing', async () => {
		harness = await open(sheet());
		const before = await harness.raw();
		const wrote = writes(harness);
		for (const [text, sentence] of [
			['', "The clipboard holds no Sheetsmith component. Copy one from a row's menu first."],
			[
				'{"sheetsmith": "component", "version": 9}',
				'This component was copied from a newer version of Sheetsmith. Update the plugin to paste it.',
			],
			[
				'{"sheetsmith": "component", "version": 1, "component": {"id": "x", "type": "card", "label": "X"}}',
				'The copied component cannot be pasted: Component 1 ("X") needs a "position" object.',
			],
		] as const) {
			reading = { text };
			pressMenu(harness, 'level', 'Paste');
			await landed(harness);
			expect(refusal(harness, 'level')).toBe(sentence);
		}
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a paste over a layout that does not save, naming the fix, and throws nothing', async () => {
		harness = await open(sheet());
		// An unsaved duplicate label: `persist` refuses it and keeps it held, which
		// is its contract for a field edit.
		control(harness, 'edit-level').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-level'), 'Ward');
		await settle(harness.pane);
		const before = await harness.raw();
		reading = {
			text: encodeComponentCopy({
				from: { layout: 'Elsewhere', fingerprint: 'x' },
				component: { id: 'speed', type: 'card', label: 'Speed', position: { col: 1, row: 1, width: 2, height: 1 } },
				context: { functions: {}, definitions: [] },
			}),
		};
		pressMenu(harness, 'hit_points', 'Paste');
		await landed(harness);
		expect(refusal(harness, 'hit_points')).toBe(
			'Nothing was pasted, because this layout does not save as it stands. Fix this first: Duplicate component label "Ward". Labels key note sections, so they must be unique.',
		);
		expect(await harness.raw()).toBe(before);
	});

	it('writes a pending edit only once a paste is accepted, and never for a refused one', async () => {
		harness = await open(sheet());
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
		// Typed and not yet committed: the library commits on change, not input.
		const library = control<HTMLTextAreaElement>(harness, 'function-library');
		library.value = 'half(x) = x / 2';
		library.dispatchEvent(new Event('input'));
		const wrote = writes(harness);

		reading = { text: '' };
		pressMenu(harness, 'level', 'Paste');
		await tick();
		await tick();
		expect(refusal(harness, 'level')).toBe(
			"The clipboard holds no Sheetsmith component. Copy one from a row's menu first.",
		);
		expect(wrote()).toBe(0);

		reading = {
			text: encodeComponentCopy({
				from: { layout: 'Elsewhere', fingerprint: 'x' },
				component: { id: 'speed', type: 'card', label: 'Speed', position: { col: 1, row: 1, width: 2, height: 1 } },
				context: { functions: {}, definitions: [] },
			}),
		};
		pressMenu(harness, 'level', 'Paste');
		await landed(harness);
		const stored = await harness.stored();
		expect(stored.functions).toEqual(['half(x) = x / 2']);
		expect(stored.components.some((one) => one.id === 'speed')).toBe(true);
	});

	it('refuses a paste canReparent refuses, in its words, and pushes no undo step', async () => {
		harness = await open(sheet());
		const before = await harness.raw();
		// A group holding a group with children cannot sit inside Defences.
		reading = {
			text: encodeComponentCopy({
				from: { layout: 'Elsewhere', fingerprint: 'x' },
				component: {
					id: 'outer',
					type: 'group',
					label: 'Outer',
					position: { col: 1, row: 1, width: 4, height: 2 },
					children: [
						{
							id: 'inner',
							type: 'group',
							label: 'Inner',
							position: { col: 1, row: 1, width: 4, height: 1 },
							children: [
								{ id: 'leaf', type: 'card', label: 'Leaf', position: { col: 1, row: 1, width: 1, height: 1 } },
							],
						},
					],
				},
				context: { functions: {}, definitions: [] },
			}),
		};
		pressMenu(harness, 'armour', 'Paste');
		await landed(harness);
		expect(refusal(harness, 'armour')).toBe(
			'"Outer" holds "Inner", which holds components, and moving "Outer" here would put "Inner" inside two containers, where it could hold nothing. Move the components out of "Inner" first.',
		);
		expect(await harness.raw()).toBe(before);
		expect(await undo(harness)).toBe(false);
	});

	it('opens the paste box where the clipboard cannot be read, and pastes through it', async () => {
		for (const state of ['absent', 'reject'] as const) {
			harness = await open(sheet());
			const text = await copyRow(harness, 'level');
			reading = state;
			pressMenu(harness, 'level', 'Paste');
			await landed(harness);
			const box = openModal();
			expect(box.querySelector('.modal-title')?.textContent).toBe('Paste a component');
			const area = box.querySelector('textarea') as HTMLTextAreaElement;
			expect(Number(area.rows)).toBe(6);
			expect(modalButton('Paste').disabled).toBe(true);

			// A refusal stays in the box, under the textarea, with the text kept.
			area.value = 'not a component';
			area.dispatchEvent(new Event('input'));
			pressModalButton('Paste');
			expect(box.querySelector('.sheetsmith-field-error')?.textContent).toBe(
				"The clipboard holds no Sheetsmith component. Copy one from a row's menu first.",
			);
			expect(area.value).toBe('not a component');

			area.value = text;
			area.dispatchEvent(new Event('input'));
			pressModalButton('Paste');
			await landed(harness);
			expect(modalIsOpen()).toBe(false);
			expect((await harness.stored()).components.some((one) => one.id === 'level_2')).toBe(true);
			for (const el of Array.from(document.body.querySelectorAll('.modal-container'))) {
				el.remove();
			}
		}
	});

	it('copies and pastes with Mod+C and Mod+V on a clicked name, and only there', async () => {
		harness = await open(sheet());
		const other = await open(fixture());
		// `openView` replaces what the body holds, so the first pane is put back
		// beside the second: two panes on one document, as in a split.
		const first = harness.container.closest('.workspace-leaf');
		if (first) document.body.prepend(first);
		const otherBefore = await other.raw();

		// Clicked, not focused by hand: the owner's probe found the click was
		// what left focus on the body, where neither event could find a row.
		control(harness, 'edit-level').click();
		await settle(harness.pane);
		const copied = clipboardEvent('copy');
		await tick();
		expect(copied.defaultPrevented).toBe(true);
		const text = written.at(-1) ?? '';
		expect(JSON.parse(text)).toMatchObject({ sheetsmith: 'component' });

		const pasted = clipboardEvent('paste', text);
		await landed(harness);
		expect(pasted.defaultPrevented).toBe(true);
		expect((await harness.stored()).components.some((one) => one.id === 'level_2')).toBe(true);
		// The event's own text, with no read of the clipboard and so no box.
		expect(reads).toBe(0);
		expect(await other.raw()).toBe(otherBefore);

		// Elsewhere in the pane, and on the layout's own row, the browser keeps it.
		const count = (await harness.stored()).components.length;
		for (const token of ['tree-menu-level', `edit-${SHEET_DESTINATION}`]) {
			control(harness, token).focus();
			expect(clipboardEvent('paste', text).defaultPrevented, token).toBe(false);
			expect(clipboardEvent('copy').defaultPrevented, token).toBe(false);
		}
		await landed(harness);
		expect((await harness.stored()).components).toHaveLength(count);
		expect(control(harness, `edit-${SHEET_DESTINATION}`).hasAttribute('aria-keyshortcuts')).toBe(false);
		expect(control(harness, 'edit-level').getAttribute('aria-keyshortcuts')).toContain(
			'Control+C Control+V',
		);
	});

	it('refuses a configuration of another type, naming both, and one already held', async () => {
		harness = await open(sheet());
		reading = { text: await copyRow(harness, 'hit_points') };
		pressMenu(harness, 'level', 'Paste configuration');
		await landed(harness);
		expect(refusal(harness, 'level')).toBe(
			'The clipboard holds a Pool, and "Level" is a Card. Paste configuration only goes onto a component of the same type.',
		);

		reading = { text: await copyRow(harness, 'level') };
		pressMenu(harness, 'level', 'Paste configuration');
		await landed(harness);
		expect(refusal(harness, 'level')).toBe('"Level" already has this configuration.');
	});

	it('names the entry keys a configuration takes away, and Undo brings their values back', async () => {
		harness = await open(sheet());
		reading = { text: await copyRow(harness, 'abilities') };
		pressMenu(harness, 'saves', 'Paste configuration');
		await landed(harness);
		expect(lastNotice()).toBe(
			'Pasted the configuration of "Abilities" onto "Saves". Character notes keep any values stored under "CON", which no longer show. Undo brings them back. Undo',
		);
		// Marked where it landed, as a paste is (§6 step 5, §4 step 8).
		expect(treeRow(harness, 'edit-saves').classList.contains('sheetsmith-flash')).toBe(true);

		/** What a real Card set draws for a note holding all three values. */
		const drawn = async (): Promise<string[]> => {
			const config = (await harness.stored()).components.find(
				(one) => one.id === 'saves',
			) as CardSetConfig;
			const read = cardSet.read('\n```sheet\nSTR: 8\nDEX: 14\nCON: 12\n```\n', config);
			if (!read.ok || read.data === null) throw new Error('no data');
			const el = document.createElement('div');
			cardSet.render(el, config, read.data, {
				resolved: {},
				resolveField: () => null,
				onChange: () => undefined,
			});
			return Array.from(el.querySelectorAll('.sheetsmith-card-input'), (node) => (node as HTMLInputElement).value);
		};
		expect(await drawn()).toEqual(['8', '14']);
		pressUndo();
		await landed(harness);
		expect(await drawn()).toEqual(['8', '14', '12']);
	});
});
