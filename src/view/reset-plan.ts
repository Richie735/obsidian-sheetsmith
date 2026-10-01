/*
 * What a reset trigger will do, worked out before anything is written (SPEC §6,
 * `docs/features/record-set-reset-scope.md`).
 *
 * **A trigger is planned at the press and written at Apply**, and the plan is
 * what both halves read: the confirmation is drawn from its outcomes and Apply
 * writes exactly its edits. That is what lets a component's own count reach the
 * confirmation without a second evaluation — `ResetReach` rides on the result
 * `applyReset` already returns — so the number a reader is shown and the parts
 * the press writes cannot come to disagree. Nothing moves in time that matters:
 * planning at the press and planning at Apply read the component data of the one
 * render that drew the button.
 *
 * **Pure, and its own module, because three things run it**: the sheet view, the
 * harness's confirmation, and `reset-flow.test.ts`, which drives this rather than
 * keeping a copy of the view's loop. A copy is what that file was, and a mirror's
 * divergence is only ever visible on a case the mirror does not have.
 *
 * **Its tests are `reset-flow.test.ts`'s**, not a file beside it named for it:
 * that file drives a trigger end to end through the real parsers and components,
 * which is the only place what this module owns is observable, and it drives
 * this module itself rather than a copy of the view's loop. A second file here
 * would have to build the same sheet before it could plan anything.
 *
 * **It learns nothing about any component's shape.** It reads shared config —
 * the bindings — and the component's declarations: `checksResetCondition`,
 * which is the component saying whether it reads a `where`, and `resetWhole`
 * and `resetColumns`, which say what a binding naming no part covers and what
 * each part is called. Everything else is the component's own answer.
 */

import {
	FormulaEnv,
	makeFormulaReaders,
	publishedFieldNames,
} from '../formula/resolve';
import { heldCondition } from '../formula/field-condition';
import {
	checksResetCondition,
	claimsSamePart,
	ComponentConfig,
	ComponentDefinition,
	ExpressionResolver,
	FieldExplainer,
	FieldResolver,
	ResetBinding,
	ResetContext,
	ResetResult,
} from '../types';

/** A component read for this render, as the view and the harness both hold one. */
export interface ResetCandidate {
	config: ComponentConfig;
	component: ComponentDefinition | undefined;
	error: string | null;
	data: unknown;
}

/** One binding the trigger matched on one component, and what it came to. */
export interface PlannedBinding {
	binding: ResetBinding;
	/** Where the binding sits in the component's own list, so `reset.<index>.to`. */
	index: number;
	result: ResetResult<unknown>;
}

/** Every binding one component holds for the trigger, in its own order. */
export interface PlannedComponent {
	config: ComponentConfig;
	component: ComponentDefinition;
	bindings: PlannedBinding[];
}

/** A component's new data, ready for its own `write`. */
export interface PlannedEdit {
	component: ComponentDefinition;
	config: ComponentConfig;
	data: unknown;
}

export interface TriggerPlan {
	/** One per component the trigger reaches, in sheet order. */
	components: PlannedComponent[];
	/** What Apply writes, and nothing else: one per binding that succeeded. */
	edits: PlannedEdit[];
	/**
	 * One line per binding that failed, `<label> — <reason>`, for the report —
	 * and one per binding that applied but skipped parts it reached, in the
	 * component's own sentence, since those parts did not reset either.
	 */
	failed: string[];
}

/**
 * Why a component that cannot check a condition is left alone.
 *
 * Framed as a `ResetResult` error, continuing `<label> — ` in lower case, so the
 * confirmation and the report after the rest read one sentence. The editor's own
 * sentence under **Only where** differs because it stands on its own line beside
 * the field it names, where this one stands after a component's label.
 */
export const UNCHECKED_CONDITION =
	'it resets as a whole, so it cannot check a condition, and this trigger leaves it as it is. Clear Only where on this reset in the layout editor.';

/**
 * The components a trigger reaches: those that read, can act on a reset, and
 * hold a binding to it — wherever they sit, and whatever is on screen.
 *
 * A component whose section failed to read is not among them: there is nothing
 * to reset it from, and a write from nothing would replace the reader's
 * hand-edit with a fresh block.
 */
export function boundTo<T extends ResetCandidate>(
	name: string,
	prepared: readonly T[],
): T[] {
	return prepared.filter(
		(entry) =>
			entry.error === null &&
			entry.component?.applyReset !== undefined &&
			// Any of its bindings, not one: a component may answer to several
			// triggers, which is how a system whose long rest includes its short
			// rest gets said at all.
			(entry.config.reset ?? []).some((binding) => binding.trigger === name),
	);
}

/**
 * Run every binding the trigger matches, and hold what each came to.
 *
 * SPEC §6: what resolves is applied and what does not is named, so failures are
 * collected rather than thrown — one broken `max` must not stop the rest of a
 * long rest.
 */
export function planTrigger(
	name: string,
	bound: readonly ResetCandidate[],
	env: FormulaEnv,
): TriggerPlan {
	const plan: TriggerPlan = { components: [], edits: [], failed: [] };

	for (const { component, config, data } of bound) {
		if (!resets(component)) continue;
		const { resolve, explain, resolveExpression } = makeFormulaReaders(
			component,
			config,
			data,
			env,
		);
		/*
		 * The same mapping the pre-resolve pass uses, so a rest restores to the
		 * ceiling the card is *drawing* rather than to the one it drew before a
		 * modifier arrived. `max` and `count` are formulas that become published
		 * names, so `mod.self` inside either has to mean the same thing on this
		 * path as it does at the render.
		 *
		 * Supplied here rather than spelled in each component: a component
		 * restating which of its own fields publishes a name would be a second copy
		 * of the conditions `scopeValues` already decides, which `PATTERNS.md` §1's
		 * one-step tier refuses.
		 */
		const published = publishedFieldNames(component, config);
		const planned: PlannedComponent = { config, component, bindings: [] };

		/*
		 * **Every binding this trigger matches, not the first.** A binding may name
		 * a column, so a long rest that clears Conditions and refills Uses on one
		 * table is two bindings. Nothing merges component data: two edits carrying
		 * one label compose through `applySectionWrites`, the second `write`
		 * reading the body the first produced.
		 */
		const matched = [...(config.reset ?? []).entries()].filter(
			([, binding]) => binding.trigger === name,
		);
		for (const [index, binding] of matched) {
			const claimed = claimingSibling(
				component,
				config,
				binding,
				matched.map(([, other]) => other),
			);
			planned.bindings.push({
				binding,
				index,
				result:
					claimed !== null
						? { ok: false, error: claimed }
						: planBinding(component, config, data, binding, index, {
								resolve,
								explain,
								published,
								resolveExpression,
							}),
			});
		}

		for (const { result } of planned.bindings) {
			if (result.ok) {
				plan.edits.push({ component, config, data: result.data });
				// Parts reached and not written, in the component's own words: the
				// report's heading — "could not reset" — is true of them too.
				if (result.skipped !== undefined) {
					plan.failed.push(`${config.label} — ${result.skipped}`);
				}
			} else plan.failed.push(`${config.label} — ${result.error}`);
		}
		plan.components.push(planned);
	}

	return plan;
}

/** A component that can act on a reset, which is what a trigger passes over the rest for. */
type Resetting = ComponentDefinition & {
	applyReset: NonNullable<ComponentDefinition['applyReset']>;
};

function resets(component: ComponentDefinition | undefined): component is Resetting {
	return component?.applyReset !== undefined;
}

/**
 * Why this binding cannot apply because another on the same trigger would write
 * one of the same parts, or null where none would
 * (`docs/features/record-set-reset-field-targeting.md`, Part 5).
 *
 * **Before either is handed to `applyReset`**, and whatever their `where`s say:
 * a binding naming no part on a component declaring `resetWhole` covers every
 * part, so beside one naming a part it is two bindings writing that part on one
 * trigger — the same-part duplicate the parser refuses, reached by a route the
 * parser cannot see. **Both fail**, each with its own sentence, because failing
 * only the later one would make file order decide which applies. Recorded as a
 * failure, as a condition a component cannot check is, so the confirmation
 * names it while **Cancel** is still there.
 *
 * The sentence takes the whole's words from `resetWhole` and a part's from
 * `resetColumns`, so it is composed without this module learning what a part is.
 */
function claimingSibling(
	component: Resetting,
	config: ComponentConfig,
	binding: ResetBinding,
	siblings: readonly ResetBinding[],
): string | null {
	/*
	 * **Only the pair the parser's key cannot see**: one naming no part beside one
	 * naming a part. A same-key pair is refused by `parseReset` before a layout
	 * loads, so it never reaches the plan, and no sentence is written for it here.
	 */
	const other = siblings.find(
		(sibling) =>
			sibling !== binding &&
			(sibling.column === undefined) !== (binding.column === undefined) &&
			claimsSamePart(component, binding, sibling),
	);
	if (other === undefined) return null;
	const offered = component.resetColumns?.(config) ?? [];
	const shown = (key: string): string =>
		offered.find((part) => part.key === key)?.label ?? key;
	const whole = component.resetWhole ?? '';
	/*
	 * **No noun for a part**: this module names none, so the fix says "something
	 * else" rather than "another field" — the component's own words arrive only as
	 * `resetWhole` and a part's label.
	 */
	const fix = 'so neither applies. Point one of them at something else, or remove one.';
	return binding.column === undefined
		? `its ${whole} reset on this trigger includes "${shown(other.column ?? '')}", which another reset on this trigger names, ${fix}`
		: `another reset on this trigger covers ${whole}, which includes "${shown(binding.column)}", ${fix}`;
}

/** One binding's outcome, or the refusal a component that cannot honour it gets. */
function planBinding(
	component: Resetting,
	config: ComponentConfig,
	data: unknown,
	binding: ResetBinding,
	index: number,
	readers: {
		resolve: FieldResolver;
		explain: FieldExplainer;
		published: ReadonlyMap<string, string>;
		resolveExpression: ExpressionResolver;
	},
): ResetResult<unknown> {
	/*
	 * **Fail closed, before the component is asked.** A condition honoured by a
	 * Record set and silently ignored by a Pool bound to the same trigger is the
	 * mis-scoped rest exactly: the author scoped it, and the Pool refilled anyway.
	 * Decided here from a declaration rather than a shape — a component that does
	 * not list `reset.*.where` has said it reads none — so the sheet learns nothing
	 * about which components have records. A blank `where` is absent, as every
	 * optional formula key is.
	 */
	if (heldCondition(binding.where) !== null && !checksResetCondition(component)) {
		return { ok: false, error: UNCHECKED_CONDITION };
	}
	return component.applyReset(
		data,
		config,
		binding,
		bindingContext(
			readers.resolve,
			readers.explain,
			index,
			readers.published,
			readers.resolveExpression,
		),
	);
}

/**
 * What `applyReset` is handed for the binding at `index` of a component's list.
 *
 * The bindings are a list, so this one's expressions live at `reset.<index>.to`
 * and `reset.<index>.where`. A component asks for each by the one name it has —
 * `reset.to`, `reset.where` — and the sheet, which knows which binding is being
 * applied, rewrites it. Any unindexed `reset.<key>`, so a key the binding gains
 * later needs no edit here.
 *
 * **Exported as the one spelling of that rewrite**, on `docs/PATTERNS.md` §1's
 * one-step tier: a component test driving `applyReset` with its own resolver
 * needs exactly this, and a copy of it in the test would go on passing after this
 * one changed. `published` is what makes `mod.self` mean the name a field
 * becomes; a caller with no names to hand leaves it out.
 *
 * `resolveExpression` is passed through untouched: it is handed text rather than
 * a path, so there is nothing to rewrite. A test with no sheet leaves it out, and
 * `src/expression-context-coverage.test.ts` holds that the plan never does.
 */
export function bindingContext(
	resolve: FieldResolver,
	explain: FieldExplainer,
	index: number,
	published: ReadonlyMap<string, string> = new Map(),
	resolveExpression?: ExpressionResolver,
): ResetContext {
	const at = (field: string): string =>
		/^reset\.[^.]+$/.test(field)
			? `reset.${index}.${field.slice('reset.'.length)}`
			: field;
	return {
		resolve: (field, scope) => resolve(at(field), scope, published.get(at(field))),
		explain: (field, scope) => explain(at(field), scope, published.get(at(field))),
		...(resolveExpression === undefined ? {} : { resolveExpression }),
	};
}
