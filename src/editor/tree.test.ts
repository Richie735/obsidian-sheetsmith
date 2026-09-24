// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_DESTINATION } from './layout-editor';
import { Layout } from '../parse/layout';
import { ComponentConfig } from '../types';
import {
	Harness,
	settle,
	open,
	control,
	has,
	pick,
	openRowMenu,
	menuLines,
	menuItem,
	pressMenu,
	removeRow,
	writes,
	labels,
	nested,
	deep,
	pressAdd,
	chooseDestination,
	furnished,
	treeRow,
	undo,
	redo,
	panelHeading,
} from '../test/layout-editor-pane';

/*
 * The tree (`editor/tree.ts`), driven through the pane it is drawn in.
 *
 * What a row carries at rest, how the tree moves a component — by drag, by menu
 * and by chord, each asking `tree-moves.ts` and `reparent.ts` once — and what
 * folding a container hides and when the tree opens it again. The half of the
 * moves that needs no pane is `tree-moves.test.ts`.
 *
 * **Through the real pane rather than a `TreeHost` of the test's own**, which is
 * why these cases use `src/test/layout-editor-pane.ts`: a move is asserted by
 * what it wrote to the file, the refusal line under a row, and the focus it
 * left, and the folds read the pane's own view state. A stub host would be a
 * second answer to all three.
 *
 * **Moved here from `layout-editor.test.ts` whole**, not one assertion changed.
 * Four tree blocks stayed there, each for a stated reason in that file's header:
 * `the tree`, whose cases hold a row and its schematic block to one selection;
 * `the component list`, which asserts the canvas draws a container's children
 * as well as the rows listing them; `removing from the tree`, whose undo guard is the editor's `persistUndoable`;
 * and `copying and pasting a component from the tree`, whose behaviour is the
 * editor's clipboard and `paste.ts`, with the tree only the route in.
 */

let harness: Harness;

/** Press one of the tree's Alt+arrow chords on the control this token names. */
function chord(harness: Harness, token: string, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		key,
		altKey: true,
		bubbles: true,
		cancelable: true,
	});
	control(harness, token).dispatchEvent(event);
	return event;
}

/**
 * Three plain tabs in one Tab set, for a reorder that involves no container.
 *
 * A Tab set because its children are not placed, so its strip reads the file's
 * order and a reorder changes it. Every tab ties at row 1, so the tree draws that
 * order too; `untiedTabs()` below is the case where it does not. It was three leaves on the top level once, at
 * columns 1, 3 and 5, where a reorder wrote the file and changed nothing the
 * tree or the sheet drew — and the cases asserted only the file, so they passed.
 */
function threeTabs(): Layout {
	const tab = (id: string, label: string): ComponentConfig => ({
		id,
		type: 'card',
		label,
		position: { col: 1, row: 1, width: 6, height: 3 },
	});
	return {
		name: 'Three tabs',
		columns: 12,
		components: [
			{
				id: 'pages',
				type: 'tab-set',
				label: 'Pages',
				position: { col: 1, row: 1, width: 6, height: 3 },
				children: [tab('a', 'A'), tab('b', 'B'), tab('c', 'C')],
			},
		],
		triggers: [],
	};
}

/**
 * `threeTabs()` with the tie broken: each tab carries a stored row of its own,
 * C's first, which is what a tab moved in through the tree is given
 * (`reparent.ts` places it at the destination's next free row). The strip reads
 * the file's order, A B C, and `walkComponents` sorts by row, C A B.
 */
function untiedTabs(): Layout {
	const layout = threeTabs();
	const rows: Record<string, number> = { a: 2, b: 3, c: 1 };
	for (const tab of layout.components[0]?.children ?? []) {
		tab.position.row = rows[tab.id] ?? 1;
	}
	return layout;
}

/** The tabs' ids as the file holds them. */
async function storedTabs(harness: Harness): Promise<string[] | undefined> {
	return (await harness.stored()).components[0]?.children?.map((c) => c.id);
}

/**
 * Drag `fromId`'s tree row onto `toId`'s, dispatched directly by focus
 * token. The drag itself starts on the row's own handle, not the row —
 * `bindDragSource`'s drag source is the handle alone, the same split
 * `list-fields.ts` already draws, so a real drag never begins from the name
 * button or the up/down/indent/outdent/trash controls.
 *
 * **A drop is dispatched only where the dragover was accepted**, which is what
 * a browser does. This used to drop unconditionally, so the refusal line these
 * cases read was drawn by a `drop` no browser ever sends on a refused row, and
 * in the app the line never appeared.
 */
function dragRow(harness: Harness, fromId: string, toId: string): void {
	const drag = hoverRow(harness, fromId, toId);
	if (drag.accepted) {
		treeRow(harness, `edit-${toId}`).dispatchEvent(
			new Event('drop', { bubbles: true, cancelable: true }),
		);
	}
	drag.end();
}

/**
 * Start a drag of `fromId`'s row and hold it over `toId`'s, the way a pointer
 * resting there does: a dragstart, then a dragover, and nothing dropped.
 * `accepted` is whether the row took the dragover, which is the one thing a
 * browser asks before it will fire a drop. `leave` and `end` finish it the two
 * ways a refused drag finishes, and `over` repeats the dragover a resting
 * pointer keeps firing.
 */
function hoverRow(
	harness: Harness,
	fromId: string,
	toId: string,
): { accepted: boolean; over: () => void; leave: () => void; end: () => void } {
	const from = control(harness, `tree-handle-${fromId}`);
	const to = treeRow(harness, `edit-${toId}`);
	from.dispatchEvent(new Event('dragstart', { bubbles: true }));
	const over = (): boolean => {
		const event = new Event('dragover', { bubbles: true, cancelable: true });
		to.dispatchEvent(event);
		return event.defaultPrevented;
	};
	return {
		accepted: over(),
		over: () => void over(),
		leave: () => to.dispatchEvent(new Event('dragleave', { bubbles: true })),
		end: () => from.dispatchEvent(new Event('dragend', { bubbles: true })),
	};
}

/**
 * A container holding two containers, the second of which holds a leaf — the
 * one shape where moving a row into its previous sibling pushes a subtree past
 * the depth cap.
 */
function depthCapped(): Layout {
	return {
		name: 'Depth-capped sheet',
		columns: 12,
		components: [
			{
				id: 'zone',
				type: 'group',
				label: 'Zone',
				position: { col: 1, row: 1, width: 6, height: 3 },
				children: [
					{
						id: 'holder',
						type: 'group',
						label: 'Holder',
						position: { col: 1, row: 1, width: 3, height: 1 },
					},
					{
						id: 'nested',
						type: 'group',
						label: 'Nested',
						position: { col: 1, row: 2, width: 3, height: 1 },
						children: [
							{
								id: 'leaf',
								type: 'card',
								label: 'Leaf',
								position: { col: 1, row: 1, width: 2, height: 1 },
							},
						],
					},
				],
			},
		],
		triggers: [],
	};
}

/**
 * Four top-level components whose file order is not their grid order: the file
 * holds G, A, C, B, and the grid reads A, B, G, C down one column, so the tree
 * draws them in that reading order (`walkComponents`, SPEC §8). G is a Group,
 * drawn directly above C and first in the file, so a move "into" decided by the
 * file names a container the tree does not draw above the row.
 */
function shuffledGrid(): Layout {
	return {
		name: 'Shuffled grid',
		columns: 12,
		components: [
			{ id: 'g', type: 'group', label: 'G', position: { col: 1, row: 3, width: 4, height: 1 } },
			{ id: 'a', type: 'card', label: 'A', position: { col: 1, row: 1, width: 2, height: 1 } },
			{ id: 'c', type: 'card', label: 'C', position: { col: 1, row: 4, width: 2, height: 1 } },
			{ id: 'b', type: 'card', label: 'B', position: { col: 1, row: 2, width: 2, height: 1 } },
		],
		triggers: [],
	};
}

/** Every component row as the tree draws it, top to bottom, by id. */
function treeOrder(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll<HTMLElement>('[data-sheetsmith-focus^="edit-"]'),
	)
		.map((el) => (el.dataset.sheetsmithFocus ?? '').slice('edit-'.length))
		.filter((id) => id !== SHEET_DESTINATION);
}

/** The refusal line under a row, or undefined where it shows none. */
function refusalUnder(harness: Harness, id: string): string | undefined {
	return (
		treeRow(harness, `edit-${id}`).querySelector('.sheetsmith-field-error')
			?.textContent ?? undefined
	);
}

/** What a reorder on a placed grid says: `tree-moves.ts`'s own sentence. */
const PLACED_LINE =
	'Placed on the grid. Move it on the canvas, by dragging it or with the arrow keys.';

describe('tree moves on a placed grid act on the rows the tree draws', () => {
	beforeEach(async () => {
		harness = await open(shuffledGrid());
	});

	it('draws the grid reading order, not the file order', () => {
		expect(treeOrder(harness)).toEqual(['a', 'b', 'g', 'c']);
	});

	it('leaves Move up and Move down out of the menu, on every row', () => {
		// Out rather than disabled: nearly every level is placed, so two
		// disabled items would sit on almost every row for good.
		for (const id of ['a', 'b', 'g', 'c']) {
			openRowMenu(harness, id);
			expect(menuLines(), id).toEqual([
				expect.stringMatching(/^Move into /),
				'Move out of a container',
				'---',
				'Copy',
				'Paste',
				'Paste configuration',
				'---',
				'Remove',
			]);
			document.body.querySelector('.menu')?.remove();
		}
	});

	it('refuses Alt+Up and Alt+Down toward the canvas, writing nothing and moving nothing', async () => {
		const before = await harness.raw();
		const wrote = writes(harness);
		// The rows drawn first and last included: a file-order bound would have
		// let the first row move up and the last move down.
		for (const id of ['a', 'b', 'g', 'c']) {
			for (const key of ['ArrowUp', 'ArrowDown']) {
				const event = chord(harness, `edit-${id}`, key);
				expect(event.defaultPrevented).toBe(true);
				expect(refusalUnder(harness, id), `${id} ${key}`).toBe(PLACED_LINE);
			}
		}
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
		expect(treeOrder(harness)).toEqual(['a', 'b', 'g', 'c']);
	});

	it('refuses a drop beside a sibling toward the canvas, writing nothing and moving nothing', async () => {
		const before = await harness.raw();
		const wrote = writes(harness);
		const drag = hoverRow(harness, 'c', 'a');

		// Said while the pointer is over the row, since no drop will come.
		expect(drag.accepted).toBe(false);
		expect(refusalUnder(harness, 'a')).toBe(PLACED_LINE);
		drag.leave();
		expect(refusalUnder(harness, 'a')).toBeUndefined();
		drag.end();
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
		expect(treeOrder(harness)).toEqual(['a', 'b', 'g', 'c']);
	});

	it('names no container for a row with none drawn above it, whatever the file holds before it', () => {
		// First in the tree, second in the file, behind G.
		openRowMenu(harness, 'a');
		expect(menuItem('Move into a container').classList.contains('is-disabled')).toBe(
			true,
		);
		expect(menuLines()).not.toContain('Move into "G"');
		document.body.querySelector('.menu')?.remove();
		expect(chord(harness, 'edit-a', 'ArrowRight').defaultPrevented).toBe(true);
		expect(refusalUnder(harness, 'a')).toBe('No container above to move into.');
	});

	it('names and moves into the container drawn directly above', async () => {
		// C follows A in the file, and G in the tree.
		openRowMenu(harness, 'c');
		expect(menuItem('Move into "G"').classList.contains('is-disabled')).toBe(false);
		menuItem('Move into "G"').click();
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual(['g', 'a', 'b']);
		expect(stored.components[0]?.children?.map((c) => c.id)).toEqual(['c']);
		// Drawn inside G now: the first row of the wrapper after G's own row.
		const child = treeRow(harness, 'edit-c');
		expect(treeRow(harness, 'edit-g').nextElementSibling).toBe(child.parentElement);
	});
});

describe('tree moves on a level that is not placed keep the file order', () => {
	beforeEach(async () => {
		harness = await open(threeTabs());
	});

	it('offers Move up and Move down, disabled only at the ends the tree draws', () => {
		openRowMenu(harness, 'a');
		expect(menuLines().slice(0, 3)).toEqual(['Move up', 'Move down', '---']);
		expect(menuItem('Move up').classList.contains('is-disabled')).toBe(true);
		expect(menuItem('Move down').classList.contains('is-disabled')).toBe(false);
		document.body.querySelector('.menu')?.remove();

		openRowMenu(harness, 'c');
		expect(menuItem('Move up').classList.contains('is-disabled')).toBe(false);
		expect(menuItem('Move down').classList.contains('is-disabled')).toBe(true);
	});

	/*
	 * A known gap, deferred as its own bug: the tree sorts a Tab set's tabs by
	 * stored row while the strip reads the file, so once the tie breaks the two
	 * disagree, and a Move up changes the strip while the tree stays put. Fixing
	 * it touches `walkComponents`' sort or `reparent.ts`, both out of this
	 * branch. `it.fails` so the case runs and turns red the day the gap closes,
	 * rather than asserting the wrong order as correct.
	 */
	it.fails('draws untied tabs in the order the strip shows them', async () => {
		harness = await open(untiedTabs());
		expect(treeOrder(harness)).toEqual(['pages', 'a', 'b', 'c']);
	});

	it('refuses the chords at the ends in their own words', async () => {
		const before = await harness.raw();
		chord(harness, 'edit-a', 'ArrowUp');
		expect(refusalUnder(harness, 'a')).toBe('Already first.');
		chord(harness, 'edit-c', 'ArrowDown');
		expect(refusalUnder(harness, 'c')).toBe('Already last.');
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
	});
});

describe('reparenting a tree row', () => {
	it('drops onto a container row and appends the dragged component as its last child', async () => {
		harness = await open(nested());
		const wrote = writes(harness);
		dragRow(harness, 'hit_points', 'defences');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(
			stored.components.find((c) => c.id === 'defences')?.children?.map(
				(c) => c.id,
			),
		).toEqual(['armour', 'hit_points']);
		expect(wrote()).toBeGreaterThan(0);
	});

	it('drops onto a sibling within its own current parent and reorders it there', async () => {
		harness = await open(threeTabs());
		dragRow(harness, 'a', 'c');
		await settle(harness.pane);

		expect(await storedTabs(harness)).toEqual(['b', 'c', 'a']);
		expect(treeOrder(harness)).toEqual(['pages', 'b', 'c', 'a']);
	});

	it('refuses a drop that would push a container past the depth cap, with no write', async () => {
		harness = await open(deep());
		const before = await harness.raw();
		const wrote = writes(harness);

		// `defences` holds `melee`, which holds `armour` — dropping the whole
		// subtree into `spellbook` would land `melee` two containers deep,
		// where a container may hold no children at all.
		dragRow(harness, 'defences', 'spellbook');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a drop onto a non-container, with no write', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);

		dragRow(harness, 'hit_points', 'armour');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a row dropped onto itself, with no write', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);

		// And says nothing: every drag starts over its own row, so a line
		// there would flash at the start of every drag.
		const own = hoverRow(harness, 'defences', 'defences');
		expect(own.accepted).toBe(false);
		expect(refusalUnder(harness, 'defences')).toBeUndefined();
		own.end();

		dragRow(harness, 'defences', 'defences');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('refuses a row dropped onto one of its own descendants, with no write', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);

		dragRow(harness, 'defences', 'armour');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('shows a refused drop inline while the pointer is over the row, naming the fix', async () => {
		harness = await open(nested());
		const drag = hoverRow(harness, 'hit_points', 'armour');
		expect(drag.accepted).toBe(false);
		expect(refusalUnder(harness, 'armour')).toContain('is not a container');
		// Released over the row: no drop comes, and the end takes it down.
		drag.end();
		expect(refusalUnder(harness, 'armour')).toBeUndefined();
	});

	it('says the depth cap while a refused drag is over the row, and clears it when the drag ends', async () => {
		harness = await open(deep());
		const before = await harness.raw();
		const drag = hoverRow(harness, 'defences', 'spellbook');
		expect(drag.accepted).toBe(false);
		expect(refusalUnder(harness, 'spellbook')).toBe(
			'"Defences" holds "Melee", which holds components, and moving "Defences" here would put "Melee" inside two containers, where it could hold nothing. Move the components out of "Melee" first.',
		);
		drag.end();
		expect(refusalUnder(harness, 'spellbook')).toBeUndefined();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
	});

	it('draws the line once for a pointer resting on the row, not once per dragover', async () => {
		harness = await open(nested());
		const drag = hoverRow(harness, 'hit_points', 'armour');
		const line = treeRow(harness, 'edit-armour').querySelector('.sheetsmith-field-error');
		drag.over();
		drag.over();
		expect(treeRow(harness, 'edit-armour').querySelector('.sheetsmith-field-error')).toBe(
			line,
		);
		drag.end();
	});

	it('moves the line with the pointer, leaving none on the row it left', async () => {
		harness = await open(shuffledGrid());
		const onA = hoverRow(harness, 'c', 'a');
		onA.leave();
		const onB = treeRow(harness, 'edit-b');
		onB.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
		expect(refusalUnder(harness, 'a')).toBeUndefined();
		expect(refusalUnder(harness, 'b')).toBe(PLACED_LINE);
		onA.end();
		expect(refusalUnder(harness, 'b')).toBeUndefined();
	});

	it('leaves a chord\'s refusal on another row alone when a drag ends', async () => {
		// A chord's line stays until something replaces it; a drag's end takes
		// down only what the drag put up.
		harness = await open(nested());
		chord(harness, 'edit-armour', 'ArrowRight');
		const said = refusalUnder(harness, 'armour');
		expect(said).toBe('No container above to move into.');
		const drag = hoverRow(harness, 'defences', 'hit_points');
		expect(refusalUnder(harness, 'hit_points')).toBe(PLACED_LINE);
		drag.end();
		expect(refusalUnder(harness, 'hit_points')).toBeUndefined();
		expect(refusalUnder(harness, 'armour')).toBe(said);
	});

	it('reparents from the menu into the previous sibling, no pointer event dispatched', async () => {
		// The keyboard-operable equivalent of dropping a row onto the row
		// before it: `hit_points` moves into `defences`, its only earlier
		// sibling, with nothing but a press on the menu item.
		harness = await open(nested());
		pressMenu(harness, 'hit_points', 'Move into "Defences"');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(
			stored.components.find((c) => c.id === 'defences')?.children?.map(
				(c) => c.id,
			),
		).toEqual(['armour', 'hit_points']);
	});

	it('reparents from the menu out to the level above', async () => {
		harness = await open(nested());
		pressMenu(harness, 'armour', 'Move out of "Defences"');
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
			'armour',
		]);
		expect(stored.components[0]?.children).toBeUndefined();
	});

	it('reorders from the menu, moving up and down among siblings', async () => {
		// `list-fields.ts`'s own `moveItem` semantics, reused rather than
		// reinvented, exactly as the drag-based reorder test above already
		// proves for the pointer.
		harness = await open(threeTabs());
		pressMenu(harness, 'a', 'Move down');
		await settle(harness.pane);
		expect(await storedTabs(harness)).toEqual(['b', 'a', 'c']);
		expect(treeOrder(harness)).toEqual(['pages', 'b', 'a', 'c']);

		pressMenu(harness, 'c', 'Move up');
		await settle(harness.pane);
		expect(await storedTabs(harness)).toEqual(['b', 'c', 'a']);
		expect(treeOrder(harness)).toEqual(['pages', 'b', 'c', 'a']);
	});

	it('lists the items in order, with their separators and Remove warned', async () => {
		harness = await open(threeTabs());
		openRowMenu(harness, 'b');
		expect(menuLines()).toEqual([
			'Move up',
			'Move down',
			'---',
			'Move into a container',
			'Move out of "Pages"',
			'---',
			'Copy',
			'Paste',
			'Paste configuration',
			'---',
			'Remove',
		]);
		document.body.querySelector('.menu')?.remove();

		// On a placed grid there is no up and down, and no separator after them.
		harness = await open(deep());
		openRowMenu(harness, 'melee');
		expect(menuLines()).toEqual([
			'Move into a container',
			'Move out of "Defences"',
			'---',
			'Copy',
			'Paste',
			'Paste configuration',
			'---',
			'Remove',
		]);
		expect(menuItem('Remove').classList.contains('is-warning')).toBe(true);
	});

	it('names the previous sibling and the parent, and falls back to a generic item', async () => {
		harness = await open(nested());
		openRowMenu(harness, 'hit_points');
		// The other party only: the menu is reached through a button already
		// named for its row, so the row itself is not named again.
		expect(menuItem('Move into "Defences"').classList.contains('is-disabled')).toBe(
			false,
		);
		// At the top level there is no parent to leave.
		expect(
			menuItem('Move out of a container').classList.contains('is-disabled'),
		).toBe(true);

		openRowMenu(harness, 'defences');
		// First among its siblings, so nothing above it to move into.
		expect(
			menuItem('Move into a container').classList.contains('is-disabled'),
		).toBe(true);
		// The top level is a placed grid, so there is no reorder to offer.
		expect(menuLines()).not.toContain('Move up');
		expect(menuLines()).not.toContain('Move down');
	});

	it('writes nothing for a disabled item pressed anyway', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);
		for (const title of ['Move into a container', 'Move out of a container']) {
			pressMenu(harness, 'defences', title);
			await settle(harness.pane);
		}
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);

		// Last among the tabs, so nothing below it to swap with.
		harness = await open(threeTabs());
		const tabs = await harness.raw();
		const tabWrites = writes(harness);
		openRowMenu(harness, 'c');
		expect(menuItem('Move down').classList.contains('is-disabled')).toBe(true);
		menuItem('Move down').click();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(tabs);
		expect(tabWrites()).toBe(0);
	});

	it('disables the move into exactly where it would push a subtree past the depth cap', async () => {
		/*
		 * The trivial cases above never reach the interesting refusal the drag
		 * path has its own dedicated test for (`refuses a drop that would push a
		 * container past the depth cap, with no write`, against `deep()`): a
		 * container that holds components, moved into a sibling that is
		 * already one level in. `zone` holds two depth-1 children — `holder`,
		 * empty, and `nested`, which holds the Card `leaf` — so moving `nested`
		 * into its previous sibling `holder` would put `nested` inside two
		 * containers, where it may hold nothing. `deep()` is the other case,
		 * where the container too deep is one inside the one dragged.
		 */
		harness = await open(depthCapped());
		openRowMenu(harness, 'nested');
		expect(menuItem('Move into "Holder"').classList.contains('is-disabled')).toBe(
			true,
		);
	});

	it('refuses the same move from its chord, saying why under the row and writing nothing', async () => {
		harness = await open(depthCapped());
		const before = await harness.raw();
		const wrote = writes(harness);
		chord(harness, 'edit-nested', 'ArrowRight');
		await settle(harness.pane);

		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
		const message = treeRow(harness, 'edit-nested').querySelector(
			'.sheetsmith-field-error',
		);
		// Exact, not a fragment: `nested` holds a Card rather than a container,
		// and an assertion on the shared tail passed on a sentence that said
		// it held "a container of its own".
		expect(message?.textContent).toBe(
			'"Nested" holds components, and moving it here would put it inside two containers, where it could hold nothing. Move its components out first.',
		);
		expect(message?.getAttribute('role')).toBe('alert');
	});

	/*
	 * The refusal above names its fix: "Move its components out first." These
	 * two follow it, by each route that empties a container, and then make the
	 * move it refused. Emptying used to leave `children: []`, which
	 * `canReparent` read as holding nothing and `parseChildren` refuses two
	 * containers deep, so the move was allowed, drawn, and never saved.
	 */
	it('saves the refused move once its components are moved out, as the refusal says', async () => {
		harness = await open(depthCapped());
		chord(harness, 'edit-leaf', 'ArrowLeft');
		await settle(harness.pane);
		const emptied = await harness.raw();
		chord(harness, 'edit-nested', 'ArrowRight');
		await settle(harness.pane);

		expect(await harness.raw()).not.toBe(emptied);
		const zone = (await harness.stored()).components.find((c) => c.id === 'zone');
		const holder = zone?.children?.find((c) => c.id === 'holder');
		expect(holder?.children?.map((c) => c.id)).toEqual(['nested']);
		expect(holder?.children?.[0]).not.toHaveProperty('children');
	});

	it('saves the refused move once its last component is removed', async () => {
		harness = await open(depthCapped());
		removeRow(harness, 'leaf');
		await settle(harness.pane);
		const emptied = await harness.raw();
		chord(harness, 'edit-nested', 'ArrowRight');
		await settle(harness.pane);

		expect(await harness.raw()).not.toBe(emptied);
		const zone = (await harness.stored()).components.find((c) => c.id === 'zone');
		const holder = zone?.children?.find((c) => c.id === 'holder');
		expect(holder?.children?.map((c) => c.id)).toEqual(['nested']);
	});

	it('refuses each chord that cannot be made, in its own words', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);
		const said = (key: string): string | null | undefined => {
			chord(harness, 'edit-defences', key);
			return treeRow(harness, 'edit-defences').querySelector(
				'.sheetsmith-field-error',
			)?.textContent;
		};
		// The top level is placed, so up and down are refused toward the canvas;
		// their first and last refusals are a Tab set's, in the block above.
		expect(said('ArrowUp')).toBe(PLACED_LINE);
		expect(said('ArrowDown')).toBe(PLACED_LINE);
		expect(said('ArrowRight')).toBe('No container above to move into.');
		expect(said('ArrowLeft')).toBe('Already at the top level.');
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('reparents from a chord with no pointer event, as one undo step', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const event = chord(harness, 'edit-hit_points', 'ArrowRight');
		expect(event.defaultPrevented).toBe(true);
		await settle(harness.pane);
		const moved = await harness.raw();
		expect(
			(await harness.stored()).components
				.find((c) => c.id === 'defences')
				?.children?.map((c) => c.id),
		).toEqual(['armour', 'hit_points']);

		expect(await undo(harness)).toBe(true);
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(await redo(harness)).toBe(true);
		await settle(harness.pane);
		expect(await harness.raw()).toBe(moved);
	});

	it('reorders and moves out from the other three chords', async () => {
		harness = await open(threeTabs());
		chord(harness, 'edit-a', 'ArrowDown');
		await settle(harness.pane);
		chord(harness, 'edit-c', 'ArrowUp');
		await settle(harness.pane);
		expect(await storedTabs(harness)).toEqual(['b', 'c', 'a']);
		expect(treeOrder(harness)).toEqual(['pages', 'b', 'c', 'a']);

		harness = await open(nested());
		chord(harness, 'edit-armour', 'ArrowLeft');
		await settle(harness.pane);
		expect((await harness.stored()).components.map((c) => c.id)).toEqual([
			'defences',
			'hit_points',
			'armour',
		]);
	});

	it('moves focus to the moved row\'s name, from the menu and from a chord', async () => {
		harness = await open(nested());
		pressMenu(harness, 'hit_points', 'Move into "Defences"');
		await settle(harness.pane);
		expect(document.activeElement).toBe(control(harness, 'edit-hit_points'));

		chord(harness, 'edit-hit_points', 'ArrowLeft');
		await settle(harness.pane);
		expect(document.activeElement).toBe(control(harness, 'edit-hit_points'));
	});

	it('answers the chords on the name button and nowhere else on the row', async () => {
		harness = await open(nested());
		const before = await harness.raw();
		const wrote = writes(harness);
		for (const token of ['tree-handle-armour', 'tree-menu-armour']) {
			chord(harness, token, 'ArrowLeft');
		}
		chord(harness, 'tree-disclosure-defences', 'ArrowDown');
		// Plain arrows are not a chord, on the name button either.
		control(harness, 'edit-armour').dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
		);
		// Nor Alt with a second modifier, which is somebody else's chord.
		for (const second of ['shiftKey', 'ctrlKey', 'metaKey'] as const) {
			control(harness, 'edit-armour').dispatchEvent(
				new KeyboardEvent('keydown', {
					key: 'ArrowLeft',
					altKey: true,
					[second]: true,
					bubbles: true,
				}),
			);
		}
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
	});

	it('declares the chords on the name button, and says them after the name', async () => {
		harness = await open(nested());
		const name = control(harness, 'edit-armour');
		// The four moves, then the clipboard's two chords
		// (`docs/features/component-copy-paste.md` §2), Control away from a Mac.
		expect(name.getAttribute('aria-keyshortcuts')).toBe(
			'Alt+ArrowUp Alt+ArrowDown Alt+ArrowRight Alt+ArrowLeft Control+C Control+V',
		);
		expect(name.getAttribute('title')?.startsWith('Armour class')).toBe(true);
		expect(name.getAttribute('title')).toContain('Alt+↑ ↓ reorder');
		// The layout's own row cannot move, so it declares nothing.
		expect(
			control(harness, `edit-${SHEET_DESTINATION}`).hasAttribute('aria-keyshortcuts'),
		).toBe(false);
	});

	it('undoes a reparent at depth as one step', async () => {
		/*
		 * `dragRow` rather than the outdent button — CSB #486/#366, the prior
		 * art §5 was written against, is undo/redo failing to restore a
		 * *drag*-triggered move at depth specifically, so this is the trigger
		 * the criterion actually names. `dragRow(harness, 'armour',
		 * 'defences')` reaches the exact same write the outdent button does
		 * (both call `reparent(layout, armour, defences)`), which is what lets
		 * this reuse that test's own assertions unchanged.
		 */
		harness = await open(deep());
		const before = await harness.raw();

		dragRow(harness, 'armour', 'defences');
		await settle(harness.pane);
		expect(await harness.raw()).not.toBe(before);

		harness.pane.undo();
		await settle(harness.pane);
		expect(await harness.raw()).toBe(before);
	});

	it('redoes an undone reparent back to the moved state', async () => {
		// `dragRow`, the same drag-based trigger the undo test above uses,
		// for the same reason: the risk named at depth is a drag, not a button.
		harness = await open(deep());
		dragRow(harness, 'armour', 'defences');
		await settle(harness.pane);
		const afterMove = await harness.raw();

		harness.pane.undo();
		await settle(harness.pane);
		harness.pane.redo();
		await settle(harness.pane);

		expect(await harness.raw()).toBe(afterMove);
	});
});

describe('a tree row at rest', () => {
	it('carries a drag handle and a menu button, and none of the old controls', async () => {
		harness = await open(deep());
		for (const id of ['defences', 'melee', 'armour', 'spellbook']) {
			const controls = Array.from(
				treeRow(harness, `edit-${id}`).querySelectorAll('.setting-item-control > *'),
			).map((el) => (el as HTMLElement).dataset.sheetsmithFocus);
			expect(controls).toEqual([`tree-handle-${id}`, `tree-menu-${id}`]);
		}
		for (const prefix of ['tree-up-', 'tree-down-', 'tree-indent-', 'tree-outdent-', 'remove-']) {
			expect(
				harness.container.querySelector(`[data-sheetsmith-focus^="${prefix}"]`),
				prefix,
			).toBeNull();
		}
		expect(control(harness, 'tree-menu-melee').getAttribute('aria-label')).toBe(
			'More options for "Melee"',
		);
	});

	it('gives a container a disclosure and every other row a spacer in its place', async () => {
		harness = await open(deep());
		const chevron = control(harness, 'tree-disclosure-melee');
		expect(chevron.getAttribute('aria-expanded')).toBe('true');
		expect(chevron.getAttribute('aria-controls')).toBe('sheetsmith-tree-children-melee');
		expect(harness.container.querySelector('#sheetsmith-tree-children-melee')).not.toBeNull();
		expect(chevron.getAttribute('aria-label')).toBe('Collapse "Melee"');
		// An empty container is still a container, and still folds — but open, it
		// discloses no region, so it names none.
		expect(has(harness, 'tree-disclosure-spellbook')).toBe(true);
		expect(
			control(harness, 'tree-disclosure-spellbook').hasAttribute('aria-controls'),
		).toBe(false);
		// A leaf has the slot and nothing in it; the layout's row has neither.
		const leafSlot = treeRow(harness, 'edit-armour').querySelector('.sheetsmith-tree-slot');
		expect(leafSlot?.childElementCount).toBe(0);
		expect(
			treeRow(harness, `edit-${SHEET_DESTINATION}`).querySelector('.sheetsmith-tree-slot'),
		).toBeNull();
	});

	it('nests two containers deep as two wrappers', async () => {
		harness = await open(deep());
		const row = treeRow(harness, 'edit-armour');
		const wrappers: string[] = [];
		for (let el = row.parentElement; el !== null; el = el.parentElement) {
			if (el.classList.contains('sheetsmith-tree-children')) {
				wrappers.push(el.getAttribute('aria-label') ?? '');
			}
		}
		expect(wrappers).toEqual(['Inside Melee', 'Inside Defences']);
	});
});

describe('collapsing a container in the tree', () => {
	/** Press a container's chevron. */
	async function fold(harness: Harness, id: string): Promise<void> {
		control(harness, `tree-disclosure-${id}`).click();
		await settle(harness.pane);
	}

	/** A component row's description line. */
	function description(harness: Harness, id: string): string | null | undefined {
		return treeRow(harness, `edit-${id}`).querySelector('.setting-item-description')
			?.textContent;
	}

	it('stops listing what it holds, at every depth, and writes nothing', async () => {
		harness = await open(deep());
		const before = await harness.raw();
		const wrote = writes(harness);
		await fold(harness, 'defences');

		expect(has(harness, 'edit-melee')).toBe(false);
		expect(has(harness, 'edit-armour')).toBe(false);
		expect(has(harness, 'edit-spellbook')).toBe(true);
		expect(harness.container.querySelector('#sheetsmith-tree-children-defences')).toBeNull();
		const chevron = control(harness, 'tree-disclosure-defences');
		expect(chevron.getAttribute('aria-expanded')).toBe('false');
		expect(chevron.getAttribute('aria-label')).toBe('Expand "Defences"');
		expect(await harness.raw()).toBe(before);
		expect(wrote()).toBe(0);
		// Not an edit, so nothing for undo to take back.
		expect(harness.pane.undo()).toBe(false);
		// And the chevron keeps the focus across the redraw.
		expect(document.activeElement).toBe(chevron);
	});

	it('counts every component it hides, and says when it hides none', async () => {
		harness = await open(deep());
		expect(description(harness, 'defences')).toBe('Group');
		await fold(harness, 'defences');
		expect(description(harness, 'defences')).toBe('Group · 2 inside');
		await fold(harness, 'spellbook');
		expect(description(harness, 'spellbook')).toBe('Group · empty');
		await fold(harness, 'defences');
		expect(description(harness, 'defences')).toBe('Group');
		expect(has(harness, 'edit-armour')).toBe(true);
	});

	it('asks the workspace to remember the fold', async () => {
		harness = await open(deep());
		const asked = harness.app.workspace.layoutSavesRequested;
		await fold(harness, 'defences');
		expect(harness.app.workspace.layoutSavesRequested).toBe(asked + 1);
		expect(harness.pane.getState().collapsed).toEqual(['defences']);
	});

	it('selects the container when the selection is inside it', async () => {
		harness = await open(deep());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		await fold(harness, 'defences');
		expect(panelHeading(harness)).toBe('Defences');
		expect(has(harness, 'edit-armour')).toBe(false);
	});

	it('opens every shut ancestor of a selection made on the canvas', async () => {
		harness = await open(deep());
		await fold(harness, 'melee');
		await fold(harness, 'defences');
		control(harness, 'preview-armour').click();
		await settle(harness.pane);
		expect(has(harness, 'edit-armour')).toBe(true);
		expect(harness.pane.collapsed.size).toBe(0);
	});

	it('opens a shut container the picker inserts into', async () => {
		harness = await open(deep());
		await fold(harness, 'spellbook');
		pick(harness, 'card');
		chooseDestination(harness, 'spellbook');
		pressAdd(harness);
		await settle(harness.pane);
		const added = (await harness.stored()).components.find((c) => c.id === 'spellbook')
			?.children?.[0];
		expect(added).toBeDefined();
		expect(has(harness, `edit-${added?.id ?? ''}`)).toBe(true);
		expect(harness.pane.collapsed.has('spellbook')).toBe(false);
	});

	it('takes a drop and stays shut, counting one more', async () => {
		harness = await open(deep());
		await fold(harness, 'defences');
		dragRow(harness, 'spellbook', 'defences');
		await settle(harness.pane);
		expect(description(harness, 'defences')).toBe('Group · 3 inside');
		expect(has(harness, 'edit-spellbook')).toBe(false);
	});

	it('opens for a drop of the selected row, which it would otherwise hide', async () => {
		harness = await open(deep());
		control(harness, 'edit-spellbook').click();
		await settle(harness.pane);
		await fold(harness, 'defences');
		dragRow(harness, 'spellbook', 'defences');
		await settle(harness.pane);
		expect(has(harness, 'edit-spellbook')).toBe(true);
		expect(harness.pane.collapsed.has('defences')).toBe(false);
	});

	it('opens for a menu move into it', async () => {
		harness = await open(nested());
		await fold(harness, 'defences');
		pressMenu(harness, 'hit_points', 'Move into "Defences"');
		await settle(harness.pane);
		expect(has(harness, 'edit-hit_points')).toBe(true);
		expect(harness.pane.collapsed.has('defences')).toBe(false);
		expect(document.activeElement).toBe(control(harness, 'edit-hit_points'));
	});

	it('drags with everything it holds', async () => {
		harness = await open(deep());
		await fold(harness, 'melee');
		dragRow(harness, 'melee', 'spellbook');
		await settle(harness.pane);
		const stored = await harness.stored();
		const spellbook = stored.components.find((c) => c.id === 'spellbook');
		expect(spellbook?.children?.map((c) => c.id)).toEqual(['melee']);
		expect(spellbook?.children?.[0]?.children?.map((c) => c.id)).toEqual(['armour']);
		expect(stored.components.find((c) => c.id === 'defences')?.children).toBeUndefined();
	});

	it('reads the rows in the order it always did, expanded', async () => {
		harness = await open(furnished());
		// After the picker's three rows, and before the panel's own.
		expect(labels(harness).slice(3, 7)).toEqual([
			'Layout',
			'Defences',
			'Armour class',
			'Abilities',
		]);
	});
});
