// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { roster, RosterConfig, RosterData } from './roster';
import { card, CardConfig } from './card';
import { table, TableConfig } from './table';
import { makeFieldExplainer, makeFieldResolver, NO_ENV } from '../formula/resolve';
import { parseFunctions } from '../formula/functions';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { Layout } from '../parse/layout';
import { RenderContext } from '../types';

/*
 * A D&D-shaped roster: two abilities, each with a skill. `mod(value)` is the
 * 5e direction — a row reads the stat — and a second config below covers
 * Blades' `count(self, Rating > 0)`.
 */
const config: RosterConfig = {
	id: 'abilities',
	type: 'roster',
	label: 'Abilities',
	position: { col: 1, row: 1, width: 6, height: 6 },
	rowHeader: 'Skill',
	stats: [
		{ key: 'STR', name: 'Strength' },
		{ key: 'DEX', name: 'Dexterity' },
	],
	derived: 'mod(value)',
	rows: [
		{ label: 'Athletics', stat: 'STR', key: 'athletics' },
		{ label: 'Acrobatics', stat: 'DEX' },
	],
	columns: [
		{ key: 'Training', type: 'number', min: 0, max: 1 },
		{
			key: 'Total',
			type: 'computed',
			formula: 'stat + Training * 2',
			signed: true,
			publish: true,
		},
	],
};

const BODY = `
\`\`\`sheet
STR: 16
DEX: 12
\`\`\`

| Skill | Training | Total |
|---|---|---|
| Athletics | 1 | 0 |
| Acrobatics | 0 | 0 |
`;

function contextFor(data: RosterData | null, over = config): RenderContext {
	return {
		resolved: {},
		resolveField: makeFieldResolver(roster, over, data, NO_ENV),
		explainField: makeFieldExplainer(roster, over, data, NO_ENV),
		onChange: () => undefined,
	};
}

describe('read', () => {
	it('reads a section holding a fence and a table, in either order', () => {
		const result = roster.read(BODY, config);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.data?.stats).toEqual({ STR: '16', DEX: '12' });
		expect(result.data?.rows?.[0]).toEqual({
			name: 'Athletics',
			cells: { training: '1', total: '0' },
		});

		const tableFirst = BODY.split('\n\n').reverse().join('\n\n');
		const reversed = roster.read(tableFirst, config);
		expect(reversed.ok).toBe(true);
		if (!reversed.ok) return;
		expect(reversed.data?.stats).toEqual({ STR: '16', DEX: '12' });
	});

	it('reports no data yet for an empty section, which is not an error', () => {
		const result = roster.read('', config);
		expect(result).toEqual({ ok: true, data: null });
	});

	it('reports a configuration error for a row naming an undeclared stat', () => {
		const bad: RosterConfig = {
			...config,
			rows: [{ label: 'Athletics', stat: 'CON' }],
		};
		const result = roster.read(BODY, bad);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('names a stat that is not declared');
	});

	it('reports a configuration error for a row key colliding with a stat key', () => {
		const bad: RosterConfig = {
			...config,
			rows: [{ label: 'Athletics', stat: 'STR', key: 'STR' }],
			columns: [
				{ key: 'Total', type: 'computed', formula: 'stat', publish: true },
			],
		};
		const result = roster.read(BODY, bad);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('already a stat\'s key');
	});
});

describe('parse then serialise, byte-identical when nothing changed (Constraint 3)', () => {
	const spellings = [
		['fence first', BODY],
		['table first', BODY.split('\n\n').reverse().join('\n\n')],
		['no fence', BODY.replace(/```sheet[\s\S]*?```\n\n/, '')],
		[
			'no table',
			'\n```sheet\nSTR: 16\nDEX: 12\n```\n',
		],
		['neither', 'Just some prose.\n'],
		['a preamble', `Some notes about this character.\n${BODY}`],
		[
			'prose between the two halves',
			BODY.replace('\n\n|', '\n\nA note between the two.\n\n|'),
		],
		[
			'misaligned pipes',
			BODY.replace('| Athletics | 1 | 0 |', '|Athletics|1|0|'),
		],
		['CRLF', BODY.replace(/\n/g, '\r\n')],
		['no trailing newline', BODY.replace(/\n$/, '')],
	] as const;

	for (const [name, body] of spellings) {
		it(`round-trips ${name}`, () => {
			const result = roster.read(body, config);
			expect(result.ok).toBe(true);
			if (!result.ok) return;
			if (result.data === null) {
				// Nothing to write back: an empty read is an editable empty
				// roster, and there is no delta to apply.
				return;
			}
			const rewritten = roster.write({}, body, config);
			expect(rewritten).toBe(body);
		});
	}

	/*
	 * `contract.test.ts`'s registry-wide sweep never reaches this: Roster
	 * declares `palette: 'none'`, so `configsFor('roster')` yields only the
	 * bare config, whose `sample()` is `''` and sits in the sweep's own
	 * `EMPTY` list rather than `filled()` — every populated-config sample
	 * assertion the sweep makes elsewhere therefore runs zero times here.
	 * Proved directly instead, on a populated config, so a regression in
	 * `sample()`'s own writing has something to fail against.
	 */
	it("round-trips its own sample, byte-identical", () => {
		const generated = roster.sample?.(config) ?? '';
		expect(generated).not.toBe('');
		const result = roster.read(generated, config);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const rewritten = roster.write({}, generated, config);
		expect(rewritten).toBe(generated);
	});
});

describe('editing one stat or one cell', () => {
	it('rewrites only the fence line for a stat edit, leaving the table alone', () => {
		const next = roster.write({ stats: { STR: '18' } }, BODY, config);
		expect(next).toContain('STR: 18');
		expect(next).toContain('DEX: 12');
		expect(next).toContain('| Athletics | 1 | 0 |');
	});

	it('rewrites only the touched cell, leaving the fence alone', () => {
		// Training is a stored column; Total is computed and never written.
		const next = roster.write(
			{ rows: { 1: { cells: { Training: '1' } } } },
			BODY,
			config,
		);
		expect(next).toContain('STR: 16');
		expect(next).toContain('| Athletics | 1 | 0 |');
		expect(next).toContain('| Acrobatics | 1 | 0 |');
	});

	it('seeds every declared row on the first edit when the note has no table yet', () => {
		const fenceOnly = '\n```sheet\nSTR: 16\nDEX: 12\n```\n';
		const next = roster.write(
			{ rows: {}, added: [{ name: 'Athletics', cells: { Training: '1' } }] },
			fenceOnly,
			config,
		);
		expect(next).toContain('Athletics');
		expect(next).toContain('Acrobatics');
	});

	it('claims a declared row by name, case-insensitively, whatever band it is drawn in', () => {
		const shuffled: RosterConfig = {
			...config,
			rows: [
				{ label: 'Acrobatics', stat: 'DEX' },
				{ label: 'Athletics', stat: 'STR', key: 'athletics' },
			],
		};
		const result = roster.read(BODY, shuffled);
		expect(result.ok).toBe(true);
		if (!result.ok || result.data === null) return;
		// Reordering the bands in the layout changes no byte of the note: the
		// row's own note position is unaffected by declared order.
		expect(result.data.rows?.[0]).toMatchObject({ name: 'Athletics' });
	});
});

describe('scopeValues', () => {
	it('publishes a bare reading and the stored score under .value, no bare id', () => {
		const result = roster.read(BODY, config);
		if (!result.ok) throw new Error('read failed');
		const values = roster.scopeValues?.(result.data, config);
		expect(values?.self).toBeUndefined();
		const strValue = values?.named?.STR?.value;
		expect(strValue).toBe('16');
	});

	it('publishes a declared row with a key under <id>.<key>', () => {
		const result = roster.read(BODY, config);
		if (!result.ok) throw new Error('read failed');
		const values = roster.scopeValues?.(result.data, config);
		expect(values?.named?.athletics).toBeDefined();
	});
});

describe('scopeRows', () => {
	it('walks every row in band order, even when the layout declared them out of it', () => {
		// Acrobatics (DEX) declared before Athletics (STR): scopeRows must
		// still walk STR's band first, since render draws band by band and a
		// formula reading the component must count the rows the same way.
		const shuffled: RosterConfig = {
			...config,
			rows: [
				{ label: 'Acrobatics', stat: 'DEX' },
				{ label: 'Athletics', stat: 'STR', key: 'athletics' },
			],
		};
		const result = roster.read(BODY, shuffled);
		if (!result.ok) throw new Error('read failed');
		const rowsSource = roster.scopeRows?.(result.data, shuffled);
		const resolver = makeFieldResolver(roster, shuffled, result.data, NO_ENV);
		const rows = rowsSource?.(resolver) ?? [];
		expect(rows.map((row) => row.label)).toEqual(['Athletics', 'Acrobatics']);
	});

	it('gives 0 for count() and sum() over an empty roster', () => {
		const empty: RosterConfig = {
			id: 'empty_roster',
			type: 'roster',
			label: 'Empty',
			position: { col: 1, row: 1, width: 2, height: 2 },
		};
		const rowsSource = roster.scopeRows?.(null, empty);
		expect(rowsSource?.(() => null) ?? []).toEqual([]);
	});
});

describe('stat and self, both directions', () => {
	it('resolves stat to what the band head shows, and stat.value to the stored score', () => {
		const result = roster.read(BODY, config);
		if (!result.ok) throw new Error('read failed');
		const context = contextFor(result.data);
		const value = context.resolveField(
			'columns.1.formula',
			{ Training: 1, 'stat.value': 16, stat: 3 },
			undefined,
		);
		expect(value).toBe(5); // stat (3) + Training(1) * 2
	});

	it('gives ? from stat.value and a number from stat, where the stat stores nothing', () => {
		// The acceptance criterion's own split, read precisely: "a row in a
		// band whose stat stores nothing gets ? from stat.value and a
		// number from stat" — not the same answer for both. A stat whose
		// `derived` never reads `value` at all — Blades' own `count(self,
		// Rating > 0)` — still has something for `stat` to be with nothing
		// stored, which is exactly what makes the split worth proving:
		// `stat` is the band's own reading, not a proxy for `stat.value`.
		const blades: RosterConfig = {
			id: 'attributes',
			type: 'roster',
			label: 'Attributes',
			position: { col: 1, row: 1, width: 4, height: 6 },
			stats: [{ key: 'insight' }],
			derived: 'count(self, Rating > 0)',
			hideValue: true,
			rowHeader: 'Skill',
			rows: [{ label: 'Hunt', stat: 'insight' }],
			columns: [
				{ key: 'Rating', type: 'level', max: 4 },
				{ key: 'StatValue', type: 'computed', formula: 'stat.value' },
				{ key: 'StatReading', type: 'computed', formula: 'stat' },
			],
		};
		const bladesBody = [
			'```sheet',
			'```',
			'',
			'| Skill | Rating | StatValue | StatReading |',
			'|---|---|---|---|',
			'| Hunt | 2 |  |  |',
		].join('\n');
		const result = roster.read(bladesBody, blades);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const resolver = makeFieldResolver(roster, blades, result.data, NO_ENV);
		const rows = roster.scopeRows?.(result.data, blades)?.(resolver) ?? [];
		const hunt = rows.find((row) => row.label === 'Hunt');
		// stat.value: nothing stored for `insight`, so the name is absent
		// from the row's own scope and the computed cell is unresolved —
		// what "?" is, on screen.
		expect(hunt?.values.StatValue).toBeUndefined();
		// stat: count(self, Rating > 0) over Hunt's own band — Hunt itself
		// is rated 2, so the count is 1, resolved with nothing stored.
		expect(hunt?.values.StatReading).toBe(1);
	});

	it("produces the right total on every row of every band, through the real pipeline", () => {
		// The test above hand-feeds `stat` into `resolveField` directly, which
		// proves the formula but not that each row picks up its *own* band's
		// stat rather than one shared value. `scopeRows` is the production
		// path `render` and a formula elsewhere on the sheet both walk, and
		// Athletics (STR) and Acrobatics (DEX) have to differ to prove it —
		// two rows agreeing would be as consistent with "both read STR" as
		// with the acceptance criterion's own claim.
		const result = roster.read(BODY, config);
		if (!result.ok) throw new Error('read failed');
		const resolver = makeFieldResolver(roster, config, result.data, {
			...NO_ENV,
			library: parseFunctions(['mod(score) = floor((score - 10) / 2)']).library,
		});
		const rows = roster.scopeRows?.(result.data, config)?.(resolver) ?? [];
		const totals = new Map(rows.map((row) => [row.label, row.values.Total]));
		// STR 16 -> mod 3, Training 1: 3 + 1 * 2 = 5.
		expect(totals.get('Athletics')).toBe(5);
		// DEX 12 -> mod 1, Training 0: 1 + 0 * 2 = 1.
		expect(totals.get('Acrobatics')).toBe(1);
	});

	it('aggregates self over a stat\'s own band, and not the roster\'s whole set', () => {
		// Three bands with three different counts, on the acceptance
		// criterion's own wording: proof over two would leave "not the
		// roster's whole set" as plausible as "not the other one".
		const blades: RosterConfig = {
			id: 'attributes',
			type: 'roster',
			label: 'Attributes',
			position: { col: 1, row: 1, width: 4, height: 6 },
			stats: [
				{ key: 'insight' },
				{ key: 'prowess' },
				{ key: 'resolve' },
			],
			derived: 'count(self, Rating > 0)',
			hideValue: true,
			rows: [
				{ label: 'Hunt', stat: 'insight' },
				{ label: 'Study', stat: 'insight' },
				{ label: 'Survey', stat: 'insight' },
				{ label: 'Skirmish', stat: 'prowess' },
				{ label: 'Wreck', stat: 'prowess' },
				{ label: 'Sway', stat: 'resolve' },
			],
			columns: [{ key: 'Rating', type: 'level', max: 4 }],
		};
		const bladesBody = `
\`\`\`sheet
\`\`\`

| Skill | Rating |
|---|---|
| Hunt | 2 |
| Study | 0 |
| Survey | 3 |
| Skirmish | 1 |
| Wreck | 0 |
| Sway | 0 |
`;
		const result = roster.read(bladesBody, blades);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		// Through `scopeValues`, the production path that binds each stat's own
		// band to `self` — a bare `resolveField` call has no rows to offer.
		const values = roster.scopeValues?.(result.data, blades);
		const resolver = makeFieldResolver(roster, blades, result.data, NO_ENV);
		const readingOf = (key: string): unknown => {
			const display = values?.named?.[key]?.display;
			return display
				? resolver(display.field, display.scope, `attributes.${key}`, false, display.rows)
				: null;
		};
		expect(readingOf('insight')).toBe(2); // Hunt and Survey are rated
		expect(readingOf('prowess')).toBe(1); // Skirmish alone
		expect(readingOf('resolve')).toBe(0); // Sway is unrated
	});

	it('fails self outside a scope that carries rows, naming itself', () => {
		const explain = roster.read('', config);
		expect(explain.ok).toBe(true);
		const context = contextFor(null, {
			...config,
			derived: 'count(self)',
		});
		const value = context.resolveField('derived', { value: '' }, 'abilities.STR');
		expect(value).toBeNull();
		const said = context.explainField?.('derived', { value: '' }, 'abilities.STR');
		expect(said).toMatch(/"self"/);
	});

	it('refuses a ring where a column reads stat while that stat aggregates self over it, at both ends — and nothing else on the sheet', () => {
		/*
		 * A sibling band on the same roster (B, unrelated to the ring) and a
		 * sibling component elsewhere (a Card), both resolved through the
		 * real `buildSheet` alongside the ring — the acceptance criterion's
		 * own "every other band and every other component on the sheet
		 * keeps working", not merely "this one ring fails".
		 */
		const ring: RosterConfig = {
			id: 'ring',
			type: 'roster',
			label: 'Ring',
			position: { col: 1, row: 1, width: 4, height: 4 },
			// B declares no row at all — every row shares the same `Loop`
			// column, so a row *inside* B's own band would read `stat` and
			// close the identical ring for B independently. An empty band is
			// the one shape that is genuinely untouched by A's: B's own
			// `count(self, …)` walks zero rows and never reaches `Loop`.
			stats: [{ key: 'A' }, { key: 'B' }],
			derived: 'count(self, Loop > 0)',
			rows: [{ label: 'One', stat: 'A' }],
			columns: [
				{
					key: 'Loop',
					type: 'computed',
					formula: 'stat',
				},
			],
		};
		const body = ['', '```sheet', '```', '', '| Skill | Loop |', '|---|---|', '| One |  |'].join(
			'\n',
		);
		const sibling: CardConfig = {
			id: 'unrelated',
			type: 'card',
			label: 'Unrelated',
			position: { col: 5, row: 1, width: 2, height: 1 },
			derived: 'value * 2',
		};
		const ringRead = roster.read(body, ring);
		const siblingRead = card.read('```sheet\nvalue: 5\n```', sibling);
		expect(ringRead.ok).toBe(true);
		expect(siblingRead.ok).toBe(true);
		if (!ringRead.ok || !siblingRead.ok) return;
		const layout: Layout = { name: 'Test', components: [ring, sibling] };
		const prepared: ReadComponent[] = [
			{ config: ring, component: roster, data: ringRead.data, error: null },
			{ config: sibling, component: card, data: siblingRead.data, error: null },
		];
		const { env } = buildSheet(layout, prepared);

		// Both ends of the ring: the stat's own reading, and (through it) the
		// row's own computed column, which needs that same stat's `derived`.
		expect(env.sheet('ring.A')).toBeUndefined();

		// B's own band, empty and never touching the ring, still resolves.
		expect(env.sheet('ring.B')).toBe(0);

		// And a component with nothing to do with the ring, elsewhere on the
		// sheet, is untouched.
		expect(env.sheet('unrelated')).toBe(10);
	});
});

describe('a whole sheet: a roster beside a card reading its rows', () => {
	it('lets a card elsewhere aggregate the roster while a band aggregates itself', () => {
		const blades: RosterConfig = {
			id: 'attributes',
			type: 'roster',
			label: 'Attributes',
			position: { col: 1, row: 1, width: 4, height: 6 },
			stats: [{ key: 'insight' }, { key: 'prowess' }],
			derived: 'count(self, Rating > 0)',
			hideValue: true,
			rows: [
				{ label: 'Hunt', stat: 'insight' },
				{ label: 'Skirmish', stat: 'prowess' },
			],
			columns: [{ key: 'Rating', type: 'level', max: 4 }],
		};
		const bladesBody = `
\`\`\`sheet
\`\`\`

| Skill | Rating |
|---|---|
| Hunt | 2 |
| Skirmish | 1 |
`;
		const total: CardConfig = {
			id: 'total_dots',
			type: 'card',
			label: 'Dots',
			position: { col: 5, row: 1, width: 2, height: 1 },
			derived: 'sum(attributes, Rating)',
		};
		const layout: Layout = {
			name: 'Test',
			components: [blades, total],
		};
		const bladesRead = roster.read(bladesBody, blades);
		const totalRead = card.read('', total);
		const prepared: ReadComponent[] = [
			{
				config: blades,
				component: roster,
				data: bladesRead.ok ? bladesRead.data : null,
				error: bladesRead.ok ? null : bladesRead.error,
			},
			{
				config: total,
				component: card,
				data: totalRead.ok ? totalRead.data : null,
				error: totalRead.ok ? null : totalRead.error,
			},
		];
		const { env } = buildSheet(layout, prepared);
		// The band aggregates only its own rows...
		expect(env.sheet('attributes.insight')).toBe(1);
		expect(env.sheet('attributes.prowess')).toBe(1);
		// ...while a card elsewhere sums the whole roster, undisturbed.
		expect(env.sheet('total_dots')).toBe(3);
	});

	it('lets a formula elsewhere read a published row key exactly as it would on a Table', () => {
		// The acceptance criterion's own wording: "10 + skills.perception
		// works on a roster exactly as it does on a Table." Proved through
		// `buildSheet`, on the vault fixture's own "Passive Athletics" shape
		// — a Card reading `abilities.athletics` — since the aggregate test
		// above proves a *component* reference and this one has to prove a
		// *row's* published name specifically, which is a different edge.
		const passiveAthletics: CardConfig = {
			id: 'passive_athletics',
			type: 'card',
			label: 'Passive Athletics',
			position: { col: 5, row: 1, width: 2, height: 1 },
			derived: '10 + abilities.athletics',
			hideValue: true,
		};
		const layout: Layout = {
			name: 'Test',
			functions: ['mod(score) = floor((score - 10) / 2)'],
			components: [config, passiveAthletics],
		};
		const rosterRead = roster.read(BODY, config);
		const cardRead = card.read('', passiveAthletics);
		const prepared: ReadComponent[] = [
			{
				config,
				component: roster,
				data: rosterRead.ok ? rosterRead.data : null,
				error: rosterRead.ok ? null : rosterRead.error,
			},
			{
				config: passiveAthletics,
				component: card,
				data: cardRead.ok ? cardRead.data : null,
				error: cardRead.ok ? null : cardRead.error,
			},
		];
		const { env } = buildSheet(
			layout,
			prepared,
			parseFunctions(layout.functions ?? []).library,
		);
		// STR 16 -> mod 3; Athletics' own Total is stat(3) + Training(1) * 2.
		expect(env.sheet('abilities.athletics')).toBe(5);
		expect(env.sheet('passive_athletics')).toBe(15);
	});

	it("resolves one stat's self walk live-touching a sibling stat's, on the same roster", () => {
		/*
		 * Two self-aggregating stats on one roster, where Insight's *own*
		 * count depends on a row that reads Prowess's published reading
		 * directly — a live, first-touch resolution of `ring.prowess` nested
		 * *inside* Insight's own self walk, not yet memoised by anything
		 * else. The guard is keyed on the published name a `self` walk
		 * belongs to (`resolve.ts`), not on the bare component id, precisely
		 * so this does not read as "ring is already being read": Insight's
		 * and Prowess's own walks are unrelated bands, and only a walk
		 * re-entering *itself* is a ring.
		 *
		 * **Why the aggregate itself has to depend on the cross-band read,
		 * and not merely a column beside it.** A guard collision here does
		 * not throw outward — `resolve()`'s own try/catch turns it into an
		 * absent cell, exactly like an unrelated formula failure — so asking
		 * `count(self, Rating > 0)` and checking a *different* column for the
		 * side effect would pass by coincidence: the aggregate never reads
		 * the column the collision broke. `count(self, CrossRead > 0)` makes
		 * Insight's own answer wrong the moment the nested read is refused,
		 * which is the one shape that turns the collision into a value this
		 * test can see from outside.
		 *
		 * **Prowess declares no row of its own, deliberately.** `CrossRead`
		 * is one column shared by every band, so a row *inside* Prowess's own
		 * band evaluating the same formula would read `ring.prowess` while
		 * `ring.prowess` is itself being computed — a genuine same-name
		 * cycle, correctly caught by the sheet's own name-table guard
		 * (`buildSheetScope`), and a different fact from the one this test is
		 * about. An empty band sidesteps it: Prowess's own `derived` walks
		 * zero rows and reads none of them, so nothing inside its own walk
		 * ever asks for `ring.prowess` again.
		 */
		const ring: RosterConfig = {
			id: 'ring',
			type: 'roster',
			label: 'Ring',
			position: { col: 1, row: 1, width: 4, height: 4 },
			stats: [{ key: 'insight' }, { key: 'prowess' }],
			derived: 'count(self, CrossRead > 0)',
			rows: [{ label: 'Hunt', stat: 'insight' }],
			columns: [
				{ key: 'Rating', type: 'level', max: 4 },
				{
					key: 'CrossRead',
					type: 'computed',
					formula: 'ring.prowess + Rating',
				},
			],
		};
		const body = `
\`\`\`sheet
\`\`\`

| Skill | Rating | CrossRead |
|---|---|---|
| Hunt | 2 |  |
`;
		const read = roster.read(body, ring);
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		const layout: Layout = { name: 'Test', components: [ring] };
		const prepared: ReadComponent[] = [
			{ config: ring, component: roster, data: read.data, error: null },
		];
		const { env } = buildSheet(layout, prepared);
		// Insight asked for first and fresh: nothing is memoised yet, so
		// building its own band genuinely reaches into Prowess's self walk
		// live. Prowess's own count over its empty band is 0, so Hunt's own
		// CrossRead is `ring.prowess + Rating` = 0 + 2 = 2, and Insight's own
		// count is 1 — wrong (0, or unresolved) if the nested read into
		// Prowess were refused as a false ring.
		expect(env.sheet('ring.insight')).toBe(1);
		expect(env.sheet('ring.prowess')).toBe(0);
	});
});

describe('a stat whose formula reads mod.self, pushed at from a Table elsewhere', () => {
	/*
	 * A minimal ability score and a gear table, wired through the real
	 * modifier machinery (`buildSheet`) rather than a stub: a belt raises
	 * Strength directly, on `mod.self`'s own worked example
	 * (`docs/features/stat-with-dependants.md`'s "Kept from the Card half").
	 * `table.test.ts`'s "table and mod.self" is the shape this mirrors, one
	 * component over.
	 */
	const abilities: RosterConfig = {
		id: 'abilities',
		type: 'roster',
		label: 'Abilities',
		position: { col: 1, row: 1, width: 4, height: 2 },
		stats: [{ key: 'STR', name: 'Strength' }],
		effective: 'value + mod.self',
	};
	const gear: TableConfig = {
		id: 'gear',
		type: 'table',
		label: 'Gear',
		position: { col: 5, row: 1, width: 4, height: 2 },
		rowHeader: 'Item',
		rows: [{ label: 'Belt of Giant Strength' }],
		columns: [{ key: 'Modifiers', type: 'modifier', hideHeading: true }],
	};
	const gearBody = [
		'| Item | Modifiers |',
		'| --- | --- |',
		'| Belt of Giant Strength | abilities.STR += 2 as item |',
	].join('\n');

	function sheetOf() {
		const abilitiesBody = '```sheet\nSTR: 16\n```';
		const abilitiesRead = roster.read(abilitiesBody, abilities);
		const gearRead = table.read(gearBody, gear);
		expect(abilitiesRead.ok).toBe(true);
		expect(gearRead.ok).toBe(true);
		if (!abilitiesRead.ok || !gearRead.ok) throw new Error('read failed');
		const layout: Layout = { name: 'Test', components: [abilities, gear] };
		const prepared: ReadComponent[] = [
			{ config: abilities, component: roster, data: abilitiesRead.data, error: null },
			{ config: gear, component: table, data: gearRead.data, error: null },
		];
		const { env, modifiers } = buildSheet(layout, prepared);
		return { env, modifiers, data: abilitiesRead.data };
	}

	it('takes the modifier through the real sheet (mod.self resolves to +2)', () => {
		const { env } = sheetOf();
		// The bare name reads the stored score (no `derived`); `mod.self`'s
		// own slot is what `effective` reads, checked below through render.
		expect(env.sheet('abilities.STR')).toBe(16);
	});

	it('marks the value field and names the row and the component in the breakdown', () => {
		const { env, modifiers, data } = sheetOf();
		const el = document.createElement('div');
		roster.render(el, abilities, data, {
			resolved: {},
			// The real env, not `NO_ENV`: `mod.self` is a slot in the sheet's
			// own modifier table, which only the sheet this component is
			// actually built into can answer.
			resolveField: makeFieldResolver(roster, abilities, data, env),
			explainField: makeFieldExplainer(roster, abilities, data, env),
			onChange: () => undefined,
			modifiers,
		});
		const field = el.querySelector<HTMLInputElement>('.sheetsmith-card-input');
		expect(field?.value).toBe('18');
		expect(field?.classList.contains('sheetsmith-modified')).toBe(true);
		expect(field?.title).toBe('18 with modifiers, 16 stored');
		const describedBy = field?.getAttribute('aria-describedby');
		expect(describedBy).not.toBeNull();
		const twin = describedBy ? el.querySelector(`#${describedBy}`) : null;
		// The row's own name, and the modifier's typed word. The component's
		// own name ("Gear") is correctly absent: the drop rule
		// (`docs/UI.md` §9) says a token that carries no information is
		// dropped, and only one component is contributing here.
		expect(twin?.textContent).toContain('Belt of Giant Strength');
		expect(twin?.textContent).toContain('item');
	});

	it('goes back to the stored score the moment the field is focused', () => {
		const { env, modifiers, data } = sheetOf();
		const el = document.createElement('div');
		roster.render(el, abilities, data, {
			resolved: {},
			resolveField: makeFieldResolver(roster, abilities, data, env),
			onChange: () => undefined,
			modifiers,
		});
		const field = el.querySelector<HTMLInputElement>('.sheetsmith-card-input');
		expect(field?.value).toBe('18');
		field?.dispatchEvent(new Event('focus'));
		expect(field?.value).toBe('16');
	});
});

describe('render', () => {
	/*
	 * The three interaction classes the acceptance criteria name for this
	 * component and `render()` had no case exercising any of them: a
	 * wikilinked row name, a fenced-link refusal on a stat field, and a
	 * level ring cycling a row's own cell.
	 */

	function recording(over: RosterConfig, data: RosterData | null, extra: Partial<RenderContext> = {}) {
		const changes: unknown[] = [];
		const el = document.createElement('div');
		// Attached before render: `.focus()`/`.blur()` on a detached element
		// are inert, and this component's own commit and refusal gestures
		// depend on real focus (`passport.test.ts`'s own `render` helper is
		// the precedent).
		document.body.replaceChildren(el);
		roster.render(el, over, data, {
			...contextFor(data, over),
			onChange: (edited) => changes.push(edited),
			...extra,
		});
		return { el, changes };
	}

	describe('a wikilinked row name', () => {
		const linked: RosterConfig = {
			...config,
			rows: [
				{ label: '[[Sunblade]]', stat: 'STR', key: 'athletics' },
				{ label: '[[Torch of Revealing]]', stat: 'DEX' },
			],
		};
		const linkedBody = BODY.replace('Athletics', '[[Sunblade]]').replace(
			'Acrobatics',
			'[[Torch of Revealing]]',
		);

		function rendered(resolves: (target: string) => boolean = () => true) {
			const result = roster.read(linkedBody, linked);
			const data = result.ok ? result.data : null;
			const asked: unknown[] = [];
			const { el } = recording(linked, data, {
				link: {
					resolves,
					open: (target, event) => asked.push({ open: target, mod: event.type }),
					preview: (target, anchor) =>
						asked.push({ preview: target, on: anchor.textContent }),
				},
			});
			return { el, asked };
		}

		it('renders it as a link, on the row\'s own class rather than a field', () => {
			const { el } = rendered();
			const anchor = el.querySelector<HTMLAnchorElement>('tbody a.internal-link');
			expect(anchor?.textContent).toBe('Sunblade');
			expect(anchor?.getAttribute('href')).toBe('Sunblade');
		});

		it('draws faint where the note does not resolve', () => {
			const { el } = rendered((target) => target !== 'Torch of Revealing');
			const anchors = Array.from(
				el.querySelectorAll<HTMLAnchorElement>('tbody a.internal-link'),
			);
			const sunblade = anchors.find((a) => a.textContent === 'Sunblade');
			const torch = anchors.find((a) => a.textContent === 'Torch of Revealing');
			expect(sunblade?.classList.contains('is-unresolved')).toBe(false);
			expect(torch?.classList.contains('is-unresolved')).toBe(true);
		});

		it('opens on a press, carrying whatever modifier the event had', () => {
			const { el, asked } = rendered();
			const anchor = el.querySelector<HTMLAnchorElement>('tbody a.internal-link');
			anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			expect(asked).toEqual([{ open: 'Sunblade', mod: 'click' }]);
		});

		it('opens on a mod-press too, and the event says which', () => {
			// The acceptance criterion's own second clause — "opens on a press
			// and on a mod-press" — proved the way record-set.test.ts's
			// equivalent case does: a plain click and a modified one, and the
			// handler's own event is what says which happened, since the
			// component itself takes no view of "new tab" beyond passing the
			// event on (Table's and Record set's own rule).
			const open = vi.fn();
			const result = roster.read(linkedBody, linked);
			const data = result.ok ? result.data : null;
			const { el } = recording(linked, data, {
				link: { resolves: () => true, open, preview: () => undefined },
			});
			const anchor = el.querySelector<HTMLAnchorElement>('tbody a.internal-link');
			anchor?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			anchor?.dispatchEvent(
				new MouseEvent('click', { bubbles: true, metaKey: true }),
			);
			expect(open).toHaveBeenCalledTimes(2);
			expect((open.mock.calls[0]?.[1] as MouseEvent).metaKey).toBe(false);
			expect((open.mock.calls[1]?.[1] as MouseEvent).metaKey).toBe(true);
		});
	});

	describe('an empty stat reads a blank, not a broken formula', () => {
		/*
		 * The state that matters most, since a fresh character opens one:
		 * `derived: 'mod(value)'` reads `value` directly, so a stat nobody
		 * has typed a score into yet is a blank rather than an unresolvable
		 * formula (`card.ts`'s own `needsValue`, one component over).
		 */
		it('draws — rather than ?, unmarked, on the band head', () => {
			const blankBody = BODY.replace('STR: 16', 'STR: ');
			const result = roster.read(blankBody, config);
			const data = result.ok ? result.data : null;
			const { el } = recording(config, data, {
				resolveField: makeFieldResolver(roster, config, data, {
					...NO_ENV,
					library: parseFunctions(['mod(score) = floor((score - 10) / 2)']).library,
				}),
			});
			const derivedEls = el.querySelectorAll('.sheetsmith-card-derived');
			expect(derivedEls[0]?.textContent).toBe('—');
			expect(derivedEls[0]?.classList.contains('sheetsmith-table-unresolved')).toBe(false);
			expect(derivedEls[0]?.hasAttribute('title')).toBe(false);
			// Dexterity has a real score and reads its own modifier as before.
			expect(derivedEls[1]?.textContent).not.toBe('?');
		});

		it('still reads ? for a derived formula that is genuinely broken', () => {
			// `mod` undeclared: every stat's own reading fails to resolve,
			// which must stay "?" — the blank guard must not swallow every
			// other kind of failure along with it.
			const result = roster.read(BODY, config);
			const data = result.ok ? result.data : null;
			const { el } = recording(config, data);
			const derivedEls = el.querySelectorAll('.sheetsmith-card-derived');
			expect(derivedEls[0]?.textContent).toBe('?');
			expect(derivedEls[0]?.classList.contains('sheetsmith-table-unresolved')).toBe(true);
		});
	});

	describe('a fenced-link refusal on a stat field', () => {
		it('declines a wikilink at the commit, on the values\' own sentence, and writes nothing', () => {
			const result = roster.read(BODY, config);
			const data = result.ok ? result.data : null;
			const { el, changes } = recording(config, data);
			const field = el.querySelector<HTMLInputElement>('.sheetsmith-card-input');
			expect(field).not.toBeNull();
			if (!field) return;
			field.focus();
			field.value = '[[Bard]]';
			field.blur();
			expect(changes).toEqual([]);
			expect(field.value).toBe('[[Bard]]');
			expect(el.querySelector('.sheetsmith-error')?.textContent).toContain(
				'are stored in a code block and Obsidian indexes no link inside one',
			);
		});
	});

	describe('a level ring cycling a row\'s own cell', () => {
		const levelled: RosterConfig = {
			...config,
			// No `key` on either row: `Total`, the only published column, is
			// gone from this fixture, and a row publishing with nothing to
			// publish is a configuration error that would draw in place of
			// the table this test needs.
			rows: [
				{ label: 'Athletics', stat: 'STR' },
				{ label: 'Acrobatics', stat: 'DEX' },
			],
			columns: [
				{ key: 'Training', type: 'level', levels: ['Untrained', 'Proficient:P', 'Expertise:E'] },
			],
		};
		const levelledBody = [
			'```sheet',
			'STR: 16',
			'DEX: 12',
			'```',
			'',
			'| Skill | Training |',
			'|---|---|',
			'| Athletics | 0 |',
			'| Acrobatics | 0 |',
		].join('\n');

		it('cycles through the levels and back to none on click, committing each step', () => {
			const result = roster.read(levelledBody, levelled);
			const data = result.ok ? result.data : null;
			const { el, changes } = recording(levelled, data);
			const button = el.querySelector<HTMLElement>('tbody .sheetsmith-level-ring');
			expect(button).not.toBeNull();
			button?.click();
			button?.click();
			button?.click();
			expect(changes).toEqual([
				{ rows: { 0: { cells: { Training: '1' } } } },
				{ rows: { 0: { cells: { Training: '2' } } } },
				{ rows: { 0: { cells: { Training: '0' } } } },
			]);
		});

		it('repaints as it cycles, without waiting for the view to rebuild', () => {
			const result = roster.read(levelledBody, levelled);
			const data = result.ok ? result.data : null;
			const { el } = recording(levelled, data);
			const button = el.querySelector<HTMLElement>('tbody .sheetsmith-level-ring');
			button?.click();
			expect(button?.getAttribute('aria-label')).toBe('Athletics Training: Proficient');
			expect(button?.classList.contains('sheetsmith-level-ring-on')).toBe(true);
		});
	});

	describe('the score and its reading centre on each other', () => {
		// `.sheetsmith-card-input`'s own `text-align: center` only visibly
		// centres a field that is `width: 100%` of something with real slack —
		// true in an ordinary Card, false in a band head, where the score and
		// the reading share a sub-group that centres them on each other
		// instead, value first and the reading under it.
		it('wraps the value field and the reading in one centring sub-group', () => {
			const result = roster.read(BODY, config);
			const data = result.ok ? result.data : null;
			const { el } = recording(config, data);
			const group = el.querySelector('.sheetsmith-roster-band-value');
			expect(group).not.toBeNull();
			expect(
				Array.from(group?.children ?? []).map((child) => child.classList[0]),
			).toEqual(['sheetsmith-card-input', 'sheetsmith-card-derived']);
		});
	});
});

describe('contract shape', () => {
	it('declares no scopeModifiers, applyReset, resetColumns or hasBuffer', () => {
		expect(roster.scopeModifiers === undefined).toBe(true);
		expect(roster.applyReset === undefined).toBe(true);
		expect(roster.resetColumns === undefined).toBe(true);
		expect(roster.hasBuffer).toBeUndefined();
	});
});
