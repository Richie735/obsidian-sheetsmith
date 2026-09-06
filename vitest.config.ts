import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			// The settings UI imports from 'obsidian', which only exists inside
			// the app. Aliasing it to a stub is what makes the layout editor —
			// where every layout is actually authored — testable at all.
			obsidian: fileURLToPath(new URL('./src/test/obsidian-stub.ts', import.meta.url)),
		},
	},
	test: {
		// The same stub again, loaded for its side effect rather than its exports:
		// it installs the helpers Obsidian adds to the DOM prototypes, and the app
		// has those in place before any plugin code runs. Without this a module may
		// only call one where some file in its import graph happened to import
		// `obsidian`, which is a rule nothing states and nothing checks. The
		// harness gets them the same way, and the install is guarded on there
		// being a DOM, so a node-environment test loads this and installs nothing.
		setupFiles: [
			fileURLToPath(new URL('./src/test/obsidian-stub.ts', import.meta.url)),
		],
	},
});
