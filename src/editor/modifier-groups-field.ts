/*
 * The layout's modifier groups (`docs/features/table-row-modifier-target.md`
 * D6, D12), as a field in the layout editor.
 *
 * A textarea, one group per line as `save: Saving throws`, a line with no colon
 * taking its name as its label: the bonus types' shape, through the same
 * `line-list-field.ts`, beside them because it is the same category — the
 * layout's own vocabulary, shared by every component using it.
 *
 * **What it adds to the shared list is the members**, and that is the point of
 * drawing it here rather than leaving the list bare: under the count, each usable
 * group says how many values are in it, and its `title` lists them. Membership is
 * explicit and shown, never implied by a name — dnd5e's initiative outside
 * `ability.check`, Pathfinder 2e's `all` that is not all — so an author sees
 * where a group named for a kind of thing actually ends. A group with no member
 * says so, and one whose only members are rows a character adds says that
 * instead (D7).
 *
 * Membership is read through `formula/modifier-targets.ts`'s one walk over the
 * configuration (`groupIndex`, `openGroupHolders`), so this count and the
 * sheet's reach line cannot disagree about what a group holds.
 */

import {
	commitLineList,
	LineListField,
	LineListSpec,
	renderLineList,
} from './line-list-field';
import { Layout } from '../parse/layout';
import { parseModifierGroups, readGroupLine, spellGroupLine } from '../parse/modifier-groups';
import { series } from '../parse/spelled';
import { nameText } from '../formula/name-label';
import {
	groupIndex,
	ModifierTargetSource,
	openGroupHolders,
} from '../formula/modifier-targets';

/**
 * A sample group, a constant rather than prose for the bonus types' reason: the
 * name is what a cell spells after `@`, and sentence case would make it another.
 */
const GROUP_EXAMPLE = 'save: Saving throws';

/** What one usable group's member line says, and what its `title` lists. */
export function memberLine(
	count: number,
	labels: readonly string[],
	openHolders: readonly string[],
): { text: string; title?: string } {
	if (count === 0) {
		return openHolders.length === 0
			? { text: 'No value is in this group yet.' }
			: { text: `Only rows a character adds to ${series([...openHolders])} are in this group.` };
	}
	return { text: `${count} ${count === 1 ? 'value' : 'values'}`, title: labels.join(', ') };
}

/** Everything the shared field cannot work out for itself. */
function spec(layout: Layout, sources: readonly ModifierTargetSource[]): LineListSpec {
	return {
		key: 'modifierGroups',
		heading: 'Modifier groups',
		description:
			'The groups a modifier may aim at instead of one value, one per line as `name: Label`. A modifier aimed at a group changes every value in it. Removing one changes no character note.',
		example: GROUP_EXAMPLE,
		placeholder: 'Add a group to aim one modifier at many values.',
		className: 'sheetsmith-modifier-groups',
		token: 'modifier-groups',
		problemsId: 'sheetsmith-modifier-group-problems',
		noun: 'modifier group',
		stored: {
			lines: (from) =>
				((from.modifierGroups ?? []) as unknown as readonly Record<string, unknown>[]).map(
					(group) => spellGroupLine(group),
				),
			write: (lines) => lines.map((line) => readGroupLine(line)),
		},
		read: (lines) => {
			const { groups, problems } = parseModifierGroups({
				...layout,
				modifierGroups: lines.map((line) => readGroupLine(line)),
			});
			return {
				usable: groups.map((group) => group.name),
				problems: problems.map(({ message, group }) => ({
					message,
					...(group !== undefined ? { locator: group } : {}),
				})),
			};
		},
		after: (into, usable) => {
			const declared = parseModifierGroups(layout).groups.filter((group) =>
				usable.includes(group.name),
			);
			const index = groupIndex(declared, sources);
			const open = openGroupHolders(sources);
			for (const group of declared) {
				const members = index.members.get(group.name) ?? [];
				const said = memberLine(
					members.length,
					// Each member's full breadcrumb, the row a reader sees
					// (`docs/features/published-name-labels.md`).
					members.map((member) => nameText(member.parts, 'full', { component: true })),
					open.get(group.name) ?? [],
				);
				into.createDiv('sheetsmith-group-members', (el) => {
					el.createSpan({ cls: 'sheetsmith-group-members-name', text: group.label });
					const count = el.createSpan({ text: said.text });
					if (said.title !== undefined) count.title = said.title;
				});
			}
		},
	};
}

export type ModifierGroupsField = LineListField;

export type ModifierGroupsContext = Parameters<typeof renderLineList>[3];

export function commitModifierGroups(field: ModifierGroupsField | null): boolean {
	return commitLineList(field);
}

export function renderModifierGroups(
	container: HTMLElement,
	layout: Layout,
	context: ModifierGroupsContext,
	sources: readonly ModifierTargetSource[],
): ModifierGroupsField {
	return renderLineList(container, layout, spec(layout, sources), context);
}
