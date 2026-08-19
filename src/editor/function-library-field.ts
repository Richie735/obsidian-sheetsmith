/*
 * The layout's own arithmetic (SPEC §5, §7), as a field in the settings tab.
 *
 * A textarea rather than a row per function: definitions are read as a set,
 * and a 5e library is four lines that want to be looked at together. A
 * definition that will not parse is reported here and left out of the
 * library, rather than refused at load — the sheets using this layout go on
 * rendering while it is being fixed.
 *
 * It renders last, below the component list, and that is a choice rather than
 * an accident. A library is written once per layout; component forms are
 * opened and closed constantly. Putting six rows of textarea between the grid
 * preview and those forms would charge the frequent task to shorten the trip
 * to the rare one. The cost is real and worth stating: on a long layout the
 * definitions are a scroll away from the formulas calling them, which is a
 * side panel's job to fix, and the M4 canvas editor is where that panel
 * arrives (SPEC §7).
 */

import { bindFitToContent } from './list-field-height';
import { Setting } from 'obsidian';
import { parseFunctions } from '../formula/functions';
import { Layout } from '../parse/layout';

/**
 * Sample definitions for the field. Held as constants because they are
 * expressions rather than prose: `mod` is the name the user types into a
 * formula, and sentence case would make it a different one.
 */
const FUNCTION_EXAMPLE = 'mod(score) = floor((score - 10) / 2)';
const FUNCTION_PLACEHOLDER = 'prof = ceil(level / 4) + 1';

/** Ties the problems block to the textarea for assistive tech. */
const PROBLEMS_ID = 'sheetsmith-function-problems';

/**
 * A rendered field, held by the editor so its text can be read back rather
 * than waited on. The layout travels with it, because a stale field must
 * never write into the layout that replaced it.
 */
export interface FunctionLibraryField {
	input: HTMLTextAreaElement;
	layout: Layout;
	showProblems: (definitions: readonly string[]) => void;
}

/**
 * Read the field's text back into its layout, reporting whether anything
 * changed. Returns false for a field whose DOM is gone.
 *
 * Separate from the field's own change listener because `change` is not
 * guaranteed on the paths that matter: closing the settings tab detaches a
 * focused textarea, and a pointerdown on the grid preview calls
 * preventDefault, which suppresses the focus change and the change event with
 * it. Every other field on the tab risks a word that way. This one risks a
 * layout's entire arithmetic, so it is read rather than waited on.
 */
export function commitFunctionLibrary(
	field: FunctionLibraryField | null,
): boolean {
	if (!field || !field.input.isConnected) return false;

	const definitions = field.input.value.split('\n').map((line) => line.trimEnd());
	// Trailing blank lines are an artefact of typing, not content.
	while (definitions.length > 0 && definitions.at(-1) === '') definitions.pop();

	field.showProblems(definitions);

	const current = field.layout.functions ?? [];
	if (
		definitions.length === current.length &&
		definitions.every((line, index) => line === current[index])
	) {
		return false;
	}
	if (definitions.length === 0) delete field.layout.functions;
	else field.layout.functions = definitions;
	return true;
}

/** What the field needs back from the editor when its text is committed. */
export interface FunctionLibraryContext {
	/** Called after a commit that changed something. */
	persist: () => void;
}

export function renderFunctionLibrary(
	container: HTMLElement,
	layout: Layout,
	context: FunctionLibraryContext,
): FunctionLibraryField {
	new Setting(container).setHeading().setName('Function library');

	const setting = new Setting(container)
		.setDesc(
			createFragment((fragment) => {
				fragment.appendText(
					'The functions this layout defines, one per line. Formulas anywhere on the sheet can call them, and a function sees only its own parameters and the sheet — never the card that called it. Lines starting with # are notes to yourself.',
				);
				fragment.createEl('br');
				fragment.createEl('code', { text: FUNCTION_EXAMPLE });
			}),
		)
		.setClass('sheetsmith-function-library');

	const problemsEl = container.createDiv('sheetsmith-function-problems');
	problemsEl.id = PROBLEMS_ID;
	// Blurring the field is the moment a definition is judged, and a screen
	// reader is looking elsewhere by then. Polite, so it waits for a pause
	// rather than interrupting.
	problemsEl.setAttribute('role', 'status');

	// Definite assignment: addTextArea runs its callback synchronously, so the
	// field exists before this function returns and before any listener that
	// closes over it can fire.
	let field!: FunctionLibraryField;

	setting.addTextArea((area) => {
		const input = area.inputEl;
		area.setValue((layout.functions ?? []).join('\n'));
		area.setPlaceholder(FUNCTION_PLACEHOLDER);
		bindFitToContent(input);
		input.dataset.sheetsmithFocus = 'function-library';
		input.setAttribute('aria-describedby', PROBLEMS_ID);

		const showProblems = (definitions: readonly string[]): void => {
			problemsEl.empty();
			const { library, problems } = parseFunctions(definitions);
			input.toggleClass('sheetsmith-input-invalid', problems.length > 0);
			input.setAttribute('aria-invalid', String(problems.length > 0));

			for (const problem of problems) {
				// Small inline text, not the bordered box that says a layout
				// file is unreadable: a half-typed definition is a work in
				// progress, and three of them must not read as a disaster.
				problemsEl.createDiv('sheetsmith-function-problem', (el) => {
					el.createSpan({
						cls: 'sheetsmith-function-problem-line',
						text: `Line ${problem.line}`,
					});
					// The offending text in the field's own font, so the eye can
					// match it against the textarea rather than hunt.
					el.createEl('code', { text: problem.source });
					el.createSpan({ text: problem.message });
				});
			}

			// The only confirmation a working library ever gets, and the only
			// way to tell that the good lines survived a bad one — which is the
			// whole point of not refusing the file.
			if (library.size > 0 || problems.length > 0) {
				const ignored =
					problems.length > 0
						? `, ${problems.length} line${problems.length === 1 ? '' : 's'} ignored`
						: '';
				problemsEl.createDiv('setting-item-description', (el) =>
					el.setText(
						`${library.size} function${library.size === 1 ? '' : 's'} defined${ignored}.`,
					),
				);
			}
		};

		field = { input, layout, showProblems };
		// Commit on blur, like every other text field on the tab. Parsing per
		// keystroke would report a half-typed definition as broken.
		input.addEventListener('change', () => {
			if (commitFunctionLibrary(field)) context.persist();
		});
		showProblems(layout.functions ?? []);
	});

	return field;
}
