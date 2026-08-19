/*
 * Builds the component harness. Separate from esbuild.config.mjs on purpose:
 * nothing here may end up in main.js.
 */
import { buildStyles } from '../styles.build.mjs';
import esbuild from 'esbuild';
import process from 'process';
import { fileURLToPath } from 'node:url';

const watch = process.argv.includes('--watch');
const root = fileURLToPath(new URL('.', import.meta.url));

// The harness links ../styles.css directly, so assemble it first.
buildStyles();

const context = await esbuild.context({
	entryPoints: [`${root}harness.ts`],
	// The settings tab and the layout editor import from 'obsidian', which only
	// exists inside the app. Aliasing it to the same stub vitest uses is what
	// lets the harness render the surface where layouts are actually authored.
	alias: {
		obsidian: `${root}../src/test/obsidian-stub.ts`,
	},
	bundle: true,
	format: 'iife',
	target: 'es2021',
	platform: 'browser',
	sourcemap: 'inline',
	outfile: `${root}dist/harness.js`,
	logLevel: 'info',
});

if (watch) {
	await context.watch();
	console.log('\nharness watching. Open harness/index.html in a browser.\n');
} else {
	await context.rebuild();
	await context.dispose();
	console.log(`\nharness built. Open: ${root}index.html\n`);
}
