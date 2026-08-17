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
import { makeFieldExplainer, makeFieldResolver } from '../formula/resolve';
import { buildSheetScope } from '../formula/sheet';
import { Scope } from '../formula/expression';
import { applySectionWrites, getSection, parseCharacter } from '../parse/character';
import { parseLayout } from '../parse/layout';
import { parseTriggers } from '../parse/triggers';
import { ComponentDefinition } from '../types';

/** The fixture's own shape, written out so a variant can be typed against it. */
interface FixtureComponent {
	id: string;
	type: string;
	label: string;
	position: { col: number; row: number; width: number; height: number };
	attributes?: { key: string }[];
	derived?: string;
	max?: string;
	hasTemp?: boolean;
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
): { text: string; failed: string[] } {
	const layout = parseLayout(layoutSource);
	const note = parseCharacter(source);
	const { library } = parseFunctions(layout.functions);

	const prepared = layout.components.map((config) => {
		const component = getComponent(config.type) as ComponentDefinition;
		const section = getSection(note, config.label);
		const result = section ? component.read(section.body, config) : null;
		return { config, component, data: result?.ok === true ? result.data : null };
	});

	const sheet: Scope = buildSheetScope(
		prepared.flatMap(({ config, component, data }) =>
			component.scopeValues
				? [
						{
							id: config.id,
							values: component.scopeValues(data, config),
							resolver: (scope: Scope) =>
								makeFieldResolver(component, config, data, scope, library),
						},
					]
				: [],
		),
	);

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
		const resolve = makeFieldResolver(component, config, data, sheet, library);
		const explain = makeFieldExplainer(component, config, data, sheet, library);
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

	return { text: applySectionWrites(source, writes).text, failed };
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
