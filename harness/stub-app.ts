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
import type { ComponentConfig } from '../src/types';
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
		 *   different values — one glyph, two numbers moving;
		 * - **one definition naming two changes**, which is the only state the
		 *   editor's Modifiers list could not draw before
		 *   (`docs/features/multi-change-definitions.md`).
		 *
		 * **The nested one sits directly under `Ring of Protection`, deliberately**,
		 * so a reviewer reads a one-change definition and a two-change one against
		 * each other rather than scrolling between them — and so it is inside the
		 * frame `editor-layout` captures, which the foot of an eleven-entry list is
		 * not.
		 *
		 * **And it is enrolled in by no row, also deliberately.** What it is here
		 * for is the *editor*: `editor-layout` has to show a nested Changes list
		 * beside nine flat ones, and a one-change definition and a two-change one
		 * have to read as one form. Putting it in a cell would move two numbers on
		 * the sheet and rewrite the arithmetic every comment in this file and every
		 * sheet shot is measured against, to show something the vault fixture
		 * already shows end to end (`src/test/fixtures/modifiers/`). It still
		 * reaches the sheet where it costs nothing: the modifier form's **Modifier**
		 * picker lists it, with `(2 values)` qualifying the *name* — beside it
		 * rather than after the outcome, because a `<select>` clips from the end and
		 * the outcome is the long half.
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
				/*
				 * The one definition here spelled with a `changes` list. Two values,
				 * one name, one condition governing both.
				 *
				 * **The two changes carry different bonus types and different
				 * phases**, which is what the shot is for: each change is a full
				 * independent contributor, and a list whose every line read the same
				 * type and the same phase would look like a definition-level field
				 * drawn twice. `morale` is the one type nothing else on this layout
				 * uses, so the pair is visibly not a copy.
				 */
				name: 'Blessing of the Bear',
				when: 'Worn',
				changes: [
					{ target: 'abilities.STR', amount: '1', bonusType: 'morale' },
					{
						target: 'armour_class',
						amount: '1',
						bonusType: 'status',
						applies: 'result',
					},
				],
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
		/*
		 * The values this layout copies into a character's frontmatter (SPEC §9).
		 *
		 * Four, one per state the **Promoted fields** list has to be looked at in,
		 * because none of them is visible in code (UI.md §11):
		 *
		 * - **a bare name**, which is the derived reading a card shows;
		 * - **a `.value` form**, so a label carrying a suffix is on screen at the
		 *   width the picker actually gets — `Abilities · STR · stored` is the
		 *   longest thing this control ever holds, and the clipped-value `title`
		 *   is the only recovery it has;
		 * - **a table's column total**, so a published name that is not a card's
		 *   is in the list;
		 * - **a row pointed at a name this layout does not publish**, which is the
		 *   one row here to be *marked* rather than to work: the field carries the
		 *   parser's own clause and the report under the list says it in full, and
		 *   both are on screen together.
		 *
		 * It has no effect on the sheet side of the harness, which writes no note
		 * — `docs/BACKLOG.md` § UI already records that the harness sheet has no
		 * note to write into — so what this state is for is the editor's own pane.
		 */
		promotedFields: [
			{ name: 'armour_class', property: 'ac' },
			{ name: 'abilities.STR.value', property: 'strength' },
			{ name: 'inventory.Weight', property: 'carried' },
			{ name: 'armor_class', property: 'ac_old' },
		],
	};
}

/**
 * A small layout built for the grid canvas's own shots
 * (`docs/features/grid-canvas.md` §"Acceptance criteria"): two components
 * whose grid rectangles genuinely overlap, and a Group with children sized
 * for a resize gesture to have somewhere to grow. The main sample sheet
 * stays free of a deliberate overlap, so this is its own small layout rather
 * than one more thing threaded through it.
 */
export function canvasDemoLayout(): Layout {
	return {
		name: LAYOUT_NAME,
		columns: 12,
		components: [
			// Drawn first, so it is the one a later sibling paints over —
			// `behind`'s own overlay is what a selection has to be raised
			// above (`docs/features/grid-canvas.md` §2's overlap hazard).
			{
				id: 'behind',
				type: 'card',
				label: 'Behind',
				position: { col: 1, row: 1, width: 4, height: 1 },
			},
			{
				id: 'front',
				type: 'card',
				label: 'Front',
				position: { col: 3, row: 1, width: 4, height: 1 },
			},
			{
				id: 'gear',
				type: 'group',
				label: 'Gear',
				position: { col: 1, row: 3, width: 6, height: 3 },
				children: [
					{
						id: 'inventory',
						type: 'table',
						label: 'Inventory',
						position: { col: 1, row: 1, width: 6, height: 3 },
						columns: [{ key: 'item' }, { key: 'weight', type: 'number' }],
						rows: [{ label: 'Rope' }, { label: 'Torch' }],
					} as ComponentConfig,
				],
			},
		],
		triggers: [],
	};
}

/**
 * What the layout folder holds: a layout, or one of the three states the
 * editor has to draw instead of one.
 *
 * `'none'` is a configured folder with nothing in it, which is what a new
 * vault looks like. `'broken'` is a file that will not parse, which is the
 * ordinary way a layout is wrong — it is a thing people hand-edit and
 * share. `'canvas-demo'` is `canvasDemoLayout` above, addressed by name for
 * the same reason the other two are: `harness.ts`'s `&layout=` query has no
 * way to hand over a whole object. `'outside'` is the harness layout filed
 * somewhere a character cannot reach it — another folder — which is the one
 * state of a *valid* layout the pane draws differently
 * (`docs/features/visible-layout-files.md`). `'no-file'` is the harness layout
 * in the folder with the pane opened on nothing, which is what a pane shows
 * after its file is deleted from outside.
 */
export type LayoutSource =
	| Layout
	| 'none'
	| 'broken'
	| 'canvas-demo'
	| 'outside'
	| 'no-file';

/** Where the outside-the-folder layout is filed. */
const OUTSIDE_FOLDER = 'Elsewhere';

/** A truncated file, which is what a hand edit interrupted actually leaves. */
const UNPARSEABLE = '{\n\t"name": "Harness sheet",\n\t"components": [\n';

/**
 * Put the layout in the stub vault, where the plugin's folder preference looks
 * for it.
 *
 * The folder is created either way, including for `'none'`: an author who has
 * set a layout folder and put nothing in it has a folder, and the editor's empty
 * state is about having no layouts rather than no folder. It answers the path
 * the pane is to be opened on, because the pane is bound to a file — or null
 * for `'none'` and `'no-file'`, which open it on nothing.
 *
 * The plugin object itself is `src/test/plugin.ts`'s, shared with the tests. Two
 * calls at each surface rather than one function doing both, because writing a
 * file and building a plugin are two jobs and the combined one could only be
 * named with an "and" (`docs/PATTERNS.md` §1).
 */
export async function plantLayout(
	app: App,
	layout: LayoutSource,
): Promise<string | null> {
	await app.vault.createFolder(LAYOUT_FOLDER);
	if (layout === 'none') return null;
	// A `.sheetsmith` file, which is what the plugin writes and what a pane is
	// opened on from the file explorer.
	if (layout === 'outside') {
		await app.vault.createFolder(OUTSIDE_FOLDER);
		const file = await app.vault.create(
			`${OUTSIDE_FOLDER}/${LAYOUT_NAME}.sheetsmith`,
			serialiseLayout(harnessLayout()),
		);
		return file.path;
	}
	if (layout === 'no-file') {
		await app.vault.create(
			`${LAYOUT_FOLDER}/${LAYOUT_NAME}.sheetsmith`,
			serialiseLayout(harnessLayout()),
		);
		return null;
	}
	const file = await app.vault.create(
		`${LAYOUT_FOLDER}/${LAYOUT_NAME}.sheetsmith`,
		layout === 'broken'
			? UNPARSEABLE
			: serialiseLayout(layout === 'canvas-demo' ? canvasDemoLayout() : layout),
	);
	return file.path;
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
