// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Canvas, CanvasHost } from './canvas';
import { getComponent, listComponentTypes } from '../components';
import { Layout } from '../parse/layout';
import { ComponentConfig } from '../types';

/*
 * The canvas, driven directly rather than through the pane it lives in.
 *
 * `Canvas` needs only a `CanvasHost` and an element — it knows nothing about
 * the tree, the panel or which layout file is open — so a case here does not
 * have to open a whole `LayoutEditorSection` to exercise the render loop
 * itself. `layout-editor.test.ts` still drives the drag, resize and nudge
 * gestures through the rendered pane, since those already existed there and
 * the fixtures and helpers (`sheetGrid`, `dragTo`, `pressKey`) are built for
 * it; this file covers what is new here specifically — live rendering,
 * `inert`, the overlay's own shape, and the two hazard fixes.
 */

function fakeHost(selection = ''): CanvasHost & { selected: string } {
	const host = {
		selected: selection,
		persist: () => undefined,
		persistSoon: () => undefined,
		syncPositionFields: () => undefined,
		select(id: string) {
			host.selected = id;
		},
		get selection() {
			return host.selected;
		},
	};
	return host;
}

/**
 * A minimal component config, plus whatever a specific type's own fields the
 * caller adds — `Record<string, unknown>` rather than `Partial<ComponentConfig>`,
 * since these fixtures build several concrete config shapes (Table's `rows`
 * and `columns`, Card's `derived`) that the shared type does not name.
 */
function component(overrides: Record<string, unknown> = {}): ComponentConfig {
	return {
		id: 'x',
		type: 'card',
		label: 'X',
		position: { col: 1, row: 1, width: 2, height: 1 },
		...overrides,
	};
}

function layoutOf(...components: ComponentConfig[]): Layout {
	return { name: 'Canvas fixture', components };
}

describe('live rendering', () => {
	it('shows a Table\'s declared rows as real markup, not a labelled block', () => {
		const table = component({
			id: 'skills',
			type: 'table',
			label: 'Skills',
			position: { col: 1, row: 1, width: 4, height: 3 },
			rows: [{ label: 'Acrobatics' }, { label: 'Athletics' }],
			columns: [{ key: 'mod' }],
		});
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(table));

		const markup = el.querySelector('table');
		expect(markup).not.toBeNull();
		expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
		expect(el.textContent).toContain('Acrobatics');
		expect(el.textContent).toContain('Athletics');
	});

	it('draws a misconfigured component\'s own error in place', () => {
		const table = component({
			id: 'skills',
			type: 'table',
			label: 'Skills',
			columns: [{ key: 'mod' }, { key: 'mod' }],
		});
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(table));

		const error = el.querySelector('.sheetsmith-error');
		expect(error?.textContent).toContain('Skills');
		expect(error?.textContent).toContain('Two columns are both called "mod".');
	});

	it('fails a formula naming a component that does not exist, with the sheet\'s own message', () => {
		const card = component({
			id: 'armour_class',
			label: 'Armour class',
			derived: 'con + 1',
		});
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(card));

		// Card puts an unresolved formula's reason in the `title` of the value
		// it could not compute, rather than in visible text — the same message
		// the formula engine gives a sheet reading the identical expression.
		const titled = Array.from(el.querySelectorAll('[title]')).map((node) =>
			node.getAttribute('title'),
		);
		expect(titled.some((text) => text?.includes('Unknown name "con"'))).toBe(
			true,
		);
	});

	it('resolves a formula naming a component that does exist, against its empty value', () => {
		const con = component({ id: 'con', label: 'Constitution' });
		const card = component({
			id: 'armour_class',
			label: 'Armour class',
			derived: 'con + 1',
		});
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(con, card));

		expect(el.querySelector('.sheetsmith-error')).toBeNull();
	});

	/**
	 * A modifier column's own extra config, for whichever generic entry in a
	 * type loop happens to be a Table — the spec's own named example (§1's
	 * acceptance criteria: "a Table's modifier glyph") is a control a bare
	 * `component()` never renders, since that config carries no `columns` at
	 * all. `rows`/`columns` rather than a size or a data value: the glyph
	 * renders off the config alone (`table.ts`'s `enrolled.length === 0` is
	 * the empty state, not an absent one), which is exactly why it appears
	 * correctly even against the canvas's own `data: null` reads.
	 */
	const MODIFIER_COLUMN = {
		rows: [{ label: 'Row' }],
		columns: [{ key: 'Mod', type: 'modifier' }],
	};

	it('marks every live-rendered cell inert, for every registered component with a control', () => {
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		const components = listComponentTypes().map((type, index) =>
			component({
				id: `c${index}`,
				type,
				label: `C${index}`,
				position: { col: 1, row: index + 1, width: 4, height: 1 },
				...(type === 'table' ? MODIFIER_COLUMN : {}),
			}),
		);
		canvas.draw(el, layoutOf(...components));

		for (const config of components) {
			const definition = getComponent(config.type);
			if (!definition) continue;
			const overlay = el.querySelector(
				`[data-sheetsmith-focus="preview-${config.id}"]`,
			);
			const cell = overlay?.parentElement;
			const controls = cell?.querySelectorAll('input, button:not(.sheetsmith-canvas-overlay), select, textarea') ?? [];
			// A Table's modifier glyph specifically, so the spec's own named
			// example is not merely present among the generic controls above
			// but positively found and inert.
			if (config.type === 'table') {
				expect(cell?.querySelector('.sheetsmith-table-modifier-button')).not.toBeNull();
			}
			for (const control of Array.from(controls)) {
				expect(control.closest('[inert]')).not.toBeNull();
			}
		}
	});

	it('never calls onChange or opens a panel from an event dispatched inside the live content', () => {
		const card = component({ id: 'x', label: 'X' });
		const table = component({
			id: 'items',
			type: 'table',
			label: 'Items',
			position: { col: 1, row: 2, width: 4, height: 2 },
			...MODIFIER_COLUMN,
		});
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(card, table));

		const input = el.querySelector<HTMLInputElement>('.sheetsmith-card-input');
		expect(input).not.toBeNull();
		input?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		input?.dispatchEvent(new Event('click', { bubbles: true }));
		if (input) input.value = 'typed';
		input?.dispatchEvent(new Event('change', { bubbles: true }));

		// The modifier glyph itself, pressed directly — the one control the
		// spec names as what the anchored panel opens from.
		const glyph = el.querySelector<HTMLButtonElement>(
			'.sheetsmith-table-modifier-button',
		);
		expect(glyph).not.toBeNull();
		glyph?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		glyph?.dispatchEvent(new Event('click', { bubbles: true }));

		// Nothing threw, and no anchored panel — the surface a modifier glyph
		// would open — exists anywhere in the document.
		expect(document.querySelector('.sheetsmith-panel')).toBeNull();
	});
});

describe('the overlay\'s own shape', () => {
	it('is a sibling of the component\'s own rendered root, attached to the cell, for every registered type', () => {
		const host = fakeHost();
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		const components = listComponentTypes().map((type, index) =>
			component({
				id: `c${index}`,
				type,
				label: `C${index}`,
				position: { col: 1, row: index + 1, width: 4, height: 1 },
			}),
		);
		canvas.draw(el, layoutOf(...components));

		for (const config of components) {
			const overlay = el.querySelector(
				`[data-sheetsmith-focus="preview-${config.id}"]`,
			);
			expect(overlay).not.toBeNull();
			expect(overlay?.classList.contains('sheetsmith-canvas-overlay')).toBe(
				true,
			);
			expect(overlay?.parentElement?.classList.contains('sheetsmith-cell')).toBe(
				true,
			);
		}
	});
});

describe('a covered component\'s handles, when selected', () => {
	it('raises the selected overlay above an unselected, later sibling, and leaves a third sibling\'s own order with it untouched', () => {
		/*
		 * A third component, `other`, is what makes "the covering sibling's
		 * own z-order relative to the *other*, unselected sibling is
		 * unchanged" (`docs/features/grid-canvas.md` §2) provable at all: with
		 * only `behind`/`front`, raising the selected one is the only thing
		 * there is to see, and a version that raised *every* selected-adjacent
		 * cell, or reordered the DOM instead of adding one class, would still
		 * pass. `front` and `other` are both unselected, so neither should
		 * carry the raise, and the stacking between them — which is document
		 * order, since neither is raised — has to be exactly the order they
		 * were drawn in.
		 */
		const behind = component({ id: 'behind', label: 'Behind' });
		const front = component({ id: 'front', label: 'Front' });
		const other = component({ id: 'other', label: 'Other' });
		const host = fakeHost('behind');
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(behind, front, other));

		const behindOverlay = el.querySelector('[data-sheetsmith-focus="preview-behind"]');
		const frontOverlay = el.querySelector('[data-sheetsmith-focus="preview-front"]');
		const otherOverlay = el.querySelector('[data-sheetsmith-focus="preview-other"]');
		expect(behindOverlay?.classList.contains('sheetsmith-preview-editing')).toBe(
			true,
		);
		expect(frontOverlay?.classList.contains('sheetsmith-preview-editing')).toBe(
			false,
		);
		expect(otherOverlay?.classList.contains('sheetsmith-preview-editing')).toBe(
			false,
		);

		// Neither carries the raise, so their paint order is document order —
		// exactly the order they were drawn in, untouched by `behind`'s own.
		const ids = Array.from(
			el.querySelectorAll('[data-sheetsmith-focus^="preview-"]'),
		).map((overlay) => overlay.getAttribute('data-sheetsmith-focus'));
		expect(ids.indexOf('preview-front')).toBeLessThan(
			ids.indexOf('preview-other'),
		);
	});
});

describe('selecting inside a Tab set', () => {
	function tabbed(): ComponentConfig {
		return component({
			id: 'pages',
			type: 'tab-set',
			label: 'Pages',
			position: { col: 1, row: 1, width: 6, height: 2 },
			children: [
				component({ id: 'combat', label: 'Combat', position: { col: 1, row: 1, width: 6, height: 2 } }),
				component({
					id: 'spells',
					label: 'Spells',
					position: { col: 1, row: 1, width: 6, height: 2 },
				}),
			],
		});
	}

	it('switches the active tab to the one holding the selection, and the overlay becomes reachable', () => {
		const host = fakeHost('spells');
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(tabbed()));

		const tabs = Array.from(el.querySelectorAll('.sheetsmith-tabset-tab'));
		expect(tabs[1]?.classList.contains('is-active')).toBe(true);
		expect(tabs[0]?.classList.contains('is-active')).toBe(false);

		const overlay = el.querySelector('[data-sheetsmith-focus="preview-spells"]');
		expect(overlay).not.toBeNull();
		expect(overlay?.closest('[inert]')).toBeNull();
	});

	it('leaves an inactive tab inert when nothing inside it is selected', () => {
		const host = fakeHost('pages');
		const canvas = new Canvas(host);
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(tabbed()));

		const overlay = el.querySelector('[data-sheetsmith-focus="preview-spells"]');
		expect(overlay?.closest('[inert]')).not.toBeNull();
	});
});
