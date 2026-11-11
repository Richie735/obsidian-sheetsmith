/*
 * A stand-in for Obsidian's markdown renderer, installed in the harness bundle
 * where the app's own `MarkdownRenderer.render` would be.
 *
 * **At the renderer's boundary, and nowhere else**, so both surfaces the harness
 * draws — the sheet and the layout editor's canvas, with the picker's preview —
 * go through the plugin's real `view/markdown-pass.ts`: its pass per draw, its
 * staleness guard and its `markRenderedResolution` all run, and only the drawing
 * of markup is faked (`docs/features/canvas-renders-markdown.md`, "The harness").
 * Vitest keeps the stub's own render, one `<p>` of source, which its tests rely
 * on; this replaces it for the harness alone.
 *
 * **It is not Obsidian's renderer, and draws only what the samples hold**: a
 * paragraph per blank-line block, a block of `- ` lines as a list, `***…***`,
 * `**…**` and `*…*` as their emphasis, and `[[target]]` or `[[target|alias]]` as
 * the `a.internal-link` the app draws, with `data-href` and `href`, so the
 * pass's resolution marking and the stylesheet see the app's markup. Nothing
 * else of markdown: how a heading, an embed or a callout sits inside a box is
 * reviewed in Obsidian only. `UI.md` §11 warns against a stand-in kinder than
 * the thing, and this one is plainer: what it does not know it draws as source.
 *
 * Asynchronous like the app's, a microtask late, so a render that lands after
 * its pass ended is the pass's to clear, as in the app.
 */

import { App, Component, MarkdownRenderer } from '../src/test/obsidian-stub';

/** One run of a line: emphasis or a wikilink, in the order they appear. */
const INLINE = /(\[\[[^\]]+\]\]|\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*]+\*)/g;

function inline(text: string, into: HTMLElement): void {
	let last = 0;
	for (const match of text.matchAll(INLINE)) {
		const at = match.index ?? 0;
		if (at > last) into.appendText(text.slice(last, at));
		const token = match[0];
		if (token.startsWith('[[')) {
			const inner = token.slice(2, -2);
			const bar = inner.indexOf('|');
			const target = bar === -1 ? inner : inner.slice(0, bar);
			const alias = bar === -1 ? null : inner.slice(bar + 1);
			// The app's own markup for a wikilink in rendered markdown, which puts
			// an aliased link's target in `aria-label` (`docs/UI.md` §6).
			into.createEl('a', {
				cls: 'internal-link',
				text: alias ?? target,
				attr: {
					href: target,
					'data-href': target,
					...(alias === null ? {} : { 'aria-label': target }),
				},
			});
		} else if (token.startsWith('***')) {
			into.createEl('strong').createEl('em', { text: token.slice(3, -3) });
		} else if (token.startsWith('**')) {
			into.createEl('strong', { text: token.slice(2, -2) });
		} else {
			into.createEl('em', { text: token.slice(1, -1) });
		}
		last = at + token.length;
	}
	if (last < text.length) into.appendText(text.slice(last));
}

async function standInRender(
	_app: App,
	markdown: string,
	el: HTMLElement,
	_sourcePath: string,
	_component: Component,
): Promise<void> {
	await Promise.resolve();
	for (const block of markdown.split(/\n\s*\n/)) {
		if (block.trim() === '') continue;
		const lines = block.split('\n');
		if (lines.every((line) => /^\s*[-*+] /.test(line))) {
			const list = el.createEl('ul');
			for (const line of lines) inline(line.replace(/^\s*[-*+] /, ''), list.createEl('li'));
			continue;
		}
		inline(block, el.createEl('p'));
	}
}

/** Put the stand-in where the app's renderer would be, for this page's life. */
export function installStandInRenderer(): void {
	MarkdownRenderer.render = standInRender;
}
