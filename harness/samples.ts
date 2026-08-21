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
		return { config, body: sample.body };
	});
}
