/*
 * The names a component the editor adds is given, free across the whole sheet.
 *
 * Both were `layout-editor.ts`'s while inserting from the picker was the only
 * way a component arrived. A paste is the second (`editor/paste.ts`), and what
 * the two share is a policy — a label is suffixed ` 2`, ` 3` until it is free —
 * so it moved here on `docs/PATTERNS.md` §1's one-step tier rather than being
 * copied: two spellings of "free" drifting apart is two components with one
 * label, which the parser refuses, so the file would stop saving.
 *
 * **Checked against every component, never one list.** A label keys a note
 * section and an id is what a formula writes, and containment scopes neither
 * (`parse/layout.ts`'s own uniqueness walk is flattened for the same reason).
 */

import { ComponentConfig } from '../types';

/** `base`, or `base 2`, `base 3` … — the first no component already has. */
export function uniqueLabel(base: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.label));
	let label = base;
	let counter = 2;
	while (taken.has(label)) label = `${base} ${counter++}`;
	return label;
}

/**
 * An id built from a label, for a component the picker inserts.
 *
 * The id is what formulas reference, so it has to be a name the expression
 * parser accepts: underscores rather than hyphens, since a hyphen would read
 * as subtraction, and never a leading digit. Kept in step with `migrateId` in
 * `parse/layout.ts`, which migrates anything this could not have produced —
 * including the hyphenated ids this function itself emitted before the clash
 * with the parser was understood.
 *
 * **Not what a paste uses**: this lowercases, so a copied `STR` that is free
 * where it lands would come back `str`. A paste keeps an id as written and
 * suffixes only a taken one, which is `migrateId`'s shape.
 */
export function uniqueId(label: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.id));
	let base =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'component';
	if (/^[0-9]/.test(base)) base = `_${base}`;
	let id = base;
	let counter = 2;
	while (taken.has(id)) id = `${base}_${counter++}`;
	return id;
}
