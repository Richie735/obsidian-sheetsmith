/*
 * Component registry. Adding a component means implementing the five-part
 * contract (SPEC §4.1) in its own file and adding one line here.
 */

import { ComponentDefinition } from '../types';
import { skillCard } from './skill-card';
import { stat } from './stat';
import { statGroup } from './stat-group';

const registry = new Map<string, ComponentDefinition>();

function register(component: ComponentDefinition): void {
	registry.set(component.type, component);
}

register(skillCard);
register(stat);
register(statGroup);

/** The component definition for a layout `type`, or undefined if unknown. */
export function getComponent(type: string): ComponentDefinition | undefined {
	return registry.get(type);
}

/** All registered component types, for the layout editor's add menu. */
export function listComponentTypes(): string[] {
	return [...registry.keys()];
}
