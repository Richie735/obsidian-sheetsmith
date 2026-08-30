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
 * drag and the indent/outdent controls in `tree.ts` are its only callers.
 */

import { getComponent } from '../components';
import { Layout, mayHoldChildren } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { ComponentConfig, isContainer } from '../types';

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
 * Whether every container in `config`'s own subtree could still legally hold
 * its children once `config` itself sits at `depth`.
 *
 * The same rule `parse/layout.ts`'s `parseChildren` enforces while reading a
 * file, walked here before a write rather than discovered by `persist`
 * refusing one: a subtree carries its own shape with it, so a container two
 * levels deep already, with children of its own, cannot land anywhere but the
 * top level without pushing them past the cap — even though the identical
 * container with no children yet would be accepted at that same target.
 */
function subtreeFits(config: ComponentConfig, depth: number): boolean {
	const children = config.children;
	if (!children || children.length === 0) return true;
	if (!mayHoldChildren(depth)) return false;
	return children.every((child) => subtreeFits(child, depth + 1));
}

/**
 * Whether `dragged` may be moved to sit directly inside `target` — `null` for
 * the sheet's own top level — and why not where it may not.
 *
 * Every refusal names the fix, on `docs/PATTERNS.md` §4's rule: a target that
 * cannot hold anything says so and says what it is instead of a container; a
 * subtree too deep for where it is headed says how deep it would sit and what
 * the limit is; a row dropped on itself or on its own descendant says that
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

	const landingDepth = target === null ? 0 : targetEntry!.depth + 1;
	if (!subtreeFits(dragged, landingDepth)) {
		return {
			error: `"${dragged.label}" holds a container of its own, and moving it here would put that container more than one level deep. A container may hold containers only one level deep.`,
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
	entry.siblings.splice(from, 1);

	const into = target === null ? layout.components : (target.children ??= []);
	const at = index === undefined ? into.length : Math.min(index, into.length);
	into.splice(at, 0, dragged);
}
