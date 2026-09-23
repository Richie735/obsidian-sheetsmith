/*
 * The layout's promoted fields (SPEC §9), as a field in the layout editor's
 * Layout panel.
 *
 * **Drawn last, after Grid columns, Reset triggers, Function library, Bonus
 * types and Modifiers**, because it reads *from* everything above it: a promoted
 * value may be a formula calling the library, and may be a number a modifier
 * changed, so the reader meets what a value is made of before they meet where it
 * is copied to.
 *
 * **A list on `modifier-definitions-field.ts`'s geometry**, which is this pane's
 * idiom for a structured list and the fourth consumer of the shared helpers
 * (`listField`, `addControls`, `addControlSpacers`, `setOptional`). Deliberately
 * **not** inside `.sheetsmith-list-scroll`, for that field's stated reason: a
 * capped scroller is what clipped a detail line, and this list sizes to its
 * content.
 *
 * **Both controls sit on the entry row and there is no detail line at all.**
 * This is a two-field row where Modifiers is a six-field one, so a detail line
 * would put one control on a line of its own under a header that had reserved a
 * track for it. That is the one thing this field does not borrow, and it is why
 * `labelled` is absent from the import list above.
 *
 * **It has its own test file**, under `PATTERNS.md` §10's rule: a module here
 * with its own entry point *and* its own reportable output earns one, and this
 * has both — `renderPromotedFields`, and a problems report under the list.
 *
 * **The naming rule.** "Promote" already means something else in this plugin — a
 * typed modifier promoted into a modifier definition, which writes the *layout*
 * file where a promoted field writes the *note* — so no identifier here is the
 * bare word.
 */

import {
	addControls,
	addControlSpacers,
	listField,
	ListContext,
	setOptional,
} from './list-fields';
import { groupHeading } from './form-group';
import { Layout } from '../parse/layout';
import { ModifierTargetSource } from '../formula/modifier-targets';
import {
	parsePromotedFields,
	promotableNames,
} from '../parse/promoted-fields';
import { frontmatterKeyProblem } from '../parse/frontmatter';
import { LAYOUT_KEY, PromotedField } from '../types';
import { showFieldError } from './field-error';
import { titleChosen } from './select-title';

/** A row as the editor handles one: every member free to be absent. */
type FieldEntry = Partial<PromotedField> & Record<string, unknown>;

/** What the field needs back from the editor when something is committed. */
export interface PromotedFieldsContext {
	/** Write the layout. */
	persist: () => void;
	/** Rebuild the pane, so the report reading this list picks the new one up. */
	redraw: () => void;
	/** Everything a list row's own controls need: focus, drag, confirm, errors. */
	list: ListContext;
	/**
	 * The published-name sources, for the **Value** picker and for the report.
	 *
	 * Assembled by the caller through `modifierTargetSource`, which is the one
	 * place the "with no data" decision is taken and argued: a published name is
	 * a property of the configuration, so this needs no character in hand — and
	 * neither does the sheet, which reaches the same answer through the same
	 * function.
	 */
	sources: readonly ModifierTargetSource[];
}

/**
 * The layout's promoted fields, as an ordered list of value-and-property pairs.
 *
 * The order is declaration order, which is the order several properties added at
 * once arrive in a note's frontmatter, and nothing else.
 */
export function renderPromotedFields(
	container: HTMLElement,
	layout: Layout,
	context: PromotedFieldsContext,
): void {
	/*
	 * Held locally where the layout has no list yet, and attached by the add
	 * control below. Materialising it here instead would write
	 * `"promotedFields": []` into a layout for every pane that was merely
	 * *opened* — `parse/layout.ts`'s recorded trap, and the `options: []` one
	 * again — and here it would also break the off-by-default promise, since the
	 * sheet's own pass is gated on the key being absent.
	 */
	const stored = layout.promotedFields;
	const rows = (Array.isArray(stored) ? stored : []) as FieldEntry[];

	groupHeading(
		container,
		'Promoted fields',
		/*
		 * **Four sentences, and the two that went were said again on this same
		 * surface.** Measured at six: 135 words over 7 lines at 1400 and 8 at the
		 * threshold, above a 255px list — and in the empty state the prose stood
		 * about 1.4x the height of the thing it explains, the longest description
		 * in this panel by a third.
		 *
		 * "Nothing is promoted unless it is listed here" is the first sentence
		 * read the other way round, and the empty state says it in three words.
		 * "Removing a row here changes no character note" is said in full by the
		 * removal confirmation, at the moment it matters and where it cannot be
		 * missed. What is left keeps all four facts a reader cannot find out by
		 * looking: the property name is theirs and vault-global, the sheet
		 * overwrites a hand edit, a row whose value went away clears its
		 * property, and an unopened note has not been written yet.
		 *
		 * The panel's copy budget as a whole is SPEC §13's open question and
		 * stays open; this is two sentences that were duplicates, not a ruling.
		 */
		"The values this layout copies into each character's frontmatter, so Bases and Dataview can read them. Each row picks a value the sheet publishes and the property to write it under — you name the property, because Obsidian gives every property of one name the same type everywhere in your vault. The sheet owns what it writes: a promoted property edited in a note's properties is put back the next time that sheet renders, and a row pointed at a value this layout no longer has stops writing its property and clears it. A character's properties are written while its sheet is open, so a note you have not opened since adding a row does not have it yet.",
		rows.length === 0 ? undefined : rows.length,
	);

	const names = promotableNames(context.sources);
	/**
	 * Bound once: every inline error here outlives a rebuild of the pane.
	 *
	 * A select as readily as an input, which `showFieldError` has always
	 * accepted: two of this list's faults belong to the **Value** picker, and the
	 * row that carried one of them — a value this layout cannot reach, whose
	 * report says the property "is cleared" — was the one row in the list with no
	 * mark of any kind on it.
	 */
	const fieldError = (
		input: HTMLInputElement | HTMLSelectElement,
		message: string | null,
	) => {
		showFieldError(input, message, context.list.errors);
		/*
		 * **And the row is told, because a message changes the row's own
		 * alignment.** A message is a third child of the `.sheetsmith-field` it
		 * belongs to, so that cell grows and the row's `align-items: center`
		 * recentres every other cell against it — measured at 16px, which put
		 * the Property input, the drag handle and the trash below the select
		 * they belong to, on the one row a reader is being sent to.
		 *
		 * **Derived from what the row actually holds rather than tracked**,
		 * which is `field-error.ts`'s own `markControl` one level up and for its
		 * reason: recomputed on every set and every clear, so it cannot drift
		 * from the DOM the way a flag set at render time would — and the typed
		 * refusal path, which adds a message between renders, gets it for free
		 * by coming through here.
		 *
		 * A class rather than `:has(.sheetsmith-field-error)` on the row, on
		 * exactly the argument `markControl` records for choosing one.
		 */
		const row = input.closest('.sheetsmith-entry-row');
		row?.toggleClass(
			'sheetsmith-entry-row-marked',
			row.querySelector('.sheetsmith-field-error') !== null,
		);
	};

	/*
	 * **Every stored fault comes from the parser, addressed by row and control.**
	 *
	 * This used to be a local predicate re-deciding the parser's property rules,
	 * and §1 allows a duplicated predicate only under a test driving both copies
	 * over the same cases — which the guard below did, over four cases that all
	 * carried a name, so the two disagreements it had went unseen. The copy never
	 * looked at the *name*, where the parser judges it first and stops: a row
	 * with nothing in it was marked "it names no property" on its Property input
	 * while the report beside it said "A promoted field needs a value to copy",
	 * and **Add promoted field** painted the new row red before anything was
	 * typed. A value fault was not marked at all.
	 *
	 * Reading the parser instead makes the field's mark and the report one
	 * decision rather than two agreeing decisions. What stays local is the
	 * *typed* path below, which has to judge text the layout does not hold yet
	 * and says its own sentence about the edit rather than about the file.
	 */
	const parsed = parsePromotedFields(layout, context.sources);
	const storedFaultAt = (
		row: number,
		control: 'value' | 'property',
	): string | null => {
		const problem = parsed.problems.find(
			(one) => one.row === row && one.control === control,
		);
		/*
		 * **The parser's own `mark`, not its message cut down.** This took the
		 * message up to its first full stop, which was right for most faults and
		 * wrong for the one a reader is most often sent to: an unpublished
		 * value's first sentence *is* the whole diagnosis, so the field wrapped
		 * 15 words under a 335px control and the report 60px below said the same
		 * words again. A cut cannot know where a sentence stops being a label,
		 * so the parser authors both (`parse/promoted-fields.ts`).
		 */
		return problem === undefined ? null : `${problem.mark}.`;
	};

	/*
	 * Which of the four things is wrong with a property a reader has just
	 * **typed**, or `null`.
	 *
	 * **The commit path only.** A stored fault is the parser's, above. This one
	 * has to exist because the text being judged is not in the layout yet, so
	 * there is nothing for the parser to read — and the sentence it earns is
	 * about the edit, where the parser's is about the file.
	 *
	 * Two of the three rules are shared functions rather than copies
	 * (`frontmatterKeyProblem`, `LAYOUT_KEY`), so the only thing re-decided here
	 * is uniqueness against the *other* rows — which is a question about the
	 * typed string and cannot be asked of the stored list at all.
	 */
	type PropertyFault = 'blank' | 'format' | 'reserved' | 'repeat';
	const propertyFault = (
		value: string,
		others: readonly FieldEntry[],
	): PropertyFault | null => {
		if (value.trim() === '') return 'blank';
		// The format's rule rather than this field's, so the field and the note's
		// writer cannot disagree about what a property may be called.
		if (frontmatterKeyProblem(value) !== null) return 'format';
		if (value === LAYOUT_KEY) return 'reserved';
		if (others.some((other) => String(other.property ?? '') === value)) {
			return 'repeat';
		}
		return null;
	};

	/*
	 * What a *typed* property's fault is called, which is a different sentence
	 * for a different moment and not a second answer to the same question: a
	 * refusal happens between renders, when the report below is still describing
	 * the stored property and says nothing about what was just typed. It is about
	 * the edit — hence the revert clause the caller adds — where the pair above is
	 * about the file.
	 */
	const typedReason = (fault: PropertyFault, property: string): string => {
		switch (fault) {
			case 'blank':
				return 'A property is required';
			case 'format':
				return `"${property}" cannot be a frontmatter property`;
			case 'reserved':
				return `"${LAYOUT_KEY}" is this plugin's own property`;
			case 'repeat':
				return `"${property}" is already promoted by another row`;
		}
	};

	const listEl = container.createDiv(
		'sheetsmith-entry-list sheetsmith-list sheetsmith-list-promoted-fields',
	);

	if (rows.length === 0) {
		listEl.createDiv('sheetsmith-entry-empty', (el) =>
			el.setText('No promoted fields yet.'),
		);
	} else {
		const headings = listEl.createDiv('sheetsmith-entry-columns');
		headings.createSpan({ text: 'Value' });
		headings.createSpan({ text: 'Property' });
		addControlSpacers(headings);
	}

	rows.forEach((field, index) => {
		const entry = listEl.createDiv('sheetsmith-list-entry');
		const row = entry.createDiv('sheetsmith-entry-row');
		const storedName = String(field.name ?? '').trim();
		const storedProperty = String(field.property ?? '');
		/** What the row is called in a control's own name, once it has anything. */
		const called = storedProperty.trim() || storedName || 'promoted field';

		/*
		 * **Value**: the published names, showing each one's *label* rather than
		 * the name a formula writes — `Abilities · DEX`, not `abilities.DEX`.
		 * Labels are unique on a layout by construction (`parseLayout` refuses a
		 * duplicate), so this is the modifier target picker's own ruling: the name
		 * costs most of the option's width to a truncation and adds nothing a
		 * reader can use, and the formula name is on screen in the component's own
		 * published-names inventory one selection away.
		 */
		const valueField = listField(row, 'Value');
		const value = valueField.createEl('select', {
			cls: 'dropdown',
			attr: { 'aria-label': `${called} value` },
		});
		value.createEl('option', { value: '', text: '—' });
		for (const name of names) {
			value.createEl('option', { value: name.name, text: name.label });
		}
		/*
		 * A stored name the picker does not offer, carried as its bare name and
		 * marked rather than snapped to blank — §4.2's rule for a Card's stray
		 * option and the modifier target's own behaviour. Silently retyping an
		 * author's layout would change what every character on it writes into a
		 * vault's property namespace, and the report under the list already says
		 * which of the two things is wrong with it.
		 *
		 * The name itself is the mark: every offered option is a label like
		 * `Abilities · DEX`, so a bare identifier among them does not read as a
		 * choice this layout made. Bare rather than parenthesised, on the
		 * modifier target's measured finding that a `<select>` truncates and cut
		 * the qualifier that was the whole point of it.
		 */
		if (storedName !== '' && !names.some((one) => one.name === storedName)) {
			value.createEl('option', { value: storedName, text: storedName });
		}
		value.value = storedName;
		titleChosen(value);
		value.dataset.sheetsmithFocus = `promoted-field-${index}-value`;
		/*
		 * **The picker carries a mark too, and the row that needed it most had
		 * none.** Two of this list's faults are the Value's: a row with no value
		 * chosen, and a value this layout cannot reach — the second being the row
		 * whose report says its property "is cleared", which is the destructive
		 * one. Before this, four rows drew identically and the only way to tell
		 * which the red sentence 200px below was about was to match a quoted
		 * string.
		 */
		fieldError(value, storedFaultAt(index, 'value'));
		value.addEventListener('change', () => {
			setOptional(field, 'name', value.value);
			context.persist();
			// The report under the list is about which names this layout
			// publishes, so it is stale the moment one changes.
			context.redraw();
		});

		const propertyInput = listField(row, 'Property').createEl('input', {
			type: 'text',
			attr: { placeholder: 'Property', 'aria-label': 'Frontmatter property' },
		});
		propertyInput.value = storedProperty;
		propertyInput.dataset.sheetsmithFocus = `promoted-field-${index}-property`;
		/*
		 * Judged as it renders: every fault here is one `parseLayout` accepts and
		 * `parsePromotedFields` merely reports, so a hand-edited layout arrives
		 * with a clean-looking field beside a row that writes nothing.
		 *
		 * The report under the list says the same things and keeps saying them;
		 * **what this adds is the anchor**, and it is the only anchor there is —
		 * the report carries no locator of its own, on the argument that the one
		 * it used to carry was an illegible duplicate of a token its own sentence
		 * quotes (`parse/promoted-fields.ts`).
		 */
		fieldError(propertyInput, storedFaultAt(index, 'property'));
		propertyInput.addEventListener('change', () => {
			const next = propertyInput.value.trim();
			/*
			 * A refusal puts the stored property back, which is the rows and
			 * columns editors' rule and their words: leaving the typed text in a
			 * field whose value was refused makes the field lie about what the
			 * file holds the moment focus moves on.
			 */
			const fault = propertyFault(
				next,
				rows.filter((_, i) => i !== index),
			);
			if (fault !== null) {
				propertyInput.value = storedProperty;
				const reason = typedReason(fault, next);
				fieldError(
					propertyInput,
					// Nothing to have been left as: a blank property refused on a
					// row that had none. Every other refusal names what the field
					// went back to.
					next === '' && storedProperty === ''
						? `${reason}.`
						: `${reason}, so ${next === '' ? 'it' : 'this one'} was left as "${storedProperty}".`,
				);
				return;
			}
			fieldError(propertyInput, null);
			setOptional(field, 'property', next);
			context.persist();
			context.redraw();
		});

		addControls(
			row,
			rows,
			index,
			`promoted-field-${called}`,
			called,
			context.list,
			/*
			 * There is no undo behind any of this — `persist()` writes the file on
			 * the spot — so the confirmation carries the whole load, and **it names
			 * the one thing removal cannot undo**: the property stays in every
			 * character note that already has it, because the moment a row is gone
			 * the plugin has no claim on that property and touching it would be
			 * reaching into frontmatter it no longer owns.
			 */
			() => {
				if (storedProperty.trim() === '') return null;
				return `Remove the promoted field "${storedProperty.trim()}"? Nothing is removed from any character note: every note that already has that property keeps it, holding whatever was last written, and no sheet updates it again.`;
			},
		);
	});

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { text: 'Add promoted field' });
	add.addEventListener('click', () => {
		// Focus lands on the picker rather than on the property, which is the one
		// departure from the other lists' "named for what it is, then renamed":
		// there is no sensible default value to copy, and a property typed before
		// a value is chosen is a name for nothing.
		context.list.focusAfterRedraw(`promoted-field-${rows.length}-value`);
		rows.push({});
		// Attaches the list on the first add, and is already a no-op after it.
		layout.promotedFields = rows as PromotedField[];
		context.persist();
		context.redraw();
	});

	/*
	 * **Problems are reported under the list, never fatal**, in the shared
	 * `.sheetsmith-field-problems` clothes with the count line under them — the
	 * same report the function library, the triggers, the bonus types and the
	 * modifiers draw. One unusable row must not stop every sheet on the layout
	 * rendering, nor stop the other properties being written.
	 *
	 * `status`, because the moment a row is judged is the moment a field blurs
	 * and a screen reader is looking elsewhere by then.
	 */
	const problemsEl = container.createDiv('sheetsmith-field-problems');
	problemsEl.setAttribute('role', 'status');
	const { fields: usable, problems } = parsed;
	/*
	 * **No locator span in this list**, which is the one thing it does not borrow
	 * from the three reports beside it. Theirs names a line number or a
	 * definition the message does not otherwise identify; every message here
	 * already quotes its own row's property or value in the sentence, so the span
	 * was a second copy of a token six characters away — and it is
	 * `--text-faint`, measured 2.30:1 against the message's own 4.20:1, so the
	 * copy was the illegible one. The anchor a reader needs is the marked
	 * control on the row itself, which every fault here now sets.
	 *
	 * Not a change to `.sheetsmith-field-problem-line`, whose colour is shared by
	 * four fields and is `docs/BACKLOG.md`'s to rule on.
	 */
	for (const problem of problems) {
		problemsEl.createDiv('sheetsmith-field-problem', (el) =>
			el.setText(problem.message),
		);
	}
	/*
	 * The only confirmation a working list gets, and the only way to tell that
	 * the good rows survived a bad one.
	 *
	 * **It says "3 of 4" where the two counts differ**, because the heading above
	 * counts the rows and this counts the ones that work: 460px apart with
	 * nothing naming the difference, the first reading is that something is
	 * miscounted. Modifiers draws the identical pair and has never diverged in a
	 * fixture, which is why this list is where the construction first shows.
	 */
	if (usable.length > 0 || problems.length > 0) {
		const total = rows.length;
		const counted =
			usable.length === total
				? String(usable.length)
				: `${usable.length} of ${total}`;
		// Plural on the *total*, which is the number the noun attaches to once
		// there is an "of" in front of it: "1 of 2 values", never "1 of 2 value".
		problemsEl.createDiv('setting-item-description', (el) =>
			el.setText(`${counted} value${total === 1 ? '' : 's'} promoted.`),
		);
	}
}
