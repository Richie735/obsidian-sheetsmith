/*
 * Sheetsmith harness.
 *
 * Renders both surfaces the plugin has — the sheet and the settings tab that
 * holds the layout editor — outside Obsidian, against the real styles.css, so
 * appearance can be reviewed by looking at it rather than by reading CSS.
 * Not shipped: nothing here is imported by src/main.ts.
 *
 * The sheet runs the genuine pipeline (read, publish scope, resolve formulas,
 * render, and on edit write then re-read), so what appears is what a sheet
 * would show and the note body under each card is what would be saved. That
 * makes it a check on Constraint 3 as well as on appearance.
 *
 * The two surfaces are joined: saving in the layout editor re-renders the
 * sheet from the layout it just wrote. Stored values survive that, exactly as
 * they must in the app (Constraint 4).
 *
 * What it cannot tell you: exact theme fidelity (see harness/theme.css), and
 * anything depending on a real vault, since files here are in memory.
 */

import { getComponent } from '../src/components';
import { parseFunctions } from '../src/formula/functions';
import {
	FormulaEnv,
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../src/formula/resolve';
import { buildSheetEnv, publishedComponent } from '../src/formula/sheet';
import { Layout } from '../src/parse/layout';
import { walkComponents } from '../src/parse/layout-walk';
import {
	ComponentConfig,
	ComponentDefinition,
	isContainer,
	LinkContext,
} from '../src/types';
import { renderGrid } from '../src/view/grid-cells';
import { brokenSamples, emptySamples, Sample, SAMPLES } from './samples';
import { harnessLayout, renderSettings } from './settings-panel';

type StateName = 'populated' | 'empty' | 'broken';
type Surface = 'sheet' | 'settings' | 'both';

interface Live {
	config: ComponentConfig;
	component: ComponentDefinition | undefined;
	body: string | null;
	data: unknown;
	error: string | null;
}

const stage = document.getElementById('stage') as HTMLElement;

let layout: Layout = harnessLayout();
let state: StateName = 'populated';
let surface: Surface = 'sheet';
/** Stored values, keyed by component id, so a layout edit never loses them. */
let bodies = new Map<string, string | null>();
let live: Live[] = [];

function samplesFor(name: StateName): Sample[] {
	if (name === 'empty') return emptySamples();
	if (name === 'broken') return brokenSamples();
	return SAMPLES;
}

/** Reset stored values to the chosen state, and take its configs as the layout. */
function loadState(name: StateName): void {
	state = name;
	const samples = samplesFor(name);
	bodies = new Map(
		samples.flatMap((s) =>
			walkComponents([s.config]).map((entry) => [
				entry.config.id,
				entry.config === s.config ? s.body : (s.children?.[entry.config.id] ?? null),
			] as [string, string | null]),
		),
	);
	layout = harnessLayout(samples);
	prepare();
}

/**
 * Read every section before rendering any, so the name table is complete —
 * including a container's children, which is the whole point of walking rather
 * than iterating: a formula may name a card inside a group that is closed, and
 * the closed group must not change what the sheet computes.
 */
function prepare(): void {
	live = walkComponents(layout.components).map(({ config }) => {
		const component = getComponent(config.type);
		const body = bodies.get(config.id) ?? null;
		if (!component) {
			return {
				config,
				component,
				body,
				data: null,
				error: `Unknown component type "${config.type}".`,
			};
		}
		// A container has no section, so there is nothing to read (SPEC §4.1).
		if (body === null || isContainer(component)) {
			return { config, component, body, data: null, error: null };
		}
		const result = component.read(body, config);
		return {
			config,
			component,
			body,
			data: result.ok ? result.data : null,
			error: result.ok ? null : result.error,
		};
	});
}

/**
 * What every formula on the sheet resolves against, built by the view's own
 * `publishedComponent` rather than by a copy of it.
 *
 * A copy is what this was, and it had drifted: it dropped a component whose
 * section would not read instead of listing it, so an aggregate over a broken
 * table said there was no such table on the sheet where the app says it holds no
 * rows. An instrument that publishes differently from the thing it measures
 * signs off on messages the plugin never produces.
 */
function sheetEnv(entries: Live[]): FormulaEnv {
	// The layout's own arithmetic, which the harness sheet has needed since a
	// card could read a function the settings pane is editing.
	return buildSheetEnv(
		entries.map(publishedComponent),
		parseFunctions(layout.functions).library,
	);
}

/**
 * Apply an edit the way the sheet view does: serialise, then re-read from the
 * text rather than trusting the object. A component that writes something it
 * cannot read back shows up here immediately.
 */
function applyEdit(entry: Live, edited: unknown): void {
	if (!entry.component) return;
	const body = entry.component.write(edited, entry.body, entry.config);
	bodies.set(entry.config.id, body);
	entry.body = body;
	const result = entry.component.read(body, entry.config);
	entry.data = result.ok ? result.data : null;
	entry.error = result.ok ? null : result.error;
	draw();
}

/** A note the sample links to that deliberately does not exist. */
const MISSING_NOTE = 'Torch of Revealing';

/**
 * What the last link gesture would have done, so a shot can say so.
 *
 * Written into the line directly rather than through `draw()`. Redrawing on a
 * *hover* rebuilt the sheet under the pointer: the element being hovered was
 * replaced mid-gesture, so a press landed on one anchor and released on its
 * replacement and the click never dispatched at all. The app rebuilds on an edit,
 * never on a preview, so the redraw was the instrument inventing a failure — and
 * an instrument that cannot be hovered cannot be used to review a link.
 */
let linkLog: HTMLElement | null = null;

function sayLink(said: string): void {
	if (linkLog === null) return;
	linkLog.textContent = `${said}. There is no vault here, so nothing opens.`;
}

/**
 * The vault half of a rendered wikilink, faked.
 *
 * The anchor itself needs none of this — a component draws it from the cell's
 * text — so what this adds is the two things only a vault can answer: whether
 * the note exists, and what a press does. Everything resolves except one target,
 * so both link states are on screen at once; a press writes a line instead of
 * navigating, because there is nowhere here to navigate to.
 */
function linkContext(): LinkContext {
	return {
		resolves: (target) => target !== MISSING_NOTE,
		open: (target) => sayLink(`Would open "${target}"`),
		preview: (target) => sayLink(`Would preview "${target}"`),
	};
}

/** Which tab the reader has opened where, exactly as the view holds it. */
const activeTab = new Map<string, number>();

function renderSheet(into: HTMLElement): void {
	const view = document.createElement('div');
	view.className = 'sheetsmith-view';
	into.appendChild(view);

	const grid = document.createElement('div');
	grid.className = 'sheetsmith-grid';
	grid.style.setProperty('--sheetsmith-columns', String(layout.columns ?? 12));
	view.appendChild(grid);

	const env = sheetEnv(live);

	// The view's own walk and the view's own descent through it, so the harness
	// cannot order or nest the sheet differently from the thing it is measuring.
	// Everything below the context builder is `grid-cells.ts`: the cells, the
	// subgrids, the error marks, and the recursion that used to be a second copy
	// of the view's loop.
	renderGrid(
		grid,
		walkComponents(layout.components),
		live,
		(entry) => {
			const { config, component, data } = entry;
			return {
				resolved: resolveFormulaFields(component, config, data, env),
				resolveField: makeFieldResolver(component, config, data, env),
				explainField: makeFieldExplainer(component, config, data, env),
				// The entry the grid was given, which is this module's own `Live`:
				// `applyEdit` writes the re-read section back into it.
				onChange: (edited: unknown) => applyEdit(entry as Live, edited),
				link: linkContext(),
				// The view's own answer, so a tab survives an edit here exactly as
				// it does in the app: a re-render is what would otherwise reset it.
				activeTab: activeTab.get(config.id),
				onActivateTab: (index: number) => activeTab.set(config.id, index),
			};
		},
	);


	// Always present, so a link gesture has somewhere to write without a rebuild.
	linkLog = document.createElement('p');
	linkLog.className = 'harness-note';
	linkLog.textContent = 'Press or hover a link in a cell.';
	into.appendChild(linkLog);
	into.appendChild(noteBodies());
}

/** What each section would be saved as, so a write bug is visible. */
function noteBodies(): HTMLElement {
	const wrap = document.createElement('details');
	wrap.className = 'harness-bodies';
	const summary = document.createElement('summary');
	summary.textContent = 'Note bodies as they would be written';
	wrap.appendChild(summary);
	for (const entry of live) {
		const pre = document.createElement('pre');
		pre.textContent = `## ${entry.config.label}\n${entry.body ?? '(nothing stored)'}`;
		wrap.appendChild(pre);
	}
	return wrap;
}

/**
 * The settings tab is rendered once and kept, rather than rebuilt with the
 * sheet. It owns its own redraw — the layout editor rebuilds itself on every
 * change and restores scroll and focus across that — and tearing it down from
 * outside would fight the thing being reviewed.
 */
let settingsPane: HTMLElement | null = null;
/**
 * Which state the settings pane was built for. The tab reads its layout from
 * the stub vault, written once when the pane is built, so a pane kept across a
 * state change would show the populated layout beside a sheet rendering the
 * broken one — and a reviewer would be looking at a form that says the field
 * is fine and a card that says it is not, with nothing but the instrument
 * between them.
 */
let settingsState: StateName | null = null;

async function ensureSettings(): Promise<HTMLElement> {
	if (settingsPane && settingsState === state) return settingsPane;
	const pane = document.createElement('div');
	pane.className = 'harness-settings';
	settingsPane = pane;
	settingsState = state;
	/** Which component's form to open, for a view that lives inside one. */
	const open = new URLSearchParams(window.location.search).get('open');
	await renderSettings(
		pane,
		{
			onLayoutChange: (next) => {
				// Stored values are keyed by component id and survive, which is
				// Constraint 4 in miniature: a layout change never drops data.
				layout = next;
				prepare();
				draw();
			},
		},
		harnessLayout(samplesFor(state)),
		open ?? undefined,
	);
	return pane;
}

function draw(): void {
	stage.replaceChildren();

	if (surface !== 'settings') {
		const sheetPane = document.createElement('div');
		sheetPane.className = 'harness-pane';
		stage.appendChild(sheetPane);
		renderSheet(sheetPane);
	}

	if (surface !== 'sheet' && settingsPane) {
		const pane = document.createElement('div');
		pane.className = 'harness-pane';
		pane.appendChild(settingsPane);
		stage.appendChild(pane);
	}
}

function press(group: string, value: string): void {
	// Array.from rather than iterating the NodeList directly: the plugin's
	// tsconfig omits DOM.Iterable, and the harness must not widen it.
	const buttons = Array.from(
		document.querySelectorAll<HTMLButtonElement>(`[data-${group}]`),
	);
	for (const button of buttons) {
		button.setAttribute('aria-pressed', String(button.dataset[group] === value));
	}
}

document
	.querySelector('.harness-bar')
	?.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest('button');
		if (!button) return;
		const { theme, width, state: wanted, surface: pane } = button.dataset;
		if (theme !== undefined) {
			document.body.className = `theme-${theme}`;
			press('theme', theme);
		}
		if (width !== undefined) {
			stage.style.maxWidth = width === '0' ? 'none' : `${width}px`;
			press('width', width);
		}
		if (wanted !== undefined) {
			loadState(wanted as StateName);
			press('state', wanted);
			// The settings tab reads the state's own layout, so switching state
			// rebuilds it rather than leaving it on the last one.
			if (surface === 'sheet') draw();
			else void ensureSettings().then(draw);
		}
		if (pane !== undefined) {
			surface = pane as Surface;
			press('surface', pane);
			stage.classList.toggle('harness-split', surface === 'both');
			if (surface === 'sheet') draw();
			else void ensureSettings().then(draw);
		}
	});

/**
 * Open in a named state: `?surface=settings&theme=dark&width=620&state=empty`,
 * with `&open=<component id>` opening that component's form on the settings
 * tab.
 *
 * A screenshot has no way to click, so without this only the default view can
 * ever be captured — and the settings tab, which is most of what needs looking
 * at, would be unreachable to any automated shot or to a link in a review.
 */
function applyQuery(): void {
	const params = new URLSearchParams(window.location.search);
	const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
	document.body.className = `theme-${theme}`;
	press('theme', theme);

	const width = params.get('width') ?? '0';
	stage.style.maxWidth = width === '0' ? 'none' : `${width}px`;
	press('width', width);

	const wanted = params.get('state');
	loadState(wanted === 'empty' || wanted === 'broken' ? wanted : 'populated');
	press('state', state);

	const pane = params.get('surface');
	surface = pane === 'settings' || pane === 'both' ? pane : 'sheet';
	press('surface', surface);
	stage.classList.toggle('harness-split', surface === 'both');

	if (surface === 'sheet') draw();
	else void ensureSettings().then(draw);
}

applyQuery();
