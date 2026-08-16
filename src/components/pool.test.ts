// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { pool, PoolConfig, PoolData } from './pool';
import { RenderContext } from '../types';

const config: PoolConfig = {
	id: 'hp',
	type: 'pool',
	label: 'HP',
	position: { col: 1, row: 1, width: 2, height: 1 },
	max: '31',
};

const BODY = '\n```sheet\ncurrent: 22\ntemp: 4\n```\n';

const context: RenderContext = {
	resolved: { max: 31 },
	resolveField: () => null,
	onChange: () => undefined,
};

const render = (
	overrides: Partial<PoolConfig> = {},
	data: PoolData | null = { current: '22' },
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	pool.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
};

const parts = (el: HTMLElement) => ({
	current: el.querySelector<HTMLInputElement>('.sheetsmith-pool-current'),
	temp: el.querySelector<HTMLInputElement>('.sheetsmith-pool-temp-input'),
	max: el.querySelector<HTMLElement>('.sheetsmith-pool-max'),
	steps: el.querySelectorAll<HTMLButtonElement>('.sheetsmith-pool-step'),
	status: el.querySelector<HTMLElement>('[aria-live]'),
});

describe('pool.read', () => {
	it('reads current and temp', () => {
		expect(pool.read(BODY, config)).toEqual({
			ok: true,
			data: { current: '22', temp: '4' },
		});
	});

	it('treats a section with no fence as empty, not malformed', () => {
		expect(pool.read('\nSome prose.\n', config)).toEqual({ ok: true, data: null });
	});

	it('reports a malformed block as an error on this component', () => {
		const result = pool.read('\n```sheet\nnot an entry\n```\n', config);
		expect(result.ok).toBe(false);
	});

	it('ignores a stored max, which is layout config rather than data', () => {
		// A note written against an older layout may carry one. It is not read,
		// and the write test below proves it is not destroyed either.
		expect(pool.read('\n```sheet\ncurrent: 9\nmax: 12\n```\n', config)).toEqual({
			ok: true,
			data: { current: '9' },
		});
	});
});

describe('pool.write', () => {
	it('round-trips an unchanged section byte for byte', () => {
		const read = pool.read(BODY, config);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(pool.write(read.data, BODY, config)).toBe(BODY);
	});

	it('writes only the field that changed', () => {
		expect(pool.write({ current: '18' }, BODY, config)).toBe(
			'\n```sheet\ncurrent: 18\ntemp: 4\n```\n',
		);
	});

	it('preserves entries it does not map, including a stored max', () => {
		const body = '\n```sheet\ncurrent: 9\nmax: 12\nnotes: bloodied\n```\n';
		expect(pool.write({ current: '10' }, body, config)).toBe(
			'\n```sheet\ncurrent: 10\nmax: 12\nnotes: bloodied\n```\n',
		);
	});

	it('creates a fresh block for a section that has none', () => {
		expect(pool.write({ current: '5' }, null, config)).toBe(
			'\n```sheet\ncurrent: 5\n```\n',
		);
	});
});

describe('pool.scopeValues', () => {
	it('publishes the current value under the bare id', () => {
		const published = pool.scopeValues?.({ current: '22' }, config);
		expect(published?.self).toEqual({ value: '22' });
	});

	it('publishes the max as a lazily evaluated display', () => {
		const published = pool.scopeValues?.({ current: '22' }, config);
		expect(published?.named?.max).toEqual({
			display: { field: 'max', scope: {} },
		});
	});

	it('publishes no max where the layout configures none', () => {
		const { max: _max, ...unbounded } = config;
		const published = pool.scopeValues?.({ current: '1' }, unbounded);
		expect(published?.named?.max).toBeUndefined();
	});

	it('publishes temp only when the layout asks for it', () => {
		expect(
			pool.scopeValues?.({ temp: '4' }, { ...config, hasTemp: true })?.named?.temp,
		).toEqual({ value: '4' });
		expect(pool.scopeValues?.({ temp: '4' }, config)?.named?.temp).toBeUndefined();
	});
});

describe('pool.render', () => {
	it('shows the current value, the max, and both step buttons', () => {
		const { current, max, steps } = parts(render());
		expect(current?.value).toBe('22');
		expect(max?.textContent).toBe('31');
		expect(steps).toHaveLength(2);
	});

	it('shows an em dash placeholder for an empty pool', () => {
		const { current } = parts(render({}, null));
		expect(current?.value).toBe('');
		expect(current?.placeholder).toBe('—');
	});

	it('leaves the max off entirely where the layout configures none', () => {
		const el = render({ max: undefined });
		expect(parts(el).max).toBeNull();
		expect(el.querySelector('.sheetsmith-pool-separator')).toBeNull();
	});

	it('shows "?" and the reason where the max does not resolve', () => {
		const el = render({}, { current: '22' }, {
			resolved: { max: null },
			explainField: () => "'con' is not defined on this sheet.",
		});
		const { max } = parts(el);
		expect(max?.textContent).toBe('?');
		expect(max?.getAttribute('title')).toBe("'con' is not defined on this sheet.");
	});

	it('shows the temp field only when the layout asks for it', () => {
		expect(parts(render()).temp).toBeNull();
		expect(parts(render({ hasTemp: true }, { current: '22', temp: '4' })).temp?.value).toBe(
			'4',
		);
	});

	it('commits an edit as a delta of the field touched', () => {
		const onChange = vi.fn();
		const { current } = parts(render({}, { current: '22' }, { onChange }));
		if (!current) throw new Error('expected the current field');
		current.value = '18';
		current.dispatchEvent(new Event('blur'));
		expect(onChange).toHaveBeenCalledWith({ current: '18' });
	});

	it('commits a temp edit without touching current', () => {
		const onChange = vi.fn();
		const { temp } = parts(
			render({ hasTemp: true }, { current: '22', temp: '4' }, { onChange }),
		);
		if (!temp) throw new Error('expected the temp field');
		temp.value = '7';
		temp.dispatchEvent(new Event('blur'));
		expect(onChange).toHaveBeenCalledWith({ temp: '7' });
	});
});

describe('pool step buttons', () => {
	/**
	 * A full pointer press: down, then up. The step lands on the way down —
	 * feedback belongs on the press — and the commit on the way up, so a hold
	 * writes the note once rather than once per repeat.
	 */
	const press = (
		button: HTMLButtonElement | undefined,
		init: PointerEventInit = {},
	) => {
		button?.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0, ...init }),
		);
		button?.dispatchEvent(
			new PointerEvent('pointerup', { pointerId: 1, button: 0, ...init }),
		);
	};

	it('steps down and up by one', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		const { steps } = parts(el);
		press(steps[0]);
		expect(onChange).toHaveBeenLastCalledWith({ current: '21' });
		press(steps[1]);
		expect(onChange).toHaveBeenLastCalledWith({ current: '22' });
	});

	it('steps by ten with shift, matching the arrow keys', () => {
		const onChange = vi.fn();
		const { steps } = parts(render({}, { current: '22' }, { onChange }));
		press(steps[0], { shiftKey: true });
		expect(onChange).toHaveBeenLastCalledWith({ current: '12' });
	});

	it('steps from zero on an empty pool rather than being a dead key', () => {
		const onChange = vi.fn();
		const { steps } = parts(render({}, null, { onChange }));
		press(steps[0]);
		expect(onChange).toHaveBeenLastCalledWith({ current: '-1' });
	});

	it('steps the draft under the eye, not the value last rendered', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		const { current, steps } = parts(el);
		if (!current) throw new Error('expected the current field');
		// Typed but not committed. The button must move what is on screen.
		current.value = '10';
		press(steps[1]);
		expect(onChange).toHaveBeenLastCalledWith({ current: '11' });
	});

	it('commits once per press, leaving no change for a later blur', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		const { current, steps } = parts(el);
		press(steps[1]);
		current?.dispatchEvent(new Event('blur'));
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('does not step a pool holding text that is not a number', () => {
		// The arrow keys leave such a field alone; a button that replaced
		// "lots" with 1 would be the same control disagreeing with itself.
		const onChange = vi.fn();
		const el = render({}, { current: 'lots' }, { onChange });
		press(parts(el).steps[1]);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('steps once per keyboard activation', () => {
		// A keyboard click arrives with detail 0 and no pointerdown before it.
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		parts(el).steps[1]?.dispatchEvent(new MouseEvent('click', { detail: 0 }));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ current: '23' });
	});

	it('writes the note once for a press, not once per repeat', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		press(parts(el).steps[0]);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('announces the new value against the max', () => {
		const el = render({}, { current: '22' });
		press(parts(el).steps[0]);
		expect(parts(el).status?.textContent).toBe('HP 21 of 31');
	});
});

describe('pool.applyReset', () => {
	const reset = (
		action: 'full' | 'empty' | 'formula',
		resolve: (field: string) => number | null,
		to?: string,
	) =>
		pool.applyReset?.(
			{ current: '3', temp: '4' },
			config,
			{ trigger: 'Long rest', action, ...(to !== undefined ? { to } : {}) },
			{ resolve: (field) => resolve(field), explain: () => null },
		);

	it('restores to the max on a full reset', () => {
		expect(reset('full', (field) => (field === 'max' ? 31 : null))).toEqual({
			ok: true,
			data: { current: '31' },
		});
	});

	it('sets zero on an empty reset without resolving anything', () => {
		const resolve = vi.fn(() => null);
		expect(
			pool.applyReset?.(
				{ current: '3' },
				config,
				{ trigger: 'Long rest', action: 'empty' },
				{ resolve, explain: () => null },
			),
		).toEqual({ ok: true, data: { current: '0' } });
		// A pool whose max is broken can still be spent.
		expect(resolve).not.toHaveBeenCalled();
	});

	it('evaluates the binding expression on a formula reset', () => {
		expect(
			reset('formula', (field) => (field === 'reset.to' ? 7 : null), 'mod(con)'),
		).toEqual({ ok: true, data: { current: '7' } });
	});

	it('leaves temporary points where they are', () => {
		// Which rest clears temp is a rule of the game, not of a pool.
		const result = reset('full', () => 31);
		expect(result).toEqual({ ok: true, data: { current: '31' } });
		expect(result && 'data' in result && 'temp' in result.data).toBe(false);
	});

	it('reports a failure rather than a value when the max will not resolve', () => {
		const result = reset('full', () => null);
		expect(result?.ok).toBe(false);
	});

	it('reports why, where the engine can say', () => {
		const result = pool.applyReset?.(
			{ current: '3' },
			config,
			{ trigger: 'Long rest', action: 'full' },
			{
				resolve: () => null,
				explain: () => "'con' is not defined on this sheet.",
			},
		);
		expect(result).toEqual({
			ok: false,
			error: "'con' is not defined on this sheet.",
		});
	});

	it('falls back to naming the field where there is nothing to explain', () => {
		const result = reset('full', () => null);
		expect(result && !result.ok && result.error).toContain('no max');
	});

	it('resets from null data without inventing one', () => {
		expect(
			pool.applyReset?.(
				null,
				config,
				{ trigger: 'Long rest', action: 'full' },
				{ resolve: () => 31, explain: () => null },
			),
		).toEqual({ ok: true, data: { current: '31' } });
	});
});

describe('pool Enter', () => {
	const enter = (input: HTMLInputElement) =>
		input.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
		);

	it('moves to the temporary field, as a stat card moves to its note', () => {
		const el = render({ hasTemp: true }, { current: '22', temp: '4' });
		document.body.appendChild(el);
		const { current, temp } = parts(el);
		if (!current || !temp) throw new Error('expected both fields');
		current.focus();
		enter(current);
		expect(document.activeElement).toBe(temp);
		el.remove();
	});

	it('commits in place where there is no second field to move to', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		document.body.appendChild(el);
		const { current } = parts(el);
		if (!current) throw new Error('expected the current field');
		current.focus();
		current.value = '18';
		enter(current);
		expect(onChange).toHaveBeenCalledWith({ current: '18' });
		// Enter commits without dropping focus out of the sheet.
		expect(document.activeElement).toBe(current);
		el.remove();
	});
});

describe('pool card', () => {
	const press = (button: HTMLButtonElement | undefined) => {
		button?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		button?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0 }));
	};
	it('renders the card as a child of the cell, not as the cell', () => {
		// The cell is grid placement; the card is the object. A lone stat card
		// works the same way, which is what lets both take one width cap.
		const el = render();
		expect(el.classList.contains('sheetsmith-pool')).toBe(false);
		expect(el.querySelector(':scope > .sheetsmith-pool')).not.toBeNull();
	});

	it('keeps the value and its max in one reading', () => {
		const reading = render().querySelector('.sheetsmith-pool-reading');
		expect(reading?.querySelector('.sheetsmith-pool-current')).not.toBeNull();
		expect(reading?.querySelector('.sheetsmith-pool-max')).not.toBeNull();
	});

	it('routes a press on the card to the value, on the way down', () => {
		// On release is too late: a tablet has no hover, so the focus ring
		// landing on pointerdown is the only pre-commit signal there is.
		const el = render();
		document.body.appendChild(el);
		el.querySelector<HTMLElement>('.sheetsmith-pool')?.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, clientY: 0 }),
		);
		expect(document.activeElement).toBe(parts(el).current);
		el.remove();
	});

	it('does not route a press that landed on a step button', () => {
		// The button has already done the work, and stealing focus to the field
		// would undo the reason the press keeps focus where it is.
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		document.body.appendChild(el);
		const previous = document.activeElement;
		press(parts(el).steps[1]);
		expect(document.activeElement).toBe(previous);
		expect(onChange).toHaveBeenCalledWith({ current: '23' });
		el.remove();
	});
});

describe('pool proportional fill', () => {
	const fill = (el: HTMLElement) =>
		el.querySelector<HTMLElement>('.sheetsmith-pool')?.style.getPropertyValue(
			'--sheetsmith-pool-fill',
		);

	it('publishes the ratio of current to max', () => {
		// 12 of 54. The bar is the shape of the numbers, so the reader is not
		// doing the division mid-fight.
		const el = render({}, { current: '27' }, { resolved: { max: 54 } });
		expect(Number(fill(el))).toBeCloseTo(0.5);
		expect(el.querySelector('.sheetsmith-pool-track')).not.toBeNull();
	});

	it('clamps the bar without clamping the value', () => {
		// Whether a pool may run past its ceiling is the game's rule, not the
		// plugin's; the bar simply has nowhere further to go.
		expect(Number(fill(render({}, { current: '99' }, { resolved: { max: 54 } })))).toBe(1);
		expect(Number(fill(render({}, { current: '-9' }, { resolved: { max: 54 } })))).toBe(0);
	});

	it('draws no track where there is no proportion to show', () => {
		expect(render({ max: undefined }).querySelector('.sheetsmith-pool-track')).toBeNull();
		expect(
			render({}, { current: '1' }, { resolved: { max: null } }).querySelector(
				'.sheetsmith-pool-track',
			),
		).toBeNull();
	});

	it('follows the draft, not the last saved value', () => {
		const el = render({}, { current: '54' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		current.value = '27';
		current.dispatchEvent(new Event('input'));
		expect(Number(fill(el))).toBeCloseTo(0.5);
	});

	it('marks a spent pool and one above its ceiling', () => {
		const spent = parts(render({}, { current: '0' }, { resolved: { max: 54 } })).current;
		expect(spent?.classList.contains('sheetsmith-pool-spent')).toBe(true);
		const over = parts(render({}, { current: '60' }, { resolved: { max: 54 } })).current;
		expect(over?.classList.contains('sheetsmith-pool-over')).toBe(true);
	});
});

describe('pool scrub', () => {
	const drag = (input: HTMLInputElement, points: number[], stamp = 16) => {
		// The timeStamp has to be set here too: the velocity window compares
		// pointerdown's clock against the moves', and leaving this one on the
		// real clock makes every sample look older than the window, which
		// silently skips the throw and lets a flick test pass on the drag alone.
		const down = new PointerEvent('pointerdown', {
			pointerId: 1,
			button: 0,
			clientX: 0,
		});
		Object.defineProperty(down, 'timeStamp', { value: 0 });
		input.dispatchEvent(down);
		let t = 0;
		for (const x of points) {
			t += stamp;
			const move = new PointerEvent('pointermove', { pointerId: 1, clientX: x });
			Object.defineProperty(move, 'timeStamp', { value: t });
			input.dispatchEvent(move);
		}
		const up = new PointerEvent('pointerup', { pointerId: 1, clientX: points.at(-1) ?? 0 });
		Object.defineProperty(up, 'timeStamp', { value: t });
		input.dispatchEvent(up);
	};

	it('leaves a press below the threshold alone, so tapping still types', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		drag(current, [3, 6]);
		expect(onChange).not.toHaveBeenCalled();
		expect(current.value).toBe('22');
	});

	it('tracks the pointer once the drag is unambiguous', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		// 60px right at six pixels per unit is ten up, and slowly enough that
		// momentum adds nothing.
		drag(current, [12, 24, 36, 48, 60], 200);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(Number(current.value)).toBe(32);
	});

	it('throws further than the finger travelled on a flick', () => {
		const el = render({}, { current: '0' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		drag(current, [40, 90, 150, 220], 8);
		// The drag itself covers 220px, which is 37 units. Anything past that
		// is the projection, so the bound has to sit above 37 or the test
		// passes on the drag alone and says nothing about the throw.
		expect(Number(current.value)).toBeGreaterThan(37);
	});
});

describe('pool throw calibration', () => {
	const flick = (input: HTMLInputElement) => {
		// The timeStamp has to be set here too: the velocity window compares
		// pointerdown's clock against the moves', and leaving this one on the
		// real clock makes every sample look older than the window, which
		// silently skips the throw and lets a flick test pass on the drag alone.
		const down = new PointerEvent('pointerdown', {
			pointerId: 1,
			button: 0,
			clientX: 0,
		});
		Object.defineProperty(down, 'timeStamp', { value: 0 });
		input.dispatchEvent(down);
		let t = 0;
		for (const x of [40, 90, 150, 220]) {
			t += 8;
			const move = new PointerEvent('pointermove', { pointerId: 1, clientX: x });
			Object.defineProperty(move, 'timeStamp', { value: t });
			input.dispatchEvent(move);
		}
		const up = new PointerEvent('pointerup', { pointerId: 1, clientX: 220 });
		Object.defineProperty(up, 'timeStamp', { value: t });
		input.dispatchEvent(up);
	};

	it('caps a throw at a quarter of the ceiling', () => {
		// However hard it is thrown, one flick must not cross a whole pool: the
		// gesture is worth having because it covers ground, not because it can
		// empty a character in one movement.
		const el = render({}, { current: '0' }, { resolved: { max: 40 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		flick(current);
		// 220px of drag is 37 units; the throw may add at most a quarter of the
		// 40-point ceiling. Both bounds, so neither a missing throw nor an
		// unclamped one can pass.
		expect(Number(current.value)).toBeGreaterThan(37);
		expect(Number(current.value)).toBeLessThanOrEqual(37 + 10);
	});

	it('still throws where the pool has no ceiling to measure against', () => {
		const el = render({ max: undefined }, { current: '0' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		flick(current);
		expect(Number(current.value)).toBeGreaterThan(37);
	});
});

describe('pool boundary is not colour alone', () => {
	const announced = (el: HTMLElement) =>
		el.querySelector<HTMLElement>('[aria-live]')?.textContent;

	it('says so when the pool is empty', () => {
		const el = render({}, { current: '5' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		current.value = '0';
		current.dispatchEvent(new Event('blur'));
		expect(announced(el)).toContain('empty');
	});

	it('says so when the pool is above its maximum', () => {
		const el = render({}, { current: '5' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		current.value = '60';
		current.dispatchEvent(new Event('blur'));
		expect(announced(el)).toContain('above maximum');
	});
});
