/*
 * The sheet's one read of a note into its components: every component the
 * layout walks, read from its section or refused, in walk order.
 *
 * One job, and a module of its own because two callers must read a note one
 * way: the sheet view's render, and the pass that asks the text an edit
 * produces which grants it ended (`grant-ends.ts`). Two reads of one note that
 * disagreed would let that pass clear a record against components the sheet
 * never drew.
 */

import { getComponent } from '../components';
import { CharacterNote, getSection } from '../parse/character';
import { WalkEntry } from '../parse/layout-walk';
import { ReadComponent } from '../formula/sheet';
import { isContainer } from '../types';

/**
 * Every component a note's sections give, read or refused, in walk order: the
 * sheet's one read, shared by the render and the grant pass so the two cannot
 * read a note two ways.
 *
 * A container has no section, so there is nothing to look for and no note body
 * to be misread as its own: unmapped prose under a heading that happens to
 * match a container's label is never even read (SPEC §10).
 */
export function readComponents(note: CharacterNote, walk: readonly WalkEntry[]): ReadComponent[] {
	return walk.map(({ config }) => {
		const component = getComponent(config.type);
		const readable = isContainer(component) ? undefined : component;
		const section = readable ? getSection(note, config.label) : undefined;
		const result = readable && section ? readable.read(section.body, config) : null;
		return {
			config,
			component,
			error: result && !result.ok ? result.error : null,
			data: result?.ok === true ? result.data : null,
		};
	});
}

