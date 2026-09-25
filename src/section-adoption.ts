/*
 * Which character notes already hold a section under a label a component has
 * just taken (`docs/features/new-component-adopts-retained-section.md`).
 *
 * SPEC §10 keeps a removed component's `##` section in every note, and the sheet
 * finds a component's section by label alone. So a component inserted from the
 * picker, pasted, or given a new label can land on a label a note still uses,
 * and from then on it shows that old section as its own. Where the keys of the
 * two coincide — a default Card and a Track both store `value` — nothing in the
 * note says which component wrote the value, so no guard in a component can
 * refuse it. This is what covers that case: one `Notice`, at the moment the
 * author made the choice, counting the notes that hold such a section, so the
 * author can rename the component if the data belongs to something else.
 *
 * **Refusing the label is deliberately not what happens.** Re-adding a removed
 * component under its old label is the way back to its data, short of undo, and
 * a retained section nobody can reach again is retained in name only.
 *
 * A sibling to `component-rename-migration.ts` for that module's reason: it
 * reads `app.vault` and `app.metadataCache`, which Constraint 5 keeps out of
 * `parse/`, and it is layout-scoped machinery rather than one component's own
 * contract. It owns the scan and the words, and **it writes nothing**: a note
 * that cannot be read is not counted and not reported, because this is a
 * warning rather than an operation and there is nothing to have left alone.
 */

import { App, Notice } from 'obsidian';
import { getComponent } from './components';
import { layoutCandidates } from './layout-notes';
import { getSection, parseCharacter } from './parse/character';
import { spelled, tooManyToName } from './parse/spelled';
import { ComponentConfig, isContainer } from './types';

/** What a scan found: how many notes, and which of the labels they hold. */
export interface Adoption {
	/** Notes holding a non-empty section under at least one of the labels. */
	notes: number;
	/** The labels some note holds, in the order they were asked about. */
	labels: readonly string[];
}

/**
 * Who shows the kept section, in the sentence's words. `'component'` is one
 * component the author just inserted or renamed, so it names one label; `'pasted'`
 * is a paste, the only gesture that can bring several.
 */
export type AdoptionSubject = 'component' | 'pasted';

/**
 * The labels `root` and everything inside it would read a section under.
 *
 * A container has no section (`storage: 'none'`), so it is passed over and its
 * children are each checked — a pasted Group can land three components on
 * three kept sections at once.
 */
export function sectionLabels(root: ComponentConfig): string[] {
	const labels: string[] = [];
	const visit = (config: ComponentConfig): void => {
		if (!isContainer(getComponent(config.type))) labels.push(config.label);
		for (const child of config.children ?? []) visit(child);
	};
	visit(root);
	return labels;
}

/**
 * Count the character notes on this layout that already hold a section under
 * one of `labels` **with something in it**.
 *
 * A section holding only whitespace is not counted: it holds no data, and
 * adopting it loses nothing. The section is found with `getSection`, the
 * lookup the sheet itself makes, so the scan and the reader cannot disagree
 * about what a label matches.
 *
 * `without` is for a rename: a note that also holds a section under the *old*
 * label is the migration's collision, which the migration counts and words
 * itself, so it is not counted twice.
 *
 * **Every candidate is settled by its own parsed `layoutName`**, the sheet's
 * own reader, so a layout named `12` — undecidable in the frontmatter cache —
 * is counted where the note's text names it (`layout-notes.ts`). Read through
 * `cachedRead`, because nothing here writes and nothing is derived from the
 * text but a count.
 */
export async function countAdoptions(
	app: App,
	layoutName: string,
	labels: readonly string[],
	without?: string,
): Promise<Adoption> {
	const held = new Set<string>();
	let notes = 0;
	if (labels.length === 0) return { notes, labels: [] };
	for (const { file } of layoutCandidates(app, layoutName)) {
		let found: string[];
		try {
			const note = parseCharacter(await app.vault.cachedRead(file));
			if (note.layoutName !== layoutName) continue;
			if (without !== undefined && getSection(note, without) !== undefined) continue;
			found = labels.filter(
				(label) => (getSection(note, label)?.body.trim() ?? '') !== '',
			);
		} catch {
			// Unreadable or unparseable: not counted, and not reported (header).
			continue;
		}
		if (found.length === 0) continue;
		notes += 1;
		for (const label of found) held.add(label);
	}
	return { notes, labels: labels.filter((label) => held.has(label)) };
}

/**
 * What an adoption means, in the words the `Notice` shows — or null where no
 * note holds anything, which is the ordinary case.
 *
 * A pure function of what the scan found, so it is tested without an `App`, as
 * `migrationMessage` is. **It ends on the route**, which is `docs/UI.md` §10's
 * rule that a message names the fix: renaming the component is the one gesture
 * that hands the section back to nobody without touching a note.
 */
export function adoptionSentence(
	adoption: Adoption,
	subject: AdoptionSubject,
): string | null {
	const { notes, labels } = adoption;
	if (notes === 0 || labels.length === 0) return null;
	const one = notes === 1;
	const counted = `${notes} character ${one ? 'note' : 'notes'} already ${one ? 'has' : 'have'}`;
	if (labels.length === 1) {
		const shower = subject === 'pasted' ? 'the pasted component' : 'this component';
		const fix = subject === 'pasted' ? 'Rename it' : 'Rename the component';
		return `${counted} a section called "${labels[0] ?? ''}", and ${shower} now shows ${
			one ? 'it' : 'them'
		}. ${fix} if ${one ? 'that section belongs' : 'those sections belong'} to something else.`;
	}
	// Several labels only ever come from a paste: an insert and a rename each
	// land one component on one label, so this path has no subject to switch on.
	// Past the bound it counts rather than names, as the paste's own list of
	// what to check does.
	if (tooManyToName(labels)) {
		return `${counted} sections under the names of ${labels.length} of the pasted components, and those components now show them. Rename any whose section belongs to something else.`;
	}
	return `${counted} sections called ${spelled(labels)}, and the pasted components now show them. Rename any whose section belongs to something else.`;
}

/**
 * Scan and word it in one call, for the two callers that only want the words:
 * a paste folds them into its own notice, and a rename into the migration's.
 */
export async function adoptionReport(
	app: App,
	layoutName: string,
	labels: readonly string[],
	subject: AdoptionSubject,
	without?: string,
): Promise<string | null> {
	return adoptionSentence(
		await countAdoptions(app, layoutName, labels, without),
		subject,
	);
}

/**
 * Report an insert's adoption through its own `Notice`, fired only where a note
 * holds something. The picker's status line keeps saying what was added.
 */
export async function reportAdoption(
	app: App,
	layoutName: string,
	labels: readonly string[],
): Promise<void> {
	const message = await adoptionReport(app, layoutName, labels, 'component');
	if (message !== null) new Notice(message);
}
