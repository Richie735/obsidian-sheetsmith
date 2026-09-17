/*
 * Every name a layout offers a formula, as a tree walked one segment at a time.
 *
 * One job: given what the layout publishes and where the caret is standing
 * (`completion.ts`), say which names could go there and what to call each one.
 * It draws nothing, holds no state, and imports nothing from `obsidian`
 * (Constraint 5) — a component's definition arrives as an argument, exactly as
 * `modifierTargetSource` takes one, because a layout may name a type the
 * registry does not have and this file may not ask.
 *
 * **Assembled from `modifierTargetSource`, not beside it.** That module's header
 * records why there is exactly one assembly of "what does this layout publish":
 * two independent ones once disagreed about a totalled prose column and a
 * component whose section failed to read, and the divergence reached the sheet.
 * So `vocabularySource` below *calls* it and adds only the two facts the target
 * picker never needed — whether an aggregate may walk this component's rows, and
 * the names a formula written inside it may read per row.
 *
 * **A tree and not a list**, which is what keeps 261 candidates on the largest
 * bundled layout from arriving in one popup: the top level is the ids plus the
 * function names, and `.value`, `.left` and `<id>.<member>` are reached by typing
 * the dot, which is also how the language spells them.
 */

import { FunctionLibrary, RESERVED_NAMES } from './expression';
import {
	componentLabel,
	modifierTargetSource,
	ModifierTargetSource,
	publishedEntries,
} from './modifier-targets';
import { Completion } from './completion';
import { ComponentConfig, ComponentDefinition, ScopeEntry } from '../types';

/** The namespace every modifier reference starts with (SPEC §5). */
const MODIFIER_NAMESPACE = 'mod';

/**
 * The column type whose value is a formula in the same list.
 *
 * **Spelled here rather than imported, and the cost is recorded rather than
 * paid.** `components/column-types.ts` owns this vocabulary and imports nothing,
 * so taking it would compile — but nothing in `src/formula/` or `src/parse/`
 * imports from `src/components/` today, and creating that edge for one string is
 * a layering decision rather than a fix to a suggester. The literal is already
 * spelled at sixteen sites across three folders, so this is the practice rather
 * than a departure from it; `docs/BACKLOG.md` § Patterns holds the row.
 */
const COMPUTED_TYPE = 'computed';

/** What `mod.` offers before any component id. */
const MODIFIER_SELF = 'self';

/** One name a formula inside a component may read per row. */
export interface RowName {
	name: string;
	/** Which list the layout typed it into, which is what the note says. */
	kind: 'column' | 'row value';
	/**
	 * Whether this entry's own value is a formula in the same list.
	 *
	 * It decides where the name may be offered, because the two callers of this
	 * list are standing in different places: inside `sum(<id>, …)` a computed
	 * entry is an ordinary name, since both components layer computed over
	 * stored when they build a row for an aggregate; on the entry's *own*
	 * Formula cell it is a self-reference, because neither component puts a
	 * computed entry in the scope a computed entry resolves against
	 * (`table.ts` `rowScope`, `record-set.ts` `recordValues`).
	 */
	computed: boolean;
}

/**
 * A component as the suggester sees it: what the picker sees, plus rows.
 *
 * The two additions are what a picker has no use for. `rows` is whether
 * `sum(<id>, …)` means anything, which is `scopeRows` and nothing else —
 * SPEC §5's sentence naming Table as the only publisher of rows is stale, and
 * asking the definition rather than naming a component is why nothing here had
 * to change when Record set grew one.
 */
export interface VocabularySource extends ModifierTargetSource {
	/** Whether an aggregate may walk this component's rows. */
	rows: boolean;
	/** What a formula written inside this component reads per row. */
	rowNames: readonly RowName[];
}

/** What the suggester is offered over a whole layout. */
export interface Vocabulary {
	/** One per component, in layout order. */
	components: readonly VocabularySource[];
	/** The layout's own functions, by name. */
	functions: FunctionLibrary;
}

/** One thing the popup may offer. */
export interface Candidate {
	/**
	 * The segment shown in code type, and the text a prefix is matched against.
	 * One segment rather than the whole path, because the path is already on
	 * screen to the left of the caret and repeating it on every line of a
	 * six-member list is noise.
	 */
	name: string;
	/**
	 * What accepting splices over the fragment: the path the author has already
	 * typed, with this segment on the end. The *insertion* is the full name
	 * because the splice replaces the whole fragment — which is what keeps an
	 * accept from deleting the `)` or the function beside it.
	 */
	insert: string;
	/** Secondary text: who owns this name, or what it is worth. */
	note: string;
}

/**
 * What one component contributes, taken from the same assembly the target
 * picker reads.
 *
 * Takes the definition rather than looking it up, so this stays pure
 * (Constraint 5) — `modifierTargetSource`'s own rule, for its own reason: every
 * caller has already asked the registry, and a layout may name a type that is
 * not there.
 */
export function vocabularySource(
	config: ComponentConfig,
	definition:
		| Pick<
				ComponentDefinition,
				'formulaFields' | 'scopeValues' | 'scopeRows' | 'configFields'
		  >
		| undefined,
): VocabularySource {
	return {
		...modifierTargetSource(config, definition),
		rows: definition?.scopeRows !== undefined,
		rowNames: rowNamesOf(config, definition),
	};
}

/**
 * The names a formula written *inside* a component reads per row.
 *
 * **Derived from the config field *kinds* rather than from a component's name**,
 * so a third component declaring a `columns` field gets this for nothing and no
 * module in `editor/` ever learns that a Table exists. Columns before row values
 * because a computed cell reads its own row's cells first and its row values
 * second, which is the order `table.ts`'s own scope builds them in.
 */
function rowNamesOf(
	config: ComponentConfig,
	definition: Pick<ComponentDefinition, 'configFields'> | undefined,
): RowName[] {
	if (!definition) return [];
	const record = config as unknown as Record<string, unknown>;
	const names: RowName[] = [];
	const add = (name: unknown, kind: RowName['kind'], computed = false) => {
		if (typeof name !== 'string' || name === '') return;
		if (names.some((held) => held.name === name)) return;
		names.push({ name, kind, computed });
	};
	for (const field of definition.configFields) {
		if (field.kind !== 'columns') continue;
		for (const entry of asArray(record[field.key])) {
			const typed = entry as { key?: unknown; type?: unknown };
			add(typed.key, 'column', typed.type === COMPUTED_TYPE);
		}
	}
	for (const field of definition.configFields) {
		if (field.kind !== 'rows') continue;
		for (const entry of asArray(record[field.key])) {
			const values = (entry as { values?: unknown }).values;
			if (typeof values !== 'object' || values === null) continue;
			// A row value is an expression evaluated against the sheet, and both
			// components put every one of them in the row scope before the
			// computed entries run. So none of these is ever a self-reference.
			for (const name of Object.keys(values)) add(name, 'row value');
		}
	}
	return names;
}

function asArray(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}

/** Whether this component publishes any name at all. */
function publishesAName(source: ModifierTargetSource): boolean {
	return publishedEntries(source).length > 0;
}

/**
 * The entry a path segment names, or undefined where it names none.
 *
 * Through the shared walk rather than by reaching into `values` again, so this
 * module never spells the self-versus-named structure at all.
 */
function entryOf(
	source: VocabularySource,
	member: string | undefined,
): ScopeEntry | undefined {
	return publishedEntries(source).find((one) => one.key === member)?.entry;
}

/**
 * What the popup offers at this caret, before any prefix is applied.
 *
 * `owner` is the component whose own form the field belongs to, where the field
 * is one a row is evaluated in — a computed column's **Formula**. Its row
 * vocabulary comes first there, and `undefined` everywhere else.
 */
export function candidatesAt(
	vocabulary: Vocabulary,
	completion: Completion,
	owner?: string,
): Candidate[] {
	const path = completion.path;
	const spell = (name: string): string => [...path, name].join('.');
	const candidate = (name: string, note: string): Candidate => ({
		name,
		insert: spell(name),
		note,
	});

	const aggregate = completion.aggregate;
	if (aggregate !== undefined && aggregate.argument === 0) {
		// SPEC §5: the first argument is a component reference and nothing else,
		// so a dotted path there names nothing this could offer.
		if (path.length > 0) return [];
		return vocabulary.components
			.filter((source) => source.rows)
			.map((source) => candidate(source.id, componentLabel(source)));
	}

	if (path.length === 0) {
		const rowsOf =
			aggregate !== undefined
				? vocabulary.components.find((source) => source.id === aggregate.table)
				: vocabulary.components.find((source) => source.id === owner);
		// A table naming no component falls back to the sheet alone, which is the
		// state a half-typed reference is in for as long as it takes to type.
		return [
			...rowCandidates(rowsOf, candidate, aggregate !== undefined),
			...topLevel(vocabulary, candidate),
		];
	}

	const [first, ...rest] = path;
	if (first === MODIFIER_NAMESPACE) {
		// `mod.` never offers `.value` or `.left`: the slot table registers
		// neither, so a formula reading `mod.abilities.STR.value` reads nothing.
		if (rest.length === 0) {
			return [
				candidate(MODIFIER_SELF, "This name's own modifier total"),
				...vocabulary.components
					.filter(publishesAName)
					.map((source) => candidate(source.id, componentLabel(source))),
			];
		}
		if (rest.length > 1) return [];
		const source = vocabulary.components.find((one) => one.id === rest[0]);
		return source === undefined ? [] : members(source, candidate);
	}

	if (path.length > 2) return [];
	const source = vocabulary.components.find((one) => one.id === first);
	if (source === undefined) return [];
	if (path.length === 1) {
		return [
			...members(source, candidate),
			...forms(entryOf(source, undefined), candidate),
		];
	}
	return forms(entryOf(source, rest[0]), candidate);
}

/** The names a component publishes under its own id. */
function members(
	source: VocabularySource,
	candidate: (name: string, note: string) => Candidate,
): Candidate[] {
	/*
	 * **The label's component half only, because the key is already the line.**
	 * `publishedEntries` spells a member `Abilities · STR`, which is right for a
	 * picker showing one string — and here the item's own visible name *is*
	 * `STR`, so the note would read `Abilities · STR` under it and repeat half of
	 * itself on every row of a six-row list. `docs/UI.md` §9 already settles this
	 * for a breakdown's contributor lines, in the same words: a token that
	 * carries no information is dropped, and the modifier is printed only where
	 * the row is not already called by its name. The thing the reader does not
	 * have is the owner.
	 *
	 * A row name keeps both halves and is drawn elsewhere: `Inventory · column`
	 * says which list the name came out of, which the visible `Qty` does not.
	 */
	return publishedEntries(source)
		.filter((one) => one.key !== undefined)
		.map((one) => candidate(one.key as string, componentLabel(source)));
}

/**
 * The two suffixes an entry may answer to.
 *
 * `value` wherever there is an entry at all, because every entry stores one;
 * `left` only where the entry sets it, which is SPEC §5's rule that `.left` is
 * published only by an entry that has a ceiling to count against.
 */
function forms(
	entry: ScopeEntry | undefined,
	candidate: (name: string, note: string) => Candidate,
): Candidate[] {
	if (entry === undefined) return [];
	const found = [candidate('value', 'Stored value')];
	if (entry.left !== undefined) found.push(candidate('left', 'Remaining'));
	return found;
}

/**
 * A component's own row vocabulary, where a formula is being written in one.
 *
 * **A computed entry is offered to an aggregate and withheld from the cell it is
 * the value of**, which is the one place this list serves two truths. An
 * aggregate walks finished rows, where both components layer computed over
 * stored; a computed entry's own Formula cell resolves against the stored layer
 * alone, so offering `Total` there would complete a name into a formula that
 * cannot resolve and say nothing about why.
 */
function rowCandidates(
	source: VocabularySource | undefined,
	candidate: (name: string, note: string) => Candidate,
	/** Whether the caret is in an aggregate's argument rather than on a cell. */
	inAggregate: boolean,
): Candidate[] {
	if (source === undefined) return [];
	return source.rowNames
		.filter((row) => inAggregate || !row.computed)
		.map((row) => candidate(row.name, `${componentLabel(source)} · ${row.kind}`));
}

/**
 * The sheet's own top level.
 *
 * **`mod` sits between the ids and the library**, and the one thing worth
 * recording is the collision: `mod` is not reserved, so a layout may define a
 * function called `mod`, and the fixture the acceptance criteria are written
 * against does. One entry either way, deduplicated by name with the first
 * winning — the namespace, because it is the only route into the `mod.` tree
 * while a function of that name is reachable by typing the same three letters
 * and inserts the same text. What is lost is a signature in the note, which is
 * not what an insertion does.
 */
function topLevel(
	vocabulary: Vocabulary,
	candidate: (name: string, note: string) => Candidate,
): Candidate[] {
	const found: Candidate[] = [];
	const seen = new Set<string>();
	const offer = (name: string, note: string) => {
		if (seen.has(name)) return;
		seen.add(name);
		found.push(candidate(name, note));
	};
	for (const source of vocabulary.components) {
		if (publishesAName(source)) offer(source.id, componentLabel(source));
	}
	offer(MODIFIER_NAMESPACE, 'Modifiers pushed at a name');
	for (const definition of vocabulary.functions.values()) {
		offer(definition.name, `${definition.name}(${definition.params.join(', ')})`);
	}
	for (const name of RESERVED_NAMES) offer(name, 'Built in');
	return found;
}

/**
 * The candidates a prefix matches, exact first and then prefix, never substring.
 *
 * **The exact tier is case-sensitive and the prefix tier is not**, and both
 * halves are load-bearing. Case-insensitive prefixes are what makes `str` offer
 * `STR`, which is the forgetting-the-casing half of the recall problem; the
 * exact tier sorting first is what makes Enter on a fully typed name re-insert
 * the same text rather than a longer one that merely starts with it, so the
 * second Enter is a commit rather than a surprise.
 *
 * **No substring matching.** With it, a short name that is a substring of a
 * longer one is the wrong name one Enter away.
 */
export function matchCandidates(
	candidates: readonly Candidate[],
	prefix: string,
): Candidate[] {
	const lower = prefix.toLowerCase();
	const exact = candidates.filter((one) => one.name === prefix);
	const starts = candidates.filter(
		(one) => one.name !== prefix && one.name.toLowerCase().startsWith(lower),
	);
	return [...exact, ...starts];
}
