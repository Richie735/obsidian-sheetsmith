import { describe, expect, it } from 'vitest';
import { ComponentConfig } from '../types';
import { uniqueId, uniqueLabel } from './unique-names';

function named(id: string, label: string): ComponentConfig {
	return { id, type: 'card', label, position: { col: 1, row: 1, width: 1, height: 1 } };
}

const sheet = [named('hp', 'HP'), named('hp_2', 'HP 2'), named('str', 'Strength')];

describe('uniqueLabel', () => {
	it('keeps a free label and suffixes a taken one past every taken suffix', () => {
		expect(uniqueLabel('Speed', sheet)).toBe('Speed');
		expect(uniqueLabel('HP', sheet)).toBe('HP 3');
	});
});

describe('uniqueId', () => {
	it('builds a name from a label, lowercased, and suffixes a taken one', () => {
		expect(uniqueId('Hit points', sheet)).toBe('hit_points');
		expect(uniqueId('HP', sheet)).toBe('hp_3');
		expect(uniqueId('3 rings', sheet)).toBe('_3_rings');
		expect(uniqueId('!!', sheet)).toBe('component');
	});
});
