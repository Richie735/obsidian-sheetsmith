// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ListContext } from './list-fields';
import { renderPromotedFields } from './promoted-fields-field';
import { renderModifierDefinitions } from './modifier-definitions-field';
import { ModifierTargetSource } from '../formula/modifier-targets';
import { Layout } from '../parse/layout';
import { PromotedField } from '../types';

/*
 * The layout's promoted fields, as a field, driven directly.
 *
 * Its own file under `docs/PATTERNS.md` §10's rule: a module in `editor/` with
 * its own entry point *and* its own reportable output earns one, and this has
 * both. What stays in `layout-editor.test.ts` is what needs the pane — that the
 * Layout panel draws this at all, and that an edit survives a rebuild and
 * reaches the file. What is here is what the field owns on its own: the picker,
 * the two error surfaces, the empty state, the count, and the two rules about
 * what is written to the layout.
 */

interface Recorded {
	persists: number;
	redraws: number;
	confirms: string[];
	focused: string[];
}

let recorded: Recorded;
let list: ListContext;

beforeEach(() => {
	recorded = { persists: 0, redraws: 0, confirms: [], focused: [] };
	list = {
		persist: () => {
			recorded.persists++;
		},
		redraw: () => {
			recorded.redraws++;
		},
		focusAfterRedraw: (token) => {
			recorded.focused.push(token);
		},
		confirm: (message, _cta, onConfirm) => {
			recorded.confirms.push(message);
			onConfirm();
		},
		errors: new Map(),
		drag: { index: null },
	};
});

/**
 * A layout publishing a bare name, two named entries and a run with a ceiling.
 *
 * The sources rather than the components, because that is what the field takes
 * and what every caller already has in hand.
 */
const SOURCES: readonly ModifierTargetSource[] = [
	{
		id: 'armour_class',
		label: 'Armour class',
		values: { self: { value: 15 } },
		formulas: [],
	},
	{
		id: 'abilities',
		label: 'Abilities',
		values: { named: { STR: { value: 8 }, DEX: { value: 16 } } },
		formulas: [],
	},
	{
		id: 'clocks',
		label: 'Clocks',
		values: { named: { heat: { value: 2, left: () => 4 } } },
		formulas: [],
	},
];

/**
 * A layout holding a copy of each row it is handed.
 *
 * Copied rather than referenced: the field writes into the row objects it is
 * given, so a shared literal like `AC` below would be mutated by whichever case
 * committed into it first and every later case would be driving something else.
 */
function layout(promotedFields?: readonly Partial<PromotedField>[]): Layout {
	return {
		name: 'Sheet',
		columns: 12,
		components: [],
		// `Partial`, because that is what is reachable: `parseLayout` checks only
		// that each row is an object, so a hand-edited layout may hold a row with
		// no name, no property, or neither — and the field has to draw each of
		// them.
		...(promotedFields
			? {
					promotedFields: promotedFields.map(
						(row) => ({ ...row }) as PromotedField,
					),
				}
			: {}),
	};
}

function render(from: Layout): HTMLElement {
	const container = document.createElement('div');
	document.body.replaceChildren(container);
	renderPromotedFields(container, from, {
		persist: () => {
			recorded.persists++;
		},
		redraw: () => {
			recorded.redraws++;
		},
		list,
		sources: SOURCES,
	});
	return container;
}

/** Every problem the report holds, message text only. */
function problems(el: HTMLElement): string[] {
	return Array.from(el.querySelectorAll('.sheetsmith-field-problem')).map(
		(one) => one.textContent ?? '',
	);
}

/** The count line, which is the only confirmation a working list gets. */
function count(el: HTMLElement): string | null {
	return (
		el.querySelector('.sheetsmith-field-problems .setting-item-description')
			?.textContent ?? null
	);
}

/** One control by the focus token the pane restores it through. */
function control<T extends HTMLElement = HTMLElement>(
	el: HTMLElement,
	token: string,
): T {
	const found = el.querySelector(`[data-sheetsmith-focus="${token}"]`);
	if (!found) throw new Error(`no control for "${token}"`);
	return found as T;
}

/** The inline message under one field, addressed by its own focus token. */
function fieldError(el: HTMLElement, token: string): string | null {
	return (
		el.querySelector(`.sheetsmith-field-error[data-sheetsmith-for="${token}"]`)
			?.textContent ?? null
	);
}

/** Commit a value into a field the way a blur does. */
function commit(input: HTMLInputElement | HTMLSelectElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event('change'));
}

const AC: PromotedField = { name: 'armour_class', property: 'ac' };

describe('the empty state', () => {
	it('says so, and offers an add control', () => {
		const el = render(layout());
		expect(el.textContent).toContain('No promoted fields yet.');
		expect(
			Array.from(el.querySelectorAll('button')).map((one) => one.textContent),
		).toContain('Add promoted field');
	});

	it('reports nothing and counts nothing', () => {
		// Which is every layout by default: nothing is promoted unless it is
		// listed, and a notice about an absent thing is worse than silence.
		const el = render(layout());
		expect(problems(el)).toEqual([]);
		expect(count(el)).toBeNull();
	});

	it('draws no header row, so there are no labels over nothing', () => {
		expect(render(layout()).querySelector('.sheetsmith-entry-columns')).toBeNull();
	});

	it('does not write the key from a field that was only drawn', () => {
		/*
		 * `parse/layout.ts`'s recorded trap and the `options: []` one again — and
		 * here it is also the off-by-default promise, since the sheet's own pass
		 * is gated on the key being absent. A pane that was merely opened must not
		 * make every character note's render start reading frontmatter.
		 */
		const from = layout();
		render(from);
		expect('promotedFields' in from).toBe(false);
	});

	it('attaches the list on the first add, and focuses the picker', () => {
		const from = layout();
		const el = render(from);
		const add = Array.from(el.querySelectorAll('button')).find(
			(one) => one.textContent === 'Add promoted field',
		);
		add?.dispatchEvent(new Event('click'));
		expect(from.promotedFields).toEqual([{}]);
		expect(recorded.persists).toBe(1);
		// The picker rather than the property: a property typed before a value is
		// chosen is a name for nothing.
		expect(recorded.focused).toEqual(['promoted-field-0-value']);
	});
});

describe('the row’s two controls', () => {
	it('draws a header naming both, and one row per entry', () => {
		const el = render(layout([AC, { name: 'abilities.DEX', property: 'dex' }]));
		expect(
			Array.from(
				el.querySelectorAll('.sheetsmith-entry-columns > span'),
			).map((one) => one.textContent),
		).toEqual(['Value', 'Property', '', '']);
		expect(el.querySelectorAll('.sheetsmith-list-entry')).toHaveLength(2);
	});

	it('has no detail line at all, which is the one thing it does not borrow', () => {
		// Two fields fit the entry row; a detail line would put one control on a
		// line of its own under a header that had reserved a track for it.
		expect(
			render(layout([AC])).querySelector('.sheetsmith-entry-detail'),
		).toBeNull();
	});

	it('offers every published name and every suffix, by label', () => {
		const value = control<HTMLSelectElement>(render(layout([AC])), 'promoted-field-0-value');
		expect(Array.from(value.options).map((one) => one.text)).toEqual([
			'—',
			'Armour class',
			'Armour class · stored',
			'Abilities · STR',
			'Abilities · STR · stored',
			'Abilities · DEX',
			'Abilities · DEX · stored',
			'Clocks · heat',
			'Clocks · heat · stored',
			'Clocks · heat · remaining',
		]);
	});

	it('shows the chosen label and stores the name a formula writes', () => {
		const el = render(layout([{ name: 'clocks.heat.left', property: 'heat' }]));
		const value = control<HTMLSelectElement>(el, 'promoted-field-0-value');
		expect(value.value).toBe('clocks.heat.left');
		expect(value.options[value.selectedIndex]?.text).toBe(
			'Clocks · heat · remaining',
		);
	});

	it('names the property field for what it writes into', () => {
		const el = render(layout([AC]));
		expect(
			control(el, 'promoted-field-0-property').getAttribute('aria-label'),
		).toBe('Frontmatter property');
	});

	it('offers no placeholder that could be mistaken for a default', () => {
		const el = render(layout([AC]));
		expect(
			control<HTMLInputElement>(el, 'promoted-field-0-property').placeholder,
		).toBe('Property');
	});

	it('writes a chosen value and clears the key where the choice is blank', () => {
		const from = layout([AC]);
		const el = render(from);
		commit(control<HTMLSelectElement>(el, 'promoted-field-0-value'), 'abilities.DEX');
		expect(from.promotedFields?.[0]).toEqual({
			name: 'abilities.DEX',
			property: 'ac',
		});

		commit(control<HTMLSelectElement>(render(from), 'promoted-field-0-value'), '');
		expect(from.promotedFields?.[0]).toEqual({ property: 'ac' });
	});

	it('redraws on a value change, because the report is about the names', () => {
		const el = render(layout([AC]));
		commit(control<HTMLSelectElement>(el, 'promoted-field-0-value'), 'abilities.DEX');
		expect(recorded.redraws).toBe(1);
	});
});

describe('a stored value the picker does not offer', () => {
	const STRAY: PromotedField = { name: 'armor_class', property: 'ac' };

	it('carries it as an extra last option rather than snapping to blank', () => {
		// Silently retyping an author's layout would change what every character
		// on it writes into a vault's property namespace.
		const value = control<HTMLSelectElement>(
			render(layout([STRAY])),
			'promoted-field-0-value',
		);
		expect(value.value).toBe('armor_class');
		expect(Array.from(value.options).at(-1)?.text).toBe('armor_class');
	});

	it('leaves the layout holding exactly what it held', () => {
		const from = layout([STRAY]);
		render(from);
		expect(from.promotedFields).toEqual([STRAY]);
	});

	it('names it under the list, where there is room to say why', () => {
		expect(problems(render(layout([STRAY]))).join(' ')).toContain(
			'which this layout publishes no value under',
		);
	});
});

describe('a row the layout already holds and cannot use', () => {
	/**
	 * Every stored fault: the control it belongs to, the **exact** text the field
	 * shows, and a phrase the report must still carry.
	 *
	 * **Exact rather than `toContain`, which is what let two regressions
	 * through.** The field's label used to be cut out of the parser's message at
	 * its first `'. '`, and a containment check cannot see either way that fails:
	 * a 15-word clause where the stop comes at the end of the diagnosis, and the
	 * whole 197-character message where there is no stop at all. A string
	 * contains its own prefix and contains itself.
	 *
	 * The report keeps `toContain`, because it legitimately says more — the
	 * diagnosis and the fix, for a reader who is not standing on the row.
	 */
	const CASES: readonly {
		rows: Partial<PromotedField>[];
		control: 'value' | 'property';
		shown: string;
		reports: string;
	}[] = [
		{
			rows: [{}],
			control: 'value',
			shown: 'A value is required.',
			reports: 'A promoted field needs a value to copy',
		},
		{
			rows: [{ property: 'a:b' }],
			control: 'value',
			shown: 'A value is required.',
			reports: 'A promoted field needs a value to copy',
		},
		{
			rows: [{ name: 'armour_class', property: '' }],
			control: 'property',
			shown: 'A property is required.',
			reports: 'is copied nowhere, because it names no property',
		},
		{
			rows: [{ name: 'armour_class', property: 'a:b' }],
			control: 'property',
			// 39 characters. The clause this replaced was 197: the format rule's
			// own explanation holds no full stop, so the cut found none and
			// returned everything.
			shown: '"a:b" cannot be a frontmatter property.',
			reports: 'because a frontmatter line separates the property from its value',
		},
		{
			rows: [{ name: 'armour_class', property: 'sheet-layout' }],
			control: 'property',
			shown: '"sheet-layout" is this plugin\'s own property.',
			reports: 'would point the note at another layout',
		},
		{
			rows: [AC, { name: 'abilities.DEX', property: 'ac' }],
			control: 'property',
			shown: '"ac" is promoted more than once.',
			reports: 'The second is ignored',
		},
		{
			rows: [{ name: 'armor_class', property: 'ac_old' }],
			control: 'value',
			// The row this whole mark exists for, and the one the old cut printed
			// the report's entire first sentence onto, twice over and 60px apart.
			shown: '"armor_class" is not a value this layout publishes.',
			reports: 'so the property is cleared',
		},
	];

	it('shows exactly one clause on the control the fault belongs to', () => {
		for (const { rows, control, shown } of CASES) {
			const el = render(layout(rows));
			const last = rows.length - 1;
			const other = control === 'value' ? 'property' : 'value';
			expect(fieldError(el, `promoted-field-${last}-${control}`), shown).toBe(
				shown,
			);
			expect(
				fieldError(el, `promoted-field-${last}-${other}`),
				shown,
			).toBeNull();
		}
	});

	it('keeps the whole diagnosis in the report, and does not repeat it inline', () => {
		for (const { rows, shown, reports } of CASES) {
			const el = render(layout(rows));
			expect(problems(el).join(' '), shown).toContain(reports);
			// The half the field does not say is the half that needs room: no
			// report sentence is the field's text.
			expect(problems(el), shown).not.toContain(shown);
		}
	});

	it('marks the row a value fault belongs to, which is the destructive one', () => {
		/*
		 * The row whose report says its property "is cleared" — the plugin
		 * deletes it from every character note that has it — drew identically to
		 * the three working rows beside it, and the only way to tell which row
		 * the red sentence 200px below was about was to match a quoted string.
		 */
		const el = render(layout([AC, { name: 'armor_class', property: 'ac_old' }]));
		expect(fieldError(el, 'promoted-field-1-value')).not.toBeNull();
		expect(fieldError(el, 'promoted-field-0-value')).toBeNull();
	});

	it('aligns a marked row to the top, so its controls keep one baseline', () => {
		/*
		 * A message is a third child of the `.sheetsmith-field` it belongs to, so
		 * that cell grows and the row's `align-items: center` recentres every
		 * other cell against it — measured at 16px, which put the Property input,
		 * the drag handle and the trash below the select they belong to, on the
		 * one row a reader is being sent to.
		 *
		 * Asserted as the class rather than as a measurement, because happy-dom
		 * lays nothing out: the 16px is in the design review's shot, and what a
		 * test can hold is that the row asks for the rule.
		 */
		const el = render(layout([AC, { name: 'armor_class', property: 'ac_old' }]));
		const rows = Array.from(el.querySelectorAll('.sheetsmith-entry-row'));
		expect(rows[1]?.classList.contains('sheetsmith-entry-row-marked')).toBe(true);
		expect(rows[0]?.classList.contains('sheetsmith-entry-row-marked')).toBe(false);
	});

	it('marks the later of two rows claiming one property, never the first', () => {
		// `parsePromotedFields` keeps the first and drops the second, so marking
		// the first as well would put a red field on the row that works and
		// disagree with the report below it.
		const el = render(layout([AC, { name: 'abilities.DEX', property: 'ac' }]));
		expect(fieldError(el, 'promoted-field-0-property')).toBeNull();
		expect(fieldError(el, 'promoted-field-1-property')).not.toBeNull();
	});

	it('marks nothing on a row the list has just added', () => {
		/*
		 * **Add promoted field** appends `{}`, and the fault that row carries
		 * belongs to the Value picker it is about to be pointed at — not to a
		 * Property input nobody has typed in yet. It painted red on arrival.
		 */
		const el = render(layout([{}]));
		expect(fieldError(el, 'promoted-field-0-property')).toBeNull();
	});
});

describe('committing a property', () => {
	it('persists a usable one and redraws', () => {
		const from = layout([{ name: 'armour_class' }]);
		const el = render(from);
		commit(control<HTMLInputElement>(el, 'promoted-field-0-property'), 'ac');
		expect(from.promotedFields?.[0]).toEqual(AC);
		expect(recorded.persists).toBe(1);
		expect(recorded.redraws).toBe(1);
	});

	/** Each refusal, and what the field says it was left as. */
	const REFUSED: readonly { typed: string; says: string }[] = [
		{ typed: 'a:b', says: '"a:b" cannot be a frontmatter property' },
		{
			typed: 'sheet-layout',
			says: '"sheet-layout" is this plugin\'s own property',
		},
		{ typed: '', says: 'A property is required' },
	];

	it('puts the stored value back and says what the field was left as', () => {
		for (const { typed, says } of REFUSED) {
			const from = layout([AC]);
			const el = render(from);
			const input = control<HTMLInputElement>(el, 'promoted-field-0-property');
			commit(input, typed);
			// A field holding text that was refused lies about the file the moment
			// focus moves.
			expect(input.value, typed).toBe('ac');
			expect(from.promotedFields?.[0], typed).toEqual(AC);
			expect(fieldError(el, 'promoted-field-0-property'), typed).toContain(says);
			expect(fieldError(el, 'promoted-field-0-property'), typed).toContain(
				'was left as "ac"',
			);
			expect(recorded.persists, typed).toBe(0);
		}
	});

	it('refuses one another row already promotes, whichever side it is typed on', () => {
		// A commit checks every *other* row, where a render checks only the ones
		// before: typing a property a later row already holds is refused too.
		const from = layout([AC, { name: 'abilities.DEX', property: 'dex' }]);
		const el = render(from);
		const input = control<HTMLInputElement>(el, 'promoted-field-0-property');
		commit(input, 'dex');
		expect(input.value).toBe('ac');
		expect(fieldError(el, 'promoted-field-0-property')).toContain(
			'"dex" is already promoted by another row',
		);
	});

	it('says only the reason where there was nothing to be left as', () => {
		const el = render(layout([{ name: 'armour_class' }]));
		commit(control<HTMLInputElement>(el, 'promoted-field-0-property'), '');
		expect(fieldError(el, 'promoted-field-0-property')).toBe('A property is required.');
	});
});

describe('removing a row', () => {
	it('asks first, naming what removal cannot undo', () => {
		const from = layout([AC]);
		const el = render(from);
		control<HTMLButtonElement>(el, 'promoted-field-ac-remove').dispatchEvent(
			new Event('click'),
		);
		expect(recorded.confirms).toHaveLength(1);
		expect(recorded.confirms[0]).toContain(
			'Nothing is removed from any character note',
		);
		expect(from.promotedFields).toEqual([]);
	});

	it('asks nothing for a row with no property yet', () => {
		// The confirmation belongs on the row that has been written, not on the
		// one just added and still empty.
		const el = render(layout([{ name: 'armour_class' }]));
		control<HTMLButtonElement>(
			el,
			'promoted-field-armour_class-remove',
		).dispatchEvent(new Event('click'));
		expect(recorded.confirms).toEqual([]);
	});
});

describe('the count line', () => {
	it('counts the usable rows, and says nothing where the list is empty', () => {
		expect(count(render(layout([AC])))).toBe('1 value promoted.');
		expect(
			count(render(layout([AC, { name: 'abilities.DEX', property: 'dex' }]))),
		).toBe('2 values promoted.');
		expect(count(render(layout()))).toBeNull();
	});

	it('says "of" where the heading above it counts something else', () => {
		/*
		 * The heading counts the rows and this counts the ones that work, 460px
		 * apart: "4" above "3 values promoted." reads first as a miscount, and
		 * the red sentence between them only explains it if it is read.
		 */
		const el = render(layout([AC, { name: 'nope', property: 'nope' }]));
		expect(count(el)).toBe('1 of 2 values promoted.');
		expect(problems(el)).toHaveLength(1);
	});
});

/*
 * The clipped-value `title` rule, driven through both its consumers.
 *
 * `editor/select-title.ts` is reached only by rendering something the editor
 * drew, so it has no test file of its own (`docs/PATTERNS.md` §10) — and what
 * would go wrong if the two fields each kept a copy is a `<select>` in one of
 * them silently losing the only recovery a clipped value has. So both are driven
 * here, over a chosen option long enough to clip.
 */
describe('the chosen option’s own words, for a select that clips', () => {
	it('carries them in a title on the promoted-field picker', () => {
		const el = render(layout([{ name: 'clocks.heat.left', property: 'heat' }]));
		const value = control<HTMLSelectElement>(el, 'promoted-field-0-value');
		expect(value.title).toBe('Clocks · heat · remaining');
		// Supplementary rather than a name: the field's own `aria-label` stands.
		expect(value.getAttribute('aria-label')).toBe('heat value');
	});

	it('removes the attribute where nothing is chosen', () => {
		const el = render(layout([{ property: 'heat' }]));
		const value = control<HTMLSelectElement>(el, 'promoted-field-0-value');
		// The blank option's own text is `—`, so this is the row that has one.
		expect(value.title).toBe('—');
	});

	it('carries them on the modifier list’s own picker, through one function', () => {
		const container = document.createElement('div');
		document.body.replaceChildren(container);
		renderModifierDefinitions(
			container,
			{
				name: 'Sheet',
				columns: 12,
				components: [],
				modifiers: [
					{
						name: 'Ring',
						target: 'abilities.DEX',
						amount: '1',
					},
				],
			},
			{
				persist: () => undefined,
				redraw: () => undefined,
				list,
				sources: [
					{
						id: 'abilities',
						label: 'Abilities and saving throws',
						values: { named: { DEX: { value: 16 } } },
						formulas: ['value + mod.self'],
					},
				],
			},
		);
		const changes = container.querySelector(
			'[data-sheetsmith-focus="modifier-Ring-0-target"]',
		) as HTMLSelectElement;
		expect(changes.title).toBe('Abilities and saving throws · DEX');
	});
});
