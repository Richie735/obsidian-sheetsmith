/*
 * A reset trigger end to end (SPEC §6), through the real parsers, the real
 * registered components, and the real batched write.
 *
 * The layer tests each prove one seam: parseTriggers reads the list,
 * pool.applyReset produces new data, applySectionWrites puts it in the note.
 * This proves they compose into the thing a user actually does — declare a
 * long rest, bind a pool to it, press the button, and find the note changed.
 *
 * It mirrors the wiring in SheetView.applyTrigger, which cannot be tested
 * directly without a workspace around it; if the two ever disagree, this file
 * is the copy that is wrong.
 */

import { describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import { parseFunctions } from '../formula/functions';
import {
	FormulaEnv,
	makeFieldExplainer,
	makeFieldResolver,
} from '../formula/resolve';
import { buildSheetEnv, publishedComponent } from '../formula/sheet';
import { applySectionWrites, getSection, parseCharacter } from '../parse/character';
import { parseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { parseTriggers } from '../parse/triggers';
import { ComponentDefinition, isContainer } from '../types';

/** The fixture's own shape, written out so a variant can be typed against it. */
interface FixtureComponent {
	id: string;
	type: string;
	label: string;
	position: { col: number; row: number; width: number; height: number };
	children?: FixtureComponent[];
	attributes?: { key: string }[];
	derived?: string;
	max?: string;
	hasTemp?: boolean;
	rowHeader?: string;
	openRows?: boolean;
	columns?: { key: string; type?: string }[];
	reset?: {
		trigger: string;
		action?: 'full' | 'empty' | 'formula';
		to?: string;
		buffer?: 'clear';
	}[];
}

interface FixtureLayout {
	name: string;
	columns: number;
	functions: string[];
	triggers: string[];
	components: FixtureComponent[];
}

const LAYOUT_SHAPE: FixtureLayout = {
	name: 'DnD 5e Standard',
	columns: 6,
	functions: ['mod(score) = floor((score - 10) / 2)'],
	triggers: ['Short rest', 'Long rest'],
	components: [
		{
			id: 'abilities',
			type: 'stat-group',
			label: 'Abilities',
			position: { col: 1, row: 1, width: 3, height: 1 },
			attributes: [{ key: 'CON' }],
			derived: 'mod(value)',
		},
		{
			id: 'hp',
			type: 'pool',
			label: 'HP',
			position: { col: 1, row: 2, width: 2, height: 1 },
			max: '10 + abilities.CON',
			reset: [{ trigger: 'Long rest', action: 'full' }],
		},
		{
			id: 'ki',
			type: 'pool',
			label: 'Ki',
			position: { col: 3, row: 2, width: 2, height: 1 },
			max: '5',
			reset: [{ trigger: 'Short rest', action: 'empty' }],
		},
	],
};

const LAYOUT = JSON.stringify(LAYOUT_SHAPE);

/**
 * A variant of the layout, built from the object rather than by rewriting its
 * JSON: a string replace against `JSON.stringify` output depends on spacing
 * nothing guarantees, and a replace that quietly matched nothing would leave
 * a test passing while exercising the case it was written to rule out.
 */
function variant(edit: (shape: FixtureLayout) => void): string {
	const shape = JSON.parse(LAYOUT) as FixtureLayout;
	edit(shape);
	return JSON.stringify(shape);
}

const componentIn = (shape: FixtureLayout, id: string): FixtureComponent => {
	const found = shape.components.find((component) => component.id === id);
	if (!found) throw new Error(`no component "${id}" in the fixture`);
	return found;
};

const NOTE = `---
sheet-layout: DnD 5e Standard
---

## Abilities
\`\`\`sheet
CON: 16
\`\`\`

## HP
\`\`\`sheet
current: 4
temp: 2
\`\`\`

## Ki
\`\`\`sheet
current: 3
\`\`\`

## Backstory

Grew up in [[Neverwinter]].
`;

/**
 * Everything SheetView does between a trigger button and the new note text.
 * Kept in one function so the order — read, publish, resolve, write — is the
 * order the view does it in and can be compared against it.
 */
function applyTrigger(
	source: string,
	layoutSource: string,
	trigger: string,
): { text: string; failed: string[]; bound: string[] } {
	const layout = parseLayout(layoutSource);
	const note = parseCharacter(source);
	const { library } = parseFunctions(layout.functions);

	// The view's own walk: a trigger reaches a component wherever it sits, and
	// whether or not the reader has the container holding it open.
	const prepared = walkComponents(layout.components).map(({ config }) => {
		const component = getComponent(config.type) as ComponentDefinition;
		// A container has no section (SPEC §4.1), so there is nothing to read.
		const section = isContainer(component)
			? undefined
			: getSection(note, config.label);
		const result = section ? component.read(section.body, config) : null;
		return {
			config,
			component,
			error: result && !result.ok ? result.error : null,
			data: result?.ok === true ? result.data : null,
		};
	});

	const env: FormulaEnv = buildSheetEnv(prepared.map(publishedComponent), library);

	const failed: string[] = [];
	const writes = [];
	for (const { config, component, data } of prepared) {
		// Any binding matching this trigger, and its index — which is where its
		// own `to` expression lives now that the bindings are a list.
		const index = (config.reset ?? []).findIndex(
			(binding) => binding.trigger === trigger,
		);
		const reset = config.reset?.[index];
		if (!component.applyReset || !reset) continue;
		const at = (field: string): string =>
			field === 'reset.to' ? `reset.${index}.to` : field;
		const resolve = makeFieldResolver(component, config, data, env);
		const explain = makeFieldExplainer(component, config, data, env);
		const result = component.applyReset(data, config, reset, {
			resolve: (field, scope) => resolve(at(field), scope),
			explain: (field, scope) => explain(at(field), scope),
		});
		if (!result.ok) {
			failed.push(`${config.label}: ${result.error}`);
			continue;
		}
		writes.push({
			label: config.label,
			write: (body: string | null) => component.write(result.data, body, config),
		});
	}

	return {
		text: applySectionWrites(source, writes).text,
		failed,
		// What the confirmation lists, which is `SheetView.renderTriggers`'
		// filter: a component that read, that can act on a reset, and that binds
		// to this trigger. Nothing about where it sits, deliberately.
		bound: prepared
			.filter(
				(entry) =>
					entry.error === null &&
					entry.component.applyReset !== undefined &&
					(entry.config.reset ?? []).some(
						(binding) => binding.trigger === trigger,
					),
			)
			.map((entry) => entry.config.label),
	};
}

const fenced = (text: string, label: string, key: string): string | undefined => {
	const body = getSection(parseCharacter(text), label)?.body ?? '';
	const match = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(body);
	return match?.[1];
};

describe('a long rest, end to end', () => {
	it('restores a pool to a max computed through the layout library', () => {
		// max is "10 + abilities.CON", and abilities.CON is what the card
		// shows — mod(16), which is 3. So the pool restores to 13, not 26.
		const { text, failed } = applyTrigger(NOTE, LAYOUT, 'Long rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'HP', 'current')).toBe('13');
	});

	it('leaves temporary points alone', () => {
		const { text } = applyTrigger(NOTE, LAYOUT, 'Long rest');
		expect(fenced(text, 'HP', 'temp')).toBe('2');
	});

	it('does not touch a component bound to a different trigger', () => {
		const { text } = applyTrigger(NOTE, LAYOUT, 'Long rest');
		expect(fenced(text, 'Ki', 'current')).toBe('3');
	});

	it('leaves prose and unmapped sections byte for byte', () => {
		const { text } = applyTrigger(NOTE, LAYOUT, 'Long rest');
		expect(getSection(parseCharacter(text), 'Backstory')?.body).toBe(
			getSection(parseCharacter(NOTE), 'Backstory')?.body,
		);
	});
});

/*
 * A pool whose maximum an aggregate produces (SPEC §5). The reset path is where
 * a formula stops being a number on a card and becomes a number written into a
 * note, so it is the one that has to be driven end to end.
 */
describe('a long rest against a maximum an aggregate produced', () => {
	const WITH_PACK = variant((shape) => {
		shape.components.push({
			id: 'inventory',
			type: 'table',
			label: 'Inventory',
			position: { col: 1, row: 3, width: 4, height: 2 },
			rowHeader: 'Item',
			openRows: true,
			columns: [
				{ key: 'Qty', type: 'number' },
				{ key: 'Weight', type: 'number' },
			],
		});
		componentIn(shape, 'hp').max = 'sum(inventory, Qty * Weight)';
	});

	const PACKED = NOTE.replace(
		'## Backstory',
		[
			'## Inventory',
			'',
			'| Item | Qty | Weight |',
			'|---|---|---|',
			'| Dagger | 2 | 1 |',
			'| Rope | 1 | 10 |',
			'',
			'## Backstory',
		].join('\n'),
	);

	it('restores the pool to what the aggregate came to', () => {
		// Two daggers at a pound and a coil of rope at ten: a twelve-pound pack,
		// summed over rows the character added and no layout declared.
		const { text, failed } = applyTrigger(PACKED, WITH_PACK, 'Long rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'HP', 'current')).toBe('12');
	});

	it('names the reason rather than writing a number, where it will not resolve', () => {
		// A pool whose max is broken must not stop the rest of a long rest, and
		// the reason has to reach the user: they have pressed a button and
		// watched nothing happen.
		const misspelled = variant((shape) => {
			componentIn(shape, 'hp').max = 'sum(inventroy, Weight)';
		});
		const { text, failed } = applyTrigger(PACKED, misspelled, 'Long rest');
		expect(failed).toEqual([
			'HP: There is no table called "inventroy" on this sheet. An aggregate names a component by its layout id, which is not the heading shown on its card.',
		]);
		expect(fenced(text, 'HP', 'current')).toBe('4');
	});

	it('leaves the inventory section byte for byte', () => {
		// Constraint 4 in miniature: an aggregate reads a note and writes none.
		const { text } = applyTrigger(PACKED, WITH_PACK, 'Long rest');
		expect(getSection(parseCharacter(text), 'Inventory')?.body).toBe(
			getSection(parseCharacter(PACKED), 'Inventory')?.body,
		);
	});
});

describe('a short rest, end to end', () => {
	it('empties the pool bound to it', () => {
		const { text, failed } = applyTrigger(NOTE, LAYOUT, 'Short rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'Ki', 'current')).toBe('0');
	});

	it('leaves the pool bound to the other trigger alone', () => {
		const { text } = applyTrigger(NOTE, LAYOUT, 'Short rest');
		expect(fenced(text, 'HP', 'current')).toBe('4');
	});
});

describe('a trigger that cannot fully apply', () => {
	const BROKEN = variant((shape) => {
		componentIn(shape, 'hp').max = '10 + wisdom';
	});

	it('reports the component it could not reset', () => {
		const { failed } = applyTrigger(NOTE, BROKEN, 'Long rest');
		expect(failed).toHaveLength(1);
		expect(failed[0]).toContain('HP');
	});

	it('leaves that component exactly as it was', () => {
		const { text } = applyTrigger(NOTE, BROKEN, 'Long rest');
		expect(fenced(text, 'HP', 'current')).toBe('4');
	});

	it('still applies every component that resolved', () => {
		// SPEC §6: one broken max must not refuse a whole rest. Both pools are
		// on Long rest here, and only one of them can compute.
		const both = variant((shape) => {
			componentIn(shape, 'hp').max = '10 + wisdom';
			componentIn(shape, 'ki').reset = [{ trigger: 'Long rest', action: 'empty' }];
		});
		const { text, failed } = applyTrigger(NOTE, both, 'Long rest');
		expect(failed).toHaveLength(1);
		// The one that could not compute is untouched; the one that could is
		// reset, in the same write.
		expect(fenced(text, 'HP', 'current')).toBe('4');
		expect(fenced(text, 'Ki', 'current')).toBe('0');
	});
});

describe('the trigger list the sheet draws buttons from', () => {
	it('is the declared order', () => {
		expect(parseTriggers(parseLayout(LAYOUT)).names).toEqual([
			'Short rest',
			'Long rest',
		]);
	});

	it('reports nothing wrong with a layout whose bindings all match', () => {
		expect(parseTriggers(parseLayout(LAYOUT)).problems).toEqual([]);
	});
});

describe('a trigger that subsumes another, end to end', () => {
	// 5e's actual shape: everything a short rest restores, a long rest restores
	// too, and not the other way round. Ki binds to both; hit dice only to the
	// long rest.
	const BOTH = variant((shape) => {
		componentIn(shape, 'ki').reset = [
			{ trigger: 'Short rest', action: 'empty' },
			{ trigger: 'Long rest', action: 'empty' },
		];
	});

	it('restores the shared pool on the narrower rest', () => {
		const { text, failed } = applyTrigger(NOTE, BOTH, 'Short rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'Ki', 'current')).toBe('0');
		// The long-rest-only pool is untouched by a short rest.
		expect(fenced(text, 'HP', 'current')).toBe('4');
	});

	it('restores it on the wider rest as well', () => {
		const { text, failed } = applyTrigger(NOTE, BOTH, 'Long rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'Ki', 'current')).toBe('0');
		// And everything the wider rest covers on its own.
		expect(fenced(text, 'HP', 'current')).toBe('13');
	});

	it('lets each binding restore to something different', () => {
		// A short rest gives one use back; a long rest gives all of them.
		const graded = variant((shape) => {
			componentIn(shape, 'ki').reset = [
				{ trigger: 'Short rest', action: 'formula', to: '1' },
				{ trigger: 'Long rest', action: 'full' },
			];
		});
		expect(fenced(applyTrigger(NOTE, graded, 'Short rest').text, 'Ki', 'current')).toBe(
			'1',
		);
		// max is `level`, which is 5.
		expect(fenced(applyTrigger(NOTE, graded, 'Long rest').text, 'Ki', 'current')).toBe(
			'5',
		);
	});

	it('reports no problem for a component bound to several declared triggers', () => {
		expect(parseTriggers(parseLayout(BOTH)).problems).toEqual([]);
	});
});

describe('clearing the buffer, end to end', () => {
	const BUFFERED = variant((shape) => {
		const hp = componentIn(shape, 'hp');
		hp.hasTemp = true;
		hp.reset = [{ trigger: 'Long rest', action: 'full', buffer: 'clear' }];
		componentIn(shape, 'ki').reset = [
			{ trigger: 'Short rest', buffer: 'clear' },
		];
	});

	it('restores the pool and clears the buffer in one write', () => {
		const { text, failed } = applyTrigger(NOTE, BUFFERED, 'Long rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'HP', 'current')).toBe('13');
		expect(fenced(text, 'HP', 'temp')).toBe('0');
	});

	it('clears a buffer without touching the value beside it', () => {
		// The 4e shape, on a component whose binding names no action at all.
		const { text, failed } = applyTrigger(NOTE, BUFFERED, 'Short rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'Ki', 'current')).toBe('3');
	});
});

/*
 * A long rest reaching two containers down (SPEC §13).
 *
 * **Containment changes nothing about a reset**, which is the whole claim now
 * that a container hides nothing: a Pool two containers deep publishes its
 * value, resolves its max, resets, and appears by name in the trigger's
 * confirmation exactly as one at the top level does.
 *
 * This was written against a *collapsed* container, to hold the corollary that
 * hiding is never a way to make a formula not run. The collapse went (SPEC §13),
 * so there is no hidden case left to except here — and the test is kept rather
 * than dropped, because the rule it drives is the one that outlived the control.
 * Tab set brought the hidden case back, and the describe below is where it is
 * answered.
 */
describe('a long rest against a pool two containers deep', () => {
	/** The same three components, with the pool two containers deep. */
	const NESTED = variant((shape) => {
		const hp = componentIn(shape, 'hp');
		shape.components = shape.components.filter(
			(component) => component.id !== 'hp',
		);
		shape.components.push({
			id: 'vitals',
			type: 'group',
			label: 'Vitals',
			position: { col: 1, row: 3, width: 4, height: 2 },
			children: [
				{
					id: 'body',
					type: 'group',
					label: 'Body',
					position: { col: 1, row: 1, width: 4, height: 1 },
					children: [{ ...hp, position: { col: 1, row: 1, width: 4, height: 1 } }],
				},
			],
		});
	});

	it('restores it, to a max computed from a card outside the container', () => {
		// max is "10 + abilities.CON", and the abilities card is not inside this
		// group at all: containment adds no segment, so the expression is the one
		// it always was.
		const { text, failed } = applyTrigger(NOTE, NESTED, 'Long rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'HP', 'current')).toBe('13');
	});

	it('names it in the confirmation, and names no container', () => {
		// A container holds no state, so it is offered no binding and a trigger
		// passes over it — while the pool inside it is listed exactly as it would
		// be at the top level.
		expect(applyTrigger(NOTE, NESTED, 'Long rest').bound).toEqual(['HP']);
	});

	it('writes the section as a heading in the same flat note', () => {
		// The character note is unchanged by containment, to the byte: a
		// container has no section, so the body stays a flat list of `##`
		// headings, one per leaf (Constraints 2 and 3).
		const { text } = applyTrigger(NOTE, NESTED, 'Long rest');
		expect(getSection(parseCharacter(text), 'Vitals')).toBeUndefined();
		expect(getSection(parseCharacter(text), 'Backstory')?.body).toBe(
			getSection(parseCharacter(NOTE), 'Backstory')?.body,
		);
	});
});

/*
 * The same long rest, reaching a pool on a tab nobody has opened (SPEC §4.2).
 *
 * **This is the hidden case the collapse's removal left without a home**, and
 * the corollary it exists for is the one worth being able to point at: *hiding
 * is never a way to make a formula not run.* A reset whose meaning depended on
 * which tab the reader had open would be SPEC §5's grid-order `?` in a new
 * place — a rest that restored four pools or three depending on where somebody
 * had clicked last.
 *
 * The pool is on the **second** tab, inside a Group, so it is both hidden and
 * two containers deep. Nothing in this path knows about tabs, which is the
 * point: the read pass walks every component in the layout, `buildSheetEnv`
 * publishes from that same list, and the confirmation filters on `error === null`
 * and a matching binding — never on what is on screen. The assertion is that
 * none of those three grew an opinion about visibility.
 */
describe('a long rest against a pool on a tab nobody opened', () => {
	/** The pool as the second tab of a tab set, inside a group of its own. */
	const TABBED = variant((shape) => {
		const hp = componentIn(shape, 'hp');
		shape.components = shape.components.filter(
			(component) => component.id !== 'hp',
		);
		shape.components.push({
			id: 'pages',
			type: 'tab-set',
			label: 'Pages',
			position: { col: 1, row: 3, width: 4, height: 2 },
			children: [
				// First, so it is the tab that opens and the pool's is not.
				{
					id: 'notes_tab',
					type: 'stat',
					label: 'Notes tab',
					position: { col: 1, row: 1, width: 4, height: 2 },
				},
				{
					id: 'vitals',
					type: 'group',
					label: 'Vitals',
					position: { col: 1, row: 1, width: 4, height: 2 },
					children: [
						{ ...hp, position: { col: 1, row: 1, width: 4, height: 1 } },
					],
				},
			],
		});
	});

	it('really does put the pool inside a tab that is not the first', () => {
		// Vacuity guard. Every assertion below would pass just as well on a pool
		// left at the top level, so the fixture's own shape is asserted before it
		// is trusted: `variant` edits an object, and an edit that matched nothing
		// is exactly the failure this file's `variant` comment was written about.
		const walk = walkComponents(parseLayout(TABBED).components);
		const pool = walk.find((entry) => entry.config.id === 'hp');
		expect(pool?.depth).toBe(2);
		expect(pool?.parent?.id).toBe('vitals');
		// And it is the second tab, so the one the tab set opens is the other.
		const tabs = walk.find((entry) => entry.config.id === 'pages');
		expect(tabs?.config.children?.map((tab) => tab.id)).toEqual([
			'notes_tab',
			'vitals',
		]);
	});

	it('restores it, to a max resolved from a card outside the tab set', () => {
		// `max` is "10 + abilities.CON" and the abilities card is not in the tab
		// set at all. So the pool on the unopened tab was read, its max resolved
		// against the sheet-wide table, and the write landed: 6 + 7 = 13.
		const { text, failed } = applyTrigger(NOTE, TABBED, 'Long rest');
		expect(failed).toEqual([]);
		expect(fenced(text, 'HP', 'current')).toBe('13');
	});

	it('names it in the confirmation, and names neither container', () => {
		// The reader is told what a rest will touch before pressing it, and a pool
		// they cannot currently see is still one of those things. Neither the tab
		// set nor the group inside it appears: a container holds no state, so it
		// is offered no binding and a trigger passes over it.
		expect(applyTrigger(NOTE, TABBED, 'Long rest').bound).toEqual(['HP']);
	});

	it('leaves the note a flat list of headings, with no section for either container', () => {
		// Constraints 2 and 3 again, through a tab this time: a tab has no
		// placement and no section either, so the body is unchanged in shape.
		const { text } = applyTrigger(NOTE, TABBED, 'Long rest');
		const note = parseCharacter(text);
		expect(getSection(note, 'Pages')).toBeUndefined();
		expect(getSection(note, 'Vitals')).toBeUndefined();
		expect(getSection(note, 'HP')).toBeDefined();
	});
});
