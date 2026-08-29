/*
 * The layout's modifier definitions (SPEC §5, §7), as a field in the layout
 * editor's Layout panel.
 *
 * **A list, not a modal.** The authoring surface this feature replaces was going
 * to be "a popup with separate fields" on the *sheet*; with the definition moved
 * into the layout there is no reason to invent a panel for it, and `docs/UI.md`
 * §9 refuses a fourth kind of panel beside a row of cards. The pane's idiom for a
 * structured list is an entry row with a detail line under it, which the columns
 * list already is, so each definition is one row — its name — with its five
 * fields on the line beneath.
 *
 * It sits beside the function library, the reset triggers and the bonus types
 * because it is the same category: the layout's own vocabulary, shared by every
 * component using it. A definition is a rule, and a rule belongs where the rules
 * are — the sheet holds only which one a row enrols in.
 *
 * **The target picker is the one control this feature moves rather than builds,
 * and moving it is what makes it complete.** Foundry's own Active Effects article
 * tells users to press F12 and run a console script to enumerate attribute keys —
 * the vendor documenting devtools as the discovery mechanism. `acceptingTargets`
 * answered that on the sheet, over the names whose own formula reads a modifier
 * rather than every published name. It answers it here now, where a target is
 * chosen once instead of per row, and where the layout's own half of dnd5e#3900 —
 * a modifier aimed at a value that reads no slot — can be reported *completely*
 * rather than for the declared rows only.
 *
 * **Deliberately not inside `.sheetsmith-list-scroll`.** SPEC §13 asks what that
 * `20em` cap is for and hoped the authoring change would answer it by deletion.
 * It is answered in that direction — the two controls that overran a column's
 * detail line are gone — but this is a *new* list with five controls on a detail
 * line, so putting it in the capped scroller would recreate the clip the cap
 * caused. It sizes to its content, which is `editor/list-field-height.ts`'s
 * argument applied to a third kind of field, and the cap question stays open for
 * the lists still inside it.
 *
 * **The form is its own rather than `list-fields.ts`'s**, and the helpers it
 * borrows are the geometry rather than the form: `listField`, `labelled`,
 * `addControls` and `addControlSpacers` are what keep a fourth list's header in
 * step with its rows and its buttons named the way the other three name theirs.
 * A shared *list editor* over four vocabularies would be the form-description
 * language `line-list-field.ts`'s header already refuses. Being the fourth
 * consumer is what earns those a module of their own, which `PATTERNS.md` §11
 * holds — along with the fifth import, `setOptional`, which is not geometry but the
 * file-format rule that an empty field means an absent key.
 *
 * **It has its own test file**, under the rule §11 settled while this was written:
 * a module here with its own entry point *and* its own reportable output earns
 * one, where the five fixtures reached only by pressing something the editor drew
 * do not. So the report, the count, the empty state, the two write rules and the
 * refusals are driven in `modifier-definitions-field.test.ts`, and
 * `layout-editor.test.ts` keeps only what needs the pane.
 */

import { acceptingTargets, ModifierTargetSource } from '../formula/modifier-targets';
import {
	addControls,
	addControlSpacers,
	labelled,
	listField,
	ListContext,
	setOptional,
} from './list-fields';
import { groupHeading } from './form-group';
import { Layout } from '../parse/layout';
import {
	ModifierDefinition,
	ModifierOperator,
	operatorOf,
} from '../types';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { parseModifierTypes } from '../parse/modifier-types';
import { showFieldError } from './field-error';

/** A definition as the editor handles one: every member free to be absent. */
type DefinitionEntry = Partial<ModifierDefinition> & Record<string, unknown>;

/**
 * What each operator is called on screen, against the value stored in the file.
 *
 * A `Record` over the operator rather than a list of its own, so an operator
 * added to the vocabulary does not compile until it has a word here — which is
 * `components/column-types.ts`'s own argument for the column labels.
 *
 * **Adds to** and **Sets** rather than "add" and "override": the stored ids are
 * the data model and read like it, and "override" is a word about the engine
 * where the author is choosing what their item does.
 */
const OPERATOR_LABELS: Record<ModifierOperator, string> = {
	add: 'Adds to',
	override: 'Sets',
};

/**
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
 * Supplementary rather than a name, so §6's rule holds: each of these already
 * carries an `aria-label` naming the field, and the title adds the value to it
 * rather than replacing it.
 */
function titleChosen(select: HTMLSelectElement): void {
	const chosen = select.options[select.selectedIndex]?.text ?? '';
	if (chosen === '') select.removeAttribute('title');
	else select.title = chosen;
}

/** What the field needs back from the editor when something is committed. */
export interface ModifierDefinitionsContext {
	/** Write the layout. */
	persist: () => void;
	/** Rebuild the pane, so the forms reading this list pick the new one up. */
	redraw: () => void;
	/** Everything a list row's own controls need: focus, drag, confirm, errors. */
	list: ListContext;
	/**
	 * The accepting-set sources, for the **Changes** picker and for the report.
	 *
	 * Assembled by the caller through `modifierTargetSource`, which is the one
	 * place the "with no data" decision is taken and argued: a published name is a
	 * property of the configuration, so this needs no character in hand — and
	 * neither does the sheet, which reaches the same answer through the same
	 * function.
	 */
	sources: readonly ModifierTargetSource[];
}

/**
 * The layout's modifiers, as an ordered list of definitions.
 *
 * The order is declaration order, which is the order a breakdown lists its
 * contributors in — so reordering here reorders what a reader sees in a popover,
 * and nothing else.
 */
export function renderModifierDefinitions(
	container: HTMLElement,
	layout: Layout,
	context: ModifierDefinitionsContext,
): void {
	/*
	 * Held locally where the layout has no list yet, and attached by the add
	 * control below. Materialising it here instead would write `"modifiers": []`
	 * into a layout for every pane that was merely *opened*, which is the editor
	 * reformatting a file it was only asked to show — `parse/layout.ts`'s recorded
	 * trap, and the `options: []` one a third time.
	 */
	const stored = layout.modifiers;
	const definitions = (Array.isArray(stored) ? stored : []) as DefinitionEntry[];

	groupHeading(
		container,
		'Modifiers',
		"The changes this layout names, for the ones that repeat: what each one is called, what it changes, whether it adds or sets, by how much, and when. A character's row names as many as it needs in one modifier cell, separated by a semicolon, so a name cannot contain one and cannot read as `armour_class = 18`, which is how a row spells one of its own. Nothing about the change is stored in the note, so editing a definition changes every character using it — and a row may also type an effect of its own instead, which nothing here can see. This list is no longer only author-written: a sheet can save one to it.",
		definitions.length === 0 ? undefined : definitions.length,
	);

	const targets = acceptingTargets(context.sources);
	const bonusTypes = parseModifierTypes(layout).names;
	/** Bound once: every inline error here outlives a rebuild of the pane. */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.list.errors);

	/*
	 * **`.sheetsmith-entry-list` was missing here, and it is not only a border.**
	 *
	 * Every other list-shaped field in this pane sits in that container — the
	 * triggers, the function library and the bonus types each put description and
	 * field inside it, and Rows and Columns each wrap a header row and a trailing
	 * note in it. Modifiers had its description flush on the bare pane with ten
	 * entries loose beneath, which is `docs/UI.md` §9's own "an editor drawing the
	 * same thing two ways is the defect".
	 *
	 * The half worth catching is that the class also carries
	 * `container-type: inline-size`, which is what the `@container (max-width:
	 * 380px)` narrow layout resolves against. Without it this list was measuring
	 * some ancestor instead, so its breakpoint fired at the wrong element's width.
	 */
	const listEl = container.createDiv(
		'sheetsmith-entry-list sheetsmith-list sheetsmith-list-modifiers',
	);

	if (definitions.length === 0) {
		listEl.createDiv('sheetsmith-entry-empty', (el) =>
			el.setText('No modifiers yet.'),
		);
	} else {
		const headings = listEl.createDiv('sheetsmith-entry-columns');
		headings.createSpan({ text: 'Name' });
		addControlSpacers(headings);
	}

	definitions.forEach((definition, index) => {
		// One surface per definition, so its row and its five fields read as one
		// thing: common region beats proximity, and it costs a wrapper. The
		// columns list's own argument, on a list whose detail line is longer.
		const entry = listEl.createDiv('sheetsmith-list-entry');
		const row = entry.createDiv('sheetsmith-entry-row');
		const named = String(definition.name ?? '');

		const nameInput = listField(row, 'Name').createEl('input', {
			type: 'text',
			attr: { placeholder: 'Name', 'aria-label': 'Modifier name' },
		});
		nameInput.value = named;
		nameInput.dataset.sheetsmithFocus = `modifier-${index}-name`;
		nameInput.addEventListener('change', () => {
			const next = nameInput.value.trim();
			/*
			 * A refusal puts the stored name back, which is the rows and columns
			 * editors' rule and their words: leaving the typed text in a field
			 * whose value was refused makes the field lie about what the file holds
			 * the moment focus moves on.
			 */
			if (next === '') {
				nameInput.value = named;
				fieldError(
					nameInput,
					named === ''
						? 'A name is required.'
						: `A name is required, so it was left as "${named}".`,
				);
				return;
			}
			/*
			 * Both sides trimmed, because the parser dedupes on trimmed names and a
			 * field that accepts what the parser then rejects is the instrument
			 * disagreeing with itself. On a hand-edited layout holding `"Ring "`,
			 * comparing against the untrimmed value let `"Ring"` through here and
			 * then reported it under the list as declared twice — with no error on
			 * the field that had just accepted it.
			 */
			if (
				definitions.some(
					(other, i) => i !== index && String(other.name ?? '').trim() === next,
				)
			) {
				nameInput.value = named;
				fieldError(
					nameInput,
					`"${next}" is already used by another modifier, so this one was left as "${named}".`,
				);
				return;
			}
			fieldError(nameInput, null);
			definition.name = next;
			context.persist();
			context.redraw();
		});

		addControls(
			row,
			definitions,
			index,
			`modifier-${named}`,
			named === '' ? 'modifier' : named,
			context.list,
			/*
			 * There is no undo behind any of this — `persist()` writes the file on
			 * the spot — so the confirmation carries the whole load, and it belongs
			 * on the definition that has been written rather than on the one just
			 * added and still empty. **And it names the cost the editor cannot
			 * see**: every row on every character that enrolled in this definition
			 * goes inert, and no count of them is reachable from here.
			 */
			() => {
				if ((definition.amount ?? '').trim() === '') return null;
				return `Remove the modifier "${named}"? Its target, amount and condition are lost. Every character's row that names it keeps the name and changes nothing until it is pointed at another modifier.`;
			},
		);

		const detail = entry.createDiv('sheetsmith-entry-detail');
		detail.dataset.sheetsmithFlash = `modifier-${named}-detail`;

		/*
		 * **Changes**: the accepting targets, and it shows each one's *label* rather
		 * than the name a formula writes — `Abilities · STR`, not `abilities.STR`.
		 * Labels are unique on a layout by construction (`parseLayout` refuses a
		 * duplicate), so the name adds nothing a reader can use and cost the option
		 * most of its width to a truncation. A stored target the picker does not offer is
		 * carried as an extra last line rather than snapped to blank — §4.2's rule
		 * for a Card's stray option, read here because silently retyping an
		 * author's definition would move every sheet on the layout, and because
		 * the report under the list already says which of the two things is wrong
		 * with it.
		 */
		const changesField = labelled(detail, 'Changes');
		// The one field on this line worth more than an equal share of it: it
		// says what the modifier *does*, and it is the only one whose values are
		// authored labels rather than a closed list of short words.
		changesField.addClass('sheetsmith-detail-field-wide');
		const changes = changesField.createEl('select', {
			cls: 'dropdown',
			attr: { 'aria-label': `${named || 'Modifier'} changes` },
		});
		const storedTarget = String(definition.target ?? '').trim();
		changes.createEl('option', { value: '', text: '—' });
		for (const target of targets) {
			changes.createEl('option', { value: target.name, text: target.label });
		}
		/*
		 * A stored target the picker does not offer, carried as its bare name.
		 *
		 * **Bare, because a `<select>` truncates and a diagnosis must not.** It read
		 * `passive_perception (not offered)` and drew as `passive_perception (n…`,
		 * cutting the qualifier that was the whole point of it — and reintroducing
		 * exactly the cost the comment above cites for not showing formula names
		 * here. The parenthetical was a *duplicate* of a diagnosis the report under
		 * the list already gives in full and unclipped: "passive_perception reads no
		 * modifier, so 'Cloak of Displacement' changes nothing. Add '+ mod.self' to
		 * that value's own formula." One statement of it, where it has room.
		 *
		 * The name itself is the mark that this option is not one of the offered
		 * ones: every offered option is a label like `Abilities · STR`, and a bare
		 * identifier among them does not read as a choice this layout made.
		 */
		if (storedTarget !== '' && !targets.some((t) => t.name === storedTarget)) {
			changes.createEl('option', { value: storedTarget, text: storedTarget });
		}
		changes.value = storedTarget;
		titleChosen(changes);
		changes.dataset.sheetsmithFocus = `modifier-${named}-target`;
		changes.addEventListener('change', () => {
			setOptional(definition, 'target', changes.value);
			context.persist();
			context.redraw();
		});

		/*
		 * **Operator**: two options, and choosing **Sets** takes the bonus type
		 * away, because an override is not contested by type. It redraws for that
		 * reason — the same reason **Publish per row** does in the columns list —
		 * and the token is what keeps the hand in place across the rebuild.
		 */
		/*
		 * **Sized to its own longest option rather than to a share of the line.**
		 * `Adds to` and `Sets` are a closed list of two, and a share clipped the
		 * longer one to `Adds …` down nine consecutive rows at the pane's threshold
		 * width — inside a `<select>`, where the reveal-on-hover answer for a clipped
		 * value cannot reach.
		 */
		const operatorField = labelled(detail, 'Operator');
		operatorField.addClass('sheetsmith-detail-field-tight');
		const operator = operatorField.createEl('select', {
			cls: 'dropdown',
			attr: { 'aria-label': `${named || 'Modifier'} operator` },
		});
		for (const id of ['add', 'override'] as const) {
			operator.createEl('option', { value: id, text: OPERATOR_LABELS[id] });
		}
		const effective: ModifierOperator = operatorOf(definition);
		operator.value = effective;
		titleChosen(operator);
		operator.dataset.sheetsmithFocus = `modifier-${named}-operator`;
		operator.addEventListener('change', () => {
			// The default is left out of the file, the same rule every select in
			// this pane follows: a definition that adds reads as one that never
			// said which it was.
			if (operator.value === 'add') delete definition.operator;
			else definition.operator = 'override';
			context.persist();
			context.list.flashAfterRedraw?.(`modifier-${named}-detail`);
			context.redraw();
		});

		const amount = labelled(detail, 'Amount').createEl('input', {
			type: 'text',
			attr: {
				placeholder: 'Expression',
				'aria-label': `${named || 'Modifier'} amount`,
			},
		});
		amount.value = String(definition.amount ?? '');
		amount.dataset.sheetsmithFocus = `modifier-${named}-amount`;
		amount.addEventListener('change', () => {
			setOptional(definition, 'amount', amount.value);
			context.persist();
			// The report under the list is about what these expressions say, so it
			// is stale the moment one changes.
			context.redraw();
		});

		{
			/*
			 * Which of the layout's bonus types this modifier's amount is. The
			 * options come from the layout rather than from a list on the
			 * definition, which is why this does **not** reopen SPEC §13's `select`
			 * column question: that one is blocked on a field kind, "a list whose
			 * cells are themselves lists", and there is no per-definition list here
			 * to be one.
			 *
			 * A stored type the layout no longer declares is carried as an extra
			 * last line. It cannot lose character data — nothing stored ever names
			 * a type — but silently retyping an author's definition would change
			 * the arithmetic on every sheet using the layout. The bonus types field
			 * reports it with the whole picture; this keeps the value on screen
			 * where the definition is.
			 */
			// The same, and it is the field the clip was first seen on:
			// `circumstance` rendered as `circu…`.
			const typeField = labelled(detail, 'Bonus type');
			typeField.addClass('sheetsmith-detail-field-tight');
			const type = typeField.createEl('select', {
				cls: 'dropdown',
				attr: { 'aria-label': `${named || 'Modifier'} bonus type` },
			});
			const storedType = String(definition.bonusType ?? '').trim();
			// Blank first, and not one of the types: it is what a definition with
			// no type already is, and every modifier of that kind stacks.
			type.createEl('option', { value: '', text: 'Untyped' });
			for (const name of bonusTypes) {
				type.createEl('option', { value: name, text: name });
			}
			if (storedType !== '' && !bonusTypes.includes(storedType)) {
				type.createEl('option', {
					value: storedType,
					text: `${storedType} (not declared)`,
				});
			}
			type.value = storedType;
			titleChosen(type);
			if (effective === 'add') {
				type.dataset.sheetsmithFocus = `modifier-${named}-bonus-type`;
				type.addEventListener('change', () => {
					setOptional(definition, 'bonusType', type.value);
					context.persist();
					context.redraw();
				});
			} else {
				/*
				 * **An override reserves the slot rather than emptying it, and the
				 * difference is what "the tracks do not move" actually needs.**
				 *
				 * An override is not contested by type, so the control goes. The first
				 * answer was an empty `div` in its place, and it only half worked: a
				 * bare `.sheetsmith-detail-field` is `flex: 1` while a **Bonus type**
				 * field is `-tight`, `flex: 0 0 auto`, sized to its own longest option.
				 * So the slot took a *flexible* share instead of the fixed one it was
				 * standing in for, and the 31px difference went back to the line's
				 * `2:1:1:1` grow. Measured on `editor-layout`: eight `Adds to` rows are
				 * byte-identical, and the two `Sets` rows sit `Changes` 19px wider with
				 * `Operator` and `Amount` 19 and 20px right of every other row — so a
				 * list of ten definitions reads as three different forms, which is the
				 * exact complaint the empty slot was added to answer.
				 *
				 * **The width cannot be written down**, because it is the widest bonus
				 * type *this layout declares* plus a chevron. So the field is built and
				 * hidden rather than guessed at: `visibility: hidden` keeps the box in
				 * the flex line at precisely the width the rows above it use, and takes
				 * the control out of the tab order and out of the accessibility tree.
				 * Still no dead control to press, still nothing to read, and the
				 * disappearance is still what teaches that an override has no type —
				 * which is what ruled out a disabled select reading `—`.
				 */
				typeField.addClass('sheetsmith-detail-field-reserved');
				typeField.setAttribute('aria-hidden', 'true');
			}
		}

		const when = labelled(detail, 'Only when').createEl('input', {
			type: 'text',
			attr: {
				placeholder: 'Always',
				'aria-label': `${named || 'Modifier'} condition`,
			},
		});
		when.value = String(definition.when ?? '');
		when.dataset.sheetsmithFocus = `modifier-${named}-when`;
		when.addEventListener('change', () => {
			setOptional(definition, 'when', when.value);
			context.persist();
			context.redraw();
		});
	});

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { text: 'Add modifier' });
	add.addEventListener('click', () => {
		const taken = new Set(definitions.map((entry) => entry.name));
		// Same shape as the row, column and entry lists: a new one is named for
		// what it is, capitalised, and focus lands on it to be renamed.
		let next = 'New modifier';
		let counter = 2;
		while (taken.has(next)) next = `New modifier ${counter++}`;
		context.list.focusAfterRedraw(`modifier-${definitions.length}-name`);
		definitions.push({ name: next });
		// Attaches the list on the first add, and is already a no-op after it.
		layout.modifiers = definitions as ModifierDefinition[];
		context.persist();
		context.redraw();
	});

	/*
	 * **Problems are reported under the list, never fatal**, in the shared
	 * `.sheetsmith-field-problems` clothes with the count line under them — the
	 * same report the function library, the triggers and the bonus types draw. One
	 * unusable definition must not stop every sheet on the layout rendering.
	 *
	 * `polite`, because the moment a definition is judged is the moment a field
	 * blurs and a screen reader is looking elsewhere by then.
	 */
	const problemsEl = container.createDiv('sheetsmith-field-problems');
	problemsEl.setAttribute('role', 'status');
	const { definitions: usable, problems } = parseModifierDefinitions(
		layout,
		context.sources,
	);
	for (const problem of problems) {
		problemsEl.createDiv('sheetsmith-field-problem', (el) => {
			if (problem.definition !== undefined) {
				el.createSpan({
					cls: 'sheetsmith-field-problem-line',
					text: problem.definition,
				});
			}
			el.createSpan({ text: problem.message });
		});
	}
	// The only confirmation a working list gets, and the only way to tell that
	// the good definitions survived a bad one.
	if (usable.length > 0 || problems.length > 0) {
		problemsEl.createDiv('setting-item-description', (el) =>
			el.setText(
				`${usable.length} modifier${usable.length === 1 ? '' : 's'} defined.`,
			),
		);
	}
}
