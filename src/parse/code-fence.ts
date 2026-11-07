/*
 * Where a fenced code block opens and closes, one line at a time.
 *
 * **One rule for every reader of a zone's markdown**, because what is shared is
 * a policy: `parse/zones.ts` asks it which `####` lines are headings, and
 * `parse/features.ts` which paragraphs can start an entry, and two copies of it
 * disagreeing would read one body two ways (`docs/PATTERNS.md` §1, the one-step
 * tier). A fence opens at column 0 with three or more backticks or tildes and
 * closes on a line holding a run of the same character at least as long and
 * nothing else; one that never closes runs to the end, which is what Obsidian
 * draws.
 *
 * A note-format primitive on `markdown-body.ts`'s terms (PATTERNS §10): it is
 * driven through the two round trips it is part of, `zones.test.ts` and
 * `features.test.ts`, each holding a fenced `####` or bold name as content.
 */

import { lineText } from './lines';

const FENCE = /^(`{3,}|~{3,})/;

/**
 * The fence open after `line`, given the one open before it: the opening run,
 * or null outside a fence. A line is code where either is not null — the
 * opening line, everything inside, and the closing line.
 */
export function fenceAfter(open: string | null, line: string): string | null {
	const text = lineText(line);
	const run = FENCE.exec(text)?.[1];
	if (open === null) return run ?? null;
	if (run === undefined || run[0] !== open[0] || run.length < open.length) return open;
	return text.slice(run.length).trim() === '' ? null : open;
}
