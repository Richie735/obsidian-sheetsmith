/*
 * Renders the plugin's real layout editor pane — where a sheet is actually
 * designed — outside Obsidian.
 *
 * The view is the genuine `LayoutEditorView` in a genuine leaf, so what appears
 * is the frame a user works in: the leaf's own box, its header, and the pane's
 * two columns inside it. Editing here writes the real serialised JSON back into
 * the stub vault, and the callback re-renders the sheet from it — which closes
 * the loop the two surfaces have in the app and nowhere else: change a
 * component's config, watch the card change.
 */

import { App } from '../src/test/obsidian-stub';
import { openView } from '../src/test/workspace';
import { LayoutEditorView } from '../src/view/layout-editor-view';
import { Layout } from '../src/parse/layout';
import { fakePlugin } from '../src/test/plugin';
import { LayoutSource, plantLayout, watchLayoutFile } from './stub-app';

/** Which of the pane's own controls a view wants driven. */
export interface PaneView {
	/**
	 * A component id whose settings to open — a Table's rows and columns lists
	 * are most of what the layout editor is, and a screenshot has no way to
	 * click. The layout's own settings are `::sheet::`, which is the selection's
	 * word for the top level.
	 */
	open?: string;
	/** An **Add component** option to select, as a type id or `<type>:<index>`. */
	choice?: string;
	/**
	 * `<id>:<dx>,<dy>` — drag that component's own resize corner by `(dx,
	 * dy)` pixels and leave the gesture mid-flight rather than releasing. A
	 * still cannot drag, and the grid canvas's own reflow-during-resize
	 * criterion (`docs/features/grid-canvas.md` §3, §7) has no other way to
	 * be photographed: the live component genuinely reflows, in a real
	 * browser, because this dispatches the same `pointerdown`/`pointermove`
	 * pair a real drag would rather than assigning an end state.
	 */
	resize?: string;
	/**
	 * The **Sample values** toggle, pressed to this state
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * A pane opens with it on, so `false` is the only value that does
	 * anything — and it is what makes the empty canvas photographable at all
	 * now that the filled one is the default. Driven through the control's own
	 * `change`, for the reason `setSamples` below measures out.
	 */
	samples?: boolean;
	/**
	 * `<fromId>:<toId>` — drag `fromId`'s tree row onto `toId`'s and leave
	 * it hovering, showing the valid-drop highlight if the drop would
	 * succeed. Never completes the drop.
	 */
	treeHover?: string;
	/**
	 * `<fromId>:<toId>` — the same drag, completed. For a refused pair this
	 * is what leaves the inline message on screen; for a valid one it is
	 * what `shot.mjs`'s `canvas-tree-drag-complete` drives to show the
	 * component actually landed at its new container's first free row —
	 * nothing else here exercises a released, valid drop.
	 */
	treeDrop?: string;
}

export interface PaneHost {
	/** Called whenever the editor saves, with the layout as it now stands. */
	onLayoutChange: (layout: Layout) => void;
}

export async function renderEditorPane(
	container: HTMLElement,
	host: PaneHost,
	/**
	 * The layout to put in the stub vault, so both surfaces read one — or
	 * `'none'` or `'broken'`, which are the two states the editor draws instead
	 * of a tree and which have no other way of being reached here.
	 */
	layout: LayoutSource,
	/**
	 * Which of the pane's own controls to drive once it has drawn, for the views
	 * that live inside one. Every one of these presses the control a user would
	 * press rather than reaching into the view's state, so the harness stays a
	 * page that clicks buttons.
	 */
	view: PaneView = {},
): Promise<void> {
	const app = new App();
	watchLayoutFile(app.vault, host.onLayoutChange);
	await plantLayout(app, layout);

	const pane = await openView(
		app,
		container,
		LayoutEditorView,
		fakePlugin(app),
	);
	if (view.open !== undefined) await select(pane.contentEl, view.open);
	if (view.choice !== undefined) await chooseAdd(pane.contentEl, view.choice);
	if (view.samples !== undefined) await setSamples(pane.contentEl, view.samples);
	// `resize` is deliberately not driven here: it reads real geometry
	// (`getBoundingClientRect`), and `container` has not been attached to
	// the visible document by the caller yet at this point — every rect on
	// it reads zero. `driveResize` below is `harness.ts`'s to call once its
	// own `draw()` has appended the pane, which `select` and `chooseAdd`
	// never needed because a synthetic `click`/`change` dispatches
	// correctly whether or not the element is on screen.
	if (view.treeHover !== undefined) {
		await dragTreeRow(pane.contentEl, view.treeHover, false);
	}
	if (view.treeDrop !== undefined) {
		await dragTreeRow(pane.contentEl, view.treeDrop, true);
	}
}

/**
 * Drive `view.resize` against an already-attached pane. Exported
 * separately from `renderEditorPane` for the reason named above it: a
 * resize gesture needs the pane's own real layout, which only exists once
 * the caller has put it on screen.
 */
export async function driveResize(pane: HTMLElement, spec: string): Promise<void> {
	await resizeInPlace(pane, spec);
}

/**
 * Wait for one of the pane's controls to exist, by its focus token.
 *
 * A view's first render starts asynchronously and nothing it draws exists when
 * `openView` resolves — hence the wait rather than a straight query. The token is
 * the address because the editor already gives every control one, to restore
 * focus across its own rebuilds.
 */
async function control(
	root: HTMLElement,
	token: string,
): Promise<HTMLElement | null> {
	const selector = `[data-sheetsmith-focus="${token}"]`;
	for (let attempt = 0; attempt < 40; attempt++) {
		const el = root.querySelector(selector);
		if (el instanceof HTMLElement) return el;
		await new Promise((resolve) => window.setTimeout(resolve, 25));
	}
	return null;
}

/** Press a tree row's name, which is what selects it. */
async function select(root: HTMLElement, id: string): Promise<void> {
	const row = await control(root, `edit-${id}`);
	if (row === null) {
		console.warn(`No "${id}" in the tree to select.`);
		return;
	}
	row.click();
}

/**
 * Press the **Sample values** toggle to a state.
 *
 * The token is on the container `Setting.addToggle` builds, which is where the
 * pane's other booleans carry theirs, so the input inside it is what takes the
 * press. Already in the wanted state is a no-op rather than a second press,
 * which would put the canvas back where it started.
 *
 * **Set and dispatched rather than clicked, and `box.click()` was tried and
 * measured.** It flips `checked` and fires nothing: this runs before
 * `harness.ts` has appended the pane to the document — the same window
 * `driveResize` is deferred out of — and Chrome skips a detached input's own
 * `input` and `change` events. The click therefore left the checkbox unticked,
 * the row still `is-enabled` and the canvas still filled, which is worse than
 * not pressing at all, since the control would then disagree with what it
 * governs. So this dispatches the event the app listens for, exactly as
 * `chooseAdd` above does for a `<select>`, and the sentence claiming a press
 * went with the attempt.
 */
async function setSamples(root: HTMLElement, on: boolean): Promise<void> {
	const row = await control(root, 'sample-values');
	const box = row?.querySelector('input[type="checkbox"]');
	if (!(box instanceof HTMLInputElement)) {
		console.warn('No sample values toggle in the pane.');
		return;
	}
	if (box.checked === on) return;
	box.checked = on;
	box.dispatchEvent(new Event('change'));
}

/**
 * Select one option of the **Add component** menu.
 *
 * Without this the menu can only ever be shot on its first option, which is a
 * bare type — so a palette entry's description, the line that says what the
 * prefill is *for*, was unreachable to any still. A native `<select>` shows only
 * its selection, so the indent still needs a hand on the mouse; the description
 * does not.
 */
async function chooseAdd(root: HTMLElement, value: string): Promise<void> {
	const menu = await control(root, 'add-choice');
	if (!(menu instanceof HTMLSelectElement)) {
		console.warn('No add menu in the pane.');
		return;
	}
	if (!Array.from(menu.options).some((option) => option.value === value)) {
		console.warn(`No add choice "${value}". Try a type id, or "<type>:<index>".`);
		return;
	}
	menu.value = value;
	menu.dispatchEvent(new Event('change'));
}

/**
 * Drag a component's own resize corner by `(dx, dy)` pixels, in `"<id>:<dx>,
 * <dy>"` form, and leave the gesture mid-flight rather than releasing.
 *
 * A real pointer gesture rather than a static end state, so the live
 * component genuinely reflows under a real browser's own layout — the whole
 * point of the shot this drives (`docs/features/grid-canvas.md` §3, §7).
 * `pointerId: 1` throughout, matching `src/test/pointer.ts`'s own
 * convention, so `setPointerCapture` is asked to capture the same pointer
 * every event in the sequence claims to be.
 */
async function resizeInPlace(root: HTMLElement, spec: string): Promise<void> {
	const [id, delta] = spec.split(':');
	const [rawX, rawY] = (delta ?? '').split(',');
	const dx = Number(rawX);
	const dy = Number(rawY);
	if (!id || !Number.isFinite(dx) || !Number.isFinite(dy)) {
		console.warn(`Bad resize spec "${spec}"; want "<id>:<dx>,<dy>".`);
		return;
	}
	const overlay = await control(root, `preview-${id}`);
	const handle = overlay?.querySelector('.sheetsmith-preview-resize');
	if (!handle) {
		console.warn(`No resize handle on "${id}".`);
		return;
	}
	// The real stylesheet may still be loading when this runs — under
	// Chrome's headless virtual-time clock a script can run several
	// simulated seconds ahead of a `<link>`'s own load event, which leaves
	// every rect zero. `position: absolute` only ever comes from
	// `styles.css`, so waiting for it is waiting for the sheet itself.
	for (let attempt = 0; attempt < 40; attempt++) {
		if (window.getComputedStyle(handle).position === 'absolute') break;
		await new Promise((resolve) => window.setTimeout(resolve, 25));
	}
	const box = handle.getBoundingClientRect();
	const startX = box.left + box.width / 2;
	const startY = box.top + box.height / 2;
	handle.dispatchEvent(
		new PointerEvent('pointerdown', {
			pointerId: 1,
			button: 0,
			clientX: startX,
			clientY: startY,
			bubbles: true,
			cancelable: true,
		}),
	);
	overlay?.dispatchEvent(
		new PointerEvent('pointermove', {
			pointerId: 1,
			clientX: startX + dx,
			clientY: startY + dy,
			bubbles: true,
		}),
	);
}

/**
 * Drag `fromId`'s tree row onto `toId`'s, and either leave it hovering
 * (`complete: false`) or complete the drop (`complete: true`).
 *
 * `tree.ts`'s own drag reads a component id off a shared cursor rather than
 * off the event's `DataTransfer`, so a plain `Event` answers exactly as a
 * real `DragEvent` would — nothing here needs a native drag session. The
 * drag itself starts on the row's own handle (`bindDragSource`'s drag
 * source, `list-fields.ts`'s own split), never the row: the row is only ever
 * a drop target.
 */
async function dragTreeRow(
	root: HTMLElement,
	spec: string,
	complete: boolean,
): Promise<void> {
	const [fromId, toId] = spec.split(':');
	if (!fromId || !toId) {
		console.warn(`Bad tree-drag spec "${spec}"; want "<fromId>:<toId>".`);
		return;
	}
	const from = await control(root, `tree-handle-${fromId}`);
	const to = await control(root, `edit-${toId}`);
	if (!from || !to) {
		console.warn(`No tree row for "${fromId}" or "${toId}".`);
		return;
	}
	const toRow = to.closest('.setting-item') ?? to;
	from.dispatchEvent(new Event('dragstart', { bubbles: true }));
	toRow.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
	if (complete) {
		toRow.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
		from.dispatchEvent(new Event('dragend', { bubbles: true }));
	}
}
