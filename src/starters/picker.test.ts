// @vitest-environment happy-dom
/*
 * Choosing a starter and copying it in.
 *
 * The vault here is `src/test/obsidian-stub.ts`'s, which is a real map of paths
 * to content: a folder that does not exist is a folder that does not exist, and
 * `create` on a taken path is the refusal `createLayout` already owns. So the
 * three states this feature can end in — a folder made and a file written, a
 * name already taken, a source that will not parse — are all reachable without
 * the app.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { App as ObsidianApp } from 'obsidian';
import { App, Notice } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { Starter, STARTERS } from './index';
import { installStarter, StarterModal } from './picker';

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));

const forged = STARTERS[0];
const fifth = STARTERS[1];
if (!forged || !fifth) throw new Error('The catalog lost an entry.');

const pathOf = (name: string): string => `${LAYOUT_FOLDER}/${name}.json`;

let app: App;

/**
 * The stub app where the real one is asked for.
 *
 * `promote-flow.test.ts`'s own helper and its reason: the stub is a *double* for
 * `App` rather than an implementation of it, so every call site would otherwise
 * carry the same `as unknown` and the same paragraph.
 */
const vault = () => app as unknown as ObsidianApp;

beforeEach(() => {
	app = new App();
	Notice.messages = [];
});

describe('installing a starter', () => {
	it('creates the folder and the file where the vault has neither', () => {
		// The premise: without this the assertions below could be passing over a
		// folder some other case left behind.
		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).toBeNull();
		expect(app.vault.getFileByPath(pathOf(forged.name))).toBeNull();
	});

	it('writes the layout under the name inside the file', async () => {
		const result = await installStarter(vault(), LAYOUT_FOLDER, forged);
		expect(result).toEqual({
			ok: true,
			message: `Added "Starter Forged in the Dark" to ${LAYOUT_FOLDER}.`,
		});
		expect(app.vault.getFolderByPath(LAYOUT_FOLDER)).not.toBeNull();
		expect(app.vault.getFileByPath(pathOf(forged.name))).not.toBeNull();
	});

	/**
	 * Each source file's bytes, indexed by the layout name inside it.
	 *
	 * Read from disk and keyed by what the file itself says rather than by a
	 * hand-written name-to-filename map: a third starter turned the ternary this
	 * replaced into a wrong answer, and a fourth would do it again.
	 */
	const sourceBytes = (): Map<string, string> => {
		const out = new Map<string, string>();
		for (const file of readdirSync(SOURCE_DIR).filter((n) => n.endsWith('.json'))) {
			const text = readFileSync(join(SOURCE_DIR, file), 'utf8');
			out.set((JSON.parse(text) as { name: string }).name, text);
		}
		return out;
	};

	it('lands the bundled source byte for byte', async () => {
		// The other half of `index.test.ts`'s canonical-form case: that one pins
		// the tree's bytes to what the parser and serialiser agree on, and this
		// one pins the vault's bytes to the tree's. Together they mean the file a
		// reviewer reads is the file a user gets — which is what makes reviewing
		// the source worth anything.
		const bytes = sourceBytes();
		// The floor (§10): a mapping that read nothing would pass every compare.
		expect(bytes.size).toBe(STARTERS.length);
		for (const starter of STARTERS) {
			await installStarter(vault(), LAYOUT_FOLDER, starter);
			const file = app.vault.getFileByPath(pathOf(starter.name));
			expect(file, `${starter.name} was not written`).not.toBeNull();
			const written = await app.vault.read(file as NonNullable<typeof file>);
			expect(written, starter.name).toBe(bytes.get(starter.name));
		}
	});

	it('writes into a layout folder that already exists', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		const result = await installStarter(vault(), LAYOUT_FOLDER, fifth);
		expect('error' in result).toBe(false);
		expect(app.vault.getFileByPath(pathOf(fifth.name))).not.toBeNull();
	});

	it('refuses a name the folder already holds, and writes nothing', async () => {
		// The existing file may be the user's edited copy of an earlier install,
		// so neither overwriting it nor suffixing a second copy is available
		// (Constraint 4). It is `createLayout`'s own sentence, not a second one.
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf(forged.name), 'mine, edited');

		const result = await installStarter(vault(), LAYOUT_FOLDER, forged);
		expect(result).toEqual({
			error: 'A layout named "Starter Forged in the Dark" already exists.',
		});
		const file = app.vault.getFileByPath(pathOf(forged.name));
		expect(await app.vault.read(file as NonNullable<typeof file>)).toBe(
			'mine, edited',
		);
	});

	it('refuses a source the parser will not take, in the parser’s words', async () => {
		/*
		 * The round-trip case in `index.test.ts` is what stops this state
		 * shipping; the message exists anyway because a refusal with a reason is
		 * this codebase's failure shape (PATTERNS §4) and a crash inside a
		 * command is not.
		 */
		const stale = { name: 'Stale', description: 'x', source: { name: 'Stale' } };
		const result = await installStarter(vault(), LAYOUT_FOLDER, stale);
		expect(result).toEqual({
			error: 'The layout needs a "components" array.',
		});
		expect(app.vault.getFileByPath(pathOf('Stale'))).toBeNull();
	});

	it('follows the configured folder rather than the default', async () => {
		const result = await installStarter(vault(), 'Elsewhere/Sheets', forged);
		expect(result).toEqual({
			ok: true,
			message: 'Added "Starter Forged in the Dark" to Elsewhere/Sheets.',
		});
		expect(
			app.vault.getFileByPath('Elsewhere/Sheets/Starter Forged in the Dark.json'),
		).not.toBeNull();
	});
});

describe('the suggester', () => {
	/*
	 * Driven through `getSuggestions` and `renderSuggestion`, which are the app's
	 * own public surface and are typed by the real `obsidian` declarations. The
	 * alternative — a list loop inside the stub — would be asserting a shape this
	 * repository invented, and a case that passed against it would say nothing
	 * about the modal Obsidian actually draws.
	 */
	const modal = () => new StarterModal(fakePlugin(app));

	/** One row, drawn the way the app draws one: an element per suggestion. */
	const rowFor = (starter: Starter): HTMLElement => {
		const el = document.createElement('div');
		modal().renderSuggestion(starter, el);
		return el;
	};

	it('lists every starter, in increasing size', () => {
		expect(modal().getSuggestions('').map((one) => one.name)).toEqual([
			'Starter Forged in the Dark',
			'Starter 5e',
			'Starter PF2e',
		]);
	});

	it('shows each entry’s description under its name', () => {
		// The name alone cannot say which of the two to pick, which is the whole
		// reason a row has a second line.
		for (const starter of STARTERS) {
			const row = rowFor(starter);
			expect(row.querySelector('div')?.textContent).toBe(starter.name);
			expect(row.querySelector('small')?.textContent).toBe(
				starter.description,
			);
		}
	});

	it('narrows on a word only one description says', () => {
		// The description is searched as well as the name: "stress" appears on no
		// name, and it is the question only the second line answers.
		expect(modal().getSuggestions('stress').map((one) => one.name)).toEqual([
			'Starter Forged in the Dark',
		]);
		expect(modal().getSuggestions('ranks')).toHaveLength(1);
		expect(modal().getSuggestions('5e')).toHaveLength(1);
		expect(modal().getSuggestions('zzz')).toEqual([]);
	});

	it('installs the chosen starter and says where it went', async () => {
		await modal().chooseStarter(fifth);
		expect(app.vault.getFileByPath(pathOf(fifth.name))).not.toBeNull();
		expect(Notice.messages).toEqual([
			`Added "Starter 5e" to ${LAYOUT_FOLDER}.`,
		]);
	});

	it('announces the refusal rather than the write when one is refused', async () => {
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(pathOf(fifth.name), 'mine, edited');
		await modal().chooseStarter(fifth);
		expect(Notice.messages).toEqual([
			'A layout named "Starter 5e" already exists.',
		]);
	});
});
