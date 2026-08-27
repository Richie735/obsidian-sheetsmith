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
 * **Amended: three of those four reasons are about a table row, and this is now
 * an argument about *where* the renderer belongs rather than against having it.**
 * Rich text takes it, through `RenderContext.renderMarkdown`, and the four read
 * differently there:
 *
 * - *Asynchronous, into a height already agreed.* A Rich text block's height is
 *   its **placement**, declared by the grid and never derived from its content
 *   (SPEC §8), so markup arriving a frame later cannot move anything. That is
 *   the fact this header did not have, and the whole of why the same renderer is
 *   right for a block and wrong in a cell.
 * - *Block markup.* A Rich text block **is** block markup. A paragraph, a list
 *   and a heading are what it is for; a row of cells is not.
 * - *A lifecycle the contract does not offer.* Still true, and answered rather
 *   than contradicted: the lifecycle stays in the view, which is already a
 *   `Component` (`view/markdown-pass.ts`). The component contract gains nothing.
 * - *`obsidian` in `src/components/`.* Not paid. The renderer arrives as a
 *   context member, so `components/` still imports nothing from `obsidian` and
 *   every file stays testable under happy-dom.
 *
 * **Table does not take it**, though the member is on the context and a cell
 * could reach for it. The first two reasons are still true of a row, and giving
 * a cell block markup is a separate and much larger decision.
 *
 * **`parseEmbed` is the other half of this syntax and reads the form `parseLinks`
 * refuses.** An embed is not a link, so the scanner above treats `![[…]]` as
 * text; a component whose whole value *is* an embed needs the same brackets read
 * the other way round. Both live here because one module knows this syntax —
 * PATTERNS §1's policy tier — and the alternative was a second bracket reader in
 * `image.ts` that could disagree with this one about what a target is.
 *
 * The cost of parsing here is that it buys wikilinks and no other markdown: a
 * cell holding `*italic*` shows its asterisks, and so does a Rich text block
 * wherever there is no app to ask. The return type is a segment list rather than
 * a string so emphasis or an external link can be added later without changing
 * a caller.
 */

/** A note reference, split out of whatever it was written in. */
export interface LinkSegment {
	kind: 'link';
	/** The link's own source text, `[[…]]` included. */
	raw: string;
	/** The link path, `#subpath` kept: what resolves and what opens. */
	target: string;
	/** The alias where the link has one, the target otherwise. */
	display: string;
}

/** One run of a cell's text: prose, or a note reference. */
export type TextSegment = { kind: 'text'; text: string } | LinkSegment;

const OPEN = '[[';
const CLOSE = ']]';

/** What makes a pair of brackets an embed rather than a link. */
const EMBED = `!${OPEN}`;

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
function readLink(raw: string, inside: string): LinkSegment | null {
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

/**
 * The target of a body that is one embed and nothing else, or null.
 *
 * **Strict on purpose, and each refusal is a decision rather than a gap:**
 *
 * - `[[Target]]` is a link, not an embed. A sheet drawing a picture from it would
 *   be showing something the note does not say.
 * - `![](path)` and `![](https://…)` are markdown's own image syntax, and neither
 *   propagates on rename — which is the whole reason the value is an embed. The
 *   remote form is refused for a second reason the plugin cannot compromise on: a
 *   request this plugin makes on the reader's behalf, on every render, to a host
 *   named in someone else's note. A reader who wants a remote picture writes it
 *   in a Rich text block, where the app makes the request under its own settings
 *   (SPEC §4.2).
 * - A bare `Portrait.png` is the spelling every analogue accepts and it is the
 *   one that goes stale silently: rename the file and the sheet shows nothing,
 *   with nothing saying why.
 * - Anything before or after the embed. A body holding two embeds, or an embed
 *   and a sentence, is not one value and the component has nowhere to put the
 *   rest.
 *
 * Returns the target alone. The text after the pipe — `![[Portrait.png|200x300]]`
 * — is deliberately *not* returned: the source line is preserved verbatim by
 * `parse/markdown-body.ts`, so nothing needs the options as a value, and a
 * returned member with no caller is the thing PATTERNS §1 refuses. What matters
 * about the options is that they are read past rather than choked on, which the
 * shared bracket reading below already does.
 */
export function parseEmbed(text: string): string | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith(EMBED)) return null;
	if (!trimmed.endsWith(CLOSE)) return null;
	const inside = trimmed.slice(EMBED.length, trimmed.length - CLOSE.length);
	// The same reading a link gets, so the two cannot disagree about what a
	// target is: brackets inside refuse the pair, `#subpath` is kept, and the
	// text after the first pipe is the options rather than part of the path.
	const segment = readLink(trimmed, inside);
	return segment === null ? null : segment.target;
}
