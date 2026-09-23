/*
 * The layout editor's tree: the layout itself, then every component it
 * holds, one row each, selectable and movable.
 *
 * Split out of `layout-editor.ts` on `config-panel.ts`'s own precedent: a
 * module in `editor/` named for the region it draws, parameterised over a
 * small host interface so the editor's own structure — the file, the
 * picker, the canvas — stays out of reach.
 *
 * **What a row carries** (`docs/features/layout-editor-tree.md`): its name, a
 * drag handle and a menu. Dragging a row onto a container row
 * moves the dragged component into it (`docs/features/grid-canvas.md` §5), and
 * dragging it onto a sibling within its own current parent reorders it there.
 * The menu holds the keyboard-operable equivalents of both — up and down,
 * into the previous sibling container and out to the grandparent — plus
 * **Remove**, and the same four moves are Alt+arrow chords on the row's name
 * button. `tree-moves.ts` decides all four, once, for both routes, and asks
 * `reparent.ts`'s `canReparent` before any of them writes; a refusal is shown
 * in place rather than the gesture being silently ignored.
 */

import { Setting, setIcon } from 'obsidian';
import { holdsChildren } from './accepts-children';
import { moveItem } from './list-fields';
import { placedComponentName } from './component-name';
import { canReparent, reparent } from './reparent';
import {
	chordMove,
	MOVE_SHORTCUTS,
	moveHint,
	openRowMenu,
	rowMoves,
	treeListContext,
} from './tree-moves';
import { Layout } from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { ComponentConfig } from '../types';
import { innerPlacement } from '../view/grid-cells';

/**
 * The top level, wherever something has to be named that is not a component.
 *
 * Defined here rather than in `layout-editor.ts`, which re-exports it: two
 * jobs share one spelling — the component picker's destination for "on the
 * sheet", and what the selection holds while the panel configures the
 * layout itself — and `layout-editor.ts` already imports `renderTree` from
 * here, so declaring the constant there and importing it back would be a
 * cycle of two runtime values rather than one type-only edge.
 */
export const SHEET_DESTINATION = '::sheet::';

/**
 * What the tree needs from the editor drawing it. The same shape
 * `SchematicHost` and `ConfigPanelHost` already are: a handful of commands
 * plus the one shared, mutable cursor a drag needs to survive between the row
 * it started on and the row it ends on.
 */
export interface TreeHost {
	/** Write the layout now. */
	persist(): void;
	/** Rebuild both regions from the layout as it now stands. */
	redraw(): void;
	/** Select a component, or the layout itself, and rebuild both regions. */
	select(id: string): void;
	readonly selection: string;
	/** Focus this token once the next redraw has happened. */
	focusAfterRedraw(token: string): void;
	/**
	 * Write a removal, then say what it did with an offer to take it back.
	 *
	 * One member rather than `persist` and a notice, because whether the offer
	 * may be made depends on the write: only the host knows the bytes the
	 * removal left on disk, and an undo pressed after something else changed
	 * them would take that change with it.
	 */
	persistRemoval(sentence: string): void;
	/**
	 * The component id mid-drag, shared across every row so a drag started on
	 * one row is read by whichever row the pointer is over, not only the one
	 * it started on.
	 */
	drag: { id: string | null };
}

/**
 * What a removal did, said after the fact (`docs/features/layout-editor-tree.md`
 * §5), which is where the confirmation it replaces used to say it before.
 *
 * **The section sentence only where there is a section.** A container stores
 * nothing in a note (`storage: 'none'`), so a removed container has no section
 * for character notes to keep, and saying they keep one would be the one false
 * sentence in the notice. What a container's removal does say is where its
 * children went, which is the half an author is most likely to go looking for.
 */
function removalSentence(config: ComponentConfig, held: number): string {
	const removed = `Removed "${config.label}".`;
	if (held === 1) {
		return `${removed} The component inside it moved to the bottom of the sheet.`;
	}
	if (held > 1) {
		return `${removed} The ${held} components inside it moved to the bottom of the sheet.`;
	}
	if (holdsChildren(config)) return removed;
	return `${removed} Character notes keep its section.`;
}

/**
 * The first row nothing occupies at the bottom of `components`, for a child
 * promoted out of a removed container and for a freshly added component
 * alike — exported since more than one caller outside this file needs the
 * same answer: `layout-editor.ts`'s own add row, and `reparent.ts`'s
 * `reparent()`, which asks it of whichever list a cross-container move's
 * destination is, so the moved component lands below whatever is already
 * there rather than on top of it.
 */
export function nextFreeRow(components: ComponentConfig[]): number {
	let next = 1;
	for (const component of components) {
		next = Math.max(next, component.position.row + component.position.height);
	}
	return next;
}

/**
 * Show, or clear, a refused move's reason under the row it was refused on — a
 * drop, or a chord.
 *
 * Its own small mechanism rather than `field-error.ts`'s: that one is keyed
 * to an input, a select or a textarea, and a tree row's name is a `<button>`
 * inside a `Setting`, addressing a different shape for the same policy — a
 * refusal is never silently swallowed (`docs/PATTERNS.md` §4). Transient
 * rather than remembered across a rebuild: nothing about a refused move
 * writes the layout, so nothing triggers the rebuild that would need to
 * replay it, and the message stays in place until something else does.
 *
 * **`role="alert"`**, because a chord's refusal is the one case where the
 * reader may not be looking: a key pressed with the focus on the name has no
 * other effect, so the sentence is the whole of the answer, and an alert is
 * announced as it is inserted where a status region inserted with its text
 * often is not (`docs/UI.md` §6, "announce what is not visible").
 */
function showMoveError(row: Setting, message: string | null): void {
	const existing = row.settingEl.querySelector('.sheetsmith-field-error');
	if (message === null) {
		existing?.remove();
		return;
	}
	if (existing) {
		existing.setText(message);
		return;
	}
	row.settingEl.createDiv(
		{ cls: 'sheetsmith-field-error', attr: { role: 'alert' } },
		(el) => el.setText(message),
	);
}

/**
 * The layout, then everything in it, in the depth-first walk the sheet reads
 * in — the pane's complete table of contents.
 *
 * The first row is the layout itself, selectable exactly as a component row
 * is, which is what keeps the panel needing no chrome of its own. No
 * disclosure control: a container's children are always listed, and the
 * indent and the rule down its left say what holds what.
 */
export function renderTree(
	outline: HTMLElement,
	layout: Layout,
	host: TreeHost,
): void {
	const walk = walkComponents(layout.components);
	const byConfig = new Map(walk.map((entry) => [entry.config, entry]));
	renderLayoutRow(outline, layout, host);
	for (const entry of walk) {
		renderComponentRow(outline, entry, { layout, byConfig, host });
	}
}

/** What every row of one render reads, passed down rather than recomputed. */
interface TreeRender {
	layout: Layout;
	byConfig: Map<ComponentConfig, WalkEntry>;
	host: TreeHost;
}

/** The layout's own row: no drag, no menu, no chord — just a drop target. */
function renderLayoutRow(
	outline: HTMLElement,
	layout: Layout,
	host: TreeHost,
): void {
	const row = renderRow(
		outline,
		SHEET_DESTINATION,
		'Layout',
		'The grid, the function library, the reset triggers and the bonus types.',
		0,
		host,
	);
	bindDropTarget(row, layout, null, host);
}

function renderComponentRow(
	into: HTMLElement,
	entry: WalkEntry,
	tree: TreeRender,
): void {
	const { layout, host } = tree;
	const { config, depth } = entry;
	const row = renderRow(
		into,
		config.id,
		config.label,
		placedComponentName(config),
		depth,
		host,
	);

	bindDragSource(row, config, host);
	bindDropTarget(row, layout, config, host);

	const moves = rowMoves(
		layout,
		entry,
		(of) => tree.byConfig.get(of),
		host,
	);

	const name = row.nameEl.querySelector('.sheetsmith-tree-name');
	if (name?.instanceOf(HTMLElement)) {
		// Declared twice (`docs/features/layout-editor-tree.md` §6): the attribute
		// for assistive tech, and the `title` for a pointer, which adds the hint
		// to the visible name rather than replacing it (`docs/UI.md` §6).
		name.setAttribute('aria-keyshortcuts', MOVE_SHORTCUTS);
		name.setAttribute('title', `${config.label}\n${moveHint()}`);
		// On the name button and nowhere else: the handle and the menu button
		// each have arrow keys of their own, or the menu's.
		name.addEventListener('keydown', (event) => {
			const move = chordMove(event, moves);
			if (move === null) return;
			event.preventDefault();
			if (move.refusal !== null) {
				showMoveError(row, move.refusal);
				return;
			}
			move.run();
		});
	}

	const menuButton = row.controlEl.createEl('button', {
		cls: 'clickable-icon sheetsmith-tree-menu',
		attr: {
			'aria-label': `More options for "${config.label}"`,
			'aria-haspopup': 'menu',
		},
	});
	setIcon(menuButton, 'ellipsis-vertical');
	menuButton.dataset.sheetsmithFocus = `tree-menu-${config.id}`;
	menuButton.addEventListener('click', (event) => {
		openRowMenu(menuButton, event, moves, () => removeComponent(entry, tree));
	});
}

/**
 * Remove a component, keeping what it held, and say so after rather than
 * asking before (`docs/features/layout-editor-tree.md` §5). The notice carries
 * an **Undo** the host guards against a stale press, and undo also reaches
 * this one step through the palette.
 *
 * Focus goes to the layout's own row, which is where the selection goes: the
 * row that was focused, and the menu that ran this, are both gone, and a
 * keyboard reader left on the body would have to find the tree again.
 */
function removeComponent(entry: WalkEntry, tree: TreeRender): void {
	const { layout, host } = tree;
	const { config, siblings } = entry;
	const held = config.children ?? [];
	siblings.splice(siblings.indexOf(config), 1);
	// Children move out rather than going with it, the same promise a reparent
	// keeps (Constraint 4).
	for (const child of held) {
		// A child of a container that shows one at a time (a tab) was never sized
		// by its own stored width/height — `innerPlacement` drew it at the
		// container's own size instead, so its stored numbers were free to go
		// stale while nested (`view/grid-cells.ts`'s own comment on
		// `innerPlacement`). Promoting the child makes its own position
		// authoritative again, so it has to inherit the size it was actually drawn
		// at first, or its own children — never touched by this loop — land
		// outside the box that now governs them.
		const { width, height } = innerPlacement(child, config);
		child.position.width = width;
		child.position.height = height;
		child.position.col = 1;
		child.position.row = nextFreeRow(layout.components);
		layout.components.push(child);
	}
	host.persistRemoval(removalSentence(config, held.length));
	host.focusAfterRedraw(`edit-${SHEET_DESTINATION}`);
	if (host.selection !== SHEET_DESTINATION) host.select(SHEET_DESTINATION);
	else host.redraw();
}

/**
 * One row of the tree: a name that selects.
 *
 * A button in the row's name rather than a click handler on the row alone,
 * so it gets a tab stop, a focus ring and Enter for free. The row itself is
 * *also* a click target, per `docs/PATTERNS.md` §6 ("the whole card is the
 * hit target") — a row with an icon column and a description line reads as
 * dead everywhere but the name text without it. Real controls still own their
 * own presses, guarded the same way `passport.ts`'s card line already guards
 * its: `closest('button, input, select, textarea')` excludes the name button
 * itself (which keeps its own listener below), the drag handle and the menu
 * button.
 */
function renderRow(
	into: HTMLElement,
	id: string,
	name: string,
	description: string,
	depth: number,
	host: TreeHost,
): Setting {
	const selected = host.selection === id;
	const row = new Setting(into).setDesc(description);
	// Every row can end up showing a refused move's reason (`showMoveError`),
	// a third flex child appended after the controls — `.sheetsmith-wrapping-row`
	// is what lets that line wrap onto its own row instead of squeezing the
	// name and the icon controls sideways (docs/UI.md §9), the same
	// treatment `describedRow` gives a row's own extra line.
	row.settingEl.addClass('sheetsmith-wrapping-row', 'sheetsmith-tree-row');
	// One class for the row and for the canvas overlay, so the two paints
	// cannot disagree about what is selected.
	if (selected) row.settingEl.addClass('sheetsmith-preview-editing');
	if (depth > 0) {
		row.settingEl.addClass('sheetsmith-row-child');
		row.settingEl.style.setProperty('--sheetsmith-row-depth', String(depth));
	}
	const button = row.nameEl.createEl('button', {
		cls: 'sheetsmith-tree-name',
		text: name,
	});
	button.dataset.sheetsmithFocus = `edit-${id}`;
	if (selected) button.setAttribute('aria-current', 'true');
	button.addEventListener('click', () => host.select(id));
	row.settingEl.addEventListener('click', (event) => {
		const target = event.target as HTMLElement | null;
		if (target?.closest('button, input, select, textarea') !== null) return;
		host.select(id);
	});
	return row;
}

/**
 * A row is a drag source when it names a real component — through a
 * dedicated handle, not the row itself.
 *
 * `list-fields.ts`'s own `sheetsmith-entry-handle` is the precedent: a row
 * holding a name button and a menu button makes a whole-row
 * `draggable` a worse fit than it would be for a plainer row, because every
 * one of those controls sits inside the draggable area and becomes a drag
 * candidate the instant a press moves before it lifts. The handle keeps the
 * row's other controls exactly what they look like: plain buttons, never
 * competing with a drag gesture for the same pointer-down.
 */
function bindDragSource(
	row: Setting,
	config: ComponentConfig,
	host: TreeHost,
): void {
	// Created before the menu button, so it lands first among the row's
	// controls — the same lead position list-fields.ts's own handle takes.
	const handle = row.controlEl.createEl('button', {
		cls: 'clickable-icon sheetsmith-entry-handle',
		attr: {
			'aria-label': `Reorder "${config.label}": drag`,
			draggable: 'true',
		},
	});
	setIcon(handle, 'grip-vertical');
	handle.dataset.sheetsmithFocus = `tree-handle-${config.id}`;
	handle.addEventListener('dragstart', (event) => {
		host.drag.id = config.id;
		event.dataTransfer?.setData('text/plain', config.label);
	});
	handle.addEventListener('dragend', () => {
		host.drag.id = null;
	});
}

/**
 * What dropping onto a row would do: move the dragged component into a
 * container row, reorder it beside a sibling row, or refuse the drop and say
 * why.
 */
type DropResolution =
	| { kind: 'into' }
	| { kind: 'reorder' }
	| { kind: 'refused'; error: string };

/**
 * What dropping `dragged` on `target`'s row means, and whether it is allowed.
 *
 * A container row that can hold `dragged` means "move into me"; any other
 * row that shares `dragged`'s own current parent means "reorder beside me" —
 * `list-fields.ts`'s `moveItem` semantics, since both are already in the
 * same list and nothing about containment changes. Anything else is refused
 * and says why (`reparent.ts`'s own message, or a plain one for a row that
 * is neither).
 */
function resolveDrop(
	layout: Layout,
	dragged: ComponentConfig,
	target: ComponentConfig | null,
): DropResolution {
	if (target === dragged) {
		return { kind: 'refused', error: 'A row cannot be dropped on itself.' };
	}
	const containerCheck = canReparent(layout, dragged, target);
	// A container row — the sheet's own included — only ever means "move
	// into me": refused here stays refused, and is never silently
	// reinterpreted as a reorder just because dragged and target happen to
	// share a parent already.
	if (target === null || holdsChildren(target)) {
		return 'ok' in containerCheck
			? { kind: 'into' }
			: { kind: 'refused', error: containerCheck.error };
	}
	const walk = walkComponents(layout.components);
	const draggedParent = walk.find((entry) => entry.config === dragged)?.parent;
	const targetParent = walk.find((entry) => entry.config === target)?.parent;
	if (draggedParent === targetParent) return { kind: 'reorder' };
	return {
		kind: 'refused',
		error:
			'error' in containerCheck
				? containerCheck.error
				: 'This cannot be moved there.',
	};
}

/**
 * A row is a drop target whatever it names — a component, or the layout
 * itself for the top level.
 */
function bindDropTarget(
	row: Setting,
	layout: Layout,
	target: ComponentConfig | null,
	host: TreeHost,
): void {
	row.settingEl.addEventListener('dragover', (event) => {
		const draggedId = host.drag.id;
		if (draggedId === null) return;
		const dragged = findComponent(layout, draggedId);
		if (!dragged) return;
		if (resolveDrop(layout, dragged, target).kind === 'refused') return;
		event.preventDefault();
		row.settingEl.addClass('sheetsmith-tree-drop-valid');
	});
	row.settingEl.addEventListener('dragleave', () => {
		row.settingEl.removeClass('sheetsmith-tree-drop-valid');
	});
	row.settingEl.addEventListener('drop', (event) => {
		event.preventDefault();
		row.settingEl.removeClass('sheetsmith-tree-drop-valid');
		const draggedId = host.drag.id;
		host.drag.id = null;
		if (draggedId === null) return;
		const dragged = findComponent(layout, draggedId);
		if (!dragged) return;
		const resolution = resolveDrop(layout, dragged, target);
		if (resolution.kind === 'refused') {
			showMoveError(row, resolution.error);
			return;
		}
		showMoveError(row, null);
		if (resolution.kind === 'into') {
			reparent(layout, dragged, target);
			host.persist();
			host.redraw();
		} else {
			reorderBeside(layout, dragged, target as ComponentConfig, host);
		}
	});
}

/**
 * Move `dragged` to sit at `target`'s own position within their shared list —
 * `list-fields.ts`'s own `moveItem`, which persists and redraws itself.
 */
function reorderBeside(
	layout: Layout,
	dragged: ComponentConfig,
	target: ComponentConfig,
	host: TreeHost,
): void {
	const walk = walkComponents(layout.components);
	const entry = walk.find((candidate) => candidate.config === dragged);
	if (!entry) return;
	const siblings = entry.siblings;
	const from = siblings.indexOf(dragged);
	const to = siblings.indexOf(target);
	if (from === -1 || to === -1) return;
	moveItem(siblings, from, to, treeListContext(host));
}

function findComponent(layout: Layout, id: string): ComponentConfig | null {
	return walkComponents(layout.components).find((entry) => entry.config.id === id)
		?.config ?? null;
}
