/*
 * Whether a component may move to a given place in the tree, and where the
 * write actually goes.
 *
 * Pure — no DOM, no persistence — composed from the primitives that already
 * exist rather than a fresh depth count of its own: `isContainer` and
 * `mayHoldChildren` are what `accepts-children.ts` already conjoins for "may
 * this row take a child *where it sits*", and this asks the same question one
 * layer further out — not just whether the target can hold *a* child, but
 * whether it can hold *this one*, whose own subtree may already be several
 * components deep.
 *
 * `docs/features/grid-canvas.md` §5 is the design this implements; the tree
 * drag and the indent/outdent controls in `tree.ts` are the only callers of
 * `canReparent` and `reparent`.
 *
 * It also owns what an edit that takes a child away leaves behind: no empty
 * `children` key, which `parseChildren` would refuse two containers deep.
 * `forgetEmptyChildren` is exported for the tree's remove, the one other edit
 * that empties a container, and lives here on purpose rather than in a file of
 * its own: the rule is the other half of `canReparent`'s depth check, and two
 * consumers is below `docs/PATTERNS.md` §1's rung for extracting. The remove
 * needs only that half — its promoted children only rise, and rising never
 * makes an empty list illegal. `dropIllegalEmptyChildren` is exported for a
 * paste (`docs/features/component-copy-paste.md`), which lands a subtree that
 * may carry a hand-written `children: []` two deep exactly as a move does, and
 * calls the rule rather than restating it.
 *
 * The dependency runs both ways: `reparent()` also draws on `tree.ts`'s own
 * `nextFreeRow` for the destination row a cross-container move lands on,
 * rather than reimplementing the same answer a promoted child already gets.
 * A real cycle, not a mistake to unwind — both sides export only function
 * declarations, so the circular import resolves the same way an ordinary one
 * would at the point either function is actually called.
 */

import { getComponent } from '../components';
import { Layout, mayHoldChildren } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { spelled } from '../parse/spelled';
import { ComponentConfig, isContainer } from '../types';
import { innerPlacement } from '../view/grid-cells';
import { nextFreeRow } from './tree';

export type ReparentCheck = { ok: true } | { error: string };

/** `config`, or any component nested inside it, at any depth. */
function containsDescendant(
	config: ComponentConfig,
	candidate: ComponentConfig,
): boolean {
	for (const child of config.children ?? []) {
		if (child === candidate || containsDescendant(child, candidate)) {
			return true;
		}
	}
	return false;
}

/**
 * Every container in `config`'s own subtree — `config` itself included — that
 * would hold children at a depth where a container may hold none, once
 * `config` sits at `depth`; empty where the whole subtree still fits.
 *
 * The same rule `parse/layout.ts`'s `parseChildren` enforces while reading a
 * file, walked here before a write rather than discovered by `persist`
 * refusing one: a subtree carries its own shape with it, so a container two
 * levels deep already, with children of its own, cannot land anywhere but the
 * top level without pushing them past the cap — even though the identical
 * container with no children yet would be accepted at that same target.
 *
 * It returns the offenders rather than a yes or no so the refusal can name
 * them: whether that is `config` itself or containers inside it is the
 * difference between two sentences, and a fix that named only the first of
 * several would be refused again on the next.
 */
function tooDeepHolders(
	config: ComponentConfig,
	depth: number,
): ComponentConfig[] {
	const children = config.children;
	if (!children || children.length === 0) return [];
	if (!mayHoldChildren(depth)) return [config];
	return children.flatMap((child) => tooDeepHolders(child, depth + 1));
}

/**
 * Whether `dragged` may be moved to sit directly inside `target` — `null` for
 * the sheet's own top level — and why not where it may not.
 *
 * Every refusal names the fix, on `docs/PATTERNS.md` §4's rule: a target that
 * cannot hold anything says so and says what it is instead of a container; a
 * subtree too deep for where it is headed names every container that would
 * sit too deep — `dragged` itself or those inside it — and says to empty
 * them first; a row dropped on itself or on its own descendant says that
 * plainly, since there is no configuration that would make either legal.
 */
export function canReparent(
	layout: Layout,
	dragged: ComponentConfig,
	target: ComponentConfig | null,
): ReparentCheck {
	if (target === dragged) {
		return { error: 'A component cannot be moved inside itself.' };
	}
	if (target !== null && containsDescendant(dragged, target)) {
		return {
			error: `"${target.label}" is inside "${dragged.label}", so moving "${dragged.label}" there would put it inside itself.`,
		};
	}

	const walk = walkComponents(layout.components);
	const targetEntry =
		target === null ? null : walk.find((entry) => entry.config === target);
	if (target !== null && !targetEntry) {
		return { error: `"${target.label}" is not in this layout.` };
	}

	if (target !== null) {
		const definition = getComponent(target.type);
		if (!isContainer(definition)) {
			return {
				error: `"${target.label}" is not a container, so nothing can be moved into it.`,
			};
		}
		if (!mayHoldChildren(targetEntry!.depth)) {
			return {
				error: `"${target.label}" sits inside two containers already, and a container may hold containers only one level deep. Move it up a level first.`,
			};
		}
	}

	// The target already passed `mayHoldChildren`, so the landing depth is at
	// most two, and every holder `tooDeepHolders` finds sits exactly two
	// containers deep — which is why both sentences can say "two".
	// `reparent.test.ts` ties that word to the cap, so a cap change goes red.
	const landingDepth = target === null ? 0 : targetEntry!.depth + 1;
	const holders = tooDeepHolders(dragged, landingDepth);
	if (holders[0] === dragged) {
		return {
			error: `"${dragged.label}" holds components, and moving it here would put it inside two containers, where it could hold nothing. Move its components out first.`,
		};
	}
	if (holders.length === 1) {
		const holder = holders[0]!;
		return {
			error: `"${dragged.label}" holds "${holder.label}", which holds components, and moving "${dragged.label}" here would put "${holder.label}" inside two containers, where it could hold nothing. Move the components out of "${holder.label}" first.`,
		};
	}
	if (holders.length > 1) {
		const names = spelled(holders.map((holder) => holder.label));
		return {
			error: `"${dragged.label}" holds ${names}, which hold components, and moving "${dragged.label}" here would put them inside two containers, where they could hold nothing. Move the components out of ${names} first.`,
		};
	}

	return { ok: true };
}

/**
 * Move `dragged` out of its current list and into `target`'s children (the
 * top level for `null`), at `index` if given or at the end otherwise.
 *
 * Does not check `canReparent` — every caller checks first and refuses the
 * gesture rather than reaching this, so a wrong call here is a caller bug
 * rather than a state the file has to defend against twice.
 */
export function reparent(
	layout: Layout,
	dragged: ComponentConfig,
	target: ComponentConfig | null,
	index?: number,
): void {
	const walk = walkComponents(layout.components);
	const entry = walk.find((candidate) => candidate.config === dragged);
	if (!entry) return;
	const from = entry.siblings.indexOf(dragged);
	if (from === -1) return;

	// A child of a container that shows one at a time (a tab) is never sized
	// by its own stored width/height while nested there — `innerPlacement`
	// (`view/grid-cells.ts`) draws it at the *old* parent's own placement
	// instead, so its stored numbers are free to have gone stale. Once moved,
	// `dragged`'s own position governs again wherever it lands next — inside
	// an ordinary container, at the top level, or even inside a different tab
	// set that will itself ignore it — so it has to carry the size it was
	// actually last drawn at rather than whatever it happened to still say.
	// A no-op everywhere else: `innerPlacement` returns `dragged.position`
	// unchanged whenever the old parent placed its children itself.
	const { width, height } = innerPlacement(dragged, entry.parent);
	dragged.position.width = width;
	dragged.position.height = height;

	entry.siblings.splice(from, 1);

	const into = target === null ? layout.components : (target.children ??= []);

	// `col`/`row` describe a place in the *old* parent's grid, which means
	// nothing — or means the wrong thing — once `dragged` sits in a
	// different one: past its last column, or on top of a sibling that
	// already occupies that cell. `docs/features/grid-canvas.md` §5 is the
	// design; the answer matches what a child promoted out of a removed
	// container already gets (`renderTreeRow` in `tree.ts`). Computed over
	// `into` before `dragged` is spliced in below, so it never counts
	// itself. Skipped when `target` is `dragged`'s own current parent
	// already: `resolveDrop` sends a drop on your own parent's row through
	// this same function as a same-container reorder, not a move across
	// grids, and reassigning position there would visibly move a component
	// the user only asked to reorder.
	if (target !== entry.parent) {
		dragged.position.col = 1;
		dragged.position.row = nextFreeRow(into);
	}

	const at = index === undefined ? into.length : Math.min(index, into.length);
	into.splice(at, 0, dragged);

	forgetEmptyChildren(entry.parent);
	const landingDepth =
		target === null
			? 0
			: (walk.find((candidate) => candidate.config === target)?.depth ?? 0) + 1;
	dropIllegalEmptyChildren(dragged, landingDepth);
}

/**
 * Drop `container`'s `children` key where an edit has just left it empty.
 *
 * An empty list and no key mean the same thing to everything that reads a
 * layout except `parseChildren`, which refuses *any* `children` key two
 * containers deep — so a container emptied by the editor, then moved there as
 * `canReparent` allows, was drawn but never saved. Dropping the key at the
 * edit rather than at `serialiseLayout` keeps both rules as they are and
 * leaves a hand-written `children: []` untouched until something edits that
 * container (Constraint 3). `reparent` and the tree's remove are the two
 * edits that take a child away; `null`, the top level, has no key to drop.
 */
export function forgetEmptyChildren(container: ComponentConfig | null): void {
	if (container?.children?.length === 0) delete container.children;
}

/**
 * The same agreement for a subtree that carries a hand-written `children: []`
 * of its own to a depth where no `children` key may sit: `tooDeepHolders`
 * reads it as holding nothing, so the move is allowed, and the key has to go
 * with it or the parser refuses the result. Only where it would be illegal —
 * an empty list at a depth that may hold one is the author's spelling, and
 * this move did not touch it.
 */
export function dropIllegalEmptyChildren(
	config: ComponentConfig,
	depth: number,
): void {
	const children = config.children;
	if (!children) return;
	if (children.length === 0) {
		if (!mayHoldChildren(depth)) delete config.children;
		return;
	}
	for (const child of children) dropIllegalEmptyChildren(child, depth + 1);
}
