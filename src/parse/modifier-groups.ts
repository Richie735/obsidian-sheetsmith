/*
 * The layout's modifier groups (`docs/features/table-row-modifier-target.md`
 * D6), read as a list.
 *
 * `parse/modifier-types.ts`'s split, and for its reason: whether
 * `modifierGroups` is a list of objects is the file format's business and
 * refuses the layout in `parseLayout`, while whether an entry is usable — a
 * blank, repeated or unspellable name — is contents, reported where it can be
 * fixed while every sheet on the layout goes on rendering.
 *
 * **Which values are in a group is not here and cannot be.** Membership is
 * declared on the value (ruling 2), so it is a question about components, which
 * a parse module does not see; `formula/modifier-targets.ts` answers it in the
 * one walk over what the components publish. What this module owns is the list
 * itself: its names, their labels, and the one line format the editor edits it
 * in.
 *
 * **Derived membership is refused at the read** (ruling 3): an entry is a
 * `name` and a `label` and nothing else is read off it, so there is nowhere for a
 * formula to live.
 *
 * Pure, so Constraint 5 holds.
 */

import { isName } from '../formula/expression';
import { Layout } from './layout';
import { spellGroups } from './modifier-cell';
import { series } from './spelled';
import { ModifierGroup } from '../types';

/** Something wrong with one declared group. */
export interface ModifierGroupProblem {
	message: string;
	/** The group the problem belongs to, where it has a name to name it by. */
	group?: string;
}

export interface ParsedModifierGroups {
	/**
	 * The usable groups, in declaration order: unspellable and blank names
	 * dropped, repeats collapsed to their first appearance, and a blank label
	 * filled with the name. What every picker offers.
	 */
	groups: readonly ModifierGroup[];
	problems: readonly ModifierGroupProblem[];
}

/** A string member, trimmed, or the empty string where the entry holds none. */
function text(raw: Readonly<Record<string, unknown>>, key: string): string {
	const value = raw[key];
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read a layout's modifier groups and report what cannot be used.
 *
 * **A name must be one segment of §5's name spelling**, letters, digits and
 * underscores, not starting with a digit, so `@<name>` is one token in a cell.
 * A name failing it is reported and dropped, as an unspellable definition name
 * is: no cell could aim at it.
 */
export function parseModifierGroups(layout: Layout): ParsedModifierGroups {
	const groups: ModifierGroup[] = [];
	const problems: ModifierGroupProblem[] = [];
	const seen = new Set<string>();
	const raws = (layout.modifierGroups ?? []) as unknown as readonly Record<string, unknown>[];
	for (const raw of raws) {
		const name = text(raw, 'name');
		if (name === '') {
			problems.push({ message: 'A modifier group needs a name.' });
			continue;
		}
		if (!isName(name) || name.includes('.')) {
			problems.push({
				group: name,
				message: `"${name}" cannot be a group name, because a row spells a group as @ and one name: letters, digits and underscores, not starting with a digit. Rename it.`,
			});
			continue;
		}
		if (seen.has(name)) {
			problems.push({
				group: name,
				message: `"${name}" is declared more than once. The second is ignored, since two groups with one name could not be told apart.`,
			});
			continue;
		}
		seen.add(name);
		const label = text(raw, 'label');
		groups.push({ name, label: label === '' ? name : label });
	}
	return { groups, problems };
}

/**
 * The editor's line for one group: `save: Saving throws`, or the name alone
 * where the label is the name.
 */
export function spellGroupLine(group: { name?: unknown; label?: unknown }): string {
	const name = typeof group.name === 'string' ? group.name.trim() : '';
	const label = typeof group.label === 'string' ? group.label.trim() : '';
	return label === '' || label === name ? name : `${name}: ${label}`;
}

/**
 * One line of the editor's list read back as an entry: the text before the
 * first colon is the name and the rest the label, and a line with no colon takes
 * its name as its label. Blank lines are dropped by the caller.
 */
export function readGroupLine(line: string): ModifierGroup {
	const colon = line.indexOf(':');
	if (colon < 0) {
		const name = line.trim();
		return { name, label: name };
	}
	const name = line.slice(0, colon).trim();
	const label = line.slice(colon + 1).trim();
	return { name, label: label === '' ? name : label };
}

/**
 * Why a group nothing declares reaches nothing (D7), with the fix. One sentence
 * for a row naming it, a definition naming it and a component joining it, so
 * the three cannot come apart; `quoted` is the spelling the reader wrote,
 * `@saves` in a target and `saves` in a component's list.
 */
export function undeclaredGroup(quoted: string): string {
	return `"${quoted}" is not a modifier group this layout declares. Choose one it does, or add it under Modifier groups.`;
}

/**
 * What a target listing groups is called on a surface that names a target by
 * its label: each group's label, in the target's order, as a series; a group
 * nothing declares by its own spelling. Null where the target is a published
 * name, so the caller's own label stands.
 */
export function groupTargetLabel(
	groups: readonly string[] | null,
	declared: readonly ModifierGroup[],
): string | null {
	if (groups === null) return null;
	if (groups.length === 0) return 'No group yet';
	return series(
		groups.map((name) => declared.find((group) => group.name === name)?.label ?? spellGroups([name])),
	);
}
