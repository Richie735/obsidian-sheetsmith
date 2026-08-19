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
	'text-list',
	'attributes',
	'track-rows',
	'rows',
	'columns',
];

/** Config keys the layout editor owns. A component must not redeclare them. */
const RESERVED_KEYS = ['id', 'type', 'label', 'position', 'reset'];

/**
 * The order a component declares its members in (docs/PATTERNS.md §3): the
 * contract first, then the data path in the order it actually runs, then
 * rendering last because it is the longest.
 *
 * Checked rather than left to review because it is invisible in one. A member
 * in the wrong place reads perfectly well on its own — Pool and Track both put
 * `applyReset` before `write` and neither looked wrong — and the cost is only
 * ever paid later, by the reader who learns one component and then cannot find
 * their place in the next.
 */
const MEMBER_ORDER = [
	'type',
	'storage',
	'formulaFields',
	'configFields',
	'read',
	'scopeValues',
	'write',
	'hasBuffer',
	'applyReset',
	'render',
];

const types = listComponentTypes();

describe('component registry', () => {
	it('has at least one component registered', () => {
		expect(types.length).toBeGreaterThan(0);
	});

	it('registers each type exactly once', () => {
		expect(new Set(types).size).toBe(types.length);
	});

	it('declares enough config fields for the per-field checks to mean anything', () => {
		// Every config field rule below runs inside a per-component loop over
		// `configFields`. A registry that stopped handing them out would pass
		// all of them by iterating nothing at all, so assert the loops have
		// something to look at before trusting that they looked.
		const fields = types.flatMap(
			(type) => getComponent(type)?.configFields ?? [],
		);
		expect(fields.length).toBeGreaterThan(25);
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

	it('publishes scope values as a function, or not at all', () => {
		// An optional member: a component either publishes values to the rest
		// of the sheet's formulas or it does not, never something in between
		// that the view would have to guard against.
		expect(['function', 'undefined']).toContain(typeof component?.scopeValues);
	});

	it('applies resets as a function, or not at all', () => {
		expect(['function', 'undefined']).toContain(typeof component?.applyReset);
	});

	it('declares reset.to as a formula field when it resets', () => {
		// `reset` is shared config, so it is forbidden in configFields and
		// each stateful component has to remember this string for itself —
		// three copies of one truth by the time Pool, Track, and Toggle
		// exist. Forget it and `isDeclared` returns null for reset.to, the
		// resolver hands back nothing, and the reset silently does nothing
		// at all. Cheaper to fail here than to debug a dead button.
		if (component?.applyReset === undefined) return;
		expect(component.formulaFields).toContain('reset.*.to');
	});

	it('declares formulaFields and configFields', () => {
		expect(Array.isArray(component?.formulaFields)).toBe(true);
		expect(Array.isArray(component?.configFields)).toBe(true);
	});

	it('gives every config field a key, a label, a known kind, and a description', () => {
		// The description is not decoration: the layout editor renders it as
		// the only explanation of what the setting does to the note, and a
		// field without one is a field the author has to guess at.
		for (const field of component?.configFields ?? []) {
			expect(field.key).toBeTruthy();
			expect(field.label).toBeTruthy();
			expect(KINDS).toContain(field.kind);
			expect(field.description).toBeTruthy();
		}
	});

	it('gives every select field a non-empty options list', () => {
		for (const field of component?.configFields ?? []) {
			if (field.kind === 'select') {
				expect(field.options ?? []).not.toHaveLength(0);
			}
		}
	});

	it('declares its members in the order §3 fixes', () => {
		const declared = Object.keys(component ?? {});
		// Only the ones this component has, in the order it has them. A
		// component omitting scopeValues or applyReset is not a finding; one
		// declaring render before read is.
		const known = declared.filter((name) => MEMBER_ORDER.includes(name));
		const expected = MEMBER_ORDER.filter((name) => declared.includes(name));
		expect(known).toEqual(expected);
	});

	it('declares nothing outside the contract', () => {
		// Otherwise the order check above silently stops covering a member,
		// and the registry grows a field nothing else knows to look for.
		const declared = Object.keys(component ?? {});
		expect(declared.filter((name) => !MEMBER_ORDER.includes(name))).toEqual(
			[],
		);
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

	it('exposes every formula field as a config field the editor renders', () => {
		// Otherwise the field accepts an expression the editor cannot edit.
		// A formula field may be a dotted path into a list field, where each
		// expression is edited inside that list's own editor rather than as a
		// setting of its own; there, the path's first segment has to be the
		// list field, which is what the editor renders.
		// Unless the path is rooted at a key the editor already owns. `reset.to`
		// is an expression on shared config, rendered beside label and position
		// by the editor itself — and the check above forbids the component from
		// declaring `reset`, so requiring it here would make the two rules
		// unsatisfiable together for every stateful component.
		const fields = component?.configFields ?? [];
		const editable = fields.filter((f) => f.kind === 'formula').map((f) => f.key);
		const declared = fields.map((f) => f.key);
		for (const field of component?.formulaFields ?? []) {
			if (field.includes('.')) {
				const root = field.split('.')[0] as string;
				if (RESERVED_KEYS.includes(root)) continue;
				expect(declared).toContain(root);
			} else {
				expect(editable).toContain(field);
			}
		}
	});

	it('uses "*" only as a whole path segment in a formula field', () => {
		// A partial wildcard would look like it matched and never would.
		for (const field of component?.formulaFields ?? []) {
			for (const segment of field.split('.')) {
				if (segment.includes('*')) expect(segment).toBe('*');
			}
		}
	});
});
