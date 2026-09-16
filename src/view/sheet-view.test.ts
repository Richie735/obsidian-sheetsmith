// @vitest-environment happy-dom
/*
 * `sheet-view.ts`, in the two parts a test can reach.
 *
 * **What the trigger's confirmation says a press will touch** (SPEC §6) reads no
 * view state, so it is a function rather than a method and is driven directly;
 * `renderTriggers` and `applyTrigger` still go through `reset-flow.test.ts`'s
 * mirror.
 *
 * **And the view's own save rule**, which is new here. `SheetView` could not be
 * constructed at all while the double's `TextFileView` was a bare `data` field —
 * `docs/PATTERNS.md` §11's standing row — and now it can, so the rule that
 * decides whether this view may write to a character note is driven where it
 * lives instead of at one remove through the layout editor's pane. That matters
 * for this rule in particular: its whole job is to *refuse* a write, and the
 * only case that reached it from the pane could not tell a refused write from a
 * write that changed nothing.
 */
import { describe, expect, it, vi } from 'vitest';
import { resetSummary, SheetView } from './sheet-view';
import { getComponent } from '../components';
import { App, TextFileView } from '../test/obsidian-stub';
import { fakePlugin } from '../test/plugin';
import { openView } from '../test/workspace';
import { ComponentConfig, ComponentDefinition } from '../types';

/** A Table whose columns a trigger can name, prepared the way the view does. */
function conditions(reset: ComponentConfig['reset']): {
	config: ComponentConfig;
	component: ComponentDefinition | undefined;
} {
	return {
		config: {
			id: 'conditions',
			type: 'table',
			label: 'Conditions',
			position: { col: 1, row: 1, width: 4, height: 2 },
			rowHeader: 'Condition',
			columns: [
				{ key: 'Active', type: 'toggle' },
				{ key: 'Uses', name: 'Uses left', type: 'number', max: 3 },
			],
			...(reset ? { reset } : {}),
		} as ComponentConfig,
		component: getComponent('table'),
	};
}

/** A Pool, which names no part of itself and so must read as it always did. */
function pool(reset: ComponentConfig['reset']) {
	return {
		config: {
			id: 'hp',
			type: 'pool',
			label: 'Hit points',
			position: { col: 1, row: 1, width: 2, height: 1 },
			...(reset ? { reset } : {}),
		} as ComponentConfig,
		component: getComponent('pool'),
	};
}

describe('what the confirmation says a trigger will touch', () => {
	it('names the column, because the label alone over-claims', () => {
		// "It resets: Conditions" promised a component where one of two columns
		// moves, on a component whose other columns are guaranteed untouched.
		expect(
			resetSummary(
				'Long rest',
				conditions([{ trigger: 'Long rest', column: 'Active', action: 'empty' }]),
			),
		).toBe('Conditions — Active');
	});

	it('names both columns where one trigger reaches two', () => {
		expect(
			resetSummary(
				'Long rest',
				conditions([
					{ trigger: 'Long rest', column: 'Active', action: 'empty' },
					{ trigger: 'Long rest', column: 'Uses', action: 'full' },
				]),
			),
		).toBe('Conditions — Active, Uses left');
	});

	it("uses the component's own label for a column, never the stored key", () => {
		// `Uses left` is the column's `name`; the binding stores `Uses`. The
		// display word comes back from `resetColumns`, so this file never
		// decides what a part of a component is called.
		expect(
			resetSummary(
				'Long rest',
				conditions([{ trigger: 'Long rest', column: 'Uses', action: 'full' }]),
			),
		).toBe('Conditions — Uses left');
	});

	it('leaves out a binding on a different trigger', () => {
		expect(
			resetSummary(
				'Short rest',
				conditions([
					{ trigger: 'Long rest', column: 'Active', action: 'empty' },
					{ trigger: 'Short rest', column: 'Uses', action: 'full' },
				]),
			),
		).toBe('Conditions — Uses left');
	});

	it('falls back to the stored key for a column that is gone', () => {
		// Honest rather than silent: the failure notice this press produces
		// names the same word.
		expect(
			resetSummary(
				'Long rest',
				conditions([{ trigger: 'Long rest', column: 'Fatigue', action: 'empty' }]),
			),
		).toBe('Conditions — Fatigue');
	});

	it('is the bare label for a component that names no part of itself', () => {
		// Pool, Track and Record set are unchanged by this, which is the whole
		// of what keeps it from being a change to every confirmation.
		expect(
			resetSummary('Long rest', pool([{ trigger: 'Long rest', action: 'full' }])),
		).toBe('Hit points');
	});

	it('is the bare label for a binding carrying no column at all', () => {
		// An old layout's Table binding: the press reports what it does not say,
		// and the confirmation promises nothing it cannot do.
		expect(
			resetSummary(
				'Long rest',
				conditions([{ trigger: 'Long rest', action: 'full' }]),
			),
		).toBe('Conditions');
	});
});

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

