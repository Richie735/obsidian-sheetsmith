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
 * little sooner. It does not rule out a short line: a field name or option of
 * unusually wide letters (`WWWW`) outruns it, and then the record's name narrows
 * under its floor first, clipped and revealed on hover, and only a shortfall past
 * 96px pushes the fields out of the box. That is the accepted residue
 * (`docs/features/record-summary-fields-first.md`). The table-name pass rejected a character-count estimate for the
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
/**
 * A text field's input at its 14ch, with the gap before it. Its 5ch floor
 * enters no fit: the plain line's fields' track is `max-content`, so a text
 * field is drawn at its 14ch whenever the line is plain, and the floor is the
 * strip's alone.
 */
const TEXT_PX = 116.6;
/** Between two fields (`--size-4-5`). */
export const GAP_PX = 20;
/** Padding, chevron, delete glyph, its margin and the summary's gaps. */
const LINE_CHROME_PX = 96;
/**
 * The name's floor, six ems: the narrowest name the fit assumes. A line whose
 * estimate runs short is drawn plain anyway, and its name narrows below this,
 * clipped and revealed on hover.
 */
const NAME_FLOOR_PX = 96;

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

/**
 * A field's width on the line, estimated cautiously: at or above the width the
 * harness drew every sample at (`record-line-fit.test.ts`).
 */
export function fieldWidthPx(field: LineField): number {
	switch (field.kind) {
		case 'mark':
			return MARK_PX;
		case 'computed':
			return COMPUTED_PX;
		case 'select': {
			const longest = Math.max(0, ...field.options.map((one) => one.length));
			return SELECT_CHROME_PX + SELECT_CHAR_PX * longest;
		}
		case 'text':
			return NAME_CHAR_PX * field.name.length + TEXT_PX;
		case 'number': {
			const ceiling =
				field.ceiling === 'none'
					? 0
					: field.ceiling === 'typed'
						? TYPED_CEILING_PX
						: FIXED_CEILING_PX +
							DIGIT_PX * Math.max(1, field.ceiling.fixed.length);
			return NAME_CHAR_PX * field.name.length + NUMBER_PX + ceiling;
		}
	}
}

/**
 * The narrowest container, in px at 16px, at which a line of fields of these
 * widths sits on one row with its name at six ems.
 *
 * **A plain sum, because the fields take their width before the name grows**
 * (`docs/features/record-summary-fields-first.md`). The plain line's fields'
 * track is `max-content`, so it starts at all of the fields on one row and the
 * name's `minmax(0, 13em)` gets only what is left. The line therefore fits where
 * the name reaches its floor beside the fields. Before that pass the fields'
 * track was `auto` and grew together with the name, which made the fit
 * `96 + F + clamp(F − m, 96, 169)` and up to 73px wider. This formula is true
 * only while that track is `max-content`, which `styles.test.ts` holds.
 *
 * Every term is monotone in the field widths, so a field estimated at or above
 * its drawn width gives a line estimated at or above its measured fit.
 */
export function lineFitPx(widths: readonly number[]): number {
	const all =
		widths.reduce((sum, one) => sum + one, 0) +
		GAP_PX * Math.max(0, widths.length - 1);
	return LINE_CHROME_PX + all + NAME_FLOOR_PX;
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
