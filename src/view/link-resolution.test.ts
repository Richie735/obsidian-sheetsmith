// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { linkDestination, resolvesLink } from './link-resolution';

/*
 * The one spelling of "does this link name a note", which the sheet's link
 * context and the layout editor's markdown pass both call. What is the module's
 * own is the linkpath step: a target's `#heading` and `|alias`-free text is
 * looked up, so a link to a heading in a note resolves as the note does.
 */
describe('resolvesLink', () => {
	it('resolves a link to a note the vault holds, heading and all', async () => {
		const app = new App();
		await app.vault.create('Torch.md', '');
		expect(resolvesLink(app, 'Torch', 'Characters/Aramil.md')).toBe(true);
		expect(resolvesLink(app, 'Torch#Lighting', 'Characters/Aramil.md')).toBe(true);
	});

	it('does not resolve a link to a note nobody wrote', async () => {
		const app = new App();
		await app.vault.create('Torch.md', '');
		expect(resolvesLink(app, 'Sample note', 'Sheetsmith layouts/Prose.sheetsmith')).toBe(false);
	});

	it('hands back the file a link names, which a picture draws, and null for none', async () => {
		const app = new App();
		const portrait = await app.vault.create('Sildar.png', '');
		expect(linkDestination(app, 'Sildar.png', 'Characters/Aramil.md')).toBe(portrait);
		expect(linkDestination(app, 'Sildar.png#crop', 'Characters/Aramil.md')).toBe(portrait);
		expect(linkDestination(app, 'Missing.png', 'Characters/Aramil.md')).toBeNull();
	});
});

/*
 * The lookup is spelled in one place, and a scan holds it there, on
 * `view/grid-cells.test.ts`'s flag scan: a third caller asking the metadata
 * cache itself is the drift this module was extracted to end (PATTERNS §1),
 * and it is findable only by reading files side by side (§10). The test stub
 * declares the member and tests call it, so both are left out.
 */
describe('the vault lookup', () => {
	const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

	/** Every shipping source file under `src/`, tests and the test stub excluded. */
	function sources(): string[] {
		const found: string[] = [];
		const walk = (dir: string): void => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const at = join(dir, entry.name);
				if (entry.isDirectory()) {
					if (at !== join(ROOT, 'test')) walk(at);
				} else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
					found.push(at);
				}
			}
		};
		walk(ROOT);
		return found;
	}

	it('is called only in the module that owns it', () => {
		const calling = sources()
			.filter((path) => readFileSync(path, 'utf8').includes('getFirstLinkpathDest('))
			.map((path) => path.slice(ROOT.length + 1));
		// The floor is the call itself: a walk that read nothing, or a module
		// that stopped calling it, would otherwise pass by finding no one.
		expect(sources().length).toBeGreaterThan(20);
		expect(calling).toEqual(['view/link-resolution.ts']);
	});
});
