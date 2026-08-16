/*
 * Resolves a component's formula fields.
 *
 * Names resolve in three layers, nearest first: the scope the component
 * passes in (one ability's `value`, later a table row's cells), then the
 * component's own data, then the sheet-wide table every other component
 * publishes to. Nearest-first is what lets a Stat group's `derived` say
 * `value` and mean this attribute, while an armour class says
 * `abilities.DEX` and means another component entirely.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	ResolvedValues,
} from '../types';
import { EMPTY_SCOPE, evaluate, Scope, Value } from './expression';

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

function scopeFromData(data: unknown): Scope {
	const record =
		typeof data === 'object' && data !== null
			? (data as Record<string, unknown>)
			: {};
	return (name) => coerceValue(record[name]);
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
	sheet: Scope = EMPTY_SCOPE,
): FieldResolver {
	const record = config as unknown as Record<string, unknown>;
	const dataScope = scopeFromData(data);
	return (field, extra) => {
		if (!component.formulaFields.includes(field)) return null;
		const expression = record[field];
		if (typeof expression === 'number' || typeof expression === 'boolean') {
			return expression;
		}
		if (typeof expression !== 'string') return null;
		const scope: Scope = (name) => {
			if (name in extra) return coerceValue(extra[name]);
			// The component's own data shadows the sheet, so a card's `value`
			// always means its own — never some other component that happens
			// to share the name.
			return dataScope(name) ?? sheet(name);
		};
		try {
			return evaluate(expression, scope);
		} catch {
			return null;
		}
	};
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
	sheet: Scope = EMPTY_SCOPE,
): ResolvedValues {
	const resolve = makeFieldResolver(component, config, data, sheet);
	const record = config as unknown as Record<string, unknown>;
	const resolved: Record<string, Value | null> = {};
	for (const field of component.formulaFields) {
		if (record[field] === undefined || record[field] === null) continue;
		if (typeof record[field] === 'object') continue;
		resolved[field] = resolve(field, {});
	}
	return resolved;
}
