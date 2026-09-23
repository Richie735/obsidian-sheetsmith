// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { App, Notice, Plugin } from '../test/obsidian-stub';
import { loadPlugin } from '../test/plugin-shell';
import { extensionTakenMessage, registerLayoutExtension } from './layout-extension';
import { VIEW_TYPE_LAYOUT_EDITOR } from './layout-editor-view';

/*
 * `.sheetsmith` registered for the layout editor, and a refusal survived
 * (`docs/features/visible-layout-files.md`).
 *
 * The refusal is the half worth driving: the app's `registerExtensions` throws
 * where any extension is taken, before registering any, so the one sentence a
 * reader gets and the registrations that must survive it are both invisible
 * until something already holds the extension.
 */

beforeEach(() => {
	Notice.messages = [];
});

function plugin(app: App): Plugin {
	return new Plugin(app, { id: 'sheetsmith', name: 'Sheetsmith', version: '0' });
}

describe('registering the layout extension', () => {
	it('registers .sheetsmith for the layout editor view', () => {
		const app = new App();
		registerLayoutExtension(plugin(app) as never);

		expect(app.viewRegistry.getTypeByExtension('sheetsmith')).toBe(
			VIEW_TYPE_LAYOUT_EDITOR,
		);
		expect(Notice.messages).toEqual([]);
	});

	it('names the view that holds it where another plugin got there first', () => {
		const app = new App();
		app.viewRegistry.registerExtensions(['sheetsmith'], 'someone-elses-view');

		expect(() => registerLayoutExtension(plugin(app) as never)).not.toThrow();
		expect(Notice.messages).toEqual([
			'Another plugin already opens .sheetsmith files (view "someone-elses-view"), so selecting a layout file will not open the layout editor. Run "Open layout editor" instead.',
		]);
		expect(app.viewRegistry.getTypeByExtension('sheetsmith')).toBe(
			'someone-elses-view',
		);
	});

	it('drops the parenthesis where the registry cannot say whose it is', () => {
		expect(extensionTakenMessage(null)).toBe(
			'Another plugin already opens .sheetsmith files, so selecting a layout file will not open the layout editor. Run "Open layout editor" instead.',
		);
	});

	it('comes off again on unload, so a hot reload can register it again', () => {
		const app = new App();
		const first = plugin(app);
		first.load();
		registerLayoutExtension(first as never);
		first.unload();

		registerLayoutExtension(plugin(app) as never);
		expect(Notice.messages).toEqual([]);
	});
});

describe('the plugin’s own onload', () => {
	it('registers the view first and the extension last', async () => {
		const app = new App();
		const loaded = await loadPlugin(app);
		const record = (loaded as unknown as Plugin).registrations;

		const view = record.indexOf(`registerView:${VIEW_TYPE_LAYOUT_EDITOR}`);
		expect(view).toBeGreaterThanOrEqual(0);
		expect(record.at(-1)).toBe('registerExtensions:sheetsmith');
		expect(view).toBeLessThan(record.length - 1);
	});

	it('registers everything else even where the extension is refused', async () => {
		const clean = await loadPlugin(new App());
		const expected = (clean as unknown as Plugin).registrations;

		const app = new App();
		app.viewRegistry.registerExtensions(['sheetsmith'], 'someone-elses-view');
		const refused = await loadPlugin(app);

		// The same calls in the same order: the throw came from the last one and
		// was caught inside it.
		expect((refused as unknown as Plugin).registrations).toEqual(expected);
		expect((refused as unknown as Plugin).commands.map((c) => c.id)).toContain(
			'convert-json-layouts',
		);
		expect(Notice.messages).toEqual([
			extensionTakenMessage('someone-elses-view'),
		]);
	});
});
