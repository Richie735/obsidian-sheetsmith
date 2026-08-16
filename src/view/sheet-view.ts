import { Notice, TextFileView, WorkspaceLeaf } from 'obsidian';
import { getComponent } from '../components';
import { closePopover } from '../components/popover';
import { loadLayout } from '../layouts';
import type SheetsmithPlugin from '../main';
import {
	CharacterNote,
	CharacterParseError,
	getSection,
	parseCharacter,
	serialiseCharacter,
	setSectionBody,
} from '../parse/character';
import {
	makeFieldExplainer,
	makeFieldResolver,
	resolveFormulaFields,
} from '../formula/resolve';
import { Scope } from '../formula/expression';
import { buildSheetScope } from '../formula/sheet';
import { Layout } from '../parse/layout';
import { ComponentConfig, ComponentDefinition } from '../types';

export const VIEW_TYPE_SHEET = 'sheetsmith-sheet';

/**
 * Sheet view. Renders a character note against its layout, and writes
 * component edits back into the note body. All writes go through the parse
 * layer, so untouched sections stay byte-identical.
 */
export class SheetView extends TextFileView {
	private plugin: SheetsmithPlugin;
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;

	constructor(leaf: WorkspaceLeaf, plugin: SheetsmithPlugin) {
		super(leaf);
		this.plugin = plugin;
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

		const focus = this.captureFocus();
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

		const grid = root.createDiv('sheetsmith-grid');
		grid.style.setProperty('--sheetsmith-columns', String(layout.columns ?? 12));

		// Grid order, not file order. Explicit grid-column/row make DOM order
		// invisible while the grid holds, but it decides two things that
		// matter: tab order, and the single-column sequence once the narrow
		// reflow drops the grid and lays cells out in DOM order. Copy before
		// sorting: sort mutates, and a render must not rewrite its own input.
		const ordered = [...layout.components].sort(
			(a, b) =>
				a.position.row - b.position.row || a.position.col - b.position.col,
		);

		// Read everything before rendering anything: a formula may name any
		// component on the sheet, including one that sits later in grid
		// order, so the name table has to be complete before the first card
		// draws. A component that failed to read publishes nothing, which
		// makes formulas depending on it report an unknown name rather than
		// compute from a blank.
		const prepared = ordered.map((config) => {
			const component = getComponent(config.type);
			const section = component ? getSection(note, config.label) : undefined;
			const result =
				component && section ? component.read(section.body, config) : null;
			return {
				config,
				component,
				error: result && !result.ok ? result.error : null,
				data: result?.ok === true ? result.data : null,
			};
		});

		// A published value may itself be computed, so the table takes a way
		// to build each component's resolver rather than finished numbers:
		// it is what closes the loop between "this card reads the sheet" and
		// "the sheet reads this card".
		const sheet = buildSheetScope(
			prepared.flatMap(({ config, component, data }) =>
				component?.scopeValues
					? [
							{
								id: config.id,
								values: component.scopeValues(data, config),
								resolver: (scope: Scope) =>
									makeFieldResolver(component, config, data, scope),
							},
						]
					: [],
			),
		);

		for (const { config, component, error, data } of prepared) {
			const cell = grid.createDiv('sheetsmith-cell');
			cell.style.gridColumn = `${config.position.col} / span ${config.position.width}`;
			cell.style.gridRow = `${config.position.row} / span ${config.position.height}`;

			if (!component) {
				this.renderCellError(cell, `Unknown component type "${config.type}".`);
				continue;
			}
			if (error !== null) {
				this.renderCellError(cell, `${config.label}: ${error}`);
				continue;
			}
			component.render(cell, config, data, {
				resolved: resolveFormulaFields(component, config, data, sheet),
				resolveField: makeFieldResolver(component, config, data, sheet),
				explainField: makeFieldExplainer(component, config, data, sheet),
				onChange: (edited: unknown) => this.applyEdit(component, config, edited),
			});
		}

		// SPEC §10: sections the layout does not map are left alone — they stay
		// in the note untouched and simply do not render.

		this.restoreFocus(focus);
	}

	/**
	 * Rebuilding the grid detaches whatever control the user tabbed or
	 * clicked into while the rebuild's layout read was in flight. Structural
	 * identity (cell index, control index within the cell) survives a
	 * rebuild of an unchanged layout, so capture it and re-focus after.
	 */
	private captureFocus(): {
		cell: number;
		control: number;
		start: number | null;
		end: number | null;
	} | null {
		const active = this.contentEl.ownerDocument.activeElement;
		// instanceOf rather than instanceof: constructors are per-window, and
		// the sheet may live in a popout.
		if (
			!active ||
			!active.instanceOf(HTMLElement) ||
			!this.contentEl.contains(active)
		) {
			return null;
		}
		const cells = Array.from(
			this.contentEl.querySelectorAll('.sheetsmith-cell'),
		);
		const cellIndex = cells.findIndex((cell) => cell.contains(active));
		if (cellIndex < 0) return null;
		const controls = Array.from(
			(cells[cellIndex] as Element).querySelectorAll(
				'input, select, textarea, button',
			),
		);
		const controlIndex = controls.indexOf(active);
		if (controlIndex < 0) return null;
		const input = active.instanceOf(HTMLInputElement) ? active : null;
		return {
			cell: cellIndex,
			control: controlIndex,
			start: input ? input.selectionStart : null,
			end: input ? input.selectionEnd : null,
		};
	}

	private restoreFocus(
		saved: ReturnType<SheetView['captureFocus']>,
	): void {
		if (!saved) return;
		const cell = this.contentEl.querySelectorAll('.sheetsmith-cell')[
			saved.cell
		];
		if (!cell) return;
		const control = cell.querySelectorAll('input, select, textarea, button')[
			saved.control
		];
		if (!control || !control.instanceOf(HTMLElement)) return;
		control.focus({ preventScroll: true });
		if (control.instanceOf(HTMLInputElement) && saved.start !== null) {
			control.setSelectionRange(saved.start, saved.end);
		}
	}

	/**
	 * Write edited component data back into the note. Re-parses the current
	 * text so the write always lands on the freshest content, and saves only
	 * when the serialised note actually differs.
	 */
	private applyEdit(
		component: ComponentDefinition,
		config: ComponentConfig,
		data: unknown,
	): void {
		try {
			const note = parseCharacter(this.data);
			const section = getSection(note, config.label);
			const body = component.write(data, section ? section.body : null, config);
			const next = serialiseCharacter(setSectionBody(note, config.label, body));
			if (next !== this.data) {
				this.data = next;
				this.requestSave();
				// Derived displays recompute from the fresh data; renderSheet
				// captures and restores focus, so tabbing into the next input
				// survives the rebuild.
				void this.renderSheet();
			}
		} catch (error) {
			new Notice(
				`Sheetsmith could not save "${config.label}": ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private renderMessage(text: string): void {
		this.contentEl.createDiv('sheetsmith-notice', (el) => el.setText(text));
	}

	private renderCellError(cell: HTMLElement, text: string): void {
		cell.addClass('sheetsmith-cell-error');
		cell.createDiv('sheetsmith-error', (el) => el.setText(text));
	}
}
