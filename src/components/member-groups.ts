/*
 * Which modifier groups a value is in, and how a component says so
 * (`docs/features/table-row-modifier-target.md` D4).
 *
 * **Not a component.** In no registry, declaring no `ComponentDefinition`,
 * importing nothing from `obsidian` and touching no file. It holds the one rule
 * Card, Card set, Table and Roster all follow, on PATTERNS §1's one-step tier
 * for a policy: four copies of "a row's own list adds to its component's
 * default" could only be tested for still agreeing, and the copy that drifted
 * would be a row quietly left out of a group its author put it in.
 *
 * **Membership is declared on the value** (ruling 2). A Card names its groups,
 * a Card set entry its own, and a Table or Roster sets a default every row is in
 * and lets a row add more. **A row leaves the default only by saying so**, with
 * `inheritGroups: false`, and then carries its own list alone (ruling 3): no
 * modifier excludes anything, and an empty own list means nothing special.
 *
 * What it does not do is read the layout's list of groups. Whether a group a
 * value names is declared is the editor's report, made in
 * `formula/modifier-targets.ts`'s one walk over what the components publish;
 * here a value carries the names it was given, declared or not, and a name
 * nothing declares reaches nothing.
 */

import { ScopeEntry, UnnamedMember } from '../types';

/** Why a `groups` that is not a list of names refuses the configuration (D6). */
export const GROUPS_NOT_A_LIST =
	'Groups are a list of group names. Write the group on each row that belongs to it.';

/**
 * Why a `groups` value refuses the component's configuration, or null where it
 * is absent or a list of strings. **Derived membership is refused here** (D6):
 * a formula, a stat or a column value is not a list of literal names.
 */
export function groupsFault(value: unknown): string | null {
	if (value === undefined) return null;
	if (!Array.isArray(value) || value.some((name) => typeof name !== 'string')) {
		return GROUPS_NOT_A_LIST;
	}
	return null;
}

/**
 * The first fault among a list of members' own `groups`, a row's or an
 * entry's, or null where every one is a list of names.
 */
export function memberGroupsFault(
	members: readonly { groups?: unknown }[] | undefined,
): string | null {
	for (const member of members ?? []) {
		const fault = groupsFault(member.groups);
		if (fault !== null) return fault;
	}
	return null;
}

/**
 * One list of group names as a value carries it: trimmed, blanks and repeats
 * dropped, in the order written. Anything that is not a list of strings carries
 * none, since `groupsFault` has already refused the configuration.
 */
export function ownGroups(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const found: string[] = [];
	for (const raw of value) {
		if (typeof raw !== 'string') continue;
		const name = raw.trim();
		if (name !== '' && !found.includes(name)) found.push(name);
	}
	return found;
}

/**
 * The groups one row is in: its component's default, then the row's own added
 * to it, repeats dropped.
 *
 * **A row's own list adds to the default and never replaces it.** Overlap is
 * the norm — Acrobatics is both a skill and DX-based — and a replacing list
 * would make a later change to the default silently miss every row with a list
 * of its own: the author adds `check` to the Skills default and Acrobatics is
 * quietly left out. `inheritGroups: false` is the one way out, and then the
 * row's own list is all it is in.
 */
export function rowGroups(
	row: { groups?: unknown; inheritGroups?: unknown } | undefined,
	defaults: unknown,
): string[] {
	const own = ownGroups(row?.groups);
	if (row?.inheritGroups === false) return own;
	const all = ownGroups(defaults);
	for (const name of own) if (!all.includes(name)) all.push(name);
	return all;
}

/**
 * An entry carrying its groups, where it is in any: unchanged where it is in
 * none, so a layout declaring no group publishes exactly what it always did.
 */
export function withGroups(entry: ScopeEntry, groups: readonly string[]): ScopeEntry {
	return groups.length === 0 ? entry : { ...entry, groups };
}

/**
 * The slot key of a value that publishes no name (D5): the component id and the
 * row's place in the order the card draws its rows. `[` is not a character of
 * the grammar, so no formula can spell it; the row's own cell reads it through
 * `mod.self`.
 */
export function memberSlot(id: string, position: number): string {
	return `${id}[${position}]`;
}

/** A row with no name, in some group, as `ScopeValues.unnamed` lists it. */
export function unnamedMember(
	id: string,
	position: number,
	label: string,
	groups: readonly string[],
): UnnamedMember {
	return { key: memberSlot(id, position), label, groups };
}

/**
 * Every group a component's configuration names, on itself and on each row or
 * entry of its lists, in first-seen order and declared or not
 * (`docs/features/table-row-modifier-target.md` D7, D13).
 *
 * **Read off the component's own declarations**: a field of kind `groups` names
 * where its default is, and a list field carrying `memberGroups` names the list
 * whose entries carry their own. So the editor's report and a paste's notice
 * find membership where the component says it is, rather than by scanning
 * every array the config holds.
 */
export function memberGroupsOf(
	config: object,
	definition: { configFields: readonly { key: string; kind: string; memberGroups?: object }[] } | undefined,
): string[] {
	const record = config as Readonly<Record<string, unknown>>;
	const found: string[] = [];
	const take = (value: unknown): void => {
		for (const name of ownGroups(value)) if (!found.includes(name)) found.push(name);
	};
	for (const field of definition?.configFields ?? []) {
		if (field.kind === 'groups') take(record[field.key]);
		if (field.memberGroups === undefined) continue;
		const list = record[field.key];
		if (!Array.isArray(list)) continue;
		for (const entry of list as unknown[]) {
			if (typeof entry === 'object' && entry !== null) {
				take((entry as Readonly<Record<string, unknown>>).groups);
			}
		}
	}
	return found;
}

/** The scope fields a component's membership adds, absent where there are none. */
export function membership(
	unnamed: readonly UnnamedMember[],
	openGroups: readonly string[],
): { unnamed?: readonly UnnamedMember[]; openGroups?: readonly string[] } {
	return {
		...(unnamed.length === 0 ? {} : { unnamed }),
		...(openGroups.length === 0 ? {} : { openGroups }),
	};
}
