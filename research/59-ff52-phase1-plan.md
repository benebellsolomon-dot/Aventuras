# 59 — FF5.2 port, Phase 1 implementation plan (prose + settings package)

**Date:** 2026-08-20 · **Parent:** research/58 (brainstorm + Ben's D1–D4 rulings)
**Scope:** Bucket P only. Engine phases (E1 unified relationships → E3+E4 → E2) get their own plan docs when reached; E1's harem-bond migration (Ben's "unify" ruling) is explicitly NOT in this phase.

## Rulings this plan enacts

- D1: FF Cinematic Realism package becomes the default prose voice; Story Mode (lyrical) selectable via new `proseStyle` setting.
- D4: FF Realism vocabulary/delivery layer into the `explicit` content rating; new `nsfwFlavor` setting (`scene` default | `always`).
- From §2 Bucket P: hybrid POV, response-length setting, NPC voice/knowledge/inner-life/bold-NPC/anti-echo/genesis template enrichment, banned-word merge. Scene-header chip + weather deferred to a later mini-phase (UI work, separable). Combat/onomatopoeia toggles deferred (garnish; custom-variable mechanism question open). Colored dialogue deferred to reader work.

## Design constraints

- **No new template IDs; no template renames.** All story-template edits ride the default-pack hash refresh (pack-service `refreshDefaultPackTemplates`). Custom packs keep user-edited STORY templates — acceptable; bundled packs re-seed from baseline on creation.
- **Cache stability:** every new prompt variable is a per-story constant (settings-derived), same class as `pov`/`contentGuidelines`. Nothing per-turn enters the system prompt.
- **Graceful fallbacks:** `pov === 'hybrid'` must degrade to second-person in any template that branches on pov without a hybrid arm (Liquid `else` branches already land there — verified in both story templates; audit the other consumers in step 4).
- **Baseline register:** FF's ALL-CAPS pleading gets normalized to the templates' existing instruction register; content ported, shouting mostly not (the existing templates already use caps sparingly for critical rules — match that).

## Steps

### 1. Types + settings surface
`src/lib/types/index.ts`
- `POV` type: add `'hybrid'` (`'first' | 'second' | 'third' | 'hybrid'`).
- `StorySettings`: add
  - `proseStyle?: 'cinematic' | 'literary'` — default cinematic
  - `responseLength?: 'short' | 'medium' | 'long'` — default medium
  - `nsfwFlavor?: 'scene' | 'always'` — default scene; only meaningful when contentRating ≠ standard

### 2. ContextBuilder plumbing
`src/lib/services/context/context-builder.ts` (`forStory` settings block)
- expose `proseStyle` (default `'cinematic'`) and `responseLengthGuidance` (mapped: short → "Around 150 words", medium → "Around 250 words", long → "400–600 words across 4–8 paragraphs" — medium preserves today's text so unset settings render byte-identical prompts where possible).

### 3. Content guidelines
`src/lib/services/ai/generation/contentGuidelines.ts`
- `getContentGuidelines(rating, nsfwFlavor?)`.
- `EXPLICIT_GUIDELINES` gains the FF Realism delivery layer (adapted register): direct-slang vocabulary requirement + clinical-term avoidance, anatomy individuality, sensory channel emphasis (sound/smell/friction), in-persona vocalization through intimacy, slow-burn pacing note, "NPCs pursue desire without permission-seeking when in character".
- New `ALWAYS_ON_ADDENDUM` appended when `nsfwFlavor === 'always'` && rating !== 'standard': sensual character description woven into every scene (FF Freaky's always-on lens, minus its repetition bug — reuse our anti-repeat rule).
- NarrativeService call site passes the new setting.

### 4. POV: hybrid arm + fallback audit
- `narrative.ts` `adventure` template: hybrid branches in `<style_instruction>` and `<response_instruction>` — 3rd-person limited narration; everything the protagonist physically FEELS in 2nd person (FF's example ported).
- `NarrativeService.buildAdventurePriming` (+ creative-writing guard): hybrid arm; creative-writing mode treats hybrid as third (UI will not offer it there).
- Audit every other `pov` consumer (`grep -rn "pov" src/lib/services`) — confirm all Liquid/TS branches have safe else-arms; fix any that would break.

### 5. Template package — `adventure`
`src/lib/services/prompts/templates/narrative.ts`. Section by section:
- **Style Requirements**: replace the current 6 bullet lines with the FF cinematic package gated on `proseStyle`:
  - *cinematic* (default): observable-only narration; no stated emotions/thoughts in narrative (dialogue exempt); fluid legato paragraphs, varied openings; bans — apophasis, litotes, reification, verbless fragments, em-dash fragmentation, anaphora, >2-clause conjunction chaining, of-genitive periphrasis, micro-expressions (pupils/knuckles/breath), clinical anatomy terms; emotions via visible macro-action; with the FF good/bad examples (they carry most of the teaching value).
  - *literary*: FF Story Mode — lyrical/atmospheric, high pathos, character-focused pacing, same structural bans (apophasis/litotes/fragmentation), descriptive economy ("a cushion is a cushion").
- **Player Agency**: append anti-echo rules — never quote/paraphrase the player's input; NPCs react to meaning, not phrasing; respond to 1–2 key elements, not point-by-point; FF's name-echo example.
- **Dungeon Master Principles**: append bold-NPC package — no plot armor; NPCs pursue goals independent of player desire; full action commitment (no hovering hands, with example); never soften into yes-men; NPCs call out player falsehoods; plus the plot-momentum line: "Before writing, consider three distinct directions the scene's NPCs could take from their current emotional state; write the most interesting one."
- **New section: Knowledge & Perception** (after Relationship & Knowledge Dynamics, which it extends): characters see ~120° forward; walls/doors muffle sound realistically; no identifying events by scent; no mind-reading player thoughts; unwitnessed events are unknown without evidence or being told (anti-bridging); reconstructing the past needs evidence + expertise, not intuition.
- **New section: NPC Inner Life** (static VAD + instincts): VAD axes warp delivery while persona stays fixed (FF's four examples); instinct list compressed to one line each; instincts trigger impulsive physical action before conscious thought; never name these terms in prose.
- **Dialogue Guidelines**: merge FF NPC-voice — target spoken dialogue at roughly 30–50% of the response when NPCs are present and engaged; per-NPC fixed dialect/register from origin/class/age (diction friction, anti-smoothing); orthographic emotional delivery (caps for yelling, stutters under fear — sparingly); non-lexical vocalizations by species (humans never make animal sounds); break monologues with action beats; no tricolons in speech; NPCs don't make a big deal of ordinary player statements; earned aggression only. Keep existing subtext/interruption/status lines (they're compatible and good).
- **New-NPC genesis** (inside DM Principles or its own short section): when inventing an NPC — culturally fitting non-generic name (banned: Elara/Seraphina/Lily/Kael/etc — merge with creative-writing's existing list); define a physical flaw + distinct accent/vocabulary; introduce via top-to-bottom sweep woven into movement, never a stat-list.
- **Prohibited Patterns**: merge FF banned-word list into the existing line (dedup): spine (metaphorical), ozone, husky, guttural, throaty, predatory, velvet, vise, slick, musk, calloused, "barely above a whisper", "breath hitching/catching", "pupils blown wide/dilated", "shivers down spine", "jaw clenched/working", "nails biting", "a beat", "fresh meat", "structural integrity". Add: no repeating sensory details established in the last few responses unless something physically changed (FF's habituation rule — complements styleGuidance).
- **Format**: `Around 250 words` → `{{ responseLengthGuidance }}`; keep crystallizing-moment + pregnant-pause lines.

### 6. Template package — `creative-writing`
Lighter merge (author-directed mode): Style Requirements gain the same `proseStyle` gate (cinematic default; its current voice is already close to literary — FF Story Mode content folds into the literary arm); Prohibited Patterns + Overused Phrases gain the merged ban/word lists; Dialogue Guidelines gain diction-friction/orthographic-delivery/tricolon lines; Format gains `responseLengthGuidance`. No anti-echo/agency changes (different contract), no hybrid POV.

### 7. Settings UI
`src/lib/components/settings/tabs/story-settings.svelte`: selects for Prose Style, Response Length, NSFW Flavor (visible when rating ≠ standard), and Hybrid added to the POV options (adventure mode only). Follow the existing control patterns in that file.

### 8. Tests + verification
- `contentGuidelines.test.ts`: rating × flavor matrix (standard ignores flavor; explicit+always contains the addendum; scene doesn't).
- Template render tests (follow existing render/spec patterns near the template engine): adventure renders under `{pov: hybrid, proseStyle: cinematic|literary, responseLength: short|long}` — assert branch content present, no Liquid errors, and unset-settings render contains "Around 250 words" (back-compat guard).
- POV fallback: hybrid through creative-writing template renders the third-person arm (or documented else-arm) without error.
- Full gate: `npm run check` + `npx eslint .` + `npm test`.

### 9. Rollout notes
- Default pack: hash refresh propagates on next app start automatically.
- Story templates in custom packs: intentionally untouched (user edits win). Release note should say custom-pack users can re-seed a bundled pack or hand-merge.
- No `SERVICE_TEMPLATE_SYNC_VERSION` bump — this phase touches STORY templates + code only.

## Later phases (pointers)

- **Phase 2 (E1):** unified BOND/Sparks/Grudge relationship engine — includes the harem-bond 0–100 → −5..+20 scale migration (gating.ts thresholds 45/70 remapped, tracks.ts, velocity caps, Harem UI), classifier interaction-event extension, reducer cadence math, `[RELATIONSHIPS]` block, DC modifiers. Own plan doc + adversarial review per code-review baseline.
- **Phase 3 (E3+E4):** seeded world-event tables + off-screen NPC agendas.
- **Phase 4 (E2):** Chekhov's Gun narrative-debt engine (dedup vs story beats/thread tracking first).
- **Mini-phases, order-free:** scene-header UI chip + engine weather field; combat/onomatopoeia toggles; UI-side colored dialogue.
