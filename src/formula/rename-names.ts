/*
 * Which names in a formula point at a component, and rewriting them
 * (`docs/features/component-copy-paste.md`, decision 2).
 *
 * One job: read an expression's text for the places a component id can sit,
 * and change those places and nothing else. A pasted copy is renamed where its
 * names are taken, and its formulas have to go on reading their own copies —
 * which a text replace cannot do, because `hp` is also the start of `hp_max`,
 * the tail of `mod.hp`, and a row name inside a table. So this works on the
 * tokenizer's own name spans (`nameSpans`), and every byte that is not a
 * renamed id comes back exactly as the author wrote it.
 *
 * **Where an id can sit** is the whole of the grammar this knows, and it is
 * SPEC §5's: a bare name (`hp`), the first segment of a dotted one
 * (`abilities.DEX.value`), the second segment of a `mod.` name (`mod.hp`), and
 * the first argument of `sum(` and `count(`. A reset binding's `to` is not a
 * fifth place: it is an ordinary expression, reached because a component
 * declares `reset.*.to` in its `formulaFields`.
 *
 * **One reader for two callers**, which is the reason `componentReferences` is
 * exported rather than folded into the rewrite: the paste's report of what a
 * copy reads from outside itself (`editor/paste-dependencies.ts`) has to skip
 * exactly the names the rewrite skips, or it would report a row name as a
 * component nothing on the target has. One exclusion, applied once, is what
 * keeps the two agreeing (`docs/PATTERNS.md` §1, a predicate climbs in one
 * step).
 *
 * Pure, and imports nothing from `obsidian` (Constraint 5).
 */

import { AGGREGATE_NAMES, LITERAL_NAMES, nameSpans, SELF_KEYWORD } from './expression';
import { MODIFIER_NAMESPACE } from './modifiers';

/** One place in an expression where a component id sits. */
export interface ComponentReference {
	/** The id as written: one segment, never a dotted path. */
	id: string;
	/** Offset of the id's first character in the source. */
	start: number;
	/** Offset one past its last character. */
	end: number;
}

/**
 * Every place in `source` where a component id sits, in order, or `null` where
 * the text does not tokenize.
 *
 * `local` is the names the component's own scope answers before the sheet
 * does — `value`, and the row names a formula inside a table reads per row.
 * A bare name in it is not a component reference, whatever it happens to be
 * spelled like, because the evaluator never looks it up on the sheet. The first
 * argument of an aggregate is exempt: it is a component reference and nothing
 * else (SPEC §5), so a row name there cannot shadow it.
 *
 * **The known limit, accepted by the spec:** the per-row arguments of
 * `sum(other, …)` are evaluated over `other`'s rows, and this does not model
 * that scope — so a name there that equals an id is read as the id.
 */
export function componentReferences(
	source: string,
	local: ReadonlySet<string>,
): ComponentReference[] | null {
	const spans = nameSpans(source);
	if (spans === null) return null;
	const found: ComponentReference[] = [];
	/** The span an aggregate's first argument was found at, taken already. */
	const tables = new Set<number>();
	spans.forEach((span, index) => {
		if (span.call) {
			if (!AGGREGATE_NAMES.includes(span.text)) return;
			// The first argument is the next name, when nothing but a bracket and
			// whitespace sits between: `sum( inventory, …)`. Anything else there —
			// a number, a nested call — is not a table reference and the
			// evaluator refuses it; there is nothing to rename.
			const opening = /^\s*\(\s*/.exec(source.slice(span.end));
			const next = spans[index + 1];
			if (opening === null || next === undefined || next.call) return;
			if (next.start !== span.end + opening[0].length) return;
			tables.add(index + 1);
			const id = next.text.split('.')[0] as string;
			if (id === SELF_KEYWORD) return;
			found.push({ id, start: next.start, end: next.start + id.length });
			return;
		}
		if (tables.has(index) || LITERAL_NAMES.includes(span.text)) return;
		const segments = span.text.split('.');
		const first = segments[0] as string;
		if (first === MODIFIER_NAMESPACE) {
			// `mod.<id>`: the id is the second segment, and `mod.self` is this
			// name's own total rather than a component. A bare `mod` is never an
			// id — the parser reserves the word — so it is a function or nothing.
			const id = segments[1];
			if (id === undefined || id === SELF_KEYWORD) return;
			const start = span.start + first.length + 1;
			found.push({ id, start, end: start + id.length });
			return;
		}
		if (first === SELF_KEYWORD || local.has(first)) return;
		found.push({ id: first, start: span.start, end: span.start + first.length });
	});
	return found;
}

/**
 * `source` with every component id in `renames` replaced by its new id, and
 * every other byte untouched. Text that does not tokenize comes back unchanged:
 * it names nothing a rewrite could find, and the field reports it as it did.
 */
export function renameNames(
	source: string,
	renames: ReadonlyMap<string, string>,
	local: ReadonlySet<string>,
): string {
	const references = componentReferences(source, local);
	if (references === null) return source;
	let out = '';
	let from = 0;
	for (const reference of references) {
		const renamed = renames.get(reference.id);
		if (renamed === undefined) continue;
		out += source.slice(from, reference.start) + renamed;
		from = reference.end;
	}
	return out + source.slice(from);
}
