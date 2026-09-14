/*
 * Where a schematic's grid lines fall in pixels, and the guides that draw them
 * while a gesture is running.
 *
 * **Why the two halves are one module.** The measurement existed already, as a
 * private method on `SchematicGestures`, and the guides are the same numbers
 * rendered instead of divided: a line is drawn exactly where `trackAt` flips its
 * answer, and the target is drawn over exactly the tracks the block will occupy.
 * Split across two files they would drift the way any two answers to one
 * question drift, and the drift would be invisible — a guide a few pixels off
 * the snap looks like a guide. Together, a reader checking "does the grid I can
 * see match the grid it snaps to" reads one file.
 *
 * **Neither axis is assumed uniform, and columns are the case that proved it.**
 * This module first read row tracks off the browser and divided the width into
 * equal columns, on the argument that `repeat(n, 1fr)` makes them equal. It does
 * not: `1fr` is `minmax(auto, 1fr)`, so a track holding a component whose content
 * cannot shrink grows past its share and the empty tracks beside it give the
 * width up. On an eight-column 5e sheet with three occupied columns, a one-column
 * card measured 371px where the division said 134 — and the drag snapped, and
 * the guides were drawn, against a grid that was not on screen. The sheet's grid
 * is `minmax(0, 1fr)` now, so its columns are equal again (`sheet.css`), but
 * this still reads both axes off the browser rather than trusting that: rows
 * were never uniform, and a reading cannot go stale when a stylesheet changes
 * under it the way a division can. A uniform pitch stands in only where there is
 * nothing to resolve.
 *
 * What is *not* here is what to do with a cell once you have it: the clamping,
 * the pointer capture and the writes are the gesture's, and stay in
 * `schematic-gestures.ts`.
 *
 * **No `Schematic` here.** The measurement takes an element and a column count,
 * which is all it ever read off one, so nothing in this file knows that a
 * schematic, an editor or a pane exists. That keeps the import edge
 * one-directional: `schematic-gestures.ts` reads this, and this reads DOM.
 */

import { GridPosition } from '../types';

/**
 * One axis of a grid: where its tracks start, and what stands in past them.
 *
 * `starts` is the grid's own resolved per-track offsets, read off
 * `getComputedStyle(...).gridTemplateColumns` / `gridTemplateRows` rather than
 * assumed, plus one trailing entry for where the last track ends. `null` where
 * the browser has not resolved the template into pixels — a browser that has not
 * run layout, happy-dom — and `pitch` then answers every track.
 *
 * `pitch` is also what keeps counting past the last resolved track, because
 * neither axis is bounded there: the sheet's rows grow as a block is dragged
 * below them, and a column past the last one is a hand-authored layout the grid
 * still has to draw (`SPEC` §7).
 */
export interface GridAxis {
	starts: number[] | null;
	/** One track plus the gap after it, where nothing is resolved. */
	pitch: number;
	gap: number;
}

/** Where a schematic's grid lines fall, in client coordinates. */
export interface PreviewMetrics {
	/** Left edge of the first column. */
	left: number;
	/** Top edge of the first row. */
	top: number;
	/** Columns at this level, which is where the grid ends. */
	columns: number;
	column: GridAxis;
	row: GridAxis;
}

/**
 * A grid template, resolved to one pixel size per track, or null where it
 * cannot be read that way.
 *
 * `none` and the empty string are the two spellings of "no tracks", and a token
 * that will not parse as a plain pixel length (a bare `repeat(...)` a browser has
 * not expanded, a `fr` nothing has resolved) means the same thing: nothing to read
 * pixels off yet.
 *
 * **A zero-size track is a real answer, not a failure to resolve**, and it is the
 * whole column case above: an empty `1fr` column beside wide content can resolve
 * to 0px. Rejecting it would throw away every other track's true width and fall
 * back to the division that was wrong. A template of nothing *but* zeros is
 * still refused, since that is a grid with no layout rather than a squeezed one.
 */
function parseTracks(raw: string): number[] | null {
	const trimmed = raw.trim();
	if (trimmed === '' || trimmed === 'none') return null;
	const tracks = trimmed.split(/\s+/).map((token) => parseFloat(token));
	if (tracks.some((size) => !Number.isFinite(size) || size < 0)) return null;
	if (!tracks.some((size) => size > 0)) return null;
	return tracks;
}

/**
 * The cumulative offset of each resolved track, plus one trailing entry for
 * where the last one ends (without a gap it never had after it).
 */
function startsOf(tracks: readonly number[], gap: number): number[] {
	const starts: number[] = [];
	let offset = 0;
	for (const size of tracks) {
		starts.push(offset);
		offset += size + gap;
	}
	starts.push(offset - gap);
	return starts;
}

/**
 * Where track `index` (0-based) starts, from the axis origin.
 *
 * Past the last resolved track the pitch takes over from where that track ended
 * plus one gap, which is where a further track would start if the browser had
 * drawn one.
 */
export function trackStart(axis: GridAxis, index: number): number {
	const starts = axis.starts;
	if (!starts || starts.length < 2) return index * axis.pitch;
	const known = starts.length - 1;
	if (index < known) return starts[index] as number;
	return (starts[known] as number) + axis.gap + (index - known) * axis.pitch;
}

/** Where track `index` (0-based) ends. */
export function trackEnd(axis: GridAxis, index: number): number {
	return trackStart(axis, index + 1) - axis.gap;
}

/**
 * Which track (0-based) an offset from the axis origin is over.
 *
 * A pointer in a gutter counts as the track before it: the answer flips where the
 * next track starts, which is also where `boundaries` draws its line, less half a
 * gap. Before the first track counts as the first, so a pointer on the grid's own
 * padding is not a column zero.
 */
export function trackAt(axis: GridAxis, offset: number): number {
	const starts = axis.starts;
	if (!starts || starts.length < 2) {
		return Math.max(0, Math.floor(offset / axis.pitch));
	}
	const known = starts.length - 1;
	for (let index = 0; index < known; index++) {
		if (offset < trackStart(axis, index + 1)) return index;
	}
	const past = offset - trackStart(axis, known);
	return known + Math.floor(past / axis.pitch);
}

/**
 * A grid's geometry, in the units it is actually drawn in. Null for a grid with
 * no measurable width, which is a grid no pointer can be over.
 *
 * Read from the element rather than assumed, so a theme changing the padding or
 * the gap, or content widening a column, moves the drop targets — and the
 * guides — with it.
 */
export function previewMetrics(
	el: HTMLElement,
	columns: number,
): PreviewMetrics | null {
	const view = el.ownerDocument.defaultView;
	if (!view) return null;
	const styles = view.getComputedStyle(el);
	const columnGap = parseFloat(styles.columnGap) || 0;
	const rowGap = parseFloat(styles.rowGap) || 0;
	const padLeft = parseFloat(styles.paddingLeft) || 0;
	const padTop = parseFloat(styles.paddingTop) || 0;
	const inner = el.clientWidth - padLeft - (parseFloat(styles.paddingRight) || 0);
	const track = (inner - (columns - 1) * columnGap) / columns;
	const rowHeight = parseFloat(styles.gridAutoRows) || 44;
	if (!(track > 0)) return null;
	const box = el.getBoundingClientRect();
	const columnTracks = parseTracks(styles.gridTemplateColumns);
	const rowTracks = parseTracks(styles.gridTemplateRows);
	return {
		left: box.left + padLeft,
		top: box.top + padTop,
		columns,
		column: {
			starts: columnTracks ? startsOf(columnTracks, columnGap) : null,
			pitch: track + columnGap,
			gap: columnGap,
		},
		row: {
			starts: rowTracks ? startsOf(rowTracks, rowGap) : null,
			pitch: rowHeight + rowGap,
			gap: rowGap,
		},
	};
}

/**
 * Every interior track boundary on one axis, from track 1 until `limit`, as the
 * offset of the middle of the gutter before that track.
 *
 * Centred in the gutter, not on the boundary: a line on the boundary is a line
 * under the next component's own edge, hidden by every cell that has one. The
 * resolved tracks are always all drawn; `limit` bounds only the pitch run past
 * them, which is unbounded by construction — a few tracks past what is on
 * screen, clipped until the grid grows into them.
 */
function boundaries(axis: GridAxis, limit: number): number[] {
	const found: number[] = [];
	const known = axis.starts && axis.starts.length >= 2 ? axis.starts.length - 1 : 0;
	for (let index = 1; ; index++) {
		const at = trackStart(axis, index) - axis.gap / 2;
		// `known` itself is always drawn when anything resolved: it is the edge
		// of the last real track, where a drag past it changes row.
		if (index > known && at >= limit) break;
		found.push(at);
	}
	return found;
}

/**
 * Draw the grid behind a schematic, for as long as a gesture is running on it,
 * with the cells `position` covers marked as the target.
 *
 * **Appended last, never inserted first.** `canvas.ts` maps
 * `schematic.components` onto `schematic.el.children` by index — the pinned
 * invariant `docs/features/layout-editor-pane.md` names, which `markOverlaps`
 * reads back on every frame of a drag. A child at the end leaves that mapping
 * untouched, and both readers skip a child with no overlay in it. Stacking is
 * answered in CSS instead: see `.sheetsmith-grid-guided`.
 *
 * An absolutely positioned child of a grid container takes no part in grid
 * layout, so this adds no track and shifts nothing.
 */
export function showGridGuides(
	el: HTMLElement,
	metrics: PreviewMetrics,
	position: GridPosition,
): void {
	hideGridGuides(el);
	el.addClass('sheetsmith-grid-guided');
	const guides = el.createDiv('sheetsmith-grid-guides');
	guides.setAttribute('aria-hidden', 'true');
	// A sibling of the lines rather than one of them, because the two belong
	// on opposite sides of the components: the lattice behind every cell, the
	// target in front of the block being dragged, which otherwise covers the
	// very cells it is being told it will occupy.
	el.createDiv('sheetsmith-grid-target').setAttribute('aria-hidden', 'true');

	// Measured off the guide itself rather than off the grid: the guide fills
	// the grid's padding box, which is where a border — a theme's, not this
	// plugin's — would put the two origins a pixel apart.
	const origin = guides.getBoundingClientRect();
	const left = metrics.left - origin.left;
	const top = metrics.top - origin.top;

	// Interior boundaries only: the outer edges are where the sheet's own
	// padding already is, and a line there reads as a frame around the canvas
	// rather than as the grid inside it.
	for (const at of boundaries(metrics.column, el.clientWidth - left)) {
		const line = guides.createDiv('sheetsmith-grid-guide-column');
		line.setCssStyles({ left: `${left + at}px` });
	}
	for (const at of boundaries(metrics.row, el.clientHeight - top)) {
		const line = guides.createDiv('sheetsmith-grid-guide-row');
		line.setCssStyles({ top: `${top + at}px` });
	}
	markGridTarget(el, metrics, position);
}

/**
 * Move the target to the cells `position` covers, on a grid already showing its
 * guides. A no-op on one that is not.
 *
 * The target is what answers "which cell is this going to", which the lines
 * alone do not: a component's own box can be wider than its content, narrower
 * than its placement, or behind another component, and a lattice with nothing
 * marked on it leaves the reader counting lines. Drawn from the tracks rather
 * than from the dragged element's box, so it is the placement the file will
 * hold, not whatever size the component rendered at.
 */
export function markGridTarget(
	el: HTMLElement,
	metrics: PreviewMetrics,
	position: GridPosition,
): void {
	const target = el.querySelector<HTMLElement>(':scope > .sheetsmith-grid-target');
	const guides = el.querySelector<HTMLElement>(':scope > .sheetsmith-grid-guides');
	if (!target || !guides) return;
	// The guide's box, which is the grid's padding box and so the target's
	// containing block too; the target's own rect moves with every write.
	const origin = guides.getBoundingClientRect();
	const left = metrics.left - origin.left;
	const top = metrics.top - origin.top;
	const x = trackStart(metrics.column, position.col - 1);
	const y = trackStart(metrics.row, position.row - 1);
	target.setCssStyles({
		left: `${left + x}px`,
		top: `${top + y}px`,
		width: `${trackEnd(metrics.column, position.col + position.width - 2) - x}px`,
		height: `${trackEnd(metrics.row, position.row + position.height - 2) - y}px`,
	});
}

/**
 * The sizes a resolved axis was measured at, as a template, or null where
 * nothing resolved.
 */
function templateOf(axis: GridAxis): string | null {
	const starts = axis.starts;
	if (!starts || starts.length < 2) return null;
	const sizes: string[] = [];
	for (let index = 0; index < starts.length - 1; index++) {
		sizes.push(`${trackEnd(axis, index) - trackStart(axis, index)}px`);
	}
	return sizes.join(' ');
}

/**
 * Hold a grid's tracks at the sizes they were measured at, for the length of a
 * gesture.
 *
 * **Why the grid has to stand still.** Its tracks are content-sized on both
 * axes, so the block being dragged *is* part of what sizes them: carry a card
 * into a narrow column and that column widens under the pointer, carry it out of
 * a wide one and every column to its right slides left. A measurement taken at
 * the press then describes a grid that is no longer on screen — the lines drift
 * off the cells, the target off the block — and re-measuring on every move is
 * worse, since a column that shrinks as the block leaves it moves the next
 * boundary past the pointer and the block chases it. Freezing the tracks is what
 * makes "the cell under the pointer" a stable question for as long as it is
 * being asked. The grid reflows to its real sizes when the gesture ends and the
 * canvas redraws, which is also when the file is written.
 *
 * The pitch past the last resolved row is frozen too, as `grid-auto-rows`, so a
 * row a drag creates below the sheet is exactly the height the arithmetic
 * already counts it as.
 *
 * Inline, through `setCssStyles`: runtime geometry, `docs/PATTERNS.md`'s one
 * sanctioned use of an element's own style. A grid whose tracks never resolved
 * (happy-dom, or a grid collapsed into a flex column) is left alone.
 */
export function freezeGrid(el: HTMLElement, metrics: PreviewMetrics): void {
	const columns = templateOf(metrics.column);
	const rows = templateOf(metrics.row);
	if (columns) el.setCssStyles({ gridTemplateColumns: columns });
	if (rows) {
		el.setCssStyles({
			gridTemplateRows: rows,
			gridAutoRows: `${metrics.row.pitch - metrics.row.gap}px`,
		});
	}
}

/** Let a frozen grid size its tracks again. Safe on one never frozen. */
export function thawGrid(el: HTMLElement): void {
	el.setCssStyles({ gridTemplateColumns: '', gridTemplateRows: '', gridAutoRows: '' });
}

/** Take the grid back down. Safe on a schematic that never showed one. */
export function hideGridGuides(el: HTMLElement): void {
	el.removeClass('sheetsmith-grid-guided');
	el.querySelector(':scope > .sheetsmith-grid-guides')?.remove();
	el.querySelector(':scope > .sheetsmith-grid-target')?.remove();
}
