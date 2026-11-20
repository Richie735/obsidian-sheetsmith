/*
 * Which values a change aimed at modifier groups reaches
 * (`docs/features/table-row-modifier-target.md` D3).
 *
 * One job: given a target's groups and the sheet's membership, answer which
 * members the change lands on and through which groups. The walk asks it to
 * expand a group change into one contribution per member, and the row's outcome
 * asks it to say how far that change reached; the two must not disagree about
 * which values those are, and one copy is the only thing that says so for free
 * (`PATTERNS.md` §1).
 *
 * **Members are deduplicated by value.** A part naming `@save, @check` where
 * Dexterity save is in both reaches that save once, its line naming both groups:
 * Pathfinder 2e's selector array without its duplicate-collapse trap, since two
 * different rows or parts are always two contributors and only the stacking rule
 * contests them.
 *
 * **A group nothing declares reaches nothing**, and a declared group beside it
 * in the same list still applies (D7). Whether a group is declared, and which
 * values are in it, arrive as `GroupIndex`, built by `formula/modifier-targets.ts`
 * in its one walk over what the components publish; nothing here reads a
 * component.
 *
 * Pure, so Constraint 5 holds. Upstream of `modifiers.ts`, which imports it.
 */

import { ModifierGroup, NameLabel } from '../types';
import { groupTargetOf } from '../parse/modifier-cell';
import { Enrolment } from './modifier-definitions';

/** One value in a group: the name or slot key it is reached by, and what it is called. */
export interface GroupMember {
	/** A published name, or an unnamed member's slot key (`attacks[3]`). */
	name: string;
	/**
	 * What a sentence calls it, as parts: `Saving throws · Strength`, `Attacks ·
	 * Longsword` at full width (`docs/features/published-name-labels.md`).
	 */
	parts: NameLabel;
}

/** The sheet's groups: which are declared, and which values are in each. */
export interface GroupIndex {
	/** Every declared group, by name, in declaration order. */
	declared: ReadonlyMap<string, ModifierGroup>;
	/** Every declared group's members, in publication order. */
	members: ReadonlyMap<string, readonly GroupMember[]>;
}

/**
 * What a part's target and member condition make of it, before any member is
 * looked up (`docs/features/table-row-modifier-target.md` D1, D3, D8).
 *
 * **The one predicate for "which group changes reach nothing"**, read by the
 * walk, which contributes nothing for every kind but `name` and `groups`, and by
 * the row's outcome, which says why in each kind's own sentence. Two copies
 * could only be tested for still agreeing (`PATTERNS.md` §1).
 */
export type GroupAim =
	/** An ordinary published name: today's path. */
	| { kind: 'name' }
	/** The reserved member condition, on any target: refused in v1 (D8). */
	| { kind: 'withheld' }
	/** A published name in a list of groups (D1): the first one, to name it. */
	| { kind: 'mixed'; name: string }
	/** `@` alone, a list naming no group yet (D1). */
	| { kind: 'none' }
	/** A list of groups, blanks and repeats dropped. */
	| { kind: 'groups'; groups: readonly string[] };

export function groupAim(fields: { target: string; where: string | null }): GroupAim {
	if (fields.where !== null) return { kind: 'withheld' };
	const grouped = groupTargetOf(fields.target);
	if (grouped === null) return { kind: 'name' };
	const stray = grouped.names[0];
	if (stray !== undefined) return { kind: 'mixed', name: stray };
	if (grouped.groups.length === 0) return { kind: 'none' };
	return { kind: 'groups', groups: grouped.groups };
}

/** A sheet declaring no group: every change keeps today's path. */
export const NO_GROUPS: GroupIndex = { declared: new Map(), members: new Map() };

/** One value a group change reaches, and the groups it reached it through. */
export interface Reached {
	member: GroupMember;
	via: readonly ModifierGroup[];
}

/**
 * Every value a change naming these groups reaches, once each, in the order
 * the groups are listed and then publication order. Undeclared groups reach
 * nothing.
 */
export function reachOf(groups: readonly string[], index: GroupIndex): readonly Reached[] {
	const found = new Map<string, { member: GroupMember; via: ModifierGroup[] }>();
	for (const name of groups) {
		const group = index.declared.get(name);
		if (group === undefined) continue;
		for (const member of index.members.get(name) ?? []) {
			const already = found.get(member.name);
			if (already === undefined) found.set(member.name, { member, via: [group] });
			else if (!already.via.some((one) => one.name === name)) already.via.push(group);
		}
	}
	return [...found.values()];
}

/**
 * One enrolment re-aimed at one member of a group, its every other fact the
 * same: the target in its fields and, where it applies, in its contribution.
 * The walk and the row's outcome both re-aim through this, so the two cannot
 * disagree about what a member was handed.
 */
export function aimedAt(found: Exclude<Enrolment, { kind: 'unknown' }>, name: string): Enrolment {
	const fields = { ...found.fields, target: name };
	return found.kind === 'applies'
		? { ...found, fields, contribution: { ...found.contribution, target: name } }
		: { ...found, fields };
}
