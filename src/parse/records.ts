/*
 * What a `###` record is, in bytes (SPEC §3.1, §4.2).
 *
 * A section holding records is a preamble followed by one block per `###`
 * heading, and one block is a heading line, whatever stands between it and the
 * end of its `sheet` fence, and everything after that. This module splits a
 * section into those pieces and puts them back; nothing here knows what a field
 * is worth, what a record is called on a card, or that a component exists.
 *
 * **One job, and the two levels of it are one fact.** Finding where a record
 * ends and finding where its fence ends are the same question — *what shape is a
 * record in the file* — and a caller cannot use either half without the other:
 * splitting a section is worth nothing without somewhere to put a field, and
 * framing a fence is worth nothing without knowing which record it belongs to.
 *
 * **Constraint 3 is the whole design.** `splitRecords` keeps every byte in one of
 * four pieces per record plus the preamble, and `joinRecords` concatenates them,
 * so parse-then-serialise is the identity by construction rather than by a
 * canonical form nothing writes. That is what lets an edit to one record's uses
 * counter leave a neighbour's odd spacing exactly as it was: nothing rebuilds a
 * piece it was not asked to change.
 *
 * **The split does not track fences**, exactly as `parseCharacter` does not track
 * fences for `## ` — so one rule reads the same way at both levels, and a caller
 * asking `startsRecord` gets this module's real answer rather than a politer one.
 *
 * In `parse/` and not beside the components, for the reason that folder exists:
 * this is note format, it imports nothing from `obsidian`, and it is testable
 * without launching the app. It is a note-format primitive on
 * `parse/markdown-body.ts`'s terms, so `docs/PATTERNS.md` §10's third exception
 * applies: what it owns is only observable through a component's round trip, and
 * `record-set.test.ts` is where that round trip lives.
 */

import { lineText, splitLines } from './lines';

/**
 * What starts a record.
 *
 * `parse/character.ts`'s `HEADING` one level down, and deliberately the same
 * shape: three hashes, whitespace, then something. `#### ` does not match,
 * because the character after the third hash is not whitespace — which is what
 * makes `#### ` the fix a refused body is told to use.
 */
const HEADING = /^###[ \t]+\S/;

/** The heading line's own spelling, so a rename keeps the author's spacing. */
const HEADING_PARTS = /^(###[ \t]+)(.*?)([ \t]*)$/;

const FENCE_OPEN = /^```sheet[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;

/** One `###` block, as the note spells it. */
export interface RecordBlock {
	/** The heading line exactly as written, its line ending included. */
	headingLine: string;
	/** The heading's text, trimmed: the record's name. */
	name: string;
	/**
	 * Everything from the heading down to and including the fence's closing
	 * line, or the empty string where the record has no fence.
	 *
	 * The fence and whatever precedes it are one piece rather than two because
	 * `parse/fenced.ts` already takes a whole body and rewrites only the lines
	 * whose value changed — so handing it this piece is a write that touches the
	 * fence and preserves anything a hand-editor put above it.
	 */
	head: string;
	/** Everything after the fence: the record's prose, verbatim. */
	rest: string;
}

/** A section's records, and whatever was written above the first of them. */
export interface RecordSection {
	/**
	 * Everything before the first `### ` line, preserved untouched — SPEC §10's
	 * rule for prose around a table, read one level in.
	 */
	preamble: string;
	records: RecordBlock[];
}

/**
 * A record's body split at its fence.
 *
 * Three cases and each is a fact the caller needs. No fence at all is a record
 * with no fields, which SPEC §10 calls empty rather than malformed, so the whole
 * body is prose and a later write puts a fresh fence in front of it. A fence
 * that never closes keeps the whole remainder in `head`, so the unreadable bytes
 * stay where `readFenced` will report them rather than being drawn as prose. A
 * closed fence splits where it closes.
 */
export function splitRecordBody(body: string): { head: string; rest: string } {
	const lines = splitLines(body);
	const open = lines.findIndex((line) => FENCE_OPEN.test(lineText(line)));
	if (open === -1) return { head: '', rest: body };
	let close = -1;
	for (let at = open + 1; at < lines.length; at++) {
		if (FENCE_CLOSE.test(lineText(lines[at] as string))) {
			close = at;
			break;
		}
	}
	if (close === -1) return { head: body, rest: '' };
	return {
		head: lines.slice(0, close + 1).join(''),
		rest: lines.slice(close + 1).join(''),
	};
}

/** Split a section body into its preamble and one block per `###` heading. */
export function splitRecords(body: string): RecordSection {
	const records: RecordBlock[] = [];
	let preamble = '';
	let headingLine: string | null = null;
	let collected = '';

	const close = (): void => {
		if (headingLine === null) return;
		records.push({
			headingLine,
			name: lineText(headingLine).slice(3).trim(),
			...splitRecordBody(collected),
		});
	};

	for (const line of splitLines(body)) {
		if (HEADING.test(lineText(line))) {
			close();
			headingLine = line;
			collected = '';
		} else if (headingLine !== null) {
			collected += line;
		} else {
			preamble += line;
		}
	}
	close();
	return { preamble, records };
}

/** Put a section back together. The inverse of `splitRecords`, byte for byte. */
export function joinRecords(section: RecordSection): string {
	let out = section.preamble;
	for (const record of section.records) {
		out += record.headingLine + record.head + record.rest;
	}
	return out;
}

/**
 * The record with new stored pieces, keeping the heading line's own spelling.
 *
 * The one thing it fixes is a heading with no line ending, which is what the
 * last record of a file with no trailing newline has: give that record a fence
 * or a body and the two would run together on one line.
 */
export function withRecordBody(
	record: RecordBlock,
	head: string,
	rest: string,
): RecordBlock {
	const headingLine =
		record.headingLine.endsWith('\n') || head + rest === ''
			? record.headingLine
			: `${record.headingLine}\n`;
	return { ...record, headingLine, head, rest };
}

/**
 * The record renamed, with the heading's own prefix and line ending kept.
 *
 * The trailing whitespace run is dropped rather than kept: it belonged to the
 * old name, and preserving it would put spaces after a name nobody typed them
 * for. A name that has not changed returns the record itself, so a write that
 * renames nothing is the identity.
 */
export function renameRecord(record: RecordBlock, name: string): RecordBlock {
	if (name === record.name) return record;
	const text = lineText(record.headingLine);
	const ending = record.headingLine.slice(text.length);
	const prefix = HEADING_PARTS.exec(text)?.[1] ?? '### ';
	return { ...record, name, headingLine: `${prefix}${name}${ending}` };
}

/**
 * The section with one more record at the end.
 *
 * The new heading is separated from whatever was above it by a blank line, which
 * is how `parse/character.ts` appends a section and how a note reads when a
 * person writes one. The padding goes onto the last piece that exists rather
 * than in front of the new heading, so a heading line is always only a heading
 * line and `joinRecords` stays a concatenation.
 */
export function appendRecord(
	section: RecordSection,
	name: string,
): RecordSection {
	const text = joinRecords(section);
	const glue = text.endsWith('\n\n')
		? ''
		: text.endsWith('\n')
			? '\n'
			: text === ''
				? '\n'
				: '\n\n';
	const records = [...section.records];
	let preamble = section.preamble;
	const last = records[records.length - 1];
	if (last === undefined) preamble += glue;
	else records[records.length - 1] = { ...last, rest: last.rest + glue };
	records.push({ headingLine: `### ${name}\n`, name, head: '', rest: '' });
	return { preamble, records };
}

/**
 * The first line of `body` that would start a new record, or null where none
 * would.
 *
 * `startsSection`'s sibling and exported for the same reason: a component
 * storing free markdown inside a record has to be able to *ask*, and one module
 * knowing what starts a record is what stops a second copy of the pattern
 * drifting about whether somebody's prose survives.
 */
export function startsRecord(body: string): string | null {
	for (const line of splitLines(body)) {
		const text = lineText(line);
		if (HEADING.test(text)) return text;
	}
	return null;
}
