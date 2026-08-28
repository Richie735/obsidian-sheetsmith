/*
 * What a modified number is made of, as one block of text.
 *
 * Nothing in the surveyed category answers "why is this 17" at the number.
 * Sandbox System Builder colours a modified attribute green; Custom System
 * Builder ships an Active Effect Displayer with an Origin Column. Both are
 * separate surfaces from the number, and both establish the floor: a sheet must
 * at minimum *show* that a value was modified. Here the modifier rows are on the
 * sheet and each names its target, so a modified card can list its own
 * contributors — which is the feature's differentiator rather than a flourish.
 *
 * **One builder, two carriers.** The same text goes into the popover a press
 * opens and into the `.sheetsmith-sr-only` line beside the number, so the two
 * cannot say different things. That is the whole reason this is a module rather
 * than a paragraph inside a component: `card-face.ts` draws it for a Card and a
 * Card set, `table.ts` folds it into the popover a computed cell already opens,
 * and a copy in each could only be held together by a test asserting they still
 * read alike (PATTERNS §1's policy tier).
 *
 * **A suppressed line is listed and says why**, and that is the line the whole
 * breakdown exists for: a reader who bought two rings of protection and watched
 * the number not move will otherwise conclude the plugin is broken.
 *
 * Text and not markup, deliberately. `showPopover` sets `textContent` and
 * `.sheetsmith-popover` already carries `white-space: pre-wrap`, so a newline
 * here is already a line — and a second kind of panel beside a row of cards is
 * what `docs/UI.md` §9 forbids. What that costs is per-line styling: a
 * suppressed line cannot be drawn faint, so the parenthetical carries it.
 */

import { ModifierBreakdown } from '../types';

/**
 * The mark on a number something has been pushed at.
 *
 * A shape channel and not a colour one: `docs/UI.md` §1 gives the plugin no
 * colours of its own — Sandbox's green is exactly what may not be drawn here —
 * and §6 refuses a mark whose only channel is fill strength. `text-decoration`
 * also survives forced-colors mode, where a border or a shadow would not.
 *
 * Named for the mark rather than for a caller, the way `.sheetsmith-level-ring`
 * is: a table cell carrying a class called `card` is a name a reader would
 * believe. Both consumers add this one class and the rule is written once.
 */
export const MODIFIED_CLASS = 'sheetsmith-modified';

/** A number as a modifier reads: "+2", "-1". Zero never reaches here. */
function signed(amount: number): string {
	return amount > 0 ? `+${amount}` : String(amount);
}

/**
 * The breakdown as text, or null where nothing modifies the number.
 *
 * Null rather than an empty string, so a caller cannot draw a mark over nothing:
 * the mark and the text are the same fact, and asking for one is asking whether
 * there is the other. Takes an absent breakdown too, which is a component drawn
 * with no sheet around it — the same answer, for the same reason.
 *
 * No lines arrives both from a name nothing pushes at and from a name that
 * accepts no modifier, and the two look the same here on purpose: the stray
 * target is reported at the row that wrote it, which is where the fix is.
 */
export function modifierBreakdown(
	breakdown: ModifierBreakdown | undefined,
): string | null {
	if (breakdown === undefined || breakdown.lines.length === 0) return null;
	/*
	 * **The component's label appears only where the breakdown draws on more than
	 * one component, and then on every line of it.**
	 *
	 * The rule, so a reviewer can check it against the text rather than guess:
	 * *a token that is the same on every line of a breakdown carries no
	 * information and is dropped.* That is already why an untyped modifier says
	 * nothing rather than "untyped", three lines down, and the common sheet has
	 * one modifier table — so qualifying every line there would put the same word
	 * in front of every contributor and push the amount, which is what the reader
	 * came for, further right on each one.
	 *
	 * What it buys is the case the row's label cannot carry: worn items and
	 * weapons on one sheet, each with a row called "Ring", giving two lines a
	 * reader cannot tell apart.
	 *
	 * **Uniformly across the breakdown rather than per line**, which is the half
	 * worth stating. Qualifying only the lines that collide would leave a
	 * reader unable to tell where an *un*qualified line came from, and would make
	 * one line's text depend on another line's spelling. Deciding it once per
	 * breakdown means the shape changes only when the fact does — when the last
	 * row from a second table goes, every line loses its prefix because they
	 * genuinely all come from one place now.
	 */
	const sources = new Set(breakdown.lines.map((line) => line.source));
	const qualify = sources.size > 1;
	const said = breakdown.lines.map((line) => {
		const from = qualify && line.source !== '' ? `${line.source} · ` : '';
		// The type, where the column declared one. An untyped modifier says
		// nothing rather than saying "untyped": every modifier is untyped on a
		// layout that has never heard of bonus types, and a word repeated down
		// every line of every breakdown carries no information.
		const kind = line.type === null ? '' : `${line.type} `;
		const why = line.suppressed === null ? '' : ` (not applied: ${line.suppressed})`;
		return `${from}${line.label} — ${kind}${signed(line.amount)}${why}`;
	});
	// A blank line before the total, so it reads as the sum rather than as one
	// more contributor. Flush with the rest it was a third entry on a
	// two-contributor breakdown. The table cell's own payload already separates
	// the formula from the breakdown this way, so the bubble is known to take it.
	return [...said, '', `Total ${signed(breakdown.total)}`].join('\n');
}
