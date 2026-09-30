import { describe, expect, it } from 'vitest';
import { componentReferences, renameNames } from './rename-names';

const renames = new Map([
	['hp', 'hp_2'],
	['abilities', 'abilities_2'],
	['inventory', 'inventory_2'],
]);
const none = new Set<string>();

describe('renameNames', () => {
	it('rewrites a bare name, keeping every other byte', () => {
		expect(renameNames('hp  +  1', renames, none)).toBe('hp_2  +  1');
	});

	it("rewrites a dotted name's first segment and leaves the rest", () => {
		expect(renameNames('abilities.DEX.value * 2', renames, none)).toBe(
			'abilities_2.DEX.value * 2',
		);
	});

	it("rewrites a mod. name's second segment, never the prefix", () => {
		expect(renameNames('mod.hp + mod.abilities.STR', renames, none)).toBe(
			'mod.hp_2 + mod.abilities_2.STR',
		);
	});

	it('rewrites the first argument of sum( and count(, whitespace and all', () => {
		expect(
			renameNames('sum( inventory , Weight) + count(inventory)', renames, none),
		).toBe('sum( inventory_2 , Weight) + count(inventory_2)');
	});

	it('leaves calls, self, the literals and mod.self alone', () => {
		const source = 'hp(1) + sum(self, hp) + mod.self + true + false';
		// The `hp` inside the aggregate is a per-row argument: the known limit is
		// that it is read as the component, so it is the only one rewritten.
		expect(renameNames(source, renames, none)).toBe(
			'hp(1) + sum(self, hp_2) + mod.self + true + false',
		);
	});

	it('leaves a name the component answers itself, but never an aggregate table', () => {
		const local = new Set(['hp', 'value', 'inventory']);
		expect(renameNames('hp + value + count(inventory)', renames, local)).toBe(
			'hp + value + count(inventory_2)',
		);
	});

	it('leaves a name with no rename, and a longer name sharing a prefix', () => {
		expect(renameNames('hp_max + prof + hpx', renames, none)).toBe(
			'hp_max + prof + hpx',
		);
	});

	it('returns text that does not tokenize unchanged', () => {
		expect(renameNames('hp # 1', renames, none)).toBe('hp # 1');
	});
});

describe('componentReferences', () => {
	it('names each id once per place it sits, with its own offsets', () => {
		const source = 'hp + mod.prof + sum(bag, w)';
		const found = componentReferences(source, none);
		expect(found?.map((one) => [one.id, source.slice(one.start, one.end)])).toEqual([
			['hp', 'hp'],
			['prof', 'prof'],
			['bag', 'bag'],
			['w', 'w'],
		]);
	});

	it('answers null for text that does not tokenize', () => {
		expect(componentReferences('#', none)).toBeNull();
	});
});
