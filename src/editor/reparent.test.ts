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

	it('leaves position untouched when the old parent already placed its children', () => {
		// The no-op guarantee the tab-set fix below rests on: `innerPlacement`
		// returns the dragged component's own position unchanged whenever its
		// old parent placed its children itself, which every container in
		// `fixture()` does. Distinct numbers rather than `pos()`'s shared
		// {2,1}, or an unwitting change of every field to itself would pass
		// just as well.
		const layout = fixture();
		const stat = layout.components[2]!;
		const empty = layout.components[1]!;
		stat.position = { col: 3, row: 5, width: 6, height: 4 };

		reparent(layout, stat, empty);

		expect(stat.position).toEqual({ col: 3, row: 5, width: 6, height: 4 });
	});
});

/**
 * A tab's own stored width/height is never read while it sits inside a tab
 * set — `innerPlacement` (`view/grid-cells.ts`) draws it at the tab set's own
 * placement instead, so the tab's own numbers are free to drift stale (see
 * `layout-editor.test.ts`'s `staleTab()`). `layout-editor.test.ts`'s "gives a
 * promoted tab the size it was actually drawn at" locks the same fix for
 * container removal; this is the identical defect reached through
 * `reparent()`, which every one of `tree.ts`'s indent, outdent and drag-drop
 * controls call — outdent is driven here since it is the cheapest of the
 * three to call directly.
 */
function tabbedFixture(): Layout {
	const strike: ComponentConfig = {
		id: 'strike',
		type: 'card',
		label: 'Strike bonus',
		// Placed using the tab set's real, current size (8x5), which
		// `innerPlacement` supplies while `combat` is nested.
		position: { col: 1, row: 4, width: 2, height: 1 },
	};
	const combat: ComponentConfig = {
		id: 'combat',
		type: 'group',
		label: 'Combat',
		// Stale: what the add row wrote when the tab set was smaller.
		position: { col: 1, row: 1, width: 4, height: 2 },
		children: [strike],
	};
	const spells: ComponentConfig = {
		id: 'spells',
		type: 'group',
		label: 'Spells',
		position: { col: 1, row: 1, width: 8, height: 5 },
	};
	const pages: ComponentConfig = {
		id: 'pages',
		type: 'tab-set',
		label: 'Pages',
		position: { col: 1, row: 1, width: 8, height: 5 },
		children: [combat, spells],
	};
	return {
		name: 'Tabbed fixture',
		components: [pages],
	};
}

describe('reparenting a tab out of its tab set', () => {
	it('gives it the size it was actually drawn at, not its own stale one', () => {
		const layout = tabbedFixture();
		const pages = layout.components[0]!;
		const combat = pages.children![0]!;
		const strike = combat.children![0]!;

		// The outdent button's own call (`tree.ts`): move `combat` out of
		// `pages` to the top level.
		reparent(layout, combat, null);

		// The tab set's own real size (8x5), not the stale stored one (4x2).
		expect(combat.position).toMatchObject({ width: 8, height: 5 });
		// `strike`'s row is relative to `combat`'s own subgrid, so it has to
		// fit inside `combat`'s own declared height in that same local
		// space — which the stale 4x2 did not, and the real 8x5 does.
		const strikeBottom = strike.position.row + strike.position.height - 1;
		expect(strikeBottom).toBeLessThanOrEqual(combat.position.height);
	});

	it('leaves col and row alone, which this fix does not touch', () => {
		// Named so a reader does not mistake the width/height correction for
		// a general position fix: `reparent` still carries whatever col/row
		// `dragged` already had, meaningless in the new destination's
		// coordinate space or not — a separate, pre-existing gap this change
		// deliberately leaves open.
		const layout = tabbedFixture();
		const pages = layout.components[0]!;
		const combat = pages.children![0]!;

		reparent(layout, combat, null);

		expect(combat.position).toMatchObject({ col: 1, row: 1 });
	});
});
