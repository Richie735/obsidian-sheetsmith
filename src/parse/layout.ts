/*
 * Layout file parsing (SPEC §3.2).
 *
 * A layout is a JSON file in the configured layout folder. Until the layout
 * editor exists (M4), layouts are written by hand, so errors name what is
 * wrong rather than failing silently.
 */

import { ComponentConfig, GridPosition } from '../types';

export class LayoutParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LayoutParseError';
	}
}

export interface Layout {
	name: string;
	/** Grid column count. Defaults to 12. */
	columns?: number;
	components: ComponentConfig[];
	/**
	 * Top-level keys this version does not understand (a hand-authored
	 * function library, reset triggers, promoted fields) are preserved
	 * verbatim, so editing a layout never strips them from the file.
	 */
	[key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
	record: Record<string, unknown>,
	key: string,
	where: string,
): string {
	const value = record[key];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new LayoutParseError(`${where} needs a non-empty "${key}" string.`);
	}
	// Trimmed at the gate: the character parser trims section labels, so an
	// untrimmed layout label would never match its own section and every
	// edit would append a duplicate.
	return value.trim();
}

function parsePosition(value: unknown, where: string): GridPosition {
	if (!isRecord(value)) {
		throw new LayoutParseError(`${where} needs a "position" object.`);
	}
	const position: Partial<GridPosition> = {};
	for (const key of ['col', 'row', 'width', 'height'] as const) {
		const raw = value[key];
		if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
			throw new LayoutParseError(
				`${where} position needs a positive integer "${key}".`,
			);
		}
		position[key] = raw;
	}
	return position as GridPosition;
}

function parseComponent(value: unknown, index: number): ComponentConfig {
	const where = `Component ${index + 1}`;
	if (!isRecord(value)) {
		throw new LayoutParseError(`${where} is not an object.`);
	}
	const id = requireString(value, 'id', where);
	const type = requireString(value, 'type', where);
	const label = requireString(value, 'label', where);
	if (/[\r\n]/.test(label)) {
		throw new LayoutParseError(
			`${where} label cannot contain a line break, because it becomes a section heading.`,
		);
	}
	const position = parsePosition(value.position, `${where} ("${label}")`);
	// Carry component-specific config fields (derived, max, columns, …)
	// through untouched; each component validates its own.
	return { ...value, id, type, label, position };
}

export function parseLayout(source: string): Layout {
	let raw: unknown;
	try {
		raw = JSON.parse(source);
	} catch (error) {
		throw new LayoutParseError(
			`Layout file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (!isRecord(raw)) {
		throw new LayoutParseError('Layout file must contain a JSON object.');
	}
	const name = requireString(raw, 'name', 'The layout');
	if (!Array.isArray(raw.components)) {
		throw new LayoutParseError('The layout needs a "components" array.');
	}
	const columns = raw.columns;
	if (
		columns !== undefined &&
		(typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1)
	) {
		throw new LayoutParseError('"columns" must be a positive integer.');
	}

	const components = raw.components.map(parseComponent);
	const ids = new Set<string>();
	const labels = new Set<string>();
	for (const component of components) {
		if (ids.has(component.id)) {
			throw new LayoutParseError(`Duplicate component id "${component.id}".`);
		}
		if (labels.has(component.label)) {
			throw new LayoutParseError(
				`Duplicate component label "${component.label}". Labels key note sections, so they must be unique.`,
			);
		}
		ids.add(component.id);
		labels.add(component.label);
	}

	// Spread first so unknown top-level keys survive the round trip, the
	// same way parseComponent preserves unknown component keys.
	return {
		...raw,
		name,
		...(columns !== undefined ? { columns } : {}),
		components,
	};
}

/**
 * Serialise a layout to file content. Layout files are plugin-managed, so
 * unlike character notes they carry no byte-identical promise; this is the
 * one canonical formatting.
 */
export function serialiseLayout(layout: Layout): string {
	return JSON.stringify(layout, null, '\t') + '\n';
}
