/*
 * Component registry. Adding a component means implementing the five-part
 * contract (SPEC §4.1) in its own file and adding one line here.
 */

import {
	ComponentConfig,
	ComponentDefinition,
	isContainer,
	PaletteEntry,
} from '../types';
import { group } from './group';
import { pool } from './pool';
import { stat } from './stat';
import { statGroup } from './stat-group';
import { table } from './table';
import { tabSet } from './tab-set';
import { track } from './track';

const registry = new Map<string, ComponentDefinition>();

function register(component: ComponentDefinition): void {
	registry.set(component.type, component);
}

register(group);
register(pool);
register(stat);
register(statGroup);
register(table);
register(tabSet);
register(track);

/** The component definition for a layout `type`, or undefined if unknown. */
export function getComponent(type: string): ComponentDefinition | undefined {
	return registry.get(type);
}

/** All registered component types, for the layout editor's add menu. */
export function listComponentTypes(): string[] {
	return [...registry.keys()];
}

/**
 * The ways a type may be offered with its configuration prefilled (SPEC §4.2).
 *
 * The exact analogue of `listComponentTypes()`, and asked per type rather than
 * flattened across the registry because an entry belongs *under* the type it
 * prefills: the palette is the catalog, each block followed by its own
 * prefills, which is what keeps it readable as the entries multiply.
 *
 * Which options a menu holds and how they are drawn stays in the editor. There
 * is one consumer of that today, and PATTERNS §1 is explicit that one consumer
 * earns no module; M4's palette is the second, and it moves then.
 */
export function paletteEntries(type: string): readonly PaletteEntry[] {
	return registry.get(type)?.palette ?? [];
}

/**
 * What to say when a layout names a component type the registry does not have.
 *
 * The list of types is the fix rather than decoration. A layout file is
 * hand-editable and shareable, so the author meeting this message has one
 * question — what word would have worked — and `listComponentTypes()` is
 * already the registry's public answer to it. Naming only the fault leaves
 * them guessing at a vocabulary that is not written down anywhere they can
 * see (`docs/UI.md` §12).
 */
export function unknownComponentMessage(type: string): string {
	return `Unknown component type "${type}". Change it to one of: ${listComponentTypes().join(', ')}.`;
}

/**
 * Why this component cannot be drawn at all, or null where it can.
 *
 * The two cases a layout can reach that no component can report on itself,
 * because both are about the *type* rather than about the config a component
 * owns: a type the registry does not have, and a type that holds a value being
 * handed components to hold.
 *
 * One function because the sheet view and the harness both draw cells, and a
 * check in one and not the other is the divergence that matters most here —
 * appearance is reviewed in the harness, so a harness that quietly drew nothing
 * where the app says why would sign off on a message the plugin never produces.
 * Here rather than in the view because both answers are the registry's: which
 * types exist, and which of them hold components.
 */
export function undrawableMessage(
	config: ComponentConfig,
	component: ComponentDefinition | undefined,
): string | null {
	if (!component) return unknownComponentMessage(config.type);
	const held = config.children?.length ?? 0;
	if (held === 0 || isContainer(component)) return null;
	/*
	 * `children` is shared config the parser walks without knowing any type,
	 * which is what keeps `src/parse/` free of any import from here and makes
	 * the depth rule hold for a container nobody has written yet (SPEC §13).
	 * The cost is this: a hand-edited layout can place cards inside a Stat, the
	 * parser accepts it, the sections are read and the names published, and the
	 * component has nowhere to draw them. Unsaid, that is cards which hold data
	 * and reset on a trigger while being invisible, which is worse than a card
	 * that fails loudly. The editor cannot produce it; a hand edit can.
	 */
	const holders = listComponentTypes().filter((candidate) =>
		isContainer(registry.get(candidate)),
	);
	const cards = held === 1 ? '1 component' : `${held} components`;
	// The label is in the message rather than prefixed onto it, as the view
	// prefixes a failed read: an unlabelled error card is a known gap
	// (docs/UI.md §12) and inventing a second prefix here would not close it.
	return `"${config.label}" is a "${config.type}", which holds a value rather than other components, so the ${cards} inside it cannot be drawn. Move them out of it, or change its type to one of: ${holders.join(', ')}.`;
}
