/*
 * Spellcheck a field only while its text is on screen.
 *
 * Three components stack a rendered layer over the field that edits it
 * (`UI.md` §9) and hide the field, unfocused, by making its text transparent —
 * colour only, so the field keeps its box and its place in the tab order, which
 * is what the view's focus restoration counts across a rebuild.
 *
 * `color: transparent` suppresses the glyph fill and nothing else. The spelling
 * marker is painted by the engine as decoration, independently of the colour the
 * text is drawn in, so an invisible field's squiggles come through the layer
 * above it: red underlines under words the reader can see, positioned by the
 * source line the word sits on rather than by where the rendered word ended up.
 * The two layers scroll separately, so scrolling the rendered prose leaves them
 * behind. A filename is the worst of the three — `Sildar Hallwinter.png` is not
 * a word, so it squiggles across a portrait.
 *
 * The two obvious ways to hide the field harder are both ruled out. `visibility:
 * hidden` takes it out of the tab order, which breaks the rule the stacking
 * exists for. `opacity: 0` takes the placeholder with it, and the placeholder is
 * deliberately the one part of an unfocused field that shows through — it is the
 * empty state's only affordance.
 *
 * So the fix is the field's own spellcheck rather than its paint, and the
 * invariant is exactly the one the paint already states: what is not visible is
 * not marked. Focused, the field is the visible thing and behaves like any text
 * field on the sheet, which is why this is a toggle and not simply "off" —
 * spellcheck while writing a backstory is worth having.
 *
 * A module rather than three copies, under `PATTERNS` §1: three consumers, one
 * rule, and the rule is about the stacking pattern rather than about any one
 * component's content.
 */

/**
 * Mark `field` only while it has focus.
 *
 * The attribute rather than the `spellcheck` IDL property, for two reasons. It
 * is the attribute Blink parses to decide whether to *remove* the markers it has
 * already placed, so turning it off on blur clears the existing squiggles rather
 * than only stopping new ones. And happy-dom's IDL property does not reflect to
 * the attribute, so a test written against the property would be asserting
 * something the browser never sees.
 */
export function spellcheckWhileFocused(
	field: HTMLInputElement | HTMLTextAreaElement,
): void {
	const set = (on: boolean): void => {
		field.setAttribute('spellcheck', String(on));
	};
	set(false);
	field.addEventListener('focus', () => set(true));
	field.addEventListener('blur', () => set(false));
}
