import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
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
);
