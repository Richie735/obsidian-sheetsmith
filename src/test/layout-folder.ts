import type { App } from 'obsidian';
import { listLayouts } from '../layouts';

/*
 * What the layout folder holds, by path.
 *
 * **The load-bearing assertion of every data-safety arm in this plugin**, which
 * is why it is here rather than written out per test file: a refused write has
 * to leave the vault as it was, and "the new file is absent" is only half of
 * that claim. The other half is that nothing which was already there moved.
 *
 * Shared on `docs/PATTERNS.md` §1's one-step tier and §2's own sentence about
 * this folder: two copies of it came with two copies of the limits below, and
 * the only thing a guard test over those could assert is that they still say the
 * same thing. It also means that when the double gains the member the first
 * limit waits on, the retirement has one place to visit.
 *
 * **Two limits, both stated because neither is visible at a call site.**
 *
 * - It is scoped to one folder rather than the vault, because
 *   `src/test/obsidian-stub.ts` has no double for `Vault.getFiles()` and
 *   `docs/features/layout-import-export.md` reserves adding one for the deferred
 *   file-chosen import. So it counts everywhere this feature can write, and not
 *   everywhere a future one could.
 * - It lists direct children only, so a name carrying a separator — a write to
 *   `<folder>/sub/x.json` — is invisible to it. That is the arm the double
 *   cannot refuse at all, and it is a `docs/BACKLOG.md` row rather than an
 *   assertion.
 *
 * And one thing it cannot answer: where the folder's own path is held by a
 * *file*, `listLayouts` has no folder to list and answers `[]` — which is the
 * same answer as a vault that had lost everything. A case on that arm asserts
 * the existing file's bytes instead, and says so at the case.
 */
export function layoutPaths(app: App, folder: string): string[] {
	return listLayouts(app, folder)
		.map((file) => file.path)
		.sort();
}
