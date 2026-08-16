/*
 * Pool — a current-and-max resource with adjust controls (SPEC §4.2). Covers
 * HP, spell slots, rage, ki, sanity: the numbers that move constantly during
 * play and are the whole reason a sheet is open at a table.
 *
 * The max is layout config, not character data. It is a formula field, so a
 * stored copy in the note would be the stale-derived-value problem Skill
 * card's storage rules already refuse. A system whose max is rolled per
 * character rather than computed points the formula at a component the
 * character owns — `max_hp` — which is what §5 makes ids for.
 *
 * Reset bindings (SPEC §6) are not here yet: `applyReset` and `reset.to`
 * arrive with the trigger machinery, and declaring the formula field before
 * anything can act on it would put an expression in the editor that silently
 * does nothing.
 */

import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ScopeEntry,
	ScopeValues,
} from '../types';
import { bindEditable, EditableHandle } from './editable';
import { formatDerived } from './stat-card';

/** Entry keys in the fenced block. Fixed, so hand-editing reads the same. */
const CURRENT_KEY = 'current';
const TEMP_KEY = 'temp';

export interface PoolConfig extends ComponentConfig {
	type: 'pool';
	/** The pool's ceiling, as a literal or an expression. */
	max?: string | number;
	/** Show a second field for temporary points above the max. */
	hasTemp?: boolean;
}

export interface PoolData {
	/**
	 * Absent means "not part of this change": an edit is reported as a delta
	 * of the one field touched, so a commit racing a rebuild can never write
	 * back a stale sibling.
	 */
	current?: string;
	temp?: string;
}

/** How far one press of a step button moves the pool. */
const STEP = 1;
const STEP_SHIFT = 10;

export const pool: ComponentDefinition<PoolConfig, PoolData> = {
	type: 'pool',
	storage: 'fenced',
	formulaFields: ['max'],
	configFields: [
		{
			key: 'max',
			kind: 'formula',
			label: 'Max',
			description:
				'The pool\'s ceiling, as a number or a formula, e.g. 8 + mod(abilities.CON) * level. Leave it empty for a pool that only counts up. It is not stored per character — for a max the character owns, such as rolled hit points, point this at a component holding it.',
		},
		{
			key: 'hasTemp',
			kind: 'boolean',
			label: 'Temporary points',
			description:
				'Show a second field for points above the max, such as temporary hit points.',
			default: false,
		},
	],

	read(body): ReadResult<PoolData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty pool, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const data: PoolData = {};
		const current = parsed.values.get(CURRENT_KEY);
		if (current !== undefined) data.current = current;
		const temp = parsed.values.get(TEMP_KEY);
		if (temp !== undefined) data.temp = temp;
		// Entries under any other key are left where they are, untouched —
		// including a `max` from a note written against an older layout.
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		// The bare id is the current value, which is what a formula asking
		// about a pool almost always means. The ceiling and the temporary
		// points are reachable by name, so `hp.max / 2` is writable without
		// the layout repeating the expression.
		const named: Record<string, ScopeEntry> = {};
		if (config.max !== undefined) {
			named['max'] = { display: { field: 'max', scope: {} } };
		}
		if (config.hasTemp === true) {
			named[TEMP_KEY] = { value: data?.temp };
		}
		return {
			self: { value: data?.current },
			...(Object.keys(named).length > 0 ? { named } : {}),
		};
	},

	write(data, body): string {
		const updates = new Map<string, string>();
		if (data.current !== undefined) updates.set(CURRENT_KEY, data.current);
		if (data.temp !== undefined) updates.set(TEMP_KEY, data.temp);
		return writeFenced(body, updates);
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		container.replaceChildren();
		container.classList.add('sheetsmith-pool');

		const label = doc.createElement('div');
		label.classList.add('sheetsmith-pool-label');
		label.textContent = config.label;
		container.appendChild(label);

		// Announces once per commit, whether the change came from the keyboard
		// or a step button. Attached before anything writes to it, because a
		// live region has to be in the document before its text changes.
		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');

		const row = doc.createElement('div');
		row.classList.add('sheetsmith-pool-row');
		container.appendChild(row);

		const input = doc.createElement('input');
		input.type = 'text';
		input.inputMode = 'numeric';
		input.classList.add('sheetsmith-pool-current');
		input.value = data?.current ?? '';
		// SPEC §4.2: an empty value shows "—" everywhere.
		input.placeholder = '—';
		input.setAttribute('aria-label', config.label);

		// The max is a formula like any other, so it can fail like one. "?" is
		// reserved for present-but-unresolved, which is exactly this case.
		const resolvedMax = context.resolved['max'];
		const maxText =
			config.max === undefined ? null : formatDerived(resolvedMax, false);

		const announce = (next: string): void => {
			const of = maxText === null ? '' : ` of ${maxText}`;
			status.textContent = `${config.label} ${next === '' ? 'empty' : next}${of}`;
		};

		let handle: EditableHandle | null = null;

		/**
		 * One step of the pool. Reads the field rather than the rendered data
		 * so a draft in progress is what gets stepped — the number under the
		 * user's eye is the one the button should move.
		 */
		const step = (direction: 1 | -1, size: number): void => {
			const raw = input.value.trim();
			// An empty pool steps from zero, the same rule the arrow keys
			// follow: pressing minus on a fresh pool must not be a dead key.
			const current = raw === '' ? 0 : Number(raw);
			if (!Number.isFinite(current)) return;
			handle?.set(String(current + direction * size));
		};

		const stepButton = (direction: 1 | -1): HTMLButtonElement => {
			const button = doc.createElement('button');
			button.type = 'button';
			button.classList.add('sheetsmith-pool-step');
			button.textContent = direction === 1 ? '+' : '−';
			button.setAttribute(
				'aria-label',
				`${direction === 1 ? 'Increase' : 'Decrease'} ${config.label}`,
			);
			// Keep focus where it is. Without this the press blurs the field,
			// which commits the draft, and the step then lands on top of a
			// write that has already gone to the note.
			button.addEventListener('mousedown', (event) => event.preventDefault());
			button.addEventListener('click', (event) => {
				step(direction, event.shiftKey ? STEP_SHIFT : STEP);
			});
			return button;
		};

		row.appendChild(stepButton(-1));
		row.appendChild(input);

		if (maxText !== null) {
			const separator = doc.createElement('span');
			separator.classList.add('sheetsmith-pool-separator');
			separator.textContent = '/';
			row.appendChild(separator);

			const max = doc.createElement('span');
			max.classList.add('sheetsmith-pool-max');
			max.textContent = maxText;
			if (resolvedMax === null) {
				max.classList.add('sheetsmith-pool-max-unresolved');
				max.setAttribute(
					'title',
					context.explainField?.('max', {}) ?? 'The formula did not resolve.',
				);
			}
			max.setAttribute('aria-label', `${config.label} max ${maxText}`);
			row.appendChild(max);
		}

		row.appendChild(stepButton(1));

		handle = bindEditable(input, {
			initial: data?.current ?? '',
			step: true,
			announceCommit: announce,
			announceRestore: (restored) => {
				status.textContent = `${config.label} restored to ${restored}`;
			},
			onCommit: (next) => context.onChange({ current: next }),
		});

		if (config.hasTemp === true) {
			const temp = doc.createElement('div');
			temp.classList.add('sheetsmith-pool-temp');
			container.appendChild(temp);

			const tempLabel = doc.createElement('span');
			tempLabel.classList.add('sheetsmith-pool-temp-label');
			tempLabel.textContent = 'Temp';
			temp.appendChild(tempLabel);

			const tempInput = doc.createElement('input');
			tempInput.type = 'text';
			tempInput.inputMode = 'numeric';
			tempInput.classList.add('sheetsmith-pool-temp-input');
			tempInput.value = data?.temp ?? '';
			tempInput.placeholder = '—';
			tempInput.setAttribute('aria-label', `${config.label} temporary`);
			temp.appendChild(tempInput);

			bindEditable(tempInput, {
				initial: data?.temp ?? '',
				step: true,
				announceCommit: (next) => {
					status.textContent =
						next === ''
							? `${config.label} temporary cleared`
							: `${config.label} temporary ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${config.label} temporary restored to ${restored}`;
				},
				onCommit: (next) => context.onChange({ temp: next }),
			});
		}

		container.appendChild(status);
	},
};
