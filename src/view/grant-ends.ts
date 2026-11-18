/*
 * Clearing what an ended grant had spent, in the write that ended it
 * (`docs/features/granted-temporary-points.md` D7).
 *
 * One job: given the sheet the reader was looking at and the text their edit
 * produces, say which components' spent records belong to grants that edit
 * ended, as edits to add to the same batch. **It is not a second action**: the
 * record is the grant's own bookkeeping, written only by the reader spending
 * through it, so clearing it in the batch of the edit that ended the grant is
 * one write, one save and one rebuild, and SPEC §6's last line still holds.
 *
 * **Generic, by the contract's two members.** A buffer is whatever a component
 * publishes with `ScopeEntry.buffer`, and its records are cleared through its
 * own `endGrants`, so nothing here knows that a Pool has a fence. The read of a
 * note into components is the sheet's own (`read-components.ts`), and the sheet the
 * next text produces is built by the same `buildSheet` the render uses.
 *
 * **Free where no grant has a record.** The recorded grants are read once per
 * render, and an edit on a sheet holding none builds no second walk.
 */

import { CharacterNote, parseCharacter } from '../parse/character';
import { Layout } from '../parse/layout';
import { FunctionLibrary } from '../formula/expression';
import { activeGrantKeys, bufferEntries } from '../formula/modifier-buffers';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { ComponentConfig, ComponentDefinition, ModifierContext } from '../types';
import { walkLayout } from './grid-cells';
import { readComponents } from './read-components';

/** One buffer on the sheet that holds records of grants active there. */
export interface RecordedGrants {
	config: ComponentConfig;
	component: ComponentDefinition;
	/** The buffer's published name. */
	name: string;
	/** The keys of the grants active on this sheet that have a spent record. */
	keys: readonly string[];
}

/**
 * Every buffer on a rendered sheet holding a record of a grant that is active
 * there (D7 step 2). A record whose grant is not active is a leftover (D10): an
 * edit cannot end what was not on, so it is not listed and is never cleared.
 */
export function recordedActiveGrants(
	prepared: readonly ReadComponent[],
	modifiers: ModifierContext,
): readonly RecordedGrants[] {
	const found: RecordedGrants[] = [];
	for (const { config, component, data, error } of prepared) {
		if (component?.endGrants === undefined || error !== null) continue;
		for (const { name, buffer } of bufferEntries(config.id, component.scopeValues?.(data, config) ?? {})) {
			const recorded = Object.keys(buffer.spent);
			// Asked only where a record exists, so a sheet with none walks nothing.
			if (recorded.length === 0) continue;
			const active = activeGrantKeys(modifiers, name);
			if (active === null) continue;
			const keys = recorded.filter((key) => active.has(key));
			if (keys.length > 0) found.push({ config, component, name, keys });
		}
	}
	return found;
}

/** One edit for the batch, as the view's `applyEdits` takes it. */
export interface GrantEndEdit {
	component: ComponentDefinition;
	config: ComponentConfig;
	data: unknown;
}

/**
 * The edits clearing the records of grants the next text has ended (D7 step 3):
 * a recorded grant that is no longer listed at its buffer once the reader's edit
 * is applied. A buffer the next sheet refuses ends nothing, since nothing can
 * say which grants are active there (D11).
 */
export function grantEndEdits(
	recorded: readonly RecordedGrants[],
	layout: Layout,
	library: FunctionLibrary,
	nextText: string,
	/** How the next sheet is built: `buildSheet`, unless a test counts the calls. */
	build: typeof buildSheet = buildSheet,
): readonly GrantEndEdit[] {
	if (recorded.length === 0) return [];
	let note: CharacterNote;
	try {
		note = parseCharacter(nextText);
	} catch {
		return [];
	}
	const prepared = readComponents(note, walkLayout(layout.components));
	const { modifiers } = build(layout, prepared, library);
	const edits: GrantEndEdit[] = [];
	for (const { config, component, name, keys } of recorded) {
		const active = activeGrantKeys(modifiers, name);
		if (active === null) continue;
		const ended = keys.filter((key) => !active.has(key));
		if (ended.length === 0) continue;
		const next = prepared.find((entry) => entry.config.id === config.id);
		if (next === undefined || next.error !== null) continue;
		const data = component.endGrants?.(next.data, config, ended) ?? null;
		if (data !== null) edits.push({ component, config, data });
	}
	return edits;
}
