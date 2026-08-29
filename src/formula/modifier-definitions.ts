/*
 * One part of one modifier cell, resolved against the row that holds it (SPEC §5).
 *
 * One job: read the part — a definition's name, or an effect the row spells out —
 * evaluate its condition and its amount in that row's own scope layered over the
 * sheet, and answer what it comes to or why not. Nothing here groups, stacks, or
 * knows what a target's formula does with the answer — that is `modifiers.ts`, and
 * this is what that file calls once per part.
 *
 * **Two consumers by construction, which is what entitles it to be a module
 * rather than a private helper.** The slot table asks in order to build one number
 * per target; the modifier cell asks in order to draw its own glyph and say what
 * the row is doing. Those two must not disagree about whether a row is applying,
 * and one copy is the only thing that says so for free (`PATTERNS.md` §1).
 *
 * **There is exactly one parse of a cell part in the codebase and it is here**, on
 * the formula side of the seam. Table imports the split, the join and
 * `spellTypedEffect` from `parse/modifier-cell.ts` — it has to, because it writes a
 * cell — and it reads a part's *fields* from `ModifierContext.outcome`, never by
 * parsing the part itself. So the component spells a part and never reads one, this
 * file reads one and never spells one, and the two cannot come apart about what
 * `armour_class += 2 as item when Worn` means.
 *
 * **Nothing here differs by tier once the part is read**, and that is the property
 * to keep. A typed effect's condition is the same mechanism in the same scope as a
 * definition's; its amount is evaluated the same way; a typed override contests on
 * exactly the same terms as a named one. A condition that meant something different
 * on a typed effect would be a second engine.
 *
 * **The condition is evaluated before the amount, and that ordering is
 * load-bearing.** A stowed item's amount may be nonsense — a formula reading a
 * column the author has since renamed — and refusing its target's whole slot for
 * a row that is switched off would make an inactive item able to break a number
 * it is not touching. So an inactive row's amount is read *tolerantly*, for the
 * form's sake only, and never as a reason to refuse anything.
 *
 * Pure: Constraint 5 holds, and it takes a `FunctionEnv` rather than the
 * sheet-wide `FormulaEnv` so that `resolve.ts` — which imports the slot lookup
 * from `modifiers.ts` — stays downstream of both.
 */

import { parseModifierPart } from '../parse/modifier-cell';
import {
	ModifierDefinitionView,
	ModifierOperator,
	ModifierPhase,
	operatorOf,
	RowValues,
	TypedEffect,
} from '../types';
import {
	EMPTY_SCOPE,
	evaluate,
	FormulaError,
	FunctionEnv,
	Scope,
} from './expression';

/** The layout's definitions by name, which is how a cell addresses one. */
export type DefinitionTable = ReadonlyMap<string, ModifierDefinitionView>;

/**
 * Index the layout's definitions.
 *
 * Byte for byte on the trimmed name, which is §4.2's rule for a Card's stored
 * option read on a fourth control: the trim is on the layout's side only, so a
 * cell whose text does not match exactly is a stray reference rather than a near
 * miss the sheet corrects.
 */
export function definitionTable(
	definitions: readonly ModifierDefinitionView[],
): DefinitionTable {
	return new Map(definitions.map((definition) => [definition.name, definition]));
}

/** What one enrolment changes, and how, once its row is known. */
export interface Contribution {
	/** The published name it changes. */
	target: string;
	operator: ModifierOperator;
	/**
	 * The declared bonus type, or null for untyped. **Always null on an
	 * override**, because overrides do not contest by type: the highest wins
	 * whatever either of them was called, and carrying a type here would invite a
	 * reader of the arithmetic to think it mattered.
	 */
	type: string | null;
	amount: number;
	/**
	 * Which phase the addition lands in. Absent is `value`, so an enrolment that
	 * says nothing means what it has always meant.
	 */
	applies?: ModifierPhase;
}

/**
 * Which tier a resolved part came from. **Exactly one is ever set**, and a stray
 * has neither.
 *
 * Two nullable members rather than a discriminated union for `ModifierOutcome`'s
 * own reason: every consumer below reads the target, the amount and the reason
 * regardless of tier, so a union would make the common reads a narrow each.
 */
export interface PartSource {
	definition: ModifierDefinitionView | null;
	typed: TypedEffect | null;
}

/**
 * The five facts one part holds, whichever tier it came from.
 *
 * Carried on every case but `unknown`, because `ModifierOutcome` owes a target and
 * a label even where the row is changing nothing: the form's line for a stowed
 * item says what it *would* do, and that needs the target.
 */
export interface PartFields {
	target: string;
	operator: ModifierOperator;
	/** The amount as an expression, before it is evaluated. Blank is unfinished. */
	amount: string;
	bonusType: string | null;
	/**
	 * Which phase an addition lands in (SPEC §5). Never null: absent storage
	 * settles to `value` here, so nothing downstream repeats the default.
	 */
	applies: ModifierPhase;
	when: string | null;
}

/** One part, resolved on its row. */
export type Enrolment =
	/** A name the layout declares no definition of: a stray, rendered as one. */
	| { kind: 'unknown' }
	/**
	 * A typed effect with no amount yet. **It changes nothing and refuses
	 * nothing** (SPEC §4.2), which is the departure from the named tier that
	 * makes the form safe to commit one field at a time: choosing a target brings
	 * the part into existence, and it must not blank a card while the reader is
	 * still typing.
	 */
	| ({ kind: 'unfinished'; fields: PartFields } & PartSource)
	/**
	 * The condition, or the amount of an active row, would not resolve. The
	 * reason is a sentence, already lowercased for `inRowMessage` to prefix.
	 */
	| ({ kind: 'unreadable'; fields: PartFields; reason: string } & PartSource)
	/** The condition is false on this row, so it changes nothing. */
	| ({
			kind: 'inactive';
			fields: PartFields;
			/** What it would come to, where that resolves. For the form only. */
			amount: number | null;
	  } & PartSource)
	/** It contributes. */
	| ({
			kind: 'applies';
			fields: PartFields;
			contribution: Contribution;
			/** Whether the part carries a condition at all. */
			conditional: boolean;
	  } & PartSource);

/**
 * The scope a modifier's expressions see: the enrolling row's names, layered
 * over the sheet.
 *
 * The row wins, which is what makes `Equipped` mean this row's cell rather than
 * some component that happens to publish the name — the same way a component's
 * own data shadows the sheet in `fieldReaders`. `rowValues` has already layered
 * the row's stored cells, its declared values and its computed columns, so what
 * a modifier is evaluated against is the same account of the row the cells on
 * screen are.
 */
function rowScope(row: RowValues, base: Scope): Scope {
	return (name) =>
		Object.hasOwn(row.values, name) ? row.values[name] : base(name);
}

/** Evaluate one expression, or say why it would not. */
function read(
	source: string,
	scope: Scope,
	calls: FunctionEnv,
): { value: number | boolean | string } | { reason: string } {
	try {
		return { value: evaluate(source, scope, calls) };
	} catch (error) {
		return {
			reason:
				error instanceof FormulaError ? error.message : String(error),
		};
	}
}

/**
 * Which phase a stored modifier names, settled once for both tiers.
 *
 * Anything that is not the word `result` is the value phase, which is what makes
 * the default survive a hand-edited layout: a typo in a JSON file leaves the
 * modifier doing what it did before the phase existed rather than silently
 * moving it somewhere else.
 */
function phaseOf(stored: { applies?: ModifierPhase }): ModifierPhase {
	return stored.applies === 'result' ? 'result' : 'value';
}

/** A definition's five facts, as the fields both tiers reduce to. */
function fieldsOfDefinition(definition: ModifierDefinitionView): PartFields {
	const bonusType = (definition.bonusType ?? '').trim();
	const when = (definition.when ?? '').trim();
	return {
		target: definition.target.trim(),
		operator: operatorOf(definition),
		amount: (definition.amount ?? '').trim(),
		bonusType: bonusType === '' ? null : bonusType,
		applies: phaseOf(definition),
		when: when === '' ? null : when,
	};
}

/** A typed effect's five facts, in the same shape. */
function fieldsOfTyped(effect: TypedEffect): PartFields {
	const bonusType = (effect.bonusType ?? '').trim();
	const when = (effect.when ?? '').trim();
	return {
		target: effect.target.trim(),
		operator: effect.operator,
		amount: effect.amount.trim(),
		bonusType: bonusType === '' ? null : bonusType,
		applies: phaseOf(effect),
		when: when === '' ? null : when,
	};
}

/**
 * How a refusal names the thing that refused, in the reader's own words.
 *
 * A definition has a name and says it; a typed effect has none by §7's edge, so it
 * is spelled by *what it does* — "this row's modifier" — which is the same
 * substitution `modifier-breakdown.ts` makes wherever a name is missing.
 */
function called(source: PartSource): string {
	return source.definition === null
		? "this row's own modifier"
		: `the modifier "${source.definition.name}"`;
}

/**
 * Resolve one part of one cell on one row.
 *
 * The amount has to be a number: a modifier adding "yes" to an armour class is
 * the same failure a number column holding prose already is, and it refuses the
 * slot rather than contributing a silent zero, because a quietly wrong number is
 * worse than a missing one (SPEC §5).
 *
 * The condition is read for truth rather than for a number, so a `toggle` cell —
 * which arrives in the row scope as a boolean — is the ordinary spelling and
 * `Attuned && Equipped` works without anything being said about it here. A blank
 * string and a zero both read as false, which is what a cell nobody has filled in
 * is.
 *
 * **A blank amount is where the two tiers deliberately differ**, and it is the
 * honest way round. A definition with no amount is a layout problem the author
 * owns, so it refuses the slot and is reported in the editor. An unfinished cell is
 * the reader's own half-written text, so it changes nothing and refuses nothing —
 * the tier whose text lives in the note is the tier whose text can be half-written.
 */
export function resolveEnrolment(
	definitions: DefinitionTable,
	part: string,
	row: RowValues,
	calls: FunctionEnv,
): Enrolment {
	const parsed = parseModifierPart(part);
	let source: PartSource;
	let fields: PartFields;
	if (parsed.kind === 'named') {
		const definition = definitions.get(parsed.name);
		if (definition === undefined) return { kind: 'unknown' };
		source = { definition, typed: null };
		fields = fieldsOfDefinition(definition);
	} else {
		source = { definition: null, typed: parsed.effect };
		fields = fieldsOfTyped(parsed.effect);
	}

	const scope = rowScope(row, calls.base ?? EMPTY_SCOPE);
	let conditional = false;
	if (fields.when !== null) {
		conditional = true;
		const condition = read(fields.when, scope, calls);
		if ('reason' in condition) {
			return { kind: 'unreadable', ...source, fields, reason: condition.reason };
		}
		if (
			condition.value === false ||
			condition.value === 0 ||
			condition.value === ''
		) {
			// Read tolerantly: an inactive row contributes nothing, so an amount it
			// cannot resolve must not be able to refuse its target's slot.
			const amount = read(fields.amount, scope, calls);
			return {
				kind: 'inactive',
				...source,
				fields,
				amount:
					'value' in amount && typeof amount.value === 'number'
						? amount.value
						: null,
			};
		}
	}

	if (fields.amount === '') {
		if (source.typed !== null) return { kind: 'unfinished', ...source, fields };
		return {
			kind: 'unreadable',
			...source,
			fields,
			reason: `${called(source)} has no amount.`,
		};
	}
	const amount = read(fields.amount, scope, calls);
	if ('reason' in amount) {
		return { kind: 'unreadable', ...source, fields, reason: amount.reason };
	}
	if (typeof amount.value !== 'number') {
		return {
			kind: 'unreadable',
			...source,
			fields,
			reason: `"${String(amount.value)}" is not a number, so ${called(source)} has no amount.`,
		};
	}

	return {
		kind: 'applies',
		...source,
		fields,
		conditional,
		contribution: {
			target: fields.target,
			operator: fields.operator,
			// Blank is untyped, so every modifier of that kind stacks — which is
			// what an author who has never heard of bonus types expects. An
			// override carries none whatever the part says.
			type: fields.operator === 'override' ? null : fields.bonusType,
			// An override's phase is fixed — it replaces the published number — so
			// it is reported as `value` and `stackModifiers` never reads it.
			applies: fields.operator === 'override' ? 'value' : fields.applies,
			amount: amount.value,
		},
	};
}
