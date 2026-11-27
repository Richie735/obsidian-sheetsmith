// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { NOTE_COLUMN_CLASS, NOTE_HEADING_CLASS, NOTE_MARK_CLASS, NOTE_TABLE_CLASS, reserveNoteSlots } from './note-mark';

/*
 * Which cells keep the note mark's slot (`reserveNoteSlots`), driven on a table
 * built by hand, since the rule is about positions across the head, the body
 * and the foot rather than about any one component's drawing
 * (`docs/features/table-row-end-room.md`, "The heading and the foot").
 */

afterEach(() => document.body.replaceChildren());

/**
 * A heading row, two body rows and a foot row over three columns: a name, a
 * value column whose first row holds a mark, and a value column holding none.
 */
function table(foot: 'value' | 'empty' = 'value') {
	const grid = document.body.createEl('table');
	const head = grid.createEl('thead').createEl('tr');
	head.createEl('th', { cls: 'sheetsmith-table-name', text: 'Skill' });
	head.createEl('th', { text: 'Total' });
	head.createEl('th', { text: 'Bonus' });
	const body = grid.createEl('tbody');
	for (const marked of [true, false]) {
		const tr = body.createEl('tr');
		tr.createEl('th', { cls: 'sheetsmith-table-name', text: 'Stealth' });
		const total = tr.createEl('td');
		total.createDiv({ cls: 'sheetsmith-table-value', text: '+5' });
		if (marked) total.createEl('button', { cls: NOTE_MARK_CLASS });
		tr.createEl('td').createDiv({ cls: 'sheetsmith-table-value', text: '0' });
	}
	const row = grid.createEl('tfoot').createEl('tr');
	row.createEl('th', { cls: 'sheetsmith-table-name', text: 'Total' });
	const total = row.createEl('td');
	if (foot === 'value') total.createDiv({ cls: 'sheetsmith-table-value', text: '9' });
	row.createEl('td');
	return grid;
}

const cellsAt = (grid: HTMLTableElement, section: string, at: number) =>
	Array.from(grid.querySelectorAll<HTMLTableRowElement>(`${section} tr`)).map(
		(tr) => tr.cells[at] as HTMLElement,
	);

describe('reserveNoteSlots', () => {
	it('stamps every body cell of a column holding a mark, and its heading', () => {
		const grid = table();
		reserveNoteSlots(grid);
		for (const cell of cellsAt(grid, 'tbody', 1)) expect(cell.classList.contains(NOTE_COLUMN_CLASS)).toBe(true);
		const [heading] = cellsAt(grid, 'thead', 1);
		expect(heading?.classList.contains(NOTE_HEADING_CLASS)).toBe(true);
		// The heading takes the heading's own class, never the cells', which a
		// value's rules read.
		expect(heading?.classList.contains(NOTE_COLUMN_CLASS)).toBe(false);
	});

	it('stamps the foot cell under a slotted column, a total or an empty one', () => {
		for (const foot of ['value', 'empty'] as const) {
			const grid = table(foot);
			reserveNoteSlots(grid);
			const [cell] = cellsAt(grid, 'tfoot', 1);
			expect(cell?.classList.contains(NOTE_COLUMN_CLASS)).toBe(true);
			grid.remove();
		}
	});

	it('leaves a column with no mark or door unstamped, head to foot', () => {
		const grid = table();
		reserveNoteSlots(grid);
		for (const section of ['thead', 'tbody', 'tfoot']) {
			for (const cell of cellsAt(grid, section, 2)) {
				expect(cell.classList.contains(NOTE_COLUMN_CLASS)).toBe(false);
				expect(cell.classList.contains(NOTE_HEADING_CLASS)).toBe(false);
			}
		}
		// Nor the name column, which holds the pinned cell.
		for (const section of ['thead', 'tbody', 'tfoot']) {
			for (const cell of cellsAt(grid, section, 0)) expect(cell.className).toBe('sheetsmith-table-name');
		}
	});

	it('counts a door given as alike, and stamps nothing on a table with neither', () => {
		const grid = table();
		grid.querySelector(`.${NOTE_MARK_CLASS}`)?.setAttribute('class', 'sheetsmith-state-door');
		reserveNoteSlots(grid);
		expect(grid.querySelector(`.${NOTE_COLUMN_CLASS}, .${NOTE_HEADING_CLASS}`)).toBeNull();
		reserveNoteSlots(grid, ['sheetsmith-state-door']);
		expect(cellsAt(grid, 'thead', 1)[0]?.classList.contains(NOTE_HEADING_CLASS)).toBe(true);
	});

	it('stamps the table while it holds a mark anywhere, a band head\'s included, and a door is not one', () => {
		// The class stands in for `:has(.sheetsmith-note-mark)` (`docs/PATTERNS.md`
		// §5), so it is held to exactly what that selector matched.
		const grid = table();
		reserveNoteSlots(grid, ['sheetsmith-state-door']);
		expect(grid.classList.contains(NOTE_TABLE_CLASS)).toBe(true);
		grid.remove();

		const doors = table();
		doors.querySelector(`.${NOTE_MARK_CLASS}`)?.setAttribute('class', 'sheetsmith-state-door');
		reserveNoteSlots(doors, ['sheetsmith-state-door']);
		expect(doors.classList.contains(NOTE_TABLE_CLASS)).toBe(false);

		// A mark in a band head, which no column walk reaches.
		const band = doors.createEl('tbody').createEl('tr').createEl('td');
		band.colSpan = 3;
		band.createDiv({ cls: 'sheetsmith-roster-band-inner' }).createEl('button', { cls: NOTE_MARK_CLASS });
		reserveNoteSlots(doors, ['sheetsmith-state-door']);
		expect(doors.classList.contains(NOTE_TABLE_CLASS)).toBe(true);
	});
});
