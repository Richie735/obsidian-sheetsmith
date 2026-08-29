// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ListContext } from './list-fields';
import { renderModifierDefinitions } from './modifier-definitions-field';
import { ModifierTargetSource } from '../formula/modifier-targets';
import { Layout } from '../parse/layout';
import { ModifierDefinition } from '../types';

/*
 * The layout's modifier definitions, as a field, driven directly.
 *
 * **Its own file because `docs/PATTERNS.md` §11 settled the rule this pass would
 * otherwise have guessed at for a third time**: a module in `editor/` with its own
 * entry point *and* its own reportable output earns a test file, and the five
 * fixtures reached only by pressing something the editor drew do not. This one has
 * both — `renderModifierDefinitions`, and a problems report under the list — so it
 * gets one, on `modifier-types-field.test.ts`'s terms.
 *
 * What stays in `layout-editor.test.ts` is what needs the pane: that the Layout
 * panel draws this at all, that the target picker reflects a real layout's
 * accepting set, and that an edit survives a rebuild and reaches the file. What is
 * here is what the field owns on its own — the report, the count, the empty state,
 * the operator taking the bonus type away, and the two rules about what is written
 * to the layout.
 */

interface Recorded {
	persists: number;
	redraws: number;
	confirms: string[];
}

let recorded: Recorded;
let list: ListContext;

beforeEach(() => {
	recorded = { persists: 0, redraws: 0, confirms: [] };
	list = {
		persist: () => {
			recorded.persists++;
		},
		redraw: () => {
			recorded.redraws++;
		},
		focusAfterRedraw: () => undefined,
		confirm: (message, _cta, onConfirm) => {
			recorded.confirms.push(message);
			onConfirm();
		},
		errors: new Map(),
		drag: { index: null },
	};
});

/**
 * A layout publishing `armour_class`, which reads a modifier, and
 * `passive_perception`, which does not.
 *
 * The sources rather than the components, because that is what the field takes and
 * what every caller already has in hand: whether a name is published, and whether
 * its own formula reads a slot, is a question about the registry that a pure
 * module may not reach.
 */
const SOURCES: readonly ModifierTargetSource[] = [
	{
		id: 'armour_class',
		label: 'Armour class',
		values: { self: {} },
		formulas: ['10 + abilities.DEX + mod.self'],
	},
	{
		id: 'passive_perception',
		label: 'Passive perception',
		values: { self: {} },
		formulas: ['10 + abilities.WIS'],
	},
];

function layout(modifiers?: ModifierDefinition[]): Layout {
	return {
		name: 'Sheet',
		columns: 12,
		components: [],
		modifierTypes: ['item', 'status'],
		...(modifiers ? { modifiers } : {}),
	};
}

function render(from: Layout): HTMLElement {
	const container = document.createElement('div');
	document.body.replaceChildren(container);
	renderModifierDefinitions(container, from, {
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

const RING: ModifierDefinition = {
	name: 'Ring of Protection',
	target: 'armour_class',
	amount: '1',
	bonusType: 'item',
};

describe('the empty state', () => {
	it('says so, and offers an add control', () => {
		const el = render(layout());
		expect(el.textContent).toContain('No modifiers yet.');
		expect(
			Array.from(el.querySelectorAll('button')).map((one) => one.textContent),
		).toContain('Add modifier');
	});

	it('reports nothing and counts nothing', () => {
		// Which is every layout by default. A sheet full of notices about absent
		// things is worse than a quiet one.
		const el = render(layout());
		expect(problems(el)).toEqual([]);
		expect(count(el)).toBeNull();
	});

	it('does not write the key from a field that was only drawn', () => {
		// `parse/layout.ts`'s recorded trap, and the `options: []` one again: a
		// layout that never wanted definitions must not grow the key from a pane
		// that was merely opened.
		const from = layout();
		render(from);
		expect('modifiers' in from).toBe(false);
	});

	it('attaches the key on the first add, and names the new one for what it is', () => {
		const from = layout();
		const el = render(from);
		const add = Array.from(el.querySelectorAll('button')).find(
			(one) => one.textContent === 'Add modifier',
		);
		add?.click();
		expect(from.modifiers?.map((one) => one.name)).toEqual(['New modifier']);
		expect(recorded.persists).toBe(1);
	});
});

describe('what the list writes to the layout', () => {
	it('leaves the default operator out of the file', () => {
		// The rule every select in this pane follows: a definition that adds reads
		// as one that never said which it was.
		const from = layout([{ ...RING }]);
		const el = render(from);
		const operator = control<HTMLSelectElement>(
			el,
			'modifier-Ring of Protection-operator',
		);
		operator.value = 'override';
		operator.dispatchEvent(new Event('change'));
		expect(from.modifiers?.[0]?.operator).toBe('override');
		operator.value = 'add';
		operator.dispatchEvent(new Event('change'));
		expect(from.modifiers?.[0]).not.toHaveProperty('operator');
	});

	it('deletes a key an empty field clears rather than storing ""', () => {
		const from = layout([{ ...RING, when: 'Worn' }]);
		const el = render(from);
		const when = control<HTMLInputElement>(el, 'modifier-Ring of Protection-when');
		expect(when.value).toBe('Worn');
		when.value = '   ';
		when.dispatchEvent(new Event('change'));
		expect(from.modifiers?.[0]).not.toHaveProperty('when');
	});

	it('refuses a blank name and puts the stored one back', () => {
		// A refusal that left the typed text in the field would make the field lie
		// about what the file holds the moment focus moved on.
		const from = layout([{ ...RING }]);
		const el = render(from);
		const name = control<HTMLInputElement>(el, 'modifier-0-name');
		name.value = '  ';
		name.dispatchEvent(new Event('change'));
		expect(name.value).toBe('Ring of Protection');
		expect(from.modifiers?.[0]?.name).toBe('Ring of Protection');
	});

	it('refuses a duplicate on the trimmed name, which is what the parser dedupes on', () => {
		// A field that accepts what the parser then rejects is the instrument
		// disagreeing with itself: the parser would report the pair as declared
		// twice with no error on the field that had just taken it.
		const from = layout([
			{ ...RING, name: 'Ring ' },
			{ ...RING, name: 'Belt' },
		]);
		const el = render(from);
		const name = control<HTMLInputElement>(el, 'modifier-1-name');
		name.value = 'Ring';
		name.dispatchEvent(new Event('change'));
		expect(name.value).toBe('Belt');
		expect(from.modifiers?.[1]?.name).toBe('Belt');
	});

	it('asks before removing a definition that has been written', () => {
		/*
		 * There is no undo behind any of this — `persist` writes the file on the
		 * spot — and the confirmation names the cost the editor cannot see: every
		 * row on every character that enrolled in this definition goes inert, and no
		 * count of them is reachable from here.
		 */
		const from = layout([{ ...RING }]);
		const el = render(from);
		const remove = control(el, 'modifier-Ring of Protection-remove');
		remove.click();
		expect(recorded.confirms).toHaveLength(1);
		expect(recorded.confirms[0]).toContain('changes nothing');
		expect(from.modifiers).toEqual([]);
	});

	it('asks nothing before removing one that is still empty', () => {
		// The confirmation belongs on the definition carrying an author's own
		// writing, not on the one just added.
		const from = layout([{ name: 'New modifier' } as ModifierDefinition]);
		const el = render(from);
		control(el, 'modifier-New modifier-remove').click();
		expect(recorded.confirms).toEqual([]);
		expect(from.modifiers).toEqual([]);
	});
});

describe('the controls a definition offers', () => {
	it('offers the accepting targets by their labels, and nothing else', () => {
		/*
		 * Foundry's own Active Effects article tells users to press F12 and run a
		 * console script to enumerate attribute keys. This is the answer to that,
		 * and it is the *accepting* set rather than every published name — so
		 * `passive_perception`, which reads no modifier, is not offered.
		 *
		 * By label rather than by name: labels are unique on a layout by
		 * construction, so the name adds nothing a reader can use and cost the
		 * option most of its width to a truncation.
		 */
		const el = render(layout([{ ...RING }]));
		const picker = control<HTMLSelectElement>(
			el,
			'modifier-Ring of Protection-target',
		);
		expect(Array.from(picker.options).map((one) => one.textContent)).toEqual([
			'—',
			'Armour class',
		]);
	});

	it('carries a stored target the picker no longer offers, rather than snapping it', () => {
		// §4.2's rule for a Card's stray option: silently retyping an author's
		// definition would move every sheet on the layout.
		const el = render(layout([{ ...RING, target: 'passive_perception' }]));
		const picker = control<HTMLSelectElement>(
			el,
			'modifier-Ring of Protection-target',
		);
		/*
		 * **Its bare name, with no qualifier.** It read `passive_perception (not
		 * offered)` and a `<select>` this width drew `passive_perception (n…` — the
		 * parenthetical clipped away, and it was the diagnosis. The report under the
		 * list carries that in full and unclipped, so this option carries identity
		 * only.
		 */
		expect(Array.from(picker.options).map((one) => one.textContent)).toContain(
			'passive_perception',
		);
		expect(picker.value).toBe('passive_perception');
		// And the diagnosis is still said, where it has room to be read.
		expect(el.textContent).toContain('reads no modifier');
	});

	it('offers Adds to and Sets, in that order', () => {
		const el = render(layout([{ ...RING }]));
		const operator = control<HTMLSelectElement>(
			el,
			'modifier-Ring of Protection-operator',
		);
		expect(Array.from(operator.options).map((one) => one.textContent)).toEqual([
			'Adds to',
			'Sets',
		]);
	});

	it('offers the bonus type on Adds to and not on Sets', () => {
		// An override is not contested by type, so the control goes rather than
		// standing there meaning nothing — the same call **Publish per row** makes
		// in the columns list.
		const adds = render(layout([{ ...RING }]));
		expect(
			adds.querySelector('[data-sheetsmith-focus="modifier-Ring of Protection-bonus-type"]'),
		).not.toBeNull();
		const sets = render(layout([{ ...RING, operator: 'override' }]));
		expect(
			sets.querySelector('[data-sheetsmith-focus="modifier-Ring of Protection-bonus-type"]'),
		).toBeNull();
		/*
		 * **And the slot it left is reserved rather than empty.** The field is still
		 * built, hidden and out of the accessibility tree, because its width is the
		 * widest bonus type *this layout declares* and a spacer cannot know it — a
		 * bare `.sheetsmith-detail-field` is `flex: 1` where the real field is
		 * `flex: 0 0 auto`, and the 31px difference went back to the line's grow and
		 * moved `Changes`, `Operator` and `Amount` on every Sets row.
		 */
		const reserved = sets.querySelector('.sheetsmith-detail-field-reserved');
		expect(reserved).not.toBeNull();
		expect(reserved?.getAttribute('aria-hidden')).toBe('true');
		expect(reserved?.querySelector('select')).not.toBeNull();
		// And no such slot where the control is real.
		expect(adds.querySelector('.sheetsmith-detail-field-reserved')).toBeNull();
	});

	it('offers the layout\'s own bonus types over an untyped first line', () => {
		const el = render(layout([{ ...RING }]));
		const type = control<HTMLSelectElement>(
			el,
			'modifier-Ring of Protection-bonus-type',
		);
		expect(Array.from(type.options).map((one) => one.textContent)).toEqual([
			'Untyped',
			'item',
			'status',
		]);
	});

	it('carries a stored bonus type the layout no longer declares', () => {
		// It loses no character data — a type the layout does not declare is
		// rendered, not corrected, and the arithmetic contests by the string a
		// modifier carries (feature doc §1's amendment to SPEC §5, which no longer
		// says nothing stored ever names a type) — but silently retyping an author's
		// definition would change the arithmetic on every sheet using the layout.
		const el = render(layout([{ ...RING, bonusType: 'circumstance' }]));
		const type = control<HTMLSelectElement>(
			el,
			'modifier-Ring of Protection-bonus-type',
		);
		expect(Array.from(type.options).map((one) => one.textContent)).toContain(
			'circumstance (not declared)',
		);
		expect(type.value).toBe('circumstance');
	});
});

describe('what the field reports under itself', () => {
	it('says nothing about a usable definition, and counts it', () => {
		const el = render(layout([{ ...RING }]));
		expect(problems(el)).toEqual([]);
		expect(count(el)).toBe('1 modifier defined.');
	});

	it('counts more than one in the plural', () => {
		const el = render(layout([{ ...RING }, { ...RING, name: 'Belt' }]));
		expect(count(el)).toBe('2 modifiers defined.');
	});

	it('names the definition a problem belongs to, in its own locator', () => {
		// So the reader knows which one, the way a component's label locates a
		// dangling reset binding.
		const el = render(layout([{ ...RING, target: 'passive_perception' }]));
		expect(
			el.querySelector('.sheetsmith-field-problem-line')?.textContent,
		).toBe('Ring of Protection');
	});

	it('reports a target that reads no modifier, with the fix in it', () => {
		// dnd5e#3900 caught in the editor, and complete rather than half of it: a
		// target is layout data, so every change on the layout is visible here.
		const said = problems(render(layout([{ ...RING, target: 'passive_perception' }])));
		expect(said).toHaveLength(1);
		expect(said[0]).toContain('reads no modifier');
		expect(said[0]).toContain('+ mod.self');
	});

	it('reports a name holding the separator, and stops counting it', () => {
		/*
		 * The one rule about a *name* the cell format imposes: a cell separates the
		 * modifiers a row applies with a semicolon, so a name holding one is a name
		 * no cell could spell unambiguously. Dropped as well as reported, on the
		 * parser's own argument for a nameless one — and reported here rather than
		 * refused on the field, because refusing inline would leave a hand-edited
		 * layout's own text unreachable while the reader tried to correct it.
		 */
		const el = render(layout([{ ...RING, name: 'Boots; gloves' }, { ...RING }]));
		expect(problems(el)[0]).toContain('cannot be a name');
		expect(problems(el)[0]).toContain('Rename it without one');
		// And it stops being offered anywhere: the count is the usable list's.
		expect(count(el)).toBe('1 modifier defined.');
	});

	it('reports a name declared twice, and still counts the survivor', () => {
		const el = render(layout([{ ...RING }, { ...RING }]));
		expect(problems(el)[0]).toContain('declared more than once');
		expect(count(el)).toBe('1 modifier defined.');
	});

	it('goes on reporting after a bad definition', () => {
		// One typo must not stop the list being read, which is the whole of the
		// shape-refuses / contents-are-reported split.
		const el = render(
			layout([
				{ name: '' } as ModifierDefinition,
				{ ...RING },
				{ ...RING, name: 'Belt', target: 'nowhere' },
			]),
		);
		expect(problems(el)).toHaveLength(2);
		expect(count(el)).toBe('2 modifiers defined.');
	});

	it('reports the field as a status region, so a screen reader is told', () => {
		// Blurring a field is the moment a definition is judged, and a screen
		// reader is looking elsewhere by then. Polite, so it waits for a pause.
		const el = render(layout([{ ...RING }]));
		expect(
			el.querySelector('.sheetsmith-field-problems')?.getAttribute('role'),
		).toBe('status');
	});
});
