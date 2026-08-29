/*
 * Which published names accept a modifier (SPEC §5).
 *
 * One job: read a layout and answer, for every name it publishes, whether some
 * formula on it reads a modifier for that name. Nothing here touches a push, a
 * total, a resolver or a sheet — it is a text scan over configuration, and it
 * needs no render, which is exactly what lets the layout editor and the sheet
 * reach the same answer without a character in hand.
 *
 * **Split from `modifiers.ts`, which held this and the runtime slot table.**
 * Those are two questions with two disjoint type families and two disjoint sets
 * of consumers: that file answers "what has been pushed at this name" against a
 * live sheet, lazily and behind a re-entry guard, and this answers "could
 * anything be pushed at this name at all" against a file. The vocabulary they
 * share is the slot spelling, which is imported rather than duplicated —
 * `PATTERNS.md` §1's test is whether a reader can state a file's job without an
 * "and", and the joint header could not.
 *
 * **The assembly is here too, and that is the point of the module.** Both the
 * sheet and the layout editor need the same list of sources, and three doc
 * comments used to assert they computed it from the same input while two
 * independent assemblies produced it from different inputs. The divergence was
 * reachable: a Table with a prose cell in a totalled number column publishes no
 * total on the sheet, where the editor read that total as 0 and offered the
 * name; and a component whose section failed to read published nothing on the
 * sheet and its whole name set in the editor. `modifierTargetSource` is the one
 * answer to that question, and `modifier-targets.test.ts` drives both callers
 * over one layout that used to split them.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	ModifierTarget,
	ScopeValues,
} from '../types';
import { referencesName } from './expression';
import { modifierSlot, SELF_SLOT } from './modifiers';
import { formulaTexts } from './resolve';

/**
 * A component as the accepting-set check sees it: what it publishes, and every
 * expression its configuration holds.
 *
 * Built by `modifierTargetSource` below and by nothing else, which is what keeps
 * the sheet and the editor from assembling it twice with different inputs.
 */
export interface ModifierTargetSource {
	id: string;
	/**
	 * The component's own label, which is what a picker shows for its names.
	 * Absent falls back to the id, which is the only name there is then.
	 */
	label?: string;
	values: ScopeValues;
	/** Every expression this component's configuration holds. */
	formulas?: readonly string[];
}

/**
 * Which published names accept a modifier, in the order the layout declares them.
 *
 * **Computed from the layout, statically, and coarse at the component:** a
 * published name `X` accepts a modifier when some formula field on the component
 * that publishes `X` mentions `mod.self`, or when any formula field anywhere on
 * the layout mentions `mod.X`.
 *
 * Three properties, each of which is why it is this and not something cleverer:
 *
 * - **It is lazy-proof.** The language's `if` is lazy by design, so an *observed*
 *   set — which slots were asked for during a render — would report
 *   `if(equipped, value + mod.self, value)` as accepting nothing on a character
 *   whose item is stowed. A text scan cannot be fooled by a branch not taken.
 * - **It needs no render**, so the layout editor and the sheet compute the same
 *   answer from the same input, and neither has to have a character in hand.
 * - **It is coarse in the same way and for the same reason as SPEC §5's aggregate
 *   edge**, reaching the whole component: a Table where only the computed column
 *   reads `mod.self` reports every name that Table publishes as accepting,
 *   including a column total. The direction of the coarseness is over-reporting,
 *   and the sheet's own stray line at the row is what stops that being silent.
 */
export function acceptingTargets(
	components: readonly ModifierTargetSource[],
): readonly ModifierTarget[] {
	const formulas = components.flatMap((component) => [
		...(component.formulas ?? []),
	]);
	// The absolute spelling first, in one pass: a `mod.X` written anywhere on the
	// layout makes X accepting wherever X is published, so this cannot be answered
	// component by component.
	const byName = new Set(
		publishedTargets(components)
			.map((target) => target.name)
			.filter((name) =>
				formulas.some((formula) => referencesName(formula, modifierSlot(name))),
			),
	);

	const targets: ModifierTarget[] = [];
	for (const component of components) {
		const label = component.label ?? component.id;
		const relative = (component.formulas ?? []).some((formula) =>
			referencesName(formula, SELF_SLOT),
		);
		const offer = (name: string, shown: string) => {
			if (!relative && !byName.has(name)) return;
			targets.push({ name, label: shown });
		};
		if (component.values.self) offer(component.id, label);
		for (const key of Object.keys(component.values.named ?? {})) {
			offer(`${component.id}.${key}`, `${label} · ${key}`);
		}
	}
	return targets;
}

/**
 * Every name this layout publishes, with the label a reader knows it by, in
 * declaration order.
 *
 * Exported beside the accepting set because a *definition's* target needs both:
 * the accepting set says whether the target picker offers it, and this says
 * whether the layout publishes it at all — which is what separates a typo from a
 * value whose own formula reads no slot, and those have different fixes
 * (`parse/modifier-definitions.ts`).
 *
 * **It carries the label as well as the name, and the accepting set is the reason
 * it has to.** `ModifierDefinitionView.targetLabel` is what the sheet says to a
 * reader, and taking it from the accepting map alone left the one case that is
 * *not* accepting falling back to the bare identifier — so a popover on an
 * inventory row read `passive_perception — item +2` at a player. A published name
 * always has a label, whether or not anything reads a modifier for it, and the
 * derivation is `label ?? id`, plus ` · key`, exactly as above. One derivation,
 * used twice, rather than a second spelling of it in the parser.
 *
 * It answered `ModifierContext.publishes` while a *cell* held the target and the
 * sheet had to tell the two apart at the row. A target is layout data now, so the
 * question is asked once in the editor and that member is gone.
 */
export function publishedTargets(
	components: readonly ModifierTargetSource[],
): readonly ModifierTarget[] {
	const targets: ModifierTarget[] = [];
	for (const component of components) {
		const label = component.label ?? component.id;
		if (component.values.self) targets.push({ name: component.id, label });
		for (const key of Object.keys(component.values.named ?? {})) {
			targets.push({ name: `${component.id}.${key}`, label: `${label} · ${key}` });
		}
	}
	return targets;
}
/**
 * What one component contributes to the accepting set.
 *
 * **The one place the data question is answered**, and it is answered `null`.
 * SPEC §7 wants this set "computed from the layout, statically", so that "the
 * layout editor and the sheet compute the same answer from the same input, and
 * neither has to have a character in hand" — which makes the note's data not
 * merely unnecessary here but wrong. Reading it made the two disagree in two
 * reachable ways, both of them a transient fact about one character deciding
 * what a *layout* accepts:
 *
 * - a Table with a prose cell in a totalled number column publishes no total,
 *   so the sheet dropped `<id>.<key>` from the set while the editor kept it;
 * - a component whose section failed to read publishes nothing at all, so the
 *   sheet dropped its whole name set — and a card already showing its own read
 *   error would have changed a target cell's message from "reads no modifier" to
 *   "this sheet publishes no such value", sending the author to fix a layout
 *   that was never wrong.
 *
 * Takes the definition rather than looking it up, so this stays pure
 * (Constraint 5): every caller has already asked the registry for it, and a
 * layout may name a type that is not there.
 */
export function modifierTargetSource(
	config: ComponentConfig,
	definition:
		| Pick<ComponentDefinition, 'formulaFields' | 'scopeValues'>
		| undefined,
): ModifierTargetSource {
	return {
		id: config.id,
		label: config.label,
		values: definition?.scopeValues?.(null, config) ?? {},
		formulas: definition ? formulaTexts(definition, config) : [],
	};
}
