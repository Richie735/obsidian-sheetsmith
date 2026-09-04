import { describe, expect, it } from 'vitest';
import { fenceLines, readFenced, writeFenced } from './fenced';

const BODY = '\n```sheet\nSTR: 8\nDEX: 16\nWIS: 12\n```\n';

describe('readFenced', () => {
	it('parses key: value entries into raw strings', () => {
		const result = readFenced(BODY);
		expect(result.ok).toBe(true);
		if (result.ok && result.values) {
			expect(Object.fromEntries(result.values)).toEqual({
				STR: '8',
				DEX: '16',
				WIS: '12',
			});
		}
	});

	it('keeps values as raw strings rather than coercing them', () => {
		const result = readFenced('\n```sheet\nname: Bag of Holding\nequipped: yes\n```\n');
		if (result.ok && result.values) {
			expect(result.values.get('name')).toBe('Bag of Holding');
			expect(result.values.get('equipped')).toBe('yes');
		}
		expect(result.ok).toBe(true);
	});

	it('tolerates blank lines and loose spacing inside the fence', () => {
		const result = readFenced('\n```sheet\n\nvalue :  14\n\n```\n');
		expect(result.ok && result.values?.get('value')).toBe('14');
	});

	it('reports a section with no sheet block as empty, not malformed', () => {
		const result = readFenced('\nJust prose.\n');
		expect(result).toEqual({ ok: true, values: null });
		expect(readFenced('')).toEqual({ ok: true, values: null });
	});

	it('errors on a line that is not a key: value entry', () => {
		const result = readFenced('\n```sheet\ncurrent 22\n```\n');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('current 22');
	});

	it('errors on an unclosed fence', () => {
		expect(readFenced('\n```sheet\nvalue: 1\n').ok).toBe(false);
	});

	it('errors on duplicate keys', () => {
		expect(readFenced('\n```sheet\na: 1\na: 2\n```\n').ok).toBe(false);
	});
});

describe('writeFenced', () => {
	it('returns the body unchanged when values match', () => {
		expect(writeFenced(BODY, new Map([['DEX', '16']]))).toBe(BODY);
	});

	it('rewrites only the line whose value changed', () => {
		expect(writeFenced(BODY, new Map([['DEX', '18']]))).toBe(
			BODY.replace('DEX: 16', 'DEX: 18'),
		);
	});

	it('preserves the original spacing around the separator', () => {
		const body = '\n```sheet\nDEX  :\t16\n```\n';
		expect(writeFenced(body, new Map([['DEX', '18']]))).toBe(
			'\n```sheet\nDEX  :\t18\n```\n',
		);
	});

	it('appends a missing key before the closing fence', () => {
		expect(writeFenced(BODY, new Map([['CON', '10']]))).toBe(
			BODY.replace('WIS: 12\n', 'WIS: 12\nCON: 10\n'),
		);
	});

	it('creates a canonical block from a null body', () => {
		expect(writeFenced(null, new Map([['value', '14']]))).toBe(
			'\n```sheet\nvalue: 14\n```\n',
		);
	});

	it('removes an entry when its value is null', () => {
		const body = '\n```sheet\nvalue: 16\nnote: Mage Armor\n```\n';
		expect(writeFenced(body, new Map([['note', null]]))).toBe(
			'\n```sheet\nvalue: 16\n```\n',
		);
	});

	it('does not add an entry for a null value on a missing key', () => {
		expect(writeFenced(BODY, new Map([['note', null]]))).toBe(BODY);
		expect(writeFenced(null, new Map([['value', '1'], ['note', null]]))).toBe(
			'\n```sheet\nvalue: 1\n```\n',
		);
	});

	it('appends a block to a fence-less body, preserving its prose', () => {
		expect(writeFenced('\nJust prose.\n', new Map([['value', '14']]))).toBe(
			'\nJust prose.\n\n```sheet\nvalue: 14\n```\n',
		);
	});

	it('leaves prose around the fence untouched', () => {
		const body = '\nBefore.\n\n```sheet\nvalue: 14\n```\n\nAfter.\n';
		expect(writeFenced(body, new Map([['value', '15']]))).toBe(
			body.replace('value: 14', 'value: 15'),
		);
	});

	it('preserves CRLF line endings', () => {
		const body = BODY.replace(/\n/g, '\r\n');
		expect(writeFenced(body, new Map([['DEX', '18']]))).toBe(
			body.replace('DEX: 16', 'DEX: 18'),
		);
	});
});

describe('fenceLines', () => {
	/*
	 * For the component whose section holds a fence and something else. §10's
	 * third exception has the round trip holding this — `passport.test.ts` is
	 * where a fence and an embed come back byte for byte — and these are the two
	 * things that round trip cannot show: which lines a fence occupies, and that
	 * an unclosed one swallows the rest rather than letting a caller read fence
	 * contents as prose.
	 */
	it('names the lines the fence occupies', () => {
		expect(fenceLines(BODY)).toEqual({ open: 1, close: 5 });
	});

	it('reports no fence where there is none', () => {
		expect(fenceLines('\nJust prose.\n')).toBeNull();
		expect(fenceLines('')).toBeNull();
	});

	it('finds a fence with prose on either side of it', () => {
		expect(fenceLines('\nBefore.\n\n```sheet\nvalue: 14\n```\n\nAfter.\n')).toEqual(
			{ open: 3, close: 5 },
		);
	});

	it('takes an unclosed fence as reaching the end of the body', () => {
		// `readFenced` refuses one, so no component meets this through a
		// successful read — but a caller scanning for its *other* value must not
		// read a fence's contents as prose on the way past.
		expect(fenceLines('\n```sheet\nvalue: 1\n')).toEqual({ open: 1, close: 2 });
	});
});
