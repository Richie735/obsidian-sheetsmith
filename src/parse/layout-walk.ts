/*
 * The order the sheet reads a layout in (SPEC §8).
 *
 * One job: given a parsed layout, answer where each component sits in the
 * depth-first, grid-order walk — flattened for whoever reads every component,
 * one level at a time for whoever draws a grid. Nothing here parses, and
 * nothing here validates; `layout.ts` turns a file into the model and this
 * answers questions about the model.
 *
 * Its own file because those are two jobs and the consumers differ: five
 * callers need this order and only some of them parse anything, and
 * `view/grid-cells.ts` needs the traversal and no parsing at all. The one
 * dependency runs the other way — `parseLayout` flattens through
 * `walkComponents` for its id and label uniqueness checks — which is why this
 * imports nothing from there.
 *
 * `parse/` rather than beside a consumer, for the same reason `layout.ts` is
 * here: it is the layout model's own business and it imports nothing from
 * `obsidian`, so it stays testable without launching the app.
 */

import { ComponentConfig } from '../types';

/**
 * One component in the order the sheet reads it, with where it sits.
 *
 * **Every member is a live reference into the layout, not a copy.** That is what
 * the walk is for beyond ordering: the layout editor renames through `config`,
 * moves a block by writing `config.position`, and removes and reorders through
 * `siblings`. Re-deriving any of them at each call site is the drift this
 * function exists to prevent, so the aliasing is the feature and the reason it
 * takes its input mutably.
 */
export interface WalkEntry {
	config: ComponentConfig;
	/** How many containers enclose it. 0 at the top level. */
	depth: number;
	/** The container holding it, or null at the top level. */
	parent: ComponentConfig | null;
	/**
	 * The list it actually lives in — the layout's components, or its parent's
	 * `children`. Carried because the editor removes and reorders through it,
	 * and re-deriving it from `parent` at each call site is the drift this walk
	 * exists to prevent.
	 */
	siblings: ComponentConfig[];
}

/**
 * Every component, depth first, each level in its own grid reading order
 * (SPEC §8).
 *
 * A container's children are read where the container sits, before the
 * container's next neighbour: the same sentence the sheet already had, applied
 * per level rather than once, and it is what a heading over a region promises.
 * Both the single-column reflow and tab order follow it, as they do today.
 *
 * One exported function because five callers need this order and must not
 * disagree about it: the sheet view reads every section before rendering any so
 * the name table is complete, `buildSheetEnv` publishes from the same list, the
 * trigger loop binds from it, the layout editor lists and indents from it, and
 * the harness renders the genuine pipeline over its own grid. That is the same
 * reason `publishedComponent` exists in `formula/sheet.ts`, and the two had
 * already drifted once when it did not.
 *
 * Sorted on a copy at each level, because `sort` mutates and reading a layout
 * must not reorder it. That is the only thing the walk keeps to itself: what it
 * hands back aliases the layout throughout, which `WalkEntry` states and which
 * is why the parameter is not `readonly`. It was, once, and the annotation was
 * defeated by the function's own return value — a caller was told its array was
 * safe while `siblings` handed the editor the same array to splice, and a cast
 * here is what let the two claims coexist.
 */
export function walkComponents(components: ComponentConfig[]): WalkEntry[] {
	const found: WalkEntry[] = [];
	const visit = (
		list: ComponentConfig[],
		depth: number,
		parent: ComponentConfig | null,
	): void => {
		const ordered = [...list].sort(
			(a, b) =>
				a.position.row - b.position.row || a.position.col - b.position.col,
		);
		for (const config of ordered) {
			found.push({ config, depth, parent, siblings: list });
			if (config.children !== undefined) {
				visit(config.children, depth + 1, config);
			}
		}
	};
	visit(components, 0, null);
	return found;
}

/**
 * The components sitting directly inside `parent`, in the order the sheet reads
 * them, out of a walk already taken.
 *
 * The descent half of `walkComponents`: that returns the sheet flattened, which
 * is what reads every section and what a trigger iterates, and this returns one
 * level, which is what a grid draws. The two have to agree, and a test asserts
 * that descending through this reproduces the flat walk exactly.
 *
 * One function because both the sheet view and the harness draw the levels, and
 * they had it twice in two spellings — the view aligning `walk[i]` with its own
 * `prepared[i]` by index, the harness matching by config identity. Those agree
 * only while both lists are built by mapping over the walk in order, so either
 * one growing a filter would break the view silently and leave the harness
 * right, which is the worst direction: appearance is reviewed in the harness.
 * Returning configs rather than a caller's payload is what makes identity the
 * only way to look one up.
 */
export function componentsInside(
	walk: readonly WalkEntry[],
	parent: ComponentConfig | null,
): ComponentConfig[] {
	return walk
		.filter((entry) => entry.parent === parent)
		.map((entry) => entry.config);
}
