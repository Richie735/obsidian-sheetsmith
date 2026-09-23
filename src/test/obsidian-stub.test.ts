// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import './obsidian-stub';
import {
	AbstractInputSuggest,
	App,
	FileView,
	Menu,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	SettingDefinition,
	TextFileView,
	TFile,
	normalizePath,
} from './obsidian-stub';
import { openView } from './workspace';

/*
 * The element helpers the double installs, driven option by option.
 *
 * **Why this file exists at all.** A stub option that is declared and not
 * honoured fails in exactly one direction, and it is the silent one: the app
 * honours the key, the double ignores it, and the test and the harness both go
 * green on markup Obsidian would have built differently. Nothing in a type
 * check or a component test would notice, which is `PATTERNS.md` §10's own
 * standard for when a guard earns its place. `placeholder` is the case that
 * prompted it — seventeen `.placeholder =` assignments across `src/`, any of
 * which a later edit could move into an options object — but the argument is
 * about every member of `DomElementInfo`, so every member is driven here rather
 * than the one that was noticed.
 *
 * **Why it sits in `src/test/`, which §2 says holds no test cases.** That rule
 * keeps this folder from becoming a home for *other* modules' tests, so the
 * shared infrastructure stays infrastructure. A test of the stub itself is the
 * one thing it cannot be pulling in, and §10 wants a module's test beside it.
 * Nothing else belongs here.
 */

function root(): HTMLElement {
	const el = document.createElement('div');
	document.body.replaceChildren(el);
	return el;
}

describe('the element helpers', () => {
	it('appends to the receiver and hands the element back', () => {
		const parent = root();
		const el = parent.createEl('p');
		expect(el.tagName).toBe('P');
		expect(el.parentElement).toBe(parent);
	});

	it('takes a bare string as the class, on all three helpers', () => {
		// `DomElementInfo | string` is the real signature. `createEl` took only
		// the object here until the widening, so this spelling compiled in the
		// app and not under test, which is the wrong way round for a double.
		const parent = root();
		expect(parent.createEl('p', 'alpha').className).toBe('alpha');
		expect(parent.createDiv('beta').className).toBe('beta');
		expect(parent.createSpan('gamma').className).toBe('gamma');
	});

	it('accepts a class as a string, a space-separated string, or an array', () => {
		const parent = root();
		const classes = (o: { cls: string | string[] }) =>
			Array.from(parent.createDiv(o).classList);
		expect(classes({ cls: 'one' })).toEqual(['one']);
		expect(classes({ cls: 'one two' })).toEqual(['one', 'two']);
		expect(classes({ cls: ['one', 'two'] })).toEqual(['one', 'two']);
	});

	it('splits a class on ASCII whitespace, and not on a non-breaking space', () => {
		// `ui/element.ts` argues this at length and the double has to agree with
		// it: a non-breaking space is a legal class character, so `\s` would cut a
		// name the browser keeps. `DOMTokenList` refuses this set and only it.
		const parent = root();
		expect(
			Array.from(parent.createDiv({ cls: 'a\tb\nc\fd\re' }).classList),
		).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(Array.from(parent.createDiv({ cls: 'a\u00a0b' }).classList)).toEqual([
			'a\u00a0b',
		]);
	});

	it('assigns text, and takes a fragment as well as a string', () => {
		const parent = root();
		expect(parent.createDiv({ text: 'plain' }).textContent).toBe('plain');

		// How a description built by `createFragment` reaches an element.
		const fragment = document.createDocumentFragment();
		fragment.createSpan({ text: 'inside' });
		const el = parent.createDiv({ text: fragment });
		expect(el.querySelector('span')?.textContent).toBe('inside');
	});

	it('sets placeholder as the property, so a field reads it back', () => {
		// The option this whole widening was for.
		const parent = root();
		const input = parent.createEl('input', { placeholder: '—' });
		expect(input.placeholder).toBe('—');
		expect(input.getAttribute('placeholder')).toBe('—');
	});

	it('sets value as the property rather than the attribute', () => {
		// On an input the `value` attribute is the *default* value. Code under
		// test reads the live one, so an attribute here would read as empty.
		const parent = root();
		const input = parent.createEl('input', { value: '7' });
		expect(input.value).toBe('7');
	});

	it('sets type, href and title', () => {
		const parent = root();
		const button = parent.createEl('button', { type: 'button' });
		expect(button.getAttribute('type')).toBe('button');
		const link = parent.createEl('a', { href: '#one', title: 'A link' });
		expect(link.getAttribute('href')).toBe('#one');
		expect(link.getAttribute('title')).toBe('A link');
	});

	it('stringifies a number or a boolean attribute, and skips a null one', () => {
		// `DomElementInfo` allows all four. A null spelled as the string "null"
		// would be an attribute that is present and wrong, which is worse than
		// absent.
		const parent = root();
		const el = parent.createDiv({
			attr: {
				'data-count': 3,
				'aria-hidden': true,
				'data-none': null,
				'data-name': 'x',
			},
		});
		expect(el.getAttribute('data-count')).toBe('3');
		expect(el.getAttribute('aria-hidden')).toBe('true');
		expect(el.hasAttribute('data-none')).toBe(false);
		expect(el.getAttribute('data-name')).toBe('x');
	});

	it('sends the element to `parent` instead of the receiver when given one', () => {
		const receiver = root();
		const elsewhere = document.createElement('section');
		document.body.appendChild(elsewhere);
		const el = receiver.createDiv({ parent: elsewhere });
		expect(el.parentElement).toBe(elsewhere);
		expect(receiver.children.length).toBe(0);
	});

	it('puts the element first with `prepend`, and last without it', () => {
		// The option that lets a caller create in one order and attach in
		// another, which is the whole difficulty a hand-written createElement
		// site has when it is converted.
		const parent = root();
		parent.createDiv('first');
		parent.createDiv('last');
		parent.createDiv({ cls: 'actually-first', prepend: true });
		expect(Array.from(parent.children, (el) => el.className)).toEqual([
			'actually-first',
			'first',
			'last',
		]);
	});

	it('runs the callback after the element is attached', () => {
		// Obsidian's order, and load bearing: a live region has to be in the
		// document before anything writes to it.
		const parent = root();
		let attachedDuringCallback: boolean | null = null;
		parent.createDiv('x', (el) => {
			attachedDuringCallback = el.isConnected;
		});
		expect(attachedDuringCallback).toBe(true);
	});

	it('builds in the parent\'s own document, never the global one', () => {
		// `PATTERNS.md` §5: the view may render into a popout window, and an
		// element built by the wrong document belongs to the wrong window.
		const other = document.implementation.createHTMLDocument('other');
		const parent = other.createElement('div');
		const el = parent.createDiv('x');
		expect(el.ownerDocument).toBe(other);
		expect(el.ownerDocument).not.toBe(document);
	});

	it('honours the same options on a fragment as on an element', () => {
		// The two installers are separate because a DocumentFragment is not an
		// HTMLElement. They share `make`, and this is what says so.
		const fragment = document.createDocumentFragment();
		const el = fragment.createEl('input', {
			cls: 'field',
			placeholder: 'type here',
			attr: { 'data-n': 2 },
		});
		expect(el.parentNode).toBe(fragment);
		expect(el.className).toBe('field');
		expect(el.placeholder).toBe('type here');
		expect(el.getAttribute('data-n')).toBe('2');
		expect(fragment.createDiv('d').className).toBe('d');
		expect(fragment.createSpan('s').className).toBe('s');
	});
});

/*
 * The visibility pair, driven because what it must *not* do is the reason it
 * exists.
 *
 * A plugin hiding a `.setting-item` cannot use `hidden`: `app.css` declares
 * `display: flex` on that class at author level, which beats the UA sheet's
 * `[hidden]` rule. So the double has to write an inline `display`, the one
 * thing that wins over a class — and `show` has to *remove* the property
 * rather than set `block`, or a row would come back as the wrong kind of box.
 */
describe('the visibility helpers', () => {
	it('hides with an inline display, which is what beats a class', () => {
		const el = root();
		el.hide();
		expect(el.style.display).toBe('none');
		// Not the attribute, which is what a plugin must not rely on here.
		expect(el.hasAttribute('hidden')).toBe(false);
	});

	it('shows by removing the property rather than by setting a value', () => {
		const el = root();
		el.hide();
		el.show();
		expect(el.style.display).toBe('');
		// `?? ''` because the attribute is dropped altogether once it is empty:
		// what matters is that no `display` survives, however that is spelled.
		expect(el.getAttribute('style') ?? '').not.toContain('display');
	});

	it('toggles both ways through one call', () => {
		const el = root();
		el.toggleVisibility(false);
		expect(el.style.display).toBe('none');
		el.toggleVisibility(true);
		expect(el.style.display).toBe('');
	});
});

/*
 * One behaviour of the vault double, driven for this file's own reason: two
 * callers lean on it as a backstop and neither can demonstrate it.
 *
 * `Vault.create` rejects a taken path in the app rather than overwriting it,
 * and `layouts.ts` and `characters.ts` both say so in their comments while
 * guarding the path themselves. A double that wrote anyway would let a
 * regression that dropped either guard overwrite a reader's character note and
 * stay green — the silent direction this file exists for, and Constraint 4.
 */
describe('the vault double', () => {
	it('refuses a path that is taken, and keeps what is there', async () => {
		const app = new App();
		const file = await app.vault.create('Notes/Aramil.md', 'mine');
		await expect(app.vault.create('Notes/Aramil.md', 'theirs')).rejects.toThrow(
			/already exists/,
		);
		expect(await app.vault.read(file)).toBe('mine');
	});

	it('refuses a folder where anything already sits, in the app’s own words', async () => {
		/*
		 * `createFolder` used to write unconditionally, which is `create`'s own
		 * defect one method over — and it made a state the plugin *reports* as
		 * an error unreachable from any test. The app checks `adapter.exists`
		 * rather than looking for a folder, so a **file** at that path refuses
		 * too, with the same message; `characters.ts` leans on exactly that when
		 * a reader types a configured folder whose path a note already holds.
		 */
		const app = new App();
		await app.vault.createFolder('Characters');
		await expect(app.vault.createFolder('Characters')).rejects.toThrow(
			'Folder already exists.',
		);

		await app.vault.create('Party', 'a note, not a folder');
		await expect(app.vault.createFolder('Party')).rejects.toThrow(
			'Folder already exists.',
		);
		expect(await app.vault.read(app.vault.getFileByPath('Party')!)).toBe(
			'a note, not a folder',
		);
	});

	it('creates every missing ancestor, because `mkdir` is recursive', async () => {
		// `fsPromises.mkdir(path, { recursive: true })`, quoted in the docblock:
		// the app leaves both folders behind, and a plugin asking about either
		// gets one. `characters.ts` asks about the deeper one when it writes a
		// second character into a folder it created itself.
		const app = new App();
		await app.vault.createFolder('Characters/New');
		expect(app.vault.getFolderByPath('Characters')).not.toBeNull();
		expect(app.vault.getFolderByPath('Characters/New')).not.toBeNull();
	});

	it('holds the root in the folder map, as `fileMap` does', async () => {
		/*
		 * `n.root = n.fileMap['/']` in the app's own constructor, so
		 * `getFolderByPath('/')` answers the root rather than null — a value a
		 * reader reaches by typing `/` into a folder preference, since
		 * `normalizePath('/')` is `/`. The root's children are the paths with no
		 * slash in them, which is `getDirectParent`'s own rule.
		 */
		const app = new App();
		expect(app.vault.getFolderByPath('/')).toBe(app.vault.getRoot());
		await app.vault.create('Aramil.md', 'mine');
		await app.vault.create('Party/Sable.md', 'hers');
		expect(
			app.vault.getFolderByPath('/')?.children.map((f) => f.path),
		).toEqual(['Aramil.md']);
		// And the root already exists, so the app refuses to create it.
		await expect(app.vault.createFolder('/')).rejects.toThrow(
			'Folder already exists.',
		);
	});

	it('gives one answer about who holds a top-level file', async () => {
		/*
		 * The two routes to the same fact, which is what a double owes above all
		 * else: `getRoot().children` and `file.parent` used to disagree the
		 * moment the root became reachable by path — the root claiming the file
		 * and the file claiming no parent. `getDirectParent` in the app answers
		 * `fileMap['/']` for a path with no slash in it, so both say the root.
		 *
		 * `getRoot()` is asked *first* here, deliberately: it goes through the
		 * same lookup every other folder does, so its children no longer depend
		 * on something else having asked for `/` by path beforehand.
		 */
		const app = new App();
		const file = await app.vault.create('Aramil.md', 'mine');
		expect(app.vault.getRoot().children.map((f) => f.path)).toEqual([
			'Aramil.md',
		]);
		expect(file.parent).toBe(app.vault.getRoot());

		// A file in a folder is unaffected: its parent is that folder. The
		// folder is made first because the app's `create` does not make one —
		// writing into a folder that is not there fails at the adapter.
		await app.vault.createFolder('Party');
		const inner = await app.vault.create('Party/Sable.md', 'hers');
		expect(inner.parent?.path).toBe('Party');
	});

	it('normalises inside `createFolder`, as `create` does', async () => {
		// The same asymmetry the section below is about, on the folder half:
		// the create derives its own path and `getFolderByPath` does not, so a
		// caller spelling the two differently is told a folder that is there is
		// absent and tries to create it again.
		const app = new App();
		await app.vault.createFolder('/Sheets//Characters/');
		expect(app.vault.getFolderByPath('Sheets/Characters')).not.toBeNull();
		expect(app.vault.getFolderByPath('/Sheets//Characters/')).toBeNull();
		await expect(
			app.vault.createFolder('Sheets/Characters'),
		).rejects.toThrow('Folder already exists.');
	});

	it('still overwrites through `modify`, which is what that call is for', async () => {
		const app = new App();
		const file = await app.vault.create('Notes/Aramil.md', 'mine');
		await app.vault.modify(file, 'edited');
		expect(await app.vault.read(file)).toBe('edited');
	});

	it('lists every file `getFiles` was given, in no particular order', async () => {
		const app = new App();
		await app.vault.create('Aramil.md', '');
		await app.vault.createFolder('Portraits');
		await app.vault.create('Portraits/Thora.png', '');
		expect(app.vault.getFiles().map((f) => f.path).sort()).toEqual([
			'Aramil.md',
			'Portraits/Thora.png',
		]);
	});

	it('narrows getMarkdownFiles to the .md extension', async () => {
		const app = new App();
		await app.vault.create('Aramil.md', '');
		await app.vault.createFolder('Portraits');
		await app.vault.create('Portraits/Thora.png', '');
		expect(app.vault.getMarkdownFiles().map((f) => f.path)).toEqual([
			'Aramil.md',
		]);
	});
});

describe('the metadata cache double', () => {
	it('reads a frontmatter property off the note\u2019s own text', async () => {
		const app = new App();
		const file = await app.vault.create(
			'Aramil.md',
			'---\nsheet-layout: DnD 5e Caster\n---\n\n## Abilities\n',
		);
		expect(app.metadataCache.getFileCache(file)?.frontmatter).toEqual({
			'sheet-layout': 'DnD 5e Caster',
		});
	});

	it('strips one layer of surrounding quotes, matching extractLayoutName', async () => {
		const app = new App();
		const file = await app.vault.create(
			'Aramil.md',
			'---\nsheet-layout: "Blades: the sequel"\n---\n',
		);
		expect(app.metadataCache.getFileCache(file)?.frontmatter?.['sheet-layout']).toBe(
			'Blades: the sequel',
		);
	});

	it('answers an empty frontmatter object for a note with none', async () => {
		const app = new App();
		const file = await app.vault.create('Aramil.md', 'Just prose.\n');
		expect(app.metadataCache.getFileCache(file)?.frontmatter).toBeUndefined();
	});

	it('answers a typed scalar as the string it was written as, which the app would not', async () => {
		/*
		 * The double's own boundary, asserted so it reads as a limit rather
		 * than as a claim: this models `extractLayoutName` — trim, strip one
		 * pair of quotes — and real YAML would hand back the number 12 and
		 * the boolean false.
		 *
		 * **The plugin's own writer can no longer produce either line**, since
		 * `parse/frontmatter.ts`'s `isPlainScalar` quotes a number spelling and
		 * a boolean word. So what this models is a *hand-edited* note, which is
		 * the one way the disagreement is still reachable, and every caller is
		 * written to be correct either way.
		 */
		const app = new App();
		const file = await app.vault.create(
			'Aramil.md',
			'---\nsheet-layout: 12\nattuned: No\n---\n',
		);
		expect(app.metadataCache.getFileCache(file)?.frontmatter).toEqual({
			'sheet-layout': '12',
			attuned: 'No',
		});
	});

	it('answers null for a file the vault does not hold', async () => {
		const app = new App();
		const file = await app.vault.create('Aramil.md', '---\nx: 1\n---\n');
		await app.vault.delete(file);
		expect(app.metadataCache.getFileCache(file)).toBeNull();
	});
});

describe('generateMarkdownLink', () => {
	it('embeds anything that is not a markdown note', async () => {
		const app = new App();
		const file = await app.vault.create('Thora.png', '');
		expect(app.fileManager.generateMarkdownLink(file, '')).toBe(
			'![[Thora.png]]',
		);
	});

	it('links a markdown note, with no extension and no bang', async () => {
		const app = new App();
		const file = await app.vault.create('Notes.md', '');
		expect(app.fileManager.generateMarkdownLink(file, '')).toBe('[[Notes]]');
	});

	it('falls back to the full path where the target name collides', async () => {
		const app = new App();
		await app.vault.createFolder('Old');
		await app.vault.create('Old/Thora.png', '');
		const file = await app.vault.create('Thora.png', '');
		expect(app.fileManager.generateMarkdownLink(file, '')).toBe(
			'![[Thora.png]]',
		);
		const nested = app.vault.getFileByPath('Old/Thora.png');
		expect(nested).not.toBeNull();
		expect(app.fileManager.generateMarkdownLink(nested!, '')).toBe(
			'![[Old/Thora.png]]',
		);
	});

	it('does not collide with itself', async () => {
		// The one file sharing its own name is itself, so a vault holding
		// exactly one picture must not fall back to its full path.
		const app = new App();
		const file = await app.vault.create('Thora.png', '');
		expect(app.fileManager.generateMarkdownLink(file, '')).toBe(
			'![[Thora.png]]',
		);
	});
});

/*
 * What a path is, pinned against the app's own answer.
 *
 * **This is the second defect this double let through green, and the worse of
 * the two.** `Vault.create` writing unconditionally was the first; this one is
 * that the double's `normalizePath` dropped only a *trailing* slash and its
 * new-file parent claimed the vault root's path was `''`. A plugin reasoned
 * from that comment, joined `'' + '/' + name`, and shipped a command that wrote
 * a note and then opened a path resolving to nothing — with every test green,
 * because the double agreed with the mistake.
 *
 * So these cases quote the app rather than describing it. Obsidian 1.13.7's
 * `app.js`, deminified:
 *
 * ```js
 * function normalizePath(e) { return replaceControlChars(slashes(e)).normalize('NFC') }
 * function slashes(e) {
 *   return '' === (e = e.replace(/([\\/])+/g, '/').replace(/(^\/+|\/+$)/g, '')) && (e = '/'), e
 * }
 * Vault.prototype.create = function (path, data) { const at = normalizePath(path); … }
 * Vault.prototype.getFileByPath = function (path) { … this.fileMap.hasOwnProperty(path) … }
 * ```
 *
 * `obsidian.d.ts` says the same thing about the root in prose, on
 * `getAllFolders`: "Should the root folder (`/`) be returned".
 */
describe('what the double thinks a path is', () => {
	it('strips a leading slash as well as a trailing one', () => {
		expect(normalizePath('/Untitled character.md')).toBe(
			'Untitled character.md',
		);
		expect(normalizePath('Characters/')).toBe('Characters');
		expect(normalizePath('/Characters/Party/')).toBe('Characters/Party');
	});

	it('collapses a run of either separator', () => {
		expect(normalizePath('//Untitled character.md')).toBe(
			'Untitled character.md',
		);
		expect(normalizePath('Characters//Party///x.md')).toBe(
			'Characters/Party/x.md',
		);
		expect(normalizePath('Characters\\Party')).toBe('Characters/Party');
	});

	it('answers `/` for what is left of nothing, which is the vault root', () => {
		// The fact the bug rested on. `getNewFileParent` returns `getRoot()` for
		// the *default* new-note location, so this is the common case.
		expect(normalizePath('')).toBe('/');
		expect(normalizePath('/')).toBe('/');
		expect(new App().vault.getRoot().path).toBe('/');
	});

	it('normalises inside `create` but not inside `getFileByPath`', async () => {
		/*
		 * The asymmetry itself, which is what a caller has to be built around:
		 * the write derives its own path and the lookup does not. Any caller
		 * that spells the two differently is told a taken name is free.
		 */
		const app = new App();
		await app.vault.create('/Notes//Aramil.md', 'mine');
		expect(app.vault.getFileByPath('Notes/Aramil.md')).not.toBeNull();
		expect(app.vault.getFileByPath('/Notes//Aramil.md')).toBeNull();
		// And the refusal is on the normalised path, in the app's own words.
		await expect(app.vault.create('Notes/Aramil.md', 'theirs')).rejects.toThrow(
			'File already exists.',
		);
	});
});

/*
 * The definition renderer, which is the newest thing here and the one with the
 * most room to diverge quietly: it turns data into the same rows `new Setting()`
 * used to build by hand, so a mapping that drops a member renders a row that
 * still looks right.
 *
 * What it must get right is the seam rather than the markup. The markup is
 * `Setting`'s and already driven above; the seam is which member reaches which
 * call, and which members are refused instead of quietly dropped.
 */

/** A tab returning the definitions a case hands it. */
function tabFor(definitions: SettingDefinition[]): { tab: PluginSettingTab } {
	class Tab extends PluginSettingTab {
		getSettingDefinitions(): SettingDefinition[] {
			return definitions;
		}
	}
	const tab = new Tab(new App(), {});
	document.body.replaceChildren(tab.containerEl);
	return { tab };
}

describe('the setting definition renderer', () => {
	it('nests a row the way the app nests one, wrappers and all', () => {
		/*
		 * **The check that was missing, and its absence cost the review its
		 * instrument.** Obsidian never puts a row straight into the tab: `e6`
		 * gathers the definitions into one synthetic group and `SettingGroup`
		 * builds `.setting-group > .setting-items` around them. `app.css` then
		 * restyles on exactly that nesting — one shared card on `.setting-items`,
		 * each row's own card taken away, hairlines instead of gaps.
		 *
		 * The double used to append `.setting-item` into `containerEl`, which is
		 * what the *old* imperative `display()` produced. So the settings shots
		 * came out byte-identical across a change that alters the tab's whole
		 * appearance, and the criterion watching them proved nothing. A shape
		 * assertion is what makes that failure loud.
		 */
		const { tab } = tabFor([{ name: 'Layout folder' }]);
		tab.update();
		const group = tab.containerEl.children[0];
		expect(group?.className).toBe('setting-group');
		expect(Array.from(group?.children ?? []).map((el) => el.className)).toEqual([
			'setting-group-search',
			'setting-items',
		]);
		// Empty, and present: `:empty` hides it, and the rules that square off the
		// list's top corners are gated on it *not* being empty.
		expect(group?.querySelector('.setting-group-search')?.childElementCount).toBe(
			0,
		);
		const rows = group?.querySelector('.setting-items')?.children ?? [];
		expect(Array.from(rows).map((el) => el.className)).toEqual(['setting-item']);
		// And no heading: the app builds one detached and prepends it only when
		// `setHeading` is called with text, which nothing here does.
		expect(tab.containerEl.querySelector('.setting-item-heading')).toBeNull();
	});

	it('paints nothing until `update()` has stored the definitions', () => {
		// `display()` is the app's second path and paints `settingItems`, which
		// only `update()` fills. A caller that renders by `display()` alone gets
		// an empty tab, which is why both call sites use `update()`.
		const { tab } = tabFor([{ name: 'Layout folder' }]);
		tab.display();
		expect(tab.containerEl.querySelectorAll('.setting-item')).toHaveLength(0);
		tab.update();
		expect(tab.containerEl.querySelectorAll('.setting-item')).toHaveLength(1);
	});

	it('sends a name and a description to the row the app sends them to', () => {
		const { tab } = tabFor([
			{ name: 'Character folder', desc: 'New characters are written here.' },
		]);
		tab.update();
		expect(
			tab.containerEl.querySelector('.setting-item-name')?.textContent,
		).toBe('Character folder');
		expect(
			tab.containerEl.querySelector('.setting-item-description')?.textContent,
		).toBe('New characters are written here.');
	});

	it('takes a description built as a fragment, markup and all', () => {
		// How the sheet-view toggle's description reaches the row: a fragment
		// carrying a `<code>`, which is also what the settings search reads the
		// `textContent` of.
		// The key is named rather than spelled inline for the reason `settings.ts`
		// names it: `obsidianmd/ui/sentence-case` reads `text` inside `createEl`
		// options, and a frontmatter key is not a sentence to be capitalised.
		const key = 'sheet-layout';
		const desc = createFragment((fragment) => {
			fragment.appendText('Notes with a ');
			fragment.createEl('code', { text: key });
			fragment.appendText(' property open as a sheet.');
		});
		const { tab } = tabFor([{ name: 'Open sheets in sheet view', desc }]);
		tab.update();
		const descEl = tab.containerEl.querySelector('.setting-item-description');
		expect(descEl?.querySelector('code')?.textContent).toBe('sheet-layout');
		expect(descEl?.textContent).toBe(
			'Notes with a sheet-layout property open as a sheet.',
		);
	});

	it('keeps a fragment description across a repaint, because the app clones it', () => {
		/*
		 * `sg(e)` in the app is `typeof e === 'string' ? e : e.cloneNode(true)`,
		 * and the clone is load-bearing: `renderTab()` paints the *stored*
		 * definitions on every tab activation while `update()` runs once, so a
		 * fragment appended rather than cloned moves into the first row drawn and
		 * leaves the second draw empty. Nothing else here would notice, because
		 * `settings.ts`'s `rows()` happens to rebuild its fragment per call — and
		 * nothing says that is load-bearing, which is exactly the problem.
		 */
		const key = 'sheet-layout';
		const desc = createFragment((fragment) => {
			fragment.createEl('code', { text: key });
		});
		// One definitions array, painted twice, as a tab reopened twice is.
		const { tab } = tabFor([{ name: 'Open sheets in sheet view', desc }]);
		tab.update();
		tab.update();
		expect(
			tab.containerEl.querySelector('.setting-item-description code')
				?.textContent,
		).toBe(key);
	});

	it('hands a `render` definition the row, so a caller keeps its own element', () => {
		// The member the two folder rows are built on: what `render` gets is the
		// real `Setting`, so the input, its `aria-label` and its listeners are the
		// caller's exactly as they were before the definitions.
		let seen: Setting | null = null;
		const { tab } = tabFor([
			{
				name: 'Layout folder',
				render: (setting) => {
					seen = setting;
					setting.addText((text) => {
						text.inputEl.setAttribute('aria-label', 'Layout folder');
					});
				},
			},
		]);
		tab.update();
		expect(seen).not.toBeNull();
		const input = tab.containerEl.querySelector('input[type="text"]');
		expect(input?.getAttribute('aria-label')).toBe('Layout folder');
	});

	it('runs a `render` cleanup before the row is painted again', () => {
		// **Before**, asserted rather than assumed: counting cleanups would pass
		// just as well if they ran after the repaint, and a cleanup that runs
		// after its replacement is built is one that tears the new row down.
		const order: string[] = [];
		const { tab } = tabFor([
			{
				name: 'Layout editor',
				render: () => {
					order.push('render');
					return () => order.push('cleanup');
				},
			},
		]);
		tab.update();
		expect(order).toEqual(['render']);
		tab.update();
		expect(order).toEqual(['render', 'cleanup', 'render']);
	});

	it('refuses a member it would otherwise drop, one refusal per member', () => {
		/*
		 * The point of the file, applied to this renderer. Each of these is
		 * something Obsidian draws or stores and the double does not, so the
		 * failure has to be loud: a row that silently loses its `disabled` still
		 * renders, still looks right, and still passes.
		 *
		 * `validate` is *not* on this list, and the reason is worth writing down
		 * because an earlier draft of the spec asked for it: it is a member of
		 * `SettingControlBase`, so it can only ever arrive inside a `control`,
		 * and refusing `control` refuses it with no branch of its own.
		 *
		 * Asserted **by name** — `toThrow(member)` rather than
		 * `toThrow('obsidian-stub')` — because the looser matcher passes for a
		 * single generic refusal, which is the failure that would make this list
		 * decorative.
		 */
		const refused: [string, SettingDefinition & Record<string, unknown>][] = [
			['type', { name: 'Fonts', type: 'group', items: [] }],
			['action', { name: 'Open', action: () => undefined }],
			['visible', { name: 'Hidden', visible: false }],
			// Honoured by the app even though the typings put it only on
			// `SettingDefinitionAction`: `X2` reads `def.disabled ??
			// def.control?.disabled` for every row and calls `setDisabled`.
			['disabled', { name: 'Off', disabled: true }],
			[
				'control',
				{ name: 'Open sheets', control: { type: 'toggle', key: 'open' } },
			],
		];

		for (const [member, def] of refused) {
			const { tab } = tabFor([def]);
			expect(() => tab.update(), member).toThrow(member);
		}
	});
});

/*
 * `AbstractInputSuggest`, driven member by member.
 *
 * The reason is this file's own header, one class over: the formula suggester
 * and the harness views that photograph it are both written against this
 * double, so a member declared here and not honoured is a green test and a
 * screenshot of markup Obsidian would have built differently.
 */
describe('the input suggester', () => {
	/** A suggester over a fixed list, which is all a double needs driving. */
	class Names extends AbstractInputSuggest<string> {
		constructor(
			app: App,
			input: HTMLInputElement,
			private readonly names: string[],
		) {
			super(app, input);
		}

		protected getSuggestions(query: string): string[] {
			return this.names.filter((name) => name.startsWith(query));
		}

		renderSuggestion(value: string, el: HTMLElement): void {
			el.createEl('code', { text: value });
		}
	}

	function bound(names = ['abilities', 'armour_class']) {
		const input = document.createElement('input');
		input.type = 'text';
		document.body.appendChild(input);
		// Focused, because the app gates every query on
		// `textInputEl.isActiveElement()`: a case driving an unfocused element
		// would drive a path Obsidian refuses outright.
		input.focus();
		const suggest = new Names(new App(), input, names);
		return { input, suggest };
	}

	/** The list as it stands on `document.body`, item by item. */
	function items(): string[] {
		return Array.from(
			document.body.querySelectorAll('.suggestion-container .suggestion-item'),
		).map((el) => el.textContent ?? '');
	}

	function selected(): string | null {
		return document.body.querySelector('.suggestion-item.is-selected')?.textContent ?? null;
	}

	/** Type into the field the way a keyboard does. Synchronous, as the app is. */
	function type(input: HTMLInputElement, text: string): void {
		input.value = text;
		input.dispatchEvent(new Event('input'));
	}

	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('draws the app\'s own markup into document.body', async () => {
		const { input } = bound();
		type(input, 'a');
		expect(items()).toEqual(['abilities', 'armour_class']);
		expect(selected()).toBe('abilities');
	});

	it('opens on focus as well as on input, which is why the binding disarms', () => {
		const { input } = bound();
		input.blur();
		input.value = 'a';
		input.focus();
		expect(items()).toHaveLength(2);
	});

	it('asks nothing at all while the field is not focused', () => {
		// The app's own gate. Without it a caller could drive the whole popup at
		// an element Obsidian would have ignored.
		const { input } = bound();
		input.blur();
		input.value = 'a';
		input.dispatchEvent(new Event('input'));
		expect(items()).toEqual([]);
	});

	it('draws a plain array without waiting for a microtask', () => {
		// `onInputChange` branches on `Array.isArray` and calls `showSuggestions`
		// straight through, so a synchronous subclass opens synchronously.
		const { input } = bound();
		input.value = 'a';
		input.dispatchEvent(new Event('input'));
		expect(items()).toHaveLength(2);
	});

	it('prevents a press on an item from blurring the field, and not one beside it', async () => {
		const { input } = bound();
		type(input, 'a');
		const item = document.body.querySelector('.suggestion-item') as HTMLElement;
		const onItem = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		item.dispatchEvent(onItem);
		expect(onItem.defaultPrevented).toBe(true);
		const container = document.body.querySelector('.suggestion-container') as HTMLElement;
		const onPadding = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		container.dispatchEvent(onPadding);
		// The padding is deliberately not guarded: a press there blurs the input
		// and commits what is typed, which is the cost the feature accepts.
		expect(onPadding.defaultPrevented).toBe(false);
	});

	it('closes on blur', async () => {
		const { input } = bound();
		type(input, 'a');
		input.dispatchEvent(new Event('blur'));
		expect(items()).toEqual([]);
	});

	it('closes where there is nothing to offer', async () => {
		const { input } = bound();
		type(input, 'a');
		type(input, 'zz');
		expect(items()).toEqual([]);
	});

	it('honours limit', async () => {
		const { input, suggest } = bound();
		suggest.limit = 1;
		type(input, 'a');
		expect(items()).toEqual(['abilities']);
	});

	it('reads and writes the field through getValue and setValue', async () => {
		const { input, suggest } = bound();
		type(input, 'ab');
		expect(suggest.getValue()).toBe('ab');
		suggest.setValue('armour_class');
		expect(input.value).toBe('armour_class');
	});

	it('moves the selection on the arrows while open', async () => {
		const { input } = bound();
		type(input, 'a');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		expect(selected()).toBe('armour_class');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(selected()).toBe('abilities');
	});

	it('accepts the selected item on Enter and reports it to onSelect', async () => {
		const { input, suggest } = bound();
		const chosen: string[] = [];
		suggest.onSelect((value) => chosen.push(value));
		type(input, 'a');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(chosen).toEqual(['abilities']);
	});

	it('accepts on a press of an item', async () => {
		const { input, suggest } = bound();
		const chosen: string[] = [];
		suggest.onSelect((value) => chosen.push(value));
		type(input, 'a');
		const first = document.body.querySelector('.suggestion-item');
		(first as HTMLElement).click();
		expect(chosen).toEqual(['abilities']);
	});

	it('closes on Escape and takes nothing', async () => {
		const { input, suggest } = bound();
		const chosen: string[] = [];
		suggest.onSelect((value) => chosen.push(value));
		type(input, 'a');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(items()).toEqual([]);
		expect(chosen).toEqual([]);
	});

	it('leaves every key alone once it is closed', async () => {
		// The property the accept-then-commit gesture rests on: the second Enter
		// has to reach the input, which is what fires `change`.
		const { input, suggest } = bound();
		const chosen: string[] = [];
		suggest.onSelect((value) => chosen.push(value));
		type(input, 'a');
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
		input.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(false);
		expect(chosen).toEqual([]);
	});

	it('closes twice without complaint', async () => {
		const { input, suggest } = bound();
		type(input, 'a');
		suggest.close();
		expect(() => suggest.close()).not.toThrow();
		expect(items()).toEqual([]);
	});
});

/*
 * The text file view double's save contract.
 *
 * Driven here for this file's own reason: a stub option "declared and not
 * honoured fails in exactly one direction, and it is the silent one". The two
 * facts a `TextFileView` subclass actually depends on are both timing facts —
 * `requestSave` does not write, and `save` writes what the view holds rather
 * than what the file does — and a double that wrote through synchronously would
 * make a plugin's own staleness bug unreachable by every test in the
 * repository. That is not hypothetical: it is how a rename migration came to
 * report an all-clear over a value the reader had typed seconds earlier.
 */
describe('the text file view double', () => {
	class Editable extends TextFileView {
		getViewData(): string {
			return this.data;
		}
		setViewData(data: string, _clear: boolean): void {
			this.data = data;
		}
		clear(): void {
			this.data = '';
		}
	}

	async function opened(): Promise<{ app: App; view: Editable; file: TFile }> {
		const app = new App();
		const file = await app.vault.create('Note.md', 'first');
		const view = new Editable(app.workspace.getLeaf(true));
		await view.onLoadFile(file);
		return { app, view, file };
	}

	it('loads a file into the view', async () => {
		const { view, file } = await opened();
		expect(view.data).toBe('first');
		expect(view.file).toBe(file);
	});

	it('writes nothing when a save is merely requested', async () => {
		// Obsidian's own wording: "Debounced save in 2 seconds from now". For
		// those two seconds the typed text exists only in the view.
		const { app, view, file } = await opened();
		view.data = 'second';
		view.requestSave();

		expect(view.savesRequested).toBe(1);
		expect(await app.vault.read(file)).toBe('first');
	});

	it('writes what the view holds once the debounce runs', async () => {
		const { app, view, file } = await opened();
		view.data = 'second';
		view.requestSave();

		await view.runRequestedSave();

		expect(await app.vault.read(file)).toBe('second');
		expect(view.savesRequested).toBe(0);
	});

	it('runs nothing where no save was requested', async () => {
		const { app, view, file } = await opened();
		await app.vault.modify(file, 'changed elsewhere');

		await view.runRequestedSave();

		// The view holds `first` and the file does not; a double that saved
		// unconditionally would have put it back and hidden every staleness bug.
		expect(await app.vault.read(file)).toBe('changed elsewhere');
	});

	it('overwrites a file changed underneath it, as the app does', async () => {
		const { app, view, file } = await opened();
		await app.vault.modify(file, 'changed elsewhere');

		await view.save();

		expect(await app.vault.read(file)).toBe('first');
	});

	it('saves on the way out whether or not one was requested, then clears', async () => {
		// Unconditional, because the app's is: "by default, this view only saves
		// when it's closing" makes the close write the base behaviour, with
		// `requestSave` the addition on top. The second case below is the one
		// that matters — it is the write-back a stale view performs on close,
		// with nothing outstanding to announce it.
		const { app, view, file } = await opened();
		view.data = 'second';
		view.requestSave();

		await view.onUnloadFile(file);

		expect(await app.vault.read(file)).toBe('second');
		expect(view.data).toBe('');
		expect(view.file).toBeNull();
	});

	it('writes its own stale text over the file on close, with nothing requested', async () => {
		// The shape of the bug a consumer needs to be able to express: the view
		// is *behind* the file, nothing is outstanding, and closing it still puts
		// the older text back. A double that conditioned the close write on an
		// outstanding request called this a no-op and hid it.
		const { app, view, file } = await opened();
		await app.vault.modify(file, 'changed elsewhere');
		expect(view.savesRequested).toBe(0);

		await view.onUnloadFile(file);

		expect(await app.vault.read(file)).toBe('first');
	});
});

/*
 * `Notice`, whose members are the double's answer to two different questions.
 *
 * Driven here because the *second* question went unmodelled and cost a shipped
 * defect: `messageEl` and `hide` did not exist, so `view/sheet-view.ts`'s
 * `offerUndo` threw the moment a test reached it, the whole undo gesture was
 * undrivable, and the ordering bug in it went green through every gate
 * (`docs/BACKLOG.md` § Patterns). A member that is declared and not honoured
 * fails silently; a member that is *absent* fails loudly and then gets routed
 * around, which is worse.
 */
describe('Notice', () => {
	beforeEach(() => {
		Notice.messages = [];
		Notice.instances = [];
	});

	it('records a string message, which is what almost every case asks', () => {
		new Notice('Undone.');
		expect(Notice.messages).toEqual(['Undone.']);
	});

	it('records a fragment as an empty string rather than as an object', () => {
		// `warn()` builds a `DocumentFragment`, which has no string form. The
		// empty string is honest about that; pushing the object would put a value
		// in `messages` that no assertion in this repository compares against.
		new Notice(document.createDocumentFragment());
		expect(Notice.messages).toEqual(['']);
	});

	it('hands out an element a notice’s own controls can be built into', () => {
		// The undo is a link rather than a sentence, so what a test presses is in
		// here and nothing about it is in `messages`.
		const notice = new Notice('');
		notice.messageEl.createEl('a', { text: 'Undo' });
		expect(notice.messageEl.querySelector('a')?.textContent).toBe('Undo');
	});

	it('records every instance in order, beside the messages', () => {
		// Sentence case on two throwaway fixtures, because
		// `obsidianmd/ui/sentence-case` reads any string handed to `Notice` as
		// user-facing copy and cannot tell a fixture from one — and it is right
		// not to try. This case asserts ordering and identity, so the text is
		// free.
		new Notice('First');
		const second = new Notice('Second');
		expect(Notice.instances).toHaveLength(2);
		expect(Notice.instances.at(-1)).toBe(second);
	});

	it('reports having been hidden, which is what pressing the link does', () => {
		const notice = new Notice('');
		expect(notice.hidden).toBe(false);
		notice.hide();
		expect(notice.hidden).toBe(true);
	});

	it('costs no DOM to construct, which a node-environment test needs', () => {
		/*
		 * `messageEl` was a field initialiser calling `document.createElement`,
		 * so `new Notice('x')` threw `ReferenceError: document is not defined`
		 * in every node-environment file — and the message named neither the
		 * notice nor the environment. Asserted here in a happy-dom file, where
		 * it cannot fail; what holds the real claim is that the element is built
		 * on read, one line below.
		 */
		const notice = new Notice('Undone.');
		expect(
			Object.prototype.hasOwnProperty.call(notice, 'messageEl'),
		).toBe(false);
		expect(notice.messageEl).toBeInstanceOf(HTMLElement);
		// And the same element every time, so a caller can build into it and
		// then read what it built.
		expect(notice.messageEl).toBe(notice.messageEl);
	});

	it('accepts a timeout and ignores it', () => {
		// Faithful for what a test can see: the app's own timer removes an element
		// this double never attaches, so there is nothing for a timer to observe.
		expect(() => new Notice('', 12000)).not.toThrow();
	});
});

/*
 * The members `docs/features/visible-layout-files.md` added: file events, a
 * rename that keeps its object, a rename that carries links, a `FileView`, a
 * leaf that reuses a view of the same type, and a registry that refuses. Each
 * is a place where the app's behaviour is what a plugin leans on, and a double
 * ignoring it would pass a case the app fails.
 */
describe('the file lifecycle doubles', () => {
	it('fires each file event once the vault has changed, with the old path on a rename', async () => {
		const app = new App();
		const seen: string[] = [];
		for (const name of ['create', 'modify', 'rename', 'delete']) {
			app.vault.on(name, (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				const held = app.vault.getAbstractFileByPath(file.path) !== null;
				const from = typeof oldPath === 'string' ? `<${oldPath}` : '';
				seen.push(`${name}:${file.path}${from}:${held}`);
			});
		}
		const file = await app.vault.create('A.md', 'one');
		await app.vault.modify(file, 'two');
		await app.vault.rename(file, 'B.md');
		await app.vault.delete(file);

		expect(seen).toEqual([
			'create:A.md:true',
			'modify:A.md:true',
			'rename:B.md<A.md:true',
			'delete:B.md:false',
		]);
	});

	it('renames in place and refuses a destination that is taken', async () => {
		const app = new App();
		const file = await app.vault.create('A.md', 'one');
		await app.vault.create('B.md', 'two');

		await expect(app.vault.rename(file, 'B.md')).rejects.toThrow(
			'Destination file already exists!',
		);
		await app.vault.rename(file, 'C.md');
		expect(app.vault.getFileByPath('C.md')).toBe(file);
		expect(app.vault.getFileByPath('A.md')).toBeNull();
		expect(await app.vault.read(file)).toBe('one');
	});

	it('carries a wikilink along with a renamed file, by name or by path', async () => {
		const app = new App();
		await app.vault.createFolder('Layouts');
		const file = await app.vault.create('Layouts/X.json', '{}');
		const note = await app.vault.create(
			'Note.md',
			'[[X.json]] [[Layouts/X.json#top|alias]] ![[X.json]] [[X]] [[Other.json]]',
		);

		await app.fileManager.renameFile(file, 'Layouts/X.sheetsmith');

		expect(await app.vault.read(note)).toBe(
			'[[X.sheetsmith]] [[Layouts/X.sheetsmith#top|alias]] ![[X.sheetsmith]] [[X]] [[Other.json]]',
		);
	});

	it('loads a file through setState, and a leaf of the same type keeps its view', async () => {
		class Viewer extends FileView {
			events: string[] = [];
			getViewType(): string {
				return 'viewer';
			}
			async onLoadFile(file: TFile): Promise<void> {
				this.events.push(`load:${file.path}`);
			}
			async onUnloadFile(file: TFile): Promise<void> {
				this.events.push(`unload:${file.path}`);
			}
		}
		const app = new App();
		await app.vault.create('A.md', '');
		await app.vault.create('B.md', '');
		const view = await openView(app, document.body, Viewer);

		await view.leaf.setViewState({ type: 'viewer', state: { file: 'A.md' } });
		await view.leaf.setViewState({ type: 'viewer', state: { file: 'B.md' } });

		expect(view.leaf.view).toBe(view);
		expect(view.events).toEqual(['load:A.md', 'unload:A.md', 'load:B.md']);
		expect(view.getState()).toEqual({ file: 'B.md' });
		expect(view.titleEl.textContent).toBe('B');
	});

	it('lets go of a deleted file where the view allows none', async () => {
		class Viewer extends FileView {
			allowNoFile = true;
			getViewType(): string {
				return 'viewer';
			}
		}
		const app = new App();
		const file = await app.vault.create('A.md', '');
		const view = await openView(app, document.body, Viewer);
		await view.setState({ file: 'A.md' }, {});

		await app.vault.delete(file);
		await new Promise((resolve) => window.setTimeout(resolve, 0));

		expect(view.file).toBeNull();
	});

	it('answers the active view only where it is of the class asked for', async () => {
		class Viewer extends FileView {
			getViewType(): string {
				return 'viewer';
			}
		}
		class Other extends FileView {}
		const app = new App();
		expect(app.workspace.getActiveViewOfType(Viewer)).toBeNull();

		const view = await openView(app, document.body, Viewer);
		await app.workspace.revealLeaf(view.leaf);

		expect(app.workspace.getActiveViewOfType(Viewer)).toBe(view);
		expect(app.workspace.getActiveViewOfType(FileView)).toBe(view);
		expect(app.workspace.getActiveViewOfType(Other)).toBeNull();
	});

	it('refuses a taken extension before registering any of a call’s', () => {
		const app = new App();
		app.viewRegistry.registerExtensions(['b'], 'theirs');

		expect(() => app.viewRegistry.registerExtensions(['a', 'b'], 'ours')).toThrow(
			'Attempting to register an existing file extension "b"',
		);
		expect(app.viewRegistry.getTypeByExtension('a')).toBeUndefined();
	});

	it('records each plugin registration, and undoes the registry\'s on unload', () => {
		const app = new App();
		const plugin = new Plugin(app, { id: 'p', name: 'P', version: '0' });
		plugin.load();
		plugin.registerView('v', () => {
			throw new Error('not constructed here');
		});
		plugin.registerExtensions(['x'], 'v');

		expect(plugin.registrations).toEqual(['registerView:v', 'registerExtensions:x']);
		plugin.unload();
		expect(app.viewRegistry.getTypeByExtension('x')).toBeUndefined();
		expect(app.viewRegistry.viewByType.v).toBeUndefined();
	});
});

describe('the menu double', () => {
	/*
	 * Two options the layout editor's tree leans on, driven here because a
	 * double that ignored either would let the tree's tests go green on a menu
	 * the app would never behave like: a refused move that still wrote, and a
	 * menu that stayed on screen after its item ran.
	 */
	function shown(): Menu {
		document.body.replaceChildren();
		const menu = new Menu();
		menu.addItem((item) => item.setTitle('Live').setIcon('arrow-up'));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle('Refused').setDisabled(true));
		menu.addItem((item) => item.setTitle('Remove').setWarning(true));
		menu.showAtPosition({ x: 10, y: 20 });
		return menu;
	}

	function item(title: string): HTMLElement {
		for (const el of Array.from(document.body.querySelectorAll('.menu-item'))) {
			if (el.querySelector('.menu-item-title')?.textContent === title) {
				return el as HTMLElement;
			}
		}
		throw new Error(`no menu item "${title}"`);
	}

	it("draws the app's own markup on the body, at the point it was shown", () => {
		shown();
		const menu = document.body.querySelector('.menu');
		expect(menu?.parentElement).toBe(document.body);
		expect(menu?.querySelector('.menu-scroll > .menu-separator')).not.toBeNull();
		expect(item('Live').querySelector('.menu-item-icon svg')).not.toBeNull();
		expect(item('Refused').classList.contains('is-disabled')).toBe(true);
		expect(item('Remove').classList.contains('is-warning')).toBe(true);
		expect((menu as HTMLElement).style.left).toBe('10px');
		expect((menu as HTMLElement).style.top).toBe('20px');
	});

	it("does not run a disabled item's click, and leaves the menu open", () => {
		const menu = shown();
		let ran = false;
		menu.items[1]?.onClick(() => {
			ran = true;
		});
		item('Refused').click();
		expect(ran).toBe(false);
		expect(document.body.querySelector('.menu')).not.toBeNull();
	});

	it('hides the menu on a click on an item, then runs the item', () => {
		const menu = shown();
		let hidden = false;
		let open: Element | null = null;
		menu.onHide(() => {
			hidden = true;
		});
		menu.items[0]?.onClick(() => {
			open = document.body.querySelector('.menu');
		});
		item('Live').click();
		expect(hidden).toBe(true);
		expect(open).toBeNull();
		expect(Menu.open).toBeNull();
	});

	it('hides the previous menu when another is shown, as the app does', () => {
		const first = shown();
		const second = new Menu();
		second.addItem((one) => one.setTitle('Second'));
		second.showAtPosition({ x: 0, y: 0 });
		expect(first.dom.isConnected).toBe(false);
		expect(document.body.querySelectorAll('.menu')).toHaveLength(1);
		second.hide();
	});
});
