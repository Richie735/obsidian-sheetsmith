import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * No code reads text back out of a composed name
 * (`docs/features/published-name-labels.md`).
 *
 * `formula/name-label.ts` is the one place a published name's parts become
 * text, and the half a module cannot hold for itself is the other direction: a
 * caller taking a composed `Abilities · Strength` apart again by its
 * separator. That is how the form's change list read its targets before this
 * feature, splitting `targetLabel` at the first ` · ` — which takes a label as
 * its identity the moment a label holds the separator, and is invisible in
 * review because the code reads as ordinary string handling.
 *
 * So every non-test `.ts` under `src/` is scanned for `split`, `indexOf`,
 * `lastIndexOf`, `includes`, `startsWith` or `endsWith` called with the
 * separator, spelled as a literal or as `BREADCRUMB`. The right answer is
 * empty, so the scan is proved on planted sources rather than on a count
 * (`docs/BACKLOG.md` § Patterns, on scans asserting their own narrowness).
 */

const SRC = new URL('./', import.meta.url);

/** Every non-test `.ts` under `src/`, by path relative to it. */
function sources(dir = SRC, prefix = ''): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(dir)) {
		const url = new URL(entry, dir);
		if (statSync(url).isDirectory()) {
			found.push(...sources(new URL(`${entry}/`, dir), `${prefix}${entry}/`));
		} else if (entry.endsWith('.ts') && !entry.includes('.test.')) {
			found.push(`${prefix}${entry}`);
		}
	}
	return found;
}

/** A search or a split on the separator: the literal in either quote, or the constant. */
const READS_SEPARATOR =
	/\.(?:split|indexOf|lastIndexOf|includes|startsWith|endsWith)\(\s*(?:'\s·\s'|"\s·\s"|`\s·\s`|BREADCRUMB\b)/;

/** The lines of one source that read text back out of a composed name. */
function readings(text: string): number[] {
	return text
		.split('\n')
		.map((line, at) => (READS_SEPARATOR.test(line) ? at + 1 : null))
		.filter((at): at is number => at !== null);
}

describe('reading a composed name back apart', () => {
	it('finds a split or a search on the separator in each spelling, and nothing that only joins', () => {
		expect(readings("const at = outcome.targetLabel.indexOf(' · ');")).toEqual([1]);
		expect(readings('label.split(" · ")')).toEqual([1]);
		expect(readings('label.includes(` · `)')).toEqual([1]);
		expect(readings('label.lastIndexOf(BREADCRUMB)')).toEqual([1]);
		expect(readings("if (a.startsWith(' · ')) {}\nb.endsWith(' · ');")).toEqual([1, 2]);
		// Joining parts is what the composer does; it is not a reading.
		expect(readings("parts.join(' · ');")).toEqual([]);
		expect(readings('parts.join(BREADCRUMB);')).toEqual([]);
		expect(readings("label.split(', ')")).toEqual([]);
	});

	it('is done nowhere in src/', () => {
		const files = sources();
		// The walk reached the modules that compose names and the ones that used
		// to split them, so an empty answer is about them.
		expect(files).toContain('formula/name-label.ts');
		expect(files).toContain('components/stat-block.ts');
		const found = files
			.map((path) => ({ path, lines: readings(readFileSync(new URL(path, SRC), 'utf8')) }))
			.filter(({ lines }) => lines.length > 0)
			.map(({ path, lines }) => `${path}:${lines.join(',')}`);
		expect(found).toEqual([]);
	});
});
