import { describe, expect, it } from 'vitest';
import {
	evaluate,
	FormulaError,
	RESERVED_NAMES,
	Scope,
} from './expression';
import { parseFunctions } from './functions';

const empty: Scope = () => undefined;
const scope =
	(values: Record<string, number | boolean | string>): Scope =>
	(name) =>
		values[name];

/** Evaluate against a library, the way a card's formula field does. */
function withLibrary(
	source: string,
	definitions: string[],
	names: Record<string, number | boolean | string> = {},
): unknown {
	const { library } = parseFunctions(definitions);
	const base = scope(names);
	return evaluate(source, base, { library, base });
}

describe('parseFunctions', () => {
	it('reads the 5e library from the spec', () => {
		const { library, problems } = parseFunctions([
			'mod(score) = floor((score - 10) / 2)',
			'prof       = ceil(level / 4) + 1',
		]);
		expect(problems).toEqual([]);
		expect([...library.keys()]).toEqual(['mod', 'prof']);
		expect(library.get('mod')?.params).toEqual(['score']);
		expect(library.get('prof')?.params).toEqual([]);
	});

	it('ignores blank lines and comments', () => {
		const { library, problems } = parseFunctions([
			'# The 5e ability modifier',
			'',
			'   ',
			'mod(score) = floor((score - 10) / 2)',
		]);
		expect(problems).toEqual([]);
		expect(library.size).toBe(1);
	});

	it('takes several parameters', () => {
		const { library, problems } = parseFunctions(['clamp(v, lo) = max(v, lo)']);
		expect(problems).toEqual([]);
		expect(library.get('clamp')?.params).toEqual(['v', 'lo']);
	});

	it('reports a definition with no "="', () => {
		const { library, problems } = parseFunctions(['mod(score)']);
		expect(library.size).toBe(0);
		expect(problems[0]?.message).toMatch(/name\(a, b\) = expression/);
	});

	it('does not split a definition down the middle of "=="', () => {
		const { problems } = parseFunctions(['trained == 1']);
		expect(problems).toHaveLength(1);
	});

	it('reports a body that will not parse, naming the line', () => {
		const { library, problems } = parseFunctions(['mod(score) = floor((score']);
		expect(library.size).toBe(0);
		expect(problems[0]?.source).toBe('mod(score) = floor((score');
	});

	it('refuses to redefine a builtin', () => {
		const { library, problems } = parseFunctions(['floor(x) = x', 'if(x) = x']);
		expect(library.size).toBe(0);
		expect(problems).toHaveLength(2);
		expect(problems[0]?.message).toMatch(/built in/);
	});

	it('reports a bad parameter name', () => {
		const { problems } = parseFunctions(['mod(2score) = 1']);
		expect(problems[0]?.message).toMatch(/parameter name/);
	});

	it('reports a parameter named twice', () => {
		const { problems } = parseFunctions(['sum(a, a) = a']);
		expect(problems[0]?.message).toMatch(/twice/);
	});

	it('keeps the first of two definitions sharing a name', () => {
		const { library, problems } = parseFunctions([
			'mod(score) = 1',
			'mod(score) = 2',
		]);
		expect(evaluate('mod(0)', empty, { library })).toBe(1);
		expect(problems[0]?.message).toMatch(/already defined/);
	});

	it('numbers a problem by the line as typed, comments included', () => {
		// A textarea has no gutter, so the number is only useful if it counts
		// the lines the user can see — blanks and comments among them.
		const { problems } = parseFunctions([
			'# 5e',
			'',
			'mod(score) = floor((score - 10) / 2)',
			'broken( = 1',
		]);
		expect(problems[0]?.line).toBe(4);
		expect(problems[0]?.source).toBe('broken( = 1');
	});

	it('keeps the functions around a definition it could not read', () => {
		// One typo costs its own line and nothing else: the rest of the
		// library still works, and the sheet still renders.
		const { library, problems } = parseFunctions([
			'mod(score) = floor((score - 10) / 2)',
			'broken( = 1',
			'prof = 3',
		]);
		expect([...library.keys()]).toEqual(['mod', 'prof']);
		expect(problems).toHaveLength(1);
	});
});

describe('calling layout functions', () => {
	it('computes the spec worked example', () => {
		expect(
			withLibrary('mod(score)', ['mod(score) = floor((score - 10) / 2)'], {
				score: 19,
			}),
		).toBe(4);
	});

	it('reads a no-argument function as a bare name', () => {
		expect(
			withLibrary('prof', ['prof = ceil(level / 4) + 1'], { level: 5 }),
		).toBe(3);
	});

	it('lets one function call another', () => {
		expect(
			withLibrary('save(14)', [
				'mod(score) = floor((score - 10) / 2)',
				'save(score) = mod(score) + prof',
				'prof = 2',
			]),
		).toBe(4);
	});

	it('shadows sheet names with a parameter', () => {
		// The body says `score`, and means its own argument, not the sheet's.
		expect(
			withLibrary('mod(19)', ['mod(score) = floor((score - 10) / 2)'], {
				score: 8,
			}),
		).toBe(4);
	});

	it('does not let a body read the caller’s own scope', () => {
		// A function is not a macro. `value` is the calling card's, and the
		// body must not see it, or the same call means different things on
		// different cards.
		const { library } = parseFunctions(['half(x) = floor(x / 2) + value']);
		const caller = scope({ value: 100 });
		expect(() =>
			evaluate('half(8)', caller, { library, base: () => undefined }),
		).toThrow(/value/);
	});

	it('lets a body read the sheet', () => {
		// `prof` reading `level` is the whole point of a library.
		expect(withLibrary('prof', ['prof = ceil(level / 4) + 1'], { level: 9 })).toBe(
			4,
		);
	});

	it('reports the wrong number of arguments', () => {
		expect(() => withLibrary('mod(1, 2)', ['mod(score) = score'])).toThrow(
			/takes 1 argument, got 2/,
		);
		expect(() => withLibrary('mod()', ['mod(score) = score'])).toThrow(
			/takes 1 argument, got 0/,
		);
	});

	it('refuses a function defined in terms of itself', () => {
		expect(() => withLibrary('loop(1)', ['loop(x) = loop(x)'])).toThrow(
			/defined in terms of itself/,
		);
	});

	it('refuses a pair of functions defined in terms of each other', () => {
		expect(() =>
			withLibrary('a(1)', ['a(x) = b(x)', 'b(x) = a(x)']),
		).toThrow(FormulaError);
	});

	it('lets a sheet name win over a function of the same name', () => {
		// A component id and a zero-argument function sharing a name is an
		// authoring mistake either way; the component keeps its meaning.
		expect(withLibrary('prof', ['prof = 99'], { prof: 3 })).toBe(3);
	});

	it('still reports an unknown function', () => {
		expect(() => withLibrary('nope(1)', ['mod(x) = x'])).toThrow(/nope/);
	});

	it('says how to call a function written without its arguments', () => {
		// "Unknown name" would send the reader hunting a typo that is not
		// there: the name is defined, just not as a value.
		expect(() => withLibrary('mod + 1', ['mod(score) = score'])).toThrow(
			/call it as mod\(score\)/,
		);
	});

	it('calls the same function twice in one expression', () => {
		// The self-reference guard is per call chain, not per evaluation: two
		// sibling calls are not a cycle.
		expect(
			withLibrary('mod(19) + mod(8)', ['mod(score) = floor((score - 10) / 2)']),
		).toBe(3);
	});
});

/*
 * SPEC §5: a layout may not redefine a standard helper, since a formula
 * reading `floor` must mean the one thing everywhere.
 *
 * For the helpers themselves that rule is now structural — RESERVED_NAMES is
 * derived from the BUILTINS table's keys, so a helper cannot be added to one
 * and missed in the other. What is left hand-written is the three names that
 * are not table entries: `if`, which is lazy and lives in evalNode, and the
 * two literals the parser reads directly. Those are what these tests cover,
 * plus a cheap smoke check that the derivation still holds end to end.
 */
describe('reserved names and builtins agree', () => {
	/** Literals the parser reads before it looks any name up. */
	const LITERALS = ['true', 'false'];
	/** Lazy, so evalNode handles it rather than callBuiltin. */
	const LAZY = ['if'];

	it('answers to every name it reserves', () => {
		for (const name of RESERVED_NAMES) {
			if (LITERALS.includes(name) || LAZY.includes(name)) continue;
			expect(() => evaluate(`${name}(1)`, empty)).not.toThrow(
				/Unknown function/,
			);
		}
	});

	it('reserves the three names that are not builtins', () => {
		// The derivation cannot cover these, so they are the ones that can
		// drift: `if` gaining a reserved entry it never had, or losing one.
		for (const name of [...LITERALS, ...LAZY]) {
			expect(RESERVED_NAMES).toContain(name);
		}
	});

	it('refuses to define any of them', () => {
		for (const name of RESERVED_NAMES) {
			const { library, problems } = parseFunctions([`${name}(a) = a`]);
			expect(library.size).toBe(0);
			expect(problems[0]?.message).toMatch(/built in/);
		}
	});

	it('lets a layout define a name that is not reserved', () => {
		// The guard above must not be satisfied by refusing everything.
		expect(parseFunctions(['half(x) = x / 2']).library.size).toBe(1);
	});

	it('keeps the literals unusable as function names', () => {
		for (const name of LITERALS) {
			expect(evaluate(name, empty)).toBe(name === 'true');
		}
	});

	it('does not mistake an inherited property for a builtin', () => {
		// The table is a Map for this reason. On an object literal these four
		// reach Object.prototype, and the reader is told "constructor() takes
		// undefined arguments" instead of that no such function exists — the
		// same hazard the field resolver spells out its own-property check for.
		for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
			expect(() => evaluate(`${name}(1)`, empty)).toThrow(
				new RegExp(`Unknown function "${name}"`),
			);
		}
	});

	it('reports arity the same way for fixed and variadic helpers', () => {
		// The table replaced a switch that spelled these two messages in two
		// places; they are the wording a card shows on hover.
		expect(() => evaluate('floor(1, 2)', empty)).toThrow(
			/floor\(\) takes 1 argument\./,
		);
		expect(() => evaluate('min()', empty)).toThrow(
			/min\(\) needs at least one argument\./,
		);
	});
});
