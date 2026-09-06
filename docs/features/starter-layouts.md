# Starter layouts

Status: shipped
Board card: ✨ Starter layouts — solve cold start. A fresh install has an empty
layout folder and nothing to pick, so ship two example layouts with the plugin
and add a command that copies a chosen one into the configured layout folder.

*The card says two example layouts and the spec ships three sheets for real,
widely played systems. That is not a bigger version of the card; it is a
different answer to the same question. Cold start is solved by a sheet a new
user can actually play on, and the owner's ruling on seeing the first real one
was that the examples should be replaced with practical ones.*

*The history is kept because it is the argument. The spec first shipped two
demonstration starters in invented vocabulary — **Starter journal** and
**Starter grimoire** — and then designed a generic full-sheet exemplar,
**Starter atlas**, as a substitute for the 5e sheet the owner had asked for.
All three were built under a "no game content" bar stricter than §11's own
words. Atlas was replaced by Starter 5e; the journal and the grimoire were then
replaced for the same reason, by two more real systems. None of the three is
deferred and none is a fourth entry. The argument that replaced them is in the
Model question below, written out so a later reader does not re-derive the
mistake and delete a starter again.*

## Model question

None of §13's. No component is added, the contract does not grow, the catalog
does not grow, and nothing new is published to formulas: every starter is an
arrangement of already-registered components, which is the position §4.3 has
already argued twice — the spellbook and the six-up are named there as
arrangements, not schema additions, and the starters are those arrangements
shipped rather than photographed. Each starter is that sentence at full size: a
whole sheet is an arrangement too, and nothing about page architecture is a
schema key.

The feature carries two decisions of its own. The first was named before build
because the obvious answer is wrong: **how a bundled layout travels.** The
second was taken wrongly first and corrected twice: **whether a starter may be
shaped like a real game system.** All three now are.

### System-shaped starters are compatible with §11 as written

**§11's words are the whole of the rule:** "**Bundled rules content.** No spell
lists, no item databases, no SRD import." That bans content *databases* — the
plugin becoming a distributor of game data, with the maintenance, licensing and
update burden that implies. It does not ban a layout shaped like a system.

A system sheet's *structure* is none of the three things §11 names. Ability
scores, a skills roster, proficiency arithmetic, a spell-slot progression
written as formulas, an action roster with dot ratings, a stress track — these
are a **shape**, not a database: nothing on the sheet can be looked something up
in, and there is no rules text, no stat block and no description anywhere in
the file. The sharpest demonstration is any Record set on any of the three —
the 5e spellbook, the Blades special abilities, the PF2e feats — each of which
is there and ships **empty by construction**, because a Record set's items are a
character's and a layout holds structure only (SPEC §2). *No spell list, feat
list or ability list travels even though the component that would hold one is
on every sheet.*

**What a layout can carry, stated exactly, because the easy version of this
sentence is false.** It is tempting to say a layout physically cannot carry
what §11 bans; that is true of a Record set and untrue of a **Table**, whose
declared rows are layout data and do travel, and untrue of a **Card's
`options`**, which are a declared list. The 5e sheet ships three item rows —
`Adventurer's pack`, `Rations`, `Rope, hempen (50 ft.)` — and eighteen skill
rows; the Forged in the Dark sheet ships twelve action rows and four option
lists (playbooks, heritages, backgrounds, vices); the PF2e sheet ships sixteen
skill rows and a handful of condition names. So the things a reader would most
readily call rules content arrive through the two mechanisms the structural
argument does not cover, and the argument has to be made on the content rather
than on the mechanism. It holds anyway, and more honestly: every one of those
is **the name of a thing, with no rules attached** — no weight, no cost, no
duration, no effect, no description, nothing to resolve play with and nothing
to look anything up in. A list of names is not a database, which is exactly
why §11 names *spell lists* and *item databases* rather than "any name of
anything".

**This was got wrong twice, in this feature, and the record matters more than
the ruling.** The first two starters were built under "no game content", a bar
taken from handoff prose rather than from §11, and a third was designed twice as
a generic substitute for a 5e sheet the owner had asked for three times. Nothing
in the spec justified that bar; it was inherited and never checked against the
sentence it claimed to enforce. When the 5e sheet finally shipped, the owner's
response was to replace the two demonstrations with real systems too. So the
rule for a later reader is: **§11 is what §11 says.** A starter shaped like a
system stays, and a set of them is a set of shapes.

**"Nothing claims completeness" needs the distinction it turns on**, because
every starter's own pitch is that it is complete. Each is complete as a
**structure** — every panel of the sheet, deliberately, since a trimmed one is
not something a reader can hold against the sheet they own. Each is empty as a
**content set**: no roster of spells, items, feats, abilities or monsters, and
no claim that what it holds is all of anything. §11 bans the second. The first
is the deliverable, and the two are only confusable because one word covers
both.

**Licensing, answered rather than raised, for three licenses.** §11's rationale
names licensing, so leaving it open would leave the question a plugin reviewer
asks unanswered. The three systems' open rules are offered under three
licenses: the 5e SRD 5.1 under **CC-BY-4.0**; the Blades in the Dark SRD under
**CC-BY-3.0**; the Pathfinder Player Core rules under the **ORC** license. The
conclusion is the same for all three: **nothing is owed, and no attribution
notice ships.** The reasoning, which a reader can check rather than take:
every one of those licenses governs *expression* — the text that describes a
rule — so the question is whether any of that expression is here. What travels
is names (abilities, skills, actions, playbooks, heritages, conditions, four or
three bonus-type words), a few kit lines, arithmetic written as this plugin's
own formulas, and a grid of positions. Names and game mechanics are not
protected expression — copyright protects the text that describes a rule, not
the rule, and titles and short phrases are not protected at all — and no
protected text travels: no spell description, no item entry, no feature
wording, no playbook ability text, no table of values lifted from a book. The
arithmetic is written in Sheetsmith's own expression language against this
plugin's own components, which makes it our expression of a mechanic rather
than a copy of anyone's. **The condition under which this stops being true is
the same for all three:** the moment a starter ships *descriptions* — what a
spell does, what an item is, what a special ability lets a scoundrel do — that
is protected expression under the respective license, CC-BY attribution or the
ORC notice becomes owed, and this paragraph stops applying. The guard against
that is the one on the modifier lists below, generalised: a starter carries
names and arithmetic, and never text.

**Where the line actually is**, since it is real and the 5e and PF2e sheets sit
nearer to it than anything else in the repository: the named modifier
definitions, settled in each starter's own section below.

### Trademarks are a separate question from §11, answered per name

A rules license says nothing about a *mark*, and each of the three systems has
one that must not travel: not in a layout name, a description, a user-facing
string, a source filename, or a commit subject. Each starter's name is the
generic label the community or the license itself already uses in place of the
mark, and the three arguments are not equally strong, so they are stated in
descending order:

- **"5e".** "Dungeons & Dragons" and "D&D" are Wizards of the Coast marks. "5e"
  is universal generic shorthand carrying no mark, used by every third-party
  publisher. Strong.
- **"Forged in the Dark".** "Blades in the Dark" is One Seven Design's
  trademark, and their licensing page bars it from the *title* of a derived
  product. **"Forged in the Dark"** is the label the same page designates for
  works built on the SRD, and a whole category of published games ships under
  it. Two things a reader should check rather than take. First, One Seven's
  stated attribution condition attaches to the Forged in the Dark **logo**,
  and this starter uses the *phrase* and never the logo, so no notice is owed.
  Second, this argument is **weaker than "5e"'s, not equal to it**: "5e" is an
  un-owned edition number, while this rests on the rights-holder's designation
  and continued posture. It is a strong position because it is exactly the
  position the rights-holder asks for; it is not the same kind of position.
- **"PF2e".** "Pathfinder" is Paizo's mark. "PF2e" is the community's
  shorthand for Pathfinder Second Edition — and **this is the weakest of the
  three arguments**, stated as such so it is not mistaken for the other two:
  unlike "5e", the abbreviation is *derived from* the mark rather than from a
  generic edition number, and unlike "Forged in the Dark", no rights-holder
  designates it. The argument that carries it is **nominative use**, which a
  reader can check: the name states what the sheet is compatible with, the
  mark itself appears nowhere — not the word, not the logo — and nothing but
  names and arithmetic travels, which is exactly the content a compatibility
  label exists to describe. What is deliberately *not* leant on is the
  rights-holder's posture, which a reader cannot check and which can change.
  **There is no better generic name for this system**, and that is itself the
  argument for the shorthand rather than a reason to reach for a substitute: a
  name a player would not recognise is not a name.

Each replica costs exactly one key: in both reference layouts the interior
holds no mark at all — labels are ordinary roleplaying vocabulary or SRD
vocabulary ("Armour class", "Saving throws", "Playbook", "Stress", "Trauma") —
and the single occurrence of a mark in each file is its own `name`, which does
not travel. The PF2e sheet is built from scratch, so it never had the mark to
remove; its guard is the scan in the criteria.

### The layouts are embedded in `main.js`, not read from the plugin folder

The release artifacts are `main.js`, `manifest.json` and `styles.css`
(`AGENTS.md`), and every install channel — the catalog, BRAT, a manual copy —
delivers exactly those three. A layout shipped as a fourth file in the plugin
folder would need the release workflow to produce it, every channel to carry it,
and the plugin to read its own folder through the adapter at runtime, which is
outside the vault and outside the minimize-scope rule. Embedding costs a few
kilobytes of `main.js` and removes the entire category: if the plugin loaded,
the starters are there.

### The sources are real JSON layout files, inlined at build time

Each starter lives in the tree as a `.json` file that *is* a layout file — the
same format `loadLayout` reads and export/import will ship — not a TS object
literal. Three reasons, each refusing an alternative:

- **Against a TS literal:** `parseLayout` is the authority on what a layout is,
  and a literal typed as `ComponentConfig[]` would be checked by the wrong
  checker — the compiler passes shapes the parser refuses and vice versa. A
  JSON file goes through the real gate (below). It is also droppable into a
  vault by hand for a manual look, and it diffs as what it is.
- **Against an esbuild text loader:** mapping `.json` to `text` is a global
  build-config change, and tsc and vitest would then disagree with esbuild
  about what the import *is*. The default json loader needs no configuration
  under `bundle: true`; `tsconfig.json` gains `resolveJsonModule` and nothing
  else changes.
- **The raw text is not needed at runtime anyway**, because of the next rule.

### One writer, one spelling — and the same gate a vault file passes

The install path does not copy bytes. The catalog hands the imported object to
`parseLayout(JSON.stringify(source))` — the identical validation every vault
layout passes, so a starter that has gone stale against the schema is refused
loudly instead of landing broken — and what reaches the vault is what
`serialiseLayout` says, which is `appendModifierDefinition`'s own precedent:
one writer, one spelling.

A test then pins the tree to the vault: for each source,
`serialiseLayout(parseLayout(text)) === text`. Layout files carry no
byte-identical promise (`parse/layout.ts` says so — Constraint 3 is about
character notes), so this is discipline rather than constraint: it means the
file a reviewer reads in the tree is byte-for-byte the file a user gets, and it
is the tripwire that fails the build when the layout schema moves under a
starter.

### Placement: `src/starters/`

A new folder under PATTERNS §2's rule — named for what it does: hold the
layouts the plugin ships and the flow that installs one.

```
src/starters/
  forged-in-the-dark.json   the compact one: replica of the vault's Blades sheet
  5e.json                   replica of the vault's 5e sheet
  pf2e.json                 built from scratch to the specification below
  index.ts                  the catalog: name, description, source, in offer order
  picker.ts                 the suggester and the install flow
```

Each source is one more file and one more catalog entry: nothing about the
embedding, the install path or the picker changed to admit the second or the
third, which is the evidence that the shape chosen before the build was the
right one.

`index.ts` imports nothing from `obsidian`, so the catalog is testable as data;
`picker.ts` may, since `starters/` is not one of the two restricted folders.
The copy itself goes through `src/layouts.ts`: `createLayout` grows an optional
`layout` parameter defaulting to the empty layout it writes today, so folder
creation and the duplicate refusal stay in the one place that owns them. Its
single existing caller (`editor/layout-editor.ts`) is unchanged.

### Data safety

This feature writes exactly one new file per invocation, in the layout folder,
under a name it refuses if taken. It never touches a character note, never
overwrites a layout, and the installed copy is the user's file from the moment
it lands — a later plugin update ships new bundled sources and rewrites
nothing in any vault. Constraint 4 holds by construction.

## What it does

A fresh install can put a playable sheet on screen in one gesture: **Add a
starter layout** in the command palette offers three bundled layouts in a
suggester, and choosing one copies it into the configured layout folder,
creating the folder when missing. Each is a **complete sheet for a real, widely
played system** — Forged in the Dark, 5e, and PF2e — so a new user who plays one
of them meets a sheet they can check against the one they already own, and a
new user who plays none of them sees at once that a whole character sheet is
something this plugin does rather than something it might. All three are
structure and arithmetic: no spell list, no item database and no SRD import
travels, which is what §11 forbids.

## Design

No sheet UI is drawn and no CSS is added: every surface is Obsidian's own
chrome (command palette, suggest modal, notice), so `docs/UI.md`'s vocabulary
and the `.sheetsmith-view` scope are not touched.

**The command.** Id `add-starter-layout`, name **Add a starter layout**, plain
`callback` rather than `checkCallback`: cold start is exactly the moment no
pane, file or state exists to condition on, so the command is always offered.
Registered in `src/commands.ts` beside the existing four.

**The suggester.** A `SuggestModal` subclass in `src/starters/picker.ts` (the
`ui/ConfirmModal` / editor `NameModal` precedent: one consumer, so it lives
beside that consumer, not generalised into `ui/`). Each row is the starter's
name with its one-line description muted beneath it, because the name alone
cannot say which one to pick. **Offer order is Forged in the Dark, then 5e,
then PF2e**, and the axis is the one the list has always had — increasing size
and density, so a reader stops at the first row that is more than they want.
Forged in the Dark is 21 components on six columns with no function library and
reads in a minute; 5e is 54 components on twelve with a library, two tab sets
and five modifier definitions; PF2e is the same architecture with a deeper
arithmetic underneath it. The alternative axis, play-share, would put 5e first
and was not taken: a reader who plays a specific system finds it by name
whatever the order, and the order only matters to the reader who plays none,
for whom smallest-first is the kind one. Every description names its system
plainly, because a reader who plays that game will pick it on the word alone
and a reader who does not needs to know the row is not for them. Escape closes
it and nothing is written. The list is bundled, so it always holds every entry
until the user narrows it: `getSuggestions(query)` is abstract on
`SuggestModal`, so a query matching neither name nor description returns
nothing and the app draws its own empty list. That state is the platform's and
is reachable rather than designed away — which is why the search reads the
description as well as the name, since "spells" or "stress" is a question only
the second line answers.

**The install.** Choosing an entry validates the source through `parseLayout`,
then writes it via `createLayout` with the parsed layout as content. The vault
filename is the layout's own `name` (a test asserts the two agree, so a file
can never disagree with the name inside it). On success, a notice:
`Added "Starter 5e" to Sheetsmith layouts.` — the layout name and the folder,
because the folder is configurable and the user needs to know where it went.

**Error states.** A name the folder already holds is refused with
`createLayout`'s existing message in a notice, and nothing is written — not
suffixed, not overwritten, because the existing file may be the user's edited
copy of an earlier install and both silent answers destroy it. A source that
fails `parseLayout` is refused with the parser's message; the round-trip test
exists so that state cannot ship, but the message is there rather than a crash
because a refusal with a reason is this codebase's failure shape (PATTERNS §4).

### The three starters

Two are **replicas** of layouts in the test vault — built with the owner,
measured against the real sheets, and lived in — and one is **built from
scratch** to a specification below, because no vault layout exists for it.
For a replica, exact positions, copy and arithmetic are the source's, and the
only changes are its `name` and a `description` written fresh for the
suggester; the spec fixes what each demonstrates and what its rename leaves
behind. For the built one, the spec fixes the component list, the arithmetic
and the arrangement precedent in enough detail that the build is not designing
a system from memory, and grid positions are the build's to settle against the
real schema.

**Why real systems, given that the first two starters were not.** A
demonstration in invented vocabulary can show *how* a formula works and cannot
show *that a sheet is right*, because there is nothing to check it against. A
reader who plays one of these three systems can hold the starter against the
sheet they own, and that check is the whole value: it is what makes "this
plugin does character sheets" a claim rather than a promise. Three systems
rather than one because the three most-played systems cover most of the readers
who arrive, and the reader who plays none of them still sees three different
shapes of sheet — a one-screen six-column sheet, a twelve-column sheet with
tab sets, and the same architecture over a different arithmetic — which is more
than any demonstration could show.

#### Starter Forged in the Dark

A replica of the vault's **`Blades in the Dark.json`** (a fixture outside the
repository, read-only reference, never copied into the tree; its character is
`Characters/Ravel.md`). Twenty-one components on six columns, no function
library, one trigger (**Downtime**), no modifier definitions. **Replicated
whole**; the two changes are its `name` and the description.

What it carries, which is the whole of a Blades scoundrel on one screen:

- **Identity as four option cards** across the top: playbook, heritage,
  background and vice, each a Card with `options` — the Dropdown shape — so the
  character picks from the system's own lists rather than typing.
- **Resources**: a coin Track and a stash Pool.
- **Stress, trauma and healing** as Tracks with `sense` set (harm or
  progress), and an **armour Track with rows** (armour, heavy, special) bound
  to the Downtime trigger.
- **The three attribute ratings as aggregates**: Insight, Prowess and Resolve
  are Cards deriving `count(<table>, Rating > 0)` over the three action Tables
  beneath them — the rating is the number of actions with at least one dot,
  which is the system's own rule, written as an aggregate over declared rows.
- **Three action Tables** of four actions each, one `level` column of up to
  four dots, labels hidden because the rating card above is the heading.
- **Harm** as a Table with three declared severity rows and two slots each.
- **XP** as a Track with rows (playbook 8, three attributes 6 each).
- **Special abilities** as a Record set — empty by construction.
- **Items** as an open Table with a totalled load column, and a **load Card**
  whose value is an option (light, normal, heavy) and whose derived reads the
  total against it.

What it demonstrates that the other two do not: a whole game on one screen
with no function library at all; aggregates over declared rows as the *primary*
arithmetic; option cards as identity; and a sheet that **mostly resolves cold** — a
`count` over rows with no dots is 0 and a `total` over an empty list is 0, so a
fresh scoundrel's three ratings read 0 rather than "?". The one exception is
the load card: `value - items.Load` reads the card's own option, and a dropdown
with nothing chosen publishes nothing (SPEC §5), so the load **publishes
nothing** until a load is picked. **What it *draws* is not "?" either**, and the
two halves of that sentence are worth keeping apart: a card whose `derived`
reads its own `value` takes `card.ts`'s empty-value accommodation and shows an
em dash beside its option chevron, because an unchosen option is a blank and not
a formula that failed. So a fresh scoundrel is three zeros and one card plainly
waiting to be chosen — the opposite of the other two starters' cold state, and
worth having in the set for that reason.

**The mark it leaves behind:** `Blades in the Dark` — its own `name`, the
single occurrence in the file. Its interior is SRD vocabulary (Playbook,
Heritage, Vice, Stress, Trauma, the action names) and the setting's place names
in the heritage options, all of which are names of things with no text
attached.

#### Starter 5e

A replica of the vault's **`DnD 5e Standard.json`** — the most complete sheet
this plugin has ever rendered, measured against the real thing over three
rounds. Fifteen top-level components and 54 in all, both tab sets, the full
skills roster, the function library, both reset triggers with their bindings,
the four bonus types and the five modifier definitions. **Nothing is cut**,
because every candidate cut damages the one thing this starter is for: a 5e
sheet missing its skills roster, its rest triggers or its equipment tab is not
a sheet a reader can check against their own. The only changes from the source
are its `name` and the description.

The arrangement it carries, which is also the record of what the reference
learned over three rounds of measurement — and the **architecture precedent
the PF2e sheet follows**:

- **A header band**: the **Passport** beside a **Pool** for hit points, with
  speed, proficiency and an inspiration **Track** on the row beneath them.
- **A full-width strip of six ability cards**, `hideLabel`, each deriving its
  modifier through the function library.
- **Three columns balanced to end together**, of *unequal* width: saves,
  senses, hit dice and proficiencies (cols 1–3); the skills table with death
  saves and exhaustion under it (4–7); and a four-tab set — combat, actions,
  spells, equipment — as the third column (8–12). All three stacks terminate on
  row 13.
- **A second full-width tab set below** — features, description, notes,
  extras — the reference's answer to everything that does not belong on the
  front page.
- **The engine throughout**: a function library whose comments name the one
  line to change per character, published table columns read by cards
  elsewhere, a spell-slot progression written as formulas over the character's
  level, conditional typed modifiers, and rest triggers bound to the pool, the
  slots and the conditions table.

**The five named modifier definitions: kept, and this is where the line runs.**
Shield of Faith, Studded leather, Ring of Protection, Alert and Bark Skin name
specific spells, items and a feat, and they are the part of this starter that
brushes §11. The ruling is to **keep all five**:

- **They are what the demonstration is made of.** Between them they show four
  bonus types contesting one target, conditional enrolment through a toggle
  column (`when: Active` / `Worn` / `Attuned`), an amount that is an
  *expression* rather than a number (`prof`), and an `override` beside
  additives. Renaming them to invented equivalents keeps the mechanisms and
  loses the ability to check them: "+2 armour while worn" is verifiable
  against a real game and an invented name is not.
- **Five strings are not a database.** §11 names spell *lists*, item
  *databases* and SRD *import* — surfaces with completeness claims and lookup.
  These carry a name, a target, an amount, a type and a condition: no rules
  text, no duration, no cost, no description, and nothing to look anything up
  in. They are examples on a layout the user owns and edits from the moment it
  lands.
- **They already ship in this repository's own review fixture**, which is where
  every reviewer of this plugin has met them.

**And the guard, because this is the part that could grow into a violation.**
A starter's modifier list demonstrates *mechanisms* and never grows toward
*coverage*. A definition added later earns its place only by showing something
the existing ones do not — never by filling a gap in a spell list. A later
editor who finds a list growing should read that as the §11 breach it would be.
The same guard applies to the PF2e list below.

**The mark it leaves behind:** `DnD` — in its own `name`, the single occurrence
in the file. Its interior is ordinary roleplaying vocabulary.

#### Starter PF2e

**Built from scratch**, the one starter with no vault reference, because
Pathfinder Second Edition is the most-played system after 5e and a set that
claims to cover the widely played systems cannot leave it out. It follows the
**5e sheet's architecture as its arrangement precedent** — header band,
full-width attribute strip, three columns balanced to end together with a tab
set as the third, a second full-width tab set below — so the two twelve-column
sheets read as one family and a reader who has seen one knows where to look on
the other. What differs is the arithmetic underneath, and that is where this
section spends its words: **the dev must not be designing a system from
memory**, so the rules the sheet encodes are stated here, and everything the
spec author was unsure of is flagged at the end for the owner to correct before
build.

**The edition is the Remaster** (Player Core, 2023 onward), for two reasons
that decide each other: it is the edition the **ORC** license covers, which is
the licensing argument above, and it is the current one. The most visible
consequence is that **attributes are stored as modifiers directly** (the
Remaster dropped ability scores), so the six-card strip holds `+3`, not `16`,
and derives nothing.

**The arithmetic, which is almost all one rule.** PF2e's proficiency ladder is
the whole of its bonus arithmetic: untrained adds **+0**; trained, expert,
master and legendary add **level + 2, +4, +6, +8**. Every check, save, DC and
AC is *attribute + proficiency + typed modifiers*, and every proficiency is one
of those five ranks. The function library is therefore small and the sheet is
built on it:

```
# Proficiency is the whole of the arithmetic: untrained adds nothing, and
# every trained rank adds level plus two per rank.
level = passport.level
prof(rank) = if(rank > 0, level + 2 * rank, 0)
# The class's key attribute. Change this one line per character.
key = attributes.STR
```

Where `rank` is a `level` column's numeric value (Untrained 0 … Legendary 4),
exactly as the 5e sheet's `Training` column feeds `ability + Training * prof`.

**The components, panel by panel:**

- **Header band.** A **Passport** (fields: ancestry, heritage, background,
  class, deity, level — the Remaster identity, with no alignment and, per the
  owner's ruling below, no size); a
  **Pool** for hit points with `hasTemp`, the character owning its maximum
  (`maxSource: character`, as the 5e sheet does — the Remaster's max-HP formula
  needs the ancestry's and class's HP numbers, which are content); and beneath
  the pool a **Speed** card, a **Class DC** card deriving `10 + key +
  prof(<class rank>)`, and a **Hero points** Track of three.
- **A full-width strip of six attribute cards** (Card set, `hideLabel`,
  `signed`): Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma,
  each a stored modifier.
- **Left column.** A **Saves and Perception** Table — declared rows Perception
  (Wis), Fortitude (Con), Reflex (Dex), Will (Wis) with `values.attribute`
  referencing the strip; a `level` column **Rank** with the five ranks; a
  computed **Total** column `attribute + prof(Rank)`, `signed`, `publish:
  true`. A **Proficiencies** Table for the ranks that carry no attribute —
  declared rows Class DC, Unarmored, Light armor, Medium armor, Heavy armor,
  Simple weapons, Martial weapons, Advanced weapons, Unarmed, Spellcasting —
  with the same Rank column and a computed **Bonus** column `prof(Rank)`,
  `publish: true`, so the Class DC card, the AC card and the spell cards read
  their ranks by row name rather than each holding a copy. An **Armor** Card
  set holding the worn armor's **Item bonus** and **Dex cap**. A **Languages**
  or **Senses** Rich text to end the band in a stretcher.
- **Middle column.** The **Skills** Table: sixteen declared rows — Acrobatics
  (Dex), Arcana (Int), Athletics (Str), Crafting (Int), Deception (Cha),
  Diplomacy (Cha), Intimidation (Cha), Medicine (Wis), Nature (Wis), Occultism
  (Int), Performance (Cha), Religion (Wis), Society (Int), Stealth (Dex),
  Survival (Wis), Thievery (Dex) — fully declared, with no open rows. Rank
  column, computed Total `attribute + prof(Rank)`, `signed`, `publish: true`.
  Beneath it a separate **Lore** Table, `openRows`, for the Lore skills the
  character names: its Total is `attributes.INT + prof(Rank)`, reading the
  sheet-wide name directly because Lore is always Intelligence — so an open
  row, which carries no per-row `values`, computes anyway. *(The first draft
  put `openRows` on Skills itself; an added Lore row then had no `attribute`
  and read "?" forever, which the player check would fail on the first Lore.)*
  A **Senses** Rich text ends the band in a stretcher.
- **Right column: a tab set.** **Combat**: an **AC** card deriving `10 +
  min(attributes.DEX, armor.cap) + <Proficiencies>.<worn armor row> +
  armor.bonus + mod.self` — the Dex cap is `min`, the proficiency is read from
  the Proficiencies table by row, the item bonus from the Armor card set, and
  `mod.self` is where the conditions land; a **Strikes** Table, open rows,
  columns Attack (number), Damage, Traits, Notes (secondary) — stored rather
  than computed, as the 5e attacks table is, because a strike's attribute and
  proficiency category vary per row (flagged below); and the **Conditions**
  Table if it is not in the middle column. **Actions**: an open Table of
  actions and activities with a `level` column for action cost (Free, One, Two,
  Three, Reaction) and notes. **Spells**: **Spell attack** and **Spell DC**
  cards deriving `key + prof(<Spellcasting row>)` and `10 + key +
  prof(<Spellcasting row>)`; a **Focus points** Pool (character owns the max,
  1–3) bound `full` to **Daily preparations**; a **Spell slots** Track with
  rows for ranks 1–10 whose `count`s are formulas over `level` on the
  full-caster progression — rank *R* opens at level 2R−1 with two slots and
  grows to three at level 2R, rank 10 has one slot from level 19 — with a
  comment saying so, bound `empty` to Daily preparations; a **Spells** Record
  set (recordName Spell, fields Rank number, Prepared toggle) — empty by
  construction. **Equipment**: a **Coin** Card set (CP, SP, GP, PP — no
  electrum); **Bulk carried**, **Encumbered at** (`5 + attributes.STR`) and
  **Maximum bulk** (`10 + attributes.STR`) cards; an **Invested** card reading
  the inventory's invested total against the limit of ten; and the
  **Inventory** Table, open rows, columns Qty (number, min 0), Bulk (number,
  `total: true` — a light item is `0.1`, which the number column accepts),
  Worn (toggle), Invested (toggle, `total: true`), Modifiers (modifier), Notes
  (secondary).
- **A second full-width tab set below.** **Feats and features**: a Record set
  (recordName Feat, fields Level number, Type as a `level` column — Ancestry,
  Class, Skill, General — and Modifiers) — empty by construction.
  **Description**, **Notes**: Rich text blocks as the 5e sheet has them.

**Conditions and the modifier machinery — this is where PF2e's rule and the
engine's are the same sentence.** PF2e types every bonus and penalty as
**item**, **status** or **circumstance**, and within a type only the best bonus
and the worst penalty apply; untyped penalties all stack. That is
`formula/modifiers.ts`'s rule verbatim, and SPEC §5 already cites Pathfinder 2e
as its source — so this starter is not adapting the engine to a system, it is
showing the engine on the system it was modelled on. The **Conditions** Table
has `openRows`, a **Value** number column (Frightened 2, Clumsy 1), an
**Active** toggle and a **Modifiers** column, with `modifierTypes: [Item,
Status, Circumstance]` and **six definitions**, all targeting the AC card:

- **Off-Guard** — `-2`, Circumstance, `when: Active`. (The Remaster's name for
  flat-footed.)
- **Raise a Shield** — `+2`, Circumstance, `when: Active`. Beside Off-Guard it
  shows *best bonus plus worst penalty of one type both apply*.
- **Frightened** — `-Value`, Status, `when: Active`: a valued condition reads
  its own Value column, so Frightened 2 is −2, which is the system's rule and
  the reason the column exists. The amount is evaluated in the enrolling row's
  scope, the same scope `when` reads.
- **Fatigued** — `-1`, Status, `when: Active` (unvalued in the system). Beside
  Frightened it shows *two penalties of one type do not stack*: only the worst
  applies and the breakdown says why the other was suppressed.
- **Armor potency rune** — `+1`, Item, `when: Worn`, enrolled from the
  inventory's Modifiers column rather than the conditions table — the
  Studded-leather shape.
- **Clumsy** — `-Value`, Status, `when: Active`. A third status penalty, so
  the suppression is visibly a rule and not a coincidence of two.

That is six names — five conditions and one rune — and they are the whole of
what this sheet ships near §11's line: a name, a target, an amount, a type and
a condition, with no rules text. The guard on the 5e list applies here
unchanged. Penalties are negative amounts, which the engine reads as penalties
(`formula/modifiers.ts` names them so in the breakdown).

**Triggers.** Two: **Daily preparations** (resets focus points `full` and spell
slots `empty`) and **New session** (resets hero points by `formula` to `1`,
which is the rule — a session starts with one). Hit points are bound to
neither, because a PF2e night's rest restores level × Constitution, not
everything, and a `formula` binding for that would be the one place this sheet
did the player's arithmetic for them without being asked.

**Resolved by the owner before build — the things this specification was
unsure of, each decided in a line so nobody re-derives them.** The numbering is
the original list's, kept so the reasoning above still points at the right
item.

1. **Remaster.** Attributes are stored modifiers, no alignment, Off-Guard.
   Legacy is not built.
2. **AC's armour proficiency term is a typed rank the character owns**, not a
   Proficiencies-table row picked at authoring time: which armour category a
   character wears is the character's fact. Built as an **Armor rank** Card
   with the five ranks as options, beside the Armor card set's item bonus and
   Dex cap — a Card rather than a card-set entry because a rank is a choice
   from a closed list, and a dropdown is what the sheet already uses for one.
   `ac` reads `prof(armor_rank)`. The Proficiencies table keeps its armour rows
   as the record of what the character is trained in; AC simply does not read
   them.
3. **Strikes are stored, not computed**, mirroring the 5e attacks table.
4. **The six conditions target AC alone.** The function library carries the
   comment stating Frightened's real scope — every check and DC — and that a
   fuller Frightened is one more definition per target.
5. **Spell slots follow the full-caster table**, with the library comment
   saying so and naming the one-line-per-row change for a bounded caster.
6. **Max HP is character-owned**, as on the 5e sheet.
7. **Hero points reset to 1 by a `formula` action with a literal `to`.**
   Verified rather than assumed: `reset-flow.test.ts` already drives
   `{ action: 'formula', to: '1' }`, and `starters/index.test.ts` pins this
   binding's exact shape and that `parseTriggers` reports nothing.
8. **Passport fields: ancestry, heritage, background, class, deity, level.**
   Size dropped.
9. **The name stays "Starter PF2e."**

**Three interpretations the build made beyond the list**, recorded here because
they are what a PF2e player will check first. An **Initiative** card reads
`saves.perception`, since Perception is the system's default initiative and the
5e Combat tab's initiative-beside-AC row is the arrangement precedent; the
Conditions table sits **in the Combat tab beside the AC card** it changes, which
the panel list allows and which puts the toggle and the number it moves on one
screen; and each of the Combat, Actions and Equipment tabs gained a **Rich text
at its last rows** — `combat_notes`, `action_notes` ("Exploration and downtime")
and `equipment_notes` — which the band-balancing note below explains and which
is the one change here made for the arrangement rather than for the system.

*A fourth interpretation was recorded here and is now spent, so it is kept as
the record rather than deleted:* the **Lore** rows were first added to the
Skills table itself under `openRows`, which left them with no `values.attribute`
and a Total reading "?" forever — reported rather than worked around, on the
ground that the alternative (declared `Lore` rows the reader cannot name) was a
trade the owner had not been asked to make. **Both the design and the patterns
axis reached the same fix independently**, so it was taken: Lore is a table of
its own whose column formula names `attributes.INT` directly, because Lore is
always Intelligence. An open row carries no per-row values and computes anyway —
verified rather than assumed, and pinned (`starters/index.test.ts`, "computes a
Lore row the character named"): a trained Lore reads **+9** and an untrained one
**+2** on the fixture.

#### What all three share

**Band balancing, on the two twelve-column sheets.** Container inner-grid rows
are content-sized with the declared height as a **min-height floor** (commit
7337051), and a **Table grows past its floor rather than scrolling**, so a
declared height promises a minimum and not a total. `docs/UI.md` §12 carries
the row that measured this — a band stays balanced only where it ends in a
component that stretches (Rich text, Image, Record set, Passport) — and **that
row's subject moves to the 5e starter**, which is a change to make in that
file rather than this one. The PF2e sheet is built under the same rule: each of
its three bands ends in a stretcher or in the tab set, never in a bare table.

**And "or in the tab set" turned out to be half a rule**, found by measuring the
built sheet rather than by reading it. Cold at 1300px the two Rich-text bands
reached 1332 of 1333 and the tab set's content reached **1042** — a 291px void —
because three of its four tabs ended in a table. `tab-set.ts` keeps **every
panel laid out**, so a band's content extent is its *tallest* panel's rather
than its visible one's, and a tab set whose tabs all end short leaves the void
at the band's foot. The refinement, now in `docs/UI.md` §12 with its numbers:
**a tab set is a sound foot only if a stretcher stands at the foot of its
tabs.** Combat, Actions and Equipment each gained one, and the band closes to
1362 of 1363.

**And that is necessary without being sufficient**, which is the clause worth
carrying: §12 recurses one level down, so a panel's height is its own tallest
group and a group does not stretch to a panel a *sibling tab* made taller.
Measured by shortening the Actions floor and growing that table — every tab
still ending in a stretcher — the stage lifts to 1766 while three tabs stay at
1362, a **404px void under three at once**. That is also why stretching the
Spells Record set to its own foot made things worse: it made one panel taller
than its siblings. The Actions table's ten-row floor is therefore a **trade**
rather than an oversight — it buys absorption of ordinary growth at the price
of a cold gap on one non-default tab — and `docs/UI.md` §12 records both halves
with their numbers so a later reader can revisit it.

**The cold sheet, and which starters show it.** SPEC §5 has a name the sheet
does not publish fail to resolve rather than default to zero, so a derived
value with no data beneath it reads "?" — the honest answer before there is
data, structural rather than a defect, and the subject of `docs/UI.md` §12's
cold-start row. The three starters exhibit it very differently, and the
difference is worth having in the set:

- **5e** is derived almost everywhere, so a fresh character reads "?" across
  armour class, proficiency, every skill total and both save columns. **Level
  is the keystone**: typing it into the passport clears proficiency and
  everything that reads it, and the six ability scores clear the rest.
- **PF2e** is derived as widely and clears from somewhere else entirely, which
  is worth having in the set. *This entry first said "the same, with the same
  keystone"; that was wrong in mechanism and in count, and the truth is the
  better story.* **Level alone clears nothing**: `prof(rank) = if(rank > 0,
  level + 2 * rank, 0)` and `if` is **lazy**, so on a cold sheet every rank is
  untrained, the true branch is never evaluated, and `level` is never read —
  which is also why the Proficiencies column reads `+0` cold where the rest of
  the sheet reads "?". **The attribute strip is the keystone**, and it takes the
  cards drawing "?" from seven to one in a single typing. The one left is
  **Armor class**, which wants the Armor card set's `cap` and `bonus` and the
  Armor rank card — and only *then* `passport.level`, since a chosen rank is the
  first thing on the sheet greater than zero and `prof` reads level for the
  first time. So level is this sheet's **last** stone, not its first, wanted by
  exactly one card. One strip and no level is more teachable than 5e's
  strip-plus-level, and it is the keystone a player of the system fills first
  anyway.
- **Forged in the Dark barely shows it at all**: it has no function library,
  and its only derived values are `count` and `total` aggregates, which are 0
  over empty rows by the aggregate branch's own rule ("a new character's
  sheet must not be full of '?'"). A fresh scoundrel reads three zeros and no
  "?" at all: the one card that publishes nothing is load, whose derived reads
  its own unchosen option, and a derived that reads its own empty value draws an
  em dash rather than a failure.

The open question underneath — whether a derived sheet owes a reader better
than "?" — is the backlog's; two of the three starters raise its stakes without
changing its answer, and the third is the counter-example.

## Config fields

None. No component is added or changed; the feature registers a command.

| Key | Kind | Label | Description |
| --- | --- | --- | --- |

## Data and file model

- **Sources:** three canonical-form JSON layout files under `src/starters/`,
  inlined into `main.js` by esbuild's built-in json loader. `tsconfig.json`
  gains `resolveJsonModule: true`.
- **Install writes** `serialiseLayout(parseLayout(...))` of the source through
  `createLayout`, at `<layoutFolder>/<layout.name>.json`, creating the folder
  when missing and refusing a duplicate name.
- **Round-trip:** each source is pinned byte-identical under
  parse-then-serialise by a test, so the tree's bytes are the vault's bytes and
  a schema drift fails the build rather than shipping a stale example.
- **Character notes:** never read, never written. An installed starter is an
  ordinary layout file the user owns; plugin updates never touch it.
- **Bundle cost, stated because two of the three are large:** the Forged in the
  Dark source is ~7.5KB pretty and ~4.7KB minified; the 5e source ~23.5KB
  pretty and ~14KB minified; the PF2e source will be of the 5e sheet's order.
  Call it **~35KB of inlined data in the production `main.js`**, against a
  bundle in the low hundreds of KB. That is the price of replicating whole
  rather than trimming, paid knowingly: it is data rather than code, it is
  inert until the command runs, and the alternative — a fourth release artifact
  read from the plugin folder — is the shape the Model question already refused
  for reasons that have not changed. Should the bundle ever need reducing, the
  lever is the *format* (the sources are pretty-printed for reviewability),
  never the *content*.

## Acceptance criteria

- [x] A test parses each file under `src/starters/` with `parseLayout` and
      asserts `serialiseLayout(parseLayout(text)) === text`.
- [x] A test asserts each starter's `name` matches its catalog entry and its
      source filename maps to it, so the installed filename and the name inside
      the file agree.
- [x] A worked-examples-style test renders each starter against an empty
      character through the real registry and asserts no component shows an
      error state: no section fails to read, and nothing draws
      `.sheetsmith-error`. A render is what asks this, because a configuration
      error is drawn into the component's own container and reaches no formula.
- [x] Against a note holding the values its arithmetic reads, every name each
      starter publishes resolves — a substantial note fixture for 5e and PF2e,
      where almost every number is derived, and a small one for Forged in the
      Dark. **Deliberately a second criterion rather than a clause of the
      first**, because the two cannot be asked together: on an empty character
      every derived field is *correctly* null, and "no value yet" fails in the
      same *Unknown name* shape a genuine typo does, so nothing at that point
      can separate a working layout from a broken one. Asked through the
      published names rather than by resolving each component's formula
      fields, since a Card set's `derived` and a Table's column formula run per
      scope and return null with no scope even when the sheet is perfect.
- [x] A test asserts the Forged in the Dark sheet **resolves cold where it
      can**: on an empty character its three rating cards publish 0, not null,
      and the items total is 0 — the counter-example to the other two, pinned
      so it stays one. The same test pins the load card at null cold, with the
      reason: its derived reads the card's own option, and an unchosen option
      publishes nothing. *(As first written this criterion said the load card
      publishes 0; that was wrong, the layout is a pinned replica and cannot
      change, and the criterion now says what the test proves.)*
- [x] A test asserts the 5e and PF2e modifier definitions reports
      (`parse/modifier-definitions.ts`) are empty — all five and all six
      definitions are usable, which is the check that their targets still name
      values the layout publishes.
- [x] A worked-examples-style test pins the PF2e sheet's typed stacking on its
      own conditions, because the sheet's claim is that the engine's rule and
      the system's are one sentence: Off-Guard and Raise a Shield both active
      move AC by **0** (best circumstance bonus +2 and worst circumstance
      penalty −2 both apply); Frightened 1 and Fatigued both active move it by
      **−1**, not −2, and the breakdown lists the suppressed one saying why;
      Frightened **2** and Fatigued move it by **−2**, the worst of the type
      rather than the sum, because a valued condition reads its own Value;
      the potency rune, Worn, adds +1 on top of either. Written out as numbers
      so the plausible misreading — "penalties stack" — sends nobody to
      "correct" a correct test.
- [x] A test asserts the 5e and PF2e sheets' architecture from their positions
      alone, so the claim is mechanical rather than a look: three column bands
      of unequal width whose stacks terminate on the same grid row
      (`max(row + height)` equal across the three), with a full-width tab set
      below them.
- [x] A test asserts the 5e and PF2e sheets each hold two tab sets, every tab a
      container, with nesting inside the two-deep cap `parseLayout` enforces;
      and that the Forged in the Dark sheet holds none — it is the one-screen
      one, and a tab set appearing on it would mean the replica drifted.
- [x] **No trademark travels.** A test asserts that no starter source, no
      catalog entry's name or description, and no starter filename contains
      any of "dungeons", "dragons", "d&d", "dnd", "wizards of the coast",
      "blades in the dark", "one seven design", "pathfinder" or "paizo",
      compared case-insensitively. The two reference layouts' own `name` keys
      are the single occurrences in each, so this is the check that neither
      came along, and for the built sheet it is the only guard there is. **The
      marks each starter left behind**, for the record: Forged in the Dark
      left `Blades in the Dark`; 5e left `DnD`; PF2e never carried one.
- [x] A test asserts each replica is faithful to its reference in the one way
      a test in this repository can ask it — structure, not content: component
      count (21 and 54), ids, types and positions are pinned, so a later edit
      that quietly drops a tab or reflows a band fails rather than passing as a
      "simplification". **Pinned against a snapshot in the test rather than
      against the vault files**, which sit outside the repository (PATTERNS §2)
      and cannot be read from one.
- [x] A test asserts the PF2e sheet's completeness **against the system's own
      rosters, by name**: the sixteen skills, the four saves-and-perception rows
      and the ten proficiency rows are pinned as literal labels, not counted.
      *(As first written this criterion said "by count, since it has no
      reference to pin against"; the premise was wrong. There is no lived-in
      layout to diff against, but the system's roster is a reference, and it is
      the one the sheet is answerable to — swap Arcana for Alchemy and every
      count still agrees while the sheet stops being one a player can hold
      against their own.)* Counted, because there is no roster to name: six
      attribute entries, ten spell-slot rows, six modifier definitions, three
      bonus types, two triggers, and the named panels present by id. The Skills
      table is **fully declared with no open rows**, and the Lore skills a
      character names are a separate `openRows` table beneath it whose column
      formula reads `attributes.INT` directly — a test computes one, since an
      open row carrying no per-row values is the thing that had to be verified.
- [x] **Add a starter layout** appears in the command palette
      unconditionally, and the suggester lists all three starters in offer
      order — Forged in the Dark, 5e, PF2e — each with its description
      visible and each description naming its system.
- [x] Choosing a starter with no layout folder in the vault creates the folder
      and the file; the file's bytes equal the bundled source (stub-vault test).
- [x] Choosing a starter whose name the folder already holds shows
      `createLayout`'s refusal in a notice and writes nothing (stub-vault
      test).
- [x] `npm run build` succeeds and the production `main.js` contains all three
      starter names (the bundle actually carries them).
- [x] `npm test` and `npm run lint` pass; all user-facing strings are sentence
      case.
- [ ] Manual, in the throwaway vault: with an empty layout folder, run the
      command, install all three, open a new note naming each starter in
      `sheet-layout`, and all three render with no error boxes; the Forged in
      the Dark sheet reads in under a minute and shows three zeros rather than
      question marks — the load card included, which reads as an option nobody
      has chosen yet and not as a value that failed.
- [ ] Manual, looking at each replica **beside its reference open in the test
      vault** (UI.md §11 — appearance is reviewed by looking): the two are
      indistinguishable except for the name. For the two twelve-column sheets:
      at full pane width the three columns end together with no column
      trailing a band of empty grid; switching tabs in either tab set moves
      nothing anywhere else on the sheet; and on a narrow pane the whole sheet
      reflows to one column in grid reading order with both strips intact.
- [ ] Manual, the PF2e sheet checked by someone who plays it, against a real
      character: level, attributes and ranks typed in, every skill total, both
      save totals, Perception, AC and Class DC match the character's own sheet.
      **This is the criterion the other two get for free by being replicas**,
      and the built sheet has to earn it.
- [ ] Manual: fresh characters on the 5e and PF2e layouts are *full* of "?"
      and that is accepted, not filed — but looked at once, deliberately,
      because these are the widest instances of the cold-start state
      `docs/UI.md` §12 records, and the ruling there should be taken with
      these screens in front of whoever takes it.

## Commit boundaries

One `feat:` per starter, then the command, then the docs. **Every subject line
avoids every mark** — commit subjects are published with the repository, and
the naming rule above applies to them as it does to a filename.

1. `feat: Bundle a Forged in the Dark starter layout`. `src/starters/
   forged-in-the-dark.json`, `src/starters/index.ts` with its catalog entry,
   `resolveJsonModule` in `tsconfig.json`, the shared per-source tests
   (round-trip, name agreement, renders clean, publishes resolve, trademark
   scan) and its own (resolves cold, no tab set, the 21-component replica
   pin), and this spec. First because it is the smallest and carries the
   catalog module and the build change the other two need.
2. `feat: Bundle a complete 5e starter layout`. `src/starters/5e.json`, its
   catalog entry, and its own tests (balanced bands, two tab sets, the
   54-component replica pin, usable definitions).
3. `feat: Bundle a PF2e starter layout`. `src/starters/pf2e.json`, its catalog
   entry, and its own tests (balanced bands, two tab sets, the completeness
   counts, usable definitions, the typed-stacking numbers).
4. `feat: Add a starter layout from the command palette`. `createLayout`'s
   optional `layout` parameter, `src/starters/picker.ts`, the command in
   `src/commands.ts`, and the install-flow tests (folder creation, duplicate
   refusal, byte equality, offer order).
5. `docs: Record starter layouts in the spec`. The `docs/SPEC.md` sentence in
   §3.2 (bundled starters exist and how they travel), the §7 manage-layouts
   line, and the §11 clarification that a system-shaped layout is not the
   content that section rules out — written by `/land-it` as usual. The
   `docs/UI.md` §12 subject change (atlas → 5e) rides here too.

## Deliberately not doing

- **The new-character-from-a-layout command** and the missing-layout picker
  (SPEC §8) — a separate feature; the manual criterion above types
  `sheet-layout` by hand and that is fine.
- **Layout import and export** (validated drop into the folder) — separate
  feature; the starters piggyback on nothing from it.
- **Opening the layout editor (or a new character) after install** — the
  notice says where the file went and the user decides what happens next;
  chaining surfaces is scope the handoff did not grant.
- **Auto-installing on first run.** The plugin writes nothing the user did not
  ask for; cold start is solved by one visible command, not a silent write.
- **A settings-tab entry point.** §7 keeps settings at two preferences and a
  button, deliberately.
- **Updating installed copies when the plugin updates.** The installed file is
  the user's; new plugin versions change only the bundled sources.
- **Designing triggers the sources do not have.** *Amended twice: this entry
  read "reset triggers in any starter", then "in the journal or the
  grimoire", and with three real systems it changes shape again.* Every
  starter now carries triggers — Forged in the Dark's Downtime, 5e's two rests,
  PF2e's Daily preparations and New session — because a real system has them
  and a replica or a faithful build keeps what the system has. What is still
  not done is inventing one: 5e's hit points do not gain a binding the
  reference lacks, and PF2e's hit points are bound to nothing because the
  system's rest is not a full restore. Triggers are demonstrated by the
  systems' own rules, not by design.
- **A template library — as a browsable surface, and as growth by request.**
  *Amended a third time, and honestly this time.* This entry first refused
  "more than two starters", then said "a second system sheet would be the
  fourth this rule refuses" — and the owner then asked for exactly that, and
  the answer was right to give. So the refusal was mis-aimed, and the record
  says so rather than pretending the line was always here. **Three system
  sheets is a small curated set**, and this entry now states the bar an entry
  has to clear rather than a count it may not exceed. **The bar governs
  additions, not the three already here** — stated explicitly because otherwise
  it retroactively indicts the set's own third member: the Orr Group report
  measures *Roll20* usage, Forged in the Dark will not place top five in it, and
  a reader applying the bar backwards would conclude the compact starter does
  not belong. It does, on grounds the bar was never meant to measure: it is the
  **one-screen counter-example** the set is partly for, the sheet that resolves
  cold where the other two are full of "?"; its license is the most permissive
  of the three; and it is a **lived-in replica** rather than a build. Worth
  naming while we are here: one virtual tabletop's telemetry is a *proxy* for
  share of play, not share of play itself, and it under-counts exactly the
  systems whose play is least software-mediated. The bar for a fourth: **a real,
  widely played system** — measured, not asserted: it appears in the **top five**
  by share of play in the most recent public tabletop survey the set is judged
  against (Orr Group's yearly Roll20 report is the standing one, being large,
  public and repeated), and the spec records which survey and which edition of
  it; **an open rules license**
  (CC-BY, ORC or equivalent) so the licensing paragraph above holds for it;
  **a trademark-free generic name available** for it, of at least "PF2e"'s
  strength; the sheet **replicated from a lived-in vault layout or built
  faithfully to a written specification and reviewed like the other three**,
  including the played-by-someone-who-plays-it criterion; and **a bundle
  ceiling**, because the set would become a bundle problem before it became a
  library one — no single source over **25KB** pretty-printed (the 5e sheet,
  the largest a real system has needed, is 23.5KB) and the inlined set as a
  whole under **60KB**, which is under a quarter of the bundle today. A
  candidate that clears every other bar and breaks the ceiling is a format
  question first (minify the sources) and a content question never. What is still
  refused: **content databases** (§11 — the guard on the modifier lists is
  where a starter would first cross that line); **sheets for systems without
  an open license or without a generic name**, however played; **growth by
  request rather than by play-share**, because "my table's system" is the
  request that turns a curated set into a library; and **a browsable library
  surface** — a gallery, previews, categories — which is a different feature
  with a different bar and a maintenance burden this one does not take on. The
  two-line suggester is the whole of the surface, and it holds a handful.
- **Multi-page layouts** — untouched.
