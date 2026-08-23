// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ListContext, renderColumnsEditor, renderRowsEditor } from './list-fields';

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
function columnsEditor(record: Record<string, unknown>): HTMLElement {
	const el = host();
	renderColumnsEditor(el, record, 'columns', 'skills', context);
	return el;
}

function rowsEditor(record: Record<string, unknown>): HTMLElement {
	const el = host();
	renderRowsEditor(el, record, 'rows', 'skills', context);
	return el;
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
		expect(el.querySelectorAll('.sheetsmith-attribute-row')).toHaveLength(5);
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
			expect(entry.querySelectorAll('.sheetsmith-attribute-row')).toHaveLength(1);
			expect(entry.querySelectorAll('.sheetsmith-attribute-detail')).toHaveLength(
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
					child.classList.contains('sheetsmith-attribute-columns'),
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
		const details = el.querySelectorAll('.sheetsmith-attribute-detail');
		const checks = Array.from(details).map((detail) =>
			Array.from(detail.querySelectorAll('.sheetsmith-attribute-check')).map(
				(check) => check.textContent,
			),
		);
		// A total is offered on the number and not on the text, for the same
		// reason the gloss is offered the other way round: neither control means
		// anything on the other kind of column. Publishing a row is offered
		// beside the total and refused on a text column for its own reason: a
		// cell holding a link has no one value for a name to mean.
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
			'.sheetsmith-attribute-detail input[type="checkbox"]',
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
		expect(plain.querySelector('.sheetsmith-attribute-footnote')).toBeNull();
		const levelled = columnsEditor({
			columns: [{ key: 'Training', type: 'level' }],
		});
		expect(
			levelled.querySelector('.sheetsmith-attribute-footnote')?.textContent,
		).toContain('"Proficient:"');
	});

	it('says a totalled key is a name, only where a column is totalled', () => {
		// Ticking the total is what turns a column heading into something the rest
		// of the sheet reads, and nothing else on the form would say so — the
		// component refuses a key that is not a name, and this is what keeps the
		// author from meeting that refusal by surprise.
		const plain = columnsEditor({ columns: [{ key: 'Weight', type: 'number' }] });
		expect(plain.querySelector('.sheetsmith-attribute-footnote')).toBeNull();
		const totalled = columnsEditor({
			columns: [{ key: 'Weight', type: 'number', total: true }],
		});
		expect(
			totalled.querySelector('.sheetsmith-attribute-footnote')?.textContent,
		).toContain('letters, digits and underscores');
	});

	it('writes the publish flag, and leaves it out until it is asked for', () => {
		const record: { columns: { key: string; type: string; publish?: boolean }[] } =
			{ columns: [{ key: 'Total', type: 'computed' }] };
		const el = columnsEditor(record);
		const check = Array.from(
			el.querySelectorAll('.sheetsmith-attribute-check'),
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
				columnsEditor(record).querySelectorAll('.sheetsmith-attribute-check'),
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
			el.querySelectorAll('.sheetsmith-attribute-check'),
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
		expect(plain.querySelector('.sheetsmith-attribute-footnote')).toBeNull();
		const publishing = columnsEditor({
			columns: [{ key: 'Total', type: 'computed', publish: true }],
		});
		expect(
			publishing.querySelector('.sheetsmith-attribute-footnote')?.textContent,
		).toContain('Give each row a key in the rows list above');
	});

	it('does not point at rings a dropdown never draws', () => {
		// The note tells the author to select a ring. A column drawing none
		// has nothing for that sentence to mean.
		const el = columnsEditor({
			columns: [{ key: 'Training', type: 'level', input: 'select' }],
		});
		expect(el.querySelector('.sheetsmith-attribute-footnote')).toBeNull();
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
		expect([...context.errors.values()][0]).toContain('"Acrobatics"');
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
	});
});
