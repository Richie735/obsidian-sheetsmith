/*
 * Fenced `sheet` block parsing and serialisation.
 *
 * Values stay raw strings; interpreting them is the component's business.
 * Writes touch only the lines whose value actually changed, so an untouched
 * note round-trips byte for byte even when its spacing is unconventional.
 */

import { lineText, splitLines } from './lines';

export type FencedResult =
	/** `values: null` means the section has no fence at all — "no data
	 * yet", not malformed. The first write appends a fence in place. */
	| { ok: true; values: Map<string, string> | null }
	| { ok: false; error: string };

const FENCE_OPEN = /^```sheet[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const ENTRY = /^([^:]+?)([ \t]*:[ \t]*)(.*)$/;

/** Parse the `sheet` fence in a section body into keyed raw values. */
export function readFenced(body: string): FencedResult {
	const lines = splitLines(body);
	const values = new Map<string, string>();
	let inFence = false;
	let sawFence = false;

	for (const line of lines) {
		const text = lineText(line);
		if (!inFence) {
			if (FENCE_OPEN.test(text)) {
				if (sawFence) {
					return { ok: false, error: 'Section has more than one sheet block.' };
				}
				inFence = true;
				sawFence = true;
			}
			continue;
		}
		if (FENCE_CLOSE.test(text)) {
			inFence = false;
			continue;
		}
		if (text.trim() === '') continue;
		const entry = ENTRY.exec(text);
		if (!entry) {
			return {
				ok: false,
				error: `Line "${text.trim()}" is not a "key: value" entry.`,
			};
		}
		const key = (entry[1] ?? '').trim();
		const value = (entry[3] ?? '').trim();
		if (values.has(key)) {
			return { ok: false, error: `Duplicate key "${key}" in sheet block.` };
		}
		values.set(key, value);
	}

	if (!sawFence) {
		return { ok: true, values: null };
	}
	if (inFence) {
		return { ok: false, error: 'Sheet block is never closed.' };
	}
	return { ok: true, values };
}

/**
 * Which lines of a body the `sheet` fence occupies, or null where there is none.
 *
 * For the component whose section holds a fence **and** something else: it has to
 * find its other value without ever reading a line inside the fence, and it has
 * to know where the fence starts so a line it adds goes above it. Both are
 * questions about where the fence is rather than about what it holds, which is
 * why neither `readFenced` nor `writeFenced` can answer them.
 *
 * **Here rather than in the component, on `docs/PATTERNS.md` §1's one-step
 * tier.** What is shared is the *spelling* of a fence — that it opens with
 * ```` ```sheet ````, closes with a bare ```` ``` ````, and that a `sheet` fence
 * appears at most once — and a second copy of that is a policy nothing keeps in
 * step: rename the fence word here and a component matching its own regex would
 * go on treating the opening line as ordinary text, then find an embed *inside*
 * the fence and break Constraint 2 in the direction nothing is watching.
 *
 * Indices into `splitLines(body)`, both inclusive. An unclosed fence — which
 * `readFenced` refuses, so no component sees one through a successful read —
 * reports the rest of the body as inside it, because a caller reading past it
 * would be reading fence contents as prose. A second `sheet` fence is likewise
 * `readFenced`'s to refuse; this reports the first.
 *
 * **Not under §10's third exception, and the cases beside it are why.** That
 * exception covers a primitive whose only claim exists relative to a caller —
 * `bodyText` alone is `trim` — and two of the claims above are not that: *which*
 * lines a fence occupies, and that an unclosed one swallows the rest rather than
 * letting a caller read its contents as prose. Neither is observable in a
 * caller's round trip, which is satisfied by a fence found in the wrong place as
 * readily as by one found in the right one. So `fenced.test.ts` drives those two
 * directly and `passport.test.ts` holds the rest, which is the round trip.
 */
export function fenceLines(
	body: string,
): { open: number; close: number } | null {
	const lines = splitLines(body);
	let open = -1;
	for (let at = 0; at < lines.length; at++) {
		const text = lineText(lines[at] as string);
		if (open === -1) {
			if (FENCE_OPEN.test(text)) open = at;
			continue;
		}
		if (FENCE_CLOSE.test(text)) return { open, close: at };
	}
	// Unclosed: everything from the opening line on is inside it.
	return open === -1 ? null : { open, close: lines.length - 1 };
}

/** Canonical body for a section that does not exist yet. */
function freshBody(updates: ReadonlyMap<string, string | null>): string {
	let block = '\n```sheet\n';
	for (const [key, value] of updates) {
		if (value === null) continue;
		block += `${key}: ${value}\n`;
	}
	return block + '```\n';
}

/**
 * Write values into a section body, preserving everything else byte for
 * byte. Existing entries are rewritten in place only when the value actually
 * changed; keys not present yet are appended before the closing fence; a
 * null value removes the entry's line entirely. A null body produces a
 * fresh canonical section.
 */
export function writeFenced(
	body: string | null,
	updates: ReadonlyMap<string, string | null>,
): string {
	if (body === null) {
		return freshBody(updates);
	}

	const pending = new Map(updates);
	const lines = splitLines(body);
	const out: string[] = [];
	let inFence = false;
	let sawFence = false;

	for (const line of lines) {
		const text = lineText(line);
		if (!inFence) {
			if (!sawFence && FENCE_OPEN.test(text)) {
				inFence = true;
				sawFence = true;
			}
			out.push(line);
			continue;
		}
		if (FENCE_CLOSE.test(text)) {
			for (const [key, value] of pending) {
				if (value !== null) out.push(`${key}: ${value}\n`);
			}
			pending.clear();
			inFence = false;
			out.push(line);
			continue;
		}
		const entry = ENTRY.exec(text);
		const key = entry ? (entry[1] ?? '').trim() : null;
		if (entry && key !== null && pending.has(key)) {
			const next = pending.get(key) as string | null;
			pending.delete(key);
			if (next === null) {
				continue;
			}
			if ((entry[3] ?? '').trim() === next) {
				out.push(line);
			} else {
				const prefix = (entry[1] ?? '') + (entry[2] ?? '');
				const ending = line.slice(text.length);
				out.push(prefix + next + ending);
			}
			continue;
		}
		out.push(line);
	}

	if (!sawFence) {
		const glue = body === '' || body.endsWith('\n') ? '' : '\n';
		return body + glue + freshBody(pending);
	}
	// An unclosed fence never passes read, but if write is ever handed one,
	// losing the pending values would be worse than appending them.
	for (const [key, value] of pending) {
		if (value !== null) out.push(`${key}: ${value}\n`);
	}
	return out.join('');
}
