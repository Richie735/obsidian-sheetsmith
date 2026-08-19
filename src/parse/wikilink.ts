/*
 * Wikilink syntax, split out of a run of cell text.
 *
 * A wikilink is a piece of file format, which is why it is parsed here rather
 * than rendered by Obsidian: `MarkdownRenderer` is asynchronous, emits block
 * markup into a table row whose height is already agreed with its neighbours,
 * wants a `Component` for a lifecycle the component contract does not offer, and
 * would put `obsidian` into `src/components/`, where every file is testable
 * under happy-dom today. Drawing a link needs none of that. Only resolving,
 * opening and previewing one does, and that is the app's business.
 *
 * The cost is that this buys wikilinks and no other markdown: a cell holding
 * `*italic*` shows its asterisks. The return type is a segment list rather than
 * a string so emphasis or an external link can be added later without changing
 * a caller.
 */

/** One run of a cell's text: prose, or a note reference. */
export type TextSegment =
	| { kind: 'text'; text: string }
	| {
			kind: 'link';
			/** The link's own source text, `[[…]]` included. */
			raw: string;
			/** The link path, `#subpath` kept: what resolves and what opens. */
			target: string;
			/** The alias where the link has one, the target otherwise. */
			display: string;
	  };

const OPEN = '[[';
const CLOSE = ']]';

/** Separates a link's target from the text shown in its place. */
const ALIAS = '|';

/**
 * Read what sits between a pair of brackets, or refuse it.
 *
 * Refused is drawn as plain text, because a broken anchor invites a click that
 * cannot go anywhere: `[[]]` has no target, and a bracket inside the pair means
 * the outer pair is not the link — `[[[[Note]]` is two characters of text and
 * then a link, which is what Obsidian shows too.
 */
function readLink(raw: string, inside: string): TextSegment | null {
	if (/[[\]]/.test(inside)) return null;
	const bar = inside.indexOf(ALIAS);
	const target = (bar === -1 ? inside : inside.slice(0, bar)).trim();
	if (target === '') return null;
	// An empty alias falls back to the target rather than drawing a link with
	// nothing in it: `[[Note|]]` is a typo on the way to an alias, and an
	// invisible link is unclickable and unreadable at once.
	const alias = bar === -1 ? '' : inside.slice(bar + 1).trim();
	return { kind: 'link', raw, target, display: alias === '' ? target : alias };
}

/**
 * Split text into its prose and its note references.
 *
 * **Rejoining the segments' source returns the input byte for byte**, which is
 * this module's one invariant and is Constraint 3's shape applied to a display
 * path: a scanner over bracket pairs is exactly the kind of code that drops a
 * character on the way to the screen, and the test for it is cheap.
 */
export function parseLinks(text: string): TextSegment[] {
	const segments: TextSegment[] = [];
	/** Text seen since the last segment was pushed. */
	let plain = '';
	let at = 0;
	while (at < text.length) {
		const open = text.indexOf(OPEN, at);
		if (open === -1) break;
		const close = text.indexOf(CLOSE, open + OPEN.length);
		if (close === -1) break;
		const raw = text.slice(open, close + CLOSE.length);
		const link = readLink(raw, text.slice(open + OPEN.length, close));
		// An embed is not a link. A row cannot hold an embedded image without
		// breaking its own height, and drawing `![[Portrait.png]]` as a link
		// would say something false about what the note holds.
		const embedded = open > 0 && text[open - 1] === '!';
		if (link === null || embedded) {
			// Not a link, so the brackets are text — and the scan resumes just
			// past them, so a later pair inside the same run still reads.
			plain += text.slice(at, open + OPEN.length);
			at = open + OPEN.length;
			continue;
		}
		plain += text.slice(at, open);
		if (plain !== '') segments.push({ kind: 'text', text: plain });
		plain = '';
		segments.push(link);
		at = close + CLOSE.length;
	}
	plain += text.slice(at);
	if (plain !== '') segments.push({ kind: 'text', text: plain });
	return segments;
}

/** The source text a segment came from. Rejoining these is the input. */
export function segmentSource(segment: TextSegment): string {
	return segment.kind === 'link' ? segment.raw : segment.text;
}

/**
 * The text as a reader sees it: every link reduced to what it reads as.
 *
 * The counterpart to `segmentSource`, and it exists for the things that have to
 * *say* a piece of cell text rather than draw it — an accessible name, a tooltip,
 * a row named in a message. A control announcing "delete bracket bracket Sunblade
 * pipe sword bracket bracket" is reading the file's syntax aloud for a row the
 * sheet displays as "sword".
 */
export function displayText(text: string): string {
	return parseLinks(text)
		.map((segment) => (segment.kind === 'link' ? segment.display : segment.text))
		.join('');
}

/** Whether any of this text is a note reference. */
export function hasLink(text: string): boolean {
	return parseLinks(text).some((segment) => segment.kind === 'link');
}
