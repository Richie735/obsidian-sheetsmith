/*
 * Stat — one named value on a single card (SPEC §4.2). Covers armour class,
 * initiative, speed, passive perception: the standalone numbers a sheet is
 * littered with, each with a qualifier the number itself cannot carry
 * ("chain mail, shield", "ft.").
 *
 * The card shows the label, the value, and the note line. The storage key is
 * config, not display: it names the entry in the note's sheet block so hand
 * editing reads well, and it never appears on the card.
 */

import { referencesName } from '../formula/expression';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ScopeValues,
} from '../types';
import { renderStatCard, toDerived } from './stat-card';

/**
 * SPEC §3.1: single-value components store their value under `value`, so
 * hand-editing any of them looks the same. A layout may override it with a
 * key that reads better in the file, e.g. `AC`. It changes the note only;
 * formulas reference the component's id, never its storage key.
 */
const DEFAULT_KEY = 'value';

/** Entry holding the note line. Fixed, so no configured key can collide. */
const NOTE_KEY = 'note';

export interface StatConfig extends ComponentConfig {
	type: 'stat';
	/** Entry key in the fenced block. Defaults to `value`. Never displayed. */
	key?: string;
	/** Formula computed from the stored value, which it reads as `value`. */
	derived?: string;
	/** Hint shown while the note line is empty. */
	notePlaceholder?: string;
	/** Hide the label above the value. */
	hideLabel?: boolean;
	/** Show only the derived result, hiding the stored value. */
	hideValue?: boolean;
	/** Leave the note line off the card. */
	hideNote?: boolean;
	/** Prefix non-negative derived numbers with "+". Defaults to true. */
	signed?: boolean;
}

export interface StatData {
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
function valueKey(config: StatConfig): { key: string } | { error: string } {
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

export const stat: ComponentDefinition<StatConfig, StatData> = {
	type: 'stat',
	storage: 'fenced',
	formulaFields: ['derived'],
	configFields: [
		{
			key: 'key',
			kind: 'text',
			label: 'Key',
			description:
				'Entry name for the value in the character note, e.g. "AC". Not shown on the card, and not what formulas reference — they use the component id above. Defaults to "value". Renaming it does not move a stored value; the old entry stays in the note under the old key.',
		},
		{
			key: 'derived',
			kind: 'formula',
			label: 'Derived',
			description:
				'Formula computed from the stored value, which it reads as "value", e.g. 10 + value.',
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

	read(body, config): ReadResult<StatData> {
		const entry = valueKey(config);
		if ('error' in entry) return { ok: false, error: entry.error };
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty card, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const data: StatData = {};
		const value = parsed.values.get(entry.key);
		if (value !== undefined) data.value = value;
		const note = parsed.values.get(NOTE_KEY);
		if (note !== undefined) data.note = note;
		// Entries under any other key are left where they are, untouched.
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		// A Stat is one value, so it answers to its bare id: `armour_class`,
		// carrying what the card shows. The configured key names the entry
		// in the file, not the reference — a formula should not have to know
		// how the note is spelled.
		if ('error' in valueKey(config)) return {};
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

		const entry = valueKey(config);
		if ('error' in entry) {
			// A misconfigured component reports on itself; SPEC §10 keeps the
			// rest of the sheet rendering and editable.
			const error = doc.createElement('div');
			error.classList.add('sheetsmith-error');
			error.textContent = entry.error;
			container.appendChild(error);
			return;
		}

		const card = doc.createElement('div');
		card.classList.add('sheetsmith-stat-single');
		container.appendChild(card);

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
		const deriveFrom = (raw: string) => {
			// An empty value is a blank, not a broken formula.
			if (needsValue && raw.trim() === '') return { text: '—', unresolved: false };
			const resolved = context.resolveField('derived', { value: raw });
			return toDerived(resolved, signed, () =>
				context.explainField?.('derived', { value: raw }) ?? null,
			);
		};

		renderStatCard(card, {
			title: config.label,
			hideTitle: config.hideLabel === true,
			// A lone card has no row of siblings to keep on one baseline.
			reserveAbbreviation: false,
			value: showValue
				? {
						current: value,
						// Delta, not snapshot: committing the value cannot
						// revert a note edited moments earlier.
						onCommit: (next) => context.onChange({ value: next }),
					}
				: undefined,
			derived:
				config.derived === undefined
					? undefined
					: { ...deriveFrom(value), compute: deriveFrom },
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
