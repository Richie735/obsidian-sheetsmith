/*
 * Resolves a component's formula fields.
 *
 * Names resolve in three layers, nearest first: the scope the component
 * passes in (one ability's `value`, later a table row's cells), then the
 * component's own data, then the sheet-wide table every other component
 * publishes to. Nearest-first is what lets a Card set's `derived` say
 * `value` and mean this entry, while an armour class says
 * `abilities.DEX` and means another component entirely.
 *
 * The layout's functions are a fourth thing rather than a fourth layer. They
 * are called, not looked up, and their bodies see only their parameters and
 * the sheet — never the two nearer layers, which belong to whichever
 * component happened to make the call.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	FieldExplainer,
	FieldResolver,
	ResolvedValues,
} from '../types';
import {
	EMPTY_SCOPE,
	evaluate,
	FormulaError,
	FunctionEnv,
	FunctionLibrary,
	NO_FUNCTIONS,
	roundSum,
	Scope,
	Value,
} from './expression';
import { ModifierLookup, modifierSlot, NO_MODIFIERS, SELF_SLOT } from './modifiers';
import { NO_ROWS, RowLookup } from './rows';

/**
 * Everything on the sheet a formula resolves against.
 *
 * One object rather than trailing parameters. The three factories below took
 * `(component, config, data, sheet, functions)` and this feature made it six
 * positionals, all of which have to reach every formula on the sheet: a name
 * table, a function library, and a row table. An environment is also what the
 * aggregate needs in order to exist at all, since the row table and the name
 * table are mutually lazy and neither can be passed before the other is built.
 */
export interface FormulaEnv {
	/** The names every other component publishes (SPEC §5). */
	sheet: Scope;
	/** The layout's own arithmetic. */
	library: FunctionLibrary;
	/** The rows an aggregate may walk, by component id. */
	rows: RowLookup;
	/**
	 * What has been pushed at each published name (SPEC §5), on `rows`' exact
	 * terms: a lookup rather than a table, because the pushes are built from
	 * formulas that read the sheet, and the sheet is the thing being built.
	 */
	modifiers: ModifierLookup;
}

/**
 * The environment with no sheet around it: a component rendered on its own, a
 * formula evaluated in a test. Nothing resolves, no function is defined, and no
 * table holds rows — which is the truth there rather than a fallback.
 */
export const NO_ENV: FormulaEnv = {
	sheet: EMPTY_SCOPE,
	library: NO_FUNCTIONS,
	rows: NO_ROWS,
	modifiers: NO_MODIFIERS,
};

/**
 * The sheet-wide environment as one expression's own: **the sheet becomes
 * `base`**, which is what a layout function's body sees besides its parameters.
 *
 * One function because that rename is the whole of the conversion and it is
 * silent when it goes missing. The two types are otherwise structurally
 * compatible, so passing a `FormulaEnv` straight to `evaluate` used to compile
 * and leave every function body reading an empty scope — a failure that cannot
 * happen in the app, reported by a test as though it could. `FunctionEnv`
 * declares `sheet?: never` to make that a compile error, and this is what the
 * error sends the caller to.
 */
export function callsFrom(env: FormulaEnv): FunctionEnv {
	return { library: env.library, base: env.sheet, rows: env.rows };
}

/** Numeric-looking strings become numbers; anything else passes through. */
export function coerceValue(raw: unknown): Value | undefined {
	if (typeof raw === 'number' || typeof raw === 'boolean') return raw;
	if (typeof raw === 'string') {
		const trimmed = raw.trim();
		const numeric = Number(trimmed);
		return trimmed !== '' && !Number.isNaN(numeric) ? numeric : raw;
	}
	return undefined;
}

/**
 * Whether a field path is one the component declared as accepting a formula.
 *
 * A declaration may carry `*` in place of a path segment, which is what lets
 * a component with repeating structure declare its formulas at all: a Skill
 * card's columns are a list, so its expressions live at `columns.0.formula`,
 * `columns.1.formula`, and so on, and no static list could name them. SPEC
 * §4.2 has always described that component's formula fields as "each column's
 * formula"; this is that sentence made addressable.
 */
function isDeclared(patterns: readonly string[], field: string): boolean {
	const parts = field.split('.');
	return patterns.some((pattern) => {
		const segments = pattern.split('.');
		if (segments.length !== parts.length) return false;
		return segments.every((segment, i) => segment === '*' || segment === parts[i]);
	});
}

/** Follow a dotted path into the config, through objects and arrays alike. */
function readPath(record: Record<string, unknown>, field: string): unknown {
	let current: unknown = record;
	for (const segment of field.split('.')) {
		if (Array.isArray(current)) {
			const index = Number(segment);
			if (!Number.isInteger(index) || index < 0) return undefined;
			current = current[index];
			continue;
		}
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Every expression this component's configuration holds, in declaration order.
 *
 * The counterpart to `readPath`: that answers *one* field for the resolver, and
 * this answers the whole family, expanding a `*` in a declaration over whatever
 * the config has there. Two walkers rather than one because they answer two
 * questions — a resolver is handed a concrete field and must not guess, and this
 * is handed a pattern and has nothing else to do — and the second cannot be
 * written in terms of the first, since expanding `*` means reading the array
 * lengths the first is never given.
 *
 * Its one consumer today is the modifier accepting set (SPEC §5), which asks
 * whether any formula on a component mentions `mod.self`. Held per expression
 * rather than joined into one string: `referencesName` tokenises, and one
 * unparseable definition joined to the rest would report the whole component as
 * mentioning nothing.
 */
export function formulaTexts(
	component: Pick<ComponentDefinition, 'formulaFields'>,
	config: ComponentConfig,
): readonly string[] {
	const found: string[] = [];
	const collect = (current: unknown, segments: readonly string[]): void => {
		const [head, ...rest] = segments;
		if (head === undefined) {
			if (typeof current === 'string' && current.trim() !== '') found.push(current);
			return;
		}
		if (typeof current !== 'object' || current === null) return;
		if (head === '*') {
			for (const value of Object.values(current)) collect(value, rest);
			return;
		}
		if (Array.isArray(current)) {
			const index = Number(head);
			if (!Number.isInteger(index) || index < 0) return;
			collect(current[index], rest);
			return;
		}
		collect((current as Record<string, unknown>)[head], rest);
	};
	for (const pattern of component.formulaFields) {
		collect(config, pattern.split('.'));
	}
	return found;
}

function scopeFromData(data: unknown): Scope {
	const record =
		typeof data === 'object' && data !== null
			? (data as Record<string, unknown>)
			: {};
	return (name) => coerceValue(record[name]);
}

/**
 * The one evaluation both public field readers are built from: read the
 * declared field, layer `extra` over the component's data over the sheet, and
 * evaluate. The two readers differ only in what they do with the outcome, and
 * they must not differ in anything else — an explanation produced under
 * different scope rules would explain a failure that did not happen.
 */
function fieldReaders(
	component: Pick<ComponentDefinition, 'formulaFields'>,
	config: ComponentConfig,
	data: unknown,
	env: FormulaEnv,
): { resolve: FieldResolver; explain: FieldExplainer } {
	const record = config as unknown as Record<string, unknown>;
	const dataScope = scopeFromData(data);
	// The sheet, and only the sheet, is what a function body sees: `prof`
	// reading `level` is the point of a library, and `mod(score)` silently
	// reading the calling card's own `value` would be the end of it. The row
	// table goes through untouched: an aggregate names the table it walks, so
	// there is no caller's scope for it to leak.
	const calls = callsFrom(env);

	/** The evaluation itself, or a thrown FormulaError. */
	const read = (
		field: string,
		extra: Record<string, unknown>,
		/** The published name this evaluation produces, where it produces one. */
		published: string | undefined,
		/**
		 * Whether this evaluation is for display only rather than the one that
		 * *becomes* the published name (SPEC §5).
		 *
		 * One name may be evaluated twice: a Card's `derived` becomes the name, and
		 * its `effective` is a second reading of the same slot for the value pill.
		 * Both want the value phase; only the first may take the result phase and
		 * the override, which land on the published number. Without the
		 * distinction the pill would show a "+1 to checks" as part of the score and
		 * an override of the ability modifier as the score itself.
		 */
		displayOnly = false,
	): { literal: Value } | { evaluated: Value } | null => {
		/**
		 * The name whose slot this evaluation actually read, or null.
		 *
		 * **This is the bound on the override step, and it is the tightest one
		 * available.** SPEC §5's rule is that "an override reaches a target on
		 * exactly the same condition an addition does — the target's own formula
		 * reads `mod.self`", and this is that sentence made exact: the slot was
		 * asked for, on the path this evaluation actually took. A static set over
		 * the formula *text* would be wider, and wider in a way that shows: the
		 * language's `if` is lazy, so `if(equipped, value + mod.self, value)` on a
		 * stowed item reads no slot, takes no addition, and must take no override
		 * either.
		 *
		 * **It also means the override step widens nothing**, which is half of what
		 * SPEC §13's finding says and the half that is now wrong there: nothing here
		 * asks the walk a question the formula did not already ask it, so *this*
		 * step leaves the two cycle guards the shares of a ring they had before the
		 * feature. The widening the finding describes is real and comes from
		 * somewhere else — `ModifierContext.outcome`, which a modifier cell asks for
		 * every filled cell it draws, bounded by the accepting set and by nothing
		 * narrower, and which running at render can be the first entry into the walk
		 * in a render (`formula/sheet.ts`).
		 */
		let asked: string | null = null;
		if (!isDeclared(component.formulaFields, field)) return null;
		const expression = readPath(record, field);
		// A field configured as a bare number or boolean is its own answer.
		// The explainer sees this as "nothing to explain", which is the same
		// thing said the other way round.
		if (typeof expression === 'number' || typeof expression === 'boolean') {
			return { literal: expression };
		}
		if (typeof expression !== 'string') return null;
		const scope: Scope = (name) => {
			// An own-property check, not `in`: the caller's scope is an ordinary
			// object, so `in` answers yes for every name on Object.prototype and
			// a formula reading `constructor` or `toString` would be captured
			// here and resolve to nothing, instead of falling through to the
			// data and the sheet where the name might genuinely live.
			if (Object.hasOwn(extra, name)) {
				return coerceValue(extra[name]);
			}
			/*
			 * `mod.self` is what has been pushed at the name this evaluation
			 * *becomes*, which is the exact shape `value` already has read one
			 * layer out: `value` is the number this evaluation is about.
			 *
			 * **Through the sheet, not around it.** The slot is an ordinary name
			 * in the ordinary name table, so it keeps that table's memo and its
			 * re-entry guard — a modifier whose amount reads the target it
			 * modifies is a ring the guard closes loudly, and the slot then throws
			 * with the row named rather than answering with a silent zero.
			 *
			 * **Zero where the evaluation publishes no name, and only there.** A
			 * Table's computed column runs on declared rows carrying a `key` and on
			 * rows carrying none, from one formula; a row with no key cannot be
			 * pushed at, so its slot is empty, so it is zero — and a column reading
			 * `mod.self` shows numbers down every row rather than `?` on half of
			 * them. The same answer covers a formula field nothing publishes at
			 * all, and the cost is the risk `FieldResolver` records: a component
			 * that forgets to pass its own name reads 0 and nothing says so.
			 *
			 * **Where a name *is* given, the sheet's answer stands as it is.** No
			 * fallback, deliberately: the slot's own guard answers `undefined` for a
			 * ring — a modifier whose amount reads the target it modifies — and a
			 * `?? 0` there would turn the one failure this shape is built to make
			 * loud into a silently wrong number. Unresolved, the formula fails, the
			 * amount is unreadable, and the slot throws naming the row. That
			 * loudness is the argument for the whole design (SPEC §5), not a side
			 * effect of it.
			 */
			if (name === SELF_SLOT) {
				if (published === undefined) return 0;
				asked = published;
				return env.sheet(modifierSlot(published));
			}
			// The component's own data shadows the sheet, so a card's `value`
			// always means its own — never some other component that happens
			// to share the name.
			return dataScope(name) ?? env.sheet(name);
		};
		const value = evaluate(expression, scope, calls);
		return { evaluated: displayOnly ? value : published_(asked, value) };
	};

	/**
	 * An override applied to what a formula that read its own slot came to.
	 *
	 * ```
	 * name = override applies ? highest override + additive total
	 *                         : the formula's own result
	 * ```
	 *
	 * So an override replaces **the result of the formula that read the slot**,
	 * and the additive total is re-added on top: override 18, addition +1, result
	 * 19. That is the owner's arithmetic and CSB's operator order — "set are
	 * applied first, then … addition" — against Foundry's, whose override has
	 * priority 50 and so wipes the additions; dnd5e#6622 is an open bug from a
	 * user hitting exactly that.
	 *
	 * **Here rather than in `buildSheetScope`'s thunk**, and that is a correction
	 * to the feature spec rather than a preference. The name table is only one of
	 * the two callers of this evaluation: a Card draws its number through
	 * `context.resolveField('derived', …, config.id)` and the sheet publishes it
	 * through `resolve(display.field, …, name)`, and an override applied in the
	 * thunk alone would put 20 into every formula reading the card and 14 on the
	 * card's own face. That is the existing rule that a name and the cell it came
	 * from must not disagree, and it is why one place is the only correct number
	 * of places.
	 *
	 * **What it costs, stated because it is a real edge.** A formula using
	 * `mod.self` as anything but a plain addend gets different arithmetic under an
	 * override: `value + mod.self * 2` doubles the additive total when nothing
	 * overrides and adds it once when something does, because this can only re-add
	 * what the slot holds, which is the total. Small, because `+ mod.self` is the
	 * canonical spelling everywhere, and unavoidable without a base to replace —
	 * which `10 + abilities.DEX + mod.self` does not have.
	 */
	const published_ = (asked: string | null, value: Value): Value => {
		if (asked === null) return value;
		const pushed = env.modifiers(asked);
		// A refused slot has already thrown out of the scope above, so this only
		// ever sees one that resolved; the guard is what makes that readable rather
		// than assumed.
		if ('error' in pushed) return value;
		/*
		 * The override first, exactly as before: it replaces what the formula came
		 * to and the value-phase total is re-added on top.
		 */
		const base =
			pushed.override === null ? value : pushed.override + pushed.total;
		/*
		 * **Then the result phase, on top of either.** It is added rather than
		 * folded into `mod.self` because that is what distinguishes it: a modifier
		 * here lands on the number the formula produced, wherever the author put
		 * `mod.self` inside it. On a formula with no transform — `10 +
		 * abilities.DEX + mod.self` — the two phases are arithmetically the same
		 * place, which is why the choice only ever *matters* on a card that
		 * transforms its value, and why it is harmless everywhere else.
		 */
		const after = pushed.resultTotal ?? 0;
		/*
		 * **Only onto a number.** A formula may come to a string or a boolean, and a
		 * result modifier has nothing to add to one — the honest answer there is the
		 * value the formula gave, not a concatenation. `roundSum` is the same helper
		 * the totals row and `sum()` use, so the number on the card and the
		 * breakdown's own total cannot disagree about `0.30000000000000004`.
		 */
		if (after === 0 || typeof base !== 'number') return base;
		return roundSum(base + after);
	};

	return {
		resolve: (field, extra, published, displayOnly) => {
			try {
				const outcome = read(field, extra, published, displayOnly);
				if (outcome === null) return null;
				return 'literal' in outcome ? outcome.literal : outcome.evaluated;
			} catch {
				return null;
			}
		},
		explain: (field, extra, published) => {
			try {
				read(field, extra, published);
				return null;
			} catch (error) {
				return error instanceof FormulaError ? error.message : String(error);
			}
		},
	};
}

/**
 * A resolver that evaluates one formula field with extra names layered over
 * the component's data scope. Components with internal structure use this to
 * evaluate per entry or per row.
 */
export function makeFieldResolver(
	component: Pick<ComponentDefinition, 'formulaFields'>,
	config: ComponentConfig,
	data: unknown,
	env: FormulaEnv = NO_ENV,
): FieldResolver {
	return fieldReaders(component, config, data, env).resolve;
}

/**
 * The companion to makeFieldResolver: the same evaluation, reporting why it
 * failed rather than that it did.
 *
 * A component shows "?" from the resolver and asks this only for the cell
 * already known to have failed, so the second evaluation is paid on the error
 * path alone. Returns null where the field resolves, so "no explanation" and
 * "no problem" are the same answer.
 */
export function makeFieldExplainer(
	component: Pick<ComponentDefinition, 'formulaFields'>,
	config: ComponentConfig,
	data: unknown,
	env: FormulaEnv = NO_ENV,
): FieldExplainer {
	return fieldReaders(component, config, data, env).explain;
}

/**
 * Evaluate each of the component's formula fields against the data scope
 * alone. Literals pass through, and a field that fails to evaluate resolves
 * to null so the component can show a placeholder without taking the sheet
 * down.
 */
export function resolveFormulaFields(
	component: Pick<ComponentDefinition, 'formulaFields'>,
	config: ComponentConfig,
	data: unknown,
	env: FormulaEnv = NO_ENV,
): ResolvedValues {
	const resolve = makeFieldResolver(component, config, data, env);
	const record = config as unknown as Record<string, unknown>;
	const resolved: Record<string, Value | null> = {};
	for (const field of component.formulaFields) {
		// A pattern names a family of fields rather than one, and the family's
		// members only exist per row or per column — there is no single value
		// to hand back here. Those components resolve through resolveField
		// with the scope that gives the expression its meaning.
		if (field.includes('*')) continue;
		if (record[field] === undefined || record[field] === null) continue;
		if (typeof record[field] === 'object') continue;
		resolved[field] = resolve(field, {});
	}
	return resolved;
}
