/*
 * List-shaped config fields for the form editor: a Table's rows and columns,
 * and the two-column entry list a Card set, a Card and a Track's rows share.
 *
 * These are the fields a Setting row cannot express, because each entry is
 * several inputs plus reorder and remove controls.
 *
 * The entry list arrived last and had been in `layout-editor.ts` since before
 * this module existed — the same shape, drawn from a class method, already
 * borrowing the chrome here. **The move was decided in the pass that made it**,
 * not inherited from a plan: the header this one replaced recorded only that the
 * shared chrome lives here, and said nothing about where the list belonged. What
 * argued it was §1, applied when the pane slice put the two side by side — the
 * three editors are one responsibility rather than three, being a list of
 * records, one row of inputs each, reorder and remove controls, and an add.
 */

import { Platform, setIcon } from 'obsidian';
import {
	levelCount,
	levelGlyph,
	MAX_LEVELS,
	paintLevelRing,
	parseLevel,
} from '../components/level-ring';
import {
	COLUMN_TYPES,
	ColumnType,
	DEFAULT_COLUMN_TYPE,
	DEFAULT_MAX_SOURCE,
	HOLDER_MAX_SOURCE,
	MAX_SOURCES,
	MaxSource,
	PUBLISHABLE_TYPES,
	TOTALLED_TYPES,
} from '../components/column-types';
import { copyableName } from './copyable-name';
import { showFieldError } from './field-error';
import { isName } from '../formula/expression';
import { ColumnOptionsSpec, EntryColumnSpec } from '../types';

/** What a list editor needs from the editor around it. */
export interface ListContext {
	/** Write the layout. */
	persist: () => void;
	/** Rebuild the pane. */
	redraw: () => void;
	/** Focus this token once the redraw has happened. */
	focusAfterRedraw: (token: string) => void;
	/**
	 * Briefly mark this token once the redraw has happened, for the change
	 * that rebuilds a region rather than editing one: without it the fields
	 * under a control simply become different fields, with nothing tying the
	 * new ones to the choice that produced them.
	 */
	flashAfterRedraw?: (token: string) => void;
	/** Ask before something authored is destroyed, then do it if confirmed. */
	confirm: (message: string, cta: string, onConfirm: () => void) => void;
	/** Inline errors by focus token, so they outlive a rebuild of the pane. */
	errors: Map<string, string>;
	/** Index of the entry being dragged, shared so one list reads its own. */
	drag: { index: number | null };
}

export function moveItem<T>(
	list: T[],
	from: number,
	to: number,
	context: ListContext,
): void {
	if (to < 0 || to >= list.length) return;
	const [item] = list.splice(from, 1);
	if (item === undefined) return;
	list.splice(to, 0, item);
	context.persist();
	context.redraw();
}

/**
 * Reorder and remove controls, and the drop target that goes with them.
 *
 * Focus ids follow the same two schemes as the entry list: inputs are
 * keyed by index so focus holds its position while typing, buttons by the
 * entry's own name so focus follows the item through a reorder.
 */
export function addControls<T>(
	row: HTMLElement,
	list: T[],
	index: number,
	token: string,
	label: string,
	context: ListContext,
	/**
	 * What removing this entry would destroy, or null where it would destroy
	 * nothing. There is no undo behind any of this — persist() writes the file
	 * on the spot — so the confirmation carries the whole load, and it belongs
	 * on the entry carrying a hand-written formula rather than on the one just
	 * added and still empty.
	 */
	describeRemoval?: () => string | null,
): void {
	row.addEventListener('dragover', (event) => {
		const from = context.drag.index;
		if (from === null) return;
		event.preventDefault();
		// The drop lands the row above the target on upward drags and below it
		// on downward ones; the indicator has to say so, not always point up.
		row.toggleClass('sheetsmith-entry-drop-below', index > from);
		row.toggleClass('sheetsmith-entry-drop', index < from);
	});
	row.addEventListener('dragleave', () => {
		row.removeClass('sheetsmith-entry-drop');
		row.removeClass('sheetsmith-entry-drop-below');
	});
	row.addEventListener('drop', (event) => {
		event.preventDefault();
		row.removeClass('sheetsmith-entry-drop');
		row.removeClass('sheetsmith-entry-drop-below');
		const from = context.drag.index;
		if (from === null || from === index) return;
		context.drag.index = null;
		moveItem(list, from, index, context);
	});

	if (Platform.isMobile) {
		// HTML5 drag-and-drop is inert on touch, and there is no keyboard —
		// reordering needs real buttons there.
		const up = row.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': `Move ${label} up` },
		});
		setIcon(up, 'arrow-up');
		up.dataset.sheetsmithFocus = `${token}-up`;
		up.addEventListener('click', () => moveItem(list, index, index - 1, context));

		const down = row.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': `Move ${label} down` },
		});
		setIcon(down, 'arrow-down');
		down.dataset.sheetsmithFocus = `${token}-down`;
		down.addEventListener('click', () => moveItem(list, index, index + 1, context));
	} else {
		const handle = row.createEl('button', {
			cls: 'clickable-icon sheetsmith-entry-handle',
			attr: {
				'aria-label': `Reorder ${label}: drag, or press the arrow keys`,
				draggable: 'true',
			},
		});
		setIcon(handle, 'grip-vertical');
		handle.dataset.sheetsmithFocus = `${token}-handle`;
		handle.addEventListener('dragstart', (event) => {
			context.drag.index = index;
			event.dataTransfer?.setData('text/plain', label);
		});
		handle.addEventListener('dragend', () => {
			context.drag.index = null;
		});
		handle.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				moveItem(list, index, index - 1, context);
			} else if (event.key === 'ArrowDown') {
				event.preventDefault();
				moveItem(list, index, index + 1, context);
			}
		});
	}

	const remove = row.createEl('button', {
		cls: 'clickable-icon',
		attr: { 'aria-label': `Remove ${label}` },
	});
	setIcon(remove, 'trash');
	remove.dataset.sheetsmithFocus = `${token}-remove`;
	remove.addEventListener('click', () => {
		const drop = () => {
			list.splice(index, 1);
			context.persist();
			context.redraw();
		};
		const cost = describeRemoval?.() ?? null;
		if (cost === null) {
			drop();
			return;
		}
		context.confirm(cost, 'Remove', drop);
	});
}

/**
 * A field in a list row, carrying the label the header gives it while there
 * is a header to give one. Narrow enough and the header goes; the label is
 * already in the DOM to take over, rather than the row becoming a stack of
 * unlabelled boxes.
 */
export function listField(row: HTMLElement, name: string): HTMLElement {
	const field = row.createDiv('sheetsmith-field');
	field.createSpan({ cls: 'sheetsmith-field-name', text: name });
	return field;
}

/**
 * Reserve the header's trailing tracks, one per control `addControls` will
 * render below it.
 *
 * The header and the rows share a grid template whose field tracks are `1fr`,
 * so a control track left empty in the header is a track that costs the rows
 * width the header keeps — and every heading after the first drifts out of
 * line with the input under it. Exactly as many spacers as there are buttons,
 * because reserving a fixed three would leave desktop with a track nothing
 * ever fills.
 *
 * Exported again for the modifier definitions list, which is a fourth header of
 * this shape and lives in its own module — the same reason `addControls` and
 * `listField` below it are: the four lists share the geometry and only this file
 * knows how many controls a row draws.
 */
export function addControlSpacers(header: HTMLElement): void {
	// Keep in step with addControls: a handle and a trash on desktop, up,
	// down, and trash where there is no drag and no keyboard.
	const controls = Platform.isMobile ? 3 : 2;
	for (let i = 0; i < controls; i++) {
		header.createSpan({ cls: 'sheetsmith-list-control-space' });
	}
}

interface RowEntry {
	label: string;
	key?: string;
	values?: Record<string, string>;
}

/**
 * The row list of a fixed-row table: one entry per row, plus a column for
 * each named expression the rows define.
 *
 * The value names come from the rows themselves rather than a separate config
 * key, so there is one place a name can be wrong instead of two. An empty
 * expression is kept rather than deleted: the name has to survive being
 * cleared in one row while it is still typed into the next.
 */
export function renderRowsEditor(
	listEl: HTMLElement,
	record: Record<string, unknown>,
	key: string,
	prefix: string,
	context: ListContext,
): void {
	if (!Array.isArray(record[key])) record[key] = [];
	const rows = record[key] as RowEntry[];
	// What a published row answers to, taken from the config rather than from
	// the focus prefix that happens to hold the same string today.
	const componentId = typeof record.id === 'string' ? record.id : '';
	listEl.addClass('sheetsmith-list');
	/** Bound once: every inline error here outlives a rebuild of the pane. */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.errors);

	// Union rather than the first row's keys: a name added to one row has to
	// show up as a column on all of them, empty, ready to be filled in.
	const names: string[] = [];
	for (const row of rows) {
		for (const name of Object.keys(row.values ?? {})) {
			if (!names.includes(name)) names.push(name);
		}
	}

	// One track per input, so the grid keeps its columns in step however
	// many row values the layout defines. Two of them are fixed: the row's
	// name and the key it publishes under.
	listEl.style.setProperty('--sheetsmith-list-fields', String(names.length + 2));

	// A long list must not bury the sections under it: eighteen skills put
	// eight hundred pixels between this field and the next one, and the add
	// control at the bottom of it is below all of them. The header rides
	// inside the same scroller so the two keep identical widths — a
	// scrollbar on the rows alone would pull them out of line.
	const scroller = listEl.createDiv('sheetsmith-list-scroll');

	if (rows.length === 0) {
		scroller.createDiv('sheetsmith-entry-empty', (el) =>
			el.setText('No rows yet.'),
		);
	} else {
		const columns = scroller.createDiv('sheetsmith-entry-columns');
		columns.createSpan({ text: 'Row name' });
		columns.createSpan({ text: 'Publishes as' });
		for (const name of names) {
			const heading = columns.createDiv('sheetsmith-list-heading');
			// The heading is an input, because renaming a value name is the
			// only way to fix a typo in one without retyping every row.
			const input = heading.createEl('input', {
				type: 'text',
				attr: { 'aria-label': `Row value name "${name}"` },
			});
			input.value = name;
			input.dataset.sheetsmithFocus = `${prefix}-value-${name}`;
			input.addEventListener('change', () => {
				const next = input.value.trim();
				// Rejection puts the stored name back. Leaving the typed text
				// in a field whose value was refused makes the field lie about
				// what the file holds the moment focus moves on.
				if (!isName(next)) {
					input.value = name;
					fieldError(
						input,
						`A row value needs a name a formula can read — letters, digits and underscores, not starting with a digit — so it was left as "${name}".`,
					);
					return;
				}
				if (next !== name && names.includes(next)) {
					input.value = name;
					fieldError(
						input,
						`"${next}" is already a row value, so this one was left as "${name}".`,
					);
					return;
				}
				fieldError(input, null);
				if (next === name) return;
				for (const row of rows) {
					// Own-property, not `in`: values comes out of the layout file
					// as an ordinary object, so `in` would report a row value
					// named for anything on Object.prototype as present on every
					// row.
					if (
						!row.values ||
						!Object.hasOwn(row.values, name)
					) {
						continue;
					}
					// Rebuild rather than assign and delete, so the columns
					// keep the order they were in.
					row.values = Object.fromEntries(
						Object.entries(row.values).map(([had, value]) => [
							had === name ? next : had,
							value,
						]),
					);
				}
				context.persist();
				context.redraw();
			});

			const remove = heading.createEl('button', {
				cls: 'clickable-icon',
				attr: { 'aria-label': `Remove row value "${name}"` },
			});
			setIcon(remove, 'trash');
			remove.dataset.sheetsmithFocus = `${prefix}-value-${name}-remove`;
			remove.addEventListener('click', () => {
				const drop = () => {
					for (const row of rows) {
						if (!row.values) continue;
						delete row.values[name];
						// An empty map is not a row value the layout defines.
						if (Object.keys(row.values).length === 0) delete row.values;
					}
					context.persist();
					context.redraw();
				};
				// One click here deletes an expression from every row at once,
				// so it asks — but only when there is something to lose. A name
				// nobody has filled in yet is just a column, and confirming its
				// removal would be a dialogue about nothing.
				const written = rows.filter(
					(row) => (row.values?.[name] ?? '') !== '',
				).length;
				if (written === 0) {
					drop();
					return;
				}
				context.confirm(
					`Remove the row value "${name}"? ${written} ${written === 1 ? 'row has' : 'rows have'} an expression for it, and removing it deletes ${written === 1 ? 'that expression' : 'those expressions'}. Any column formula reading "${name}" will stop resolving.`,
					'Remove row value',
					drop,
				);
			});
		}
		addControlSpacers(columns);
	}

	rows.forEach((row, index) => {
		const element = scroller.createDiv('sheetsmith-entry-row');

		const label = listField(element, 'Row name').createEl('input', {
			type: 'text',
			attr: { placeholder: 'Row name', 'aria-label': 'Row name' },
		});
		label.value = row.label ?? '';
		label.dataset.sheetsmithFocus = `${prefix}-row-${index}-label`;
		label.addEventListener('change', () => {
			const next = label.value.trim();
			if (next === '') {
				label.value = row.label;
				fieldError(
					label,
					`A row name is required, so it was left as "${row.label}".`,
				);
				return;
			}
			if (rows.some((other, i) => i !== index && other.label === next)) {
				label.value = row.label;
				fieldError(
					label,
					`"${next}" is already used by another row, so this one was left as "${row.label}".`,
				);
				return;
			}
			fieldError(label, null);
			// Renaming a row does not move character data: the note keeps its
			// old row under the old name, exactly as a renamed entry key
			// does (SPEC §10).
			row.label = next;
			context.persist();
			context.redraw();
		});

		// One word set across the heading, the placeholder and the announced
		// name, as the row name field beside it already has: a control whose
		// accessible name says a word that is nowhere on screen leaves voice
		// control nothing to match (UI.md §6).
		const publishes = listField(element, 'Publishes as');
		const key = publishes.createEl('input', {
			type: 'text',
			attr: {
				placeholder: 'Publishes as',
				'aria-label': `${row.label} publishes as`,
			},
		});
		key.value = row.key ?? '';
		key.dataset.sheetsmithFocus = `${prefix}-row-${index}-key`;
		key.addEventListener('change', () => {
			const next = key.value.trim();
			// Empty is the ordinary state: a row with no key publishes nothing.
			if (next === '') {
				delete row.key;
				fieldError(key, null);
				context.persist();
				return;
			}
			// Rejection puts the stored key back, on the same rule the row value
			// names follow: a field holding text the file does not have lies
			// about the layout the moment focus moves on. Most rows have no key
			// at all, so what it went back to has to be sayable either way.
			const kept = row.key === undefined ? 'left empty' : `left as "${row.key}"`;
			const restore = () => {
				key.value = row.key ?? '';
			};
			if (!isName(next)) {
				restore();
				fieldError(
					key,
					`A row key is a name a formula reads — letters, digits and underscores, not starting with a digit — so it was ${kept}.`,
				);
				return;
			}
			const taken = rows.find((other, i) => i !== index && other.key === next);
			if (taken !== undefined) {
				restore();
				fieldError(
					key,
					`"${next}" is already the key of the row "${taken.label}", so this one was ${kept}.`,
				);
				return;
			}
			fieldError(key, null);
			row.key = next;
			context.persist();
			// The composed name below is what changed; redraw so it says the
			// name the file now holds, as renaming the row beside it does.
			context.redraw();
		});

		// What the key actually publishes as, spelled out rather than left to
		// the reader to assemble from the footnote's pattern — and copyable,
		// because this is the string that gets retyped into the formula that
		// reads this row.
		//
		// Only where it composes to a name a formula can read. The handler
		// above refuses anything else, so this is about a key that arrived
		// from the file: `skills.passive perception` in copyable code type
		// says "paste me into a formula" about a string that cannot be one,
		// beside a card rendering the refusal.
		if (row.key !== undefined && isName(row.key)) {
			copyableName(publishes, `${componentId}.${row.key}`);
		}

		for (const name of names) {
			const input = listField(element, name).createEl('input', {
				type: 'text',
				attr: {
					placeholder: 'Expression',
					'aria-label': `${row.label} ${name}`,
				},
			});
			input.value = row.values?.[name] ?? '';
			input.dataset.sheetsmithFocus = `${prefix}-row-${index}-${name}`;
			input.addEventListener('change', () => {
				const values = row.values ?? {};
				values[name] = input.value.trim();
				row.values = values;
				context.persist();
			});
		}

		addControls(
			element,
			rows,
			index,
			`${prefix}-row-${row.label}`,
			row.label,
			context,
			() => {
				const written = Object.values(row.values ?? {}).filter(
					(value) => value.trim() !== '',
				).length;
				if (written === 0) return null;
				return `Remove the row "${row.label}"? It carries ${written} ${written === 1 ? 'expression' : 'expressions'}, and character notes keep their "${row.label}" data either way.`;
			},
		);
	});

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { cls: 'mod-cta', text: 'Add row' });
	add.addEventListener('click', () => {
		const taken = new Set(rows.map((row) => row.label));
		let label = 'New row';
		let counter = 2;
		while (taken.has(label)) label = `New row ${counter++}`;
		// The obvious next action is typing the name; put focus there.
		context.focusAfterRedraw(`${prefix}-row-${rows.length}-label`);
		// A new row starts with the same value names as its siblings, so the
		// column formulas that read them keep working down the whole list.
		const values: Record<string, string> = {};
		for (const name of names) values[name] = '';
		rows.push(names.length > 0 ? { label, values } : { label });
		context.persist();
		context.redraw();
	});

	const addValue = footer.createEl('button', { text: 'Add row value' });
	// The most conceptual control here, and the one that changes every row at
	// once. Adding a row is the common path and reads for itself; this needs
	// its one line of why, or it is a button nobody has a reason to press.
	listEl.createDiv('sheetsmith-entry-footnote', (el) =>
		el.setText(
			'A row value is an expression each row defines for itself, so one column formula can serve every row — "ability" as abilities.DEX on one row and abilities.WIS on the next.',
		),
	);
	addValue.addEventListener('click', () => {
		let name = 'ability';
		let counter = 2;
		while (names.includes(name)) name = `ability_${counter++}`;
		for (const row of rows) row.values = { ...(row.values ?? {}), [name]: '' };
		context.focusAfterRedraw(`${prefix}-value-${name}`);
		context.persist();
		context.redraw();
	});
}

interface ColumnEntry extends Record<string, unknown> {
	key: string;
	name?: string;
	hideHeading?: boolean;
	type?: string;
	formula?: string;
	min?: number;
	max?: number;
	maxSource?: string;
	levels?: string[];
	input?: string;
	signed?: boolean;
	secondary?: boolean;
	total?: boolean;
	publish?: boolean;
}

/**
 * What each column type is called in the editor, against the id stored in the
 * file. The ids are the data model and read like it — "select" as an option
 * inside a select says nothing, and "toggle" beside "level" hides that a
 * one-level column is exactly a toggle.
 *
 * A `Record` over the type rather than a list of its own, so a column type added
 * to the shared vocabulary does not compile until it has a word here. The order
 * comes from there too, because which type is first decides which one is left
 * out of the file.
 */
const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
	text: 'Text',
	number: 'Number',
	level: 'Level',
	toggle: 'Yes or no',
	computed: 'Computed',
	modifier: 'Modifier',
};

const LEVEL_INPUTS: readonly { id: string; label: string }[] = [
	{ id: 'cycle', label: 'Cycle on click' },
	{ id: 'select', label: 'Dropdown' },
];

/**
 * A control on the detail line, with a label above it. The grid above has a
 * header row to name its columns; this line has none, so a placeholder is the
 * only label a control would get — and a placeholder disappears at the first
 * keystroke, exactly when the label is still wanted.
 */
export function labelled(detail: HTMLElement, text: string): HTMLElement {
	const field = detail.createDiv('sheetsmith-detail-field');
	field.createSpan({ cls: 'sheetsmith-position-label', text });
	return field;
}

/**
 * An opt-in flag on a column's detail line. The label is the whole control: a
 * checkbox that names itself needs no word above it repeating the point at
 * twice the width.
 *
 * A fourth copy of this pattern is what earned it a function (PATTERNS §1);
 * every one of them writes `true` or deletes the key, so a column carrying its
 * default reads as a column that never set it.
 */
function checkField(
	detail: HTMLElement,
	text: string,
	target: Record<string, unknown>,
	key: string,
	context: ListContext,
	/**
	 * For the flag whose value changes which controls the other entries in the
	 * list may show: a focus token so the hand keeps its place across the
	 * rebuild, and the rebuild itself. Left off by a flag that affects only
	 * the entry carrying it, which is most of them.
	 */
	rebuild?: { token: string },
): void {
	const label = detail.createEl('label', { cls: 'sheetsmith-entry-check' });
	const input = label.createEl('input', { type: 'checkbox' });
	input.checked = target[key] === true;
	if (rebuild) input.dataset.sheetsmithFocus = rebuild.token;
	label.createSpan({ text });
	input.addEventListener('change', () => {
		if (input.checked) target[key] = true;
		else delete target[key];
		context.persist();
		if (!rebuild) return;
		context.focusAfterRedraw(rebuild.token);
		context.redraw();
	});
}

/** Optional string config: an empty field means the key is absent. */
export function setOptional(
	target: Record<string, unknown>,
	key: string,
	raw: string,
): void {
	const value = raw.trim();
	if (value === '') delete target[key];
	else target[key] = value;
}

/** The column list of a table: what each cell holds, and how it is computed. */
export function renderColumnsEditor(
	listEl: HTMLElement,
	record: Record<string, unknown>,
	key: string,
	prefix: string,
	context: ListContext,
	/**
	 * How many usable modifiers this layout declares, for the note under the
	 * list — and for the error where there are none.
	 *
	 * **A count rather than the names, and the names are what it used to be.** The
	 * note enumerated all of them inline, which grew with the layout and restated
	 * the Modifiers list one panel away — `docs/UI.md` §9's two answers to one
	 * question, and the uncapped list the bonus types field had already been
	 * corrected for. What this surface can say that the two sentences cannot is
	 * whether the picker will have anything in it, which is a number.
	 *
	 * A parameter rather than a member of `ListContext`, because it belongs to
	 * one of the three lists this module draws and the other two have no use for
	 * it — the same reason `entryColumns` arrives as an argument rather than
	 * being known here (PATTERNS §1).
	 */
	modifierCount = 0,
	/**
	 * What this field's own component offers, where it holds fewer than every
	 * column type or refuses a flag this form would otherwise show.
	 *
	 * A parameter rather than a member of `ListContext`, on `modifierCount`'s own
	 * argument: it belongs to one of the four lists this module draws and the
	 * other three have no use for it.
	 */
	offers?: ColumnOptionsSpec,
): void {
	if (!Array.isArray(record[key])) record[key] = [];
	const columns = record[key] as ColumnEntry[];
	/**
	 * The types this list offers, filtered against the vocabulary so a layout
	 * or a component naming a type that does not exist cannot empty the select.
	 */
	const offered = ((): readonly string[] => {
		const named = (offers?.types ?? []).filter((id) =>
			COLUMN_TYPES.some((known) => known === id),
		);
		return named.length === 0 ? COLUMN_TYPES : named;
	})();
	/**
	 * What a new column is created as, and what an unrecognised stored type
	 * falls back to on screen.
	 *
	 * The *shared* default where this list offers it, so a Table goes on storing
	 * a text column as no type at all; the first offered type otherwise, written
	 * out — which is what keeps `DEFAULT_COLUMN_TYPE` meaning one thing rather
	 * than one thing per component (`types.ts`, `columnOptions`).
	 */
	const fallback = offered.some((id) => id === DEFAULT_COLUMN_TYPE)
		? DEFAULT_COLUMN_TYPE
		: (offered[0] as string);
	/**
	 * What this list's own entries are called, and what holds one.
	 *
	 * Table's words by default, so nothing about this module knows which
	 * component it is drawing — the field says what its entries are called, the
	 * way it already says which types they may hold.
	 */
	const unit = offers?.unit ?? 'column';
	const holder = offers?.holder ?? 'row';
	const cell = offers?.cell ?? 'cell';
	/** The same word leading a sentence, since an accessible name is UI copy. */
	const Unit = unit.charAt(0).toUpperCase() + unit.slice(1);
	const heading = offers?.heading ?? 'Heading';
	// Three tracks, fixed by the column form itself: key, heading, and what
	// the column holds. The count lives in the stylesheet with them.
	listEl.addClass('sheetsmith-list');
	/** Bound once: every inline error here outlives a rebuild of the pane. */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.errors);
	listEl.addClass('sheetsmith-list-columns');

	const scroller = listEl.createDiv('sheetsmith-list-scroll');
	/** The column publishing per row, if one has taken it. */
	const publisher = columns.find((column) => column.publish === true);

	if (columns.length === 0) {
		scroller.createDiv('sheetsmith-entry-empty', (el) =>
			el.setText(`No ${unit}s yet.`),
		);
	} else {
		const headings = scroller.createDiv('sheetsmith-entry-columns');
		headings.createSpan({ text: 'Key' });
		headings.createSpan({ text: heading });
		headings.createSpan({ text: 'Holds' });
		addControlSpacers(headings);
	}

	columns.forEach((column, index) => {
		// A column is two lines — its row, and the options belonging to it —
		// and with every line equally spaced nothing said which pairs went
		// together. One surface per column; common region beats proximity,
		// and it costs a wrapper.
		const entry = scroller.createDiv('sheetsmith-list-entry');
		const element = entry.createDiv('sheetsmith-entry-row');

		const keyInput = listField(element, 'Key').createEl('input', {
			type: 'text',
			attr: { placeholder: 'Key', 'aria-label': `${Unit} key` },
		});
		keyInput.value = column.key ?? '';
		keyInput.dataset.sheetsmithFocus = `${prefix}-col-${index}-key`;
		keyInput.addEventListener('change', () => {
			const next = keyInput.value.trim();
			if (next === '') {
				keyInput.value = column.key;
				fieldError(
					keyInput,
					`A key is required, so it was left as "${column.key}".`,
				);
				return;
			}
			if (
				columns.some(
					(other, i) => i !== index && other.key?.toLowerCase() === next.toLowerCase(),
				)
			) {
				keyInput.value = column.key;
				fieldError(
					keyInput,
					`"${next}" is already used by another column, so this one was left as "${column.key}".`,
				);
				return;
			}
			fieldError(keyInput, null);
			column.key = next;
			context.persist();
			context.redraw();
		});

		const nameInput = listField(element, heading).createEl('input', {
			type: 'text',
			attr: {
				placeholder: heading,
				'aria-label': `${Unit} ${heading.toLowerCase()}`,
			},
		});
		nameInput.value = column.name ?? '';
		nameInput.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-name`;
		nameInput.addEventListener('change', () => {
			setOptional(column, 'name', nameInput.value);
			context.persist();
		});

		const type = listField(element, 'Holds').createEl('select', {
			attr: { 'aria-label': `What the ${unit} holds` },
		});
		for (const id of offered) {
			type.createEl('option', {
				value: id,
				text: COLUMN_TYPE_LABELS[id as ColumnType],
			});
		}
		type.value = offered.some((id) => id === column.type)
			? (column.type as string)
			: fallback;
		type.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-type`;
		type.addEventListener('change', () => {
			// The default is left out of the file, the same rule the select fields
			// in the component form follow — and it is the component's default,
			// not this list's, or a column would be stored as one type and read
			// as another.
			if (type.value === DEFAULT_COLUMN_TYPE) delete column.type;
			else column.type = type.value;
			context.persist();
			// The type decides which fields below are worth showing.
			context.flashAfterRedraw?.(`${prefix}-col-${column.key}-detail`);
			context.redraw();
		});

		addControls(
			element,
			columns,
			index,
			`${prefix}-col-${column.key}`,
			column.key,
			context,
			() => {
				if ((column.formula ?? '').trim() !== '') {
					return `Remove the column "${column.key}"? Its formula is lost. Character notes keep any "${column.key}" cells they already hold.`;
				}
				if (column.type === 'level' && (column.levels ?? []).length > 0) {
					return `Remove the column "${column.key}"? Its level names are lost. Character notes keep any "${column.key}" cells they already hold.`;
				}
				return null;
			},
		);

		/**
		 * What this column holds, with an unset type resolved through this
		 * list's own `fallback` rather than to a literal spelling of the shared
		 * default. The card asks the same question through `typeOf`, and the two
		 * have to agree about what an untyped column is, or the form offers a
		 * control on one set of columns while the component judges another.
		 *
		 * **`fallback` and not `DEFAULT_COLUMN_TYPE`**, which is the same
		 * agreement read through a field that offers fewer types: the select
		 * shows `fallback` for an unset type, so resolving it to the shared
		 * default here would draw **Number** in the select and a *text* column's
		 * detail line under it — the exact disagreement this comment forbids,
		 * one level in. Not reachable from a fixture, because a list that does
		 * not offer text writes its type out; reachable from a hand-edited
		 * layout, which is what these two lines exist for.
		 */
		const effective = column.type ?? fallback;

		// A line of its own under each column, holding the fields that only
		// make sense for that kind of column and then the ones every column
		// has. One detail element for both, so the two never disagree about
		// which line they belong on.
		const detail = entry.createDiv('sheetsmith-entry-detail');
		// Changing what a column holds rebuilds this line, through a redraw
		// that gives no sign anything happened. Mark it so the cause of the
		// change is visible where the change landed.
		detail.dataset.sheetsmithFlash = `${prefix}-col-${column.key}-detail`;
		if (effective === 'computed') {
			const formula = labelled(detail, 'Formula').createEl('input', {
				type: 'text',
				attr: {
					placeholder: 'Expression',
					'aria-label': `${column.key} formula`,
				},
			});
			formula.value = column.formula ?? '';
			formula.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-formula`;
			formula.addEventListener('change', () => {
				setOptional(column, 'formula', formula.value);
				context.persist();
			});

			checkField(detail, 'Signed', column, 'signed', context);
		} else if (effective === 'level') {
			// Assigned by the sample below, and called by the fields above it
			// that change what the sample shows. A level column with a
			// dropdown draws no rings and so has no sample to repaint.
			let drawSample = () => undefined as void;

			// Naming the levels settles how many there are, so the highest
			// level is only asked for while they have no names.
			const names = labelled(detail, 'Level names').createEl('input', {
				type: 'text',
				attr: {
					placeholder: 'From none upwards, comma separated',
					'aria-label': `${column.key} level names`,
				},
			});
			names.value = (column.levels ?? []).join(', ');
			names.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-levels`;
			names.addEventListener('change', () => {
				const parsed = names.value
					.split(',')
					.map((name) => name.trim())
					.filter((name) => name !== '');
				if (parsed.length === 0) {
					fieldError(names, null);
					delete column.levels;
					context.persist();
					context.redraw();
					return;
				}
				if (parsed.length < 2) {
					fieldError(
						names,
						'At least two names, starting with the one for none.',
					);
					return;
				}
				if (parsed.some((entry) => parseLevel(entry).name === '')) {
					// A mark stands for the level's name; it does not replace
					// it. Caught here as well as at render, because this is
					// where the author is looking at what they typed.
					fieldError(names, 'A level needs a name before its colon.');
					return;
				}
				fieldError(names, null);
				column.levels = parsed;
				context.persist();
				context.redraw();
			});

			if (column.levels === undefined) {
				const holder = detail.createDiv('sheetsmith-position-field');
				holder.createSpan({ cls: 'sheetsmith-position-label', text: 'Levels' });
				const input = holder.createEl('input', { type: 'number' });
				input.value = column.max === undefined ? '' : String(column.max);
				input.setAttribute('aria-label', `${column.key} highest level`);
				input.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-max`;
				input.addEventListener('change', () => {
					const raw = input.value.trim();
					if (raw === '') {
						fieldError(input, null);
						delete column.max;
						// Cleared is a level count too — one — and the sample
						// has to say so rather than keep showing the old ring.
						drawSample();
						context.persist();
						return;
					}
					const parsed = Number(raw);
					if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LEVELS) {
						// Bounded above because the sample draws a ring per
						// level: a mis-typed 1000000 must be a message, not a
						// hang.
						fieldError(input, `Whole number, 1 to ${MAX_LEVELS}.`);
						return;
					}
					fieldError(input, null);
					column.max = parsed;
					// A level more or less is a ring more or less. Repainted in
					// place rather than through a redraw, so the count can be
					// typed without the field being pulled out from under it.
					drawSample();
					context.persist();
				});
			}

			const inputStyle = labelled(detail, 'Control').createEl('select', {
				attr: { 'aria-label': `${column.key} control` },
			});
			for (const option of LEVEL_INPUTS) {
				inputStyle.createEl('option', { value: option.id, text: option.label });
			}
			inputStyle.value = column.input === 'select' ? 'select' : 'cycle';
			inputStyle.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-input`;
			inputStyle.addEventListener('change', () => {
				if (inputStyle.value === 'cycle') delete column.input;
				else column.input = inputStyle.value;
				context.persist();
				// The sample belongs to the ring, so it comes and goes with it.
				// The redraw takes the focus with it unless it is asked not to,
				// and the control just used is where the author still is.
				context.focusAfterRedraw(`${prefix}-col-${column.key}-input`);
				context.redraw();
			});

			if (column.input !== 'select') {
				// Every state the column can be in, drawn by the same painter
				// the sheet uses. The names say what the levels are; this says
				// what they look like, which is the half a name cannot carry —
				// and it is how ":" and ":★" explain themselves, at the moment
				// they are typed rather than in a sentence somewhere else.
				const strip = labelled(detail, 'Shows').createDiv(
					'sheetsmith-view sheetsmith-level-sample',
				);
				// A named level's ring is also the control for the one thing a
				// picture can be asked to change: whether it carries a mark at
				// all. The colon is exact and unguessable; a ring that answers
				// a press is neither, and the two write the same string — the
				// field updates as the rings are pressed, so nothing here is a
				// second place the truth is kept.
				if (column.levels === undefined) {
					// A mark lives inside a level's name, so a column with no
					// names has nowhere to keep one.
					strip.setAttribute(
						'title',
						'Name the levels to choose what each ring shows.',
					);
				}
				/**
				 * Marks of the author's own, turned off here. Pressing a ring
				 * off and on again must give back what it had rather than the
				 * initial: the press is a toggle, and a toggle that loses
				 * something on the way through is a trap. An initial needs no
				 * remembering — an unmarked name is where it comes from.
				 */
				const remembered = new Map<number, string>();
				const setLevel = (level: number, entry: string) => {
					const levels = [...(column.levels ?? [])];
					levels[level] = entry;
					column.levels = levels;
					// The field and the picture are two views of one string and
					// must never disagree, least of all while the author is
					// looking at both of them.
					names.value = levels.join(', ');
					fieldError(names, null);
					drawSample();
					context.persist();
				};
				drawSample = () => {
					strip.empty();
					for (let level = 0; level <= levelCount(column); level++) {
						const entry = column.levels?.[level];
						// None is an empty ring by definition, and an unnamed
						// level has nowhere to keep a mark. Neither is a
						// control, so neither pretends to be one — and neither
						// is announced, since the field beside them already
						// says what the levels are.
						if (entry === undefined || level === 0) {
							const ring = strip.createDiv(
								'sheetsmith-level-ring sheetsmith-level-sample-fixed',
							);
							ring.setAttribute('aria-hidden', 'true');
							paintLevelRing(ring, column, level, true);
							continue;
						}
						const { name, glyph } = parseLevel(entry);
						const ring = strip.createEl('button', {
							cls: 'sheetsmith-level-ring',
							type: 'button',
						});
						paintLevelRing(ring, column, level, true);
						const marked = glyph !== '';
						const says = marked
							? `${name} shows ${levelGlyph(column, level)}`
							: `${name} shows nothing`;
						ring.setAttribute('aria-label', says);
						// Two states, so ARIA has a word for it — and the word
						// is about this ring's mark, not about the level a
						// character is on, which is the sheet's business.
						ring.setAttribute('aria-pressed', String(marked));
						ring.setAttribute('title', says);
						ring.addEventListener('click', () => {
							if (marked) {
								if (glyph !== null) remembered.set(level, glyph);
								setLevel(level, `${name}:`);
								return;
							}
							const mark = remembered.get(level) ?? '';
							setLevel(level, mark === '' ? name : `${name}:${mark}`);
						});
					}
				};
				drawSample();
			}
		} else if (effective === 'number') {
			/**
			 * Whether this list offers a maximum each holder sets for itself, and
			 * whether this entry has taken it.
			 *
			 * Opt-in, unlike the flags below: a per-holder maximum is a second
			 * stored number inside one entry, and a component that does not draw a
			 * field for it, restore to it and clamp against it must not offer the
			 * choice (`types.ts`, `holderMax`).
			 */
			const perHolder = offers?.holderMax === true;
			const holderOwnsMax = perHolder && column.maxSource === HOLDER_MAX_SOURCE;
			for (const bound of ['min', 'max'] as const) {
				// **Maximum** is the entry's own number, so it is offered only while
				// the entry owns one. The declared value survives in the layout
				// untouched, which is what makes switching back restore the reading,
				// and the picker below says so.
				if (bound === 'max' && holderOwnsMax) continue;
				const box = detail.createDiv('sheetsmith-position-field');
				box.createSpan({
					cls: 'sheetsmith-position-label',
					text: bound === 'min' ? 'Minimum' : 'Maximum',
				});
				const input = box.createEl('input', { type: 'number' });
				input.value = column[bound] === undefined ? '' : String(column[bound]);
				input.setAttribute('aria-label', `${column.key} ${bound}`);
				input.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-${bound}`;
				input.addEventListener('change', () => {
					const raw = input.value.trim();
					if (raw === '') {
						fieldError(input, null);
						delete column[bound];
						context.persist();
						return;
					}
					const parsed = Number(raw);
					if (Number.isNaN(parsed)) {
						fieldError(input, 'This field needs a number.');
						return;
					}
					fieldError(input, null);
					column[bound] = parsed;
					context.persist();
				});
			}

			/*
			 * **Maximum from**, after the ceiling it governs rather than between the
			 * two numbers. Drawn between them it read as qualifying **Minimum**,
			 * which it does not: a floor is the layout's in both modes, and the only
			 * input it withholds is the one directly above it. Where the holder owns
			 * the maximum that input is gone and this is simply last.
			 */
			if (perHolder) {
				const source = labelled(detail, 'Maximum from').createEl('select', {
					attr: { 'aria-label': `${column.key} maximum from` },
				});
				/*
				 * **A `Record` over the shared union rather than a list of pairs**,
				 * which is §1's own instruction: a third source cannot be added to
				 * `column-types.ts` without a word here, and that is a guard nobody
				 * has to remember to run. The *ids* are the vocabulary's and the
				 * *words* are this field's, which is what makes the boundary claim
				 * on `ColumnOptionsSpec` true — a Table would read "The column" and
				 * "Each row" here and persist the same two ids.
				 */
				const words: Record<MaxSource, string> = {
					field: `The ${unit}`,
					record: `Each ${holder}`,
				};
				for (const id of MAX_SOURCES) {
					source.createEl('option', { value: id, text: words[id] });
				}
				source.value = holderOwnsMax ? HOLDER_MAX_SOURCE : DEFAULT_MAX_SOURCE;
				source.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-maxsource`;
				source.addEventListener('change', () => {
					// The effective default is written out as absence, the form's
					// standing rule — and the component reads a missing key as the
					// entry's own maximum, so the two agree.
					if (source.value === DEFAULT_MAX_SOURCE) delete column.maxSource;
					else column.maxSource = source.value;
					context.persist();
					// It decides whether **Maximum** is offered at all, so the redraw
					// takes a field away under the author's hand: flash the line, and
					// keep the hand on the control that did it.
					context.focusAfterRedraw(`${prefix}-col-${column.key}-maxsource`);
					context.flashAfterRedraw?.(`${prefix}-col-${column.key}-detail`);
					context.redraw();
				});
				// **Maximum** is the entry's own number, so it is offered only while
				// the entry owns one. The declared value survives in the layout
				// untouched, which is what makes switching back restore the reading.
			}
		} else if (effective === 'text') {
			checkField(detail, 'Secondary text', column, 'secondary', context);
		}

		// Offered beside the type, and only where there is something to add up:
		// a total is a published name, so it has to come from a column whose
		// cells are numbers before any formula runs.
		if (offers?.total !== false && TOTALLED_TYPES.has(effective)) {
			checkField(detail, 'Show a total', column, 'total', context);
		}

		// Beside the total, and offered on every type but text: a published row
		// answers to one value, and a text cell holding a link is two.
		//
		// And only while it can be taken. One card publishes one column, so
		// once a column has it the others stop offering it, exactly as a total
		// is not offered on a column with nothing to add up. The component
		// refuses a second either way, and refusing it here would mean an
		// error message on a checkbox — a surface this form has never had, and
		// one that lands inside the label, where pressing the message would
		// toggle the box it is complaining about. The footnote appears at the
		// same moment and says only one column can be published, so the
		// control does not vanish unexplained; unticking brings it back
		// everywhere, which is how the publication moves.
		if (
			offers?.publish !== false &&
			PUBLISHABLE_TYPES.has(effective) &&
			(publisher ?? column) === column
		) {
			checkField(detail, 'Publish per row', column, 'publish', context, {
				token: `${prefix}-col-${column.key}-publish`,
			});
		}

		/*
		 * **The two controls a modifier column used to need are gone**, and their
		 * going is what answers half of SPEC §13's question about
		 * `.sheetsmith-list-scroll`'s cap: **Modifier** and **Bonus type** put
		 * seven controls on a column's detail line, the line wrapped, and a
		 * four-column table overran the columns list's `20em`. An amount and a
		 * bonus type are the definition's now, so a column's detail line is one
		 * line again. The cap question stays open for the lists still inside the
		 * scroller.
		 */

		// Every column has this one — unless the component draws no heading for it
		// to hide, in which case it is a control that does nothing.
		if (offers?.hideHeading !== false) {
			checkField(detail, 'Hide heading', column, 'hideHeading', context);
		}
	});

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { text: `Add ${unit}` });
	// Once for the list rather than under every level column, and only where
	// there are rings to press: the sample says what the syntax does, and this
	// says that there is a syntax. A note nobody in this layout can use is
	// noise, and one pointing at rings a dropdown never draws is worse.
	if (
		columns.some(
			(column) => column.type === 'level' && column.input !== 'select',
		)
	) {
		listEl.createDiv('sheetsmith-entry-footnote', (el) =>
			el.setText(
				'Select a ring to turn its letter on or off. A level name can also say it in writing, after a colon: "Proficient:" is a fill with no letter on it, and anything written after the colon, such as ★, is drawn in place of the initial.',
			),
		);
	}
	// Once for the list, and only where a column is totalled: a total is the one
	// thing that turns a column key into a name the rest of the sheet reads, and
	// nothing else on this form would say so. The component refuses the
	// combination, and this is what keeps the author from meeting that refusal by
	// surprise.
	if (columns.some((column) => column.total === true)) {
		listEl.createDiv('sheetsmith-entry-footnote', (el) =>
			el.setText(
				'A total is published as "<component id>.<column key>", so a formula elsewhere on the sheet can read it. That makes a totalled column\'s key a name: letters, digits and underscores, where a column without a total may be headed anything.',
			),
		);
	}
	/*
	 * **Where a maximum has moved to the holder, say that the declared one is
	 * kept.** Switching the picker takes the **Maximum** input away with the
	 * author's own number in it, and a box holding a number that simply vanishes
	 * invites retyping it — while the number is in fact left in the layout,
	 * untouched, which is what makes switching back restore the previous reading
	 * exactly.
	 *
	 * A footnote rather than a disabled input, on this form's own rule: a control
	 * that does nothing is what the hide-heading flag was withdrawn for, and a
	 * greyed box saying "not used" is one. Once for the list, on the terms the
	 * total's and the publication's notes already set — and only where a column
	 * has actually taken it, so nobody reads about a state they are not in.
	 */
	if (columns.some((column) => column.maxSource === HOLDER_MAX_SOURCE)) {
		listEl.createDiv('sheetsmith-entry-footnote', (el) =>
			el.setText(
				`Each ${holder} types its own maximum on the sheet, beside the value. A maximum this ${unit} declares is kept in the layout and left unused, so switching back to the ${unit} restores it.`,
			),
		);
	}

	// The same rule as the total's note, and shown on the same terms: a
	// published column is the only thing that turns a row key into a name, and
	// the rows list above is where the key is typed. Nothing else on this form
	// would say where to go next.
	if (columns.some((column) => column.publish === true)) {
		listEl.createDiv('sheetsmith-entry-footnote', (el) =>
			el.setText(
				'A published column gives every row below a name of its own, "<component id>.<row key>", so a formula elsewhere on the sheet can read that row. Give each row a key in the rows list above. Only one column can be published.',
			),
		);
	}
	/*
	 * What a modifier cell holds, once a table has one. Refused nowhere, because a
	 * half-built table is the ordinary way a table is built and blanking the card
	 * mid-edit would be worse than a sentence — the same call the total's note
	 * makes, rather than the row key's refusal.
	 *
	 * **The empty-layout error is gone, and this is the one report this wave
	 * retires rather than adds.** It said a table with a modifier column on a layout
	 * declaring no definitions had cells nobody could fill, and that was true while
	 * a cell could only *name* one. A row can now type its own effect, so a layout
	 * with no named modifiers is an ordinary layout and the error would be false —
	 * the form's **Modifier** select simply offers the one option that types a new
	 * effect. The note below stays and covers both cases, counting whatever the
	 * layout happens to declare.
	 */
	const modifierColumns = columns.filter((column) => column.type === 'modifier');
	if (modifierColumns.length > 0) {
		/*
		 * **The count is what the retired error leaves behind**, which is why it stays
		 * rather than being dropped with it. A layout naming no modifiers used to be
		 * an error here; it is an ordinary layout now, and the fact an author still
		 * wants — how many the form's **Modifier** select is about to offer — is a
		 * number rather than a refusal. At zero it says the thing the error said,
		 * without claiming anything is wrong.
		 */
		listEl.createDiv('sheetsmith-entry-footnote', (el) =>
			el.setText(
				`A modifier ${cell} holds every modifier its ${holder} applies — each either one this layout names or one typed on the ${holder} — separated by a semicolon. This layout names ${modifierCount} of them, in its own settings, which the top row of the tree opens.`,
			),
		);
		/*
		 * **A second modifier column, reported and never refused.**
		 *
		 * One is enough now that a cell holds every modifier its row applies, so
		 * every column after the first is redundant — and the sheet keeps drawing
		 * both, keeps pushing from both, and refuses neither. Refusing would take
		 * the table and every modifier its rows apply down with it, which is §10's
		 * worst trade and Constraint 4's (`table.ts`'s `configError` says so where
		 * the refusal would have gone).
		 *
		 * **An error rather than a footnote, which is the one judgement here.** The
		 * footnote above says how a modifier cell works; this says the layout has a
		 * column too many and names the edit. A note nobody reads as a call to act
		 * would leave the two glyphs on a row exactly where this wave found them —
		 * and this is the only place the retired cap is enforced at all, as advice,
		 * which is the honest shape for a rule about how a layout is best written.
		 * It is now the only non-fatal error at this surface: the empty-layout case
		 * that set that precedent has been retired one paragraph up.
		 */
		for (const column of modifierColumns.slice(1)) {
			listEl.createDiv('sheetsmith-field-error', (el) =>
				el.setText(
					`"${column.key}" is a second modifier ${unit}. A modifier ${cell} holds every modifier its ${holder} applies, so one modifier ${unit} is enough. Move this ${unit}'s modifiers into the first and remove it.`,
				),
			);
		}
	}
	add.addEventListener('click', () => {
		const taken = new Set(columns.map((column) => column.key));
		let next = `New ${unit}`;
		let counter = 2;
		while (taken.has(next)) next = `New ${unit} ${counter++}`;
		context.focusAfterRedraw(`${prefix}-col-${columns.length}-key`);
		// The type is written out unless it *is* the shared default, so a list
		// that does not offer text never stores a column as "no type" — which
		// the component would read back as text and refuse.
		columns.push(
			fallback === DEFAULT_COLUMN_TYPE
				? { key: next }
				: { key: next, type: fallback },
		);
		context.persist();
		context.redraw();
	});
}

/**
 * One row of an 'entries' list, as the editor handles it: two content columns
 * the field spec names, plus the two a track's rows add.
 *
 * The index signature is what lets one editor serve two vocabularies — a Card
 * set's `key` and `name`, a Card's `value` and `label` — without either
 * spelling being written into this module. `count` and `sense` are declared
 * because only one caller has them and they are not both strings.
 */
type EntryRecord = {
	[property: string]: string | number | undefined;
	count?: string | number;
	sense?: string;
};

/**
 * Ordered two-column list with add, remove, and reorder controls: a
 * required name and an optional second string per entry.
 *
 * The entry table is plain divs on its own grid template, not
 * Setting rows — reusing Setting here meant deleting half its structure
 * and overriding theme-styled internals.
 *
 * **What the two columns are called is the caller's**, not this function's.
 * They were `key` and `name` under "Key" and "Full name" while Card set
 * was the only caller, which made the field unusable for a Card's options
 * — those are a `value` and a `label`, and a Card already has a `key`
 * (SPEC §13). So the vocabulary arrives as an argument, the way a gesture
 * module is handed the class names of the component driving it
 * (`docs/PATTERNS.md` §1), and the heading is the whole of what a column
 * is called: it is the header, the placeholder, the accessible name, and
 * the word the two field errors below name.
 *
 * **Required, with no default**, which is the half of that worked example
 * that is easy to miss: a default holding one caller's words leaves the
 * shared editor still naming a component, and picking between two callers'
 * words with a ternary on `withCount` is the editor asking which caller it
 * is. Every field of this kind declares its own, and `contract.test.ts`
 * holds them to it.
 *
 * `withCount` stays, and the line between it and the words is worth
 * stating: it says whether a row carries a length and a sense, which is a
 * fact about the *kind* this editor serves rather than about who called it.
 * The same goes for the empty line's noun — an entries list has entries and
 * a track's rows have rows.
 *
 * Focus ids use two schemes on purpose: inputs are keyed by index so
 * focus holds its position while typing, buttons by the entry's own name
 * so focus follows the item through a reorder.
 *
 * **Its reorder and remove controls are its own, not `addControls`**, and the
 * difference is what a screen reader says: this list's buttons are named "Move
 * up" and "Remove entry" where a row's and a column's name the item they act on,
 * and nothing here asks before removing. Sharing them would change three
 * accessible names, which is a decision about the interface rather than about
 * where the code lives — `docs/PATTERNS.md` §11 carries it as its own row.
 */
export function renderEntriesEditor(
	listEl: HTMLElement,
	record: Record<string, unknown>,
	key: string,
	prefix: string,
	/** Also edit a length and a sense per entry, which is what a track's rows add. */
	withCount: boolean,
	columnSpec: readonly [EntryColumnSpec, EntryColumnSpec],
	context: ListContext,
): void {
	// A third content column changes both grids — the header's and the
	// row's — and neither can be inferred from the markup, so the list
	// says so once and the stylesheet reads it.
	listEl.toggleClass('sheetsmith-entry-counted', withCount);
	const [primary, secondary] = columnSpec;
	// The geometry follows the vocabulary: a list whose first column holds
	// the word rather than an abbreviation says so once and the stylesheet
	// reads it, exactly as the counted list above does.
	listEl.toggleClass('sheetsmith-entry-wide-first', primary.wide === true);
	/*
	 * Held locally where the config has no list yet, and attached by the
	 * add control below. Materialising it here instead wrote `options: []`
	 * into a layout for every Card whose form was merely *opened*, which is
	 * the editor reformatting a file it was only asked to show — the same
	 * promise the undo round-trip in `layout-editor.test.ts` holds it to.
	 * Nothing before the first add needs the config to carry the key.
	 */
	const stored = record[key];
	const list = (Array.isArray(stored) ? stored : []) as EntryRecord[];
	/**
	 * The entry's own name: whatever its first column holds. It is the cell
	 * the row is identified by — the duplicate check, the drag payload and
	 * every button's focus token.
	 */
	const nameOf = (entry: EntryRecord) => String(entry[primary.key] ?? '');
	/*
	 * Bound once, as the two list editors above bind it, and for the reason
	 * the third argument exists: an inline error has to outlive a rebuild of
	 * the pane. It matters more here than anywhere, because a refusal below
	 * writes nothing and redraws nothing — so the typed text stands until some
	 * *other* control rebuilds the pane, and without the map that rebuild puts
	 * the stored name back and drops the message with it. Typed value gone,
	 * nothing said.
	 */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.errors);

	if (list.length === 0) {
		listEl.createDiv('sheetsmith-entry-empty', (el) =>
			el.setText(withCount ? 'No rows yet.' : 'No entries yet.'),
		);
	} else {
		const columns = listEl.createDiv('sheetsmith-entry-columns');
		columns.createSpan({ text: primary.heading });
		columns.createSpan({ text: secondary.heading });
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
			if (context.drag.index === null) return;
			event.preventDefault();
			// moveEntry lands the row above the target on upward
			// drags and below it on downward ones; the indicator must
			// say so, not always point above.
			row.toggleClass(
				'sheetsmith-entry-drop-below',
				index > context.drag.index,
			);
			row.toggleClass('sheetsmith-entry-drop', index < context.drag.index);
		});
		row.addEventListener('dragleave', () => {
			row.removeClass('sheetsmith-entry-drop');
			row.removeClass('sheetsmith-entry-drop-below');
		});
		row.addEventListener('drop', (event) => {
			event.preventDefault();
			row.removeClass('sheetsmith-entry-drop');
			row.removeClass('sheetsmith-entry-drop-below');
			if (context.drag.index === null || context.drag.index === index) return;
			moveItem(list, context.drag.index, index, context);
			context.drag.index = null;
		});

		const primaryInput = row.createEl('input', {
			type: 'text',
			// The heading, not "Attribute key": that word was the D&D term
			// for STR/DEX/CON, left behind by the rename that took it out of
			// the config (SPEC §13), and it survived in the one place only a
			// screen reader hears.
			attr: { placeholder: primary.heading, 'aria-label': primary.heading },
		});
		primaryInput.value = nameOf(entry);
		primaryInput.dataset.sheetsmithFocus = `attr-${prefix}-${index}-key`;
		primaryInput.addEventListener('change', () => {
			const next = primaryInput.value.trim();
			const stored = nameOf(entry);
			/*
			 * A refusal puts the stored name back, which is the rows editor's
			 * rule and its words: leaving the typed text in a field whose value
			 * was refused makes the field lie about what the file holds the
			 * moment focus moves on. It is also what makes the remembered
			 * message coherent — the copy a rebuild restores sits beside the
			 * stored name, so the message has to say that is what happened.
			 *
			 * The clause is dropped where there is nothing to name, which is an
			 * entry that reached the editor from a hand-edited file with its
			 * first column blank. `left as ""` describes nothing.
			 *
			 * "this one" for the duplicate and "it" for the blank, which is the
			 * siblings' distinction: the duplicate's sentence has already named
			 * the other entry, so "it" would not say which one was left.
			 */
			const refuse = (reason: string, subject: 'it' | 'this one') => {
				primaryInput.value = stored;
				fieldError(
					primaryInput,
					stored === ''
						? `${reason}.`
						: `${reason}, so ${subject} was left as "${stored}".`,
				);
			};
			if (next === '') {
				// Names the column, because "a key is required" over a
				// column headed Value points at nothing on screen. The
				// duplicate below names the *row* instead, and "entry" is
				// what this list calls a row whatever its columns are —
				// which is also what its add control and its empty state
				// say.
				refuse(`A ${primary.heading.toLowerCase()} is required`, 'it');
				return;
			}
			if (list.some((other, i) => i !== index && nameOf(other) === next)) {
				refuse(`"${next}" is already used by another entry`, 'this one');
				return;
			}
			fieldError(primaryInput, null);
			entry[primary.key] = next;
			context.persist();
			context.redraw();
		});

		const secondaryInput = row.createEl('input', {
			type: 'text',
			attr: {
				placeholder: secondary.heading,
				'aria-label': secondary.heading,
			},
		});
		secondaryInput.value = String(entry[secondary.key] ?? '');
		// Keyed by identity, unlike the first column: a commit here does not
		// redraw, so the only redraw this input lives through is a
		// reorder — where focus should follow the item.
		secondaryInput.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-name`;
		secondaryInput.addEventListener('change', () => {
			const next = secondaryInput.value.trim();
			if (next === '') {
				delete entry[secondary.key];
			} else {
				entry[secondary.key] = next;
			}
			context.persist();
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
					'aria-label': `${nameOf(entry)} segments`,
				},
			});
			countInput.value =
				entry.count === undefined ? '' : String(entry.count);
			countInput.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-count`;
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
				context.persist();
			});

			// Blank is the card's own sense, which is what a set whose
			// rows all mean the same thing leaves it as. Death saves are
			// why it is here: successes and failures are one shape pointed
			// two ways, and a card painting both alike says the wrong
			// thing about one of them.
			const senseInput = row.createEl('select', {
				attr: { 'aria-label': `${nameOf(entry)} sense` },
			});
			for (const [value, text] of [
				['', 'Same as card'],
				['progress', 'Progress'],
				['harm', 'Harm'],
			] as const) {
				senseInput.createEl('option', { value, text });
			}
			senseInput.value = entry.sense ?? '';
			senseInput.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-sense`;
			senseInput.addEventListener('change', () => {
				if (senseInput.value === '') {
					delete entry.sense;
				} else {
					entry.sense = senseInput.value;
				}
				context.persist();
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
			up.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-up`;
			up.addEventListener('click', () =>
				moveItem(list, index, index - 1, context),
			);
			const down = row.createEl('button', {
				cls: 'clickable-icon',
				attr: { 'aria-label': 'Move down' },
			});
			setIcon(down, 'arrow-down');
			down.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-down`;
			down.addEventListener('click', () =>
				moveItem(list, index, index + 1, context),
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
			handle.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-handle`;
			handle.addEventListener('dragstart', (event) => {
				context.drag.index = index;
				event.dataTransfer?.setData('text/plain', nameOf(entry));
			});
			handle.addEventListener('dragend', () => {
				context.drag.index = null;
			});
			handle.addEventListener('keydown', (event) => {
				if (event.key === 'ArrowUp') {
					event.preventDefault();
					moveItem(list, index, index - 1, context);
				} else if (event.key === 'ArrowDown') {
					event.preventDefault();
					moveItem(list, index, index + 1, context);
				}
			});
		}

		const remove = row.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Remove entry' },
		});
		setIcon(remove, 'trash');
		remove.dataset.sheetsmithFocus = `attr-${prefix}-${nameOf(entry)}-remove`;
		remove.addEventListener('click', () => {
			list.splice(index, 1);
			context.persist();
			context.redraw();
		});
	});

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { text: 'Add entry' });
	add.addEventListener('click', () => {
		const taken = new Set(list.map(nameOf));
		// Same shape as the row and column lists: a new entry is named for
		// what it is, capitalised, and focus lands on it to be renamed.
		let next = 'New entry';
		let counter = 2;
		while (taken.has(next)) next = `New entry ${counter++}`;
		// The obvious next action is typing the first column; put focus
		// there.
		context.focusAfterRedraw(`attr-${prefix}-${list.length}-key`);
		list.push({ [primary.key]: next });
		// Attaches the list on the first add, and is already a no-op on
		// every one after it.
		record[key] = list;
		context.persist();
		context.redraw();
	});
}
