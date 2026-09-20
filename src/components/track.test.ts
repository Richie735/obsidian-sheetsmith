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
import { buildSheet, buildSheetScope, ReadComponent } from '../formula/sheet';
import {
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../formula/resolve';
import { table, TableConfig } from './table';
import { Layout } from '../parse/layout';
import { RenderContext } from '../types';
import { sampleOf } from '../test/sample';
import { expectSpokenChildrenLast } from '../test/spoken-order';
import { closeAnchoredPanel } from '../ui/anchored-panel';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { armedName, STOOD_DOWN } from '../interaction/arm-to-confirm';
import { hold, pressDown, release } from '../test/pointer';

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

/**
 * What a name is worth is asserted through the table that answers it, not
 * through the declaration: a published segment count is a value the
 * component computes, so reading `self.value` off the entry would be
 * asserting the marks it was computed from.
 *
 * `base` defaults to the single-run `config`; a row-set test passes `slots`
 * so the same merge, build and resolver-wiring is not a second copy kept in
 * step by hand.
 */
const scopeFor = (
	data: TrackData,
	overrides: Partial<TrackConfig> = {},
	base: TrackConfig = config,
) => {
	const merged = { ...base, ...overrides };
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

	it('a null value removes that row\'s whole line, leaving every other row untouched', () => {
		expect(track.write({ values: { L1: null } }, SLOT_BODY, slots)).toBe(
			'\n```sheet\nL2: 1\nL3: 0\n```\n',
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

describe('track.scopeValues: how many of a row are left', () => {
	it('is count - filled, for a row with its own count and for one falling back', () => {
		// SLOT_BODY read through the fixture: L1 (own count 5) two marks in,
		// L2 (own count 3) one mark in, L3 (no count of its own, falls back
		// to the component's count 1) untouched.
		const scope = scopeFor({ values: { L1: '2', L2: '1', L3: '0' } }, {}, slots);
		expect(scope('slots.L1.left')).toBe(3);
		expect(scope('slots.L2.left')).toBe(2);
		// L3 is the one row in the fixture proving the fallback rather than a
		// row's own count, deliberately (SPEC §13).
		expect(scope('slots.L3.left')).toBe(1);
	});

	it('publishes nothing for a row whose own count formula does not resolve, and does not take the other rows with it', () => {
		const scope = scopeFor(
			{ values: { L1: '2', L2: '1', L3: '0' } },
			{
				rows: [
					// `unknown_name` is not a name on this sheet, so the row's own
					// count formula fails to resolve — the same "?" `render` shows
					// on the card for this row.
					{ key: 'L1', name: '1st', count: 'unknown_name' },
					{ key: 'L2', name: '2nd', count: 3 },
					{ key: 'L3', name: '3rd' },
				],
			},
			slots,
		);
		expect(scope('slots.L1.left')).toBeUndefined();
		expect(scope('slots.L2.left')).toBe(2);
		expect(scope('slots.L3.left')).toBe(1);
	});

	it('publishes nothing for a declared row with no stored entry yet', () => {
		const scope = scopeFor({ values: {} }, {}, slots);
		expect(scope('slots.L1.left')).toBeUndefined();
		expect(scope('slots.L2.left')).toBeUndefined();
		expect(scope('slots.L3.left')).toBeUndefined();
	});

	it('is unaffected by sense: a harm-graded row computes the same as an otherwise-identical progress-graded one', () => {
		const harm = scopeFor(
			{ values: { L1: '2' } },
			{ rows: [{ key: 'L1', name: '1st', count: 5, sense: 'harm' }] },
			slots,
		);
		const progress = scopeFor(
			{ values: { L1: '2' } },
			{ rows: [{ key: 'L1', name: '1st', count: 5, sense: 'progress' }] },
			slots,
		);
		expect(harm('slots.L1.left')).toBe(3);
		expect(progress('slots.L1.left')).toBe(3);
	});

	it('a single (non-row-set) track\'s self entry carries no left member', () => {
		// Asserted directly against the entry rather than only through an
		// unresolvable name, so the exclusion reads as declared rather than
		// an incidental gap: a bare run's ceiling is already reachable at
		// `<id>.count`, so it does not opt in.
		const published = track.scopeValues?.({ values: { value: '3' } }, config);
		expect(published?.self).toBeDefined();
		expect(published?.self?.left).toBeUndefined();
	});

	it('a flag card carries no left member, on a single run or a row set', () => {
		// A flag's `1 - filled` is already spelled `!value`, so it does not
		// opt in either. Both shapes checked directly, the same way.
		const singleFlag = track.scopeValues?.(
			{ values: { value: 'yes' } },
			{ ...config, count: 1 },
		);
		expect(singleFlag?.self?.left).toBeUndefined();

		const rowSetFlag = track.scopeValues?.(
			{ values: { alert: 'yes', lucky: 'no' } },
			{ ...config, count: 1, rows: [{ key: 'alert' }, { key: 'lucky' }] },
		);
		expect(rowSetFlag?.named?.alert?.left).toBeUndefined();
		expect(rowSetFlag?.named?.lucky?.left).toBeUndefined();
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

describe('track.sample', () => {
	/** The marks a sample stores, by run key. `read` never produces null. */
	function marks(config: TrackConfig): Record<string, string | null> {
		const read = track.read(sampleOf(track, config), config);
		if (!read.ok || read.data === null) throw new Error('expected data');
		return read.data.values;
	}

	it('part-marks a run rather than filling or clearing it', () => {
		const value = Number(marks(config).value);
		expect(value).toBeGreaterThan(0);
		expect(value).toBeLessThan(6);
	});

	it('counts marks, not segments, where a segment holds several', () => {
		// An Ironsworn progress track: the note stores marks, so a sample that
		// stored a segment count would draw a tenth of the run it meant.
		const value = Number(marks({ ...config, count: 10, marks: 4 }).value);
		expect(value).toBeGreaterThan(4);
		expect(value % 4).toBe(0);
	});

	it('marks each run of a set against its own length', () => {
		const filled = marks(slots);
		expect(Object.keys(filled)).toEqual(['L1', 'L2', 'L3']);
		expect(Number(filled.L1)).toBeGreaterThan(Number(filled.L2));
		expect(Number(filled.L2)).toBeGreaterThan(0);
		// L3 falls back to the component's own count of 1 — one segment, still
		// spelled as a count rather than as `yes`, because the flag spelling is
		// per card and this card's first run is five segments long.
		expect(filled.L3).toBe('1');
	});

	it('shows both states of a checklist of flags, set first', () => {
		const checklist: TrackConfig = {
			...config,
			count: 1,
			rows: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
		};
		expect(marks(checklist)).toEqual({ a: 'yes', b: 'no', c: 'yes' });
	});

	it('writes a lone flag as yes, so a sample of one shows the marked state', () => {
		expect(marks({ ...config, count: 1 })).toEqual({ value: 'yes' });
	});

	it('marks one segment where the run\'s length is a formula', () => {
		// The length resolves against the whole sheet and this component never
		// sees that environment, so the smallest partial state is the honest
		// filler — a guess could fill the run to its end.
		expect(marks({ ...config, count: 'level + 1' })).toEqual({ value: '1' });
	});

	it('fills nothing for a card that cannot be drawn', () => {
		// `render` reports the configuration instead, and a body under a key
		// this card refuses would be a second fault on one card.
		expect(sampleOf(track, { ...config, count: undefined })).toBe('');
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

/**
 * Open the row set's **Add** or **Remove** picker and return its lines, one
 * per row it offers — the panel lives on `document.body` rather than inside
 * `el` (`ui/anchored-panel.ts`), which is why every consumer of this looks
 * there rather than inside the card.
 */
const openPicker = (
	el: HTMLElement,
	which: 'Add to' | 'Remove from',
): HTMLButtonElement[] => {
	const trigger = Array.from(
		el.querySelectorAll<HTMLButtonElement>('.sheetsmith-track-action-button'),
	).find((b) => b.getAttribute('aria-label')?.startsWith(which));
	if (!trigger) throw new Error(`expected a "${which}" trigger`);
	trigger.click();
	const panel = document.querySelector('.sheetsmith-panel');
	if (!panel) throw new Error('expected the picker to open');
	return Array.from(
		panel.querySelectorAll<HTMLButtonElement>('.sheetsmith-panel-line'),
	);
};

/** A picker line's own row name. */
const lineLabel = (line: HTMLElement): string | null =>
	line.querySelector('.sheetsmith-panel-said')?.textContent ?? null;

/** A row set of hit-dice-shaped rows, one of which the character owns. */
const diceRows: TrackConfig = {
	id: 'hit_dice',
	type: 'track',
	label: 'Hit dice',
	position: { col: 1, row: 1, width: 2, height: 1 },
	rows: [
		{ key: 'd10', name: 'd10', maxSource: 'character' },
		{ key: 'd6', name: 'd6', maxSource: 'character' },
	],
};

describe('a row whose length the character owns', () => {
	afterEach(() => closeAnchoredPanel());

	it('is never a flag card, whatever count or marks say', () => {
		expect(isFlagCard({ ...diceRows, marks: 1 })).toBe(false);
		expect(
			isFlagCard({
				...diceRows,
				marks: 1,
				rows: [{ key: 'd10', maxSource: 'character', count: 1 }],
			}),
		).toBe(false);
	});

	it('reads its marks from the value half and its length from the ceiling half', () => {
		const read = track.read('\n```sheet\nd10: 1 / 4\nd6: 0 / 11\n```\n', diceRows);
		expect(read).toEqual({ ok: true, data: { values: { d10: '1 / 4', d6: '0 / 11' } } });
	});

	it('reads a bare number as marks with no length', () => {
		const read = track.read('\n```sheet\nd10: 2\n```\n', diceRows);
		expect(read).toEqual({ ok: true, data: { values: { d10: '2' } } });
	});

	it('keeps a non-numeric value half a malformed section, and lets a non-numeric ceiling through', () => {
		expect(track.read('\n```sheet\nd10: frog\n```\n', diceRows).ok).toBe(false);
		const read = track.read('\n```sheet\nd10: 2 / lots\n```\n', diceRows);
		expect(read).toEqual({ ok: true, data: { values: { d10: '2 / lots' } } });
	});

	it('round-trips ten spellings of a composite entry byte for byte', () => {
		const bodies = [
			'\n```sheet\nd10: 2 / 3\n```\n',
			'\n```sheet\nd10: 2/3\n```\n',
			'\n```sheet\nd10: 2 /3\n```\n',
			'\n```sheet\nd10: 2/ 3\n```\n',
			'\n```sheet\nd10: 2\t/\t3\n```\n',
			'\n```sheet\nd10: \t/ 3\n```\n',
			'\n```sheet\nd10: 2 / \n```\n',
			'\n```sheet\nd10: 2\n```\n',
			'\n```sheet\nd10: 2 / lots\n```\n',
			'\n```sheet\nd10: 2 / 3\nd6: 1 /4\n```\n',
		];
		for (const body of bodies) {
			const read = track.read(body, diceRows);
			if (!read.ok || !read.data) throw new Error('expected data');
			expect(track.write(read.data, body, diceRows)).toBe(body);
		}
	});

	describe('publishes its remainder from its own stored length', () => {
		it('is length - filled', () => {
			const scope = scopeFor(
				{ values: { d10: '1 / 4', d6: '0 / 11' } },
				{},
				diceRows,
			);
			expect(scope('hit_dice.d10.left')).toBe(3);
			expect(scope('hit_dice.d6.left')).toBe(11);
		});

		it('publishes nothing where no length has been typed yet', () => {
			const scope = scopeFor({ values: { d10: '0' } }, {}, diceRows);
			expect(scope('hit_dice.d10.left')).toBeUndefined();
		});
	});

	describe('applyReset', () => {
		it('empty preserves the stored length', () => {
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4', d6: '0 / 11' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'empty' },
					{ resolve: () => null, explain: () => null },
				),
			).toEqual({
				ok: true,
				data: { values: { d10: '0 / 4', d6: '0 / 11' } },
			});
		});

		it('full restores each row to its own stored length', () => {
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4', d6: '3 / 11' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'full' },
					{ resolve: () => null, explain: () => null },
				),
			).toEqual({
				ok: true,
				data: { values: { d10: '4 / 4', d6: '11 / 11' } },
			});
		});

		it('full skips a row with no stored length, and still succeeds for the rest', () => {
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4', d6: '0' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'full' },
					{ resolve: () => null, explain: () => null },
				),
			).toEqual({ ok: true, data: { values: { d10: '4 / 4' } } });
		});

		it('full tells added-with-length, added-blank and never-added apart, all at once', () => {
			const threeRows: TrackConfig = {
				...diceRows,
				rows: [
					{ key: 'd10', name: 'd10', maxSource: 'character' },
					{ key: 'd6', name: 'd6', maxSource: 'character' },
					{ key: 'd8', name: 'd8', maxSource: 'character' },
				],
			};
			expect(
				track.applyReset?.(
					// d10 added with a length; d6 added, blank; d8 never
					// added at all.
					{ values: { d10: '1 / 4', d6: '' } },
					threeRows,
					{ trigger: 'Long Rest', action: 'full' },
					{ resolve: () => null, explain: () => null },
				),
			).toEqual({ ok: true, data: { values: { d10: '4 / 4' } } });
		});

		it('formula preserves the stored length', () => {
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4', d6: '0 / 11' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'formula', to: 'x' },
					{ resolve: () => 2, explain: () => null },
				),
			).toEqual({
				ok: true,
				data: { values: { d10: '2 / 4', d6: '2 / 11' } },
			});
		});

		it('empty leaves a row with no entry at all absent, rather than materialising it', () => {
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'empty' },
					{ resolve: () => null, explain: () => null },
				),
			).toEqual({ ok: true, data: { values: { d10: '0 / 4' } } });
		});

		it('formula leaves a row with no entry at all absent, rather than materialising it', () => {
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'formula', to: 'x' },
					{ resolve: () => 2, explain: () => null },
				),
			).toEqual({ ok: true, data: { values: { d10: '2 / 4' } } });
		});

		it('a row added but blank still gets zeroed by empty and resolved by formula', () => {
			// Added (an entry exists) is not the same as having a length —
			// both actions still write to a blank-but-added row, unlike a row
			// with no entry at all.
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4', d6: '' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'empty' },
					{ resolve: () => null, explain: () => null },
				),
			).toEqual({ ok: true, data: { values: { d10: '0 / 4', d6: '0' } } });
			expect(
				track.applyReset?.(
					{ values: { d10: '1 / 4', d6: '' } },
					diceRows,
					{ trigger: 'Long Rest', action: 'formula', to: 'x' },
					{ resolve: () => 2, explain: () => null },
				),
			).toEqual({ ok: true, data: { values: { d10: '2 / 4', d6: '2' } } });
		});
	});

	it('draws nothing at all for a row with no entry, only an Add trigger', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: {} }, context);
		expect(parts(el).runs).toHaveLength(0);
		expect(parts(el).unresolved).toHaveLength(0);
		expect(
			el.querySelectorAll('.sheetsmith-track-row-length-input'),
		).toHaveLength(0);
		expect(el.querySelectorAll('.sheetsmith-track-row-name')).toHaveLength(0);
		expect(openPicker(el, 'Add to').map(lineLabel)).toEqual(['d10', 'd6']);
	});

	it('draws a row in full, with an empty length field, once its entry exists at all', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '' } }, context);
		expect(parts(el).runs).toHaveLength(0);
		expect(parts(el).unresolved).toHaveLength(0);
		expect(
			el.querySelectorAll('.sheetsmith-track-row-length-input'),
		).toHaveLength(1);
		// One row left to add, so the Add trigger is still there; one row
		// already added, so the Remove trigger has joined it. Opening the
		// second picker closes the first on its own
		// (`ui/anchored-panel.ts`'s "one at a time").
		expect(openPicker(el, 'Add to').map(lineLabel)).toEqual(['d6']);
		expect(openPicker(el, 'Remove from').map(lineLabel)).toEqual(['d10']);
	});

	it('draws the run at its stored length once one is typed', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '1 / 4', d6: '0' } }, context);
		expect(parts(el).runs).toHaveLength(1);
		expect(runSegments(el, 0)).toHaveLength(4);
	});

	it('prefills the length field from the stored ceiling', () => {
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '1 / 4' } }, context);
		const field = el.querySelector<HTMLInputElement>(
			'.sheetsmith-track-row-length-input',
		);
		expect(field?.value).toBe('4');
	});

	it('committing a length writes the composite entry, blank marks to start', () => {
		// A blank value half is a blank value, the same as an ordinary blank
		// entry — Record set's own rule for the identical shape
		// (`docs/features/per-record-ceiling.md`).
		const changed = vi.fn();
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '' } }, {
			...context,
			onChange: changed,
		});
		const field = el.querySelector<HTMLInputElement>(
			'.sheetsmith-track-row-length-input',
		);
		if (!field) throw new Error('expected a length field');
		field.value = '4';
		field.dispatchEvent(new Event('blur'));
		expect(changed).toHaveBeenCalledWith({ values: { d10: ' / 4' } });
	});

	it('settles arithmetic on commit', () => {
		const changed = vi.fn();
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '2 / 4' } }, {
			...context,
			onChange: changed,
		});
		const field = el.querySelector<HTMLInputElement>(
			'.sheetsmith-track-row-length-input',
		);
		if (!field) throw new Error('expected a length field');
		field.value = '4+1';
		field.dispatchEvent(new Event('blur'));
		expect(changed).toHaveBeenCalledWith({ values: { d10: '2 / 5' } });
	});

	it('declines a note reference, leaving the draft and writing nothing', () => {
		const changed = vi.fn();
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '' } }, {
			...context,
			onChange: changed,
		});
		const field = el.querySelector<HTMLInputElement>(
			'.sheetsmith-track-row-length-input',
		);
		if (!field) throw new Error('expected a length field');
		field.value = '[[Ring]]';
		field.dispatchEvent(new Event('blur'));
		expect(changed).not.toHaveBeenCalled();
		expect(field.value).toBe('[[Ring]]');
	});

	it('settles valid arithmetic through a slash, since that never reaches storage as one', () => {
		// `4/1` is division, not a stored slash: `settleEntry` evaluates it to
		// a plain `4` before this field's own commit ever sees it, so nothing
		// here needs to refuse it.
		const changed = vi.fn();
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '' } }, {
			...context,
			onChange: changed,
		});
		const field = el.querySelector<HTMLInputElement>(
			'.sheetsmith-track-row-length-input',
		);
		if (!field) throw new Error('expected a length field');
		field.value = '4/1';
		field.dispatchEvent(new Event('blur'));
		expect(changed).toHaveBeenCalledWith({ values: { d10: ' / 4' } });
	});

	it('declines a slash that is not valid arithmetic, before it ever reaches the fence', () => {
		const changed = vi.fn();
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, diceRows, { values: { d10: '' } }, {
			...context,
			onChange: changed,
		});
		const field = el.querySelector<HTMLInputElement>(
			'.sheetsmith-track-row-length-input',
		);
		if (!field) throw new Error('expected a length field');
		field.value = '4/lots';
		field.dispatchEvent(new Event('blur'));
		expect(changed).not.toHaveBeenCalled();
	});

	it('a marks commit on a populated row carries the stored length through the join', () => {
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(
			el,
			diceRows,
			{ values: { d10: '0 / 4' } },
			{ ...context, onChange: changed },
		);
		parts(el).runs[0]?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }),
		);
		vi.advanceTimersByTime(1000);
		expect(changed).toHaveBeenCalledWith({ values: { d10: '1 / 4' } });
	});

	it('adds the third-column class only where a row actually needs it', () => {
		const withoutLengths = document.createElement('div');
		document.body.appendChild(withoutLengths);
		track.render(withoutLengths, slots, { values: {} }, context);
		expect(
			withoutLengths.querySelector('.sheetsmith-track-lengths'),
		).toBeNull();

		const withLengths = document.createElement('div');
		document.body.appendChild(withLengths);
		track.render(withLengths, diceRows, { values: {} }, context);
		expect(
			withLengths.querySelector('.sheetsmith-track-lengths'),
		).not.toBeNull();
	});

	it('reserves the length column on a mixed row rather than sliding its run into it', () => {
		const mixed: TrackConfig = {
			...diceRows,
			rows: [
				{ key: 'd10', name: 'd10', maxSource: 'character' },
				{ key: 'd6', name: 'd6', count: 4 },
			],
		};
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, mixed, { values: { d10: '0 / 1', d6: '0' } }, {
			...context,
			resolveField: (field) => (field === 'rows.1.count' ? 4 : null),
		});
		const lines = Array.from(
			el.querySelectorAll<HTMLElement>('.sheetsmith-track-row'),
		);
		expect(lines).toHaveLength(2);
		// Both rows reserve the column: one field inside it, one empty.
		expect(
			lines[0]?.querySelector('.sheetsmith-track-row-length'),
		).not.toBeNull();
		const emptySlot = lines[1]?.querySelector('.sheetsmith-track-row-length');
		expect(emptySlot).not.toBeNull();
		expect(
			emptySlot?.querySelector('.sheetsmith-track-row-length-input'),
		).toBeNull();
		// And d6's run still draws at its own declared length.
		expect(runSegments(el, 1)).toHaveLength(4);
		// d10 (character-owned) offers itself to the Remove picker; d6
		// (calculated) never does, whatever column it reserves.
		expect(openPicker(el, 'Remove from').map(lineLabel)).toEqual(['d10']);
	});

	describe('adding and removing a row', () => {
		it('draws no Add or Remove trigger for a row set with no character-owned row', () => {
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, slots, { values: {} }, context);
			expect(el.querySelector('.sheetsmith-track-actions')).toBeNull();
		});

		it('offers a row with no entry to the Add picker, in declared order', () => {
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, diceRows, { values: {} }, context);
			expect(openPicker(el, 'Add to').map(lineLabel)).toEqual(['d10', 'd6']);
		});

		it('picking a row from Add writes a blank entry and nothing else', () => {
			const changed = vi.fn();
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, diceRows, { values: { d6: '2 / 4' } }, {
				...context,
				onChange: changed,
			});
			const add = openPicker(el, 'Add to').find(
				(line) => lineLabel(line) === 'd10',
			);
			if (!add) throw new Error('expected a d10 line');
			add.click();
			expect(changed).toHaveBeenCalledWith({ values: { d10: '' } });
		});

		it('draws an added row above one added later, matching declared order', () => {
			// d10 is declared before d6 in `diceRows`; adding d6 first must
			// not make it draw above d10 once both exist.
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, diceRows, { values: { d10: '', d6: '' } }, context);
			const names = Array.from(
				el.querySelectorAll<HTMLElement>('.sheetsmith-track-row-name'),
			).map((n) => n.textContent);
			expect(names).toEqual(['d10', 'd6']);
		});

		it('focuses the new row\'s length field on the render after Add is pressed', () => {
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, diceRows, { values: {} }, context);
			const add = openPicker(el, 'Add to').find(
				(line) => lineLabel(line) === 'd10',
			);
			if (!add) throw new Error('expected a d10 line');
			add.click();
			// The press writes the entry (asserted above); the next render —
			// the one the write would cause on a real sheet — is simulated
			// here by rendering again over the same element with the note
			// now holding it, on the same `config.id` the press recorded.
			track.render(el, diceRows, { values: { d10: '' } }, context);
			const field = el.querySelector<HTMLInputElement>(
				'.sheetsmith-track-row-length-input',
			);
			expect(document.activeElement).toBe(field);
		});

		it('removing an added row arms, then confirms on a second press', () => {
			const changed = vi.fn();
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, diceRows, { values: { d10: '1 / 4' } }, {
				...context,
				onChange: changed,
			});
			const remove = openPicker(el, 'Remove from').find(
				(line) => lineLabel(line) === 'd10',
			);
			if (!remove) throw new Error('expected a d10 line');
			remove.click();
			expect(changed).not.toHaveBeenCalled();
			expect(
				remove.classList.contains('sheetsmith-track-remove-armed'),
			).toBe(true);
			// The line relabels to the shared wording, the same sentence
			// Table's and Record set's own armed rows already say.
			expect(lineLabel(remove)).toBe(armedName('d10'));
			// The row itself tints too, not only the line in the panel.
			expect(
				el
					.querySelector('.sheetsmith-track-row')
					?.classList.contains('sheetsmith-track-row-arming'),
			).toBe(true);
			remove.click();
			expect(changed).toHaveBeenCalledWith({ values: { d10: null } });
		});

		it('arming one row in the Remove picker stands a sibling\'s down', () => {
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(
				el,
				diceRows,
				{ values: { d10: '1 / 4', d6: '2 / 11' } },
				context,
			);
			const lines = openPicker(el, 'Remove from');
			const first = lines.find((line) => lineLabel(line) === 'd10');
			const second = lines.find((line) => lineLabel(line) === 'd6');
			if (!first || !second) throw new Error('expected two lines');
			first.click();
			expect(first.classList.contains('sheetsmith-track-remove-armed')).toBe(
				true,
			);
			second.click();
			expect(first.classList.contains('sheetsmith-track-remove-armed')).toBe(
				false,
			);
			expect(second.classList.contains('sheetsmith-track-remove-armed')).toBe(
				true,
			);
		});

		it('dismissing the Remove picker while armed stands the row down silently', () => {
			const changed = vi.fn();
			const el = document.createElement('div');
			document.body.appendChild(el);
			track.render(el, diceRows, { values: { d10: '1 / 4' } }, {
				...context,
				onChange: changed,
			});
			const remove = openPicker(el, 'Remove from').find(
				(line) => lineLabel(line) === 'd10',
			);
			if (!remove) throw new Error('expected a d10 line');
			remove.click();
			closeAnchoredPanel();
			expect(changed).not.toHaveBeenCalled();
			expect(
				el
					.querySelector('.sheetsmith-track-row')
					?.classList.contains('sheetsmith-track-row-arming'),
			).toBe(false);
		});
	});

	it('samples a composite for every row but the last, which it leaves un-added', () => {
		const body = track.sample?.(diceRows) ?? '';
		const read = track.read(body, diceRows);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(track.write(read.data, body, diceRows)).toBe(body);
		expect(read.data.values.d10).toMatch(/\d+ \/ \d+/);
		expect(read.data.values.d6).toBeUndefined();
	});

	it('gives two added rows different sampled lengths, not the same number twice', () => {
		const threeRows: TrackConfig = {
			...diceRows,
			rows: [
				{ key: 'd10', name: 'd10', maxSource: 'character' },
				{ key: 'd6', name: 'd6', maxSource: 'character' },
				{ key: 'd8', name: 'd8', maxSource: 'character' },
			],
		};
		const body = track.sample?.(threeRows) ?? '';
		const read = track.read(body, threeRows);
		if (!read.ok || !read.data) throw new Error('expected data');
		expect(track.write(read.data, body, threeRows)).toBe(body);
		// d10 and d6 are added (d8, the last, is left un-added); their
		// sampled lengths differ, seeded off each row's own key.
		const d10Length = read.data.values.d10?.split('/')[1]?.trim();
		const d6Length = read.data.values.d6?.split('/')[1]?.trim();
		expect(d10Length).toBeDefined();
		expect(d6Length).toBeDefined();
		expect(d10Length).not.toBe(d6Length);
		expect(read.data.values.d8).toBeUndefined();
	});
});

/*
 * Rows a character adds to a Track
 * (`docs/features/character-added-track-rows.md`).
 *
 * The identity is the character's typed name and it *is* the fence key, so
 * most of what is asserted below is about bytes: which line an entry maps to,
 * which line a rename rewrites, and that a note nobody touched comes back the
 * way it went in. Every delta is carried through this component's own `write`
 * and the resulting section text asserted, rather than the delta itself —
 * `docs/BACKLOG.md`'s own row, since a delta says what was sent and only the
 * write says what the note now holds.
 */

/** A card the character may add rows to, declaring none of its own. */
const kills: TrackConfig = {
	id: 'kills',
	type: 'track',
	label: 'Kills',
	position: { col: 1, row: 1, width: 2, height: 1 },
	openRows: true,
};

/** The same with a segment count, which is what seeds the **Length** field. */
const clocks: TrackConfig = {
	...kills,
	id: 'clocks',
	label: 'Clocks',
	count: 6,
};

/** The hit-dice set, opened to rows of the character's own beside its four. */
const openDice: TrackConfig = { ...diceRows, openRows: true };

const KILLS_BODY = '\n```sheet\nGoblins: 6 / 10\nDragons: 3 / 5\n```\n';

/** What this component reads out of a body, or a failure the case can see. */
const dataFrom = (body: string, cfg: TrackConfig): TrackData => {
	const read = track.read(body, cfg);
	if (!read.ok) throw new Error(`expected a read: ${read.error}`);
	if (read.data === null) throw new Error('expected data');
	return read.data;
};

/** Render a card from the body a note would hold, as the view does. */
const renderBody = (
	cfg: TrackConfig,
	body: string,
	ctx: Partial<RenderContext> = {},
) => {
	const el = document.createElement('div');
	document.body.appendChild(el);
	track.render(el, cfg, dataFrom(body, cfg), { ...context, ...ctx });
	return el;
};

/** Render a card with no fence at all: the state a new character is in. */
const renderEmpty = (cfg: TrackConfig, ctx: Partial<RenderContext> = {}) => {
	const el = document.createElement('div');
	document.body.appendChild(el);
	track.render(el, cfg, null, { ...context, ...ctx });
	return el;
};

/** Every name drawn on the card, declared or typed, in draw order. */
const drawnNames = (el: HTMLElement): string[] =>
	Array.from(
		el.querySelectorAll<HTMLElement>('.sheetsmith-track-row-name'),
	).map((name) =>
		name instanceof HTMLInputElement ? name.value : (name.textContent ?? ''),
	);

/** The name fields, which only a row the character named draws. */
const nameFields = (el: HTMLElement): HTMLInputElement[] =>
	Array.from(
		el.querySelectorAll<HTMLInputElement>('.sheetsmith-track-row-name-input'),
	);

/** Open the **Add** picker and hand back its lines and the form below them. */
const openAddForm = (el: HTMLElement) => {
	const lines = openPicker(el, 'Add to');
	const form = document.querySelector<HTMLElement>('.sheetsmith-track-add-form');
	if (!form) throw new Error('expected the add form');
	const inputs = Array.from(
		form.querySelectorAll<HTMLInputElement>('.sheetsmith-panel-input'),
	);
	const problems = Array.from(
		form.querySelectorAll<HTMLElement>('.sheetsmith-panel-problem'),
	);
	const submit = form.querySelector<HTMLButtonElement>('.sheetsmith-panel-save');
	if (!submit) throw new Error('expected an Add button');
	return {
		form,
		lines,
		name: inputs[0] as HTMLInputElement,
		length: inputs[1] as HTMLInputElement,
		nameProblem: problems[0] as HTMLElement,
		lengthProblem: problems[1] as HTMLElement,
		submit,
	};
};

/** Type a name and a length into the **Add** form and press it. */
const addRow = (el: HTMLElement, name: string, length = '') => {
	const form = openAddForm(el);
	form.name.value = name;
	form.length.value = length;
	form.submit.click();
	return form;
};

/** Commit a field the way a reader leaving it does. */
const commitField = (field: HTMLInputElement, next: string): void => {
	field.value = next;
	field.dispatchEvent(new Event('blur'));
};

describe('a Track the character may add rows to', () => {
	afterEach(() => closeAnchoredPanel());

	describe('with the toggle off, nothing about this component changes', () => {
		const shut: TrackConfig = { ...slots, openRows: false };
		const body = '\n```sheet\nL1: 2\nL2: 1\nL3: 0\nInvented: 4\n```\n';

		it('drops an entry no declared row maps to, and never draws it', () => {
			const data = dataFrom(body, shut);
			expect(data.values).toEqual({ L1: '2', L2: '1', L3: '0' });
			expect(data.own).toBeUndefined();
			expect(drawnNames(renderBody(shut, body))).toEqual(['1st', '2nd', '3rd']);
		});

		it('leaves the dropped entry in the note, byte for byte', () => {
			// The re-cut guarantee: `write` touches only the entries it was
			// given, so the line stays exactly where the hand that wrote it
			// put it.
			expect(track.write(dataFrom(body, shut), body, shut)).toBe(body);
		});

		it('publishes and resets exactly what it did', () => {
			const data = dataFrom(body, shut);
			const published = track.scopeValues?.(data, shut);
			expect(Object.keys(published?.named ?? {})).toEqual(['L1', 'L2', 'L3']);
			const reset = track.applyReset?.(
				data,
				shut,
				{ trigger: 'Long rest', action: 'empty' },
				{ resolve: () => null, explain: () => null },
			);
			expect(reset?.ok).toBe(true);
			if (reset?.ok !== true) return;
			expect(reset.data.values).toEqual({
				L1: '0',
				L2: '0',
				L3: '0',
			});
		});
	});

	describe('what the configuration refuses', () => {
		it('refuses named levels beside it, naming the control the author set', () => {
			// The toggle alone makes a card a row set, so the refusal reached
			// by turning it on has to name *it* and not `rows` — an author who
			// declared no rows cannot act on a sentence about rows.
			const said = configError({ ...kills, levels: ['Clear', 'One', 'Two'] });
			expect(said).toContain('Characters may add rows');
			expect(said).toContain('Clear the level names');
			expect(said).not.toContain('either named levels or rows');
		});

		it('keeps the rows-and-levels sentence where rows really are declared', () => {
			const said = configError({
				...kills,
				rows: [{ key: 'a' }, { key: 'b' }],
				levels: ['Clear', 'One', 'Two'],
			});
			expect(said).toContain('either named levels or rows');
			// And with the toggle off entirely, which is the sentence that was
			// there before this feature and must not have moved.
			expect(
				configError({ ...slots, levels: ['Clear', 'One', 'Two'] }),
			).toContain('either named levels or rows');
		});

		it('refuses a card every one of whose declared runs is one segment', () => {
			const flags: TrackConfig = {
				...config,
				count: 1,
				rows: [{ key: 'blessed' }, { key: 'cursed' }],
			};
			expect(configError(flags)).toBeNull();
			const problem = configError({ ...flags, openRows: true });
			expect(problem).toContain('Raise the segment count');
			expect(problem).toContain('Characters may add rows');
		});

		it('leaves a plain count beside named levels exactly as it was', () => {
			expect(
				configError({ ...config, count: 1, levels: ['Fine', 'Hurt'] }),
			).toBeNull();
		});

		it('needs no count, levels or rows of its own', () => {
			// A card with the toggle on and nothing declared is an empty list a
			// reader can fill, which is the ordinary state of a new character.
			expect(configError(kills)).toBeNull();
			expect(configError({ ...config, count: undefined })).not.toBeNull();
		});
	});

	describe('it makes the card a row set, always', () => {
		it('is a row set with no declared rows, so no value run is synthesised', () => {
			expect(isRowSet(kills)).toBe(true);
			expect(runsOf(kills)).toEqual([]);
			expect(runsOf({ ...kills, openRows: false })).toEqual([{ key: 'value' }]);
		});

		it('publishes no bare id and no count', () => {
			const published = track.scopeValues?.({ values: {} }, kills);
			expect(published?.self).toBeUndefined();
			expect(published?.named).toEqual({});
		});

		it('is not a flag card on an empty run list', () => {
			// `every` over `[]` is vacuously true, and `runsOf` can return one
			// for the first time.
			expect(isFlagCard({ ...kills, count: 1 })).toBe(false);
			expect(isFlagCard({ ...kills, count: 1, openRows: false })).toBe(true);
		});

		it('draws a label and one Add trigger with nothing in it', () => {
			const el = renderEmpty(kills);
			expect(el.querySelector('.sheetsmith-track-label')?.textContent).toBe(
				'Kills',
			);
			expect(el.querySelector('.sheetsmith-error')).toBeNull();
			expect(el.querySelectorAll('.sheetsmith-track-row')).toHaveLength(0);
			const triggers = Array.from(
				el.querySelectorAll<HTMLButtonElement>('.sheetsmith-track-action-button'),
			).map((b) => b.getAttribute('aria-label'));
			expect(triggers).toEqual(['Add to Kills']);
		});
	});

	describe('identity is the typed name, and the fence is exact', () => {
		it('reads an entry no declared row spells as the character\'s', () => {
			expect(track.read(KILLS_BODY, kills)).toEqual({
				ok: true,
				data: {
					values: { Goblins: '6 / 10', Dragons: '3 / 5' },
					own: ['Goblins', 'Dragons'],
				},
			});
		});

		it('draws it filled 6 of 10, and round-trips the note untouched', () => {
			const el = renderBody(kills, KILLS_BODY);
			expect(drawnNames(el)).toEqual(['Goblins', 'Dragons']);
			expect(runSegments(el, 0)).toHaveLength(10);
			expect(parts(el).runs[0]?.getAttribute('aria-valuenow')).toBe('6');
			expect(track.write(dataFrom(KILLS_BODY, kills), KILLS_BODY, kills)).toBe(
				KILLS_BODY,
			);
		});

		it('round-trips every spelling of a composite under a typed key', () => {
			for (const body of [
				'\n```sheet\nGoblins: 6/10\n```\n',
				'\n```sheet\nGoblins: 6 /10\n```\n',
				'\n```sheet\nGoblins:\t6\t/\t10\n```\n',
				'\n```sheet\nGoblins: 6\n```\n',
				'\n```sheet\nGoblins:\n```\n',
				'\n```sheet\nGoblins: 6 / lots\n```\n',
			]) {
				expect(track.write(dataFrom(body, kills), body, kills)).toBe(body);
			}
		});

		it('keeps two names differing only in case as two rows', () => {
			// Neither is folded into the other, neither is lost, and neither
			// spelling is rewritten: the fence is exact and only the input's
			// guard is lenient.
			const body = '\n```sheet\nPriority: 1 / 3\npriority: 2 / 4\n```\n';
			const data = dataFrom(body, kills);
			expect(data.own).toEqual(['Priority', 'priority']);
			expect(drawnNames(renderBody(kills, body))).toEqual([
				'Priority',
				'priority',
			]);
			expect(track.write(data, body, kills)).toBe(body);
		});

		it('draws an empty declared d6 beside a character-added D6', () => {
			const body = '\n```sheet\nD6: 2 / 3\n```\n';
			const data = dataFrom(body, openDice);
			// The declared row claims nothing — a map lookup, case-sensitive —
			// so what the note holds is the character's, and it is visible
			// rather than silently folded.
			expect(data.values.d6).toBeUndefined();
			expect(data.own).toEqual(['D6']);
			expect(drawnNames(renderBody(openDice, body))).toEqual(['D6']);
		});

		it('holds a key that must not inherit from Object.prototype', () => {
			// A hand-edited note is text, so these are keys like any other. On
			// a plain object literal the first sets a prototype instead of an
			// entry and the second reads back as a function, and the card
			// would draw a row it could neither fill nor write.
			const body = '\n```sheet\n__proto__: 1 / 2\ntoString: 3 / 4\n```\n';
			const data = dataFrom(body, kills);
			expect(data.own).toEqual(['__proto__', 'toString']);
			expect(Object.keys(data.values)).toEqual(['__proto__', 'toString']);
			const el = renderBody(kills, body);
			expect(drawnNames(el)).toEqual(['__proto__', 'toString']);
			expect(runSegments(el, 0)).toHaveLength(2);
			expect(track.write(data, body, kills)).toBe(body);
		});

		it('reports a duplicate key on this card alone and touches nothing', () => {
			const body = '\n```sheet\nGoblins: 1\nGoblins: 2\n```\n';
			const read = track.read(body, kills);
			expect(read).toEqual({
				ok: false,
				error: 'Duplicate key "Goblins" in sheet block.',
			});
		});

		it('is a malformed section where a value half is not marks', () => {
			expect(track.read('\n```sheet\nGoblins: frog\n```\n', kills)).toEqual({
				ok: false,
				error: '"frog" is not a number of marks.',
			});
		});

		it('draws no run and no "?" where the length half is not a number', () => {
			const el = renderBody(kills, '\n```sheet\nGoblins: 2 / lots\n```\n');
			expect(parts(el).runs).toHaveLength(0);
			expect(parts(el).unresolved).toHaveLength(0);
			expect(
				el.querySelector<HTMLInputElement>('.sheetsmith-track-row-length-input')
					?.placeholder,
			).toBe('—');
		});
	});

	describe('the order is the note\'s own', () => {
		it('draws and writes a numeric-looking name in the order the file states', () => {
			// A plain object puts `10` before `Goblins` however the note spells
			// them, which is why nothing reads an order off `values`.
			const body = '\n```sheet\n10: 1 / 2\nGoblins: 3 / 4\n```\n';
			const data = dataFrom(body, kills);
			expect(data.own).toEqual(['10', 'Goblins']);
			expect(Object.keys(data.values)[0]).toBe('10');
			expect(drawnNames(renderBody(kills, body))).toEqual(['10', 'Goblins']);
			expect(track.write(data, body, kills)).toBe(body);
		});

		it('draws the declared rows first and the character\'s after', () => {
			const body = '\n```sheet\nBloodied: 1 / 2\nd6: 0 / 4\n```\n';
			expect(drawnNames(renderBody(openDice, body))).toEqual([
				'd6',
				'Bloodied',
			]);
		});
	});

	describe('the Add form', () => {
		it('is the whole panel where no declared row is left to offer', () => {
			const form = openAddForm(renderEmpty(kills));
			expect(form.lines).toHaveLength(0);
			expect(form.name).toBeDefined();
			expect(form.submit.textContent).toBe('Add');
		});

		it('sits under the declared rows a card still has to offer', () => {
			const form = openAddForm(renderEmpty(openDice));
			expect(form.lines.map(lineLabel)).toEqual(['d10', 'd6']);
			expect(form.form.previousElementSibling).toBe(form.lines[1]);
		});

		it('names each field with the word that is on screen', () => {
			// WCAG 2.5.3: a control's visible label has to *be* its accessible
			// name or be contained in it, or voice control has nothing to match
			// when the reader says "Length". The label wraps the control, so
			// the word on screen is the name outright and no `aria-label`
			// competes with it (`docs/UI.md` §6).
			closeAnchoredPanel();
			const form = openAddForm(renderEmpty(kills));
			for (const [input, word] of [
				[form.name, 'Name'],
				[form.length, 'Length'],
			] as const) {
				expect(input.hasAttribute('aria-label')).toBe(false);
				const label = input.closest('label');
				expect(
					label?.querySelector('.sheetsmith-panel-field-label')?.textContent,
					word,
				).toBe(word);
			}
		});

		it('writes one entry and touches no other line', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			addRow(el, 'Wolves', '4');
			expect(changed).toHaveBeenCalledWith({ values: { Wolves: ' / 4' } });
			// And what the note then holds, which is the half a delta cannot say.
			expect(track.write({ values: { Wolves: ' / 4' } }, KILLS_BODY, kills)).toBe(
				'\n```sheet\nGoblins: 6 / 10\nDragons: 3 / 5\nWolves:  / 4\n```\n',
			);
		});

		it('writes a bare entry where the length is cleared', () => {
			const changed = vi.fn();
			const el = renderEmpty(kills, { onChange: changed });
			addRow(el, 'Wolves', '');
			expect(changed).toHaveBeenCalledWith({ values: { Wolves: '' } });
			expect(track.write({ values: { Wolves: '' } }, null, kills)).toBe(
				'\n```sheet\nWolves: \n```\n',
			);
		});

		it('keeps the canonical separator once the first marks arrive', () => {
			/*
			 * The form composes ` / 4`, a fence writes `Wolves:  / 4`, and
			 * `ENTRY` reads that back as `/ 4` — its leading space having gone
			 * into the colon's own separator. Joined verbatim the first press
			 * wrote `3/ 4`, so the canonical form was reached exactly once, at
			 * creation, and lost on the very next write.
			 */
			const body = '\n```sheet\nWolves:  / 4\n```\n';
			const changed = vi.fn();
			const el = renderBody(kills, body, { onChange: changed });
			const run = parts(el).runs[0];
			run?.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }),
			);
			run?.dispatchEvent(new Event('blur'));
			expect(changed).toHaveBeenCalledWith({ values: { Wolves: '1 / 4' } });
			// And what the note then holds, which is the half a delta cannot say.
			expect(track.write({ values: { Wolves: '1 / 4' } }, body, kills)).toBe(
				'\n```sheet\nWolves:  1 / 4\n```\n',
			);
		});

		it('draws a row added with no length as "—" and no run', () => {
			const el = renderBody(kills, '\n```sheet\nWolves:\n```\n');
			expect(drawnNames(el)).toEqual(['Wolves']);
			expect(parts(el).runs).toHaveLength(0);
		});

		it('lands focus in the new row\'s length field on the next render', () => {
			const el = renderEmpty(kills);
			addRow(el, 'Wolves', '4');
			// The render the write would cause on a real sheet.
			track.render(el, kills, dataFrom('\n```sheet\nWolves:  / 4\n```\n', kills), context);
			expect(document.activeElement).toBe(
				el.querySelector('.sheetsmith-track-row-length-input'),
			);
		});

		it('seeds the length from the card\'s own count, and only at the add', () => {
			const seeded = openAddForm(renderEmpty(clocks));
			expect(seeded.length.value).toBe('6');
			closeAnchoredPanel();
			// What is stored is whatever the field held when it was pressed,
			// and the count is never consulted for that row again.
			const changed = vi.fn();
			const el = renderEmpty(clocks, { onChange: changed });
			addRow(el, 'Escape', '8');
			expect(changed).toHaveBeenCalledWith({ values: { Escape: ' / 8' } });
			const drawn = renderBody(clocks, '\n```sheet\nEscape:  / 8\n```\n');
			expect(runSegments(drawn, 0)).toHaveLength(8);
		});

		it('seeds nothing where the card sets no count, or where it will not resolve', () => {
			const bare = openAddForm(renderEmpty(kills));
			expect(bare.length.value).toBe('');
			// And no placeholder standing in for the value. On a card the `—`
			// is a *reading* — this row has no ceiling — while in an empty form
			// field it reads as something already there to be cleared, and the
			// field is optional.
			expect(bare.length.hasAttribute('placeholder')).toBe(false);
			closeAnchoredPanel();
			expect(
				openAddForm(renderEmpty(clocks, { resolved: {} })).length.value,
			).toBe('');
		});

		it('submits on Enter in either field', () => {
			for (const which of ['name', 'length'] as const) {
				const changed = vi.fn();
				const el = renderEmpty(kills, { onChange: changed });
				const form = openAddForm(el);
				form.name.value = 'Wolves';
				form.length.value = '4';
				form[which].dispatchEvent(
					new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
				);
				expect(changed).toHaveBeenCalledWith({ values: { Wolves: ' / 4' } });
				closeAnchoredPanel();
			}
		});
	});

	describe('what the name field refuses, in the Add form', () => {
		const refusal = (name: string, cfg: TrackConfig = kills, body = KILLS_BODY) => {
			// One refusal per opening: a second press on the same trigger is
			// the close half of aria-expanded, not a second panel.
			closeAnchoredPanel();
			const changed = vi.fn();
			const el = renderBody(cfg, body, { onChange: changed });
			const form = addRow(el, name, '4');
			expect(changed, `"${name}" was written`).not.toHaveBeenCalled();
			// The draft is kept, so the reader can see what they typed.
			expect(form.name.value).toBe(name);
			expect(form.nameProblem.hidden).toBe(false);
			return form.nameProblem.textContent ?? '';
		};

		it('refuses a blank name', () => {
			expect(refusal('   ')).toBe('A row needs a name.');
		});

		it('refuses a colon, in the clause the shared rule states', () => {
			// The colon is the half of that clause a reader can reach from
			// here: an `input` sanitises a line break out of its own value,
			// pasted or typed, so the other half is unreachable from a
			// single-line field and is refused for the hand-edited layout the
			// shared clause is also read at.
			expect(refusal('Armor: class')).toContain(
				'cannot contain a colon or a line break',
			);
		});

		it('refuses a note reference, naming where a link belongs instead', () => {
			const said = refusal('[[Goblin]]');
			expect(said).toContain('Obsidian indexes no link inside one');
			expect(said).toContain('Rich text block');
		});

		it('refuses "value", which a single run stores under', () => {
			expect(refusal('value')).toContain('a row cannot be called that');
			// Lenient in the refusing direction, as every comparison here is.
			expect(refusal('Value')).toContain('a row cannot be called that');
		});

		it('refuses a name a declared row already spells', () => {
			expect(refusal('d6', openDice, '\n```sheet\nd6: 1 / 4\n```\n')).toContain(
				'"d6" is already a row here',
			);
		});

		it('refuses a name this character\'s fence already holds', () => {
			expect(refusal('Goblins')).toContain('"Goblins" is already a row here');
		});

		it('refuses one differing only in case, naming the spelling already there', () => {
			const said = refusal('goblins');
			expect(said).toContain('"Goblins"');
			expect(said).not.toContain('"goblins"');
		});

		it('announces a refusal and ties it to the field it is about', () => {
			// Drawn is not enough: the press leaves focus on the **Add**
			// button, so a message tied only to the field says nothing until
			// the reader goes back there — and the rename field's identical
			// refusal already routes to the card's live region, so one feature
			// would otherwise answer one refusal two ways.
			closeAnchoredPanel();
			const el = renderBody(kills, KILLS_BODY);
			const form = addRow(el, 'Goblins', '4');
			expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toContain(
				'"Goblins" is already a row here',
			);
			expect(form.name.getAttribute('aria-invalid')).toBe('true');
			expect(form.name.getAttribute('aria-describedby')).toBe(
				form.nameProblem.id,
			);
			// A description on a hidden element is not exposed, so the wiring
			// has to come off with the message when the refusal is corrected.
			expect(form.lengthProblem.hidden).toBe(true);
			expect(form.length.hasAttribute('aria-describedby')).toBe(false);
			form.name.value = 'Wolves';
			form.submit.click();
			expect(form.name.hasAttribute('aria-describedby')).toBe(false);
			expect(form.name.hasAttribute('aria-invalid')).toBe(false);
		});

		it('refuses a length that would be read back as two numbers', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const form = addRow(el, 'Wolves', '4/2');
			expect(changed).not.toHaveBeenCalled();
			expect(form.lengthProblem.hidden).toBe(false);
			expect(form.lengthProblem.textContent).toContain('A slash separates');
		});

		it('lets a refused form be corrected and submitted', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const form = addRow(el, 'Goblins', '4');
			expect(changed).not.toHaveBeenCalled();
			form.name.value = 'Wolves';
			form.submit.click();
			expect(changed).toHaveBeenCalledWith({ values: { Wolves: ' / 4' } });
		});
	});

	describe('renaming a row the character named', () => {
		it('draws a declared row\'s name as static text and only its own as a field', () => {
			const el = renderBody(openDice, '\n```sheet\nd6: 1 / 4\nBloodied: 2 / 3\n```\n');
			expect(drawnNames(el)).toEqual(['d6', 'Bloodied']);
			expect(nameFields(el).map((f) => f.value)).toEqual(['Bloodied']);
		});

		it('commits on blur, and rewrites only that line\'s key token', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			commitField(nameFields(el)[0] as HTMLInputElement, 'Goblinoids');
			expect(changed).toHaveBeenCalledWith({
				values: {},
				rename: { from: 'Goblins', to: 'Goblinoids' },
			});
			// The marks, the length, the separator spelling, the surrounding
			// whitespace and the line's position in the fence, all unchanged.
			expect(
				track.write(
					{ values: {}, rename: { from: 'Goblins', to: 'Goblinoids' } },
					'\n```sheet\nGoblins:\t6 /10\nDragons: 3 / 5\n```\n',
					kills,
				),
			).toBe('\n```sheet\nGoblinoids:\t6 /10\nDragons: 3 / 5\n```\n');
		});

		it('commits on Enter', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const field = nameFields(el)[0] as HTMLInputElement;
			field.value = 'Goblinoids';
			field.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }),
			);
			expect(changed).toHaveBeenCalledWith({
				values: {},
				rename: { from: 'Goblins', to: 'Goblinoids' },
			});
		});

		it('restores on Escape and writes nothing', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const field = nameFields(el)[0] as HTMLInputElement;
			field.value = 'Goblinoids';
			field.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }),
			);
			expect(field.value).toBe('Goblins');
			expect(changed).not.toHaveBeenCalled();
		});

		it('keeps the draft, writes nothing, and both says and shows why', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const field = nameFields(el)[0] as HTMLInputElement;
			commitField(field, 'Dragons');
			expect(changed).not.toHaveBeenCalled();
			expect(field.value).toBe('Dragons');
			// Announced, for a reader who cannot see the card…
			expect(
				el.querySelector('.sheetsmith-sr-only')?.textContent,
			).toContain('"Dragons" is already a row here');
			// …and drawn, for one who can. Without this the card showed two
			// rows both reading `Dragons` and nothing saying why the second
			// had not been taken, while the Add panel drew that very sentence.
			const shown = el.querySelector('.sheetsmith-track-row-problem');
			expect(shown?.textContent).toContain('"Dragons" is already a row here');
			// One message, two channels: they cannot say different things.
			expect(shown?.textContent).toBe(
				el.querySelector('.sheetsmith-sr-only')?.textContent,
			);
			// And it goes when the draft is corrected.
			commitField(field, 'Wolves');
			expect(el.querySelector('.sheetsmith-track-row-problem')).toBeNull();
			expect(changed).toHaveBeenCalledWith({
				values: {},
				rename: { from: 'Goblins', to: 'Wolves' },
			});
		});

		it('lets a row keep its own spelling', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			commitField(nameFields(el)[0] as HTMLInputElement, 'Goblins');
			expect(changed).not.toHaveBeenCalled();
		});

		it('puts the stored name back on a blank, and says so', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const field = nameFields(el)[0] as HTMLInputElement;
			commitField(field, '');
			expect(changed).not.toHaveBeenCalled();
			expect(field.value).toBe('Goblins');
			expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
				'A row needs a name, so "Goblins" was kept.',
			);
		});

		it('leaves the note alone where a collision reaches the write', () => {
			// The guard already excluded it; this is the defensive half, which
			// declines rather than half-applying.
			expect(
				track.write(
					{ values: {}, rename: { from: 'Goblins', to: 'Dragons' } },
					KILLS_BODY,
					kills,
				),
			).toBe(KILLS_BODY);
		});
	});

	describe('removing a row the character named', () => {
		const mixed = '\n```sheet\nd6: 1 / 4\nWolves: 2 / 3\nGoblins: 6 / 10\n```\n';

		it('lists the character\'s rows after the declared ones, in note order', () => {
			const el = renderBody(openDice, mixed);
			expect(openPicker(el, 'Remove from').map(lineLabel)).toEqual([
				'd6',
				'Wolves',
				'Goblins',
			]);
		});

		it('arms on the first press and deletes the whole entry on the second', () => {
			const changed = vi.fn();
			const el = renderBody(kills, KILLS_BODY, { onChange: changed });
			const lines = openPicker(el, 'Remove from');
			const goblins = lines.find((line) => lineLabel(line) === 'Goblins');
			if (!goblins) throw new Error('expected a Goblins line');
			goblins.click();
			expect(lineLabel(goblins)).toBe(armedName('Goblins'));
			expect(changed).not.toHaveBeenCalled();
			goblins.click();
			expect(changed).toHaveBeenCalledWith({ values: { Goblins: null } });
			// Marks and length together, and every other line untouched.
			expect(track.write({ values: { Goblins: null } }, KILLS_BODY, kills)).toBe(
				'\n```sheet\nDragons: 3 / 5\n```\n',
			);
		});

		it('disarms the first where a different line is picked', () => {
			const el = renderBody(kills, KILLS_BODY);
			const lines = openPicker(el, 'Remove from');
			lines[0]?.click();
			lines[1]?.click();
			expect(lineLabel(lines[0] as HTMLElement)).toBe('Goblins');
			expect(lineLabel(lines[1] as HTMLElement)).toBe(armedName('Dragons'));
		});

		it('stands the armed row down when the panel is dismissed', () => {
			const el = renderBody(kills, KILLS_BODY);
			openPicker(el, 'Remove from')[0]?.click();
			closeAnchoredPanel();
			expect(el.querySelector('.sheetsmith-sr-only')?.textContent).toBe(
				STOOD_DOWN,
			);
		});

		it('does not offer a removed row back in the Add panel', () => {
			// Unlike a declared row, which goes back on the list it came from.
			const el = renderBody(kills, '\n```sheet\nDragons: 3 / 5\n```\n');
			expect(openPicker(el, 'Add to').map(lineLabel)).toEqual([]);
			closeAnchoredPanel();
			const dice = renderBody(openDice, '\n```sheet\nd6: 1 / 4\n```\n');
			expect(openPicker(dice, 'Add to').map(lineLabel)).toEqual([
				'd10',
			]);
		});
	});

	describe('a reset reaches a row the character named', () => {
		// `Goblins` is spelled ragged on purpose: a reset writes through the
		// join, so the note's own separator has to survive one. A delta cannot
		// show that — `values.Goblins` is `'0/10'` either way — which is why
		// the `empty` case below carries it through `write` and asserts the
		// section text (`docs/BACKLOG.md` § Patterns).
		const body = '\n```sheet\nGoblins: 6/10\nDragons: 3 / 5\nNothing:\n```\n';
		const reset = (action: 'empty' | 'full' | 'formula', to: number | null = null) =>
			track.applyReset?.(
				dataFrom(body, kills),
				kills,
				{ trigger: 'Long rest', action },
				{ resolve: () => to, explain: () => null },
			);

		it('empties through the join, keeping each length', () => {
			const result = reset('empty');
			expect(result?.ok).toBe(true);
			if (result?.ok !== true) return;
			expect(result.data.values).toEqual({
				Goblins: '0/10',
				Dragons: '0 / 5',
				Nothing: '0',
			});
			// And what the note then holds. The delta above cannot say whether
			// each row kept the spelling its own line was written in, and a
			// reset that reformatted a note nobody hand-edited is exactly what
			// Constraint 3 is about.
			expect(track.write(result.data, body, kills)).toBe(
				'\n```sheet\nGoblins: 0/10\nDragons: 0 / 5\nNothing:0\n```\n',
			);
		});

		it('fills each row to its own length, skipping the one with none', () => {
			const result = reset('full');
			expect(result?.ok).toBe(true);
			if (result?.ok !== true) return;
			const values = result.data.values;
			expect(values.Goblins).toBe('10/10');
			expect(values.Dragons).toBe('5 / 5');
			// Skipped rather than failing the rest of the reset, and nothing
			// written for it — not even a zero.
			expect(values.Nothing).toBeUndefined();
		});

		it('applies one resolved count to every row, through the join', () => {
			const result = reset('formula', 2);
			expect(result?.ok).toBe(true);
			if (result?.ok !== true) return;
			expect(result.data.values).toEqual({
				Goblins: '2/10',
				Dragons: '2 / 5',
				Nothing: '2',
			});
		});

		it('creates no row and removes none', () => {
			for (const action of ['empty', 'full', 'formula'] as const) {
				const result = reset(action, 1);
				if (result?.ok !== true) throw new Error(`${action} failed`);
				const written = Object.keys(result.data.values);
				expect(written.every((key) => body.includes(`${key}:`))).toBe(true);
			}
		});
	});

	describe('a row the character named publishes nothing', () => {
		it('answers no name, under any spelling, and no .left either', () => {
			const data = dataFrom(KILLS_BODY, kills);
			const published = track.scopeValues?.(data, kills);
			if (!published) throw new Error('expected scope values');
			const scope = buildSheetScope([{ id: kills.id, values: published }]);
			for (const name of [
				'kills',
				'kills.Goblins',
				'kills.goblins',
				'kills.Goblins.value',
				'kills.Goblins.left',
			]) {
				expect(scope(name), name).toBeUndefined();
			}
		});

		it('leaves the declared rows publishing exactly what they did', () => {
			const body = '\n```sheet\nd6: 1 / 4\nGoblins: 6 / 10\n```\n';
			const data = dataFrom(body, openDice);
			const published = track.scopeValues?.(data, openDice);
			expect(Object.keys(published?.named ?? {})).toEqual(['d10', 'd6']);
			if (!published) throw new Error('expected scope values');
			const scope = buildSheetScope([
				{
					id: openDice.id,
					values: published,
					resolver: (env) => makeFieldResolver(track, openDice, data, env),
				},
			]);
			expect(scope('hit_dice.d6')).toBe(1);
			expect(scope('hit_dice.d6.left')).toBe(3);
		});

		it('declares no scopeRows, so nothing can aggregate over it', () => {
			expect(track).not.toHaveProperty('scopeRows');
		});
	});

	describe('a layout change that arrives after the data', () => {
		const body = '\n```sheet\nGoblins: 6 / 10\n```\n';

		it('lets a newly declared row claim what is already there', () => {
			const declared: TrackConfig = {
				...kills,
				rows: [{ key: 'Goblins', name: 'Goblins', maxSource: 'character' }],
			};
			const data = dataFrom(body, declared);
			// The marks survive whole, nothing duplicates, and the row is the
			// layout's now: a static name and no place on the Remove list.
			expect(data.values).toEqual({ Goblins: '6 / 10' });
			expect(data.own).toBeUndefined();
			const el = renderBody(declared, body);
			expect(nameFields(el)).toHaveLength(0);
			expect(openPicker(el, 'Remove from').map(lineLabel)).toEqual(['Goblins']);
			expect(track.write(data, body, declared)).toBe(body);
		});

		it('reads the length from the layout where the row is calculated', () => {
			const declared: TrackConfig = {
				...kills,
				rows: [{ key: 'Goblins', name: 'Goblins', count: 4 }],
			};
			const el = renderBody(declared, body, { resolveField: () => 4 });
			// The layout's formula supplies the length; the `/ 10` sits in the
			// file, unread and untouched.
			expect(runSegments(el, 0)).toHaveLength(4);
			expect(track.write(dataFrom(body, declared), body, declared)).toBe(body);
		});

		it('draws a dropped declared row\'s leftover entry as the character\'s', () => {
			const dropped: TrackConfig = { ...kills, rows: [] };
			const el = renderBody(dropped, body);
			expect(nameFields(el).map((f) => f.value)).toEqual(['Goblins']);
			expect(track.write(dataFrom(body, dropped), body, dropped)).toBe(body);
		});

		it('hides every one of them with the toggle off, and deletes none', () => {
			const shut: TrackConfig = { ...kills, openRows: false, count: 6 };
			const el = renderBody(shut, KILLS_BODY);
			expect(drawnNames(el)).toEqual([]);
			expect(track.write(dataFrom(KILLS_BODY, shut), KILLS_BODY, shut)).toBe(
				KILLS_BODY,
			);
			// And back on, in the same order.
			expect(drawnNames(renderBody(kills, KILLS_BODY))).toEqual([
				'Goblins',
				'Dragons',
			]);
		});
	});

	describe('the sample', () => {
		it('writes one row named from the label, and reads it back', () => {
			const body = sampleOf(track, clocks);
			expect(body).toContain('Clocks 1:');
			const data = dataFrom(body, clocks);
			expect(data.own).toEqual(['Clocks 1']);
			expect(track.write(data, body, clocks)).toBe(body);
		});

		it('draws the character\'s row after the declared ones', () => {
			const body = sampleOf(track, openDice);
			// The last character-owned declared row is left un-added by the
			// sample on purpose, so an author's first preview already shows the
			// **Add** control rather than a set that looks permanently full.
			expect(drawnNames(renderBody(openDice, body))).toEqual([
				'd10',
				'Hit dice 1',
			]);
		});

		it('composes no key from a label the fence could not hold', () => {
			// The label is author free text, and composing a name from it is
			// the one place in this component where text nobody checked
			// becomes a fence key. Obsidian indexes no link inside a fence
			// (CLAUDE.md 2), so a label holding one composes no row at all.
			// `contract.test.ts`'s own wikilink sweep cannot see this: every
			// configuration it reaches is labelled in plain words, so it
			// passes over this path vacuously.
			for (const label of ['[[Goblin]] kills', 'Armor: class']) {
				const cfg = { ...openDice, label };
				const body = sampleOf(track, cfg);
				expect(body, label).not.toContain('[[');
				expect(body, label).not.toContain(label);
				const data = dataFrom(body, cfg);
				expect(data.own, label).toBeUndefined();
				expect(track.write(data, body, cfg), label).toBe(body);
			}
		});

		it('skips it where the composed name is already a declared key', () => {
			const clash: TrackConfig = {
				...kills,
				label: 'Kills',
				rows: [{ key: 'Kills 1', name: 'Kills 1', count: 3 }],
			};
			const body = sampleOf(track, clash);
			const data = dataFrom(body, clash);
			expect(data.own).toBeUndefined();
			expect(track.write(data, body, clash)).toBe(body);
		});
	});
});

describe('track keyboard', () => {
	const pressKey = (el: HTMLElement, key: string, shiftKey = false) =>
		parts(el).run?.dispatchEvent(
			new KeyboardEvent('keydown', { key, shiftKey, cancelable: true }),
		);

	it('steps a segment with left and right', () => {
		const el = render();
		pressKey(el, 'ArrowRight');
		expect(shown(el)).toBe(4);
		pressKey(el, 'ArrowLeft');
		pressKey(el, 'ArrowLeft');
		expect(shown(el)).toBe(2);
	});

	it('steps a mark with shift, the inverse of a card\'s shift-by-ten', () => {
		const el = render({ count: 10, marks: 4 }, { values: { value: '20' } }, {
			resolved: { count: 10 },
		});
		pressKey(el, 'ArrowRight', true);
		expect(shown(el)).toBe(21);
	});

	it('empties and fills the run with Home and End', () => {
		const el = render();
		pressKey(el, 'End');
		expect(shown(el)).toBe(6);
		pressKey(el, 'Home');
		expect(shown(el)).toBe(0);
	});

	it('finishes a partial segment before starting the next with Space', () => {
		const el = render({ count: 10, marks: 4 }, { values: { value: '22' } }, {
			resolved: { count: 10 },
		});
		pressKey(el, ' ');
		expect(shown(el)).toBe(24);
	});

	it('holds the value inside the run', () => {
		const el = render({}, { values: { value: '0' } });
		pressKey(el, 'ArrowLeft');
		expect(shown(el)).toBe(0);
		pressKey(el, 'End');
		pressKey(el, 'ArrowRight');
		expect(shown(el)).toBe(6);
	});

	it('writes a run of presses once, when the gesture ends', () => {
		const changed = vi.fn();
		const el = render({}, { values: { value: '3' } }, { onChange: changed });
		pressKey(el, 'ArrowRight');
		pressKey(el, 'ArrowRight');
		pressKey(el, 'ArrowLeft');
		expect(changed).not.toHaveBeenCalled();
		parts(el).run?.dispatchEvent(new Event('blur'));
		expect(changed).toHaveBeenCalledTimes(1);
		expect(changed).toHaveBeenCalledWith({ values: { value: '4' } });
	});

	it('writes nothing where the gesture landed back where it started', () => {
		const changed = vi.fn();
		const el = render({}, { values: { value: '3' } }, { onChange: changed });
		pressKey(el, 'ArrowRight');
		pressKey(el, 'ArrowLeft');
		parts(el).run?.dispatchEvent(new Event('blur'));
		expect(changed).not.toHaveBeenCalled();
	});

	it('draws a keyboard step faint until it reaches the note', () => {
		// The commit is otherwise invisible: the fill happens on the keystroke
		// and the write follows up to a gesture-window later.
		vi.useFakeTimers();
		const changed = vi.fn();
		const el = render({}, { values: { value: '3' } }, { onChange: changed });
		pressKey(el, 'ArrowRight');
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

		it('reads a spelled-out cleared flag as a flag, not as a mistake', () => {
			// `no` and `false` are the two spellings `CLEAR` holds, and this is
			// the only consumer that can tell them from a mistake: a Table's
			// toggle reads anything unrecognised as off, so `false` and `maybe`
			// are the same answer there. Here they are not — one is a flag that
			// reads clear, the other a malformed section — and that distinction
			// is the whole reason `CLEAR` is a named set rather than "not yes".
			for (const spelling of ['no', 'false']) {
				expect(
					track.read(`\n\`\`\`sheet\nvalue: ${spelling}\n\`\`\`\n`, flag).ok,
					spelling,
				).toBe(true);
				expect(
					rings(drawFlag({}, { values: { value: spelling } }))[0]?.getAttribute(
						'aria-pressed',
					),
					spelling,
				).toBe('false');
			}
			// And the two spellings that only this side of the set reaches.
			for (const spelling of ['true', '✓']) {
				expect(track.read(`\n\`\`\`sheet\nvalue: ${spelling}\n\`\`\`\n`, flag).ok).toBe(true);
				expect(
					rings(drawFlag({}, { values: { value: spelling } }))[0]?.getAttribute(
						'aria-pressed',
					),
					spelling,
				).toBe('true');
			}
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

		it('reaches a named step\'s word by touch, and opens nothing without one', () => {
			/*
			 * `docs/UI.md` §7: `title` is a pointer's route and a finger has no
			 * hover, so a held press is the only way to the word a glyph stands
			 * for. Asserted here rather than left to the module because this is
			 * the call site whose touch route **changed shape**: the binding used
			 * to be made only where the steps are named, and is now made on every
			 * ring with a provider that answers `null` where there is no tooltip.
			 * "The same behaviour with one fewer branch" is a claim about this
			 * component, so it is checked in this component.
			 */
			vi.useFakeTimers();
			try {
				const named = drawFlag(
					{ count: undefined, levels: ['Fine', 'Bloodied:!'] },
					{ values: { value: 'yes' } },
				);
				hold(rings(named)[0], LONG_PRESS + 10, { pointerType: 'touch' });
				expect(
					document.querySelector('.sheetsmith-popover')?.textContent,
				).toBe('Bloodied');
				closePopover();

				// And the branch that used to be missing rather than empty: a flag
				// with no word has no `title`, so the hold opens nothing and the
				// press that ends it still flips the card.
				// `unknown`, because `RenderContext.onChange` is untyped at this
				// boundary and `drawFlag` hands the context straight through.
				const seen: unknown[] = [];
				const plain = drawFlag({}, { values: { value: 'no' } }, {
					onChange: (delta) => seen.push(delta),
				});
				hold(rings(plain)[0], LONG_PRESS + 10, { pointerType: 'touch' });
				expect(document.querySelector('.sheetsmith-popover')).toBeNull();
				rings(plain)[0]?.click();
				expect(seen).toEqual([{ values: { value: 'yes' } }]);
			} finally {
				vi.useRealTimers();
			}
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
			 * that spelled `sent` wrong.
			 *
			 * **What this route reaches is now one step earlier**, and the case
			 * kept its assertions across the change rather than being rewritten to
			 * fit it. It used to reach `commit`, which compared the note's own
			 * spelling and declined; `ring-control.ts` reports a level only when it
			 * moved, so an arrow that asks for the level the ring is already at now
			 * writes nothing by never reaching `commit` at all. The case below
			 * drives the comparison this one no longer does.
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

		it('leaves a row nobody pressed out of the write the sweep collects', () => {
			/*
			 * `commit` sweeps *every* run on the card, so a row stored as `1`
			 * before the fold is compared against "yes" on a press somewhere else
			 * entirely. What keeps it out of the change is that `sent` is spelled
			 * through `spelledMarks` at construction rather than taken from the
			 * note's raw text — spell it wrong and pressing `lucky` rewrites
			 * `alert` as well, having changed nothing the reader asked to change.
			 *
			 * Here rather than folded into the case above, because the two now
			 * reach different code: that one stops at the ring and never calls
			 * `commit`, and this is the only route left that drives the sweep over
			 * a run the reader did not touch.
			 */
			const card = changes();
			const el = card.render(
				{ rows: [{ key: 'alert' }, { key: 'lucky' }] },
				{ values: { alert: '1', lucky: 'no' } },
			);
			rings(el)[1]?.click();
			expect(card.seen).toEqual([{ values: { lucky: 'yes' } }]);
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

/*
 * **A modifier that lengthens a run** (`docs/features/modifier-granted-track-segments.md`).
 *
 * Driven through a real sheet rather than a stubbed `resolved`, because the
 * whole defect was a number that two halves of the plugin disagreed about: a
 * fixture that states the count cannot show the run and the published name
 * arriving at the same one. Every case below asserts both sides where it can.
 */
describe('a modifier granting segments', () => {
	const run: TrackConfig = {
		id: 'exhaustion',
		type: 'track',
		label: 'Exhaustion',
		position: { col: 1, row: 1, width: 1, height: 1 },
		count: '3 + mod.self',
	};
	const gear: TableConfig = {
		id: 'worn',
		type: 'table',
		label: 'Worn items',
		position: { col: 2, row: 1, width: 4, height: 2 },
		rowHeader: 'Item',
		rows: [{ label: 'Talisman' }],
		columns: [{ key: 'Modifiers', type: 'modifier' }],
	};

	/**
	 * The whole sheet: a run whose length reads its own slot, and a push at it.
	 *
	 * `amount` of null is the talisman off the character — an empty cell rather
	 * than a second layout — which is how the removal cases are driven.
	 */
	const sheetOf = (
		amount: string | null = '+= 2',
		trackConfig: TrackConfig = run,
		body = '\n```sheet\nvalue: 1\n```\n',
	) => {
		const gearBody = [
			'| Item | Modifiers |',
			'| --- | --- |',
			amount === null
				? '| Talisman | |'
				: `| Talisman | exhaustion.count ${amount} as item |`,
		].join('\n');
		const trackRead = track.read(body, trackConfig);
		const gearRead = table.read(gearBody, gear);
		if (!trackRead.ok || !gearRead.ok) throw new Error('read failed');
		const layout: Layout = { name: 'Test', components: [trackConfig, gear] };
		const prepared: ReadComponent[] = [
			{ config: trackConfig, component: track, data: trackRead.data, error: null },
			{ config: gear, component: table, data: gearRead.data, error: null },
		];
		const { env, modifiers } = buildSheet(layout, prepared);
		const data = trackRead.data;
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, trackConfig, data, {
			resolved: resolveFormulaFields(track, trackConfig, data, env),
			resolveField: makeFieldResolver(track, trackConfig, data, env),
			explainField: makeFieldExplainer(track, trackConfig, data, env),
			onChange: () => undefined,
			modifiers,
		});
		return { el, env, data };
	};

	it('draws the run the sheet publishes, not the one the layout wrote', () => {
		const { el, env } = sheetOf();
		// Both halves in one case, deliberately: they used to be 3 and 5, and a
		// case asserting either alone would have passed throughout.
		expect(parts(el).segments).toHaveLength(5);
		expect(parts(el).run?.getAttribute('aria-valuemax')).toBe('5');
		expect(env.sheet('exhaustion.count')).toBe(5);
	});

	it('marks the granted segments and only those', () => {
		const { el } = sheetOf();
		const marked = parts(el).segments.map((s) =>
			s.classList.contains('sheetsmith-track-segment-granted'),
		);
		// The far end, because a run fills from the near one: putting the grant
		// first would refill a different pair of segments from the same note.
		expect(marked).toEqual([false, false, false, true, true]);
	});

	it('reads "1 of 5", so the ceiling a reader hears is the one drawn', () => {
		const { el } = sheetOf();
		expect(parts(el).run?.getAttribute('aria-valuetext')).toBe('1 of 5');
		expect(parts(el).run?.getAttribute('aria-label')).toBe('Exhaustion, 1 of 5');
	});

	/*
	 * The absolute spelling reaches the ceiling through the accepting set's
	 * *second* rule — a `mod.<name>` written anywhere on the layout — so the run
	 * genuinely gets longer while the component's own formula can say nothing
	 * about how much of its length came from a push. A uniform run is the honest
	 * drawing, and it needs no text scan to arrive at: only `mod.self` resolves
	 * differently with and without the published name.
	 */
	it('lengthens without marking where the count names the slot absolutely', () => {
		const { el, env } = sheetOf('+= 2', {
			...run,
			count: '3 + mod.exhaustion.count',
		});
		expect(parts(el).segments).toHaveLength(5);
		expect(env.sheet('exhaustion.count')).toBe(5);
		expect(
			parts(el).segments.filter((s) =>
				s.classList.contains('sheetsmith-track-segment-granted'),
			),
		).toHaveLength(0);
	});

	it('grants every segment where the whole count is the slot', () => {
		const { el } = sheetOf('+= 2', { ...run, count: 'mod.self' });
		expect(
			parts(el).segments.map((s) =>
				s.classList.contains('sheetsmith-track-segment-granted'),
			),
		).toEqual([true, true]);
	});

	it('grants what the formula made of the push, not the push', () => {
		// floor((3 + 2) / 2) is 2 against a base of 1: a slot total of +2 and one
		// segment granted. Reading the total would have said two.
		const { el } = sheetOf('+= 2', {
			...run,
			count: 'floor((3 + mod.self) / 2)',
		});
		expect(
			parts(el).segments.map((s) =>
				s.classList.contains('sheetsmith-track-segment-granted'),
			),
		).toEqual([false, true]);
	});

	/*
	 * **A penalty leaves its slots on the card, blocked.** The owner's rule, and
	 * the reversal of what this feature first shipped: "those slots should still
	 * be there, instead of just disappearing". A run of three with a −1 draws
	 * three, not two.
	 */
	it('keeps the slots a penalty took, drawn and blocked', () => {
		const { el } = sheetOf('+= -1');
		expect(parts(el).segments).toHaveLength(3);
		const marked = parts(el).segments.map((s) => ({
			blocked: s.classList.contains('sheetsmith-track-segment-blocked'),
			granted: s.classList.contains('sheetsmith-track-segment-granted'),
		}));
		expect(marked).toEqual([
			{ blocked: false, granted: false },
			{ blocked: false, granted: false },
			{ blocked: true, granted: false },
		]);
	});

	it('holds the ceiling to the live run and says the rest in words', () => {
		/*
		 * A slider is one value between two bounds, and a blocked slot is not a
		 * value this control can take — so `aria-valuemax` is the *live* run and
		 * the drawn boxes deliberately outnumber it. `aria-valuetext` is the only
		 * sanctioned place to explain that, which is what it is for.
		 */
		const { el } = sheetOf('+= -1');
		expect(parts(el).run?.getAttribute('aria-valuemax')).toBe('2');
		expect(parts(el).run?.getAttribute('aria-valuetext')).toBe('1 of 2, 1 blocked');
		expect(parts(el).run?.getAttribute('aria-label')).toBe(
			'Exhaustion, 1 of 2, 1 blocked',
		);
	});

	it('cannot be pressed into the blocked region', () => {
		/*
		 * Not a guard that refuses a press — a run that never had those
		 * positions. The hit test is handed the live segments' rectangles only,
		 * so a press out in the blocked tail lands past the end and fills the
		 * live run, which is what a press past the end of any run already does.
		 */
		const { el } = sheetOf('+= -1');
		const runEl = parts(el).run;
		parts(el).segments.forEach((segment, i) => {
			segment.getBoundingClientRect = () =>
				({ left: i * 20, right: i * 20 + 10, top: 0, bottom: 10 }) as DOMRect;
		});
		if (runEl === null) throw new Error('no run');
		runEl.getBoundingClientRect = () =>
			({ left: 0, right: 60, top: 0, bottom: 10 }) as DOMRect;
		runEl.setPointerCapture = () => undefined;
		runEl.releasePointerCapture = () => undefined;
		// Dead centre of the third box, which is the blocked one.
		pressDown(runEl, { clientX: 45, clientY: 5 });
		release(runEl, { clientX: 45, clientY: 5 });
		expect(runEl.getAttribute('aria-valuenow')).toBe('2');
		expect(runEl.getAttribute('aria-valuetext')).toBe('2 of 2, 1 blocked');
	});

	it('never fills a blocked slot, whatever the note holds', () => {
		/*
		 * The case Ilona reaches by filling a run and then wearing the shackles.
		 * SPEC §4.2's "rendered, not corrected" governs the *note*; the drawing
		 * has always clamped to the run, and the run is now the live part of it.
		 */
		const { el, data } = sheetOf('+= -1', run, '\n```sheet\nvalue: 3\n```\n');
		// Three drawn, two filled: the blocked one is on screen and empty, which
		// is the whole claim. A stored 3 would have filled it.
		expect(fills(el)).toEqual([1, 1, 0]);
		expect(parts(el).run?.getAttribute('aria-valuetext')).toBe('2 of 2, 1 blocked');
		if (data === null) throw new Error('expected data');
		expect(data.values['value']).toBe('3');
	});

	it('draws a run a penalty took whole as blocked rather than as "?"', () => {
		// `?` is reserved for a count that did not resolve (SPEC §5). This one
		// resolved perfectly well, to nothing, and the slots are still the
		// layout's — so the honest drawing is the run, entirely shut.
		const { el } = sheetOf('+= -5', { ...run, count: '2 + mod.self' });
		expect(parts(el).unresolved).toHaveLength(0);
		expect(parts(el).segments).toHaveLength(2);
		expect(
			parts(el).segments.every((s) =>
				s.classList.contains('sheetsmith-track-segment-blocked'),
			),
		).toBe(true);
		expect(parts(el).run?.getAttribute('aria-valuemax')).toBe('0');
		expect(parts(el).run?.getAttribute('aria-valuetext')).toBe('0 of 0, 2 blocked');
	});

	/*
	 * SPEC §4.2: a stored value outside the run is rendered, not corrected. The
	 * removal path inherits it whole, so taking the talisman off is not a
	 * destructive act — which is the same rule a level-down and a hand-edited
	 * note already get.
	 */
	it('keeps marks past a shrunken run in the note, and reports the run', () => {
		const body = '\n```sheet\nvalue: 5\n```\n';
		const { el, data } = sheetOf(null, run, body);
		expect(parts(el).segments).toHaveLength(3);
		expect(parts(el).run?.getAttribute('aria-valuetext')).toBe('3 of 3');
		// Every one of them filled, which is the half "3 of 3" does not state.
		expect(fills(el)).toEqual([1, 1, 1]);
		/*
		 * **Constraint 3, through the data `read` actually produced.** An empty
		 * delta round-trips whatever the caller hands it and would pass on a
		 * `write` that had stopped preserving anything at all, which is exactly
		 * the vacuous pass `PATTERNS.md` §10 forbids on the one assertion
		 * guarding a hard constraint. What has to survive is the stored `5` a
		 * three-segment run cannot draw.
		 */
		if (data === null) throw new Error('expected data');
		expect(track.write({ values: data.values }, body, run)).toBe(body);
		expect(data.values['value']).toBe('5');
	});

	it('says what a run that works out to nothing is, rather than blaming the formula', () => {
		/*
		 * The floor, which is now narrower than it was: a run with slots of its
		 * own draws them blocked, so "?" is left for a run that has none to draw
		 * either. `count: "mod.self"` is that case — the unmodified length is
		 * nothing, so there is no base run to hold open.
		 */
		const { el } = sheetOf('+= -2', { ...run, count: 'mod.self' });
		expect(parts(el).segments).toHaveLength(0);
		const said = parts(el).unresolved[0]?.getAttribute('title') ?? '';
		expect(said).toContain('This run works out to -2 segments.');
		expect(said).not.toContain('did not resolve');
		// And the breakdown beside it, so the -2 is findable rather than
		// merely reported.
		expect(said).toContain('Talisman');
	});

	it('puts the sentence behind the door too, on the one card with no run', () => {
		/*
		 * **The popover carries what the reader cannot otherwise see.** On a
		 * drawn run the reading is the segments, so the bubble holds the
		 * breakdown alone; on a `?` there is no run and no `aria-valuetext`, so
		 * the sentence is said nowhere else and the bubble is its only door —
		 * which matters most here, because this is the card with least else on
		 * it. The glyph's own `title` takes the same string.
		 */
		const { el } = sheetOf('+= -2', { ...run, count: 'mod.self' });
		doorOf(el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const said = document.querySelector('.sheetsmith-popover')?.textContent ?? '';
		expect(said).toContain('This run works out to -2 segments.');
		expect(said).toContain('Talisman');
		expect(said).toBe(parts(el).unresolved[0]?.getAttribute('title'));
		closePopover();
	});

	it('leaves the sentence off the door where a run is drawn', () => {
		// A blocked run *is* the reading, so saying "works out to -3" over it
		// would be a second account of a picture the reader already has.
		const { el } = sheetOf('+= -5', { ...run, count: '2 + mod.self' });
		doorOf(el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const said = document.querySelector('.sheetsmith-popover')?.textContent ?? '';
		expect(said).not.toContain('works out to');
		expect(said).toContain('Talisman');
		closePopover();
	});

	it('says it where there is no pointer too, which is this state\'s own gap', () => {
		// A "?" is not focusable and carries no name, so a `title` alone left
		// the one state this feature added a sentence for with one channel.
		const { el } = sheetOf('+= -2', { ...run, count: 'mod.self' });
		const mark = parts(el).unresolved[0];
		const twin = mark?.parentElement?.querySelector('.sheetsmith-sr-only');
		expect(twin?.textContent).toBe(mark?.getAttribute('title'));
		// And the glyph itself is still the one character it draws.
		expect(mark?.textContent).toBe('?');
		// After the glyph, for the reason above: the mark, then the news.
		expectSpokenChildrenLast(mark?.parentElement, 1);
		expect(twin?.textContent).toContain('This run works out to -2 segments.');
	});

	it('still says a broken formula did not resolve', () => {
		const { el } = sheetOf('+= 2', { ...run, count: '3 + nowhere' });
		const said = parts(el).unresolved[0]?.getAttribute('title') ?? '';
		expect(said).not.toContain('works out to');
	});

	/** The door beside the card's name, where a modifier is doing something. */
	const doorOf = (el: HTMLElement) =>
		el.querySelector<HTMLButtonElement>('.sheetsmith-track-modifier-button');

	it('says the same thing to a pointer and to a screen reader', () => {
		const { el } = sheetOf();
		const run_ = parts(el).run;
		const described = run_?.getAttribute('aria-describedby');
		expect(described).not.toBeNull();
		const twin = described ? el.querySelector(`#${described}`) : null;
		// One string and one builder, whatever the carrier: the twin a screen
		// reader is handed and the popover the button opens are the same text.
		expect(twin?.textContent).toContain('Talisman — item +2');
		doorOf(el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const bubble = document.querySelector('.sheetsmith-popover');
		expect(bubble?.textContent).toBe(twin?.textContent);
		closePopover();
		/*
		 * And it is drawn after the run and the step line, which is the one
		 * claim about it no shot and no visible-order assertion can see: an
		 * invisible element's position *is* reading order, so a reader meets
		 * the control and then the news about it. `src/test/spoken-order.ts`
		 * exists because exactly this rule was broken and shipped once.
		 */
		expectSpokenChildrenLast(
			el.querySelector('.sheetsmith-track-row'),
			1,
		);
	});

	/*
	 * **The affordance, which is the half a `title` never had.** The content was
	 * already right and reachable from the keyboard and from a screen reader; a
	 * native tooltip is slow, unstyled, truncating, and a finger never sees one.
	 * This is Card's door, on a component whose own press is taken.
	 */
	it('grows a door beside the name where a modifier is doing something', () => {
		const { el } = sheetOf();
		const door = doorOf(el);
		expect(door?.tagName).toBe('BUTTON');
		expect(door?.getAttribute('aria-label')).toBe('Modifiers on Exhaustion');
		// Beside the name rather than in the run: everything in the run's own
		// row is a target or something a drag passes over.
		expect(door?.parentElement?.classList.contains('sheetsmith-track-heading')).toBe(
			true,
		);
		expect(door?.closest('.sheetsmith-track-run')).toBeNull();
	});

	it('opens the breakdown on a press, and on Enter without a second path', () => {
		const { el } = sheetOf();
		const door = doorOf(el);
		if (!door) throw new Error('no door');
		door.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')?.textContent).toContain(
			'Talisman — item +2',
		);
		closePopover();
		// A `<button>`'s Enter arrives as a click, which is the one route in
		// (`docs/PATTERNS.md` §6). Nothing here handles a key.
		door.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		door.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(document.querySelector('.sheetsmith-popover')).not.toBeNull();
		closePopover();
	});

	/*
	 * **The component prefix is the builder's drop rule and not a caller's, and
	 * this case is what makes the one-vocabulary claim checkable rather than
	 * asserted.**
	 *
	 * A design review read Track's bubble as saying less than Card's — `Talisman
	 * of Endurance — +2` against `Worn items · Ring of Protection — +1` — and
	 * read that as Track dropping a token Card keeps. It is not: `sources.size >
	 * 1` decides it, so a Card with one contributor from one table prints no
	 * prefix either, and the sample's armour class prints one only because two
	 * modifier tables push at it. The rule is `docs/UI.md` §9's — a token that is
	 * the same on every line carries no information — and the case below is the
	 * one where it stops being the same on every line.
	 */
	it('names the component on every line once two of them push at the run', () => {
		const gearBody = [
			'| Item | Modifiers |',
			'| --- | --- |',
			'| Talisman | exhaustion.count += 2 as item |',
		].join('\n');
		const second: TableConfig = {
			...gear,
			id: 'packed',
			label: 'Packed items',
			rows: [{ label: 'Charm' }],
		};
		const packedBody = [
			'| Item | Modifiers |',
			'| --- | --- |',
			'| Charm | exhaustion.count += 1 as luck |',
		].join('\n');
		const trackRead = track.read('\n```sheet\nvalue: 1\n```\n', run);
		const gearRead = table.read(gearBody, gear);
		const packedRead = table.read(packedBody, second);
		if (!trackRead.ok || !gearRead.ok || !packedRead.ok) throw new Error('read');
		const layout: Layout = { name: 'Test', components: [run, gear, second] };
		const prepared: ReadComponent[] = [
			{ config: run, component: track, data: trackRead.data, error: null },
			{ config: gear, component: table, data: gearRead.data, error: null },
			{ config: second, component: table, data: packedRead.data, error: null },
		];
		const { env, modifiers } = buildSheet(layout, prepared);
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, run, trackRead.data, {
			resolved: resolveFormulaFields(track, run, trackRead.data, env),
			resolveField: makeFieldResolver(track, run, trackRead.data, env),
			onChange: () => undefined,
			modifiers,
		});
		doorOf(el)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const said = document.querySelector('.sheetsmith-popover')?.textContent ?? '';
		expect(said).toContain('Worn items · Talisman — item +2');
		expect(said).toContain('Packed items · Charm — luck +1');
		closePopover();
	});

	it('never draws the breakdown button and the row pickers on one card', () => {
		/*
		 * **A CSS decision rests on this**: the modifier button's ink is a rank
		 * smaller than the row pickers', while the two share a rule holding their
		 * *targets* equal. That is only safe because the pair cannot be seen side
		 * by side — the pickers belong to a row set, and a row set publishes no
		 * ceiling, so it gets no breakdown and no button. Asserted rather than
		 * left to a comment, because the comment is what would go stale.
		 */
		const set: TrackConfig = {
			...run,
			id: 'slots',
			count: undefined,
			openRows: true,
			rows: [{ key: 'L1', name: '1st', count: 2 }],
		};
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, set, { values: { L1: '1' } }, {
			resolved: {},
			resolveField: () => null,
			onChange: () => undefined,
		});
		// The pickers are there, and the door is not.
		expect(
			el.querySelectorAll('.sheetsmith-track-action-button').length,
		).toBeGreaterThan(0);
		expect(doorOf(el)).toBeNull();
		// And the other way round, on the card that does have a door.
		const modified = sheetOf().el;
		expect(doorOf(modified)).not.toBeNull();
		expect(modified.querySelectorAll('.sheetsmith-track-action-button')).toHaveLength(
			0,
		);
	});

	it('grows nothing on a run nothing is pushed at', () => {
		const { el } = sheetOf(null, { ...run, count: 6 });
		expect(doorOf(el)).toBeNull();
		expect(el.querySelector('.sheetsmith-track-heading')).toBeNull();
		// And the label is still a direct child of the card, which is what keeps
		// every unmodified Track the DOM and the pixels it always had.
		expect(
			el.querySelector('.sheetsmith-track-label')?.parentElement?.classList.contains(
				'sheetsmith-track',
			),
		).toBe(true);
	});

	it('follows the wide set, so an absolute spelling gets the door and no dashes', () => {
		const { el } = sheetOf('+= 2', { ...run, count: '3 + mod.exhaustion.count' });
		expect(doorOf(el)).not.toBeNull();
		expect(
			parts(el).segments.filter((s) =>
				s.classList.contains('sheetsmith-track-segment-granted'),
			),
		).toHaveLength(0);
	});

	it('leaves the run\'s own title to the reading', () => {
		// The breakdown left it when the button arrived: two doors to one room,
		// and the tooltip was the worse of the two.
		const { el } = sheetOf();
		expect(parts(el).run?.hasAttribute('title')).toBe(false);
		const named = sheetOf('+= 2', {
			...run,
			levels: ['Rested', 'Tired', 'Weary'],
		});
		expect(parts(named.el).run?.title).toBe('Tired');
	});

	it('leaves an unmodified run with no title and no description', () => {
		const { el } = sheetOf(null, { ...run, count: 6 });
		expect(parts(el).run?.hasAttribute('title')).toBe(false);
		expect(parts(el).run?.hasAttribute('aria-describedby')).toBe(false);
	});

	/*
	 * The boundary, asserted rather than assumed. `rows.*.count` is a pattern
	 * field, so the pre-resolve pass skips it by construction, and a row set
	 * publishes no name for a ceiling to sit at (SPEC §13) — so `mod.self` there
	 * is legitimately 0 and the row draws the length the layout declared.
	 */
	it('leaves a row set alone', () => {
		const set: TrackConfig = {
			...run,
			id: 'slots',
			count: undefined,
			rows: [{ key: 'L1', name: '1st', count: '2 + mod.self' }],
		};
		const gearBody = [
			'| Item | Modifiers |',
			'| --- | --- |',
			'| Talisman | slots.L1 += 2 as item |',
		].join('\n');
		const trackRead = track.read('\n```sheet\nL1: 1\n```\n', set);
		const gearRead = table.read(gearBody, gear);
		if (!trackRead.ok || !gearRead.ok) throw new Error('read failed');
		const layout: Layout = { name: 'Test', components: [set, gear] };
		const prepared: ReadComponent[] = [
			{ config: set, component: track, data: trackRead.data, error: null },
			{ config: gear, component: table, data: gearRead.data, error: null },
		];
		const { env, modifiers } = buildSheet(layout, prepared);
		const el = document.createElement('div');
		document.body.appendChild(el);
		track.render(el, set, trackRead.data, {
			resolved: resolveFormulaFields(track, set, trackRead.data, env),
			resolveField: makeFieldResolver(track, set, trackRead.data, env),
			onChange: () => undefined,
			modifiers,
		});
		expect(parts(el).error).toBeNull();
		expect(parts(el).segments).toHaveLength(2);
		expect(
			parts(el).segments.filter((s) =>
				s.classList.contains('sheetsmith-track-segment-granted'),
			),
		).toHaveLength(0);
	});

	it('leaves named levels and a flag alone', () => {
		const levels = sheetOf('+= 2', {
			...run,
			count: '3 + mod.self',
			levels: ['Rested', 'Tired', 'Weary'],
		});
		expect(parts(levels.el).segments).toHaveLength(2);
		expect(levels.env.sheet('exhaustion.count')).toBe(2);

		const flag = sheetOf('+= 2', { ...run, count: 1 }, '\n```sheet\nvalue: yes\n```\n');
		expect(
			flag.el.querySelectorAll('.sheetsmith-track-flag'),
		).toHaveLength(1);
		expect(flag.env.sheet('exhaustion.count')).toBe(1);
	});

	/*
	 * **The gesture, driven, and against a run of the same length with no
	 * grant** — because "the same as" is the whole criterion and a single run
	 * cannot state it.
	 *
	 * `measured` is `track pointer`'s own device: happy-dom lays nothing out, so
	 * every gesture case in this file models the geometry it presses against.
	 * What this one models is the join — the granted segments start 10px further
	 * right than an even run's would — so the rectangles the run hit-tests with
	 * are the shape the margin actually produces, and pressing the *fourth
	 * segment* of each run is a different `x` in each. The claim is that it
	 * reaches the same mark anyway.
	 */
	const measured = (el: HTMLElement, joinAt: number): HTMLElement => {
		parts(el).runs.forEach((runEl) => {
			const segments = Array.from(
				runEl.querySelectorAll<HTMLElement>('.sheetsmith-track-segment'),
			);
			segments.forEach((segment, i) => {
				const left = i * 20 + (i >= joinAt ? 10 : 0);
				segment.getBoundingClientRect = () =>
					({ left, right: left + 10, top: 0, bottom: 10 }) as DOMRect;
			});
			runEl.getBoundingClientRect = () =>
				({ left: 0, right: 200, top: 0, bottom: 10 }) as DOMRect;
			runEl.setPointerCapture = () => undefined;
			runEl.releasePointerCapture = () => undefined;
		});
		return el;
	};

	/** The rectangles the run itself hit-tests with. */
	const boxesOf = (el: HTMLElement): SegmentBox[] =>
		parts(el).segments.map((segment) => {
			const box = segment.getBoundingClientRect();
			return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
		});

	/** The centre of one segment, in that run's own geometry. */
	const centreOf = (el: HTMLElement, index: number): number => {
		const box = parts(el).segments[index]?.getBoundingClientRect();
		if (box === undefined) throw new Error(`no segment ${index}`);
		return box.left + (box.right - box.left) / 2;
	};

	/** A five-segment run whose last two are granted, and a plain five. */
	const pair = () => ({
		granted: measured(sheetOf().el, 3),
		plain: measured(sheetOf(null, { ...run, count: 5 }).el, 5),
	});

	it('reaches the same mark on a press as a plain run of the same length', () => {
		const { granted, plain } = pair();
		expect(parts(granted).segments).toHaveLength(5);
		expect(parts(plain).segments).toHaveLength(5);
		// The premise, asserted rather than assumed: the two runs are not the
		// same geometry, so "the same mark" is a claim about the hit test and
		// not about two identical presses. 75 against 65.
		expect(centreOf(granted, 3)).not.toBe(centreOf(plain, 3));
		// And the join must not read as a wrap — a segment starting no further
		// right than the one before it begins a new line, which is the one way
		// a wider gap could have changed what a point inside it means.
		expect(marksAtPoint(boxesOf(granted), centreOf(granted, 0) - 30, 5, 1)).toBe(0);
		expect(marksAtPoint(boxesOf(granted), centreOf(granted, 4) + 30, 5, 1)).toBe(5);
		for (const el of [granted, plain]) {
			pressDown(parts(el).run, { clientX: centreOf(el, 3), clientY: 5 });
			release(parts(el).run, { clientX: centreOf(el, 3), clientY: 5 });
		}
		expect(parts(granted).run?.getAttribute('aria-valuetext')).toBe('4 of 5');
		expect(parts(plain).run?.getAttribute('aria-valuetext')).toBe('4 of 5');
	});

	it('reaches the same mark on a drag across the join', () => {
		const { granted, plain } = pair();
		for (const el of [granted, plain]) {
			const runEl = parts(el).run;
			pressDown(runEl, { clientX: centreOf(el, 0), clientY: 5 });
			runEl?.dispatchEvent(
				new PointerEvent('pointermove', {
					pointerId: 1,
					clientX: centreOf(el, 4),
					clientY: 5,
				}),
			);
			release(runEl, { clientX: centreOf(el, 4), clientY: 5 });
		}
		expect(parts(granted).run?.getAttribute('aria-valuetext')).toBe('5 of 5');
		expect(parts(plain).run?.getAttribute('aria-valuetext')).toBe('5 of 5');
	});

	it('steps to the same mark on the arrow keys', () => {
		// Geometry-free by construction, which is the point of asserting it: a
		// granted tail must not have made the run a different control.
		const { granted, plain } = pair();
		for (const el of [granted, plain]) {
			parts(el).run?.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }),
			);
		}
		expect(parts(granted).run?.getAttribute('aria-valuetext')).toBe('2 of 5');
		expect(parts(plain).run?.getAttribute('aria-valuetext')).toBe('2 of 5');
	});
});
