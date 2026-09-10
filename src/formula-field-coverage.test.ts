import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from './components';

/*
 * Every expression a component declares is typed into a field the editor checks.
 *
 * The four inputs `docs/features/formula-field-errors.md` covers are found by
 * *the field the editor drew* — the panel keys on `kind: 'formula'`, and each
 * list editor already knows which of its cells is an expression — rather than by
 * matching a `formulaFields` path, which would be a path matcher built to reach
 * four controls the editors name for free. The cost of that decision is a
 * coverage gap nothing else fails on: a component declaring a *fifth* list path
 * gets no check, and `contract.test.ts` stays green because the path is
 * perfectly well formed. This is the guard that turns that into a failure.
 *
 * **A file of its own rather than a second `describe` beside `field-formula.ts`**,
 * on `class-tokens.test.ts`'s own argument and the five standing precedents —
 * `pointer-gestures.test.ts`, `create-element-sites.test.ts`,
 * `class-tokens.test.ts`, `styles.test.ts`, `backlog.test.ts`. This check reads
 * declarations in `src/components/`, which will never import `field-formula.ts`,
 * and it would still be the right check if `field-formula.ts` were deleted
 * tomorrow.
 * Kept beside it, inlining that five-line wrapper into its two callers — an
 * ordinary simplification — would silently take a registry-wide guard with it.
 *
 * **Not `contract.test.ts`** either, though §10 sends a registry-wide rule
 * there: the list below is the *editor's* coverage, not the component contract.
 * A component may declare any well-formed path; what fails here is this feature
 * not having caught up with one, and the fix is an edit to the editor.
 */
describe('every expression a component declares is a field the editor checks', () => {
	/** The list paths whose cell the three list editors check as they draw it. */
	const COVERED = [
		'columns.*.formula',
		'fields.*.formula',
		'rows.*.values.*',
		'rows.*.count',
	];

	/** Every dotted path the registry declares, minus the reset that is cut. */
	function declaredListPaths(): string[] {
		return listComponentTypes()
			.flatMap((type) => getComponent(type)?.formulaFields ?? [])
			.filter((path) => path.includes('.') && path.split('.')[0] !== 'reset');
	}

	it('covers every dotted formula field, or is rooted at the reset that is cut', () => {
		for (const type of listComponentTypes()) {
			const component = getComponent(type);
			for (const path of component?.formulaFields ?? []) {
				// A flat key is a panel field, which the panel checks by kind.
				if (!path.includes('.')) continue;
				// `reset.*.to` is the feature's stated cut: it joins the pass over
				// `reset-field.ts`, so it is unchecked on purpose.
				if (path.split('.')[0] === 'reset') continue;
				expect(COVERED, `${type} declares ${path}`).toContain(path);
			}
		}
	});

	it('is asserting over every path it claims to cover', () => {
		// The loop above passes vacuously over a registry whose paths are all
		// flat, which is what `docs/PATTERNS.md` §10 forbids of a scan. Counted
		// as a *set*: two components declaring one shared path is one path
		// covered, and counting declarations would let three of the four go
		// unasked about while the floor still passed.
		expect(new Set(declaredListPaths()).size).toBeGreaterThanOrEqual(
			COVERED.length,
		);
	});
});
