import { describe, expect, it } from 'vitest';
import {
	readFeatures,
	withEntryAdded,
	withEntryName,
	withEntryRemoved,
	withEntryText,
	withLead,
} from './features';

/*
 * A features zone's entries (`docs/features/stat-block-zones.md`, A features
 * zone's content): read in three name spellings, written back in the spelling
 * the note used, every other byte kept.
 */

const ZONE = [
	'',
	'Lead text.',
	'',
	'**Multiattack.** Two attacks.',
	'',
	'**Roar (1/Day).** Each creature.',
	'',
	'- On a failure it is frightened.',
	'',
	'***Keen Smell.*** Smell.',
	'',
	'__Pounce.__ Leap.',
	'',
	'```',
	'**Not.** an entry',
	'```',
	'',
].join('\n');

describe('reading', () => {
	const list = readFeatures(ZONE);

	it('parses all three name spellings and the lead', () => {
		expect(list.lead).toBe('Lead text.');
		expect(list.entries.map((entry) => [entry.delimiter, entry.name])).toEqual([
			['**', 'Multiattack'],
			['**', 'Roar'],
			['***', 'Keen Smell'],
			['__', 'Pounce'],
		]);
	});

	it('splits a qualifier off into its usage', () => {
		expect(list.entries[1]?.usage).toBe('1/Day');
	});

	it('keeps a list and a fenced block inside their entry', () => {
		expect(list.entries[1]?.text).toBe('Each creature.\n\n- On a failure it is frightened.');
		expect(list.entries[3]?.text).toContain('**Not.** an entry');
	});

	it('reads the fence rule the zone split reads: a tilde fence, closed by a longer run', () => {
		const read = readFeatures('**A.** x\n\n~~~\n\n**B.** inside\n~~~~\n\n**C.** y\n');
		expect(read.entries.map((entry) => entry.name)).toEqual(['A', 'C']);
	});

	it('reads Str. Save. as one name', () => {
		expect(readFeatures('**Str. Save.** +5').entries[0]?.name).toBe('Str. Save');
	});

	it('reads a stop outside the bold, italics alone and a list item as text', () => {
		for (const content of ['**Name**. x', '*Name.* x', '- **Name.** x']) {
			const read = readFeatures(content);
			expect(read.entries).toEqual([]);
			expect(read.lead).toBe(content);
		}
	});
});

describe('writing', () => {
	const spellings: [string, string][] = [
		['**', '\n**Bite.** Hits.\n\n**Claw.** Rakes.\n'],
		['***', '\n***Bite.*** Hits.\n\n***Claw.*** Rakes.\n'],
		['__', '\n__Bite.__ Hits.\n\n__Claw.__ Rakes.\n'],
	];
	for (const [d, content] of spellings) {
		it(`writes a name, usage and text edit back in ${d}`, () => {
			const used = withEntryName(content, 0, { usage: '3/Day' });
			expect(used).toBe(content.replace(`${d}Bite.${d}`, `${d}Bite (3/Day).${d}`));
			// A name alone keeps the usage the note holds; an empty usage drops it.
			expect(withEntryName(used, 0, { name: 'Maul' })).toBe(content.replace(`${d}Bite.${d}`, `${d}Maul (3/Day).${d}`));
			expect(withEntryName(used, 0, { usage: '' })).toBe(content);
			expect(withEntryText(content, 1, 'Slashes.')).toBe(content.replace('Rakes.', 'Slashes.'));
		});
	}

	it('appends an entry with a blank line before it', () => {
		expect(withEntryAdded('\n**A.** x\n\n')).toBe('\n**A.** x\n\n**Entry.** \n\n');
		expect(withEntryAdded('\n')).toBe('\n**Entry.** \n');
	});

	it('fills a new entry\'s text after one space on its own line', () => {
		expect(withEntryText('\n**Entry.** \n', 0, 'Text.')).toBe('\n**Entry.** Text.\n');
	});

	it('removes an entry with the blank run before it', () => {
		const content = '\n**A.** x\n\n**B.** y\n\n**C.** z\n';
		expect(withEntryRemoved(content, 1)).toBe('\n**A.** x\n\n**C.** z\n');
		expect(withEntryRemoved(content, 0)).toBe('\n**B.** y\n\n**C.** z\n');
	});

	it('writes the lead without touching an entry', () => {
		expect(withLead('\n**A.** x\n', 'Before.')).toBe('\nBefore.\n\n**A.** x\n');
		expect(withLead('\nOld.\n\n**A.** x\n', 'New.')).toBe('\nNew.\n\n**A.** x\n');
	});
});
