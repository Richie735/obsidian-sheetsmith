import { describe, expect, it } from 'vitest';
import {
	applyPromotedFields,
	parsePromotedFields,
	promotableNames,
} from './promoted-fields';
import { parseCharacter, serialiseCharacter } from './character';
import { Layout, parseLayout } from './layout';
import {
	modifierTargetSource,
	ModifierTargetSource,
	publishedEntries,
	publishedSuffixes,
} from '../formula/modifier-targets';
import { getComponent } from '../components';
import { walkComponents } from './layout-walk';
import { FieldValue } from '../types';

/*
 * The layout's promoted field list (SPEC §9), and what a note's frontmatter
 * therefore says.
 *
 * Nothing here imports `obsidian` (Constraint 5), so the whole of the list's
 * reading and the note's writing is driven without launching the app. The write
 * cadence, the generation re-check and the refusal notice are the view's and are
 * driven in `view/promoted-fields-flow.test.ts`.
 */

/**
 * A layout with one of each shape the picker has to cover: a Card publishing a
 * bare name, a Card set publishing named entries, a Track row set publishing a
 * `.left`, and a Table publishing a column total.
 */
const LAYOUT_SOURCE = JSON.stringify({
	name: 'L',
	components: [
		{
			id: 'armour_class',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 1, width: 2, height: 1 },
			derived: '10 + abilities.DEX.value',
		},
		{
			id: 'abilities',
			type: 'card-set',
			label: 'Abilities',
			position: { col: 3, row: 1, width: 4, height: 1 },
			entries: [{ key: 'STR' }, { key: 'DEX' }],
		},
		{
			id: 'clocks',
			type: 'track',
			label: 'Clocks',
			position: { col: 1, row: 2, width: 4, height: 1 },
			rows: [
				{ key: 'heat', count: 6 },
				{ key: 'wanted', count: 4 },
			],
		},
		{
			id: 'items',
			type: 'table',
			label: 'Magic items',
			position: { col: 1, row: 3, width: 6, height: 2 },
			columns: [{ key: 'Weight', type: 'number', total: true, publish: true }],
			rows: [{ label: 'Rope', key: 'rope' }],
		},
	],
});

/** The sources every caller of this module already has in hand. */
function sourcesOf(layout: Layout): ModifierTargetSource[] {
	return walkComponents(layout.components).map((entry) =>
		modifierTargetSource(entry.config, getComponent(entry.config.type)),
	);
}

const LAYOUT = parseLayout(LAYOUT_SOURCE);
const SOURCES = sourcesOf(LAYOUT);

/**
 * The same layout with a `promotedFields` list on it.
 *
 * **Named for the inflection rather than the bare word**, which is the spec's
 * naming rule: `promote`, `promoted`, `promotion` and `promoteFlow` all read in
 * a diff as the *modifier* sense — a typed modifier promoted into a definition,
 * which writes the layout file where this writes the note. `promoting` is none
 * of those, and what it returns names itself.
 */
function promoting(rows: unknown): Layout {
	return { ...LAYOUT, promotedFields: rows as Layout['promotedFields'] };
}

describe('promotableNames', () => {
	it('offers every published name and every suffix that name answers to', () => {
		expect(promotableNames(SOURCES).map((one) => one.name)).toEqual([
			'armour_class',
			'armour_class.value',
			'abilities.STR',
			'abilities.STR.value',
			'abilities.DEX',
			'abilities.DEX.value',
			'clocks.heat',
			'clocks.heat.value',
			'clocks.heat.left',
			'clocks.wanted',
			'clocks.wanted.value',
			'clocks.wanted.left',
			'items.Weight',
			'items.Weight.value',
			'items.rope',
			'items.rope.value',
		]);
	});

	it('is exactly what the one assembly plus the suffix policy produce', () => {
		/*
		 * The picker cannot drift from the assembly that already answers "what
		 * does this layout publish" for the modifier target picker, the suggester
		 * and the panel's own inventory. Composed here rather than compared
		 * against a literal, so the claim is about the composition and not about
		 * a list somebody typed out twice.
		 */
		const expected: string[] = [];
		for (const source of SOURCES) {
			for (const published of publishedEntries(source)) {
				expected.push(published.name);
				for (const suffix of publishedSuffixes(published.entry)) {
					expected.push(`${published.name}.${suffix}`);
				}
			}
		}
		expect(promotableNames(SOURCES).map((one) => one.name)).toEqual(expected);
	});

	it('offers .left only where the entry publishes one', () => {
		const names = promotableNames(SOURCES).map((one) => one.name);
		expect(names).toContain('clocks.heat.left');
		expect(names).not.toContain('armour_class.left');
		expect(names).not.toContain('abilities.DEX.left');
		expect(names).not.toContain('items.Weight.left');
	});

	it('shows a label rather than the name a formula writes', () => {
		// The target picker's own ruling: labels are unique on a layout by
		// construction, so the name costs most of the option's width to a
		// truncation and adds nothing a reader can use.
		const labels = new Map(
			promotableNames(SOURCES).map((one) => [one.name, one.label]),
		);
		expect(labels.get('abilities.DEX')).toBe('Abilities · DEX');
		expect(labels.get('abilities.DEX.value')).toBe('Abilities · DEX · stored');
		expect(labels.get('clocks.heat.left')).toBe('Clocks · heat · remaining');
		expect(labels.get('armour_class')).toBe('Armour class');
	});
});

describe('parsePromotedFields', () => {
	const parsed = (rows: unknown) => parsePromotedFields(promoting(rows), SOURCES);
	const messages = (rows: unknown) =>
		parsed(rows).problems.map((problem) => problem.message);

	it('reads a usable list as written, in declaration order', () => {
		expect(
			parsed([
				{ name: 'armour_class', property: 'ac' },
				{ name: 'clocks.heat.left', property: 'heat_left' },
			]),
		).toEqual({
			fields: [
				{ name: 'armour_class', property: 'ac' },
				{ name: 'clocks.heat.left', property: 'heat_left' },
			],
			retired: [],
			problems: [],
		});
	});

	it('reports a row with no value chosen', () => {
		expect(messages([{ property: 'ac' }])).toEqual([
			'A promoted field needs a value to copy. Choose one under Value.',
		]);
		// Addressed to the row, and to the **Value** picker rather than to the
		// property beside it: that is where the fix is, and a field deciding this
		// for itself from the property rules alone marked the wrong control.
		expect(parsed([{ property: 'ac' }]).problems[0]).toMatchObject({
			row: 0,
			control: 'value',
		});
	});

	it('reports a row with no property', () => {
		expect(messages([{ name: 'armour_class' }])).toEqual([
			'"armour_class" is copied nowhere, because it names no property. Type one under Property.',
		]);
	});

	it('reports a property the frontmatter format refuses', () => {
		// The rule is `parse/frontmatter.ts`'s; the subject is this surface's.
		for (const property of ['a:b', 'a#b', ' ac', 'ac ']) {
			const problems = parsed([{ name: 'armour_class', property }]).problems;
			expect(problems, property).toHaveLength(1);
			expect(problems[0]?.message, property).toContain(
				`"${property}" cannot be a frontmatter property`,
			);
			expect(problems[0], property).toMatchObject({
				row: 0,
				control: 'property',
			});
		}
	});

	it('reports a property promoted twice, keeping the first and dropping the second', () => {
		const result = parsed([
			{ name: 'armour_class', property: 'ac' },
			{ name: 'items.Weight', property: 'ac' },
		]);
		expect(result.fields).toEqual([{ name: 'armour_class', property: 'ac' }]);
		expect(result.problems[0]?.message).toContain('is promoted more than once');
	});

	it('reports a property named sheet-layout, which is the plugin’s own', () => {
		const result = parsed([{ name: 'armour_class', property: 'sheet-layout' }]);
		expect(result.fields).toEqual([]);
		expect(result.problems[0]?.message).toContain(
			"is this plugin's own property",
		);
	});

	it('reports a value the layout does not publish', () => {
		const result = parsed([{ name: 'armor_class', property: 'ac' }]);
		expect(result.fields).toEqual([]);
		expect(result.problems[0]?.message).toContain(
			'which this layout publishes no value under',
		);
	});

	it('leaves a usable row standing beside an unusable sibling', () => {
		// One typo must not stop every other property being written.
		const result = parsed([
			{ name: 'nope' },
			{ name: 'armour_class', property: 'ac' },
			{ property: 'orphan' },
		]);
		expect(result.fields).toEqual([{ name: 'armour_class', property: 'ac' }]);
		expect(result.problems).toHaveLength(2);
	});

	it('reads a member the file holds as the wrong kind as absent', () => {
		// `parseLayout` checked that each row is an object and nothing more, so a
		// hand-edited file may hold a number where a name goes.
		expect(messages([{ name: 12, property: 'ac' }])).toEqual([
			'A promoted field needs a value to copy. Choose one under Value.',
		]);
	});

	it('does no work at all where the layout promotes nothing', () => {
		expect(parsePromotedFields(LAYOUT, SOURCES)).toEqual({
			fields: [],
			retired: [],
			problems: [],
		});
	});
});

/*
 * `retired` is the one list here that causes a note to be written, so what it
 * holds is asserted case by case rather than by sampling.
 */
/*
 * The two strings a problem carries, and the bound that keeps them different
 * jobs.
 *
 * **This is the guard the regression earned.** The field used to cut its own
 * label out of `message`, "up to the first full stop", and for the one fault a
 * reader is most often sent to that full stop comes at the end of the whole
 * diagnosis — so a 15-word clause wrapped under a 335px control and the report
 * 60px below repeated it word for word. The containment check that was here
 * could not see it: a string is trivially contained in itself.
 *
 * So the invariants are about *size and shape* rather than about agreement: a
 * mark is one clause, it is not a sentence, and it is not the message.
 */
describe('the mark a control shows against the message the report shows', () => {
	/** Every fault this parser can report, each over one row. */
	const EVERY_FAULT: readonly { rows: unknown[]; fault: string }[] = [
		{ rows: [{ property: 'ac' }], fault: 'no value chosen' },
		{ rows: [{ name: 'armour_class' }], fault: 'no property' },
		{
			rows: [{ name: 'armour_class', property: 'a:b' }],
			fault: 'a property the format refuses',
		},
		{
			rows: [{ name: 'armour_class', property: 'sheet-layout' }],
			fault: "the plugin's own property",
		},
		{
			rows: [
				{ name: 'armour_class', property: 'ac' },
				{ name: 'items.Weight', property: 'ac' },
			],
			fault: 'a property promoted twice',
		},
		{
			rows: [{ name: 'armor_class', property: 'ac' }],
			fault: 'a value the layout does not publish',
		},
	];

	/**
	 * The longest mark any fault produces with an ordinary name in it, plus
	 * room.
	 *
	 * Measured: the two longest are 50 characters. The variable half is the
	 * author's own property or value name, which is theirs to make long and
	 * which the control wraps exactly as it wraps a chosen option — so what this
	 * bounds is the *fixed* half, which is the half a later pass could grow into
	 * a diagnosis.
	 */
	const CLAUSE_CEILING = 60;

	it('marks each fault with one clause, never a sentence', () => {
		for (const { rows, fault } of EVERY_FAULT) {
			const problem = parsePromotedFields(promoting(rows), SOURCES).problems[0];
			expect(problem, fault).toBeDefined();
			const mark = problem?.mark ?? '';
			// No full stop at all: the field appends one, so a mark holding one
			// has become prose. This is the sharp half of the guard.
			expect(mark, fault).not.toContain('.');
			expect(mark.length, `${fault}: ${mark}`).toBeLessThanOrEqual(
				CLAUSE_CEILING,
			);
		}
	});

	it('never lets the mark be the message, which is how this failed twice', () => {
		/*
		 * Both directions the old derivation failed in. It cut `message` at its
		 * first `'. '`, which returned the *whole diagnosis* where that stop came
		 * at the end of one — and the whole *message*, 197 characters of it,
		 * where `frontmatterKeyProblem`'s clause holds no stop at all and
		 * `indexOf` answered `-1`.
		 *
		 * Deliberately not "differs from the message's first sentence": for a
		 * fault whose first sentence is already one clause — a property promoted
		 * twice — the mark and that sentence are legitimately the same words, and
		 * asserting otherwise would forbid the right answer. What the pair above
		 * bounds is size and shape; what this bounds is that the field never gets
		 * handed the whole thing.
		 */
		for (const { rows, fault } of EVERY_FAULT) {
			const problem = parsePromotedFields(promoting(rows), SOURCES).problems[0];
			expect(problem?.mark, fault).not.toBe(problem?.message);
			expect((problem?.mark ?? '').length, fault).toBeLessThan(
				(problem?.message ?? '').length,
			);
		}
	});

	it('still says the whole thing in the message, for a reader scrolling to it', () => {
		// The report is read by somebody who is not standing on the row, so it
		// keeps the diagnosis and the fix even where the control is marked.
		const problem = parsePromotedFields(
			promoting([{ name: 'armor_class', property: 'ac_old' }]),
			SOURCES,
		).problems[0];
		expect(problem?.message).toBe(
			'"ac_old" copies "armor_class", which this layout publishes no value under, so the property is cleared. Choose one it does, or correct the spelling.',
		);
		expect(problem?.mark).toBe('"armor_class" is not a value this layout publishes');
	});
});

describe('which rows are retired', () => {
	const parsed = (rows: unknown) => parsePromotedFields(promoting(rows), SOURCES);

	it('retires a row whose name the layout no longer publishes', () => {
		expect(parsed([{ name: 'armor_class', property: 'ac' }]).retired).toEqual([
			{ name: 'armor_class', property: 'ac' },
		]);
	});

	it('retires nothing for a row with no value chosen', () => {
		expect(parsed([{ property: 'ac' }]).retired).toEqual([]);
	});

	it('retires nothing for a row with no property', () => {
		// There is nothing to remove, which is the whole reason this is not the
		// structural arm.
		expect(parsed([{ name: 'armor_class' }]).retired).toEqual([]);
	});

	it('retires nothing for a property the format refuses', () => {
		expect(parsed([{ name: 'armor_class', property: 'a:b' }]).retired).toEqual([]);
	});

	it('retires nothing for the plugin’s own property', () => {
		expect(
			parsed([{ name: 'armor_class', property: 'sheet-layout' }]).retired,
		).toEqual([]);
	});

	it('retires nothing for a property promoted twice', () => {
		expect(
			parsed([
				{ name: 'armour_class', property: 'ac' },
				{ name: 'items.Weight', property: 'ac' },
			]).retired,
		).toEqual([]);
	});

	it('never retires a property a usable row claims, whatever a sibling says', () => {
		/*
		 * The guard this rule turns on. Without it the second row deletes what
		 * the first one writes, once per render, for as long as both are listed —
		 * and the order of the two would decide which.
		 */
		for (const rows of [
			[
				{ name: 'armour_class', property: 'ac' },
				{ name: 'armor_class', property: 'ac' },
			],
			[
				{ name: 'armor_class', property: 'ac' },
				{ name: 'armour_class', property: 'ac' },
			],
		]) {
			const result = parsed(rows);
			expect(result.retired).toEqual([]);
			expect(result.fields).toEqual([{ name: 'armour_class', property: 'ac' }]);
		}
	});

	it('retires nothing under a component this version cannot draw', () => {
		/*
		 * **The case that separates the two arms most sharply.** A layout shared
		 * from a newer plugin version, or a hand-edited `type` typo, publishes
		 * nothing — so the structural arm would clear the property in every note
		 * whose sheet is opened, for a component still declared and still holding
		 * its data. It is the transient case by the spec's own separator: the
		 * sheet has no answer about that value because it cannot draw it at all.
		 *
		 * `unknownType` is what carries the difference, and it comes from the one
		 * place the registry lookup's failure is visible
		 * (`modifierTargetSource`).
		 */
		const unknown = parseLayout(
			LAYOUT_SOURCE.replace('"type":"card"', '"type":"thermometer"'),
		);
		const sources = sourcesOf(unknown);
		expect(sources[0]?.unknownType).toBe(true);

		const result = parsePromotedFields(
			{ ...unknown, promotedFields: [{ name: 'armour_class', property: 'ac' }] },
			sources,
		);
		expect(result.retired).toEqual([]);
		// In `fields`, where the resolver answers nothing: unresolved by
		// construction rather than by a second branch in the writer.
		expect(result.fields).toEqual([{ name: 'armour_class', property: 'ac' }]);
		expect(result.problems[0]?.message).toContain(
			'a type this version of Sheetsmith does not have',
		);
		// And it says nothing about repointing the row, which is correct.
		expect(result.problems[0]?.message).not.toContain('Choose one');
	});

	it('asks for one removal where two retired rows claim one property', () => {
		expect(
			parsed([
				{ name: 'armor_class', property: 'ac' },
				{ name: 'armour_klass', property: 'ac' },
			]).retired,
		).toHaveLength(1);
	});
});

describe('applyPromotedFields', () => {
	const NOTE = [
		'---',
		'sheet-layout: L',
		'# who this is',
		"player: 'Ana'",
		'---',
		'',
		'## Armour class',
		'```sheet',
		'value: 15',
		'```',
		'',
	].join('\n');

	/** Every name that resolves on this render, and nothing else. */
	const resolving = (values: Record<string, FieldValue>) =>
		(name: string): FieldValue | undefined =>
			values[name];

	function write(
		source: string,
		rows: unknown,
		values: Record<string, FieldValue> = {},
	) {
		const note = parseCharacter(source);
		const parsed = parsePromotedFields(promoting(rows), SOURCES);
		const result = applyPromotedFields(note, parsed, resolving(values));
		return {
			...result,
			text: result.note === 'unchanged' ? source : serialiseCharacter(result.note),
		};
	}

	it('writes each property once, before the closing delimiter', () => {
		const { text } = write(
			NOTE,
			[
				{ name: 'armour_class', property: 'ac' },
				{ name: 'clocks.heat.left', property: 'heat_left' },
			],
			{ armour_class: 17, 'clocks.heat.left': 2 },
		);
		expect(text).toBe(
			NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: 17\nheat_left: 2\n"),
		);
	});

	it('appends in the layout’s declaration order', () => {
		const { text } = write(
			NOTE,
			[
				{ name: 'clocks.heat.left', property: 'heat_left' },
				{ name: 'armour_class', property: 'ac' },
			],
			{ armour_class: 17, 'clocks.heat.left': 2 },
		);
		expect(text).toContain("player: 'Ana'\nheat_left: 2\nac: 17\n");
	});

	it('carries every other byte of the note through', () => {
		const { text } = write(NOTE, [{ name: 'armour_class', property: 'ac' }], {
			armour_class: 17,
		});
		expect(text).toContain('# who this is');
		expect(text).toContain("player: 'Ana'");
		expect(text).toContain('## Armour class\n```sheet\nvalue: 15\n```\n');
	});

	it('reports unchanged where every line already agrees', () => {
		const held = NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: 17\n");
		const result = write(held, [{ name: 'armour_class', property: 'ac' }], {
			armour_class: 17,
		});
		expect(result.note).toBe('unchanged');
		expect(result.text).toBe(held);
	});

	it('writes a value whose spelling differs but whose meaning does not', () => {
		// The sheet owns the spelling, because the spelling is the type.
		const held = NOTE.replace("player: 'Ana'\n", 'player: \'Ana\'\nac: "17"\n');
		const { text } = write(held, [{ name: 'armour_class', property: 'ac' }], {
			armour_class: 17,
		});
		expect(text).toContain('ac: 17\n');
	});

	it('writes the other fields where one is refused', () => {
		const held = NOTE.replace(
			"player: 'Ana'\n",
			"player: 'Ana'\nac:\n  - 17\n  - 18\n",
		);
		const result = write(
			held,
			[
				{ name: 'armour_class', property: 'ac' },
				{ name: 'items.Weight', property: 'weight' },
			],
			{ armour_class: 17, 'items.Weight': 30 },
		);
		expect(result.refusals).toEqual([
			{
				property: 'ac',
				reason:
					'this note already has a "ac" holding a list. Remove it, or point the layout’s promoted field at another property.',
			},
		]);
		expect(result.text).toContain('weight: 30\n');
		expect(result.text).toContain('ac:\n  - 17\n  - 18\n');
	});

	it('reports a doubled key and an unaccountable block in their own words', () => {
		const doubled = write(
			NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: 1\nac: 2\n"),
			[{ name: 'armour_class', property: 'ac' }],
			{ armour_class: 17 },
		);
		expect(doubled.refusals[0]?.reason).toBe(
			'this note has "ac" twice in its frontmatter. Remove one of them, or point the layout’s promoted field at another property.',
		);

		const unaccountable = write(
			NOTE.replace("player: 'Ana'\n", 'tags:\n- party\n'),
			[{ name: 'armour_class', property: 'ac' }],
			{ armour_class: 17 },
		);
		expect(unaccountable.refusals).toHaveLength(1);
		expect(unaccountable.refusals[0]?.property).toBeUndefined();
		expect(unaccountable.refusals[0]?.reason).toBe(
			'this note\'s frontmatter has a line Sheetsmith cannot account for: "- party". Fix that line, and the property is written on the next render.',
		);
		expect(unaccountable.note).toBe('unchanged');
	});

	it('removes a retired row’s property, and nothing else', () => {
		const held = NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: 17\n");
		const { text } = write(held, [{ name: 'armor_class', property: 'ac' }]);
		expect(text).toBe(NOTE);
	});

	it('leaves a retired row’s property alone where the note does not hold it', () => {
		expect(write(NOTE, [{ name: 'armor_class', property: 'ac' }]).note).toBe(
			'unchanged',
		);
	});

	it('refuses rather than deleting a structure under a retired property', () => {
		// A list the user built under that property cannot be told from a scalar
		// afterwards, so the removal refuses exactly as a write would.
		const held = NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: [17, 18]\n");
		const result = write(held, [{ name: 'armor_class', property: 'ac' }]);
		expect(result.note).toBe('unchanged');
		expect(result.refusals[0]?.property).toBe('ac');
	});

	/*
	 * **The two arms of "the value is not there", asserted apart.** This is the
	 * criterion the revised rule turns on: a `retired` row's property is removed,
	 * and a `fields` row that merely did not resolve leaves the note
	 * byte-identical — property, modified time and all. Driven over each
	 * transient cause separately, because they reach the resolver by different
	 * routes and a single case would prove one of them.
	 */
	describe('a value that is published and did not resolve', () => {
		const held = NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: 17\n");

		/*
		 * **One case, not one per cause.** This was three — a formula that will
		 * not parse, a formula naming an unknown name, a section that will not
		 * read — and all three drove the same resolver answering `undefined`,
		 * differing only in their titles. Three titles claiming three causes over
		 * one input is `docs/PATTERNS.md` §10's vacuous pass one step over: all
		 * three would have gone on passing if every real path regressed.
		 *
		 * What this module can honestly assert is the *rule*: a name that answers
		 * nothing leaves its property alone. That the real causes reach it by
		 * answering nothing is the sheet's fact, and it is asserted where the
		 * sheet is — `view/promoted-fields-flow.test.ts` drives a card whose
		 * formula genuinely will not parse, through `buildSheet` and the real
		 * name table.
		 */
		it('leaves the property byte-identical where the name answers nothing', () => {
			const result = applyPromotedFields(
				parseCharacter(held),
				parsePromotedFields(
					promoting([{ name: 'armour_class', property: 'ac' }]),
					SOURCES,
				),
				() => undefined,
			);
			expect(result.note).toBe('unchanged');
			expect(result.refusals).toEqual([]);
		});

		for (const value of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			it(`leaves the property byte-identical where the value is ${value}`, () => {
				// A number with no YAML spelling is the transient arm too: a sheet
				// holding a number it cannot express is in the same position as
				// one holding no number yet.
				const result = applyPromotedFields(
					parseCharacter(held),
					parsePromotedFields(
						promoting([{ name: 'armour_class', property: 'ac' }]),
						SOURCES,
					),
					resolving({ armour_class: value }),
				);
				expect(result.note).toBe('unchanged');
				expect(result.refusals).toEqual([]);
			});
		}

		it('removes the retired arm’s property in the same pass that leaves the other', () => {
			// Both arms at once, because the pair is what the design turns on.
			const both = NOTE.replace(
				"player: 'Ana'\n",
				"player: 'Ana'\nac: 17\nweight: 30\n",
			);
			const result = applyPromotedFields(
				parseCharacter(both),
				parsePromotedFields(
					promoting([
						{ name: 'armour_class', property: 'ac' },
						{ name: 'items.Wieght', property: 'weight' },
					]),
					SOURCES,
				),
				resolving({}),
			);
			expect(result.note).not.toBe('unchanged');
			expect(
				serialiseCharacter(result.note as Exclude<typeof result.note, string>),
			).toBe(both.replace('weight: 30\n', ''));
		});
	});

	it('writes nothing at all through a sequence of unresolvable states', () => {
		/*
		 * The churn case the old rule paid for. Asserted as a **write count** of
		 * zero rather than as a final state, since a strip and a restore end
		 * where they started and would pass a state assertion.
		 */
		const held = NOTE.replace("player: 'Ana'\n", "player: 'Ana'\nac: 17\n");
		let writes = 0;
		let text = held;
		// Each step is one intermediate state of a formula being typed: nothing
		// resolves in any of them, and the last one resolves to what is stored.
		for (const value of [undefined, undefined, undefined, 17] as const) {
			const result = applyPromotedFields(
				parseCharacter(text),
				parsePromotedFields(
					promoting([{ name: 'armour_class', property: 'ac' }]),
					SOURCES,
				),
				() => value,
			);
			if (result.note === 'unchanged') continue;
			writes++;
			text = serialiseCharacter(result.note);
		}
		expect(writes).toBe(0);
		expect(text).toBe(held);
	});
});
