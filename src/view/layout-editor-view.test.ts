// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
	LayoutEditorView,
	openLayoutEditor,
	VIEW_TYPE_LAYOUT_EDITOR,
} from './layout-editor-view';
import { SHEET_DESTINATION } from '../editor/layout-editor';
import { Layout, serialiseLayout } from '../parse/layout';
import { App } from '../test/obsidian-stub';
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
		 * Both keys, because both keys is every value `getEphemeralState`
		 * produces — and the pair is what broke. The scroll used to be assigned
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

		pane.setEphemeralState({ selection: 'hit_points', scroll: 400 });
		await tick();

		expect(pane.getEphemeralState()).toEqual({
			selection: 'hit_points',
			scroll: 400,
		});
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
