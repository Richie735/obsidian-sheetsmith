import {
	App,
	ButtonComponent,
	debounce,
	Modal,
	Notice,
	Platform,
	setIcon,
	Setting,
	TextComponent,
	TFile,
} from 'obsidian';
import { getComponent, listComponentTypes, paletteEntries } from '../components';
import { conditionMet } from './config-fields';
import { ConfirmModal } from '../ui/confirm-modal';
import {
	commitFunctionLibrary,
	FunctionLibraryField,
	renderFunctionLibrary,
} from './function-library-field';
import { createLayout, listLayouts } from '../layouts';
import {
	ListContext,
	addControlSpacers,
	copyableName,
	moveItem,
	renderColumnsEditor,
	renderRowsEditor,
	showFieldError,
} from './list-fields';
import type SheetsmithPlugin from '../main';
import {
	DEFAULT_COLUMNS,
	Layout,
	mayHoldChildren,
	parseLayout,
	serialiseLayout,
} from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { parseTriggers } from '../parse/triggers';
import { clamp, describeCell, findOverlaps, lastColumn } from './preview-grid';
import {
	commitTriggerList,
	renderTriggerList,
	TriggerListField,
} from './trigger-list-field';
import {
	ComponentConfig,
	isContainer,
	placesChildren,
	ResetBinding,
} from '../types';
import { childIsPlaced, innerPlacement } from '../view/grid-cells';
import { SheetView, VIEW_TYPE_SHEET } from '../view/sheet-view';

/** Dropdown sentinel; layout file names can never collide with it. */
const CREATE_LAYOUT_OPTION = '::create-layout::';

/** Ties the add menu to the description under it, for a screen reader. */
const ADD_DESCRIPTION_ID = 'sheetsmith-add-description';

/** Dropdown sentinel for a binding that acts on the buffer only. */
const NO_ACTION_OPTION = '::none::';

/** Dropdown sentinel for the top level; component ids can never collide. */
const SHEET_DESTINATION = '::sheet::';

/** Held as a constant because it is an expression, not prose to be cased. */
const RESET_FORMULA_EXAMPLE = 'mod(abilities.CON) * level';

/** Held as a constant because the examples are the names of games. */
const BUFFER_CLEAR_DESC =
	'Which event empties the buffer is a rule of the system, so the layout says it here: a long rest in 5e, the end of an encounter in 4e, the next score in Blades.';

/**
 * The three reset actions (SPEC §6), labelled as what they do to a component
 * rather than as the words stored. "Restore to max" reads as a pool's ceiling
 * and would read as nonsense over a toggle, which is why the stored names are
 * the states.
 */
const RESET_ACTIONS: readonly (readonly [string, string])[] = [
	['full', 'Restore to full'],
	['empty', 'Set to empty'],
	['formula', 'Set to a formula'],
	// A trigger may be about the buffer alone — 4e clears temporary hit points
	// at the end of an encounter and touches nothing else — so "nothing" is a
	// real choice here rather than the absence of one.
	[NO_ACTION_OPTION, 'Leave the value alone'],
];

/** How long a rebuilt region stays marked, before fading over its own transition. */
const FLASH_HOLD = 900;

/** Which pair of a block's four numbers a pointer drag is writing. */
type DragMode = 'move' | 'resize';

/**
 * One schematic on the tab: the sheet's, or an open container's own.
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
 * Form-based layout editor rendered inside the settings tab. Covers creating
 * layouts and configuring their components until the grid canvas (M4)
 * replaces it with a dedicated workspace view. Knows no component types:
 * component-specific fields come from each configFields declaration.
 *
 * Text fields commit on change (blur or Enter), never per keystroke, and
 * invalid input shows an inline error instead of being silently ignored.
 */
export class LayoutEditorSection {
	private plugin: SheetsmithPlugin;
	private redraw: () => void;
	private selected: string | null = null;
	/**
	 * Which component's form is open, by id rather than by index.
	 *
	 * An index into `layout.components` stopped meaning anything once a
	 * component could sit inside another: the list the editor shows is a
	 * depth-first walk, and a child's position in it is not a position in any
	 * one array. The id is what every other address here already uses.
	 */
	private editing: string | null = null;
	private file: TFile | null = null;
	private layout: Layout | null = null;
	/** The sheet's schematic first, then an open container's, while it is open. */
	private schematics: Schematic[] = [];
	/**
	 * The entry being dragged, in whichever list is mid-drag. One cursor for
	 * every list on the tab, so a drag started in one is never read as a drop
	 * into another; the list editors in list-fields.ts share this object.
	 */
	private drag: { index: number | null } = { index: null };
	/** Focus token to apply after the next render, e.g. a newly added row. */
	private pendingFocus: string | null = null;
	/** Region to mark after the next render, e.g. fields a type change built. */
	private pendingFlash: string | null = null;
	/** The tab's own element, for the updates that must not rebuild it. */
	private containerEl: HTMLElement | null = null;
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

	constructor(plugin: SheetsmithPlugin, redraw: () => void) {
		this.plugin = plugin;
		// A redraw tears the tab down and builds the function library back from
		// the layout, so anything typed into it has to be read out first or it
		// is gone. Blur is not enough on its own: a pointerdown on the grid
		// calls preventDefault, which suppresses the focus change and with it
		// the textarea's change event, so clicking a block after typing a
		// definition would discard it. Wrapped here rather than guarded at each
		// call site — there are a dozen, and the one that gets missed is the
		// one that loses a library.
		this.redraw = () => {
			this.flush();
			redraw();
		};
	}

	/** Write any pending edit now. Called before a redraw, and on tab close. */
	flush(): void {
		// Both are read rather than waited on, and either can be holding an
		// edit when the tab closes. Evaluated into locals first: `||` would
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
		this.editing = null;
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

	async render(container: HTMLElement): Promise<void> {
		this.containerEl = container;
		new Setting(container).setHeading().setName('Layouts');

		const files = listLayouts(
			this.plugin.app,
			this.plugin.settings.layoutFolder,
		);

		if (files.length === 0) {
			new Setting(container)
				.setName('Layout')
				.setDesc('No layouts yet.')
				.addButton((button) =>
					button
						.setButtonText('Create layout')
						.setCta()
						.onClick(() => this.promptCreateLayout()),
				);
			return;
		}

		if (
			this.selected === null ||
			!files.some((file) => file.basename === this.selected)
		) {
			this.selected = files[0]?.basename ?? null;
			this.releaseLayout();
		}
		this.renderSelectionRow(container, files);

		const selectedFile = files.find((file) => file.basename === this.selected);
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
				container.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`This layout cannot be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
			// A redraw may have emptied and rebuilt the settings container
			// while the read was in flight; only the newest run may append.
			if (run !== this.renderId) return;
			try {
				this.layout = parseLayout(source);
			} catch (error) {
				this.layout = null;
				container.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`This layout cannot be edited until its file is fixed: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
		}

		// Registered before the forms are built, drawn after: an open container
		// contributes a schematic of its own from inside its form, and both have
		// to be on the list before either is drawn.
		this.schematics = [
			{
				el: container.createDiv('sheetsmith-layout-preview'),
				components: this.layout.components,
				columns: this.layout.columns ?? DEFAULT_COLUMNS,
			},
		];
		this.renderAddRow(container, this.layout);
		this.renderComponents(container, this.layout);
		this.drawSchematics();
		this.triggers = renderTriggerList(container, this.layout, {
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
		});
		this.functions = renderFunctionLibrary(container, this.layout, {
			persist: () => void this.persist(),
		});

		this.restoreFieldErrors(container);

		if (this.pendingFlash !== null) {
			this.flash(container, this.pendingFlash);
			this.pendingFlash = null;
		}

		if (this.pendingFocus !== null) {
			this.refocus(container, this.pendingFocus);
			this.pendingFocus = null;
		}
	}

	/**
	 * Put back the inline errors whose field is still on screen, and forget
	 * the ones whose field is gone — a message about a control that no longer
	 * exists is worse than no message.
	 */
	/** Show an inline error, and remember it across the next rebuild. */
	private fieldError(input: HTMLInputElement, message: string | null): void {
		showFieldError(input, message, this.fieldErrors);
	}

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
			.setName('Layout')
			.addDropdown((dropdown) => {
				for (const file of files) {
					dropdown.addOption(file.basename, file.basename);
				}
				dropdown.addOption(CREATE_LAYOUT_OPTION, 'New layout…');
				dropdown.setValue(this.selected ?? '');
				dropdown.onChange((value) => {
					if (value === CREATE_LAYOUT_OPTION) {
						// The modal redraws on close either way, which also
						// snaps the dropdown back if the user cancels.
						this.promptCreateLayout();
						return;
					}
					this.selected = value;
					this.releaseLayout();
					this.redraw();
				});
			})
			.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('Delete layout')
					.onClick(() => {
						const file = files.find(
							(candidate) => candidate.basename === this.selected,
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
		this.selected = null;
		this.releaseLayout();
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
		this.selected = name;
		this.releaseLayout();
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
		// nothing else on the tab is rebuilt here, so nothing else has lost its
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
			if (config.id === this.editing) cell.addClass('sheetsmith-preview-editing');
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
				// "put it here", not "open the form".
				if (this.dragged) return;
				this.editing = this.editing === config.id ? null : config.id;
				this.redraw();
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
		// by being written, not by rebuilding the tab around them. Holding an
		// arrow key is the one gesture here that is rapid-fire by design, and
		// a full teardown per repeat is the latency cliff it would fall off.
		// The write is already debounced; this is the other half of that.
		this.syncPositionFields(config);
	}

	/** Write a component's position back into its open form, if it has one. */
	private syncPositionFields(config: ComponentConfig): void {
		const container = this.containerEl;
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
		// the editor can walk into — the rule itself is `mayHoldChildren`, in
		// the parser, rather than a second copy of the comparison here.
		const destinations = walkComponents(layout.components).filter(
			(entry) =>
				isContainer(getComponent(entry.config.type)) &&
				mayHoldChildren(entry.depth),
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
				this.editing = list[list.length - 1]?.id ?? null;
				void this.persist();
				this.redraw();
			}),
		);
	}

	/**
	 * One row per component, a container's children indented beneath it.
	 *
	 * The list is the same depth-first walk the sheet reads in, so what the
	 * editor shows in order is what the sheet reflows and tabs through in order
	 * — one level of disclosure, which is the smallest thing that is honestly
	 * authorable and no more. The prior art says nesting is where the pain lands,
	 * and it lands in the editor rather than in the rendered sheet.
	 */
	private renderComponents(container: HTMLElement, layout: Layout): void {
		for (const { config, depth, siblings, parent } of walkComponents(
			layout.components,
		)) {
			const open = this.editing === config.id;
			const row = new Setting(container)
				.setName(config.label)
				.setDesc(componentDisplayName(config.type));
			if (open) row.settingEl.addClass('sheetsmith-row-open');
			if (depth > 0) {
				row.settingEl.addClass('sheetsmith-row-child');
				// The depth rather than a class per level: the indent is
				// arithmetic, and two classes saying "one in" and "two in" would
				// be two places to change if the bound ever moved.
				row.settingEl.style.setProperty(
					'--sheetsmith-row-depth',
					String(depth),
				);
			}
			row.addExtraButton((button) => {
				button
					.setIcon(open ? 'chevron-down' : 'chevron-right')
					.setTooltip(open ? 'Close' : 'Edit')
					.onClick(() => {
						this.editing = open ? null : config.id;
						this.redraw();
					});
				button.extraSettingsEl.dataset.sheetsmithFocus = `edit-${config.id}`;
			});
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
								this.editing = null;
								void this.persist();
								this.redraw();
							},
						).open();
					});
				button.extraSettingsEl.dataset.sheetsmithFocus = `remove-${config.id}`;
			});
			if (open) {
				this.renderComponentForm(container, layout, config, depth, parent);
			}
		}
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
				.setDesc(componentDisplayName(tab.type));
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
		// grid to fill. The add row already withholds it as a destination, so a
		// schematic here would be the tab giving two answers to one rule — and
		// the author chose this type deliberately, so silence is worse than a
		// sentence.
		if (isContainer(definition) && !mayHoldChildren(depth)) {
			form.createDiv({ cls: 'setting-item-description' }, (el) =>
				el.setText(
					'This component sits inside two containers, so it can hold nothing: a container may hold containers only one level deep. Move it up a level to put components in it.',
				),
			);
		}

		// A container that shows one child at a time gets an ordered list, not a
		// grid. Its children have no placement — each fills the region in turn —
		// so a schematic would draw every one of them in the same cell and
		// `findOverlaps` would report each as overlapping all the others, which is
		// true of the rectangles and says nothing about the layout. The order is
		// the only thing there is to edit, and it is the one thing a grid could
		// not have edited.
		if (
			isContainer(definition) &&
			mayHoldChildren(depth) &&
			!placesChildren(definition)
		) {
			this.renderChildOrder(form, config);
		}

		// A container's own schematic, above its settings: its children sit on
		// its grid, not the sheet's, so the sheet's schematic cannot show where
		// they are. The same drawing against a different column count, which is
		// why `preview-grid.ts` needed no change for any of this.
		//
		// The count comes from `innerPlacement`, the same function the sheet
		// draws through, and not from `config.position.width`. This container may
		// itself be a tab, and then its own four numbers are read by nothing: the
		// box is the tab set's, so a stale width copied in at creation would have
		// the editor drawing, describing and clamping against a grid the sheet
		// does not have.
		const inner = innerPlacement(config, parent);
		if (
			isContainer(definition) &&
			mayHoldChildren(depth) &&
			placesChildren(definition)
		) {
			form.createDiv(
				{ cls: 'setting-item-description' },
				(el) =>
					el.setText(
						`Components inside this one, on its own grid of ${inner.width} columns by ${inner.height} rows. Cells nothing fills stay empty on the sheet.`,
					),
			);
			this.schematics.push({
				el: form.createDiv('sheetsmith-layout-preview'),
				// Read, never created: drawing a form must not write a key into
				// the config. A `children: []` written here onto a component two
				// containers deep is a layout `parseLayout` refuses, so `persist`
				// would refuse every later save and the author would lose edits to
				// a message about a depth rule they never broke. Nothing pushes
				// into this list — a drag moves an existing block, and the add row
				// creates the key itself — so a throwaway array is enough.
				components: config.children ?? [],
				columns: inner.width,
				rows: inner.height,
			});
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

		// `reset` is shared config, so the editor renders it rather than the
		// component declaring it — which is also why RESERVED_KEYS forbids a
		// component from declaring it. Only components that can act on one are
		// offered it, and implementing `applyReset` is what says so.
		if (definition.applyReset !== undefined) {
			this.renderResetField(form, layout, config);
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
					this.renderEntriesEditor(
						listEl,
						config,
						record,
						field.key,
						field.kind === 'track-rows',
					);
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

	/**
	 * The reset binding (SPEC §6), for a component that can act on one.
	 *
	 * Three controls rather than one, because the action decides whether the
	 * expression field means anything: `full` and `empty` need nothing typed,
	 * and only `formula` carries a `to`. Unbinding is a first-class choice in
	 * the trigger dropdown rather than a cleared text field, since "resets on
	 * nothing" is a state a layout holds deliberately.
	 */
	private renderResetField(
		form: HTMLElement,
		layout: Layout,
		config: ComponentConfig,
	): void {
		const { names, problems } = parseTriggers(layout);
		const bindings = config.reset ?? [];

		groupHeading(
			form,
			'Resets on',
			names.length === 0
				? 'This layout declares no triggers yet. Add one below and it appears here.'
				: 'Which triggers restore this component, and what each restores it to. A system whose long rest also covers its short rest binds to both.',
			bindings.length,
		);

		bindings.forEach((reset, index) => {
			const setting = new Setting(form).setName(`Trigger ${index + 1}`);

			setting.addDropdown((dropdown) => {
				for (const name of names) dropdown.addOption(name, name);
				// A binding pointing at a trigger that no longer exists still has
				// to be selectable, or opening the form would silently rebind the
				// component to whatever happened to be first.
				if (!names.includes(reset.trigger)) {
					dropdown.addOption(reset.trigger, `${reset.trigger} (not declared)`);
				}
				dropdown.setValue(reset.trigger);
				dropdown.selectEl.dataset.sheetsmithFocus = `reset-trigger-${config.id}-${index}`;
				dropdown.onChange((value) => {
					// Two bindings on one trigger have no sensible reading, and
					// the parser refuses the file over it — so it is refused
					// here, where it can still be corrected.
					if (bindings.some((other) => other !== reset && other.trigger === value)) {
						showFieldError(
							dropdown.selectEl,
							'This component already resets on that trigger.',
						);
						dropdown.setValue(reset.trigger);
						return;
					}
					reset.trigger = value;
					void this.persist();
					this.redraw();
				});
			});

			// Asked of the component, never inferred: the editor knowing that a
			// Pool has temporary points and a Track does not is exactly the
			// coupling the contract exists to prevent.
			const buffered = getComponent(config.type)?.hasBuffer === true;

			setting.addDropdown((dropdown) => {
				for (const [value, label] of RESET_ACTIONS) {
					// Leaving the value alone is only a choice where something
					// else on the binding can still act; otherwise it would be a
					// binding that does nothing, which the parser refuses.
					if (value === NO_ACTION_OPTION && !buffered) continue;
					dropdown.addOption(value, label);
				}
				dropdown.setValue(reset.action ?? NO_ACTION_OPTION);
				dropdown.selectEl.dataset.sheetsmithFocus = `reset-action-${config.id}-${index}`;
				dropdown.onChange((value) => {
					if (value === NO_ACTION_OPTION) {
						delete reset.action;
						// Something has to happen, so the buffer takes over.
						reset.buffer = 'clear';
					} else {
						// The expression is kept when the action moves off
						// formula, so switching away and back does not throw away
						// what was typed. parseReset keeps it too.
						reset.action = value as ResetBinding['action'];
					}
					void this.persist();
					this.redraw();
				});
			});

			if (buffered) {
				new Setting(form)
					.setName('Also clear temporary points')
					.setDesc(BUFFER_CLEAR_DESC)
					.addToggle((toggle) => {
						toggle.setValue(reset.buffer === 'clear');
						toggle.toggleEl.dataset.sheetsmithFocus = `reset-buffer-${config.id}-${index}`;
						toggle.onChange((on) => {
							if (on) reset.buffer = 'clear';
							else if (reset.action === undefined) {
								// The binding would be left doing nothing at all.
								showFieldError(
									toggle.toggleEl.querySelector('input') ??
										toggle.toggleEl.createEl('input'),
									'Give the binding an action first, or remove it.',
								);
								toggle.setValue(true);
								return;
							} else delete reset.buffer;
							void this.persist();
							this.redraw();
						});
					});
			}

			setting.addExtraButton((button) =>
				button
					.setIcon('trash-2')
					.setTooltip('Remove this reset')
					.onClick(() => {
						bindings.splice(index, 1);
						if (bindings.length === 0) delete config.reset;
						void this.persist();
						this.redraw();
					}),
			);

			if (reset.action === 'formula') {
				new Setting(form)
					.setName('Resets to')
					.setDesc(
						// The example goes in a code element rather than the prose,
						// as the function library's does: an expression is not a
						// sentence, and sentence-casing it would change what it means.
						createFragment((fragment) => {
							fragment.appendText('Formula giving the value to restore.');
							fragment.createEl('br');
							fragment.createEl('code', { text: RESET_FORMULA_EXAMPLE });
						}),
					)
					.addText((text) => {
						text.setValue(reset.to ?? '');
						text.inputEl.dataset.sheetsmithFocus = `reset-to-${config.id}-${index}`;
						onCommit(text, (raw) => {
							const trimmed = raw.trim();
							if (trimmed === '') {
								// The layout would not load: parseReset requires an
								// expression for this action.
								this.fieldError(
									text.inputEl,
									'A formula reset needs an expression.',
								);
								return;
							}
							this.fieldError(text.inputEl, null);
							reset.to = trimmed;
							void this.persist();
						});
					});
			}
		});

		// Only triggers this component is not already bound to: offering one it
		// answers to already would create the duplicate the parser refuses.
		const available = names.filter(
			(name) => !bindings.some((reset) => reset.trigger === name),
		);
		new Setting(form).addButton((button) =>
			button
				.setButtonText('Add reset')
				.setDisabled(available.length === 0)
				.setTooltip(
					names.length === 0
						? 'Declare a trigger below first.'
						: available.length === 0
							? 'This component already resets on every trigger.'
							: 'Bind this component to another trigger.',
				)
				.onClick(() => {
					const trigger = available[0];
					if (trigger === undefined) return;
					// Restoring to full is what a reset means most of the time,
					// and an action is required, so it is the one that gets to
					// be assumed.
					config.reset = [...bindings, { trigger, action: 'full' }];
					void this.persist();
					this.redraw();
				}),
		);

		// Only this component's own problems. The trigger list below shows every
		// one, which is where the whole picture belongs.
		for (const problem of problems.filter((p) => p.component === config.label)) {
			form.createDiv('sheetsmith-error', (el) => el.setText(problem.message));
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

	/** Ordered { key, name? } list with add, remove, and reorder controls. */
	/**
	 * The entry table is plain divs on its own grid template, not
	 * Setting rows — reusing Setting here meant deleting half its structure
	 * and overriding theme-styled internals.
	 *
	 * Focus ids use two schemes on purpose: inputs are keyed by index so
	 * focus holds its position while typing, buttons by entry key so
	 * focus follows the item through a reorder.
	 */
	private renderEntriesEditor(
		listEl: HTMLElement,
		config: ComponentConfig,
		record: Record<string, unknown>,
		key: string,
		/** Also edit a length and a sense per entry, which is what a track's rows add. */
		withCount = false,
	): void {
		if (!Array.isArray(record[key])) record[key] = [];
		// A third content column changes both grids — the header's and the
		// row's — and neither can be inferred from the markup, so the list
		// says so once and the stylesheet reads it.
		listEl.toggleClass('sheetsmith-entry-counted', withCount);
		const list = record[key] as {
			key: string;
			name?: string;
			count?: string | number;
			sense?: string;
		}[];

		if (list.length === 0) {
			listEl.createDiv('sheetsmith-entry-empty', (el) =>
				el.setText(withCount ? 'No rows yet.' : 'No entries yet.'),
			);
		} else {
			const columns = listEl.createDiv('sheetsmith-entry-columns');
			columns.createSpan({ text: 'Key' });
			columns.createSpan({ text: withCount ? 'Name' : 'Full name' });
			if (withCount) {
				columns.createSpan({ text: 'Segments' });
				columns.createSpan({ text: 'Sense' });
				/*
				 * The header has to carry the row's control tracks too, or its
				 * last label does not line up with the last input.
				 *
				 * With two content columns this never showed: the second label
				 * is left-aligned at the start of the `1fr` track, and where a
				 * track starts does not depend on how wide it is. A column
				 * after that track does depend on it — the row spends
				 * width on its buttons, its `1fr` is narrower than the
				 * header's, and everything past it slides left.
				 */
				addControlSpacers(columns);
			}
		}

		list.forEach((entry, index) => {
			const row = listEl.createDiv('sheetsmith-entry-row');
			row.addEventListener('dragover', (event) => {
				if (this.drag.index === null) return;
				event.preventDefault();
				// moveEntry lands the row above the target on upward
				// drags and below it on downward ones; the indicator must
				// say so, not always point above.
				row.toggleClass(
					'sheetsmith-entry-drop-below',
					index > this.drag.index,
				);
				row.toggleClass('sheetsmith-entry-drop', index < this.drag.index);
			});
			row.addEventListener('dragleave', () => {
				row.removeClass('sheetsmith-entry-drop');
				row.removeClass('sheetsmith-entry-drop-below');
			});
			row.addEventListener('drop', (event) => {
				event.preventDefault();
				row.removeClass('sheetsmith-entry-drop');
				row.removeClass('sheetsmith-entry-drop-below');
				if (this.drag.index === null || this.drag.index === index) return;
				this.moveEntry(list, this.drag.index, index);
				this.drag.index = null;
			});

			const keyInput = row.createEl('input', {
				type: 'text',
				attr: { placeholder: 'Key', 'aria-label': 'Attribute key' },
			});
			keyInput.value = entry.key;
			keyInput.dataset.sheetsmithFocus = `attr-${config.id}-${index}-key`;
			keyInput.addEventListener('change', () => {
				const next = keyInput.value.trim();
				if (next === '') {
					showFieldError(keyInput, 'A key is required.');
					return;
				}
				if (list.some((other, i) => i !== index && other.key === next)) {
					showFieldError(
						keyInput,
						`"${next}" is already used by another entry.`,
					);
					return;
				}
				showFieldError(keyInput, null);
				entry.key = next;
				void this.persist();
				this.redraw();
			});

			const nameInput = row.createEl('input', {
				type: 'text',
				attr: { placeholder: 'Full name', 'aria-label': 'Attribute full name' },
			});
			nameInput.value = entry.name ?? '';
			// Keyed by identity, unlike the key input: name commits do not
			// redraw, so the only redraw this input lives through is a
			// reorder — where focus should follow the item.
			nameInput.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-name`;
			nameInput.addEventListener('change', () => {
				const next = nameInput.value.trim();
				if (next === '') {
					delete entry.name;
				} else {
					entry.name = next;
				}
				void this.persist();
			});

			if (withCount) {
				// A formula, not a number field: a caster's slots come from a
				// level table, so a row's length is as much an expression as
				// the component's own. Empty falls back to that one, which is
				// why clearing it is a state rather than an error.
				const countInput = row.createEl('input', {
					type: 'text',
					attr: {
						placeholder: 'Segments',
						'aria-label': `${entry.key} segments`,
					},
				});
				countInput.value =
					entry.count === undefined ? '' : String(entry.count);
				countInput.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-count`;
				countInput.addEventListener('change', () => {
					const next = countInput.value.trim();
					if (next === '') {
						delete entry.count;
					} else {
						// A bare number is stored as one, so a layout file
						// reads `count: 5` rather than `count: "5"`.
						const parsed = Number(next);
						entry.count = Number.isFinite(parsed) ? parsed : next;
					}
					void this.persist();
				});

				// Blank is the card's own sense, which is what a set whose
				// rows all mean the same thing leaves it as. Death saves are
				// why it is here: successes and failures are one shape pointed
				// two ways, and a card painting both alike says the wrong
				// thing about one of them.
				const senseInput = row.createEl('select', {
					attr: { 'aria-label': `${entry.key} sense` },
				});
				for (const [value, text] of [
					['', 'Same as card'],
					['progress', 'Progress'],
					['harm', 'Harm'],
				] as const) {
					senseInput.createEl('option', { value, text });
				}
				senseInput.value = entry.sense ?? '';
				senseInput.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-sense`;
				senseInput.addEventListener('change', () => {
					if (senseInput.value === '') {
						delete entry.sense;
					} else {
						entry.sense = senseInput.value;
					}
					void this.persist();
				});
			}

			if (Platform.isMobile) {
				// HTML5 drag-and-drop is inert on touch, and there is no
				// keyboard — reordering needs real buttons there.
				const up = row.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Move up' },
				});
				setIcon(up, 'arrow-up');
				up.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-up`;
				up.addEventListener('click', () =>
					this.moveEntry(list, index, index - 1),
				);
				const down = row.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Move down' },
				});
				setIcon(down, 'arrow-down');
				down.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-down`;
				down.addEventListener('click', () =>
					this.moveEntry(list, index, index + 1),
				);
			} else {
				const handle = row.createEl('button', {
					cls: 'clickable-icon sheetsmith-entry-handle',
					attr: {
						'aria-label': 'Reorder: drag, or press the arrow keys',
						draggable: 'true',
					},
				});
				setIcon(handle, 'grip-vertical');
				handle.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-handle`;
				handle.addEventListener('dragstart', (event) => {
					this.drag.index = index;
					event.dataTransfer?.setData('text/plain', entry.key);
				});
				handle.addEventListener('dragend', () => {
					this.drag.index = null;
				});
				handle.addEventListener('keydown', (event) => {
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						this.moveEntry(list, index, index - 1);
					} else if (event.key === 'ArrowDown') {
						event.preventDefault();
						this.moveEntry(list, index, index + 1);
					}
				});
			}

			const remove = row.createEl('button', {
				cls: 'clickable-icon',
				attr: { 'aria-label': 'Remove entry' },
			});
			setIcon(remove, 'trash');
			remove.dataset.sheetsmithFocus = `attr-${config.id}-${entry.key}-remove`;
			remove.addEventListener('click', () => {
				list.splice(index, 1);
				void this.persist();
				this.redraw();
			});
		});

		const footer = listEl.createDiv('sheetsmith-entry-footer');
		const add = footer.createEl('button', { text: 'Add entry' });
		add.addEventListener('click', () => {
			const taken = new Set(list.map((entry) => entry.key));
			// Same shape as the row and column lists: a new entry is named for
			// what it is, capitalised, and focus lands on it to be renamed.
			let next = 'New entry';
			let counter = 2;
			while (taken.has(next)) next = `New entry ${counter++}`;
			// The obvious next action is typing the key; put focus there.
			this.pendingFocus = `attr-${config.id}-${list.length}-key`;
			list.push({ key: next });
			void this.persist();
			this.redraw();
		});
	}

	private moveEntry(
		list: { key: string; name?: string }[],
		from: number,
		to: number,
	): void {
		moveItem(list, from, to, this.listContext());
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
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(
			VIEW_TYPE_SHEET,
		)) {
			if (leaf.view instanceof SheetView) leaf.view.refresh();
		}
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
 * One treatment for every group heading inside a component form, whether it
 * heads a run of fields sharing a `group` or a list field such as entries.
 * Both sit at the same level, so both must look the same; rendering them from
 * two code paths is what let them drift apart.
 */
function groupHeading(
	form: HTMLElement,
	title: string,
	description?: string,
	/** Entries in the list this heads, so a bounded list says what it holds. */
	count?: number,
): void {
	const heading = form.createDiv('sheetsmith-form-group');
	heading.createDiv({ cls: 'sheetsmith-form-group-title' }, (el) => {
		el.appendText(title);
		if (count !== undefined) {
			el.createSpan({ cls: 'sheetsmith-form-group-count', text: String(count) });
		}
	});
	if (description) {
		heading.createDiv({ cls: 'setting-item-description', text: description });
	}
}

/** Commit on change (blur or Enter), never per keystroke. */
function onCommit(
	text: TextComponent,
	handler: (value: string) => void,
): void {
	text.inputEl.addEventListener('change', () => handler(text.inputEl.value));
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
 * one row of the settings tab. Spelled twice they agreed only by accident: one
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
