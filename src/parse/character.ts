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
