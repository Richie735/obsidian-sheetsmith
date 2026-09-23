import { describe, expect, it } from 'vitest';
import { readSample } from './sample-read';
import { getComponent } from '../components';
import { ComponentConfig } from '../types';

/*
 * What a component reads with no character behind it: the policy the canvas
 * and the component picker's preview share (`sample-read.ts`).
 */

function config(type: string, extra: Record<string, unknown> = {}): ComponentConfig {
	return {
		...extra,
		id: 'probe',
		type,
		label: 'Probe',
		position: { col: 1, row: 1, width: 2, height: 1 },
	};
}

describe('reading a sample for drawing', () => {
	it('reads a filled section through the component\'s own read', () => {
		const card = config('card');
		const expected = getComponent('card')?.read(
			getComponent('card')?.sample?.(card) ?? '',
			card,
		);
		expect(expected?.ok && expected.data).toBeTruthy();
		const read = readSample(card, true);
		expect(read.error).toBeNull();
		expect(read.data).toEqual(expected?.ok ? expected.data : undefined);
	});

	it('reads an empty section when not filled, as a fresh note does', () => {
		const read = readSample(config('card'), false);
		expect(read.error).toBeNull();
		expect(read.data).toBeNull();
	});

	it('reads nothing for a container, filled or not', () => {
		for (const filled of [true, false]) {
			const read = readSample(config('group'), filled);
			expect(read.component).toBe(getComponent('group'));
			expect(read.data).toBeNull();
			expect(read.error).toBeNull();
		}
	});

	it('reads an empty section for a component with no sample', () => {
		// Image declares none, so it draws the same filled or not.
		expect(getComponent('image')?.sample === undefined).toBe(true);
		const read = readSample(config('image'), true);
		expect(read.error).toBeNull();
		expect(read.data).toBeNull();
	});

	it('reports a configuration the component refuses, whatever the body', () => {
		const broken = config('table', {
			columns: [{ key: 'Same' }, { key: 'Same' }],
		});
		for (const filled of [true, false]) {
			const read = readSample(broken, filled);
			expect(read.data).toBeNull();
			expect(read.error).toBeTruthy();
		}
	});

	it('knows no component for an unknown type, and reads nothing', () => {
		const read = readSample(config('nope'), true);
		expect(read.component).toBeUndefined();
		expect(read.data).toBeNull();
	});
});
