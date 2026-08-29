import { describe, expect, it } from 'vitest';
import { UndoStack } from './undo-stack';

/*
 * A pure push/pop/depth-cap module, tested directly rather than through the
 * pane: `docs/PATTERNS.md` §10 holds a module to its own test file where it
 * has an entry point of its own and a reportable output, and this one has
 * both — `push`, `pop` and `depth` are the whole of its contract, with
 * nothing about a `Layout` or a DOM for `layout-editor.test.ts` to drive
 * instead. The depth cap in particular is far cheaper to prove here than by
 * driving 101 edits through the pane.
 */

describe('UndoStack', () => {
	it('pops the most recently pushed snapshot first', () => {
		const stack = new UndoStack();
		stack.push('a');
		stack.push('b');
		expect(stack.pop()).toBe('b');
		expect(stack.pop()).toBe('a');
	});

	it('pops undefined once empty', () => {
		const stack = new UndoStack();
		expect(stack.pop()).toBeUndefined();
		stack.push('a');
		stack.pop();
		expect(stack.pop()).toBeUndefined();
	});

	it('reports its depth', () => {
		const stack = new UndoStack();
		expect(stack.depth).toBe(0);
		stack.push('a');
		stack.push('b');
		expect(stack.depth).toBe(2);
		stack.pop();
		expect(stack.depth).toBe(1);
	});

	it('clears every snapshot', () => {
		const stack = new UndoStack();
		stack.push('a');
		stack.push('b');
		stack.clear();
		expect(stack.depth).toBe(0);
		expect(stack.pop()).toBeUndefined();
	});

	it('drops the oldest snapshot once the depth cap is exceeded', () => {
		const stack = new UndoStack();
		for (let i = 0; i < 101; i++) stack.push(`snapshot ${i}`);
		expect(stack.depth).toBe(100);

		// Pop every surviving snapshot: the oldest one pushed, "snapshot 0",
		// must not be among them.
		const popped: string[] = [];
		let value = stack.pop();
		while (value !== undefined) {
			popped.push(value);
			value = stack.pop();
		}
		expect(popped).toHaveLength(100);
		expect(popped).not.toContain('snapshot 0');
		expect(popped).toContain('snapshot 1');
		// Newest first, since it is a stack.
		expect(popped[0]).toBe('snapshot 100');
	});
});
