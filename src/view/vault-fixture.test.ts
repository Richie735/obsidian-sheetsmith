/*
 * The throwaway vault fixture, run through the real parsers.
 *
 * `AGENTS.md` puts the vault outside the repository and its recipe inside it,
 * on the argument that "a criterion saying 'it is in the vault' is a claim; a
 * list of what the vault holds is something the next reviewer can check against
 * their own copy". The recipe for item modifiers was prose, so nothing checked
 * that the two files it described would even load — which is how a fixture comes
 * to be described and never built. The files now exist literally, in
 * `src/test/fixtures/modifiers/`, and this is the check that they load, read, and
 * produce the arithmetic the recipe's press steps promise.
 *
 * **Why the files are files and not fenced blocks in the feature doc.** Three
 * reasons, in the order they decide it. The layout is addressed by *filename* —
 * `sheet-layout` names `<folder>/<that name>.json` (`src/layouts.ts`) — so
 * `Modifier variations.json` is part of the fixture and a fence cannot carry it. The
 * owner copies two files rather than transcribing two blocks, which is the whole
 * point. And a doc holding no copy has nothing to drift from: extracting content
 * back out of prose would make the fence the source of truth and the extraction
 * a second parser to maintain. `docs/PATTERNS.md` §2 already names `src/test/`
 * as the home of "the fixtures", so this needs no new folder policy.
 *
 * **What this file cannot check, and does not pretend to.** Every press step in
 * the recipe needs the app: a hover preview, a rename propagating, a real
 * markdown render, the form opened by a press, a layout file written from a sheet.
 * Those are why the vault exists. What is
 * checkable without it is that the files are well formed and that the numbers
 * the steps tell the reader to expect are the numbers the engine produces — so a
 * step that has gone stale fails here instead of wasting the owner's afternoon.
 *
 * **Both tiers are in the files rather than only in tests.** A cell holding a name
 * and an effect typed on the row; a typed override contesting with two named ones;
 * a typed effect naming a bonus type the layout does not declare; a typed effect
 * with no amount; and a definition name carrying a `+1` that is deliberately not
 * read as arithmetic. Every one of those is a state the owner can press rather than
 * a state a string replace in this file manufactures.
 *
 * It mirrors `worked-examples.test.ts`'s wiring, which mirrors
 * `SheetView.renderSheet`, and adds the one part that file has no need for: the
 * modifier context. If the three ever disagree, the view is the one that is
 * right.
 *
 * **There are two fixtures here now, and `sheetFrom` is what makes a second one
 * cheap.** The item-modifiers pair is the file's subject and keeps every case
 * below it; the Record set pair (`src/test/fixtures/records/`) gets one describe
 * at the foot, asking only what a fixture check can ask — that both files load,
 * that the note's stated states are the states the parsers produce, and that the
 * numbers the recipe's press steps promise are the numbers the engine produces.
 * Everything the recipe asks the owner to *press* needs the app, which is why the
 * vault exists.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import {
	modifierBreakdown,
	modifierOutcomeText,
	modifierRowName,
	modifierRowText,
	rowModifiers,
} from '../components/modifier-breakdown';
import { TableConfig, TableData, table } from '../components/table';
import {
	RecordSetConfig,
	RecordSetData,
} from '../components/record-set';
import { parseFunctions } from '../formula/functions';
import { modifierTargetSource } from '../formula/modifier-targets';
import { makeFieldResolver, resolveFormulaFields } from '../formula/resolve';
import { buildSheet } from '../formula/sheet';
import { getSection, parseCharacter, serialiseCharacter } from '../parse/character';
import { parseLayout, serialiseLayout } from '../parse/layout';
import { cellParts } from '../parse/modifier-cell';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { walkComponents } from '../parse/layout-walk';
import { isContainer } from '../types';

/**
 * Where the two files sit, and the constants the feature doc's paths have to
 * agree with. A test that read them through a hard-coded string in two places
 * would not notice the folder moving under one of them.
 */
const FIXTURE_DIR = new URL('../test/fixtures/modifiers/', import.meta.url);
const LAYOUT_FILE = 'Modifier variations.json';
const NOTE_FILE = 'Ilona.md';

const LAYOUT_TEXT = readFileSync(new URL(LAYOUT_FILE, FIXTURE_DIR), 'utf8');
const NOTE_TEXT = readFileSync(new URL(NOTE_FILE, FIXTURE_DIR), 'utf8');

/** The Record set fixture, on the same terms and in a folder of its own. */
const RECORDS_DIR = new URL('../test/fixtures/records/', import.meta.url);
const RECORDS_LAYOUT_FILE = 'Record variations.json';
const RECORDS_NOTE_FILE = 'Records.md';

const RECORDS_LAYOUT_TEXT = readFileSync(
	new URL(RECORDS_LAYOUT_FILE, RECORDS_DIR),
	'utf8',
);
const RECORDS_NOTE_TEXT = readFileSync(
	new URL(RECORDS_NOTE_FILE, RECORDS_DIR),
	'utf8',
);

/**
 * What `SheetView.renderSheet` builds, minus the DOM.
 *
 * Named for what it takes — two files — now that the *environment* half of it is
 * `formula/sheet.ts`'s own `buildSheet`, called below rather than re-derived.
 */
function sheetFrom(layoutSource: string, noteSource: string) {
	const layout = parseLayout(layoutSource);
	const { library, problems } = parseFunctions(layout.functions);
	const note = parseCharacter(noteSource);

	const prepared = walkComponents(layout.components).map(({ config }) => {
		const component = getComponent(config.type);
		if (!component) throw new Error(`No component of type "${config.type}".`);
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

	// **Through the view's own `buildSheet`**, which is the point of this file
	// mirroring `renderSheet` rather than re-deriving it: a fixture check that
	// wired modifiers its own way would assert the arithmetic of a lookalike. This
	// was a third copy of the sequence, which is the "two independent assemblies
	// from different inputs" bug `modifier-targets.ts`'s header records the
	// previous feature being taken to fix.
	const { env, modifiers } = buildSheet(layout, prepared, library);
	// The editor's half of the same read, for the cases about what it reports. The
	// definitions themselves come out of `buildSheet` above, so this asks the same
	// parser for the problems rather than for a second list.
	const parsedDefinitions = parseModifierDefinitions(
		layout,
		prepared.map((entry) => modifierTargetSource(entry.config, entry.component)),
	);

	const entryFor = (id: string) => {
		const found = prepared.find((item) => item.config.id === id);
		if (!found) throw new Error(`No component with id "${id}".`);
		return found;
	};

	return {
		layout,
		note,
		problems,
		env,
		sheet: env.sheet,
		modifiers,
		/** What the layout editor's Modifiers list reports under itself. */
		definitions: parsedDefinitions,
		prepared,
		entryFor,
		/**
		 * A Card's derived as the card itself resolves it, which means passing
		 * the name this evaluation publishes under — `context.resolveField(
		 * 'derived', { value: raw }, config.id)` in `card.ts`.
		 *
		 * **The name is the whole point of going through this rather than
		 * `resolveFormulaFields`**, which takes no name and so reads `mod.self`
		 * as 0. That is the feature doc's Risk 1 — "a component that forgets to
		 * pass its published name silently reads `mod.self` as 0" — and the test
		 * below drives it deliberately, because writing this helper the other way
		 * round is exactly how a fixture check would have passed on the wrong
		 * number.
		 */
		derivedFor: (id: string) => {
			const entry = entryFor(id);
			const stored = (entry.data as { value?: string } | null)?.value ?? '';
			return makeFieldResolver(
				entry.component,
				entry.config,
				entry.data,
				env,
			)('derived', { value: stored }, entry.config.id);
		},
		/** The same field with no published name, which is Risk 1's shape. */
		derivedWithoutName: (id: string) => {
			const entry = entryFor(id);
			return resolveFormulaFields(
				entry.component,
				entry.config,
				entry.data,
				env,
			).derived;
		},
	};
}

/** The fixture's Magic items section as Table's own `read` gives it up. */
function magicItems(noteSource: string): {
	config: TableConfig;
	data: TableData;
} {
	const built = sheetFrom(LAYOUT_TEXT, noteSource);
	const entry = built.entryFor('magic_items');
	expect(entry.error).toBeNull();
	return {
		config: entry.config as TableConfig,
		data: entry.data as TableData,
	};
}


describe('the layout file the fixture recipe names', () => {
	const { layout, problems } = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);

	it('is accepted by the real layout parser', () => {
		expect(layout.name).toBe(LAYOUT_FILE.replace(/\.json$/, ''));
		// Six columns, not the plugin's default twelve: every layout in the
		// throwaway vault is `"columns": 6`, and a fixture laying out on a
		// different grid from its siblings looks different for a reason that has
		// nothing to do with what it tests.
		expect(layout.columns).toBe(6);
		expect(problems).toEqual([]);
		// Not a vacuous pass: six components, and every one of them a type the
		// registry actually has.
		expect(layout.components).toHaveLength(6);
		for (const config of layout.components) {
			expect(getComponent(config.type), config.type).toBeDefined();
		}
	});

	it('keeps every id exactly as written, so no formula in it is rewritten', () => {
		// `migrateId` rewrites an unreferencable id, and a fixture whose ids
		// moved under it would have formulas pointing at names that no longer
		// exist. Nothing here is hyphenated, and this is what says so.
		expect(layout.components.map((config) => config.id)).toEqual([
			'abilities',
			'armour_class',
			'passive_perception',
			'skills',
			'magic_items',
			'worn_items',
		]);
	});

	it('declares the four bonus types, one of them deliberately unused', () => {
		/*
		 * **Both halves of the vocabulary's edge are in the files.** `morale` is
		 * declared and used by nothing, which is what a layout carrying a system's
		 * whole list looks like; and `luck` is *used and not declared* — by a typed
		 * effect in the note — which is the one thing stored in a note that names
		 * the layout's vocabulary, and the rule §10 gains where it had a
		 * construction guarantee.
		 */
		expect(layout.modifierTypes).toEqual([
			'item',
			'status',
			'circumstance',
			'morale',
		]);
		expect(NOTE_TEXT).toContain('abilities.STR += 1 as luck');
		expect(layout.modifierTypes).not.toContain('luck');
	});

	it('declares the ten modifiers the recipe names', () => {
		/*
		 * The list is the layout's own vocabulary, and every *named* state the sheet
		 * shows comes from one of these. **`Bracers of Defence +1` carries
		 * arithmetic in its name deliberately**: a name with a `+1` in it, sitting in
		 * a cell, and not being read as arithmetic is the discriminator's hardest
		 * case, and it belongs in a file rather than only in a test.
		 */
		expect((layout.modifiers ?? []).map((one) => one.name)).toEqual([
			'Belt of Giant Strength',
			'Gauntlets of Ogre Power',
			"Bull's Strength",
			'Ring of Protection',
			'Bracers of Defence +1',
			'Plate armour',
			'Mage armour',
			'Cloak of Elvenkind',
			'Cloak of Displacement',
			'Eyes of the Eagle',
		]);
	});

	it('declares one override, one lower override, and one condition', () => {
		const byName = new Map(
			(layout.modifiers ?? []).map((one) => [one.name, one]),
		);
		expect(byName.get('Plate armour')?.operator).toBe('override');
		expect(byName.get('Plate armour')?.amount).toBe('18');
		expect(byName.get('Mage armour')?.operator).toBe('override');
		expect(byName.get('Mage armour')?.amount).toBe('13');
		// The condition reads an ordinary toggle cell on the enrolling row, which
		// is the whole of the condition mechanism.
		expect(byName.get('Cloak of Elvenkind')?.when).toBe('Worn');
		// And an addition says nothing about its operator, which is what a
		// definition that never set one reads as.
		expect(byName.get('Ring of Protection')).not.toHaveProperty('operator');
	});

	it('declares one modifier column on each table, keyed for what a cell holds', () => {
		/*
		 * **One column and not two.** A cell holds every modifier its row applies —
		 * named and typed, mixed freely — so a second column would only put two
		 * glyphs on a row that filled both. The key is plural because it is what the
		 * cell's accessible name reads: `Modifiers: 2 applying`.
		 */
		expect((layout.components[4] as TableConfig).columns).toEqual([
			{ key: 'Modifiers', type: 'modifier', hideHeading: true },
			{ key: 'Worn', type: 'toggle' },
			{ key: 'Notes', type: 'text' },
		]);
		// The second table exists so the qualified breakdown form is on the sheet
		// rather than something the reader has to build — and so that the same
		// definition is enrolled in from two places.
		expect((layout.components[5] as TableConfig).columns).toEqual([
			{ key: 'Modifiers', type: 'modifier', hideHeading: true },
		]);
	});

	it('reports exactly one definition, and it is the one that is there to be reported', () => {
		// dnd5e#3900 caught in the editor: `passive_perception` reads no modifier,
		// so the Cloak of Displacement changes nothing and the message names the
		// fix. Everything else in the list is usable.
		const { definitions, problems: reported } = sheetFrom(
			LAYOUT_TEXT,
			NOTE_TEXT,
		).definitions;
		expect(definitions).toHaveLength(10);
		expect(reported).toHaveLength(1);
		expect(reported[0]?.definition).toBe('Cloak of Displacement');
		expect(reported[0]?.message).toContain('reads no modifier');
		expect(reported[0]?.message).toContain('+ mod.self');
	});

	it('reads every section it has without error', () => {
		// `configError` is each component's own private check rather than a
		// contract member, so nothing here can ask a component whether it
		// configures. What a misconfiguration *does* is publish nothing, so the
		// arithmetic assertions further down are what actually hold this fixture's
		// configuration.
		for (const entry of sheetFrom(LAYOUT_TEXT, NOTE_TEXT).prepared) {
			expect(entry.error, entry.config.id).toBeNull();
		}
	});

	it('is already in the editor\'s own formatting, so opening and saving it rewrites nothing', () => {
		// A layout file carries no byte-identical promise, so this is a
		// convenience rather than Constraint 3 — but a fixture that reformats on
		// the owner's first save looks like the plugin damaged their file. It is
		// also what §8's promotion writes through, so a promoted-into layout is
		// formatted exactly as one edited in the pane is.
		expect(serialiseLayout(parseLayout(LAYOUT_TEXT))).toBe(LAYOUT_TEXT);
	});
});

describe('the character note the fixture recipe names', () => {
	const { note } = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);

	it('names the layout by its filename, which is how a note finds one', () => {
		expect(note.layoutName).toBe(LAYOUT_FILE.replace(/\.json$/, ''));
	});

	it('holds a section for each component that stores anything', () => {
		expect(getSection(note, 'Abilities')).toBeDefined();
		expect(getSection(note, 'Skills')).toBeDefined();
		expect(getSection(note, 'Magic items')).toBeDefined();
		expect(getSection(note, 'Worn items')).toBeDefined();
		// The two cards are derived-only, so they have nothing to store yet.
		expect(getSection(note, 'Armour class')).toBeUndefined();
		expect(getSection(note, 'Passive perception')).toBeUndefined();
	});

	it('parses then serialises byte-identically (Constraint 3)', () => {
		expect(serialiseCharacter(parseCharacter(NOTE_TEXT))).toBe(NOTE_TEXT);
	});

	it('carries a real wikilink in a modifier row, outside any fence', () => {
		// Constraint 2 in the fixture: the row that is both a live link and a live
		// modifier. `markdown` storage, so nothing about it is fenced — and a
		// modifier cell never reaches the constraint at all, because it holds names
		// and expressions rather than links and grows no `[[` for any reason.
		expect(NOTE_TEXT).toContain('| [[Ring of Protection]] | Ring of Protection |');
		expect(NOTE_TEXT).not.toContain('```\n| [[');
	});

	it('gives up all fourteen rows, in order, through Table\'s real read', () => {
		const { data } = magicItems(NOTE_TEXT);
		const rows = Object.keys(data.rows)
			.map(Number)
			.sort((a, b) => a - b)
			.map((index) => data.rows[index]);
		expect(rows).toHaveLength(14);
		expect(rows.map((row) => row?.name)).toEqual([
			'Belt of Giant Strength',
			'Gauntlets of Ogre Power',
			"Bull's Strength",
			'Bracers of Warding +2',
			'Plate armour',
			'Barkskin',
			'Mage armour',
			'Cloak +1',
			'Spare cloak',
			'Lucky charm',
			'Unfinished ward',
			'Eyes of the Eagle',
			'Torch of Nothing',
			'Chalk',
		]);
		/*
		 * Cells arrive keyed by the note's own header, lowercased, and holding the
		 * cell's **own text** — never a canonical rewrite of it. That is the whole
		 * of Constraint 3 on this side: the Belt row's hand-spelled
		 * `Belt of Giant Strength ;Bracers of Defence +1` is stored exactly as
		 * typed, and the canonical `'; '` four rows down reads identically.
		 */
		expect(rows.map((row) => row?.cells?.modifiers)).toEqual([
			'Belt of Giant Strength ;Bracers of Defence +1',
			'Gauntlets of Ogre Power',
			"Bull's Strength",
			'Ring of Protection; armour_class += 2 as item when Worn',
			'Plate armour',
			'armour_class = 16',
			'Mage armour',
			'Cloak of Elvenkind; Cloak of Displacement',
			'Cloak of Elvenkind',
			'abilities.STR += 1 as luck',
			'armour_class +=',
			'Eyes of the Eagle',
			'Belt of Giant Strengh',
			// And a blank cell, which is the ordinary case and draws a `plus`.
			'',
		]);
		/*
		 * **The mixed cell reads as two parts, one of each tier**, and the
		 * hand-spelled cell reads as two names. Both are in the file rather than
		 * only in a test, because a criterion met by a string replace in a test is a
		 * criterion the owner cannot see.
		 */
		expect(cellParts(rows[0]?.cells?.modifiers ?? '')).toEqual([
			'Belt of Giant Strength',
			'Bracers of Defence +1',
		]);
		expect(cellParts(rows[3]?.cells?.modifiers ?? '')).toEqual([
			'Ring of Protection',
			'armour_class += 2 as item when Worn',
		]);
		// The condition's two sides, both in the file: one row worn and one not.
		expect(rows[7]?.cells?.worn).toBe('yes');
		expect(rows[8]?.cells?.worn).toBe('');
	});

	it('holds the hand-spelled cell, and gives back its exact spacing', () => {
		/*
		 * §6's whole argument in one assertion. The Belt row's cell is spelled
		 * `Belt of Giant Strength ;Bracers of Defence +1` — no space before the
		 * semicolon, none after — and the mixed cell three rows below carries the
		 * canonical `'; '`. Both read as two parts, and both keep exactly the bytes
		 * they were typed as, because `parse/table.ts` rewrites only the cells whose
		 * text actually changed. There is no normalising pass for byte identity to
		 * lose to.
		 */
		expect(NOTE_TEXT).toContain(
			'| Belt of Giant Strength ;Bracers of Defence +1 |',
		);
		expect(NOTE_TEXT).toContain(
			'| Ring of Protection; armour_class += 2 as item when Worn |',
		);
		const built = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);
		const entry = built.entryFor('magic_items');
		const section = getSection(built.note, 'Magic items');
		const written = table.write(
			entry.data as TableData,
			section?.body ?? '',
			entry.config as TableConfig,
		);
		expect(written).toBe(section?.body);
		expect(written).toContain(' ;Bracers of Defence +1 ');
	});

	it('writes every table back unchanged, so nothing is normalised on save', () => {
		const built = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);
		for (const id of ['skills', 'magic_items', 'worn_items']) {
			const entry = built.entryFor(id);
			const section = getSection(built.note, entry.config.label);
			expect(section, id).toBeDefined();
			expect(
				table.write(
					entry.data as TableData,
					section?.body ?? '',
					entry.config as TableConfig,
				),
				id,
			).toBe(section?.body);
		}
	});
});

describe('the arithmetic the fixture\'s press steps promise', () => {
	const built = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);

	it('gives Strength +4, from three types and two tiers', () => {
		/*
		 * The Belt's item +2 with the Gauntlets' item +1 suppressed by it; Bull's
		 * Strength's status +1; and **a typed `luck +1` from a cell**, whose type
		 * the layout does not declare and which therefore contests as its own kind.
		 * So `mod.abilities.STR` is +4.
		 *
		 * **That +4 lands on the score and not on the ability modifier**, which is
		 * where `floor((value + mod.self - 10) / 2)` puts it: a score of 15 with +4
		 * on it is a 19, reading +4. Spelled `floor((value - 10) / 2) + mod.self`
		 * instead — which this fixture carried until a reader met it — a Belt of
		 * Giant Strength moved the modifier by the whole +2 rather than raising the
		 * score by it, so the one thing the item's own name promises was the one
		 * thing it did not do.
		 */
		expect(built.sheet('abilities.STR')).toBe(4);
		expect(built.sheet('mod.abilities.STR')).toBe(4);
		// Constraint 4's own half of it: the stored score is what the player typed,
		// whatever is layered over it.
		expect(built.sheet('abilities.STR.value')).toBe(15);
	});

	it('lists all four Strength contributors, named and typed alike', () => {
		const breakdown = built.modifiers.breakdown('abilities.STR');
		expect(breakdown.override).toBeNull();
		expect(breakdown.total).toBe(4);
		expect(
			breakdown.lines.map((line) => [
				line.label,
				line.definition ?? null,
				line.type,
				line.amount,
				line.suppressed,
			]),
		).toEqual([
			['Belt of Giant Strength', 'Belt of Giant Strength', 'item', 2, null],
			[
				'Gauntlets of Ogre Power',
				'Gauntlets of Ogre Power',
				'item',
				1,
				'a larger item bonus applies',
			],
			["Bull's Strength", "Bull's Strength", 'status', 1, null],
			// **A line for a modifier with no name**, named by its row: a typed
			// effect has none by §7's edge, so `definition` is absent and the row's
			// own label carries the line.
			['Lucky charm', null, 'luck', 1, null],
		]);
	});

	it('moves only the entry a modifier targeted', () => {
		// The case `mod.self` exists for: one formula runs per entry and no
		// absolute name inside it could say which entry it is running for.
		expect(built.sheet('abilities.DEX')).toBe(2);
		expect(built.sheet('abilities.CON')).toBe(1);
		expect(built.sheet('abilities.INT')).toBe(1);
		expect(built.sheet('abilities.WIS')).toBe(0);
		expect(built.sheet('abilities.CHA')).toBe(-1);
		for (const key of ['DEX', 'CON', 'INT', 'WIS', 'CHA']) {
			expect(built.modifiers.breakdown(`abilities.${key}`).lines, key).toEqual(
				[],
			);
		}
	});

	it('sets armour class to 18 and lands three bonuses on top of it', () => {
		/*
		 * Press step 1, and the owner's own case: "if I have an item that defines
		 * set my str 18 and another item that gives +1 stg while worn, my bonus
		 * should be 19. The values that overwrites should came first."
		 *
		 * Here it is 18 + 2 + 1 + 1 = **22**. Plate armour sets it; a *typed*
		 * `armour_class = 16` and a named 13 both lose; the typed item +2 beats both
		 * Rings of Protection; the Cloak's status +1 and the Bracers' circumstance
		 * +1 add beside it — three types, so all three add.
		 */
		expect(built.derivedFor('armour_class')).toBe(22);
		// And the name a formula elsewhere would read is the same number, which is
		// the property that keeps a card and the sheet from disagreeing.
		expect(built.sheet('armour_class')).toBe(22);
		const breakdown = built.modifiers.breakdown('armour_class');
		expect(breakdown.override).toBe(18);
		// The slot itself is still the *additive* total, so `value + mod.self`
		// written anywhere else on the sheet is unchanged by the override.
		expect(breakdown.total).toBe(4);
		expect(built.sheet('mod.armour_class')).toBe(4);
	});

	it('contests a typed override with a named one on exactly equal terms', () => {
		/*
		 * **A push carries no tier and neither does the arithmetic.** `Barkskin` is
		 * `armour_class = 16` typed into a cell, and it loses to Plate armour's 18
		 * in the same words `Mage armour`'s 13 does. A tier that stacked differently
		 * would be a second engine.
		 */
		const lines = built.modifiers.breakdown('armour_class').lines;
		const overrides = lines.filter((line) => line.operator === 'override');
		expect(
			overrides.map((line) => [line.label, line.amount, line.suppressed]),
		).toEqual([
			['Plate armour', 18, null],
			['Barkskin', 16, 'a higher override applies'],
			['Mage armour', 13, 'a higher override applies'],
		]);
		// And the typed one carries no definition, where the named ones do.
		expect(
			overrides.find((line) => line.label === 'Barkskin')?.definition,
		).toBeUndefined();
	});

	it('leaves the unfinished typed effect out of the number and out of the breakdown', () => {
		/*
		 * `Unfinished ward` reads `armour_class +=`. **It changes nothing and refuses
		 * nothing**: the slot still publishes, every other contributor still lands,
		 * and it appears in no breakdown — because a breakdown is the number's story
		 * and this is not part of it. The row's `zap-off` is where the reader learns
		 * it needs an amount.
		 */
		expect(
			built.modifiers
				.breakdown('armour_class')
				.lines.map((line) => line.label),
		).not.toContain('Unfinished ward');
		expect(built.derivedFor('armour_class')).toBe(22);
	});

	it('lists every contributor at armour class, and says why three did not apply', () => {
		expect(
			built.modifiers
				.breakdown('armour_class')
				.lines.map((line) => [line.source, line.label, line.suppressed]),
		).toEqual([
			['Magic items', 'Belt of Giant Strength', null],
			[
				'Magic items',
				'Bracers of Warding +2',
				'a larger item bonus applies',
			],
			['Magic items', 'Bracers of Warding +2', null],
			['Magic items', 'Plate armour', null],
			['Magic items', 'Barkskin', 'a higher override applies'],
			['Magic items', 'Mage armour', 'a higher override applies'],
			['Magic items', 'Cloak +1', null],
			['Worn items', 'Ring of Protection', 'a larger item bonus applies'],
		]);
	});

	it('tells two lines on one row apart by what each one does', () => {
		/*
		 * **The property that pays for `ModifierLine.definition` becoming optional.**
		 * The `Bracers of Warding +2` row applies two item bonuses at one name, one
		 * named and one typed, so both lines carry the same label — and the *outcome*
		 * half is what distinguishes them, which is exactly the question the reader
		 * is asking.
		 */
		const shown = built.derivedFor('armour_class');
		const said =
			modifierBreakdown(
				built.modifiers.breakdown('armour_class'),
				typeof shown === 'number' ? shown : null,
			) ?? '';
		expect(said.split('\n')).toEqual([
			/*
			 * **Three tokens on this line and two on most others**, which is the drop
			 * rule doing its job rather than an inconsistency: the Bracers of Defence
			 * reach armour class from a row called *Belt of Giant Strength*, so the
			 * row alone would have said a Strength item was giving armour class.
			 */
			'Magic items · Belt of Giant Strength · Bracers of Defence +1 — circumstance +1',
			'Magic items · Bracers of Warding +2 · Ring of Protection — item +1 (not applied: a larger item bonus applies)',
			// The typed one on the same row: no modifier name, because it has none.
			'Magic items · Bracers of Warding +2 — item +2',
			'Magic items · Plate armour — sets to 18',
			'Magic items · Barkskin — sets to 16 (not applied: a higher override applies)',
			'Magic items · Mage armour — sets to 13 (not applied: a higher override applies)',
			'Magic items · Cloak +1 · Cloak of Elvenkind — status +1',
			'Worn items · Ring of Protection — item +1 (not applied: a larger item bonus applies)',
			'',
			// A value rather than an addend, because base-plus-total is no longer
			// the arithmetic once something sets the number.
			'Total 22',
		]);
		// A card away, one table is the only source, nothing overrides, and the
		// total is signed again — the shape changes only when the fact does.
		expect(modifierBreakdown(built.modifiers.breakdown('abilities.STR'))).toBe(
			[
				'Belt of Giant Strength — item +2',
				'Gauntlets of Ogre Power — item +1 (not applied: a larger item bonus applies)',
				"Bull's Strength — status +1",
				'Lucky charm — luck +1',
				'',
				'Total +4',
			].join('\n'),
		);
	});

	it('moves a published table row, which is the third surface a modifier reaches', () => {
		// `Eyes of the Eagle` is aimed at `skills.perception`, a *table cell* rather
		// than a card: the Perception row carries a key, so it has a slot.
		expect(built.sheet('skills.perception')).toBe(2);
		expect(
			built.modifiers.breakdown('skills.perception').lines.map((l) => l.label),
		).toEqual(['Eyes of the Eagle']);
	});

	it('leaves passive perception unmodified, and gives it no breakdown', () => {
		expect(built.derivedFor('passive_perception')).toBe(10);
		expect(built.modifiers.breakdown('passive_perception').lines).toEqual([]);
	});

	it('offers every declared modifier and every accepting target to the form', () => {
		// A definition is the layout's, so which ones a row may pick has nothing to
		// do with which table the row is on — and the accepting set is what the
		// form's **Changes** select offers, which is the sheet's own half of
		// dnd5e#3900's check now that a target can be typed on a row.
		expect(built.modifiers.definitions).toHaveLength(10);
		expect(built.modifiers.targets.map((one) => one.name)).toEqual([
			'abilities.STR',
			'abilities.DEX',
			'abilities.CON',
			'abilities.INT',
			'abilities.WIS',
			'abilities.CHA',
			'armour_class',
			'skills.perception',
		]);
		// `passive_perception` is published and reads no modifier, so it is not
		// offered — and it still has a *label*, which is what keeps an identifier
		// out of a popover on a player's own inventory row.
		expect(built.modifiers.targets.map((one) => one.name)).not.toContain(
			'passive_perception',
		);
		expect(
			built.modifiers.published.find(
				(one) => one.name === 'passive_perception',
			)?.label,
		).toBe('Passive perception');
		expect(built.modifiers.bonusTypes).toEqual([
			'item',
			'status',
			'circumstance',
			'morale',
		]);
	});
});

describe('what a modifier cell says about its own row', () => {
	const built = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);

	/** The row as the component hands it over, by its own label. */
	function row(label: string) {
		const entry = built.entryFor('magic_items');
		const source = table.scopeModifiers?.(
			entry.data as TableData,
			entry.config as TableConfig,
		);
		if (!source) throw new Error('expected a modifier source');
		const found = source(
			makeFieldResolver(entry.component, entry.config, entry.data, built.env),
		).find((push) => push.row.label === label);
		if (!found) throw new Error(`no row called "${label}"`);
		return found;
	}

	/** Every part of one row's cell, paired with what it comes to there. */
	function applied(label: string, cell: string) {
		const values = row(label).row;
		return rowModifiers(cellParts(cell), (stored) =>
			built.modifiers.outcome(stored, values),
		);
	}

	const outcomeFor = (part: string, label: string) =>
		built.modifiers.outcome(part, row(label).row);

	it('says what one row is doing when its cell names two, at both depths', () => {
		/*
		 * One cell, one glyph, two numbers moving — and a name carrying a `+1` that
		 * is not read as arithmetic. The `title` is a summary, one line each and
		 * bounded however many the row applies; the accessible name gives a count,
		 * which is parity rather than a shortcut, because the glyph gives a sighted
		 * reader no names either.
		 */
		const said = applied(
			'Belt of Giant Strength',
			'Belt of Giant Strength ;Bracers of Defence +1',
		);
		expect(modifierRowText(said)).toBe(
			['Abilities · STR — item +2', 'Armour class — circumstance +1'].join('\n'),
		);
		expect(modifierRowName('Modifiers', said)).toBe('Modifiers: 2 applying');
	});

	it('says what a mixed cell is doing, with the named half suppressed', () => {
		/*
		 * **The row this wave exists for.** A name and an effect typed on the row, in
		 * one cell, both item bonuses at armour class: the typed `+2` wins and the
		 * named `+1` on the same row says so. Nothing about the words differs by
		 * tier, which is what stops the sheet saying two things about one number.
		 */
		const said = applied(
			'Bracers of Warding +2',
			'Ring of Protection; armour_class += 2 as item when Worn',
		);
		expect(modifierRowText(said)).toBe(
			[
				'Armour class — item +1 (changes nothing)',
				'Armour class — item +2',
			].join('\n'),
		);
		expect(modifierRowName('Modifiers', said)).toBe(
			'Modifiers: 1 applying, 1 changing nothing',
		);
	});

	it('spells a lone typed effect by what it does, because it has no name', () => {
		// §7's edge in the accessible name: a typed effect has no name and never
		// will, so it is spelled by its outcome — which is the same builder every
		// other surface uses.
		const said = applied('Lucky charm', 'abilities.STR += 1 as luck');
		expect(modifierRowText(said)).toBe('Abilities · STR — luck +1');
		expect(modifierRowName('Modifiers', said)).toBe(
			'Modifiers: Abilities · STR — luck +1',
		);
	});

	it('says an unfinished typed effect needs an amount, and refuses nothing', () => {
		// The sixth `zap-off` reason. It changes nothing and is not an error, which
		// is what makes the form safe to commit one field at a time.
		const outcome = outcomeFor('armour_class +=', 'Unfinished ward');
		expect(outcome.applies).toBe(false);
		expect(outcome.typed).toEqual({
			target: 'armour_class',
			operator: 'add',
			amount: '',
		});
		expect(modifierOutcomeText('armour_class +=', outcome)).toBe(
			'Armour class — bonus\nNot applied: it needs an amount.',
		);
	});

	it('applies a typed effect whose bonus type the layout does not declare', () => {
		// Rendered, not corrected: the effect applies and contests as its own kind.
		// §10 gains a rule here where it had a construction guarantee.
		const outcome = outcomeFor('abilities.STR += 1 as luck', 'Lucky charm');
		expect(outcome.applies).toBe(true);
		expect(outcome.typed?.bonusType).toBe('luck');
		expect(modifierOutcomeText('abilities.STR += 1 as luck', outcome)).toBe(
			'Abilities · STR — luck +1',
		);
	});

	it('says a typed override is not applying, and which wording is true', () => {
		const outcome = outcomeFor('armour_class = 16', 'Barkskin');
		expect(outcome.applies).toBe(false);
		expect(modifierOutcomeText('armour_class = 16', outcome)).toBe(
			'Armour class — sets to 16\nNot applied: a higher override applies',
		);
	});

	it('says a working row is applying, and what it does', () => {
		const outcome = outcomeFor('Plate armour', 'Plate armour');
		expect(outcome.applies).toBe(true);
		expect(outcome.amount).toBe(18);
		expect(modifierOutcomeText('Plate armour', outcome)).toBe(
			'Armour class — sets to 18',
		);
	});

	it('says a suppressed item bonus is not applying', () => {
		const outcome = outcomeFor(
			'Gauntlets of Ogre Power',
			'Gauntlets of Ogre Power',
		);
		expect(outcome.applies).toBe(false);
		expect(modifierOutcomeText('Gauntlets of Ogre Power', outcome)).toBe(
			'Abilities · STR — item +1\nNot applied: a larger item bonus applies',
		);
	});

	it('reads the condition off the row, and says which way it went', () => {
		expect(
			modifierOutcomeText(
				'Cloak of Elvenkind',
				outcomeFor('Cloak of Elvenkind', 'Cloak +1'),
			),
		).toBe('Armour class — status +1\nOnly while Worn, which holds now');
	});

	it('gives one definition two answers on two rows', () => {
		/*
		 * The whole of what a *shared* definition means, and the pair the recipe
		 * asks for: nothing about the change is in the note, so the two rows differ
		 * only by the flag the condition reads.
		 */
		const worn = outcomeFor('Cloak of Elvenkind', 'Cloak +1');
		const spare = outcomeFor('Cloak of Elvenkind', 'Spare cloak');
		expect(worn.applies).toBe(true);
		expect(spare.applies).toBe(false);
		expect(modifierOutcomeText('Cloak of Elvenkind', spare)).toBe(
			'Armour class — status +1\nOnly while Worn, which does not hold now',
		);
		// And it changes no number: an inactive row appears in no breakdown at all.
		expect(
			built.modifiers
				.breakdown('armour_class')
				.lines.filter((line) => line.label === 'Spare cloak'),
		).toEqual([]);
	});

	it('says the layout declares no such modifier where it does not', () => {
		const outcome = outcomeFor('Belt of Giant Strengh', 'Torch of Nothing');
		expect(outcome.definition).toBeNull();
		expect(outcome.typed).toBeNull();
		expect(outcome.applies).toBe(false);
		expect(modifierOutcomeText('Belt of Giant Strengh', outcome)).toBe(
			[
				'"Belt of Giant Strengh" is not a modifier this layout declares.',
				'Choose one it does, or add it in the layout editor.',
			].join('\n'),
		);
	});

	it('reads a tie as applying on both rows, where the breakdown names one', () => {
		/*
		 * The decision, on the fixture rather than on a contrived layout. Two rows
		 * enrolling in one definition at the same amount are symmetric — deleting
		 * either changes nothing — so both say they are changing the value, while
		 * the breakdown attributes the number to exactly one of them for the sum to
		 * work. Reached here by taking the typed `+2` out of the contest, which is
		 * the only thing beating both Rings.
		 */
		const stowed = NOTE_TEXT.replace(
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn | yes |',
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn | no |',
		);
		expect(stowed).not.toBe(NOTE_TEXT);
		const after = sheetFrom(LAYOUT_TEXT, stowed);
		const rings = after.modifiers
			.breakdown('armour_class')
			.lines.filter((line) => line.definition === 'Ring of Protection');
		expect(rings.map((line) => line.suppressed)).toEqual([
			null,
			'another item bonus of the same size applies',
		]);
	});

	it('says a cell aimed at a value that reads no modifier changes nothing', () => {
		/*
		 * The row's own half of dnd5e#3900, **in the reader's vocabulary and not the
		 * author's**: the first line reads `Passive perception` rather than the
		 * identifier, and the literal `+ mod.self` stays in the editor's own report
		 * where the person who can act on it is standing.
		 */
		const outcome = outcomeFor('Cloak of Displacement', 'Cloak +1');
		expect(outcome.applies).toBe(false);
		expect(outcome.suppressed).toContain('does not take modifiers');
		expect(outcome.suppressed).not.toContain('mod.self');
		expect(outcome.suppressed).not.toContain('passive_perception');
		expect(modifierOutcomeText('Cloak of Displacement', outcome)).toBe(
			[
				'Passive perception — item +2',
				'Not applied: Passive perception does not take modifiers, so nothing changes. Its own formula has to ask for them, which is a layout edit.',
			].join('\n'),
		);
	});
});

describe('the press steps that change the note', () => {
	const swap = (from: string, to: string) => {
		const edited = NOTE_TEXT.replace(from, to);
		expect(edited, from).not.toBe(NOTE_TEXT);
		return sheetFrom(LAYOUT_TEXT, edited);
	};

	it('step 2: typing a number on a row moves the sheet, with no layout edit', () => {
		/*
		 * **The step the whole wave exists for.** Changing the typed effect's
		 * **Amount** from `2` to `3` takes armour class from 22 to 23, and nothing
		 * outside this note has moved.
		 */
		const after = swap(
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn |',
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 3 as item when Worn |',
		);
		expect(after.derivedFor('armour_class')).toBe(23);
	});

	it('step 3: unticking Worn drops the typed effect and the Rings take over', () => {
		/*
		 * The two tiers contesting, on screen. The typed effect's condition fails,
		 * the item contest falls to the Rings' +1, and armour class is 21 — while the
		 * row still draws `zap`, because the `Ring of Protection` in the *same cell*
		 * now applies. That is the mixed-glyph rule on the sheet.
		 */
		const after = swap(
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn | yes |',
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn | no |',
		);
		expect(after.derivedFor('armour_class')).toBe(21);
	});

	it('step 6: removing the winning override lets the typed one take over at 16', () => {
		// 16 set by `armour_class = 16` typed into a cell, then the same three
		// bonuses on top: 20.
		const after = swap('| Plate armour | Plate armour |', '| Plate armour |  |');
		expect(after.derivedFor('armour_class')).toBe(20);
		expect(after.modifiers.breakdown('armour_class').override).toBe(16);
	});

	it('step 7: removing the typed override too lets the last one win at 13', () => {
		const edited = NOTE_TEXT.replace(
			'| Plate armour | Plate armour |',
			'| Plate armour |  |',
		).replace('| Barkskin | armour_class = 16 |', '| Barkskin |  |');
		expect(edited).not.toBe(NOTE_TEXT);
		const after = sheetFrom(LAYOUT_TEXT, edited);
		expect(after.derivedFor('armour_class')).toBe(17);
		expect(
			modifierBreakdown(
				after.modifiers.breakdown('armour_class'),
				17,
			) ?? '',
		).toContain('Total 17');
	});

	it('step 8: with every override gone the formula comes back, and so does the delta', () => {
		const edited = NOTE_TEXT.replace(
			'| Plate armour | Plate armour |',
			'| Plate armour |  |',
		)
			.replace('| Barkskin | armour_class = 16 |', '| Barkskin |  |')
			.replace('| Mage armour | Mage armour |', '| Mage armour |  |');
		expect(edited).not.toBe(NOTE_TEXT);
		const after = sheetFrom(LAYOUT_TEXT, edited);
		// 10 + DEX's +2 + item 2 + status 1 + circumstance 1 = 16.
		expect(after.derivedFor('armour_class')).toBe(16);
		const breakdown = after.modifiers.breakdown('armour_class');
		expect(breakdown.override).toBeNull();
		// And the total line goes back to its delta form, which is the shape change
		// an override is the only cause of.
		expect(modifierBreakdown(breakdown, 16) ?? '').toContain('Total +4');
	});

	it('step 9: unticking a condition takes a row out of the breakdown entirely', () => {
		/*
		 * A breakdown is about what changed the number, and the row is where "not
		 * right now" is said. The `Cloak +1` row's glyph goes from `zap` to
		 * `zap-off`, because that cell's other part — the Cloak of Displacement —
		 * was never applying either.
		 */
		const after = swap(
			'| Cloak +1 | Cloak of Elvenkind; Cloak of Displacement | yes |',
			'| Cloak +1 | Cloak of Elvenkind; Cloak of Displacement | no |',
		);
		expect(after.derivedFor('armour_class')).toBe(21);
		expect(
			after.modifiers
				.breakdown('armour_class')
				.lines.map((line) => line.label),
		).not.toContain('Cloak +1');
	});

	it('step 10: finishing the unfinished effect lands an untyped bonus', () => {
		// Untyped, so it stacks with everything: 22 + 1 = 23.
		const after = swap('| Unfinished ward | armour_class += |', '| Unfinished ward | armour_class += 1 |');
		expect(after.derivedFor('armour_class')).toBe(23);
		expect(
			after.modifiers
				.breakdown('armour_class')
				.lines.find((line) => line.label === 'Unfinished ward'),
		).toMatchObject({ type: null, amount: 1, suppressed: null });
	});

	it('step 12: editing another cell in the row leaves a stray byte for byte', () => {
		/*
		 * Rendered, not corrected. The `Notes` cell on the stray's row is rewritten
		 * and the misspelling comes back untouched — which is Constraint 3 read
		 * across a row rather than across a cell.
		 */
		const built = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);
		const entry = built.entryFor('magic_items');
		const section = getSection(built.note, 'Magic items');
		const written = table.write(
			{ rows: { 12: { cells: { Notes: 'still misspelled' } } } },
			section?.body ?? '',
			entry.config as TableConfig,
		);
		expect(written).toContain('| Belt of Giant Strengh | yes | still misspelled |');
	});

	it('step 15: hand-editing the spacing changes no number at all', () => {
		/*
		 * Read tolerantly, and every spelling gives the same modifiers. The
		 * separator's spacing and the assignment's spacing are both hand-edited here,
		 * one per tier.
		 */
		const edited = NOTE_TEXT.replace(
			'| Belt of Giant Strength | Belt of Giant Strength ;Bracers of Defence +1 |',
			'| Belt of Giant Strength | Belt of Giant Strength;  Bracers of Defence +1 |',
		).replace(
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn |',
			'| Bracers of Warding +2 | Ring of Protection;armour_class+=2 as item when Worn |',
		);
		expect(edited).not.toBe(NOTE_TEXT);
		const after = sheetFrom(LAYOUT_TEXT, edited);
		expect(after.derivedFor('armour_class')).toBe(22);
		expect(after.sheet('abilities.STR')).toBe(4);
		// And the file is unchanged by opening it, byte for byte.
		expect(serialiseCharacter(parseCharacter(edited))).toBe(edited);
	});
});

describe('the press steps that change the layout', () => {
	it('step 5: renaming a definition leaves every row pointing at nothing', () => {
		/*
		 * The cost of the named tier, on screen. Every row that named it keeps its
		 * text and says it changes nothing; no cell is rewritten, because a rename in
		 * the editor cannot know that a cell meant this definition rather than a typo.
		 *
		 * **And the row's glyph stays `zap`**, which is a case a one-modifier cell
		 * could not produce: the Belt on the same cell still applies, so the row is
		 * still changing something while one of its two parts points at nothing.
		 */
		const renamed = LAYOUT_TEXT.replace(
			'"name": "Bracers of Defence +1"',
			'"name": "Bracers of Warding"',
		);
		expect(renamed).not.toBe(LAYOUT_TEXT);
		const after = sheetFrom(renamed, NOTE_TEXT);
		// The circumstance +1 is gone: 18 + 2 + 1 = 21.
		expect(after.derivedFor('armour_class')).toBe(21);
		const rows = (after.entryFor('magic_items').data as TableData).rows;
		expect(rows[0]?.cells?.modifiers).toBe(
			'Belt of Giant Strength ;Bracers of Defence +1',
		);
		// And the note is untouched: writing it back changes nothing.
		const section = getSection(after.note, 'Magic items');
		expect(
			table.write(
				after.entryFor('magic_items').data as TableData,
				section?.body ?? '',
				after.entryFor('magic_items').config as TableConfig,
			),
		).toBe(section?.body);
	});

	it('stripping mod.self empties the accepting set, override included', () => {
		const stripped = LAYOUT_TEXT.replace(/ \+ mod\.self/g, '');
		expect(stripped).not.toBe(LAYOUT_TEXT);
		const after = sheetFrom(stripped, NOTE_TEXT);
		// Every definition is now reported, because nothing on the layout reads a
		// modifier at all.
		expect(after.definitions.problems).toHaveLength(10);
		// And every number that was modified falls back to its unmodified self,
		// override included — which is what the bound on the override step buys.
		expect(after.sheet('abilities.STR')).toBe(2);
		expect(after.derivedFor('armour_class')).toBe(12);
	});

	it('dropping a declared bonus type changes no named modifier\'s number', () => {
		/*
		 * **The one place this wave takes a construction guarantee and replaces it
		 * with a rule.** Dropping `item` moves nothing, because the arithmetic
		 * contests by the *string* a modifier carries rather than by the layout's
		 * list — so the Belt still beats the Gauntlets and the typed `+2` still beats
		 * both Rings. What changes is only what the editor and the form *say* about
		 * it, which is `modifier-types-field.test.ts`'s half.
		 */
		const dropped = LAYOUT_TEXT.replace('\t\t"item",\n', '');
		expect(dropped).not.toBe(LAYOUT_TEXT);
		const after = sheetFrom(dropped, NOTE_TEXT);
		expect(after.layout.modifierTypes).toEqual([
			'status',
			'circumstance',
			'morale',
		]);
		expect(after.sheet('abilities.STR')).toBe(4);
		expect(after.derivedFor('armour_class')).toBe(22);
	});

	it('an amount edited in the layout moves every character, and no note', () => {
		/*
		 * The named tier in one edit: the amount is the *definition's*, so this
		 * moves every character on the layout at once and no note is touched.
		 */
		const edited = LAYOUT_TEXT.replace(
			'\t\t\t"name": "Belt of Giant Strength",\n\t\t\t"target": "abilities.STR",\n\t\t\t"amount": "2",',
			'\t\t\t"name": "Belt of Giant Strength",\n\t\t\t"target": "abilities.STR",\n\t\t\t"amount": "4",',
		);
		expect(edited).not.toBe(LAYOUT_TEXT);
		const after = sheetFrom(edited, NOTE_TEXT);
		// The Belt at +4 suppresses the Gauntlets' +1 as before, so the total is
		// +6 on a score of 15 — a 21, reading +5.
		expect(after.sheet('abilities.STR')).toBe(5);
		const lines = after.modifiers.breakdown('abilities.STR').lines;
		expect(lines[0]?.amount).toBe(4);
		expect(lines[1]?.suppressed).toBe('a larger item bonus applies');
	});
});

describe('the trap the fixture is a witness to', () => {
	const built = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);

	it('reads mod.self as 0 for a resolver given no published name', () => {
		// Risk 7, on the fixture rather than on a contrived layout: armour class is
		// 22 through the call `card.ts` makes and 12 through the one that forgets
		// the name — with the override and all three bonuses silently gone and
		// nothing anywhere saying so.
		expect(built.derivedFor('armour_class')).toBe(22);
		expect(built.derivedWithoutName('armour_class')).toBe(12);
	});
});

/*
 * **The two phases, end to end on the fixture.**
 *
 * The engine's own unit tests are `formula/modifiers.test.ts`'s. What this adds
 * is the whole path: a cell in a note, through the parse, the stacking, the slot
 * and the card's own formula, to two numbers that differ — which is the claim the
 * feature makes and the one thing a unit test on `stackModifiers` cannot show.
 */
describe('a modifier choosing which number it moves', () => {
	/**
	 * Ilona, with the Lucky charm *row* retyped to land on the derived number.
	 *
	 * Anchored on the whole table row rather than on the cell's text, because the
	 * note's own prose quotes that text a hundred lines above the table — so a
	 * bare replace edits the walkthrough and leaves the row it is describing
	 * untouched, and every number below then asserts the unmodified sheet.
	 */
	const onResult = NOTE_TEXT.replace(
		'| Lucky charm | abilities.STR += 1 as luck |',
		'| Lucky charm | abilities.STR += 1 to result as luck |',
	);

	it('is a different number from the same modifier in the value phase', () => {
		expect(onResult).not.toBe(NOTE_TEXT);
		const before = sheetFrom(LAYOUT_TEXT, NOTE_TEXT);
		const after = sheetFrom(LAYOUT_TEXT, onResult);

		/*
		 * **Same +1, same row, same target, two answers** — which is the whole
		 * feature in one assertion.
		 *
		 * In the value phase it raises a score of 15 by a total of 4 to 19, and
		 * `floor((19 - 10) / 2)` is 4. Moved to the result phase it raises the
		 * score by 3 instead, to 18, and `floor((18 - 10) / 2)` is 4 — then the +1
		 * lands on that, giving 5. The luck +1 is worth one *ability modifier*
		 * where it was worth half of one, because half a score point is what a
		 * point of score is worth.
		 */
		expect(before.sheet('abilities.STR')).toBe(4);
		expect(after.sheet('abilities.STR')).toBe(5);
	});

	it('leaves the stored score alone in either phase', () => {
		// Constraint 4 does not care which number a modifier moves.
		const after = sheetFrom(LAYOUT_TEXT, onResult);
		expect(after.sheet('abilities.STR.value')).toBe(15);
	});

	it('keeps the value phase out of the slot the formula reads', () => {
		/*
		 * `mod.abilities.STR` is the *value* phase and nothing else, which is what
		 * lets a formula go on meaning what it meant: the result phase is added to
		 * what the formula came to, by the engine, and is never visible to
		 * `mod.self`.
		 */
		const after = sheetFrom(LAYOUT_TEXT, onResult);
		expect(after.sheet('mod.abilities.STR')).toBe(3);
	});

	it('names the phase on the line, and only where it is not the default', () => {
		const after = sheetFrom(LAYOUT_TEXT, onResult);
		const said = modifierBreakdown(after.modifiers.breakdown('abilities.STR'));
		// The one line that behaves differently says so; the three that behave as
		// they always did stay quiet, which is what keeps the difference visible.
		expect(said).toContain('Lucky charm — luck +1 to the derived number');
		expect(said).toContain('Belt of Giant Strength — item +2');
		expect(said).not.toContain('item +2 to the derived number');
	});

	it('round-trips the retyped cell byte for byte', () => {
		// Constraint 3, on the clause this feature added to the grammar.
		expect(serialiseCharacter(parseCharacter(onResult))).toBe(onResult);
	});
});

describe('the Record set fixture the recipe names', () => {
	/*
	 * The second fixture, and the same bargain as the first: what is checkable
	 * without the app is that both files are well formed and that the states the
	 * note's own prose tells the reader to look for are the states the parsers
	 * produce. The presses — find-in-page reaching a closed body, a rename
	 * propagating through a record's heading, the reset button, the modifier form
	 * — are why the vault exists.
	 */
	const built = sheetFrom(RECORDS_LAYOUT_TEXT, RECORDS_NOTE_TEXT);

	/** One record set's data, as its own `read` gives it up. */
	function recordsOf(id: string): RecordSetData {
		const entry = built.entryFor(id);
		expect(entry.error, `${id} would not read`).toBeNull();
		const data = entry.data as RecordSetData | null;
		expect(data, `${id} holds nothing`).not.toBeNull();
		return data as RecordSetData;
	}

	it('is accepted by the real layout parser, on the vault\'s own grid', () => {
		expect(built.layout.name).toBe(RECORDS_LAYOUT_FILE.replace(/\.json$/, ''));
		// Six columns, like every other layout in the throwaway vault: a fixture
		// laying out on a different grid looks different for a reason that has
		// nothing to do with what it tests.
		expect(built.layout.columns).toBe(6);
		expect(built.problems).toEqual([]);
		// Not a vacuous pass. The recipe promises a record set in a wide cell and
		// a narrow one, one with no fields, one in a Group and one in a Tab set.
		const types = built.prepared.map((entry) => entry.config.type);
		expect(types.filter((type) => type === 'record-set')).toHaveLength(5);
	});

	it('names the layout the note names, so neither can be renamed alone', () => {
		expect(built.note.layoutName).toBe(
			RECORDS_LAYOUT_FILE.replace(/\.json$/, ''),
		);
	});

	it('round-trips both files byte for byte', () => {
		// Constraint 3 over the fixture rather than over a case's own string: the
		// note is hand-written, so its spacing is the spacing a reader typed.
		expect(serialiseLayout(built.layout)).toBe(RECORDS_LAYOUT_TEXT);
		expect(serialiseCharacter(built.note)).toBe(RECORDS_NOTE_TEXT);
		for (const entry of built.prepared) {
			if (entry.config.type !== 'record-set' || entry.data === null) continue;
			const section = getSection(built.note, entry.config.label);
			expect(section, `${entry.config.label} has no section`).toBeDefined();
			expect(
				entry.component.write(entry.data, section?.body ?? null, entry.config),
				`${entry.config.label} does not write itself back unchanged`,
			).toBe(section?.body);
		}
	});

	it('draws every record the note holds, in file order', () => {
		const features = recordsOf('features');
		expect(Object.values(features.records).map((one) => one.name)).toEqual([
			'Second Wind',
			'[[Sunblade]]',
			'[[Torch of Revealing]]',
			'Warded cloak',
			'Hand broken',
			'Fey Ancestry',
			'Lucky',
		]);
		// The states the note's prose promises, each on its own record.
		expect(features.records[0]?.body).toContain('catoblepas');
		expect(features.records[6]?.body).toBe('');
		expect(features.records[5]?.fields?.Retired).toBe('4');
	});

	it('reports the hand-broken record and nothing else', () => {
		const features = recordsOf('features');
		const broken = Object.entries(features.records)
			.filter(([, record]) => record.error !== null)
			.map(([at]) => at);
		expect(broken).toEqual(['4']);
		expect(features.records[4]?.error).toContain('this line is not an entry');
		// And its bytes survive a write aimed at a neighbour, which is the half
		// the recipe asks the reader to check by reopening the note.
		const section = getSection(built.note, 'Features');
		const written = built
			.entryFor('features')
			.component.write(
				{ records: { 0: { fields: { Uses: '2' } } } },
				section?.body ?? null,
				built.entryFor('features').config,
			);
		expect(written).toContain('this line is not an entry');
		expect(written).toContain('Uses: 2');
	});

	it('reads the preamble as a preamble and keeps it out of every record', () => {
		const features = recordsOf('features');
		for (const record of Object.values(features.records)) {
			expect(record.body).not.toContain('Anything written above the first');
		}
		// It is still in the note, which is the other half of §10's rule.
		expect(getSection(built.note, 'Features')?.body).toContain(
			'Anything written above the first record is a preamble',
		);
	});

	it('holds a list with no fields at all, which is not an error', () => {
		const bare = recordsOf('bare_list');
		expect(Object.keys(bare.records)).toHaveLength(2);
		expect(bare.records[0]?.fields).toEqual({});
		expect(bare.records[0]?.error).toBeNull();
	});

	it('produces the numbers the recipe\'s aggregate cards promise', () => {
		// `10 + count(features, Attuned)`: two records carry `Attuned: yes`.
		expect(built.derivedFor('attuned_count')).toBe(12);
		// A record set inside a Group and inside a Tab set publishes nothing and
		// still counts, because containment is arrangement and never addressing.
		expect(built.derivedFor('group_card')).toBe(2);
		expect(built.derivedFor('tab_witness')).toBe(1);
	});

	it('moves the armour class card by the modifiers its records apply', () => {
		/*
		 * Two records enrol and one does not: `[[Sunblade]]` names the layout's
		 * own definition with `Attuned: yes`, `Warded cloak` types its own effect
		 * with `Attuned: yes`, and `[[Torch of Revealing]]` names the definition
		 * with `Attuned: no`. Both are `item`, so the best of the type applies —
		 * 10 + 2 rather than 10 + 3.
		 */
		expect(built.derivedFor('armour_class')).toBe(12);
		const breakdown = built.modifiers.breakdown('armour_class');
		// **The record whose condition is false is not a contributor at all**, so
		// it is absent rather than listed and suppressed: a condition decides
		// whether a modifier is in the contest, and the stacking rule decides who
		// wins it. `Torch of Revealing` is the one the reader ticks to see appear.
		expect(breakdown.lines.map((line) => line.label)).toEqual([
			'Sunblade',
			'Warded cloak',
		]);
		// The name a reader sees, never the one the file spells — and the
		// component's own label, which is what a row's label cannot carry.
		expect(breakdown.lines[0]?.source).toBe('Features');
		// Both are `item`, so the smaller of the two is listed and says why. That
		// is the whole reason a breakdown beats a mark.
		expect(breakdown.lines[0]?.suppressed).not.toBeNull();
		expect(breakdown.lines[1]?.suppressed).toBeNull();
	});

	it('restores the counters the recipe\'s Long rest promises', () => {
		const features = built.entryFor('features');
		const spells = built.entryFor('spells');
		const context = { resolve: () => null, explain: () => null };
		const full = features.component.applyReset?.(
			features.data,
			features.config,
			{ trigger: 'Long rest', action: 'full' },
			context,
		);
		expect(full?.ok).toBe(true);
		const empty = spells.component.applyReset?.(
			spells.data,
			spells.config,
			{ trigger: 'Long rest', action: 'empty' },
			context,
		);
		expect(empty?.ok).toBe(true);
		if (full?.ok !== true || empty?.ok !== true) return;
		const featureSection = getSection(built.note, 'Features');
		const after = features.component.read(
			features.component.write(
				full.data,
				featureSection?.body ?? null,
				features.config,
			),
			features.config,
		);
		expect(after.ok).toBe(true);
		if (!after.ok || after.data === null) return;
		const records = (after.data as RecordSetData).records;
		// Every readable record's `Uses` at its ceiling and every toggle set.
		expect(records[0]?.fields?.Uses).toBe('3');
		expect(records[0]?.fields?.Attuned).toBe('yes');
		expect(records[6]?.fields?.Uses).toBe('3');
		// And the hand-broken one is untouched, because no write into it is
		// accepted at all — it still holds the line that would not read, and it
		// still reports it rather than silently gaining a fence.
		expect(records[4]?.error).toContain('this line is not an entry');
		expect(records[4]?.fields).toEqual({});
	});

	it('names the field when a Long rest has no ceiling to restore to', () => {
		// The recipe's last step: take `max` off `Uses` and press it again.
		const features = built.entryFor('features');
		const config = features.config as RecordSetConfig;
		const uncapped: RecordSetConfig = {
			...config,
			fields: (config.fields ?? []).map((field) =>
				field.key === 'Uses' ? { ...field, max: undefined } : field,
			),
		};
		const result = features.component.applyReset?.(
			features.data,
			uncapped,
			{ trigger: 'Long rest', action: 'full' },
			{ resolve: () => null, explain: () => null },
		);
		expect(result?.ok).toBe(false);
		if (result?.ok !== false) return;
		expect(result.error).toContain('"Uses"');
	});
});
