/*
 * Assemble styles.css from src/styles/.
 *
 * Obsidian loads exactly one stylesheet from the plugin folder, so the split
 * has to be put back together at build time. The join is a plain
 * concatenation and deliberately not esbuild's CSS pipeline, which bundles
 * @import happily but strips every comment on the way through — and the
 * comments in these files are the argument for the rules, which is the part
 * a later reader most needs (docs/PATTERNS.md §9).
 *
 * ORDER IS THE CASCADE. Equal specificity is settled by what comes last, so
 * the sequence below is a design decision, not an alphabetical accident:
 * tokens first because everything is entitled to override them, then the
 * vocabulary both surfaces share, then the sheet, then the editor. The sheet
 * and the editor never target the same element — the class ownership is
 * disjoint by construction — so their order relative to each other is free;
 * their order relative to `shared` is not.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Cascade order. Read the note above before changing it. */
export const PARTS = ['tokens', 'shared', 'sheet', 'editor'];

const BANNER = `/*
 * GENERATED FILE — do not edit.
 *
 * Assembled from src/styles/ by styles.build.mjs, in the order named there.
 * Edit the part this rule belongs to and run \`npm run build\`.
 */
`;

function partPath(name) {
	return fileURLToPath(new URL(`src/styles/${name}.css`, import.meta.url));
}

/** The stylesheet as it should be on disk. */
export function renderStyles() {
	const parts = PARTS.map((name) => readFileSync(partPath(name), 'utf8').trim());
	return `${BANNER}\n${parts.join('\n\n')}\n`;
}

export function buildStyles() {
	const target = fileURLToPath(new URL('styles.css', import.meta.url));
	writeFileSync(target, renderStyles());
	return target;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	console.log(`styles.css written from ${PARTS.length} parts`);
	buildStyles();
}
