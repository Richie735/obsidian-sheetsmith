/*
 * What a modifier cell's bytes mean (SPEC §4.2).
 *
 * One job: the format of one cell. The separator that divides it into parts, the
 * split, the join, the test that tells a definition's name from an effect typed
 * on the row, one part's parse and one part's spelling. Nothing here looks a
 * definition up, evaluates anything, or knows what a bonus type means — that is
 * `formula/`'s, and this is what it calls once per part.
 *
 * **The three facts in this file are one fact.** The character that separates two
 * parts, the shape that marks a part as typed, and the two things a definition's
 * name may therefore not be are the *same* three facts read from either end, and
 * two declarations of them could drift apart — which is the one way this feature
 * could silently produce a cell nobody can spell. So
 * `parse/modifier-definitions.ts` imports its two name tests from here rather
 * than spelling either, and Table imports the split, the join and the spelling
 * because it writes a cell.
 *
 * **The discriminator is the assignment, and it is structural rather than a
 * sigil.** A leading `=` or `>` would be one character at a fixed position and
 * would then sit in front of an assignment that already says the same thing, so
 * `= armour_class += 2` carries two operators for one fact. Worse, a sigil is
 * *this plugin's* syntax in a file the user owns, where an assignment is the
 * arithmetic the sheet is already made of. And "a name is a definition, anything
 * with an operator is a formula" loses on the evidence a comma lost on as a
 * separator: *+1 Longsword*, *Ring of Protection +2* and *Bracers of Armor,
 * Greater* are canonical item names, and half of them carry a `+`. Tightened
 * enough to survive those names, the discriminator *is* one published-name token
 * then `+=` or `=`.
 *
 * **There is no such thing as a malformed cell.** Every part is exactly one of
 * the two, so nothing here fails and nothing is ever corrected: a part naming
 * something the layout does not declare is a stray, rendered and carried (§4.2).
 *
 * Pure, so Constraint 5 holds. It imports the operator and the typed effect from
 * `../types` and nothing else.
 */

import { ModifierOperator, ModifierPhase, TypedEffect } from '../types';

/**
 * What separates two parts in one modifier cell (SPEC §4.2).
 *
 * **A semicolon and not the character a reader would guess.** A comma is what a
 * list looks like and is the one separator this domain cannot have: item names
 * carry commas as a matter of course — *Bracers of Armor, Greater* — so the
 * constraint on a name would bite constantly and the report would read as the
 * plugin refusing ordinary names. ` + ` fails worse, since `+1` and `+2` are
 * suffixed to half the items in every system surveyed; `|` would put a backslash
 * in every multi-part cell of a file people hand-edit, because `parse/table.ts`
 * escapes it; and a newline cannot be one at all, since a table row is one line.
 *
 * **It is not in the expression grammar at all**, so reserving it costs an amount
 * nothing: the tokenizer has no statement separator and no string literal to hide
 * one in, so there is no legal expression a `;` can appear inside.
 */
export const MODIFIER_SEPARATOR = ';';

/** How a cell spells "adds to", which is the operator a part defaults to. */
export const ADDS_TO = '+=';

/** How a cell spells "sets". */
export const SETS = '=';

/**
 * The one phase a cell ever spells.
 *
 * The value phase is the *absent* clause rather than the word `value`, so a cell
 * written before phases existed round-trips byte for byte and there is one
 * spelling per meaning rather than two for the default.
 */
export const RESULT_PHASE = 'result';

/**
 * One published-name token then an assignment, which is the whole discriminator.
 *
 * The name spelling is `SPEC` §5's own — letters, digits and underscores, never
 * starting with a digit, with dots between segments — because a typed part's
 * target is a name a formula could write.
 *
 * **The negative lookahead is load-bearing rather than defensive.** Without it
 * `armour_class == 2` reads as a target, an operator `=` and an amount `= 2`, so
 * a comparison a reader wrote by mistake becomes an effect nothing can resolve
 * rather than a stray name they can see. `=` appears in the grammar only as `==`,
 * so one character of lookahead is the whole of what it takes.
 */
const ASSIGNMENT =
	/^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s*(\+=|=(?!=))/;

/**
 * Whether this text reads as an effect typed on a row rather than as a name.
 *
 * Exported for the name check in `parse/modifier-definitions.ts` and for §8's
 * promotion, which refuses the same two shapes at the moment the name is being
 * typed rather than in another pane afterwards.
 *
 * **Much narrower than the separator constraint**, and that is worth stating: the
 * assignment shape is forbidden only as the *whole start* of a name, so
 * `Ring of Protection +2` and `Bracers of Armor, Greater` are unaffected and the
 * shape that is refused — one bare identifier then `=` — is not a name any
 * surveyed system uses.
 */
export function readsAsAssignment(text: string): boolean {
	return ASSIGNMENT.test(text.trim());
}

/** Whether this text holds the separator, so no cell could spell it whole. */
export function holdsSeparator(text: string): boolean {
	return text.includes(MODIFIER_SEPARATOR);
}

/**
 * Why a name a cell could not spell is refused, or null where it could.
 *
 * **The messages live beside the predicates that produce them**, which is §1's
 * named trap read the way it means to be: *share the application, not just the
 * fact*. Extracting `holdsSeparator` and `readsAsAssignment` and leaving three
 * copies of each sentence written out is the same shape as extracting a grid
 * number and leaving the rule that applies it — and this feature had exactly three
 * copies of each, in the parser, in the writer and in the form.
 *
 * The concrete failure it closes: a design pass softens the semicolon sentence in
 * the parser, the layout editor's report shows the new wording, and the panel
 * where the reader is actually typing the name shows the old one. Three headers
 * claimed that could not happen — "reused verbatim, so a reader who meets the rule
 * twice meets one sentence" — and a comment is not something the next editor can
 * reuse.
 *
 * **Three shapes and not two**, because the blank name rests on the same argument:
 * a cell stores the name it was given, so a definition with none is one no row
 * could ever enrol in — there is nothing to write in the cell. That is this file's
 * fact as much as the other two are.
 *
 * Each message names the fix rather than the fault, and the assignment one names
 * both fixes, because a name shaped like an assignment is usually an author
 * reaching for the other tier.
 */
export function unspellableName(name: string): string | null {
	const chosen = name.trim();
	if (chosen === '') return 'Give it a name to reuse it by.';
	if (holdsSeparator(chosen)) {
		return `"${chosen}" cannot be a name, because a row separates the modifiers it applies with a semicolon. Rename it without one.`;
	}
	if (readsAsAssignment(chosen)) {
		return `"${chosen}" cannot be a name, because a row spells its own modifiers that way. Rename it, or write it as a modifier's Changes and Amount instead.`;
	}
	return null;
}

/** One part of a cell: a definition's name, or the effect the row spells out. */
export type ModifierPart =
	/** The name of one of the layout's definitions, as the cell spells it. */
	| { kind: 'named'; name: string }
	/** An effect typed on this row, which nothing else on the sheet holds. */
	| { kind: 'typed'; effect: TypedEffect };

/**
 * The parts a cell holds, in its own order: split, trimmed, empties dropped, and
 * **nothing collapsed**.
 *
 * **This is the write list, and `cellParts` below is the read list.** The two are
 * separate functions because §6 says the repeat collapse "is a read and never a
 * write", and a single list cannot be both: a commit rewrites one part and
 * re-joins the others *as their own stored text*, so a list with a repeat already
 * dropped out of it deletes a part the reader never touched on an unrelated edit.
 * The numbers never move when that happens — a repeat was one enrolment either way
 * — which is exactly why it needs a function of its own rather than a comment.
 *
 * So: this addresses a cell's *parts*, and every index into it is an index into
 * the note. `cellParts` addresses a row's *enrolments*.
 */
export function storedParts(cell: string): readonly string[] {
	const parts: string[] = [];
	for (const raw of cell.split(MODIFIER_SEPARATOR)) {
		const part = raw.trim();
		if (part !== '') parts.push(part);
	}
	return parts;
}

/**
 * The enrolments a cell makes: `storedParts`, with the first of a repeated
 * *named* part kept.
 *
 * **Read tolerantly, and never written back unbidden.** `A ;B`, `A;;B`, `A ; B`
 * and `A;B` all give the same two parts, and `armour_class+=2`,
 * `armour_class  +=  2` and `armour_class += 2` all give the same effect — and
 * every one of them keeps exactly the bytes a hand-editor typed, because
 * `parse/table.ts` rewrites only the cells whose text actually changed. So a
 * tolerant read costs nothing and Constraint 3 holds without a normalising pass
 * for byte identity to be measured against.
 *
 * **A repeated named part is one enrolment; two identical typed parts are two
 * effects.** Two pushes of one definition would reach the stacking rule as two
 * lines with the second suppressed as "another item bonus of the same size
 * applies" — a true sentence about a typo, and noise. Two identical typed parts
 * are not references to one thing: a reader who typed the same effect twice has
 * two effects, which the stacking rule will then say something true about.
 * Collapsing is a read and never a write.
 *
 * **Named for what it answers rather than `namedParts`, which is what the feature
 * doc calls it.** The list holds typed parts too, and a name that says otherwise
 * is the one comment `PATTERNS.md` §9 says to fix by renaming instead. The doc's
 * own description of `namedParts` — "split, trim, drop empties" — is
 * `storedParts` above, and the two functions the doc conflated are the read/write
 * split §6 depends on.
 */
export function cellParts(cell: string): readonly string[] {
	const parts: string[] = [];
	const named = new Set<string>();
	for (const part of storedParts(cell)) {
		if (!readsAsAssignment(part)) {
			if (named.has(part)) continue;
			named.add(part);
		}
		parts.push(part);
	}
	return parts;
}

/**
 * The cell's parts with the one at `at` removed — **and with it every other part
 * that is the same enrolment.**
 *
 * **Remove acts on an enrolment, not on a byte range, and that is the whole of
 * this function.** A repeated *name* is one enrolment: the row applies it once,
 * the glyph counts it once, and the arithmetic sees it once. So a reader who
 * presses **Remove** on one of two identical names and gets the modifier back is
 * not looking at a subtle case — they pressed the only control there is and the
 * row went on applying the thing. Dropping one byte range at a time is the
 * mechanism that produced it.
 *
 * **It does not reintroduce the byte loss it looks like.** The rule that a repeated
 * part is never *written back* is about an unrelated edit: committing one field
 * re-joins every other part as its own stored text, twins included. This is the one
 * gesture whose entire job is to take an enrolment off the row, and it is armed
 * before it commits.
 *
 * **Two identical typed parts are two effects and drop one at a time**, which is
 * the same asymmetry `cellParts` draws: they are not references to one thing, so
 * there is no single enrolment to remove.
 */
export function withoutPart(
	parts: readonly string[],
	at: number,
): readonly string[] {
	const going = parts[at];
	if (going === undefined) return parts;
	if (readsAsAssignment(going)) {
		return parts.filter((_, index) => index !== at);
	}
	return parts.filter(
		(part, index) => index !== at && !(part === going && !readsAsAssignment(part)),
	);
}

/**
 * How a cell is written once one of its parts has changed.
 *
 * Canonical, and in the cell's own order: a new part is appended rather than
 * sorted into place, because the order a reader put them in is theirs and
 * reordering stored text is a correction §10 forbids as surely as deleting it.
 *
 * **The caller passes every part's own stored text and replaces only the one it
 * edited**, which is Constraint 3's one new rule: a commit rewrites only the part
 * the reader edited and re-joins the others byte for byte. Joining a *re-spelled*
 * list would canonicalise a cell's other parts as a side effect of an unrelated
 * edit, which §10 forbids. This function is only the join; the rule lives at the
 * call site, where the stored texts are.
 */
export function spellParts(parts: readonly string[]): string {
	return parts.join(`${MODIFIER_SEPARATOR} `);
}

/**
 * Where a clause keyword sits in an amount, scanning from the right and ignoring
 * anything inside parentheses.
 *
 * **A space on both sides and outside parens**, which is the whole of the rule.
 * Neither ` as ` nor ` when ` is a token in the expression grammar, so neither can
 * appear in a well-formed amount — the one collision is a *column heading*
 * literally spelled `as` or `when` used as a bare amount, which `SPEC` §5 makes
 * reachable because a row expression may read a column by heading.
 * `armour_class += (when)` escapes it, and that is the whole of the hazard.
 *
 * From the right, because the clauses are keyworded from the back and an amount
 * may legitimately contain a name whose text ends in one of them.
 */
function clauseAt(text: string, keyword: string): number {
	const needle = ` ${keyword} `;
	let depth = 0;
	/** Paren depth per index, so the scan from the right knows where it is. */
	const depths: number[] = [];
	for (const character of text) {
		depths.push(depth);
		if (character === '(') depth += 1;
		else if (character === ')') depth = Math.max(0, depth - 1);
	}
	for (let at = text.length - needle.length; at >= 0; at -= 1) {
		if (text.startsWith(needle, at) && depths[at] === 0) return at;
	}
	return -1;
}

/**
 * Read one part of a cell.
 *
 * **Total, and it never fails.** Every part is a typed effect or a name, so there
 * is no third answer and no error channel: the discriminator decides, and
 * anything the layout does not declare is a stray that the sheet renders rather
 * than corrects.
 *
 * **A blank amount is a typed effect and not a refusal.** `armour_class +=` is an
 * unfinished effect: it changes nothing and is not an error, which is `SPEC` §10's
 * "a section without a data block is empty, not malformed" read one level down and
 * is what makes the form safe to commit one field at a time.
 */
export function parseModifierPart(part: string): ModifierPart {
	const text = part.trim();
	const head = ASSIGNMENT.exec(text);
	if (head === null) return { kind: 'named', name: text };
	const target = head[1] as string;
	const operator: ModifierOperator = head[2] === SETS ? 'override' : 'add';
	let rest = text.slice(head[0].length);

	let when: string | undefined;
	const at = clauseAt(rest, 'when');
	if (at >= 0) {
		when = rest.slice(at + ' when '.length).trim();
		rest = rest.slice(0, at);
	}
	let bonusType: string | undefined;
	const as = clauseAt(rest, 'as');
	if (as >= 0) {
		bonusType = rest.slice(as + ' as '.length).trim();
		rest = rest.slice(0, as);
	}
	/*
	 * **The phase clause, and it is the one clause that checks its own value.**
	 * ` as ` and ` when ` take arbitrary text, so finding the keyword is enough to
	 * know a clause is there. ` to ` cannot borrow that: it is a common word, and
	 * an amount reading a column headed `to` — which `SPEC` §5 makes reachable,
	 * since a row expression may read a column by heading — would otherwise lose
	 * everything after it. Only `result` is ever spelled, so anything else after
	 * the keyword means this was never a phase clause and the text stays in the
	 * amount where it was written.
	 */
	let applies: ModifierPhase | undefined;
	const to = clauseAt(rest, 'to');
	if (to >= 0 && rest.slice(to + ' to '.length).trim() === RESULT_PHASE) {
		applies = 'result';
		rest = rest.slice(0, to);
	}

	return {
		kind: 'typed',
		effect: {
			target,
			operator,
			amount: rest.trim(),
			...(applies !== undefined ? { applies } : {}),
			...(bonusType !== undefined && bonusType !== '' ? { bonusType } : {}),
			...(when !== undefined && when !== '' ? { when } : {}),
		},
	};
}

/**
 * How a typed effect is written into a cell: single spaces, blank clauses
 * omitted.
 *
 * `spellTypedEffect` then `parseModifierPart` is the round trip that holds this
 * design together — one spelling, one parse, and the form and the number cannot
 * disagree about what `armour_class += 2 as item when Worn` means.
 *
 * A blank amount spells as `armour_class +=`, with no trailing space, which is
 * exactly what parses back as an unfinished effect.
 */
export function spellTypedEffect(effect: TypedEffect): string {
	const said = [effect.target, effect.operator === 'override' ? SETS : ADDS_TO];
	const amount = effect.amount.trim();
	if (amount !== '') said.push(amount);
	/*
	 * Spelled only for the result phase, and never on an override — which already
	 * replaces the published number and so is in that phase by construction.
	 * The value phase is the absent clause, so every cell written before phases
	 * existed round-trips byte for byte (Constraint 3).
	 */
	if (effect.applies === 'result' && effect.operator !== 'override') {
		said.push('to', RESULT_PHASE);
	}
	const bonusType = (effect.bonusType ?? '').trim();
	if (bonusType !== '') said.push('as', bonusType);
	const when = (effect.when ?? '').trim();
	if (when !== '') said.push('when', when);
	return said.join(' ');
}
