/*
 * `docs/BACKLOG.md`'s rows stay rollback pointers rather than narratives.
 *
 * The two tables this file guards used to be `docs/PATTERNS.md` §11 and
 * `docs/UI.md` §12, and between them they reached 123 KB — a mean row of about
 * 2100 bytes, a longest of 9264, and not one under 400. **Those figures are
 * bytes**, as a file size is, while the ceiling below counts UTF-16 units, as
 * `String.length` does — measured, 0.5% apart on this prose, since the only
 * non-ASCII in it is the em dash and the curly quote. Every `/ship` run reads
 * both, twice over: once by the dev and once by each reviewer. So the length is
 * not a tidiness question, it is the cost of the document, and the shape that
 * keeps it down is four cells: what the gap is, where it lives, what the fix is,
 * and what it is waiting for.
 *
 * **Two of the four rules here were prose in the tables' own headers before this
 * file existed**: the empty cell descends from §11's "Every row here names what
 * it is waiting for", and the struck-through row from both headers' "A row leaves
 * when it is fixed". The other two were written nowhere — the ceiling is this
 * move's own rule, and "a table it cannot find" is what a reader owes before it
 * reports anything at all. "Every row names what it is waiting for" was the one
 * that mattered and the one nothing enforced — the trigger lived buried in the Fix
 * paragraph, where a row could be written without one and nobody would notice
 * until years later, when it turned out no reader could ever retire it. It is a
 * column now, and this is what makes the header's `[checked]` true.
 *
 * A row is also an *entry*, not a record: a struck-through row is a solved row,
 * and the header says a backlog keeping those stops being read.
 *
 * The reader is deliberately narrow, on §10's own terms, and **stated exactly
 * rather than loosely, because it is driven in both directions**: it walks the
 * file's `## ` headings rather than searching the text, and returns the pipe
 * rows between one heading and the next — so a table under a different heading,
 * or prose above the first one, reaches neither section. It also asserts a floor
 * on how many rows it found before asserting anything about them, since a reader
 * that silently stopped matching would otherwise pass every check below on an
 * empty list. The floors are not the row counts: rows leave when they are fixed,
 * and a floor that tracked the table would go red on a *good* day.
 *
 * That narrowness is a case rather than a promise — `docs/BACKLOG.md`
 * § Patterns' own row about a scan tested in one direction only, applied here
 * before it was written — which is why `table()` takes its source: given a
 * document, the cases below assert what it must *not* report as a row.
 *
 * The one thing it cannot read is a cell holding a literal `|`, which would
 * count as a fifth cell and report as a shape failure. That is the markdown
 * table's own limit rather than this reader's, and the fix at the row is to
 * escape it.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BACKLOG = readFileSync(new URL('../docs/BACKLOG.md', import.meta.url), 'utf8');

/**
 * The two headings the rows left behind, and the one claim this whole move
 * rests on: **an address survives a move only if nothing renumbers it.**
 * Outside this file, 120 hand-written comments in `src/` and `harness/` cite
 * `docs/PATTERNS.md` §11 or `docs/UI.md` §12 — the harness bundle under
 * `harness/dist/` carries six more copies of them — and about ninety more in
 * `docs/features/` do; every one of them is a plain text reference that no
 * compiler, linter or link checker reads. Renumber either heading, or delete it
 * as an empty section, and all of them dangle silently — which is §10's own
 * case for a guard, a failure invisible in review, and §5's for an instrument
 * where a claim cannot otherwise be falsified.
 *
 * So each is held to two things: the heading exists with its number verbatim,
 * and the paragraph under it forwards to this file. The forward is half the
 * check rather than a nicety — a heading kept as an address that no longer says
 * where the rows went is an address to nowhere.
 */
const ADDRESSES: { file: string; heading: string }[] = [
	{ file: 'docs/PATTERNS.md', heading: '## 11. Conformance backlog' },
	{ file: 'docs/UI.md', heading: '## 12. Backlog' },
];

/** The whole row line, and the cells inside it, for one table. */
interface Row {
	line: string;
	cells: string[];
}

/** The four columns every row owes, in order. */
const COLUMNS = ['Gap', 'Where', 'Fix', 'Waiting on'];

/**
 * A row leaves when it is fixed, so the ceiling is per row rather than per file.
 *
 * **600 is the written row plus headroom, and both halves are measured.** Four
 * cells doing their four jobs — a gap named in a sentence, the files it lives
 * in, a fix with the measurement that supports it, and a trigger — run 512 to
 * 575 characters across all 56 rows, against an original mean of about 2100. So
 * **575 is where the shape actually lands and is what a row is written to**, and
 * 600 is that plus the 25 characters that make the next honest edit to a row an
 * edit rather than a build failure. Buy that space from the commentary in the
 * row, never from a measurement, a path or a trigger. Counted as `String.length`
 * counts, in UTF-16 units rather than the bytes the provenance figures above are
 * in.
 */
const CEILING = 600;

/**
 * The rows of the pipe table under one `## ` heading, header and separator
 * dropped. Returns `null` where the heading is absent, so "the table is there
 * at all" is a failure this file can name rather than an empty list.
 *
 * **`detached` is a pipe row the renderer will not draw**, and it is here
 * because this reader passed a document three rows of which rendered as prose.
 * A markdown pipe table ends at the first line that is not a row, so a blank
 * line between the header and a later `|`-line silently demotes everything
 * after it — while the old reader skipped any non-pipe line and kept counting,
 * which is a `[checked]` rule going green on a document it exists to fail. The
 * rows are not returned as rows, because they are not rows; they are returned
 * as the finding.
 */
function table(
	heading: string,
	source: string = BACKLOG,
): { header: string[]; rows: Row[]; detached: string[] } | null {
	const lines = source.split('\n');
	const start = lines.indexOf(`## ${heading}`);
	if (start === -1) return null;

	const found: Row[] = [];
	const detached: string[] = [];
	let header: string[] | null = null;
	// Whether a non-pipe line has closed the table. Only once the header exists:
	// the blank line between a `## ` heading and its table is ordinary, and the
	// blank line after the last row is how every section here ends.
	let closed = false;
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith('## ')) break;
		if (!line.startsWith('|')) {
			if (header !== null) closed = true;
			continue;
		}
		if (closed) {
			detached.push(line);
			continue;
		}
		const cells = line
			.replace(/^\|/, '')
			.replace(/\|$/, '')
			.split('|')
			.map((cell) => cell.trim());
		if (header === null) {
			header = cells;
			continue;
		}
		// The `| --- |` separator, which carries no content of its own.
		if (cells.every((cell) => /^-+$/.test(cell))) continue;
		found.push({ line, cells });
	}
	return header === null ? null : { header, rows: found, detached };
}

const SECTIONS: { heading: string; floor: number }[] = [
	{ heading: 'Patterns', floor: 15 },
	{ heading: 'UI', floor: 25 },
];

describe('the backlog holds rows a reader can act on', () => {
	it('finds both tables it is meant to be checking', () => {
		for (const { heading } of SECTIONS) {
			expect(table(heading), `## ${heading} is missing its table`).not.toBeNull();
		}
	});

	it('states in its header that the trigger rule is checked, and by what', () => {
		// The header alone, and the scope protects the *first* assertion only. A
		// row can supply `[checked]` — one did, until the `isolation.test.ts` flake
		// was fixed and its row left — where no row has ever named this file, so a
		// whole-file search would still fail on the second. Worth stating what it
		// therefore does not buy: both strings appear twice in the header, so
		// deleting any single paragraph of it passes under header scope too, and it
		// goes red only when the two paragraphs carrying them both go. Stated
		// without the counts on purpose: a header gains paragraphs. Naming this
		// file is the other half: a claim that something is checked owes the
		// instrument.
		const header = BACKLOG.split('\n## ')[0] ?? '';
		expect(header).toContain('[checked]');
		expect(header).toContain('src/backlog.test.ts');
	});

	describe('the two headings the rows left behind still address this file', () => {
		for (const { file, heading } of ADDRESSES) {
			it(`keeps ${heading} in ${file}, forwarding here`, () => {
				const doc = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
				const lines = doc.split('\n');
				const at = lines.indexOf(heading);
				expect(at, `${file} no longer holds the line "${heading}"`).toBeGreaterThan(-1);
				// The section's own text, not the whole document: a mention of
				// this file anywhere else is not a forward from this heading, and
				// both sections are the last in their file only for now.
				const rest = lines.slice(at + 1);
				const next = rest.findIndex((line) => line.startsWith('## '));
				const under = (next === -1 ? rest : rest.slice(0, next)).join('\n');
				expect(under, `${heading} does not say where its rows went`).toContain(
					'docs/BACKLOG.md',
				);
			});
		}
	});

	for (const { heading, floor } of SECTIONS) {
		describe(`§ ${heading}`, () => {
			it('reads enough rows to be testing something', () => {
				const found = table(heading);
				expect(found).not.toBeNull();
				expect(found?.rows.length ?? 0).toBeGreaterThan(floor);
			});

			it('names the four columns a row owes', () => {
				expect(table(heading)?.header).toEqual(COLUMNS);
			});

			it('fills all four cells of every row', () => {
				const short: string[] = [];
				for (const { cells } of table(heading)?.rows ?? []) {
					if (cells.length !== COLUMNS.length || cells.some((cell) => cell === '')) {
						short.push(cells[0] ?? '(no gap named)');
					}
				}
				expect(short).toEqual([]);
			});

			it('keeps every row under the ceiling', () => {
				const over: string[] = [];
				for (const { line, cells } of table(heading)?.rows ?? []) {
					if (line.length > CEILING) over.push(`${String(line.length)}: ${cells[0] ?? ''}`);
				}
				expect(over).toEqual([]);
			});

			it('holds no row the renderer would drop', () => {
				// A row added before the next `## ` but after a blank line reads
				// as prose, not as a row — and the four cases around this one
				// would have gone on checking it as if it were.
				expect(table(heading)?.detached).toEqual([]);
			});

			it('holds no struck-through row, a solved row having left', () => {
				const struck: string[] = [];
				for (const { line, cells } of table(heading)?.rows ?? []) {
					if (line.includes('~~')) struck.push(cells[0] ?? '');
				}
				expect(struck).toEqual([]);
			});
		});
	}
});

/*
 * The other direction, which the four cases above cannot give: what the reader
 * must *not* report. Every claim the header makes about its own narrowness is
 * one case here, named individually the way `class-tokens.test.ts` names its
 * eight — because the cost is asymmetric. A reader that stopped matching waits
 * silently to be noticed; a reader that matches too much **fails the build on a
 * correct document**, and the author most likely to trip it is the one adding a
 * worked example to this file.
 */
describe('the reader reports only what it can prove', () => {
	const DOC = [
		'# Backlog',
		'',
		'| Gap | Where | Fix | Waiting on |',
		'| --- | --- | --- | --- |',
		'| Prose above the first heading | x | y | z |',
		'',
		'## Patterns',
		'',
		'| Gap | Where | Fix | Waiting on |',
		'| --- | --- | --- | --- |',
		'| A real row | a | b | c |',
		'',
		'## Worked example',
		'',
		'| Gap | Where | Fix | Waiting on |',
		'| --- | --- | --- | --- |',
		'| An example, not a row | a | b | c |',
		'',
		'## UI',
		'',
		'| Gap | Where | Fix | Waiting on |',
		'| --- | --- | --- | --- |',
		'| Another real row | a | b | c |',
	].join('\n');

	/** The same document with a row added the way this file's own were. */
	const DETACHED = DOC.replace(
		'| A real row | a | b | c |',
		'| A real row | a | b | c |\n\n| A row nothing will draw | a | b | c |',
	);

	it('reports a pipe row a blank line has cut off from its header', () => {
		// The floor for the case above: without this, `detached` being empty on
		// a correct document proves nothing about a broken one, and the broken
		// one is what shipped.
		const found = table('Patterns', DETACHED);
		expect(found?.detached).toEqual(['| A row nothing will draw | a | b | c |']);
		// And it is not also counted as a row, which is what the old reader did.
		expect(found?.rows.map((row) => row.cells[0])).toEqual(['A real row']);
	});

	it('does not call the blank line before a table, or after one, a break', () => {
		// Every section here is a heading, a blank line, the table, a blank line
		// and the next heading. A reader calling either of those a detachment
		// would fail the build on a correct document.
		expect(table('Patterns', DOC)?.detached).toEqual([]);
		expect(table('UI', DOC)?.detached).toEqual([]);
	});

	it('reads the rows under the heading it was given', () => {
		expect(table('Patterns', DOC)?.rows.map((row) => row.cells[0])).toEqual(['A real row']);
	});

	it('does not read a table under a different heading', () => {
		const gaps = table('Patterns', DOC)?.rows.map((row) => row.cells[0]) ?? [];
		expect(gaps).not.toContain('An example, not a row');
		expect(gaps).not.toContain('Another real row');
	});

	it('does not read a table above the first heading', () => {
		for (const heading of ['Patterns', 'UI']) {
			const gaps = table(heading, DOC)?.rows.map((row) => row.cells[0]) ?? [];
			expect(gaps).not.toContain('Prose above the first heading');
		}
	});

	it('reports no table where the heading is absent, rather than an empty one', () => {
		// The distinction the four cases above rest on: an empty list passes all
		// of them, so a renamed section has to read as missing, not as clean.
		expect(table('Appearance', DOC)).toBeNull();
	});

	it('counts neither the column header nor the separator as a row', () => {
		const rows = table('UI', DOC)?.rows ?? [];
		expect(rows).toHaveLength(1);
		expect(rows[0]?.cells).toEqual(['Another real row', 'a', 'b', 'c']);
	});
});
