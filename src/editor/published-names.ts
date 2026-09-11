/*
 * What a component publishes, as an inventory at the top of its form.
 *
 * One job: turn what a component declares into the names a formula elsewhere on
 * the sheet can write, each one copyable. It replaces the single line that said
 * `Formulas reference this component as <id>` — true of a Card and misleading
 * of everything else, since a Card set publishes no bare id at all and a Record
 * set publishes no name of any kind.
 *
 * **It is the copy budget being spent where the names are rather than in a
 * footnote** (`SPEC` §13). The panel used to teach the grammar as a pattern —
 * `"<component id>.<column key>"` — under the list where a key is typed; a
 * reader then had to substitute two placeholders correctly to get a string they
 * could have copied. So the pattern goes and the real names arrive, and the
 * three footnotes that spelled it lose that clause.
 *
 * **It draws from `vocabularySource`, which is `modifierTargetSource`**, so this
 * surface and the popup and the target picker cannot disagree about what a
 * layout publishes: one assembly, three readers (`formula/modifier-targets.ts`).
 */

import { copyableName } from './copyable-name';
import { AGGREGATE_NAMES } from '../formula/expression';
import {
	PublishedEntry,
	publishedEntries,
} from '../formula/modifier-targets';
import { VocabularySource } from '../formula/vocabulary';

/**
 * Draw the inventory into a block of its own.
 *
 * Three states, and the third is why this is a module rather than a loop at the
 * call site: a component that publishes nothing says so, where the line it
 * replaced offered a copyable id that no formula could have used.
 */
export function renderPublishedNames(
	into: HTMLElement,
	source: VocabularySource,
): void {
	// The one walk over what a component publishes, which is the target picker's
	// and the suggester's too: three readers of one assembly rather than three
	// spellings of it (`formula/modifier-targets.ts`).
	const names = publishedEntries(source);

	if (names.length === 0 && !source.rows) {
		into.appendText('Formulas cannot read this component.');
		return;
	}

	if (names.length > 0) {
		into.appendText('Formulas read this component as');
		const block = into.createDiv('sheetsmith-published-names');
		for (const name of names) renderGroup(block, name);
	}

	/*
	 * **The calls get a run and a clause of their own, never the tail of the
	 * names.** A published name and `sum(<id>, …)` are different kinds of thing —
	 * one is a name, the other a call template whose copy deliberately stops
	 * inside the second argument — and drawn in the same flex run at the same
	 * gap, colour and size, the second reads as one more name. Forced colors is
	 * where that was caught: `count(inventory, …)` wrapped alone onto a line and
	 * became a fourth name group.
	 *
	 * So a component with both says two sentences, and one with rows alone says
	 * only the second — which is what it always said, since there is nothing to
	 * read it *as*, only something to read it *with*.
	 */
	if (source.rows) {
		into.appendText(
			names.length === 0
				? 'Formulas read this component with'
				: 'and read its rows with',
		);
		renderAggregates(into.createDiv('sheetsmith-published-names'), source.id);
	}
}

/**
 * One name and the forms built on it, as a group that never breaks across a
 * line.
 *
 * The forms show only the part they add and copy the whole composed name, so a
 * reader sees the shape of the family — a name, what it stores, what is left of
 * it, what can be pushed at it — rather than four near-identical strings.
 */
function renderGroup(block: HTMLElement, published: PublishedEntry): void {
	const group = block.createSpan('sheetsmith-published-name');
	// The class the *name's* own rank hangs off. Obsidian shrinks every `code` in
	// a `.setting-item-description` to `--font-smaller`, so without this the
	// string an author opened the panel to read is the smallest type in the pane.
	copyableName(group, published.name).addClass('sheetsmith-published-key');
	form(group, '.value', `${published.name}.value`);
	// SPEC §5: `.left` is published only by an entry that has a ceiling to count
	// against, which is the entry itself saying so.
	if (published.entry.left !== undefined) {
		form(group, '.left', `${published.name}.left`);
	}
	form(group, 'mod.', `mod.${published.name}`);
}

function form(group: HTMLElement, shown: string, full: string): void {
	// The class goes on afterwards rather than through the helper: what it
	// carries is a rank in this block, which is this module's business and not
	// something a copyable name has an opinion about anywhere else.
	copyableName(group, full, { shown, title: full }).addClass(
		'sheetsmith-published-form',
	);
}

/**
 * The two aggregates, where the component has rows for one to walk.
 *
 * They copy the call up to the second argument — `sum(inventory, ` — so the
 * paste lands the caret where the expression goes, and they show the argument as
 * an ellipsis so what is copied and what is still to be typed are visibly
 * different things.
 */
function renderAggregates(block: HTMLElement, id: string): void {
	// The language's own list rather than two literals: a third aggregate would
	// otherwise parse, evaluate, and be offered nowhere.
	for (const call of AGGREGATE_NAMES) {
		const group = block.createSpan('sheetsmith-published-name');
		// The name rank, not the form rank: a form chip is a suffix that only
		// makes sense beside the name above it, and one of these is a whole
		// string an author copies — the *only* content of the block on a
		// component that publishes rows and no names, where the form rank would
		// put a block's primary content at the smallest type in the pane.
		copyableName(group, `${call}(${id}, `, {
			shown: `${call}(${id}, …)`,
		}).addClass('sheetsmith-published-key');
	}
}
