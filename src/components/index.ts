/*
 * Component registry. Adding a component means implementing the five-part
 * contract (SPEC §4.1) in its own file and adding one line here.
 */

import { ComponentDefinition } from '../types';
import { pool } from './pool';
import { stat } from './stat';
import { statGroup } from './stat-group';
import { table } from './table';
import { track } from './track';

const registry = new Map<string, ComponentDefinition>();

function register(component: ComponentDefinition): void {
	registry.set(component.type, component);
}

register(pool);
register(stat);
register(statGroup);
register(table);
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
