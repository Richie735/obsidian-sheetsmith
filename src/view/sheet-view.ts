import { Notice, TextFileView, WorkspaceLeaf } from 'obsidian';
import { getComponent } from '../components';
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
import { makeFieldResolver, resolveFormulaFields } from '../formula/resolve';
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

		for (const config of ordered) {
			const cell = grid.createDiv('sheetsmith-cell');
			cell.style.gridColumn = `${config.position.col} / span ${config.position.width}`;
			cell.style.gridRow = `${config.position.row} / span ${config.position.height}`;

			const component = getComponent(config.type);
			if (!component) {
				this.renderCellError(cell, `Unknown component type "${config.type}".`);
				continue;
			}
			const section = getSection(note, config.label);
			const result = section ? component.read(section.body, config) : null;
			if (result && !result.ok) {
				this.renderCellError(cell, `${config.label}: ${result.error}`);
				continue;
			}
			const data = result ? result.data : null;
			component.render(cell, config, data, {
				resolved: resolveFormulaFields(component, config, data),
				resolveField: makeFieldResolver(component, config, data),
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
