/*
 * A focus token carried across a component id rename
 * (`docs/features/component-id-rename.md` §4).
 *
 * One job: answer the token a control will carry once the component it belongs
 * to is called `to` instead of `from`, so focus lands back on the same control
 * after the redraw, an undo or a redo.
 *
 * **By the token's shape, never by searching it for the id.** A token is a
 * prefix and an id, and a prefix may be several words: `tree-disclosure-<id>`.
 * Rewriting the first hyphen segment equal to the id rewrote the prefix
 * instead wherever an id was spelled like one of its words — a component called
 * `disclosure` turned every chevron's token into another component's. So only
 * the shapes that name a component are known here, each from the function that
 * mints it, and any other token comes back as it was:
 * focus that cannot follow is dropped, which is what a redraw already does.
 */

import { GRID_POSITION_KEYS } from '../types';
import { configToken, idToken, labelToken, positionToken } from './config-panel';
import { previewToken } from './canvas';
import { disclosureToken, menuToken, rowToken } from './tree';

/** Tokens that are a prefix and the id, each from the function that mints it. */
const WHOLE: readonly ((id: string) => string)[] = [
	idToken,
	labelToken,
	rowToken,
	previewToken,
	disclosureToken,
	menuToken,
	...GRID_POSITION_KEYS.map((key) => (id: string) => positionToken(id, key)),
];

/**
 * Tokens that are a prefix, the id, and a field's own key, as the prefix their
 * minting function gives with no key: `cfg-<id>-`.
 */
const KEYED: readonly ((id: string) => string)[] = [(id) => configToken(id, '')];

/** `token` as it reads once `from` is called `to`, or `token` where it names no component. */
export function renamedToken(token: string, from: string, to: string): string {
	for (const shape of WHOLE) if (token === shape(from)) return shape(to);
	for (const shape of KEYED) {
		const head = shape(from);
		if (token.startsWith(head)) return shape(to) + token.slice(head.length);
	}
	return token;
}
