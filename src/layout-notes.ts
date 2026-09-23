/*
 * Which character notes name a layout (`docs/features/visible-layout-files.md`).
 *
 * One predicate with two callers: a component rename migrates every note on
 * the layout (`component-rename-migration.ts`), and a layout *file* renamed or
 * moved out of its folder counts the notes still naming its old name
 * (`view/layout-file-events.ts`). It was private to the first until the second
 * arrived, and `docs/PATTERNS.md` §1 extracts a predicate on its second
 * consumer: two copies of "which notes name this layout" could only be tested
 * for still agreeing, and what they would drift about is whether a note on a
 * layout named `12` is counted — the YAML hazard below.
 *
 * Beside `layouts.ts` rather than in it for Constraint 5's reason one layer
 * up: this reads `app.metadataCache` and note bodies, and that module is about
 * the layout folder.
 */

import { App, TFile } from 'obsidian';
import { parseCharacter } from './parse/character';
import { LAYOUT_KEY } from './types';

/** A note the scan admitted, and whether its frontmatter named it exactly. */
export interface Candidate {
	file: TFile;
	certain: boolean;
}

/**
 * Every character note that may name this layout, through `metadataCache`
 * rather than by reading a body that will not match — the same cheap frontmatter
 * read `commands.ts` and `view/auto-open.ts` already use to answer "is this a
 * character note for this layout".
 *
 * **The whole vault, never narrowed by the character folder setting.** That
 * setting is a *creation destination* — its own description is "New
 * characters are written here" — and `characters.ts` is the only other reader
 * of it, which uses it to decide where a new note goes. Reading it as a
 * residence rule made every existing character outside it invisible to this
 * scan: a rename reported nothing, migrated nothing, and left the note
 * rendering empty under a heading the layout no longer names. That is the
 * silent orphaning this feature exists to prevent, and it happened to the
 * owner on a vault whose characters sit in `Characters/` while new ones are
 * written to `Characters/new`. The frontmatter read is what makes the whole
 * vault cheap; the folder was never what made it cheap.
 *
 * **A filter and not the verdict.** The cache's value is YAML, and the plugin
 * writes a plain scalar wherever `isPlainLayoutValue` allows one — so a layout
 * named `12`, `No` or `null` is written unquoted and read back as a number, a
 * boolean and nothing at all, none of which equals its own name. A compare
 * that trusted this would skip every character on such a layout in total
 * silence, which is the orphaning this whole feature exists to prevent. So a
 * value that is not a string is admitted as *undecidable* rather than
 * rejected, and the note's own `layoutName` — `parseCharacter`'s reader, the
 * one the sheet view itself uses — settles it in each caller:
 * `countNotesNaming` below, and the migration's `applyIntent`. **`null` is one
 * of those three**, not a rejection: `isPlainLayoutValue('null')` passes, so a layout
 * named `null`, `Null` or `NULL` is written unquoted and comes back as
 * nothing at all. Only `undefined` — the key absent entirely, which is every
 * note in the vault that is not a character — is refused outright. The two
 * existing cache readers (`view/auto-open.ts`, `commands.ts`) only ever test
 * presence, which is why this hazard appears here first.
 *
 * `certain` is what the caller needs the distinction for: a note admitted on
 * an exact string match claims this layout, so failing to parse it is worth
 * reporting; a note admitted as undecidable might belong to anyone, and a
 * `sheet-layout:` left empty is `null` here and unparseable to the caller —
 * reported, it would put "1 character note could not be read" on every rename
 * in the vault for a note that was never ours.
 */
export function layoutCandidates(app: App, layoutName: string): Candidate[] {
	const found: Candidate[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		// `unknown`, not the `any` the frontmatter index signature hands over:
		// what YAML put here is the whole question this guard is about.
		const declared: unknown = app.metadataCache.getFileCache(file)
			?.frontmatter?.[LAYOUT_KEY];
		if (declared === undefined) continue;
		if (typeof declared === 'string') {
			if (declared === layoutName) found.push({ file, certain: true });
			continue;
		}
		// Coerced by YAML past recovering: read the note and let its own text
		// say. Rare by construction, so the cheap string compare above is
		// still what the overwhelming majority of notes cost.
		found.push({ file, certain: false });
	}
	return found;
}

/**
 * How many character notes name this layout, settled.
 *
 * The candidates above are a filter; a note admitted as undecidable is read
 * here and its own `layoutName` says whether it counts, which is the settle
 * the migration does through its own parse. A note that cannot be read or
 * parsed is not counted: the caller reports notes that name the layout, and a
 * note whose text says nothing is not one of them.
 */
export async function countNotesNaming(
	app: App,
	layoutName: string,
): Promise<number> {
	let count = 0;
	for (const { file, certain } of layoutCandidates(app, layoutName)) {
		if (certain) {
			count += 1;
			continue;
		}
		try {
			if (parseCharacter(await app.vault.read(file)).layoutName === layoutName) {
				count += 1;
			}
		} catch {
			// Unreadable or unparseable, and admitted only as undecidable: it
			// may be nobody's, so it is not counted as this layout's.
		}
	}
	return count;
}
