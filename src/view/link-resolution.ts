/*
 * Which vault file a link names, asked against the path the link is written in,
 * and the predicate built on it: whether it names one at all.
 *
 * One spelling of the lookup for every caller: the sheet, whose `linkContext`
 * resolves against the character note and whose picture `resource` finds the
 * file it draws; and the layout editor's canvas and picker preview, whose
 * markdown pass resolves against the open layout file
 * (`docs/features/canvas-renders-markdown.md`, Question 1). Two copies of one
 * lookup could only be tested for still agreeing, which is PATTERNS §1's
 * one-step tier, so the application is shared and not just the predicate: a
 * link and a picture both drop a `#subpath` here, in one place.
 *
 * Not in `markdown-pass.ts`, whose job is the lifecycle of a render: the pass
 * takes a `resolves` and never asks the vault itself.
 */

import { App, getLinkpath, TFile } from 'obsidian';

/** Where a surface's links are resolved from, and the answer for one link. */
export interface LinkSource {
	/** The vault path the links are written in, or `''` where there is none. */
	readonly sourcePath: string;
	resolves(target: string): boolean;
}

/** The file `target` names, or null where the vault holds none. */
export function linkDestination(app: App, target: string, sourcePath: string): TFile | null {
	return app.metadataCache.getFirstLinkpathDest(getLinkpath(target), sourcePath);
}

export function resolvesLink(app: App, target: string, sourcePath: string): boolean {
	return linkDestination(app, target, sourcePath) !== null;
}
