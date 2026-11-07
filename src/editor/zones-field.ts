/*
 * A Stat block's **Zones** field (`docs/features/stat-block-zones.md`, The zone
 * editor): the `'zones'` config field kind, one stacked card per zone.
 *
 * **Its own field kind and its own module, on `track-rows`' precedent.** A
 * `columns` list cannot hold a zone, for two reasons: a zone's type is not a
 * column type, and `contract.test.ts` holds every `columnOptions.types` entry
 * against `COLUMN_TYPES`; and a table zone holds a list inside one entry, which
 * only `nested-list-field.ts` draws. So the kind's shape belongs to one
 * component, and the field knows that shape — a key, a type, a heading,
 * columns, collapsed — and nothing about what a Stat block draws with it.
 *
 * **Each zone is a stacked card, never a wide row**, so phone width costs
 * nothing: key and type, then the heading, then what the type adds. The outer
 * list's own frame (`addControls`) gives each card its reorder and remove, and
 * a built-in — the vitals and the changes, which live in the record's fence —
 * draws no remove, because it can be placed and never removed.
 *
 * **A heading commit carries a rename into every note**, through
 * `addressesHeading` on the field; a key commit carries none, because the key is
 * layout identity and appears in no note.
 */

import { headingRename } from '../component-rename-migration';
import { columnKeyFault, zoneHeadingFault, zoneKeyFault } from '../components/zone-rules';
import { isBuiltInZone, ZONE_TYPES, ZoneColumnType, ZoneType, zoneHeadingKey } from '../parse/zones';
import { showFieldError } from './field-error';
import { addControls, checkField, labelled, ListContext, setOptional } from './list-fields';
import { nestedList } from './nested-list-field';
import { refusedRename } from './rename-refusal';

/**
 * The three body zone types, as the select offers them. A `Record` over the
 * type, so a fourth type does not compile until it has a word
 * (`docs/PATTERNS.md` §1).
 */
const TYPE_LABELS: Record<ZoneType, string> = {
	table: 'Table',
	features: 'Features',
	text: 'Text',
};

/** A table zone column's two types, as its select offers them. */
const COLUMN_TYPE_LABELS: Record<ZoneColumnType, string> = {
	text: 'Text',
	number: 'Number',
};

interface ColumnEntry extends Record<string, unknown> {
	key?: string;
	name?: string;
	type?: string;
}

interface ZoneEntry extends Record<string, unknown> {
	key: string;
	type?: string;
	heading?: string;
	columns?: ColumnEntry[];
	collapsed?: boolean;
}

function isBuiltIn(zone: ZoneEntry): boolean {
	return isBuiltInZone(zone.key);
}

/** A key no zone holds yet: `zone`, `zone_2`, and so on. */
function freshKey(zones: readonly ZoneEntry[]): string {
	const taken = new Set(zones.map((zone) => String(zone.key ?? '').toLowerCase()));
	if (!taken.has('zone')) return 'zone';
	let count = 2;
	while (taken.has(`zone_${count}`)) count++;
	return `zone_${count}`;
}

/** A heading no zone reads as yet: `Notes`, `Notes 2`, and so on. */
function freshHeading(zones: readonly ZoneEntry[]): string {
	const taken = new Set(zones.map((zone) => zoneHeadingKey(String(zone.heading ?? ''))));
	if (!taken.has('notes')) return 'Notes';
	let count = 2;
	while (taken.has(`notes ${count}`)) count++;
	return `Notes ${count}`;
}

/** A column key no column of this zone holds yet. */
function freshColumn(columns: readonly ColumnEntry[]): string {
	const taken = new Set(columns.map((column) => String(column.key ?? '').toLowerCase()));
	if (!taken.has('column')) return 'Column';
	let count = 2;
	while (taken.has(`column ${count}`)) count++;
	return `Column ${count}`;
}

/**
 * Draw the zone list into `listEl`.
 *
 * `label` is the component's own label, the section a heading rename reaches
 * in every note; `address` is the field's `addressesHeading`.
 */
export function renderZonesField(
	listEl: HTMLElement,
	record: Record<string, unknown>,
	key: string,
	prefix: string,
	context: ListContext,
	address: 'record' | undefined,
): void {
	listEl.addClass('sheetsmith-list', 'sheetsmith-list-zones');
	const held = record[key];
	const zones = (Array.isArray(held) ? held : []) as ZoneEntry[];
	const fieldError = (input: HTMLInputElement, message: string | null) =>
		showFieldError(input, message, context.errors);
	/** Put the list into the config the first time something is added to it. */
	const attach = (): void => {
		record[key] = zones;
	};

	if (zones.length === 0) {
		listEl.createDiv('sheetsmith-entry-empty', (el) =>
			el.setText('No zones yet, so each record draws its vitals, its changes and its text behind a closed heading.'),
		);
	}

	zones.forEach((zone, index) => {
		const builtIn = isBuiltIn(zone);
		const named = String(zone.key ?? '') || `zone ${index + 1}`;
		const token = `${prefix}-zone-${index}`;
		const entry = listEl.createDiv('sheetsmith-list-entry sheetsmith-zone-card');
		// Line one: the key and the type in a wrapping group, the card's own
		// controls beside the group rather than inside it, so a narrow panel
		// stacks the two fields and keeps the controls on this line.
		const line = entry.createDiv('sheetsmith-zone-line');
		const fields = line.createDiv('sheetsmith-zone-fields');

		// A built-in's key is what makes it built in, so it is not offered for
		// editing: drawn as text, as its type is (`docs/features/stat-block-zones.md`).
		if (builtIn) {
			labelled(fields, 'Key').createSpan({ cls: 'sheetsmith-zone-built-in', text: String(zone.key ?? '') });
		} else {
			const keyInput = labelled(fields, 'Key').createEl('input', {
				type: 'text',
				attr: { placeholder: 'Key', 'aria-label': `Zone ${index + 1} key` },
			});
			keyInput.value = String(zone.key ?? '');
			keyInput.dataset.sheetsmithFocus = `${token}-key`;
			keyInput.addEventListener('change', () => {
				const next = keyInput.value.trim();
				// The rule is `zone-rules.ts`'s, shared with the sheet's own check;
				// the sentence is this field's.
				const fault = zoneKeyFault(
					next,
					zones.filter((_, at) => at !== index).map((other) => other.key),
				);
				const reason =
					fault === 'blank'
						? 'A zone needs a key'
						: fault === 'not-a-name'
							? 'A key is letters, digits and underscores, starting with a letter'
							: fault === 'taken'
								? `"${next}" is already another zone's key`
								: null;
				if (reason !== null) {
					keyInput.value = String(zone.key ?? '');
					fieldError(keyInput, `${reason}, so it was left as "${String(zone.key ?? '')}".`);
					return;
				}
				fieldError(keyInput, null);
				zone.key = next;
				context.persist();
				context.redraw();
			});
		}

		if (builtIn) {
			labelled(fields, 'Type').createSpan({ cls: 'sheetsmith-zone-built-in', text: 'Built in' });
		} else {
			const type = labelled(fields, 'Type').createEl('select', {
				cls: 'dropdown',
				attr: { 'aria-label': `${named} type` },
			});
			for (const value of ZONE_TYPES) type.createEl('option', { value, text: TYPE_LABELS[value] });
			type.value = String(zone.type ?? 'text');
			type.dataset.sheetsmithFocus = `${token}-type`;
			type.addEventListener('change', () => {
				zone.type = type.value;
				// A table needs a column to name its rows, and only a text zone
				// collapses: the two keys a type change would leave refused.
				if (type.value === 'table' && (!Array.isArray(zone.columns) || zone.columns.length === 0)) {
					zone.columns = [{ key: 'Name' }];
				}
				if (type.value !== 'text') delete zone.collapsed;
				context.focusAfterRedraw(`${token}-type`);
				context.persist();
				context.redraw();
			});
		}

		addControls(
			line,
			zones,
			index,
			`${prefix}-zone-${named}`,
			named,
			context,
			() => (builtIn ? null : 'Remove this zone? Its text stays in every note and shows as not in this layout.'),
			!builtIn,
		);

		const detail = entry.createDiv('sheetsmith-entry-detail sheetsmith-zone-detail');
		const heading = labelled(detail, builtIn ? 'Heading (optional)' : 'Heading').createEl('input', {
			type: 'text',
			attr: {
				// What the sheet draws with the field blank, so the placeholder
				// never says something the sheet does not (`docs/UI.md` §6): the
				// vitals take no heading, and the changes each take their modifier
				// field's own name.
				placeholder: !builtIn
					? 'Heading'
					: String(zone.key ?? '').trim().toLowerCase() === 'changes'
						? "Each modifier field's name"
						: 'None',
				'aria-label': `${named} heading`,
			},
		});
		heading.value = String(zone.heading ?? '');
		heading.dataset.sheetsmithFocus = `${token}-heading`;
		heading.addEventListener('change', () => {
			const stored = String(zone.heading ?? '');
			const next = heading.value.trim();
			if (builtIn) {
				setOptional(zone, 'heading', next);
				context.persist();
				return;
			}
			const fault = zoneHeadingFault(next, zones.filter((_, at) => at !== index));
			const reason =
				fault === null
					? null
					: fault.kind === 'blank' || fault.kind === 'no-words'
						? 'A zone needs a heading with words in it'
						: fault.kind === 'line-break'
							? 'A heading is one line'
							: fault.kind === 'link'
								? 'A heading cannot be a link, which would change when its note is renamed'
								: `"${next}" reads the same as another zone's heading`;
			if (reason !== null) {
				heading.value = stored;
				fieldError(heading, `${reason}, so it was left as "${stored}".`);
				return;
			}
			const intent = headingRename(
				address,
				typeof record.label === 'string' ? record.label : '',
				stored,
				next,
			);
			if (refusedRename(intent, context.renameRefusal, heading, stored, fieldError)) return;
			fieldError(heading, null);
			zone.heading = next;
			context.persist(intent);
			context.redraw();
		});

		if (builtIn) return;
		if (zone.type === 'text') {
			// Collapsed shapes In play alone: under Every form the zone is drawn
			// open, because that is where it is filled. The field's description
			// says so, which is where the spec puts it.
			// On a line of its own, line three by type, so it never narrows the
			// heading beside it at any width.
			checkField(entry.createDiv('sheetsmith-entry-detail sheetsmith-zone-detail'), 'Collapsed', zone, 'collapsed', context);
			return;
		}
		if (zone.type !== 'table') return;
		if (!Array.isArray(zone.columns) || zone.columns.length === 0) zone.columns = [{}];
		const columns = zone.columns;
		nestedList(entry, {
			listLabel: 'Columns',
			count: columns.length,
			items: columns,
			token: `${token}-col`,
			context,
			addLabel: 'Add column',
			nameOf: (at) => String(columns[at]?.key ?? '') || `column ${at + 1}`,
			renderLine: (row, at) => {
				const column = columns[at] as ColumnEntry;
				row.addClass('sheetsmith-zone-column');
				const columnKey = labelled(row, at === 0 ? 'Key, naming each row' : 'Key').createEl('input', {
					type: 'text',
					attr: { placeholder: 'Key', 'aria-label': `${named} column ${at + 1} key` },
				});
				columnKey.value = String(column.key ?? '');
				columnKey.dataset.sheetsmithFocus = `${token}-col-${at}-key`;
				columnKey.addEventListener('change', () => {
					const next = columnKey.value.trim();
					const fault = columnKeyFault(
						next,
						columns.filter((_, i) => i !== at).map((other) => other.key),
					);
					const reason =
						fault === 'blank'
							? 'A column needs a key'
							: fault === 'pipe'
								? 'A key cannot hold a "|", which ends a table cell'
								: fault === 'taken'
									? `"${next}" is already another column's key`
									: null;
					if (reason !== null) {
						columnKey.value = String(column.key ?? '');
						fieldError(columnKey, `${reason}, so it was left as "${String(column.key ?? '')}".`);
						return;
					}
					fieldError(columnKey, null);
					column.key = next;
					context.persist();
					context.redraw();
				});
				const type = labelled(row, 'Holds').createEl('select', {
					cls: 'dropdown',
					attr: { 'aria-label': `${named} column ${at + 1} type` },
				});
				for (const [value, text] of Object.entries(COLUMN_TYPE_LABELS)) type.createEl('option', { value, text });
				type.value = column.type === 'number' ? 'number' : 'text';
				type.dataset.sheetsmithFocus = `${token}-col-${at}-type`;
				type.addEventListener('change', () => {
					if (type.value === 'number') column.type = 'number';
					else delete column.type;
					context.persist();
				});
				const name = labelled(row, 'Display name').createEl('input', {
					type: 'text',
					attr: { placeholder: 'Same as key', 'aria-label': `${named} column ${at + 1} display name` },
				});
				name.value = String(column.name ?? '');
				name.addEventListener('change', () => {
					setOptional(column, 'name', name.value);
					context.persist();
				});
			},
			onAdd: () => {
				columns.push({ key: freshColumn(columns) });
				context.focusAfterRedraw(`${token}-col-${columns.length - 1}-key`);
				context.persist();
				context.redraw();
			},
			onRemove: (at) => {
				columns.splice(at, 1);
				context.persist();
				context.redraw();
			},
		});
	});

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { text: 'Add zone' });
	add.dataset.sheetsmithFocus = `${prefix}-zone-add`;
	add.addEventListener('click', () => {
		// The first zone an author adds starts from the blank list's own reading
		// — the vitals, the changes and a closed Details — so adding a zone
		// changes nothing a note already draws: a 0.9.0 body's prose stays under
		// the closed Details rather than moving under the new zone, and the
		// built-ins are on the list, where they can be moved.
		if (zones.length === 0) {
			zones.push(
				{ key: 'vitals' },
				{ key: 'changes' },
				{ key: 'details', type: 'text', heading: 'Details', collapsed: true },
			);
		}
		zones.push({ key: freshKey(zones), type: 'text', heading: freshHeading(zones) });
		attach();
		context.focusAfterRedraw(`${prefix}-zone-${zones.length - 1}-key`);
		context.persist();
		context.redraw();
	});
}
