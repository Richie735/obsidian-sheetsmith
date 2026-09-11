import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

/**
 * Why a component may not reach the registry.
 *
 * Worse than importing a sibling directly: `getComponent` hands back every
 * component at once, and it makes index.ts import a module that imports it
 * back.
 */
const REGISTRY_MESSAGE =
	'A component must not import the component registry. It is how every other component becomes reachable, and it makes index.ts import a file that imports it back. Nothing outside a component needs to know that component exists.';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		// Build scripts, treated like esbuild.config.mjs above.
		'styles.build.mjs',
		'styles.build.d.mts',
		'vitest.config.ts',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'harness/dist',
		'harness/shots',
		// Node scripts, not plugin source: outside tsconfig's project, which is
		// what the type-aware parser needs, and never bundled into main.js.
		'harness/*.mjs',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Hard constraint (CLAUDE.md): the formula engine must never evaluate
		// an expression as code. Layouts are shareable files, so evaluating one
		// is a code-injection vector, and Obsidian's plugin review rejects it.
		// Formulas go through the parser in src/formula/, always.
		rules: {
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
		},
	},
	{
		// Hard constraint (CLAUDE.md): parsing and formula evaluation stay free
		// of the Obsidian API so they run under vitest without launching the
		// app, and so a parser bug is reproducible in a unit test. Anything
		// needing the vault belongs in a view or service.
		files: ['src/parse/**/*.ts', 'src/formula/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'obsidian',
							message:
								'src/parse and src/formula must stay pure so they are testable without Obsidian. Move vault access into a view or service.',
						},
					],
				},
			],
		},
	},
	{
		// **The harness is down to one exemption, and it is the one that is about
		// the harness rather than about the code in it.**
		//
		// `prefer-create-el` is gone because the nine sites it was covering moved
		// onto the *global* `createEl` and `createDiv`, which return an element
		// with no parent — see `src/create-element-sites.test.ts`'s header for
		// why that was available all along and looked as though it was not.
		//
		// `no-unsupported-api` is gone because `settings-panel.ts` now says what
		// it is doing: `requireApiVersion('1.13.0')` around the `update()` call,
		// which is the guard the rule looks for. The old exemption argued the
		// rule was asking a not-shipped file about a constraint it did not live
		// under. True, and it was still the wrong answer — the file was reaching
		// past the declared floor silently, and a reader had to find a comment in
		// this config to learn that it was deliberate.
		//
		// What is left is `no-nodejs-modules`, which is genuinely about the
		// harness being a Node-run instrument and never bundled into main.js.
		files: ['harness/**/*.ts'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
	{
		// Hard constraint (docs/PATTERNS.md §1): nothing outside a component
		// may know that component exists, so a component must never import a
		// sibling. Shared behaviour is extracted to a module named for what it
		// does — the painters and gesture modules on the allowlist below —
		// never reached for through another component.
		//
		// Stated as an allowlist rather than a list of the component files, so
		// a component added tomorrow is restricted without anyone remembering
		// to come back here. A new *shared* module is the deliberate edit.
		files: ['src/components/**/*.ts'],
		ignores: [
			// The registry imports all five to register them. That is its job.
			'src/components/index.ts',
			// A test imports its own subject, and a shared-behaviour test
			// drives two components over the same cases on purpose (§1).
			'src/components/*.test.ts',
		],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
								/*
							 * What a component may take from the app, as an
							 * allowlist rather than a convention.
							 *
							 * `setIcon` is on it because the delete control draws
							 * Obsidian's trash icon and taking the app's icon beats
							 * copying it. Nothing else is, and the two reasons are
							 * in PATTERNS §2: nothing for vault access, and nothing
							 * that needs a DOM at import time.
							 *
							 * Checked rather than written down, because the cost of
							 * the first import was invisible until it was paid. The
							 * stub is the whole of `obsidian` under vitest and it
							 * installed DOM helpers on load, so three
							 * node-environment test files — the registry contract,
							 * the reset flow, the worked examples — failed on import
							 * the moment a component reached it. Adding a name here
							 * is the decision; inheriting the precedent is not.
							 */
							group: ['obsidian'],
							allowImportNames: ['setIcon'],
							message:
								'A component may take only `setIcon` from obsidian. Anything needing the vault or an App belongs in a view or a service and reaches the component through RenderContext; anything else has to be argued here first, because the stub is what tests import and it needs a DOM (docs/PATTERNS.md §2).',
						},
						{
							// Both spellings of a sibling. `no-restricted-imports`
							// matches the import string literally, so restricting
							// './*' alone left '../components/pool' passing clean —
							// and that is the spelling that arrives by copy-paste
							// out of a test or out of src/editor/, where it is the
							// normal way to name this folder.
							group: [
								'./*',
								'../components/*',
								'!./column-types',
								'!./level-ring',
								'!./card-face',
								'!./linked-text',
								'!./modifier-breakdown',
								/*
								 * **Added deliberately, which is what this tier means.**
								 * `modifier-form.ts` is a shared component-layer surface
								 * and not a component: it is in no registry, declares no
								 * `ComponentDefinition`, imports nothing from `obsidian`
								 * and touches no file — it is the markup of the form a
								 * modifier glyph opens, beside `card-face.ts` and
								 * `linked-text.ts`. Table was its one consumer when it was
								 * added and Record set's `modifier` field is the second, with
								 * the form's options unchanged to admit it — so the entry is
								 * the record of an atomicity argument later vindicated by
								 * reuse, in that order. What forced the split was neither:
								 * `table.ts` was already 2450 lines and the form is a
								 * second job in it (PATTERNS §1).
								 */
								'!./modifier-form',
								/*
								 * **The reading a value pill shows once modifiers are
								 * applied**, shared by Card and Card set. In no registry,
								 * declaring no `ComponentDefinition`, importing nothing
								 * from `obsidian` and touching no file: it turns a stored
								 * value and an `effective` formula into a number or into
								 * nothing. On the list for *reuse* rather than atomicity,
								 * unlike `modifier-form` above — four policies had a copy
								 * in each component, and PATTERNS §1's one-step tier
								 * extracts a policy on the second consumer because a guard
								 * test over two copies could only assert they still agree.
								 */
								'!./effective-value',
								'!./stored-flag',
								/*
								 * **The filler a sample fills a config with**, shared by the
								 * six components that declare a `sample`
								 * (`docs/features/preview-sample-values.md` §2). The same
								 * tier as `column-types.ts` and `stored-flag.ts` directly
								 * above and below it: in no registry, declaring no
								 * `ComponentDefinition`, importing nothing from `obsidian`
								 * and touching no file — it holds a number sequence, a
								 * spelling and two rules about them, which is a policy, and
								 * PATTERNS §1's one-step tier extracts a policy rather than
								 * letting six components each keep their own idea of what a
								 * placeholder looks like.
								 */
								'!./sample-values',
								/*
								 * **What a typed value stored as text means, before any
								 * formula runs**, shared by Table and Record set. Added
								 * deliberately on `effective-value.ts`'s own terms: in no
								 * registry, declaring no `ComponentDefinition`, importing
								 * nothing from `obsidian` and touching no file. Three rules
								 * had a verbatim copy in each component — what a blank
								 * numeric field is worth, what a typed number is clamped to,
								 * and what an unresolved computed value reads as — and
								 * PATTERNS §1's one-step tier extracts a policy on the second
								 * consumer, because the only thing a guard test over two
								 * copies could assert is that they still agree. The drift is
								 * not hypothetical: the first rule decides what
								 * `sum(spells, Level)` and `sum(inventory, Weight)` are
								 * adding up.
								 */
								'!./typed-value',
								/*
								 * **What a component may accept as a picture, and why a
								 * body cannot be one**, shared by Image and Passport.
								 * Added deliberately, on `effective-value.ts`'s terms
								 * rather than `modifier-form.ts`'s: in no registry,
								 * declaring no `ComponentDefinition`, importing nothing
								 * from `obsidian` and touching no file. It is here for
								 * *reuse* at two consumers rather than three, because
								 * what is shared is a policy — a predicate and the two
								 * sentences it refuses with — and PATTERNS §1's one-step
								 * tier extracts one on the second consumer. The drift is
								 * a *sentence*: a design pass softening the remote
								 * refusal in one copy leaves the other sending the reader
								 * somewhere else, which is the failure
								 * `isolation.test.ts` already scans refusal clauses for.
								 */
								'!./embed-rule',
								/*
								 * **The one sentence a fenced component says about a
								 * wikilink**, shared by Record set and Passport. Added on
								 * `embed-rule.ts`'s own terms and for the same tier: a
								 * *sentence* is a policy, so it extracts on the second
								 * consumer rather than the third, and `record-set.ts`'s own
								 * comment already states the rule — two copies of it is one
								 * design pass away from saying two things, which is what
								 * `isolation.test.ts` scans for by clause. The two words that
								 * differ arrive as arguments, so the module knows neither
								 * that a record nor that a passport exists.
								 */
								'!./fenced-link',
								/*
								 * **A picture in a box, the field that changes it, and every
								 * reason there is no picture**, shared by Image and Passport.
								 * The painter beside `embed-rule.ts` and the reason that one
								 * was not enough: extracting the predicate and leaving its
								 * application duplicated is §1's `roundSum` mistake, and 33
								 * byte-identical lines is what it looked like here. The
								 * two-consumer rung was also unavailable — `image.test.ts`
								 * drives five gesture cases the second copy had no equivalent
								 * for, which is `arm-to-confirm.ts`'s entry verbatim.
								 */
								'!./picture-frame',
								'!../components/column-types',
								'!../components/level-ring',
								'!../components/card-face',
								'!../components/linked-text',
								'!../components/modifier-breakdown',
								'!../components/modifier-form',
								'!../components/effective-value',
								'!../components/stored-flag',
								'!../components/sample-values',
								'!../components/typed-value',
								'!../components/embed-rule',
								'!../components/fenced-link',
								'!../components/picture-frame',
							],
							message:
								'A component must not import another component. Move the shared behaviour into a module named for what it does — a sibling painter, or src/interaction/ — and import that from both.',
						},
					],
					// The registry named by its directory rather than its file.
					// './index' and '../components/index' are caught by the
					// patterns above; '.' and '../components' resolve to the same
					// module and are not — and reaching the registry is the worst
					// version of this rule's failure, since `getComponent('pool')`
					// hands back every sibling at once.
					//
					// Under `paths`, which matches an import string exactly,
					// because as a *pattern* a bare '.' matches every relative
					// import in the file and silently cancels the negations that
					// keep the shared painters importable. That was measured, not
					// assumed: with '.' in the group above, './level-ring' and
					// './card-face' were both reported restricted.
					paths: [
						{
							name: '.',
							message: REGISTRY_MESSAGE,
						},
						{
							name: '../components',
							message: REGISTRY_MESSAGE,
						},
					],
				},
			],
		},
	},
	{
		// The one test that renders the settings tab, and it renders it twice on
		// purpose: through `update()`, which is Obsidian 1.13's path, and through
		// `display()`, which is the only path below it and dead code above.
		//
		// So both rules fire for the same reason and neither is about shipped
		// code. `no-unsupported-api` reads `update()` against `minAppVersion`
		// 1.9.0, which is the floor the fallback exists to serve;
		// `no-deprecated` reads the deliberate call to that fallback. A test that
		// covered only the path its own floor allows would leave the other
		// untested, which is the failure this file exists to prevent.
		files: ['src/settings.test.ts'],
		rules: {
			'obsidianmd/no-unsupported-api': 'off',
			'@typescript-eslint/no-deprecated': 'off',
		},
	},
	{
		// Test scaffolding. The obsidian stub exists precisely to implement
		// the helpers these rules ask code to use, so telling it to use them
		// is circular; tests build fixtures with the standard API for the
		// same reason components do.
		files: ['src/test/**/*.ts', 'src/**/*.test.ts'],
		rules: {
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/prefer-instanceof': 'off',
			// Tests run under vitest in Node and are never bundled into
			// main.js, so the mobile-compatibility rule is asking about a
			// constraint they do not live under. Reading a fixture — or
			// styles.css, to assert a cascade the DOM tests cannot see — is
			// exactly what a test is allowed to do.
			'obsidianmd/no-nodejs-modules': 'off',
			// Same circularity as above, one level further in: the stub *is* the
			// Obsidian API these rules police. `Vault.delete` exists because the
			// real one does and `FileManager.trashFile` is implemented in terms
			// of it, and installing `createFragment` is by definition a write to
			// global scope.
			'obsidianmd/prefer-file-manager-trash-file': 'off',
			'obsidianmd/no-global-this': 'off',
			// The same circularity a third time. `require-display` asks every
			// `PluginSettingTab` subclass below a 1.13 floor to implement
			// `display()`, and the subclasses here are fixtures: a case builds a
			// throwaway tab to hand the stub's renderer a definition. The rule is
			// right about the shipped tab, which does implement it, and has no
			// opinion worth having about a class that exists for one assertion.
			'obsidianmd/settings-tab/require-display': 'off',
		},
	},
);
