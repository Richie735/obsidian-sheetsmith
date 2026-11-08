import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * **A list field's reorder and remove controls name their item**
 * (`docs/UI.md` §6), held by a scan rather than by review now that two list
 * fields spell such labels: `list-fields.ts` and `nested-list-field.ts`, which
 * shares the arrows through `reorderArrows` and spells its own remove.
 *
 * Every `aria-label` in `src/editor/` opening with Move, Remove or Reorder must
 * interpolate something, and the scan counts the ones that do and fails on
 * none, so it cannot pass vacuously (`docs/PATTERNS.md` §10).
 */

const DIR = new URL('.', import.meta.url);
const LABEL = /'aria-label':\s*(['`])((?:Move|Remove|Reorder)\b[^'`]*)\1/g;

describe('the reorder and remove controls of a list field', () => {
	it('name the item they act on', () => {
		const unnamed: string[] = [];
		let named = 0;
		for (const file of readdirSync(DIR)) {
			if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
			const source = readFileSync(new URL(file, DIR), 'utf8');
			for (const match of source.matchAll(LABEL)) {
				if (match[1] === '`' && (match[2] ?? '').includes('${')) named++;
				else unnamed.push(`${file}: ${match[2] ?? ''}`);
			}
		}
		expect(named).toBeGreaterThan(3);
		expect(unnamed).toEqual([]);
	});
});
