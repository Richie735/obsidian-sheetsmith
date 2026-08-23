// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { tabSet, TabSetConfig } from './tab-set';
import { ComponentConfig, RenderContext } from '../types';

/*
 * Tab set, driven through its own DOM.
 *
 * What is asserted here is the strip, the panels and what hiding one means. What
 * is *not* is the geometry: the promise that switching tabs moves nothing comes
 * from every panel staying laid out in one grid cell, and happy-dom lays nothing
 * out — so what a test can honestly hold is the mechanism behind it, that a
 * hidden panel is still in the DOM and hidden by `visibility` rather than
 * removed. Whether the stage is really as tall as its tallest tab is a look
 * criterion, and `styles.test.ts` holds the one CSS fact it rests on.
 */

function child(id: string, label: string): ComponentConfig {
	return {
		id,
		type: 'card',
		label,
		position: { col: 1, row: 1, width: 3, height: 2 },
	};
}

function config(overrides: Partial<TabSetConfig> = {}): TabSetConfig {
	return {
		id: 'pages',
		type: 'tab-set',
		label: 'Pages',
		position: { col: 1, row: 1, width: 3, height: 2 },
		children: [child('combat', 'Combat'), child('spells', 'Spells')],
		...overrides,
	};
}

interface Rendered {
	el: HTMLElement;
	tabs: HTMLButtonElement[];
	panels: HTMLElement[];
	heading: HTMLElement | null;
	/** Every activation the component reported, in order. */
	reported: number[];
	/** Which child index each panel was asked to draw. */
	drawn: number[];
}

/**
 * Render into a fresh element, with a stand-in for the children the grid draws.
 *
 * `regions` false stands for a layout that gave it none, which is what the grid
 * says by leaving `childRegions` off.
 */
function render(
	from: TabSetConfig,
	options: { regions?: false; activeTab?: number } = {},
): Rendered {
	const el = document.createElement('div');
	const reported: number[] = [];
	const drawn: number[] = [];
	const count = (from.children ?? []).length;
	const context: RenderContext<null> = {
		resolved: {},
		resolveField: () => null,
		onChange: () => undefined,
		...(options.regions === false
			? {}
			: {
					childRegions: Array.from({ length: count }, (_unused, index) => (
						into: HTMLElement,
					) => {
						drawn.push(index);
						const control = document.createElement('input');
						control.className = `child-${index}`;
						into.appendChild(control);
					}),
				}),
		activeTab: options.activeTab,
		onActivateTab: (index) => reported.push(index),
	};
	tabSet.render(el, from, null, context);
	return {
		el,
		tabs: Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]')),
		panels: Array.from(el.querySelectorAll<HTMLElement>('[role="tabpanel"]')),
		heading: el.querySelector('.sheetsmith-group-heading'),
		reported,
		drawn,
	};
}

const hidden = (panel: HTMLElement): boolean =>
	panel.classList.contains('sheetsmith-tabset-panel-hidden');

describe('a tab set that holds nothing of its own', () => {
	it('reads no section, whatever the note says', () => {
		expect(tabSet.storage).toBe('none');
		expect(tabSet.read('```sheet\nvalue: 3\n```', config())).toEqual({
			ok: true,
			data: null,
		});
	});

	it('hands back the body it was given, byte for byte', () => {
		const body = '```sheet\nvalue: 3\n```';
		expect(tabSet.write(null, body, config())).toBe(body);
		expect(tabSet.write(null, null, config())).toBe('');
	});

	it('publishes no name and resets on no trigger', () => {
		// Containment is arrangement, never addressing. Registry-wide in
		// contract.test.ts too; here because it is the premise the rest rests on.
		expect(typeof tabSet.scopeValues).toBe('undefined');
		expect(typeof tabSet.scopeRows).toBe('undefined');
		expect(typeof tabSet.applyReset).toBe('undefined');
		expect(tabSet.formulaFields).toEqual([]);
	});
});

describe('the strip', () => {
	it('names each tab after its own child, in the order the layout wrote them', () => {
		// File order, not grid order: a tab has no placement to read one from.
		// Both children here sit at the same position, which is the ordinary case
		// and exactly what made grid order unusable.
		const { tabs } = render(config());
		expect(tabs.map((tab) => tab.textContent)).toEqual(['Combat', 'Spells']);
	});

	it('puts every tab in the focus order rather than roving one', () => {
		// Deque names the single-tab-stop pattern a defect, and on a control whose
		// job is hiding things a reader who cannot reach the fourth tab without
		// knowing to press an arrow has lost the content behind it.
		const { tabs } = render(config());
		for (const tab of tabs) expect(tab.tabIndex).toBe(0);
	});

	it('ties each tab to its panel both ways', () => {
		const { tabs, panels } = render(config());
		expect(tabs[0]?.getAttribute('aria-controls')).toBe(panels[0]?.id);
		expect(panels[0]?.getAttribute('aria-labelledby')).toBe(tabs[0]?.id);
		// Keyed on the component id, so two tab sets on one sheet do not collide.
		expect(tabs[0]?.id).toContain('pages');
	});

	it('nests the strip and the stage under one root, panels inside the stage', () => {
		// The three layers, which are the structure the no-shift guarantee rests
		// on. The panels have to be children of the *stage* and not of the root:
		// the stage is a one-cell grid, so panels inside it occupy the same cell
		// and the set is as tall as its tallest tab. Hoist them a level and they
		// become siblings of the strip in a flex column, which stacks them.
		//
		// Asserted structurally because that is the half a test can reach —
		// `styles.test.ts` holds the stage's side of it (no `container-type`, so
		// the reflow cannot turn the overlap into a stack) and the geometry itself
		// is a look, since happy-dom lays nothing out.
		const { el, panels } = render(config());
		const root = el.querySelector('.sheetsmith-tabset');
		const strip = el.querySelector('.sheetsmith-tabset-strip');
		const stage = el.querySelector('.sheetsmith-tabset-stage');
		expect(strip?.parentElement).toBe(root);
		expect(stage?.parentElement).toBe(root);
		// The strip comes first, so the names sit above the region they open.
		expect(strip?.compareDocumentPosition(stage as Node)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(panels).toHaveLength(2);
		for (const panel of panels) expect(panel.parentElement).toBe(stage);
		// And every tab button is in the strip, not loose in the root.
		for (const tab of render(config()).tabs) {
			expect(tab.parentElement?.classList.contains('sheetsmith-tabset-strip')).toBe(
				true,
			);
		}
	});

	it('draws its own heading, and drops it where the layout asks', () => {
		expect(render(config()).heading?.textContent).toBe('Pages');
		expect(render(config({ hideLabel: true })).heading).toBeNull();
	});
});

describe('the panels', () => {
	it('draws every tab, not only the open one', () => {
		// Hiding changes what the reader sees, never what the sheet computes: a
		// component on an unopened tab is rendered and its formulas resolved.
		const { drawn, panels } = render(config());
		expect(drawn).toEqual([0, 1]);
		expect(panels[1]?.querySelector('.child-1')).not.toBeNull();
	});

	it('keeps a hidden panel in the DOM and hides it by visibility', () => {
		// The whole trade in one assertion. `visibility` keeps the panel
		// contributing height, which is what stops a tab change moving the sheet;
		// `hidden` or `display: none` would not, and `hidden="until-found"` runs on
		// `content-visibility: hidden`, which is the same removal from layout. What
		// it costs is find-in-page, and that is the price of the guarantee.
		const { el, panels } = render(config());
		expect(hidden(panels[0] as HTMLElement)).toBe(false);
		expect(hidden(panels[1] as HTMLElement)).toBe(true);
		expect(panels[1]?.hasAttribute('hidden')).toBe(false);
		// Still in the tree it was drawn into. `isConnected` would ask whether
		// this fragment is in the document, which is about the test's own setup.
		expect(el.contains(panels[1] as HTMLElement)).toBe(true);
	});

	it('takes a hidden panel out of the tab order with inert', () => {
		const { panels } = render(config());
		expect(panels[0]?.hasAttribute('inert')).toBe(false);
		expect(panels[1]?.hasAttribute('inert')).toBe(true);
	});
});

describe('opening a tab', () => {
	it('opens the first one until the reader chooses', () => {
		const { tabs, panels } = render(config());
		expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
		expect(hidden(panels[1] as HTMLElement)).toBe(true);
	});

	it('moves the selection and the hiding together on a press', () => {
		const { tabs, panels, reported } = render(config());
		tabs[1]?.click();
		expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
		expect(tabs[0]?.getAttribute('aria-selected')).toBe('false');
		expect(hidden(panels[0] as HTMLElement)).toBe(true);
		expect(hidden(panels[1] as HTMLElement)).toBe(false);
		expect(reported).toEqual([1]);
	});

	it('takes the tab the view remembers over its own first', () => {
		const { tabs } = render(config(), { activeTab: 1 });
		expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
	});

	it('survives a rebuild through what it reported', () => {
		// The sheet re-renders on every committed edit, so this is the path that
		// keeps a tab open while a pool inside it is edited.
		const opening = render(config());
		opening.tabs[1]?.click();
		const rebuilt = render(config(), { activeTab: opening.reported[0] });
		expect(rebuilt.tabs[1]?.getAttribute('aria-selected')).toBe('true');
	});

	it('clamps a remembered tab the layout no longer has', () => {
		// The reader's choice outlives the layout: drop a tab while somebody has it
		// open and the index points past the end. Falling back to the first is the
		// same answer as never having chosen.
		const { tabs } = render(config(), { activeTab: 7 });
		expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
		expect(tabs).toHaveLength(2);
	});

	it('moves between tabs on the arrow keys, and wraps', () => {
		const { tabs, reported } = render(config());
		tabs[0]?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
		);
		expect(tabs[1]?.getAttribute('aria-selected')).toBe('true');
		tabs[1]?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
		);
		expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
		expect(reported).toEqual([1, 0]);
	});

	it('leaves a key it does not own alone', () => {
		// One route in for the press itself: Enter and Space arrive at `click` by
		// bubbling, so there is no second code path for them to drift from.
		const { tabs, reported } = render(config());
		tabs[0]?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
		);
		expect(reported).toEqual([]);
	});

	it('does not leave focus inside the panel it just hid', () => {
		// `visibility: hidden` makes a control unfocusable, so focus would fall to
		// the body and the view would have nothing to restore.
		const { el, tabs, panels } = render(config());
		document.body.appendChild(el);
		const inside = panels[0]?.querySelector<HTMLInputElement>('.child-0');
		inside?.focus();
		expect(document.activeElement).toBe(inside);
		tabs[1]?.click();
		expect(panels[0]?.contains(document.activeElement)).toBe(false);
		el.remove();
	});
});

describe('a tab set the layout left empty', () => {
	it('draws its heading over a quiet empty region', () => {
		// A layout part-way through being built, not an error — the reading SPEC §6
		// takes for a declared trigger nothing binds to.
		const { el, heading, tabs } = render(config({ children: [] }), {
			regions: false,
		});
		expect(heading?.textContent).toBe('Pages');
		expect(el.querySelector('.sheetsmith-error')).toBeNull();
		expect(el.querySelector('.sheetsmith-tabset-empty')).not.toBeNull();

		// **The roles, not only the tabs.** `tabs` is `[role="tab"]`, so the
		// assertion this file had covered the buttons and said nothing about the
		// two things the criterion is actually about: an empty `tablist` is an
		// ARIA oddity, and a `tabpanel` with no tab to open it is another. Both
		// elements are skipped — `render` returns before building either — and
		// that is the claim worth holding, because a later edit that drew the
		// strip and stage first and filled them afterwards would leave both roles
		// present and empty while every assertion above still passed.
		expect(tabs).toHaveLength(0);
		expect(el.querySelector('[role="tablist"]')).toBeNull();
		expect(el.querySelector('[role="tabpanel"]')).toBeNull();
	});

	it('draws one tab where the layout has one, without complaining', () => {
		// A layout on its way to two. Refusing it would mean an author cannot build
		// the second tab first.
		const { tabs, panels } = render(
			config({ children: [child('only', 'Only')] }),
		);
		expect(tabs.map((tab) => tab.textContent)).toEqual(['Only']);
		expect(hidden(panels[0] as HTMLElement)).toBe(false);
	});
});
