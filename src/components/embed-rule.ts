/*
 * What a component may accept as a picture, and why a body cannot be one.
 *
 * **On the sibling allowlist deliberately, and on `effective-value.ts`'s terms
 * rather than `modifier-form.ts`'s**: in no registry, declaring no
 * `ComponentDefinition`, importing nothing from `obsidian` and touching no file.
 * It is here for **reuse**, and it arrived with two consumers rather than three
 * because what is shared is a *policy* — a predicate over a body and the
 * sentences it refuses with — and `docs/PATTERNS.md` §1 is explicit that a policy
 * climbs the ladder in one step: the only thing a guard test over two copies
 * could assert is that they still say the same thing, which is what one name says
 * for free.
 *
 * **The drift it prevents is a sentence, not a number, and that is the sharper
 * risk here.** `docs/UI.md` §9's argument for `linked-text.ts` applies verbatim:
 * a design pass softening the remote refusal in one component leaves the other
 * sending the reader somewhere else, and `isolation.test.ts` already scans `src/`
 * for refusal clauses written twice. A refusal message stays one string in one
 * place, which is what a shared rule owes its two readers.
 *
 * Image is the first consumer and Passport the second. What each does with the
 * answer differs and stays with the component: Image's whole body is the embed,
 * a Passport's embed is one line beside a fence, and both draw the refusal in
 * their own frame under their own label. What is shared is only the question
 * "can this be a picture, and if not, what is the fix?".
 *
 * **All of it is refused in `render` and never in `read`**, which is the caller's
 * rule rather than this module's, and it is worth stating here because it decides
 * what this file is allowed to be: a body a component cannot *use* is still a
 * body it can *hold*, since the field that fixes a refused value has to still be
 * on screen (SPEC §4.2). So nothing here fails a read, throws, or knows what a
 * section is.
 */

import { parseEmbed } from '../parse/wikilink';

/**
 * Hint shown while a picture frame is empty: the syntax, in the idiomatic place.
 *
 * The whole of what an empty frame has to say, and the reason neither consumer
 * needs a picker (SPEC §4.2). Obsidian's own paste-a-file-into-a-note produces
 * exactly this, so the text the reader is handed everywhere else is the text
 * these fields take. Shared because the refusal below quotes it: a placeholder
 * and a message naming two different spellings would be one instrument
 * disagreeing with itself.
 */
export const EMBED_PLACEHOLDER = '![[Portrait.png]]';

/** What a remote address looks like, for the one target this refuses by policy. */
const REMOTE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** `![alt](target)`, the other spelling of an image markdown has. */
const MARKDOWN_IMAGE = /^!\[[^\]]*\]\(([^)]*)\)$/;

/**
 * What the body is pointing at, whichever way it spells it, for the remote check
 * alone.
 *
 * The refusal below has to know this *before* it decides the body is not an
 * embed, and that ordering is the whole of the bug it fixes. `parseEmbed` only
 * recognises `![[…]]`, so `![](https://…)` — the spelling the demand actually
 * arrives in, because it is the one Obsidian itself renders — was falling through
 * to "a picture is an embed". Doing what that says produces `![[https://…]]`,
 * which is refused again by a different message sending the reader to a different
 * component. Two refusals to reach one answer, and the first one's advice was
 * wrong: PATTERNS §4 asks the text to name the fix, and a fix that leads to a
 * second refusal does not.
 *
 * A title is dropped — `![](url "Portrait")` — so the message quotes the address
 * rather than the address and a caption.
 *
 * Deliberately not `parseEmbed`'s job, and not moved into `src/parse/`: this is
 * the remote *policy* asking what host a body would reach, not the file model
 * asking what an embed means. It stays private here, because a refusal is the
 * only thing either consumer ever wants of it (PATTERNS §1).
 */
function addressed(source: string): string {
	const trimmed = source.trim();
	const embed = parseEmbed(trimmed);
	if (embed !== null) return embed;
	const markdown = MARKDOWN_IMAGE.exec(trimmed);
	// The bare paste is the third spelling and gets the same answer: a reader who
	// drops a URL in on its own is asking for exactly what the other two ask for.
	const target = (markdown?.[1] ?? trimmed).trim();
	return target.split(/\s/)[0] ?? target;
}

/**
 * Why this text cannot be a picture, or null where it can.
 *
 * Two refusals with two messages, because the fix differs and PATTERNS §4 asks
 * the text to name it. A body that is not an embed is fixed by writing the
 * bracket form; a body naming a web address is fixed by using a *different
 * component*, and a message saying "no file in this vault is called
 * https://example.com/p.png" would never lead anyone there.
 *
 * The remote refusal is this policy's rather than `parseEmbed`'s because it is
 * policy and not syntax: `![[https://…]]` is a well-formed embed. `AGENTS.md` and
 * Obsidian's Developer Policies both say default to local and offline operation,
 * and an `<img src="https://…">` this plugin wrote is a request it makes on the
 * reader's behalf, on every render of the sheet, to a host named in someone
 * else's note — leaking the reader's address and, through the URL, which sheet is
 * open. The positive answer is what keeps this from being a bare refusal:
 * Obsidian renders `![](https://…)` perfectly well under its own settings and its
 * own disclosure, so the message sends the reader to a Rich text block.
 */
export function embedRefusal(source: string): string | null {
	/*
	 * **An empty field is not a refusal, and that clause belongs here rather than
	 * at every call site.** It was the callers' job and was spelled three times
	 * across two components — `source === '' ? null : embedRefusal(source)` — which
	 * is `docs/PATTERNS.md` §1's "share the application, not just the fact" with
	 * the fact shared and one clause of its application left behind. It is also
	 * PATTERNS §4's rule for this repository: a missing value is an editable empty
	 * state and never an error, so a predicate answering "why can this not be a
	 * picture?" has exactly one honest answer for no text at all.
	 *
	 * Trimmed, because a body that is all whitespace is what `bodyText` and
	 * `readFenced` both already read as nothing stored.
	 */
	if (source.trim() === '') return null;
	// Remote first, and that order is load-bearing rather than incidental: the
	// syntax refusal names a fix, and for a body naming a web address that fix is
	// wrong — writing the bracket form around a URL only reaches this message one
	// step later. See `addressed` for the three spellings this now covers.
	const target = addressed(source);
	if (REMOTE.test(target)) {
		return `"${target}" is a web address, and a picture has to be a file in this vault. Put a remote picture in a Rich text block instead, where Obsidian fetches it under your own settings.`;
	}
	if (parseEmbed(source) === null) {
		return `A picture is an embed: ${EMBED_PLACEHOLDER}.`;
	}
	return null;
}
