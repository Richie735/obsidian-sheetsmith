/*
 * The chosen option's own words, in a `title`, because a `<select>` clips its
 * face with no mark and no recovery.
 *
 * `docs/UI.md` §12's clipped-value row names `text-overflow: ellipsis` plus the
 * full value in `title` as the answer for a control whose text is cut, and a
 * select is the case where the second half is not optional: `ui/truncation.ts`
 * reads `textContent`, which is empty on a form control, and a select's
 * `scrollWidth` equals its `clientWidth` however long the chosen option is — so
 * nothing on the page can detect the cut, let alone reveal it on hover. **The
 * ellipsis says the value continues and the title is the only thing that says
 * what it continues into.**
 *
 * Supplementary rather than a name, so `docs/UI.md` §6's rule holds: every
 * select that calls this already carries an `aria-label` naming the field, and
 * the title adds the value to it rather than replacing it.
 *
 * **A module of its own on `docs/PATTERNS.md` §1's one-step tier.** It lived
 * privately in `modifier-definitions-field.ts` while that field's five selects
 * were the only ones that needed it; the promoted-field list's **Value** picker
 * is the second consumer, and what is shared is a *policy* — which string goes
 * in which attribute, and that an empty choice removes the attribute rather than
 * setting it blank — so the only thing a guard test over two copies could assert
 * is that they still agree. It is not in `list-fields.ts`, whose imports from
 * elsewhere are already a recorded coupling (`docs/BACKLOG.md` § Patterns) and
 * which owns list *geometry*: there is nothing list-shaped about a clipped
 * select.
 *
 * **It earns no test file of its own** under `docs/PATTERNS.md` §10: it is
 * reached only by rendering something the editor drew, so it has no entry point,
 * and it is driven through both its consumers' own fields over a chosen option
 * long enough to clip.
 */

export function titleChosen(select: HTMLSelectElement): void {
	const chosen = select.options[select.selectedIndex]?.text ?? '';
	// Removed rather than set blank: an empty `title` is an attribute a reader's
	// tooling can still announce, where an absent one is nothing at all.
	if (chosen === '') select.removeAttribute('title');
	else select.title = chosen;
}
