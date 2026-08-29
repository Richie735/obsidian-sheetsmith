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

import {
	ComponentConfig,
	ComponentDefinition,
	FieldExplainer,
	FieldResolver,
	ModifierContext,
	ModifierDefinitionView,
	ModifierSource,
	ModifierTarget,
	PromoteResult,
	RowsSource,
	ScopeEntry,
	ScopeValues,
	TypedEffect,
} from '../types';
import {
	FormulaError,
	FunctionLibrary,
	NO_FUNCTIONS,
	Scope,
	Value,
} from './expression';
import { Layout } from '../parse/layout';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { parseModifierTypes } from '../parse/modifier-types';
import {
	acceptingTargets,
	modifierTargetSource,
	ModifierTargetSource,
	publishedTargets,
} from './modifier-targets';
import {
	definitionTable,
	resolveEnrolment,
} from './modifier-definitions';
import {
	buildModifierTable,
	enrolmentOutcome,
	ModifierComponent,
	modifierSlot,
} from './modifiers';
import {
	callsFrom,
	coerceValue,
	FormulaEnv,
	makeFieldExplainer,
	makeFieldResolver,
	NO_ENV,
} from './resolve';
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
	/**
	 * The companion to `resolver`, kept for the callers that ask a component why
	 * a field it has already seen fail did so.
	 *
	 * **No longer the modifier table's**, which is what it was added for: a
	 * refused slot still has to name the row *and the reason*, and the reason now
	 * comes from where the definition's amount is evaluated — the formula layer,
	 * which holds it in hand.
	 */
	explainer?: (env: FormulaEnv) => FieldExplainer;
	/**
	 * The enrolments this component's rows declare in the layout's modifier
	 * definitions (SPEC §5). Absent on every component but a Table, and on a
	 * Table with no modifier column.
	 */
	modifiers?: ModifierSource;
}

/** One component as the sheet found it: read, or the reason it was not. */
export interface ReadComponent {
	config: ComponentConfig;
	/** Undefined where the layout named a type the registry does not have. */
	component: ComponentDefinition | undefined;
	data: unknown;
	/** Why this component's section would not read, or null where it did. */
	error: string | null;
}

/**
 * What one component contributes to the two tables above.
 *
 * **A section that failed to read publishes nothing and holds no rows.** A
 * failed read leaves `data` null, and null is a card with nothing stored yet
 * rather than a card that could not be read — so without this a Table whose
 * markdown is malformed hands out its declared rows with blank cells, a total
 * reads 0 and an aggregate reads 0 or the declared-row count, beside a card
 * saying it could not read the section. That is the quietly wrong number
 * `columnTotal`, `scopeValues` and the row set all refuse by design, and from
 * here it reaches a Pool's max and a reset's `to`.
 *
 * **Every component is listed either way**, publishing nothing where it
 * cannot. That is what lets the row table tell "there is no table called that"
 * from "that component holds no rows": a component whose section would not read
 * is on the sheet, it just cannot say what it holds.
 *
 * **It was extracted because two callers built it, and it now has one.** The
 * sheet view and the harness both assembled this list and had already drifted —
 * the harness dropping a failed component where the view listed it. Both reach it
 * through `buildSheet` now, so *that* function is where the two-hosts argument
 * lives and `sheet.test.ts`'s host scan is what holds it; outside tests, nothing
 * else calls this at all.
 *
 * **What keeps it a function of its own is the policy above, not a second
 * caller.** Turning one read component into what it publishes is a rule with
 * three paragraphs behind it, and `buildSheet` is a five-line sequence that
 * should not also be the place the rule is stated — PATTERNS §1's "one
 * responsibility per file" read at the function.
 *
 * The test files that mirror `renderSheet` call this directly, and that is not a
 * mirror calling the thing it mirrors: what they exist to prove is the
 * composition — read every section, publish, resolve, write — which no test can
 * reach through the view itself. Re-deriving the publication policy beside it
 * would only mean their assertions held for a lookalike.
 */
export function publishedComponent({
	config,
	component,
	data,
	error,
}: ReadComponent): PublishedComponent {
	const readable = error === null ? component : undefined;
	return {
		id: config.id,
		values: readable?.scopeValues?.(data, config) ?? {},
		rows: readable?.scopeRows?.(data, config),
		modifiers: readable?.scopeModifiers?.(data, config),
		resolver: component
			? (env) => makeFieldResolver(component, config, data, env)
			: undefined,
		explainer: component
			? (env) => makeFieldExplainer(component, config, data, env)
			: undefined,
	};
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
 * components publish, the layout's functions, the rows an aggregate walks, and
 * what has been pushed at each published name.
 *
 * The three tables are mutually lazy, and that is the whole of the construction.
 * `env` is handed out before any of them exists, holding closures that reach the
 * tables built below it; nothing calls them until a formula is evaluated, which
 * is long after all three are in place. Each keeps its own memoisation and its
 * own re-entry guard, because they guard different things: one a name that needs
 * its own result, one a row set being walked while it is already being walked,
 * and one a modifier amount waiting on the total it is part of.
 */
export function buildSheetEnv(
	components: readonly PublishedComponent[],
	library: FunctionLibrary = NO_FUNCTIONS,
	/**
	 * The layout's modifier definitions, and the names a breakdown is offered
	 * for. Assembled once by `sheetModifierInput`, so the slot table and the
	 * sheet's own `ModifierContext` cannot disagree about either.
	 */
	modifiers: SheetModifiers = NO_SHEET_MODIFIERS,
): FormulaEnv {
	const env: FormulaEnv = {
		library,
		sheet: (name) => names(name),
		rows: (id, caller) => rows(id, caller),
		modifiers: (name) => slots(name),
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
	const slots = buildModifierTable(
		components.map((component): ModifierComponent => {
			const source = component.modifiers;
			if (source === undefined) return { id: component.id };
			// The same resolver the name table binds, so a computed column in a
			// modifier row's scope resolves through exactly the path a published
			// row's cell does. A component with none still declares enrolments;
			// what it gets is a reader that finds no field, which is what a
			// component declaring no formula fields would have anyway.
			const resolve = component.resolver?.(env) ?? ((): null => null);
			return { id: component.id, pushes: () => source(resolve) };
		}),
		modifiers.definitions,
		// The sheet as a definition's expressions see it: the layout's functions,
		// the names to fall through to, and the row table an amount may aggregate
		// over. Through `callsFrom`, which is the one conversion (`resolve.ts`).
		callsFrom(env),
	);
	return env;
}

/**
 * The layout's half of the modifier machinery, assembled once.
 *
 * Two facts, and both are properties of the *layout* rather than of a note: which
 * changes it declares, and which of its published names take one. Held together
 * because every consumer wants both — the slot table resolves an enrolment against
 * the definitions, and both of `ModifierContext`'s questions are bounded by the
 * accepting set — and because deriving either twice is precisely the bug the
 * shipped feature had to fix.
 *
 * **Nothing here bounds the arithmetic.** That is worth saying at the top because
 * this file said the opposite of its own member two paragraphs down, and a reader
 * checking the bound got whichever answer they read first. The override is applied
 * in `formula/resolve.ts`, bounded by the slot actually having been read on the
 * path an evaluation took — which is tighter than this set and must be, since the
 * language's `if` is lazy and this set is deliberately lazy-proof.
 */
export interface SheetModifiers {
	/** Every usable definition, in declaration order. */
	definitions: readonly ModifierDefinitionView[];
	/**
	 * The accepting targets with their labels, in publication order.
	 *
	 * The form's **Changes** select is over this, and so is the layout editor's own
	 * picker: one derivation, so the sheet and the pane cannot offer different
	 * lists. It is the same set `accepting` below is a bare index of.
	 */
	targets: readonly ModifierTarget[];
	/**
	 * Every published name and its label, whether or not it accepts a modifier.
	 *
	 * What gives a stored target outside the accepting set a *word*. Without it a
	 * popover on a player's own inventory row read `passive_perception`, which is
	 * the identifier and not the value's name.
	 */
	published: readonly ModifierTarget[];
	/**
	 * The layout's declared bonus types, in declaration order.
	 *
	 * The form's **Bonus type** select, and the test behind `<type> (not declared)`
	 * on a typed effect naming one the layout dropped.
	 */
	bonusTypes: readonly string[];
	/**
	 * The published names whose own formula reads a modifier.
	 *
	 * What `ModifierContext`'s two questions are bounded by, and nothing more. A
	 * name that accepts no modifier gets no breakdown, which keeps a card from
	 * drawing a mark over a change that is not being applied; and an enrolment
	 * whose target accepts none reports that it changes nothing, which keeps a
	 * modifier cell's glyph from claiming an effect and is the only bound on the
	 * one query that enters the modifier walk from the sheet.
	 *
	 * **The override step is bounded elsewhere and more tightly** — by the slot
	 * actually having been read on the path an evaluation took (`resolve.ts`) — so
	 * nothing here decides arithmetic. The header above says the same thing; they
	 * disagreed once, which is how a second `override + total` came to be written
	 * under this bound instead of that one.
	 */
	accepting: ReadonlySet<string>;
}

/** A layout with no modifiers, and the paths with no layout at all. */
export const NO_SHEET_MODIFIERS: SheetModifiers = {
	definitions: [],
	targets: [],
	published: [],
	bonusTypes: [],
	accepting: new Set(),
};

/**
 * The one assembly of the pair above.
 *
 * Here beside `buildSheetEnv`, `sheetModifiers` and `publishedComponent`, and
 * **`buildSheet` is its only caller** — the two-hosts argument that extracted all
 * four of them is that function's now, and `sheet.test.ts`'s host scan is what
 * holds the view and the harness to it. What earns this one its own name is the
 * derivation below: the accepting set is a property of the layout and getting it
 * from anywhere else is the bug this function exists to make unspellable.
 *
 * **The accepting set is derived from the static sources**, which is the half that
 * had a bug in it before: deriving it from a note's data made a transient fact
 * about one character decide what a layout accepts — a broken section or an
 * unreadable column total dropped names the editor still offered.
 * `modifierTargetSource` is the one answer, and both hosts reach it through the
 * same function the editor does.
 */
export function sheetModifierInput(
	definitions: readonly ModifierDefinitionView[],
	sources: readonly ModifierTargetSource[],
	/**
	 * The layout's declared bonus types, already read.
	 *
	 * Handed in rather than parsed here, because `parseModifierTypes` also reports
	 * every definition typed against a name the layout does not declare and that
	 * report belongs to the editor. This wants only the vocabulary.
	 */
	bonusTypes: readonly string[] = [],
): SheetModifiers {
	const targets = acceptingTargets(sources);
	return {
		definitions,
		targets,
		published: publishedTargets(sources),
		bonusTypes,
		accepting: new Set(targets.map((target) => target.name)),
	};
}

/**
 * Everything a formula on this sheet resolves against, assembled in one call.
 *
 * **The one place the sequence is spelled, and it exists because review could not
 * see it.** Four steps have to happen in one order — a source per component, the
 * layout's definitions read against those sources, the pair held together, the
 * environment built over it, the context built over that — and they were written
 * out at three sites: the sheet view, the harness, and the fixture test.
 * `sheetModifierInput` extracted the *number* and left the *application*
 * triplicated, which is `PATTERNS.md` §1's own named trap: share the application,
 * not just the fact.
 *
 * **What that cost, measured rather than argued.** On a copy of the tree, three
 * separate mutations each left the full suite green: dropping the third argument
 * to `buildSheetEnv` in the view, the same in the harness, and handing `[]` where
 * the parsed definitions go. None of them crashes — the slot table simply holds
 * no definitions, so nothing applies and every card reads unmodified, **while a
 * modifier cell still resolves its own name against `modifiers.definitions` and
 * draws `zap`.** A sheet of magic items that do nothing, with glyphs saying they
 * do. `sheet.test.ts`'s host scan is what turns each of those mutations red now.
 *
 * It also makes the ordering unstateable wrongly, which is the half a guard
 * cannot cover: the environment must exist before the context that reads it, and
 * both must be built over one `SheetModifiers`.
 *
 * **It takes the `Layout`, and that is a folder dependency this file did not have
 * before.** `parse/` already imports `formula/` — `parse/layout.ts` takes `isName`
 * and the reserved id — so the two are now mutually dependent at the folder level,
 * with no module cycle: nothing `parse/modifier-definitions.ts` reaches imports
 * this file back. The alternative is a fourth copy of the sequence somewhere that
 * may import both, and a copy is what this function exists to delete. Both halves
 * stay pure, so Constraint 5 is untouched.
 */
export function buildSheet(
	layout: Layout,
	/** Every component as the sheet found it, read or refused. */
	prepared: readonly ReadComponent[],
	library: FunctionLibrary = NO_FUNCTIONS,
	/**
	 * How this host writes one appended definition into the layout file (§8).
	 *
	 * **A host's, because a component never touches the file and neither does
	 * `formula/`.** Absent where there is nothing to write to — a component
	 * rendered on its own, a formula evaluated in a test — and the form then
	 * refuses the gesture with a sentence rather than hiding it, so nothing about
	 * the surface depends on which host drew it.
	 */
	promote?: (name: string, effect: TypedEffect) => Promise<PromoteResult>,
): { env: FormulaEnv; modifiers: ModifierContext } {
	/*
	 * The sources come from the *configuration* and never from a note, which is
	 * SPEC §7's decision: which names accept a modifier, and which changes the
	 * layout declares, are properties of the layout. `modifierTargetSource` is
	 * where that is argued, and one call here is what stops a host reaching a
	 * different answer from the layout editor's.
	 */
	const sources = prepared.map((entry) =>
		modifierTargetSource(entry.config, entry.component),
	);
	// A definition that cannot be used is left out and reported in the editor,
	// exactly as an unparseable function definition is.
	const input = sheetModifierInput(
		parseModifierDefinitions(layout, sources).definitions,
		sources,
		// The vocabulary only. Every problem this parser reports is the editor's,
		// and reporting one here would be `docs/UI.md` §9's two answers to one
		// question.
		parseModifierTypes(layout).names,
	);
	const env = buildSheetEnv(prepared.map(publishedComponent), library, input);
	return { env, modifiers: sheetModifiers(input, env, promote) };
}

/**
 * What a component cannot work out about modifiers for itself (SPEC §5): which
 * changes this layout declares, what one row's enrolment comes to, and what has
 * been pushed at a given name.
 *
 * Here beside `buildSheetEnv` and `publishedComponent`, and **`buildSheet` is its
 * only caller** — the two-hosts argument that extracted all four of them is that
 * function's now, and `sheet.test.ts`'s host scan is what holds the view and the
 * harness to it. What earns this one its own name is the two rules below, which
 * decide what a component may draw and are too load-bearing to state inside a
 * five-line sequence.
 *
 * **Nothing at all for a name that accepts no modifier**, and that is a rule
 * rather than an optimisation. It is what keeps a card from drawing a mark over an
 * enrolment that is not being applied — a definition aimed at a value whose
 * formula reads no slot changes nothing, and the place that says so is the
 * editor's report beside the target picker that chose it. It also means a name
 * nothing could read never sets the walk going.
 *
 * **A refused slot has no breakdown either.** The refusal is already on the card
 * as `?` with the row named under it, through the formula that read the slot; a
 * breakdown of nothing is the honest companion, because there is no number to
 * take apart.
 */
export function sheetModifiers(
	modifiers: SheetModifiers,
	env: FormulaEnv,
	/** The host's layout write (§8), or nothing where this host has none. */
	promote?: (name: string, effect: TypedEffect) => Promise<PromoteResult>,
): ModifierContext {
	const table = definitionTable(modifiers.definitions);
	const calls = callsFrom(env);
	/**
	 * The reader's own word for a published name.
	 *
	 * The accepting map first, since a definition's own view is built from it;
	 * then the published one, which is the case the sheet had wrong — a value that
	 * reads no modifier is still *published*, so it has a label. The bare name is
	 * left only for a target this layout does not publish at all, where there is
	 * nothing else it could be called, which is the case a typed effect reaches by
	 * a hand-edited cell naming a value that is not there.
	 */
	const labels = new Map<string, string>();
	for (const target of modifiers.published) labels.set(target.name, target.label);
	for (const target of modifiers.targets) labels.set(target.name, target.label);
	const label = (name: string): string => labels.get(name) ?? name;
	return {
		definitions: modifiers.definitions,
		targets: modifiers.targets,
		published: modifiers.published,
		bonusTypes: modifiers.bonusTypes,
		/*
		 * **Bounded by the accepting set, on the same terms `breakdown` is**, and
		 * that bound is doing two jobs.
		 *
		 * It is the *only* bound on this query, and this query is what enters the
		 * modifier walk from the sheet: a modifier cell asks it **once per modifier
		 * its cells name**, so ungated it entered the walk at the enrolment's own
		 * target — which need not accept a modifier and need not even be published
		 * — and, running at render in grid order, could be the first entry in a
		 * render. That is the widening SPEC §13's finding describes; the override
		 * step widens nothing, because `resolve.ts` asks only where a formula
		 * already asked. Bounded here, the widening is exactly the accepting set,
		 * which is what the finding was written against.
		 *
		 * **A cell holding a list changed the wording and not the substance**: the
		 * count was always per *enrolment*, so three modifiers in one cell ask three
		 * times exactly as three cells did. What is new is one clause, and it
		 * *narrows*: the cell's popup asks this for definitions the row does **not**
		 * name, to say what each would do — but it asks on a **press**, which happens
		 * after a render has finished, so those calls can never be the first entry
		 * into the walk *in a render*. They add reachability, bounded by the layout's
		 * own definitions list, at one opening's cost. Recorded, not designed around,
		 * and not closed.
		 *
		 * And it stops the glyph saying the wrong thing at rest. A definition aimed
		 * at a value whose own formula reads no modifier changes nothing, and
		 * ungated the row drew `zap` claiming it did — the reduction at that name
		 * has no line to suppress, so nothing downstream could tell. Nothing is
		 * lost by refusing here: there is no arithmetic at a name nothing reads.
		 *
		 * **The sentence is the reader's and not the author's, which is a split
		 * rather than a softening.** This one is read on a sheet by whoever is
		 * holding the character, and the fix is a formula in a file they may not
		 * own — so it names the target in the words the sheet already uses for it
		 * (`targetLabel`, which now falls back to the *published* label and not to
		 * the identifier), says the value does not take modifiers, and says whose
		 * job that is. The literal `+ mod.self` stays in
		 * `parse/modifier-definitions.ts`'s report, which is drawn beside the target
		 * picker that chose the target, for the person who can act on it — and where
		 * the raw name is right too, because an author works in names. Two surfaces,
		 * one fact, each in its own reader's vocabulary; the stray-reference message
		 * already has the same shape, telling the reader to choose another and the
		 * author to add one.
		 */
		outcome: (part, row) => {
			const found = resolveEnrolment(table, part, row, calls);
			if (
				found.kind === 'applies' &&
				!modifiers.accepting.has(found.contribution.target)
			) {
				const named = label(found.contribution.target);
				return {
					definition: found.definition,
					typed: found.typed,
					target: found.contribution.target,
					targetLabel: named,
					applies: false,
					amount: found.contribution.amount,
					condition: found.conditional ? true : null,
					suppressed: `${named} does not take modifiers, so nothing changes. Its own formula has to ask for them, which is a layout edit.`,
				};
			}
			return enrolmentOutcome(found, (target) => env.modifiers(target), label);
		},
		breakdown: (name) => {
			if (!modifiers.accepting.has(name)) {
				return { lines: [], override: null, total: 0 };
			}
			const result = env.modifiers(name);
			return 'error' in result
				? { lines: [], override: null, total: 0 }
				: { lines: result.lines, override: result.override, total: result.total };
		},
		/*
		 * **Refused rather than absent where the host has no writer**, so the form
		 * is one surface however it was drawn: a member that came and went would
		 * make the promote row appear on a sheet and vanish in a harness, and a
		 * reviewer could not tell which was the design.
		 */
		promote:
			promote ??
			(() =>
				Promise.resolve({
					error: 'This sheet cannot save a modifier to its layout.',
				})),
	};
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

	/** Every name registered below, in declaration order, for the slot pass. */
	const published: string[] = [];

	for (const component of components) {
		const resolve = component.resolver?.(bound);

		const register = (name: string, entry: ScopeEntry): void => {
			// The stored value is always reachable, whatever the card shows.
			published.push(name);
			thunks.set(`${name}.value`, () => clean(entry.value));

			// A display that will not resolve publishes nothing rather than
			// falling back to the stored value: handing back 22 where 6 was
			// meant is a worse answer than none at all. The same holds for a
			// computed entry, which is why both go through this.
			const worth = (result: Value | null | undefined) =>
				result === null || result === undefined ? undefined : clean(result);

			const { display, compute } = entry;
			if (compute !== undefined) {
				// A component with no resolver of its own still computes: what
				// it is handed is a resolver that finds no field, which is what
				// a component declaring no formula fields would have anyway.
				thunks.set(name, () => worth(compute(resolve ?? (() => null))));
				return;
			}
			if (display === undefined || resolve === undefined) {
				thunks.set(name, () => clean(entry.value));
				return;
			}
			// The name it is being registered under goes to the resolver, so
			// `mod.self` inside a `display` means the slot of the name this
			// formula's result becomes — and publication and render resolve the
			// same expression against the same scope, which is the existing rule
			// that a name and the cell it came from must not disagree.
			thunks.set(name, () =>
				worth(resolve(display.field, display.scope, name)),
			);
		};

		if (component.values.self) register(component.id, component.values.self);
		for (const [name, entry] of Object.entries(component.values.named ?? {})) {
			register(`${component.id}.${name}`, entry);
		}
	}

	/*
	 * One slot per published name (SPEC §5), registered after every name so the
	 * namespace's domain *is* the published-name set. That is what makes the two
	 * rules structural rather than checked: `mod.armour_class` resolves to 0 on a
	 * sheet publishing `armour_class` and nothing pushing at it, and
	 * `mod.armor_class` on the same sheet fails as an unknown name rather than
	 * quietly reading zero.
	 *
	 * A slot is a name in this table, behind this table's guard, and so is lazy
	 * like every other name — deliberately, since warming them in a fixed order
	 * would bias which of the two cycle guards closes a ring both could catch,
	 * and that is SPEC §13's open question rather than this feature's to take.
	 *
	 * Only the bare names get one. `mod.<name>.value` is not a thing to ask for:
	 * a `mod.` entry is not a `ScopeEntry` and answers to no `.value`, which is
	 * what keeps §13's published-name depth question closed.
	 *
	 * A refused slot throws rather than answering undefined, because that is the
	 * only route to the sentence: a thrown `FormulaError` reaches `fieldReaders`'
	 * `explain` and lands under the reader's eye naming the row that stopped it,
	 * where an absent name would only ever say `mod.self` is unknown. The memo
	 * above holds only what resolved, so nothing caches the refusal.
	 */
	for (const name of published) {
		thunks.set(modifierSlot(name), () => {
			const result = bound.modifiers(name);
			if ('error' in result) throw new FormulaError(result.error);
			return result.total;
		});
	}

	return scope;
}
