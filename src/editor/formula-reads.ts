/*
 * Every name a layout's formulas read, for the layout editor's sample values.
 *
 * A sample fills a component's own vocabulary with filler, and for most of it
 * the filler's kind follows from the component: a Card's value is a number, a
 * Table's text column is text. A Passport field is the exception. Its value is
 * a word about a person ("Species"), so it samples the field's own name, and
 * that is right until a formula reads it: the 5e starter's `level = passport.level`
 * then fails on the word "Level", and every proficiency, save, slot and hit-dice
 * number on the canvas draws "?". Whether a field holds a number is not in its
 * config. Whether a formula reads it is in the layout, and this is the one
 * place that looks.
 *
 * The sites are the ones `id-rename.ts` rewrites: each component's declared
 * formulas, each modifier definition's amount and condition, and the body of
 * every function. Each read is kept as its whole dotted path (`passport.level`),
 * so a component asks about one entry of its own rather than about its id.
 */

import { getComponent } from '../components';
import { nameSpans } from '../formula/expression';
import { definitionParts } from '../formula/functions';
import { visitFormulaFields } from '../formula/resolve';
import { Layout } from '../parse/layout';
import { walkLayout } from '../view/grid-cells';

/** The dotted names a sample is told no formula reads: the picker's preview. */
export const NO_READS: ReadonlySet<string> = new Set();

/** Every dotted name read anywhere in `layout`'s formulas. Calls are not reads. */
export function formulaReads(layout: Layout): ReadonlySet<string> {
	const reads = new Set<string>();
	const scan = (source: unknown): void => {
		if (typeof source !== 'string') return;
		for (const span of nameSpans(source) ?? []) {
			if (!span.call) reads.add(span.text);
		}
	};
	for (const { config } of walkLayout(layout.components)) {
		const definition = getComponent(config.type);
		if (definition === undefined) continue;
		visitFormulaFields(definition, config, (source) => scan(source));
	}
	for (const raw of layout.modifiers ?? []) {
		const definition = raw as unknown as Record<string, unknown>;
		scan(definition.amount);
		scan(definition.when);
		if (Array.isArray(definition.changes)) {
			for (const change of definition.changes as unknown[]) {
				if (typeof change === 'object' && change !== null) {
					scan((change as Record<string, unknown>).amount);
				}
			}
		}
	}
	for (const line of layout.functions ?? []) {
		const parts = definitionParts(line);
		if (parts !== null) scan(line.slice(parts.bodyStart));
	}
	return reads;
}
