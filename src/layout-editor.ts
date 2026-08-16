import {
	App,
	debounce,
	Modal,
	Notice,
	Platform,
	setIcon,
	Setting,
	TextComponent,
	TFile,
} from 'obsidian';
import { getComponent, listComponentTypes } from './components';
import { createLayout, listLayouts } from './layouts';
import type SheetsmithPlugin from './main';
import { Layout, parseLayout, serialiseLayout } from './parse/layout';
import { ComponentConfig, GridPosition } from './types';
import { SheetView, VIEW_TYPE_SHEET } from './view/sheet-view';

/** Dropdown sentinel; layout file names can never collide with it. */
const CREATE_LAYOUT_OPTION = '::create-layout::';

/**
 * Form-based layout editor rendered inside the settings tab. Covers creating
 * layouts and configuring their components until the grid canvas (M4)
 * replaces it with a dedicated workspace view. Knows no component types:
 * component-specific fields come from each configFields declaration.
 *
 * Text fields commit on change (blur or Enter), never per keystroke, and
 * invalid input shows an inline error instead of being silently ignored.
 */
export class LayoutEditorSection {
	private plugin: SheetsmithPlugin;
	private redraw: () => void;
	private selected: string | null = null;
	private editing: number | null = null;
	private file: TFile | null = null;
	private layout: Layout | null = null;
	private previewEl: HTMLElement | null = null;
	/** Index of the attribute row being dragged, if any. */
	private dragIndex: number | null = null;
	/** Focus token to apply after the next render, e.g. a newly added row. */
	private pendingFocus: string | null = null;
	/** Generation counter; a render that awaits and comes back stale bails. */
	private renderId = 0;

	/** Debounced persist, used only by rapid-fire paths (keyboard nudging). */
	private persistSoon = debounce(() => void this.persist(), 500, true);

	constructor(plugin: SheetsmithPlugin, redraw: () => void) {
		this.plugin = plugin;
		this.redraw = redraw;
	}

	/** Write any pending debounced edit now. Called when the tab closes. */
	flush(): void {
		this.persistSoon.run();
	}

	async render(container: HTMLElement): Promise<void> {
		new Setting(container).setHeading().setName('Layouts');

		const files = listLayouts(
			this.plugin.app,
			this.plugin.settings.layoutFolder,
		);

		if (files.length === 0) {
			new Setting(container)
				.setName('Layout')
				.setDesc('No layouts yet.')
				.addButton((button) =>
					button
						.setButtonText('Create layout')
						.setCta()
						.onClick(() => this.promptCreateLayout()),
				);
			return;
		}

		if (
			this.selected === null ||
			!files.some((file) => file.basename === this.selected)
		) {
			this.selected = files[0]?.basename ?? null;
			this.file = null;
			this.layout = null;
			this.editing = null;
		}
		this.renderSelectionRow(container, files);

		const selectedFile = files.find((file) => file.basename === this.selected);
		if (!selectedFile) return;
		if (this.file?.path !== selectedFile.path || this.layout === null) {
			const run = ++this.renderId;
			this.file = selectedFile;
			let source: string;
			try {
				source = await this.plugin.app.vault.read(selectedFile);
			} catch (error) {
				this.layout = null;
				if (run !== this.renderId) return;
				container.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`This layout cannot be read: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
			// A redraw may have emptied and rebuilt the settings container
			// while the read was in flight; only the newest run may append.
			if (run !== this.renderId) return;
			try {
				this.layout = parseLayout(source);
			} catch (error) {
				this.layout = null;
				container.createDiv('sheetsmith-error', (el) =>
					el.setText(
						`This layout cannot be edited until its file is fixed: ${error instanceof Error ? error.message : String(error)}`,
					),
				);
				return;
			}
		}

		this.previewEl = container.createDiv('sheetsmith-layout-preview');
		this.updatePreview();
		this.renderAddRow(container, this.layout);
		this.renderComponents(container, this.layout);

		if (this.pendingFocus !== null) {
			this.refocus(container, this.pendingFocus);
			this.pendingFocus = null;
		}
	}

	private renderSelectionRow(container: HTMLElement, files: TFile[]): void {
		new Setting(container)
			.setName('Layout')
			.addDropdown((dropdown) => {
				for (const file of files) {
					dropdown.addOption(file.basename, file.basename);
				}
				dropdown.addOption(CREATE_LAYOUT_OPTION, 'New layout…');
				dropdown.setValue(this.selected ?? '');
				dropdown.onChange((value) => {
					if (value === CREATE_LAYOUT_OPTION) {
						// The modal redraws on close either way, which also
						// snaps the dropdown back if the user cancels.
						this.promptCreateLayout();
						return;
					}
					this.selected = value;
					this.file = null;
					this.layout = null;
					this.editing = null;
					this.redraw();
				});
			})
			.addExtraButton((button) =>
				button
					.setIcon('trash')
					.setTooltip('Delete layout')
					.onClick(() => {
						const file = files.find(
							(candidate) => candidate.basename === this.selected,
						);
						if (!file) return;
						new ConfirmModal(
							this.plugin.app,
							`Delete the layout "${file.basename}"? Character notes are not touched, but the layout's components and formulas are gone.`,
							'Delete layout',
							() => void this.deleteLayout(file),
						).open();
					}),
			);
	}

	private async deleteLayout(file: TFile): Promise<void> {
		await this.plugin.app.fileManager.trashFile(file);
		this.selected = null;
		this.file = null;
		this.layout = null;
		this.editing = null;
		this.redraw();
	}

	private promptCreateLayout(): void {
		new NameModal(
			this.plugin.app,
			(name) => void this.createLayoutNamed(name),
			() => this.redraw(),
		).open();
	}

	private async createLayoutNamed(name: string): Promise<void> {
		try {
			await createLayout(
				this.plugin.app,
				this.plugin.settings.layoutFolder,
				name,
			);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			this.redraw();
			return;
		}
		this.selected = name;
		this.file = null;
		this.layout = null;
		this.editing = null;
		this.redraw();
	}

	/**
	 * Schematic of the grid: one button per component at its configured
	 * position. Click opens the component's form; arrow keys move it and
	 * shift+arrows resize it. Overlapping components are marked.
	 */
	private updatePreview(): void {
		const el = this.previewEl;
		const layout = this.layout;
		if (!el || !layout) return;

		const active = el.ownerDocument.activeElement;
		const focusId =
			active && active.instanceOf(HTMLElement)
				? active.dataset.sheetsmithFocus
				: undefined;

		el.empty();
		el.style.setProperty('--sheetsmith-columns', String(layout.columns ?? 12));

		const overlapping = findOverlaps(layout.components);
		layout.components.forEach((config, index) => {
			const cell = el.createEl('button', { cls: 'sheetsmith-preview-cell' });
			cell.dataset.sheetsmithFocus = `preview-${config.id}`;
			if (index === this.editing) cell.addClass('sheetsmith-preview-editing');
			const overlaps = overlapping.has(index);
			if (overlaps) cell.addClass('sheetsmith-preview-overlap');
			cell.createSpan({ text: config.label });
			cell.setAttribute(
				'aria-label',
				`${config.label}: column ${config.position.col}, row ${config.position.row}, ` +
					`${config.position.width}×${config.position.height}` +
					(overlaps ? '. Overlaps another component' : ''),
			);
			cell.style.gridColumn = `${config.position.col} / span ${config.position.width}`;
			cell.style.gridRow = `${config.position.row} / span ${config.position.height}`;
			cell.addEventListener('click', () => {
				this.editing = this.editing === index ? null : index;
				this.redraw();
			});
			cell.addEventListener('keydown', (event) =>
				this.nudge(event, config, index),
			);
		});

		if (focusId) this.refocus(el, focusId);
	}

	/** Arrow keys move a component; shift+arrows resize it. */
	private nudge(
		event: KeyboardEvent,
		config: ComponentConfig,
		index: number,
	): void {
		const deltas: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		};
		const delta = deltas[event.key];
		if (!delta) return;
		event.preventDefault();
		const position = config.position;
		if (event.shiftKey) {
			position.width = Math.max(1, position.width + (delta[0] ?? 0));
			position.height = Math.max(1, position.height + (delta[1] ?? 0));
		} else {
			position.col = Math.max(1, position.col + (delta[0] ?? 0));
			position.row = Math.max(1, position.row + (delta[1] ?? 0));
		}
		this.persistSoon();
		if (this.editing === index) {
			// The open form shows position fields; redraw keeps them in
			// sync, and focus restoration returns to this preview cell.
			this.redraw();
		} else {
			this.updatePreview();
		}
	}

	private refocus(scope: HTMLElement, focusId: string): void {
		for (const candidate of Array.from(
			scope.querySelectorAll('[data-sheetsmith-focus]'),
		)) {
			if (
				candidate.instanceOf(HTMLElement) &&
				candidate.dataset.sheetsmithFocus === focusId
			) {
				candidate.focus({ preventScroll: true });
				return;
			}
		}
	}

	private renderAddRow(container: HTMLElement, layout: Layout): void {
		let chosen = listComponentTypes()[0] ?? 'stat-group';
		new Setting(container)
			.setName('Add component')
			.addDropdown((dropdown) => {
				for (const type of listComponentTypes()) {
					dropdown.addOption(type, componentDisplayName(type));
				}
				dropdown.setValue(chosen);
				dropdown.onChange((value) => {
					chosen = value;
				});
			})
			.addButton((button) =>
				button.setButtonText('Add').onClick(() => {
					const label = uniqueLabel(chosen, layout.components);
					layout.components.push({
						id: uniqueId(label, layout.components),
						type: chosen,
						label,
						position: {
							col: 1,
							row: nextFreeRow(layout.components),
							width: 2,
							height: 1,
						},
					});
					this.editing = layout.components.length - 1;
					void this.persist();
					this.redraw();
				}),
			);
	}

	private renderComponents(container: HTMLElement, layout: Layout): void {
		layout.components.forEach((config, index) => {
			const open = this.editing === index;
			const row = new Setting(container)
				.setName(config.label)
				.setDesc(componentDisplayName(config.type));
			if (open) row.settingEl.addClass('sheetsmith-row-open');
			row.addExtraButton((button) => {
				button
					.setIcon(open ? 'chevron-down' : 'chevron-right')
					.setTooltip(open ? 'Close' : 'Edit')
					.onClick(() => {
						this.editing = open ? null : index;
						this.redraw();
					});
				button.extraSettingsEl.dataset.sheetsmithFocus = `edit-${config.id}`;
			});
			row.addExtraButton((button) => {
				button
					.setIcon('trash')
					.setTooltip('Remove from layout')
					.onClick(() => {
						new ConfirmModal(
							this.plugin.app,
							`Remove "${config.label}" from the layout? Its configuration and formulas are lost, but character notes keep their "${config.label}" sections.`,
							'Remove component',
							() => {
								layout.components.splice(index, 1);
								this.editing = null;
								void this.persist();
								this.redraw();
							},
						).open();
					});
				button.extraSettingsEl.dataset.sheetsmithFocus = `remove-${config.id}`;
			});
			if (open) {
				this.renderComponentForm(container, layout, config);
			}
		});
	}

	private renderComponentForm(
		container: HTMLElement,
		layout: Layout,
		config: ComponentConfig,
	): void {
		const form = container.createDiv('sheetsmith-component-form');

		form.createDiv(
			{ cls: ['setting-item-description', 'sheetsmith-component-reference'] },
			(el) => {
				el.appendText('Formulas reference this component as ');
				el.createEl('code', { text: config.id });
			},
		);

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
						showFieldError(text.inputEl, 'A label is required.');
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
					showFieldError(text.inputEl, null);
					config.label = label;
					void this.persist();
					this.redraw();
				});
			});

		const position = new Setting(form)
			.setName('Position')
			.setDesc('Grid units.')
			.setClass('sheetsmith-position-setting');
		for (const key of ['col', 'row', 'width', 'height'] as const) {
			const holder = position.controlEl.createDiv('sheetsmith-position-field');
			holder.createSpan({
				cls: 'sheetsmith-position-label',
				text: key,
			});
			const input = holder.createEl('input', { type: 'number' });
			input.value = String(config.position[key]);
			// The span label is visual only; this is the accessible name.
			input.setAttribute('aria-label', `${config.label} ${key}`);
			input.dataset.sheetsmithFocus = `pos-${config.id}-${key}`;
			input.addEventListener('change', () => {
				const parsed = Number(input.value);
				if (!Number.isInteger(parsed) || parsed < 1) {
					showFieldError(input, 'Whole number, 1 or more.');
					return;
				}
				showFieldError(input, null);
				config.position[key] = parsed;
				this.updatePreview();
				void this.persist();
			});
		}

		const definition = getComponent(config.type);
		if (!definition) return;
		const record = config as unknown as Record<string, unknown>;

		let currentGroup: string | undefined;
		for (const field of definition.configFields) {
			if (
				field.visibleWhen &&
				record[field.visibleWhen.key] !== field.visibleWhen.equals
			) {
				continue;
			}
			if (field.group !== currentGroup) {
				currentGroup = field.group;
				if (currentGroup !== undefined) groupHeading(form, currentGroup);
			}

			if (field.kind === 'attributes') {
				groupHeading(form, field.label, field.description);
				const listEl = form.createDiv('sheetsmith-attribute-list');
				this.renderAttributesEditor(listEl, config, record, field.key);
				continue;
			}

			const setting = new Setting(form).setName(field.label);
			if (field.description) setting.setDesc(field.description);

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
						void this.persist();
						// A select may control another field's visibility.
						this.redraw();
					});
				});
				continue;
			}

			if (field.kind === 'boolean') {
				const fallback = field.default ?? false;
				setting.addToggle((toggle) => {
					const current = record[field.key];
					toggle.setValue(typeof current === 'boolean' ? current : fallback);
					toggle.onChange((value) => {
						if (value === fallback) {
							delete record[field.key];
						} else {
							record[field.key] = value;
						}
						void this.persist();
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
						showFieldError(text.inputEl, null);
						delete record[field.key];
						void this.persist();
						return;
					}
					if (field.kind === 'number') {
						const parsed = Number(trimmed);
						if (Number.isNaN(parsed)) {
							showFieldError(text.inputEl, 'This field needs a number.');
							return;
						}
						showFieldError(text.inputEl, null);
						record[field.key] = parsed;
					} else {
						showFieldError(text.inputEl, null);
						record[field.key] = trimmed;
					}
					void this.persist();
				});
			});
		}
	}

	/** Ordered { key, name? } list with add, remove, and reorder controls. */
	/**
	 * The attribute table is plain divs on its own grid template, not
	 * Setting rows — reusing Setting here meant deleting half its structure
	 * and overriding theme-styled internals.
	 *
	 * Focus ids use two schemes on purpose: inputs are keyed by index so
	 * focus holds its position while typing, buttons by attribute key so
	 * focus follows the item through a reorder.
	 */
	private renderAttributesEditor(
		listEl: HTMLElement,
		config: ComponentConfig,
		record: Record<string, unknown>,
		key: string,
	): void {
		if (!Array.isArray(record[key])) record[key] = [];
		const list = record[key] as { key: string; name?: string }[];

		if (list.length === 0) {
			listEl.createDiv('sheetsmith-attribute-empty', (el) =>
				el.setText('No attributes yet.'),
			);
		} else {
			const columns = listEl.createDiv('sheetsmith-attribute-columns');
			columns.createSpan({ text: 'Key' });
			columns.createSpan({ text: 'Full name' });
		}

		list.forEach((attribute, index) => {
			const row = listEl.createDiv('sheetsmith-attribute-row');
			row.addEventListener('dragover', (event) => {
				if (this.dragIndex === null) return;
				event.preventDefault();
				// moveAttribute lands the row above the target on upward
				// drags and below it on downward ones; the indicator must
				// say so, not always point above.
				row.toggleClass(
					'sheetsmith-attribute-drop-below',
					index > this.dragIndex,
				);
				row.toggleClass('sheetsmith-attribute-drop', index < this.dragIndex);
			});
			row.addEventListener('dragleave', () => {
				row.removeClass('sheetsmith-attribute-drop');
				row.removeClass('sheetsmith-attribute-drop-below');
			});
			row.addEventListener('drop', (event) => {
				event.preventDefault();
				row.removeClass('sheetsmith-attribute-drop');
				row.removeClass('sheetsmith-attribute-drop-below');
				if (this.dragIndex === null || this.dragIndex === index) return;
				this.moveAttribute(list, this.dragIndex, index);
				this.dragIndex = null;
			});

			const keyInput = row.createEl('input', {
				type: 'text',
				attr: { placeholder: 'Key', 'aria-label': 'Attribute key' },
			});
			keyInput.value = attribute.key;
			keyInput.dataset.sheetsmithFocus = `attr-${config.id}-${index}-key`;
			keyInput.addEventListener('change', () => {
				const next = keyInput.value.trim();
				if (next === '') {
					showFieldError(keyInput, 'A key is required.');
					return;
				}
				if (list.some((other, i) => i !== index && other.key === next)) {
					showFieldError(
						keyInput,
						`"${next}" is already used by another attribute.`,
					);
					return;
				}
				showFieldError(keyInput, null);
				attribute.key = next;
				void this.persist();
				this.redraw();
			});

			const nameInput = row.createEl('input', {
				type: 'text',
				attr: { placeholder: 'Full name', 'aria-label': 'Attribute full name' },
			});
			nameInput.value = attribute.name ?? '';
			// Keyed by identity, unlike the key input: name commits do not
			// redraw, so the only redraw this input lives through is a
			// reorder — where focus should follow the item.
			nameInput.dataset.sheetsmithFocus = `attr-${config.id}-${attribute.key}-name`;
			nameInput.addEventListener('change', () => {
				const next = nameInput.value.trim();
				if (next === '') {
					delete attribute.name;
				} else {
					attribute.name = next;
				}
				void this.persist();
			});

			if (Platform.isMobile) {
				// HTML5 drag-and-drop is inert on touch, and there is no
				// keyboard — reordering needs real buttons there.
				const up = row.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Move up' },
				});
				setIcon(up, 'arrow-up');
				up.dataset.sheetsmithFocus = `attr-${config.id}-${attribute.key}-up`;
				up.addEventListener('click', () =>
					this.moveAttribute(list, index, index - 1),
				);
				const down = row.createEl('button', {
					cls: 'clickable-icon',
					attr: { 'aria-label': 'Move down' },
				});
				setIcon(down, 'arrow-down');
				down.dataset.sheetsmithFocus = `attr-${config.id}-${attribute.key}-down`;
				down.addEventListener('click', () =>
					this.moveAttribute(list, index, index + 1),
				);
			} else {
				const handle = row.createEl('button', {
					cls: 'clickable-icon sheetsmith-attribute-handle',
					attr: {
						'aria-label': 'Reorder: drag, or press the arrow keys',
						draggable: 'true',
					},
				});
				setIcon(handle, 'grip-vertical');
				handle.dataset.sheetsmithFocus = `attr-${config.id}-${attribute.key}-handle`;
				handle.addEventListener('dragstart', (event) => {
					this.dragIndex = index;
					event.dataTransfer?.setData('text/plain', attribute.key);
				});
				handle.addEventListener('dragend', () => {
					this.dragIndex = null;
				});
				handle.addEventListener('keydown', (event) => {
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						this.moveAttribute(list, index, index - 1);
					} else if (event.key === 'ArrowDown') {
						event.preventDefault();
						this.moveAttribute(list, index, index + 1);
					}
				});
			}

			const remove = row.createEl('button', {
				cls: 'clickable-icon',
				attr: { 'aria-label': 'Remove attribute' },
			});
			setIcon(remove, 'trash');
			remove.dataset.sheetsmithFocus = `attr-${config.id}-${attribute.key}-remove`;
			remove.addEventListener('click', () => {
				list.splice(index, 1);
				void this.persist();
				this.redraw();
			});
		});

		const footer = listEl.createDiv('sheetsmith-attribute-footer');
		const add = footer.createEl('button', { text: 'Add attribute' });
		add.addEventListener('click', () => {
			const taken = new Set(list.map((attribute) => attribute.key));
			let next = 'new';
			let counter = 2;
			while (taken.has(next)) next = `new-${counter++}`;
			// The obvious next action is typing the key; put focus there.
			this.pendingFocus = `attr-${config.id}-${list.length}-key`;
			list.push({ key: next });
			void this.persist();
			this.redraw();
		});
	}

	private moveAttribute(
		list: { key: string; name?: string }[],
		from: number,
		to: number,
	): void {
		if (to < 0 || to >= list.length) return;
		const [item] = list.splice(from, 1);
		if (item === undefined) return;
		list.splice(to, 0, item);
		void this.persist();
		this.redraw();
	}

	/**
	 * Validate and write the layout, then refresh open sheet views. Invalid
	 * states stay in memory with a notice and are written once corrected.
	 */
	private async persist(): Promise<void> {
		if (!this.file || !this.layout) return;
		let serialised: string;
		try {
			serialised = serialiseLayout(this.layout);
			parseLayout(serialised);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			return;
		}
		await this.plugin.app.vault.modify(this.file, serialised);
		for (const leaf of this.plugin.app.workspace.getLeavesOfType(
			VIEW_TYPE_SHEET,
		)) {
			if (leaf.view instanceof SheetView) leaf.view.refresh();
		}
	}
}

class NameModal extends Modal {
	private onSubmit: (name: string) => void;
	private onCancel: () => void;
	private submitted = false;

	constructor(
		app: App,
		onSubmit: (name: string) => void,
		onCancel: () => void,
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.onCancel = onCancel;
	}

	onOpen(): void {
		this.titleEl.setText('New layout');
		let name = '';
		const submit = () => {
			const trimmed = name.trim();
			if (trimmed === '') return;
			this.submitted = true;
			this.close();
			this.onSubmit(trimmed);
		};
		new Setting(this.contentEl).setName('Name').addText((text) => {
			text.setPlaceholder('Layout name').onChange((value) => {
				name = value;
			});
			text.inputEl.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					submit();
				}
			});
			text.inputEl.focus();
		});
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) =>
				button.setButtonText('Create').setCta().onClick(submit),
			);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.submitted) this.onCancel();
	}
}

class ConfirmModal extends Modal {
	private message: string;
	private cta: string;
	private onConfirm: () => void;

	constructor(app: App, message: string, cta: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.cta = cta;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.contentEl.createEl('p', { text: this.message });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText('Cancel').onClick(() => this.close()),
			)
			.addButton((button) => {
				button.setButtonText(this.cta).onClick(() => {
					this.close();
					this.onConfirm();
				});
				// setDestructive needs Obsidian 1.13; the class works on 1.9.
				button.buttonEl.addClass('mod-warning');
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * One treatment for every group heading inside a component form, whether it
 * heads a run of fields sharing a `group` or a list field such as attributes.
 * Both sit at the same level, so both must look the same; rendering them from
 * two code paths is what let them drift apart.
 */
function groupHeading(
	form: HTMLElement,
	title: string,
	description?: string,
): void {
	const heading = form.createDiv('sheetsmith-form-group');
	heading.createDiv({ cls: 'sheetsmith-form-group-title', text: title });
	if (description) {
		heading.createDiv({ cls: 'setting-item-description', text: description });
	}
}

/** Commit on change (blur or Enter), never per keystroke. */
function onCommit(
	text: TextComponent,
	handler: (value: string) => void,
): void {
	text.inputEl.addEventListener('change', () => handler(text.inputEl.value));
}

/**
 * Inline validation: mark the input and show a message under the field, or
 * clear both. Invalid input is never silently swallowed. The message is
 * keyed to the input's focus id, because several inputs (the four position
 * fields) share one setting control and each needs its own error.
 */
function showFieldError(input: HTMLInputElement, message: string | null): void {
	input.toggleClass('sheetsmith-input-invalid', message !== null);
	const control = input.parentElement;
	if (!control) return;
	const key = input.dataset.sheetsmithFocus ?? '';
	let existing: HTMLElement | null = null;
	for (const candidate of Array.from(
		control.querySelectorAll('.sheetsmith-field-error'),
	)) {
		if (
			candidate.instanceOf(HTMLElement) &&
			candidate.dataset.sheetsmithFor === key
		) {
			existing = candidate;
			break;
		}
	}
	if (message === null) {
		existing?.remove();
		return;
	}
	if (existing) {
		existing.setText(message);
		return;
	}
	control.createDiv('sheetsmith-field-error', (el) => {
		el.dataset.sheetsmithFor = key;
		el.setText(message);
	});
}

/** Indices of components whose grid rectangles intersect another's. */
function findOverlaps(components: ComponentConfig[]): Set<number> {
	const overlapping = new Set<number>();
	const intersects = (a: GridPosition, b: GridPosition): boolean =>
		a.col < b.col + b.width &&
		b.col < a.col + a.width &&
		a.row < b.row + b.height &&
		b.row < a.row + a.height;
	for (let i = 0; i < components.length; i++) {
		for (let j = i + 1; j < components.length; j++) {
			const a = components[i] as ComponentConfig;
			const b = components[j] as ComponentConfig;
			if (intersects(a.position, b.position)) {
				overlapping.add(i);
				overlapping.add(j);
			}
		}
	}
	return overlapping;
}

/** Display name for a component type id: "stat-group" → "Stat Group". */
function componentDisplayName(type: string): string {
	return type
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

function uniqueLabel(type: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.label));
	const base = componentDisplayName(type);
	let label = base;
	let counter = 2;
	while (taken.has(label)) label = `${base} ${counter++}`;
	return label;
}

/**
 * The id is what formulas reference, so it has to be a name the expression
 * parser accepts: underscores rather than hyphens, since a hyphen would read
 * as subtraction, and never a leading digit. Kept in step with COMPONENT_ID
 * in parse/layout.ts, which migrates anything this could not have produced —
 * including the hyphenated ids this function itself emitted before the clash
 * with the parser was understood.
 */
function uniqueId(label: string, components: ComponentConfig[]): string {
	const taken = new Set(components.map((c) => c.id));
	let base =
		label
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '') || 'component';
	if (/^[0-9]/.test(base)) base = `_${base}`;
	let id = base;
	let counter = 2;
	while (taken.has(id)) id = `${base}_${counter++}`;
	return id;
}

function nextFreeRow(components: ComponentConfig[]): number {
	let next = 1;
	for (const component of components) {
		next = Math.max(next, component.position.row + component.position.height);
	}
	return next;
}
