import {
	App,
	ButtonComponent,
	debounce,
	Modal,
	Notice,
	Setting,
	TFile,
} from 'obsidian';
import { acceptsChildren } from './accepts-children';
import { getComponent, listComponentTypes, paletteEntries } from '../components';
import { componentDisplayName, placedComponentName } from './component-name';
import { ConfigPanel } from './config-panel';
import { showFieldError } from './field-error';
import { ConfirmModal } from '../ui/confirm-modal';
import { createLayout, listLayouts } from '../layouts';
import { ListContext } from './list-fields';
import type SheetsmithPlugin from '../main';
import {
	DEFAULT_COLUMNS,
	Layout,
	parseLayout,
	serialiseLayout,
} from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { describeCell, findOverlaps } from './preview-grid';
import {
	Schematic,
	SchematicGestures,
} from './schematic-gestures';
import { ComponentConfig, placesChildren } from '../types';
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
 * The outline of the layout editor: the picker naming which layout is open, the
 * schematics of the grids it holds, the tree of everything in it, and the row
 * that adds one. Knows no component types — the panel beside it builds a form
 * from each `configFields` declaration, and `config-panel.ts` is what draws it —
 * and knows nothing about a leaf either: it renders into an element it is
 * handed, and asks its host for the two pieces of posture that are the pane's to
 * remember.
 *
 * It still owns the *render*, which is why the class is not named for the
 * outline alone: it loads the file, draws both regions, and applies the pending
 * focus and flash afterwards. What it no longer holds is the configuration of
 * whatever is selected (`docs/PATTERNS.md` §11).
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
	/** The pointer and keyboard gestures on a schematic block. */
	private gestures: SchematicGestures;
	/**
	 * Inline errors, by the focus token of the field showing them. A redraw
	 * tears down the DOM they live in, so an error on one field would vanish
	 * because an unrelated field was corrected — the message goes with the
	 * field, not with the render that happened to draw it.
	 */
	private fieldErrors = new Map<string, string>();
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;
	/** The panel drawing whatever is selected, and the fields it holds. */
	private panel: ConfigPanel;

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
		// Arrow functions, and two of the six are the reason rather than all of
		// them. `redrawSchematics` lands on `drawSchematics`, so the mapping is a
		// rename and a bound method cannot carry one; `persist` needs the `void`,
		// because `this.persist` is async and `no-misused-promises` refuses a
		// promise-returning function where a void return is expected — measured,
		// not assumed: `.bind(this)` there is the one of the six that fails lint.
		// The other four would bind cleanly, and they are arrows to match, so the
		// block reads as one mapping rather than four of one kind and two of
		// another.
		//
		// Not the same reason `redraw` above is an arrow: that one composes three
		// steps, and this precedent is only about naming.
		this.gestures = new SchematicGestures({
			persist: () => void this.persist(),
			persistSoon: () => this.persistSoon(),
			markOverlaps: (schematic) => this.markOverlaps(schematic),
			// Delegated rather than answered here: those four fields are the
			// panel's own, minted under the panel's own token, so finding them
			// again from out here would be this half querying for controls the
			// other half drew.
			syncPositionFields: (config) => this.panel.syncPositionFields(config),
			redrawSchematics: () => this.drawSchematics(),
			select: (id) => this.select(id),
		});
		// The same mapping one region over, and the same reasons for the arrows.
		// `errors` is the exception and deliberately not a getter: the panel is
		// handed the map itself, so both halves write into one map rather than two
		// answering the same question.
		this.panel = new ConfigPanel({
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
			redrawSchematics: () => this.drawSchematics(),
			// The sheet's own schematic is the first, and a pane that gave up
			// before drawing one has none — which is why the guard is here rather
			// than in the field that asks.
			setGridColumns: (columns) => {
				const sheet = this.schematics[0];
				if (sheet) sheet.columns = columns;
			},
			errors: this.fieldErrors,
			listContext: () => this.listContext(),
		});
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
		// The panel's two textarea fields are read rather than waited on, and
		// either can be holding an edit when the pane closes. Which fields those
		// are is the panel's to know; that they are read before the write is
		// this method's.
		if (this.panel.commitPending()) void this.persist();
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

		this.panel.render(panel, layout, selected);

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
				showFieldError(input, message, this.fieldErrors);
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
			this.gestures.bindBlock(cell, config, schematic);
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
			'The grid, the function library, the reset triggers and the bonus types.',
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
