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
	const press = (
		button: HTMLButtonElement | undefined,
		init: MouseEventInit = {},
	) => button?.dispatchEvent(new MouseEvent('click', init));

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
		const onChange = vi.fn();
		const el = render({}, { current: 'lots' }, { onChange });
		press(parts(el).steps[1]);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('announces the new value against the max', () => {
		const el = render({}, { current: '22' });
		press(parts(el).steps[0]);
		expect(parts(el).status?.textContent).toBe('HP 21 of 31');
	});
});
