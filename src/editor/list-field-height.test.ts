// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
	MAX_ROWS,
	MIN_ROWS,
	bindFitToContent,
	fitToContent,
} from './list-field-height';

/*
 * Sizing for the editor's two list-shaped textareas.
 *
 * The bug this exists for was not visible in a unit test and is not visible in
 * one now: ten triggers in a three-row field cut the fourth entry at 46% of its
 * line height, and it was found by measuring a screenshot. What a test can hold
 * is the arithmetic underneath — that the field asks for as many rows as it has
 * lines, between a floor and a ceiling — so the two fields cannot drift apart
 * again on the numbers.
 */

function field(value: string): HTMLTextAreaElement {
	const input = document.createElement('textarea');
	input.value = value;
	return input;
}

/**
 * The rows the field is asking for.
 *
 * Read through `Number` because happy-dom returns the attribute as a string
 * where a real browser's `rows` is a number. The behaviour under test is the
 * count, not its type, and a headless render confirmed the browser sizes the
 * field to it.
 */
function rows(input: HTMLTextAreaElement): number {
	return Number(input.rows);
}

function lines(count: number): string {
	return Array.from({ length: count }, (_, i) => `entry ${i + 1}`).join('\n');
}

describe('fitToContent', () => {
	it('holds the floor for an empty field', () => {
		// A one-row box reads as a text input that happens to take newlines.
		const input = field('');
		fitToContent(input);
		expect(rows(input)).toBe(MIN_ROWS);
	});

	it('holds the floor below it', () => {
		const input = field('Long rest');
		fitToContent(input);
		expect(rows(input)).toBe(MIN_ROWS);
	});

	it('grows to the line count between the bounds', () => {
		for (const count of [4, 7, 10, MAX_ROWS]) {
			const input = field(lines(count));
			fitToContent(input);
			expect(rows(input), `${count} lines`).toBe(count);
		}
	});

	it('stops at the ceiling', () => {
		// Past it the field scrolls, which is the lesser cost: growing without
		// bound would push the rest of the settings tab off the screen.
		const input = field(lines(40));
		fitToContent(input);
		expect(rows(input)).toBe(MAX_ROWS);
	});

	it('counts a trailing blank line, because the field shows one', () => {
		// Enter at the end of the last entry is how the next one gets typed, so
		// the row it will be typed on has to already be there.
		const input = field('Long rest\nShort rest\nDawn\n');
		fitToContent(input);
		expect(rows(input)).toBe(4);
	});
});

describe('bindFitToContent', () => {
	it('fits before any edit, so the first render is right', () => {
		const input = field(lines(6));
		bindFitToContent(input);
		expect(rows(input)).toBe(6);
	});

	it('refits as entries are added and removed', () => {
		const input = field(lines(4));
		bindFitToContent(input);
		expect(rows(input)).toBe(4);

		input.value = lines(9);
		input.dispatchEvent(new Event('input'));
		expect(rows(input)).toBe(9);

		// Shrinking matters as much: a field left tall after a delete is the
		// empty-space half of the same defect.
		input.value = lines(5);
		input.dispatchEvent(new Event('input'));
		expect(rows(input)).toBe(5);
	});
});
