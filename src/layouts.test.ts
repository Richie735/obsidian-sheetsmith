// @vitest-environment happy-dom
/*
 * The two members that answer "is there anything to pick, and what do we say
 * when there is not" (`docs/features/layout-picker.md`).
 *
 * A file for this module at last, and deliberately only for these two: the rest
 * of `layouts.ts` is driven by the consumers that were written with it —
 * `createLayout` through `starters/picker.test.ts`, `appendModifierDefinition`
 * through `view/promote-flow.test.ts`, `loadLayout`'s two answers through the
 * cut they decide in `view/pick-layout-flow.test.ts`, and
 * `installLayoutSource` through **both** of its own — `starters/picker.test.ts`
 * for the starter that delegates to it and `editor/layout-import.test.ts` for
 * the pasted layout, which is the pair the ordering it holds exists for
 * (`docs/features/layout-import-export.md`). What is here is what has
 * no consumer of its own to be observable through: a predicate and a sentence,
 * which `docs/PATTERNS.md` §1's one-step tier put in one place precisely
 * because two copies could only ever be tested for still agreeing.
 *
 * happy-dom because `obsidian` resolves to the stub, whose `TFolder` and
 * `Vault` are what a folder listing is read out of.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { hasLayouts, noLayoutsMessage } from './layouts';
import { App } from './test/obsidian-stub';
import { LAYOUT_FOLDER } from './test/plugin';

let app: App;

const vault = () => app as unknown as ObsidianApp;

beforeEach(() => {
	app = new App();
});

describe('hasLayouts', () => {
	it('is false where the folder does not exist', () => {
		// Cold start: the plugin has never written the folder and neither has
		// the reader.
		expect(hasLayouts(vault(), LAYOUT_FOLDER)).toBe(false);
	});

	it('is false where the folder exists and holds no layout', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/notes.md`, 'not a layout');
		expect(hasLayouts(vault(), LAYOUT_FOLDER)).toBe(false);
	});

	it('is true where the folder holds one', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Starter 5e.json`, '{}');
		expect(hasLayouts(vault(), LAYOUT_FOLDER)).toBe(true);
	});

	it('answers about the folder it is asked about', async () => {
		// The folder is configurable, so a reader who moved the setting must not
		// be told about the one they left.
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/Starter 5e.json`, '{}');
		expect(hasLayouts(vault(), 'Elsewhere/Sheets')).toBe(false);
	});
});

describe('noLayoutsMessage', () => {
	it('names the folder that was looked in and the command that fills it', () => {
		expect(noLayoutsMessage('Elsewhere/Sheets')).toBe(
			'No layouts in "Elsewhere/Sheets" yet. Run "Add a starter layout" from the command palette to get one.',
		);
	});
});
