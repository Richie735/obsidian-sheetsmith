import { describe, expect, it } from 'vitest';
import { Layout } from './layout';
import { parseModifierTypes } from './modifier-types';
import { ComponentConfig, ModifierDefinition } from '../types';

/** A definition claiming the bonus type given, or none. */
const modifier = (
	name: string,
	bonusType?: string,
	operator?: 'add' | 'override',
): ModifierDefinition => ({
	name,
	target: 'armour_class',
	amount: '1',
	...(bonusType === undefined ? {} : { bonusType }),
	...(operator === undefined ? {} : { operator }),
});

const layout = (
	modifierTypes: string[] | undefined,
	modifiers: ModifierDefinition[] = [],
	components: ComponentConfig[] = [],
): Layout => ({
	name: 'L',
	components,
	...(modifierTypes ? { modifierTypes } : {}),
	...(modifiers.length > 0 ? { modifiers } : {}),
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

describe('parseModifierTypes: the definitions naming one', () => {
	it('says nothing about a definition naming a declared type', () => {
		expect(
			parseModifierTypes(layout(['item'], [modifier('Ring', 'item')])).problems,
		).toEqual([]);
	});

	it('says nothing about an untyped definition', () => {
		// Untyped is the default and every one of them stacks, so there is nothing
		// to check it against.
		expect(parseModifierTypes(layout(['item'], [modifier('Ring')])).problems).toEqual(
			[],
		);
	});

	it('reports a definition naming a type the layout does not declare', () => {
		/*
		 * **This is the check the shipped feature spec asked Table's own
		 * `configError` for, and it cannot live there**: `configError` is reached
		 * from `read(body, config)`, which is handed one component's config and
		 * never the layout — and a definition is not a component's at all now. A
		 * reset binding pointing at no trigger is reported in exactly this place
		 * for exactly this reason.
		 *
		 * Reported rather than refused, which the stakes allow — on the rule and no
		 * longer on the construction guarantee. A row may now type an effect that
		 * names a type, so "nothing stored ever names a type" is amended (feature doc
		 * §1); what holds instead is that a type the layout does not declare is
		 * **rendered, not corrected**, and the arithmetic contests by the string a
		 * modifier carries rather than by this list. So the mismatch orphans nothing
		 * and moves no number either way.
		 */
		const { problems } = parseModifierTypes(
			layout(['item'], [modifier('Ring', 'status')]),
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.definition).toBe('Ring');
		expect(problems[0]?.message).toContain('"status"');
		expect(problems[0]?.message).toContain('does not declare');
	});

	it('reports it against a definition that sets a value too', () => {
		// The type is ignored in the arithmetic there, which the definitions list
		// says separately — but the vocabulary is still undeclared, and this list
		// is where the vocabulary is kept.
		const { problems } = parseModifierTypes(
			layout(['item'], [modifier('Plate', 'status', 'override')]),
		);
		expect(problems).toHaveLength(1);
	});

	it('says nothing about a definition with no name', () => {
		// An unnamed definition is dropped by the definitions parser, so reporting
		// its type here would be a problem about something no row can reach.
		expect(
			parseModifierTypes(layout(['item'], [modifier('', 'status')])).problems,
		).toEqual([]);
	});

	it('says nothing about a layout declaring no modifiers at all', () => {
		const card: ComponentConfig = {
			id: 'ac',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 1, width: 1, height: 1 },
		};
		expect(parseModifierTypes(layout(['item'], [], [card])).problems).toEqual([]);
	});
});
