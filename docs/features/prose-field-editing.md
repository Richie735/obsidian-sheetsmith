# Bracket closing and list continuation in a prose field

Status: shipped
Board card: Rich text's field is a plain `<textarea>` bound by `bindMultiline`. Add two editing affordances, both keystrokes over a string and nothing taken from the app: bracket auto-close, and list continuation on Enter. The `[[` suggester is deferred.

## Model question

**`docs/SPEC.md` §13, "Whether the render seam should grow an `editMarkdown` member", and this feature does not answer it.** The entry already separates the two halves built here from the one that waits: bracket closing and list continuation need nothing from the app, and `bindMultiline` lives in `interaction/`, so no seam and no `RenderContext` member is involved. Only the `[[` suggester needs the vault's filenames, and it stays deferred. The entry stays open; `/land-it` amends it to say these two halves shipped.

Nothing else in the model moves. The contract (§4.1) does not grow, nothing is published to formulas, no write path changes, and no stored spelling changes, so Constraints 3 and 4 are not engaged. What reaches the file is still whatever text the field holds at blur.

## What it does

In a Rich text block and a record body, typing `(`, `[` or `{` inserts its partner with the caret between, so `[[` gives `[[]]` ready for a note name. Typing the closer over one the field inserted steps past it. Backspace inside an empty pair removes both. Enter at the end of a list item starts the next one. Enter on an empty item steps it out one level, or ends the list when it is already at the margin.

## Smallest version

Bracket auto-close and overtype on `(` `[` `{`, and list continuation for `- ` `* ` `+ ` `1. ` with the empty-item exit, all on `beforeinput`, all inserted through `execCommand('insertText')`. It gives up selection wrapping, pair deletion on Backspace, markdown-character wrapping and task-item continuation, each of which is a few lines on the same handler and is in the Design below.

## Design

### Where it lives

A new module, `src/interaction/markdown-typing.ts`, whose job is one sentence: *turn a keystroke in a markdown textarea into the edit an editor would make of it.* `bindMultiline` calls it on its textarea, so both consumers get it — `components/rich-text.ts` (~441) and the record body in `components/record-set.ts` (~2545) — and neither component changes. It is not a new `MultilineOptions` member: both callers want it, and an opt-out nobody passes is the generalisation ahead of evidence `bindMultiline`'s own header refuses (PATTERNS §1). A later caller that must not have it adds the member with itself.

Not in `editable.ts` because that module owns the commit policy, and this owns none of it: nothing here commits, restores, trims or refuses. Kept apart, `bindMultiline`'s policy stays exactly as it is and its header gains one line naming the delegation.

The module imports nothing from `obsidian` and nothing from a component. Every global is the element's own: `textarea.ownerDocument` for the insertion call, and no bare `document` or `window` (PATTERNS §5).

### The event: `beforeinput`, never `keydown`

The reverted attempt built on `keydown`, which keys on physical keys and modifiers. A layout that composes `[` with Option never reached it, so every unit test passed and the app did nothing. `beforeinput` keys on the character actually going in:

| `inputType` | Read | Handled as |
| --- | --- | --- |
| `insertText` | `event.data` | bracket open, overtype, selection wrap |
| `insertLineBreak`, `insertParagraph` | — | list continuation |
| `deleteContentBackward` | — | empty-pair removal |

Any event with `isComposing` set is left to the browser (an IME composing text owns its keystrokes). Any other `inputType` — paste, drop, `historyUndo` — is left alone. Where the handler has nothing to do, it does not call `preventDefault`, so the browser's own behaviour is the default for everything not listed.

### The insertion call, and undo

**`ownerDocument.execCommand('insertText', false, text)`**, with the selection set to the range being replaced first. MDN marks it deprecated, and it is still the only call that goes through the browser's editing path and so joins a text control's native undo stack. `setRangeText` and assigning `value` are programmatic changes to the value and do not go through that path. The probe below is the evidence that counts here, not the documents.

**This reverses a decision the repository has already made once, and the reason is undo.** `src/editor/formula-suggest.ts` `selectSuggestion` refused `execCommand` for `setRangeText` plus a dispatched `input`. Its argument was a measurement: the case made for `execCommand` there was a `change` event that would not fire, and in Obsidian's renderer all three writes fired `change` identically. With that gone, the deprecated call bought nothing and cost a branch the test DOM cannot reach. That argument is about `change`, and it holds for a one-line formula field. It never weighed undo. Here undo is the whole question. A prose field is where a reader types paragraphs and expects Cmd-Z to work, and the probe shows that a single `setRangeText` does not merely skip its own step: it leaves `undo` unable to do anything at all. So what `execCommand` buys here is the one thing the suggester did not need. The test-reach cost is paid by a shim (Tests, below) rather than by shipping an untested branch.

**The deprecation needs a scoped lint exception.** `@typescript-eslint/no-deprecated` reports `execCommand`, and `npm run lint` runs with `--max-warnings 0`. The build adds one block to `eslint.config.mts`, shaped like the `src/settings.test.ts` block: `files: ['src/interaction/markdown-typing.ts']`, that one rule `'off'`, and a comment stating the reason, which is that `execCommand('insertText')` is deprecated with no replacement and is the only write that keeps a textarea's native undo stack. No other file and no other rule. An inline `eslint-disable` is not used, so the exception lives where the config's other exceptions are argued.

A probe in Chrome 153 headless (Obsidian's Electron is Chromium) showed it. Nothing else in the repository evidences native undo, so the steps are recorded here for rerunning:

1. Save a page holding `<textarea id=t></textarea><pre id=out></pre>` and a script that pushes each observation into an array and writes it to `#out` at the end.
2. In the script: `t.focus()`, then run each step below through `document.execCommand`, logging `JSON.stringify(t.value)` and `t.selectionStart`/`selectionEnd` after each.
3. Run `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --dump-dom file:///path/probe.html` and read `#out` in the dumped DOM. `harness/shot.mjs` lists the Chrome paths it looks for on other systems.

The steps and what each showed:

- Set `value = 'abc'`, caret at 3. `insertText` of `'[]'` returned `true` and gave `abc[]`. `undo` took it back to `abc`, and `redo` restored `abc[]`.
- Then an `insertText` of `'x'`, then `t.setRangeText('Q', len, len, 'end')`, giving `abc[]xQ`. `undo` left `abc[]xQ`: it undid **nothing**, not even the `x` inserted before it. That is the breakage this rules out.
- On a fresh textarea, add a `beforeinput` listener, then `insertText` of `'z'`. The listener recorded nothing: `execCommand` does **not** fire a nested `beforeinput`, so the handler cannot re-enter itself.
- `insertText` `'abc'`, select `1..2`, `insertText` `'[b]'`, giving `a[b]c`. `undo` gave `abc` with the selection back on `1..2`.
- `insertText` `'x ()'`, select `2..4`, `execCommand('delete')`, giving `x `. `undo` gave `x ()` with the selection on `2..4`.
- `insertText` `'- one'` then `insertText` `'\n- '` in succession, then one `undo`: both went. Consecutive `insertText` calls coalesce as typing does, so an auto-inserted closer joins the typing step it belongs to, as it would in Obsidian's own editor.
- `insertText` of `''` over a selected `- ` removed it, and `undo` restored it. This is the empty-item exit.

**A keystroke is never lost.** The handler calls `preventDefault` only when the insertion call reports success. Where `execCommand` is absent or returns `false`, the browser's default goes through untouched and the reader gets a plain keystroke rather than nothing.

Escape still assigns `value` to restore, which already bypasses the undo stack. That is `bindMultiline`'s policy and is untouched.

### Brackets

**Pairs:** `(` `)`, `[` `]`, `{` `}`. Fixed, not read from Obsidian's settings: its **Auto pair brackets** and **Auto pair Markdown syntax** toggles are read through `app.vault.getConfig`, which `obsidian.d.ts` does not declare (it appears only in a doc comment on `getControlValue`). Reaching for an undeclared member is the version-fragility §13 already weighs against the internal editor, and it would put an `app` reference into `interaction/`. The behaviour is fixed and the feature doc says so.

**The reference, read rather than recalled.** Obsidian 1.13.7's `app.js`, extracted from the asar the way `harness/calibrate.mjs` reads `app.css`, feeds CodeMirror's `closeBrackets` with `( [ { ' "` when **Auto pair brackets** is on, and with `*`, `_`, a backtick and a triple backtick when **Auto pair Markdown syntax** is on. The rules below follow `closeBrackets` for the three brackets and differ from it on the rest, as stated.

- **Open.** On a collapsed caret, an opener inserts `opener + closer` with the caret between, but only where the next character is end of text, whitespace, or one of `) ] } : ; >`, which is `closeBrackets`' default `before` set. Before a word character it inserts the opener alone, so typing `[` in front of an existing word does not produce `[]word`. `[` then `[` gives `[[]]`.
- **Wrap.** With a selection, an opener inserts `opener + selection + closer` and leaves the selection on the original text.
- **Overtype.** A closer typed with a collapsed caret directly before a closer *this binding inserted* moves the caret past it and inserts nothing. A closer that was already in the text is typed normally.
- **Backspace.** `deleteContentBackward` on a collapsed caret between an adjacent matching pair, `(|)`, `[|]` or `{|}`, deletes both, whether or not the binding inserted them. That matches `closeBrackets`' `deleteBracketPair` and needs no bookkeeping.

**Overtype's bookkeeping maps through every edit, the way `closeBrackets`' own state field does.** Typing a name inside `[[|]]` is an edit too, and a rule that dropped the tracked closers on it would make `]]` produce `[[Name]]]]`. So:

- The binding keeps each pair it inserted as an opener offset and a closer offset.
- **Every change to the value is mapped**, whether the binding made it or the browser did. On each `input`, the binding compares the value with the last one it saw. The common prefix and suffix give the replaced range `[from, to)` and the inserted length. An offset at or after `to` shifts by the length difference. An offset before `from` stays. This needs no `getTargetRanges`, which Chrome leaves empty for a textarea.
- **A pair is dropped only when** an edit's replaced range covers its opener or its closer, when the caret leaves the pair (a `selectionchange` on the textarea itself puts the caret before the opener's end or after the closer), when its closer is overtyped, or on blur. Escape blurs, so its `value` assignment, the one change no `input` reports, always clears the set.
- Listening on the textarea itself, not the document, means nothing outlives the element when the sheet rebuilds.

**Markdown characters** `*` `_` `` ` `` wrap a non-empty selection, which replacing the selection would otherwise destroy, and are never auto-paired on a collapsed caret. This differs from Obsidian, which pairs them when **Auto pair Markdown syntax** is on. A lone `*` is a list marker, `**` typed by hand is the common case, and with the setting unreadable a fixed behaviour should be the one that never adds a character the reader did not type. Pressing `*` twice over a selection gives `**text**`, since the selection stays on the text. Triple backticks are not handled. Quotes and apostrophes are not paired, which also differs from Obsidian: an apostrophe in prose is not an opener, and `closeBrackets` needs a word-boundary rule to cope with that, which is not worth carrying here.

### Lists

Enter (`insertLineBreak` or `insertParagraph`) on a collapsed caret **at the end of a line** that reads as a list item continues the list:

| Current line | Enter inserts |
| --- | --- |
| `<indent>- text` (also `*`, `+`) | `\n<indent>- ` |
| `<indent>3. text` | `\n<indent>4. ` |
| `<indent>- [ ] text`, `- [x] text` | `\n<indent>- [ ] ` |

The indent is copied as written, tabs or spaces. A numbered item increments its own number; the items below it are not renumbered. A checked task continues unchecked.

**An empty item steps out one level, matching Obsidian.** Enter on a line that is only indent and marker (`- `, `3. `, `- [ ] `) inserts no newline, and:

- **Indented:** removes one level of indent and keeps the marker. That is one trailing tab if the indent ends in a tab, otherwise up to four trailing spaces. `\t- ` becomes `- `.
- **Not indented:** removes the marker, and the caret stays on the now-blank line.

So repeated Enter on an empty nested item walks it out to the margin and then ends the list.

What was checked: `@codemirror/lang-markdown` is not in `node_modules` (only `@codemirror/state` and `@codemirror/view` are), so its `insertNewlineContinueMarkup` could not be read. Obsidian does not use it anyway. Its Enter key runs its own `newlineAndIndentContinueMarkdownList`, gated on the **Smart lists** setting (`smartIndentList`), in the same `app.js`. On an empty item that function removes the line when there is no indent, removes one trailing tab when the indent ends in one, and otherwise removes up to four trailing spaces. The rule above is that function's, blockquote prefixes aside. Its marker pattern is `^([>\s]*)(([*+-] |(\d+)([.)] ))(?:\[(.)\] )?)?`, and it always continues a task as `[ ] `, which matches the table.

**Where this differs from Obsidian, deliberately:**

- **Mid-line Enter** splits the item there in Obsidian. Here it is the browser's plain newline, as is Enter with a selection and Enter on any other line.
- **Shift-Enter** in Obsidian inserts a newline indented to the item's text with no marker (`newlineAndIndentOnly`). Here a `textarea` gives Shift-Enter the same `insertLineBreak`, and `beforeinput` carries no modifiers, so Shift-Enter continues the list too. Accepted rather than recovered through `keydown`, which is the event this feature exists to stop depending on.
- **`1)` markers and `>` blockquotes** continue in Obsidian and not here.

**Continuation never produces a reserved line.** The `refuse` path rejects `## ` in Rich text and `## ` or `### ` in a record body. Every inserted line starts with the copied indent and a marker from `-` `*` `+` or a digit, never `#`, and bracket insertion never writes `#`. No new refusal is reachable through this feature.

### Appearance, empty and error states

No appearance changes: no class, no style, no element. An empty field behaves the same: the first `[` closes, and `- ` followed by Enter clears the marker. There is no new error state; the refusal notice is the existing one.

**Design review is skipped.** The feature is behaviour inside a textarea that already exists, and a harness shot of it is byte-identical before and after. Checked by tests, not by looking.

### Tests, and where they go

`markdown-typing.ts` gets no test file of its own. PATTERNS §10 names `interaction/` gesture modules as tested through a control that drives them, on the condition that everything the module owns is driven somewhere.

- **`components/rich-text.test.ts` holds the full matrix**: every row of both tables above, the overtype rule with its mapping and drop cases, the wrap and Backspace rules, the composing skip, and the not-lost fallback. `selectionchange` is dispatched on the field by hand where a case moves the caret. Events are `InputEvent('beforeinput', { inputType, data, cancelable: true })` built from the field's own window. Each case is spelled out literally, not iterated from an exported set (§10's vacuous-pass rule).
- **One case is the regression guard for the revert**: a `[` arriving as `insertText` with **no `keydown` dispatched at all**, which is what an Option-composed bracket looks like, still closes. Its name says so.
- **`components/record-set.test.ts` proves the second consumer**: a bracket closes and a list continues in a record body, and a continued list over existing `### ` text still refuses on blur with the existing message, so nothing here moved the refusal.
- **Undo.** happy-dom has no `execCommand`. A helper in `src/test/` installs one on the field's `ownerDocument` that applies the text to the focused control and records its calls, and the tests assert that every insertion went through `insertText` on the element's own document and that the handler never assigns `value`. That is what can be asserted without a browser; the native stack itself is the Chrome probe above. Both test files use the one helper, which becomes the only spelling of the shim (§10).
- No new character or layout fixture. Both files already build a field; the cases type into it.

## Config fields

None. The behaviour is fixed, and a layout has no reason to turn it off per component.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

Nothing stored changes. The field still commits its trimmed text on blur, and what the reader typed is what the text holds, so round-tripping and existing notes are exactly as they were.

## Acceptance criteria

- [x] In a Rich text field, `(`, `[` and `{` on a collapsed caret before end, whitespace or a closer insert their pair with the caret between; before a word character they insert the opener alone.
- [x] `[` `[` gives `[[]]` with the caret in the middle, and typing `]` `]` then leaves `[[]]` with the caret after it, not `[[]]]]`.
- [x] `[` `[`, then `Neverwinter` typed one `insertText` at a time between the pair, then `]` `]`, gives `[[Neverwinter]]` with the caret after it, not `[[Neverwinter]]]]`.
- [x] An outer tracked closer shifts with edits inside an inner pair: `(` `[` `a` `]` `)` gives `([a])` with the caret at the end, not `([a]))`.
- [x] A tracked closer is dropped when an edit covers it (select across it and type), when the caret leaves the pair, and on blur; a `)` typed afterwards is inserted.
- [x] A closer typed before a closer the reader typed themselves is inserted, not stepped over.
- [x] Backspace between an adjacent `()`, `[]` or `{}` removes both.
- [x] An opener over a selection wraps it and keeps the selection on the text; `*`, `_` and `` ` `` over a selection wrap it, and on a collapsed caret insert a single character.
- [x] Enter at the end of `- a`, `* a`, `+ a`, `3. a` and `- [x] a`, each with and without leading indent, inserts `\n<indent>- `, `* `, `+ `, `4. ` and `- [ ] ` respectively.
- [x] Enter on an unindented empty item (`- `, `3. `, `- [ ] `) clears the line and inserts no newline.
- [x] Enter on an indented empty item removes one level and keeps the marker, inserting no newline: `\t\t- ` becomes `\t- `, `      - ` (six spaces) becomes `  - `, and `  - ` becomes `- `.
- [x] Mid-line Enter and Enter on a non-list line insert a plain newline.
- [x] A test named for the revert: `insertText` of `[` with no `keydown` dispatched closes the bracket.
- [x] A `beforeinput` with `isComposing` set is not prevented and changes nothing.
- [x] Where `execCommand` is missing or returns `false`, the event is not prevented.
- [x] Every insertion calls `insertText` on the field's own `ownerDocument`; no path assigns the field's `value` except Escape's existing restore.
- [x] In a record body, a bracket closes and a list continues; a body holding `### ` still refuses on blur with its existing message.
- [x] `bindMultiline`'s existing tests pass unchanged: blur commits, Escape restores and announces, Enter commits nothing, the value is trimmed at each end only.
- [x] `markdown-typing.ts` imports nothing from `obsidian`, reaches no bare `document` or `window`, and has no test file of its own.
- [x] `eslint.config.mts` turns off `@typescript-eslint/no-deprecated` for `src/interaction/markdown-typing.ts` alone, in its own block with the reason in its comment, and the file carries no inline `eslint-disable`.
- [x] `docs/BACKLOG.md` § UI holds a row for the formula suggester's accept wiping its field's undo stack.
- [x] `npm run lint`, `npm test` and `npm run build` pass.
- [ ] **OUTSTANDING AT LAND — the manual vault walkthrough has not been run.** The owner landed the feature without it and runs it afterwards, which is a decision recorded here rather than a box quietly ticked. **Four observations are therefore unwritten**, and this document owes all of them, one per step below: the Option-composed bracket reaching the handler in the real app (steps 1 and 5), native undo inside Obsidian (step 2), the popout realm (step 4), and the browser's own `selectionchange` ending a pair (step 6), which the tests dispatch by hand. These are the things the revert showed a unit test can pass without. **No fixture has to be built**: the steps ride on the existing Rich text and Record set fixtures, and which notes were used is recorded here when the walkthrough is run.

## Vault fixture

No new fixture. This is a capability of the prose field, not a registered component, so it rides on fixtures that already hold one. The throwaway vault must hold:

- **A character note whose layout places a Rich text component.** Its field is where the steps are typed.
- **A character note whose layout places a Record set with a body**, meaning the record body field `bindMultiline` binds, with at least one record, so step 5 has a body to type into.

Use the existing Rich text and Record set fixtures where they already cover this. Record which notes and layouts were used when the walkthrough is filled in, so the next reviewer can check their own copy against it (AGENTS.md § Testing).

**What to press, in order.** Run with `npm run dev` and the plugin hot-reloading into the vault.

1. **The revert's own case.** Switch macOS to the Portuguese keyboard layout, where Option+8 types `[`. In the Rich text field, type `[` `[`, then a name, then `]` `]`. The field reads `[[Name]]` with the caret after it and no doubled closers. Blur, and the rendered layer shows the link.
2. **Undo.** Type `(` so the field auto-closes to `()`, then press Cmd-Z at once. The pair goes in one step, and Cmd-Shift-Z brings it back.
3. **Backspace and lists.** Type `(`, then Backspace: both brackets go. On a new line type `- [x] a` and press Enter: the next line starts `- [ ] `. Press Enter again on that empty item: the marker clears and no new line is added.
4. **The popout realm.** Open the character's sheet in a popout window (**Open in new window**) and repeat step 1's bracket case there. `[[Name]]` again, and undo works.
5. **The record body.** In the Record set's body field, type `[` `[`, a name, `]` `]`. The body reads `[[Name]]` and saves on blur without a refusal.
6. **The caret leaving a pair.** Type `(`, press Right past the `)`, press Left back to where the `)` was, then type `)`. Expect a second `)` inserted, not a step past. This is the only check that the real `selectionchange` reaches the field; the tests dispatch it by hand.

## Commit boundaries

A plan for `/land-it`, not a schedule to build to. The tree stays uncommitted through implementation and every round of findings.

1. `feat: Close brackets as they are typed in a prose field`. Adds `interaction/markdown-typing.ts` with open, overtype and its offset mapping, wrap and pair Backspace. Calls it from `bindMultiline` with the header line. Adds the scoped `no-deprecated` block to `eslint.config.mts`, the `src/test/` shim, and the bracket cases in both component test files, including the no-`keydown` guard.
2. `feat: Continue a list on Enter in a prose field`. The list half of the module, including the one-level step out, and its cases in both test files, including the reserved-line case in the record body.
3. `docs: Record the prose field's editing keystrokes`. Contains:
   - a row in `UI` §9's vocabulary table;
   - a line in `PATTERNS` §10 naming `markdown-typing.ts` beside the other gesture modules tested through their consumers;
   - the amendment to `rich-text-and-image.md`'s "Obsidian's editing affordances" bullet;
   - the `docs/BACKLOG.md` § UI row, added during the build. Suggested wording: *Gap:* accepting a formula suggestion leaves its field unable to undo, since the probe here showed one `setRangeText` empties the native stack. *Where:* `editor/formula-suggest.ts` `selectSuggestion`. *Fix:* insert through `execCommand('insertText')` as `interaction/markdown-typing.ts` does, keeping the dispatched `input`. *Waiting on:* a change to the suggester.

   `docs/SPEC.md` §13's amendment is `/land-it`'s.

## Deliberately not doing

- **The `[[` suggester.** It needs the vault's filenames and waits on §13's `editMarkdown` question, which stays open.
- **Honouring Obsidian's editor settings.** `getConfig` is not public API (above). Fixed behaviour, stated.
- **Tab and Shift-Tab to indent or outdent an item.** Tab moves focus out of a textarea today, which is the keyboard route off the field. Taking it would need an argument under `UI` §6 that this feature does not have.
- **Renumbering** the items below an inserted numbered item, **`1)` markers**, **blockquote continuation** (`> `), **splitting an item on mid-line Enter**, and **Obsidian's Shift-Enter**. Each is stated under Lists as a difference from Obsidian.
- **Pairing quotes, auto-pairing markdown characters on a bare caret, and triple backticks.** These are differences from Obsidian's settings, stated under Brackets.
- **Fixing the formula suggester's undo.** Found by this feature's probe, recorded as a `BACKLOG` row, and left to its own change.
- **Single-line `bindEditable`.** Out of scope; a one-line field holds no lists, and its Enter commits.
- **Any change to `bindMultiline`'s policy.** Blur commits, Escape restores and announces, Enter commits nothing, trimming is unchanged, and `refuse` still refuses the same line starts.
