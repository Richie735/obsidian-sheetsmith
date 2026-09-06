// @vitest-environment happy-dom
/*
 * The bundled starters, put through every gate a vault layout passes.
 *
 * This is the tripwire the feature is built on: the sources are files rather
 * than TS literals precisely so the *real* parser decides whether they are
 * layouts, and a starter that has gone stale against the schema fails the build
 * here instead of landing broken in somebody's vault.
 *
 * The wiring below mirrors `view/vault-fixture.test.ts`, which mirrors
 * `SheetView.renderSheet`. If the three ever disagree, the view is the one that
 * is right.
 *
 * **Why this file renders and the other two do not.** A layer test can ask
 * whether a formula resolves; only a render can ask whether a *component*
 * accepts its own configuration, because a config error is drawn into the
 * component's own container and reaches no formula (`docs/UI.md` §10). A
 * sheet whose table publishes two columns, or whose record field has no type,
 * would resolve every formula on the sheet and draw an error box on the card.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getComponent } from '../components';
import { parseFunctions } from '../formula/functions';
import {
	modifierTargetSource,
	publishedTargets,
} from '../formula/modifier-targets';
import {
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../formula/resolve';
import { buildSheet } from '../formula/sheet';
import { getSection, parseCharacter } from '../parse/character';
import type { Layout } from '../parse/layout';
import { DEFAULT_COLUMNS, parseLayout, serialiseLayout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { parseModifierDefinitions } from '../parse/modifier-definitions';
import { parseModifierTypes } from '../parse/modifier-types';
import { parseTriggers } from '../parse/triggers';
import { isContainer } from '../types';
import { STARTERS } from './index';

/**
 * The folder holding the sources, read as files rather than as imports.
 *
 * A path rather than a `URL`, unlike `view/vault-fixture.test.ts`: this file
 * runs under happy-dom, which installs its own `URL` over the global, and
 * `readdirSync` refuses that object as "not of scheme file".
 */
const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));

/** Every `.json` file beside this test, which is every bundled source. */
const SOURCE_FILES = readdirSync(SOURCE_DIR)
	.filter((name) => name.endsWith('.json'))
	.sort();

const textOf = (file: string): string =>
	readFileSync(join(SOURCE_DIR, file), 'utf8');

/** What `SheetView.renderSheet` builds, minus the DOM. */
function sheetFrom(layoutSource: string, noteSource: string) {
	const layout = parseLayout(layoutSource);
	const { library, problems } = parseFunctions(layout.functions);
	const note = parseCharacter(noteSource);

	const prepared = walkComponents(layout.components).map(({ config }) => {
		const component = getComponent(config.type);
		if (!component) throw new Error(`No component of type "${config.type}".`);
		const section = isContainer(component)
			? undefined
			: getSection(note, config.label);
		const result = section ? component.read(section.body, config) : null;
		return {
			config,
			component,
			error: result && !result.ok ? result.error : null,
			data: result?.ok === true ? result.data : null,
		};
	});

	const { env, modifiers } = buildSheet(layout, prepared, library);

	const entryFor = (id: string) => {
		const found = prepared.find((item) => item.config.id === id);
		if (!found) throw new Error(`No component with id "${id}".`);
		return found;
	};

	return {
		layout,
		problems,
		env,
		sheet: env.sheet,
		modifiers,
		prepared,
		entryFor,
		/** The editor's Modifiers list, asked for its report rather than its list. */
		definitions: parseModifierDefinitions(
			layout,
			prepared.map((entry) =>
				modifierTargetSource(entry.config, entry.component),
			),
		),
		/**
		 * A Card's `derived` as the card itself resolves it — through
		 * `makeFieldResolver` with the component's published name, which is what
		 * makes `mod.self` mean anything. `resolveFormulaFields` takes no name and
		 * reads it as 0, so asking that way is how a modifier case passes on the
		 * unmodified number.
		 */
		derivedFor: (id: string) => {
			const entry = entryFor(id);
			const stored = (entry.data as { value?: string } | null)?.value ?? '';
			return makeFieldResolver(
				entry.component,
				entry.config,
				entry.data,
				env,
			)('derived', { value: stored }, entry.config.id);
		},
		/**
		 * Every component drawn into its own element, as the grid draws it.
		 *
		 * **A container is drawn without its child region**, since `renderChildren`
		 * and `renderChild` are `view/grid-cells.ts`'s recursion and this is not a
		 * renderer. Nothing is missed by it: `walkComponents` flattens the tree, so
		 * every nested component is drawn on its own pass through this and checked
		 * for an error of its own. What is not asked here is what a tab set does
		 * with a region it was given, which is `tab-set.test.ts`'s subject.
		 */
		draw: (id: string): HTMLElement => {
			const entry = entryFor(id);
			const el = document.createElement('div');
			entry.component.render(el, entry.config, entry.data, {
				resolved: resolveFormulaFields(
					entry.component,
					entry.config,
					entry.data,
					env,
				),
				resolveField: makeFieldResolver(
					entry.component,
					entry.config,
					entry.data,
					env,
				),
				explainField: makeFieldExplainer(
					entry.component,
					entry.config,
					entry.data,
					env,
				),
				onChange: () => {},
			});
			return el;
		},
	};
}

/** A note naming a layout and holding nothing at all: the first render. */
const emptyNote = (name: string): string =>
	`---\nsheet-layout: ${name}\n---\n`;

/** The rows a twelve-column sheet spends on its header band before the columns. */
const HEADER_ROWS = 3;

/**
 * The column bands of a twelve-column sheet: the stacks sharing one column and
 * width, each with the row it ends on and the type of the component that ends it.
 *
 * **One spelling, at file level, because there are two such sheets and the
 * derivation is the same one.** It was written twice — once per describe — and
 * had already diverged, one copy carrying `foot` and the other not, with the
 * header height spelled `4` in both and nothing keeping the two in step.
 *
 * The header band above, and the full-width strip and tab set, are not columns.
 * Excluded by *shape* rather than by id, so this does not become a list of names
 * to maintain as either sheet moves.
 */
const bandsOf = (layout: Layout) => {
	const found = new Map<string, { width: number; last: number; foot: string }>();
	for (const config of layout.components) {
		const { col, row, width, height } = config.position;
		if (row <= HEADER_ROWS || width === (layout.columns ?? DEFAULT_COLUMNS)) {
			continue;
		}
		const key = `${col}:${width}`;
		const seen = found.get(key);
		const last = row + height - 1;
		found.set(key, {
			width,
			last: Math.max(seen?.last ?? 0, last),
			// The foot is whatever ends lowest, so a band read out of grid order
			// still reports the component a reader sees at the bottom of it.
			foot: (seen?.last ?? 0) > last ? seen!.foot : config.type,
		});
	}
	return [...found.values()];
};

/**
 * The two twelve-column sheets, which are one architecture over two arithmetics
 * — header band, full-width strip, three columns ending together, a full-width
 * tab set below — so the claims about that architecture are asked once, over
 * both, rather than copied into each sheet's own describe and left to drift.
 */
const TWELVE_COLUMN = (['Starter 5e'] as const).map(
	(name) =>
		[
			name,
			parseLayout(
				JSON.stringify(STARTERS.find((one) => one.name === name)?.source),
			),
		] as const,
);

describe.each(TWELVE_COLUMN)('%s shares the twelve-column architecture', (_name, layout) => {
	const walked = walkComponents(layout.components).map(({ config }) => config);

	it('puts a full-width tab set below the three columns', () => {
		const width = layout.columns ?? DEFAULT_COLUMNS;
		const below = layout.components.filter(
			(config) =>
				config.position.width === width &&
				config.position.row > HEADER_ROWS,
		);
		expect(below).toHaveLength(1);
		expect(below[0]?.type).toBe('tab-set');
		expect(below[0]?.position.row).toBe(bandsOf(layout)[0]!.last + 1);
	});

	it('holds two tab sets whose tabs are containers, within the depth cap', () => {
		const tabSets = walked.filter((config) => config.type === 'tab-set');
		expect(tabSets).toHaveLength(2);
		for (const tabSet of tabSets) {
			const tabs = tabSet.children ?? [];
			expect(tabs.length).toBeGreaterThanOrEqual(2);
			for (const tab of tabs) {
				expect(
					isContainer(getComponent(tab.type)),
					`${tab.label} is not a container`,
				).toBe(true);
				expect((tab.children ?? []).length).toBeGreaterThan(0);
				// Two deep is the cap `parseLayout` enforces, so a tab's own children
				// hold none of their own — the file would be refused outright if they
				// did, which is why this is an assertion about the sheets and not
				// about the parser.
				for (const leaf of tab.children ?? []) {
					expect(leaf.children, `${leaf.label} nests too deep`).toBeUndefined();
				}
			}
		}
	});
});

describe('the bundled sources are layout files', () => {
	it('has a file for every catalog entry and no others', () => {
		// The floor first (§10): every assertion below is over this list, and a
		// scan that read nothing would pass all of them.
		expect(SOURCE_FILES.length).toBe(STARTERS.length);
		expect(SOURCE_FILES.length).toBeGreaterThan(1);
	});

	it.each(SOURCE_FILES)('%s is in canonical form', (file) => {
		// Layout files carry no byte-identical promise (Constraint 3 is about
		// character notes), so this is discipline rather than constraint: it
		// means the file a reviewer reads in the tree is byte for byte the file a
		// user gets, and it goes red the moment the schema moves under a starter.
		const text = textOf(file);
		expect(serialiseLayout(parseLayout(text))).toBe(text);
	});

	it.each(SOURCE_FILES)('%s is named by its catalog entry', (file) => {
		// The filename is not the layout's name — the *name inside the file* is
		// what `createLayout` writes it under — so this is the one thing that
		// keeps a file from landing under one name and reporting another the
		// moment a character names it.
		const name = parseLayout(textOf(file)).name;
		const entry = STARTERS.find((starter) => starter.name === name);
		expect(entry, `no catalog entry named "${name}"`).toBeDefined();
	});

	it('carries none of the named marks, in any source, filename or catalog entry', () => {
		/*
		 * **The strings each replica had to leave behind, and the one the built
		 * sheet never had.** Both reference layouts are ordinary roleplaying or SRD
		 * vocabulary throughout except for their own `name` keys — `Blades in the
		 * Dark` and `DnD` — so for the two replicas this is the check that the
		 * rename was the whole of what travelled, and for the PF2e sheet, built
		 * from scratch, it is the only guard there is. Over the *sources* as text,
		 * because a mark could sit in any label, level name, row or function
		 * comment; over each *filename*, because a filename is published with the
		 * repository; and over the catalog, because the suggester's two lines are
		 * the strings a user actually reads.
		 *
		 * **Named marks, not "no trademark"**: literal substrings compared
		 * case-insensitively, so a spaced or punctuated spelling passes and any
		 * mark not on the list passes too. The list is the spec's — the three
		 * systems' marks and their rights-holders — and is not an adjudication of
		 * what belongs on such a list. A reader wanting a general claim needs a
		 * human, not this case.
		 */
		const marks = [
			'dungeons',
			'dragons',
			'd&d',
			'dnd',
			'wizards of the coast',
			'blades in the dark',
			'one seven design',
			'evil hat',
			'pathfinder',
			'paizo',
		];
		const haystacks = [
			...SOURCE_FILES.map((file) => `${file} ${textOf(file)}`),
			...STARTERS.map((starter) => `${starter.name} ${starter.description}`),
		];
		// The floor (§10): a scan over nothing passes every assertion below it.
		expect(haystacks).toHaveLength(SOURCE_FILES.length + STARTERS.length);
		expect(haystacks.join('').length).toBeGreaterThan(25000);
		for (const haystack of haystacks) {
			for (const mark of marks) {
				expect(haystack.toLowerCase(), mark).not.toContain(mark);
			}
		}
	});

	it('offers them in increasing size and density', () => {
		// Twenty-one components on six columns with no library, then 54 on twelve
		// with a library and two tab sets — so a reader who plays none of them can
		// stop at the first row that is more than they want. Play-share would put
		// 5e first and was deliberately not taken.
		expect(STARTERS.map((starter) => starter.name)).toEqual([
			'Starter Forged in the Dark',
			'Starter 5e',
		]);
	});

	it('gives every entry a line saying which one it is', () => {
		for (const starter of STARTERS) {
			expect(starter.description.length).toBeGreaterThan(20);
			// Sentence case, per AGENTS.md: a description is user-facing copy. A
			// capital followed by anything but a second capital, so "A whole
			// sheet: …" passes and a shouted word does not.
			expect(starter.description).toMatch(/^[A-Z](?![A-Z])/);
		}
	});
});

describe.each(STARTERS.map((starter) => [starter.name, starter] as const))(
	'%s against a character holding nothing',
	(name, starter) => {
		const source = JSON.stringify(starter.source);
		const built = sheetFrom(source, emptyNote(name));

		it('reads the library without complaint', () => {
			expect(built.problems).toEqual([]);
		});

		it('reads every section without an error', () => {
			// The premise as well as the claim: a starter with no components
			// would pass the loop below vacuously.
			expect(built.prepared.length).toBeGreaterThan(4);
			for (const entry of built.prepared) {
				expect(entry.error, `${entry.config.label} failed to read`).toBeNull();
			}
		});

		it('draws no component in an error state', () => {
			// A configuration error is drawn into the component's own container
			// and reaches no formula, so this is the only place it shows.
			for (const entry of built.prepared) {
				const drawn = built.draw(entry.config.id);
				expect(
					drawn.querySelector('.sheetsmith-error')?.textContent ?? null,
					`${entry.config.label} drew an error`,
				).toBeNull();
			}
		});
	},
);


/**
 * A scoundrel with dots, coin and a load — the values `Ravel.md` holds in the
 * vault, under this starter's own name.
 */
const FORGED_NOTE = `---
sheet-layout: Starter Forged in the Dark
---

## Playbook
\`\`\`sheet
value: Lurk
\`\`\`

## Heritage
\`\`\`sheet
value: Iruvia
\`\`\`

## Background
\`\`\`sheet
value: Underworld
\`\`\`

## Vice
\`\`\`sheet
value: Obligation
\`\`\`

## Coin
\`\`\`sheet
value: 2
\`\`\`

## Stash
\`\`\`sheet
current: 18
\`\`\`

## Stress
\`\`\`sheet
value: 5
\`\`\`

## Trauma
\`\`\`sheet
value: 1
\`\`\`

## Healing
\`\`\`sheet
value: 2
\`\`\`

## Armour
\`\`\`sheet
armour: yes
heavy: no
special: no
\`\`\`

## Insight actions

| Action | Rating |
| --- | --- |
| Hunt | 1 |
| Study | 0 |
| Survey | 2 |
| Tinker | 0 |

## Prowess actions

| Action | Rating |
| --- | --- |
| Finesse | 2 |
| Prowl | 3 |
| Skirmish | 1 |
| Wreck | 0 |

## Resolve actions

| Action | Rating |
| --- | --- |
| Attune | 1 |
| Command | 0 |
| Consort | 2 |
| Sway | 0 |

## XP
\`\`\`sheet
playbook: 5
insight: 2
prowess: 4
resolve: 1
\`\`\`

## Items

| Item | Load |
| --- | --- |
| Fine lockpicks | 1 |
| Climbing gear | 2 |
| Throwing knives | 1 |

## Load left
\`\`\`sheet
value: 5
\`\`\`
`;

/*
 * The compact one: a whole game on one screen, checked as a replica.
 *
 * What this starter shows that the other two do not is a sheet with no
 * function library whose primary arithmetic is aggregates over declared rows,
 * and which therefore mostly **resolves cold** — the counter-example to the two
 * twelve-column sheets, pinned here so it stays one.
 */
describe('the Forged in the Dark sheet is a whole game on one screen', () => {
	const source = JSON.stringify(
		STARTERS.find((one) => one.name === 'Starter Forged in the Dark')?.source,
	);
	const layout = parseLayout(source);
	const walked = walkComponents(layout.components).map(({ config }) => config);

	/** Every component as `id type col,row,width,height`, in walk order — read
	 * off the built layout, on the 5e pin's own terms. */
	const PINNED = [
		'playbook card 1,1,2,1',
		'heritage card 3,1,2,1',
		'background card 5,1,2,1',
		'vice card 1,2,3,1',
		'coin track 4,2,1,1',
		'stash pool 5,2,2,1',
		'stress track 1,3,2,1',
		'trauma track 3,3,1,1',
		'healing track 4,3,1,1',
		'armour track 5,3,2,1',
		'insight_rating card 1,4,2,1',
		'prowess_rating card 3,4,2,1',
		'resolve_rating card 5,4,2,1',
		'insight table 1,5,2,2',
		'prowess table 3,5,2,2',
		'resolve table 5,5,2,2',
		'harm table 1,7,3,2',
		'xp track 4,7,3,2',
		'abilities record-set 1,9,3,2',
		'items table 4,9,2,2',
		'load card 6,9,1,1',
	];

	it('replicates every component, its type and its placement', () => {
		expect(layout.components).toHaveLength(21);
		expect(
			walked.map((config) => {
				const { col, row, width, height } = config.position;
				return `${config.id} ${config.type} ${col},${row},${width},${height}`;
			}),
		).toEqual(PINNED);
	});

	it('keeps what makes it checkable against a real sheet, and nothing it lacks', () => {
		expect(layout.columns).toBe(6);
		expect(layout.triggers).toEqual(['Downtime']);
		// A replica keeps what the system has and gains nothing it lacks: no
		// library, no modifiers, no bonus types — this is the sheet with none.
		expect(layout.functions).toBeUndefined();
		expect(layout.modifiers).toBeUndefined();
		expect(layout.modifierTypes).toBeUndefined();
		// Five option cards — four of identity across the top and the load card,
		// whose option is what its derived reads against.
		expect(
			walked.filter((config) => (config as { options?: unknown[] }).options),
		).toHaveLength(5);
		// Three rating cards over three action tables of four declared rows each.
		expect(walked.filter((config) => config.id.endsWith('_rating'))).toHaveLength(3);
		for (const id of ['insight', 'prowess', 'resolve']) {
			const table = walked.find((config) => config.id === id) as { rows?: unknown[] };
			expect(table.rows, id).toHaveLength(4);
		}
		// One binding, and the trigger it names is the one the layout declares:
		// counting it would pass with the only button on the sheet doing nothing.
		expect(walked.filter((config) => config.reset !== undefined)).toHaveLength(1);
		expect(parseTriggers(layout).problems).toEqual([]);
	});

	it('holds no tab set, because it is the one-screen sheet', () => {
		// A tab set appearing here would mean the replica had drifted.
		expect(walked.filter((config) => config.type === 'tab-set')).toEqual([]);
		expect(walked.every((config) => config.children === undefined)).toBe(true);
	});

	it('resolves its ratings cold, and shows where the counter-example stops', () => {
		/*
		 * The three attribute cards are `count(<table>, Rating > 0)` over declared
		 * rows, and an aggregate over rows with nothing stored is 0 rather than a
		 * failure — so a fresh scoundrel reads three zeros.
		 *
		 * **The load card publishes nothing, and it does not draw a "?" either.**
		 * Those are two claims and it is easy to run them together: `value -
		 * items.Load` reads the card's own option, a dropdown with nothing chosen
		 * publishes nothing (SPEC §5, and `worked-examples.test.ts`'s "publishes
		 * nothing at all where nothing has been chosen") — but a `derived` that
		 * reads its own empty `value` takes `card.ts`'s blank accommodation and
		 * draws an em dash, because an unchosen option is a blank rather than a
		 * formula that failed. Both halves are pinned below, because the *drawn*
		 * half is what the manual criterion checks and nothing else here asks it.
		 */
		const cold = sheetFrom(source, emptyNote('Starter Forged in the Dark'));
		expect(cold.derivedFor('insight_rating')).toBe(0);
		expect(cold.derivedFor('prowess_rating')).toBe(0);
		expect(cold.derivedFor('resolve_rating')).toBe(0);
		expect(cold.sheet('items.Load')).toBe(0);
		expect(cold.derivedFor('load')).toBeNull();
		const drawn = cold.draw('load');
		expect(drawn.querySelector('.sheetsmith-card-derived-unresolved')).toBeNull();
		expect(drawn.textContent).toContain('—');
		expect(drawn.textContent).not.toContain('?');
	});

	it('resolves every name it publishes once the scoundrel has values', () => {
		const built = sheetFrom(source, FORGED_NOTE);
		const names = publishedTargets(
			built.prepared.map((entry) =>
				modifierTargetSource(entry.config, entry.component),
			),
		).map((target) => target.name);
		expect(names.length).toBeGreaterThan(8);
		expect(names.filter((name) => built.sheet(name) === undefined)).toEqual([]);
		// Ravel's own numbers: two of four Insight actions have a dot, three of
		// four Prowess, two of four Resolve, and a normal load of 5 less 4 carried.
		expect(built.derivedFor('insight_rating')).toBe(2);
		expect(built.derivedFor('prowess_rating')).toBe(3);
		expect(built.derivedFor('resolve_rating')).toBe(2);
		expect(built.derivedFor('load')).toBe(1);
	});
});
const FIFTH_NOTE = `---
sheet-layout: Starter 5e
---

## Passport
\`\`\`sheet
name: Sildar
class: Fighter
level: 5
\`\`\`

## Abilities
\`\`\`sheet
STR: 16
DEX: 14
CON: 15
INT: 10
WIS: 12
CHA: 8
\`\`\`

## Hit points
\`\`\`sheet
current: 38
max: 44
\`\`\`
`;

/*
 * The complete system sheet, checked as a replica rather than as a design.
 *
 * This starter's whole value is that a reader who plays the system can hold it
 * against the sheet they already own, so what a test here can protect is its
 * *completeness*: a later edit that quietly drops the equipment tab or reflows a
 * band would render perfectly and stop being the thing it is for. None of that
 * is visible in a formula, which is why every case below reads positions and
 * structure rather than arithmetic.
 */
describe('the 5e sheet is a complete system sheet', () => {
	const source = JSON.stringify(
		STARTERS.find((one) => one.name === 'Starter 5e')?.source,
	);
	const layout = parseLayout(source);
	const walked = walkComponents(layout.components).map(({ config }) => config);

	/**
	 * Every component as `id type col,row,width,height`, in walk order.
	 *
	 * **A snapshot in the test rather than a diff against the vault file**, which
	 * sits outside the repository (PATTERNS §2) and cannot be read from here. It
	 * pins what a replica has to keep — that the components exist, are what they
	 * were, and sit where they sat — and it is deliberately not a restatement of
	 * the source: every value in it was read off the built layout, so an edit to
	 * `5e.json` fails here rather than being copied into the expectation.
	 */
	const PINNED = [
		'passport passport 1,1,6,2',
		'hp pool 7,1,6,1',
		'speed card 7,2,2,1',
		'proficiency card 9,2,2,1',
		'inspiration track 11,2,2,1',
		'abilities card-set 1,3,12,1',
		'saves table 1,4,3,3',
		'skills table 4,4,4,8',
		'pages tab-set 8,4,5,10',
		'tab_combat group 1,1,5,10',
		'initiative card 1,1,2,1',
		'armour_class card 3,1,3,1',
		'defences rich-text 1,2,5,2',
		'conditions table 1,4,5,2',
		'attacks table 1,6,5,3',
		'tab_actions group 1,1,5,10',
		'other_actions table 1,1,5,8',
		'tab_spells group 1,1,5,10',
		'spell_dc card 1,1,2,1',
		'spell_attack card 3,1,3,1',
		'prepared card 1,2,5,1',
		'slots track 1,3,5,2',
		'spellbook record-set 1,5,5,3',
		'spell_notes rich-text 1,8,5,1',
		'tab_inventory group 1,1,5,10',
		'coin card-set 1,1,5,1',
		'carried card 1,2,2,1',
		'capacity card 3,2,3,1',
		'attuned card 1,3,5,1',
		'inventory table 1,4,5,5',
		'senses table 1,7,3,2',
		'hit_dice pool 1,9,3,1',
		'training rich-text 1,10,3,4',
		'death_saves track 4,12,4,1',
		'exhaustion track 4,13,4,1',
		'details tab-set 1,14,12,6',
		'tab_features group 1,1,12,6',
		'features record-set 1,1,8,6',
		'class_resource pool 9,1,4,2',
		'species_traits rich-text 9,3,4,2',
		'languages rich-text 9,5,4,2',
		'tab_description group 1,1,12,6',
		'appearance rich-text 1,1,4,3',
		'personality rich-text 5,1,4,3',
		'ideals rich-text 9,1,4,3',
		'backstory rich-text 1,4,6,3',
		'allies rich-text 7,4,6,3',
		'tab_notes group 1,1,12,6',
		'notes rich-text 1,1,6,6',
		'organisations rich-text 7,1,6,3',
		'enemies rich-text 7,4,6,3',
		'tab_extras group 1,1,12,6',
		'companions record-set 1,1,8,6',
		'extras_notes rich-text 9,1,4,6',
	];

	it('replicates every component, its type and its placement', () => {
		expect(walked).toHaveLength(54);
		expect(layout.components).toHaveLength(15);
		expect(
			walked.map((config) => {
				const { col, row, width, height } = config.position;
				return `${config.id} ${config.type} ${col},${row},${width},${height}`;
			}),
		).toEqual(PINNED);
	});

	it('keeps the whole of what makes it checkable against a real sheet', () => {
		// Nothing is cut, because every candidate cut damages the one thing this
		// starter is for: a sheet missing its skills roster or its rests is not one
		// a reader can hold against their own.
		expect(layout.functions).toHaveLength(11);
		expect(layout.triggers).toEqual(['Short rest', 'Long rest']);
		expect(layout.modifierTypes).toHaveLength(4);
		expect(layout.modifiers).toHaveLength(5);
		// The skills roster in full, which is the most cuttable-looking thing here
		// and the one whose loss would be least visible in a screenshot.
		const skills = walked.find((config) => config.id === 'skills');
		expect((skills as { rows?: unknown[] }).rows).toHaveLength(18);
		// And the reset bindings, which are what the two triggers act through.
		expect(walked.filter((config) => config.reset !== undefined)).toHaveLength(8);
	});

	it('binds every reset to a trigger the layout declares', () => {
		/*
		 * **The count above is independent of this**, which is the whole reason
		 * this is a case of its own: rename a trigger *inside* a binding and there
		 * are still eight bindings and still two declared names, while eight
		 * buttons quietly do nothing. Nothing else in this file would notice.
		 *
		 * Asked twice, because the two questions differ. `parseTriggers` is the
		 * report the layout editor shows, so asking it is asking what an author
		 * would be told — but **it walks `layout.components` only**, so of this
		 * sheet's eight bindings it reaches the four at the top level and none of
		 * the four inside the tab sets (`conditions`, `slots`, `features`,
		 * `class_resource`). The walk below is what covers the claim, and it is
		 * not a second copy of that module's policy: it is the same question asked
		 * where that module does not reach.
		 */
		const built = sheetFrom(source, FIFTH_NOTE);
		expect(parseTriggers(built.layout).problems).toEqual([]);

		const declared = new Set(layout.triggers ?? []);
		const bound = walked.flatMap((config) =>
			(config.reset ?? []).map((binding) => ({
				label: config.label,
				trigger: binding.trigger,
			})),
		);
		// The floor (§10): a sheet with no bindings would pass the filter below.
		expect(bound.length).toBeGreaterThan(8);
		expect(
			bound.filter((one) => !declared.has(one.trigger)),
		).toEqual([]);
	});

	it('stacks its middle into three columns of unequal width', () => {
		const widths = bandsOf(layout).map((band) => band.width);
		expect(widths).toHaveLength(3);
		// Equal thirds are the obvious arrangement and are not what a real sheet
		// wants — this is the arrangement the reference took three rounds of
		// measurement to settle.
		expect(new Set(widths).size).toBe(3);
	});

	it('ends all three columns on the same grid row', () => {
		expect(new Set(bandsOf(layout).map((band) => band.last)).size).toBe(1);
	});

	it('declares five usable modifier definitions', () => {
		const built = sheetFrom(source, FIFTH_NOTE);
		expect(built.definitions.problems).toEqual([]);
		expect(built.definitions.definitions).toHaveLength(5);
		/*
		 * **The names, not only the count**, because the rule they are held to is
		 * about *which* content ships rather than how much: a later editor could
		 * swap one for another, keep five, and nothing here would notice. The list
		 * demonstrates mechanisms — four bonus types contesting one target, a
		 * conditional `when`, an expression amount rather than a literal, and an
		 * override — and growth towards coverage is the SPEC §11 breach, not
		 * presence. Pinned so that growth has to be deliberate.
		 */
		expect((built.layout.modifiers ?? []).map((one) => one.name)).toEqual([
			'Shield of Faith',
			'Studded leather',
			'Ring of Protection',
			'Alert',
			'Bark Skin',
		]);
		expect(built.layout.modifierTypes).toEqual([
			'Armour',
			'Item',
			'Spell',
			'Class feature',
		]);
		expect(parseModifierTypes(built.layout).problems).toEqual([]);
	});

	it('resolves its library and the numbers built on it', () => {
		const built = sheetFrom(source, FIFTH_NOTE);
		expect(built.problems).toEqual([]);
		// `mod(score)` per ability, and `prof` from the aliased level: at level 5
		// proficiency is 3, and a 14 in the second ability is +2.
		expect(built.sheet('abilities.DEX')).toBe(2);
		expect(built.sheet('abilities.STR')).toBe(3);
		/*
		 * **The aliased level, asserted directly, because the skill row below
		 * cannot assert it.** `level = passport.level` then
		 * `prof = ceil(level / 4) + 1` is 3 at level 5, and the Proficiency card's
		 * `derived` is bare `prof` — so this is the one assertion in the file that
		 * fails if the alias breaks.
		 */
		expect(built.derivedFor('proficiency')).toBe(3);
		/*
		 * A published skill row read from outside the table, which is the passive
		 * sense shape the reference is built on. `ability + Training * prof` with
		 * a 12 in the fifth ability and nothing marked in Training: 1 + 0 × 3.
		 *
		 * **It is a real guard for one thing and no guard at all for another, and
		 * this comment used to state only the first.** It does hold the fixture to
		 * having no Skills section, since a trained row would read higher. It says
		 * nothing whatever about `prof`, because the term it appears in is
		 * multiplied by zero — the number would be 1 for any proficiency, a broken
		 * alias included. That is why the assertion above exists.
		 */
		expect(built.sheet('skills.perception')).toBe(1);
	});
});

