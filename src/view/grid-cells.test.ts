// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GridComponent, renderGrid } from './grid-cells';
import { parseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { ComponentConfig, ComponentDefinition, RenderContext } from '../types';

/*
 * The grid the sheet is drawn on: which element each component's cell lands in,
 * in what order, and what a cell holds when the component cannot be drawn.
 *
 * This is the loop the sheet view and the harness both used to carry a copy of.
 * `PATTERNS.md` §1 allows two copies only with a test driving both, and neither
 * could be driven — the view's lived inside `SheetView.renderSheet`, which needs
 * a workspace, and the harness's is a page script that reads its stage element
 * on import. So the loop moved here, where one test reaches what no test could
 * reach in either host, and both hosts provably call it.
 *
 * What is asserted is the *tree*, not the paint: depth, order, and which cell
 * each child sits in. That is the part a divergence between the two hosts would
 * have shown up in, and the part appearance review in the harness would then
 * have signed off on for a nesting the app never produces.
 */

/** A leaf that records where it was drawn, so the tree can be read back. */
function marker(type: string): ComponentDefinition {
	return {
		type,
		storage: 'fenced',
		formulaFields: [],
		configFields: [],
		read: () => ({ ok: true, data: null }),
		write: (_data, body) => body ?? '',
		render: (container, config) => {
			container.dataset.drew = config.id;
		},
	};
}

/**
 * A container that draws its children wherever the grid offers, which is what a
 * Group does. Registered under its own type so the registry answers `'none'`
 * for it and `undrawableMessage` lets its children through.
 */
const CONTAINER = 'group';

function context(): (entry: {
	config: ComponentConfig;
}) => Omit<RenderContext, 'renderChildren' | 'childRegions'> {
	return () => ({
		resolved: {},
		resolveField: () => null,
		onChange: () => undefined,
	});
}

/**
 * Draw a layout, and read the cell tree back as one string per cell.
 *
 * Each line is the cell's depth in `.sheetsmith-cell` ancestry, its grid
 * placement, and what was drawn in it — so order, nesting and placement are all
 * in one comparable value.
 */
function tree(source: string, components?: readonly GridComponent[]): string[] {
	const layout = parseLayout(source);
	const walk = walkComponents(layout.components);
	const entries: readonly GridComponent[] =
		components ??
		walk.map(({ config }) => ({
			config,
			component:
				config.type === CONTAINER
					? group()
					: config.type === ALTERNATIVES
						? alternatives()
						: marker(config.type),
			data: null,
			error: null,
		}));

	const root = document.createElement('div');
	document.body.replaceChildren(root);
	renderGrid(root, walk, entries, context());

	return Array.from(root.querySelectorAll('.sheetsmith-cell')).map((cell) => {
		let depth = 0;
		for (let up = cell.parentElement; up; up = up.parentElement) {
			if (up.classList.contains('sheetsmith-cell')) depth++;
		}
		const el = cell as HTMLElement;
		const drew =
			el.dataset.drew ??
			(el.querySelector('.sheetsmith-error') !== null ? 'ERROR' : '—');
		return `${'  '.repeat(depth)}${drew} @ ${el.style.gridColumn} / ${el.style.gridRow}`;
	});
}

/** A container definition: `storage: 'none'`, and it fills what it is offered. */
function group(): ComponentDefinition {
	return {
		type: CONTAINER,
		storage: 'none',
		formulaFields: [],
		configFields: [],
		read: () => ({ ok: true, data: null }),
		write: (_data, body) => body ?? '',
		render: (container, config, _data, ctx) => {
			container.dataset.drew = config.id;
			ctx.renderChildren?.(container);
		},
	};
}

/**
 * A container that shows one child at a time, which is what a Tab set does. It
 * reaches its children through `childRegions` rather than `renderChildren`, and
 * gives each one an element of its own.
 */
const ALTERNATIVES = 'tab-set';

function alternatives(): ComponentDefinition {
	return {
		type: ALTERNATIVES,
		storage: 'none',
		formulaFields: [],
		configFields: [],
		read: () => ({ ok: true, data: null }),
		write: (_data, body) => body ?? '',
		render: (container, config, _data, ctx) => {
			container.dataset.drew = config.id;
			for (const draw of ctx.childRegions ?? []) {
				const panel = container.ownerDocument.createElement('div');
				// A data attribute rather than a class: every class the plugin
				// adds carries the `sheetsmith-` prefix and `styles.test.ts`
				// checks it over the source, so a stand-in inventing one fails
				// that guard — correctly, since it cannot tell a fake from a real
				// one.
				panel.dataset.panel = '';
				container.appendChild(panel);
				draw(panel);
			}
		},
	};
}

const NESTED = JSON.stringify({
	name: 'L',
	components: [
		// File order and grid order disagree, so the walk is doing real work.
		{
			id: 'trailing',
			type: 'stat',
			label: 'Trailing',
			position: { col: 1, row: 3, width: 2, height: 1 },
		},
		{
			id: 'outer',
			type: CONTAINER,
			label: 'Outer',
			position: { col: 1, row: 2, width: 6, height: 2 },
			children: [
				{
					id: 'inner',
					type: CONTAINER,
					label: 'Inner',
					position: { col: 4, row: 1, width: 3, height: 1 },
					children: [
						{
							id: 'deep',
							type: 'stat',
							label: 'Deep',
							position: { col: 1, row: 1, width: 3, height: 1 },
						},
					],
				},
				{
					id: 'beside',
					type: 'stat',
					label: 'Beside',
					position: { col: 1, row: 1, width: 3, height: 1 },
				},
			],
		},
		{
			id: 'leading',
			type: 'stat',
			label: 'Leading',
			position: { col: 1, row: 1, width: 2, height: 1 },
		},
	],
});

describe('renderGrid', () => {
	it('draws each level in grid order, a container\'s children inside its cell', () => {
		// The whole claim in one value. `beside` is at column 1 of the outer
		// group and `inner` at column 4, so grid order puts `beside` first
		// despite the file listing `inner` first — and `deep` sits two cells
		// down, inside `inner`, inside `outer`.
		expect(tree(NESTED)).toEqual([
			'leading @ 1 / span 2 / 1 / span 1',
			'outer @ 1 / span 6 / 2 / span 2',
			'  beside @ 1 / span 3 / 1 / span 1',
			'  inner @ 4 / span 3 / 1 / span 1',
			'    deep @ 1 / span 3 / 1 / span 1',
			'trailing @ 1 / span 2 / 3 / span 1',
		]);
	});

	it('places a child on its own grid, not on the sheet\'s', () => {
		// `deep` is column 1 of a 3-wide inner grid, and `inner` is column 4 of
		// the outer group. A child placed against the sheet would land at 4.
		const drawn = tree(NESTED);
		expect(drawn).toContain('    deep @ 1 / span 3 / 1 / span 1');
		// One subgrid per container that has children, each carrying the
		// container's own width and height.
		const scopes = Array.from(
			document.querySelectorAll('.sheetsmith-subgrid > .sheetsmith-grid'),
		).map((el) => (el as HTMLElement).style.cssText.replace(/\s+/g, ' ').trim());
		expect(scopes).toHaveLength(2);
		expect(scopes[0]).toContain('--sheetsmith-columns: 6');
		expect(scopes[1]).toContain('--sheetsmith-columns: 3');
	});

	it('marks the cell as well as printing the message when a read failed', () => {
		// The mark and the message together: the two hosts had drifted on the
		// mark, so the harness drew error cells without the one `.sheetsmith-cell`
		// rule the stylesheet has.
		const layout = parseLayout(NESTED);
		const walk = walkComponents(layout.components);
		const entries = walk.map(({ config }) => ({
			config,
			component: config.type === CONTAINER ? group() : marker(config.type),
			data: null,
			error: config.id === 'leading' ? 'the fence is not closed' : null,
		}));
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		renderGrid(root, walk, entries, context());

		const failed = root.querySelector('.sheetsmith-cell-error');
		expect(failed).not.toBeNull();
		expect(failed?.querySelector('.sheetsmith-error')?.textContent).toBe(
			'Leading: the fence is not closed',
		);
		// One cell, and everything else still drew.
		expect(root.querySelectorAll('.sheetsmith-cell-error')).toHaveLength(1);
		expect(root.querySelector('[data-drew="deep"]')).not.toBeNull();
	});

	it('draws nothing inside a component that cannot hold components', () => {
		// A hand-edited layout can put cards inside a Stat: the parser accepts
		// it, the registry refuses it, and the children are not drawn — because
		// only a component says where its region goes.
		const source = JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'holder',
					type: 'stat',
					label: 'Holder',
					position: { col: 1, row: 1, width: 4, height: 1 },
					children: [
						{
							id: 'buried',
							type: 'stat',
							label: 'Buried',
							position: { col: 1, row: 1, width: 2, height: 1 },
						},
					],
				},
			],
		});
		const drawn = tree(source);
		expect(drawn).toEqual(['ERROR @ 1 / span 4 / 1 / span 1']);
		expect(document.querySelector('[data-drew="buried"]')).toBeNull();
	});

	it('names the type when the registry does not have one', () => {
		const source = JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'ghost',
					type: 'no-such-type',
					label: 'Ghost',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
			],
		});
		const layout = parseLayout(source);
		const walk = walkComponents(layout.components);
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		renderGrid(
			root,
			walk,
			walk.map(({ config }) => ({
				config,
				component: undefined,
				data: null,
				error: null,
			})),
			context(),
		);
		expect(root.querySelector('.sheetsmith-error')?.textContent).toContain(
			'no-such-type',
		);
	});

	it('offers no children callback to a container the layout left empty', () => {
		// What lets a container tell an empty region from one it was not asked
		// to draw, which is how an empty Group knows to say so.
		const source = JSON.stringify({
			name: 'L',
			components: [
				{
					id: 'bare',
					type: CONTAINER,
					label: 'Bare',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
			],
		});
		let offered: boolean | null = null;
		const layout = parseLayout(source);
		const walk = walkComponents(layout.components);
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		renderGrid(
			root,
			walk,
			walk.map(({ config }) => ({
				config,
				component: {
					...group(),
					render: (_container, _config, _data, ctx) => {
						offered = ctx.renderChildren !== undefined;
					},
				},
				data: null,
				error: null,
			})),
			context(),
		);
		expect(offered).toBe(false);
		expect(root.querySelector('.sheetsmith-subgrid')).toBeNull();
	});

	it('hands a host its own entry, not a copy of it', () => {
		// The harness writes a re-read section back into the entry it was given,
		// so a copy here would leave that write landing nowhere.
		const layout = parseLayout(NESTED);
		const walk = walkComponents(layout.components);
		const entries = walk.map(({ config }) => ({
			config,
			component: config.type === CONTAINER ? group() : marker(config.type),
			data: null,
			error: null,
		}));
		const seen: unknown[] = [];
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		renderGrid(root, walk, entries, (entry) => {
			seen.push(entry);
			return {
				resolved: {},
				resolveField: () => null,
				onChange: () => undefined,
			};
		});
		for (const entry of seen) expect(entries).toContain(entry);
	});
});

/*
 * That both hosts still draw through `renderGrid` and nothing else.
 *
 * The tests above prove the shared renderer is right. This proves it is the only
 * one — which is the half that decays, because nothing stops a later edit
 * rebuilding a local loop in either host and nothing would fail if it did. That
 * pair has diverged three times: `publishedComponent` exists for the first,
 * `componentsInside` records the second in its own doc comment, and the third
 * was the sheet view marking a failed cell where the harness did not.
 *
 * Each of those took reading two files side by side to see, which is what
 * §10 means by a failure invisible in review — so the guard is the fix and the
 * check at once. Written against the imports and the quoted class names rather
 * than the whole source text, because both are unambiguous: prose in a comment
 * can name `.sheetsmith-cell` without meaning it, an import cannot.
 */
describe('the grid has one renderer', () => {
	// Relative paths rather than URLs, because `it.each` serialises what it is
	// given and a URL does not survive the round trip.
	const HOSTS = ['./sheet-view.ts', '../../harness/harness.ts'] as const;

	/** What a host takes from `grid-cells`, as written. */
	function imported(source: string): string[] {
		const match = /import \{([^}]*)\} from '[^']*grid-cells';/.exec(source);
		return (match?.[1] ?? '')
			.split(',')
			.map((name) => name.trim())
			.filter((name) => name !== '');
	}

	it.each(HOSTS)('%s draws through renderGrid alone', (host) => {
		const source = readFileSync(new URL(host, import.meta.url), 'utf8');
		// A path that stopped resolving would read an empty string and pass
		// everything below by having nothing in it.
		expect(source.length).toBeGreaterThan(2000);

		// The only thing it may take from the grid module. Taking `placeCell` or
		// `openSubgrid` is how a second loop starts, and taking
		// `componentsInside` is how a second descent does.
		expect(imported(source)).toEqual(['renderGrid']);

		// Once, at the root. Twice would mean a level being drawn by hand.
		expect(source.match(/renderGrid\(/g)).toHaveLength(1);

		// And it builds no cell of its own. Quoted, so a comment mentioning the
		// class is not a failure.
		for (const owned of ['sheetsmith-cell', 'sheetsmith-subgrid']) {
			expect(source).not.toContain(`'${owned}'`);
			expect(source).not.toContain(`"${owned}"`);
			expect(source).not.toContain(`\`${owned}\``);
		}
	});
});

describe('a container that shows one child at a time', () => {
	/*
	 * The `childRegions` half of containment, tested where it is wired rather
	 * than only against a stand-in in the component's own file. Three things are
	 * the grid's to get right and none of them is visible from inside a
	 * component: that each child lands in the element the container chose, that
	 * such a child gets a cell of its own so `cell-focus.ts` can still find it,
	 * and that a container tab opens its subgrid at the *tab set's* placement
	 * rather than its own — the one exception to a container's inner grid being
	 * its own placement (SPEC §4.2).
	 */
	const TABS = JSON.stringify({
		name: 'T',
		components: [
			{
				id: 'pages',
				type: 'tab-set',
				label: 'Pages',
				position: { col: 2, row: 1, width: 4, height: 3 },
				children: [
					{
						id: 'first',
						type: 'stat',
						label: 'First',
						// Deliberately a placement that means nothing: a tab fills
						// the panel, so none of these four numbers may reach the DOM.
						position: { col: 5, row: 9, width: 1, height: 1 },
					},
					{
						id: 'second',
						type: 'group',
						label: 'Second',
						position: { col: 6, row: 7, width: 1, height: 1 },
						children: [
							{
								id: 'inside',
								type: 'stat',
								label: 'Inside',
								position: { col: 2, row: 2, width: 2, height: 1 },
							},
						],
					},
				],
			},
		],
	});

	it('draws every child into the element the container chose', () => {
		// Every one, not only the visible one: hiding changes what the reader
		// sees, never what the sheet computes.
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const layout = parseLayout(TABS);
		const walk = walkComponents(layout.components);
		renderGrid(
			root,
			walk,
			walk.map(({ config }) => ({
				config,
				component:
					config.type === 'tab-set'
						? alternatives()
						: config.type === 'group'
							? group()
							: marker(config.type),
				data: null,
				error: null,
			})),
			context(),
		);
		const panels = Array.from(root.querySelectorAll('[data-panel]'));
		expect(panels).toHaveLength(2);
		expect(
			panels.map(
				(panel) =>
					panel.querySelector<HTMLElement>('.sheetsmith-cell')?.dataset.drew,
			),
		).toEqual(['first', 'second']);
	});

	it('tells such a child its name is already shown, and a placed child nothing', () => {
		// The twin of the placement rule, read for chrome: a child a container
		// shows one at a time has no heading of its own either, because the strip
		// above it is drawn from the same label. Asserted on what the grid
		// *passes*, which is what a component cannot test for itself — and what
		// hand-written `hideLabel` flags in both fixtures were standing in for.
		//
		// Written first against the rendered heading, which was vacuous: the
		// stand-in container in this file draws no heading, so the absence of one
		// proved nothing. Recording the flag is the only honest form.
		const seen = new Map<string, boolean | undefined>();
		/**
		 * The two container kinds and a leaf, each recording what it was told.
		 *
		 * Mirrors the registry deliberately: written first with `storage: 'fenced'`
		 * on the tab set, which made `undrawableMessage` refuse it as a component
		 * holding a value handed components — so its tabs never drew and the
		 * assertion below failed for a reason that had nothing to do with the rule.
		 * And each kind reaches for one half of containment, as the real ones do,
		 * rather than both.
		 */
		const recorder = (type: string): ComponentDefinition => ({
			type,
			storage: type === 'stat' ? 'fenced' : 'none',
			...(type === ALTERNATIVES ? { showsOneChild: true } : {}),
			formulaFields: [],
			configFields: [],
			read: () => ({ ok: true, data: null }),
			write: (_data, body) => body ?? '',
			render: (container, config, _data, ctx) => {
				seen.set(config.id, ctx.parentShowsLabel);
				container.dataset.drew = config.id;
				if (type === ALTERNATIVES) {
					for (const draw of ctx.childRegions ?? []) {
						const panel = container.ownerDocument.createElement('div');
						panel.dataset.panel = '';
						container.appendChild(panel);
						draw(panel);
					}
					return;
				}
				ctx.renderChildren?.(container);
			},
		});

		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const layout = parseLayout(TABS);
		const walk = walkComponents(layout.components);
		renderGrid(
			root,
			walk,
			walk.map(({ config }) => ({
				config,
				component: recorder(config.type),
				data: null,
				error: null,
			})),
			context(),
		);

		// The tab set itself is placed on the sheet, so nothing above it has
		// drawn its name.
		expect(seen.get('pages')).toBeUndefined();
		// Its two tabs are named by the strip.
		expect(seen.get('first')).toBe(true);
		expect(seen.get('second')).toBe(true);
		// And the leaf inside the second tab is placed on that tab's own grid,
		// so nothing has named it — the flag must not leak down a level.
		expect(seen.get('inside')).toBeUndefined();
	});

	it('gives such a child a cell with no placement on it', () => {
		// A `.sheetsmith-cell`, because `cell-focus.ts` counts those to put focus
		// back after a rebuild and a child outside the count loses the caret on
		// every commit. With no grid coordinates, because the panel it fills *is*
		// the container's placement — so the child's own four numbers, which the
		// fixture sets to nonsense on purpose, must not reach the DOM.
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const layout = parseLayout(TABS);
		const walk = walkComponents(layout.components);
		renderGrid(
			root,
			walk,
			walk.map(({ config }) => ({
				config,
				component:
					config.type === 'tab-set'
						? alternatives()
						: config.type === 'group'
							? group()
							: marker(config.type),
				data: null,
				error: null,
			})),
			context(),
		);
		const cell = root
			.querySelector('[data-panel]')
			?.querySelector<HTMLElement>('.sheetsmith-cell');
		expect(cell?.dataset.drew).toBe('first');
		expect(cell?.style.gridColumn).toBe('');
		expect(cell?.style.gridRow).toBe('');
	});

	it('opens a container tab\'s own grid at the tab set\'s placement', () => {
		// The exception, and the reason it is threaded through the grid rather
		// than left to each container: the tab set is 4 columns wide and the Group
		// that is its second tab declares 1, so an inner grid taking the child's
		// own width would put a one-column grid inside a four-column panel and a
		// card inside a tab would stop being the size of the same card outside it.
		const root = document.createElement('div');
		document.body.replaceChildren(root);
		const layout = parseLayout(TABS);
		const walk = walkComponents(layout.components);
		renderGrid(
			root,
			walk,
			walk.map(({ config }) => ({
				config,
				component:
					config.type === 'tab-set'
						? alternatives()
						: config.type === 'group'
							? group()
							: marker(config.type),
				data: null,
				error: null,
			})),
			context(),
		);
		const inner = root.querySelectorAll<HTMLElement>('.sheetsmith-grid');
		expect(inner).toHaveLength(1);
		expect(
			inner[0]?.style.getPropertyValue('--sheetsmith-columns'),
		).toBe('4');
		expect(inner[0]?.style.gridTemplateRows).toBe('repeat(3, minmax(0, 1fr))');
	});
});
