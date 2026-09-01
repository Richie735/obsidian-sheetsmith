import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	getComponent,
	listComponentTypes,
	paletteEntries,
	undrawableMessage,
	unknownComponentMessage,
} from './index';
import {
	ComponentConfig,
	EDITOR_OWNED_KEYS,
	isContainer,
	placesChildren,
	ScopeEntry,
} from '../types';
import { buildSheet, ReadComponent } from '../formula/sheet';
import { Layout } from '../parse/layout';

/*
 * Registry-wide contract checks (SPEC §4.1).
 *
 * These run against every registered component, so adding one to the registry
 * without satisfying the contract fails here rather than at runtime in a view.
 * Behaviour specific to a component, including its read/write round-trip,
 * belongs in that component's own test file.
 */

/**
 * The contract's own source, for the two facts below that no value can carry.
 *
 * A type is gone at runtime, and both of these are *declarations*: which member a
 * push carries, and which members two deliberately parallel interfaces hold. The
 * alternative is a value-level check that cannot be written, or no check at all.
 */
const TYPES = readFileSync(
	new URL('../types.ts', import.meta.url),
	'utf8',
);

/** One interface's body, by name, from a module's source. */
function declaration(source: string, name: string): string {
	const at = source.indexOf(`export interface ${name} {`);
	if (at < 0) throw new Error(`no interface called "${name}"`);
	const from = source.indexOf('{', at) + 1;
	const to = source.indexOf('\n}', from);
	return source.slice(from, to);
}

const KINDS = [
	'text',
	'number',
	'boolean',
	'formula',
	'select',
	'text-list',
	'entries',
	'track-rows',
	'rows',
	'columns',
];

/**
 * The order a component declares its members in (docs/PATTERNS.md §3): the
 * contract first, then the data path in the order it actually runs, then
 * rendering last because it is the longest.
 *
 * Checked rather than left to review because it is invisible in one. A member
 * in the wrong place reads perfectly well on its own — Pool and Track both put
 * `applyReset` before `write` and neither looked wrong — and the cost is only
 * ever paid later, by the reader who learns one component and then cannot find
 * their place in the next.
 */
const MEMBER_ORDER = [
	'type',
	'storage',
	// Beside `storage` because it is the same kind of fact: what this component
	// is structurally, before anything about its data or its drawing.
	'showsOneChild',
	'formulaFields',
	'configFields',
	// After the fields it prefills, because that is the order it reads in:
	// here are the settings, and here is one of them filled in for a job.
	'palette',
	// Beside `palette` because it is the same job read the other way: one
	// offers a configuration under a name, the other names a configuration.
	'configName',
	// Directly before `read`, because it is the body `read` is handed: the data
	// path's own first step, in the one context where there is no note.
	'sample',
	'read',
	'scopeValues',
	'scopeRows',
	// Beside the other two because it is the same job read a third way: one
	// publishes this component's names, one the rows that have none, and this
	// the changes it declares against names that are not its own.
	'scopeModifiers',
	'write',
	'hasBuffer',
	'applyReset',
	'render',
];

const types = listComponentTypes();

/** A child to place inside another component, for the containment checks. */
function child(): ComponentConfig {
	return bareConfig('card');
}

/** Only what the layout editor owns, so any component will take it. */
function bareConfig(type: string): ComponentConfig {
	return {
		id: 'sample',
		type,
		label: 'Sample',
		position: { col: 1, row: 1, width: 1, height: 1 },
	};
}

/**
 * Every name a component publishes under a config it was given nothing for.
 *
 * That is all a registry-wide sweep can ask for without holding a sample
 * config per component type, which is the one thing this file exists not to
 * do. It reaches a Pool, a Card and a Track, whose entries do not depend on
 * configuration; a Card set with no entries and a Table with no columns
 * correctly publish nothing, so their entries are checked in their own test
 * files against a card that is actually configured.
 */
function publishedEntries(type: string): ScopeEntry[] {
	const component = getComponent(type);
	const values = component?.scopeValues?.(null, bareConfig(type));
	if (values === undefined) return [];
	return [
		...(values.self === undefined ? [] : [values.self]),
		...Object.values(values.named ?? {}),
	];
}

/**
 * A scope entry says one thing about what its name is worth: the stored
 * value, a formula field, or a value the component computes. Two of them is
 * an entry with no right answer, and the type refuses it — so this is what
 * catches the one that got there through a cast.
 */
function saysTwoThings(entry: ScopeEntry): boolean {
	return entry.display !== undefined && entry.compute !== undefined;
}

describe('component registry', () => {
	it('has at least one component registered', () => {
		expect(types.length).toBeGreaterThan(0);
	});

	it('registers each type exactly once', () => {
		expect(new Set(types).size).toBe(types.length);
	});

	it('declares enough config fields for the per-field checks to mean anything', () => {
		// Every config field rule below runs inside a per-component loop over
		// `configFields`. A registry that stopped handing them out would pass
		// all of them by iterating nothing at all, so assert the loops have
		// something to look at before trusting that they looked.
		const fields = types.flatMap(
			(type) => getComponent(type)?.configFields ?? [],
		);
		expect(fields.length).toBeGreaterThan(25);
	});

	it('sees published entries from most of the components that publish any', () => {
		// The check below runs inside a per-component loop over what that
		// component publishes, and a component publishing nothing passes it by
		// iterating nothing. Two of them do exactly that under a bare config
		// and are covered in their own files, so this holds the rest: if the
		// sweep stopped reaching any component at all, or reached only one,
		// every per-component pass below would be worth nothing and nothing
		// else would say so.
		const publishing = types.filter(
			(type) => getComponent(type)?.scopeValues !== undefined,
		);
		const reached = publishing.filter((type) => publishedEntries(type).length > 0);
		expect(reached.length).toBeGreaterThan(publishing.length / 2);
	});

	it('catches an entry that says two things about one name', () => {
		// The rule the per-component check applies, applied to an entry that
		// breaks it. Without this, a check that never fires reads exactly
		// like a rule nothing violates.
		const both = {
			display: { field: 'derived', scope: {} },
			compute: () => 1,
		} as unknown as ScopeEntry;
		expect(saysTwoThings(both)).toBe(true);
	});

	it('names the containers, so a second one is a decision rather than a drift', () => {
		// The same spelling as the row-source check below, and for the same
		// reason: a bound like "not all of them" permits the kind spreading. A
		// container is the one component the sheet treats differently — it skips
		// its section, and the layout editor offers it as a destination — so a
		// second one arriving means somebody edits this line.
		const containers = types.filter((type) => isContainer(getComponent(type)));
		expect(containers).toEqual(['group', 'tab-set']);
	});

	it('leaves the row source off unless a component actually holds rows', () => {
		// `scopeRows` is optional under §4.1's rule — a member exists only where
		// the alternative is code outside the component knowing that
		// component's data shape — so the many must not have it.
		//
		// **Named rather than counted**, which is the only spelling that holds
		// the rule the comment claims: a bound like "fewer than all of them"
		// permits three of five, so the member could spread and this would still
		// pass. Naming it means a second component growing rows does not compile
		// its way past here — somebody edits this line, which is the decision
		// being asked for. It costs a catalog name in a registry-wide file, and
		// that is the smaller price.
		const holding = types.filter(
			(type) => getComponent(type)?.scopeRows !== undefined,
		);
		expect(holding).toEqual(['table']);
	});

	it('leaves the modifier source off unless a component declares any', () => {
		/*
		 * `scopeModifiers` is optional under §4.1's rule and it passes squarely:
		 * the alternative is the formula engine knowing that a Table has a modifier
		 * column, that a blank cell enrols in nothing, that a row may hold several
		 * such cells, and that a row's names are its cells layered under its
		 * computed columns.
		 *
		 * **Named rather than counted**, on the row source's own argument: a bound
		 * like "fewer than all of them" permits the member spreading, so a second
		 * component gaining one means somebody edits this line.
		 */
		const pushing = types.filter(
			(type) => getComponent(type)?.scopeModifiers !== undefined,
		);
		expect(pushing).toEqual(['table']);
	});

	it('holds a push to one part of a cell, and never to a definition name', () => {
		/*
		 * **`ModifierPush.part` is the whole of wave 3's change to the contract**,
		 * and it is a *narrowing* of what a component knows rather than a widening:
		 * the push carries one part's raw text, so the formula layer decides whether
		 * that text is a definition's name or an effect the row spells out. A member
		 * called `definition` would be the component knowing which tier it is.
		 *
		 * Read off the declaration, because a push is one component's data shape and
		 * this file cannot build one (see the note below). What a *real* push looks
		 * like is `table.test.ts`'s.
		 */
		const declared = declaration(TYPES, 'ModifierPush');
		expect(declared).toMatch(/^\s*part: string;$/m);
		expect(declared).not.toContain('definition:');
	});

	it('declares a typed effect as a definition minus its name, and no more', () => {
		/*
		 * **The field list, held once.** `TypedEffect` and `ModifierDefinition` are
		 * deliberately two interfaces of the same shape rather than one expressed as
		 * `Omit<ModifierDefinition, 'name'>` — because §7's edge is precisely that
		 * being *nameable* is what separates them, and naming one in terms of the
		 * other invites the next feature to give a typed effect a name in place.
		 *
		 * The cost of that decision is that the two can drift, and this is what
		 * stops them: a member added to one and not the other fails here rather than
		 * as a modifier that behaves differently depending on which file it came out
		 * of.
		 */
		const members = (name: string) =>
			[...declaration(TYPES, name).matchAll(/^\t(\w+)\??:/gm)].map(
				(match) => match[1],
			);
		const typed = members('TypedEffect');
		/*
		 * **The floor first**, because without it this case passes on two empty
		 * lists: a regex that stopped matching members would make both sides `[]` and
		 * `toEqual` perfectly happy. §10's rule is that a test which could pass
		 * vacuously must assert it is testing something, and an equality between two
		 * derived lists is the shape most exposed to it.
		 */
		expect(typed).toEqual([
			'target',
			'operator',
			'amount',
			'bonusType',
			'applies',
			'when',
		]);
		expect(typed).toEqual(
			members('ModifierDefinition').filter((one) => one !== 'name'),
		);
	});

	/*
	 * **The narrowed signature is the compiler's rather than this file's**, and
	 * saying so here is what stops somebody adding the vacuous version.
	 * `ModifierSource` used to take a `FieldExplainer` beside the resolver, so a
	 * slot refused for an unreadable amount could name the row *and* the reason;
	 * the amount is the definition's now and is evaluated in the formula layer,
	 * which holds the reason in hand, so both left the component. Nothing here can
	 * *call* a source without building a config with a modifier column in it,
	 * which is one component's data shape — so the arity is held where a real one
	 * is built (`table.test.ts`) and by every call site compiling.
	 */

	it('names the types that can hold components when one cannot', () => {
		// `children` is shared config the parser walks without knowing any type,
		// so a hand-edited layout can put cards inside a Card. The fix is a type
		// that holds them, and which those are is the registry's question — the
		// view naming one would be the view knowing a component exists.
		const leaf = types.find((type) => !isContainer(getComponent(type)));
		const config = { ...bareConfig(leaf ?? 'card'), children: [child(), child()] };
		const message = undrawableMessage(config, getComponent(leaf ?? 'card'));
		expect(message).toContain(`"${leaf ?? ''}"`);
		expect(message).toContain('2 components');
		for (const type of types) {
			if (isContainer(getComponent(type))) expect(message).toContain(type);
		}
		// And it counts, rather than saying "components" for one of them.
		expect(
			undrawableMessage(
				{ ...bareConfig(leaf ?? 'card'), children: [child()] },
				getComponent(leaf ?? 'card'),
			),
		).toContain('1 component inside');

		// A container handed the same children is drawable, which is what keeps
		// the check above from reporting every nested layout.
		const holder = types.find((type) => isContainer(getComponent(type)));
		expect(
			undrawableMessage(
				{ ...bareConfig(holder ?? 'group'), children: [child()] },
				getComponent(holder ?? 'group'),
			),
		).toBeNull();
	});

	it('names every shared config key, so the rules that forbid them are not vacuous', () => {
		/*
		 * Both rules below use `EDITOR_OWNED_KEYS` as the *forbidden* set, so an
		 * emptied list passes them by forbidding nothing — and the palette's half
		 * is the compiler's, where `Omit<TConfig, never>` would quietly let an
		 * entry prefill an id. That became worth checking when the list moved into
		 * shipping code to be the one copy the type derives from.
		 *
		 * Anchored to the config the editor actually writes rather than to a
		 * second spelling of the six: every key of a bare component is a key the
		 * editor owns, so a seventh shared key on `ComponentConfig` fails here
		 * until it is named.
		 */
		for (const key of Object.keys(bareConfig('card'))) {
			expect(EDITOR_OWNED_KEYS).toContain(key);
		}
		// The two that are optional, and so absent from a bare config: `reset` is
		// a binding the editor renders beside label and position, and `children`
		// is the key it writes when something is put inside a container.
		expect(EDITOR_OWNED_KEYS).toContain('reset');
		expect(EDITOR_OWNED_KEYS).toContain('children');
	});

	it('offers at least one palette entry, so the per-entry checks look at something', () => {
		// Every palette rule below runs inside a loop over one component's
		// entries, and a registry offering none would pass all of them by
		// iterating nothing at all.
		const entries = types.flatMap((type) => [...paletteEntries(type)]);
		expect(entries.length).toBeGreaterThan(0);
	});

	it('gives no two entries on one type the same name', () => {
		/*
		 * Two entries under one type sharing a name are two identical indented
		 * lines in the menu, differing only in an option value nobody sees. That
		 * is not a configuration anyone chooses, so it fails here (SPEC §4.2).
		 *
		 * **Per type, not across the palette.** Global uniqueness was the first
		 * spelling and it forbade something legitimate: the menu is grouped by
		 * type with each entry under its own, so a Table offered as "Inventory"
		 * beside a Card set offered as "Inventory" is two distinguishable lines,
		 * and the deferred prefills (SPEC §13) must not be refused by a rule
		 * nothing needs. The option value is `type:index` and the label goes
		 * through `uniqueLabel`, so neither depends on this either way.
		 */
		for (const type of types) {
			const names = paletteEntries(type).map((entry) => entry.name);
			expect(new Set(names).size).toBe(names.length);
		}
	});

	it('names the types a layout may use when one is unknown', () => {
		// A stale layout file is the one place a user meets a type id they
		// have to fix by hand, so the message carries the vocabulary rather
		// than only the fault (docs/UI.md §12).
		const message = unknownComponentMessage('skill-card');
		expect(message).toContain('"skill-card"');
		for (const type of types) expect(message).toContain(type);
	});
});

describe('a component that draws a label asks whether it should', () => {
	/*
	 * Two reasons a component must not draw its visible label: the layout asked
	 * for none, or a container above it has already shown one. Group honoured the
	 * second and the other five did not, so a Table tab drew its heading under a
	 * strip that had just named it — in a different type treatment, so it read as
	 * an accident rather than a repeat.
	 *
	 * A source scan rather than a render sweep, because rendering every component
	 * registry-wide needs a DOM this file deliberately does not have (`setIcon`
	 * reaching the stub is what made three node-environment files fail on import
	 * once). What it holds is the obligation itself: if a file declares a
	 * `ComponentDefinition<…>` and reads `config.label`, it asks `showsOwnLabel`.
	 * That is the enumeration the bug came from, checked in the one place that
	 * cannot be forgotten rather than remembered in six.
	 */
	const HERE = dirname(fileURLToPath(import.meta.url));

	/** Files declaring a component, which `index.ts` and the painters do not. */
	function componentFiles(): { name: string; source: string }[] {
		return readdirSync(HERE)
			.filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
			.map((name) => ({
				name,
				source: readFileSync(join(HERE, name), 'utf8'),
			}))
			.filter(({ source }) => source.includes('ComponentDefinition<'));
	}

	it('finds every component file', () => {
		// A filter that stopped matching would pass the check below by iterating
		// nothing, and the count has to keep up with the registry.
		expect(componentFiles()).toHaveLength(types.length);
	});

	it('asks showsOwnLabel wherever it reads its own label', () => {
		const forgetful = componentFiles()
			.filter(({ source }) => source.includes('config.label'))
			.filter(({ source }) => !source.includes('showsOwnLabel'))
			.map(({ name }) => name);
		expect(forgetful).toEqual([]);
	});

	it('draws every two-state control through the shared ring painter', () => {
		/*
		 * `docs/UI.md` §9: when a card and a cell do the same job they share the
		 * painter, "precisely so one flag cannot measure differently from the
		 * other under the same finger". A `toggle` column and a Track's flag are
		 * that case, and the way it would drift is somebody giving the second one
		 * a lookalike — a native checkbox, or its own class with its own
		 * measurements — which reads perfectly well in the file it is written in.
		 *
		 * `aria-pressed` is the marker because it is the one thing a two-state
		 * control cannot be written without: ARIA has a word for two states, and
		 * a control declaring it is declaring itself to be one.
		 */
		const lookalikes = componentFiles()
			.filter(({ source }) => source.includes('aria-pressed'))
			.filter(({ source }) => !source.includes('paintLevelRing'))
			.map(({ name }) => name);
		expect(lookalikes).toEqual([]);
	});

	it('finds the two-state controls it is meant to be checking', () => {
		// A marker that stopped matching would pass the check above by iterating
		// nothing, and the rule it holds is about the *second* implementor.
		const pressing = componentFiles().filter(({ source }) =>
			source.includes('aria-pressed'),
		);
		expect(pressing.length).toBeGreaterThan(1);
	});

	/*
	 * A native checkbox, by the two spellings a component could reach it through.
	 *
	 * Narrower than the word, deliberately. Matching `'checkbox'` anywhere failed
	 * the build on any component that so much as quoted it — and one already
	 * nearly did: Track's `count` description says "a plain 1 makes this a
	 * checkbox", which escaped only for want of a pair of quotes. A guard whose
	 * false positive is a sentence explaining the guard is a guard somebody will
	 * delete.
	 *
	 * `components/` builds DOM with the standard API rather than Obsidian's
	 * helpers, so the routes are an assignment or an object literal (`type` set to
	 * it) and `setAttribute('type', 'checkbox')`. `Setting.addToggle` is not one:
	 * a component cannot import it.
	 */
	const NATIVE_CHECKBOX = /type\s*[=:]\s*'checkbox'|'type'\s*,\s*'checkbox'/;

	it('never draws a checkbox where the ring is the control', () => {
		// The other half of §4.2's ruling, and the half a class name cannot
		// carry: a native checkbox has none of the ring's hit target, its
		// coarse-pointer sizing or its press feedback, so reaching for one is the
		// drift rather than an alternative spelling of the same control. It is
		// also the half the `aria-pressed` check above cannot reach, since a
		// native checkbox carries `checked` and declares no ARIA at all.
		const checkboxes = componentFiles()
			.filter(({ source }) => NATIVE_CHECKBOX.test(source))
			.map(({ name }) => name);
		expect(checkboxes).toEqual([]);
	});

	it('catches a checkbox however it is spelled, so the scan above means something', () => {
		// The check above asserts an empty list, so a pattern that had stopped
		// matching anything would read exactly like a rule nothing violates. Same
		// shape as the two-things-about-one-name check: the rule applied to
		// something that breaks it.
		for (const spelling of [
			"input.type = 'checkbox';",
			"createElement('input', { type: 'checkbox' })",
			"el.setAttribute('type', 'checkbox');",
		]) {
			expect(NATIVE_CHECKBOX.test(spelling)).toBe(true);
		}
		// And the prose it must not fire on.
		expect(NATIVE_CHECKBOX.test('A plain 1 makes this a checkbox.')).toBe(false);
	});
});

/*
 * What a component says a sample of itself looks like
 * (`docs/features/preview-sample-values.md`).
 *
 * Registry-wide because every rule here is about the member rather than about
 * any one component's filler: that it reads, that it writes back byte for byte,
 * that it holds no link and enrols in no modifier, and that nothing but the
 * layout editor's canvas ever calls it. What a *particular* sample contains —
 * a Pool below its max, a Track part-marked, a Table's added rows — is that
 * component's own test file, on §10's rule.
 */
describe('a component that says what a sample of itself looks like', () => {
	/**
	 * Every config a registry-wide sweep can hand a component: the bare one the
	 * editor writes, and each palette entry's prefill on top of it.
	 *
	 * The palette entries are what stop this being a check of six empty bodies.
	 * A Card set with no entries and a Table with no columns correctly sample
	 * nothing, and their palette configs are the only configuration this file
	 * can reach without holding a sample config per component type — the one
	 * thing it exists not to do.
	 */
	function configsFor(type: string): ComponentConfig[] {
		return [
			bareConfig(type),
			...paletteEntries(type).map((entry) => ({
				...bareConfig(type),
				...entry.config,
			})),
		];
	}

	interface Sampled {
		type: string;
		/** Which configuration this is, for an assertion that names them. */
		where: string;
		config: ComponentConfig;
		body: string;
	}

	/** Every sample the registry can produce, with the config it came from. */
	function samples(): Sampled[] {
		const out: Sampled[] = [];
		for (const type of types) {
			const component = getComponent(type);
			if (component?.sample === undefined) continue;
			const entries = paletteEntries(type);
			configsFor(type).forEach((config, index) => {
				out.push({
					type,
					where:
						index === 0 ? `${type} bare` : `${type} ${entries[index - 1]?.name ?? ''}`,
					config,
					body: component.sample?.(config) ?? '',
				});
			});
		}
		return out;
	}

	/**
	 * The samples with something in them, which is what most rules below are
	 * about — the empty ones are named by the case directly below rather than
	 * silently dropped, so a sample that started returning nothing shows up as a
	 * failure there instead of quietly leaving every loop here.
	 */
	function filled(): Sampled[] {
		return samples().filter((entry) => entry.body !== '');
	}

	/**
	 * Every configuration this sweep reaches, named.
	 *
	 * **Named rather than counted**, on the row-source check's own argument one
	 * file over: a floor like "more than five" permits three of eleven going
	 * quietly empty, and the whole exposure of a sample is that an empty one is
	 * indistinguishable from a component that has nothing to say. Naming them
	 * means a palette entry added or a sample dropped is a line somebody edits,
	 * which is the decision being asked for.
	 */
	const SWEPT = [
		'card bare',
		'card Dropdown',
		'card-set bare',
		'card-set Currency',
		'pool bare',
		'rich-text bare',
		'table bare',
		'table Inventory',
		'table Features',
		'track bare',
		'track Checkbox',
	];

	/**
	 * The three configurations that name nothing to fill, which is the honest
	 * answer rather than an invented key: a Card set with no entries, a Table
	 * with no rows and no open rows, and a Track with no count, levels or rows —
	 * the last of which is a configuration error the card reports in place.
	 */
	const EMPTY = ['card-set bare', 'table bare', 'track bare'];

	it('sweeps every sampled configuration, and fills all but the ones that name nothing', () => {
		expect(samples().map((entry) => entry.where)).toEqual(SWEPT);
		expect(
			samples()
				.filter((entry) => entry.body === '')
				.map((entry) => entry.where),
		).toEqual(EMPTY);
	});

	it('fixes where a sample is declared, between naming a config and reading one', () => {
		// The member order is checked per component below; what it cannot say is
		// *where* this one belongs, since a component that declares it in the
		// wrong place is only caught if `MEMBER_ORDER` holds the right place.
		expect(MEMBER_ORDER.indexOf('sample')).toBe(
			MEMBER_ORDER.indexOf('configName') + 1,
		);
		expect(MEMBER_ORDER.indexOf('read')).toBe(MEMBER_ORDER.indexOf('sample') + 1);
		// And the rule applied to something that breaks it, so an order check
		// that had stopped comparing anything does not read as a rule nothing
		// violates — the same shape as the two-things-about-one-name case above.
		const declared = ['type', 'storage', 'read', 'sample'];
		const known = declared.filter((name) => MEMBER_ORDER.includes(name));
		const expected = MEMBER_ORDER.filter((name) => declared.includes(name));
		expect(known).not.toEqual(expected);
	});

	it('declares every contract member the order names, and no other', () => {
		/*
		 * `MEMBER_ORDER` against the interface itself. The per-component checks
		 * below hold each component to the list; this holds the *list* to the
		 * contract, so a member added to `ComponentDefinition` and not to the
		 * order silently escapes both — it would fall outside the order check and
		 * outside "declares nothing outside the contract" at once.
		 *
		 * The floor first, because an equality between two derived lists is the
		 * shape most exposed to a vacuous pass: a regex that stopped matching
		 * would make both sides agree on nothing at all.
		 */
		const body = TYPES.slice(TYPES.indexOf('export interface ComponentDefinition<'));
		const members = [...body.slice(0, body.indexOf('\n}')).matchAll(/^\t(\w+)\??[(:<]/gm)]
			.map((match) => match[1] as string);
		expect(members.length).toBeGreaterThan(10);
		expect([...members].sort()).toEqual([...MEMBER_ORDER].sort());
	});

	it('reads back every sample it declares, under every config it is offered', () => {
		// The point of the member: a sample is a *body*, so it goes through the
		// component's own `read` and a sample that could not be stored in a note
		// fails here rather than drawing a state no character can be in.
		const seen = filled();
		// The floor, exact rather than approximate: the case above names every
		// configuration this sweep reaches and which of them fill nothing, so
		// there is no reason for this to accept a smaller number than that.
		expect(seen.map((entry) => entry.where)).toEqual(
			SWEPT.filter((where) => !EMPTY.includes(where)),
		);
		for (const { type, config, body } of seen) {
			const result = getComponent(type)?.read(body, config);
			expect(result?.ok, `${type} cannot read its own sample`).toBe(true);
			// A body with something in it that reads as nothing stored is a
			// sample that draws exactly the empty card it was meant to fill.
			if (result?.ok) expect(result.data, `${type} samples nothing`).not.toBeNull();
		}
	});

	it('writes every sample back byte for byte', () => {
		// Constraint 3 over one more body per component, and a round-trip
		// fixture the component did not choose its own config for.
		const seen = filled();
		expect(seen).toHaveLength(SWEPT.length - EMPTY.length);
		for (const { type, config, body } of seen) {
			const component = getComponent(type);
			const result = component?.read(body, config);
			if (!result?.ok || result.data === null) continue;
			expect(
				component?.write(result.data, body, config),
				`${type} does not write its own sample back unchanged`,
			).toBe(body);
		}
	});

	it('puts no wikilink in a sample', () => {
		// There is no vault behind the canvas, so a link would draw unresolved
		// and read as a fault in the author's layout rather than as filler.
		const seen = filled();
		expect(seen).toHaveLength(SWEPT.length - EMPTY.length);
		for (const { where, body } of seen) {
			expect(body, `${where} samples a wikilink`).not.toContain('[[');
		}
	});

	it('builds a sheet from every sample, and enrols none of them in a modifier', () => {
		/*
		 * A modifier cell names one of the *layout's* definitions, and a layout
		 * the author is still building may declare none — so a sample naming one
		 * would put a definition problem on screen that the author did not cause.
		 *
		 * **What this case proves, exactly.** Every sample survives a real
		 * `buildSheet` — the path the canvas takes, read then build — and no
		 * component's `scopeModifiers` yields a push from its own sample. What it
		 * does *not* prove is the case with a cell to leave empty: reaching that
		 * needs a config with a modifier column in it, which is one component's
		 * data shape and the thing this file exists not to hold, so the enrolment
		 * check with teeth in it is `table.test.ts`'s. This is the standing sweep
		 * that no *other* component grows a push quietly, and it is worth what it
		 * is worth rather than more.
		 *
		 * It used to assert `modifiers.definitions` was empty as well. That was
		 * entailed by the fixture — the table is derived from the layout's own
		 * declared definitions and this layout declares none — so it could not
		 * fail, whatever any sample did.
		 */
		const prepared: ReadComponent[] = [];
		for (const { type, config, body } of filled()) {
			const component = getComponent(type);
			const result = component?.read(body, config);
			prepared.push({
				config: { ...config, id: `${type}_${prepared.length}` },
				component,
				data: result?.ok === true ? result.data : null,
				error: null,
			});
		}
		expect(prepared).toHaveLength(SWEPT.length - EMPTY.length);
		const layout: Layout = {
			name: 'Samples',
			components: prepared.map((entry) => entry.config),
		};
		// Built and then read from, so a sample that broke the build fails here
		// rather than in whichever later case happened to touch it first.
		expect(() => buildSheet(layout, prepared)).not.toThrow();
		for (const entry of prepared) {
			const source = entry.component?.scopeModifiers?.(entry.data, entry.config);
			const pushes = source?.(() => null) ?? [];
			expect(pushes, `${entry.config.type} enrols its sample`).toEqual([]);
		}
	});
});

describe.each(types)('component "%s"', (type) => {
	const component = getComponent(type);

	it('is retrievable from the registry', () => {
		expect(component).toBeDefined();
	});

	it('declares a type matching its registry key', () => {
		expect(component?.type).toBe(type);
	});

	it('declares a storage kind fixed by the contract', () => {
		expect(['fenced', 'markdown', 'none']).toContain(component?.storage);
	});

	it('holds nothing at all where it declares no storage', () => {
		// `none` is a container (SPEC §4.1): it holds other components rather
		// than a value. Checked rather than asserted in prose, because that is
		// the whole reason the kind exists — declaring `fenced` for a component
		// with no fence is a statement nothing verifies and a reader would
		// believe, and the sheet skips `getSection` and `read` on the strength
		// of this one.
		if (!component || !isContainer(component)) return;
		// `typeof` rather than the members themselves: reading a method off a
		// definition to assert on it is an unbound method, which the lint rules
		// reject — and every other member check in this file already asks the
		// same question this way.
		expect(typeof component.scopeValues).toBe('undefined');
		expect(typeof component.scopeRows).toBe('undefined');
		// A sample is a *section body*, and a container has no section: the
		// sheet skips `getSection` and `read` for one, so whatever it returned
		// would never be read by anything. `showsOneChild`'s own precedent — a
		// member with no reading is worse than none.
		expect(typeof component.sample).toBe('undefined');
		expect(typeof component.scopeModifiers).toBe('undefined');
		expect(typeof component.applyReset).toBe('undefined');
		expect(component.hasBuffer).toBeUndefined();
		// Containment is not addressing, so there is no name to compute either.
		expect(component.formulaFields).toEqual([]);
	});

	it('implements read, write, and render', () => {
		expect(typeof component?.read).toBe('function');
		expect(typeof component?.write).toBe('function');
		expect(typeof component?.render).toBe('function');
	});

	it('publishes scope values as a function, or not at all', () => {
		// An optional member: a component either publishes values to the rest
		// of the sheet's formulas or it does not, never something in between
		// that the view would have to guard against.
		expect(['function', 'undefined']).toContain(typeof component?.scopeValues);
	});

	it('publishes no name declaring both a display and a computed value', () => {
		// One name, one source. `display` names a formula field the layout
		// can be read for; `compute` is the component's own code and nothing
		// outside it can see through. An entry declaring both would leave the
		// name table picking one, which is a decision it has no business
		// making.
		//
		// The type refuses it outright, so what this catches is one that got
		// there through a cast — and only among the names this component
		// publishes with nothing configured. A component whose entries depend
		// on its config publishes none here and asserts the same rule over a
		// configured card in its own test file.
		expect(publishedEntries(type).filter(saysTwoThings)).toEqual([]);
	});

	it('declares modifiers as a function, or not at all', () => {
		// The same optional-member rule as scopeValues and scopeRows: a component
		// either declares changes against names that are not its own or it does
		// not, never something in between that the formula engine would have to
		// guard against.
		expect(['function', 'undefined']).toContain(typeof component?.scopeModifiers);
	});

	it('publishes rows as a function, or not at all', () => {
		// The same optional-member rule as scopeValues: a component either holds
		// rows an aggregate can walk or it does not, never something in between
		// that the formula engine would have to guard against.
		expect(['function', 'undefined']).toContain(typeof component?.scopeRows);
	});

	it('places its children unless it declares that it shows one', () => {
		// The predicate against the flag, once, so the complement is asserted
		// rather than trusted at four call sites. §1's policy tier is why the four
		// became one: a guard test over them could only say they still spell the
		// same thing.
		expect(placesChildren(component)).toBe(component?.showsOneChild !== true);
	});

	it('declares showing one child only where it can hold children at all', () => {
		// A flag with no reading is worse than no flag: it is `hasBuffer` on a
		// component with no buffer, and the editor would act on it. Only a
		// container has children to show one of.
		if (component?.showsOneChild === undefined) return;
		expect(typeof component.showsOneChild).toBe('boolean');
		expect(isContainer(component)).toBe(true);
	});

	it('applies resets as a function, or not at all', () => {
		expect(['function', 'undefined']).toContain(typeof component?.applyReset);
	});

	it('declares reset.to as a formula field when it resets', () => {
		// `reset` is shared config, so it is forbidden in configFields and
		// each stateful component has to remember this string for itself —
		// three copies of one truth by the time Pool, Track, and Toggle
		// exist. Forget it and `isDeclared` returns null for reset.to, the
		// resolver hands back nothing, and the reset silently does nothing
		// at all. Cheaper to fail here than to debug a dead button.
		if (component?.applyReset === undefined) return;
		expect(component.formulaFields).toContain('reset.*.to');
	});

	it('declares formulaFields and configFields', () => {
		expect(Array.isArray(component?.formulaFields)).toBe(true);
		expect(Array.isArray(component?.configFields)).toBe(true);
	});

	it('gives every config field a key, a label, a known kind, and a description', () => {
		// The description is not decoration: the layout editor renders it as
		// the only explanation of what the setting does to the note, and a
		// field without one is a field the author has to guess at.
		for (const field of component?.configFields ?? []) {
			expect(field.key).toBeTruthy();
			expect(field.label).toBeTruthy();
			expect(KINDS).toContain(field.kind);
			expect(field.description).toBeTruthy();
		}
	});

	it('gives every two-column list field its own column names', () => {
		/*
		 * The editor's entries table serves three vocabularies — a Card set's
		 * key and full name, a Track row's key and name, a Card option's value
		 * and label — and holds none of them: a default there would be one
		 * caller's words compiled into a shared module, and choosing between two
		 * callers' words would be that module asking which caller it is
		 * (docs/PATTERNS.md §1). So the words live on the field, and a field of
		 * this kind without them draws no table at all. Same shape as the select
		 * rule below, and here for the same reason: the member is optional on
		 * `ConfigFieldSpec` because most kinds have no use for it, so what makes
		 * it required for these two is this check.
		 */
		for (const field of component?.configFields ?? []) {
			if (field.kind !== 'entries' && field.kind !== 'track-rows') continue;
			const columns = field.entryColumns;
			expect(columns, `${field.key} declares no columns`).toBeDefined();
			if (!columns) continue;
			for (const column of columns) {
				expect(column.key).toBeTruthy();
				// The heading is the column's only name: the header, the
				// placeholder, and the accessible name a screen reader hears.
				expect(column.heading).toBeTruthy();
			}
			// Two columns writing one property is one column with two inputs,
			// and the second would silently win every commit.
			expect(columns[0].key).not.toBe(columns[1].key);
		}
	});

	it('gives every select field a non-empty options list', () => {
		for (const field of component?.configFields ?? []) {
			if (field.kind === 'select') {
				expect(field.options ?? []).not.toHaveLength(0);
			}
		}
	});

	it('declares its members in the order §3 fixes', () => {
		const declared = Object.keys(component ?? {});
		// Only the ones this component has, in the order it has them. A
		// component omitting scopeValues or applyReset is not a finding; one
		// declaring render before read is.
		const known = declared.filter((name) => MEMBER_ORDER.includes(name));
		const expected = MEMBER_ORDER.filter((name) => declared.includes(name));
		expect(known).toEqual(expected);
	});

	it('declares nothing outside the contract', () => {
		// Otherwise the order check above silently stops covering a member,
		// and the registry grows a field nothing else knows to look for.
		const declared = Object.keys(component ?? {});
		expect(declared.filter((name) => !MEMBER_ORDER.includes(name))).toEqual(
			[],
		);
	});

	it('names a configuration as a string, or not at all', () => {
		// A component that only ever is what its type says leaves it off, and
		// the editor shows the type — which is what every component did before
		// this existed. An empty string is the failure worth catching: it would
		// blank the line rather than falling back to the type.
		if (component?.configName === undefined) return;
		expect(typeof component.configName).toBe('function');
		for (const entry of component.palette ?? []) {
			const named = component.configName(entry.config as never);
			expect(named === null || (typeof named === 'string' && named !== '')).toBe(
				true,
			);
		}
	});

	it('offers palette entries as a list, or not at all', () => {
		// An optional member under §4.1's rule, so a component with nothing worth
		// prefilling leaves it off and appears as its bare type — never as
		// something in between the editor would have to guard against.
		if (component?.palette === undefined) return;
		expect(Array.isArray(component.palette)).toBe(true);
		expect(component.palette.length).toBeGreaterThan(0);
	});

	it('gives every palette entry a name, a description, and some config', () => {
		for (const entry of component?.palette ?? []) {
			expect(entry.name).toBeTruthy();
			// The description is not decoration here either: the menu line is
			// one or two words, and this is the only thing that says what the
			// prefill is for (docs/UI.md, SPEC §13).
			expect(entry.description).toBeTruthy();
			// An entry prefilling nothing is the bare type, which the palette
			// already offers.
			expect(Object.keys(entry.config).length).toBeGreaterThan(0);
		}
	});

	it('prefills no config key the layout editor owns', () => {
		// The type excludes them, so what this catches is one that got there
		// through a cast — and the two worth naming are why it is worth catching:
		// a `reset` prefill would name a trigger the layout may not declare, and
		// a `children` prefill would make an entry that produces several
		// components, which SPEC §13 rules out.
		for (const entry of component?.palette ?? []) {
			for (const key of Object.keys(entry.config)) {
				expect(EDITOR_OWNED_KEYS).not.toContain(key);
			}
		}
	});

	it('declares every prefilled key as a config field it also renders', () => {
		// Otherwise an entry hands the author configuration with no form to edit
		// it in, which is the palette quietly becoming a second way to configure
		// a component.
		const declared = (component?.configFields ?? []).map((field) => field.key);
		for (const entry of component?.palette ?? []) {
			for (const key of Object.keys(entry.config)) {
				expect(declared).toContain(key);
			}
		}
	});

	it('prefills its keys in the order the form shows them', () => {
		/*
		 * An entry reads as the form with some of it filled in, which is the same
		 * reason PATTERNS §3 puts `palette` after `configFields` — here are the
		 * settings, and here is one of them filled in for a job. An entry whose
		 * keys run in some other order still works and still reads perfectly well
		 * on its own, which is exactly why it is checked rather than reviewed:
		 * `MEMBER_ORDER` above is the same rule one level up.
		 *
		 * Positions rather than a spelled-out list, so this says the rule once
		 * instead of once per entry. The check above has already established that
		 * every key is a declared field, so none of these is -1.
		 */
		const declared = (component?.configFields ?? []).map((field) => field.key);
		for (const entry of component?.palette ?? []) {
			const order = Object.keys(entry.config).map((key) => declared.indexOf(key));
			expect(order, `${entry.name} prefills out of form order`).toEqual(
				[...order].sort((a, b) => a - b),
			);
		}
	});

	it('prefills no value a field already defaults to', () => {
		/*
		 * A layout stores what an entry wrote, and a layout is hand-edited and
		 * shared — so an entry that spells out a default writes that noise into
		 * every layout anyone builds from it, and writes a key the editor itself
		 * would have left out. This is what lets Currency be horizontal by saying
		 * nothing and Features hold text columns by declaring no type.
		 *
		 * The two kinds that *have* a knowable default are the two the editor
		 * omits on, and `ConfigFieldSpec` says so on the members themselves:
		 * `default` for a boolean, the first option for a select. The rest have
		 * no default to compare against — a prefilled `count` or `rowHeader` is
		 * the entry's whole content.
		 */
		const fields = component?.configFields ?? [];
		for (const entry of component?.palette ?? []) {
			for (const [key, value] of Object.entries(entry.config)) {
				const field = fields.find((candidate) => candidate.key === key);
				const fallback =
					field?.kind === 'boolean'
						? field.default
						: field?.kind === 'select'
							? field.options?.[0]
							: undefined;
				if (fallback === undefined) continue;
				expect(value, `${entry.name} prefills ${key} at its default`).not.toBe(
					fallback,
				);
			}
		}
	});

	it('declares no duplicate config field keys', () => {
		const keys = (component?.configFields ?? []).map((f) => f.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('does not redeclare a config key the layout editor owns', () => {
		for (const field of component?.configFields ?? []) {
			expect(EDITOR_OWNED_KEYS).not.toContain(field.key);
		}
	});

	it('exposes every formula field as a config field the editor renders', () => {
		// Otherwise the field accepts an expression the editor cannot edit.
		// A formula field may be a dotted path into a list field, where each
		// expression is edited inside that list's own editor rather than as a
		// setting of its own; there, the path's first segment has to be the
		// list field, which is what the editor renders.
		// Unless the path is rooted at a key the editor already owns. `reset.to`
		// is an expression on shared config, rendered beside label and position
		// by the editor itself — and the check above forbids the component from
		// declaring `reset`, so requiring it here would make the two rules
		// unsatisfiable together for every stateful component.
		const fields = component?.configFields ?? [];
		const editable = fields.filter((f) => f.kind === 'formula').map((f) => f.key);
		const declared = fields.map((f) => f.key);
		for (const field of component?.formulaFields ?? []) {
			if (field.includes('.')) {
				const root = field.split('.')[0] as string;
				if (EDITOR_OWNED_KEYS.some((key) => key === root)) continue;
				expect(declared).toContain(root);
			} else {
				expect(editable).toContain(field);
			}
		}
	});

	it('uses "*" only as a whole path segment in a formula field', () => {
		// A partial wildcard would look like it matched and never would.
		for (const field of component?.formulaFields ?? []) {
			for (const segment of field.split('.')) {
				if (segment.includes('*')) expect(segment).toBe('*');
			}
		}
	});
});
