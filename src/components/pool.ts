/*
 * Pool — a current-and-max resource with adjust controls (SPEC §4.2). Covers
 * HP, spell slots, rage, ki, sanity: the numbers that move constantly during
 * play and are the whole reason a sheet is open at a table.
 *
 * The max is layout config, not character data. It is a formula field, so a
 * stored copy in the note would be the stale-derived-value problem Skill
 * card's storage rules already refuse. A system whose max is rolled per
 * character rather than computed points the formula at a component the
 * character owns — `max_hp` — which is what §5 makes ids for.
 *
 * A reset acts on `current` and leaves `temp` where it is. Temporary points
 * are a separate quantity with their own lifetime, and which rest clears them
 * is a rule of the game rather than of a pool — the plugin knowing that would
 * be the plugin knowing 5e.
 */

import { amountOf } from '../interaction/editable';
import { GESTURE_COMMIT } from '../interaction/commit-window';
import { stepButton } from '../interaction/hold-repeat';
import { bindScrub } from '../interaction/scrub';
import { readFenced, writeFenced } from '../parse/fenced';
import {
	ComponentConfig,
	ComponentDefinition,
	ReadResult,
	ResetResult,
	ScopeEntry,
	ScopeValues,
	showsOwnLabel,
} from '../types';
import { bindEditable, EditableHandle } from '../interaction/editable';
import { formatDerived } from './card-face';

/** Entry keys in the fenced block. Fixed, so hand-editing reads the same. */
const CURRENT_KEY = 'current';
const TEMP_KEY = 'temp';
const MAX_KEY = 'max';

export interface PoolConfig extends ComponentConfig {
	type: 'pool';
	/**
	 * Where the ceiling comes from: computed by the layout, or held by the
	 * character and typed on the card.
	 *
	 * A key of its own rather than a convention inside `max`, for §6's reason:
	 * one string cannot be both an expression the evaluator reads and a
	 * literal word standing in for one. Absent means calculated, so every
	 * layout written before this reads exactly as it did.
	 */
	maxSource?: 'calculated' | 'character';
	/** The pool's ceiling, as a literal or an expression. Calculated pools. */
	max?: string | number;
	/** Show a second field for temporary points above the max. */
	hasTemp?: boolean;
	/**
	 * Leave the proportional fill off the card. Opt-out rather than opt-in, so
	 * a pool reads as a proportion unless the layout says otherwise — for the
	 * counter whose max is a limit rather than a quantity, where a bar filling
	 * up says nothing a reader wanted.
	 */
	hideFill?: boolean;
}

export interface PoolData {
	/**
	 * Absent means "not part of this change": an edit is reported as a delta
	 * of the one field touched, so a commit racing a rebuild can never write
	 * back a stale sibling.
	 */
	current?: string;
	temp?: string;
	/**
	 * The ceiling, for a pool whose max the character owns. Written only in
	 * that mode; a `max` entry left in a note by any other layout is read,
	 * ignored and preserved, per §10.
	 */
	max?: string;
}

/** How long a refused step stays marked on the field. */
const REFUSED_FLASH = 300;

/** How long the buffer stays lit after it swallows a step. */
const ABSORB_FLASH = 180;

/**
 * How long an amount has to stop changing before the pending outcome is spoken.
 * Long enough that typing a two-digit number is one utterance rather than two,
 * short enough that it arrives well before a finger reaches Enter.
 */
const PREVIEW_SPEAK = 600;

/**
 * What the value's controls do, for assistive tech and for touch, where a
 * tooltip never fires. Held as a constant because "Shift" is the name of a
 * key: sentence-casing it would be naming a different one.
 *
 * Three sentences shorter than it was, and that is the design change rather
 * than an edit to the copy. It used to have to teach that a leading minus meant
 * something other than a minus sign, and then teach the escape hatch for what a
 * minus sign no longer did. Both sentences went when the amount moved onto a
 * control that says so in a word.
 */
const POOL_HINT =
	'Type a number to set the value, or arithmetic such as 43-7 to settle it. Drag sideways to adjust. The plus and minus buttons repeat while held, and move by ten with Shift. To spend or restore an amount, use the adjust button below.';

/** The pointer-only half of the same, kept short enough to read in a tooltip. */
const POOL_TITLE = 'Type a value, or drag sideways to adjust.';

/**
 * What a net movement of the gesture lands on, buffer and all.
 *
 * Pure, and shared by the press that applies it and the amount control that
 * previews it before it is applied. A preview computed a second way is a
 * preview that can disagree with the button, and the buffer rule is exactly
 * where two implementations would drift.
 */
function landing(
	origin: { current: number; temp: number },
	net: number,
): { current: number; temp: number; absorbed: number } {
	// The buffer covers what it can of a spend and never goes below nothing.
	// That floor is the plugin's own to set, unlike the pool's: temp is a buffer
	// by this component's definition, and no system has negative temporary
	// points. Only a decrement is absorbed — healing goes to the pool, because a
	// buffer that healing restored would be an extension of the maximum, and
	// that is what `max` is for.
	const absorbed = Math.min(origin.temp, Math.max(0, -net));
	return {
		current: origin.current + net + absorbed,
		temp: origin.temp - absorbed,
		absorbed,
	};
}

/**
 * Spend or restore an amount, without doing the arithmetic.
 *
 * A table deals damage in sevens, and the amount is what a player has in hand:
 * nobody is holding the number 45. This was a typing convention on the value
 * field — `-17` read as a change rather than a value — and it worked, but the
 * field then held two incompatible kinds of thing with nothing to tell them
 * apart. Three defects came out of that one ambiguity: the fill bar and the
 * spent colour painted the amount as though it were the value, a caret landing
 * left of the digits turned "spend two" into "set minus twenty" with no
 * confirmation anywhere, and a press or a drag arriving before the commit read
 * the amount as the gesture's starting value.
 *
 * As a control it costs the card nothing — the steppers moved into its row, so
 * the card is no taller than it was — and buys four things. The value field
 * holds only values again, so everything painted from it is true. There is no
 * caret to land in the wrong place, because the field starts empty. The
 * direction is a button rather than a character, which is what makes the whole
 * gesture reachable on iOS — the numeric keypad there has no minus key, so a
 * signed amount was untypeable on the device most likely to be at a table. And
 * it can be seen: the convention it replaces was three sentences of hint text on
 * a field that looked like any other number field.
 *
 * It opens in place rather than floating. The card sets `overflow: hidden` so
 * its corner radius clips the fill bar, which would clip a popover with it, and
 * the panel taking the trigger's own row means opening the control moves nothing
 * else on the sheet.
 */
/** What the card hands the control, and what it hears back. */
interface AmountControlOptions {
	doc: Document;
	/** The pool's label, for every name this control has to spell out. */
	name: string;
	/** Where the card stands now, or null while its value is not a number. */
	standing: () => { current: number; temp: number } | null;
	/** Apply a signed amount, and report it. Refuses if there is no number. */
	apply: (signed: number) => void;
	/**
	 * The pending amount, or null when none is pending: what it would land on,
	 * written for the eye and for speech.
	 *
	 * Reported rather than painted. The control used to write the card's preview
	 * line and toggle a class on the row it sits in — two nodes it did not own
	 * and could not see the rest of, which is the seam a later change breaks
	 * quietly. It says what is pending; the card decides what that looks like.
	 */
	onPending: (
		pending: { text: string; speech: string; landing: number } | null,
	) => void;
	/**
	 * Whether the control has taken the row over.
	 *
	 * Opening is not a private matter. The panel is wider than the `±` it
	 * replaces, and a centred row answers that by pushing the two steppers
	 * outwards — about 38px each, instantly, under a finger still on the card.
	 * Layout must not move under a gesture in progress, least of all the two
	 * most-pressed buttons on the sheet, so the row stands them down for the
	 * duration. That is the row's business to do, and this control's only to
	 * announce.
	 */
	onOpenChange: (open: boolean) => void;
}

function amountControl(options: AmountControlOptions): HTMLElement {
	const { doc, name, standing, apply, onPending, onOpenChange } = options;
	const view = doc.defaultView;

	const wrap = doc.createElement('div');
	wrap.classList.add('sheetsmith-pool-adjust');

	const trigger = doc.createElement('button');
	trigger.type = 'button';
	trigger.classList.add('sheetsmith-pool-adjust-trigger');
	// A glyph, and a text glyph rather than an icon, because the two buttons it
	// sits between are `−` and `+`: `− ± +` is one set read at a glance, where a
	// word in the middle was the odd element and a Lucide icon would be a
	// different kind of mark again. `±` also says the right thing — an amount,
	// either way — rather than naming an action the press does not take.
	trigger.textContent = '±';
	// The glyph cannot carry this, so the accessible name does. Every route to a
	// number on this card is announced somewhere; see POOL_HINT.
	trigger.setAttribute('aria-label', `Adjust ${name} by an amount`);
	// No `aria-expanded`. This is not a disclosure: the trigger is replaced by
	// the form rather than sitting above it, so the state would be announced on
	// an element nobody can reach. What says the mode changed is focus arriving
	// in a field whose own name states the direction — see showDirection.
	trigger.title = `Spend or restore an amount of ${name}. The card does the arithmetic.`;
	wrap.appendChild(trigger);

	const panel = doc.createElement('div');
	panel.classList.add('sheetsmith-pool-adjust-panel');
	wrap.appendChild(panel);

	/**
	 * Spending by default, because a table spends far more often than it
	 * restores — so the common path is press, type, Enter, with the direction
	 * never touched.
	 */
	let direction: 1 | -1 = -1;

	const toggle = doc.createElement('button');
	toggle.type = 'button';
	toggle.classList.add('sheetsmith-pool-adjust-direction');
	panel.appendChild(toggle);

	const amount = doc.createElement('input');
	amount.type = 'text';
	// Bare digits are enough, which is the point of the direction being a
	// control: `numeric` on iOS is a keypad with no minus key on it.
	amount.inputMode = 'numeric';
	// So the on-screen keyboard's return key says what it does. Set as an
	// attribute rather than through the property, which not every DOM
	// implementation reflects.
	amount.setAttribute('enterkeyhint', 'done');
	amount.classList.add('sheetsmith-pool-adjust-amount');
	amount.placeholder = '0';
	panel.appendChild(amount);

	/**
	 * Two states, but not a pressed pair, so the name carries the direction.
	 *
	 * The sign it will apply, which is the most direct thing this button can
	 * say: joined to the field, `− 17` reads as minus seventeen and needs no
	 * decoding at all. It was an arrow first, to keep a third minus glyph off a
	 * row that already had two steppers — the collision the buffer pill refused
	 * steppers over. That objection died when the steppers began standing down
	 * for the duration: at the moment this glyph is read there is no other minus
	 * on the card, so the clearest mark is available and the arrow was only ever
	 * a way of dodging a conflict that no longer exists.
	 *
	 * The words stay in the name and the tooltip, and the accent still marks a
	 * restore — the sign carries the direction on its own now, but the default
	 * being unmarked is what makes the exception visible.
	 */
	const showDirection = (): void => {
		const spending = direction < 0;
		// The same two glyphs the step buttons use, U+2212 included, so the card
		// never spells a minus two ways.
		toggle.textContent = spending ? '−' : '+';
		const says = spending
			? `Spending from ${name}. Select to restore instead.`
			: `Restoring ${name}. Select to spend instead.`;
		toggle.setAttribute('aria-label', says);
		toggle.title = says;
		toggle.classList.toggle('sheetsmith-pool-adjust-restoring', !spending);
		// The field's own name carries the direction, because it is the only part
		// of this control a screen reader is taken to. Named "Amount of HP" it
		// never said which way, the preview is aria-hidden, and the announcement
		// arrives after the fact — so the direction was the one thing that could
		// not be checked before it applied.
		amount.setAttribute(
			'aria-label',
			spending ? `Amount to spend from ${name}` : `Amount to restore to ${name}`,
		);
	};

	/** The amount as a magnitude; the sign is the toggle's business, not its. */
	const size = (): number | null => {
		const raw = amount.value.trim();
		if (raw === '') return null;
		const parsed = amountOf(raw);
		return parsed === null ? null : Math.abs(parsed);
	};

	/**
	 * What applying it would land on. This is the sentence the old design had
	 * nowhere to put: a spend the buffer covers whole leaves the big number
	 * exactly where it was, which the 180ms flash on the pill could report only
	 * after the fact.
	 */
	const showPreview = (): void => {
		const from = standing();
		const by = size();
		if (from === null || by === null || by === 0) {
			onPending(null);
			return;
		}
		const next = landing(from, direction * by);
		// The amount, signed, and then where it lands. `→ 45` only distinguishes
		// itself from a restore if the reader remembers they were at 62; `−17 →
		// 45` says which way on the line the eye is already reading.
		const applied = `${direction < 0 ? '−' : '+'}${by}`;
		// Said rather than drawn, for the reader the line and the bar do not
		// reach. `−17 → 45` is a shape on a screen and a mess in speech, and the
		// principle the card is built on — where a control's input is not its
		// outcome, the outcome has to be on screen before it is applied — was
		// being kept for the eye alone. The buffer split is the part that most
		// needs saying, since a spend it covers whole moves no number at all.
		const spoken = [
			`${direction < 0 ? 'Spend' : 'Restore'} ${by}`,
			next.absorbed > 0 ? `${next.absorbed} from temporary` : '',
			`${name} ${next.current}`,
			next.absorbed > 0 ? `${next.temp} temporary` : '',
		].filter((part) => part !== '');
		onPending({
			text:
				next.absorbed > 0
					? `${applied} → ${next.current} · temp ${next.temp}`
					: `${applied} → ${next.current}`,
			speech: spoken.join(', '),
			landing: next.current,
		});
	};

	let open = false;

	const setOpen = (next: boolean): void => {
		open = next;
		wrap.classList.toggle('sheetsmith-pool-adjust-open', next);
		onOpenChange(next);
	};

	const openPanel = (): void => {
		setOpen(true);
		showDirection();
		showPreview();
		// Flush the style change the class just queued, before asking for focus.
		// A `display: none` element cannot take focus, and `classList.toggle`
		// does not recalculate style synchronously — so the field was still
		// hidden at the moment focus was requested, the call did nothing, and
		// the panel sat open with no caret while every keystroke went to
		// whatever had focus before it: the pool's own value. This is the same
		// reflow read the refused and absorbed flashes already rely on, and it
		// has to be a synchronous one rather than a frame, or the focus leaves
		// the user gesture and iOS declines to raise a keyboard for it.
		void amount.offsetWidth;
		amount.focus();
	};

	/**
	 * Close, applying what was entered or abandoning it.
	 *
	 * Applying rebuilds the sheet, so the control is torn down before it is
	 * called rather than after: a commit reaching a card that has already been
	 * replaced would be writing from detached fields.
	 */
	const close = (commit: boolean): void => {
		if (!open) return;
		const by = commit ? size() : null;
		amount.value = '';
		onPending(null);
		setOpen(false);
		if (by === null || by === 0) return;
		apply(direction * by);
	};

	// On the press, not the click, which is the rule the step buttons follow:
	// feedback that waits for release reads as lag.
	trigger.addEventListener('pointerdown', (event) => {
		if (event.button !== 0) return;
		event.preventDefault();
		openPanel();
	});
	// On the control rather than on the trigger, because by the time a click is
	// dispatched the trigger is `display: none` — opened on pointerdown — and a
	// click whose down and up landed on different elements is delivered to their
	// common ancestor, which is this wrapper. A listener on the button itself
	// never ran for a pointer at all, and the keyboard path only worked because
	// activation fires click directly on the focused button.
	wrap.addEventListener('click', (event) => {
		if (!open) {
			// The keyboard path: activation on the focused trigger.
			openPanel();
			return;
		}
		// Already open, so this is the click that followed the press that opened
		// it — the second user gesture, and the reason to want one. iOS may
		// decline to raise a keyboard for a `focus()` made under a prevented
		// pointerdown; asking again here costs nothing when the first attempt
		// worked, because then the field already has focus.
		const target = event.target;
		if (target instanceof Node && toggle.contains(target)) return;
		if (doc.activeElement !== amount) amount.focus();
	});

	toggle.addEventListener('click', () => {
		direction = direction < 0 ? 1 : -1;
		showDirection();
		showPreview();
		// Back to the field: it keeps the keyboard up on a phone, and it keeps
		// focus inside the control so leaving does not read as a commit.
		amount.focus();
	});

	amount.addEventListener('input', () => {
		const raw = amount.value.trim();
		// An explicit sign wins and moves the toggle to match, so the control
		// can never show a direction its outcome contradicts. A bare amount
		// defers to the toggle, which is what makes the numeric keypad enough.
		if (raw.startsWith('-')) direction = -1;
		else if (raw.startsWith('+')) direction = 1;
		showDirection();
		showPreview();
	});

	// Enter belongs to the field alone. Bound on the control it would also fire
	// while the direction toggle has focus, where Enter already means "flip the
	// direction" — one key committing and toggling at once.
	amount.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		close(true);
		// Focus returns to the trigger, and survives the rebuild that a commit
		// starts: the view captures (cell, control index) before re-rendering and
		// restores it after, and the panel's children are in the DOM whether it
		// is open or closed, so the trigger's index does not move. A run of
		// amounts costs one press of `±` between them.
		trigger.focus();
	});

	// Escape on the control rather than the field, because the toggle is a tab
	// stop too and the one escape hatch had a hole in it there.
	wrap.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		close(false);
		trigger.focus();
	});

	wrap.addEventListener('focusout', () => {
		// Leaving abandons the amount. Every field on this card commits on the
		// way out, and that rule is right for a field holding a value and wrong
		// for a control issuing a command: a value can be re-read and retyped
		// because it is still on screen, where a stray tap here used to spend
		// seventeen points silently and leave nothing behind to say what did it.
		// A mode dismisses; a field commits. Enter and the keyboard's own Done
		// key are the ways to mean it.
		//
		// Deferred and decided by where focus actually landed, because a focusout
		// fires before the next focus arrives and the control moves focus within
		// itself — on opening, and on the direction toggle.
		view?.setTimeout(() => {
			if (!open) return;
			if (wrap.contains(doc.activeElement)) return;
			close(false);
		}, 0);
	});

	showDirection();
	return wrap;
}

export const pool: ComponentDefinition<PoolConfig, PoolData> = {
	type: 'pool',
	storage: 'fenced',
	// `reset.*.to` rather than `reset.to`: the bindings are a list, so each
	// one's expression lives at its own index. The sheet hands `applyReset` the
	// binding being applied and rewrites the logical name to that index, so a
	// component still asks for its reset expression by one name.
	formulaFields: ['max', 'reset.*.to'],
	configFields: [
		{
			key: 'maxSource',
			kind: 'select',
			label: 'Max',
			description:
				'Calculated is a formula the layout owns, the same for every character. Character is a number each character holds and types on the card, for a max that is rolled or assigned rather than derived.',
			options: ['calculated', 'character'],
		},
		{
			key: 'max',
			kind: 'formula',
			label: 'Max formula',
			description:
				'The pool\'s ceiling, as a number or a formula, e.g. 8 + mod(abilities.CON) * level. Leave it empty for a pool that only counts up.',
			visibleWhen: { key: 'maxSource', equals: 'calculated' },
		},
		{
			key: 'hasTemp',
			kind: 'boolean',
			label: 'Temporary points',
			description:
				'Show a second field for points above the max, such as temporary hit points.',
			default: false,
		},
		{
			key: 'hideFill',
			group: 'Appearance',
			kind: 'boolean',
			label: 'Hide fill bar',
			description:
				'Leave off the bar showing how full the pool is. The numbers stay, and so does the colour at zero and above the max.',
			default: false,
		},
	],

	read(body): ReadResult<PoolData> {
		const parsed = readFenced(body);
		if (!parsed.ok) return parsed;
		// No fence yet: an editable empty pool, not an error.
		if (parsed.values === null) return { ok: true, data: null };
		const data: PoolData = {};
		const current = parsed.values.get(CURRENT_KEY);
		if (current !== undefined) data.current = current;
		const temp = parsed.values.get(TEMP_KEY);
		if (temp !== undefined) data.temp = temp;
		// Read whatever the note holds and let the layout decide whether it
		// means anything: `read` has no config, and it is the mode that says
		// whether this is the ceiling or a leftover. A calculated pool never
		// writes the key, so an entry from an older layout survives untouched
		// either way (§10) — and if the layout later hands the max to the
		// character, the number already in the note is the one it gets.
		const max = parsed.values.get(MAX_KEY);
		if (max !== undefined) data.max = max;
		// Entries under any other key are left where they are, untouched.
		return { ok: true, data };
	},

	scopeValues(data, config): ScopeValues {
		// The bare id is the current value, which is what a formula asking
		// about a pool almost always means. The ceiling and the temporary
		// points are reachable by name, so `hp.max / 2` is writable without
		// the layout repeating the expression.
		const named: Record<string, ScopeEntry> = {};
		if (config.maxSource === 'character') {
			// A stored value, so it publishes like one. `hp.max` reads the same
			// from either mode, which is the point of the name: a formula
			// elsewhere on the sheet asks a pool for its ceiling without
			// knowing where that pool keeps it.
			named[MAX_KEY] = { value: data?.max };
		} else if (config.max !== undefined) {
			named[MAX_KEY] = { display: { field: 'max', scope: {} } };
		}
		if (config.hasTemp === true) {
			named[TEMP_KEY] = { value: data?.temp };
		}
		return {
			self: { value: data?.current },
			...(Object.keys(named).length > 0 ? { named } : {}),
		};
	},

	write(data, body): string {
		const updates = new Map<string, string>();
		if (data.current !== undefined) updates.set(CURRENT_KEY, data.current);
		if (data.temp !== undefined) updates.set(TEMP_KEY, data.temp);
		if (data.max !== undefined) updates.set(MAX_KEY, data.max);
		return writeFenced(body, updates);
	},

	hasBuffer: true,

	applyReset(data, config, reset, context): ResetResult<PoolData> {
		const next: PoolData = {};

		// The buffer is cleared on its own account, and only where the pool has
		// one. Which event empties it is the system's rule, which is why the
		// layout has to say so rather than a rest assuming it.
		if (reset.buffer === 'clear' && config.hasTemp === true) next.temp = '0';

		if (reset.action === 'empty') {
			// Emptying needs nothing resolved: zero is zero whatever the max is,
			// and a pool whose max is broken can still be spent.
			next.current = '0';
		} else if (reset.action === 'full' && config.maxSource === 'character') {
			// The ceiling is the character's own, so there is nothing to
			// resolve: a rest restores to the number in the note. It can still
			// fail, and for the same reason a formula can — a pool nobody has
			// given a max yet has no full to restore to.
			const stored = data?.max?.trim() ?? '';
			const value = stored === '' ? null : Number(stored);
			if (value === null || !Number.isFinite(value)) {
				return { ok: false, error: 'it has no max to restore to.' };
			}
			next.current = stored;
		} else if (reset.action !== undefined) {
			// `full` restores to the ceiling, which is a formula and can fail
			// like one — the case a plain data return could not distinguish from
			// a pool that was already full.
			const field = reset.action === 'formula' ? 'reset.to' : 'max';
			const value = context.resolve(field, {});
			if (value === null) {
				return {
					ok: false,
					error:
						context.explain(field, {}) ??
						(field === 'max'
							? 'it has no max to restore to.'
							: 'its reset formula is empty.'),
				};
			}
			next.current = String(value);
		}

		return { ok: true, data: next };
	},

	render(container, config, data, context): void {
		const doc = container.ownerDocument;
		const view = doc.defaultView;
		container.replaceChildren();

		// The card is a child of the cell, not the cell itself, exactly as a
		// lone card is: the cell is grid placement and the card is the
		// object. It also takes the same width cap, so a pool spanning three
		// columns does not become an expanse of clickable card around a
		// two-digit number while the cards beside it stay tile-sized.
		const card = doc.createElement('div');
		card.classList.add('sheetsmith-pool');
		container.appendChild(card);

		// A pool has no `hideLabel` of its own, so this drew unconditionally until
		// a container that names its children arrived. The accessible name below is
		// untouched either way.
		if (showsOwnLabel(config, context)) {
			const label = doc.createElement('div');
			label.classList.add('sheetsmith-pool-label');
			label.textContent = config.label;
			card.appendChild(label);
		}

		// Announces once per commit, whether the change came from the keyboard,
		// a step button, or a scrub. Attached before anything writes to it,
		// because a live region has to be in the document before its text
		// changes.
		const status = doc.createElement('div');
		status.classList.add('sheetsmith-sr-only');
		status.setAttribute('aria-live', 'polite');

		const row = doc.createElement('div');
		row.classList.add('sheetsmith-pool-row');
		card.appendChild(row);

		const input = doc.createElement('input');
		input.type = 'text';
		input.inputMode = 'numeric';
		input.classList.add('sheetsmith-pool-current');
		input.value = data?.current ?? '';
		// SPEC §4.2: an empty value shows "—" everywhere.
		input.placeholder = '—';
		input.setAttribute('aria-label', config.label);
		// Neither bulk gesture was announced anywhere. The tooltip covers a
		// pointer; the description below covers assistive tech and, unlike a
		// title, reaches touch — which is where hold and drag matter most.
		input.title = `${config.label}. ${POOL_TITLE}`;
		const hint = doc.createElement('div');
		hint.classList.add('sheetsmith-sr-only');
		hint.id = `sheetsmith-pool-hint-${config.id}`;
		hint.textContent = POOL_HINT;
		input.setAttribute('aria-describedby', hint.id);

		/**
		 * Whether the ceiling is the character's own number rather than the
		 * layout's formula.
		 *
		 * The two are exclusive by construction, which is what keeps the rule
		 * against storing a derived value intact: a calculated max is never
		 * written to a note, and a character's max is never computed from one,
		 * so there is only ever one answer to "what is this character's
		 * maximum" and nothing for it to go stale against.
		 */
		const characterMax = config.maxSource === 'character';

		// The max is a formula like any other, so it can fail like one. "?" is
		// reserved for present-but-unresolved, which is exactly this case.
		const resolvedMax = context.resolved['max'];
		const maxText = characterMax
			? (data?.max ?? '')
			: config.max === undefined
				? null
				: formatDerived(resolvedMax, false);
		// A proportion needs a ceiling the layout actually configured *and* a
		// number it resolved to. Reading the resolved value alone would let a
		// stale entry draw a bar for a pool that has no max at all.
		const configuredCeiling =
			config.max !== undefined &&
			typeof resolvedMax === 'number' &&
			Number.isFinite(resolvedMax) &&
			resolvedMax > 0
				? resolvedMax
				: null;

		/** The max field, where the character owns it. */
		let maxInput: HTMLInputElement | null = null;
		let maxHandle: EditableHandle | null = null;

		/**
		 * The ceiling as it stands, which in character mode is the draft rather
		 * than the note: the fill, the boundary colour and the throw's bound all
		 * repaint from it, and a max being typed is what the reader can see. A
		 * calculated ceiling cannot move without a rebuild, so it is read once.
		 */
		const ceilingOf = (): number | null => {
			if (!characterMax) return configuredCeiling;
			const raw = (maxInput?.value ?? data?.max ?? '').trim();
			if (raw === '') return null;
			const parsed = Number(raw);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
		};

		const announce = (next: string, extra = ''): void => {
			const ceilingValue = ceilingOf();
			const said = characterMax ? (maxInput?.value.trim() ?? '') : maxText;
			const of = said === null || said === '' ? '' : ` of ${said}`;
			// The spent and over states are a colour on screen, so they have to
			// be words here: a reader who cannot see the colour otherwise gets
			// no boundary at all.
			const value = next.trim() === '' ? null : Number(next);
			const numeric = value !== null && Number.isFinite(value) ? value : null;
			let state = '';
			if (numeric !== null && numeric <= 0) state = ', empty';
			else if (numeric !== null && ceilingValue !== null && numeric > ceilingValue) {
				state = ', above maximum';
			}
			status.textContent = `${config.label} ${next === '' ? 'empty' : next}${of}${extra}${state}`;
		};

		let handle: EditableHandle | null = null;
		let tempInput: HTMLInputElement | null = null;
		let tempHandle: EditableHandle | null = null;

		// What has actually been reported, tracked rather than read back off
		// `data`. The rendered data is a snapshot from the last paint, and a
		// commit re-renders asynchronously — so two gestures in quick succession
		// would both compare against the same stale value and the second would
		// be dropped as "no change".
		let sentCurrent = data?.current ?? '';
		let sentTemp = data?.temp ?? '';
		let sentMax = data?.max ?? '';

		/**
		 * Where a pending amount would land, or null when none is pending. Held
		 * here rather than inside the amount control because the bar belongs to
		 * the card, and `paint` is the one place that decides what it shows.
		 */
		let pendingLanding: number | null = null;

		/** The draft as a number, or null where it is empty or not one. */
		const draftValue = (): number | null => {
			const raw = input.value.trim();
			if (raw === '') return null;
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : null;
		};

		/**
		 * Repaint everything derived from the draft: the proportional fill and
		 * the boundary state. Called on every keystroke, step and scrub frame,
		 * because a pool that only tells you where you are once you stop is
		 * back to being two numerals.
		 */
		const paint = (): void => {
			const value = draftValue();
			const ceilingValue = ceilingOf();
			if (ceilingValue !== null && value !== null) {
				// Clamped for the bar only. The value itself is free to sit
				// above the max or below zero; the fill just has nowhere
				// further to go, and the number says the rest.
				const ratio = (of: number) => Math.max(0, Math.min(1, of / ceilingValue));
				// With an amount pending, the solid bar is the part that is not in
				// play and the faint one reaches where it would land — so a spend
				// reads as "this much stays, this much goes" and a restore as
				// "this much you have, this much arrives". One rule covers both,
				// because the solid bar is always the smaller of the two.
				const solid =
					pendingLanding === null ? value : Math.min(value, pendingLanding);
				card.style.setProperty('--sheetsmith-pool-fill', String(ratio(solid)));
				card.style.setProperty(
					'--sheetsmith-pool-ghost',
					pendingLanding === null
						? '0'
						: String(ratio(Math.max(value, pendingLanding))),
				);
			} else {
				card.style.removeProperty('--sheetsmith-pool-fill');
				card.style.removeProperty('--sheetsmith-pool-ghost');
			}
			// A status, not a rule: the plugin does not know whether this game
			// lets a pool run negative, only that a reader should be able to
			// see at a glance that it has.
			input.classList.toggle(
				'sheetsmith-pool-spent',
				value !== null && value <= 0,
			);
			input.classList.toggle(
				'sheetsmith-pool-over',
				value !== null && ceilingValue !== null && value > ceilingValue,
			);
			// A buffer holding nothing is not information; one holding points is.
			tempInput?.parentElement?.classList.toggle(
				'sheetsmith-pool-temp-empty',
				tempValue() === 0,
			);
		};

		/**
		 * Move the draft without committing. Feedback is continuous and
		 * persistence is discrete (SPEC §4.2), which is also what keeps a
		 * held button from writing to the note ten times a second and
		 * rebuilding the sheet under the finger.
		 */
		/**
		 * Mark the field when a step cannot apply.
		 *
		 * Refusing is right — stepping "lots" would replace what the user wrote
		 * with a 1 — but refusing in silence is a dead key, and the arrow keys
		 * were equally quiet. One brief mark says the control heard the press
		 * and had nothing to do with it.
		 */
		const refuse = (): void => {
			input.classList.remove('sheetsmith-pool-refused');
			void input.offsetWidth;
			input.classList.add('sheetsmith-pool-refused');
			view?.setTimeout(
				() => input.classList.remove('sheetsmith-pool-refused'),
				REFUSED_FLASH,
			);
		};

		/**
		 * Both fields as they stood when this gesture began, and the gesture's
		 * net movement so far.
		 *
		 * Every adjustment is derived from the origin rather than applied on top
		 * of the last one, which is the discipline the scrub already used for
		 * pointer-to-units and this did not use for units-to-fields. Mutating
		 * incrementally cannot undo an absorption: minus then plus took a point
		 * off the buffer and gave it back to the pool, so a press and its
		 * reversal left the card in a third state that was neither. Derived from
		 * the origin, a net of nothing is exactly where you started.
		 */
		let origin: { current: number; temp: number } | null = null;
		let net = 0;

		/**
		 * Apply the gesture's net movement, always measured from its origin.
		 *
		 * `from` names that origin explicitly, for the caller whose field does
		 * not hold the value to measure from: a typed change leaves `-17` in the
		 * field, and reading the origin off it would take seventeen from minus
		 * seventeen.
		 */
		const applyGesture = (
			nextNet: number,
			from?: { current: number; temp: number },
		): void => {
			if (from !== undefined) origin = from;
			origin ??= { current: draftValue() ?? 0, temp: tempValue() };
			net = nextNet;
			const next = landing(origin, net);
			if (tempInput !== null) {
				const before = tempInput.value;
				tempInput.value = String(next.temp);
				if (tempInput.value !== before && next.absorbed > 0) flashTemp();
			}
			input.value = String(next.current);
			paint();
		};

		/** Forget the origin, so the next adjustment starts a fresh gesture. */
		const endGesture = (): void => {
			origin = null;
			net = 0;
		};

		const stepDraft = (delta: number): void => {
			// Text that is not a number is not a number to step, the same rule
			// the arrow keys follow — stepping it would silently replace what
			// the user wrote with a 1.
			const raw = input.value.trim();
			if (raw !== '' && draftValue() === null) {
				refuse();
				return;
			}
			// An empty pool steps from zero, the same rule the arrow keys
			// follow: pressing minus on a fresh pool must not be a dead key.
			applyGesture(net + delta);
		};

		/** Commit whatever the draft now holds, once. */
		/**
		 * Light the buffer as it absorbs.
		 *
		 * The user presses the large minus and the large number does not move —
		 * the only change is a digit inside a small pill below it. Feedback has
		 * to say what it belongs to, and without this the screen-reader user is
		 * better served than the sighted one. It also teaches the buffer rule
		 * the first time it fires.
		 */
		const flashTemp = (): void => {
			const pill = tempInput?.parentElement;
			if (!pill) return;
			pill.classList.remove('sheetsmith-pool-absorbed');
			// Reading a layout property restarts the transition; without it a
			// second absorption inside the window would not re-light.
			void pill.offsetWidth;
			pill.classList.add('sheetsmith-pool-absorbed');
			view?.setTimeout(
				() => pill.classList.remove('sheetsmith-pool-absorbed'),
				ABSORB_FLASH,
			);
		};

		/** The buffer as a number; anything unreadable counts as none. */
		const tempValue = (): number => {
			const raw = tempInput?.value.trim() ?? '';
			if (raw === '') return 0;
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : 0;
		};

		/**
		 * Spend from the pool, taking temporary points first.
		 *
		 * This is what makes `hasTemp` a pool's buffer rather than a second
		 * number parked beside it — without it the field is a Card the layout
		 * could have placed itself, which is the one thing it must not be.
		 *
		 * Only a decrement is absorbed. Healing goes to the pool and never
		 * refills the buffer, because a buffer that healing restored would be
		 * an extension of the maximum, and that is what `max` is for.
		 */
		const spendDraft = stepDraft;

		/**
		 * Commit whatever the gesture left, in one change.
		 *
		 * Both fields in a single report, because a spend that crossed from the
		 * buffer into the pool changed two of them: writing them separately
		 * would be two saves and two rebuilds for one press, and the second
		 * would race the first's re-render.
		 */
		let pending: number | undefined;

		/** Write at the end of the run, unless something ends it sooner. */
		const commitSoon = (): void => {
			if (pending !== undefined) view?.clearTimeout(pending);
			pending = view?.setTimeout(() => {
				pending = undefined;
				commitDraft();
			}, GESTURE_COMMIT);
		};

		const commitDraft = (): void => {
			if (pending !== undefined) {
				view?.clearTimeout(pending);
				pending = undefined;
			}
			// A rebuild replaces the card, and a commit arriving after that would
			// be writing values read out of detached inputs.
			if (!input.isConnected) return;
			const current = input.value.trim();
			let temp = tempInput?.value.trim() ?? null;
			// The floor holds however the value arrived. Stepping and absorbing
			// respect it by construction; typing "-5" would not, and a negative
			// buffer is a state this component defines out of existence.
			if (tempInput !== null && temp !== null) {
				const parsed = Number(temp);
				if (Number.isFinite(parsed) && parsed < 0) {
					temp = '0';
					tempInput.value = temp;
				}
			}
			// The ceiling rides in the same change as the value it bounds. A
			// max typed on the card is one edit however many fields moved with
			// it, and it must not be a second save racing the first — the rule
			// a spend crossing the buffer already follows.
			const max = maxInput?.value.trim() ?? null;
			const delta: PoolData = {};
			if (current !== sentCurrent) delta.current = current;
			if (temp !== null && temp !== sentTemp) delta.temp = temp;
			if (max !== null && max !== sentMax) delta.max = max;
			if (
				delta.current === undefined &&
				delta.temp === undefined &&
				delta.max === undefined
			) {
				return;
			}
			sentCurrent = current;
			if (temp !== null) sentTemp = temp;
			if (max !== null) sentMax = max;
			// Settle every field before reporting, so a later blur does not
			// report a change that has already gone to the note.
			handle?.sync(current);
			tempHandle?.sync(temp ?? '');
			maxHandle?.sync(max ?? '');
			endGesture();
			// A spend the buffer absorbed whole leaves the pool where it was, so
			// announcing the pool alone would report that nothing happened. Say
			// what actually moved.
			announce(
				current,
				delta.temp !== undefined ? `, ${delta.temp || '0'} temporary` : '',
			);
			context.onChange(delta);
		};

		// The value and its ceiling are one reading, and the value holds the
		// card's centre line on its own; see the stylesheet.
		const reading = doc.createElement('div');
		reading.classList.add('sheetsmith-pool-reading');
		reading.appendChild(input);
		row.appendChild(reading);

		if (maxText !== null) {
			const ceiling = doc.createElement('span');
			ceiling.classList.add('sheetsmith-pool-ceiling');
			reading.appendChild(ceiling);

			const separator = doc.createElement('span');
			separator.classList.add('sheetsmith-pool-separator');
			separator.textContent = '/';
			ceiling.appendChild(separator);

			if (characterMax) {
				/*
				 * The ceiling is a value the character holds, so it is edited
				 * where it is read rather than on a component of its own.
				 *
				 * Pointing the formula at a separate Card was the old answer and
				 * it still works, but it costs a second card for a number that
				 * belongs to this one, and it shows the max twice on a sheet
				 * where the reading already says it. Here the pool asks for the
				 * number once, in the place the reader is already looking.
				 *
				 * It stays a small quiet field beside the big one. Nothing about
				 * a max is worth the card's centre line: it is set at level-up
				 * and read constantly, which is the opposite of the value beside
				 * it, and giving it matching weight would make the card ask
				 * which of two numbers it is about.
				 */
				const field = doc.createElement('input');
				field.type = 'text';
				field.inputMode = 'numeric';
				field.classList.add('sheetsmith-pool-max', 'sheetsmith-pool-max-input');
				field.value = maxText;
				// The same "—" the value shows, and here it is also the only
				// invitation to type: a pool whose max nobody has entered yet
				// has no ceiling, no bar, and nothing else to press.
				field.placeholder = '—';
				field.setAttribute('aria-label', `${config.label} maximum`);
				field.title = `Maximum ${config.label}, held by this character.`;
				maxInput = field;
				ceiling.appendChild(field);
			} else {
				const max = doc.createElement('span');
				max.classList.add('sheetsmith-pool-max');
				max.textContent = maxText;
				if (resolvedMax === null) {
					max.classList.add('sheetsmith-pool-max-unresolved');
					max.setAttribute(
						'title',
						context.explainField?.('max', {}) ?? 'The formula did not resolve.',
					);
				}
				// No aria-label here: a bare span is role=generic, which prohibits
				// naming, so most assistive tech drops it. The visible text and the
				// live region already carry the ceiling.
				ceiling.appendChild(max);
			}
		}

		handle = bindEditable(input, {
			initial: data?.current ?? '',
			step: true,
			// `43-7` settles as 36, which is how damage is actually said. An
			// *amount* is the adjust control's business, not this field's: a
			// field cannot tell `-17` the value from `-17` the change, and the
			// ambiguity cost more than the shortcut was worth.
			arithmetic: true,
			// The arrow keys spend like the buttons do; without this they would
			// be the one gesture that walked past the buffer.
			onStep: spendDraft,
			onDraft: () => {
				// A keystroke is not an adjustment: it replaces the value, so
				// whatever origin a press left is no longer the measure.
				endGesture();
				paint();
			},
			onEnter: () => {
				// SPEC §4.2 moves to the next field on the card, and here that is
				// the buffer — deliberately without selecting it, unlike a card
				// card's note line. On this card Enter most often means "done",
				// and a selected number arms the next keystroke to replace a
				// value the user never meant to touch. A caret is recoverable
				// where a replacement is not.
				tempInput?.focus();
			},
			announceCommit: (next) => {
				paint();
				announce(next);
			},
			announceRestore: (restored) => {
				paint();
				status.textContent = `${config.label} restored to ${restored}`;
			},
			// Blur and Enter both land here, and both flush the run: every commit
			// on this card goes through the combined write, so a spend that moved
			// the buffer and the pool is never split into two saves.
			onCommit: () => commitDraft(),
		});

		// Leaving either field flushes the run, whichever field moved. Not left
		// to the binding's own blur commit: that only fires when *its* field
		// changed, so a spend the buffer swallowed whole would leave the pool's
		// value untouched, trip nothing, and wait on the timer — which a rebuild
		// in the meantime would throw away.
		input.addEventListener('blur', commitDraft);

		if (maxInput !== null) {
			const field = maxInput;
			// Leaving flushes the run, whichever field moved — the rule the
			// value and the buffer already follow, and the reason the combined
			// write exists.
			field.addEventListener('blur', commitDraft);
			maxHandle = bindEditable(field, {
				initial: data?.max ?? '',
				// The arrow keys step it, and plainly: no `onStep`, because the
				// buffer is a rule about spending the pool and a max is not the
				// pool. Nothing about raising a ceiling should drain temporary
				// points.
				step: true,
				// `8+5` settles as 13, the same unambiguous arithmetic the value
				// takes. A max is exactly the field a player arrives at by adding
				// a roll to a modifier.
				arithmetic: true,
				onDraft: () => {
					// The ceiling moved, so everything measured against it has to
					// move with it: the fill, the boundary colour, and the bound
					// on a throw. This is the whole reason the ceiling is read
					// rather than captured.
					paint();
				},
				announceCommit: (next) => {
					paint();
					status.textContent =
						next === ''
							? `${config.label} maximum cleared`
							: `${config.label} maximum ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${config.label} maximum restored to ${restored}`;
				},
				onCommit: () => commitDraft(),
			});
		}

		const scrub = bindScrub(
			card,
			input,
			applyGesture,
			commitDraft,
			ceilingOf,
			draftValue,
			'sheetsmith-pool-scrubbing',
		);

		if (config.hasTemp === true) {
			const temp = doc.createElement('div');
			temp.classList.add('sheetsmith-pool-temp');
			card.appendChild(temp);

			const tempLabel = doc.createElement('span');
			tempLabel.classList.add('sheetsmith-pool-temp-label');
			tempLabel.textContent = 'Temp';
			temp.appendChild(tempLabel);

			tempInput = doc.createElement('input');
			tempInput.type = 'text';
			tempInput.inputMode = 'numeric';
			tempInput.classList.add('sheetsmith-pool-temp-input');
			tempInput.value = data?.temp ?? '';
			tempInput.placeholder = '—';
			tempInput.setAttribute('aria-label', `${config.label} temporary`);

			const field = tempInput;

			// No steppers on the pill, deliberately. A buffer is granted in
			// lumps and replaced, never incremented: nothing adds temporary
			// points to temporary points, so typing over the value is the whole
			// interaction. Steppers here also put a second minus on the card
			// meaning something different from the first, two more tab stops,
			// and two 16px targets four pixels from the field they sit beside.
			temp.appendChild(field);

			field.addEventListener('blur', commitDraft);

			tempHandle = bindEditable(field, {
				initial: data?.temp ?? '',
				step: true,
				announceCommit: (next) => {
					status.textContent =
						next === ''
							? `${config.label} temporary cleared`
							: `${config.label} temporary ${next}`;
				},
				announceRestore: (restored) => {
					status.textContent = `${config.label} temporary restored to ${restored}`;
				},
				onCommit: () => commitDraft(),
			});
		}

		/*
		 * One row of controls under the reading, rather than steppers flanking
		 * the number and the amount below them.
		 *
		 * The card divides in two: what the pool is, and what changes it. That
		 * grouping beat adjacency-to-the-number on every count that could be
		 * checked. The value takes the card's full width and centre line, so a
		 * sheet of pools reads as a column of numbers instead of numbers
		 * interleaved with chrome. The steppers stop being cramped — they were
		 * flanking a four-character field inside a 220px card, which is why they
		 * needed a container query to shrink and an invisible expansion to reach
		 * a thumb again. And `− ± +` puts the two directions either side of
		 * "by how much", which is a better reading of the middle control than
		 * leaving it orphaned on a line of its own. The card is no taller: the
		 * amount already had a row, and the steppers moved into it.
		 *
		 * The cost is real and lands only on a pool with a buffer: `−` now sits
		 * nearer the Temp pill than the number it decrements. The steppers do
		 * spend through the buffer, so the proximity is imprecise rather than
		 * wrong, and the pill's absorb flash is what actually teaches the rule.
		 *
		 * Shape is what keeps the middle control honest, since three same-sized
		 * buttons in a row would promise that all three behave alike: the
		 * steppers are square glyphs that act on the press, and the amount is a
		 * wide field-shaped pill, because it asks for a number first and a
		 * field-shaped control advertises that typing is next.
		 */
		const controls = doc.createElement('div');
		controls.classList.add('sheetsmith-pool-controls');
		controls.appendChild(
			stepButton(
				doc,
				input,
				config.label,
				-1,
				'sheetsmith-pool-step',
				spendDraft,
				commitSoon,
			),
		);

		// The written outcome. Reserved whether or not anything is pending; see
		// the stylesheet. `aria-hidden` because the same sentence is spoken
		// below, where it is composed for speech rather than for the eye.
		const previewLine = doc.createElement('div');
		previewLine.classList.add('sheetsmith-pool-preview');
		previewLine.setAttribute('aria-hidden', 'true');

		/**
		 * Say the pending outcome, once the amount stops changing.
		 *
		 * Debounced, because the alternative is narrating every digit on the way
		 * in — "spend 1, HP 61", "spend 17, HP 45". It goes to the card's own
		 * live region rather than a second one, so a commit arriving later
		 * supersedes the preview rather than queueing behind it, and the timer is
		 * cancelled whenever the amount clears so a stale preview can never land
		 * on top of a committed announcement.
		 */
		let sayPending: number | undefined;
		const cancelSay = (): void => {
			if (sayPending === undefined) return;
			view?.clearTimeout(sayPending);
			sayPending = undefined;
		};

		const adjust = amountControl({
			doc,
			name: config.label,
			standing: () => {
				// The draft, not the last commit: it is what the reader can see,
				// and a value typed but not yet committed is still the value the
				// amount will come off.
				const current = draftValue();
				return current === null ? null : { current, temp: tempValue() };
			},
			apply: (signed) => {
				const from = draftValue();
				if (from === null) {
					// There is no number here to take an amount off. Mark the
					// field rather than treating the author's text as a zero.
					refuse();
					return;
				}
				// Through the gesture, so the buffer takes it first — exactly as
				// pressing minus that many times would. No route to a number on
				// this card walks past the buffer.
				endGesture();
				applyGesture(signed, { current: from, temp: tempValue() });
				commitDraft();
			},
			onPending: (next) => {
				cancelSay();
				previewLine.textContent = next?.text ?? '';
				pendingLanding = next?.landing ?? null;
				paint();
				if (next === null) return;
				sayPending = view?.setTimeout(() => {
					sayPending = undefined;
					status.textContent = next.speech;
				}, PREVIEW_SPEAK);
			},
			onOpenChange: (open) => {
				// The row stands its steppers down; see the stylesheet. The
				// control announces that it has taken the row, and the row is
				// what acts on it.
				controls.classList.toggle('sheetsmith-pool-controls-adjusting', open);
			},
		});
		controls.appendChild(adjust);
		controls.appendChild(
			stepButton(
				doc,
				input,
				config.label,
				1,
				'sheetsmith-pool-step',
				spendDraft,
				commitSoon,
			),
		);
		card.appendChild(previewLine);
		card.appendChild(controls);

		// The proportional read (SPEC §4.2). A pool is the one component whose
		// state is inherently a proportion, and the only one that was making the
		// reader do the division.
		//
		// Appended last, and that is load-bearing rather than incidental. Between
		// the number and the temp pill it was a full-width horizontal line with
		// content on both sides, which is a divider whatever the spacing around
		// it says — tightening the gaps did not and could not fix that. At the
		// foot with nothing beneath it, it cannot divide anything: it stops being
		// content in the stack and becomes the card's own status strip. The
		// stylesheet then bleeds it past the padding onto the border, because an
		// inset line at the bottom would read as a mis-sized rule instead.
		if (ceilingOf() !== null && config.hideFill !== true) {
			const track = doc.createElement('div');
			track.classList.add('sheetsmith-pool-track');
			// The numbers above already say this; the bar is the shape of them.
			track.setAttribute('aria-hidden', 'true');
			// Under the fill, and wider than it whenever an amount is pending:
			// the region in play, in the language the bar already speaks.
			track.appendChild(doc.createElement('div')).classList.add(
				'sheetsmith-pool-track-ghost',
			);
			track.appendChild(doc.createElement('div')).classList.add(
				'sheetsmith-pool-track-fill',
			);
			card.appendChild(track);
		}

		card.appendChild(hint);
		card.appendChild(status);
		paint();

		// The whole card is the hit target, and it answers on press rather than
		// on release: a tap on a tablet has no hover to say which of two fields
		// it is about to land in, so the routing has to happen while the finger
		// is still down and the focus ring is the signal.
		// The max is a field like the others, so the router hands presses to it
		// by target. It sits on the value's own line, and the nearest-by-distance
		// pass keeps the value on a tie — which is right: the reading's spare
		// width belongs to the number the card is about.
		const fields = [
			input,
			...(maxInput ? [maxInput] : []),
			...(tempInput ? [tempInput] : []),
		];
		card.addEventListener('pointerdown', (event) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest('button')) return;
			// The amount control owns its own presses whole. Without this, its
			// field is not one of `fields`, so the routing below would take the
			// press off it and hand focus to the value — and the geometry branch
			// would claim the control's padding for being below both fields.
			if (
				target instanceof HTMLElement &&
				target.closest('.sheetsmith-pool-adjust') !== null
			) {
				return;
			}
			// A press anywhere on the card also catches a throw in flight, which
			// is the only undo this gesture has.
			scrub.cancel();
			if (fields.some((f) => f === target)) return;
			const selection = doc.getSelection?.();
			if (selection && !selection.isCollapsed) return;

			// The fill bar and the gap above it are the pool's, not the buffer's:
			// the bar is a picture of the pool, and nearest-by-distance would
			// hand that whole region to the buffer for being the lowest control
			// — in a tall cell, most of the card. Tested by target first, since
			// that holds however the card happens to be laid out, and by
			// geometry second for the empty gap, which has no element of its own.
			const onTrack =
				target instanceof HTMLElement &&
				target.closest('.sheetsmith-pool-track') !== null;
			const belowFields = fields.every(
				(f) => event.clientY > f.getBoundingClientRect().bottom,
			);
			if (onTrack || belowFields) {
				event.preventDefault();
				input.focus();
				return;
			}

			let nearest = input;
			let closest = Infinity;
			for (const f of fields) {
				const box = f.getBoundingClientRect();
				const distance = Math.abs(event.clientY - (box.top + box.height / 2));
				if (distance < closest) {
					closest = distance;
					nearest = f;
				}
			}
			// Nothing else wanted this press, and preventing it stops the card
			// taking a text selection instead of handing focus over.
			event.preventDefault();
			nearest.focus();
		});
	},
};
