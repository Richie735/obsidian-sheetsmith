// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stat, StatConfig } from './stat';
import { FieldValue, RenderContext } from '../types';

const config: StatConfig = {
	id: 'armour-class',
	type: 'stat',
	label: 'Armour class',
	position: { col: 1, row: 1, width: 2, height: 1 },
	key: 'AC',
};

const BODY = '\n```sheet\nAC: 15\nnote: chain mail, shield\n```\n';

/**
 * Stub resolver behaving like "10 + value", including the engine's refusal
 * to hand back NaN or Infinity: a draft that is not a number fails to
 * resolve rather than resolving to nonsense.
 */
const tenPlus = (field: string, scope: Readonly<Record<string, FieldValue>>) => {
	if (field !== 'derived' || typeof scope.value !== 'string') return null;
	const parsed = Number(scope.value);
	return Number.isFinite(parsed) ? 10 + parsed : null;
};

const context: RenderContext = {
	resolved: {},
	resolveField: tenPlus,
	onChange: () => undefined,
};

const render = (
	overrides: Partial<StatConfig> = {},
	data: { value?: string; note?: string } | null = { value: '15' },
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	stat.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
};

const inputs = (el: HTMLElement) => ({
	value: el.querySelector<HTMLInputElement>('.sheetsmith-stat-input'),
	note: el.querySelector<HTMLInputElement>('.sheetsmith-stat-note-input'),
});

describe('stat.read', () => {
	it('reads the value under the configured key, and the note', () => {
		expect(stat.read(BODY, config)).toEqual({
			ok: true,
			data: { value: '15', note: 'chain mail, shield' },
		});
	});

	it('defaults to the "value" key when the layout names none', () => {
		const { key: _key, ...unkeyed } = config;
		expect(stat.read('\n```sheet\nvalue: 30\n```\n', unkeyed as StatConfig)).toEqual({
			ok: true,
			data: { value: '30' },
		});
	});

	it('treats a section with no sheet block as empty, not malformed', () => {
		expect(stat.read('\nProse only.\n', config)).toEqual({
			ok: true,
			data: null,
		});
	});

	it('reports a key it cannot store, rather than writing a broken block', () => {
		for (const key of ['a: b', 'note']) {
			const result = stat.read(BODY, { ...config, key });
			expect(result.ok).toBe(false);
		}
	});

	it('leaves entries under other keys alone', () => {
		const body = '\n```sheet\nAC: 15\nLUCK: 3\n```\n';
		const read = stat.read(body, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(stat.write(read.data, body, config)).toBe(body);
	});
});

describe('stat.write', () => {
	it('round-trips unchanged data byte for byte', () => {
		const read = stat.read(BODY, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(stat.write(read.data, BODY, config)).toBe(BODY);
	});

	it('rewrites only the field the edit reported', () => {
		expect(stat.write({ value: '17' }, BODY, config)).toBe(
			BODY.replace('AC: 15', 'AC: 17'),
		);
		expect(stat.write({ note: 'plate' }, BODY, config)).toBe(
			BODY.replace('note: chain mail, shield', 'note: plate'),
		);
	});

	it('creates a fresh section body when none exists', () => {
		expect(stat.write({ value: '15' }, null, config)).toBe(
			'\n```sheet\nAC: 15\n```\n',
		);
	});
});

describe('stat.render', () => {
	it('shows the label, the value, and the note', () => {
		const el = render({}, { value: '15', note: 'chain mail' });
		expect(el.querySelector('.sheetsmith-stat-label')?.textContent).toBe(
			'Armour class',
		);
		expect(inputs(el).value?.value).toBe('15');
		expect(inputs(el).note?.value).toBe('chain mail');
	});

	it('never shows the key, and reserves no slot for it', () => {
		const el = render();
		expect(el.textContent).not.toContain('AC');
		expect(el.querySelector('.sheetsmith-stat-abbreviation')).toBeNull();
	});

	it('hides the label on request, keeping it as the accessible name', () => {
		const el = render({ hideLabel: true });
		expect(el.querySelector('.sheetsmith-stat-label')).toBeNull();
		expect(inputs(el).value?.getAttribute('aria-label')).toBe('Armour class');
	});

	it('computes the derived value, and updates it live while typing', () => {
		const el = render({ derived: '10 + value' });
		const derived = el.querySelector('.sheetsmith-stat-derived');
		expect(derived?.textContent).toBe('+25');
		const value = inputs(el).value as HTMLInputElement;
		value.value = '5';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('+15');
	});

	it('shows an empty value as a blank, not a broken formula', () => {
		const el = render({ derived: '10 + value' }, null);
		const derived = el.querySelector('.sheetsmith-stat-derived');
		expect(derived?.textContent).toBe('—');
		expect(
			derived?.classList.contains('sheetsmith-stat-derived-unresolved'),
		).toBe(false);
	});

	it('reports each field as its own delta, never a snapshot', () => {
		const edits: unknown[] = [];
		const el = render({}, { value: '15', note: 'chain mail' }, {
			onChange: (data) => edits.push(data),
		});
		const { value, note } = inputs(el);
		(value as HTMLInputElement).value = '17';
		value?.dispatchEvent(new Event('blur'));
		(note as HTMLInputElement).value = 'plate';
		note?.dispatchEvent(new Event('blur'));
		expect(edits).toEqual([{ value: '17' }, { note: 'plate' }]);
	});

	it('commits an emptied note as a clear, not as no change', () => {
		const edits: unknown[] = [];
		const el = render({}, { value: '15', note: 'chain mail' }, {
			onChange: (data) => edits.push(data),
		});
		const note = inputs(el).note as HTMLInputElement;
		note.value = '';
		note.dispatchEvent(new Event('blur'));
		expect(edits).toEqual([{ note: '' }]);
	});

	it('does not commit either field when nothing changed', () => {
		const edits: unknown[] = [];
		const el = render({}, { value: '15', note: 'chain mail' }, {
			onChange: (data) => edits.push(data),
		});
		const { value, note } = inputs(el);
		value?.dispatchEvent(new Event('blur'));
		note?.dispatchEvent(new Event('blur'));
		expect(edits).toEqual([]);
	});

	it('restores the note on Escape without reporting an edit', () => {
		const edits: unknown[] = [];
		const el = render({}, { value: '15', note: 'chain mail' }, {
			onChange: (data) => edits.push(data),
		});
		const note = inputs(el).note as HTMLInputElement;
		note.value = 'plate';
		note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(note.value).toBe('chain mail');
		expect(edits).toEqual([]);
	});

	it('steps the value with arrow keys, but leaves the note alone', () => {
		const el = render({}, { value: '15', note: '20' });
		const { value, note } = inputs(el);
		value?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(value?.value).toBe('16');
		note?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(note?.value).toBe('20');
	});

	it('hides the note line on request', () => {
		expect(inputs(render({ hideNote: true })).note).toBeNull();
	});

	it('shows the note hint while the note is empty', () => {
		expect(inputs(render({ notePlaceholder: 'ft.' })).note?.placeholder).toBe(
			'ft.',
		);
	});

	it('hides the value only when a derived remains to show', () => {
		expect(inputs(render({ hideValue: true })).value).not.toBeNull();
		expect(
			inputs(render({ hideValue: true, derived: '10 + value' })).value,
		).toBeNull();
	});

	it('reports a key it cannot store, even with no section to read', () => {
		const el = render({ key: 'note' }, null);
		expect(el.querySelector('.sheetsmith-error')).not.toBeNull();
		expect(el.querySelector('.sheetsmith-stat')).toBeNull();
	});

	it('promises an edit only when it has one to give', () => {
		const editable = (el: HTMLElement) =>
			el
				.querySelector('.sheetsmith-stat')
				?.classList.contains('sheetsmith-stat-editable');
		expect(editable(render())).toBe(true);
		// No value and no note: the card is a read-only display, and must
		// not wear a text cursor over a hit target that does nothing.
		expect(
			editable(render({ hideNote: true, hideValue: true, derived: '10 + value' })),
		).toBe(false);
	});

	it('drops the em dash placeholder when a derived already shows one', () => {
		expect(inputs(render({}, null)).value?.placeholder).toBe('—');
		expect(inputs(render({ derived: '10 + value' }, null)).value?.placeholder).toBe(
			'',
		);
	});
});

describe('stat.render: drafts in flight', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('holds the last resolved display while a draft cannot resolve', () => {
		vi.useFakeTimers();
		const el = render({ derived: '10 + value' });
		const derived = el.querySelector('.sheetsmith-stat-derived');
		const value = inputs(el).value as HTMLInputElement;
		expect(derived?.textContent).toBe('+25');

		// "-" on the way to "-1" is not wrong yet, so it earns no warning.
		value.value = '-';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('+25');
		expect(
			derived?.classList.contains('sheetsmith-stat-derived-unresolved'),
		).toBe(false);

		// Finish the number before the delay is up: nothing ever flashed.
		vi.advanceTimersByTime(200);
		value.value = '-1';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('+9');
		vi.advanceTimersByTime(1000);
		expect(derived?.textContent).toBe('+9');
	});

	it('shows the unresolved glyph once a bad draft settles', () => {
		vi.useFakeTimers();
		const el = render({ derived: '10 + value' }, { value: '15' }, {
			resolveField: () => null,
		});
		const derived = el.querySelector('.sheetsmith-stat-derived');
		const value = inputs(el).value as HTMLInputElement;
		value.value = 'wat';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('?');

		vi.advanceTimersByTime(300);
		expect(derived?.textContent).toBe('?');
		expect(
			derived?.classList.contains('sheetsmith-stat-derived-unresolved'),
		).toBe(true);
	});

	it('settles the display before quoting it in the commit announcement', () => {
		vi.useFakeTimers();
		const el = render({ derived: '10 + value' }, { value: '15' }, {
			resolveField: () => null,
		});
		const value = inputs(el).value as HTMLInputElement;
		value.value = 'wat';
		value.dispatchEvent(new Event('input'));
		// Commit while the unresolved display is still being held back.
		value.dispatchEvent(new Event('blur'));
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Armour class wat, ?',
		);
	});
});

describe('stat.render: keyboard', () => {
	const press = (input: HTMLInputElement, key: string, shiftKey = false) =>
		input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey }));

	it('steps an empty value from zero rather than doing nothing', () => {
		const el = render({}, null);
		const value = inputs(el).value as HTMLInputElement;
		press(value, 'ArrowUp');
		expect(value.value).toBe('1');
	});

	it('steps by ten with shift, for the stats that move in tens', () => {
		const el = render();
		const value = inputs(el).value as HTMLInputElement;
		press(value, 'ArrowUp', true);
		expect(value.value).toBe('25');
		press(value, 'ArrowDown', true);
		expect(value.value).toBe('15');
	});

	it('leaves the arrows as caret movement on text that is not a number', () => {
		const el = render({}, { value: 'see below' });
		const value = inputs(el).value as HTMLInputElement;
		press(value, 'ArrowUp');
		expect(value.value).toBe('see below');
	});

	it('commits on Enter and advances to the note, keeping focus on the card', () => {
		const edits: unknown[] = [];
		const el = render({}, { value: '15', note: 'chain mail' }, {
			onChange: (data) => edits.push(data),
		});
		const { value, note } = inputs(el);
		const focused: string[] = [];
		if (note) note.focus = () => focused.push('note');
		(value as HTMLInputElement).value = '17';
		press(value as HTMLInputElement, 'Enter');
		expect(edits).toEqual([{ value: '17' }]);
		expect(focused).toEqual(['note']);
	});

	it('announces an Escape restore, since a silent undo reads as nothing', () => {
		const el = render({}, { value: '15', note: 'chain mail' });
		const value = inputs(el).value as HTMLInputElement;
		value.value = '99';
		press(value, 'Escape');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Armour class restored to 15',
		);
	});

	it('stays silent on an Escape that abandoned nothing', () => {
		const el = render();
		press(inputs(el).value as HTMLInputElement, 'Escape');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe('');
	});
});

describe('stat.render: hit target', () => {
	/** happy-dom reports zero rects; the card routes clicks by geometry. */
	const stubRect = (el: HTMLElement, top: number, height: number) => {
		el.getBoundingClientRect = () => ({
			top,
			height,
			bottom: top + height,
			left: 0,
			right: 0,
			width: 0,
			x: 0,
			y: top,
			toJSON: () => ({}),
		});
	};

	it('routes a click to the nearest field, not always to the value', () => {
		const el = render({}, { value: '15', note: 'chain mail' });
		const card = el.querySelector('.sheetsmith-stat') as HTMLElement;
		const { value, note } = inputs(el);
		if (!value || !note) throw new Error('expected both fields');
		stubRect(value, 0, 20);
		stubRect(note, 40, 20);
		const focused: string[] = [];
		value.focus = () => focused.push('value');
		note.focus = () => focused.push('note');

		// Padding below the note belongs to the note, not to the number at
		// the top of the card.
		card.dispatchEvent(new MouseEvent('click', { clientY: 70 }));
		card.dispatchEvent(new MouseEvent('click', { clientY: 5 }));
		expect(focused).toEqual(['note', 'value']);
	});
});

describe('stat contract', () => {
	it('declares fenced storage, formula fields, and config fields', () => {
		expect(stat.storage).toBe('fenced');
		expect(stat.formulaFields).toEqual(['derived']);
		expect(stat.configFields.map((field) => field.key)).toEqual([
			'key',
			'derived',
			'notePlaceholder',
			'hideLabel',
			'hideValue',
			'hideNote',
			'signed',
		]);
	});
});
