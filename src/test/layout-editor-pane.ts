/*
 * The layout editor's pane, opened on a layout file and driven through its own
 * controls.
 *
 * Scaffolding, not a test case (`docs/PATTERNS.md` §2): nothing here asserts.
 * `open` writes a layout into a stub vault and opens a real `LayoutEditorView`
 * on it through `workspace.ts`, and everything after that is how a case reaches
 * a control and reads back what the file now holds — by the
 * `data-sheetsmith-focus` token the editor already gives every control so it can
 * restore focus across its own rebuilds, which makes the token a stable address.
 *
 * **Why the real pane and not a host of the test's own.** The editor asks its
 * host which layout is open and what is selected, and the pane's answers are the
 * ones that ship. A case supplying a second answer would test the editor against
 * it instead. So a region cut out of the editor — the tree, the panel, the
 * schematic's gestures, the **Layout file** row — is still driven here, through
 * the rows and blocks the pane draws around it, and never over a fake host.
 *
 * **It was `layout-editor.test.ts`'s own**, and it moved here when the cases for
 * those four regions moved beside their modules: a sibling test file cannot
 * import another test file's helpers, and §2 keeps shared helpers here. What
 * came with it is what more than one of those files uses, and nothing else — the
 * layouts several of them open (`fixture`, `nested`, `deep`, `furnished`,
 * `schematic`, `unevenSchematic`), the picker and menu presses, the tree row, and
 * the schematic's measured grid. A helper only one file needs stays in that file,
 * which sent five of the original harness's own — `pickerLines`, `grids`,
 * `chord`, `groups` and `confirmAction` — to the one file that presses each.
 *
 * Every function takes the harness it acts on rather than reading a module-level
 * one, so each test file keeps its own `let harness` and nothing here holds state
 * between cases.
 */

import { LayoutEditorView } from '../view/layout-editor-view';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { App } from './obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from './plugin';
import { openView, showFile } from './workspace';
import { ComponentConfig, GridPosition } from '../types';

/** A layout with one plain component and one that can act on a reset. */
export function fixture(): Layout {
	return {
		name: 'Test sheet',
		columns: 12,
		components: [
			{
				id: 'armour',
				type: 'card',
				label: 'Armour class',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			{
				id: 'hit_points',
				type: 'pool',
				label: 'Hit points',
				position: { col: 3, row: 1, width: 4, height: 1 },
			},
		],
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest'],
	};
}

export interface Harness {
	/** The pane's content element, which is the whole of what it draws into. */
	container: HTMLElement;
	pane: LayoutEditorView;
	app: App;
	/**
	 * The plugin the pane was opened on, for a case about a *setting* rather
	 * than a control — the pane's own reference is private, and reaching past
	 * that would be asserting on an implementation the view may change.
	 */
	plugin: ReturnType<typeof fakePlugin>;
	/** The layout as the file currently holds it. */
	stored: () => Promise<Layout>;
	/** The file's exact bytes, for the round-trip check. */
	raw: () => Promise<string>;
	/** Re-render, the way an edit does. */
	redraw: () => Promise<void>;
}

/** One turn of the event loop, which is what an unawaited render needs. */
export async function tick(): Promise<void> {
	await new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * The editor writes through a debounce and persists without awaiting, so a
 * test that asserted straight after a click would read the file as it was
 * before the edit. `flush` runs the pending write; the tick lets the unawaited
 * promise inside it, and the redraw it triggers, settle.
 */
export async function settle(pane: LayoutEditorView): Promise<void> {
	pane.flush();
	await tick();
}

export async function open(layout: Layout = fixture()): Promise<Harness> {
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	const path = `${LAYOUT_FOLDER}/${layout.name}.sheetsmith`;
	await app.vault.create(path, serialiseLayout(layout));

	const plugin = fakePlugin(app);
	const pane = await openView(app, document.body, LayoutEditorView, plugin);
	// The pane is bound to a file and never picks one for itself, so it is
	// opened on this one the way a click in the file explorer would.
	await showFile(pane, path);

	const raw = async () => {
		const file = app.vault.getFileByPath(path);
		if (!file) throw new Error(`${path} is gone`);
		return app.vault.read(file);
	};

	return {
		container: pane.contentEl,
		pane,
		app,
		plugin,
		raw,
		stored: async () => parseLayout(await raw()),
		redraw: async () => {
			pane.redraw();
			await tick();
		},
	};
}

/** The control the editor addresses by this focus token. */
export function control<T extends HTMLElement = HTMLElement>(
	harness: Harness,
	token: string,
): T {
	const el = harness.container.querySelector(
		`[data-sheetsmith-focus="${token}"]`,
	);
	if (!el) throw new Error(`no control for "${token}"`);
	return el as T;
}

export function has(harness: Harness, token: string): boolean {
	return (
		harness.container.querySelector(`[data-sheetsmith-focus="${token}"]`) !==
		null
	);
}

/** Open the component picker, where it is not open already. */
export function openPicker(harness: Harness): void {
	const toggle = control<HTMLButtonElement>(harness, 'picker-toggle');
	if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
}

/**
 * Make one picker line active the way a press does, by the value that addresses
 * it: a type, or `type:index` for a palette entry.
 */
export function pick(harness: Harness, value: string): void {
	openPicker(harness);
	const option = harness.container.querySelector<HTMLElement>(
		`[data-sheetsmith-choice="${value}"]`,
	);
	if (!option) throw new Error(`no picker line for "${value}"`);
	option.click();
}

/**
 * Type into a text field and leave it, which is what commits.
 *
 * Both events, because the editor does not use one wiring throughout: config
 * fields commit on `change` through `onCommit`, and the label field reacts to
 * `input` so the component row's heading tracks what is being typed. A test
 * firing only one would pass against half the form.
 */
export function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input'));
	input.dispatchEvent(new Event('change'));
}

export function choose(select: HTMLSelectElement, value: string): void {
	select.value = value;
	select.dispatchEvent(new Event('change'));
}

export function toggle(input: HTMLInputElement, checked: boolean): void {
	input.checked = checked;
	input.dispatchEvent(new Event('change'));
}

/**
 * The checkbox in the setting row with this name.
 *
 * By row name rather than by focus token, which booleans now carry too: the
 * name is the label the author reads, which makes it the right thing for a test
 * to name. `settings.test.ts` is where the token itself is load bearing.
 */
export function checkbox(harness: Harness, name: string): HTMLInputElement {
	for (const item of Array.from(
		harness.container.querySelectorAll('.setting-item'),
	)) {
		const label = item.querySelector('.setting-item-name')?.textContent;
		if (label !== name) continue;
		const input = item.querySelector('input[type="checkbox"]');
		if (input) return input as HTMLInputElement;
	}
	throw new Error(`no toggle in a row named "${name}"`);
}

/**
 * Open a tree row's menu the way a press on its menu button does.
 *
 * The app's menu draws onto `document.body`, outside the pane, so what it holds
 * is read from there. A press with `detail` of 1 is a pointer's, which is the
 * route that shows the menu at the pointer rather than under the button.
 */
export function openRowMenu(harness: Harness, id: string): void {
	control(harness, `tree-menu-${id}`).dispatchEvent(
		new MouseEvent('click', { bubbles: true, detail: 1 }),
	);
}

/** The open menu's lines, items and separators alike, in order. */
export function menuLines(): string[] {
	return Array.from(document.body.querySelectorAll('.menu .menu-scroll > *')).map(
		(el) =>
			el.classList.contains('menu-separator')
				? '---'
				: (el.querySelector('.menu-item-title')?.textContent ?? ''),
	);
}

/** The open menu's item with this title. */
export function menuItem(title: string): HTMLElement {
	for (const el of Array.from(document.body.querySelectorAll('.menu .menu-item'))) {
		if (el.querySelector('.menu-item-title')?.textContent === title) {
			return el as HTMLElement;
		}
	}
	throw new Error(`no menu item "${title}" among ${JSON.stringify(menuLines())}`);
}

/** Open a row's menu and press one of its items, by title. */
export function pressMenu(harness: Harness, id: string, title: string): void {
	openRowMenu(harness, id);
	menuItem(title).click();
}

/** Remove a component from its tree row's menu, which asks nothing. */
export function removeRow(harness: Harness, id: string): void {
	pressMenu(harness, id, 'Remove');
}

/**
 * How many times the layout file has been written since this was installed.
 *
 * Counted rather than compared. Asserting the bytes are unchanged passes just as
 * well when the editor rewrote the file with identical content — and passes
 * trivially, so it would go on passing if the round trip ever broke. What the
 * three callers each claim is about *writes*: that opening a form is not an
 * edit, that a drag persists once on release rather than once a frame, and that
 * a run of arrow keys goes through one debounce.
 *
 * **When it is counted is half of what it says.** The two gesture callers make
 * opposite claims about the same number, and both are only readable either side
 * of a flush: the drag counts its write after a bare tick, before `settle` runs
 * any pending timer, so a debounced write there fails; the arrow run counts 0
 * before `settle` and 1 after. Count both after the flush and the two policies
 * are indistinguishable.
 */
export function writes(harness: Harness): () => number {
	let count = 0;
	const modify = harness.app.vault.modify.bind(harness.app.vault);
	harness.app.vault.modify = async (file, content) => {
		count++;
		return modify(file, content);
	};
	return () => count;
}

/** A named setting row's text, for asserting on what the editor offers. */
export function labels(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll('.setting-item-name'),
	).map((el) => el.textContent ?? '');
}

/** A layout with a Group holding one card, and a plain card beside it. */
export function nested(): Layout {
	return {
		name: 'Nested sheet',
		columns: 12,
		components: [
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 3, height: 1 },
					},
				],
			},
			{
				id: 'hit_points',
				type: 'pool',
				label: 'Hit points',
				position: { col: 7, row: 1, width: 4, height: 1 },
			},
		],
		triggers: ['Long rest'],
	};
}

/**
 * A layout two containers deep, plus a container holding nothing.
 *
 * `nested()` cannot reach either case: its only container is at the top level
 * and already has a child, so nothing there is at the depth that may hold
 * nothing, and nothing there has an absent `children`.
 */
export function deep(): Layout {
	return {
		name: 'Deep sheet',
		columns: 12,
		components: [
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'melee',
						type: 'group',
						label: 'Melee',
						position: { col: 1, row: 1, width: 4, height: 1 },
						children: [
							{
								id: 'armour',
								type: 'card',
								label: 'Armour class',
								position: { col: 1, row: 1, width: 2, height: 1 },
							},
						],
					},
				],
			},
			{
				id: 'spellbook',
				type: 'group',
				label: 'Spellbook',
				position: { col: 7, row: 1, width: 4, height: 1 },
			},
		],
		triggers: ['Long rest'],
	};
}

/** Press **Add** on the component picker, opening it first where it is shut. */
export function pressAdd(harness: Harness): void {
	openPicker(harness);
	control<HTMLButtonElement>(harness, 'picker-add').click();
}

/** Choose where the next insert goes, on the picker's action bar. */
export function chooseDestination(harness: Harness, value: string): void {
	openPicker(harness);
	choose(control<HTMLSelectElement>(harness, 'add-destination'), value);
}

/** A layout with a card set and a container, whose forms carry every field kind. */
export function furnished(): Layout {
	return {
		name: 'Furnished sheet',
		columns: 12,
		components: [
			{
				id: 'abilities',
				type: 'card-set',
				label: 'Abilities',
				position: { col: 7, row: 1, width: 6, height: 1 },
				entries: [{ key: 'STR' }],
			} as ComponentConfig,
			{
				id: 'defences',
				type: 'group',
				label: 'Defences',
				position: { col: 1, row: 1, width: 6, height: 2 },
				children: [
					{
						id: 'armour',
						type: 'card',
						label: 'Armour class',
						position: { col: 1, row: 1, width: 2, height: 1 },
					},
				],
			},
		],
		functions: ['mod(score) = floor((score - 10) / 2)'],
		triggers: ['Long rest'],
	};
}

/** The tree row carrying this focus token, as a settings row. */
export function treeRow(harness: Harness, token: string): HTMLElement {
	const button = control(harness, token);
	const row = button.closest('.setting-item');
	if (!row) throw new Error(`"${token}" is not in a settings row`);
	return row as HTMLElement;
}

/**
 * A layout whose three blocks are placed for the gestures, not for the tree.
 *
 * `fixture()` and `furnished()` are both shaped by what they were written for —
 * a component with a reset binding, a container with a child — and every drag
 * in `schematic-gestures.test.ts` and `layout-editor.test.ts` needs a block with
 * known room on each side of it. Stating that here is
 * cheaper than reading a bound off a fixture that owes it to something else.
 */
export function schematic(): Layout {
	return {
		name: 'Gesture sheet',
		columns: 12,
		components: [
			// Room on the right and hard against the top and left, so a clamp is
			// several columns away rather than one.
			{
				id: 'left',
				type: 'card',
				label: 'Left',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			// What `left` is dragged onto, so an overlap is one gesture away —
			// and off both edges, so all four arrows have somewhere to go.
			{
				id: 'right',
				type: 'card',
				label: 'Right',
				position: { col: 5, row: 2, width: 2, height: 1 },
			},
			// Ends flush at column 12, so it is against the right-hand bound
			// before anything touches it.
			{
				id: 'edge',
				type: 'card',
				label: 'Edge',
				position: { col: 11, row: 1, width: 2, height: 1 },
			},
		],
		triggers: [],
	};
}

/*
 * The geometry happy-dom does not have.
 *
 * `previewMetrics` divides the schematic's `clientWidth` by its column count to
 * get a track, and happy-dom reports 0 — so `track > 0` is false, the metrics
 * come back null, and `beginDrag` returns before its first line of arithmetic.
 * That is the whole reason `layout-editor.test.ts` had no pointer case before
 * this was written, and it is the enabling step rather than a detail.
 *
 * **Here, and not in `pointer.ts`.** That module's header is explicit that
 * what it holds is the event *shape* every control is driven by, and a grid's
 * track width is not that: the schematic is the only surface in the plugin a
 * pointer lands on by grid cell. It lived in `layout-editor.test.ts` on §1's
 * one-consumer rule, which said it would move when a second file needed it —
 * and two do now, `schematic-gestures.test.ts` for the drag and
 * `layout-editor.test.ts` for the nudge and undo cases that drag too.
 *
 * Only `clientWidth` is faked. Everything else `previewMetrics` reads resolves
 * to nothing under happy-dom and falls back deliberately: the gaps and the
 * padding to 0, `getBoundingClientRect` to the origin, and `grid-auto-rows` to
 * the 44 the module itself names. So `ROW` is that fallback read back rather
 * than a number chosen here, and a column is exactly `TRACK` wide with the grid
 * starting at the viewport origin.
 *
 * **What that leaves undriven, and why it is left.** `previewMetrics` reads the
 * gaps and the padding so that a theme moving either moves the drop targets with
 * it, and no case in `schematic-gestures.test.ts` holds it to that. Half of it
 * cannot be held: `left` and `top` are a uniform offset and every gesture those
 * cases drive is a *delta* from where the
 * block was picked up, so the offset cancels and no drag can observe it. The
 * other half — the gap coming out of the track width — is observable, but only
 * at coordinates picked to straddle a cell boundary, since a gap-blind track is
 * `W / n` against a gap-aware `(W + gap) / n` and the two agree almost
 * everywhere. A case built on that would fail more readily over its own
 * coordinates than over the code, which is why the padding and the gap are 0
 * here and this paragraph is the record instead.
 */
export const TRACK = 10;

export const ROW = 44;

/** Give a schematic a measurable width: `columns` tracks of `TRACK` px. */
export function measure(el: HTMLElement, columns = 12): HTMLElement {
	Object.defineProperty(el, 'clientWidth', {
		value: columns * TRACK,
		configurable: true,
	});
	return el;
}

/**
 * The sheet's own canvas grid, measured so a pointer can land on a cell of
 * it.
 *
 * `.sheetsmith-editor-canvas .sheetsmith-grid` rather than the interim
 * schematic's `.sheetsmith-layout-preview`: the canvas renders the layout's
 * real components on the sheet's own grid class
 * (`docs/features/grid-canvas.md`), and that grid element is exactly what
 * `previewMetrics` reads geometry off.
 */
export function sheetGrid(harness: Harness, columns = 12): HTMLElement {
	const el = harness.container.querySelector(
		'.sheetsmith-editor-canvas .sheetsmith-grid',
	);
	if (!el) throw new Error('no canvas grid');
	return measure(el as HTMLElement, columns);
}

/** The middle of grid cell (col, row), in client coordinates. */
export function at(col: number, row: number): PointerEventInit {
	return {
		clientX: (col - 1) * TRACK + TRACK / 2,
		clientY: (row - 1) * ROW + ROW / 2,
	};
}

/**
 * Run the pointer to the middle of a grid cell.
 *
 * Dispatched directly rather than through `src/test/pointer.ts`, which is
 * exactly where that module's header puts it: a `pointermove` is only ever part
 * of a drag, and a drag chooses its own coordinates. `pointer-gestures.test.ts`
 * scans for the down and the up, and both of those do go through it.
 */
export function dragTo(cell: HTMLElement, col: number, row: number): void {
	cell.dispatchEvent(
		new PointerEvent('pointermove', { pointerId: 1, ...at(col, row) }),
	);
}

/** What a block's cell says it is: `describeCell`, as a reader hears it. */
export function reads(harness: Harness, id: string): string {
	return control(harness, `preview-${id}`).getAttribute('aria-label') ?? '';
}

/** A block's position as the layout file holds it. */
export async function position(
	harness: Harness,
	id: string,
): Promise<GridPosition> {
	const found = (await harness.stored()).components.find(
		(component) => component.id === id,
	);
	if (!found) throw new Error(`no "${id}" in the stored layout`);
	return found.position;
}

/**
 * A schematic with a real two-row-tall component sharing space with a
 * one-row one.
 *
 * `schematic()`'s own three blocks (`left`, `right`, `edge`) are all
 * `height: 1` — a dozen other tests key off their exact placements, so
 * reshaping one of them risks every test that drags onto or clamps against
 * it rather than proving anything new here. `docs/features/grid-canvas.md`'s
 * "canvas gestures" criterion asks for a fixture where a multi-row component
 * genuinely shares a schematic with a one-row one, so this is its own small
 * fixture rather than a `schematic()` edit: `tall` spans two real grid rows,
 * `short` is one row directly beneath it, and `left` is what the row-boundary
 * tests in `schematic-gestures.test.ts` drag down across the boundary between
 * them.
 *
 * **`right` is `schematic()`'s own block, unchanged, at the same place.** The
 * spec's own "all four" line does not stop at the row-boundary drag — the
 * plain drag, resize, Escape and keyboard-nudge proofs are asked to run
 * against a fixture with a real multi-row component in it too, and the
 * cheapest way to give them that without rewriting their own numbers is a
 * component here they already know. `tall`/`short` move to a column of their
 * own to make room, which no case depends on: the row-boundary tests
 * only ever read `left`'s column off a fixed pointer X, never `tall`'s.
 */
export function unevenSchematic(): Layout {
	return {
		name: 'Uneven gesture sheet',
		columns: 12,
		components: [
			// Dragged across the row boundary by `schematic-gestures.test.ts` —
			// starts level with `tall`.
			{
				id: 'left',
				type: 'card',
				label: 'Left',
				position: { col: 1, row: 1, width: 2, height: 1 },
			},
			// `schematic()`'s own `right`, same place — what the nudge tests
			// in `layout-editor.test.ts` drag and step, now sharing a schematic with a real
			// multi-row component rather than only ever `height: 1` siblings.
			{
				id: 'right',
				type: 'card',
				label: 'Right',
				position: { col: 5, row: 2, width: 2, height: 1 },
			},
			// Two rows tall — the real multi-row placement the row-boundary drag
			// crosses, moved off `right`'s columns so the two never overlap.
			{
				id: 'tall',
				type: 'card',
				label: 'Tall',
				position: { col: 9, row: 1, width: 2, height: 2 },
			},
			// One row, directly under `tall` — the one-row component's band
			// the row-boundary drag lands in once it passes `tall`'s own two rows.
			{
				id: 'short',
				type: 'card',
				label: 'Short',
				position: { col: 9, row: 3, width: 2, height: 1 },
			},
		],
		triggers: [],
	};
}

/** Undo, and let the write and the redraw it triggers settle. */
export async function undo(harness: Harness): Promise<boolean> {
	const result = harness.pane.undo();
	await tick();
	return result;
}

/** Redo, and let the write and the redraw it triggers settle. */
export async function redo(harness: Harness): Promise<boolean> {
	const result = harness.pane.redo();
	await tick();
	return result;
}

/** The panel's own heading, for asserting on what is selected. */
export function panelHeading(harness: Harness): string | null | undefined {
	return harness.container
		.querySelector('.sheetsmith-editor-panel')
		?.querySelector('.setting-item-heading')?.textContent;
}
