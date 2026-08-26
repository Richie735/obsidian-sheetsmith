// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	SheetsmithSettings,
	SheetsmithSettingTab,
} from './settings';
import type SheetsmithPlugin from './main';
import { App } from './test/obsidian-stub';

/*
 * The settings tab, which is two preferences and a button now that the layout
 * editor has a pane of its own.
 *
 * What is left here worth a test is the folder preference, because it is not a
 * plain bind: an emptied field falls back to the default rather than storing
 * nothing, since an empty folder silently relocates layout lookup and creation
 * to the vault root — and what is on screen has to agree with what is in effect.
 * That is also one of the two things still keeping this tab off Obsidian's
 * declarative settings API, and the argument is at the top of `settings.ts`.
 *
 * The scroll-and-focus tests this file used to hold moved with the editor. Both
 * were about surviving the rebuild the editor asks for, and neither is this
 * tab's any more: the pane restores the scroll and the editor restores the
 * focus, and `editor/layout-editor.test.ts` drives the second.
 */

interface Harness {
	root: HTMLElement;
	/** The object the tab writes into, read back to see what it wrote. */
	settings: SheetsmithSettings;
	/** How many times the tab asked for the settings to be persisted. */
	saves: () => number;
}

function open(): Harness {
	const app = new App();
	let saves = 0;
	const settings: SheetsmithSettings = { ...DEFAULT_SETTINGS };
	const plugin = {
		app,
		settings,
		async saveSettings() {
			saves++;
		},
	} as unknown as SheetsmithPlugin;

	const tab = new SheetsmithSettingTab(
		app as unknown as ConstructorParameters<typeof SheetsmithSettingTab>[0],
		plugin,
	);
	document.body.replaceChildren(tab.containerEl);
	tab.display();
	return { root: tab.containerEl, settings, saves: () => saves };
}

/** The named setting rows, in order. */
function rows(root: HTMLElement): string[] {
	return Array.from(root.querySelectorAll('.setting-item-name')).map(
		(el) => el.textContent ?? '',
	);
}

/** The text input in the row with this name. */
function textIn(root: HTMLElement, name: string): HTMLInputElement {
	for (const item of Array.from(root.querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		const input = item.querySelector('input[type="text"]');
		if (input) return input as HTMLInputElement;
	}
	throw new Error(`no text field in a row named "${name}"`);
}

/** The checkbox in the row with this name. */
function checkbox(root: HTMLElement, name: string): HTMLInputElement {
	for (const item of Array.from(root.querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		const input = item.querySelector('input[type="checkbox"]');
		if (input) return input as HTMLInputElement;
	}
	throw new Error(`no toggle in a row named "${name}"`);
}

describe('what the tab offers', () => {
	it('holds the two preferences and a way into the editor, and nothing else', () => {
		// The guard on the move. The editor generated dozens of rows here, so a
		// change that put any of it back — or that grew a third preference
		// without a decision — fails on this list rather than on a screenshot.
		const harness = open();
		expect(rows(harness.root)).toEqual([
			'Layout folder',
			'Open sheets in sheet view',
			'Layout editor',
		]);
	});
});

describe('the layout folder', () => {
	it('stores what the author types, trimmed', async () => {
		const harness = open();
		const input = textIn(harness.root, 'Layout folder');
		input.value = '  Sheets/Layouts  ';
		input.dispatchEvent(new Event('input'));
		expect(harness.settings.layoutFolder).toBe('Sheets/Layouts');
		expect(harness.saves()).toBeGreaterThan(0);
	});

	it('falls back to the default when emptied, and shows what it fell back to', () => {
		// Two halves of one promise, which is why they are one test: an empty
		// folder would relocate every lookup to the vault root, so it is refused
		// — and a field left reading empty while the default is in effect is a
		// control lying about the value it holds.
		const harness = open();
		const input = textIn(harness.root, 'Layout folder');
		input.value = '   ';
		input.dispatchEvent(new Event('input'));
		expect(harness.settings.layoutFolder).toBe(DEFAULT_SETTINGS.layoutFolder);
		input.dispatchEvent(new Event('blur'));
		expect(input.value).toBe(DEFAULT_SETTINGS.layoutFolder);
	});
});

describe('opening sheets in sheet view', () => {
	it('stores the choice and persists it', () => {
		const harness = open();
		const toggle = checkbox(harness.root, 'Open sheets in sheet view');
		toggle.checked = false;
		toggle.dispatchEvent(new Event('change'));
		expect(harness.settings.openInSheetView).toBe(false);
		expect(harness.saves()).toBeGreaterThan(0);
	});
});
