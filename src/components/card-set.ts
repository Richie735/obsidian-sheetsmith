/*
 * Card set — an ordered set of named entries rendered as a strip of
 * cards (SPEC §4.2). Covers the six D&D abilities or Call of Cthulhu
 * characteristics, and a coin purse under the Currency entry; a single-entry
 * set is a lone card. One fenced block holds one entry per declared key,
 * matching the file model example in SPEC §3.1.
 */

import { referencesName } from '../formula/expression';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';
import { renderCardFace, toDerived } from './card-face';
import { modifierBreakdown } from './modifier-breakdown';

export interface CardSetEntry {
	/** Entry key in the fenced block, and the abbreviation on the card. */
	key: string;
	/** Full display name, e.g. "Strength" over "STR". */
	name?: string;
}

export interface CardSetConfig extends ComponentConfig {
	type: 'card-set';
	/** The entries, in display order. */
	entries?: CardSetEntry[];
	/** Formula computed per entry; `value` is that entry's value. */
	derived?: string;
	/** Card flow. Defaults to horizontal. */
	direction?: 'horizontal' | 'vertical';
	hideLabel?: boolean;
	/** Where the set's name sits. Defaults to start. */
	labelAlign?: 'auto' | 'start' | 'center' | 'end';
	/**
	 * Card sizing: 'fill' (default) spreads cards across the width; 'fixed'
	 * sizes them one per grid unit of the component's width.
	 */
	sizing?: 'fill' | 'fixed';
	/**
	 * How fixed-width cards align. 'stretch' is a legacy value from when
	 * this field also carried the sizing choice; it reads as fill sizing.
	 */
	align?: 'stretch' | 'start' | 'center' | 'end';
	hideValue?: boolean;
	/** Prefix non-negative derived numbers with "+". Defaults to true. */
	signed?: boolean;
}

export interface CardSetData {
	/**
	 * Raw values by fenced key. On read this holds every entry; on write
	 * only the entries present are touched, so an edit reported as a
	 * single-key delta can never clobber sibling values with a stale
	 * snapshot — even if two commits race one rebuild.
	 */
	values: Record<string, string>;
}

export const cardSet: ComponentDefinition<CardSetConfig, CardSetData> = {
	type: 'card-set',
	storage: 'fenced',
	formulaFields: ['derived'],
	configFields: [
		{
			key: 'entries',
			kind: 'entries',
			label: 'Entries',
			// The set's own words for its two columns. Held here rather than in
			// the editor's list field, which serves three vocabularies now and
			// must not know which one it is drawing (docs/PATTERNS.md §1).
			entryColumns: [
				{ key: 'key', heading: 'Key' },
				{ key: 'name', heading: 'Full name' },
			],
			description:
				'Each key is the entry name in the note and the abbreviation on the card. Order is display order. Renaming a key does not move a stored value; the old entry stays in the note under the old key.',
		},
		{
			key: 'derived',
			kind: 'formula',
			label: 'Derived',
			description:
				'Formula computed per entry, where "value" is that entry\'s value, e.g. floor((value - 10) / 2).',
		},
		{
			key: 'direction',
			group: 'Appearance',
			kind: 'select',
			label: 'Direction',
			description: 'How the cards flow.',
			options: ['horizontal', 'vertical'],
		},
		{
			key: 'sizing',
			group: 'Appearance',
			kind: 'select',
			label: 'Card sizing',
			description:
				'Fill spreads cards across the width; fixed sizes them one per grid unit of the component\'s width.',
			options: ['fill', 'fixed'],
		},
		{
			key: 'align',
			group: 'Appearance',
			kind: 'select',
			label: 'Alignment',
			description: 'How the fixed-width cards align in the component.',
			options: ['start', 'center', 'end'],
			visibleWhen: { key: 'sizing', equals: 'fixed' },
		},
		{
			key: 'hideLabel',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide label',
			description: 'Hide the set\'s name above the cards.',
			default: false,
		},
		{
			key: 'labelAlign',
			group: 'Appearance',
			kind: 'select',
			label: 'Label position',
			description:
				'Where the set\'s name sits above the cards. Auto follows the cards\' own alignment.',
			// "auto" is the first option, and the editor stores a config key
			// only when it differs from the first — so the absent key means
			// "follow the cards", and picking "start" stores "start" and
			// pins it there. Without a name for the default, choosing start
			// would delete the key and render as auto, leaving the dropdown
			// reading one thing and the sheet showing another.
			options: ['auto', 'start', 'center', 'end'],
		},
		{
			key: 'hideValue',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide values',
			description: 'Show only the derived results.',
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
	 * A currency block is this component with its denominations as entries,
	 * and SPEC §13 checked it against Table before settling there. Five declared
	 * rows with a number column store and publish the same five numbers and are
	 * the wrong shape for them: a row's apparatus buys nothing where a
	 * denomination is a name and a count, and a name column would only repeat the
	 * abbreviation the card already is. The one thing Table adds is a total, and
	 * a total is the wrong arithmetic — copper plus gold is a quantity of nothing.
	 *
	 * Nothing here says `direction: 'horizontal'`. Horizontal is what the absent
	 * key already means, and PATTERNS §8 leaves a value matching its default out
	 * of the config; a layout file is hand-edited and shared, so an entry that
	 * writes down defaults writes noise into every layout that uses it. `derived`
	 * is absent for the same kind of reason and a stronger one: a coin is a
	 * count, not a score with a modifier under it.
	 */
	palette: [
		{
			name: 'Currency',
			description:
				'Coins as five cards in a row, one per denomination: CP, SP, EP, GP, PP. A Card set, so the note stores one entry per denomination and each publishes a name a formula can read. Rename or drop the ones your game does not use.',
			config: {
				entries: [
					{ key: 'CP', name: 'Copper' },
					{ key: 'SP', name: 'Silver' },
					{ key: 'EP', name: 'Electrum' },
					{ key: 'GP', name: 'Gold' },
					{ key: 'PP', name: 'Platinum' },
				],
			},
		},
	],

	read(body): ReadResult<CardSetData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: editable empty cards, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		return { ok: true, data: { values: Object.fromEntries(parsed.values) } };
	},

	scopeValues(data, config): ScopeValues {
		// One name per entry, `abilities.DEX`, carrying what the card
		// shows — the modifier where a `derived` exists, the score where it
		// does not. The score stays reachable as `abilities.DEX.value`.
		//
		// Only the entries the layout declares are published: an entry
		// the layout does not map does not render either, and a formula
		// should not be able to reach what the sheet cannot show.
		const named: Record<string, ScopeEntry> = {};
		for (const entry of config.entries ?? []) {
			const raw = data?.values[entry.key];
			named[entry.key] = {
				value: raw,
				display:
					config.derived === undefined
						? undefined
						: { field: 'derived', scope: { value: raw ?? '' } },
			};
		}
		return { named };
	},

	write(data, body): string {
		return writeFenced(body, new Map(Object.entries(data.values)));
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();

		// Legacy layouts carried sizing inside align ('stretch' meant fill,
		// any alignment meant fixed); an explicit sizing wins when present.
		const sizing =
			config.sizing ??
			(config.align === 'start' ||
			config.align === 'center' ||
			config.align === 'end'
				? 'fixed'
				: 'fill');
		const alignment =
			sizing === 'fixed' &&
			(config.align === 'center' || config.align === 'end')
				? config.align
				: 'start';

		// The set's name is authored data; the sheet drops it only where the
		// layout said to, or where a container above has already shown it.
		if (showsOwnLabel(config, context)) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-card-set-label');
			// A heading belongs over the thing it heads. Left unset it follows
			// the cards, so centred cards do not sit under a name pinned to the
			// far left; setting it explicitly overrides that. Only a non-default
			// position carries a class, as with the cards.
			// Absent or explicitly auto follows the cards; anything else pins
			// the heading where the layout put it, "start" included.
			const labelAlign =
				config.labelAlign === undefined || config.labelAlign === 'auto'
					? alignment
					: config.labelAlign;
			if (labelAlign === 'center' || labelAlign === 'end') {
				label.classList.add(`sheetsmith-card-set-label-${labelAlign}`);
			}
			label.textContent = config.label;
			container.appendChild(label);
		}

		const strip = doc.createElement('div');
		strip.classList.add('sheetsmith-card-set');
		// Aligned modes size cards so one card spans one grid unit, keeping
		// rows in step with the sheet grid whatever the pane width is.
		strip.style.setProperty(
			'--sheetsmith-card-set-per-row',
			String(config.position.width),
		);
		if (config.direction === 'vertical') {
			strip.classList.add('sheetsmith-card-set-vertical');
		}
		if (sizing === 'fixed') {
			strip.classList.add(`sheetsmith-card-set-align-${alignment}`);
		}
		container.appendChild(strip);

		const values = data?.values ?? {};
		const signed = config.signed !== false;
		// Hiding the value only makes sense when a derived remains to show;
		// otherwise the config would permit a card with nothing in it.
		const showValue = config.hideValue !== true || config.derived === undefined;
		// See Card: only a formula reading the entry's own value goes
		// blank when that value is missing.
		const needsValue =
			config.derived !== undefined && referencesName(config.derived, 'value');
		/*
		 * One formula per entry, so the name it becomes is per entry too:
		 * `abilities.DEX`, which is what makes `mod.self` mean DEX's own slot and
		 * not the strip's. This is the case that needed a relative spelling at
		 * all — no name inside `derived` can say which entry it is running for, so
		 * without `mod.self` the six ability scores could not be modified.
		 */
		/**
		 * One entry's derived, and the number behind it. Card's own pair, per entry
		 * and for its reason: the face shows the number and the breakdown's total
		 * line has to *be* it wherever an override applies, rather than recomputing
		 * an override this entry may not have taken.
		 */
		const derivedFor = (key: string) => (raw: string) => {
			const name = `${config.id}.${key}`;
			// An empty value is a blank, not a broken formula.
			if (needsValue && raw.trim() === '') {
				return { value: null, face: { text: '—', unresolved: false } };
			}
			const resolved = context.resolveField('derived', { value: raw }, name);
			return {
				value: typeof resolved === 'number' ? resolved : null,
				face: toDerived(resolved, signed, () =>
					context.explainField?.('derived', { value: raw }, name) ?? null,
				),
			};
		};
		const deriveFor = (key: string) => (raw: string) =>
			derivedFor(key)(raw).face;
		for (const entry of config.entries ?? []) {
			/** What the note says for this entry, which is what its breakdown is about. */
			const stored = derivedFor(entry.key)(values[entry.key] ?? '');
			const card = doc.createElement('div');
			strip.appendChild(card);
			renderCardFace(card, {
				title: entry.name ?? entry.key,
				abbreviation:
					entry.name !== undefined && entry.name !== entry.key
						? entry.key
						: undefined,
				value: showValue
					? {
							current: values[entry.key] ?? '',
							// Delta, not snapshot: writing only this key
							// cannot revert a sibling's fresher edit.
							onCommit: (next) =>
								context.onChange({
									values: { [entry.key]: next },
								}),
						}
					: undefined,
				derived:
					config.derived === undefined
						? undefined
						: {
								...stored.face,
								compute: deriveFor(entry.key),
								// Per entry, like the formula above it: pushing at
								// `abilities.DEX` moves DEX and leaves STR alone, and
								// the breakdown on DEX's card lists DEX's own rows.
								// The entry's own number goes with it, so the total
								// line under an override is the number on that card's
								// face rather than a second answer to it.
								modifiers: modifierBreakdown(
									context.modifiers?.breakdown(
										`${config.id}.${entry.key}`,
									),
									stored.value,
								),
							},
			});
		}
	},
};
