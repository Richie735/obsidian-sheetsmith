// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { card, CardConfig, CardOption } from './card';
import {
	FieldValue,
	ModifierBreakdown,
	ModifierOutcome,
	RenderContext,
} from '../types';

const config: CardConfig = {
	id: 'armour-class',
	type: 'card',
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
	overrides: Partial<CardConfig> = {},
	data: { value?: string; note?: string } | null = { value: '15' },
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	card.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
};

const inputs = (el: HTMLElement) => ({
	value: el.querySelector<HTMLInputElement>('.sheetsmith-card-input'),
	note: el.querySelector<HTMLInputElement>('.sheetsmith-card-note-input'),
});

describe('card.read', () => {
	it('reads the value under the configured key, and the note', () => {
		expect(card.read(BODY, config)).toEqual({
			ok: true,
			data: { value: '15', note: 'chain mail, shield' },
		});
	});

	it('defaults to the "value" key when the layout names none', () => {
		const { key: _key, ...unkeyed } = config;
		expect(card.read('\n```sheet\nvalue: 30\n```\n', unkeyed as CardConfig)).toEqual({
			ok: true,
			data: { value: '30' },
		});
	});

	it('treats a section with no sheet block as empty, not malformed', () => {
		expect(card.read('\nProse only.\n', config)).toEqual({
			ok: true,
			data: null,
		});
	});

	it('reports a key it cannot store, rather than writing a broken block', () => {
		for (const key of ['a: b', 'note']) {
			const result = card.read(BODY, { ...config, key });
			expect(result.ok).toBe(false);
		}
	});

	it('leaves entries under other keys alone', () => {
		const body = '\n```sheet\nAC: 15\nLUCK: 3\n```\n';
		const read = card.read(body, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(card.write(read.data, body, config)).toBe(body);
	});
});

describe('card.write', () => {
	it('round-trips unchanged data byte for byte', () => {
		const read = card.read(BODY, config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(card.write(read.data, BODY, config)).toBe(BODY);
	});

	it('rewrites only the field the edit reported', () => {
		expect(card.write({ value: '17' }, BODY, config)).toBe(
			BODY.replace('AC: 15', 'AC: 17'),
		);
		expect(card.write({ note: 'plate' }, BODY, config)).toBe(
			BODY.replace('note: chain mail, shield', 'note: plate'),
		);
	});

	it('creates a fresh section body when none exists', () => {
		expect(card.write({ value: '15' }, null, config)).toBe(
			'\n```sheet\nAC: 15\n```\n',
		);
	});
});

describe('card.render', () => {
	it('shows the label, the value, and the note', () => {
		const el = render({}, { value: '15', note: 'chain mail' });
		expect(el.querySelector('.sheetsmith-card-label')?.textContent).toBe(
			'Armour class',
		);
		expect(inputs(el).value?.value).toBe('15');
		expect(inputs(el).note?.value).toBe('chain mail');
	});

	it('never shows the key, and reserves no slot for it', () => {
		const el = render();
		expect(el.textContent).not.toContain('AC');
		expect(el.querySelector('.sheetsmith-card-abbreviation')).toBeNull();
	});

	it('hides the label on request, keeping it as the accessible name', () => {
		const el = render({ hideLabel: true });
		expect(el.querySelector('.sheetsmith-card-label')).toBeNull();
		expect(inputs(el).value?.getAttribute('aria-label')).toBe('Armour class');
	});

	it('computes the derived value, and updates it live while typing', () => {
		const el = render({ derived: '10 + value' });
		const derived = el.querySelector('.sheetsmith-card-derived');
		expect(derived?.textContent).toBe('+25');
		const value = inputs(el).value as HTMLInputElement;
		value.value = '5';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('+15');
	});

	it('shows an empty value as a blank, not a broken formula', () => {
		const el = render({ derived: '10 + value' }, null);
		const derived = el.querySelector('.sheetsmith-card-derived');
		expect(derived?.textContent).toBe('—');
		expect(
			derived?.classList.contains('sheetsmith-card-derived-unresolved'),
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
		expect(el.querySelector('.sheetsmith-card')).toBeNull();
	});

	it('promises an edit only when it has one to give', () => {
		const editable = (el: HTMLElement) =>
			el
				.querySelector('.sheetsmith-card')
				?.classList.contains('sheetsmith-card-editable');
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

describe('card.render: drafts in flight', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('holds the last resolved display while a draft cannot resolve', () => {
		vi.useFakeTimers();
		const el = render({ derived: '10 + value' });
		const derived = el.querySelector('.sheetsmith-card-derived');
		const value = inputs(el).value as HTMLInputElement;
		expect(derived?.textContent).toBe('+25');

		// "-" on the way to "-1" is not wrong yet, so it earns no warning.
		value.value = '-';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('+25');
		expect(
			derived?.classList.contains('sheetsmith-card-derived-unresolved'),
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
		const derived = el.querySelector('.sheetsmith-card-derived');
		const value = inputs(el).value as HTMLInputElement;
		value.value = 'wat';
		value.dispatchEvent(new Event('input'));
		expect(derived?.textContent).toBe('?');

		vi.advanceTimersByTime(300);
		expect(derived?.textContent).toBe('?');
		expect(
			derived?.classList.contains('sheetsmith-card-derived-unresolved'),
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

describe('card.render: keyboard', () => {
	const pressKey = (input: HTMLInputElement, key: string, shiftKey = false) =>
		input.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey }));

	it('steps an empty value from zero rather than doing nothing', () => {
		const el = render({}, null);
		const value = inputs(el).value as HTMLInputElement;
		pressKey(value, 'ArrowUp');
		expect(value.value).toBe('1');
	});

	it('steps by ten with shift, for the numbers that move in tens', () => {
		const el = render();
		const value = inputs(el).value as HTMLInputElement;
		pressKey(value, 'ArrowUp', true);
		expect(value.value).toBe('25');
		pressKey(value, 'ArrowDown', true);
		expect(value.value).toBe('15');
	});

	it('leaves the arrows as caret movement on text that is not a number', () => {
		const el = render({}, { value: 'see below' });
		const value = inputs(el).value as HTMLInputElement;
		pressKey(value, 'ArrowUp');
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
		pressKey(value as HTMLInputElement, 'Enter');
		expect(edits).toEqual([{ value: '17' }]);
		expect(focused).toEqual(['note']);
	});

	it('announces an Escape restore, since a silent undo reads as nothing', () => {
		const el = render({}, { value: '15', note: 'chain mail' });
		const value = inputs(el).value as HTMLInputElement;
		value.value = '99';
		pressKey(value, 'Escape');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
			'Armour class restored to 15',
		);
	});

	it('stays silent on an Escape that abandoned nothing', () => {
		const el = render();
		pressKey(inputs(el).value as HTMLInputElement, 'Escape');
		expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe('');
	});
});

describe('card.render: hit target', () => {
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
		const card = el.querySelector('.sheetsmith-card') as HTMLElement;
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

describe('card.render: a menu takes the whole card as its hit target', () => {
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

	const races: CardConfig = {
		...config,
		key: 'race',
		options: [{ value: 'Elf' }, { value: 'Dwarf' }],
	};

	it('opens the menu on a press the card routed to it', () => {
		// A field only needed focus, because focus on an input *is* the edit
		// gesture. Focus on a select shows a ring on a desktop and nothing at
		// all under a finger, so the card's own hit target was answering with
		// silence — and a menu's box is only as wide as the chosen option, so
		// that target is a fraction of the same card as a field (docs/UI.md §7).
		const el = render(races, { value: 'Elf', note: 'ancestry' });
		const card = el.querySelector('.sheetsmith-card') as HTMLElement;
		const menu = el.querySelector('select') as HTMLSelectElement;
		const note = el.querySelector('.sheetsmith-card-note-input') as HTMLInputElement;
		stubRect(menu, 0, 20);
		stubRect(note, 40, 20);
		const acted: string[] = [];
		menu.focus = () => acted.push('focus');
		menu.showPicker = () => acted.push('picker');

		card.dispatchEvent(new MouseEvent('click', { clientY: 5 }));
		// Focused as well, so a dismissed picker leaves the keyboard where the
		// press aimed it.
		expect(acted).toEqual(['focus', 'picker']);
	});

	it('falls back to focus where the platform refuses the picker', () => {
		const el = render(races, { value: 'Elf' });
		const card = el.querySelector('.sheetsmith-card') as HTMLElement;
		const menu = el.querySelector('select') as HTMLSelectElement;
		stubRect(menu, 0, 20);
		const acted: string[] = [];
		menu.focus = () => acted.push('focus');
		menu.showPicker = () => {
			throw new Error('NotAllowedError');
		};
		expect(() =>
			card.dispatchEvent(new MouseEvent('click', { clientY: 5 })),
		).not.toThrow();
		expect(acted).toEqual(['focus']);
	});

	it('leaves a press nearest the note as a press on the note', () => {
		// The routing still means what it meant: proximity picks the control,
		// and only a menu gets the second half.
		const el = render(races, { value: 'Elf', note: 'ancestry' });
		const card = el.querySelector('.sheetsmith-card') as HTMLElement;
		const menu = el.querySelector('select') as HTMLSelectElement;
		const note = el.querySelector('.sheetsmith-card-note-input') as HTMLInputElement;
		stubRect(menu, 0, 20);
		stubRect(note, 40, 20);
		const acted: string[] = [];
		note.focus = () => acted.push('note');
		menu.showPicker = () => acted.push('picker');

		card.dispatchEvent(new MouseEvent('click', { clientY: 70 }));
		expect(acted).toEqual(['note']);
	});
});

describe('card.scopeValues', () => {
	it('publishes its stored value under the bare component id', () => {
		expect(card.scopeValues?.({ value: '18' }, config)).toEqual({
			self: { value: '18', display: undefined },
		});
	});

	it('publishes the derived display when the card computes one', () => {
		const published = card.scopeValues?.(
			{ value: '18' },
			{ ...config, derived: '10 + value' },
		);
		// The reference gets what the card shows; the scope builder runs it.
		expect(published?.self?.display).toEqual({
			field: 'derived',
			scope: { value: '18' },
		});
		expect(published?.self?.value).toBe('18');
	});

	it('publishes nothing it cannot store, and nothing it does not have', () => {
		expect(card.scopeValues?.(null, config)?.self?.value).toBeUndefined();
		expect(card.scopeValues?.({ value: '18' }, { ...config, key: 'note' })).toEqual(
			{},
		);
	});

	it('does not publish the note: prose is not a value to compute with', () => {
		const published = card.scopeValues?.({ value: '18', note: 'plate' }, config);
		expect(JSON.stringify(published)).not.toContain('plate');
	});
});

describe('card.render: computed from elsewhere on the sheet', () => {
	// "AC is 10 + the Dex modifier": nothing stored on this card at all.
	const computed: CardConfig = {
		...config,
		derived: '10 + floor((abilities.DEX - 10) / 2)',
		signed: false,
		hideValue: true,
	};
	// Stands in for the sheet scope the view builds from every component.
	const fromSheet = (_field: string, _scope: Readonly<Record<string, FieldValue>>) =>
		16;

	it('shows the number with no value of its own to compute from', () => {
		const el = render(computed, null, { resolveField: fromSheet });
		expect(el.querySelector('.sheetsmith-card-derived')?.textContent).toBe('16');
		// A computed value is read-only (SPEC §5); there is no field to edit.
		expect(inputs(el).value).toBeNull();
	});

	it('does not blank a formula that never reads its own value', () => {
		// The em dash means "nothing here to compute from". A formula that
		// reads only other components is not waiting on this card, so it
		// must not be blanked by an empty one.
		const el = render(computed, { value: '' }, { resolveField: fromSheet });
		expect(el.querySelector('.sheetsmith-card-derived')?.textContent).toBe('16');
	});

	it('still blanks a formula that does read its own empty value', () => {
		const el = render({ ...computed, derived: '10 + value' }, null, {
			resolveField: fromSheet,
		});
		expect(el.querySelector('.sheetsmith-card-derived')?.textContent).toBe('—');
	});
});

describe('card.render: why a formula failed', () => {
	const broken: Partial<CardConfig> = { derived: 'mod(value, 2)' };
	const failing = () => null;

	it('hovers the reason, not the fact', () => {
		// The engine's messages are the payoff of a formula library —
		// "mod() takes 1 argument, got 2" is a next action. A card that only
		// says "did not resolve" throws that away at the last step.
		const el = render(broken, { value: '15' }, {
			resolveField: failing,
			explainField: () => 'mod() takes 1 argument, got 2.',
		});
		const derived = el.querySelector('.sheetsmith-card-derived');
		expect(derived?.textContent).toBe('?');
		expect(derived?.getAttribute('title')).toBe('mod() takes 1 argument, got 2.');
	});

	it('falls back when nothing can explain it', () => {
		const el = render(broken, { value: '15' }, { resolveField: failing });
		expect(el.querySelector('.sheetsmith-card-derived')?.getAttribute('title')).toBe(
			'The formula did not resolve.',
		);
	});

	it('asks for no explanation while the formula resolves', () => {
		let asked = 0;
		const el = render({ derived: '10 + value' }, { value: '5' }, {
			explainField: () => {
				asked++;
				return 'never';
			},
		});
		expect(asked).toBe(0);
		expect(el.querySelector('.sheetsmith-card-derived')?.hasAttribute('title')).toBe(
			false,
		);
	});
});

describe('card contract', () => {
	it('declares fenced storage, formula fields, and config fields', () => {
		expect(card.storage).toBe('fenced');
		expect(card.formulaFields).toEqual(['derived']);
		expect(card.configFields.map((field) => field.key)).toEqual([
			'key',
			'options',
			'derived',
			'notePlaceholder',
			'hideLabel',
			'hideValue',
			'hideNote',
			'signed',
		]);
	});
});

/*
 * A card whose layout declares options (SPEC §4.2). The whole feature is a
 * control and a config key: nothing in `read`, `write` or the note changes, so
 * what these drive is the menu, what a choice stores, and the one case the
 * prior art documents nowhere — a stored value the layout no longer offers.
 */
describe('card.render: a value chosen from a list', () => {
	const races: CardConfig = {
		...config,
		key: 'race',
		options: [{ value: 'Elf' }, { value: 'Dwarf' }, { value: 'Half-elf' }],
	};

	const menu = (el: HTMLElement) =>
		el.querySelector<HTMLSelectElement>('.sheetsmith-card-select');

	/** Every line of the menu, in the order the reader meets them. */
	const lines = (el: HTMLElement) =>
		Array.from(menu(el)?.options ?? []).map((option) => [
			option.value,
			option.textContent,
		]);

	const choose = (el: HTMLElement, value: string) => {
		const select = menu(el) as HTMLSelectElement;
		select.value = value;
		select.dispatchEvent(new Event('change'));
	};

	it('draws a menu in the value slot, and no field', () => {
		const el = render(races, { value: 'Elf' });
		expect(menu(el)).not.toBeNull();
		expect(inputs(el).value).toBeNull();
		// The slot is the same one, so the card's typography and the pill
		// treatment reach the menu without a second layout.
		expect(menu(el)?.parentElement?.classList.contains('sheetsmith-card-value')).toBe(
			true,
		);
	});

	it('offers the em dash first, then the layout\'s options in its order', () => {
		expect(lines(render(races, { value: 'Elf' }))).toEqual([
			['', '—'],
			['Elf', 'Elf'],
			['Dwarf', 'Dwarf'],
			['Half-elf', 'Half-elf'],
		]);
	});

	it('shows a label where an option has one, and its value where it has none', () => {
		const training: CardConfig = {
			...config,
			options: [{ value: '0', label: 'Untrained' }, { value: '2' }],
		};
		expect(lines(render(training, null))).toEqual([
			['', '—'],
			['0', 'Untrained'],
			// A blank label is not an error: it shows the value, which is the
			// default and the ordinary case.
			['2', '2'],
		]);
	});

	it('stores the chosen option\'s value, not its label and not its index', () => {
		const edits: unknown[] = [];
		const el = render(
			{ ...config, options: [{ value: '0', label: 'Untrained' }, { value: '2', label: 'Expertise' }] },
			null,
			{ onChange: (data) => edits.push(data) },
		);
		choose(el, '2');
		expect(edits).toEqual([{ value: '2' }]);
	});

	it('clears the value when the em dash is chosen', () => {
		const edits: unknown[] = [];
		const el = render(races, { value: 'Elf' }, {
			onChange: (data) => edits.push(data),
		});
		choose(el, '');
		expect(edits).toEqual([{ value: '' }]);
	});

	it('selects the em dash with nothing stored, and writes nothing to say so', () => {
		const edits: unknown[] = [];
		const el = render(races, null, { onChange: (data) => edits.push(data) });
		expect(menu(el)?.value).toBe('');
		// No option is a default: rendering an unset card must not write one,
		// which is the trap this control is best known for.
		expect(edits).toEqual([]);
	});

	it('publishes nothing while nothing is chosen', () => {
		expect(card.scopeValues?.(null, races)?.self?.value).toBeUndefined();
	});

	it('publishes the stored value, which is what a formula reads', () => {
		// Never the label: the layout wrote the mapping down, so the value is
		// the meaning and the label is its presentation (SPEC §5).
		const published = card.scopeValues?.({ value: '2' }, {
			...config,
			options: [{ value: '2', label: 'Expertise' }],
		});
		expect(published?.self?.value).toBe('2');
		expect(JSON.stringify(published)).not.toContain('Expertise');
	});

	it('keeps one tab stop for the value, named by the card\'s label', () => {
		const el = render(races, { value: 'Elf' });
		expect(el.querySelectorAll('select, input')).toHaveLength(
			// The menu and the note line, exactly as the field and the note.
			2,
		);
		expect(menu(el)?.getAttribute('aria-label')).toBe('Armour class');
	});
});

describe('card.render: a stored value the layout no longer offers', () => {
	const races: CardConfig = {
		...config,
		key: 'race',
		options: [{ value: 'Elf' }, { value: 'Dwarf' }],
	};
	const STRAY = '\n```sheet\nrace: Tiefling\n```\n';

	const menu = (el: HTMLElement) =>
		el.querySelector<HTMLSelectElement>('.sheetsmith-card-select');

	it('carries it as the last line, selected, and says what it is', () => {
		const el = render(races, { value: 'Tiefling' });
		const options = Array.from(menu(el)?.options ?? []);
		expect(options.map((option) => option.value)).toEqual([
			'',
			'Elf',
			'Dwarf',
			'Tiefling',
		]);
		expect(menu(el)?.value).toBe('Tiefling');
		// `title` rather than `aria-label`: the control's visible content is
		// words, so the explanation adds to the name (docs/UI.md §6).
		expect(menu(el)?.getAttribute('title')).toContain('Not one of this card\'s options');
		expect(menu(el)?.hasAttribute('aria-label')).toBe(true);
	});

	it('renders it rather than correcting it, and rewrites no note', () => {
		const edits: unknown[] = [];
		render(races, { value: 'Tiefling' }, { onChange: (data) => edits.push(data) });
		expect(edits).toEqual([]);
		const read = card.read(STRAY, races);
		if (!read.ok || read.data === null) throw new Error('expected data');
		expect(card.write(read.data, STRAY, races)).toBe(STRAY);
	});

	it('drops the line as soon as anything else is chosen', () => {
		const el = render(races, { value: 'Tiefling' });
		const select = menu(el) as HTMLSelectElement;
		select.value = 'Elf';
		select.dispatchEvent(new Event('change'));
		expect(Array.from(select.options).map((option) => option.value)).toEqual([
			'',
			'Elf',
			'Dwarf',
		]);
		expect(select.hasAttribute('title')).toBe(false);
	});

	it('matches exactly: a stored "elf" is not the option "Elf"', () => {
		// Table's claim rule is case-insensitive because it matches a row name
		// a human typed into a note. An option's value is layout configuration,
		// and forgiving case here would let two options differing only in case
		// both claim one stored value.
		const el = render(races, { value: 'elf' });
		expect(Array.from(menu(el)?.options ?? []).map((o) => o.value)).toEqual([
			'',
			'Elf',
			'Dwarf',
			'elf',
		]);
		expect(menu(el)?.value).toBe('elf');
	});

	it('leaves the stored value untouched through every edit to the list', () => {
		// The five edits an author can make, minus the one that changes nothing
		// about this note: renaming a label. None of them writes.
		const stored = '\n```sheet\nrace: Dwarf\n```\n';
		const lists: Record<string, CardOption[]> = {
			reordered: [{ value: 'Dwarf' }, { value: 'Elf' }],
			added: [{ value: 'Elf' }, { value: 'Dwarf' }, { value: 'Gnome' }],
			renamed: [{ value: 'Elf' }, { value: 'Dwarven' }],
			deleted: [{ value: 'Elf' }],
		};
		for (const [edit, options] of Object.entries(lists)) {
			const after = { ...races, options };
			const read = card.read(stored, after);
			if (!read.ok || read.data === null) throw new Error('expected data');
			expect(read.data.value, edit).toBe('Dwarf');
			expect(card.write(read.data, stored, after), edit).toBe(stored);
		}
	});
});

describe('card.render: a menu under a derived', () => {
	const training: CardConfig = {
		...config,
		key: 'training',
		derived: '10 + value',
		options: [
			{ value: '0', label: 'Untrained' },
			{ value: '2', label: 'Expertise' },
		],
	};

	const menu = (el: HTMLElement) =>
		el.querySelector<HTMLSelectElement>('.sheetsmith-card-select');

	it('reads the stored value as "value", and recomputes on the change', () => {
		const el = render(training, { value: '0' });
		const derived = el.querySelector('.sheetsmith-card-derived');
		expect(derived?.textContent).toBe('+10');
		const select = menu(el) as HTMLSelectElement;
		select.value = '2';
		select.dispatchEvent(new Event('change'));
		// A menu has no draft, so there is nothing to hold back: the number
		// settles with the choice.
		expect(derived?.textContent).toBe('+12');
	});

	it('blanks on an empty value, exactly as a text card does', () => {
		const el = render(training, null);
		expect(el.querySelector('.sheetsmith-card-derived')?.textContent).toBe('—');
	});

	it('shows the card one em dash, not two', () => {
		// The field drops its placeholder where a derived owns the headline, or
		// the card draws the same nothing twice and the smaller copy is the
		// control. The menu takes the same branch: the line stays, because it is
		// what clears the value, and the chevron is what says it is a menu.
		const el = render(training, null);
		expect(menu(el)?.value).toBe('');
		expect(Array.from(menu(el)?.options ?? []).map((o) => o.textContent)).toEqual([
			'',
			'Untrained',
			'Expertise',
		]);
		// One em dash on the card, and it is the headline.
		expect(el.textContent?.match(/—/g) ?? []).toHaveLength(1);
	});

	it('keeps the em dash on a card with no derived to own the headline', () => {
		const { derived: _derived, ...plain } = training;
		const el = render(plain, null);
		expect(
			Array.from(
				el.querySelector<HTMLSelectElement>('.sheetsmith-card-select')?.options ?? [],
			).map((option) => option.textContent),
		).toEqual(['—', 'Untrained', 'Expertise']);
	});

	it('hides the menu with the value, since the trade is the field\'s own', () => {
		expect(menu(render({ ...training, hideValue: true }, { value: '2' }))).toBeNull();
	});
});

describe('card.render: an options list that cannot be a menu', () => {
	it('reports an option with no value, on that card alone', () => {
		const el = render({ ...config, options: [{ value: 'Elf' }, { value: ' ' }] }, null);
		expect(el.querySelector('.sheetsmith-error')?.textContent).toContain(
			'Every option needs a value',
		);
		expect(el.querySelector('.sheetsmith-card')).toBeNull();
	});

	it('reports two options sharing a value, which no select could tell apart', () => {
		const el = render(
			{
				...config,
				options: [
					{ value: '2', label: 'Proficient' },
					{ value: '2', label: 'Expertise' },
				],
			},
			null,
		);
		expect(el.querySelector('.sheetsmith-error')?.textContent).toContain(
			'Two options share the value "2"',
		);
	});

	it('publishes nothing it cannot draw', () => {
		// Both faults, because both reach the same guard and only one of them
		// was ever driven through it: a card that cannot draw its own control
		// must not publish a name the sheet is then built on.
		expect(
			card.scopeValues?.({ value: '2' }, {
				...config,
				options: [{ value: '2' }, { value: '2' }],
			}),
		).toEqual({});
		expect(
			card.scopeValues?.({ value: 'Elf' }, {
				...config,
				options: [{ value: 'Elf' }, { value: ' ' }],
			}),
		).toEqual({});
	});

	it('trims a declared value, so a card can round-trip its own choice', () => {
		// `readFenced` trims, so an option carrying surrounding space could
		// never match a stored value — and choosing it would write a value that
		// came back as a stray on the very next render.
		const el = render({ ...config, options: [{ value: ' Elf ' }] }, { value: 'Elf' });
		const menu = el.querySelector<HTMLSelectElement>('.sheetsmith-card-select');
		expect(Array.from(menu?.options ?? []).map((option) => option.value)).toEqual([
			'',
			'Elf',
		]);
		// Matched, so there is no stray line and nothing to explain.
		expect(menu?.value).toBe('Elf');
		expect(menu?.hasAttribute('title')).toBe(false);
	});

	it('reports two options that differ only in space as one value', () => {
		// The same trim the match rests on is what the duplicate check compares,
		// or the two would be one value in the note and two lines in the menu.
		const el = render(
			{ ...config, options: [{ value: 'Elf' }, { value: 'Elf ' }] },
			null,
		);
		expect(el.querySelector('.sheetsmith-error')?.textContent).toContain(
			'Two options share the value "Elf"',
		);
	});

	it('takes a blank label as the value, not as an error', () => {
		const el = render({ ...config, options: [{ value: 'Elf', label: '' }] }, null);
		expect(el.querySelector('.sheetsmith-error')).toBeNull();
		expect(
			Array.from(
				el.querySelector<HTMLSelectElement>('.sheetsmith-card-select')?.options ?? [],
			).map((option) => option.textContent),
		).toEqual(['—', 'Elf']);
	});
});

describe('card palette', () => {
	it('offers a dropdown, because nobody looks for one under Card', () => {
		expect(card.palette?.map((entry) => entry.name)).toEqual(['Dropdown']);
	});

	it('prefills options, which is the only thing that makes it a dropdown', () => {
		// An entry prefilling an empty list would produce a plain text card,
		// and the menu line would have lied.
		const entry = card.palette?.[0];
		expect(entry?.config.options).toEqual([
			{ value: 'First choice' },
			{ value: 'Second choice' },
		]);
		// Not `hideNote`: a heritage is a closed choice plus a written detail,
		// and the line is the half the choice cannot carry.
		expect(entry?.config).not.toHaveProperty('hideNote');
	});
});

/*
 * Modifiers (SPEC §5): the card's own name, and the mark over the number.
 *
 * The first case is the one `docs/features/item-modifiers.md` calls Risk 1 and
 * accepts: `FieldResolver`'s third argument is optional, so a component that
 * forgets to pass its published name reads `mod.self` as 0 with nothing
 * reporting it — the static accepting set still claims the name takes a
 * modifier, and `contract.test.ts` cannot see a missing argument. A test per
 * publishing component is the only thing that catches it, so this one is
 * load-bearing rather than routine.
 */
/**
 * What a modifier cell's outcome is where a case is not about one.
 *
 * A Card never asks for one — `outcome` is the modifier *cell's* question — so a
 * stub context needs a member it can hand back and nothing more.
 */
const NO_OUTCOME: ModifierOutcome = {
	definition: null,
	typed: null,
	target: '',
	targetLabel: '',
	applies: false,
	amount: null,
	condition: null,
	suppressed: null,
};

/**
 * The three members a Card never reaches, so a stub context can declare them
 * once.
 *
 * `targets`, `published` and `bonusTypes` are the form's option lists and
 * `promote` is §8's layout write: all four are the modifier *cell's* business,
 * and a Card is the thing being modified rather than the thing modifying.
 */
const NO_AUTHORING = {
	targets: [],
	published: [],
	bonusTypes: [],
	promote: () =>
		Promise.resolve({
			error: 'This sheet cannot save a modifier to its layout.',
		}),
};

describe('card and its modifier slot', () => {
	/** A resolver that only answers when told which name it is producing. */
	const slotAware = vi.fn(
		(
			field: string,
			scope: Readonly<Record<string, FieldValue>>,
			published?: string,
		) => {
			if (field !== 'derived' || typeof scope.value !== 'string') return null;
			const parsed = Number(scope.value);
			if (!Number.isFinite(parsed)) return null;
			return published === 'armour-class' ? parsed + 2 : parsed;
		},
	);

	afterEach(() => slotAware.mockClear());

	it('passes its own published name to the resolver', () => {
		const el = render({ derived: 'value + mod.self' }, { value: '15' }, {
			resolveField: slotAware,
		});
		// 17 rather than 15: the card told the resolver which name this
		// evaluation becomes, so `mod.self` had a slot to read.
		expect(
			el.querySelector('.sheetsmith-card-derived')?.textContent,
		).toBe('+17');
		expect(slotAware).toHaveBeenCalledWith(
			'derived',
			{ value: '15' },
			'armour-class',
		);
	});

	it('passes it on every re-derive, not only the first', () => {
		// The draft path is a second call site, and one that forgot the name
		// would make the number jump while the value was being typed.
		const el = render({ derived: 'value + mod.self' }, { value: '15' }, {
			resolveField: slotAware,
		});
		const input = inputs(el).value as HTMLInputElement;
		input.value = '16';
		input.dispatchEvent(new Event('input'));
		expect(
			el.querySelector('.sheetsmith-card-derived')?.textContent,
		).toBe('+18');
	});

	it('marks the number and puts the breakdown one press away', () => {
		const el = render({ derived: 'value + mod.self' }, { value: '15' }, {
			modifiers: {
				definitions: [],
				...NO_AUTHORING,
				outcome: () => NO_OUTCOME,
				breakdown: () => ({
					override: null,
					total: 2,
					lines: [
						{
									label: 'Ring of Protection',
							source: 'Magic items',
							definition: 'Ring of Protection',
							operator: 'add',
							type: 'item',
							amount: 2,
							suppressed: null,
						},
						{
									label: 'Cloak',
							source: 'Magic items',
							definition: 'Cloak',
							operator: 'add',
							type: 'item',
							amount: 1,
							suppressed: 'a larger item bonus applies',
						},
					],
				}),
			},
		});
		const derived = el.querySelector('.sheetsmith-card-derived') as HTMLElement;
		expect(derived.classList.contains('sheetsmith-modified')).toBe(true);
		derived.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const bubble = document.querySelector('.sheetsmith-popover');
		expect(bubble?.textContent).toContain('Ring of Protection — item +2');
		// The suppressed line is listed and says why, which is the whole reason
		// the breakdown beats a mark.
		expect(bubble?.textContent).toContain(
			'Cloak — item +1 (not applied: a larger item bonus applies)',
		);
		expect(bubble?.textContent).toContain('Total +2');
		bubble?.remove();
	});

	it('carries the same text for a reader with no pointer', () => {
		// One builder, two carriers, so the two cannot say different things.
		const el = render({ derived: 'value + mod.self' }, { value: '15' }, {
			modifiers: {
				definitions: [],
				...NO_AUTHORING,
				outcome: () => NO_OUTCOME,
				breakdown: () => ({
					override: null,
					total: 2,
					lines: [
						{
									label: 'Ring',
							source: 'Magic items',
							definition: 'Ring',
							operator: 'add',
							type: null,
							amount: 2,
							suppressed: null,
						},
					],
				}),
			},
		});
		const twin = el.querySelector('.sheetsmith-sr-only[id]') as HTMLElement;
		expect(twin.textContent).toBe('Ring — +2\n\nTotal +2');
		expect(
			inputs(el).value?.getAttribute('aria-describedby'),
		).toBe(twin.id);
	});

	/*
	 * That the face and its own breakdown's total line cannot disagree.
	 *
	 * Two predicates answer "does this override reach this name": a lazy-proof text
	 * scan decides whether a breakdown is offered at all, and the slot actually
	 * having been read decides whether the arithmetic applies. Both are right —
	 * `modifier-targets.ts` argues the first at length and `resolve.ts` argues the
	 * second — and while the popover did its own `override + total` they printed
	 * `Total 19` over the number 10.
	 *
	 * Driven over the two shapes that reach it, because neither is exotic: a lazy
	 * `if` on a stowed item, and a name that reaches the accepting set through some
	 * *other* formula's `mod.<name>` while an override only ever arrives via
	 * `mod.self` — which needs no `if` at all and is offered by the editor's own
	 * target picker.
	 */
	describe('the face and its breakdown agree about the value', () => {
		/*
		 * **One of three drawers, and the other two now hold the same rule.**
		 * `modifierBreakdown`'s `shown` argument is passed by Card, Card set and
		 * Table, and this pair was the only thing holding it — so dropping the
		 * argument in either of the other two passed the whole suite. The
		 * equivalents are 'prints the entry's own number in the total line, under
		 * an override' in `card-set.test.ts` and 'prints the cell's own number in
		 * the total line, under an override' in `table.test.ts`. Three cases rather
		 * than one parameterised over three components, because a component's rules
		 * live in its own test file and a test importing three of them would be the
		 * sibling coupling `contract.test.ts` is the one exception to.
		 */
		/** The lines an override plus an addition produce at one name. */
		const OVERRIDDEN: ModifierBreakdown = {
			override: 18,
			total: 1,
			lines: [
				{
					label: 'Plate armour',
					source: 'Magic items',
					definition: 'Plate armour',
					operator: 'override',
					type: null,
					amount: 18,
					suppressed: null,
				},
				{
					label: 'Ring',
					source: 'Magic items',
					definition: 'Ring',
					operator: 'add',
					type: 'item',
					amount: 1,
					suppressed: null,
				},
			],
		};

		/** The face, and the total line of its own popover. */
		function drawn(resolved: number) {
			const el = render({ derived: 'anything' }, { value: '15' }, {
				resolveField: () => resolved,
				modifiers: {
					definitions: [],
					...NO_AUTHORING,
					outcome: () => NO_OUTCOME,
					breakdown: () => OVERRIDDEN,
				},
			});
			const twin = el.querySelector('.sheetsmith-sr-only[id]');
			return {
				face: el.querySelector('.sheetsmith-card-derived')?.textContent ?? '',
				total: (twin?.textContent ?? '').split('\n').at(-1) ?? '',
			};
		}

		it('prints the number the card drew, where the override applied', () => {
			// The ordinary case: `resolve.ts` returned `override + total`, so the
			// two agree because they are the same number rather than because two
			// sums happened to match.
			const { face, total } = drawn(19);
			expect(face).toBe('+19');
			expect(total).toBe('Total 19');
		});

		it('prints the number the card drew, where the override did not apply', () => {
			// The finding. The card's formula never read its slot on the path it
			// took, so the override is inert and the face is 10 — and the total line
			// used to say 19, which is a false statement about the number under the
			// cursor rather than a confusing delta.
			const { face, total } = drawn(10);
			expect(face).toBe('+10');
			expect(total).toBe('Total 10');
		});
	});

	it('draws no mark where nothing has been pushed', () => {
		// The empty state of every new character: a sheet full of marks for
		// modifiers that do not exist is worse than a quiet one.
		const el = render({ derived: 'value + mod.self' }, { value: '15' }, {
			modifiers: {
				definitions: [],
				...NO_AUTHORING,
				outcome: () => NO_OUTCOME,
				breakdown: () => ({ override: null, total: 0, lines: [] }),
			},
		});
		expect(
			el.querySelector('.sheetsmith-card-derived')?.classList.contains(
				'sheetsmith-modified',
			),
		).toBe(false);
	});

	it('leaves the press on the rest of the card alone', () => {
		/*
		 * A press on the derived opens the breakdown; a press anywhere else still
		 * routes to a control, which is the card's existing region rule. Asserted
		 * on *which* press opens a bubble rather than on where focus landed:
		 * proximity is decided by `getBoundingClientRect`, which is all zeroes
		 * under happy-dom, so a landing position here would be the stub's answer
		 * rather than the card's.
		 */
		const el = render({ derived: 'value + mod.self' }, { value: '15' }, {
			modifiers: {
				definitions: [],
				...NO_AUTHORING,
				outcome: () => NO_OUTCOME,
				breakdown: () => ({
					override: null,
					total: 2,
					lines: [
						{
									label: 'Ring',
							source: 'Magic items',
							definition: 'Ring',
							operator: 'add',
							type: null,
							amount: 2,
							suppressed: null,
						},
					],
				}),
			},
		});
		const note = el.querySelector('.sheetsmith-card-note') as HTMLElement;
		note.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')).toBeNull();
		const derived = el.querySelector('.sheetsmith-card-derived') as HTMLElement;
		derived.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')).not.toBeNull();
		document.querySelector('.sheetsmith-popover')?.remove();
	});
});
