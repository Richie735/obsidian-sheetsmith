/*
 * The lifecycle of markdown a component asked the app to draw, one render pass
 * at a time.
 *
 * `MarkdownRenderer.render` wants a `Component` for the lifecycle of what it
 * renders — an embed registers listeners, a transclusion loads a file, a plugin
 * post-processor may do anything — and **the view owns it, not the component**.
 * A component is handed a callback on its `RenderContext` and knows none of
 * this, which is what keeps `src/components/` importing nothing from `obsidian`
 * (PATTERNS §2). The view is an `ItemView` and therefore already a `Component`,
 * so it has a parent to hang a child on; the component contract gains nothing.
 *
 * Two things this owns, and both are traps rather than bookkeeping, which is why
 * it is a module with a test of its own rather than three lines in the view
 * (`cell-focus.ts` is the precedent, and the same argument):
 *
 * 1. **One child per pass, and the previous one is unloaded.** A sheet rebuilds
 *    on every committed edit anywhere on it, so a view that kept adding children
 *    would accumulate every embed's listeners across every rebuild for as long
 *    as the note stayed open.
 * 2. **A render that lands after its pass ended writes nothing.** The renderer
 *    is asynchronous and a rebuild replaces the DOM, so the element a call was
 *    given may be detached by the time the call resolves. The app's own
 *    `Component` would already have been unloaded; what it does not do is stop
 *    the awaited call from appending into an orphan, and markup arriving in a
 *    box nothing can see is the quiet half of the same bug.
 * 3. **A render that rejected is reported to the component that asked for it.**
 *    The component drew an empty box and returned, so a swallowed rejection is a
 *    blank block on the sheet with the prose still in the note. It hears about it
 *    through the `onFailure` it supplied, and draws what it can from the text
 *    alone — the same thing it draws where there is no renderer at all.
 *
 * The generation counter is the view's own idiom — `renderSheet` already bails a
 * run that comes back stale — read one level down: here the run is a pass and
 * what it guards is an append rather than a repaint.
 */

import { App, Component, MarkdownRenderer } from 'obsidian';

/** What a pass hands a component, matching `RenderContext.renderMarkdown`. */
export type RenderMarkdown = (
	markdown: string,
	into: HTMLElement,
	onFailure: () => void,
) => void;

export class MarkdownPasses {
	/** Which pass is current. Incremented by `begin`, captured per call. */
	private generation = 0;
	/**
	 * The child the current pass's renders belong to, or null before the first
	 * pass. Held so the next `begin` can unload it.
	 */
	private child: Component | null = null;

	/**
	 * `owner` is the component whose lifetime bounds every pass — the view — so
	 * closing the leaf unloads whatever the last pass left loaded, without this
	 * needing an `onClose` of its own.
	 */
	constructor(
		private owner: Component,
		private app: App,
	) {}

	/**
	 * Start a pass, and hand back what a component's context should carry.
	 *
	 * Called once per render of the sheet, before anything is drawn. The previous
	 * pass's child is unloaded here rather than at the end of that pass, because a
	 * pass has no end a caller could name: the renders it started are still
	 * arriving when `renderSheet` returns.
	 */
	begin(sourcePath: string): RenderMarkdown {
		this.end();
		const run = ++this.generation;
		const child = this.owner.addChild(new Component());
		this.child = child;
		return (markdown, into, onFailure) => {
			/*
			 * Whether the render rejected, which is the one thing the component has
			 * to be told: it returned long before this resolved, and the box it drew
			 * is *empty* — the branch that calls this is exclusive, so no fallback
			 * was painted. An earlier version swallowed the rejection on the grounds
			 * that "the box is already on screen holding what the component drew
			 * into it", which was simply false about this code, and what it produced
			 * was a blank box under a filled-in label with the prose still in the
			 * note and nothing said anywhere.
			 *
			 * Reported back to the component rather than written into the box here.
			 * A post-processor from a theme or another plugin throwing is not
			 * something the reader caused or can fix, so there is no fix for a
			 * message to name (PATTERNS §4) — and the component already knows what
			 * to draw when the app cannot help, because that is the case it handles
			 * with no renderer at all.
			 */
			let failed = false;
			void MarkdownRenderer.render(this.app, markdown, into, sourcePath, child)
				.catch(() => {
					failed = true;
				})
				.then(() => {
					// The pass this call belongs to is over, so its element is
					// detached and whatever the renderer appended belongs to nothing.
					// Cleared rather than left, because a detached subtree the app's
					// post-processors are still holding is a leak with no owner — and
					// nothing is reported either, since a component cannot usefully
					// draw a fallback into an element that is no longer on screen.
					if (run !== this.generation) {
						into.replaceChildren();
						return;
					}
					if (failed) onFailure();
				});
		};
	}

	/**
	 * End the current pass without starting another, for a view whose file
	 * changed: the outgoing note's embeds go with it.
	 */
	end(): void {
		this.generation++;
		if (this.child === null) return;
		this.owner.removeChild(this.child);
		this.child = null;
	}
}
