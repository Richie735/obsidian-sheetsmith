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
import { listComponentTypes, paletteEntries } from '../components';
import { Canvas } from './canvas';
import { componentDisplayName } from './component-name';
import { ConfigPanel } from './config-panel';
import { showFieldError } from './field-error';
import { focusToken } from './focus-token';
import { ConfirmModal } from '../ui/confirm-modal';
import { createLayout, listLayouts } from '../layouts';
import { ListContext } from './list-fields';
import type SheetsmithPlugin from '../main';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { nextFreeRow, renderTree, SHEET_DESTINATION } from './tree';
import { ComponentConfig } from '../types';
import { UndoStack } from './undo-stack';
import { childIsPlaced } from '../view/grid-cells';

/** Dropdown sentinel; layout file names can never collide with it. */
const CREATE_LAYOUT_OPTION = '::create-layout::';

/** Ties the add menu to the description under it, for a screen reader. */
const ADD_DESCRIPTION_ID = 'sheetsmith-add-description';

/**
 * The top level, wherever something has to be named that is not a component.
 *
 * Defined in `tree.ts` and re-exported here: the tree needs it to draw and
 * select the layout's own row, and this module needs it for the same
 * question one level up (the **Add component** row's destination, and what
 * the panel configures when nothing else is selected) — declaring it in
 * whichever of the two imports the other would make a cycle of two runtime
 * values, where this file already imports `renderTree` from `tree.ts`.
 */
export { SHEET_DESTINATION };

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
	/**
	 * The entry being dragged, in whichever list is mid-drag. One cursor for
	 * every list in the pane, so a drag started in one is never read as a drop
	 * into another; the list editors in list-fields.ts share this object.
	 */
	private drag: { index: number | null } = { index: null };
	/**
	 * The component id mid-drag in the tree, shared with `tree.ts` the way
	 * `drag` above is shared with `list-fields.ts` — a drag started on one
	 * row has to be read by whichever row the pointer ends up over.
	 */
	private treeDrag: { id: string | null } = { id: null };
	/** Focus token to apply after the next render, e.g. a newly added row. */
	private pendingFocus: string | null = null;
	/** Region to mark after the next render, e.g. fields a type change built. */
	private pendingFlash: string | null = null;
	/** The pane's own element, for the updates that must not rebuild it. */
	private rootEl: HTMLElement | null = null;
	/** The two regions of the last render, or null before the first. */
	private regions: Regions | null = null;
	/** The layout's live render and its gestures (`docs/features/grid-canvas.md`). */
	private canvas: Canvas;
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
	/**
	 * The layout's bytes as this session last knew them on disk: what the
	 * initial read produced, or what the last successful `persist` wrote.
	 *
	 * The undo stack's baseline. `persist` cannot diff against `this.layout`
	 * itself, because every mutation site has already changed it in place by
	 * the time `persist` runs — this is the only record of what the file held
	 * *before* the write about to happen, which is exactly what a step needs
	 * to push. Null before a layout has been loaded.
	 */
	private onDisk: string | null = null;
	/**
	 * Whether the canvas is drawn with each component's own sample values
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * **Per pane, on for a pane that has just opened, and never written
	 * anywhere.** It is posture rather than content — no layout key, no
	 * frontmatter key, no preference — so `persist` is not called for it and the
	 * settings tab does not offer it: a third row there would be a persisted
	 * answer to a question that only exists while a pane is open. It lives here
	 * rather than on `LayoutEditorHost` because nothing outside this class asks
	 * it, unlike the two the pane owns; a redraw for any other reason keeps it,
	 * and closing the pane forgets it.
	 *
	 * On by default, because an empty canvas is the state that *hides* what a
	 * preview exists to reveal — a column too narrow for its number, a table that
	 * pushes its neighbour off the grid, a formula that reads fine at zero — and
	 * the row above the canvas turns it off in one press.
	 */
	private sampleValues = true;
	/** Undo and redo history, one snapshot per `persist` that changed a byte. */
	private undoStack = new UndoStack();
	private redoStack = new UndoStack();

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
		// What the canvas reads `sampleValues` through, declared out here because a
		// getter cannot be an arrow and `this` inside the object literal below is
		// the host rather than this section.
		const samplesOn = (): boolean => this.sampleValues;
		// Arrow functions throughout, for the reasons `redraw` above states for
		// itself and `persist` states for the `void`: `this.persist` is async and
		// `no-misused-promises` refuses a promise-returning function where a void
		// return is expected, measured rather than assumed — `.bind(this)` there
		// fails lint. The rest are arrows to match, so the block reads as one
		// mapping rather than a mix of two kinds.
		this.canvas = new Canvas({
			persist: () => void this.persist(),
			persistSoon: () => this.persistSoon(),
			// Delegated rather than answered here: those four fields are the
			// panel's own, minted under the panel's own token, so finding them
			// again from out here would be this half querying for controls the
			// other half drew.
			syncPositionFields: (config) => this.panel.syncPositionFields(config),
			select: (id) => this.select(id),
			get selection(): string {
				return host.selection;
			},
			// The live answer rather than a copy taken when the canvas was
			// constructed, which is the same rule `selection` above follows.
			get sampleValues(): boolean {
				return samplesOn();
			},
		});
		// The same mapping one region over, and the same reasons for the arrows.
		// `errors` is the exception and deliberately not a getter: the panel is
		// handed the map itself, so both halves write into one map rather than two
		// answering the same question.
		this.panel = new ConfigPanel({
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
			redrawSchematics: () => this.canvas.redraw(),
			// The canvas reads `layout.columns` itself on every draw, so there is
			// nothing left for this to write — `redrawSchematics` right after it
			// is what actually shows the new count. Kept on `ConfigPanelHost`
			// rather than removed, since `config-panel.ts` is unchanged by this
			// feature and the field still names a real question the panel asks.
			setGridColumns: () => undefined,
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
	 *
	 * Every caller of this method is a real change of which layout is open —
	 * the picker, deleting the open one, creating a new one, or `render`
	 * correcting a name that no longer exists — so this is also where the
	 * undo history is scoped per layout (`docs/features/editor-undo.md`): an
	 * author's undo posture belongs to the file they were editing, and Mod+Z
	 * reaching across a switch to rewrite a *different* layout would be a
	 * worse surprise than an empty stack.
	 */
	private releaseLayout(): void {
		this.flush();
		this.file = null;
		this.layout = null;
		this.onDisk = null;
		this.undoStack.clear();
		this.redoStack.clear();
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
			// The undo baseline for this freshly loaded layout. Constraint 3
			// makes `source` itself safe to use rather than re-serialising: a
			// parse then serialise with nothing changed is byte-identical.
			this.onDisk = source;
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

		// Above the canvas it governs and under the picker, which is where the
		// pane's other two `Setting` rows sit — and only once there is a canvas
		// for it to govern, so the row never stands over the two states that
		// draw no layout at all.
		this.renderSampleRow(outline);
		// The canvas draws the whole tree live, in one pass, whatever is
		// selected — `docs/features/grid-canvas.md` §4 retires the old
		// selection-gated schematic here.
		this.canvas.draw(outline.createDiv(), layout);
		renderTree(outline, layout, {
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
			select: (id) => this.select(id),
			// A snapshot rather than a live getter: every reader of this host
			// is either synchronous within this one render (the rows'
			// selected mark) or a later command with nothing to do with
			// selection, so there is no stale copy for a getter to avoid.
			selection: this.host.selection,
			confirm: (message, cta, onConfirm) =>
				new ConfirmModal(this.plugin.app, message, cta, onConfirm).open(),
			drag: this.treeDrag,
		});
		this.renderAddRow(outline, layout);

		this.panel.render(panel, layout, selected);

		this.restoreFieldErrors(container);

		if (this.pendingFlash !== null) {
			this.flash(panel, this.pendingFlash);
			this.pendingFlash = null;
		}

		if (this.pendingFocus !== null) {
			focusToken(container, this.pendingFocus);
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

	/**
	 * The **Sample values** row: whether the canvas is filled or empty
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * **A row of the pane's own chrome, not a field in the configuration
	 * panel**, even though the Layout row's panel is where a layout's own
	 * settings live: everything in that panel writes the layout file, and this
	 * writes nothing. A view-state switch among fields that persist is a
	 * confusion worth one row of chrome to avoid.
	 *
	 * Toggling redraws the canvas and nothing else — no `persist`, so no undo
	 * step, and the tree's selection, the panel's fields and the scroll position
	 * all survive it. The focus token is what puts an author back on this control
	 * when a full pane redraw happens for some other reason.
	 */
	private renderSampleRow(container: HTMLElement): void {
		new Setting(container)
			.setName('Sample values')
			// The second sentence is the one worth having: the first thing a
			// cautious author wonders on seeing numbers appear is whose they are.
			.setDesc(
				'Draw the canvas with example values instead of an empty character\'s. Nothing is written to any note.',
			)
			.addToggle((toggle) => {
				toggle.setValue(this.sampleValues);
				toggle.toggleEl.dataset.sheetsmithFocus = 'sample-values';
				toggle.onChange((value) => {
					this.sampleValues = value;
					this.canvas.redraw();
				});
			});
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
		row.settingEl.addClass('sheetsmith-add-row', 'sheetsmith-wrapping-row');
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
	 *
	 * `record` is the only thing that separates an author's own edit from an
	 * undo or a redo replaying one: every ordinary call site keeps calling
	 * this with no argument, so `true` is what a mutation has always meant,
	 * and `undo`/`redo` below are the only two callers that pass `false`. A
	 * `record` write pushes what the file held *before* this write onto the
	 * undo stack and clears the redo stack — the standard rule that a fresh
	 * edit forgets whatever a redo could have replayed — but only where the
	 * write actually changes a byte: opening a form calls this on the way
	 * past nothing that changed it, and a step that did nothing is not a step
	 * to undo. An `undo`/`redo` write skips both, because the caller already
	 * did its own push onto the *other* stack before calling this.
	 */
	private async persist(record = true): Promise<void> {
		if (!this.file || !this.layout) return;
		let serialised: string;
		try {
			serialised = serialiseLayout(this.layout);
			parseLayout(serialised);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			return;
		}
		if (record && serialised !== this.onDisk) {
			if (this.onDisk !== null) this.undoStack.push(this.onDisk);
			this.redoStack.clear();
		}
		this.onDisk = serialised;
		await this.plugin.app.vault.modify(this.file, serialised);
		this.host.refreshSheets();
	}

	/**
	 * Put the layout back to a snapshot popped off an undo or a redo stack.
	 *
	 * Re-parses rather than diffing, on the same argument the mechanism as a
	 * whole rests on (`docs/features/editor-undo.md`): a whole-file snapshot
	 * restores everything a multi-part mutation touched by construction. The
	 * write goes through `persist(false)`, so this does not itself touch
	 * either stack — the caller already pushed what it is leaving onto the
	 * other one.
	 *
	 * The selection fallback the feature promises needs no code of its own:
	 * `render`'s existing rule already corrects `host.selection` to
	 * `SHEET_DESTINATION` whenever it names a component the current
	 * `this.layout` does not hold, and that rule runs on every redraw
	 * regardless of why `this.layout` changed.
	 */
	private restoreSnapshot(snapshot: string): void {
		this.layout = parseLayout(snapshot);
		this.redraw();
		void this.persist(false);
	}

	/**
	 * Undo the most recent recorded mutation. Returns whether there was one.
	 */
	undo(): boolean {
		const snapshot = this.undoStack.pop();
		if (snapshot === undefined || !this.file) return false;
		if (this.onDisk !== null) this.redoStack.push(this.onDisk);
		this.restoreSnapshot(snapshot);
		return true;
	}

	/**
	 * Redo the most recently undone mutation. Returns whether there was one.
	 */
	redo(): boolean {
		const snapshot = this.redoStack.pop();
		if (snapshot === undefined || !this.file) return false;
		if (this.onDisk !== null) this.undoStack.push(this.onDisk);
		this.restoreSnapshot(snapshot);
		return true;
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

