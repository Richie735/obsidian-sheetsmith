/*
 * Sheetsmith harness.
 *
 * Renders the three surfaces the plugin has — the sheet, the layout editor pane,
 * and the settings tab — outside Obsidian, against the real styles.css, so
 * appearance can be reviewed by looking at it rather than by reading CSS.
 * Not shipped: nothing here is imported by src/main.ts.
 *
 * The sheet runs the genuine pipeline (read, publish scope, resolve formulas,
 * render, and on edit write then re-read), so what appears is what a sheet
 * would show and the note body under each card is what would be saved. That
 * makes it a check on Constraint 3 as well as on appearance.
 *
 * The sheet and the editor are joined: saving in the editor re-renders the
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
import { buildSheet } from '../src/formula/sheet';
import { Layout } from '../src/parse/layout';
import { walkComponents } from '../src/parse/layout-walk';
import {
	ComponentConfig,
	ComponentDefinition,
	isContainer,
	LinkContext,
	ModifierContext,
} from '../src/types';
import { nameAlreadyDeclared } from '../src/layouts';
import { dropDetachedAnchoredPanel } from '../src/ui/anchored-panel';
import { renderGrid } from '../src/view/grid-cells';
import { renderEditorPane } from './editor-pane';
import {
	brokenSamples,
	effectiveSamples,
	emptySamples,
	Sample,
	SAMPLES,
	unmodifiedSamples,
} from './samples';
import { renderSettings } from './settings-panel';
import { harnessLayout } from './stub-app';

type StateName =
	| 'populated'
	| 'empty'
	| 'unmodified'
	| 'effective'
	| 'broken';
type Surface = 'sheet' | 'editor' | 'settings' | 'both';

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
	if (name === 'unmodified') return unmodifiedSamples();
	if (name === 'effective') return effectiveSamples();
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
function sheetEnv(entries: Live[]): {
	env: FormulaEnv;
	modifiers: ModifierContext;
} {
	// **Through the view's own `buildSheet`, not a copy of its steps.** That is
	// this function's whole reason, one layer up from `publishedComponent`: an
	// instrument that wired modifiers differently from the plugin would sign off
	// on marks the plugin never draws — and a copy of the sequence is exactly what
	// it was, until three separate mutations of it were measured to leave the
	// suite green. The layout's own arithmetic goes in beside it, which the
	// harness sheet has needed since a card could read a function the settings
	// pane is editing.
	return buildSheet(
		layout,
		entries,
		parseFunctions(layout.functions).library,
		/*
		 * §8's layout write, faked the only way it can be here: there is no vault,
		 * so the definition is appended to the layout this module holds and the sheet
		 * is redrawn. That is enough for the surface — the promote row, its refusals
		 * and the row converting to a reference are all reviewable — and it is the
		 * same *order* the view uses, the layout first and the cell only on success,
		 * because the form is what enforces that and the form is the real one.
		 */
		(name, effect) => {
			const held = layout.modifiers ?? [];
			if (held.some((one) => (one.name ?? '').trim() === name)) {
				// The plugin's own sentence, imported rather than copied: an instrument
				// showing a refusal the plugin does not give is the same class of bug
				// the host scan one file over exists to prevent.
				return Promise.resolve({ error: nameAlreadyDeclared(name) });
			}
			// The effect whole, exactly as the view hands it over: a `TypedEffect` is a
			// `ModifierDefinition` minus its name, so spelling the five fields here
			// would be a second place to drop a member the contract added.
			layout.modifiers = [...held, { name, ...effect }];
			return Promise.resolve({ ok: true as const });
		},
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

/**
 * A picture the harness can hold without a binary in the repository.
 *
 * An inline SVG, so a real image is on screen and its *fit* inside the box is
 * reviewable — which is the whole of Image's sizing story and the one thing a
 * placeholder rectangle could not show. Deliberately **not square**: a portrait
 * shape in a wide box and the same file in a tall one is how `object-fit:
 * contain` is checked, and a square sample would have looked correct under a
 * stretch as well.
 */
function portrait(width: number, height: number, label: string): string {
	const svg = [
		// **`width` and `height` as well as `viewBox`**, so the file has an
		// *intrinsic size* the way every real one does. Without them an SVG is
		// sizeless and stretches to whatever the box offers — which made every shot
		// show a picture filling its frame edge to edge, the one behaviour a real
		// file will not necessarily produce, on the single property this component is
		// built around. An instrument that can only draw the flattering case is
		// worse than one that omits the case.
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
		`<rect width="${width}" height="${height}" fill="#8a7fbe"/>`,
		// A circle, because a circle drawn as an ellipse is what a distorted
		// picture looks like and nothing else in the shape would say so.
		`<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#f2efff"/>`,
		`<text x="${width / 2}" y="${height - 12}" fill="#f2efff" font-family="sans-serif" font-size="14" text-anchor="middle">${label}</text>`,
		'</svg>',
	].join('');
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * The vault half of a drawn picture, faked — `linkContext`'s shape for `<img>`.
 *
 * Three targets for the three states only a vault can put a component into, so
 * all three are on screen at once rather than one at a time:
 *
 * - two that resolve, at different aspect ratios, so the fit is reviewable;
 * - one that resolves to nothing, which is the commonest way a vault reference
 *   goes stale and the state every analogue drew as an empty box;
 * - one that resolves to something the browser cannot draw, which is the failure
 *   a plugin can only report and never predict.
 *
 * A data URI for the last one too, so the load failure is genuine rather than
 * simulated: the browser really does refuse it, and the component really does
 * hear `error`.
 */
const PICTURES: Record<string, string> = {
	'Sildar Hallwinter.png': portrait(300, 420, 'Sildar'),
	'Crest.png': portrait(480, 260, 'Crest'),
	// Deliberately tiny, and the case the sizeless SVGs used to hide: a 48px file
	// in a three-row frame. It draws scaled up to fill, which is the decision
	// `styles/sheet.css` records — and if it ever draws as a speck again, this is
	// the sample that says so.
	//
	// **What it cannot show is what the upscale looks like**, and that is worth
	// knowing before trusting the shot: this is an SVG, so it scales losslessly and
	// draws clean at any size. A real 48px raster in the same box is visibly blocky,
	// which is a review in Obsidian's finding and not something any shot here would
	// have reported. Making it visible means a base64 PNG in this file — no binary
	// asset, but binary content inline — which is a call about what this harness is
	// willing to hold rather than a fix.
	'Tiny sigil.png': portrait(48, 48, ''),
	// Well-formed text that is not an image, which is what a note is.
	'Notes.md': 'data:text/plain;charset=utf-8,not%20a%20picture',
};

/*
 * Which target is unresolvable is decided by *absence* from the table above,
 * unlike `MISSING_NOTE` below — a link has to be resolved by name to be painted
 * unresolved, while a picture the vault does not hold simply is not in the vault.
 * `samples.ts` names one, and the only thing keeping the two in step is that the
 * name is not a key here.
 */
function resource(target: string): string | null {
	return PICTURES[target] ?? null;
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

	const { env, modifiers } = sheetEnv(live);

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
				// The sheet-wide half of modifiers, on `link`'s own terms: what
				// accepts one, and what has been pushed at each name.
				modifiers,
				// The one member Image needs, on `link`'s own terms. `renderMarkdown`
				// stays absent on purpose (see `samples.ts`), so a reviewer sees the
				// fallback for prose and a real picture for an image.
				resource,
				// The view's own answer, so a tab survives an edit here exactly as
				// it does in the app: a re-render is what would otherwise reset it.
				activeTab: activeTab.get(config.id),
				onActivateTab: (index: number) => activeTab.set(config.id, index),
			};
		},
	);


	/*
	 * The view's own last step: a modifier form the render before this one left
	 * open has been handed to the cell it belongs to during the walk above, and one
	 * that nothing claimed goes rather than floating over a sheet it has nothing to
	 * do with.
	 */
	dropDetachedAnchoredPanel();

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
 * The editor pane is rendered once and kept, rather than rebuilt with the sheet.
 * It owns its own redraw — the editor rebuilds itself on every change and the
 * pane restores the scroll across that — and tearing it down from outside would
 * fight the thing being reviewed.
 */
let editorPane: HTMLElement | null = null;
/**
 * Which state the editor pane was built for. It reads its layout from the stub
 * vault, written once when the pane is built, so a pane kept across a state
 * change would show the populated layout beside a sheet rendering the broken
 * one — and a reviewer would be looking at a form that says the field is fine
 * and a card that says it is not, with nothing but the instrument between them.
 */
let editorState: StateName | null = null;
/** The settings tab, which reads no layout and so needs no state of its own. */
let settingsPane: HTMLElement | null = null;

async function ensureEditor(): Promise<HTMLElement> {
	if (editorPane && editorState === state) return editorPane;
	const pane = document.createElement('div');
	pane.className = 'harness-editor';
	editorPane = pane;
	editorState = state;
	// Which of the pane's own controls this view wants driven: a tree row
	// selected, an add-menu option chosen. Both are things a reviewer would click
	// and a still cannot.
	const params = new URLSearchParams(window.location.search);
	// What the layout folder holds. The two states the editor draws instead of a
	// tree — no layouts at all, and one whose file will not parse — are reachable
	// no other way here: the **State** buttons break a component's *config*, and
	// a broken config still parses.
	const file = params.get('layout');
	await renderEditorPane(
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
		file === 'none' || file === 'broken'
			? file
			: harnessLayout(samplesFor(state)),
		{
			open: params.get('open') ?? undefined,
			choice: params.get('choice') ?? undefined,
		},
	);
	return pane;
}

async function ensureSettings(): Promise<HTMLElement> {
	if (settingsPane) return settingsPane;
	const pane = document.createElement('div');
	pane.className = 'harness-settings';
	settingsPane = pane;
	await renderSettings(pane, harnessLayout());
	return pane;
}

/** Build whatever the chosen surface needs before anything is drawn. */
async function ensureSurface(): Promise<void> {
	if (surface === 'editor' || surface === 'both') await ensureEditor();
	if (surface === 'settings') await ensureSettings();
}

/** One column per surface the choice asks for, in the order they are named. */
function draw(): void {
	stage.replaceChildren();

	const column = (build: (into: HTMLElement) => void): void => {
		const pane = document.createElement('div');
		pane.className = 'harness-pane';
		stage.appendChild(pane);
		build(pane);
	};

	if (surface === 'sheet' || surface === 'both') column(renderSheet);
	if ((surface === 'editor' || surface === 'both') && editorPane) {
		column((into) => into.appendChild(editorPane as HTMLElement));
	}
	if (surface === 'settings' && settingsPane) {
		column((into) => into.appendChild(settingsPane as HTMLElement));
	}
}

/**
 * The base font size the sheet's relative units resolve against, which is the
 * thing a reader's vault text size setting actually moves. `0` leaves the
 * inherited size alone.
 *
 * It moves every `em`-relative rule the plugin declares — the card's headline
 * number, the level ring and the delete glyph beside it, the 0.85 secondary
 * sizes — and deliberately not Obsidian's fixed-px `--font-ui-*` tokens, which
 * do not move for the user either. So a shot at 24 shows exactly what UI.md
 * §5's "relative units, so the card scales with the user's setting" is worth,
 * and claims nothing beyond it.
 */
function setText(size: string): void {
	stage.style.fontSize = size === '0' ? '' : `${size}px`;
}

/**
 * Light or dark, without disturbing the other classes body carries.
 *
 * It used to be an assignment to `className`, which was fine while the theme was
 * the only thing written there. `harness-bounded` lives there too now, and an
 * assignment would drop it on the next press of **Dark** — an instrument that
 * silently leaves the mode it was put in is worse than one that never had it.
 */
function setTheme(theme: string): void {
	document.body.classList.toggle('theme-dark', theme === 'dark');
	document.body.classList.toggle('theme-light', theme !== 'dark');
}

/**
 * Whether the surface is held to the window's height or allowed to grow past it.
 *
 * Everything the class does is in `theme.css`; what it means is that the pane
 * scrolls inside itself the way a leaf does, so a shot has a fold in it.
 */
function setBounded(on: boolean): void {
	document.body.classList.toggle('harness-bounded', on);
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
		const { theme, width, text, state: wanted, surface: pane } = button.dataset;
		if (theme !== undefined) {
			setTheme(theme);
			press('theme', theme);
		}
		if (width !== undefined) {
			stage.style.maxWidth = width === '0' ? 'none' : `${width}px`;
			press('width', width);
		}
		if (text !== undefined) {
			setText(text);
			press('text', text);
		}
		if (wanted !== undefined) {
			loadState(wanted as StateName);
			press('state', wanted);
			// The editor pane reads the state's own layout, so switching state
			// rebuilds it rather than leaving it on the last one.
			void ensureSurface().then(draw);
		}
		if (pane !== undefined) {
			surface = pane as Surface;
			press('surface', pane);
			stage.classList.toggle('harness-split', surface === 'both');
			void ensureSurface().then(draw);
		}
	});

/**
 * Open in a named state:
 * `?surface=editor&theme=dark&width=620&text=24&state=empty`.
 *
 * Two more for the editor pane, whose controls a still cannot press:
 * `&open=<component id>` selects that component, and `::sheet::` selects the
 * layout itself; `&choice=<type>` or `&choice=<type>:<index>` selects an option
 * of the **Add component** menu — which is the only way to see a palette entry's
 * description, since the menu opens on a bare type and those have none.
 *
 * And one for what the layout *folder* holds: `&layout=none` for a vault with no
 * layouts in it, `&layout=broken` for one whose file will not parse. Neither is
 * reachable through **State**, which breaks a component's config and leaves the
 * file perfectly parseable.
 *
 * And one for the fold: `&bounded` holds the surface to the window's height, so
 * it scrolls inside itself the way a leaf scrolls inside a workspace. The
 * default is the opposite — the pane grows and a shot captures the whole surface
 * — and that default is right, because a review that has to scroll for its
 * findings misses them. What it costs is that **nothing about scrolling,
 * clipping, or what falls below the fold is visible in a grown shot**, which is
 * how a pane with one scroller for both its columns shipped behind a 4600px
 * capture. It takes no value, because the fold is not a number this page gets to
 * pick: it is the viewport minus the bar, and `theme.css` carries both
 * subtractions and why neither is the number a shot passes as `size=`.
 *
 * A query rather than a pair of buttons in the bar, which is what this was
 * first. The bar at 1400 had no room for a seventh group, so it wrapped to two
 * rows and took 38px off every shot at that width — four of the defaults —
 * for a mode none of them use. Every other control a still cannot press is a
 * query for its own reasons; this one is a query because the bar is not free.
 *
 * And one for focus: `&focus=<css selector>` focuses the first element matching
 * it once the surface has drawn. A still cannot press Tab, so until this existed
 * *no* focus treatment had ever been photographed — every "focus is visible on
 * every interactive element" reading in `docs/UI.md` §11 was taken by hand or
 * taken on trust. The rule the sheet uses is `:focus` rather than
 * `:focus-visible`, so a programmatic focus paints exactly what a tab press
 * would.
 *
 * And one for a press: `&press=<css selector>` clicks the first element matching
 * it once the surface has drawn. Same argument as focus one step on — a still
 * cannot press either, and the modifier breakdown lives behind a press, so until
 * this existed the feature's own differentiator had never been photographed.
 *
 * A screenshot has no way to click, so without this only the default view can
 * ever be captured — and the settings tab, which is most of what needs looking
 * at, would be unreachable to any automated shot or to a link in a review.
 */
function applyQuery(): void {
	const params = new URLSearchParams(window.location.search);
	const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
	setTheme(theme);
	press('theme', theme);

	const width = params.get('width') ?? '0';
	stage.style.maxWidth = width === '0' ? 'none' : `${width}px`;
	press('width', width);

	// Present at all, whatever it is spelled as: `&bounded` alone is the form
	// the shots use, and `&bounded=1` should not mean something else.
	setBounded(params.get('bounded') !== null);

	const text = params.get('text') ?? '0';
	setText(text);
	press('text', text);

	const wanted = params.get('state');
	loadState(
		wanted === 'empty' ||
			wanted === 'unmodified' ||
			wanted === 'effective' ||
			wanted === 'broken'
			? wanted
			: 'populated',
	);
	press('state', state);

	const pane = params.get('surface');
	surface =
		pane === 'editor' || pane === 'settings' || pane === 'both' ? pane : 'sheet';
	press('surface', surface);
	stage.classList.toggle('harness-split', surface === 'both');

	const focus = params.get('focus');
	/** After the surface exists, or there is nothing matching to focus yet. */
	const focusWanted = () => {
		if (focus === null) return;
		document.querySelector<HTMLElement>(focus)?.focus();
	};

	/*
	 * **`&bar=off` drops the harness's own toolbar**, for a shot whose subject is a
	 * floating surface anchored near the top of the page.
	 *
	 * The bar is sticky chrome the app does not have, and `showPopover` places a
	 * bubble above its anchor wherever `box.top - height - 8 >= 0` — measured against
	 * the *viewport*, which knows nothing about a toolbar sitting in the first 85px.
	 * Armour class is the only card on this sheet whose breakdown draws on two
	 * components, so it is the only one that can show the qualified form, and at nine
	 * contributors its bubble opens at y=76 under a bar whose bottom is 85: nine
	 * pixels of the first contributor's ascenders, sliced.
	 *
	 * Dropping the bar rather than moving the card, because there is no lower card
	 * with two sources; rather than padding the stage, which would shift every sheet
	 * shot by 85px to fix one; and rather than teaching `placeAnchored` about a bar,
	 * which is production code that would then carry the instrument's artefact.
	 */
	if (params.get('bar') === 'off') {
		document.querySelector('.harness-bar')?.remove();
	}

	const pressed = params.getAll('press');
	/**
	 * Press one element once the surface has drawn, so a still can capture what a
	 * press reveals.
	 *
	 * `&focus=`'s sibling and its argument exactly: until that existed no focus
	 * treatment had ever been photographed, and until this existed neither had the
	 * modifier breakdown, in either of its two forms. Five of item modifiers'
	 * surfaces were in none of the twenty default shots and had to be reviewed by
	 * driving a browser, which means the next reviewer is blind to the same
	 * things — and `CLAUDE.md`'s whole method is to review appearance by looking
	 * at it.
	 *
	 * A synthetic `click()` and not a pointer sequence, which is what makes this
	 * five lines rather than a mouse-event harness: every surface worth pressing
	 * here answers a plain `click` — the card's derived and the table's computed
	 * cell both bind one directly. The gestures that genuinely need a pointer are
	 * `bindLongPress` and the pool's scrub, and neither is a second door onto
	 * something a still cannot otherwise reach, so nothing here is waiting on
	 * them.
	 *
	 * A press, unlike a focus, can change what is on screen — which is the point.
	 * It runs after `draw()` so the element exists, and the popover it opens is
	 * fixed to the viewport and dismissed only by a real pointerdown, so it
	 * survives to be captured.
	 */
	const pressWanted = () => {
		/*
		 * **Several, in order**, because the form this now opens has a second
		 * disclosure inside it: the panel opens with its list, and a press on a line
		 * opens that part's own six fields. One press could photograph the list or
		 * nothing, and `docs/UI.md` §11's whole argument is against reviewing a
		 * surface by reading its code. Each press runs against the DOM the one
		 * before it left, which is what makes a second selector able to name
		 * something only the first press drew.
		 */
		for (const selector of pressed) {
			document.querySelector<HTMLElement>(selector)?.click();
		}
	};

	void ensureSurface().then(() => {
		draw();
		focusWanted();
		pressWanted();
	});
}

applyQuery();
