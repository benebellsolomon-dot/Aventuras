# 34 — Brainstorm output: improving Aventuras for BE stories

**Date:** 2026-07-17 · **Status:** BRAINSTORM OUTPUT — **agent proposals, NOTHING RULED.** Every
"recommend" below is a proposal for Ben; the five decision questions are at §6. Produced from the
research/33 brief in an autonomous session (Ben not at the keyboard), so items needing live play or
his hands are queued, not done.
**Inputs:** 33 (the brief) · 30/31/31a/31b/32 (all re-read) · fresh fork+upstream git recon
(`Projects/gaming/Aventuras`, `git fetch upstream` 2026-07-17) · two fork greps (delta UI absence,
marker call sites). **Ben has NOT annotated research/31 as of this session** (file untouched since
2026-07-16 22:17) — D2/D4/D5/D7 remain recommended defaults, and the engine track stays gated.

---

## 0. Headlines

1. **Upstream has abandoned the Tauri/Svelte codebase.** `AventurasTeam/Aventuras` `main` is a
   from-scratch **Expo + Electron rewrite** — 826 commits, **zero shared git history** with v0.7.6
   (oldest commit: "initialize Expo + Electron foundation"), currently at "M2 — first user loop"
   (pre-alpha). The old Tauri line lives on `upstream/master`: **2 commits since v0.7.6**, dormant
   since 2026-06-16. Consequences ripple through every fork decision — see §1.
2. **Recommended arc for the next 2–3 sessions:** ① play-first (Lucy playtest + live probes) →
   ② author the BE pack (pure data, no code) → ③ a PC bridge day (identity route + hyper-ceiling
   bake-off). The engine track runs in parallel on its own gate (Ben's research/31 read).
3. **"Done enough to just play" arrives after session ②, not after the engine.** The engine is a
   mid-flight upgrade to a running campaign (bodyState seeds from the card whenever Phase A lands);
   prose + lorebook canon + markers carry size until then — exactly how the imported 601-message
   story already works. Play early; the campaign itself generates the cadence data D5 needs.

---

## 1. Fork strategy (F15/F16 — rewritten by the recon)

**The finding.** Upstream's rewrite means Ben's fork is the **de-facto permanent line** for the
Tauri app. There will never be another upstream release of this codebase to rebase onto (their next
release will be a different app; the updater re-point to the fork's URL — done in `961d6e19` — is
retroactively load-bearing, or stock users' apps will one day self-update into the rewrite).

- **F16 rebase cadence → moot.** Nothing to rebase onto. One actionable: **cherry-pick
  `4c2a7481`** (the sole real upstream fix since v0.7.6 — lorebook keyword substring/CJK matching
  in `EntryRetrievalService.ts`, 27 lines). Directly relevant: BE keyword-triggered lore rules
  depend on match precision. Five-minute task, next fork session.
- **Design constraint relaxed.** research/31 §1's "minimize core-file touch points to keep
  upstream rebases sane" no longer binds. Modularity (`be/` module, single apply-site call) stays
  as good engineering, but the engine and the UX items below may touch `story.svelte.ts`,
  templates, and panels freely — no rebase tax, ever.
- **F15 upstream PRs → deprioritize.** The parser/wizard fixes would land on a dead branch; no
  rebase-cost payoff remains. Optional goodwill: file them as *issues* with patch links for other
  0.7.6 users (the app has real users until the rewrite ships). Not worth a session.
- **Watch the rewrite casually.** Expo = eventual mobile; if it matures into a better platform in
  a year+, that's a NAI→ST→Aventuras-style *era* decision, and 31a (the portable spec) exists
  precisely to survive it. No action now.
- **New housekeeping items surfaced:** (a) *push the fork?* — 8 local commits exist only on this
  Mac; the re-pointed updater 404s until a release exists at the fork URL. Ben-gated. (b) *DB
  backup habit* — the entire campaign canon lives in one un-versioned SQLite file
  (`aventura.db`); quit-window `.bak`s exist only from edit sessions. Worth a periodic copy
  (even manual) given a 601-message campaign is irreplaceable.

## 2. Image track (B1–B5, + one new item)

### B1. Identity consistency — the strategic fork in the road

Root cause (32 §1.4): the app reaches the bridge only through the **txt2img-only A1111 shim** —
every frame is independent; nothing conditions on the character's look. Four candidate routes:

| Route | App cost | Bridge cost | Verdict |
|---|---|---|---|
| (a) Extend A1111 shim with `init_images[]` → `krea2_image_img2img.json`; fork's a1111 provider sends portrait | small patch | small patch | Works, but raw img2img bleeds the *portrait's pose/composition* into scene frames; a stopgap that still can't reach edit/reference/video |
| (b) **Native `POST /image` provider in the fork** (a 10th entry in `providers/registry.ts`) | 1–2 sessions | none (exists) | **Recommended.** Unlocks the whole surface at once: `init_image_b64` (img2img), `krea_edit` instruct-edit ("same character, new scene" — the best identity tool krea has), future `/animate/growth`, `StructuredImageSpec`, real auth. Now that the fork is the permanent line, building the proper provider beats shim contortions |
| (c) Per-character seed bank | trivial | none | No: same seed + different prompt ≠ same character. Not an identity mechanism |
| (d) OpenAI-images-shaped shim on the bridge; re-point Reference Mode's `referenceProfileId` at it | zero | medium | Clever (reuses the app's existing reference path) but builds a *second* compat dialect to avoid one provider file — inferior to (b) for the same effort |

**What anchors identity: portraits.** First-class in the app, user-curatable, already the app's own
reference-conditioning concept (migration 012), and versionable per tier (B5). Seed bank no; the
old FaceID path only returns if the Illustrious route wins B2 (it lives there).
**Prereq for (b):** native `/image` requires `X-API-Key`, which lives only on the PC — either copy
the key to the Mac (one minute, next time at the PC) or extend `BRIDGE_COMPAT_ALLOW_NOAUTH` to
`/image` for tailnet. PC-day item either way.
**Interim:** keep Nano Banana for reference-mode scenes — it works today; don't block play on B1.

### B2. The hyper-scale ceiling — pure bridge-side; the app contract is already stable

The app's job is done: it emits `__betier_<N>__`; preset routing is bridge policy, so **nothing app-
side changes whichever path wins.** Bake-off order (cheapest first), all PC-day work:
1. **Rebal sweep** (30 min): threshold < 30, higher multiplier, per-layer weights — 32 §6 notes the
   weights were never swept. Might buy a fraction of a notch; establishes the true krea ceiling.
2. **Illustrious tier-LoRA route** (exists, proven in the research/29-era ladder renders): route
   tier ≥ N through the SDXL pipeline with `Breast_Size_Slider` + hyper LoRAs. Real *continuous*
   size control — which is what D1's **unbounded scalar** ultimately needs (krea nouns saturate;
   31a §10 says a slider must take over past vocabulary saturation). Cost: style break vs the
   Nikki-anime krea look. Mitigation worth testing: Illustrious render → `krea_edit` restyle pass.
3. **Krea BE-dial LoRA rework**: the `krea2_image_tier.json` slot is wired but the concept LoRAs
   were *already pulled once* for quality (smooth/balloon/broken anatomy). A training/curation
   research project, not a wiring task. Last resort.

### B3. Growth-sequence video — OUT of v1; designed sketch parked (§8)

The bridge's `POST /animate/growth` is real, but: the app has zero video surface; generation
latency (tens of seconds to minutes) breaks reading flow; `embedded_images` stores base64 in
SQLite and video blobs would bloat the DB (needs a file-path storage design); and the natural
trigger — a deterministic tier-up milestone — doesn't exist until the engine ships. **Proposal:
video stays out of the story feed for v1.** The right v2 shape is a **per-character growth reel**
(milestone-triggered clips collected in the character panel, watched on demand), which needs the
native provider (B1b) and reducer milestones (Phase A/B) anyway. Sequence it after both.

### B4. Backgrounds — 15-minute probe, low stakes

Unknown, cheaply testable: render 3–4 environment-only prompts through the shim (kitchen, dairy
barn, night exterior) at 1280×720 and eyeball whether the character-tuned krea graph (baked Nikki
LoRA) does clean empty scenes. If yes → switch `backgroundProfileId` to the bridge: free, style-
consistent, and failures become visible (the gemini path fails *silently* on a bad key — 30 §9).
If no → keep gemini; backgrounds are blurred backdrops, lowest stakes on the list. Fold the probe
into any live session.

### B5. Portrait lifecycle — portraits become load-bearing the moment B1 lands

Once portraits condition identity, a bad portrait silently corrupts every downstream frame — so
**auto-regenerate, but never auto-swap**: on tier/band change, *queue* a regen and swap on one-tap
accept (the 31a lesson-2 "commit at the moment of user commitment" pattern, applied to images).
Keep the superseded portrait as a **per-band version history** — that history *is* the growth reel
substrate (B3) and gives branches/checkpoints the right portrait for their era. Consider bumping
portraits past 512² once they feed conditioning. Cost: on Ben's own 4090, a portrait per tier-up
is negligible; cadence is bounded by growth cooldowns.

### B+. NEW — image provenance/observability (small, compounding payoff)

research/32 burned effort reconstructing "what actually reached the sampler," and 31a lesson 5 says
never debug drift blind. The fork should store, per `embedded_images` row: the **final sent
prompt** (post-marker), marker/tier value, profile id, and seed. The failed-row quirks (main
profile's model logged; Retry silently using the main profile) get honest labels in the same pass.
Makes every future accuracy A/B and "why does she look wrong" question a DB query. Half-session.

## 3. Prompt/pack track (C6–C8)

### C6. The BE preset pack — highest value-per-effort item on the board; do before the engine

**Proposed doctrine (answers Q4):** three layers, each owning what only it can own —
- **Pack = genre canon** (platform-level, reusable across Lucy/Zaria/Yue stories): the four
  constant `[BE]` rules' *content* moves INTO the cloned pack's `adventure`/`creative-writing`
  system-prompt bodies (always-inject lorebook ≈ unconditional context anyway — same effect, no
  per-story re-import); classifier guidance; lore-agent hardening ("trust structured state over
  narrative-scanning", 31a §7.2); the **magnitude/register discipline** in static form (31a §3.5:
  narrate growth at the delta's actual scale; top-register vocabulary reserved for genuinely
  top-of-range sizes) — the engine later upgrades this from static discipline to computed
  per-delta directives; image-prompt-analysis alignment (C7).
- **Story lorebook = story canon only** (Lucy's personal facts, relationships, discovered world).
  The imported constant `[BE]` entries retire once the pack carries the genre.
- **Fork templates = state exposure** (engine-owned, `{% if beMode %}`-gated, Phase A) — the pack
  never carries state plumbing.

**Scope adds while in there (all pure template edits):** BE guidance in the `actionChoices`
template so suggestion chips offer catalyst/growth-relevant moves (genre-forward choice
architecture, free); optionally a `styleReviewer` line enforcing the register discipline as
interval QA. **Why now:** zero code, improves the Lucy campaign *immediately*, and de-risks Phase
A (the engine then wires state into already-tuned language rather than authoring under pressure).

### C7. Agentic-mode alignment — one verified gap + one question for Ben

Verified this session: `ImageAnalysisService.ts` never calls `sizeBandMarker` (the marker wiring
covers `imageUtils`/`InlineImageTracker`/`InlineImageService` only) — so if the agentic analysis
path assembles prompts without passing an inline choke point, **agentic images render markerless**
(no rebal at high tier). Proposal: align the agentic template *text* during C6 (free), and verify
the marker choke point only if Ben actually uses agentic mode — **Ben: is agentic image mode in
your rotation, or is inline the only live path?** If unused, deprecate for BE stories in the pack
docs and skip the code work.

### C8. Runtime-variable smoke test — reframed as the Phase-A preflight probe

31b rejected the runtime-variables *system* as the bodyState carrier, so the test's original
purpose lapsed — but it now validates exactly what Phase A leans on: (1) the **Zod
schema-extension mechanism live** (a custom classifier field surviving extraction end-to-end —
Phase A's riskiest platform assumption), (2) whether values reach the next turn's context by
default (31b predicts NO — zero shipped templates reference `runtimeVars_characters`), (3) whether
the configured classifier model (grok-fast) extracts reliably enough for BE *events*. Needs the
app + a few live turns + Ben's API credits, so it was **not run autonomously**; queue it as a
10-minute throwaway-story preamble to the Lucy playtest (§5). Option: if it passes, keep a
`cup_tier` runtime variable as the *interim* panel-visible dial until bodyState replaces it.

## 4. Systems & UX (D9–D12)

### D9. Legible-RPG surface — two adds beyond the planned panel section; two rejects

- **Δ-chip on story entries** (recommended): `story_entries.world_state_delta` already stores the
  per-turn change record and **no component renders it today** (verified). A small expandable chip
  = the ST commit-diff panel (P0.4) reborn, zero new state, doubles as the engine's debug
  window and D11's viewer. Prereq: `stateTracking` ON — already ruled (D6).
- **Milestone markers in the feed** (recommended): growth beats rendered as chapter-divider-style
  rows ("🥛 Lucy: F → G", turn N) + jump-navigation between them. Makes arcs legible in the
  reading surface and gives D10's checkpoints visible anchors. Rides entry metadata → snapshots
  and branches correctly for free.
- **Toasts** — reject: transient = illegible history; the Δ-chip does it durably.
- **Stat sidebar** — reject: duplicates the panel one click away. (A compact present-cast strip is
  D12's version of this, gated on Phase C.)

### D10. Auto-checkpoint on growth milestones — yes; trivial once the reducer exists

One call at the reducer's milestone branch → the native checkpoint service, named
"Pre-growth: Lucy G→H (turn N)". Bounded by growth cooldowns so checkpoint spam can't happen;
retention = keep all (deep copies are text-scale). Per-story toggle beside `beMode`. Prereq D6
(ruled). This is the feature that makes growth arcs *safely explorable* with branches — cheap
insurance for the exact moments players most want to fork ("before the Peak scene").

### D11. Pacing instrumentation — ride `world_state_delta`; nearly free in Phase A

D5 demands measured cadence before re-deriving pressure constants. The reducer computes
everything worth logging at the single apply site; contribute `{character, eventKind, outcome,
delta, pressureAfter, tierAfter}` into the entry's existing `world_state_delta`. **Decisive
argument for that carrier over a separate log table:** deltas are rollback/branch-aware, so
retries and abandoned branches *don't pollute the cadence data* — an append-only side table would
double-count every retried turn (and a new table is a one-way door, 31b risk 3). A ~30-line script
then reads deltas → turns-between-attempts, success rate, per-character share; Phase B re-derives
constants from data instead of vibes. Pre-engine, the Lucy sessions provide a rough hand-noted
baseline (§5 checklist).

### D12. Harem/co-presence UX — sketches only; D2 gates the mechanics

Design principle from the ST era: co-presence drama = **differential treatment made visible**.
Sketches to hold until Phase C: a **present-cast strip** (the native lore state already tracks
`isPresent`) with tier badge + pressure glow per character — two glows colliding IS the jealousy
telegraph; a **harem tab** in the panel ranking by pressure/attention-debt. Build nothing now;
the one Phase-A obligation is keeping the panel's BE section **list-shaped** (per-character), not
singleton. Image-side co-presence: the one-character-per-image policy is a *pack template line*
(pack-editable when wanted); krea's prose-native encoder may handle two-character scenes better
than SDXL's tag soup did — test in play before building anything; bridge `inject_regional` exists
on the Illustrious path if krea can't.

## 5. Content & migration (E13–E14)

### E14. The Lucy playtest — the next Ben-present session, before any more building

The imported 601-message campaign on the marker build is the gating validation for everything
above. Checklist shape (~1 focused hour):
1. **C8 preamble** (throwaway story, 10 min): define a `cup_tier` runtime var, 2–3 turns with a
   growth beat, inspect `characters.metadata` + next-turn context. Closes 30 §10.2 at last.
2. Resume Lucy: **canon probes** in fiction (who is she, current size, relationship state) — does
   resumed canon hold at 38X/gigantic, honey-blonde, warm brown eyes?
3. **Chapter system on a 601-message backlog**: does summarization cope (cost, latency, quality)?
4. **Lore agent behavior**: does it start rewriting imported entries? (Per-entry blacklist is the
   mute if chatty.)
5. **Marker verification live**: trigger an inline scene; confirm the stored prompt carries
   `__betier_39__` and the render's size band responds (first real-story exercise of `a62ad46c`).
6. **B4 probe** (2 renders, optional): environment-only prompts through the shim.
7. **Pacing feel notes**: rough turns-per-growth-opportunity — the pre-engine D5 baseline.
Output: a short findings note appended here (or 35 if it sprawls); failures steer Phase A guards.

### E13. Zaria + the Yue setting pack — after the playtest, before Phase C

Right sequencing: her ST-era card is complete and the importer is proven, so the import is cheap
whenever — but one canon at a time until the Lucy loop is validated. Do it as part of/after the
C6 pack session (Yue's genre framing is the same pack; her visual descriptors need the same canon
pass Lucy got), and definitely before Phase C, where she's the co-presence test bed.

## 6. The brief's five questions — ★ BEN'S RULINGS (2026-07-17, via in-session Q&A)

1. **Priority: ENGINE-FIRST** (Ben overrode the play-first proposal). The research/31 gate was
   cleared the same session: D2 defer-to-Phase-C ruled · D5/D7 accepted · **D4 RE-OPENED** (body
   math serves prose too — bridge-only starves narration; a dedicated research task decides the
   in-app derivation depth) · **Phase A GO — build started this session.** Playtest/pack follow
   the engine core; the rest of §7's plan shifts right.
2. **Bridge-side items:** unruled this round (folds into the PC day whenever it comes) — B1 route
   enablement + B2 bake-off remain the queue as proposed.
3. **Video (B3): OUT for v1 — RULED** as recommended (growth-reel revisit post-provider+milestones).
4. **BE rules (C6) — REDIRECTED by Ben:** the four imported rules are NOT agnostic (confirmed —
   see the extraction below §6a): refine the pack layer to a story-agnostic genre core, and add a
   **per-story BE definition step at story creation** (wizard-collected: growth cosmology, POV,
   protagonist role, fluids, pacing flavor, ceiling posture → stored per-story, interpolated by
   pack templates). The `beMode` boolean grows into a small per-story BE config.
5. **"Done enough to just play": playtest + pack — RULED** as recommended (engine now lands
   before it by priority, so in practice: Phase A core → playtest doubles as the Phase-A
   acceptance fixture → pack → play).

### 6a. The four `[BE]` rules, extracted (Ben's question) — and why they must be refactored

From `_inbox/lucys-milk-migration/aventuras-import/lucy-s-milk.worldinfo.json` (all `constant`):
1. **Genre & Body Identity** — prose register (weight/physics/clothing as concrete reality),
   body-as-identity, dual sensory grounding, scale honesty. *Mostly agnostic craft.*
2. **Transformation Rendering** — the four-phase growth scaffold (anticipation → onset → peak →
   aftermath) + second-person POV layering. *Scaffold agnostic; POV is per-story.*
3. **Anti-Patterns & Conventions** — no understating, no physics violations, no generic language,
   no skipped growth, clothing doesn't resize, US sizing; **"UNAUTHORIZED GROWTH: never narrate
   growth unless a [JUDGE DIRECTIVE] authorizes it."** *Anti-patterns agnostic; the growth gate
   references NAI machinery.*
4. **Operational Doctrine** — "> You" text-adventure format, the Judge system, the 8-skill
   `<be-skill-profile>`, `<be-body-state>` as body authority, transformation attitude. *Almost
   entirely NAI/Lucy-specific.*

**The live incoherence:** rules 3/4 command obedience to `<be-body-state>` / `[JUDGE DIRECTIVE]` /
`<be-skill-profile>` blocks that **nothing on Aventuras emits** — strictly read, growth can never
be authorized in the imported story until the engine provides the equivalent. The refactor
decomposes into: **agnostic genre core** (register, scaffold, anti-patterns, sizing) → pack,
always-on for BE stories; **engine contract** (state authority + growth authorization language,
rewritten against `bodyState` + reducer events) → pack, engine-gated; **per-story definition**
(cosmology: catalyst/ambient/curse; spontaneous growth allowed?; POV/format; protagonist skills;
fluids; pacing; ceiling) → the story-creation step, feeding template variables. This slots into
Phase A's per-story toggle work (31 §2.3) — same wizard touch points, richer payload.

## 7. Proposed session plan (next 2–3 work sessions)

| Session | Mode | Contents |
|---|---|---|
| ① Play | Ben at keyboard (+agent) | E14 checklist incl. C8 preflight + B4 probe + marker verify; cherry-pick `4c2a7481` while warm; findings note |
| ② Author | agent-heavy, no code | C6 BE pack (genre block, classifier+lore-agent hardening, register discipline, actionChoices, C7 template text); E13 Zaria/Yue if time; retire per-story constant rules |
| ③ PC day | Ben on the PC | B1 route enablement + B2 bake-off (§2); reconcile results into 32-style notes |
| ∥ Engine gate | Ben reads 31 | rulings on D2/D4/D5/D7 → Phase A whenever he says go (D9 Δ-chip/markers, D10, D11 ride Phases A–B) |

## 8. Parking lot

- **Growth-reel v2 sketch (B3):** milestone → async `/animate/growth` job → clip saved to app
  data dir as a file (path in DB, never base64) → per-character reel UI beside the B5 portrait
  history; autoplay muted-loop thumbnails; storage cap + prune policy. Revisit post-Phase-B.
- **Upstream rewrite watch:** glance at `AventurasTeam/Aventuras` releases ~quarterly; an era
  migration is a 31a-mediated decision, not an upgrade.
- **DB backup habit** (§1) and **push-the-fork?** (Ben-gated) — housekeeping queue.
- **styleReviewer as register-QA** — only if drift shows up in play despite the pack discipline.
- **Rebal threshold/weights sweep results** → fold into research/32 §6 when the PC day happens.
