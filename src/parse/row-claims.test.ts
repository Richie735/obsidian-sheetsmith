import { describe, expect, it } from 'vitest';
import { claimRows } from './row-claims';

describe('claimRows', () => {
	it('claims the first note row spelling a declared name', () => {
		const claims = claimRows(['Acrobatics'], ['Acrobatics', 'Acrobatics']);
		expect(claims.declared).toEqual([0]);
		expect(claims.own).toEqual([1]);
	});

	it('matches case-insensitively without changing the note spelling', () => {
		const claims = claimRows(['Acrobatics'], ['acrobatics']);
		expect(claims.declared).toEqual([0]);
		expect(claims.own).toEqual([]);
	});

	it('leaves a declared row unclaimed where the note has no row for it', () => {
		const claims = claimRows(['Acrobatics'], ['Athletics']);
		expect(claims.declared).toEqual([null]);
		expect(claims.own).toEqual([0]);
	});

	it('claims in declared order, so an earlier declared row wins a shared name', () => {
		const claims = claimRows(['Ring', 'Ring'], ['Ring', 'Ring', 'Ring']);
		expect(claims.declared).toEqual([0, 1]);
		expect(claims.own).toEqual([2]);
	});

	it('leaves every row to the character when nothing is declared', () => {
		const claims = claimRows([], ['Dagger', 'Shield']);
		expect(claims.declared).toEqual([]);
		expect(claims.own).toEqual([0, 1]);
	});

	it('claims nothing over an empty note', () => {
		const claims = claimRows(['Acrobatics'], []);
		expect(claims.declared).toEqual([null]);
		expect(claims.own).toEqual([]);
	});
});
