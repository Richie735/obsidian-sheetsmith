/*
 * The measurement `docs/features/stat-block-in-play-polish.md`'s first
 * criterion makes: **the Stat block's picker and Revert are one height**, as a
 * script a reviewer can run again. Not shipped, and not a test, because it
 * needs a browser's layout, which happy-dom does not have. Run `npm run harness`
 * first, then
 *
 *   node harness/measure-head-pair.mjs
 *
 * It loads the forms sheet with Brown Bear in play in the light theme, the dark
 * one, under `prefers-contrast: more`, under forced colors, and at a 380px
 * sheet, where the picker takes a line of its own under the title. For each it
 * prints the picker's and Revert's height and top, and whether either clips its
 * text, and fails (exit 1) where the two heights or tops differ by more than
 * half a pixel, either is missing, or either clips.
 *
 * The CSS that makes it so is held by `styles.test.ts` (one rule, one height,
 * one stretch); this is the check that the browser draws what that rule says,
 * in every mode that repaints the pair.
 */

import { fileURLToPath } from 'node:url';
import { launch, loadStaged } from './cdp.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

const measure = `(() => {
	const box = (selector) => {
		const el = document.querySelector(selector);
		if (el === null) return null;
		const r = el.getBoundingClientRect();
		return { top: r.top, height: r.height, clips: el.scrollWidth > el.clientWidth + 1 };
	};
	return { picker: box('.sheetsmith-stat-block-select'), revert: box('.sheetsmith-stat-block-revert') };
})()`;

/** Whether a media query matches in the loaded page, so a mode that did not take fails rather than passing as light. */
const matches = (query) => `matchMedia(${JSON.stringify(query)}).matches`;

const runs = [
	{ name: 'light', query: 'theme=light', width: 1400 },
	{ name: 'dark', query: 'theme=dark', width: 1400 },
	{
		name: 'contrast-more',
		query: 'theme=light',
		width: 1400,
		media: [{ name: 'prefers-contrast', value: 'more' }],
		staged: '(prefers-contrast: more)',
	},
	{ name: 'forced-colors', query: 'theme=light', width: 1400, flags: ['--force-high-contrast'], staged: '(forced-colors: active)' },
	{ name: 'head-narrow', query: 'theme=light&width=380', width: 380 },
];

let failed = 0;
for (const run of runs) {
	const browser = await launch(['--window-size=1400,1500', ...(run.flags ?? [])]);
	try {
		if (run.media !== undefined) await browser.send('Emulation.setEmulatedMedia', { features: run.media });
		await loadStaged(browser, `file://${root}index.html?surface=sheet&state=forms&${run.query}`, {
			width: run.width,
			height: 1500,
		});
		const { picker, revert } = await browser.evaluate(measure);
		const problems = [];
		if (run.staged !== undefined && !(await browser.evaluate(matches(run.staged)))) problems.push(`${run.staged} not staged`);
		if (picker === null) problems.push('no picker');
		if (revert === null) problems.push('no Revert');
		if (picker !== null && revert !== null) {
			if (Math.abs(picker.height - revert.height) > 0.5) problems.push('heights differ');
			if (Math.abs(picker.top - revert.top) > 0.5) problems.push('tops differ');
			if (picker.clips) problems.push('picker clips');
			if (revert.clips) problems.push('Revert clips');
		}
		const said = (one) => (one === null ? '—' : `${one.height.toFixed(1)}px at ${one.top.toFixed(1)}`);
		console.log(
			`${run.name.padEnd(14)} picker ${said(picker)}, Revert ${said(revert)}${problems.length === 0 ? '' : `  FAIL: ${problems.join(', ')}`}`,
		);
		if (problems.length > 0) failed++;
	} finally {
		await browser.close();
	}
}

console.log(`\n${runs.length - failed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
