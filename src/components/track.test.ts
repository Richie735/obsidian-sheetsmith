// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	configError,
	isFlagCard,
	isRowSet,
	markSize,
	marksAtPoint,
	MAX_SEGMENTS,
	runsOf,
	SegmentBox,
	segmentCount,
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

/** A three-run set, the spell slots case rows exist for. */
const slots: TrackConfig = {
	id: 'slots',
	type: 'track',
	label: 'Spell slots',
	position: { col: 1, row: 1, width: 2, height: 1 },
	rows: [
		{ key: 'L1', name: '1st', count: 5 },
		{ key: 'L2', name: '2nd', count: 3 },
		{ key: 'L3', name: '3rd' },
	],
	count: 1,
};

const BODY = '\n```sheet\nvalue: 3\n```\n';
const SLOT_BODY = '\n```sheet\nL1: 2\nL2: 1\nL3: 0\n```\n';

const context: RenderContext = {
	resolved: { count: 6 },
	resolveField: () => null,
	onChange: () => undefined,
};

const render = (
	overrides: Partial<TrackConfig> = {},
	data: TrackData | null = { values: { value: '3' } },
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	document.body.appendChild(el);
	track.render(el, { ...config, ...overrides }, data, { ...context, ...ctx });
	return el;
};

const parts = (el: HTMLElement) => ({
	runs: Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-track-run')),
	run: el.querySelector<HTMLElement>('.sheetsmith-track-run'),
	segments: Array.from(
		el.querySelectorAll<HTMLElement>('.sheetsmith-track-segment'),
	),
	names: Array.from(
		el.querySelectorAll<HTMLElement>('.sheetsmith-track-row-name'),
	),
	step: el.querySelector<HTMLElement>('.sheetsmith-track-step'),
	label: el.querySelector<HTMLElement>('.sheetsmith-track-label'),
	error: el.querySelector<HTMLElement>('.sheetsmith-error'),
	unresolved: Array.from(
		el.querySelectorAll<HTMLElement>('.sheetsmith-track-unresolved'),
	),
});

/** Segments of one run, by index. */
const runSegments = (el: HTMLElement, index = 0) =>
	Array.from(
		parts(el).runs[index]?.querySelectorAll<HTMLElement>(
			'.sheetsmith-track-segment',
		) ?? [],
	);

/**
 * What a run says it is on, saved or not. Separate from the fills below,
 * which say how much of that has reached the note — one is the value and the
 * other is its persistence, and a test about stepping should not depend on
 * the second.
 */
const shown = (el: HTMLElement, index = 0) =>
	Number(parts(el).runs[index]?.getAttribute('aria-valuenow'));

/** Each segment's committed fill: what the note holds. */
const fills = (el: HTMLElement, index = 0) =>
	runSegments(el, index).map((segment) =>
		Number(segment.style.getPropertyValue('--sheetsmith-track-fill')),
	);

/** Each segment's pending fill: everything shown that is not saved yet. */
const ghosts = (el: HTMLElement, index = 0) =>
	runSegments(el, index).map((segment) =>
		Number(segment.style.getPropertyValue('--sheetsmith-track-ghost')),
	);

afterEach(() => {
	document.body.replaceChildren();
	vi.useRealTimers();
});

describe('track.read', () => {
	it('reads the stored mark count', () => {
		expect(track.read(BODY, config)).toEqual({
			ok: true,
			data: { values: { value: '3' } },
		});
	});

	it('reads one entry per row key', () => {
		expect(track.read(SLOT_BODY, slots)).toEqual({
			ok: true,
			data: { values: { L1: '2', L2: '1', L3: '0' } },
		});
	});

	it('treats a section with no fence as empty, not malformed', () => {
		expect(track.read('\nSome prose.\n', config)).toEqual({ ok: true, data: null });
	});

	it('reports a non-numeric value as a malformed section', () => {
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
			data: { values: { value: '99' } },
		});
	});

	it('leaves an entry no row maps to out of the data it reads', () => {
		// Unread is what keeps it unwritten, which is what makes a slot table
		// safe to re-cut when a layout changes.
		const body = '\n```sheet\nL1: 2\nL9: 4\n```\n';
		expect(track.read(body, slots)).toEqual({
			ok: true,
			data: { values: { L1: '2' } },
		});
	});
});

describe('track.write', () => {
	it('round-trips an unchanged section byte for byte', () => {
		const read = track.read(BODY, config);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(track.write(read.data, BODY, config)).toBe(BODY);
	});

	it('round-trips an unchanged row set byte for byte', () => {
		const read = track.read(SLOT_BODY, slots);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(track.write(read.data, SLOT_BODY, slots)).toBe(SLOT_BODY);
	});

	it('writes only the row that changed', () => {
		expect(track.write({ values: { L2: '3' } }, SLOT_BODY, slots)).toBe(
			'\n```sheet\nL1: 2\nL2: 3\nL3: 0\n```\n',
		);
	});

	it('preserves an entry no row maps to', () => {
		const body = '\n```sheet\nL1: 2\nL9: 4\n```\n';
		expect(track.write({ values: { L1: '1' } }, body, slots)).toBe(
			'\n```sheet\nL1: 1\nL9: 4\n```\n',
		);
	});

	it('creates a fresh block for a section that has none', () => {
		expect(track.write({ values: { value: '2' } }, null, config)).toBe(
			'\n```sheet\nvalue: 2\n```\n',
		);
	});
});

describe('track config errors', () => {
	it('accepts a counted run, a named one, and a row set', () => {
		expect(configError(config)).toBeNull();
		expect(configError({ ...config, count: undefined, levels: ['A', 'B'] })).toBeNull();
		expect(configError(slots)).toBeNull();
	});

	it('needs a count, names, or rows', () => {
		expect(configError({ ...config, count: undefined })).toContain(
			'number of segments',
		);
	});

	it('refuses rows and levels together', () => {
		// Named steps are one run's meaning and rows are many runs'
		// identities; together they would ask for step names per row.
		expect(configError({ ...slots, levels: ['A', 'B'] })).toContain(
			'not both',
		);
	});

	it('refuses a single level name, and a level with a glyph but no name', () => {
		expect(configError({ ...config, levels: ['Rested'] })).toContain(
			'at least two level names',
		);
		expect(configError({ ...config, levels: ['Rested', ':☠'] })).toContain(
			'a glyph but no name',
		);
	});

	it('refuses marks that are not a whole number of presses', () => {
		expect(configError({ ...config, marks: 0 })).toContain('1 or more');
		expect(configError({ ...config, marks: 2.5 })).toContain('1 or more');
	});

	it('refuses a row with no key, a duplicate key, or a key holding a colon', () => {
		expect(configError({ ...slots, rows: [{ key: '' }] })).toContain(
			'needs a key',
		);
		expect(
			configError({ ...slots, rows: [{ key: 'L1' }, { key: 'L1' }] }),
		).toContain('both called');
		expect(configError({ ...slots, rows: [{ key: 'a:b' }] })).toContain(
			'cannot contain a colon',
		);
	});

	it('renders the error on this component alone', () => {
		const el = render({ count: undefined });
		expect(parts(el).error?.textContent).toContain('number of segments');
		expect(parts(el).segments).toHaveLength(0);
	});
});

describe('runsOf', () => {
	it('makes a single run a set of one under the shared storage key', () => {
		expect(runsOf(config)).toEqual([{ key: 'value' }]);
		expect(isRowSet(config)).toBe(false);
	});

	it('returns the rows where there are rows', () => {
		expect(runsOf(slots)).toHaveLength(3);
		expect(isRowSet(slots)).toBe(true);
	});
});

describe('segmentCount', () => {
	it('takes its length from the level names, which win over a count', () => {
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
	/** Six 10px segments with 10px gaps, on one line from y 0 to 10. */
	const line: SegmentBox[] = Array.from({ length: 6 }, (_, i) => ({
		left: i * 20,
		right: i * 20 + 10,
		top: 0,
		bottom: 10,
	}));

	it('fills the segment under the pointer and everything below it', () => {
		expect(marksAtPoint(line, 5, 5, 1)).toBe(1);
		expect(marksAtPoint(line, 45, 5, 1)).toBe(3);
	});

	it('fills a segment from its leading edge', () => {
		expect(marksAtPoint(line, 40, 5, 1)).toBe(3);
	});

	it('reads the gap before a segment as the run up to it', () => {
		expect(marksAtPoint(line, 35, 5, 1)).toBe(2);
	});

	it('empties the run left of the first segment and fills it past the last', () => {
		expect(marksAtPoint(line, -20, 5, 1)).toBe(0);
		expect(marksAtPoint(line, 500, 5, 1)).toBe(6);
	});

	it('reaches each mark inside a segment that holds several', () => {
		expect(marksAtPoint(line, 40, 5, 4)).toBe(9);
		expect(marksAtPoint(line, 43, 5, 4)).toBe(10);
		expect(marksAtPoint(line, 46, 5, 4)).toBe(11);
		expect(marksAtPoint(line, 50, 5, 4)).toBe(12);
	});

	it('survives a run that wrapped', () => {
		const wrapped: SegmentBox[] = Array.from({ length: 10 }, (_, i) => ({
			left: (i % 5) * 20,
			right: (i % 5) * 20 + 10,
			top: i < 5 ? 0 : 20,
			bottom: i < 5 ? 10 : 30,
		}));
		expect(marksAtPoint(wrapped, 45, 25, 1)).toBe(8);
		expect(marksAtPoint(wrapped, 45, 5, 1)).toBe(3);
	});

	it('asks about the line a pointer left through', () => {
		const wrapped: SegmentBox[] = Array.from({ length: 10 }, (_, i) => ({
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
	/**
	 * What a name is worth is asserted through the table that answers it, not
	 * through the declaration: a published segment count is a value the
	 * component computes, so reading `self.value` off the entry would be
	 * asserting the marks it was computed from.
	 */
	const scopeFor = (data: TrackData, overrides: Partial<TrackConfig> = {}) => {
		const merged = { ...config, ...overrides };
		const values = track.scopeValues?.(data, merged);
		if (!values) throw new Error('expected scope values');
		return buildSheetScope([
			{
				id: merged.id,
				values,
				resolver: (env) => makeFieldResolver(track, merged, data, env),
			},
		]);
	};

	it('publishes the filled segments under the bare id', () => {
		expect(scopeFor({ values: { value: '3' } })('exhaustion')).toBe(3);
	});

	it('publishes nothing for an empty or unreadable value', () => {
		expect(scopeFor({ values: {} })('exhaustion')).toBeUndefined();
		expect(scopeFor({ values: { value: '' } })('exhaustion')).toBeUndefined();
	});

	it('publishes a named run\'s count as a literal', () => {
		const published = track.scopeValues?.(
			{ values: { value: '1' } },
			{ ...config, count: undefined, levels: ['Rested', 'One', 'Two'] },
		);
		expect(published?.named?.count).toEqual({ value: 2 });
	});

	it('publishes a formula count as a lazily evaluated display', () => {
		const published = track.scopeValues?.(
			{ values: { value: '1' } },
			{ ...config, count: 'level' },
		);
		expect(published?.named?.count).toEqual({
			display: { field: 'count', scope: {} },
		});
	});

	it('publishes a row set per row, and not under its bare id', () => {
		// A component holding several values answers to `<id>.<name>`, as
		// `abilities.DEX` does: there is no one number a set of runs means.
		const published = track.scopeValues?.(
			{ values: { L1: '2', L2: '1', L3: '0' } },
			slots,
		);
		expect(published?.self).toBeUndefined();
		expect(Object.keys(published?.named ?? {})).toEqual(['L1', 'L2', 'L3']);
	});

	describe('through the sheet scope', () => {
		it('answers the bare id with segments and .value with marks', () => {
			const scope = scopeFor({ values: { value: '22' } }, { marks: 4 });
			expect(scope('exhaustion')).toBe(5);
			expect(scope('exhaustion.value')).toBe(22);
		});

		it('answers .count from the layout\'s formula', () => {
			const scope = scopeFor({ values: { value: '1' } }, { count: '2 + 4' });
			expect(scope('exhaustion.count')).toBe(6);
		});

		it('answers a row by its key', () => {
			const data = { values: { L1: '2', L2: '1', L3: '0' } };
			const published = track.scopeValues?.(data, slots);
			if (!published) throw new Error('expected scope values');
			const scope = buildSheetScope([{ id: slots.id, values: published }]);
			expect(scope('slots.L1')).toBe(2);
			expect(scope('slots')).toBeUndefined();
		});

		it('answers a row with segments and its .value with marks', () => {
			// The same rule as the bare id, one level down: a row's name is
			// the boxes it shows, and the marks behind them stay reachable.
			const data = { values: { L1: '8', L2: '2' } };
			const published = track.scopeValues?.(data, { ...slots, marks: 4 });
			if (!published) throw new Error('expected scope values');
			const scope = buildSheetScope([{ id: slots.id, values: published }]);
			expect(scope('slots.L1')).toBe(2);
			expect(scope('slots.L1.value')).toBe(8);
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
			{ values: { value: '3' } },
			{ ...config, ...overrides },
			binding,
			{ resolve: (field) => resolve(field), explain: () => null },
		);

	it('empties without resolving anything', () => {
		expect(reset({ trigger: 'Long Rest', action: 'empty' })).toEqual({
			ok: true,
			data: { values: { value: '0' } },
		});
	});

	it('fills every mark', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'full' }, { marks: 4 }, () => 10),
		).toEqual({ ok: true, data: { values: { value: '40' } } });
	});

	it('fills a named run without resolving a count it does not have', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'full' }, {
				count: undefined,
				levels: ['Rested', 'One', 'Two'],
			}),
		).toEqual({ ok: true, data: { values: { value: '2' } } });
	});

	it('reports a count it could not resolve rather than doing nothing', () => {
		const result = reset({ trigger: 'Long Rest', action: 'full' });
		expect(result?.ok).toBe(false);
		if (result?.ok === false) expect(result.error).toContain('no segments to fill');
	});

	it('resolves a formula in segments, down to the nearest mark', () => {
		expect(
			reset({ trigger: 'Long Rest', action: 'formula', to: 'x' }, { marks: 4 }, () => 2.5),
		).toEqual({ ok: true, data: { values: { value: '10' } } });
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

	it('acts on every row, in one write', () => {
		// The concrete argument for rows over three components: a long rest
		// that has to find three Tracks is three bindings kept in step by hand
		// and three writes the undo has to be pressed three times to reverse.
		const emptied = track.applyReset?.(
			{ values: { L1: '4', L2: '2', L3: '1' } },
			slots,
			{ trigger: 'Long Rest', action: 'empty' },
			{ resolve: () => null, explain: () => null },
		);
		expect(emptied).toEqual({
			ok: true,
			data: { values: { L1: '0', L2: '0', L3: '0' } },
		});
	});

	it('restores each row to its own count', () => {
		const filled = track.applyReset?.(
			{ values: {} },
			slots,
			{ trigger: 'Long Rest', action: 'full' },
			{
				resolve: (field) =>
					field === 'rows.0.count'
						? 5
						: field === 'rows.1.count'
							? 3
							: field === 'count'
								? 1
								: null,
				explain: () => null,
			},
		);
		// L3 has no count of its own and falls back to the component's.
		expect(filled).toEqual({
			ok: true,
			data: { values: { L1: '5', L2: '3', L3: '1' } },
		});
	});

	it('names the row whose count would not resolve', () => {
		const result = track.applyReset?.(
			{ values: {} },
			slots,
			{ trigger: 'Long Rest', action: 'full' },
			{
				resolve: (field) => (field === 'rows.0.count' ? 5 : null),
				explain: () => null,
			},
		);
		expect(result?.ok).toBe(false);
		if (result?.ok === false) expect(result.error).toContain('2nd');
	});

	it('does nothing, and fails at nothing, for a binding with no action', () => {
		expect(reset({ trigger: 'Long Rest' })).toEqual({ ok: true, data: { values: {} } });
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
		const el = render({ count: 10, marks: 4 }, { values: { value: '22' } }, {
			resolved: { count: 10 },
		});
		expect(fills(el).slice(0, 7)).toEqual([1, 1, 1, 1, 1, 0.5, 0]);
	});

	it('fills every segment for a value above the run, and leaves the note alone', () => {
		const changed = vi.fn();
		const el = render({}, { values: { value: '99' } }, { onChange: changed });
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
			{ values: { value: '2' } },
		);
		expect(parts(named).step?.textContent).toBe('Exhaustion 2');
		expect(parts(named).run?.getAttribute('aria-valuetext')).toBe('Exhaustion 2');
		expect(parts(render()).step).toBeNull();
	});

	it('divides a multi-mark segment between its marks, and not at its edges', () => {
		const el = render({ count: 6, marks: 4 }, { values: { value: '0' } });
		const dividers = Array.from(
			parts(el).segments[0]?.querySelectorAll<HTMLElement>(
				'.sheetsmith-track-mark',
			) ?? [],
		);
		expect(dividers).toHaveLength(3);
		expect(
			dividers.map((d) => d.style.getPropertyValue('--sheetsmith-track-at')),
		).toEqual(['0.25', '0.5', '0.75']);
	});

	it('divides nothing where a segment holds one mark', () => {
		expect(render().querySelectorAll('.sheetsmith-track-mark')).toHaveLength(0);
	});

	it('keeps a lettered segment\'s letter above its fill', () => {
		// Three names rather than two: two is one segment, which is a flag and
		// draws the ring instead, and this is about a segment's paint order.
		const el = render(
			{ count: undefined, levels: ['Rested', 'One', 'Two:☠'] },
			{ values: { value: '2' } },
		);
		const segment = parts(el).segments[1];
		const letter = segment?.querySelector<HTMLElement>(
			'.sheetsmith-track-segment-glyph',
		);
		expect(letter?.textContent).toBe('☠');
		expect(segment?.lastElementChild).toBe(letter);
	});

	it('shows only a glyph the layout asked for, never a name\'s initial', () => {
		const el = render(
			{ count: undefined, levels: ['Rested', 'Exhaustion 1', 'Exhaustion 2:☠'] },
			{ values: { value: '0' } },
		);
		expect(parts(el).segments.map((s) => s.textContent)).toEqual(['', '☠']);
	});

	it('grades a harm run toward its far end and leaves progress flat', () => {
		const harm = render({ sense: 'harm' });
		expect(parts(harm).run?.classList.contains('sheetsmith-track-harm')).toBe(true);
		expect(
			parts(harm).segments[0]?.style.getPropertyValue('--sheetsmith-track-grade'),
		).toBe('0.16666666666666666');
		expect(
			parts(harm).segments[5]?.style.getPropertyValue('--sheetsmith-track-grade'),
		).toBe('1');
		expect(
			parts(render()).segments[0]?.style.getPropertyValue('--sheetsmith-track-grade'),
		).toBe('');
	});

	it("lets a row's own sense win over the card's", () => {
		// Death saves are why this exists: three successes and three failures
		// are one shape pointed two ways, and a card that painted both alike
		// would say the wrong thing about one of them. Blank on a row is the
		// card's own sense, which is what a set meaning one thing leaves it as.
		const el = render({
			count: 3,
			sense: 'progress',
			rows: [
				{ key: 'successes' },
				{ key: 'failures', sense: 'harm' },
			],
		});
		const runs = parts(el).runs;
		expect(runs[0]?.classList.contains('sheetsmith-track-harm')).toBe(false);
		expect(runs[1]?.classList.contains('sheetsmith-track-harm')).toBe(true);
	});

	it('shows "?" and no run for a count that did not resolve', () => {
		const el = render({ count: 'level' }, { values: { value: '1' } }, {
			resolved: { count: null },
			explainField: () => 'level is not defined on this sheet.',
		});
		expect(parts(el).unresolved[0]?.textContent).toBe('?');
		expect(parts(el).unresolved[0]?.getAttribute('title')).toContain('not defined');
		expect(parts(el).segments).toHaveLength(0);
	});

	it('leaves the heading off where the layout asked', () => {
		expect(parts(render()).label?.textContent).toBe('Exhaustion');
		expect(parts(render({ hideLabel: true })).label).toBeNull();
	});
});

describe('track rows', () => {
	const slotContext: Partial<RenderContext> = {
		resolved: { count: 1 },
		resolveField: (field) =>
			field === 'rows.0.count' ? 5 : field === 'rows.1.count' ? 3 : null,
	};

	const renderSlots = (
		data: TrackData | null = { values: { L1: '2', L2: '1', L3: '0' } },
		ctx: Partial<RenderContext> = {},
	) => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, slots, data, { ...context, ...slotContext, ...ctx });
		return el;
	};

	it('draws one run per row, each at its own length', () => {
		const el = renderSlots();
		expect(parts(el).runs).toHaveLength(3);
		expect(runSegments(el, 0)).toHaveLength(5);
		expect(runSegments(el, 1)).toHaveLength(3);
		// The last row has no count of its own and falls back to the
		// component's, which is the point of the component still carrying one.
		expect(runSegments(el, 2)).toHaveLength(1);
	});

	it('names each run beside it', () => {
		expect(parts(renderSlots()).names.map((n) => n.textContent)).toEqual([
			'1st',
			'2nd',
			'3rd',
		]);
	});

	it('fills each run from its own entry', () => {
		const el = renderSlots();
		expect(fills(el, 0)).toEqual([1, 1, 0, 0, 0]);
		expect(fills(el, 1)).toEqual([1, 0, 0]);
		expect(fills(el, 2)).toEqual([0]);
	});

	it('leaves the rest of the card live when one row will not resolve', () => {
		// SPEC §5's rule that one failure must not take the sheet down,
		// applied inside a component rather than across the sheet.
		const el = renderSlots(undefined, {
			resolveField: (field) => (field === 'rows.0.count' ? 5 : null),
			resolved: { count: null },
		});
		expect(parts(el).unresolved).toHaveLength(2);
		expect(parts(el).runs).toHaveLength(1);
		expect(runSegments(el, 0)).toHaveLength(5);
	});

	it('is one tab stop for the card, whatever it is a run of', () => {
		// Nine slot levels must not be nine stops on the way past the card.
		const el = renderSlots();
		expect(parts(el).runs.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
	});

	it('moves between rows with up and down, not the value', () => {
		const el = renderSlots();
		const first = parts(el).runs[0];
		first?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }),
		);
		expect(parts(el).runs.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
		// And the value it left is untouched.
		expect(shown(el, 0)).toBe(2);
	});

	it('leaves up and down alone where there is only one run', () => {
		const el = render();
		const event = new KeyboardEvent('keydown', { key: 'ArrowUp', cancelable: true });
		parts(el).run?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(shown(el)).toBe(3);
	});

	it('steps the run the keyboard is on, and writes only that row', () => {
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = renderSlots(undefined, { onChange: changed });
		parts(el).runs[1]?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }),
		);
		vi.advanceTimersByTime(1000);
		expect(changed).toHaveBeenCalledWith({ values: { L2: '2' } });
	});

	it('groups the runs under the card\'s name', () => {
		const list = renderSlots().querySelector('.sheetsmith-track-set');
		expect(list?.getAttribute('role')).toBe('group');
		expect(list?.getAttribute('aria-label')).toBe('Spell slots');
	});
});

describe('track keyboard', () => {
	const press = (el: HTMLElement, key: string, shiftKey = false) =>
		parts(el).run?.dispatchEvent(
			new KeyboardEvent('keydown', { key, shiftKey, cancelable: true }),
		);

	it('steps a segment with left and right', () => {
		const el = render();
		press(el, 'ArrowRight');
		expect(shown(el)).toBe(4);
		press(el, 'ArrowLeft');
		press(el, 'ArrowLeft');
		expect(shown(el)).toBe(2);
	});

	it('steps a mark with shift, the inverse of a card\'s shift-by-ten', () => {
		const el = render({ count: 10, marks: 4 }, { values: { value: '20' } }, {
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
		const el = render({ count: 10, marks: 4 }, { values: { value: '22' } }, {
			resolved: { count: 10 },
		});
		press(el, ' ');
		expect(shown(el)).toBe(24);
	});

	it('holds the value inside the run', () => {
		const el = render({}, { values: { value: '0' } });
		press(el, 'ArrowLeft');
		expect(shown(el)).toBe(0);
		press(el, 'End');
		press(el, 'ArrowRight');
		expect(shown(el)).toBe(6);
	});

	it('writes a run of presses once, when the gesture ends', () => {
		const changed = vi.fn();
		const el = render({}, { values: { value: '3' } }, { onChange: changed });
		press(el, 'ArrowRight');
		press(el, 'ArrowRight');
		press(el, 'ArrowLeft');
		expect(changed).not.toHaveBeenCalled();
		parts(el).run?.dispatchEvent(new Event('blur'));
		expect(changed).toHaveBeenCalledTimes(1);
		expect(changed).toHaveBeenCalledWith({ values: { value: '4' } });
	});

	it('writes nothing where the gesture landed back where it started', () => {
		const changed = vi.fn();
		const el = render({}, { values: { value: '3' } }, { onChange: changed });
		press(el, 'ArrowRight');
		press(el, 'ArrowLeft');
		parts(el).run?.dispatchEvent(new Event('blur'));
		expect(changed).not.toHaveBeenCalled();
	});

	it('draws a keyboard step faint until it reaches the note', () => {
		// The commit is otherwise invisible: the fill happens on the keystroke
		// and the write follows up to a gesture-window later.
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = render({}, { values: { value: '3' } }, { onChange: changed });
		press(el, 'ArrowRight');
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 0, 0]);
		vi.advanceTimersByTime(1000);
		expect(changed).toHaveBeenCalledWith({ values: { value: '4' } });
		expect(fills(el)).toEqual([1, 1, 1, 1, 0, 0]);
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
		parts(el).runs.forEach((run) => {
			Array.from(
				run.querySelectorAll<HTMLElement>('.sheetsmith-track-segment'),
			).forEach((segment, i) => {
				segment.getBoundingClientRect = () =>
					({ left: i * 20, right: i * 20 + 10, top: 0, bottom: 10 }) as DOMRect;
			});
			run.getBoundingClientRect = () =>
				({ left: 0, right: 110, top: 0, bottom: 10 }) as DOMRect;
			run.setPointerCapture = () => undefined;
			run.releasePointerCapture = () => undefined;
		});
		return el;
	};

	const at = (type: string, x: number, y = 5) =>
		new PointerEvent(type, { pointerId: 1, button: 0, clientX: x, clientY: y });

	const marked = (value = '0') =>
		measure(
			render({ marks: 4 }, { values: { value } }, { resolved: { count: 6 } }),
		);

	it('answers on the way down and commits on the way up', () => {
		const changed = vi.fn();
		const el = measure(render({}, { values: { value: '3' } }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 85));
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
		expect(changed).not.toHaveBeenCalled();
		parts(el).run?.dispatchEvent(at('pointerup', 85));
		expect(fills(el)).toEqual([1, 1, 1, 1, 1, 0]);
		expect(changed).toHaveBeenCalledWith({ values: { value: '5' } });
	});

	it('reaches a mark on a press, not only a whole segment', () => {
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

	it('clears one mark when the press lands where the value stands', () => {
		// The mark, not the segment: at several marks to a segment those are
		// different lines and only the finer one is the target.
		const el = marked('10');
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		expect(fills(el)).toEqual([1, 1, 0.25, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 43));
		expect(fills(el)).toEqual([1, 1, 0.25, 0, 0, 0]);
	});

	it('clears the segment at one mark to a segment, where the two are one thing', () => {
		const el = measure(render({}, { values: { value: '3' } }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		parts(el).run?.dispatchEvent(at('pointerup', 45));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	it('holds the clear while the finger stays on the mark that armed it', () => {
		const el = measure(render({}, { values: { value: '3' } }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		expect(ghosts(el)).toEqual([1, 1, 1, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 47));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 47));
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	it('becomes an ordinary set once the gesture leaves the mark', () => {
		const changed = vi.fn();
		const el = measure(render({}, { values: { value: '3' } }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		parts(el).run?.dispatchEvent(at('pointermove', 85));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 85));
		expect(changed).toHaveBeenCalledWith({ values: { value: '5' } });
	});

	it('does not re-arm the clear when the finger comes back', () => {
		const changed = vi.fn();
		const el = measure(render({}, { values: { value: '3' } }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 45));
		parts(el).run?.dispatchEvent(at('pointermove', 85));
		parts(el).run?.dispatchEvent(at('pointermove', 45));
		expect(fills(el)).toEqual([1, 1, 1, 0, 0, 0]);
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointerup', 45));
		expect(changed).not.toHaveBeenCalled();
	});

	it('lets a near miss be slid onto the right mark before it commits', () => {
		const changed = vi.fn();
		const el = measure(
			render({ marks: 4 }, { values: { value: '0' } }, {
				resolved: { count: 6 },
				onChange: changed,
			}),
		);
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		parts(el).run?.dispatchEvent(at('pointermove', 46));
		parts(el).run?.dispatchEvent(at('pointerup', 46));
		expect(fills(el)).toEqual([1, 1, 0.75, 0, 0, 0]);
		expect(changed).toHaveBeenCalledWith({ values: { value: '11' } });
	});

	it('moves the value on a movement far under ten pixels', () => {
		// No drag threshold: a press is a drag of no length, so there is
		// nothing to disambiguate and ten pixels of dead distance would eat
		// most of a mark.
		const el = marked();
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		expect(ghosts(el)).toEqual([1, 1, 0.5, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 46));
		expect(ghosts(el)).toEqual([1, 1, 0.75, 0, 0, 0]);
	});

	it('holds still for a wobble inside one mark', () => {
		const el = marked();
		parts(el).run?.dispatchEvent(at('pointerdown', 43));
		parts(el).run?.dispatchEvent(at('pointermove', 44));
		expect(ghosts(el)).toEqual([1, 1, 0.5, 0, 0, 0]);
	});

	it('tracks the finger from the first movement, and not before', () => {
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

	it('gives back the committed value while the drag is off the run', () => {
		const el = measure(render({}, { values: { value: '2' } }));
		parts(el).run?.dispatchEvent(at('pointerdown', 85));
		parts(el).run?.dispatchEvent(at('pointermove', 85, 400));
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0]);
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 85, 5));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0]);
	});

	it('commits nothing when the drag is released off the run', () => {
		const changed = vi.fn();
		const el = measure(render({}, { values: { value: '2' } }, { onChange: changed }));
		parts(el).run?.dispatchEvent(at('pointerdown', 85));
		parts(el).run?.dispatchEvent(at('pointermove', 85, 400));
		parts(el).run?.dispatchEvent(at('pointerup', 85, 400));
		expect(changed).not.toHaveBeenCalled();
		expect(fills(el)).toEqual([1, 1, 0, 0, 0, 0]);
	});

	it('gives at the ends rather than stopping', () => {
		const el = measure(render({}, { values: { value: '0' } }));
		parts(el).run?.dispatchEvent(at('pointerdown', 5));
		parts(el).run?.dispatchEvent(at('pointermove', 300));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1]);
		expect(parts(el).run?.style.transform ?? '').toMatch(/^translateX\(\d/);
		parts(el).run?.dispatchEvent(at('pointerup', 300));
		expect(parts(el).run?.style.transform).toBe('');
	});

	it('drops the give under reduced motion, and keeps the pending fill', () => {
		const matchMedia = vi
			.spyOn(window, 'matchMedia')
			.mockReturnValue({ matches: true } as MediaQueryList);
		try {
			const el = measure(render({}, { values: { value: '0' } }));
			parts(el).run?.dispatchEvent(at('pointerdown', 5));
			parts(el).run?.dispatchEvent(at('pointermove', 300));
			expect(parts(el).run?.style.transform).toBe('');
			expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1]);
		} finally {
			matchMedia.mockRestore();
		}
	});

	it('reads a named step on a long press without changing it', () => {
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = measure(
			render(
				{ count: undefined, levels: ['Rested', 'One', 'Two', 'Three'] },
				{ values: { value: '1' } },
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
	 * A wrapped run is the first thing a phone hits, and it is where "past the
	 * last segment" stops being one place.
	 */
	const wrapped = (value = '0') => {
		const el = render({ count: 10 }, { values: { value } }, {
			resolved: { count: 10 },
		});
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

	it('follows reading order across the wrap: the line is chosen by y', () => {
		const first = wrapped();
		parts(first).run?.dispatchEvent(at('pointerdown', 45, 5));
		expect(ghosts(first).slice(0, 4)).toEqual([1, 1, 1, 0]);

		const second = wrapped();
		parts(second).run?.dispatchEvent(at('pointerdown', 45, 25));
		expect(ghosts(second)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
	});

	it('does not resist at the end of a line that is not the end of the run', () => {
		const el = wrapped();
		parts(el).run?.dispatchEvent(at('pointerdown', 5, 5));
		parts(el).run?.dispatchEvent(at('pointermove', 300, 5));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
		expect(parts(el).run?.style.transform).toBe('');
	});

	it('resists past the last segment of the last line', () => {
		const el = wrapped();
		parts(el).run?.dispatchEvent(at('pointerdown', 5, 25));
		parts(el).run?.dispatchEvent(at('pointermove', 300, 25));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
		expect(parts(el).run?.style.transform ?? '').toMatch(/^translateX\(\d/);
	});

	it('cancels when the pointer leaves the run itself, wrap and all', () => {
		const el = wrapped();
		parts(el).run?.dispatchEvent(at('pointerdown', 45, 5));
		parts(el).run?.dispatchEvent(at('pointermove', 45, 25));
		expect(ghosts(el)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
		parts(el).run?.dispatchEvent(at('pointermove', 45, 400));
		expect(ghosts(el)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
	});

	it('keeps a gesture on the run that claimed it', () => {
		// A drag on the first-level slots that drifted twenty pixels down must
		// not start setting second-level ones, silently, on the control whose
		// only job is to record what the player has left.
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, slots, { values: { L1: '2', L2: '1', L3: '0' } }, {
			...context,
			resolved: { count: 1 },
			resolveField: (field) =>
				field === 'rows.0.count' ? 5 : field === 'rows.1.count' ? 3 : null,
		});
		const runs = parts(el).runs;
		runs.forEach((run, index) => {
			Array.from(
				run.querySelectorAll<HTMLElement>('.sheetsmith-track-segment'),
			).forEach((segment, i) => {
				segment.getBoundingClientRect = () =>
					({
						left: i * 20,
						right: i * 20 + 10,
						top: index * 20,
						bottom: index * 20 + 10,
					}) as DOMRect;
			});
			run.getBoundingClientRect = () =>
				({ left: 0, right: 110, top: index * 20, bottom: index * 20 + 10 }) as DOMRect;
			run.setPointerCapture = () => undefined;
			run.releasePointerCapture = () => undefined;
		});

		runs[0]?.dispatchEvent(at('pointerdown', 85, 5));
		// Twenty pixels down is the second run's band, and the first run reads
		// it as having left rather than the second reading it as a press.
		runs[0]?.dispatchEvent(at('pointermove', 85, 25));
		expect(ghosts(el, 0)).toEqual([0, 0, 0, 0, 0]);
		expect(fills(el, 1)).toEqual([1, 0, 0]);
		expect(ghosts(el, 1)).toEqual([0, 0, 0]);
	});
});

/*
 * A run of one segment, which is where Toggle went (SPEC §13).
 *
 * Grouped rather than spread through the sections above, because what is being
 * checked is one claim repeated at every layer: two states is a flag, and the
 * flag-ness is a property of the *layout* rather than of one evaluation.
 */
describe('a flag track', () => {
	const flag: TrackConfig = {
		id: 'inspiration',
		type: 'track',
		label: 'Inspiration',
		position: { col: 1, row: 1, width: 1, height: 1 },
		count: 1,
	};

	/** The ring on a flag card, by row. */
	const rings = (el: HTMLElement) =>
		Array.from(el.querySelectorAll<HTMLElement>('.sheetsmith-track-flag'));

	const drawFlag = (
		overrides: Partial<TrackConfig> = {},
		data: TrackData | null = { values: { value: 'yes' } },
		ctx: Partial<RenderContext> = {},
	) => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, { ...flag, ...overrides }, data, {
			// Nothing resolved by default, on purpose: a flag's length is a
			// literal, so the card must draw without asking the formula layer
			// anything at all.
			resolved: {},
			resolveField: () => null,
			onChange: () => undefined,
			...ctx,
		});
		return el;
	};

	describe('is decided by the layout, not by a resolved number', () => {
		it('takes a literal count of one, written as a number or as text', () => {
			expect(isFlagCard(flag)).toBe(true);
			expect(isFlagCard({ ...flag, count: '1' })).toBe(true);
			expect(isFlagCard({ ...flag, count: ' 1 ' })).toBe(true);
		});

		it('refuses a formula, whatever it works out to', () => {
			// The whole reason the predicate is static: `level - 4` is 1 for a
			// fifth-level character and 3 later, and a note that changed spelling
			// on a level-up would be rewriting itself behind the reader.
			expect(isFlagCard({ ...flag, count: 'level - 4' })).toBe(false);
			expect(isFlagCard({ ...flag, count: '3' })).toBe(false);
		});

		it('takes two level names, since naming the steps settles the length', () => {
			expect(
				isFlagCard({ ...flag, count: undefined, levels: ['Fine', 'Bloodied:!'] }),
			).toBe(true);
			expect(
				isFlagCard({ ...flag, count: undefined, levels: ['Fine', 'Hurt', 'Down'] }),
			).toBe(false);
		});

		it('refuses one segment holding several marks: five states is not two', () => {
			expect(isFlagCard({ ...flag, marks: 4 })).toBe(false);
		});

		it('is the whole card, so a slot set with a one-slot row still counts', () => {
			// Five, three and one — the third falling back to the component's
			// count. Per run this would write `L1: 2`, `L2: 1`, `L3: yes` down one
			// fenced block, and one spelling per card is what a hand-editable
			// note needs.
			expect(isFlagCard(slots)).toBe(false);
			expect(
				isFlagCard({
					...flag,
					rows: [{ key: 'alert' }, { key: 'lucky' }],
				}),
			).toBe(true);
		});
	});

	describe('reads either spelling, on a run of any length', () => {
		it('reads a flag as one mark and a cleared one as none', () => {
			expect(track.read('\n```sheet\nvalue: yes\n```\n', flag)).toEqual({
				ok: true,
				data: { values: { value: 'yes' } },
			});
			expect(
				track.read('\n```sheet\nvalue: ✔\n```\n', flag).ok,
			).toBe(true);
		});

		it('accepts a flag on a long run, which is what a raised count needs', () => {
			// The case that would otherwise be a crash: a layout that wrote `yes`
			// raises its count to six, and every character note it wrote becomes
			// an error card the moment it does.
			const raised: TrackConfig = { ...flag, count: 6 };
			expect(track.read('\n```sheet\nvalue: yes\n```\n', raised)).toEqual({
				ok: true,
				data: { values: { value: 'yes' } },
			});
			const el = drawFlag({ count: 6 }, { values: { value: 'yes' } }, {
				resolved: { count: 6 },
			});
			// One mark, its first segment filled: the state the flag was in.
			expect(fills(el)).toEqual([1, 0, 0, 0, 0, 0]);
		});

		it('still reports something that is neither a number nor a flag', () => {
			// Named for what a checkbox writes. This assertion existed and held
			// the *other* card's sentence — "not a number of marks" — which is a
			// spelling this card never produces, so it pointed its author at a
			// fix they could not use (SPEC §10).
			expect(track.read('\n```sheet\nvalue: maybe\n```\n', flag)).toEqual({
				ok: false,
				error: '"maybe" is not yes or no.',
			});
			// And a run of segments still says marks, since that is what it holds.
			expect(
				track.read('\n```sheet\nvalue: maybe\n```\n', { ...flag, count: 6 }),
			).toEqual({ ok: false, error: '"maybe" is not a number of marks.' });
		});

		it('round-trips a flag section byte for byte', () => {
			// Constraint 3, on the spelling this feature adds. Nothing about the
			// write path changed, which is the point of asserting it here.
			const body = '\n```sheet\nvalue: yes\n```\n';
			const read = track.read(body, flag);
			if (!read.ok || !read.data) throw new Error('expected data');
			expect(track.write(read.data, body, flag)).toBe(body);
		});

		it('shows a count on a flag card as ticked, and leaves the note alone', () => {
			// A note written before the fold, by a layout that has not changed.
			const el = drawFlag({}, { values: { value: '1' } });
			expect(rings(el)[0]?.getAttribute('aria-pressed')).toBe('true');
		});
	});

	describe('publishes a boolean', () => {
		const publish = (
			overrides: Partial<TrackConfig>,
			data: TrackData | null,
		) => {
			const config = { ...flag, ...overrides };
			const scope = buildSheetScope([
				{
					id: config.id,
					values: track.scopeValues?.(data, config) ?? {},
					resolver: () => makeFieldResolver(track, config, data, undefined),
				},
			]);
			return scope;
		};

		it('under its bare id and under .value alike', () => {
			// What Toggle promised, and what a `toggle` column's cell already
			// means to a formula: `if(inspiration, 1, 0)` is the expression an
			// author writes for a flag, and 1 and 0 would have made it an error.
			const scope = publish({}, { values: { value: 'yes' } });
			expect(scope('inspiration')).toBe(true);
			expect(scope('inspiration.value')).toBe(true);
			expect(publish({}, { values: { value: 'no' } })('inspiration')).toBe(false);
		});

		it('keeps publishing its count, so lowering a count takes no name away', () => {
			// A numeric run publishes `<id>.count`; a layout dropping from six
			// segments to one must not silently break the formulas reading it.
			expect(publish({}, { values: { value: 'yes' } })('inspiration.count')).toBe(1);
			// And a checklist publishes none, exactly as a numeric row set does:
			// a set of runs has no one ceiling to name.
			expect(
				publish(
					{ rows: [{ key: 'alert' }, { key: 'lucky' }] },
					{ values: {} },
				)('inspiration.count'),
			).toBeUndefined();
		});

		it('as false where the note holds nothing, not as an unknown name', () => {
			// A flag has two states and no room for a third, and the empty ring
			// on screen reads as "no". The alternative is a "?" beside every
			// unset flag on a new character's sheet.
			expect(publish({}, null)('inspiration')).toBe(false);
			expect(publish({}, { values: {} })('inspiration.value')).toBe(false);
		});

		it('per row on a checklist, and nothing under the bare id', () => {
			const scope = publish(
				{ rows: [{ key: 'alert' }, { key: 'lucky' }] },
				{ values: { alert: 'yes', lucky: 'no' } },
			);
			expect(scope('inspiration.alert')).toBe(true);
			expect(scope('inspiration.lucky')).toBe(false);
			expect(scope('inspiration')).toBeUndefined();
		});
	});

	describe('resets to yes and no', () => {
		const context = {
			resolve: () => null,
			explain: () => null,
		};

		it('fills and empties in the card\'s own spelling', () => {
			expect(
				track.applyReset?.(
					{ values: { value: 'no' } },
					flag,
					{ trigger: 'Long rest', action: 'full' },
					context,
				),
			).toEqual({ ok: true, data: { values: { value: 'yes' } } });
			expect(
				track.applyReset?.(
					{ values: { value: 'yes' } },
					flag,
					{ trigger: 'Long rest', action: 'empty' },
					context,
				),
			).toEqual({ ok: true, data: { values: { value: 'no' } } });
		});

		it('fills and empties without resolving anything', () => {
			// §6's `full` and `empty` name the states rather than the numbers
			// precisely so one set of three actions covers a Pool's max and a
			// flag's yes, and this is the branch that would have cost it: a
			// spelling that needed the resolved count could not clear a card
			// whose count is broken.
			const refuse = {
				resolve: (): never => {
					throw new Error('a flag must resolve nothing');
				},
				explain: () => null,
			};
			const checklist = {
				...flag,
				rows: [{ key: 'alert' }, { key: 'lucky' }],
			};
			expect(
				track.applyReset?.(
					null,
					checklist,
					{ trigger: 'Long rest', action: 'empty' },
					refuse,
				),
			).toEqual({ ok: true, data: { values: { alert: 'no', lucky: 'no' } } });
			expect(
				track.applyReset?.(
					null,
					checklist,
					{ trigger: 'Long rest', action: 'full' },
					refuse,
				),
			).toEqual({ ok: true, data: { values: { alert: 'yes', lucky: 'yes' } } });
		});

		it('spells a formula outcome as a flag', () => {
			const resolved = (to: number) =>
				track.applyReset?.(
					{ values: { value: 'no' } },
					flag,
					{ trigger: 'Long rest', action: 'formula', to: String(to) },
					{ resolve: () => to, explain: () => null },
				);
			expect(resolved(1)).toEqual({ ok: true, data: { values: { value: 'yes' } } });
			expect(resolved(4)).toEqual({ ok: true, data: { values: { value: 'yes' } } });
			expect(resolved(0)).toEqual({ ok: true, data: { values: { value: 'no' } } });
		});
	});

	describe('draws the level ring, not a segment', () => {
		it('renders one ring and no segments', () => {
			const el = drawFlag();
			expect(rings(el)).toHaveLength(1);
			expect(el.querySelectorAll('.sheetsmith-track-segment')).toHaveLength(0);
			expect(el.querySelectorAll('.sheetsmith-track-run')).toHaveLength(0);
			// The shared painter's own class, so a flag on a card cannot measure
			// differently from the same flag in a table cell (docs/UI.md §9).
			expect(rings(el)[0]?.classList.contains('sheetsmith-level-ring')).toBe(true);
		});

		it('is a toggle button rather than a slider', () => {
			const ring = rings(drawFlag())[0];
			expect(ring?.tagName).toBe('BUTTON');
			expect(ring?.getAttribute('aria-pressed')).toBe('true');
			expect(ring?.getAttribute('role')).toBeNull();
			expect(ring?.getAttribute('aria-label')).toBe('Inspiration');
		});

		it('fills for yes and empties for no', () => {
			expect(
				rings(drawFlag())[0]?.classList.contains('sheetsmith-level-ring-on'),
			).toBe(true);
			const off = drawFlag({}, { values: { value: 'no' } });
			expect(
				rings(off)[0]?.classList.contains('sheetsmith-level-ring-on'),
			).toBe(false);
		});

		it('carries a named step\'s mark, and the name behind it', () => {
			const el = drawFlag(
				{ count: undefined, levels: ['Fine', 'Bloodied:!'] },
				{ values: { value: 'yes' } },
			);
			expect(rings(el)[0]?.textContent).toBe('!');
			expect(rings(el)[0]?.getAttribute('title')).toBe('Bloodied');
		});

		it('gives an unnamed flag no tooltip, since aria-pressed already says it', () => {
			expect(rings(drawFlag())[0]?.getAttribute('title')).toBeNull();
		});

		it('draws no step line: a flag\'s one step is already on the ring', () => {
			const el = drawFlag(
				{ count: undefined, levels: ['Fine', 'Bloodied:!'] },
				{ values: { value: 'yes' } },
			);
			expect(el.querySelector('.sheetsmith-track-step')).toBeNull();
		});

		it('names each row of a checklist, and spaces the rings apart', () => {
			const el = drawFlag(
				{ rows: [{ key: 'alert', name: 'Alert' }, { key: 'lucky', name: 'Lucky' }] },
				{ values: { alert: 'yes', lucky: 'no' } },
			);
			expect(rings(el)).toHaveLength(2);
			expect(rings(el).map((r) => r.getAttribute('aria-label'))).toEqual([
				'Alert',
				'Lucky',
			]);
			// The ring's hit target reaches past its own box, so a stacked column
			// of them needs its rows further apart than a stacked column of runs.
			expect(
				el
					.querySelector('.sheetsmith-track-rows')
					?.classList.contains('sheetsmith-track-flags'),
			).toBe(true);
		});

		it('keeps the card to one tab stop', () => {
			const el = drawFlag(
				{ rows: [{ key: 'alert' }, { key: 'lucky' }] },
				{ values: {} },
			);
			expect(rings(el).map((r) => r.tabIndex)).toEqual([0, -1]);
		});
	});

	describe('writes on the press', () => {
		const changes = () => {
			const seen: Partial<TrackData>[] = [];
			const el = document.createElement('div');
			document.body.appendChild(el);
			return {
				seen,
				render: (
					overrides: Partial<TrackConfig> = {},
					data: TrackData | null = { values: { value: 'no' } },
				) => {
					track.render(el, { ...flag, ...overrides }, data, {
						resolved: {},
						resolveField: () => null,
						onChange: (delta) => seen.push(delta),
					});
					return el;
				},
			};
		};

		it('flips and writes at once, with no window to wait out', () => {
			const card = changes();
			const el = card.render();
			rings(el)[0]?.click();
			expect(card.seen).toEqual([{ values: { value: 'yes' } }]);
			expect(rings(el)[0]?.getAttribute('aria-pressed')).toBe('true');
		});

		it('writes once per ring pressed, not once per burst', () => {
			// `commit` collects every dirty run, so this path reads as though it
			// would batch, and it never can: the press writes synchronously, so
			// the first has landed before the second can arrive. Pinned because
			// the spec claimed the opposite until somebody measured it — and
			// because the fix somebody would reach for is routing the press
			// through `commitSoon`, which would make a checklist's writes late to
			// buy a batch nothing asked for.
			const card = changes();
			const el = card.render(
				{ rows: [{ key: 'alert' }, { key: 'lucky' }] },
				{ values: { alert: 'no', lucky: 'no' } },
			);
			rings(el)[0]?.click();
			rings(el)[1]?.click();
			expect(card.seen).toEqual([
				{ values: { alert: 'yes' } },
				{ values: { lucky: 'yes' } },
			]);
		});

		it('writes nothing where the note already says what a press asks for', () => {
			/*
			 * A flag card handed `value: 1` from before the fold would otherwise
			 * find "yes" different from "1" and rewrite the note having changed
			 * nothing the reader asked to change — the decision the spec calls
			 * "the write that must not happen".
			 *
			 * Driven through a press that is a no-op rather than through a blur.
			 * A flag has no blur listener, because it writes on the press and so
			 * has nothing to defer; dispatching one here reached no code at all
			 * and the assertion held under every implementation, including one
			 * that spelled `sent` wrong. Right arrow on a ring already set is the
			 * route that does reach it: `setMarks` returns early and `commit`
			 * runs anyway, with the note's own spelling as the only thing it can
			 * compare against.
			 */
			const card = changes();
			const el = card.render({}, { values: { value: '1' } });
			rings(el)[0]?.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }),
			);
			expect(card.seen).toEqual([]);
			// And the ring still reads the note, rather than having been reset
			// along the way.
			expect(rings(el)[0]?.getAttribute('aria-pressed')).toBe('true');
		});

		it('sets with right, clears with left, and moves rows with up and down', () => {
			const card = changes();
			const el = card.render(
				{ rows: [{ key: 'alert' }, { key: 'lucky' }] },
				{ values: { alert: 'no', lucky: 'no' } },
			);
			const key = (index: number, name: string) =>
				rings(el)[index]?.dispatchEvent(
					new KeyboardEvent('keydown', { key: name, cancelable: true }),
				);
			key(0, 'ArrowRight');
			expect(card.seen).toEqual([{ values: { alert: 'yes' } }]);
			// Right again is the same answer, so nothing is written twice.
			key(0, 'ArrowRight');
			expect(card.seen).toHaveLength(1);
			key(0, 'ArrowLeft');
			expect(card.seen[1]).toEqual({ values: { alert: 'no' } });

			key(0, 'ArrowDown');
			expect(rings(el).map((r) => r.tabIndex)).toEqual([-1, 0]);
		});
	});
});
