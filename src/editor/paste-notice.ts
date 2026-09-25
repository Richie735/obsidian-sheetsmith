/*
 * What a paste says afterwards (`docs/features/component-copy-paste.md` §4, §6).
 *
 * One job: the sentences. The `Notice` a paste answers with is the whole of
 * what a cross-layout paste can tell its author — the list it names is written
 * nowhere else — so its words are this feature's one surface and are composed
 * in one place, beside neither the edit (`paste.ts`) nor the pane that shows
 * them (`layout-editor.ts`).
 *
 * **The second sentence directs only to what exists.** Up to five things are
 * named, in the order that puts a reset binding first, since the case this
 * report exists for is a binding whose every name resolves and whose arithmetic
 * is still the other layout's. Past five it counts them and points at the
 * copy's own formulas and resets, which are fields in its configuration panel —
 * not at a list, since none is drawn.
 */

import { spelled, tooManyToName } from '../parse/spelled';
import { ComponentConfig } from '../types';
import { Dependency } from './paste-dependencies';

/**
 * ` from "5e 2014"` on a cross-layout paste, and nothing on a same-layout one —
 * nor on a copy that names no layout, which a hand-made or older wrapper may
 * lack (`parse/component-clipboard.ts` degrades a missing `from` rather than
 * refusing it). No sentence is invented for that case: the paste says what it
 * pasted, and the second sentence still names what to check.
 */
function fromLayout(from: string | null | undefined): string {
	return from === undefined || from === null ? '' : ` from "${from}"`;
}

/** What to check, or nothing where the list is empty. */
function checkSentence(dependencies: readonly Dependency[]): string {
	if (dependencies.length === 0) return '';
	if (tooManyToName(dependencies)) {
		return ` ${dependencies.length} things it depends on may differ here, so check its formulas and resets.`;
	}
	const things = dependencies.map((one) => one.spelled).join(', ');
	return ` Check what these mean here: ${things}.`;
}

/** Every component inside `config`, at any depth. */
function inside(config: ComponentConfig): number {
	return (config.children ?? []).reduce((count, child) => count + 1 + inside(child), 0);
}

/**
 * The sentence after a paste. `from` is absent for a copy from this layout, and
 * the source layout's name — null where the copy named none — for one from
 * another.
 *
 * `adoption` is `section-adoption.ts`'s sentence where the paste landed on
 * labels character notes already hold sections under, or null. **It goes
 * between what was pasted and what to check**, because a note's data outranks
 * a formula to check: the second is a meaning that may differ, the first is a
 * reader's values now shown under a component that did not write them
 * (`docs/features/new-component-adopts-retained-section.md`).
 */
export function pasteSentence(
	root: ComponentConfig,
	dependencies: readonly Dependency[],
	from?: string | null,
	adoption: string | null = null,
): string {
	const held = inside(root);
	const contents =
		held === 0
			? ''
			: held === 1
				? ' with the component inside it'
				: ` with the ${held} components inside it`;
	const kept = adoption === null ? '' : ` ${adoption}`;
	return `Pasted "${root.label}"${fromLayout(from)}${contents}.${kept}${checkSentence(dependencies)}`;
}

/**
 * The sentence after a configuration paste: what went onto what, then the
 * entry keys whose stored values stop showing, then what to check.
 *
 * **"Any" values, because the paste reads no note** and cannot know whether one
 * holds a value under a key. Undo does bring them back: the layout's old key
 * makes the note's unmapped value mapped again (SPEC §10).
 */
export function configurationSentence(
	source: string,
	target: string,
	keysLeft: readonly string[],
	dependencies: readonly Dependency[],
): string {
	// Where it came from is not in this sentence: §6 step 5 spells it without,
	// and the cross-layout half is the sentence naming what to check.
	let sentence = `Pasted the configuration of "${source}" onto "${target}".`;
	if (tooManyToName(keysLeft)) {
		sentence += ` Character notes keep any values stored under the ${keysLeft.length} keys that changed, which no longer show. Undo brings them back.`;
	} else if (keysLeft.length > 0) {
		sentence += ` Character notes keep any values stored under ${spelled(keysLeft)}, which no longer show. Undo brings them back.`;
	}
	return sentence + checkSentence(dependencies);
}
