// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOCUSABLE } from '../view/cell-focus';
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

/**
 * Render into the document, not a detached div. The card refuses to commit
 * from inputs that are not connected — a rebuild replaces it, and a commit
 * arriving after that would write values read out of dead nodes — so a
 * detached fixture silently exercises none of the commit paths.
 */
const render = (
	overrides: Partial<PoolConfig> = {},
	data: PoolData | null = { current: '22' },
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	document.body.appendChild(el);
	pool.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
};

afterEach(() => {
	document.body.replaceChildren();
});

/**
 * Flush the debounced write, the way leaving the card does. Adjustments are
 * coalesced into one gesture, so a press no longer writes on release.
 */
const settle = (el: HTMLElement) => {
	parts(el).current?.dispatchEvent(new Event('blur'));
};

const parts = (el: HTMLElement) => ({
	current: el.querySelector<HTMLInputElement>('.sheetsmith-pool-current'),
	temp: el.querySelector<HTMLInputElement>('.sheetsmith-pool-temp-input'),
	max: el.querySelector<HTMLElement>('.sheetsmith-pool-max'),
	maxInput: el.querySelector<HTMLInputElement>('.sheetsmith-pool-max-input'),
	track: el.querySelector<HTMLElement>('.sheetsmith-pool-track'),
	steps: el.querySelectorAll<HTMLButtonElement>('.sheetsmith-pool-step'),
	status: el.querySelector<HTMLElement>('[aria-live]'),
	adjust: el.querySelector<HTMLElement>('.sheetsmith-pool-adjust'),
	trigger: el.querySelector<HTMLButtonElement>('.sheetsmith-pool-adjust-trigger'),
	direction: el.querySelector<HTMLButtonElement>('.sheetsmith-pool-adjust-direction'),
	amount: el.querySelector<HTMLInputElement>('.sheetsmith-pool-adjust-amount'),
	preview: el.querySelector<HTMLElement>('.sheetsmith-pool-preview'),
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

	it('reads a stored max, and lets the layout decide whether it means anything', () => {
		// `read` has no config, so it cannot know which mode this pool is in —
		// and it does not need to: a calculated pool never writes the key and
		// never renders it, so an entry from another layout survives untouched
		// (the write test below proves it), while a pool whose max the character
		// owns finds the number already there.
		expect(pool.read('\n```sheet\ncurrent: 9\nmax: 12\n```\n', config)).toEqual({
			ok: true,
			data: { current: '9', max: '12' },
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
		const el = render({}, { current: '22' });
		const { current, steps } = parts(el);
		press(steps[0]);
		expect(current?.value).toBe('21');
		press(steps[1]);
		expect(current?.value).toBe('22');
	});

	it('writes one change for a press, once the run ends', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		press(parts(el).steps[0]);
		expect(onChange).not.toHaveBeenCalled();
		settle(el);
		expect(onChange).toHaveBeenCalledWith({ current: '21' });
	});

	it('writes nothing at all for a run that cancels itself out', () => {
		// Down then up is one gesture measured from where it began, so it ends
		// where it started and there is nothing to save.
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		press(parts(el).steps[0]);
		press(parts(el).steps[1]);
		settle(el);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('coalesces a run of taps into one write', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		press(parts(el).steps[0]);
		press(parts(el).steps[0]);
		press(parts(el).steps[0]);
		settle(el);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ current: '19' });
	});

	it('steps by ten with shift, matching the arrow keys', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		const { steps } = parts(el);
		press(steps[0], { shiftKey: true });
		settle(el);
		expect(onChange).toHaveBeenLastCalledWith({ current: '12' });
	});

	it('steps from zero on an empty pool rather than being a dead key', () => {
		const onChange = vi.fn();
		const el = render({}, null, { onChange });
		press(parts(el).steps[0]);
		settle(el);
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
		settle(el);
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
		settle(el);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ current: '23' });
	});

	it('writes the note once for a press, not once per repeat', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '22' }, { onChange });
		press(parts(el).steps[0]);
		settle(el);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('announces the new value against the max', () => {
		const el = render({}, { current: '22' });
		press(parts(el).steps[0]);
		settle(el);
		expect(parts(el).status?.textContent).toBe('HP 21 of 31');
	});
});

describe('pool step button held', () => {
	/*
	 * The repeat itself, which nothing drove until now.
	 *
	 * Every test above releases the button on the same tick it pressed it, so
	 * the hold's timing — when it starts repeating, how it accelerates, the
	 * floor it accelerates to, and Shift read per tick rather than captured on
	 * the press — never ran. "Writes the note once for a press, not once per
	 * repeat" passed on a press that had not repeated.
	 *
	 * That timing is the whole of what `hold-repeat.ts` owns, and it is exactly
	 * the kind of failure a review cannot see: a ramp that stopped accelerating
	 * still steps, still commits once, and still passes every assertion above.
	 * Nothing would say so until someone held the button (§10).
	 */
	const hold = (
		button: HTMLButtonElement | undefined,
		ms: number,
		init: PointerEventInit = {},
	) => {
		button?.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0, ...init }),
		);
		vi.advanceTimersByTime(ms);
	};

	const release = (button: HTMLButtonElement | undefined) => {
		button?.dispatchEvent(
			new PointerEvent('pointerup', { pointerId: 1, button: 0 }),
		);
	};

	it('steps once and then waits, so a tap is not a repeat', () => {
		vi.useFakeTimers();
		try {
			const el = render({}, { current: '22' });
			const { current, steps } = parts(el);
			hold(steps[0], 399);
			// The press itself landed; the first repeat has not.
			expect(current?.value).toBe('21');
			release(steps[0]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('repeats while it is held', () => {
		vi.useFakeTimers();
		try {
			const el = render({}, { current: '22' });
			const { current, steps } = parts(el);
			hold(steps[0], 400);
			expect(current?.value).toBe('20');
			release(steps[0]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('accelerates, so a long press covers real ground', () => {
		vi.useFakeTimers();
		try {
			const el = render({ max: '400' }, { current: '400' });
			const { current, steps } = parts(el);
			// The second of the hold against the first, rather than either
			// against a number: a ramp that flattened out would move the same
			// distance in both, and this says which property is being checked
			// without pinning the constants that produce it.
			hold(steps[0], 1000);
			const first = 400 - Number(current?.value);
			vi.advanceTimersByTime(1000);
			const second = 400 - Number(current?.value) - first;
			expect(second).toBeGreaterThan(first * 2);
			release(steps[0]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('accelerates to a floor rather than without bound', () => {
		vi.useFakeTimers();
		try {
			const el = render({ max: '4000' }, { current: '4000' });
			const { current, steps } = parts(el);
			// Bounded by the floor: at 40ms a step, ten seconds cannot move
			// more than 250. A ramp that lost its floor would run at one step
			// per frame and empty the pool instead.
			hold(steps[0], 10_000);
			expect(4000 - Number(current?.value)).toBeLessThanOrEqual(250);
			release(steps[0]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('takes Shift pressed part-way through the hold', () => {
		vi.useFakeTimers();
		try {
			const el = render({ max: '400' }, { current: '400' });
			const { current, steps } = parts(el);
			hold(steps[0], 400);
			// Read per tick, not captured on the press: the key went down after
			// the gesture began, and the rest of the run has to answer to it.
			// Captured once, Shift was inert for the whole hold.
			const beforeShift = Number(current?.value);
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }),
			);
			vi.advanceTimersByTime(400);
			const shifted = beforeShift - Number(current?.value);
			document.dispatchEvent(
				new KeyboardEvent('keyup', { key: 'Shift', shiftKey: false }),
			);
			const afterRelease = Number(current?.value);
			vi.advanceTimersByTime(400);
			const unshifted = afterRelease - Number(current?.value);
			expect(shifted).toBeGreaterThan(unshifted);
			release(steps[0]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('writes the note once for the whole hold, not once per repeat', () => {
		vi.useFakeTimers();
		try {
			const onChange = vi.fn();
			const el = render({ max: '400' }, { current: '400' }, { onChange });
			const { steps } = parts(el);
			hold(steps[0], 1000);
			expect(onChange).not.toHaveBeenCalled();
			release(steps[0]);
			vi.advanceTimersByTime(800);
			// Feedback continuous, persistence discrete (SPEC §4.2). A hold
			// that committed per repeat would rebuild the card under the finger
			// a dozen times.
			expect(onChange).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('stops repeating and keeps what it reached when the capture is lost', () => {
		vi.useFakeTimers();
		try {
			const onChange = vi.fn();
			const el = render({ max: '400' }, { current: '400' }, { onChange });
			const { current, steps } = parts(el);
			hold(steps[0], 1000);
			const reached = current?.value;
			steps[0]?.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
			vi.advanceTimersByTime(2000);
			// Cancelled, not abandoned: the repeat stops where it was and the
			// value it reached is still what gets written.
			expect(current?.value).toBe(reached);
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onChange).toHaveBeenCalledWith({ current: reached });
		} finally {
			vi.useRealTimers();
		}
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

	it('moves to the temporary field, as a card moves to its note', () => {
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
		// The cell is grid placement; the card is the object. A lone card
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
		// The press takes focus deliberately — it is the field the buttons
		// adjust, and it gives the run a blur to flush on.
		press(parts(el).steps[1]);
		expect(document.activeElement).toBe(parts(el).current);
		settle(el);
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

/**
 * Run animation frames synchronously for the duration of `body`. A throw
 * coasts over successive frames now, so a test that only dispatches pointerup
 * sees the drag and none of the throw.
 */
const withFrames = (body: () => void): void => {
	const original = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = (callback: FrameRequestCallback) => {
		callback(0);
		return 0;
	};
	try {
		body();
	} finally {
		window.requestAnimationFrame = original;
	}
};

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
		// A ceiling far enough away that the whole drag stays inside it, so this
		// measures tracking rather than resistance.
		const el = render({}, { current: '22' }, { onChange, resolved: { max: 200 } });
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
		withFrames(() => drag(current, [40, 90, 150, 220], 8));
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
		withFrames(() => flick(current));
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
		withFrames(() => flick(current));
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

describe('pool hideFill', () => {
	const track = (el: HTMLElement) => el.querySelector('.sheetsmith-pool-track');

	it('draws the bar by default, so an existing layout keeps it', () => {
		expect(track(render({}, { current: '5' }, { resolved: { max: 54 } }))).not.toBeNull();
	});

	it('leaves the bar off when the layout asks', () => {
		expect(
			track(render({ hideFill: true }, { current: '5' }, { resolved: { max: 54 } })),
		).toBeNull();
	});

	it('keeps the numbers and the boundary colour without the bar', () => {
		// The bar is the shape of the value; hiding it must not take the value's
		// status with it.
		const el = render({ hideFill: true }, { current: '0' }, { resolved: { max: 54 } });
		const { current, max } = parts(el);
		expect(current?.value).toBe('0');
		expect(max?.textContent).toBe('54');
		expect(current?.classList.contains('sheetsmith-pool-spent')).toBe(true);
	});

	it('is offered as a config field the editor can render', () => {
		const field = pool.configFields.find((f) => f.key === 'hideFill');
		expect(field?.kind).toBe('boolean');
		expect(field?.default).toBe(false);
	});
});

describe('pool temporary points absorb a spend', () => {
	const press = (button: HTMLButtonElement | undefined, init: PointerEventInit = {}) => {
		button?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0, ...init }));
		button?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0, ...init }));
	};
	const withTemp = (current: string, temp: string, onChange = vi.fn()) => {
		const el = render({ hasTemp: true }, { current, temp }, { onChange, resolved: { max: 54 } });
		return { el, onChange, ...parts(el) };
	};

	it('takes the buffer first and leaves the pool alone', () => {
		// This is what makes hasTemp a buffer rather than a second number
		// parked beside the pool.
		const { el, onChange, steps, current, temp } = withTemp('20', '5');
		press(steps[0]);
		expect(temp?.value).toBe('4');
		expect(current?.value).toBe('20');
		settle(el);
		expect(onChange).toHaveBeenCalledWith({ temp: '4' });
	});

	it('crosses into the pool once the buffer runs out, in one change', () => {
		// Seven damage against three temporary points: the buffer goes, and the
		// remaining four come off the pool — reported together, because writing
		// them separately would be two saves for one press.
		const { el, onChange, steps, current, temp } = withTemp('20', '3');
		press(steps[0], { shiftKey: true });
		expect(temp?.value).toBe('0');
		expect(current?.value).toBe('13');
		settle(el);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ current: '13', temp: '0' });
	});

	it('does not refill the buffer when healing', () => {
		// A buffer healing restored would be an extension of the maximum, and
		// that is what max is for.
		const { steps, current, temp } = withTemp('20', '3');
		press(steps[1]);
		expect(current?.value).toBe('21');
		expect(temp?.value).toBe('3');
	});

	it('spends through the buffer on the arrow keys too', () => {
		// The gesture that would otherwise have walked past it.
		const { current, temp } = withTemp('20', '2');
		current?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
		);
		expect(temp?.value).toBe('1');
		expect(current?.value).toBe('20');
	});

	it('spends the pool directly where there is no buffer', () => {
		const { current, temp } = withTemp('20', '0');
		current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
		expect(current?.value).toBe('19');
		expect(temp?.value).toBe('0');
	});

	it('leaves the buffer out of it when the layout has none', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '20' }, { onChange });
		press(parts(el).steps[0]);
		settle(el);
		expect(onChange).toHaveBeenCalledWith({ current: '19' });
	});

	it('announces the buffer when that is what moved', () => {
		const { el, steps } = withTemp('20', '5');
		press(steps[0]);
		settle(el);
		expect(el.querySelector('[aria-live]')?.textContent).toContain('4 temporary');
	});

	it("leaves the fill bar alone while only the buffer drains", () => {
		// Correct rather than incidental: the pool has not been touched, and the
		// bar is the pool's proportion. The buffer sits above the maximum.
		const { el, steps } = withTemp('27', '5');
		const before = el
			.querySelector<HTMLElement>('.sheetsmith-pool')
			?.style.getPropertyValue('--sheetsmith-pool-fill');
		press(steps[0]);
		expect(
			el.querySelector<HTMLElement>('.sheetsmith-pool')?.style.getPropertyValue(
				'--sheetsmith-pool-fill',
			),
		).toBe(before);
	});
});

describe('pool boundary resistance', () => {
	const dragBy = (input: HTMLInputElement, px: number) => {
		const down = new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 0 });
		Object.defineProperty(down, 'timeStamp', { value: 0 });
		input.dispatchEvent(down);
		// One slow move, so no momentum is projected.
		const move = new PointerEvent('pointermove', { pointerId: 1, clientX: px });
		Object.defineProperty(move, 'timeStamp', { value: 5000 });
		input.dispatchEvent(move);
		const up = new PointerEvent('pointerup', { pointerId: 1, clientX: px });
		Object.defineProperty(up, 'timeStamp', { value: 5000 });
		input.dispatchEvent(up);
	};

	it('costs one unit per six pixels inside the pool', () => {
		const el = render({}, { current: '30' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		dragBy(current, -60);
		expect(Number(current.value)).toBe(20);
	});

	it('stiffens once the pool runs past zero', () => {
		// 30 units of room, then resistance. 180px reaches zero; the next 120px
		// buys five more rather than twenty, so crossing is a decision.
		const el = render({}, { current: '30' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		dragBy(current, -300);
		expect(Number(current.value)).toBe(-5);
	});

	it('stiffens above the ceiling too', () => {
		const el = render({}, { current: '50' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		// 24px to reach 54, then 96px more buys four instead of sixteen.
		dragBy(current, 120);
		expect(Number(current.value)).toBe(58);
	});

	it('does not stiffen where the pool has no ceiling', () => {
		const el = render({ max: undefined }, { current: '10' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		dragBy(current, 60);
		expect(Number(current.value)).toBe(20);
	});
});

describe('pool throw coasts and can be caught', () => {
	const flick = (input: HTMLInputElement) => {
		const down = new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 0 });
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

	it('does not land the whole projection in one frame', () => {
		// The teleport this replaced: the finger lifts and the number jumps.
		const el = render({ max: undefined }, { current: '0' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		flick(current);
		// Only the drag has landed; the throw is still in flight.
		expect(Number(current.value)).toBe(37);
	});

	it('commits only once the throw has settled', () => {
		const onChange = vi.fn();
		const el = render({ max: undefined }, { current: '0' }, { onChange });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		flick(current);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('is caught by a press on the card, keeping where it reached', () => {
		// The undo this gesture had none of: the throw was over and committed
		// before it could be perceived.
		const onChange = vi.fn();
		const el = render({ max: undefined }, { current: '0' }, { onChange });
		document.body.appendChild(el);
		const current = parts(el).current;
		const card = el.querySelector<HTMLElement>('.sheetsmith-pool');
		if (!current || !card) throw new Error('expected the card');
		flick(current);
		const caught = Number(current.value);
		card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 0 }));
		expect(Number(current.value)).toBe(caught);
		expect(onChange).toHaveBeenCalledWith({ current: String(caught) });
		el.remove();
	});

	it('holds the scrubbing class until it settles, so the bar keeps pace', () => {
		const el = render({ max: undefined }, { current: '0' });
		const current = parts(el).current;
		const card = el.querySelector<HTMLElement>('.sheetsmith-pool');
		if (!current || !card) throw new Error('expected the card');
		flick(current);
		expect(card.classList.contains('sheetsmith-pool-scrubbing')).toBe(true);
		withFrames(() => card.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
		expect(card.classList.contains('sheetsmith-pool-scrubbing')).toBe(false);
	});
});

describe('pool card foot', () => {
	it('routes a press on the fill bar to the pool, not the buffer', () => {
		// The bar is a picture of the pool. Nearest-by-distance handed it to
		// temp, which is merely the lowest control.
		const el = render({ hasTemp: true }, { current: '20', temp: '3' }, {
			resolved: { max: 54 },
		});
		document.body.appendChild(el);
		const track = el.querySelector<HTMLElement>('.sheetsmith-pool-track');
		if (!track) throw new Error('expected the track');
		track.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, clientY: 9999 }),
		);
		expect(document.activeElement).toBe(parts(el).current);
		el.remove();
	});
});

describe('pool buffer feedback', () => {
	it('lights the pill when it absorbs a step', () => {
		// The big number does not move, so the feedback has to be where the
		// change actually happened.
		const el = render({ hasTemp: true }, { current: '20', temp: '4' });
		const step = parts(el).steps[0];
		step?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		expect(
			el.querySelector('.sheetsmith-pool-temp')?.classList.contains(
				'sheetsmith-pool-absorbed',
			),
		).toBe(true);
	});

	it('does not light it when the spend reaches the pool', () => {
		const el = render({ hasTemp: true }, { current: '20', temp: '0' });
		const step = parts(el).steps[0];
		step?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		expect(
			el.querySelector('.sheetsmith-pool-temp')?.classList.contains(
				'sheetsmith-pool-absorbed',
			),
		).toBe(false);
	});
});

describe('pool discoverability', () => {
	it('announces every route to a number', () => {
		// The drag, the hold and Shift were all undiscoverable at various
		// points. The amount is the only one that no longer needs announcing at
		// all, because it is a labelled control rather than a typing convention.
		const el = render();
		const current = parts(el).current;
		expect(current?.title).toContain('drag sideways');
		const describedBy = current?.getAttribute('aria-describedby');
		expect(describedBy).toBeTruthy();
		const hint = el.querySelector(`#${describedBy}`);
		expect(hint?.textContent).toContain('43-7');
		expect(hint?.textContent).toContain('Drag sideways');
		expect(hint?.textContent).toContain('repeat while held');
		expect(hint?.textContent).toContain('Shift');
		expect(hint?.textContent).toContain('adjust button');
	});

	it('no longer teaches a sign convention the field does not have', () => {
		// The regression guard for the hint as much as for the behaviour: two of
		// its sentences existed only to teach that a leading minus meant
		// something other than a minus, and then to teach the escape hatch for
		// what a minus no longer did.
		const el = render();
		const current = parts(el).current;
		const hint = el.querySelector(`#${current?.getAttribute('aria-describedby')}`);
		expect(hint?.textContent).not.toContain('0-17');
		expect(current?.title).not.toContain('-17');
	});

	it('names the amount control where a glyph cannot', () => {
		// `± ` is one mark in a set with the `−` and `+` beside it, which is what
		// it buys and also what it cannot say. The name and the tooltip carry the
		// words instead, so the glyph is never the only thing that explains it.
		const el = render();
		const { trigger } = parts(el);
		expect(trigger?.textContent).toBe('±');
		expect(trigger?.getAttribute('aria-label')).toBe('Adjust HP by an amount');
		expect(trigger?.title).toContain('Spend or restore');
	});

	it('keeps the direction in words for anyone the arrow does not reach', () => {
		const el = render();
		parts(el).trigger?.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0 }),
		);
		const { direction } = parts(el);
		expect(direction?.textContent).toBe('−');
		expect(direction?.getAttribute('aria-label')).toContain('Spending from HP');
		expect(direction?.title).toContain('Select to restore instead');
	});
});

describe('pool throw under reduced motion', () => {
	it('arrives without coasting', () => {
		// The destination is the same either way, so someone who asked for less
		// movement gets the value and not the journey.
		const original = window.matchMedia.bind(window);
		window.matchMedia = (query: string) =>
			({
				matches: query.includes('reduced-motion'),
				media: query,
				addEventListener: () => undefined,
				removeEventListener: () => undefined,
			}) as unknown as MediaQueryList;
		try {
			const el = render({ max: undefined }, { current: '0' });
			const current = parts(el).current;
			if (!current) throw new Error('expected the value');
			const down = new PointerEvent('pointerdown', {
				pointerId: 1,
				button: 0,
				clientX: 0,
			});
			Object.defineProperty(down, 'timeStamp', { value: 0 });
			current.dispatchEvent(down);
			let t = 0;
			for (const x of [40, 90, 150, 220]) {
				t += 8;
				const move = new PointerEvent('pointermove', { pointerId: 1, clientX: x });
				Object.defineProperty(move, 'timeStamp', { value: t });
				current.dispatchEvent(move);
			}
			const up = new PointerEvent('pointerup', { pointerId: 1, clientX: 220 });
			Object.defineProperty(up, 'timeStamp', { value: t });
			// No frames run: the whole throw has to have landed already.
			current.dispatchEvent(up);
			expect(Number(current.value)).toBeGreaterThan(37);
		} finally {
			window.matchMedia = original;
		}
	});
});

describe('pool arithmetic on commit', () => {
	const commit = (input: HTMLInputElement, typed: string) => {
		input.value = typed;
		input.dispatchEvent(new Event('blur'));
	};

	it('subtracts, which is how damage is said at a table', () => {
		// The alternative was the user doing the arithmetic and typing 36.
		const onChange = vi.fn();
		const el = render({}, { current: '43' }, { onChange });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		commit(current, '43-7');
		expect(onChange).toHaveBeenCalledWith({ current: '36' });
		// The field shows the answer, not the sum.
		expect(current.value).toBe('36');
	});

	it('handles a whole expression, through the real parser', () => {
		const el = render({}, { current: '10' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		commit(current, '10 + 2 * 3');
		expect(current.value).toBe('16');
	});

	it('sets a negative through arithmetic, since a bare sign is now a change', () => {
		// The cost of the delta rule, and its escape hatch. The hint says so.
		const onChange = vi.fn();
		const el = render({}, { current: '43' }, { onChange });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		commit(current, '0-7');
		expect(onChange).toHaveBeenCalledWith({ current: '-7' });
	});

	it('leaves text that is not arithmetic exactly as typed', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '43' }, { onChange });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		commit(current, 'lots');
		expect(onChange).toHaveBeenCalledWith({ current: 'lots' });
	});

	it('leaves a half-typed expression alone rather than guessing', () => {
		const el = render({}, { current: '43' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		commit(current, '43-');
		expect(current.value).toBe('43-');
	});

	it('repaints the fill from the computed value', () => {
		const el = render({}, { current: '54' }, { resolved: { max: 54 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		commit(current, '54-27');
		expect(
			Number(
				el.querySelector<HTMLElement>('.sheetsmith-pool')?.style.getPropertyValue(
					'--sheetsmith-pool-fill',
				),
			),
		).toBeCloseTo(0.5);
	});
});

describe('pool refuses a step it cannot make', () => {
	it('marks the field rather than doing nothing at all', () => {
		const el = render({}, { current: 'lots' });
		const current = parts(el).current;
		parts(el).steps[1]?.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0 }),
		);
		expect(current?.classList.contains('sheetsmith-pool-refused')).toBe(true);
	});

	it('marks it on the arrow keys too, which were equally silent', () => {
		const el = render({}, { current: 'lots' });
		const current = parts(el).current;
		current?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
		expect(current?.classList.contains('sheetsmith-pool-refused')).toBe(true);
	});
});

describe('pool throw with no ceiling', () => {
	it('is bounded even without a max to take a share of', () => {
		const el = render({ max: undefined }, { current: '0' });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		const down = new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 0 });
		Object.defineProperty(down, 'timeStamp', { value: 0 });
		current.dispatchEvent(down);
		let t = 0;
		// A hard release: 4000px/s would project some sixty units unbounded.
		for (const x of [100, 250, 450, 700]) {
			t += 4;
			const move = new PointerEvent('pointermove', { pointerId: 1, clientX: x });
			Object.defineProperty(move, 'timeStamp', { value: t });
			current.dispatchEvent(move);
		}
		const up = new PointerEvent('pointerup', { pointerId: 1, clientX: 700 });
		Object.defineProperty(up, 'timeStamp', { value: t });
		withFrames(() => current.dispatchEvent(up));
		// 700px of drag is ~117 units; the throw may add at most 25.
		expect(Number(current.value)).toBeLessThanOrEqual(117 + 25);
	});
});

describe('pool gesture is derived from its origin', () => {
	const hold = (button: HTMLButtonElement | undefined, ticks: number) => {
		button?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		// Each further pointerdown stands in for a repeat tick without waiting.
		for (let i = 1; i < ticks; i++) {
			button?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		}
		button?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0 }));
	};

	it('refunds the buffer when a gesture reverses to nothing', () => {
		// Incrementally this took a point off the buffer and handed it to the
		// pool, so a press and its reversal left a third state that was neither.
		const el = render({ hasTemp: true }, { current: '43', temp: '8' }, {
			resolved: { max: 54 },
		});
		const { current, temp, steps } = parts(el);
		hold(steps[0], 1);
		expect(temp?.value).toBe('7');
		// Same gesture, reversed: back to exactly where it started.
		hold(steps[1], 1);
		expect(temp?.value).toBe('8');
		expect(current?.value).toBe('43');
	});

	it('crosses into the pool and back out again cleanly', () => {
		const el = render({ hasTemp: true }, { current: '43', temp: '2' }, {
			resolved: { max: 54 },
		});
		const { current, temp, steps } = parts(el);
		// Four down: the buffer covers two, the pool takes two.
		hold(steps[0], 4);
		expect(temp?.value).toBe('0');
		expect(current?.value).toBe('41');
		// Two up within the same gesture: the pool is repaid before the buffer.
		hold(steps[1], 2);
		expect(current?.value).toBe('43');
		expect(temp?.value).toBe('0');
	});

	it('never drives the buffer below nothing', () => {
		// The pool may run negative because the game decides; the buffer may not,
		// because this component is what defines it.
		const el = render({ hasTemp: true }, { current: '43', temp: '1' }, {
			resolved: { max: 54 },
		});
		const { temp } = parts(el);
		hold(parts(el).steps[0], 5);
		expect(Number(temp?.value)).toBe(0);
	});

	it('floors a typed buffer value too', () => {
		// The floor has to hold however the value arrived, and typing is the
		// only way in now that the pill has no steppers.
		const onChange = vi.fn();
		const el = render({ hasTemp: true }, { current: '43', temp: '3' }, { onChange });
		const temp = parts(el).temp;
		if (!temp) throw new Error('expected the buffer');
		temp.value = '-5';
		temp.dispatchEvent(new Event('blur'));
		expect(temp.value).toBe('0');
		expect(onChange).toHaveBeenCalledWith({ temp: '0' });
	});

	it('starts a fresh gesture after typing', () => {
		// Typing sets a value outright, so an earlier press is no longer the
		// measure for what comes next.
		const el = render({ hasTemp: true }, { current: '43', temp: '5' }, {
			resolved: { max: 54 },
		});
		const { current, temp, steps } = parts(el);
		if (!current) throw new Error('expected the value');
		hold(steps[0], 1);
		expect(temp?.value).toBe('4');
		current.value = '30';
		current.dispatchEvent(new Event('blur'));
		hold(steps[0], 1);
		expect(temp?.value).toBe('3');
		expect(current.value).toBe('30');
	});

	it('retraces a reversed drag exactly', () => {
		const el = render({ hasTemp: true }, { current: '30', temp: '4' }, {
			resolved: { max: 54 },
		});
		const { current, temp } = parts(el);
		if (!current) throw new Error('expected the value');
		const down = new PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 0 });
		Object.defineProperty(down, 'timeStamp', { value: 0 });
		current.dispatchEvent(down);
		const move = (x: number, t: number) => {
			const event = new PointerEvent('pointermove', { pointerId: 1, clientX: x });
			Object.defineProperty(event, 'timeStamp', { value: t });
			current.dispatchEvent(event);
		};
		move(-60, 1000);
		expect(temp?.value).toBe('0');
		expect(current.value).toBe('24');
		// Back to the grab point: the buffer is whole again.
		move(0, 2000);
		expect(temp?.value).toBe('4');
		expect(current.value).toBe('30');
	});
});

describe('pool write coalescing', () => {
	it('writes on its own once the run goes quiet', async () => {
		// The flush paths cover leaving the card; this is the one that covers
		// walking away from it entirely.
		vi.useFakeTimers();
		try {
			const onChange = vi.fn();
			const el = render({}, { current: '22' }, { onChange });
			parts(el).steps[0]?.dispatchEvent(
				new PointerEvent('pointerdown', { pointerId: 1, button: 0 }),
			);
			parts(el).steps[0]?.dispatchEvent(
				new PointerEvent('pointerup', { pointerId: 1, button: 0 }),
			);
			expect(onChange).not.toHaveBeenCalled();
			vi.advanceTimersByTime(800);
			expect(onChange).toHaveBeenCalledWith({ current: '21' });
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not write from a card that has been replaced', () => {
		// A rebuild detaches the inputs, and a pending write would be reading
		// values out of dead nodes.
		vi.useFakeTimers();
		try {
			const onChange = vi.fn();
			const el = render({}, { current: '22' }, { onChange });
			parts(el).steps[0]?.dispatchEvent(
				new PointerEvent('pointerdown', { pointerId: 1, button: 0 }),
			);
			parts(el).steps[0]?.dispatchEvent(
				new PointerEvent('pointerup', { pointerId: 1, button: 0 }),
			);
			el.remove();
			vi.advanceTimersByTime(800);
			expect(onChange).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('pool fill bar press', () => {
	it('routes to the pool by target, whatever the layout geometry', () => {
		const el = render({ hasTemp: true }, { current: '20', temp: '3' }, {
			resolved: { max: 54 },
		});
		const track = el.querySelector<HTMLElement>('.sheetsmith-pool-track');
		if (!track) throw new Error('expected the track');
		track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(document.activeElement).toBe(parts(el).current);
	});
});

describe('pool buffer pill', () => {
	it('has no steppers: a buffer is replaced, never incremented', () => {
		// Nothing adds temporary points to temporary points, and a second minus
		// on the card meaning something different from the first is a mapping
		// the reader would have to learn.
		const el = render({ hasTemp: true }, { current: '20', temp: '4' });
		const pill = el.querySelector('.sheetsmith-pool-temp');
		expect(pill?.querySelector('.sheetsmith-pool-step')).toBeNull();
		// And the pool's own two are untouched.
		expect(parts(el).steps).toHaveLength(2);
	});

	it('quietens when it holds nothing', () => {
		const empty = render({ hasTemp: true }, { current: '20', temp: '0' });
		expect(
			empty.querySelector('.sheetsmith-pool-temp')?.classList.contains(
				'sheetsmith-pool-temp-empty',
			),
		).toBe(true);
		const held = render({ hasTemp: true }, { current: '20', temp: '4' });
		expect(
			held.querySelector('.sheetsmith-pool-temp')?.classList.contains(
				'sheetsmith-pool-temp-empty',
			),
		).toBe(false);
	});

	it('quietens as the last point is absorbed', () => {
		const el = render({ hasTemp: true }, { current: '20', temp: '1' });
		parts(el).steps[0]?.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0 }),
		);
		expect(
			el.querySelector('.sheetsmith-pool-temp')?.classList.contains(
				'sheetsmith-pool-temp-empty',
			),
		).toBe(true);
	});
});

describe('pool applyReset clears the buffer', () => {
	const reset = (
		binding: { action?: 'full' | 'empty' | 'formula'; buffer?: 'clear'; to?: string },
		resolve: (field: string) => number | null = () => 31,
	) =>
		pool.applyReset?.(
			{ current: '3', temp: '7' },
			{ ...config, hasTemp: true },
			{ trigger: 'Long rest', ...binding },
			{ resolve: (field) => resolve(field), explain: () => null },
		);

	it('clears the buffer alongside restoring the pool', () => {
		expect(reset({ action: 'full', buffer: 'clear' })).toEqual({
			ok: true,
			data: { temp: '0', current: '31' },
		});
	});

	it('clears the buffer and leaves the pool alone', () => {
		// The 4e shape: an encounter ends, the buffer goes, hit points stay.
		expect(reset({ buffer: 'clear' })).toEqual({
			ok: true,
			data: { temp: '0' },
		});
	});

	it('leaves the buffer alone unless the binding says to clear it', () => {
		// Which rest clears temporary points is the system's rule, so silence
		// means "do not touch it".
		expect(reset({ action: 'full' })).toEqual({
			ok: true,
			data: { current: '31' },
		});
	});

	it('does not invent a buffer on a pool that has none', () => {
		expect(
			pool.applyReset?.(
				{ current: '3' },
				config,
				{ trigger: 'Long rest', buffer: 'clear' },
				{ resolve: () => 31, explain: () => null },
			),
		).toEqual({ ok: true, data: {} });
	});

	it('still reports a failure when the action cannot resolve', () => {
		const result = reset({ action: 'full', buffer: 'clear' }, () => null);
		expect(result?.ok).toBe(false);
	});

	it('declares that it holds a buffer, so the editor can offer the option', () => {
		expect(pool.hasBuffer).toBe(true);
	});
});


describe('pool value field holds only values', () => {
	/** Typing, as a person does it: keystrokes, then leaving the field. */
	const type = (input: HTMLInputElement, text: string) => {
		input.value = text;
		input.dispatchEvent(new Event('input'));
		input.dispatchEvent(new Event('blur'));
	};

	it('sets a negative rather than reading it as an amount', () => {
		// The convention this replaces. A field cannot tell `-17` the value from
		// `-17` the change, and the ambiguity cost three defects: everything
		// painted from the field read the amount as the value, a caret landing
		// left of the digits turned a spend of two into a value of minus twenty,
		// and a press arriving before the commit took the amount as its origin.
		const onChange = vi.fn();
		const el = render({}, { current: '62' }, { onChange, resolved: { max: 62 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		type(current, '-17');
		expect(current.value).toBe('-17');
		expect(onChange).toHaveBeenCalledWith({ current: '-17' });
	});

	it('cannot be made to write a value the caret invented', () => {
		// What a tap on the left half of the digit used to produce: the caret
		// lands at offset zero, so typing an amount prepends it. As a value this
		// is simply what it says, and the amount control has no caret to land in
		// the wrong place because it starts empty.
		const el = render({}, { current: '5' }, { resolved: { max: 10 } });
		const current = parts(el).current;
		if (!current) throw new Error('expected the value');
		type(current, '-25');
		expect(current.value).toBe('-25');
	});

	it('still settles arithmetic, which is unambiguous', () => {
		// The rule that can live on a value field: it differs from a plain
		// number only when an operator follows one.
		const el = render({ hasTemp: true }, { current: '62', temp: '5' }, {
			resolved: { max: 62 },
		});
		const { current, temp } = parts(el);
		if (!current) throw new Error('expected the value');
		type(current, '62-17');
		expect(current.value).toBe('45');
		// A set, so the buffer is not spent: only the amount control spends.
		expect(temp?.value).toBe('5');
	});

	it('shows no false state while an amount is being entered elsewhere', () => {
		// Finding one, and the reason the amount moved off this field. Typing
		// "-2" here used to drain the fill bar to nothing and mark the number
		// spent for as long as the draft sat there, then snap back to 3. The
		// value and the boundary colour are what must not move; the bar shows
		// the pending amount deliberately, and says so as a preview.
		const el = render({ hasTemp: true }, { current: '5', temp: '0' }, {
			resolved: { max: 10 },
		});
		const { current, trigger, amount } = parts(el);
		if (!current || !amount) throw new Error('expected the fields');
		trigger?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		amount.value = '2';
		amount.dispatchEvent(new Event('input'));
		expect(current.value).toBe('5');
		expect(current.classList.contains('sheetsmith-pool-spent')).toBe(false);
	});
});

describe('pool amount control', () => {
	const open = (el: HTMLElement) => {
		const { trigger, amount } = parts(el);
		trigger?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		if (!amount) throw new Error('expected the amount field');
		return amount;
	};

	const enter = (amount: HTMLInputElement) => {
		amount.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
	};

	const put = (amount: HTMLInputElement, text: string) => {
		amount.value = text;
		amount.dispatchEvent(new Event('input'));
	};

	it('is closed until it is asked for, so the common path stays a press', () => {
		const el = render();
		const { adjust } = parts(el);
		expect(adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(false);
		expect(el.querySelector('.sheetsmith-pool-controls-adjusting')).toBeNull();
	});

	it('claims no aria-expanded, because it is not a disclosure', () => {
		// The trigger is replaced by the form rather than sitting above it, so
		// the state would be announced on an element nobody can reach. What says
		// the mode changed is focus arriving in a field that names the direction.
		const el = render();
		expect(parts(el).trigger?.hasAttribute('aria-expanded')).toBe(false);
	});

	it('opens on the press and takes the caret, rather than waiting for release', () => {
		const el = render();
		const amount = open(el);
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(true);
		expect(document.activeElement).toBe(amount);
	});

	it('stands the steppers down while it is open, so nothing shoves', () => {
		// The panel is wider than the glyph it replaces, and a centred row
		// answers that by pushing the steppers outwards — instantly, on
		// pointer-down, under a finger still on the card. The row's class is what
		// takes them out of the layout for the duration.
		const el = render();
		const controls = el.querySelector('.sheetsmith-pool-controls');
		expect(controls?.classList.contains('sheetsmith-pool-controls-adjusting')).toBe(false);
		open(el);
		expect(controls?.classList.contains('sheetsmith-pool-controls-adjusting')).toBe(true);
		parts(el).amount?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		expect(controls?.classList.contains('sheetsmith-pool-controls-adjusting')).toBe(false);
	});

	it('opens from the keyboard too', () => {
		// Activation fires click on the focused trigger, and it bubbles — which
		// is the only reason the listener can live on the wrapper instead. It has
		// to live there: by the time a *pointer* click is dispatched the trigger
		// is already display:none, so the event is delivered to the common
		// ancestor of the press and the release, and a listener on the button
		// would never have run for a pointer at all.
		const el = render();
		parts(el).trigger?.dispatchEvent(
			new MouseEvent('click', { detail: 0, bubbles: true }),
		);
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(true);
	});

	it('asks for focus again on the click that follows the press', () => {
		// iOS may decline to raise a keyboard for a focus() made under a
		// prevented pointerdown. The click is a second user gesture, and asking
		// again costs nothing when the first attempt worked — the field already
		// has focus then, so nothing happens.
		const el = render();
		const amount = open(el);
		amount.blur();
		expect(document.activeElement).not.toBe(amount);
		parts(el).adjust?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.activeElement).toBe(amount);
	});

	it('does not disturb the entry when the click was aimed at the direction', () => {
		// The toggle hands focus back to the field itself, so the wrapper must
		// keep its hands off a click headed there — and the amount already typed
		// has to survive a change of mind about which way it goes.
		const el = render({}, { current: '62' }, { resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		const { direction } = parts(el);
		direction?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(direction?.textContent).toBe('+');
		expect(amount.value).toBe('17');
		expect(document.activeElement).toBe(amount);
	});

	it('spends a bare amount, which is what makes it reachable on a phone', () => {
		// No sign is typed anywhere: iOS's numeric keypad has no minus key, so a
		// signed amount was untypeable on the device most likely to be at a
		// table. The direction is a button instead.
		const onChange = vi.fn();
		const el = render({}, { current: '62' }, { onChange, resolved: { max: 62 } });
		const amount = open(el);
		expect(amount.inputMode).toBe('numeric');
		put(amount, '17');
		enter(amount);
		expect(parts(el).current?.value).toBe('45');
		expect(onChange).toHaveBeenCalledWith({ current: '45' });
	});

	it('restores when the direction says so', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '45' }, { onChange, resolved: { max: 62 } });
		const amount = open(el);
		const { direction } = parts(el);
		expect(direction?.textContent).toBe('−');
		direction?.dispatchEvent(new MouseEvent('click'));
		expect(direction?.textContent).toBe('+');
		// The default being unmarked is what makes the exception visible.
		expect(direction?.classList.contains('sheetsmith-pool-adjust-restoring')).toBe(true);
		put(amount, '17');
		enter(amount);
		expect(parts(el).current?.value).toBe('62');
		expect(onChange).toHaveBeenCalledWith({ current: '62' });
	});

	it('lets an explicit sign win, and moves the direction to match it', () => {
		// Two sources for one sign is the ambiguity this control exists to
		// remove, so the toggle follows what was typed: the control can never
		// show a direction its own outcome contradicts.
		const el = render({}, { current: '45' }, { resolved: { max: 62 } });
		const amount = open(el);
		const { direction } = parts(el);
		direction?.dispatchEvent(new MouseEvent('click'));
		expect(direction?.textContent).toBe('+');
		put(amount, '-17');
		expect(direction?.textContent).toBe('−');
		expect(direction?.getAttribute('aria-label')).toContain('Spending from HP');
		enter(amount);
		expect(parts(el).current?.value).toBe('28');
	});

	it('takes an expression as the amount', () => {
		const el = render({}, { current: '30' }, { resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '2*3');
		enter(amount);
		expect(parts(el).current?.value).toBe('24');
	});

	it('spends the buffer first, and writes both fields as one change', () => {
		// No route to a number on this card walks past the buffer, and a spend
		// that crossed from it into the pool is one save rather than two.
		const onChange = vi.fn();
		const el = render({ hasTemp: true }, { current: '62', temp: '5' }, {
			onChange,
			resolved: { max: 62 },
		});
		const amount = open(el);
		put(amount, '17');
		enter(amount);
		expect(parts(el).current?.value).toBe('50');
		expect(parts(el).temp?.value).toBe('0');
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ current: '50', temp: '0' });
	});

	it('previews where the amount lands, including the buffer split', () => {
		// The sentence the card had nowhere to put: a spend the buffer covers
		// whole leaves the big number exactly where it was, which the flash on
		// the pill could only report after the fact.
		const el = render({ hasTemp: true }, { current: '62', temp: '5' }, {
			resolved: { max: 62 },
		});
		const amount = open(el);
		put(amount, '17');
		expect(parts(el).preview?.textContent).toBe('−17 → 50 · temp 0');
		put(amount, '3');
		expect(parts(el).preview?.textContent).toBe('−3 → 62 · temp 2');
	});

	it('speaks the pending outcome, for the reader the line cannot reach', () => {
		// The written line is aria-hidden and the bar is a shape, so the rule the
		// card is built on — the outcome on screen before it is applied — was
		// being kept for the eye alone. Debounced, or it narrates every digit.
		vi.useFakeTimers();
		try {
			const el = render({ hasTemp: true }, { current: '62', temp: '5' }, {
				resolved: { max: 62 },
			});
			const amount = open(el);
			put(amount, '1');
			put(amount, '17');
			expect(parts(el).status?.textContent).toBe('');
			vi.advanceTimersByTime(700);
			// Said for speech rather than drawn: the arrow and the middle dot are
			// a shape on a screen and a mess read aloud.
			expect(parts(el).status?.textContent).toBe(
				'Spend 17, 5 from temporary, HP 50, 0 temporary',
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('never lets a stale preview land on top of a commit', () => {
		vi.useFakeTimers();
		try {
			const el = render({}, { current: '62' }, { resolved: { max: 62 } });
			const amount = open(el);
			put(amount, '17');
			amount.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
			vi.advanceTimersByTime(2000);
			expect(parts(el).status?.textContent).toContain('45');
		} finally {
			vi.useRealTimers();
		}
	});

	it('previews a plain outcome where no buffer is involved', () => {
		const el = render({}, { current: '62' }, { resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		expect(parts(el).preview?.textContent).toBe('−17 → 45');
	});

	it('draws the pending amount on the bar, in the card’s own language', () => {
		// The preview says the outcome as a number; the bar says it as a shape,
		// and the two halves of one piece of feedback should not arrive at
		// different times. The solid bar is always the smaller of the two, so a
		// spend reads as "this stays, this goes" and a restore as "you have this,
		// this arrives" — one rule for both directions.
		const el = render({}, { current: '5' }, { resolved: { max: 10 } });
		const card = el.querySelector<HTMLElement>('.sheetsmith-pool');
		const amount = open(el);
		expect(card?.style.getPropertyValue('--sheetsmith-pool-fill')).toBe('0.5');

		put(amount, '2');
		expect(card?.style.getPropertyValue('--sheetsmith-pool-fill')).toBe('0.3');
		expect(card?.style.getPropertyValue('--sheetsmith-pool-ghost')).toBe('0.5');

		parts(el).direction?.dispatchEvent(new MouseEvent('click'));
		expect(card?.style.getPropertyValue('--sheetsmith-pool-fill')).toBe('0.5');
		expect(card?.style.getPropertyValue('--sheetsmith-pool-ghost')).toBe('0.7');
	});

	it('takes the pending bar back when the amount is abandoned', () => {
		const el = render({}, { current: '5' }, { resolved: { max: 10 } });
		const card = el.querySelector<HTMLElement>('.sheetsmith-pool');
		const amount = open(el);
		put(amount, '2');
		amount.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(card?.style.getPropertyValue('--sheetsmith-pool-fill')).toBe('0.5');
		expect(card?.style.getPropertyValue('--sheetsmith-pool-ghost')).toBe('0');
	});

	it('says which way, not just where it lands', () => {
		// `→ 45` distinguishes a spend from a restore only if the reader
		// remembers they were at 62. The sign is on the line the eye is on.
		const el = render({}, { current: '45' }, { resolved: { max: 62 } });
		const amount = open(el);
		parts(el).direction?.dispatchEvent(new MouseEvent('click'));
		put(amount, '17');
		expect(parts(el).preview?.textContent).toBe('+17 → 62');
	});

	it('names the direction on the field a screen reader is taken to', () => {
		// The preview is aria-hidden and the announcement arrives after the
		// fact, so the field's own name was the only place the direction could
		// be checked before it applied — and it did not mention it.
		const el = render({}, { current: '45' }, { resolved: { max: 62 } });
		const amount = open(el);
		expect(amount.getAttribute('aria-label')).toBe('Amount to spend from HP');
		parts(el).direction?.dispatchEvent(new MouseEvent('click'));
		expect(amount.getAttribute('aria-label')).toBe('Amount to restore to HP');
	});

	it('reserves the outcome line, so typing moves nothing', () => {
		// It used to sit in the row between the direction and nothing, competing
		// for width with a button either side: on a narrow card it wrapped, which
		// grew the card, which grew every card in the grid row beside it. On its
		// own line, always present, the row cannot change shape as the text does.
		const el = render();
		const line = el.querySelector('.sheetsmith-pool-preview');
		expect(line).not.toBeNull();
		expect(line?.parentElement?.className).toBe('sheetsmith-pool');
		expect(line?.nextElementSibling?.className).toBe('sheetsmith-pool-controls');
		expect(line?.textContent).toBe('');
	});

	it('says nothing until there is an amount to say it about', () => {
		const el = render({}, { current: '62' }, { resolved: { max: 62 } });
		const amount = open(el);
		expect(parts(el).preview?.textContent).toBe('');
		put(amount, '0');
		expect(parts(el).preview?.textContent).toBe('');
	});

	it('closes and clears once applied, ready for the next amount', () => {
		const el = render({}, { current: '62' }, { resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		enter(amount);
		expect(amount.value).toBe('');
		expect(parts(el).preview?.textContent).toBe('');
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(false);
	});

	it('abandons on Escape, as every field on the card does', () => {
		const onChange = vi.fn();
		const el = render({}, { current: '62' }, { onChange, resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		amount.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		expect(parts(el).current?.value).toBe('62');
		expect(onChange).not.toHaveBeenCalled();
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(false);
	});

	it('abandons on the way out rather than spending unasked', async () => {
		// Every field on this card commits on the way out, and that rule is
		// right for a field holding a value and wrong for a control issuing a
		// command. A value can be re-read and retyped because it is still on
		// screen; a stray tap here used to spend seventeen points silently and
		// leave nothing behind to say what did it. A mode dismisses.
		const onChange = vi.fn();
		const el = render({}, { current: '62' }, { onChange, resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		parts(el).current?.focus();
		await new Promise((resolve) => window.setTimeout(resolve, 0));
		expect(parts(el).current?.value).toBe('62');
		expect(onChange).not.toHaveBeenCalled();
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(false);
	});

	it('cancels from the direction toggle too, where Escape had a hole', () => {
		// The toggle is a tab stop, and Escape was bound to the field alone.
		const onChange = vi.fn();
		const el = render({}, { current: '62' }, { onChange, resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		const { direction } = parts(el);
		direction?.focus();
		direction?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
		);
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(false);
		expect(amount.value).toBe('');
		expect(onChange).not.toHaveBeenCalled();
	});

	it('does not spend twice when a stepper takes over mid-entry', async () => {
		// It used to: focusing the value field flushed the pending amount, then
		// the step applied on top of the already-spent draft, so 62 with 17
		// typed and one press of minus committed 44. Leaving now abandons the
		// amount, so the press is worth exactly the one point it says.
		const onChange = vi.fn();
		const el = render({}, { current: '62' }, { onChange, resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		const steps = parts(el).steps;
		steps[0]?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, button: 0 }));
		steps[0]?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, button: 0 }));
		await new Promise((resolve) => window.setTimeout(resolve, 0));
		parts(el).current?.dispatchEvent(new Event('blur'));
		expect(onChange).toHaveBeenCalledWith({ current: '61' });
	});

	it('returns focus to the trigger, which survives the rebuild', () => {
		// A commit re-renders the sheet, and the view restores focus by
		// (cell, control index) — see SheetView.captureFocus. The panel's
		// children are in the DOM whether it is open or closed, so the trigger
		// keeps its index and a run of amounts costs one press of ± between
		// them rather than a hunt for a 24px glyph.
		const el = render({}, { current: '62' }, { resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		amount.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		expect(document.activeElement).toBe(parts(el).trigger);
		const controls = Array.from(el.querySelectorAll(FOCUSABLE));
		const openIndex = controls.indexOf(parts(el).trigger as Element);
		open(el);
		const whileOpen = Array.from(el.querySelectorAll(FOCUSABLE));
		expect(whileOpen.indexOf(parts(el).trigger as Element)).toBe(openIndex);
	});

	it('stays open while focus moves within it', async () => {
		// The direction toggle takes focus off the field, and that must not read
		// as leaving mid-entry.
		const el = render({}, { current: '62' }, { resolved: { max: 62 } });
		const amount = open(el);
		put(amount, '17');
		parts(el).direction?.dispatchEvent(new MouseEvent('click'));
		await new Promise((resolve) => window.setTimeout(resolve, 0));
		expect(parts(el).adjust?.classList.contains('sheetsmith-pool-adjust-open')).toBe(true);
		expect(amount.value).toBe('17');
	});

	it('refuses an amount when there is no number to take it off', () => {
		// Refusing is right, and refusing in silence is a dead control: the mark
		// says the amount was heard and had nothing to apply to.
		const onChange = vi.fn();
		const el = render({}, { current: 'lots' }, { onChange });
		const amount = open(el);
		put(amount, '17');
		expect(parts(el).preview?.textContent).toBe('');
		enter(amount);
		expect(parts(el).current?.value).toBe('lots');
		expect(parts(el).current?.classList.contains('sheetsmith-pool-refused')).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('keeps its own presses, rather than handing them to the value', () => {
		// The card routes a press anywhere on it to the nearest field, and the
		// amount field is not one of those. Without an exemption the control
		// would lose focus to the value the moment it was touched.
		const el = render();
		const amount = open(el);
		amount.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0, bubbles: true }),
		);
		expect(document.activeElement).toBe(amount);
	});
});

describe('pool controls sit together under the reading', () => {
	it('gives the number the row to itself', () => {
		// The card divides into what the pool is and what changes it. The value
		// takes the full width and the card's centre line, so a sheet of pools
		// reads as a column of numbers rather than numbers wrapped in chrome.
		const el = render();
		const row = el.querySelector('.sheetsmith-pool-row');
		expect(row?.querySelectorAll('.sheetsmith-pool-step')).toHaveLength(0);
		expect(row?.querySelector('.sheetsmith-pool-adjust')).toBeNull();
		expect(row?.querySelector('.sheetsmith-pool-current')).not.toBeNull();
	});

	it('orders the controls as minus, amount, plus', () => {
		// The two directions either side of "by how much", which is what makes
		// the middle control read as belonging with the two beside it.
		const el = render();
		const controls = el.querySelector('.sheetsmith-pool-controls');
		const order = Array.from(controls?.children ?? []).map((child) => child.className);
		expect(order).toEqual([
			'sheetsmith-pool-step',
			'sheetsmith-pool-adjust',
			'sheetsmith-pool-step',
		]);
		expect(controls?.children[0]?.textContent).toBe('−');
		expect(controls?.children[2]?.textContent).toBe('+');
	});

	it('keeps the fill bar the last thing on the card', () => {
		// The bar bleeds onto the border and reads as the card's own edge, which
		// only holds while there is nothing beneath it to divide from.
		const el = render({ hasTemp: true }, { current: '22', temp: '4' });
		const card = el.querySelector('.sheetsmith-pool');
		const visible = Array.from(card?.children ?? []).filter(
			(child) => !child.classList.contains('sheetsmith-sr-only'),
		);
		expect(visible.map((child) => child.className)).toEqual([
			'sheetsmith-pool-label',
			'sheetsmith-pool-row',
			'sheetsmith-pool-temp',
			// The outcome sits above the controls rather than inside the row, so
			// the row never changes shape as the text does.
			'sheetsmith-pool-preview',
			'sheetsmith-pool-controls',
			'sheetsmith-pool-track',
		]);
	});
});


/*
 * A max the character owns rather than the layout computing it.
 *
 * The two modes are exclusive, and that is what keeps §4.2's rule against
 * storing a derived value intact: a calculated max is never written to a note,
 * a character's max is never computed from one, and so there is only ever one
 * answer to "what is this character's maximum".
 */
describe('a pool whose max the character owns', () => {
	const owned: Partial<PoolConfig> = { maxSource: 'character', max: undefined };

	it('offers the choice, and calculated is what a layout gets by saying nothing', () => {
		const fields = pool.configFields;
		const source = fields.find((field) => field.key === 'maxSource');
		expect(source?.kind).toBe('select');
		// The first option is the one the editor omits, so every layout written
		// before this reads exactly as it did.
		expect(source?.options?.[0]).toBe('calculated');
		expect(source?.options).toContain('character');
	});

	it('hides the formula in the mode that has no formula', () => {
		const formula = pool.configFields.find((field) => field.key === 'max');
		expect(formula?.visibleWhen).toEqual({
			key: 'maxSource',
			equals: 'calculated',
		});
	});

	it('renders the ceiling as a field rather than a reading', () => {
		const el = render(owned, { current: '22', max: '31' });
		expect(parts(el).maxInput?.value).toBe('31');
		// Still inside the reading, so `22 / 31` is one line and not a form.
		expect(
			el.querySelector('.sheetsmith-pool-ceiling .sheetsmith-pool-max-input'),
		).not.toBeNull();
	});

	it('stays a reading where the layout computes it', () => {
		const el = render({}, { current: '22' });
		expect(parts(el).maxInput).toBeNull();
		expect(parts(el).max?.textContent).toBe('31');
	});

	it('invites the first one to be typed, rather than showing nothing', () => {
		// With no ceiling there is no bar and nothing else to press, so a pool
		// nobody has given a max yet has to show the field or it is a dead end.
		const el = render(owned, { current: '22' });
		expect(parts(el).maxInput?.value).toBe('');
		expect(parts(el).maxInput?.placeholder).toBe('—');
		expect(parts(el).track).toBeNull();
	});

	it('writes the ceiling and the value as one change', () => {
		const onChange = vi.fn();
		const el = render(owned, { current: '22', max: '31' }, { onChange });
		const { maxInput } = parts(el);
		if (!maxInput) throw new Error('expected a max field');
		maxInput.value = '38';
		maxInput.dispatchEvent(new Event('input'));
		maxInput.dispatchEvent(new Event('blur'));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledWith({ max: '38' });
	});

	it('settles arithmetic, which is how a max is actually arrived at', () => {
		// A roll plus a modifier, typed as said.
		const onChange = vi.fn();
		const el = render(owned, { current: '22', max: '31' }, { onChange });
		const { maxInput } = parts(el);
		if (!maxInput) throw new Error('expected a max field');
		maxInput.value = '31+7';
		maxInput.dispatchEvent(new Event('input'));
		maxInput.dispatchEvent(new Event('blur'));
		expect(maxInput.value).toBe('38');
		expect(onChange).toHaveBeenCalledWith({ max: '38' });
	});

	it('repaints the proportion from the max being typed, before it is committed', () => {
		// The ceiling is read rather than captured, which is the whole reason
		// the fill, the boundary colour and the throw's bound go through one
		// function: a max on its way to a new number moves all three.
		const el = render(owned, { current: '22', max: '31' });
		const card = el.querySelector<HTMLElement>('.sheetsmith-pool');
		expect(card?.style.getPropertyValue('--sheetsmith-pool-fill')).toBe(
			String(22 / 31),
		);
		const { maxInput } = parts(el);
		if (!maxInput) throw new Error('expected a max field');
		maxInput.value = '44';
		maxInput.dispatchEvent(new Event('input'));
		expect(card?.style.getPropertyValue('--sheetsmith-pool-fill')).toBe(
			String(22 / 44),
		);
	});

	it('marks the value above a ceiling the reader just lowered', () => {
		const el = render(owned, { current: '22', max: '31' });
		const { current, maxInput } = parts(el);
		expect(current?.classList.contains('sheetsmith-pool-over')).toBe(false);
		if (!maxInput) throw new Error('expected a max field');
		maxInput.value = '20';
		maxInput.dispatchEvent(new Event('input'));
		expect(current?.classList.contains('sheetsmith-pool-over')).toBe(true);
	});

	it('never drains the buffer to raise a ceiling', () => {
		// The arrow keys step it plainly. Spending through the buffer is a rule
		// about the pool, and a max is not the pool.
		const el = render(
			{ ...owned, hasTemp: true },
			{ current: '22', temp: '4', max: '31' },
		);
		const { maxInput, temp } = parts(el);
		maxInput?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
		);
		expect(maxInput?.value).toBe('30');
		expect(temp?.value).toBe('4');
	});

	it('keeps its own presses, rather than handing them to the value', () => {
		// The card routes a press to the nearest field, and the max sits on the
		// value's own line — so it has to be one of the fields the router knows.
		const el = render(owned, { current: '22', max: '31' });
		const { maxInput } = parts(el);
		maxInput?.focus();
		maxInput?.dispatchEvent(
			new PointerEvent('pointerdown', { pointerId: 1, button: 0, bubbles: true }),
		);
		expect(document.activeElement).toBe(maxInput);
	});

	it('publishes the stored ceiling under the same name a formula would', () => {
		// `hp.max` reads the same from either mode: a formula elsewhere asks a
		// pool for its ceiling without knowing where that pool keeps it.
		expect(
			pool.scopeValues?.({ current: '22', max: '31' }, { ...config, ...owned }),
		).toEqual({
			self: { value: '22' },
			named: { max: { value: '31' } },
		});
	});

	it('restores to the number in the note, with nothing to resolve', () => {
		const result = pool.applyReset?.(
			{ current: '4', max: '31' },
			{ ...config, ...owned },
			{ trigger: 'Long rest', action: 'full' },
			{
				resolve: () => {
					throw new Error('a stored max resolves nothing');
				},
				explain: () => null,
			},
		);
		expect(result).toEqual({ ok: true, data: { current: '31' } });
	});

	it('reports a pool nobody has given a max yet, rather than resetting to nothing', () => {
		const result = pool.applyReset?.(
			{ current: '4' },
			{ ...config, ...owned },
			{ trigger: 'Long rest', action: 'full' },
			{ resolve: () => null, explain: () => null },
		);
		expect(result).toEqual({
			ok: false,
			error: 'it has no max to restore to.',
		});
	});

	it('empties without a max, because zero is zero either way', () => {
		const result = pool.applyReset?.(
			{ current: '4' },
			{ ...config, ...owned },
			{ trigger: 'Long rest', action: 'empty' },
			{ resolve: () => null, explain: () => null },
		);
		expect(result).toEqual({ ok: true, data: { current: '0' } });
	});

	it('stores the ceiling in the note, beside the value it bounds', () => {
		expect(pool.write({ max: '38' }, BODY, config)).toBe(
			'\n```sheet\ncurrent: 22\ntemp: 4\nmax: 38\n```\n',
		);
	});
});
