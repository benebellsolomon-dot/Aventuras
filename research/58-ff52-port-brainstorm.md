# 58 — Freaky Frankenstein 5.2 → Aventuras port brainstorm

**Date:** 2026-08-20 · **Status:** research + brainstorm, decisions pending
**Sources:** `FF5.2 Internal States MAX setup (1).json` (full preset, 59 blocks, dumped and read in full), the current-state codebase map (this session), research/46–57, memory note `nsfw-preset-research` (2026-08-17 conceptual survey of FF5.x).

FF5.2 ("Freaky Frankenstein 5.2 Internal States MAX") is the SillyTavern community's consensus-best roleplay preset. Ben's directive: port as much as we can into Aventuras, adapting the BE/RPG engine to its systems where possible.

---

## 1. What FF5.2 actually is

Three layers, very different port strategies:

1. **~20 static prose/behavior modules** — toggleable system-prompt blocks: GM role framing, world physics, prose style, POV, NPC voice/knowledge/emotion rules, anti-slop bans, NSFW modes. Pure prompt craft. **Portable nearly verbatim as template content.**
2. **"Internal States"** — the headline feature: BOND/Sparks/Grudge relationships, locked-DC d20 task sim, off-screen NPC agendas, Chekhov's Gun foreshadowing engine, d20 world-event tables, GM's Notebook, NPC thoughts. All *faked in-context*: the LLM re-emits a hidden HTML `<details>` block every turn as its own memory, and SillyTavern macros (`{{roll::1d20}}`, `{{setvar}}`) supply dice and variables. **Must be adapted, not ported** — Aventuras has real state.
3. **Three CoT scaffolds** (MAX nested gates / BOLT / Micro) — walk the model through gamestate → NPC knowledge → emotion → dialogue → state updates → lint before writing. **Mostly superseded** by Aventuras' service-call decomposition; a few ideas worth extracting.

### The core translation principle

FF5.2 is an in-context emulation of an engine Aventuras already has. Every ST trick has a strictly better Aventuras home:

| ST mechanism | FF5.2 uses it for | Aventuras equivalent (already built) |
|---|---|---|
| `{{roll::1d20}}` client macro | dice for DnD sim / world sim / Chekhov | `seededRoll` (be/roll.ts), replay-stable seed contract |
| Hidden HTML state block re-emitted per turn | all Internal States persistence | `character.metadata.*` / story state + single-writer reducers + rendered prompt blocks |
| LLM self-reports state updates in CoT | BOND math, agenda ticks, bullet aging | classifier structured-output extensions + deterministic reducer (`applyClassificationResult`) |
| "Locked DC in scratchpad before roll" | anti-positivity-bias | resolve-then-narrate CheckPhase — DC locked by risk-assess/choice-tag *before* narration even starts |
| Depth-0 user-role injection | keep rules hot near generation | `postHistoryInstructions` + the always-last `[CHECK RESULT]` block |
| Prompt-order stability for cache hits | 50–90% cache reuse | same concern already ruled on (research/51 W1 cache-order audit) |

research/57's meta-lesson governs the whole port: **deterministic composition beats template pleading**. Where FF5.2 pleads with the model to do math, we compute; where FF5.2 has genuinely great *prompt language* (prose bans, NPC behavior, dialogue voice), we take the language.

---

## 2. Subsystem-by-subsystem mapping

### Bucket P — prompt-craft ports (template/settings work, service-sync rollout)

**P1. Cinematic Realism prose rules** *(FF default; the single most community-validated block)*
Bans: apophasis ("she didn't flinch"), litotes, reification ("the forest breathed"), em-dash fragmentation, verbless fragments, anaphora, conjunction chaining >2 clauses, of-genitive overuse, stated emotions, micro-expressions (pupils/knuckles/breath-hitching), clinical anatomy terms. Requires: observable-only narration, fluid legato paragraphs, varied openings, emotions via macro-actions.
→ Port into the `adventure`/`creative-writing` templates' Style Requirements + Prohibited Patterns sections. **Story Mode** (lyrical variant) becomes the alternative under a new `proseStyle` story setting (`cinematic` | `literary`), defaulting to cinematic. Complements (does not replace) the dynamic `style-reviewer`/`styleGuidance` pass.

**P2. Banned word list** — the slop lexicon ("ministrations"-class words: spine, ozone, husky, predatory, barely above a whisper, …).
→ Pack **custom variable** (textarea, editable per pack/story) rendered into Prohibited Patterns; ship FF5.2's list as default. Note research/57: blacklists lose to phrasing variance — this is a cheap prompt nudge, not a guarantee; keep expectations calibrated.

**P3. Hybrid POV** *(FF's popularized default: 3rd-person narration, but everything the player physically feels rendered in 2nd person)*
→ Add `hybrid` to the existing `pov` setting; new branch in both story templates + priming. Very cheap, high immersion payoff, and fits BE stories (sensation-heavy) unusually well.

**P4. NPC Voice + dialogue** — dialogue ratio target (30–50% of response when NPCs present), per-NPC fixed dialect/register ("diction friction", anti-smoothing), orthographic emotion (caps/stutters), non-lexical vocalizations, action-beat interruption of monologues, tricolon ban, and/or bans *in dialogue only*, no unearned aggression, NPCs vocalize through intimacy.
→ Enrich the Dialogue Guidelines section wholesale. This is FF5.2's second-highest-value block.

**P5. Anti-omniscient NPCs + world physics** — 120° vision cones, sound muffled by walls, no scent-forensics, no mind-reading, evidence-required reconstruction, anti-bridging (scene B never knows scene A).
→ Enrich Relationship & Knowledge Dynamics section. Pure win; no engine dependency (though the classifier's `presentCharacterNames` gives us *ground truth* FF never had — the block can reference the scene roster).

**P6. VAD emotions + instincts** — Valence/Arousal/Dominance axes warping delivery ("high-dom anger = cold authority; low-dom anger = cracking panic") + 8 subconscious instincts triggering impulsive action before conscious thought.
→ Phase 1: static instruction block (as FF does it). Phase 2 option: BE already tracks per-character `attitude`/`arousal` via `beStates` — extending to a VAD triple for all named NPCs and rendering "current VAD" per present character would give the block teeth FF can't have. Defer the engine half until the static block proves itself.

**P7. Realistic/bold NPCs** — no plot armor, independent goals, full action commitment (no "hovering hands"), never soften into yes-men, call out player lies, may lie/confront/refuse.
→ Merge into the main template role section; synergizes with the existing mature/explicit negativity-bias framing in `contentGuidelines`. Portions apply at *all* ratings (bold-NPC ≠ NSFW).

**P8. Anti-parrot/anti-echo** — never quote/paraphrase the player's input back; react to meaning, not phrasing; respond to 1–2 key elements, not point-by-point.
→ New sub-block near the response instructions. (FF's alternate "Embellish Mode" — AI stylizes the player's own actions — conflicts with Aventuras' `[ACTION]` contract; skip for now, note as future setting.)

**P9. Scene header (time/place/weather)** — FF makes the LLM emit `[ 🕰️ … | 📍 … | 🌤️ … ]` and *self-advance time*.
→ Aventuras owns `storyTime` + `currentLocation` in engine state — rendering the header is a **UI concern, not a prompt concern**. Recommend: deterministic header chip above each narration in the reader (zero tokens, zero drift). Weather is the one genuinely new field: add to story state, let the classifier extract/advance it. Skip LLM-emitted headers entirely.

**P10. Response length setting** — FF: 4–8 paragraphs / 400–600 words toggle.
→ Promote the currently-hardcoded "Around 250 words" guidance to a `responseLength` story setting (short/medium/long → word-range text). Mind cache stability: the setting changes the system prompt, which is fine (per-story constant), unlike per-turn variance.

**P11. NSFW modes** — Realism (scene-triggered) and Freaky (always-on lewd description); clinical-term bans with required-slang tables; NPCs stay in persona during intimacy; slow-burn pacing; sensory emphasis (sounds/smells/friction).
→ Aventuras' `explicit` contentGuidelines already carries the *structural* framing (neutral narrator, agency, no moralizing — adopted from this preset family in the earlier research round). What's missing is FF's **vocabulary + delivery layer**: the slang-required/clinical-banned tables, anatomy-detail instructions, vocalization-through-intimacy. Port that into `explicit`. Additionally offer FF's *Freaky* distinction as a toggle: `nsfwFlavor: scene-triggered | always-on` — always-on ("describe characters lewdly in every scene") is extremely on-brand for BE stories. **Skip all three jailbreak blocks** (Icebreaker "handicapped trans adult" ploy, professional-legality framing, post-history jailbreak) — they're API-evasion hacks for corporate endpoints; Aventuras runs user-chosen/uncensored models and doesn't need or want them.

**P12. NPC genesis** — 5-name generation picking the 5th, banned generic names (Elara/Seraphina/Lily), ethnicity→accent/vocab linkage, physical-flaw requirement, top-to-bottom intro sweep woven into movement.
→ Split: intro-sweep + genesis rules into the adventure template (fires when narration invents someone); naming/attribute rules also into the wizard's supporting-characters template and the classifier's new-entity extraction.

**P13. Garnish toggles** — combat spectacle physics, onomatopoeia, colored dialogue, pop-in GFX (inline HTML props: phones/signs/terminals), X-feed.
→ Combat + onomatopoeia: cheap optional template toggles (custom variables or settings), take as-is. Colored dialogue: do it **UI-side deterministically** (speaker-keyed palette at render time; Aventuras controls the reader) — never ask the LLM to emit font tags. Pop-in GFX: genuinely fun; Aventuras already has `visualProseMode` (whole-response HTML) — a *scoped* variant ("when the character reads/views a medium, render just that artifact as styled HTML") is a nice middle mode; needs sanitized rendering. X-feed: skip (token-expensive novelty; could be a later UI gimmick computed off-narrative).

### Bucket E — Internal States → engine systems

**E1. Relationships (BOND/Sparks/Grudge) — the crown jewel.**
FF's design: BOND (−5..+20) *cannot be raised directly* — only earned via Sparks (affection counter, +1/interaction, cap +2/turn) converting periodically (every 5 turns: ≥7 sparks → +1 BOND); Grudges accumulate from slights, halve positive gains at ≥3, convert to BOND loss at ≥5, decay otherwise; tier table maps BOND to concrete behaviors; **physical-intimacy gates** (+4 hug / +8 hand-holding / +14 kiss / +18 full intimacy); BOND modulates VAD baseline and **modifies check DCs** (±2/±4).
→ This slots almost 1:1 onto existing machinery: `bondEvents` (warm/strain + intensity) classifier extraction already exists for harem tracks; the reducer already runs ordered per-turn steps with velocity caps; CheckService already accepts sign-inverted `targetCharacter` modifiers. Adaptation: generalize to **all named NPCs** (not just harem girls) as engine-owned per-relationship state `{bond, sparks, grudge}` keyed on character pairs (player↔NPC first; NPC↔NPC later), updated by a deterministic reducer from classifier-extracted interaction events, with conversion cadence driven by real turn counters. Render a `[RELATIONSHIPS]` block (tier + gate language, numbers hidden from prose per FF's own rule) and feed DC modifiers into CheckService. Open design point: relationship to the existing BE `bond` harem track (0–100?) — unify, or keep harem-bond for BE mechanics and add social-BOND alongside (see Decision D2).

**E2. Chekhov's Gun (narrative-debt engine) — the most novel system; nothing like it exists in Aventuras.**
FF's design: "Bullets" = unresolved setups/promises/foreshadowed details, with weight 1–3, age, locks (time/character/state/dependency); age each turn; fire when a seeded d20 beats an effective threshold (base by weight, −1/age, proximity bonuses if the subject NPC/location/mood is on-scene, urgency near deadlines); pruned at age 12; fired bullets become narrative directives.
→ Aventuras version: story-level `bullets` store; **loading** via a classifier extension array (`narrativeDebt`: description, weight, subject entities, optional time lock) — the classifier already reads every narration; **aging/firing** fully deterministic engine-side using the turn seed + classifier presence/location for proximity mods; a fired bullet renders a one-turn directive block ("weave this back in naturally; if no elegant opening exists, it re-loads") near generation. Overlaps to reconcile: memory-system story beats and PostGenerationPhase thread tracking partially cover "open threads" — dedup so we don't run three thread trackers.

**E3. World Sim (random events).**
FF: seeded d20 against two event tables (Standard ≥3 NPCs / Duo ≤2), events like ENTER_CHECK (off-screen NPC arrives), GOSSIP_SURGE, MOOD_SWING, MUNDANE_INTERRUPTION; suppressed during NSFW scenes.
→ Trivially engine-side: real seeded roll per turn, tables as code constants (pack-overridable later), table selection from classifier NPC counts, rendered as a small directive ("this turn, a background event: …"). Suppression during acts: the booru writer already extracts `actInProgress` — reuse or accept FF's simpler "skip if NSFW active" via BE arousal state. A `worldSimFrequency` setting (off/sparse/lively) maps to a roll gate. Pairs with E4.

**E4. Off-screen NPC agendas.**
FF: every named NPC gets `{goal, step/max, location}`; off-screen NPCs tick +1/turn; completion effects (travel→location change, research→plant Chekhov seed, reconcile→bond shift…); on-screen entry behavior varies by agenda state.
→ Engine: agenda state per character (metadata), deterministic ticking for characters *not* in `presentCharacterNames`, completion effects wired into E1 (bond shifts) and E2 (seed planting). Agenda *assignment* is the only LLM-needing part: a small structured call (or classifier extension) proposing a goal when an NPC first appears/leaves scene. Render an `[OFF-SCREEN]` line-per-NPC block so returns/intercepts feel alive. This gives Aventuras the "world keeps moving without you" feel that makes FF worlds breathe.

**E5. GM's Notebook.**
FF: capped 20-entry hidden scratchpad ([R]eminders / [T]hreads / [D]ebug) the model re-reads each turn.
→ Aventuras already has: story beats, thread tracking, chapter summaries, drift `[CONTINUITY]` notes. The genuinely missing piece is a *small, always-hot, engine-persisted* "GM notes" list distinct from long-term memory — e.g. "Stacy doesn't know about the eclipse protocol." Options: (a) classifier extension maintaining add/remove ops on a capped notes list, rendered near generation; (b) fold into E2 (a note is a weight-0 non-firing bullet); (c) skip — existing memory covers it. Leaning (a) small, but this is the weakest-differentiated system; fine to defer.

**E6. NPC internal thoughts (player-visible flavor).**
FF: up to 3 NPCs' raw internal monologue lines shown per turn.
→ Philosophy conflict: Aventuras deliberately avoids LLM-emitted inline state. Options: (a) small side call post-narration (costs a call/turn); (b) allow one structured `<thoughts>` tag stripped from prose like `<pic>` (precedent exists) and shown in a UI panel; (c) skip. It's flavor, not mechanics — recommend (b) as a cheap optional toggle *if* wanted, else skip in v1.

**E7. Titles/feats as check modifiers.**
FF: earned titles ("Charmer", "Slayer") grant ±1..2 domain-locked roll mods; inventory items likewise.
→ Aventuras has sheet skills/spells and item entities but no *earned-title* modifier channel. Port: classifier detects accomplishment → title awarded (idempotency-keyed like milestones) → stored on sheet → CheckService modifier when domain-relevant (risk-assess/choice-tagger names the applicable title) → `[PLAYER SHEET]` line. Nice-to-have; Phase 3+.

**E8. NPC-side dice.**
FF rolls a d20 for NPC skilled actions too. Aventuras checks are player-action-only today. Opposed/NPC rolls are a real design question (who tags NPC actions? pre-narration nothing knows what NPCs will attempt). Defer — note as future CheckPhase evolution (e.g. narrative-time NPC checks resolved next turn, or GM-choice tagging).

**E9. Debug engine.** FF's OOC command set for state manipulation. Aventuras has real editor panels (sheet/harem/world). Skip; where gaps exist (set bond, force roll), extend the panels, not the prompt.

### Bucket C — CoT scaffolds

Aventuras already decomposes FF's gates into *actual separate calls* (risk-assess = DC gate; classifier = state-update gate; style-reviewer = lint gate) — structurally superior, keep. Worth extracting from the scaffolds:

- **"Plot momentum"** (Gate 6G / Task 9): *"brainstorm 3 distinct NPC responses from VAD/instincts, pick the most interesting"* — a one-line creativity instruction portable into the narrative template (models with native reasoning will actually do it; others harmlessly ignore).
- **"Never draft in reasoning — bullet-ideas only, then write"** — worth adding to the template *only when* the narrative profile targets a reasoning model (Ben's stack sometimes does); prevents the double-drafting slowdown FF users see on thinking models.
- The full nested-gates protocol: **skip** (token-expensive, and our service calls already enforce what it polices).

---

## 3. What we're explicitly NOT porting

- **All three jailbreaks** (Icebreaker, professional-legality, post-history jailbreak) — evasion hacks, unneeded, off-brand.
- **ST plumbing**: prompt_order, regex companion scripts, `{{setvar}}` macro state, group-chat nudges, impersonation prompt.
- **Auto image gen block** — Aventuras' image pipeline (identity banks, booru writer, dialect layer) is generations ahead.
- **Embellish Mode** (conflicts with `[ACTION]` contract), **X-feed** (novelty), **Debug Engine** (superseded by UI).
- **LLM-emitted scene headers and colored-font dialogue** — engine/UI owns these.

---

## 4. Phasing approaches

**Approach A — Prose first, then engines (recommended).**
Phase 1 ships the entire Bucket P package (template enrichment + `proseStyle`/`hybrid` POV/`responseLength`/NSFW-vocab settings). Immediate, visible quality jump on every story, ~zero regression risk (template + settings only, service-sync rollout), and it's the layer the community actually rates FF on. Phases 2+ then do E1 (relationships), E3+E4 (world liveliness), E2 (Chekhov), E5–E7 as appetite allows — each an isolated engine system with its own classifier extension + reducer + block, following the established BE playbook (schema ext → reducer step → prompt block → UI panel → playtest).
*Trade-off:* engine wow-features arrive later.

**Approach B — Crown-jewel first.** Build E1 relationships (and its DC coupling) before prose. Biggest *structural* differentiator vs. every other IF app; but higher-risk first step, and prose slop remains meanwhile.

**Approach C — One vertical slice.** Minimal prose pass + E1 + E3 in one push. Fastest to "feels like FF5.2", but couples three workstreams and violates the one-system-per-phase discipline that's been working (research/47–51).

Recommendation: **A**, with Phase 2 = E1 starting immediately after Phase 1 playtests clean. Every E-system lands behind its own setting toggle, off→on rollout like beMode.

---

## 5. Decisions (RULED by Ben, 2026-08-20)

- **D1 — Prose default: ✅ Replace as default.** The FF cinematic package replaces the current Style Requirements/Prohibited Patterns for all stories; Story Mode (lyrical) becomes the alternative under a new `proseStyle` setting.
- **D2 — Relationship engine scope: ✅ UNIFY into one track.** Migrate the BE harem `bond` track onto the new −5..+20 BOND scale so there is exactly one relationship number, with Sparks/Grudge as its accumulators. Ben chose this over the lower-risk separate-track option knowingly — the implementation plan must include a careful migration of the shipped reducer math, gating tables, velocity caps, and any UI reading the old scale, with the adversarial fix-diff review the code-review baseline mandates for persistence changes.
- **D3 — Engine order: ✅ E1 → E3+E4 → E2.** Relationships first, then world-liveliness (random events + off-screen agendas), then Chekhov's Gun. E7 (titles) later; E5 (GM notebook) and E6 (NPC thoughts) deferred.
- **D4 — NSFW: ✅ Both.** Realism vocabulary/delivery rules into the `explicit` rating, plus an `nsfwFlavor` (scene-triggered | always-on) setting.

Also implicit (low-stakes, will default sensibly): weather field on story state (yes, classifier-extracted); scene-header UI chip (yes); combat/onomatopoeia as pack custom-variable toggles (yes); colored dialogue UI-side (deferred until reader work).
