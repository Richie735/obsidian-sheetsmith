import { describe, expect, it } from 'vitest';
import { codeLines, storedLines } from './field-lines';

/*
 * A file of its own, against §10's preference for driving a shared vocabulary
 * through its consumers, and the condition is why: "what the module owns has to
 * actually be driven somewhere." Half of what this owns had no driver at all.
 * `storedLines` is exercised by the trigger and bonus-type field tests, and
 * `codeLines` by nothing — `function-library-field.ts` has no test file, which is
 * the pre-existing gap now recorded in `PATTERNS.md` §11. The difference between
 * the two rules is the whole reason this module exists, so it is asserted here
 * rather than left to the one consumer that cannot check it.
 */

describe('what the two rules share', () => {
	it.each([
		['storedLines', storedLines],
		['codeLines', codeLines],
	])('%s drops trailing blank lines', (_name, read) => {
		expect(read('item\nstatus\n\n\n')).toEqual(['item', 'status']);
	});

	it.each([
		['storedLines', storedLines],
		['codeLines', codeLines],
	])('%s keeps a blank in the middle', (_name, read) => {
		// Every parser here reports one, and a line deleted with nothing said is
		// worse than a named mistake.
		expect(read('item\n\nstatus')).toEqual(['item', '', 'status']);
	});

	it.each([
		['storedLines', storedLines],
		['codeLines', codeLines],
	])('%s reads an empty field as no lines at all', (_name, read) => {
		// Which is what takes the key out of the layout rather than storing `[]`.
		expect(read('')).toEqual([]);
		expect(read('\n\n')).toEqual([]);
	});
});

describe('where the two rules differ, and it is on purpose', () => {
	it('trims a stored identifier at both ends', () => {
		// A bonus type is matched byte for byte against a modifier definition's
		// `bonusType` and a trigger name against a binding's own, so `  item`
		// surviving as a separate entry makes two types that stack with nothing on
		// screen saying why.
		expect(storedLines('  item  \n\tstatus')).toEqual(['item', 'status']);
	});

	it('keeps the leading layout of a line of code', () => {
		/*
		 * The difference this module was written to name. `parseFunctions` trims
		 * each line before reading it, so leading space changes no arithmetic —
		 * what it changes is the file, and indentation an author typed is theirs.
		 */
		expect(codeLines('  mod(score) = 1  ')).toEqual(['  mod(score) = 1']);
	});

	it('is the difference a copier used to have to guess', () => {
		// Stated as one assertion, because the drift was that three copies held
		// two rules and nothing said which applied where.
		const indented = '   x';
		expect(storedLines(indented)).toEqual(['x']);
		expect(codeLines(indented)).toEqual(['   x']);
	});
});
