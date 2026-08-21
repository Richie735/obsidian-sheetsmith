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
 *
 * The file also ties the name table to the row table an aggregate walks
 * (rows.ts). That is one job rather than two: this is where what every formula
 * on the sheet resolves against gets built, and that is now two tables instead
 * of one. They have to be built together because they are mutually lazy — a
 * published name may hold an aggregate, and a row's computed column may read a
 * published name — so neither can be finished before the other starts.
 */

import { FieldResolver, RowsSource, ScopeEntry, ScopeValues } from '../types';
import { FunctionLibrary, NO_FUNCTIONS, Scope, Value } from './expression';
import { coerceValue, FormulaEnv, NO_ENV } from './resolve';
import { buildRowTable, RowComponent } from './rows';

export interface PublishedComponent {
	/** The component's layout id: the name formulas reference it by. */
	id: string;
	values: ScopeValues;
	/**
	 * The rows an aggregate may walk, where this component holds any. Absent
	 * on every component but a Table, and a component with none is still listed
	 * so that `sum(armour_class, x)` can say what is actually wrong with it
	 * rather than that no such name exists.
	 */
	rows?: RowsSource;
	/**
	 * Builds this component's field resolver against the environment it will
	 * read. A factory rather than a resolver, because that environment is the
	 * thing being built: a displayed value may reference another component,
	 * whose displayed value may reference a third, and a row's computed column
	 * may reference any of them.
	 */
	resolver?: (env: FormulaEnv) => FieldResolver;
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
 * Build everything a formula on the sheet resolves against: the names
 * components publish, the layout's functions, and the rows an aggregate walks.
 *
 * The two tables are mutually lazy, and that is the whole of the construction.
 * `env` is handed out before either exists, holding closures that reach the
 * tables built on the next two lines; nothing calls them until a formula is
 * evaluated, which is long after both are in place. Each table keeps its own
 * memoisation and its own re-entry guard, because they guard different things:
 * one a name that needs its own result, the other a row set being walked while
 * it is already being walked.
 */
export function buildSheetEnv(
	components: readonly PublishedComponent[],
	library: FunctionLibrary = NO_FUNCTIONS,
): FormulaEnv {
	const env: FormulaEnv = {
		library,
		sheet: (name) => names(name),
		rows: (id, caller) => rows(id, caller),
	};
	const names = buildSheetScope(components, env);
	const rows = buildRowTable(
		components.map((component): RowComponent => {
			const source = component.rows;
			if (source === undefined) return { id: component.id };
			// The resolver a row's computed columns run against, bound to the
			// same environment the name table's own entries are bound to: a
			// column formula and a published cell must not resolve differently.
			const resolve = component.resolver?.(env) ?? ((): null => null);
			return { id: component.id, rows: () => source(resolve) };
		}),
	);
	return env;
}

/**
 * Build the name lookup every formula on the sheet shares. Component ids are
 * unique by the time a layout parses, so no entry can shadow another.
 *
 * Exported beside `buildSheetEnv` rather than folded into it, because a test
 * driving the name table alone is driving the thing whose job has not changed.
 * Without an environment it builds one over itself: the sheet is then all there
 * is to resolve against, which is the truth for a name table with no layout
 * around it.
 */
export function buildSheetScope(
	components: readonly PublishedComponent[],
	env?: FormulaEnv,
): Scope {
	const thunks = new Map<string, () => Value | undefined>();
	/**
	 * What resolved, and only what resolved.
	 *
	 * **A failure is not an answer to cache.** Before the aggregate a name could
	 * fail for one reason only, a cycle it was in, and caching that was right
	 * because it would fail again. Now a name's own thunk can fail *transiently*
	 * — a published name aggregating over a table whose column reads that name
	 * back is refused while the row walk is in flight and resolves perfectly once
	 * it is not (SPEC §5's coarse edge) — so caching the miss would decide the
	 * name's value by which formula the sheet happened to evaluate first. A
	 * genuine cycle still terminates on `active` and simply recomputes its own
	 * refusal, which is the same price the explainer already pays for evaluating
	 * a failed field twice.
	 */
	const memo = new Map<string, Value>();
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
			if (value !== undefined) memo.set(name, value);
			return value;
		} finally {
			active.delete(name);
		}
	};

	const bound: FormulaEnv = env ?? { ...NO_ENV, sheet: scope };

	for (const component of components) {
		const resolve = component.resolver?.(bound);

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
