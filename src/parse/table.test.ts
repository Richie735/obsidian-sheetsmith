import { describe, expect, it } from 'vitest';
import { readTable, RowUpdate, TableUpdates, writeTable } from './table';

/*
 * The markdown storage path. The byte-identical promise (CLAUDE.md 3) is the
 * point of most of these: a note the user hand-formatted must come back out
 * formatted the way they left it.
 *
 * Rows are addressed by position throughout, which is the change these tests
 * exist to hold: the first cell was never a unique key, and two rows sharing
 * one used to be a single row with the second unreachable.
 */

const HEADERS = ['Skill', 'Training', 'Bonus'];

/** Cell updates by body row index, the way `readTable` numbers them. */
function at(rows: Record<number, Record<string, string>>): TableUpdates {
	const out = new Map<number, RowUpdate>();
	for (const [index, cells] of Object.entries(rows)) {
		out.set(Number(index), new Map(Object.entries(cells)));
	}
	return { rows: out };
}

/** Rows to append, each a map of header text to cell. */
function append(...rows: Record<string, string>[]): TableUpdates {
	return { added: rows.map((cells) => new Map(Object.entries(cells))) };
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
		// Read as the alias the note means, not as the escape the file needs:
		// escaping is this module's business, and a caller handed the backslash
		// showed it in an input and escaped it again on the way back.
		expect(result.ok && result.table?.rows).toEqual([
			['[[Bag of Holding|Bag]]', '1'],
		]);
	});

	it('reports a row with a blank first cell like any other row', () => {
		// A nameless row is an ordinary row now that the name is not identity.
		// Dropping it hid a line the file still held, and the next edit to the
		// row below it was written over the top.
		const body = '\n| Item | Qty |\n|---|---|\n|  | 2 |\n| Rope | 1 |\n';
		const result = readTable(body);
		expect(result.ok && result.table?.rows).toEqual([
			['', '2'],
			['Rope', '1'],
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
		const same = at({ 0: { Skill: 'Acrobatics', Training: '1', Bonus: '0' } });
		expect(writeTable(BODY, HEADERS, same)).toBe(BODY);
	});

	it('is byte-identical with nothing to change at all', () => {
		expect(writeTable(BODY, HEADERS, {})).toBe(BODY);
	});

	it('is byte-identical through an unconventionally formatted table', () => {
		const ragged = '\n|Skill|Training|Bonus|\n|:--|--:|---|\n|Acrobatics|1|0|\n';
		expect(writeTable(ragged, HEADERS, at({ 0: { Training: '1' } }))).toBe(ragged);
	});

	it('preserves CRLF line endings', () => {
		const crlf = BODY.replace(/\n/g, '\r\n');
		expect(writeTable(crlf, HEADERS, at({ 0: { Training: '1' } }))).toBe(crlf);
	});

	it('rewrites only the changed cell, keeping the padding around it', () => {
		const out = writeTable(BODY, HEADERS, at({ 0: { Training: '2' } }));
		expect(out).toBe(BODY.replace('| Acrobatics | 1 |', '| Acrobatics | 2 |'));
	});

	it('leaves rows it was not asked about untouched', () => {
		const out = writeTable(BODY, HEADERS, at({ 0: { Bonus: '3' } }));
		expect(out).toContain('| Perception | 2 | 1 |');
	});

	it('writes the name column where the caller asks for it', () => {
		// The row is addressed by position, so its name is an ordinary cell.
		// Which rows may be renamed is the caller's rule to keep: a Table
		// renames the rows a character added and refuses the ones its layout
		// declares.
		const out = writeTable(BODY, HEADERS, at({ 1: { Skill: 'Insight' } }));
		expect(out).toBe(BODY.replace('| Perception |', '| Insight |'));
	});

	it("writes the name into the note's first cell whatever it is headed", () => {
		// The name is the note's first column by definition, so a layout headed
		// "Name" over a note headed "Item" writes the names it finds rather than
		// growing a second column beside them.
		const inventory = '\n| Item | Qty |\n|---|---|\n| Rope | 1 |\n';
		const out = writeTable(
			inventory,
			['Name', 'Qty'],
			at({ 0: { Name: 'Silk rope' } }),
		);
		expect(out).toBe('\n| Item | Qty |\n|---|---|\n| Silk rope | 1 |\n');
	});

	it('appends a row the note has never held', () => {
		const out = writeTable(BODY, HEADERS, append({ Skill: 'Stealth', Training: '1' }));
		expect(out).toBe(`${BODY.trimEnd()}\n| Stealth | 1 |  |\n`);
	});

	it('appends a row with nothing in it, for the character to fill', () => {
		const out = writeTable(BODY, HEADERS, append({}));
		expect(out).toBe(`${BODY.trimEnd()}\n|  |  |  |\n`);
		const parsed = readTable(out);
		expect(parsed.ok && parsed.table?.rows).toHaveLength(3);
	});

	it('appends after a last row carrying no line ending', () => {
		// The one byte an append may add to a line nobody edited: without it the
		// new row is glued onto the old one and the table stops parsing.
		const unterminated = '\n| Skill | Training |\n|---|---|\n| Acrobatics | 1 |';
		const out = writeTable(
			unterminated,
			['Skill', 'Training'],
			append({ Skill: 'Stealth' }),
		);
		expect(out).toBe(
			'\n| Skill | Training |\n|---|---|\n| Acrobatics | 1 |\n| Stealth |  |\n',
		);
	});

	it('appends a column the note is missing, header and rows alike', () => {
		const narrow = '\n| Skill | Training |\n|---|---|\n| Acrobatics | 1 |\n';
		const out = writeTable(narrow, HEADERS, at({ 0: { Bonus: '2' } }));
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n| Acrobatics | 1 | 2 |\n',
		);
	});

	it('matches a hand-typed column heading whatever its case', () => {
		const lower = '\n| skill | training |\n|---|---|\n| Acrobatics | 1 |\n';
		const out = writeTable(lower, ['Skill', 'Training'], at({ 0: { Training: '2' } }));
		expect(out).toBe('\n| skill | training |\n|---|---|\n| Acrobatics | 2 |\n');
	});

	it('escapes a pipe in a written value, so the cell survives it', () => {
		const out = writeTable(BODY, HEADERS, at({ 0: { Bonus: '[[Note|Alias]]' } }));
		expect(out).toContain('| [[Note\\|Alias]] |');
		expect(readTable(out).ok).toBe(true);
	});

	it('round-trips a cell holding a pipe, byte for byte', () => {
		// The first item called "Bread | Cheese" is where escaping stopped being
		// invisible: read handed the backslash out, the sheet showed it in a
		// field, and committing that escaped it a second time.
		const piped = '\n| Item | Note |\n|---|---|\n| Bread \\| Cheese | packed |\n';
		const read = readTable(piped);
		expect(read.ok && read.table?.rows).toEqual([['Bread | Cheese', 'packed']]);
		const same = at({ 0: { Item: 'Bread | Cheese', Note: 'packed' } });
		expect(writeTable(piped, ['Item', 'Note'], same)).toBe(piped);
	});

	it('round-trips an aliased wikilink, keeping the escape the file needs', () => {
		const aliased =
			'\n| Item | Note |\n|---|---|\n| [[Sunblade\\|sword]] | attuned |\n';
		const read = readTable(aliased);
		expect(read.ok && read.table?.rows[0]?.[0]).toBe('[[Sunblade|sword]]');
		const same = at({ 0: { Item: '[[Sunblade|sword]]', Note: 'attuned' } });
		expect(writeTable(aliased, ['Item', 'Note'], same)).toBe(aliased);
	});

	it('writes the row at the index it was given, not the first of its name', () => {
		// Two daggers are two rows. Keyed by name this wrote the first and left
		// the second unreachable, which is the hazard positions remove.
		const doubled = `${BODY}| Acrobatics | 9 | 9 |\n`;
		const out = writeTable(doubled, HEADERS, at({ 2: { Training: '5' } }));
		expect(out).toContain('| Acrobatics | 1 | 0 |');
		expect(out).toContain('| Acrobatics | 5 | 9 |');
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
		const same = at({
			0: { Training: '1', Note: '' },
			1: { Training: '2', Note: '' },
		});
		expect(writeTable(ragged, ['Skill', 'Training', 'Note'], same)).toBe(ragged);
	});

	it('still widens a short row when it has something to put there', () => {
		const ragged = '\n| Skill | Training | Note |\n|---|---|---|\n| Acrobatics | 1 |\n';
		const out = writeTable(
			ragged,
			['Skill', 'Training', 'Note'],
			at({ 0: { Note: 'expertise' } }),
		);
		expect(out).toContain('| Acrobatics | 1 | expertise |');
	});

	it('removes exactly one line and leaves every other byte alone', () => {
		const withProse = `A note about skills.\n${BODY}\nAnd one below.\n`;
		const out = writeTable(withProse, HEADERS, { removed: [0] });
		expect(out).toBe(
			`A note about skills.\n${BODY.replace('| Acrobatics | 1 | 0 |\n', '')}\nAnd one below.\n`,
		);
	});

	it('removes the row at the index it was given, not the first of its name', () => {
		const doubled = `${BODY}| Acrobatics | 9 | 9 |\n`;
		expect(writeTable(doubled, HEADERS, { removed: [2] })).toBe(BODY);
	});

	it('keeps CRLF endings through a removal', () => {
		const crlf = BODY.replace(/\n/g, '\r\n');
		const out = writeTable(crlf, HEADERS, { removed: [1] });
		expect(out).toBe(crlf.replace('| Perception | 2 | 1 |\r\n', ''));
	});

	it('ignores an index the table does not have', () => {
		// A stale read is the only way to get one, and inventing a row for it
		// would be worse than doing nothing.
		const out = writeTable(BODY, HEADERS, {
			rows: new Map([[7, new Map([['Training', '3']])]]),
			removed: [9],
		});
		expect(out).toBe(BODY);
	});

	it('writes, appends, and removes in one pass', () => {
		const out = writeTable(BODY, HEADERS, {
			rows: new Map([[1, new Map([['Bonus', '4']])]]),
			added: [new Map([['Skill', 'Stealth']])],
			removed: [0],
		});
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n' +
				'| Perception | 2 | 4 |\n| Stealth |  |  |\n',
		);
	});

	it('leaves an empty table behind when every row goes', () => {
		const out = writeTable(BODY, HEADERS, { removed: [0, 1] });
		expect(out).toBe('\n| Skill | Training | Bonus |\n|---|---|---|\n');
		const parsed = readTable(out);
		expect(parsed.ok && parsed.table?.rows).toEqual([]);
	});

	it('creates a canonical table when the section has none', () => {
		const out = writeTable(null, HEADERS, append({ Skill: 'Acrobatics', Training: '1' }));
		expect(out).toBe(
			'\n| Skill | Training | Bonus |\n|---|---|---|\n| Acrobatics | 1 |  |\n',
		);
	});

	it('appends a table below prose already in the section', () => {
		const out = writeTable(
			'\nA note about skills.\n',
			HEADERS,
			append({ Skill: 'Acrobatics', Training: '1' }),
		);
		expect(out.startsWith('\nA note about skills.\n')).toBe(true);
		expect(readTable(out).ok).toBe(true);
	});

	it('round-trips what it writes', () => {
		const out = writeTable(null, HEADERS, append({ Skill: 'Acrobatics', Training: '1' }));
		const parsed = readTable(out);
		expect(parsed.ok && parsed.table).toEqual({
			headers: ['Skill', 'Training', 'Bonus'],
			rows: [['Acrobatics', '1', '']],
		});
		expect(
			writeTable(out, HEADERS, at({ 0: { Skill: 'Acrobatics', Training: '1' } })),
		).toBe(out);
	});
});
