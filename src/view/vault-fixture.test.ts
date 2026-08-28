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
 * markdown render, an actual `<select>`. Those are why the vault exists. What is
 * checkable without it is that the files are well formed and that the numbers
 * the steps tell the reader to expect are the numbers the engine produces — so a
 * step that has gone stale fails here instead of wasting the owner's afternoon.
 *
 * It mirrors `worked-examples.test.ts`'s wiring, which mirrors
 * `SheetView.renderSheet`, and adds the one part that file has no need for: the
 * modifier context. If the three ever disagree, the view is the one that is
 * right.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import { modifierBreakdown } from '../components/modifier-breakdown';
import { TableConfig, TableData, table } from '../components/table';
import { parseFunctions } from '../formula/functions';
import { modifierTargetSource } from '../formula/modifier-targets';
import { makeFieldResolver, resolveFormulaFields } from '../formula/resolve';
import {
	buildSheetEnv,
	publishedComponent,
	sheetModifiers,
} from '../formula/sheet';
import { getSection, parseCharacter, serialiseCharacter } from '../parse/character';
import { parseLayout, serialiseLayout } from '../parse/layout';
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

/** What `SheetView.renderSheet` builds, minus the DOM. */
function buildSheet(layoutSource: string, noteSource: string) {
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

	const env = buildSheetEnv(prepared.map(publishedComponent), library);
	// From the configuration and not from this note, which is the decision
	// SPEC §7 takes: which names accept a modifier is a property of the layout,
	// so the editor and the sheet reach one answer.
	const modifiers = sheetModifiers(
		prepared.map((entry) => modifierTargetSource(entry.config, entry.component)),
		env,
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
	const built = buildSheet(LAYOUT_TEXT, noteSource);
	const entry = built.entryFor('magic_items');
	expect(entry.error).toBeNull();
	return {
		config: entry.config as TableConfig,
		data: entry.data as TableData,
	};
}

describe('the layout file the fixture recipe names', () => {
	const { layout, problems } = buildSheet(LAYOUT_TEXT, NOTE_TEXT);

	it('is accepted by the real layout parser', () => {
		expect(layout.name).toBe(LAYOUT_FILE.replace(/\.json$/, ''));
		// Six columns, not the plugin's default twelve: every layout in the
		// throwaway vault is `"columns": 6`, and a fixture laying out on a
		// different grid from its siblings looks different for a reason that has
		// nothing to do with what it tests.
		expect(layout.columns).toBe(6);
		expect(problems).toEqual([]);
		// Not a vacuous pass: four components, and every one of them a type the
		// registry actually has.
		expect(layout.components).toHaveLength(5);
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
			'magic_items',
			'worn_items',
		]);
	});

	it('declares the three bonus types, one of them deliberately unused', () => {
		expect(layout.modifierTypes).toEqual(['item', 'status', 'circumstance']);
	});

	it('declares the columns of both modifier tables', () => {
		expect((layout.components[3] as TableConfig).columns).toEqual([
			{ key: 'Modifies', type: 'target' },
			{ key: 'Bonus', type: 'number', modifier: true, modifierType: 'item' },
			{ key: 'Aid', type: 'number', modifier: true, modifierType: 'status' },
			{ key: 'Notes', type: 'text' },
		]);
		// The second table exists so the qualified breakdown form is on the sheet
		// rather than something the reader has to build. Same bonus type as the
		// first, which is what makes its row a *tie* against the Ring in Magic
		// items and puts the second suppression wording on the sheet too.
		expect((layout.components[4] as TableConfig).columns).toEqual([
			{ key: 'Modifies', type: 'target' },
			{ key: 'Bonus', type: 'number', modifier: true, modifierType: 'item' },
		]);
	});

	it('reads every section it has without error', () => {
		// `configError` is each component's own private check rather than a
		// contract member, so nothing here can ask a component whether it
		// configures. What a misconfiguration *does* is publish nothing —
		// `table.ts` returns `{}` from `scopeValues` and `scopeModifiers` when
		// `configError` fires — so the arithmetic assertions further down are
		// what actually hold this fixture's configuration, and they would fail on
		// an empty push list rather than on a wrong number. This is the half that
		// is checkable directly.
		for (const entry of buildSheet(LAYOUT_TEXT, NOTE_TEXT).prepared) {
			expect(entry.error, entry.config.id).toBeNull();
		}
	});

	it('is already in the editor\'s own formatting, so opening and saving it rewrites nothing', () => {
		// A layout file carries no byte-identical promise, so this is a
		// convenience rather than Constraint 3 — but a fixture that reformats on
		// the owner's first save looks like the plugin damaged their file.
		expect(serialiseLayout(parseLayout(LAYOUT_TEXT))).toBe(LAYOUT_TEXT);
	});
});

describe('the character note the fixture recipe names', () => {
	const { note } = buildSheet(LAYOUT_TEXT, NOTE_TEXT);

	it('names the layout by its filename, which is how a note finds one', () => {
		// `loadLayout` reads `<folder>/<sheet-layout>.json`, so the frontmatter
		// value is the file's basename and not the layout's `name` key — they
		// match here, and this is the one that has to.
		expect(note.layoutName).toBe(LAYOUT_FILE.replace(/\.json$/, ''));
	});

	it('holds a section for each component that stores anything', () => {
		expect(getSection(note, 'Abilities')).toBeDefined();
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
		// Constraint 2 in the fixture: the row that is both a live link and a
		// live modifier. `markdown` storage, so nothing about it is fenced.
		expect(NOTE_TEXT).toContain('| [[Ring of Protection]] | armour_class | 1 |');
		expect(NOTE_TEXT).not.toContain('```\n| [[');
	});

	it('gives up all six rows, in order, through Table\'s real read', () => {
		const { data } = magicItems(NOTE_TEXT);
		const rows = Object.keys(data.rows)
			.map(Number)
			.sort((a, b) => a - b)
			.map((index) => data.rows[index]);
		expect(rows).toHaveLength(6);
		expect(rows.map((row) => row?.name)).toEqual([
			'Belt of Giant Strength',
			'Gauntlets of Ogre Power',
			"Bull's Strength",
			'[[Ring of Protection]]',
			'Cloak of Displacement',
			'Amulet of Misspelling',
		]);
		// Cells arrive keyed by the note's own header, lowercased.
		expect(rows.map((row) => row?.cells?.modifies)).toEqual([
			'abilities.STR',
			'abilities.STR',
			'abilities.STR',
			'armour_class',
			'passive_perception',
			'armor_class',
		]);
		expect(rows.map((row) => row?.cells?.bonus)).toEqual([
			'2',
			'1',
			'',
			'1',
			'2',
			'1',
		]);
		expect(rows.map((row) => row?.cells?.aid)).toEqual([
			'',
			'',
			'1',
			'',
			'',
			'',
		]);
	});

	it('writes both tables back unchanged, so nothing is normalised on save', () => {
		const built = buildSheet(LAYOUT_TEXT, NOTE_TEXT);
		for (const id of ['magic_items', 'worn_items']) {
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
	const built = buildSheet(LAYOUT_TEXT, NOTE_TEXT);

	it('gives Strength +5: the best item bonus, plus a status bonus of another type', () => {
		// Base +2 from a score of 15, the Belt's item +2, the Gauntlets' item +1
		// suppressed by it, and Bull's Strength's status +1 on top.
		expect(built.sheet('abilities.STR')).toBe(5);
		expect(built.sheet('abilities.STR.value')).toBe(15);
	});

	it('lists all three Strength contributors, with the smaller item bonus suppressed', () => {
		const breakdown = built.modifiers.breakdown('abilities.STR');
		expect(breakdown.total).toBe(3);
		expect(
			breakdown.lines.map((line) => [line.label, line.type, line.amount, line.suppressed]),
		).toEqual([
			['Belt of Giant Strength', 'item', 2, null],
			['Gauntlets of Ogre Power', 'item', 1, 'a larger item bonus applies'],
			["Bull's Strength", 'status', 1, null],
		]);
	});

	it('moves only the entry a row targeted', () => {
		// Press step 3. The other five are their scores and nothing else, which
		// is the case `mod.self` exists for.
		expect(built.sheet('abilities.DEX')).toBe(2);
		expect(built.sheet('abilities.CON')).toBe(1);
		expect(built.sheet('abilities.INT')).toBe(1);
		expect(built.sheet('abilities.WIS')).toBe(0);
		expect(built.sheet('abilities.CHA')).toBe(-1);
		for (const key of ['DEX', 'CON', 'INT', 'WIS', 'CHA']) {
			expect(
				built.modifiers.breakdown(`abilities.${key}`).lines,
				key,
			).toEqual([]);
		}
	});

	it('gives armour class one of two identical rings, and suppresses the other', () => {
		// 10 + DEX's +2 + one item +1. The two rings are the same size, so the
		// second is a *tie* rather than a smaller bonus — which is why
		// `modifiers.ts` carries two suppression wordings and why both are on this
		// sheet.
		expect(built.derivedFor('armour_class')).toBe(13);
		// And the name a formula elsewhere would read is the same number, which
		// is the property that keeps a card and the sheet from disagreeing.
		expect(built.sheet('armour_class')).toBe(13);
		const breakdown = built.modifiers.breakdown('armour_class');
		expect(breakdown.total).toBe(1);
		expect(
			breakdown.lines.map((line) => [line.source, line.label, line.suppressed]),
		).toEqual([
			['Magic items', 'Ring of Protection', null],
			[
				'Worn items',
				'Ring of Protection',
				'another item bonus of the same size applies',
			],
		]);
	});

	it('reads a row\'s label as the reader spells it, not as the file does', () => {
		// One of the two rings is `[[Ring of Protection]]` in the note and the
		// other is plain text, and both lines read the same — which is what makes
		// them indistinguishable without the table's name, and so what the
		// qualified form is *for*.
		expect(NOTE_TEXT).toContain('| [[Ring of Protection]] |');
		expect(NOTE_TEXT).toContain('| Ring of Protection |');
		const labels = built.modifiers
			.breakdown('armour_class')
			.lines.map((line) => line.label);
		expect(new Set(labels).size).toBe(1);
	});

	it('qualifies every line, because two tables are sources', () => {
		// The qualified form, on the sheet rather than something the reader has to
		// build. `modifier-breakdown.ts` decides this once per breakdown, so what
		// this asserts is that *both* lines carry a source, not just the colliding
		// one — Strength's three lines a card away carry none.
		const sources = built.modifiers
			.breakdown('armour_class')
			.lines.map((line) => line.source);
		expect(sources).toEqual(['Magic items', 'Worn items']);
		for (const line of built.modifiers.breakdown('abilities.STR').lines) {
			expect(line.source).toBe('Magic items');
		}
	});

	it('reads, as text, exactly what the popover will show', () => {
		// The text builder rather than the lines, because *whether a line carries
		// its table's name* is the builder's decision and not the line's — a
		// `ModifierLine` always holds a `source`. So this is the only assertion
		// here that actually checks the qualified form.
		expect(modifierBreakdown(built.modifiers.breakdown('armour_class'))).toBe(
			[
				'Magic items · Ring of Protection — item +1',
				'Worn items · Ring of Protection — item +1 (not applied: another item bonus of the same size applies)',
				'',
				'Total +1',
			].join('\n'),
		);
		// A card away, one table is the only source, so no line is qualified.
		expect(modifierBreakdown(built.modifiers.breakdown('abilities.STR'))).toBe(
			[
				'Belt of Giant Strength — item +2',
				'Gauntlets of Ogre Power — item +1 (not applied: a larger item bonus applies)',
				"Bull's Strength — status +1",
				'',
				'Total +3',
			].join('\n'),
		);
	});

	it('drops every prefix when the second table\'s only row goes', () => {
		// Press step 6, in the delete direction, which is the direction that shows
		// the harder half of the rule: the line that never collided loses its
		// prefix too.
		const edited = NOTE_TEXT.split('\n')
			.filter((line) => !line.startsWith('| Ring of Protection |'))
			.join('\n');
		expect(edited).not.toBe(NOTE_TEXT);
		const after = buildSheet(LAYOUT_TEXT, edited);
		const lines = after.modifiers.breakdown('armour_class').lines;
		expect(lines).toHaveLength(1);
		expect(lines[0]?.suppressed).toBeNull();
		expect(after.derivedFor('armour_class')).toBe(13);
		// The prefix is gone, which is the fact the step is about.
		expect(modifierBreakdown(after.modifiers.breakdown('armour_class'))).toBe(
			['Ring of Protection — item +1', '', 'Total +1'].join('\n'),
		);
	});

	it('leaves passive perception unmodified, and says it accepts nothing', () => {
		// Press step 4's first half: the row is pushing +2 at a published name
		// whose formula reads no slot, so the number does not move and the cell
		// is where the reader is told.
		expect(built.derivedFor('passive_perception')).toBe(10);
		expect(built.modifiers.publishes('passive_perception')).toBe(true);
		expect(
			built.modifiers.targets.map((target) => target.name),
		).not.toContain('passive_perception');
		expect(built.modifiers.breakdown('passive_perception').lines).toEqual([]);
	});

	it('publishes no armor_class, which is the other stray\'s reason', () => {
		// Press step 4's second half. Two different sentences on the cell,
		// because the fixes differ, and this is the fact they turn on.
		expect(built.modifiers.publishes('armor_class')).toBe(false);
		expect(built.modifiers.publishes('armour_class')).toBe(true);
	});

	it('offers exactly the accepting targets to the picker', () => {
		expect(built.modifiers.targets.map((target) => target.name)).toEqual([
			'abilities.STR',
			'abilities.DEX',
			'abilities.CON',
			'abilities.INT',
			'abilities.WIS',
			'abilities.CHA',
			'armour_class',
		]);
	});
});

describe('the two press steps that change the layout', () => {
	it('step 9: stripping mod.self empties the accepting set', () => {
		// What the layout editor turns into the "no formula on this layout reads a
		// modifier" error. Checked here as the set, because the sentence is the
		// editor's and `layout-editor.test.ts` holds that half.
		const stripped = LAYOUT_TEXT.replace(/ \+ mod\.self/g, '');
		expect(stripped).not.toBe(LAYOUT_TEXT);
		const after = buildSheet(stripped, NOTE_TEXT);
		expect(after.modifiers.targets).toEqual([]);
		// And every number that was modified falls back to its unmodified self,
		// which is what makes the error worth drawing before a character exists.
		expect(after.sheet('abilities.STR')).toBe(2);
		expect(after.derivedFor('armour_class')).toBe(12);
	});

	it('step 10: dropping a declared bonus type changes no number', () => {
		// The clause worth checking in that step: nothing stored ever names a
		// type, so removing one is a layout edit that cannot touch a note. The
		// editor's `item (not declared)` half is `list-fields.test.ts`'s.
		const dropped = LAYOUT_TEXT.replace('\t\t"item",\n', '');
		expect(dropped).not.toBe(LAYOUT_TEXT);
		const after = buildSheet(dropped, NOTE_TEXT);
		expect(after.layout.modifierTypes).toEqual(['status', 'circumstance']);
		expect(after.sheet('abilities.STR')).toBe(5);
		expect(after.derivedFor('armour_class')).toBe(13);
	});
});

describe('the trap the fixture is a witness to', () => {
	const built = buildSheet(LAYOUT_TEXT, NOTE_TEXT);

	it('reads mod.self as 0 for a resolver given no published name', () => {
		// Risk 1, on the fixture rather than on a contrived layout: armour class
		// is 13 through the call `card.ts` makes and 12 through the one that
		// forgets the name — 10 + DEX's +2, with the Ring's +1 silently gone and
		// nothing anywhere saying so.
		expect(built.derivedFor('armour_class')).toBe(13);
		expect(built.derivedWithoutName('armour_class')).toBe(12);
	});
});

describe('the two press steps that change the note', () => {
	it('step 1: the Belt at 4 takes Strength to +7', () => {
		const edited = NOTE_TEXT.replace(
			'| Belt of Giant Strength | abilities.STR | 2 |',
			'| Belt of Giant Strength | abilities.STR | 4 |',
		);
		expect(edited).not.toBe(NOTE_TEXT);
		const after = buildSheet(LAYOUT_TEXT, edited);
		expect(after.sheet('abilities.STR')).toBe(7);
		const lines = after.modifiers.breakdown('abilities.STR').lines;
		expect(lines[0]?.amount).toBe(4);
		// The Gauntlets are still suppressed, and still say so.
		expect(lines[1]?.suppressed).toBe('a larger item bonus applies');
	});

	it('step 5: pointing the stray at a real target adds a line and no number', () => {
		// The stacking rule and the provenance surface answering one press: a third
		// item +1 is a third tie, so the card does not move and the breakdown grows
		// a line saying why.
		const edited = NOTE_TEXT.replace('| armor_class |', '| armour_class |');
		expect(edited).not.toBe(NOTE_TEXT);
		const after = buildSheet(LAYOUT_TEXT, edited);
		expect(after.derivedFor('armour_class')).toBe(13);
		const lines = after.modifiers.breakdown('armour_class').lines;
		expect(lines).toHaveLength(3);
		expect(lines.filter((line) => line.suppressed !== null)).toHaveLength(2);
		expect(after.modifiers.publishes('armor_class')).toBe(false);
	});

	it('step 2: deleting the Belt drops Strength to +4 and the Gauntlets take over', () => {
		const edited = NOTE_TEXT.split('\n')
			.filter((line) => !line.startsWith('| Belt of Giant Strength |'))
			.join('\n');
		expect(edited).not.toBe(NOTE_TEXT);
		const after = buildSheet(LAYOUT_TEXT, edited);
		// +2 base, the Gauntlets' item +1, the status +1.
		expect(after.sheet('abilities.STR')).toBe(4);
		const lines = after.modifiers.breakdown('abilities.STR').lines;
		expect(lines.map((line) => [line.label, line.suppressed])).toEqual([
			['Gauntlets of Ogre Power', null],
			["Bull's Strength", null],
		]);
	});
});
