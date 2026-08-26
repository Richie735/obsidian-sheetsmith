/*
 * What the layout editor calls a component: a type by its id, or one already
 * placed by whatever its own configuration says it is.
 *
 * A module because the two halves of the pane both ask it and neither owns it.
 * `placedComponentName` names a tree row in the outline and a tab row in the
 * panel; `componentDisplayName` is its fallback and the add menu's own naming of
 * types. That is `docs/PATTERNS.md` §1's one-step tier: what is shared here is a
 * *policy* — which of two names a component answers to — so the only thing a
 * two-consumer guard test could assert is that the copies still agree, which is
 * what one name says for free. Spelled twice, the copy that stopped asking the
 * component would be the one nothing was watching.
 *
 * Both functions were `layout-editor.ts`'s while the tree and the panel were one
 * file, and moved out rather than being reached back into: `config-panel.ts`
 * importing them from the editor that draws it would be the inner half naming
 * the outer one, and a value-level cycle to read a two-line function.
 */

import { getComponent } from '../components';
import { ComponentConfig } from '../types';

/**
 * Display name for a component type id: "card-set" → "Card set".
 * Sentence case, per the style guide: only the first word is capitalised.
 */
export function componentDisplayName(type: string): string {
	const words = type.split('-').join(' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What to call a component the layout has already placed.
 *
 * Its type, unless the component says its configuration has a better name —
 * a Card with options is a Dropdown, and an author who picked Dropdown out of
 * the add menu should not be told a line later that they have a Card. The
 * component answers, never this module: whether options make a dropdown is
 * exactly the kind of thing nothing outside a component may know.
 *
 * The add menu keeps `componentDisplayName`, because there it is naming *types*
 * and the prefills are listed under them by name already.
 */
export function placedComponentName(config: ComponentConfig): string {
	const named = getComponent(config.type)?.configName?.(config);
	return named ?? componentDisplayName(config.type);
}
