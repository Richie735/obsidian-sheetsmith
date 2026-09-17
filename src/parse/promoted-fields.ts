/*
 * The layout's promoted field list (SPEC §9), read as a list.
 *
 * One job: the promoted field list. What the layout declares, what is wrong with
 * it, what the picker may offer, and what a note's frontmatter therefore says are
 * one decision seen at four moments — which is
 * `component-rename-migration.ts`'s own argument for holding a scan, a write and
 * a sentence together.
 *
 * **The split was considered and refused, and §1's own test is why the question
 * is worth recording.** The one-sentence version of this file's job needs an
 * "and": it reads the layout's promoted list *and* writes a character note's
 * frontmatter. What holds them together is that the second cannot state its
 * failures without the first — `REFUSAL_FIXES` is keyed on `frontmatter.ts`'s
 * refusal kinds and turns each into a sentence, and the only reader who knows
 * that *pointing a row at another property* is an available fix is a reader of
 * the promoted list. Split, the refusal sentences would sit one import away from
 * the rule that produces them and a fourth refusal kind would compile with no
 * fix for it. So the "and" is the price, and it is named here rather than left
 * for the next reader to rediscover as a violation.
 *
 * The same split `parse/modifier-definitions.ts` follows, and for its reasons:
 * whether `promotedFields` is an array of objects is the file format's business
 * and refuses the layout in `parseLayout`, while whether a row is *usable* is
 * contents, reported where it can be fixed while every sheet on the layout goes
 * on rendering. One typo must not blank a party's worth of characters.
 *
 * **It takes the accepting-set sources as well as the layout**, the same
 * departure from "exact argument" that file makes and for the same reason:
 * whether a name is published is a question about the components' definitions in
 * the registry, which a pure module may not reach (Constraint 5).
 * `modifierTargetSource` is what every caller already has in hand.
 *
 * Pure, so Constraint 5 holds. `parse/` → `formula/` is an edge
 * `parse/layout.ts` already runs, and there is no cycle: nothing in `formula/`
 * imports `parse/promoted-fields.ts`.
 *
 * **The naming rule.** "Promote" already means something else in this plugin — a
 * typed modifier promoted into a modifier definition, which writes the *layout*
 * file where this writes the *note* — so no identifier here is the bare word.
 * `src/view/promote-flow.test.ts` and `buildSheet`'s own `promote` parameter own
 * those spellings, and the two moves are told apart by which file is written,
 * which is the opposite file in each case.
 */

import { CharacterNote } from './character';
import {
	frontmatterBlockProblem,
	frontmatterKeyProblem,
	FrontmatterRefusalKind,
	removeFrontmatterKey,
	setFrontmatterKey,
	yamlScalar,
} from './frontmatter';
import { Layout } from './layout';
import {
	ModifierTargetSource,
	publishedEntries,
	PublishedSuffix,
	publishedSuffixes,
} from '../formula/modifier-targets';
import { FieldValue, LAYOUT_KEY, PromotedField } from '../types';

/** Something wrong with one promoted field. */
export interface PromotedFieldProblem {
	/**
	 * The whole diagnosis and its fix, for the report under the list.
	 *
	 * Readable on its own, because somebody scrolling to the report is not
	 * standing on the row: it names the row's own property or value, says what is
	 * wrong, and ends with the gesture that fixes it.
	 */
	message: string;
	/**
	 * The same fault as a clause short enough to sit under a control, for the
	 * field the fault belongs to.
	 *
	 * **Authored here rather than cut out of `message`**, and that is this
	 * member's whole reason. The field used to take the message "up to its first
	 * full stop", which was right for most faults and wrong for the one that
	 * matters most: an unpublished value's first sentence *is* the entire
	 * diagnosis, so a 15-word clause wrapped to two lines under a 335px control
	 * and the report 60px below repeated it verbatim, both in red. A derivation
	 * cannot know where a sentence stops being a label.
	 *
	 * Two strings in one object literal, so a pass rewording either meets the
	 * other — which is what the field re-deciding these rules for itself could
	 * never offer. `promoted-fields.test.ts` holds every mark under a length
	 * bound, because "it grew into a diagnosis" is exactly how this failed once.
	 */
	mark: string;
	/**
	 * Which row, in declaration order.
	 *
	 * **Not a locator string, which is what the siblings return and what this
	 * returned first.** `parse/triggers.ts` and `parse/modifier-definitions.ts`
	 * hand back the offending name for a quieter span before the message, and
	 * here that span was the exact token the message's own first clause already
	 * quotes — at `--text-faint`, measured 2.30:1 against a message at 4.20:1 —
	 * so it was an illegible duplicate of a legible string.
	 *
	 * An index instead, because it addresses the thing an editor can actually
	 * mark: the row. That is what makes the field's mark and this report one
	 * decision rather than two, which is the whole reason the field stopped
	 * re-deciding these rules.
	 */
	row: number;
	/**
	 * Which of the row's two controls is at fault, and therefore where the fix
	 * is.
	 *
	 * Carried because it does not follow from the message: the two faults that
	 * belong to the **Value** picker are a row with no value chosen and a row
	 * whose value this layout cannot reach, and the first of those is the one a
	 * field re-deciding the property rules alone got backwards — it marked the
	 * Property input on a row whose property was merely absent, beside a report
	 * talking about the value (`docs/UI.md` §9's two answers to one question).
	 */
	control: 'value' | 'property';
}

export interface ParsedPromotedFields {
	/**
	 * The usable rows, in declaration order, with unusable ones dropped and a
	 * property claimed twice collapsed to its first claimant. This is what the
	 * sheet writes.
	 */
	fields: readonly PromotedField[];
	/**
	 * Rows whose property is to be **removed** from the note, which is the one
	 * list here that causes a note to be written.
	 *
	 * Exactly one fault lands here: a row with a usable property whose *name* the
	 * layout no longer publishes. That is a claim the plugin still holds and can
	 * no longer honour, so a stale number must not outlive the reading it was a
	 * copy of. Every other fault leaves every note alone — a blank property has
	 * nothing to remove — and the decision is made **statically**, against the
	 * layout's published set with no character in hand, which is what keeps it
	 * from ever being confused with a name that merely did not resolve on one
	 * render (`applyPromotedFields` below).
	 */
	retired: readonly PromotedField[];
	problems: readonly PromotedFieldProblem[];
}

/** A row as the file may hold one: every member a free `unknown`. */
type RawField = Record<string, unknown>;

/** A string member, trimmed, or the empty string where the file holds none. */
function text(raw: RawField, key: string): string {
	const value = raw[key];
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * A string member exactly as the file holds it.
 *
 * **The property is read raw where the name is trimmed, and the asymmetry is
 * the point.** A name is matched against the published set, which never has
 * padding, so trimming one can only help. A property is *written into a file
 * verbatim*, so trimming a hand-written `" ac"` would leave the layout saying
 * one thing and every note saying another, with nothing on screen about it —
 * where refusing it names the fault at the field that holds it. Only reachable
 * from a hand-edited layout: the editor's own commit trims before it stores.
 */
function raw(field: RawField, key: string): string {
	const value = field[key];
	return typeof value === 'string' ? value : '';
}

/**
 * What each suffix adds to a picker's label, against the name a formula writes.
 *
 * A `Record` over the suffix union, so a third suffix does not compile until it
 * has a word here. The words are this surface's: a picker shows a name's own
 * label — `Slots · L1 · remaining` — where the suggester says "Remaining" as a
 * sentence about a candidate and the panel's inventory shows the bare `.left`.
 * Only the *set* is shared (`formula/modifier-targets.ts`).
 */
const SUFFIX_LABELS: Record<PublishedSuffix, string> = {
	value: 'stored',
	left: 'remaining',
};

/**
 * Every name a promoted field may point at, with the label a picker shows.
 *
 * `publishedEntries` over every component, plus the suffix forms each entry
 * answers to, in layout declaration order — so the picker cannot drift from the
 * one assembly that already answers "what does this layout publish" for the
 * modifier target picker, the suggester and the panel's own inventory.
 *
 * **Here rather than in `formula/`**, because it is about the promoted list
 * rather than about the formula language: nothing new is published, and no name
 * resolves differently for being promoted.
 *
 * **Every published name, derived or stored alike**, which is SPEC §5 rather
 * than a preference: a bare name is already the derived reading wherever a
 * component computes anything, and a computed Table column publishes nothing
 * under `.value` at all — so "stored values only" would exclude a multiclass
 * character level, a max HP and an AC, which is the whole list §9 exists for.
 */
export function promotableNames(
	sources: readonly ModifierTargetSource[],
): readonly { name: string; label: string }[] {
	const names: { name: string; label: string }[] = [];
	for (const source of sources) {
		for (const published of publishedEntries(source)) {
			names.push({ name: published.name, label: published.label });
			for (const suffix of publishedSuffixes(published.entry)) {
				names.push({
					name: `${published.name}.${suffix}`,
					label: `${published.label} · ${SUFFIX_LABELS[suffix]}`,
				});
			}
		}
	}
	return names;
}

/**
 * Read a layout's promoted fields and report what cannot be used.
 *
 * Takes the whole layout rather than the list, on `parseTriggers`' and
 * `parseModifierDefinitions`' shape, so a caller reading a field back can hand
 * this the layout it is editing with the typed value substituted in.
 *
 * **`sources` is required and has no default**, which is
 * `parseModifierDefinitions`' own ruling one file over: with no sources nothing
 * is published, so every row with a name would be retired and every note on the
 * layout would have its properties cleared. A default of `[]` would not mean
 * "check what you can" but "clear the vault".
 */
export function parsePromotedFields(
	layout: Layout,
	sources: readonly ModifierTargetSource[],
): ParsedPromotedFields {
	const problems: PromotedFieldProblem[] = [];
	const fields: PromotedField[] = [];
	const unpublished: PromotedField[] = [];
	/** Properties a usable row claims, which is what a duplicate collides with. */
	const claimed = new Set<string>();
	const published = new Set(promotableNames(sources).map((one) => one.name));
	/**
	 * Ids of components this version of the plugin cannot draw at all.
	 *
	 * **The structural arm is decided only over components the registry holds**,
	 * and this is the set that holds it to that. A layout shared from a newer
	 * plugin version, or a hand-edited `type` typo, publishes nothing — so
	 * `published` has none of its names and the arm below would clear every
	 * property pointing at it, in every character note whose sheet is opened, one
	 * real write each. That is the transient case by the spec's own separator:
	 * the sheet has no answer about the value because it cannot draw the
	 * component, and the clearing argument — a stale number outliving the reading
	 * it was a copy of — does not apply to a component still declared and still
	 * holding its data. `view/grid-cells.ts` says it in one line: "the layout is
	 * broken, not the sheet".
	 */
	const undrawable = sources
		.filter((source) => source.unknownType === true)
		.map((source) => source.id);
	/** Whether this name belongs to one of those components. */
	const underUndrawable = (name: string): boolean =>
		undrawable.some((id) => name === id || name.startsWith(`${id}.`));

	// Read as a shape rather than as the declared type: `parseLayout` checked
	// that each entry is an object and nothing more, so every member here is
	// still a free `unknown` and a hand-edited file may hold a number where a
	// name goes.
	const raws = (layout.promotedFields ?? []) as unknown as readonly RawField[];
	raws.forEach((field, row) => {
		const name = text(field, 'name');
		const property = raw(field, 'property');

		/*
		 * **The name first, and that precedence is what the editor's field now
		 * reads rather than guessing at.** A row with no value chosen has nothing
		 * to copy, so nothing about its property is worth saying yet — and the
		 * fault is under **Value**, which is where `control` sends the mark. A
		 * field that judged the property rules alone reported "it names no
		 * property" on the Property input of a row this parser was describing as
		 * having no value, both on screen at once.
		 */
		if (name === '') {
			problems.push({
				row,
				control: 'value',
				mark: 'A value is required',
				message: 'A promoted field needs a value to copy. Choose one under Value.',
			});
			return;
		}
		if (property.trim() === '') {
			problems.push({
				row,
				control: 'property',
				mark: 'A property is required',
				message: `"${name}" is copied nowhere, because it names no property. Type one under Property.`,
			});
			return;
		}

		/*
		 * The property's own shape before anything else about it, so a name the
		 * frontmatter format cannot hold is reported as that rather than as a
		 * duplicate of the row above it. `frontmatter.ts` owns the rule, on
		 * `fencedKeyProblem`'s arrangement: the clause is the format's and the
		 * subject is this surface's.
		 */
		const keyProblem = frontmatterKeyProblem(property);
		if (keyProblem !== null) {
			problems.push({
				row,
				control: 'property',
				mark: `"${property}" cannot be a frontmatter property`,
				message: `"${property}" cannot be a frontmatter property: it ${keyProblem}.`,
			});
			return;
		}
		if (property === LAYOUT_KEY) {
			problems.push({
				row,
				control: 'property',
				mark: `"${LAYOUT_KEY}" is this plugin's own property`,
				message: `"${LAYOUT_KEY}" is this plugin's own property, and writing to it would point the note at another layout. Choose another name.`,
			});
			return;
		}
		if (claimed.has(property)) {
			// The parser's existing rule for a repeated modifier name: the first
			// is kept and the second dropped, because two values under one
			// property could not be told apart afterwards.
			problems.push({
				row,
				control: 'property',
				mark: `"${property}" is promoted more than once`,
				message: `"${property}" is promoted more than once. The second is ignored, since two values under one property could not be told apart.`,
			});
			return;
		}

		if (!published.has(name)) {
			if (underUndrawable(name)) {
				/*
				 * **Unresolved, not retired**, which is what `undrawable` above
				 * argues at length. The row is *correct* and the layout is not, so
				 * the message names the real cause and asks for nothing: telling
				 * an author to repoint a row that is right would send them to fix
				 * the one part of this that is not broken. It stays in `fields`,
				 * where the resolver answers nothing and `applyPromotedFields`
				 * leaves the property alone — and where it goes on claiming that
				 * property, so a sibling row cannot retire it either.
				 */
				problems.push({
					row,
					control: 'value',
					mark: `"${name}" is a value this layout cannot reach`,
					message: `"${property}" copies "${name}", whose component has a type this version of Sheetsmith does not have, so nothing is written to it and the property is left as it is. The sheet says which type at that component.`,
				});
				claimed.add(property);
				fields.push({ name, property });
				return;
			}
			/*
			 * **The one fault that writes to a note.** The row still claims this
			 * property and can no longer say what goes in it, so the property is
			 * cleared rather than left holding a number under a name the layout is
			 * still asserting ownership of. Reported as well as acted on, because
			 * the author is the only one who can point the row somewhere real.
			 */
			problems.push({
				row,
				control: 'value',
				mark: `"${name}" is not a value this layout publishes`,
				message: `"${property}" copies "${name}", which this layout publishes no value under, so the property is cleared. Choose one it does, or correct the spelling.`,
			});
			unpublished.push({ name, property });
			return;
		}

		claimed.add(property);
		fields.push({ name, property });
	});

	/*
	 * **A property a usable row claims is never retired**, whatever a sibling row
	 * says about it. Without this the second of two rows on one property would
	 * delete what the first one writes, once per render, for as long as both rows
	 * are in the list. Deduped as well, so two retired rows on one property do
	 * not ask for the same removal twice.
	 */
	const retired: PromotedField[] = [];
	for (const row of unpublished) {
		if (claimed.has(row.property)) continue;
		if (retired.some((held) => held.property === row.property)) continue;
		retired.push(row);
	}

	return { fields, retired, problems };
}

/** A property this render could not write, and why. */
export interface PromotedFieldRefusal {
	/** The property, or absent where the whole block is the obstacle. */
	property?: string;
	/** The whole sentence a reader gets after "Sheetsmith could not write…". */
	reason: string;
}

export interface PromotedFieldWrite {
	/**
	 * The note to serialise, or `'unchanged'` where every line the write would
	 * have emitted is already the line the note holds.
	 *
	 * A `CharacterNote` rather than a string, so the caller's own
	 * `serialiseCharacter` produces the text — the two-step `repointLayout`
	 * already uses, and the reason this function needs no knowledge of how a note
	 * is assembled.
	 */
	note: CharacterNote | 'unchanged';
	refusals: readonly PromotedFieldRefusal[];
}

/**
 * What to do about each obstacle, against the kind of obstacle it is.
 *
 * A `Record` over `frontmatter.ts`'s refusal kinds, so a fourth kind does not
 * compile until it has a fix here. The *clause* naming what was found is that
 * module's, because it is the format's fact; the fix is this module's, because
 * only a reader of the promoted list knows that pointing a row elsewhere is an
 * option.
 */
const REFUSAL_FIXES: Record<FrontmatterRefusalKind, string> = {
	value: 'Remove it, or point the layout’s promoted field at another property.',
	repeated:
		'Remove one of them, or point the layout’s promoted field at another property.',
	block: 'Fix that line, and the property is written on the next render.',
};

/**
 * Mirror the usable rows into the note's frontmatter, and clear the retired
 * ones.
 *
 * **"The value is not there" is two situations and they get two answers.** A
 * `retired` row is *structural* — the layout no longer publishes the name at all
 * — and its property is removed, because a stale number that outlives the thing
 * it was a reading of is a lie the note keeps telling for as long as nobody opens
 * that sheet. A `fields` row whose name does not resolve on *this render* is
 * transient — a half-typed formula, a function library mid-edit, a cycle guard,
 * a section that will not read, a value with no YAML spelling — and its property
 * is left exactly as it is, neither rewritten nor removed.
 *
 * **Doing nothing is the honest answer to the transient case rather than a
 * concession.** The sheet has no answer either: the card beside it is showing `?`
 * for the same reason, and removing the property would assert something stronger
 * than the sheet is willing to assert about the same value on screen. It is also
 * what keeps a layout edit from costing two real writes per promoted field per
 * settling — one to strip and one to restore — each destroying the modified time
 * the change guard exists to protect.
 *
 * `resolve` is the sheet's own name table. A name that resolves to `undefined`
 * did not resolve; there is deliberately no way to ask this function why.
 */
export function applyPromotedFields(
	note: CharacterNote,
	parsed: Pick<ParsedPromotedFields, 'fields' | 'retired'>,
	resolve: (name: string) => FieldValue | undefined,
): PromotedFieldWrite {
	/*
	 * The block is asked about once rather than once per property. A block this
	 * writer cannot account for refuses every property for one reason, and a
	 * notice repeating that reason per property would grow with the layout while
	 * saying one thing.
	 */
	const blockProblem = frontmatterBlockProblem(note.frontmatter);
	if (blockProblem !== null) {
		return {
			note: 'unchanged',
			refusals: [{ reason: `${blockProblem}. ${REFUSAL_FIXES.block}` }],
		};
	}

	let frontmatter = note.frontmatter;
	const refusals: PromotedFieldRefusal[] = [];

	const outcome = (property: string, result: ReturnType<typeof setFrontmatterKey>) => {
		if (result.kind === 'written') frontmatter = result.frontmatter;
		else if (result.kind === 'refused') {
			refusals.push({
				property,
				reason: `${result.refusal.found}. ${REFUSAL_FIXES[result.refusal.kind]}`,
			});
		}
	};

	// Declaration order, so several properties appended on a first render land in
	// the order the layout lists them.
	for (const field of parsed.fields) {
		const value = resolve(field.name);
		if (value === undefined) continue;
		const scalar = yamlScalar(value);
		// No YAML spelling — a non-finite number — is the transient arm too: a
		// sheet holding a number it cannot express is in the same position as one
		// holding no number yet.
		if (scalar === null) continue;
		outcome(field.property, setFrontmatterKey(frontmatter, field.property, scalar));
	}
	for (const row of parsed.retired) {
		outcome(row.property, removeFrontmatterKey(frontmatter, row.property));
	}

	return {
		note:
			frontmatter === note.frontmatter ? 'unchanged' : { ...note, frontmatter },
		refusals,
	};
}
