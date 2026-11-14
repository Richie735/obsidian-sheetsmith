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
 * **Where the door goes is the caller's**: beside a Track's label, and at a
 * Table's or a Roster's row end, one door for the whole row.
 *
 * **It also closes a row onto that one door** (`finishRowDoor`), which is the
 * same job read at the row: a ring's door at the row's end carries the row's
 * computed accounts with it, so whether a Total's notes take a mark of their
 * own or go into the door depends on whether a ring on the row was set. That
 * decision is the door's placement rule, so the no-ring fallback — each
 * computed cell's note mark where it was — is decided here, beside the door it
 * stands in for, rather than in each row that would otherwise ask it twice.
 *
 * **Shared by Table, Roster and Track**, three consumers, which is §1's
 * extraction line met exactly: the drawn mapping, the description, the live
 * line and the door are one behaviour on three surfaces. It knows no caller: the
 * caller hands over the account, the door's name, where the door goes, and how
 * to announce. In no registry, declaring no `ComponentDefinition`, taking
 * nothing from `obsidian` — its door is `account-door.ts`'s — and touching no file.
 */

import { FieldValue, ModifierContext, StateAccount } from '../types';
import { refold, stateKey } from '../formula/modifier-states';
import { AccountDoor, renderAccountDoor } from './account-door';
import {
	ModifierAccount,
	ownNowLine,
	stampStateHost,
	stateAccountText,
	stateOwnDescription,
} from './modifier-breakdown';
import { renderAccountNotes } from './note-mark';
import { RingControlOptions } from './ring-control';
import { StateColumn, stateColumn } from './row-states';

/** The door's class, which the stylesheet's glyph-button selector list names. */
export const STATE_DOOR_CLASS = 'sheetsmith-state-door';

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
		place?: { cls?: string; notes?: string | null },
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
 * A door's account from its parts: each headed by its column's name where there
 * is more than one, a blank line between. One spelling for a row's door, a
 * Table's or a Roster's (`finishRowDoor`), and a dropdown's (`card.ts`), which
 * carry parts the same way.
 */
export function doorText(parts: readonly DoorPart[]): string {
	const headed = parts.length > 1;
	return parts.map((part) => (headed ? `${part.heading}\n${part.text()}` : part.text())).join('\n\n');
}

/**
 * Draw one door onto several accounts: a row's, whose door sits at the row's
 * end and carries every ring on the row a modifier set, in column order, then
 * the row's computed accounts (`docs/features/non-number-modifiers.md`, "One
 * door per row"). **Where it carries more than one part, each opens with its
 * column's name** — `Training`, `Total` — as the number account heads its notes
 * with `Notes`, so a reader can tell whose `Now Proficient` and whose `Total +1`
 * each is; a door of one part needs no heading and has none. The description is
 * the first ring's own where one differs, so a reader is told of a ring the note
 * and the sheet disagree on wherever the door is.
 */
function renderRowDoor(
	parent: HTMLElement,
	name: string,
	sets: readonly StateRing[],
	parts: readonly DoorPart[],
	place: { cls?: string } = {},
): HTMLButtonElement {
	const text = () => doorText(parts);
	const own = () => sets.map((set) => set.own()).find((said) => said !== null) ?? null;
	const { button, refresh } = renderStateDoor(parent, name, text, place, own);
	for (const set of sets) set.watch(refresh);
	return button;
}

/** A ring on a row that a modifier set, gathered as the row is drawn. */
export interface RowState {
	set: StateRing;
	/** The account of what was noted at the ring's own name, or null. */
	notes: string | null;
	/** Its column's name, the key where the column has none. */
	heading: string;
}

/** A computed cell on a row, with the account its own press opens. */
export interface RowAccount {
	td: HTMLElement;
	account: ModifierAccount | null;
	/** Its column's name, the key where the column has none. */
	heading: string;
}

/**
 * Close a row once every cell is drawn: **one door at the row's end where any
 * ring on it was set**, carrying each set ring's lines with the notes at its own
 * name, then each computed cell's account; and **where none was, each computed
 * cell's note mark where it was**, after its number.
 *
 * Table's row and Roster's row, which put a ring's door in the same place
 * (Table's once sat beside the ring, in its cell). One spelling, because what goes into the
 * door, in what order and under which heading is the whole of the rule: two
 * copies could only be tested for still agreeing (`PATTERNS` §1). The end cell
 * takes `holding`, the noted cell's own class, since the door sits in the note
 * mark's slot and the column keeps one line-up whichever of the two a row holds
 * — the caller's `reserveNoteSlots`, with `STATE_DOOR_CLASS` counted alike.
 */
export function finishRowDoor(
	end: HTMLElement | null,
	name: string,
	states: readonly RowState[],
	accounts: readonly RowAccount[],
	holding: string,
): void {
	if (states.length === 0 || end === null) {
		for (const { td, account } of accounts) renderAccountNotes(td, account, holding);
		return;
	}
	const parts: DoorPart[] = [
		...states.map(({ set, notes, heading }) => ({
			heading,
			text: () => (notes === null ? set.text() : `${set.text()}\n\n${notes}`),
		})),
		...accounts.flatMap(({ account, heading }) =>
			account?.text === null || account?.text === undefined
				? []
				: [{ heading, text: () => account.text as string }],
		),
	];
	end.classList.add(holding);
	renderRowDoor(
		end,
		name,
		states.map((state) => state.set),
		parts,
	);
}

/**
 * A ring in a row's cell, as a modifier may have set it: the options to hand
 * `bindRingControl`, the account the row's door carries, and the stamp the form
 * tint reads on the row (D11). Table's cell and Roster's cell are one control,
 * so this is one spelling of it; a row with no name a change can address, or
 * nothing pushed at it, gets no options and no account.
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
	 * The account's ring, for the row's door at its end (`finishRowDoor`), or
	 * null where nothing was pushed; `stamp` marks the row for the form tint.
	 */
	set: StateRing | null;
	stamp: (row: HTMLElement) => void;
} {
	const { modifiers, name, column, stored, button, announce } = options;
	const at = stateColumn(column);
	const account = name === undefined ? null : (modifiers?.state?.(name, at, stored) ?? null);
	if (account === null || name === undefined) {
		return { ring: {}, set: null, stamp: () => undefined };
	}
	const set = stateRing(account, announce, true);
	const stamp = (row: HTMLElement) => stampStateHost(button, name, at, account.stored, row);
	return { ring: set.ring, set, stamp };
}

/**
 * Draw the door into `parent`, through the one door there is
 * (`account-door.ts`'s `renderAccountDoor`).
 */
function renderStateDoor(
	parent: HTMLElement,
	name: string,
	text: () => string,
	place: {
		/** The door's class: the row door's own, or a caller's door it borrows. */
		cls?: string;
	} = {},
	description?: () => string | null,
): AccountDoor {
	return renderAccountDoor(parent, { cls: place.cls ?? STATE_DOOR_CLASS, name, text, description });
}
