import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The component isolation rule, driven through eslint itself.
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
	"import { formatDerived } from './stat-card';",
	"import { paintLevelRing } from '../components/level-ring';",
	"import { bindEditable } from '../interaction/editable';",
	"import { showPopover } from '../ui/popover';",
	"import { ComponentDefinition } from '../types';",
];

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
