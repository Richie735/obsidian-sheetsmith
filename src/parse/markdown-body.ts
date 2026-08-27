/*
 * A section body that *is* its value, for the components whose storage is
 * `markdown` and whose value is one scalar: a block of prose, an embed.
 *
 * `fenced.ts` is the sibling and the shape to read this against. There, a body
 * holds a structured block and a write "touches only the lines whose value
 * actually changed"; here the body holds nothing else at all, so the same rule —
 * Constraint 3, byte-identical round-tripping — comes out as *keeping the body's
 * own whitespace framing and replacing only what sits between it*. That is the
 * one spelling of Constraint 3 that survives free-form text: there is no
 * canonical form to normalise towards, because every spelling is the user's.
 *
 * **One module because `read` and `write` have to agree to the character.** Read
 * one way and written the other, an untouched note is reformatted on every save
 * of any component on the sheet, and nothing about that is visible in review.
 * Extracted on Image, the second consumer, rather than duplicated: PATTERNS §1
 * allows duplication at two only under a test driving both copies, and this is
 * a *policy* — where the text starts and ends — which climbs the ladder in one
 * step, since the only thing such a test could assert is that the two copies
 * still say the same thing.
 *
 * In `parse/` and not beside the components, for the reason that folder exists:
 * this is note format, it imports nothing from `obsidian`, and it is testable
 * without launching the app.
 */

/**
 * The whitespace run at each end of a body, and the text between them.
 *
 * Derived from `trim` itself rather than from a `\s` pattern of its own, so
 * there is no second definition of whitespace to drift from the one `bodyText`
 * returns.
 */
function frame(body: string): { lead: string; text: string; tail: string } {
	const lead = body.slice(0, body.length - body.trimStart().length);
	const text = body.trim();
	// An all-whitespace body has no text, so it has no two runs around one —
	// the whole body is the leading run and there is nothing after it.
	const tail = text === '' ? '' : body.slice(lead.length + text.length);
	return { lead, text, tail };
}

/**
 * The body's value: everything but the whitespace run at each end.
 *
 * Empty means the section holds nothing — a missing section, an empty one, and
 * one holding only blank lines all read the same, which is PATTERNS §4's
 * "editable empty card" for a body that is all one value.
 */
export function bodyText(body: string): string {
	return frame(body).text;
}

/**
 * Put `text` back into `body`, keeping the body's own framing.
 *
 * Returns `body` **byte for byte** where the text has not changed: the body is
 * returned rather than rebuilt, so there is nothing for a rebuild to get subtly
 * wrong. It is the cheap path rather than the correct one, and worth knowing
 * which — `frame` splits a body into three pieces that rejoin to it exactly, so
 * rebuilding would produce the same bytes and no test can catch this line going.
 * What it buys is one fewer allocation on every save of every untouched section,
 * and a statement of the invariant at the place it holds.
 *
 * A section that does not exist yet, or one holding only whitespace, gets the
 * canonical `\n<text>\n` — `freshBody`'s shape in `fenced.ts`, so a new section
 * reads like every other one. There is nothing to preserve in either case,
 * because the body *is* the value: unlike a fenced write, which appends its
 * block after whatever prose was already there, a body with no text here has no
 * prose in it to keep.
 */
export function writeBodyText(body: string | null, text: string): string {
	if (body === null || body.trim() === '') return `\n${text}\n`;
	const { lead, text: current, tail } = frame(body);
	if (text === current) return body;
	return lead + text + tail;
}
