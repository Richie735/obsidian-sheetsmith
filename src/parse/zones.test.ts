import { describe, expect, it } from 'vitest';
import {
	joinZones,
	pictureTarget,
	placeZones,
	renameZoneHeading,
	replaceZone,
	splitZones,
	withPicture,
	writeZoneText,
	ZoneSpec,
	zoneHeadingKey,
	zoneHeadingLines,
} from './zones';

/*
 * A Stat block record's body as zones (`docs/features/stat-block-zones.md`,
 * Data and file model): split and joined byte for byte, placed into the
 * layout's zones, and rewritten one piece at a time.
 */

const SPECS: ZoneSpec[] = [
	{ key: 'attacks', type: 'table', heading: 'Attacks' },
	{ key: 'actions', type: 'features', heading: 'Actions' },
	{ key: 'traits', type: 'text', heading: 'Traits' },
];

const LEGACY = [
	'',
	'| Attack | Bonus | Damage |',
	'|---|---|---|',
	'| Bite | 4 | 2d4+2 piercing |',
	'',
	'***Pack Tactics.*** The wolf has advantage.',
	'',
].join('\n');

const HEADED = [
	'',
	'#### Attacks',
	'',
	'| Attack | Bonus |',
	'|---|---|',
	'| Bite | 6 |',
	'',
	'#### Actions',
	'',
	'**Multiattack.** Two attacks.',
	'',
	'#### Traits',
	'',
	'***Keen Smell.*** Smell.',
	'',
].join('\n');

const CORPUS: Record<string, string> = {
	'a 0.9.0 body': LEGACY,
	'a body of #### blocks': HEADED,
	'a lead plus blocks': `\nSome lead.\n${HEADED}`,
	'CRLF line endings': HEADED.replace(/\n/g, '\r\n'),
	'no trailing newline': HEADED.trimEnd(),
	'a picture line': `\n![[Brown bear.png]]\n${HEADED}`,
	'an unclosed code fence': '\n#### Traits\n\n```\n#### Not a heading\n',
	'a quoted heading': '\n> #### X\n\n#### Traits\n\ntext\n',
	'an empty rest': '',
};

describe('splitting and joining', () => {
	for (const [name, rest] of Object.entries(CORPUS)) {
		it(`is the identity over ${name}`, () => {
			expect(joinZones(splitZones(rest, { picture: false }))).toBe(rest);
			expect(joinZones(splitZones(rest, { picture: true }))).toBe(rest);
		});
	}

	it('finds three blocks in a headed body', () => {
		expect(splitZones(HEADED, { picture: false }).blocks).toHaveLength(3);
	});
});

describe('a #### line that is content', () => {
	const contentCases: Record<string, string> = {
		'inside a backtick fence': '```\n#### X\n```\n',
		'inside a tilde fence': '~~~\n#### X\n~~~\n',
		'inside a blockquote': '> #### X\n',
		'inside a callout': '> [!note]\n> #### X\n',
		'on an indented line': ' #### X\n',
	};
	for (const [name, text] of Object.entries(contentCases)) {
		it(`is content ${name}`, () => {
			expect(zoneHeadingLines(text)).toEqual([]);
			expect(splitZones(text, { picture: false }).blocks).toHaveLength(0);
		});
	}

	it('is content at five hashes and as a setext heading', () => {
		expect(zoneHeadingLines('##### X\nTitle\n---\n')).toEqual([]);
	});

	it('is a heading again after its fence closes', () => {
		expect(zoneHeadingLines('```\n#### X\n```\n#### Y\n')).toEqual(['#### Y']);
	});
});

describe('the tolerant match', () => {
	it('reads five spellings of one heading alike, and emphasis apart', () => {
		const keys = ['#### Traits', '####   traits  ', '#### Traits:', '#### TRAITS.', '#### Traits ##'].map(
			zoneHeadingKey,
		);
		expect(new Set(keys)).toEqual(new Set(['traits']));
		expect(zoneHeadingKey('#### **Traits**')).not.toBe('traits');
	});
});

describe('which block is which zone', () => {
	it('keeps an unmatched #### after a text zone as that zone\'s text', () => {
		const rest = '\n#### Traits\n\nOne.\n\n#### Sub\n\nTwo.\n';
		const placed = placeZones(splitZones(rest, { picture: false }), SPECS);
		expect(placed.drift).toEqual([]);
		expect(placed.zones.get('traits')?.content).toBe('\nOne.\n\n#### Sub\n\nTwo.\n');
	});

	it('draws an unmatched #### after a table, a features zone or drift as drift', () => {
		for (const before of ['#### Attacks\n\n| A |\n|---|\n| x |\n', '#### Actions\n\n**A.** x\n', '#### Other\n\nx\n']) {
			const placed = placeZones(splitZones(`\n${before}\n#### Reactions\n\ny\n`, { picture: false }), SPECS);
			expect(placed.drift.map((one) => one.heading)).toContain('Reactions');
		}
	});

	it('reads a second block for a claimed zone as drift, the first as the zone', () => {
		const rest = '\n#### Traits\n\nFirst.\n\n#### traits:\n\nSecond.\n';
		const placed = placeZones(splitZones(rest, { picture: false }), [
			{ key: 'attacks', type: 'table', heading: 'Attacks' },
			{ key: 'traits', type: 'features', heading: 'Traits' },
		]);
		expect(placed.zones.get('traits')?.content).toBe('\nFirst.\n\n');
		expect(placed.drift).toEqual([{ kind: 'second', heading: 'traits:', content: '\nSecond.\n' }]);
	});

	it('reads a 0.9.0 body: the table to the first table zone, the prose to the first text zone', () => {
		const placed = placeZones(splitZones(LEGACY, { picture: false }), SPECS);
		expect(placed.zones.get('attacks')?.from).toBe('lead-table');
		expect(placed.zones.get('traits')?.from).toBe('lead-prose');
		expect(placed.zones.get('traits')?.content.trim()).toBe('***Pack Tactics.*** The wolf has advantage.');
		expect(placed.drift).toEqual([]);
	});

	it('reads the table as prose where no table zone exists', () => {
		const placed = placeZones(splitZones(LEGACY, { picture: false }), [
			{ key: 'details', type: 'text', heading: 'Details' },
		]);
		expect(placed.zones.get('details')?.content).toBe(LEGACY);
	});

	it('draws a lead part as drift where its zone has a heading of its own', () => {
		const placed = placeZones(splitZones(`${LEGACY}#### Traits\n\nHeaded.\n`, { picture: false }), SPECS);
		expect(placed.zones.get('traits')?.from).toBe('block');
		expect(placed.drift[0]?.kind).toBe('lead');
	});
});

describe('replacing one zone', () => {
	const text = (next: string) => (raw: string | null) => writeZoneText(raw ?? '', next);

	it('writes a text zone inside its block, every other byte kept', () => {
		const next = replaceZone(HEADED, SPECS, 'traits', { picture: false }, text('Changed.'));
		expect(next).toBe(HEADED.replace('***Keen Smell.*** Smell.', 'Changed.'));
	});

	it('writes a 0.9.0 lead\'s prose in place and adds no heading', () => {
		const next = replaceZone(LEGACY, SPECS, 'traits', { picture: false }, text('New prose.'));
		expect(next).toBe(LEGACY.replace('***Pack Tactics.*** The wolf has advantage.', 'New prose.'));
		expect(next).not.toContain('####');
	});

	it('gives a zone with no content a block of its own, placed by layout order', () => {
		const rest = '\n#### Traits\n\nSmell.\n\n';
		const next = replaceZone(rest, SPECS, 'actions', { picture: false }, () => '\n**Entry.** \n');
		expect(next).toBe('\n#### Actions\n\n**Entry.** \n\n#### Traits\n\nSmell.\n\n');
	});

	it('appends a block after the last, before the trailing blank run', () => {
		const next = replaceZone(LEGACY, SPECS, 'actions', { picture: false }, () => '\n**Entry.** \n');
		expect(next).toBe(`${LEGACY}\n#### Actions\n\n**Entry.** \n`);
		expect(replaceZone(`${LEGACY}\n`, SPECS, 'actions', { picture: false }, () => '\n**Entry.** \n')).toBe(
			`${LEGACY}\n#### Actions\n\n**Entry.** \n\n`,
		);
	});

	it('gives an empty rest its first block after a blank line', () => {
		expect(replaceZone('', SPECS, 'traits', { picture: false }, text('Hi.'))).toBe('\n#### Traits\n\nHi.\n');
		expect(replaceZone('\n', SPECS, 'traits', { picture: false }, text('Hi.'))).toBe('\n#### Traits\n\nHi.\n\n');
	});

	it('leaves the heading in place when an edit empties a zone', () => {
		const next = replaceZone(HEADED, SPECS, 'traits', { picture: false }, text(''));
		expect(next).toContain('#### Traits');
		expect(next).not.toContain('Keen Smell');
	});
});

describe('the picture', () => {
	it('is read only where Picture is on', () => {
		const rest = '\n![[Brown bear.png]]\n\n#### Traits\n\nx\n';
		expect(pictureTarget(splitZones(rest, { picture: true }))).toBe('Brown bear.png');
		expect(pictureTarget(splitZones(rest, { picture: false }))).toBeNull();
	});

	it('is not read where the embed runs into a sentence, or is not an embed', () => {
		for (const rest of [
			'\n![[a.png]]\nA sentence.\n',
			'\na.png\n',
			'\n![](a.png)\n',
			'\n[[a.png]]\n',
		]) {
			expect(pictureTarget(splitZones(rest, { picture: true }))).toBeNull();
		}
	});

	it('is read before a zone heading on the next line', () => {
		expect(pictureTarget(splitZones('\n![[a.png]]\n#### Traits\n', { picture: true }))).toBe('a.png');
	});

	const RESTS: Record<string, string> = {
		'an empty rest': '',
		'a rest of prose': '\nKeen smell.\n\n',
		'a rest opening with a table': '\n| A | B |\n|---|---|\n| x | 1 |\n\n',
		'a rest opening with ####': '\n#### Traits\n\nx\n',
	};
	for (const [name, rest] of Object.entries(RESTS)) {
		it(`sets then clears byte-identically over ${name}`, () => {
			const set = withPicture(rest, 'Brown bear.png');
			expect(pictureTarget(splitZones(set, { picture: true }))).toBe('Brown bear.png');
			expect(withPicture(set, null)).toBe(rest);
		});
	}

	it('replaces only the line\'s text', () => {
		expect(withPicture('\n![[a.png]]\r\n\r\nx', 'b.png')).toBe('\n![[b.png]]\r\n\r\nx');
	});
});

describe('renaming a heading', () => {
	it('renames every spelling, and refuses where the new heading is already held', () => {
		const rest = '\n#### Traits\n\nx\n\n#### traits:\n\ny\n';
		expect(renameZoneHeading(rest, 'Traits', 'Features')).toEqual({
			kind: 'renamed',
			rest: '\n#### Features\n\nx\n\n#### Features\n\ny\n',
		});
		expect(renameZoneHeading('\n#### Traits\n\n#### Features\n', 'Traits', 'Features')).toEqual({ kind: 'collision' });
		expect(renameZoneHeading(LEGACY, 'Traits', 'Features')).toEqual({ kind: 'absent' });
	});
});
