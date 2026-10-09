// @vitest-environment happy-dom
/*
 * `sheet-view.ts`, in the two parts a test can reach.
 *
 * **The view's own save rule.** What the trigger's confirmation says is
 * `reset-confirmation.ts`'s, and driven in its own test file beside it.
 *
 * The save rule is new here. `SheetView` could not be
 * constructed at all while the double's `TextFileView` was a bare `data` field —
 * `docs/PATTERNS.md` §11's standing row — and now it can, so the rule that
 * decides whether this view may write to a character note is driven where it
 * lives instead of at one remove through the layout editor's pane. That matters
 * for this rule in particular: its whole job is to *refuse* a write, and the
 * only case that reached it from the pane could not tell a refused write from a
 * write that changed nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { SheetView } from './sheet-view';
import { App, TextFileView } from '../test/obsidian-stub';
import { fakePlugin } from '../test/plugin';
import { openView } from '../test/workspace';
import { note, settle, sheetOn as sheetOnNote } from '../test/sheet-on-note';


/*
 * Whether this view may write to the note it is showing.
 *
 * One rule, in `save`, and every writer goes through it: the debounce Obsidian
 * schedules, the flush the layout editor asks for before it rewrites notes, and
 * the write the app makes on the way out. The rule is that a write carries text
 * *this reader typed* — `commit` is the one door into `data` that says so — so a
 * view with nothing outstanding writes nothing at all.
 *
 * Both directions, because the cost is asymmetric. Failing to write loses an
 * edit the reader made; writing when there is nothing to write puts stale text
 * over whatever else reached the file. The base class would catch the second on
 * its own — it registers `vault.on('modify')` and merges — but this view is the
 * one deciding whether to write, so the rule is asserted where it lives.
 */
describe('whether the sheet may write', () => {
	const NOTE = '---\nsheet-layout: Alpha\n---\n\n## AC\n';

	async function sheetOn(text: string): Promise<{
		app: App;
		view: SheetView;
		file: ReturnType<App['vault']['getFileByPath']>;
	}> {
		const app = new App();
		const file = await app.vault.create('Note.md', text);
		const view = await openView(app, document.body, SheetView, fakePlugin(app));
		await (view as unknown as TextFileView).onLoadFile(file);
		return { app, view, file };
	}

	it('writes when the reader has typed something the file does not hold', async () => {
		const { app, view, file } = await sheetOn(NOTE);
		// `commit` is private and is the only raiser, so the gesture that raises
		// it is driven through the view's own data door the way an edit does.
		(view as unknown as { commit(text: string): void }).commit(
			`${NOTE}\n## Extra\n`,
		);

		await view.save();

		expect(await app.vault.read(file!)).toBe(`${NOTE}\n## Extra\n`);
	});

	it('calls no write at all when it holds nothing of the reader’s', async () => {
		const { app, view } = await sheetOn(NOTE);
		const writes = vi.spyOn(app.vault, 'modify');

		await view.save();

		// Asserted on the call and not on the bytes: an unconditional save here
		// writes text identical to the file, which no comparison of contents can
		// distinguish from not writing.
		expect(writes).not.toHaveBeenCalled();
	});

	it('refuses to put its own stale text back over a file something else wrote', async () => {
		// The destructive direction, and the one a byte comparison got wrong: the
		// file differs from `data` because the *file* moved on — a Markdown pane
		// in a split, Sync, or the rename migration — and this view has nothing
		// to contribute.
		const { app, view, file } = await sheetOn(NOTE);
		await app.vault.modify(file!, `${NOTE}\n## Written elsewhere\n`);

		await view.save();

		expect(await app.vault.read(file!)).toBe(`${NOTE}\n## Written elsewhere\n`);
	});

	it('stops owing a write once one has landed', async () => {
		const { app, view, file } = await sheetOn(NOTE);
		(view as unknown as { commit(text: string): void }).commit(
			`${NOTE}\n## Extra\n`,
		);
		await view.save();

		// The debounce, arriving after the flush already wrote. Nothing is
		// outstanding, so this must not write — which is what closes the race
		// with the migration.
		await app.vault.modify(file!, `${NOTE}\n## Migrated\n`);
		await view.save();

		expect(await app.vault.read(file!)).toBe(`${NOTE}\n## Migrated\n`);
	});

	it('leaves a view holding an unsaved edit alone rather than reloading over it', async () => {
		/*
		 * The platform's own `vault.on('modify')` handler merges an external write
		 * into a dirty view and says so. Reloading over it would discard the
		 * reader's keystroke and lower the flag that would have saved it, so
		 * `reload` declines and lets that handler run.
		 *
		 * **What this can assert and what it cannot.** The double models no
		 * `onload`, no `onModify` and no `lastSavedData`, so the merge itself is
		 * not observable here — only that this view does not destroy the state the
		 * merge needs: the reader's text still in `data`, and the flag still up.
		 * That gap is `docs/BACKLOG.md`'s probe row, not something to fake.
		 */
		const { app, view, file } = await sheetOn(NOTE);
		(view as unknown as { commit(text: string): void }).commit(
			`${NOTE}\n## Typed by the reader\n`,
		);
		await app.vault.modify(file!, `${NOTE}\n## Written elsewhere\n`);

		await view.reload();

		expect(view.getViewData()).toBe(`${NOTE}\n## Typed by the reader\n`);
		// And it is still owed, so the platform's merge can still be written.
		await view.save();
		expect(await app.vault.read(file!)).toBe(`${NOTE}\n## Typed by the reader\n`);
	});

	it('reloads a view that holds nothing of the reader’s, which is step 4’s case', async () => {
		const { app, view, file } = await sheetOn(NOTE);
		await app.vault.modify(file!, `${NOTE}\n## Migrated\n`);

		await view.reload();

		expect(view.getViewData()).toBe(`${NOTE}\n## Migrated\n`);
	});

	it('keeps owing a write when text arrives for the same file, and stops when a new one opens', async () => {
		// `clear` is the difference, and it is the platform's own signal: set for
		// `onLoadFile`, unset for an external-change update. A merge arrives
		// through the unset door carrying the reader's edit, so the flag has to
		// survive it.
		const { app, view, file } = await sheetOn(NOTE);
		(view as unknown as { commit(text: string): void }).commit(
			`${NOTE}\n## Mine\n`,
		);

		view.setViewData(`${NOTE}\n## Merged\n`, false);
		await view.save();
		expect(await app.vault.read(file!)).toBe(`${NOTE}\n## Merged\n`);

		// A different file, which owes nothing.
		view.setViewData(`${NOTE}\n## Another note\n`, true);
		const writes = vi.spyOn(app.vault, 'modify');
		await view.save();
		expect(writes).not.toHaveBeenCalled();
	});

	it('keeps owing a write when one failed', async () => {
		// The flag drops after the write, not before, so a throw leaves the edit
		// outstanding rather than silently dropping it.
		const { app, view, file } = await sheetOn(NOTE);
		(view as unknown as { commit(text: string): void }).commit(
			`${NOTE}\n## Extra\n`,
		);
		const failing = vi
			.spyOn(app.vault, 'modify')
			.mockRejectedValueOnce(new Error('disk full'));

		await expect(view.save()).rejects.toThrow('disk full');
		failing.mockRestore();
		await view.save();

		expect(await app.vault.read(file!)).toBe(`${NOTE}\n## Extra\n`);
	});
});


/*
 * The groups a reader has collapsed, which the view holds for the same reasons it
 * holds a tab and an open record: the sheet rebuilds on every committed edit, and
 * a collapse is this reader's posture rather than the character's data. The other
 * two members of that category stay untested here (`docs/BACKLOG.md`); this is the
 * case for the third alone, and it is the reason the view's own six lines are not
 * the part nobody drives: forget the `clear` and a reopened note inherits the last
 * note's collapsed groups.
 */
describe('the groups a reader collapsed', () => {
	const fence = (...lines: string[]): string =>
		['```sheet', ...lines, '```', ''].join('\n');
	const FEATURES = {
		id: 'features',
		type: 'record-set',
		label: 'Features',
		position: { col: 1, row: 1, width: 6, height: 3 },
		groupBy: 'Class',
		fields: [
			{ key: 'Class', type: 'level', levels: ['None', 'Fighter', 'Wizard'] },
		],
	};
	const EXTRAS = {
		id: 'extras',
		type: 'record-set',
		label: 'Extras',
		position: { col: 1, row: 4, width: 6, height: 3 },
		fields: [{ key: 'Uses', type: 'number' }],
	};
	const TEXT = note(
		[
			'Features',
			['', '### Second Wind', fence('Class: 1'), '### Fireball', fence('Class: 2'), ''].join(
				'\n',
			),
		],
		['Extras', ['', '### Torch', fence('Uses: 1'), ''].join('\n')],
	);

	const toggle = (view: SheetView, at: number): HTMLButtonElement =>
		Array.from(
			view.containerEl.querySelectorAll<HTMLButtonElement>(
				'.sheetsmith-record-group-toggle',
			),
		)[at] as HTMLButtonElement;
	const expanded = (view: SheetView): (string | null)[] =>
		Array.from(
			view.containerEl.querySelectorAll<HTMLButtonElement>(
				'.sheetsmith-record-group-toggle',
			),
		).map((one) => one.getAttribute('aria-expanded'));

	/** Rename the first record of the list named, which commits on blur. */
	async function rename(view: SheetView, list: number, to: string): Promise<void> {
		const input = Array.from(
			view.containerEl.querySelectorAll<HTMLInputElement>(
				'.sheetsmith-record-name-input',
			),
		)[list] as HTMLInputElement;
		input.value = to;
		input.dispatchEvent(new Event('blur'));
		await settle();
	}

	it('survive a rebuild from an edit in the same list, and in another component', async () => {
		const { view } = await sheetOnNote([FEATURES, EXTRAS], TEXT);
		expect(expanded(view)).toEqual(['true', 'true']);
		toggle(view, 0).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(expanded(view)).toEqual(['false', 'true']);

		const before = toggle(view, 0);
		await rename(view, 1, 'Fireball II');
		// The sheet really was rebuilt, and the collapse came back with it.
		expect(toggle(view, 0)).not.toBe(before);
		expect(expanded(view)).toEqual(['false', 'true']);

		await rename(view, 2, 'Torch II');
		expect(expanded(view)).toEqual(['false', 'true']);
	});

	it('are dropped when the leaf moves to another file', async () => {
		const { view } = await sheetOnNote([FEATURES, EXTRAS], TEXT);
		toggle(view, 0).dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(expanded(view)).toEqual(['false', 'true']);

		view.clear();
		view.setViewData(TEXT, true);
		await settle();
		expect(expanded(view)).toEqual(['true', 'true']);
	});
});

describe('a text field as a list’s group key', () => {
	const fence = (...lines: string[]): string =>
		['```sheet', ...lines, '```', ''].join('\n');
	const LIST = {
		id: 'features',
		type: 'record-set',
		label: 'Features',
		recordName: 'Feature',
		position: { col: 1, row: 1, width: 6, height: 3 },
		groupBy: 'Class',
		fields: [{ key: 'Class' }],
	};
	const TEXT = note([
		'Features',
		[
			'',
			'### Hunter\'s Bane',
			fence('Class: Blood Hunter'),
			'### Second Wind',
			fence('Class: Fighter'),
			'### Crimson Rite',
			fence('Class: blood hunter'),
			'',
		].join('\n'),
	]);
	const toggles = (view: SheetView): HTMLButtonElement[] =>
		Array.from(
			view.containerEl.querySelectorAll<HTMLButtonElement>(
				'.sheetsmith-record-group-toggle',
			),
		);
	const classField = (view: SheetView, record: string): HTMLInputElement =>
		Array.from(
			view.containerEl.querySelectorAll<HTMLInputElement>(
				'.sheetsmith-record-input-text',
			),
		).find(
			(one) => one.getAttribute('aria-label') === `${record} Class`,
		) as HTMLInputElement;

	it('keeps a group collapsed across a rebuild when a member is retyped in another case', async () => {
		const { view } = await sheetOnNote([LIST], TEXT);
		expect(toggles(view).map((one) => one.textContent)).toEqual([
			'Blood Hunter',
			'Fighter',
		]);
		toggles(view)[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(toggles(view)[0]?.getAttribute('aria-expanded')).toBe('false');

		const field = classField(view, 'Crimson Rite');
		field.value = 'BLOOD HUNTER';
		field.dispatchEvent(new Event('blur'));
		await settle();
		// The sheet was rebuilt from the written note, and the match key kept the state.
		expect(toggles(view).map((one) => one.getAttribute('aria-expanded'))).toEqual([
			'false',
			'true',
		]);
		expect(view.containerEl.textContent).not.toContain('Not saved');
	});

	it('writes what was typed to the note, in the record’s own fence', async () => {
		const { view } = await sheetOnNote([LIST], TEXT);
		const field = classField(view, 'Second Wind');
		field.value = '  Rogue ';
		field.dispatchEvent(new Event('blur'));
		await settle();
		await view.save();
		expect(
			(view as unknown as { data: string }).data,
		).toContain('### Second Wind\n```sheet\nClass: Rogue\n```');
	});

	it('offers the names in use as the reader types, and a pick writes the note', async () => {
		const { view } = await sheetOnNote([LIST], TEXT);
		const field = classField(view, 'Second Wind');
		field.focus();
		field.value = 'bl';
		field.dispatchEvent(new Event('input'));
		const offered = (): string[] =>
			Array.from(
				document.body.querySelectorAll('.suggestion-container .suggestion-item'),
			).map((one) => one.textContent ?? '');
		expect(offered()).toEqual(['Blood Hunter']);
		document.body
			.querySelector<HTMLElement>('.suggestion-item')
			?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(
			(view as unknown as { data: string }).data,
		).toContain('### Second Wind\n```sheet\nClass: Blood Hunter\n```');
		// The rebuild closed what it had bound.
		expect(offered()).toEqual([]);
	});

	it('closes a popup left open by a rebuild', async () => {
		const { view } = await sheetOnNote([LIST], TEXT);
		const field = classField(view, 'Second Wind');
		field.focus();
		field.value = 'bl';
		field.dispatchEvent(new Event('input'));
		expect(document.body.querySelector('.suggestion-item')).not.toBeNull();
		// A rebuild from another record's edit: the focused input is removed
		// without a blur, so the view has to be what closes the list.
		const other = classField(view, 'Crimson Rite');
		other.value = 'Blood Hunter2';
		other.dispatchEvent(new Event('blur'));
		await settle();
		expect(document.body.querySelector('.suggestion-item')).toBeNull();
	});

	it('draws the configuration error in place when the text field is not the key', async () => {
		const { view } = await sheetOnNote([{ ...LIST, groupBy: undefined }], TEXT);
		const error = view.containerEl.querySelector('.sheetsmith-error');
		expect(error?.textContent).toContain(
			'The field "Class" holds text, which a list can hold only as the field it is grouped by. Set Group by to "Class"',
		);
		expect(view.containerEl.querySelector('.sheetsmith-record-group')).toBeNull();
	});
});

/*
 * A record's ceiling offers the sheet's names as a formula is typed into it, and
 * the view closes what it bound when it rebuilds
 * (`docs/features/record-ceiling-formula.md`).
 */
describe('a record ceiling’s formula suggester', () => {
	const LIST = {
		id: 'features',
		type: 'record-set',
		label: 'Features',
		recordName: 'Feature',
		fields: [{ key: 'Uses', type: 'number', maxSource: 'record' }],
	};
	const PROF = {
		id: 'prof',
		type: 'card',
		label: 'Proficiency bonus',
	};
	const TEXT = note(
		['Proficiency bonus', '```sheet\nvalue: 2\n```\n'],
		['Features', '\n### Rage\n```sheet\nUses: 1 / prof\n```\n\n### Dash\n```sheet\nUses: 1\n```\n'],
	);
	const ceilings = (view: SheetView) =>
		Array.from(
			view.containerEl.querySelectorAll<HTMLInputElement>(
				'.sheetsmith-pool-ceiling input',
			),
		);
	const offered = () =>
		Array.from(
			document.body.querySelectorAll('.suggestion-container .suggestion-item'),
		).map((one) => one.textContent ?? '');

	it('draws what the ceiling came to and offers the sheet’s names when typed into', async () => {
		const { view } = await sheetOnNote([PROF, LIST], TEXT);
		expect(
			view.containerEl.querySelector('.sheetsmith-record-worked-out-layer')
				?.textContent,
		).toBe('2');
		const field = ceilings(view)[1] as HTMLInputElement;
		field.focus();
		field.value = 'pr';
		field.dispatchEvent(new Event('input'));
		expect(offered().some((one) => one.includes('prof'))).toBe(true);
	});

	it('closes a popup left open by a rebuild', async () => {
		const { view } = await sheetOnNote([PROF, LIST], TEXT);
		const field = ceilings(view)[1] as HTMLInputElement;
		field.focus();
		field.value = 'pr';
		field.dispatchEvent(new Event('input'));
		expect(document.body.querySelector('.suggestion-item')).not.toBeNull();
		const other = ceilings(view)[0] as HTMLInputElement;
		other.value = 'prof + 1';
		other.dispatchEvent(new Event('blur'));
		await settle();
		expect(document.body.querySelector('.suggestion-item')).toBeNull();
		expect(
			view.containerEl.querySelector('.sheetsmith-record-worked-out-layer')
				?.textContent,
		).toBe('3');
	});
});
