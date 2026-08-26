/*
 * The arithmetic behind the layout editor's schematic.
 *
 * Split out of the editor because it is the part with no DOM in it: where a
 * block may sit, how far it may grow, whether two of them collide, and how
 * that reads out loud. Dragging a block, dragging its corner, and the arrow
 * keys all answer to the same rules, and the failure worth catching is the
 * three of them disagreeing — which is testable here without an app around it,
 * and was not testable at all while it lived inside the editor's own module.
 */

import { ComponentConfig, GridPosition } from '../types';

export function clamp(value: number, low: number, high: number): number {
	return Math.min(Math.max(value, low), high);
}

/**
 * The largest a block's `col` (or `width`) may become without running off
 * the right of the grid, given the other of the pair.
 *
 * `current` is what the gesture started from, and it is the floor: a block
 * already sitting past the last column — a hand-authored layout, or one whose
 * `columns` was reduced under it — can still be moved and shrunk freely. It
 * just cannot be pushed further out. Snapping it back unasked would move
 * something the user never touched.
 */
export function lastColumn(
	columns: number,
	other: number,
	current: number,
): number {
	return Math.max(columns - other + 1, current);
}

/** A block's position and size, as a screen reader hears it. */
export function describeCell(
	config: ComponentConfig,
	overlaps: boolean,
): string {
	const { col, row, width, height } = config.position;
	return (
		`${config.label}: column ${col}, row ${row}, ${width}×${height}` +
		(overlaps ? '. Overlaps another component' : '')
	);
}

/** Indices of components whose grid rectangles intersect another's. */
export function findOverlaps(components: ComponentConfig[]): Set<number> {
	const overlapping = new Set<number>();
	const intersects = (a: GridPosition, b: GridPosition): boolean =>
		a.col < b.col + b.width &&
		b.col < a.col + a.width &&
		a.row < b.row + b.height &&
		b.row < a.row + a.height;
	for (let i = 0; i < components.length; i++) {
		for (let j = i + 1; j < components.length; j++) {
			const a = components[i] as ComponentConfig;
			const b = components[j] as ComponentConfig;
			if (intersects(a.position, b.position)) {
				overlapping.add(i);
				overlapping.add(j);
			}
		}
	}
	return overlapping;
}
