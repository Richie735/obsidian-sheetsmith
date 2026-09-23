// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import { countNotesNaming } from './layout-notes';
import { App } from './test/obsidian-stub';
import { LAYOUT_KEY } from './types';

/*
 * How many notes name a layout, settled (`docs/features/visible-layout-files.md`).
 *
 * The scan's *filter* is driven through its two consumers — the migration's
 * cases and a layout rename's count — but the count's own settle arm is not:
 * every consumer case renames a layout whose name the cache answers as a string,
 * so the arm that reads a note back never ran. These drive it.
 *
 * The cache is spied rather than modelled, on `component-rename-migration.test.ts`'s
 * argument: what the real cache does with a typed scalar is a claim about
 * Obsidian this repository has no probe for.
 */

afterEach(() => {
	vi.restoreAllMocks();
});

/** The cache answering each note's `sheet-layout` with the value given for it. */
function cacheReports(app: App, values: Record<string, unknown>): void {
	vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation(
		(file) =>
			({
				frontmatter:
					file.path in values ? { [LAYOUT_KEY]: values[file.path] } : {},
			}) as unknown as ReturnType<typeof app.metadataCache.getFileCache>,
	);
}

const note = (layout: string): string =>
	`---\nsheet-layout: ${layout}\n---\n\n## Abilities\n`;

describe('countNotesNaming', () => {
	it('counts a note whose layout YAML coerced to a number, by reading it back', async () => {
		const app = new App();
		await app.vault.create('Aramil.md', note('12'));
		await app.vault.create('Bree.md', note('13'));
		cacheReports(app, { 'Aramil.md': 12, 'Bree.md': 13 });

		// Both are admitted as undecidable; only the note's own text says which
		// one names `12`.
		expect(await countNotesNaming(app as unknown as ObsidianApp, '12')).toBe(1);
	});

	it('counts a layout named null, which the cache answers as nothing at all', async () => {
		const app = new App();
		await app.vault.create('Aramil.md', note('null'));
		cacheReports(app, { 'Aramil.md': null });

		expect(await countNotesNaming(app as unknown as ObsidianApp, 'null')).toBe(1);
	});

	it('does not count an undecidable note that will not parse', async () => {
		// `sheet-layout:` with no value: the cache answers null, and the note
		// names nothing, so it is nobody's.
		const app = new App();
		await app.vault.create('Blank.md', '---\nsheet-layout:\n---\n');
		await app.vault.create('Aramil.md', note('Alpha'));
		cacheReports(app, { 'Blank.md': null, 'Aramil.md': 'Alpha' });

		expect(await countNotesNaming(app as unknown as ObsidianApp, 'Alpha')).toBe(1);
	});
});
