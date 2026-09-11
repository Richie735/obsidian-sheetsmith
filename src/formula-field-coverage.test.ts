import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from './components';

/*
 * Every expression a component declares is typed into a field the editor checks.
 *
 * The inputs `docs/features/formula-field-errors.md` and
 * `docs/features/reset-and-modifier-render-validation.md` cover are found by
 * *the field the editor drew* — the panel keys on `kind: 'formula'`, and each
 * list editor already knows which of its cells is an expression — rather than by
 * matching a `formulaFields` path, which would be a path matcher built to reach
 * controls the editors name for free. The cost of that decision is a
 * coverage gap nothing else fails on: a component declaring a *sixth* list path
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
 * **The list below is now two features' coverage, not one.** Every field it
 * names is also a field the name suggester binds
 * (`docs/features/formula-name-suggestions.md` §1), because both are answered by
 * the same fact: the editor knows which of its cells holds an expression. So a
 * component declaring a sixth list path fails here for two reasons at once —
 * that expression is neither checked as it is typed nor completed as it is
 * typed — and the fix is one edit to the editor either way.
 *
 * **Not `contract.test.ts`** either, though §10 sends a registry-wide rule
 * there: the list below is the *editor's* coverage, not the component contract.
 * A component may declare any well-formed path; what fails here is this feature
 * not having caught up with one, and the fix is an edit to the editor.
 */
describe('every expression a component declares is a field the editor checks', () => {
	/**
	 * The list paths whose cell an editor checks as it draws it: the three list
	 * editors, and `reset-field.ts` for the fourth.
	 *
	 * **`reset.*.to` was exempted here and no longer is.** It was
	 * `formula-field-errors.md`'s stated cut, skipped by a filter and a
	 * `continue` that said so — and once
	 * `docs/features/reset-and-modifier-render-validation.md` made
	 * `reset-field.ts` check it at render and on commit, that exemption was a
	 * hole in this guard exactly where the new code is: deleting the
	 * render-time call would have left this green. A cut written into a check
	 * has to be retired by the pass that closes it, which is the whole reason
	 * the exemption was spelled out rather than implied.
	 */
	const COVERED = [
		'columns.*.formula',
		'fields.*.formula',
		'rows.*.values.*',
		'rows.*.count',
		'reset.*.to',
	];

	/** Every dotted path the registry declares. */
	function declaredListPaths(): string[] {
		return listComponentTypes()
			.flatMap((type) => getComponent(type)?.formulaFields ?? [])
			.filter((path) => path.includes('.'));
	}

	it('covers every dotted formula field', () => {
		for (const type of listComponentTypes()) {
			const component = getComponent(type);
			for (const path of component?.formulaFields ?? []) {
				// A flat key is a panel field, which the panel checks by kind.
				if (!path.includes('.')) continue;
				expect(COVERED, `${type} declares ${path}`).toContain(path);
			}
		}
	});

	it('is asserting over every path it claims to cover', () => {
		// The loop above passes vacuously over a registry whose paths are all
		// flat, which is what `docs/PATTERNS.md` §10 forbids of a scan. Counted
		// as a *set*: two components declaring one shared path is one path
		// covered, and counting declarations would let four of the five go
		// unasked about while the floor still passed.
		//
		// **The floor is exactly tight — five declared against five covered,
		// no slack — and that is the guard working rather than a fragility.**
		// It goes red the moment `COVERED` names a path no component declares,
		// which is the other way this list can be wrong: a check claiming to
		// cover something nothing has ever asked about. So a red here is read
		// as "an entry was added that no component declares", not as flake.
		expect(new Set(declaredListPaths()).size).toBeGreaterThanOrEqual(
			COVERED.length,
		);
	});
});
