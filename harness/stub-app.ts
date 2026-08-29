/*
 * The stand-in app both of the plugin's own surfaces run against.
 *
 * An in-memory vault holding one layout file, a plugin object carrying settings
 * and a save, and a watch on that file so an edit made in the layout editor
 * re-renders the sheet beside it. Everything here is scaffolding for the app:
 * the settings tab and the layout editor pane are the real classes, not copies.
 *
 * Its own module because two surfaces need it and neither should have to know
 * how the other is built.
 */

import { App, Vault } from '../src/test/obsidian-stub';
import { LAYOUT_FOLDER } from '../src/test/plugin';
import { Layout, parseLayout, serialiseLayout } from '../src/parse/layout';
import { Sample, SAMPLES } from './samples';

const LAYOUT_NAME = 'Harness sheet';

/**
 * The layout the sheet side renders, as a file the editor can open.
 *
 * Takes its components, because the two surfaces have to be looking at the
 * same layout: the sheet swaps configs when the state changes, and an editor
 * still holding the populated layout would show a healthy form beside a card
 * rendering an error — the instrument disagreeing with itself, which is worse
 * than showing nothing (UI.md §11).
 */
export function harnessLayout(samples: readonly Sample[] = SAMPLES): Layout {
	return {
		name: LAYOUT_NAME,
		columns: 12,
		components: samples.map((sample) => sample.config),
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest', 'Short rest'],
		// The layout's own bonus-type vocabulary (SPEC §5). Three are used by the
		// modifier definitions below; the fourth is declared and unused, which is
		// what a layout carrying a system's whole list looks like. `circumstance`
		// used to be the unused one and is now the Bracers' type, because a row
		// that changes two *different* values needs a second target and every type
		// at `armour_class` was already taken.
		modifierTypes: ['item', 'status', 'circumstance', 'morale'],
		/*
		 * The changes this layout's items can make (SPEC §5). A character's row
		 * enrols in one by name; nothing about the change is in a note.
		 *
		 * Ten, one per state worth looking at, and the count is against the list
		 * rather than remembered:
		 *
		 * - **two item bonuses at one target at different amounts**, so the
		 *   stacking rule has something to suppress and the STR card's breakdown
		 *   says which and why;
		 * - **a status bonus at that same target**, so two types add over one name;
		 * - **an item bonus at a card**, enrolled in from *two* tables, which is
		 *   what makes the qualified breakdown form and the same-size suppression
		 *   wording reachable on one sheet;
		 * - **an override**, and **a second, lower override**, so both the applied
		 *   and the suppressed override lines are on screen and the total line
		 *   reads as a value rather than an addend;
		 * - **a conditional bonus**, whose row's `Worn` cell is no, so a `zap-off`
		 *   glyph and an absence from the breakdown are both on the sheet;
		 * - **a bonus at a table cell** rather than a card — the skills card's
		 *   published Perception row — which is the third surface a modifier
		 *   reaches and the only one where the mark lands in a table;
		 * - **a bonus at a value that reads no modifier**, which is the one
		 *   definition here to be *reported* in the editor rather than to work;
		 * - **a second bonus at `armour_class` of a third type**, which exists so
		 *   one row's cell can name two modifiers that both apply, to two
		 *   different values — one glyph, two numbers moving.
		 */
		modifiers: [
			{
				name: 'Belt of Giant Strength',
				target: 'abilities.STR',
				amount: '2',
				bonusType: 'item',
			},
			{
				name: 'Gauntlets of Ogre Power',
				target: 'abilities.STR',
				amount: '1',
				bonusType: 'item',
			},
			{
				name: "Bull's Strength",
				target: 'abilities.STR',
				amount: '1',
				bonusType: 'status',
			},
			{
				name: 'Ring of Protection',
				target: 'armour_class',
				amount: '1',
				bonusType: 'item',
			},
			{
				// **The `+1` in the name is deliberate**: a name carrying arithmetic,
				// sitting in a cell, and *not* being read as arithmetic is the
				// discriminator's hardest case, and it belongs in a file rather than
				// only in a test.
				name: 'Bracers of Defence +1',
				target: 'armour_class',
				amount: '1',
				bonusType: 'circumstance',
			},
			{
				name: 'Plate armour',
				target: 'armour_class',
				operator: 'override',
				amount: '18',
			},
			{
				name: 'Mage armour',
				target: 'armour_class',
				operator: 'override',
				amount: '13',
			},
			{
				name: 'Cloak of Elvenkind',
				target: 'armour_class',
				amount: '1',
				bonusType: 'status',
				when: 'Worn',
			},
			{
				name: 'Eyes of the Eagle',
				target: 'skills.perception',
				amount: '2',
				bonusType: 'item',
			},
			{
				name: 'Cloak of Displacement',
				target: 'passive_perception',
				amount: '2',
				bonusType: 'item',
			},
		],
	};
}

/**
 * What the layout folder holds: a layout, or one of the two states the editor
 * has to draw instead of one.
 *
 * `'none'` is a configured folder with nothing in it, which is what a new vault
 * looks like. `'broken'` is a file that will not parse, which is the ordinary
 * way a layout is wrong — it is a thing people hand-edit and share.
 */
export type LayoutSource = Layout | 'none' | 'broken';

/** A truncated file, which is what a hand edit interrupted actually leaves. */
const UNPARSEABLE = '{\n\t"name": "Harness sheet",\n\t"components": [\n';

/**
 * Put the layout in the stub vault, where the plugin's folder preference looks
 * for it.
 *
 * The folder is created either way, including for `'none'`: an author who has
 * set a layout folder and put nothing in it has a folder, and the editor's empty
 * state is about having no layouts rather than no folder.
 *
 * The plugin object itself is `src/test/plugin.ts`'s, shared with the tests. Two
 * calls at each surface rather than one function doing both, because writing a
 * file and building a plugin are two jobs and the combined one could only be
 * named with an "and" (`docs/PATTERNS.md` §1).
 */
export async function plantLayout(
	app: App,
	layout: LayoutSource,
): Promise<void> {
	await app.vault.createFolder(LAYOUT_FOLDER);
	if (layout === 'none') return;
	await app.vault.create(
		`${LAYOUT_FOLDER}/${LAYOUT_NAME}.json`,
		layout === 'broken' ? UNPARSEABLE : serialiseLayout(layout),
	);
}

/**
 * Watch the layout file for writes rather than hooking the editor.
 *
 * The editor saves through `app.vault.modify`, and giving the harness its own
 * notification would mean the harness knowing when a save happens — which is
 * exactly the coupling the plugin does not have. Wrapping the vault keeps the
 * editor unmodified and unaware.
 */
export function watchLayoutFile(
	vault: Vault,
	onChange: (layout: Layout) => void,
): void {
	const modify = vault.modify.bind(vault);
	vault.modify = async (file, content) => {
		await modify(file, content);
		try {
			onChange(parseLayout(content));
		} catch {
			// An in-progress edit can leave the file briefly unparseable. The
			// editor reports that itself; the sheet simply keeps the last good
			// layout rather than blanking.
		}
	};
}
