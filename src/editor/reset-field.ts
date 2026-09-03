/*
 * A component's reset bindings (SPEC §6), as a field in the layout editor.
 *
 * `reset` is the one piece of config the editor renders rather than the
 * component declaring it — every component that can act on a reset binds the
 * same way, so declaring it per component would be one field copied into each
 * of them. That is why it renders from here and not from `configFields`, and
 * why `RESERVED_KEYS` forbids a component from declaring the key. Which
 * components are offered it is the editor's call, on `applyReset`.
 *
 * Its own module rather than a method on the editor, on the same argument as
 * `trigger-list-field.ts` beside it: the two halves of SPEC §6 are the layout's
 * list of trigger names and a component's bindings onto them, and the editor's
 * job is to hand each of them a form element and the layout. What the two share
 * is `parse/triggers.ts`, which both read and neither owns.
 */

import { Setting } from 'obsidian';
import { getComponent } from '../components';
import { onCommit } from './field-commit';
import { showFieldError } from './field-error';
import { groupHeading } from './form-group';
import { bindingKey, Layout } from '../parse/layout';
import { parseTriggers } from '../parse/triggers';
import { ComponentConfig, ResetBinding } from '../types';

/** Dropdown sentinel for a binding that acts on the buffer only. */
const NO_ACTION_OPTION = '::none::';

/**
 * Dropdown sentinel for a binding that names no part of the component.
 *
 * Only ever *offered* where that is already the case, on the trigger dropdown's
 * own rule: a value the list does not hold is added to the list so that opening
 * the form cannot silently rebind the component. A picker that quietly wrote the
 * first column into the layout on a redraw would be that bug with worse
 * consequences, since the trigger would then start clearing a column nobody
 * chose.
 */
const NO_COLUMN_OPTION = '::nothing::';

/**
 * The **Acts on** row's description.
 *
 * A constant rather than an inline string for the reason the two above it are:
 * it is long enough that inlining it wraps the call that draws the row into
 * something a reader has to unpick before they can see what the row *is*.
 */
const ACTS_ON_DESC =
	'Which column this trigger acts on. Cells in every other column are left exactly as they are.';

/**
 * One of a binding's continuation rows: the buffer toggle, the column picker,
 * the expression field.
 *
 * Obsidian 1.13 draws every settings row as a card of its own with a gap under
 * it, so a trigger, the column it acts on and the expression it resets to came
 * out as three peers with nothing but their order saying which belonged to
 * which — and on two bindings, the first binding's last row sat against
 * `Trigger 2` and read as that one's. The class is what `editor.css` closes the
 * gap on, so a binding is one block and the gap that is left falls between
 * bindings. Marked here rather than inferred in CSS from the row's name,
 * because the name is copy and this is structure.
 */
function detailRow(form: HTMLElement): Setting {
	const row = new Setting(form);
	row.settingEl.addClass('sheetsmith-reset-binding-detail');
	return row;
}

/**
 * A component's own refusal, drawn as a line of its own.
 *
 * `ResetColumn.refuses` is framed as a `ResetResult` error — it continues
 * `<component label> — `, so it opens lower case — and this is the only reader
 * that draws it with no prefix. Adapting here rather than asking the component
 * for two spellings: one string means the sheet and the pane cannot come to
 * disagree about why a column refuses an action, and a capital is the whole of
 * what the two surfaces differ by.
 */
function asOwnLine(reason: string): string {
	return reason.charAt(0).toUpperCase() + reason.slice(1);
}

/** Held as a constant because it is an expression, not prose to be cased. */
const RESET_FORMULA_EXAMPLE = 'mod(abilities.CON) * level';

/** Held as a constant because the examples are the names of games. */
const BUFFER_CLEAR_DESC =
	'Which event empties the buffer is a rule of the system, so the layout says it here: a long rest in 5e, the end of an encounter in 4e, the next score in Blades.';

/**
 * The three reset actions (SPEC §6), labelled as what they do to a component
 * rather than as the words stored. "Restore to max" reads as a pool's ceiling
 * and would read as nonsense over a toggle, which is why the stored names are
 * the states.
 */
const RESET_ACTIONS: readonly (readonly [string, string])[] = [
	['full', 'Restore to full'],
	['empty', 'Set to empty'],
	['formula', 'Set to a formula'],
	// A trigger may be about the buffer alone — 4e clears temporary hit points
	// at the end of an encounter and touches nothing else — so "nothing" is a
	// real choice here rather than the absence of one.
	[NO_ACTION_OPTION, 'Leave the value alone'],
];

/**
 * What this field needs from the editor around it.
 *
 * Three members and not `ListContext`: this field has no list chrome, so
 * reusing that one would hand it a drag index and a confirmation it never
 * touches, and the next reader would have to check whether it does. The shape
 * is `TriggerListContext`'s — the pane's write and the pane's redraw — plus the
 * error map, because an inline error here must outlive the redraw that a
 * changed dropdown causes.
 */
export interface ResetFieldContext {
	/** Write the layout. */
	persist: () => void;
	/** Rebuild the pane. */
	redraw: () => void;
	/** Inline errors by focus token, so they outlive a rebuild of the pane. */
	errors: Map<string, string>;
}

/**
 * The reset binding (SPEC §6), for a component that can act on one.
 *
 * Three controls rather than one, because the action decides whether the
 * expression field means anything: `full` and `empty` need nothing typed,
 * and only `formula` carries a `to`. Unbinding is a first-class choice in
 * the trigger dropdown rather than a cleared text field, since "resets on
 * nothing" is a state a layout holds deliberately.
 *
 * **What the component conditions is a row of its own, never a control in the
 * binding line.** A buffer toggle, an expression field and a column picker each
 * get a settings row underneath, because a third dropdown beside the trigger and
 * the action would be a third control on a line the pane cannot afford
 * (`docs/UI.md` §12).
 */
export function renderResetField(
	form: HTMLElement,
	layout: Layout,
	config: ComponentConfig,
	context: ResetFieldContext,
): void {
	const { names, problems } = parseTriggers(layout);
	const bindings = config.reset ?? [];
	/** Bound once: every inline error here outlives a rebuild of the pane. */
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.errors);

	/*
	 * Both asked of the component, never inferred: the editor knowing that a
	 * Pool has temporary points and a Table has columns is exactly the coupling
	 * the contract exists to prevent.
	 *
	 * **Whether the member exists and what it answers are two questions**, and
	 * the controls below need them apart. A component that declares no
	 * `resetColumns` binds as a whole and draws exactly the form it drew before
	 * this existed; one that declares it and returns nothing has nothing for a
	 * trigger to act on yet, which is a state to report rather than a form to
	 * draw.
	 */
	const definition = getComponent(config.type);
	const buffered = definition?.hasBuffer === true;
	const usesColumns = definition?.resetColumns !== undefined;
	const columns = definition?.resetColumns?.(config) ?? [];

	/**
	 * Whether another binding already holds this trigger-and-column pair.
	 *
	 * The pair, because that is what `parseReset` refuses: two bindings on one
	 * trigger naming different columns are ordinary on a component with columns,
	 * and either control on the form can create the collision.
	 *
	 * Through the parser's own `bindingKey` rather than a comparison spelled
	 * here, so the editor cannot come to disagree with the file format about
	 * what a duplicate is and start writing layouts the plugin will not load.
	 */
	const taken = (
		self: ResetBinding,
		trigger: string,
		column: string | undefined,
	): boolean => {
		const key = bindingKey({ trigger, column });
		return bindings.some(
			(other) => other !== self && bindingKey(other) === key,
		);
	};

	const duplicate = usesColumns
		? 'This component already resets that column on that trigger.'
		: 'This component already resets on that trigger.';

	groupHeading(
		form,
		'Resets on',
		names.length === 0
			? 'This layout declares no triggers yet. Add one below and it appears here.'
			: 'Which triggers restore this component, and what each restores it to. A system whose long rest also covers its short rest binds to both.',
		bindings.length,
	);

	bindings.forEach((reset, index) => {
		const setting = new Setting(form).setName(`Trigger ${index + 1}`);

		setting.addDropdown((dropdown) => {
			for (const name of names) dropdown.addOption(name, name);
			// A binding pointing at a trigger that no longer exists still has
			// to be selectable, or opening the form would silently rebind the
			// component to whatever happened to be first.
			if (!names.includes(reset.trigger)) {
				dropdown.addOption(reset.trigger, `${reset.trigger} (not declared)`);
			}
			dropdown.setValue(reset.trigger);
			dropdown.selectEl.dataset.sheetsmithFocus = `reset-trigger-${config.id}-${index}`;
			dropdown.onChange((value) => {
				// Two bindings on one trigger-and-column pair have no sensible
				// reading, and the parser refuses the file over it — so it is
				// refused here, where it can still be corrected.
				if (taken(reset, value, reset.column)) {
					showFieldError(dropdown.selectEl, duplicate);
					dropdown.setValue(reset.trigger);
					return;
				}
				reset.trigger = value;
				context.persist();
				context.redraw();
			});
		});

		setting.addDropdown((dropdown) => {
			for (const [value, label] of RESET_ACTIONS) {
				// Leaving the value alone is only a choice where something
				// else on the binding can still act; otherwise it would be a
				// binding that does nothing, which the parser refuses.
				if (value === NO_ACTION_OPTION && !buffered) continue;
				dropdown.addOption(value, label);
			}
			dropdown.setValue(reset.action ?? NO_ACTION_OPTION);
			dropdown.selectEl.dataset.sheetsmithFocus = `reset-action-${config.id}-${index}`;
			dropdown.onChange((value) => {
				if (value === NO_ACTION_OPTION) {
					delete reset.action;
					// Something has to happen, so the buffer takes over.
					reset.buffer = 'clear';
				} else {
					// The expression is kept when the action moves off
					// formula, so switching away and back does not throw away
					// what was typed. parseReset keeps it too.
					reset.action = value as ResetBinding['action'];
				}
				context.persist();
				context.redraw();
			});
		});

		if (buffered) {
			detailRow(form)
				.setName('Also clear temporary points')
				.setDesc(BUFFER_CLEAR_DESC)
				.addToggle((toggle) => {
					toggle.setValue(reset.buffer === 'clear');
					toggle.toggleEl.dataset.sheetsmithFocus = `reset-buffer-${config.id}-${index}`;
					toggle.onChange((on) => {
						if (on) reset.buffer = 'clear';
						else if (reset.action === undefined) {
							// The binding would be left doing nothing at all.
							// The container's own checkbox, which is where an
							// inline error is anchored. The `?? createEl` this
							// used to carry was there because `toggleEl` *was*
							// the input, so the query found nothing and the
							// fallback quietly built a second one.
							const box = toggle.toggleEl.querySelector('input');
							if (box?.instanceOf(HTMLInputElement)) {
								showFieldError(
									box,
									'Give the binding an action first, or remove it.',
								);
							}
							toggle.setValue(true);
							return;
						} else delete reset.buffer;
						context.persist();
						context.redraw();
					});
				});
		}

		/*
		 * **Its own settings row underneath**, exactly where **Also clear
		 * temporary points** and **Resets to** already sit. A third dropdown in
		 * the binding row would be a third control on a line the pane cannot
		 * afford — `docs/UI.md` §12 already carries a row for the pane having no
		 * narrow regime below about 470px — and this file's own precedent is
		 * that a field the action or the component conditions gets a row of its
		 * own.
		 *
		 * Named for what the trigger does rather than for what it picks: the
		 * entries carry their own labels out of the component, and the editor
		 * calling the row **Column** would be naming the kind of thing this
		 * component holds, which is the coupling `resetColumns` exists to avoid.
		 *
		 * **Acts on** and not **Applies to**, which was the first choice and is
		 * taken twice already — `modifier-definitions-field.ts` puts it on every
		 * definition *in this pane*, and `components/modifier-form.ts` on the
		 * sheet's own panel, both meaning which number a modifier moves. One
		 * label for two questions one form apart is the lookalike `docs/UI.md`
		 * §9 opens against. This row's own description already used the words.
		 */
		if (usesColumns) {
			const chosen = columns.find((entry) => entry.key === reset.column);
			// The picker is what having something to pick conditions. The report
			// under it is not: a binding on a component that now offers no column
			// at all is exactly the binding that will fail at the press, and the
			// editor is the earlier and better-placed half of that message.
			const refused =
				reset.action === undefined
					? undefined
					: chosen?.refuses?.[reset.action];
			const problem =
				columns.length === 0
					? // No picker is drawn, so neither line below can name a
						// control the author can reach: the fix is on the
						// component rather than on the binding. Named as a
						// column and never as a table's column — the editor
						// saying what kind of thing this component holds is the
						// coupling `resetColumns` exists to avoid.
						'There is nothing on this component for this trigger to act on, so it resets nothing. Add a column it can act on, or remove this binding.'
					: reset.column === undefined
						? 'Choose what this trigger acts on, or it resets nothing.'
						: chosen === undefined
							? `This component does not offer "${reset.column}" for a trigger to act on. Choose one of the columns it does, or this trigger resets nothing.`
							: refused === undefined
								? null
								: asOwnLine(refused);

			if (columns.length > 0) {
				detailRow(form)
					.setName('Acts on')
					.setDesc(ACTS_ON_DESC)
					.addDropdown((dropdown) => {
						for (const entry of columns) {
							dropdown.addOption(
								entry.key,
								entry.label ?? entry.key,
							);
						}
						// A selected value the list does not hold is added to it, on
						// the trigger dropdown's own rule: opening the form must not
						// silently rebind the component.
						if (reset.column === undefined) {
							dropdown.addOption(NO_COLUMN_OPTION, 'Nothing yet');
						} else if (chosen === undefined) {
							/*
							 * **Short, because a `<select>` clips with no ellipsis
							 * and nothing to hover.** `ui/truncation.ts` cannot
							 * reach an option and `modifier-definitions-field.ts`
							 * already records that a clipped select carries no
							 * `title`, so at this control's width a longer marker
							 * cut mid-word — `Memorised (not on this`, a dangling
							 * bracket that reads as damaged data rather than as a
							 * missing column (`docs/UI.md` §12's stat-note row).
							 *
							 * Measured rather than guessed: about 22 characters fit,
							 * so `(not offered)` at thirteen still cut its own
							 * closing bracket off a nine-character name and *(not
							 * on this component)* at twenty-two never had a
							 * chance. Nine is what leaves an ordinary column name
							 * whole. The precision the word gives up — this state
							 * also catches a column that exists and is not
							 * *eligible*, since `resetColumns` withholds a `text`
							 * one — is carried in full by the error line directly
							 * under the row, which names the column and says the
							 * component does not offer it.
							 */
							dropdown.addOption(reset.column, `${reset.column} (missing)`);
						}
						dropdown.setValue(reset.column ?? NO_COLUMN_OPTION);
						dropdown.selectEl.dataset.sheetsmithFocus = `reset-column-${config.id}-${index}`;
						/*
						 * Obsidian's `Setting` draws its name as a sibling div
						 * with nothing wiring the two together, so a select in
						 * one announces its value and no more. That is
						 * pane-wide and pre-existing; it bites here because
						 * **Acts on** repeats per binding, so two pickers would
						 * announce two column names with nothing saying which
						 * trigger either belongs to. Named for the trigger for
						 * that reason, on `modifier-definitions-field.ts`'s own
						 * shape — the item's identity, then the control's job.
						 */
						dropdown.selectEl.setAttribute(
							'aria-label',
							`${reset.trigger || 'This trigger'} acts on`,
						);
						dropdown.onChange((value) => {
							// The same guard the trigger dropdown runs, because
							// either control can create the pair the parser refuses.
							if (taken(reset, reset.trigger, value)) {
								showFieldError(dropdown.selectEl, duplicate);
								dropdown.setValue(
									reset.column ?? NO_COLUMN_OPTION,
								);
								return;
							}
							reset.column = value;
							context.persist();
							context.redraw();
						});
						/*
						 * **Marked on the control that would fix it**, through
						 * the same `showFieldError` every other inline
						 * validation in this pane uses — including this
						 * dropdown's own duplicate-pair guard, which is why one
						 * field answering with two different treatments was the
						 * instrument disagreeing with itself (`docs/UI.md` §11).
						 *
						 * A boxed `.sheetsmith-error` after the row is anchored
						 * to nothing: it floated between **Acts on** and
						 * **Resets to** with an equal gap each side, and on a
						 * second binding it sat directly above `Trigger 2` and
						 * read as that binding's problem.
						 *
						 * Through the errors map, so it survives the rebuild a
						 * sibling control causes, and recomputed on every render
						 * — which is `docs/features/field-render-validation.md`'s
						 * rule: a state that has been corrected clears its own
						 * message on the next redraw.
						 */
						showFieldError(dropdown.selectEl, problem, context.errors);
					});
			} else if (problem !== null) {
				// The one state with no control to hang a message on: the
				// component offers nothing, so there is no picker and the boxed
				// form is what is left.
				form.createDiv('sheetsmith-error', (el) => el.setText(problem));
			}
		}

		setting.addExtraButton((button) =>
			button
				.setIcon('trash-2')
				.setTooltip('Remove this reset')
				.onClick(() => {
					bindings.splice(index, 1);
					if (bindings.length === 0) delete config.reset;
					context.persist();
					context.redraw();
				}),
		);

		if (reset.action === 'formula') {
			detailRow(form)
				.setName('Resets to')
				.setDesc(
					// The example goes in a code element rather than the prose,
					// as the function library's does: an expression is not a
					// sentence, and sentence-casing it would change what it means.
					createFragment((fragment) => {
						fragment.appendText('Formula giving the value to restore.');
						fragment.createEl('br');
						// Framed, for `line-list-field.ts`'s reason. The fourth of the
						// four call sites that drew a bare example, and the one the
						// backlog row did not name.
						fragment.appendText('For example: ');
						fragment.createEl('code', { text: RESET_FORMULA_EXAMPLE });
					}),
				)
				.addText((text) => {
					text.setValue(reset.to ?? '');
					text.inputEl.dataset.sheetsmithFocus = `reset-to-${config.id}-${index}`;
					onCommit(text, (raw) => {
						const trimmed = raw.trim();
						if (trimmed === '') {
							// The layout would not load: parseReset requires an
							// expression for this action.
							fieldError(
								text.inputEl,
								'A formula reset needs an expression.',
							);
							return;
						}
						fieldError(text.inputEl, null);
						reset.to = trimmed;
						context.persist();
					});
				});
		}
	});

	/** The first column this trigger has not been bound to yet, if any. */
	const unbound = (trigger: string) =>
		columns.find((entry) => {
			const key = bindingKey({ trigger, column: entry.key });
			return !bindings.some((reset) => bindingKey(reset) === key);
		});

	/*
	 * Only triggers this component can still be bound to: offering one it
	 * answers to already would create the duplicate the parser refuses.
	 *
	 * **With columns, a trigger is available while any eligible column is still
	 * unbound for it**, because the duplicate is the pair. One long rest
	 * clearing Conditions and refilling Uses on the same table is two bindings,
	 * so dropping the trigger from the list after the first would put the second
	 * out of reach.
	 */
	const available = names.filter((name) =>
		usesColumns
			? unbound(name) !== undefined
			: !bindings.some((reset) => reset.trigger === name),
	);
	new Setting(form).addButton((button) =>
		button
			.setButtonText('Add reset')
			.setDisabled(available.length === 0)
			.setTooltip(
				names.length === 0
					? 'Declare a trigger below first.'
					: usesColumns && columns.length === 0
						? 'There is nothing on this component for a trigger to act on.'
						: available.length === 0
							? usesColumns
								? 'This component already resets every column on every trigger.'
								: 'This component already resets on every trigger.'
							: 'Bind this component to another trigger.',
			)
			.onClick(() => {
				const trigger = available[0];
				if (trigger === undefined) return;
				const column = usesColumns ? unbound(trigger) : undefined;
				if (usesColumns && column === undefined) return;
				// Restoring to full is what a reset means most of the time,
				// and an action is required, so it is the one that gets to
				// be assumed. The column is the first one still free for this
				// trigger, for the same reason: it is a starting point the
				// author changes, and it cannot be the pair the parser refuses.
				config.reset = [
					...bindings,
					{
						trigger,
						...(column !== undefined ? { column: column.key } : {}),
						action: 'full',
					},
				];
				context.persist();
				context.redraw();
			}),
	);

	// Only this component's own problems. The trigger list below shows every
	// one, which is where the whole picture belongs.
	for (const problem of problems.filter(
		(p) => p.component === config.label,
	)) {
		form.createDiv('sheetsmith-error', (el) => el.setText(problem.message));
	}
}
