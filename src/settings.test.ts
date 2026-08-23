// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SheetsmithSettingTab } from './settings';
import type SheetsmithPlugin from './main';
import { Layout, serialiseLayout } from './parse/layout';
import { ComponentConfig } from './types';
import { App } from './test/obsidian-stub';

/*
 * The settings tab's own job, which is not the layout editor's: keeping the
 * scroll position and the focused control across the redraw the editor asks for.
 *
 * `layout-editor.test.ts` drives the editor through a redraw of its own that
 * restores neither, because neither is the editor's to restore — it hands the
 * tab a `redraw` callback and the tab owns what survives it. So the convention
 * every control follows, a `data-sheetsmith-focus` token, is only actually load
 * bearing here, and this is the only place it can be driven.
 */

const FOLDER = 'Sheetsmith layouts';

/** A layout with a container, whose form has the fields that redraw. */
function fixture(): Layout {
	return {
		name: 'Test sheet',
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
		triggers: ['Long rest'],
	};
}

interface Harness {
	tab: SheetsmithSettingTab;
	root: HTMLElement;
	/** Let the tab's own async layout render settle. */
	settle: () => Promise<void>;
}

async function open(): Promise<Harness> {
	const app = new App();
	await app.vault.createFolder(FOLDER);
	await app.vault.create(
		`${FOLDER}/Test sheet.json`,
		serialiseLayout(fixture()),
	);
	const plugin = {
		app,
		settings: { ...DEFAULT_SETTINGS, layoutFolder: FOLDER },
		async saveSettings() {},
	} as unknown as SheetsmithPlugin;

	const tab = new SheetsmithSettingTab(
		app as unknown as ConstructorParameters<typeof SheetsmithSettingTab>[0],
		plugin,
	);
	document.body.replaceChildren(tab.containerEl);
	const settle = async () => {
		for (let i = 0; i < 20; i++) {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		}
	};
	tab.display();
	await settle();
	return { tab, root: tab.containerEl, settle };
}

/** The control the tab addresses by this focus token. */
function control<T extends HTMLElement = HTMLElement>(
	root: HTMLElement,
	token: string,
): T {
	const el = root.querySelector(`[data-sheetsmith-focus="${token}"]`);
	if (!el) throw new Error(`no control for "${token}"`);
	return el as T;
}

/** The checkbox in the setting row with this name. */
function checkbox(root: HTMLElement, name: string): HTMLInputElement {
	for (const item of Array.from(root.querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		const input = item.querySelector('input[type="checkbox"]');
		if (input) return input as HTMLInputElement;
	}
	throw new Error(`no toggle in a row named "${name}"`);
}

let harness: Harness;

describe('a control that redraws the tab', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness.root, 'edit-defences').click();
		await harness.settle();
	});

	it('keeps focus across the redraw when it is a dropdown', async () => {
		// The kind that has always redrawn, so it holds the mechanism the
		// checkbox above depends on: if this one breaks the fault is the tab's
		// restore, not the checkbox's token.
		harness = await open();
		control(harness.root, 'edit-abilities').click();
		await harness.settle();

		const select = control<HTMLSelectElement>(
			harness.root,
			'cfg-abilities-direction',
		);
		select.focus();
		select.value = 'vertical';
		select.dispatchEvent(new Event('change'));
		await harness.settle();

		expect(document.activeElement).toBe(
			control(harness.root, 'cfg-abilities-direction'),
		);
	});

	it('gives a checkbox the token the redraw would need', () => {
		// **This holds the precondition, not the behaviour, and the difference
		// is worth stating.** A boolean that decides another field's visibility
		// redraws the tab, and a control the tab cannot address by token is a
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
		const toggle = checkbox(harness.root, 'Hide the heading');
		expect(toggle.dataset.sheetsmithFocus).toBeTruthy();
		expect(control(harness.root, toggle.dataset.sheetsmithFocus ?? '')).toBe(
			toggle,
		);
	});
});
