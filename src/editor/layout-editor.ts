import {
	ButtonComponent,
	debounce,
	Notice,
	Setting,
	TFile,
} from 'obsidian';
import {
	RenameIntent,
	reportComponentRename,
} from '../component-rename-migration';
import { getComponent } from '../components';
import { Canvas } from './canvas';
import { ComponentPicker } from './component-picker';
import { ConfigPanel } from './config-panel';
import {
	LayoutFileRowHost,
	promptForNewLayout,
	renderLayoutFileRow,
} from './layout-file-row';
import { offerLayoutCopy } from './layout-copy';
import { showFieldError } from './field-error';
import { attachFormulaSuggest, FormulaSuggest } from './formula-suggest';
import { focusToken } from './focus-token';
import { ConfirmModal } from '../ui/confirm-modal';
import { offerUndo, UNDO_TIMEOUT } from '../ui/undo-notice';
import { writeClipboard } from '../ui/clipboard';
import { NEW_LAYOUT_LABEL } from './new-layout';
import { isResolvedLayout, listLayouts } from '../layouts';
import { ListContext } from './list-fields';
import { PickerChoice } from './picker-catalog';
import type SheetsmithPlugin from '../main';
import { Layout, parseLayout, serialiseLayout } from '../parse/layout';
import { WalkEntry } from '../parse/layout-walk';
import { parseFunctions } from '../formula/functions';
import { Vocabulary, vocabularySource } from '../formula/vocabulary';
import { clipboardRow, nextFreeRow, renderTree, SHEET_DESTINATION } from './tree';
import { ComponentConfig } from '../types';
import { UndoStack } from './undo-stack';
import {
	changedWhileClosedSentence,
	deletedSentence,
	keptSentence,
	Unsaved,
} from './unsaved-layouts';
import { uniqueId, uniqueLabel } from './unique-names';
import {
	encodeComponentCopy,
	layoutFingerprint,
	readComponentCopy,
} from '../parse/component-clipboard';
import { copiedComponent, pasteComponent, pasteConfiguration } from './paste';
import { copyContext } from './paste-dependencies';
import { configurationSentence, pasteSentence } from './paste-notice';
import { PasteBoxModal } from './paste-box';
import { childIsPlaced, walkLayout } from '../view/grid-cells';
import {
	adoptionReport,
	countAdoptions,
	reportAdoption,
	sectionLabels,
} from '../section-adoption';

/**
 * The top level, wherever something has to be named that is not a component.
 *
 * Defined in `tree.ts` and re-exported here: the tree needs it to draw and
 * select the layout's own row, and this module needs it for the same
 * question one level up (what the panel configures when nothing else is
 * selected; the component picker's destination imports it from `tree.ts`
 * too) — declaring it in
 * whichever of the two imports the other would make a cycle of two runtime
 * values, where this file already imports `renderTree` from `tree.ts`.
 */
export { SHEET_DESTINATION };

/** How long a rebuilt region stays marked, before fading over its own transition. */
const FLASH_HOLD = 900;

/**
 * One step on the undo or redo stack.
 *
 * `held` marks the one entry that was never a file: the pane's own
 * serialisation of a layout it could not write, pushed by an undo out of the
 * unsaved state (`docs/features/unsaveable-layout.md` §3). It may not parse, so
 * restoring it takes a structural copy rather than `parseLayout`; every other
 * entry is bytes the file held, and still goes through the parser, so a real
 * snapshot that failed to parse would still say so.
 */
interface Snapshot {
	text: string;
	held?: boolean;
}

/** What a commit carrying a rename says while the layout is not on disk. */
const RENAME_REFUSED =
	'Not renamed, because this layout is not saved yet and its character notes cannot be migrated until this layout saves.';

/** The message an unknown thrown value carries. */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * What the editor needs from the pane hosting it.
 *
 * The two pieces of state are the *author's posture* rather than the layout's
 * content — which layout file they have open, and what they are looking at — so
 * both belong to the view, which is where a workspace remembers posture at all
 * (`View.getState` for one, `View.setEphemeralState` for the other). The editor
 * reads them at render time and asks for a change; it never keeps a copy,
 * because a copy is a second answer to "what is selected" and the two would
 * disagree the first time a pane was restored.
 *
 * **The open layout is a file, and the editor can only ask for another one**
 * (`docs/features/visible-layout-files.md`). It used to be a basename the editor
 * set for itself and resolved out of `listLayouts`, which made "which file is
 * open" a thing the editor could change behind the view's back. The pane is a
 * `FileView` now and the file is its binding, so the editor is handed the file
 * and asks the host to open a different one — and the host does that the way
 * Obsidian opens any file, in the same leaf.
 *
 * `setSelection` does not redraw. A render that has to correct the selection —
 * one naming a component the layout no longer holds — would otherwise redraw
 * from inside a render, and the caller that wants both says so in two lines
 * instead.
 *
 * `refreshSheets` is here for a different reason: a write to the layout file has
 * to reach every sheet rendering it, and reaching into a view is the view
 * layer's hop to make rather than this one's (`docs/PATTERNS.md` §2).
 */
export interface LayoutEditorHost {
	/** The layout file the pane has open, or null where it has none. */
	readonly layoutFile: TFile | null;
	/**
	 * Open another layout file in this pane. The host lets go of the one it
	 * had — which is where a pending edit is written and the undo history is
	 * cleared — and draws the new one.
	 */
	openLayoutFile(file: TFile): void;
	/**
	 * What the panel configures: a component id, or `SHEET_DESTINATION` for the
	 * layout itself.
	 */
	readonly selection: string;
	/** Remember what is selected. Does not redraw. */
	setSelection(id: string): void;
	/**
	 * The containers the tree draws shut, by component id
	 * (`docs/features/layout-editor-tree.md` §4). Posture for the reason the
	 * selection is: it changes nothing in the layout and belongs to the pane, so
	 * the tree reads it at render time and never keeps a copy.
	 */
	readonly collapsed: ReadonlySet<string>;
	/**
	 * Remember which containers are shut. Does not redraw, like `setSelection`,
	 * and a set equal to the one held changes nothing — the tree calls this on
	 * every render, and only a real change is worth asking the workspace to save.
	 */
	setCollapsed(ids: Iterable<string>): void;
	/** Rebuild both regions from the layout as it now stands. */
	redraw(): void;
	/** Refresh every open sheet view, after a write to the layout file. */
	refreshSheets(): void;
	/**
	 * Let every open sheet write what it is holding, before this pane rewrites
	 * the notes underneath them.
	 *
	 * An open sheet's edits reach disk through a two-second debounce, so what a
	 * vault scan reads is not what the reader has typed
	 * (`docs/features/component-rename-migration.md` § Design, "Open sheets").
	 * Two callers: the migration, which rewrites the notes, and a level list's
	 * reorder report, which only counts them and so has to count what a sheet
	 * is still holding. Every other write this pane makes is to the layout
	 * file, which no sheet is the editor of.
	 */
	flushSheets(): Promise<void>;
	/**
	 * Re-read every open sheet from its file, and redraw. The pair of
	 * `flushSheets` above, for after the notes have been rewritten: a sheet
	 * refreshed from its own memory draws the renamed component blank and then
	 * saves the old heading back over the migration.
	 */
	reloadSheets(): Promise<void>;
}

/** The two regions of the pane, and which one a thing is drawn into. */
interface Regions {
	/** The picker, the schematics, the tree and the add row. */
	outline: HTMLElement;
	/** The settings of whatever is selected. */
	panel: HTMLElement;
}

/**
 * The outline of the layout editor: the picker naming which layout is open, the
 * schematics of the grids it holds, the tree of everything in it, and the row
 * that adds one. Knows no component types — the panel beside it builds a form
 * from each `configFields` declaration, and `config-panel.ts` is what draws it —
 * and knows nothing about a leaf either: it renders into an element it is
 * handed, and asks its host for the two pieces of posture that are the pane's to
 * remember.
 *
 * It still owns the *render*, which is why the class is not named for the
 * outline alone: it loads the file, draws both regions, and applies the pending
 * focus and flash afterwards. What it no longer holds is the configuration of
 * whatever is selected (`docs/PATTERNS.md` §11), nor the **Layout file** row and
 * its file operations, which `layout-file-row.ts` draws.
 *
 * Text fields commit on change (blur or Enter), never per keystroke, and
 * invalid input shows an inline error instead of being silently ignored.
 */
export class LayoutEditorSection {
	private plugin: SheetsmithPlugin;
	private host: LayoutEditorHost;
	private redraw: () => void;
	private file: TFile | null = null;
	private layout: Layout | null = null;
	/**
	 * The entry being dragged, in whichever list is mid-drag. One cursor for
	 * every list in the pane, so a drag started in one is never read as a drop
	 * into another; the list editors in list-fields.ts share this object.
	 */
	private drag: { index: number | null } = { index: null };
	/**
	 * The component id mid-drag in the tree, shared with `tree.ts` the way
	 * `drag` above is shared with `list-fields.ts` — a drag started on one
	 * row has to be read by whichever row the pointer ends up over.
	 */
	private treeDrag: { id: string | null } = { id: null };
	/** Focus token to apply after the next render, e.g. a newly added row. */
	private pendingFocus: string | null = null;
	/** Region to mark after the next render, e.g. fields a type change built. */
	private pendingFlash: string | null = null;
	/** The pane's own element, for the updates that must not rebuild it. */
	private rootEl: HTMLElement | null = null;
	/** The two regions of the last render, or null before the first. */
	private regions: Regions | null = null;
	/** The layout's live render and its gestures (`docs/features/grid-canvas.md`). */
	private canvas: Canvas;
	/**
	 * What **Add component** opens (`docs/features/component-picker.md`). Built
	 * once, like the canvas, because it holds posture a redraw must keep: open,
	 * the query, the active line, the destination and its last report.
	 */
	private picker = new ComponentPicker();
	/**
	 * Inline errors, by the focus token of the field showing them. A redraw
	 * tears down the DOM they live in, so an error on one field would vanish
	 * because an unrelated field was corrected — the message goes with the
	 * field, not with the render that happened to draw it.
	 */
	private fieldErrors = new Map<string, string>();
	/**
	 * The name suggesters bound by the current render, so the next one can close
	 * them before it empties the container.
	 *
	 * Held here rather than in the panel for `fieldErrors`' own reason one line
	 * up: what outlives a render belongs to the thing that owns the render loop.
	 * The failure it prevents is narrow and real — an input removed while its
	 * popup is open fires no `blur`, because a removed focused element does not,
	 * so **Undo layout edit** pressed with a list up would leave that list
	 * stranded at the notice layer over a pane that no longer holds the field.
	 */
	private suggests: FormulaSuggest[] = [];
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;
	/** The panel drawing whatever is selected, and the fields it holds. */
	private panel: ConfigPanel;
	/** What the **Layout file** row reads and asks for, built once like the panel. */
	private fileRow: LayoutFileRowHost;
	/**
	 * The layout's bytes as the file is known to hold them: what the initial
	 * read produced, or what the last write that *landed* wrote. Set nowhere
	 * else, so it never holds text that was not written
	 * (`docs/features/unsaveable-layout.md` §2).
	 *
	 * The undo stack's baseline. `persist` cannot diff against `this.layout`
	 * itself, because every mutation site has already changed it in place by
	 * the time `persist` runs — this is the only record of what the file held
	 * *before* a write, which is exactly what a step needs to push. Null before a
	 * layout has been loaded.
	 */
	private onDisk: string | null = null;
	/**
	 * The bytes the file will hold once every write in flight has landed: the
	 * last text `persist` sent, or `onDisk` where none is out. What a guard
	 * taken at a commit compares against, since it has to be known before the
	 * write resolves.
	 */
	private expected: string | null = null;
	/**
	 * The texts of the writes still in flight, so the pane's own write coming
	 * back through the vault's `modify` is recognised by `holds()` before it has
	 * landed. A list rather than a set: two writes may carry the same bytes.
	 */
	private inFlight: string[] = [];
	/**
	 * The last write's turn. Writes go to the vault one at a time, in the order
	 * they were made, so the last one to land is the last one made and `onDisk`
	 * follows the file rather than the order two promises happened to settle in.
	 */
	private queue: Promise<void> = Promise.resolve();
	/**
	 * Whether the canvas is drawn with each component's own sample values
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * **Per pane, on for a pane that has just opened, and never written
	 * anywhere.** It is posture rather than content — no layout key, no
	 * frontmatter key, no preference — so `persist` is not called for it and the
	 * settings tab does not offer it: a third row there would be a persisted
	 * answer to a question that only exists while a pane is open. It lives here
	 * rather than on `LayoutEditorHost` because nothing outside this class asks
	 * it, unlike the two the pane owns; a redraw for any other reason keeps it,
	 * and closing the pane forgets it.
	 *
	 * On by default, because an empty canvas is the state that *hides* what a
	 * preview exists to reveal — a column too narrow for its number, a table that
	 * pushes its neighbour off the grid, a formula that reads fine at zero — and
	 * the row above the canvas turns it off in one press.
	 */
	private sampleValues = true;
	/** Undo and redo history, one snapshot per `persist` that changed a byte. */
	private undoStack = new UndoStack<Snapshot>();
	private redoStack = new UndoStack<Snapshot>();
	/**
	 * Why the layout this pane holds is not on disk, or null where it is
	 * (`docs/features/unsaveable-layout.md` §2). Set by a `persist` that could
	 * not write, cleared by one that could, and drawn as a standing block in
	 * the outline for as long as it lasts.
	 */
	private unsaved: Unsaved | null = null;
	/** Where the standing block is drawn, repainted in place rather than by a rebuild. */
	private unsavedSlot: HTMLElement | null = null;
	/**
	 * Every write still in flight. `release` waits for all of them before it
	 * decides whether the layout it is letting go of was saved, so a write that
	 * lands after the pane has moved on can neither be missed nor land on the
	 * next file's state.
	 */
	private writes = new Set<Promise<boolean>>();
	/**
	 * How many author edits have been made, counted where one changes the
	 * layout's bytes or is refused for holding one that will not save. What a
	 * deferred undo or redo compares against, so a commit made between the press
	 * and the writes landing is not the one it takes back.
	 */
	private commits = 0;
	/** A `release` still waiting on its writes, which a render waits for in turn. */
	private releasing: Promise<void> | null = null;

	/**
	 * Debounced persist, used only by rapid-fire paths (keyboard nudging).
	 *
	 * `nudgePending` says whether it is holding a write, which the debouncer
	 * cannot: Obsidian's `Debouncer` offers `run` and `cancel` and no way to ask.
	 * The one reader is an outside change to the file, which drops a pending
	 * edit rather than writing it and has to know whether there was one to say
	 * so (`discardPending`).
	 */
	private persistSoon = debounce(
		() => {
			this.nudgePending = false;
			void this.persist();
		},
		500,
		true,
	);
	private nudgePending = false;

	constructor(plugin: SheetsmithPlugin, host: LayoutEditorHost) {
		this.plugin = plugin;
		this.host = host;
		// A redraw tears the pane down and builds the function library back from
		// the layout, so anything typed into it has to be read out first or it
		// is gone. Blur is not enough on its own: a press on a canvas block
		// cancels its pointerdown, so the textarea keeps the focus through the
		// press, and the redraw its selection causes runs before the block takes
		// the focus at the end of the gesture — by then the textarea being
		// blurred is a fresh one, and the typed definition would be gone.
		// Wrapped here rather than guarded at each call site — there are a
		// dozen, and the one that gets missed is the one that loses a library.
		this.redraw = () => {
			this.flush();
			// The control the author is standing in, so the rebuild does not drop
			// them on the body. The focus token is this module's own convention,
			// which is why restoring across a rebuild is this module's job and
			// not the pane's — the pane owns the scroll, which is the half it can
			// see. Only where nothing has already asked: a list field that just
			// added a row wants focus on the row, not on the button that made it.
			this.pendingFocus ??= this.focusedToken();
			host.redraw();
		};
		// What the canvas reads `sampleValues` through, declared out here because a
		// getter cannot be an arrow and `this` inside the object literal below is
		// the host rather than this section.
		const samplesOn = (): boolean => this.sampleValues;
		// Arrow functions throughout, for the reasons `redraw` above states for
		// itself and `persist` states for the `void`: `this.persist` is async and
		// `no-misused-promises` refuses a promise-returning function where a void
		// return is expected, measured rather than assumed — `.bind(this)` there
		// fails lint. The rest are arrows to match, so the block reads as one
		// mapping rather than a mix of two kinds.
		this.canvas = new Canvas({
			persist: () => void this.persist(),
			persistSoon: () => {
				this.nudgePending = true;
				this.persistSoon();
			},
			// Delegated rather than answered here: those four fields are the
			// panel's own, minted under the panel's own token, so finding them
			// again from out here would be this half querying for controls the
			// other half drew.
			syncPositionFields: (config) => this.panel.syncPositionFields(config),
			select: (id) => this.select(id),
			get selection(): string {
				return host.selection;
			},
			// The live answer rather than a copy taken when the canvas was
			// constructed, which is the same rule `selection` above follows.
			get sampleValues(): boolean {
				return samplesOn();
			},
		});
		// The same mapping one region over, and the same reasons for the arrows.
		// `errors` is the exception and deliberately not a getter: the panel is
		// handed the map itself, so both halves write into one map rather than two
		// answering the same question.
		this.panel = new ConfigPanel({
			persist: (rename) => void this.persist(true, rename),
			renameRefusal: () => this.renameRefusal(),
			redraw: () => this.redraw(),
			redrawSchematics: () => this.canvas.redraw(),
			// The canvas reads `layout.columns` itself on every draw, so there is
			// nothing left for this to write — `redrawSchematics` right after it
			// is what actually shows the new count. Kept on `ConfigPanelHost`
			// rather than removed, since `config-panel.ts` is unchanged by this
			// feature and the field still names a real question the panel asks.
			setGridColumns: () => undefined,
			errors: this.fieldErrors,
			listContext: () => this.listContext(),
			suggestNames: (input, owner) => this.suggestNames(input, owner),
			persistReorder: (label, sentence) => this.persistReorder(label, sentence),
		});
		// The row's host, and the same mapping again. `redraw` is the wrapped one
		// above rather than the host's, for the flush and the focus it adds, and
		// the two getters stay live because the trash reads them after a confirm
		// modal rather than when the row was drawn.
		this.fileRow = {
			app: plugin.app,
			get folder(): string {
				return plugin.settings.layoutFolder;
			},
			get layoutFile(): TFile | null {
				return host.layoutFile;
			},
			openLayoutFile: (file) => host.openLayoutFile(file),
			redraw: () => this.redraw(),
		};
	}

	/**
	 * Bind the formula-name suggester to one input, and remember it.
	 *
	 * A command on the host rather than an `App` handed down, so neither the
	 * panel nor the two field modules learns that a suggester exists or needs an
	 * app to build one — the same shape `confirm` already takes for a modal.
	 */
	private suggestNames(input: HTMLInputElement, owner?: string): void {
		this.suggests.push(
			attachFormulaSuggest(
				this.plugin.app,
				input,
				() => this.vocabulary(),
				owner,
			),
		);
	}

	/**
	 * What the layout publishes, read fresh on every query a popup answers.
	 *
	 * A thunk rather than a value, so the list reflects the layout as it now
	 * stands — a column key renamed in the list above is offered by the field
	 * below it without the pane having to rebuild — and so nothing assembles the
	 * name tree on a keystroke that no popup is open for.
	 */
	private vocabulary(): Vocabulary {
		const layout = this.layout;
		if (layout === null) return { components: [], functions: new Map() };
		return {
			components: walkLayout(layout.components).map((entry) =>
				vocabularySource(entry.config, getComponent(entry.config.type)),
			),
			functions: parseFunctions(layout.functions).library,
		};
	}

	/** The focus token of whatever is focused inside the pane, if anything. */
	private focusedToken(): string | null {
		const active = this.rootEl?.ownerDocument.activeElement;
		if (!active?.instanceOf(HTMLElement)) return null;
		if (!this.rootEl?.contains(active)) return null;
		return active.dataset.sheetsmithFocus ?? null;
	}

	/** Write any pending edit now. Called before a redraw, and on tab close. */
	flush(): void {
		// The panel's two textarea fields are read rather than waited on, and
		// either can be holding an edit when the pane closes. Which fields those
		// are is the panel's to know; that they are read before the write is
		// this method's.
		if (this.panel.commitPending()) void this.persist();
		this.persistSoon.run();
	}

	/**
	 * Let go of the loaded layout, so the next render reads it fresh.
	 *
	 * Flushes first, and that order is the whole point of the method: a
	 * pending edit belongs to the layout being released, and `persist` writes
	 * `this.layout` to `this.file`. Clear those first and the commit lands on
	 * an object nothing will ever write, silently.
	 *
	 * **It waits for every write in flight**, the flush's own and any earlier
	 * one, **Try again** included, before it asks whether the layout was saved
	 * (`docs/features/unsaveable-layout.md` §4). A layout still not on disk after
	 * that is kept in the plugin's store under the path being left, never the
	 * path being opened, and one notice says so and offers a copy. Nothing asks
	 * before leaving: a pane here never blocks it.
	 *
	 * **`write` is false for a file that is gone**, and only then: a pending
	 * edit has nowhere to land when the file was deleted underneath the pane,
	 * and writing it would put the file back. The pane's own `onUnloadFile` is
	 * the caller and the one that knows which case it is in. An unsaved layout
	 * there has nowhere to be kept, so the notice says it went and offers the
	 * copy.
	 *
	 * The pane calls this on every real change of which file is open — the
	 * dropdown, **New layout**, the trash, a file opened from anywhere Obsidian
	 * opens one, a delete from outside — so this is also where the undo history
	 * is scoped per layout (`docs/features/editor-undo.md`): an author's undo
	 * posture belongs to the file they were editing, and Mod+Z reaching across
	 * a switch to rewrite a *different* layout would be a worse surprise than an
	 * empty stack. A rename is not a change of file and does not come here.
	 */
	async release(write = true): Promise<void> {
		const run = this.letGo(write);
		this.releasing = run;
		try {
			await run;
		} finally {
			if (this.releasing === run) this.releasing = null;
		}
	}

	/** `release`'s body, apart so a render can wait for it by one promise. */
	private async letGo(write: boolean): Promise<void> {
		const file = this.file;
		if (write) {
			this.flush();
			await this.settled();
		} else {
			this.discardPending();
		}
		if (file !== null && this.file === file) this.keepUnsaved(file, write);
		this.forget();
		this.file = null;
	}

	/** Wait until no write this pane started is still in flight. */
	private async settled(): Promise<void> {
		while (this.writes.size > 0) await Promise.all([...this.writes]);
	}

	/**
	 * Keep the layout this pane could not write, or say it went where it
	 * cannot be kept. Nothing to do where the layout is on disk.
	 *
	 * **Nothing once the plugin has stopped**: the unload has already given this
	 * layout its one notice, so a pane closing afterwards adds neither an entry
	 * nor a second sentence.
	 */
	private keepUnsaved(file: TFile, write: boolean): void {
		const unsaved = this.unsaved;
		const store = this.plugin.unsavedLayouts;
		if (unsaved === null || this.layout === null || store.stopped) return;
		const text = serialiseLayout(this.layout);
		if (!write) {
			offerLayoutCopy(deletedSentence(file.basename), file.basename, text, 0);
			return;
		}
		store.keep(file.path, { ...unsaved, base: this.onDisk ?? '', text });
		offerLayoutCopy(keptSentence(file.basename), file.basename, text, UNDO_TIMEOUT);
	}

	/**
	 * The pane's own serialisation of an unsaved layout it holds, or null where
	 * it holds none — what the plugin's unload offers to copy.
	 */
	unsavedText(): string | null {
		if (this.unsaved === null || this.layout === null) return null;
		return serialiseLayout(this.layout);
	}

	/**
	 * Take the file's new contents rather than what this pane holds, because
	 * something else wrote it (`docs/features/visible-layout-files.md`).
	 *
	 * **A pending edit is dropped, not written.** Writing it would overwrite the
	 * very change the pane has just been told about, which is the lost update
	 * this exists to prevent; so what the reader had not yet committed goes. So
	 * does a layout the pane could not write (`docs/features/unsaveable-layout.md`
	 * §4): the disk wins, as it always has. **Both stacks go too**: a step
	 * recorded against the old contents would restore text nobody on disk ever
	 * had.
	 *
	 * Returns the text dropped — the pane's serialisation once a pending edit is
	 * folded in — or null where nothing was, so the one sentence the pane shows
	 * about it can offer the copy.
	 *
	 * The file stays bound, so the next render reads it again.
	 */
	reload(): string | null {
		const pending = this.discardPending();
		const dropped =
			(pending || this.unsaved !== null) && this.layout !== null
				? serialiseLayout(this.layout)
				: null;
		this.forget();
		return dropped;
	}

	/**
	 * Whether `text` is what this pane last wrote or loaded — the test for a
	 * `modify` that is the pane's own write coming back rather than somebody
	 * else's. By content rather than by a "saving" flag, because a flag cannot
	 * tell two quick writes of this pane's apart from one outside write between
	 * them, and content can.
	 */
	holds(text: string): boolean {
		return (this.onDisk !== null && text === this.onDisk) || this.inFlight.includes(text);
	}

	/** Drop the loaded layout and its history, keeping which file it is. */
	private forget(): void {
		this.layout = null;
		this.onDisk = null;
		this.expected = null;
		this.unsaved = null;
		this.undoStack.clear();
		this.redoStack.clear();
		// Closed and cleared where the undo history is, which is the same moment:
		// the picker's posture belongs to the layout it was adding to.
		this.picker.reset();
	}

	/**
	 * Throw away whatever edit is still waiting to be written, and say whether
	 * there was one.
	 *
	 * The panel's textareas are read through `commitPending`, which folds what
	 * was typed into `this.layout` — about to be dropped by every caller — so
	 * reading them is how "was anything typed" gets answered without a second
	 * copy of which fields those are.
	 */
	private discardPending(): boolean {
		const typed = this.layout !== null && this.panel.commitPending();
		const nudged = this.nudgePending;
		this.persistSoon.cancel();
		this.nudgePending = false;
		return typed || nudged;
	}

	/**
	 * Every component in the layout, flattened.
	 *
	 * Ids and labels are unique across the whole sheet whatever a component sits
	 * inside — a label still keys a section in a flat note — so anything checking
	 * one has to look here rather than at a single level.
	 */
	private allComponents(): ComponentConfig[] {
		return walkLayout(this.layout?.components ?? []).map(
			(entry) => entry.config,
		);
	}

	/**
	 * Draw the editor into the element it is handed.
	 *
	 * Two regions, and which side a thing goes on is the design's one structural
	 * rule: the left column is everything about *where* — the picker, the grids,
	 * the tree of what the layout holds — and the panel is everything about the
	 * one thing selected. That is what puts nothing between a container's row
	 * and the rows of what it holds, which a form drawn under its own row could
	 * not avoid (`docs/UI.md` §12).
	 */
	async render(container: HTMLElement): Promise<void> {
		// A release still waiting on its writes decides what the file being left
		// keeps, and it reads this pane's state to do it: a render that went ahead
		// would forget that state underneath it (`docs/features/unsaveable-layout.md`
		// §4). Only the newest render waiting goes on.
		if (this.releasing !== null) {
			const waiting = ++this.renderId;
			await this.releasing;
			if (waiting !== this.renderId) return;
		}
		// Before anything is drawn or torn down: a popup outlives the input it
		// hangs off, and the pane rebuilds every input it has.
		this.closeSuggests();
		this.rootEl = container;
		// The query container the two-column rule reads, and it has to be an
		// ancestor of the grid rather than the grid itself: an element cannot
		// query its own width.
		container.addClass('sheetsmith-layout-editor-pane');

		const folder = this.plugin.settings.layoutFolder;
		const files = listLayouts(this.plugin.app, folder);
		const open = this.host.layoutFile;

		// Only where there is nothing to show at all. A pane open on a file
		// outside the folder has something to show even when the folder is
		// empty, so it draws the picker with that one file in it.
		if (open === null && files.length === 0) {
			this.renderVacant(container);
			return;
		}

		// The file the pane is bound to, taken as given. Nothing here resolves
		// or corrects it: which file is open is the view's, and a different one
		// is only ever asked for (`LayoutEditorHost`). What this does is notice
		// that the host has moved on, which is also how a first render loads.
		if (this.file !== open) {
			this.forget();
			this.file = open;
		}

		const grid = container.createDiv('sheetsmith-layout-editor');
		// The left column exists from here, because the picker goes in it and the
		// picker is how an author leaves a layout they cannot edit. **The panel
		// does not**, and that is the point rather than an ordering accident:
		// every path that gives up below draws its message here and returns, and
		// a panel created in advance would leave the two-column rule reserving
		// 620px of empty pane beside one line of error text. The rule is keyed on
		// the panel being there, so not drawing one is the whole of the fix.
		const outline = grid.createDiv('sheetsmith-editor-outline');
		this.regions = null;

		renderLayoutFileRow(outline, files, this.fileRow);
		if (open === null) return;

		if (this.layout === null) {
			const run = ++this.renderId;
			let source: string;
			try {
				source = await this.plugin.app.vault.read(open);
			} catch (error) {
				if (run !== this.renderId || this.file !== open) return;
				// Where the tree would be, under the picker rather than over it.
				// The order is load bearing: the picker is how an author leaves a
				// layout they cannot edit, so a message that displaced it would
				// trap them on the broken one.
				outline.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`"${open.basename}" cannot be read: ${messageOf(error)}`,
					),
				);
				return;
			}
			// A redraw may have rebuilt the pane while the read was in flight,
			// or the pane moved to another file; only the newest run, still on
			// the file it read, may append.
			if (run !== this.renderId || this.file !== open) return;
			// A layout this pane let go of unsaved comes back, but only onto the
			// bytes it was kept against: anything else means the file was
			// written meanwhile, and the disk wins.
			const kept = this.plugin.unsavedLayouts.take(open.path);
			if (kept !== undefined && kept.base === source) {
				// Nothing is written, since opening a file never writes; the block
				// says where the edits are.
				this.layout = this.restoreHeld(kept.text);
				this.onDisk = source;
				this.expected = source;
				this.unsaved = { reason: kept.reason, message: kept.message };
			} else {
				if (kept !== undefined) {
					offerLayoutCopy(
						changedWhileClosedSentence(open.basename),
						open.basename,
						kept.text,
						0,
					);
				}
				try {
					this.layout = parseLayout(source);
				} catch (error) {
					this.layout = null;
					// Named, because the pane now opens on whatever file the reader
					// clicked, from anywhere Obsidian opens one — so "this layout"
					// could be a file they did not know was one. Nothing is written
					// in this state: `persist` returns without a parsed layout, and
					// what recovers the pane is the view's reload on an outside fix.
					outline.createDiv('sheetsmith-error', (el) =>
						el.setText(
							`"${open.basename}" cannot be edited until its file is fixed: ${messageOf(error)}`,
						),
					);
					return;
				}
				// The undo baseline for this freshly loaded layout. Constraint 3
				// makes `source` itself safe to use rather than re-serialising: a
				// parse then serialise with nothing changed is byte-identical.
				this.onDisk = source;
				this.expected = source;
			}
		}
		const layout = this.layout;

		// Past every giving-up path, so this is where the second column earns its
		// track.
		const panel = grid.createDiv('sheetsmith-editor-panel');
		// What the two-column rule keys on. It used to read
		// `:has(> .sheetsmith-editor-panel)`, which was true by construction and
		// needed nobody to remember this line; the class is the same fact stamped
		// by hand, and it is stamped *here* — the one statement that creates a
		// panel — so the two cannot disagree without this line being deleted.
		grid.addClass('sheetsmith-editor-split');
		this.regions = { outline, panel };

		// A selection naming nothing falls back to the layout's own settings,
		// never to the first component: landing an author in a form nobody chose
		// is the failure the reset binding's dropdown already guards against.
		const selected = this.selectedEntry(layout);
		if (selected === null && this.host.selection !== SHEET_DESTINATION) {
			this.host.setSelection(SHEET_DESTINATION);
		}

		// Directly under the **Layout file** row, where the pane already says a
		// file cannot be read or edited, and for their reason: the row is how an
		// author leaves, so nothing may displace it. Unlike those two, the rest of
		// the pane stays live (`docs/features/unsaveable-layout.md` §2).
		this.unsavedSlot = outline.createDiv();
		this.paintUnsaved();
		// Above the canvas it governs and under the picker, which is where the
		// pane's other two `Setting` rows sit — and only once there is a canvas
		// for it to govern, so the row never stands over the two states that
		// draw no layout at all.
		this.renderSampleRow(outline);
		// The canvas draws the whole tree live, in one pass, whatever is
		// selected — `docs/features/grid-canvas.md` §4 retires the old
		// selection-gated schematic here.
		this.canvas.draw(outline.createDiv(), layout);
		// Above the tree it adds into, not below it: a layout with a long
		// component list otherwise buries the one row that can grow it.
		this.picker.render(outline, layout, {
			insert: (choice, into) => this.insert(layout, choice, into),
			focusAfterRedraw: (token) => {
				this.pendingFocus = token;
			},
			redraw: () => this.redraw(),
		});
		const host = this.host;
		renderTree(outline, layout, {
			persist: () => void this.persist(),
			redraw: () => this.redraw(),
			select: (id) => this.select(id),
			// A snapshot rather than a live getter: every reader of this host
			// is either synchronous within this one render (the rows'
			// selected mark) or a later command with nothing to do with
			// selection, so there is no stale copy for a getter to avoid.
			selection: this.host.selection,
			focusAfterRedraw: (token) => {
				this.pendingFocus = token;
			},
			// Live, unlike the selection: the render writes a corrected set back
			// before it draws, and the rows drawn after that read the correction.
			get collapsed(): ReadonlySet<string> {
				return host.collapsed;
			},
			setCollapsed: (ids) => host.setCollapsed(ids),
			persistUndoable: (sentence) => this.persistUndoable(sentence),
			copy: (entry) => this.copyComponent(entry),
			paste: (entry, text, refuse) =>
				this.pasteFrom(text, refuse, (value) => this.pasteText(entry.config.id, value)),
			pasteConfiguration: (entry, refuse) =>
				this.pasteFrom(null, refuse, (value) =>
					this.pasteConfigurationText(entry.config.id, value),
				),
			drag: this.treeDrag,
		});

		this.panel.render(panel, layout, selected);

		this.restoreFieldErrors(container);

		if (this.pendingFlash !== null) {
			// Over the whole pane rather than the panel alone, since a paste
			// marks the tree row it landed at.
			this.flash(container, this.pendingFlash);
			this.pendingFlash = null;
		}

		if (this.pendingFocus !== null) {
			focusToken(container, this.pendingFocus);
			this.pendingFocus = null;
		}
	}

	/**
	 * Draw the standing block saying the layout is not saved, or nothing where
	 * it is (`docs/features/unsaveable-layout.md` §2).
	 *
	 * **In place, into the slot the render left**, so a refused commit or a
	 * **Try again** changes this block and nothing else: a rebuild would take
	 * the field the author is standing in with it, and the rename refusal's
	 * promise is that it lifts with no rebuild in between. Hidden while empty,
	 * so a saved layout draws exactly the outline it always did.
	 *
	 * `.sheetsmith-error` specialised rather than a new kind (`docs/UI.md` §9's
	 * inline error), with one ordinary button: **Try again** is a recovery, not
	 * the pane's primary action, so it is not a call to action.
	 */
	private paintUnsaved(): void {
		const slot = this.unsavedSlot;
		if (slot === null) return;
		slot.empty();
		const unsaved = this.unsaved;
		const file = this.file;
		slot.hidden = unsaved === null || file === null;
		if (unsaved === null || file === null) return;
		slot.createDiv('sheetsmith-error sheetsmith-editor-unsaved', (block) => {
			if (unsaved.reason === 'invalid') {
				block.setText(
					`Changes to "${file.basename}" are not saved, because this layout does not save as it stands. Fix this and the next edit saves them: ${unsaved.message}`,
				);
				return;
			}
			block.createDiv({
				text: `Changes to "${file.basename}" are not saved, because the file could not be written: ${unsaved.message}. They are kept here, and every edit tries again.`,
			});
			new ButtonComponent(block)
				.setButtonText('Try again')
				.onClick(() => void this.retry())
				.buttonEl.dataset.sheetsmithFocus = 'unsaved-retry';
		});
	}

	/**
	 * **Try again**: write the held layout as one recorded step, then put focus
	 * where it can still land — the layout picker once the block has gone, the
	 * button again where the vault still refuses.
	 */
	private async retry(): Promise<void> {
		const saved = await this.persist();
		const root = this.rootEl;
		if (root === null) return;
		focusToken(root, saved ? 'layout-picker' : 'unsaved-retry');
	}

	/** Why a rename may not be committed now, or null where it may. */
	private renameRefusal(): string | null {
		return this.unsaved === null ? null : RENAME_REFUSED;
	}

	/**
	 * Record why the layout is not on disk, and say so where that is news.
	 *
	 * **The notice fires once per reason**: when the state begins, or its
	 * message changes. An edit refused for the same reason again says nothing,
	 * because the standing block is saying it — the notice that repeated on
	 * every later edit, quoting the first refusal, is what this replaces.
	 */
	private hold(unsaved: Unsaved): void {
		const before = this.unsaved;
		this.unsaved = unsaved;
		if (
			before === null ||
			before.reason !== unsaved.reason ||
			before.message !== unsaved.message
		) {
			new Notice(
				unsaved.reason === 'invalid'
					? unsaved.message
					: `Sheetsmith could not save this layout: ${unsaved.message}`,
			);
		}
		this.paintUnsaved();
	}

	/**
	 * The vault holds no layouts yet, which is the one state with no tree and no
	 * panel to draw.
	 *
	 * Centred on the pane rather than left as a row in the top-left corner. In a
	 * settings tab a row is what everything else looks like; on a surface of its
	 * own it is one line stranded in an empty rectangle.
	 */
	private renderVacant(container: HTMLElement): void {
		container.createDiv('sheetsmith-editor-vacant', (vacant) => {
			vacant.createDiv({
				cls: 'setting-item-description',
				text: 'No layouts yet.',
			});
			new ButtonComponent(vacant)
				// The same gesture and the same words as the row's button, which
				// is what makes the modal's **Start from** row the one place
				// cold-start import is reachable from. A CTA here, unlike on the
				// row, because here it is the only thing on screen.
				.setButtonText(NEW_LAYOUT_LABEL)
				.setCta()
				.onClick(() => promptForNewLayout(this.fileRow));
		});
	}

	/**
	 * The walk entry for the selected component, or null where the layout itself
	 * is selected — and also where the selection names a component the layout no
	 * longer holds, which reads the same way and is corrected by the caller.
	 */
	private selectedEntry(layout: Layout): WalkEntry | null {
		if (this.host.selection === SHEET_DESTINATION) return null;
		return (
			walkLayout(layout.components).find(
				(entry) => entry.config.id === this.host.selection,
			) ?? null
		);
	}

	/**
	 * Close every name-suggestion popup the last render bound, and forget them.
	 *
	 * **`close()` rather than waiting for a `blur`**, which is the whole reason
	 * this exists: a focused element that is *removed* fires no `blur`, so a
	 * redraw driven from the keyboard — **Undo layout edit** with a list up —
	 * would leave the popup at the notice layer over a pane that no longer holds
	 * the field it describes. The platform's class offers no teardown, and
	 * `close()` is a declared public member of `PopoverSuggest` and idempotent.
	 */
	private closeSuggests(): void {
		for (const suggest of this.suggests) suggest.close();
		this.suggests = [];
	}

	/**
	 * Put back the inline errors whose field is still on screen, and forget
	 * the ones whose field is gone — a message about a control that no longer
	 * exists is worse than no message.
	 */
	private restoreFieldErrors(container: HTMLElement): void {
		if (this.fieldErrors.size === 0) return;
		for (const [token, message] of [...this.fieldErrors]) {
			const input = container.querySelector(
				`[data-sheetsmith-focus="${CSS.escape(token)}"]`,
			);
			if (input?.instanceOf(HTMLInputElement)) {
				showFieldError(input, message, this.fieldErrors);
			} else {
				this.fieldErrors.delete(token);
			}
		}
	}

	/**
	 * The **Sample values** row: whether the canvas is filled or empty
	 * (`docs/features/preview-sample-values.md` §3).
	 *
	 * **A row of the pane's own chrome, not a field in the configuration
	 * panel**, even though the Layout row's panel is where a layout's own
	 * settings live: everything in that panel writes the layout file, and this
	 * writes nothing. A view-state switch among fields that persist is a
	 * confusion worth one row of chrome to avoid.
	 *
	 * Toggling redraws the canvas and nothing else — no `persist`, so no undo
	 * step, and the tree's selection, the panel's fields and the scroll position
	 * all survive it. The focus token is what puts an author back on this control
	 * when a full pane redraw happens for some other reason.
	 */
	private renderSampleRow(container: HTMLElement): void {
		new Setting(container)
			.setName('Sample values')
			// The second sentence is the one worth having: the first thing a
			// cautious author wonders on seeing numbers appear is whose they are.
			.setDesc(
				'Draw the canvas with example values instead of an empty character\'s. Nothing is written to any note.',
			)
			.addToggle((toggle) => {
				toggle.setValue(this.sampleValues);
				toggle.toggleEl.dataset.sheetsmithFocus = 'sample-values';
				toggle.onChange((value) => {
					this.sampleValues = value;
					this.canvas.redraw();
				});
			});
	}

	/**
	 * Mark a region the last interaction rebuilt, and let the mark fade.
	 * Colour only, so there is nothing here for reduced motion to strip.
	 */
	private flash(scope: HTMLElement, token: string): void {
		const el = scope.querySelector(
			`[data-sheetsmith-flash="${CSS.escape(token)}"]`,
		);
		if (!el?.instanceOf(HTMLElement)) return;
		el.addClass('sheetsmith-flash');
		el.win.setTimeout(() => el.removeClass('sheetsmith-flash'), FLASH_HOLD);
	}

	/**
	 * Put the component a picker line describes into the layout, select it and
	 * persist; the picker redraws once it has written its report. Returns the
	 * label the component was given.
	 *
	 * Moved out of the old **Add** button without changing what it writes
	 * (`docs/features/component-picker.md` §7): a bare type writes `config: {}`
	 * and never its `example`, which is why the picker labels an example.
	 */
	private insert(
		layout: Layout,
		choice: PickerChoice,
		parent: ComponentConfig | null,
	): string {
		// `children` is shared config the editor owns, so this is where a
		// container becomes one: a component holds the key only once something
		// has been put in it.
		const list = parent === null ? layout.components : (parent.children ??= []);
		// Checked against the whole sheet, not this list: a label keys a note
		// section and an id is what a formula writes, and containment scopes
		// neither.
		const all = this.allComponents();
		// The line's own name, so an author who chose "Checkbox" has a component
		// called Checkbox until they rename it.
		const label = uniqueLabel(choice.name, all);
		// A tab has no placement, so the numbers written here are not read by
		// anything — but they are still in the file, and a hand-editor reading
		// `row: 4` on a tab would reasonably conclude it sits somewhere. The
		// container's own size is the honest thing to write: it is the box the
		// tab actually fills. `parsePosition` requires all four, which is why this
		// is a sensible value rather than no key.
		//
		// It goes stale the moment the container is resized, and nothing keeps it
		// in step on purpose: every drawing asks `innerPlacement` for the live box
		// instead. Do not add a sync — reading this number was the bug, not
		// writing it.
		list.push({
			// The prefill first, so nothing an entry carries can displace what the
			// editor owns. The type forbids those keys outright; this is the spread
			// order that makes the refusal true at runtime as well.
			...choice.config,
			id: uniqueId(label, all),
			type: choice.type,
			label,
			position: childIsPlaced(parent)
				? {
						col: 1,
						row: nextFreeRow(list),
						// Never wider than the grid it lands on. A child spanning
						// past its container's last column would open an implicit
						// column and take the alignment with it.
						width: Math.min(2, parent?.position.width ?? 2),
						height: 1,
					}
				: { ...(parent as ComponentConfig).position, col: 1, row: 1 },
		});
		const added = list[list.length - 1];
		if (added !== undefined) this.host.setSelection(added.id);
		const file = this.file;
		void this.persist().then((saved) => {
			// A layout that did not save has adopted nothing; the picker's status
			// line keeps saying what was added, and this is a notice beside it.
			if (!saved || added === undefined || !this.mayAdopt(file)) return;
			return reportAdoption(this.plugin.app, file.basename, sectionLabels(added));
		});
		return label;
	}

	/**
	 * Whether a component landing on a label in `file` may be showing a section
	 * some note kept (`docs/features/new-component-adopts-retained-section.md`):
	 * only where the file is the layout its name resolves to, since a note names
	 * a layout by that name. The rename migration's own gate, for its reason.
	 */
	private mayAdopt(file: TFile | null): file is TFile {
		return (
			file !== null &&
			isResolvedLayout(this.plugin.app, this.plugin.settings.layoutFolder, file)
		);
	}

	/**
	 * Write an edit from the tree — a removal or a paste — then say what it did
	 * and offer to take it back (`docs/features/layout-editor-tree.md` §5,
	 * `docs/features/component-copy-paste.md` §4).
	 *
	 * **The undo is guarded by the bytes the edit left**, which is
	 * `SheetView.restoreDocument`'s guard read for a layout: an author who
	 * removed, then edited, then pressed a stale **Undo** would otherwise have
	 * the edit undone and not the removal. So the press undoes only while this
	 * pane still holds that file and that text, and says why it did nothing
	 * otherwise — a different layout opened in between is the same refusal,
	 * since the edit is not in its history.
	 *
	 * `persist` sets `expected` before it awaits the write, so the bytes are known
	 * here synchronously. Where the layout would not serialise, `persist` said
	 * so and wrote nothing, and there is nothing to offer an undo of.
	 *
	 * **A paste's sentence waits for a scan**, and the guard does not: `sentence`
	 * as a function is handed what `section-adoption.ts` found under `labels` —
	 * the sections character notes already hold under the pasted names — once the
	 * write has resolved, so the notice appears a moment later than it would, and
	 * its **Undo** is still guarded by the bytes taken here, before anything was
	 * awaited. A write that failed, or a file that is not its name's layout, is
	 * handed null and scans nothing.
	 */
	private persistUndoable(
		sentence: string | ((adoption: string | null) => string),
		labels: readonly string[] = [],
	): void {
		const step = this.persistStep();
		if (step === null) return;
		const { saving, file, written } = step;
		const offer = (text: string): void => this.offerGuardedUndo(text, file, written);
		if (typeof sentence === 'string') {
			offer(sentence);
			return;
		}
		void saving.then(async (saved) => {
			const adoption =
				saved && labels.length > 0 && this.mayAdopt(file)
					? await adoptionReport(this.plugin.app, file.basename, labels, 'pasted')
					: null;
			offer(sentence(adoption));
		});
	}

	/**
	 * Write the layout as an undoable step, and say which step it was: the write
	 * in flight, the file it went to, and the bytes it left — or null where no
	 * byte changed, so there is no step to report or to undo.
	 *
	 * The one spelling of what `persistUndoable` and `persistReorder` both need
	 * before they say anything. `persist` sets `expected` before its first
	 * `await`, so all three are known here synchronously, and a guard taken from
	 * them is taken before anything else can happen. The undo step itself is
	 * pushed when the write lands, so it is only ever bytes the file held.
	 */
	private persistStep(): {
		saving: Promise<boolean>;
		file: TFile | null;
		written: string | null;
	} | null {
		const before = this.expected;
		const saving = this.persist();
		const file = this.file;
		const written = this.expected;
		return written === before ? null : { saving, file, written };
	}

	/**
	 * Show `text` with an **Undo** that takes back the step which left `written`
	 * in `file`, and refuses once the pane holds anything else — the guard
	 * `persistUndoable` states, shared with `persistReorder` so the two cannot
	 * disagree about what a stale press does.
	 */
	private offerGuardedUndo(text: string, file: TFile | null, written: string | null): void {
		// The guard is read once the writes have landed, for `undo`'s reason: while
		// the edit's own write is out, `expected` already names it and its step is
		// not on the stack yet.
		offerUndo(text, () => {
			const press = (): void => {
				if (this.file !== file || this.expected !== written) {
					new Notice('Sheetsmith did not undo: this layout has changed since.');
					return;
				}
				void this.undo();
			};
			if (this.writes.size === 0) press();
			else void this.settled().then(press);
		});
	}

	/**
	 * Run an undo or a redo once every write in flight has landed, and answer
	 * whether it did anything.
	 *
	 * **Skipped, answering false, where the author has moved on**: the file being
	 * left or another opened, or another commit made between the press and the
	 * writes landing. A leave counts from the moment it begins, since it waits for
	 * the same writes: an undo landing on the file being left is the Mod+Z
	 * reaching across a switch that `docs/features/editor-undo.md` scopes the
	 * history per layout to prevent.
	 * The press was about the state on screen when it was made, and taking back
	 * whatever is on the stack by then would undo an edit nobody asked to undo.
	 * The count of commits is the test rather than the stack's top, because the
	 * write the press waited for pushes its own step when it lands, which is the
	 * step the press meant. False is what keeps the command silent: it says
	 * "Undone." only for an action that happened.
	 */
	private deferred(then: () => boolean | Promise<boolean>): Promise<boolean> {
		const file = this.file;
		const commits = this.commits;
		return this.settled().then(() =>
			this.file === file && this.releasing === null && this.commits === commits
				? then()
				: false,
		);
	}

	/**
	 * Write a commit to a level list, then say what it rereads
	 * (`docs/features/level-list-reorder-report.md`): the conditions and resets
	 * reading the list by position, which `sentence` already knows, and the
	 * character notes holding a section under `label`, which only the pane can
	 * count. `sentence` is handed that count, zero where nothing was counted,
	 * and returns null where the commit moved no level's meaning.
	 *
	 * **The notice waits for the scan, and its Undo does not**: the bytes are
	 * taken before anything is awaited, as `persistUndoable` takes them, and
	 * `persist` has pushed the step onto the undo stack by then.
	 *
	 * **The open sheets are flushed before the count**, as the rename path
	 * flushes them and for the reason it does: a value typed a moment ago is
	 * still inside a sheet's save debounce, and a scan missing it would report
	 * silence, which here is the all-clear. Nothing is rewritten afterwards, so
	 * nothing is reloaded.
	 *
	 * A write that failed counts nothing and offers no undo, since nothing was
	 * written; the clauses about conditions and resets still say what the list
	 * now means in memory. A file that is not its name's layout counts nothing
	 * either, `mayAdopt`'s gate for its reason — the notes naming this basename
	 * read some other file.
	 */
	private persistReorder(
		label: string,
		sentence: (notes: number) => string | null,
	): void {
		const step = this.persistStep();
		if (step === null) return;
		const { saving, file, written } = step;
		void saving.then(async (saved) => {
			let notes = 0;
			if (saved && label !== '' && this.mayAdopt(file)) {
				await this.host.flushSheets();
				notes = (await countAdoptions(this.plugin.app, file.basename, [label])).notes;
			}
			const said = sentence(notes);
			if (said === null) return;
			if (saved) this.offerGuardedUndo(said, file, written);
			else new Notice(said);
		});
	}

	/**
	 * Which layout file this is, as a copy's `from` records it and a paste
	 * compares it (`parse/component-clipboard.ts`): the vault's name and the
	 * file's path, hashed so neither is readable in the clipboard text.
	 */
	private fingerprint(file: TFile): string {
		return layoutFingerprint(this.plugin.app.vault.getName(), file.path);
	}

	/**
	 * Put a tree row's component on the clipboard
	 * (`docs/features/component-copy-paste.md` §3): the component and what it
	 * holds, and the little of this layout a paste elsewhere needs to say what
	 * the copy depends on. Writes nothing to the layout, so no undo step.
	 */
	private copyComponent(entry: WalkEntry): void {
		const layout = this.layout;
		const file = this.file;
		const root = this.rootEl;
		if (layout === null || file === null || root === null) return;
		const component = copiedComponent(entry);
		const text = encodeComponentCopy({
			from: { layout: file.basename, fingerprint: this.fingerprint(file) },
			component,
			context: copyContext(layout, component),
		});
		const label = entry.config.label;
		void writeClipboard(root.win, text).then((written) => {
			if (written) new Notice(`Copied "${label}" to the clipboard.`);
		});
	}

	/**
	 * Run a paste on text a `paste` event handed over, or on the clipboard read
	 * here for the menu — and where that read is missing or refused, open the box
	 * the text can be pasted into instead (§7). `apply` answers a refusal to
	 * draw, or null where the paste landed.
	 *
	 * **The box opens because the read failed, never because of the platform**,
	 * so a device whose read works never sees it, and Mod+V never needs it.
	 */
	private pasteFrom(
		text: string | null,
		refuse: (message: string) => void,
		apply: (text: string) => string | null,
	): void {
		if (text !== null) {
			const refusal = apply(text);
			if (refusal !== null) refuse(refusal);
			return;
		}
		void this.readClipboard().then((read) => {
			if (read === null) {
				new PasteBoxModal(this.plugin.app, apply).open();
				return;
			}
			const refusal = apply(read);
			if (refusal !== null) refuse(refusal);
		});
	}

	/**
	 * The clipboard's text, read through the pane's own window, or null where
	 * this device offers no read or refuses it. A read that returns text —
	 * any text, the empty string included — is a read, and the paste says what
	 * it found there.
	 */
	private async readClipboard(): Promise<string | null> {
		const clipboard = this.rootEl?.win.navigator.clipboard as
			| Partial<Clipboard>
			| undefined;
		if (typeof clipboard?.readText !== 'function') return null;
		try {
			return await clipboard.readText();
		} catch {
			return null;
		}
	}

	/** Whether a copy came from the file this pane has open. */
	private sameLayout(fingerprint: string, file: TFile): boolean {
		return fingerprint === this.fingerprint(file);
	}

	/**
	 * Decide a paste, writing nothing unless it is accepted
	 * (`docs/features/component-copy-paste.md` §8: nothing is written on a
	 * refusal).
	 *
	 * **Decided once before anything pending is written, and again after**,
	 * because a field still holding a typed edit — the function library, the
	 * triggers, the bonus types, or a nudge in its debounce — belongs on the
	 * layout the paste is made over, and writing it is a write. So a refused
	 * paste leaves that edit exactly as pending as it was; an accepted one lands
	 * it first, as its own step, and the paste is decided again over the layout
	 * that now carries it. Nothing a pending edit holds bears on where a paste
	 * lands or whether it is refused, so the second decision refuses only what
	 * the first would have.
	 */
	private decided<T extends object>(decide: () => T | { error: string }): T | { error: string } {
		const first = decide();
		if ('error' in first) return first;
		const typed = this.panel.commitPending();
		if (!typed && !this.nudgePending) return first;
		if (typed) void this.persist();
		this.persistSoon.run();
		return decide();
	}

	/**
	 * Paste clipboard text as the sibling after `after` (§4), or answer why not.
	 *
	 * The edit is decided on a clone by `paste.ts` and adopted only once it is
	 * whole, so a refusal leaves the pane's layout exactly as it was. The paste
	 * lands selected, marked, and with focus on its name, and is one undo step
	 * with a notice offering to take it back.
	 */
	private pasteText(after: string, text: string): string | null {
		const file = this.file;
		if (this.layout === null || file === null) return null;
		const read = readComponentCopy(text);
		if ('error' in read) return read.error;
		const same = this.sameLayout(read.copy.from.fingerprint, file);
		const pasted = this.decided(() =>
			this.layout === null
				? { error: '' }
				: pasteComponent(this.layout, after, read.copy, same),
		);
		if ('error' in pasted) return pasted.error;
		this.layout = pasted.layout;
		const id = pasted.root.id;
		this.host.setSelection(id);
		this.pendingFocus = `edit-${id}`;
		this.pendingFlash = `tree-${id}`;
		this.persistUndoable(
			(adoption) =>
				pasteSentence(
					pasted.root,
					pasted.dependencies,
					same ? undefined : read.copy.from.layout,
					adoption,
				),
			sectionLabels(pasted.root),
		);
		this.redraw();
		return null;
	}

	/**
	 * Paste clipboard text's configuration onto `onto` (§6), or answer why not.
	 * The component keeps its place, its name and its selection.
	 */
	private pasteConfigurationText(onto: string, text: string): string | null {
		const file = this.file;
		if (this.layout === null || file === null) return null;
		const read = readComponentCopy(text);
		if ('error' in read) return read.error;
		const same = this.sameLayout(read.copy.from.fingerprint, file);
		const pasted = this.decided(() =>
			this.layout === null
				? { error: '' }
				: pasteConfiguration(this.layout, onto, read.copy, same),
		);
		if ('error' in pasted) return pasted.error;
		this.layout = pasted.layout;
		this.host.setSelection(pasted.target.id);
		this.pendingFocus = `edit-${pasted.target.id}`;
		this.pendingFlash = `tree-${pasted.target.id}`;
		this.persistUndoable(
			configurationSentence(
				read.copy.component.label,
				pasted.target.label,
				pasted.keysLeft,
				pasted.dependencies,
			),
		);
		this.redraw();
		return null;
	}

	/**
	 * A `copy` or `paste` event on the pane's document: Mod+C or Mod+V on a tree
	 * row (`docs/features/component-copy-paste.md` §2, branch A).
	 *
	 * **On the document, because that is where the event goes.** With a
	 * `<button>` focused and no selection, the browser dispatches both to the
	 * body rather than to the button, so the view registers this on its own
	 * document and this answers only when that document's focus is one of *this*
	 * pane's tree name buttons — anything else, another pane's included, is left
	 * to whoever it belongs to. `preventDefault` then keeps the browser's own copy
	 * and paste out of it.
	 *
	 * **A paste event hands its text over synchronously and without asking**, on
	 * every platform, which makes the keyboard the most reliable read this
	 * feature has. A copy goes through the same write the menu's does.
	 *
	 * **Both events reach the document in the app**, which the vault check
	 * confirmed on macOS once a click on a row left focus on its name. It did
	 * not at first — the click dropped focus to the body, this returned before
	 * doing anything, and the first reading of that was that no `paste` event
	 * arrived. `tree.ts`'s row press now lands focus on the name.
	 */
	clipboardEvent(event: ClipboardEvent): void {
		const root = this.rootEl;
		if (root === null) return;
		const focused = root.ownerDocument.activeElement;
		if (focused === null || !root.contains(focused)) return;
		const row = clipboardRow(focused);
		if (row === null) return;
		event.preventDefault();
		if (event.type === 'copy') row.copy();
		else row.paste(event.clipboardData?.getData('text/plain') ?? '');
	}

	/** Select a component, or the layout itself, and rebuild both regions. */
	private select(id: string): void {
		// Pressing what is already selected does nothing at all, rather than
		// rebuilding what is already on screen. Deselecting to nowhere would
		// leave the panel empty and nothing is the wrong thing to configure; and
		// a redraw for no change would throw away a half-typed field and put the
		// focus back where it was for the sake of it.
		if (this.host.selection === id) return;
		this.host.setSelection(id);
		this.redraw();
	}

	/** What the list editors in list-fields.ts need from this editor. */
	private listContext(): ListContext {
		return {
			persist: (rename) => void this.persist(true, rename),
			renameRefusal: () => this.renameRefusal(),
			redraw: () => this.redraw(),
			focusAfterRedraw: (token) => {
				this.pendingFocus = token;
			},
			flashAfterRedraw: (token) => {
				this.pendingFlash = token;
			},
			confirm: (message, cta, onConfirm) =>
				new ConfirmModal(this.plugin.app, message, cta, onConfirm).open(),
			errors: this.fieldErrors,
			drag: this.drag,
			suggestNames: (input, owner) => this.suggestNames(input, owner),
			persistReorder: (label, sentence) => this.persistReorder(label, sentence),
		};
	}

	/**
	 * Validate and write the layout, then refresh open sheet views.
	 *
	 * **A layout that will not save is held, and reported in the outline, not
	 * only in a notice** (`docs/features/unsaveable-layout.md` §2). Whether it
	 * will not serialise and re-parse, or the vault refuses the write, the pane
	 * keeps it, draws the standing block under the **Layout file** row, and
	 * raises the notice once per reason rather than on every later edit; the
	 * write that ends the state says the layout is saved. `onDisk` moves only
	 * when a write lands and the undo step is pushed then, so a rejected write
	 * leaves both as they were, and `holds()`, the undo and the byte check a
	 * kept layout is put back against all read the file's real bytes, however
	 * many writes overlapped. What happens to a held
	 * layout when the pane lets go of it is `release`'s.
	 *
	 * `record` is the only thing that separates an author's own edit from an
	 * undo or a redo replaying one: every ordinary call site keeps calling
	 * this with no argument, so `true` is what a mutation has always meant,
	 * and `undo`/`redo` below are the only two callers that pass `false`. A
	 * `record` write pushes what the file held *before* this write onto the
	 * undo stack and clears the redo stack — the standard rule that a fresh
	 * edit forgets whatever a redo could have replayed — but only where the
	 * write actually changes a byte: opening a form calls this on the way
	 * past nothing that changed it, and a step that did nothing is not a step
	 * to undo. An `undo`/`redo` write skips both, because the caller already
	 * did its own push onto the *other* stack before calling this.
	 *
	 * `rename` is the one thing every other caller omits: a label or a
	 * declared-key commit's own old and new value, captured at the moment it
	 * committed. **The layout lands first, always** — the write above is the
	 * whole of this method's existing body, untouched by this parameter — and
	 * the migration begins only once it has resolved
	 * (`docs/features/component-rename-migration.md`). A layout write that
	 * throws returns above and never reaches this, so a rename never touches a
	 * single character note when the layout itself could not be saved.
	 *
	 * **Ahead of the re-render, and that ordering is correctness rather than
	 * preference.** Nothing in `src/view/` registers a vault event *of its own* —
	 * the base `TextFileView` does, which is what makes a dirty sheet safe to
	 * leave alone — so a refresh run before the scan re-renders an open sheet
	 * from text the migration has not written yet, drawing the renamed component
	 * off a heading the layout no longer names, blank, until the reader
	 * navigated away and back. The cost is that the render waits for the scan;
	 * one rename gesture is one scan, because every commit here is on `change`
	 * and never per keystroke (`field-commit.ts`).
	 *
	 * **A rename migrates only where the file is the one its name resolves
	 * to.** The notes a migration rewrites are the notes naming this file's
	 * basename, and those notes read *this* file only where the folder's lookup
	 * lands on it. A file opened from outside the folder, or a `.json` a
	 * `.sheetsmith` of the same name shadows, shares its basename with a
	 * different layout or with none — so migrating from it would rewrite
	 * characters built on some other file, which is Constraint 4 broken by an
	 * edit to a file those characters never read. The layout still saves; the
	 * notes are left alone, as they are for any edit to a file nobody uses.
	 */
	private persist(record = true, rename?: RenameIntent): Promise<boolean> {
		return this.write({ push: record, clearRedo: record, rename });
	}

	/**
	 * `persist`'s body, with its two stack effects apart: an author's edit
	 * pushes and clears redo, a replay does neither, and a redo of the held
	 * step pushes without clearing (`docs/features/unsaveable-layout.md` §3).
	 * Tracked in `writes` for as long as it is in flight, so `release` can wait
	 * for it.
	 */
	private write(options: {
		push: boolean;
		clearRedo: boolean;
		rename?: RenameIntent;
	}): Promise<boolean> {
		const writing = this.writeNow(options);
		this.writes.add(writing);
		void writing.then(() => this.writes.delete(writing));
		return writing;
	}

	private async writeNow(options: {
		push: boolean;
		clearRedo: boolean;
		rename?: RenameIntent;
	}): Promise<boolean> {
		const { push, clearRedo, rename } = options;
		// Taken once, before the write is awaited: the pane may be on another
		// file by the time it resolves, and the migration below belongs to the
		// file this write went to.
		const file = this.file;
		if (!file || !this.layout) return false;
		let serialised: string;
		try {
			serialised = serialiseLayout(this.layout);
			parseLayout(serialised);
		} catch (error) {
			// A fresh edit forgets what a redo could have replayed even where it
			// is itself refused, the standard rule the recorded branch keeps.
			if (clearRedo) {
				this.redoStack.clear();
				this.commits++;
			}
			this.hold({ reason: 'invalid', message: messageOf(error) });
			return false;
		}
		// A fresh edit forgets what a redo could have replayed, as every editor's
		// undo does; only where it changes a byte.
		if (push && clearRedo && serialised !== this.expected) {
			this.redoStack.clear();
			this.commits++;
		}
		this.expected = serialised;
		this.inFlight.push(serialised);
		// `modify`, not `process`, and the only one left in `src/`. A `process`
		// callback is handed the file's current contents so that the new ones can
		// be derived from them, and there is nothing to derive here: `serialised`
		// is a whole-file snapshot of what this pane holds in memory. The callback
		// would ignore its argument, which makes the call a lock wearing a
		// read-modify-write's clothes, and it would still overwrite another
		// writer exactly as this does. Worse, it would read as if `this.onDisk`
		// had been reconciled with the file when it cannot be. `layouts.ts` is
		// the site that genuinely derives, and it converted.
		/*
		 * **Reported, not thrown.** `persist` is called as `void this.persist(…)`
		 * from every field's commit, so a rejection here had nowhere to go: the
		 * author was told nothing and the app got an unhandled rejection.
		 *
		 * Returning is what the rename path needs as much as the message is: the
		 * migration must not run when the layout it is migrating *to* is not on
		 * disk, which is this method's own first promise and Acceptance criterion
		 * 9 in `docs/features/component-rename-migration.md`.
		 *
		 * **One write at a time, in order**, through `queue`, and the next is let
		 * go only once this one's outcome is recorded. A rejected write changes
		 * neither `onDisk` nor the undo stack, since neither moved when it was
		 * sent; `expected` goes back to `onDisk` only where no later write is
		 * out, because a later one owns it then.
		 */
		const turn = this.queue;
		let done = (): void => undefined;
		this.queue = new Promise<void>((resolve) => {
			done = resolve;
		});
		try {
			await turn;
			await this.plugin.app.vault.modify(file, serialised);
		} catch (error) {
			if (this.file !== file) return false;
			if (this.expected === serialised) this.expected = this.onDisk;
			this.hold({ reason: 'write', message: messageOf(error) });
			return false;
		} finally {
			this.inFlight.splice(this.inFlight.indexOf(serialised), 1);
			done();
		}
		if (this.file === file) {
			const before = this.onDisk;
			this.onDisk = serialised;
			if (push && before !== null && before !== serialised) {
				this.undoStack.push({ text: before });
			}
		}
		if (this.file === file && this.expected === serialised && this.unsaved !== null) {
			this.unsaved = null;
			this.paintUnsaved();
			new Notice(`"${file.basename}" is saved.`);
		}
		if (
			rename !== undefined &&
			isResolvedLayout(
				this.plugin.app,
				this.plugin.settings.layoutFolder,
				file,
			)
		) {
			/*
			 * **The scan is bracketed by the open sheets, and both halves are
			 * corrections rather than care.** A sheet's own edits reach disk
			 * through Obsidian's two-second `requestSave` debounce, and nothing
			 * in `src/view/` registers a vault event, so without this bracket
			 * one rename gesture produced the whole of the owner's report: the
			 * value typed seconds earlier was still only in the view, so the
			 * scan found no section, migrated nothing and said nothing — no
			 * `Notice` at all — and then the pending write landed the old
			 * heading on disk under a layout that no longer named it, leaving
			 * the card blank with its value still in the file.
			 *
			 * `reloadSheets` is the return half and stands in for
			 * `refreshSheets` on this path: it renders, and it renders from
			 * what the migration actually wrote. Refreshing instead drew the
			 * renamed component off the stale text — blank — and left
			 * `getViewData` holding the pre-rename heading, so the next edit on
			 * that sheet, or closing it, wrote the migration back out.
			 */
			await this.host.flushSheets();
			/*
			 * **Between the flush and the migration, and it has to be.** After the
			 * migration a renamed note holds the new label too and cannot be told
			 * from one that already held it; before the flush, a value typed a
			 * moment ago is not on disk to be counted. A note holding the old
			 * label as well is the migration's collision, counted there, so it is
			 * passed over here (`section-adoption.ts`).
			 */
			const adoption =
				rename.kind === 'label'
					? await adoptionReport(
							this.plugin.app,
							file.basename,
							[rename.to],
							'component',
							rename.from,
						)
					: null;
			await reportComponentRename(this.plugin.app, file.basename, rename, adoption);
			await this.host.reloadSheets();
			return true;
		}
		this.host.refreshSheets();
		return true;
	}

	/**
	 * The pane's own text of a layout it could not write, taken back as a
	 * layout: a kept one put back on reopening, or the held step a redo replays
	 * (`docs/features/unsaveable-layout.md` §3, §4).
	 *
	 * **A structural copy, never a parse.** Held text may not parse — that is
	 * why it was held — and the next `persist` validates it as always. Real file
	 * bytes keep going through `parseLayout`, so a snapshot of them failing to
	 * parse still says so; a fallback that tried the parse and quietly took the
	 * copy would hide exactly that.
	 */
	private restoreHeld(text: string): Layout {
		return JSON.parse(text) as Layout;
	}

	/**
	 * Put the layout back to a snapshot popped off an undo or a redo stack.
	 *
	 * Re-parses rather than diffing, on the same argument the mechanism as a
	 * whole rests on (`docs/features/editor-undo.md`): a whole-file snapshot
	 * restores everything a multi-part mutation touched by construction. The
	 * write goes through `persist(false)`, so this does not itself touch
	 * either stack — the caller already pushed what it is leaving onto the
	 * other one.
	 *
	 * The selection fallback the feature promises needs no code of its own:
	 * `render`'s existing rule already corrects `host.selection` to
	 * `SHEET_DESTINATION` whenever it names a component the current
	 * `this.layout` does not hold, and that rule runs on every redraw
	 * regardless of why `this.layout` changed.
	 */
	private restoreSnapshot(snapshot: string): void {
		this.layout = parseLayout(snapshot);
		this.redraw();
		void this.persist(false);
	}

	/**
	 * Undo the most recent recorded mutation. Returns whether there was one.
	 *
	 * **Waits for every write in flight first.** A step is pushed when its write
	 * lands, so an undo pressed while one is out would pop the step *before* it
	 * and leave the edit being written in neither stack; the undo instead runs
	 * once the writes have landed, against the stacks and the unsaved state as
	 * they then are, and answers a promise of whether it did anything
	 * (`deferred`). With no write out it answers at once, as it always did.
	 *
	 * **From the unsaved state, one undo goes back to the file's last saved
	 * bytes** (`docs/features/unsaveable-layout.md` §3) without popping the
	 * stack, and pushes the pane's own serialisation of the held layout onto
	 * redo, marked as never having been a file. It writes nothing, because the
	 * file already holds those bytes. Everything since the last save is one
	 * step: none of the states between was ever a file.
	 */
	undo(): boolean | Promise<boolean> {
		if (!this.file) return false;
		if (this.writes.size > 0) return this.deferred(() => this.undo());
		if (this.unsaved !== null && this.layout !== null && this.onDisk !== null) {
			this.redoStack.push({ text: serialiseLayout(this.layout), held: true });
			this.unsaved = null;
			this.layout = parseLayout(this.onDisk);
			this.expected = this.onDisk;
			this.redraw();
			return true;
		}
		const snapshot = this.undoStack.pop();
		if (snapshot === undefined) return false;
		if (this.onDisk !== null) this.redoStack.push({ text: this.onDisk });
		this.restoreSnapshot(snapshot.text);
		return true;
	}

	/**
	 * Redo the most recently undone mutation. Returns whether there was one.
	 *
	 * **The held step is put back by a structural copy**, since it may not
	 * parse, and written as the edits that produced it were: it either saves,
	 * where the vault has recovered, or enters the unsaved state again and says
	 * so. It pushes the bytes it leaves without clearing redo, as the step it
	 * replays did.
	 */
	redo(): boolean | Promise<boolean> {
		if (!this.file) return false;
		if (this.writes.size > 0) return this.deferred(() => this.redo());
		const snapshot = this.redoStack.pop();
		if (snapshot === undefined) return false;
		if (snapshot.held === true) {
			this.layout = this.restoreHeld(snapshot.text);
			this.redraw();
			void this.write({ push: true, clearRedo: false });
			return true;
		}
		if (this.onDisk !== null) this.undoStack.push({ text: this.onDisk });
		this.restoreSnapshot(snapshot.text);
		return true;
	}
}
