/*
 * The layout editor's component picker: what **Add component** opens
 * (`docs/features/component-picker.md`).
 *
 * A disclosure in the pane's own flow, directly under the row that opens it
 * and above the tree — not a modal, whose backdrop would hide the canvas an
 * insert lands on, and not the configuration panel, which in the stacked
 * regime is a tree's length away from the button. It holds a search field, the
 * catalog as a listbox with each type's palette entries under it, a live
 * preview of the active line, and an action bar pinned to the pane's foot with
 * the destination, **Add** and a line saying what the last press did.
 *
 * **Seeing and adding are two steps**, because a finger has no hover to look
 * with: a press on a line makes it active and never inserts; **Add** or Enter
 * inserts. **It stays open across inserts**, with the query, the active line and
 * the destination kept, so a second Track is one more press and filling a Group
 * is repeated presses of **Add**.
 *
 * What it owns is the drawing and the posture that has to survive the pane's
 * redraws — open, query, active line, destination, the last report — held on
 * this instance, which the editor keeps for its lifetime the way it keeps the
 * canvas. What it does not own is the insert: that writes the layout, and the
 * layout is the editor's (`PickerHost.insert`). The catalog and its search are
 * `picker-catalog.ts`; the preview is `component-preview.ts`.
 *
 * No test file of its own, and §10 does not license that: its entry-point
 * bullet says a module like this earns one. It is tested through the pane on
 * purpose — every case needs the real insert, redraw and focus restore, and
 * `layout-editor.test.ts` drives every control a user presses — which is the gap
 * `docs/BACKLOG.md` § Patterns records in its "§10 does not name a module cut
 * from the editor" row, where this module is listed.
 */

import { ButtonComponent, DropdownComponent, Setting } from 'obsidian';
import { acceptsChildren } from './accepts-children';
import {
	EXAMPLE_SENTENCE,
	isExample,
	renderComponentPreview,
} from './component-preview';
import {
	filterCatalog,
	noMatchMessage,
	PickerChoice,
	pickerCatalog,
} from './picker-catalog';
import { Layout } from '../parse/layout';
import { WalkEntry, walkComponents } from '../parse/layout-walk';
import { ComponentConfig } from '../types';
import { SHEET_DESTINATION } from './tree';

/**
 * What the picker needs from the editor hosting it.
 *
 * `insert` does not redraw: the picker has a report to write and a focus to ask
 * for between the insert and the redraw, and a host that redrew first would
 * draw the picker without either.
 */
export interface PickerHost {
	/**
	 * Put the component this line describes into the layout, inside `into` or on
	 * the sheet, select it and persist. Returns the label it was given.
	 */
	insert(choice: PickerChoice, into: ComponentConfig | null): string;
	/** Focus the control carrying this token once the next redraw lands. */
	focusAfterRedraw(token: string): void;
	/** Rebuild the pane from the layout as it now stands. */
	redraw(): void;
}

/** Focus tokens, the pane's own addresses for restoring focus across a redraw. */
const TOKEN = {
	toggle: 'picker-toggle',
	search: 'picker-search',
	list: 'picker-list',
	add: 'picker-add',
	destination: 'add-destination',
} as const;

/**
 * Leading space for a destination option that sits under another, by how many
 * levels in it is.
 *
 * A figure space, because it is the one space character with a width that does
 * not collapse and does not vary with the digits around it, and a `<select>` has
 * no other way to say that one option sits under another. One consumer since the
 * type dropdown beside it became the picker's list, which indents by padding.
 */
function indent(depth: number): string {
	return '\u2007'.repeat(depth * 2);
}

/**
 * How many pickers have been built, for ids that stay unique when two panes are
 * open on one layout — a supported state, so a module literal would be carried
 * by two live elements at once (`described-row.ts` records the same case).
 */
let instances = 0;

export class ComponentPicker {
	private readonly catalog = pickerCatalog();
	private readonly ids: { region: string; list: string; option: string };

	private open = false;
	private query = '';
	/** The active line's `value`, or null where nothing is showing. */
	private active: string | null = null;
	/** A container's id, or `SHEET_DESTINATION`. */
	private destination: string = SHEET_DESTINATION;
	/** What the last insert did, kept until the next one. */
	private status = '';

	/** The controls a local repaint updates, from the last render. */
	private els: {
		toggle: HTMLButtonElement;
		slot: HTMLElement;
		region?: HTMLElement;
		bar?: HTMLElement;
		search?: HTMLInputElement;
		list?: HTMLElement;
		empty?: HTMLElement;
		add?: ButtonComponent;
	} | null = null;
	private layout: Layout | null = null;
	private host: PickerHost | null = null;

	constructor() {
		instances += 1;
		const base = `sheetsmith-picker-${instances}`;
		this.ids = { region: base, list: `${base}-list`, option: `${base}-option` };
	}

	/**
	 * Close and forget everything, as opening another layout does. Called where
	 * the editor clears its undo history, which is the same moment.
	 */
	reset(): void {
		this.open = false;
		this.query = '';
		this.active = null;
		this.destination = SHEET_DESTINATION;
		this.status = '';
	}

	/**
	 * Draw the **Add component** row, and the picker under it where it is open.
	 *
	 * Called on every pane render. Everything a render draws is rebuilt from the
	 * state above, so a redraw for an insert, an undo or a panel edit leaves the
	 * picker exactly as the author had it.
	 */
	render(container: HTMLElement, layout: Layout, host: PickerHost): void {
		this.layout = layout;
		this.host = host;
		let toggle: HTMLButtonElement | null = null;
		new Setting(container).setName('Add component').addButton((button) => {
			toggle = button.buttonEl;
			button.onClick(() => this.setOpen(!this.open));
		});
		if (toggle === null) return;
		const slot = container.createDiv();
		this.els = { toggle, slot };
		this.paint();
	}

	/** Open or close, in place, and put focus where the gesture expects it. */
	private setOpen(open: boolean): void {
		this.open = open;
		if (open) {
			// A fresh picker every time it is opened: the posture that survives is
			// the posture of *one* opening, across its inserts and redraws.
			this.query = '';
			this.active = null;
			this.destination = SHEET_DESTINATION;
			this.status = '';
		}
		this.paint();
		if (!open) {
			this.els?.toggle.focus({ preventScroll: true });
			return;
		}
		const search = this.els?.search;
		search?.focus({ preventScroll: true });
		// Scrolled on purpose rather than by the focus call: in a short pane the
		// picker opens below the fold, and a focused field under the pinned bar is
		// focus nobody can see (WCAG 2.4.11). The active line first, then the
		// field, so where both cannot fit the field is the one that shows.
		this.reveal(this.activeOption());
		this.reveal(search);
	}

	/** The active line's element, from the last repaint. */
	private activeOption(): HTMLElement | null {
		if (this.active === null) return null;
		return (
			this.els?.list?.querySelector<HTMLElement>(
				`[data-sheetsmith-choice="${CSS.escape(this.active)}"]`,
			) ?? null
		);
	}

	/**
	 * Scroll an element into view, clear of the pinned bar.
	 *
	 * `block: 'nearest'` lines an element's bottom up with the scroller's, which is
	 * exactly where the bar sits, so the bar's height is published for the
	 * stylesheet's `scroll-margin-bottom` first. Measured rather than written into
	 * the stylesheet, because the bar grows a line once there is a report on it.
	 *
	 * Called only on the author's own gestures — opening, and moving the active
	 * line — and never on a render, so an insert's redraw leaves the pane where
	 * the pane's own scroll restore put it.
	 */
	private reveal(el: HTMLElement | null | undefined): void {
		const { region, bar } = this.els ?? {};
		if (!el || !region || !bar) return;
		region.style.setProperty('--sheetsmith-picker-bar', `${bar.offsetHeight}px`);
		// Guarded, because a test DOM need not implement it; the app's does.
		if (typeof el.scrollIntoView === 'function') {
			el.scrollIntoView({ block: 'nearest' });
		}
	}

	/** Rebuild the button's state and the whole region from the state above. */
	private paint(): void {
		const els = this.els;
		if (els === null) return;
		const { toggle, slot } = els;
		toggle.setText(this.open ? 'Done' : 'Choose');
		toggle.dataset.sheetsmithFocus = TOKEN.toggle;
		toggle.setAttribute('aria-expanded', String(this.open));
		toggle.setAttribute('aria-controls', this.ids.region);
		slot.replaceChildren();
		this.els = { toggle, slot };
		if (!this.open || this.layout === null) return;

		const region = slot.createDiv({
			cls: 'sheetsmith-picker',
			attr: { id: this.ids.region },
		});
		const search = region.createEl('input', {
			cls: 'sheetsmith-picker-search',
			type: 'search',
			placeholder: 'Search components',
			attr: {
				role: 'combobox',
				'aria-expanded': 'true',
				'aria-controls': this.ids.list,
				'aria-autocomplete': 'list',
				'aria-label': 'Search components',
			},
		});
		search.value = this.query;
		search.dataset.sheetsmithFocus = TOKEN.search;
		search.addEventListener('input', () => {
			this.query = search.value;
			// The first visible line becomes active on every change of query.
			this.active = null;
			this.paintList();
		});
		search.addEventListener('keydown', (event) => this.onKey(event, search));

		const list = region.createDiv({
			cls: 'sheetsmith-picker-list',
			attr: {
				id: this.ids.list,
				role: 'listbox',
				'aria-label': 'Components',
				tabindex: '-1',
			},
		});
		list.dataset.sheetsmithFocus = TOKEN.list;
		list.addEventListener('keydown', (event) => this.onKey(event, list));
		const empty = region.createDiv('sheetsmith-picker-empty');

		const bar = region.createDiv('sheetsmith-picker-bar');
		const controls = bar.createDiv('sheetsmith-picker-controls');
		this.renderDestination(controls, this.layout);
		const add = new ButtonComponent(controls).onClick(() => this.add(TOKEN.add));
		add.buttonEl.dataset.sheetsmithFocus = TOKEN.add;
		bar.createDiv({
			cls: 'sheetsmith-picker-status',
			text: this.status,
			attr: { role: 'status' },
		});

		this.els = { toggle, slot, region, bar, search, list, empty, add };
		this.paintList();
	}

	/**
	 * The destination dropdown, drawn only where the layout has a container that
	 * still takes a child: a menu offering the sheet and nothing else says a
	 * layout has containers when it has none.
	 */
	private renderDestination(into: HTMLElement, layout: Layout): void {
		const destinations = this.destinations(layout);
		if (!destinations.some((entry) => entry.config.id === this.destination)) {
			this.destination = SHEET_DESTINATION;
		}
		if (destinations.length === 0) return;
		const dropdown = new DropdownComponent(into);
		dropdown.addOption(SHEET_DESTINATION, 'On the sheet');
		for (const { config, depth } of destinations) {
			dropdown.addOption(config.id, `${indent(depth)}In ${config.label}`);
		}
		dropdown.setValue(this.destination);
		dropdown.selectEl.dataset.sheetsmithFocus = TOKEN.destination;
		dropdown.selectEl.setAttribute('aria-label', 'Where to add it');
		dropdown.onChange((value) => {
			this.destination = value;
		});
	}

	/**
	 * Every container that may still take a child. A container already two deep
	 * is left out, so the depth the parser refuses is never something the editor
	 * can walk into.
	 */
	private destinations(layout: Layout): WalkEntry[] {
		return walkComponents(layout.components).filter((entry) =>
			acceptsChildren(entry.config, entry.depth),
		);
	}

	/** The lines the query leaves showing. */
	private visible(): PickerChoice[] {
		return filterCatalog(this.catalog, this.query);
	}

	/** The active line, falling back to the first visible one. */
	private activeChoice(visible: readonly PickerChoice[]): PickerChoice | undefined {
		return visible.find((choice) => choice.value === this.active) ?? visible[0];
	}

	private optionId(choice: PickerChoice): string {
		return `${this.ids.option}-${choice.value.replace(/[^a-z0-9-]/g, '-')}`;
	}

	/**
	 * Rebuild the list, its one preview and the bar's **Add**, in place.
	 *
	 * In place rather than through a pane redraw, because typing and arrowing
	 * happen a keystroke at a time and a redraw would rebuild the canvas, the
	 * tree and the panel for each one. The search field is not rebuilt, so the
	 * caret stays where it was.
	 */
	private paintList(): void {
		const { search, list, empty, add } = this.els ?? {};
		if (!search || !list || !empty || !add) return;
		const visible = this.visible();
		const active = this.activeChoice(visible);
		this.active = active?.value ?? null;
		list.replaceChildren();

		let group: HTMLElement | null = null;
		for (const choice of visible) {
			const id = this.optionId(choice);
			if (!choice.entry) {
				group = list.createDiv({
					cls: 'sheetsmith-picker-group',
					attr: { role: 'group', 'aria-labelledby': `${id}-name` },
				});
			}
			const option = (group ?? list).createDiv({
				cls: 'sheetsmith-picker-option',
				attr: {
					id,
					role: 'option',
					'aria-selected': String(choice === active),
					'aria-labelledby': `${id}-name`,
					'aria-describedby': `${id}-description`,
				},
			});
			option.dataset.sheetsmithChoice = choice.value;
			option.toggleClass('sheetsmith-picker-entry', choice.entry);
			option.toggleClass('is-active', choice === active);
			option.createDiv({
				cls: 'sheetsmith-picker-name',
				text: choice.name,
				attr: { id: `${id}-name` },
			});
			const description = option.createDiv({
				cls: 'sheetsmith-picker-description',
				text: choice.description,
				attr: { id: `${id}-description` },
			});
			// Said to a screen reader for every line whose drawing is an example,
			// because the drawing is not what **Add** writes — a Track inserted after
			// its five-segment example arrives with no length, drawing its empty state.
			if (isExample(choice)) {
				description.createSpan({
					cls: 'sheetsmith-sr-only',
					text: ` ${EXAMPLE_SENTENCE}`,
				});
			}
			// A press makes a line active and moves focus to the list, so a phone's
			// keyboard drops and the bar is in reach. It never inserts.
			option.addEventListener('click', () => {
				this.activate(choice.value);
				list.focus({ preventScroll: true });
			});
			if (choice === active) {
				renderComponentPreview(option.createDiv('sheetsmith-picker-preview'), choice);
			}
		}

		const nothing = visible.length === 0;
		list.toggleAttribute('hidden', nothing);
		empty.setText(nothing ? noMatchMessage(this.query) : '');
		empty.toggleAttribute('hidden', !nothing);

		const activeId = active === undefined ? null : this.optionId(active);
		for (const owner of [search, list]) {
			if (activeId === null) owner.removeAttribute('aria-activedescendant');
			else owner.setAttribute('aria-activedescendant', activeId);
		}
		add.setButtonText(active === undefined ? 'Add' : `Add ${active.name}`);
		add.setDisabled(active === undefined);
	}

	/** Make one line active, repaint, and keep it and its preview in view. */
	private activate(value: string): void {
		this.active = value;
		this.paintList();
		this.reveal(this.activeOption());
	}

	/**
	 * The keys the search field and the list both answer: the arrows move the
	 * active line across groups as one sequence, wrapping at neither end; Enter
	 * adds it; Escape clears a query first and then closes.
	 */
	private onKey(event: KeyboardEvent, from: HTMLElement): void {
		const visible = this.visible();
		const at = visible.findIndex((choice) => choice.value === this.active);
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			const step = event.key === 'ArrowDown' ? 1 : -1;
			const next = visible[Math.min(Math.max(at + step, 0), visible.length - 1)];
			if (next !== undefined) this.activate(next.value);
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			this.add(from.dataset.sheetsmithFocus ?? TOKEN.search);
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			if (this.query !== '' && this.els?.search) {
				this.query = '';
				this.els.search.value = '';
				this.active = null;
				this.paintList();
				return;
			}
			this.setOpen(false);
		}
	}

	/**
	 * Insert the active line, report it, and redraw with focus back on the
	 * control that added — the picker stays open.
	 */
	private add(focus: string): void {
		const host = this.host;
		const layout = this.layout;
		if (host === null || layout === null) return;
		const choice = this.activeChoice(this.visible());
		if (choice === undefined) return;
		const into =
			this.destinations(layout).find((entry) => entry.config.id === this.destination)
				?.config ?? null;
		const label = host.insert(choice, into);
		this.status = `Added ${label} ${into === null ? 'on the sheet' : `in ${into.label}`}`;
		host.focusAfterRedraw(focus);
		host.redraw();
	}
}
