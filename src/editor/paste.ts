/*
 * Putting a copied component into a layout, and putting one component's
 * configuration onto another (`docs/features/component-copy-paste.md` §4, §6).
 *
 * One job: the edit a paste makes to a layout, decided and checked before the
 * pane sees any of it. Both functions work on a clone
 * (`parseLayout(serialiseLayout(layout))`) and answer the clone or a refusal,
 * never a half-made change: `persist`'s contract is to keep an invalid state in
 * memory and save it once a field is corrected, which is right for a field edit
 * and wrong for a paste, which has no field to correct. What the pane does with
 * an answer — adopting it, the undo step, the sentence — is
 * `layout-editor.ts`'s.
 *
 * **Names are free-as-written, suffixed only where taken** (decision 2): a copy
 * into another layout keeps `STR` as `STR`, and a copy into its own layout
 * becomes "HP 2" with id `hp_2`. Formulas inside the copy are rewritten to read
 * the copies; a formula reading something outside the copy is left alone.
 *
 * What it does not decide: where a paste may land is `reparent.ts`'s
 * `canReparent`, called and never changed, and where a component is placed on a
 * grid is the rule an insert and a move already follow (`nextFreeRow`).
 */

import { getComponent } from '../components';
import { renameNames } from '../formula/rename-names';
import { visitFormulaFields } from '../formula/resolve';
import { ComponentCopy } from '../parse/component-clipboard';
import {
	DEFAULT_COLUMNS,
	Layout,
	migrateId,
	parseLayout,
	serialiseLayout,
} from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { ComponentConfig, ConfigFieldSpec } from '../types';
import { childIsPlaced, innerPlacement } from '../view/grid-cells';
import { componentDisplayName } from './component-name';
import {
	Dependency,
	localNames,
	outsideNames,
	pasteDependencies,
	subtree,
} from './paste-dependencies';
import { canReparent, dropIllegalEmptyChildren } from './reparent';
import { nextFreeRow } from './tree';
import { uniqueLabel } from './unique-names';

/** A paste the layout accepts: the new layout, and what landed in it. */
export interface Pasted {
	layout: Layout;
	/** The pasted component, inside `layout`, with its final id and label. */
	root: ComponentConfig;
	/** What it depends on in the target; empty within one layout. */
	dependencies: Dependency[];
}

/** A configuration paste the layout accepts. */
export interface PastedConfiguration {
	layout: Layout;
	/** The component that took the configuration, inside `layout`. */
	target: ComponentConfig;
	dependencies: Dependency[];
	/**
	 * Entry keys that addressed stored data before the paste and do not after.
	 * Values under them stay in character notes and stop showing (§6 step 6).
	 */
	keysLeft: string[];
}

export type Refused = { error: string };

/** A deep copy through JSON, which is all a component's configuration is. */
function cloneConfig<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The component a **Copy** puts on the clipboard: a deep copy of it and what it
 * holds, with the root's size as it is actually drawn.
 *
 * A tab's stored width and height may be stale — `innerPlacement` draws it at
 * its container's size — and the copy may land on a placed grid, where its own
 * size governs. `reparent` makes the same correction for the same reason.
 */
export function copiedComponent(entry: WalkEntry): ComponentConfig {
	const copy = cloneConfig(entry.config);
	const { width, height } = innerPlacement(entry.config, entry.parent);
	copy.position.width = width;
	copy.position.height = height;
	return copy;
}

/** Rewrite every expression in `configs` through `renames`, each in its own scope. */
function renameAll(
	configs: readonly ComponentConfig[],
	renames: ReadonlyMap<string, string>,
): void {
	if (renames.size === 0) return;
	for (const config of configs) {
		const local = localNames(config);
		const definition = getComponent(config.type);
		if (definition === undefined) continue;
		visitFormulaFields(definition, config, (source, replace) =>
			replace(renameNames(source, renames, local)),
		);
	}
}

/** The candidate saved and read back, or the parser's refusal. */
function checked(layout: Layout): Refused | null {
	try {
		parseLayout(serialiseLayout(layout));
		return null;
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * The layout as it would save, as a clone to decide on, or why it cannot be.
 *
 * The layout in memory may be one that does not save: `persist` keeps an
 * invalid state held and writes it once a field is corrected, so an unsaved
 * duplicate label is a state the pane can be in when a paste arrives. Deciding
 * over that would throw out of an event listener, so it is a refusal naming
 * the fix instead (`docs/PATTERNS.md` §4).
 */
function cloneOf(layout: Layout): { clone: Layout } | Refused {
	try {
		return { clone: parseLayout(serialiseLayout(layout)) };
	} catch (error) {
		const said = error instanceof Error ? error.message : String(error);
		return {
			error: `Nothing was pasted, because this layout does not save as it stands. Fix this first: ${said}`,
		};
	}
}

/** How many columns the grid a component lands on has. */
function gridWidth(layout: Layout, parent: WalkEntry | null): number {
	if (parent === null) return layout.columns ?? DEFAULT_COLUMNS;
	// A container that is itself a tab is drawn at its tab set's size, which
	// its own stored width may not say (`innerPlacement`).
	return innerPlacement(parent.config, parent.parent).width;
}

/**
 * Paste `copy` into `layout` as the sibling after the component whose id is
 * `after`, or say why not.
 *
 * `sameLayout` is whether the copy came from this layout, which is the only
 * thing that decides whether a report is computed: within one layout every
 * outside name and declaration is the one the copy was built against. Naming
 * and the rewrite never depend on it.
 */
export function pasteComponent(
	layout: Layout,
	after: string,
	copy: ComponentCopy,
	sameLayout: boolean,
): Pasted | Refused {
	const cloned = cloneOf(layout);
	if ('error' in cloned) return cloned;
	const candidate = cloned.clone;
	const walk = walkComponents(candidate.components);
	const anchor = walk.find((entry) => entry.config.id === after);
	if (anchor === undefined) return { error: 'That component is no longer in this layout.' };
	const parentEntry =
		anchor.parent === null
			? null
			: (walk.find((entry) => entry.config === anchor.parent) ?? null);
	const parent = anchor.parent;

	const root = cloneConfig(copy.component);
	const where = canReparent(candidate, root, parent);
	if ('error' in where) return where;

	// Naming. Every id and label free in the target is kept as written first,
	// so a taken one is never suffixed onto a name the copy itself keeps; then
	// the taken ones are suffixed in walk order. A suffixed id also never takes
	// a name the copy reads from outside, or its own formula would silently
	// start reading itself: a copy of `hp` reading the source's `hp_2`, pasted
	// where `hp` is taken and `hp_2` is free.
	const copied = subtree(root);
	const present = walk.map((entry) => entry.config);
	const targetIds = new Set(present.map((config) => config.id));
	const targetLabels = new Set(present.map((config) => config.label));
	const taken = new Set([...targetIds, ...outsideNames(root)]);
	for (const config of copied) if (!targetIds.has(config.id)) taken.add(config.id);
	const renames = new Map<string, string>();
	for (const config of copied) {
		if (!targetIds.has(config.id)) continue;
		const id = migrateId(config.id, taken);
		taken.add(id);
		renames.set(config.id, id);
	}
	const labelled = [...present, ...copied];
	for (const config of copied) {
		if (!targetLabels.has(config.label)) continue;
		config.label = uniqueLabel(config.label, labelled);
	}

	renameAll(copied, renames);
	for (const config of copied) config.id = renames.get(config.id) ?? config.id;

	// Placing, where an insert and a move place a component.
	const list = parent === null ? candidate.components : (parent.children ??= []);
	if (childIsPlaced(parent)) {
		root.position.col = 1;
		root.position.row = nextFreeRow(list);
		root.position.width = Math.min(root.position.width, gridWidth(candidate, parentEntry));
	} else {
		root.position = { ...(parent as ComponentConfig).position, col: 1, row: 1 };
	}
	dropIllegalEmptyChildren(root, parentEntry === null ? 0 : parentEntry.depth + 1);
	list.splice(list.indexOf(anchor.config) + 1, 0, root);

	const refused = checked(candidate);
	if (refused !== null) return refused;
	return {
		layout: candidate,
		root,
		dependencies: sameLayout ? [] : pasteDependencies(copy.component, copy.context, layout),
	};
}

/** "a Pool", "an Image": the article a type's display name takes. */
function aType(type: string): string {
	const name = componentDisplayName(type);
	return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
}

/**
 * The entry keys a field addresses in character notes (`addressesEntry`):
 * a text field's value, falling back to its `whenBlank`; a list field's primary
 * column on every entry.
 */
function addressedKeys(field: ConfigFieldSpec, config: ComponentConfig): string[] {
	const address = field.addressesEntry;
	if (address === undefined) return [];
	const value = (config as unknown as Record<string, unknown>)[field.key];
	if (field.kind === 'text') {
		const key = typeof value === 'string' && value.trim() !== '' ? value.trim() : address.whenBlank;
		return key === undefined ? [] : [key];
	}
	if (!Array.isArray(value)) return [];
	const column = field.kind === 'columns' ? 'key' : (field.entryColumns?.[0].key ?? 'key');
	return value
		.map((entry) => (entry as Record<string, unknown> | null)?.[column])
		.filter((key): key is string => typeof key === 'string' && key !== '');
}

/**
 * Put the configuration `copy` holds onto the component whose id is `onto`,
 * or say why not.
 *
 * The target's configuration *becomes* the source's: every declared key is the
 * source's value where it has one and deleted where it has none, then `reset`
 * the same. "Only the keys the source sets" is refused, because it would leave
 * a mixture neither component had. `id`, `label`, `position`, `children` and
 * any key the type does not declare are untouched. The source's own id becomes
 * the target's in every expression — the copy *is* the target now — and every
 * other name stays as written.
 */
export function pasteConfiguration(
	layout: Layout,
	onto: string,
	copy: ComponentCopy,
	sameLayout: boolean,
): PastedConfiguration | Refused {
	const cloned = cloneOf(layout);
	if ('error' in cloned) return cloned;
	const candidate = cloned.clone;
	const target = walkComponents(candidate.components).find(
		(entry) => entry.config.id === onto,
	)?.config;
	if (target === undefined) return { error: 'That component is no longer in this layout.' };
	const source = copy.component;
	if (source.type !== target.type) {
		return {
			error: `The clipboard holds ${aType(source.type)}, and "${target.label}" is ${aType(target.type)}. Paste configuration only goes onto a component of the same type.`,
		};
	}

	const before = serialiseLayout(candidate);
	const record = target as unknown as Record<string, unknown>;
	const from = source as unknown as Record<string, unknown>;
	const fields = getComponent(target.type)?.configFields ?? [];
	const addressedBefore = fields.flatMap((field) => addressedKeys(field, target));
	for (const field of fields) {
		if (Object.hasOwn(from, field.key)) record[field.key] = cloneConfig(from[field.key]);
		else delete record[field.key];
	}
	if (source.reset !== undefined) target.reset = cloneConfig(source.reset);
	else delete target.reset;
	if (source.id !== target.id) renameAll([target], new Map([[source.id, target.id]]));

	if (serialiseLayout(candidate) === before) {
		return { error: `"${target.label}" already has this configuration.` };
	}
	const addressedAfter = new Set(fields.flatMap((field) => addressedKeys(field, target)));
	const keysLeft = [...new Set(addressedBefore)].filter((key) => !addressedAfter.has(key));

	const refused = checked(candidate);
	if (refused !== null) return refused;
	// Over the one component: its children stay where they are, so neither what
	// they read nor a modifier definition aimed only at them is this paste's to
	// report. The context was taken over the whole copied subtree, so its
	// definitions are narrowed to the ones that change the component itself.
	const { children: _children, ...alone } = source;
	const context = {
		...copy.context,
		definitions: copy.context.definitions
			.filter((definition) => definition.targets.includes(source.label))
			.map((definition) => ({ ...definition, targets: [source.label] })),
	};
	return {
		layout: candidate,
		target,
		keysLeft,
		dependencies: sameLayout ? [] : pasteDependencies(alone, context, layout),
	};
}
