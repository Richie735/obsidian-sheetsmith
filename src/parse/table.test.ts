import { describe, expect, it } from 'vitest';
import { readTable, RowUpdate, TableUpdates, writeTable } from './table';

/*
 * The markdown storage path. The byte-identical promise (CLAUDE.md 3) is the
 * point of most of these: a note the user hand-formatted must come back out
 * formatted the way they left it.
 */

const HEADERS = ['Skill', 'Training', 'Bonus'];

function updates(rows: Record<string, Record<string, string>>): TableUpdates {
	const out = new Map<string, RowUpdate>();
	for (const [key, cells] of Object.entries(rows)) {
		out.set(key, new Map(Object.entries(cells)));
	}
	return out;
}

const BODY = `
| Skill | Training | Bonus |
|---|---|---|
| Acrobatics | 1 | 0 |
| Perception | 2 | 1 |
`;

describe('readTable', () => {
	it('reports no table rather than an error when the section has none', () => {
		const result = readTable('\nJust some prose.\n');
		expect(result).toEqual({ ok: true, table: null });
	});

	it('parses headers and rows', () => {
		const result = readTable(BODY);
		expect(result).toEqual({
			ok: true,
			table: {
				headers: ['Skill', 'Training', 'Bonus'],
				rows: [
					['Acrobatics', '1', '0'],
					['Perception', '2', '1'],
				],
			},
		});
	});

	it('reads a table whose outer pipes are omitted', () => {
		const result = readTable('\nSkill | Training\n--- | ---\nStealth | 1\n');
		expect(result.ok && result.table?.rows).toEqual([['Stealth', '1']]);
	});

	it('keeps an escaped pipe inside its cell, so aliased links survive', () => {
		const result = readTable(
			'\n| Item | Qty |\n|---|---|\n| [[Bag of Holding\\|Bag]] | 1 |\n',
		);
		expect(result.ok && result.table?.rows).toEqual([
			['[[Bag of Holding\\|Bag]]', '1'],
		]);
	});

	it('stops the table at a blank line, leaving prose below it alone', () => {
		const result = readTable(`${BODY}\nSome notes below.\n`);
		expect(result.ok && result.table?.rows).toHaveLength(2);
	});

	it('reports a second table rather than guessing which one to write', () => {
		const result = readTable(`${BODY}\n| A |\n|---|\n| b |\n`);
		expect(result).toEqual({
			ok: false,
			error: 'Section has more than one table.',
		});
	});

	it('reports duplicate columns', () => {
		const result = readTable('\n| A | a |\n|---|---|\n| 1 | 2 |\n');
		expect(result.ok).toBe(false);
	});
});

describe('writeTable', () => {
	it('is byte-identical when nothing changed', () => {
		const same = updates({ Acrobatics: { Training: '1', Bonus: '0' } });
		expect(writeTable(BODY, HEADERS, same)).toBe(BODY);
	});

	it('is byte-identical through an unconventionally formatted table', () => {
		const ragged = '\n|Skill|Training|Bonus|\n|:--|--:|---|\n|Acrobatics|1|0|\n';
		const same = updates({ Acrobatics: { Training: '1' } });
		expect(writeTable(ragged, HEADERS, same)).toBe(ragged);
	});

	it('preserves CRLF line endings', () => {
		const crlf = BODY.replace(/\n/g, '\r\n');
		expect(writeTable(crlf, HEADERS, updates({ Acrobatics: { Training: '1' } }))).toBe(
			crlf,
		);
	});

	it('rewrites only the changed cell, keeping the padding around it', () => {
		const out = writeTable(BODY, HEADERS, updates({ Acrobatics: { Training: '2' } }));
		expect(out).toBe(BODY.replace('| Acrobatics | 1 |', '| Acrobatics | 2 |'));
	});

	it('leaves rows it was not asked about untouched', () => {
		const out = writeTable(BODY, HEADERS, updates({ Acrobatics: { Bonus: '3' } }));
		expect(out).toContain('| Perception | 2 | 1 |');
	});

	it('never writes the key column of an existing row', () => {
		const out = writeTable(
			BODY,
			HEADERS,
			updates({ Acrobatics: { Skill: 'Renamed', Training: '1' } }),
		);
		expect(out).toBe(BODY);
	});

	it('appends a row the note has never held', () => {
		const out = writeTable(BODY, HEADERS, updates({ Stealth: { Training: '1' } }));
		expect(out).toBe(`${BODY.trimEnd()}\n| Stealth | 1 |  |\n`);
	});

	it('appends a column the note is missing, header and rows alike', () => {
		const narrow = '\n| Skill | Training |\n|---|---|\n| Acrobatics | 1 |\n';
		const out = writeTable(narrow, HEADERS, updates({ Acrobatics: { Bonus: '2' } }));
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n| Acrobatics | 1 | 2 |\n',
		);
	});

	it('matches a hand-typed column heading whatever its case', () => {
		const lower = '\n| skill | training |\n|---|---|\n| Acrobatics | 1 |\n';
		const out = writeTable(
			lower,
			['Skill', 'Training'],
			updates({ Acrobatics: { Training: '2' } }),
		);
		expect(out).toBe('\n| skill | training |\n|---|---|\n| Acrobatics | 2 |\n');
	});

	it('escapes a pipe in a written value, so the cell survives it', () => {
		const out = writeTable(
			BODY,
			HEADERS,
			updates({ Acrobatics: { Bonus: '[[Note|Alias]]' } }),
		);
		expect(out).toContain('| [[Note\\|Alias]] |');
		expect(readTable(out).ok).toBe(true);
	});

	it('writes only the first of two rows sharing a key', () => {
		const doubled = `${BODY}| Acrobatics | 9 | 9 |\n`;
		const out = writeTable(doubled, HEADERS, updates({ Acrobatics: { Training: '5' } }));
		expect(out).toContain('| Acrobatics | 5 | 0 |');
		expect(out).toContain('| Acrobatics | 9 | 9 |');
	});

	it('leaves a row shorter than its header alone when nothing changed', () => {
		// Appending a column widens the header and the rows being written, and
		// leaves the rest short. Reading that table back reports the missing
		// cells as empty, so a full-data write asks for an empty string in a
		// cell that is not there — which must stay a no-op, not pad the row
		// out and rewrite a line nobody edited.
		const ragged =
			'\n| Skill | Training | Note |\n|---|---|---|\n' +
			'| Acrobatics | 1 |\n| Stealth | 2 |  |\n';
		const same = updates({
			Acrobatics: { Training: '1', Note: '' },
			Stealth: { Training: '2', Note: '' },
		});
		expect(writeTable(ragged, ['Skill', 'Training', 'Note'], same)).toBe(ragged);
	});

	it('still widens a short row when it has something to put there', () => {
		const ragged = '\n| Skill | Training | Note |\n|---|---|---|\n| Acrobatics | 1 |\n';
		const out = writeTable(
			ragged,
			['Skill', 'Training', 'Note'],
			updates({ Acrobatics: { Note: 'expertise' } }),
		);
		expect(out).toContain('| Acrobatics | 1 | expertise |');
	});

	it('creates a canonical table when the section has none', () => {
		const out = writeTable(null, HEADERS, updates({ Acrobatics: { Training: '1' } }));
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n| Acrobatics | 1 |  |\n',
		);
	});

	it('appends a table below prose already in the section', () => {
		const out = writeTable(
			'\nA note about skills.\n',
			HEADERS,
			updates({ Acrobatics: { Training: '1' } }),
		);
		expect(out.startsWith('\nA note about skills.\n')).toBe(true);
		expect(readTable(out).ok).toBe(true);
	});

	it('round-trips what it writes', () => {
		const out = writeTable(null, HEADERS, updates({ Acrobatics: { Training: '1' } }));
		const parsed = readTable(out);
		expect(parsed.ok && parsed.table).toEqual({
			headers: ['Skill', 'Training', 'Bonus'],
			rows: [['Acrobatics', '1', '']],
		});
		expect(writeTable(out, HEADERS, updates({ Acrobatics: { Training: '1' } }))).toBe(
			out,
		);
	});
});
