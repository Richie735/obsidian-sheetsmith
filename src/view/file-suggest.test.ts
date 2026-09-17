// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachFileSuggest } from './file-suggest';
// From 'obsidian', not the stub directly: the vitest alias substitutes the
// stub's implementation for this specifier at runtime, so the type this file
// checks against is the real declaration and the class that actually runs is
// the double — `formula-suggest.test.ts`'s own convention.
import { App } from 'obsidian';

/** A vault holding a few files, one of them nested. */
async function vault(): Promise<App> {
	const app = new App();
	await app.vault.create('Thora.png', '');
	await app.vault.create('Sildar Hallwinter.png', '');
	await app.vault.create('Notes.md', '');
	await app.vault.createFolder('Portraits');
	await app.vault.create('Portraits/Aramil.png', '');
	return app;
}

/** A bound input, and the commits it reports. */
async function bound(sourcePath = '') {
	const app = await vault();
	const input = document.createElement('input');
	input.type = 'text';
	document.body.appendChild(input);
	const commits: string[] = [];
	// Attached before the field is focused, so the suggester's own `focus`
	// listener is registered in time to see it — the ordering
	// `picture-frame.ts`'s render actually produces, since `suggestFile` is
	// called once at creation and every focus after that is a later gesture.
	const suggest = attachFileSuggest(
		app,
		input,
		(next) => commits.push(next),
		sourcePath,
	);
	input.focus();
	return { app, input, suggest, commits };
}

/** Type into the field the way a keyboard does. */
function type(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.dispatchEvent(new Event('input'));
}

/** What the popup is showing: each item's own visible text. */
function offered(): string[] {
	return Array.from(
		document.body.querySelectorAll('.suggestion-container .suggestion-item'),
	).map((item) => item.textContent ?? '');
}

function key(input: HTMLInputElement, name: string): void {
	input.dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
}

beforeEach(() => {
	document.body.replaceChildren();
});

describe('what the popup offers', () => {
	it('lists every vault file on focus, unfiltered by extension', async () => {
		const { input } = await bound();
		expect(offered()).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Thora.png'),
				expect.stringContaining('Sildar Hallwinter.png'),
				expect.stringContaining('Notes.md'),
				expect.stringContaining('Aramil.png'),
			]),
		);
		void input;
	});

	it('narrows to files matching the typed name', async () => {
		const { input } = await bound();
		type(input, 'thora');
		expect(offered()).toEqual([expect.stringContaining('Thora.png')]);
	});

	it('matches while editing an existing embed, brackets and all', async () => {
		const { input } = await bound();
		type(input, '![[Aram');
		expect(offered()).toEqual([expect.stringContaining('Aramil.png')]);
	});

	it('matches inside a stored size hint, ignoring it', async () => {
		const { input } = await bound();
		type(input, '![[Thora.png|200x300]]');
		expect(offered()).toEqual([expect.stringContaining('Thora.png')]);
	});

	it('shows the folder for a file that is not at the vault root', async () => {
		const { input } = await bound();
		type(input, 'aramil');
		const item = document.body.querySelector('.suggestion-item');
		expect(item?.classList.contains('mod-complex')).toBe(true);
		expect(item?.querySelector('.suggestion-note')?.textContent).toBe('Portraits');
	});

	it('draws no folder note for a file at the vault root', async () => {
		const { input } = await bound();
		type(input, 'thora');
		const item = document.body.querySelector('.suggestion-item');
		expect(item?.classList.contains('mod-complex')).toBe(false);
		expect(item?.querySelector('.suggestion-note')).toBeNull();
	});
});

describe('accepting a suggestion', () => {
	it('writes the embed and commits it, on a selection', async () => {
		const { input, commits } = await bound();
		type(input, 'thora');
		key(input, 'Enter');
		expect(input.value).toBe('![[Thora.png]]');
		expect(commits).toEqual(['![[Thora.png]]']);
	});

	it('links rather than embeds a note', async () => {
		const { input, commits } = await bound();
		type(input, 'notes');
		key(input, 'Enter');
		expect(input.value).toBe('[[Notes]]');
		expect(commits).toEqual(['[[Notes]]']);
	});

	it('closes the popup on a selection', async () => {
		const { input } = await bound();
		type(input, 'thora');
		key(input, 'Enter');
		expect(offered()).toEqual([]);
	});

	it('resolves the link against the character note\'s own path, not the vault root', async () => {
		// `generateMarkdownLink`'s own `sourcePath` is "used to compute relative
		// links" — the app's own real behaviour for a paste into a note that is
		// not at the vault root, which is every note in a folder. Threaded
		// through rather than left `''`, on the same value `sheet-view.ts`
		// already computes for `linkContext` and `markdown.begin`.
		const { app, input } = await bound('Characters/Thora.md');
		const spy = vi.spyOn(app.fileManager, 'generateMarkdownLink');
		type(input, 'thora');
		key(input, 'Enter');
		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({ path: 'Thora.png' }),
			'Characters/Thora.md',
		);
	});
});

describe('what it declares about itself', () => {
	it('marks the field as offering a list', async () => {
		const { input } = await bound();
		expect(input.getAttribute('aria-autocomplete')).toBe('list');
	});
});
