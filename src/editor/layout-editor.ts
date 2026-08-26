import {
	App,
	ButtonComponent,
	debounce,
	Modal,
	Notice,
	Setting,
	TFile,
} from 'obsidian';
import { getComponent, listComponentTypes, paletteEntries } from '../components';
import { conditionMet } from './config-fields';
import { copyableName } from './copyable-name';
import { onCommit } from './field-commit';
import { showFieldError } from './field-error';
import { groupHeading, panelTitle } from './form-group';
import { ConfirmModal } from '../ui/confirm-modal';
import {
	commitFunctionLibrary,
	FunctionLibraryField,
	renderFunctionLibrary,
} from './function-library-field';
import { createLayout, listLayouts } from '../layouts';
import {
	ListContext,
	moveItem,
	renderColumnsEditor,
	renderEntriesEditor,
	renderRowsEditor,
} from './list-fields';
import type SheetsmithPlugin from '../main';
import {
	DEFAULT_COLUMNS,
	Layout,
	mayHoldChildren,
	parseLayout,
	serialiseLayout,
} from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { clamp, describeCell, findOverlaps, lastColumn } from './preview-grid';
import { renderResetField } from './reset-field';
import {
	commitTriggerList,
	renderTriggerList,
	TriggerListField,
} from './trigger-list-field';
import { ComponentConfig, isContainer, placesChildren } from '../types';
import { childIsPlaced, innerPlacement } from '../view/grid-cells';

/** Dropdown sentinel; layout file names can never collide with it. */
const CREATE_LAYOUT_OPTION = '::create-layout::';

/** Ties the add menu to the description under it, for a screen reader. */
const ADD_DESCRIPTION_ID = 'sheetsmith-add-description';

/**
 * The top level, wherever something has to be named that is not a component.
 *
 * Two jobs and one spelling: it is the **Add component** row's destination for
 * "on the sheet", and it is what the selection holds while the panel is
 * configuring the layout itself rather than anything in it. A second sentinel
 * for the second job would be two words for one idea, and component ids can
 * collide with neither — `COMPONENT_ID` admits no colon.
 */
export const SHEET_DESTINATION = '::sheet::';

/** How long a rebuilt region stays marked, before fading over its own transition. */
const FLASH_HOLD = 900;

/** Which pair of a block's four numbers a pointer drag is writing. */
type DragMode = 'move' | 'resize';

/**
 * One schematic in the pane: the sheet's, or the selected container's own.
 *
 * The same drawing twice rather than two drawings, and `preview-grid.ts` is
 * untouched by the second: `clamp`, `lastColumn`, `describeCell` and
 * `findOverlaps` each take a flat component list plus a column count, and a
 * container's children *are* a flat list plus a column count. So the gestures —
 * the pointer capture, the grid arithmetic, the Escape restore, the click a drag
 * leaves behind — are parameterised over which list is being written rather than
 * copied per level.
 */
interface Schematic {
	el: HTMLElement;
	/** The list this draws, and the list a drag writes into. */
	components: ComponentConfig[];
	/** Columns at this level: the layout's, or the container's own width. */
	columns: number;
	/**
	 * Rows to draw, for a container whose height is declared.
	 *
	 * Absent for the sheet's own schematic, which is correct rather than
	 * unfinished: `.sheetsmith-grid` sets no `grid-template-rows` at the top
	 * level either, so the sheet grows down as components are added and the
	 * preview should too.
	 */
	rows?: number;
}

/**
 * What the editor needs from the pane hosting it.
 *
 * The two pieces of state are the *author's posture* rather than the layout's
 * content — which layout they have open, and what they are looking at — so both
 * belong to the view, which is where a workspace remembers posture at all
 * (`View.getState` for one, `View.setEphemeralState` for the other). The editor
 * reads them at render time and asks for a change; it never keeps a copy,
 * because a copy is a second answer to "what is selected" and the two would
 * disagree the first time a pane was restored.
 *
 * The setters do not redraw. A render that has to correct one of these — a
 * selection naming a component the layout no longer holds — would otherwise
 * redraw from inside a render, and the caller that wants both says so in two
 * lines instead.
 *
 * `refreshSheets` is here for a different reason: a write to the layout file has
 * to reach every sheet rendering it, and reaching into a view is the view
 * layer's hop to make rather than this one's (`docs/PATTERNS.md` §2).
 */
export interface LayoutEditorHost {
	/** The layout file the pane has open, by basename, or null before one is. */
	readonly layoutName: string | null;
	/** Remember which layout is open. Does not redraw. */
	setLayoutName(name: string | null): void;
	/**
	 * What the panel configures: a component id, or `SHEET_DESTINATION` for the
	 * layout itself.
	 */
	readonly selection: string;
	/** Remember what is selected. Does not redraw. */
	setSelection(id: string): void;
	/** Rebuild both regions from the layout as it now stands. */
	redraw(): void;
	/** Refresh every open sheet view, after a write to the layout file. */
	refreshSheets(): void;
}

/** The two regions of the pane, and which one a thing is drawn into. */
interface Regions {
	/** The picker, the schematics, the tree and the add row. */
	outline: HTMLElement;
	/** The settings of whatever is selected. */
	panel: HTMLElement;
}

/**
 * The layout editor: the tree of what a layout holds, and the panel configuring
 * whichever one is selected. Covers creating layouts and configuring their
 * components. Knows no component types — component-specific fields come from
 * each `configFields` declaration — and knows nothing about a leaf either: it
 * renders into an element it is handed, and asks its host for the two pieces of
 * posture that are the pane's to remember.
 *
 * Text fields commit on change (blur or Enter), never per keystroke, and
 * invalid input shows an inline error instead of being silently ignored.
 */
export class LayoutEditorSection {
	private plugin: SheetsmithPlugin;
	private host: LayoutEditorHost;
	private redraw: () => void;
	private file: TFile | null = null;
	private layout: Layout | null = null;
	/** The sheet's schematic first, then an open container's, while it is open. */
	private schematics: Schematic[] = [];
	/**
	 * The entry being dragged, in whichever list is mid-drag. One cursor for
	 * every list in the pane, so a drag started in one is never read as a drop
	 * into another; the list editors in list-fields.ts share this object.
	 */
	private drag: { index: number | null } = { index: null };
	/** Focus token to apply after the next render, e.g. a newly added row. */
	private pendingFocus: string | null = null;
	/** Region to mark after the next render, e.g. fields a type change built. */
	private pendingFlash: string | null = null;
	/** The pane's own element, for the updates that must not rebuild it. */
	private rootEl: HTMLElement | null = null;
	/** The two regions of the last render, or null before the first. */
	private regions: Regions | null = null;
	/** True between a drag ending and the click it produces. */
	private dragged = false;
	/**
	 * Inline errors, by the focus token of the field showing them. A redraw
	 * tears down the DOM they live in, so an error on one field would vanish
	 * because an unrelated field was corrected — the message goes with the
	 * field, not with the render that happened to draw it.
	 */
	private fieldErrors = new Map<string, string>();
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;
	/**
	 * The function library field, so its text can be read back on close
	 * rather than waited on. Held with the layout it edits, because a stale
	 * field must never write into the layout that replaced it.
	 */
	private functions: FunctionLibraryField | null = null;
	/** The trigger list field, read back on close for the same reason. */
	private triggers: TriggerListField | null = null;

	/** Debounced persist, used only by rapid-fire paths (keyboard nudging). */
	private persistSoon = debounce(() => void this.persist(), 500, true);

	constructor(plugin: SheetsmithPlugin, host: LayoutEditorHost) {
		this.plugin = plugin;
		this.host = host;
		// A redraw tears the pane down and builds the function library back from
		// the layout, so anything typed into it has to be read out first or it
		// is gone. Blur is not enough on its own: a pointerdown on the grid
		// calls preventDefault, which suppresses the focus change and with it
		// the textarea's change event, so clicking a block after typing a
		// definition would discard it. Wrapped here rather than guarded at each
		// call site — there are a dozen, and the one that gets missed is the
		// one that loses a library.
		this.redraw = () => {
			this.flush();
			// The control the author is standing in, so the rebuild does not drop
			// them on the body. The focus token is this module's own convention,
			// which is why restoring across a rebuild is this module's job and
			// not the pane's — the pane owns the scroll, which is the half it can
			// see. Only where nothing has already asked: a list field that just
			// added a row wants focus on the row, not on the button that made it.
			this.pendingFocus ??= this.focusedToken();
			host.redraw();
		};
	}

	/** The focus token of whatever is focused inside the pane, if anything. */
	private focusedToken(): string | null {
		const active = this.rootEl?.ownerDocument.activeElement;
		if (!active?.instanceOf(HTMLElement)) return null;
		if (!this.rootEl?.contains(active)) return null;
		return active.dataset.sheetsmithFocus ?? null;
	}

	/** Write any pending edit now. Called before a redraw, and on tab close. */
	flush(): void {
		// Both are read rather than waited on, and either can be holding an
		// edit when the pane closes. Evaluated into locals first: `||` would
		// short-circuit past the second commit whenever the first changed,
		// which is precisely how a library gets lost.
		const triggersChanged = commitTriggerList(this.triggers);
		const functionsChanged = commitFunctionLibrary(this.functions);
		if (triggersChanged || functionsChanged) void this.persist();
		this.persistSoon.run();
	}

	/**
	 * Let go of the loaded layout, so the next render reads it fresh.
	 *
	 * Flushes first, and that order is the whole point of the method: a
	 * pending edit belongs to the layout being released, and `persist` writes
	 * `this.layout` to `this.file`. Clear those first and the commit lands on
	 * an object nothing will ever write, silently. The redraw these callers go
	 * on to make flushes too, but by then it is too late — which is exactly
	 * the kind of ordering that should not be left to each call site to
	 * remember.
	 */
	private releaseLayout(): void {
		this.flush();
		this.file = null;
		this.layout = null;
	}

	/**
	 * Every component in the layout, flattened.
	 *
	 * Ids and labels are unique across the whole sheet whatever a component sits
	 * inside — a label still keys a section in a flat note — so anything checking
	 * one has to look here rather than at a single level.
	 */
	private allComponents(): ComponentConfig[] {
		return walkComponents(this.layout?.components ?? []).map(
			(entry) => entry.config,
		);
	}

	/**
	 * Draw the editor into the element it is handed.
	 *
	 * Two regions, and which side a thing goes on is the design's one structural
	 * rule: the left column is everything about *where* — the picker, the grids,
	 * the tree of what the layout holds — and the panel is everything about the
	 * one thing selected. That is what puts nothing between a container's row
	 * and the rows of what it holds, which a form drawn under its own row could
	 * not avoid (`docs/UI.md` §12).
	 */
	async render(container: HTMLElement): Promise<void> {
		this.rootEl = container;
		// The query container the two-column rule reads, and it has to be an
		// ancestor of the grid rather than the grid itself: an element cannot
		// query its own width.
		container.addClass('sheetsmith-layout-editor-pane');

		const files = listLayouts(
			this.plugin.app,
			this.plugin.settings.layoutFolder,
		);

		if (files.length === 0) {
			this.renderVacant(container);
			return;
		}

		// The open layout, corrected where it names a file that is gone. Set
		// without redrawing, because this is already inside a render.
		if (
			this.host.layoutName === null ||
			!files.some((file) => file.basename === this.host.layoutName)
		) {
			this.host.setLayoutName(files[0]?.basename ?? null);
			this.releaseLayout();
		}

		const grid = container.createDiv('sheetsmith-layout-editor');
		// The left column exists from here, because the picker goes in it and the
		// picker is how an author leaves a layout they cannot edit. **The panel
		// does not**, and that is the point rather than an ordering accident:
		// every path that gives up below draws its message here and returns, and
		// a panel created in advance would leave the two-column rule reserving
		// 620px of empty pane beside one line of error text. The rule is keyed on
		// the panel being there, so not drawing one is the whole of the fix.
		const outline = grid.createDiv('sheetsmith-editor-outline');
		this.regions = null;

		this.renderSelectionRow(outline, files);

		const selectedFile = files.find(
			(file) => file.basename === this.host.layoutName,
		);
		if (!selectedFile) return;
		if (this.file?.path !== selectedFile.path || this.layout === null) {
			const run = ++this.renderId;
			this.file = selectedFile;
			let source: string;
			try {
				source = await this.plugin.app.vault.read(selectedFile);
			} catch (error) {
				this.layout = null;
				if (run !== this.renderId) return;
				// Where the tree would be, under the picker rather than over it.
				// The order is load bearing: the picker is how an author leaves a
				// layout they cannot edit, so a message that displaced it would
				// trap them on the broken one.
				outline.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`This layout cannot be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
			// A redraw may have rebuilt the pane while the read was in flight;
			// only the newest run may append.
			if (run !== this.renderId) return;
			try {
				this.layout = parseLayout(source);
			} catch (error) {
				this.layout = null;
				outline.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`This layout cannot be edited until its file is fixed: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
		}
		const layout = this.layout;

		// Past every giving-up path, so this is where the second column earns its
		// track.
		const panel = grid.createDiv('sheetsmith-editor-panel');
		this.regions = { outline, panel };

		// A selection naming nothing falls back to the layout's own settings,
		// never to the first component: landing an author in a form nobody chose
		// is the failure the reset binding's dropdown already guards against.
		const selected = this.selectedEntry(layout);
		if (selected === null && this.host.selection !== SHEET_DESTINATION) {
			this.host.setSelection(SHEET_DESTINATION);
		}

		// Registered before anything is drawn, drawn after: a selected container
		// contributes a schematic of its own, and both have to be on the list
		// before either is drawn.
		this.schematics = [
			{
				el: outline.createDiv('sheetsmith-layout-preview'),
				components: layout.components,
				columns: layout.columns ?? DEFAULT_COLUMNS,
			},
		];
		if (selected) this.renderSelectionSchematics(outline, layout, selected);
		this.renderTree(outline, layout);
		this.renderAddRow(outline, layout);
		this.drawSchematics();

		if (selected) {
			this.renderComponentForm(
				panel,
				layout,
				selected.config,
				selected.depth,
				selected.parent,
			);
		} else {
			this.renderLayoutSettings(panel, layout);
		}

		this.restoreFieldErrors(container);

		if (this.pendingFlash !== null) {
			this.flash(panel, this.pendingFlash);
			this.pendingFlash = null;
		}

		if (this.pendingFocus !== null) {
			this.refocus(container, this.pendingFocus);
			this.pendingFocus = null;
		}
	}

	/**
	 * The vault holds no layouts yet, which is the one state with no tree and no
	 * panel to draw.
	 *
	 * Centred on the pane rather than left as a row in the top-left corner. In a
	 * settings tab a row is what everything else looks like; on a surface of its
	 * own it is one line stranded in an empty rectangle.
	 */
	private renderVacant(container: HTMLElement): void {
		container.createDiv('sheetsmith-editor-vacant', (vacant) => {
			vacant.createDiv({
				cls: 'setting-item-description',
				text: 'No layouts yet.',
			});
			new ButtonComponent(vacant)
				.setButtonText('Create layout')
				.setCta()
				.onClick(() => this.promptCreateLayout());
		});
	}

	/**
	 * The walk entry for the selected component, or null where the layout itself
	 * is selected — and also where the selection names a component the layout no
	 * longer holds, which reads the same way and is corrected by the caller.
	 */
	private selectedEntry(layout: Layout): WalkEntry | null {
		if (this.host.selection === SHEET_DESTINATION) return null;
		return (
			walkComponents(layout.components).find(
				(entry) => entry.config.id === this.host.selection,
			) ?? null
		);
	}

	/** Show an inline error, and remember it across the next rebuild. */
	private fieldError(input: HTMLInputElement, message: string | null): void {
		showFieldError(input, message, this.fieldErrors);
	}

	/**
	 * Put back the inline errors whose field is still on screen, and forget
	 * the ones whose field is gone — a message about a control that no longer
	 * exists is worse than no message.
	 */
	private restoreFieldErrors(container: HTMLElement): void {
		if (this.fieldErrors.size === 0) return;
		for (const [token, message] of [...this.fieldErrors]) {
			const input = container.querySelector(
				`[data-sheetsmith-focus="${CSS.escape(token)}"]`,
			);
			if (input?.instanceOf(HTMLInputElement)) {
				this.fieldError(input, message);
			} else {
				this.fieldErrors.delete(token);
			}
		}
	}

	private renderSelectionRow(container: HTMLElement, files: TFile[]): void {
		new Setting(container)
			// "Layout file", not "Layout", because the tree's first row is the
			// layout and this is the file it lives in. Two adjacent rows both
			// named Layout — one choosing which one is open, one configuring the
			// one that is — would be a reader's problem, not a naming quibble.
			.setName('Layout file')
			.addDropdown((dropdown) => {
				for (const file of files) {
					dropdown.addOption(file.basename, file.basename);
				}
				dropdown.addOption(CREATE_LAYOUT_OPTION, 'New layout…');
				dropdown.setValue(this.host.layoutName ?? '');
				dropdown.selectEl.dataset.sheetsmithFocus = 'layout-picker';
				dropdown.onChange((value) => {
					if (value === CREATE_LAYOUT_OPTION) {
						// The modal redraws on close either way, which also
						// snaps the dropdown back if the user cancels.
						this.promptCreateLayout();
						return;
					}
					this.releaseLayout();
					this.host.setLayoutName(value);
					this.redraw();
				});
			})
			.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('Delete layout')
					.onClick(() => {
						const file = files.find(
							(candidate) => candidate.basename === this.host.layoutName,
						);
						if (!file) return;
						new ConfirmModal(
							this.plugin.app,
							`Delete the layout "${file.basename}"? Character notes are not touched, but the layout's components and formulas are gone.`,
							'Delete layout',
							() => void this.deleteLayout(file),
						).open();
					}),
			);
	}

	private async deleteLayout(file: TFile): Promise<void> {
		await this.plugin.app.fileManager.trashFile(file);
		this.releaseLayout();
		this.host.setLayoutName(null);
		this.redraw();
	}

	private promptCreateLayout(): void {
		new NameModal(
			this.plugin.app,
			(name) => void this.createLayoutNamed(name),
			() => this.redraw(),
		).open();
	}

	private async createLayoutNamed(name: string): Promise<void> {
		try {
			await createLayout(
				this.plugin.app,
				this.plugin.settings.layoutFolder,
				name,
			);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			this.redraw();
			return;
		}
		this.releaseLayout();
		this.host.setLayoutName(name);
		this.redraw();
	}

	/**
	 * Schematic of a grid: one button per component at its configured position.
	 * Click opens the component's form; dragging the block moves it and dragging
	 * its corner resizes it, with arrow keys and shift+arrows doing the same two
	 * things. Overlapping components are marked.
	 *
	 * Drawn per schematic, so a container's children are laid out against the
	 * container's own width and overlap only each other — a child and its
	 * parent's neighbour sit on different grids and cannot collide.
	 */
	private drawSchematics(): void {
		// The block a gesture left focused, so redrawing the grid under it does
		// not drop focus to the body. Only a block inside a schematic counts:
		// nothing else in the pane is rebuilt here, so nothing else has lost its
		// focus and searching wider would only risk finding the wrong control.
		const active = this.schematics[0]?.el.ownerDocument.activeElement;
		const held = active
			? this.schematics.find((schematic) => schematic.el.contains(active))
			: undefined;
		const focusId =
			held && active?.instanceOf(HTMLElement)
				? active.dataset.sheetsmithFocus
				: undefined;

		for (const schematic of this.schematics) this.drawSchematic(schematic);

		// The element itself survives the redraw — `drawSchematic` empties it in
		// place — so this is the same schematic the block came out of.
		if (focusId && held) this.refocus(held.el, focusId);
	}

	private drawSchematic(schematic: Schematic): void {
		const { el, components, columns, rows } = schematic;
		el.empty();
		el.style.setProperty('--sheetsmith-columns', String(columns));
		// A container's box is its placement, not its content — which is the whole
		// premise of a tab set — and the editor is the only place an author can see
		// that. Without this the preview drew only the rows blocks happened to
		// occupy, so a tab declared 8×3 with one row of cards previewed as one row
		// while the sheet showed three and about 260px of deliberate space.
		//
		// A constant row rather than the sheet's `minmax(0, 1fr)`, for two
		// independent reasons. `previewMetrics` maps a pointer's Y to a row index
		// through `grid-auto-rows`, so fractional rows would silently break every
		// drag and arrow-key move in here; and the preview paints its own lattice
		// as a gradient repeating every `--sheetsmith-preview-row`, so a track of
		// any other height would slide out of step with the grid drawn behind it.
		// What has to agree with the sheet is the row *count* — the box — not the
		// pixel height, which the preview scales anyway.
		el.style.gridTemplateRows =
			rows === undefined
				? ''
				: `repeat(${rows}, var(--sheetsmith-preview-row))`;

		const overlapping = findOverlaps(components);
		components.forEach((config, index) => {
			const cell = el.createEl('button', { cls: 'sheetsmith-preview-cell' });
			cell.dataset.sheetsmithFocus = `preview-${config.id}`;
			if (config.id === this.host.selection) {
				cell.addClass('sheetsmith-preview-editing');
			}
			const overlaps = overlapping.has(index);
			if (overlaps) cell.addClass('sheetsmith-preview-overlap');
			cell.createSpan({ text: config.label });
			cell.setAttribute('aria-label', describeCell(config, overlaps));
			cell.style.gridColumn = `${config.position.col} / span ${config.position.width}`;
			cell.style.gridRow = `${config.position.row} / span ${config.position.height}`;
			// Pointer-only, and hidden from assistive tech on purpose:
			// shift+arrows on the block already resize it, so the handle adds
			// no function that would otherwise be unreachable. That is also
			// what lets it be a span — a button inside a button is invalid.
			const handle = cell.createSpan({ cls: 'sheetsmith-preview-resize' });
			handle.setAttribute('aria-hidden', 'true');
			handle.addEventListener('pointerdown', (event) => {
				// Grabbing the corner must not also pick the whole block up.
				event.stopPropagation();
				this.beginDrag(event, cell, config, 'resize', schematic);
			});
			cell.addEventListener('click', () => {
				// A drag ends in a click on the same element; that click meant
				// "put it here", not "select it".
				if (this.dragged) return;
				// Selects, never deselects. Pressing the selected block again
				// would empty the panel, and nothing is the wrong thing to
				// configure — the `Layout` row is how an author gets back out.
				this.select(config.id);
			});
			cell.addEventListener('keydown', (event) =>
				this.nudge(event, config, schematic),
			);
			cell.addEventListener('pointerdown', (event) =>
				this.beginDrag(event, cell, config, 'move', schematic),
			);
		});

		// A colour with no legend is a colour: sighted users were told there
		// was a problem and not what it was. Only shown when there is one.
		if (overlapping.size > 0) {
			el.createDiv('sheetsmith-preview-legend', (note) =>
				note.setText(
					'Highlighted components overlap. They still render; the one later in the layout draws on top.',
				),
			);
		}
	}

	/**
	 * The preview's geometry, in the units the grid is actually drawn in.
	 * Read from the element rather than assumed, so a theme changing the
	 * padding or the gap moves the drop targets with it.
	 */
	private previewMetrics(schematic: Schematic): {
		left: number;
		top: number;
		column: number;
		row: number;
		columns: number;
	} | null {
		const el = schematic.el;
		const view = el.ownerDocument.defaultView;
		if (!view) return null;
		const styles = view.getComputedStyle(el);
		const columns = schematic.columns;
		const columnGap = parseFloat(styles.columnGap) || 0;
		const rowGap = parseFloat(styles.rowGap) || 0;
		const padLeft = parseFloat(styles.paddingLeft) || 0;
		const padTop = parseFloat(styles.paddingTop) || 0;
		const inner =
			el.clientWidth - padLeft - (parseFloat(styles.paddingRight) || 0);
		const track = (inner - (columns - 1) * columnGap) / columns;
		const rowHeight = parseFloat(styles.gridAutoRows) || 44;
		if (!(track > 0)) return null;
		const box = el.getBoundingClientRect();
		return {
			left: box.left + padLeft,
			top: box.top + padTop,
			column: track + columnGap,
			row: rowHeight + rowGap,
			columns,
		};
	}

	/** Which grid cell a pointer is over, 1-based, as the layout counts them. */
	private cellAt(
		event: PointerEvent,
		metrics: NonNullable<ReturnType<LayoutEditorSection['previewMetrics']>>,
	): { col: number; row: number } {
		return {
			col: Math.floor((event.clientX - metrics.left) / metrics.column) + 1,
			row: Math.floor((event.clientY - metrics.top) / metrics.row) + 1,
		};
	}

	/**
	 * Repaint the overlap marks without rebuilding the preview, and rewrite
	 * the labels that go with them. The label carries the block's position
	 * and size, so a gesture that changes either has to keep it true rather
	 * than leave it describing where the block used to be.
	 */
	private markOverlaps(schematic: Schematic): void {
		const overlapping = findOverlaps(schematic.components);
		const cells = schematic.el.querySelectorAll('.sheetsmith-preview-cell');
		cells.forEach((cell, index) => {
			const overlaps = overlapping.has(index);
			cell.toggleClass('sheetsmith-preview-overlap', overlaps);
			const config = schematic.components[index];
			if (config) cell.setAttribute('aria-label', describeCell(config, overlaps));
		});
	}

	/**
	 * Drag a component around the schematic, or drag its corner to resize it,
	 * 1:1 with the pointer and snapped to the grid it will actually sit on.
	 *
	 * One gesture with two destinations rather than two gestures: the pointer
	 * capture, the grid arithmetic, the Escape restore, and the click a drag
	 * leaves behind are the same problem whichever pair of numbers is being
	 * written, and two copies of them would drift apart.
	 *
	 * Only the dragged block's own grid position is written while the pointer
	 * is down — rebuilding the preview would destroy the element holding the
	 * pointer capture, and the drag would end on the first move. The rebuild
	 * happens once, on release.
	 */
	private beginDrag(
		event: PointerEvent,
		cell: HTMLElement,
		config: ComponentConfig,
		mode: DragMode,
		schematic: Schematic,
	): void {
		if (event.button !== 0) return;
		const metrics = this.previewMetrics(schematic);
		if (!metrics) return;
		// Suppress the text selection and the native button drag; the block
		// itself is the thing being dragged.
		event.preventDefault();

		const origin = this.cellAt(event, metrics);
		const start = { ...config.position };
		let moved = false;
		cell.setPointerCapture(event.pointerId);

		/**
		 * Offer the block a position this far from where it was picked up,
		 * and report whether that changed anything. The delta is measured
		 * from the origin every time rather than accumulated, so a pointer
		 * that runs past a bound and comes back resumes exactly.
		 */
		const place = (dc: number, dr: number): boolean => {
			const position = config.position;
			let { col, row, width, height } = position;
			if (mode === 'move') {
				col = clamp(start.col + dc, 1, lastColumn(metrics.columns, width, start.col));
				row = Math.max(1, start.row + dr);
			} else {
				width = clamp(
					start.width + dc,
					1,
					lastColumn(metrics.columns, col, start.width),
				);
				height = Math.max(1, start.height + dr);
			}
			// Marked before the no-op check, not after: the mark is about where
			// the block is, not about it having just moved. A block that is
			// already full-width, or already sitting at the last column, is
			// held from the first frame of the gesture — which is exactly the
			// case the feedback exists for, and the case a bail-out first
			// would never show it in.
			cell.toggleClass(
				'sheetsmith-preview-clamped',
				col + width - 1 >= metrics.columns,
			);
			if (
				col === position.col &&
				row === position.row &&
				width === position.width &&
				height === position.height
			) {
				return false;
			}
			position.col = col;
			position.row = row;
			position.width = width;
			position.height = height;
			cell.style.gridColumn = `${col} / span ${width}`;
			cell.style.gridRow = `${row} / span ${height}`;
			this.markOverlaps(schematic);
			return true;
		};

		const onMove = (move: PointerEvent) => {
			const at = this.cellAt(move, metrics);
			if (!place(at.col - origin.col, at.row - origin.row)) return;
			if (!moved) {
				moved = true;
				cell.addClass('sheetsmith-preview-dragging');
				if (mode === 'resize') cell.addClass('sheetsmith-preview-resizing');
			}
		};

		const finish = (commit: boolean) => {
			cell.removeEventListener('pointermove', onMove);
			cell.removeEventListener('pointerup', onUp);
			cell.removeEventListener('pointercancel', onCancel);
			cell.ownerDocument.removeEventListener('keydown', onKey);
			cell.removeClass('sheetsmith-preview-dragging');
			cell.removeClass('sheetsmith-preview-resizing');
			if (cell.hasPointerCapture(event.pointerId)) {
				cell.releasePointerCapture(event.pointerId);
			}
			if (!moved) return;
			// No delta from the origin is where the block was picked up, so
			// the restore is the same arithmetic as every other frame.
			if (!commit) place(0, 0);
			// The click that follows a drag is the drag's own; swallow it.
			this.dragged = true;
			window.setTimeout(() => {
				this.dragged = false;
			}, 0);
			void this.persist();
			this.syncPositionFields(config);
			this.drawSchematics();
		};

		const onUp = () => finish(true);
		const onCancel = () => finish(false);
		const onKey = (key: KeyboardEvent) => {
			// Forgiveness, on the gesture where a mistake is one slip of the
			// hand: Escape puts the block back where it was picked up.
			if (key.key !== 'Escape') return;
			key.preventDefault();
			finish(false);
		};

		cell.addEventListener('pointermove', onMove);
		cell.addEventListener('pointerup', onUp);
		cell.addEventListener('pointercancel', onCancel);
		cell.ownerDocument.addEventListener('keydown', onKey);
	}

	/** Arrow keys move a component; shift+arrows resize it. */
	private nudge(
		event: KeyboardEvent,
		config: ComponentConfig,
		schematic: Schematic,
	): void {
		const deltas: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		};
		const delta = deltas[event.key];
		if (!delta) return;
		event.preventDefault();
		const position = config.position;
		// The same bound the pointer gesture holds to, so the two ways of
		// doing this cannot disagree about where the grid ends.
		const columns = schematic.columns;
		if (event.shiftKey) {
			position.width = clamp(
				position.width + (delta[0] ?? 0),
				1,
				lastColumn(columns, position.col, position.width),
			);
			position.height = Math.max(1, position.height + (delta[1] ?? 0));
		} else {
			position.col = clamp(
				position.col + (delta[0] ?? 0),
				1,
				lastColumn(columns, position.width, position.col),
			);
			position.row = Math.max(1, position.row + (delta[1] ?? 0));
		}
		this.persistSoon();
		this.drawSchematics();
		// The open form shows the same numbers, so they have to follow — but
		// by being written, not by rebuilding the pane around them. Holding an
		// arrow key is the one gesture here that is rapid-fire by design, and
		// a full teardown per repeat is the latency cliff it would fall off.
		// The write is already debounced; this is the other half of that.
		this.syncPositionFields(config);
	}

	/** Write a component's position back into its open form, if it has one. */
	private syncPositionFields(config: ComponentConfig): void {
		const container = this.regions?.panel;
		if (!container) return;
		for (const key of ['col', 'row', 'width', 'height'] as const) {
			const field = container.querySelector(
				`[data-sheetsmith-focus="${CSS.escape(`pos-${config.id}-${key}`)}"]`,
			);
			if (field?.instanceOf(HTMLInputElement)) {
				field.value = String(config.position[key]);
			}
		}
	}

	/**
	 * Mark a region the last interaction rebuilt, and let the mark fade.
	 * Colour only, so there is nothing here for reduced motion to strip.
	 */
	private flash(scope: HTMLElement, token: string): void {
		const el = scope.querySelector(
			`[data-sheetsmith-flash="${CSS.escape(token)}"]`,
		);
		if (!el?.instanceOf(HTMLElement)) return;
		el.addClass('sheetsmith-flash');
		el.win.setTimeout(() => el.removeClass('sheetsmith-flash'), FLASH_HOLD);
	}

	private refocus(scope: HTMLElement, focusId: string): void {
		for (const candidate of Array.from(
			scope.querySelectorAll('[data-sheetsmith-focus]'),
		)) {
			if (
				candidate.instanceOf(HTMLElement) &&
				candidate.dataset.sheetsmithFocus === focusId
			) {
				candidate.focus({ preventScroll: true });
				return;
			}
		}
	}

	private renderAddRow(container: HTMLElement, layout: Layout): void {
		const choices = addChoices();
		let chosen = choices[0]?.value ?? 'card-set';
		// Every container that may still take a child. A container already two
		// deep is left out, so the depth the parser refuses is never something
		// the editor can walk into.
		const destinations = walkComponents(layout.components).filter((entry) =>
			acceptsChildren(entry.config, entry.depth),
		);
		let into: ComponentConfig | null = null;

		const row = new Setting(container).setName('Add component');
		/*
		 * The description goes *below* the row rather than under the name, and
		 * that is a layout decision rather than a styling one (docs/UI.md §12).
		 * In the info column it is copy that grows from nothing to several lines
		 * depending on which option is highlighted, and a settings row is a
		 * centred flex line: the info column widened, the control column wrapped,
		 * and the destination dropdown and **Add** dropped about 35px while the
		 * menu kept the first line. So the button an author presses next moved
		 * while they were still choosing what to press it for.
		 *
		 * Moved rather than reserved. Reserving a line of height shows an empty
		 * one for every bare type and only fits the shortest description anyway,
		 * where an entry's runs to several at a real settings width. Out here
		 * the first line — name, menu, destination, **Add** — is a fixed height
		 * whatever is selected, and the description grows downward into space
		 * nothing has been placed in. `descEl` keeps its own class and Obsidian's
		 * own treatment; only where it sits changes.
		 */
		row.settingEl.addClass('sheetsmith-add-row');
		row.settingEl.appendChild(row.descEl);
		/*
		 * And named, so the menu is described by it (docs/UI.md §6). The
		 * description is the only explanation an entry gets, and choosing an
		 * option repaints it — painted alone, a screen reader hears "Inventory"
		 * and nothing else. A literal id is safe here because the row is drawn
		 * once per render and `redraw` replaces the container's children.
		 *
		 * The empty description a bare type leaves is `display: none`, which
		 * assistive tech skips, so the association costs a type nothing.
		 */
		row.descEl.id = ADD_DESCRIPTION_ID;
		/*
		 * The entry's own description, below the menu it was chosen from. A
		 * dropdown line is one or two words, and SPEC §13's warning about the
		 * palette is that a menu nobody can read is worse than the type list it
		 * replaced — so what a prefill is *for* has to be on screen, not only in
		 * the code. A bare type has none and the line is empty, which is the
		 * truth: a type's name is all this editor has ever offered for one.
		 */
		const describe = (value: string): void => {
			row.setDesc(
				choices.find((choice) => choice.value === value)?.description ?? '',
			);
		};
		row.addDropdown((dropdown) => {
			for (const choice of choices) {
				// An entry sits one level under the type it prefills. It is what
				// keeps the menu readable as the entries multiply — the list gets
				// longer, and its structure stays the catalog with each block's
				// own prefills beneath it.
				dropdown.addOption(
					choice.value,
					`${indent(choice.entry ? 1 : 0)}${choice.name}`,
				);
			}
			dropdown.setValue(chosen);
			dropdown.selectEl.dataset.sheetsmithFocus = 'add-choice';
			dropdown.selectEl.setAttribute('aria-describedby', ADD_DESCRIPTION_ID);
			dropdown.onChange((value) => {
				chosen = value;
				describe(value);
			});
		});
		describe(chosen);

		// Only where there is somewhere else to put one. A dropdown offering the
		// sheet and nothing else says a layout has containers when it has none.
		if (destinations.length > 0) {
			row.addDropdown((dropdown) => {
				dropdown.addOption(SHEET_DESTINATION, 'On the sheet');
				for (const { config, depth } of destinations) {
					dropdown.addOption(config.id, `${indent(depth)}In ${config.label}`);
				}
				dropdown.setValue(SHEET_DESTINATION);
				dropdown.selectEl.dataset.sheetsmithFocus = 'add-destination';
				dropdown.onChange((value) => {
					into =
						destinations.find((entry) => entry.config.id === value)?.config ??
						null;
				});
			});
		}

		row.addButton((button) =>
			button.setButtonText('Add').onClick(() => {
				const parent = into;
				// `children` is shared config the editor owns, so this is where a
				// container becomes one: a component holds the key only once
				// something has been put in it.
				const list =
					parent === null ? layout.components : (parent.children ??= []);
				// Checked against the whole sheet, not this list: a label keys a
				// note section and an id is what a formula writes, and containment
				// scopes neither.
				const all = this.allComponents();
				const choice =
					choices.find((candidate) => candidate.value === chosen) ??
					choices[0];
				const type = choice?.type ?? chosen;
				// The entry's own name, so an author who chose "Checkbox" has a
				// component called Checkbox until they rename it.
				const label = uniqueLabel(choice?.name ?? componentDisplayName(type), all);
				// A tab has no placement, so the numbers written here are not read
				// by anything — but they are still in the file, and a hand-editor
				// reading `row: 4` on a tab would reasonably conclude it sits
				// somewhere. The container's own size is the honest thing to write:
				// it is the box the tab actually fills. `parsePosition` requires all
				// four, which is why this is a sensible value rather than no key.
				//
				// It goes stale the moment the container is resized, and nothing
				// keeps it in step on purpose: every drawing asks
				// `innerPlacement` for the live box instead. Do not add a sync —
				// reading this number was the bug, not writing it.
				list.push({
					// The prefill first, so nothing an entry carries can displace
					// what the editor owns. The type forbids those keys outright;
					// this is the spread order that makes the refusal true at
					// runtime as well.
					...(choice?.config ?? {}),
					id: uniqueId(label, all),
					type,
					label,
					position: childIsPlaced(parent)
						? {
								col: 1,
								row: nextFreeRow(list),
								// Never wider than the grid it lands on. A child
								// spanning past its container's last column would
								// open an implicit column and take the alignment
								// with it.
								width: Math.min(2, parent?.position.width ?? 2),
								height: 1,
							}
						: { ...(parent as ComponentConfig).position, col: 1, row: 1 },
				});
				const added = list[list.length - 1]?.id;
				if (added !== undefined) this.host.setSelection(added);
				void this.persist();
				this.redraw();
			}),
		);
	}

	/** Select a component, or the layout itself, and rebuild both regions. */
	private select(id: string): void {
		// Pressing what is already selected does nothing at all, rather than
		// rebuilding what is already on screen. Deselecting to nowhere would
		// leave the panel empty and nothing is the wrong thing to configure; and
		// a redraw for no change would throw away a half-typed field and put the
		// focus back where it was for the sake of it.
		if (this.host.selection === id) return;
		this.host.setSelection(id);
		this.redraw();
	}

	/**
	 * The layout, then everything in it, in the depth-first walk the sheet reads
	 * in: the pane's complete table of contents.
	 *
	 * **The first row is the layout itself**, selectable exactly as a component
	 * row is. That is what keeps this one selection rather than two, and it is
	 * why the panel needs no chrome of its own — no tab strip, no mode switch, no
	 * fourth kind of panel, which is what `docs/UI.md` §9 opens by forbidding.
	 *
	 * **No disclosure control**, which is the change from the settings tab. A
	 * chevron there opened a form under the row; here the form is in the panel
	 * and a container's children are always listed, so a triangle would be a
	 * disclosure that discloses nothing. The indent and the rule down its left
	 * say what holds what, and the row's own name is the control.
	 */
	private renderTree(outline: HTMLElement, layout: Layout): void {
		this.renderTreeRow(
			outline,
			SHEET_DESTINATION,
			'Layout',
			'The grid, the function library and the reset triggers.',
			0,
		);
		for (const { config, depth, siblings } of walkComponents(
			layout.components,
		)) {
			const row = this.renderTreeRow(
				outline,
				config.id,
				config.label,
				placedComponentName(config),
				depth,
			);
			row.addExtraButton((button) => {
				button
					.setIcon('trash')
					.setTooltip('Remove from layout')
					.onClick(() => {
						const held = config.children ?? [];
						new ConfirmModal(
							this.plugin.app,
							removalMessage(config, held.length),
							'Remove component',
							() => {
								siblings.splice(siblings.indexOf(config), 1);
								// Children move out rather than going with it.
								// A component config is not character data, but
								// losing six components' formulas to one click is
								// the same failure in miniature — and the modal
								// only ever promised that the notes survived.
								for (const child of held) {
									child.position.col = 1;
									child.position.row = nextFreeRow(layout.components);
									layout.components.push(child);
								}
								// Back to the layout's own settings. The panel was
								// showing the component that just went, and the
								// first component is not something anyone chose.
								this.host.setSelection(SHEET_DESTINATION);
								void this.persist();
								this.redraw();
							},
						).open();
					});
				button.extraSettingsEl.dataset.sheetsmithFocus = `remove-${config.id}`;
			});
		}
	}

	/**
	 * One row of the tree: a name that selects, at its own depth.
	 *
	 * A button in the row's name rather than a click handler on the row. A thing
	 * that answers a press is a control (`docs/UI.md` §6), so it gets a tab stop,
	 * a focus ring and Enter for free — and §7's "focus on pointerdown, commit on
	 * click" comes with it rather than being reimplemented per row.
	 */
	private renderTreeRow(
		outline: HTMLElement,
		id: string,
		name: string,
		description: string,
		/** How many containers enclose it, which is what indents the row. */
		depth: number,
	): Setting {
		const selected = this.host.selection === id;
		const row = new Setting(outline).setDesc(description);
		// One class for the row and for the schematic block, so the two paints
		// cannot disagree about what is selected.
		if (selected) row.settingEl.addClass('sheetsmith-preview-editing');
		if (depth > 0) {
			row.settingEl.addClass('sheetsmith-row-child');
			// The depth rather than a class per level: the indent is arithmetic,
			// and two classes saying "one in" and "two in" would be two places to
			// change if the bound ever moved.
			row.settingEl.style.setProperty('--sheetsmith-row-depth', String(depth));
		}
		const button = row.nameEl.createEl('button', {
			cls: 'sheetsmith-tree-name',
			text: name,
		});
		button.dataset.sheetsmithFocus = `edit-${id}`;
		// The paint says which row is selected; this is what says it out loud.
		if (selected) button.setAttribute('aria-current', 'true');
		button.addEventListener('click', () => this.select(id));
		return row;
	}

	/**
	 * Every grid the selection has anything to do with: the one it sits on, then
	 * the one it provides.
	 *
	 * **The first of those was missing and it is the one that matters more.** The
	 * sheet's schematic draws the top level only, so selecting anything inside a
	 * container drew no block for it anywhere — and the panel beside it still
	 * offered four editable position fields addressing a grid the pane was not
	 * drawing. Four numbers with nothing on screen to read them against is worse
	 * than an absent mark, and it is the exact opposite of the reason the
	 * container's schematic went in the left column: grids belong beside the grid
	 * they sit inside.
	 *
	 * Both, rather than one or the other, for the same reason the container's own
	 * grid is stacked under the sheet's rather than replacing it — a selected
	 * container an author is arranging has a place *and* contents, and the chain
	 * reads down the column: the sheet, then where this sits, then what it holds.
	 *
	 * A tab's parent draws nothing, and that is `renderContainerSchematic`'s own
	 * guard rather than a case here: a container showing one child at a time has
	 * no grid, which is also why the panel withholds the position fields there.
	 */
	private renderSelectionSchematics(
		outline: HTMLElement,
		layout: Layout,
		entry: WalkEntry,
	): void {
		if (entry.parent !== null) {
			// The parent's own walk entry, not a synthesised one: `innerPlacement`
			// needs the grandparent to answer what box the parent actually has,
			// which is the whole reason a stale `position` cannot be trusted.
			const parent = walkComponents(layout.components).find(
				(candidate) => candidate.config === entry.parent,
			);
			if (parent) this.renderContainerSchematic(outline, parent);
		}
		this.renderContainerSchematic(outline, entry);
	}

	/**
	 * One container's own grid, under the sheet's.
	 *
	 * In the left column rather than in the panel, because it is a grid and grids
	 * belong beside the grid they sit inside; and stacked under the sheet's
	 * rather than replacing it, so an author can see where the container sits
	 * *and* what is in it at once.
	 *
	 * The column count comes from `innerPlacement`, the same function the sheet
	 * draws through, and not from `config.position.width`. This container may
	 * itself be a tab, and then its own four numbers are read by nothing: the box
	 * is the tab set's, so a stale width copied in at creation would have the
	 * editor drawing, describing and clamping against a grid the sheet does not
	 * have.
	 */
	private renderContainerSchematic(
		outline: HTMLElement,
		entry: WalkEntry,
	): void {
		const { config, depth, parent } = entry;
		const definition = getComponent(config.type);
		if (!acceptsChildren(config, depth)) return;
		// A container that shows one child at a time has no grid to draw: its
		// children have no placement, so every one of them would land in the same
		// cell and `findOverlaps` would report each as overlapping all the others
		// — true of the rectangles and silent about the layout. The order is the
		// only thing there is to edit, and the panel edits it.
		if (!placesChildren(definition)) return;
		const inner = innerPlacement(config, parent);
		outline.createDiv({ cls: 'setting-item-description' }, (el) =>
			el.setText(
				`Inside "${config.label}", on its own grid of ${inner.width} columns by ${inner.height} rows. Cells nothing fills stay empty on the sheet.`,
			),
		);
		const el = outline.createDiv('sheetsmith-layout-preview');
		// Whose grid this is, so a reader — and a test — can say which schematic
		// it is looking at rather than counting them. Two are on screen whenever a
		// container inside a container is selected, and telling them apart by
		// position is the index-mapping fragility `markOverlaps` already carries.
		el.dataset.sheetsmithGrid = config.id;
		this.schematics.push({
			el,
			// Read, never created: drawing this must not write a key into the
			// config. A `children: []` written onto a component two containers
			// deep is a layout `parseLayout` refuses, so `persist` would refuse
			// every later save and the author would lose edits to a message about
			// a depth rule they never broke. Nothing pushes into this list — a
			// drag moves an existing block, and the add row creates the key
			// itself — so a throwaway array is enough.
			components: config.children ?? [],
			columns: inner.width,
			rows: inner.height,
		});
	}

	/**
	 * The layout's own settings: the grid it places components on, the functions
	 * its formulas may call, and the triggers its components reset on.
	 *
	 * Reached by selecting the `Layout` row, which is why there is no second kind
	 * of panel. Both textarea fields already took a container and a layout and
	 * knew nothing about a settings tab, so they move rather than being
	 * rewritten — and the function library's own header asked for exactly this:
	 * below the component forms "the definitions are a scroll away from the
	 * formulas calling them, which is a side panel's job to fix".
	 */
	private renderLayoutSettings(panel: HTMLElement, layout: Layout): void {
		const form = panel.createDiv('sheetsmith-component-form');
		// The tree row that got here says `Layout`, so this does too. The layout's
		// own name is the picker's, one column over, and saying it twice would be
		// two answers to "which layout is this".
		panelTitle(form, 'Layout');
		this.renderColumnCount(form, layout);
		this.triggers = renderTriggerList(form, layout, {
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
		});
		this.functions = renderFunctionLibrary(form, layout, {
			persist: () => void this.persist(),
		});
	}

	/**
	 * How many columns the grid places components across.
	 *
	 * The first control this key has ever had: it round-trips today and is
	 * reachable only by hand-editing the file. A plain number rather than a
	 * formula field — a column count is structure, and nothing resolves it.
	 *
	 * Two hazards, both spelled out in `parse/layout.ts` and both of a kind this
	 * codebase has been caught by twice. An absent `columns` has to stay absent
	 * through a round trip, so a value matching the default deletes the key
	 * rather than writing `"columns": 12` into a file that merely had the field
	 * shown — the same answer a select and a boolean already give, and the
	 * `options: []` trap a third time. And `parseLayout` refuses anything that is
	 * not a positive integer, so this carries the position fields' own inline
	 * error rather than letting `persist` refuse the whole file with a `Notice`
	 * and drop the edit.
	 */
	private renderColumnCount(form: HTMLElement, layout: Layout): void {
		new Setting(form)
			.setName('Grid columns')
			.setDesc(
				'How many columns components are placed across. Reducing it leaves a component already past the new last column where it is, rather than moving something you did not touch.',
			)
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setValue(String(layout.columns ?? DEFAULT_COLUMNS));
				text.inputEl.dataset.sheetsmithFocus = 'layout-columns';
				onCommit(text, (raw) => {
					const parsed = Number(raw.trim());
					if (!Number.isInteger(parsed) || parsed < 1) {
						this.fieldError(text.inputEl, 'Whole number, 1 or more.');
						return;
					}
					this.fieldError(text.inputEl, null);
					if (parsed === DEFAULT_COLUMNS) delete layout.columns;
					else layout.columns = parsed;
					void this.persist();
					// The schematic is drawn against this number and the tree and
					// the panel are not, so the grid is redrawn and the pane is
					// left standing.
					const sheet = this.schematics[0];
					if (sheet) sheet.columns = parsed;
					this.drawSchematics();
				});
			});
	}

	/**
	 * The tabs of a container that shows one child at a time, in the order its
	 * strip draws them.
	 *
	 * A list rather than a grid, and up/down rather than a drag, because the
	 * order is the whole of what there is to say: a tab has no placement, so
	 * there is no second dimension for a gesture to write. `moveItem` is the
	 * same reorder the entry and row lists use — one consumer more of a
	 * mechanism already proven, rather than a second answer to "how does a list
	 * move".
	 *
	 * Editing and removing a tab stay on its own row in the disclosure list
	 * below, where every other component's are. Offering them again here would
	 * be two controls for one job, and the one that went stale would be this
	 * copy.
	 */
	private renderChildOrder(form: HTMLElement, config: ComponentConfig): void {
		const tabs = config.children ?? [];
		form.createDiv({ cls: 'setting-item-description' }, (el) =>
			el.setText(
				tabs.length === 0
					? 'No tabs yet. Add a component to this one and it becomes its first tab.'
					: 'The strip draws these left to right. Each one fills the panel when it is showing, so none of them has a position of its own.',
			),
		);
		tabs.forEach((tab, index) => {
			const row = new Setting(form)
				.setName(`${index + 1}. ${tab.label}`)
				.setDesc(placedComponentName(tab));
			// The class alone: these are always one level in, and the indent rule
			// already defaults `--sheetsmith-row-depth` to 1. Setting it here would
			// be a static style assignment, which the lint rules refuse — rightly,
			// since a fixed value belongs in the stylesheet.
			row.settingEl.addClass('sheetsmith-row-child');
			row.addExtraButton((button) => {
				button
					// The arrows every other reorder control in the plugin uses —
					// the entry list and both list fields — rather than a
					// chevron. `docs/UI.md` §9: reuse the vocabulary instead of
					// inventing a lookalike. A chevron here would also have collided
					// with the disclosure two rows up, where `chevron-down` means
					// "this row is open" rather than "move later".
					.setIcon('arrow-up')
					.setTooltip('Move earlier')
					.setDisabled(index === 0)
					.onClick(() => moveItem(tabs, index, index - 1, this.listContext()));
				button.extraSettingsEl.dataset.sheetsmithFocus = `tab-up-${tab.id}`;
			});
			row.addExtraButton((button) => {
				button
					.setIcon('arrow-down')
					.setTooltip('Move later')
					.setDisabled(index === tabs.length - 1)
					.onClick(() => moveItem(tabs, index, index + 1, this.listContext()));
				button.extraSettingsEl.dataset.sheetsmithFocus = `tab-down-${tab.id}`;
			});
		});
	}

	private renderComponentForm(
		container: HTMLElement,
		layout: Layout,
		config: ComponentConfig,
		/** How many containers enclose it, which decides whether it may hold any. */
		depth: number,
		/** The container holding it, which decides whether it has a placement. */
		parent: ComponentConfig | null,
	): void {
		const form = container.createDiv('sheetsmith-component-form');
		const definition = getComponent(config.type);
		panelTitle(form, config.label);

		form.createDiv(
			{ cls: ['setting-item-description', 'sheetsmith-component-reference'] },
			(el) => {
				el.appendText('Formulas reference this component as ');
				// The id is the one thing about a component that cannot be
				// discovered anywhere else, and it is what gets retyped into
				// every formula that reads this component. Make it one click.
				copyableName(el, config.id);
			},
		);

		// A container that may hold nothing says so, rather than being offered a
		// grid to fill. This is the complement of the schematic's own guard and
		// the add row's, and the three sit in three places now — the panel, the
		// left column and the add row — which is why they ask one named question
		// rather than three spellings of it. Diverge and the author gets a grid in
		// one column beside a sentence in the other saying nothing can go in it.
		// The author chose this type deliberately, so silence is worse than a
		// sentence.
		if (isContainer(definition) && !acceptsChildren(config, depth)) {
			form.createDiv({ cls: 'setting-item-description' }, (el) =>
				el.setText(
					'This component sits inside two containers, so it can hold nothing: a container may hold containers only one level deep. Move it up a level to put components in it.',
				),
			);
		}

		// A container that shows one child at a time gets an ordered list, not a
		// grid. Its children have no placement — each fills the region in turn —
		// so the order is the only thing there is to edit, and it is the one thing
		// a grid could not have edited. The grid case is the left column's:
		// `renderContainerSchematic` draws it beside the sheet's own.
		if (acceptsChildren(config, depth) && !placesChildren(definition)) {
			this.renderChildOrder(form, config);
		}

		new Setting(form)
			.setName('Label')
			.setDesc(
				'Also the section heading in character notes. Existing notes keep their data under the old heading; rename those headings manually.',
			)
			.addText((text) => {
				text.setValue(config.label);
				text.inputEl.dataset.sheetsmithFocus = `label-${config.id}`;
				onCommit(text, (raw) => {
					const label = raw.trim();
					if (label === '') {
						this.fieldError(text.inputEl, 'A label is required.');
						return;
					}
					if (
						layout.components.some(
							(other) => other !== config && other.label === label,
						)
					) {
						showFieldError(
							text.inputEl,
							'Another component already uses this label.',
						);
						return;
					}
					this.fieldError(text.inputEl, null);
					config.label = label;
					void this.persist();
					this.redraw();
				});
			});

		// A child of a container that shows one at a time fills the region it is
		// given, so none of its four numbers is read by anything. Withdrawn rather
		// than shown inert: a field that edits a number nothing reads is worse
		// than no field, and this is the same call the columns list makes when it
		// stops offering a total on a column that cannot carry one.
		const placed = childIsPlaced(parent);
		if (!placed) {
			form.createDiv({ cls: 'setting-item-description' }, (el) =>
				el.setText(
					`This fills "${parent?.label ?? ''}" when it is the one showing, so it has no position of its own. Its size is that component's.`,
				),
			);
		}

		const position = placed
			? new Setting(form)
					.setName('Position')
					.setDesc('Grid units.')
					.setClass('sheetsmith-position-setting')
			: null;
		for (const key of placed ? (['col', 'row', 'width', 'height'] as const) : []) {
			const holder = position!.controlEl.createDiv('sheetsmith-position-field');
			holder.createSpan({
				cls: 'sheetsmith-position-label',
				text: key,
			});
			const input = holder.createEl('input', { type: 'number' });
			input.value = String(config.position[key]);
			// The span label is visual only; this is the accessible name.
			input.setAttribute('aria-label', `${config.label} ${key}`);
			input.dataset.sheetsmithFocus = `pos-${config.id}-${key}`;
			input.addEventListener('change', () => {
				const parsed = Number(input.value);
				if (!Number.isInteger(parsed) || parsed < 1) {
					this.fieldError(input, 'Whole number, 1 or more.');
					return;
				}
				this.fieldError(input, null);
				config.position[key] = parsed;
				this.drawSchematics();
				void this.persist();
			});
		}

		if (!definition) return;
		const record = config as unknown as Record<string, unknown>;

		// Only components that can act on a reset are offered one, and
		// implementing `applyReset` is what says so. Why the field is rendered
		// from here at all rather than declared as config is `reset-field.ts`.
		if (definition.applyReset !== undefined) {
			renderResetField(form, layout, config, {
				persist: () => void this.persist(),
				redraw: () => this.redraw(),
				errors: this.fieldErrors,
			});
		}

		let currentGroup: string | undefined;
		for (const field of definition.configFields) {
			if (
				field.visibleWhen &&
				!conditionMet(field.visibleWhen, definition.configFields, record)
			) {
				continue;
			}
			if (field.group !== currentGroup) {
				currentGroup = field.group;
				if (currentGroup !== undefined) groupHeading(form, currentGroup);
			}

			if (
				field.kind === 'entries' ||
				field.kind === 'track-rows' ||
				field.kind === 'rows' ||
				field.kind === 'columns'
			) {
				// List fields are a table of their own, not a Setting row.
				// Falling through to the text input below would bind a string
				// input to an array and destroy it on the first commit.
				const entries = record[field.key];
				groupHeading(
					form,
					field.label,
					field.description,
					Array.isArray(entries) ? entries.length : 0,
				);
				const listEl = form.createDiv('sheetsmith-entry-list');
				if (field.kind === 'entries' || field.kind === 'track-rows') {
					// One editor for both: a track's rows are a Card set's
					// entries with a length, which is the shape the
					// component chose them for. A second table would drift
					// from this one the first time either changed.
					//
					// The columns are the field's own words, and a field of
					// this kind that declares none has no table to draw. The
					// registry contract holds every one of them to declaring
					// them, so what this guard covers is the type rather than a
					// state a registered component can reach — the heading and
					// the description above it are drawn either way, so a field
					// is never silently absent from the form.
					if (field.entryColumns) {
						renderEntriesEditor(
							listEl,
							record,
							field.key,
							config.id,
							field.kind === 'track-rows',
							field.entryColumns,
							this.listContext(),
						);
					}
				} else if (field.kind === 'rows') {
					renderRowsEditor(listEl, record, field.key, config.id, this.listContext());
				} else {
					renderColumnsEditor(
						listEl,
						record,
						field.key,
						config.id,
						this.listContext(),
					);
				}
				continue;
			}

			const setting = new Setting(form).setName(field.label);
			if (field.description) setting.setDesc(field.description);

			if (field.kind === 'text-list') {
				/*
				 * One field holding an ordered list of plain strings, not a
				 * table of its own: the lists this kind serves are short and
				 * their order is the whole meaning — a track's levels run from
				 * none upwards — so a row per entry would cost four controls to
				 * say what a comma already says. It is the same control the
				 * level column's names use, which is the list it has to agree
				 * with.
				 */
				setting.addText((text) => {
					const current = record[field.key];
					text.setValue(Array.isArray(current) ? current.join(', ') : '');
					text.inputEl.placeholder = 'Comma separated';
					text.inputEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
					onCommit(text, (raw) => {
						const parsed = raw
							.split(',')
							.map((entry) => entry.trim())
							.filter((entry) => entry !== '');
						this.fieldError(text.inputEl, null);
						// Cleared is "this list is not set", which is a state
						// the component reads — a track with no level names
						// counts its marks instead.
						if (parsed.length === 0) delete record[field.key];
						else record[field.key] = parsed;
						void this.persist();
						// The list may decide what another field means.
						this.redraw();
					});
				});
				continue;
			}

			if (field.kind === 'select') {
				const options = field.options ?? [];
				const fallback = options[0] ?? '';
				setting.addDropdown((dropdown) => {
					for (const option of options) dropdown.addOption(option, option);
					const current = record[field.key];
					dropdown.setValue(
						typeof current === 'string' && options.includes(current)
							? current
							: fallback,
					);
					dropdown.selectEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
					dropdown.onChange((value) => {
						if (value === fallback) {
							delete record[field.key];
						} else {
							record[field.key] = value;
						}
						void this.persist();
						// A select may control another field's visibility.
						this.redraw();
					});
				});
				continue;
			}

			if (field.kind === 'boolean') {
				const fallback = field.default ?? false;
				// Whether anything else on this form appears or disappears with
				// this key. A boolean commit did not redraw at all until one
				// controlled a `visibleWhen`, which made such a condition inert
				// and let the form offer a combination its component refused.
				//
				// **No component has one today** — the only boolean that did was
				// the group's `collapsible`, and it went with the collapse
				// (SPEC §13) — so this is a guard with no current caller rather
				// than live behaviour, and `settings.test.ts` says so where it can
				// only assert the precondition. Kept because the failure it
				// prevents is silent and the next such field would inherit it,
				// and left conditional because a redraw tears the whole tab down
				// and most checkboxes here change nothing but their own key.
				const controls = definition.configFields.some(
					(other) => other.visibleWhen?.key === field.key,
				);
				setting.addToggle((toggle) => {
					const current = record[field.key];
					toggle.setValue(typeof current === 'boolean' ? current : fallback);
					// Every control on this tab carries one, and a boolean was the
					// exception only for as long as no boolean redrew: the settings
					// tab restores focus by this token across the rebuild, so
					// without it the author presses a checkbox and lands on the
					// body with the form rebuilt around them. Unconditional rather
					// than only where `controls` is set, because the trap is
					// invisible — the next boolean to gain a dependent would
					// rediscover it.
					toggle.toggleEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
					toggle.onChange((value) => {
						if (value === fallback) {
							delete record[field.key];
						} else {
							record[field.key] = value;
						}
						void this.persist();
						if (controls) this.redraw();
					});
				});
				continue;
			}

			setting.addText((text) => {
				if (field.kind === 'number') text.inputEl.type = 'number';
				const current = record[field.key];
				text.setValue(
					typeof current === 'string' || typeof current === 'number'
						? String(current)
						: '',
				);
				text.inputEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
				onCommit(text, (raw) => {
					const trimmed = raw.trim();
					if (trimmed === '') {
						this.fieldError(text.inputEl, null);
						delete record[field.key];
						void this.persist();
						return;
					}
					if (field.kind === 'number') {
						const parsed = Number(trimmed);
						if (Number.isNaN(parsed)) {
							this.fieldError(text.inputEl, 'This field needs a number.');
							return;
						}
						this.fieldError(text.inputEl, null);
						record[field.key] = parsed;
					} else {
						this.fieldError(text.inputEl, null);
						record[field.key] = trimmed;
					}
					void this.persist();
				});
			});
		}
	}

	/** What the list editors in list-fields.ts need from this editor. */
	private listContext(): ListContext {
		return {
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
			focusAfterRedraw: (token) => {
				this.pendingFocus = token;
			},
			flashAfterRedraw: (token) => {
				this.pendingFlash = token;
			},
			confirm: (message, cta, onConfirm) =>
				new ConfirmModal(this.plugin.app, message, cta, onConfirm).open(),
			errors: this.fieldErrors,
			drag: this.drag,
		};
	}

	/**
	 * Validate and write the layout, then refresh open sheet views. Invalid
	 * states stay in memory with a notice and are written once corrected.
	 */
	private async persist(): Promise<void> {
		if (!this.file || !this.layout) return;
		let serialised: string;
		try {
			serialised = serialiseLayout(this.layout);
			parseLayout(serialised);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			return;
		}
		await this.plugin.app.vault.modify(this.file, serialised);
		this.host.refreshSheets();
	}
}

class NameModal extends Modal {
	private onSubmit: (name: string) => void;
	private onCancel: () => void;
	private submitted = false;

	constructor(
		app: App,
		onSubmit: (name: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		this.titleEl.setText('New layout');
		let name = '';
		// Held so the button can say, by being disabled, that there is nothing
		// to create yet. A live button that silently does nothing on click is
		// indistinguishable from one that is broken.
		let create: ButtonComponent | null = null;
		const submit = () => {
			const trimmed = name.trim();
			if (trimmed === '') return;
			this.submitted = true;
			this.close();
			this.onSubmit(trimmed);
		};
		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.setPlaceholder('Layout name').onChange((value) => {
				name = value;
				create?.setDisabled(value.trim() === '');
			});
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					submit();
				}
			});
			text.inputEl.focus();
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) => {
				create = button;
				button.setButtonText('Create').setCta().onClick(submit);
				button.setDisabled(true);
			});
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.onCancel();
	}
}


/**
 * Leading space for a dropdown option that sits under another, by how many
 * levels in it is.
 *
 * A figure space, because it is the one space character with a width that does
 * not collapse and does not vary with the digits around it. Both dropdowns on
 * the **Add component** row use it — an entry under its type, a container under
 * its parent — for the same reason: a `<select>` has no other way to say that
 * one option sits under another.
 *
 * One function because the bound is the whole of it, and the two callers sit in
 * one row of the pane. Spelled twice they agreed only by accident: one
 * multiplied by depth and the other hard-coded a flat two, so widening the
 * indent in either place would have indented the two dropdowns beside each other
 * differently. Taking the depth rather than a character count is also what lets a
 * caller say "one level in" instead of restating the arithmetic (PATTERNS §1).
 */
function indent(depth: number): string {
	return '\u2007'.repeat(depth * 2);
}

/**
 * Display name for a component type id: "card-set" → "Card set".
 * Sentence case, per the style guide: only the first word is capitalised.
 */
function componentDisplayName(type: string): string {
	const words = type.split('-').join(' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Whether this component may take a child *where it sits*.
 *
 * Two questions the editor always asks together — is it a container, and is it
 * shallow enough that the parser would still accept a child in it — and the
 * conjunction is the editor's own rather than either half's: `isContainer` is a
 * fact about the type and `mayHoldChildren` is the parser's depth rule, and
 * neither answers this on its own.
 *
 * Named because it is spelled in three regions and in both polarities. The add
 * row withholds a destination, the left column withholds a schematic, and the
 * panel prints a sentence saying nothing can go in it — and while the last two
 * were adjacent lines of one function, a rule growing a clause would have been
 * hard to add to one and miss on the other. They are a column apart now, and a
 * divergence paints a grid beside a sentence denying it: the instrument
 * disagreeing with itself, which `docs/UI.md` §11 calls worse than showing
 * nothing. This is `docs/PATTERNS.md` §1's predicate clause, and the shape is
 * `childIsPlaced`'s: the registry lookup the callers were each doing comes
 * inside, so a caller passes what it has.
 */
function acceptsChildren(config: ComponentConfig, depth: number): boolean {
	return isContainer(getComponent(config.type)) && mayHoldChildren(depth);
}

/**
 * What to call a component the layout has already placed.
 *
 * Its type, unless the component says its configuration has a better name —
 * a Card with options is a Dropdown, and an author who picked Dropdown out of
 * the add menu should not be told a line later that they have a Card. The
 * component answers, never this module: whether options make a dropdown is
 * exactly the kind of thing nothing outside a component may know.
 *
 * The add menu keeps `componentDisplayName`, because there it is naming *types*
 * and the prefills are listed under them by name already.
 */
function placedComponentName(config: ComponentConfig): string {
	const named = getComponent(config.type)?.configName?.(config);
	return named ?? componentDisplayName(config.type);
}

/**
 * What removing a component takes with it.
 *
 * A container's children are the case worth spelling out: they move rather than
 * going with it, so the modal has to say so before the press rather than leave
 * the author guessing whether one click just cost them six components' formulas.
 */
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
 * One line of the add menu: a bare type, or a type with its config prefilled.
 *
 * Flattened here rather than in the registry because this is the only thing that
 * draws a palette today, and PATTERNS §1 is explicit that one consumer earns no
 * module. M4's grid canvas is the second and it moves then; what the registry
 * owns is which entries exist, not how a menu spells them.
 */
interface AddChoice {
	/** Stable option value. A type on its own, or the type and the entry's index. */
	value: string;
	type: string;
	/** The menu line, and the label the new component starts with. */
	name: string;
	description: string;
	/** Whether it is a prefill of the type above it, which is what indents it. */
	entry: boolean;
	config: Readonly<Partial<ComponentConfig>>;
}

/**
 * Every type, each followed by its own prefills.
 *
 * Types stay, and not for completeness: an author who wants a plain Track has to
 * be able to ask for one, and an entry is a starting point they then edit rather
 * than a variant with capabilities of its own. A menu of entries alone would hide
 * the generic block behind a job name, which is the failure SPEC §2 records twice
 * — nobody building an inventory looks for a skill card.
 */
function addChoices(): AddChoice[] {
	return listComponentTypes().flatMap((type) => [
		{
			value: type,
			type,
			name: componentDisplayName(type),
			description: '',
			entry: false,
			config: {},
		},
		// The index rather than a machine id on the entry itself: the value only
		// has to tell one option from another inside one dropdown, and a member
		// for it would be a member every future entry has to invent a value for.
		//
		// A colon rather than a hash, because the harness addresses this menu by
		// query string and `#` is the one character that cannot survive one — it
		// starts a fragment, so `choice=track#0` arrives as `choice=track` and
		// selects the bare type instead. A type id is lower-case and hyphenated,
		// so a colon parses unambiguously.
		...paletteEntries(type).map((entry, index) => ({
			value: `${type}:${index}`,
			type,
			name: entry.name,
			description: entry.description,
			entry: true,
			config: entry.config,
		})),
	]);
}

function uniqueLabel(base: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.label));
	let label = base;
	let counter = 2;
	while (taken.has(label)) label = `${base} ${counter++}`;
	return label;
}

/**
 * The id is what formulas reference, so it has to be a name the expression
 * parser accepts: underscores rather than hyphens, since a hyphen would read
 * as subtraction, and never a leading digit. Kept in step with COMPONENT_ID
 * in parse/layout.ts, which migrates anything this could not have produced —
 * including the hyphenated ids this function itself emitted before the clash
 * with the parser was understood.
 */
function uniqueId(label: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.id));
	let base =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'component';
	if (/^[0-9]/.test(base)) base = `_${base}`;
	let id = base;
	let counter = 2;
	while (taken.has(id)) id = `${base}_${counter++}`;
	return id;
}

function nextFreeRow(components: ComponentConfig[]): number {
	let next = 1;
	for (const component of components) {
		next = Math.max(next, component.position.row + component.position.height);
	}
	return next;
}
