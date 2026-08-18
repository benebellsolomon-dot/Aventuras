# Lucy's Milk → Aventuras import bundle

Generated 2026-07-16 from the NovelAI export (`../Lucy's Milk (2026-07-15T01_56_55.952Z).story`)
by `ambrosia-st/scripts/nai-story-to-st-import.mjs`. Background: ambrosia-st
`research/30-aventuras-evaluation.md` §7.

**Updated 2026-07-16**: added `lucy.card.import.v2.json` and `lucy.visual_descriptors.json`,
engineered specifically for how Aventuras's importer actually reads a card. See "Appearance
fields" below before importing.

## Files

| file | what | import via |
|---|---|---|
| `lucy.card.import.v2.json` | **Use this one.** Same card as below, with `description` restructured so Aventuras's LLM importer reliably extracts visual descriptors, and the bust size updated to the current story-canon state (38X / gigantic, up from the starting DD). See "Appearance fields". | Character vault → import card, **or** ST Import Wizard |
| `lucy.card.import.json` | Original chara_card_v2 (engine extensions stripped; 3-entry character book kept: Species, Growth Catalyst, Cottage & Dairy). Kept for reference / diffing against v2. | superseded by v2 above |
| `lucy.visual_descriptors.json` | The ideal final `visual_descriptors` for Lucy, hand-built against Aventuras's actual schema. Paste the `_paste_into_editor` string into the character editor's "Visual Descriptors" field after import — see "Appearance fields". | manual paste, post-import |
| `lucy-s-milk.worldinfo.json` | 23-entry lorebook in ST World Info format — full story canon (Ben/Lucy/Lyra, the bio-alchemy systems, locations, narrative vectors) + the four `BE:` genre rules flagged `constant` (always-inject). Two NAI-tooling entries were deliberately dropped. | Lorebook import (SillyTavern format) |
| `lucy-s-milk.chat.jsonl` | The full story prose as an ST chat: 102 user turns + 499 narration, in order. Classified by NAI origin-spans (human-typed → user turn); a handful of model-echoed inputs read as narration — cosmetic. | Story → SillyTavern Import Wizard |

## Import order (in Aventuras)

1. **Card first**: import `lucy.card.import.v2.json` into the character vault (the LLM-assisted
   importer maps description/personality/book) — **or** run it through the ST Import Wizard if
   you're starting the story fresh from this card. Either path works; see "Appearance fields" for
   why the *vault* path gets you closer to a correct portrait with less manual cleanup.
2. **Lorebook**: import `lucy-s-milk.worldinfo.json` (ST World Info). Verify the four `BE:`
   entries kept their always-on/constant status after import.
3. **Story**: run the ST Import Wizard with `lucy-s-milk.chat.jsonl` → upload → characters
   (Lucy; player name Ben) → attach the imported lorebook → style → review. The chapter
   system will summarize the backlog on its own schedule.
4. **Story settings** for the imported story: Image Generation Mode = `agentic` (or `inline`),
   Background Images on if wanted, Reference Mode only if the reference profile has a valid
   key. Images route per the profile slots (inline/portraits → the image bridge).
5. **Appearance check (do this — see below)**: open World → Characters → Lucy → Edit and verify
   the Visual Descriptors field is populated. It probably won't be after step 3 alone.
6. **Optional, recommended for the BE test**: define runtime variables on `character`
   (e.g. `cup_tier` number 0–60 default 6, `fullness` 0–100) before playing, so the classifier
   starts tracking them from the first new turn — this is the §10.2 smoke test from research/30.

Zaria: `ambrosia-st/st-content/characters/zaria.card.json` imports the same way when wanted
(strip extensions similarly, or import as-is — the importer ignores unknown extensions).

## Appearance fields

**What the importer actually reads.** Aventuras has two separate card-import paths, and they
read different fields:

- **`character-card-import`** (used by the Story/Scenario Import Wizard, `CharacterCardImport.clean()`)
  extracts a scenario + a list of NPCs (`name`, `role`, `description`, `personality`,
  `relationship`). **It has no `visualDescriptors` field at all.**
- **`vault-character-import`** (used by Character Vault → Import, `CharacterCardImport.sanitize()`)
  extracts `name`, `description`, `traits`, and `visualDescriptors` — this is the only importer
  path that produces structured appearance data.

Both paths build their LLM context from the same four fields only — **`description`,
`personality`, `scenario`, and `mes_example`** (`src/lib/services/characterCardImport/aiService.ts`,
`buildCardContext`). **`character_book`, `extensions`, `creator_notes`, and `tags` are parsed out
of the card but never shown to either importer LLM.** That's why v2's character_book entries
(Species / Growth Catalyst / Cottage & Dairy) are kept — they're still useful as an imported
*lorebook* — but nothing appearance-related was left only there; it's all in `description` now.

**The gap you'll hit: the Story Import Wizard silently drops visual descriptors.** The unified
ST Import Wizard (`stImportWizard.svelte.ts`) actually runs *both* `clean()` and `sanitize()` in
parallel when you process a card, so it does correctly extract Lucy's `visualDescriptors` into
wizard state (`cardSanitized`). But when it builds the actual character that gets attached to the
new story, it only copies `name`/`description`/`role`/`relationship`/`traits` from the sanitized
result — `visualDescriptors` is never carried over (`processedCharacters` in that same file). This
isn't hypothetical: there is already a "Lucy" story in the live app from an earlier import, and its
Lucy character has `visual_descriptors: {}` — empty — confirming this gap in practice.

**What this means for you:**

1. **Guaranteed step, do it regardless of which import path you use:** after the story exists,
   go to **World → Characters → Lucy → Edit**, and paste the `_paste_into_editor` string from
   `lucy.visual_descriptors.json` into the **Visual Descriptors** field, then Save. This field is
   a single text box parsed by `Face:`/`Hair:`/`Eyes:`/`Build:`/`Clothing:`/`Accessories:`/
   `Distinguishing:` labels (`src/lib/utils/visualDescriptors.ts`) — the string in the JSON file is
   verified to round-trip through that exact parser, so it will land in the right fields. Do the
   same in the Character Vault editor if you also import there (same field, same format).
2. **Optional first pass:** importing `lucy.card.import.v2.json` via **Character Vault → Import**
   (rather than only the Story Wizard) does correctly populate `visualDescriptors` on the vault
   copy, since that path uses `sanitize()` directly and writes its result straight to the vault
   row. It's a reasonable way to get an AI first draft you then correct with step 1 above — but
   don't rely on "copy vault character to story" as a substitute for step 1 on the *existing*
   Lucy story character; that wiring wasn't traced closely enough here to promise it lines up
   with a character the chat/lorebook already reference by name. Treat the manual paste as the
   one guaranteed path.
3. **After that**, generate her portrait (Character panel → Generate Portrait, or the
   `generate_portrait` tool in the vault assistant) so the visual descriptors actually get used —
   portrait generation fails silently-informatively ("no visual descriptors defined") if the field
   is empty.

**Schema note:** `visual_descriptors` is a **7-key object** (`face`, `hair`, `eyes`, `build`,
`clothing`, `accessories`, `distinguishing` — `src/lib/types/index.ts`), not a flat string array.
An old flat-array format existed once (`["Face: ...", "Hair: ..."]`) and is still read for backward
compatibility (`migrateVisualDescriptors` in `src/lib/services/database.ts`), but nothing writes
that shape anymore. `lucy.visual_descriptors.json` is shaped as the real object, plus a
`_paste_into_editor` convenience string and a `_note` field — both are extras for a human, not
part of the app's schema.

**Bust size is canon, not a placeholder.** Per the explicit instruction to read current bust state
from the story lorebook: `lucy-s-milk.worldinfo.json`'s `Lucy [SE: Characters]` entry states
`Bust: 38X` / "a colossal bust that rests heavily against her torso." v2's description and the
visual descriptors both use that figure (translated to the booru-band phrase **"gigantic breasts,
hyper breasts"**), framed as the payoff of the card's existing three-month growth arc (started at
DD). That lorebook entry is otherwise a heavily-drifted continuation (age 28, different
personality, different waist/hip figures) — only the bust size was pulled from it; everything else
uses the original wholesome-card personality, per the request to keep personality/scenario/
first_mes/mes_example intact.

**Hair and eyes — flagging a discrepancy.** Both canon sources (the original card and the story
lorebook) agree: **honey-blonde hair, warm brown eyes.** Neither says white hair or blue eyes.
v2 and the visual descriptors use the canon colors. If a white-hair/blue-eyes redesign was
actually intended, that's a deliberate change to make by hand in the editor, not something the
canon files support.

**Image backend note.** Portrait/scene prompts are plain natural-language text assembled from
`visual_descriptors` (`image-portrait-generation` template, `{{ visualDescriptors }}`) — the
descriptors here are short, concrete phrases (booru-band vocabulary for bust size: large / huge /
gigantic / hyper breasts) rather than long prose, since that reads cleanly either as tag-soup or as
prose fragments. Don't add Danbooru weight syntax like `(huge breasts:1.3)`, artist tags, or
quality-stack tags (`masterpiece, absurdres, ...`) to `visual_descriptors` — that belongs in the
*style* template if anywhere, not per-character appearance. Worth a separate check: the DB still
has an "Illustrious (SI Bridge)" style template built entirely out of that weighted Danbooru
syntax; if that's the active style profile for your image settings, confirm it's still the right
one for whatever backend is actually configured.

**Maintaining bust size as the story progresses.** Aventuras's classifier (`newCharacterSchema` /
`characterUpdateSchema` in `src/lib/services/ai/sdk/schemas/classifier.ts`) can update a
character's `visualDescriptors` turn-to-turn, including "invent plausible details if not
explicitly described" — so once growth resumes in play, the classifier is *capable* of nudging the
`distinguishing` field's breast-size phrase forward. It won't be as precise or consistent as a
real tracked variable, though. A `cup_tier` runtime variable (step 6 above) is the planned way to
track size numerically; keep it and the `distinguishing` text in sync by hand until (or unless) a
tighter coupling between runtime variables and visual descriptors exists.

Regenerate the base bundle any time:
```
cd ~/Projects/code/ambrosia-st
node scripts/nai-story-to-st-import.mjs "<path to .story>" <outDir>
```
