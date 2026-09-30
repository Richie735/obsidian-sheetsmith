/*
 * A painted level ring, made into a control.
 *
 * One sentence, which is `PATTERNS` §1's test: it makes a control out of a ring
 * `level-ring.ts` painted. What a reader sees is the painter's; what a reader
 * *does*, what a listener *hears*, and what a finger can reach are here.
 *
 * The four components that draw one — Table's `level` and `toggle` columns,
 * Track's flag, Record set's `level` and `toggle` fields and a Roster cell —
 * each spelled the same ARIA, the same tooltip rule, the same touch route and
 * the same press and arrow keys. Nothing reported it when the four disagreed,
 * and they did: one bound its touch route under a predicate the other three did
 * not have, and three of them computed a word for an unnamed flag that no
 * branch could reach.
 *
 * **Beside the painter rather than inside it.** `paintLevelRing` has a consumer
 * this module must not reach: the layout editor's level sample. It is not a
 * ring that binds nothing — it is a `<button>` with an `aria-label`, an
 * `aria-pressed`, a `title` and a click of its own — and that is exactly why
 * folding the ARIA into the painter would be wrong rather than merely
 * unnecessary. **Its two states are a fact about the layout an author is
 * writing**, "this level shows a mark" against "shows nothing", where every
 * state here is a fact about a character's level; and its press sets a level's
 * glyph rather than cycling the ring. Handing it the sheet's `aria-pressed`
 * would overwrite a true statement with a false one. Painting and controlling
 * are two responsibilities and stay two files.
 *
 * **In `components/` rather than `interaction/`** because it reaches for the
 * painter, and a gesture module that knows what a level ring is has the layering
 * backwards. `PATTERNS` §2's test is which folder names what a module *does*,
 * and what this one does is ring-shaped. It is in no registry, declares no
 * `ComponentDefinition`, imports nothing from `obsidian` and touches no file; it
 * is on the sibling allowlist in `eslint.config.mts` and in the enumerated
 * spellings in `components/isolation.test.ts`, which is the decision §2 reserves
 * rather than a precedent inherited from the names already there.
 *
 * **It knows no caller.** The caller makes the button and classes it — a Track
 * adds two classes of its own and a tab index — which is `linked-text.ts`'s
 * arrangement one step further: not even the class name is passed in.
 *
 * What stays with the caller is everything whose answer is about the component
 * rather than about the ring: reading a stored value into a level, and writing
 * one back. This module takes a number and reports a number.
 */

import { LevelColumn, levelName, paintLevelRing } from './level-ring';
import { bindLongPress } from '../ui/popover';

/** What a caller hands over, and everything the control decides from. */
export interface RingControlOptions {
	/** The `<button>` the caller has already made, classed and placed. */
	button: HTMLButtonElement;
	/** The levels and the ceiling the painter reads. */
	column: LevelColumn;
	/**
	 * How many levels above none. `1` is a two-state control.
	 *
	 * Not derived from `column`, which is the one parameter here that looks
	 * redundant and is not: a `toggle` column may still carry the `levels` of the
	 * `level` column it used to be, and `levelCount` would then answer for a
	 * control the layout no longer asks for. The count is the caller's reading of
	 * its own config.
	 */
	count: number;
	/** Whether the ring shows a glyph and a share of the ramp (`SPEC` §4.2). */
	graded: boolean;
	/** The level to start at. Reading a stored value stays with the caller. */
	level: number;
	/** What this ring is called, to a reader and to a listener. */
	name: string;
	/**
	 * Whether `name` is already on screen beside the ring.
	 *
	 * Named for the fact rather than for its effect on the tooltip, so a call
	 * site reads as a statement about its own surface rather than as a request.
	 * Which side of it a caller is on is the caller's business; what to do about
	 * it is this module's.
	 *
	 * A cell's name is in a `<th>` over the column and a card's is above it, so
	 * only the level's word is ever missing there. A record has neither: a reader
	 * sees `Fireball · Level 3 · ●` and nothing on screen says the dot is
	 * "Prepared" (`docs/UI.md` §6).
	 */
	nameOnScreen: boolean;
	/**
	 * Something the ring's value stands for that nothing on screen says, read on
	 * every paint and added to the `title` while the ring is not at none.
	 *
	 * **An option because the `title` is this module's**: `paint` rewrites it on
	 * every repaint, and removes it outright on an unnamed flag whose name is on
	 * screen, so a caller setting one of its own would lose it to the first
	 * press. The long press reads the same attribute, so a finger reaches the
	 * words by the route a glyph's word already takes. Track's flag is the one
	 * caller — a stored count above one that the flag reads as ticked and has no
	 * spelling for (`docs/features/track-stored-value-past-shortened-run.md`) —
	 * and a cell passes none, so a cell is untouched. Dropped at level 0 here as
	 * well as by the caller, because the paint for the untick runs before the
	 * caller hears of it.
	 */
	note?: () => string | null;
	/** Run when the level changes, and only then. */
	onSet: (level: number) => void;
	/**
	 * Answer Up and Down where the caller owns that axis, and say whether it did.
	 *
	 * `step` is the level step the ring would otherwise have taken, `+1` for Up.
	 * A caller moving *down* a list is moving away from it, so Track spells its
	 * own move `-step`: one axis is the level's and the other is the list's, and
	 * they point opposite ways.
	 *
	 * **The answer governs `preventDefault` and nothing else.** A caller that
	 * declines still keeps the key — a checklist of one flag has nowhere to move
	 * to, and stepping the level instead would give one card two meanings for one
	 * key depending on how many rows it happened to have.
	 *
	 * Omitted, the ring steps, which is what a cell wants.
	 *
	 * **One consumer, and §1 says one consumer earns no generalisation — so the
	 * sentence for why it climbed anyway belongs here.** It is not a shared
	 * behaviour extracted early; it is the one axis on which the four callers
	 * genuinely disagree, and the module cannot serve all four without it. The
	 * alternative is a second `keydown` listener on the same element, with the
	 * caller's registered first and calling `stopImmediatePropagation` — which
	 * rests a correctness property on listener registration order across a module
	 * boundary, the exact shape `docs/BACKLOG.md` § Patterns already carries a row
	 * about for `card-face.ts` and `editable.ts`. A parameter costs one optional
	 * member; that costs a rule nothing can check.
	 */
	onVertical?: (step: number) => boolean;
}

/** What the caller keeps: a way to move the ring, and a way to redraw it. */
export interface RingControl {
	/**
	 * Move to a level and paint it, **without reporting it**.
	 *
	 * The programmatic route, where a press is the reader's: a caller holding a
	 * record of its own moves the ring and decides for itself when the note is
	 * told. Track fills its `Run.setMarks` from this, and that member's contract
	 * is exactly this one — "move the run without writing" — because a card
	 * sweeping three rows owes the note one change and not three.
	 */
	setLevel: (level: number) => void;
	/** Redraw at the level the control is holding. */
	repaint: () => void;
}

/**
 * Wire a ring: paint it, name it, and answer the press, the keys and the hold.
 *
 * Paints once before returning, so a caller never has to remember to.
 */
export function bindRingControl(options: RingControlOptions): RingControl {
	const {
		button,
		column,
		count,
		graded,
		name,
		nameOnScreen,
		note,
		onSet,
		onVertical,
	} = options;
	let level = options.level;

	/**
	 * The word the ring is not already showing, or null where there is none.
	 *
	 * An unnamed level shows the number that is the whole answer, and a plain
	 * toggle shows a fill: neither has a word a tooltip could add.
	 */
	const word = (): string | null =>
		graded && column.levels !== undefined ? levelName(column, level) : null;

	const paint = (): void => {
		// Everything a reader sees comes from the shared painter, so the layout
		// editor's sample of this control cannot drift from the control. What is
		// here is what the painter must not carry, because its other consumer
		// names its own rings after a different fact (see the header): the
		// naming, and the routes to a name the ring is not showing.
		paintLevelRing(button, column, level, graded);
		if (count === 1) {
			// Two states is a toggle button and ARIA has a word for it, which is
			// the whole of what an unnamed flag says: `aria-pressed` carries the
			// state, and a "Yes" or a "No" beside it would be a second name for
			// one state, announced after the platform had already said it
			// (`PATTERNS` §6, `SPEC` §13). More than two states is not a toggle
			// button, so those carry the state in the name instead.
			button.setAttribute('aria-pressed', String(level > 0));
			button.setAttribute('aria-label', name);
		} else {
			button.setAttribute('aria-label', `${name}: ${levelName(column, level)}`);
		}
		// A tooltip repeating what is already legible is noise fired at every
		// pass, as the card's label learned. Where the name is on screen the only
		// thing that can be missing is the level's word; where it is not, the
		// name is the first thing missing and the word is added to it.
		const shown = word();
		const named = nameOnScreen
			? shown
			: shown === null
				? name
				: `${name}: ${shown}`;
		const extra = level > 0 ? (note?.() ?? null) : null;
		const said =
			extra === null ? named : named === null ? extra : `${named}\n${extra}`;
		if (said === null) button.removeAttribute('title');
		else button.setAttribute('title', said);
	};

	/**
	 * Move to a level and paint it, saying nothing. Answers whether it moved.
	 *
	 * The silent half, which is what the returned `setLevel` is: reporting is a
	 * press's business, and a caller driving the ring from a record of its own
	 * owns when the note hears about it.
	 */
	const place = (next: number): boolean => {
		if (next === level) return false;
		level = next;
		// Paint before reporting: a write producing an identical file does not
		// rebuild the view, so a control that waited for the round trip would
		// sometimes never answer the press at all (`PATTERNS` §5).
		paint();
		return true;
	};

	/** What a press does: move, paint, and then say so — only if it moved. */
	const report = (next: number): void => {
		if (place(next)) onSet(level);
	};

	// A glyph is an abbreviation, and on a touch device `title` is not a route to
	// the word behind it — there is no hover to find it with. A long press is
	// that route, and it says exactly what the tooltip says: bound on every ring,
	// reading the attribute rather than recomputing the word, and opening nothing
	// where there is nothing the ring is not already saying, which is what a
	// `null` provider already means to `bindLongPress` (`docs/UI.md` §7).
	const longPressed = bindLongPress(button, () => button.getAttribute('title'));

	// Clicking cycles and wraps, so one control reaches every level and returns
	// to none without a second gesture. The arrows step without wrapping, for the
	// hand that wants to aim rather than count.
	button.addEventListener('click', () => {
		// The press that opened the bubble ends in a click, and it did not mean
		// "change the level".
		if (longPressed()) return;
		report(level === count ? 0 : level + 1);
	});

	button.addEventListener('keydown', (event) => {
		const step =
			event.key === 'ArrowRight' || event.key === 'ArrowUp'
				? 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowDown'
					? -1
					: 0;
		if (step === 0) return;
		// One route in: Enter and Space arrive as the button's own click, so
		// nothing here answers them (`PATTERNS` §6).
		if (
			onVertical !== undefined &&
			(event.key === 'ArrowUp' || event.key === 'ArrowDown')
		) {
			if (onVertical(step)) event.preventDefault();
			return;
		}
		event.preventDefault();
		report(Math.max(0, Math.min(count, level + step)));
	});

	paint();
	return {
		setLevel: (next: number): void => {
			place(next);
		},
		repaint: paint,
	};
}
