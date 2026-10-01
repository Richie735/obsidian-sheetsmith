// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { armOnTyping } from './arm-on-typing';

/*
 * `arm-on-typing.ts`, driven directly: the two suggesters that use it test the
 * flag through a popup, and neither reaches its `suspended` branch from the
 * formula side without a splice, so the rules are held here once.
 */
function bound(suspended?: () => boolean) {
	const input = document.createElement('input');
	document.body.appendChild(input);
	const state = { armed: false };
	const bind = armOnTyping(input, state, suspended);
	const suggest = { close: vi.fn() };
	bind(suggest);
	return { input, state, suggest };
}

const fire = (input: HTMLInputElement, type: string, init?: KeyboardEventInit) =>
	input.dispatchEvent(
		type === 'keydown' ? new KeyboardEvent(type, init) : new Event(type),
	);

describe('arming', () => {
	it('is armed by typing and by nothing else', () => {
		const { input, state } = bound();
		expect(state.armed).toBe(false);
		fire(input, 'input');
		expect(state.armed).toBe(true);
	});

	it('is disarmed by focus and by blur', () => {
		const { input, state } = bound();
		for (const type of ['focus', 'blur']) {
			fire(input, 'input');
			expect(state.armed).toBe(true);
			fire(input, type);
			expect(state.armed).toBe(false);
		}
	});

	it('is not armed by an input event while the caller says it is writing the field', () => {
		let writing = true;
		const { input, state } = bound(() => writing);
		fire(input, 'input');
		expect(state.armed).toBe(false);
		writing = false;
		fire(input, 'input');
		expect(state.armed).toBe(true);
	});

	it('arms on every input when nothing is ever suspended', () => {
		const { input, state } = bound(undefined);
		fire(input, 'input');
		expect(state.armed).toBe(true);
	});
});

describe('the caret leaving the text', () => {
	it('disarms and closes on Left and Right, and on a press inside the field', () => {
		const { input, state, suggest } = bound();
		for (const key of ['ArrowLeft', 'ArrowRight']) {
			fire(input, 'input');
			fire(input, 'keydown', { key });
			expect(state.armed).toBe(false);
		}
		expect(suggest.close).toHaveBeenCalledTimes(2);
		fire(input, 'input');
		fire(input, 'pointerdown');
		expect(state.armed).toBe(false);
		expect(suggest.close).toHaveBeenCalledTimes(3);
	});

	it('leaves Up, Down and ordinary keys to the popup', () => {
		const { input, state, suggest } = bound();
		fire(input, 'input');
		for (const key of ['ArrowUp', 'ArrowDown', 'a', 'Enter']) {
			fire(input, 'keydown', { key });
		}
		expect(state.armed).toBe(true);
		expect(suggest.close).not.toHaveBeenCalled();
	});
});

describe('ordering', () => {
	it('arms before a listener the caller adds afterwards sees the event', () => {
		const input = document.createElement('input');
		const state = { armed: false };
		armOnTyping(input, state);
		let seen: boolean | null = null;
		// The suggester's own handler, constructed after the helper's wiring.
		input.addEventListener('input', () => {
			seen = state.armed;
		});
		fire(input, 'input');
		expect(seen).toBe(true);
	});
});
