/*
 * Stat group — an ordered set of named attributes rendered as a strip of
 * stat cards (SPEC §4.2). Covers the six D&D abilities or Call of Cthulhu
 * characteristics; a single-attribute group is a lone stat card. One fenced
 * block holds one entry per attribute, matching the file model example in
 * SPEC §3.1.
 */

import { referencesName } from '../formula/expression';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ScopeEntry,
	ScopeValues,
} from '../types';
import { renderStatCard, toDerived } from './stat-card';

export interface StatGroupAttribute {
	/** Entry key in the fenced block, and the abbreviation on the card. */
	key: string;
	/** Full display name, e.g. "Strength" over "STR". */
	name?: string;
}

export interface StatGroupConfig extends ComponentConfig {
	type: 'stat-group';
	/** The attributes, in display order. */
	attributes?: StatGroupAttribute[];
	/** Formula computed per attribute; `value` is that attribute's value. */
	derived?: string;
	/** Card flow. Defaults to horizontal. */
	direction?: 'horizontal' | 'vertical';
	/** Hide the group's name above the cards. */
	hideLabel?: boolean;
	/** Where that name sits. Defaults to start. */
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
	/** Show only the derived results, hiding the stored values. */
	hideValue?: boolean;
	/** Prefix non-negative derived numbers with "+". Defaults to true. */
	signed?: boolean;
}

export interface StatGroupData {
	/**
	 * Raw values by fenced key. On read this holds every entry; on write
	 * only the entries present are touched, so an edit reported as a
	 * single-key delta can never clobber sibling values with a stale
	 * snapshot — even if two commits race one rebuild.
	 */
	values: Record<string, string>;
}

export const statGroup: ComponentDefinition<StatGroupConfig, StatGroupData> = {
	type: 'stat-group',
	storage: 'fenced',
	formulaFields: ['derived'],
	configFields: [
		{
			key: 'attributes',
			kind: 'attributes',
			label: 'Attributes',
			description:
				'Each key is the entry name in the note and the abbreviation on the card. Order is display order. Renaming a key does not move a stored value; the old entry stays in the note under the old key.',
		},
		{
			key: 'derived',
			kind: 'formula',
			label: 'Derived',
			description:
				'Formula computed per attribute, where "value" is that attribute\'s value, e.g. floor((value - 10) / 2).',
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
			description: 'Hide the group name above the cards.',
			default: false,
		},
		{
			key: 'labelAlign',
			group: 'Appearance',
			kind: 'select',
			label: 'Label position',
			description:
				'Where the group name sits above the cards. Auto follows the cards\' own alignment.',
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

	read(body): ReadResult<StatGroupData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: editable empty cards, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		return { ok: true, data: { values: Object.fromEntries(parsed.values) } };
	},

	scopeValues(data, config): ScopeValues {
		// One name per attribute, `abilities.DEX`, carrying what the card
		// shows — the modifier where a `derived` exists, the score where it
		// does not. The score stays reachable as `abilities.DEX.value`.
		//
		// Only the attributes the layout declares are published: an entry
		// the layout does not map does not render either, and a formula
		// should not be able to reach what the sheet cannot show.
		const named: Record<string, ScopeEntry> = {};
		for (const attribute of config.attributes ?? []) {
			const raw = data?.values[attribute.key];
			named[attribute.key] = {
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

		// The group's name is authored data; the sheet must not drop it.
		if (config.hideLabel !== true) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-stat-group-label');
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
				label.classList.add(`sheetsmith-stat-group-label-${labelAlign}`);
			}
			label.textContent = config.label;
			container.appendChild(label);
		}

		const strip = doc.createElement('div');
		strip.classList.add('sheetsmith-stat-group');
		// Aligned modes size cards so one card spans one grid unit, keeping
		// rows in step with the sheet grid whatever the pane width is.
		strip.style.setProperty(
			'--sheetsmith-stat-group-per-row',
			String(config.position.width),
		);
		if (config.direction === 'vertical') {
			strip.classList.add('sheetsmith-stat-group-vertical');
		}
		if (sizing === 'fixed') {
			strip.classList.add(`sheetsmith-stat-group-align-${alignment}`);
		}
		container.appendChild(strip);

		const values = data?.values ?? {};
		const signed = config.signed !== false;
		// Hiding the value only makes sense when a derived remains to show;
		// otherwise the config would permit a card with nothing in it.
		const showValue = config.hideValue !== true || config.derived === undefined;
		// See Stat: only a formula reading the attribute's own value goes
		// blank when that value is missing.
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
		for (const attribute of config.attributes ?? []) {
			const card = doc.createElement('div');
			strip.appendChild(card);
			renderStatCard(card, {
				title: attribute.name ?? attribute.key,
				abbreviation:
					attribute.name !== undefined && attribute.name !== attribute.key
						? attribute.key
						: undefined,
				value: showValue
					? {
							current: values[attribute.key] ?? '',
							// Delta, not snapshot: writing only this key
							// cannot revert a sibling's fresher edit.
							onCommit: (next) =>
								context.onChange({
									values: { [attribute.key]: next },
								}),
						}
					: undefined,
				derived:
					config.derived === undefined
						? undefined
						: {
								...deriveFrom(values[attribute.key] ?? ''),
								compute: deriveFrom,
							},
			});
		}
	},
};
