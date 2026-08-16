/*
 * Layout file parsing (SPEC §3.2).
 *
 * A layout is a JSON file in the configured layout folder. Until the layout
 * editor exists (M4), layouts are written by hand, so errors name what is
 * wrong rather than failing silently.
 */

import { ComponentConfig, GridPosition, ResetBinding } from '../types';

export class LayoutParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LayoutParseError';
	}
}

/**
 * Grid width for a layout that does not name one.
 *
 * Applied where a layout is read rather than filled in when it is parsed: an
 * absent `columns` has to stay absent through a round trip, or every
 * hand-authored layout grows a key it never asked for on first save.
 */
export const DEFAULT_COLUMNS = 12;

export interface Layout {
	name: string;
	/** Grid column count. Defaults to `DEFAULT_COLUMNS`. */
	columns?: number;
	components: ComponentConfig[];
	/**
	 * The layout's own functions (SPEC §5), one definition per line. Held as
	 * written rather than parsed: a definition with a typo in it is a problem
	 * to show in the editor, not a reason to refuse the whole layout, so the
	 * text survives the round trip and `parseFunctions` reads it.
	 */
	functions?: string[];
	/**
	 * The layout's named reset triggers (SPEC §6), in the order their buttons
	 * appear. Held as written for the same reason `functions` is: whether a
	 * name is usable — blank, repeated, or bound by nothing — is contents to
	 * report in the editor, not a reason to refuse the file.
	 */
	triggers?: string[];
	/**
	 * Top-level keys this version does not understand (promoted fields) are
	 * preserved verbatim, so editing a layout never strips them from the file.
	 */
	[key: string]: unknown;
}

/**
 * A component id is what formulas reference (SPEC §4.1), so it has to be a
 * name the expression parser accepts. A hyphen is the trap: `armour-class`
 * tokenizes as `armour` minus `class`, so the id reads as arithmetic over
 * two names that do not exist, and the formula fails for a reason that
 * points nowhere near the actual problem.
 */
const COMPONENT_ID = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Rewrite an id no formula could reference into one that can.
 *
 * This plugin's own editor emitted hyphenated ids until the clash with the
 * expression parser was understood, so rejecting them would blank the whole
 * sheet — over a name that, being unreferencable, nothing can be pointing
 * at. That is exactly why the rewrite is safe: sections key on the label,
 * and no formula can have depended on the old form. Layout files carry no
 * byte-identical promise, so the new id persists on the next save.
 */
function migrateId(raw: string, taken: ReadonlySet<string>): string {
	let base = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
	if (base === '' || /^[0-9]/.test(base)) base = `_${base}`;
	let id = base;
	let counter = 2;
	while (taken.has(id)) id = `${base}_${counter++}`;
	return id;
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

/**
 * A component's reset binding (SPEC §6), or undefined where it has none.
 *
 * Checked rather than carried through untouched like the rest of a
 * component's config, because `reset` is shared config the plugin itself acts
 * on — the same category as `position`, so §5's rule that a wrong shape
 * refuses the file applies to it and not merely to `columns` and `functions`.
 * Without this the type's `action` would be a guarantee nothing enforced: a
 * binding arriving without one parses clean, and the trigger button silently
 * does nothing.
 *
 * The pre-split shape, `{ trigger, to: "max" }`, is refused rather than
 * migrated. The `migrateId` precedent above exists because this plugin's own
 * editor emitted the ids it rewrites; nothing has ever written a `reset`, so
 * there is no file in the wild to protect, and quietly blessing a shape the
 * spec no longer has would be worse than naming it.
 */
function parseReset(value: unknown, where: string): ResetBinding | undefined {
	if (value === undefined) return undefined;
	if (!isRecord(value)) {
		throw new LayoutParseError(`${where} "reset" must be an object.`);
	}
	const trigger = requireString(value, 'trigger', `${where} reset`);
	const action = value.action;
	if (action !== 'full' && action !== 'empty' && action !== 'formula') {
		throw new LayoutParseError(
			`${where} reset needs an "action" of "full", "empty", or "formula".`,
		);
	}
	const to = value.to;
	if (to !== undefined && typeof to !== 'string') {
		throw new LayoutParseError(`${where} reset "to" must be a string.`);
	}
	if (action === 'formula' && (to === undefined || to.trim() === '')) {
		throw new LayoutParseError(
			`${where} reset action "formula" needs a "to" expression.`,
		);
	}
	// A `to` left beside `full` or `empty` is kept, not dropped: it does not
	// run, but switching the action in the editor and back must not throw the
	// expression away.
	return { trigger, action, ...(to !== undefined ? { to } : {}) };
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
	const reset = parseReset(value.reset, `${where} ("${label}")`);
	// Carry component-specific config fields (derived, max, columns, …)
	// through untouched; each component validates its own.
	return { ...value, id, type, label, position, ...(reset ? { reset } : {}) };
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

	// Only the shape is checked here. What each line says is the function
	// library's business, and it reports a bad definition rather than
	// throwing: one typo must not stop every sheet on this layout rendering.
	const functions = raw.functions;
	if (
		functions !== undefined &&
		(!Array.isArray(functions) ||
			functions.some((line) => typeof line !== 'string'))
	) {
		throw new LayoutParseError(
			'"functions" must be an array of strings, one definition per line.',
		);
	}

	// Same rule as the function library: the shape of the key is the file
	// format's business and refuses the layout, while what the names say is
	// reported where it can be fixed. See parseTriggers.
	const triggers = raw.triggers;
	if (
		triggers !== undefined &&
		(!Array.isArray(triggers) ||
			triggers.some((name) => typeof name !== 'string'))
	) {
		throw new LayoutParseError(
			'"triggers" must be an array of strings, one trigger name per entry.',
		);
	}

	const components = raw.components.map(parseComponent);

	// Migrate before the duplicate check, and only ids that fail: two
	// components genuinely sharing a usable id is an authoring error worth
	// reporting, not something to quietly rename apart.
	const usable = new Set(
		components.filter((c) => COMPONENT_ID.test(c.id)).map((c) => c.id),
	);
	for (const component of components) {
		if (COMPONENT_ID.test(component.id)) continue;
		component.id = migrateId(component.id, usable);
		usable.add(component.id);
	}

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
		...(functions !== undefined ? { functions: functions as string[] } : {}),
		...(triggers !== undefined ? { triggers: triggers as string[] } : {}),
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
