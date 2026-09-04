/*
 * What a `sheet` fence does to a wikilink, and the one sentence a component says
 * about it.
 *
 * **Constraint 2, read from the write side.** Obsidian indexes no link inside a
 * code fence, so backlinks, graph view, hover preview and **rename propagation**
 * all break with no warning. A component whose values live in a fence therefore
 * cannot store one — and the answer is neither to escape it, which puts a
 * plugin's syntax into a file the user owns (Rich text's rule), nor to refuse it
 * in `read`, which would correct a note that already holds one instead of
 * carrying it (SPEC §10). It is refused at the **commit**: the message is for the
 * reader who is typing one now.
 *
 * **On the sibling allowlist deliberately, and it is a *sentence* rather than a
 * predicate.** `hasLink` is already one function in `parse/wikilink.ts`; what was
 * duplicated the moment a second fenced component grew a free-text field is the
 * copy the reader actually meets. `record-set.ts`'s own comment states the rule
 * this file exists to keep true — "the sentence is the whole of what the reader is
 * told and two copies of it is one design pass away from saying two things, which
 * is the drift `components/isolation.test.ts` scans for by clause" — and a comment
 * cannot make that true across two files. `docs/PATTERNS.md` §1's one-step tier is
 * the ground: a sentence is a policy, so it extracts on the second consumer, and
 * the two-consumer rung is not available here because each component's own tests
 * drive its own gesture and neither would ever hold the other to its wording.
 *
 * **The two words that differ arrive as arguments**, which is `linked-text.ts`'s
 * precedent exactly: a module beside the components must not know that a record
 * or a passport exists, so what it is handed is *this* component's noun for what
 * it stores and *this* component's answer for where the link should go instead.
 * A record has a name and a body to move one into; a passport has neither, and
 * the honest advice there is a different component. Nothing here decides that.
 *
 * In no registry, declaring no `ComponentDefinition`, importing nothing from
 * `obsidian` and touching no file.
 */

import { hasLink } from '../parse/wikilink';

/** What one component calls the thing it stores, and where a link belongs instead. */
export interface FencedLinkWords {
	/**
	 * The plural subject of the sentence — "A record's fields", "A passport's
	 * values". Plural because the verb is `are`, which is what keeps the
	 * substitution from needing a second knob.
	 */
	subject: string;
	/** Where the link should go, as a whole sentence ending in a full stop. */
	instead: string;
}

/**
 * Why this text cannot be stored in a fence, or null where it can.
 *
 * Returns the sentence unprefixed, so a caller that has more than one reason to
 * refuse composes its own opening — Record set prefixes "Not saved." across a
 * link *and* a stray slash, and a builder that prefixed here would say it twice.
 */
export function fencedLinkRefusal(
	text: string,
	words: FencedLinkWords,
): string | null {
	if (!hasLink(text)) return null;
	return `${words.subject} are stored in a code block and Obsidian indexes no link inside one, so "${text}" would stop being a link. ${words.instead}`;
}
