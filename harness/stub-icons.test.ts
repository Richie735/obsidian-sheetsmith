// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { setIcon } from '../src/test/obsidian-stub';

/*
 * Every icon the plugin asks for is one the instrument can draw.
 *
 * `src/test/obsidian-stub.ts` carries hand-copied Lucide paths, and an icon it
 * has no entry for falls back to painting the icon's *name* as text. That is a
 * kind fallback for a unit test — `data-icon` is still set, so assertions pass —
 * and a hostile one for the harness, which is where appearance is reviewed: a
 * reorder control shipped reading "chevron-up ⌄", the literal name beside the
 * wrong glyph, and the whole control including its disabled first and last
 * states could not be reviewed at all.
 *
 * `docs/UI.md` §11 asks that the instrument agree with the thing. It is usually
 * the *kinder* instrument that is dangerous; this is the other direction, and it
 * costs a review rather than passing a bad one — but it costs the review
 * silently, which is why it wants a check rather than a note.
 *
 * Here rather than beside the stub because `src/test/` holds scaffolding and
 * never test cases (`docs/PATTERNS.md` §2), and this is a guard on the
 * instrument, which is what `harness/` is.
 */

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Every icon name the plugin passes to `setIcon`, as written. */
function requested(): string[] {
	const found = new Set<string>();
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const at = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(at);
				continue;
			}
			if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
			const source = readFileSync(at, 'utf8');
			// `setIcon(el, 'name')` and Obsidian's `.setIcon('name')` builder,
			// which is the spelling every Setting row uses.
			for (const match of source.matchAll(/setIcon\(\s*(?:[\w.]+,\s*)?'([a-z0-9-]+)'/g)) {
				found.add(match[1] as string);
			}
			// The ternary form, `open ? 'chevron-down' : 'chevron-right'`, which
			// the loop above only catches the first arm of.
			for (const match of source.matchAll(
				/setIcon\(\s*[\w.?:'\s-]*?'([a-z0-9-]+)'\s*\)/g,
			)) {
				found.add(match[1] as string);
			}
		}
	};
	walk(join(ROOT, 'src'));
	return [...found].sort();
}

describe('the stub can draw every icon the plugin asks for', () => {
	it('finds the calls it is meant to be checking', () => {
		// A walk or a pattern that stopped matching would pass the check below by
		// having nothing in it. `trash` is the plugin's oldest icon and the one
		// most likely to outlive any refactor of this scan.
		const names = requested();
		expect(names.length).toBeGreaterThan(4);
		expect(names).toContain('trash');
	});

	it('draws each one as an svg rather than as its own name', () => {
		const painted = requested().map((icon) => {
			const el = document.createElement('div');
			setIcon(el, icon);
			return { icon, drew: el.querySelector('svg') !== null };
		});
		expect(painted.filter(({ drew }) => !drew).map(({ icon }) => icon)).toEqual(
			[],
		);
	});
});
