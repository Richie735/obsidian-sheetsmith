/*
 * A real `SheetView` opened on a character note, for the tests that drive a
 * press all the way to the note's text.
 *
 * Extracted when a second view test needed it
 * (`view/retained-section-adoption.test.ts`, then `view/track-over-run.test.ts`),
 * on `docs/PATTERNS.md` §1's one-step tier: what is shared is a timing — how
 * long a Track step waits before it writes — and two copies of a timing are
 * two numbers nothing keeps in step. The wait is derived from `GESTURE_COMMIT`
 * rather than written as a number, because a "writes nothing" case waiting less
 * than the commit window passes whether or not anything would have been written.
 *
 * `src/test/` rather than beside either test, because §2 names this folder for
 * scaffolding and neither view test owns the sheet it opens.
 */
import { GESTURE_COMMIT } from '../interaction/commit-window';
import { SheetView } from '../view/sheet-view';
import { App, TextFileView } from './obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from './plugin';
import { openView } from './workspace';

/** One turn of the loop, which a render started and not awaited needs. */
export const settle = (): Promise<unknown> =>
	new Promise((resolve) => window.setTimeout(resolve, 0));

/**
 * Longer than `GESTURE_COMMIT`, which a Track step waits out before writing.
 * The margin is what a timer scheduled a moment after the press still needs.
 */
export const gestureCommit = (): Promise<unknown> =>
	new Promise((resolve) => window.setTimeout(resolve, GESTURE_COMMIT + 200));

/** A note on layout `L` holding each `## label` section with its body, in order. */
export function note(...sections: readonly [label: string, body: string][]): string {
	return [
		'---',
		'sheet-layout: L',
		'---',
		'',
		...sections.map(([label, body]) => `## ${label}\n${body}`),
	].join('\n');
}

/**
 * Open a sheet on `text`, whose layout holds the components given, one above
 * the next. `layout` carries anything else the layout declares.
 */
export async function sheetOn(
	components: Record<string, unknown> | readonly Record<string, unknown>[],
	text: string,
	layout: Record<string, unknown> = {},
): Promise<{ view: SheetView; cell: HTMLElement }> {
	const list: readonly Record<string, unknown>[] = Array.isArray(components)
		? (components as readonly Record<string, unknown>[])
		: [components as Record<string, unknown>];
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	await app.vault.create(
		`${LAYOUT_FOLDER}/L.json`,
		JSON.stringify({
			name: 'L',
			components: list.map((component, index) => ({
				position: { col: 1, row: 1 + index * 3, width: 6, height: 3 },
				...component,
			})),
			...layout,
		}),
	);
	const file = await app.vault.create('Character.md', text);
	const view = await openView(app, document.body, SheetView, fakePlugin(app));
	await (view as unknown as TextFileView).onLoadFile(file);
	await settle();
	return { view, cell: view.containerEl };
}
