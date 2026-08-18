import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
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
		// Components build DOM with the standard API rather than Obsidian's
		// createEl helpers so they stay testable under happy-dom in vitest.
		// The two are equivalent at runtime.
		files: ['src/components/**/*.ts'],
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
