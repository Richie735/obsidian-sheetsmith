import { describe, expect, it } from 'vitest';
import { getComponent, listComponentTypes } from './index';

/*
 * Registry-wide contract checks (SPEC §4.1).
 *
 * These run against every registered component, so adding one to the registry
 * without satisfying the contract fails here rather than at runtime in a view.
 * Behaviour specific to a component, including its read/write round-trip,
 * belongs in that component's own test file.
 */

const KINDS = [
	'text',
	'number',
	'boolean',
	'formula',
	'select',
	'attributes',
];

/** Config keys the layout editor owns. A component must not redeclare them. */
const RESERVED_KEYS = ['id', 'type', 'label', 'position', 'reset'];

const types = listComponentTypes();

describe('component registry', () => {
	it('has at least one component registered', () => {
		expect(types.length).toBeGreaterThan(0);
	});

	it('registers each type exactly once', () => {
		expect(new Set(types).size).toBe(types.length);
	});
});

describe.each(types)('component "%s"', (type) => {
	const component = getComponent(type);

	it('is retrievable from the registry', () => {
		expect(component).toBeDefined();
	});

	it('declares a type matching its registry key', () => {
		expect(component?.type).toBe(type);
	});

	it('declares a storage kind fixed by the contract', () => {
		expect(['fenced', 'markdown']).toContain(component?.storage);
	});

	it('implements read, write, and render', () => {
		expect(typeof component?.read).toBe('function');
		expect(typeof component?.write).toBe('function');
		expect(typeof component?.render).toBe('function');
	});

	it('declares formulaFields and configFields', () => {
		expect(Array.isArray(component?.formulaFields)).toBe(true);
		expect(Array.isArray(component?.configFields)).toBe(true);
	});

	it('gives every config field a key, a label, and a known kind', () => {
		for (const field of component?.configFields ?? []) {
			expect(field.key).toBeTruthy();
			expect(field.label).toBeTruthy();
			expect(KINDS).toContain(field.kind);
		}
	});

	it('gives every select field a non-empty options list', () => {
		for (const field of component?.configFields ?? []) {
			if (field.kind === 'select') {
				expect(field.options ?? []).not.toHaveLength(0);
			}
		}
	});

	it('declares no duplicate config field keys', () => {
		const keys = (component?.configFields ?? []).map((f) => f.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('does not redeclare a config key the layout editor owns', () => {
		for (const field of component?.configFields ?? []) {
			expect(RESERVED_KEYS).not.toContain(field.key);
		}
	});

	it('exposes every formula field as a formula config field', () => {
		// Otherwise the field accepts an expression the editor cannot edit.
		const editable = (component?.configFields ?? [])
			.filter((f) => f.kind === 'formula')
			.map((f) => f.key);
		for (const field of component?.formulaFields ?? []) {
			expect(editable).toContain(field);
		}
	});
});
