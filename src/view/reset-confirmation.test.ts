// @vitest-environment happy-dom
/*
 * What a trigger's confirmation says a press will touch (SPEC §6,
 * `docs/features/record-set-reset-scope.md`), and the one opener the sheet and
 * the harness share. `resetSummary` is driven directly over a plan built here;
 * `planTrigger` itself is driven in `reset-flow.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { openResetConfirmation, resetSummary } from './reset-confirmation';
import { getComponent } from '../components';
import { App } from '../test/obsidian-stub';
import { ComponentConfig, ComponentDefinition, ResetResult } from '../types';
import { NO_ENV } from '../formula/resolve';
import { PlannedComponent, planTrigger } from './reset-plan';

/**
 * A component as the plan holds it: every binding it carries, each with an
 * outcome — success unless the case says otherwise, by the binding's index.
 * `resetSummary` filters on the trigger itself, so a binding on another trigger
 * can sit in the list and show that it is left out.
 */
function planned(
	entry: { config: ComponentConfig; component: ComponentDefinition | undefined },
	results: Record<number, ResetResult<unknown>> = {},
) {
	return {
		...entry,
		bindings: (entry.config.reset ?? []).map((binding, index) => ({
			binding,
			index,
			result: results[index] ?? { ok: true as const, data: null },
		})),
	};
}

/** A Table whose columns a trigger can name, prepared the way the view does. */
function conditions(reset: ComponentConfig['reset']): {
	config: ComponentConfig;
	component: ComponentDefinition | undefined;
} {
	return {
		config: {
			id: 'conditions',
			type: 'table',
			label: 'Conditions',
			position: { col: 1, row: 1, width: 4, height: 2 },
			rowHeader: 'Condition',
			columns: [
				{ key: 'Active', type: 'toggle' },
				{ key: 'Uses', name: 'Uses left', type: 'number', max: 3 },
			],
			...(reset ? { reset } : {}),
		} as ComponentConfig,
		component: getComponent('table'),
	};
}

/** A Pool, which names no part of itself and so must read as it always did. */
function pool(reset: ComponentConfig['reset']) {
	return {
		config: {
			id: 'hp',
			type: 'pool',
			label: 'Hit points',
			position: { col: 1, row: 1, width: 2, height: 1 },
			...(reset ? { reset } : {}),
		} as ComponentConfig,
		component: getComponent('pool'),
	};
}

describe('what the confirmation says a trigger will touch', () => {
	it('names the column, because the label alone over-claims', () => {
		// "It resets: Conditions" promised a component where one of two columns
		// moves, on a component whose other columns are guaranteed untouched.
		expect(
			resetSummary(
				'Long rest',
				planned(
					conditions([{ trigger: 'Long rest', column: 'Active', action: 'empty' }]),
				),
			),
		).toBe('Conditions — Active');
	});

	it('names both columns where one trigger reaches two', () => {
		expect(
			resetSummary(
				'Long rest',
				planned(
					conditions([
						{ trigger: 'Long rest', column: 'Active', action: 'empty' },
						{ trigger: 'Long rest', column: 'Uses', action: 'full' },
					]),
				),
			),
		).toBe('Conditions — Active, Uses left');
	});

	it("uses the component's own label for a column, never the stored key", () => {
		// `Uses left` is the column's `name`; the binding stores `Uses`. The
		// display word comes back from `resetColumns`, so this file never
		// decides what a part of a component is called.
		expect(
			resetSummary(
				'Long rest',
				planned(
					conditions([{ trigger: 'Long rest', column: 'Uses', action: 'full' }]),
				),
			),
		).toBe('Conditions — Uses left');
	});

	it('leaves out a binding on a different trigger', () => {
		expect(
			resetSummary(
				'Short rest',
				planned(
					conditions([
						{ trigger: 'Long rest', column: 'Active', action: 'empty' },
						{ trigger: 'Short rest', column: 'Uses', action: 'full' },
					]),
				),
			),
		).toBe('Conditions — Uses left');
	});

	it('falls back to the stored key for a column that is gone', () => {
		// Honest rather than silent: the failure notice this press produces
		// names the same word.
		expect(
			resetSummary(
				'Long rest',
				planned(
					conditions([{ trigger: 'Long rest', column: 'Fatigue', action: 'empty' }]),
				),
			),
		).toBe('Conditions — Fatigue');
	});

	it('is the bare label for a component that names no part of itself', () => {
		// Pool and Track are unchanged by this, which is the whole of what keeps
		// it from being a change to every confirmation.
		expect(
			resetSummary('Long rest', planned(pool([{ trigger: 'Long rest', action: 'full' }]))),
		).toBe('Hit points');
	});

	/*
	 * The planned outcome (`docs/features/record-set-reset-scope.md`): a reach a
	 * component counted, and a failure it named, both before anything is written.
	 */
	describe('from the planned outcome', () => {
		/** A Record set, which counts what a scoped binding reaches. */
		const features = (reset: ComponentConfig['reset']) => ({
			config: {
				id: 'rest_features',
				type: 'record-set',
				label: 'Rest features',
				position: { col: 1, row: 1, width: 6, height: 3 },
				fields: [{ key: 'Uses', type: 'number' }],
				...(reset ? { reset } : {}),
			} as ComponentConfig,
			component: getComponent('record-set'),
		});
		const scoped = features([
			{ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' },
		]);

		it('counts what a scoped binding reaches, with no noun after it', () => {
			// The label names the list and the heading carries the verb, so the
			// owner's "refills 3 of 7 Features" is "Rest features — 3 of 7" here.
			expect(
				resetSummary(
					'Short rest',
					planned(scoped, {
						0: { ok: true, data: null, reach: { reached: 2, of: 5 } },
					}),
				),
			).toBe('Rest features — 2 of 5');
		});

		it('lists a scope that reaches nothing, rather than dropping it', () => {
			// The mis-scoped rest is exactly the one that reaches nothing.
			expect(
				resetSummary(
					'Short rest',
					planned(scoped, {
						0: { ok: true, data: null, reach: { reached: 0, of: 5 } },
					}),
				),
			).toBe('Rest features — 0 of 5');
		});

		it('is the bare label for a Record set binding that reports no reach', () => {
			// No condition, so every record: "5 of 5" on every rest would be noise.
			expect(
				resetSummary(
					'Short rest',
					planned(features([{ trigger: 'Short rest', action: 'full' }])),
				),
			).toBe('Rest features');
		});

		it("says a failed plan will not reset, in the component's own words", () => {
			const reason =
				'its condition under Only where could not be worked out on every feature, so it resets none: Recharge is not defined on this sheet. Fix it under Only where in the layout editor.';
			expect(
				resetSummary('Short rest', planned(scoped, { 0: { ok: false, error: reason } })),
			).toBe(`Rest features — will not reset: ${reason}`);
		});

		it("does the same for any component, a Pool's broken max included", () => {
			// One branch in the view, generic: the confirmation of a Pool whose
			// ceiling will not resolve changes too, and now says so before Apply.
			expect(
				resetSummary(
					'Long rest',
					planned(pool([{ trigger: 'Long rest', action: 'full' }]), {
						0: { ok: false, error: '"wisdom" is not defined on this sheet.' },
					}),
				),
			).toBe('Hit points — will not reset: "wisdom" is not defined on this sheet.');
		});

		it('names a Table binding with no column as not resetting, which is what the press does', () => {
			// An old layout's Table binding. This read as the bare label before the
			// plan existed, and the press then reported it; now the two agree.
			const reason =
				'this trigger does not say which column to act on. Give the binding a column, or remove it.';
			expect(
				resetSummary(
					'Long rest',
					planned(conditions([{ trigger: 'Long rest', action: 'full' }]), {
						0: { ok: false, error: reason },
					}),
				),
			).toBe(`Conditions — will not reset: ${reason}`);
		});

		it('says per part which column will not reset, after the parts that will', () => {
			// Only a component whose bindings name parts can half-fail, and the
			// line must not claim it will not reset when most of it will.
			expect(
				resetSummary(
					'Long rest',
					planned(
						conditions([
							{ trigger: 'Long rest', column: 'Active', action: 'empty' },
							{ trigger: 'Long rest', column: 'Uses', action: 'full' },
						]),
						{ 1: { ok: false, error: 'it has no maximum.' } },
					),
				),
			).toBe('Conditions — Active; Uses left will not reset: it has no maximum.');
		});
	});

	/*
	 * A binding naming the field it writes
	 * (`docs/features/record-set-reset-field-targeting.md`): the part's label,
	 * then its own count, since a trigger holds one binding per part.
	 */
	describe('a part and its count', () => {
		const features = (reset: ComponentConfig['reset']) => ({
			config: {
				id: 'rest_features',
				type: 'record-set',
				label: 'Rest features',
				position: { col: 1, row: 1, width: 6, height: 3 },
				fields: [
					{ key: 'Recharges', type: 'level', levels: ['None', 'Short rest'] },
					{ key: 'Uses', type: 'number', maxSource: 'record' },
					{ key: 'Used', type: 'toggle' },
				],
				...(reset ? { reset } : {}),
			} as ComponentConfig,
			component: getComponent('record-set'),
		});

		it('puts a conditioned field binding\'s count beside the field', () => {
			expect(
				resetSummary(
					'Short rest',
					planned(
						features([
							{ trigger: 'Short rest', column: 'Uses', action: 'full', where: 'Recharges == 1' },
						]),
						{ 0: { ok: true, data: null, reach: { reached: 3, of: 6 } } },
					),
				),
			).toBe('Rest features — Uses 3 of 6');
		});

		it('gives each field its own count', () => {
			expect(
				resetSummary(
					'Short rest',
					planned(
						features([
							{ trigger: 'Short rest', column: 'Used', action: 'empty', where: 'Recharges == 2' },
							{ trigger: 'Short rest', column: 'Uses', action: 'full', where: 'Recharges == 1' },
						]),
						{
							0: { ok: true, data: null, reach: { reached: 2, of: 6 } },
							1: { ok: true, data: null, reach: { reached: 3, of: 6 } },
						},
					),
				),
			).toBe('Rest features — Used 2 of 6, Uses 3 of 6');
		});

		it('is the bare field for a field binding with no condition', () => {
			expect(
				resetSummary(
					'Long rest',
					planned(features([{ trigger: 'Long rest', column: 'Uses', action: 'full' }])),
				),
			).toBe('Rest features — Uses');
		});

		it('says the field that will not reset after the one that will', () => {
			expect(
				resetSummary(
					'Short rest',
					planned(
						features([
							{ trigger: 'Short rest', column: 'Used', action: 'empty' },
							{ trigger: 'Short rest', column: 'Uses', action: 'full' },
						]),
						{ 1: { ok: false, error: 'it failed.' } },
					),
				),
			).toBe('Rest features — Used; Uses will not reset: it failed.');
		});
	});
});


/*
 * The records a binding reached and passed over because a ceiling would not work
 * out (`docs/features/record-ceiling-formula.md`): the component's own sentence,
 * after its count, drawn from the plan the real component made.
 */
describe('the records a reset skipped', () => {
	const entry = (name: string, uses: string) =>
		['', `### ${name}`, '```sheet', `Uses: ${uses}`, 'Recharges: 1', '```', 'Prose.'].join('\n');

	function summary(
		reset: NonNullable<ComponentConfig['reset']>[number],
		body: string,
		label = 'Features',
	): string {
		const component = getComponent('record-set');
		if (component === undefined) throw new Error('Record set is registered');
		const config = {
			id: 'features',
			type: 'record-set',
			label,
			recordName: 'Feature',
			position: { col: 1, row: 1, width: 6, height: 3 },
			fields: [
				{ key: 'Uses', type: 'number', maxSource: 'record' },
				// A level, which every action leaves alone, so only `Uses` is written.
				{ key: 'Recharges', type: 'level', levels: ['None', 'Short rest', 'Long rest'] },
			],
			reset: [reset],
		} as ComponentConfig;
		const read = component.read(body, config);
		if (!read.ok) throw new Error(read.error);
		const plan = planTrigger(
			reset.trigger,
			[{ config, component, error: null, data: read.data }],
			NO_ENV,
		);
		return resetSummary(reset.trigger, plan.components[0] as PlannedComponent);
	}

	it('counts one record whose maximum will not work out', () => {
		expect(
			summary(
				{ trigger: 'Long rest', action: 'empty' },
				`${entry('A', '0 / 3')}\n`,
			),
		).toBe('Features');
		expect(
			summary(
				{ trigger: 'Long rest', column: 'Uses', action: 'full' },
				[entry('A', '0 / 3'), entry('B', '0 / prfo'), ''].join('\n'),
			),
		).toBe('Features — Uses, 1 feature skipped, its maximum could not be worked out');
	});

	it('counts several, after the reach of a scoped binding', () => {
		const body = [
			entry('A', '0 / 3'),
			entry('B', '0 / prfo'),
			entry('C', '0 / lots'),
			entry('D', '0 / 2'),
			'',
		].join('\n').replace('Recharges: 1', 'Recharges: 2');
		expect(
			summary(
				{ trigger: 'Short rest', action: 'full', where: 'Recharges == 1' },
				body,
				'Rest features',
			),
		).toBe(
			'Rest features — 3 of 4, 2 features skipped, their maximums could not be worked out',
		);
	});

	it('says nothing where nothing was skipped, a record with no ceiling included', () => {
		expect(
			summary(
				{ trigger: 'Long rest', column: 'Uses', action: 'full' },
				[entry('A', '0 / 3'), entry('Passive', ''), ''].join('\n'),
			),
		).toBe('Features — Uses');
	});
});

describe('the confirmation a trigger opens', () => {
	it('asks in the trigger\'s name and lists each planned line, and applies only on Apply', () => {
		let applied = 0;
		const plan = {
			components: [
				planned(pool([{ trigger: 'Long rest', action: 'full' }])),
				planned(pool([{ trigger: 'Long rest', action: 'full' }]), {
					0: { ok: false, error: 'it has no maximum.' },
				}),
			],
			edits: [],
			failed: [],
		};
		openResetConfirmation(new App() as never, 'Long rest', plan, () => {
			applied += 1;
		});
		const modal = document.body.querySelector('.modal') as HTMLElement;
		expect(modal.querySelector('p')?.textContent).toBe(
			'Apply Long rest? This can be undone. It resets:',
		);
		expect(
			Array.from(modal.querySelectorAll('.sheetsmith-affected li')).map((li) => li.textContent),
		).toEqual(['Hit points', 'Hit points — will not reset: it has no maximum.']);
		const buttons = Array.from(modal.querySelectorAll('button'));
		expect(buttons.map((button) => button.textContent)).toEqual(['Cancel', 'Apply Long rest']);
		buttons[1]?.click();
		expect(applied).toBe(1);
	});

	it('names every field beside a field before Apply, and Cancel applies nothing', () => {
		// `docs/features/record-set-reset-field-targeting.md`, Part 5: the plan
		// refused both bindings, and the reader is told while Cancel is there.
		const whole =
			'its Every field reset on this trigger includes "Uses", which another reset on this trigger names, so neither applies. Point one of them at something else, or remove one.';
		const part =
			'another reset on this trigger covers Every field, which includes "Uses", so neither applies. Point one of them at something else, or remove one.';
		let applied = 0;
		const plan = {
			components: [
				planned(
					{
						config: {
							id: 'rest_features',
							type: 'record-set',
							label: 'Rest features',
							position: { col: 1, row: 1, width: 6, height: 3 },
							fields: [{ key: 'Uses', type: 'number' }],
							reset: [
								{ trigger: 'Short rest', action: 'full' },
								{ trigger: 'Short rest', column: 'Uses', action: 'full' },
							],
						} as ComponentConfig,
						component: getComponent('record-set'),
					},
					{ 0: { ok: false, error: whole }, 1: { ok: false, error: part } },
				),
			],
		};
		openResetConfirmation(new App() as never, 'Short rest', plan, () => {
			applied += 1;
		});
		const modal = Array.from(document.body.querySelectorAll('.modal')).at(-1) as HTMLElement;
		expect(
			Array.from(modal.querySelectorAll('.sheetsmith-affected li')).map((li) => li.textContent),
		).toEqual([`Rest features — will not reset: ${whole} ${part}`]);
		const cancel = Array.from(modal.querySelectorAll('button')).find(
			(button) => button.textContent === 'Cancel',
		);
		cancel?.click();
		expect(cancel).toBeDefined();
		expect(applied).toBe(0);
	});
});
