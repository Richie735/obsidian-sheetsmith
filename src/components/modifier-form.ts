/*
 * The form a modifier glyph opens: what the row's modifiers are, and how to
 * change them (SPEC §4.2, §7).
 *
 * **A form and not a menu, and that is a mechanism decision rather than a
 * preference.** Obsidian's `Menu` closes on selection and `MenuItem` takes a
 * title, an icon and a click, so a target select, an operator select, an amount
 * field, a bonus-type select and a condition field cannot live in one. What draws
 * it is `ui/anchored-panel.ts`, which knows nothing about modifiers; what fills it
 * is this file, which knows what a modifier is and nothing about vaults, files or
 * placement.
 *
 * **It knows the *shape* of a modifier and none of its meaning.** The five slots
 * are here because the form writes them; the parse and the spelling are
 * `parse/modifier-cell.ts`'s, the resolution is `formula/`'s, the labels and the
 * option lists arrive as arguments. Nothing here decides what an operator does or
 * what a bonus type means arithmetically.
 *
 * **It imports nothing from `obsidian`** — not even `setIcon`, which arrives as a
 * callback. The component layer's allowlist is one name long and the config says
 * adding to it "is the decision; inheriting the precedent is not", so a second
 * file taking it would be inheriting rather than deciding.
 *
 * **It touches no file** (PATTERNS §5). Every edit is reported: a cell rewrite
 * through `onCommit`, and §8's layout append through `onPromote`, which the sheet
 * view implements and which answers with a value rather than throwing.
 *
 * **It commits per field and there is no OK button.** Three reasons: a form with
 * its own commit button would be a second commit regime on one sheet, where every
 * other stored value commits through `editable.ts`; there is no whole-form cancel
 * to design, and no half-built effect held in memory across a re-render; and a
 * half-built effect changes nothing and is not an error (§6), which is what stops
 * per-field commit blanking a card while the reader is still typing.
 *
 * **It is here for atomicity and not for reuse**, which is the entry
 * `eslint.config.mts`' sibling allowlist and `PATTERNS.md` §2 both now carry. It has
 * exactly one consumer, where `card-face.ts` and `linked-text.ts` have three each and
 * `modifier-breakdown.ts` five — and §1 is explicit that one consumer earns no
 * generalisation. What forced the split is that `table.ts` was 2450 lines and drawing
 * a six-field form is a second job in a file whose job is a table, which is the Pool
 * engine's precedent exactly.
 *
 * **It has no test file, and that is argued rather than inherited.** `PATTERNS.md`
 * §11 settled the rule for `editor/`: a module with its own entry point *and* its own
 * reportable output earns one. This has the first and **not** the second — every
 * sentence it puts in front of a reader belongs to somebody else. The three name
 * refusals are `parse/modifier-cell.ts`'s `unspellableName`, tested there; a failed
 * promotion shows the host's own `result.error`, tested in `view/promote-flow.test.ts`
 * and in `layouts.ts`' refusals; and the words for what a modifier *does* are
 * `modifier-breakdown.ts`'s, tested there. What is left here is labels and markup,
 * driven end to end from `table.test.ts` — which is `card-face.ts`'s position, the
 * closest thing in this folder to what this file is.
 *
 * That answer is a consequence of where the parse and the sentences ended up, so it
 * moves if they do: **give this file a test the moment it authors a report of its
 * own**, and the §11 rule is the reason rather than the file's size.
 */

import {
	ModifierDefinitionView,
	ModifierOutcome,
	ModifierTarget,
	PromoteResult,
	TypedEffect,
} from '../types';
import { bindEditable } from '../interaction/editable';
import {
	spellTypedEffect,
	unspellableName,
	withoutPart,
} from '../parse/modifier-cell';
import {
	modifierOutcomeText,
	modifierPartName,
} from './modifier-breakdown';

/** The one option that is not a definition: the row spells its own effect. */
const TYPED_OPTION = 'sheetsmith-typed';

/** The option carrying a stored name the layout declares nothing for. */
const STRAY_OPTION = 'sheetsmith-stray';

/** What the two operators are called, which is what an author picks. */
const OPERATOR_LABELS: Record<'add' | 'override', string> = {
	add: 'Adds to',
	override: 'Sets',
};

/** What a fresh typed part starts as: a target to choose, and nothing else. */
function blankEffect(): TypedEffect {
	return { target: '', operator: 'add', amount: '' };
}

/**
 * Which part the reader has open, and everything else the form is mid-way
 * through.
 *
 * **Held by the panel rather than by this module**, because the sheet re-renders
 * on every committed edit: the grid is rebuilt, the glyph the panel is anchored to
 * is replaced, and the panel is re-anchored and its body redrawn. State in a
 * closure here would be gone by the first commit, which is the whole thing this
 * wave buys over the menu.
 */
export interface ModifierFormState {
	/**
	 * The open part: an index into the cell's parts, or `'new'` for a part the
	 * cell does not hold yet, or null for a list with nothing disclosed.
	 */
	open: number | 'new' | null;
	/**
	 * A part being typed that is not in the cell yet.
	 *
	 * A part with no target could not be spelled in the cell at all (§6's
	 * discriminator needs a name token), so it exists here until **Changes** is
	 * chosen — which is why **Changes** is the first of the four fields rather than
	 * **Amount**.
	 */
	draft: TypedEffect;
	/** The tier change the reader has chosen and not yet confirmed. */
	pending: string | null;
	/** The name being typed under **Reuse this elsewhere**. */
	promoteName: string;
	/** Why the last promotion was refused, or null. */
	promoteProblem: string | null;
	/** Whether **Remove** is armed. */
	armed: boolean;
	/**
	 * Which control had focus, so a rebuild after a commit can put it back.
	 *
	 * The panel is appended to `document.body`, so `view/cell-focus.ts` — which
	 * works over the sheet's own root — never sees it. The token is this surface's
	 * own answer to the same problem.
	 */
	focused: string | null;
}

/** A form with nothing open yet, which is what a press on a filled cell gives. */
export function modifierFormState(parts: readonly string[]): ModifierFormState {
	return {
		// A row with no parts opens straight into one, so the common case is one
		// opening: press the `plus`, choose the value, type the number, done.
		open: parts.length === 0 ? 'new' : null,
		draft: blankEffect(),
		pending: null,
		promoteName: '',
		promoteProblem: null,
		armed: false,
		focused: parts.length === 0 ? 'target' : null,
	};
}

export interface ModifierFormOptions {
	/** The row as a reader sees it, for the panel's own words. */
	label: string;
	/** Every part's own stored text, in the cell's order. */
	parts: readonly string[];
	/** What one part comes to on this row, or null where there is no sheet. */
	outcome: (part: string) => ModifierOutcome | null;
	definitions: readonly ModifierDefinitionView[];
	/** The values a modifier may be aimed at: the form's **Changes** options. */
	targets: readonly ModifierTarget[];
	/** Every published name and its label, so a stray target has a word. */
	published: readonly ModifierTarget[];
	bonusTypes: readonly string[];
	/**
	 * Paint a Lucide icon into an element.
	 *
	 * `setIcon`, handed in rather than imported, so this file imports nothing from
	 * `obsidian` and the component layer's allowlist stays one name long.
	 */
	icon: (into: HTMLElement, name: string) => void;
	/**
	 * Rewrite the cell.
	 *
	 * **Every part's own stored text, with exactly one replaced, added or dropped**,
	 * which is Constraint 3's one new rule: a commit rewrites only the part the
	 * reader edited and re-joins the others byte for byte. This form never
	 * re-spells a part it did not touch, so one edit cannot canonicalise a cell's
	 * other parts as a side effect.
	 */
	onCommit: (parts: readonly string[]) => void;
	/** Append one definition to the layout, then say whether it landed (§8). */
	onPromote: (name: string, effect: TypedEffect) => Promise<PromoteResult>;
	/** Announce something to a screen reader, through the card's live region. */
	announce: (said: string) => void;
	/** Re-measure the panel, after its body has changed height. */
	onResize: () => void;
}

/** Make an element with a class, a parent and optionally its text. */
function make<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	cls: string,
	parent: HTMLElement,
	text?: string,
): HTMLElementTagNameMap[K] {
	const el = parent.ownerDocument.createElement(tag);
	el.className = cls;
	if (text !== undefined) el.textContent = text;
	parent.appendChild(el);
	return el;
}

/** One `<option>`, with its value and its words. */
function option(
	select: HTMLSelectElement,
	value: string,
	text: string,
): void {
	const el = select.ownerDocument.createElement('option');
	el.value = value;
	el.textContent = text;
	select.appendChild(el);
}

/**
 * A labelled control on its own line: the label, then the control.
 *
 * A real `<label>` wrapping its control rather than an `id`/`for` pair, because
 * the panel is built and rebuilt many times per sheet and generated ids would
 * have to be unique across every open panel that ever existed. Wrapping needs no
 * id at all and is the same contract for assistive tech.
 */
function field(
	parent: HTMLElement,
	text: string,
	wide = false,
): HTMLLabelElement {
	const row = make(
		'label',
		wide
			? 'sheetsmith-panel-field sheetsmith-panel-field-wide'
			: 'sheetsmith-panel-field',
		parent,
	);
	make('span', 'sheetsmith-panel-field-label', row, text);
	return row;
}

/** The words for one part in the list: what it is, and why it is not applying. */
function partLines(
	stored: string,
	outcome: ModifierOutcome | null,
): { said: string; why: string | null } {
	if (outcome === null) return { said: stored, why: null };
	const lines = modifierOutcomeText(stored, outcome).split('\n');
	const named = modifierPartName(outcome);
	const first = lines[0] ?? stored;
	return {
		// The identifying half is the surface's, and the outcome half is the shared
		// builder's — so a line here, the `title` on the glyph and a line in the
		// number's breakdown all spell the outcome the same way.
		said: named === null ? first : `${named} · ${first}`,
		why: lines[1] ?? null,
	};
}

/**
 * Draw the form into `body`.
 *
 * Called on every opening and on every state change, including after the sheet
 * has re-rendered around a commit. It clears and rebuilds: the panel's *state*
 * survives, its DOM does not, which is the same bargain the sheet itself makes.
 */
export function renderModifierForm(
	body: HTMLElement,
	state: ModifierFormState,
	options: ModifierFormOptions,
): void {
	body.replaceChildren();
	const { parts } = options;

	const redraw = () => {
		renderModifierForm(body, state, options);
		options.onResize();
	};

	/** Report a cell rewrite with exactly one part replaced, added or dropped. */
	const write = (at: number | 'new', text: string | null): void => {
		if (at === 'new') {
			options.onCommit(text === null ? parts : [...parts, text]);
			return;
		}
		if (text === null) {
			/*
			 * **Removing an enrolment rather than a byte range**, which is
			 * `withoutPart`'s whole argument: a repeated name is *one* enrolment, so
			 * dropping one of two identical names left the row still applying the
			 * modifier — the reader pressed the only control there is, twice, and
			 * nothing came off.
			 */
			options.onCommit(withoutPart(parts, at));
			return;
		}
		const next = parts.slice();
		next[at] = text;
		options.onCommit(next);
	};

	make(
		'div',
		'sheetsmith-panel-heading',
		body,
		/*
		 * **The heading says what a press does, because nothing else on the line
		 * does.** A line is a glyph and words with no chevron and no disclosure mark,
		 * so the only affordance it had was a hover background — which a finger never
		 * sees and a still never shows.
		 *
		 * It read `select to remove` while a press removed a line, and lost the
		 * instruction along with the verb when a press started *opening* one instead.
		 * The verb was the thing that was wrong; the instruction was not.
		 */
		'On this row · select to edit',
	);

	const list = make('div', 'sheetsmith-panel-list', body);
	if (parts.length === 0) {
		// The one place the sheet says the absence in words, and it says it because
		// a reader asked.
		make(
			'p',
			'sheetsmith-panel-empty',
			list,
			'This row applies no modifier.',
		);
	}

	parts.forEach((stored, at) => {
		const outcome = options.outcome(stored);
		const { said, why } = partLines(stored, outcome);
		/*
		 * **How many lines one Remove would take**, which is one wherever a part is
		 * the only one of its enrolment and two or more where a name repeats.
		 * `withoutPart` is the same answer Remove itself uses, so the sentence below
		 * and the button cannot disagree about it.
		 */
		const takes = parts.length - withoutPart(parts, at).length;
		/**
		 * Whether this line is a *later* copy of a name drawn above it.
		 *
		 * The first copy reads as an ordinary line, because it is one; what needs
		 * saying is on the copies, which otherwise draw a second time for a single
		 * enrolment with nothing to distinguish them. **Two identical lines is the
		 * right shape and not the problem** — a typed part is named by nothing (§7's
		 * edge), so two typed `armour_class += 2` parts draw identically with no
		 * duplicate name in sight — so the fix is a sentence rather than a filter.
		 */
		const repeat = takes > 1 && parts.indexOf(stored) < at;
		const open = state.open === at;
		const entry = make('div', 'sheetsmith-panel-entry', list);
		const line = make('button', 'sheetsmith-panel-line', entry);
		line.type = 'button';
		line.setAttribute('aria-expanded', String(open));
		/*
		 * Which tier this line is, as an attribute rather than as a position.
		 *
		 * A test and the harness both have to name *the typed line* on a mixed row,
		 * and an `:nth-child` there goes quietly wrong the next time a fixture grows
		 * a part above it — which this repository has already recorded once, on the
		 * shot that selected a row by state rather than by index.
		 */
		line.dataset.sheetsmithPart =
			outcome === null || (outcome.definition === null && outcome.typed === null)
				? 'stray'
				: outcome.typed !== null
					? 'typed'
					: 'named';
		// The modifier's own words plus its state, which is the whole of what a
		// sighted reader gets from the line and its reason together.
		const spoken = [said, why, repeat ? `one of ${takes} lines naming it` : null]
			.filter((one): one is string => one !== null && one !== '')
			.join(', ');
		line.setAttribute('aria-label', spoken);
		const glyph = make('span', 'sheetsmith-panel-glyph', line);
		glyph.setAttribute('aria-hidden', 'true');
		// The same mark the row's own glyph draws, which is what leaves the icon
		// slot in this list meaning *state*.
		options.icon(glyph, outcome?.applies === true ? 'zap' : 'zap-off');
		const words = make('span', 'sheetsmith-panel-line-words', line);
		make('span', 'sheetsmith-panel-said', words, said);
		if (why !== null) {
			// A quiet line under the line it is about, in the editor's own
			// `.sheetsmith-field-problems` shape.
			make('span', 'sheetsmith-panel-why', words, why);
		}
		if (repeat) {
			// Every line not doing what a reader expects already carries one of
			// these, and this is such a line: it is a second drawing of one
			// enrolment, and **Remove** on either takes both.
			make(
				'span',
				'sheetsmith-panel-why',
				words,
				takes === 2
					? 'Already applied above; removing either takes both'
					: `Already applied above; removing any takes all ${takes}`,
			);
		}
		line.addEventListener('click', () => {
			/*
			 * **One at a time, and no navigation.** Pressing another line closes the
			 * first and opens the second: five controls times three is a panel nobody
			 * can scan, and a back-stack inside a transient surface would be a second
			 * dismissal regime. Disclosure in place keeps the line the reader chose
			 * visible above the fields they are filling in.
			 */
			state.open = open ? null : at;
			state.pending = null;
			state.armed = false;
			state.promoteProblem = null;
			state.promoteName = '';
			state.focused = open ? null : 'modifier';
			redraw();
		});
		if (open) renderFields(entry, state, options, stored, at, write, redraw);
	});

	if (state.open === 'new') {
		const entry = make('div', 'sheetsmith-panel-entry', list);
		renderFields(entry, state, options, null, 'new', write, redraw);
	} else {
		const add = make('button', 'sheetsmith-panel-add', body);
		add.type = 'button';
		const plus = make('span', 'sheetsmith-panel-glyph', add);
		plus.setAttribute('aria-hidden', 'true');
		options.icon(plus, 'plus');
		make('span', 'sheetsmith-panel-add-words', add, 'Add a modifier');
		add.addEventListener('click', () => {
			state.open = 'new';
			state.draft = blankEffect();
			state.pending = null;
			state.focused = 'target';
			redraw();
		});
	}

	// After the rebuild, put focus back where the reader left it. A commit
	// rebuilds this body from under the control that committed, and without this
	// a reader who pressed Enter in **Amount** would be left with focus nowhere.
	if (state.focused !== null) {
		body
			.querySelector<HTMLElement>(
				`[data-sheetsmith-panel-field="${state.focused}"]`,
			)
			?.focus();
	}
}

/**
 * The open part's six fields, its promote row and its **Remove**.
 *
 * `stored` is the part's own text, or null for a part the cell does not hold yet.
 */
function renderFields(
	entry: HTMLElement,
	state: ModifierFormState,
	options: ModifierFormOptions,
	stored: string | null,
	at: number | 'new',
	write: (at: number | 'new', text: string | null) => void,
	redraw: () => void,
): void {
	const fields = make('div', 'sheetsmith-panel-fields', entry);
	/*
	 * **The part's five slots come from `outcome` and are never parsed here**, which
	 * is the whole of "there is exactly one parse of a cell part in the codebase,
	 * and it is on the formula side of the seam". This component spells a part —
	 * `spellTypedEffect`, because it writes the cell — and never reads one. Two
	 * readings of one part's text is the one way this design could have the form and
	 * the number disagree, and `components/isolation.test.ts` scans for the second.
	 *
	 * `definition` and `typed` are never both set, so the three cases below are the
	 * whole of the discrimination the form needs.
	 */
	const outcome = stored === null ? null : options.outcome(stored);
	/** The named definition this part points at, where it points at a live one. */
	const named = outcome?.definition ?? null;
	/**
	 * A part the layout can make nothing of: carried, never corrected.
	 *
	 * **A missing outcome lands here too**, and that is the right home for it rather
	 * than a case of its own: a component drawn with no sheet around it has no
	 * layout to resolve anything against, so every part of every cell is
	 * unresolvable and the honest surface is the one a stray already gets — the
	 * cell's own spelling, carried, with the fields read-only.
	 */
	const stray =
		stored !== null && named === null && (outcome?.typed ?? null) === null
			? stored
			: null;
	/** The effect this row spells out, where it spells one. */
	const typed: TypedEffect | null =
		stored === null ? state.draft : (outcome?.typed ?? null);

	/** Remember which control the reader is in, for the rebuild after a commit. */
	const token = (el: HTMLElement, key: string): void => {
		el.dataset.sheetsmithPanelField = key;
		el.addEventListener('focus', () => {
			state.focused = key;
		});
	};

	const select = (
		text: string,
		key: string,
		wide = false,
	): HTMLSelectElement => {
		/*
		 * The app's own `dropdown`, because the plugin has no control appearance of
		 * its own to give one (`docs/UI.md` §1): a bare `select` on a surface outside
		 * `.sheetsmith-view` draws as the browser's, not as Obsidian's.
		 *
		 * **Argued from `Setting.addDropdown`, which is where the class comes from**,
		 * and not from the layout editor's hand-rolled selects — an earlier version of
		 * this comment pointed at those, which this same diff had just changed, so the
		 * justification was circular. Every select the app builds through its own
		 * `Setting` API carries this class; taking it here is matching the app rather
		 * than matching a sibling.
		 */
		const el = make(
			'select',
			'dropdown sheetsmith-panel-select',
			field(fields, text, wide),
		);
		token(el, key);
		return el;
	};
	const text = (label: string, key: string): HTMLInputElement => {
		const el = make('input', 'sheetsmith-panel-input', field(fields, label));
		el.type = 'text';
		token(el, key);
		return el;
	};

	/** What the part's five slots read, whichever tier it came from. */
	const shown: TypedEffect =
		named !== null
			? {
					target: named.target,
					operator: named.operator ?? 'add',
					amount: named.amount,
					...(named.applies === undefined ? {} : { applies: named.applies }),
					...(named.bonusType === undefined ? {} : { bonusType: named.bonusType }),
					...(named.when === undefined ? {} : { when: named.when }),
				}
			: (typed ?? blankEffect());
	/** Whether the reader may edit those five slots on this row. */
	const editable = typed !== null;

	/** Write this part with one field changed, and re-spell nothing else. */
	const put = (next: Partial<TypedEffect>): void => {
		/*
		 * **A draft composes onto the live draft, not the render-time snapshot.**
		 * `shown` is captured when the fields were drawn, and a commit does not redraw
		 * them — the sheet's own re-render does, one `await` later. So a reader who
		 * chose **Changes** and typed an **Amount** inside that window composed the
		 * amount onto a *blank* snapshot, which had no target, and the amount was
		 * silently dropped.
		 */
		const base = stored === null ? state.draft : shown;
		const effect: TypedEffect = { ...base, ...next };
		if (effect.operator === 'override') {
			delete effect.bonusType;
			// An override is in the result phase by construction, so a phase stored
			// beside it would be a second answer to a settled question.
			delete effect.applies;
		}
		// The value phase is the absent key, so choosing it clears rather than
		// stores — one spelling per meaning, in the cell and in the layout alike.
		if (effect.applies === 'value') delete effect.applies;
		if (stored === null) {
			state.draft = effect;
			// A part with no target cannot be spelled in a cell at all, so it stays
			// a draft until **Changes** is chosen.
			if (effect.target === '') {
				redraw();
				return;
			}
			/*
			 * The index the part will hold once the sheet has re-rendered around this
			 * commit — and **the draft keeps the effect rather than being blanked**.
			 *
			 * Blanking it lost the next field: a commit does not redraw this body, the
			 * sheet's own re-render does, and that is one `await` away. A reader who
			 * chose **Changes** and typed an **Amount** inside that window had the
			 * amount silently dropped, because the second `put` composed onto a blank
			 * draft, found no target and wrote nothing. Keeping the effect makes the
			 * second commit overwrite the first — one part, not two, which is also the
			 * "does not append a twin" half of Constraint 3's criterion.
			 *
			 * Nothing depends on the reset: **Add a modifier** blanks the draft itself,
			 * which is the one gesture that means "start another".
			 */
			state.open = options.parts.length;
		}
		write(at, spellTypedEffect(effect));
	};

	/*
	 * **Modifier**: the one control that decides which tier this part is.
	 *
	 * `Typed on this row` first, then every definition the layout declares, each
	 * resolved against this row so it reads `Bull's Strength · Strength — status +1`
	 * rather than a bare name — which is the whole difference between a picker and a
	 * list of words. One `outcome` call per definition, on a **press**, which
	 * happens after a render has finished, so these can never be the first entry
	 * into the modifier walk in a render.
	 *
	 * **It takes the panel's whole width, and it is the only field that does.** A
	 * resolved definition is a sentence — `Plate armour · Armour class — sets to 18`
	 * — and beside a 6.5em label column there was room for about two-thirds of one,
	 * so the shot showed it cut mid-word under the chevron. The resolution is the
	 * entire reason this control is a picker rather than a list of names, so the
	 * field that cannot hold it is the field that is wrong. Stacked here and nowhere
	 * else on purpose: the other five are short values that read as a column, and
	 * this one is a different question — which tier the part is — asked above them.
	 */
	const tier = select('Modifier', 'modifier', true);
	option(tier, TYPED_OPTION, 'Typed on this row');
	for (const definition of options.definitions) {
		const said = options.outcome(definition.name);
		const lines =
			said === null ? [] : modifierOutcomeText(definition.name, said).split('\n');
		option(
			tier,
			definition.name,
			lines[0] === undefined
				? definition.name
				: `${definition.name} · ${lines[0]}`,
		);
	}
	if (stray !== null) {
		// Carried as its own option and never offered otherwise: §4.2's rule for a
		// Card's stray stored option, read on the control that replaced the one it
		// was first read on.
		option(tier, STRAY_OPTION, `${stray} · not a modifier this layout declares`);
	}
	tier.value = stray !== null ? STRAY_OPTION : named !== null ? named.name : TYPED_OPTION;
	tier.addEventListener('change', () => {
		/*
		 * **A tier change arms and commits**, and the select's own change is the
		 * first of the two gestures: it writes nothing. Both directions are
		 * destructive — picking a definition replaces the row's own text, and
		 * detaching replaces the name with a copy of the definition's fields — so
		 * neither may land on a stray press.
		 */
		state.pending = tier.value;
		redraw();
	});

	if (state.pending !== null) {
		const box = make('div', 'sheetsmith-panel-pending', fields);
		const detaching = state.pending === TYPED_OPTION;
		make(
			'p',
			'sheetsmith-panel-why',
			box,
			detaching
				? "This copies the modifier's fields onto this row, so editing the layout will no longer change it."
				: "This replaces what this row says with the layout's own modifier.",
		);
		const confirm = make('button', 'sheetsmith-panel-confirm', box);
		confirm.type = 'button';
		confirm.textContent = detaching ? 'Copy onto this row' : 'Use this modifier';
		token(confirm, 'confirm');
		confirm.addEventListener('click', () => {
			const chosen = state.pending;
			state.pending = null;
			if (chosen === null || chosen === STRAY_OPTION) {
				redraw();
				return;
			}
			if (chosen === TYPED_OPTION) {
				// Foundry's own #4451 "detach to instance", one-way. **Not the cache
				// §1 forbids**: a cache is a copy of what something else still owns,
				// and a detached effect is the effect itself, owned by this row from
				// now on and referring to nothing.
				put({ ...shown });
				return;
			}
			write(at, chosen);
		});
		const cancel = make('button', 'sheetsmith-panel-cancel', box, 'Keep it as it is');
		cancel.type = 'button';
		token(cancel, 'cancel');
		cancel.addEventListener('click', () => {
			state.pending = null;
			redraw();
		});
	}

	/*
	 * **Changes**: the accepting targets, by their reader-facing labels. A stored
	 * target outside the set is carried and never offered — the sheet's own half of
	 * dnd5e#3900's check, because a typed effect's target lives in a file the layout
	 * has never seen.
	 */
	const changes = select('Changes', 'target');
	if (shown.target === '') option(changes, '', 'Choose a value');
	for (const target of options.targets) {
		option(changes, target.name, target.label);
	}
	if (
		shown.target !== '' &&
		!options.targets.some((target) => target.name === shown.target)
	) {
		const label =
			options.published.find((target) => target.name === shown.target)?.label ??
			shown.target;
		option(changes, shown.target, `${label} (reads no modifier)`);
	}
	changes.value = shown.target;
	changes.disabled = !editable;
	changes.addEventListener('change', () => {
		put({ target: changes.value });
	});

	const operator = select('Operator', 'operator');
	for (const id of ['add', 'override'] as const) {
		option(operator, id, OPERATOR_LABELS[id]);
	}
	operator.value = shown.operator;
	operator.disabled = !editable;
	operator.addEventListener('change', () => {
		put({ operator: operator.value === 'override' ? 'override' : 'add' });
	});

	/*
	 * **Amount**, on `editable.ts`'s own gesture: type, Enter or blur commits,
	 * Escape abandons. No `arithmetic`, because an amount is an expression and
	 * settling `Qty * 2` to a number would evaluate it against nothing.
	 */
	const amount = text('Amount', 'amount');
	amount.value = shown.amount;
	amount.readOnly = !editable;
	if (editable) {
		bindEditable(amount, {
			initial: shown.amount,
			announceCommit: (next) =>
				options.announce(next === '' ? 'Amount cleared' : `Amount ${next}`),
			announceRestore: () => options.announce('Amount restored'),
			onCommit: (next) => put({ amount: next }),
		});
	}

	/*
	 * **Applies to**, and like **Bonus type** it is **not offered on Sets**: an
	 * override replaces the published number, which is the result phase by
	 * construction, so a choice there would be a second spelling for one
	 * behaviour.
	 *
	 * **Above Bonus type because it is the coarser question.** The phase decides
	 * *which number* moves; the type decides how this modifier contests with the
	 * others already moving it. Asked the other way round, a reader picks how a
	 * bonus stacks before they have said what it stacks against.
	 *
	 * The words are the reader's rather than the engine's: `value` and `result`
	 * are what a layout file stores, and neither is a thing a player has ever seen
	 * on their sheet. What they have seen is a score with a modifier over it.
	 */
	if (shown.operator !== 'override') {
		const phase = select('Applies to', 'applies');
		option(phase, 'value', 'The value');
		option(phase, 'result', 'The derived number');
		phase.value = shown.applies === 'result' ? 'result' : 'value';
		phase.disabled = !editable;
		phase.addEventListener('change', () => {
			put({ applies: phase.value === 'result' ? 'result' : 'value' });
		});
	}

	/*
	 * **Bonus type**, and it is **not offered on Sets**: an override is not
	 * contested by type, so a select there would offer a choice with no arithmetic
	 * behind it.
	 */
	if (shown.operator !== 'override') {
		const bonus = select('Bonus type', 'bonus-type');
		option(bonus, '', 'Untyped');
		for (const name of options.bonusTypes) option(bonus, name, name);
		const held = (shown.bonusType ?? '').trim();
		if (held !== '' && !options.bonusTypes.includes(held)) {
			// **Rendered, not corrected.** The effect applies and contests as its own
			// kind; this is the one thing stored in a note that names the layout's
			// vocabulary, and §10 gains a rule where it had a construction guarantee.
			option(bonus, held, `${held} (not declared)`);
		}
		bonus.value = held;
		bonus.disabled = !editable;
		bonus.addEventListener('change', () => {
			put({ bonusType: bonus.value });
		});
	}

	/*
	 * **Only when**, and a read-only blank one is not drawn at all.
	 *
	 * The four read-only fields are a printed summary rather than four quieted
	 * controls, which is what gives read-only its second channel — so a row whose
	 * value is empty is a label with nothing after it, which reads as a fault in the
	 * summary rather than as "no condition". An editable one always draws: blank is
	 * where the reader types. Same rule **Bonus type** already follows for **Sets**:
	 * a field with nothing to say is not shown, rather than shown saying nothing.
	 */
	const when = text('Only when', 'when');
	if (!editable && (shown.when ?? '') === '') when.parentElement?.remove();
	when.value = shown.when ?? '';
	when.readOnly = !editable;
	if (editable) {
		bindEditable(when, {
			initial: shown.when ?? '',
			announceCommit: (next) =>
				options.announce(next === '' ? 'Condition cleared' : `Only when ${next}`),
			announceRestore: () => options.announce('Condition restored'),
			onCommit: (next) => put({ when: next }),
		});
	}

	if (named !== null) {
		// One line saying where they are edited, because one edit there moves every
		// character on the layout at once and a sheet that could make that edit
		// would be a far larger change than this feature (SPEC §7).
		make(
			'p',
			'sheetsmith-panel-why',
			fields,
			'This modifier belongs to the layout. Edit it in the layout editor, where it changes every character using it.',
		);
	}

	/*
	 * **Remove sits above the promote block, not under it** (D6). Below, it opened a
	 * hairline under `Reuse this elsewhere`, sat 4px beneath the name field at the
	 * same left edge with no rule between them, and the only bordered box on the
	 * line was the promote one — so the destructive control for the *whole part* read
	 * as belonging to the naming block, and "Remove" is a word that could plausibly
	 * be read as removing the name. Directly under the six fields it is about the
	 * part, which is what it takes; and it lands in the same place for a named part,
	 * which draws no promote block at all.
	 */
	if (stored !== null && at !== 'new') {
		renderRemove(fields, state, options, at, write, redraw);
	}

	/*
	 * **And only once the effect is one.** `editable` alone offered the promote row
	 * on a part with nothing in it, which is exactly the state the panel opens in on
	 * an empty cell — so the last word on the first-use path was a publish control
	 * for an effect that did not exist, above a form the reader had not started
	 * filling in. The name field would take a name and `Save to the layout` would
	 * append a definition that changes nothing.
	 *
	 * A target and an amount are the two slots a part needs to do anything (§6: a
	 * part with no amount contributes nothing), so they are the two the offer waits
	 * for. It appears the moment the effect is real, in place, with no gesture —
	 * which is the same disclosure the fields themselves use.
	 */
	if (editable && shown.target !== '' && shown.amount.trim() !== '') {
		renderPromote(fields, state, options, shown, at, write, redraw);
	}
}

/**
 * **Reuse this elsewhere**: a name, and one button that appends a definition.
 *
 * Only the reader of a *typed* part is offered it; a part that already names a
 * definition has nothing to promote. The button says what happens rather than
 * naming a mechanism — "promote" is SPEC §7's word for the operation and
 * not a word any reader of the sheet ever sees.
 */
function renderPromote(
	fields: HTMLElement,
	state: ModifierFormState,
	options: ModifierFormOptions,
	effect: TypedEffect,
	at: number | 'new',
	write: (at: number | 'new', text: string | null) => void,
	redraw: () => void,
): void {
	const box = make('div', 'sheetsmith-panel-promote', fields);
	make('div', 'sheetsmith-panel-heading', box, 'Reuse this elsewhere');
	const row = make('div', 'sheetsmith-panel-promote-row', box);
	const name = make('input', 'sheetsmith-panel-input', row);
	name.type = 'text';
	name.value = state.promoteName;
	name.setAttribute('aria-label', 'Name this modifier');
	name.placeholder = 'Name it';
	name.dataset.sheetsmithPanelField = 'promote-name';
	name.addEventListener('focus', () => {
		state.focused = 'promote-name';
	});
	// Held per keystroke rather than through `editable.ts`, because this is not a
	// stored value: nothing is written until the button is pressed, and a draft
	// that vanished on blur would lose a name the reader had just typed.
	name.addEventListener('input', () => {
		state.promoteName = name.value;
	});
	const save = make('button', 'sheetsmith-panel-save', row, 'Save to the layout');
	save.type = 'button';
	save.dataset.sheetsmithPanelField = 'promote';
	save.addEventListener('focus', () => {
		state.focused = 'promote';
	});
	save.addEventListener('click', () => {
		const chosen = state.promoteName.trim();
		/*
		 * Three of §8's four refusals are checked here as well as by the writer, so
		 * the refusal arrives where the name is being typed rather than in another
		 * pane afterwards — **and through the builder that owns the sentences**, so a
		 * reader who meets the rule here and in the layout editor's report meets one
		 * sentence rather than two copies of it. The fourth needs the file and is
		 * `onPromote`'s.
		 */
		const unspellable = unspellableName(chosen);
		if (unspellable !== null) {
			state.promoteProblem = unspellable;
			redraw();
			return;
		}
		state.promoteProblem = null;
		void options.onPromote(chosen, effect).then((result) => {
			if ('error' in result) {
				state.promoteProblem = result.error;
				redraw();
				return;
			}
			/*
			 * **The layout landed, so now the cell becomes a reference** — the order
			 * is the whole of Constraint 4 here, and a failed write above leaves the
			 * cell exactly as it was.
			 *
			 * The row that promoted it *converts* rather than keeping its formula, on
			 * §1's own spine: an inline copy left standing beside the definition it
			 * was lifted from is a cache of what that definition says, and one edit
			 * to the definition later would have the row and the library disagreeing
			 * with nothing on the sheet to say which was meant. Other rows holding
			 * identical text are untouched — that search is the migration §10
			 * declines to perform.
			 */
			state.promoteName = '';
			options.announce(`Saved "${chosen}" to the layout`);
			write(at, chosen);
		});
	});
	if (state.promoteProblem !== null) {
		make('p', 'sheetsmith-panel-problem', box, state.promoteProblem);
	}
}

/**
 * **Remove**, on the sheet's own destructive gesture: arm, then commit.
 *
 * A control rather than a press on a line, because a press on a line now *opens*
 * it and one gesture cannot both open and delete. It borrows
 * `.sheetsmith-table-remove-button`'s two-step rather than inventing one, and it
 * drops that part alone.
 */
function renderRemove(
	fields: HTMLElement,
	state: ModifierFormState,
	options: ModifierFormOptions,
	/** Always a real index: a part the cell does not hold yet has nothing to remove. */
	at: number,
	write: (at: number | 'new', text: string | null) => void,
	redraw: () => void,
): void {
	/*
	 * **What it would take, which is not always one line** (D2). A repeated name is
	 * one enrolment, so `withoutPart` drops every copy — and a control saying
	 * "Remove this modifier" in the one state where it removes two is naming less
	 * than it takes, which is what `docs/UI.md` §9 asks an irreversible control not
	 * to do. A screen-reader user on a duplicate otherwise hears one removal and
	 * loses two lines.
	 *
	 * The same `withoutPart` the commit uses, so the words and the write cannot
	 * disagree about the count.
	 */
	const takes = options.parts.length - withoutPart(options.parts, at).length;
	const plural = takes > 1;
	const named = plural
		? `Remove this modifier from all ${takes} lines that name it`
		: 'Remove this modifier';

	const button = make('button', 'sheetsmith-panel-remove', fields);
	button.type = 'button';
	button.classList.toggle('sheetsmith-panel-remove-armed', state.armed);
	button.textContent = state.armed
		? `${plural ? `Remove all ${takes}` : 'Remove'} — select again`
		: plural
			? `Remove all ${takes}`
			: 'Remove';
	button.setAttribute(
		'aria-label',
		state.armed ? `${named}. Select again to confirm.` : named,
	);
	button.dataset.sheetsmithPanelField = 'remove';
	button.addEventListener('focus', () => {
		state.focused = 'remove';
	});
	/*
	 * **Arming triggers its own blur, and the listener below must not answer it.**
	 * `redraw()` clears `body` with `replaceChildren()`, which removes this very
	 * button — still focused from the click that is arming it — and a focused
	 * element being detached fires `blur` on it synchronously, mid-teardown. Left
	 * unguarded, that blur read `state.armed` as true (this click had just set it)
	 * and called `redraw()` a second time while the first `replaceChildren()` was
	 * still tearing down the same body, which is two removals racing one node and
	 * throwing `NotFoundError`. The flag marks a blur this button caused for
	 * itself so only a blur from the reader moving away for real disarms it.
	 */
	let armingBlur = false;
	button.addEventListener('click', () => {
		if (state.armed) {
			state.armed = false;
			state.open = null;
			write(at, null);
			return;
		}
		state.armed = true;
		armingBlur = true;
		options.announce(`${named}? Select again to confirm.`);
		redraw();
	});
	// A keyboard has both gestures a finger does not: focus moves off, and Escape.
	button.addEventListener('blur', () => {
		if (armingBlur) {
			armingBlur = false;
			return;
		}
		if (!state.armed) return;
		state.armed = false;
		redraw();
	});
}
