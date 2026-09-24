import { describe, expect, it } from 'vitest';
import { canReparent, reparent } from './reparent';
import { ComponentConfig } from '../types';
import {
	Layout,
	mayHoldChildren,
	parseLayout,
	serialiseLayout,
} from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';

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

	it('refuses a container whose inner container would land too deep, naming that container', () => {
		const layout = fixture();
		const outer = layout.components[0]!; // holds inner, which holds leaf
		const empty = layout.components[1]!; // depth 0, may hold children
		// Moving `outer` into `empty` lands `outer` one level in, which it may
		// be, but lands `inner` inside two containers, where a container may
		// not hold children — and `inner` holds `leaf`. The sentence names
		// `inner`, the one that is actually too deep, and not `outer`.
		const result = canReparent(layout, outer, empty);
		expect(result).toEqual({
			error: '"Outer" holds "Inner", which holds components, and moving "Outer" here would put "Inner" inside two containers, where it could hold nothing. Move the components out of "Inner" first.',
		});
	});

	it('names every inner container that would land too deep, not only the first', () => {
		// `outer` holds two containers, each holding a Card. A sentence naming
		// only the first would be refused again, naming the second, once its
		// fix was followed.
		const layout = fixture();
		const outer = layout.components[0]!;
		const empty = layout.components[1]!;
		outer.children!.push({
			id: 'second',
			type: 'group',
			label: 'Second',
			position: pos(),
			children: [{ id: 'other', type: 'card', label: 'Other', position: pos() }],
		});
		expect(canReparent(layout, outer, empty)).toEqual({
			error: '"Outer" holds "Inner" and "Second", which hold components, and moving "Outer" here would put them inside two containers, where they could hold nothing. Move the components out of "Inner" and "Second" first.',
		});
	});

	it('says "two containers" only while two is where a container stops holding anything', () => {
		// The depth refusals spell the cap as a word, and `parse/layout.ts`
		// owns the number. Change the cap and this goes red, rather than
		// every sentence above quietly going false.
		expect(mayHoldChildren(1)).toBe(true);
		expect(mayHoldChildren(2)).toBe(false);
	});

	it('refuses a container holding only cards onto a target already one level in, saying so', () => {
		// The other way into the same branch: `inner` holds a Card, no
		// container, so "a container of its own" would be false. Moving it
		// into `nested`, which sits one level in, puts `inner` itself inside
		// two containers, where it could hold nothing.
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;
		const nested: ComponentConfig = {
			id: 'nested',
			type: 'group',
			label: 'Nested',
			position: pos(),
		};
		outer.children!.push(nested);
		expect(canReparent(layout, inner, nested)).toEqual({
			error: '"Inner" holds components, and moving it here would put it inside two containers, where it could hold nothing. Move its components out first.',
		});
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
	it('moves a component from one container into another, landing at col 1, row 1 of the empty destination', () => {
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;
		const leaf = inner.children![0]!;
		const empty = layout.components[1]!;

		reparent(layout, leaf, empty);

		expect(inner).not.toHaveProperty('children');
		expect(empty.children).toEqual([leaf]);
		// `empty` held nothing, so the first free row is row 1 — the same
		// answer an empty top level would give.
		expect(leaf.position).toMatchObject({ col: 1, row: 1 });
	});

	it('moves a component to the top level, landing at the first row nothing else occupies', () => {
		const layout = fixture();
		const outer = layout.components[0]!;
		const inner = outer.children![0]!;
		// `outer`, `empty` and `stat` all sit at row 1 with height 1
		// (`pos()`'s defaults), so the top level's first free row is row 2.
		reparent(layout, inner, null);

		expect(outer).not.toHaveProperty('children');
		expect(layout.components).toContain(inner);
		expect(inner.position).toMatchObject({ col: 1, row: 2 });
	});

	it('lands at col 1, the first free row, when it moves into a container with existing children', () => {
		const layout = fixture();
		const stat = layout.components[2]!;
		const empty = layout.components[1]!;
		empty.children = [
			{ id: 'a', type: 'card', label: 'A', position: pos({ row: 1, height: 2 }) },
			{ id: 'b', type: 'card', label: 'B', position: pos({ row: 3, height: 1 }) },
		];

		reparent(layout, stat, empty);

		// Row 4 is the first row neither `a` (rows 1-2) nor `b` (row 3)
		// occupies — and `stat` itself, not yet in `empty.children` when this
		// is computed, is never counted as its own obstacle.
		expect(stat.position).toMatchObject({ col: 1, row: 4 });
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

	it('leaves width/height untouched, and reassigns col/row, when the old parent already placed its children', () => {
		// The no-op guarantee the tab-set fix below rests on: `innerPlacement`
		// returns the dragged component's own width/height unchanged whenever
		// its old parent placed its children itself, which every container in
		// `fixture()` does. Position is a different story now — `stat` moves
		// from the top level into `empty`, an actual change of parent, so
		// col/row are reassigned to `empty`'s first free row regardless of
		// what they used to say.
		const layout = fixture();
		const stat = layout.components[2]!;
		const empty = layout.components[1]!;
		stat.position = { col: 3, row: 5, width: 6, height: 4 };

		reparent(layout, stat, empty);

		expect(stat.position).toEqual({ col: 1, row: 1, width: 6, height: 4 });
	});

	it("leaves col/row untouched when the drop resolves to the component's own current parent", () => {
		// `resolveDrop` (`tree.ts`) sends a drop on a container row through
		// `reparent()` even when that container already holds the dragged
		// row — its own comment says a container row is never reinterpreted
		// as a reorder. That call must not treat `a`'s existing col/row as
		// meaningless just because `reparent()` ran; nothing about which grid
		// it sits on changed.
		const layout = fixture();
		const empty = layout.components[1]!;
		const a: ComponentConfig = {
			id: 'a',
			type: 'card',
			label: 'A',
			position: pos({ col: 5, row: 9 }),
		};
		const b: ComponentConfig = {
			id: 'b',
			type: 'card',
			label: 'B',
			position: pos({ col: 1, row: 1 }),
		};
		empty.children = [a, b];

		reparent(layout, a, empty);

		expect(a.position).toMatchObject({ col: 5, row: 9 });
		expect(empty.children.map((c) => c.id)).toEqual(['b', 'a']);
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

	it('also reassigns col/row to the top level\'s own first free row, not whatever it held inside the tab set', () => {
		// `combat`'s own stale col/row (1, 1) meant a place in `pages`' inner
		// grid, which the top level does not share. `pages` itself already
		// occupies rows 1-5 there, so the first free row is row 6.
		const layout = tabbedFixture();
		const pages = layout.components[0]!;
		const combat = pages.children![0]!;

		reparent(layout, combat, null);

		expect(combat.position).toMatchObject({ col: 1, row: 6 });
	});
});

/*
 * `canReparent` and `parseChildren` are two statements of one depth rule, and
 * they disagreed about an empty `children` list: the editor read it as holding
 * nothing, the parser as a key two containers deep may not carry. So a move
 * the tree allowed was drawn and never saved. This walks every move the check
 * allows, over layouts that carry an emptied or hand-written `children: []`
 * at each depth that matters, and requires the result to parse — the
 * agreement itself, rather than the one repro that exposed its absence.
 */
describe('every move canReparent allows saves', () => {
	/**
	 * `zone` holds two depth-1 containers; `nested` carries `children: []`
	 * where a container emptied by an earlier edit used to, and `wrapper`
	 * holds `hollow`, which carries a hand-written one, so moving `wrapper`
	 * into `zone` lands `hollow` two deep.
	 */
	function withEmptyLists(): Layout {
		return {
			name: 'Empty lists',
			components: [
				{
					id: 'zone',
					type: 'group',
					label: 'Zone',
					position: pos({ width: 6, height: 3 }),
					children: [
						{ id: 'holder', type: 'group', label: 'Holder', position: pos() },
						{
							id: 'nested',
							type: 'group',
							label: 'Nested',
							position: pos({ row: 2 }),
							children: [],
						},
					],
				},
				{
					id: 'wrapper',
					type: 'group',
					label: 'Wrapper',
					position: pos({ row: 4 }),
					children: [
						{
							id: 'hollow',
							type: 'group',
							label: 'Hollow',
							position: pos(),
							children: [],
						},
					],
				},
				{ id: 'stat', type: 'card', label: 'Stat', position: pos({ row: 5 }) },
			],
		};
	}

	function allowedMoves(make: () => Layout): Array<[string, string | null]> {
		const layout = make();
		const configs = walkComponents(layout.components).map((entry) => entry.config);
		const moves: Array<[string, string | null]> = [];
		for (const dragged of configs) {
			for (const target of [null, ...configs]) {
				if ('ok' in canReparent(layout, dragged, target)) {
					moves.push([dragged.id, target?.id ?? null]);
				}
			}
		}
		return moves;
	}

	for (const [name, make] of [
		['a layout holding empty lists', withEmptyLists],
		['the two-deep fixture', fixture],
		['the tab set fixture', tabbedFixture],
	] as const) {
		it(`over ${name}`, () => {
			const moves = allowedMoves(make);
			// Not vacuous: the case this exists for is among them.
			if (make === withEmptyLists) {
				expect(moves).toContainEqual(['nested', 'holder']);
				expect(moves).toContainEqual(['wrapper', 'zone']);
			}
			expect(moves.length).toBeGreaterThan(3);
			for (const [draggedId, targetId] of moves) {
				const layout = make();
				const byId = new Map(
					walkComponents(layout.components).map((entry) => [
						entry.config.id,
						entry.config,
					]),
				);
				reparent(layout, byId.get(draggedId)!, targetId === null ? null : byId.get(targetId)!);
				expect(
					() => parseLayout(serialiseLayout(layout)),
					`${draggedId} into ${targetId ?? 'the top level'}`,
				).not.toThrow();
			}
		});
	}

	it('keeps an empty list where it is still legal, since the move did not touch it', () => {
		const layout = withEmptyLists();
		const wrapper = layout.components[1]!;
		reparent(layout, wrapper, layout.components[0]!);
		// One level in, `hollow` lands two deep: its empty list had to go.
		expect(wrapper.children![0]).not.toHaveProperty('children');

		const other = withEmptyLists();
		const stat = other.components[2]!;
		reparent(other, stat, other.components[1]!);
		// `hollow` did not move and stays one deep: its list is the author's.
		expect(other.components[1]!.children![0]!.children).toEqual([]);
	});
});
