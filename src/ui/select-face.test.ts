// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import '../test/obsidian-stub';
import { drawSelectFace } from './select-face';
import { faceOf } from '../test/select-face';

const LONG = 'Saves and Perception · Perception · Rank';

/** A select inside a field, as every family draws one, holding a long option. */
function staged(): { field: HTMLElement; select: HTMLSelectElement } {
	const field = document.createElement('label');
	document.body.appendChild(field);
	field.createSpan({ text: 'Value' });
	const select = field.createEl('select');
	select.setAttribute('aria-label', 'Value');
	select.createEl('option', { value: '', text: '' });
	select.createEl('option', { value: 'short', text: 'Armour class' });
	select.createEl('option', { value: 'long', text: LONG });
	return { field, select };
}


describe('drawSelectFace', () => {
	it('draws the chosen option text at the call', () => {
		const { select } = staged();
		select.value = 'long';
		drawSelectFace(select);
		expect(faceOf(select)?.textContent).toBe(LONG);
	});

	it('follows a change, a microtask later', async () => {
		const { select } = staged();
		select.value = 'short';
		drawSelectFace(select);
		select.value = 'long';
		select.dispatchEvent(new Event('change'));
		await Promise.resolve();
		expect(faceOf(select)?.textContent).toBe(LONG);
	});

	it('follows a value set in code once refreshed', () => {
		const { select } = staged();
		select.value = 'short';
		const refresh = drawSelectFace(select);
		select.value = 'long';
		refresh();
		expect(faceOf(select)?.textContent).toBe(LONG);
	});

	it.each([
		['before', true],
		['after', false],
	])('reads a value the caller put back in a handler attached %s the face', async (_, first) => {
		// Order-independent: the face reads once every listener has run.
		const { select } = staged();
		select.value = 'short';
		const putBack = () => {
			select.value = 'short';
		};
		if (first) select.addEventListener('change', putBack);
		drawSelectFace(select);
		if (!first) select.addEventListener('change', putBack);
		select.value = 'long';
		select.dispatchEvent(new Event('change'));
		await Promise.resolve();
		expect(faceOf(select)?.textContent).toBe('Armour class');
	});

	it('is empty for an empty choice', () => {
		const { select } = staged();
		select.value = '';
		drawSelectFace(select);
		expect(faceOf(select)?.textContent).toBe('');
	});

	it('wraps the select in place, in its position in the parent', () => {
		const { field, select } = staged();
		const after = field.createSpan({ text: 'after' });
		drawSelectFace(select);
		const stack = select.parentElement as HTMLElement;
		expect(stack.classList.contains('sheetsmith-select-stack')).toBe(true);
		expect(stack.parentElement).toBe(field);
		expect(stack.nextElementSibling).toBe(after);
		expect(Array.from(stack.children)).toEqual([select, faceOf(select)]);
		expect(select.classList.contains('sheetsmith-select-faced')).toBe(true);
	});

	it('hides the face from assistive tech and leaves the select its name', () => {
		const { select } = staged();
		select.value = 'long';
		drawSelectFace(select);
		expect(faceOf(select)?.getAttribute('aria-hidden')).toBe('true');
		expect(select.getAttribute('aria-label')).toBe('Value');
		expect(select.hasAttribute('title')).toBe(false);
	});

	it('never wraps twice', () => {
		const { field, select } = staged();
		drawSelectFace(select);
		select.value = 'long';
		const refresh = drawSelectFace(select);
		expect(field.querySelectorAll('.sheetsmith-select-stack')).toHaveLength(1);
		expect(field.querySelectorAll('.sheetsmith-select-face')).toHaveLength(1);
		select.value = 'short';
		refresh();
		expect(faceOf(select)?.textContent).toBe('Armour class');
	});
});
