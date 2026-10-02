/*
 * The mark on a value something has noted, and the door onto its account
 * (`docs/features/modifier-notes.md`).
 *
 * A glyph-only `<button>` drawing Lucide `info`, drawn only where at least
 * one note is listed for the name. **A shape and not a colour** (`docs/UI.md`
 * §1), and an SVG in `currentColor`, so it survives `forced-colors: active`. It
 * is distinct from the arithmetic mark on every surface that draws one: the
 * arithmetic mark is an underline on the number, and this is a glyph beside it.
 *
 * **A button, so it is a tab stop**, which the underline deliberately is not.
 * The cost is one stop per value carrying a note, which is one or two on a
 * sheet; the gain is that the words reach a keyboard reader at all. Enter and
 * Space arrive as a click, so there is one route in.
 *
 * **`info`, the glyph `docs/UI.md` §9 gives every read-only account**: `zap`
 * edits, and `info` opens what reaches a value — the arithmetic, the notes, or
 * both — so this mark and a Track's breakdown door share it. It was
 * `sticky-note` until the land stop, where beside a Card's own editable note line
 * it read as that card's note, and as something to write in. Distinct from the
 * arithmetic mark still, because that mark is the underline.
 *
 * One painter for its three consumers — Card (through `card-face.ts`), Table and
 * Roster — which is `PATTERNS.md` §1's extraction line met exactly. It knows
 * nothing about where it is drawn: the caller hands it the parent and the text,
 * and places the parent.
 */

import { setIcon } from 'obsidian';
import { ModifierContext } from '../types';
import { showPopover } from '../ui/popover';
import { ModifierAccount, modifierAccount } from './modifier-breakdown';

/** The mark's class, which the stylesheet's glyph-button selector list names. */
export const NOTE_MARK_CLASS = 'sheetsmith-note-mark';

/** The glyph, named once so the docs, the tests and the paint agree. */
export const NOTE_GLYPH = 'info';

/**
 * The class a cell takes when its column holds a note mark anywhere, and the one
 * a table takes when any of its band heads does (`docs/features/modifier-notes.md`).
 */
export const NOTE_COLUMN_CLASS = 'sheetsmith-note-column';
export const NOTE_BANDS_CLASS = 'sheetsmith-note-bands';

/** Ids for the twins, unique across every sheet this window draws. */
let twins = 0;

/**
 * Draw the note mark into `parent`: the button, then its `.sheetsmith-sr-only`
 * twin holding the whole account.
 *
 * **The twin is the Track door's spelling**: the button's `aria-describedby`
 * points at it, so the popover and what a screen reader is told are one string
 * from one builder. The button's own name is the count — `1 note`, `3 notes` —
 * because its visible mark is not words (`docs/UI.md` §6).
 */
export function renderNoteMark(
	parent: HTMLElement,
	/** The value's whole account, from `modifierAccount`. */
	account: string,
	/** How many notes it lists. */
	count: number,
): HTMLButtonElement {
	const button = parent.createEl('button', { cls: NOTE_MARK_CLASS });
	button.type = 'button';
	button.setAttribute('aria-label', count === 1 ? '1 note' : `${count} notes`);
	/*
	 * **Straight into the button, as the Track door's glyph is, and not into a
	 * span inside it.** The button centres its children as a flex box; a span
	 * there is a line box, and the SVG inside it is inline, so it sat on that
	 * line's baseline with the descender's room below it — 1.5px above the
	 * centre of the number or the ring it follows. The button's `aria-label`
	 * names it, so the SVG needs no `aria-hidden` of its own.
	 */
	setIcon(button, NOTE_GLYPH);
	const twin = parent.createSpan({ cls: 'sheetsmith-sr-only', text: account });
	twin.id = `sheetsmith-note-account-${++twins}`;
	/*
	 * Set again on focus, because the shared popover owns the attribute while it
	 * is open — it points the anchor at itself and removes the attribute when it
	 * closes — so after one press the twin would otherwise be unreachable.
	 */
	const describe = () => button.setAttribute('aria-describedby', twin.id);
	describe();
	button.addEventListener('focus', describe);
	button.addEventListener('click', (event) => {
		// A press on the mark is the mark's, never the card's or the cell's that
		// holds it: a card routes a press to its nearest field, and a computed
		// cell opens its own popover on the same press.
		event.stopPropagation();
		showPopover(button, account);
	});
	return button;
}

/**
 * Draw the note mark on a value that has no breakdown of its own — a stored
 * published cell, a column total — where a note has been pushed at its name.
 * Answers whether it drew one.
 *
 * **Asks `notable` before it asks for a breakdown, and that ordering is the
 * point of the helper.** These values never opened a breakdown before notes
 * existed, so asking at each of them would move the modifier walk's first entry
 * on a sheet carrying no note at all (`docs/features/modifier-notes.md` F). One
 * spelling, because Table and Roster both draw such values and a copy that
 * skipped the question would be invisible in every shot.
 *
 * The mark's popover is the whole account, both groups — by default read as a
 * breakdown inside a component with rows, so every line names its component.
 */
export function renderNotesAt(
	parent: HTMLElement,
	modifiers: ModifierContext | undefined,
	/** The name the value publishes, or undefined where it publishes none. */
	name: string | undefined,
	/** The class the parent takes while it holds a mark, for its own layout. */
	holding: string,
	/**
	 * `modifierAccount`'s two readings of the surface: the number drawn, for the
	 * total under an override, and whether the value sits among rows. So a value
	 * whose own press opens an account opens the same one from its mark.
	 */
	reading: { shown?: number | null; inRows?: boolean } = {},
): boolean {
	if (name === undefined || modifiers?.notable?.(name) !== true) return false;
	const account = modifierAccount(
		modifiers.breakdown(name),
		reading.shown ?? null,
		reading.inRows ?? true,
	);
	return renderAccountNotes(parent, account, holding);
}

/**
 * Draw the note mark for an account already in hand, where it lists any notes,
 * and answer whether it drew one.
 *
 * **The one place "does this value owe a note mark" is decided**: a Card, a
 * Table's computed cell and a Roster's computed cell each build an account for
 * their own number's press, and asking the account here rather than at each of
 * them is what keeps the three from coming to different answers about the same
 * account (`PATTERNS.md` §1, share the application).
 */
export function renderAccountNotes(
	parent: HTMLElement,
	account: ModifierAccount | null | undefined,
	/** The class the parent takes while it holds a mark, for its own layout. */
	holding: string,
): boolean {
	if (account === null || account === undefined) return false;
	if (account.notes === 0 || account.text === null) return false;
	parent.classList.add(holding);
	renderNoteMark(parent, account.text, account.notes);
	return true;
}

/**
 * Mark every cell of a column that holds a note mark anywhere, and a table whose
 * band heads hold one, so the stylesheet reserves the mark's slot in the cells
 * that have none and a column of numbers or rings stays lined up.
 *
 * **Decided by the render, after the rows are drawn, rather than by `:has()`.**
 * A column is a position across rows, and no selector can say "every cell at
 * this index of a table where some cell at this index holds a mark" without one
 * rule per index. The render already knows: a cell holding a mark is one this
 * file drew into. So this walks the finished table once, by column position, and
 * the stylesheet reads one class. A table with no mark gains no class at all,
 * which is what keeps a sheet with no notes exactly as it was.
 *
 * A cell spanning several columns — a Roster band head — is no column's, and is
 * covered by the bands class instead.
 */
export function reserveNoteSlots(table: HTMLTableElement): void {
	const holds = (cell: Element) =>
		Array.from(cell.children).some((child) => child.classList.contains(NOTE_MARK_CLASS));
	const noted = new Set<number>();
	for (const row of Array.from(table.rows)) {
		let at = 0;
		for (const cell of Array.from(row.cells)) {
			if (cell.colSpan === 1 && holds(cell)) noted.add(at);
			at += cell.colSpan;
		}
	}
	/*
	 * Only cells whose content is a drawn value or a ring take the slot. A
	 * field — a stored number's input, a level's select — is a box wider than
	 * any value beside it, so reserving after it would widen the column for a
	 * line-up the field's own fixed width already gives.
	 */
	const reservable = (cell: Element) =>
		Array.from(cell.children).some(
			(child) =>
				child.classList.contains('sheetsmith-table-value') ||
				child.classList.contains('sheetsmith-level-ring'),
		);
	for (const row of Array.from(table.rows)) {
		let at = 0;
		for (const cell of Array.from(row.cells)) {
			if (cell.colSpan === 1 && noted.has(at) && reservable(cell)) {
				cell.classList.add(NOTE_COLUMN_CLASS);
			}
			at += cell.colSpan;
		}
	}
	const bandNoted = Array.from(table.querySelectorAll('.sheetsmith-roster-band-inner')).some(holds);
	if (bandNoted) table.classList.add(NOTE_BANDS_CLASS);
}
