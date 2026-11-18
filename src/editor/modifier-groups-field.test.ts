import { describe, expect, it } from 'vitest';
import { memberLine } from './modifier-groups-field';

/*
 * What the Modifier groups list says under each usable group
 * (`docs/features/table-row-modifier-target.md` D7, D12). The field itself is
 * driven through the pane in `config-panel.test.ts`; these are its sentences.
 */
describe('memberLine', () => {
	it('counts the members and lists them in its title', () => {
		expect(memberLine(2, ['Saves · str', 'Saves · dex'], [])).toEqual({
			text: '2 values',
			title: 'Saves · str, Saves · dex',
		});
		expect(memberLine(1, ['Perception'], [])).toEqual({ text: '1 value', title: 'Perception' });
	});

	it('says a group with no member holds none', () => {
		expect(memberLine(0, [], [])).toEqual({ text: 'No value is in this group yet.' });
	});

	it('names the tables whose added rows are the only members', () => {
		expect(memberLine(0, [], ['Attacks'])).toEqual({
			text: 'Only rows a character adds to Attacks are in this group.',
		});
		expect(memberLine(0, [], ['Attacks', 'Spells']).text).toBe(
			'Only rows a character adds to Attacks and Spells are in this group.',
		);
	});
});
