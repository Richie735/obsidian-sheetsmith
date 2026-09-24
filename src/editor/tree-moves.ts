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
 * **It also holds the menu's third section**, the clipboard's **Copy**,
 * **Paste** and **Paste configuration** (`docs/features/component-copy-paste.md`
 * §1), between the moves and **Remove**, and the declaration of the two chords
 * that go with them, Mod+C and Mod+V. Those items are decided by the pane's
 * host rather than here, since what they do is read and write the clipboard and
 * the layout; this is only where the menu lists them, and they are never
 * disabled, because whether there is anything to paste is only known by reading.
 *
 * **Every move reads the level as the tree draws it**, which is the grid
 * reading order `walkComponents` sorts into, not the file's own array. The two
 * differ on a placed grid, and a move decided by file index there acted on rows
 * the tree does not draw beside it. So "into" means the row drawn directly
 * above, and first and last are the rows drawn first and last.
 *
 * **On a placed grid there is no up and down to make.** The sheet reads a placed
 * level by position (SPEC §8), so reordering its file array changes nothing a
 * reader sees; where a component sits there is the canvas's business, by drag or
 * by its arrow keys. The menu leaves both items out, since nearly every level is
 * placed and two disabled items would sit on almost every row for good, and the
 * chord says where to go instead. Up and down stay where a level's children are
 * not placed — a Tab set's tabs — whose strip reads the file's order. The tree
 * draws that order only while the tabs' stored rows tie; a tab moved in through
 * the tree breaks the tie, a known gap deferred as its own bug
 * (`docs/features/layout-editor-tree.md` §5).
 *
 * What it does not decide: `reparent.ts`'s rules, which are called, never
 * changed.
 */

import { Menu, Platform } from 'obsidian';
import { Layout } from '../parse/layout';
import { WalkEntry } from '../parse/layout-walk';
import { childIsPlaced } from '../view/grid-cells';
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
	/**
	 * Whether the menu lists it. False only for up and down on a placed grid,
	 * where the move does not exist rather than being refused for now; its chord
	 * still answers, with `refusal`.
	 */
	listed: boolean;
}

/**
 * What a reorder on a placed grid says instead of reordering: where a component
 * is moved on its grid, by either route the canvas has.
 */
const PLACED_REORDER_REFUSAL =
	'Placed on the grid. Move it on the canvas, by dragging it or with the arrow keys.';

/**
 * Why a reorder among `parent`'s children is refused, or null where the level
 * reorders. The one application of the rule: the chords, the menu's omission
 * and a drop beside a sibling all ask this, so they cannot disagree about
 * *when* a level refuses, which sharing the sentence alone did not prevent
 * (`docs/PATTERNS.md` §1, share the application, not just the fact).
 */
export function placedReorderRefusal(
	parent: WalkEntry['config'] | null,
): string | null {
	return childIsPlaced(parent) ? PLACED_REORDER_REFUSAL : null;
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
 * The clipboard's two chords, declared beside the moves in the name button's
 * `aria-keyshortcuts` (`docs/features/component-copy-paste.md` §2) — Meta on a
 * Mac and Control elsewhere, since this attribute spells the key the platform
 * presses. Paste configuration has none: every plausible chord is taken.
 *
 * Not added to the `title` hint: Mod+C and Mod+V are the one pair nobody needs
 * telling.
 */
export function clipboardShortcuts(): string {
	const key = Platform.isMacOS ? 'Meta' : 'Control';
	return `${key}+C ${key}+V`;
}

/**
 * The third section of a row's menu: what the clipboard can do with this row
 * (`docs/features/component-copy-paste.md` §1). **Never disabled**: whether
 * there is anything to paste is only known by reading the clipboard, which
 * opening a menu must not do — the read is async, may prompt, and may fail — so
 * a press that finds nothing usable says so under the row instead.
 */
export interface RowClipboard {
	copy: () => void;
	paste: () => void;
	pasteConfiguration: () => void;
}

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
 * finds the level above without walking the layout a second time. `drawn` is
 * the row's level as the tree draws it (`componentsInside`), which every
 * neighbour below is read from; `siblings` is only where a reorder writes.
 */
export function rowMoves(
	layout: Layout,
	entry: WalkEntry,
	drawn: readonly WalkEntry['config'][],
	parentOf: (config: WalkEntry['config']) => WalkEntry | undefined,
	host: TreeHost,
): RowMoves {
	const { config, siblings, parent } = entry;
	const index = drawn.indexOf(config);
	const placedRefusal = placedReorderRefusal(parent);
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

	/*
	 * A reorder moves the row to where its drawn neighbour sits in the file. On a
	 * level that is not placed the two orders are one, so this is the file's own
	 * next or previous slot; spelling it through the neighbour keeps the move
	 * about the row the reader sees even if they ever differ.
	 */
	const reorder = (
		title: string,
		icon: string,
		neighbour: WalkEntry['config'] | undefined,
		edge: string,
	): RowMove => ({
		title,
		icon,
		refusal: placedRefusal ?? (neighbour === undefined ? edge : null),
		run: () => {
			if (neighbour === undefined) return;
			focusMoved();
			moveItem(siblings, siblings.indexOf(config), siblings.indexOf(neighbour), context);
		},
		listed: placedRefusal === null,
	});
	const up = reorder('Move up', 'arrow-up', drawn[index - 1], 'Already first.');
	const down = reorder('Move down', 'arrow-down', drawn[index + 1], 'Already last.');

	const previous = index > 0 ? (drawn[index - 1] ?? null) : null;
	const previousHolds =
		previous !== null && holdsChildren(previous);
	const intoCheck =
		previous !== null && previousHolds
			? canReparent(layout, config, previous)
			: { error: 'No container above to move into.' };
	const into: RowMove = {
		// The into and out items keep their shape: this one is always there,
		// before the out move, named for its container where it has one.
		title:
			previous !== null && previousHolds
				? `Move into "${previous.label}"`
				: 'Move into a container',
		icon: 'chevron-right',
		refusal: 'error' in intoCheck ? intoCheck.error : null,
		run: () => reparentTo(previous),
		listed: true,
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
		listed: true,
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
 * order the design lists them: the two reorders where the level has them (a
 * placed grid does not, and the menu then opens on the moves across a level),
 * the two moves across a level,
 * the clipboard's three, then **Remove**, apart from the rest and warned, since
 * it is the one item that takes something away. The clipboard's items name no
 * one: the menu is reached through a button already named for its row, and the
 * other party — what the clipboard holds — cannot be known without the read the
 * menu must not make (`docs/UI.md` §6). A refused move is a disabled item; the menu cannot
 * say why (`MenuItem` has no description), and the chord and a drag both can.
 */
export function openRowMenu(
	button: HTMLElement,
	event: MouseEvent,
	moves: RowMoves,
	clipboard: RowClipboard,
	remove: () => void,
): void {
	const menu = new Menu();
	const add = (move: RowMove): void => {
		if (!move.listed) return;
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
	if (moves.up.listed || moves.down.listed) menu.addSeparator();
	add(moves.into);
	add(moves.out);
	menu.addSeparator();
	menu.addItem((item) =>
		item.setTitle('Copy').setIcon('copy').onClick(clipboard.copy),
	);
	menu.addItem((item) =>
		item.setTitle('Paste').setIcon('clipboard-paste').onClick(clipboard.paste),
	);
	// The format painter, which is Office's and Gutenberg's own metaphor for
	// turning one thing into another's twin.
	menu.addItem((item) =>
		item
			.setTitle('Paste configuration')
			.setIcon('paintbrush')
			.onClick(clipboard.pasteConfiguration),
	);
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
