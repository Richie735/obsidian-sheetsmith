// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
	ListContext,
	renderColumnsEditor,
	renderEntriesEditor,
	renderRowsEditor,
} from './list-fields';
import { ColumnOptionsSpec, EntryColumnSpec } from '../types';
import { COLUMN_TYPES } from '../components/column-types';
import { MAX_LEVELS } from '../components/level-ring';
import { getComponent, listComponentTypes, paletteEntries } from '../components';
import { makeFieldResolver, NO_ENV } from '../formula/resolve';
import { Notice } from '../test/obsidian-stub';

/*
 * The layout editor's list fields, which had no coverage until the obsidian
 * stub made them reachable. These are the controls that author a layout, and
 * a layout is what every character sheet is built on.
 */

interface Recorded {
	persists: number;
	redraws: number;
	confirms: string[];
	/** Confirmations are taken, so a test can assert on either answer. */
	answer: boolean;
}

let recorded: Recorded;
let context: ListContext;

beforeEach(() => {
	recorded = { persists: 0, redraws: 0, confirms: [], answer: true };
	context = {
		persist: () => {
			recorded.persists++;
		},
		redraw: () => {
			recorded.redraws++;
		},
		focusAfterRedraw: () => undefined,
		confirm: (message, _cta, onConfirm) => {
			recorded.confirms.push(message);
			if (recorded.answer) onConfirm();
		},
		errors: new Map(),
		drag: { index: null },
	};
});

function host(): HTMLElement {
	const el = document.createElement('div');
	document.body.replaceChildren(el);
	return el;
}

/** Render the columns editor over a config, as the form does. */
function columnsEditor(
	record: Record<string, unknown>,
	/** How many modifiers this layout declares, which the note under the list counts. */
	modifierCount = 0,
	/** What the field's own component offers, where it holds fewer than all of it. */
	offers?: ColumnOptionsSpec,
): HTMLElement {
	const el = host();
	renderColumnsEditor(
		el,
		record,
		'columns',
		'skills',
		context,
		modifierCount,
		offers,
	);
	return el;
}

function rowsEditor(record: Record<string, unknown>): HTMLElement {
	const el = host();
	renderRowsEditor(el, record, 'rows', 'skills', context);
	return el;
}

/** A Card set's own columns: a narrow abbreviation, then the word for it. */
const KEY_AND_NAME: readonly [EntryColumnSpec, EntryColumnSpec] = [
	{ key: 'key', heading: 'Key' },
	{ key: 'name', heading: 'Full name' },
];

/**
 * Render the entries editor over a config, as the form does.
 *
 * The columns are passed in rather than read off a component, which is the
 * whole point of driving it from here: what the pane's cases assert is that a
 * component's declaration reaches the field, and what these assert is what the
 * field does with whatever declaration it is handed.
 */
function entriesEditor(
	record: Record<string, unknown>,
	options: {
		key?: string;
		withCount?: boolean;
		columns?: readonly [EntryColumnSpec, EntryColumnSpec];
		entryFlag?: { key: string; label: string };
	} = {},
): HTMLElement {
	const el = host();
	renderEntriesEditor(
		el,
		record,
		options.key ?? 'entries',
		'abilities',
		options.withCount ?? false,
		options.columns ?? KEY_AND_NAME,
		context,
		options.entryFlag,
	);
	return el;
}

/** A text input by its accessible name, which is its column's heading. */
function cell(el: HTMLElement, label: string, index = 0): HTMLInputElement {
	const found = el.querySelectorAll<HTMLInputElement>(
		`.sheetsmith-entry-row input[aria-label="${label}"]`,
	)[index];
	if (!found) throw new Error(`no "${label}" cell at ${index}`);
	return found;
}

/** Commit a field the way the editor hears it: on change, never per keystroke. */
function commit(input: HTMLInputElement | HTMLSelectElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('change'));
}

/**
 * The inline message under a field, as drawn. Read off the DOM rather than out
 * of `context.errors` because the two are separate claims: this says the reader
 * can see it now, and the map says it comes back after a rebuild. Both are
 * asserted below, and the entry list used to make only the first one true.
 */
function fieldError(el: HTMLElement): string | null {
	return el.querySelector('.sheetsmith-field-error')?.textContent ?? null;
}

function button(el: HTMLElement, text: string): HTMLButtonElement {
	const found = Array.from(el.querySelectorAll('button')).find(
		(candidate) => candidate.textContent === text,
	);
	if (!found) throw new Error(`no "${text}" button; found: ${labels(el)}`);
	return found;
}

/** Find a control by its accessible name, which may contain quotes. */
function byLabel(el: HTMLElement, label: string): HTMLButtonElement {
	const found = Array.from(el.querySelectorAll('button')).find(
		(candidate) => candidate.getAttribute('aria-label') === label,
	);
	if (!found) throw new Error(`no "${label}" control; found: ${labels(el)}`);
	return found;
}

function labels(el: HTMLElement): string {
	return Array.from(el.querySelectorAll('button'))
		.map((b) => b.textContent || b.getAttribute('aria-label') || '?')
		.join(', ');
}

describe('columns editor', () => {
	/** The table as it stands after its bonus column was removed. */
	const afterRemoval = () => ({
		columns: [
			{
				key: 'Training',
				type: 'level',
				levels: ['Untrained', 'Proficient', 'Expertise'],
				hideHeading: true,
			},
			{
				key: 'Total',
				type: 'computed',
				formula: 'ability + Training * prof + Bonus',
				signed: true,
			},
		],
	});

	it('offers an add control whatever the columns already are', () => {
		const record = afterRemoval();
		const el = columnsEditor(record);
		expect(() => button(el, 'Add column')).not.toThrow();
	});

	it('appends a column when the add control is used', () => {
		const record = afterRemoval();
		const el = columnsEditor(record);
		button(el, 'Add column').click();
		expect(record.columns.map((c) => c.key)).toEqual([
			'Training',
			'Total',
			'New column',
		]);
		expect(recorded.persists).toBe(1);
		expect(recorded.redraws).toBe(1);
	});

	it('renames a new column to the one that was removed', () => {
		const record = { columns: [{ key: 'Training' }, { key: 'New column' }] };
		const el = columnsEditor(record);
		const key = el.querySelectorAll('input[aria-label="Column key"]')[1];
		(key as HTMLInputElement).value = 'Bonus';
		key?.dispatchEvent(new Event('change'));
		expect(record.columns[1]?.key).toBe('Bonus');
	});

	it('refuses a key another column already uses, naming it', () => {
		const record = { columns: [{ key: 'Training' }, { key: 'New column' }] };
		const el = columnsEditor(record);
		const key = el.querySelectorAll<HTMLInputElement>(
			'input[aria-label="Column key"]',
		)[1] as HTMLInputElement;
		commit(key, 'Training');
		expect(record.columns[1]?.key).toBe('New column');
		// "this one" — not "it", which would read as if the column just
		// named, Training, was the one whose key was reverted.
		expect([...context.errors.values()][0]).toBe(
			'"Training" is already used by another column, so this one was left as "New column".',
		);
	});

	it('renders every column, whatever its type', () => {
		const record = {
			columns: [
				{ key: 'A', type: 'text' },
				{ key: 'B', type: 'number' },
				{ key: 'C', type: 'level' },
				{ key: 'D', type: 'toggle' },
				{ key: 'E', type: 'computed', formula: 'x' },
			],
		};
		const el = columnsEditor(record);
		expect(el.querySelectorAll('.sheetsmith-entry-row')).toHaveLength(5);
		expect(() => button(el, 'Add column')).not.toThrow();
	});

	it('gives each column one surface holding both its lines', () => {
		// Proximity alone said all four lines of two columns were peers: the
		// gap inside a column was the gap between columns.
		const record = afterRemoval();
		const el = columnsEditor(record);
		const entries = el.querySelectorAll('.sheetsmith-list-entry');
		expect(entries).toHaveLength(2);
		for (const entry of Array.from(entries)) {
			expect(entry.querySelectorAll('.sheetsmith-entry-row')).toHaveLength(1);
			expect(entry.querySelectorAll('.sheetsmith-entry-detail')).toHaveLength(
				1,
			);
		}
	});

	it('leaves no row or detail loose in the list', () => {
		// The separator at narrow widths keys on adjacency, and a loose detail
		// between two rows is exactly what stopped it matching before.
		const el = columnsEditor(afterRemoval());
		const scroll = el.querySelector('.sheetsmith-list-scroll') as HTMLElement;
		for (const child of Array.from(scroll.children)) {
			expect(
				child.classList.contains('sheetsmith-list-entry') ||
					child.classList.contains('sheetsmith-entry-columns'),
			).toBe(true);
		}
	});

	it('marks the fields a type change rebuilt', () => {
		const flashed: string[] = [];
		context.flashAfterRedraw = (token) => flashed.push(token);
		const record: { columns: { key: string; type?: string }[] } = {
			columns: [{ key: 'Bonus' }],
		};
		const el = columnsEditor(record);
		const type = el.querySelector('select') as HTMLSelectElement;
		type.value = 'computed';
		type.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.type).toBe('computed');
		// The token names the detail line of the column that changed.
		expect(flashed).toEqual(['skills-col-Bonus-detail']);
	});

	it('offers the gloss only on the columns it means anything to', () => {
		const record = {
			// Text is the default, so a column that never had a type set is one.
			columns: [{ key: 'Ability' }, { key: 'Bonus', type: 'number' }],
		};
		const el = columnsEditor(record);
		const details = el.querySelectorAll('.sheetsmith-entry-detail');
		const checks = Array.from(details).map((detail) =>
			Array.from(detail.querySelectorAll('.sheetsmith-entry-check')).map(
				(check) => check.textContent,
			),
		);
		// A total is offered on the number and not on the text, for the same
		// reason the gloss is offered the other way round: neither control means
		// anything on the other kind of column. Publishing a row is offered
		// beside the total and refused on a text column for its own reason: a
		// cell holding a link has no one value for a name to mean.
		//
		// **A column's detail line is one line again**, which is half of SPEC §13's
		// answer about `.sheetsmith-list-scroll`'s cap: the **Modifier** flag and
		// the **Bonus type** select that overran it are the definition's now.
		expect(checks).toEqual([
			['Secondary text', 'Hide heading'],
			['Show a total', 'Publish per row', 'Hide heading'],
		]);
	});

	it('leaves the gloss out of the file until it is asked for', () => {
		const record: { columns: { key: string; secondary?: boolean }[] } = {
			columns: [{ key: 'Ability' }],
		};
		const el = columnsEditor(record);
		const check = el.querySelector(
			'.sheetsmith-entry-detail input[type="checkbox"]',
		) as HTMLInputElement;
		check.checked = true;
		check.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.secondary).toBe(true);
		check.checked = false;
		check.dispatchEvent(new Event('change'));
		expect(record.columns[0]).not.toHaveProperty('secondary');
		expect(recorded.persists).toBe(2);
	});

	it('samples every state a level column can be in', () => {
		const record = {
			columns: [
				{
					key: 'Training',
					type: 'level',
					levels: ['Untrained', 'Proficient:', 'Expertise'],
				},
			],
		};
		const el = columnsEditor(record);
		const rings = Array.from(
			el.querySelectorAll<HTMLElement>(
				'.sheetsmith-level-sample .sheetsmith-level-ring',
			),
		);
		// None, and then one per level.
		expect(rings.map((ring) => ring.textContent)).toEqual(['', '', 'E']);
		// Painted by the sheet's own painter, ramp and all — which is the
		// point of the sample: an editor drawing its own idea of the control
		// would drift from the control.
		expect(rings.map((ring) => ring.style.getPropertyValue('--sheetsmith-level')))
			.toEqual(['', '0.5', '1']);
	});

	/** The sample's rings, re-queried: a press redraws them in place. */
	function sampleRings(el: HTMLElement): HTMLElement[] {
		return Array.from(
			el.querySelectorAll<HTMLElement>(
				'.sheetsmith-level-sample .sheetsmith-level-ring',
			),
		);
	}

	function sampleControls(el: HTMLElement): HTMLButtonElement[] {
		return Array.from(
			el.querySelectorAll<HTMLButtonElement>('.sheetsmith-level-sample button'),
		);
	}

	it('turns a level\'s letter off and on by pressing its ring', () => {
		const record = {
			columns: [
				{
					key: 'Training',
					type: 'level',
					levels: ['Untrained', 'Proficient', 'Expertise'],
				},
			],
		};
		const el = columnsEditor(record);
		const names = el.querySelector(
			'input[aria-label="Training level names"]',
		) as HTMLInputElement;
		// None is a picture, not a control: an empty ring is what it is.
		expect(sampleControls(el)).toHaveLength(2);

		sampleControls(el)[0]?.click();
		expect(record.columns[0]?.levels).toEqual([
			'Untrained',
			'Proficient:',
			'Expertise',
		]);
		// The field and the picture are two views of one string.
		expect(names.value).toBe('Untrained, Proficient:, Expertise');
		expect(sampleRings(el).map((ring) => ring.textContent)).toEqual(['', '', 'E']);
		// Repainted in place: a press is not a reason to rebuild the tab.
		expect(recorded.persists).toBe(1);
		expect(recorded.redraws).toBe(0);

		sampleControls(el)[0]?.click();
		expect(record.columns[0]?.levels).toEqual([
			'Untrained',
			'Proficient',
			'Expertise',
		]);
		expect(sampleRings(el).map((ring) => ring.textContent)).toEqual(['', 'P', 'E']);
	});

	it('gives back a mark of its own after the press that hid it', () => {
		const record = {
			columns: [
				{
					key: 'Training',
					type: 'level',
					levels: ['Untrained', 'Proficient:●', 'Expertise'],
				},
			],
		};
		const el = columnsEditor(record);
		sampleControls(el)[0]?.click();
		expect(record.columns[0]?.levels?.[1]).toBe('Proficient:');
		sampleControls(el)[0]?.click();
		// The initial would have been "P": a toggle that loses what it was
		// holding is a trap, so the press gives the mark back.
		expect(record.columns[0]?.levels?.[1]).toBe('Proficient:●');
		expect(sampleRings(el)[1]?.textContent).toBe('●');
	});

	it('offers no control where a level has nowhere to keep a mark', () => {
		// Unnamed levels: the mark lives inside the name, so there is none.
		const el = columnsEditor({
			columns: [{ key: 'Training', type: 'level', max: 2 }],
		});
		expect(sampleRings(el)).toHaveLength(3);
		expect(sampleControls(el)).toHaveLength(0);
		expect(
			el.querySelector('.sheetsmith-level-sample')?.getAttribute('title'),
		).toBe('Name the levels to choose what each ring shows.');
	});

	it('leaves the sample out where the column draws no rings', () => {
		const record = {
			columns: [
				{
					key: 'Training',
					type: 'level',
					input: 'select',
					levels: ['Untrained', 'Proficient', 'Expertise'],
				},
			],
		};
		const el = columnsEditor(record);
		expect(el.querySelector('.sheetsmith-level-sample')).toBeNull();
	});

	it('repaints the sample as the level count changes, without a redraw', () => {
		const record = { columns: [{ key: 'Training', type: 'level' }] };
		const el = columnsEditor(record);
		const max = el.querySelector(
			'input[aria-label="Training highest level"]',
		) as HTMLInputElement;
		max.value = '3';
		max.dispatchEvent(new Event('change'));
		expect(
			el.querySelectorAll('.sheetsmith-level-sample .sheetsmith-level-ring'),
		).toHaveLength(4);
		// In place, so the field being typed in is not pulled out from under
		// the author mid-edit.
		expect(recorded.redraws).toBe(0);
	});

	it('explains the level syntax only where a level column can use it', () => {
		const plain = columnsEditor({ columns: [{ key: 'Bonus', type: 'number' }] });
		expect(plain.querySelector('.sheetsmith-entry-footnote')).toBeNull();
		const levelled = columnsEditor({
			columns: [{ key: 'Training', type: 'level' }],
		});
		expect(
			levelled.querySelector('.sheetsmith-entry-footnote')?.textContent,
		).toContain('"Proficient:"');
	});

	it('says a totalled key is a name, only where a column is totalled', () => {
		// Ticking the total is what turns a column heading into something the rest
		// of the sheet reads, and nothing else on the form would say so — the
		// component refuses a key that is not a name, and this is what keeps the
		// author from meeting that refusal by surprise.
		const plain = columnsEditor({ columns: [{ key: 'Weight', type: 'number' }] });
		expect(plain.querySelector('.sheetsmith-entry-footnote')).toBeNull();
		const totalled = columnsEditor({
			columns: [{ key: 'Weight', type: 'number', total: true }],
		});
		expect(
			totalled.querySelector('.sheetsmith-entry-footnote')?.textContent,
		).toContain('letters, digits and underscores');
	});

	it('writes the publish flag, and leaves it out until it is asked for', () => {
		const record: { columns: { key: string; type: string; publish?: boolean }[] } =
			{ columns: [{ key: 'Total', type: 'computed' }] };
		const el = columnsEditor(record);
		const check = Array.from(
			el.querySelectorAll('.sheetsmith-entry-check'),
		).find((label) => label.textContent === 'Publish per row');
		const input = check?.querySelector('input') as HTMLInputElement;
		input.checked = true;
		input.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.publish).toBe(true);
		input.checked = false;
		input.dispatchEvent(new Event('change'));
		expect(record.columns[0]).not.toHaveProperty('publish');
	});

	it('offers the publish tick only while it is still there to take', () => {
		// One card publishes one column, and the component refuses a second by
		// rendering an error over the whole card. Ticking a second one from
		// this form was reachable, so the form stops offering it — the way a
		// total is not offered on a column with nothing to add up.
		const checks = (record: Record<string, unknown>) =>
			Array.from(
				columnsEditor(record).querySelectorAll('.sheetsmith-entry-check'),
			).map((check) => check.textContent);
		const free = {
			columns: [
				{ key: 'Bonus', type: 'number' },
				{ key: 'Total', type: 'computed' },
			],
		};
		expect(checks(free).filter((text) => text === 'Publish per row')).toHaveLength(
			2,
		);
		const taken = {
			columns: [
				{ key: 'Bonus', type: 'number' },
				{ key: 'Total', type: 'computed', publish: true },
			],
		};
		// Still on the column that has it, so unticking is how it moves.
		expect(checks(taken).filter((text) => text === 'Publish per row')).toHaveLength(
			1,
		);
	});

	it('rebuilds the list when a column takes the publication', () => {
		// Otherwise the tick disappears from the siblings only at the next
		// redraw, and until then a second one is still there to be pressed.
		const record: { columns: { key: string; type: string; publish?: boolean }[] } =
			{ columns: [{ key: 'Total', type: 'computed' }, { key: 'Bonus', type: 'number' }] };
		const el = columnsEditor(record);
		const check = Array.from(
			el.querySelectorAll('.sheetsmith-entry-check'),
		).find((label) => label.textContent === 'Publish per row');
		const input = check?.querySelector('input') as HTMLInputElement;
		input.checked = true;
		input.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.publish).toBe(true);
		expect(recorded.redraws).toBe(1);
	});

	it('says where a row key is typed, only where a column is published', () => {
		// Ticking publish is what gives the rows list a name to hand out, and
		// the field for it is in a different list on the same form.
		const plain = columnsEditor({ columns: [{ key: 'Total', type: 'computed' }] });
		expect(plain.querySelector('.sheetsmith-entry-footnote')).toBeNull();
		const publishing = columnsEditor({
			columns: [{ key: 'Total', type: 'computed', publish: true }],
		});
		expect(
			publishing.querySelector('.sheetsmith-entry-footnote')?.textContent,
		).toContain('Give each row a key in the rows list above');
	});

	it('does not point at rings a dropdown never draws', () => {
		// The note tells the author to select a ring. A column drawing none
		// has nothing for that sentence to mean.
		const el = columnsEditor({
			columns: [{ key: 'Training', type: 'level', input: 'select' }],
		});
		expect(el.querySelector('.sheetsmith-entry-footnote')).toBeNull();
	});

	it('repaints the sample when the level count is cleared', () => {
		const record: { columns: { key: string; type: string; max?: number }[] } = {
			columns: [{ key: 'Training', type: 'level', max: 3 }],
		};
		const el = columnsEditor(record);
		expect(sampleRings(el)).toHaveLength(4);
		const max = el.querySelector(
			'input[aria-label="Training highest level"]',
		) as HTMLInputElement;
		max.value = '';
		max.dispatchEvent(new Event('change'));
		// Cleared is a level count too: one level, so none and one ring.
		expect(record.columns[0]).not.toHaveProperty('max');
		expect(sampleRings(el)).toHaveLength(2);
	});

	it('refuses a level count it would have to draw a thousand rings for', () => {
		const record: { columns: { key: string; type: string; max?: number }[] } = {
			columns: [{ key: 'Training', type: 'level', max: 2 }],
		};
		const el = columnsEditor(record);
		const max = el.querySelector(
			'input[aria-label="Training highest level"]',
		) as HTMLInputElement;
		max.value = '1000000';
		max.dispatchEvent(new Event('change'));
		// Rejected, said so, and left holding what it had.
		expect(record.columns[0]?.max).toBe(2);
		expect(max.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(sampleRings(el)).toHaveLength(3);
	});

	it('asks before dropping a column carrying a formula', () => {
		const record = afterRemoval();
		const el = columnsEditor(record);
		const remove = el.querySelector(
			'[aria-label="Remove Total"]',
		) as HTMLButtonElement;
		remove.click();
		expect(recorded.confirms).toHaveLength(1);
		expect(record.columns.map((c) => c.key)).toEqual(['Training']);
	});

	it('drops an empty column without asking', () => {
		const record = { columns: [{ key: 'Training' }, { key: 'New column' }] };
		const el = columnsEditor(record);
		const remove = el.querySelector(
			'[aria-label="Remove New column"]',
		) as HTMLButtonElement;
		remove.click();
		expect(recorded.confirms).toEqual([]);
		expect(record.columns.map((c) => c.key)).toEqual(['Training']);
	});

	/*
	 * A stored value is validated as it renders, not only from `change` —
	 * `docs/features/field-render-validation.md`. Every case below reads a
	 * value the record already holds; none of them dispatches a `change`.
	 */
	it('marks an empty column key on first paint, with no change fired', () => {
		const el = columnsEditor({ columns: [{ key: '' }] });
		const key = el.querySelector(
			'input[aria-label="Column key"]',
		) as HTMLInputElement;
		expect(fieldError(key.parentElement as HTMLElement)).toBe(
			'A key is required.',
		);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('marks two columns sharing a key case-insensitively, both', () => {
		const el = columnsEditor({ columns: [{ key: 'Bonus' }, { key: 'bonus' }] });
		const keys = Array.from(
			el.querySelectorAll<HTMLInputElement>('input[aria-label="Column key"]'),
		);
		expect(keys).toHaveLength(2);
		for (const key of keys) {
			expect(fieldError(key.parentElement as HTMLElement)).toContain(
				'already used by another column',
			);
		}
	});

	it('marks a level column whose stored names are too few to be a scale', () => {
		const el = columnsEditor({
			columns: [{ key: 'Training', type: 'level', levels: ['Untrained'] }],
		});
		const names = el.querySelector(
			'input[aria-label="Training level names"]',
		) as HTMLInputElement;
		expect(fieldError(names.parentElement as HTMLElement)).toBe(
			'At least two names, starting with the one for none.',
		);
	});

	it('marks a stored level with no name before its colon', () => {
		const el = columnsEditor({
			columns: [
				{ key: 'Training', type: 'level', levels: ['Untrained', ':'] },
			],
		});
		const names = el.querySelector(
			'input[aria-label="Training level names"]',
		) as HTMLInputElement;
		expect(fieldError(names.parentElement as HTMLElement)).toBe(
			'A level needs a name before its colon.',
		);
	});

	it('marks a level column\'s stored highest-level count out of range', () => {
		const el = columnsEditor({
			columns: [{ key: 'Training', type: 'level', max: 1000000 }],
		});
		const max = el.querySelector(
			'input[aria-label="Training highest level"]',
		) as HTMLInputElement;
		expect(fieldError(max.parentElement as HTMLElement)).toBe(
			`Whole number, 1 to ${MAX_LEVELS}.`,
		);
	});

	it('marks a number column\'s stored min or max that is not a real number', () => {
		const el = columnsEditor({
			columns: [
				{
					key: 'Weight',
					type: 'number',
					min: Number.NaN,
					max: Number.POSITIVE_INFINITY,
				},
			],
		});
		const min = el.querySelector(
			'input[aria-label="Weight min"]',
		) as HTMLInputElement;
		const max = el.querySelector(
			'input[aria-label="Weight max"]',
		) as HTMLInputElement;
		expect(fieldError(min.parentElement as HTMLElement)).toBe(
			'This field needs a number.',
		);
		expect(fieldError(max.parentElement as HTMLElement)).toBe(
			'This field needs a number.',
		);
	});

	it('validates every broken column at once, without persisting or redrawing', () => {
		const record = {
			columns: [
				{ key: '' },
				{ key: 'Weight', type: 'number', min: Number.NaN },
			],
		};
		columnsEditor(record);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('clears a refusal once the reverted value renders clean on a later redraw', () => {
		// `restoreFieldErrors` replays whatever this map still holds after any
		// unrelated control rebuilds the pane — so a message that outlived the
		// text it was about would come back forever. Rendering the same,
		// now-reverted record again is that rebuild.
		const record = { columns: [{ key: 'Bonus' }, { key: 'Total' }] };
		const el = columnsEditor(record);
		const keys = el.querySelectorAll<HTMLInputElement>(
			'input[aria-label="Column key"]',
		);
		commit(keys[1] as HTMLInputElement, 'Bonus');
		expect(context.errors.size).toBe(1);
		columnsEditor(record);
		expect(context.errors.size).toBe(0);
	});
});

describe('rows editor', () => {
	const skills = () => ({
		rows: [
			{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
			{ label: 'Perception', values: { ability: 'abilities.WIS' } },
		],
	});

	it('offers both add controls', () => {
		const el = rowsEditor(skills());
		expect(() => button(el, 'Add row')).not.toThrow();
		expect(() => button(el, 'Add row value')).not.toThrow();
	});

	it('ends its header with the row\'s control tracks', () => {
		// Found while covering the entry list's copy of this line: commenting
		// this call out left the whole suite green, so the last heading could
		// slide out of line with the last input and nothing would say so.
		expect(
			rowsEditor(skills()).querySelectorAll('.sheetsmith-list-control-space'),
		).toHaveLength(2);
	});

	it('adds a row carrying the value names its siblings have', () => {
		const record = skills();
		const el = rowsEditor(record);
		button(el, 'Add row').click();
		expect(record.rows[2]).toEqual({ label: 'New row', values: { ability: '' } });
	});

	it('removes a row value from every row at once, once confirmed', () => {
		const record = skills();
		const el = rowsEditor(record);
		const remove = byLabel(el, 'Remove row value "ability"');
		remove.click();
		expect(recorded.confirms).toHaveLength(1);
		expect(record.rows.every((row) => row.values === undefined)).toBe(true);
	});

	it('keeps the rows when the confirmation is declined', () => {
		const record = skills();
		recorded.answer = false;
		const el = rowsEditor(record);
		const remove = byLabel(el, 'Remove row value "ability"');
		remove.click();
		expect(record.rows[0]?.values).toEqual({ ability: 'abilities.DEX' });
	});

	it('writes a row key, and clears it when the field is emptied', () => {
		const record = skills();
		const el = rowsEditor(record);
		const key = el.querySelector(
			'input[aria-label="Perception publishes as"]',
		) as HTMLInputElement;
		key.value = 'perception';
		key.dispatchEvent(new Event('change'));
		expect(record.rows[1]).toMatchObject({ key: 'perception' });
		key.value = '';
		key.dispatchEvent(new Event('change'));
		// Empty is the ordinary state: a row with no key publishes nothing, and
		// the layout should not carry one saying so.
		expect(record.rows[1]).not.toHaveProperty('key');
	});

	it('spells out what a keyed row publishes as, and copies it', () => {
		// The name a formula reads is what gets retyped elsewhere, so it is
		// composed here rather than left to the reader to assemble from the
		// footnote's pattern — the same argument the component id chip makes.
		const record = {
			id: 'skills',
			rows: [{ label: 'Acrobatics' }, { label: 'Perception', key: 'perception' }],
		};
		const chips = Array.from(
			rowsEditor(record).querySelectorAll('.sheetsmith-copyable'),
		);
		expect(chips.map((chip) => chip.textContent)).toEqual(['skills.perception']);
		expect(chips[0]?.getAttribute('aria-label')).toBe(
			'Copy "skills.perception" to the clipboard',
		);
	});

	it('composes no name for a key that arrived unusable', () => {
		// Typing one is refused, so this is a layout that came from the file.
		// The chip means "this is the name a formula reads", and there is no
		// such name here — the card is rendering the refusal instead.
		const record = {
			id: 'skills',
			rows: [{ label: 'Perception', key: 'passive perception' }],
		};
		expect(
			rowsEditor(record).querySelector('.sheetsmith-copyable'),
		).toBeNull();
	});

	it('puts the stored key back when one that is not a name is typed', () => {
		const record = skills();
		const el = rowsEditor(record);
		const key = el.querySelector(
			'input[aria-label="Perception publishes as"]',
		) as HTMLInputElement;
		key.value = 'passive perception';
		key.dispatchEvent(new Event('change'));
		expect(key.value).toBe('');
		expect(record.rows[1]).not.toHaveProperty('key');
		expect(context.errors.size).toBe(1);
		expect([...context.errors.values()][0]).toContain(
			'letters, digits and underscores',
		);
	});

	it('refuses a key another row already publishes under, naming it', () => {
		const record = {
			rows: [
				{ label: 'Acrobatics', key: 'acrobatics' },
				{ label: 'Perception' },
			],
		};
		const el = rowsEditor(record);
		const key = el.querySelector(
			'input[aria-label="Perception publishes as"]',
		) as HTMLInputElement;
		key.value = 'acrobatics';
		key.dispatchEvent(new Event('change'));
		expect(record.rows[1]).not.toHaveProperty('key');
		// "this one" — not "it", which would read as if the row just named,
		// Acrobatics, was the one whose key was reverted.
		expect([...context.errors.values()][0]).toBe(
			'"acrobatics" is already the key of the row "Acrobatics", so this one was left empty.',
		);
	});

	it('puts the stored name back when a rename is rejected', () => {
		const record = skills();
		const el = rowsEditor(record);
		const label = el.querySelector(
			'input[aria-label="Row name"]',
		) as HTMLInputElement;
		label.value = 'Perception';
		label.dispatchEvent(new Event('change'));
		// The field must not be left displaying a value the file does not have.
		expect(label.value).toBe('Acrobatics');
		expect(record.rows[0]?.label).toBe('Acrobatics');
		expect(context.errors.size).toBe(1);
		// "this one" — not "it", which would read as if Perception's own name
		// was the one reverted.
		expect([...context.errors.values()][0]).toBe(
			'"Perception" is already used by another row, so this one was left as "Acrobatics".',
		);
	});

	/*
	 * A stored value is validated as it renders, not only from `change` —
	 * `docs/features/field-render-validation.md`. Every case below reads a
	 * value the record already holds; none of them dispatches a `change`.
	 */
	it('marks a blank row name on first paint, with no change fired', () => {
		const record = { rows: [{ label: '' }, { label: 'Perception' }] };
		const el = rowsEditor(record);
		const label = el.querySelector(
			'input[aria-label="Row name"]',
		) as HTMLInputElement;
		expect(fieldError(label.parentElement as HTMLElement)).toBe(
			'A row name is required.',
		);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('marks two rows sharing a label, both', () => {
		const record = { rows: [{ label: 'Acrobatics' }, { label: 'Acrobatics' }] };
		const el = rowsEditor(record);
		const labels = Array.from(
			el.querySelectorAll<HTMLInputElement>('input[aria-label="Row name"]'),
		);
		expect(labels).toHaveLength(2);
		for (const label of labels) {
			expect(fieldError(label.parentElement as HTMLElement)).toBe(
				'"Acrobatics" is already used by another row.',
			);
		}
	});

	it('marks a stored row key that fails isName, with no change fired', () => {
		const record = {
			rows: [{ label: 'Perception', key: 'passive perception' }],
		};
		const el = rowsEditor(record);
		const key = el.querySelector(
			'input[aria-label="Perception publishes as"]',
		) as HTMLInputElement;
		expect(fieldError(key.parentElement as HTMLElement)).toContain(
			'letters, digits and underscores',
		);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('marks two rows sharing a key, both', () => {
		const record = {
			rows: [
				{ label: 'Acrobatics', key: 'skill' },
				{ label: 'Perception', key: 'skill' },
			],
		};
		const el = rowsEditor(record);
		const keys = Array.from(
			el.querySelectorAll<HTMLInputElement>('input[aria-label$="publishes as"]'),
		);
		expect(keys).toHaveLength(2);
		expect(
			fieldError(keys[0]?.parentElement as HTMLElement),
		).toBe('"skill" is already the key of the row "Perception".');
		expect(
			fieldError(keys[1]?.parentElement as HTMLElement),
		).toBe('"skill" is already the key of the row "Acrobatics".');
	});

	it('marks a row value name that fails isName', () => {
		const record = {
			rows: [{ label: 'Acrobatics', values: { 'not a name': 'abilities.DEX' } }],
		};
		const el = rowsEditor(record);
		const header = el.querySelector(
			`input[aria-label='Row value name "not a name"']`,
		) as HTMLInputElement;
		expect(fieldError(header.parentElement as HTMLElement)).toContain(
			'letters, digits and underscores',
		);
	});

	it('validates every broken row at once, without persisting or redrawing', () => {
		const record = {
			rows: [
				{ label: '', key: 'bad key', values: { 'not a name': '' } },
				{ label: '', key: 'bad key' },
			],
		};
		rowsEditor(record);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('clears a refusal once the reverted value renders clean on a later redraw', () => {
		// `restoreFieldErrors` replays whatever this map still holds after any
		// unrelated control rebuilds the pane — so a message that outlived the
		// text it was about would come back forever. Rendering the same,
		// now-reverted record again is that rebuild.
		const record = skills();
		const el = rowsEditor(record);
		const label = el.querySelector(
			'input[aria-label="Row name"]',
		) as HTMLInputElement;
		label.value = 'Perception';
		label.dispatchEvent(new Event('change'));
		expect(context.errors.size).toBe(1);
		rowsEditor(record);
		expect(context.errors.size).toBe(0);
	});
});

/*
 * A `'rows'` field declaring `rowFlag` — a Roster's `dividerAfter`, but the
 * mechanism itself knows nothing about Roster: it asks the field which
 * property to read and what to call it, exactly as `statsField` does for a
 * row's stat. Driven directly, on the entry list's own precedent above.
 */
describe('a rows field declaring rowFlag', () => {
	const FLAG = { key: 'dividerAfter', label: 'Divider after' };

	function flaggedRows(record: Record<string, unknown>): HTMLElement {
		const el = host();
		renderRowsEditor(el, record, 'rows', 'skills', context, undefined, FLAG);
		return el;
	}

	it('draws one checkbox per row, through the shared checkbox factory', () => {
		const record = {
			rows: [{ label: 'Saving throw' }, { label: 'Concentration' }],
		};
		const el = flaggedRows(record);
		const boxes = el.querySelectorAll('.sheetsmith-entry-check input[type="checkbox"]');
		expect(boxes).toHaveLength(2);
	});

	it('reads the row\'s own flag as checked, unset as unchecked', () => {
		const record = {
			rows: [
				{ label: 'Saving throw', dividerAfter: true },
				{ label: 'Concentration' },
			],
		};
		const el = flaggedRows(record);
		const boxes = Array.from(
			el.querySelectorAll<HTMLInputElement>(
				'.sheetsmith-entry-check input[type="checkbox"]',
			),
		);
		expect(boxes.map((box) => box.checked)).toEqual([true, false]);
	});

	it('sets the flag on check and clears the key entirely on uncheck', () => {
		const record = {
			rows: [{ label: 'Saving throw' }],
		};
		const el = flaggedRows(record);
		const box = el.querySelector<HTMLInputElement>(
			'.sheetsmith-entry-check input[type="checkbox"]',
		);
		box?.click();
		expect(record.rows[0]).toMatchObject({ dividerAfter: true });
		box?.click();
		// Absent rather than `false`: a value matching the flag's own default
		// writes nothing to a hand-edited, shared layout file (PATTERNS §8).
		expect(record.rows[0]).not.toHaveProperty('dividerAfter');
	});

	it('reserves the header a track, with no heading text of its own', () => {
		// `checkField` already names the flag beside every box it draws, so a
		// heading above the column would repeat it — but the track still has
		// to exist or the header drifts out of line with the row beneath it.
		const plain = rowsEditor({ rows: [{ label: 'Saving throw' }] }).querySelector(
			'.sheetsmith-entry-columns',
		);
		const flagged = flaggedRows({ rows: [{ label: 'Saving throw' }] }).querySelector(
			'.sheetsmith-entry-columns',
		);
		expect(flagged?.textContent).not.toContain('Divider after');
		expect(flagged?.children).toHaveLength((plain?.children.length ?? 0) + 1);
	});

	it('draws no checkbox at all where the field declares no rowFlag', () => {
		const record = { rows: [{ label: 'Saving throw' }] };
		const el = rowsEditor(record);
		expect(el.querySelector('.sheetsmith-entry-check')).toBeNull();
	});
});

/*
 * The entry list, driven directly.
 *
 * Its two siblings above have been reachable from here since this file existed;
 * this one arrived in `list-fields.ts` later and left its cases behind in
 * `layout-editor.test.ts`, which drives it through a whole pane — a vault, a
 * layout file and a settle per assertion. Those cases stay there, because what
 * they assert needs the pane: that a *component's* declared columns reach the
 * field, and that an edit lands in the file's bytes. What is below is the half
 * that has no business costing a vault, and the half that was missing here: the
 * loop this file exists for was green over a broken entry list (PATTERNS §10).
 */
describe('entries editor', () => {
	const abilities = () => ({
		entries: [{ key: 'STR', name: 'Strength' }, { key: 'DEX' }],
	});

	/** Spelled once: two cases assert it, and a copy change should find one. */
	const TAKEN = '"STR" is already used by another entry, so this one was left as "DEX".';

	it('calls its rows entries, and a counted list\'s rows rows', () => {
		// The noun is the field's, not the caller's: an entries list has
		// entries and a track's rows have rows, and the empty state is the one
		// place a reader meets the word before there is anything to look at.
		expect(entriesEditor({}).textContent).toContain('No entries yet.');
		expect(entriesEditor({}, { withCount: true }).textContent).toContain(
			'No rows yet.',
		);
	});

	it('heads the two columns it was handed, and nothing else', () => {
		const headings = Array.from(
			entriesEditor(abilities()).querySelectorAll(
				'.sheetsmith-entry-columns > span',
			),
		).map((el) => el.textContent);
		expect(headings).toEqual(['Key', 'Full name']);
	});

	it('heads a counted list with the three it owns, plus the control tracks', () => {
		// Length, Segments and Sense are the field's own words, unlike the two
		// above, because they are what `withCount` *is*. The trailing spacers
		// are not decoration: without them the last heading stops lining up
		// with the last input, which is invisible in a two-column list and
		// wrong in this one.
		const columns = entriesEditor(abilities(), {
			withCount: true,
		}).querySelector('.sheetsmith-entry-columns');
		expect(
			Array.from(columns?.querySelectorAll(':scope > span') ?? [])
				.map((el) => el.textContent)
				.filter((text) => text !== ''),
		).toEqual(['Key', 'Full name', 'Length', 'Segments', 'Sense']);
		expect(
			columns?.querySelectorAll('.sheetsmith-list-control-space'),
		).toHaveLength(2);
	});

	it('says in a class which shape the list is, for the stylesheet', () => {
		// Neither is inferable from the markup, and nothing else reports their
		// loss: the list still renders and still round-trips while a word is
		// clipped in a track sized for an abbreviation (PATTERNS §10).
		const plain = entriesEditor(abilities());
		expect(plain.classList.contains('sheetsmith-entry-counted')).toBe(false);
		expect(plain.classList.contains('sheetsmith-entry-wide-first')).toBe(false);

		const wide = entriesEditor(abilities(), {
			withCount: true,
			columns: [
				{ key: 'value', heading: 'Value', wide: true },
				{ key: 'label', heading: 'Label' },
			],
		});
		expect(wide.classList.contains('sheetsmith-entry-counted')).toBe(true);
		expect(wide.classList.contains('sheetsmith-entry-wide-first')).toBe(true);
	});

	it('writes each cell under the property name its column declared', () => {
		// The exposure PATTERNS §11 carries as a row: the two cells write
		// whatever `key` says, and a component reading a different word finds
		// nothing while the list stays self-consistent. Asserted on a spelling
		// no component uses, so it can only pass by reading the spec.
		const record: Record<string, unknown> = {};
		const el = entriesEditor(record, {
			columns: [
				{ key: 'value', heading: 'Value', wide: true },
				{ key: 'label', heading: 'Label' },
			],
		});
		button(el, 'Add entry').click();
		expect(record.entries).toEqual([{ value: 'New entry' }]);

		const again = entriesEditor(record, {
			columns: [
				{ key: 'value', heading: 'Value', wide: true },
				{ key: 'label', heading: 'Label' },
			],
		});
		commit(cell(again, 'Value'), 'Elf');
		commit(cell(again, 'Label'), 'Elven');
		expect(record.entries).toEqual([{ value: 'Elf', label: 'Elven' }]);
	});

	it('names the column when the first cell is cleared, and writes nothing', () => {
		const record = abilities();
		const el = entriesEditor(record);
		commit(cell(el, 'Key'), '');
		expect(fieldError(el)).toBe('A key is required, so it was left as "STR".');
		expect(record.entries[0]?.key).toBe('STR');
		expect(recorded.persists).toBe(0);
		// The field must not be left displaying a value the file does not have,
		// which is the rows editor's rule and now this one's.
		expect(cell(el, 'Key').value).toBe('STR');
	});

	it('names the row when the first cell would duplicate another', () => {
		// The refusal above names the column and this one names the row, which
		// is the entry the author has to go and look at.
		const record = abilities();
		const el = entriesEditor(record);
		commit(cell(el, 'Key', 1), 'STR');
		expect(fieldError(el)).toBe(TAKEN);
		expect(record.entries[1]).toEqual({ key: 'DEX' });
		expect(cell(el, 'Key', 1).value).toBe('DEX');
	});

	it('remembers a refusal for the rebuild some other control causes', () => {
		/*
		 * The failure this closes: a refusal writes nothing and redraws
		 * nothing, so before the map the message lived only as long as the DOM
		 * that drew it. Edit anything that *does* redraw — the trigger list
		 * will do — and the pane comes back with the stored name in the field
		 * and no message anywhere. The typed value reverted, silently.
		 *
		 * The pane's `restoreFieldErrors` is what replays it, and it can only
		 * replay what reached this map, keyed by the field's focus token.
		 */
		const record = abilities();
		const el = entriesEditor(record);
		commit(cell(el, 'Key', 1), 'STR');
		expect([...context.errors]).toEqual([['attr-abilities-1-key', TAKEN]]);

		// And a correction takes it back out, or the message outlives the
		// mistake and the pane replays it forever.
		commit(cell(el, 'Key', 1), 'CON');
		expect(context.errors.size).toBe(0);
	});

	it('leaves the "left as" clause off when there is nothing to name', () => {
		// An entry whose first column is blank can only have come from a
		// hand-edited file, and `left as ""` describes nothing.
		const record = { entries: [{ name: 'Strength' }] };
		const el = entriesEditor(record);
		commit(cell(el, 'Key'), '');
		expect(fieldError(el)).toBe('A key is required.');
	});

	it('drops the second column\'s property when its cell is emptied', () => {
		// Empty is the ordinary state, so the layout should not carry a key
		// saying so — the same rule the rows editor's publish key follows.
		const record = abilities();
		const el = entriesEditor(record);
		commit(cell(el, 'Full name'), '');
		expect(record.entries[0]).not.toHaveProperty('name');
		expect(recorded.persists).toBe(1);
	});

	it('stores a bare segment count as a number, and an expression as typed', () => {
		// So a layout file reads `count: 5` rather than `count: "5"`, while a
		// caster's slots stay the formula they were written as.
		const record: Record<string, unknown> = { entries: [{ key: 'STR' }] };
		const el = entriesEditor(record, { withCount: true });
		commit(cell(el, 'STR segments'), '5');
		expect(record.entries).toEqual([{ key: 'STR', count: 5 }]);
		commit(cell(el, 'STR segments'), 'level + 1');
		expect(record.entries).toEqual([{ key: 'STR', count: 'level + 1' }]);
		commit(cell(el, 'STR segments'), '');
		expect(record.entries).toEqual([{ key: 'STR' }]);
	});

	it('leaves the sense off a row that means what its card means', () => {
		const record: Record<string, unknown> = { entries: [{ key: 'STR' }] };
		const el = entriesEditor(record, { withCount: true });
		const sense = el.querySelector(
			'select[aria-label="STR sense"]',
		) as HTMLSelectElement;
		commit(sense, 'harm');
		expect(record.entries).toEqual([{ key: 'STR', sense: 'harm' }]);
		commit(sense, '');
		expect(record.entries).toEqual([{ key: 'STR' }]);
	});

	it('defaults a row\'s length to Formula, and switching to Character reserves Segments\' column without clearing it', () => {
		const record: Record<string, unknown> = {
			entries: [{ key: 'STR', count: 5 }],
		};
		const el = entriesEditor(record, { withCount: true });
		const source = el.querySelector(
			'select[aria-label="STR length source"]',
		) as HTMLSelectElement;
		expect(source.value).toBe('');
		const segments = cell(el, 'STR segments');
		const reserved = () =>
			segments.classList.contains('sheetsmith-detail-field-reserved');
		expect(reserved()).toBe(false);
		commit(source, 'character');
		expect(record.entries).toEqual([
			{ key: 'STR', count: 5, maxSource: 'character' },
		]);
		// Visibility rather than removal: the row is a grid of fixed tracks,
		// and taking Segments out of grid placement entirely would slide
		// Sense one column left into the track it just vacated.
		expect(reserved()).toBe(true);
		// Left exactly as it was rather than cleared, Pool's own rule for a
		// formula a mode switch stops using — switching back finds it there.
		expect(segments.value).toBe('5');
		commit(source, '');
		expect(record.entries).toEqual([{ key: 'STR', count: 5 }]);
		expect(reserved()).toBe(false);
	});

	it('reorders on the arrow keys, and names its controls without the entry', () => {
		/*
		 * The accessible names are the reason this list's controls are its own
		 * rather than `addControls`, and the reason PATTERNS §11 carries that
		 * duplication as a row: a row's and a column's controls name the item
		 * they act on, and these deliberately do not. With both copies driven
		 * from this file, the two namings are now side by side — which is what
		 * a decision on them would have to change.
		 */
		const record = abilities();
		const el = entriesEditor(record);
		const handle = byLabel(el, 'Reorder: drag, or press the arrow keys');
		handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		expect(record.entries.map((entry) => entry.key)).toEqual(['DEX', 'STR']);
	});

	it('removes an entry without asking, unlike a row or a column', () => {
		// The other half of the same difference: `addControls` confirms before
		// destroying something hand-written and this list never does.
		const record = abilities();
		const el = entriesEditor(record);
		byLabel(el, 'Remove entry').click();
		expect(record.entries).toEqual([{ key: 'DEX' }]);
		expect(recorded.confirms).toEqual([]);
	});

	it('attaches the list on the first add and not on merely being shown', () => {
		/*
		 * Materialising the array on render wrote `entries: []` into a layout
		 * for every component whose form was only *opened*, which is the editor
		 * reformatting a file it was asked to show. The pane's own case holds
		 * the half that needs the file — the empty list reaches disk on the
		 * next write, whatever that write was for — and this holds the half
		 * that does not: the key is absent until an add puts it there.
		 */
		const record: Record<string, unknown> = {};
		const el = entriesEditor(record);
		expect(Object.keys(record)).toEqual([]);
		button(el, 'Add entry').click();
		expect(record.entries).toEqual([{ key: 'New entry' }]);
	});

	it('numbers a second new entry rather than duplicating the first', () => {
		const record: Record<string, unknown> = { entries: [{ key: 'New entry' }] };
		button(entriesEditor(record), 'Add entry').click();
		expect(record.entries).toEqual([
			{ key: 'New entry' },
			{ key: 'New entry 2' },
		]);
	});

	/*
	 * A stored value is validated as it renders, not only from `change` —
	 * `docs/features/field-render-validation.md`. Every case below reads a
	 * value the record already holds; none of them dispatches a `change`.
	 */
	it('marks a blank primary field on first paint, with no change fired', () => {
		const record = { entries: [{ key: '' }, { key: 'DEX' }] };
		const el = entriesEditor(record);
		expect(fieldError(cell(el, 'Key').parentElement as HTMLElement)).toBe(
			'A key is required.',
		);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('marks two entries sharing a primary value, both', () => {
		const record = { entries: [{ key: 'STR' }, { key: 'STR' }] };
		const el = entriesEditor(record);
		expect(
			fieldError(cell(el, 'Key', 0).parentElement as HTMLElement),
		).toBe('"STR" is already used by another entry.');
		expect(
			fieldError(cell(el, 'Key', 1).parentElement as HTMLElement),
		).toBe('"STR" is already used by another entry.');
	});

	it('validates every broken entry at once, without persisting or redrawing', () => {
		const record = { entries: [{ key: '' }, { key: 'STR' }, { key: 'STR' }] };
		entriesEditor(record);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('clears a refusal once the reverted value renders clean on a later redraw', () => {
		const record = abilities();
		const el = entriesEditor(record);
		commit(cell(el, 'Key', 1), 'STR');
		expect(context.errors.size).toBe(1);
		entriesEditor(record);
		expect(context.errors.size).toBe(0);
	});
});

/*
 * An 'entries' field declaring `entryFlag` — a Passport field's `list`
 * (`docs/features/passport-field-lists.md`) — drawn exactly as `renderRowsEditor`
 * already draws `rowFlag` above: the mechanism asks the field which property to
 * read and what to call it, and knows nothing about Passport.
 */
describe('an entries field declaring entryFlag', () => {
	const FLAG = { key: 'list', label: 'Several values' };
	const twoEntries = () => ({
		entries: [{ key: 'STR', name: 'Strength' }, { key: 'DEX' }],
	});

	it('draws one checkbox per entry, through the shared checkbox factory', () => {
		const record = twoEntries();
		const el = entriesEditor(record, { entryFlag: FLAG });
		const boxes = el.querySelectorAll(
			'.sheetsmith-entry-check input[type="checkbox"]',
		);
		expect(boxes).toHaveLength(2);
	});

	it('reads the entry\'s own flag as checked, unset as unchecked', () => {
		const record = {
			entries: [
				{ key: 'class', name: 'Class', list: true },
				{ key: 'species', name: 'Species' },
			],
		};
		const el = entriesEditor(record, { entryFlag: FLAG });
		const boxes = Array.from(
			el.querySelectorAll<HTMLInputElement>(
				'.sheetsmith-entry-check input[type="checkbox"]',
			),
		);
		expect(boxes.map((box) => box.checked)).toEqual([true, false]);
	});

	it('sets the flag on check and clears the key entirely on uncheck', () => {
		const record = { entries: [{ key: 'class', name: 'Class' }] };
		const el = entriesEditor(record, { entryFlag: FLAG });
		const box = el.querySelector<HTMLInputElement>(
			'.sheetsmith-entry-check input[type="checkbox"]',
		);
		box?.click();
		expect(record.entries[0]).toMatchObject({ list: true });
		box?.click();
		// Absent rather than `false`: a value matching the flag's own default
		// writes nothing to a hand-edited, shared layout file (PATTERNS §8).
		expect(record.entries[0]).not.toHaveProperty('list');
	});

	it('reserves the header a track, with no heading text of its own', () => {
		// One more than the counted list's own header gets for the same reason
		// (`docs/UI.md` §9's alignment argument): the flag's own track, plus the
		// two control-button spacers a flagged header now carries so its last
		// label does not drift off the row's buttons — spacers the *unflagged*
		// two-column header omits, since nothing after its `1fr` track needs
		// aligning there.
		const plain = entriesEditor(twoEntries()).querySelector(
			'.sheetsmith-entry-columns',
		);
		const flagged = entriesEditor(twoEntries(), {
			entryFlag: FLAG,
		}).querySelector('.sheetsmith-entry-columns');
		expect(flagged?.textContent).not.toContain('Several values');
		expect(flagged?.children).toHaveLength((plain?.children.length ?? 0) + 3);
		expect(
			flagged?.querySelectorAll('.sheetsmith-list-control-space'),
		).toHaveLength(2);
	});

	it('draws no checkbox at all where the field declares no entryFlag', () => {
		const el = entriesEditor(twoEntries());
		expect(el.querySelector('.sheetsmith-entry-check')).toBeNull();
	});

	it('says in a class that the list carries a flag, for the stylesheet', () => {
		const plain = entriesEditor(twoEntries());
		expect(plain.classList.contains('sheetsmith-entry-flagged')).toBe(false);
		const flagged = entriesEditor(twoEntries(), { entryFlag: FLAG });
		expect(flagged.classList.contains('sheetsmith-entry-flagged')).toBe(true);
	});
});

/*
 * The two cells item modifiers add to a column (SPEC §5).
 */
describe('the columns editor over a component that holds fewer types', () => {
	/*
	 * The field is Table's shape and Record set is the second component to take
	 * it. Without a declaration of what a component offers, the select listed
	 * every type and the add control stored a column as "no type" — which the
	 * *shared* default reads back as `text`, which a Record set refuses. So an
	 * author met a configuration error on the first field they created.
	 */
	const OFFERS = {
		types: ['number', 'toggle', 'level', 'computed', 'modifier'],
		total: false,
		publish: false,
		hideHeading: false,
	} as const;

	function typeSelect(el: HTMLElement): HTMLSelectElement {
		const found = el.querySelector<HTMLSelectElement>(
			"select[aria-label='What the column holds']",
		);
		if (!found) throw new Error('no type select');
		return found;
	}

	const labels = (el: HTMLElement): string[] =>
		Array.from(el.querySelectorAll('label')).map(
			(one) => one.textContent ?? '',
		);

	it('offers every type where the field declares none, as a table does', () => {
		const el = columnsEditor({ columns: [{ key: 'Qty', type: 'number' }] });
		const options = Array.from(typeSelect(el).options).map((one) => one.value);
		expect(options).toEqual([...COLUMN_TYPES]);
	});

	it('offers only the types the field declares', () => {
		const el = columnsEditor(
			{ columns: [{ key: 'Uses', type: 'number' }] },
			0,
			OFFERS,
		);
		const options = Array.from(typeSelect(el).options).map((one) => one.value);
		expect(options).toEqual([...OFFERS.types]);
		expect(options).not.toContain('text');
	});

	it('writes the type out on a new column where text is not offered', () => {
		/*
		 * **The half that makes the fix a fix.** Left absent, a new column is
		 * stored as "no type" and every reader takes that to be the shared default,
		 * which is the one type this component refuses. Giving the component its own
		 * default instead is what `column-types.ts`'s header refuses: the editor's
		 * omission and the component's fallback are keyed on the same constant, and
		 * two answers to "which is first" misreads stored data.
		 */
		const record: { columns: { key: string; type?: string }[] } = { columns: [] };
		const el = columnsEditor(record, 0, OFFERS);
		button(el, 'Add column').click();
		expect(record.columns).toEqual([{ key: 'New column', type: 'number' }]);

		// And a Table still stores its default as absence, so no layout moves.
		const table: { columns: { key: string; type?: string }[] } = { columns: [] };
		button(columnsEditor(table), 'Add column').click();
		expect(table.columns).toEqual([{ key: 'New column' }]);
	});

	describe('with Record set, Table and Roster as they are registered', () => {
		/*
		 * `docs/features/free-text-group-key.md`. A Record set now offers text, last,
		 * as the field its list is grouped by. The derived `fallback` is then the
		 * shared default, so an Add handler testing it would store every new field
		 * as "no type", read back as text and refused on the first field an author
		 * created. The handler writes the first *offered* type instead, and these
		 * drive it over each component's real declaration rather than a copy.
		 */
		const offersOf = (type: string, key: string): ColumnOptionsSpec => {
			const found = getComponent(type)?.configFields.find(
				(one) => one.key === key,
			)?.columnOptions;
			if (found === undefined) throw new Error(`${type} offers no ${key}`);
			return found;
		};
		const added = (offers: ColumnOptionsSpec | undefined, name: string) => {
			const record: { columns: Record<string, unknown>[] } = { columns: [] };
			button(columnsEditor(record, 0, offers), `Add ${name}`).click();
			return record.columns;
		};

		it('stores a Record set\'s new field as a number, not as no type', () => {
			expect(added(offersOf('record-set', 'fields'), 'field')).toEqual([
				{ key: 'New field', type: 'number' },
			]);
		});

		it('stores a Table\'s new column as absence, exactly as it did', () => {
			// Table declares no `columnOptions`: every type, text first.
			expect(added(undefined, 'column')).toEqual([{ key: 'New column' }]);
		});

		it('stores a Roster\'s new column as it did', () => {
			const roster = offersOf('roster', 'columns');
			// Whatever Roster offers first, written out unless it is the default.
			const first = roster.types[0];
			expect(added(roster, 'column')).toEqual(
				first === 'text'
					? [{ key: 'New column' }]
					: [{ key: 'New column', type: first }],
			);
			expect(first).toBe('number');
		});

		it('lists Text last for a Record set and shows it for a field with no type', () => {
			const offers = offersOf('record-set', 'fields');
			const el = columnsEditor({ columns: [{ key: 'Class' }] }, 0, offers);
			const select = el.querySelector<HTMLSelectElement>(
				"select[aria-label='What the field holds']",
			) as HTMLSelectElement;
			const values = Array.from(select.options).map((one) => one.value);
			expect(values.at(-1)).toBe('text');
			expect(values.indexOf('number')).toBe(0);
			expect(select.value).toBe('text');
			expect(select.selectedOptions[0]?.textContent).toBe('Text');
		});

		it('writes choosing Text as absence, and keeps a hand-written "text"', () => {
			const offers = offersOf('record-set', 'fields');
			const record: { columns: Record<string, unknown>[] } = {
				columns: [
					{ key: 'A', type: 'number' },
					{ key: 'B', type: 'text' },
				],
			};
			const el = columnsEditor(record, 0, offers);
			const [first, second] = Array.from(
				el.querySelectorAll<HTMLSelectElement>(
					"select[aria-label='What the field holds']",
				),
			) as [HTMLSelectElement, HTMLSelectElement];
			first.value = 'text';
			first.dispatchEvent(new Event('change'));
			expect(record.columns[0]).toEqual({ key: 'A' });
			// Untouched: a hand-written spelling is carried, not normalised.
			expect(record.columns[1]).toEqual({ key: 'B', type: 'text' });
			expect(second.value).toBe('text');
		});

		it('offers a text field the line a text field has and no number bounds', () => {
			const offers = offersOf('record-set', 'fields');
			const el = columnsEditor({ columns: [{ key: 'Class' }] }, 0, offers);
			const spans = Array.from(
				el.querySelectorAll('.sheetsmith-position-label'),
			).map((one) => one.textContent);
			expect(spans).not.toContain('Minimum');
			expect(spans).not.toContain('Maximum');
			expect(labels(el)).not.toContain('Show a total');
		});
	});

	it('offers neither a total nor publication where the field refuses them', () => {
		const shown = labels(
			columnsEditor({ columns: [{ key: 'Uses', type: 'number' }] }),
		);
		expect(shown).toContain('Show a total');
		expect(shown).toContain('Publish per row');
		const narrowed = labels(
			columnsEditor({ columns: [{ key: 'Uses', type: 'number' }] }, 0, OFFERS),
		);
		expect(narrowed).not.toContain('Show a total');
		expect(narrowed).not.toContain('Publish per row');
		// And the third flag on the same declaration, which goes for its own
		// reason: the component draws no heading for one to hide. The case below
		// drives that half on its own.
		expect(narrowed).not.toContain('Hide heading');
	});

	it('draws the detail line of the type the select is showing', () => {
		/*
		 * The select shows `fallback` for an unset type, so resolving the detail
		 * line against the *shared* default instead drew **Number** over a text
		 * column's controls. Reachable from a hand-edited layout, which is what
		 * an unset type on a list that does not offer text can only come from.
		 */
		const el = columnsEditor({ columns: [{ key: 'Uses' }] }, 0, OFFERS);
		expect(typeSelect(el).value).toBe('number');
		// A number column's bounds, not a text column's `Secondary text` — the
		// bounds are position fields rather than labelled checkboxes, so they are
		// read off their own spans.
		const spans = Array.from(
			el.querySelectorAll('.sheetsmith-position-label'),
		).map((one) => one.textContent);
		expect(spans).toEqual(['Minimum', 'Maximum']);
		expect(labels(el)).not.toContain('Secondary text');
	});

	it('speaks the field\'s own vocabulary rather than a table\'s', () => {
		/*
		 * The one panel where an author reads about their Record set described it
		 * as cells and rows, which is the vocabulary the model question freed the
		 * word "record" to end (SPEC §2). The field says what its entries are
		 * called, so nothing here knows which component it is drawing.
		 */
		const words = {
			...OFFERS,
			unit: 'field',
			holder: 'record',
			cell: 'field',
			heading: 'Name',
		} as const;
		const el = columnsEditor({ columns: [] }, 2, words);
		expect(el.textContent).toContain('No fields yet.');
		expect(button(el, 'Add field')).toBeDefined();

		const filled = columnsEditor(
			{ columns: [{ key: 'Modifiers', type: 'modifier' }] },
			2,
			words,
		);
		expect(filled.textContent).toContain(
			'A modifier field holds every modifier its record applies',
		);
		expect(filled.textContent).not.toContain('its row applies');
		// The word over the display-name column, and the accessible name under it.
		expect(
			Array.from(filled.querySelectorAll('.sheetsmith-entry-columns span')).map(
				(one) => one.textContent,
			),
		).toContain('Name');
		expect(
			filled.querySelector('input[aria-label="Field name"]'),
		).not.toBeNull();
		// And Table's own words are untouched by the default.
		const table = columnsEditor(
			{ columns: [{ key: 'Modifiers', type: 'modifier' }] },
			2,
		);
		expect(table.textContent).toContain('A modifier cell holds every modifier');
		expect(table.querySelector('input[aria-label="Column heading"]')).not.toBeNull();
	});

	it('offers a per-holder maximum only where the list asks for one', () => {
		/*
		 * Opt-in, unlike the flags above, which are existing controls a component
		 * may *withdraw*. A per-holder maximum is a second stored number inside one
		 * entry, and a list whose component does not draw a field for it, restore
		 * to it and clamp against it must not offer the choice. Table's columns
		 * list is unchanged, which is what keeps this feature out of Table.
		 */
		const table = columnsEditor({ columns: [{ key: 'Qty', type: 'number' }] });
		expect(
			Array.from(table.querySelectorAll('.sheetsmith-position-label')).map(
				(one) => one.textContent,
			),
		).toEqual(['Minimum', 'Maximum']);
		expect(table.querySelector('select[aria-label="Qty maximum from"]')).toBeNull();

		const words = { ...OFFERS, holderMax: true, unit: 'field', holder: 'record' };
		const el = columnsEditor({ columns: [{ key: 'Uses', type: 'number' }] }, 0, words);
		const source = el.querySelector<HTMLSelectElement>(
			'select[aria-label="Uses maximum from"]',
		);
		expect(source).not.toBeNull();
		// The two options are composed from the list's own vocabulary, so no
		// component's name reaches this module: a Table's would read "The column"
		// and "Each row" with no change here.
		expect(
			Array.from(source?.options ?? []).map((one) => [one.value, one.text]),
		).toEqual([
			['field', 'The field'],
			['record', 'Each record'],
		]);
		expect(source?.value).toBe('field');
		// **After the ceiling it governs, not between the two numbers.** Between
		// them it reads as qualifying **Minimum**, which it does not: a floor is
		// the layout's in both modes.
		expect(
			Array.from(el.querySelectorAll('.sheetsmith-position-label')).map(
				(one) => one.textContent,
			),
		).toEqual(['Minimum', 'Maximum', 'Maximum from']);
	});

	it('withholds the maximum while the holder owns it, and writes the default out as absence', () => {
		const words = { ...OFFERS, holderMax: true, unit: 'field', holder: 'record' };
		const column: Record<string, unknown> = { key: 'Uses', type: 'number', max: 3 };
		const el = columnsEditor({ columns: [column] }, 0, words);
		const source = el.querySelector<HTMLSelectElement>(
			'select[aria-label="Uses maximum from"]',
		) as HTMLSelectElement;
		source.value = 'record';
		source.dispatchEvent(new Event('change'));
		expect(column.maxSource).toBe('record');
		expect(recorded.persists).toBe(1);
		expect(recorded.redraws).toBe(1);
		// **The declared number survives untouched**, which is what makes switching
		// back restore the previous reading exactly.
		expect(column.max).toBe(3);

		const owned = columnsEditor({ columns: [column] }, 0, words);
		expect(
			Array.from(owned.querySelectorAll('.sheetsmith-position-label')).map(
				(one) => one.textContent,
			),
		).toEqual(['Minimum', 'Maximum from']);
		// Back again, and the key leaves the file rather than being written out as
		// the value it already effectively has.
		const back = owned.querySelector<HTMLSelectElement>(
			'select[aria-label="Uses maximum from"]',
		) as HTMLSelectElement;
		expect(back.value).toBe('record');
		back.value = 'field';
		back.dispatchEvent(new Event('change'));
		expect('maxSource' in column).toBe(false);
		expect(
			Array.from(
				columnsEditor({ columns: [column] }, 0, words).querySelectorAll(
					'.sheetsmith-position-label',
				),
			).map((one) => one.textContent),
		).toEqual(['Minimum', 'Maximum', 'Maximum from']);
	});

	it('says the declared maximum is kept when the holder takes it over', () => {
		// The input vanishes with the author's number in it, and the number is in
		// fact left in the layout untouched — so the form has to say so, or a box
		// holding a number simply disappearing invites retyping it.
		const words = { ...OFFERS, holderMax: true, unit: 'field', holder: 'record' };
		const before = columnsEditor(
			{ columns: [{ key: 'Uses', type: 'number', max: 3 }] },
			0,
			words,
		);
		expect(before.textContent).not.toContain('is kept in the layout');
		const after = columnsEditor(
			{ columns: [{ key: 'Uses', type: 'number', max: 3, maxSource: 'record' }] },
			0,
			words,
		);
		expect(after.textContent).toContain(
			'Each record types its own maximum on the sheet',
		);
		expect(after.textContent).toContain(
			'kept in the layout and left unused, so switching back to the field restores it',
		);
	});

	it('withholds the hide-heading flag where no heading is drawn', () => {
		// A control that does nothing, on a component that draws no heading strip.
		// The key is still read and still round-trips; what goes is the control.
		const shown = Array.from(
			columnsEditor({ columns: [{ key: 'Qty', type: 'number' }] }).querySelectorAll(
				'label',
			),
		).map((one) => one.textContent);
		expect(shown).toContain('Hide heading');
		const withheld = Array.from(
			columnsEditor(
				{ columns: [{ key: 'Uses', type: 'number' }] },
				0,
				OFFERS,
			).querySelectorAll('label'),
		).map((one) => one.textContent);
		expect(withheld).not.toContain('Hide heading');
	});

	describe('where a field is drawn inside its holder', () => {
		/*
		 * `columnOptions.placement`, opt-in on `holderMax`'s precedent: only a
		 * component that draws a body has somewhere to move an entry to
		 * (`docs/features/record-set-body-fields.md`).
		 */
		const PLACED = { ...OFFERS, placement: true, unit: 'field', holder: 'record' };
		const LABEL = 'Inside the opened record';
		const labels = (el: HTMLElement) =>
			Array.from(el.querySelectorAll('.sheetsmith-entry-detail label')).map(
				(one) => one.textContent,
			);
		const box = (el: HTMLElement, at = 0) => {
			const found = Array.from(
				el.querySelectorAll<HTMLLabelElement>('.sheetsmith-entry-detail label'),
			).filter((one) => one.textContent === LABEL)[at];
			if (!found) throw new Error('no placement checkbox');
			return found.querySelector('input') as HTMLInputElement;
		};

		it('is offered where the list asks for it, on every type it holds, and on no Table column', () => {
			const table = columnsEditor({
				columns: [
					{ key: 'Qty', type: 'number' },
					{ key: 'Worn', type: 'toggle' },
				],
			});
			expect(table.textContent).not.toContain('Inside the opened');

			const columns = OFFERS.types.map((type) => ({ key: `F_${type}`, type }));
			const el = columnsEditor({ columns }, 0, PLACED);
			expect(
				Array.from(el.querySelectorAll('.sheetsmith-entry-detail')).map(
					(detail) =>
						Array.from(detail.querySelectorAll('label')).some(
							(one) => one.textContent === LABEL,
						),
				),
			).toEqual(OFFERS.types.map(() => true));
		});

		it("sits last on the detail line, after Maximum from, in the holder's own word", () => {
			const el = columnsEditor(
				{ columns: [{ key: 'Uses', type: 'number' }] },
				0,
				{ ...PLACED, holderMax: true },
			);
			const detail = el.querySelector('.sheetsmith-entry-detail') as HTMLElement;
			expect(detail.lastElementChild?.textContent).toBe(LABEL);
			const children = Array.from(detail.children).map(
				(one) => one.textContent ?? '',
			);
			expect(children.findIndex((one) => one.startsWith('Maximum from'))).toBe(
				children.length - 2,
			);
			// Composed from `holder`, so another component would say its own word.
			const other = columnsEditor(
				{ columns: [{ key: 'Uses', type: 'number' }] },
				0,
				{ ...OFFERS, placement: true, holder: 'card' },
			);
			expect(labels(other)).toContain('Inside the opened card');
		});

		it('writes the body id on a tick and deletes the key on an untick', () => {
			const column: Record<string, unknown> = { key: 'Recharge', type: 'level' };
			const el = columnsEditor({ columns: [column] }, 0, PLACED);
			const input = box(el);
			expect(input.checked).toBe(false);
			input.checked = true;
			input.dispatchEvent(new Event('change'));
			expect(column.placement).toBe('body');
			expect(recorded.persists).toBe(1);

			const again = box(columnsEditor({ columns: [column] }, 0, PLACED));
			expect(again.checked).toBe(true);
			again.checked = false;
			again.dispatchEvent(new Event('change'));
			// The default is written as absence, never as 'summary'.
			expect('placement' in column).toBe(false);
		});

		it('shows a hand-written summary unticked and leaves it until the box is pressed', () => {
			const column: Record<string, unknown> = {
				key: 'Uses',
				type: 'number',
				placement: 'summary',
			};
			const odd: Record<string, unknown> = {
				key: 'Rank',
				type: 'level',
				placement: 'Body',
			};
			const el = columnsEditor({ columns: [column, odd] }, 0, PLACED);
			expect(box(el, 0).checked).toBe(false);
			expect(box(el, 1).checked).toBe(false);
			// Nothing was written by drawing it.
			expect(recorded.persists).toBe(0);
			expect(column.placement).toBe('summary');
			expect(odd.placement).toBe('Body');
		});
	});

	it('falls back to every type where the declaration names none that exist', () => {
		// A hand-edited component naming nothing real must not empty the select,
		// which would leave a column's type unchangeable.
		const el = columnsEditor({ columns: [{ key: 'Qty' }] }, 0, {
			types: ['prose'],
		});
		expect(Array.from(typeSelect(el).options).map((one) => one.value)).toEqual([
			...COLUMN_TYPES,
		]);
	});
});

describe('the columns editor and a modifier column', () => {
	const detail = (el: HTMLElement) =>
		el.querySelector('.sheetsmith-entry-detail') as HTMLElement;

	const checks = (el: HTMLElement) =>
		Array.from(detail(el).querySelectorAll('.sheetsmith-entry-check')).map(
			(one) => one.textContent,
		);

	const footnotes = (el: HTMLElement) =>
		Array.from(el.querySelectorAll('.sheetsmith-entry-footnote')).map(
			(one) => one.textContent ?? '',
		);

	const errors = (el: HTMLElement) =>
		Array.from(el.querySelectorAll('.sheetsmith-field-error')).map(
			(one) => one.textContent ?? '',
		);

	it('offers Modifier as a column type', () => {
		const el = columnsEditor({ columns: [{ key: 'Effect' }] });
		const type = detail(el)
			.closest('.sheetsmith-list-entry')
			?.querySelector('select') as HTMLSelectElement;
		expect(Array.from(type.options).map((one) => one.textContent)).toContain(
			'Modifier',
		);
	});

	it('puts a modifier column\'s detail line back to one line', () => {
		/*
		 * The two controls the shipped design needed here are gone: an amount and
		 * a bonus type are the definition's now. That is the half of SPEC §13's
		 * `.sheetsmith-list-scroll` question this feature answers by deletion — a
		 * modifier column cost two lines instead of one and a four-column table
		 * overran the cap.
		 */
		const el = columnsEditor({ columns: [{ key: 'Effect', type: 'modifier' }] });
		expect(checks(el)).toEqual(['Hide heading']);
		expect(detail(el).querySelectorAll('select')).toHaveLength(0);
	});

	it('offers neither a total nor a publication on a modifier column', () => {
		// The component refuses both, so offering them here would only lead to the
		// refusal — and a modifier cell holds a name, which is neither a number to
		// add up nor a value a formula can compare to anything.
		const el = columnsEditor({ columns: [{ key: 'Effect', type: 'modifier' }] });
		expect(checks(el)).not.toContain('Show a total');
		expect(checks(el)).not.toContain('Publish per row');
	});

	it('counts the modifiers a cell will offer, once the table has a column', () => {
		// The note the columns list gains, replacing the accepting-targets list the
		// shipped design put here: the targets moved to the definitions field,
		// where a target is chosen once instead of per row.
		//
		// **A count and not the names.** Enumerating them grew with the layout and
		// restated the Modifiers list one panel away; what this surface can add is
		// whether the picker will have anything in it.
		const el = columnsEditor({ columns: [{ key: 'Effect', type: 'modifier' }] }, 2);
		const said = footnotes(el).join('\n');
		expect(said).toContain('holds every modifier its row applies');
		// And **both tiers**, because a cell can hold either: naming only the
		// layout's own would leave an author reading this with no way to know a row
		// may type its own effect.
		expect(said).toContain('either one this layout names or one typed on the row');
		// And the separator, which is a syntax in a file people hand-edit: the one
		// place an author is told what it is before they meet it in a cell.
		expect(said).toContain('separated by a semicolon');
		expect(said).toContain('names 2 of them');
		expect(said).not.toContain('Belt of Giant Strength');
		expect(errors(el)).toEqual([]);
	});

	it('reports every modifier column after the first, naming the fix', () => {
		/*
		 * One is enough now that a cell holds every modifier its row applies, so a
		 * second is redundant — and **this is the only place the retired cap is
		 * enforced at all, as advice.** The sheet keeps drawing both columns, keeps
		 * pushing from both and refuses neither: a `configError` would take the
		 * table and every modifier its rows apply down with it, which is §10's worst
		 * trade and Constraint 4's.
		 */
		const el = columnsEditor(
			{
				columns: [
					{ key: 'Modifiers', type: 'modifier' },
					{ key: 'Aid', type: 'modifier' },
					{ key: 'More', type: 'modifier' },
				],
			},
			2,
		);
		const said = errors(el);
		// One per redundant column, and named, so the reader knows which to move.
		expect(said).toHaveLength(2);
		expect(said[0]).toBe(
			'"Aid" is a second modifier column. A modifier cell holds every modifier its row applies, so one modifier column is enough. Move this column\'s modifiers into the first and remove it.',
		);
		expect(said[1]).toContain('"More" is a second modifier column');
		// And the footnote is still there: the fact about how a cell works does not
		// go away because the layout has a column too many.
		expect(footnotes(el).join('\n')).toContain('separated by a semicolon');
	});

	it('says nothing about a second column where there is only one', () => {
		const el = columnsEditor(
			{ columns: [{ key: 'Modifiers', type: 'modifier' }] },
			2,
		);
		expect(errors(el)).toEqual([]);
	});

	it('says no error where the layout names no modifiers at all', () => {
		/*
		 * **The report this wave retires**, and it runs the opposite way to every
		 * other row of the feature's corrections table. It was true under a
		 * reference-only model — a column with nothing to point at *was* pointless —
		 * and it is false the moment a row can type its own effect. So a layout with
		 * no named modifiers is an ordinary layout, and the note stays and counts
		 * zero.
		 */
		const el = columnsEditor({ columns: [{ key: 'Effect', type: 'modifier' }] });
		expect(errors(el)).toEqual([]);
		const said = footnotes(el).join('\n');
		expect(said).toContain('holds every modifier its row applies');
		expect(said).toContain('names 0 of them');
		expect(said).toContain('top row of the tree');
	});

	it('says nothing at all where the table has no modifier column', () => {
		const el = columnsEditor({ columns: [{ key: 'Bonus', type: 'number' }] });
		expect(errors(el)).toEqual([]);
		expect(footnotes(el).join('\n')).not.toContain('modifier');
	});
});

/*
 * A formula cell inside a list says what the parser makes of it
 * (`docs/features/formula-field-errors.md`).
 *
 * One block over three editors, because it is one rule reaching four controls:
 * the expression is stored either way, and the message is the parser's own
 * sentence at render and on commit alike.
 */
describe('a formula cell that will not parse', () => {
	/** The message under one field, which is where `showFieldError` puts it. */
	function under(input: HTMLInputElement): string | null {
		return fieldError(input.parentElement as HTMLElement);
	}

	/** A record set's own words for the shared columns field. */
	const AS_FIELDS = {
		types: ['number', 'toggle', 'level', 'computed', 'modifier'],
		total: false,
		publish: false,
		hideHeading: false,
		unit: 'field',
		holder: 'record',
		cell: 'field',
		heading: 'Name',
	} as const;

	function formulaCell(el: HTMLElement, key: string): HTMLInputElement {
		const found = el.querySelector<HTMLInputElement>(
			`input[aria-label="${key} formula"]`,
		);
		if (!found) throw new Error(`no formula cell for "${key}"`);
		return found;
	}

	it('marks a computed column on first paint, with no change fired', () => {
		const el = columnsEditor({
			columns: [{ key: 'Total', type: 'computed', formula: 'ability + ' }],
		});
		const cell = formulaCell(el, 'Total');
		expect(under(cell)).toBe('Expected a value in formula.');
		expect(cell.classList.contains('sheetsmith-input-invalid')).toBe(true);
		// Nothing about drawing a form is an edit.
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('says nothing about a column whose formula parses, or has none', () => {
		const el = columnsEditor({
			columns: [
				{ key: 'Total', type: 'computed', formula: 'ability + 2' },
				{ key: 'Bare', type: 'computed' },
			],
		});
		expect(under(formulaCell(el, 'Total'))).toBeNull();
		expect(under(formulaCell(el, 'Bare'))).toBeNull();
	});

	it('marks both of two broken columns', () => {
		const el = columnsEditor({
			columns: [
				{ key: 'Total', type: 'computed', formula: 'ability +' },
				{ key: 'Bonus', type: 'computed', formula: 'floor((prof' },
			],
		});
		expect(under(formulaCell(el, 'Total'))).toBe('Expected a value in formula.');
		expect(under(formulaCell(el, 'Bonus'))).toBe('Expected ")" in formula.');
	});

	it('stores a broken expression and says what is wrong with it', () => {
		const record = {
			columns: [{ key: 'Total', type: 'computed', formula: 'ability + 2' }],
		};
		const el = columnsEditor(record);
		const cell = formulaCell(el, 'Total');
		commit(cell, 'ability + #');
		expect(under(cell)).toBe('Unexpected character "#" in formula.');
		// Stored, not refused: a formula is invalid for most of the time it is
		// being written.
		expect(record.columns[0]?.formula).toBe('ability + #');
		expect(recorded.persists).toBe(1);
	});

	it('clears the message when the expression is corrected', () => {
		const record = {
			columns: [{ key: 'Total', type: 'computed', formula: 'ability +' }],
		};
		const el = columnsEditor(record);
		const cell = formulaCell(el, 'Total');
		expect(under(cell)).not.toBeNull();
		commit(cell, 'ability + 2');
		expect(under(cell)).toBeNull();
		expect(cell.classList.contains('sheetsmith-input-invalid')).toBe(false);
	});

	it('marks a record set field, which is the same control under other words', () => {
		const el = columnsEditor(
			{ columns: [{ key: 'Save', type: 'computed', formula: 'level *' }] },
			0,
			AS_FIELDS,
		);
		expect(under(formulaCell(el, 'Save'))).toBe('Expected a value in formula.');
	});

	it('marks a row value expression under its own cell', () => {
		const el = rowsEditor({
			rows: [
				{ label: 'Acrobatics', values: { ability: 'abilities.DEX' } },
				{ label: 'Arcana', values: { ability: 'abilities.INT +' } },
			],
		});
		const cells = Array.from(
			el.querySelectorAll<HTMLInputElement>('input[placeholder="Expression"]'),
		);
		expect(cells).toHaveLength(2);
		expect(under(cells[0] as HTMLInputElement)).toBeNull();
		expect(under(cells[1] as HTMLInputElement)).toBe(
			'Expected a value in formula.',
		);
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('marks a track row whose segment count will not parse', () => {
		const el = entriesEditor(
			{
				entries: [
					{ key: 'first', count: 'level /' },
					{ key: 'second', count: 3 },
					{ key: 'third' },
				],
			},
			{ withCount: true },
		);
		const cells = Array.from(
			el.querySelectorAll<HTMLInputElement>('input[placeholder="Segments"]'),
		);
		expect(cells).toHaveLength(3);
		expect(under(cells[0] as HTMLInputElement)).toBe(
			'Expected a value in formula.',
		);
		// A bare number is arithmetic already, and an empty cell falls back to
		// the component's own count.
		expect(under(cells[1] as HTMLInputElement)).toBeNull();
		expect(under(cells[2] as HTMLInputElement)).toBeNull();
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
	});

	it('remembers a message so it survives a rebuild of the pane', () => {
		// `field-error.ts`'s policy: the DOM says the reader can see it now, and
		// the map is what `restoreFieldErrors` can replay.
		columnsEditor({
			columns: [{ key: 'Total', type: 'computed', formula: 'ability +' }],
		});
		expect([...context.errors.values()]).toContain(
			'Expected a value in formula.',
		);
	});
});

describe('a condition on a column', () => {
	/*
	 * `docs/features/conditional-field-visibility.md`. **Shown when** is offered
	 * only where the component asks for it (`columnOptions.visibleWhen`, Record
	 * set's), and a condition written by hand on a list that cannot honour one is
	 * reported rather than refused.
	 */
	/**
	 * Record set's own offer, taken from the registry rather than restated, so a
	 * type the component adds is a type these cases ask about.
	 */
	const FIELDS = ((): ColumnOptionsSpec => {
		const offered = getComponent('record-set')?.configFields.find(
			(one) => one.key === 'fields',
		)?.columnOptions;
		if (offered === undefined) throw new Error('Record set offers no fields list');
		return offered;
	})();
	const LEVELS = ['None', 'Short rest', 'Long rest', 'Always-on'];

	beforeEach(() => {
		Notice.messages = [];
	});

	/** The Shown when input on one entry's detail line, by its key. */
	const shownWhen = (el: HTMLElement, key: string) =>
		el.querySelector<HTMLInputElement>(`input[aria-label="${key} shown when"]`);
	/** What is drawn under that input: its error and its legend. */
	const under = (el: HTMLElement, key: string, cls: string) =>
		Array.from(
			shownWhen(el, key)?.parentElement?.querySelectorAll(`.${cls}`) ?? [],
		).map((one) => one.textContent);

	const recharging = () => ({
		id: 'recharging',
		columns: [
			{ key: 'Recharges', type: 'level', input: 'select', levels: [...LEVELS] },
			{
				key: 'Uses',
				type: 'number',
				visibleWhen: 'Recharges == 1 || Recharges == 2',
			},
			{ key: 'Active', type: 'toggle', visibleWhen: 'Recharges == 3' },
		] as Record<string, unknown>[],
	});

	it('is offered on every field type a Record set holds, last on the line', () => {
		expect(FIELDS.visibleWhen).toBe(true);
		expect(FIELDS.types.length).toBeGreaterThan(0);
		const columns = FIELDS.types.map((type) => ({ key: `F_${type}`, type }));
		const el = columnsEditor({ columns }, 0, FIELDS);
		for (const column of columns) {
			const input = shownWhen(el, column.key);
			expect(input, column.type).not.toBeNull();
			expect(input?.placeholder).toBe('Always');
			const detail = input?.closest('.sheetsmith-entry-detail');
			// Last on the line, after "Inside the opened record".
			expect(detail?.lastElementChild).toBe(input?.parentElement);
			expect(input?.parentElement?.querySelector('.sheetsmith-position-label')?.textContent).toBe(
				'Shown when',
			);
		}
	});

	it('stays inline while empty, and takes a row of its own once it holds a condition', () => {
		// A full row on every field grew each entry by half again for a field
		// reading `Always`; a condition, an error or a legend needs the row.
		const record = {
			id: 'features',
			columns: [
				{ key: 'Recharges', type: 'level', levels: ['None', 'Rest'] },
				{ key: 'Uses', type: 'number' },
				{ key: 'Active', type: 'toggle', visibleWhen: 'Recharges == 1' },
				{ key: 'Spare', type: 'number', visibleWhen: 'Spare >' },
				{ key: 'Blank', type: 'number', visibleWhen: '  ' },
			] as Record<string, unknown>[],
		};
		const el = columnsEditor(record, 0, FIELDS);
		const fieldOf = (key: string) => shownWhen(el, key)?.parentElement as HTMLElement;
		const onRow = (key: string) => fieldOf(key).classList.contains('sheetsmith-detail-field-row');
		const inline = (key: string) => fieldOf(key).classList.contains('sheetsmith-detail-field-wide');
		for (const key of ['Recharges', 'Uses', 'Blank']) {
			expect(onRow(key), key).toBe(false);
			expect(inline(key), key).toBe(true);
			// Still last on the line.
			expect(fieldOf(key).parentElement?.lastElementChild).toBe(fieldOf(key));
		}
		// A condition with a legend, and one with only an error.
		for (const key of ['Active', 'Spare']) {
			expect(onRow(key), key).toBe(true);
			expect(inline(key), key).toBe(false);
		}
		// The first commit moves it to its row, and the input keeps its token, so
		// a rebuild of the pane puts focus back on it.
		const input = shownWhen(el, 'Uses') as HTMLInputElement;
		input.value = 'Recharges == 1';
		input.dispatchEvent(new Event('change'));
		expect(onRow('Uses')).toBe(true);
		expect(input.dataset.sheetsmithFocus).toBe('skills-col-Uses-visiblewhen');
		expect(shownWhen(columnsEditor(record, 0, FIELDS), 'Uses')?.dataset.sheetsmithFocus).toBe(
			'skills-col-Uses-visiblewhen',
		);
		// And blanking it puts it back inline.
		const again = columnsEditor(record, 0, FIELDS);
		const back = shownWhen(again, 'Uses') as HTMLInputElement;
		back.value = '';
		back.dispatchEvent(new Event('change'));
		expect(back.parentElement?.classList.contains('sheetsmith-detail-field-wide')).toBe(true);
	});

	it('is offered on no Table or Roster column', () => {
		const table = columnsEditor({
			columns: [
				{ key: 'Qty', type: 'number' },
				{ key: 'Worn', type: 'toggle' },
			],
		});
		expect(table.querySelector('input[aria-label$=" shown when"]')).toBeNull();
		const roster = columnsEditor(
			{ columns: [{ key: 'Bonus', type: 'number' }] },
			0,
			getComponent('roster')?.configFields.find((one) => one.key === 'columns')
				?.columnOptions,
		);
		expect(roster.querySelector('input[aria-label$=" shown when"]')).toBeNull();
	});

	it('writes what is typed, and deletes the key when it is blanked', () => {
		const record = { id: 'features', columns: [{ key: 'Uses', type: 'number' }] as Record<string, unknown>[] };
		const el = columnsEditor(record, 0, FIELDS);
		const input = shownWhen(el, 'Uses') as HTMLInputElement;
		input.value = ' Recharges == 1 ';
		input.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.visibleWhen).toBe('Recharges == 1');
		expect(recorded.persists).toBe(1);
		input.value = '   ';
		input.dispatchEvent(new Event('change'));
		expect('visibleWhen' in (record.columns[0] ?? {})).toBe(false);
	});

	it('reports a condition that will not parse, on render and on commit, and stores it anyway', () => {
		const record = {
			id: 'features',
			columns: [{ key: 'Uses', type: 'number', visibleWhen: 'Recharges ==' }] as Record<string, unknown>[],
		};
		const el = columnsEditor(record, 0, FIELDS);
		expect(under(el, 'Uses', 'sheetsmith-field-error')).toEqual(['Expected a value in formula.']);
		const input = shownWhen(el, 'Uses') as HTMLInputElement;
		input.value = 'Recharges == 1';
		input.dispatchEvent(new Event('change'));
		expect(under(el, 'Uses', 'sheetsmith-field-error')).toEqual([]);
		input.value = '(Recharges';
		input.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.visibleWhen).toBe('(Recharges');
		expect(under(el, 'Uses', 'sheetsmith-field-error')).toHaveLength(1);
	});

	it('binds the suggester with this component as the owner', () => {
		const bound: [string, string | undefined][] = [];
		context.suggestNames = (input, owner) => {
			bound.push([input.getAttribute('aria-label') ?? '', owner]);
		};
		columnsEditor(recharging(), 0, FIELDS);
		expect(bound).toContainEqual(['Uses shown when', 'recharging']);
		expect(bound).toContainEqual(['Active shown when', 'recharging']);
	});

	it('refuses a condition naming its own field, naming it, and stores the text', () => {
		const record = {
			id: 'features',
			columns: [
				{ key: 'Uses', type: 'number', visibleWhen: 'Uses > 0' },
				{ key: 'Spare', type: 'number', visibleWhen: 'abilities.Spare > 0' },
			] as Record<string, unknown>[],
		};
		const el = columnsEditor(record, 0, FIELDS);
		const said = under(el, 'Uses', 'sheetsmith-field-error');
		expect(said).toEqual([
			'"Uses" is shown when its own value says so, and a field that can hide itself vanishes under the cursor and can only be brought back by a reset. This condition is not used, so "Uses" is always shown. Base it on another field.',
		]);
		// A dotted name is somebody else's.
		expect(under(el, 'Spare', 'sheetsmith-field-error')).toEqual([]);
		const input = shownWhen(el, 'Uses') as HTMLInputElement;
		input.value = 'Uses == 0 || Recharges == 1';
		input.dispatchEvent(new Event('change'));
		expect(record.columns[0]?.visibleWhen).toBe('Uses == 0 || Recharges == 1');
		expect(under(el, 'Uses', 'sheetsmith-field-error')).toHaveLength(1);
	});

	describe('the position legend', () => {
		it("says what each named level's position is called", () => {
			const el = columnsEditor(recharging(), 0, FIELDS);
			expect(under(el, 'Uses', 'sheetsmith-entry-footnote')).toEqual([
				'Recharges: 0 None · 1 Short rest · 2 Long rest · 3 Always-on',
			]);
			expect(under(el, 'Active', 'sheetsmith-entry-footnote')).toEqual([
				'Recharges: 0 None · 1 Short rest · 2 Long rest · 3 Always-on',
			]);
			// And it sits under the error, not between it and the input.
			const input = shownWhen(el, 'Uses') as HTMLInputElement;
			expect(input.nextElementSibling?.classList.contains('sheetsmith-entry-footnote')).toBe(true);
		});

		it('counts an unnamed level, and draws nothing for a condition naming no level', () => {
			const el = columnsEditor(
				{
					id: 'x',
					columns: [
						{ key: 'Tier', type: 'level', max: 3 },
						{ key: 'Uses', type: 'number', visibleWhen: 'Tier > 1' },
						{ key: 'Spare', type: 'number', visibleWhen: 'Uses > 0' },
					],
				},
				0,
				FIELDS,
			);
			expect(under(el, 'Uses', 'sheetsmith-entry-footnote')).toEqual(['Tier: 0 … 3']);
			expect(under(el, 'Spare', 'sheetsmith-entry-footnote')).toEqual([]);
		});

		it('reads the new positions after a reorder', () => {
			const record = recharging();
			const el = columnsEditor(record, 0, FIELDS);
			const names = el.querySelector<HTMLInputElement>('input[aria-label="Recharges level names"]') as HTMLInputElement;
			names.value = 'None, Long rest, Short rest, Always-on';
			names.dispatchEvent(new Event('change'));
			// The commit redraws the pane; drawn again from the layout it wrote.
			const again = columnsEditor(record, 0, FIELDS);
			expect(under(again, 'Uses', 'sheetsmith-entry-footnote')).toEqual([
				'Recharges: 0 None · 1 Long rest · 2 Short rest · 3 Always-on',
			]);
		});
	});

	describe('a reorder a condition reads through', () => {
		const commitNames = (el: HTMLElement, key: string, text: string) => {
			const names = el.querySelector<HTMLInputElement>(`input[aria-label="${key} level names"]`) as HTMLInputElement;
			names.value = text;
			names.dispatchEvent(new Event('change'));
		};

		it('raises one notice naming both moved levels and the field reading them', () => {
			const el = columnsEditor(recharging(), 0, FIELDS);
			commitNames(el, 'Recharges', 'None, Long rest, Short rest, Always-on');
			expect(Notice.messages).toEqual([
				// Every field whose condition reads the key, whichever positions it names.
				'"Recharges" levels moved: "Short rest" was 1 and is now 2; "Long rest" was 2 and is now 1. The conditions on "Uses" and "Active" read Recharges by position, so they now mean something else. Check them under Shown when.',
			]);
		});

		it('says nothing for a level renamed in place', () => {
			const el = columnsEditor(recharging(), 0, FIELDS);
			commitNames(el, 'Recharges', 'None, Short rest, Long rest, Permanent');
			expect(Notice.messages).toEqual([]);
		});

		it('raises one for a shortened list, named or counted', () => {
			const el = columnsEditor(recharging(), 0, FIELDS);
			commitNames(el, 'Recharges', 'None, Short rest, Long rest');
			expect(Notice.messages).toHaveLength(1);
			expect(Notice.messages[0]).toContain('shortened: the highest is now 2, where it was 3');
			expect(Notice.messages[0]).toContain('"Active"');

			Notice.messages = [];
			const counted = columnsEditor(
				{
					id: 'x',
					columns: [
						{ key: 'Tier', type: 'level', max: 3 },
						{ key: 'Uses', type: 'number', visibleWhen: 'Tier > 1' },
					],
				},
				0,
				FIELDS,
			);
			const max = counted.querySelector<HTMLInputElement>('input[aria-label="Tier highest level"]') as HTMLInputElement;
			max.value = '2';
			max.dispatchEvent(new Event('change'));
			expect(Notice.messages).toHaveLength(1);
			expect(Notice.messages[0]).toContain('"Tier" levels shortened');
		});

		it('raises none for a list no condition reads', () => {
			const el = columnsEditor(
				{
					id: 'x',
					columns: [
						{ key: 'Rank', type: 'level', levels: ['Untrained', 'Trained', 'Expert'] },
						{ key: 'Uses', type: 'number', visibleWhen: 'Uses_max > 0' },
					],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Rank', 'Expert, Trained, Untrained');
			expect(Notice.messages).toEqual([]);
		});

		it('raises none on a Table, whose columns carry no honoured condition', () => {
			const el = columnsEditor({
				id: 't',
				columns: [
					{ key: 'Rank', type: 'level', levels: ['A', 'B', 'C'] },
					{ key: 'Bonus', type: 'number', visibleWhen: 'Rank == 1' },
				],
			});
			commitNames(el, 'Rank', 'C, B, A');
			expect(Notice.messages).toEqual([]);
		});

		/*
		 * A reset's **Only where** reads the level by position too
		 * (`docs/features/record-set-reset-scope.md`), read off the record's own
		 * `reset`, which is shared config.
		 */
		const unconditioned = () => ({
			id: 'rest_features',
			// The component is what says whether a reset's `to` is worked out per
			// entry (`resolvesResetPerPart`), so the record names it.
			type: 'record-set',
			columns: [
				{ key: 'Recharges', type: 'level', input: 'select', levels: [...LEVELS] },
				{ key: 'Uses', type: 'number' },
			] as Record<string, unknown>[],
		});

		it('names the reset whose condition reads the key, and Only where', () => {
			const el = columnsEditor(
				{
					...unconditioned(),
					reset: [
						{ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' },
						{ trigger: 'Long rest', action: 'full' },
					],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Recharges', 'None, Long rest, Short rest, Always-on');
			expect(Notice.messages).toEqual([
				'"Recharges" levels moved: "Short rest" was 1 and is now 2; "Long rest" was 2 and is now 1. The Short rest reset reads Recharges by position, so what it resets has changed. Check it under Only where.',
			]);
		});

		it('adds the reset clause to the fields clause, in one notice', () => {
			const el = columnsEditor(
				{
					...recharging(),
					reset: [{ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' }],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Recharges', 'None, Long rest, Short rest, Always-on');
			expect(Notice.messages).toHaveLength(1);
			expect(Notice.messages[0]).toContain('Check them under Shown when. The Short rest reset reads it by position too');
		});

		it('names the reset whose per-entry amount reads the key, and Resets to', () => {
			// A binding naming a field works its `to` out on each record
			// (`docs/features/record-set-reset-field-targeting.md`, Part 6), so a
			// reorder changes what it reads, as it does a condition.
			const el = columnsEditor(
				{
					...unconditioned(),
					reset: [
						{
							trigger: 'Short rest',
							column: 'Uses',
							action: 'formula',
							to: 'if(Recharges == 4, Uses + 1, 0)',
						},
					],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Recharges', 'None, Long rest, Short rest, Always-on');
			expect(Notice.messages).toEqual([
				'"Recharges" levels moved: "Short rest" was 1 and is now 2; "Long rest" was 2 and is now 1. The Short rest reset reads Recharges by position, so what it resets has changed. Check it under Resets to.',
			]);
		});

		it('adds no reset clause for a Table column reset whose to names the key', () => {
			// A Table checks no condition, so its column `to` is resolved once in
			// sheet scope and reads no row's cell.
			const el = columnsEditor(
				{
					...unconditioned(),
					type: 'table',
					reset: [
						{ trigger: 'Short rest', column: 'Uses', action: 'formula', to: 'Recharges + 1' },
					],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Recharges', 'None, Long rest, Short rest, Always-on');
			expect(Notice.messages).toEqual([]);
		});

		it('adds no reset clause for a reset naming no field whose to names the key', () => {
			// `to` is resolved in sheet scope and reads no record's field.
			const el = columnsEditor(
				{
					...unconditioned(),
					reset: [{ trigger: 'Short rest', action: 'formula', to: 'Recharges + 1' }],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Recharges', 'None, Long rest, Short rest, Always-on');
			expect(Notice.messages).toEqual([]);
		});

		it('says nothing to a reset where a level is renamed in place', () => {
			const el = columnsEditor(
				{
					...unconditioned(),
					reset: [{ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' }],
				},
				0,
				FIELDS,
			);
			commitNames(el, 'Recharges', 'None, Short rest, Long rest, Permanent');
			expect(Notice.messages).toEqual([]);
		});

		it('raises none on a key rename, and leaves the condition as written', () => {
			const record = recharging();
			const el = columnsEditor(record, 0, FIELDS);
			const key = el.querySelector<HTMLInputElement>('input[aria-label="Field key"]') as HTMLInputElement;
			key.value = 'Recharge';
			key.dispatchEvent(new Event('change'));
			expect(record.columns[0]?.key).toBe('Recharge');
			expect(Notice.messages).toEqual([]);
			expect(record.columns[1]?.visibleWhen).toBe('Recharges == 1 || Recharges == 2');
		});
	});

	describe('on a list that cannot honour one', () => {
		it('reports a Table column carrying one, naming it, and leaves the key alone', () => {
			const record = {
				columns: [
					{ key: 'Qty', type: 'number' },
					{ key: 'Weight', type: 'number', visibleWhen: 'Qty > 0' },
					{ key: 'Notes', type: 'text', visibleWhen: '' },
					// Not text and not an answer, so no condition at all (`heldCondition`).
					{ key: 'Worn', type: 'toggle', visibleWhen: 3 },
				],
			};
			const before = JSON.stringify(record);
			const el = columnsEditor(record);
			const said = Array.from(el.querySelectorAll(':scope > .sheetsmith-field-error')).map(
				(one) => one.textContent,
			);
			expect(said).toEqual([
				'"Weight" has a condition, and every column here is drawn on every row, so the condition does nothing. Remove it, or move this column to a Record set to show it only on some rows.',
			]);
			expect(JSON.stringify(record)).toBe(before);
		});

		it("reports a Roster column in the Roster's own words", () => {
			const offers = getComponent('roster')?.configFields.find((one) => one.key === 'columns')
				?.columnOptions;
			const el = columnsEditor(
				{ columns: [{ key: 'Bonus', type: 'number', visibleWhen: 'Bonus > 0' }] },
				0,
				offers,
			);
			const unit = offers?.unit ?? 'column';
			const holder = offers?.holder ?? 'row';
			expect(Array.from(el.querySelectorAll(':scope > .sheetsmith-field-error')).map((one) => one.textContent)).toEqual([
				`"Bonus" has a condition, and every ${unit} here is drawn on every ${holder}, so the condition does nothing. Remove it, or move this ${unit} to a Record set to show it only on some ${holder}s.`,
			]);
		});
	});
});

describe('a condition on a columns field, over the registry', () => {
	/*
	 * The registry contract's two branches, driven through the editor and the
	 * sheet because the node-environment contract file can draw neither. A
	 * component that asks for **Shown when** has to hide what it names; one that
	 * does not has to have its list report a condition written by hand.
	 */
	const columnsFields = listComponentTypes().flatMap((type) =>
		(getComponent(type)?.configFields ?? [])
			.filter((field) => field.kind === 'columns')
			.map((field) => ({ type, field })),
	);
	const honouring = columnsFields.filter(({ field }) => field.columnOptions?.visibleWhen === true);
	const reporting = columnsFields.filter(({ field }) => field.columnOptions?.visibleWhen !== true);

	it('finds a component on each branch', () => {
		expect(honouring.length).toBeGreaterThan(0);
		expect(reporting.length).toBeGreaterThan(0);
	});

	it.each(honouring.map(({ type, field }) => [type, field.key]))(
		'%s hides the entry its example says is never shown',
		(type, key) => {
			const component = getComponent(type);
			if (component?.sample === undefined) throw new Error(`${type} draws no sample`);
			const prefill = component.example ?? paletteEntries(type)[0]?.config ?? {};
			const base = {
				id: 'sample',
				type,
				label: 'Sample',
				position: { col: 1, row: 1, width: 6, height: 3 },
				...prefill,
			} as Record<string, unknown>;
			const entries = (base[key] as Record<string, unknown>[] | undefined) ?? [];
			expect(entries.length, `${type} has no ${key} to condition`).toBeGreaterThan(0);
			const drawn = (visibleWhen?: string): HTMLElement => {
				const config = {
					...base,
					[key]: entries.map((entry, at) =>
						at === 0 && visibleWhen !== undefined ? { ...entry, visibleWhen } : entry,
					),
				} as never;
				const body = component.sample?.(config) ?? '';
				const read = component.read(body, config);
				if (!read.ok) throw new Error(read.error);
				const el = host();
				component.render(el, config, read.data, {
					resolved: {},
					resolveField: makeFieldResolver(component, config, read.data, NO_ENV),
					onChange: () => undefined,
				});
				return el;
			};
			const hiddenIn = (el: HTMLElement) =>
				Array.from(el.querySelectorAll<HTMLElement>('[hidden]:not([hidden="until-found"])'));
			const plain = drawn();
			expect(hiddenIn(plain)).toHaveLength(0);
			const conditioned = drawn('false');
			const hidden = hiddenIn(conditioned);
			expect(hidden.length).toBeGreaterThan(0);
			/*
			 * **Exactly the first entry's own elements, and nothing else changed.**
			 * Each hidden element names the first entry and no other, and taking the
			 * attribute off gives back the tree the unconditioned render drew — so
			 * the condition hid that entry's element in place and touched nothing
			 * beside it.
			 */
			const keys = entries.map((entry) => String(entry.key));
			for (const one of hidden) {
				expect(one.outerHTML, `${type} hid something not "${keys[0]}"`).toContain(keys[0]);
				for (const other of keys.slice(1)) {
					expect(one.outerHTML, `${type} hid "${other}" with "${keys[0]}"`).not.toContain(other);
				}
			}
			for (const one of hidden) one.removeAttribute('hidden');
			expect(conditioned.innerHTML).toBe(plain.innerHTML);
		},
	);

	it.each(reporting.map(({ type, field }) => [type, field.key]))(
		"%s's list reports a condition written on one of its entries",
		(type, key) => {
			const offers = getComponent(type)?.configFields.find((one) => one.key === key)?.columnOptions;
			const el = host();
			renderColumnsEditor(
				el,
				{ [key]: [{ key: 'Weight', type: offers?.types[0] ?? 'number', visibleWhen: 'Qty > 0' }] },
				key,
				'x',
				context,
				0,
				offers,
			);
			expect(el.querySelector('input[aria-label$=" shown when"]')).toBeNull();
			expect(
				Array.from(el.querySelectorAll('.sheetsmith-field-error')).some((one) =>
					(one.textContent ?? '').startsWith('"Weight" has a condition,'),
				),
			).toBe(true);
		},
	);
});
