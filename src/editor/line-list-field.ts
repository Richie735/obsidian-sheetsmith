/*
 * A layout field holding a list of lines, with its problems reported under it.
 *
 * Two fields in this pane are this: the reset triggers (SPEC §6) and the bonus
 * types (SPEC §5). Both hold a list one-per-line in the layout, both report what
 * cannot be used rather than refusing the file, and both are read back on close
 * rather than waited on.
 *
 * **Extracted after review, and after a measurement that overturned the argument
 * against it.** The first pass compared all *three* textarea fields here — these
 * two and the function library — found nine points of variation, and concluded
 * that a shared module would be a form-description language. The measurement says
 * that was the wrong comparison: against the function library these two differ in
 * 88 stripped lines, and against *each other* they share 72 and differ in nothing
 * but a layout key, a parse call and eight copy strings. The two variations that
 * carried real weight — the problem row's children and the shape of the count
 * sentence — turn out not to vary between these two at all; they are the function
 * library's alone, which is what makes it a cousin rather than a third twin.
 *
 * So the ladder's trigger and its reason agree here where they did not there:
 * §1's two-consumer clause allows duplication only under a test driving both
 * copies over the same cases, the two test files had drifted to different case
 * sets, and one copy is cheaper than the guard that would hold two.
 *
 * **The function library is deliberately not a consumer.** It renders a third
 * child per problem row — the offending source in the field's own font — and a
 * count sentence with an "ignored" clause, and it does not redraw on commit. Those
 * are render callbacks rather than data, and taking them would put the
 * form-description language back.
 *
 * What is *not* here, because it is a policy rather than a form: what a line is.
 * `field-lines.ts` owns that, and the two rules it names — trimmed at both ends
 * for an identifier the file matches on, at the end only for a line of code — are
 * why the cousin can stay a cousin without the drift coming back.
 */

import { Setting } from 'obsidian';
import { storedLines } from './field-lines';
import { groupHeading } from './form-group';
import { bindFitToContent } from './list-field-height';
import { Layout } from '../parse/layout';

/** One thing a parser found wrong, in the shape both parsers already return. */
export interface LineProblem {
	message: string;
	/**
	 * What the problem belongs to, where it belongs to something rather than to
	 * the list: a component whose binding is at fault, a definition whose bonus
	 * type is. Drawn as a quieter locator before the message.
	 *
	 * Named for the job rather than for either producer, because there are now
	 * two and they name different things — a component's label and a definition's
	 * name — and each spec's `read` is what maps its own onto this.
	 */
	locator?: string;
}

/** The keys of `Layout` this field may edit. */
type LineListKey = 'triggers' | 'modifierTypes';

/**
 * Everything one of these fields differs from the other by.
 *
 * All data but the last member, which is why one module serves both: a caller
 * says what its list is called and how to read it, and nothing here learns what
 * a trigger or a bonus type is.
 */
export interface LineListSpec {
	/** The layout key this field is the editor for. */
	key: LineListKey;
	/** The section heading above it. */
	heading: string;
	/** What the field is for, in a sentence stating a consequence. */
	description: string;
	/**
	 * One line of the thing itself, shown under the description.
	 *
	 * A constant at the call site rather than prose, because these are names an
	 * author types and sentence case would make them different names.
	 */
	example: string;
	/** Shown in an empty field. */
	placeholder: string;
	/** The Setting's own class. `styles.test.ts` keys the full-width rule on it. */
	className: string;
	/** The focus token the pane restores across a rebuild. */
	token: string;
	/** The problems element's id, which the textarea describes itself by. */
	problemsId: string;
	/** What one entry is called, for the count line. Pluralised with an "s". */
	noun: string;
	/**
	 * What the layout makes of these lines, as typed rather than as last saved.
	 *
	 * A callback closed over the layout at the call site, which is what collapses
	 * two seams into one: the two parsers take different arguments — a bare list
	 * against a whole layout — and return differently named members, and neither
	 * fact reaches this module.
	 */
	read: (lines: readonly string[]) => {
		usable: readonly string[];
		problems: readonly LineProblem[];
	};
}

/**
 * A rendered field, held by the editor so its text can be read back rather than
 * waited on. The layout travels with it, because a stale field must never write
 * into the layout that replaced it, and so does the spec, so a commit needs
 * nothing but the field.
 */
export interface LineListField {
	input: HTMLTextAreaElement;
	layout: Layout;
	spec: LineListSpec;
	showProblems: (lines: readonly string[]) => void;
}

/** What the field needs back from the editor when its text is committed. */
export interface LineListContext {
	/** Called after a commit that changed something. */
	persist: () => void;
	/** Redraw the pane, so forms reading this list pick the new one up. */
	redraw: () => void;
}

/**
 * Read the field's text back into its layout, reporting whether anything
 * changed. Returns false for a field whose DOM is gone.
 *
 * Separate from the field's own change listener because `change` is not
 * guaranteed on the paths that matter: closing the pane detaches a focused
 * textarea, and a pointerdown on the grid preview calls preventDefault, which
 * suppresses the focus change and the change event with it.
 */
export function commitLineList(field: LineListField | null): boolean {
	if (!field || !field.input.isConnected) return false;

	// The stored-identifier rule from `field-lines.ts`: both lists are matched
	// byte for byte against what a component stored, so a leading space would
	// make a second entry that reads identically on screen.
	const lines = storedLines(field.input.value);
	field.showProblems(lines);

	const current = field.layout[field.spec.key] ?? [];
	if (
		lines.length === current.length &&
		lines.every((line, index) => line === current[index])
	) {
		return false;
	}
	// An absent key stays absent, so a layout that never wanted this list does
	// not grow one on first save.
	if (lines.length === 0) delete field.layout[field.spec.key];
	else field.layout[field.spec.key] = lines;
	return true;
}

export function renderLineList(
	container: HTMLElement,
	layout: Layout,
	spec: LineListSpec,
	context: LineListContext,
): LineListField {
	// A section of the panel, not a panel: the title above it names the layout,
	// and `.setting-item-heading` is the rank that title holds.
	groupHeading(container, spec.heading);

	const setting = new Setting(container)
		.setDesc(
			createFragment((fragment) => {
				fragment.appendText(spec.description);
				fragment.createEl('br');
				/*
				 * Framed, because unframed it reads as the field's value.
				 *
				 * A bare `<code>` under a description sits exactly where a value
				 * would, and both fields this serves make that literal: the modifier
				 * types field shows `item` as its example and `item` is also the
				 * textarea's first line, so the field appears to print its value
				 * twice; the triggers field shows "Short rest" as an example and as a
				 * real entry. `docs/UI.md` §12 recorded this and named the framing
				 * word as the fix, and `CLAUDE.md` is explicit that a recorded gap is
				 * not to be copied into new code — which is what adding a second
				 * field on this shape did.
				 *
				 * Here rather than in each spec, so the two fields cannot drift on
				 * it. That is this module's whole argument: they had already drifted
				 * twice while the code was copied.
				 */
				fragment.appendText('For example: ');
				fragment.createEl('code', { text: spec.example });
			}),
		)
		.setClass(spec.className);

	const problemsEl = container.createDiv('sheetsmith-field-problems');
	problemsEl.id = spec.problemsId;
	// Blurring the field is the moment a line is judged, and a screen reader is
	// looking elsewhere by then. Polite, so it waits for a pause.
	problemsEl.setAttribute('role', 'status');

	// Definite assignment: addTextArea runs its callback synchronously.
	let field!: LineListField;

	setting.addTextArea((area) => {
		const input = area.inputEl;
		area.setValue((layout[spec.key] ?? []).join('\n'));
		area.setPlaceholder(spec.placeholder);
		bindFitToContent(input);
		input.dataset.sheetsmithFocus = spec.token;
		input.setAttribute('aria-describedby', spec.problemsId);

		const showProblems = (lines: readonly string[]): void => {
			problemsEl.empty();
			// Against the lines as typed rather than as last saved, so the report
			// follows the field instead of trailing a commit behind it.
			const { usable, problems } = spec.read(lines);
			input.toggleClass('sheetsmith-input-invalid', problems.length > 0);
			input.setAttribute('aria-invalid', String(problems.length > 0));

			for (const problem of problems) {
				problemsEl.createDiv('sheetsmith-field-problem', (el) => {
					if (problem.locator !== undefined) {
						el.createSpan({
							cls: 'sheetsmith-field-problem-line',
							text: problem.locator,
						});
					}
					el.createSpan({ text: problem.message });
				});
			}

			// The only confirmation a working list gets, and the only way to tell
			// that the good lines survived a bad one.
			if (usable.length > 0 || problems.length > 0) {
				problemsEl.createDiv('setting-item-description', (el) =>
					el.setText(
						`${usable.length} ${spec.noun}${usable.length === 1 ? '' : 's'} defined.`,
					),
				);
			}
		};

		field = { input, layout, spec, showProblems };
		input.addEventListener('change', () => {
			if (!commitLineList(field)) return;
			context.persist();
			// A component's own form reads this list, so the forms above are stale
			// the moment it changes.
			context.redraw();
		});
		showProblems(layout[spec.key] ?? []);
	});

	return field;
}
