import { describe, expect, it } from 'vitest';
import { Layout } from './layout';
import { parseTriggers } from './triggers';
import { ComponentConfig, ResetBinding } from '../types';

const component = (
	label: string,
	reset?: ResetBinding | ResetBinding[],
): ComponentConfig => ({
	id: label.toLowerCase(),
	type: 'pool',
	label,
	position: { col: 1, row: 1, width: 1, height: 1 },
	...(reset ? { reset: Array.isArray(reset) ? reset : [reset] } : {}),
});

const layout = (
	triggers: string[] | undefined,
	components: ComponentConfig[] = [],
): Layout => ({ name: 'L', components, ...(triggers ? { triggers } : {}) });

describe('parseTriggers: declarations', () => {
	it('keeps declared names in order', () => {
		expect(parseTriggers(layout(['Short rest', 'Long rest'])).names).toEqual([
			'Short rest',
			'Long rest',
		]);
	});

	it('has nothing to say about a layout declaring none', () => {
		expect(parseTriggers(layout(undefined))).toEqual({ names: [], problems: [] });
	});

	it('trims a name, so a stray space does not make a second trigger', () => {
		expect(parseTriggers(layout(['  Long rest  '])).names).toEqual(['Long rest']);
	});

	it('drops a blank name and reports it', () => {
		const { names, problems } = parseTriggers(layout(['Long rest', '   ']));
		expect(names).toEqual(['Long rest']);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.message).toContain('needs a name');
	});

	it('collapses a repeated name to its first appearance', () => {
		const { names, problems } = parseTriggers(
			layout(['Long rest', 'Long rest', 'Downtime']),
		);
		expect(names).toEqual(['Long rest', 'Downtime']);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.message).toContain('more than once');
	});

	it('reports a problem without refusing the rest of the list', () => {
		// SPEC §5's rule: contents are reported where they can be fixed, and
		// one bad entry must not take the layout down with it.
		const { names } = parseTriggers(layout(['', 'Long rest', 'Long rest']));
		expect(names).toEqual(['Long rest']);
	});
});

describe('parseTriggers: bindings', () => {
	it('accepts a binding matching a declared trigger', () => {
		const { problems } = parseTriggers(
			layout(
				['Long rest'],
				[component('HP', { trigger: 'Long rest', action: 'full' })],
			),
		);
		expect(problems).toEqual([]);
	});

	it('reports a binding naming no declared trigger, against its component', () => {
		const { problems } = parseTriggers(
			layout(
				['Long rest'],
				[component('HP', { trigger: 'Long Rest', action: 'full' })],
			),
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.component).toBe('HP');
		expect(problems[0]?.message).toContain('does not declare');
	});

	it('reports a binding on a layout declaring no triggers at all', () => {
		const { problems } = parseTriggers(
			layout(undefined, [
				component('HP', { trigger: 'Long rest', action: 'full' }),
			]),
		);
		expect(problems).toHaveLength(1);
		expect(problems[0]?.component).toBe('HP');
	});

	it('does not bind to a name that was dropped as blank or repeated', () => {
		// The second "Long rest" is ignored, but the first still counts, so a
		// binding to it is fine — and a binding to the blank one is not.
		const { problems } = parseTriggers(
			layout(
				['Long rest', 'Long rest'],
				[
					component('HP', { trigger: 'Long rest', action: 'full' }),
					component('Ki', { trigger: '', action: 'empty' }),
				],
			),
		);
		const bindings = problems.filter((problem) => problem.component !== undefined);
		expect(bindings).toHaveLength(1);
		expect(bindings[0]?.component).toBe('Ki');
	});

	it('says nothing about a trigger nothing binds to', () => {
		// A declared trigger with no components on it yet is an ordinary
		// state while a layout is being built, not a problem.
		const { problems } = parseTriggers(layout(['Downtime']));
		expect(problems).toEqual([]);
	});

	it('leaves components without a reset alone', () => {
		const { problems } = parseTriggers(
			layout(['Long rest'], [component('Name'), component('AC')]),
		);
		expect(problems).toEqual([]);
	});
});
