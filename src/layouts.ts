import { App, normalizePath, TFile } from 'obsidian';
import { Layout, parseLayout, serialiseLayout } from './parse/layout';

/**
 * Load a layout by name from the configured layout folder.
 * Returns null when no such file exists; throws LayoutParseError when the
 * file exists but is invalid.
 */
export async function loadLayout(
	app: App,
	folder: string,
	name: string,
): Promise<Layout | null> {
	const path = normalizePath(`${folder}/${name}.json`);
	const file = app.vault.getFileByPath(path);
	if (!file) return null;
	return parseLayout(await app.vault.read(file));
}

/** All layout files in the folder, sorted by name. */
export function listLayouts(app: App, folder: string): TFile[] {
	const parent = app.vault.getFolderByPath(normalizePath(folder));
	if (!parent) return [];
	return parent.children
		.filter((child): child is TFile => child instanceof TFile && child.extension === 'json')
		.sort((a, b) => a.basename.localeCompare(b.basename));
}

/** Create an empty layout file, creating the folder when needed. */
export async function createLayout(
	app: App,
	folder: string,
	name: string,
): Promise<TFile> {
	const dir = normalizePath(folder);
	if (!app.vault.getFolderByPath(dir)) {
		await app.vault.createFolder(dir);
	}
	const path = normalizePath(`${dir}/${name}.json`);
	if (app.vault.getFileByPath(path)) {
		throw new Error(`A layout named "${name}" already exists.`);
	}
	return app.vault.create(
		path,
		serialiseLayout({ name, columns: 6, components: [] }),
	);
}
