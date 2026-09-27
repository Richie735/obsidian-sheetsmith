import { describe, expect, it } from 'vitest';
import { levelReorderNotice } from './level-reorder';

const RECHARGES = ['None', 'Short rest', 'Long rest', 'Always-on'];

describe('levelReorderNotice', () => {
	it('names one moved level and the one field reading it', () => {
		expect(
			levelReorderNotice(
				'Recharges',
				{ levels: RECHARGES },
				{ levels: ['None', 'Short rest', 'Always-on', 'Long rest'] },
				['Active'],
			),
		).toBe(
			'"Recharges" levels moved: "Long rest" was 2 and is now 3; "Always-on" was 3 and is now 2. The condition on "Active" reads Recharges by position, so it now means something else. Check it under Shown when.',
		);
	});

	it('names every reader, and counts past three moves', () => {
		const said = levelReorderNotice(
			'Rank',
			{ levels: ['A', 'B', 'C', 'D', 'E'] },
			{ levels: ['E', 'D', 'C', 'B', 'A'] },
			['Uses', 'Active', 'DC'],
		);
		expect(said).toContain('"A" was 0 and is now 4; "B" was 1 and is now 3; "D" was 3 and is now 1; and 1 more.');
		expect(said).toContain('The conditions on "Uses", "Active" and "DC" read Rank by position, so they now mean something else. Check them under Shown when.');
	});

	it('says nothing where a level is renamed in place', () => {
		expect(
			levelReorderNotice(
				'Recharges',
				{ levels: RECHARGES },
				{ levels: ['None', 'Short rest', 'Long rest', 'Permanent'] },
				['Active'],
			),
		).toBeNull();
	});

	it('ignores a mark changing, which is not the name', () => {
		expect(
			levelReorderNotice(
				'Rank',
				{ levels: ['Untrained', 'Trained', 'Expert'] },
				{ levels: ['Untrained', 'Trained:', 'Expert:★'] },
				['Uses'],
			),
		).toBeNull();
	});

	it('reports a shortened list, named or not', () => {
		expect(
			levelReorderNotice('Recharges', { levels: RECHARGES }, { levels: RECHARGES.slice(0, 3) }, [
				'Active',
			]),
		).toBe(
			'"Recharges" levels shortened: the highest is now 2, where it was 3. The condition on "Active" reads Recharges by position, so it now means something else. Check it under Shown when.',
		);
		expect(levelReorderNotice('Tier', { max: 4 }, { max: 2 }, ['Uses'])).toContain(
			'shortened: the highest is now 2, where it was 4',
		);
		expect(levelReorderNotice('Tier', { max: 2 }, { max: 4 }, ['Uses'])).toBeNull();
	});

	it('reports a move and a shortening in one sentence', () => {
		expect(
			levelReorderNotice(
				'Recharges',
				{ levels: RECHARGES },
				{ levels: ['None', 'Long rest', 'Short rest'] },
				['Uses'],
			),
		).toContain('moved: "Short rest" was 1 and is now 2; "Long rest" was 2 and is now 1; and shortened: the highest is now 2, where it was 3.');
	});

	it('says nothing where no condition reads the list', () => {
		expect(
			levelReorderNotice('Recharges', { levels: RECHARGES }, { levels: [...RECHARGES].reverse() }, []),
		).toBeNull();
	});

	/*
	 * A reset's **Only where** reads a level by position too
	 * (`docs/features/record-set-reset-scope.md`).
	 */
	const MOVED = { levels: ['None', 'Short rest', 'Always-on', 'Long rest'] };

	it('adds a clause for the resets reading the key, beside the fields', () => {
		expect(
			levelReorderNotice('Recharges', { levels: RECHARGES }, MOVED, ['Active'], ['Short rest']),
		).toBe(
			'"Recharges" levels moved: "Long rest" was 2 and is now 3; "Always-on" was 3 and is now 2. The condition on "Active" reads Recharges by position, so it now means something else. Check it under Shown when. The Short rest reset reads it by position too, so what it resets has changed. Check it under Only where.',
		);
	});

	it('leaves the field clause out where only resets read it', () => {
		expect(
			levelReorderNotice('Recharges', { levels: RECHARGES }, MOVED, [], ['Short rest', 'Long rest']),
		).toBe(
			'"Recharges" levels moved: "Long rest" was 2 and is now 3; "Always-on" was 3 and is now 2. The Short rest and Long rest resets read Recharges by position, so what they reset has changed. Check them under Only where.',
		);
	});

	it('says nothing for a reset where a level is renamed in place', () => {
		expect(
			levelReorderNotice(
				'Recharges',
				{ levels: RECHARGES },
				{ levels: ['None', 'Short rest', 'Long rest', 'Permanent'] },
				[],
				['Short rest'],
			),
		).toBeNull();
	});
});

