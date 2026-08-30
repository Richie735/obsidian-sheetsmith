/*
 * The layout editor's canvas: the layout's real components, rendered live on
 * the sheet's own grid, in place of the interim schematic's abstract blocks.
 *
 * `docs/features/grid-canvas.md` §1–§4 is the design; this is where it is
 * built. The short version: `view/grid-cells.ts`'s `renderGrid` is the same
 * loop `SheetView` drives, called here with `data: null` reads and no
 * character behind it, so what appears is exactly what a fresh character
 * built from this layout would show. Every live-rendered element is `inert`
 * — there is nothing here for it to edit — and a sibling `<button>` overlay
 * per cell is what `SchematicGestures.bindBlock` binds to instead, unchanged
 * from the interim schematic. `schematic-gestures.ts` and `preview-grid.ts`
 * know nothing of any of this; they take a `Schematic` (an element, a
 * component list, a column count) and there are simply more of them live at
 * once now.
 *
 * **Discovering the grids rather than being handed them.** `renderGrid`
 * builds a container's own subgrid internally (`openSubgrid`, called from a
 * component's own `render()` through `context.renderChildren`), so nothing
 * outside it can be told where one lands. What is stable instead is *order*:
 * `walkComponents` visits depth-first in grid order, and `renderGrid`'s own
 * recursion creates one `.sheetsmith-cell` per visited entry in exactly that
 * order — so a container's own subgrid, once found, holds its children's
 * cells in `componentsInside(walk, container)`'s order, and that is the
 * order this module reads them back in. Walking `schematic.el.children`
 * rather than a global `querySelectorAll` is what keeps that reading local to
 * one level: a nested container's own cells never leak into its parent's
 * count.
 *
 * **A component that shows one child at a time (Tab set) gets no grid of its
 * own**, since a tab has no placement — nothing to drag onto. Its children
 * still get an overlay each, because a selected one has to be reachable
 * (`ensureSelectionVisible` below is the other half of that), just no
 * `Schematic` to drag or resize against.
 */

import {
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../formula/resolve';
import { parseFunctions } from '../formula/functions';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { DEFAULT_COLUMNS, Layout } from '../parse/layout';
import { componentsInside, walkComponents, WalkEntry } from '../parse/layout-walk';
import { ComponentConfig, isContainer, placesChildren } from '../types';
import { getComponent } from '../components';
import { innerPlacement, renderGrid } from '../view/grid-cells';
import { focusToken } from './focus-token';
import { describeCell, findOverlaps } from './preview-grid';
import { Schematic, SchematicGestures, SchematicHost } from './schematic-gestures';

/**
 * What the canvas needs from the editor hosting it.
 *
 * The same shape as `SchematicHost` minus the two members this module now
 * answers itself — `markOverlaps` and `redrawSchematics` are internal once
 * the canvas owns the whole render loop, so nothing outside it needs to ask
 * for either. `selection` is read rather than cached, on `LayoutEditorHost`'s
 * own rule: a copy is a second answer to "what is selected."
 */
export interface CanvasHost {
	persist(): void;
	persistSoon(): void;
	syncPositionFields(config: ComponentConfig): void;
	select(id: string): void;
	readonly selection: string;
}

/**
 * The layout's own render, live, plus every gesture a component's overlay
 * answers to.
 *
 * Long-lived, constructed once with the editor, so a redraw can preserve
 * focus and the per-Tab-set active tab a reader's selection has switched to
 * — both editor-only posture that a fresh instance would lose.
 */
export class Canvas {
	private host: CanvasHost;
	private gestures: SchematicGestures;
	private root: HTMLElement | null = null;
	private layout: Layout | null = null;
	private schematics: Schematic[] = [];
	/**
	 * Which tab each Tab set on the canvas is showing.
	 *
	 * Editor-only posture, on `SheetView.activeTab`'s own terms and for the
	 * same reason it is not the note's: a reader's tab choice on the rendered
	 * sheet is a different fact from which tab an author is looking at while
	 * editing, and this is never written anywhere. Cleared with the layout it
	 * belongs to, not before — a redraw for any other reason must not close
	 * a tab the author only just opened.
	 */
	private activeTab = new Map<string, number>();

	constructor(host: CanvasHost) {
		this.host = host;
		const hostForGestures: SchematicHost = {
			persist: () => this.host.persist(),
			persistSoon: () => this.host.persistSoon(),
			markOverlaps: (schematic) => this.markOverlaps(schematic),
			syncPositionFields: (config) => this.host.syncPositionFields(config),
			redrawSchematics: () => this.redraw(),
			select: (id) => this.host.select(id),
		};
		this.gestures = new SchematicGestures(hostForGestures);
	}

	/** Draw the whole layout live, into `el`. Keeps `el` and `layout` for `redraw`. */
	draw(el: HTMLElement, layout: Layout): void {
		this.root = el;
		this.layout = layout;

		const doc = el.ownerDocument;
		const active = doc.activeElement;
		const pendingFocus =
			active?.instanceOf(HTMLElement) && el.contains(active)
				? active.dataset.sheetsmithFocus
				: undefined;

		el.empty();
		this.schematics = [];

		const walk = walkComponents(layout.components);
		this.ensureSelectionVisible(walk, this.host.selection);

		const prepared: ReadComponent[] = walk.map(({ config }) =>
			this.readForCanvas(config),
		);
		const { library } = parseFunctions(layout.functions ?? []);
		const { env } = buildSheet(layout, prepared, library);

		const view = el.createDiv('sheetsmith-view sheetsmith-editor-canvas');
		const grid = view.createDiv('sheetsmith-grid');
		const columns = layout.columns ?? DEFAULT_COLUMNS;
		grid.style.setProperty('--sheetsmith-columns', String(columns));

		const top: Schematic = {
			el: grid,
			components: componentsInside(walk, null),
			columns,
		};
		this.schematics.push(top);

		renderGrid(grid, walk, prepared, (entry) => {
			const { config, component, data } = entry;
			return {
				resolved: resolveFormulaFields(component, config, data, env),
				resolveField: makeFieldResolver(component, config, data, env),
				explainField: makeFieldExplainer(component, config, data, env),
				// Defensive only: `inert` already prevents the dispatch that
				// would reach this. There is no character behind the canvas
				// for an edit to land on.
				onChange: () => undefined,
				activeTab: this.activeTab.get(config.id),
				onActivateTab: (index: number) => this.activeTab.set(config.id, index),
			};
		});

		this.wireLevel(top, walk, null);
		// Last, once every overlay in the whole tree exists: marking inert
		// has to see the deepest nested overlay before it can tell a
		// container's own chrome apart from a wrapper it must not touch
		// (this method's own header explains why order is load-bearing).
		this.markInert(grid);

		if (pendingFocus) focusToken(el, pendingFocus);
	}

	/** Redraw from the layout last drawn. A no-op before the first `draw`. */
	redraw(): void {
		if (this.root && this.layout) this.draw(this.root, this.layout);
	}

	/**
	 * What a component reads with no character behind it: an empty section,
	 * exactly as a fresh note's is (`docs/PATTERNS.md` §4). A config error —
	 * a Table's duplicate column key — is not a data question and surfaces
	 * from the same call, since a component's own `read` checks its config
	 * before it ever looks at a body.
	 */
	private readForCanvas(config: ComponentConfig): ReadComponent {
		const component = getComponent(config.type);
		if (!component || isContainer(component)) {
			return { config, component, data: null, error: null };
		}
		const result = component.read('', config);
		return {
			config,
			component,
			data: result.ok ? result.data : null,
			error: result.ok ? null : result.error,
		};
	}

	/**
	 * Switch every Tab set on the selection's ancestor chain to the tab
	 * holding it, so a component reached from the tree is never left behind
	 * an inactive panel's `inert` (`docs/features/grid-canvas.md` §2).
	 *
	 * Selecting a component that is already visible switches nothing: an
	 * ancestor already showing the right tab is left exactly as the reader
	 * set it.
	 */
	private ensureSelectionVisible(walk: WalkEntry[], selected: string): void {
		const byId = new Map(walk.map((entry) => [entry.config.id, entry]));
		let entry = byId.get(selected);
		while (entry && entry.parent) {
			const parent = entry.parent;
			if (!placesChildren(getComponent(parent.type))) {
				const index = (parent.children ?? []).indexOf(entry.config);
				if (index >= 0) this.activeTab.set(parent.id, index);
			}
			entry = byId.get(parent.id);
		}
	}

	/**
	 * Wire every cell at one schematic's own level: the overlay, the
	 * selection and overlap marks, and — where a cell holds a container that
	 * places its own children — the recursion into its subgrid.
	 *
	 * `schematic.components` is already in the order `renderGrid` created
	 * cells in (`componentsInside`'s own promise), so `schematic.el`'s direct
	 * children line up with it index for index — the same contract
	 * `markOverlaps` below reads back.
	 */
	private wireLevel(
		schematic: Schematic,
		walk: WalkEntry[],
		parent: ComponentConfig | null,
	): void {
		const overlapping = findOverlaps(schematic.components);
		const cells = Array.from(schematic.el.children) as HTMLElement[];
		schematic.components.forEach((config, index) => {
			const cell = cells[index];
			if (!cell) return;
			const overlay = this.wireCellContent(cell, config);
			const overlaps = overlapping.has(index);
			overlay.toggleClass('sheetsmith-preview-overlap', overlaps);
			if (config.id === this.host.selection) {
				overlay.addClass('sheetsmith-preview-editing');
			}
			overlay.setAttribute('aria-label', describeCell(config, overlaps));
			// The grid placement itself is written onto `cell` — the live
			// component's own box — so a resize reflows it in place (§3);
			// every mark, listener and pointer capture stays on `overlay`.
			this.gestures.bindBlock(overlay, config, schematic, cell);

			this.wireChildren(cell, config, walk);
		});
	}

	/**
	 * Descend into one component's own children, whichever of the two ways a
	 * container holds them.
	 *
	 * A container that places its children gets a `Schematic` of its own,
	 * found inside the cell just wired — `openSubgrid`'s own DOM shape,
	 * `.sheetsmith-subgrid > .sheetsmith-grid`, searched from this cell so a
	 * grandchild's own nested grid is never mistaken for it (the outer one is
	 * always the first match in document order). A container with no children
	 * yet drew no subgrid at all — `context.renderChildren` is only ever
	 * offered where there is something to draw — so there is nothing here to
	 * wire, and that is the honest state rather than a gap.
	 *
	 * A container that shows one child at a time draws no grid; each child
	 * still gets an overlay of its own, addressed the same way.
	 */
	private wireChildren(
		cell: HTMLElement,
		config: ComponentConfig,
		walk: WalkEntry[],
	): void {
		const definition = getComponent(config.type);
		if (!isContainer(definition)) return;
		if (placesChildren(definition)) {
			const subgrid = cell.querySelector<HTMLElement>(
				'.sheetsmith-subgrid > .sheetsmith-grid',
			);
			if (!subgrid) return;
			// Whose grid this is, on the interim schematic's own terms — a
			// reader, and a test, addresses a container's grid by its id
			// rather than by counting how many are on screen.
			subgrid.dataset.sheetsmithGrid = config.id;
			const inner = innerPlacement(config, this.parentOf(config, walk));
			const child: Schematic = {
				el: subgrid,
				components: componentsInside(walk, config),
				columns: inner.width,
				rows: inner.height,
			};
			this.schematics.push(child);
			this.wireLevel(child, walk, config);
			return;
		}
		this.wireUnplacedChildren(cell, config, walk);
	}

	/**
	 * The children of a container that shows one at a time: each fills the
	 * whole tab it sits in, so none has a `Schematic` to drag or resize
	 * against — only an overlay so a selected one is reachable and openable.
	 *
	 * The cell each tab holds is `fillCell`'s own, one per
	 * `.sheetsmith-tabset-panel`, in the file order `tab-set.ts` draws its
	 * strip in — the same order `componentsInside` gives for a container
	 * whose children share one position (a stable sort over ties preserves
	 * file order), so the two line up without either knowing about the other.
	 */
	private wireUnplacedChildren(
		containerCell: HTMLElement,
		config: ComponentConfig,
		walk: WalkEntry[],
	): void {
		const children = componentsInside(walk, config);
		const cells = Array.from(
			containerCell.querySelectorAll<HTMLElement>(
				'.sheetsmith-tabset-panel > .sheetsmith-cell',
			),
		);
		children.forEach((child, index) => {
			const cell = cells[index];
			if (!cell) return;
			const overlay = this.wireCellContent(cell, child);
			if (child.id === this.host.selection) {
				overlay.addClass('sheetsmith-preview-editing');
			}
			overlay.setAttribute('aria-label', child.label);
			overlay.addEventListener('click', () => this.host.select(child.id));
			this.wireChildren(cell, child, walk);
		});
	}

	/** The parent of `config`, out of an already-taken walk. */
	private parentOf(
		config: ComponentConfig,
		walk: WalkEntry[],
	): ComponentConfig | null {
		return walk.find((entry) => entry.config === config)?.parent ?? null;
	}

	/**
	 * Add the overlay: a sibling of the component's own rendered root,
	 * attached to the cell — never nested inside anything the component draws
	 * — which is what keeps the overlay out of reach of a clip or a scroll
	 * box the component owns (`docs/features/grid-canvas.md` §2).
	 *
	 * **Inserted first, not appended last.** Both this overlay and any nested
	 * component's own overlay several levels inside the live content are
	 * absolutely positioned with no `z-index` unless selected, so both are
	 * painted in one shared layer, ordered by *document* position among
	 * themselves — the live content's own static paint happens in an earlier,
	 * unconditional layer either way. Appended last, this cell's own overlay
	 * would always come after — and so always paint over — a nested overlay
	 * found deeper in the content that follows it, which is a container
	 * shutting every one of its own children out of reach through no gesture
	 * of the reader's. Inserted first, a nested overlay is later in document
	 * order and wins by default, leaving the *selected*-cell z-index rule
	 * (`.sheetsmith-preview-editing`) as the only thing that overrides it.
	 *
	 * Marking the live content `inert` is not done here — see `markInert`.
	 */
	private wireCellContent(cell: HTMLElement, config: ComponentConfig): HTMLElement {
		const overlay = cell.createEl('button', {
			cls: 'sheetsmith-canvas-overlay',
			attr: { type: 'button' },
		});
		overlay.dataset.sheetsmithFocus = `preview-${config.id}`;
		// Moved to the front after creation — `createEl` only ever appends —
		// which is what the header above explains the stacking-order reason
		// for.
		cell.insertBefore(overlay, cell.firstChild);
		return overlay;
	}

	/**
	 * Mark every live-rendered node `inert`, once the whole tree — every
	 * overlay at every depth — already exists.
	 *
	 * **Why this cannot happen per cell, as each is wired.** A container's own
	 * rendered root (a Group's heading-and-region wrapper, a Tab set's own
	 * root) *contains* its children's cells, because that is how nesting
	 * works on a real render — the abstract schematic never had this problem,
	 * since a container was one grey block with nothing inside it. Marking
	 * that whole wrapper `inert` the moment its own cell is wired would take
	 * every child's overlay down with it: `inert` propagates to every
	 * descendant unconditionally, with no way to un-inert one underneath, so
	 * a nested component's overlay would never be reachable at all — not
	 * merely covered, genuinely inert.
	 *
	 * So this walks down from the outside once, after every overlay in the
	 * whole tree exists, and only ever inerts a node with **no** overlay
	 * anywhere inside it. A node that does have one is a pass-through wrapper
	 * — Group's own region, a Tab set's stage, a panel, a nested cell — and is
	 * recursed into instead, so the search keeps narrowing until it reaches
	 * genuine leaf content: a Card's own face, a Table's own markup, or a Tab
	 * set's own strip (no cell inside it at all), each of which becomes
	 * properly inert. `.sheetsmith-canvas-overlay` itself is the one thing
	 * never touched, at any depth.
	 */
	private markInert(node: Element): void {
		for (const child of Array.from(node.children)) {
			if (child.classList.contains('sheetsmith-canvas-overlay')) continue;
			if (child.querySelector('.sheetsmith-canvas-overlay')) {
				this.markInert(child);
				continue;
			}
			child.toggleAttribute('inert', true);
			this.blockEvents(child);
		}
	}

	/**
	 * Defence in depth alongside `inert`, on the same node `markInert` just
	 * marked: a capture-phase stopper for `pointerdown`, `click` and
	 * `keydown`, so nothing beneath this root can be reached by any means.
	 *
	 * `inert`'s own suppression is spec'd for *trusted* events — real user
	 * input, stopped at hit-testing before it ever resolves to an inert
	 * element — and does not cover a script that already holds a direct
	 * element reference and calls `dispatchEvent` on it. That gap is not
	 * reachable by an actual reader (a real press never gets an inert
	 * element back from hit-testing to hold a reference to in the first
	 * place), but it is exactly what a test proving the hazard has to
	 * exercise, and Table's modifier glyph and Pool's amount-editing
	 * popover both open their own floating UI from a `click` listener that
	 * never goes through `context.onChange` — the no-op wiring's own
	 * guarantee covers neither.
	 *
	 * Canvas-owned rather than a check inside either component, on purpose:
	 * `table.ts` and `pool.ts` stay unaware they might ever be running
	 * inside an editor, which is the boundary `docs/features/grid-canvas.md`
	 * §1 already draws for `onChange`'s own no-op. Capturing rather than
	 * bubbling, so this runs before the event ever reaches whatever control
	 * underneath would have answered it, and `stopImmediatePropagation`
	 * rather than `stopPropagation`, so a second listener on this same node
	 * gets no turn either.
	 */
	private blockEvents(root: Element): void {
		for (const type of ['pointerdown', 'click', 'keydown']) {
			root.addEventListener(
				type,
				(event) => {
					event.stopImmediatePropagation();
					if (type === 'click') event.preventDefault();
				},
				true,
			);
		}
	}

	/**
	 * Repaint one schematic's overlap marks without rebuilding it — the
	 * element under the pointer has to survive the gesture moving it.
	 *
	 * Reads `schematic.el`'s direct children, which are the cells `wireLevel`
	 * just wired in `schematic.components`' own order, so the index into one
	 * is the index into the other.
	 */
	private markOverlaps(schematic: Schematic): void {
		const overlapping = findOverlaps(schematic.components);
		const cells = Array.from(schematic.el.children) as HTMLElement[];
		cells.forEach((cell, index) => {
			const overlay = cell.querySelector<HTMLElement>(
				'.sheetsmith-canvas-overlay',
			);
			if (!overlay) return;
			const overlaps = overlapping.has(index);
			overlay.toggleClass('sheetsmith-preview-overlap', overlaps);
			const config = schematic.components[index];
			if (config) overlay.setAttribute('aria-label', describeCell(config, overlaps));
		});
	}

}
