/*
 * What a copied component depends on that a paste into another layout does not
 * carry (`docs/features/component-copy-paste.md` §5, decisions 3 and 4).
 *
 * One job, in two halves that are the same computation read from each end: at
 * copy time, the little of the *source* the report will need (`copyContext`);
 * at paste time, the list of things the author should check in the *target*
 * (`pasteDependencies`). A layout-level declaration is never carried, merged,
 * renamed or refused — a function, a trigger, a modifier definition stays
 * where it was declared — so the only help a paste can give is naming what the
 * copy leans on, and the `Notice` does that (`editor/paste-notice.ts`).
 *
 * **Pure, and imports only the registry**, on `reparent.ts`'s precedent: a
 * component's `formulaFields` say where its expressions are, and nothing here
 * learns what any component is.
 *
 * **Bonus types are no group**, and deliberately rather than by omission:
 * nothing a component stores names one (`parse/layout.ts`'s comment on
 * `modifierTypes`), so a copy can depend on none.
 */

import { getComponent } from '../components';
import { nameSpans, RESERVED_NAMES } from '../formula/expression';
import { parseFunctions } from '../formula/functions';
import { componentReferences } from '../formula/rename-names';
import { formulaTexts } from '../formula/resolve';
import { vocabularySource } from '../formula/vocabulary';
import { CopyContext } from '../parse/component-clipboard';
import { Layout } from '../parse/layout';
import { changesOf } from '../parse/modifier-definitions';
import { walkComponents } from '../parse/layout-walk';
import { ComponentConfig, ResetBinding } from '../types';

/** The six kinds of thing, in the order the `Notice` names them. */
export type DependencyGroup =
	| 'reset'
	| 'definition'
	| 'function-differs'
	| 'function-missing'
	| 'name-here'
	| 'name-missing';

/** One reset binding the copy carries, as the detail of its trigger's thing. */
export interface CarriedBinding {
	/** The label of the copied component holding it. */
	component: string;
	action?: ResetBinding['action'];
	to?: string;
	column?: string;
	buffer?: ResetBinding['buffer'];
}

/**
 * What each thing knows beyond its name — computed so a test can hold decision
 * 4's promise (every binding named with its action and `to`), and so a later
 * surface that shows it has nothing to re-derive. Nothing draws it today.
 */
export type DependencyDetail =
	| { kind: 'reset'; trigger: string; declaredHere: boolean; bindings: CarriedBinding[] }
	| { kind: 'definition'; name: string; targets: string[]; here: boolean }
	| { kind: 'function'; name: string; here: string | null; source: string | null }
	| { kind: 'name'; name: string; here: string | null };

/** One thing a cross-layout copy depends on. */
export interface Dependency {
	group: DependencyGroup;
	/** How the `Notice` spells it: `prof`, `mod()`, `the "long rest" reset`. */
	spelled: string;
	detail: DependencyDetail;
}

const ORDER: readonly DependencyGroup[] = [
	'reset',
	'definition',
	'function-differs',
	'function-missing',
	'name-here',
	'name-missing',
];

/**
 * The names a component's own scope answers before the sheet does: `value`,
 * and the row names a formula written inside it reads per row. The rewrite and
 * this report skip the same ones, so they are one function.
 */
export function localNames(config: ComponentConfig): ReadonlySet<string> {
	const rows = vocabularySource(config, getComponent(config.type)).rowNames;
	return new Set(['value', ...rows.map((row) => row.name)]);
}

/** A component and everything inside it, in walk order. */
export function subtree(root: ComponentConfig): ComponentConfig[] {
	return walkComponents([root]).map((entry) => entry.config);
}

/** Every expression a component's configuration holds. */
function expressionsOf(config: ComponentConfig): readonly string[] {
	const definition = getComponent(config.type);
	return definition === undefined ? [] : formulaTexts(definition, config);
}

/**
 * Each function's definition line as written, for the one definition per name
 * `parseFunctions` keeps — so a first line that failed to read, and a second
 * definition of a name already defined, are never what is compared.
 */
function functionLines(layout: Layout): ReadonlyMap<string, string> {
	return parseFunctions(layout.functions).lines;
}

/** What a formula reads beyond itself: the ids it names, and the functions it calls. */
interface Reads {
	/** Outside names, first segment only, in first-seen order. */
	names: string[];
	/** Called functions that are not built in, in first-seen order. */
	calls: string[];
}

function readsOf(copied: readonly ComponentConfig[]): Reads {
	const ids = new Set(copied.map((config) => config.id));
	const names: string[] = [];
	const calls: string[] = [];
	for (const config of copied) {
		const local = localNames(config);
		for (const source of expressionsOf(config)) {
			for (const reference of componentReferences(source, local) ?? []) {
				if (!ids.has(reference.id) && !names.includes(reference.id)) {
					names.push(reference.id);
				}
			}
			for (const span of nameSpans(source) ?? []) {
				if (!span.call || RESERVED_NAMES.includes(span.text)) continue;
				if (!calls.includes(span.text)) calls.push(span.text);
			}
		}
	}
	return { names, calls };
}

/** Every name this copy reads from outside itself, which a suffixed id must never take. */
export function outsideNames(root: ComponentConfig): string[] {
	return readsOf(subtree(root)).names;
}

/**
 * The published names a modifier definition changes, read through the
 * parser's own `changesOf`, so a flat `target` left beside a `changes` list is
 * ignored here exactly as the sheet ignores it.
 */
function definitionTargets(raw: Record<string, unknown>): string[] {
	return changesOf(raw)
		.map((change) => (typeof change.target === 'string' ? change.target.trim() : ''))
		.filter((target) => target !== '');
}

/** The component id a published name belongs to: its first segment. */
function ownerOf(target: string): string {
	return target.split('.')[0] as string;
}

/** A definition's name as written, or null for one with none. */
function definitionName(raw: Record<string, unknown>): string | null {
	return typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim() : null;
}

/**
 * What the report will need of the source, taken while the source is at hand:
 * the definition line of each function the copy calls or reads bare, and the
 * source's modifier definitions that change a copied component, each with the
 * labels of what it changes. Report-only: none of it is ever written into the
 * target (`parse/component-clipboard.ts`).
 */
export function copyContext(source: Layout, root: ComponentConfig): CopyContext {
	const copied = subtree(root);
	const reads = readsOf(copied);
	const lines = functionLines(source);
	const functions: Record<string, string> = {};
	for (const name of [...reads.calls, ...reads.names]) {
		const line = lines.get(name);
		if (line !== undefined) functions[name] = line;
	}
	const labels = new Map(copied.map((config) => [config.id, config.label]));
	const definitions: CopyContext['definitions'] = [];
	for (const raw of (source.modifiers ?? []) as unknown as Record<string, unknown>[]) {
		const name = definitionName(raw);
		if (name === null) continue;
		const targets: string[] = [];
		for (const target of definitionTargets(raw)) {
			const label = labels.get(ownerOf(target));
			if (label !== undefined && !targets.includes(label)) targets.push(label);
		}
		if (targets.length > 0) definitions.push({ name, targets });
	}
	return { functions, definitions };
}

/** Two definition lines are the same definition where only their spacing differs. */
function sameLine(a: string, b: string): boolean {
	return a.replace(/\s+/g, '') === b.replace(/\s+/g, '');
}

/**
 * Every thing `root` (with its original ids) depends on that `target` may not
 * mean the same way, in the `Notice`'s order, each named once however many
 * formulas read it.
 *
 * - **A reset binding is always listed**, whether or not the target declares
 *   its trigger: a Hit Dice Track binds to "long rest" in two editions of one
 *   game, every name resolves, and the half-recovery arithmetic on the binding
 *   is still the other edition's.
 * - **A function defined identically in both drops out**; one defined
 *   differently, or not at all, is listed. Where the copy carried no line for
 *   it, a function is listed only when the target lacks it.
 * - **A name the target has is still listed**: the target cannot tell whether
 *   its `prof` is the source's, and hiding "probably the same" is how a sheet
 *   shows the wrong number with nothing saying why.
 */
export function pasteDependencies(
	root: ComponentConfig,
	context: CopyContext,
	target: Layout,
): Dependency[] {
	const copied = subtree(root);
	const reads = readsOf(copied);
	const here = new Map(
		walkComponents(target.components).map((entry) => [entry.config.id, entry.config.label]),
	);
	const lines = functionLines(target);
	const found: Dependency[] = [];
	const add = (dependency: Dependency): void => {
		if (found.some((one) => one.spelled === dependency.spelled)) return;
		found.push(dependency);
	};

	const triggers = new Set((target.triggers ?? []).map((name) => name.trim()));
	const byTrigger = new Map<string, CarriedBinding[]>();
	for (const config of copied) {
		for (const binding of config.reset ?? []) {
			const carried: CarriedBinding = { component: config.label };
			if (binding.action !== undefined) carried.action = binding.action;
			if (binding.to !== undefined) carried.to = binding.to;
			if (binding.column !== undefined) carried.column = binding.column;
			if (binding.buffer !== undefined) carried.buffer = binding.buffer;
			const list = byTrigger.get(binding.trigger) ?? [];
			list.push(carried);
			byTrigger.set(binding.trigger, list);
		}
	}
	for (const [trigger, bindings] of byTrigger) {
		add({
			group: 'reset',
			spelled: `the "${trigger}" reset`,
			detail: { kind: 'reset', trigger, declaredHere: triggers.has(trigger), bindings },
		});
	}

	const definitionsHere = new Set(
		((target.modifiers ?? []) as unknown as Record<string, unknown>[])
			.map(definitionName)
			.filter((name): name is string => name !== null),
	);
	for (const definition of context.definitions) {
		add({
			group: 'definition',
			spelled: `the "${definition.name}" modifier`,
			detail: {
				kind: 'definition',
				name: definition.name,
				targets: definition.targets,
				here: definitionsHere.has(definition.name),
			},
		});
	}

	/*
	 * `called` is how the copy wrote it, which is how the notice spells it:
	 * `mod()` for a call, and `prof` for a zero-parameter function read bare,
	 * since a bare read is a name (SPEC §5). It stays in the function groups all
	 * the same, because what the author has to check is the definition, and
	 * grouping it there is what lets an identical one drop out.
	 */
	const functionThing = (name: string, called: boolean): void => {
		const line = lines.get(name) ?? null;
		const source = context.functions[name] ?? null;
		if (line !== null && (source === null || sameLine(line, source))) return;
		// One thing per function, however the copy spelled its uses.
		if (found.some((one) => one.detail.kind === 'function' && one.detail.name === name)) return;
		add({
			group: line === null ? 'function-missing' : 'function-differs',
			spelled: called ? `${name}()` : name,
			detail: { kind: 'function', name, here: line, source },
		});
	};
	for (const name of reads.calls) functionThing(name, true);

	for (const name of reads.names) {
		const label = here.get(name);
		if (label !== undefined) {
			add({ group: 'name-here', spelled: name, detail: { kind: 'name', name, here: label } });
			continue;
		}
		// A zero-parameter function reads as a bare name (SPEC §5): `prof`.
		if (context.functions[name] !== undefined || lines.has(name)) {
			functionThing(name, false);
			continue;
		}
		add({ group: 'name-missing', spelled: name, detail: { kind: 'name', name, here: null } });
	}

	return ORDER.flatMap((group) => found.filter((one) => one.group === group));
}
