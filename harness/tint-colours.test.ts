import { describe, expect, it } from 'vitest';
import { TINT_COLOURS } from '../src/types';
// @ts-expect-error: a plain Node module with no declaration, read for its one list.
import { TINT_COLOURS as HARNESS_COLOURS } from './tint-colours.mjs';

describe("the harness's copy of the tint colours", () => {
	it('is the source list, in its order', () => {
		expect(HARNESS_COLOURS).toEqual([...TINT_COLOURS]);
	});
});
