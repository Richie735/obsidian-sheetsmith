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

import type { ComponentConfig } from '../src/types';

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
			type: 'stat-group',
			label: 'Abilities',
			position: { col: 1, row: 1, width: 12, height: 1 },
			attributes: [
				{ key: 'STR', name: 'Strength' },
				{ key: 'DEX', name: 'Dexterity' },
				{ key: 'CON', name: 'Constitution' },
				{ key: 'INT', name: 'Intelligence' },
				{ key: 'WIS', name: 'Wisdom' },
				{ key: 'CHA', name: 'Charisma' },
			],
			derived: 'floor((value - 10) / 2)',
		} as ComponentConfig,
		body: '```sheet\nSTR: 15\nDEX: 14\nCON: 13\nINT: 12\nWIS: 10\nCHA: 8\n```',
	},
	{
		config: {
			id: 'armour_class',
			type: 'stat',
			label: 'Armour class',
			position: { col: 1, row: 2, width: 2, height: 1 },
			key: 'AC',
			derived: '10 + abilities.DEX',
			notePlaceholder: 'armour worn',
			signed: false,
		} as ComponentConfig,
		body: '```sheet\nAC: 16\nnote: chain mail, shield\n```',
	},
	{
		config: {
			id: 'passive_perception',
			type: 'stat',
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
					formula: 'ability + Training * 2',
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
			type: 'stat',
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
			type: 'stat',
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
			type: 'stat',
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
	 * six-up "stat beside its skills" arrangement in miniature, an outer Group
	 * of Groups each holding a Stat and a Table.
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
							type: 'stat',
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
							type: 'stat',
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
							type: 'stat',
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
					type: 'stat',
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
	/* A group the author has not filled in yet: a heading over a quiet empty
	   region, which is a layout part-way through being built rather than an
	   error. */
	{
		config: {
			id: 'spellbook',
			type: 'group',
			label: 'Spellbook',
			position: { col: 9, row: 10, width: 4, height: 1 },
		},
		body: null,
	},
	{
		config: {
			id: 'attack_count',
			// Labels key note sections, so this cannot be "Attacks": the table
			// beside it already is.
			type: 'stat',
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
							type: 'stat',
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
							type: 'stat',
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
					// The empty group below is already "Spellbook".
					label: 'Spell list',
					position: { col: 1, row: 1, width: 8, height: 3 },
					rowHeader: 'Spell',
					openRows: true,
					columns: [
						{ key: 'Level', type: 'number' },
						{ key: 'Prepared', type: 'toggle' },
					],
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
	 * **"Conditions" is a checklist**, which is what rows gain from the fold.
	 * The rings line up into a column beside their names, and the rows are
	 * spaced further apart than a set of runs would be — the ring's hit target
	 * reaches past its own box, so press the top edge of the second ring and
	 * check which one changes.
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
			id: 'conditions',
			type: 'track',
			label: 'Conditions',
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
			type: 'stat',
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
	/* The two palette prefills whose *rendering* nothing else here reaches, which
	   is the whole reason they are in the sample rather than only in the vault.
	   Inventory's is not among them: the `inventory` card above is already that
	   entry's config with three extras on top, so a third open table would be a
	   longer sheet showing nothing new. */
	{
		config: {
			id: 'currency',
			type: 'stat-group',
			label: 'Currency',
			position: { col: 1, row: 16, width: 5, height: 1 },
			// What the Currency entry writes. The card with **no** `derived` is
			// the path this covers: Abilities above carries one, so until this
			// existed nothing in the harness drew a stat card that is a name and
			// a number with no modifier line under it — which is every card this
			// entry produces.
			attributes: [
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
	/* Beside the set rather than inside it, so a tab press has something to not
	   move. */
	{
		config: {
			id: 'tab_witness',
			type: 'stat',
			label: 'Ki from a hidden tab',
			derived: 'tab_ki',
			hideValue: true,
			hideNote: true,
			position: { col: 9, row: 12, width: 4, height: 1 },
		} as ComponentConfig,
		body: null,
	},
];

/** The same layout with nothing stored: every component's empty state. */
export function emptySamples(): Sample[] {
	return SAMPLES.map((sample) => ({ config: sample.config, body: null }));
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
			rows?: { label: string; key?: string }[];
			columns?: { type?: string; total?: boolean }[];
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
					type: 'stat',
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
		} else if (sample.config.type === 'stat' && config.key !== undefined) {
			// A key holding a colon is refused by every fenced component,
			// because a colon is what separates key from value in the block.
			//
			// **Only a stat that already has one**, and the narrowing is a
			// decision rather than a side effect of the readouts arriving. It
			// used to break every stat, which put five copies of one config
			// error on a view whose whole job is showing the error states side by
			// side — and none of the derived-only cards could then show the
			// other state a Stat has, a formula that will not resolve. Now
			// `armour_class` carries the config error and the five keyless cards
			// show `?`, so both states are on screen at once instead of one of
			// them five times. Adding a keyless stat therefore adds a `?` here,
			// which is the intent; taking the last keyed one away would lose the
			// config error, and that is what to watch for.
			config.key = 'bad:key';
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
		const body =
			config.id === 'inspiration' ? '```sheet\nvalue: maybe\n```' : sample.body;
		return { config, body, children: sample.children };
	});
}
