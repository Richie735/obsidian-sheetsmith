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
		// Everything that paints a surface builds DOM with the standard API
		// rather than Obsidian's createEl helpers, so it stays testable under
		// happy-dom in vitest. The two are equivalent at runtime.
		//
		// Scoped by the reason rather than by one folder: popover.ts carried
		// this exemption while it lived in components/ and lost it by moving
		// to ui/, though nothing about why it needs it changed.
		//
		// This says nothing about whether a component may import from `obsidian`
		// at all — one does, for `setIcon` — and that is a separate rule with its
		// own allowlist further down, and its reasons in PATTERNS §2.
		files: [
			'src/components/**/*.ts',
			'src/ui/**/*.ts',
			'src/interaction/**/*.ts',
			// The grid's DOM shape, shared with the harness so the two cannot
			// nest differently — and the harness has no app, so Obsidian's
			// element helpers do not exist there. One file rather than
			// `src/view/**`: the sheet view itself has an app and should keep
			// using them.
			'src/view/grid-cells.ts',
		],
		rules: {
			'obsidianmd/prefer-create-el': 'off',
		},
	},
	{
		// The harness renders components outside Obsidian, so the helpers this
		// rule points at do not exist there: `createDiv` is installed on the
		// element prototype by the app, and the harness has no app. It is also
		// never bundled into main.js, so the Obsidian-facing rules are asking
		// about constraints it does not live under.
		files: ['harness/**/*.ts'],
		rules: {
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
			// The harness renders the settings tab by calling `display()`, which
			// is what the plugin's own tab implements. Until that migrates to
			// the declarative API, calling it is the only way to render it.
			'@typescript-eslint/no-deprecated': 'off',
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
								 * `linked-text.ts`. Table is its one consumer today, and
								 * the reason it is a module rather than a paragraph inside
								 * `table.ts` is that the file was already 2450 lines and
								 * the form is a second job in it (PATTERNS §1).
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
								'!../components/column-types',
								'!../components/level-ring',
								'!../components/card-face',
								'!../components/linked-text',
								'!../components/modifier-breakdown',
								'!../components/modifier-form',
								'!../components/effective-value',
								'!../components/stored-flag',
								'!../components/sample-values',
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
		// The one test that renders the settings tab, and so the layout editor,
		// the way the harness does. `display()` is what the plugin's own tab
		// implements, so calling it is the only way to render it until that
		// migrates to the declarative API — the same argument the harness block
		// above makes, and the rule is off for `settings.ts` itself further down.
		files: ['src/settings.test.ts'],
		rules: {
			'@typescript-eslint/no-deprecated': 'off',
		},
	},
	{
		// Obsidian 1.13's declarative settings API describes a tab's settings
		// as data so the app can index them for search. This tab no longer has
		// the excuse it used to — it is two preferences and a button since the
		// layout editor moved into a pane, which is the shape the API is for —
		// and two things still block it, both about being able to tell whether
		// the adoption worked:
		//
		// - whether a `control` write also persists is undocumented, and nothing
		//   here could catch it either way, because the obsidian stub renders
		//   `Setting` rows and not definitions;
		// - the folder preference substitutes the default on empty where
		//   `validate` only rejects.
		//
		// Named rather than restated: the argument and the **Waiting on** line
		// live at the top of `src/settings.ts`, and this comment is deliberately
		// the summary. This block held the stale half of that pair once already.
		//
		// Off here rather than inline: `eslint-comments/no-restricted-disable`
		// in the recommended config forbids disabling this rule at its site.
		files: ['src/settings.ts'],
		rules: {
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
		},
	},
	{
		// The layout editor's undo and redo commands (`docs/features/editor-undo.md`).
		// Both rules ask for exactly what the feature spec rules out on purpose.
		//
		// `no-plugin-id-in-command-id`: the two ids are named verbatim in the
		// spec's design section, its acceptance criteria and its commit
		// boundaries — `sheetsmith-layout-editor-undo` and
		// `sheetsmith-layout-editor-redo` — and `AGENTS.md` holds every command
		// id stable from the moment it ships, so renaming them to satisfy a
		// lint rule after the fact is exactly the renaming that rule exists to
		// prevent needing.
		//
		// `no-default-hotkeys`: Mod+Z and Mod+Shift+Z are an acceptance
		// criterion of their own, on the argument that undo and redo are the
		// one pair of commands where *not* shipping the convention every other
		// editor uses would be the surprise.
		//
		// Off here rather than inline: `eslint-comments/no-restricted-disable`
		// in the recommended config forbids disabling either rule at its site.
		files: ['src/commands.ts'],
		rules: {
			'obsidianmd/commands/no-plugin-id-in-command-id': 'off',
			'obsidianmd/commands/no-default-hotkeys': 'off',
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
		},
	},
);
