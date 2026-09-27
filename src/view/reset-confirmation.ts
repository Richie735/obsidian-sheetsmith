/*
 * What a trigger's confirmation says, and the one place it is opened
 * (SPEC §6, `docs/features/record-set-reset-scope.md`).
 *
 * **One opener for the sheet and the harness**, so the message, the button and
 * each line a reader is shown are spelled once: the harness photographs this and
 * claims to be showing the view's own words, which is only true if there is one
 * copy of them. The plan it draws from is `reset-plan.ts`'s, so what the lines
 * say and what **Apply** writes come from one evaluation.
 */

import type { App } from 'obsidian';
import { ConfirmModal } from '../ui/confirm-modal';
import { ComponentDefinition } from '../types';
import { PlannedComponent } from './reset-plan';

/** What one confirmation line is drawn from: a component's planned bindings. */
type PlannedLines = Pick<PlannedComponent, 'config' | 'bindings'> & {
	component: ComponentDefinition | undefined;
};

/**
 * Ask before applying a planned trigger, listing what it will reset.
 *
 * `onApply` runs only on **Apply**; **Cancel** writes nothing, which is why the
 * plan is made before this opens rather than after.
 */
export function openResetConfirmation(
	app: App,
	name: string,
	plan: { readonly components: readonly PlannedLines[] },
	onApply: () => void,
): void {
	new ConfirmModal(
		app,
		`Apply ${name}? This can be undone. It resets:`,
		`Apply ${name}`,
		onApply,
		plan.components.map((planned) => resetSummary(name, planned)),
	).open();
}

/**
 * What a trigger will touch on one component, for the confirmation, drawn from
 * the plan the press made.
 *
 * The component's label alone over-claims now that a binding can name a column:
 * a reader pressing **Long rest** was told "It resets: Spell list" and watched
 * one of three columns change, on a component whose other columns the feature
 * guarantees are left byte-identical. This is the one surface whose whole job is
 * to say what a press will touch, so it is the one place the difference has to
 * appear — the sheet itself draws no mark, because a binding is a fact about the
 * layout rather than a state of the data.
 *
 * **And now the planned outcome, which is what lets it catch a mis-scoped rest
 * before anything is written** (`docs/features/record-set-reset-scope.md`): a
 * component that reports how much of itself a binding reaches reads `Rest
 * features — 2 of 5`, and one whose plan failed reads `— will not reset:` and
 * the component's own reason, which is the same string the report after the rest
 * shows. `0 of 5` is listed rather than dropped, because a rest reaching nothing
 * on a list is exactly the mis-scope the count exists to show.
 *
 * **It teaches this file nothing about columns or records.** `binding.column` is
 * shared config the view already reads, the label comes back from the
 * component's own `resetColumns`, and the reach is the component's own count. A
 * component that names no part of itself and reports no reach is unchanged.
 *
 * A function over the two fields it reads rather than a method on the view,
 * because `SheetView` cannot be constructed without a workspace and this has to
 * be driven directly; and a module of its own rather than a line in the view,
 * because the harness draws the same confirmation and must not import the view to
 * do it.
 */
export function resetSummary(
	name: string,
	planned: PlannedLines,
): string {
	const { config, component } = planned;
	const matched = planned.bindings.filter(
		({ binding }) => binding.trigger === name,
	);
	const failed = matched.filter(({ result }) => !result.ok);
	const succeeded = matched.filter(({ result }) => result.ok);
	const offered = component?.resetColumns?.(config) ?? [];
	const shown = (key: string) =>
		offered.find((column) => column.key === key)?.label ?? key;
	const reason = (entry: (typeof matched)[number]) =>
		entry.result.ok ? '' : entry.result.error;

	if (matched.length > 0 && succeeded.length === 0) {
		// Nothing on this component will move. Every reason, since each binding
		// failed for its own; one binding is by far the common case.
		return `${config.label} — will not reset: ${failed.map(reason).join(' ')}`;
	}

	const columns = succeeded
		.map(({ binding }) => binding.column)
		.filter((column): column is string => column !== undefined)
		.map(shown);
	/*
	 * **Some of a component's bindings failed and some did not**, which only a
	 * component whose bindings name parts can reach — one trigger, two columns.
	 * Said per part, after the parts that do move, so the line does not claim a
	 * component will not reset when most of it will.
	 */
	const refusals = failed.map(({ binding, result }) => {
		const part = binding.column === undefined ? '' : `${shown(binding.column)} `;
		return `${part}will not reset: ${result.ok ? '' : result.error}`;
	});
	const reach = succeeded.length === 1 ? succeeded[0]?.result : undefined;
	const counted =
		reach?.ok === true && reach.reach !== undefined
			? `${reach.reach.reached} of ${reach.reach.of}`
			: undefined;

	const parts = [
		...(columns.length > 0 ? [columns.join(', ')] : []),
		...(counted !== undefined ? [counted] : []),
		...refusals,
	];
	return parts.length === 0 ? config.label : `${config.label} — ${parts.join('; ')}`;
}
