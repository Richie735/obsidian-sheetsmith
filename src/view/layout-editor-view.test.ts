// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
	LayoutEditorView,
	openLayoutEditor,
	VIEW_TYPE_LAYOUT_EDITOR,
} from './layout-editor-view';
import { SHEET_DESTINATION } from '../editor/layout-editor';
import { Layout, serialiseLayout } from '../parse/layout';
import { SheetView } from './sheet-view';
import { App, Notice, TextFileView } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { openView } from '../test/workspace';

/*
 * The pane, as distinct from the editor inside it.
 *
 * What the pane owns is *posture*: which layout is open, and what is selected.
 * Everything the editor draws is driven in `editor/layout-editor.test.ts` — and
 * driven through this pane, because this is the host that ships. What is left
 * here is the two homes Obsidian gives posture and the difference between them,
 * which is the whole reason the pane uses both rather than one.
 */

function layout(name: string): Layout {
	return {
		name,
		columns: 12,
		components: [
			{
				id: 'hit_points',
				type: 'pool',
				label: 'Hit points',
				position: { col: 1, row: 1, width: 4, height: 1 },
			},
		],
		triggers: ['Long rest'],
	};
}

/**
 * Two layouts, so "the layout that was open" is a claim rather than a
 * coincidence: with one file the pane lands on it whether or not any state was
 * carried, and the test would pass with `getState` returning nothing at all.
 */
async function vault(): Promise<App> {
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	for (const name of ['Alpha', 'Beta']) {
		await app.vault.create(
			`${LAYOUT_FOLDER}/${name}.json`,
			serialiseLayout(layout(name)),
		);
	}
	return app;
}

async function tick(): Promise<void> {
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

function control<T extends HTMLElement = HTMLElement>(
	pane: LayoutEditorView,
	token: string,
): T {
	const el = pane.contentEl.querySelector(
		`[data-sheetsmith-focus="${token}"]`,
	);
	if (!el) throw new Error(`no control for "${token}"`);
	return el as T;
}

/** Open the pane on Beta with its pool selected, which is a posture to restore. */
async function posed(app: App): Promise<LayoutEditorView> {
	const pane = await openView(app, document.body, LayoutEditorView, fakePlugin(app));
	const picker = control<HTMLSelectElement>(pane, 'layout-picker');
	picker.value = 'Beta';
	picker.dispatchEvent(new Event('change'));
	await tick();
	control(pane, 'edit-hit_points').click();
	await tick();
	return pane;
}

describe('what the workspace remembers', () => {
	it('carries the open layout as state and the selection as ephemeral', async () => {
		const pane = await posed(await vault());
		// The split is the claim: a restored workspace replays state and not
		// ephemeral state, so which of the two a thing goes in decides whether it
		// comes back. Asserting the selection is *absent* from the state is the
		// half that would otherwise pass by accident.
		expect(pane.getState()).toEqual({ layout: 'Beta' });
		expect(pane.getEphemeralState().selection).toBe('hit_points');
	});

	it('reopens on the layout that was open', async () => {
		const app = await vault();
		const state = (await posed(app)).getState();

		const reopened = await openView(app, document.body, LayoutEditorView, fakePlugin(app));
		await reopened.setState(state, { history: false });
		await tick();

		expect(reopened.getState()).toEqual({ layout: 'Beta' });
		// Alpha sorts first, so this is also the check that the fallback did not
		// simply take the first file.
		expect(
			control<HTMLSelectElement>(reopened, 'layout-picker').value,
		).toBe('Beta');
	});

	it('does not reopen on the component that was selected', async () => {
		// Correct rather than a limitation: a pane that comes back on the
		// layout's own settings is where an author can start, and one that comes
		// back deep in a form nobody is in the middle of editing is clutter.
		const app = await vault();
		const state = (await posed(app)).getState();

		const reopened = await openView(app, document.body, LayoutEditorView, fakePlugin(app));
		await reopened.setState(state, { history: false });
		await tick();

		expect(reopened.getEphemeralState().selection).toBe(SHEET_DESTINATION);
		expect(
			reopened.contentEl.querySelector('[data-sheetsmith-focus="layout-columns"]'),
		).not.toBeNull();
	});

	it('takes the scroll back with the selection, not instead of it', async () => {
		/*
		 * All three keys, because all three is every value `getEphemeralState`
		 * produces — and the pair used to be one number, `scroll`, assigned
		 * beside the redraw rather than through it, so it landed on a pane the
		 * redraw had just emptied and was then overwritten when the render
		 * resolved. A published member nothing could ever restore.
		 *
		 * Nothing replays ephemeral state on this pane today, because
		 * `navigation` is false and Obsidian keeps no history for it. That is why
		 * this went unnoticed and it is not a reason to leave it: the member is
		 * published, so something reading it back has to get it back.
		 */
		const app = await vault();
		const pane = await openView(app, document.body, LayoutEditorView, fakePlugin(app));

		pane.setEphemeralState({ selection: 'hit_points', outline: 120, panel: 400 });
		await tick();

		expect(pane.getEphemeralState()).toEqual({
			selection: 'hit_points',
			outline: 120,
			panel: 400,
		});
	});

	it('keeps the panel scrolled where the author left it, not the pane', async () => {
		/*
		 * The actual bug, driven directly rather than through the ephemeral-state
		 * round trip above: `contentEl` holds the outline and the panel side by
		 * side and never overflows itself, so `redraw()` used to measure and
		 * restore *its* scroll — a number that was always zero — while
		 * `.sheetsmith-editor-outline` and `.sheetsmith-editor-panel`, the two
		 * elements that actually scroll, were silently reset to the top on every
		 * edit. Happy-dom does not clamp `scrollTop` to a real layout, so this
		 * would not have caught the browser's own collapse-then-clamp (measured
		 * against the real app instead), but it does catch the coarser mistake
		 * underneath it: `redraw()` reading and writing the wrong element,
		 * which is what every edit in the pane goes through.
		 */
		const pane = await posed(await vault());
		const panel = pane.contentEl.querySelector<HTMLElement>(
			'.sheetsmith-editor-panel',
		);
		if (!panel) throw new Error('no panel');
		panel.scrollTop = 400;

		pane.redraw();
		await tick();

		const redrawn = pane.contentEl.querySelector<HTMLElement>(
			'.sheetsmith-editor-panel',
		);
		expect(redrawn).not.toBeNull();
		expect(redrawn).not.toBe(panel);
		expect(redrawn?.scrollTop).toBe(400);
	});

	it('takes a selection back when the ephemeral state is replayed', async () => {
		// The other half, so the choice above reads as a choice: the mechanism
		// works, and the reason a restored pane does not use it is that Obsidian
		// does not replay ephemeral state.
		const app = await vault();
		const pane = await openView(app, document.body, LayoutEditorView, fakePlugin(app));

		pane.setEphemeralState({ selection: 'hit_points' });
		await tick();

		expect(control(pane, 'cfg-hit_points-max')).not.toBeNull();
	});
});

describe('opening the pane again', () => {
	/*
	 * The command and the settings button both go through `openLayoutEditor`, and
	 * it is the one place that decides whether a second pane exists. Its own
	 * comment names the trap — reusing the leaf and calling `setViewState` on it
	 * hands the view a state naming no layout, so running the command while the
	 * pane was open on the second layout lands the author back on the first — so
	 * the branch that avoids it is worth driving rather than describing.
	 *
	 * The *cold* path, where no pane is open, is not driven and cannot be: it
	 * ends in `leaf.setViewState`, which the stub does not carry because making
	 * one work means a view registry, which means a real `Plugin` whose `onload`
	 * runs. That is the workspace fixture `docs/PATTERNS.md` §11 already has a
	 * row waiting on, and the cold path is three lines with no decision in them.
	 * The branch with the reasoning in it is this one.
	 */
	it('reveals the pane that is open rather than opening a second', async () => {
		const app = await vault();
		const pane = await posed(app);
		const leaf = app.workspace.leaves[0];

		await openLayoutEditor(fakePlugin(app));

		// One leaf, and it is the one that was already there. The three obvious
		// lines — `getLeaf('tab')` and an unconditional `setViewState` — put a
		// second leaf in this list and reveal that one instead.
		expect(app.workspace.getLeavesOfType(VIEW_TYPE_LAYOUT_EDITOR)).toEqual([
			leaf,
		]);
		expect(app.workspace.activeLeaf).toBe(leaf);
		// And the author is still on the layout they were on, which is the whole
		// point of not re-opening it.
		expect(pane.getState()).toEqual({ layout: 'Beta' });
	});

	it('keeps the layout the author had open when handed a state naming none', async () => {
		// The defence one layer down, at the view rather than at the caller: a
		// state that names nothing must change nothing, whatever calls it.
		const app = await vault();
		const pane = await posed(app);

		await pane.setState({}, { history: false });
		await tick();

		expect(pane.getState()).toEqual({ layout: 'Beta' });
	});
});

/*
 * A rename committed while a sheet is open on one of the notes it rewrites.
 *
 * Here rather than in `editor/layout-editor.test.ts`, which holds every other
 * case for the migration: what is wrong in this bug is neither the scan nor the
 * editor's commit — both are correct and both are covered there — but the hop
 * *this* file owns, the pane's reach into open sheet views after a write. It
 * needs two views in one workspace, which is a thing only the view layer can
 * put together.
 *
 * **It is the owner's report, in its own order**: a value typed on a sheet, then
 * that component's label renamed in the editor. Every other rename case creates
 * its character note from a literal, so the note was always already on disk and
 * no sheet was ever holding it — which is exactly the two things that were
 * wrong. The first is why it reproduced at all and the second is why nothing
 * caught it: `requestSave` is a two-second debounce, so the typed value was
 * still only in the view when the scan read the file, and the scan then reported
 * an all-clear over a note it had not migrated.
 */
describe('a rename while a sheet is open', () => {
	const CARD_LAYOUT: Layout = {
		name: 'Alpha',
		columns: 12,
		components: [
			{
				id: 'armour',
				type: 'card',
				label: 'AC',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
		],
	};

	/**
	 * The note as it is before the reader types: this layout's, and holding no
	 * section for the card at all.
	 *
	 * The prose is load bearing rather than decoration — SPEC §10 promises the
	 * first edit writes its data block into the section "preserving any prose
	 * already there", so a note with none would not be the state the report
	 * describes.
	 */
	const BLANK = '---\nsheet-layout: Alpha\n---\n\nSome prose.\n';

	/**
	 * A sheet as its `TextFileView` half, which is where the save contract
	 * lives.
	 *
	 * The cast `src/test/workspace.ts` explains: the compiler types `SheetView`
	 * against the real `obsidian`, and the stub is a *double* for that rather
	 * than an implementation of it — so the file-loading and save members are
	 * the double's own. What a test drives through this is exactly the part of
	 * the contract the bug turned on: which file is loaded, and whether a
	 * debounced save is outstanding.
	 */
	function asFileView(sheet: SheetView): TextFileView {
		return sheet as unknown as TextFileView;
	}

	/** A sheet open on `Renames.md`, and the editor pane beside it. */
	async function opened(): Promise<{
		app: App;
		sheet: SheetView;
		pane: LayoutEditorView;
		note: () => Promise<string>;
	}> {
		const app = new App();
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(
			`${LAYOUT_FOLDER}/Alpha.json`,
			serialiseLayout(CARD_LAYOUT),
		);
		const file = await app.vault.create('Renames.md', BLANK);
		const plugin = fakePlugin(app);

		// The sheet first, so it is already in the workspace when the pane looks
		// for open sheets — which is the arrangement the report was made in.
		const sheet = await openView(app, document.body, SheetView, plugin);
		await asFileView(sheet).onLoadFile(file);
		await tick();
		const pane = await openView(app, document.body, LayoutEditorView, plugin);
		await tick();
		Notice.messages = [];

		return {
			app,
			sheet,
			pane,
			note: async () => app.vault.read(app.vault.getFileByPath('Renames.md')!),
		};
	}

	/** Type into the card's value field and leave it, which is what commits. */
	function typeOnSheet(sheet: SheetView, value: string): void {
		const input = sheet.contentEl.querySelector<HTMLInputElement>('input');
		if (!input) throw new Error('the sheet drew no field to type in');
		input.value = value;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
	}

	/** Rename the card's label, through the panel's own control. */
	async function renameLabel(
		pane: LayoutEditorView,
		to: string,
	): Promise<void> {
		control(pane, 'edit-armour').click();
		pane.flush();
		await tick();
		const label = control<HTMLInputElement>(pane, 'label-armour');
		label.value = to;
		label.dispatchEvent(new Event('input'));
		label.dispatchEvent(new Event('change'));
		pane.flush();
		await tick();
		await tick();
	}

	/** Rename the card's storage key, through the panel's own control. */
	async function renameKey(pane: LayoutEditorView, to: string): Promise<void> {
		control(pane, 'edit-armour').click();
		pane.flush();
		await tick();
		const key = control<HTMLInputElement>(pane, 'cfg-armour-key');
		key.value = to;
		key.dispatchEvent(new Event('input'));
		key.dispatchEvent(new Event('change'));
		pane.flush();
		await tick();
		await tick();
	}

	/** Close the sheet and open it again on the same file, as a reader does. */
	async function reopen(sheet: SheetView): Promise<void> {
		const view = asFileView(sheet);
		const file = view.file!;
		await view.onUnloadFile(file);
		await view.onLoadFile(file);
		await tick();
	}

	/** Every value the sheet is currently showing in a field. */
	function shown(sheet: SheetView): string[] {
		return Array.from(
			sheet.contentEl.querySelectorAll<HTMLInputElement>('input'),
			(input) => input.value,
		);
	}

	it('migrates the value the reader has only just typed, and says so', async () => {
		const { sheet, pane, note } = await opened();

		typeOnSheet(sheet, '15');
		await tick();
		// The debounce is deliberately *not* run: this is the state the file is
		// in for two seconds after every edit, and the report was made from it.
		expect(asFileView(sheet).savesRequested).toBe(1);

		await renameLabel(pane, 'Armor class');

		// The one the owner saw none of. Silence here was the whole defect: it
		// is indistinguishable from a rename that had nothing to migrate.
		expect(Notice.messages).toEqual([
			'Renamed "AC" to "Armor class" in 1 character note.',
		]);
		expect(await note()).toBe(
			'---\nsheet-layout: Alpha\n---\n\nSome prose.\n\n## Armor class\n\n```sheet\nvalue: 15\n```\n',
		);
	});

	it('leaves the open sheet showing the value under its new heading', async () => {
		const { sheet, pane } = await opened();

		typeOnSheet(sheet, '15');
		await tick();
		await renameLabel(pane, 'Armor class');

		// The card went blank here, with its value sitting in the file: the
		// refresh re-rendered the renamed component off the text the view still
		// held, which is the old heading.
		expect(shown(sheet)).toContain('15');
	});

	it('cannot write the old heading back after the rename', async () => {
		const { sheet, pane, note } = await opened();

		typeOnSheet(sheet, '15');
		await tick();
		await renameLabel(pane, 'Armor class');

		// Closing the sheet is what makes the stale copy permanent — "by
		// default, this view only saves when it's closing" — so this is the
		// gesture that used to put `## AC` back over the migration and orphan
		// the value for good (Constraint 4).
		//
		// **A conjunction guard, and worth naming as one**: it needs *both*
		// halves gone to redden, because the reload keeps `data` current and the
		// conditional write refuses a stale save independently. Swapping the
		// reload alone for a refresh leaves this green and reddens only the case
		// above, which is why that case and not this one is the reload's pin.
		const before = await note();
		const view = asFileView(sheet);
		await view.onUnloadFile(view.file!);
		expect(await note()).toBe(before);
	});

	it('survives a debounced save landing between the migration and the reload', async () => {
		/*
		 * **The race the bracket alone does not close.** `requestSave` is typed
		 * `() => void` with no cancel, so flushing the view early does not call
		 * off the write already scheduled — in the app it still fires about two
		 * seconds later, which on a vault large enough for the whole-vault scan
		 * to take that long is *during* the migration.
		 *
		 * **The window is what has to be reproduced, not merely the late
		 * arrival.** A debounce firing after `reloadSheets()` is harmless
		 * whatever the code does, because the reload has by then replaced the
		 * view's `data` with the migrated text — so a case that simply fires it
		 * at the end of the gesture passes with the conditional write removed and
		 * proves nothing. Landing it inside the migration's own write is the
		 * whole point: the file is migrated, the view still holds the pre-rename
		 * text, and nothing has told it so.
		 */
		const { app, sheet, pane, note } = await opened();

		typeOnSheet(sheet, '15');
		await tick();

		const write = app.vault.process.bind(app.vault);
		let landed = 0;
		vi.spyOn(app.vault, 'process').mockImplementation(async (file, fn) => {
			const result = await write(file, fn);
			// Exactly here: the migration has rewritten the heading and
			// `reloadSheets()` has not run.
			landed += 1;
			await asFileView(sheet).runRequestedSave();
			return result;
		});

		await renameLabel(pane, 'Armor class');

		// The interleaving actually happened, so a green below is a fact about
		// the code and not about a spy that never fired.
		expect(landed).toBe(1);
		const after = await note();
		expect(after).toContain('## Armor class');
		expect(after).not.toContain('## AC');
		expect(after).toContain('value: 15');
	});

	/*
	 * Criterion 12 asks for a note "reopened in sheet view", and the cases above
	 * prove it on the *live* path — the sheet that was open throughout. An actual
	 * close and reopen is a different claim: it reads the file back from disk
	 * through the platform's own loader, so it is the one that says the migrated
	 * bytes are what a reader meets tomorrow rather than what this view happened
	 * to be holding.
	 */
	it('shows the migrated value after a real close and reopen, for a label', async () => {
		const { sheet, pane } = await opened();

		typeOnSheet(sheet, '15');
		await tick();
		await renameLabel(pane, 'Armor class');
		await reopen(sheet);

		expect(sheet.getViewData()).toContain('## Armor class');
		expect(shown(sheet)).toContain('15');
	});

	it('shows the migrated value after a real close and reopen, for a key', async () => {
		const { sheet, pane, note } = await opened();

		typeOnSheet(sheet, '15');
		await tick();
		// The card declares no key, so naming it is a migration off `value`.
		await renameKey(pane, 'AC');
		await reopen(sheet);

		expect(await note()).toContain('AC: 15');
		expect(shown(sheet)).toContain('15');
	});

	it('does not put the old heading back on the reader’s next edit', async () => {
		// Criterion 17's second clause, which was reasoned rather than driven:
		// not only does closing not write the old name back, neither does simply
		// carrying on typing on the sheet that was open through the rename.
		const { sheet, pane, note } = await opened();

		typeOnSheet(sheet, '15');
		await tick();
		await renameLabel(pane, 'Armor class');

		typeOnSheet(sheet, '16');
		await tick();
		await asFileView(sheet).runRequestedSave();

		const after = await note();
		expect(after).toContain('## Armor class');
		expect(after).not.toContain('## AC');
		expect(after).toContain('value: 16');
	});

	it('does not touch a note whose sheet is open and unedited', async () => {
		// The other half of the flush, and the promise the vault fixture's
		// `Untouched.md` asks a reviewer to check: a sheet with nothing pending
		// must not be written merely because a rename happened.
		//
		// **Asserted on the write and not on the bytes**, which is the whole of
		// what makes this case say anything. An unconditional flush writes
		// `getViewData()`, byte-identical to what the file already holds, and the
		// double's `Vault.modify` records neither a count nor a modified time —
		// so comparing contents afterwards passes whether the guard is there or
		// not. The spy is the only thing in reach that can tell a write that did
		// not happen from a write that changed nothing, and the fixture's own
		// check is a modified time, which is exactly this distinction.
		const { app, sheet, pane, note } = await opened();
		expect(asFileView(sheet).savesRequested).toBe(0);
		const writes = vi.spyOn(app.vault, 'modify');

		await renameLabel(pane, 'Armor class');

		expect(Notice.messages).toEqual([]);
		expect(await note()).toBe(BLANK);
		expect(writes.mock.calls.map(([file]) => file.path)).not.toContain(
			'Renames.md',
		);
		// And nothing was queued by the reload either, so the sheet is not left
		// holding a write it will make later.
		expect(asFileView(sheet).savesRequested).toBe(0);
	});
});
