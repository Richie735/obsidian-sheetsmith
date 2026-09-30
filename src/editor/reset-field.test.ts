// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ResetFieldContext, renderResetField } from './reset-field';
import { Layout } from '../parse/layout';
import { ComponentConfig, ResetBinding } from '../types';

/*
 * A component's reset bindings (SPEC §6), driven directly.
 *
 * This surface was a private method on the layout editor, where the only thing
 * reachable was whether the group appeared at all — which is what the pane's two
 * cases assert, and all they ever could. Promoting it to a module is the moment
 * §10 attaches, and what it attaches to is the validation: three refusals, a
 * disabled add with three tooltips, and a remove that has to take the key with
 * the last binding. None of it needs a vault, so none of it belongs in a test
 * that opens one.
 *
 * The two pane cases are `config-panel.test.ts`'s. What they assert is that the editor
 * asks the *component* whether it can act on a reset, and that question does not
 * exist from here: this file hands in a config and a layout directly.
 */

interface Recorded {
	persists: number;
	redraws: number;
}

let recorded: Recorded;
let context: ResetFieldContext;

beforeEach(() => {
	recorded = { persists: 0, redraws: 0 };
	context = {
		persist: () => {
			recorded.persists++;
		},
		redraw: () => {
			recorded.redraws++;
		},
		errors: new Map(),
	};
});

/** A layout declaring two triggers and nothing else the field reads. */
function layout(triggers: string[] = ['Long rest', 'Short rest']): Layout {
	return {
		name: 'Sheet',
		columns: 12,
		components: [],
		triggers,
	};
}

/**
 * A Pool, which is the one registered component declaring `hasBuffer`, so it is
 * what the buffer controls are reachable through. Track stands in for the other
 * side of that branch.
 */
function pool(reset?: ComponentConfig['reset']): ComponentConfig {
	return {
		id: 'hit_points',
		type: 'pool',
		label: 'Hit points',
		position: { col: 1, row: 1, width: 2, height: 1 },
		...(reset ? { reset } : {}),
	};
}

function track(reset?: ComponentConfig['reset']): ComponentConfig {
	return { ...pool(reset), id: 'clock', type: 'track', label: 'Clock' };
}

function render(config: ComponentConfig, from = layout()): HTMLElement {
	const form = document.createElement('div');
	document.body.replaceChildren(form);
	renderResetField(form, from, config, context);
	return form;
}

/** The controls, addressed the way the editor's focus tokens address them. */
function control<T extends HTMLElement>(form: HTMLElement, token: string): T {
	const found = form.querySelector<T>(`[data-sheetsmith-focus="${token}"]`);
	if (!found) throw new Error(`no "${token}"; found: ${tokens(form)}`);
	return found;
}

function tokens(form: HTMLElement): string {
	return Array.from(form.querySelectorAll<HTMLElement>('[data-sheetsmith-focus]'))
		.map((el) => el.dataset.sheetsmithFocus)
		.join(', ');
}

function has(form: HTMLElement, token: string): boolean {
	return form.querySelector(`[data-sheetsmith-focus="${token}"]`) !== null;
}

/** Drive a select or a checkbox the way the editor hears it. */
function choose(el: HTMLSelectElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('change'));
}

function toggle(form: HTMLElement, token: string, on: boolean): void {
	const box = control<HTMLElement>(form, token).querySelector('input');
	if (!box) throw new Error(`"${token}" has no checkbox`);
	box.checked = on;
	box.dispatchEvent(new Event('change'));
}

function commit(el: HTMLInputElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('change'));
}

function button(form: HTMLElement, text: string): HTMLButtonElement {
	const found = Array.from(form.querySelectorAll('button')).find(
		(candidate) => candidate.textContent === text,
	);
	if (!found) throw new Error(`no "${text}" button`);
	return found;
}

/** The inline message under a field, wherever it was anchored. */
function fieldError(form: HTMLElement): string | null {
	return form.querySelector('.sheetsmith-field-error')?.textContent ?? null;
}

describe('the trigger a binding points at', () => {
	it('offers every declared trigger, and marks one that is not', () => {
		// A binding pointing at a trigger the layout no longer declares still
		// has to be selectable, or merely opening the form would rebind the
		// component to whatever happened to be first.
		const form = render(pool([{ trigger: 'Solstice', action: 'full' }]));
		const dropdown = control<HTMLSelectElement>(
			form,
			'reset-trigger-hit_points-0',
		);
		expect(Array.from(dropdown.options).map((o) => o.textContent)).toEqual([
			'Long rest',
			'Short rest',
			'Solstice (not declared)',
		]);
		expect(dropdown.value).toBe('Solstice');
	});

	it('refuses a second binding on a trigger, and snaps back', () => {
		// Two bindings on one trigger have no sensible reading and the parser
		// refuses the file over it, so it is refused here, where it can still
		// be corrected rather than found on the next load.
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', action: 'full' },
			{ trigger: 'Short rest', action: 'empty' },
		];
		const form = render(pool(reset));
		const second = control<HTMLSelectElement>(form, 'reset-trigger-hit_points-1');
		choose(second, 'Long rest');
		expect(fieldError(form)).toBe('This component already resets on that trigger.');
		// The field must not be left displaying a binding the layout does not
		// have, and nothing may be written.
		expect(second.value).toBe('Short rest');
		expect(reset[1]?.trigger).toBe('Short rest');
		expect(recorded.persists).toBe(0);
	});

	it('writes an accepted rebinding', () => {
		const reset: ResetBinding[] = [{ trigger: 'Long rest', action: 'full' }];
		const form = render(pool(reset));
		choose(control<HTMLSelectElement>(form, 'reset-trigger-hit_points-0'), 'Short rest');
		expect(reset[0]?.trigger).toBe('Short rest');
		expect(recorded.persists).toBe(1);
		expect(recorded.redraws).toBe(1);
	});
});

describe('what a reset does to the component', () => {
	it('offers leaving the value alone only where a buffer can act instead', () => {
		// Otherwise it is a binding that does nothing, which the parser refuses:
		// the choice is real for a Pool because clearing temporary points is
		// still something happening.
		const labels = (config: ComponentConfig) =>
			Array.from(
				control<HTMLSelectElement>(
					render(config, layout()),
					`reset-action-${config.id}-0`,
				).options,
			).map((o) => o.textContent);
		expect(labels(pool([{ trigger: 'Long rest', action: 'full' }]))).toContain(
			'Leave the value alone',
		);
		expect(labels(track([{ trigger: 'Long rest', action: 'full' }]))).not.toContain(
			'Leave the value alone',
		);
	});

	it('hands the buffer the work when the action is dropped', () => {
		// Something has to happen, so choosing "leave the value alone" is what
		// makes the binding a buffer-only one rather than an empty one.
		const reset = [{ trigger: 'Long rest', action: 'full' as const }];
		const form = render(pool(reset));
		choose(control<HTMLSelectElement>(form, 'reset-action-hit_points-0'), '::none::');
		expect(reset[0]).toEqual({ trigger: 'Long rest', buffer: 'clear' });
	});

	it('keeps the expression when the action moves off formula', () => {
		// So switching away and back does not throw away what was typed.
		// parseReset keeps it too, which is what makes the two agree.
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', action: 'formula', to: 'level * 2' },
		];
		const form = render(pool(reset));
		choose(control<HTMLSelectElement>(form, 'reset-action-hit_points-0'), 'empty');
		expect(reset[0]).toEqual({
			trigger: 'Long rest',
			action: 'empty',
			to: 'level * 2',
		});
	});

	it('shows the expression field for a formula reset and for nothing else', () => {
		expect(
			has(
				render(pool([{ trigger: 'Long rest', action: 'formula', to: 'x' }])),
				'reset-to-hit_points-0',
			),
		).toBe(true);
		expect(
			has(
				render(pool([{ trigger: 'Long rest', action: 'full' }])),
				'reset-to-hit_points-0',
			),
		).toBe(false);
	});

	it('refuses a formula reset with nothing in it', () => {
		// The layout would not load: parseReset requires an expression for this
		// action, so an empty one is refused where it can still be typed.
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', action: 'formula', to: 'level' },
		];
		const form = render(pool(reset));
		commit(control<HTMLInputElement>(form, 'reset-to-hit_points-0'), '  ');
		expect(fieldError(form)).toBe('A formula reset needs an expression.');
		expect(reset[0]?.to).toBe('level');
		expect(recorded.persists).toBe(0);
		// Remembered against the redraw a sibling control causes, which is the
		// whole reason this field takes an error map.
		expect([...context.errors.keys()]).toEqual(['reset-to-hit_points-0']);
	});

	it('says so as it renders, before anything is typed', () => {
		/*
		 * Not a hand-edited file — `parseBinding` refuses one — but a state this
		 * pane creates: choosing **Set to a formula** on a binding with no
		 * expression writes the action, and `persist` then declines to write the
		 * layout at all. The field is where the reader is looking.
		 */
		const form = render(pool([{ trigger: 'Long rest', action: 'formula' }]));
		expect(fieldError(form)).toBe('A formula reset needs an expression.');
		expect(context.errors.get('reset-to-hit_points-0')).toBe(
			'A formula reset needs an expression.',
		);
		// A render judges; it does not write.
		expect(recorded).toEqual({ persists: 0, redraws: 0 });
	});

	it('prints the parser\'s own sentence for an expression that will not parse', () => {
		// The one state nothing anywhere reported until now: parseBinding takes
		// any non-blank string, so the author's first news of it was the press.
		const form = render(
			pool([
				{ trigger: 'Long rest', action: 'formula', to: 'mod(abilities.CON) *' },
			]),
		);
		expect(fieldError(form)).toBe('Expected a value in formula.');
	});

	it('clears its own message once the expression parses', () => {
		/*
		 * Driven as a correction rather than as one clean render, because a
		 * clean render asserts nothing: no message and no map entry are equally
		 * true of a field nobody checks, so the case would pass with the
		 * render-time call deleted, which is the whole feature
		 * (`docs/PATTERNS.md` §10). What only a running check can produce is the
		 * *transition* — marked from the file, then clean from the file, on one
		 * context.
		 */
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', action: 'formula', to: 'mod(abilities.CON) *' },
		];
		const config = pool(reset);
		expect(fieldError(render(config))).toBe('Expected a value in formula.');
		expect(context.errors.size).toBe(1);

		// The hand edit the pane cannot see happening: the file is corrected and
		// the pane is drawn again over the same errors map.
		reset[0] = { ...reset[0], to: 'mod(abilities.CON) * level' } as ResetBinding;
		config.reset = reset;
		expect(fieldError(render(config))).toBe(null);
		expect(context.errors.size).toBe(0);
	});

	it('leaves the message on screen once the action asks for an expression', () => {
		// The redraw the action dropdown causes is what would otherwise wash the
		// message away: this is the state the pane holds and cannot save.
		const config = pool([{ trigger: 'Long rest', action: 'full' }]);
		const form = render(config);
		choose(control<HTMLSelectElement>(form, 'reset-action-hit_points-0'), 'formula');
		expect(recorded.redraws).toBe(1);
		expect(fieldError(render(config))).toBe(
			'A formula reset needs an expression.',
		);
	});

	it('stores an expression that will not parse, and marks it', () => {
		// An expression is invalid for most of the time it is being written, so
		// the commit is not refused: `config-panel.ts`'s ruling one module over.
		const reset: ResetBinding[] = [{ trigger: 'Long rest', action: 'formula' }];
		const form = render(pool(reset));
		commit(
			control<HTMLInputElement>(form, 'reset-to-hit_points-0'),
			'mod(abilities.CON) *',
		);
		expect(reset[0]?.to).toBe('mod(abilities.CON) *');
		expect(recorded.persists).toBe(1);
		expect(fieldError(form)).toBe('Expected a value in formula.');
	});

	it('stores a trimmed expression, and clears the error with it', () => {
		const reset: ResetBinding[] = [{ trigger: 'Long rest', action: 'formula' }];
		const form = render(pool(reset));
		const input = control<HTMLInputElement>(form, 'reset-to-hit_points-0');
		commit(input, '');
		commit(input, '  mod(abilities.CON) * level  ');
		expect(reset[0]?.to).toBe('mod(abilities.CON) * level');
		expect(context.errors.size).toBe(0);
		expect(fieldError(form)).toBe(null);
	});
});

describe('the temporary points toggle', () => {
	it('is offered to a component with a buffer and to no other', () => {
		const binding = [{ trigger: 'Long rest', action: 'full' as const }];
		expect(has(render(pool(binding)), 'reset-buffer-hit_points-0')).toBe(true);
		expect(has(render(track(binding)), 'reset-buffer-clock-0')).toBe(false);
	});

	it('refuses to leave a binding doing nothing at all', () => {
		// The one state the parser cannot accept: no action and no buffer. The
		// toggle is the last thing acting, so turning it off is refused rather
		// than silently making the binding empty.
		const reset: ResetBinding[] = [{ trigger: 'Long rest', buffer: 'clear' }];
		const form = render(pool(reset));
		toggle(form, 'reset-buffer-hit_points-0', false);
		expect(fieldError(form)).toBe('Give the binding an action first, or remove it.');
		expect(reset[0]).toEqual({ trigger: 'Long rest', buffer: 'clear' });
		expect(recorded.persists).toBe(0);
	});

	it('anchors that refusal on the checkbox, not on a second one', () => {
		/*
		 * The message goes under the container's own input. This used to end in
		 * `?? createEl`, which was written when `toggleEl` *was* the input: the
		 * query found nothing and the fallback quietly built a second checkbox
		 * beside the first. Nothing but a count would report that.
		 */
		const form = render(pool([{ trigger: 'Long rest', buffer: 'clear' }]));
		toggle(form, 'reset-buffer-hit_points-0', false);
		expect(form.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
		expect(
			control<HTMLElement>(form, 'reset-buffer-hit_points-0').querySelector(
				'.sheetsmith-field-error',
			),
		).not.toBe(null);
	});

	it('drops the buffer where an action is still left to act', () => {
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', action: 'full', buffer: 'clear' },
		];
		const form = render(pool(reset));
		toggle(form, 'reset-buffer-hit_points-0', false);
		expect(reset[0]).toEqual({ trigger: 'Long rest', action: 'full' });
		expect(recorded.persists).toBe(1);
	});
});

describe('adding and removing a binding', () => {
	it('says there is nothing to bind to when the layout declares no trigger', () => {
		const form = render(pool(), layout([]));
		expect(button(form, 'Add reset').hasAttribute('disabled')).toBe(true);
		expect(button(form, 'Add reset').getAttribute('aria-label')).toBe(
			'Declare a trigger below first.',
		);
		expect(form.textContent).toContain('This layout declares no triggers yet.');
	});

	it('says so once the component is bound to every trigger there is', () => {
		const form = render(
			pool([
				{ trigger: 'Long rest', action: 'full' },
				{ trigger: 'Short rest', action: 'empty' },
			]),
		);
		expect(button(form, 'Add reset').hasAttribute('disabled')).toBe(true);
		expect(button(form, 'Add reset').getAttribute('aria-label')).toBe(
			'This component already resets on every trigger.',
		);
	});

	it('binds to a trigger the component does not answer to yet', () => {
		// Never one it already answers to: that would create the duplicate the
		// refusal above exists to catch.
		const config = pool([{ trigger: 'Long rest', action: 'empty' }]);
		button(render(config), 'Add reset').click();
		expect(config.reset).toEqual([
			{ trigger: 'Long rest', action: 'empty' },
			// Restoring to full is what a reset means most of the time, and an
			// action is required, so it is the one that gets to be assumed.
			{ trigger: 'Short rest', action: 'full' },
		]);
	});

	it('takes the key with the last binding, not just the binding', () => {
		// A layout carrying `reset: []` is the editor writing a key nobody
		// asked for, and it is the shape parseReset has nothing to say about.
		const config = pool([{ trigger: 'Long rest', action: 'full' }]);
		const form = render(config);
		const remove = form.querySelector<HTMLButtonElement>(
			'button[aria-label="Remove this reset"]',
		);
		remove?.click();
		expect(config).not.toHaveProperty('reset');
		expect(recorded.persists).toBe(1);
	});

	it('writes no reset key onto a component whose form was only shown', () => {
		const config = pool();
		render(config);
		expect(config).not.toHaveProperty('reset');
	});
});

describe('what the field says about a broken layout', () => {
	it('shows this component\'s own binding problem and no other', () => {
		// The trigger list below shows every one, which is where the whole
		// picture belongs; a form says what is wrong with the thing it is
		// configuring.
		const from = layout(['Long rest']);
		(from as { components: unknown[] }).components = [
			pool([{ trigger: 'Solstice', action: 'full' }]),
			track([{ trigger: 'Equinox', action: 'full' }]),
		];
		const form = render(pool([{ trigger: 'Solstice', action: 'full' }]), from);
		const shown = Array.from(form.querySelectorAll('.sheetsmith-error')).map(
			(el) => el.textContent ?? '',
		);
		expect(shown).toHaveLength(1);
		expect(shown[0]).toContain('Solstice');
		expect(shown.join(' ')).not.toContain('Equinox');
	});
});

/*
 * A binding that names a column (SPEC §6), which is the half of the form the
 * component conditions.
 *
 * Table is the one registered component declaring `resetColumns`, so it is what
 * the picker is reachable through; Pool and Track stand in for the other side of
 * the branch, where the row must not appear at all.
 */
describe('the column a binding acts on', () => {
	/** A Conditions list: two columns a trigger can act on and two it cannot. */
	function table(reset?: ComponentConfig['reset']): ComponentConfig {
		return {
			id: 'conditions',
			type: 'table',
			label: 'Conditions',
			position: { col: 1, row: 1, width: 4, height: 2 },
			rowHeader: 'Condition',
			columns: [
				{ key: 'Active', type: 'toggle' },
				{ key: 'Uses', type: 'number', max: 3 },
				{ key: 'Qty', type: 'number' },
				{ key: 'Notes' },
			],
			...(reset ? { reset } : {}),
		} as ComponentConfig;
	}

	/** The same list with nothing on it a trigger has a reading for. */
	function wordsOnly(reset?: ComponentConfig['reset']): ComponentConfig {
		return {
			...table(reset),
			columns: [{ key: 'Notes' }],
		} as ComponentConfig;
	}

	const picker = (form: HTMLElement) =>
		control<HTMLSelectElement>(form, 'reset-column-conditions-0');

	const errors = (form: HTMLElement) =>
		Array.from(form.querySelectorAll('.sheetsmith-error')).map(
			(el) => el.textContent ?? '',
		);

	it('is drawn only where the component says a reset may name a part of it', () => {
		const binding: ResetBinding[] = [{ trigger: 'Long rest', action: 'full' }];
		expect(
			has(
				render(table([{ trigger: 'Long rest', column: 'Active', action: 'full' }])),
				'reset-column-conditions-0',
			),
		).toBe(true);
		expect(has(render(pool(binding)), 'reset-column-hit_points-0')).toBe(false);
		expect(has(render(track(binding)), 'reset-column-clock-0')).toBe(false);
		// Record set declares `resetColumns` now, and `resetWhole` beside it, so
		// its picker is drawn even with no field to name: the whole is on offer
		// (`docs/features/record-set-reset-field-targeting.md`).
		const records: ComponentConfig = {
			...pool(binding),
			id: 'features',
			type: 'record-set',
			label: 'Features',
		};
		expect(has(render(records), 'reset-column-features-0')).toBe(true);
	});

	it('offers the columns the component offers, by their own labels', () => {
		// Never by filtering `config.columns` here: which columns are eligible,
		// and what each is called, are the component's answers.
		const form = render(
			table([{ trigger: 'Long rest', column: 'Active', action: 'empty' }]),
		);
		expect(Array.from(picker(form).options).map((o) => o.textContent)).toEqual([
			'Active',
			'Uses',
			'Qty',
		]);
		expect(picker(form).value).toBe('Active');
	});

	it('names each picker for the trigger it belongs to', () => {
		// Obsidian's `Setting` name is a sibling div with nothing wiring it to
		// the control, so a select in one announces its value and no more. With
		// **Acts on** repeating per binding, two pickers would read out two
		// column names with nothing saying which trigger either was for.
		const form = render(
			table([
				{ trigger: 'Long rest', column: 'Active', action: 'empty' },
				{ trigger: 'Short rest', column: 'Uses', action: 'full' },
			]),
		);
		expect(picker(form).getAttribute('aria-label')).toBe('Long rest acts on');
		expect(
			control<HTMLSelectElement>(form, 'reset-column-conditions-1').getAttribute(
				'aria-label',
			),
		).toBe('Short rest acts on');
	});

	it('shows a sentinel for a binding that names none, and says what it costs', () => {
		// A hand-written file, and the failure the option exists to prevent:
		// opening the form must not write the first column into the layout.
		const config = table([{ trigger: 'Long rest', action: 'empty' }]);
		const form = render(config);
		expect(picker(form).value).toBe('::nothing::');
		expect(Array.from(picker(form).options).map((o) => o.textContent)).toContain(
			'Nothing yet',
		);
		// On the picker, not in a box floating between two rows: the same
		// treatment every other inline validation in the pane uses.
		expect(fieldError(form)).toBe(
			'Choose what this trigger acts on, or it resets nothing.',
		);
		expect(picker(form).classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(config.reset?.[0]).not.toHaveProperty('column');
		expect(recorded.persists).toBe(0);
	});

	it('keeps a column that is gone selectable, and names it', () => {
		const config = table([
			{ trigger: 'Long rest', column: 'Fatigue', action: 'empty' },
		]);
		const form = render(config);
		expect(picker(form).value).toBe('Fatigue');
		expect(Array.from(picker(form).options).map((o) => o.textContent)).toContain(
			'Fatigue (missing)',
		);
		// True at the editor's own level of knowledge: `resetColumns` lists the
		// columns a trigger may act on and withholds the rest, so the pane
		// cannot tell a column that is gone from one it is not offered — which
		// is the contract working, not a gap.
		expect(fieldError(form)).toBe(
			'This component does not offer "Fatigue" for a trigger to act on. Choose one it does, or this trigger resets nothing.',
		);
		expect(config.reset?.[0]?.column).toBe('Fatigue');
		expect(recorded.persists).toBe(0);
	});

	it('reports the component\'s own reason where the action is refused', () => {
		// Composed by the component, not here: the editor could not have said
		// that a number column's ceiling is spelled `max`.
		const form = render(
			table([{ trigger: 'Long rest', column: 'Qty', action: 'full' }]),
		);
		// Pinned to the character, not merely to the words: the string is
		// framed as a `ResetResult` error — it continues "Conditions — " on the
		// sheet — and this reader is the one that has no prefix to open it.
		expect(fieldError(form)).toBe(
			'The column "Qty" has no maximum to restore to. Give it one, or set this trigger to empty.',
		);
		// And the same column with a different action draws no line at all, and
		// leaves the control unmarked.
		const fine = render(table([{ trigger: 'Long rest', column: 'Qty', action: 'empty' }]));
		expect(fieldError(fine)).toBe(null);
		expect(picker(fine).classList.contains('sheetsmith-input-invalid')).toBe(false);
	});

	it('writes an accepted column', () => {
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', column: 'Active', action: 'empty' },
		];
		const form = render(table(reset));
		choose(picker(form), 'Uses');
		expect(reset[0]?.column).toBe('Uses');
		expect(recorded.persists).toBe(1);
	});

	it('refuses a column another binding already holds for that trigger, and snaps back', () => {
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', column: 'Active', action: 'empty' },
			{ trigger: 'Long rest', column: 'Uses', action: 'full' },
		];
		const form = render(table(reset));
		choose(control<HTMLSelectElement>(form, 'reset-column-conditions-1'), 'Active');
		expect(fieldError(form)).toBe(
			'This component already resets "Active" on Long rest.',
		);
		expect(control<HTMLSelectElement>(form, 'reset-column-conditions-1').value).toBe(
			'Uses',
		);
		expect(reset[1]?.column).toBe('Uses');
		expect(recorded.persists).toBe(0);
	});

	it('lets one trigger reach two columns', () => {
		// The pair is what the parser refuses, so rebinding the second binding's
		// trigger onto the first's is accepted while their columns differ.
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', column: 'Active', action: 'empty' },
			{ trigger: 'Short rest', column: 'Uses', action: 'full' },
		];
		const form = render(table(reset));
		choose(control<HTMLSelectElement>(form, 'reset-trigger-conditions-1'), 'Long rest');
		expect(reset[1]?.trigger).toBe('Long rest');
		expect(recorded.persists).toBe(1);
	});

	it('offers a trigger again while a column is still unbound for it', () => {
		// The old rule dropped a trigger the component answered to at all, which
		// would put the second column out of reach.
		const config = table([
			{ trigger: 'Long rest', column: 'Active', action: 'empty' },
		]);
		const form = render(config);
		expect(button(form, 'Add reset').hasAttribute('disabled')).toBe(false);
		button(form, 'Add reset').click();
		expect(config.reset).toEqual([
			{ trigger: 'Long rest', column: 'Active', action: 'empty' },
			// The first trigger still free, and the first column still free on
			// it — a starting point that cannot be the pair the parser refuses.
			{ trigger: 'Long rest', column: 'Uses', action: 'full' },
		]);
	});

	it('says so once every column is bound on every trigger', () => {
		const bound = ['Long rest', 'Short rest'].flatMap((trigger) =>
			['Active', 'Uses', 'Qty'].map((column) => ({
				trigger,
				column,
				action: 'empty' as const,
			})),
		);
		const form = render(table(bound));
		expect(button(form, 'Add reset').hasAttribute('disabled')).toBe(true);
		expect(button(form, 'Add reset').getAttribute('aria-label')).toBe(
			'This component already resets everything it offers on every trigger.',
		);
	});

	it('draws no row and disables adding where the component offers nothing', () => {
		// Declared the member and answered with nothing: there is nothing for a
		// trigger to act on yet, which is a state to report rather than a form.
		const form = render(wordsOnly());
		expect(has(form, 'reset-column-conditions-0')).toBe(false);
		expect(button(form, 'Add reset').hasAttribute('disabled')).toBe(true);
		expect(button(form, 'Add reset').getAttribute('aria-label')).toBe(
			'There is nothing on this component for a trigger to act on.',
		);
	});

	it('reports a binding left on a component that now offers nothing', () => {
		/*
		 * The state the picker's own guard used to swallow. A Table whose
		 * columns were all retyped to text still holds the binding, and that
		 * binding fails at the press — so the pane saying nothing about it is
		 * the half of the message the spec calls "earlier and better-placed"
		 * going missing. There is no picker to draw, so the line names the fix
		 * that is available: the component, not the binding.
		 */
		const config = wordsOnly([
			{ trigger: 'Long rest', column: 'Active', action: 'empty' },
		]);
		const form = render(config);
		expect(has(form, 'reset-column-conditions-0')).toBe(false);
		expect(errors(form)).toEqual([
			'There is nothing on this component for this trigger to act on, so it resets nothing. Give it a number or toggle to act on, or remove this binding.',
		]);
		// And nothing was written: opening the form is not an edit.
		expect(config.reset?.[0]?.column).toBe('Active');
		expect(recorded.persists).toBe(0);
	});

	it('leaves a component with no columns binding as a whole', () => {
		// Pool's own form, unchanged: no picker, and the trigger dropdown's own
		// refusal in its own words.
		const reset: ResetBinding[] = [
			{ trigger: 'Long rest', action: 'full' },
			{ trigger: 'Short rest', action: 'empty' },
		];
		const form = render(pool(reset));
		choose(control<HTMLSelectElement>(form, 'reset-trigger-hit_points-1'), 'Long rest');
		expect(fieldError(form)).toBe('This component already resets on that trigger.');
	});
});

/*
 * **Only where** (`docs/features/record-set-reset-scope.md`): which records a
 * binding reaches, drawn where the component declares it can check one.
 */
describe('the condition a binding reaches through', () => {
	function features(reset?: ComponentConfig['reset']): ComponentConfig {
		return {
			id: 'rest_features',
			type: 'record-set',
			label: 'Rest features',
			position: { col: 1, row: 1, width: 6, height: 3 },
			fields: [
				{ key: 'Recharges', type: 'level', levels: ['None', 'Short rest'] },
				{ key: 'Uses', type: 'number' },
			],
			...(reset ? { reset } : {}),
		} as ComponentConfig;
	}

	function table(reset?: ComponentConfig['reset']): ComponentConfig {
		return {
			id: 'charges',
			type: 'table',
			label: 'Charges',
			position: { col: 1, row: 1, width: 4, height: 2 },
			rowHeader: 'Item',
			columns: [{ key: 'Used', type: 'toggle' }],
			...(reset ? { reset } : {}),
		} as ComponentConfig;
	}

	const where = (form: HTMLElement, id: string) =>
		control<HTMLInputElement>(form, `reset-where-${id}-0`);

	it('is drawn for a Record set binding, and for no Pool, Track or Table binding without the key', () => {
		expect(has(render(features([{ trigger: 'Short rest', action: 'full' }])), 'reset-where-rest_features-0')).toBe(true);
		expect(has(render(pool([{ trigger: 'Short rest', action: 'full' }])), 'reset-where-hit_points-0')).toBe(false);
		expect(has(render(track([{ trigger: 'Short rest', action: 'full' }])), 'reset-where-clock-0')).toBe(false);
		expect(
			has(
				render(table([{ trigger: 'Short rest', column: 'Used', action: 'empty' }])),
				'reset-where-charges-0',
			),
		).toBe(false);
	});

	it('sits after the binding line and before Resets to, named for its trigger', () => {
		const form = render(
			features([{ trigger: 'Short rest', action: 'formula', to: '1', where: 'Recharges == 1' }]),
		);
		const input = where(form, 'rest_features');
		expect(input.value).toBe('Recharges == 1');
		expect(input.placeholder).toBe('All of it');
		expect(input.getAttribute('aria-label')).toBe('Short rest only where');
		const order = Array.from(
			form.querySelectorAll<HTMLElement>('[data-sheetsmith-focus]'),
		).map((el) => el.dataset.sheetsmithFocus);
		expect(order.indexOf('reset-where-rest_features-0')).toBeLessThan(
			order.indexOf('reset-to-rest_features-0'),
		);
		expect(order.indexOf('reset-where-rest_features-0')).toBeGreaterThan(
			order.indexOf('reset-action-rest_features-0'),
		);
	});

	it('writes a typed condition, trimmed, and deletes the key when blanked', () => {
		const reset: ResetBinding[] = [{ trigger: 'Short rest', action: 'full' }];
		const form = render(features(reset));
		commit(where(form, 'rest_features'), '  Recharges == 1  ');
		expect(reset[0]).toEqual({ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' });
		expect(recorded.persists).toBe(1);
		commit(where(form, 'rest_features'), '   ');
		expect(reset[0]).toEqual({ trigger: 'Short rest', action: 'full' });
		expect('where' in (reset[0] ?? {})).toBe(false);
		expect(recorded.persists).toBe(2);
	});

	it("marks a condition that will not parse with the parser's sentence, on render and on commit, and stores it anyway", () => {
		const reset: ResetBinding[] = [
			{ trigger: 'Short rest', action: 'full', where: 'Recharges ==' },
		];
		const form = render(features(reset));
		expect(fieldError(form)).toBe('Expected a value in formula.');
		commit(where(form, 'rest_features'), 'Recharges == 1');
		expect(fieldError(form)).toBe(null);
		commit(where(form, 'rest_features'), 'Recharges >');
		expect(reset[0]?.where).toBe('Recharges >');
		expect(fieldError(form)).toBe('Expected a value in formula.');
		expect(context.errors.get('reset-where-rest_features-0')).toBe(
			'Expected a value in formula.',
		);
	});

	it('says nothing about a name it cannot see, which is the confirmation\'s to report', () => {
		expect(
			fieldError(render(features([{ trigger: 'Short rest', action: 'full', where: 'Recharge == 1' }]))),
		).toBe(null);
	});

	it('binds the suggester with the component as owner, and Resets to without one', () => {
		const bound: [string | undefined, string | undefined][] = [];
		context.suggestNames = (input, owner) => {
			bound.push([input.dataset.sheetsmithFocus, owner]);
		};
		render(features([{ trigger: 'Short rest', action: 'formula', to: '1' }]));
		expect(bound).toEqual([
			['reset-where-rest_features-0', 'rest_features'],
			['reset-to-rest_features-0', undefined],
		]);
	});

	it('draws a hand-written condition on a Pool with the reason it holds the trigger back', () => {
		const reset: ResetBinding[] = [
			{ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' },
		];
		const form = render(pool(reset));
		expect(where(form, 'hit_points').value).toBe('Recharges == 1');
		expect(fieldError(form)).toBe(
			'This component resets as a whole and cannot check a condition, so this trigger leaves it as it is. Clear this to reset all of it.',
		);
		// Opening the form writes nothing.
		expect(recorded).toEqual({ persists: 0, redraws: 0 });
		commit(where(form, 'hit_points'), '');
		expect(reset[0]).toEqual({ trigger: 'Short rest', action: 'full' });
		expect(fieldError(form)).toBe(null);
		// And the row goes with the key, which only a redraw can do.
		expect(recorded).toEqual({ persists: 1, redraws: 1 });
	});

	it('draws no error on a Pool whose condition is blank, since blank is absent', () => {
		expect(
			fieldError(render(pool([{ trigger: 'Short rest', action: 'full', where: '' }]))),
		).toBe(null);
	});
});

/*
 * **Acts on** for a Record set (`docs/features/record-set-reset-field-targeting.md`):
 * the fields a binding may name, and **Every field** first, which is what a
 * binding naming none reads as on this component and not on a Table.
 */
describe('the field a Record set binding writes', () => {
	function features(reset?: ComponentConfig['reset']): ComponentConfig {
		return {
			id: 'rest_features',
			type: 'record-set',
			label: 'Rest features',
			position: { col: 1, row: 1, width: 6, height: 3 },
			fields: [
				{ key: 'Recharges', type: 'level', levels: ['None', 'Short rest'] },
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				{ key: 'DC', name: 'Save DC', type: 'number', max: 20 },
				{ key: 'Used', type: 'toggle' },
			],
			...(reset ? { reset } : {}),
		} as ComponentConfig;
	}

	function conditions(reset?: ComponentConfig['reset']): ComponentConfig {
		return {
			id: 'conditions',
			type: 'table',
			label: 'Conditions',
			position: { col: 1, row: 1, width: 4, height: 2 },
			rowHeader: 'Condition',
			columns: [{ key: 'Active', type: 'toggle' }],
			...(reset ? { reset } : {}),
		} as ComponentConfig;
	}

	const picker = (form: HTMLElement, at = 0) =>
		control<HTMLSelectElement>(form, `reset-column-rest_features-${at}`);
	const triggerOf = (form: HTMLElement, at: number) =>
		control<HTMLSelectElement>(form, `reset-trigger-rest_features-${at}`);
	/** The inline message under one control, or null. */
	const errorUnder = (el: HTMLElement): string | null =>
		el.parentElement?.querySelector('.sheetsmith-field-error')?.textContent ?? null;

	it('offers Every field, then the fields it can restore, by their labels', () => {
		const form = render(features([{ trigger: 'Short rest', column: 'Uses', action: 'full' }]));
		expect(Array.from(picker(form).options).map((o) => o.textContent)).toEqual([
			'Every field',
			'Uses',
			'Save DC',
			'Used',
		]);
		expect(picker(form).value).toBe('Uses');
		expect(fieldError(form)).toBe(null);
	});

	it('selects Every field for a binding naming none, with no error, and writes nothing', () => {
		const config = features([{ trigger: 'Short rest', action: 'full' }]);
		const form = render(config);
		expect(picker(form).selectedOptions[0]?.textContent).toBe('Every field');
		expect(fieldError(form)).toBe(null);
		expect(config.reset?.[0]).not.toHaveProperty('column');
		expect(recorded.persists).toBe(0);
	});

	it('writes a chosen field, and deletes the key for Every field', () => {
		const reset: ResetBinding[] = [{ trigger: 'Short rest', action: 'full' }];
		const form = render(features(reset));
		choose(picker(form), 'Uses');
		expect(reset[0]?.column).toBe('Uses');
		const again = render(features(reset));
		choose(picker(again), '::whole::');
		expect(reset[0]).toEqual({ trigger: 'Short rest', action: 'full' });
		expect(recorded.persists).toBe(2);
	});

	it('says what the row acts on in words that name no kind of part, on both components', () => {
		const descOf = (form: HTMLElement, token: string) =>
			control<HTMLElement>(form, token)
				.closest('.setting-item')
				?.querySelector('.setting-item-description')?.textContent ?? '';
		const record = render(features([{ trigger: 'Short rest', column: 'Uses', action: 'full' }]));
		const table = render(conditions([{ trigger: 'Long rest', column: 'Active', action: 'full' }]));
		for (const said of [
			descOf(record, 'reset-column-rest_features-0'),
			descOf(table, 'reset-column-conditions-0'),
		]) {
			expect(said).toBe('What this trigger acts on. Everything else is left exactly as it is.');
		}
		// And every sentence the row can say, on either component.
		const said = [
			fieldError(render(features([{ trigger: 'Short rest', column: 'Gone', action: 'full' }]))),
			fieldError(render(conditions([{ trigger: 'Long rest', column: 'Gone', action: 'full' }]))),
			fieldError(render(conditions([{ trigger: 'Long rest', action: 'full' }]))),
		];
		for (const line of said) {
			expect(line).not.toBeNull();
			expect(line?.toLowerCase()).not.toContain('column');
		}
		expect(said[0]).toBe(
			'This component does not offer "Gone" for a trigger to act on. Choose one it does, or this trigger resets nothing.',
		);
	});

	it('still asks a Table binding naming no column for one', () => {
		const form = render(conditions([{ trigger: 'Long rest', action: 'full' }]));
		const select = control<HTMLSelectElement>(form, 'reset-column-conditions-0');
		expect(select.value).toBe('::nothing::');
		expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
			'Active',
			'Nothing yet',
		]);
		expect(fieldError(form)).toBe('Choose what this trigger acts on, or it resets nothing.');
	});

	describe('refusing two bindings that would write one field', () => {
		it('refuses a field another binding on the trigger names, and snaps back', () => {
			const reset: ResetBinding[] = [
				{ trigger: 'Short rest', column: 'Uses', action: 'full' },
				{ trigger: 'Short rest', column: 'Used', action: 'empty' },
			];
			const form = render(features(reset));
			choose(picker(form, 1), 'Uses');
			expect(errorUnder(picker(form, 1))).toBe(
				'This component already resets "Uses" on Short rest.',
			);
			expect(picker(form, 1).value).toBe('Used');
			expect(reset[1]?.column).toBe('Used');
			expect(recorded.persists).toBe(0);
		});

		it('refuses Every field beside a field, and snaps back', () => {
			const reset: ResetBinding[] = [
				{ trigger: 'Short rest', column: 'Uses', action: 'full' },
				{ trigger: 'Short rest', column: 'Used', action: 'empty' },
			];
			const form = render(features(reset));
			choose(picker(form, 1), '::whole::');
			expect(errorUnder(picker(form, 1))).toBe(
				'Another reset on Short rest names "Uses", which Every field includes.',
			);
			expect(picker(form, 1).value).toBe('Used');
			expect(reset[1]?.column).toBe('Used');
			expect(recorded.persists).toBe(0);
		});

		it('refuses a field beside Every field, through either control', () => {
			const reset: ResetBinding[] = [
				{ trigger: 'Short rest', action: 'full' },
				{ trigger: 'Long rest', column: 'Uses', action: 'full' },
			];
			const form = render(features(reset));
			choose(triggerOf(form, 1), 'Short rest');
			expect(errorUnder(triggerOf(form, 1))).toBe(
				'Another reset on Short rest covers Every field, which includes "Uses".',
			);
			expect(reset[1]?.trigger).toBe('Long rest');
			// And the whole moved onto a trigger a field already holds.
			choose(triggerOf(form, 0), 'Long rest');
			expect(errorUnder(triggerOf(form, 0))).toBe(
				'Another reset on Long rest names "Uses", which Every field includes.',
			);
			expect(reset[0]?.trigger).toBe('Short rest');
			expect(recorded.persists).toBe(0);
		});

		it('lets one trigger reach two fields', () => {
			const reset: ResetBinding[] = [
				{ trigger: 'Short rest', column: 'Uses', action: 'full' },
				{ trigger: 'Long rest', column: 'Used', action: 'empty' },
			];
			const form = render(features(reset));
			choose(triggerOf(form, 1), 'Short rest');
			expect(reset[1]?.trigger).toBe('Short rest');
			expect(recorded.persists).toBe(1);
		});

		it('reports a hand-written pair on both pickers when the form opens, and writes nothing', () => {
			const config = features([
				{ trigger: 'Short rest', action: 'full' },
				{ trigger: 'Short rest', column: 'Uses', action: 'formula', to: 'Uses + 1' },
			]);
			const form = render(config);
			expect(errorUnder(picker(form, 0))).toBe(
				'Another reset on Short rest names "Uses", which Every field includes, so neither applies when it is pressed. Point one of them at something else, or remove one.',
			);
			expect(errorUnder(picker(form, 1))).toBe(
				'Another reset on Short rest covers Every field, which includes "Uses", so neither applies when it is pressed. Point one of them at something else, or remove one.',
			);
			expect(recorded).toEqual({ persists: 0, redraws: 0 });
		});
	});

	describe('Add reset', () => {
		it('gives the first field no binding on the trigger names', () => {
			const config = features([{ trigger: 'Long rest', column: 'Uses', action: 'full' }]);
			const form = render(config);
			button(form, 'Add reset').click();
			expect(config.reset?.[1]).toEqual({ trigger: 'Long rest', column: 'DC', action: 'full' });
		});

		it('offers no trigger Every field holds', () => {
			const config = features([{ trigger: 'Long rest', action: 'empty' }]);
			const form = render(config);
			button(form, 'Add reset').click();
			expect(config.reset?.[1]).toEqual({ trigger: 'Short rest', column: 'Uses', action: 'full' });
		});

		it('is unavailable once Every field holds every trigger', () => {
			const form = render(
				features([
					{ trigger: 'Long rest', action: 'empty' },
					{ trigger: 'Short rest', action: 'full' },
				]),
			);
			expect(button(form, 'Add reset').hasAttribute('disabled')).toBe(true);
			expect(button(form, 'Add reset').getAttribute('aria-label')).toBe(
				'This component already resets everything it offers on every trigger.',
			);
		});

		it('binds as a whole on a list with nothing to name', () => {
			const config: ComponentConfig = {
				...features(),
				fields: [{ key: 'Recharges', type: 'level', levels: ['None', 'Short rest'] }],
			} as ComponentConfig;
			const form = render(config);
			button(form, 'Add reset').click();
			expect(config.reset).toEqual([{ trigger: 'Long rest', action: 'full' }]);
			const drawn = render(config);
			expect(Array.from(picker(drawn).options).map((o) => o.textContent)).toEqual([
				'Every field',
			]);
			expect(fieldError(drawn)).toBe(null);
		});
	});

	describe('Resets to', () => {
		it("works out on each entry where the binding names a field, reading the entry's keys first", () => {
			const bound: [string | undefined, string | undefined][] = [];
			context.suggestNames = (input, owner) => {
				bound.push([input.dataset.sheetsmithFocus, owner]);
			};
			const form = render(
				features([{ trigger: 'Short rest', column: 'Uses', action: 'formula', to: 'Uses + 1' }]),
			);
			expect(bound).toContainEqual(['reset-to-rest_features-0', 'rest_features']);
			const row = control<HTMLElement>(form, 'reset-to-rest_features-0').closest('.setting-item');
			expect(row?.querySelector('.setting-item-description')?.textContent).toBe(
				"Formula giving the value to restore, worked out separately for each entry this trigger reaches, reading that entry's own values first.For example: Uses + 1",
			);
			expect(row?.querySelector('code')?.textContent).toBe('Uses + 1');
		});

		it('is unchanged on a Table binding and on one naming no field', () => {
			const bound: [string | undefined, string | undefined][] = [];
			context.suggestNames = (input, owner) => {
				bound.push([input.dataset.sheetsmithFocus, owner]);
			};
			const table = render(
				conditions([{ trigger: 'Long rest', column: 'Active', action: 'formula', to: '1' }]),
			);
			render(features([{ trigger: 'Short rest', action: 'formula', to: '1' }]));
			expect(bound).toContainEqual(['reset-to-conditions-0', undefined]);
			expect(bound).toContainEqual(['reset-to-rest_features-0', undefined]);
			const row = control<HTMLElement>(table, 'reset-to-conditions-0').closest('.setting-item');
			expect(row?.querySelector('code')?.textContent).toBe('mod(abilities.CON) * level');
		});
	});
});
