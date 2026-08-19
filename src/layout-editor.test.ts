// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { LayoutEditorSection } from './layout-editor';
import type SheetsmithPlugin from './main';
import { Layout, parseLayout, serialiseLayout } from './parse/layout';
import { DEFAULT_SETTINGS } from './settings';
import { App } from './test/obsidian-stub';

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
 * Boolean fields are the one kind the editor gives no focus token, so a row
 * name is the only address they have. It is also the label the author reads,
 * which makes it the right thing for a test to name.
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
