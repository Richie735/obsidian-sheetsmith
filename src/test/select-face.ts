/*
 * The face `ui/select-face.ts` draws beside a select, found from the select, for
 * every test that checks a family draws one (`docs/PATTERNS.md` §10: a lookup
 * spelled in three test files is a shared helper).
 */

import { SELECT_FACE_CLASS } from '../ui/select-face';

/** The face beside `select` in its stack, or null where it has none. */
export function faceOf(select: Element | null | undefined): HTMLElement | null {
	return select?.parentElement?.querySelector<HTMLElement>(`:scope > .${SELECT_FACE_CLASS}`) ?? null;
}
