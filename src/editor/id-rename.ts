/*
 * Renaming a component's id, and every place in the layout that reads it
 * (`docs/features/component-id-rename.md`).
 *
 * One job: decide the edit an **Id** commit makes to a layout, on a clone, and
 * answer the new layout or the one sentence saying why not. What the pane does
 * with the answer — adopting it, the posture, the undo step, the notes report —
 * is `layout-editor.ts`'s; this never sees a vault, a note or a leaf.
 *
 * **An id never addresses stored data**, so nothing here can orphan a value:
 * sections key on the label and entries on declared keys (SPEC §3.1). What a
 * rename can do is leave a formula reading a name nobody publishes, which is
 * why every site the spec's audit found is rewritten here in the one write:
 * each component's declared formulas, a modifier definition's targets, amounts
 * and condition, a promoted field's name, and the body of every function.
 * The rewrite is `renameNames` on the tokenizer's own name spans, the paste's
 * reader, so `hp_max` and a row called `hp` are never touched.
 *
 * **What is refused is every rewrite that would read something else
 * afterwards**, with the first such site named (§2's table). A new id a
 * function parameter, a component's own row name, a literal or a bare
 * zero-parameter function would shadow; and, under the spec's point 3 (A), a
 * reference in an aggregate's per-row argument, or a modifier definition's
 * amount or condition, that the walked rows might answer instead. That last is
 * a refusal rather than a rewrite because `componentReferences` does not model
 * the row's scope, and modelling it is the recorded follow-up that would lift
 * it, for the paste as well.
 *
 * **What is never rewritten**, each for the spec's reason: a function's own
 * name, a reset's `trigger` and `column`, a definition's `note`, unknown keys,
 * and a formula that does not tokenize. None of them is reached: the walk below
 * names exactly the sites it rewrites, and `renameNames` hands back text it
 * cannot tokenize unchanged.
 */

import { getComponent } from '../components';
import { LITERAL_NAMES, SELF_KEYWORD } from '../formula/expression';
import { definitionParts, parseFunctions } from '../formula/functions';
import {
	ComponentReference,
	componentReferences,
	renameNames,
} from '../formula/rename-names';
import { visitFormulaFields } from '../formula/resolve';
import { localNames, vocabularySource } from '../formula/vocabulary';
import { idProblem, Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { ComponentConfig } from '../types';
import { walkLayout } from '../view/grid-cells';

/** A rename the layout accepts: the new layout, and how many fields it rewrote. */
export interface IdRenamed {
	layout: Layout;
	/** Fields, not occurrences: a formula reading the id twice is one place. */
	places: number;
}

export type IdRename = IdRenamed | { error: string };

/** Where an expression sits, which decides what can shadow a name in it. */
type SiteKind =
	/** A component's own declared formula, read in that component's scope. */
	| { kind: 'component'; config: ComponentConfig }
	/** A definition's amount or condition, read in each enrolling row's scope. */
	| { kind: 'definition'; name: string }
	/** A function's body, read with its own parameters nearest. */
	| { kind: 'function'; name: string; params: readonly string[] }
	/** A published name: a definition's target, a promoted field. */
	| { kind: 'name' };

/** One text the rename may rewrite, and how to put the rewrite back. */
interface Site {
	where: SiteKind;
	source: string;
	local: ReadonlySet<string>;
	replace: (next: string) => void;
}

const NO_NAMES: ReadonlySet<string> = new Set();

/** A deep copy through JSON, which is all a layout is. */
function cloneOf(layout: Layout): { clone: Layout } | { error: string } {
	try {
		return { clone: parseLayout(serialiseLayout(layout)) };
	} catch (error) {
		const said = error instanceof Error ? error.message : String(error);
		return {
			error: `Not renamed, because this layout does not save as it stands. Fix this first: ${said}`,
		};
	}
}

/**
 * Every text the rename reaches, in walk order: each component's formulas, then
 * the modifier definitions, the promoted fields and the function library.
 */
function sitesOf(layout: Layout): Site[] {
	const sites: Site[] = [];
	for (const { config } of walkLayout(layout.components)) {
		const definition = getComponent(config.type);
		// A type the registry does not know declares no formula fields, so
		// nothing on it is known to be an expression.
		if (definition === undefined) continue;
		const local = localNames(config, definition);
		visitFormulaFields(definition, config, (source, replace) =>
			sites.push({ where: { kind: 'component', config }, source, local, replace }),
		);
	}
	const text = (
		holder: Record<string, unknown>,
		key: string,
		where: SiteKind,
	): void => {
		const value = holder[key];
		if (typeof value !== 'string') return;
		sites.push({
			where,
			source: value,
			local: NO_NAMES,
			replace: (next) => {
				holder[key] = next;
			},
		});
	};
	for (const raw of layout.modifiers ?? []) {
		const definition = raw as unknown as Record<string, unknown>;
		const name = typeof definition.name === 'string' ? definition.name : '';
		const read: SiteKind = { kind: 'definition', name };
		// Both spellings, flat and `changes`, as written: a flat target left
		// beside a `changes` list is ignored by the sheet, and rewriting it too
		// keeps it saying what the list says rather than the old id.
		text(definition, 'target', { kind: 'name' });
		text(definition, 'amount', read);
		text(definition, 'when', read);
		if (Array.isArray(definition.changes)) {
			for (const change of definition.changes as unknown[]) {
				if (typeof change !== 'object' || change === null) continue;
				const holder = change as Record<string, unknown>;
				text(holder, 'target', { kind: 'name' });
				text(holder, 'amount', read);
			}
		}
	}
	for (const raw of layout.promotedFields ?? []) {
		text(raw as unknown as Record<string, unknown>, 'name', { kind: 'name' });
	}
	const functions = layout.functions;
	functions?.forEach((line, index) => {
		const parts = definitionParts(line);
		if (parts === null) return;
		sites.push({
			where: { kind: 'function', name: parts.name, params: parts.params },
			source: line.slice(parts.bodyStart),
			local: new Set(parts.params),
			replace: (next) => {
				functions[index] = line.slice(0, parts.bodyStart) + next;
			},
		});
	});
	return sites;
}

/** The references in a site that name `id`. */
function readsOf(site: Site, id: string): ComponentReference[] {
	return (componentReferences(site.source, site.local) ?? []).filter(
		(reference) => reference.id === id,
	);
}

/**
 * Whether a reference is read as a plain name — a scope lookup a nearer name
 * could answer — rather than as a slot (`mod.<id>`) or a table to walk. Both
 * marks are `componentReferences`' own, so this reads the grammar the rewrite
 * reads rather than a second spelling of it.
 */
function lookedUp(reference: ComponentReference): boolean {
	return reference.slot !== true && reference.walkedBy === undefined;
}

/** How a sentence names where a site lives. */
function siteName(where: SiteKind): string {
	switch (where.kind) {
		case 'component':
			return where.config.label;
		case 'definition':
			return `the modifier "${where.name}"`;
		case 'function':
			return where.name;
		case 'name':
			return 'a promoted field';
	}
}

/**
 * What `name` is on `config`, as the per-row refusal says it: the phrase, and
 * the noun its fix renames. The component's own word for the entry — a Table's
 * column, a Record set's field, a row value — and `value`, the one local no list
 * declares, as the component's own name.
 */
function ownNameOf(config: ComponentConfig, name: string): { phrase: string; noun: string } {
	const row = vocabularySource(config, getComponent(config.type)).rowNames.find(
		(entry) => entry.name === name,
	);
	if (row === undefined) {
		return { phrase: `one of ${config.label}'s own names`, noun: 'name' };
	}
	return { phrase: `a ${row.noun} on ${config.label}`, noun: row.noun };
}

/** The point 3 sentence, for a name the walked rows answer. */
function perRowSentence(
	shadowed: string,
	rows: ComponentConfig,
	reader: string,
	eachRow: string,
): string {
	const { phrase, noun } = ownNameOf(rows, shadowed);
	return `"${shadowed}" is also ${phrase}, and ${reader} reads it from ${eachRow}, so this rename cannot tell which one it means. Rename that ${noun} first, or the component to something else.`;
}

/** Why the id may not be `to`, from the parser's own check, or null. */
function parserRule(kind: ReturnType<typeof idProblem>, to: string): string | null {
	switch (kind) {
		case 'blank':
			return 'An id is required.';
		case 'name':
			return 'An id is letters, digits and underscores, and does not start with a digit.';
		case 'reserved':
			return to === SELF_KEYWORD
				? '"self" means a roster\'s own rows, so a component cannot use it.'
				: '"mod" is where modifier slots live, so a component cannot use it.';
		default:
			return null;
	}
}

/**
 * Rename the component `from` to `to` in a clone of `layout`, rewriting every
 * reference to it, or answer the first reason it may not be.
 */
export function renameComponentId(layout: Layout, from: string, to: string): IdRename {
	const cloned = cloneOf(layout);
	if ('error' in cloned) return cloned;
	const candidate = cloned.clone;
	const walk = walkLayout(candidate.components);
	const renamed = walk.find((entry) => entry.config.id === from)?.config;
	if (renamed === undefined) return { error: 'That component is no longer in this layout.' };

	// The parser's rules first, in its own order, with the literal between the
	// word rules and the taken one where §2's table puts it.
	const problem = idProblem(candidate.components, to, renamed);
	const said = parserRule(problem, to);
	if (said !== null) return { error: said };
	if (LITERAL_NAMES.includes(to)) {
		return {
			error: `"${to}" is a value, so formulas reading it would never reach this component.`,
		};
	}
	if (problem === 'taken') return { error: `"${to}" is already another component's id.` };

	const sites = sitesOf(candidate);
	const byId = new Map(walk.map((entry) => [entry.config.id, entry.config]));

	// Capture by a function's own parameter: the rewritten read would be the
	// parameter's, inside the body, and stop reaching the component.
	for (const site of sites) {
		if (site.where.kind !== 'function' || !site.where.params.includes(to)) continue;
		if (readsOf(site, from).some((reference) => lookedUp(reference))) {
			return {
				error: `"${to}" is a parameter of ${site.where.name}(), which reads "${from}", so that read would stop reaching this component.`,
			};
		}
	}
	// Capture by a component's own name: `value`, a row name, a column key.
	for (const site of sites) {
		if (site.where.kind !== 'component' || !site.local.has(to)) continue;
		if (readsOf(site, from).some((reference) => lookedUp(reference))) {
			return {
				error: `${site.where.config.label} reads "${to}" as one of its own names, so its formula reading "${from}" would stop reaching this component.`,
			};
		}
	}
	// Capture *from* a function: a component answers a bare name before a
	// zero-parameter function does, so the renamed component would take every
	// read of it — sites this rename does not rewrite, which is why nothing on
	// screen would have moved.
	const zeroParameter = parseFunctions(candidate.functions).library.get(to);
	if (zeroParameter !== undefined && zeroParameter.params.length === 0) {
		const readsBare = sites.some((site) =>
			readsOf(site, to).some(
				(reference) =>
					lookedUp(reference) && site.source[reference.end] !== '.',
			),
		);
		if (readsBare) {
			return {
				error: `"${to}" is a function this layout defines, so every formula reading it would read this component instead.`,
			};
		}
	}
	// Point 3 (A): a reference the walked rows might answer, either way round.
	for (const site of sites) {
		for (const reference of readsOf(site, from)) {
			const { rows } = reference;
			if (rows === undefined || !lookedUp(reference)) continue;
			const walked =
				rows.id === SELF_KEYWORD
					? site.where.kind === 'component'
						? site.where.config
						: undefined
					: byId.get(rows.id);
			if (walked === undefined) continue;
			const local = localNames(walked, getComponent(walked.type));
			const shadowed = local.has(from) ? from : local.has(to) ? to : null;
			if (shadowed === null) continue;
			return {
				error: perRowSentence(
					shadowed,
					walked,
					`${rows.call}(${rows.id}, …) in ${siteName(site.where)}`,
					'each row',
				),
			};
		}
	}
	// The same test one step removed: a definition's amount and condition are
	// read in whichever row enrols, and any component declaring
	// `scopeModifiers` can enrol one.
	const enrolling = walk
		.map((entry) => entry.config)
		.filter((config) => getComponent(config.type)?.scopeModifiers !== undefined);
	for (const site of sites) {
		if (site.where.kind !== 'definition') continue;
		if (!readsOf(site, from).some((reference) => lookedUp(reference))) continue;
		for (const config of enrolling) {
			const local = localNames(config, getComponent(config.type));
			const shadowed = local.has(from) ? from : local.has(to) ? to : null;
			if (shadowed === null) continue;
			return {
				error: perRowSentence(
					shadowed,
					config,
					siteName(site.where),
					'each row that enrols in it',
				),
			};
		}
	}

	const renames = new Map([[from, to]]);
	let places = 0;
	for (const site of sites) {
		const next = renameNames(site.source, renames, site.local);
		if (next === site.source) continue;
		site.replace(next);
		places++;
	}
	renamed.id = to;

	try {
		parseLayout(serialiseLayout(candidate));
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) };
	}
	return { layout: candidate, places };
}
