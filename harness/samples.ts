/*
 * The sheet the harness renders: one layout exercising every registered
 * component, plus the note body each section starts from.
 *
 * A 5e-flavoured sheet on purpose. The plugin knows no system, but a reviewer
 * judging whether a card reads correctly needs values that mean something, and
 * an ability score is the one vocabulary every reader already has.
 *
 * Adding a component means adding it here too, or the harness will not show it.
 */

import { paletteEntries } from '../src/components';
import type { ComponentConfig } from '../src/types';

/**
 * One palette entry's prefill, taken from the registry rather than retyped.
 *
 * A sample of an entry has to be the entry. `docs/PATTERNS.md` §1's policy tier
 * is the argument: a prefill is a *set* of keys, so the only thing a guard could
 * assert about a second copy is that it still agrees with the first — and the
 * harness is the review surface, so the copy that drifts is the one somebody is
 * looking at while deciding the entry is fine.
 *
 * It throws rather than falling back, on `effectiveSamples`' own reason further
 * down: an entry renamed would otherwise spread nothing, and the sample would go
 * on being photographed as a bare table of that type with nothing saying so.
 */
function entryConfig(type: string, name: string): Partial<ComponentConfig> {
	const entry = paletteEntries(type).find((one) => one.name === name);
	if (entry === undefined) {
		throw new Error(
			`No "${name}" entry on ${type}. It was renamed or removed; fix the name here, or this sample is a bare ${type}.`,
		);
	}
	return entry.config;
}

export interface Sample {
	config: ComponentConfig;
	/** Section body as it would appear in a character note. */
	body: string | null;
	/**
	 * Section bodies for the components inside this one, by component id.
	 *
	 * A container has no section of its own, and its children's sections are
	 * ordinary `##` headings in the same flat note — so they are keyed by id
	 * here for the reason the harness keys everything else by id: a layout edit
	 * must never lose a stored value.
	 */
	children?: Record<string, string | null>;
}

/** The populated sheet: every component holding plausible values. */
export const SAMPLES: Sample[] = [
	{
		config: {
			id: 'abilities',
			type: 'card-set',
			label: 'Abilities',
			position: { col: 1, row: 1, width: 12, height: 1 },
			entries: [
				{ key: 'STR', name: 'Strength' },
				{ key: 'DEX', name: 'Dexterity' },
				{ key: 'CON', name: 'Constitution' },
				{ key: 'INT', name: 'Intelligence' },
				{ key: 'WIS', name: 'Wisdom' },
				{ key: 'CHA', name: 'Charisma' },
			],
			// `mod.self` is what makes the six abilities modifiable, and it is the
			// case the relative spelling exists for: one formula runs per entry,
			// and no absolute name inside it could say which entry it is running
			// for. Watch the Magic items table below move STR and leave DEX alone.
			//
			// **Inside the parenthesis, not after it**, which is where a `+2 Str`
			// item belongs: a belt raises the *score* and the ability modifier is
			// derived from the raised score, so 15 with an item +2 is a 17 reading
			// +3. Added to the result instead, the same belt moved the modifier by
			// a whole +2 — twice what the item says it does.
			derived: 'floor((value + mod.self - 10) / 2)',
		} as ComponentConfig,
		body: '```sheet\nSTR: 15\nDEX: 14\nCON: 13\nINT: 12\nWIS: 10\nCHA: 8\n```',
	},
	{
		config: {
			id: 'armour_class',
			type: 'card',
			label: 'Armour class',
			position: { col: 1, row: 2, width: 2, height: 1 },
			key: 'AC',
			// The absolute half of the same rule: a Card publishes under its bare
			// id, so `mod.armour_class` would work too — `mod.self` is the one to
			// reach for, exactly as `value` is over `<name>.value`.
			derived: '10 + abilities.DEX + mod.self',
			notePlaceholder: 'armour worn',
			signed: false,
		} as ComponentConfig,
		body: '```sheet\nAC: 16\nnote: chain mail, shield\n```',
	},
	{
		config: {
			id: 'passive_perception',
			type: 'card',
			label: 'Passive perception',
			position: { col: 3, row: 2, width: 2, height: 1 },
			// Nothing stored: the number is the skills card's own Perception
			// row, read by name. The card the whole feature was written for.
			derived: '10 + skills.perception',
			signed: false,
			hideValue: true,
			hideNote: true,
		} as ComponentConfig,
		body: null,
	},
	{
		config: {
			id: 'hit_points',
			type: 'pool',
			label: 'Hit points',
			position: { col: 5, row: 2, width: 4, height: 1 },
			maxSource: 'calculated',
			max: '8 + abilities.CON',
			hasTemp: true,
		} as ComponentConfig,
		body: '```sheet\ncurrent: 6\nmax: 9\ntemp: 3\n```',
	},
	{
		config: {
			id: 'death_saves',
			type: 'track',
			label: 'Death saves',
			position: { col: 9, row: 2, width: 4, height: 1 },
			count: 3,
			rows: [
				{ key: 'successes', name: 'Successes', sense: 'progress' },
				{ key: 'failures', name: 'Failures', sense: 'harm' },
			],
		} as ComponentConfig,
		body: '```sheet\nsuccesses: 1\nfailures: 2\n```',
	},
	{
		config: {
			id: 'skills',
			type: 'table',
			label: 'Skills',
			position: { col: 1, row: 3, width: 12, height: 2 },
			rowHeader: 'Skill',
			namePosition: 1,
			columns: [
				{
					key: 'Training',
					hideHeading: true,
					type: 'level',
					levels: ['Untrained', 'Proficient:P', 'Expertise:E'],
				},
				{
					key: 'Bonus',
					type: 'computed',
					// `+ mod.self` on a *published* column, which is the third
					// surface a modifier reaches and the only one that is a table
					// cell: the Perception row carries a key, so it has a slot, and
					// the rows that carry none read the slot as 0 rather than "?".
					formula: 'ability + Training * 2 + mod.self',
					// The published column: every row carrying a key answers to
					// `skills.<key>`, which is what the passive perception card
					// above reads.
					publish: true,
				},
				{ key: 'Notes', type: 'text' },
			],
			rows: [
				{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
				{ label: 'Athletics', values: { ability: 'abilities.STR' } },
				{
					label: 'Perception',
					key: 'perception',
					values: { ability: 'abilities.WIS' },
				},
				{ label: 'Persuasion', values: { ability: 'abilities.CHA' } },
			],
		} as ComponentConfig,
		body: [
			'| Skill | Training | Bonus | Notes |',
			'| --- | --- | --- | --- |',
			'| Acrobatics | 1 | | |',
			'| Athletics | 0 | | |',
			'| Perception | 2 | | keen senses |',
			'| Persuasion | 0 | | |',
		].join('\n'),
	},
	{
		config: {
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			position: { col: 1, row: 5, width: 8, height: 2 },
			rowHeader: 'Item',
			// The open-row card: the layout declares the gear every character
			// starts with, and the player adds the rest. A Blades load list is
			// the case that needs both on one list at once.
			openRows: true,
			rows: [{ label: 'Adventurer\'s pack' }],
			columns: [
				{ key: 'Qty', type: 'number', min: 0 },
				{ key: 'Weight', type: 'number', total: true },
				{ key: 'Worn', type: 'toggle', hideHeading: true, total: true },
				{ key: 'Notes', type: 'text' },
			],
		} as ComponentConfig,
		body: [
			'| Item | Qty | Weight | Worn | Notes |',
			'| --- | --- | --- | --- | --- |',
			"| Adventurer's pack | 1 | 12 | no | bedroll, rations |",
			'| [[Sunblade\\|sword]] | 1 | 3 | yes | attuned |',
			'| Dagger | 2 | 1 | yes | in [[Bag of Holding]] |',
			'| Dagger | 1 | 1 | no | thrown |',
			'| [[Torch of Revealing]] | 1 |  | no | not written up yet |',
			'| Chalk \\| charcoal | 1 |  | no |  |',
		].join('\n'),
	},
	{
		config: {
			id: 'attacks',
			type: 'table',
			label: 'Attacks',
			position: { col: 9, row: 5, width: 4, height: 2 },
			rowHeader: 'Attack',
			// Nothing declared: every row is the character's. The card the empty
			// state was written for, since "rows come from the layout" is
			// precisely wrong here.
			openRows: true,
			columns: [
				{ key: 'Hit', type: 'number' },
				{ key: 'Damage', type: 'text' },
			],
		} as ComponentConfig,
		body: [
			'| Attack | Hit | Damage |',
			'| --- | --- | --- |',
			'| Longsword | 5 | 1d8+2 |',
			'| Dagger | 5 | 1d4+2 |',
		].join('\n'),
	},
	/*
	 * A row of aggregates under the two open tables, which is the whole of the
	 * feature's visible surface: there is no control for one, so the way to
	 * look at it is a readout beside the rows it reads. Watch these while
	 * adding, editing and deleting an inventory row — each follows on commit,
	 * not per keystroke, which is a published name reading the note.
	 */
	{
		config: {
			id: 'encumbrance',
			type: 'card',
			label: 'Weight carried',
			position: { col: 1, row: 7, width: 3, height: 1 },
			// Quantity times weight summed down the list, over rows the layout
			// never declared. The number §13 said could not be written.
			derived: 'sum(inventory, Qty * Weight)',
			signed: false,
			hideValue: true,
			hideNote: true,
		} as ComponentConfig,
		body: null,
	},
	{
		config: {
			id: 'worn_weight',
			type: 'card',
			label: 'Weight worn',
			position: { col: 4, row: 7, width: 3, height: 1 },
			derived: 'sum(inventory, Weight, Worn)',
			signed: false,
			hideValue: true,
			hideNote: true,
		} as ComponentConfig,
		body: null,
	},
	{
		config: {
			id: 'worn_count',
			type: 'card',
			label: 'Things worn',
			position: { col: 7, row: 7, width: 3, height: 1 },
			// count() rather than sum(), because a toggle cell is true to a
			// formula where the totals row maps it to 1.
			derived: 'count(inventory, Worn)',
			signed: false,
			hideValue: true,
			hideNote: true,
		} as ComponentConfig,
		body: null,
	},
	/*
	 * A container holding containers, which is as deep as a layout may go: the
	 * six-up "card beside its skills" arrangement in miniature, an outer Group
	 * of Groups each holding a Card and a Table.
	 *
	 * Two things to watch. The inner groups sit on the outer group's own grid,
	 * so a card inside lines up column for column with a card outside it at the
	 * same declared width. And "Weapons" keeps its heading where "Tools" hides
	 * one, side by side at the same width, which is the comparison `hideLabel`
	 * is worth looking at.
	 */
	{
		config: {
			id: 'proficiencies',
			type: 'group',
			label: 'Proficiencies',
			position: { col: 1, row: 8, width: 8, height: 4 },
			children: [
				{
					id: 'weapons',
					type: 'group',
					label: 'Weapons',
					position: { col: 1, row: 1, width: 4, height: 3 },
					children: [
						/*
						 * Two cards side by side on the group's own grid, which
						 * is what makes the container query visible: the group is
						 * four columns wide, so inside a 1400px pane it is about
						 * 450px and these stack — while the sheet around it stays
						 * a grid. One threshold rather than two is the decision
						 * being looked at here, so look at whether stacking two
						 * cards this wide is the right answer.
						 */
						{
							id: 'weapon_bonus',
							type: 'card',
							label: 'Attack bonus',
							position: { col: 1, row: 1, width: 2, height: 1 },
							// Reads a card two containers away, which is the
							// point: containment adds no segment, so this is the
							// expression it would be at the top level.
							derived: '2 + abilities.STR',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'weapon_damage',
							type: 'card',
							label: 'Damage bonus',
							position: { col: 3, row: 1, width: 2, height: 1 },
							derived: 'abilities.STR',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'weapon_training',
							type: 'table',
							label: 'Weapon training',
							position: { col: 1, row: 2, width: 4, height: 2 },
							rowHeader: 'Weapon',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Trained:T'],
								},
							],
							rows: [{ label: 'Simple' }, { label: 'Martial' }],
						},
					],
				},
				{
					id: 'tools',
					type: 'group',
					label: 'Tools',
					position: { col: 5, row: 1, width: 4, height: 3 },
					// Pure arrangement: the cards inside say what they are. The
					// cost is on screen and is a known gap (docs/UI.md §12): with
					// no heading to occupy it, this group's first card sits a
					// heading's height above its labelled sibling's.
					hideLabel: true,
					children: [
						{
							id: 'tool_bonus',
							type: 'card',
							label: 'Tool bonus',
							position: { col: 1, row: 1, width: 4, height: 1 },
							derived: '2 + abilities.INT',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'tool_training',
							type: 'table',
							label: 'Tool training',
							position: { col: 1, row: 2, width: 4, height: 2 },
							rowHeader: 'Tool',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Trained:T'],
								},
							],
							rows: [{ label: "Thieves' tools" }, { label: 'Herbalism kit' }],
						},
					],
				},
			],
		} as unknown as ComponentConfig,
		body: null,
		children: {
			weapon_training: [
				'| Weapon | Training |',
				'| --- | --- |',
				'| Simple | 1 |',
				'| Martial | 0 |',
			].join('\n'),
			tool_training: [
				'| Tool | Training |',
				'| --- | --- |',
				"| Thieves' tools | 1 |",
				'| Herbalism kit | 0 |',
			].join('\n'),
		},
	},
	/*
	 * A one-card group beside a much taller one, which is the placement that
	 * ended the collapse (SPEC §13): the grid rows here are sized by
	 * "Proficiencies" spanning four of them, so this cell is far taller than the
	 * card in it and the slack below is unreclaimable. Worth keeping on screen
	 * for exactly that reason — a control that promised to close that gap and
	 * could not is the thing not to re-add.
	 */
	{
		config: {
			id: 'background',
			type: 'group',
			label: 'Background',
			position: { col: 9, row: 8, width: 4, height: 2 },
			children: [
				{
					id: 'origin',
					type: 'card',
					label: 'Origin',
					position: { col: 1, row: 1, width: 4, height: 1 },
					key: 'origin',
					notePlaceholder: 'where from',
				},
			],
		} as unknown as ComponentConfig,
		body: null,
		children: {
			origin: '```sheet\norigin: Neverwinter\nnote: guild artisan\n```',
		},
	},
	/*
	 * The composite pattern `docs/SPEC.md` §4.3 now names: a Record set of
	 * spells beside a Track row set publishing how many slots of each level
	 * remain, and a card elsewhere on the same sheet reading one of those
	 * counts by name through `.left` (SPEC §5, §13). Self-contained on
	 * purpose — the `spells` record set further down is a bare demonstration
	 * of the Spellbook palette entry with nothing beside it, and this group is
	 * the arrangement, so neither borrows the other's rows.
	 *
	 * `slots` and its rows are the exact fixture `track.test.ts` already
	 * verifies `.left` against (`L1` with its own `count: 5`, `L2` with
	 * `count: 3`, `L3` falling back to the component's `count: 1`), kept
	 * identical here rather than invented afresh: the same numbers this
	 * composite shows are the ones already proven against `scope('slots.L1.left')`
	 * and its siblings.
	 */
	{
		config: {
			id: 'spellbook',
			type: 'group',
			label: 'Spellbook',
			position: { col: 9, row: 10, width: 4, height: 4 },
			children: [
				{
					id: 'known_spells',
					type: 'record-set',
					label: 'Known spells',
					position: { col: 1, row: 1, width: 2, height: 4 },
					recordName: 'Spell',
					fields: [
						{ key: 'Level', type: 'number' },
						{ key: 'Prepared', type: 'toggle' },
					],
				},
				{
					id: 'slots',
					type: 'track',
					label: 'Spell slots',
					position: { col: 3, row: 1, width: 2, height: 3 },
					rows: [
						{ key: 'L1', name: '1st', count: 5 },
						{ key: 'L2', name: '2nd', count: 3 },
						{ key: 'L3', name: '3rd' },
					],
					count: 1,
				},
				{
					id: 'l1_slots_left',
					type: 'card',
					label: 'Slots left',
					position: { col: 3, row: 4, width: 2, height: 1 },
					// The consumer §13 deferred: an ordinary card reading a name
					// `.left` publishes, exactly as `passive_perception` above reads
					// `skills.perception` — nothing about this card knows it is
					// reading a Track's row rather than any other published name.
					derived: 'slots.L1.left',
					signed: false,
					hideValue: true,
					hideNote: true,
				},
			],
		} as unknown as ComponentConfig,
		body: null,
		children: {
			known_spells: [
				'',
				'### Magic Missile',
				'```sheet',
				'Level: 1',
				'Prepared: yes',
				'```',
				'Three glowing darts of magical force strike unerringly.',
				'',
				'### Fireball',
				'```sheet',
				'Level: 3',
				'Prepared: no',
				'```',
				'A bright streak flashes to a point you choose, then blossoms with a low roar into an explosion of flame.',
				'',
			].join('\n'),
			slots: '```sheet\nL1: 2\nL2: 1\nL3: 0\n```',
			l1_slots_left: null,
		},
	},
	{
		config: {
			id: 'attack_count',
			// Labels key note sections, so this cannot be "Attacks": the table
			// beside it already is.
			type: 'card',
			label: 'Attacks known',
			position: { col: 10, row: 7, width: 3, height: 1 },
			// Over the card that declares no rows at all: every row is the
			// character's, and the count is what the layout cannot know.
			derived: 'count(attacks)',
			signed: false,
			hideValue: true,
			hideNote: true,
		} as ComponentConfig,
		body: null,
	},
	/*
	 * A tab set, which is the component containment exists for. Three things to
	 * watch and only one of them is about the tabs.
	 *
	 * **Switch tabs and watch the two components below.** Nothing outside the set
	 * may move: every panel stays laid out in one grid cell, so the set is the box
	 * its placement declared whichever tab is showing. That is the promise Group's
	 * withdrawn collapse could not make, and the only way to check it is to press
	 * a tab and look at something else.
	 *
	 * **The tabs are three different shapes.** A Group of two cards over a table,
	 * a bare table, and a Group holding a pool — so a tab that is a container and
	 * a tab that is one card sit in the same strip. A card inside the first tab
	 * should be the size of the identical card outside the set, because a container
	 * tab opens its grid at the *tab set's* placement rather than its own.
	 *
	 * **The pool on the third tab resets on a long rest from a tab nobody opened.**
	 * Hiding is never a way to make a formula not run.
	 */
	{
		config: {
			id: 'pages',
			type: 'tab-set',
			label: 'Pages',
			position: { col: 1, row: 12, width: 8, height: 3 },
			children: [
				{
					id: 'tab_combat',
					type: 'group',
					label: 'Combat',
					// No `hideLabel`, on purpose. The strip is drawn from this
					// label, so the grid tells the group its name is already on
					// screen and the group draws no heading. Written by hand here
					// once, which is exactly what hid the fact that the component
					// was not doing it.
					position: { col: 1, row: 1, width: 8, height: 3 },
					children: [
						{
							id: 'tab_attack',
							type: 'card',
							// Not "Attack bonus": the Weapons group already has one,
							// and a label keys a note section so the whole layout
							// shares one namespace. The settings tab refuses a
							// duplicate outright, which is how this was found — the
							// sheet renders from the samples without parsing them,
							// so the collision was invisible there.
							label: 'Strike bonus',
							derived: '2 + abilities.STR',
							signed: true,
							hideValue: true,
							hideNote: true,
							position: { col: 1, row: 1, width: 4, height: 1 },
						},
						{
							id: 'tab_defence',
							type: 'card',
							label: 'Defence',
							derived: '10 + abilities.DEX',
							hideValue: true,
							hideNote: true,
							position: { col: 5, row: 1, width: 4, height: 1 },
						},
					],
				},
				{
					// A tab that is one card rather than a region: requiring a
					// container here would be ceremony on the commonest case.
					id: 'tab_spells',
					type: 'table',
					// The Group further down already carries "Spellbook".
					label: 'Spell list',
					position: { col: 1, row: 1, width: 8, height: 3 },
					rowHeader: 'Spell',
					openRows: true,
					columns: [
						{ key: 'Level', type: 'number' },
						{ key: 'Prepared', type: 'toggle' },
					],
					// A trigger reaching one column of a table, which is the only
					// place in this layout the **Acts on** row is drawn — select
					// this component in the editor pane to see it. It is also the
					// only thing **Long rest** reaches, so the button was inert
					// before it: press it on the sheet and every tick in Prepared
					// clears while every number in Level stays exactly as it was.
					reset: [{ trigger: 'Long rest', column: 'Prepared', action: 'empty' }],
				},
				{
					id: 'tab_rest',
					type: 'group',
					label: 'Rest',
					position: { col: 1, row: 1, width: 8, height: 3 },
					children: [
						{
							id: 'tab_ki',
							type: 'pool',
							label: 'Ki',
							max: 'abilities.WIS + 2',
							reset: [{ trigger: 'Short rest', action: 'full' }],
							position: { col: 1, row: 1, width: 8, height: 1 },
						},
					],
				},
			],
		} as unknown as ComponentConfig,
		body: null,
		children: {
			tab_spells: [
				'| Spell | Level | Prepared |',
				'| --- | --- | --- |',
				'| Cure wounds | 1 | true |',
				'| Fireball | 3 | false |',
			].join('\n'),
			tab_ki: '```sheet\ncurrent: 2\n```',
		},
	},
	/*
	 * The flag row: a track of one segment is a checkbox, which is where Toggle
	 * went (SPEC §13). Three cards, and each is a different claim to look at.
	 *
	 * **"Inspiration" is the plain case.** Its ring has to be the same object as
	 * a level ring in the Skills table above, at the same size — one painter,
	 * because a flag on a card must not measure differently from the same flag
	 * in a cell (`docs/UI.md` §9). Compare the two directly.
	 *
	 * **"Afflictions" is a checklist**, which is what rows gain from the fold.
	 * The rings line up into a column beside their names, and the rows are
	 * spaced further apart than a set of runs would be — the ring's hit target
	 * reaches past its own box, so press the top edge of the second ring and
	 * check which one changes. It was labelled "Conditions" until the Table entry
	 * of that name arrived: two components sharing a label would be two
	 * `## Conditions` sections in one note, and the entry is the one the word
	 * belongs to.
	 *
	 * **"Bloodied" is a named flag whose ring carries a mark**, and it is `harm`
	 * where the other two are progress. They are *expected* to look identical:
	 * `sense` grades a run from its first segment to its last, and a run of one
	 * is its own last, so there is nothing to grade. Confirm that rather than
	 * discovering it.
	 */
	{
		config: {
			id: 'inspiration',
			type: 'track',
			label: 'Inspiration',
			position: { col: 1, row: 15, width: 3, height: 1 },
			count: 1,
		} as ComponentConfig,
		body: '```sheet\nvalue: yes\n```',
	},
	{
		config: {
			id: 'afflictions',
			type: 'track',
			label: 'Afflictions',
			position: { col: 4, row: 15, width: 4, height: 1 },
			count: 1,
			rows: [
				{ key: 'prone', name: 'Prone' },
				{ key: 'grappled', name: 'Grappled' },
				{ key: 'frightened', name: 'Frightened' },
			],
		} as ComponentConfig,
		body: '```sheet\nprone: no\ngrappled: yes\nfrightened: no\n```',
	},
	{
		config: {
			id: 'bloodied',
			type: 'track',
			label: 'Bloodied',
			position: { col: 8, row: 15, width: 2, height: 1 },
			levels: ['Fine', 'Bloodied:!'],
			sense: 'harm',
		} as ComponentConfig,
		body: '```sheet\nvalue: yes\n```',
	},
	{
		config: {
			id: 'inspired_bonus',
			type: 'card',
			label: 'Inspired bonus',
			position: { col: 10, row: 15, width: 3, height: 1 },
			// A flag publishes a boolean, which is what Toggle promised and what
			// makes `if()` the expression an author reaches for. 1 and 0 would
			// have made this an error.
			derived: 'if(inspiration, 1, 0)',
			signed: true,
			hideValue: true,
			hideNote: true,
		} as ComponentConfig,
		body: null,
	},
	/* Two of the three palette prefills whose *rendering* nothing else here
	   reaches, which is the whole reason they are in the sample rather than only
	   in the vault. The third is Conditions, further down beside the modifier
	   tables, because what it has to be read against is a glyph rather than a
	   card. Inventory is the one entry with no sample of its own: the `inventory`
	   card above is already that entry's config with three extras on top, so a
	   fourth open table would be a longer sheet showing nothing new. */
	{
		config: {
			id: 'currency',
			type: 'card-set',
			label: 'Currency',
			position: { col: 1, row: 16, width: 5, height: 1 },
			// What the Currency entry writes. The card with **no** `derived` is
			// the path this covers: Abilities above carries one, so until this
			// existed nothing in the harness drew a card that is a name and
			// a number with no modifier line under it — which is every card this
			// entry produces.
			entries: [
				{ key: 'CP', name: 'Copper' },
				{ key: 'SP', name: 'Silver' },
				{ key: 'EP', name: 'Electrum' },
				{ key: 'GP', name: 'Gold' },
				{ key: 'PP', name: 'Platinum' },
			],
		} as ComponentConfig,
		// EP left out on purpose: a denomination the note has never held renders
		// beside four that have.
		body: '```sheet\nCP: 42\nSP: 18\nGP: 7\nPP: 1\n```',
	},
	{
		config: {
			id: 'features',
			type: 'table',
			label: 'Features',
			// Its own row at full width: at seven columns the Notes cells clipped
			// on three rows of four, and a sample that is mostly ellipses does not
			// show the treatment it exists to show.
			position: { col: 1, row: 17, width: 12, height: 2 },
			rowHeader: 'Feature',
			openRows: true,
			// `secondary` had no harness coverage at all before this: it is
			// implemented, it is styled at §5's quieter treatment, and nothing
			// drew it. The Features entry turns it on, so shipping that entry
			// without a sample would be shipping an appearance nobody looked at.
			columns: [
				{ key: 'Source', secondary: true },
				{ key: 'Notes' },
			],
		} as ComponentConfig,
		body: [
			'| Feature | Source | Notes |',
			'| --- | --- | --- |',
			'| Darkvision | Elf | 60 ft. |',
			'| Fey Ancestry | Elf | advantage against being charmed |',
			'| [[Second Wind]] | Fighter | once per short rest |',
			'| Lucky | Feat | three rerolls a day |',
		].join('\n'),
	},
	/*
	 * A card whose value is chosen from a list, which is what folded Field out
	 * of the catalog (SPEC §13). Four cards, because the four things worth
	 * looking at are four different cards:
	 *
	 * 1. **A choice plus a written line.** Blades in the Dark asks for exactly
	 *    this — "choose a heritage, write a detail about your family life on the
	 *    line above" — and it is the argument for the fold: the component that
	 *    already holds a value and a note line is Card, so the choice went where
	 *    the line already is.
	 * 2. **Numeric values under a derived.** The choice drops into the small pill
	 *    and the arithmetic runs off it. Check that the word stays legible at the
	 *    pill's size, and that the headline is the number.
	 * 3. **A long label in a narrow card.** It has to clip inside the card rather
	 *    than widen it, on the two columns the layout gave it.
	 * 4. **A stored value the layout no longer offers.** The last line of the
	 *    menu, selected, showing what the note actually holds. It must read as
	 *    data rather than as a warning: no status colour, no "?", and the note is
	 *    not rewritten to fix it (Constraint 4).
	 */
	{
		config: {
			id: 'heritage',
			type: 'card',
			label: 'Heritage',
			position: { col: 1, row: 19, width: 3, height: 1 },
			options: [
				{ value: 'Akoros' },
				{ value: 'The Dagger Isles' },
				{ value: 'Iruvia' },
				{ value: 'Severos' },
				{ value: 'Tycheros' },
			],
			notePlaceholder: 'a detail',
		} as ComponentConfig,
		body: '```sheet\nvalue: Iruvia\nnote: ore miners, now war refugees\n```',
	},
	{
		config: {
			id: 'stealth',
			type: 'card',
			label: 'Stealth',
			position: { col: 4, row: 19, width: 3, height: 1 },
			// The arithmetic is in the value and the word is in the label, which
			// is the whole of what the split buys: a formula cannot read
			// "Expertise", so the layout writes the number it is worth.
			options: [
				{ value: '0', label: 'Untrained' },
				{ value: '1', label: 'Proficient' },
				{ value: '2', label: 'Expertise' },
			],
			derived: 'abilities.DEX + value * 2',
		} as ComponentConfig,
		body: '```sheet\nvalue: 2\n```',
	},
	{
		config: {
			id: 'vice',
			type: 'card',
			label: 'Vice',
			position: { col: 7, row: 19, width: 2, height: 1 },
			options: [
				{ value: 'luxury', label: 'Luxury — silk, fine wine and better company' },
				{ value: 'obligation', label: 'Obligation — family in Charterhall' },
				{ value: 'weird', label: 'Weird — esoteric interests and experiments' },
			],
			hideNote: true,
		} as ComponentConfig,
		body: '```sheet\nvalue: weird\n```',
	},
	{
		config: {
			id: 'alignment',
			type: 'card',
			label: 'Alignment',
			position: { col: 9, row: 19, width: 4, height: 1 },
			options: [
				{ value: 'Lawful good' },
				{ value: 'Neutral good' },
				{ value: 'Chaotic good' },
			],
			hideNote: true,
		} as ComponentConfig,
		// A value the list above does not offer, which is what a note holds
		// after its author edited the layout.
		body: '```sheet\nvalue: Chaotic neutral\n```',
	},
	/*
	 * Rich text, four ways, and the thing to look at is the **box** rather than
	 * the prose in it.
	 *
	 * The prior art is why: on the closest analogue a prose block with no vertical
	 * size has been open since 2022 — "it grows according to its content which does
	 * not allow to control its position in the sheet in a stable way" — beside
	 * three siblings for the same box rendering at zero height, squished, or
	 * absent. So the four here are chosen to make the box's independence from its
	 * text visible side by side:
	 *
	 * 1. **Backstory**, 8×3, holding far more than fits. It has to scroll inside
	 *    its own box, and the two one-row blocks under it must sit exactly where
	 *    the grid put them however far the backstory is scrolled.
	 * 2. **Appearance**, 4×3, holding two short lines. Identical box, a third of
	 *    the content: the two must be the same height, and the short one must not
	 *    have shrunk to its text.
	 * 3. **A creed**, 6×1, unlabelled — prose that reads as prose, and the
	 *    thinnest box the grid can give. Check it is one row of a card tall and
	 *    that the label's absence has not left the box floating.
	 * 4. **Session notes**, 6×1, labelled and empty. The placeholder is the whole
	 *    empty state: one click from typing, and no error anywhere.
	 *
	 * **The harness passes no `renderMarkdown`**, deliberately, so what is drawn
	 * is the fallback: paragraphs with their wikilinks live and no other markdown.
	 * A second markdown implementation in the stub would drift from Obsidian's,
	 * and this repository's whole point is not to have one. The cost is bounded
	 * and stated — how a *rendered* heading, list or embed sits inside the box is
	 * the one part of this component reviewed in Obsidian rather than here — and
	 * the list in the backstory below is on purpose: its hyphens show, which is
	 * exactly what the fallback promises and the app will not.
	 */
	{
		config: {
			id: 'backstory',
			type: 'rich-text',
			label: 'Backstory',
			position: { col: 1, row: 20, width: 8, height: 3 },
		},
		body: [
			'',
			'Born in [[Neverwinter]] to a family of ore miners, and apprenticed young to [[Sildar Hallwinter|Sildar]], who taught the sword and very little else.',
			'',
			// The one target the harness refuses to resolve, in prose rather than in
			// a cell: an unresolved link mid-paragraph is a state worth looking at
			// on its own, since what has to read as faint here sits between two
			// words rather than alone in a column.
			//
			// **Second paragraph because a review found it was in the twelfth**, and
			// this body is deliberately longer than its box — so the one sample
			// written to show an unresolved link was scrolled out of every shot the
			// harness takes, and every link a reviewer could actually see resolved.
			// It sits between the two paragraphs with the most resolved links in
			// them, which is the comparison it exists for. Moved rather than
			// shortened: the body has to stay longer than the box, because the
			// scroll is another criterion judged from this same sample.
			'There is also the matter of the [[Torch of Revealing]], which nobody has written up and which two people have now died over. That is a problem for a later road.',
			'',
			'The debt to the [[Zhentarim]] is not settled and will not be settled by talking. Three of them know the face; one of them knows the name, and none of them has been seen south of the coast road in a year.',
			'',
			'- Owes a debt to the [[Zhentarim]]',
			'- Cannot swim, and will not say why',
			'- Carries a letter from [[Sildar Hallwinter|Sildar]], unopened',
			'',
			'Left the city the winter the docks burned, walked south along the coast road for eleven days, and has not written home since. Whatever is in the letter has kept until now and can keep a while longer.',
			'',
			'Wintered at [[Phandalin]] doing work nobody writes down, and came out of it with a name that is not the one on the letter. There is a woman there who would say where the money went, if she were asked in the right room and not the wrong one.',
			'',
			'What is left is the road, the debt, and the sword. In that order on a good day, and in the reverse order on most of them.',
			'',
			'The plan, such as it is: south to the coast, sell the sword if it comes to that, and be somewhere the [[Zhentarim]] have no reason to look before the thaw.',
			'',
		].join('\n'),
	},
	{
		config: {
			id: 'appearance',
			type: 'rich-text',
			label: 'Appearance',
			position: { col: 9, row: 20, width: 4, height: 3 },
		},
		// Two short lines beside a box of the same size holding fifteen: the pair
		// is the comparison, so this one is deliberately not filled.
		body: '\nTall, and stooped from it. A miner\u2019s hands.\n\nGrey at the temples, earlier than it should be.\n',
	},
	{
		config: {
			id: 'creed',
			type: 'rich-text',
			label: 'Creed',
			position: { col: 1, row: 23, width: 6, height: 1 },
			hideLabel: true,
		} as ComponentConfig,
		body: '\nHold the line. Pay the debt. Do not open the letter.\n',
	},
	{
		config: {
			id: 'session_notes',
			type: 'rich-text',
			label: 'Session notes',
			position: { col: 7, row: 23, width: 6, height: 1 },
		},
		// Empty in the *populated* view, which no other component here is: an
		// author's notes block is empty at the start of every session, so its
		// placeholder is a resting state rather than a state the empty view
		// reaches for.
		body: null,
	},
	{
		config: {
			id: 'below_the_prose',
			type: 'card',
			label: 'Below the prose',
			position: { col: 1, row: 24, width: 3, height: 1 },
			hideNote: true,
		} as ComponentConfig,
		// A known neighbour under the blocks, so "the content scrolls and nothing
		// on the sheet moves" is something a shot can actually show rather than a
		// claim about the CSS.
		body: '```sheet\nvalue: still here\n```',
	},
	/*
	 * Image, seven placements over four files, and most of them are about a
	 * *failure* — because every image failure in the prior art is silent. An empty
	 * div with the diagnosis in the console; a broken-image icon; a value reverting
	 * with "console is not outputing any warning nor error". So what these rows are
	 * for is checking that each of those states says something on the sheet:
	 *
	 * 1. **Portrait**, 2×3, a tall picture in a box of about its own shape. The
	 *    ordinary case, and the one that says whether the frame reads as a portrait
	 *    rather than as a card with a picture in it.
	 * 2. **The two sizing pairs**, which are what `object-fit: contain` is
	 *    reviewable through, since a still cannot resize anything. **Crest**, 4×3, a
	 *    wide picture in a wide box, against **Symbol**, 2×3, the *same file* in a
	 *    tall one. And **Portrait** above against **Portrait in a wide box**, 4×3,
	 *    the same tall file in a box wider than its ratio at every width these shots
	 *    are taken at. Both must be whole, centred and undistorted, with the slack
	 *    left as the frame's own surface. A disc in the sample is what makes a
	 *    stretch visible — it becomes an ellipse — and nothing else in the shape
	 *    would say so.
	 *
	 *    **The second pair was missing and a review found it**: the wide file was in
	 *    both shapes of box and the tall file was only ever in a tall one, so half of
	 *    "a tall picture in a wide box and a wide picture in a tall box" rested on
	 *    the difference between a 0.71 file and a 1.04 box — and vanished altogether
	 *    at `text=24`, where the taller rows make a 2×3 frame *taller* than it is
	 *    wide and Sildar all but fills it. The new frame is 4 columns by 3 rows for
	 *    that reason: it stays wider than 0.71 at 1400, at 1900, at `text=24`, and in
	 *    the one-column reflow at 380, where a full-width block is still about half
	 *    again as wide as three rows are tall.
	 * 3. **A 48px sigil**, 2×3, the small-file case: it has to scale *up* to its
	 *    placement, because the grid is the sizing control and a file's pixel count
	 *    is not (SPEC §8).
	 * 4. **Missing portrait**, 2×3, naming a file the vault does not hold. It must
	 *    name the file it cannot find, in the frame, under its own label. This is
	 *    the state the closest analogue rendered as `<div class="statblock-inline-
	 *    item group-container"></div>` with the explanation in the console.
	 * 5. **Not a picture**, 2×3, naming a file that resolves and that the browser
	 *    cannot draw. It must say so *after* trying, because the plugin holds no
	 *    list of formats — which is the one shape of the webp report that cannot be
	 *    written here.
	 *
	 * The empty state is the `Empty` view's, as everything else here is, and the two
	 * refusals over a body this component cannot use are `brokenSamples`'.
	 */
	{
		config: {
			id: 'portrait',
			type: 'image',
			label: 'Portrait',
			position: { col: 1, row: 25, width: 2, height: 3 },
		},
		body: '\n![[Sildar Hallwinter.png]]\n',
	},
	{
		config: {
			id: 'crest',
			type: 'image',
			label: 'Crest',
			position: { col: 3, row: 25, width: 4, height: 3 },
		},
		// A size hint the sheet ignores and the file keeps, which is SPEC §8's rule
		// on a value out of the character's note: markdown view goes on honouring
		// it and the placement decides the box here. If the crest is 200px wide on
		// screen, that rule has broken.
		body: '\n![[Crest.png|200x120]]\n',
	},
	{
		config: {
			id: 'symbol',
			type: 'image',
			label: 'Symbol',
			hideLabel: true,
			position: { col: 7, row: 25, width: 2, height: 3 },
		} as ComponentConfig,
		// The *same file* as the crest, in a box of the opposite shape. The two
		// together are the only way `object-fit: contain` is reviewable in a still.
		body: '\n![[Crest.png]]\n',
	},
	{
		config: {
			id: 'sigil',
			type: 'image',
			label: 'A 48px sigil',
			position: { col: 9, row: 25, width: 2, height: 3 },
		},
		// The small-file case, which nothing showed while the samples were sizeless
		// SVGs stretching to fill: it has to scale *up* to its placement, because
		// the grid is the sizing control and a file's pixel count is not (SPEC §8).
		body: '\n![[Tiny sigil.png]]\n',
	},
	{
		config: {
			id: 'missing_portrait',
			type: 'image',
			label: 'Missing portrait',
			position: { col: 1, row: 28, width: 2, height: 3 },
		},
		body: '\n![[Portrait of Sera.png]]\n',
	},
	{
		config: {
			id: 'not_a_picture',
			type: 'image',
			label: 'Not a picture',
			position: { col: 3, row: 28, width: 2, height: 3 },
		},
		body: '\n![[Notes.md]]\n',
	},
	{
		config: {
			id: 'wide_portrait',
			type: 'image',
			label: 'Portrait in a wide box',
			position: { col: 5, row: 28, width: 4, height: 3 },
		},
		// The *same file* as the portrait above, in a box wider than the file is:
		// 300×420 at a ratio of 0.71, in a frame that measures about 450×209 at
		// 1400px. It has to pillarbox — whole, centred, its disc a circle, with the
		// slack left and right as the frame's own surface — and it is the only
		// placement here that can show the tall-file-in-a-wide-box half of
		// `object-fit: contain`.
		//
		// On this row rather than beside the portrait because the row above is full
		// at ten of twelve columns, and this row's two frames are three rows tall
		// already, so nothing on the sheet moves to make room for it.
		body: '\n![[Sildar Hallwinter.png]]\n',
	},
	/*
	 * The **Conditions** palette entry, rendered (SPEC §4.2), and the third of the
	 * three prefills here for that reason — the other two are Currency and
	 * Features, below the flag row: the *rendering* of an entry is a thing a
	 * reviewer has to be able to look at, and this one nothing else on the sheet
	 * reaches.
	 *
	 * **Its config is the entry's own**, spread rather than retyped, so a key
	 * renamed on the entry renames it here. The *body* below cannot be: a note is
	 * markdown text and has to spell its own column headings, so that half is a
	 * copy and would need editing by hand — which is the ordinary state of every
	 * body in this file rather than something this sample introduces.
	 *
	 * What only this component shows is a modifier conditioned on a flag in its
	 * **own row**, both ways at once. The two effects are spelled identically, so
	 * the only difference between the rows is the `Active` cell: the first draws
	 * `zap` and the second `zap-off`, one above the other, which is the whole of
	 * why the entry pairs a toggle with a modifier column. Compare them with the
	 * `Cloak of Elvenkind` row in Magic items below, whose condition reads a flag
	 * in the same way — the mechanism is one mechanism, and this is what it looks
	 * like when the flag is what the list is *about*.
	 *
	 * **Typed on the row rather than named, and untyped rather than typed.** A
	 * named definition would have to be declared in `stub-app.ts`, whose ten
	 * definitions are each one state worth looking at; and every bonus type at
	 * `armour_class` there is already carrying a suppression the comments below
	 * describe. An untyped bonus contests with nothing, so this adds a line to the
	 * armour class breakdown and changes not one of them.
	 *
	 * Both are +2 to armour class in the system the rest of this sheet is written
	 * in, so the pair is a real one rather than two rows made equal to make a
	 * point; and neither name is one Magic items below already uses, so a
	 * breakdown line naming the component is naming two different rows.
	 *
	 * The third row is the ordinary case — a condition with nothing hanging off it
	 * — and it holds `x`, a hand-written spelling of yes that the sheet reads as
	 * set and never rewrites.
	 *
	 * **No trigger is bound to `Active`**, deliberately: the entry prefills no
	 * binding, and the author makes one after placing it. The **Acts on** row and
	 * a column reset actually running are already drawn by the Spell list tab
	 * above.
	 */
	{
		config: {
			id: 'conditions',
			type: 'table',
			label: 'Conditions',
			// Beside the pictures and directly above the two modifier tables, so the
			// glyphs can be read against theirs without scrolling. It takes the four
			// columns that row leaves free, so nothing already on the sheet moves.
			position: { col: 9, row: 28, width: 4, height: 3 },
			...entryConfig('table', 'Conditions'),
			// The one sample here with no `as ComponentConfig`, and the absence is
			// the point rather than an oversight: every other config writes keys
			// `ComponentConfig` does not declare — `entries`, `columns`, `derived`
			// — so the cast is what gets them past the excess-property check. This
			// one's arrive through a typed spread, so the literal already *is* a
			// `ComponentConfig` and the cast lints as unnecessary. Putting it back
			// means loosening `entryConfig`'s return type, which is the checking
			// the spread was added for.
		},
		body: [
			'| Condition | Active | Modifiers |',
			'| --- | --- | --- |',
			'| Shield of Faith | yes | armour_class += 2 when Active |',
			'| Haste | no | armour_class += 2 when Active |',
			'| Poisoned | x |  |',
		].join('\n'),
	},
	/*
	 * Modifier definitions (SPEC §5): one row enrolling in as many changes as it
	 * needs, each named in **one** cell that draws as **one** glyph.
	 *
	 * Ten rows, one per state worth looking at, counted against the body below
	 * rather than remembered:
	 *
	 * - **one row whose cell names two modifiers that both apply, to two
	 *   different values** — one glyph, two numbers moving. This is what one
	 *   modifier column per table is *for*;
	 * - **the mixed cell**, `Ring of Protection; armour_class += 2 as item when
	 *   Worn`: a name and an effect typed on the row, both item bonuses at armour
	 *   class, the typed `+2` winning and the named `+1` on the same row suppressed.
	 *   It is the row `&press=` opens the form on, and the row this wave exists for.
	 *   Its own name carries a `+2`, and `Bracers of Defence +1` is a *definition*
	 *   name carrying arithmetic that is deliberately not read as arithmetic;
	 * - **a typed override**, `armour_class = 16`, contesting with two named ones
	 *   and losing, so a push carrying no tier is on the sheet rather than in a
	 *   test;
	 * - **a typed effect naming a bonus type the layout does not declare**,
	 *   `abilities.STR += 1 as luck`: it applies and contests as its own kind, and
	 *   the form says `luck (not declared)`;
	 * - **a typed effect with no amount**, `armour_class +=`, which changes nothing,
	 *   refuses nothing and draws `zap-off` — the sixth `zap-off` reason;
	 * - **and that cell is spelled `A ;B`, by hand**, so the tolerant read is
	 *   visible in the sample rather than only in a test — the Cloak row below
	 *   carries the canonical `'; '` and the two read identically;
	 * - **one row naming two of which one applies**, which is the state the old
	 *   three glyph shapes could not describe: the glyph reads the *row*, so it is
	 *   `zap`, and the popup is where the second line says it changes nothing;
	 * - **an item bonus suppressed by a larger one of its type**, whose glyph is
	 *   `zap-off` and whose popup says which wording is true, and **a status bonus
	 *   at that same target** beside it, so two types adding over one name is on
	 *   the sheet rather than something a reader has to build;
	 * - a **wikilink** in the row name, which is what says a modifier cell reaches
	 *   Constraint 2 not at all: the table is markdown storage, the link is real,
	 *   and the breakdown names the row "as a reader sees it" rather than as the
	 *   file spells it (`rowLabel`);
	 * - an **override**, and a **lower override** beside it, so the breakdown
	 *   carries a "sets to" line, a suppressed one, and a total that reads as a
	 *   value;
	 * - a **conditional row switched off**, its `Worn` cell unticked, which is one
	 *   of the five `zap-off` reasons and the one that leaves no line in the
	 *   breakdown at all — the breakdown is the number's story and the row is the
	 *   item's;
	 * - **one cell naming the same modifier twice**, `Bracers of Defence +1;
	 *   Bracers of Defence +1`: two lines drawn for **one** enrolment, so the
	 *   second carries `Already applied above; removing either takes both` and both
	 *   lines' **Remove** reads `Remove all 2`. It is here because that pair is the
	 *   fix for the owner's only real defect in this feature — a **Remove** that
	 *   took one of the two byte ranges and left the row still applying the
	 *   modifier — and until now no sample spelled a name twice, so neither the
	 *   sentence nor the button had ever been rendered anywhere but a test;
	 * - a modifier aimed at a **table cell** rather than a card, the skills card's
	 *   published Perception row;
	 * - a cell naming a definition **the layout does not declare**, which is what
	 *   a hand-edited note arrives holding and what a renamed definition leaves
	 *   behind: rendered, not corrected;
	 * - and **a blank cell**, which now draws a faint `plus` rather than nothing,
	 *   because it is the entry point for adding a modifier.
	 *
	 * The `Worn` toggle is here rather than as a second modifier column, because
	 * the condition lives on the definition and the flag it reads is an ordinary
	 * cell — which is the whole of what the condition mechanism is.
	 */
	{
		config: {
			id: 'magic_items',
			type: 'table',
			label: 'Magic items',
			position: { col: 1, row: 31, width: 8, height: 2 },
			rowHeader: 'Item',
			openRows: true,
			columns: [
				// `hideHeading`, which is what a column drawing as one glyph is for:
				// the glyph names itself, and a word above it several times its width
				// sets the column's width against a control that needs none of it.
				// The key is plural because it is what the cell's accessible name
				// reads — "Modifiers: 2 applying".
				{ key: 'Modifiers', type: 'modifier', hideHeading: true },
				{ key: 'Worn', type: 'toggle' },
				{ key: 'Notes' },
			],
		} as ComponentConfig,
		body: [
			'| Item | Modifiers | Worn | Notes |',
			'| --- | --- | --- | --- |',
			'| Belt of Giant Strength | Belt of Giant Strength ;Bracers of Defence +1 | yes | two values from one glyph |',
			'| Gauntlets of Ogre Power | Gauntlets of Ogre Power | yes | the smaller item bonus |',
			"| Bull's Strength | Bull's Strength |  | a different type, so it adds |",
			'| [[Ring of Protection]] | Ring of Protection | yes |  |',
			'| Bracers of Warding +2 | Ring of Protection; armour_class += 2 as item when Worn | yes | a name and a typed effect in one cell |',
			'| Plate armour | Plate armour | yes | sets it, and the bonuses land on top |',
			'| Barkskin | armour_class = 16 | yes | a typed override, losing to a named one |',
			'| Mage armour | Mage armour |  | the lowest override |',
			'| Cloak of Elvenkind | Cloak of Elvenkind; Cloak of Displacement | yes | two named, one applying |',
			'| Warded bracers | Bracers of Defence +1; Bracers of Defence +1 | yes | one name, twice: two lines, one enrolment |',
			'| Lucky charm | abilities.STR += 1 as luck | yes | a bonus type the layout does not declare |',
			'| Unfinished ward | armour_class += | yes | typed, with no amount yet |',
			'| Eyes of the Eagle | Eyes of the Eagle |  | a table cell, not a card |',
			'| Ring of Nonexistence | Ring of Nonexistence |  | no such modifier |',
			'| Chalk |  |  | nothing on this row yet |',
		].join('\n'),
	},
	/*
	 * A *second* modifier table, and it is here for one reason: a breakdown
	 * drawing on two components is the only state in which a contributor line
	 * carries the component's label, so without this the qualified form could not
	 * be looked at.
	 *
	 * Its row enrols in the same definition as one in Magic items, on purpose.
	 * That is the failure the row label alone cannot carry — two lines a reader
	 * cannot tell apart — so the armour class breakdown reads
	 * `Worn items · Ring of Protection` beside `Magic items · Ring of Protection`,
	 * while the STR card one table over reads `Belt of Giant Strength` with no
	 * prefix at all. Both forms on one sheet is the comparison the rule is worth
	 * judging on. It is also the *tie* that puts the second suppression wording
	 * there, and the one row on the sheet whose glyph says it is applying while
	 * the breakdown attributes the number to the other half of the pair.
	 */
	{
		config: {
			id: 'worn_items',
			type: 'table',
			label: 'Worn items',
			position: { col: 9, row: 31, width: 4, height: 2 },
			rowHeader: 'Worn',
			openRows: true,
			columns: [{ key: 'Modifiers', type: 'modifier', hideHeading: true }],
		} as ComponentConfig,
		body: [
			'| Worn | Modifiers |',
			'| --- | --- |',
			'| Ring of Protection | Ring of Protection |',
		].join('\n'),
	},
	/*
	 * Two record sets, directly under the two modifier tables — which is the
	 * pairing the model question is worth judging by looking at. A Table and a
	 * Record set holding the same kind of list have to be visibly different
	 * things at a glance, or the catalog has grown an entry nobody can choose.
	 *
	 * **Traits is the wide one and it is deliberately over-full**: six records
	 * in a three-row placement, so the box has to hold its height and the list
	 * has to scroll inside it. That is the load-bearing claim the disclosure
	 * rests on — SPEC §8 forbids a component ceasing to fill its placement, and
	 * `docs/UI.md` §9 forbids a box sized by its content — and neither is
	 * reachable here however much is open.
	 *
	 * Its records cover what a reviewer has to be able to see side by side: a
	 * body far longer than the box, a record with none at all, a name that is a
	 * resolved wikilink and one that is not, a uses counter at its ceiling and
	 * one below it, a typed modifier that applies and one that does not, and an
	 * empty modifier field. The typed effects reach the armour class card above,
	 * so the ` when ` clause is a number moving rather than a claim.
	 *
	 * **And every state a reader-set ceiling has**, since `Uses` is this
	 * component's `maxSource: 'record'` subject: a ceiling above the value, one
	 * the value has passed, one written with no spaces around the slash, one at
	 * its ceiling, and a record with none at all showing the `—` placeholder.
	 */
	{
		config: {
			// Not "Features": the Table above already carries that id and that
			// label, and a label keys a note section. Keeping both on one sheet is
			// the point — a Table of features beside a Record set of traits is the
			// model question's own claim, put where a reviewer can look at it.
			id: 'traits',
			type: 'record-set',
			label: 'Traits',
			position: { col: 1, row: 33, width: 7, height: 3 },
			recordName: 'Feature',
			/*
			 * **All five offered field types on one subject**, because a design
			 * review found `level` and `computed` drawn on no shot at all: the axis
			 * had to rule on the ring's touch route from the `toggle`'s behaviour,
			 * and the `level` field is the one that instantiates a `<select>` beside
			 * the ring — the arrangement `docs/UI.md` §9 records Table being
			 * corrected away from — so it is the field most worth photographing.
			 * `Rank` is a *named* level with a mark of its own, which is the branch
			 * that earns a tooltip carrying the level's word; `Left` is computed from
			 * the record's own scope.
			 */
			fields: [
				/*
				 * **The ceiling is each record's here and the layout's on `spells`
				 * below**, which is the comparison a design review needs and which no
				 * second subject could give as cheaply: a reader-set ceiling and a
				 * declared one on one sheet at one width. It also holds the field
				 * count constant, so `docs/UI.md` §12's field-wrap measurement stays
				 * comparable to the one already recorded.
				 */
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				{ key: 'Attuned', type: 'toggle' },
				{
					key: 'Rank',
					type: 'level',
					levels: ['Untrained', 'Trained:', 'Expert:★'],
				},
				{ key: 'Left', type: 'computed', formula: '3 - Uses' },
				// `hideHeading` and `secondary` are the two settings the shared
				// columns field offers and this component ignores; neither is set
				// here, because a record's fields draw their own names.
				{ key: 'Modifiers', type: 'modifier' },
			],
		} as ComponentConfig,
		body: [
			'',
			'Anything above the first record is a preamble, and it is kept untouched.',
			'',
			'### Second Wind',
			'```sheet',
			'Uses: 1 / 3',
			'Attuned: no',
			'Rank: 1',
			'```',
			'Once per short rest, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. This one is deliberately the longest body on the sheet, so it is longer than the box that holds it and has to scroll inside the list rather than growing it. A second paragraph follows, because the space between two of them is part of what an open record has to get right.',
			'',
			'Once you use this feature, you must finish a short or long rest before you can use it again.',
			'',
			'### [[Ring of Protection]]',
			'```sheet',
			'Uses: 0 / 1',
			'Attuned: yes',
			'Rank: 2',
			// Untyped on purpose. `as item` would contest with the Magic items
			// table's own item bonuses and lose to the larger of them, which is a
			// true state and the wrong one to sample here: what this record is for
			// is the glyph that says a record *is* changing something.
			'Modifiers: armour_class += 1 when Attuned',
			'```',
			'A resolved wikilink as a name, and a typed effect that is applying: the armour class card above moves by one while Attuned is set.',
			'',
			'### [[Torch of Revealing]]',
			'```sheet',
			// **No ceiling at all**, which is the ordinary state rather than an
			// error: most records on a features list are not counters. It is on the
			// third record on purpose, because the box shows three at a time and
			// the `—` placeholder has to be photographed *beside* two records that
			// have one.
			'Uses: 3',
			'Attuned: no',
			'Rank: 0',
			'Modifiers: armour_class += 2 as item when Attuned',
			'```',
			'A name pointing at a note the vault does not hold, so the link is faint, a modifier whose condition is false, so the glyph reads as changing nothing, and no ceiling of its own, so the slot shows a placeholder waiting to be filled.',
			'',
			'### Action Surge',
			'```sheet',
			// The reader's own spelling of the slash, kept verbatim through every
			// edit to the value beside it.
			'Uses: 1/2',
			'Attuned: no',
			'```',
			'',
			'### Lucky',
			'```sheet',
			// A value above the ceiling it is read against, drawn as it is stored:
			// there is no warning treatment, and `5 / 3` is what says it.
			'Uses: 5 / 3',
			'Attuned: yes',
			'Retired: 4',
			'```',
			'A record carrying an entry under a key the layout no longer declares. It is kept in the note untouched and nothing on the sheet reports it, which is SPEC §10 working.',
			'',
			'### Fey Ancestry',
			'```sheet',
			'Uses: 3 / 3',
			'```',
			'A record with no modifier field filled in, which is the ordinary state on a list like this, and a counter sitting at its own ceiling.',
			'',
		].join('\n'),
	},
	/*
	 * The narrow one, and the palette entry's own shape: a spell's level and
	 * whether it is prepared, with the description under it. Five records in a
	 * three-row box, closed, so a shot holds both dispositions at once — this
	 * list as a reader first meets it, and Features with two of its records open.
	 */
	{
		config: {
			// `spellbook` further up is a different demonstration — the composite
			// pattern, with its own `known_spells` record set beside a slots
			// track — and a label keys a note section, so this one's has to
			// differ from both that record set's label and its own.
			id: 'spells',
			type: 'record-set',
			label: 'Spells',
			position: { col: 8, row: 33, width: 5, height: 3 },
			recordName: 'Spell',
			fields: [
				{ key: 'Level', type: 'number', max: 9 },
				{ key: 'Prepared', type: 'toggle' },
				/*
				 * **A level drawn as a `<select>` rather than a ring**, which is the
				 * one control kind of this component's five that nothing drew — and
				 * the kind worth a picture, because it is a native menu beside a ring
				 * in one line and `docs/UI.md` §9 records Table being corrected away
				 * from a *stacked* select. This one is the alternative rather than the
				 * overlay: the component returns before it builds the ring, so there
				 * is exactly one control and nothing is transparent.
				 */
				{
					key: 'School',
					type: 'level',
					input: 'select',
					levels: ['None', 'Evocation', 'Abjuration'],
				},
			],
		} as ComponentConfig,
		body: [
			'',
			'### Fireball',
			'```sheet',
			'Level: 3',
			'Prepared: yes',
			'School: 1',
			'```',
			'A bright streak flashes to a point you choose, then blossoms with a low roar into an explosion of flame.',
			'',
			'### Shield',
			'```sheet',
			'Level: 1',
			'Prepared: yes',
			'School: 2',
			'```',
			'An invisible barrier of magical force appears and protects you.',
			'',
			'### Mage Armour',
			'```sheet',
			'Level: 1',
			'Prepared: no',
			'```',
			'A protective magical force surrounds a willing creature you touch.',
			'',
			'### Counterspell',
			'```sheet',
			'Level: 3',
			'Prepared: no',
			'```',
			'You attempt to interrupt a creature in the process of casting a spell.',
			'',
			'### Prestidigitation',
			'```sheet',
			'Level: 0',
			'Prepared: yes',
			'```',
			'A minor magical trick that novice spellcasters use for practice.',
			'',
		].join('\n'),
	},
	/*
	 * **The empty state, on the populated view.** Both lists above hold records,
	 * so look criterion 5 — "a label, and one add control, reading as a list
	 * waiting rather than as a broken component" — had nothing to look at here:
	 * `state=empty` empties *every* component, which is a different picture and
	 * not the one that criterion is about. A new character's spell list is empty
	 * beside a filled feature list, which is the pairing worth a shot.
	 */
	{
		config: {
			id: 'rituals',
			type: 'record-set',
			label: 'Rituals',
			position: { col: 1, row: 36, width: 4, height: 1 },
			recordName: 'Ritual',
			fields: [{ key: 'Level', type: 'number', max: 9 }],
		} as ComponentConfig,
		body: null,
	},
	/* Beside the set rather than inside it, so a tab press has something to not
	   move. Row 14 rather than 12: the Spellbook group above grew to hold its
	   composite pattern and now spans rows 10-13 in this column, so this
	   moved to the tab set's last row instead — still outside its col1-8
	   footprint, which is the only thing its position has to be true. */
	{
		config: {
			id: 'tab_witness',
			type: 'card',
			label: 'Ki from a hidden tab',
			derived: 'tab_ki',
			hideValue: true,
			hideNote: true,
			position: { col: 9, row: 14, width: 4, height: 1 },
		} as ComponentConfig,
		body: null,
	},
	/*
	 * The full six-up `docs/SPEC.md` §4.3 names beside the spellbook: an outer
	 * Group of six inner Groups, each an inner Group holding one Card beside one
	 * Table of declared rows — the exact shape "Proficiencies" above already
	 * called itself "in miniature" of, and the worked example §2's own Group
	 * entry gives: "six ability cards each beside their own skills table."
	 *
	 * Six abilities rather than two disciplines, so this is the arrangement at
	 * the count the resolved bullet actually names, and "beside" rather than
	 * "above" is the thing "Proficiencies" did not show — its own children
	 * stack a card over a table, this pairs them left and right. Each inner
	 * group's Card reads its ability's modifier from the `abilities` card set
	 * two containers up — `abilities.STR` is already what that entry shows, so
	 * nothing here stores a second copy of a score, the same move
	 * `l1_slots_left` makes on a bare published name above. Each Table declares
	 * the checks that ability actually governs in 5e, at whatever count is true
	 * rather than padded to match: Strength and Constitution have one each, the
	 * rest two — and none of the six repeats a skill the flat Skills table
	 * above already names, so the two views never disagree about one cell.
	 */
	{
		config: {
			id: 'ability_checks',
			type: 'group',
			label: 'Ability checks',
			position: { col: 1, row: 37, width: 12, height: 6 },
			children: [
				{
					id: 'str_group',
					type: 'group',
					label: 'Strength',
					position: { col: 1, row: 1, width: 6, height: 2 },
					children: [
						{
							id: 'str_modifier',
							type: 'card',
							label: 'Strength modifier',
							position: { col: 1, row: 1, width: 2, height: 2 },
							derived: 'abilities.STR',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'str_checks',
							type: 'table',
							label: 'Strength checks',
							position: { col: 3, row: 1, width: 4, height: 2 },
							rowHeader: 'Check',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Proficient:P'],
								},
							],
							rows: [{ label: 'Athletics' }],
						},
					],
				},
				{
					id: 'dex_group',
					type: 'group',
					label: 'Dexterity',
					position: { col: 7, row: 1, width: 6, height: 2 },
					children: [
						{
							id: 'dex_modifier',
							type: 'card',
							label: 'Dexterity modifier',
							position: { col: 1, row: 1, width: 2, height: 2 },
							derived: 'abilities.DEX',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'dex_checks',
							type: 'table',
							label: 'Dexterity checks',
							position: { col: 3, row: 1, width: 4, height: 2 },
							rowHeader: 'Check',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Proficient:P'],
								},
							],
							rows: [{ label: 'Stealth' }, { label: 'Sleight of Hand' }],
						},
					],
				},
				{
					id: 'con_group',
					type: 'group',
					label: 'Constitution',
					position: { col: 1, row: 3, width: 6, height: 2 },
					children: [
						{
							id: 'con_modifier',
							type: 'card',
							label: 'Constitution modifier',
							position: { col: 1, row: 1, width: 2, height: 2 },
							derived: 'abilities.CON',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'con_checks',
							type: 'table',
							label: 'Constitution checks',
							position: { col: 3, row: 1, width: 4, height: 2 },
							rowHeader: 'Check',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Proficient:P'],
								},
							],
							rows: [{ label: 'Concentration' }],
						},
					],
				},
				{
					id: 'int_group',
					type: 'group',
					label: 'Intelligence',
					position: { col: 7, row: 3, width: 6, height: 2 },
					children: [
						{
							id: 'int_modifier',
							type: 'card',
							label: 'Intelligence modifier',
							position: { col: 1, row: 1, width: 2, height: 2 },
							derived: 'abilities.INT',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'int_checks',
							type: 'table',
							label: 'Intelligence checks',
							position: { col: 3, row: 1, width: 4, height: 2 },
							rowHeader: 'Check',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Proficient:P'],
								},
							],
							rows: [{ label: 'Arcana' }, { label: 'Investigation' }],
						},
					],
				},
				{
					id: 'wis_group',
					type: 'group',
					label: 'Wisdom',
					position: { col: 1, row: 5, width: 6, height: 2 },
					children: [
						{
							id: 'wis_modifier',
							type: 'card',
							label: 'Wisdom modifier',
							position: { col: 1, row: 1, width: 2, height: 2 },
							derived: 'abilities.WIS',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'wis_checks',
							type: 'table',
							label: 'Wisdom checks',
							position: { col: 3, row: 1, width: 4, height: 2 },
							rowHeader: 'Check',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Proficient:P'],
								},
							],
							rows: [{ label: 'Insight' }, { label: 'Survival' }],
						},
					],
				},
				{
					id: 'cha_group',
					type: 'group',
					label: 'Charisma',
					position: { col: 7, row: 5, width: 6, height: 2 },
					children: [
						{
							id: 'cha_modifier',
							type: 'card',
							label: 'Charisma modifier',
							position: { col: 1, row: 1, width: 2, height: 2 },
							derived: 'abilities.CHA',
							signed: true,
							hideValue: true,
							hideNote: true,
						},
						{
							id: 'cha_checks',
							type: 'table',
							label: 'Charisma checks',
							position: { col: 3, row: 1, width: 4, height: 2 },
							rowHeader: 'Check',
							columns: [
								{
									key: 'Training',
									hideHeading: true,
									type: 'level',
									levels: ['Untrained', 'Proficient:P'],
								},
							],
							rows: [{ label: 'Deception' }, { label: 'Intimidation' }],
						},
					],
				},
			],
		} as unknown as ComponentConfig,
		body: null,
		children: {
			str_checks: ['| Check | Training |', '| --- | --- |', '| Athletics | 0 |'].join(
				'\n',
			),
			dex_checks: [
				'| Check | Training |',
				'| --- | --- |',
				'| Stealth | 1 |',
				'| Sleight of Hand | 0 |',
			].join('\n'),
			con_checks: [
				'| Check | Training |',
				'| --- | --- |',
				'| Concentration | 1 |',
			].join('\n'),
			int_checks: [
				'| Check | Training |',
				'| --- | --- |',
				'| Arcana | 0 |',
				'| Investigation | 1 |',
			].join('\n'),
			wis_checks: [
				'| Check | Training |',
				'| --- | --- |',
				'| Insight | 1 |',
				'| Survival | 0 |',
			].join('\n'),
			cha_checks: [
				'| Check | Training |',
				'| --- | --- |',
				'| Deception | 0 |',
				'| Intimidation | 1 |',
			].join('\n'),
		},
	},
];

/** The same layout with nothing stored: every component's empty state. */
export function emptySamples(): Sample[] {
	return SAMPLES.map((sample) => ({ config: sample.config, body: null }));
}

/**
 * The populated sheet with **`effective` declared where a modifier lands**, so
 * the value pill reads what the note's items come to rather than what it stores.
 *
 * A state of its own, and for `unmodifiedSamples`' reason rather than for
 * tidiness: no view rendered a card declaring `effective` at all, so its accent
 * and its focus swap had never been looked at — and `docs/UI.md` §11 is the
 * standing argument against ruling on a surface by reading its stylesheet. It is
 * a state rather than a change to `SAMPLES` because `effective` is *opt-in*
 * (SPEC §4.2), and the populated sheet is the layout that does not opt in: every
 * other shot would otherwise show a Strength pill reading 19, which is a
 * different sheet from the one every look criterion above was settled against.
 *
 * Three cards, one per rule the state exists to show.
 */
export function effectiveSamples(): Sample[] {
	/**
	 * How many samples this transform actually reached.
	 *
	 * **Counted and checked, because the function directly below argues against
	 * exactly what this one does.** `unmodifiedSamples` clears cells *by column
	 * position* rather than by matching names, on the ground that "a transform that
	 * searched for definition names would quietly stop clearing the column the day
	 * a sample gained a modifier this file does not spell." Three hard-coded ids
	 * are that same trap: rename `armour_class` and this state silently becomes the
	 * populated sheet — and the three shots would go on being taken, with their own
	 * comments describing an accented pill that is no longer in the frame. A shot
	 * cannot notice; nothing else looks. So the count is the guard, and it throws
	 * rather than warns because a harness state that is not the state it claims is
	 * worth more than a picture.
	 */
	let reached = 0;
	const transformed = SAMPLES.map((sample) => {
		/*
		 * **The Card set, and it is the canonical case.** `derived` is already
		 * `floor((value + mod.self - 10) / 2)` — the spelling that raises the
		 * *score* — so the pill has an effective stored value to read: STR is 15
		 * with an item +2, a status +1 and an undeclared `luck +1` on it, which is
		 * a 19 reading +4. The five entries nothing pushes at read what they store
		 * and carry no mark, which is the comparison the accent has to survive: one
		 * accented pill among six, not six markers competing with the derived
		 * numbers above them.
		 */
		if (sample.config.id === 'abilities') {
			reached += 1;
			return {
				...sample,
				config: { ...sample.config, effective: 'value + mod.self' } as ComponentConfig,
			};
		}
		/*
		 * **The Card, and its `derived` is respelled because the sample's own is
		 * SPEC §4.2's counter-example.** `10 + abilities.DEX + mod.self` reads no
		 * `value` at all, so there is no effective *stored* number for a pill to
		 * show and a card declaring one would print a confident wrong figure. The
		 * other legitimate arithmetic — a card that stores its armour class and
		 * takes its modifiers on that — is what this state spells instead.
		 *
		 * **Three numbers, deliberately**, and what to read is the *distance*
		 * between them rather than the digits. The card stores one; the pill reads
		 * that stored number plus the value-phase total, so it sits above it by
		 * whatever the sheet's items come to; and the number above the pill sits
		 * higher again, because only the evaluation that *becomes* the published
		 * name takes the override (`Plate armour`'s 18) and the result phase
		 * (SPEC §5). The pill is a second reading of the value, so it takes neither
		 * — which is the rule `displayOnly` exists for and the one thing about it
		 * that cannot be checked by looking at a card whose formula has no override
		 * on it.
		 *
		 * **The digits were here and are gone on purpose.** They read 20 and 22,
		 * measured 21 and 23, and nothing noticed — a definition had arrived and a
		 * comment cannot be told. A number here is a fact about how many items
		 * happen to be on this sheet today, and the state does not exist to show
		 * that; the relationship above is what it exists to show, and it survives
		 * the next contributor. Asserting them instead would be the right answer if
		 * anything under `npm test` read this file at all, and nothing does.
		 */
		if (sample.config.id === 'armour_class') {
			reached += 1;
			return {
				...sample,
				config: {
					...sample.config,
					derived: 'value + mod.self',
					effective: 'value + mod.self',
				} as ComponentConfig,
			};
		}
		/*
		 * **The dropdown, which never takes one.** Its text is a *label* from a
		 * closed list, so a computed reading would be a word the list does not
		 * contain and the control could not round-trip its own choice. Declared
		 * here precisely so the state shows it being ignored: the pill stays the
		 * menu reading `Expertise`, with no accent and no title.
		 */
		if (sample.config.id === 'stealth') {
			reached += 1;
			return {
				...sample,
				config: { ...sample.config, effective: 'value + mod.self' } as ComponentConfig,
			};
		}
		return sample;
	});
	if (reached !== 3) {
		throw new Error(
			`The effective-value state expects three samples — abilities, armour_class and stealth — and matched ${reached}. An id was renamed; fix the names above, or this state is the populated sheet wearing its label.`,
		);
	}
	return transformed;
}

/**
 * The populated sheet with **every modifier cell cleared and every row kept**.
 *
 * A state of its own because it is the one `sheet-empty` cannot reach: that view
 * drops the bodies, so both modifier tables draw `No rows yet.` and the modifier
 * column is never photographed at all. This is a fresh character — rows entered,
 * no modifiers named yet — and it is the state where an empty cell's `plus` is the
 * *only* mark in its column, with no bolt anywhere to read the absence against.
 *
 * That is what the design axis needed to see to rule on the glyph's contrast, and
 * a review cannot rule on a state no shot contains.
 */
export function unmodifiedSamples(): Sample[] {
	return SAMPLES.map((sample) => {
		const columns = (sample.config as { columns?: { type?: string }[] }).columns;
		if (sample.body === null || columns === undefined) return sample;
		const blank = columns
			.map((column, index) => (column.type === 'modifier' ? index + 1 : -1))
			.filter((index) => index >= 0);
		if (blank.length === 0) return sample;
		/*
		 * By the column's position rather than by matching the names, because what
		 * this state means is "this cell holds nothing" — and a transform that
		 * searched for definition names would quietly stop clearing the column the
		 * day a sample gained a modifier this file does not spell. `+ 1` for the row
		 * header, which is a column in the markdown and not in `columns`.
		 */
		const body = sample.body
			.split('\n')
			.map((line, row) => {
				if (!line.startsWith('|') || row === 1) return line;
				// The heading row keeps its text: what this state clears is values.
				if (row === 0) return line;
				const cells = line.split('|');
				for (const index of blank) {
					if (cells[index + 1] !== undefined) cells[index + 1] = ' ';
				}
				return cells.join('|');
			})
			.join('\n');
		return { config: sample.config, body };
	});
}

/**
 * A misconfiguration per component where one is reachable, so the reviewer can
 * see the in-place error state (SPEC §10) rather than only the happy path.
 */
export function brokenSamples(): Sample[] {
	return SAMPLES.map((sample) => {
		const config = { ...sample.config } as ComponentConfig & {
			key?: string;
			derived?: string;
			openRows?: boolean;
			options?: { value: string; label?: string }[];
			rows?: { label: string; key?: string }[];
			columns?: { type?: string; total?: boolean }[];
			fields?: { key: string; type?: string }[];
		};
		// Nothing for a container itself: with the collapse gone a group has one
		// setting left and no combination of settings without a reading, so there
		// is no `configError` for this view to show, and a container nested too
		// deep is refused by `parseLayout` before this view sees a layout at all.
		//
		// **The containment error that *is* reachable is the registry's**, and it
		// has to be staged here or it is never drawn: a leaf handed components to
		// hold. An earlier version of this comment claimed the error view already
		// reached it, which was simply false — `brokenSamples` rewrote keys,
		// columns and rows and nothing else, so the longest error string the
		// containment work added had never been rendered anywhere. It wraps inside
		// a three-column cell, which is the reason to look at it rather than trust
		// it (`docs/UI.md` §11).
		if (config.id === 'worn_count') {
			config.children = [
				{
					id: 'stranded',
					type: 'card',
					label: 'Stranded card',
					position: { col: 1, row: 1, width: 3, height: 1 },
				},
			];
		}
		// A misspelled table, on the one readout that gets it: the aggregate's
		// own error state, which is a formula naming something that is not on
		// the sheet. The other readouts are left as they are and show the other
		// half — an aggregate over a table that will not configure, which says
		// the component holds no rows rather than that it does not exist.
		if (config.id === 'encumbrance') {
			config.derived = 'sum(inventroy, Qty * Weight)';
		} else if (sample.config.type === 'card' && config.key !== undefined) {
			// A key holding a colon is refused by every fenced component,
			// because a colon is what separates key from value in the block.
			//
			// **Only a card that already has one**, and the narrowing is a
			// decision rather than a side effect of the readouts arriving. It
			// used to break every card, which put five copies of one config
			// error on a view whose whole job is showing the error states side by
			// side — and none of the derived-only cards could then show the
			// other state a Card has, a formula that will not resolve. Now
			// `armour_class` carries the config error and the five keyless cards
			// show `?`, so both states are on screen at once instead of one of
			// them five times. Adding a keyless card therefore adds a `?` here,
			// which is the intent; taking the last keyed one away would lose the
			// config error, and that is what to watch for.
			config.key = 'bad:key';
		}
		/*
		 * Two options sharing a value, on the one dropdown that can spare it: a
		 * `<select>` holding one value twice cannot say which line was chosen,
		 * so the card refuses to draw rather than round-tripping a choice it
		 * cannot read back.
		 *
		 * On `alignment` and not on every card with options, for the reason the
		 * key error above is narrowed: breaking all four would put one error
		 * four times on a view whose whole job is showing the states side by
		 * side, and the other three still have something to show here — a menu
		 * whose stored value is now the layout's own first option, a choice in
		 * a pill, and a long label in a narrow card.
		 */
		if (config.id === 'alignment' && config.options !== undefined) {
			const [first] = config.options;
			if (first) {
				config.options = [first, { value: first.value, label: 'Neutral good' }];
			}
		}
		// A total on a text column, which is the misconfiguration the open-row
		// card can actually be given: a total is what it publishes, and a text
		// column has nothing to add up. Only the open card, so the fixed one
		// stays rendered beside it for comparison.
		if (config.openRows === true) {
			config.columns = (config.columns ?? []).map((column) =>
				column.type === undefined || column.type === 'text'
					? { ...column, total: true }
					: column,
			);
		}
		// A row key that is not a name, on the card that publishes one. Refused
		// rather than rewritten, because nothing could tell the author what
		// their row had become — so the card has to say so.
		if (sample.config.type === 'table' && config.rows !== undefined) {
			config.rows = config.rows.map((row) =>
				row.key === undefined ? row : { ...row, key: 'passive perception' },
			);
		}
		/*
		 * A body that will not read, which nothing else here produces. Every
		 * breakage above rewrites *config*, so no fenced component's `read` path
		 * had ever been drawn — a section holding something its component cannot
		 * parse is a state the sheet has error text for and no picture of, and it
		 * is exactly the state a hand-edited note arrives in. Found by a review
		 * reading a vault fixture rather than this view, which is the argument for
		 * it being here.
		 *
		 * On the flag, because that card is where the two spellings meet and so
		 * where the wrong sentence is easiest to write: it has to say "not yes or
		 * no" rather than the run's "not a number of marks". Broadening it to the
		 * other fenced cards is a choice per component about which breakage is
		 * worth a picture, and is a `docs/UI.md` §12 row rather than this diff.
		 */
		let body =
			config.id === 'inspiration' ? '```sheet\nvalue: maybe\n```' : sample.body;
		/*
		 * A picture written the way every analogue accepts it and this one refuses:
		 * a bare path. `image.read` cannot fail, so this is refused in `render` like
		 * every other Image failure: the message is in the frame, under the label the
		 * component drew, with the field still there to fix it. Nothing else stages a
		 * body this component holds and will not draw, which is why it is worth
		 * staging — and the message has to carry the fix rather than the fault:
		 * "A picture is an embed" plus the syntax.
		 *
		 * On the portrait alone. Breaking every Image sample would put one error
		 * across the whole row on a view whose whole job is the states side by side,
		 * and the rest are already showing states nothing else can: two sizing pairs,
		 * a file that scales up, an unresolvable target, and a file the browser will
		 * not draw. Those last two are *populated* samples on purpose — every Image
		 * failure is render-time now, and what separates them is that they need a
		 * target the vault answers for rather than a body rewritten here, so they
		 * belong beside the working pictures.
		 */
		if (config.id === 'portrait') body = '\nSildar Hallwinter.png\n';
		/*
		 * The *other* refusal, and the one whose copy is worth looking at: a
		 * web address, refused by policy rather than by syntax (SPEC §4.2). At 200
		 * characters with a real URL in it, it is five times the bare-path message
		 * and the longest user-facing string either of these two components has —
		 * so it is the one most likely to overflow the box it lands in, and until
		 * this sample existed nothing drew it anywhere.
		 *
		 * On `symbol` because that is the **tightest** image frame here, two columns
		 * by three rows: the longest message in the smallest box is the pairing
		 * worth a picture. It also draws a second thing worth confirming — `symbol`
		 * sets `hideLabel`, so the *component* prefixes its own message with the
		 * label, which is the only case in which any of these messages is prefixed:
		 * with no heading drawn, the prefix is the only name on screen.
		 */
		if (config.id === 'symbol') body = '\n![[https://example.com/portrait.png]]\n';
		/*
		 * **A Record set's two failure surfaces, which nothing drew.** A design
		 * review found `state=broken` rendering all three lists pixel-identical to
		 * the populated view apart from one glyph — so the per-record problem line,
		 * this component's most distinctive failure design and its stated departure
		 * from Table, and all eleven configuration errors were unphotographed. UI
		 * §11 asks for an error state as well as an empty one.
		 *
		 * They are put on *different* subjects on purpose, because they are the two
		 * halves of the departure and the whole point is that they do not look
		 * alike: `traits` keeps rendering every record and marks the one whose fence
		 * will not read, while `spells` refuses outright, which is a configuration
		 * error and the one case where `read` fails at all. One on each is also what
		 * keeps this view from showing one message twice, which is the narrowing the
		 * card errors above already record.
		 */
		if (config.id === 'traits' && body !== null) {
			// A hand-typed line inside one record's fence, which is the state a note
			// arrives in and the state the per-record problem line exists for.
			body = body.replace('Uses: 1 / 3\nAttuned: no', 'Uses: 1 / 3\nnot an entry');
		}
		if (config.id === 'spells') {
			// The type this component refuses, which is also what a field added in
			// the editor and not yet typed would be.
			config.fields = [{ key: 'Notes', type: 'text' }];
		}
		return { config, body, children: sample.children };
	});
}
