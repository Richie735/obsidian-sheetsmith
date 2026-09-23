// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
	conversionMessage,
	conversionOffer,
	convertJsonLayouts,
	registerConversionOffer,
} from './layout-conversion';
import { App, Notice } from './test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from './test/plugin';

/*
 * The two doors to the conversion: the command, and the button on the notice
 * shown once per load (`docs/features/visible-layout-files.md`). What a
 * conversion does to the folder is `layouts.test.ts`'s; what is here is what a
 * reader is shown, and that pressing each door runs it.
 */

const LEGACY = '{"name":"Alpha","columns":12,"components":[]}';

async function vault(...names: string[]): Promise<App> {
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	for (const name of names) {
		await app.vault.create(`${LAYOUT_FOLDER}/${name}`, LEGACY);
	}
	return app;
}

beforeEach(() => {
	Notice.messages = [];
	Notice.instances = [];
});

describe('the command', () => {
	it('converts and reports in one notice', async () => {
		const app = await vault('Alpha.json', 'Bravo.json', 'Bravo.sheetsmith');
		await convertJsonLayouts(fakePlugin(app));

		expect(Notice.messages).toEqual([
			`Converted 1 layout to .sheetsmith. Skipped 1: "${LAYOUT_FOLDER}" already holds a .sheetsmith file under the same name, so the .json was left as it is.`,
		]);
		expect(app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)).not.toBeNull();
	});

	it('says so where there is nothing to convert', async () => {
		await convertJsonLayouts(fakePlugin(await vault('Alpha.sheetsmith')));
		expect(Notice.messages).toEqual([`No .json layouts in "${LAYOUT_FOLDER}".`]);
	});
});

describe('the notice on load', () => {
	it('counts the .json layouts, warns about other devices, and carries Convert', async () => {
		const app = await vault('Alpha.json', 'Bravo.json');
		registerConversionOffer(fakePlugin(app));

		expect(Notice.instances).toHaveLength(1);
		const notice = Notice.instances[0]!;
		expect(notice.messageEl.textContent).toBe(
			`${conversionOffer(2, LAYOUT_FOLDER)} Convert`,
		);
		expect(conversionOffer(2, LAYOUT_FOLDER)).toBe(
			`2 layouts in "${LAYOUT_FOLDER}" are still .json files, which the file explorer does not show. Update Sheetsmith on your other devices before converting: an older version reads only .json and will show every layout as missing once these sync.`,
		);
	});

	it('converts and reports when Convert is pressed, and goes away', async () => {
		const app = await vault('Alpha.json');
		registerConversionOffer(fakePlugin(app));
		const notice = Notice.instances[0]!;

		notice.messageEl.querySelector('button')!.click();
		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(notice.hidden).toBe(true);
		expect(app.vault.getFileByPath(`${LAYOUT_FOLDER}/Alpha.sheetsmith`)).not.toBeNull();
		expect(Notice.messages.at(-1)).toBe('Converted 1 layout to .sheetsmith.');
	});

	it('is not shown where the folder holds no .json layout', async () => {
		// A shadowed `.json` is not one: nothing would convert it.
		const app = await vault('Alpha.sheetsmith', 'Alpha.json');
		registerConversionOffer(fakePlugin(app));
		expect(Notice.instances).toEqual([]);
	});

	it('says one layout in the singular', () => {
		expect(conversionOffer(1, LAYOUT_FOLDER)).toMatch(
			new RegExp(`^1 layout in "${LAYOUT_FOLDER}" is still a \\.json file, `),
		);
	});
});

describe('conversionMessage', () => {
	it('says there was nothing to convert, naming the folder', () => {
		expect(
			conversionMessage({ converted: 0, skipped: 0, failed: [] }, LAYOUT_FOLDER),
		).toBe(`No .json layouts in "${LAYOUT_FOLDER}".`);
	});

	it('counts what was converted, in the singular and the plural', () => {
		expect(
			conversionMessage({ converted: 1, skipped: 0, failed: [] }, LAYOUT_FOLDER),
		).toBe('Converted 1 layout to .sheetsmith.');
		expect(
			conversionMessage({ converted: 3, skipped: 0, failed: [] }, LAYOUT_FOLDER),
		).toBe('Converted 3 layouts to .sheetsmith.');
	});

	it('adds the skipped and the failed, and opens on them where nothing converted', () => {
		expect(
			conversionMessage(
				{ converted: 2, skipped: 1, failed: ['Permission denied.', 'Busy.'] },
				LAYOUT_FOLDER,
			),
		).toBe(
			`Converted 2 layouts to .sheetsmith. Skipped 1: "${LAYOUT_FOLDER}" already holds a .sheetsmith file under the same name, so the .json was left as it is. Could not convert 2: Permission denied.`,
		);
		expect(
			conversionMessage({ converted: 0, skipped: 1, failed: [] }, LAYOUT_FOLDER),
		).toBe(
			`Skipped 1: "${LAYOUT_FOLDER}" already holds a .sheetsmith file under the same name, so the .json was left as it is.`,
		);
	});
});
