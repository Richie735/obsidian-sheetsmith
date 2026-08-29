// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
	commitModifierTypes,
	ModifierTypesField,
	renderModifierTypes,
} from './modifier-types-field';
import { Layout } from '../parse/layout';
import { ModifierDefinition } from '../types';

/*
 * The layout's bonus types (SPEC §5, §7), driven directly.
 *
 * A file of its own on `trigger-list-field.test.ts`'s argument, which is the
 * module this one was copied from: the pane asserts that
 * `.sheetsmith-modifier-types` is on screen and reads the field back through
 * `commitPending`, and neither of those presses what the field is *for*.
 *
 * The problem report is the half that needed this most, and the reason is this
 * feature's own design argument: `parse/modifier-types.ts` holds the
 * dangling-column check because a component's `configError` is handed a config
 * and never the layout, and this field's header calls itself "the *only* place
 * that can have it". `parseModifierTypes` is well tested; deleting the loop that
 * draws its findings left the suite green.
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

function layout(
	modifierTypes?: string[],
	modifiers: ModifierDefinition[] = [],
): Layout {
	return {
		name: 'Sheet',
		columns: 12,
		components: [],
		...(modifierTypes ? { modifierTypes } : {}),
		...(modifiers.length > 0 ? { modifiers } : {}),
	};
}

/** A definition claiming the bonus type given, or none. */
function ring(bonusType?: string): ModifierDefinition {
	return {
		name: 'Ring of Protection',
		target: 'armour_class',
		amount: '1',
		...(bonusType === undefined ? {} : { bonusType }),
	};
}

function render(from: Layout): {
	field: ModifierTypesField;
	container: HTMLElement;
} {
	const container = document.createElement('div');
	document.body.replaceChildren(container);
	return { field: renderModifierTypes(container, from, context), container };
}

/** Type into the textarea and let the field hear it, as a blur would. */
function commit(field: ModifierTypesField, text: string): void {
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
	it('shows one type per line, in declaration order', () => {
		const { field } = render(layout(['item', 'status']));
		expect(field.input.value).toBe('item\nstatus');
	});

	it('drops trailing blank lines and keeps the ones in the middle', () => {
		// A blank in the middle is content, because `parseModifierTypes` reports
		// it, and a line deleted with nothing said is worse than a named mistake.
		const from = layout(['item']);
		const { field } = render(from);
		commit(field, 'item\n\nstatus\n\n\n');
		expect(from.modifierTypes).toEqual(['item', '', 'status']);
	});

	it('trims each name, so a stray space does not make a second type', () => {
		// Two types differing by a space would stack, which is the arithmetic
		// being wrong for a reason nothing on screen shows.
		const from = layout();
		const { field } = render(from);
		commit(field, '  item  ');
		expect(from.modifierTypes).toEqual(['item']);
	});

	it('takes the key away when the last type is deleted', () => {
		// A layout carrying `modifierTypes: []` is a key nobody asked for.
		const from = layout(['item']);
		const { field } = render(from);
		commit(field, '');
		expect('modifierTypes' in from).toBe(false);
	});

	it('reports no change when the text says what the layout already said', () => {
		// The return value gates a write, so answering true for nothing would
		// rewrite the layout file on every pointerdown on the schematic.
		const from = layout(['item', 'status']);
		const { field } = render(from);
		expect(commitModifierTypes(field)).toBe(false);
		expect(recorded.persists).toBe(0);
	});

	it('persists and redraws once the list actually changes', () => {
		// A modifier column's own **Bonus type** select lists these names, so the
		// forms above are stale the moment this changes.
		const { field } = render(layout(['item']));
		commit(field, 'item\nstatus');
		expect(recorded.persists).toBe(1);
		expect(recorded.redraws).toBe(1);
	});

	it('reports nothing for a field whose DOM is gone', () => {
		const { field, container } = render(layout(['item']));
		container.remove();
		expect(commitModifierTypes(field)).toBe(false);
	});
});

describe('what the field says is wrong', () => {
	it('reports a blank name', () => {
		// A column with no type already means untyped, so a blank line would offer
		// a second spelling of "no type" in the select.
		const { field, container } = render(layout(['item']));
		commit(field, 'item\n \nstatus');
		expect(problems(container)).toEqual(['A bonus type needs a name.']);
		expect(field.input.getAttribute('aria-invalid')).toBe('true');
		expect(
			field.input.classList.contains('sheetsmith-input-invalid'),
		).toBe(true);
	});

	it('reports a repeat, and says the good names survived it', () => {
		const { field, container } = render(layout());
		commit(field, 'item\nstatus\nitem');
		expect(problems(container)[0]).toContain('declared more than once');
		expect(count(container)).toBe('2 bonus types defined.');
	});

	it('reports a definition claiming a type the layout does not declare', () => {
		/*
		 * The one message that can only appear here. A component's `configError`
		 * is handed a config and never the layout, so nothing inside Table can
		 * check anything against this list — and a bonus type is a *definition's*
		 * now, which no component can see at all. That is the argument
		 * `parse/modifier-types.ts` is built on, and this holds the rendering of it.
		 */
		const { container } = render(layout(['item'], [ring('circumstance')]));
		const said = problems(container);
		expect(said).toHaveLength(1);
		// The definition's name, in its own span, so the reader knows which one.
		expect(
			container.querySelector('.sheetsmith-field-problem-line')?.textContent,
		).toBe('Ring of Protection');
		expect(said[0]).toContain('circumstance');
		expect(said[0]).toContain('does not declare');
	});

	it('stops reporting the definition once the type is declared', () => {
		// Against the names as typed rather than as last saved, so the report
		// follows the field instead of trailing a commit behind it.
		const { field, container } = render(layout(['item'], [ring('status')]));
		expect(problems(container)).toHaveLength(1);
		commit(field, 'item\nstatus');
		expect(problems(container)).toEqual([]);
		expect(field.input.getAttribute('aria-invalid')).toBe('false');
	});

	it('says nothing at all about a layout that declares none', () => {
		// Which is every layout by default: with no types declared anywhere the
		// feature is plain addition.
		const { container } = render(layout());
		expect(problems(container)).toEqual([]);
		expect(count(container)).toBeNull();
	});

	it('counts one type in the singular', () => {
		const { container } = render(layout(['item']));
		expect(count(container)).toBe('1 bonus type defined.');
	});
});
