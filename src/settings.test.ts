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
 * The settings tab, which is three preferences and a button now that the layout
 * editor has a pane of its own.
 *
 * What is worth a test here is the two folder preferences, because neither is a
 * plain bind and they are not plain binds in the same way. An emptied *layout*
 * folder falls back to the default rather than storing nothing, since an empty
 * folder silently relocates layout lookup and creation to the vault root — and
 * what is on screen has to agree with what is in effect. An emptied *character*
 * folder stores the empty string and stays visibly empty, because there empty
 * is the value the reader chose and means the app's own **Default location for
 * new notes** answers. The two cases below assert opposite things on purpose and
 * are kept in one file for that reason: they are one decision read twice, and
 * `docs/features/character-folder.md` is where it is argued.
 *
 * That pair is why both folder rows are `render` definitions rather than
 * `control`s now that the tab is on Obsidian's declarative settings API: a
 * `control` is read and written by the framework, and neither of these two is a
 * plain bind. The argument is at the top of `settings.ts`, and
 * `docs/features/declarative-settings.md` § The floor is why the tab renders by
 * two paths — which is also why `open()` takes one.
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

/**
 * Render the tab.
 *
 * `'definitions'` is the 1.13 path and the default, because it is what a reader
 * on a current Obsidian gets: `update()` stores `getSettingDefinitions()` and
 * the framework paints it. `'fallback'` is the tab's own `display()`, which is
 * the only path below 1.13 and dead code above it — so the cases that name it
 * are the only thing standing between that method and shipping broken.
 */
function open(path: 'definitions' | 'fallback' = 'definitions'): Harness {
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
	if (path === 'definitions') tab.update();
	else tab.display();
	return { root: tab.containerEl, settings, saves: () => saves };
}

/** The tab's definitions, unrendered — what Obsidian indexes for search. */
function definitions(): ReturnType<SheetsmithSettingTab['getSettingDefinitions']> {
	const settings: SheetsmithSettings = { ...DEFAULT_SETTINGS };
	const plugin = { app: new App(), settings } as unknown as SheetsmithPlugin;
	const tab = new SheetsmithSettingTab(plugin.app, plugin);
	return tab.getSettingDefinitions();
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

/** The rendered description of the row with this name. */
function descOf(root: HTMLElement, name: string): string {
	for (const item of Array.from(root.querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		return item.querySelector('.setting-item-description')?.textContent ?? '';
	}
	throw new Error(`no row named "${name}"`);
}

/** The button in the row with this name. */
function buttonIn(root: HTMLElement, name: string): HTMLButtonElement {
	for (const item of Array.from(root.querySelectorAll('.setting-item'))) {
		if (item.querySelector('.setting-item-name')?.textContent !== name) continue;
		const button = item.querySelector('button');
		if (button) return button;
	}
	throw new Error(`no button in a row named "${name}"`);
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
	it('holds the three preferences and a way into the editor, and nothing else', () => {
		// The guard on the move. The editor generated dozens of rows here, so a
		// change that put any of it back — or that grew a fourth preference
		// without a decision — fails on this list rather than on a screenshot.
		//
		// **Grown rather than relaxed**, which is the whole value of the list:
		// the character folder was a decision (SPEC §7, and the argument it
		// amends in `docs/features/layout-picker.md` §1), so it is named here
		// and in the order it is drawn in — directly under the folder it is read
		// beside, and above a toggle about how a sheet opens.
		const harness = open();
		expect(rows(harness.root)).toEqual([
			'Layout folder',
			'Character folder',
			'Open sheets in sheet view',
			'Layout editor',
		]);
	});

	it('draws the same four rows through the pre-1.13 fallback', () => {
		/*
		 * `display()` is what Obsidian below 1.13 calls, and `manifest.json`'s
		 * floor is 1.9.0 — accurate for every other line in the plugin, so it
		 * stays there and the tab carries both paths. On a current Obsidian this
		 * method is never reached, which is exactly why it needs a case: a
		 * fallback nothing exercises is a fallback nobody knows is broken, and
		 * the reader it breaks for is the one who has not updated.
		 *
		 * The rows are asserted rather than the controls because both paths walk
		 * the same `rows()` array and hand each row the same prepared `Setting`.
		 * What could differ is this loop, and what it would lose is a whole row.
		 */
		const harness = open('fallback');
		expect(rows(harness.root)).toEqual([
			'Layout folder',
			'Character folder',
			'Open sheets in sheet view',
			'Layout editor',
		]);
		// And every control is really there, so "four rows" is not four headings.
		// All four, because one missing `render` call is what this loop could lose
		// and a row keeps its name either way.
		expect(textIn(harness.root, 'Layout folder').value).toBe(
			DEFAULT_SETTINGS.layoutFolder,
		);
		expect(textIn(harness.root, 'Character folder').placeholder).toBe(
			'Same as new notes',
		);
		expect(checkbox(harness.root, 'Open sheets in sheet view').checked).toBe(
			DEFAULT_SETTINGS.openInSheetView,
		);
		expect(buttonIn(harness.root, 'Layout editor').textContent).toBe(
			'Open layout editor',
		);
	});

	it('keeps every row name in sentence case, which the linter can no longer read', () => {
		/*
		 * **The check this feature took away, put back narrower.**
		 * `obsidianmd/ui/sentence-case` reads the *argument* of `setName`/`setDesc`
		 * and a `name:` property in a definition object is not one, so all four
		 * rows left the rule's reach the moment the tab became declarative — a
		 * fifth row typed "Open Layout Editor" would have shipped green.
		 * `PATTERNS.md` §8 lists sentence case as [warned], and its tier contract
		 * is that departing from a warned rule means changing the check first.
		 *
		 * **Names only, deliberately.** A description here carries a quoted app
		 * label path — `Settings → Files and links → Default location for new
		 * notes` — whose capitals are Obsidian's own, and proper nouns besides.
		 * That collision is what the deleted `ignoreRegex: ['→']` exemption
		 * existed for, and reproducing the real rule's judgement badly is worse
		 * than leaving descriptions to review. A row name is short, carries no
		 * arrow, and is where Title Case actually creeps in.
		 *
		 * A future name with a genuine proper noun in it turns this red. That is
		 * the loud direction and the answer is to widen it on purpose, not to
		 * have never noticed.
		 */
		const rows = definitions();
		// Its own floor, not the sibling case's: a loop over an empty array is a
		// pass, and the `toHaveLength(4)` that would have caught it lives in the
		// next case down.
		expect(rows).toHaveLength(4);
		for (const def of rows) {
			const { name } = def as { name: string };
			expect(name.slice(0, 1), name).toBe(name.slice(0, 1).toUpperCase());
			expect(name.slice(1), name).toBe(name.slice(1).toLowerCase());
		}
	});

	it('describes every row to the app, which is what puts it in settings search', () => {
		/*
		 * **The one assertion that is about the definitions rather than the DOM**,
		 * and the reason it is worth its own case: everything else in this file
		 * renders and reads markup, so it would pass just as well if the rows were
		 * still drawn by hand. What Obsidian 1.13 indexes for search is the
		 * *definition* — `name`, `desc`, and `aliases` — and it never looks at the
		 * control, so a row that renders correctly and declares nothing is exactly
		 * the failure this feature existed to fix and the one nothing else here
		 * would notice.
		 *
		 * A `desc` is asserted as well as a `name` because it is half the index. A
		 * reader searching **Settings** for "missing layout" or "new notes" is
		 * matching description text, not a row title.
		 */
		const tab = definitions();
		expect(tab).toHaveLength(4);
		for (const def of tab) {
			const row = def as { name?: string; desc?: string | DocumentFragment };
			expect(row.name, JSON.stringify(row.name)).toBeTruthy();
			// A fragment counts, and is how the sheet-view row's description is
			// built; search reads its `textContent` the same way.
			const desc =
				typeof row.desc === 'string' ? row.desc : (row.desc?.textContent ?? '');
			expect(desc, row.name).not.toBe('');
		}
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

describe('the character folder', () => {
	it('stores what the author types, trimmed', async () => {
		const harness = open();
		const input = textIn(harness.root, 'Character folder');
		input.value = '  Characters/Party  ';
		input.dispatchEvent(new Event('input'));
		expect(harness.settings.characterFolder).toBe('Characters/Party');
		expect(harness.saves()).toBeGreaterThan(0);
	});

	it('ships empty, which is the value that means the app answers', () => {
		// The default is the argument this feature amends, kept as the shipped
		// behaviour: an untouched install creates characters exactly where every
		// other note-creating gesture in the app does.
		expect(DEFAULT_SETTINGS.characterFolder).toBe('');
		const harness = open();
		expect(textIn(harness.root, 'Character folder').value).toBe('');
	});

	it('carries the row’s own name as the field’s accessible name', () => {
		// Obsidian draws a row's name in a sibling element rather than a
		// `<label for>`, so without this the accessible name falls through to
		// the placeholder and a screen reader never says *character*. The row's
		// visible words to the letter, which is what WCAG 2.5.3 asks: `textIn`
		// finds the field by that name, so this asserts the two agree.
		const harness = open();
		expect(
			textIn(harness.root, 'Character folder').getAttribute('aria-label'),
		).toBe('Character folder');
	});

	it('holds each app label in the description together', () => {
		/*
		 * `AGENTS.md` asks for arrow notation, and the labels in such a path are
		 * the app's own. A wrap inside one turns "Files and links" into a line
		 * ending "Files and" and a line opening "links →", which reads as a step
		 * named "links" — so the spaces *inside* each multi-word label are
		 * non-breaking and the ones around the arrows are not. Asserted on the
		 * rendered text, because the whole failure is a line break.
		 */
		const harness = open();
		const desc = descOf(harness.root, 'Character folder');
		expect(desc).toContain('Settings → Files\u00a0and\u00a0links');
		expect(desc).toContain('Default\u00a0location\u00a0for\u00a0new\u00a0notes');
	});

	it('stays empty when emptied, on screen as well as in the settings', () => {
		/*
		 * The mirror of the layout folder case above, asserting the opposite on
		 * purpose. There an emptied field means the default is in effect, so the
		 * value is written back and the box stops reading empty. Here empty *is*
		 * the value, so nothing is written back at all.
		 *
		 * **A field of spaces is the only state that can tell the two apart, so
		 * it is where the `blur` is asserted.** An emptied box over an empty
		 * setting agrees with itself either way — a copied
		 * `setValue(settings.characterFolder)` would write `''` over `''` — so a
		 * `blur` asserted there pins nothing, which is what this case used to
		 * do. Three spaces store as `''` while the box still reads them, and
		 * that disagreement is what a re-display would erase.
		 */
		const harness = open();
		const input = textIn(harness.root, 'Character folder');
		input.value = 'Characters';
		input.dispatchEvent(new Event('input'));
		expect(harness.settings.characterFolder).toBe('Characters');

		// A field of spaces is the same gesture with a slower hand, and it means
		// the same thing to the setting.
		input.value = '   ';
		input.dispatchEvent(new Event('input'));
		expect(harness.settings.characterFolder).toBe('');

		// The discriminating half: nothing touches the box on blur, so what the
		// author typed is still in it and the setting still holds the empty
		// value it trimmed to.
		input.dispatchEvent(new Event('blur'));
		expect(harness.settings.characterFolder).toBe('');
		expect(input.value).toBe('   ');

		// And the gesture the criterion names — clear the field, click away —
		// leaves the box visibly empty rather than filled with a fallback.
		input.value = '';
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
		expect(harness.settings.characterFolder).toBe('');
		expect(input.value).toBe('');
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
