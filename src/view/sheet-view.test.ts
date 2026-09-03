// @vitest-environment happy-dom
/*
 * What the trigger's confirmation says a press will touch (SPEC §6).
 *
 * The one part of `sheet-view.ts` a test can reach: `SheetView` cannot be
 * constructed without a workspace, which is `docs/PATTERNS.md` §11's standing
 * row, so `renderTriggers` and `applyTrigger` are driven through
 * `reset-flow.test.ts`'s mirror instead. This reads no view state, so it is a
 * function rather than a method and can be driven directly.
 */
import { describe, expect, it } from 'vitest';
import { resetSummary } from './sheet-view';
import { getComponent } from '../components';
import { ComponentConfig, ComponentDefinition } from '../types';

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
				conditions([{ trigger: 'Long rest', column: 'Active', action: 'empty' }]),
			),
		).toBe('Conditions — Active');
	});

	it('names both columns where one trigger reaches two', () => {
		expect(
			resetSummary(
				'Long rest',
				conditions([
					{ trigger: 'Long rest', column: 'Active', action: 'empty' },
					{ trigger: 'Long rest', column: 'Uses', action: 'full' },
				]),
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
				conditions([{ trigger: 'Long rest', column: 'Uses', action: 'full' }]),
			),
		).toBe('Conditions — Uses left');
	});

	it('leaves out a binding on a different trigger', () => {
		expect(
			resetSummary(
				'Short rest',
				conditions([
					{ trigger: 'Long rest', column: 'Active', action: 'empty' },
					{ trigger: 'Short rest', column: 'Uses', action: 'full' },
				]),
			),
		).toBe('Conditions — Uses left');
	});

	it('falls back to the stored key for a column that is gone', () => {
		// Honest rather than silent: the failure notice this press produces
		// names the same word.
		expect(
			resetSummary(
				'Long rest',
				conditions([{ trigger: 'Long rest', column: 'Fatigue', action: 'empty' }]),
			),
		).toBe('Conditions — Fatigue');
	});

	it('is the bare label for a component that names no part of itself', () => {
		// Pool, Track and Record set are unchanged by this, which is the whole
		// of what keeps it from being a change to every confirmation.
		expect(
			resetSummary('Long rest', pool([{ trigger: 'Long rest', action: 'full' }])),
		).toBe('Hit points');
	});

	it('is the bare label for a binding carrying no column at all', () => {
		// An old layout's Table binding: the press reports what it does not say,
		// and the confirmation promises nothing it cannot do.
		expect(
			resetSummary(
				'Long rest',
				conditions([{ trigger: 'Long rest', action: 'full' }]),
			),
		).toBe('Conditions');
	});
});
