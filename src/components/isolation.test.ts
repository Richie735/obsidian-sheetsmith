import { ESLint } from 'eslint';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** `src/`, for the one check here that is a scan rather than an eslint case. */
const SRC = fileURLToPath(new URL('..', import.meta.url));

/*
 * The rules about what a component may import, driven through eslint itself.
 *
 * Two of them: no sibling component, and only `setIcon` from `obsidian`.
 *
 * docs/PATTERNS.md §1 marks "no component imports a sibling component" as
 * [checked], and CLAUDE.md tells every session that eslint enforces it. This is
 * the test that makes those two statements true, and it exists because they
 * were not: the rule restricted the pattern './*' only, so
 * `import { pool } from '../components/pool'` passed clean. That is not an
 * exotic spelling — it is how src/editor/ and the tests name this folder, so it
 * is what arrives on a copy-paste.
 *
 * Worse, `.` and `../components` both resolve to the registry, and reaching the
 * registry is the strongest form of the violation: `getComponent('pool')` hands
 * back every sibling at once.
 *
 * A rule that half-holds is the case a review is told never to leave standing,
 * and the reason it stood is instructive: when the rule was added it was
 * verified — with one import, in one spelling, which passed. Enumerating the
 * spellings is the only way this stays honest, so they are enumerated here
 * rather than in a comment.
 */

const RULE = 'no-restricted-imports';

/** Both resolved from this file, so the test does not depend on the cwd. */
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const AS_COMPONENT = fileURLToPath(new URL('./pool.ts', import.meta.url));

/**
 * Lint a snippet as though it were a component.
 *
 * The path has to be a file the TypeScript project already knows, because the
 * shared config resolves types through `projectService` and a made-up path
 * fails to parse. `pool.ts` stands in for any component; the rule is scoped to
 * the folder, not to the file.
 */
async function lintAsComponent(source: string): Promise<string[]> {
	const eslint = new ESLint({ cwd: REPO });
	const [result] = await eslint.lintText(`${source}\n`, {
		filePath: AS_COMPONENT,
	});
	const parseErrors = (result?.messages ?? []).filter((m) => m.ruleId === null);
	// Otherwise an unparseable snippet reports no restricted imports and the
	// assertion below reads as "allowed" when nothing was examined at all.
	expect(parseErrors.map((m) => m.message)).toEqual([]);
	return (result?.messages ?? [])
		.filter((m) => m.ruleId === RULE)
		.map((m) => m.message);
}

/** Every spelling that reaches a sibling, or the registry that holds them all. */
const FORBIDDEN = [
	"import { pool } from './pool';",
	"import { pool } from '../components/pool';",
	"import { getComponent } from './index';",
	"import { getComponent } from '../components/index';",
	"import { getComponent } from '.';",
	"import * as registry from '../components';",
];

/** Shared modules a component is meant to reach, in both spellings. */
const ALLOWED = [
	"import { paintLevelRing } from './level-ring';",
	"import { TOTALLED_TYPES } from './column-types';",
	"import { isFlagSet } from './stored-flag';",
	"import { isFlagSet } from '../components/stored-flag';",
	"import { TOTALLED_TYPES } from '../components/column-types';",
	"import { formatDerived } from './card-face';",
	"import { paintLinkedText } from './linked-text';",
	"import { modifierBreakdown } from './modifier-breakdown';",
	// The form a modifier glyph opens: a shared component-layer surface, in no
	// registry and declaring no component. Added to the allowlist deliberately,
	// which is what that tier means.
	"import { renderModifierForm } from './modifier-form';",
	// The reading a value pill shows once modifiers are applied: four policies
	// Card and Card set had a copy of each, extracted on the second consumer
	// because drift between two copies of a policy is the whole risk (§1).
	"import { effectiveReading } from './effective-value';",
	"import { effectiveReading } from '../components/effective-value';",
	"import { MODIFIED_CLASS } from '../components/modifier-breakdown';",
	"import { paintLinkedText } from '../components/linked-text';",
	"import { paintLevelRing } from '../components/level-ring';",
	"import { bindEditable } from '../interaction/editable';",
	"import { showPopover } from '../ui/popover';",
	"import { ComponentDefinition } from '../types';",
];

/** What a component may take from the app, and what it may not. */
const FROM_OBSIDIAN = {
	allowed: ["import { setIcon } from 'obsidian';"],
	refused: [
		// An App is the route to the vault, and a component is handed its data.
		"import { App } from 'obsidian';",
		// The shared confirmation. A component has no App to open one into, which
		// is the reason the delete gesture arms instead (UI.md §9).
		"import { Modal } from 'obsidian';",
		"import { Notice } from 'obsidian';",
		"import { TFile } from 'obsidian';",
		// Even alongside the allowed one: the allowlist is per name, not per file.
		"import { setIcon, Modal } from 'obsidian';",
		"import * as obsidian from 'obsidian';",
	],
};

describe('a component cannot import a sibling', () => {
	it.each(FORBIDDEN)('refuses %s', async (source) => {
		expect(await lintAsComponent(source)).not.toEqual([]);
	});
});

describe('a component can still import what it is meant to', () => {
	it.each(ALLOWED)('allows %s', async (source) => {
		expect(await lintAsComponent(source)).toEqual([]);
	});
});

/**
 * Every `.ts` file under `dir`, and which of them `matches`.
 *
 * **It returns the count as well as the hits, and every caller asserts a floor on
 * it.** §10's rule is that a test which could pass vacuously must assert it is
 * testing something, and an absence scan is the shape most exposed to it: the
 * whole assertion is `toEqual([])`, which an empty walk satisfies perfectly. A
 * missing directory throws, so the realistic failure is *narrowing* rather than
 * zeroing — this file moving one level down would silently scan a subtree and go
 * on reporting green over whatever it no longer reads, while `PATTERNS.md` §2
 * cites it as the thing making a rule [checked].
 *
 * `skipTests` because two of the three callers are about what *shipping* code
 * reaches for, and a test file standing in for another layer is entitled to
 * spellings the layer it doubles owns.
 */
function scan(
	dir: string,
	matches: (source: string) => boolean,
	skipTests = false,
): { files: number; hits: string[] } {
	let files = 0;
	const hits: string[] = [];
	for (const name of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, name.name);
		if (name.isDirectory()) {
			const inner = scan(path, matches, skipTests);
			files += inner.files;
			hits.push(...inner.hits);
			continue;
		}
		if (!name.name.endsWith('.ts')) continue;
		if (skipTests && name.name.endsWith('.test.ts')) continue;
		files += 1;
		if (matches(readFileSync(path, 'utf8'))) hits.push(name.name);
	}
	return { files, hits };
}

describe('the app\'s own menu is imported nowhere in src', () => {
	/*
	 * **The `Menu` import is gone from `src/` entirely**, and this is what says so.
	 * It lived in `ui/check-menu.ts`, which was the only shape available while the
	 * modifier cell's popup was Obsidian's own menu: `Menu` closes on selection and
	 * `MenuItem` takes a title, an icon and a click, so it hosts no controls at all
	 * — and the cell now opens a *form* with six labelled controls in it.
	 * `ui/anchored-panel.ts` is plain DOM, so nothing imports it any more.
	 *
	 * A source scan rather than an eslint case, because what is being checked is an
	 * *absence across a folder* and not a rule about one file: eslint can refuse an
	 * import in `components/`, and `src/ui/` sits outside that restriction on
	 * purpose. This is the check that would go red if the next floating surface
	 * reached for the menu again.
	 */
	it('imports Menu and MenuItem in no file under src', () => {
		// The import statement, never the word: `Menu` appears in prose in several
		// headers arguing why it is *not* used, and a scan that matched those could
		// never go green.
		const imported = (source: string): boolean => {
			for (const match of source.matchAll(
				/^import\s*\{([^}]*)\}\s*from\s*'obsidian';/gm,
			)) {
				const names = (match[1] ?? '').split(',').map((one) => one.trim());
				if (names.includes('Menu') || names.includes('MenuItem')) return true;
			}
			return false;
		};
		const { files, hits } = scan(SRC, imported);
		// The floor is the breadth: `src/` holds well over a hundred `.ts` files, so
		// a walk that read a subtree instead would fail here rather than reporting
		// green over whatever it stopped reading.
		expect(files).toBeGreaterThan(100);
		expect(hits).toEqual([]);
	});
});

describe('a cell part is parsed in one place, on the formula side of the seam', () => {
	/*
	 * **Two readings of one part's text is the one way this design could have the
	 * form and the number disagree**, so the rule is that a component *spells* a
	 * part and never *reads* one: `spellTypedEffect` because Table writes the cell,
	 * and every field the form draws off `ModifierContext.outcome`, which the
	 * formula layer has already resolved.
	 *
	 * A scan and not an eslint case, for the `Menu` check's reason one paragraph up:
	 * what is checked is an *absence across a folder*, and the module being reached
	 * for is one a component is otherwise entitled to import — `parse/modifier-cell.ts`
	 * is where the separator, the join and the spelling live, and Table needs all
	 * three.
	 *
	 * **Test files are outside it, and that is a decision rather than an oversight.**
	 * `table.test.ts` calls `parseModifierPart` to build a stand-in for
	 * `sheetModifiers` — it is playing the formula layer, which is the one caller
	 * entitled to parse. What holds the real agreement is the round trip over
	 * `spellTypedEffect` then `parseModifierPart` and `vault-fixture.test.ts` driving
	 * the real context.
	 */
	const parses = (source: string) => source.includes('parseModifierPart');

	it('is named in exactly two files under src, and they are the right two', () => {
		/*
		 * **Over all of `src/` rather than over `components/`**, which is wider than
		 * the criterion's own wording and costs nothing: only the file that *defines*
		 * the parse and the one layer entitled to call it name it at all, so the
		 * allowlist is two entries and every other folder is covered for free. Scoped
		 * to `components/` it would have missed a second parse landing in `editor/`,
		 * `view/` or `ui/` — none of which is entitled to one either, and each of
		 * which is somewhere a future surface could plausibly put it.
		 *
		 * An exact list rather than an emptiness check, so the *positive* half is
		 * asserted too: a scan that stopped finding `formula/modifier-definitions.ts`
		 * would mean the parse had moved, and reporting green for that is the vacuous
		 * pass §10 forbids.
		 */
		const { files, hits } = scan(SRC, parses, true);
		expect(files).toBeGreaterThan(60);
		expect(hits.sort()).toEqual(['modifier-cell.ts', 'modifier-definitions.ts']);
	});
});

describe('a refusal sentence is written in one place', () => {
	/*
	 * **The predicates were extracted and the sentences were not**, which is §1's
	 * named trap and the shape it already records happening once with
	 * `--sheetsmith-grid-row` "in the same diff that cited this rule". Three files
	 * held verbatim copies of two refusals, and all three headers claimed that could
	 * not happen — "reused verbatim, so a reader who meets the rule twice meets one
	 * sentence", which a comment cannot make true.
	 *
	 * The failure a scan catches and a test cannot: a design pass softens the
	 * wording in one file, the layout editor's report shows the new sentence and the
	 * panel where the reader is typing the name shows the old one, and nothing goes
	 * red because every copy still matches its own assertion.
	 *
	 * Written against the distinctive clause of each sentence rather than the whole
	 * of it, so a reworded copy is caught as surely as a duplicated one.
	 */
	const CLAUSES = [
		'separates the modifiers it applies with a semicolon',
		'spells its own modifiers that way',
		'Give it a name to reuse it by',
		'already has a modifier called',
	] as const;

	it.each(CLAUSES)('writes "%s" once in src', (clause) => {
		const { files, hits } = scan(SRC, (source) => source.includes(clause), true);
		expect(files).toBeGreaterThan(50);
		expect(hits).toHaveLength(1);
	});
});

describe('a component takes only what it is allowed from obsidian', () => {
	/*
	 * An allowlist rather than a convention, because the cost of the first such
	 * import was invisible until it was paid: the stub is the whole of `obsidian`
	 * under vitest, it installed DOM helpers on load, and three node-environment
	 * test files broke on import the moment a component reached it. A named
	 * exception is a decision; a precedent is not.
	 */
	it.each(FROM_OBSIDIAN.allowed)('allows %s', async (source) => {
		expect(await lintAsComponent(source)).toEqual([]);
	});

	it.each(FROM_OBSIDIAN.refused)('refuses %s', async (source) => {
		expect(await lintAsComponent(source)).not.toEqual([]);
	});
});
