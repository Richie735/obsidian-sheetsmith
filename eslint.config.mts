import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

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
		files: [
			'src/components/**/*.ts',
			'src/ui/**/*.ts',
			'src/interaction/**/*.ts',
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
							group: [
								'./*',
								'!./level-ring',
								'!./stat-card',
							],
							message:
								'A component must not import another component. Move the shared behaviour into a module named for what it does — a sibling painter, or src/interaction/ — and import that from both.',
						},
					],
				},
			],
		},
	},
	{
		// Obsidian 1.13's declarative settings API describes a tab's settings
		// as data so the app can index them for search. This tab is mostly the
		// interim layout editor (docs/SPEC.md §12), a form whose shape is
		// decided at runtime by the component the author selected, which is
		// not something static definitions can describe. The argument, and
		// when it gets adopted, is at the top of the file.
		//
		// Off here rather than inline: `eslint-comments/no-restricted-disable`
		// in the recommended config forbids disabling this rule at its site.
		files: ['src/settings.ts'],
		rules: {
			'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
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
