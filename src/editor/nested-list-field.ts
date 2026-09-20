/*
 * A list inside one row of another list, for the layout editor.
 *
 * **The field kind `SPEC` §13 records as missing.** That entry separates the
 * question into two halves — a *surface* wide enough to hold one, which the
 * configuration panel is and a 620px settings tab was not, and a *renderer*,
 * which nothing had. This is the renderer. It does not build Table's `select`
 * column, which is what the entry is about; it removes that column's stated
 * blocker and leaves the column itself out of scope.
 *
 * **It knows nothing about modifiers, and that is the whole of the boundary.**
 * A caller draws each line's own controls into the element it is handed and says
 * what a line is called; this owns the frame — the lines, the trailing control
 * track, the remove, the footer's add, and the rule that the remove is reserved
 * and hidden where there is only one line to remove. Which is the arrangement
 * `components/linked-text.ts` and `components/picture-frame.ts` already use on
 * the other side of the codebase: the classes and the domain words are the
 * caller's, so a module beside the fields does not learn that a modifier exists.
 *
 * **Its own module rather than a private helper in the field that wanted it**,
 * against `PATTERNS.md` §1's one-consumer rule, and the argument is
 * `components/modifier-form.ts`': atomicity rather than reuse. Drawing a nested
 * list is a second job in a file whose job is the layout's modifier definitions,
 * and the §13 entry above is the record that a second consumer is already named.
 * A one-consumer sibling arrives with the atomicity argument or it does not
 * arrive.
 *
 * **No reorder control and no drag**, and that is a refusal rather than an
 * omission (`docs/UI.md` §6 asks for the argument). Order inside a nested list is
 * not observable for the one caller there is: a breakdown lists contributors in
 * *definition* declaration order, two changes at different targets appear in two
 * different breakdowns, and two at one target contest by size rather than by
 * position. So there is no reading a reorder could change. The outer list keeps
 * its drag, and `ListContext.drag` stays the single shared `{ index }` it is,
 * with nothing nested inside it competing for the same slot. A second caller for
 * which order *is* observable is what would earn one, and it would earn a second
 * shared index with it.
 */

import { setIcon } from 'obsidian';
import { ListContext } from './list-fields';

export interface NestedListOptions {
	/**
	 * What the list is called, drawn above its lines and carried as its own
	 * accessible name.
	 *
	 * **The list is named and its lines' first control is named something
	 * narrower**, which is the collision this field kind is most prone to: a
	 * heading reading the same word as the control under it says one word for two
	 * things, and a list with no heading at all says nothing for the group while
	 * the lines say everything for themselves.
	 */
	listLabel: string;
	/**
	 * How many lines to draw. The caller normalises, and **one is the floor**: a
	 * nested list that can be emptied is a list whose parent then means something
	 * the parent's own report has to explain twice.
	 */
	count: number;
	/**
	 * Draw one line's own controls. Everything domain-shaped is here, so this
	 * module never names a field, a label or a class of the caller's.
	 */
	renderLine: (line: HTMLElement, index: number) => void;
	/** What one line is called, for its remove control's accessible name. */
	nameOf: (index: number) => string;
	/** The footer button's words, in sentence case. */
	addLabel: string;
	/** What the footer button does. Persisting and redrawing are the caller's. */
	onAdd: () => void;
	/** What the remove control does, once it is confirmed. */
	onRemove: (index: number) => void;
	/**
	 * What removing this line would destroy, or null where it would destroy
	 * nothing — `addControls`' own contract, so a nested remove and an outer one
	 * ask on the same terms.
	 */
	describeRemoval?: (index: number) => string | null;
	/** Focus tokens are `${token}-${index}-remove` and `${token}-add`. */
	token: string;
	context: ListContext;
}

/**
 * Draw a nested list into `parent`: one line per entry, then an add footer.
 *
 * The lines are drawn whatever `count` says, so a caller that normalised an empty
 * list to one blank entry gets one line and not none.
 */
export function nestedList(
	parent: HTMLElement,
	options: NestedListOptions,
): void {
	const { context } = options;
	const listEl = parent.createDiv('sheetsmith-nested-list');
	/*
	 * **A group with a name, so the lines under it are one thing rather than
	 * several.** `role="group"` and an `aria-label` rather than an
	 * `aria-labelledby` pointing at the span below: the pane is rebuilt on every
	 * commit, so a generated id would have to be unique across every redraw that
	 * ever happened — `components/modifier-form.ts`'s own argument for wrapping a
	 * label rather than pairing one. The two strings are one literal, so the
	 * accessible name contains the visible text (`docs/UI.md` §6) rather than
	 * replacing it with a word that is nowhere on screen.
	 */
	listEl.setAttribute('role', 'group');
	listEl.setAttribute('aria-label', options.listLabel);
	listEl.createSpan({
		cls: 'sheetsmith-nested-label',
		text: options.listLabel,
	});

	for (let index = 0; index < options.count; index++) {
		const line = listEl.createDiv('sheetsmith-nested-line');
		options.renderLine(line, index);

		/*
		 * **The control track is drawn on every line and hidden on the only one.**
		 * There is nothing to remove *to* — the floor is one — so the control is
		 * inert rather than destructive, and it is out of the tab order and out of
		 * the accessibility tree while it is.
		 *
		 * **It was reserved on `.sheetsmith-detail-field-reserved`'s argument — a
		 * control that is not created gives its width back to the line's grow — and
		 * that argument does not hold for this track.** Measured, not reasoned:
		 * removing the track outright renders byte-identical to hiding it, at 1400,
		 * 1210, 960 and 620 of pane. The reason is where it lands. The caller's line
		 * carries `.sheetsmith-detail-break`, so the track is the last child of the
		 * *second* row, and that row's children are all `-tight`, `flex: 0 0 auto`;
		 * the line's grow lives on the first row, which the track never joins. So
		 * there is no dividend for it to take and none to give back.
		 *
		 * Kept anyway, and the reason is the one thing the measurement does not
		 * cover: the row a track lands on is the *caller's* arrangement, and a
		 * caller whose line does not force a break would put this beside a flexible
		 * field, where the reservation is exactly what stops one-line and multi-line
		 * entries reading as two forms. Reserving is insurance against that caller,
		 * not work being done for this one — which is what this paragraph now says
		 * rather than claiming a dividend it measured at zero.
		 */
		const track = line.createDiv('sheetsmith-nested-controls');
		const remove = track.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': `Remove ${options.nameOf(index)}` },
		});
		setIcon(remove, 'trash');
		if (options.count === 1) {
			track.addClass('sheetsmith-nested-controls-reserved');
			track.setAttribute('aria-hidden', 'true');
			continue;
		}
		remove.dataset.sheetsmithFocus = `${options.token}-${index}-remove`;
		remove.addEventListener('click', () => {
			const drop = () => options.onRemove(index);
			const cost = options.describeRemoval?.(index) ?? null;
			if (cost === null) {
				drop();
				return;
			}
			context.confirm(cost, 'Remove', drop);
		});
	}

	const footer = listEl.createDiv('sheetsmith-entry-footer');
	const add = footer.createEl('button', { text: options.addLabel });
	add.dataset.sheetsmithFocus = `${options.token}-add`;
	add.addEventListener('click', options.onAdd);
}
