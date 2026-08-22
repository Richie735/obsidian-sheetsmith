/*
 * The DOM shape of the sheet's grid: a cell per component, and a grid of its own
 * inside a container.
 *
 * Two functions rather than a comment, because two callers build this — the
 * sheet view and the harness — and they must not disagree. The harness is how
 * appearance is reviewed, so a harness that nested differently from the view
 * would sign off on a layout the plugin never produces. That is the same reason
 * `publishedComponent` exists in `formula/sheet.ts`, where the two had already
 * drifted once.
 *
 * What is shared is exactly the part that is invisible in review: which class
 * names carry the grid, which element carries `container-type`, and that an
 * inner grid is the container's own placement. The recursion around
 * them stays with each caller, because each has its own answer to what goes in a
 * cell and what to do when a section will not read.
 *
 * No `obsidian` import: the harness has no app, so Obsidian's `createDiv` does
 * not exist there.
 */

import { componentsInside, WalkEntry } from '../parse/layout-walk';
import {
	getComponent,
	undrawableMessage,
	unknownComponentMessage,
} from '../components';
import {
	ComponentConfig,
	ComponentDefinition,
	GridPosition,
	placesChildren,
	RenderContext,
} from '../types';

/**
 * A cell at its configured position.
 *
 * Explicit `grid-column` and `grid-row` make DOM order invisible while the grid
 * holds — and DOM order is still what decides tab order, and the sequence the
 * narrow reflow falls back to once the grid is dropped.
 */
export function placeCell(
	into: HTMLElement,
	position: GridPosition,
): HTMLElement {
	const cell = into.ownerDocument.createElement('div');
	cell.classList.add('sheetsmith-cell');
	cell.style.gridColumn = `${position.col} / span ${position.width}`;
	cell.style.gridRow = `${position.row} / span ${position.height}`;
	into.appendChild(cell);
	return cell;
}

/**
 * A cell with no placement, filling whatever it was put in.
 *
 * For a child a container shows one at a time: it has no position of its own,
 * because the panel it fills is the container's own placement (SPEC §4.2). It is
 * still a `.sheetsmith-cell`, which is not decoration — `cell-focus.ts` counts
 * those to put focus back after a rebuild, so a child outside the count would
 * lose the caret on every commit.
 */
export function fillCell(into: HTMLElement): HTMLElement {
	const cell = into.ownerDocument.createElement('div');
	cell.classList.add('sheetsmith-cell');
	into.appendChild(cell);
	return cell;
}

/**
 * Which placement governs a component's own inner grid.
 *
 * A component's own, except inside a container that shows one child at a time —
 * there the child fills the container's region, so the container's placement is
 * the box and the child's four numbers are read by nothing (SPEC §4.2).
 *
 * **Exported because three drawings need this answer and must not each derive
 * it.** The sheet and the harness get it through `renderGrid` below; the layout
 * editor's schematic of a container's children is the third, and it had its own
 * copy — `config.position.width`, which is the number the add row copied off the
 * parent when the child was created and which nothing keeps in step. Resize the
 * tab set afterwards and the sheet laid the children out on the new width while
 * the editor drew them, described them and clamped every drag to the stale one,
 * so a block placed in the editor landed somewhere else on the sheet. That is
 * §1's "share the application, not the number", and the copy nobody was watching
 * was the editor's.
 *
 * One level is enough, and the depth rule is why: a container that shows one
 * child at a time can never itself be such a child, since its own tabs would be
 * the third container and `parseLayout` refuses that. So a parent's own position
 * is always its real box, and this never has to look further up.
 */
export function innerPlacement(
	child: ComponentConfig,
	parent: ComponentConfig | null,
): GridPosition {
	return childIsPlaced(parent) ? child.position : parent!.position;
}

/**
 * Whether a child of this container has a placement of its own.
 *
 * `placesChildren` applied to a parent that may be null, with the registry
 * lookup the callers were each doing for themselves — including the `?? ''`
 * spelling that leant on the empty string never being a registered type. §1
 * again, and the second half of it: **share the application, not the number.**
 * The predicate in `types.ts` is the fact; this is the one place it is applied to
 * a parent config, so no caller has to know that answering it means a lookup.
 *
 * Here rather than beside `placesChildren` because `types.ts` imports nothing —
 * it is what the registry imports — so the lookup cannot live there.
 *
 * True at the top level, where the sheet's own grid places everything.
 */
export function childIsPlaced(parent: ComponentConfig | null): boolean {
	return parent === null || placesChildren(getComponent(parent.type));
}

/**
 * A container's own grid, and the element to put its cells in.
 *
 * **The grid is the container's placement, both halves of it**: `width` columns
 * by `height` rows. An inner column is the width of a sheet column and an inner
 * row is the height of a sheet row, so a child is the same size as the identical
 * component placed outside the container, in both directions. There is no
 * `columns` config to disagree with it (SPEC §8).
 *
 * The rows are what this grew, and the omission was a real defect rather than an
 * unfinished edge: with implicit rows a container's declared `height` did
 * nothing at all, so a group four rows high whose children needed six simply
 * became six, and a child two rows high inside a container was not the height of
 * the identical component two rows high outside it. It also made a fixed-size
 * container impossible, which is what a Tab set has to be — its tabs are
 * alternatives on one grid, and they can only be interchangeable without moving
 * the sheet if that grid is the size the layout declared rather than the size
 * whichever tab is showing happens to need.
 *
 * `minmax(0, 1fr)` rather than `auto`: equal rows are the point, since that is
 * what makes an inner row a sheet row rather than whatever its own contents
 * came to. The `0` floor is what lets a row hold something that would rather be
 * wider than its share without pushing the track out.
 *
 * Two elements rather than one, because a container query cannot ask about the
 * element declaring it: the wrapper carries `container-type` and the grid inside
 * answers the same threshold the sheet does. That wrapper is what makes a
 * container its own reflow context — four columns inside a wide pane is narrow
 * even though the sheet is not, which is a case a media query cannot see at all
 * (UI §4).
 */
export function openSubgrid(
	into: HTMLElement,
	position: GridPosition,
): HTMLElement {
	const doc = into.ownerDocument;
	const { width: columns, height: rows } = position;
	const scope = doc.createElement('div');
	scope.classList.add('sheetsmith-subgrid');
	// The column count as a class as well as a custom property, because the
	// stylesheet needs it inside a container query and a query cannot read a
	// custom property. What it decides is when this grid is too narrow to be a
	// grid, and that question scales with the count: the sheet collapses at
	// 480px for 12 columns, which is 40px a column, so a four-column container
	// collapses at 160px rather than at the sheet's own number. Answering 480px
	// for every container is one number applied to twelve different questions —
	// it left a two-column container unable to place two children side by side
	// at any pane width, and the arrangement SPEC §13 names as the reason for
	// containers at all unreachable below a 1489px pane.
	scope.classList.add(`sheetsmith-cols-${tabulated(columns)}`);
	const grid = doc.createElement('div');
	grid.classList.add('sheetsmith-grid');
	grid.style.setProperty('--sheetsmith-columns', String(columns));
	// Inline rather than a custom property the stylesheet reads, because the
	// narrow reflow drops this grid for a flex column and a `grid-template-rows`
	// left on the element would be inert there rather than wrong — one
	// declaration that stops applying beats a rule that has to be unset.
	grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
	scope.appendChild(grid);
	into.appendChild(scope);
	return grid;
}

/**
 * The column count the stylesheet has a threshold for.
 *
 * One block per count, because CSS cannot multiply inside a container query, so
 * the rule is tabulated rather than computed. `DEFAULT_COLUMNS` is 12 and a
 * container can be no wider than the layout it sits in, so 1 to 12 covers every
 * layout that has not raised `columns` — and one that has falls back to the
 * widest threshold, which under-collapses rather than over-collapses. The
 * failure of being slightly too reluctant to stack is a grid a little tighter
 * than ideal; the failure the other way is the one this replaced.
 */
function tabulated(columns: number): number {
	return Math.min(Math.max(Math.round(columns), 1), 12);
}

/** One component as its host read it, which is all the grid needs to know. */
export interface GridComponent {
	config: ComponentConfig;
	/** Undefined where the layout named a type the registry does not have. */
	component: ComponentDefinition | undefined;
	data: unknown;
	/** Why this component's section would not read, or null where it did. */
	error: string | null;
}

/**
 * A component the grid has decided it can draw.
 *
 * Narrowed because a host is only ever asked for a context for something that
 * will render: everything undrawable has already become a message in a cell, so
 * a host does not have to guard for a component that is not there.
 */
export interface DrawableComponent extends GridComponent {
	component: ComponentDefinition;
}

/**
 * A failure in place: the cell is marked and the message goes inside it.
 *
 * Here rather than in each host because the mark is DOM shape, and the two had
 * already drifted on it — the sheet view added `sheetsmith-cell-error` and the
 * harness did not, so error cells in the instrument were missing the one
 * `.sheetsmith-cell` rule the stylesheet has (`styles.test.ts` names it). An
 * instrument kinder than the thing is the failure `docs/UI.md` §11 warns about.
 */
function failCell(cell: HTMLElement, text: string): void {
	cell.classList.add('sheetsmith-cell-error');
	const error = cell.ownerDocument.createElement('div');
	error.classList.add('sheetsmith-error');
	error.textContent = text;
	cell.appendChild(error);
}

/**
 * Draw one level of the grid, and a container's own level inside it.
 *
 * The loop that orchestrates `componentsInside`, `placeCell` and `openSubgrid`,
 * shared for the reason those three already are: the sheet view and the harness
 * both draw the sheet, appearance is reviewed in the harness, and a harness that
 * nests differently signs off on a layout the plugin never produces. That pair
 * had drifted three times before this — `publishedComponent` exists for the
 * first, `componentsInside` records the second in its own comment, and the third
 * was the error mark above.
 *
 * Extracted rather than guarded over two copies, which is the other half of
 * `PATTERNS.md` §1's two-consumer rule, because neither host can be driven: the
 * view's copy lived inside `SheetView.renderSheet`, which needs a workspace, and
 * the harness's is a page script that reads its stage element on import. A test
 * over this function reaches what a test over either of them cannot.
 *
 * That leaves the half an extraction cannot cover — nothing stops a later edit
 * rebuilding a local loop in a host — so `grid-cells.test.ts` also holds each
 * host to taking `renderGrid` and nothing else from here, and to building no
 * cell of its own. Three drifts each took reading two files side by side to
 * find, which is what earns a check rather than a note (§10).
 *
 * What a host still owns is the part only it can answer — the formula
 * environment, the change callback and the vault side of a link — so it passes a
 * context builder rather than a context, and containment is added here.
 */
export function renderGrid(
	into: HTMLElement,
	walk: readonly WalkEntry[],
	components: readonly GridComponent[],
	context: (
		entry: DrawableComponent,
	) => Omit<RenderContext, 'renderChildren' | 'childRegions'>,
): void {
	// By identity rather than by position: the order comes from the walk, and a
	// list indexed against it breaks silently the moment either side grows a
	// filter, which is how these two diverged once already.
	const read = new Map(components.map((entry) => [entry.config, entry]));

	/**
	 * One component into one cell, given the placement it effectively has.
	 *
	 * The placement that governs its own inner grid is `innerPlacement` above,
	 * asked here rather than threaded: a Group that is a tab opens its subgrid at
	 * the *tab set's* width and height, so a card inside a tab is the size of the
	 * identical card outside the tab set. Taking the parent rather than a derived
	 * position is what lets the layout editor ask the same question of the same
	 * function.
	 *
	 * Function declarations rather than `const`, because this and `level` call
	 * each other and one of the two would otherwise be named above its own
	 * declaration.
	 */
	function drawInto(
		cell: HTMLElement,
		entry: GridComponent,
		parent: ComponentConfig | null,
		/**
		 * True where the parent has already drawn this component's name, which is
		 * the case for a child it shows one at a time: the strip is built from
		 * these labels, so the tab and the region under it share one name.
		 */
		named = false,
	): void {
		const { config, component, data, error } = entry;
		const own = innerPlacement(config, parent);

		// A type the registry does not have, or one that holds a value being
		// handed components to hold. Either way nothing inside it is drawn: only
		// a component says where its region goes, and the alternative is
		// inventing a placement the layout never asked for. The children were
		// still read and still publish, so a formula naming one resolves — the
		// layout is broken, not the sheet.
		const undrawable = undrawableMessage(config, component);
		// The second test is for the type checker, which cannot see that a
		// missing component always produces a message.
		if (undrawable !== null || component === undefined) {
			failCell(cell, undrawable ?? unknownComponentMessage(config.type));
			return;
		}
		if (error !== null) {
			failCell(cell, `${config.label}: ${error}`);
			return;
		}

		const children = config.children ?? [];
		component.render(cell, config, data, {
			// The host's own object, narrowed rather than copied: a host may hold
			// more on it than the grid knows about and may write to it when an
			// edit is reported — the harness re-reads a section into the very
			// entry it was handed — so a copy here would leave that write landing
			// nowhere. The cast is what the two lines above just proved.
			...context(entry as DrawableComponent),
			...(named ? { parentShowsLabel: true } : {}),
			// Absent where the layout gave this component none, so a container can
			// tell an empty region from one it was not asked to draw. Both are
			// offered and a container uses one: which of the two it reaches for is
			// the whole difference between showing its children together and
			// showing one at a time.
			...(children.length === 0
				? {}
				: {
						renderChildren: (region: HTMLElement) =>
							level(openSubgrid(region, own), config),
						// File order, matching `config.children`, because a child
						// drawn this way has no placement to read a grid order
						// from — and this component is its parent, so its own subgrid
						// is this one's box.
						childRegions: children.map(
							(child) => (region: HTMLElement) => {
								const held = read.get(child);
								if (held === undefined) return;
								drawInto(fillCell(region), held, config, true);
							},
						),
					}),
		});
	}

	function level(target: HTMLElement, parent: ComponentConfig | null): void {
		for (const at of componentsInside(walk, parent)) {
			const entry = read.get(at);
			if (entry === undefined) continue;
			drawInto(placeCell(target, entry.config.position), entry, parent);
		}
	}

	level(into, null);
}
