/*
 * A features zone's content: named entries, in bytes
 * (`docs/features/stat-block-zones.md`, A features zone's content).
 *
 * An entry starts at a paragraph whose first line opens, at column 0, with a
 * bold name ending in a full stop — `**Name.**`, `***Name.***` or `__Name.__` —
 * and runs to the next such paragraph. Everything before the first entry is the
 * zone's lead text. A trailing parenthesis inside the name is its qualifier:
 * `**Bite (3/Day).**` is the name `Bite` and the usage `3/Day`.
 *
 * **What is lost, by design**: Multiattack's attack list, a spellcaster's spells
 * by level and 13th Age's trigger lines are continuation text inside their entry.
 * They render as the note writes them and edit as text; none of it is a field.
 *
 * **Every write touches one piece.** A name or usage edit rewrites only the bold
 * run, in the delimiters the note used; a text edit replaces only what follows
 * the bold run, keeping the entry's trailing blank run; an add appends one
 * paragraph; a delete takes the entry's lines and the blank run before it.
 *
 * In `parse/` for the reason that folder exists: note format, nothing from
 * `obsidian`, testable without the app.
 */

import { fenceAfter } from './code-fence';
import { lineText, splitLines } from './lines';
import { bodyText, writeBodyText } from './markdown-body';

/**
 * An entry's opening: a delimiter, the name up to the first full stop sitting
 * against the closing delimiter, and that delimiter. Lazy, so `**Str. Save.**`
 * is one name: the stop after `Str` is not against the closing run.
 */
const ENTRY = /^(\*\*\*|\*\*|__)(\S(?:.*?\S)?)\.\1/;

/** A trailing qualifier, with no nested parenthesis, and the space before it. */
const QUALIFIER = /^(.*?)\s*\(([^()]*)\)$/;

/** One entry of a features zone. */
export interface FeatureEntry {
	/** Where the entry starts in the content, and where the next one does. */
	start: number;
	end: number;
	/** Where its last non-blank line ends: the entry without its trailing blank run. */
	contentEnd: number;
	/** Where the bold run ends. */
	nameEnd: number;
	delimiter: '***' | '**' | '__';
	name: string;
	/** The qualifier, or '' where the name has none. */
	usage: string;
	/** The entry as the note writes it, its framing off: what play renders. */
	source: string;
	/** Everything after the bold run, its framing off. */
	text: string;
}

export interface FeatureList {
	/** The text before the first entry, its framing off. */
	lead: string;
	/** Where the lead ends: the first entry's start, or the content's end. */
	leadEnd: number;
	/** Where the lead's last non-blank line ends. */
	leadContentEnd: number;
	entries: FeatureEntry[];
}

/** Split a name as the note writes it into the name and its qualifier. */
function splitName(raw: string): { name: string; usage: string } {
	const match = QUALIFIER.exec(raw);
	if (match === null || (match[1] ?? '').trim() === '') return { name: raw.trim(), usage: '' };
	return { name: (match[1] ?? '').trim(), usage: (match[2] ?? '').trim() };
}

/** Read a features zone's content into its lead and its entries. */
export function readFeatures(content: string): FeatureList {
	const lines = splitLines(content);
	const starts: { at: number; match: RegExpExecArray }[] = [];
	/** Where each line ends, and whether it holds anything. */
	const ends: { end: number; blank: boolean }[] = [];
	let offset = 0;
	let fence: string | null = null;
	let previousBlank = true;
	for (const line of lines) {
		const text = lineText(line);
		const blank = text.trim() === '';
		const before = fence;
		fence = fenceAfter(before, line);
		if (before === null && fence === null && !blank && previousBlank) {
			const match = ENTRY.exec(text);
			if (match !== null) starts.push({ at: offset, match });
		}
		previousBlank = fence === null && blank;
		offset += line.length;
		ends.push({ end: offset, blank });
	}
	/** The end of the last non-blank line in [from, to). */
	const contentEndIn = (from: number, to: number): number => {
		let last = from;
		let at = 0;
		for (const one of ends) {
			const begin = at;
			at = one.end;
			if (begin < from || one.end > to) continue;
			if (!one.blank) last = one.end;
		}
		return last;
	};
	const entries = starts.map(({ at, match }, index): FeatureEntry => {
		const end = starts[index + 1]?.at ?? content.length;
		const nameEnd = at + (match[0] ?? '').length;
		const { name, usage } = splitName(match[2] ?? '');
		return {
			start: at,
			end,
			contentEnd: contentEndIn(at, end),
			nameEnd,
			delimiter: (match[1] ?? '**') as FeatureEntry['delimiter'],
			name,
			usage,
			source: content.slice(at, end).trim(),
			text: bodyText(content.slice(nameEnd, end)),
		};
	});
	const leadEnd = starts[0]?.at ?? content.length;
	return {
		lead: bodyText(content.slice(0, leadEnd)),
		leadEnd,
		leadContentEnd: contentEndIn(0, leadEnd),
		entries,
	};
}

/** The bold run for a name and usage, in the note's own delimiter. */
export function boldRun(delimiter: FeatureEntry['delimiter'], name: string, usage: string): string {
	const said = usage.trim() === '' ? name.trim() : `${name.trim()} (${usage.trim()})`;
	return `${delimiter}${said}.${delimiter}`;
}

/**
 * The content with one entry's name or usage rewritten, and nothing else. A
 * part not given is the one the note holds now, so a commit names only the part
 * it changed (`docs/PATTERNS.md` §7, a delta rather than a snapshot).
 */
export function withEntryName(
	content: string,
	index: number,
	change: { name?: string; usage?: string },
): string {
	const entry = readFeatures(content).entries[index];
	if (entry === undefined) return content;
	const run = boldRun(entry.delimiter, change.name ?? entry.name, change.usage ?? entry.usage);
	return content.slice(0, entry.start) + run + content.slice(entry.nameEnd);
}

/**
 * The content with one entry's text rewritten: what follows the bold run,
 * through the entry's end, its trailing blank run kept. An entry with no text
 * yet gains it after one space on the name's own line.
 */
export function withEntryText(content: string, index: number, text: string): string {
	const entry = readFeatures(content).entries[index];
	if (entry === undefined) return content;
	const after = content.slice(entry.nameEnd, entry.end);
	let next: string;
	if (after.trim() !== '') {
		next = writeBodyText(after, text);
	} else {
		const line = after.search(/\r?\n/);
		next = ` ${text}${line < 0 ? '' : after.slice(line)}`;
	}
	return content.slice(0, entry.nameEnd) + next + content.slice(entry.end);
}

/** The content with its lead text rewritten, its entries untouched. */
export function withLead(content: string, text: string): string {
	const list = readFeatures(content);
	const lead = content.slice(0, list.leadEnd);
	if (bodyText(lead) === text) return content;
	if (lead.trim() !== '') return writeBodyText(lead, text) + content.slice(list.leadEnd);
	if (list.entries.length === 0) {
		const at = lead.indexOf('\n');
		return at < 0 ? `${lead}\n${text}\n` : `${lead.slice(0, at + 1)}${text}\n${lead.slice(at + 1)}`;
	}
	const at = lead.indexOf('\n');
	const opening = at < 0 ? '\n' : lead.slice(0, at + 1);
	return `${opening}${text}\n\n${content.slice(list.leadEnd)}`;
}

/** What **Add entry** writes: a name to replace, in `**` since nothing is being kept. */
export const NEW_ENTRY = '**Entry.** ';

/**
 * The content with one paragraph appended after its last line, a blank line
 * before it, and the content's trailing blank run kept after it.
 */
export function withEntryAdded(content: string): string {
	const lines = splitLines(content);
	let last = lines.length;
	while (last > 0 && lineText(lines[last - 1] as string).trim() === '') last--;
	const body = lines.slice(0, last).join('');
	const trailing = lines.slice(last).join('');
	if (body === '') {
		const at = trailing.indexOf('\n');
		return at < 0 ? `\n${NEW_ENTRY}\n` : `${trailing.slice(0, at + 1)}${NEW_ENTRY}\n${trailing.slice(at + 1)}`;
	}
	if (!body.endsWith('\n')) return `${body}\n\n${NEW_ENTRY}\n`;
	return `${body}\n${NEW_ENTRY}\n${trailing}`;
}

/**
 * The content with one entry removed: its lines and the blank run that
 * separated it from the piece before, so the gap after it is the gap that was.
 */
export function withEntryRemoved(content: string, index: number): string {
	const list = readFeatures(content);
	const entry = list.entries[index];
	if (entry === undefined) return content;
	const previous = list.entries[index - 1];
	const from = previous !== undefined
		? previous.contentEnd
		: list.lead === '' ? entry.start : list.leadContentEnd;
	const onlyOne = previous === undefined && list.lead === '';
	const to = onlyOne ? (list.entries[index + 1]?.start ?? entry.contentEnd) : entry.contentEnd;
	return content.slice(0, from) + content.slice(to);
}
