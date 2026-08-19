/*
 * Markdown table parsing and serialisation.
 *
 * The second storage path, and the reason it exists: Obsidian does not index
 * links inside code fences, so any component that can hold a wikilink stores
 * plain markdown instead (SPEC §3.1). A cell here is ordinary note text, so
 * `[[Sunblade]]` in one keeps its backlink, hover preview, and rename.
 *
 * Like the fenced path, writes touch only the cells whose value actually
 * changed and leave every byte around them alone, so an untouched note
 * round-trips exactly even when its pipes do not line up.
 */

import { lineText, splitLines } from './lines';

export interface MarkdownTable {
	/** Header texts, trimmed and unescaped, in file order. */
	headers: string[];
	/** Body rows, each cell trimmed and unescaped, in file order. */
	rows: string[][];
}

export type TableResult =
	/** `table: null` means the section holds no table at all — "no data yet",
	 * not malformed. The first write appends one in place. */
	| { ok: true; table: MarkdownTable | null }
	| { ok: false; error: string };

/** A row of dashes under the header is what makes a block of pipes a table. */
const DELIMITER_CELL = /^:?-+:?$/;

/**
 * Read a cell's escaped pipe back as a pipe.
 *
 * **Escaping is this file's business alone.** A pipe would end the cell, so the
 * writer escapes it on the way in; handing the backslash back out made every
 * caller responsible for a file-format detail, and none of them was. The sheet
 * showed `A \| B` in an input, and committing that escaped it a second time.
 * `[[Note\|Alias]]` is the same mechanism: the file keeps the backslash the
 * aliased wikilink needs, and everything above this line sees `[[Note|Alias]]`.
 *
 * Only `\|` is touched. Every other backslash in a cell is the note's own text.
 */
function unescapePipes(text: string): string {
	return text.replace(/\\\|/g, '|');
}

/**
 * Split a line into its cell segments, keeping every byte: the outer pipes
 * and the padding inside each cell. `lead + cells.join('|') + trail` is the
 * original line, which is what makes an in-place rewrite byte-exact.
 *
 * A backslash-escaped pipe stays inside the cell it belongs to. That is not a
 * nicety: `[[Note\|Alias]]` is how an aliased wikilink survives a table, and
 * splitting on it would tear the link in half.
 */
function splitCells(text: string): {
	lead: string;
	cells: string[];
	trail: string;
} {
	const segments: string[] = [];
	let current = '';
	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		if (char === '\\' && i + 1 < text.length) {
			current += char + (text[i + 1] as string);
			i++;
			continue;
		}
		if (char === '|') {
			segments.push(current);
			current = '';
			continue;
		}
		current += char;
	}
	segments.push(current);

	// GFM lets the outer pipes be omitted. When they are present the split
	// leaves an empty segment on each end that is padding, not a cell.
	let lead = '';
	let trail = '';
	if (segments.length > 1 && (segments[0] as string).trim() === '') {
		lead = (segments.shift() as string) + '|';
	}
	if (
		segments.length > 1 &&
		(segments[segments.length - 1] as string).trim() === ''
	) {
		trail = '|' + (segments.pop() as string);
	}
	return { lead, cells: segments, trail };
}

/** Whether a line could be a table row: it has at least one unescaped pipe. */
function isTableLine(text: string): boolean {
	return splitCells(text).cells.length > 1 || /(^|[^\\])\|/.test(text);
}

function isDelimiterLine(text: string): boolean {
	const { cells } = splitCells(text);
	return (
		cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell.trim()))
	);
}

/** Where a table sits in a body, and the raw lines it is made of. */
interface TableSpan {
	/** Index of the header line in the body's lines. */
	start: number;
	/** Index one past the last row line. */
	end: number;
}

function findTable(lines: readonly string[]): TableSpan | null {
	for (let i = 0; i + 1 < lines.length; i++) {
		const header = lineText(lines[i] as string);
		const delimiter = lineText(lines[i + 1] as string);
		if (!isTableLine(header) || !isDelimiterLine(delimiter)) continue;
		// A dashes-only line is also a valid header row to the test above;
		// requiring the header to hold something else keeps a delimiter from
		// swallowing the line under it as its own table.
		if (isDelimiterLine(header)) continue;
		let end = i + 2;
		while (end < lines.length) {
			const text = lineText(lines[end] as string);
			if (text.trim() === '' || !isTableLine(text)) break;
			end++;
		}
		return { start: i, end };
	}
	return null;
}

/** Parse the markdown table in a section body. */
export function readTable(body: string): TableResult {
	const lines = splitLines(body);
	const span = findTable(lines);
	if (!span) return { ok: true, table: null };

	// A second table in one section makes every write ambiguous, so it is
	// reported rather than guessed at — the same call the fenced path makes
	// for a second sheet block.
	const rest = lines.slice(span.end);
	if (findTable(rest) !== null) {
		return { ok: false, error: 'Section has more than one table.' };
	}

	const headers = splitCells(lineText(lines[span.start] as string)).cells.map(
		(cell) => unescapePipes(cell.trim()),
	);
	const seen = new Set<string>();
	for (const header of headers) {
		const key = header.toLowerCase();
		if (seen.has(key)) {
			return { ok: false, error: `Duplicate column "${header}" in table.` };
		}
		seen.add(key);
	}

	const rows: string[][] = [];
	for (let i = span.start + 2; i < span.end; i++) {
		rows.push(
			splitCells(lineText(lines[i] as string)).cells.map((cell) =>
				unescapePipes(cell.trim()),
			),
		);
	}
	return { ok: true, table: { headers, rows } };
}

/**
 * Cell updates for one row, keyed by header text. A header the table does not
 * have is appended as a new column; a header it has under different casing
 * updates that column rather than adding a second one.
 *
 * The caller's *first* header always means the note's first cell, whatever the
 * note calls it. The name is the note's first column by definition (SPEC §4.2),
 * so a note headed "Item" under a layout headed "Name" has its names written
 * where they are, rather than growing a second column beside them.
 */
export type RowUpdate = ReadonlyMap<string, string>;

/**
 * What to change about a table's body, addressed by position.
 *
 * **Position, not the text of the first cell.** A markdown table is an ordered
 * list of lines and never promised that first cell was unique. Keyed by name,
 * two rows called "Dagger" were one row: the second was unreachable, and the
 * first's next edit was written over the top of whichever the writer found
 * first. An index has none of that, because it is not derived from anything the
 * user types.
 *
 * Indices are the ones `readTable` reported, so they are valid for exactly as
 * long as the read they came from. That is as long as a gesture: every write
 * changes the file and every change is followed by a fresh read.
 */
export interface TableUpdates {
	/** Cells to change, by body row index, 0 first. */
	rows?: ReadonlyMap<number, RowUpdate>;
	/** Rows to append after the last body row, in order. */
	added?: readonly RowUpdate[];
	/**
	 * Body row indices to remove. Each splices exactly one line out and leaves
	 * every other byte alone; the line ending is not renormalised and the prose
	 * around the table is untouched (SPEC §10).
	 */
	removed?: readonly number[];
}

/** Put a value into a cell segment, keeping the padding that surrounded it. */
function replaceCell(segment: string, value: string): string {
	const trimmed = segment.trim();
	// Compared unescaped, because that is the text the caller was handed: a cell
	// reading `A \| B` in the file and `A | B` on the sheet has not changed, and
	// comparing the two spellings would rewrite the line on every save.
	if (unescapePipes(trimmed) === value) return segment;
	// A pipe inside a value would end the cell, so it is escaped on the way
	// in. Wikilink aliases are the reason this comes up at all.
	const escaped = value.replace(/\|/g, '\\|');
	// Nothing to anchor the padding to; a single space each side makes a
	// freshly filled cell read like its neighbours.
	if (trimmed === '') return ` ${escaped} `;
	const start = segment.indexOf(trimmed);
	return segment.slice(0, start) + escaped + segment.slice(start + trimmed.length);
}

function cellText(value: string): string {
	return ` ${value.replace(/\|/g, '\\|')} `;
}

/**
 * Where each header the caller named lands in the note's columns.
 *
 * Case-insensitive, so a hand-typed "training" updates the layout's "Training"
 * column instead of growing a second one beside it, and the first header is
 * pinned to the note's first cell for the reason on `RowUpdate`.
 */
function columnMap(
	headers: readonly string[],
	existing: readonly string[],
): Map<string, number> {
	const at = new Map<string, number>();
	existing.forEach((header, index) => {
		at.set(header.toLowerCase(), index);
	});
	const first = headers[0];
	if (first !== undefined && existing.length > 0) at.set(first.toLowerCase(), 0);
	return at;
}

/** A row update as cell indices, dropping any cell with nowhere to go. */
function cellsByIndex(
	update: RowUpdate,
	columnAt: ReadonlyMap<string, number>,
): Map<number, string> {
	const values = new Map<number, string>();
	for (const [header, value] of update) {
		const index = columnAt.get(header.toLowerCase());
		// A cell for a column that is neither in the table nor declared by the
		// caller has nowhere to go; dropping the write beats widening the table
		// by a column nothing will ever read.
		if (index === undefined) continue;
		values.set(index, value);
	}
	return values;
}

/** One appended row's line, filling every column the table has. */
function appendedLine(
	values: ReadonlyMap<number, string>,
	width: number,
	ending: string,
): string {
	const cells: string[] = [];
	for (let index = 0; index < width; index++) {
		cells.push(values.get(index) ?? '');
	}
	return '|' + cells.map(cellText).join('|') + '|' + ending;
}

/** Canonical table for a section that has none yet. */
function freshTable(headers: readonly string[], updates: TableUpdates): string {
	const columnAt = columnMap(headers, headers);
	let out = '\n|' + headers.map(cellText).join('|') + '|\n';
	out += '|' + headers.map(() => '---').join('|') + '|\n';
	for (const update of updates.added ?? []) {
		out += appendedLine(cellsByIndex(update, columnAt), headers.length, '\n');
	}
	return out;
}

/**
 * Write cell values into a section body's table, preserving everything else
 * byte for byte. `headers` describes the table this caller owns; it is used
 * to create one when the body has none, and to append a column the body's
 * table is missing. A body with no table at all gets a fresh canonical one.
 *
 * `headers[0]` is the column holding the row's name. It is written like any
 * other cell where the caller asks for it: which rows a character may rename is
 * the caller's rule to keep, and this file's job is only to put the text where
 * the caller said.
 */
export function writeTable(
	body: string | null,
	headers: readonly string[],
	updates: TableUpdates,
): string {
	if (body === null) return freshTable(headers, updates);
	const lines = splitLines(body);
	const span = findTable(lines);
	if (!span) {
		const glue = body === '' || body.endsWith('\n') ? '' : '\n';
		return body + glue + freshTable(headers, updates);
	}

	const headerLine = lineText(lines[span.start] as string);
	const existing = splitCells(headerLine).cells.map((cell) =>
		unescapePipes(cell.trim()),
	);
	const columnAt = columnMap(headers, existing);

	// Columns this caller owns that the table does not have yet. They are
	// appended in declaration order, header row and every body row alike, so
	// the table stays rectangular.
	const added: string[] = [];
	for (const header of headers) {
		if (!columnAt.has(header.toLowerCase())) {
			columnAt.set(header.toLowerCase(), existing.length + added.length);
			added.push(header);
		}
	}

	/**
	 * Rewrite one line's cells, padding it out to hold any added column.
	 * `filler` is what a cell the line never had starts as: blank padding in
	 * the header and body, and a run of dashes in the delimiter row, which is
	 * structure rather than content.
	 */
	const rewrite = (
		line: string,
		values: ReadonlyMap<number, string>,
		pad?: { to: number; with: string },
	): string => {
		const text = lineText(line);
		const ending = line.slice(text.length);
		const { lead, cells, trail } = splitCells(text);

		// Writing nothing into a cell the row does not have is not a change.
		// A row shorter than the header is ordinary — the writer appends a
		// column to the header and to the rows it touches, and leaves the rest
		// short — and padding one out to store an empty string would rewrite a
		// line nobody edited, which is the byte-identical promise gone.
		const effective = new Map<number, string>();
		for (const [index, value] of values) {
			if (index < cells.length || value !== '') effective.set(index, value);
		}
		const width = Math.max(
			pad?.to ?? 0,
			effective.size > 0 ? Math.max(...effective.keys()) + 1 : 0,
		);
		if (effective.size === 0 && width <= cells.length) return line;

		const next = cells.slice();
		while (next.length < width) next.push(pad?.with ?? '  ');
		for (const [index, value] of effective) {
			next[index] = replaceCell(next[index] ?? '', value);
		}
		const rebuilt = lead + next.join('|') + trail;
		// Rebuilding is only safe because splitCells keeps every byte: an
		// unchanged row has to come back out as the same line it went in as.
		return rebuilt + ending;
	};

	const out = lines.slice();
	if (added.length > 0) {
		const headerValues = new Map<number, string>();
		added.forEach((header, i) => {
			headerValues.set(existing.length + i, header);
		});
		out[span.start] = rewrite(out[span.start] as string, headerValues);
		// A new delimiter cell copies the style of the ones beside it, so a
		// table written as `|:---|` does not sprout a `| --- |` on the end.
		const delimiter = out[span.start + 1] as string;
		const delimiterCells = splitCells(lineText(delimiter)).cells;
		out[span.start + 1] = rewrite(delimiter, new Map(), {
			to: existing.length + added.length,
			with: delimiterCells[delimiterCells.length - 1] ?? '---',
		});
	}

	// The body's first line, and the index a caller addresses it by.
	const first = span.start + 2;
	const removed = new Set(updates.removed ?? []);

	for (const [index, update] of updates.rows ?? []) {
		const at = first + index;
		// A row that is about to go is not worth rewriting, and an index past
		// the table is a stale read rather than a row to invent.
		if (removed.has(index) || at < first || at >= span.end) continue;
		const values = cellsByIndex(update, columnAt);
		if (values.size === 0) continue;
		out[at] = rewrite(out[at] as string, values);
	}

	// Match the last row's line ending, so a file using CRLF keeps to it.
	const template = out[span.end - 1] as string;
	const ending = template.slice(lineText(template).length) || '\n';
	const width = existing.length + added.length;
	const appended = (updates.added ?? []).map((update) =>
		appendedLine(cellsByIndex(update, columnAt), width, ending),
	);
	// A last line carrying no ending at all would have the first appended row
	// glued onto it. It is the one byte an append may add to a line nobody
	// edited, and the alternative is a file that no longer parses.
	if (appended.length > 0 && !template.endsWith('\n')) {
		out[span.end - 1] = template + ending;
	}

	const kept: string[] = [];
	for (let at = first; at < span.end; at++) {
		if (!removed.has(at - first)) kept.push(out[at] as string);
	}

	return [
		...out.slice(0, first),
		...kept,
		...appended,
		...out.slice(span.end),
	].join('');
}
