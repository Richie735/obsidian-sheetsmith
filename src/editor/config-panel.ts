/*
 * The configuration panel of the layout editor: the right-hand region, and
 * everything in it. Whatever the pane's one selection names — a component's own
 * form, or the layout's own settings — this is what draws it and what its
 * controls write.
 *
 * Split out of `layout-editor.ts`, which drew the tree of what a layout holds
 * *and* the panel configuring whichever one is selected — its own class doc's
 * words, and `docs/PATTERNS.md` §1's test failed in them. `schematic-gestures.ts`
 * was the cut before this one and this is the same move: a module in `editor/`
 * named for the surface it drives, parameterised over a small host interface, so
 * the editor's structure — the file, the picker, the schematics list, the pending
 * focus and flash — stays out of reach rather than being handed over wholesale.
 *
 * **The seam is the editor's own `Regions`**, which was already `{ outline,
 * panel }`: two elements drawn by two disjoint sets of methods. So this took the
 * whole region rather than only its largest cluster. Drawing the component form
 * here and leaving the layout's own settings behind would have left the file
 * drawing into both regions, and §1's "and" exactly where it was — a smaller
 * diff that fixes nothing.
 *
 * **What came with it, and why the panel rather than the host holds it.** The
 * trigger list and the function library are *fields of this region*, and the
 * pane reads them back on close so a definition typed and not committed is not
 * lost. That read is `commitPending`, which is the whole of what the editor asks
 * back: the field references stay with the region that created them, because a
 * reference held one level up would be the outer half knowing which controls the
 * inner half drew.
 *
 * **The four position numbers are part of that**, and they were the exception
 * this argument had to be applied to twice. A schematic gesture moves a block
 * and the open form's `col`, `row`, `width` and `height` follow by being
 * written rather than by the pane being torn down around a field the author is
 * standing in — so *something* reaches into this region between renders. That
 * something is `syncPositionFields`, and it is this module's: it writes only
 * into the element this module drew, addressing it by a token this module mints.
 * Left one level up it was the outer half querying for controls the inner half
 * created, which is the same rule broken by DOM query instead of by reference,
 * and it put the token and the four keys in two files that nothing holds
 * together. `SchematicHost` still names the member, because the gesture is what
 * asks for it; the editor answers it by delegating here.
 *
 * **What did not come with it: the inline-error map.** `fieldErrors` is the
 * decision `docs/PATTERNS.md` §11 left open, and it is the host's rather than
 * this module's — not because both regions draw errors (only this one does), but
 * because the map outlives the render that filled it. The editor replays it
 * after every rebuild, over the whole pane, from `restoreFieldErrors`, and drops
 * the entries whose field is gone. Held here it would be state the replay cannot
 * see, and a panel rebuilt on a selection change is precisely when an error has
 * to survive. So the host carries it, by reference, exactly as `ListContext` and
 * `ResetFieldContext` already carry the same map into `list-fields.ts` and
 * `reset-field.ts` — this is the third consumer of a shape those two settled.
 *
 * **And the pair did not survive as a pair.** `fieldError` was a one-line
 * binding of `field-error.ts`'s `showFieldError` to that map, and the split shows
 * it was never a member worth sharing: this module keeps a private one over the
 * host's map, and the editor's one remaining caller spells `showFieldError`
 * directly. Sharing the binding would be sharing a partial application of
 * something already extracted, where §1 asks for the application in one place —
 * and it is in one place, in `field-error.ts`.
 *
 * **`listContext` stayed behind the host, and `renderChildOrder` came here.**
 * They looked like one question and are not. Every caller of `renderChildOrder`
 * is in this file, and it draws into the panel's own form, so it moves. Every
 * caller of `listContext` is *also* in this file — but what it assembles is the
 * editor's, not the panel's: the pending focus token and the pending flash token
 * that the next render applies, the shared drag cursor no list may read as
 * another's, and a modal opened on the plugin's `app`. Those four are what
 * moving it would cost — `ListContext` has seven members and the host already
 * carries three of them, `persist`, `redraw` and `errors` — so one host member
 * would become four the panel has no other use for, and this module would be put
 * in charge of state the render loop one level up is the only thing that can
 * apply.
 *
 * **Not here: the outline.** The picker and its file operations, the tree and its
 * rows, the add row, the schematics and their paint, and the walk that finds what
 * is selected all stay in `layout-editor.ts`. Nor the arithmetic, nor the
 * gestures: `preview-grid.ts` and `schematic-gestures.ts` were the first two cuts
 * of the same file and this is the third.
 */

import { Setting } from 'obsidian';
import { acceptsChildren } from './accepts-children';
import { getComponent } from '../components';
import { placedComponentName } from './component-name';
import { conditionMet } from './config-fields';
import { copyableName } from './copyable-name';
import { onCommit } from './field-commit';
import { showFieldError } from './field-error';
import { groupHeading, panelTitle } from './form-group';
import {
	commitFunctionLibrary,
	FunctionLibraryField,
	renderFunctionLibrary,
} from './function-library-field';
import {
	ListContext,
	moveItem,
	renderColumnsEditor,
	renderEntriesEditor,
	renderRowsEditor,
} from './list-fields';
import { DEFAULT_COLUMNS, Layout } from '../parse/layout';
import { WalkEntry } from '../parse/layout-walk';
import { renderResetField } from './reset-field';
import {
	commitTriggerList,
	renderTriggerList,
	TriggerListField,
} from './trigger-list-field';
import {
	ComponentConfig,
	GRID_POSITION_KEYS,
	GridPosition,
	isContainer,
	placesChildren,
} from '../types';
import { childIsPlaced } from '../view/grid-cells';

/**
 * How a position field is addressed, wherever it is addressed from.
 *
 * The keys themselves are `GRID_POSITION_KEYS`, beside the type they are the
 * keys of: the parser walks the same four to validate them, and a list that can
 * fall short of `GridPosition` is a field the form never offers.
 */
function positionToken(id: string, key: keyof GridPosition): string {
	return `pos-${id}-${key}`;
}

/**
 * What the configuration panel needs from the editor drawing it.
 *
 * The third interface of this shape in two levels — the pane hosts the editor,
 * the editor hosts both the schematic's gestures and this — and the same rule
 * each time: the inner half asks for what it cannot see rather than being handed
 * the outer one. Passing the editor itself would be no split at all, since every
 * private it owns would be back in reach.
 *
 * Six members, which is `SchematicHost`'s size and, as there, the honest measure
 * of what a form over a layout touches rather than a sign the seam is misplaced.
 * Five are commands. The sixth is not, and it is the one that owes an argument.
 */
export interface ConfigPanelHost {
	/** Write the layout now. Every control on the panel ends in this. */
	persist(): void;
	/**
	 * Rebuild both regions from the layout as it now stands.
	 *
	 * Asked for wherever a commit can change what the *form* offers — a select
	 * or a list that another field's `visibleWhen` reads, a trigger list a
	 * component's binding chooses from — and by a rename, which the tree row and
	 * the schematic block both carry. Both regions rather than this one, because
	 * a panel that redrew itself alone would leave a renamed component named the
	 * old way one column over.
	 */
	redraw(): void;
	/**
	 * Redraw every schematic without rebuilding the pane.
	 *
	 * The position fields' own path: the four numbers the author is typing into
	 * address a grid in the other column, so the grid follows and the field they
	 * are standing in survives. A `redraw` here would take the focused input
	 * down with it on every keystroke that commits.
	 */
	redrawSchematics(): void;
	/**
	 * Write the layout's column count into the sheet's own schematic.
	 *
	 * Separate from `redrawSchematics` rather than folded into it, because they
	 * are two claims and the pane has a case for each: this one is about the
	 * number the grid is drawn against, and the redraw is about the pane standing
	 * while it changes. Which schematic is the sheet's, and what to do when there
	 * is none, is the editor's to know.
	 */
	setGridColumns(columns: number): void;
	/**
	 * Inline errors, by the focus token of the field showing them.
	 *
	 * The one member that is not a command, and it is a reference to a live map
	 * rather than a `readonly` copy of a value — which is what keeps it clear of
	 * the trap `SchematicHost` warns about. The editor replays this map after
	 * every rebuild and forgets the entries whose field has gone, so an error
	 * held here instead would vanish the moment an unrelated field was corrected.
	 * `list-fields.ts` and `reset-field.ts` take the same map the same way; this
	 * is a third reader of one map, not a third copy of one.
	 */
	readonly errors: Map<string, string>;
	/**
	 * What the list editors in `list-fields.ts` need, assembled by the editor.
	 *
	 * A member rather than four, and the four are the reason: the pending focus
	 * and flash tokens are applied by the render loop, the drag cursor is shared
	 * with every other list in the pane, and the confirmation opens a modal on
	 * the plugin's app. Four rather than seven because the host already carries
	 * `persist`, `redraw` and `errors`, which this assembles out of them. None of
	 * the four is the panel's, and a panel holding them would be holding state
	 * only the outer render can act on.
	 */
	listContext(): ListContext;
}

/**
 * The panel: the settings of whatever the pane has selected.
 *
 * Long lived, constructed once with the editor, because the fields it reads back
 * on close have to outlive the render that drew them.
 */
export class ConfigPanel {
	private host: ConfigPanelHost;
	/**
	 * The function library field, so its text can be read back on close
	 * rather than waited on. Held with the layout it edits, because a stale
	 * field must never write into the layout that replaced it.
	 */
	private functions: FunctionLibraryField | null = null;
	/** The trigger list field, read back on close for the same reason. */
	private triggers: TriggerListField | null = null;
	/**
	 * The element the last render drew into, so a gesture can write the position
	 * fields without the pane being rebuilt around them.
	 *
	 * The same lifetime as the two fields above and for the same reason: what
	 * this region drew is this region's to find again. A render that gave up
	 * before drawing a panel leaves the previous one detached, which is the
	 * state a write is unobservable in — and no gesture can reach one anyway,
	 * because a giving-up render draws no schematic blocks either.
	 */
	private panelEl: HTMLElement | null = null;

	constructor(host: ConfigPanelHost) {
		this.host = host;
	}

	/**
	 * Draw the panel for what is selected: a component's form, or the layout's
	 * own settings where the selection is the layout itself.
	 *
	 * One entry point rather than two, so which of the two forms a selection
	 * means is this module's question and not the caller's. `null` is the layout
	 * — the same spelling `selectedEntry` answers with, and the same one the
	 * editor corrects a stale selection into.
	 */
	render(panel: HTMLElement, layout: Layout, selected: WalkEntry | null): void {
		this.panelEl = panel;
		if (selected) {
			this.renderComponentForm(
				panel,
				layout,
				selected.config,
				selected.depth,
				selected.parent,
			);
		} else {
			this.renderLayoutSettings(panel, layout);
		}
	}

	/**
	 * Read both textarea fields back into the layout, reporting whether either
	 * changed. Called before a redraw and on the pane closing.
	 *
	 * Both are read rather than waited on, and either can be holding an edit
	 * when the pane closes. Evaluated into locals first: `||` would
	 * short-circuit past the second commit whenever the first changed, which is
	 * precisely how a library gets lost.
	 */
	commitPending(): boolean {
		const triggersChanged = commitTriggerList(this.triggers);
		const functionsChanged = commitFunctionLibrary(this.functions);
		return triggersChanged || functionsChanged;
	}

	/**
	 * Write a component's position back into its open form, if it has one.
	 *
	 * Asked for by a schematic gesture, through the editor, which is why it is
	 * public where the rest of the drawing is private. It writes rather than
	 * redraws because the author may be standing in one of these fields while a
	 * block is dragged, and a rebuild would take the field down with it.
	 */
	syncPositionFields(config: ComponentConfig): void {
		const container = this.panelEl;
		if (!container) return;
		for (const key of GRID_POSITION_KEYS) {
			const field = container.querySelector(
				`[data-sheetsmith-focus="${CSS.escape(positionToken(config.id, key))}"]`,
			);
			if (field?.instanceOf(HTMLInputElement)) {
				field.value = String(config.position[key]);
			}
		}
	}

	/** Show an inline error, and remember it across the next rebuild. */
	private fieldError(input: HTMLInputElement, message: string | null): void {
		showFieldError(input, message, this.host.errors);
	}

	/**
	 * The layout's own settings: the grid it places components on, the functions
	 * its formulas may call, and the triggers its components reset on.
	 *
	 * Reached by selecting the `Layout` row, which is why there is no second kind
	 * of panel. Both textarea fields already took a container and a layout and
	 * knew nothing about a settings tab, so they move rather than being
	 * rewritten — and the function library's own header asked for exactly this:
	 * below the component forms "the definitions are a scroll away from the
	 * formulas calling them, which is a side panel's job to fix".
	 */
	private renderLayoutSettings(panel: HTMLElement, layout: Layout): void {
		const form = panel.createDiv('sheetsmith-component-form');
		// The tree row that got here says `Layout`, so this does too. The layout's
		// own name is the picker's, one column over, and saying it twice would be
		// two answers to "which layout is this".
		panelTitle(form, 'Layout');
		this.renderColumnCount(form, layout);
		this.triggers = renderTriggerList(form, layout, {
			persist: () => this.host.persist(),
			redraw: () => this.host.redraw(),
		});
		this.functions = renderFunctionLibrary(form, layout, {
			persist: () => this.host.persist(),
		});
	}

	/**
	 * How many columns the grid places components across.
	 *
	 * The first control this key has ever had: it round-trips today and is
	 * reachable only by hand-editing the file. A plain number rather than a
	 * formula field — a column count is structure, and nothing resolves it.
	 *
	 * Two hazards, both spelled out in `parse/layout.ts` and both of a kind this
	 * codebase has been caught by twice. An absent `columns` has to stay absent
	 * through a round trip, so a value matching the default deletes the key
	 * rather than writing `"columns": 12` into a file that merely had the field
	 * shown — the same answer a select and a boolean already give, and the
	 * `options: []` trap a third time. And `parseLayout` refuses anything that is
	 * not a positive integer, so this carries the position fields' own inline
	 * error rather than letting `persist` refuse the whole file with a `Notice`
	 * and drop the edit.
	 */
	private renderColumnCount(form: HTMLElement, layout: Layout): void {
		new Setting(form)
			.setName('Grid columns')
			.setDesc(
				'How many columns components are placed across. Reducing it leaves a component already past the new last column where it is, rather than moving something you did not touch.',
			)
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setValue(String(layout.columns ?? DEFAULT_COLUMNS));
				text.inputEl.dataset.sheetsmithFocus = 'layout-columns';
				onCommit(text, (raw) => {
					const parsed = Number(raw.trim());
					if (!Number.isInteger(parsed) || parsed < 1) {
						this.fieldError(text.inputEl, 'Whole number, 1 or more.');
						return;
					}
					this.fieldError(text.inputEl, null);
					if (parsed === DEFAULT_COLUMNS) delete layout.columns;
					else layout.columns = parsed;
					this.host.persist();
					// The schematic is drawn against this number and the tree and
					// the panel are not, so the grid is redrawn and the pane is
					// left standing.
					this.host.setGridColumns(parsed);
					this.host.redrawSchematics();
				});
			});
	}

	/**
	 * The tabs of a container that shows one child at a time, in the order its
	 * strip draws them.
	 *
	 * A list rather than a grid, and up/down rather than a drag, because the
	 * order is the whole of what there is to say: a tab has no placement, so
	 * there is no second dimension for a gesture to write. `moveItem` is the
	 * same reorder the entry and row lists use — one consumer more of a
	 * mechanism already proven, rather than a second answer to "how does a list
	 * move".
	 *
	 * Editing and removing a tab stay on its own row in the disclosure list
	 * below, where every other component's are. Offering them again here would
	 * be two controls for one job, and the one that went stale would be this
	 * copy.
	 */
	private renderChildOrder(form: HTMLElement, config: ComponentConfig): void {
		const tabs = config.children ?? [];
		form.createDiv({ cls: 'setting-item-description' }, (el) =>
			el.setText(
				tabs.length === 0
					? 'No tabs yet. Add a component to this one and it becomes its first tab.'
					: 'The strip draws these left to right. Each one fills the panel when it is showing, so none of them has a position of its own.',
			),
		);
		tabs.forEach((tab, index) => {
			const row = new Setting(form)
				.setName(`${index + 1}. ${tab.label}`)
				.setDesc(placedComponentName(tab));
			// The class alone: these are always one level in, and the indent rule
			// already defaults `--sheetsmith-row-depth` to 1. Setting it here would
			// be a static style assignment, which the lint rules refuse — rightly,
			// since a fixed value belongs in the stylesheet.
			row.settingEl.addClass('sheetsmith-row-child');
			row.addExtraButton((button) => {
				button
					// The arrows every other reorder control in the plugin uses —
					// the entry list and both list fields — rather than a
					// chevron. `docs/UI.md` §9: reuse the vocabulary instead of
					// inventing a lookalike. A chevron here would also have collided
					// with the disclosure two rows up, where `chevron-down` means
					// "this row is open" rather than "move later".
					.setIcon('arrow-up')
					.setTooltip('Move earlier')
					.setDisabled(index === 0)
					.onClick(() => moveItem(tabs, index, index - 1, this.host.listContext()));
				button.extraSettingsEl.dataset.sheetsmithFocus = `tab-up-${tab.id}`;
			});
			row.addExtraButton((button) => {
				button
					.setIcon('arrow-down')
					.setTooltip('Move later')
					.setDisabled(index === tabs.length - 1)
					.onClick(() => moveItem(tabs, index, index + 1, this.host.listContext()));
				button.extraSettingsEl.dataset.sheetsmithFocus = `tab-down-${tab.id}`;
			});
		});
	}

	private renderComponentForm(
		container: HTMLElement,
		layout: Layout,
		config: ComponentConfig,
		/** How many containers enclose it, which decides whether it may hold any. */
		depth: number,
		/** The container holding it, which decides whether it has a placement. */
		parent: ComponentConfig | null,
	): void {
		const form = container.createDiv('sheetsmith-component-form');
		const definition = getComponent(config.type);
		panelTitle(form, config.label);

		form.createDiv(
			{ cls: ['setting-item-description', 'sheetsmith-component-reference'] },
			(el) => {
				el.appendText('Formulas reference this component as ');
				// The id is the one thing about a component that cannot be
				// discovered anywhere else, and it is what gets retyped into
				// every formula that reads this component. Make it one click.
				copyableName(el, config.id);
			},
		);

		// A container that may hold nothing says so, rather than being offered a
		// grid to fill. This is the complement of the schematic's own guard and
		// the add row's, and the three sit in three places now — the panel, the
		// left column and the add row — which is why they ask one named question
		// rather than three spellings of it. Diverge and the author gets a grid in
		// one column beside a sentence in the other saying nothing can go in it.
		// The author chose this type deliberately, so silence is worse than a
		// sentence.
		if (isContainer(definition) && !acceptsChildren(config, depth)) {
			form.createDiv({ cls: 'setting-item-description' }, (el) =>
				el.setText(
					'This component sits inside two containers, so it can hold nothing: a container may hold containers only one level deep. Move it up a level to put components in it.',
				),
			);
		}

		// A container that shows one child at a time gets an ordered list, not a
		// grid. Its children have no placement — each fills the region in turn —
		// so the order is the only thing there is to edit, and it is the one thing
		// a grid could not have edited. The grid case is the left column's:
		// `renderContainerSchematic` draws it beside the sheet's own.
		if (acceptsChildren(config, depth) && !placesChildren(definition)) {
			this.renderChildOrder(form, config);
		}

		new Setting(form)
			.setName('Label')
			.setDesc(
				'Also the section heading in character notes. Existing notes keep their data under the old heading; rename those headings manually.',
			)
			.addText((text) => {
				text.setValue(config.label);
				text.inputEl.dataset.sheetsmithFocus = `label-${config.id}`;
				onCommit(text, (raw) => {
					const label = raw.trim();
					if (label === '') {
						this.fieldError(text.inputEl, 'A label is required.');
						return;
					}
					if (
						layout.components.some(
							(other) => other !== config && other.label === label,
						)
					) {
						showFieldError(
							text.inputEl,
							'Another component already uses this label.',
						);
						return;
					}
					this.fieldError(text.inputEl, null);
					config.label = label;
					this.host.persist();
					this.host.redraw();
				});
			});

		// A child of a container that shows one at a time fills the region it is
		// given, so none of its four numbers is read by anything. Withdrawn rather
		// than shown inert: a field that edits a number nothing reads is worse
		// than no field, and this is the same call the columns list makes when it
		// stops offering a total on a column that cannot carry one.
		const placed = childIsPlaced(parent);
		if (!placed) {
			form.createDiv({ cls: 'setting-item-description' }, (el) =>
				el.setText(
					`This fills "${parent?.label ?? ''}" when it is the one showing, so it has no position of its own. Its size is that component's.`,
				),
			);
		}

		const position = placed
			? new Setting(form)
					.setName('Position')
					.setDesc('Grid units.')
					.setClass('sheetsmith-position-setting')
			: null;
		for (const key of placed ? GRID_POSITION_KEYS : []) {
			const holder = position!.controlEl.createDiv('sheetsmith-position-field');
			holder.createSpan({
				cls: 'sheetsmith-position-label',
				text: key,
			});
			const input = holder.createEl('input', { type: 'number' });
			input.value = String(config.position[key]);
			// The span label is visual only; this is the accessible name.
			input.setAttribute('aria-label', `${config.label} ${key}`);
			input.dataset.sheetsmithFocus = positionToken(config.id, key);
			input.addEventListener('change', () => {
				const parsed = Number(input.value);
				if (!Number.isInteger(parsed) || parsed < 1) {
					this.fieldError(input, 'Whole number, 1 or more.');
					return;
				}
				this.fieldError(input, null);
				config.position[key] = parsed;
				this.host.redrawSchematics();
				this.host.persist();
			});
		}

		if (!definition) return;
		const record = config as unknown as Record<string, unknown>;

		// Only components that can act on a reset are offered one, and
		// implementing `applyReset` is what says so. Why the field is rendered
		// from here at all rather than declared as config is `reset-field.ts`.
		if (definition.applyReset !== undefined) {
			renderResetField(form, layout, config, {
				persist: () => this.host.persist(),
				redraw: () => this.host.redraw(),
				errors: this.host.errors,
			});
		}

		let currentGroup: string | undefined;
		for (const field of definition.configFields) {
			if (
				field.visibleWhen &&
				!conditionMet(field.visibleWhen, definition.configFields, record)
			) {
				continue;
			}
			if (field.group !== currentGroup) {
				currentGroup = field.group;
				if (currentGroup !== undefined) groupHeading(form, currentGroup);
			}

			if (
				field.kind === 'entries' ||
				field.kind === 'track-rows' ||
				field.kind === 'rows' ||
				field.kind === 'columns'
			) {
				// List fields are a table of their own, not a Setting row.
				// Falling through to the text input below would bind a string
				// input to an array and destroy it on the first commit.
				const entries = record[field.key];
				groupHeading(
					form,
					field.label,
					field.description,
					Array.isArray(entries) ? entries.length : 0,
				);
				const listEl = form.createDiv('sheetsmith-entry-list');
				if (field.kind === 'entries' || field.kind === 'track-rows') {
					// One editor for both: a track's rows are a Card set's
					// entries with a length, which is the shape the
					// component chose them for. A second table would drift
					// from this one the first time either changed.
					//
					// The columns are the field's own words, and a field of
					// this kind that declares none has no table to draw. The
					// registry contract holds every one of them to declaring
					// them, so what this guard covers is the type rather than a
					// state a registered component can reach — the heading and
					// the description above it are drawn either way, so a field
					// is never silently absent from the form.
					if (field.entryColumns) {
						renderEntriesEditor(
							listEl,
							record,
							field.key,
							config.id,
							field.kind === 'track-rows',
							field.entryColumns,
							this.host.listContext(),
						);
					}
				} else if (field.kind === 'rows') {
					renderRowsEditor(listEl, record, field.key, config.id, this.host.listContext());
				} else {
					renderColumnsEditor(
						listEl,
						record,
						field.key,
						config.id,
						this.host.listContext(),
					);
				}
				continue;
			}

			const setting = new Setting(form).setName(field.label);
			if (field.description) setting.setDesc(field.description);

			if (field.kind === 'text-list') {
				/*
				 * One field holding an ordered list of plain strings, not a
				 * table of its own: the lists this kind serves are short and
				 * their order is the whole meaning — a track's levels run from
				 * none upwards — so a row per entry would cost four controls to
				 * say what a comma already says. It is the same control the
				 * level column's names use, which is the list it has to agree
				 * with.
				 */
				setting.addText((text) => {
					const current = record[field.key];
					text.setValue(Array.isArray(current) ? current.join(', ') : '');
					text.inputEl.placeholder = 'Comma separated';
					text.inputEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
					onCommit(text, (raw) => {
						const parsed = raw
							.split(',')
							.map((entry) => entry.trim())
							.filter((entry) => entry !== '');
						this.fieldError(text.inputEl, null);
						// Cleared is "this list is not set", which is a state
						// the component reads — a track with no level names
						// counts its marks instead.
						if (parsed.length === 0) delete record[field.key];
						else record[field.key] = parsed;
						this.host.persist();
						// The list may decide what another field means.
						this.host.redraw();
					});
				});
				continue;
			}

			if (field.kind === 'select') {
				const options = field.options ?? [];
				const fallback = options[0] ?? '';
				setting.addDropdown((dropdown) => {
					for (const option of options) dropdown.addOption(option, option);
					const current = record[field.key];
					dropdown.setValue(
						typeof current === 'string' && options.includes(current)
							? current
							: fallback,
					);
					dropdown.selectEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
					dropdown.onChange((value) => {
						if (value === fallback) {
							delete record[field.key];
						} else {
							record[field.key] = value;
						}
						this.host.persist();
						// A select may control another field's visibility.
						this.host.redraw();
					});
				});
				continue;
			}

			if (field.kind === 'boolean') {
				const fallback = field.default ?? false;
				// Whether anything else on this form appears or disappears with
				// this key. A boolean commit did not redraw at all until one
				// controlled a `visibleWhen`, which made such a condition inert
				// and let the form offer a combination its component refused.
				//
				// **No component has one today** — the only boolean that did was
				// the group's `collapsible`, and it went with the collapse
				// (SPEC §13) — so this is a guard with no current caller rather
				// than live behaviour, and `settings.test.ts` says so where it can
				// only assert the precondition. Kept because the failure it
				// prevents is silent and the next such field would inherit it,
				// and left conditional because a redraw tears the whole tab down
				// and most checkboxes here change nothing but their own key.
				const controls = definition.configFields.some(
					(other) => other.visibleWhen?.key === field.key,
				);
				setting.addToggle((toggle) => {
					const current = record[field.key];
					toggle.setValue(typeof current === 'boolean' ? current : fallback);
					// Every control on this tab carries one, and a boolean was the
					// exception only for as long as no boolean redrew: the settings
					// tab restores focus by this token across the rebuild, so
					// without it the author presses a checkbox and lands on the
					// body with the form rebuilt around them. Unconditional rather
					// than only where `controls` is set, because the trap is
					// invisible — the next boolean to gain a dependent would
					// rediscover it.
					toggle.toggleEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
					toggle.onChange((value) => {
						if (value === fallback) {
							delete record[field.key];
						} else {
							record[field.key] = value;
						}
						this.host.persist();
						if (controls) this.host.redraw();
					});
				});
				continue;
			}

			setting.addText((text) => {
				if (field.kind === 'number') text.inputEl.type = 'number';
				const current = record[field.key];
				text.setValue(
					typeof current === 'string' || typeof current === 'number'
						? String(current)
						: '',
				);
				text.inputEl.dataset.sheetsmithFocus = `cfg-${config.id}-${field.key}`;
				onCommit(text, (raw) => {
					const trimmed = raw.trim();
					if (trimmed === '') {
						this.fieldError(text.inputEl, null);
						delete record[field.key];
						this.host.persist();
						return;
					}
					if (field.kind === 'number') {
						const parsed = Number(trimmed);
						if (Number.isNaN(parsed)) {
							this.fieldError(text.inputEl, 'This field needs a number.');
							return;
						}
						this.fieldError(text.inputEl, null);
						record[field.key] = parsed;
					} else {
						this.fieldError(text.inputEl, null);
						record[field.key] = trimmed;
					}
					this.host.persist();
				});
			});
		}
	}
}
