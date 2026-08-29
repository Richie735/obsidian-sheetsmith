/*
 * What a modified number is made of, as one block of text.
 *
 * Nothing in the surveyed category answers "why is this 17" at the number.
 * Sandbox System Builder colours a modified attribute green; Custom System
 * Builder ships an Active Effect Displayer with an Origin Column. Both are
 * separate surfaces from the number, and both establish the floor: a sheet must
 * at minimum *show* that a value was modified. Here the modifier rows are on the
 * sheet and each names its target, so a modified card can list its own
 * contributors — which is the feature's differentiator rather than a flourish.
 *
 * **One builder, two carriers.** The same text goes into the popover a press
 * opens and into the `.sheetsmith-sr-only` line beside the number, so the two
 * cannot say different things. That is the whole reason this is a module rather
 * than a paragraph inside a component: `card-face.ts` draws it for a Card and a
 * Card set, `table.ts` folds it into the popover a computed cell already opens,
 * and a copy in each could only be held together by a test asserting they still
 * read alike (PATTERNS §1's policy tier).
 *
 * **Four texts now, and they share the sentence that matters.** The breakdown says
 * what a *number* is made of; `modifierOutcomeText` says what one *modifier* is
 * doing, and is what a line in the form reads; `modifierRowText` and
 * `modifierRowName` say what a *row* is doing, at the two depths a cell carries —
 * the `title` and the accessible name.
 *
 * **And each of them gains the typed case rather than a second builder for it.** A
 * part with no name is spelled by *what it does* — which is the outcome half these
 * four already share — so a breakdown line for a typed effect falls back to the
 * row's own label, and a row's `title` and accessible name spell it
 * `Armour class — item +2`. Nothing about the words differs by tier, which is what
 * stops a sheet saying two things about one number. All four spell **the outcome** the same
 * way — `item +2`, `sets to 18` — through one private helper, because a row
 * reading "+1" beside a breakdown reading "item +1" is the instrument disagreeing
 * with itself (`docs/UI.md` §11).
 *
 * **The outcome and not the whole line, which is worth being exact about.** The
 * identifying half differs by surface on purpose: each drops the token the
 * reader's own position already supplies, so a breakdown line carries no target
 * — every line of it changes the number in front of them — and a popup line
 * carries no row, since the reader pressed that row's own glyph to open it.
 * `docs/UI.md` §9 has the table. Forcing one shape would put four tokens on every
 * line where the reader needs two, and the one it added would be the one they are
 * already looking at.
 *
 * **The row's two builders are here rather than in the component, and at another
 * arity rather than in a module of their own.** It is the same job — say what a
 * modifier is doing, in words — for one row instead of one enrolment, and the
 * whole point of one module is that a row's `title`, its accessible name and a
 * line in its popup cannot disagree about what the same modifier does.
 *
 * **A suppressed line is listed and says why**, and that is the line the whole
 * breakdown exists for: a reader who bought two rings of protection and watched
 * the number not move will otherwise conclude the plugin is broken.
 *
 * Text and not markup, deliberately. `showPopover` sets `textContent` and
 * `.sheetsmith-popover` already carries `white-space: pre-wrap`, so a newline
 * here is already a line — and a second kind of panel beside a row of cards is
 * what `docs/UI.md` §9 forbids. What that costs is per-line styling: a
 * suppressed line cannot be drawn faint, so the parenthetical carries it.
 */

import {
	ModifierBreakdown,
	ModifierOperator,
	ModifierPhase,
	ModifierOutcome,
} from '../types';

/**
 * The mark on a number something has been pushed at.
 *
 * A shape channel and not a colour one: `docs/UI.md` §1 gives the plugin no
 * colours of its own — Sandbox's green is exactly what may not be drawn here —
 * and §6 refuses a mark whose only channel is fill strength. `text-decoration`
 * also survives forced-colors mode, where a border or a shadow would not.
 *
 * Named for the mark rather than for a caller, the way `.sheetsmith-level-ring`
 * is: a table cell carrying a class called `card` is a name a reader would
 * believe. Both consumers add this one class and the rule is written once.
 */
export const MODIFIED_CLASS = 'sheetsmith-modified';

/** A number as a modifier reads: "+2", "-1". Zero never reaches here. */
function signed(amount: number): string {
	return amount > 0 ? `+${amount}` : String(amount);
}

/**
 * The breakdown as text, or null where nothing modifies the number.
 *
 * Null rather than an empty string, so a caller cannot draw a mark over nothing:
 * the mark and the text are the same fact, and asking for one is asking whether
 * there is the other. Takes an absent breakdown too, which is a component drawn
 * with no sheet around it — the same answer, for the same reason.
 *
 * No lines arrives both from a name nothing pushes at and from a name that
 * accepts no modifier, and the two look the same here on purpose: the stray
 * target is reported at the row that wrote it, which is where the fix is.
 */
export function modifierBreakdown(
	breakdown: ModifierBreakdown | undefined,
	/**
	 * The number the caller is drawing, where it has one.
	 *
	 * **This is what stops the total line stating a value the reader cannot see**,
	 * and it is here rather than derived because deriving it was the bug. This
	 * module used to print `override + total`, which is the arithmetic
	 * `formula/resolve.ts` also does — under a *different* bound, since a breakdown
	 * is offered on the lazy-proof text scan while an override is applied only
	 * where the slot was actually read. Both bounds are individually right and
	 * together they printed `Total 19` over the number 10, on
	 * `if(false, 10 + mod.self, 10)` and, with no lazy `if` at all, on any name
	 * that reaches the accepting set through some *other* formula's `mod.<name>`
	 * while an override only ever arrives via `mod.self`.
	 *
	 * A wrong delta was an unexplained delta; a wrong value is a false statement
	 * about the number under the cursor, which is exactly what `resolve.ts`'s own
	 * "a name and the cell it came from must not disagree" forbids. So the value
	 * comes from the one place it certainly exists — whoever drew it — and there is
	 * one arithmetic site left.
	 *
	 * Null where the caller has no number: an unresolved formula, or a cell with
	 * nothing to compute. The total then keeps its delta form, which asserts
	 * nothing about a value.
	 */
	shown?: number | null,
	/**
	 * That the reader is standing *inside a component with rows*, so an
	 * unqualified row name has a competing referent.
	 *
	 * **The drop rule's premise fails on exactly one surface and this is it.** The
	 * rule is that a token the same on every line carries no information — true of
	 * the *breakdown*, and false about the reader's surroundings: a computed cell in
	 * a Skills table drew `Eyes of the Eagle — item +2` for a contributor that lives
	 * in Magic items, so a reader read a row name while looking at a list of rows
	 * and went hunting for a skill called that. A card has no rows and so no such
	 * referent, which is why this is the table's flag and not a rule for everyone.
	 *
	 * Passed rather than inferred, because "does the surface I am drawn on have
	 * rows" is the caller's fact and nothing here could ask it.
	 */
	inRows?: boolean,
): string | null {
	if (breakdown === undefined || breakdown.lines.length === 0) return null;
	/*
	 * **The component's label appears only where the breakdown draws on more than
	 * one component, and then on every line of it.**
	 *
	 * The rule, so a reviewer can check it against the text rather than guess:
	 * *a token that is the same on every line of a breakdown carries no
	 * information and is dropped.* That is already why an untyped modifier says
	 * nothing rather than "untyped", three lines down, and the common sheet has
	 * one modifier table — so qualifying every line there would put the same word
	 * in front of every contributor and push the amount, which is what the reader
	 * came for, further right on each one.
	 *
	 * What it buys is the case the row's label cannot carry: worn items and
	 * weapons on one sheet, each with a row called "Ring", giving two lines a
	 * reader cannot tell apart.
	 *
	 * **Uniformly across the breakdown rather than per line**, which is the half
	 * worth stating. Qualifying only the lines that collide would leave a
	 * reader unable to tell where an *un*qualified line came from, and would make
	 * one line's text depend on another line's spelling. Deciding it once per
	 * breakdown means the shape changes only when the fact does — when the last
	 * row from a second table goes, every line loses its prefix because they
	 * genuinely all come from one place now.
	 */
	const sources = new Set(breakdown.lines.map((line) => line.source));
	const qualify = sources.size > 1 || inRows === true;
	const said = breakdown.lines.map((line) => {
		const from = qualify && line.source !== '' ? [line.source] : [];
		/*
		 * **The modifier's own name, where the row is not already called by it.**
		 *
		 * The same rule as the source's, read on the token beside it rather than on
		 * the same token down the breakdown: a token carrying no information is
		 * dropped. An item's row is normally named after the modifier it applies —
		 * `Ring of Protection` in both places — so printing both would print one
		 * word twice, and every line in this repository's fixtures is unchanged by
		 * this clause. It earns its place on the case a cell holding a list created:
		 * the Bracers of Defence reach armour class from a row called *Belt of Giant
		 * Strength*, and without this the line said a Strength item was giving the
		 * reader armour class.
		 *
		 * **Per line, where the source is decided per breakdown, and the difference
		 * is not an inconsistency.** Dropping the source on some lines would leave a
		 * fact unrecoverable — nothing else on an unqualified line says which
		 * component — and would make one line's text depend on another line's
		 * spelling. Dropping the modifier where it equals the row removes a
		 * *duplicate of a word already on the line*: nothing is missing, and no
		 * line's text depends on any other line's. So the granularity follows from
		 * the same rule rather than from a second one.
		 *
		 * Both, and never the modifier alone: the row is how a reader finds the
		 * thing to untick, and a breakdown naming only `Bracers of Defence` sends
		 * them scanning an inventory for a row that does not exist.
		 */
		const which =
			line.definition !== undefined &&
			line.definition !== '' &&
			line.definition !== line.label
				? [line.definition]
				: [];
		/** Component, row, modifier — widest scope first, each where it informs. */
		const named = [...from, line.label, ...which];
		const why = line.suppressed === null ? '' : ` (not applied: ${line.suppressed})`;
		return `${named.join(' · ')} — ${change(line)}${why}`;
	});
	/*
	 * **The total line changes shape only when an override applies, and only when
	 * the caller can say what the value is.** With nothing overriding it is
	 * `Total +3`, unchanged. With an override it is the value rather than the
	 * addend — `Total 19` — because base-plus-total is no longer the arithmetic and
	 * a signed number there would invite the reader to add it to something.
	 *
	 * The value is the caller's own, never recomputed here; see `shown` above for
	 * why that distinction is the whole of this parameter. Where the caller has no
	 * number the delta form stands, which asserts nothing.
	 */
	const total =
		breakdown.override === null || typeof shown !== 'number'
			? `Total ${signed(breakdown.total)}`
			: `Total ${shown}`;
	// A blank line before the total, so it reads as the sum rather than as one
	// more contributor. Flush with the rest it was a third entry on a
	// two-contributor breakdown. The table cell's own payload already separates
	// the formula from the breakdown this way, so the bubble is known to take it.
	return [...said, '', total].join('\n');
}

/**
 * What one contributor did, as words: `item +2`, or `sets to 18`.
 *
 * **An override line reads "sets to" rather than a signed amount**, because an
 * override is not an addend, and a bonus type is never on one — overrides do not
 * contest by type, so the line carries none either.
 *
 * The type, where the definition declared one. An untyped modifier says nothing
 * rather than saying "untyped": every modifier is untyped on a layout that has
 * never heard of bonus types, and a word repeated down every line of every
 * breakdown carries no information.
 *
 * **The phase is named only where it is not the default**, on exactly that rule.
 * A value-phase line is what every modifier was before phases existed and is
 * what most still are, so saying so on every line would bury the one line that
 * behaves differently. A result-phase line says `to the derived number`, because
 * without it two lines reading `item +2` under one total would be indistinguishable
 * while landing on different numbers — which is the question a breakdown exists
 * to answer.
 */
function change(line: {
	operator: ModifierOperator;
	type: string | null;
	applies?: ModifierPhase;
	amount: number;
}): string {
	if (line.operator === 'override') return `sets to ${line.amount}`;
	const said = `${line.type === null ? '' : `${line.type} `}${signed(line.amount)}`;
	return line.applies === 'result' ? `${said} to the derived number` : said;
}

/**
 * What one row's enrolment is doing, as one block of text.
 *
 * The second consumer of this module and the reason it takes an outcome rather
 * than a breakdown: the same words reach the cell's `title`, the popover a
 * press-and-hold opens, and the accessible name's `changes nothing` clause, and
 * one builder is what stops the three saying different things.
 *
 * Three shapes, in the order a reader meets them:
 *
 * ```
 * Armour class — sets to 18
 * Only while Equipped, which holds now
 * ```
 * ```
 * Abilities · STR — item +1
 * Not applied: a larger item bonus applies
 * ```
 * ```
 * "Belt of Giant Strength" is not a modifier this layout declares.
 * Choose one it does, or add it in the layout editor.
 * ```
 *
 * **The suppression is said in preference to the condition**, where a row has
 * both: a row whose condition holds and whose bonus lost is not applying, and
 * "which holds now" over a row that changed nothing would be the more misleading
 * half of a true pair.
 */
export function modifierOutcomeText(
	/** The part's text as the note spells it. */
	stored: string,
	outcome: ModifierOutcome,
): string {
	const { definition, typed } = outcome;
	if (definition === null && typed === null) {
		// The one shape that names the cell's own text rather than a target: there
		// is no modifier to name a target with, and the spelling is the thing
		// the reader has to recognise as theirs before they replace it.
		return [
			`"${stored}" is not a modifier this layout declares.`,
			'Choose one it does, or add it in the layout editor.',
		].join('\n');
	}
	/*
	 * **The five slots, from whichever tier holds them.** Nothing below this line
	 * differs by tier, which is the property to keep: a row reading `item +2`
	 * because a definition said so and one reading `item +2` because the reader
	 * typed it are the same sentence about the same arithmetic.
	 */
	const operator: ModifierOperator =
		definition !== null ? (definition.operator ?? 'add') : (typed?.operator ?? 'add');
	const bonusType =
		definition !== null ? definition.bonusType : typed?.bonusType;
	const when = (definition !== null ? definition.when : typed?.when) ?? '';
	// An amount of null is an expression that would not resolve, or one the reader
	// has not typed yet, and the reason is in `suppressed`; the line then says what
	// kind of change it is without claiming a number nobody could work out.
	const did =
		outcome.amount === null
			? operator === 'override'
				? 'sets a value'
				: `${bonusType === undefined ? '' : `${bonusType} `}bonus`
			: change({
					operator,
					type: operator === 'override' ? null : (bonusType ?? null),
					amount: outcome.amount,
				});
	const lines = [`${outcome.targetLabel} — ${did}`];
	if (outcome.suppressed !== null) {
		lines.push(`Not applied: ${outcome.suppressed}`);
	} else if (outcome.condition !== null) {
		/*
		 * **"holds" rather than "yes", because the sheet never renders a flag as the
		 * word yes.** `yes` is the *markdown file's* spelling of a toggle; what a
		 * reader sees two cells away is a filled ring, and a two-state ring carries
		 * `aria-pressed` and its plain label, so it never says the word either. A
		 * sentence answering "why is this applying?" with a token from the storage
		 * format made the reader translate.
		 *
		 * And "holds" rather than any wording about the flag itself, because a
		 * condition is an arbitrary expression: it reads as well over
		 * `abilities.STR > 15` as over `Worn`, which "and it is" does not. "now"
		 * earns its place — the condition re-evaluates, so this is a live reading
		 * and not a property of the modifier.
		 */
		lines.push(
			`Only while ${when}, which ${outcome.condition ? 'holds' : 'does not hold'} now`,
		);
	}
	return lines.join('\n');
}

/**
 * How a part is named before its outcome, or null where it names itself.
 *
 * **The layout's name where there is one, and nothing where there is not.** A
 * typed effect has no name and §7's edge says it never will, so it is spelled by
 * *what it does* — which is `modifierOutcomeText`'s own first line, and is why
 * this returns null rather than inventing a word. A stray names itself inside its
 * own first line, so it takes no prefix either: appending one would say the same
 * text twice.
 *
 * Here rather than in the form, because "how is a modifier identified in words" is
 * this module's job and a second answer to it is how a form and a breakdown come
 * apart.
 */
export function modifierPartName(outcome: ModifierOutcome): string | null {
	return outcome.definition === null ? null : outcome.definition.name;
}

/**
 * How a part is identified in a summary: its name, or what it does.
 *
 * The accessible name's and the `title`'s identifying token. A named part is its
 * name; a typed part has none, so it is the outcome's own first line; a stray is
 * the cell's own spelling, which is what the reader has to recognise as theirs.
 */
function partIdentity(modifier: RowModifier): string {
	const { outcome } = modifier;
	if (outcome === null) return modifier.stored;
	if (outcome.definition !== null) return outcome.definition.name;
	if (outcome.typed === null) return modifier.stored;
	return modifierOutcomeText(modifier.stored, outcome).split('\n')[0] as string;
}

/**
 * One name a row's modifier cell holds, and what it comes to on that row.
 *
 * Exported because the two builders below own the shape and Table is the caller.
 * `outcome` is null where there is no sheet to ask — a component drawn with no
 * layout around it — which is the same absence `modifierBreakdown` takes an
 * undefined breakdown for.
 */
export interface RowModifier {
	/** The name the cell holds, as the note spells it. */
	stored: string;
	outcome: ModifierOutcome | null;
}

/**
 * A row's stored names paired with what each comes to on that row.
 *
 * A constructor beside the two builders that take the shape, because the mapping
 * is the same at both call sites that need it — the cell, which asks the sheet's
 * context, and the fixture check, which asks the same context a different way —
 * and a shape with two spellings of how it is built is a shape that can be built
 * wrong once.
 *
 * `ask` returns null where there is no sheet to ask, which is a component drawn
 * with no layout around it.
 */
export function rowModifiers(
	names: readonly string[],
	ask: (name: string) => ModifierOutcome | null,
): RowModifier[] {
	return names.map((stored) => ({ stored, outcome: ask(stored) }));
}

/** Whether this line is changing a value. Null is not an answer, so it is no. */
function applying(modifier: RowModifier): boolean {
	return modifier.outcome?.applies === true;
}

/**
 * What a row's modifiers are doing, as one block of text for a `title`.
 *
 * **Two shapes, and the second is a summary rather than a truncated detail.** One
 * modifier is `modifierOutcomeText` unchanged — the target, what it does, and why
 * not on a second line. Several is one line each, with the *fact* of a
 * non-applying line inline and the reason left to the popup, so the block stays
 * bounded however many the row applies:
 *
 * ```
 * Strength — item +2
 * Armour class — circumstance +1
 * Passive perception — item +2 (changes nothing)
 * ```
 *
 * Null where there is nothing to say: an empty cell, or a cell whose names have
 * no sheet to resolve against. A caller cannot then set a `title` over nothing,
 * which is `modifierBreakdown`'s own rule about a mark and its text being one
 * fact.
 *
 * **A stray takes no `(changes nothing)` clause**, because its own first line
 * already says the layout declares no modifier of that name, which *is* the fact
 * the clause carries. Appending it would say one thing twice.
 */
export function modifierRowText(
	modifiers: readonly RowModifier[],
): string | null {
	const said = modifiers.filter(
		(modifier): modifier is RowModifier & { outcome: ModifierOutcome } =>
			modifier.outcome !== null,
	);
	if (said.length === 0) return null;
	if (said.length === 1) {
		const only = said[0] as RowModifier & { outcome: ModifierOutcome };
		return modifierOutcomeText(only.stored, only.outcome);
	}
	return said
		.map((modifier) => {
			const first = modifierOutcomeText(modifier.stored, modifier.outcome).split(
				'\n',
			)[0] as string;
			// A stray takes no `(changes nothing)` clause: its own first line already
			// says the layout declares no modifier of that name, which *is* the fact
			// the clause carries. A typed part earns one exactly as a named one does.
			const known =
				modifier.outcome.definition !== null || modifier.outcome.typed !== null;
			return known && !applying(modifier) ? `${first} (changes nothing)` : first;
		})
		.join('\n');
}

/**
 * The accessible name for a row's modifier control (`docs/UI.md` §6).
 *
 * The level ring's own `${label}: ${state}` shape rather than a fifth way of
 * saying a control's state, in five forms:
 *
 * ```
 * Modifiers                                  (no modifier on this row)
 * Modifiers: Plate armour                    (one, applying)
 * Modifiers: Plate armour, changes nothing   (one, not applying)
 * Modifiers: 2 applying                      (several, all applying)
 * Modifiers: 2 applying, 1 changing nothing  (several, one not)
 * ```
 *
 * **The several-form gives a count and not the names, and that is parity rather
 * than a shortcut.** A sighted reader gets no names from the glyph either — one
 * bolt, however many modifiers — so naming three items in a cell a screen reader
 * is arrowing through would be *more* than the paint says, at the cost of the row
 * taking three times as long to pass. The names are one press away for both
 * readers, in the same popup.
 */
export function modifierRowName(
	/** The column's own heading, which is the thing being named. */
	label: string,
	modifiers: readonly RowModifier[],
): string {
	if (modifiers.length === 0) return label;
	if (modifiers.length === 1) {
		const only = modifiers[0] as RowModifier;
		// **A typed part is spelled by what it does**, because it has no name to be
		// spelled by (§7's edge) — `Modifiers: Armour class — item +2`. One builder,
		// so a row reading `item +2` and a breakdown reading `item +2` cannot come
		// apart.
		const said = partIdentity(only);
		return applying(only)
			? `${label}: ${said}`
			: `${label}: ${said}, changes nothing`;
	}
	const on = modifiers.filter(applying).length;
	const off = modifiers.length - on;
	// "2 applying" and not "2 of 3": the reader is asking what this row is doing,
	// and a fraction makes them do the subtraction to find out.
	const said = `${label}: ${on} applying`;
	return off === 0 ? said : `${said}, ${off} changing nothing`;
}
