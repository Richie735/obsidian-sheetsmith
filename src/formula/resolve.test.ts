import { describe, expect, it } from 'vitest';
import { makeFieldResolver, resolveFormulaFields } from './resolve';

const component = { formulaFields: ['derived'] as const };
const config = {
	id: 'wis',
	type: 'stat',
	label: 'WIS',
	position: { col: 1, row: 1, width: 1, height: 1 },
};

describe('resolveFormulaFields', () => {
	it('evaluates an expression against the component data', () => {
		const resolved = resolveFormulaFields(
			component,
			{ ...config, derived: 'floor((value - 10) / 2)' } as typeof config,
			{ value: '19' },
		);
		expect(resolved.derived).toBe(4);
	});

	it('passes literal numbers through', () => {
		const resolved = resolveFormulaFields(
			component,
			{ ...config, derived: 2 } as unknown as typeof config,
			{ value: '19' },
		);
		expect(resolved.derived).toBe(2);
	});

	it('resolves to null when evaluation fails', () => {
		const resolved = resolveFormulaFields(
			component,
			{ ...config, derived: 'floor((value - 10) / 2)' } as typeof config,
			{ value: '30 sqr' },
		);
		expect(resolved.derived).toBeNull();
	});

	it('skips fields with no expression configured', () => {
		const resolved = resolveFormulaFields(component, config, { value: '19' });
		expect('derived' in resolved).toBe(false);
	});
});

describe('makeFieldResolver', () => {
	const derivedConfig = {
		...config,
		derived: 'floor((value - 10) / 2)',
	} as typeof config;

	it('layers the extra scope over the data scope', () => {
		const resolve = makeFieldResolver(component, derivedConfig, {
			value: '19',
		});
		expect(resolve('derived', {})).toBe(4);
		expect(resolve('derived', { value: '8' })).toBe(-1);
		expect(resolve('derived', { value: 16 })).toBe(3);
	});

	it('returns null for unknown fields and failed evaluations', () => {
		const resolve = makeFieldResolver(component, derivedConfig, {});
		expect(resolve('nope', {})).toBeNull();
		expect(resolve('derived', { value: 'fast' })).toBeNull();
	});
});
