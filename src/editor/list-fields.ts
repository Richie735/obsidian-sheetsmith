/*
 * List-shaped config fields for the form editor: a Table's rows and
 * columns.
 *
 * These are the fields a Setting row cannot express, because each entry is
 * several inputs plus reorder and remove controls. The attribute list in
 * layout-editor.ts is the same shape and predates this module; the two share
 * their chrome here rather than drifting apart.
 */

import { Notice, Platform, setIcon } from 'obsidian';
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
	PUBLISHABLE_TYPES,
	TOTALLED_TYPES,
} from '../components/column-types';
import { isName } from '../formula/expression';

/** What a list editor needs from the editor around it. */
export interface ListContext {
	/** Write the layout. */
	persist: () => void;
	/** Rebuild the settings tab. */
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
	/** Inline errors by focus token, so they outlive a rebuild of the tab. */
	errors: Map<string, string>;
	/** Index of the entry being dragged, shared so one list reads its own. */
	drag: { index: number | null };
}

/**
 * Inline validation: mark the input and show a message under the field, or
 * clear both. Invalid input is never silently swallowed. The message is keyed
 * to the input's focus id, because several inputs may share one control and
 * each needs its own error.
 */
export function showFieldError(
	/**
	 * Any form field on the tab. A select as readily as a text input: a reset
	 * binding's trigger is chosen from a dropdown and can still be wrong — two
	 * bindings on one trigger — and that has to report where it was chosen.
	 * Nothing below needs more than dataset, classes and a parent.
	 */
	input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
	message: string | null,
	/**
	 * Where the message is remembered across a rebuild of the tab. Without it
	 * an error survives only as long as the DOM that drew it, so correcting
	 * one field silently clears the message on another.
	 */
	errors?: Map<string, string>,
): void {
	const token = input.dataset.sheetsmithFocus;
	if (errors && token !== undefined) {
		if (message === null) errors.delete(token);
		else errors.set(token, message);
	}
	input.toggleClass('sheetsmith-input-invalid', message !== null);
	const control = input.parentElement;
	if (!control) return;
	const key = input.dataset.sheetsmithFocus ?? '';
	let existing: HTMLElement | null = null;
	for (const candidate of Array.from(
		control.querySelectorAll('.sheetsmith-field-error'),
	)) {
		if (
			candidate.instanceOf(HTMLElement) &&
			candidate.dataset.sheetsmithFor === key
		) {
			existing = candidate;
			break;
		}
	}
	if (message === null) {
		existing?.remove();
		return;
	}
	if (existing) {
		existing.setText(message);
		return;
	}
	control.createDiv('sheetsmith-field-error', (el) => {
		el.dataset.sheetsmithFor = key;
		el.setText(message);
	});
}

/**
 * A name in code type that copies itself when pressed.
 *
 * The component id wears one at the top of the form, on the argument that it
 * is the one thing about a component that cannot be discovered anywhere else
 * and is what gets retyped into every formula reading it. A published row's
 * name is the same thing one level down, so the two share the control rather
 * than growing a second spelling of it.
 */
export function copyableName(into: HTMLElement, text: string): HTMLElement {
	const code = into.createEl('code', { cls: 'sheetsmith-copyable', text });
	code.setAttribute('tabindex', '0');
	code.setAttribute('role', 'button');
	code.setAttribute('aria-label', `Copy "${text}" to the clipboard`);
	const copy = () => {
		void navigator.clipboard.writeText(text).then(
			() => new Notice(`Copied "${text}"`),
			() => new Notice('Could not copy to the clipboard.'),
		);
	};
	code.addEventListener('click', copy);
	code.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		copy();
	});
	return code;
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
 * Focus ids follow the same two schemes as the attribute list: inputs are
 * keyed by index so focus holds its position while typing, buttons by the
 * entry's own name so focus follows the item through a reorder.
 */
function addControls<T>(
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
		row.toggleClass('sheetsmith-attribute-drop-below', index > from);
		row.toggleClass('sheetsmith-attribute-drop', index < from);
	});
	row.addEventListener('dragleave', () => {
		row.removeClass('sheetsmith-attribute-drop');
		row.removeClass('sheetsmith-attribute-drop-below');
	});
	row.addEventListener('drop', (event) => {
		event.preventDefault();
		row.removeClass('sheetsmith-attribute-drop');
		row.removeClass('sheetsmith-attribute-drop-below');
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
			cls: 'clickable-icon sheetsmith-attribute-handle',
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
 * Reserve the header's trailing tracks, one per control `addControls` will
 * render below it.
 *
 * The header and the rows share a grid template whose field tracks are `1fr`,
 * so a control track left empty in the header is a track that costs the rows
 * width the header keeps — and every heading after the first drifts out of
 * line with the input under it. Exactly as many spacers as there are buttons,
 * because reserving a fixed three would leave desktop with a track nothing
 * ever fills.
 */
/**
 * A field in a list row, carrying the label the header gives it while there
 * is a header to give one. Narrow enough and the header goes; the label is
 * already in the DOM to take over, rather than the row becoming a stack of
 * unlabelled boxes.
 */
function listField(row: HTMLElement, name: string): HTMLElement {
	const field = row.createDiv('sheetsmith-field');
	field.createSpan({ cls: 'sheetsmith-field-name', text: name });
	return field;
}

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
	/** Bound once: every inline error here outlives a rebuild of the tab. */
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
		scroller.createDiv('sheetsmith-attribute-empty', (el) =>
			el.setText('No rows yet.'),
		);
	} else {
		const columns = scroller.createDiv('sheetsmith-attribute-columns');
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
					// row. Spelled the long way; the build targets ES2021.
					if (
						!row.values ||
						!Object.prototype.hasOwnProperty.call(row.values, name)
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
		const element = scroller.createDiv('sheetsmith-attribute-row');

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
			// old row under the old name, exactly as a renamed attribute key
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

	const footer = listEl.createDiv('sheetsmith-attribute-footer');
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
	listEl.createDiv('sheetsmith-attribute-footnote', (el) =>
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
function labelled(detail: HTMLElement, text: string): HTMLElement {
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
	const label = detail.createEl('label', { cls: 'sheetsmith-attribute-check' });
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
function setOptional(
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
): void {
	if (!Array.isArray(record[key])) record[key] = [];
	const columns = record[key] as ColumnEntry[];
	// Three tracks, fixed by the column form itself: key, heading, and what
	// the column holds. The count lives in the stylesheet with them.
	listEl.addClass('sheetsmith-list');
	/** Bound once: every inline error here outlives a rebuild of the tab. */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.errors);
	listEl.addClass('sheetsmith-list-columns');

	const scroller = listEl.createDiv('sheetsmith-list-scroll');
	/** The column publishing per row, if one has taken it. */
	const publisher = columns.find((column) => column.publish === true);

	if (columns.length === 0) {
		scroller.createDiv('sheetsmith-attribute-empty', (el) =>
			el.setText('No columns yet.'),
		);
	} else {
		const headings = scroller.createDiv('sheetsmith-attribute-columns');
		headings.createSpan({ text: 'Key' });
		headings.createSpan({ text: 'Heading' });
		headings.createSpan({ text: 'Holds' });
		addControlSpacers(headings);
	}

	columns.forEach((column, index) => {
		// A column is two lines — its row, and the options belonging to it —
		// and with every line equally spaced nothing said which pairs went
		// together. One surface per column; common region beats proximity,
		// and it costs a wrapper.
		const entry = scroller.createDiv('sheetsmith-list-entry');
		const element = entry.createDiv('sheetsmith-attribute-row');

		const keyInput = listField(element, 'Key').createEl('input', {
			type: 'text',
			attr: { placeholder: 'Key', 'aria-label': 'Column key' },
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

		const nameInput = listField(element, 'Heading').createEl('input', {
			type: 'text',
			attr: { placeholder: 'Heading', 'aria-label': 'Column heading' },
		});
		nameInput.value = column.name ?? '';
		nameInput.dataset.sheetsmithFocus = `${prefix}-col-${column.key}-name`;
		nameInput.addEventListener('change', () => {
			setOptional(column, 'name', nameInput.value);
			context.persist();
		});

		const type = listField(element, 'Holds').createEl('select', {
			attr: { 'aria-label': 'What the column holds' },
		});
		for (const id of COLUMN_TYPES) {
			type.createEl('option', { value: id, text: COLUMN_TYPE_LABELS[id] });
		}
		type.value = COLUMN_TYPES.some((id) => id === column.type)
			? (column.type as string)
			: DEFAULT_COLUMN_TYPE;
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
		 * What this column holds, with an unset type resolved to the shared
		 * default rather than to a literal spelling of it. The card asks the
		 * same question through `columnType`, and the two have to agree about
		 * what an untyped column is, or the form offers a control on one set
		 * of columns while the component judges another.
		 */
		const effective = column.type ?? DEFAULT_COLUMN_TYPE;

		// A line of its own under each column, holding the fields that only
		// make sense for that kind of column and then the ones every column
		// has. One detail element for both, so the two never disagree about
		// which line they belong on.
		const detail = entry.createDiv('sheetsmith-attribute-detail');
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
			for (const bound of ['min', 'max'] as const) {
				const holder = detail.createDiv('sheetsmith-position-field');
				holder.createSpan({
					cls: 'sheetsmith-position-label',
					text: bound === 'min' ? 'Minimum' : 'Maximum',
				});
				const input = holder.createEl('input', { type: 'number' });
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
		} else if (effective === 'text') {
			checkField(detail, 'Secondary text', column, 'secondary', context);
		}

		// Offered beside the type, and only where there is something to add up:
		// a total is a published name, so it has to come from a column whose
		// cells are numbers before any formula runs.
		if (TOTALLED_TYPES.has(effective)) {
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
		if (PUBLISHABLE_TYPES.has(effective) && (publisher ?? column) === column) {
			checkField(detail, 'Publish per row', column, 'publish', context, {
				token: `${prefix}-col-${column.key}-publish`,
			});
		}

		// Every column has this one.
		checkField(detail, 'Hide heading', column, 'hideHeading', context);
	});

	const footer = listEl.createDiv('sheetsmith-attribute-footer');
	const add = footer.createEl('button', { text: 'Add column' });
	// Once for the list rather than under every level column, and only where
	// there are rings to press: the sample says what the syntax does, and this
	// says that there is a syntax. A note nobody in this layout can use is
	// noise, and one pointing at rings a dropdown never draws is worse.
	if (
		columns.some(
			(column) => column.type === 'level' && column.input !== 'select',
		)
	) {
		listEl.createDiv('sheetsmith-attribute-footnote', (el) =>
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
		listEl.createDiv('sheetsmith-attribute-footnote', (el) =>
			el.setText(
				'A total is published as "<component id>.<column key>", so a formula elsewhere on the sheet can read it. That makes a totalled column\'s key a name: letters, digits and underscores, where a column without a total may be headed anything.',
			),
		);
	}
	// The same rule as the total's note, and shown on the same terms: a
	// published column is the only thing that turns a row key into a name, and
	// the rows list above is where the key is typed. Nothing else on this form
	// would say where to go next.
	if (columns.some((column) => column.publish === true)) {
		listEl.createDiv('sheetsmith-attribute-footnote', (el) =>
			el.setText(
				'A published column gives every row below a name of its own, "<component id>.<row key>", so a formula elsewhere on the sheet can read that row. Give each row a key in the rows list above. Only one column can be published.',
			),
		);
	}
	add.addEventListener('click', () => {
		const taken = new Set(columns.map((column) => column.key));
		let next = 'New column';
		let counter = 2;
		while (taken.has(next)) next = `New column ${counter++}`;
		context.focusAfterRedraw(`${prefix}-col-${columns.length}-key`);
		columns.push({ key: next });
		context.persist();
		context.redraw();
	});
}
