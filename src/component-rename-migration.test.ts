// @vitest-environment happy-dom
/*
 * The vault-wide scan: candidate discovery through `metadataCache`, the
 * per-note write through `app.vault.process`, and the summary that decides
 * what the `Notice` says.
 *
 * happy-dom because `obsidian` resolves to the stub (`src/test/obsidian-
 * stub.ts`), whose `Vault` and `MetadataCache` are what this reads its
 * candidates and their content out of.
 *
 * The two pure `parse/` primitives this composes — `renameSectionLabel` and
 * `renameFencedEntry` — already carry their own not-present/collision/
 * byte-identical cases in `parse/character.test.ts` and `parse/fenced.test.ts`.
 * What is worth asserting here, on `docs/PATTERNS.md` §10, is what only this
 * module owns: which notes the scan finds at all, that a note with nothing to
 * change is never handed to `process`, and the sentence the Notice shows.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as ObsidianApp } from 'obsidian';
import {
	migrateComponentRename,
	migrationMessage,
	MigrationSummary,
	RenameIntent,
	reportComponentRename,
} from './component-rename-migration';
import { App, Notice } from './test/obsidian-stub';
import { LAYOUT_KEY } from './types';

let app: App;

const vault = () => app as unknown as ObsidianApp;

beforeEach(() => {
	app = new App();
	Notice.messages = [];
});

const LAYOUT = 'Adventurer';

function note(layout: string, body: string): string {
	return `---\nsheet-layout: ${layout}\n---\n${body}`;
}

const ABILITIES = note(
	LAYOUT,
	'\n## Abilities\n```sheet\nDEX: 16\n```\n',
);

describe('migrateComponentRename', () => {
	it('rewrites a label in every matching note and leaves the rest alone', async () => {
		await app.vault.create('Aramil.md', ABILITIES);
		await app.vault.create(
			'Sable.md',
			note(LAYOUT, '\n## Abilities\n```sheet\nDEX: 9\n```\n'),
		);
		// A different layout: correctly untouched even though the label matches.
		await app.vault.create(
			'Thora.md',
			note('Other layout', '\n## Abilities\n```sheet\nDEX: 20\n```\n'),
		);
		// Not a character note at all: no frontmatter to match against.
		await app.vault.create('Notes.md', 'Just prose.\n');

		const intent: RenameIntent = {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		};
		const summary = await migrateComponentRename(vault(), LAYOUT, intent);
		expect(summary).toEqual({ renamed: 2, collided: 0, partlyKept: 0, unreadable: 0 });

		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			note(LAYOUT, '\n## Ability scores\n```sheet\nDEX: 16\n```\n'),
		);
		expect(await app.vault.read(app.vault.getFileByPath('Thora.md')!)).toBe(
			note('Other layout', '\n## Abilities\n```sheet\nDEX: 20\n```\n'),
		);
	});

	it('leaves a note with no section under the old label untouched and uncounted', async () => {
		await app.vault.create('Aramil.md', note(LAYOUT, '\n## HP\n```sheet\nmax: 10\n```\n'));
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary).toEqual({ renamed: 0, collided: 0, partlyKept: 0, unreadable: 0 });
	});

	it('refuses and counts a note whose target label already has a section', async () => {
		const source = note(
			LAYOUT,
			'\n## Abilities\n```sheet\nDEX: 16\n```\n\n## Ability scores\n```sheet\nDEX: 9\n```\n',
		);
		await app.vault.create('Aramil.md', source);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary).toEqual({ renamed: 0, collided: 1, partlyKept: 0, unreadable: 0 });
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(source);
	});

	it('leaves a note that already holds only the target name untouched and uncounted', async () => {
		/*
		 * The "already-correct" case Acceptance criterion 14 enumerates, and the
		 * one the scan's cases were missing: a note holding the *new* name and not
		 * the old one — an author who hand-edited ahead of the rename, or a note
		 * migrated by an earlier run of the same gesture. It is not a collision,
		 * because there is nothing under the old name to contest; it is simply
		 * nothing to do, so it must be untouched, unwritten and uncounted.
		 *
		 * The distinction from `refuses and counts a note whose target label
		 * already has a section` is the whole point: that note holds *both*
		 * names, this one holds only the new.
		 */
		const migrated = note(LAYOUT, '\n## Prowess\n```sheet\nDEX: 16\n```\n');
		await app.vault.create('Aramil.md', migrated);
		const writes = vi.spyOn(app.vault, 'process');

		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Prowess',
		});

		expect(summary).toEqual({
			renamed: 0,
			collided: 0,
			partlyKept: 0,
			unreadable: 0,
		});
		expect(writes).not.toHaveBeenCalled();
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			migrated,
		);
		// And it reports nothing, which is what keeps a second identical rename
		// from claiming it did something.
		expect(migrationMessage({ kind: 'label', from: 'Abilities', to: 'Prowess' }, summary)).toBeNull();
	});

	it('leaves a fence that already holds only the target key untouched and uncounted', async () => {
		// The same case one level down, on the key half of criterion 14.
		const migrated = note(LAYOUT, '\n## Abilities\n```sheet\nAgility: 16\n```\n');
		await app.vault.create('Aramil.md', migrated);
		const writes = vi.spyOn(app.vault, 'process');

		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'key',
			label: 'Abilities',
			from: 'DEX',
			to: 'Agility',
			perRecord: false,
		});

		expect(summary).toEqual({
			renamed: 0,
			collided: 0,
			partlyKept: 0,
			unreadable: 0,
		});
		expect(writes).not.toHaveBeenCalled();
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			migrated,
		);
	});

	it('never calls process for a note that will not change', async () => {
		await app.vault.create('Aramil.md', ABILITIES);
		await app.vault.create(
			'Sable.md',
			note(LAYOUT, '\n## HP\n```sheet\nmax: 10\n```\n'),
		);
		const spy = vi.spyOn(app.vault, 'process');
		await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0]?.[0]?.path).toBe('Aramil.md');
	});

	it('rewrites a declared key inside the section fence, leaving the value and spacing', async () => {
		await app.vault.create('Aramil.md', ABILITIES);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'key',
			label: 'Abilities',
			from: 'DEX',
			to: 'Dexterity',
			perRecord: false,
		});
		expect(summary).toEqual({ renamed: 1, collided: 0, partlyKept: 0, unreadable: 0 });
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			note(LAYOUT, '\n## Abilities\n```sheet\nDexterity: 16\n```\n'),
		);
	});

	it('refuses and counts a note whose fence already has the target key', async () => {
		const source = note(
			LAYOUT,
			'\n## Abilities\n```sheet\nDEX: 16\nDexterity: 9\n```\n',
		);
		await app.vault.create('Aramil.md', source);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'key',
			label: 'Abilities',
			from: 'DEX',
			to: 'Dexterity',
			perRecord: false,
		});
		expect(summary).toEqual({ renamed: 0, collided: 1, partlyKept: 0, unreadable: 0 });
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(source);
	});

	it('leaves a note whose section has no such key untouched and uncounted', async () => {
		await app.vault.create('Aramil.md', ABILITIES);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'key',
			label: 'Abilities',
			from: 'CON',
			to: 'Constitution',
			perRecord: false,
		});
		expect(summary).toEqual({ renamed: 0, collided: 0, partlyKept: 0, unreadable: 0 });
	});

	it('renames a key once per Record set record, skipping only the record that collides', async () => {
		const source = note(
			LAYOUT,
			[
				'',
				'## Spells',
				'### Fireball',
				'```sheet',
				'Level: 3',
				'```',
				'',
				'### Magic Missile',
				'```sheet',
				'Level: 1',
				'Spell level: 1',
				'```',
				'',
			].join('\n'),
		);
		await app.vault.create('Aramil.md', source);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'key',
			label: 'Spells',
			from: 'Level',
			to: 'Spell level',
			perRecord: true,
		});
		// Renamed *and* part kept: the note counts as renamed, and the record
		// that refused is still reported rather than swallowed by that verdict.
		expect(summary).toEqual({
			renamed: 1,
			collided: 0,
			partlyKept: 1,
			unreadable: 0,
		});
		const text = await app.vault.read(app.vault.getFileByPath('Aramil.md')!);
		// Fireball's record renamed...
		expect(text).toContain('### Fireball\n```sheet\nSpell level: 3\n```');
		// ...Magic Missile's left exactly as it was, since it already has the key.
		expect(text).toContain(
			'### Magic Missile\n```sheet\nLevel: 1\nSpell level: 1\n```',
		);
	});

	it('counts a Record set note as collision only where every record already has the target key', async () => {
		const source = note(
			LAYOUT,
			[
				'',
				'## Spells',
				'### Fireball',
				'```sheet',
				'Level: 3',
				'Spell level: 3',
				'```',
				'',
			].join('\n'),
		);
		await app.vault.create('Aramil.md', source);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'key',
			label: 'Spells',
			from: 'Level',
			to: 'Spell level',
			perRecord: true,
		});
		expect(summary).toEqual({ renamed: 0, collided: 1, partlyKept: 0, unreadable: 0 });
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(source);
	});

	it('counts and reports a candidate note it cannot parse, rather than passing over it', async () => {
		/*
		 * A hand edit the frontmatter reader accepts and the parser does not:
		 * `sheet-layout` indented one space. `metadataCache` trims the key and
		 * answers the layout, so the scan finds this note; `parseCharacter`'s
		 * own `LAYOUT_KEY_LINE` anchors the key at the line start and refuses
		 * it. That is exactly the population this count exists for — a note
		 * whose data stays under the old name with nothing else to say so.
		 */
		await app.vault.create('Aramil.md', ABILITIES);
		await app.vault.create(
			'Bent.md',
			'---\n sheet-layout: Adventurer\n---\n\n## Abilities\n```sheet\nDEX: 8\n```\n',
		);
		const intent: RenameIntent = {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		};
		const summary = await migrateComponentRename(vault(), LAYOUT, intent);
		expect(summary).toEqual({
			renamed: 1,
			collided: 0,
			partlyKept: 0,
			unreadable: 1,
		});
		expect(migrationMessage(intent, summary)).toBe(
			'Renamed "Abilities" to "Ability scores" in 1 character note; 1 character note could not be read and was left alone.',
		);
		// Left exactly as it was: unreadable is a report, not a repair.
		expect(await app.vault.read(app.vault.getFileByPath('Bent.md')!)).toBe(
			'---\n sheet-layout: Adventurer\n---\n\n## Abilities\n```sheet\nDEX: 8\n```\n',
		);
	});

	/*
	 * The frontmatter value the real cache hands back is YAML, and the plugin
	 * writes a plain scalar wherever `isPlainLayoutValue` allows one — so a
	 * layout named `12`, `No` or `null` is written unquoted and parsed back as
	 * a number, a boolean and nothing at all. Spied rather than modelled in the
	 * stub's own `MetadataCache`: what the real cache does with a typed scalar
	 * is a claim about Obsidian this repository has no probe for
	 * (`docs/BACKLOG.md` § Patterns), and this module's job is only to be
	 * right either way.
	 */
	function cacheReports(value: unknown): void {
		vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation(
			() =>
				({ frontmatter: { [LAYOUT_KEY]: value } }) as unknown as ReturnType<
					typeof app.metadataCache.getFileCache
				>,
		);
	}

	it('still migrates a note whose layout name YAML coerced away from a string', async () => {
		const numbered = '---\nsheet-layout: 12\n---\n\n## Abilities\n```sheet\nDEX: 16\n```\n';
		await app.vault.create('Aramil.md', numbered);
		// What a real cache would answer for `sheet-layout: 12`.
		cacheReports(12);
		const summary = await migrateComponentRename(vault(), '12', {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary.renamed).toBe(1);
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			numbered.replace('## Abilities', '## Ability scores'),
		);
	});

	it('still migrates a layout named null, which the cache answers as nothing at all', async () => {
		// `isPlainLayoutValue('null')` passes, so the plugin writes this
		// unquoted and a real cache hands back `null` — the third coercion the
		// guard's own comment names, and the one a bare null check excluded.
		const named = '---\nsheet-layout: null\n---\n\n## Abilities\n```sheet\nDEX: 16\n```\n';
		await app.vault.create('Aramil.md', named);
		cacheReports(null);
		const summary = await migrateComponentRename(vault(), 'null', {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary.renamed).toBe(1);
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			named.replace('## Abilities', '## Ability scores'),
		);
	});

	it('reports nothing for a note with an empty sheet-layout, which is nobody’s', async () => {
		/*
		 * `sheet-layout:` with no value is `null` from a real cache, so it is
		 * admitted as undecidable and then refuses to parse. Reporting it
		 * would put "could not be read" on every rename in the vault for a
		 * note that never named this layout — so only a note the cache
		 * matched *exactly* is counted unreadable.
		 */
		await app.vault.create('Aramil.md', ABILITIES);
		await app.vault.create('Blank.md', '---\nsheet-layout:\n---\n\n## Abilities\n');
		vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation(
			(file) =>
				({
					frontmatter: {
						[LAYOUT_KEY]: file.path === 'Blank.md' ? null : LAYOUT,
					},
				}) as unknown as ReturnType<typeof app.metadataCache.getFileCache>,
		);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary).toEqual({
			renamed: 1,
			collided: 0,
			partlyKept: 0,
			unreadable: 0,
		});
	});

	it('leaves a note alone where the cache says this layout and the note itself does not', async () => {
		// A stale cache, which the real one can be: the note's own layout line
		// is what decides, so nothing is migrated on the strength of an index.
		const other = note('Other layout', '\n## Abilities\n```sheet\nDEX: 16\n```\n');
		await app.vault.create('Aramil.md', other);
		cacheReports(LAYOUT);
		const spy = vi.spyOn(app.vault, 'process');
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary).toEqual({
			renamed: 0,
			collided: 0,
			partlyKept: 0,
			unreadable: 0,
		});
		expect(spy).not.toHaveBeenCalled();
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(other);
	});

	it('reaches a character anywhere in the vault, wherever new ones are written', async () => {
		/*
		 * **The case this replaces asserted the opposite**, and the opposite
		 * was the bug: the scan used to narrow to the `characterFolder`
		 * setting, whose own description is "New characters are written here"
		 * — a creation destination, and the only other reader of it
		 * (`characters.ts`) uses it to place a new note. Read as a residence
		 * rule it made every existing character outside that folder invisible:
		 * the owner's characters sit in `Characters/` while new ones go to
		 * `Characters/new`, so a label rename reported nothing, migrated
		 * nothing, and left the note rendering empty under a heading the
		 * layout no longer named.
		 */
		await app.vault.createFolder('Characters');
		await app.vault.createFolder('Characters/new');
		await app.vault.create('Characters/Aramil.md', ABILITIES);
		await app.vault.create('Characters/new/Fresh.md', ABILITIES);
		await app.vault.create('Elsewhere.md', ABILITIES);
		const summary = await migrateComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(summary).toEqual({ renamed: 3, collided: 0, partlyKept: 0, unreadable: 0 });
		for (const path of [
			'Characters/Aramil.md',
			'Characters/new/Fresh.md',
			'Elsewhere.md',
		]) {
			expect(
				await app.vault.read(app.vault.getFileByPath(path)!),
				path,
			).toContain('## Ability scores');
		}
	});
});

describe('migrationMessage', () => {
	const LABEL: RenameIntent = { kind: 'label', from: 'AC', to: 'Armor class' };
	const KEY: RenameIntent = {
		kind: 'key',
		label: 'Abilities',
		from: 'str',
		to: 'Strength',
		perRecord: false,
	};
	/** A summary with only the counts a case is about. */
	const summary = (over: Partial<MigrationSummary>): MigrationSummary => ({
		renamed: 0,
		collided: 0,
		partlyKept: 0,
		unreadable: 0,
		...over,
	});

	it('is null where nothing happened', () => {
		expect(migrationMessage(LABEL, summary({}))).toBeNull();
	});

	it('names the count where every match was renamed', () => {
		expect(migrationMessage(LABEL, summary({ renamed: 12 }))).toBe(
			'Renamed "AC" to "Armor class" in 12 character notes.',
		);
	});

	it('uses the singular for exactly one note', () => {
		expect(migrationMessage(LABEL, summary({ renamed: 1 }))).toBe(
			'Renamed "AC" to "Armor class" in 1 character note.',
		);
	});

	it('names the skipped count and reason alongside the renamed count', () => {
		expect(
			migrationMessage(LABEL, summary({ renamed: 11, collided: 1 })),
		).toBe(
			'Renamed "AC" to "Armor class" in 11 character notes; 1 left as "AC" because it already has a section called "Armor class", so move it by hand.',
		);
	});

	it('agrees in number across the whole skip clause, not only its verb', () => {
		// Every case above is at one skipped note, which is how a hard-coded
		// "it already has" shipped green.
		expect(
			migrationMessage(LABEL, summary({ renamed: 11, collided: 2 })),
		).toBe(
			'Renamed "AC" to "Armor class" in 11 character notes; 2 left as "AC" because they already have a section called "Armor class", so move those by hand.',
		);
	});

	it('says "entry" rather than "section" for a key rename', () => {
		expect(migrationMessage(KEY, summary({ renamed: 3, collided: 1 }))).toBe(
			'Renamed "str" to "Strength" in 3 character notes; 1 left as "str" because it already has an entry called "Strength", so move it by hand.',
		);
	});

	it('gives the noun its own article, whatever letter the key starts with', () => {
		// The article used to be chosen off the key's first letter, which read
		// "an Uses" for a Record set counter and "a hour" the other way. Both
		// nouns it can introduce are fixed words, so it belongs to them.
		const uses: RenameIntent = {
			kind: 'key',
			label: 'Features',
			from: 'Left',
			to: 'Uses',
			perRecord: true,
		};
		expect(migrationMessage(uses, summary({ renamed: 1, collided: 1 }))).toContain(
			'an entry called "Uses"',
		);
	});

	it('reports every candidate colliding, with none renamed', () => {
		expect(migrationMessage(LABEL, summary({ collided: 2 }))).toBe(
			'Nothing was renamed: 2 character notes already have a section called "Armor class", so each keeps "AC" and needs moving by hand.',
		);
	});

	it('holds that sentence at one note too', () => {
		expect(migrationMessage(LABEL, summary({ collided: 1 }))).toBe(
			'Nothing was renamed: 1 character note already has a section called "Armor class", so it keeps "AC" and needs moving by hand.',
		);
	});

	it('names a record that kept the old key inside a note it did rename', () => {
		expect(migrationMessage(KEY, summary({ renamed: 2, partlyKept: 1 }))).toBe(
			'Renamed "str" to "Strength" in 2 character notes; 1 note has a record still under "str".',
		);
	});

	it('names notes it could not read at all', () => {
		expect(migrationMessage(KEY, summary({ renamed: 8, unreadable: 2 }))).toBe(
			'Renamed "str" to "Strength" in 8 character notes; 2 character notes could not be read and were left alone.',
		);
	});

	it('reports an unreadable note even where nothing else happened', () => {
		expect(migrationMessage(KEY, summary({ unreadable: 1 }))).toBe(
			'Nothing was renamed; 1 character note could not be read and was left alone.',
		);
	});
});

describe('reportComponentRename', () => {
	it('fires one Notice when something changed', async () => {
		await app.vault.create('Aramil.md', ABILITIES);
		await reportComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(Notice.messages).toEqual([
			'Renamed "Abilities" to "Ability scores" in 1 character note.',
		]);
	});

	it('fires no Notice when nothing matched', async () => {
		await reportComponentRename(vault(), LAYOUT, {
			kind: 'label',
			from: 'Abilities',
			to: 'Ability scores',
		});
		expect(Notice.messages).toEqual([]);
	});
});
