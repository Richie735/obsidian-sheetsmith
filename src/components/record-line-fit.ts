/**
 * How wide a Record set's summary line has to be before it fits on one row,
 * estimated from the fields the layout declares (`docs/features/record-set-stacking-tiers.md`).
 *
 * **Record set's private half, not a shared painter.** It has one consumer and
 * draws nothing; it is apart from `record-set.ts` because it is a second job, a
 * width model with its own measured constants and unit tests, on
 * `modifier-form.ts`'s atomicity terms (PATTERNS §2).
 *
 * **Why an estimate, and why this one.** The line stacks (name and delete on a
 * row, the fields under the name) below the width it fits at, and a container
 * query can neither measure a field nor add widths up. So the component works
 * the fit out from what it knows, the kind of each field and the words it
 * draws, and stamps it in steps of 16px that `sheet.css` tabulates. Words are
 * estimated from their character count at a width per character chosen so that
 * every harness sample comes out at or above its measured width: the estimate
 * errs toward stacking, which costs a line that could have stayed on one row a
 * little sooner. It does not rule out a wrap: a name or option of unusually wide
 * letters (`WWWW`) outruns it, and its line can wrap, which is the accepted
 * residue. The table-name pass rejected a character-count estimate for the
 * opposite reason: it needed an exact floor, where this needs a cautious bound.
 *
 * **In px, because the line is.** Every width on the line is a fixed-px token
 * (`--font-ui-small`, `--font-ui-smaller`, `--size-*`), which follows neither
 * the vault's text size nor the sheet's `em`, and a zoom scales both sides
 * alike. Every constant is the harness's measurement. Pure: no DOM, no
 * `obsidian`.
 */

/** A summary-line field, as much of it as its width depends on. */
export type LineField =
	/** A toggle, a level drawn as a ring, or a modifier glyph: one fixed mark. */
	| { kind: 'mark' }
	/** A computed value. Its text is per record, so it is sized for two characters. */
	| { kind: 'computed' }
	/** A level drawn as a dropdown, as wide as its longest option. */
	| { kind: 'select'; options: readonly string[] }
	/** A number with its name beside it, and the ceiling it draws, if any. */
	| {
			kind: 'number';
			name: string;
			ceiling: 'none' | 'typed' | { fixed: string };
	  }
	/** A text field with its name beside it. */
	| { kind: 'text'; name: string };

/** A ring, a toggle, a modifier glyph: 20.8px measured, each. */
const MARK_PX = 20.8;
/** A computed value of a sign and a digit (`-2` measured 14.2px, `2` 8.1px). */
const COMPUTED_PX = 14.2;
/**
 * Per character of a field's name, beside a number or a text field. Measured:
 * `Uses` 26.9px (6.73 a character), `Level` 28.6 (5.72), `Class` 29.7 (5.94).
 * The largest, so no sample name is estimated short.
 */
const NAME_CHAR_PX = 6.73;
/**
 * Per character of a dropdown's longest option, and the dropdown's own chrome.
 * Measured: `Abjuration` (10) in 73px, `Short rest` (10) beside `Always-on` in
 * 74px, with 10.9px of padding, border and arrow. 6.32 is what holds the second.
 */
const SELECT_CHAR_PX = 6.32;
const SELECT_CHROME_PX = 10.9;
/** A number's value field and the gap before it: 76.1px less a 28.6px name. */
const NUMBER_PX = 47.5;
/** A ceiling the reader types: its separator, its field and their gaps. */
const TYPED_CEILING_PX = 26.3;
/** A ceiling the layout declares: its separator and gaps, then its digits. */
const FIXED_CEILING_PX = 8;
const DIGIT_PX = 8.125;
/** A text field's input at its 14ch, and at its 5ch floor, with the gap before it. */
export const TEXT_PX = 116.6;
export const TEXT_MIN_PX = 42.9;
/** Between two fields (`--size-4-5`). */
export const GAP_PX = 20;
/** Padding, chevron, delete glyph, its margin and the summary's gaps. */
const LINE_CHROME_PX = 96;
/** The name's floor (six ems) and its cap (`13em` at the name's 13px). */
const NAME_FLOOR_PX = 96;
export const NAME_CAP_PX = 169;

/** One step of the tier table: tier N stacks the line up to N × 16px. */
export const STEP_PX = 16;
/** The lowest tier there is: a line with no fields, `96 + 0 + 96` = 192px. */
export const MIN_FIT_TIER = 12;
/**
 * The highest tier `sheet.css` tabulates, 1600px. Eight counters with typed
 * ceilings and four-letter names come to 1211px, and a list holds one text field
 * at most (the group key), so only long names reach past this; such a line
 * takes this tier, which is a residue and not a case.
 */
export const MAX_FIT_TIER = 100;
/**
 * The tier the fallback 320px rule, for an engine with no style queries, stacks
 * to exactly: 20 × 16px. A tier under it stacks to 304px or less, so the
 * fallback would stack that line past its own threshold; such a list wears
 * `-fits-narrow` and the fallback passes it by. From this tier up the fallback
 * stacks no further than the list's own entry, so it takes the fallback.
 */
export const FALLBACK_FIT_TIER = 20;

/** A field's estimated width on the line, and the narrowest it can be drawn. */
export function fieldWidthPx(field: LineField): { width: number; min: number } {
	switch (field.kind) {
		case 'mark':
			return { width: MARK_PX, min: MARK_PX };
		case 'computed':
			return { width: COMPUTED_PX, min: COMPUTED_PX };
		case 'select': {
			const longest = Math.max(0, ...field.options.map((one) => one.length));
			const width = SELECT_CHROME_PX + SELECT_CHAR_PX * longest;
			return { width, min: width };
		}
		case 'text': {
			const name = NAME_CHAR_PX * field.name.length;
			return { width: name + TEXT_PX, min: name + TEXT_MIN_PX };
		}
		case 'number': {
			const ceiling =
				field.ceiling === 'none'
					? 0
					: field.ceiling === 'typed'
						? TYPED_CEILING_PX
						: FIXED_CEILING_PX +
							DIGIT_PX * Math.max(1, field.ceiling.fixed.length);
			const width = NAME_CHAR_PX * field.name.length + NUMBER_PX + ceiling;
			return { width, min: width };
		}
	}
}

/**
 * The narrowest container, in px at 16px, at which a line of fields of these
 * widths sits on one row with its name at six ems.
 *
 * Not a sum, because of how the grid shares its free space: the name's track
 * (`minmax(0, 13em)`) and the fields' (`auto`, from the widest field up to all
 * of them on one row) grow together. So the fields reach their full width
 * `F − m` after the name starts growing, and the name is then that wide, held
 * between its floor and its cap. Measured on every harness list within a pixel.
 */
export function lineFitPx(
	widths: readonly { width: number; min: number }[],
): number {
	const all =
		widths.reduce((sum, one) => sum + one.width, 0) +
		GAP_PX * Math.max(0, widths.length - 1);
	const widest = Math.max(0, ...widths.map((one) => one.min));
	const name = Math.min(Math.max(all - widest, NAME_FLOOR_PX), NAME_CAP_PX);
	return LINE_CHROME_PX + all + name;
}

/**
 * The tier a line is stamped with: its fit rounded up to a step of 16px, within
 * the table. `sheet.css` stacks tier N up to N × 16px, so a line is stacked at
 * least to its estimated fit and less than one step past it.
 */
export function fitTier(fields: readonly LineField[]): number {
	const steps = Math.ceil(lineFitPx(fields.map(fieldWidthPx)) / STEP_PX - 1e-9);
	return Math.min(Math.max(steps, MIN_FIT_TIER), MAX_FIT_TIER);
}
