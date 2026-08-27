/*
 * Character note parsing and serialisation.
 *
 * The note is split into raw pieces — frontmatter, preamble, one piece per
 * `##` section — and serialisation concatenates those pieces back, so a note
 * that nothing touched round-trips byte for byte. Section bodies stay
 * opaque here; interpreting one is the owning component's business.
 */

import { lineText, splitLines } from './lines';

export class CharacterParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CharacterParseError';
	}
}

export interface CharacterSection {
	/** Heading text with surrounding whitespace trimmed. Keys the component's label. */
	label: string;
	/** The heading line exactly as written, including its line ending. */
	headingLine: string;
	/** Everything after the heading line, up to the next section or EOF. */
	body: string;
}

export interface CharacterNote {
	/** Layout named by the sheet-layout frontmatter key. */
	layoutName: string;
	/** Raw frontmatter block, including both delimiter lines. */
	frontmatter: string;
	/** Raw content between frontmatter and the first section heading. */
	preamble: string;
	sections: CharacterSection[];
}

const LAYOUT_KEY_LINE = /^sheet-layout[ \t]*:[ \t]*(.*?)[ \t]*$/m;
const HEADING = /^##[ \t]+\S/;

/**
 * The first line of `body` that would start a new section, or null where none
 * would.
 *
 * Exported because a component storing free markdown has to be able to *ask*.
 * `## ` at the start of a line is the note's own delimiter and the only reserved
 * syntax such a body has, so a Rich text block that saved one would split the
 * note underneath itself — and the answer has to be this module's, on PATTERNS
 * §1's policy tier: one module knows what starts a section, exactly as
 * `wikilink.ts` is the only module that knows what an embed is. A second copy of
 * `HEADING` in a component is a copy that drifts silently, and what it would
 * drift about is whether somebody's backstory survives.
 *
 * **Scanned line by line with no fence awareness, because `parseCharacter` has
 * none either.** A `## ` inside a fenced block in a prose body splits the note
 * just the same, so a caller asking this question gets the parser's real answer
 * rather than a politer one.
 */
export function startsSection(body: string): string | null {
	for (const line of splitLines(body)) {
		const text = lineText(line);
		if (HEADING.test(text)) return text;
	}
	return null;
}

function splitFrontmatter(
	source: string,
): { frontmatter: string; rest: string } | null {
	const lines = splitLines(source);
	const first = lines[0];
	if (first === undefined || !/^---\r?\n$/.test(first)) return null;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i] as string;
		if (/^---(\r?\n)?$/.test(line)) {
			const end = i + 1;
			return {
				frontmatter: lines.slice(0, end).join(''),
				rest: lines.slice(end).join(''),
			};
		}
	}
	return null;
}

function extractLayoutName(frontmatter: string): string {
	const match = LAYOUT_KEY_LINE.exec(frontmatter);
	if (!match) {
		throw new CharacterParseError(
			'Note has no sheet-layout property in its frontmatter.',
		);
	}
	let value = (match[1] ?? '').trim();
	if (
		(value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
		(value.startsWith("'") && value.endsWith("'") && value.length > 1)
	) {
		value = value.slice(1, -1);
	}
	if (value === '') {
		throw new CharacterParseError('The sheet-layout property names no layout.');
	}
	return value;
}

export function parseCharacter(source: string): CharacterNote {
	const split = splitFrontmatter(source);
	if (!split) {
		throw new CharacterParseError(
			'Note has no frontmatter, so it cannot name a sheet layout.',
		);
	}
	const layoutName = extractLayoutName(split.frontmatter);

	const sections: CharacterSection[] = [];
	let preamble = '';
	let current: CharacterSection | null = null;

	for (const line of splitLines(split.rest)) {
		const text = lineText(line);
		if (HEADING.test(text)) {
			if (current) sections.push(current);
			current = {
				label: text.slice(2).trim(),
				headingLine: line,
				body: '',
			};
		} else if (current) {
			current.body += line;
		} else {
			preamble += line;
		}
	}
	if (current) sections.push(current);

	return {
		layoutName,
		frontmatter: split.frontmatter,
		preamble,
		sections,
	};
}

export function serialiseCharacter(note: CharacterNote): string {
	let out = note.frontmatter + note.preamble;
	for (const section of note.sections) {
		out += section.headingLine + section.body;
	}
	return out;
}

/** The first section whose label matches, or undefined. */
export function getSection(
	note: CharacterNote,
	label: string,
): CharacterSection | undefined {
	return note.sections.find((section) => section.label === label);
}

/**
 * Return a note with the labelled section's body replaced, appending a new
 * section at the end when none matches. Existing sections keep their heading
 * line untouched; nothing is ever removed.
 */
export function setSectionBody(
	note: CharacterNote,
	label: string,
	body: string,
): CharacterNote {
	const index = note.sections.findIndex((section) => section.label === label);
	if (index >= 0) {
		const sections = note.sections.slice();
		const existing = sections[index] as CharacterSection;
		let headingLine = existing.headingLine;
		if (body !== '' && !headingLine.endsWith('\n')) {
			headingLine += '\n';
		}
		sections[index] = { ...existing, headingLine, body };
		return { ...note, sections };
	}

	// Appending: pad the previous content to end in a blank line, so the new
	// heading sits the way the rest of the file formats its sections.
	const pad = (text: string): string => {
		if (text.endsWith('\n\n')) return text;
		return text.endsWith('\n') ? text + '\n' : text + '\n\n';
	};
	const sections = note.sections.slice();
	const last = sections[sections.length - 1];
	let preamble = note.preamble;
	if (last) {
		if (last.body === '') {
			sections[sections.length - 1] = {
				...last,
				headingLine: pad(last.headingLine),
			};
		} else {
			sections[sections.length - 1] = { ...last, body: pad(last.body) };
		}
	} else if (preamble === '') {
		preamble = '\n';
	} else {
		preamble = pad(preamble);
	}
	sections.push({ label, headingLine: `## ${label}\n`, body });
	return { ...note, preamble, sections };
}

/** One section's new body, as a function of the body it has now. */
export interface SectionWrite {
	label: string;
	/** Given the section's current body, or null where the section is missing. */
	write: (body: string | null) => string;
}

export interface SectionWriteResult {
	/** The note after every write that succeeded. */
	text: string;
	/** Sections whose write threw, in the order they were attempted. */
	failed: readonly { label: string; error: string }[];
}

/**
 * Apply a batch of section writes in one parse-and-serialise pass.
 *
 * A single edit is a batch of one, and the common path is unchanged by going
 * through here. The batch exists for the caller that changes several sections
 * at once — a reset trigger (SPEC §6) — where doing it one section at a time
 * would parse and serialise the whole note once per component, and leave the
 * user with a half-applied rest if anything failed partway.
 *
 * One pass is also what makes the undo atomic: the text before is one string
 * and the text after is another, so restoring is a swap rather than a
 * sequence of inverse edits that could themselves fail.
 *
 * A write that throws is skipped and named, and the rest still apply. That is
 * §6's rule for a trigger — apply what you can, report what you could not —
 * and §10's for a malformed section, which reports on that component while
 * the rest of the sheet keeps working. A source that will not parse at all is
 * a different matter and throws, because there is no text to return.
 */
export function applySectionWrites(
	source: string,
	writes: readonly SectionWrite[],
): SectionWriteResult {
	let note = parseCharacter(source);
	const failed: { label: string; error: string }[] = [];

	for (const { label, write } of writes) {
		try {
			const section = getSection(note, label);
			note = setSectionBody(note, label, write(section ? section.body : null));
		} catch (error) {
			failed.push({
				label,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { text: serialiseCharacter(note), failed };
}
