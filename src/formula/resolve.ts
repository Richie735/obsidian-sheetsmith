/*
 * Resolves a component's formula fields.
 *
 * Names resolve in three layers, nearest first: the scope the component
 * passes in (one ability's `value`, later a table row's cells), then the
 * component's own data, then the sheet-wide table every other component
 * publishes to. Nearest-first is what lets a Stat group's `derived` say
 * `value` and mean this attribute, while an armour class says
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
	Scope,
	Value,
} from './expression';

/**
 * Everything on the sheet a formula resolves against.
 *
 * One object rather than trailing parameters. The three factories below took
 * `(component, config, data, sheet, functions)`, and every one of those has to
 * reach every formula on the sheet, so each new sheet-wide thing a formula could
 * read arrived as another positional argument at five call sites.
 */
export interface FormulaEnv {
	/** The names every other component publishes (SPEC §5). */
	sheet: Scope;
	/** The layout's own arithmetic. */
	library: FunctionLibrary;
}

/**
 * The environment with no sheet around it: a component rendered on its own, a
 * formula evaluated in a test. Nothing resolves and no function is defined,
 * which is the truth there rather than a fallback.
 */
export const NO_ENV: FormulaEnv = {
	sheet: EMPTY_SCOPE,
	library: NO_FUNCTIONS,
};

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
	// reading the calling card's own `value` would be the end of it.
	const calls: FunctionEnv = { library: env.library, base: env.sheet };

	/** The evaluation itself, or a thrown FormulaError. */
	const read = (
		field: string,
		extra: Record<string, unknown>,
	): { literal: Value } | { evaluated: Value } | null => {
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
			// data and the sheet where the name might genuinely live. The long
			// spelling because the build targets ES2021, not ES2022.
			if (Object.prototype.hasOwnProperty.call(extra, name)) {
				return coerceValue(extra[name]);
			}
			// The component's own data shadows the sheet, so a card's `value`
			// always means its own — never some other component that happens
			// to share the name.
			return dataScope(name) ?? env.sheet(name);
		};
		return { evaluated: evaluate(expression, scope, calls) };
	};

	return {
		resolve: (field, extra) => {
			try {
				const outcome = read(field, extra);
				if (outcome === null) return null;
				return 'literal' in outcome ? outcome.literal : outcome.evaluated;
			} catch {
				return null;
			}
		},
		explain: (field, extra) => {
			try {
				read(field, extra);
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
 * evaluate per attribute or per row.
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
