import {
	getLinkpath,
	HoverPopover,
	Keymap,
	Notice,
	TextFileView,
	WorkspaceLeaf,
} from 'obsidian';
import { getComponent } from '../components';
import { closePopover } from '../ui/popover';
import { ConfirmModal } from '../ui/confirm-modal';
import { loadLayout } from '../layouts';
import type SheetsmithPlugin from '../main';
import {
	applySectionWrites,
	CharacterNote,
	CharacterParseError,
	getSection,
	parseCharacter,
} from '../parse/character';
import {
	FormulaEnv,
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../formula/resolve';
import { parseFunctions } from '../formula/functions';
import { buildSheetEnv, publishedComponent } from '../formula/sheet';
import { DEFAULT_COLUMNS, Layout } from '../parse/layout';
import { walkComponents } from '../parse/layout-walk';
import { parseTriggers } from '../parse/triggers';
import {
	ComponentConfig,
	ComponentDefinition,
	isContainer,
	LinkContext,
} from '../types';
import { captureFocus, restoreFocus } from './cell-focus';
import { renderGrid } from './grid-cells';
import { MarkdownPasses } from './markdown-pass';

export const VIEW_TYPE_SHEET = 'sheetsmith-sheet';

/**
 * How long the undo stays offered after a trigger. Long enough to notice a
 * rest was the wrong one, short enough that it is not still sitting there
 * when the note has moved on.
 */
const UNDO_TIMEOUT = 12000;

/**
 * A warning naming the components it affected, one per line.
 *
 * A list rather than a sentence. These messages are read to be counted and
 * checked against the sheet — which pools did not reset, which sections did
 * not save — and several names run together with semicolons is a sentence to
 * parse before the question can be answered. One per line also survives a
 * long reason on each: a failure carries the formula's own explanation, and
 * two of those in one paragraph is unreadable.
 */
function warn(heading: string, items: readonly string[]): void {
	new Notice(
		createFragment((fragment) => {
			fragment.appendText(heading);
			fragment.createEl('ul', { cls: 'sheetsmith-affected' }, (list) => {
				for (const item of items) list.createEl('li', { text: item });
			});
		}),
	);
}

/** A component read for this render, with whatever its section gave up. */
interface PreparedComponent {
	config: ComponentConfig;
	component: ComponentDefinition | undefined;
	error: string | null;
	data: unknown;
}

/**
 * Sheet view. Renders a character note against its layout, and writes
 * component edits back into the note body. All writes go through the parse
 * layer, so untouched sections stay byte-identical.
 */
export class SheetView extends TextFileView {
	private plugin: SheetsmithPlugin;
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;
	/**
	 * Where a hover preview opened from one of this sheet's links lives.
	 *
	 * Declared because the view hands itself to `hover-link` as the popover's
	 * parent, and a parent is the thing that owns one: only `MarkdownView`
	 * declares this, so a `TextFileView` passing itself was promising an
	 * interface it did not implement and Page preview was assigning onto an
	 * object with no place for it.
	 */
	hoverPopover: HoverPopover | null = null;
	/**
	 * Which alternative the reader has opened in each container, by component id.
	 *
	 * Held here rather than in the note, because it is this reader's posture and
	 * not the character's data — a plugin writing its own UI state into a file the
	 * user hand-edits would break the promise the whole plugin rests on, and
	 * Obsidian keeps its own folds out of markdown for the same reason. Held here
	 * rather than in the component, because the sheet re-renders on every
	 * committed edit: a tab set taking its state from its own closure would snap
	 * back to the first tab the moment a pool inside it was edited. The precedent
	 * is `cell-focus.ts`, which carries structural state across exactly this
	 * rebuild.
	 *
	 * Dropped when the leaf moves to another file, so a reopened note starts from
	 * the first tab rather than inheriting the last note's.
	 */
	private activeTab = new Map<string, number>();
	/**
	 * The lifecycle of markdown a component asked the app to draw.
	 *
	 * Here rather than in the component that wants it, because
	 * `MarkdownRenderer.render` needs an `App` and a parent `Component` and a
	 * component has neither — it takes a callback on its `RenderContext`, on
	 * `link`'s own terms. Bounded by this view, so closing the leaf unloads
	 * whatever the last render left loaded.
	 */
	private markdown: MarkdownPasses;

	constructor(leaf: WorkspaceLeaf, plugin: SheetsmithPlugin) {
		super(leaf);
		this.plugin = plugin;
		// In the constructor body rather than as a field initialiser: `app` is the
		// base class's, and a field depending on one is an initialisation order a
		// reader has to know the class hierarchy to check.
		this.markdown = new MarkdownPasses(this, this.app);
	}

	getViewType(): string {
		return VIEW_TYPE_SHEET;
	}

	getDisplayText(): string {
		return this.file?.basename ?? 'Sheet';
	}

	getIcon(): string {
		return 'layout-grid';
	}

	getViewData(): string {
		return this.data;
	}

	setViewData(data: string, _clear: boolean): void {
		this.data = data;
		void this.renderSheet();
	}

	clear(): void {
		// Detach all state from the outgoing file: stale text must never be
		// reported by getViewData, and an in-flight render for the previous
		// file must bail rather than repaint the emptied view.
		this.data = '';
		this.renderId++;
		this.activeTab.clear();
		// The outgoing note's embeds go with it: a transclusion loaded for the
		// file just closed has nothing left to be attached to.
		this.markdown.end();
		this.contentEl.empty();
		// A popover lives on document.body, so emptying this element does not
		// reach it — it would be left pointing at a cell of the file just
		// closed.
		closePopover();
	}

	async onClose(): Promise<void> {
		closePopover();
	}

	/** Re-render from current data, e.g. after the layout file changed. */
	refresh(): void {
		void this.renderSheet();
	}

	/**
	 * Parse and load first, touch the DOM last: overlapping runs are routine
	 * (an edit commit, a layout-editor save, and an external modify can all
	 * land inside one vault read), so only the newest run may render, and the
	 * previous sheet stays visible until its replacement is ready.
	 */
	private async renderSheet(): Promise<void> {
		const run = ++this.renderId;
		const root = this.contentEl;
		root.addClass('sheetsmith-view');

		let note: CharacterNote;
		try {
			note = parseCharacter(this.data);
		} catch (error) {
			root.empty();
			this.renderMessage(
				error instanceof CharacterParseError
					? error.message
					: String(error),
			);
			return;
		}

		let layout: Layout | null = null;
		let loadError: string | null = null;
		try {
			layout = await loadLayout(
				this.app,
				this.plugin.settings.layoutFolder,
				note.layoutName,
			);
		} catch (error) {
			loadError = error instanceof Error ? error.message : String(error);
		}
		if (run !== this.renderId) return;

		const focus = captureFocus(root);
		// Everything a popover could be anchored to is about to be replaced.
		// A pointer interaction dismisses it on its own, but a rebuild driven
		// by anything else — an external edit, a layout saved in settings —
		// would strand it over a cell that no longer exists.
		closePopover();
		root.empty();
		if (loadError !== null) {
			this.renderMessage(loadError);
			return;
		}
		if (!layout) {
			this.renderMessage(
				`Layout "${note.layoutName}" was not found in "${this.plugin.settings.layoutFolder}".`,
			);
			return;
		}

		// Created before the grid so the buttons sit above it, filled in once
		// the components have been read and the name table built — a reset
		// resolves formulas, so it needs both.
		const triggerBar = root.createDiv('sheetsmith-triggers');

		const grid = root.createDiv('sheetsmith-grid');
		grid.style.setProperty(
			'--sheetsmith-columns',
			String(layout.columns ?? DEFAULT_COLUMNS),
		);

		// Grid order, not file order, and depth first: a container's children
		// are read where the container sits, before its next neighbour (SPEC
		// §8). Explicit grid-column/row make DOM order invisible while a grid
		// holds, but it decides two things that matter: tab order, and the
		// single-column sequence once the narrow reflow drops the grid and lays
		// cells out in DOM order.
		const walk = walkComponents(layout.components);

		// Read everything before rendering anything: a formula may name any
		// component on the sheet, including one that sits later in grid
		// order or inside a container that is closed, so the name table has to
		// be complete before the first card draws. A component that failed to
		// read publishes nothing, which makes formulas depending on it report an
		// unknown name rather than compute from a blank.
		const prepared: PreparedComponent[] = walk.map(({ config }) => {
			const component = getComponent(config.type);
			// A container has no section, so there is nothing to look for and no
			// note body to be misread as its own: unmapped prose under a heading
			// that happens to match a container's label is never even read
			// (SPEC §10).
			const readable = isContainer(component) ? undefined : component;
			const section = readable ? getSection(note, config.label) : undefined;
			const result =
				readable && section ? readable.read(section.body, config) : null;
			return {
				config,
				component,
				error: result && !result.ok ? result.error : null,
				data: result?.ok === true ? result.data : null,
			};
		});

		// The layout's own arithmetic (SPEC §5). Definitions that failed to
		// parse are left out and reported in the layout editor, where they
		// can be fixed; a formula calling one fails on its own component.
		const { library } = parseFunctions(layout.functions);

		// A published value may itself be computed, so the tables take a way
		// to build each component's resolver rather than finished numbers:
		// it is what closes the loop between "this card reads the sheet" and
		// "the sheet reads this card".
		// Every component, including the ones that publish nothing at all —
		// `publishedComponent` holds why, and holds it in one place because the
		// harness builds the same thing and the two must not disagree.
		const env = buildSheetEnv(prepared.map(publishedComponent), library);

		// One pass per render, begun before the first component draws and ended by
		// the next render or by the file changing. Resolved against this note's own
		// path, exactly as `linkContext` is, so a relative link or embed inside a
		// block means what it would mean written in the note body.
		const renderMarkdown = this.markdown.begin(this.file?.path ?? '');

		renderGrid(grid, walk, prepared, ({ config, component, data }) => ({
			resolved: resolveFormulaFields(component, config, data, env),
			resolveField: makeFieldResolver(component, config, data, env),
			explainField: makeFieldExplainer(component, config, data, env),
			onChange: (edited: unknown) => this.applyEdit(component, config, edited),
			link: this.linkContext(),
			renderMarkdown,
			resource: (target) => this.resourceUrl(target),
			activeTab: this.activeTab.get(config.id),
			onActivateTab: (index: number) => this.activeTab.set(config.id, index),
		}));

		// SPEC §10: sections the layout does not map are left alone — they stay
		// in the note untouched and simply do not render.

		this.renderTriggers(triggerBar, layout, prepared, env);

		restoreFocus(root, focus);
	}

	/**
	 * What a component needs to make a note reference in a cell work.
	 *
	 * The vault half of a rendered wikilink: a component draws the anchor from
	 * the text alone and asks this whether the note exists, where to go, and what
	 * to preview. Resolved against this note's own path, so a relative link in a
	 * cell means what it would mean written in the note body.
	 */
	private linkContext(): LinkContext {
		const source = this.file?.path ?? '';
		return {
			resolves: (target) =>
				this.app.metadataCache.getFirstLinkpathDest(
					getLinkpath(target),
					source,
				) !== null,
			open: (target, event) => {
				// The modifier that means "new tab" is the app's to define, not a
				// component's — which is half the reason this is passed in.
				void this.app.workspace.openLinkText(
					target,
					source,
					Keymap.isModEvent(event),
				);
			},
			preview: (target, anchor, event) => {
				// The Page preview plugin listens for this and owns the popover,
				// including whether the user asked for it on hover at all.
				this.app.workspace.trigger('hover-link', {
					event,
					source: VIEW_TYPE_SHEET,
					hoverParent: this,
					targetEl: anchor,
					linktext: target,
					sourcePath: source,
				});
			},
		};
	}

	/**
	 * A URL for a file a component names, or null where the vault holds no such
	 * file.
	 *
	 * `linkContext`'s `resolves` with one more step on the end, and resolved
	 * against the same source path, so an embed in a section means what it would
	 * mean written in the note body. **No extension list, deliberately** — the app
	 * answers whether the file exists and the browser answers whether it can draw
	 * it, and a plugin holding its own idea of which formats count is how webp
	 * stopped rendering inside one while working one line outside it.
	 */
	private resourceUrl(target: string): string | null {
		const file = this.app.metadataCache.getFirstLinkpathDest(
			getLinkpath(target),
			this.file?.path ?? '',
		);
		return file ? this.app.vault.getResourcePath(file) : null;
	}

	/**
	 * One button per declared trigger (SPEC §6). This is the only place the
	 * sheet performs an action rather than holding values.
	 */
	private renderTriggers(
		bar: HTMLElement,
		layout: Layout,
		prepared: readonly PreparedComponent[],
		env: FormulaEnv,
	): void {
		const { names } = parseTriggers(layout);
		if (names.length === 0) {
			bar.remove();
			return;
		}

		for (const name of names) {
			// A component that failed to read has no data to reset and would
			// be written from nothing, so it is not bound here either.
			const bound = prepared.filter(
				(entry) =>
					entry.error === null &&
					entry.component?.applyReset !== undefined &&
					// Any of its bindings, not one: a component may answer to
					// several triggers, which is how a system whose long rest
					// includes its short rest gets said at all.
					(entry.config.reset ?? []).some(
						(binding) => binding.trigger === name,
					),
			);

			const button = bar.createEl('button', {
				text: name,
				cls: 'sheetsmith-trigger',
			});
			button.type = 'button';

			if (bound.length === 0) {
				// Shown but inert: the layout declares this trigger, and hiding
				// it would make a half-built layout look like a broken one.
				button.disabled = true;
				button.setAttribute(
					'aria-label',
					`${name}. Nothing on this sheet resets on it.`,
				);
				button.title = `Nothing on this sheet resets on ${name}.`;
				continue;
			}

			button.addEventListener('click', () => {
				new ConfirmModal(
					this.app,
					`Apply ${name}? This can be undone. It resets:`,
					`Apply ${name}`,
					() => this.applyTrigger(name, bound, env),
					bound.map((entry) => entry.config.label),
				).open();
			});
		}
	}

	/**
	 * Reset every component bound to this trigger, in one write.
	 *
	 * SPEC §6: what resolves is applied and what does not is named. A pool
	 * whose max is broken must not stop the rest of a long rest, which is why
	 * the failures are collected rather than thrown.
	 */
	private applyTrigger(
		name: string,
		bound: readonly PreparedComponent[],
		env: FormulaEnv,
	): void {
		const before = this.data;
		const edits: {
			component: ComponentDefinition;
			config: ComponentConfig;
			data: unknown;
		}[] = [];
		const failed: string[] = [];

		for (const { component, config, data } of bound) {
			const index = (config.reset ?? []).findIndex(
				(binding) => binding.trigger === name,
			);
			const reset = config.reset?.[index];
			if (!component?.applyReset || !reset) continue;

			// The bindings are a list, so this one's expression lives at
			// `reset.<index>.to`. The component asks for it by the one name it
			// has — `reset.to` — and the sheet, which knows which binding is
			// being applied, rewrites it. Without this a component would have to
			// know its own position in its own config.
			const at = (field: string): string =>
				field === 'reset.to' ? `reset.${index}.to` : field;
			const resolve = makeFieldResolver(component, config, data, env);
			const explain = makeFieldExplainer(component, config, data, env);

			const result = component.applyReset(data, config, reset, {
				resolve: (field, scope) => resolve(at(field), scope),
				explain: (field, scope) => explain(at(field), scope),
			});
			if (result.ok) edits.push({ component, config, data: result.data });
			else failed.push(`${config.label} — ${result.error}`);
		}

		if (failed.length > 0) {
			warn(`${name} could not reset:`, failed);
		}
		if (edits.length === 0) return;

		this.applyEdits(edits);
		// Nothing moved, so there is nothing to offer taking back.
		if (this.data === before) return;
		this.offerUndo(name, before, this.data);
	}

	/**
	 * Offer to put the note back as it was immediately before the trigger.
	 *
	 * One string swapped for another, which is what the batched write bought:
	 * no inverse edits to compute, and nothing that can half-succeed.
	 */
	private offerUndo(name: string, before: string, after: string): void {
		const notice = new Notice('', UNDO_TIMEOUT);
		notice.messageEl.createSpan({ text: `${name} applied. ` });
		const undo = notice.messageEl.createEl('a', {
			text: 'Undo',
			cls: 'sheetsmith-undo',
		});
		undo.addEventListener('click', () => {
			notice.hide();
			this.restoreDocument(before, after);
		});
	}

	/**
	 * Put `previous` back, but only if the note still holds what the trigger
	 * left. Between the offer and the press the player can edit a field, and a
	 * restore that swallowed that edit would destroy more than it reverted.
	 */
	private restoreDocument(previous: string, expected: string): void {
		if (this.data !== expected) {
			new Notice(
				'Sheetsmith did not undo: this note has changed since the reset.',
			);
			return;
		}
		this.data = previous;
		this.requestSave();
		void this.renderSheet();
	}

	/** One component's edit, as handed to `applyEdits`. */
	private applyEdit(
		component: ComponentDefinition,
		config: ComponentConfig,
		data: unknown,
	): void {
		this.applyEdits([{ component, config, data }]);
	}

	/**
	 * Write edited component data back into the note. Re-parses the current
	 * text so the write always lands on the freshest content, and saves only
	 * when the serialised note actually differs.
	 *
	 * Takes a batch because a reset trigger (SPEC §6) changes several
	 * components at once, and one section at a time would mean one parse,
	 * serialise, save, and re-render per component. An edit from a single
	 * control is a batch of one and behaves exactly as it did.
	 */
	private applyEdits(
		edits: readonly {
			component: ComponentDefinition;
			config: ComponentConfig;
			data: unknown;
		}[],
	): void {
		if (edits.length === 0) return;
		try {
			const { text, failed } = applySectionWrites(
				this.data,
				edits.map(({ component, config, data }) => ({
					label: config.label,
					write: (body: string | null) => component.write(data, body, config),
				})),
			);
			// Every section that could be written still is; the ones that could
			// not are named. A batch must not be all-or-nothing, or one
			// misconfigured component would refuse a whole long rest.
			if (failed.length > 0) {
				warn(
					'Sheetsmith could not save:',
					failed.map((failure) => `${failure.label} — ${failure.error}`),
				);
			}
			if (text !== this.data) {
				this.data = text;
				this.requestSave();
				// Derived displays recompute from the fresh data; renderSheet
				// captures and restores focus, so tabbing into the next input
				// survives the rebuild.
				void this.renderSheet();
			}
		} catch (error) {
			// The note itself would not parse, so there is no partial result to
			// keep — nothing was written.
			new Notice(
				`Sheetsmith could not save this change: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private renderMessage(text: string): void {
		this.contentEl.createDiv('sheetsmith-notice', (el) => el.setText(text));
	}
}
