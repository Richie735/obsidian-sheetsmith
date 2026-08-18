// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	configError,
	SegmentRect,
	segmentCount,
	MAX_SEGMENTS,
	markSize,
	marksAtPoint,
	track,
	TrackConfig,
	TrackData,
} from './track';
import { buildSheetScope } from '../formula/sheet';
import { makeFieldResolver } from '../formula/resolve';
import { RenderContext } from '../types';

const config: TrackConfig = {
	id: 'exhaustion',
	type: 'track',
	label: 'Exhaustion',
	position: { col: 1, row: 1, width: 1, height: 1 },
	count: 6,
};

const BODY = '\n```sheet\nvalue: 3\n```\n';

const context: RenderContext = {
	resolved: { count: 6 },
	resolveField: () => null,
	onChange: () => undefined,
};

const render = (
	overrides: Partial<TrackConfig> = {},
	data: TrackData | null = { value: '3' },
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	document.body.appendChild(el);
	track.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
};

const parts = (el: HTMLElement) => ({
	run: el.querySelector<HTMLElement>('.sheetsmith-track-run'),
	segments: Array.from(
		el.querySelectorAll<HTMLElement>('.sheetsmith-track-segment'),
	),
	step: el.querySelector<HTMLElement>('.sheetsmith-track-step'),
	label: el.querySelector<HTMLElement>('.sheetsmith-track-label'),
	error: el.querySelector<HTMLElement>('.sheetsmith-error'),
	unresolved: el.querySelector<HTMLElement>('.sheetsmith-track-unresolved'),
});

/** Each segment's committed fill, as the stylesheet reads it. */
const fills = (el: HTMLElement) =>
	parts(el).segments.map((segment) =>
		Number(segment.style.getPropertyValue('--sheetsmith-track-fill')),
	);

/**
 * What the run says it is on, saved or not. Separate from the fills below,
 * which say how much of that has reached the note — one is the value and the
 * other is its persistence, and a test about stepping should not depend on
 * the second.
 */
const shown = (el: HTMLElement) =>
	Number(parts(el).run?.getAttribute('aria-valuenow'));

/** Each segment's pending fill: what a gesture in flight says would happen. */
const ghosts = (el: HTMLElement) =>
	parts(el).segments.map((segment) =>
		Number(segment.style.getPropertyValue('--sheetsmith-track-ghost')),
	);

afterEach(() => {
	document.body.replaceChildren();
	vi.useRealTimers();
});

describe('track.read', () => {
	it('reads the stored mark count', () => {
		expect(track.read(BODY, config)).toEqual({ ok: true, data: { value: '3' } });
	});

	it('treats a section with no fence as empty, not malformed', () => {
		expect(track.read('\nSome prose.\n', config)).toEqual({ ok: true, data: null });
	});

	it('reports a non-numeric value as a malformed section', () => {
		// SPEC §10: the error shows on this component and
		// the rest of the sheet stays editable.
		const result = track.read('\n```sheet\nvalue: lots\n```\n', config);
		expect(result).toEqual({
			ok: false,
			error: '"lots" is not a number of marks.',
		});
	});

	it('accepts a value the run cannot represent', () => {
		// §7: a stored value outside the run is rendered, not corrected. A
		// count is a formula, so a track that rewrote itself to a new ceiling
		// would destroy the player's data on a level-up.
		expect(track.read('\n```sheet\nvalue: 99\n```\n', config)).toEqual({
			ok: true,
			data: { value: '99' },
		});
		expect(track.read('\n```sheet\nvalue: -2\n```\n', config)).toEqual({
			ok: true,
			data: { value: '-2' },
		});
	});
});

describe('track.write', () => {
	it('round-trips an unchanged section byte for byte', () => {
		const read = track.read(BODY, config);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(track.write(read.data, BODY, config)).toBe(BODY);
	});

	it('round-trips a value outside the run byte for byte', () => {
		const body = '\n```sheet\nvalue: 99\n```\n';
		const read = track.read(body, config);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(track.write(read.data, body, config)).toBe(body);
	});

	it('preserves entries it does not map', () => {
		const body = '\n```sheet\nvalue: 3\nnotes: from the swamp\n```\n';
		expect(track.write({ value: '4' }, body, config)).toBe(
			'\n```sheet\nvalue: 4\nnotes: from the swamp\n```\n',
		);
	});

	it('creates a fresh block for a section that has none', () => {
		expect(track.write({ value: '2' }, null, config)).toBe(
			'\n```sheet\nvalue: 2\n```\n',
		);
	});
});

describe('track config errors', () => {
	it('accepts a counted run and a named one', () => {
		expect(configError(config)).toBeNull();
		expect(configError({ ...config, count: undefined, levels: ['A', 'B'] })).toBeNull();
	});

	it('needs a count or names to count', () => {
		expect(configError({ ...config, count: undefined })).toContain('number of segments');
	});

	it('refuses a single level name', () => {
		// The first name is what "none" is called, so one name describes a run
		// with no step to reach.
		expect(configError({ ...config, levels: ['Rested'] })).toContain(
			'at least two level names',
		);
	});

	it('refuses a level with a mark but no name', () => {
		expect(configError({ ...config, levels: ['Rested', ':☠'] })).toContain(
			'a mark but no name',
		);
	});

	it('refuses marks that are not a whole number of presses', () => {
		expect(configError({ ...config, marks: 0 })).toContain('1 or more');
		expect(configError({ ...config, marks: 2.5 })).toContain('1 or more');
	});

	it('renders the error on this component alone', () => {
		const el = render({ count: undefined });
		expect(parts(el).error?.textContent).toContain('number of segments');
		expect(parts(el).segments).toHaveLength(0);
	});
});

describe('segmentCount', () => {
	it('takes its length from the level names, which win over a count', () => {
		// Naming the steps settles how many there are, so the two cannot
		// disagree.
		expect(segmentCount({ ...config, count: 99, levels: ['A', 'B', 'C'] }, 99)).toBe(2);
	});

	it('reads a resolved count, floored', () => {
		expect(segmentCount(config, 6)).toBe(6);
		expect(segmentCount(config, 6.7)).toBe(6);
	});

	it('reports an unresolved count rather than guessing', () => {
		expect(segmentCount(config, null)).toBeNull();
		expect(segmentCount(config, 'lots')).toBeNull();
	});

	it('reports a count below one as unresolved: no run is not a run', () => {
		expect(segmentCount(config, 0)).toBeNull();
		expect(segmentCount(config, -3)).toBeNull();
	});

	it('clamps a run too long to draw rather than hanging on it', () => {
		expect(segmentCount(config, 1_000_000)).toBe(MAX_SEGMENTS);
	});
});

describe('markSize', () => {
	it('defaults to one press per segment', () => {
		expect(markSize(config)).toBe(1);
	});

	it('takes a whole number of presses, and nothing else', () => {
		expect(markSize({ ...config, marks: 4 })).toBe(4);
		expect(markSize({ ...config, marks: 0 })).toBe(1);
		expect(markSize({ ...config, marks: Number.NaN })).toBe(1);
	});
});

describe('marksAtPoint', () => {
	/** Six 10px segments with 10px gaps, on one row from y 0 to 10. */
	const row: SegmentRect[] = Array.from({ length: 6 }, (_, i) => ({
		left: i * 20,
		right: i * 20 + 10,
		top: 0,
		bottom: 10,
	}));

	it('fills the segment under the pointer and everything below it', () => {
		expect(marksAtPoint(row, 5, 5, 1)).toBe(1);
		expect(marksAtPoint(row, 45, 5, 1)).toBe(3);
	});

	it('fills a segment from its leading edge: no position inside one means empty', () => {
		expect(marksAtPoint(row, 40, 5, 1)).toBe(3);
	});

	it('reads the gap before a segment as the run up to it', () => {
		expect(marksAtPoint(row, 35, 5, 1)).toBe(2);
	});

	it('empties the run left of the first segment and fills it past the last', () => {
		expect(marksAtPoint(row, -20, 5, 1)).toBe(0);
		expect(marksAtPoint(row, 500, 5, 1)).toBe(6);
	});

	it('reaches each mark inside a segment that holds several', () => {
		// What makes a four-mark segment four reachable positions rather than one.
		expect(marksAtPoint(row, 40, 5, 4)).toBe(9);
		expect(marksAtPoint(row, 43, 5, 4)).toBe(10);
		expect(marksAtPoint(row, 46, 5, 4)).toBe(11);
		expect(marksAtPoint(row, 50, 5, 4)).toBe(12);
	});

	it('survives a run that wrapped', () => {
		// Ten segments in two rows of five: a wrap resets x, which is how the
		// rows are found. Pointing at the second row's third segment is eight.
		const wrapped: SegmentRect[] = Array.from({ length: 10 }, (_, i) => ({
			left: (i % 5) * 20,
			right: (i % 5) * 20 + 10,
			top: i < 5 ? 0 : 20,
			bottom: i < 5 ? 10 : 30,
		}));
		expect(marksAtPoint(wrapped, 45, 25, 1)).toBe(8);
		// And the same x on the first row is three, not eight.
		expect(marksAtPoint(wrapped, 45, 5, 1)).toBe(3);
	});

	it('asks about the row a pointer left through', () => {
		const wrapped: SegmentRect[] = Array.from({ length: 10 }, (_, i) => ({
			left: (i % 5) * 20,
			right: (i % 5) * 20 + 10,
			top: i < 5 ? 0 : 20,
			bottom: i < 5 ? 10 : 30,
		}));
		expect(marksAtPoint(wrapped, 45, 500, 1)).toBe(8);
		expect(marksAtPoint(wrapped, 45, -500, 1)).toBe(3);
	});

	it('has nothing to say about a run with no segments', () => {
		expect(marksAtPoint([], 5, 5, 1)).toBe(0);
	});
});

describe('track.scopeValues', () => {
	it('publishes the filled segments under the bare id', () => {
		expect(track.scopeValues?.({ value: '3' }, config)?.self).toEqual({ value: 3 });
	});

	it('publishes filled segments, not stored marks, where a segment holds several', () => {
		const published = track.scopeValues?.({ value: '22' }, { ...config, marks: 4 });
		expect(published?.self).toEqual({ value: 5 });
		expect(published?.named?.value).toEqual({ value: '22' });
	});

	it('publishes nothing for an empty or unreadable value', () => {
		expect(track.scopeValues?.(null, config)?.self?.value).toBeUndefined();
		expect(track.scopeValues?.({ value: '' }, config)?.self?.value).toBeUndefined();
	});

	it('publishes a named run\'s count as a literal', () => {
		const published = track.scopeValues?.(
			{ value: '1' },
			{ ...config, count: undefined, levels: ['Rested', 'One', 'Two'] },
		);
		expect(published?.named?.count).toEqual({ value: 2 });
	});

	it('publishes a formula count as a lazily evaluated display', () => {
		const published = track.scopeValues?.({ value: '1' }, { ...config, count: 'level' });
		expect(published?.named?.count).toEqual({
			display: { field: 'count', scope: {} },
		});
	});

	/*
	 * Through the real name table, not the raw declaration. The bare id has to
	 * be the segments a reader can see and `<id>.value` the raw marks, and the
	 * table fills `.value` from `self` unless the component says otherwise —
	 * so this is the check that keeps the two names from collapsing into one.
	 */
	describe('through the sheet scope', () => {
		const scopeFor = (data: TrackData, overrides: Partial<TrackConfig> = {}) => {
			const merged = { ...config, ...overrides };
			const values = track.scopeValues?.(data, merged);
			if (!values) throw new Error('expected scope values');
			return buildSheetScope([
				{
					id: merged.id,
					values,
					resolver: (sheet) =>
						makeFieldResolver(track, merged, data, sheet, new Map()),
				},
			]);
		};

		it('answers the bare id with segments and .value with marks', () => {
			const scope = scopeFor({ value: '22' }, { marks: 4 });
			expect(scope('exhaustion')).toBe(5);
			expect(scope('exhaustion.value')).toBe(22);
		});

		it('answers .count from the layout\'s formula', () => {
			const scope = scopeFor({ value: '1' }, { count: '2 + 4' });
			expect(scope('exhaustion.count')).toBe(6);
		});
	});
});

describe('track.applyReset', () => {
	const reset = (
		binding: Parameters<NonNullable<typeof track.applyReset>>[2],
		overrides: Partial<TrackConfig> = {},
		resolve: (field: string) => number | string | null = () => null,
	) =>
		track.applyReset?.(
			{ value: '3' },
			{ ...config, ...overrides },
			binding,
			{ resolve: (field) => resolve(field), explain: () => null },
		);

	it('empties without resolving anything', () => {
		// A track whose count is broken can still be cleared.
		expect(reset({ trigger: 'Long Rest', action: 'empty' })).toEqual({
			ok: true,
			data: { value: '0' },
		});
	});

	it('fills every mark', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'full' }, { marks: 4 }, () => 10),
		).toEqual({ ok: true, data: { value: '40' } });
	});

	it('fills a named run without resolving a count it does not have', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'full' }, {
				count: undefined,
				levels: ['Rested', 'One', 'Two'],
			}),
		).toEqual({ ok: true, data: { value: '2' } });
	});

	it('reports a count it could not resolve rather than doing nothing', () => {
		// SPEC §6: what resolves is applied and what does not is named. The
		// case a plain data return could not distinguish from a full track.
		const result = reset({ trigger: 'Long Rest', action: 'full' });
		expect(result?.ok).toBe(false);
		if (result?.ok === false) expect(result.error).toContain('no segments to fill');
	});

	it('resolves a formula in segments, down to the nearest mark', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'formula', to: 'x' }, { marks: 4 }, () => 2.5),
		).toEqual({ ok: true, data: { value: '10' } });
	});

	it('resolves the 5e exhaustion binding, which steps down by one', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'formula', to: 'max(0, exhaustion - 1)' }, {}, () => 2),
		).toEqual({ ok: true, data: { value: '2' } });
	});

	it('reports a reset formula that is not a number of segments', () => {
		const result = reset(
			{ trigger: 'Long Rest', action: 'formula', to: 'x' },
			{},
			() => 'rested',
		);
		expect(result?.ok).toBe(false);
		if (result?.ok === false) expect(result.error).toContain('not a number of segments');
	});

	it('does nothing, and fails at nothing, for a binding with no action', () => {
		// Track declares no buffer, so the editor never offers one — and a
		// binding that somehow arrives with neither must not report a failure.
		expect(reset({ trigger: 'Long Rest' })).toEqual({ ok: true, data: {} });
	});

	it('declares no buffer', () => {
		expect(track.hasBuffer).toBeUndefined();
	});
});

describe('track.render', () => {
	it('draws one segment per unit of the run, filled in order', () => {
		const el = render();
		expect(parts(el).segments).toHaveLength(6);
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
	});

	it('draws no numerals: the segments are already the count', () => {
		expect(render().textContent).not.toContain('3');
	});

	it('draws an empty run rather than "—" for an empty track', () => {
		const el = render({}, null);
		expect(fills(el)).toEqual([0, 0, 0, 0, 0, 0]);
		expect(el.textContent).not.toContain('—');
	});

	it('fills a partial segment where a segment holds several marks', () => {
		const el = render({ count: 10, marks: 4 }, { value: '22' }, {
			resolved: { count: 10 },
		});
		expect(fills(el).slice(0, 7)).toEqual([1, 1, 1, 1, 1, 0.5, 0]);
	});

	it('fills every segment for a value above the run, and leaves the note alone', () => {
		const changed = vi.fn();
		const el = render({}, { value: '99' }, { onChange: changed });
		expect(fills(el)).toEqual([1, 1, 1, 1, 1, 1]);
		expect(changed).not.toHaveBeenCalled();
	});

	it('is one control at its current step, not six', () => {
		const { run } = parts(render());
		expect(run?.getAttribute('role')).toBe('slider');
		expect(run?.tabIndex).toBe(0);
		expect(run?.getAttribute('aria-valuenow')).toBe('3');
		expect(run?.getAttribute('aria-valuemax')).toBe('6');
		expect(run?.getAttribute('aria-valuetext')).toBe('3 of 6');
	});

	it('names its step where the levels are named, and holds no line where they are not', () => {
		const named = render(
			{ count: undefined, levels: ['Rested', 'Exhaustion 1', 'Exhaustion 2'] },
			{ value: '2' },
		);
		expect(parts(named).step?.textContent).toBe('Exhaustion 2');
		expect(parts(named).run?.getAttribute('aria-valuetext')).toBe('Exhaustion 2');
		expect(parts(render()).step).toBeNull();
	});

	it('divides a multi-mark segment between its marks, and not at its edges', () => {
		// The bug this replaces: a repeating gradient draws a line at the end
		// of every mark including the last, so every segment on the run carried a
		// divider sitting on its own right border. A segment holding n marks has
		// n - 1 boundaries inside it; the border is already the outer two.
		const el = render({ count: 6, marks: 4 }, { value: '0' });
		const dividers = Array.from(
			parts(el).segments[0]?.querySelectorAll<HTMLElement>('.sheetsmith-track-mark') ??
				[],
		);
		expect(dividers).toHaveLength(3);
		expect(
			dividers.map((d) => d.style.getPropertyValue('--sheetsmith-track-at')),
		).toEqual(['0.25', '0.5', '0.75']);
	});

	it('divides nothing where a segment holds one mark', () => {
		const el = render();
		expect(el.querySelectorAll('.sheetsmith-track-mark')).toHaveLength(0);
	});

	it('keeps a lettered segment\'s letter above its fill', () => {
		// The glyph was the segment's own inline text, and a positioned
		// descendant paints after its parent's inline content — so the fills
		// covered it, and the one segment a layout bothered to letter lost its
		// letter exactly when the segment filled. It is an element of its own
		// now, and the last child, so it paints over them.
		const el = render(
			{ count: undefined, levels: ['Rested', 'One:☠'] },
			{ value: '1' },
		);
		const segment = parts(el).segments[0];
		const letter = segment?.querySelector<HTMLElement>('.sheetsmith-track-segment-glyph');
		expect(letter?.textContent).toBe('☠');
		expect(segment?.lastElementChild).toBe(letter);
	});

	it('shows only a segment the layout asked for, never a name\'s initial', () => {
		// Six segments each carrying an "E" is noise; one ☠ on the last is the
		// layout saying something the run cannot.
		const el = render(
			{
				count: undefined,
				levels: ['Rested', 'Exhaustion 1', 'Exhaustion 2:☠'],
			},
			{ value: '0' },
		);
		expect(parts(el).segments.map((segment) => segment.textContent)).toEqual(['', '☠']);
	});

	it('grades a harm run toward its far end and leaves progress flat', () => {
		const harm = render({ sense: 'harm' });
		expect(parts(harm).run?.classList.contains('sheetsmith-track-harm')).toBe(true);
		expect(
			parts(harm).segments.map((segment) =>
				segment.style.getPropertyValue('--sheetsmith-track-grade'),
			),
		).toEqual(['0.16666666666666666', '0.3333333333333333', '0.5', '0.6666666666666666', '0.8333333333333334', '1']);
		const progress = render();
		expect(
			parts(progress).segments[0]?.style.getPropertyValue('--sheetsmith-track-grade'),
		).toBe('');
	});

	it('shows "?" and no run for a count that did not resolve', () => {
		const el = render({ count: 'level' }, { value: '1' }, {
			resolved: { count: null },
			explainField: () => 'level is not defined on this sheet.',
		});
		expect(parts(el).unresolved?.textContent).toBe('?');
		expect(parts(el).unresolved?.getAttribute('title')).toContain('not defined');
		expect(parts(el).segments).toHaveLength(0);
	});

	it('leaves the heading off where the layout asked', () => {
		expect(parts(render()).label?.textContent).toBe('Exhaustion');
		expect(parts(render({ hideLabel: true })).label).toBeNull();
	});
});

describe('track keyboard', () => {
	const press = (el: HTMLElement, key: string, shiftKey = false) =>
		parts(el).run?.dispatchEvent(
			new KeyboardEvent('keydown', { key, shiftKey, cancelable: true }),
		);

	it('steps a segment with the arrows', () => {
		const el = render();
		press(el, 'ArrowRight');
		expect(shown(el)).toBe(4);
		press(el, 'ArrowLeft');
		press(el, 'ArrowLeft');
		expect(shown(el)).toBe(2);
	});

	it('steps a mark with shift, the inverse of a card\'s shift-by-ten', () => {
		// A track's fine grain lies below its unit rather than above it.
		const el = render({ count: 10, marks: 4 }, { value: '20' }, {
			resolved: { count: 10 },
		});
		press(el, 'ArrowRight', true);
		expect(shown(el)).toBe(21);
	});

	it('empties and fills the run with Home and End', () => {
		const el = render();
		press(el, 'End');
		expect(shown(el)).toBe(6);
		press(el, 'Home');
		expect(shown(el)).toBe(0);
	});

	it('finishes a partial segment before starting the next with Space', () => {
		const el = render({ count: 10, marks: 4 }, { value: '22' }, {
			resolved: { count: 10 },
		});
		press(el, ' ');
		expect(shown(el)).toBe(24);
	});

	it('holds the value inside the run', () => {
		const el = render({}, { value: '0' });
		press(el, 'ArrowLeft');
		expect(shown(el)).toBe(0);
		press(el, 'End');
		press(el, 'ArrowRight');
		expect(shown(el)).toBe(6);
	});

	it('writes a run of presses once, when the gesture ends', () => {
		// Persistence is discrete: three presses is one change to the note,
		// not three saves racing each other's re-renders.
		const changed = vi.fn();
		const el = render({}, { value: '3' }, { onChange: changed });
		press(el, 'ArrowRight');
		press(el, 'ArrowRight');
		press(el, 'ArrowLeft');
		expect(changed).not.toHaveBeenCalled();
		parts(el).run?.dispatchEvent(new Event('blur'));
		expect(changed).toHaveBeenCalledTimes(1);
		expect(changed).toHaveBeenCalledWith({ value: '4' });
	});

	it('writes nothing where the gesture landed back where it started', () => {
		const changed = vi.fn();
		const el = render({}, { value: '3' }, { onChange: changed });
		press(el, 'ArrowRight');
		press(el, 'ArrowLeft');
		parts(el).run?.dispatchEvent(new Event('blur'));
		expect(changed).not.toHaveBeenCalled();
	});

	it('writes on its own after the gesture goes quiet', () => {
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = render({}, { value: '3' }, { onChange: changed });
		press(el, 'ArrowRight');
		vi.advanceTimersByTime(1000);
		expect(changed).toHaveBeenCalledWith({ value: '4' });
	});

	it('draws a keyboard step faint until it reaches the note', () => {
		// The commit is otherwise invisible: the fill happens on the keystroke
		// and the write follows up to a gesture-window later, so the run said
		// "saved" for the whole of the time it was not. Faint means exactly
		// "this much is not in the note", whatever moved it.
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = render({}, { value: '3' }, { onChange: changed });
		press(el, 'ArrowRight');
		expect(shown(el)).toBe(4);
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 0, 0]);

		vi.advanceTimersByTime(1000);
		expect(changed).toHaveBeenCalledWith({ value: '4' });
		// And the write is what turns it solid.
		expect(fills(el)).toEqual([1, 1, 1, 1, 0, 0]);
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it('draws a step back faint from the note\'s value, not to it', () => {
		// Downwards the unsaved region is the part that has gone: solid is
		// what the note still holds, faint reaches where the run now is.
		vi.useFakeTimers();
		const el = render({}, { value: '3' });
		press(el, 'ArrowLeft');
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 0, 0, 0]);
		vi.advanceTimersByTime(1000);
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0]);
	});

	it('leaves a key it does not answer to the browser', () => {
		const el = render();
		const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
		parts(el).run?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
	});
});

describe('track pointer', () => {
	/** Six 10px segments with 10px gaps, since happy-dom measures nothing. */
	const measure = (el: HTMLElement) => {
		parts(el).segments.forEach((segment, i) => {
			segment.getBoundingClientRect = () =>
				({ left: i * 20, right: i * 20 + 10, top: 0, bottom: 10 }) as DOMRect;
		});
		const run = parts(el).run;
		if (run) {
			run.getBoundingClientRect = () =>
				({ left: 0, right: 110, top: 0, bottom: 10 }) as DOMRect;
			run.setPointerCapture = () => undefined;
			run.releasePointerCapture = () => undefined;
		}
		return el;
	};

	const at = (type: string, x: number, y = 5) =>
		new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y });

	it('answers on the way down and commits on the way up', () => {
		const changed = vi.fn();
		const el = measure(render({}, { value: '3' }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 85));
		// The outcome is on screen before it is applied: the run is still on
		// three, and the pending fill reaches five.
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
		expect(changed).not.toHaveBeenCalled();
		parts(el).run?.dispatchEvent(at('pointerup', 85));
		expect(fills(el)).toEqual([1, 1, 1, 1, 1, 0]);
		expect(changed).toHaveBeenCalledWith({ value: '5' });
	});

	it('clears the highest filled segment when it is the one pressed', () => {
		// One control both fills and clears, without a modifier — and the run
		// can never show the states nobody means.
		const el = measure(render({}, { value: '3' }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		parts(el).run?.dispatchEvent(at('pointerup', 45));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	it('sets the run continuously through a drag', () => {
		const el = measure(render({}, { value: '0' }));
		parts(el).run?.dispatchEvent(at('pointerdown', 5));
		parts(el).run?.dispatchEvent(at('pointermove', 85));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 45));
		expect(ghosts(el)).toEqual([1, 1, 1, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 45));
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
	});

	it('gives back the committed value while the drag is off the run', () => {
		const el = measure(render({}, { value: '2' }));
		parts(el).run?.dispatchEvent(at('pointerdown', 85));
		parts(el).run?.dispatchEvent(at('pointermove', 85, 400));
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0]);
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		// And coming back resumes the gesture: dragging off abandons nothing.
		parts(el).run?.dispatchEvent(at('pointermove', 85, 5));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
	});

	it('commits nothing when the drag is released off the run', () => {
		const changed = vi.fn();
		const el = measure(render({}, { value: '2' }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 85));
		parts(el).run?.dispatchEvent(at('pointermove', 85, 400));
		parts(el).run?.dispatchEvent(at('pointerup', 85, 400));
		expect(changed).not.toHaveBeenCalled();
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	/*
	 * Marks are reachable by press and by drag alike. What makes that a target
	 * rather than a coin toss is the segment's width, which is a rendering rule
	 * rather than a gesture one — so what is pinned here is that neither
	 * gesture quietly rounds to a whole segment, and that the run tells the
	 * stylesheet what it has to size for.
	 */
	const marked = (value = '0') =>
		measure(render({ marks: 4 }, { value }, { resolved: { count: 6 } }));

	it('reaches a mark on a press, not only a whole segment', () => {
		// Segments are 10px wide in this fixture, so a quarter is 2.5px: pressing
		// at 41, 43 and 49 is the first, second and fourth mark of segment three.
		for (const [x, fill] of [
			[41, 0.25],
			[43, 0.5],
			[49, 1],
		] as const) {
			const el = marked();
			parts(el).run?.dispatchEvent(at('pointerdown', x));
			parts(el).run?.dispatchEvent(at('pointerup', x));
			expect(fills(el), `press at ${x}`).toEqual([1, 1, fill, 0, 0, 0]);
		}
	});

	it('reaches a mark on a drag too', () => {
		const el = marked();
		parts(el).run?.dispatchEvent(at('pointerdown', 5));
		parts(el).run?.dispatchEvent(at('pointermove', 43));
		expect(ghosts(el)).toEqual([1, 1, 0.5, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 43));
		expect(fills(el)).toEqual([1, 1, 0.5, 0, 0, 0]);
	});

	it('lets a near miss be slid onto the right mark before it commits', () => {
		// The press answers on the way down and commits on the way up, so it
		// is also the start of a drag — which is what keeps a mark-sized
		// target recoverable rather than final.
		const changed = vi.fn();
		const el = measure(
			render({ marks: 4 }, { value: '0' }, {
				resolved: { count: 6 },
				onChange: changed,
			}),
		);
		// One mark over, which in this fixture is three pixels — the distance
		// the old drag threshold swallowed whole, and the reason it went.
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		parts(el).run?.dispatchEvent(at('pointermove', 46));
		parts(el).run?.dispatchEvent(at('pointerup', 46));
		expect(fills(el)).toEqual([1, 1, 0.75, 0, 0, 0]);
		expect(changed).toHaveBeenCalledWith({ value: '11' });
	});

	it('clears the whole segment when the press lands where the run already is', () => {
		// "Pressing the highest filled segment clears it" is about the segment, so a
		// press on the mark the run ends on takes the segment rather than a
		// quarter of it. Pressing anywhere else inside it sets that mark.
		const cleared = marked('12');
		parts(cleared).run?.dispatchEvent(at('pointerdown', 49));
		parts(cleared).run?.dispatchEvent(at('pointerup', 49));
		expect(fills(cleared)).toEqual([1, 1, 0, 0, 0, 0]);

		const set = marked('12');
		parts(set).run?.dispatchEvent(at('pointerdown', 43));
		parts(set).run?.dispatchEvent(at('pointerup', 43));
		expect(fills(set)).toEqual([1, 1, 0.5, 0, 0, 0]);
	});

	/*
	 * Clearing and setting are the same press on the same pixel, so which one
	 * is happening has to be decided once and shown, never re-read as the
	 * finger moves.
	 */
	it('previews the clear on the way down and holds it inside the segment', () => {
		const el = measure(render({}, { value: '3' }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		// Solid is what would remain, faint reaches where the run is now: two
		// stay, one goes.
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 0, 0, 0]);
		// Two pixels, same segment. This is the case that used to flip the
		// preview back to a set with nothing on screen saying so.
		parts(el).run?.dispatchEvent(at('pointermove', 47));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 47));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	it('becomes an ordinary set once the gesture leaves the segment', () => {
		const changed = vi.fn();
		const el = measure(render({}, { value: '3' }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		parts(el).run?.dispatchEvent(at('pointermove', 85));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 85));
		expect(fills(el)).toEqual([1, 1, 1, 1, 1, 0]);
		expect(changed).toHaveBeenCalledWith({ value: '5' });
	});

	it('does not re-arm the clear when the finger comes back', () => {
		// Re-arming would restore the two readings of one position by a
		// longer route. Once left, the segment under the pointer means what it
		// says, so returning to it sets it.
		const changed = vi.fn();
		const el = measure(render({}, { value: '3' }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		parts(el).run?.dispatchEvent(at('pointermove', 85));
		parts(el).run?.dispatchEvent(at('pointermove', 45));
		// Back where it started, so there is nothing unsaved to draw faint.
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 45));
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(changed).not.toHaveBeenCalled();
	});

	it('holds a clear across a whole multi-mark segment, not just its mark', () => {
		// The clear is about the segment, so sliding within it cannot re-target a
		// mark inside the very segment being cleared. That mark is still one
		// direct press away, which is what makes the trade cheap.
		const el = marked('12');
		parts(el).run?.dispatchEvent(at('pointerdown', 49));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 43));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 43));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	it('tells the stylesheet how many targets a segment holds, and only then', () => {
		// The per-mark width and the drawn divisions both hang off this, and
		// both are meaningless on a run whose segments hold one mark each.
		const el = marked();
		expect(parts(el).run?.classList.contains('sheetsmith-track-marked')).toBe(true);
		expect(
			parts(el).run?.style.getPropertyValue('--sheetsmith-track-marks'),
		).toBe('4');
		const plain = parts(render()).run;
		expect(plain?.classList.contains('sheetsmith-track-marked')).toBe(false);
		expect(plain?.style.getPropertyValue('--sheetsmith-track-marks')).toBe('');
	});

	/*
	 * A wrapped run is the first thing a phone hits, and it is where "past the
	 * last segment" stops being one place. Ten segments in two rows of five: row one
	 * ends at the same x as row two, and only one of those is the end of the
	 * run.
	 */
	const wrapped = (value = '0') => {
		const el = render({ count: 10 }, { value }, { resolved: { count: 10 } });
		parts(el).segments.forEach((segment, i) => {
			const row = i < 5 ? 0 : 1;
			const col = i % 5;
			segment.getBoundingClientRect = () =>
				({
					left: col * 20,
					right: col * 20 + 10,
					top: row * 20,
					bottom: row * 20 + 10,
				}) as DOMRect;
		});
		const run = parts(el).run;
		if (run) {
			run.getBoundingClientRect = () =>
				({ left: 0, right: 110, top: 0, bottom: 30 }) as DOMRect;
			run.setPointerCapture = () => undefined;
			run.releasePointerCapture = () => undefined;
		}
		return el;
	};

	it('follows reading order across the wrap: the row is chosen by y', () => {
		// The same x on the two rows is two different segments, three and eight,
		// which is what makes the run one sequence rather than two.
		const first = wrapped();
		parts(first).run?.dispatchEvent(at('pointerdown', 45, 5));
		expect(ghosts(first).slice(0, 4)).toEqual([1, 1, 1, 0]);

		const second = wrapped();
		parts(second).run?.dispatchEvent(at('pointerdown', 45, 25));
		expect(ghosts(second)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
	});

	it('does not resist at the end of a row that is not the end of the run', () => {
		// The bug this pins: measured against the run's segment, row one's right
		// edge is the run's right edge, so pushing past five segments of ten
		// rubber-banded as though the run were full.
		const el = wrapped();
		parts(el).run?.dispatchEvent(at('pointerdown', 5, 5));
		parts(el).run?.dispatchEvent(at('pointermove', 300, 5));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
		expect(parts(el).run?.style.transform).toBe('');
	});

	it('resists past the last segment of the last row', () => {
		const el = wrapped();
		parts(el).run?.dispatchEvent(at('pointerdown', 5, 25));
		parts(el).run?.dispatchEvent(at('pointermove', 300, 25));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
		expect(parts(el).run?.style.transform ?? '').toMatch(/^translateX\(\d/);
	});

	it('cancels when the pointer leaves the run itself, wrap and all', () => {
		// Perpendicular is a departure; along the axis is a boundary. Moving
		// between the two rows is neither, since both are the run.
		const el = wrapped();
		parts(el).run?.dispatchEvent(at('pointerdown', 45, 5));
		parts(el).run?.dispatchEvent(at('pointermove', 45, 25));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 45, 400));
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
	});

	it('gives at the ends rather than stopping', () => {
		// A hard stop reads as a frozen control; a few pixels of give reads as
		// a responsive one with nothing further to offer. The value still
		// holds at full — a track's ends are the run's own extent, and there
		// is no segment past the last one to fill.
		const el = measure(render({}, { value: '0' }));
		parts(el).run?.dispatchEvent(at('pointerdown', 5));
		parts(el).run?.dispatchEvent(at('pointermove', 300));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1]);
		const shifted = parts(el).run?.style.transform ?? '';
		expect(shifted).toMatch(/^translateX\(\d/);
		// And it springs back when the gesture ends.
		parts(el).run?.dispatchEvent(at('pointerup', 300));
		expect(parts(el).run?.style.transform).toBe('');
	});

	it('drops the give under reduced motion, and keeps the pending fill', () => {
		// §5: neither the pending fill nor the colour is vestibular, and both
		// are what the control says rather than how it moves.
		const matchMedia = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);
		try {
			const el = measure(render({}, { value: '0' }));
			parts(el).run?.dispatchEvent(at('pointerdown', 5));
			parts(el).run?.dispatchEvent(at('pointermove', 300));
			expect(parts(el).run?.style.transform).toBe('');
			expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1]);
		} finally {
			matchMedia.mockRestore();
		}
	});

	it('reads a named step on a long press without changing it', () => {
		// A press held to ask what the step is called was a question, not an
		// instruction — the same swallow the level ring makes, and here the
		// press has already moved the pending fill.
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = measure(
			render(
				{ count: undefined, levels: ['Rested', 'One', 'Two', 'Three'] },
				{ value: '1' },
				{ onChange: changed },
			),
		);
		const run = parts(el).run;
		run?.dispatchEvent(
			new PointerEvent('pointerdown', {
				pointerId: 1,
				button: 0,
				clientX: 45,
				clientY: 5,
				pointerType: 'touch',
			}),
		);
		vi.advanceTimersByTime(600);
		run?.dispatchEvent(at('pointerup', 45));
		expect(changed).not.toHaveBeenCalled();
		expect(fills(el)).toEqual([1, 0, 0]);
	});

	/*
	 * No drag threshold, and its absence is the decision. A Pool needs one
	 * because its number is a text field where a press places a caret and a
	 * drag scrubs; here the press already fills on the way down, so a press is
	 * a drag of no length and there is nothing to tell apart. Ten pixels of
	 * dead distance would only have eaten the correction that makes a
	 * mark-sized target recoverable.
	 */
	it('moves the value on a movement far under ten pixels', () => {
		// Three pixels, one mark. The fixture's segments are 10px, so a mark is
		// 2.5 — which is the whole point: the real control draws them at about
		// thirteen, and a threshold of ten would have swallowed most of one.
		const el = marked();
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		expect(ghosts(el)).toEqual([1, 1, 0.5, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 46));
		expect(ghosts(el)).toEqual([1, 1, 0.75, 0, 0, 0]);
	});

	it('holds still for a wobble inside one mark', () => {
		// What keeps a resting hand from twitching the value is quantisation,
		// not hysteresis: the run answers in whole marks, so a pointer that
		// has not left one is not asking for anything different.
		const el = marked();
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		parts(el).run?.dispatchEvent(at('pointermove', 44));
		expect(ghosts(el)).toEqual([1, 1, 0.5, 0, 0, 0]);
	});

	it('tracks the finger from the first movement, and not before', () => {
		// The class only decides whether the fill is glued to the pointer or
		// eases after it. A press that never moves keeps the ease, because
		// there a jump is what actually happened.
		const el = marked();
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		expect(parts(el).run?.classList.contains('sheetsmith-track-dragging')).toBe(
			false,
		);
		parts(el).run?.dispatchEvent(at('pointermove', 46));
		expect(parts(el).run?.classList.contains('sheetsmith-track-dragging')).toBe(
			true,
		);
	});
});
