/*
 * The layout's modifier definitions (SPEC §5, §7), as a field in the layout
 * editor's Layout panel.
 *
 * **A list, not a modal.** The authoring surface this feature replaces was going
 * to be "a popup with separate fields" on the *sheet*; with the definition moved
 * into the layout there is no reason to invent a panel for it, and `docs/UI.md`
 * §9 refuses a fourth kind of panel beside a row of cards. The pane's idiom for a
 * structured list is an entry row with a detail line under it, which the columns
 * list already is, so each definition is one row — its name — with its changes on
 * the lines beneath and its condition under all of them.
 *
 * **A definition names as many changes as it moves values**
 * (`docs/features/multi-change-definitions.md`), so what used to be one detail
 * line is a *list* of them drawn through `editor/nested-list-field.ts` — which
 * knows nothing about modifiers, and which is the field kind `SPEC` §13 recorded
 * as missing. A definition still spelled flat is edited in place and draws
 * exactly one line, which is what almost every layout is; **Add change** is the
 * one gesture that converts it.
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
 * **`titleChosen` left this file when its second consumer arrived**, and is now
 * `editor/select-title.ts`: the promoted-field list's own **Value** picker needs
 * the same rule about a clipped `<select>`, and a policy shared by two is
 * `PATTERNS.md` §1's one-step tier. Nothing about the five selects here changed.
 *
 * **It has its own test file**, under the rule §11 settled while this was written:
 * a module here with its own entry point *and* its own reportable output earns
 * one, where the five fixtures reached only by pressing something the editor drew
 * do not. So the report, the count, the empty state, the two write rules and the
 * refusals are driven in `modifier-definitions-field.test.ts`, and
 * `layout-editor.test.ts` keeps only what needs the pane.
 */

import {
	acceptingTargets,
	ModifierTargetSource,
} from '../formula/modifier-targets';
import {
	addControls,
	addControlSpacers,
	labelled,
	listField,
	ListContext,
	setOptional,
} from './list-fields';
import { groupHeading } from './form-group';
import { nestedList } from './nested-list-field';
import { Layout } from '../parse/layout';
import {
	MODIFIER_CHANGE_KEYS,
	ModifierChange,
	ModifierDefinition,
	ModifierOperator,
	operatorOf,
	phaseOf,
} from '../types';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { parseModifierTypes } from '../parse/modifier-types';
import { reasonMessage } from './field-reason';
import { showFieldError } from './field-error';
import { titleChosen } from './select-title';

/** A definition as the editor handles one: every member free to be absent. */
type DefinitionEntry = Partial<ModifierDefinition> & Record<string, unknown>;

/** One change as the editor handles one, on the same terms. */
type ChangeEntry = Partial<ModifierChange> & Record<string, unknown>;

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
 * How many values a definition names, in either spelling.
 *
 * `changes: []` counts as one for the same reason the parser normalises it to
 * one blank change and the list below draws one line for it: what the author has
 * is a definition that names no value, which is a thing with a count of one
 * rather than a thing with none.
 */
function changeCount(definition: DefinitionEntry): number {
	return Array.isArray(definition.changes)
		? Math.max(1, definition.changes.length)
		: 1;
}

/** Whether any of a definition's changes carries an amount, in either spelling. */
function carriesAmount(definition: DefinitionEntry): boolean {
	if (!Array.isArray(definition.changes)) {
		return String(definition.amount ?? '').trim() !== '';
	}
	return (definition.changes as ChangeEntry[]).some(
		(change) => String(change.amount ?? '').trim() !== '',
	);
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
	 * The accepting-set sources, for each change's **Value** picker and for the
	 * report.
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
	const definitions = (
		Array.isArray(stored) ? stored : []
	) as DefinitionEntry[];

	groupHeading(
		container,
		'Modifiers',
		/*
		 * **It says "modifiers" and not "changes", and the rename is what forced
		 * it.** A definition's own rows are labelled **Changes** now, so a
		 * description opening "the changes this layout names" put the word on the
		 * screen meaning the list *above* the one it names, within 200px of the
		 * label meaning the list inside one entry — and a reader who has just read
		 * the wide sense meets the narrow one as a heading.
		 *
		 * **And the old sentence described a modifier as moving exactly one value**
		 * — "what it changes, whether it adds or sets, by how much" — which is the
		 * thing this feature stopped being true. A description that restates a
		 * label earns nothing (`PATTERNS.md` §8); one that states a consequence the
		 * author cannot see from the controls earns its line, and "several values,
		 * each contested on its own terms" is exactly that consequence.
		 */
		"The modifiers this layout names, for the ones that repeat: what each is called, which values it moves and by how much, and when. One modifier may move several values, and each one contests with whatever else is moving that value on its own terms. A character's row names as many modifiers as it needs in one modifier cell, separated by a semicolon, so a name cannot contain one and cannot read as `armour_class = 18`, which is how a row spells one of its own. Nothing about a modifier is stored in the note, so editing one here changes every character using it — and a row may also type an effect of its own instead, which nothing here can see. This list is no longer only author-written: a sheet can save one to it.",
		definitions.length === 0 ? undefined : definitions.length,
	);

	const targets = acceptingTargets(context.sources);
	const bonusTypes = parseModifierTypes(layout).names;
	/** Bound once: every inline error here outlives a rebuild of the pane. */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.list.errors);

	/*
	 * Which of the two things is wrong with a name, or `null`. **The fault and
	 * the words are separated deliberately**: one rule decides, and each of the
	 * two moments a name is judged says it in its own vocabulary, below.
	 *
	 * **`others` is what the name has to be unique against, and the two callers
	 * hand in different sets on purpose.** A commit checks every *other*
	 * definition, because typing a name an earlier or a later one already holds
	 * is refused either way. A render checks only the definitions *before* this
	 * one, so a repeat marks the later definition alone:
	 * `parseModifierDefinitions` keeps the first appearance and drops the
	 * second — "The second is ignored", as the block under this list says — so
	 * marking the first as well would put a red field on the definition that
	 * works and disagree with the report six rows below it. That is the one
	 * place this departs from the precedent, which marks both sides of a
	 * duplicate because there no side is the original.
	 *
	 * Both sides trimmed, as the `change` listener already trimmed them, and
	 * for its reason: the parser dedupes on trimmed names, so a field that
	 * accepted what the parser then rejected would be the instrument
	 * disagreeing with itself.
	 */
	type NameFault = 'blank' | 'repeat';
	const nameFault = (
		value: string,
		others: readonly DefinitionEntry[],
	): NameFault | null => {
		if (value === '') return 'blank';
		if (others.some((other) => String(other.name ?? '').trim() === value)) {
			return 'repeat';
		}
		return null;
	};

	/*
	 * What a *stored* name's fault is called, and it is the parser's own
	 * words rather than this field's.
	 *
	 * **Because at render the two surfaces are on screen together.** The block
	 * under this list re-derives both faults from the model on every paint, so
	 * a field saying "A name is required." above a report saying "A modifier
	 * needs a name." is two answers to one question in one picture, which
	 * `docs/UI.md` §9 refuses — and which this feature's own spec cites §9 by
	 * name to refuse elsewhere, declining a parse check on **Amount** because
	 * the block already reports it. The anchor is what the field adds; a second
	 * wording is not.
	 *
	 * **The first clause only, for the repeat.** The parser's sentence
	 * continues "The second is ignored, since two definitions with one name
	 * could not be told apart" — a paragraph's worth of explanation that has
	 * room under the list and none under a field. A truncation says the same
	 * thing; a paraphrase would not.
	 *
	 * A second spelling of the parser's text is a real drift risk and the guard
	 * is a case rather than a comment: `modifier-definitions-field.test.ts`
	 * asserts each of these is contained in what the rendered report says about
	 * the same layout, so rewording either surface alone fails.
	 */
	const storedReason = (fault: NameFault, name: string): string =>
		fault === 'blank'
			? 'A modifier needs a name'
			: `"${name}" is declared more than once`;

	/*
	 * What a *typed* name's fault is called, which is a different sentence for
	 * a different moment and not a second answer to the same question: a
	 * refusal happens between renders, when the block below is still describing
	 * the stored name and says nothing about what was just typed. It is about
	 * the edit — hence the revert clause the caller adds — where the pair above
	 * is about the file.
	 */
	const typedReason = (fault: NameFault, name: string): string =>
		fault === 'blank'
			? 'A name is required'
			: `"${name}" is already used by another modifier`;

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
		/*
		 * Judged as it renders, against the name the layout already holds: both
		 * of these faults are ones `parseLayout` accepts and
		 * `parseModifierDefinitions` merely reports, so a hand-edited layout —
		 * or one a sheet saved a modifier into — arrives with a clean-looking
		 * field beside a definition that does nothing.
		 *
		 * The report under the list says the same two things and keeps saying
		 * them; what this adds is the anchor. The blank case is the sharp one:
		 * that report carries no locator for it, because there is no name to
		 * locate it by, so on ten definitions it says only that one of them has
		 * no name.
		 *
		 * The reason is finished into a sentence by `field-reason.ts`, which is
		 * where that one line moved when this became its second caller
		 * (`docs/PATTERNS.md` §1's one-step tier). Not imported from
		 * `list-fields.ts`, which is where it used to live: this module's
		 * imports from that file are already a recorded coupling
		 * (`docs/BACKLOG.md` § Patterns), and a rule with nothing list-shaped
		 * about it does not belong there in the first place.
		 */
		const stored = named.trim();
		const storedFault = nameFault(stored, definitions.slice(0, index));
		fieldError(
			nameInput,
			reasonMessage(
				storedFault === null ? null : storedReason(storedFault, stored),
			),
		);
		nameInput.addEventListener('change', () => {
			const next = nameInput.value.trim();
			/*
			 * A refusal puts the stored name back, which is the rows and columns
			 * editors' rule and their words: leaving the typed text in a field
			 * whose value was refused makes the field lie about what the file holds
			 * the moment focus moves on.
			 */
			const fault = nameFault(
				next,
				definitions.filter((_, i) => i !== index),
			);
			if (fault !== null) {
				nameInput.value = named;
				const reason = typedReason(fault, next);
				fieldError(
					nameInput,
					// Nothing to have been left as: a blank name refused on a
					// definition that had none. Every other refusal names what
					// the field went back to, the duplicate included.
					next === '' && named === ''
						? `${reason}.`
						: `${reason}, so ${next === '' ? 'it' : 'this one'} was left as "${named}".`,
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
				/*
				 * **"No change carries an amount"**, which is the flat guard read on a
				 * definition that may now name several values: a definition with two
				 * changes and an amount on either is authored work, and one with none is
				 * the row that was just added.
				 */
				if (!carriesAmount(definition)) return null;
				const count = changeCount(definition);
				/*
				 * **The whole clause is the ternary, not half of it**, so the
				 * one-change sentence is the shipped one word for word: a definition
				 * that names one value still reads "Its target, amount and condition
				 * are lost." A definition naming several has no single target or
				 * amount to name, so it says how many it has instead.
				 */
				const lost =
					count === 1
						? 'Its target, amount and condition are lost.'
						: `Its ${count} changes and its condition are lost.`;
				return `Remove the modifier "${named}"? ${lost} Every character's row that names it keeps the name and changes nothing until it is pointed at another modifier.`;
			},
		);

		/*
		 * **The two spellings, as the editor holds them.** A definition still
		 * spelled flat is edited in place — every control writes onto the definition
		 * itself, exactly as it did before this list existed — so a layout full of
		 * flat definitions opened and closed is byte-identical. One holding a
		 * `changes` list edits the entries.
		 *
		 * `changes: []` is **drawn** as one line and not **grown** into one: a hand
		 * edit can leave the list empty, the parser already reads that as a
		 * definition naming no value, and a line with nowhere to write would accept
		 * an edit and drop it — but pushing an entry into the author's own array at
		 * render time is the editor rewriting a file it was only asked to show.
		 * Nothing persists at that instant, which is what made it look safe; the
		 * next commit anywhere in the pane serialises the whole layout, so `[]`
		 * would come back as `[{}]` after an edit to an unrelated field. So the
		 * line is drawn against a detached entry and `commit` below attaches it,
		 * once, when a control on that line actually writes — the same restraint
		 * the list above shows in not materialising `"modifiers": []`.
		 */
		const listed = Array.isArray(definition.changes)
			? (definition.changes as ChangeEntry[])
			: null;
		/** Drawn for an empty list, and in the layout only once something writes. */
		const detached: ChangeEntry | null =
			listed !== null && listed.length === 0 ? {} : null;
		const changes: ChangeEntry[] =
			listed === null
				? [definition]
				: detached === null
					? listed
					: [detached];
		/**
		 * Put the drawn entry into the layout, if there is one and it is not there
		 * yet.
		 *
		 * Called by everything that can be the *first* write to an empty list —
		 * a control on its line, and **Add change**, which on an empty list means
		 * two entries rather than one. Idempotent, so neither has to know whether
		 * the other went first.
		 */
		const attach = (): void => {
			if (detached !== null && listed !== null && listed.length === 0) {
				listed.push(detached);
			}
		};
		/**
		 * Attach the drawn entry if there is one, then write.
		 *
		 * Every control *on a change line* commits through this; the name, the
		 * condition and the list's own controls do not, because none of them writes
		 * into a change.
		 */
		const commit = (): void => {
			attach();
			context.persist();
		};
		/** Whether a control's own name has to say which change it belongs to. */
		const several = changes.length > 1;

		/** What one change is called, for the controls that have to tell two apart. */
		const changeName = (at: number): string => {
			const target = String(changes[at]?.target ?? '').trim();
			const label = targets.find((one) => one.name === target)?.label;
			return label ?? (target === '' ? `change ${at + 1}` : target);
		};
		/**
		 * The qualifier every control on a change line carries where there are
		 * several — four identical accessible names down one entry is exactly what a
		 * screen reader cannot tell apart while a sighted reader can, and it is
		 * empty on the one-change case so a flat definition announces what it always
		 * did.
		 */
		const qualified = (at: number, control: string): string =>
			several
				? `${named || 'Modifier'} ${control}, ${changeName(at)}`
				: `${named || 'Modifier'} ${control}`;

		const renderChange = (line: HTMLElement, at: number): void => {
			const change = changes[at] as ChangeEntry;
			const detail = line;
			// The change line *is* a detail line, so the geometry three rounds of
			// measurement produced is kept rather than re-derived beside it.
			detail.addClass('sheetsmith-entry-detail');
			detail.dataset.sheetsmithFlash = `modifier-${named}-${at}-detail`;

			/*
			 * **Value**: the accepting targets, and it shows each one's *label* rather
			 * than the name a formula writes — `Abilities · STR`, not `abilities.STR`.
			 * Labels are unique on a layout by construction (`parseLayout` refuses a
			 * duplicate), so the name adds nothing a reader can use and cost the option
			 * most of its width to a truncation. A stored target the picker does not offer is
			 * carried as an extra last line rather than snapped to blank — §4.2's rule
			 * for a Card's stray option, read here because silently retyping an
			 * author's definition would move every sheet on the layout, and because
			 * the report under the list already says which of the two things is wrong
			 * with it.
			 *
			 * **Called Value and not Changes**, which is the list's own name now: a
			 * heading reading `Changes` over rows whose first control also read
			 * `Changes` said the word twice for two different things, and the row's
			 * control is the narrower of the two — one value, where the list is every
			 * value this modifier moves.
			 */
			const valueField = labelled(detail, 'Value');
			// The one field on this line worth more than an equal share of it: it
			// says what the modifier *does*, and it is the only one whose values are
			// authored labels rather than a closed list of short words.
			valueField.addClass('sheetsmith-detail-field-wide');
			const value = valueField.createEl('select', {
				cls: 'dropdown',
				attr: { 'aria-label': qualified(at, 'value') },
			});
			const storedTarget = String(change.target ?? '').trim();
			value.createEl('option', { value: '', text: '—' });
			for (const target of targets) {
				value.createEl('option', {
					value: target.name,
					text: target.label,
				});
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
			if (
				storedTarget !== '' &&
				!targets.some((t) => t.name === storedTarget)
			) {
				value.createEl('option', {
					value: storedTarget,
					text: storedTarget,
				});
			}
			value.value = storedTarget;
			titleChosen(value);
			value.dataset.sheetsmithFocus = `modifier-${named}-${at}-target`;
			value.addEventListener('change', () => {
				setOptional(change, 'target', value.value);
				commit();
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
				attr: { 'aria-label': qualified(at, 'operator') },
			});
			for (const id of ['add', 'override'] as const) {
				operator.createEl('option', {
					value: id,
					text: OPERATOR_LABELS[id],
				});
			}
			const effective: ModifierOperator = operatorOf(change);
			operator.value = effective;
			titleChosen(operator);
			operator.dataset.sheetsmithFocus = `modifier-${named}-${at}-operator`;
			operator.addEventListener('change', () => {
				// The default is left out of the file, the same rule every select in
				// this pane follows: a change that adds reads as one that never said
				// which it was.
				if (operator.value === 'add') delete change.operator;
				else change.operator = 'override';
				/*
				 * **And the phase goes with it, because the control that sets it does.**
				 * An override is in the result phase by construction, so `applies` beside
				 * one is ignored and `parseModifierDefinitions` reports it — telling the
				 * author to *clear it*, which from this pane they could not do: the field
				 * is reserved and inert on this branch, and this handler is the only
				 * other thing that writes the key. A message naming a gesture the surface
				 * does not offer is worse than no message.
				 *
				 * **Not the "rendered, not corrected" case, and the difference is whose
				 * file it is.** That rule protects *character* data a layout no longer
				 * declares, where correcting would lose a player's work. This is the
				 * author's own layout, being edited through the editor that just took the
				 * control away, one keystroke after they wrote the key.
				 *
				 * The cost is a round trip: Sets and back leaves the phase at its default
				 * rather than at what it was. That is the price of one spelling per
				 * meaning, and it is the same trade `delete change.operator` above
				 * makes for the operator itself.
				 *
				 * `bonusType` has this hole exactly and is **deliberately left alone** —
				 * it predates the phase, no criterion here covers it, and deleting a
				 * stored type on one press of this select is a behaviour change owed its
				 * own look. `docs/UI.md` §12's "a flag outlives the control that sets it"
				 * row holds it.
				 */
				if (operator.value !== 'add') delete change.applies;
				commit();
				context.list.flashAfterRedraw?.(
					`modifier-${named}-${at}-detail`,
				);
				context.redraw();
			});

			const amount = labelled(detail, 'Amount').createEl('input', {
				type: 'text',
				attr: {
					placeholder: 'Expression',
					'aria-label': qualified(at, 'amount'),
				},
			});
			amount.value = String(change.amount ?? '');
			amount.dataset.sheetsmithFocus = `modifier-${named}-${at}-amount`;
			amount.addEventListener('change', () => {
				setOptional(change, 'amount', amount.value);
				commit();
				// The report under the list is about what these expressions say, so it
				// is stale the moment one changes.
				context.redraw();
			});

			{
				/*
				 * Which of the layout's bonus types this change's amount is. The
				 * options come from the layout rather than from a list on the
				 * change, which is why this does **not** reopen SPEC §13's `select`
				 * column question: that one is blocked on a field kind, "a list whose
				 * cells are themselves lists" — which this list *is*, and which
				 * `editor/nested-list-field.ts` now renders, so the blocker is gone
				 * and the column is still a separate design.
				 *
				 * A stored type the layout no longer declares is carried as an extra
				 * last line. It cannot lose character data — nothing stored ever names
				 * a type — but silently retyping an author's definition would change
				 * the arithmetic on every sheet using the layout. The bonus types field
				 * reports it with the whole picture; this keeps the value on screen
				 * where the definition is.
				 */
				/*
				 * **Applies to**, ahead of the bonus type and offered on the same terms.
				 *
				 * It decides *which number* the modifier moves — the value behind the
				 * formula, or what the formula came to — where the type decides how it
				 * contests with whatever else is already moving that number. The coarser
				 * question is asked first, so an author is not choosing how a bonus
				 * stacks before saying what it stacks against.
				 *
				 * Absent on an override, which replaces the published number and is in
				 * the result phase by construction — and **built and hidden rather than
				 * skipped**, exactly as the bonus type below it is, for the reason that
				 * block spells out at length: a field that is simply not created gives
				 * its width back to the line's `2:1:1:1` grow, so a list holding both
				 * kinds reads as two different forms. This shipped as an `if` around the
				 * whole block with a comment claiming it did what the bonus type does,
				 * which is worse than either answer: measured on `editor-layout`, the
				 * eight `Adds to` rows wrapped **Only when** onto a second line with
				 * the value picker clipped to `Abiliti…` while the two `Sets` rows sat on one
				 * line with `Armour class` in full.
				 */
				/*
				 * **A forced line break, not a width cut.** `Applies to` sizes to its
				 * longest option — "The derived number", the reader's own words rather
				 * than the file's (below) — and that is 163px at this control's size,
				 * wider than `Value` was ever measured needing to lose. Two fields on
				 * this line already size to content rather than to a share
				 * (`Operator`, `Bonus type`), on the argument that a closed list has a
				 * knowable longest member and a share is the one thing it does not need
				 * — but a *third* one competing for the line's slack took the dividend
				 * `Value` needs it for. Measured on `editor-layout` at 1400: that field
				 * down to 92px from 191, ten rows reading `Abiliti…`, `Armou…`,
				 * `Skills ·…` with nothing to hover, because a clipped `<select>` has no
				 * `title`.
				 *
				 * `Applies to` and `Bonus type` are a pair — the coarser question and
				 * the finer one about the same change — so they move to their own
				 * line together, and `Only when` sits below the whole list because it
				 * governs every change rather than this one. `Value`, `Operator` and
				 * `Amount` are the three-field line they were before this field
				 * existed, and reclaim the width measured for it.
				 *
				 * A zero-height, full-width flex item rather than a media query or a
				 * `flex-basis` bump on `Applies to` itself: `.sheetsmith-entry-detail`
				 * already wraps at every width (`flex-wrap: wrap`), so a spacer that
				 * claims the whole row forces everything after it onto the next one
				 * regardless of how much room is left — which is what a real 1210px
				 * shot has to be checked against rather than assumed, since a fixed
				 * threshold here would drift the moment a bonus type or an amount grew.
				 */
				detail.createDiv('sheetsmith-detail-break');

				const phaseField = labelled(detail, 'Applies to');
				phaseField.addClass('sheetsmith-detail-field-tight');
				const phase = phaseField.createEl('select', {
					cls: 'dropdown',
					attr: { 'aria-label': qualified(at, 'applies to') },
				});
				// The reader's words rather than the file's: `value` and `result` are
				// what a layout stores, and neither is a thing anyone has seen on a
				// sheet. A score with a modifier over it is.
				phase.createEl('option', { value: 'value', text: 'The value' });
				phase.createEl('option', {
					value: 'result',
					text: 'The derived number',
				});
				phase.value = phaseOf(change);
				titleChosen(phase);
				if (effective === 'add') {
					phase.dataset.sheetsmithFocus = `modifier-${named}-${at}-applies`;
					phase.addEventListener('change', () => {
						// The value phase is the absent key, so choosing it clears rather
						// than stores: one spelling per meaning (PATTERNS §8).
						setOptional(
							change,
							'applies',
							phase.value === 'result' ? 'result' : '',
						);
						commit();
						context.redraw();
					});
				} else {
					// The same box at the same width, out of the tab order and out of the
					// accessibility tree. See the bonus type's own block below for why a
					// spacer cannot stand in and why a disabled control was refused.
					phaseField.addClass('sheetsmith-detail-field-reserved');
					phaseField.setAttribute('aria-hidden', 'true');
				}

				// The same, and it is the field the clip was first seen on:
				// `circumstance` rendered as `circu…`.
				const typeField = labelled(detail, 'Bonus type');
				typeField.addClass('sheetsmith-detail-field-tight');
				const type = typeField.createEl('select', {
					cls: 'dropdown',
					attr: { 'aria-label': qualified(at, 'bonus type') },
				});
				const storedType = String(change.bonusType ?? '').trim();
				// Blank first, and not one of the types: it is what a change with
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
					type.dataset.sheetsmithFocus = `modifier-${named}-${at}-bonus-type`;
					type.addEventListener('change', () => {
						setOptional(change, 'bonusType', type.value);
						commit();
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
					 * byte-identical, and the two `Sets` rows sit the value field 19px wider
					 * with `Operator` and `Amount` 19 and 20px right of every other row — so a
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
		};

		nestedList(entry, {
			count: changes.length,
			token: `modifier-${named}`,
			/*
			 * **The list keeps the word the row's first control gave up.** A
			 * definition's changes are what it changes; one of them names one value,
			 * which is why that control is **Value**. The two are a heading and the
			 * narrower thing under it rather than one word used twice.
			 */
			listLabel: 'Changes',
			addLabel: 'Add change',
			context: context.list,
			renderLine: renderChange,
			nameOf: (at) => `the change to ${changeName(at)}`,
			/*
			 * The same rule the definition's own remove follows one level up: the
			 * confirmation belongs on the change that has been written rather than on
			 * the one just added and still empty, and there is no undo behind any of
			 * this. The cost it names is smaller than a definition's, because nothing
			 * in any note enrols in a *change* — a cell names the definition, which
			 * goes on applying whatever is left.
			 */
			describeRemoval: (at) => {
				const change = changes[at] as ChangeEntry;
				if (String(change.amount ?? '').trim() === '') return null;
				// Enumerated the way the definition's own confirmation enumerates: a
				// change carries an amount, a bonus type and a phase, and naming two
				// of the three would say the third survives.
				return `Remove the change to ${changeName(at)}? Its amount, bonus type and phase are lost. "${named}" goes on applying its other changes.`;
			},
			onAdd: () => {
				/*
				 * **Flat becomes nested here, once, on the author's own press.** The
				 * five flat members move into the first entry and are deleted, which is
				 * a write the author asked for, in the author's own layout, through the
				 * editor that is taking the flat spelling away — the same distinction
				 * the operator handler above already draws when it deletes `applies`.
				 *
				 * Removing the second change does **not** convert back: rewriting a file
				 * the author did not ask to have rewritten argues harder than one
				 * spelling per meaning does, and the flat spelling exists for
				 * compatibility rather than as a preferred form. The cost is a round
				 * trip — **Add change** then remove leaves the definition nested with
				 * one entry — named here rather than hidden.
				 */
				// An empty list draws one line that is not in the file yet, so
				// **Add change** there means two: the drawn one and the new one.
				attach();
				if (listed === null) {
					const first: Record<string, unknown> = {};
					const held = definition as Record<string, unknown>;
					for (const key of MODIFIER_CHANGE_KEYS) {
						if (held[key] === undefined) continue;
						first[key] = held[key];
						delete held[key];
					}
					definition.changes = [
						first,
						{},
					] as unknown as ModifierChange[];
				} else {
					listed.push({});
				}
				const next = (definition.changes as ChangeEntry[]).length - 1;
				// The rule every add in this pane follows: focus lands on the new
				// entry's first control, which here is the value it has yet to name.
				context.list.focusAfterRedraw(
					`modifier-${named}-${next}-target`,
				);
				context.list.flashAfterRedraw?.(
					`modifier-${named}-${next}-detail`,
				);
				context.persist();
				context.redraw();
			},
			onRemove: (at) => {
				// Only ever reachable with more than one change, so this cannot empty
				// the list — which is the floor `nested-list-field.ts` holds.
				(definition.changes as ChangeEntry[]).splice(at, 1);
				context.persist();
				context.redraw();
			},
		});

		/*
		 * **The definition's own line, under the whole list.** `Only when` governs
		 * every change together (SPEC §5), so it sits below them rather than on any
		 * one of them — which is also what tells a reader at a glance that the
		 * condition is not one change's business.
		 */
		const own = entry.createDiv('sheetsmith-entry-detail');
		const when = labelled(own, 'Only when').createEl('input', {
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
