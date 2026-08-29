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
import { makeFieldExplainer, resolveFormulaFields } from '../formula/resolve';
import { buildSheet } from '../formula/sheet';
import { getSection, parseCharacter } from '../parse/character';
import { parseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { ComponentConfig, isContainer } from '../types';

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
			type: 'card',
			label: 'Level',
			position: { col: 1, row: 1, width: 1, height: 1 },
		},
		{
			id: 'abilities',
			type: 'card-set',
			label: 'Abilities',
			position: { col: 2, row: 1, width: 4, height: 1 },
			entries: [{ key: 'STR' }, { key: 'DEX' }],
			derived: 'mod(value)',
		},
		{
			id: 'spell_dc',
			type: 'card',
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

/**
 * What SheetView.renderSheet does, minus the DOM.
 *
 * **Named `sheetFrom` rather than after the function in `formula/sheet.ts`**, which
 * this file now calls. A local declaration of that name made `sheet.test.ts`'s
 * host scan match this file's own declaration of it and turned the strongest
 * assertion in that scan into a tautology on the very file it was added to catch.
 * The scan refuses the declaring spelling outright now, so it cannot come back —
 * which is also why this paragraph does not quote it.
 */
function sheetFrom(layoutSource: string, noteSource: string) {
	const layout = parseLayout(layoutSource);
	const { library, problems } = parseFunctions(layout.functions);
	const note = parseCharacter(noteSource);

	// The view's own walk, depth first and each level in grid order, so a card
	// inside a container is read before anything renders — exactly as one at the
	// top level is.
	const prepared = walkComponents(layout.components).map(({ config }) => {
		const component = getComponent(config.type);
		if (!component) throw new Error(`No component of type "${config.type}".`);
		// A container has no section (SPEC §4.1), so there is nothing to read.
		const section = isContainer(component)
			? undefined
			: getSection(note, config.label);
		const result = section ? component.read(section.body, config) : null;
		return {
			config,
			component,
			error: result && !result.ok ? result.error : null,
			data: result?.ok === true ? result.data : null,
		};
	});

	/*
	 * **Through the view's own `buildSheet`, not the steps it is made of.** This
	 * file declares itself a mirror of `renderSheet`, and it was spelling two of
	 * those steps with **no modifier input at all** — so a worked example reading
	 * `mod.self`, which `SPEC` §5's own examples do, would have resolved through
	 * `NO_SHEET_MODIFIERS`, got the unmodified number, and asserted the view's
	 * arithmetic while staying green. `sheet.test.ts`'s host scan now names this
	 * file, which is what stops the copy coming back.
	 */
	const { env } = buildSheet(layout, prepared, library);

	const resolvedFor = (id: string) => {
		const entry = prepared.find((item) => item.config.id === id);
		if (!entry) throw new Error(`No component with id "${id}".`);
		return resolveFormulaFields(entry.component, entry.config, entry.data, env);
	};

	/** Why a component's field did not resolve, in the words the card shows. */
	const explainFor = (id: string, field: string) => {
		const entry = prepared.find((item) => item.config.id === id);
		if (!entry) throw new Error(`No component with id "${id}".`);
		return makeFieldExplainer(
			entry.component,
			entry.config,
			entry.data,
			env,
		)(field, {});
	};

	return { problems, env, sheet: env.sheet, prepared, resolvedFor, explainFor };
}

describe('a 5e layout with its own function library', () => {
	const { problems, sheet, resolvedFor } = sheetFrom(LAYOUT, NOTE);

	it('reads the library without complaint', () => {
		expect(problems).toEqual([]);
	});

	it('computes each ability modifier through mod()', () => {
		// One formula, `mod(value)`, run per entry — and the arithmetic
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
		const sheetWithTypo = sheetFrom(JSON.stringify(broken), NOTE);
		expect(sheetWithTypo.problems).toHaveLength(1);
		expect(sheetWithTypo.problems[0]?.source).toBe('half(x = x / 2');
		// The typo costs its own line. Everything else still renders.
		expect(sheetWithTypo.sheet('abilities.DEX')).toBe(4);
		expect(sheetWithTypo.resolvedFor('spell_dc').derived).toBe(15);
	});

	it('fails on the calling component alone when a function is missing', () => {
		const without = JSON.parse(LAYOUT) as { functions: string[] };
		without.functions = ['mod(score) = floor((score - 10) / 2)'];
		const sheetWithoutProf = sheetFrom(JSON.stringify(without), NOTE);
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
				{ key: 'Qty', type: 'number' },
				{ key: 'Weight', type: 'number', total: true },
				{ key: 'Carried', type: 'toggle', total: true },
			],
		},
		{
			id: 'load',
			type: 'card',
			label: 'Load',
			derived: 'inventory.Weight',
			position: { col: 5, row: 1, width: 1, height: 1 },
		},
		{
			id: 'overloaded',
			type: 'card',
			label: 'Overloaded',
			derived: 'if(inventory.Weight > 3, 1, 0)',
			position: { col: 6, row: 1, width: 1, height: 1 },
		},
		{
			id: 'by_item',
			type: 'card',
			label: 'By item',
			derived: '1 + inventory.Dagger',
			position: { col: 5, row: 2, width: 2, height: 1 },
		},
		{
			id: 'carried_weight',
			type: 'card',
			label: 'Carried weight',
			derived: 'sum(inventory, Weight, Carried)',
			position: { col: 5, row: 3, width: 2, height: 1 },
		},
		{
			id: 'items',
			type: 'card',
			label: 'Items',
			derived: 'count(inventory)',
			position: { col: 5, row: 4, width: 2, height: 1 },
		},
		{
			id: 'encumbrance',
			type: 'card',
			label: 'Encumbrance',
			// The number §13 refused: quantity times weight summed down the list,
			// over rows no layout declared and with no computed column to total.
			// Here rather than only in a hand-built environment, because this is
			// the file that runs SPEC §5's worked examples through the real
			// parsers and the real registry, and §5 now lists this as one.
			derived: 'sum(inventory, Qty * Weight)',
			position: { col: 5, row: 5, width: 2, height: 1 },
		},
	],
});

const PACK = `---
sheet-layout: Blades in the Dark
---

## Inventory

| Item | Qty | Weight | Carried |
| --- | --- | --- | --- |
| Dagger | 2 | 1 | yes |
| dagger | 1 | 1 | yes |
| Climbing gear | 1 | 2 | no |
`;

describe('a load list totalling a column', () => {
	const { sheet, resolvedFor, explainFor } = sheetFrom(INVENTORY, PACK);

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

	it('aggregates over the rows the character added', () => {
		// The other half of the same list: the total is configuration on a
		// column, and this is a formula reaching the rows themselves. Two
		// daggers carried at 1 each, and climbing gear at 2 that is not.
		expect(resolvedFor('carried_weight').derived).toBe(2);
		expect(resolvedFor('items').derived).toBe(3);
	});

	it('sums an expression over the rows, which is what §13 refused', () => {
		// Two daggers at a pound, one dagger at a pound, one lot of climbing
		// gear at two: five. **Deliberately none of the other four numbers this
		// note produces** — the Weight total is 4, the Carried total and the
		// filtered sum are 2, the count is 3 — so it cannot pass by reading the
		// wrong one, which is the whole risk with five aggregates over one table.
		expect(resolvedFor('encumbrance').derived).toBe(5);
		expect(sheet('inventory.Weight')).toBe(4);
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

/*
 * One unreadable row, from the seat the reader is in (SPEC §5).
 *
 * The rule — one row out of nine with an unreadable cell fails the whole
 * aggregate, and the error names that row — is driven at the evaluator over a
 * row table built by hand, and at the component over a note. Neither of those is
 * where a user meets it. This is: the consuming card publishes nothing, shows no
 * partial sum, and its explanation names the row, through the resolver and
 * explainer pair the sheet actually hands a component.
 */
describe('a row an aggregate cannot read, on the card that asked', () => {
	/** The rope's weight is prose, and it is carried, so no filter hides it. */
	const PROSE = `---
sheet-layout: Blades in the Dark
---

## Inventory

| Item | Qty | Weight | Carried |
| --- | --- | --- | --- |
| Dagger | 2 | 1 | yes |
| Rope | 1 | a coil | yes |
| Climbing gear | 1 | 2 | no |
`;

	const sheet = sheetFrom(INVENTORY, PROSE);

	it('fails on an unfiltered aggregate too, not only the filtered one', () => {
		// `carried_weight` reaches the rope only because it is carried. An
		// unfiltered sum reaches every row by construction, so this is the one
		// that cannot be passing for the wrong reason.
		//
		// And it names the operator rather than `sum()`, because `Qty * Weight`
		// fails inside the multiplication before the aggregate has a result to
		// type-check. That is the row prefix doing its job over the whole
		// expression rather than over the aggregate's own gate: whatever went
		// wrong in a row expression, the reader is told which row.
		expect(sheet.resolvedFor('encumbrance').derived).toBeNull();
		expect(sheet.explainFor('encumbrance', 'derived')).toBe(
			'Row "Rope": "*" needs a number, got "a coil".',
		);
	});

	it('publishes nothing, rather than the sum of the rows it could read', () => {
		// 1 is the dagger and 3 is the note's other two. Neither is publishable:
		// a quietly wrong number is worse than a missing one, which is the
		// totals row's rule and the reason this one is not a second answer.
		expect(sheet.resolvedFor('carried_weight').derived).toBeNull();
		expect(sheet.sheet('carried_weight')).toBeUndefined();
	});

	it('names the row in the explanation the card shows', () => {
		// The half of the rule a reader can act on. Without the row it says only
		// that something is not a number, over however many rows they own.
		expect(sheet.explainFor('carried_weight', 'derived')).toBe(
			'Row "Rope": sum() needs a number, got "a coil".',
		);
	});

	it('leaves the aggregates that do not touch the cell working', () => {
		// count() evaluates no per-row expression, so the unreadable cell is not
		// its business — one component's failure never takes the sheet down.
		expect(sheet.resolvedFor('items').derived).toBe(3);
		expect(sheet.explainFor('items', 'derived')).toBeNull();
	});
});

/*
 * A section that will not read (SPEC §10).
 *
 * The rule is one sentence in `renderSheet` — a component that failed to read
 * publishes nothing — and it is the one the whole file is here to hold, because
 * nothing else can see it. A read failure leaves `data` null, and null is
 * indistinguishable from a card with nothing stored yet: without the gate a
 * Table's declared rows are handed out with blank cells, and every number
 * derived from them is confidently wrong beside a card saying it could not read
 * the section.
 */
describe('a section the component refuses to read', () => {
	/** Two tables in one section: the body `read` refuses outright, because an
	 * edit reports a row by its position and there is no one body to count in. */
	const AMBIGUOUS = `---
sheet-layout: Blades in the Dark
---

## Inventory

| Item | Qty | Weight | Carried |
| --- | --- | --- | --- |
| Dagger | 2 | 1 | yes |

| Item | Qty | Weight | Carried |
| --- | --- | --- | --- |
| Climbing gear | 1 | 2 | no |
`;

	const sheet = sheetFrom(INVENTORY, AMBIGUOUS);

	it('reports the section as unreadable rather than as empty', () => {
		// The premise. Without this the rest of the describe passes vacuously
		// against a section that read perfectly well.
		const entry = sheet.prepared.find((item) => item.config.id === 'inventory');
		expect(entry?.error).toContain('more than one table');
		expect(entry?.data).toBeNull();
	});

	it('publishes no total, rather than the total of a table it could not read', () => {
		// 3 is the answer the note holds and 0 is what the declared rows come to.
		// Neither is publishable: the card cannot say what the column is worth.
		expect(sheet.sheet('inventory.Weight')).toBeUndefined();
		expect(sheet.sheet('inventory.Carried')).toBeUndefined();
		expect(sheet.resolvedFor('load').derived).toBeNull();
	});

	it('holds no rows for an aggregate, rather than the rows the layout declared', () => {
		expect(sheet.resolvedFor('carried_weight').derived).toBeNull();
		expect(sheet.resolvedFor('encumbrance').derived).toBeNull();
		expect(sheet.resolvedFor('items').derived).toBeNull();
		expect(sheet.explainFor('items', 'derived')).toBe(
			'"inventory" holds no rows for count() to read. Only a table does, and a table showing an error of its own holds none until that is fixed.',
		);
	});

	it('leaves every card that does not read it working', () => {
		// One component's failure never takes down the sheet (SPEC §10), and the
		// cards that do read it fail on themselves and say why.
		const other = sheetFrom(LAYOUT, NOTE);
		expect(other.sheet('abilities.DEX')).toBe(4);
		expect(sheet.explainFor('load', 'derived')).toContain('inventory.Weight');
	});
});

/*
 * The same sheet, with its cards inside containers (SPEC §13).
 *
 * The claim this file exists to hold about nesting is a negative one:
 * containment is arrangement and never addressing, so a card two containers deep
 * publishes exactly the name it publishes at the top level and every formula on
 * the sheet reads the same as before. Driven through the name table rather than
 * through the renderer, because that is where the claim actually lives — a
 * container that quietly added a segment would still draw perfectly.
 */
describe('the same layout with its cards inside two containers', () => {
	/** Wrap every component in a Group, and those Groups in one more. */
	function nest(source: string): string {
		const layout = JSON.parse(source) as {
			components: ComponentConfig[];
			[key: string]: unknown;
		};
		return JSON.stringify({
			...layout,
			components: [
				{
					id: 'sheet_region',
					type: 'group',
					label: 'Everything',
					position: { col: 1, row: 1, width: 6, height: 6 },
					children: layout.components.map((config, index) => ({
						id: `wrap_${index}`,
						type: 'group',
						label: `Region ${index + 1}`,
						position: { col: 1, row: index + 1, width: 6, height: 1 },
						children: [config],
					})),
				},
			],
		});
	}

	const flat = sheetFrom(LAYOUT, NOTE);
	const deep = sheetFrom(nest(LAYOUT), NOTE);

	it('reaches the cards inside the containers at all', () => {
		// The premise. Without it every assertion below passes over a sheet whose
		// cards were never read, which is exactly how a nested layout would look
		// if the walk stopped at the top level.
		expect(deep.prepared.map((entry) => entry.config.id)).toContain('abilities');
		expect(deep.prepared).toHaveLength(flat.prepared.length + 4);
	});

	it('publishes every name unchanged, at any depth', () => {
		// No segment is added, so `abilities.DEX` is `abilities.DEX` — which is
		// what keeps §13's open question about how deep a published name may go
		// exactly where it was.
		expect(deep.sheet('abilities.DEX')).toBe(flat.sheet('abilities.DEX'));
		expect(deep.sheet('abilities.DEX.value')).toBe(
			flat.sheet('abilities.DEX.value'),
		);
		expect(deep.sheet('sheet_region')).toBeUndefined();
		expect(deep.sheet('wrap_0')).toBeUndefined();
	});

	it('resolves a formula reading across the containers', () => {
		// `spell_dc` is `8 + prof + mod(abilities.DEX.value)`, and it now sits in
		// a different container from the ability it reads. A closed container
		// changes nothing about it: hiding is never a way to make a formula not
		// run.
		expect(deep.resolvedFor('spell_dc').derived).toBe(
			flat.resolvedFor('spell_dc').derived,
		);
	});

	it('reads no section for a container, whatever the note holds', () => {
		// `storage: 'none'`, so a note holding unmapped prose under a heading
		// that happened to match a container's label is never even looked at.
		const containers = deep.prepared.filter(
			(entry) => isContainer(entry.component),
		);
		expect(containers).toHaveLength(4);
		for (const entry of containers) {
			expect(entry.data).toBeNull();
			expect(entry.error).toBeNull();
		}
	});
});

/*
 * A choice worth arithmetic, which is what the value-and-label split buys and
 * the whole reason an option stores a value rather than a label (SPEC §13).
 *
 * The expression language has no string literals, deliberately, so a dropdown
 * storing words publishes something no formula can compare or add to. Here the
 * author put the arithmetic in the value — 2 shown as "Expertise" — and the
 * same expression a `level` column takes, `Training * prof`, works on a card.
 * Run through the real parsers because nothing about it is new code: this is
 * `coerceValue` doing to a card's stored `2` what it already does to a cell's.
 */
const PROFICIENCY = JSON.stringify({
	name: 'Graded training',
	columns: 6,
	functions: ['prof = ceil(level / 4) + 1'],
	components: [
		{
			id: 'level',
			type: 'card',
			label: 'Level',
			position: { col: 1, row: 1, width: 1, height: 1 },
		},
		{
			id: 'training',
			type: 'card',
			label: 'Training',
			// A card, not a column: a standalone graded choice gets a menu
			// rather than a ring, because a card has no column of neighbours to
			// read as a shape.
			options: [
				{ value: '0', label: 'Untrained' },
				{ value: '1', label: 'Proficient' },
				{ value: '2', label: 'Expertise' },
			],
			position: { col: 2, row: 1, width: 2, height: 1 },
		},
		{
			id: 'stealth',
			type: 'card',
			label: 'Stealth',
			derived: 'training * prof',
			position: { col: 4, row: 1, width: 2, height: 1 },
		},
	],
});

const ROGUE = `---
sheet-layout: Graded training
---

## Level
\`\`\`sheet
value: 5
\`\`\`

## Training
\`\`\`sheet
value: 2
\`\`\`
`;

describe('a card whose value is chosen from a list', () => {
	const { sheet, resolvedFor } = sheetFrom(PROFICIENCY, ROGUE);

	it('publishes the chosen value as a number', () => {
		expect(sheet('training')).toBe(2);
		expect(sheet('training.value')).toBe(2);
	});

	it('lets another card do arithmetic with the choice', () => {
		// prof is 3 at level 5, so expertise is +6 — the number issue #423
		// asked the closest analogue for, and no new code in src/formula/.
		expect(resolvedFor('stealth').derived).toBe(6);
	});

	it('publishes no label, under any name', () => {
		// A label is display and is unreachable from a formula (SPEC §5). The
		// fix for a layout that needs the word is to make the word the value.
		expect(sheet('training.label')).toBeUndefined();
		expect(sheet('training.Expertise')).toBeUndefined();
	});

	it('publishes nothing at all where nothing has been chosen', () => {
		const unset = sheetFrom(
			PROFICIENCY,
			ROGUE.replace('## Training\n```sheet\nvalue: 2\n```\n', ''),
		);
		// A name the sheet does not publish fails to resolve rather than
		// defaulting to zero, so the card downstream shows "?" instead of a
		// plausible bonus nobody chose.
		expect(unset.sheet('training')).toBeUndefined();
		expect(unset.resolvedFor('stealth').derived).toBeNull();
	});
});
