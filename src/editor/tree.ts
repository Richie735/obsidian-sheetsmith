/*
 * The layout editor's tree: the layout itself, then every component it
 * holds, one row each, selectable and reorderable.
 *
 * Split out of `layout-editor.ts` on `config-panel.ts`'s own precedent: a
 * module in `editor/` named for the region it draws, parameterised over a
 * small host interface so the editor's own structure — the file, the
 * picker, the canvas — stays out of reach.
 *
 * **What this adds over the tree that already existed**: dragging a row onto
 * a container row moves the dragged component into it
 * (`docs/features/grid-canvas.md` §5), dragging a row onto a sibling within
 * its own current parent reorders it there, and every row carries a
 * keyboard-operable equivalent of both — up/down, reusing `moveItem`, and
 * indent/outdent, reparenting into the previous sibling container or out to
 * the grandparent. `reparent.ts`'s `canReparent` is asked before any of the
 * four writes anything, and a refusal is shown in place rather than the drag
 * being silently ignored.
 */

import { Setting, setIcon } from 'obsidian';
import { getComponent } from '../components';
import { moveItem } from './list-fields';
import { placedComponentName } from './component-name';
import { canReparent, reparent } from './reparent';
import { Layout } from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { ComponentConfig, isContainer } from '../types';

/**
 * The top level, wherever something has to be named that is not a component.
 *
 * Defined here rather than in `layout-editor.ts`, which re-exports it: two
 * jobs share one spelling — the **Add component** row's destination for "on
 * the sheet", and what the selection holds while the panel configures the
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
	/** Ask before something irreversible, then do it if confirmed. */
	confirm(message: string, cta: string, onConfirm: () => void): void;
	/**
	 * The component id mid-drag, shared across every row so a drag started on
	 * one row is read by whichever row the pointer is over, not only the one
	 * it started on.
	 */
	drag: { id: string | null };
}

/** What removing a component takes with it. */
function removalMessage(config: ComponentConfig, held: number): string {
	const kept = `character notes keep their "${config.label}" sections`;
	if (held === 0) {
		return `Remove "${config.label}" from the layout? Its configuration and formulas are lost, but ${kept}.`;
	}
	const inside =
		held === 1
			? 'The component inside it moves'
			: `The ${held} components inside it move`;
	return `Remove "${config.label}" from the layout? Its own configuration is lost. ${inside} to the bottom of the sheet, keeping their own configuration, and ${kept}.`;
}

/**
 * The first row nothing occupies at the bottom of `components`, for a child
 * promoted out of a removed container and for a freshly added component
 * alike — exported since `layout-editor.ts`'s own add row needs the same
 * answer.
 */
export function nextFreeRow(components: ComponentConfig[]): number {
	let next = 1;
	for (const component of components) {
		next = Math.max(next, component.position.row + component.position.height);
	}
	return next;
}

/**
 * Show, or clear, a refused drop's reason under the row the drag ended on.
 *
 * Its own small mechanism rather than `field-error.ts`'s: that one is keyed
 * to an input, a select or a textarea, and a tree row's name is a `<button>`
 * inside a `Setting`, addressing a different shape for the same policy — a
 * refusal is never silently swallowed (`docs/PATTERNS.md` §4). Transient
 * rather than remembered across a rebuild: nothing about a refused drop
 * writes the layout, so nothing triggers the rebuild that would need to
 * replay it, and the message stays in place until something else does.
 */
function showDropError(row: Setting, message: string | null): void {
	const existing = row.settingEl.querySelector('.sheetsmith-field-error');
	if (message === null) {
		existing?.remove();
		return;
	}
	if (existing) {
		existing.setText(message);
		return;
	}
	row.settingEl.createDiv('sheetsmith-field-error', (el) => el.setText(message));
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
	renderLayoutRow(outline, layout, host);
	for (const entry of walkComponents(layout.components)) {
		renderComponentRow(outline, layout, entry, host);
	}
}

/** The layout's own row: no drag, no reorder, no remove — just a drop target. */
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
	outline: HTMLElement,
	layout: Layout,
	entry: WalkEntry,
	host: TreeHost,
): void {
	const { config, depth, siblings, parent } = entry;
	const row = renderRow(
		outline,
		config.id,
		config.label,
		placedComponentName(config),
		depth,
		host,
	);

	bindDragSource(row, config, host);
	bindDropTarget(row, layout, config, host);

	const index = siblings.indexOf(config);
	row.addExtraButton((button) => {
		button
			.setIcon('arrow-up')
			.setTooltip('Move up')
			.setDisabled(index === 0)
			.onClick(() => moveItem(siblings, index, index - 1, listContext(host)));
		button.extraSettingsEl.dataset.sheetsmithFocus = `tree-up-${config.id}`;
	});
	row.addExtraButton((button) => {
		button
			.setIcon('arrow-down')
			.setTooltip('Move down')
			.setDisabled(index === siblings.length - 1)
			.onClick(() => moveItem(siblings, index, index + 1, listContext(host)));
		button.extraSettingsEl.dataset.sheetsmithFocus = `tree-down-${config.id}`;
	});

	const previousSibling = index > 0 ? siblings[index - 1] ?? null : null;
	const indentCheck =
		previousSibling !== null
			? canReparent(layout, config, previousSibling)
			: { error: 'No earlier sibling to move into.' };
	row.addExtraButton((button) => {
		button
			.setIcon('chevron-right')
			.setTooltip('Move in, into the previous row')
			.setDisabled(!('ok' in indentCheck))
			.onClick(() => {
				if (!('ok' in indentCheck) || previousSibling === null) return;
				reparent(layout, config, previousSibling);
				host.persist();
				host.redraw();
			});
		button.extraSettingsEl.dataset.sheetsmithFocus = `tree-indent-${config.id}`;
	});

	const grandparent =
		parent === null
			? undefined
			: walkComponents(layout.components).find((candidate) => candidate.config === parent)
					?.parent ?? null;
	const outdentCheck =
		grandparent !== undefined
			? canReparent(layout, config, grandparent)
			: { error: 'Already at the top level.' };
	row.addExtraButton((button) => {
		button
			.setIcon('chevron-left')
			.setTooltip('Move out, to the level above')
			.setDisabled(!('ok' in outdentCheck))
			.onClick(() => {
				if (!('ok' in outdentCheck) || grandparent === undefined) return;
				reparent(layout, config, grandparent);
				host.persist();
				host.redraw();
			});
		button.extraSettingsEl.dataset.sheetsmithFocus = `tree-outdent-${config.id}`;
	});

	row.addExtraButton((button) => {
		button
			.setIcon('trash')
			.setTooltip('Remove from layout')
			.onClick(() => {
				const held = config.children ?? [];
				host.confirm(
					removalMessage(config, held.length),
					'Remove component',
					() => {
						siblings.splice(siblings.indexOf(config), 1);
						// Children move out rather than going with it, the same
						// promise a reparent keeps (Constraint 4).
						for (const child of held) {
							child.position.col = 1;
							child.position.row = nextFreeRow(layout.components);
							layout.components.push(child);
						}
						host.select(SHEET_DESTINATION);
						host.persist();
						host.redraw();
					},
				);
			});
		button.extraSettingsEl.dataset.sheetsmithFocus = `remove-${config.id}`;
	});
}

/**
 * One row of the tree: a name that selects, at its own depth.
 *
 * A button in the row's name rather than a click handler on the row, so it
 * gets a tab stop, a focus ring and Enter for free.
 */
function renderRow(
	outline: HTMLElement,
	id: string,
	name: string,
	description: string,
	depth: number,
	host: TreeHost,
): Setting {
	const selected = host.selection === id;
	const row = new Setting(outline).setDesc(description);
	// Every row can end up showing a refused drop's reason (`showDropError`),
	// a third flex child appended after the controls — `.sheetsmith-wrapping-row`
	// is what lets that line wrap onto its own row instead of squeezing the
	// name and the icon controls sideways (docs/UI.md §9), the same
	// treatment the Add component row already gets for its own extra line.
	row.settingEl.addClass('sheetsmith-wrapping-row');
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
	return row;
}

/**
 * A row is a drag source when it names a real component — through a
 * dedicated handle, not the row itself.
 *
 * `list-fields.ts`'s own `sheetsmith-entry-handle` is the precedent: a row
 * this crowded — a name button plus four reorder/remove icons — makes a
 * whole-row `draggable` a worse fit than it would be for a plainer row,
 * because every one of those controls sits inside the draggable area and
 * becomes a drag candidate the instant a press moves before it lifts. The
 * handle keeps the row's other controls exactly what they look like: plain
 * buttons, never competing with a drag gesture for the same pointer-down.
 */
function bindDragSource(
	row: Setting,
	config: ComponentConfig,
	host: TreeHost,
): void {
	// Created before `renderComponentRow`'s own `addExtraButton` calls, so it
	// lands first among the row's controls — ahead of up/down/indent/outdent
	// and trash — the same lead position list-fields.ts's own handle takes.
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
	if (target === null || isContainer(getComponent(target.type))) {
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
			showDropError(row, resolution.error);
			return;
		}
		showDropError(row, null);
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
	moveItem(siblings, from, to, listContext(host));
}

/**
 * The minimal `ListContext` `moveItem` needs, over this host. The focus and
 * drag-cursor members are `list-fields.ts`'s own convention for a list of
 * *fields*, which the tree is not, so both are thrown away here rather than
 * threaded through `TreeHost` for one caller with no use for either.
 */
function listContext(host: TreeHost): Parameters<typeof moveItem>[3] {
	return {
		persist: () => host.persist(),
		redraw: () => host.redraw(),
		focusAfterRedraw: () => undefined,
		confirm: (message, cta, onConfirm) => host.confirm(message, cta, onConfirm),
		errors: new Map(),
		drag: { index: null },
	};
}

function findComponent(layout: Layout, id: string): ComponentConfig | null {
	return walkComponents(layout.components).find((entry) => entry.config.id === id)
		?.config ?? null;
}
