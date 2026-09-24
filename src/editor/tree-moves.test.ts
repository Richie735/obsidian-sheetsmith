// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from '../test/obsidian-stub';
import {
	chordMove,
	clipboardShortcuts,
	MOVE_SHORTCUTS,
	moveHint,
	RowMove,
	RowMoves,
} from './tree-moves';

/*
 * The half of the tree's moves that needs no pane: which key press is which
 * move, what the chords are declared as, and what the hint says on each
 * platform. `rowMoves` and `openRowMenu` read a layout and write through the
 * host, so they are driven through the rendered pane in `layout-editor.test.ts`
 * with the rest of the tree, where a move's write, its refusal line and the
 * focus it leaves are all observable (`docs/PATTERNS.md` §10).
 */

function move(title: string): RowMove {
	return { title, icon: '', refusal: null, run: () => undefined, listed: true };
}

const moves: RowMoves = {
	up: move('up'),
	down: move('down'),
	into: move('into'),
	out: move('out'),
};

function press(key: string, modifiers: KeyboardEventInit = { altKey: true }): KeyboardEvent {
	return new KeyboardEvent('keydown', { key, ...modifiers });
}

describe('which key press is which move', () => {
	it('maps Alt with each arrow to its move', () => {
		expect(chordMove(press('ArrowUp'), moves)).toBe(moves.up);
		expect(chordMove(press('ArrowDown'), moves)).toBe(moves.down);
		expect(chordMove(press('ArrowRight'), moves)).toBe(moves.into);
		expect(chordMove(press('ArrowLeft'), moves)).toBe(moves.out);
	});

	it('claims no arrow without Alt, and none with a second modifier', () => {
		expect(chordMove(press('ArrowUp', {}), moves)).toBeNull();
		for (const second of ['shiftKey', 'ctrlKey', 'metaKey'] as const) {
			expect(
				chordMove(press('ArrowUp', { altKey: true, [second]: true }), moves),
				second,
			).toBeNull();
		}
	});

	it('claims no other key, including an inherited property name', () => {
		expect(chordMove(press('Enter'), moves)).toBeNull();
		expect(chordMove(press('toString'), moves)).toBeNull();
	});

	it('declares exactly the four chords it answers', () => {
		expect(MOVE_SHORTCUTS).toBe(
			'Alt+ArrowUp Alt+ArrowDown Alt+ArrowRight Alt+ArrowLeft',
		);
	});
});

describe('the hint after a row name', () => {
	afterEach(() => {
		Platform.isMacOS = false;
	});

	it('names Alt away from a Mac', () => {
		expect(moveHint()).toBe('Alt+↑ ↓ reorder, Alt+→ ← move in or out');
	});

	it('names Option on a Mac, which is what the key says there', () => {
		Platform.isMacOS = true;
		expect(moveHint()).toBe('Option+↑ ↓ reorder, Option+→ ← move in or out');
	});
});

describe('the clipboard chords the name button declares', () => {
	afterEach(() => {
		Platform.isMacOS = false;
	});

	it('spells Control away from a Mac', () => {
		expect(clipboardShortcuts()).toBe('Control+C Control+V');
	});

	it('spells Meta on a Mac, which is the key the platform presses', () => {
		Platform.isMacOS = true;
		expect(clipboardShortcuts()).toBe('Meta+C Meta+V');
	});
});

