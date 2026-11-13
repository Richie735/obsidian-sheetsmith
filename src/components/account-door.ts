/*
 * A glyph-only door onto a value's read-only account
 * (`docs/features/text-value-modifiers.md`, and `docs/UI.md` §9's "Which
 * glyph"): the `info` button, its `.sheetsmith-sr-only` twin, and the popover a
 * press opens.
 *
 * One job, which is `PATTERNS.md` §1's test: draw a door whose class, name and
 * words are the caller's. Split out of `note-mark.ts` once three surfaces drew
 * the same control, so the note mark is one caller of it rather than its home.
 * In no registry, declaring no `ComponentDefinition`, taking only `setIcon`
 * from `obsidian`, and touching no file.
 */

import { setIcon } from 'obsidian';
import { showPopover } from '../ui/popover';
import { ACCOUNT_GLYPH } from './modifier-breakdown';

/** Ids for the twins, unique across every sheet this window draws. */
let twins = 0;

/** What a caller keeps of a door onto an account. */
export interface AccountDoor {
	button: HTMLButtonElement;
	/** Re-read the account and the description into the twin and the button. */
	refresh: () => void;
}

/**
 * Draw a glyph-only door onto a value's read-only account into `parent`: the
 * `info` button, then its `.sheetsmith-sr-only` twin holding the account, which
 * the button's `aria-describedby` points at, so the popover and what a screen
 * reader is told are one string from one builder. A press is the door's, never
 * the card's or the cell's that holds it, and re-reads the account first.
 *
 * **The shared door for three of them**, on `PATTERNS.md` §1's third consumer:
 * the note mark (`note-mark.ts`), a ring's state door (`state-ring.ts`) and a
 * dropdown's door (`card-face.ts`) are one control with three names and three
 * classes, so the class, the name and the words arrive as arguments and this
 * knows none of them. **Not yet every door**: Pool's ceiling door and Track's
 * breakdown door still build their own (`docs/BACKLOG.md` § Patterns).
 */
export function renderAccountDoor(
	parent: HTMLElement,
	door: {
		/** The button's class, which places it and names it in the stylesheet. */
		cls: string;
		/** The whole of what a listener hears on the glyph (`docs/UI.md` §6). */
		name: string;
		/** The account as it reads now. */
		text: () => string;
		/** The button's description as it reads now, or null for none. */
		description?: () => string | null;
	},
): AccountDoor {
	const button = parent.createEl('button', { cls: door.cls });
	button.type = 'button';
	button.setAttribute('aria-label', door.name);
	/*
	 * **Straight into the button, and not into a span inside it.** The button
	 * centres its children as a flex box; a span there is a line box, and the
	 * SVG inside it is inline, so it sat on that line's baseline with the
	 * descender's room below it — 1.5px above the centre of the number or the
	 * ring it follows. The button's `aria-label` names it, so the SVG needs no
	 * `aria-hidden` of its own.
	 */
	setIcon(button, ACCOUNT_GLYPH);
	const twin = parent.createSpan({ cls: 'sheetsmith-sr-only' });
	twin.id = `sheetsmith-account-${++twins}`;
	// The shared popover points the button at itself while it is open and puts
	// this back when it closes, so the twin survives a press.
	button.setAttribute('aria-describedby', twin.id);
	const refresh = () => {
		twin.textContent = door.text();
		const description = door.description?.() ?? null;
		if (description === null) button.removeAttribute('aria-description');
		else button.setAttribute('aria-description', description);
	};
	refresh();
	button.addEventListener('click', (event) => {
		// A press on the door is the door's: a card routes a press to its nearest
		// field, and a computed cell opens its own popover on the same press.
		event.stopPropagation();
		refresh();
		showPopover(button, door.text());
	});
	return { button, refresh };
}
