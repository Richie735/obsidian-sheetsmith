/*
 * Opening a workspace view outside the app.
 *
 * Scaffolding, not a test case (`docs/PATTERNS.md` §2): the stub beside this
 * file carries the `Component`, `View` and `WorkspaceLeaf` a pane needs to
 * exist, and this is the four lines that put one on screen the way the app
 * does.
 *
 * It exists as a module rather than as a helper in a test file because of the
 * casts. As far as the compiler is concerned a plugin's view extends Obsidian's
 * own `ItemView`, and the stub is a *double* for that rather than an
 * implementation of it — so every call site would otherwise carry the same two
 * `as unknown` and the same paragraph explaining them. One place to explain it
 * is also one place to fix it if the stub ever grows closer to the real thing.
 */

import { App, View, WorkspaceLeaf } from './obsidian-stub';

/**
 * Open a view the way the app opens one: a leaf out of the workspace, the view
 * constructed into it, and `leaf.open` to attach, load and render.
 *
 * The leaf goes into `parent` before the view opens, so anything the first
 * render measures measures an element that is actually laid out — and, where
 * `parent` is the document body, so a modal opened from inside the view can be
 * found beside it rather than in a detached tree. The harness passes its own
 * stage instead, which is the reason this is a parameter rather than the body
 * every time.
 *
 * `never` for the leaf parameter is what lets a caller pass its own view class
 * without a cast: a constructor taking Obsidian's `WorkspaceLeaf` is assignable
 * to one taking `never`, which is the whole of the contravariance being leant
 * on here.
 */
export async function openView<T extends object, A extends unknown[]>(
	app: App,
	parent: HTMLElement,
	view: new (leaf: never, ...args: A) => T,
	...args: A
): Promise<T> {
	const leaf: WorkspaceLeaf = app.workspace.getLeaf(true);
	const opened = new view(leaf as never, ...args);
	parent.replaceChildren(leaf.containerEl);
	await leaf.open(opened as unknown as View);
	// A view's first render starts in `onOpen` and is not awaited there — it
	// reads the vault — so nothing it draws exists when `open` resolves. One turn
	// of the loop is what every caller would otherwise have to remember.
	await new Promise((resolve) => window.setTimeout(resolve, 0));
	return opened;
}
