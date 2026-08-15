/*
 * Resolves a component's formula fields against its own data.
 *
 * Until M3 wires the full engine in, an expression can reference the fields
 * of the component it sits on (a Stat's `value`, one ability's `value`), and
 * nothing else.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	FieldResolver,
	ResolvedValues,
} from '../types';
import { evaluate, Scope, Value } from './expression';

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
		const scope: Scope = (name) =>
			name in extra ? coerceValue(extra[name]) : dataScope(name);
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
): ResolvedValues {
	const resolve = makeFieldResolver(component, config, data);
	const record = config as unknown as Record<string, unknown>;
	const resolved: Record<string, Value | null> = {};
	for (const field of component.formulaFields) {
		if (record[field] === undefined || record[field] === null) continue;
		if (typeof record[field] === 'object') continue;
		resolved[field] = resolve(field, {});
	}
	return resolved;
}
