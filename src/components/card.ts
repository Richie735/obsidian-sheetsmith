/*
 * Card — one named value on a single card (SPEC §4.2). Covers armour class,
 * initiative, speed, passive perception: the standalone numbers a sheet is
 * littered with, each with a qualifier the number itself cannot carry
 * ("chain mail, shield", "ft.").
 *
 * The card shows the label, the value, and the note line. The storage key is
 * config, not display: it names the entry in the note's sheet block so hand
 * editing reads well, and it never appears on the card.
 *
 * **It is also the dropdown, and that is why there is no Field component**
 * (SPEC §13). A labelled text or number value was already this, with the note
 * line hidden; the only thing Field carried that a Card did not was a closed
 * set of choices, which is the `options` list below. Declaring any is what
 * makes the value a menu, so nothing here says which control to draw — the
 * layout already said it by listing choices or not. Text against number needs
 * no setting either: the arrow keys step a value that is a number and move the
 * caret in one that is not, so the kind is a property of what is stored.
 */

import { referencesName } from '../formula/expression';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ScopeValues,
	showsOwnLabel,
} from '../types';
import { renderCardFace, toDerived } from './card-face';
import { modifierBreakdown } from './modifier-breakdown';

/**
 * SPEC §3.1: single-value components store their value under `value`, so
 * hand-editing any of them looks the same. A layout may override it with a
 * key that reads better in the file, e.g. `AC`. It changes the note only;
 * formulas reference the component's id, never its storage key.
 */
const DEFAULT_KEY = 'value';

/** Entry holding the note line. Fixed, so no configured key can collide. */
const NOTE_KEY = 'note';

/**
 * One choice a card's value may hold (SPEC §2).
 *
 * The `value` is what the note stores and what a formula reads; the `label`
 * is what the card shows, and is unreachable from a formula. So a choice
 * worth arithmetic stores the number and shows the word — `2` labelled
 * "Expertise" — and a list of plain words needs no labels at all.
 */
export interface CardOption {
	value: string;
	label?: string;
}

export interface CardConfig extends ComponentConfig {
	type: 'card';
	/** Entry key in the fenced block. Defaults to `value`. Never displayed. */
	key?: string;
	/**
	 * Choices for the value. Declaring any is what makes the card a dropdown
	 * over them rather than a field, so there is no setting saying which
	 * control it wears (SPEC §4.2).
	 */
	options?: CardOption[];
	/** Formula computed from the stored value, which it reads as `value`. */
	derived?: string;
	/**
	 * What the value pill reads once modifiers are applied; `value` is the
	 * stored value, as in `derived`. Blank leaves the pill the stored number,
	 * which is what every card did before this existed.
	 */
	effective?: string;
	/** Hint shown while the note line is empty. */
	notePlaceholder?: string;
	hideLabel?: boolean;
	hideValue?: boolean;
	hideNote?: boolean;
	/** Prefix non-negative derived numbers with "+". Defaults to true. */
	signed?: boolean;
}

export interface CardData {
	/**
	 * Raw stored value. Absent means "not part of this change": an edit is
	 * reported as a delta of the one field the user touched, so a commit
	 * racing a rebuild can never write back a stale sibling field.
	 */
	value?: string;
	/** The note line. Absent follows the same rule; empty clears it. */
	note?: string;
}

/**
 * The fenced entry key for the value, or the reason it cannot be one. Both
 * checks guard the file format rather than taste: a colon is what separates
 * key from value in the block, and `note` is already spoken for.
 */
function valueKey(config: CardConfig): { key: string } | { error: string } {
	const key = (config.key ?? '').trim();
	if (key === '') return { key: DEFAULT_KEY };
	if (/[:\r\n]/.test(key)) {
		return {
			error: 'The key cannot contain a colon or a line break, because the sheet block separates key from value with a colon.',
		};
	}
	if (key === NOTE_KEY) {
		return { error: `The key "${NOTE_KEY}" is reserved for the note line.` };
	}
	return { key };
}

/**
 * The card's choices, or the reason they cannot be a menu. Same shape as
 * `valueKey` above, and both checks are about the file rather than about
 * taste: a value is what the note stores, and a `<select>` holding one value
 * twice cannot say which line was chosen, so the card could not round-trip
 * its own control.
 *
 * No options is not an error and not a dropdown — it is the field a Card has
 * always been.
 */
function optionList(
	config: CardConfig,
): { options: CardOption[] } | { error: string } {
	const options: CardOption[] = [];
	const seen = new Set<string>();
	for (const option of config.options ?? []) {
		// Trimmed because the fenced block's own values are: a stored value
		// arrives from `readFenced` with its spaces gone, so an option holding
		// them could never match one — the reader would choose it, the note
		// would store it trimmed, and the next render would show it as a value
		// the layout no longer offers.
		const value = (option.value ?? '').trim();
		if (value === '') {
			return {
				error: 'Every option needs a value, because the value is what the note stores. A label may be left blank; an option with none shows its value.',
			};
		}
		if (seen.has(value)) {
			return {
				error: `Two options share the value "${value}". Give each option a value of its own; only the labels may repeat.`,
			};
		}
		seen.add(value);
		options.push(option.label === undefined ? { value } : { value, label: option.label });
	}
	return { options };
}

/**
 * The choices the card draws its value with, or the first reason it cannot be
 * drawn at all. Both faults are the file's rather than taste's, and both are
 * reported on this card alone (SPEC §10).
 *
 * The key is checked first: a card that cannot store its value has nothing for
 * a menu to choose, and one error at a time is what the card has room to say.
 * Held together in one place because `render` and `scopeValues` have to agree
 * about it — a card that cannot draw its own control must not publish a name
 * the rest of the sheet would then be built on.
 */
function drawableCard(
	config: CardConfig,
): { options: CardOption[] } | { error: string } {
	const entry = valueKey(config);
	if ('error' in entry) return entry;
	return optionList(config);
}

export const card: ComponentDefinition<CardConfig, CardData> = {
	type: 'card',
	storage: 'fenced',
	formulaFields: ['derived', 'effective'],
	configFields: [
		{
			key: 'key',
			kind: 'text',
			label: 'Key',
			description:
				'Entry name for the value in the character note, e.g. "AC". Not shown on the card, and not what formulas reference — they use the component id above. Defaults to "value". Renaming it does not move a stored value; the old entry stays in the note under the old key.',
		},
		{
			key: 'options',
			kind: 'entries',
			label: 'Options',
			entryColumns: [
				// The value is the word here and the label is usually blank,
				// which is the opposite of a Card set's key and full name.
				{ key: 'value', heading: 'Value', wide: true },
				{ key: 'label', heading: 'Label' },
			],
			description:
				'Turns the value into a dropdown over these choices. The value is what the character note stores and what a formula reads; the label is what the card shows, and an option with no label shows its value. A formula cannot read a label, so a choice worth arithmetic stores the number and shows the word — 2 labelled "Expertise". Nothing is chosen until the reader chooses it, and a stored value you later remove from this list is kept and still shown.',
		},
		{
			key: 'derived',
			kind: 'formula',
			label: 'Derived',
			description:
				'Formula computed from the stored value, which it reads as "value", e.g. 10 + value.',
		},
		{
			key: 'effective',
			kind: 'formula',
			label: 'Effective value',
			description:
				'What the small value pill reads once modifiers are applied, e.g. value + mod.self. Leave blank and it reads the stored number. Editing the pill always edits the stored number, whatever this shows. Ignored on a card with options, whose pill shows a label rather than a number.',
		},
		{
			key: 'notePlaceholder',
			kind: 'text',
			label: 'Note hint',
			description:
				'Shown while the note line is empty, e.g. "ft." on a speed card.',
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description:
				'Hide the label above the value. The key is never shown either, so the card is left with no visible name — worth it only under a heading that already names it.',
			default: false,
		},
		{
			key: 'hideValue',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide value',
			description: 'Show only the derived result.',
			default: false,
		},
		{
			key: 'hideNote',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide note',
			description: 'Leave the note line off the card. Stored text is kept.',
			default: false,
		},
		{
			key: 'signed',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Signed',
			description: 'Prefix non-negative derived numbers with "+".',
			default: true,
		},
	],
	/*
	 * A dropdown is this component with a list of options, and it is the entry
	 * that kept Field out of the catalog (SPEC §13). Nobody wanting a dropdown
	 * looks for a component called Card — Checkbox's argument on Track exactly —
	 * while somebody wanting a labelled Name or Race lands here by the
	 * component's own description, which is why *Field* earns no entry and this
	 * does.
	 *
	 * Two placeholder options rather than none, because declaring options is
	 * the only thing that makes the card a dropdown: an entry prefilling an
	 * empty list would produce a plain text card and the menu line would have
	 * lied. Values and no labels, because words are the ordinary case (Race,
	 * Alignment, Heritage) and an author editing one column beats one clearing
	 * two. It does not prefill `hideNote`: the note line is the Blades case —
	 * a heritage is a closed choice plus a written detail — and hiding it is one
	 * checkbox for the cards that do not want it.
	 */
	palette: [
		{
			name: 'Dropdown',
			description:
				'A value chosen from a closed list: race, alignment, heritage. The note stores the chosen option\'s value, so a choice can carry arithmetic — 2 shown as "Expertise" — and nothing is chosen until the reader chooses it. Edit the options below; the note line under the value stays for the detail a choice cannot carry.',
			config: {
				options: [{ value: 'First choice' }, { value: 'Second choice' }],
			},
		},
	],

	/*
	 * A card with options is a dropdown, so the editor says so rather than
	 * telling an author who chose **Dropdown** that they have a Card. Derived
	 * from the config and never stored: clear the last option and it is a Card
	 * again, which is exactly what the card then is.
	 *
	 * Not a second component type. The two share a `read`, a `write`, a
	 * `scopeValues`, a note format and a card face, which is a copy rather than
	 * a component (SPEC §13, PATTERNS §1) — what differs is the control and the
	 * word for it, and this is the word.
	 */
	configName(config): string | null {
		return (config.options?.length ?? 0) > 0 ? 'Dropdown' : null;
	},

	read(body, config): ReadResult<CardData> {
		const entry = valueKey(config);
		if ('error' in entry) return { ok: false, error: entry.error };
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty card, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const data: CardData = {};
		const value = parsed.values.get(entry.key);
		if (value !== undefined) data.value = value;
		const note = parsed.values.get(NOTE_KEY);
		if (note !== undefined) data.note = note;
		// Entries under any other key are left where they are, untouched.
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		// A Card is one value, so it answers to its bare id: `armour_class`,
		// carrying what the card shows. The configured key names the entry
		// in the file, not the reference — a formula should not have to know
		// how the note is spelled.
		//
		// A chosen option publishes its value and never its label: the layout
		// wrote the mapping down, so the value is the meaning and the label is
		// its presentation (SPEC §5). Nothing here changes for it.
		if ('error' in drawableCard(config)) return {};
		return {
			self: {
				value: data?.value,
				display:
					config.derived === undefined
						? undefined
						: { field: 'derived', scope: { value: data?.value ?? '' } },
			},
		};
	},

	write(data, body, config): string {
		const entry = valueKey(config);
		// An unusable key fails read, so the sheet never offers an edit to
		// report; falling back beats throwing away the value if one arrives.
		const key = 'error' in entry ? DEFAULT_KEY : entry.key;
		const updates = new Map<string, string>();
		if (data.value !== undefined) updates.set(key, data.value);
		if (data.note !== undefined) updates.set(NOTE_KEY, data.note);
		return writeFenced(body, updates);
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		const drawable = drawableCard(config);
		if ('error' in drawable) {
			// A misconfigured component reports on itself; SPEC §10 keeps the
			// rest of the sheet rendering and editable.
			const error = doc.createElement('div');
			error.classList.add('sheetsmith-error');
			error.textContent = drawable.error;
			container.appendChild(error);
			return;
		}

		const face = doc.createElement('div');
		face.classList.add('sheetsmith-card-single');
		container.appendChild(face);

		const signed = config.signed !== false;
		// Hiding the value only makes sense when a derived remains to show;
		// otherwise the config would permit a card with nothing in it.
		const showValue = config.hideValue !== true || config.derived === undefined;
		const value = data?.value ?? '';
		// Only a formula that actually reads this card's own value has
		// nothing to work with while the field is empty. One computed
		// entirely from elsewhere — an armour class off `abilities.DEX` —
		// resolves whether or not anything is stored here, and blanking it
		// would hide a working number.
		const needsValue =
			config.derived !== undefined && referencesName(config.derived, 'value');
		// A Card publishes its `derived` under its bare id, so that id is the name
		// this evaluation *becomes* — and passing it is what makes `mod.self` mean
		// this card's own slot. Forgetting it reads as 0 with nothing saying so
		// (`FieldResolver`), which is why `card.test.ts` drives it.
		/**
		 * The derived, and the number behind it.
		 *
		 * The pair rather than the text alone because two things need the number
		 * and only one of them needs it formatted: the face shows it, and the
		 * breakdown's total line has to *be* it wherever an override applies rather
		 * than recomputing an override the card may not have taken
		 * (`modifier-breakdown.ts`). One evaluation, read twice.
		 */
		const derivedFrom = (raw: string) => {
			// An empty value is a blank, not a broken formula.
			if (needsValue && raw.trim() === '') {
				return { value: null, face: { text: '—', unresolved: false } };
			}
			const resolved = context.resolveField('derived', { value: raw }, config.id);
			return {
				value: typeof resolved === 'number' ? resolved : null,
				face: toDerived(resolved, signed, () =>
					context.explainField?.('derived', { value: raw }, config.id) ?? null,
				),
			};
		};
		/** What the note says, which is what the breakdown is about. */
		const stored = derivedFrom(value);
		const deriveFrom = (raw: string) => derivedFrom(raw).face;

		/**
		 * What the pill reads at rest, or undefined to leave it the stored number.
		 *
		 * Card set's own rule, for its own reason: undefined wherever the answer is
		 * not a number worth trusting — no formula, nothing stored, or a formula
		 * that did not resolve — because a pill is one number with nowhere to say
		 * why it is not one. The derived above it owns the `?` and the explanation.
		 *
		 * **A dropdown never gets one.** Its text is a label from a closed list, so
		 * a computed reading would be a word the list does not hold; `card-face.ts`
		 * ignores `shown` on that branch and this leaves it undefined rather than
		 * relying on that.
		 */
		const effective =
			config.effective === undefined ||
			value.trim() === '' ||
			drawable.options.length > 0
				? undefined
				: (() => {
						const resolved = context.resolveField(
							'effective',
							{ value },
							config.id,
							// Display only; see Card set for the whole of why.
							true,
						);
						return typeof resolved === 'number' ? String(resolved) : undefined;
					})();

		renderCardFace(face, {
			title: config.label,
			// The strip of a container showing one child at a time has already
			// named this card, so the title goes while the accessible name stays.
			hideTitle: !showsOwnLabel(config, context),
			// A lone card has no row of siblings to keep on one baseline.
			reserveAbbreviation: false,
			value: showValue
				? {
						current: value,
						shown: effective,
						// Absent where the layout declared none, which is what
						// leaves the value a field. Hiding the value hides the
						// menu with it, the same trade the field already makes.
						options:
							drawable.options.length === 0 ? undefined : drawable.options,
						// Delta, not snapshot: committing the value cannot
						// revert a note edited moments earlier.
						onCommit: (next) => context.onChange({ value: next }),
					}
				: undefined,
			derived:
				config.derived === undefined
					? undefined
					: {
							...stored.face,
							compute: deriveFrom,
							// The lines and the total come from the sheet, which is
							// the only thing that knows what pushed at this name.
							// Empty where nothing did, and empty where the name
							// accepts no modifier — so a card can never draw a mark
							// for a modifier that is not being applied.
							//
							// The number goes with them, so the total line under an
							// override is the number on the face rather than a second
							// answer to what the override came to. The note's number
							// and not the draft's: the breakdown is fixed for the life
							// of a render, and an override makes the face independent
							// of the stored value anyway.
							modifiers: modifierBreakdown(
								context.modifiers?.breakdown(config.id),
								stored.value,
							),
						},
			note:
				config.hideNote === true
					? undefined
					: {
							current: data?.note ?? '',
							placeholder: config.notePlaceholder,
							onCommit: (next) => context.onChange({ note: next }),
						},
		});
	},
};
