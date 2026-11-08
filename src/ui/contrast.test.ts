import { describe, expect, it } from 'vitest';
import { contrast, over, parseColour, readColour } from './contrast';

describe('parseColour', () => {
	it('reads rgb, rgba at full alpha and a color-mix result', () => {
		expect(parseColour('rgb(255, 0, 0)')).toEqual([1, 0, 0]);
		expect(parseColour('rgba(0, 0, 255, 1)')).toEqual([0, 0, 1]);
		expect(parseColour('color(srgb 0.5 0.25 1)')).toEqual([0.5, 0.25, 1]);
	});

	it('reads nothing it would have to guess at', () => {
		expect(parseColour('rgba(0, 0, 0, 0)')).toBeNull();
		expect(parseColour('color(srgb 1 1 1 / 0.5)')).toBeNull();
		expect(parseColour('transparent')).toBeNull();
		expect(parseColour('')).toBeNull();
	});
});

describe('contrast', () => {
	it('measures WCAG 2 ratios in either order', () => {
		expect(contrast([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5);
		expect(contrast([1, 1, 1], [1, 1, 1])).toBeCloseTo(1, 5);
		// White on the default light theme's accent, the tag's old 3.43:1.
		const accent = parseColour('rgb(152, 115, 247)');
		expect(accent).not.toBeNull();
		if (accent) expect(contrast([1, 1, 1], accent)).toBeCloseTo(3.43, 1);
	});
});

describe('readColour and over', () => {
	it('reads alpha, and composites a layer as the browser does', () => {
		expect(readColour('color(srgb 1 0 0 / 0.75)')).toEqual({ rgb: [1, 0, 0], alpha: 0.75 });
		expect(readColour('rgba(0, 0, 0, 0)')).toEqual({ rgb: [0, 0, 0], alpha: 0 });
		expect(readColour('rgb(255, 255, 255)')).toEqual({ rgb: [1, 1, 1], alpha: 1 });
		expect(over([1, 0, 0], 0.75, [0, 0, 1])).toEqual([0.75, 0, 0.25]);
	});

	it('finds black or white at 4.58:1 or better on any opaque colour', () => {
		for (let v = 0; v <= 1; v += 1 / 64) {
			for (const c of [[v, v, v], [v, 0, 0], [0, v, 0], [0, 0, v], [1, v, 0]] as const) {
				expect(Math.max(contrast(c, [0, 0, 0]), contrast(c, [1, 1, 1]))).toBeGreaterThanOrEqual(4.58);
			}
		}
	});
});
