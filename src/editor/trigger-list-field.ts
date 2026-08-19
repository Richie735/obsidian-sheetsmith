/*
 * The layout's reset triggers (SPEC §6, §7), as a field in the settings tab.
 *
 * A textarea, one name per line, for the same reasons the function library is
 * one: a trigger list is read as a set, a 5e layout's is two lines, and the
 * order they are written in is the order their buttons appear. It renders
 * beside the library and below the component forms, because both are written
 * once per layout while component forms are opened constantly.
 *
 * A name that cannot be used is reported here rather than refused at load,
 * exactly as an unparseable function definition is: the sheets on this layout
 * go on rendering while it is fixed. Bindings pointing at nothing are
 * reported here too, since this is the one place with the whole picture —
 * a component's own form repeats only the problem that belongs to it.
 */

import { Setting } from 'obsidian';
import { Layout } from '../parse/layout';
import { parseTriggers } from '../parse/triggers';

const TRIGGER_PLACEHOLDER = 'Long rest';
const PROBLEMS_ID = 'sheetsmith-trigger-problems';

/**
 * A rendered field, held by the editor so its text can be read back rather
 * than waited on. The layout travels with it, because a stale field must
 * never write into the layout that replaced it.
 */
export interface TriggerListField {
	input: HTMLTextAreaElement;
	layout: Layout;
	showProblems: (names: readonly string[]) => void;
}

/**
 * Read the field's text back into its layout, reporting whether anything
 * changed. Returns false for a field whose DOM is gone.
 *
 * Separate from the field's own change listener for the reason the function
 * library is: `change` does not fire on the paths that matter, including a
 * pointerdown on the grid preview, which calls preventDefault and suppresses
 * the focus change along with the event.
 */
export function commitTriggerList(field: TriggerListField | null): boolean {
	if (!field || !field.input.isConnected) return false;

	const names = field.input.value.split('\n').map((line) => line.trim());
	// Trailing blank lines are an artefact of typing, not content. Blanks in
	// the middle are kept, because parseTriggers reports them and a silently
	// deleted line is worse than a named one.
	while (names.length > 0 && names.at(-1) === '') names.pop();

	field.showProblems(names);

	const current = field.layout.triggers ?? [];
	if (
		names.length === current.length &&
		names.every((name, index) => name === current[index])
	) {
		return false;
	}
	if (names.length === 0) delete field.layout.triggers;
	else field.layout.triggers = names;
	return true;
}

export interface TriggerListContext {
	/** Called after a commit that changed something. */
	persist: () => void;
	/** Redraw the tab, so component forms pick up the new trigger list. */
	redraw: () => void;
}

export function renderTriggerList(
	container: HTMLElement,
	layout: Layout,
	context: TriggerListContext,
): TriggerListField {
	new Setting(container).setHeading().setName('Reset triggers');

	const setting = new Setting(container)
		.setDesc(
			createFragment((fragment) => {
				fragment.appendText(
					'The named events this layout resets on, one per line, in the order their buttons appear on a sheet. A component binds to one in its own settings above.',
				);
				fragment.createEl('br');
				fragment.createEl('code', { text: 'Short rest' });
			}),
		)
		.setClass('sheetsmith-trigger-list');

	const problemsEl = container.createDiv('sheetsmith-function-problems');
	problemsEl.id = PROBLEMS_ID;
	problemsEl.setAttribute('role', 'status');

	// Definite assignment: addTextArea runs its callback synchronously.
	let field!: TriggerListField;

	setting.addTextArea((area) => {
		const input = area.inputEl;
		area.setValue((layout.triggers ?? []).join('\n'));
		area.setPlaceholder(TRIGGER_PLACEHOLDER);
		input.rows = 3;
		input.dataset.sheetsmithFocus = 'trigger-list';
		input.setAttribute('aria-describedby', PROBLEMS_ID);

		const showProblems = (names: readonly string[]): void => {
			problemsEl.empty();
			// Against the names as typed rather than as last saved, so the
			// report follows the field instead of trailing a commit behind it.
			const { names: usable, problems } = parseTriggers({
				...layout,
				triggers: [...names],
			});
			input.toggleClass('sheetsmith-input-invalid', problems.length > 0);
			input.setAttribute('aria-invalid', String(problems.length > 0));

			for (const problem of problems) {
				problemsEl.createDiv('sheetsmith-function-problem', (el) => {
					if (problem.component !== undefined) {
						el.createSpan({
							cls: 'sheetsmith-function-problem-line',
							text: problem.component,
						});
					}
					el.createSpan({ text: problem.message });
				});
			}

			// The only confirmation a working list gets, and the only way to
			// see that the good names survived a bad one.
			if (usable.length > 0 || problems.length > 0) {
				problemsEl.createDiv('setting-item-description', (el) =>
					el.setText(
						`${usable.length} trigger${usable.length === 1 ? '' : 's'} defined.`,
					),
				);
			}
		};

		field = { input, layout, showProblems };
		input.addEventListener('change', () => {
			if (!commitTriggerList(field)) return;
			context.persist();
			// A component's reset dropdown lists these names, so the forms
			// above are stale the moment this changes.
			context.redraw();
		});
		showProblems(layout.triggers ?? []);
	});

	return field;
}
