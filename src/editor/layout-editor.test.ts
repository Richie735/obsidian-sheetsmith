// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_DESTINATION } from './layout-editor';
import { LayoutEditorView } from '../view/layout-editor-view';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { renderGrid } from '../view/grid-cells';
import { App } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { cancel, pressDown, release } from '../test/pointer';
import { openView } from '../test/workspace';
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
	const path = `${LAYOUT_FOLDER}/${layout.name}.json`;
	await app.vault.create(path, serialiseLayout(layout));

	const pane = await openView(app, document.body, LayoutEditorView, fakePlugin(app));

	const raw = async () => {
		const file = app.vault.getFileByPath(path);
		if (!file) throw new Error(`${path} is gone`);
		return app.vault.read(file);
	};

	return {
		container: pane.contentEl,
		pane,
		app,
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
		await settle(harness.pane);

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
		await settle(harness.pane);
		choose(menu(), 'table:0');
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
			await settle(harness.pane);

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

	it('puts the chosen entry\'s description below the menu, and a type\'s nothing', () => {
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

	it('leaves the description a direct child of the row, after the controls', () => {
		/*
		 * The stylesheet's half of the fix for docs/UI.md §12's moved **Add**
		 * button: `.sheetsmith-add-row > .setting-item-description` is a child
		 * combinator, and it is what gives the description `flex-basis: 100%` so
		 * it takes a line of its own instead of widening the info column until
		 * the control column wraps.
		 *
		 * Guarded because the failure is invisible (docs/PATTERNS.md §10). Drop
		 * the `appendChild` — in an edit here, or in the M4 rewrite of this row —
		 * and `descEl` goes back inside the info column, the selector matches
		 * nothing, and the button an author presses next moves 35px while they
		 * are choosing what to press it for. Nothing type-checks it, and the test
		 * above passes either way: it reaches the description with a descendant
		 * query, which finds it in both positions.
		 *
		 * `lastElementChild` rather than a containment check, because both facts
		 * are load bearing and it holds them in one. Direct child is what the
		 * selector needs; *after* the controls is what puts it on the second flex
		 * line rather than the first.
		 */
		const menu = control(harness, 'add-choice');
		const row = menu.closest('.setting-item');
		expect(row?.classList.contains('sheetsmith-add-row')).toBe(true);
		const description = row?.lastElementChild;
		expect(description?.classList.contains('setting-item-description')).toBe(true);
		// And the menu is described by it (docs/UI.md §6). Painted alone, the only
		// explanation an entry gets reaches nobody using a screen reader: they
		// hear "Inventory" and stop there. Asserted beside the position because
		// the id is what the association hangs on, so the two break together.
		expect(menu.getAttribute('aria-describedby')).toBe(description?.id);
		expect(description?.id).toBeTruthy();
	});

	it('names an entry against the whole sheet, as a type is named', async () => {
		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		pressAdd(harness);
		await settle(harness.pane);
		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		pressAdd(harness);
		await settle(harness.pane);

		const labelled = (await harness.stored()).components.map((c) => c.label);
		expect(labelled).toContain('Checkbox');
		expect(labelled).toContain('Checkbox 2');
	});

	it('removes nothing until the confirmation is taken', async () => {
		control(harness, 'remove-armour').click();
		expect((await harness.stored()).components).toHaveLength(2);

		confirmAction();
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
		await app.vault.create(`${LAYOUT_FOLDER}/Broken.json`, '{ not json');

		const pane = await openView(app, document.body, LayoutEditorView, fakePlugin(app));

		const error = pane.contentEl.querySelector('.sheetsmith-error');
		expect(error?.textContent).toContain('cannot be edited');
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
		choose(typeDropdown(harness), 'card');
		choose(
			control<HTMLSelectElement>(harness, 'add-destination'),
			'defences',
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
		choose(typeDropdown(harness), 'card');
		pressAdd(harness);
		await settle(harness.pane);
		expect((await harness.stored()).components).toHaveLength(3);
	});

	it('names the new component against the whole sheet, not one level', async () => {
		// A label keys a note section and an id is what a formula writes, and
		// containment scopes neither — so a child may not take a name a
		// component in another container already has.
		choose(typeDropdown(harness), 'pool');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'defences');
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
		const menu = control<HTMLSelectElement>(harness, 'add-choice');
		choose(menu, 'track:0');
		pressAdd(harness);
		await settle(harness.pane);

		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'defences');
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
		choose(typeDropdown(harness), 'group');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'defences');
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

		choose(typeDropdown(harness), 'group');
		choose(
			control<HTMLSelectElement>(harness, 'add-destination'),
			inner?.id ?? '',
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
		control(harness, 'remove-armour').click();
		confirmAction();
		await settle(harness.pane);

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
		choose(typeDropdown(harness), 'group');
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'melee');
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
		choose(control<HTMLSelectElement>(harness, 'add-destination'), 'pages');
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
		// author sees the same fixed box on both. Three rows here rather than
		// four, because the stale fixture's tab set is what governs —
		// `innerPlacement` again, the same function the columns come from.
		const harness = await open(staleTab());
		const combatGrid = harness.container.querySelector<HTMLElement>(
			'[data-sheetsmith-grid="combat"]',
		);
		expect(combatGrid?.style.gridTemplateRows).toBe(
			'repeat(3, minmax(0, 1fr))',
		);
	});

	it('leaves the sheet\'s own schematic to grow, as the sheet does', async () => {
		// Not an omission: `.sheetsmith-grid` sets no `grid-template-rows` at the
		// top level, so the sheet grows down as components are added. A fixed row
		// count here would preview a box the sheet does not have — the opposite of
		// the bug above, and the reason `rows` is optional rather than always set.
		const harness = await open(staleTab());
		const sheet = harness.container.querySelector(
			'.sheetsmith-editor-canvas .sheetsmith-grid',
		) as HTMLElement;
		expect(sheet.style.gridTemplateRows).toBe('');
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

	it('sits indented under Card in the add menu', () => {
		const options = Array.from(
			control<HTMLSelectElement>(harness, 'add-choice').options,
		);
		const dropdown = options.find((option) => option.value === 'card:0');
		expect(dropdown?.text.trim()).toBe('Dropdown');
		expect(dropdown?.text.startsWith(' ')).toBe(true);
		expect(options.indexOf(dropdown as HTMLOptionElement)).toBe(
			options.findIndex((option) => option.value === 'card') + 1,
		);
	});

	it('adds a card carrying two options, labelled Dropdown', async () => {
		choose(control<HTMLSelectElement>(harness, 'add-choice'), 'card:0');
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
		expect(labels(harness).slice(0, 5)).toEqual([
			// The picker, then the tree. Named apart on purpose: this one chooses
			// which layout is open and the next configures the one that is.
			'Layout file',
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

		const container = treeRow(harness, 'edit-defences');
		const child = treeRow(harness, 'edit-armour');
		expect(container.nextElementSibling).toBe(child);
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

	it('reparents with the indent button, no pointer event dispatched', async () => {
		// The keyboard-operable equivalent of dropping a row onto the row
		// before it: `hit_points` moves into `defences`, its only earlier
		// sibling, with nothing but a click on the control.
		harness = await open(nested());
		control(harness, 'tree-indent-hit_points').click();
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(
			stored.components.find((c) => c.id === 'defences')?.children?.map(
				(c) => c.id,
			),
		).toEqual(['armour', 'hit_points']);
	});

	it('reparents with the outdent button, no pointer event dispatched', async () => {
		harness = await open(nested());
		control(harness, 'tree-outdent-armour').click();
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
			'armour',
		]);
		expect(stored.components[0]?.children).toEqual([]);
	});

	it('reorders with the up and down buttons, no pointer event dispatched', async () => {
		// The keyboard-operable equivalent of dragging a row onto a sibling
		// within its own current parent — `list-fields.ts`'s own `moveItem`
		// semantics, reused rather than reinvented, exactly as the drag-based
		// reorder test above already proves for the pointer (`tree.ts`'s own
		// header names both as new in this slice; only the drag half had a
		// test).
		harness = await open(threeLeaves());
		control(harness, 'tree-down-a').click();
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'b',
			'a',
			'c',
		]);

		control(harness, 'tree-up-c').click();
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'b',
			'c',
			'a',
		]);
	});

	it('disables indent and outdent exactly where the drag equivalent would be refused', async () => {
		harness = await open(nested());
		// `defences` is the first row among its own siblings, so there is no
		// earlier sibling to move into.
		expect(control(harness, 'tree-indent-defences').hasAttribute('disabled')).toBe(
			true,
		);
		// `defences` is already at the top level.
		expect(
			control(harness, 'tree-outdent-defences').hasAttribute('disabled'),
		).toBe(true);
		// `armour` is inside `defences` already, so outdent is live.
		expect(control(harness, 'tree-outdent-armour').hasAttribute('disabled')).toBe(
			false,
		);
	});

	it('disables indent exactly where it would push a subtree past the depth cap', async () => {
		/*
		 * The trivial cases above (`disables indent and outdent exactly
		 * where...`) never reach the interesting refusal the drag path has
		 * its own dedicated test for (`refuses a drop that would push a
		 * container past the depth cap, with no write`, against `deep()`):
		 * a container that itself holds a container of its own, indented
		 * into a sibling that is already one level in. `zone` holds two
		 * depth-1 children — `holder`, empty, and `nested`, which holds
		 * `leaf` — so indenting `nested` into its previous sibling `holder`
		 * would land `leaf` three containers deep.
		 */
		const withDepthCap: Layout = {
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
		harness = await open(withDepthCap);

		expect(control(harness, 'tree-indent-nested').hasAttribute('disabled')).toBe(
			true,
		);
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

describe('a selection the layout cannot honour', () => {
	it('falls back to the layout, never to the first component', async () => {
		// Landing an author in a form nobody chose is the failure the reset
		// binding's dropdown already guards against for the same reason.
		harness = await open(furnished());
		control(harness, 'edit-abilities').click();
		await settle(harness.pane);

		treeRow(harness, 'edit-abilities');
		control(harness, 'remove-abilities').click();
		confirmAction();
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
		const picker = control<HTMLSelectElement>(harness, 'modifier-Ring of Protection-target');
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
		const picker = control<HTMLSelectElement>(harness, 'modifier-Ring of Protection-target');
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
			'modifier-Ring of Protection-operator',
		);
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual([
			'Adds to',
			'Sets',
		]);
		expect(has(harness, 'modifier-Ring of Protection-bonus-type')).toBe(true);
		choose(operator, 'override');
		await settle(harness.pane);
		expect(has(harness, 'modifier-Ring of Protection-bonus-type')).toBe(false);
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
		type(control<HTMLInputElement>(harness, 'modifier-Ring of Protection-amount'), '2');
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
function measureRows(el: HTMLElement, tracks: string): void {
	const view = el.ownerDocument.defaultView;
	if (!view) throw new Error('no window');
	const original = view.getComputedStyle.bind(view);
	view.getComputedStyle = ((target: Element, pseudo?: string | null) => {
		const styles = original(target, pseudo);
		if (target === el) {
			Object.defineProperty(styles, 'gridTemplateRows', {
				value: tracks,
				configurable: true,
			});
		}
		return styles;
	});
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

		// Real numbers, not merely equal ones. A 2-wide block pushed right ends
		// flush at column 12, so its `col` stops at 11; grown from column 1 the
		// same edge is a width of 12.
		expect(byArrows.col).toBe(11);
		expect(byDrag.col).toBe(byArrows.col);
		expect(byShiftArrows.width).toBe(12);
		expect(byCorner.width).toBe(byShiftArrows.width);
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
	it('offers one sentence and a way to create one, and nothing else', async () => {
		// The first thing a new user sees, and the state the settings tab drew as
		// a row: one line in the top-left corner of an empty rectangle. Centred
		// here, with no tree and no panel — asserted as the absence of both,
		// because a grid drawn around a single sentence is what this replaced.
		const app = new App();
		const pane = await openView(
			app,
			document.body,
			LayoutEditorView,
			fakePlugin(app),
		);

		const vacant = pane.contentEl.querySelector('.sheetsmith-editor-vacant');
		expect(vacant?.textContent).toContain('No layouts yet.');
		expect(vacant?.querySelector('button')?.textContent).toBe('Create layout');
		expect(pane.contentEl.querySelector('.sheetsmith-editor-panel')).toBeNull();
		expect(pane.contentEl.querySelector('.setting-item')).toBeNull();
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
			choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
			pressAdd(harness);
			await settle(harness.pane);
			expect((await harness.stored()).components).toHaveLength(3);

			expect(await undo(harness)).toBe(true);
			expect(await harness.raw()).toBe(before);
		});

		it('undoes removing a component whose children move to the sheet', async () => {
			harness = await open(nested());
			const before = await harness.raw();
			control(harness, 'remove-defences').click();
			confirmAction();
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
				`${LAYOUT_FOLDER}/Second sheet.json`,
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
				'Second sheet',
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
			choose(control<HTMLSelectElement>(harness, 'add-choice'), 'track:0');
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
			control(harness, 'remove-armour').click();
			confirmAction();
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
