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
import { Layout } from '../parse/layout';
import { parseTriggers } from '../parse/triggers';
import { ComponentConfig, ResetBinding } from '../types';

/** Dropdown sentinel for a binding that acts on the buffer only. */
const NO_ACTION_OPTION = '::none::';

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
				// Two bindings on one trigger have no sensible reading, and
				// the parser refuses the file over it — so it is refused
				// here, where it can still be corrected.
				if (bindings.some((other) => other !== reset && other.trigger === value)) {
					showFieldError(
						dropdown.selectEl,
						'This component already resets on that trigger.',
					);
					dropdown.setValue(reset.trigger);
					return;
				}
				reset.trigger = value;
				context.persist();
				context.redraw();
			});
		});

		// Asked of the component, never inferred: the editor knowing that a
		// Pool has temporary points and a Track does not is exactly the
		// coupling the contract exists to prevent.
		const buffered = getComponent(config.type)?.hasBuffer === true;

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
			new Setting(form)
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
			new Setting(form)
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

	// Only triggers this component is not already bound to: offering one it
	// answers to already would create the duplicate the parser refuses.
	const available = names.filter(
		(name) => !bindings.some((reset) => reset.trigger === name),
	);
	new Setting(form).addButton((button) =>
		button
			.setButtonText('Add reset')
			.setDisabled(available.length === 0)
			.setTooltip(
				names.length === 0
					? 'Declare a trigger below first.'
					: available.length === 0
						? 'This component already resets on every trigger.'
						: 'Bind this component to another trigger.',
			)
			.onClick(() => {
				const trigger = available[0];
				if (trigger === undefined) return;
				// Restoring to full is what a reset means most of the time,
				// and an action is required, so it is the one that gets to
				// be assumed.
				config.reset = [...bindings, { trigger, action: 'full' }];
				context.persist();
				context.redraw();
			}),
	);

	// Only this component's own problems. The trigger list below shows every
	// one, which is where the whole picture belongs.
	for (const problem of problems.filter((p) => p.component === config.label)) {
		form.createDiv('sheetsmith-error', (el) => el.setText(problem.message));
	}
}
