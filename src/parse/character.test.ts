import { describe, expect, it } from 'vitest';
import {
	applySectionWrites,
	CharacterParseError,
	getSection,
	parseCharacter,
	serialiseCharacter,
	setSectionBody,
} from './character';
import { readFenced, writeFenced } from './fenced';

/*
 * Contract for the character note parser.
 *
 * The parser is deliberately free of Obsidian API imports so it can run here
 * without launching the app. It is also the one place in the codebase where a
 * bug destroys user data, so every case below should be covered before the
 * parser is wired into a view.
 *
 * Round-tripping is the rule that matters most: parse then serialise must
 * return the original file byte for byte when nothing changed, or hand-edited
 * notes will drift on every save.
 */

const SAMPLE = `---
sheet-layout: DnD 5e Caster
---

## Abilities
\`\`\`sheet
STR: 8
DEX: 16
WIS: 12
\`\`\`

## HP
\`\`\`sheet
current: 22
max: 31
temp: 0
\`\`\`

## Inventory

| Item | Qty | Weight | Equipped |
|---|---|---|---|
| [[Bag of Holding]] | 1 | 15 | yes |
| [[Sunblade]] | 1 | 3 | yes |

## Backstory

Grew up in [[Neverwinter]] under [[Sildar Hallwinter]].
`;

describe('parseCharacter', () => {
	it('reads the layout name from the sheet-layout property', () => {
		expect(parseCharacter(SAMPLE).layoutName).toBe('DnD 5e Caster');
	});

	it('strips quotes around the layout name', () => {
		const note = parseCharacter(
			'---\nsheet-layout: "DnD 5e Caster"\n---\n',
		);
		expect(note.layoutName).toBe('DnD 5e Caster');
	});

	it('fails clearly when the sheet-layout property is missing', () => {
		expect(() => parseCharacter('---\ntitle: Nope\n---\n\nBody.\n')).toThrow(
			CharacterParseError,
		);
		expect(() => parseCharacter('No frontmatter at all.\n')).toThrow(
			CharacterParseError,
		);
		expect(() => parseCharacter('---\nsheet-layout:\n---\n')).toThrow(
			CharacterParseError,
		);
	});

	it('splits the body into one section per ## heading', () => {
		const note = parseCharacter(SAMPLE);
		expect(note.sections.map((s) => s.label)).toEqual([
			'Abilities',
			'HP',
			'Inventory',
			'Backstory',
		]);
	});

	it('parses a fenced block section into keyed values', () => {
		const note = parseCharacter(SAMPLE);
		const hp = getSection(note, 'HP');
		expect(hp).toBeDefined();
		const parsed = readFenced((hp as NonNullable<typeof hp>).body);
		expect(parsed.ok).toBe(true);
		if (parsed.ok && parsed.values) {
			expect(Object.fromEntries(parsed.values)).toEqual({
				current: '22',
				max: '31',
				temp: '0',
			});
		}
	});

	it.todo('parses a markdown table section into rows');
	it.todo('preserves wikilinks verbatim in table cells');

	it('keeps sections that match no component rather than dropping them', () => {
		const note = parseCharacter(SAMPLE);
		const orphan = getSection(note, 'Backstory');
		expect(orphan?.body).toContain('[[Neverwinter]]');
		expect(serialiseCharacter(note)).toContain('## Backstory');
	});

	it('reports a malformed section without discarding the others', () => {
		const broken = SAMPLE.replace('current: 22', 'current 22');
		const note = parseCharacter(broken);
		const hp = readFenced((getSection(note, 'HP') as { body: string }).body);
		expect(hp.ok).toBe(false);
		const abilities = readFenced(
			(getSection(note, 'Abilities') as { body: string }).body,
		);
		expect(abilities.ok).toBe(true);
		expect(serialiseCharacter(note)).toBe(broken);
	});

	it('treats deeper headings as part of the enclosing section', () => {
		const source =
			'---\nsheet-layout: L\n---\n\n## Notes\n\n### Sub-heading\n\nText.\n';
		const note = parseCharacter(source);
		expect(note.sections).toHaveLength(1);
		expect(getSection(note, 'Notes')?.body).toContain('### Sub-heading');
	});
});

describe('serialiseCharacter', () => {
	it('round-trips an unchanged note byte for byte', () => {
		expect(serialiseCharacter(parseCharacter(SAMPLE))).toBe(SAMPLE);
	});

	it('round-trips a note without a trailing newline', () => {
		const source = '---\nsheet-layout: L\n---\n\n## AC\n```sheet\nvalue: 14\n```';
		expect(serialiseCharacter(parseCharacter(source))).toBe(source);
	});

	it('round-trips CRLF line endings untouched', () => {
		const source = SAMPLE.replace(/\n/g, '\r\n');
		expect(serialiseCharacter(parseCharacter(source))).toBe(source);
	});

	it('writes a changed value without reformatting untouched sections', () => {
		const note = parseCharacter(SAMPLE);
		const hp = getSection(note, 'HP') as { body: string };
		const body = writeFenced(hp.body, new Map([['current', '18']]));
		const updated = setSectionBody(note, 'HP', body);
		expect(serialiseCharacter(updated)).toBe(
			SAMPLE.replace('current: 22', 'current: 18'),
		);
	});

	it('preserves unconventional spacing when the value is unchanged', () => {
		const body = '\n```sheet\nvalue :  14\n```\n';
		expect(writeFenced(body, new Map([['value', '14']]))).toBe(body);
	});

	it('leaves body prose outside known sections untouched', () => {
		const source =
			'---\nsheet-layout: L\n---\n\nA loose intro paragraph.\n\n## AC\n```sheet\nvalue: 14\n```\n\nTrailing remark inside the section.\n';
		const note = parseCharacter(source);
		const ac = getSection(note, 'AC') as { body: string };
		const updated = setSectionBody(
			note,
			'AC',
			writeFenced(ac.body, new Map([['value', '15']])),
		);
		expect(serialiseCharacter(updated)).toBe(
			source.replace('value: 14', 'value: 15'),
		);
	});

	it('creates a section for a component that has no data yet', () => {
		const note = parseCharacter(SAMPLE);
		const body = writeFenced(null, new Map([['value', '30']]));
		const updated = setSectionBody(note, 'Speed', body);
		expect(serialiseCharacter(updated)).toBe(
			SAMPLE + '\n## Speed\n\n```sheet\nvalue: 30\n```\n',
		);
		expect(serialiseCharacter(note)).toBe(SAMPLE);
	});
});

describe('applySectionWrites', () => {
	/** One fenced entry out of a section, for asserting on the result text. */
	const fenced = (
		text: string,
		label: string,
		key: string,
	): string | undefined => {
		const body = getSection(parseCharacter(text), label)?.body ?? '';
		const parsed = readFenced(body);
		return parsed.ok && parsed.values ? parsed.values.get(key) : undefined;
	};

	it('returns the source byte for byte when every write is a no-op', () => {
		// The batch path carries the same promise a single write does: a note
		// nothing changed must not drift, or hand-edited files are reformatted
		// on every save.
		const result = applySectionWrites(SAMPLE, [
			{ label: 'Abilities', write: (body) => body ?? '' },
			{ label: 'HP', write: (body) => body ?? '' },
			{ label: 'Backstory', write: (body) => body ?? '' },
		]);
		expect(result.text).toBe(SAMPLE);
		expect(result.failed).toEqual([]);
	});

	it('applies several writes in one pass', () => {
		const result = applySectionWrites(SAMPLE, [
			{
				label: 'Abilities',
				write: (body) => writeFenced(body, new Map([['STR', '10']])),
			},
			{
				label: 'HP',
				write: (body) => writeFenced(body, new Map([['current', '30']])),
			},
		]);
		expect(fenced(result.text, 'Abilities', 'STR')).toBe('10');
		expect(fenced(result.text, 'HP', 'current')).toBe('30');
		// Untouched entries in a written section survive.
		expect(fenced(result.text, 'Abilities', 'DEX')).toBe('16');
	});

	it('leaves sections no write names untouched', () => {
		const result = applySectionWrites(SAMPLE, [
			{ label: 'HP', write: (body) => writeFenced(body, new Map([['current', '1']])) },
		]);
		const note = parseCharacter(result.text);
		expect(getSection(note, 'Inventory')?.body).toBe(
			getSection(parseCharacter(SAMPLE), 'Inventory')?.body,
		);
		expect(getSection(note, 'Backstory')?.body).toBe(
			getSection(parseCharacter(SAMPLE), 'Backstory')?.body,
		);
	});

	it('appends a section the note does not have yet', () => {
		const result = applySectionWrites(SAMPLE, [
			{ label: 'Speed', write: () => '\n```sheet\nvalue: 30\n```\n' },
		]);
		expect(result.text).toBe(SAMPLE + '\n## Speed\n\n```sheet\nvalue: 30\n```\n');
		expect(result.failed).toEqual([]);
	});

	it('skips a write that throws and still applies the rest', () => {
		// SPEC §6: a trigger applies what it can and names what it could not.
		// One misconfigured component must not refuse a whole long rest.
		const result = applySectionWrites(SAMPLE, [
			{
				label: 'Abilities',
				write: (body) => writeFenced(body, new Map([['STR', '10']])),
			},
			{
				label: 'HP',
				write: () => {
					throw new Error('its max did not resolve.');
				},
			},
			{
				label: 'Backstory',
				write: () => '\nRewritten.\n',
			},
		]);
		expect(result.failed).toEqual([
			{ label: 'HP', error: 'its max did not resolve.' },
		]);
		const note = parseCharacter(result.text);
		expect(getSection(note, 'Backstory')?.body).toBe('\nRewritten.\n');
		// The failed section is exactly as it was.
		expect(getSection(note, 'HP')?.body).toBe(
			getSection(parseCharacter(SAMPLE), 'HP')?.body,
		);
	});

	it('throws where the note itself will not parse, since nothing can be written', () => {
		expect(() => applySectionWrites('no frontmatter here\n', [])).toThrow(
			CharacterParseError,
		);
	});

	it('is a no-op for an empty batch', () => {
		expect(applySectionWrites(SAMPLE, []).text).toBe(SAMPLE);
	});

	it('writes a later edit on top of an earlier one to the same section', () => {
		// Two commits racing one rebuild both land, in order, rather than the
		// second being computed against a body the first had already replaced.
		const result = applySectionWrites(SAMPLE, [
			{ label: 'HP', write: (body) => writeFenced(body, new Map([['current', '5']])) },
			{ label: 'HP', write: (body) => writeFenced(body, new Map([['temp', '9']])) },
		]);
		expect(fenced(result.text, 'HP', 'current')).toBe('5');
		expect(fenced(result.text, 'HP', 'temp')).toBe('9');
	});
});
