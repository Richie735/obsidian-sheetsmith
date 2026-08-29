/*
 * Promotion end to end: a row's own modifier saved into the layout file
 * (feature doc §8).
 *
 * **The first path in this plugin where a character's sheet writes the layout**,
 * so what this file holds is the ordering and the refusals rather than the
 * surface. `view/reset-flow.test.ts` is the shape: the layer tests each prove one
 * seam — `parse/modifier-cell.ts` reads and spells a part,
 * `components/modifier-form.ts` draws the gesture, `layouts.ts` writes the file —
 * and this proves they compose into the thing a reader actually does.
 *
 * It mirrors the wiring in `SheetView.renderSheet`, which cannot be driven
 * without a workspace around it; if the two ever disagree, this file is the copy
 * that is wrong.
 *
 * **The order is the whole of Constraint 4 here.** The layout write lands first
 * and the cell is rewritten only on `ok`, so a failed write leaves the cell
 * exactly as it was and the worst outcome is that nothing happened. The reverse
 * order would leave a cell naming a definition that does not exist — recoverable,
 * since that is a stray and strays are rendered rather than corrected, but it
 * would be this feature manufacturing one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import { buildSheet } from '../formula/sheet';
import { makeFieldResolver } from '../formula/resolve';
import { appendModifierDefinition } from '../layouts';
import { getSection, parseCharacter } from '../parse/character';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { spellParts, spellTypedEffect } from '../parse/modifier-cell';
import type { App as ObsidianApp } from 'obsidian';
import { App } from '../test/obsidian-stub';
import { LAYOUT_FOLDER } from '../test/plugin';
import { isContainer, PromoteResult, TypedEffect } from '../types';

const LAYOUT_NAME = 'Modifier variations';
const LAYOUT_PATH = `${LAYOUT_FOLDER}/${LAYOUT_NAME}.json`;

/**
 * A layout with one definition already in it, so a duplicate has something to hit,
 * and a card and a table so the *number* either side of a promotion is readable.
 */
const LAYOUT = {
	name: LAYOUT_NAME,
	columns: 6,
	components: [
		{
			id: 'armour_class',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 1, width: 3, height: 1 },
			derived: '10 + mod.self',
		},
		{
			id: 'magic_items',
			type: 'table',
			label: 'Magic items',
			position: { col: 1, row: 2, width: 6, height: 2 },
			rowHeader: 'Item',
			openRows: true,
			columns: [
				{ key: 'Modifiers', type: 'modifier', hideHeading: true },
				{ key: 'Worn', type: 'toggle' },
			],
		},
	],
	modifierTypes: ['item'],
	modifiers: [
		{
			name: 'Ring of Protection',
			target: 'armour_class',
			amount: '1',
			bonusType: 'item',
		},
	],
};

/** The effect a row typed, which is what a promotion is given. */
const EFFECT: TypedEffect = {
	target: 'armour_class',
	operator: 'add',
	amount: '2',
	bonusType: 'item',
	when: 'Worn',
};

let app: App;
/**
 * The stub, as the real signature wants it.
 *
 * The cast is `src/test/plugin.ts`' own argument read one layer out: the stub is a
 * *double* for `App` rather than an implementation of it, and every call site
 * would otherwise carry the same `as unknown` and the same paragraph.
 */
const vault = () => app as unknown as ObsidianApp;

beforeEach(async () => {
	app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	await app.vault.create(LAYOUT_PATH, serialiseLayout(LAYOUT));
});

/**
 * The note that row lives in, with whatever its modifier cell holds.
 *
 * `Worn` is yes because the effect below carries `when Worn`, so the row is active
 * either side of the promotion — which is the point: the *number* has to be
 * identical, and a condition that stopped holding would hide a change rather than
 * prove there was none.
 */
function noteWith(cell: string): string {
	return `---
sheet-layout: ${LAYOUT_NAME}
---

## Magic items

| Item | Modifiers | Worn |
| --- | --- | --- |
| Bracers of Warding +2 | ${cell} | yes |
`;
}

/**
 * What the card draws, through the view's own `buildSheet` and the real parsers.
 *
 * A mirror of `renderSheet` minus the DOM, which is why `formula/sheet.test.ts`'s
 * host scan names this file: a promotion check that wired modifiers its own way
 * would assert the arithmetic of a lookalike, and the number either side of a
 * promotion is the whole of what this proves.
 */
function armourClass(layout: Layout, noteSource: string): unknown {
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
	const { env } = buildSheet(layout, prepared);
	const card = prepared.find((entry) => entry.config.id === 'armour_class');
	if (!card) throw new Error('no armour class card');
	// Through the call `card.ts` makes, name and all: `resolveFormulaFields` takes
	// no name and would read `mod.self` as 0, which is the trap the fixture check
	// records as Risk 7.
	return makeFieldResolver(card.component, card.config, card.data, env)(
		'derived',
		{ value: '' },
		card.config.id,
	);
}

/** What the file holds now, through the real parser. */
async function held() {
	const file = app.vault.getFileByPath(LAYOUT_PATH);
	if (file === null) throw new Error('no layout file');
	return parseLayout(await app.vault.read(file));
}

/**
 * The cell the form would write, given a promotion's answer.
 *
 * The form's own rule in one line, which is what this file is really about: the
 * cell is rewritten **only** on `ok`, and every other part of it is re-joined as
 * its own stored text.
 *
 * **Through `spellParts`, never a hand-written `'; '`.** `parse/modifier-cell.ts`'s
 * header is that the separator, the discriminator and the two things a name may
 * not be are one fact and two declarations of them could drift apart; a mirror
 * spelling the join itself would go on asserting the old cell text after the
 * separator or its spacing changed, which is the mirror signing off on a lookalike.
 */
function cellAfter(
	parts: readonly string[],
	at: number,
	name: string,
	result: PromoteResult,
): string {
	if ('error' in result) return spellParts(parts);
	const next = parts.slice();
	next[at] = name;
	return spellParts(next);
}

describe('a promotion that lands', () => {
	it('appends one definition at the end, and edits none of the others', async () => {
		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		expect(result).toEqual({ ok: true });
		const layout = await held();
		expect((layout.modifiers ?? []).map((one) => one.name)).toEqual([
			'Ring of Protection',
			'Bracers of Warding',
		]);
		// The five fields, as the row typed them: a promotion is the effect itself
		// moving house, never a re-derivation of it.
		expect(layout.modifiers?.[1]).toEqual({
			name: 'Bracers of Warding',
			target: 'armour_class',
			operator: 'add',
			amount: '2',
			bonusType: 'item',
			when: 'Worn',
		});
		// And the definition that was already there is untouched, byte for byte.
		expect(layout.modifiers?.[0]).toEqual(LAYOUT.modifiers[0]);
	});

	it('writes the whole file through the one serialiser, so nothing is reformatted', async () => {
		/*
		 * There is one writer and one spelling: a layout promoted into is formatted
		 * exactly as one edited in the pane is. It is not a patch, which is what
		 * stops two spellings of one file existing.
		 */
		await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		const file = app.vault.getFileByPath(LAYOUT_PATH);
		const text = await app.vault.read(file!);
		expect(text).toBe(serialiseLayout(parseLayout(text)));
	});

	it('omits the clauses the row left blank, as the columns field does', async () => {
		// `parse/layout.ts`'s recorded trap, per definition: `operator: 'add'`, a
		// blank `bonusType` and a blank `when` are omitted rather than written.
		await appendModifierDefinition(vault(), LAYOUT_FOLDER, LAYOUT_NAME, 'Plain', {
			target: 'armour_class',
			operator: 'add',
			amount: '1',
		});
		const layout = await held();
		expect(layout.modifiers?.[1]).toEqual({
			name: 'Plain',
			target: 'armour_class',
			operator: 'add',
			amount: '1',
		});
		expect(layout.modifiers?.[1]).not.toHaveProperty('bonusType');
		expect(layout.modifiers?.[1]).not.toHaveProperty('when');
	});

	it('converts the part that promoted it, and leaves every other part alone', async () => {
		/*
		 * **The row that promoted it becomes a reference**, on §1's own spine rather
		 * than for convenience: an inline copy left standing beside the definition it
		 * was lifted from is a *cache* of what that definition says, and one edit to
		 * the definition later would have the row and the library disagreeing with
		 * nothing on the sheet to say which was meant.
		 */
		const parts = ['Ring of Protection', spellTypedEffect(EFFECT), 'Plate armour'];
		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		expect(cellAfter(parts, 1, 'Bracers of Warding', result)).toBe(
			'Ring of Protection; Bracers of Warding; Plate armour',
		);
	});

	it('leaves another row holding the identical text untouched', async () => {
		/*
		 * **Nothing is searched for and nothing else is rewritten**, and the decision
		 * is checked rather than merely stated. Three reasons, the first decisive: a
		 * layout edit rewriting cells in notes nobody opened is the migration §10
		 * declines to perform; the plugin cannot see them without a vault scan on a
		 * button press; and two identical texts are not evidence of one intent.
		 *
		 * The residue is honest and small: after promotion one row references the
		 * definition and the others go on computing the same numbers from their own
		 * text.
		 */
		const other = [spellTypedEffect(EFFECT)];
		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		expect(result).toEqual({ ok: true });
		expect(cellAfter(other, -1, 'Bracers of Warding', result)).toBe(
			spellParts(other),
		);
	});

	it('leaves the promoting row computing the identical number', async () => {
		/*
		 * **Criterion 23's numeric half**, and the reason the criterion asked for a
		 * number rather than a structural comparison: the promise of the gesture is
		 * that *nothing changes* except where the effect now lives. The row computes
		 * the same value by another route — its own text before, the layout's
		 * definition after — which is what makes "the cell becomes a reference" safe
		 * rather than merely tidy.
		 */
		const typed = noteWith(spellTypedEffect(EFFECT));
		const before = armourClass(await held(), typed);
		// 10 + the typed item +2.
		expect(before).toBe(12);

		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		expect(result).toEqual({ ok: true });

		// The layout the promotion wrote, and the cell the form converts on `ok`.
		const converted = noteWith(
			cellAfter([spellTypedEffect(EFFECT)], 0, 'Bracers of Warding', result),
		);
		expect(converted).toContain('| Bracers of Warding | yes |');
		expect(armourClass(await held(), converted)).toBe(before);
	});

	it('changes no other row\'s number', async () => {
		// The other half of the same criterion: a row that never held the effect and
		// never names the new definition is untouched by the append, because an
		// append cannot reach a cell.
		const other = noteWith('Ring of Protection');
		const before = armourClass(await held(), other);
		expect(before).toBe(11);
		await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		expect(armourClass(await held(), other)).toBe(before);
	});

	it('orphans nothing, because it only appends', async () => {
		// Nothing that resolved a moment ago stops resolving: no cell anywhere
		// pointed at that name, since the parser would have refused a duplicate.
		const before = await held();
		await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		const after = await held();
		expect(after.modifiers?.slice(0, before.modifiers?.length)).toEqual(
			before.modifiers,
		);
		expect(after.components).toEqual(before.components);
		expect(after.modifierTypes).toEqual(before.modifierTypes);
	});
});

describe('a promotion that is refused', () => {
	/** Every refusal, with the cell it must not have touched. */
	const parts = ['Ring of Protection', spellTypedEffect(EFFECT)];

	async function refused(name: string) {
		const before = await app.vault.read(
			app.vault.getFileByPath(LAYOUT_PATH)!,
		);
		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			name,
			EFFECT,
		);
		const after = await app.vault.read(app.vault.getFileByPath(LAYOUT_PATH)!);
		// **The layout is untouched too**, not only the cell: a refusal writes
		// nothing at all.
		expect(after).toBe(before);
		// And the cell keeps its text, which is the assertion that matters — a cell
		// rewritten after a failed layout write is the one way this gesture could
		// manufacture a stray.
		expect(cellAfter(parts, 1, name, result)).toBe(spellParts(parts));
		if (!('error' in result)) throw new Error('expected a refusal');
		return result.error;
	}

	it('refuses a blank name', async () => {
		expect(await refused('   ')).toBe('Give it a name to reuse it by.');
	});

	it('refuses a name holding the separator, in the parser\'s own words', async () => {
		// Reused verbatim, so a reader who meets the rule twice meets one sentence.
		expect(await refused('Boots; gloves')).toBe(
			'"Boots; gloves" cannot be a name, because a row separates the modifiers it applies with a semicolon. Rename it without one.',
		);
	});

	it('refuses a name that reads as an assignment', async () => {
		expect(await refused('armour_class = 18')).toBe(
			'"armour_class = 18" cannot be a name, because a row spells its own modifiers that way. Rename it, or write it as a modifier\'s Changes and Amount instead.',
		);
	});

	it('refuses a name the layout already declares, always', async () => {
		/*
		 * **Not "reuse the existing one".** That definition may say something
		 * different, and silently pointing the row at it would change the row's
		 * arithmetic under a gesture whose whole promise is that nothing changes. And
		 * not "compare the five fields and reuse it if they match" either, which is a
		 * same-ness test on two expressions that would have to decide whether `2` and
		 * `1 + 1` are the same definition.
		 */
		expect(await refused('Ring of Protection')).toBe(
			'This layout already has a modifier called "Ring of Protection". Choose another name, or pick that one from the list above.',
		);
	});

	it('refuses a name a leading or trailing space would have hidden', async () => {
		// Trimmed on both sides, because the parser dedupes on trimmed names: a
		// gesture that accepted what the parser then dropped would be the instrument
		// disagreeing with itself.
		expect(await refused(' Ring of Protection ')).toContain(
			'already has a modifier called "Ring of Protection"',
		);
	});

	it('passes the vault\'s own reason through where the write fails', async () => {
		// The layout file is gone, read-only, or no longer parses. Either way the
		// cell is untouched and the message is whoever refused it.
		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			'No such layout',
			'Bracers of Warding',
			EFFECT,
		);
		expect(result).toEqual({
			error: `Layout "No such layout" was not found in "${LAYOUT_FOLDER}".`,
		});
	});

	it('passes a parse failure through rather than overwriting the file', async () => {
		/*
		 * The one case that would be catastrophic if it went the other way: a layout
		 * file that no longer parses must not be replaced by one assembled from
		 * whatever survived. Nothing is written.
		 */
		const file = app.vault.getFileByPath(LAYOUT_PATH);
		await app.vault.modify(file!, '{ not json');
		const result = await appendModifierDefinition(
			vault(),
			LAYOUT_FOLDER,
			LAYOUT_NAME,
			'Bracers of Warding',
			EFFECT,
		);
		expect('error' in result).toBe(true);
		expect(await app.vault.read(file!)).toBe('{ not json');
	});
});
