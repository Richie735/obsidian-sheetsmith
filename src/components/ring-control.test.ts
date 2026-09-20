// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindRingControl, RingControl, RingControlOptions } from './ring-control';
import { closePopover, LONG_PRESS } from '../ui/popover';
import { hold } from '../test/pointer';

/*
 * The control four components make out of a painted level ring.
 *
 * **A file of its own rather than coverage through the four**, and it is the
 * default rule in `docs/PATTERNS.md` §10 rather than one of its exceptions: this
 * module has an entry point and a reportable output, and it needs no component
 * to be driven — a plain button and a stub column are the whole fixture.
 *
 * Which is exactly what the three exceptions do not have. A gesture module has
 * nothing to act on without a control, a vocabulary has nothing to assert that
 * is not a tautology, and a note-format primitive has nothing to be wrong about
 * except a caller's round trip. What this one owns is a *rule about four
 * surfaces at once* — what a two-state mark announces, what a tooltip is for,
 * and which of them a finger can reach — and a consumer can only ever drive one
 * of the four.
 *
 * The components keep their own cases for what they hand over and what they do
 * with what comes back. Nothing here reads or writes a note.
 */

/** A ring on a button of its own, with whatever a case is not about left alone. */
function ring(over: Partial<RingControlOptions> = {}): {
	button: HTMLButtonElement;
	/** Every level reported, in order. A press that moved nothing adds none. */
	sets: number[];
	control: RingControl;
} {
	const button = document.body.createEl('button');
	const sets: number[] = [];
	const control = bindRingControl({
		button,
		column: {},
		count: 1,
		graded: false,
		level: 0,
		name: 'Prepared',
		nameOnScreen: true,
		onSet: (level) => sets.push(level),
		...over,
	});
	return { button, sets, control };
}

/**
 * Press a key on the ring, and report whether it took the key for itself.
 *
 * Local rather than shared, on `src/test/pointer.ts`'s own rule: a key's one
 * load-bearing field is the argument, so spelling it wrong fails the assertion
 * behind it rather than driving nothing silently.
 */
function pressKey(button: HTMLElement, key: string): boolean {
	const event = new KeyboardEvent('keydown', { key, cancelable: true });
	button.dispatchEvent(event);
	return event.defaultPrevented;
}

afterEach(() => {
	closePopover();
	document.body.replaceChildren();
});

describe('what a ring says', () => {
	it('lets aria-pressed be the whole of what an unnamed flag says', () => {
		/*
		 * `SPEC` §13's ruling, made observable: two states is a toggle button,
		 * ARIA has a word for that, and a "Yes" or a "No" beside it would be a
		 * second name for one state — announced after the platform had already
		 * announced it. So the name is the ring's own name and nothing else, and
		 * the word appears nowhere on the control.
		 */
		const { button } = ring();
		expect(button.getAttribute('aria-pressed')).toBe('false');
		expect(button.getAttribute('aria-label')).toBe('Prepared');
		expect(button.hasAttribute('title')).toBe(false);

		button.click();
		expect(button.getAttribute('aria-pressed')).toBe('true');
		expect(button.getAttribute('aria-label')).toBe('Prepared');
		expect(button.outerHTML).not.toContain('Yes');
		expect(button.outerHTML).not.toContain('No');
	});

	it('gives a named two-state ring the level\'s own word', () => {
		// A named level is an abbreviation — an initial, a mark of the layout's
		// own, or a bare fill saying nothing — so the word is the one thing the
		// glyph cannot draw, and it is what the tooltip is for.
		const { button } = ring({
			column: { levels: ['Stowed', 'Worn:★'] },
			graded: true,
			name: 'Cloak',
		});
		expect(button.getAttribute('title')).toBe('Stowed');
		expect(button.getAttribute('aria-pressed')).toBe('false');
		expect(button.getAttribute('aria-label')).toBe('Cloak');

		button.click();
		expect(button.getAttribute('title')).toBe('Worn');
		expect(button.getAttribute('aria-pressed')).toBe('true');
	});

	it('carries the state in the name above two states', () => {
		// More than two states is not a toggle button, so there is no
		// `aria-pressed` to carry it and the name has to.
		const { button } = ring({
			column: { levels: ['None', 'Trained', 'Expert:★'] },
			count: 2,
			graded: true,
			level: 1,
			name: 'Rank',
		});
		expect(button.hasAttribute('aria-pressed')).toBe(false);
		expect(button.getAttribute('aria-label')).toBe('Rank: Trained');
		expect(button.getAttribute('title')).toBe('Trained');
	});

	it('shows an unnamed level the number it already is', () => {
		// Nothing to add: the ring draws the number, so a tooltip would repeat
		// what is legible, which is noise fired at every pass.
		const { button } = ring({
			column: { max: 4 },
			count: 4,
			graded: true,
			level: 3,
			name: 'Rank',
		});
		expect(button.getAttribute('aria-label')).toBe('Rank: 3');
		expect(button.hasAttribute('title')).toBe(false);
	});
});

describe('a name that is not on screen', () => {
	it('names the ring itself where nothing else does', () => {
		// A cell's field is named by its `<th>` and a card's by its label. A
		// record has neither, so a reader sees a dot and nothing says it is
		// "Prepared" — and that is missing on a toggle as much as on a level.
		const { button } = ring({
			name: 'Fireball Prepared',
			nameOnScreen: false,
		});
		expect(button.getAttribute('title')).toBe('Fireball Prepared');
	});

	it('adds the level\'s word to it where there is one', () => {
		const { button } = ring({
			column: { levels: ['Untrained', 'Trained:', 'Expert:★'] },
			count: 2,
			graded: true,
			level: 2,
			name: 'A Rank',
			nameOnScreen: false,
		});
		expect(button.getAttribute('title')).toBe('A Rank: Expert');
		expect(button.getAttribute('aria-label')).toBe('A Rank: Expert');
	});
});

describe('what a ring does', () => {
	it('cycles on a press and wraps at the top', () => {
		// One control reaches every level and returns to none without a second
		// gesture.
		const { button, sets } = ring({ column: { max: 3 }, count: 3, graded: true });
		button.click();
		button.click();
		button.click();
		button.click();
		expect(sets).toEqual([1, 2, 3, 0]);
	});

	it('steps on the arrows without wrapping', () => {
		// The hand that wants to aim rather than count, so the ends are walls.
		const { button, sets } = ring({ column: { max: 2 }, count: 2, graded: true });
		expect(pressKey(button, 'ArrowRight')).toBe(true);
		pressKey(button, 'ArrowUp');
		pressKey(button, 'ArrowUp');
		pressKey(button, 'ArrowLeft');
		pressKey(button, 'ArrowDown');
		pressKey(button, 'ArrowDown');
		expect(sets).toEqual([1, 2, 1, 0]);
	});

	it('reports nothing for a key that does not move it', () => {
		// The named behaviour change: a write of bytes the file already holds is
		// not a write anybody asked for, and three of the four callers already
		// behaved this way.
		const { button, sets } = ring({ level: 1 });
		expect(button.getAttribute('aria-pressed')).toBe('true');
		pressKey(button, 'ArrowRight');
		pressKey(button, 'ArrowUp');
		expect(sets).toEqual([]);
	});

	it('leaves a key it does not answer alone', () => {
		const { button, sets } = ring();
		expect(pressKey(button, 'Enter')).toBe(false);
		expect(pressKey(button, 'a')).toBe(false);
		expect(sets).toEqual([]);
	});
});

describe('the vertical axis', () => {
	it('hands Up and Down to a caller that owns them', () => {
		// A checklist's flags are laid out down the card, so up and down move
		// between them. The ring's own axis is the level's and points the other
		// way, which is why a caller moving down the list spells it `-step`.
		const asked: number[] = [];
		const { button, sets } = ring({
			onVertical: (step) => {
				asked.push(step);
				return true;
			},
		});
		expect(pressKey(button, 'ArrowDown')).toBe(true);
		expect(pressKey(button, 'ArrowUp')).toBe(true);
		expect(asked).toEqual([-1, 1]);
		expect(sets).toEqual([]);
	});

	it('keeps the key from the ring even where the caller declines', () => {
		// A card with one flag has nowhere to move to. Stepping the level instead
		// would give one card two meanings for one key depending on how many rows
		// it happened to have.
		const { button, sets } = ring({ onVertical: () => false });
		expect(pressKey(button, 'ArrowDown')).toBe(false);
		expect(sets).toEqual([]);
	});

	it('steps where no caller owns the axis', () => {
		const { button, sets } = ring({ column: { max: 2 }, count: 2, graded: true });
		pressKey(button, 'ArrowUp');
		expect(sets).toEqual([1]);
	});
});

describe('the touch route', () => {
	it('opens exactly what the tooltip holds', () => {
		// `title` is a pointer's route and a finger has no hover, so a held press
		// is the route to the word the glyph is not saying — and the click it
		// ends in did not mean "cycle" (`docs/UI.md` §7).
		const { button, sets } = ring({
			column: { levels: ['Stowed', 'Worn:★'] },
			graded: true,
			name: 'Cloak',
		});
		vi.useFakeTimers();
		try {
			hold(button, LONG_PRESS + 10, { pointerType: 'touch' });
			expect(document.querySelector('.sheetsmith-popover')?.textContent).toBe(
				'Stowed',
			);
			button.click();
			expect(sets).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('opens nothing where the ring is already saying everything', () => {
		// An unnamed flag's state is in `aria-pressed` and its name is in
		// `aria-label`, so there is no `title` and nothing for a hold to open.
		const { button, sets } = ring();
		vi.useFakeTimers();
		try {
			hold(button, LONG_PRESS + 10, { pointerType: 'touch' });
			expect(document.querySelector('.sheetsmith-popover')).toBe(null);
			button.click();
			expect(sets).toEqual([1]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('what the caller keeps', () => {
	it('moves the ring and paints it without reporting anything', () => {
		/*
		 * The silent setter, which is the contract Track's `Run.setMarks` needs:
		 * "move the run without writing". A card sweeping three rows owes the
		 * note one change, so a programmatic move that reported for itself would
		 * turn that sweep into one change per row. The press is the route that
		 * reports, and it has its own cases above.
		 */
		const { button, sets, control } = ring({
			column: { levels: ['None', 'Trained', 'Expert:\u2605'] },
			count: 2,
			graded: true,
			name: 'Rank',
		});
		control.setLevel(2);
		expect(button.getAttribute('aria-label')).toBe('Rank: Expert');
		expect(button.getAttribute('title')).toBe('Expert');
		expect(sets).toEqual([]);

		// And the press still reports, from where the silent move left it.
		button.click();
		expect(sets).toEqual([0]);
	});

	it('repaints at the level it is holding, and says nothing either', () => {
		// What a card's sweep calls after a write, so every run settles on what
		// the note now holds rather than waiting for a rebuild that may not come.
		const { button, sets, control } = ring({
			column: { levels: ['None', 'Trained', 'Expert:\u2605'] },
			count: 2,
			graded: true,
			level: 1,
			name: 'Rank',
		});
		button.removeAttribute('aria-label');
		control.repaint();
		expect(button.getAttribute('aria-label')).toBe('Rank: Trained');
		expect(sets).toEqual([]);
	});
});
