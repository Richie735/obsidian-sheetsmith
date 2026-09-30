import { describe, expect, it } from 'vitest';
import { KeptLayout, UnsavedLayouts } from './unsaved-layouts';

/*
 * The plugin's store of layouts a pane let go of unsaved
 * (`docs/features/unsaveable-layout.md` §4), driven directly. What it does to a
 * pane — the put-back, the byte check, the notices — is `layout-editor.test.ts`'s
 * and `layout-file-events.test.ts`'s; this holds the map's own four promises.
 */

const ENTRY: KeptLayout = {
	reason: 'write',
	message: 'disk full',
	base: '{"name":"A"}\n',
	text: '{"name":"A","columns":6}\n',
};

describe('the store of unsaved layouts', () => {
	it('hands an entry back once, by the path it was kept under', () => {
		const store = new UnsavedLayouts();
		store.keep('Layouts/A.sheetsmith', ENTRY);
		expect(store.peek('Layouts/B.sheetsmith')).toBeUndefined();
		expect(store.take('Layouts/A.sheetsmith')).toEqual(ENTRY);
		expect(store.take('Layouts/A.sheetsmith')).toBeUndefined();
	});

	it('moves an entry with a rename, and moves nothing where nothing is kept', () => {
		const store = new UnsavedLayouts();
		store.keep('Layouts/A.sheetsmith', ENTRY);
		store.rename('Layouts/Other.sheetsmith', 'Elsewhere/Other.sheetsmith');
		store.rename('Layouts/A.sheetsmith', 'Elsewhere/B.sheetsmith');
		expect(store.entries()).toEqual([['Elsewhere/B.sheetsmith', ENTRY]]);
	});

	it('keeps nothing once the plugin has stopped', () => {
		const store = new UnsavedLayouts();
		store.stopped = true;
		store.keep('Layouts/A.sheetsmith', ENTRY);
		expect(store.entries()).toEqual([]);
	});
});
