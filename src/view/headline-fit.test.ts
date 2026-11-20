// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../test/obsidian-stub';
import { createHeadlineFit } from './headline-fit';
import { stampHeadline } from '../ui/headline-fit';
import { note, settle, sheetOn } from '../test/sheet-on-note';
import { TextFileView } from '../test/obsidian-stub';

/*
 * The first `ResizeObserver` in the repository, so its lifecycle is what these
 * hold (`docs/features/headline-narrow-cell.md`, "The observer's lifecycle"):
 * one per view, every stamped headline observed after a render, disconnected
 * before each rebuild and on close, and none left connected.
 *
 * A stub in place of the window's own, recording what each instance was asked.
 */
class StubObserver {
	static made: StubObserver[] = [];
	observed = new Set<Element>();
	connected = false;
	disconnects = 0;
	constructor(readonly callback: ResizeObserverCallback) {
		StubObserver.made.push(this);
	}
	observe(target: Element): void {
		this.observed.add(target);
		this.connected = true;
	}
	unobserve(target: Element): void {
		this.observed.delete(target);
	}
	disconnect(): void {
		this.observed.clear();
		this.connected = false;
		this.disconnects++;
	}
}

const realObserver = (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
beforeEach(() => {
	StubObserver.made = [];
	(window as unknown as { ResizeObserver: unknown }).ResizeObserver = StubObserver;
});
afterEach(() => {
	(window as unknown as { ResizeObserver: unknown }).ResizeObserver = realObserver;
	document.body.replaceChildren();
});

describe('createHeadlineFit', () => {
	it('observes every stamped headline under the root, and drops them on the next watch', () => {
		const fit = createHeadlineFit(StubObserver);
		const root = document.body.createDiv();
		const one = root.createDiv({ text: '6' });
		const two = root.createDiv({ text: '100' });
		root.createDiv({ text: 'not a headline' });
		stampHeadline(one, one);
		stampHeadline(two, two);
		fit.watch(root);
		const [observer] = StubObserver.made;
		expect(StubObserver.made).toHaveLength(1);
		expect([...(observer?.observed ?? [])]).toEqual([one, two]);

		const next = document.body.createDiv();
		const three = next.createDiv({ text: '355000' });
		stampHeadline(three, three);
		fit.watch(next);
		// The same observer, disconnected and pointed at the new render alone.
		expect(StubObserver.made).toHaveLength(1);
		expect(observer?.disconnects).toBe(1);
		expect([...(observer?.observed ?? [])]).toEqual([three]);

		fit.disconnect();
		expect(observer?.connected).toBe(false);
	});

	it('refits what the observer reports', () => {
		const fit = createHeadlineFit(StubObserver);
		const root = document.body.createDiv();
		const el = root.createDiv({ text: '355000' });
		stampHeadline(el, el);
		fit.watch(root);
		Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });
		Object.defineProperty(el, 'clientWidth', { value: 50, configurable: true });
		StubObserver.made[0]?.callback([{ target: el } as unknown as ResizeObserverEntry], {} as ResizeObserver);
		expect(el.classList.contains('sheetsmith-headline-cut')).toBe(true);
	});

	it('makes no observer where a render stamped nothing, or where the window has none', () => {
		const empty = createHeadlineFit(StubObserver);
		empty.watch(document.body.createDiv());
		expect(StubObserver.made).toHaveLength(0);
		const none = createHeadlineFit(undefined);
		const root = document.body.createDiv();
		const el = root.createDiv({ text: '6' });
		stampHeadline(el, el);
		expect(() => none.watch(root)).not.toThrow();
	});
});

describe("a sheet view's headline observer", () => {
	const CARD = { id: 'gold', type: 'card', label: 'Gold', key: 'gp' };
	const POOL = { id: 'hp', type: 'pool', label: 'Hit points', max: '30' };
	const TEXT = note(['Gold', '```sheet\ngp: 100\n```\n'], ['Hit points', '```sheet\ncurrent: 12\n```\n']);

	const headlines = (root: HTMLElement) =>
		Array.from(root.querySelectorAll<HTMLElement>('.sheetsmith-headline'));

	it('is one per view, watching every headline the render stamped', async () => {
		const { view } = await sheetOn([CARD, POOL], TEXT);
		expect(StubObserver.made).toHaveLength(1);
		const stamped = headlines(view.containerEl);
		expect(stamped).toHaveLength(2);
		expect([...(StubObserver.made[0]?.observed ?? [])]).toEqual(stamped);
	});

	it('is disconnected before each rebuild, and watches the new render alone', async () => {
		const { view } = await sheetOn([CARD, POOL], TEXT);
		const observer = StubObserver.made[0];
		const before = headlines(view.containerEl);
		view.refresh();
		// Disconnected at the start of the rebuild, before the old headlines go.
		expect(observer?.disconnects).toBe(1);
		await settle();
		const after = headlines(view.containerEl);
		expect(after.every((el) => !before.includes(el))).toBe(true);
		expect(StubObserver.made).toHaveLength(1);
		expect([...(observer?.observed ?? [])]).toEqual(after);
	});

	it('is left connected to nothing once the view closes, or its file is cleared', async () => {
		const { view } = await sheetOn([CARD, POOL], TEXT);
		const observer = StubObserver.made[0];
		await (view as unknown as TextFileView & { onClose(): Promise<void> }).onClose();
		expect(observer?.connected).toBe(false);
		expect(observer?.observed.size).toBe(0);

		const reopened = await sheetOn([CARD, POOL], TEXT);
		const second = StubObserver.made[1];
		reopened.view.clear();
		expect(second?.connected).toBe(false);
	});
});
