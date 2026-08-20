/*
 * The sheet-wide name table (SPEC §5).
 *
 * Every component that holds values publishes them here, and every formula
 * on the sheet resolves against the result. This is what lets an armour
 * class read `abilities.DEX` instead of being told a number by hand.
 *
 * A bare name gives what the card *shows* — `abilities.DEX` is the +6 in
 * large type, not the 22 behind it — because that is the number the sheet
 * has already decided is the ability's meaning. `abilities.DEX.value` digs
 * out the stored score for the formula that genuinely wants it.
 *
 * Publishing a computed value means one name can depend on another, so the
 * table is lazy, memoised, and guards against a name that needs its own
 * result. SPEC §5 wants circular references caught when the layout is
 * saved; this is the runtime floor under that, and it is not optional —
 * without it a two-line cycle takes the app down with a stack overflow
 * rather than showing an error on two cards.
 */

import { FieldResolver, ScopeEntry, ScopeValues } from '../types';
import { Scope, Value } from './expression';
import { coerceValue } from './resolve';

export interface PublishedComponent {
	/** The component's layout id: the name formulas reference it by. */
	id: string;
	values: ScopeValues;
	/**
	 * Builds this component's field resolver against the sheet it will read.
	 * A factory rather than a resolver, because the sheet is the thing being
	 * built: a displayed value may reference another component, whose
	 * displayed value may reference a third.
	 */
	resolver?: (sheet: Scope) => FieldResolver;
}

/**
 * An absent or blank value is left out rather than published as "", so a
 * formula reading it fails as an unknown name — and the component says so —
 * instead of quietly computing from nothing.
 */
function clean(raw: unknown): Value | undefined {
	const value = coerceValue(raw);
	return value === '' ? undefined : value;
}

/**
 * Build the name lookup every formula on the sheet shares. Component ids are
 * unique by the time a layout parses, so no entry can shadow another.
 */
export function buildSheetScope(
	components: readonly PublishedComponent[],
): Scope {
	const thunks = new Map<string, () => Value | undefined>();
	const memo = new Map<string, Value | undefined>();
	const active = new Set<string>();

	const scope: Scope = (name) => {
		if (memo.has(name)) return memo.get(name);
		const thunk = thunks.get(name);
		if (thunk === undefined) return undefined;
		if (active.has(name)) {
			// A formula that needs its own result to produce its own result.
			// Reporting it unresolvable beats recursing until the stack goes,
			// and leaves every component not in the cycle still working.
			return undefined;
		}
		active.add(name);
		try {
			const value = thunk();
			memo.set(name, value);
			return value;
		} finally {
			active.delete(name);
		}
	};

	for (const component of components) {
		const resolve = component.resolver?.(scope);

		const register = (name: string, entry: ScopeEntry): void => {
			// The stored value is always reachable, whatever the card shows.
			thunks.set(`${name}.value`, () => clean(entry.value));

			// A display that will not resolve publishes nothing rather than
			// falling back to the stored value: handing back 22 where 6 was
			// meant is a worse answer than none at all. The same holds for a
			// computed entry, which is why both go through this.
			const published = (result: Value | null | undefined) =>
				result === null || result === undefined ? undefined : clean(result);

			const { display, compute } = entry;
			if (compute !== undefined) {
				// A component with no resolver of its own still computes: what
				// it is handed is a resolver that finds no field, which is what
				// a component declaring no formula fields would have anyway.
				thunks.set(name, () => published(compute(resolve ?? (() => null))));
				return;
			}
			if (display === undefined || resolve === undefined) {
				thunks.set(name, () => clean(entry.value));
				return;
			}
			thunks.set(name, () => published(resolve(display.field, display.scope)));
		};

		if (component.values.self) register(component.id, component.values.self);
		for (const [name, entry] of Object.entries(component.values.named ?? {})) {
			register(`${component.id}.${name}`, entry);
		}
	}

	return scope;
}
