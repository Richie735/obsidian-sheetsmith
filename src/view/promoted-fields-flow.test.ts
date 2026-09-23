// @vitest-environment happy-dom
/*
 * The promoted-field write, end to end through a real `SheetView` (SPEC §9).
 *
 * **Driven through the view rather than through a mirror of `renderSheet`**,
 * because the whole of what this commit adds is the view's: the cadence, the
 * generation re-check, the commit with the redraw suppressed, and the refusal
 * notice. What the list *says* and what a note's frontmatter therefore holds are
 * `parse/promoted-fields.test.ts`'s, and nothing here re-asserts them.
 *
 * The write's own arithmetic is asserted as a **count** wherever "nothing
 * happened" is the claim: a strip and a restore end where they started, and no
 * comparison of final states can tell that from having done nothing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promotedFieldMessage, SheetView } from './sheet-view';
import { App, Notice, TextFileView } from '../test/obsidian-stub';
import { fakePlugin, LAYOUT_FOLDER } from '../test/plugin';
import { openView } from '../test/workspace';

/** A card whose stored value is promoted, and a table whose total is. */
const COMPONENTS = [
	{
		id: 'armour_class',
		type: 'card',
		label: 'Armour class',
		position: { col: 1, row: 1, width: 2, height: 1 },
	},
	{
		id: 'items',
		type: 'table',
		label: 'Magic items',
		position: { col: 3, row: 1, width: 6, height: 2 },
		columns: [{ key: 'Weight', type: 'number', total: true, publish: true }],
		rows: [{ label: 'Rope', key: 'rope' }],
	},
];

const PROMOTED_FIELDS = [
	{ name: 'armour_class', property: 'ac' },
	{ name: 'items.Weight', property: 'weight' },
];

/** A note holding an armour class of 15 and one rope weighing 3. */
function note(frontmatter: readonly string[]): string {
	return [
		'---',
		'sheet-layout: L',
		...frontmatter,
		'---',
		'',
		'## Armour class',
		'```sheet',
		'value: 15',
		'```',
		'',
		'## Magic items',
		'',
		'| Name | Weight |',
		'|---|---|',
		'| Rope | 3 |',
		'',
	].join('\n');
}

/** One turn of the loop, which is what a render started and not awaited needs. */
const settle = () => new Promise((resolve) => window.setTimeout(resolve, 0));

async function sheetOn(
	text: string,
	layout: Record<string, unknown> = {},
): Promise<{
	app: App;
	view: SheetView;
	/** How many times the layout has been read, which is once per render. */
	renders: () => number;
}> {
	const app = new App();
	await app.vault.createFolder(LAYOUT_FOLDER);
	const layoutPath = `${LAYOUT_FOLDER}/L.json`;
	await app.vault.create(
		layoutPath,
		JSON.stringify({ name: 'L', components: COMPONENTS, ...layout }),
	);
	const file = await app.vault.create('Aramil.md', text);
	const view = await openView(app, document.body, SheetView, fakePlugin(app));
	/*
	 * One layout read per render. A proxy rather than a spy on the render itself,
	 * which is private — and an honest one: `loadLayout` reads the file every
	 * time, with no cache between it and the vault.
	 */
	let reads = 0;
	const read = app.vault.read.bind(app.vault);
	vi.spyOn(app.vault, 'read').mockImplementation(async (target) => {
		if (target.path === layoutPath) reads++;
		return read(target);
	});
	await (view as unknown as TextFileView).onLoadFile(file);
	await settle();
	return { app, view, renders: () => reads };
}

beforeEach(() => {
	Notice.messages = [];
	Notice.instances = [];
});

describe('a layout that promotes nothing', () => {
	it('leaves the note identical and does no frontmatter work at all', async () => {
		// The off-by-default promise, honoured in the code path rather than only
		// in the config: there is no `promotedFields` key to read.
		const source = note([]);
		const { view } = await sheetOn(source);
		expect(view.getViewData()).toBe(source);
	});

	it('leaves it identical where the key is there but every row is unusable', async () => {
		// A list that writes nothing must not be the same as a list that writes
		// something and then puts it back.
		const source = note([]);
		const { view } = await sheetOn(source, {
			promotedFields: [{ name: 'armour_class' }, { property: 'ac' }],
		});
		expect(view.getViewData()).toBe(source);
	});
});

describe('a sheet whose promoted values differ from the note', () => {
	it('writes each property once, with the type the value has', async () => {
		const { view } = await sheetOn(note([]), { promotedFields: PROMOTED_FIELDS });
		// Unquoted, because a Base cannot sort on `"15"`.
		expect(view.getViewData()).toBe(note(['ac: 15', 'weight: 3']));
	});

	it('writes through the view’s own save path', async () => {
		const { app, view } = await sheetOn(note([]), { promotedFields: PROMOTED_FIELDS });
		await view.save();
		expect(await app.vault.read(app.vault.getFileByPath('Aramil.md')!)).toBe(
			note(['ac: 15', 'weight: 3']),
		);
	});

	it('does not re-render, so one edit is one render', async () => {
		/*
		 * The write changes one frontmatter line **no component draws**, so a
		 * redraw would buy nothing and cost a second full render on every edit
		 * that moved a promoted value — terminating on the change guard rather
		 * than by construction. Counted, because a second render produces
		 * identical markup and no comparison of the DOM could see it.
		 */
		const { view, renders } = await sheetOn(note(['ac: 15', 'weight: 3']), {
			promotedFields: PROMOTED_FIELDS,
		});
		const before = renders();
		// One edit to a promoted value, through the view's own data door the way
		// a card's commit does.
		(view as unknown as { commit(text: string): void }).commit(
			note(['ac: 15', 'weight: 3']).replace('value: 15', 'value: 16'),
		);
		await settle();

		expect(renders() - before).toBe(1);
		expect(view.getViewData()).toContain('ac: 16');
	});
});

describe('a sheet whose promoted values agree with the note', () => {
	it('makes no write and leaves nothing pending', async () => {
		const source = note(['ac: 15', 'weight: 3']);
		const { app, view } = await sheetOn(source, { promotedFields: PROMOTED_FIELDS });

		expect(view.getViewData()).toBe(source);
		const writes = vi.spyOn(app.vault, 'modify');
		await view.save();
		// Asserted on the call: an unconditional write here puts back bytes
		// identical to the file, which no comparison of contents could tell from
		// not writing — and what it would destroy is the note's modified time.
		expect(writes).not.toHaveBeenCalled();
	});

	it('still writes nothing after several renders', async () => {
		const source = note(['ac: 15', 'weight: 3']);
		const { view } = await sheetOn(source, { promotedFields: PROMOTED_FIELDS });
		view.refresh();
		await settle();
		view.refresh();
		await settle();
		expect(view.getViewData()).toBe(source);
	});
});

describe('a promoted property the note will not give up', () => {
	const held = note(['ac:', '  - 15', '  - 16']);

	it('says so once, naming the property and the fix', async () => {
		const { view } = await sheetOn(held, { promotedFields: PROMOTED_FIELDS });
		expect(Notice.messages).toEqual([
			'Sheetsmith could not write the property "ac": this note already has a "ac" holding a list. Remove it, or point the layout’s promoted field at another property.',
		]);
		// And the refusal changed nothing about that property.
		expect(view.getViewData()).toContain('ac:\n  - 15\n  - 16\n');
	});

	it('still writes every other property', async () => {
		const { view } = await sheetOn(held, { promotedFields: PROMOTED_FIELDS });
		expect(view.getViewData()).toContain('weight: 3');
	});

	it('leaves every card on the sheet rendered and editable', async () => {
		// `docs/UI.md` §10 wants failure in place and there is no place, so the
		// price of the notice is that the sheet must be untouched by it.
		const { view } = await sheetOn(held, { promotedFields: PROMOTED_FIELDS });
		const root = (view as unknown as { contentEl: HTMLElement }).contentEl;
		expect(root.querySelectorAll('.sheetsmith-card').length).toBeGreaterThan(0);
		expect(root.querySelector('.sheetsmith-table')).not.toBeNull();
		expect(
			Array.from(root.querySelectorAll('input')).every(
				(input) => !input.disabled,
			),
		).toBe(true);
	});

	it('names the note rather than a property where the block is the obstacle', async () => {
		const { view } = await sheetOn(note(['tags:', '- party']), {
			promotedFields: PROMOTED_FIELDS,
		});
		expect(Notice.messages).toEqual([
			'Sheetsmith could not write this note\'s promoted properties: this note\'s frontmatter has a line Sheetsmith cannot account for: "- party". Fix that line, and the property is written on the next render.',
		]);
		expect(view.getViewData()).toBe(note(['tags:', '- party']));
	});
});

describe('a promoted value that did not resolve on this render', () => {
	it('leaves its property alone, and writes nothing at all', async () => {
		/*
		 * **The transient arm, driven through the real name table.**
		 * `parse/promoted-fields.test.ts` can only assert the rule — a name that
		 * answers nothing leaves its property alone — because every cause reaches
		 * it as a resolver answering `undefined`. What needs the sheet is that a
		 * *real* cause reaches it that way, so this is a card whose `derived`
		 * genuinely will not parse: `buildSheet` builds the scope, the formula
		 * fails, the name publishes nothing, and the card beside it draws `?`.
		 *
		 * Asserted as a write count rather than as a final state, because a strip
		 * and a restore end where they started.
		 */
		const source = note(['ac: 15', 'weight: 3']);
		const { app, view } = await sheetOn(source, {
			components: [
				{ ...COMPONENTS[0], derived: '10 + ' },
				...COMPONENTS.slice(1),
			],
			promotedFields: PROMOTED_FIELDS,
		});

		expect(view.getViewData()).toBe(source);
		const writes = vi.spyOn(app.vault, 'modify');
		await view.save();
		expect(writes).not.toHaveBeenCalled();
		// The sheet is showing its own failure at the card, which is the whole
		// argument for leaving the property: removing it would assert something
		// stronger than the card does.
		const root = (view as unknown as { contentEl: HTMLElement }).contentEl;
		expect(root.textContent).toContain('?');
	});
});

describe('a component this version of the plugin cannot draw', () => {
	/**
	 * The layout with `armour_class` typed as something the registry has no
	 * entry for — a layout shared from a newer plugin version, or a hand-edited
	 * `type` typo.
	 */
	const UNKNOWN = {
		components: [
			{ ...COMPONENTS[0], type: 'thermometer' },
			...COMPONENTS.slice(1),
		],
		promotedFields: PROMOTED_FIELDS,
	};

	it('leaves its promoted property exactly as it is', async () => {
		/*
		 * **The structural arm must not reach it**, and this is the case that
		 * separates the two arms most sharply: the component is still declared,
		 * still holds its data, and the sheet has no answer about its value
		 * because it cannot draw it at all. `view/grid-cells.ts` already frames
		 * this exactly — "the layout is broken, not the sheet".
		 *
		 * Before this, `getComponent` answered undefined, `modifierTargetSource`
		 * published nothing, the name was absent from the layout's published set,
		 * and the row was *retired* — so opening one sheet deleted `ac` from that
		 * note, and opening a party's worth deleted it from all of them, one real
		 * write each.
		 */
		const source = note(['ac: 15', 'weight: 3']);
		const { app, view } = await sheetOn(source, UNKNOWN);

		expect(view.getViewData()).toBe(source);
		const writes = vi.spyOn(app.vault, 'modify');
		await view.save();
		expect(writes).not.toHaveBeenCalled();
	});

	it('still writes the properties of the components it can draw', async () => {
		// One broken type must not stop the rest of the list, which is the same
		// rule a refused property already follows.
		const { view } = await sheetOn(note([]), UNKNOWN);
		expect(view.getViewData()).toBe(note(['weight: 3']));
	});

	it('says nothing about it through the sheet’s notice channel', async () => {
		// The cell says why, in place. A second sentence in a notice would be
		// `docs/UI.md` §9's two answers to one question.
		await sheetOn(note(['ac: 15', 'weight: 3']), UNKNOWN);
		expect(Notice.messages).toEqual([]);
	});
});

describe('a sheet that cannot be rendered at all', () => {
	it('writes no frontmatter where the note will not parse', async () => {
		const source = 'No frontmatter here.\n';
		const { view } = await sheetOn(source, { promotedFields: PROMOTED_FIELDS });
		expect(view.getViewData()).toBe(source);
		expect(Notice.messages).toEqual([]);
	});

	it('writes no frontmatter where the layout is missing', async () => {
		const source = note([]).replace('sheet-layout: L', 'sheet-layout: Gone');
		const { view } = await sheetOn(source, { promotedFields: PROMOTED_FIELDS });
		expect(view.getViewData()).toBe(source);
	});

	it('writes no frontmatter where the layout will not parse', async () => {
		const app = new App();
		await app.vault.createFolder(LAYOUT_FOLDER);
		await app.vault.create(`${LAYOUT_FOLDER}/L.json`, '{ not json');
		const source = note([]);
		const file = await app.vault.create('Aramil.md', source);
		const view = await openView(app, document.body, SheetView, fakePlugin(app));
		await (view as unknown as TextFileView).onLoadFile(file);
		await settle();
		expect(view.getViewData()).toBe(source);
	});
});

describe('a render whose generation moved under it', () => {
	it('abandons the stale render’s write', async () => {
		/*
		 * The properties-panel race. An edit landing while a render is in flight
		 * arrives through `setViewData`, which bumps the generation, so the older
		 * render must not write text derived from frontmatter that has since
		 * changed.
		 *
		 * **What this drives is the check after `loadLayout`, which is the only
		 * one of the two whose window this suite can open**: nothing between it
		 * and the write awaits, so the re-check at the write is today the same
		 * answer. It is stated there anyway, and the reason is at the code.
		 */
		const { view } = await sheetOn(note([]), { promotedFields: PROMOTED_FIELDS });
		// Two renders in flight, the second holding the newer frontmatter.
		view.setViewData(note(['ac: 99']), false);
		view.setViewData(note(['ac: 98']), false);
		await settle();

		// The newest render's answer, and exactly one of them: a stale render
		// that also wrote would have left `ac: 15` from the older block.
		expect(view.getViewData()).toBe(note(['ac: 15', 'weight: 3']));
	});
});

/*
 * The reset trigger's **Undo**, on a layout that promotes a value the reset
 * moves (SPEC §6 beside §9).
 *
 * **Driven through the real view because that is where the defect was**, and
 * nothing else could have caught it: `view/reset-flow.test.ts` is a mirror of
 * `applyTrigger` whose header says this view "cannot be tested directly without
 * a workspace around it", so the one thing it cannot see is the *ordering*
 * between a synchronous `applyTrigger` and an asynchronous render — which is the
 * whole of the bug. `docs/BACKLOG.md` § Patterns holds that mirror's cost;
 * `openView` is what disproves its premise.
 */
describe('taking back a reset that moved a promoted value', () => {
	/** A pool bound to a long rest, with its current value promoted. */
	const POOL_LAYOUT = {
		components: [
			{
				id: 'hp',
				type: 'pool',
				label: 'Hit points',
				position: { col: 1, row: 1, width: 2, height: 1 },
				max: '10',
				reset: [{ trigger: 'Long rest', action: 'full' }],
			},
		],
		triggers: ['Long rest'],
		promotedFields: [{ name: 'hp', property: 'hp' }],
	};

	/** A note whose pool is at 4 of 10, with the promoted property to match. */
	const POOL_NOTE = [
		'---',
		'sheet-layout: L',
		'hp: 4',
		'---',
		'',
		'## Hit points',
		'```sheet',
		'current: 4',
		'```',
		'',
	].join('\n');

	/** Press the trigger, confirm the modal, and let the render settle. */
	async function longRest(view: SheetView): Promise<void> {
		const root = (view as unknown as { contentEl: HTMLElement }).contentEl;
		const button = Array.from(
			root.querySelectorAll('button.sheetsmith-trigger'),
		).find((one) => one.textContent === 'Long rest') as HTMLButtonElement;
		button.click();
		const confirm = document.body.querySelector(
			'.modal-container .mod-warning',
		) as HTMLButtonElement;
		confirm.click();
		await settle();
	}

	/** The undo link the trigger's own notice offers. */
	function undoLink(): HTMLAnchorElement {
		const notice = Notice.instances.at(-1);
		const link = notice?.messageEl.querySelector('a.sheetsmith-undo');
		if (!link) throw new Error('no undo was offered');
		return link as HTMLAnchorElement;
	}

	it('resets the pool and writes the promoted property with it', async () => {
		const { view } = await sheetOn(POOL_NOTE, POOL_LAYOUT);
		await longRest(view);
		expect(view.getViewData()).toContain('current: 10');
		expect(view.getViewData()).toContain('hp: 10');
	});

	it('puts both the value and the property back', async () => {
		/*
		 * The defect: `offerUndo` snapshotted `this.data` while the reset's own
		 * render had not yet written `hp: 10`, so `restoreDocument`'s guard saw
		 * the note change under it and refused — on every layout that promotes a
		 * value a reset moves.
		 */
		const { view } = await sheetOn(POOL_NOTE, POOL_LAYOUT);
		await longRest(view);
		Notice.messages = [];

		undoLink().click();
		await settle();

		expect(view.getViewData()).toBe(POOL_NOTE);
		// And it said nothing, because there was nothing to refuse.
		expect(Notice.messages).toEqual([]);
	});

	it('accepts again where the reader edited and then edited back', async () => {
		/*
		 * The only branch of the box with no case of its own, found by a reviewer
		 * driving every branch rather than by a failure.
		 *
		 * A reader resets, edits a field, then puts that field back — so the note
		 * is byte-identical to what the trigger left. The box re-matches, and
		 * **Undo** is correctly accepted: the guard exists to stop a restore
		 * swallowing an edit, and there is no longer an edit to swallow.
		 *
		 * Worth a case because it is the one place the box's "only where it
		 * matches" condition *re*-opens rather than closes, and a fix that
		 * latched on the first mismatch would pass every other case here.
		 */
		const { view } = await sheetOn(POOL_NOTE, POOL_LAYOUT);
		await longRest(view);
		const afterRest = view.getViewData();

		const commit = (text: string) =>
			(view as unknown as { commit(text: string): void }).commit(text);
		commit(afterRest.replace('current: 10', 'current: 7'));
		await settle();
		commit(afterRest);
		await settle();
		expect(view.getViewData()).toBe(afterRest);
		Notice.messages = [];

		undoLink().click();
		await settle();

		expect(view.getViewData()).toBe(POOL_NOTE);
		expect(Notice.messages).toEqual([]);
	});

	it('still refuses where the reader edited while the offer stood', async () => {
		/*
		 * The other direction, and the one a looser fix breaks. A reader's edit
		 * lands through the redrawing branch, which never advances the
		 * expectation — and its own render's promoted write must not advance it
		 * either, or the undo would be accepted and would swallow that edit.
		 */
		const { view } = await sheetOn(POOL_NOTE, POOL_LAYOUT);
		await longRest(view);
		const edited = view.getViewData().replace('current: 10', 'current: 7');
		(view as unknown as { commit(text: string): void }).commit(edited);
		await settle();
		Notice.messages = [];

		undoLink().click();
		await settle();

		expect(Notice.messages).toEqual([
			'Sheetsmith did not undo: this note has changed since the reset.',
		]);
		// The reader's own number is still there, and the property followed it.
		expect(view.getViewData()).toContain('current: 7');
		expect(view.getViewData()).toContain('hp: 7');
	});
});

describe('what the sheet says about a refusal', () => {
	it('names the property and carries the reason whole', () => {
		expect(
			promotedFieldMessage({ property: 'level', reason: 'because of a thing' }),
		).toBe(
			'Sheetsmith could not write the property "level": because of a thing',
		);
	});

	it('names the note where the refusal belongs to no one property', () => {
		expect(promotedFieldMessage({ reason: 'because of a thing' })).toBe(
			"Sheetsmith could not write this note's promoted properties: because of a thing",
		);
	});
});
