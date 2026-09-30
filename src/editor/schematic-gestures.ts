/*
 * The gestures on a schematic block in the layout editor: dragging it around
 * the grid, dragging its corner to resize it, and the arrow keys that do both
 * from the keyboard.
 *
 * Split out of `layout-editor.ts`, which drew the pane *and* held some 260
 * lines of pointer and keyboard arithmetic — `docs/PATTERNS.md` §1's `pool.ts`
 * shape, named in §11 as that file's own debt. `preview-grid.ts` was the first cut of the
 * same file and took the part with no DOM in it; this is the second and takes
 * the part with no form in it. What stays behind is the paint: which blocks
 * exist, what each says, and where it is drawn.
 *
 * **`editor/` rather than `interaction/`**, and the reason is the direction of
 * the imports rather than the word "gesture". Everything in `interaction/`
 * knows DOM, numbers and callbacks and nothing else: `scrub.ts` is handed the
 * class that marks a scrub in progress precisely so it cannot name a caller,
 * and the folder's only import of anything is `formula/expression`. This
 * gesture cannot meet that bar — it writes a `ComponentConfig`'s `position` and
 * it asks `preview-grid.ts` where the grid ends — so shelving it there would
 * point the vocabulary every control shares up into one feature's arithmetic.
 * §2 asks for the folder that names what a module *does*, and what this does is
 * drive the layout editor's schematic.
 *
 * **The class names stay here**, which is the half of the `pool.ts` precedent
 * this move answers differently, so it owes an argument. There the engine
 * landed in `interaction/` with two controls driving it, and a module naming a
 * pool would have been a module telling its second caller it was the wrong
 * shape. Here there is one surface, this module is named for it, and
 * `sheetsmith-preview-dragging`, `-resizing` and `-clamped` are that surface's
 * own vocabulary: passing them in would be arguments with one possible value
 * each, which is the generalisation ahead of evidence §1 refuses. What had to
 * stay out is the editor's *structure* — the panel, the tree, the file, the
 * host — and `SchematicHost` is what keeps it out.
 *
 * **Not here: the arithmetic.** `clamp`, `lastColumn`, `describeCell` and
 * `findOverlaps` are `preview-grid.ts`'s, and both this module and the paint
 * call them, which is what stops the two disagreeing about where the grid ends.
 *
 * **Not here either: the grid's own pixels.** Where the tracks and the gutters
 * fall, and the guides drawn on them while a gesture runs, are
 * `grid-guides.ts`'s — the third cut of this file, and the one the header above
 * predicts: a schematic's geometry is read for two purposes now, to decide
 * which cell a pointer is over and to draw the lines it is snapping to, and the
 * failure worth designing against is those two disagreeing. They cannot, because
 * the drag measures once, keeps the answer for the length of the gesture, and
 * hands that same answer to the paint.
 *
 * **Not here either: `markOverlaps`.** It was the one member of this layer the
 * cut was genuinely open about. Its only caller is the drag, which argues for
 * moving it; but it repaints the marks and labels `drawSchematic` writes when it
 * creates a cell, and one unstated contract joins them — that the cells sit in
 * the order of the component list. Which half owns that contract is worth
 * stating exactly, because it is what makes the guard the right one: the paint
 * *establishes* the order, taking its index from the loop that creates the cell,
 * and cannot be wrong about it; the repaint *depends* on it, mapping a
 * `querySelectorAll` onto the component list by index. Two files either side of
 * that is the gap §1 and §10 keep finding by reading two files side by side, so
 * it stays with the paint and this module asks for it.
 *
 * **What was weighed and not taken**, since the obvious simplification is to
 * have `drawSchematic` call `markOverlaps` after creating its cells and drop the
 * second reading entirely. Not for any reason about direction — `markOverlaps`
 * is the editor's own private method, the paint calling it would be one private
 * calling another, and the paint already calls into this module for `bindBlock`,
 * so that arrow exists and is fine. The reason is that it trades the safe half
 * for the fragile one: the creating loop's index is structurally correct, and
 * deferring to a DOM query would put the *paint* on the same index-mapping
 * contract the repaint carries, for the sake of deleting four lines. The legend
 * needs the `findOverlaps` set in scope anyway, so it would either compute twice
 * or hand the set back. That is a restructure of the paint, and a worse one.
 */

import { ComponentConfig } from '../types';
import {
	freezeGrid,
	hideGridGuides,
	markGridTarget,
	PreviewMetrics,
	previewMetrics,
	showGridGuides,
	thawGrid,
	trackAt,
} from './grid-guides';
import { clamp, lastColumn } from './preview-grid';

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
 *
 * **Declared here rather than with the paint**, though both halves take one and
 * the paint is the heavier reader: `components` and `rows` are only ever touched
 * over there — the loop that draws the cells, `markOverlaps`, and
 * `grid-template-rows` — while this module reads `el` once and `columns` five
 * times. So it is not that the type is the gesture's.
 *
 * What settles it is which direction keeps the seam legible. This module's
 * import list is the evidence for everything its header claims: `../types` and
 * `./preview-grid`, and nothing that knows what a pane is. Declaring `Schematic`
 * with the paint would put `layout-editor.ts` in that list, and a reader checking
 * the claim would find the editor named there. The reverse costs nothing: the
 * editor already imports this module for `SchematicGestures`, so the type comes
 * from a file it reads anyway.
 *
 * Not because a cycle would break. It would not — a type-only edge erases at
 * build, `import type` says so explicitly, and there is no `import/no-cycle`
 * rule in the pipeline to object; that was measured rather than assumed. The
 * cost is to the reader, not to the compiler, which is the only reason worth
 * writing down.
 */
export interface Schematic {
	el: HTMLElement;
	/** The list this draws, and the list a drag writes into. */
	components: ComponentConfig[];
	/** Columns at this level: the layout's, or the container's own width. */
	columns: number;
	/**
	 * Rows to draw, for a container whose height is declared.
	 *
	 * Absent for the sheet's own schematic, which is correct rather than
	 * unfinished: the top-level grid carries no declared height — a container's
	 * arrives as a min-height floor — so the sheet grows down as components are
	 * added and the preview should too.
	 */
	rows?: number;
}

/**
 * What a schematic's gestures need from the editor that drew them.
 *
 * A named interface rather than a handful of callbacks, and the same *move* as
 * `LayoutEditorHost` one level up: the pane hosts the editor, the editor hosts
 * the schematic, and in both cases the inner half asks for what it cannot see
 * instead of being handed the outer one. Passing the editor itself would be no
 * split at all — every private it owns would be back in reach — and six members
 * is the honest measure of what a gesture on a grid touches rather than a sign
 * the seam is in the wrong place. Each one is a thing only the editor can do;
 * none of them is a number or a policy this module could hold.
 *
 * **Not the same shape, though, and the difference is the better property.**
 * `LayoutEditorHost` carries two `readonly` members the editor *reads* — which
 * layout is open, and what is selected — and with them a caveat: the editor
 * reads them at render time and never keeps a copy, because a copy is a second
 * answer to "what is selected" and the two disagree the first time a pane is
 * restored. This interface has no such member. It is six commands, and
 * everything a gesture works on arrives as an argument — the `Schematic` it is
 * over, the `ComponentConfig` it is writing — so there is nothing here to hold a
 * stale copy of. Read "same shape" as licence and the first `readonly` added
 * below brings that trap down to a level that was immune to it.
 */
export interface SchematicHost {
	/** Write the layout now, which is what a gesture that has ended does. */
	persist(): void;
	/**
	 * Write the layout on a debounce.
	 *
	 * A second member rather than a flag on the first, because which one a
	 * gesture uses is the gesture's own policy: a drag ends once and writes
	 * once, and holding an arrow key repeats as fast as the key does.
	 *
	 * Both halves of that are driven, and only because of *when* each case
	 * counts: the drag's is counted before anything flushes and the arrow run's
	 * either side of the flush, so swapping the two members reddens the other
	 * gesture's case. Counted after the flush, as both were at first, the two
	 * policies are indistinguishable.
	 */
	persistSoon(): void;
	/**
	 * Repaint the overlap marks and the labels that carry them, without
	 * rebuilding the grid — the element under the pointer has to survive the
	 * gesture moving it.
	 */
	markOverlaps(schematic: Schematic): void;
	/**
	 * Copy a component's position into its open form. The panel shows the same
	 * four numbers, so they follow a gesture by being written rather than by
	 * the pane being torn down around them.
	 */
	syncPositionFields(config: ComponentConfig): void;
	/** Redraw every schematic, keeping focus on the block that had it. */
	redrawSchematics(): void;
	/** Select a component, which rebuilds both regions of the pane. */
	select(id: string): void;
	/**
	 * Put the keyboard on a block once a press on it is over, wherever the
	 * redraws that press caused have left it: the arrow keys `nudge` answers
	 * listen on the block, so a press that leaves focus elsewhere leaves them
	 * scrolling the pane.
	 */
	focusBlock(id: string): void;
}

export class SchematicGestures {
	private host: SchematicHost;
	/** True between a drag ending and the click it produces. */
	private dragged = false;

	constructor(host: SchematicHost) {
		this.host = host;
	}

	/**
	 * Wire one block: the drag, the corner, the arrow keys, and the click that
	 * selects it.
	 *
	 * **The click is here rather than with the paint**, because of the state it
	 * reads. A drag ends in a click on the same element, and `dragged` is how
	 * the two are told apart — written by the drag, read by the click. Left on
	 * the editor it would be a field only this module writes and only this
	 * module's other half reads, which is two halves each knowing what the
	 * other is for.
	 *
	 * **The corner handle is created here** on the same argument: it holds no
	 * text and is hidden from assistive tech, so its whole existence is a hit
	 * target for the resize. Drawn by the paint, it would be an element made in
	 * one file for a listener attached in another.
	 *
	 * **`target` is a second element, for the canvas alone.** The interim
	 * schematic's block is one element doing both jobs — it receives the
	 * gesture and it *is* the thing whose grid placement is being written —
	 * and every caller before the canvas passes one element for both, which
	 * is what the default preserves exactly. The canvas cannot: its gesture
	 * surface is a sibling overlay over the live cell
	 * (`docs/features/grid-canvas.md` §2), and the live component must
	 * genuinely reflow *during* a resize (§3) — a Table's columns narrowing as
	 * the drag runs — which only happens if the grid placement is written onto
	 * the cell itself, not onto the overlay sitting over it. Marks, capture and
	 * every listener stay on `cell`, which is what the reader is pressing;
	 * only the two style writes move.
	 */
	bindBlock(
		cell: HTMLElement,
		config: ComponentConfig,
		schematic: Schematic,
		target: HTMLElement = cell,
	): void {
		// Pointer-only, and hidden from assistive tech on purpose:
		// shift+arrows on the block already resize it, so the handle adds
		// no function that would otherwise be unreachable. That is also
		// what lets it be a span — a button inside a button is invalid.
		const handle = cell.createSpan({ cls: 'sheetsmith-preview-resize' });
		handle.setAttribute('aria-hidden', 'true');
		handle.addEventListener('pointerdown', (event) => {
			// Grabbing the corner must not also pick the whole block up.
			event.stopPropagation();
			this.beginDrag(event, cell, config, 'resize', schematic, target);
		});
		cell.addEventListener('click', () => {
			// A drag ends in a click on the same element; that click meant
			// "put it here", not "select it". The drag's own end has already
			// put the keyboard on the block.
			if (this.dragged) return;
			// Selects, never deselects. Pressing the selected block again
			// would empty the panel, and nothing is the wrong thing to
			// configure — the `Layout` row is how an author gets back out.
			this.host.select(config.id);
			this.host.focusBlock(config.id);
		});
		cell.addEventListener('keydown', (event) =>
			this.nudge(event, config, schematic),
		);
		cell.addEventListener('pointerdown', (event) =>
			this.beginDrag(event, cell, config, 'move', schematic, target),
		);
	}

	/** Which grid cell a pointer is over, 1-based, as the layout counts them. */
	private cellAt(
		event: PointerEvent,
		metrics: PreviewMetrics,
	): { col: number; row: number } {
		return {
			// Both axes walk the grid's own resolved tracks (`grid-guides.ts`
			// explains why neither may be divided evenly), which is also what
			// the guides are drawn from, so the cell answered here is the cell
			// the reader can see highlighted.
			col: trackAt(metrics.column, event.clientX - metrics.left) + 1,
			row: trackAt(metrics.row, event.clientY - metrics.top) + 1,
		};
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
		/** Where the grid placement itself is written. `cell` for every caller but the canvas. */
		target: HTMLElement = cell,
	): void {
		if (event.button !== 0) return;
		const metrics = previewMetrics(schematic.el, schematic.columns);
		if (!metrics) return;
		// Suppress the text selection and the native button drag; the block
		// itself is the thing being dragged.
		event.preventDefault();

		const origin = this.cellAt(event, metrics);
		const start = { ...config.position };
		let moved = false;
		cell.setPointerCapture(event.pointerId);
		// At the press, before anything can move: the first placement is
		// already a reflow, and the tracks it would resize are the ones just
		// measured. Invisible on a press that only selects, since the frozen
		// sizes are the sizes the grid already had.
		freezeGrid(schematic.el, metrics);

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
			target.setCssStyles({
				gridColumn: `${col} / span ${width}`,
				gridRow: `${row} / span ${height}`,
			});
			this.host.markOverlaps(schematic);
			// Before the first move has drawn any guides this finds nothing to
			// move, and `showGridGuides` places the target itself on that frame.
			markGridTarget(schematic.el, metrics, position);
			return true;
		};

		const onMove = (move: PointerEvent) => {
			const at = this.cellAt(move, metrics);
			if (!place(at.col - origin.col, at.row - origin.row)) return;
			if (!moved) {
				moved = true;
				cell.addClass('sheetsmith-preview-dragging');
				if (mode === 'resize') cell.addClass('sheetsmith-preview-resizing');
				// On the first move rather than on the press, which is the same
				// moment `-dragging` is marked and for the same reason: a press
				// that selects a component is a press that moves nothing, and
				// drawing the grid under it would flash the whole lattice on
				// every selection. Measured once, at the press, so what is on
				// screen is the grid this gesture is snapping to for as long as
				// it runs — not a second reading that could disagree with it.
				showGridGuides(schematic.el, metrics, config.position);
			}
		};

		const finish = (commit: boolean) => {
			cell.removeEventListener('pointermove', onMove);
			cell.removeEventListener('pointerup', onUp);
			cell.removeEventListener('pointercancel', onCancel);
			cell.ownerDocument.removeEventListener('keydown', onKey);
			cell.removeClass('sheetsmith-preview-dragging');
			cell.removeClass('sheetsmith-preview-resizing');
			// Above the `moved` guard and beside the classes it matches, not
			// below with the commit: the redraw a real drag ends with would
			// discard this element anyway, so putting the removal there would
			// make the guide's lifetime depend on a rebuild happening rather
			// than on the gesture ending. A press that drew no grid has none
			// to take down, and `hide` is written to be safe on one.
			hideGridGuides(schematic.el);
			thawGrid(schematic.el);
			if (cell.hasPointerCapture(event.pointerId)) {
				cell.releasePointerCapture(event.pointerId);
			}
			if (!moved) return;
			// No delta from the origin is where the block was picked up, so
			// the restore is the same arithmetic as every other frame.
			if (!commit) place(0, 0);
			// The click that follows a drag is the drag's own; swallow it.
			this.dragged = true;
			// The cell's own window, not the global one. Nothing in production
			// reaches for `window` directly — ten sites derive a view from
			// `ownerDocument.defaultView` and `layout-editor.ts` uses `el.win`,
			// and `previewMetrics`, now next door, is one of the ten — so a bare `window`
			// here was the only one of its kind. The visible cost was nil, since
			// a 0ms timer fires either way; the real cost was that the one
			// exception lived in the file whose header argues about which folder
			// knows what.
			cell.win.setTimeout(() => {
				this.dragged = false;
			}, 0);
			// The form first, then the focus, then the write. Focusing the block
			// blurs whatever field the author left, and a browser commits that
			// field inside the blur: synced first, a position field commits the
			// drag's own numbers rather than what was typed before it, and
			// focused before the write, that commit's own save lands first and
			// this one repeats it. The other way round, the drag's save and the
			// field's are two different texts written back to back, and the
			// first one coming back reads to the pane as somebody else's edit.
			this.host.syncPositionFields(config);
			this.host.focusBlock(config.id);
			this.host.persist();
			this.host.redrawSchematics();
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
		this.host.persistSoon();
		this.host.redrawSchematics();
		// The open form shows the same numbers, so they have to follow — but
		// by being written, not by rebuilding the pane around them. Holding an
		// arrow key is the one gesture here that is rapid-fire by design, and
		// a full teardown per repeat is the latency cliff it would fall off.
		// The write is already debounced; this is the other half of that.
		this.host.syncPositionFields(config);
	}
}
