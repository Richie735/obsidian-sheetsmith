/*
 * A grant of temporary points, folded onto what a buffer stores
 * (`docs/features/granted-temporary-points.md`).
 *
 * One job: given the grants the walk found aimed at one buffer, what the note
 * stores of the buffer and what it stores of each grant's spending, answer the
 * buffer the sheet draws and the account a door reads. The walk itself stays in
 * `modifiers.ts`, where a change aimed at a buffer is a fourth reduction of the
 * one walk, beside the slot, the notes and the states, and never reaches a slot
 * — so `mod.<target>` and a number's breakdown are untouched by one. Which
 * values are buffers is a fact the components state on `ScopeEntry`, collected
 * statically by `modifier-targets.ts`'s `bufferTargets`, as states are.
 *
 * **A grant is an At least, and nothing else is.** At least was already the
 * higher-wins operator, which is exactly the stacking rule a buffer has: two
 * grants of temporary points never add up, the highest applies (D1, D2). So the
 * cell grammar and both tiers are unchanged, and an Adds to or a Sets aimed at
 * a buffer is refused for that change alone.
 *
 * **The grant is never written.** What the component stores is how much of each
 * grant has been spent, keyed by the row that granted it (D5), so damage taken
 * through a grant survives a rebuild while the grant itself is worked out at
 * render, exactly as a level a modifier sets is.
 *
 * Pure, so Constraint 5 holds.
 */

import {
	BufferAccount,
	BufferShape,
	GrantLine,
	ModifierContext,
	ScopeEntry,
	ScopeValues,
	TintColour,
} from '../types';
import { OPERATOR_LABELS, TEXT } from '../en';
import { fencedKeyProblem } from '../parse/fenced';
import { ALREADY_HIGHER, suppressionWording } from './suppression-wording';

/**
 * Why a change aimed at a buffer may only be an At least (D2): the fault from
 * `src/en.ts`, the fix in the operators' own words, so a renamed operator
 * renames the advice. The one spelling the row popup, the modifier form and the
 * layout editor's report all show.
 */
export const BUFFER_TAKES_AT_LEAST = `${TEXT.bufferRefusesOperator} Choose ${OPERATOR_LABELS.upgrade}.`;

/**
 * What prefixes a spent record's fence key, which is what tells one from every
 * other entry the component preserves. Compared whole and never split, so a
 * label holding ` · ` is a key like any other.
 */
export const SPENT_PREFIX = 'spent · ';

/** The key a grant's spent record is held under: the component, then the row. */
export function grantKey(source: string, row: string): string {
	return `${source} · ${row}`;
}

/**
 * Why a grant's key cannot be a fence key, as the sentence its line reads, or
 * null where it can (D5). Refuses the grant alone: its amount is known, and
 * refusing the buffer over an item's name would blank the buffer for a reason
 * that is not about the buffer.
 *
 * **It names whichever half holds the character**, since the key is the
 * component's label and then the row's, and the fix is renaming that one: a
 * Table labelled `Gear: worn` refuses every row's grant, and telling the reader
 * to rename each row would send them to the wrong half.
 */
export function grantKeyProblem(source: string, row: string): string | null {
	if (fencedKeyProblem(`${SPENT_PREFIX}${grantKey(source, row)}`) === null) return null;
	if (fencedKeyProblem(row) !== null) {
		return `"${row}" cannot grant temporary points, because the pool keeps what is spent under the row's name and a sheet block cannot hold a colon or a line break. Rename the row without one.`;
	}
	return `"${row}" cannot grant temporary points, because the pool keeps what is spent under "${source}", and a sheet block cannot hold a colon or a line break. Rename that component without one in the layout editor.`;
}

/**
 * Whether a change is aimed at a buffer a grant may raise: a buffer's own name,
 * with no column (D3). One predicate for the walk, the row's popup, the layout
 * editor's report and both pickers, so none can call a change a grant that
 * another does not.
 */
export function aimsAtBuffer(
	buffers: ReadonlySet<string> | readonly { name: string }[],
	target: string,
	column: string | null | undefined,
): boolean {
	if ((column ?? '') !== '') return false;
	return 'has' in buffers ? buffers.has(target) : buffers.some((buffer) => buffer.name === target);
}

/**
 * What one change aimed at a buffer grants on one row, or why it grants nothing
 * (D2, D4, D5), in that order: the operator, then the key, then the points.
 * **The one verdict the walk and the row's popup both read**, so the two cannot
 * disagree about a refusal.
 */
export function grantVerdict(
	operator: string,
	amount: number | boolean,
	called: string,
	source: string,
	row: string,
): { key: string | null; amount: number | null; asked: number | boolean; refused: string | null } {
	const keyProblem = grantKeyProblem(source, row);
	const key = keyProblem === null ? grantKey(source, row) : null;
	if (operator !== 'upgrade') return { key, amount: null, asked: amount, refused: BUFFER_TAKES_AT_LEAST };
	if (keyProblem !== null) return { key, amount: null, asked: amount, refused: keyProblem };
	const points = grantPoints(amount, called);
	return 'points' in points
		? { key, amount: points.points, asked: amount, refused: null }
		: { key, amount: null, asked: amount, refused: points.reason };
}

/**
 * The points a stored text holds, or null where it holds none the rule reads:
 * a whole number of 0 or more. Empty is 0, a buffer holding nothing.
 *
 * **Stricter than the pill's own rule** (`docs/features/pool-temp-refuses.md`)
 * on one spelling, a negative, and deliberately. The pill settles a typed
 * negative by clamping it to 0 at the commit; a stored one, and a spent record,
 * is never rewritten, so here it is null and counts as none — the same 0 the
 * clamp would give the stored points, and for a record, which only a spend
 * ever writes, a hand edit that must not change what a grant has left.
 */
export function wholePoints(text: string | undefined): number | null {
	const raw = (text ?? '').trim();
	if (raw === '') return 0;
	const points = Number(raw);
	return Number.isInteger(points) && points >= 0 ? points : null;
}

/**
 * What one grant comes to as points, or why it grants nothing (D4). `called`
 * names the modifier in the sentence.
 *
 * **A negative grants nothing and is not refused**, which is the pill's own
 * rule that a negative buffer is clamped to 0: the amount is an expression, and
 * `level - 3` at level 1 is a grant of nothing rather than an error.
 */
export function grantPoints(amount: number | boolean, called: string): { points: number } | { reason: string } {
	if (typeof amount === 'number' && Number.isInteger(amount)) return { points: Math.max(0, amount) };
	return {
		reason: `"${String(amount)}" is not a whole number of points, so ${called} grants nothing. Give it a whole number, for example with floor().`,
	};
}

/** One grant as the walk found it, before the note's records are known. */
export interface FoundGrant {
	/** The record's key, or null where the row's label cannot be one. */
	key: string | null;
	label: string;
	source: string;
	definition?: string;
	/** Whole points, or null where the grant was refused. */
	amount: number | null;
	/**
	 * What the amount came to before it was judged, so a refused grant's line
	 * still says what it asked for (D5: its amount is known). Absent reads as
	 * `amount`.
	 */
	asked?: number | boolean;
	/** The refusal, where the grant grants nothing. */
	refused: string | null;
	inPlay?: boolean;
	tint?: TintColour;
}

/**
 * What the walk found at one buffer. The sheet adds what the note stores of
 * it, the buffer's own points and its records, so a reader with no note in hand
 * — a row's popup — can fold the grants as the pill does.
 */
export type BufferResult =
	| {
			lines: readonly FoundGrant[];
			stored?: string;
			spent?: Readonly<Record<string, string>>;
	  }
	| { error: string };

/**
 * What the walk found at one buffer, or null where nothing is declared there.
 * A declared buffer nothing addresses answers with no lines.
 */
export type BufferLookup = (name: string) => BufferResult | null;

/** The lookup with no sheet around it: nothing is declared, so nothing folds. */
export const NO_BUFFERS: BufferLookup = () => null;

/**
 * Fold the grants found at one buffer onto what the note stores (D6).
 *
 * For each grant, what is left of it is its amount less what the record says
 * was spent, floored at 0; the buffer is the highest of the stored points and
 * each remainder. **Ties go to the stored points first, then to walk order**, so
 * the value never depends on walk order and only which tied line is named in
 * effect does, which is §5's shuffle rule.
 *
 * A record no listed grant claims is a leftover (D10): listed, and folded into
 * nothing.
 */
export function foldBuffer(
	label: string,
	stored: string | undefined,
	spent: Readonly<Record<string, string>>,
	result: BufferResult,
): BufferAccount {
	const own = wholePoints(stored) ?? 0;
	if ('error' in result) {
		return { label, stored: own, effective: own, inEffect: null, grants: [], leftovers: [], error: result.error };
	}
	const listed = result.lines.map((found): GrantLine => {
		const text = found.key === null ? undefined : spent[found.key];
		const read = wholePoints(text);
		const record = read ?? 0;
		// A refused grant keeps the points it asked for, where they are whole, so
		// its line reads what it would grant; it is never live, so it moves nothing.
		const asked = found.asked ?? found.amount ?? 0;
		const amount =
			found.amount ?? (typeof asked === 'number' && Number.isInteger(asked) ? Math.max(0, asked) : 0);
		return {
			key: found.key,
			label: found.label,
			source: found.source,
			...(found.definition === undefined ? {} : { definition: found.definition }),
			amount,
			...(found.refused === null ? {} : { asked }),
			spent: record,
			left: Math.max(0, amount - record),
			...(read === null && text !== undefined ? { recordRefused: text } : {}),
			suppressed: found.refused,
			...(found.refused === null ? {} : { refused: true as const }),
			...(found.inPlay === true ? { inPlay: true } : {}),
			...(found.inPlay === true && found.tint !== undefined ? { tint: found.tint } : {}),
		};
	});
	const live = listed.filter((line) => line.refused === undefined);
	const effective = Math.max(own, ...live.map((line) => line.left));
	const winner = effective === own ? null : (live.find((line) => line.left === effective) ?? null);
	const grants = listed.map((line): GrantLine => {
		if (line.refused !== undefined || line === winner) return line;
		// Own in effect: every grant is beaten by the pool's own points. A grant
		// in effect: every other one is passed over by it, or ties it.
		const suppressed =
			winner === null
				? ALREADY_HIGHER
				: suppressionWording('grant', line.left === winner.left, 'value');
		return { ...line, suppressed };
	});
	const claimed = new Set(listed.map((line) => line.key).filter((key) => key !== null));
	const leftovers = Object.keys(spent)
		.filter((key) => !claimed.has(key))
		.map((key) => {
			const read = wholePoints(spent[key]);
			return read === null
				? { key, spent: 0, recordRefused: spent[key] ?? '' }
				: { key, spent: read };
		});
	return {
		label,
		stored: own,
		effective,
		inEffect: winner === null ? null : (grants[listed.indexOf(winner)] ?? null),
		grants,
		leftovers,
		error: null,
	};
}

/**
 * The same account against another stored buffer and other records: what the
 * pill draws once a spend or a typed value has moved what the note holds and
 * before the sheet has rebuilt. The grants are the walk's, so only their
 * remainders and verdicts move.
 */
export function refoldBuffer(
	account: BufferAccount,
	stored: string,
	spent: Readonly<Record<string, string>>,
): BufferAccount {
	if (account.error !== null) {
		const own = wholePoints(stored) ?? 0;
		return { ...account, stored: own, effective: own };
	}
	const found = account.grants.map((line): FoundGrant => ({
		key: line.key,
		label: line.label,
		source: line.source,
		...(line.definition === undefined ? {} : { definition: line.definition }),
		amount: line.refused === undefined ? line.amount : null,
		...(line.asked === undefined ? {} : { asked: line.asked }),
		refused: line.refused === undefined ? null : line.suppressed,
		...(line.inPlay === true ? { inPlay: true } : {}),
		...(line.tint === undefined ? {} : { tint: line.tint }),
	}));
	return foldBuffer(account.label, stored, spent, { lines: found });
}

/** Whether an account lists a grant that is raising, or could raise, the buffer. */
export function grantsActive(account: BufferAccount | null): boolean {
	return account !== null && account.error === null && account.grants.some((line) => line.refused === undefined);
}

/**
 * What a spend of `absorbed` points does to the stored buffer and each live
 * grant's record (D6): every one is drained by the amount absorbed, each floored
 * at 0, so the buffer after the spend is exactly the buffer less what it took.
 *
 * Pure, and from a fixed origin, so a step back up in one gesture is the same
 * call with a smaller amount: nothing is refunded by a second rule.
 */
export function drainBuffer(
	account: BufferAccount,
	absorbed: number,
): { stored: number; spent: ReadonlyMap<string, number> } {
	const spent = new Map<string, number>();
	for (const line of account.grants) {
		if (line.refused !== undefined || line.key === null) continue;
		spent.set(line.key, line.spent + Math.min(line.left, absorbed));
	}
	return { stored: Math.max(0, account.stored - absorbed), spent };
}

/** The buffer an account draws after a drain: the highest of what is left. */
export function drainedEffective(account: BufferAccount, absorbed: number): number {
	return Math.max(0, account.effective - absorbed);
}

/**
 * The keys of every grant listed at one buffer, or null where the buffer is
 * refused and nothing can say which grants are active (D7, D11).
 *
 * **What the view asks of the sheet a reader's edit produces**: a recorded grant
 * whose key is not here once the edit is applied has ended, and its record is
 * cleared in the same write. A passed-over grant is still active, since its
 * source is still on.
 */
export function activeGrantKeys(
	modifiers: Pick<ModifierContext, 'buffer'>,
	name: string,
): ReadonlySet<string> | null {
	const account = modifiers.buffer?.(name, undefined, {}) ?? null;
	if (account === null) return new Set();
	if (account.error !== null) return null;
	const keys = new Set<string>();
	for (const line of account.grants) {
		if (line.refused === undefined && line.key !== null) keys.add(line.key);
	}
	return keys;
}

/**
 * Every buffer a component's published values declare, by the name a grant's
 * target spells: the bare id for `self`, `<id>.<name>` for a named entry.
 */
export function bufferEntries(
	id: string,
	values: ScopeValues,
): readonly { name: string; buffer: BufferShape; entry: ScopeEntry }[] {
	const found: { name: string; buffer: BufferShape; entry: ScopeEntry }[] = [];
	if (values.self?.buffer !== undefined) {
		found.push({ name: id, buffer: values.self.buffer, entry: values.self });
	}
	for (const [key, entry] of Object.entries(values.named ?? {})) {
		if (entry.buffer !== undefined) found.push({ name: `${id}.${key}`, buffer: entry.buffer, entry });
	}
	return found;
}

/** What the note stores for a buffer's own points, as text. */
export function storedBuffer(entry: ScopeEntry): string | undefined {
	return entry.value === undefined ? undefined : String(entry.value);
}
