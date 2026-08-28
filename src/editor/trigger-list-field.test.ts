// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
	TriggerListField,
	commitTriggerList,
	renderTriggerList,
} from './trigger-list-field';
import { Layout } from '../parse/layout';
import { ComponentConfig } from '../types';

/*
 * The layout's reset triggers (SPEC §6, §7), driven directly.
 *
 * The other half of §6, and it came out of `layout-editor.ts` in the same pass
 * and by the same argument as `reset-field.ts` beside it — so it inherited the
 * same gap: the pane asserts that `.sheetsmith-trigger-list` is on screen, and
 * nothing anywhere drives what the field is *for*. `commitTriggerList` is the
 * piece that matters, because its return value is what gates a write: answer
 * true when nothing changed and every pointerdown on the schematic rewrites the
 * layout file.
 */

let recorded: { persists: number; redraws: number };

beforeEach(() => {
	recorded = { persists: 0, redraws: 0 };
});

const context = {
	persist: () => {
		recorded.persists++;
	},
	redraw: () => {
		recorded.redraws++;
	},
};

function layout(triggers?: string[], components: ComponentConfig[] = []): Layout {
	return {
		name: 'Sheet',
		columns: 12,
		components,
		...(triggers ? { triggers } : {}),
	};
}

function pool(reset?: ComponentConfig['reset']): ComponentConfig {
	return {
		id: 'hit_points',
		type: 'pool',
		label: 'Hit points',
		position: { col: 1, row: 1, width: 2, height: 1 },
		...(reset ? { reset } : {}),
	};
}

function render(from: Layout): {
	field: TriggerListField;
	container: HTMLElement;
} {
	const container = document.createElement('div');
	document.body.replaceChildren(container);
	return { field: renderTriggerList(container, from, context), container };
}

/** Type into the textarea and let the field hear it, as a blur would. */
function commit(field: TriggerListField, text: string): void {
	field.input.value = text;
	field.input.dispatchEvent(new Event('change'));
}

function problems(container: HTMLElement): string[] {
	return Array.from(
		container.querySelectorAll('.sheetsmith-field-problem'),
	).map((el) => el.textContent ?? '');
}

function count(container: HTMLElement): string | null {
	return (
		container.querySelector(
			'.sheetsmith-field-problems .setting-item-description',
		)?.textContent ?? null
	);
}

describe('reading the field back', () => {
	it('shows one trigger per line, in declaration order', () => {
		const { field } = render(layout(['Long rest', 'Short rest']));
		expect(field.input.value).toBe('Long rest\nShort rest');
	});

	it('drops trailing blank lines and keeps the ones in the middle', () => {
		// Trailing blanks are an artefact of typing. A blank in the middle is
		// content, because parseTriggers reports it — and a line deleted with
		// nothing said is worse than a named mistake.
		const from = layout(['Long rest']);
		const { field } = render(from);
		commit(field, 'Long rest\n\nShort rest\n\n\n');
		expect(from.triggers).toEqual(['Long rest', '', 'Short rest']);
	});

	it('trims each name, since the file stores what the button is called', () => {
		const from = layout();
		const { field } = render(from);
		commit(field, '  Long rest  ');
		expect(from.triggers).toEqual(['Long rest']);
	});

	it('takes the key away when the last trigger is deleted', () => {
		// A layout carrying `triggers: []` is a key nobody asked for.
		const from = layout(['Long rest']);
		const { field } = render(from);
		commit(field, '');
		expect(from).not.toHaveProperty('triggers');
		expect(recorded.persists).toBe(1);
	});

	it('reports nothing changed rather than writing the same list again', () => {
		/*
		 * The return value is the whole point of this function. It is called on
		 * every commit path the editor has, including a pointerdown on the
		 * schematic — so answering true for an unchanged list would rewrite the
		 * layout file on every drag of every block.
		 */
		const from = layout(['Long rest']);
		const { field } = render(from);
		expect(commitTriggerList(field)).toBe(false);
		commit(field, 'Long rest\n');
		expect(recorded.persists).toBe(0);
		expect(recorded.redraws).toBe(0);
		commit(field, 'Long rest\nShort rest');
		expect(recorded.persists).toBe(1);
		// A component's reset dropdown lists these names, so the forms above are
		// stale the moment this changes.
		expect(recorded.redraws).toBe(1);
	});

	it('refuses to write through a field whose DOM is gone', () => {
		// A stale field must never write into the layout that replaced it.
		const from = layout(['Long rest']);
		const { field } = render(from);
		field.input.value = 'Solstice';
		field.input.remove();
		expect(commitTriggerList(field)).toBe(false);
		expect(from.triggers).toEqual(['Long rest']);
	});

	it('answers false for no field at all', () => {
		expect(commitTriggerList(null)).toBe(false);
	});
});

describe('what the field says about the list', () => {
	it('confirms how many names are usable, which is the only success signal', () => {
		const { container } = render(layout(['Long rest', 'Short rest']));
		expect(count(container)).toBe('2 triggers defined.');
		expect(problems(container)).toEqual([]);
	});

	it('counts one trigger in the singular', () => {
		expect(count(render(layout(['Long rest'])).container)).toBe(
			'1 trigger defined.',
		);
	});

	it('says nothing at all about a layout with no triggers yet', () => {
		// Neither a problem nor a count: an empty field is the ordinary state a
		// layout starts in, not a mistake to report.
		const { container } = render(layout());
		expect(count(container)).toBe(null);
		expect(problems(container)).toEqual([]);
	});

	it('names a repeat, and keeps counting the ones that work', () => {
		const { container } = render(layout(['Long rest', 'Long rest']));
		expect(problems(container)[0]).toContain('declared more than once');
		// The good names surviving a bad one is the thing that is otherwise
		// impossible to see.
		expect(count(container)).toBe('1 trigger defined.');
	});

	it('marks the field invalid where a name cannot be used', () => {
		const { container, field } = render(layout(['Long rest']));
		expect(field.input.getAttribute('aria-invalid')).toBe('false');
		expect(field.input.classList.contains('sheetsmith-input-invalid')).toBe(false);

		// Interior, not trailing: a trailing blank is stripped before it can be
		// a problem, which is the point of stripping it.
		commit(field, 'Long rest\n\nShort rest');
		expect(problems(container)).toEqual(['A trigger needs a name.']);
		expect(field.input.getAttribute('aria-invalid')).toBe('true');
		expect(field.input.classList.contains('sheetsmith-input-invalid')).toBe(true);
	});

	it('reports the problems of the text as typed, not of the text last saved', () => {
		// So the report follows the field instead of trailing a commit behind
		// it. The name here is refused, so nothing is ever saved for it.
		const from = layout(['Long rest']);
		const { container, field } = render(from);
		field.input.value = 'Long rest\nLong rest';
		field.showProblems(field.input.value.split('\n'));
		expect(problems(container)[0]).toContain('declared more than once');
		expect(from.triggers).toEqual(['Long rest']);
	});

	it('says which component a dangling binding belongs to', () => {
		// This is the one place with the whole picture; a component's own form
		// repeats only the problem that belongs to it.
		const { container } = render(
			layout(['Long rest'], [pool([{ trigger: 'Solstice', action: 'full' }])]),
		);
		const line = container.querySelector('.sheetsmith-field-problem-line');
		expect(line?.textContent).toBe('Hit points');
		expect(problems(container)[0]).toContain('Solstice');
	});

	it('points the field at its own report, so the problem is announced', () => {
		const { field } = render(layout(['Long rest']));
		expect(field.input.getAttribute('aria-describedby')).toBe(
			'sheetsmith-trigger-problems',
		);
		expect(
			document.getElementById('sheetsmith-trigger-problems')?.getAttribute('role'),
		).toBe('status');
	});
});
