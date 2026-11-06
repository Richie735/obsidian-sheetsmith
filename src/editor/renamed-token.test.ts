// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renamedToken } from './renamed-token';
import { configToken, idToken, labelToken, positionToken } from './config-panel';
import { previewToken } from './canvas';
import { disclosureToken, menuToken, rowToken } from './tree';

describe('renamedToken', () => {
	it('follows the id in every shape that names a component', () => {
		for (const shape of [idToken, labelToken, rowToken, previewToken, disclosureToken, menuToken]) {
			expect(renamedToken(shape('pool'), 'pool', 'hp')).toBe(shape('hp'));
		}
		expect(renamedToken(configToken('pool', 'max'), 'pool', 'hp')).toBe(configToken('hp', 'max'));
		expect(renamedToken(positionToken('pool', 'col'), 'pool', 'hp')).toBe(positionToken('hp', 'col'));
	});

	it('never rewrites a word of the prefix spelled like the id', () => {
		expect(renamedToken(disclosureToken('group'), 'disclosure', 'x')).toBe(disclosureToken('group'));
		expect(renamedToken(disclosureToken('disclosure'), 'disclosure', 'x')).toBe(disclosureToken('x'));
		expect(renamedToken(menuToken('group'), 'menu', 'x')).toBe(menuToken('group'));
		expect(renamedToken(configToken('group', 'label'), 'label', 'x')).toBe(configToken('group', 'label'));
	});

	it('leaves a token naming another component, or none, as it was', () => {
		expect(renamedToken(idToken('level'), 'pool', 'hp')).toBe(idToken('level'));
		expect(renamedToken('layout-picker', 'pool', 'hp')).toBe('layout-picker');
		expect(renamedToken(configToken('poolside', 'max'), 'pool', 'hp')).toBe(configToken('poolside', 'max'));
	});
});
