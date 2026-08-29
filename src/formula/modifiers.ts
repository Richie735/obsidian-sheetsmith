/*
 * The sheet-wide modifier table (SPEC §5).
 *
 * The third sibling of sheet.ts. That file answers "what is this name worth?",
 * rows.ts answers "which rows does this component hold?", and this one answers
 * "what has been pushed at this name, and what is it made of?".
 *
 * One job, and the whole of it: turn the enrolments every component declares into
 * one number and one breakdown per target. Lazy, memoised and re-entry-guarded,
 * against a live sheet. *Whether* anything could be pushed at a given name is a
 * different question against a different input, answered by
 * `modifier-targets.ts`; *what one enrolment comes to on its row* is a third,
 * answered by `modifier-definitions.ts`. This file held the first two until a
 * reader could not state its job without an "and" (`PATTERNS.md` §1), and the
 * third arrived with the definitions for the same reason.
 *
 * **The authoring experience is push and the engine stays pull.** A row enrols in
 * a definition that names its target, so the target names no source however many
 * rows push at it; what the target's own formula reads is `mod.self`, which is an
 * ordinary name in the ordinary name table, behind the ordinary guard. That is
 * what buys the one thing the closest prior art does not have: no second
 * evaluation pass, and so no ordering to get wrong. Foundry's dnd5e#3900 — an
 * effect adding to a derived `.mod` and silently doing nothing, because effects
 * are applied before `prepareDerivedData` runs — has an entire widely-installed
 * module existing to add the pass it needs. Here `derived` on a Card, `compute` on
 * a `ScopeEntry` and a Table column's `total` are all derived, so this project
 * would be *more* exposed to that bug than Foundry is.
 *
 * **The two phases are two reductions, not two evaluation passes**, and that
 * sentence is what keeps the override inside the shipped engine. There is still
 * one walk over the enrolments producing one contribution set per target; the
 * phases are two reductions of that one set, combined by one expression. Nothing
 * is evaluated twice, and there is no boundary for an ordering bug to live at.
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

import {
	ModifierDefinitionView,
	ModifierLine,
	ModifierOperator,
	ModifierOutcome,
	ModifierPhase,
	ModifierPush,
} from '../types';
import { FunctionEnv, inRowMessage, roundSum } from './expression';
import {
	Contribution,
	definitionTable,
	Enrolment,
	resolveEnrolment,
} from './modifier-definitions';

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
 *
 * **It is also the one condition an override reaches a target on**, which is the
 * rule that kept `modifier-targets.ts` untouched by the override: a value that
 * ignores additions ignores overrides, so there is one rule for a reader to hold
 * rather than two.
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
	| {
			/**
			 * The winning override, or null where nothing overrode the value.
			 *
			 * Asked for by the published name's own thunk and never by a formula:
			 * there is no spelling for it in the language, and there should not be,
			 * because "an override applies first" is a rule the engine owes rather
			 * than one an author should have to write.
			 */
			override: number | null;
			/** The value-phase total, which is what `mod.<name>` resolves to. */
			total: number;
			/**
			 * The result-phase total, added to the number the target's formula came
			 * to — the phase an override has always been in.
			 *
			 * Read only by the evaluation that becomes the published name, so a
			 * display-only field like a Card's `effective` shows the value phase
			 * alone and does not double-count what lands after the formula.
			 */
			resultTotal: number;
			lines: readonly ModifierLine[];
	  }
	| { error: string };

/**
 * Ask what has been pushed at one published name.
 *
 * `RowLookup`'s shape, and for its reasons: failure is a value here and never a
 * throw (PATTERNS §4), so the slot's thunk gets a reason it can put in front of
 * a reader and throws that itself.
 *
 * A name nothing pushes at is `{ override: null, total: 0, lines: [] }` rather
 * than a miss, on the aggregate's own empty-set rule: without it every target's
 * formula would break on every character who owns no magic items, which is every
 * character on the day they are made. A name the sheet does not publish never
 * reaches here at all — no slot is registered for one, so `mod.armor_class` on a
 * sheet spelling it `armour_class` fails as an unknown name rather than quietly
 * reading zero.
 */
export type ModifierLookup = (name: string) => ModifierResult;

/** A component as the modifier table sees it: an id, and enrolments or none. */
export interface ModifierComponent {
	/** The component's layout id, for wherever a message has to name one. */
	id: string;
	/**
	 * Builds this component's enrolments. Called at most once per sheet, since
	 * the table memoises the whole walk.
	 *
	 * Absent where the component declares none, which is every component but one
	 * — and every component is listed either way, so a component that declares
	 * nothing is on the sheet rather than missing from it.
	 */
	pushes?: () => readonly ModifierPush[];
}

const EMPTY: ModifierResult = {
	override: null,
	total: 0,
	resultTotal: 0,
	lines: [],
};

/**
 * The table for the paths with no sheet around them: a component rendered on its
 * own, a formula evaluated in a test. Every slot is empty, which is the truth
 * there — nothing pushes, because there is nothing to push.
 *
 * A constant rather than `buildModifierTable([])`, so this file never has to
 * reach for an environment it would then have to import `resolve.ts` for — and
 * `resolve.ts` imports this.
 */
export const NO_MODIFIERS: ModifierLookup = () => EMPTY;

/**
 * One resolved enrolment as the walk holds it: what it changes, and who said so.
 *
 * The push's own two strings travel with the contribution rather than being
 * looked up again, because they are what a breakdown line is made of and the
 * push is the only thing holding them.
 */
export interface Contributor extends Contribution {
	/** The row as a reader sees it. */
	label: string;
	/** The component the row lives on. */
	source: string;
	/**
	 * The modifier, as the layout spells its name, or absent where it has none.
	 *
	 * Not the push's spelling: `resolveEnrolment` has already matched the cell's
	 * text against the layout's, so the definition it found is the canonical name
	 * and is what every other surface shows.
	 *
	 * **Absent for an effect typed on the row**, which has no name and never will
	 * (§7's edge). The breakdown line then falls back to the row's own label, and
	 * the *outcome* half — `item +2`, `sets to 18` — is what tells two typed lines
	 * on one row apart.
	 */
	definition?: string;
}

/** A refusal, held against the target it refuses. */
interface Refused {
	label: string;
	reason: string;
}

/** Everything one walk found, keyed by the name it was aimed at. */
interface Walked {
	applied: Map<string, Contributor[]>;
	refused: Map<string, Refused>;
}

/**
 * Build the modifier lookup every slot on the sheet shares.
 *
 * One walk, memoised as a whole rather than per target: the enrolments arrive
 * keyed by the *definition* and resolve to a target, so there is no way to build
 * one target's set without running every component's source. The walk itself runs
 * each component's own resolver — the same `component.resolver?.(bound)` the name
 * table already builds for a `display` or a `compute` — so a computed column in a
 * modifier row's scope resolves through exactly the path a published row's cell
 * already resolves through, including the row table's own memo and guard.
 *
 * **The walk is lazy and stays lazy.** SPEC §13's open question is which of the
 * two cycle guards wins a ring both could catch, and warming this table in a
 * fixed order before drawing would decide that by biasing it toward the name
 * table's guard. So a slot is entered exactly as any other published name is.
 */
export function buildModifierTable(
	components: readonly ModifierComponent[],
	definitions: readonly ModifierDefinitionView[],
	/**
	 * What a definition's expressions are evaluated with: the layout's functions,
	 * the sheet as the row's names layer over, and the row table an amount may
	 * aggregate through. A `FunctionEnv` rather than the sheet-wide environment,
	 * so this file stays upstream of `resolve.ts`.
	 */
	calls: FunctionEnv = {},
): ModifierLookup {
	const table = definitionTable(definitions);
	/**
	 * Every contribution by target, once the walk has produced a set nothing
	 * refused.
	 *
	 * **Held only where every amount resolved**, which is `buildSheetScope`'s own
	 * rule about its memo: an amount reading an aggregate over the table its own
	 * row lives in can be refused while a row walk is in flight and resolve
	 * perfectly once it is not, so holding the refusal would decide every slot on
	 * the sheet by which formula happened to be evaluated first. A genuine cycle
	 * still terminates on the guards below and simply recomputes its own refusal.
	 */
	let held: Walked | null = null;
	/** Slots already reduced, on the same terms: only what resolved. */
	const stacked = new Map<string, ModifierResult>();
	/**
	 * Whether the walk is already running.
	 *
	 * **The third guard on this sheet**, beside the name table's and the row
	 * table's, and it is not optional: a definition's amount is a formula like any
	 * other, so it may read `mod.X` itself, and answering that would mean building
	 * the contributions from inside the pass that is building them. Without this
	 * the walk re-enters itself. Refused rather than answered with a zero, because
	 * **one number per target is what keeps the single pass** and an amount that
	 * depends on a modifier total is asking for a second one.
	 *
	 * **What it refuses is wider than a cycle, and whether it fires at all depends
	 * on evaluation order.** Measured, not reasoned: an amount reading a *different*
	 * target's slot, with no ring anywhere, is refused when the slot is asked cold
	 * — and resolves when anything has walked first, because that earlier walk
	 * failed on the *name* table's guard instead, memoised the other slot, and left
	 * the contribution set uncached for this walk to rebuild against a memo that
	 * now has an answer. So the outcome turns on which card drew first.
	 *
	 * That is the same cost SPEC §5 already records for the two existing guards —
	 * "a `?` whose appearance depends on grid order" — and it is left alone for the
	 * same reason: the fix is warming the table in a fixed order, which is
	 * precisely what this feature may not do, since it would decide which guard
	 * wins a ring both could catch (SPEC §13).
	 */
	let walking = false;

	const walk = (): Walked => {
		const applied = new Map<string, Contributor[]>();
		const refused = new Map<string, Refused>();
		for (const component of components) {
			for (const push of component.pushes?.() ?? []) {
				// A blank part enrols in nothing and is not an error: on an
				// inventory with a modifier column most rows are blank, and that is
				// the ordinary case rather than a degenerate one.
				if (push.part.trim() === '') continue;
				const found = resolveEnrolment(table, push.part, push.row, calls);
				/*
				 * A stray reference, an inactive row and an unfinished typed effect
				 * all contribute nothing and none of them is an error: the first is
				 * §4.2's "rendered, not corrected", the second is the condition doing
				 * its job, and the third is a cell the reader has not finished
				 * typing. All three are said at the row, which is where the reader is
				 * looking, and none of them may refuse a slot — an unfinished effect
				 * that refused would blank a card mid-keystroke.
				 */
				if (
					found.kind === 'unknown' ||
					found.kind === 'inactive' ||
					found.kind === 'unfinished'
				) {
					continue;
				}
				const target = found.fields.target;
				if (target === '') continue;
				if (found.kind === 'unreadable') {
					// The first refusal wins, so the message names one row rather
					// than however many the reader has to read past.
					if (!refused.has(target)) {
						refused.set(target, {
							label: push.row.label,
							reason: found.reason,
						});
					}
					continue;
				}
				const line: Contributor = {
					...found.contribution,
					label: push.row.label,
					source: push.source,
					// The layout's name where the part named one, and nothing where
					// the row typed its own: a push carries no tier and neither does
					// the arithmetic, so this is the only place the two differ.
					...(found.definition === null
						? {}
						: { definition: found.definition.name }),
				};
				const already = applied.get(target);
				if (already === undefined) applied.set(target, [line]);
				else already.push(line);
			}
		}
		return { applied, refused };
	};

	return (name) => {
		const done = stacked.get(name);
		if (done !== undefined) return done;
		let found = held;
		if (found === null) {
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
				found = walk();
			} finally {
				walking = false;
			}
			if (found.refused.size === 0) held = found;
		}
		const stopped = found.refused.get(name);
		if (stopped !== undefined) {
			// One unreadable amount refuses the whole slot, and the message names
			// the row: that is the aggregate's rule exactly — a quietly wrong number
			// is worse than a missing one — and it is why this is an error rather
			// than a contribution worth zero.
			return { error: inRowMessage(stopped.label, stopped.reason) };
		}
		const contributions = found.applied.get(name);
		if (contributions === undefined) return EMPTY;
		const result = stackModifiers(contributions);
		stacked.set(name, result);
		return result;
	};
}

/** What a suppressed contributor's parenthetical says, in one place. */
function suppressionWording(
	kind: string,
	tied: boolean,
	/** "value" for an override, "size" for an amount that stacks. */
	measure: 'value' | 'size',
): string {
	// Two wordings because only one of them is ever true. A tie is not a larger
	// modifier, and telling a reader one applies would send them hunting for a
	// number that is not there.
	return tied
		? `another ${kind} of the same ${measure} applies`
		: measure === 'value'
			? `a higher ${kind} applies`
			: `a larger ${kind} applies`;
}

/** What a typed contribution contests for: its type and its direction. */
function contest(type: string, amount: number): string {
	return `${type} ${amount > 0 ? 'bonus' : 'penalty'}`;
}

/**
 * Combine the contributions at one target into one number and one breakdown.
 *
 * **Two fixed named phases, and no priority integer.** Phase one resolves
 * overrides: the highest wins, and every other one is listed saying so. Phase two
 * resolves the typed additive stacking below. The published name's own thunk then
 * combines them — `override + total` where one applies, and the formula's own
 * result plus `total` where none does — so the owner's arithmetic falls out:
 * override 18, addition +1, result 19.
 *
 * Foundry carried a user-facing priority integer for thirteen major versions and
 * added phases in v14 precisely to "avoid priority competition"; CSB applies
 * `set` first and addition last; and dnd5e#6622 is an open bug from a user
 * hitting Foundry's opposite default, arguing a Bless `+1d4` "should stack on top
 * of the overridden attack bonus". **Why two phases are enough** is that each
 * reduces to one number, so there is nothing to sequence within either — which is
 * the property to check any future operator against. A multiply does not have it,
 * which is where the priority integer comes back.
 *
 * **Typed additions: the best bonus and the worst penalty of a type apply, and
 * types add.** This is the finding the design most had to survive. Pathfinder 2e
 * types every bonus as circumstance, item or status, and for the same type "you
 * can use only the highest bonus on a given roll"; D&D 5e does it for the same
 * spell cast twice, "the most potent effect… applies"; Lancer rolls the maximum
 * of its Accuracy dice. Three of four systems surveyed combine by maximum
 * somewhere, and **a per-modifier operator cannot express it**, because whether a
 * given +2 applies depends on what else is present. So the rule belongs to the
 * set rather than to any one modifier.
 *
 * **"Highest within a type" is wrong for penalties**, which is why the arithmetic
 * is spelled out: the largest positive amount *plus* the smallest negative one,
 * per type, summed over the types. That is PF2e's actual rule, and applying
 * "highest" naively to negatives would have kept the *weakest* penalty, which is
 * the opposite of what every system says.
 *
 * **Untyped additions all stack**, each its own kind rather than all one kind.
 * That is what PF2e says and what the default has to be: with no types declared
 * anywhere the feature is plain addition, which is what an author who has never
 * heard of bonus types expects.
 *
 * **Zero means two different things and both are honoured.** An addition of 0
 * changes nothing and appears in no breakdown, which is the shipped rule. An
 * **override to 0 is a value** — "set to zero" is a real effect — so it is listed
 * and it contests.
 *
 * **No priority field, and that is a property rather than a hand-wave.** Max, min
 * and `+` are all commutative and associative, so neither phase's result depends
 * on the order the enrolments are walked in — asserted by shuffling rather than
 * argued, over both phases. The sum runs through `roundSum`, the helper the totals
 * row and `sum()` already share, so the breakdown's total, the number on the card
 * and a formula reading the slot cannot disagree about `0.30000000000000004`.
 *
 * Lines come out in declaration order, overrides and additions alike: a
 * breakdown is the number's story told in the order the reader's rows are in, and
 * an override's line says "sets to" rather than needing a place in the list to
 * say what it is.
 */
/**
 * Which phase one enrolment lands in.
 *
 * Absent is `value`, and the default is load-bearing rather than tidy: every
 * modifier in every layout and every note written before the phase existed says
 * nothing, and all of them must go on meaning what `mod.self` has always meant.
 */
function phaseOf(entry: { applies?: ModifierPhase }): ModifierPhase {
	return entry.applies === 'result' ? 'result' : 'value';
}

export function stackModifiers(
	contributions: readonly Contributor[],
): ModifierResult {
	/*
	 * Phase one. The winner is the highest, and 0 is a value here where it is
	 * nothing in phase two: an override to 0 sets a number, and refusing to list
	 * it would leave a reader with a zero nobody claims.
	 */
	let override: number | null = null;
	for (const entry of contributions) {
		if (entry.operator !== 'override') continue;
		override = override === null ? entry.amount : Math.max(override, entry.amount);
	}

	/*
	 * **A type contests within its phase and not across it**, which is why every
	 * key below carries the phase. An item bonus to a Strength *score* and an item
	 * bonus to a Strength *check* are two different quantities that happen to share
	 * a word; contested together, a belt would silently suppress a blessing that
	 * lands somewhere else entirely, and the breakdown would tell the reader a
	 * larger bonus of the same type applied while pointing at a number it never
	 * touched. Keying by phase is the whole of the fix, and it is why this is one
	 * walk with a wider key rather than the function run twice.
	 */
	const keyed = (phase: ModifierPhase, type: string) => `${phase}\u0000${type}`;

	/** Phase two's winning bonus and penalty per phase and declared type. */
	const best = new Map<string, number>();
	const worst = new Map<string, number>();
	for (const entry of contributions) {
		if (entry.operator === 'override') continue;
		const { amount, type } = entry;
		// Zero neither pushes nor suppresses anything: a breakdown is about what
		// changed the number.
		if (amount === 0 || type === null) continue;
		const key = keyed(phaseOf(entry), type);
		if (amount > 0) best.set(key, Math.max(best.get(key) ?? amount, amount));
		else worst.set(key, Math.min(worst.get(key) ?? amount, amount));
	}

	/** Which winner has already been spent, so a tie takes the first. */
	const taken = new Set<string>();
	const lines: ModifierLine[] = [];
	let total = 0;
	let resultTotal = 0;
	for (const entry of contributions) {
		const { label, source, definition, operator, type, amount } = entry;
		const applies = phaseOf(entry);
		/** Add to the phase this entry landed in, and to no other. */
		const add = (by: number) => {
			if (applies === 'result') resultTotal += by;
			else total += by;
		};
		const line = (suppressed: string | null) =>
			lines.push({
				label,
				source,
				definition,
				operator,
				type,
				// An override's phase is fixed and its line already reads "sets to",
				// so it is reported as `value` rather than growing a third answer.
				applies: operator === 'override' ? 'value' : applies,
				amount,
				suppressed,
			});

		if (operator === 'override') {
			if (amount === override && !taken.has('override')) {
				taken.add('override');
				line(null);
				continue;
			}
			line(suppressionWording('override', amount === override, 'value'));
			continue;
		}
		if (amount === 0) continue;
		if (type === null) {
			line(null);
			add(amount);
			continue;
		}
		const key = keyed(applies, type);
		const winner = (amount > 0 ? best.get(key) : worst.get(key)) ?? amount;
		const slot = keyed(applies, contest(type, amount));
		if (amount === winner && !taken.has(slot)) {
			taken.add(slot);
			line(null);
			add(amount);
			continue;
		}
		line(suppressionWording(contest(type, amount), amount === winner, 'size'));
	}
	return {
		override,
		total: roundSum(total),
		resultTotal: roundSum(resultTotal),
		lines,
	};
}

/**
 * Why one enrolment is not applying at its target, or null where it is.
 *
 * **Answered by value rather than by identity, and the difference is a decision
 * rather than an approximation.** Two rows enrolling in the same definition at the
 * same amount tie: the breakdown has to attribute the number to exactly one of
 * them for the sum to work, and lists the other as not applied. The *rows* are
 * symmetric — deleting either changes nothing — so both read as changing the
 * value, and neither is arbitrarily marked inert. Doing better would mean an index
 * leaving the component, which §4.2 refuses.
 *
 * So what this reports is the case the mark exists for: a strictly larger bonus of
 * this type, or a strictly higher override, has taken the slot.
 */
export function suppressionOf(
	result: ModifierResult,
	enrolment: { operator: ModifierOperator; type: string | null; amount: number },
): string | null {
	if ('error' in result) {
		// Another row on this sheet stopped the slot, so nothing at this name is
		// applying — including this row.
		return result.error;
	}
	const { operator, type, amount } = enrolment;
	if (operator === 'override') {
		return result.override === amount
			? null
			: suppressionWording('override', false, 'value');
	}
	if (amount === 0) return 'it adds nothing';
	if (type === null) return null;
	const slot = contest(type, amount);
	const winner = result.lines.find(
		(line) =>
			line.operator === 'add' &&
			line.type === type &&
			line.suppressed === null &&
			contest(type, line.amount) === slot,
	);
	return winner === undefined || winner.amount === amount
		? null
		: suppressionWording(slot, false, 'size');
}

/**
 * One part as the cell that holds it needs it: which tier it came from, whether it
 * is applying, and what to say if it is not.
 *
 * Here rather than in `sheet.ts` because both halves of the answer are this
 * file's: `resolveEnrolment` says what the row comes to and `suppressionOf` says
 * what the slot did with it, and a caller composing them would be a second place
 * holding the rule that a suppressed contribution is not applying.
 *
 * `label` is how a target is named for a reader — the publishing component's own
 * word for the value. It arrives as a function rather than being looked up here,
 * because the published set is the sheet's and this file is upstream of it.
 */
export function enrolmentOutcome(
	found: Enrolment,
	slot: (target: string) => ModifierResult,
	label: (target: string) => string,
): ModifierOutcome {
	if (found.kind === 'unknown') {
		// A stray names nothing, so there is no target to label: the form's line for
		// it is about the *name* rather than about a value.
		return {
			definition: null,
			typed: null,
			target: '',
			targetLabel: '',
			applies: false,
			amount: null,
			condition: null,
			suppressed: null,
		};
	}
	const { definition, typed, fields } = found;
	const named = {
		definition,
		typed,
		target: fields.target,
		targetLabel: label(fields.target),
	};
	if (found.kind === 'unreadable') {
		return {
			...named,
			applies: false,
			amount: null,
			condition: null,
			suppressed: found.reason,
		};
	}
	if (found.kind === 'unfinished') {
		/*
		 * **Changes nothing, refuses nothing, and says what it needs.** The sixth
		 * `zap-off` reason, and the one the form's own per-field commit depends on:
		 * a part exists the moment its target is chosen, and it must not blank a
		 * card while the reader is still typing an amount.
		 */
		return {
			...named,
			applies: false,
			amount: null,
			condition: null,
			suppressed: 'it needs an amount.',
		};
	}
	if (found.kind === 'inactive') {
		return {
			...named,
			applies: false,
			amount: found.amount,
			condition: false,
			suppressed: null,
		};
	}
	const { contribution } = found;
	const suppressed =
		contribution.target === ''
			? null
			: suppressionOf(slot(contribution.target), contribution);
	return {
		...named,
		applies: suppressed === null,
		amount: contribution.amount,
		condition: found.conditional ? true : null,
		suppressed,
	};
}
