// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { copyContext, pasteDependencies } from './paste-dependencies';
import { Layout } from '../parse/layout';
import { ComponentConfig } from '../types';

/*
 * What a copy leans on that a paste into another layout does not carry. One
 * source and one target, built so each of the six groups is hit exactly once.
 */

function at(col: number, row: number, width = 2, height = 1) {
	return { col, row, width, height };
}

/** A Hit Dice Track, copied from a 2014 layout. */
function hitDice(): ComponentConfig {
	return {
		id: 'hit_dice',
		type: 'track',
		label: 'Hit dice',
		position: at(1, 1, 4, 1),
		// `level` twice: read by two formulas, one thing.
		count: 'level + mod(con) + prof + level + half(2)',
		reset: [{ trigger: 'long rest', action: 'formula', to: 'floor(level / 2) + dex_mod' }],
	} as unknown as ComponentConfig;
}

function source(): Layout {
	return {
		name: '5e 2014',
		components: [
			hitDice(),
			{ id: 'level', type: 'card', label: 'Level', position: at(5, 1) },
			{ id: 'con', type: 'card', label: 'Constitution', position: at(7, 1) },
		],
		functions: [
			'# a comment',
			// A line that does not read, before the one that stands.
			'mod(score) = floor((',
			'mod(score) = floor((score - 10) / 2)',
			'prof = ceil(level / 4) + 1',
			'half(x) = x / 2',
		],
		triggers: ['long rest'],
		modifiers: [
			{ name: 'Ring of resilience', target: 'hit_dice', amount: '1' },
			{ name: 'Unrelated', changes: [{ target: 'level', amount: '1' }] },
			// A flat target left beside a list is ignored by the sheet, so here too.
			{ name: 'Stale', target: 'hit_dice', changes: [{ target: 'level', amount: '1' }] },
		],
	};
}

function target(): Layout {
	return {
		name: '5e 2024',
		components: [
			// Something else entirely, under the name the copy reads.
			{ id: 'level', type: 'card', label: 'Character level', position: at(1, 1) },
		],
		// `mod` differs, `prof` is identical but spaced differently, `half` is
		// missing, and nothing defines what the copy calls `con`.
		functions: ['mod(score) = floor(score / 2) - 5', 'prof=ceil(level/4)+1'],
		triggers: ['long rest'],
		modifiers: [{ name: 'Ring of resilience', target: 'level', amount: '1' }],
		modifierTypes: ['item'],
	};
}

describe('copyContext', () => {
	it('carries the lines of what the copy calls or reads bare, and the definitions aimed at it', () => {
		expect(copyContext(source(), hitDice())).toEqual({
			functions: {
				mod: 'mod(score) = floor((score - 10) / 2)',
				half: 'half(x) = x / 2',
				prof: 'prof = ceil(level / 4) + 1',
			},
			definitions: [{ name: 'Ring of resilience', targets: ['Hit dice'] }],
		});
	});
});

describe('pasteDependencies', () => {
	const found = () =>
		pasteDependencies(hitDice(), copyContext(source(), hitDice()), target());

	it('lists each group once, in the order the notice names them, and no bonus types', () => {
		expect(found().map((one) => [one.group, one.spelled])).toEqual([
			['reset', 'the "long rest" reset'],
			['definition', 'the "Ring of resilience" modifier'],
			['function-differs', 'mod()'],
			['function-missing', 'half()'],
			['name-here', 'level'],
			['name-missing', 'con'],
			['name-missing', 'dex_mod'],
		]);
	});

	it('lists a binding whose trigger the target declares, with its action and to', () => {
		const reset = found()[0];
		expect(reset?.detail).toEqual({
			kind: 'reset',
			trigger: 'long rest',
			declaredHere: true,
			bindings: [
				{ component: 'Hit dice', action: 'formula', to: 'floor(level / 2) + dex_mod' },
			],
		});
	});

	it('names a function the target lacks, and says a definition of that name is here', () => {
		const lacking: Layout = { ...target(), functions: [] };
		const listed = pasteDependencies(hitDice(), copyContext(source(), hitDice()), lacking);
		expect(listed.filter((one) => one.group === 'function-missing').map((one) => one.spelled)).toEqual([
			'mod()',
			'half()',
			// Read bare, so spelled bare: a bare read is a name.
			'prof',
		]);
		expect(found()[1]?.detail).toEqual({
			kind: 'definition',
			name: 'Ring of resilience',
			targets: ['Hit dice'],
			here: true,
		});
	});

	it('lists a function only where the target lacks it, when the copy carried no line', () => {
		const listed = pasteDependencies(hitDice(), { functions: {}, definitions: [] }, target());
		expect(listed.some((one) => one.spelled === 'mod()')).toBe(false);
		const lacking = pasteDependencies(
			hitDice(),
			{ functions: {}, definitions: [] },
			{ ...target(), functions: [] },
		);
		expect(lacking.some((one) => one.spelled === 'mod()')).toBe(true);
	});

	it('reads nothing a copy holds itself, and nothing the component answers in its own scope', () => {
		const table: ComponentConfig = {
			id: 'skills',
			type: 'table',
			label: 'Skills',
			position: at(1, 1, 6, 2),
			columns: [
				{ key: 'Bonus', type: 'number' },
				{ key: 'Total', type: 'computed', formula: 'Bonus + skills.Bonus + value' },
			],
		} as unknown as ComponentConfig;
		expect(pasteDependencies(table, { functions: {}, definitions: [] }, target())).toEqual([]);
	});
});
