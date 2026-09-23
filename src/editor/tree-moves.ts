/*
 * Moving a tree row, from its menu and from the keyboard
 * (`docs/features/layout-editor-tree.md` §5, §6).
 *
 * The four moves a row offers — up and down among its siblings, into the
 * container above it and out to the level above — used to be four icon buttons
 * on every row. They are now one menu button and four chords, and this module
 * is the one place each move is decided: **the menu item and the chord call the
 * same move** (`docs/PATTERNS.md` §6, one route in), so the two cannot disagree
 * about what a move does or when it is refused. Each move is checked before it
 * writes — the sibling bounds, or `canReparent` — and a refused one carries the
 * sentence the chord says in place, while the menu draws it disabled.
 *
 * Its own file on `docs/PATTERNS.md` §1's atomicity test: `tree.ts` draws the
 * tree and its drag, and deciding what a row may do from the keyboard and the
 * menu is a second job with a vocabulary of its own. **It is also the one file
 * in `src/` that imports the app's `Menu`**, which `components/isolation.test.ts`
 * holds to: a list of commands, each a title, an icon and a click, which is the
 * job that menu is for and the job a form in one is not.
 *
 * What it does not decide: *which* container "into" means is unchanged from the
 * indent button it replaces — the row's previous sibling in its own list — and
 * `reparent.ts`'s rules are called, never changed.
 */

import { Menu, Platform } from 'obsidian';
import { Layout } from '../parse/layout';
import { WalkEntry } from '../parse/layout-walk';
import { holdsChildren } from './accepts-children';
import { ListContext, moveItem } from './list-fields';
import { canReparent, reparent } from './reparent';
import type { TreeHost } from './tree';

/** One move a row offers, as the menu draws it and a chord makes it. */
export interface RowMove {
	/** The menu item's words, naming the other party where there is one. */
	title: string;
	icon: string;
	/**
	 * Why this move may not be made, in the words a refused chord says under
	 * the row, or null where it may be made.
	 */
	refusal: string | null;
	/** Make the move and redraw. Never called while `refusal` is set. */
	run: () => void;
}

/** The four moves, one per chord, in the order the menu lists them. */
export interface RowMoves {
	up: RowMove;
	down: RowMove;
	into: RowMove;
	out: RowMove;
}

/**
 * Which key, pressed with Alt, makes which move: the one spelling of the chord
 * set, so the handler and the declaration below cannot disagree about which
 * keys exist (`docs/PATTERNS.md` §1, a set climbs in one step).
 */
const CHORD_KEYS: Readonly<Record<string, keyof RowMoves>> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowRight: 'into',
	ArrowLeft: 'out',
};

/**
 * What the chords are, for `aria-keyshortcuts`, which spells a modifier the
 * platform's way and so says Alt on a Mac too — the attribute's own vocabulary,
 * and the one a screen reader reads. Derived from the table above.
 */
export const MOVE_SHORTCUTS = Object.keys(CHORD_KEYS)
	.map((key) => `Alt+${key}`)
	.join(' ');

/**
 * The hint the name button's `title` carries after the row's name.
 *
 * Option on a Mac, because that is what the key is called there and a hint
 * naming a key the keyboard does not label is a hint read twice.
 */
export function moveHint(): string {
	const key = Platform.isMacOS ? 'Option' : 'Alt';
	return `${key}+↑ ↓ reorder, ${key}+→ ← move in or out`;
}

/**
 * The minimal `ListContext` `moveItem` needs, over the tree's host.
 *
 * `confirm` is never asked — `moveItem` confirms nothing — and the errors map
 * and the drag cursor are `list-fields.ts`'s convention for a list of *fields*,
 * which the tree is not, so both are fresh here rather than threaded through
 * `TreeHost` for a caller with no use for either. Focus is the one member that
 * is passed through: a moved row's name button is where focus goes next.
 */
export function treeListContext(host: TreeHost): ListContext {
	return {
		persist: () => host.persist(),
		redraw: () => host.redraw(),
		focusAfterRedraw: (token) => host.focusAfterRedraw(token),
		confirm: () => undefined,
		errors: new Map(),
		drag: { index: null },
	};
}

/**
 * Every move `entry`'s row offers, each already checked against the layout as
 * it stands.
 *
 * `parentOf` answers the walk entry of a container, which is how the move out
 * finds the level above without walking the layout a second time.
 */
export function rowMoves(
	layout: Layout,
	entry: WalkEntry,
	parentOf: (config: WalkEntry['config']) => WalkEntry | undefined,
	host: TreeHost,
): RowMoves {
	const { config, siblings, parent } = entry;
	const index = siblings.indexOf(config);
	const focusMoved = (): void => host.focusAfterRedraw(`edit-${config.id}`);
	const context = treeListContext(host);

	/*
	 * A move into or out of a shut container opens it first
	 * (`docs/features/layout-editor-tree.md` §7, rule 4), before the write, so the
	 * row the focus follows is on screen when the redraw looks for it. Both ends
	 * are opened, though only "into" can be shut in practice — a row inside a shut
	 * container is not on screen to move — so the code carries no special case.
	 */
	const reparentTo = (target: WalkEntry['config'] | null): void => {
		const shut = new Set(host.collapsed);
		if (target !== null) shut.delete(target.id);
		if (parent !== null) shut.delete(parent.id);
		host.setCollapsed(shut);
		focusMoved();
		reparent(layout, config, target);
		host.persist();
		host.redraw();
	};

	const up: RowMove = {
		title: 'Move up',
		icon: 'arrow-up',
		refusal: index <= 0 ? 'Already first.' : null,
		run: () => {
			focusMoved();
			moveItem(siblings, index, index - 1, context);
		},
	};
	const down: RowMove = {
		title: 'Move down',
		icon: 'arrow-down',
		refusal: index === siblings.length - 1 ? 'Already last.' : null,
		run: () => {
			focusMoved();
			moveItem(siblings, index, index + 1, context);
		},
	};

	const previous = index > 0 ? (siblings[index - 1] ?? null) : null;
	const previousHolds =
		previous !== null && holdsChildren(previous);
	const intoCheck =
		previous !== null && previousHolds
			? canReparent(layout, config, previous)
			: { error: 'No container above to move into.' };
	const into: RowMove = {
		// The menu keeps its shape: the fourth item is always the out move, so
		// the third is always this one, named for its container where it has one.
		title:
			previous !== null && previousHolds
				? `Move into "${previous.label}"`
				: 'Move into a container',
		icon: 'chevron-right',
		refusal: 'error' in intoCheck ? intoCheck.error : null,
		run: () => reparentTo(previous),
	};

	const grandparent =
		parent === null ? undefined : (parentOf(parent)?.parent ?? null);
	const outCheck =
		grandparent !== undefined
			? canReparent(layout, config, grandparent)
			: { error: 'Already at the top level.' };
	const out: RowMove = {
		title: parent !== null ? `Move out of "${parent.label}"` : 'Move out of a container',
		icon: 'chevron-left',
		refusal: 'error' in outCheck ? outCheck.error : null,
		run: () => reparentTo(grandparent ?? null),
	};

	return { up, down, into, out };
}

/**
 * The move a key press asks for, or null for a press that is not one of the
 * four chords.
 *
 * Alt with no other modifier: Shift, Ctrl and Meta each turn an arrow into a
 * different chord that is somebody else's — a selection, a word jump, a line
 * end — and this claims none of them.
 */
export function chordMove(event: KeyboardEvent, moves: RowMoves): RowMove | null {
	if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
	const move = Object.hasOwn(CHORD_KEYS, event.key) ? CHORD_KEYS[event.key] : undefined;
	return move === undefined ? null : moves[move];
}

/**
 * Open the row's menu at the button that asked for it.
 *
 * At the pointer for a press, and under the button for a keyboard activation —
 * `event.detail` is 0 for a click Enter or Space produced, where a pointer
 * position would be wherever the pointer last happened to rest. Items in the
 * order the design lists them: the two reorders, the two moves across a level,
 * then **Remove**, apart from the moves and warned, since it is the one item
 * that takes something away. A refused move is a disabled item; the menu cannot
 * say why (`MenuItem` has no description), and the chord and a drag both can.
 */
export function openRowMenu(
	button: HTMLElement,
	event: MouseEvent,
	moves: RowMoves,
	remove: () => void,
): void {
	const menu = new Menu();
	const add = (move: RowMove): void => {
		menu.addItem((item) =>
			item
				.setTitle(move.title)
				.setIcon(move.icon)
				.setDisabled(move.refusal !== null)
				.onClick(() => {
					if (move.refusal === null) move.run();
				}),
		);
	};
	add(moves.up);
	add(moves.down);
	menu.addSeparator();
	add(moves.into);
	add(moves.out);
	menu.addSeparator();
	menu.addItem((item) =>
		item.setTitle('Remove').setIcon('trash-2').setWarning(true).onClick(remove),
	);
	if (event.detail === 0) {
		const box = button.getBoundingClientRect();
		menu.showAtPosition({ x: box.left, y: box.bottom }, button.ownerDocument);
	} else {
		menu.showAtMouseEvent(event);
	}
}
