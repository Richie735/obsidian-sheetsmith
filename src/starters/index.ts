/*
 * The layouts this plugin ships, as data (`docs/features/starter-layouts.md`).
 *
 * A fresh install has an empty layout folder and nothing to pick, so three
 * example layouts travel *inside* `main.js`. The release artifacts are
 * `main.js`, `manifest.json` and `styles.css` (`AGENTS.md`), and every install
 * channel delivers exactly those three — so a layout shipped as a fourth file
 * would need the release workflow to produce it, every channel to carry it, and
 * the plugin to read its own folder through the adapter at runtime, which is
 * outside the vault. Embedding costs a few kilobytes and removes the category:
 * if the plugin loaded, the starters are there.
 *
 * **The sources are real layout files, not TS object literals**, inlined by
 * esbuild's built-in json loader under `bundle: true` (`resolveJsonModule` in
 * `tsconfig.json` is the whole build change). A literal typed as
 * `ComponentConfig[]` would be checked by the wrong checker: the compiler passes
 * shapes `parseLayout` refuses and refuses shapes it passes. A `.json` file goes
 * through the real gate, drops into a vault by hand for a look, and diffs as
 * what it is.
 *
 * **This module imports nothing from `obsidian`**, so the catalog is testable as
 * data; `picker.ts` beside it owns the surface and the write.
 */

import forged from './forged-in-the-dark.json';

export interface Starter {
	/**
	 * The layout's own `name`, which is also the filename it lands under.
	 *
	 * Spelled here as well as inside the source because the suggester and the
	 * notice need it before anything has parsed, and `index.test.ts` pins the
	 * two together: a file whose name disagrees with its catalog entry would be
	 * written under one name and report another the moment a character named it.
	 */
	name: string;
	/**
	 * The line under the name in the suggester. The name alone cannot say which
	 * one to pick, which is the whole reason a row has two lines.
	 */
	description: string;
	/**
	 * The bundled layout file. Typed as `unknown` on purpose: what a layout is,
	 * is `parseLayout`'s to say, and a structural type inferred from the JSON
	 * would be a second, weaker answer that install could accidentally trust.
	 */
	source: unknown;
}

/**
 * The starters in offer order, which is increasing size and density: the
 * compact one first.
 *
 * The order is the whole of what a reader gets to help them choose, so it runs
 * so that a reader who plays none of them can stop at the first row that is
 * more than they want; a reader who plays one finds it by name whatever the
 * order.
 *
 * **The count is not the line.** Each entry is a complete sheet for a real,
 * widely played system — this one 21 components on six columns with no
 * function library at all. Real systems rather than demonstrations because a
 * reader who plays one can hold the starter against the sheet they already
 * own, and that check is the whole value; a demonstration in invented
 * vocabulary can show how a formula works and never that a sheet is right. Two
 * such demonstrations shipped here first and were replaced for exactly that
 * reason.
 *
 * The bar for an entry is the spec's, not a count: a real system chosen by
 * play-share, an open rules license, a trademark-free generic name, and a
 * sheet replicated from a lived-in layout or built to a written specification.
 * A browsable library is refused outright — a different surface, and a
 * different bar for entries.
 */
export const STARTERS: readonly Starter[] = [
	{
		name: 'Starter Forged in the Dark',
		description:
			'A Forged in the Dark scoundrel on one screen: playbook, stress, trauma, action ratings and load.',
		source: forged,
	},
];
