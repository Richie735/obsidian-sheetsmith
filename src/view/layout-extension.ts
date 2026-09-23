/*
 * Registering `.sheetsmith` as the layout editor's extension
 * (`docs/features/visible-layout-files.md`).
 *
 * The registration is what makes a layout file visible: Obsidian lists a file in
 * its explorer only where some view opens its extension, and a registered one is
 * opened by that view from anywhere the app opens a file — the explorer, the
 * Quick Switcher, a clicked link.
 *
 * A module rather than a line in `main.ts` because the line cannot stand alone:
 * the app **throws** where another plugin already holds the extension, and
 * `main.ts` is lifecycle only. What is here is the one call and what a refusal
 * means to a reader.
 */

import { App, Notice, Plugin } from 'obsidian';
import { LAYOUT_EXTENSION } from '../layouts';
import { VIEW_TYPE_LAYOUT_EDITOR } from './layout-editor-view';

/**
 * The one member of the app's view registry this module reads.
 *
 * `app.viewRegistry` is internal and untyped — `obsidian.d.ts` declares no such
 * member — so it is reached through this narrow shape and every step is
 * guarded: a release that renames or removes it makes the refusal's sentence
 * lose its parenthesis and nothing else.
 */
interface ViewRegistryReader {
	getTypeByExtension?: (extension: string) => unknown;
}

/** Which view type the app opens this extension in, where it will say. */
function ownerOf(app: App, extension: string): string | null {
	const registry = (app as unknown as { viewRegistry?: ViewRegistryReader })
		.viewRegistry;
	if (typeof registry?.getTypeByExtension !== 'function') return null;
	try {
		const type = registry.getTypeByExtension(extension);
		return typeof type === 'string' && type !== '' ? type : null;
	} catch {
		return null;
	}
}

/**
 * What a reader is told when another plugin holds the extension.
 *
 * Exported so the case that drives the refusal asserts these words rather than
 * a copy of them. It names the way in that still works, because the plugin
 * still works: the pane opens layouts by path, which needs no registration.
 */
export function extensionTakenMessage(owner: string | null): string {
	const by = owner === null ? '' : ` (view "${owner}")`;
	return `Another plugin already opens .${LAYOUT_EXTENSION} files${by}, so selecting a layout file will not open the layout editor. Run "Open layout editor" instead.`;
}

/**
 * Register the extension for the layout editor's view, and survive a refusal.
 *
 * **Inside a try/catch, and last in `onload`**, which are two guards for one
 * failure: the app's `registerExtensions` checks every extension and throws
 * before registering any where one is taken, so an uncaught throw here would
 * abort whatever `onload` had left to register. Last means there is nothing
 * left; the catch means an earlier placement could not stop the rest either.
 *
 * The plugin's own `registerExtensions` rather than the registry's, because it
 * also unregisters on unload — which is what lets a hot reload register again.
 */
export function registerLayoutExtension(plugin: Plugin): void {
	try {
		plugin.registerExtensions([LAYOUT_EXTENSION], VIEW_TYPE_LAYOUT_EDITOR);
	} catch {
		new Notice(
			extensionTakenMessage(ownerOf(plugin.app, LAYOUT_EXTENSION)),
		);
	}
}
