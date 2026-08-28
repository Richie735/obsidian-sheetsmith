import { describe, expect, it } from 'vitest';
import { Layout } from './layout';
import { parseModifierTypes } from './modifier-types';
import { ComponentConfig } from '../types';

/** A table whose modifier columns claim the types given. */
const items = (
	label: string,
	claims: readonly (string | undefined)[],
): ComponentConfig =>
	({
		id: label.toLowerCase(),
		type: 'table',
		label,
		position: { col: 1, row: 1, width: 1, height: 1 },
		columns: [
			{ key: 'Modifies', type: 'target' },
			...claims.map((modifierType, at) => ({
				key: `Bonus ${at}`,
				type: 'number',
				modifier: true,
				...(modifierType === undefined ? {} : { modifierType }),
			})),
		],
	}) as ComponentConfig;

const layout = (
	modifierTypes: string[] | undefined,
	components: ComponentConfig[] = [],
): Layout => ({
	name: 'L',
	components,
	...(modifierTypes ? { modifierTypes } : {}),
});

describe('parseModifierTypes: declarations', () => {
	it('keeps declared names in order', () => {
		expect(
			parseModifierTypes(layout(['item', 'status', 'circumstance'])).names,
		).toEqual(['item', 'status', 'circumstance']);
	});

	it('has nothing to say about a layout declaring none', () => {
		// Which is every layout by default: with no types declared anywhere the
		// feature is plain addition, and that is what an author who has never
		// heard of bonus types expects.
		expect(parseModifierTypes(layout(undefined))).toEqual({
			names: [],
			problems: [],
		});
	});

	it('trims a name, so a stray space does not make a second type', () => {
		// Two types that differ by a space would stack, which is the arithmetic
		// being wrong for a reason nothing on screen shows.
		expect(parseModifierTypes(layout(['  item  '])).names).toEqual(['item']);
	});

	it('drops a blank name and reports it', () => {
		// A column with no type already means untyped, so a blank line here would
		// offer a second spelling of "no type" in the select.
		const { names, problems } = parseModifierTypes(layout(['item', '   ']));
		expect(names).toEqual(['item']);
		expect(problems).toEqual([{ message: 'A bonus type needs a name.' }]);
	});

	it('collapses a repeat to its first appearance and reports it', () => {
		const { names, problems } = parseModifierTypes(
			layout(['item', 'status', 'item']),
		);
		expect(names).toEqual(['item', 'status']);
		expect(problems[0]?.message).toContain('declared more than once');
	});
});

describe('parseModifierTypes: columns', () => {
	it('says nothing about a column naming a declared type', () => {
		expect(
			parseModifierTypes(layout(['item'], [items('Magic items', ['item'])]))
				.problems,
		).toEqual([]);
	});

	it('says nothing about an untyped modifier column', () => {
		// Untyped is the default and every one of them stacks, so there is nothing
		// to check it against.
		expect(
			parseModifierTypes(layout(['item'], [items('Magic items', [undefined])]))
				.problems,
		).toEqual([]);
	});

	it('reports a column naming a type the layout does not declare', () => {
		/*
		 * **This is the check the feature spec asked Table's own `configError` for,
		 * and it cannot live there**: `configError` is reached from `read(body,
		 * config)`, which is handed one component's config and never the layout. A
		 * reset binding pointing at no trigger is reported in exactly this place
		 * for exactly this reason.
		 *
		 * Reported rather than refused, which the stakes allow: no cell ever names
		 * a type, so nothing stored can be orphaned by the mismatch.
		 */
		const { problems } = parseModifierTypes(
			layout(['item'], [items('Magic items', ['status'])]),
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.component).toBe('Magic items');
		expect(problems[0]?.message).toContain('"status"');
		expect(problems[0]?.message).toContain('does not declare');
	});

	it('reaches a table inside a container', () => {
		// Containment is arrangement and never addressing, so a nested table's
		// columns are as much the layout's business as a top-level one's.
		const group: ComponentConfig = {
			id: 'gear',
			type: 'group',
			label: 'Gear',
			position: { col: 1, row: 1, width: 4, height: 2 },
			children: [items('Magic items', ['status'])],
		};
		expect(parseModifierTypes(layout(['item'], [group])).problems).toHaveLength(1);
	});

	it('ignores a type on a column that is not a modifier', () => {
		// A stale `modifierType` left behind when the flag was cleared claims
		// nothing, because nothing reads it.
		const stale: ComponentConfig = {
			id: 'items',
			type: 'table',
			label: 'Magic items',
			position: { col: 1, row: 1, width: 1, height: 1 },
			columns: [{ key: 'Bonus', type: 'number', modifierType: 'status' }],
		} as ComponentConfig;
		expect(parseModifierTypes(layout(['item'], [stale])).problems).toEqual([]);
	});

	it('says nothing about a component with no columns at all', () => {
		const card: ComponentConfig = {
			id: 'ac',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 1, width: 1, height: 1 },
		};
		expect(parseModifierTypes(layout(['item'], [card])).problems).toEqual([]);
	});
});
