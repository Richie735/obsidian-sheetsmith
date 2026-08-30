import { describe, expect, it } from 'vitest';
import { canReparent, reparent } from './reparent';
import { ComponentConfig } from '../types';
import { Layout } from '../parse/layout';

function pos(overrides: Partial<ComponentConfig['position']> = {}) {
	return { col: 1, row: 1, width: 2, height: 1, ...overrides };
}

/**
 * A layout two containers deep on one branch, plus a plain leaf and an empty
 * container, so a drop has somewhere legal and somewhere refused to land.
 */
function fixture(): Layout {
	const inner: ComponentConfig = {
		id: 'inner',
		type: 'group',
		label: 'Inner',
		position: pos(),
		children: [
			{ id: 'leaf', type: 'card', label: 'Leaf', position: pos() },
		],
	};
	const outer: ComponentConfig = {
		id: 'outer',
		type: 'group',
		label: 'Outer',
		position: pos(),
		children: [inner],
	};
	const empty: ComponentConfig = {
		id: 'empty',
		type: 'group',
		label: 'Empty',
		position: pos(),
	};
	const stat: ComponentConfig = {
		id: 'stat',
		type: 'card',
		label: 'Stat',
		position: pos(),
	};
	return {
		name: 'Reparent fixture',
		components: [outer, empty, stat],
	};
}

describe('canReparent', () => {
	it('refuses a drop onto a non-container', () => {
		const layout = fixture();
		const leaf = layout.components[0]!.children![0]!.children![0]!;
		const empty = layout.components[1]!;
		const onLeaf = canReparent(layout, empty, leaf);
		expect('error' in onLeaf && onLeaf.error).toContain('is not a container');
	});

	it('refuses a drop onto itself', () => {
		const layout = fixture();
		const stat = layout.components[2]!;
		const result = canReparent(layout, stat, stat);
		expect('error' in result).toBe(true);
	});

	it('refuses a drop onto one of its own descendants', () => {
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;
		const result = canReparent(layout, outer, inner);
		expect('error' in result).toBe(true);
	});

	it('refuses a container onto a target that would push it past the depth cap', () => {
		const layout = fixture();
		const outer = layout.components[0]!; // holds inner, which holds leaf
		const empty = layout.components[1]!; // depth 0, may hold children
		// Moving `outer` (which itself holds `inner`, a container) into `empty`
		// would land `inner` at depth 2, where a container may not hold
		// children (`leaf` would need depth 3).
		const result = canReparent(layout, outer, empty);
		expect('error' in result).toBe(true);
	});

	it('accepts the identical container at the same target once it holds no children', () => {
		// The distinction is on the dragged subtree's contents, not the type:
		// the emptied container is accepted at the exact same target the full
		// one was refused at.
		const layout = fixture();
		const outer = layout.components[0]!;
		const empty = layout.components[1]!;
		outer.children = [];
		const result = canReparent(layout, outer, empty);
		expect(result).toEqual({ ok: true });
	});

	it('accepts a container one level deep whose own children are leaves', () => {
		// The distinction from the two cases above: `inner` holds `leaf` (a
		// Card, not a container), so landing `inner` one level deeper — into
		// `empty`, at depth 0 — puts `leaf` at depth 2, which is the deepest a
		// leaf may sit. Nothing here holds children at depth 2, so this is
		// accepted where moving `outer` (whose child itself holds children)
		// to the same target is not.
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;
		const empty = layout.components[1]!;
		expect(canReparent(layout, inner, empty)).toEqual({ ok: true });
	});

	it('accepts a childless container at the top level unconditionally', () => {
		const layout = fixture();
		const empty = layout.components[1]!;
		expect(canReparent(layout, empty, null)).toEqual({ ok: true });
	});

	it('refuses a target that is not part of this layout', () => {
		const layout = fixture();
		const stray: ComponentConfig = {
			id: 'stray',
			type: 'group',
			label: 'Stray',
			position: pos(),
		};
		expect('error' in canReparent(layout, layout.components[2]!, stray)).toBe(
			true,
		);
	});
});

describe('reparent', () => {
	it('moves a component from one container into another', () => {
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;
		const leaf = inner.children![0]!;
		const empty = layout.components[1]!;

		reparent(layout, leaf, empty);

		expect(inner.children).toEqual([]);
		expect(empty.children).toEqual([leaf]);
	});

	it('moves a component to the top level', () => {
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;

		reparent(layout, inner, null);

		expect(outer.children).toEqual([]);
		expect(layout.components).toContain(inner);
	});

	it('inserts at the given index rather than always at the end', () => {
		const layout = fixture();
		const stat = layout.components[2]!;
		const empty = layout.components[1]!;
		empty.children = [
			{ id: 'a', type: 'card', label: 'A', position: pos() },
			{ id: 'b', type: 'card', label: 'B', position: pos() },
		];

		reparent(layout, stat, empty, 1);

		expect(empty.children.map((c) => c.id)).toEqual(['a', 'stat', 'b']);
	});
});
