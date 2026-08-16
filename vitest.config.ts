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
});
