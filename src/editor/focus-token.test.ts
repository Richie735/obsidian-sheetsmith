// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import '../test/obsidian-stub';
import { focusToken, tokenTarget } from './focus-token';

/*
 * `focus-token.ts`'s inert rule, held at `focusToken` itself: every focus
 * restore the pane had before the narrow regime goes through it — the editor's
 * `pendingFocus` after a redraw, which `focusAfterRedraw` fills, and the
 * canvas's own restore across a redraw — so the rule is pinned where those
 * callers meet it rather than at the one that added it
 * (`docs/features/layout-editor-narrow-regime.md` §4).
 *
 * A token matched twice is the case it decides: a match inside an `inert`
 * subtree, such as an inactive tab's panel, cannot take focus, so stopping at
 * it would focus nothing.
 */

function scope(): HTMLElement {
	const root = createDiv();
	document.body.appendChild(root);
	return root;
}

describe('a focus token', () => {
	it('passes over an inert match to a live one, at a restore that predates the rule', () => {
		const root = scope();
		const shut = root.createDiv();
		shut.setAttribute('inert', '');
		const hidden = shut.createEl('button', { text: 'Hidden' });
		hidden.dataset.sheetsmithFocus = 'edit-armour';
		const live = root.createEl('button', { text: 'Live' });
		live.dataset.sheetsmithFocus = 'edit-armour';

		focusToken(root, 'edit-armour');
		expect(document.activeElement).toBe(live);
		root.remove();
	});

	it('names nothing where the only match is inert, so a caller can fall back', () => {
		const root = scope();
		const shut = root.createDiv();
		shut.setAttribute('inert', '');
		shut.createEl('button').dataset.sheetsmithFocus = 'preview-armour';

		expect(tokenTarget(root, 'preview-armour')).toBeNull();
		expect(tokenTarget(root, 'nothing')).toBeNull();
		root.remove();
	});
});
