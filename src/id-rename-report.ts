/*
 * Which character notes still read a component id the layout editor just
 * renamed, and the words the `Notice` says it in
 * (`docs/features/component-id-rename.md` §3).
 *
 * **It writes nothing, ever.** A rename rewrites every reference inside the
 * layout and none inside a note: what a note holds at those sites is text a
 * player typed, no contract member writes a modifier cell back, and SPEC §10
 * rules that a name read inside a note's expression is reported by the sheet
 * and never migrated. So this names the notes instead, for the author to open
 * by hand, and the count is component-agnostic: each note is read the way the
 * sheet's hosts read one — its section by label, the component's own `read` —
 * and each `scopeModifiers` source is called with the inert resolver
 * `noteCandidates` uses, which reads every part's own text and evaluates
 * nothing. The editor never learns a component's storage.
 *
 * **Modifier cells only, and the sentence says so.** A typed part's target,
 * amount and condition are inside the part's own text, so the pushes show
 * them. A Record set ceiling (`Uses: 1 / prof`) is handed to the host at render
 * and returned by no member, and the contract member that would return it was
 * cut at approval — so "in modifier cells" in the sentence is what keeps an
 * author renaming `prof` from reading an all-clear over every `1 / prof` in the
 * vault. The sheet reports those where they fail, as `?`.
 *
 * A sibling to `component-rename-migration.ts` for that module's reason: it
 * reads `app.vault` and `app.metadataCache`, which Constraint 5 keeps out of
 * `parse/` and `formula/`.
 */

import { App } from 'obsidian';
import { unreadableClause } from './component-rename-migration';
import { getComponent } from './components';
import { typedEffectOf } from './formula/modifier-definitions';
import { componentReferences } from './formula/rename-names';
import { localNames } from './formula/vocabulary';
import { layoutCandidates } from './layout-notes';
import { getSection, parseCharacter } from './parse/character';
import { Layout } from './parse/layout';
import { namedFew, series, tooManyToName } from './parse/spelled';
import { FieldResolver, isContainer, ModifierPush } from './types';
import { walkLayout } from './view/grid-cells';

/** What the scan found, across every note naming the layout. */
export interface IdReaders {
	/** Basenames of the notes whose modifier cells read the id, in vault-path order. */
	names: string[];
	/** Notes whose frontmatter named the layout exactly and that would not read. */
	unreadable: number;
}

const NO_NAMES: ReadonlySet<string> = new Set();

/** Whether one pushed part reads `id`: its target, its amount or its condition. */
function pushReads(push: ModifierPush, id: string, local: ReadonlySet<string>): boolean {
	const effect = typedEffectOf(push.part);
	// A named part reads nothing in the note: its definition is in the layout,
	// and the rename rewrote it there.
	if (effect === null) return false;
	const names = (source: string | undefined, scope: ReadonlySet<string>): boolean =>
		source !== undefined &&
		(componentReferences(source, scope) ?? []).some((reference) => reference.id === id);
	// The row's own names are nearer than the sheet for the amount and the
	// condition. A union of what the row handed over and what its component
	// declares, because the inert resolver leaves a computed column out of
	// `row.values`: short locals would over-report, never under.
	const rowLocal = new Set([...Object.keys(push.row.values), ...local]);
	return (
		names(effect.target, NO_NAMES) ||
		names(effect.amount, rowLocal) ||
		names(effect.when, rowLocal)
	);
}

/**
 * The notes naming `layoutName` whose modifier cells still read `id`, and how
 * many would not read. Read only: no note is opened for writing.
 */
export async function notesReadingId(
	app: App,
	layout: Layout,
	layoutName: string,
	id: string,
): Promise<IdReaders> {
	const inert: FieldResolver = () => null;
	const sources = walkLayout(layout.components)
		.map(({ config }) => ({ config, component: getComponent(config.type) }))
		.filter(
			({ component }) =>
				component !== undefined &&
				!isContainer(component) &&
				component.scopeModifiers !== undefined,
		);
	const found: { path: string; name: string }[] = [];
	let unreadable = 0;
	if (sources.length === 0) return { names: [], unreadable };
	for (const { file, certain } of layoutCandidates(app, layoutName)) {
		let reads = false;
		try {
			const note = parseCharacter(await app.vault.read(file));
			if (note.layoutName !== layoutName) continue;
			for (const { config, component } of sources) {
				if (component === undefined) continue;
				const section = getSection(note, config.label);
				if (section === undefined) continue;
				const result = component.read(section.body, config);
				// A section the component refuses is the sheet's to report, and it
				// publishes nothing there, so it holds no part to count.
				if (!result.ok) continue;
				const pushes = component.scopeModifiers?.(result.data, config)?.(inert) ?? [];
				const local = localNames(config, component);
				if (pushes.some((push) => pushReads(push, id, local))) {
					reads = true;
					break;
				}
			}
		} catch {
			// The migration's rule: only a note whose frontmatter named this
			// layout exactly is worth reporting as unread.
			if (certain) unreadable += 1;
			continue;
		}
		if (reads) found.push({ path: file.path, name: file.basename });
	}
	found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
	return { names: found.map((note) => note.name), unreadable };
}

/**
 * What an id rename did, in the words the `Notice` shows, or null where it
 * rewrote nothing and found no note: the inventory changing on screen is the
 * acknowledgement then, SPEC §10's "a rename that matches nothing says
 * nothing".
 *
 * **It names the notes**, which §10's label migration deliberately does not:
 * there the notes were already rewritten and a heading search finds the rest,
 * while here every counted note needs opening by hand and an id is a short
 * token a vault search finds in prose everywhere. A recorded departure, not a
 * revision of §10.
 */
export function idRenameMessage(
	from: string,
	to: string,
	places: number,
	readers: IdReaders,
): string | null {
	const { names, unreadable } = readers;
	if (places === 0 && names.length === 0) return null;
	const parts: string[] = [
		places > 0
			? `Renamed "${from}" to "${to}" and updated the ${
					places === 1 ? 'place' : `${places} places`
				} that read it.`
			: `Renamed "${from}" to "${to}".`,
	];
	if (names.length > 0) {
		const one = names.length === 1;
		const counted = `${names.length} character ${one ? 'note' : 'notes'} still ${
			one ? 'reads' : 'read'
		} "${from}" in modifier cells`;
		parts.push(
			tooManyToName(names)
				? `${counted}, among them ${series(namedFew(names))}. Change those by hand.`
				: `${counted}: ${names.join(', ')}. Change those by hand.`,
		);
	}
	if (unreadable > 0) parts.push(`${unreadableClause(unreadable)}.`);
	return parts.join(' ');
}
