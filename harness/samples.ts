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
			type: 'skill-card',
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
				{ key: 'Bonus', type: 'computed', formula: 'ability + Training * 2' },
				{ key: 'Notes', type: 'text' },
			],
			rows: [
				{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
				{ label: 'Athletics', values: { ability: 'abilities.STR' } },
				{ label: 'Perception', values: { ability: 'abilities.WIS' } },
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
		const config = { ...sample.config } as ComponentConfig & { key?: string };
		// A key holding a colon is refused by every fenced component, because a
		// colon is what separates key from value in the block.
		if (sample.config.type === 'stat') {
			config.key = 'bad:key';
		}
		return { config, body: sample.body };
	});
}
