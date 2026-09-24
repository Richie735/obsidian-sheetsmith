// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { SHEET_DESTINATION } from './layout-editor';
import { Layout } from '../parse/layout';
import { ComponentConfig } from '../types';
import { listComponentTypes } from '../components';
import {
	Harness,
	tick,
	settle,
	open,
	control,
	has,
	type,
	choose,
	toggle,
	checkbox,
	writes,
	furnished,
} from '../test/layout-editor-pane';

/*
 * The configuration panel (`editor/config-panel.ts`), driven through the pane
 * it is the right-hand region of.
 *
 * A component's form — which edit lands as which key, what is left out, which
 * field is shown and when, what a formula field says about what it holds, and
 * what the panel names and publishes — and the layout's own settings. In the app
 * a form is reached only through a tree row or a schematic block, so each case
 * goes through a real pane (`src/test/layout-editor-pane.ts`) and asserts on the
 * file it wrote.
 *
 * **Moved here from `layout-editor.test.ts` whole**, not one assertion changed.
 * Three cases were added after the panel moved out of `layout-editor.ts` and
 * before they moved here, as coverage the new seam owed — `commitPending` and
 * the errors map are the two members of `ConfigPanelHost` that carry state
 * across a rebuild: `reads the bonus types back without waiting for a change
 * event` and `reads all three fields back, not only the first one that changed`
 * are here; `keeps an inline error on a field the rebuild draws again` is not,
 * because its block is about the editor's rebuild (`layout-editor.test.ts`).
 *
 * Blocks that drive a field module through the panel — a list field, the
 * modifier definitions, the promoted fields, the formula suggestions — stayed
 * with the pane as well: what they assert is that module's, and the panel is
 * only where it is drawn.
 */

let harness: Harness;

/** The subheadings the open component form is divided into. */
function groups(harness: Harness): string[] {
	return Array.from(
		harness.container.querySelectorAll('.sheetsmith-form-group-title'),
	).map((el) => el.textContent ?? '');
}

describe('editing a component', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
	});

	it('renames the label without moving the id', async () => {
		// The id is what formulas reference (SPEC §4.1), so a rename that
		// changed it would break every expression naming this component while
		// looking like a cosmetic edit.
		type(control<HTMLInputElement>(harness, 'label-armour'), 'Defence');
		await settle(harness.pane);

		const component = (await harness.stored()).components[0];
		expect(component?.label).toBe('Defence');
		expect(component?.id).toBe('armour');
	});

	it('writes a config value under the field\'s own key', async () => {
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).toMatchObject({ key: 'AC' });
	});

	it('leaves out a boolean that matches its own default', async () => {
		// `signed` defaults to true. Storing it anyway would make the config
		// carry a key that says nothing, and `visibleWhen` matches effective
		// values precisely so absence can mean the default (PATTERNS §8).
		toggle(checkbox(harness, 'Signed'), true);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).not.toHaveProperty('signed');

		toggle(checkbox(harness, 'Signed'), false);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).toMatchObject({ signed: false });
	});

	it('refuses a label another component already uses, and says so', async () => {
		/*
		 * The label keys a section in a flat note, so two components sharing one
		 * would have two forms writing the same heading. Rejected rather than
		 * disambiguated, because the author is renaming something and the name
		 * they typed is the one thing here they meant.
		 *
		 * **Added after the panel moved out.** The branch was the one validation
		 * site in the form that did not put its message in the errors map — the
		 * argument is optional, so nothing said so — and it had no case at all,
		 * which is why no mutation over the seam could reach it.
		 */
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'label-armour');
		type(input, 'Hit points');
		await settle(harness.pane);

		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(input.parentElement?.textContent).toContain(
			'Another component already uses this label.',
		);
		// The edit is refused, not applied under another name.
		const stored = await harness.stored();
		expect(stored.components[0]?.label).toBe('Armour class');
		expect(stored.components[1]?.label).toBe('Hit points');
	});

	it('keeps that refusal visible when the pane is rebuilt around it', async () => {
		/*
		 * `field-error.ts` states the policy this holds: every message goes
		 * through the errors map, because the pane rebuilds on most changes and
		 * the replay can only put back what the map holds. This is the case that
		 * makes the label field's duplicate branch obey it.
		 *
		 * **What it also pins is a question nobody has asked**, and
		 * `docs/PATTERNS.md` §11 holds it: the rebuild puts the *old, valid* label
		 * back in the field, so the message that survives is standing over text
		 * that no longer earns it. Three cases now assert that it survives. If the
		 * answer is that a refused edit's complaint should go with the text it was
		 * about, all three change together and that is the row's business, not
		 * this case's.
		 */
		// The pool, because a rebuild is what this needs and only a control that
		// may change what the form *offers* asks for one — a select does, and the
		// position fields deliberately do not, since a redraw would take the field
		// the author is typing in down with them.
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);

		type(control<HTMLInputElement>(harness, 'label-hit_points'), 'Armour class');
		choose(
			control<HTMLSelectElement>(harness, 'cfg-hit_points-maxSource'),
			'character',
		);
		await settle(harness.pane);

		const redrawn = control<HTMLInputElement>(harness, 'label-hit_points');
		expect(redrawn.value).toBe('Hit points');
		expect(redrawn.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(redrawn.parentElement?.textContent).toContain(
			'Another component already uses this label.',
		);
	});

	it('never touches the other components', async () => {
		const before = (await harness.stored()).components[1];
		type(control<HTMLInputElement>(harness, 'cfg-armour-key'), 'AC');
		await settle(harness.pane);
		expect((await harness.stored()).components[1]).toEqual(before);
	});
});

/*
 * A formula field says what the parser makes of what it holds
 * (`docs/features/formula-field-errors.md`).
 *
 * Both moments are asserted here because they answer different failures: the
 * render half is what a hand-edited layout file needs, and the commit half is
 * what a blur needs on a panel that persists without redrawing.
 */
describe('a formula field that will not parse', () => {
	/** A card holding an expression a hand edit could have left behind. */
	function broken(): Layout {
		return {
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'armour',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
					derived: 'floor((value - 10) / 2',
					effective: 'value + mod.self',
				},
				{
					id: 'hit_points',
					type: 'pool',
					label: 'Hit points',
					position: { col: 3, row: 1, width: 4, height: 1 },
					reset: [{ trigger: 'Long rest', action: 'formula', to: 'max /' }],
				},
			] as unknown as Layout['components'],
			triggers: ['Long rest'],
		};
	}

	/** The message drawn under one field, or the empty string where there is none. */
	function problem(input: HTMLElement): string {
		return (
			input.parentElement?.querySelector('.sheetsmith-field-error')
				?.textContent ?? ''
		);
	}

	it('says so on the first paint of a stored expression', async () => {
		harness = await open(broken());
		const rewrites = writes(harness);
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(problem(input)).toBe('Expected ")" in formula.');
		// Drawing a form is not an edit: the message came from the model, not
		// from a commit this test provoked.
		expect(rewrites()).toBe(0);
	});

	it('says nothing about the field beside it, which parses', async () => {
		harness = await open(broken());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-effective');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(false);
		expect(problem(input)).toBe('');
	});

	it('stores what was typed and says what is wrong with it', async () => {
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		type(input, '10 + value +');
		await settle(harness.pane);

		expect(problem(input)).toBe('Expected a value in formula.');
		expect(input.value).toBe('10 + value +');
		// The record, not only the DOM: a field that refuses what its own
		// checker refuses is one an author cannot type into, so the commit is
		// unchanged and the text is in the file.
		expect((await harness.stored()).components[0]).toMatchObject({
			derived: '10 + value +',
		});
	});

	it('clears the message when the expression is corrected', async () => {
		harness = await open(broken());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		type(input, 'floor((value - 10) / 2)');
		await settle(harness.pane);

		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(false);
		expect(problem(input)).toBe('');
		expect((await harness.stored()).components[0]).toMatchObject({
			derived: 'floor((value - 10) / 2)',
		});
	});

	it('clears the message when the field is emptied', async () => {
		// Blank is a state the component reads rather than a hole: a Card with
		// no derived formula publishes its stored value.
		harness = await open(broken());
		control(harness, 'edit-armour').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'cfg-armour-derived');
		type(input, '   ');
		await settle(harness.pane);

		expect(problem(input)).toBe('');
		expect((await harness.stored()).components[0]).not.toHaveProperty('derived');
	});

	it('reaches a reset binding too, which was this feature\'s largest cut', async () => {
		/*
		 * `reset.*.to` was reserved for the pass over `reset-field.ts` and
		 * `modifier-definitions-field.ts` so that its required rule and its
		 * parse rule would arrive together
		 * (`docs/features/reset-and-modifier-render-validation.md`). This case
		 * asserted the cut and now asserts that it was taken: the pane is what
		 * proves the two fields say the same thing about the same expression,
		 * since each module's own file drives only its own.
		 */
		harness = await open(broken());
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);

		const input = control<HTMLInputElement>(harness, 'reset-to-hit_points-0');
		expect(input.value).toBe('max /');
		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(problem(input)).toBe('Expected a value in formula.');
	});
});

describe('a field shown only under a condition', () => {
	beforeEach(async () => {
		harness = await open();
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);
	});

	it('is shown while the controlling key is absent and defaults to the match', async () => {
		// `max` is visible when maxSource is 'calculated', which is the first
		// option and therefore omitted from the config. The condition has to be
		// met by the absence, or a field could only ever be hidden in the
		// ordinary case — the opposite of what a default is for.
		expect((await harness.stored()).components[1]).not.toHaveProperty('maxSource');
		expect(has(harness, 'cfg-hit_points-max')).toBe(true);
	});

	it('is hidden once the controlling key says otherwise', async () => {
		choose(
			control<HTMLSelectElement>(harness, 'cfg-hit_points-maxSource'),
			'character',
		);
		await settle(harness.pane);
		expect(has(harness, 'cfg-hit_points-max')).toBe(false);
	});
});

describe('the reset binding', () => {
	// Asked of the component through `applyReset`, never inferred from its
	// type. The editor knowing that a Pool can be restored and a Card cannot
	// is exactly the coupling the component contract exists to prevent.

	it('is offered to a component that can act on a reset', async () => {
		harness = await open();
		control(harness, 'edit-hit_points').click();
		await settle(harness.pane);
		// The heading carries a count badge, so match its start.
		expect(groups(harness).some((t) => t.startsWith('Resets on'))).toBe(true);
	});

	it('is never offered to one that holds no state', async () => {
		// A binding on a component with nothing to restore is a control that
		// does nothing, which is worse than a missing one: it tells the layout
		// author they have configured something.
		harness = await open();
		control(harness, 'edit-armour').click();
		await settle(harness.pane);
		expect(groups(harness).some((t) => t.startsWith('Resets on'))).toBe(false);
	});
});

/*
 * The convention every control on this tab follows, held over the whole catalog
 * rather than one component at a time.
 *
 * `settings.ts` restores focus across a redraw by reading
 * `data-sheetsmith-focus` off whatever was focused, so a control without one is
 * a control focus falls off — and the boolean fields were exactly that for as
 * long as no boolean redrew the tab. Found by hand, on one field, after the
 * redraw arrived. It is mechanically checkable, so it is checked.
 */
describe('every control in a component form is addressable', () => {
	/** One component of every registered type, so a new one is covered on arrival. */
	function everyType(): Layout {
		return {
			name: 'Catalog',
			columns: 12,
			components: listComponentTypes().map((type, index) => ({
				id: `c${index}`,
				type,
				label: `C${index}`,
				position: { col: 1, row: index + 1, width: 2, height: 1 },
			})),
			triggers: ['Long rest'],
		};
	}

	it.each(listComponentTypes().map((type, index) => [type, index] as const))(
		'gives every field of a "%s" form a focus token',
		async (_type, index) => {
			harness = await open(everyType());
			control(harness, `edit-c${index}`).click();
			await settle(harness.pane);

			const form = harness.container.querySelector('.sheetsmith-component-form');
			expect(form).not.toBeNull();
			const fields = Array.from(
				(form as HTMLElement).querySelectorAll('input, select, textarea'),
			);
			// A form the query stopped finding would pass by iterating nothing.
			expect(fields.length).toBeGreaterThan(3);

			const bare = fields.filter((el) => {
				const host = el as HTMLElement;
				// On the control, or on the wrapper that actually takes focus.
				// Obsidian's toggle is a focusable `.checkbox-container` div around
				// an invisible checkbox, and the stub makes the input itself that
				// element — so requiring it on the input would describe the stub
				// rather than the app, and pass while the app kept losing focus.
				return (
					host.dataset.sheetsmithFocus === undefined &&
					host.parentElement?.dataset.sheetsmithFocus === undefined
				);
			});
			expect(
				bare.map(
					(el) =>
						`${el.tagName} ${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? ''}`,
				),
			).toEqual([]);
		},
	);
});

describe("the layout's own settings", () => {
	beforeEach(async () => {
		harness = await open(furnished());
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
	});

	it('draws the grid, the library, the triggers and the bonus types together', () => {
		// The function library's own header asked for this: below the component
		// forms, "the definitions are a scroll away from the formulas calling
		// them, which is a side panel's job to fix". The bonus types sit beside
		// the library because they are the same category — the layout's own
		// vocabulary, shared by every component using it (SPEC §5).
		expect(has(harness, 'layout-columns')).toBe(true);
		expect(
			harness.container.querySelector('.sheetsmith-function-library'),
		).not.toBeNull();
		expect(
			harness.container.querySelector('.sheetsmith-trigger-list'),
		).not.toBeNull();
		expect(
			harness.container.querySelector('.sheetsmith-modifier-types'),
		).not.toBeNull();
	});

	it('reads the bonus types back without waiting for a change event', async () => {
		// The third field on this panel, and `commitPending` has to read all
		// three: `||` over the commits would short-circuit past the later ones
		// whenever an earlier one changed, which is how a list gets lost.
		const types = control<HTMLTextAreaElement>(harness, 'modifier-types');
		types.value = 'item\nstatus';
		await settle(harness.pane);
		expect((await harness.stored()).modifierTypes).toEqual(['item', 'status']);
	});

	it('reads all three fields back, not only the first one that changed', async () => {
		const triggers = control<HTMLTextAreaElement>(harness, 'trigger-list');
		const library = control<HTMLTextAreaElement>(harness, 'function-library');
		const types = control<HTMLTextAreaElement>(harness, 'modifier-types');
		triggers.value = 'Long rest\nShort rest';
		library.value = 'double(n) = n * 2';
		types.value = 'item';
		await settle(harness.pane);

		const stored = await harness.stored();
		expect(stored.triggers).toEqual(['Long rest', 'Short rest']);
		expect(stored.functions).toEqual(['double(n) = n * 2']);
		expect(stored.modifierTypes).toEqual(['item']);
	});

	it('leaves the key absent where the list is cleared', async () => {
		// An absent key stays absent, so a layout that never wanted bonus types
		// does not grow one on first save.
		const types = control<HTMLTextAreaElement>(harness, 'modifier-types');
		types.value = 'item';
		await settle(harness.pane);
		types.value = '';
		types.dispatchEvent(new Event('change'));
		await settle(harness.pane);
		expect('modifierTypes' in (await harness.stored())).toBe(false);
	});

});

describe('a Record set with its field names shown', () => {
	/** One list, with the strip off. */
	function listed(): Layout {
		return {
			name: 'Listed sheet',
			components: [
				{
					id: 'traits',
					type: 'record-set',
					label: 'Traits',
					position: { col: 1, row: 1, width: 7, height: 3 },
					fields: [{ key: 'Uses', type: 'number' }],
				} as unknown as ComponentConfig,
			],
			triggers: [],
		};
	}

	it('offers the setting in Appearance, and writes it only while it is on', async () => {
		const harness = await open(listed());
		control(harness, 'edit-traits').click();
		await settle(harness.pane);

		// Offered beside **Hide the heading**, the other Appearance toggle.
		const name = 'Field names over the list';
		expect(checkbox(harness, name).checked).toBe(false);
		expect(checkbox(harness, 'Hide the heading')).toBeTruthy();

		toggle(checkbox(harness, name), true);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).toMatchObject({
			fieldHeadings: true,
		});

		// Back to the default: the key goes rather than saying `false`, so an
		// author turning it off leaves a layout the way it was before they turned it on.
		toggle(checkbox(harness, name), false);
		await settle(harness.pane);
		expect((await harness.stored()).components[0]).not.toHaveProperty(
			'fieldHeadings',
		);
	});
});

describe('a layout that omits its column count', () => {
	/** No `columns` key at all, which is a layout the parser accepts. */
	function bare(): Layout {
		return {
			name: 'Bare sheet',
			components: [
				{
					id: 'armour',
					type: 'card',
					label: 'Armour class',
					position: { col: 1, row: 1, width: 2, height: 1 },
				},
			],
			triggers: [],
		};
	}

	beforeEach(async () => {
		harness = await open(bare());
		control(harness, `edit-${SHEET_DESTINATION}`).click();
		await settle(harness.pane);
	});

	it('still omits it after the field has been shown and set back to the default', async () => {
		// The `options: []` and `children: []` trap a third time. An absent
		// `columns` has to stay absent through a round trip, so a value matching
		// the default deletes the key rather than writing `"columns": 12`.
		expect(control<HTMLInputElement>(harness, 'layout-columns').value).toBe(
			'12',
		);
		type(control<HTMLInputElement>(harness, 'layout-columns'), '12');
		await settle(harness.pane);
		expect(Object.keys(await harness.stored())).not.toContain('columns');
	});

	it('shows an inline error for a count below one, rather than persisting it', async () => {
		// `parseLayout` refuses anything that is not a positive integer, so
		// letting this through would have `persist` refuse the whole file with a
		// notice and drop the edit — an error about the layout, on a keystroke.
		const input = control<HTMLInputElement>(harness, 'layout-columns');
		type(input, '0');
		await settle(harness.pane);

		expect(input.classList.contains('sheetsmith-input-invalid')).toBe(true);
		expect(Object.keys(await harness.stored())).not.toContain('columns');
	});
});

describe('the panel says what it is configuring', () => {
	/*
	 * The one thing tying the two columns together when the tree has scrolled
	 * away. A form under its own row needed no title; a panel beside a tree does,
	 * and without it the identity of what is being edited lives in the contents
	 * of a text field.
	 */
	it('heads a component form with the component, not only the label field', async () => {
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);

		const panel = harness.container.querySelector(
			'.sheetsmith-editor-panel',
		) as HTMLElement;
		const heading = panel.querySelector('.setting-item-heading');
		expect(heading?.textContent).toBe('Defences');
		// Above the reference line and the fields, which is what makes it a title
		// rather than another row.
		expect(panel.querySelector('.sheetsmith-component-form')?.firstElementChild)
			.toBe(heading);
	});

	it('heads the layout\'s own settings too', async () => {
		harness = await open(furnished());
		const panel = harness.container.querySelector(
			'.sheetsmith-editor-panel',
		) as HTMLElement;
		expect(panel.querySelector('.setting-item-heading')?.textContent).toBe(
			'Layout',
		);
	});

	it('follows a rename, so the title is never the old name', async () => {
		harness = await open(furnished());
		control(harness, 'edit-defences').click();
		await settle(harness.pane);
		type(control<HTMLInputElement>(harness, 'label-defences'), 'Saves');
		await settle(harness.pane);

		expect(
			harness.container
				.querySelector('.sheetsmith-editor-panel')
				?.querySelector('.setting-item-heading')?.textContent,
		).toBe('Saves');
	});
});

describe('the panel says what a component publishes', () => {
	it('lists every name as a chip rather than the bare id', async () => {
		const harness = await open({
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'abilities',
					type: 'card-set',
					label: 'Abilities',
					entries: [
						{ key: 'STR', name: 'Strength' },
						{ key: 'DEX', name: 'Dexterity' },
					],
					position: { col: 1, row: 1, width: 4, height: 1 },
				} as unknown as ComponentConfig,
			],
			functions: [],
			triggers: [],
		});
		control(harness, 'edit-abilities').click();
		await tick();
		const chips = Array.from(
			harness.container.querySelectorAll('.sheetsmith-published-name code'),
		).map((code) => code.textContent);
		expect(chips).toEqual([
			'abilities.STR',
			'.value',
			'mod.',
			'abilities.DEX',
			'.value',
			'mod.',
		]);
	});

	it('teaches no name as a placeholder pattern anywhere in the pane', async () => {
		/*
		 * The copy budget this feature relieves (`SPEC` §13): the panel used to
		 * spell the grammar as `"<component id>.<column key>"` under the list
		 * where a key is typed, leaving the reader to substitute two placeholders
		 * to get a string they could have copied. The inventory shows the real
		 * names, so the pattern goes.
		 */
		const harness = await open({
			name: 'Test sheet',
			columns: 12,
			components: [
				{
					id: 'inventory',
					type: 'table',
					label: 'Inventory',
					rows: [{ label: 'Sword', key: 'sword' }],
					columns: [
						{ key: 'Weight', type: 'number', total: true },
						{ key: 'Worn', type: 'toggle', publish: true },
					],
					position: { col: 1, row: 1, width: 6, height: 2 },
				} as unknown as ComponentConfig,
			],
			functions: [],
			triggers: [],
		});
		control(harness, 'edit-inventory').click();
		await tick();
		const text = harness.container.textContent ?? '';
		expect(text).not.toContain('"<component id>.');
		// The pattern in *either* spelling now, since the two clauses the guard
		// above cannot see were the last places it appeared as UI copy.
		expect(text).not.toContain('<component id>');
		expect(text).toContain(
			'A total is a name formulas read, so a totalled column\'s key is letters, digits and underscores, where a column without a total may be headed anything.',
		);
		expect(text).toContain(
			'A published column gives every row below a name of its own, so a formula elsewhere on the sheet can read that row.',
		);
		/*
		 * The third and fourth trims, and the two the `not.toContain` guard above
		 * cannot catch: each removed a `sum(<component id>, <expression>)` clause,
		 * which carries neither the leading quote nor the trailing dot that guard
		 * matches on. Only reading the sentences proves they went.
		 */
		expect(text).toContain(
			"A column's total sums what the note stores; a formula elsewhere can sum any expression over the rows instead.",
		);
		expect(text).toContain(
			'total a column, or aggregate over the rows instead.',
		);
	});
});
