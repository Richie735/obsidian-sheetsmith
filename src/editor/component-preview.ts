/*
 * One component drawn as a picture of itself, for the component picker's
 * active line (`docs/features/component-picker.md` §5).
 *
 * **Drawn from data, through the parts of the canvas's path that decide how a
 * component looks**, never kept as an image. Shared, not copied: the read
 * (`sample-read.ts`), the formula context (`formulaContext`) and the grid
 * (`renderGrid`, which `grid-cells.test.ts` holds this module to). Written here
 * rather than shared, and different on purpose: the sheet is a one-component
 * layout this module composes, so it has no function library to parse — a
 * formula calling one would fail here where the canvas's layout declares it —
 * and a Tab set shows its first tab, since nobody has chosen another. And what
 * it leaves out is everything a canvas has for an author to press — the
 * overlays, the gestures, the selection — because a preview is not a component
 * anybody edits. Extracting the rest of `Canvas.draw`'s head was weighed and
 * not taken: what is left is four lines of setup, and the canvas's copy is
 * interleaved with the focus and tab posture this one does not have. The whole subtree is `inert` and `aria-hidden`: the option's own text
 * is what assistive tech reads, and a listbox option may hold no interactive
 * content, which this has none of.
 *
 * **Always sampled**, whatever the canvas's **Sample values** row says. That
 * row governs the canvas; a preview of an empty section is the drawing §1 of
 * the feature doc exists to avoid.
 *
 * **Which config is drawn** is this module's rule and nobody else's:
 *
 * - a palette entry draws its own config, which is exactly what inserting it
 *   produces;
 * - a bare type draws its `example` where it declares one, and the empty config
 *   an insert writes where it does not;
 * - a container draws two placeholder children the picker supplies, since what
 *   a container draws is its `children` and an example may not set them.
 *
 * The last two are *examples* — not what **Add** produces — and say so, which
 * is why `isExample` is exported beside the drawing.
 *
 * No test file of its own, and §10 does not license that: its entry-point
 * bullet says a module like this earns one. It is tested through the pane on
 * purpose, by activating picker lines, which is the gap `docs/BACKLOG.md`
 * § Patterns records in its "§10 does not name a module cut from the editor"
 * row, where this module is listed.
 */

import { buildSheet, ReadComponent } from '../formula/sheet';
import { formulaContext } from '../formula/resolve';
import { Layout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { getComponent, listComponentTypes } from '../components';
import { ComponentConfig, GridPosition, isContainer, placesChildren } from '../types';
import { renderGrid } from '../view/grid-cells';
import { PickerChoice } from './picker-catalog';
import { readSample } from './sample-read';

/**
 * The frame a preview is drawn in: four columns, the component spanning all of
 * them and three rows. Photographed for every type before it was chosen — at
 * insert size, two of twelve columns by one row, most types clip.
 */
const PREVIEW_COLUMNS = 4;
const PREVIEW_BOX: GridPosition = { col: 1, row: 1, width: PREVIEW_COLUMNS, height: 3 };

/** What the example tag reads, and the sentence its option is described by. */
export const EXAMPLE_TAG = 'Example';
export const EXAMPLE_SENTENCE = 'The preview is an example. It is added empty.';

/**
 * The leaf a container's placeholders are drawn as: the first registered type
 * that holds a value and says what a section of itself holds.
 *
 * Asked of the registry rather than named, so the picker names no type. That
 * is Card today. Composing a container's preview with children is the editor's
 * to do because `children` is the editor's key — it writes it on every insert
 * into a container — where a container declaring its own would have to name
 * another component, which is the isolation rule broken.
 */
function placeholderType(): string | undefined {
	return listComponentTypes().find((type) => {
		const component = getComponent(type);
		return component !== undefined && !isContainer(component) && component.sample !== undefined;
	});
}

/** Whether this line's preview is an example rather than what **Add** writes. */
export function isExample(choice: PickerChoice): boolean {
	if (choice.entry) return false;
	const component = getComponent(choice.type);
	return component?.example !== undefined || isContainer(component);
}

/** The one component a preview draws, with the editor's keys filled in. */
function previewConfig(choice: PickerChoice): ComponentConfig {
	const component = getComponent(choice.type);
	const config: ComponentConfig = {
		...(choice.entry ? choice.config : (component?.example ?? {})),
		id: 'preview',
		type: choice.type,
		label: choice.name,
		position: { ...PREVIEW_BOX },
	};
	if (!isContainer(component)) return config;
	const leaf = placeholderType();
	if (leaf === undefined) return config;
	const placed = placesChildren(component);
	config.children = [1, 2].map((index) => ({
		id: `preview_${index}`,
		type: leaf,
		label: `Component ${index}`,
		// Side by side where the container places its children, two columns by
		// two rows each. Where it shows one at a time, each fills the box, which
		// is what the editor writes for a child of one.
		position: placed
			? { col: 1 + (index - 1) * 2, row: 1, width: 2, height: 2 }
			: { ...PREVIEW_BOX },
	}));
	return config;
}

/**
 * Draw one line's preview into `into`, replacing whatever it held.
 *
 * `into` is made `inert` and `aria-hidden` here rather than by the caller, so
 * no caller can draw a preview that a keyboard or a screen reader reaches.
 */
export function renderComponentPreview(into: HTMLElement, choice: PickerChoice): void {
	into.replaceChildren();
	into.toggleAttribute('inert', true);
	into.setAttribute('aria-hidden', 'true');
	if (isExample(choice)) {
		into.createSpan({ cls: 'sheetsmith-picker-example', text: EXAMPLE_TAG });
	}

	const layout: Layout = {
		name: 'Preview',
		columns: PREVIEW_COLUMNS,
		components: [previewConfig(choice)],
	};
	const walk = walkComponents(layout.components);
	const prepared: ReadComponent[] = walk.map(({ config }) => readSample(config, true));
	const { env } = buildSheet(layout, prepared);

	const view = into.createDiv('sheetsmith-view sheetsmith-picker-preview-sheet');
	const grid = view.createDiv('sheetsmith-grid');
	grid.style.setProperty('--sheetsmith-columns', String(PREVIEW_COLUMNS));
	renderGrid(grid, walk, prepared, ({ config, component, data }) => ({
		...formulaContext(component, config, data, env),
		// There is no character behind a preview for an edit to land on, and
		// `inert` already stops the press that would reach this.
		onChange: () => undefined,
		onActivateTab: () => undefined,
	}));
}
