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
 * The two pane cases stay where they are. What they assert is that the editor
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
