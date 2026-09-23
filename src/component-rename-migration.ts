/*
 * Vault-wide migration for a component rename
 * (`docs/features/component-rename-migration.md`).
 *
 * Renaming a component's `label`, or a declared entry key, in the layout
 * editor finds every character note pointing at this layout and rewrites the
 * matching section heading or fenced `key: value` line in place — byte for
 * byte otherwise — so existing characters keep reading correctly the moment
 * the author renames something, instead of going quiet under a heading or a
 * key the layout no longer looks for.
 *
 * A sibling to `layouts.ts` rather than a member of `parse/`, `components/`
 * or `formula/`: it reaches `app.vault` and `app.metadataCache`, which
 * Constraint 5 keeps out of `parse/`, and it is layout-scoped machinery
 * rather than one component's own contract. The rewrite itself is two pure
 * functions in `parse/` — `renameSectionLabel` and `renameFencedEntry` — so
 * what is left here is one job: carry one rename across every note that
 * names this layout.
 *
 * **Split once, on the scan, and not on the sentence** (`docs/PATTERNS.md`
 * §1). This held a scan, a write and a sentence as one decision seen at three
 * moments — which notes a rename reaches, what each one's own text becomes, and
 * what the author is told happened. The scan got a second caller: a *layout
 * file* renamed in the file explorer counts the notes still naming its old name
 * (`docs/features/visible-layout-files.md`), and "which notes name this layout"
 * is a predicate, which §1 extracts on its second consumer. So it lives in
 * `layout-notes.ts` and both import it. `migrationMessage` stays: it is still a
 * pure function with one consumer, and the layout rename's sentence is a
 * different sentence about a different event.
 */

import { App, Notice } from 'obsidian';
import { layoutCandidates } from './layout-notes';
import { EntryAddress } from './types';
import {
	getSection,
	parseCharacter,
	renameSectionLabel,
	serialiseCharacter,
	setSectionBody,
} from './parse/character';
import { renameFencedEntry } from './parse/fenced';
import { joinRecords, splitRecords } from './parse/records';

/**
 * What one field's commit in the layout editor hands this module: a label
 * pair, or a section-plus-key pair.
 *
 * `'key'` names the section by `label` — unchanged by a key rename — because
 * a fenced entry has to be found inside a section before it can be renamed,
 * and the section itself is not what moved. `perRecord` is not decided here
 * or by the editor: it is `EntryAddress.fence` as the owning component
 * declared it, translated once by `keyRename` above — `'record'` for a
 * section holding one fence per `### ` record, `'section'` for one holding a
 * single fence. Record set is the only component declaring the first today,
 * and nothing outside it says so. See the feature doc's Model question for
 * the boundary this union is drawn to: Table's and Roster's own `columns`,
 * Roster's `rows[].key` and every component's `id` never produce one.
 */
export type RenameIntent =
	| { kind: 'label'; from: string; to: string }
	| {
			kind: 'key';
			label: string;
			from: string;
			to: string;
			perRecord: boolean;
	  };

/**
 * The intent a key field's commit carries, or `undefined` where there is
 * nothing to migrate: a field that addresses no entry, a name that did not
 * change, or an end with no name at all — a list field's blank primary column,
 * which is refused rather than defaulted, so it addresses nothing either way.
 *
 * The one place an `EntryAddress` becomes an intent, so the two editor
 * modules that commit a key cannot disagree about what a fence shape means.
 * **`perRecord` is read off the component's own declaration** rather than
 * decided here: the editor does not know, and must not learn, that Record set
 * is the component whose section holds one fence per record.
 */
export function keyRename(
	address: EntryAddress | undefined,
	label: string,
	from: string,
	to: string,
): RenameIntent | undefined {
	if (address === undefined) return undefined;
	if (from === '' || to === '' || from === to) return undefined;
	return {
		kind: 'key',
		label,
		from,
		to,
		perRecord: address.fence === 'record',
	};
}

/**
 * What the scan did, across every note it found for this layout.
 *
 * Four counts rather than two, because three of them are outcomes the author
 * has to be told about and only the first is a success. A summary that carried
 * the renames alone reported an all-clear over a refused record and over a
 * note that could not be read at all, which is the one thing this feature's
 * own reporting exists to prevent: it rewrites files nowhere in view.
 */
export interface MigrationSummary {
	/** Notes rewritten. */
	renamed: number;
	/** Notes left byte-identical because the target name was already taken. */
	collided: number;
	/**
	 * Notes rewritten in part: at least one of a Record set's records was
	 * renamed while another already held the target key and kept the old one.
	 * Counted *alongside* `renamed`, which such a note is also one of.
	 */
	partlyKept: number;
	/**
	 * Notes the scan could not read or parse, left untouched and unrenamed.
	 * A hand-edited note is exactly the population likely to be in this state,
	 * and its data stays under the old name with nothing else to say so.
	 */
	unreadable: number;
}

/**
 * One note's outcome for this intent: nothing to touch, a refused collision,
 * or new text.
 *
 * `kept` rides along with the new text because a Record set note can be both
 * rewritten and part refused, and the refusal is invisible in the text — the
 * record that kept the old key looks exactly like a record the rename never
 * reached.
 */
type NoteOutcome =
	| { outcome: 'unaffected' }
	| { outcome: 'collision' }
	| { outcome: 'renamed'; text: string; kept: boolean };

/**
 * Apply one rename intent to one note's current source, composing the two
 * `parse/` primitives with `serialiseCharacter` exactly as every other write
 * in this codebase does — so a note this touches round-trips through the same
 * machinery an ordinary sheet edit does.
 *
 * A pure function of `source`, on purpose: it is the callback
 * `app.vault.process` is handed for the note this decides to touch, and
 * `process` may retry it against text that changed underneath — so nothing
 * outside this call may decide what it returns.
 *
 * **The note's own layout line is the authority**, not the candidate filter
 * that got it here: `layoutCandidates` admits a frontmatter value YAML coerced past
 * recognition, and this is what settles it. Checked on every call, so the
 * write's own re-decision honours it too — a note repointed at another layout
 * between the read and the write is left alone rather than migrated on the
 * strength of what it used to say.
 *
 * **One direction only, and deliberately.** This can refuse a note the filter
 * admitted; it cannot admit one the filter refused. So a cache still holding
 * a note's *old* layout name — the real cache lags a write, which
 * `characters.ts`'s own header cites — keeps that note out of the scan
 * entirely, and a rename made in the seconds after a note was repointed does
 * not reach it. That is the posture every `metadataCache` reader in `src/`
 * already has and not this feature's to change; the note reads as an ordinary
 * unmapped section until the next rename, per SPEC §10.
 */
function applyIntent(
	source: string,
	intent: RenameIntent,
	layoutName: string,
): NoteOutcome {
	const note = parseCharacter(source);
	if (note.layoutName !== layoutName) return { outcome: 'unaffected' };

	if (intent.kind === 'label') {
		const result = renameSectionLabel(note, intent.from, intent.to);
		if (result.kind === 'absent') return { outcome: 'unaffected' };
		if (result.kind === 'collision') return { outcome: 'collision' };
		return {
			outcome: 'renamed',
			text: serialiseCharacter(result.note),
			kept: false,
		};
	}

	const section = getSection(note, intent.label);
	if (section === undefined) return { outcome: 'unaffected' };

	if (!intent.perRecord) {
		const result = renameFencedEntry(section.body, intent.from, intent.to);
		if (result.kind === 'absent') return { outcome: 'unaffected' };
		if (result.kind === 'collision') return { outcome: 'collision' };
		return {
			outcome: 'renamed',
			text: serialiseCharacter(
				setSectionBody(note, intent.label, result.body),
			),
			kept: false,
		};
	}

	/*
	 * Record set: one fence per `### ` record inside this one section, each
	 * renamed on its own. `record.head` is already the exact chunk
	 * `splitRecords` carved out as "the heading's own body down to and
	 * including the fence's closing line" — `renameFencedEntry` wants no more
	 * of it than `readFenced`/`writeFenced` ever did.
	 *
	 * **A record that would collide is left alone rather than merged, and the
	 * note is still counted "renamed" where at least one other record
	 * changed.** The feature doc names the single-fence collision rule but
	 * leaves a multi-fence note's aggregate verdict to this module; refusing
	 * the whole note over one colliding record would be worse than this,
	 * since every other record's data would go on reading under a key the
	 * layout no longer looks for merely because one sibling record already
	 * had the target key. "Collision" as this note's own verdict is reserved
	 * for the case nothing in it could be renamed at all.
	 *
	 * **The refusal is still reported**, through `kept`, rather than being
	 * swallowed by the aggregate verdict. The verdict decides what the note
	 * counts as; it does not get to decide whether the author hears that a
	 * record kept the old key, which no other signal would tell them.
	 */
	const split = splitRecords(section.body);
	let changed = false;
	let anyCollision = false;
	const records = split.records.map((record) => {
		const result = renameFencedEntry(record.head, intent.from, intent.to);
		if (result.kind === 'absent') return record;
		if (result.kind === 'collision') {
			anyCollision = true;
			return record;
		}
		changed = true;
		return { ...record, head: result.body };
	});
	if (!changed) {
		return anyCollision ? { outcome: 'collision' } : { outcome: 'unaffected' };
	}
	const body = joinRecords({ preamble: split.preamble, records });
	return {
		outcome: 'renamed',
		text: serialiseCharacter(setSectionBody(note, intent.label, body)),
		kept: anyCollision,
	};
}

/**
 * Migrate every character note this layout reaches, and say what happened.
 *
 * **A note not going to change is never handed to `app.vault.process` at
 * all.** The decision is made first against a plain `read`, and only a note
 * whose outcome is `'renamed'` is written — through `process`, whose callback
 * re-applies the same pure decision against whatever the file currently
 * holds, so a write racing this scan is composed with rather than
 * overwritten. A note the initial read cannot parse is left untouched and
 * counted as `unreadable`, which the `Notice` then reports: this scan's job
 * is to migrate data, not to repair a note that is already broken on its own
 * terms — but a note it could not migrate is exactly what the author has to
 * be told about, since its data stays under the old name.
 */
export async function migrateComponentRename(
	app: App,
	layoutName: string,
	intent: RenameIntent,
): Promise<MigrationSummary> {
	let renamed = 0;
	let collided = 0;
	let partlyKept = 0;
	let unreadable = 0;

	for (const { file, certain } of layoutCandidates(app, layoutName)) {
		let source: string;
		try {
			source = await app.vault.read(file);
		} catch {
			if (certain) unreadable += 1;
			continue;
		}
		let decision: NoteOutcome;
		try {
			decision = applyIntent(source, intent, layoutName);
		} catch {
			// Only a note whose frontmatter named this layout exactly: one
			// admitted as undecidable may be nobody's, and an empty
			// `sheet-layout:` is both undecidable and unparseable.
			if (certain) unreadable += 1;
			continue;
		}
		if (decision.outcome === 'unaffected') continue;
		if (decision.outcome === 'collision') {
			collided += 1;
			continue;
		}
		/*
		 * **What the write did is what gets counted**, not what the read above
		 * predicted. `process` re-applies the decision against whatever the
		 * file currently holds, so a note that became a collision between the
		 * two — another writer adding the target name — is reported as one
		 * rather than as a rename that did not happen.
		 *
		 * `written` is a report channel and not a decision carried across
		 * calls: every invocation of the callback overwrites it from its own
		 * `current` before returning, so a retry reports the attempt that
		 * actually produced the text, which is the caveat
		 * `appendModifierDefinition` names.
		 */
		const attempts: (NoteOutcome | { outcome: 'unreadable' })[] = [];
		await app.vault.process(file, (current) => {
			try {
				const applied = applyIntent(current, intent, layoutName);
				attempts.push(applied);
				return applied.outcome === 'renamed' ? applied.text : current;
			} catch {
				attempts.push({ outcome: 'unreadable' });
				return current;
			}
		});
		// The last attempt is the one whose text the file now holds. An empty
		// list is a `process` that never called its callback, which nothing
		// does, and counting it as unread rather than as renamed keeps the
		// count a fact about the write.
		const written = attempts[attempts.length - 1] ?? {
			outcome: 'unreadable' as const,
		};
		if (written.outcome === 'renamed') {
			renamed += 1;
			if (written.kept) partlyKept += 1;
		} else if (written.outcome === 'collision') {
			collided += 1;
		} else if (written.outcome === 'unreadable') {
			unreadable += 1;
		}
	}

	return { renamed, collided, partlyKept, unreadable };
}

/**
 * What a migration did, in the words the `Notice` shows — or null where
 * nothing happened, which is the ordinary case while a layout is still being
 * drafted, before any character exists.
 *
 * A pure function of the summary, so it is tested without an `App`. One head
 * clause and up to two more, joined by semicolons: every clause but the head
 * is an outcome that only appears when its count is not zero, so the ordinary
 * clean rename is still the one sentence the feature doc names verbatim.
 *
 * **The article belongs to the noun, never to the author's key.** "a section"
 * and "an entry" are the only two nouns this sentence has, and both are fixed
 * words; choosing "a"/"an" off the *key's* first letter instead got it wrong
 * in both directions — "an Uses" for a Record set counter, "a hour" for a
 * timekeeping key — which no amount of care in the caller could have fixed.
 */
export function migrationMessage(
	intent: RenameIntent,
	summary: MigrationSummary,
): string | null {
	const { renamed, collided, partlyKept, unreadable } = summary;
	if (renamed === 0 && collided === 0 && unreadable === 0) return null;

	const { from, to } = intent;
	const target = intent.kind === 'label' ? 'a section' : 'an entry';
	const notes = (count: number): string =>
		`${count} character ${count === 1 ? 'note' : 'notes'}`;

	const parts: string[] = [];
	if (renamed > 0) {
		parts.push(`Renamed "${from}" to "${to}" in ${notes(renamed)}`);
		if (collided > 0) {
			// Agreement across the whole clause, not only its verb: the
			// subject is a count, so "it already has" and "they already have"
			// are one choice rather than two.
			//
			// **And it ends on the route**, which is UI.md §10's rule that
			// error text names the fix. Inside the clause rather than as a
			// peer of it, so a Record set rename that both collides on one
			// note and part-keeps another does not strand "move those by
			// hand" between two unrelated counts.
			parts.push(
				`${collided} left as "${from}" because ${
					collided === 1 ? 'it already has' : 'they already have'
				} ${target} called "${to}", so move ${
					collided === 1 ? 'it' : 'those'
				} by hand`,
			);
		}
	} else if (collided > 0) {
		// Stated once. The sentence this replaced said the same thing twice —
		// "was not renamed to X", then "left as Y" — and opened on a quoted
		// string where its two siblings open on a verb. It carries the same
		// route as the clause above, in the shape its own sentence wants.
		parts.push(
			`Nothing was renamed: ${notes(collided)} ${
				collided === 1 ? 'already has' : 'already have'
			} ${target} called "${to}", so ${
				collided === 1 ? 'it keeps' : 'each keeps'
			} "${from}" and needs moving by hand`,
		);
	} else {
		parts.push('Nothing was renamed');
	}
	if (partlyKept > 0) {
		parts.push(
			`${partlyKept} ${
				partlyKept === 1 ? 'note has' : 'notes have'
			} a record still under "${from}"`,
		);
	}
	if (unreadable > 0) {
		parts.push(
			`${notes(unreadable)} could not be read and ${
				unreadable === 1 ? 'was' : 'were'
			} left alone`,
		);
	}
	return `${parts.join('; ')}.`;
}

/**
 * Migrate every character note this layout reaches, and report the outcome
 * through one `Notice` — fired once, and only where something happened.
 *
 * The one entry point `editor/layout-editor.ts`'s `persist()` calls, after
 * the layout file's own write has resolved: this module never runs ahead of
 * that write, so a layout write that fails leaves every character note
 * untouched.
 */
export async function reportComponentRename(
	app: App,
	layoutName: string,
	intent: RenameIntent,
): Promise<void> {
	const summary = await migrateComponentRename(app, layoutName, intent);
	const message = migrationMessage(intent, summary);
	if (message !== null) new Notice(message);
}
