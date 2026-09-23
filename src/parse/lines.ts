/** Split text into lines, each keeping its own line ending. */
export function splitLines(text: string): string[] {
	const lines: string[] = [];
	let start = 0;
	let index;
	while ((index = text.indexOf('\n', start)) !== -1) {
		lines.push(text.slice(start, index + 1));
		start = index + 1;
	}
	if (start < text.length) lines.push(text.slice(start));
	return lines;
}

/** A line without its trailing line ending. */
export function lineText(line: string): string {
	return line.endsWith('\r\n')
		? line.slice(0, -2)
		: line.endsWith('\n')
			? line.slice(0, -1)
			: line;
}

/**
 * Whether this line is a frontmatter delimiter — the `---` that opens a block
 * and the one that closes it.
 *
 * **One name on `docs/PATTERNS.md` §1's one-step tier**, because it was spelled
 * three times in two modules and the spellings did not agree.
 * `parse/character.ts` had `/^---\r?\n$/` for the opening and
 * `/^---(\r?\n)?$/` for the closing, both against the raw line;
 * `parse/frontmatter.ts` had `/^---[ \t]*$/` against the line's text, which
 * accepted a trailing space the other two refuse. The tolerance was unreachable
 * only because the writer sees blocks the parser has already accepted, and that
 * is exactly the shape §1 warns about — a predicate whose copies can only be
 * tested for still agreeing, in the one module whose claim is that it accounts
 * for every line of a block.
 *
 * **The strict rule, not the tolerant one.** Adopting the tolerant spelling
 * would have made `--- ` open a frontmatter block where `parseCharacter` refuses
 * one today, which is a change to what counts as a character note rather than a
 * deduplication.
 *
 * Takes a line with or without its ending, which is what lets the two callers
 * pass what each has in hand: the closing delimiter may sit at EOF with no
 * ending at all.
 */
export function isFrontmatterDelimiter(line: string): boolean {
	return lineText(line) === '---';
}

/** A heading line's own prefix, its text, and its trailing whitespace run. */
const HEADING_PARTS = /^(#+[ \t]+)(.*?)([ \t]*)$/;

/**
 * A heading line with a new name in it, keeping the line's own prefix — its
 * hashes and the whitespace after them — and its line ending.
 *
 * **The trailing whitespace run is dropped rather than kept**: it belonged to
 * the old name, and preserving it would put spaces after a name nobody typed
 * them for. `renameRecord` settled that for a `### ` record and
 * `renameSectionLabel` inherits it for a `## ` section, which is why this is
 * one function: the two were the same six lines with the hash count swapped,
 * each carrying its own copy of the fallback.
 *
 * `level` is only the fallback's own hash count, for a line that holds no
 * heading prefix at all. Both callers pass a line their own `HEADING` regex
 * has already matched, so the fallback is unreachable from either — it exists
 * because the regex's result is still optional to the compiler.
 */
export function renameHeadingLine(
	line: string,
	level: number,
	to: string,
): string {
	const text = lineText(line);
	const ending = line.slice(text.length);
	const prefix = HEADING_PARTS.exec(text)?.[1] ?? `${'#'.repeat(level)} `;
	return `${prefix}${to}${ending}`;
}
