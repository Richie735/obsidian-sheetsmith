/*
 * SPEC §5's worked examples, run end to end: the real layout parser, the
 * real character parser, and the real registered components, with the
 * layout's own function library underneath them.
 *
 * The layer tests each prove one seam. This proves the shape a user actually
 * writes — a 5e library of `mod` and `prof`, an ability card computing its
 * modifier through it, and a second card reading that ability and calling
 * the same functions. It mirrors the wiring in SheetView.renderSheet, which
 * cannot be tested directly without a workspace around it; if the two ever
 * disagree, this file is the copy that is wrong.
 */

import { describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import { parseFunctions } from '../formula/functions';
import {
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../formula/resolve';
import { buildSheetScope } from '../formula/sheet';
import { Scope } from '../formula/expression';
import { getSection, parseCharacter } from '../parse/character';
import { parseLayout } from '../parse/layout';

const LAYOUT = JSON.stringify({
	name: 'DnD 5e Standard',
	columns: 6,
	functions: [
		'# The arithmetic this system runs on.',
		'mod(score) = floor((score - 10) / 2)',
		'prof = ceil(level / 4) + 1',
	],
	components: [
		{
			id: 'level',
			type: 'stat',
			label: 'Level',
			position: { col: 1, row: 1, width: 1, height: 1 },
		},
		{
			id: 'abilities',
			type: 'stat-group',
			label: 'Abilities',
			position: { col: 2, row: 1, width: 4, height: 1 },
			attributes: [{ key: 'STR' }, { key: 'DEX' }],
			derived: 'mod(value)',
		},
		{
			id: 'spell_dc',
			type: 'stat',
			label: 'Spell save DC',
			position: { col: 1, row: 2, width: 2, height: 1 },
			derived: '8 + prof + mod(abilities.DEX.value)',
		},
	],
});

const NOTE = `---
sheet-layout: DnD 5e Standard
---

## Level
\`\`\`sheet
value: 5
\`\`\`

## Abilities
\`\`\`sheet
STR: 8
DEX: 18
\`\`\`
`;

/** What SheetView.renderSheet does, minus the DOM. */
function buildSheet(layoutSource: string, noteSource: string) {
	const layout = parseLayout(layoutSource);
	const { library, problems } = parseFunctions(layout.functions);
	const note = parseCharacter(noteSource);

	const prepared = layout.components.map((config) => {
		const component = getComponent(config.type);
		if (!component) throw new Error(`No component of type "${config.type}".`);
		const section = getSection(note, config.label);
		const result = section ? component.read(section.body, config) : null;
		return { config, component, data: result?.ok === true ? result.data : null };
	});

	const sheet = buildSheetScope(
		prepared.flatMap(({ config, component, data }) =>
			component.scopeValues
				? [
						{
							id: config.id,
							values: component.scopeValues(data, config),
							resolver: (scope: Scope) =>
								makeFieldResolver(component, config, data, scope, library),
						},
					]
				: [],
		),
	);

	const resolvedFor = (id: string) => {
		const entry = prepared.find((item) => item.config.id === id);
		if (!entry) throw new Error(`No component with id "${id}".`);
		return resolveFormulaFields(
			entry.component,
			entry.config,
			entry.data,
			sheet,
			library,
		);
	};

	/** Why a component's field did not resolve, in the words the card shows. */
	const explainFor = (id: string, field: string) => {
		const entry = prepared.find((item) => item.config.id === id);
		if (!entry) throw new Error(`No component with id "${id}".`);
		return makeFieldExplainer(
			entry.component,
			entry.config,
			entry.data,
			sheet,
			library,
		)(field, {});
	};

	return { problems, sheet, resolvedFor, explainFor };
}

describe('a 5e layout with its own function library', () => {
	const { problems, sheet, resolvedFor } = buildSheet(LAYOUT, NOTE);

	it('reads the library without complaint', () => {
		expect(problems).toEqual([]);
	});

	it('computes each ability modifier through mod()', () => {
		// One formula, `mod(value)`, run per attribute — and the arithmetic
		// behind it belongs to the layout, not the plugin.
		expect(sheet('abilities.DEX')).toBe(4);
		expect(sheet('abilities.STR')).toBe(-1);
		expect(sheet('abilities.DEX.value')).toBe(18);
	});

	it('lets a function body read a component off the sheet', () => {
		// prof is `ceil(level / 4) + 1`, and `level` is another card: the
		// body reaches the sheet even though the card that called it cannot
		// pass anything in. At level 5 that is 3.
		expect(resolvedFor('spell_dc').derived).toBe(15);
	});

	it('keeps working when a definition is broken, and says which', () => {
		const broken = JSON.parse(LAYOUT) as { functions: string[] };
		broken.functions = [...broken.functions, 'half(x = x / 2'];
		const sheetWithTypo = buildSheet(JSON.stringify(broken), NOTE);
		expect(sheetWithTypo.problems).toHaveLength(1);
		expect(sheetWithTypo.problems[0]?.source).toBe('half(x = x / 2');
		// The typo costs its own line. Everything else still renders.
		expect(sheetWithTypo.sheet('abilities.DEX')).toBe(4);
		expect(sheetWithTypo.resolvedFor('spell_dc').derived).toBe(15);
	});

	it('fails on the calling component alone when a function is missing', () => {
		const without = JSON.parse(LAYOUT) as { functions: string[] };
		without.functions = ['mod(score) = floor((score - 10) / 2)'];
		const sheetWithoutProf = buildSheet(JSON.stringify(without), NOTE);
		// spell_dc calls prof and cannot resolve; the abilities beside it are
		// untouched, which is SPEC §5's promise about a failing formula.
		expect(sheetWithoutProf.resolvedFor('spell_dc').derived).toBeNull();
		expect(sheetWithoutProf.sheet('abilities.DEX')).toBe(4);
	});
});

/*
 * The encumbrance rule, which is the first formula an inventory invites and the
 * reason a column total is publishable at all: a sum over stored cells is a
 * number derived from data alone, so it needs nothing the contract does not
 * already have. The other half of the same fact is that a row the character
 * typed publishes nothing, and this is where that shows up as a user would meet
 * it — a formula naming an item, failing on the card that wrote it.
 */
const INVENTORY = JSON.stringify({
	name: 'Blades in the Dark',
	columns: 6,
	components: [
		{
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			position: { col: 1, row: 1, width: 4, height: 3 },
			rowHeader: 'Item',
			openRows: true,
			columns: [
				{ key: 'Weight', type: 'number', total: true },
				{ key: 'Carried', type: 'toggle', total: true },
			],
		},
		{
			id: 'load',
			type: 'stat',
			label: 'Load',
			derived: 'inventory.Weight',
			position: { col: 5, row: 1, width: 1, height: 1 },
		},
		{
			id: 'overloaded',
			type: 'stat',
			label: 'Overloaded',
			derived: 'if(inventory.Weight > 3, 1, 0)',
			position: { col: 6, row: 1, width: 1, height: 1 },
		},
		{
			id: 'by_item',
			type: 'stat',
			label: 'By item',
			derived: '1 + inventory.Dagger',
			position: { col: 5, row: 2, width: 2, height: 1 },
		},
	],
});

const PACK = `---
sheet-layout: Blades in the Dark
---

## Inventory

| Item | Weight | Carried |
| --- | --- | --- |
| Dagger | 1 | yes |
| dagger | 1 | yes |
| Climbing gear | 2 | no |
`;

describe('a load list totalling a column', () => {
	const { sheet, resolvedFor, explainFor } = buildSheet(INVENTORY, PACK);

	it('publishes the total of a stored column under the column key', () => {
		// Two daggers at 1 and climbing gear at 2. Keyed by name the two daggers
		// were one row and this said 3.
		expect(sheet('inventory.Weight')).toBe(4);
		expect(resolvedFor('load').derived).toBe(4);
	});

	it('counts a toggle column as the rows that are on', () => {
		expect(sheet('inventory.Carried')).toBe(2);
	});

	it('lets the layout write the encumbrance rule as arithmetic', () => {
		expect(resolvedFor('overloaded').derived).toBe(1);
	});

	it('fails on the card that named a row, whatever its capitalisation', () => {
		// `<id>.<name>` is a fixed-row mechanism: a name a formula can write has
		// to be knowable when the formula is written, and a row the character
		// typed is not. So this fails, on the card that wrote it, and the card
		// says which name it could not find.
		expect(sheet('inventory.Dagger')).toBeUndefined();
		expect(sheet('inventory.dagger')).toBeUndefined();
		expect(resolvedFor('by_item').derived).toBeNull();
		expect(explainFor('by_item', 'derived')).toContain('inventory.Dagger');
		// Everything beside it still resolves (SPEC §5).
		expect(resolvedFor('load').derived).toBe(4);
	});
});
