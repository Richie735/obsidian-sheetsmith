/*
 * A ring a modifier set: what it draws, the words for the reader's own level,
 * and the door onto why (`docs/features/non-number-modifiers.md`).
 *
 * One sentence, which is `PATTERNS` §1's test: it turns one level or flag's
 * account into what a ring owes a reader once a modifier has set it. **The ring
 * draws the modified state and a press edits the stored one**, so the control
 * needs a mapping from the stored level to the drawn one, words for the stored
 * level where the two differ — an `aria-description` and the `title`'s second
 * line on the ring and the door, and the account's first line, `Your own:
 * Untrained` — and a line for the live region when a press moves the note and
 * not what the ring draws. The ring's members are `bindRingControl` options;
 * this module fills them from the account. **No popover opens on a press.**
 * No mark on screen stands for the reader's own level: one was tried beside the
 * ring and as the door's face, and read as a second toggle that does nothing.
 *
 * **The door is the read-only account's glyph** (`docs/UI.md` §9, "Which
 * glyph"): the ring's press is already taken by editing and a ring has no text
 * to underline, so the door is the mark itself — Pool's ceiling argument, "a
 * door rather than a press on the number, because the numeral has no press of
 * its own". Drawn wherever the address lists a line, applied or not, or is
 * refused; a change whose condition is false lists nothing and draws none.
 *
 * **Where the door goes is the caller's**: after the ring in a Table cell,
 * beside a Track's label, and at a Roster row's end, one door for the whole row
 * (`renderRowDoor`).
 *
 * **Shared by Table, Roster and Track**, three consumers, which is §1's
 * extraction line met exactly: the drawn mapping, the description, the live
 * line and the door are one behaviour on three surfaces. It knows no caller: the
 * caller hands over the account, the door's name, where the door goes, and how
 * to announce. In no registry, declaring no `ComponentDefinition`, taking only
 * `setIcon` from `obsidian` and touching no file.
 */

import { setIcon } from 'obsidian';
import { FieldValue, ModifierContext, StateAccount } from '../types';
import { refold, stateKey } from '../formula/modifier-states';
import { showPopover } from '../ui/popover';
import {
	ACCOUNT_GLYPH,
	modifiersOnName,
	ownNowLine,
	stampStateHost,
	stateAccountText,
	stateOwnDescription,
} from './modifier-breakdown';
import { RingControlOptions } from './ring-control';
import { StateColumn, stateColumn } from './row-states';

/** The door's class, which the stylesheet's glyph-button selector list names. */
export const STATE_DOOR_CLASS = 'sheetsmith-state-door';

/**
 * The empty box a ring cell holds in place of a door, in a column where some
 * other cell holds one, so a column of rings stays in line whether or not a
 * row is marked (`reserveNoteSlots`' argument).
 */
export const STATE_SLOT_CLASS = 'sheetsmith-state-slot';

/** The class a cell holding a door or a slot takes, for its own layout. */
export const STATE_CELL_CLASS = 'sheetsmith-state-cell';

/**
 * The class a Roster card strip takes when the layout can set a level or flag
 * in it, which the stylesheet gives a wider card floor (`roster.ts`).
 */
export const STATE_STRIP_CLASS = 'sheetsmith-roster-cards-stateful';

/**
 * Whether any change the layout declares is aimed at a level or flag among the
 * names `owns` claims — read from the layout's definitions alone, never from
 * what applies, so the answer is the same with every form in play or none.
 *
 * **The layout's and not the note's**: a layout is what a component's room is
 * sized from, and a change typed in a note comes and goes with an edit, so a
 * card sized from it would move under the reader's own typing.
 */
export function layoutSetsStateIn(
	modifiers: ModifierContext | undefined,
	owns: (name: string) => boolean,
): boolean {
	const states = new Set(
		(modifiers?.states ?? [])
			.filter((target) => owns(target.name))
			.map((target) => stateKey(target.name, target.column ?? null)),
	);
	if (states.size === 0) return false;
	return (modifiers?.definitions ?? []).some((definition) =>
		definition.changes.some((change) => states.has(stateKey(change.target, change.column ?? null))),
	);
}

/** Ids for the twins, unique across every sheet this window draws. */
let twins = 0;

/** What a caller keeps of a ring a modifier set. */
export interface StateRing {
	/** The members to hand `bindRingControl`. */
	ring: Pick<RingControlOptions, 'drawn' | 'ownLevel' | 'onUnshown'>;
	/** The account as it reads now, after any press: what the door opens. */
	text: () => string;
	/** The door's description as it reads now: the reader's own, or null. */
	own: () => string | null;
	/** Run `then` whenever a press moves what the note holds. */
	watch: (then: () => void) => void;
	/**
	 * Draw the door onto this account into `parent`, its description and its
	 * account kept in step with the ring as a press moves the note
	 * (`renderStateDoor`).
	 */
	door: (
		parent: HTMLElement,
		name: string,
		place?: { cls?: string; reserved?: boolean; notes?: string | null },
	) => HTMLButtonElement;
}

/**
 * Turn one account into the ring's options and its door's text.
 *
 * `announce` is the component's own live region: a press the ring does not
 * plainly show says `Your own is now Proficient` there, since a listener has
 * nothing else to hear it by.
 */
export function stateRing(
	account: StateAccount,
	announce: (text: string) => void,
	/**
	 * That the ring is read inside a component with rows, so every line names
	 * its component however few there are — the number account's own rule,
	 * read at the same place (`modifierAccount`'s `inRows`).
	 */
	inRows?: boolean,
): StateRing {
	/** The account against the level the note now holds, which a press moves. */
	let current = account;
	/** Whatever was drawn onto this account, redrawn as a press moves the note. */
	const watchers: (() => void)[] = [];
	const at = (stored: number): StateAccount => {
		if (stored !== current.stored) {
			current = refold(account, stored);
			for (const then of watchers) then();
		}
		return current;
	};
	const set: StateRing = {
		ring: {
			drawn: (stored) => at(stored).drawn,
			ownLevel: (stored) => stateOwnDescription(at(stored)),
			onUnshown: (stored) => announce(ownNowLine(at(stored))),
		},
		text: () => stateAccountText(current, inRows),
		own: () => stateOwnDescription(current),
		watch: (then) => watchers.push(then),
		door: (parent, name, place = {}) => {
			const notes = place.notes ?? null;
			const text = () => (notes === null ? set.text() : `${set.text()}\n\n${notes}`);
			return renderRowDoor(parent, name, [set], [{ heading: '', text }], place);
		},
	};
	return set;
}

/** One part of a row door's account: its column's name and its lines. */
export interface DoorPart {
	heading: string;
	text: () => string;
}

/**
 * Draw one door onto several accounts: a Roster row's, whose door sits at the
 * row's end and carries every ring on the row a modifier set, in column order,
 * then the row's computed accounts (`docs/features/non-number-modifiers.md`,
 * "One door per row"). **Where it carries more than one part, each opens with
 * its column's name** — `Training`, `Total` — as the number account heads its
 * notes with `Notes`, so a reader can tell whose `Now Proficient` and whose
 * `Total +1` each is; a door of one part needs no heading and has none. The
 * description is the first ring's own where one differs, so a reader is told
 * of a ring the note and the sheet disagree on wherever the door is.
 */
export function renderRowDoor(
	parent: HTMLElement,
	name: string,
	sets: readonly StateRing[],
	parts: readonly DoorPart[],
	place: { cls?: string; reserved?: boolean } = {},
): HTMLButtonElement {
	const headed = parts.length > 1;
	const text = () =>
		parts.map((part) => (headed ? `${part.heading}\n${part.text()}` : part.text())).join('\n\n');
	const { button, twin } = renderStateDoor(parent, name, text, place);
	const describe = () => {
		const own = sets.map((set) => set.own()).find((said) => said !== null) ?? null;
		if (own === null) button.removeAttribute('aria-description');
		else button.setAttribute('aria-description', own);
		twin.textContent = text();
	};
	describe();
	for (const set of sets) set.watch(describe);
	return button;
}

/**
 * A ring in a row's cell, as a modifier may have set it: the options to hand
 * `bindRingControl`, and what to draw once it is bound — the door after the
 * ring, and the stamp the form tint reads on the row (D11). Table's cell and
 * Roster's cell are one control, so this is one spelling of it; a row with no
 * name a change can address, or nothing pushed at it, gets no options and
 * draws nothing.
 */
export function cellStateRing(options: {
	modifiers: ModifierContext | undefined;
	/** The row's published name, or undefined where it has none. */
	name: string | undefined;
	column: StateColumn;
	/** What the note stores, as the row scope types it. */
	stored: FieldValue;
	button: HTMLButtonElement;
	announce: (said: string) => void;
}): {
	ring: Partial<StateRing['ring']>;
	/**
	 * Draw the door and stamp the row, and answer whether a door was drawn.
	 * `notes` is the account of what was noted at the cell's own name: where the
	 * cell has a door, it goes into the door's account rather than a note mark
	 * of its own, since two `info` glyphs side by side in one cell would be two
	 * doors onto one value's account.
	 */
	finish: (cell: HTMLElement, row: HTMLElement, rowLabel: string, notes?: string | null) => boolean;
	/**
	 * The account's ring, for a caller that draws the door elsewhere — a Roster
	 * row's, at the row's end — or null where nothing was pushed; `stamp` marks
	 * the row for the form tint without drawing a door.
	 */
	set: StateRing | null;
	stamp: (row: HTMLElement) => void;
} {
	const { modifiers, name, column, stored, button, announce } = options;
	const at = stateColumn(column);
	const account = name === undefined ? null : (modifiers?.state?.(name, at, stored) ?? null);
	if (account === null || name === undefined) {
		return { ring: {}, finish: () => false, set: null, stamp: () => undefined };
	}
	const set = stateRing(account, announce, true);
	const stamp = (row: HTMLElement) => stampStateHost(button, name, at, account.stored, row);
	return {
		ring: set.ring,
		set,
		stamp,
		finish: (cell, row, rowLabel, notes) => {
			// After the ring, as the cell's door onto why it reads as it does:
			// the ring's press is the ring's.
			set.door(cell, modifiersOnName(`${rowLabel} · ${column.name ?? column.key}`), {
				reserved: true,
				notes: notes ?? null,
			});
			stamp(row);
			return true;
		},
	};
}

/**
 * Draw the door into `parent`: the glyph button, then a `.sheetsmith-sr-only`
 * twin holding the account, which the button's `aria-describedby` points at —
 * the note mark's spelling, so the popover and what a screen reader hears are
 * one string. `name` is the whole of what a listener hears on the glyph.
 */
function renderStateDoor(
	parent: HTMLElement,
	name: string,
	text: () => string,
	place: {
		/** The door's class: the cell door's own, or a caller's door it borrows. */
		cls?: string;
		/**
		 * That the door sits in a cell whose column keeps its slot in every other
		 * ring cell (`reserveStateSlots`), so the cell is stamped for that layout.
		 */
		reserved?: boolean;
	} = {},
): { button: HTMLButtonElement; twin: HTMLElement } {
	const button = parent.createEl('button', { cls: place.cls ?? STATE_DOOR_CLASS });
	button.type = 'button';
	button.setAttribute('aria-label', name);
	setIcon(button, ACCOUNT_GLYPH);
	if (place.reserved === true) parent.classList.add(STATE_CELL_CLASS);
	const twin = parent.createSpan({ cls: 'sheetsmith-sr-only', text: text() });
	twin.id = `sheetsmith-state-account-${++twins}`;
	button.setAttribute('aria-describedby', twin.id);
	button.addEventListener('click', (event) => {
		// The door's press is the door's, never the cell's or the card's.
		event.stopPropagation();
		twin.textContent = text();
		showPopover(button, text());
	});
	return { button, twin };
}

/**
 * Keep the door's slot in every ring cell of a column that holds a state door
 * anywhere, so the stylesheet can give it the door's box and the rings line up.
 *
 * **An element rather than a pseudo-element**, which is where it differs from
 * `reserveNoteSlots`: a ring cell may owe both slots at once, a door's and a
 * note mark's, and a cell has one `::after`. The slot goes straight after the
 * ring, where the door would be. Walked once after the rows are drawn, by
 * column position; a table with no door gains nothing.
 */
export function reserveStateSlots(table: HTMLTableElement): void {
	const holds = (cell: Element) =>
		Array.from(cell.children).some((child) => child.classList.contains(STATE_DOOR_CLASS));
	const doored = new Set<number>();
	for (const row of Array.from(table.rows)) {
		let at = 0;
		for (const cell of Array.from(row.cells)) {
			if (cell.colSpan === 1 && holds(cell)) doored.add(at);
			at += cell.colSpan;
		}
	}
	if (doored.size === 0) return;
	for (const row of Array.from(table.rows)) {
		let at = 0;
		for (const cell of Array.from(row.cells)) {
			const ring = Array.from(cell.children).find((child) =>
				child.classList.contains('sheetsmith-level-ring'),
			);
			if (cell.colSpan === 1 && doored.has(at) && ring !== undefined && !holds(cell)) {
				const slot = createSpan({ cls: STATE_SLOT_CLASS });
				slot.setAttribute('aria-hidden', 'true');
				ring.after(slot);
				cell.classList.add(STATE_CELL_CLASS);
			}
			at += cell.colSpan;
		}
	}
}
