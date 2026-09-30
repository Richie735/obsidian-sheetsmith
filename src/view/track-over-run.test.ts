// @vitest-environment happy-dom
/*
 * What the first step does to a Track whose note holds more marks than its run
 * can take (`docs/features/track-stored-value-past-shortened-run.md`).
 *
 * SPEC §4.2 says a stored value outside the run is rendered, not corrected.
 * Four ways reach that state, and each has a `describe` here: a literal `count`
 * lowered, a formula `count` resolving lower, a modifier (a grant removed, and a
 * penalty over held marks), and a character shortening their own row. The rule
 * all four pin is the feature's one sentence: **no gesture writes away a mark
 * the reader was not shown.** Right, End, Space and a drag past the end write
 * nothing; Left and a tap on the last lit segment step down one mark; a tap on a
 * live segment writes that segment, a choice made with the whole value on
 * screen; Home writes 0; a blur alone writes nothing.
 *
 * Driven through a real `SheetView`, as `retained-section-adoption.test.ts` is:
 * the note is parsed, the section is found and read, the Track renders into the
 * grid, a real press lands on it, and the edit goes through `applyEdits` →
 * `serialiseCharacter` into the view's data. What is asserted is the view's text
 * afterwards, which is what the next save writes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { SheetView } from './sheet-view';
import { pressDown, release } from '../test/pointer';
import { gestureCommit, note, settle, sheetOn } from '../test/sheet-on-note';

/** A fence holding one entry per line. */
const fence = (...lines: string[]): string => ['```sheet', ...lines, '```', ''].join('\n');

/** The Track's run on the sheet, found afresh, since a write rebuilds the view. */
function runOf(view: SheetView): HTMLElement {
	const run = view.containerEl.querySelector<HTMLElement>('.sheetsmith-track-run');
	if (run === null) throw new Error('no run on the sheet');
	return run;
}

/**
 * Give every drawn box on the run a rectangle, 10px wide on a 20px pitch, one
 * line: happy-dom lays nothing out, and the hit test reads rectangles.
 */
function layOut(run: HTMLElement): HTMLElement[] {
	const boxes = Array.from(run.querySelectorAll<HTMLElement>('.sheetsmith-track-segment'));
	boxes.forEach((box, at) => {
		box.getBoundingClientRect = () =>
			({ left: at * 20, right: at * 20 + 10, top: 0, bottom: 10 }) as DOMRect;
	});
	run.getBoundingClientRect = () =>
		({ left: 0, right: boxes.length * 20, top: 0, bottom: 10 }) as DOMRect;
	run.setPointerCapture = () => undefined;
	run.releasePointerCapture = () => undefined;
	return boxes;
}

/** Press a key on the run and wait out the commit window. */
async function key(view: SheetView, name: string): Promise<void> {
	runOf(view).dispatchEvent(new KeyboardEvent('keydown', { key: name, cancelable: true }));
	await gestureCommit();
	await settle();
}

/** Tap the centre of the box at `at`. */
async function tapBox(view: SheetView, at: number): Promise<void> {
	const run = runOf(view);
	layOut(run);
	const x = at * 20 + 5;
	pressDown(run, { clientX: x, clientY: 5 });
	release(run, { clientX: x, clientY: 5 });
	await settle();
}

/** Tap the last box the run draws lit. */
async function tapLastLit(view: SheetView): Promise<void> {
	const boxes = layOut(runOf(view));
	const lit = boxes.map((box) => box.classList.contains('sheetsmith-track-segment-on'));
	await tapBox(view, lit.lastIndexOf(true));
}

/**
 * Press on the first box and drag far past the end of the run. Started on the
 * first box rather than the last lit one, because a press on the mark the value
 * stands on arms a clear, and a clear holds while the pointer stays past the
 * end — which is a different gesture from reaching past it.
 */
async function dragPastEnd(view: SheetView): Promise<void> {
	const run = runOf(view);
	layOut(run);
	pressDown(run, { clientX: 5, clientY: 5 });
	run.dispatchEvent(
		new PointerEvent('pointermove', { pointerId: 1, clientX: 5000, clientY: 5, bubbles: true }),
	);
	release(run, { clientX: 5000, clientY: 5 });
	await settle();
}

afterEach(() => {
	document.body.replaceChildren();
});

/** One way a run gets shorter than its note. */
interface Instance {
	name: string;
	components: readonly Record<string, unknown>[];
	text: string;
	/** What the note holds on the run's line for `n` marks. */
	entry: (n: number) => string;
	/** The marks the note holds. */
	stored: number;
	/** Anything the reader does before the step: case 4's length commit. */
	before?: (view: SheetView) => Promise<void>;
}

const TRACK = { id: 'stress', type: 'track', label: 'Stress' };

/** A worn-items table whose one row pushes `cell` at the run, or nothing. */
const gear = {
	id: 'worn',
	type: 'table',
	label: 'Worn items',
	rowHeader: 'Item',
	rows: [{ label: 'Talisman' }],
	columns: [{ key: 'Modifiers', type: 'modifier' }],
};
const gearBody = (cell: string): string =>
	['| Item | Modifiers |', '| --- | --- |', `| Talisman | ${cell} |`, ''].join('\n');

/** Type into a row's length field and commit it by blur. */
async function commitLength(view: SheetView, value: string): Promise<void> {
	const field = view.containerEl.querySelector<HTMLInputElement>(
		'.sheetsmith-track-row-length-input',
	);
	if (field === null) throw new Error('no length field');
	field.focus();
	field.value = value;
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.dispatchEvent(new Event('blur'));
	await settle();
}

const INSTANCES: readonly Instance[] = [
	{
		name: '1. a literal count lowered: count 3 over value 5',
		components: [{ ...TRACK, count: 3 }],
		text: note(['Stress', fence('value: 5')]),
		entry: (n) => `value: ${n}`,
		stored: 5,
	},
	{
		name: '2. a formula count resolving lower: count "level" at level 3, over value 5',
		components: [
			{ id: 'level', type: 'card', label: 'Level' },
			{ ...TRACK, count: 'level' },
		],
		text: note(['Level', fence('value: 3')], ['Stress', fence('value: 5')]),
		entry: (n) => `value: ${n}`,
		stored: 5,
	},
	{
		name: '3a. a grant removed: 3 + mod.self with nothing pushed, over value 5',
		components: [{ ...TRACK, count: '3 + mod.self' }, gear],
		text: note(['Stress', fence('value: 5')], ['Worn items', gearBody('')]),
		entry: (n) => `value: ${n}`,
		stored: 5,
	},
	{
		name: '3b. a penalty over held marks: 6 + mod.self with a -2, over value 6',
		components: [{ ...TRACK, count: '6 + mod.self' }, gear],
		text: note(
			['Stress', fence('value: 6')],
			['Worn items', gearBody('stress.count += -2 as item')],
		),
		entry: (n) => `value: ${n}`,
		stored: 6,
	},
	{
		name: '4. a character-owned row shortened: d6 at 5 / 6, its length committed to 3',
		components: [{ ...TRACK, rows: [{ key: 'd6', maxSource: 'character' }] }],
		text: note(['Stress', fence('d6: 5 / 6')]),
		entry: (n) => `d6: ${n} / 3`,
		stored: 5,
		before: async (view) => commitLength(view, '3'),
	},
];

for (const instance of INSTANCES) {
	describe(instance.name, () => {
		const { stored, entry } = instance;

		/** The sheet, after anything the instance does first, and the note it then holds. */
		const open = async (): Promise<{ view: SheetView; start: string }> => {
			const { view } = await sheetOn(instance.components, instance.text);
			await instance.before?.(view);
			const start = view.getViewData();
			expect(start).toContain(entry(stored));
			return { view, start };
		};

		/** The note with the run's line holding `n` marks and every other byte as it was. */
		const holding = (start: string, n: number): string =>
			start.replace(entry(stored), entry(n));

		it('draws the marks past the run, so the step starts from a value on screen', async () => {
			const { view } = await open();
			expect(runOf(view).getAttribute('aria-valuenow')).toBe(String(stored));
			expect(runOf(view).getAttribute('aria-valuemax')).toBe(String(stored));
		});

		for (const name of ['ArrowRight', 'Space', 'End']) {
			it(`${name} writes nothing, since nothing steps up past the stored value`, async () => {
				const { view, start } = await open();
				await key(view, name === 'Space' ? ' ' : name);
				expect(view.getViewData()).toBe(start);
			});
		}

		it('a drag past the end writes nothing', async () => {
			const { view, start } = await open();
			await dragPastEnd(view);
			expect(view.getViewData()).toBe(start);
		});

		it('ArrowLeft steps down one mark from the stored value', async () => {
			const { view, start } = await open();
			await key(view, 'ArrowLeft');
			expect(view.getViewData()).toBe(holding(start, stored - 1));
		});

		it('a tap on the last lit segment clears one mark', async () => {
			const { view, start } = await open();
			await tapLastLit(view);
			expect(view.getViewData()).toBe(holding(start, stored - 1));
		});

		it('a tap on a live segment writes that segment, chosen with the whole value shown', async () => {
			const { view, start } = await open();
			await tapBox(view, 1);
			expect(view.getViewData()).toBe(holding(start, 2));
		});

		it('Home writes 0', async () => {
			const { view, start } = await open();
			await key(view, 'Home');
			expect(view.getViewData()).toBe(holding(start, 0));
		});

		it('a blur alone writes nothing', async () => {
			const { view, start } = await open();
			runOf(view).dispatchEvent(new Event('blur'));
			await settle();
			expect(view.getViewData()).toBe(start);
		});
	});
}

describe('4. the length commit itself', () => {
	it('writes 5 / 3 and keeps the marks', async () => {
		const text = note(['Stress', fence('d6: 5 / 6')]);
		const { view } = await sheetOn(
			[{ ...TRACK, rows: [{ key: 'd6', maxSource: 'character' }] }],
			text,
		);
		await commitLength(view, '3');
		expect(view.getViewData()).toBe(text.replace('d6: 5 / 6', 'd6: 5 / 3'));
	});
});
