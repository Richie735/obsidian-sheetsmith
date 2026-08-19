// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { conditionMet } from './config-fields';
import { ConfigFieldSpec } from '../types';

/*
 * A conditional field is matched against the controlling field's *effective*
 * value, not the value the config happens to store.
 *
 * The editor omits a key whose value equals its own default, so a condition
 * naming that default is satisfied by the key's absence. Without this, a mode
 * whose ordinary setting is the first option could only ever hide fields in
 * the default case — the opposite of what a default is for.
 */
describe('conditionMet', () => {
	const fields: ConfigFieldSpec[] = [
		{
			key: 'maxSource',
			kind: 'select',
			label: 'Max',
			description: 'Where the maximum comes from.',
			options: ['calculated', 'character'],
		},
		{
			key: 'hideFill',
			kind: 'boolean',
			label: 'Hide fill bar',
			description: 'Leave the bar off the card.',
			default: false,
		},
	];

	it('is met by an absent key whose default is the value asked for', () => {
		expect(
			conditionMet({ key: 'maxSource', equals: 'calculated' }, fields, {}),
		).toBe(true);
	});

	it('is not met by an absent key whose default is something else', () => {
		expect(
			conditionMet({ key: 'maxSource', equals: 'character' }, fields, {}),
		).toBe(false);
	});

	it('lets a stored value win over the default', () => {
		const record = { maxSource: 'character' };
		expect(
			conditionMet({ key: 'maxSource', equals: 'calculated' }, fields, record),
		).toBe(false);
		expect(
			conditionMet({ key: 'maxSource', equals: 'character' }, fields, record),
		).toBe(true);
	});

	it('reads a boolean default the same way', () => {
		expect(conditionMet({ key: 'hideFill', equals: false }, fields, {})).toBe(
			true,
		);
		expect(conditionMet({ key: 'hideFill', equals: true }, fields, {})).toBe(
			false,
		);
	});

	it('refuses a condition naming a field that does not exist', () => {
		// A typo in a component's own config declaration hides the field rather
		// than showing it unconditionally, which is the safer way to be wrong.
		expect(conditionMet({ key: 'nope', equals: 'x' }, fields, {})).toBe(false);
	});
});
