import { describe, expect, it } from 'vitest';
import { completionAt } from './completion';

describe('the fragment under the caret', () => {
	it('is the run of name characters around it', () => {
		expect(completionAt('10 + abil', 9)).toEqual({
			start: 5,
			end: 9,
			path: [],
			prefix: 'abil',
		});
	});

	it('extends in both directions from a caret inside a name', () => {
		const found = completionAt('abilities.DEX + 1', 4);
		expect(found?.start).toBe(0);
		expect(found?.end).toBe(13);
	});

	it('is nothing inside a number literal', () => {
		expect(completionAt('10 + abil', 2)).toBeNull();
	});

	it('is nothing where the caret follows a space', () => {
		expect(completionAt('10 + abil', 4)).toBeNull();
	});

	it('refuses a fragment beginning with a digit, whatever follows it', () => {
		// The check is on the fragment's first character, so a dice expression
		// is silent while the name that looks like half of one is not.
		expect(completionAt('2d6', 3)).toBeNull();
		expect(completionAt('d6', 2)?.prefix).toBe('d6');
	});

	it('opens the next level on the dot itself', () => {
		expect(completionAt('abilities.', 10)).toEqual({
			start: 0,
			end: 10,
			path: ['abilities'],
			prefix: '',
		});
	});

	it('carries every segment before the last dot as the path', () => {
		expect(completionAt('mod.abilities.ST', 16)).toEqual({
			start: 0,
			end: 16,
			path: ['mod', 'abilities'],
			prefix: 'ST',
		});
	});

	it('is nothing in empty text', () => {
		expect(completionAt('', 0)).toBeNull();
	});

	it('clamps a caret outside the text rather than reading past it', () => {
		// Both ends clamp into the string, so a caret the caller could not have
		// produced answers about the text that is there rather than about
		// nothing — the fragment then extends from the clamped position, which
		// is the same run either way here.
		expect(completionAt('abil', 99)?.prefix).toBe('abil');
		expect(completionAt('abil', -3)?.prefix).toBe('abil');
	});
});

describe('the aggregate the caret is inside', () => {
	it('names the table and the argument', () => {
		expect(completionAt('sum(inventory, Qty * We', 23)?.aggregate).toEqual({
			table: 'inventory',
			argument: 1,
		});
	});

	it('reads the first argument as argument 0', () => {
		expect(completionAt('sum(inv', 7)?.aggregate).toEqual({
			table: 'inv',
			argument: 0,
		});
	});

	it('looks past a nested call rather than reading it as the aggregate', () => {
		expect(completionAt('sum(inventory, floor(We', 23)?.aggregate).toEqual({
			table: 'inventory',
			argument: 1,
		});
	});

	it('counts a comma inside a nested call as none of its own', () => {
		expect(completionAt('sum(inventory, min(1, We', 24)?.aggregate).toEqual({
			table: 'inventory',
			argument: 1,
		});
	});

	it('is nothing once the call is closed', () => {
		expect(
			completionAt('count(inventory, equipped) + Wei', 32)?.aggregate,
		).toBeUndefined();
	});

	it('is nothing where the enclosing call is not an aggregate', () => {
		expect(completionAt('floor(abil', 10)?.aggregate).toBeUndefined();
	});

	it('reads the outer aggregate from inside a second one', () => {
		// The inner call is closed before the caret, so its `(` is met as a
		// depth-raising `)` first and never mistaken for the enclosing one.
		expect(
			completionAt('sum(items, count(traits, worn) + We', 34)?.aggregate,
		).toEqual({ table: 'items', argument: 1 });
	});

	it('gives an empty table where the reference has not been typed yet', () => {
		expect(completionAt('sum(, We', 8)?.aggregate).toEqual({
			table: '',
			argument: 1,
		});
	});
});

describe('no input makes it throw', () => {
	it('answers for every caret position of random language text', () => {
		// `docs/PATTERNS.md` §10: this is the claim the module's header makes
		// that nothing else could falsify, since the caller calls it on every
		// keystroke of text a parser would reject.
		const alphabet = [...'abc_.,()+-*/ 0123456789'];
		let seed = 7;
		const random = () => {
			// A fixed generator, so a failure is reproducible rather than a
			// once-seen red in someone's terminal.
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};
		let checked = 0;
		for (let run = 0; run < 300; run++) {
			const length = Math.floor(random() * 24);
			let text = '';
			for (let i = 0; i < length; i++) {
				text += alphabet[Math.floor(random() * alphabet.length)] as string;
			}
			for (let caret = 0; caret <= text.length; caret++) {
				const answer = completionAt(text, caret);
				expect(answer === null || typeof answer.prefix === 'string').toBe(true);
				checked += 1;
			}
		}
		// Not a vacuous pass: a generator that produced nothing but empty
		// strings would satisfy every assertion above (§10).
		expect(checked).toBeGreaterThan(1000);
	});
});
