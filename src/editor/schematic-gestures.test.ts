// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { cancel, pressDown, release } from '../test/pointer';
import {
	Harness,
	tick,
	settle,
	open,
	control,
	writes,
	furnished,
	schematic,
	TRACK,
	ROW,
	measure,
	sheetGrid,
	at,
	dragTo,
	reads,
	position,
	unevenSchematic,
} from '../test/layout-editor-pane';

/*
 * The schematic's pointer gestures (`editor/schematic-gestures.ts`): dragging a
 * block, dragging its corner, and the grid drawn behind either while it runs.
 *
 * **Driven through a real pane**, which is `src/test/layout-editor-pane.ts`:
 * `open` writes a layout file into a stub vault and renders `LayoutEditorView`,
 * because the pane's answers to what is open and what is selected are the ones
 * that ship. The cheaper alternative — a `SchematicGestures` built over a fake
 * host and a hand-made cell — would rewrite every assertion here to test the
 * seam instead of the gesture. The grid's measured geometry is
 * `layout-editor-pane.ts`'s too, and its header says why a faked `clientWidth`
 * is the enabling step.
 *
 * `row geometry read off the grid rather than assumed` and `the grid drawn behind
 * a gesture` drive `grid-guides.ts` as well, which has no entry point of its
 * own: a drag is the only thing that measures a grid, and the guides are that
 * same measurement drawn, so they are asserted where the drag is.
 *
 * **These cases stayed in `layout-editor.test.ts` when the code moved out of
 * `layout-editor.ts`, and moved here once the pane harness was promoted.**
 * Neither movement changed an assertion. One assertion was added between the two,
 * and the boundary matters because commits are split against these records:
 * `follows the pointer on the cell itself` counts the drag's write after a bare
 * `tick()` as well as after `settle`. That is coverage the new seam owed:
 * `persist` and `persistSoon` became two members of `SchematicHost` precisely
 * because which one a gesture uses is its own policy, and counting only after
 * the flush could not tell them apart.
 *
 * **`nudging a block` did not come**, and `layout-editor.test.ts` says why: it
 * holds the arrow keys and the panel's typed position to the same bound on
 * purpose, which is a claim about two regions at once.
 */

let harness: Harness;

/**
 * The inline grid placement a gesture writes.
 *
 * Read off the overlay's own parent `.sheetsmith-cell` rather than off the
 * overlay itself: the overlay is what receives the gesture, but the canvas
 * writes the grid placement onto the live cell so the real component
 * reflows during the drag (§3) — `control(harness, 'preview-<id>')` is the
 * overlay, one level in from the cell this reads.
 */
function box(overlay: HTMLElement): string {
	const cell = overlay.parentElement ?? overlay;
	return `${cell.style.gridColumn}, ${cell.style.gridRow}`;
}

describe('dragging a block around the schematic', () => {
	beforeEach(async () => {
		harness = await open(schematic());
	});

	it('leaves a pressed block focused, so the arrow keys reach it', async () => {
		/*
		 * The press cancels its own pointerdown, which is what stops the text
		 * selection and the native button drag — and, in a browser, the focus the
		 * press would have given the overlay. So after a click the focus sat on
		 * the body, and the arrow keys `nudge` listens for on the overlay
		 * scrolled the pane instead. happy-dom focuses nothing on a synthetic
		 * press either, which is what lets this case stand for the browser.
		 */
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, { cancelable: true, ...at(1, 1) });
		release(cell);
		cell.click();
		await settle(harness.pane);

		// Selecting rebuilt the canvas, so the overlay is read again by token.
		const pressed = control(harness, 'preview-left');
		expect(document.activeElement).toBe(pressed);
		pressed.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
		);
		await settle(harness.pane);
		expect((await position(harness, 'left')).col).toBe(2);
	});

	it('leaves a block focused after a press on its resize corner, so shift+arrows reach it', async () => {
		sheetGrid(harness);
		const handle = control(harness, 'preview-left').querySelector('.sheetsmith-preview-resize');
		if (!handle?.instanceOf(HTMLElement)) throw new Error('left has no resize corner');
		pressDown(handle, at(2, 1));
		release(control(harness, 'preview-left'));
		// The corner's click is the block's: it bubbles to the overlay.
		handle.click();
		await settle(harness.pane);

		const pressed = control(harness, 'preview-left');
		expect(document.activeElement).toBe(pressed);
		pressed.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'ArrowRight',
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			}),
		);
		await settle(harness.pane);
		expect((await position(harness, 'left')).width).toBe(3);
	});

	/*
	 * A browser fires a typed field's `change` inside its blur, so moving the
	 * focus while the author is standing in a position field commits it then and
	 * there, and that commit redraws the canvas. Moved during the press, it tore
	 * down the block holding the pointer capture before the drag began. happy-dom
	 * fires no change on a blur, so the field is given the browser's behaviour.
	 */
	function typeUncommitted(token: string, value: string): HTMLInputElement {
		const field = control<HTMLInputElement>(harness, token);
		field.focus();
		field.value = value;
		field.addEventListener('blur', () => field.dispatchEvent(new Event('change')));
		return field;
	}

	it('drags, and then focuses the block, with a typed position field left behind', async () => {
		control(harness, 'preview-left').click();
		await settle(harness.pane);
		// Measured after the selection's rebuild, which draws a fresh grid.
		sheetGrid(harness);
		typeUncommitted('pos-left-row', '3');

		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		// Still the block the press landed on: nothing rebuilt it mid-press.
		expect(harness.container.contains(cell)).toBe(true);
		expect(cell.hasPointerCapture(1)).toBe(true);
		dragTo(cell, 2, 1);
		release(cell);
		cell.click();
		await settle(harness.pane);

		// The drag wins, since it wrote its place into the form before the
		// field's pending text was committed.
		expect(await position(harness, 'left')).toEqual({ col: 2, row: 1, width: 2, height: 1 });
		expect(document.activeElement).toBe(control(harness, 'preview-left'));
	});

	it('focuses the block after a press or a drag whose commit rebuilds the whole pane', async () => {
		/*
		 * A label commit redraws the pane, not only the canvas, and the canvas
		 * then draws into a fresh root: the block has to be found where it is
		 * after the commit, not where the canvas was before it.
		 */
		control(harness, 'preview-left').click();
		await settle(harness.pane);
		sheetGrid(harness);
		typeUncommitted('label-left', 'Lefty');
		let cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		release(cell);
		cell.click();
		await settle(harness.pane);
		expect(document.activeElement).toBe(control(harness, 'preview-left'));

		sheetGrid(harness);
		typeUncommitted('label-left', 'Leftmost');
		cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		dragTo(cell, 2, 1);
		release(cell);
		cell.click();
		await settle(harness.pane);
		expect((await position(harness, 'left')).col).toBe(2);
		expect(document.activeElement).toBe(control(harness, 'preview-left'));
	});

	it('commits a typed position field and focuses the block on a press that only selects', async () => {
		control(harness, 'preview-left').click();
		await settle(harness.pane);
		// Measured after the selection's rebuild, which draws a fresh grid.
		sheetGrid(harness);
		typeUncommitted('pos-left-row', '3');

		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		release(cell);
		cell.click();
		await settle(harness.pane);

		expect((await position(harness, 'left')).row).toBe(3);
		const block = control(harness, 'preview-left');
		expect(document.activeElement).toBe(block);
		block.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
		);
		await settle(harness.pane);
		expect((await position(harness, 'left')).col).toBe(2);
	});

	it('starts nothing on a grid it cannot measure, or a press that is not the primary button', () => {
		/*
		 * Both of `beginDrag`'s refusals, and between them the vacuity guard for
		 * every case below (§10). The first half is the untouched happy-dom
		 * geometry: a schematic of no measurable width has no cell for a pointer
		 * to be over, and a track of zero width divides every coordinate into an
		 * infinite column. It is also the proof that `measure` is load bearing —
		 * if these cases ever start passing without it, they have stopped driving
		 * `place`.
		 */
		const unmeasured = control(harness, 'preview-left');
		pressDown(unmeasured, at(1, 1));
		dragTo(unmeasured, 4, 1);
		expect(box(unmeasured)).toBe('1 / span 2, 1 / span 1');
		expect(unmeasured.hasPointerCapture(1)).toBe(false);

		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, { button: 2, ...at(1, 1) });
		dragTo(cell, 4, 1);
		expect(box(cell)).toBe('1 / span 2, 1 / span 1');
		expect(cell.hasPointerCapture(1)).toBe(false);
	});

	it('follows the pointer on the cell itself, and writes the file once on release', async () => {
		/*
		 * The gesture's two halves at once, because they are the same claim seen
		 * from either end. Only the dragged block's own grid position is written
		 * while the pointer is down — rebuilding the preview would destroy the
		 * element holding the pointer capture, and the drag would end on the
		 * first move — and the rebuild and the write happen once, at the end.
		 *
		 * `unevenSchematic()` rather than the `beforeEach`'s own `schematic()`:
		 * this is the spec's canonical drag proof, asked to run against a
		 * fixture with a real multi-row component sharing it — `left` sits at
		 * the same place either fixture holds it, so nothing below changes.
		 */
		harness = await open(unevenSchematic());
		sheetGrid(harness);
		const wrote = writes(harness);
		const cell = control(harness, 'preview-left');

		// Read off the event rather than asserted about the browser: the press
		// suppresses the text selection and the native button drag. It would also
		// suppress the focus change, so the block is focused once the gesture
		// ends (`focusBlock`), and a field left behind is blurred then; `redraw`
		// still commits the function library rather than trusting that blur.
		let down: Event | undefined;
		cell.addEventListener('pointerdown', (event) => {
			down = event;
		});
		pressDown(cell, { cancelable: true, ...at(1, 1) });
		expect(down?.defaultPrevented).toBe(true);
		expect(cell.hasPointerCapture(1)).toBe(true);
		dragTo(cell, 2, 1);
		expect(box(cell)).toBe('2 / span 2, 1 / span 1');
		expect(cell.classList.contains('sheetsmith-preview-dragging')).toBe(true);
		// Not a resize: the corner is the only thing that sets this.
		expect(cell.classList.contains('sheetsmith-preview-resizing')).toBe(false);

		dragTo(cell, 4, 3);
		expect(box(cell)).toBe('4 / span 2, 3 / span 1');
		// The same element throughout, so the capture it holds is still live.
		expect(harness.container.contains(cell)).toBe(true);
		expect(wrote()).toBe(0);

		release(cell);
		// Counted before anything flushes, which is what makes this the drag's own
		// write rather than a debounce's. `settle` runs the pending timer, so a
		// `persistSoon` here would land one write too and read the same after it —
		// and `nudge`, which is meant to be debounced, is held to the reverse.
		await tick();
		expect(wrote()).toBe(1);

		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 4,
			row: 3,
			width: 2,
			height: 1,
		});
		expect(wrote()).toBe(1);
		// One rebuild, on release: the cell that held the capture is gone, and
		// the block reads out its new place.
		expect(harness.container.contains(cell)).toBe(false);
		expect(cell.classList.contains('sheetsmith-preview-dragging')).toBe(false);
		expect(cell.hasPointerCapture(1)).toBe(false);
		expect(reads(harness, 'left')).toBe('Left: column 4, row 3, 2×1');
	});

	it('measures the delta from where the block was picked up, not from the last frame', async () => {
		/*
		 * `place`'s own claim: a pointer that runs past a bound and comes back
		 * resumes exactly. Accumulate the delta instead and the first frame
		 * spends the block's whole remaining travel, so coming back one column
		 * from the origin lands it at the bound rather than at column 2.
		 */
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));

		dragTo(cell, 20, 1);
		expect(box(cell)).toBe('11 / span 2, 1 / span 1');

		// Out the other side, where the bound is a floor rather than a computed
		// edge. The block is already against it, so an unclamped column shows up
		// as a negative one the grid has no cell for.
		dragTo(cell, -3, 1);
		expect(box(cell)).toBe('1 / span 2, 1 / span 1');

		dragTo(cell, 2, 1);
		expect(box(cell)).toBe('2 / span 2, 1 / span 1');

		// The row axis has a bound of its own — there is no row 0 for the grid to
		// place a block on — and it is the same claim: held at 1 on the way out,
		// and resumed from the origin on the way back rather than from the 1.
		dragTo(cell, 2, -1);
		expect(box(cell)).toBe('2 / span 2, 1 / span 1');
		dragTo(cell, 2, 3);
		expect(box(cell)).toBe('2 / span 2, 3 / span 1');

		release(cell);
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 2,
			row: 3,
			width: 2,
			height: 1,
		});
	});

	it('marks a block held at the right-hand bound from the first frame', () => {
		/*
		 * The bail-out order inside `place`, which was chosen for this case: the
		 * mark is about where the block *is*, not about it having just moved. A
		 * block already flush at the last column is held on the frame it is
		 * picked up on — the frame that changes nothing and returns early — so a
		 * no-op check first would never show the feedback in the one case it
		 * exists for.
		 */
		sheetGrid(harness);
		const held = control(harness, 'preview-edge');
		pressDown(held, at(11, 1));
		dragTo(held, 11, 1);
		expect(held.classList.contains('sheetsmith-preview-clamped')).toBe(true);
		// And the frame really did change nothing, which is what makes this the
		// early-return path rather than an ordinary move.
		expect(box(held)).toBe('11 / span 2, 1 / span 1');
		expect(held.classList.contains('sheetsmith-preview-dragging')).toBe(false);
		release(held);

		// The other half of the same toggle: a block with room is not marked, and
		// gains the mark on the frame that spends the last of it.
		const free = control(harness, 'preview-left');
		pressDown(free, at(1, 1));
		dragTo(free, 2, 1);
		expect(free.classList.contains('sheetsmith-preview-clamped')).toBe(false);
		dragTo(free, 11, 1);
		expect(free.classList.contains('sheetsmith-preview-clamped')).toBe(true);
		// And off again on the way back, or the block would read as held for the
		// rest of a gesture that has room on both sides of it.
		dragTo(free, 2, 1);
		expect(free.classList.contains('sheetsmith-preview-clamped')).toBe(false);
		release(free);
	});

	it('repaints the overlap marks and rewrites the labels mid-gesture', async () => {
		/*
		 * `markOverlaps`, driven. The paint-time case above pins the index
		 * mapping it rests on without a pointer and says so; this is the half it
		 * could not reach — the marks and the labels being kept true *during* a
		 * drag, on both blocks of the collision and in both directions.
		 *
		 * The label is the part worth the assertion: it carries the block's
		 * position and size, so a gesture that changes either has to rewrite it
		 * rather than leave it describing where the block used to be.
		 */
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));

		// Onto `right`, which spans columns 5-6 of row 2.
		dragTo(cell, 4, 2);
		expect(reads(harness, 'left')).toBe(
			'Left: column 4, row 2, 2×1. Overlaps another component',
		);
		expect(reads(harness, 'right')).toBe(
			'Right: column 5, row 2, 2×1. Overlaps another component',
		);
		expect(
			Array.from(
				harness.container.querySelectorAll('.sheetsmith-preview-overlap'),
			).map((el) => el.getAttribute('aria-label')?.split(':')[0]),
		).toEqual(['Left', 'Right']);

		// And off it again, which has to clear the mark on the block that never
		// moved as well as on the one that did.
		dragTo(cell, 8, 2);
		expect(reads(harness, 'left')).toBe('Left: column 8, row 2, 2×1');
		expect(reads(harness, 'right')).toBe('Right: column 5, row 2, 2×1');
		expect(
			harness.container.querySelectorAll('.sheetsmith-preview-overlap'),
		).toHaveLength(0);

		release(cell);
		await settle(harness.pane);
	});

	it('resizes from the corner without also picking the whole block up', async () => {
		/*
		 * What the handle's `stopPropagation` is for. Both `pointerdown`
		 * listeners are live — the handle's and, one hop up, the cell's — so
		 * without it the corner starts a resize *and* a move, and every frame
		 * writes the same delta into both pairs of numbers. `col` staying at 1 is
		 * the whole assertion: the block grows to the right rather than walking
		 * there.
		 *
		 * `unevenSchematic()`, the spec's canonical resize proof: `left` grows
		 * to column 4 at most, well clear of `right`'s columns 5-6, so nothing
		 * about the resize below changes for sharing a schematic with `tall`.
		 */
		harness = await open(unevenSchematic());
		// Open on the block being resized, so the form's own numbers are on
		// screen to follow. `finish` writes them the way `nudge` does — the drag
		// is the other call site, and the panel showing a stale size after a
		// gesture that changed it is the same failure at either.
		control(harness, 'edit-left').click();
		await settle(harness.pane);
		sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		const handle = cell.querySelector('.sheetsmith-preview-resize');
		if (!handle) throw new Error('no resize handle');
		// Bubbling on purpose, and it is what makes the case a case: an event
		// that never reaches the cell would pass with the guard deleted.
		pressDown(handle, { bubbles: true, ...at(2, 1) });

		dragTo(cell, 4, 2);
		expect(box(cell)).toBe('1 / span 4, 1 / span 2');
		expect(cell.classList.contains('sheetsmith-preview-resizing')).toBe(true);
		expect(cell.classList.contains('sheetsmith-preview-dragging')).toBe(true);

		// A corner dragged back past the block's own origin: a block is at least
		// one cell, and a zero-width or zero-height one is a block the grid
		// cannot place at all.
		dragTo(cell, -2, -2);
		expect(box(cell)).toBe('1 / span 1, 1 / span 1');
		dragTo(cell, 4, 2);

		release(cell);
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 1,
			row: 1,
			width: 4,
			height: 2,
		});
		expect(control<HTMLInputElement>(harness, 'pos-left-width').value).toBe('4');
		expect(control<HTMLInputElement>(harness, 'pos-left-height').value).toBe('2');
		expect(control<HTMLInputElement>(harness, 'pos-left-col').value).toBe('1');
	});

	it('puts the block back when the gesture is abandoned, whichever way it ends', async () => {
		/*
		 * Forgiveness on the one gesture where a mistake is a slip of the hand.
		 * Escape and `pointercancel` are the same restore — no delta from the
		 * origin is where the block was picked up — and neither may leave a
		 * changed position in the file. The write still happens, because the
		 * gesture did touch the layout and putting it back is a change to undo,
		 * so the claim is about the numbers rather than about the write.
		 *
		 * `unevenSchematic()`, the spec's canonical Escape proof: both drags
		 * below land at column 6, row 3, clear of `right`'s row 2 and `tall`'s
		 * columns 9-10, so the restore below is unaffected by sharing the
		 * schematic with a real multi-row component.
		 */
		harness = await open(unevenSchematic());
		sheetGrid(harness);
		const escaped = control(harness, 'preview-left');
		pressDown(escaped, at(1, 1));
		dragTo(escaped, 6, 3);
		expect(box(escaped)).toBe('6 / span 2, 3 / span 1');
		escaped.ownerDocument.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape' }),
		);
		expect(box(escaped)).toBe('1 / span 2, 1 / span 1');
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 1,
			row: 1,
			width: 2,
			height: 1,
		});

		sheetGrid(harness);
		const cancelled = control(harness, 'preview-left');
		pressDown(cancelled, at(1, 1));
		dragTo(cancelled, 6, 3);
		cancel(cancelled);
		expect(box(cancelled)).toBe('1 / span 2, 1 / span 1');
		await settle(harness.pane);
		expect(await position(harness, 'left')).toEqual({
			col: 1,
			row: 1,
			width: 2,
			height: 1,
		});
	});

	it("writes into a container's own list, against the container's own grid", async () => {
		/*
		 * The gesture is parameterised over which list it writes rather than
		 * copied per level, so both parameters have to follow the schematic and
		 * not the sheet: the child's new position lands in `defences.children`,
		 * and the bound it stops at is the container's six columns rather than
		 * the twelve the sheet has. Every other case here drags on the sheet's
		 * own schematic, where a column count read from a literal would pass.
		 */
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);

		const inner = harness.container.querySelector(
			'[data-sheetsmith-grid="defences"]',
		);
		if (!inner) throw new Error('no schematic for the container');
		measure(inner as HTMLElement, 6);

		const cell = control(harness, 'preview-armour');
		pressDown(cell, at(1, 1));
		dragTo(cell, 20, 2);
		// Six columns, so a 2-wide child ends flush at column 6 and is held at 5.
		// A sheet-width bound would have let it out to 11.
		expect(box(cell)).toBe('5 / span 2, 2 / span 1');
		// The repaint follows the schematic too, not the sheet's: the child's
		// label is rewritten mid-gesture, which only happens if `markOverlaps`
		// indexed the list it was handed.
		expect(reads(harness, 'armour')).toBe('Armour class: column 5, row 2, 2×1');

		release(cell);
		await settle(harness.pane);
		const stored = (await harness.stored()).components.find(
			(component) => component.id === 'defences',
		);
		expect(stored?.children?.[0]?.position).toEqual({
			col: 5,
			row: 2,
			width: 2,
			height: 1,
		});
		// And nothing was written into the sheet's own list on the way past.
		expect(await position(harness, 'abilities')).toEqual({
			col: 7,
			row: 1,
			width: 6,
			height: 1,
		});
	});

	it('swallows the click a drag leaves behind, and only that one', async () => {
		/*
		 * A drag ends in a click on the same element, and that click meant "put
		 * it here" rather than "select it". The panel's heading is what says
		 * which: it stays on the layout's own settings through the drag, and an
		 * ordinary press on the same block still selects — which is the half that
		 * keeps the guard from being a way to break selection outright.
		 */
		sheetGrid(harness);
		const heading = () =>
			harness.container
				.querySelector('.sheetsmith-editor-panel')
				?.querySelector('.setting-item-heading')?.textContent;
		expect(heading()).toBe('Layout');

		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		dragTo(cell, 4, 1);
		release(cell);
		// Synchronously, the way the browser dispatches it: `dragged` is cleared
		// on the next turn of the loop.
		cell.click();
		await settle(harness.pane);
		expect(heading()).toBe('Layout');

		// A whole press with no move in it, which is what the guard has to tell
		// apart from the drag above: `finish` leaves early when nothing moved, so
		// the click that follows is an ordinary one.
		const pressed = control(harness, 'preview-left');
		pressDown(pressed, at(4, 1));
		release(pressed);
		pressed.click();
		await settle(harness.pane);
		expect(heading()).toBe('Left');
	});
});

/**
 * Give a schematic explicit, unequal row tracks — the geometry a browser
 * reports once a grid's rows are no longer alike, which is exactly what a
 * live component's rows are not (§3 of the grid canvas spec).
 *
 * Monkeypatches `getComputedStyle` for this one element, on the same argument
 * `measure` already makes for `clientWidth`: happy-dom does not run layout, so
 * `grid-template-rows` never resolves into pixels on its own. Restored is not
 * needed — the whole environment is disposed with the test.
 */
function measureRows(
	el: HTMLElement,
	tracks: string,
	property: 'gridTemplateRows' | 'gridTemplateColumns' = 'gridTemplateRows',
): void {
	const view = el.ownerDocument.defaultView;
	if (!view) throw new Error('no window');
	const original = view.getComputedStyle.bind(view);
	view.getComputedStyle = ((target: Element, pseudo?: string | null) => {
		const styles = original(target, pseudo);
		if (target === el) {
			Object.defineProperty(styles, property, {
				value: tracks,
				configurable: true,
			});
		}
		return styles;
	});
}

/**
 * The same, for columns: what a browser reports once content has widened some
 * `1fr` tracks and squeezed the empty ones, which is what an eight-column sheet
 * with three occupied columns looked like when the drag divided it evenly.
 * Chains onto `measureRows`'s patch rather than replacing it, so a case can set
 * both.
 */
function measureColumns(el: HTMLElement, tracks: string): void {
	measureRows(el, tracks, 'gridTemplateColumns');
}

describe('row geometry read off the grid rather than assumed', () => {
	it('lands a drag in the row the pointer is actually over, not a uniform pitch\'s', async () => {
		harness = await open(unevenSchematic());
		const grid = sheetGrid(harness);
		// `tall`'s own two rows, resolved to 88px then 44px — so a uniform
		// 44px pitch (the old behaviour, and what `measure`'s own ROW
		// constant is) would place a pointer at y=100 one row further down
		// than the grid it is actually drawn on says: still inside `tall`'s
		// own band (its second row), not past it.
		measureRows(grid, '88px 44px');

		const cell = control(harness, 'preview-left');
		pressDown(cell, { clientX: TRACK / 2, clientY: 10 });
		cell.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: TRACK / 2,
				clientY: 100,
			}),
		);
		expect(box(cell)).toBe('1 / span 2, 2 / span 1');
		release(cell);
	});

	it('drags across a two-row-tall component into a one-row component\'s band', async () => {
		harness = await open(unevenSchematic());
		const grid = sheetGrid(harness);
		measureRows(grid, '88px 44px');

		const cell = control(harness, 'preview-left');
		pressDown(cell, { clientX: TRACK / 2, clientY: 10 });
		// 88 + 44 = 132 is the end of `tall`'s own two resolved rows; ten
		// pixels past it is still short of a further 44px pitch, so it counts
		// as the first row after the known ones — row 3, which is exactly
		// where `short`, the one-row component, already sits.
		cell.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: TRACK / 2,
				clientY: 132 + 10,
			}),
		);
		expect(box(cell)).toBe('1 / span 2, 3 / span 1');
		release(cell);
	});
});

/**
 * Every guide line the schematic is showing, by axis, in the order drawn.
 *
 * Read off each line's own `style` and not off a rule, because the geometry is
 * the one thing about a guide that cannot be in the stylesheet: a grid whose
 * rows are content-sized has no pitch a CSS rule could name.
 */
function guides(grid: HTMLElement): { columns: number[]; rows: number[] } {
	// This grid's own guide and not a nested container's, on `canvas.ts`'s own
	// rule about reading a level locally: a `querySelectorAll` from the sheet's
	// grid finds every line a container inside it is drawing too, and the case
	// below turns on the sheet drawing none while a container draws five.
	const box = grid.querySelector<HTMLElement>(':scope > .sheetsmith-grid-guides');
	const read = (name: string, side: 'left' | 'top') =>
		Array.from(
			box?.querySelectorAll<HTMLElement>(`.sheetsmith-grid-guide-${name}`) ?? [],
		).map((line) => parseFloat(line.style[side]));
	return { columns: read('column', 'left'), rows: read('row', 'top') };
}

describe('the grid drawn behind a gesture', () => {
	beforeEach(async () => {
		harness = await open(schematic());
	});

	it('draws itself on the first movement and takes itself down on release', async () => {
		/*
		 * **When**, and the second half is the reason for the first: every
		 * selection on this canvas is a press on the same overlay a drag starts
		 * on, so a grid drawn at `pointerdown` would flash the whole lattice each
		 * time an author opened a component's form.
		 */
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');

		pressDown(cell, at(1, 1));
		expect(guides(grid).columns).toEqual([]);
		expect(grid.classList.contains('sheetsmith-grid-guided')).toBe(false);

		dragTo(cell, 2, 1);
		// Eleven interior boundaries across twelve columns, one every `TRACK`.
		// The outer two edges take no line: there is no gutter there, and a line
		// on them would read as a frame around the canvas rather than as the
		// grid inside it.
		expect(guides(grid).columns).toEqual([
			10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
		]);
		expect(grid.classList.contains('sheetsmith-grid-guided')).toBe(true);

		release(cell);
		expect(guides(grid).columns).toEqual([]);
		expect(grid.classList.contains('sheetsmith-grid-guided')).toBe(false);
		await settle(harness.pane);
	});

	it('leaves a press that only selects with no grid behind it', async () => {
		// The whole press, which the case above stops halfway through: what the
		// first-movement rule has to tell apart from a drag is a press that ends
		// where it started, and that is how an author opens a form.
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		release(cell);
		cell.click();
		await settle(harness.pane);
		expect(guides(grid).columns).toEqual([]);
		expect(guides(grid).rows).toEqual([]);
	});

	it('puts a row line where the drag changes row, not where a uniform pitch would', async () => {
		/*
		 * The claim the whole guide rests on: what is drawn is what the gesture
		 * snaps to, because both come from one reading of the grid. The fixture
		 * is `row geometry read off the grid`'s own — a two-row component beside
		 * a one-row one, resolving to `88px 44px` — where a uniform 44px pitch
		 * would draw lines at 44 and 88 and the grid actually changes row at 88
		 * and 132. The drag to y=100 lands in row 2, the band between the two
		 * lines that are drawn.
		 */
		harness = await open(unevenSchematic());
		const grid = sheetGrid(harness);
		measureRows(grid, '88px 44px');
		const cell = control(harness, 'preview-left');

		pressDown(cell, { clientX: TRACK / 2, clientY: 10 });
		cell.dispatchEvent(
			new PointerEvent('pointermove', {
				pointerId: 1,
				clientX: TRACK / 2,
				clientY: 100,
			}),
		);
		expect(guides(grid).rows).toEqual([88, 132]);
		expect(box(cell)).toBe('1 / span 2, 2 / span 1');
		release(cell);
		await settle(harness.pane);
	});

	it('snaps to columns the content has widened, and draws them where they are', async () => {
		/*
		 * The defect this was reported on. `repeat(12, 1fr)` is not twelve equal
		 * columns once a component's content will not shrink: its track grows and
		 * the empty ones give up the width. Here the first two columns resolve to
		 * 40px and the rest to nothing much, so column 3 starts at 80 — where an
		 * even division of the 120px grid would put column 9. A pointer at x=82
		 * is over column 3, the line is drawn at 80, and the block lands there.
		 */
		const grid = sheetGrid(harness);
		measureColumns(grid, '40px 40px 4px 4px 4px 4px 4px 4px 4px 4px 4px 4px');
		const cell = control(harness, 'preview-left');

		pressDown(cell, { clientX: 5, clientY: ROW / 2 });
		cell.dispatchEvent(
			new PointerEvent('pointermove', { pointerId: 1, clientX: 82, clientY: ROW / 2 }),
		);
		expect(box(cell)).toBe('3 / span 2, 1 / span 1');
		expect(guides(grid).columns.slice(0, 3)).toEqual([40, 80, 84]);
		release(cell);
		await settle(harness.pane);
	});

	it('holds the tracks still for the gesture, and lets them go at the end', async () => {
		/*
		 * The grid's tracks are content-sized, so the block being dragged resizes
		 * the columns it passes through, and the lines and the target measured at
		 * the press would drift off the grid on screen. What is asserted is the
		 * mechanism: the measured sizes pinned inline at the press, and cleared
		 * whichever way the gesture ends — including a press that moved nothing,
		 * which returns before any other clean-up runs.
		 */
		const grid = sheetGrid(harness);
		measureColumns(grid, '40px 40px 4px 4px 4px 4px 4px 4px 4px 4px 4px 4px');
		measureRows(grid, '88px 44px');
		const cell = control(harness, 'preview-left');

		pressDown(cell, at(1, 1));
		expect(grid.style.gridTemplateColumns).toBe(
			'40px 40px 4px 4px 4px 4px 4px 4px 4px 4px 4px 4px',
		);
		expect(grid.style.gridTemplateRows).toBe('88px 44px');
		expect(grid.style.gridAutoRows).toBe(`${ROW}px`);
		release(cell);
		expect(grid.style.gridTemplateColumns).toBe('');
		expect(grid.style.gridTemplateRows).toBe('');
		expect(grid.style.gridAutoRows).toBe('');
		await settle(harness.pane);
	});

	it('marks the cells the block will occupy, and follows it', async () => {
		/*
		 * The lattice says where the lines are; the target says which cells this
		 * block is about to take, which is the question a drag is actually asking.
		 * Drawn from the tracks and not from the block's own box, so it is the
		 * placement the file will hold.
		 */
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		const target = () =>
			grid.querySelector<HTMLElement>(':scope > .sheetsmith-grid-target');

		pressDown(cell, at(1, 1));
		expect(target()).toBeNull();
		dragTo(cell, 2, 1);
		// `left` is two columns wide: columns 2 and 3, one row.
		expect(target()?.style.left).toBe('10px');
		expect(target()?.style.width).toBe('20px');
		expect(target()?.style.top).toBe('0px');
		expect(target()?.style.height).toBe(`${ROW}px`);

		dragTo(cell, 5, 3);
		expect(target()?.style.left).toBe('40px');
		expect(target()?.style.top).toBe(`${2 * ROW}px`);

		release(cell);
		expect(target()).toBeNull();
		await settle(harness.pane);
	});

	it('goes down on an Escape as well as on a release', async () => {
		// The restore is the other way a gesture ends, and a grid left behind by
		// it would sit over a layout nobody is dragging.
		const grid = sheetGrid(harness);
		const cell = control(harness, 'preview-left');
		pressDown(cell, at(1, 1));
		dragTo(cell, 6, 3);
		expect(guides(grid).columns.length).toBe(11);

		cell.ownerDocument.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape' }),
		);
		expect(guides(grid).columns).toEqual([]);
		expect(box(cell)).toBe('1 / span 2, 1 / span 1');
		await settle(harness.pane);
	});

	it("draws the container's own grid for a drag inside one, and not the sheet's", async () => {
		/*
		 * The guide is parameterised over the schematic exactly as the gesture
		 * is: a child dragged inside a six-column container is snapping to six
		 * columns, so that is the grid that appears, and the sheet's twelve stay
		 * out of it. Reading the sheet's own grid as well is what makes this a
		 * claim about *which* schematic rather than about any grid appearing.
		 */
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);
		const inner = harness.container.querySelector(
			'[data-sheetsmith-grid="defences"]',
		);
		if (!inner) throw new Error('no schematic for the container');
		measure(inner as HTMLElement, 6);

		const cell = control(harness, 'preview-armour');
		pressDown(cell, at(1, 1));
		dragTo(cell, 2, 1);
		expect(guides(inner as HTMLElement).columns).toEqual([10, 20, 30, 40, 50]);
		expect(guides(sheetGrid(harness)).columns).toEqual([]);
		release(cell);
		await settle(harness.pane);
	});
});
