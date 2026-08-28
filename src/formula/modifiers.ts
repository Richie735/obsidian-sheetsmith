/*
 * The sheet-wide modifier table (SPEC §5).
 *
 * The third sibling of sheet.ts. That file answers "what is this name worth?",
 * rows.ts answers "which rows does this component hold?", and this one answers
 * "what has been pushed at this name, and what is it made of?".
 *
 * One job, and the whole of it: turn the pushes every component declares into
 * one number and one breakdown per target. Lazy, memoised and re-entry-guarded,
 * against a live sheet. *Whether* anything could be pushed at a given name is a
 * different question against a different input, answered by
 * `modifier-targets.ts` — this file held both until a reader could not state its
 * job without an "and" (`PATTERNS.md` §1).
 *
 * **The authoring experience is push and the engine stays pull.** A modifier row
 * names its target, so the target names no source however many rows push at it;
 * what the target's own formula reads is `mod.self`, which is an ordinary name in
 * the ordinary name table, behind the ordinary guard. That is what buys the one
 * thing the closest prior art does not have: no second evaluation pass, and so no
 * ordering to get wrong. Foundry's dnd5e#3900 — an effect adding to a derived
 * `.mod` and silently doing nothing, because effects are applied before
 * `prepareDerivedData` runs — has an entire widely-installed module existing to
 * add the pass it needs. Here `derived` on a Card, `compute` on a `ScopeEntry`
 * and a Table column's `total` are all derived, so this project would be *more*
 * exposed to that bug than Foundry is.
 *
 * **A `mod.` entry is not a `ScopeEntry` and answers to no `.value`.** That rule
 * is what keeps SPEC §13's published-name depth question closed: `mod.abilities.DEX`
 * is not a component publishing a two-dot key, it is the sheet publishing a
 * reserved namespace, so nothing here can collide with the `.value` every
 * published entry already answers to.
 *
 * Pure, like its siblings: Constraint 5 holds, and `parse/layout.ts` imports the
 * reserved-id constant from here rather than spelling it twice.
 */

import { ModifierLine, ModifierPush } from '../types';
import { inRowMessage, roundSum } from './expression';

/**
 * The reserved top-level namespace every slot sits under.
 *
 * Also a component id no layout may keep, and that is the same fact rather than
 * two: `buildSheetScope` registers `${id}` and `${id}.${name}` into the same flat
 * table the slots go into, so a component with this id would register `mod.DEX`
 * beside `mod.armour_class` and one name would mean two things.
 *
 * **Migrated rather than refused**, by the path `migrateId` already owns.
 * SPEC §5's precedent is the hyphenated id — an unreferencable id is one nothing
 * can be pointing at, and blanking a whole sheet over it would not be safe —
 * and here the same three things hold: a note is keyed by `label` and not by
 * `id`, so no character data moves (Constraint 4); a formula that said `mod` was
 * already ambiguous between a component and a library function, so nothing
 * well-formed breaks; and nothing is released, so no layout in the wild holds it.
 */
export const MODIFIER_NAMESPACE = 'mod';

/**
 * What a formula writes to read what has been pushed at the name its own result
 * becomes.
 *
 * The relative spelling is not a convenience. A Card can spell its own target,
 * because its `derived` is published under its bare id — but **a Card set
 * cannot**: its `derived` is one formula computed per entry, and no name in that
 * formula can say which entry it is running for. Without this the six ability
 * scores, which are the canonical modifier target in every system surveyed,
 * could not be modified at all, and "+2 STR from a Belt of Giant Strength" is the
 * feature's headline case.
 *
 * `self` is already the contract's word for the name a component publishes under
 * its bare id (`ScopeValues.self`), so the vocabulary is reused rather than
 * invented.
 */
export const SELF_SLOT = `${MODIFIER_NAMESPACE}.self`;

/**
 * The slot a published name's modifiers are registered under.
 *
 * **It does not collide with a layout's own `mod()`.** Checked against the
 * tokenizer: `mod.self` and `mod.armour_class` each tokenise as *one* name token,
 * while `mod(score)` is a bare `mod` token followed by `(`, which `parsePrimary`
 * turns into a `call` node. A no-argument `mod = 3` in a library is untouched
 * too, because bare `mod` is never registered in the name table — only
 * `mod.<something>` is. The two live side by side with no rule needed, which is
 * worth stating because every 5e layout writes `mod(score)`.
 */
export function modifierSlot(name: string): string {
	return `${MODIFIER_NAMESPACE}.${name}`;
}

/** What a slot is worth, or the row that stopped it being worth anything. */
export type ModifierResult =
	| { total: number; lines: readonly ModifierLine[] }
	| { error: string };

/**
 * Ask what has been pushed at one published name.
 *
 * `RowLookup`'s shape, and for its reasons: failure is a value here and never a
 * throw (PATTERNS §4), so the slot's thunk gets a reason it can put in front of
 * a reader and throws that itself.
 *
 * A name nothing pushes at is `{ total: 0, lines: [] }` rather than a miss, on
 * the aggregate's own empty-set rule: without it every target's formula would
 * break on every character who owns no magic items, which is every character on
 * the day they are made. A name the sheet does not publish never reaches here at
 * all — no slot is registered for one, so `mod.armor_class` on a sheet spelling
 * it `armour_class` fails as an unknown name rather than quietly reading zero.
 */
export type ModifierLookup = (name: string) => ModifierResult;

/** A component as the modifier table sees it: an id, and pushes or none. */
export interface ModifierComponent {
	/** The component's layout id, for wherever a message has to name one. */
	id: string;
	/**
	 * Builds this component's pushes. Called at most once per sheet, since the
	 * table memoises the whole walk.
	 *
	 * Absent where the component declares none, which is every component but one
	 * — and every component is listed either way, so a component that declares
	 * nothing is on the sheet rather than missing from it.
	 */
	pushes?: () => readonly ModifierPush[];
}

const EMPTY: ModifierResult = { total: 0, lines: [] };

/**
 * Build the modifier lookup every slot on the sheet shares.
 *
 * One walk, memoised as a whole rather than per target: the pushes arrive keyed
 * by the *target* and not by the component, so there is no way to build one
 * target's set without running every component's source. The walk itself runs
 * each component's own resolver — the same `component.resolver?.(bound)` the name
 * table already builds for a `display` or a `compute` — so a computed amount
 * column resolves through exactly the path a published row's cell already
 * resolves through, including the row table's own memo and guard.
 *
 * **The walk is lazy and stays lazy.** SPEC §13's open question is which of the
 * two cycle guards wins a ring both could catch, and warming this table in a
 * fixed order before drawing would decide that by biasing it toward the name
 * table's guard. So a slot is entered exactly as any other published name is.
 */
export function buildModifierTable(
	components: readonly ModifierComponent[],
): ModifierLookup {
	/**
	 * Every push by target, once the walk has produced a set nothing refused.
	 *
	 * **Held only where every amount resolved**, which is `buildSheetScope`'s own
	 * rule about its memo: an amount reading an aggregate over the table its own
	 * row lives in can be refused while a row walk is in flight and resolve
	 * perfectly once it is not, so holding the refusal would decide every slot on
	 * the sheet by which formula happened to be evaluated first. A genuine cycle
	 * still terminates on the guards below and simply recomputes its own refusal.
	 */
	let held: ReadonlyMap<string, ModifierPush[]> | null = null;
	/** Slots already stacked, on the same terms: only what resolved. */
	const stacked = new Map<string, ModifierResult>();
	/**
	 * Whether the walk is already running.
	 *
	 * **The third guard on this sheet**, beside the name table's and the row
	 * table's, and it is not optional: a modifier's amount is a formula like any
	 * other, so it may read `mod.X` itself, and answering that would mean building
	 * the pushes from inside the pass that is building them. Without this the walk
	 * re-enters itself. Refused rather than answered with a zero, because **one
	 * number per target is what keeps the single pass** and an amount that depends
	 * on a modifier total is asking for a second one.
	 *
	 * **What it refuses is wider than a cycle, and whether it fires at all depends
	 * on evaluation order.** Measured, not reasoned: an amount reading a *different*
	 * target's slot, with no ring anywhere, is refused when the slot is asked cold
	 * — and resolves when anything has walked first, because that earlier walk
	 * failed on the *name* table's guard instead, memoised the other slot, and left
	 * the push set uncached for this walk to rebuild against a memo that now has an
	 * answer. So the outcome turns on which card drew first.
	 *
	 * That is the same cost SPEC §5 already records for the two existing guards —
	 * "a `?` whose appearance depends on grid order" — and it is left alone for the
	 * same reason: the fix is warming the table in a fixed order, which is
	 * precisely what this feature may not do, since it would decide which guard
	 * wins a ring both could catch (SPEC §13).
	 */
	let walking = false;

	const walk = (): ReadonlyMap<string, ModifierPush[]> => {
		const found = new Map<string, ModifierPush[]>();
		for (const component of components) {
			for (const push of component.pushes?.() ?? []) {
				const target = push.target.trim();
				// A blank target pushes nothing and is not an error: on an inventory
				// with a target column most rows are blank, and that is the ordinary
				// case rather than a degenerate one.
				if (target === '') continue;
				const already = found.get(target);
				if (already === undefined) found.set(target, [push]);
				else already.push(push);
			}
		}
		return found;
	};

	return (name) => {
		const done = stacked.get(name);
		if (done !== undefined) return done;
		let table = held;
		if (table === null) {
			if (walking) {
				// Says only what has been established. It used to assert that "one of
				// them is waiting on the total it is part of", which is false
				// whenever the amount read a *different* target's slot — the common
				// shape of this refusal, and the one that sends a reader looking for
				// a self-reference that is not there.
				return {
					error: `A modifier's own amount reads "${modifierSlot(name)}", and the modifiers on this sheet are still being worked out, so there is no total to give it yet. Give the amount a plain number, or read the value being modified rather than what was pushed at it.`,
				};
			}
			walking = true;
			try {
				table = walk();
			} finally {
				walking = false;
			}
			const refused = [...table.values()].some((pushes) =>
				pushes.some((push) => push.unreadable !== undefined),
			);
			if (!refused) held = table;
		}
		const pushes = table.get(name);
		if (pushes === undefined) return EMPTY;
		const result = stackModifiers(pushes);
		if (!('error' in result)) stacked.set(name, result);
		return result;
	};
}

/**
 * The table for the paths with no sheet around them: a component rendered on its
 * own, a formula evaluated in a test. Every slot is empty, which is the truth
 * there — nothing pushes, because there is nothing to push.
 */
export const NO_MODIFIERS: ModifierLookup = buildModifierTable([]);

/**
 * Combine the pushes at one target into one number and one breakdown.
 *
 * **Typed: the best bonus and the worst penalty of a type apply, and types add.**
 * This is the finding the design most had to survive. Pathfinder 2e types every
 * bonus as circumstance, item or status, and for the same type "you can use only
 * the highest bonus on a given roll"; D&D 5e does it for the same spell cast
 * twice, "the most potent effect… applies"; Lancer rolls the maximum of its
 * Accuracy dice. Three of four systems surveyed combine by maximum somewhere, and
 * **a per-modifier operator cannot express it**, because whether a given +2
 * applies depends on what else is present. So the rule belongs to the set rather
 * than to any one modifier.
 *
 * **"Highest within a type" is wrong for penalties**, which is why the arithmetic
 * is spelled out: the largest positive amount *plus* the smallest negative one,
 * per type, summed over the types. That is PF2e's actual rule, and applying
 * "highest" naively to negatives would have kept the *weakest* penalty, which is
 * the opposite of what every system says.
 *
 * **Untyped modifiers all stack**, each its own kind rather than all one kind.
 * That is what PF2e says and what the default has to be: with no types declared
 * anywhere the feature is plain addition, which is what an author who has never
 * heard of bonus types expects.
 *
 * **No priority field, and that is a property rather than a hand-wave.** Max, min
 * and `+` are all commutative and associative, so the result does not depend on
 * the order the pushes are walked in — asserted by shuffling rather than argued.
 * The sum runs through `roundSum`, the helper the totals row and `sum()` already
 * share, so the breakdown's total, the number on the card and a formula reading
 * the slot cannot disagree about `0.30000000000000004`.
 */
export function stackModifiers(
	pushes: readonly ModifierPush[],
): ModifierResult {
	for (const push of pushes) {
		// One unreadable amount refuses the whole slot, and the message names the
		// row: that is the aggregate's rule exactly — a quietly wrong number is
		// worse than a missing one — and it is why this is an error rather than a
		// push worth zero.
		if (push.unreadable !== undefined) {
			return { error: inRowMessage(push.label, push.unreadable) };
		}
	}

	/** The winning bonus and penalty per declared type, by amount. */
	const best = new Map<string, number>();
	const worst = new Map<string, number>();
	for (const push of pushes) {
		const amount = push.amount ?? 0;
		// Zero neither pushes nor suppresses anything: a breakdown is about what
		// changed the number.
		if (amount === 0 || push.type === null) continue;
		if (amount > 0) {
			best.set(push.type, Math.max(best.get(push.type) ?? amount, amount));
		} else {
			worst.set(push.type, Math.min(worst.get(push.type) ?? amount, amount));
		}
	}

	/** Which type's winner has already been spent, so a tie takes the first. */
	const taken = new Set<string>();
	const lines: ModifierLine[] = [];
	let total = 0;
	for (const push of pushes) {
		const amount = push.amount ?? 0;
		if (amount === 0) continue;
		const type = push.type;
		if (type === null) {
			lines.push({
				label: push.label,
				source: push.source,
				type,
				amount,
				suppressed: null,
			});
			total += amount;
			continue;
		}
		const winner = (amount > 0 ? best.get(type) : worst.get(type)) ?? amount;
		const kind = amount > 0 ? 'bonus' : 'penalty';
		const slot = `${type} ${kind}`;
		if (amount === winner && !taken.has(slot)) {
			taken.add(slot);
			lines.push({
				label: push.label,
				source: push.source,
				type,
				amount,
				suppressed: null,
			});
			total += amount;
			continue;
		}
		lines.push({
			label: push.label,
			source: push.source,
			type,
			amount,
			// Two wordings because only one of them is true. A tie is not a larger
			// modifier, and telling a reader one applies would send them hunting
			// for a number that is not there.
			suppressed:
				amount === winner
					? `another ${slot} of the same size applies`
					: `a larger ${slot} applies`,
		});
	}
	return { total: roundSum(total), lines };
}
