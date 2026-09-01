// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Canvas, CanvasHost } from './canvas';
import { getComponent, listComponentTypes } from '../components';
import { Layout } from '../parse/layout';
import { ComponentConfig, isContainer } from '../types';

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

/**
 * A host, with sample values **off** unless a case asks for them.
 *
 * The opposite of the pane's own default, and deliberately: every case in this
 * file is about the render loop, the overlay, `inert` or the tab set, and each
 * was written against the empty canvas those questions are cleanest on. Leaving
 * them empty is also the standing proof of one of the feature's own criteria —
 * with sample values off the canvas is byte-for-byte what it was before
 * `sample` existed — so the sample cases below pass `true` where they mean it.
 */
function fakeHost(
	selection = '',
	sampleValues = false,
): CanvasHost & { selected: string; samples: boolean } {
	const host = {
		selected: selection,
		samples: sampleValues,
		persist: () => undefined,
		persistSoon: () => undefined,
		syncPositionFields: () => undefined,
		select(id: string) {
			host.selected = id;
		},
		get selection() {
			return host.selected;
		},
		get sampleValues() {
			return host.samples;
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
		// **Both states**, because a filled cell invites the press an empty one
		// did not: `docs/features/preview-sample-values.md` §1 keeps every live
		// component inert with values in it, and this is that criterion re-run
		// against a filled canvas rather than a fresh case beside it.
		for (const samples of [false, true]) {
			const host = fakeHost('', samples);
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
		}
	});

	it('never calls onChange or opens a panel from an event dispatched inside the live content', () => {
		// Both states, on the inert sweep's own argument.
		for (const samples of [false, true]) {
			const card = component({ id: 'x', label: 'X' });
			const table = component({
				id: 'items',
				type: 'table',
				label: 'Items',
				position: { col: 1, row: 2, width: 4, height: 2 },
				...MODIFIER_COLUMN,
			});
			const host = fakeHost('', samples);
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
		}
	});
});

describe('the canvas filled with sample values', () => {
	/*
	 * `docs/features/preview-sample-values.md` §1: the same canvas with a
	 * different data source. What is asserted here is the *rendered* result
	 * rather than the data behind it — a sample that never reached a card
	 * would pass every check in `contract.test.ts` and draw nothing.
	 */

	// One case below spies on the registry's own definitions, which are shared
	// module state: left mocked, every later file in the run would be reading
	// through a stub.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('draws a stored value in a card, and resolves a sibling\'s formula against it', () => {
		const con = component({ id: 'con', label: 'Constitution' });
		const card = component({
			id: 'armour_class',
			label: 'Armour class',
			position: { col: 1, row: 2, width: 2, height: 1 },
			derived: 'con + 1',
		});
		const canvas = new Canvas(fakeHost('', true));
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(con, card));

		const stored = el.querySelector<HTMLInputElement>(
			'[data-sheetsmith-focus="preview-con"] ~ * .sheetsmith-card-input',
		);
		const value = Number(stored?.value);
		expect(value).toBeGreaterThan(1);
		// The formula resolves against the sibling's sample rather than against
		// a blank, which is the whole of what a preview is for: the derived
		// number on the canvas is one more than what the card beside it holds.
		expect(el.textContent).toContain(String(value + 1));
	});

	it('does not draw one number repeated down a column of cards', () => {
		/*
		 * The failure the seeding exists to prevent, at the surface it happens on:
		 * a component sees only its own config, so unseeded filler makes every
		 * plain Card in a layout hold the first number of the sequence. Six cards
		 * all reading 14 is a canvas a formula cannot be judged against — and no
		 * per-component test can see it, because each card is correct on its own.
		 */
		const cards = ['str', 'dex', 'con', 'int', 'wis'].map((id, index) =>
			component({
				id,
				label: id.toUpperCase(),
				position: { col: 1, row: index + 1, width: 2, height: 1 },
			}),
		);
		const el = document.createElement('div');
		new Canvas(fakeHost('', true)).draw(el, layoutOf(...cards));

		const values = Array.from(
			el.querySelectorAll<HTMLInputElement>('.sheetsmith-card-input'),
		).map((input) => input.value);
		expect(values).toHaveLength(cards.length);
		expect(new Set(values).size).toBeGreaterThan(1);
	});

	it('draws a table\'s declared rows, the rows a character would add, and their total', () => {
		const items = component({
			id: 'items',
			type: 'table',
			label: 'Items',
			position: { col: 1, row: 1, width: 6, height: 3 },
			rowHeader: 'Item',
			rows: [{ label: 'Rope' }],
			columns: [{ key: 'Weight', type: 'number', total: true }],
			openRows: true,
		});
		const canvas = new Canvas(fakeHost('', true));
		const el = document.createElement('div');
		canvas.draw(el, layoutOf(items));

		// The declared row is static text; a row the character owns is drawn as
		// an editable name, so the two are read off different things.
		expect(el.textContent).toContain('Rope');
		// One declared row, two the sample added, and the add-row control's own
		// line, which an open table draws whatever is in it.
		expect(el.querySelectorAll('tbody tr')).toHaveLength(4);
		const cells = Array.from(el.querySelectorAll<HTMLInputElement>('tbody input'));
		expect(cells.map((input) => input.value)).toContain('Item 1');
		const weights = cells
			.map((input) => Number(input.value))
			.filter((one) => Number.isFinite(one));
		expect(weights.every((one) => one > 0)).toBe(true);
		const sum = weights.reduce((total, one) => total + one, 0);
		expect(el.querySelector('tfoot')?.textContent).toContain(String(sum));
	});

	it('leaves every component empty with sample values off, and fills the ones that have a sample', () => {
		/*
		 * Both halves of §4 in one sweep, over the whole registry: with sample
		 * values off the canvas is what it was before this existed, and with
		 * them on exactly the components that declare a sample change. Image and
		 * the two containers declare none and so draw identically either way,
		 * which is visible mixed-ness and the honest reading — a component that
		 * needs a vault has nothing to show without one.
		 */
		const components = listComponentTypes().map((type, index) =>
			component({
				id: `c${index}`,
				type,
				label: `C${index}`,
				position: { col: 1, row: index + 1, width: 4, height: 1 },
				// A table with no column has nothing a sample could fill: the row
				// names are the layout's own and are drawn either way.
				...(type === 'table'
					? { rows: [{ label: 'Row' }], columns: [{ key: 'Qty', type: 'number' }] }
					: {}),
				...(type === 'track' ? { count: 6 } : {}),
				...(type === 'card-set' ? { entries: [{ key: 'STR' }] } : {}),
			}),
		);
		const drawn = (samples: boolean): Map<string, string> => {
			const el = document.createElement('div');
			new Canvas(fakeHost('', samples)).draw(el, layoutOf(...components));
			return new Map(
				components.map((config) => {
					const cell = el
						.querySelector(`[data-sheetsmith-focus="preview-${config.id}"]`)
						?.parentElement;
					// The values a control holds are not in `innerHTML`, so both
					// go into the comparison — an input's value is exactly what a
					// sample changes on a card.
					const values = Array.from(cell?.querySelectorAll('input') ?? [])
						.map((input) => input.value)
						.join('|');
					return [config.id, `${cell?.innerHTML ?? ''}${values}`];
				}),
			);
		};
		const empty = drawn(false);
		const filled = drawn(true);
		const changed = components
			.filter((config) => empty.get(config.id) !== filled.get(config.id))
			.map((config) => config.type);
		expect(changed.sort()).toEqual(
			listComponentTypes()
				.filter((type) => getComponent(type)?.sample !== undefined)
				.sort(),
		);
		// The floor: a sweep that drew nothing at all would agree with itself.
		expect(changed.length).toBeGreaterThan(5);
	});

	it('hands every component an empty body with sample values off', () => {
		/*
		 * The claim the off/on sweep above cannot make. That one says the two
		 * states differ where a sample exists; this says what the *off* state
		 * actually passes — an empty section, exactly as a fresh note's is — which
		 * is the thing a stray `sample(config)` on the wrong side of the gate
		 * would break while every rendered comparison still passed, because a
		 * component's own filler renders perfectly well.
		 *
		 * Spied on the registry's own definitions, since `readForCanvas` is
		 * private and the body it passes is visible nowhere else.
		 */
		const components = listComponentTypes().map((type, index) =>
			component({
				id: `c${index}`,
				type,
				label: `C${index}`,
				position: { col: 1, row: index + 1, width: 4, height: 1 },
			}),
		);
		const bodies: string[] = [];
		for (const type of listComponentTypes()) {
			const definition = getComponent(type);
			if (!definition || isContainer(definition)) continue;
			vi.spyOn(definition, 'read').mockImplementation((body) => {
				bodies.push(body);
				return { ok: true, data: null };
			});
		}
		const el = document.createElement('div');
		new Canvas(fakeHost('', false)).draw(el, layoutOf(...components));

		// The floor: one read per component that has a section at all. Without it
		// a canvas that had stopped reading anything would satisfy the assertion
		// below by collecting nothing.
		const reading = listComponentTypes().filter(
			(type) => !isContainer(getComponent(type)),
		);
		expect(bodies).toHaveLength(reading.length);
		expect(bodies.every((body) => body === '')).toBe(true);
	});

	it('draws a broken config\'s own error, with the same message either way', () => {
		const broken = component({
			id: 'skills',
			type: 'table',
			label: 'Skills',
			columns: [{ key: 'mod' }, { key: 'mod' }],
		});
		const messages = [false, true].map((samples) => {
			const el = document.createElement('div');
			new Canvas(fakeHost('', samples)).draw(el, layoutOf(broken));
			return el.querySelector('.sheetsmith-error')?.textContent;
		});
		expect(messages[0]).toContain('Two columns are both called "mod".');
		expect(messages[1]).toBe(messages[0]);
	});

	it('still fails a formula naming a component that does not exist', () => {
		// The failure comes from the structural name table and never from stored
		// data, so filling the canvas must not change it.
		const card = component({ id: 'armour_class', label: 'AC', derived: 'con + 1' });
		const el = document.createElement('div');
		new Canvas(fakeHost('', true)).draw(el, layoutOf(card));
		const titled = Array.from(el.querySelectorAll('[title]')).map((node) =>
			node.getAttribute('title'),
		);
		expect(titled.some((text) => text?.includes('Unknown name "con"'))).toBe(true);
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
