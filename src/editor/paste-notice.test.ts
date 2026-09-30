import { describe, expect, it } from 'vitest';
import { configurationSentence, pasteSentence } from './paste-notice';
import { Dependency } from './paste-dependencies';
import { ComponentConfig } from '../types';

const position = { col: 1, row: 1, width: 2, height: 1 };

function leaf(label: string): ComponentConfig {
	return { id: 'x', type: 'card', label, position };
}

function holding(label: string, count: number): ComponentConfig {
	return {
		id: 'box',
		type: 'group',
		label,
		position,
		children: Array.from({ length: count }, (_, index) => leaf(`Inside ${index}`)),
	};
}

function things(...spelled: string[]): Dependency[] {
	return spelled.map((one) => ({
		group: 'name-missing',
		spelled: one,
		detail: { kind: 'name', name: one, here: null },
	}));
}

describe('pasteSentence', () => {
	it('names a leaf, and counts what a container holds', () => {
		expect(pasteSentence(leaf('HP 2'), [])).toBe('Pasted "HP 2".');
		expect(pasteSentence(holding('Defences 2', 3), [])).toBe(
			'Pasted "Defences 2" with the 3 components inside it.',
		);
		expect(pasteSentence(holding('Defences 2', 1), [])).toBe(
			'Pasted "Defences 2" with the component inside it.',
		);
	});

	it('says where a cross-layout paste came from, with one sentence where nothing is to check', () => {
		expect(pasteSentence(leaf('Hit dice'), [], '5e 2014')).toBe(
			'Pasted "Hit dice" from "5e 2014".',
		);
		// A copy naming no layout gets no invented clause.
		expect(pasteSentence(leaf('Hit dice'), [], null)).toBe('Pasted "Hit dice".');
	});

	it('puts a kept section after what was pasted and before what to check', () => {
		// A note's data outranks a formula to check.
		const kept = 'Kept sentence.';
		expect(pasteSentence(leaf('Portrait'), things('prof'), 'Image variations', kept)).toBe(
			'Pasted "Portrait" from "Image variations". Kept sentence. Check what these mean here: prof.',
		);
		expect(pasteSentence(leaf('Portrait'), [], undefined, kept)).toBe(
			'Pasted "Portrait". Kept sentence.',
		);
		expect(pasteSentence(leaf('Portrait'), [], undefined, null)).toBe('Pasted "Portrait".');
	});

	it('names up to five things, in order, and counts past five', () => {
		expect(
			pasteSentence(leaf('Hit dice'), things('the "long rest" reset', 'mod()', 'prof'), '5e 2014'),
		).toBe(
			'Pasted "Hit dice" from "5e 2014". Check what these mean here: the "long rest" reset, mod(), prof.',
		);
		const five = pasteSentence(leaf('Hit dice'), things('a', 'b', 'c', 'd', 'e'), '5e 2014');
		expect(five).toBe('Pasted "Hit dice" from "5e 2014". Check what these mean here: a, b, c, d, e.');
		const seven = pasteSentence(leaf('Hit dice'), things('a', 'b', 'c', 'd', 'e', 'f', 'g'), '5e 2014');
		expect(seven).toBe(
			'Pasted "Hit dice" from "5e 2014". 7 things it depends on may differ here, so check its formulas and resets.',
		);
		// Neither points at a list, since none is drawn.
		for (const sentence of [five, seven]) {
			expect(sentence).not.toMatch(/list|its settings/);
		}
	});
});

describe('configurationSentence', () => {
	it('says what went onto what', () => {
		expect(configurationSentence('Hit points', 'Temp HP', [], [])).toBe(
			'Pasted the configuration of "Hit points" onto "Temp HP".',
		);
	});

	it('names the keys whose values stop showing, up to five, and counts past five', () => {
		expect(configurationSentence('Abilities', 'Saves', ['STR', 'DEX'], [])).toBe(
			'Pasted the configuration of "Abilities" onto "Saves". Character notes keep any values stored under "STR" and "DEX", which no longer show. Undo brings them back.',
		);
		expect(
			configurationSentence('A', 'B', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], []),
		).toBe(
			'Pasted the configuration of "A" onto "B". Character notes keep any values stored under the 7 keys that changed, which no longer show. Undo brings them back.',
		);
	});

	it('puts the keys before what to check, across layouts', () => {
		expect(configurationSentence('A', 'B', ['CON'], things('prof'))).toBe(
			'Pasted the configuration of "A" onto "B". Character notes keep any values stored under "CON", which no longer show. Undo brings them back. Check what these mean here: prof.',
		);
	});
});
