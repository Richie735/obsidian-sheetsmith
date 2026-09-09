// @vitest-environment happy-dom
/*
 * The picker over the vault's layouts (`docs/features/layout-picker.md`).
 *
 * Driven through `getSuggestions`, `renderSuggestion` and
 * `onChooseSuggestion`, which are the app's own public surface and are typed by
 * the real `obsidian` declarations — `picker.test.ts`'s position exactly. A
 * list loop inside the stub would be asserting a shape this repository
 * invented, and a case that passed against it would say nothing about the modal
 * Obsidian actually draws.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { LayoutModal, pickLayout } from './layout-picker';
import { App } from './test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from './test/plugin';

let app: App;

const give = async (path: string, content = '{}'): Promise<void> => {
	await app.vault.create(path, content);
};

const modal = (chosen: string[] = []): LayoutModal =>
	new LayoutModal(fakePlugin(app), (name) => chosen.push(name));

const names = (query = ''): string[] =>
	modal()
		.getSuggestions(query)
		.map((file) => file.basename);

/**
 * The one layout a query matches, without a cast.
 *
 * `getSuggestions` is typed by the real `obsidian` declarations, so narrowing
 * an index off it with `as TFile` is the assertion `no-tfile-tfolder-cast`
 * exists to refuse; a case that wanted exactly one row can say so instead.
 */
const only = (one: LayoutModal, query: string) => {
	const [file, ...rest] = one.getSuggestions(query);
	if (!file || rest.length > 0) {
		throw new Error(`${query} matched ${rest.length + (file ? 1 : 0)} layouts`);
	}
	return file;
};

beforeEach(async () => {
	app = new App();
	document.body.replaceChildren();
	await app.vault.createFolder(LAYOUT_FOLDER);
});

describe('the candidates', () => {
	it('lists every layout in the folder by name, sorted', async () => {
		await give(`${LAYOUT_FOLDER}/Starter PF2e.json`);
		await give(`${LAYOUT_FOLDER}/DnD 5e Standard.json`);
		await give(`${LAYOUT_FOLDER}/Starter 5e.json`);
		expect(names()).toEqual([
			'DnD 5e Standard',
			'Starter 5e',
			'Starter PF2e',
		]);
	});

	it('lists a layout whose JSON will not parse alongside the rest', async () => {
		// Filtering it out would hide a file the reader has and name nothing.
		// Pick it and the sheet reports the parser's own message in place.
		await give(`${LAYOUT_FOLDER}/Broken.json`, '{');
		await give(`${LAYOUT_FOLDER}/Starter 5e.json`);
		expect(names()).toEqual(['Broken', 'Starter 5e']);
	});

	it('lists nothing that is not a layout file', async () => {
		// The same set `loadLayout` can resolve: `.json` at the top level of the
		// configured folder and no deeper. A row the loader could not find would
		// manufacture the missing-layout state this feature exists to close.
		await give(`${LAYOUT_FOLDER}/Starter 5e.json`);
		await give(`${LAYOUT_FOLDER}/notes.md`);
		await give(`${LAYOUT_FOLDER}/Nested/Deeper.json`);
		await give('Elsewhere.json');
		expect(names()).toEqual(['Starter 5e']);
	});

	it('follows the configured folder rather than the default', async () => {
		await give(`${LAYOUT_FOLDER}/Starter 5e.json`);
		await app.vault.createFolder('Elsewhere/Sheets');
		await give('Elsewhere/Sheets/Mine.json');
		const plugin = fakePlugin(app);
		plugin.settings.layoutFolder = 'Elsewhere/Sheets';
		expect(
			new LayoutModal(plugin, () => {})
				.getSuggestions('')
				.map((file) => file.basename),
		).toEqual(['Mine']);
	});
});

describe('the list', () => {
	beforeEach(async () => {
		await give(`${LAYOUT_FOLDER}/DnD 5e Standard.json`);
		await give(`${LAYOUT_FOLDER}/Starter Forged in the Dark.json`);
	});

	it('narrows on the name', () => {
		expect(names('forged')).toEqual(['Starter Forged in the Dark']);
		// Padded and mixed case, which is the pair `starters/picker.test.ts`
		// drives against its own copy of this normalisation (PATTERNS §1's
		// two-consumer rung: the same cases over both copies, or one name).
		expect(names('  5E  ')).toEqual(['DnD 5e Standard']);
		expect(names('   ')).toHaveLength(2);
	});

	it('returns nothing for a query no name holds', () => {
		// The empty list belongs to `SuggestModal`, which draws whatever it is
		// handed: `getSuggestions` is abstract and this feature does not reopen
		// that.
		expect(names('pineapple')).toEqual([]);
	});

	it('draws a row as the name and nothing else', () => {
		const el = document.createElement('div');
		const one = modal();
		one.renderSuggestion(only(one, 'forged'), el);
		expect(el.textContent).toBe('Starter Forged in the Dark');
		expect(el.querySelector('.suggestion-title')?.textContent).toBe(
			'Starter Forged in the Dark',
		);
		// A vault's layouts are named by the reader, so there is no second line
		// and nothing to put on one.
		expect(el.querySelector('small')).toBeNull();
	});

	it('hands the caller the layout’s name, never its path', () => {
		const chosen: string[] = [];
		const one = modal(chosen);
		// One argument: the app also hands over the event that chose the row,
		// and this modal has no use for it, so it declares nothing to ignore.
		one.onChooseSuggestion(only(one, 'forged'));
		// The name `loadLayout` resolves inside the folder, and the name a
		// note's `sheet-layout` holds.
		expect(chosen).toEqual(['Starter Forged in the Dark']);
	});

	it('offers the placeholder both callers share', () => {
		expect(modal().inputEl.placeholder).toBe('Choose a layout');
	});
});

describe('pickLayout', () => {
	it('opens the modal', async () => {
		await give(`${LAYOUT_FOLDER}/Starter 5e.json`);
		pickLayout(fakePlugin(app), () => {});
		expect(document.body.querySelectorAll('.modal-container')).toHaveLength(1);
	});
});
