// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { LayoutEditorSection } from './layout-editor';
import type SheetsmithPlugin from '../main';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { renderGrid } from '../view/grid-cells';
import { DEFAULT_SETTINGS } from '../settings';
import { App } from '../test/obsidian-stub';
import { getComponent, listComponentTypes, paletteEntries } from '../components';

/*
 * The layout editor, driven through its own DOM.
 *
 * This is the surface where every layout is authored, and it had no coverage
 * at all: it was unreachable while the obsidian stub carried only `Platform`
 * and `setIcon`, and by the time the stub grew `Setting`, the builders, an
 * in-memory vault and `Modal`, nothing came back to write the tests.
 *
 * Everything below goes through the rendered controls rather than calling a
 * method, because almost the whole module is private — `render` and `flush`
 * are the entire public surface, and a test reaching past that would be
 * asserting on an implementation the editor is free to change. The editor
 * gives every control a `data-sheetsmith-focus` token so it can restore focus
 * across its own rebuilds; that token is a stable address, and these tests
 * use it as one.
 *
 * What is checked here is the editor's contract with the *file*: which edit
 * lands as which key, what is left out, and what is never touched. How it
 * looks is `docs/UI.md`'s business and the harness's.
 */

const FOLDER = 'Sheetsmith layouts';

/** A layout with one plain component and one that can act on a reset. */
function fixture(): Layout {
	return {
		name: 'Test sheet',
		columns: 12,
		components: [
			{
				id: 'armour',
				type: 'stat',
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
	container: HTMLElement;
	editor: LayoutEditorSection;
	app: App;
	/** The layout as the file currently holds it. */
	stored: () => Promise<Layout>;
	/** The file's exact bytes, for the round-trip check. */
	raw: () => Promise<string>;
	/** Re-render, the way the settings tab's redraw does. */
	redraw: () => Promise<void>;
}

/**
 * The editor writes through a debounce and persists without awaiting, so a
 * test that asserted straight after a click would read the file as it was
 * before the edit. `flush` runs the pending write; the timeout lets the
 * unawaited promise inside it settle.
 */
async function settle(editor: LayoutEditorSection): Promise<void> {
	editor.flush();
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function open(layout: Layout = fixture()): Promise<Harness> {
	const app = new App();
	await app.vault.createFolder(FOLDER);
	const path = `${FOLDER}/${layout.name}.json`;
	await app.vault.create(path, serialiseLayout(layout));

	const plugin = {
		app,
		settings: { ...DEFAULT_SETTINGS, layoutFolder: FOLDER },
		async saveSettings() {},
	} as unknown as SheetsmithPlugin;

	const container = document.createElement('div');
	document.body.replaceChildren(container);

	const editor = new LayoutEditorSection(plugin, () => {
		void harness.redraw();
	});

	const raw = async () => {
		const file = app.vault.getFileByPath(path);
		if (!file) throw new Error(`${path} is gone`);
		return app.vault.read(file);
	};

	const harness: Harness = {
		container,
		editor,
		app,
		raw,
		stored: async () => parseLayout(await raw()),
		redraw: async () => {
			container.replaceChildren();
			await editor.render(container);
		},
	};

	await harness.redraw();
	return harness;
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

/** A named setting row's text, for asserting on what the editor offers. */
function labels(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll('.setting-item-name'),
	).map((el) => el.textContent ?? '');
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
		// Counted rather than compared. Asserting the bytes are unchanged
		// passes just as well when the editor rewrote the file with identical
		// content — and passes trivially, so it would go on passing if the
		// round trip below ever broke. The claim here is that opening a form
		// is not an edit, and that is a claim about writes.
		let writes = 0;
		const modify = harness.app.vault.modify.bind(harness.app.vault);
		harness.app.vault.modify = async (file, content) => {
			writes++;
			return modify(file, content);
		};

		await settle(harness.editor);
		expect(writes).toBe(0);
	});

	it('restores the file exactly when an edit is undone', async () => {
		// Constraint 3 is about character notes, but a layout that comes back
		// spelled differently after a change and its reversal is the same
		// broken promise: the file is the user's, and the editor is not
		// entitled to reformat it in passing.
		const before = await harness.raw();

		control(harness, 'edit-armour').click();
		await settle(harness.editor);
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.editor);
		expect(await harness.raw()).not.toBe(before);

		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), '');
		await settle(harness.editor);
		expect(await harness.raw()).toBe(before);
	});
});

describe('adding and removing a component', () => {
	beforeEach(async () => {
		harness = await open();
	});

	it('appends the chosen type and opens it for editing', async () => {
		const add = Array.from(harness.container.querySelectorAll('select')).find(
			(select) =>
				Array.from(select.options).some((o) => o.value === 'track'),
		);
		if (!add) throw new Error('no type dropdown');
		choose(add, 'track');
		const button = Array.from(
			harness.container.querySelectorAll('button'),
		).find((el) => el.textContent === 'Add');
		button?.click();
		await settle(harness.editor);

		const components = (await harness.stored()).components;
		expect(components).toHaveLength(3);
		expect(components[2]?.type).toBe('track');
		// Opened, so the author lands in the form rather than having to find
		// the row they just created.
		expect(has(harness, `cfg-${components[2]?.id}-count`)).toBe(true);
	});

	it('offers every type, with each entry indented under the type it prefills', () => {
		const options = Array.from(
			control<HTMLSelectElement>(harness, 'add-choice').options,
		);
		// The vocabulary is still the whole catalog: an author who wants a plain
		// Track has to be able to ask for one, and an entry is a starting point
		// they then edit rather than a variant with capabilities of its own.
		for (const type of listComponentTypes()) {
			expect(options.map((option) => option.value)).toContain(type);
		}
		const checkbox = options.find((option) => option.value === 'track:0');
		expect(checkbox?.text.trim()).toBe('Checkbox');
		// Indented, which is the only thing a dropdown has for saying that one
		// option sits under another — the destination dropdown's own spelling.
		expect(checkbox?.text.startsWith('\u2007')).toBe(true);
		// And directly under it, so the list reads as the catalog with each
		// block's own prefills beneath it.
		expect(options.indexOf(checkbox as HTMLOptionElement)).toBe(
			options.findIndex((option) => option.value === 'track') + 1,
		);
	});

	it('runs each type, then every prefill of it, then the next type', () => {
		/*
		 * The menu's whole structure in one assertion, and it is written as the
		 * rule rather than against the catalog of the day: Table is the first
		 * type carrying two entries, but a version naming Table would hold the
		 * run only for Table, and would fail the moment Table gained a third —
		 * on the check that is not the point.
		 *
		 * The shape is what the option *value* scheme rests on. `paletteEntries`
		 * returns a list and the value is `type:index`, so a second entry is a
		 * second option rather than one displacing the other, and the indent that
		 * says an entry sits under its type is only true while the entry actually
		 * follows it. The check above cannot see any of that: it looks at the one
		 * option after a type, so an interleaved menu passes it.
		 *
		 * Expected from `paletteEntries` — the registry — and not from
		 * `addChoices`, which is the thing under test. Derived from the latter
		 * this would only assert that a function equals itself.
		 */
		const values = Array.from(
			control<HTMLSelectElement>(harness, 'add-choice').options,
		).map((option) => option.value);
		expect(values).toEqual(
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
		const menu = () => control<HTMLSelectElement>(harness, 'add-choice');
		choose(menu(), 'table:0');
		pressAdd(harness);
		await settle(harness.editor);
		choose(menu(), 'table:0');
		pressAdd(harness);
		await settle(harness.editor);

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
		 * pointing at Features' columns, which is not what broke.
		 *
		 * Expected from the registry, as the menu-run check above is, so what is
		 * compared is the component the editor wrote against the entry it was
		 * asked for.
		 */
		const entries = paletteEntries('table');
		// A loop over one entry would pass without exercising the disambiguation
		// at all, which is the whole subject here.
		expect(entries.length).toBeGreaterThan(1);

		for (const [index, entry] of entries.entries()) {
			choose(control<HTMLSelectElement>(harness, 'add-choice'), `table:${index}`);
			pressAdd(harness);
			await settle(harness.editor);

			const components = (await harness.stored()).components;
			const added = components[
				components.length - 1
			] as unknown as Record<string, unknown>;
			expect(added.type).toBe('table');
			// The entry's own name, so an author who chose Features has a
			// component called Features until they rename it.
			expect(added.label).toBe(entry.name);
			for (const [key, value] of Object.entries(entry.config)) {
				expect(added[key], `${entry.name} wrote ${key}`).toEqual(value);
			}
		}
	});

	it('writes the entry\'s config, its name and an ordinary component', async () => {
		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		pressAdd(harness);
		await settle(harness.editor);

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

	it('puts the chosen entry\'s description beside the menu, and a type\'s nothing', () => {
		const menu = control<HTMLSelectElement>(harness, 'add-choice');
		const description = () =>
			menu.closest('.setting-item')?.querySelector('.setting-item-description')
				?.textContent ?? '';
		// SPEC §13's warning is that a menu nobody can read is worse than the
		// type list it replaced, and a dropdown line is one or two words. So what
		// a prefill is for has to be on screen.
		choose(menu, 'track:0');
		expect(description()).toContain('yes or no');
		choose(menu, 'track');
		expect(description()).toBe('');
	});

	it('names an entry against the whole sheet, as a type is named', async () => {
		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		pressAdd(harness);
		await settle(harness.editor);
		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		pressAdd(harness);
		await settle(harness.editor);

		const labelled = (await harness.stored()).components.map((c) => c.label);
		expect(labelled).toContain('Checkbox');
		expect(labelled).toContain('Checkbox 2');
	});

	it('removes nothing until the confirmation is taken', async () => {
		control(harness, 'remove-armour').click();
		expect((await harness.stored()).components).toHaveLength(2);

		confirmAction();
		await settle(harness.editor);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'hit_points',
		]);
	});
});

describe('editing a component', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.editor);
	});

	it('renames the label without moving the id', async () => {
		// The id is what formulas reference (SPEC §4.1), so a rename that
		// changed it would break every expression naming this component while
		// looking like a cosmetic edit.
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.editor);

		const component = (await harness.stored()).components[0];
		expect(component?.label).toBe('Defence');
		expect(component?.id).toBe('armour');
	});

	it('writes a config value under the field\'s own key', async () => {
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.editor);
		expect((await harness.stored()).components[0]).toMatchObject({ key: 'AC' });
	});

	it('leaves out a boolean that matches its own default', async () => {
		// `signed` defaults to true. Storing it anyway would make the config
		// carry a key that says nothing, and `visibleWhen` matches effective
		// values precisely so absence can mean the default (PATTERNS §8).
		toggle(checkbox(harness, 'Signed'), true);
		await settle(harness.editor);
		expect((await harness.stored()).components[0]).not.toHaveProperty('signed');

		toggle(checkbox(harness, 'Signed'), false);
		await settle(harness.editor);
		expect((await harness.stored()).components[0]).toMatchObject({ signed: false });
	});

	it('never touches the other components', async () => {
		const before = (await harness.stored()).components[1];
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.editor);
		expect((await harness.stored()).components[1]).toEqual(before);
	});
});

describe('a field shown only under a condition', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness, 'edit-hit_points').click();
		await settle(harness.editor);
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
		await settle(harness.editor);
		expect(has(harness, 'cfg-hit_points-max')).toBe(false);
	});
});

describe('the reset binding', () => {
	// Asked of the component through `applyReset`, never inferred from its
	// type. The editor knowing that a Pool can be restored and a Stat cannot
	// is exactly the coupling the component contract exists to prevent.

	it('is offered to a component that can act on a reset', async () => {
		harness = await open();
		control(harness, 'edit-hit_points').click();
		await settle(harness.editor);
		// The heading carries a count badge, so match its start.
		expect(groups(harness).some((t) => t.startsWith('Resets on'))).toBe(true);
	});

	it('is never offered to one that holds no state', async () => {
		// A binding on a component with nothing to restore is a control that
		// does nothing, which is worse than a missing one: it tells the layout
		// author they have configured something.
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.editor);
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
			await settle(harness.editor);

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
		await app.vault.createFolder(FOLDER);
		await app.vault.create(`${FOLDER}/Broken.json`, '{ not json');

		const plugin = {
			app,
			settings: { ...DEFAULT_SETTINGS, layoutFolder: FOLDER },
			async saveSettings() {},
		} as unknown as SheetsmithPlugin;

		const container = document.createElement('div');
		document.body.replaceChildren(container);
		const editor = new LayoutEditorSection(plugin, () => undefined);

		await editor.render(container);

		const error = container.querySelector('.sheetsmith-error');
		expect(error?.textContent).toContain('cannot be edited');
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
						type: 'stat',
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
								type: 'stat',
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
	const select = harness.container.querySelector(
		'[data-sheetsmith-focus="add-destination"]',
	);
	if (!select) return null;
	return Array.from((select as HTMLSelectElement).options).map(
		(option) => option.text,
	);
}

function pressAdd(harness: Harness): void {
	const button = Array.from(harness.container.querySelectorAll('button')).find(
		(el) => el.textContent === 'Add',
	);
	if (!button) throw new Error('no Add button');
	button.click();
}

/** The type dropdown on the add row, found by an option only it carries. */
function typeDropdown(harness: Harness): HTMLSelectElement {
	const select = Array.from(harness.container.querySelectorAll('select')).find(
		(candidate) =>
			Array.from(candidate.options).some((option) => option.value === 'group'),
	);
	if (!select) throw new Error('no type dropdown');
	return select;
}

describe('the component list', () => {
	beforeEach(async () => {
		harness = await open(nested());
	});

	it('lists the children of a container beneath it, indented', () => {
		// The same depth-first walk the sheet reads in, so what the list shows in
		// order is what the sheet reflows and tabs through in order: a child sits
		// between its container and the container's next neighbour.
		const rows = labels(harness);
		expect(rows.indexOf('Armour class')).toBe(rows.indexOf('Defences') + 1);
		expect(rows.indexOf('Hit points')).toBe(rows.indexOf('Armour class') + 1);
		const row = control(harness, 'edit-armour').closest('.setting-item');
		expect(row?.classList.contains('sheetsmith-row-child')).toBe(true);
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

	it('gives a child its own edit and remove controls', () => {
		expect(has(harness, 'edit-armour')).toBe(true);
		expect(has(harness, 'remove-armour')).toBe(true);
	});

	it('draws the container on the schematic and not what it holds', () => {
		// The children sit on the container's own grid, not the sheet's, so the
		// sheet's schematic has nowhere to put them. Theirs is drawn beside the
		// container's form, where the width they are placed against is known.
		expect(has(harness, 'preview-defences')).toBe(true);
		expect(has(harness, 'preview-armour')).toBe(false);
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
		choose(typeDropdown(harness), 'stat');
		choose(
			control<HTMLSelectElement>(harness, 'add-destination'),
			'defences',
		);
		pressAdd(harness);
		await settle(harness.editor);

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
		choose(typeDropdown(harness), 'stat');
		pressAdd(harness);
		await settle(harness.editor);
		expect((await harness.stored()).components).toHaveLength(3);
	});

	it('names the new component against the whole sheet, not one level', async () => {
		// A label keys a note section and an id is what a formula writes, and
		// containment scopes neither — so a child may not take a name a
		// component in another container already has.
		choose(typeDropdown(harness), 'pool');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'defences');
		pressAdd(harness);
		await settle(harness.editor);

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
		const menu = control<HTMLSelectElement>(harness, 'add-choice');
		choose(menu, 'track:0');
		pressAdd(harness);
		await settle(harness.editor);

		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'defences');
		pressAdd(harness);
		await settle(harness.editor);

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
		choose(typeDropdown(harness), 'group');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'defences');
		pressAdd(harness);
		await settle(harness.editor);

		const inner = (await harness.stored()).components[0]?.children?.[1];
		expect(inner?.type).toBe('group');
		// The inner group is offered; nothing below it can be, because it has no
		// children to be a container of yet — and once it has, it is two deep.
		expect(destinations(harness)).toEqual([
			'On the sheet',
			'In Defences',
			`\u2007\u2007In ${inner?.label ?? ''}`,
		]);

		choose(typeDropdown(harness), 'group');
		choose(
			control<HTMLSelectElement>(harness, 'add-destination'),
			inner?.id ?? '',
		);
		pressAdd(harness);
		await settle(harness.editor);

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

	it('says what happens to the components inside it', () => {
		control(harness, 'remove-defences').click();
		const modal = document.body.querySelector('.modal-container');
		expect(modal?.textContent).toContain('The component inside it moves');
	});

	it('keeps its children, at the top level', async () => {
		// A component config is not character data, but losing six components'
		// formulas to one click is the same failure in miniature — and the modal
		// only ever promised that the notes survived.
		control(harness, 'remove-defences').click();
		confirmAction();
		await settle(harness.editor);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual(['hit_points', 'armour']);
		const moved = stored.components[1];
		expect(moved?.children).toBeUndefined();
		// At the bottom of the sheet, where a newly added component goes, so
		// nothing arrives overlapping.
		expect(moved?.position).toMatchObject({ col: 1, row: 2, width: 3 });
	});

	it('removes a child without touching its container', async () => {
		control(harness, 'remove-armour').click();
		confirmAction();
		await settle(harness.editor);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
		]);
		expect(stored.components[0]?.children).toEqual([]);
	});
});

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
		choose(typeDropdown(harness), 'group');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'melee');
		pressAdd(harness);
		await settle(harness.editor);
	});

	it('is not offered a grid to put components on', async () => {
		const inner = (await harness.stored()).components[0]?.children?.[0]
			?.children?.[1];
		expect(inner?.type).toBe('group');
		// Its form is open, so the sheet's schematic is the only one there is.
		expect(
			harness.container.querySelectorAll('.sheetsmith-layout-preview'),
		).toHaveLength(1);
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
		// children and gets its schematic.
		control(harness, 'edit-melee').click();
		await settle(harness.editor);
		expect(
			harness.container.querySelectorAll('.sheetsmith-layout-preview'),
		).toHaveLength(2);
		expect(harness.container.textContent).toContain('on its own grid of');
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
		await settle(harness.editor);
		type(control<HTMLInputElement>(harness, 'label-spellbook'), 'Spells');
		await settle(harness.editor);

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
		choose(typeDropdown(harness), 'group');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'melee');
		pressAdd(harness);
		await settle(harness.editor);

		const added = (await harness.stored()).components[0]?.children?.[0]
			?.children?.[1];
		expect(added?.type).toBe('group');
		// Its form is open, which is what used to create the key.
		expect(has(harness, `label-${added?.id ?? ''}`)).toBe(true);

		type(control<HTMLInputElement>(harness, `label-${added?.id ?? ''}`), 'Renamed');
		await settle(harness.editor);
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
		await settle(harness.editor);
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

	it('draws a second schematic for the children, on its own grid', () => {
		const previews = harness.container.querySelectorAll(
			'.sheetsmith-layout-preview',
		);
		expect(previews).toHaveLength(2);
		// Six columns, which is the container's width rather than the layout's.
		expect(
			(previews[1] as HTMLElement).style.getPropertyValue(
				'--sheetsmith-columns',
			),
		).toBe('6');
		expect(previews[1]?.querySelector('.sheetsmith-preview-cell')).not.toBeNull();
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
						type: 'stat',
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
		await settle(harness.editor);
	});

	it('draws no schematic for it, and lists its tabs in order instead', async () => {
		// One schematic on the tab — the sheet's — where an open Group has two.
		expect(
			harness.container.querySelectorAll('.sheetsmith-layout-preview'),
		).toHaveLength(1);
		expect(labels(harness)).toContain('1. Combat');
		expect(labels(harness)).toContain('2. Spells');
		expect(labels(harness)).toContain('3. Rest');
	});

	it('offers no position fields on a tab', async () => {
		// None of the four is read for a tab, and a field that edits a number
		// nothing reads is worse than no field.
		control(harness, 'edit-spells').click();
		await settle(harness.editor);
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
		await settle(grouped.editor);
		expect(has(grouped, 'pos-armour-col')).toBe(true);
	});

	it('reorders the tabs, and that is what the strip order is', async () => {
		control(harness, 'tab-down-combat').click();
		await settle(harness.editor);
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
		await settle(harness.editor);
		expect(
			(await harness.stored()).components[0]?.children?.map((tab) => tab.id),
		).toEqual(['combat', 'spells', 'rest']);
	});

	it('gives a tab it adds the container\'s own size rather than a free row', async () => {
		// The numbers are not read, but they are in the file: `row: 4` on a tab
		// would tell a hand-editor it sits somewhere. The box it actually fills is
		// the honest thing to write.
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'pages');
		pressAdd(harness);
		await settle(harness.editor);
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
									type: 'stat',
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
		control(harness, 'edit-combat').click();
		await settle(harness.editor);

		const previews = harness.container.querySelectorAll(
			'.sheetsmith-layout-preview',
		);
		expect(previews).toHaveLength(2);
		// Six, the tab set's. Four would be the Group's own stored width, which is
		// what the sheet ignores and what this used to draw.
		expect(
			(previews[1] as HTMLElement).style.getPropertyValue(
				'--sheetsmith-columns',
			),
		).toBe('6');
	});

	it('draws the declared rows, so the preview shows the box not the content', async () => {
		// The premise of a tab set is that its box is its placement — and the editor
		// is the only surface where an author can see a declared row nothing fills.
		// The schematic drew only the rows blocks occupied, so an 8×3 tab holding
		// one row of cards previewed as one row while the sheet drew three.
		//
		// Six rows here rather than three, because the stale fixture's tab set is
		// what governs: `innerPlacement` again, the same function the columns come
		// from.
		const harness = await open(staleTab());
		control(harness, 'edit-combat').click();
		await settle(harness.editor);
		const inner = harness.container.querySelectorAll(
			'.sheetsmith-layout-preview',
		)[1] as HTMLElement;
		expect(inner.style.gridTemplateRows).toBe(
			'repeat(3, var(--sheetsmith-preview-row))',
		);
	});

	it('leaves the sheet\'s own schematic to grow, as the sheet does', async () => {
		// Not an omission: `.sheetsmith-grid` sets no `grid-template-rows` at the
		// top level, so the sheet grows down as components are added. A fixed row
		// count here would preview a box the sheet does not have — the opposite of
		// the bug above, and the reason `rows` is optional rather than always set.
		const harness = await open(staleTab());
		const sheet = harness.container.querySelector(
			'.sheetsmith-layout-preview',
		) as HTMLElement;
		expect(sheet.style.gridTemplateRows).toBe('');
	});

	it('describes the same width it draws', async () => {
		// The two said different things fifty lines apart: the schematic read the
		// stored width while the child's own form printed "it has no position of
		// its own".
		const harness = await open(staleTab());
		control(harness, 'edit-combat').click();
		await settle(harness.editor);
		const descriptions = Array.from(
			harness.container.querySelectorAll('.setting-item-description'),
		).map((el) => el.textContent ?? '');
		expect(
			descriptions.some((text) => text.includes('6 columns by 3 rows')),
		).toBe(true);
		expect(descriptions.some((text) => text.includes('4 columns'))).toBe(false);
	});

	it('agrees with the sheet, which is the divergence that mattered', async () => {
		// Both drawings through one function: the editor's schematic column count
		// and the subgrid `renderGrid` opens for the same component. Asserted
		// against each other rather than against 6 twice, so a change to either
		// side has to move both.
		const layout = staleTab();
		const harness = await open(layout);
		control(harness, 'edit-combat').click();
		await settle(harness.editor);
		const drawn = (
			harness.container.querySelectorAll(
				'.sheetsmith-layout-preview',
			)[1] as HTMLElement
		).style.getPropertyValue('--sheetsmith-columns');

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
									type: 'stat',
									label: 'One',
									position: { col: 1, row: 1, width: 3, height: 1 },
								},
								{
									id: 'two',
									type: 'stat',
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
									type: 'stat',
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

	it('marks the two blocks sharing a cell inside the open tab', async () => {
		const harness = await open(overlappingTabs());
		control(harness, 'edit-combat').click();
		await settle(harness.editor);

		// One schematic for the sheet and one for the open container tab. The tab
		// set contributes none, which is why the count is two rather than three.
		const previews = harness.container.querySelectorAll(
			'.sheetsmith-layout-preview',
		);
		expect(previews).toHaveLength(2);
		const marked = Array.from(
			(previews[1] as HTMLElement).querySelectorAll(
				'.sheetsmith-preview-overlap',
			),
		).map((el) => el.textContent);
		expect(marked.sort()).toEqual(['One', 'Two']);
	});

	it('never marks a block on another tab, whatever position it shares', async () => {
		const harness = await open(overlappingTabs());
		control(harness, 'edit-combat').click();
		await settle(harness.editor);
		// "Three" sits at the same coordinates as both of the above and is on no
		// schematic that draws them, so it is drawn nowhere here and marked
		// nowhere either.
		const all = Array.from(
			harness.container.querySelectorAll('.sheetsmith-preview-cell'),
		).map((el) => el.textContent);
		expect(all).not.toContain('Three');
		// And the tabs themselves, which share one position, are never compared:
		// no schematic draws them, so neither can be marked.
		expect(all).not.toContain('Combat');
		expect(all).not.toContain('Spells');
	});
});
