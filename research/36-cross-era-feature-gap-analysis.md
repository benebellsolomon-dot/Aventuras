# 36 — Cross-era BE feature gap analysis

**Date:** 2026-07-17 · **Trigger:** Ben: "Are there any other features that we're missing from our BE
module, from either Ambrosia/be module/st/novelai scripts anything we had that could be beneficial to
this new project?" · **Method:** three parallel inventory agents (NAI repo `code/be-story-engine/`
incl. a line-by-line read of the shipped `dist/ambrosia-v0.4.7.naiscript`; ST repo `code/ambrosia-st/`
incl. `legacy/extension/`, `be-mechanics.mjs`, the live Megumin deployment, and research/16–35; the
migration bundles + `~/dev/si-animator-bridge` + UIE), cross-checked inline against the fork at
`0.7.6-be.4` (commit `4d088568`).

**Baseline compared against** (the Aventuras engine as deployed): unbounded tier scalar; derived cup
letters/band words/51 comparatives; per-shape body rows; classifier events (catalyst/contact/milking/
attempt/stabilize ×intensity) + soft states (attitude ×5, arousal, fluidFill) → deterministic seeded-d20
reducer with outcome bands, cooldown, lock, sizeCapTier, TTL conditions; full metric measurement engine
golden-pinned to the v0.4.7 spine (mass/capacity curves, weight-feel/proportion/skin-tension ladders,
auto-derived bust cm per shape×fill, BWH cm string); the [BODY STATE] context block with growth
directives; input-side image grounding (band words, `__betier_N__`, engorgement/arousal cues);
BeStatePanel; per-story beMode + beFluidType; state in `character.metadata.bodyState`,
snapshot/rollback-safe, per-turn beLog.

---

## §1 Verdict

Real gaps exist, in four buckets:

1. **Quick wins** — small pure-engine builds, several already scaffolded-but-unwired (§3).
2. **Big absent subsystems** — Oracle, Chronicler, relationship dynamics (=D2), skills/Judge depth,
   wardrobe machine; each needs a Ben ruling (§4).
3. **Image-side sleeper** — the bridge's modern surface is fully built server-side and unreachable
   from Aventuras, because the app speaks only the A1111 shim (§5).
4. **C6 pack content** — proven rule/prose text to mine instead of rewriting from scratch (§6).

**Recommended order:** Lucy playtest (E14, unchanged) → quick-wins batch ("Phase A+") → C6 rewrite
mining §6 → bridge-provider day (B1+B2+moments in one stroke) → per-subsystem rulings for Oracle /
Chronicler-lite / D2.

## §2 Confirmed gaps inside the current engine (verified against fork source this session)

- **`pendingGrowth` is unwired** — declared in `BodyState`, cleared by `stabilize`, never set. The
  anticipation two-beat (NAI `ANTICIPATION_THRESHOLD=2`, onset turn → resolution turn, consent-keyed
  onset templates) is the designed consumer (31 Phase B).
- **`conditions` has no writer** — reducer decays them, panel displays them, nothing creates them.
  Every prior era wrote TTL'd named states (`Engorged (2h)`, `Milk-Heavy`, `Jealous 6 / Rivalrous 8 /
  Asserting 5 / Aroused 4` gens). Needs a classifier extension (`beConditions`) and/or reducer-derived
  auto-conditions (e.g. fill ≥75 → Engorged).
- **No passive fluid dynamics** — fill moves only via classifier soft-reads and milking drains
  (types.ts comment: "fill/drain ticks arrive in Phase B").
- **`sizeCapTier` + `growthCooldownBeats` have no UI** — engine honors them; nothing sets them per
  story. Natural C6 wizard fields.
- **Panel gaps** — no shape selector (display-only), no height/build baseline inputs (the weight
  estimate consumes them).
- **Bridge path** — the only bridge-capable provider is `providers/a1111.ts` → `POST /sdapi/v1/txt2img`
  (verified). `__betier_N__` is handled ONLY inside the bridge's shim (`_apply_be_cup_dial`,
  bridge `main.py:1650–1671`); nothing on the shim path can reach the modern `/image` surface.

## §3 Quick wins (port-now candidates, with the old mechanics)

| Feature | Old mechanics (source) | Notes for the port |
|---|---|---|
| **Milestones + "Approaching:"** | `INTERACTION_MILESTONES` — 13 driver-keyed rows (load/projection/volume/width): 1.5 kg = "can no longer go braless" … 180 kg = "requires custom architecture"; `nextMilestone` lookahead rendered *"Approaching: … (about 0.6 kg away)"* in the live Lyra body entry (naiscript ~928–2035) | Lookup table + one context-block line + optional panel line. Highest prose-value per effort in the whole list. |
| **Conditions writer** | ST-era "TRANSIENT BODY STATES (M4)": short named statusEffects for engorged/milk-heavy/lactating/tender; NAI social conditions with TTL allow-list | Classifier `beConditions` proposal (capped, clamp-applied) + reducer auto-conditions; feeds the already-built decay + chips. |
| **Passive fluid fill + fluid registry** | NAI `FLUID_REGISTRY`: per-fluid `density / growth_factor / fill_rate / drain_trigger` (milk 1.03 gf 0 · mana 1.00 low · arcane ~1.10 med · ambrosia ~1.25 high); NAI auto-fill was +8%/turn with **no drain path** — "the one genuine mechanical defect" (pinned at 100 forever). Era-2 dropped fluids entirely. **Deliberate FIL inversion** (keep!): full→pressure→growth→bigger capacity→refill flywheel — positive feedback by genre design, commented so nobody "fixes" it. | We already have the drain half (milking events); adding a per-turn fill tick + the registry makes Aventuras the first era with a complete fill/drain loop. `beFluidType` grows into a registry key. Constants per D5: re-derive, don't copy. |
| **Anticipation two-beat** | `ANTICIPATION_THRESHOLD=2`; delta ≥2 splits into onset directive (consent/attitude-keyed `ANTICIPATION_TEMPLATES`) then resolution next turn (naiscript ~5240–5750) | Wires the existing `pendingGrowth` field; reducer sets it, context.ts renders the onset line, next reduce resolves. |
| **Growth-pressure escalator** | Both eras: `FIRE 85 · LATENT 40 · URGENT 70 · ACCRUAL +12`/dry growth beat · `RELEASE −50` on landed growth · fires ONE non-guaranteed pity intent then resets; **overfill coupling**: fill ≥96 adds `30×(1+growth_factor)` into the SAME accumulator (Era-1 `pressure.js:13–89`; NAI ~6099–6260) | The pacing floor our engine lacks (cooldown exists; nothing guarantees eventual growth). Open design Q carried from NAI: locked members still accrue arc pressure that can misfire onto another member — decide fresh. Phase-B item per 31; constants per D5. |
| **Output-side drift detection** | Era-1 `narration.js:16–155` (all node-verified): `detectCupContradiction` (monotonic CUP_RANK incl. UK aliases, 240-char name attribution, flags ≥2-rank drift), `detectSizeOvershoot` (tier-gated simile registry: beach/exercise balls ≥120, basketballs ≥95, pumpkins ≥75, watermelons ≥60, 12-tier margin), `detectNonBreastGrowth` (breast-only invariant — caught a real live violation), `scrubLeadingDirectiveBleed`; corrections injected next turn as `[CONTINUITY] Keep tracked sizes exact — {note}… Correct this silently.` | **The strongest single gap candidate per the ST audit** — our grounding is input-side only; nothing scans what the narrator actually wrote. Pure regex/string logic, fully portable, testable. |
| **Support/buoyancy axis** | `SHAPE_SUPPORT {natural 0, firm .4, gravity_defying .9}` + `SUPPORT_FROM_CONDITIONS` (`featherlight +.8`, `buoyancy charm +.5`, `heaviness curse −.5`, cap [0,1]); effective ptosis `p_gravity(V)·(1−support)`; hard gate `SHAPE_HANG_PTOSIS_MIN=.30` (never "hangs" when supported) | Becomes reachable the moment conditions are writable — magical conditions then physically change hang/posture. 31a tags it VALUABLE. |
| **Sensitivity / bounce / cleavage ladders** | `SENSITIVITY_LABELS` (6-band), `BOUNCE_SCALE` (6), `CLEAVAGE_SCALE` (6) in the same baked-table family we already extract | Extend `extract-ladder2.mjs`; optional block/panel lines. |

## §4 Big absent subsystems (each needs a ruling)

- **The Oracle** (Mythic GM port, naiscript ~4722–5238; Era-1 `oracle.js`): every 3rd turn, 50% fire;
  category split body 25 / social 30 / world 45; FATE_CHART d100 with Exceptional bands; 14 world event
  types; 4 body events that only *enqueue Judge-gated growth intents* (Ambient Surge, Lingering
  Catalyst, Wild Magic Swell, Nursing Ache); 4 social events feeding harem drift; thread system (cap 8);
  directives TTL 3, each hard-appending "Do NOT narrate any breast growth… that is the Judge's domain."
  Single-writer intact. **The decision:** does the engine or the narrator LLM own surprises in Aventuras?
- **Relationship dynamics = D2 (Phase C, already ruled deferred)** — both blueprints now in hand:
  - *ArcTrack* (Era-2, ruled "canonical direction"): two axes Warmth × Autonomy (−100..100), ordered
    classifier → Forming / Devotion / Partnership / Defiance / **Usurpation** (U≥60, warmth-independent,
    playable ending); settle at depth ≥70; per-character **trait-derived friction dial** + autonomy
    ceiling (formulas in `be-mechanics.mjs:140–206`); co-presence jealousy pipeline (map-truth
    witnesses, `care = 0.5 + Attraction/200`, emotStabMultiplier volatility law ×1.5→×0.5, deliberate
    inversion for decay — stable partners cool faster), jealousy→arc feedback (slighted witness:
    −warmth/+autonomy half-magnitude). Caveat: in ST these shaping functions ran only in tests/eval —
    porting them into our reducer is a strict upgrade over what ever ran live.
  - *NAI harem-dynamics* (shipped): 9-value attitude axis, pressure accrual w/ partial-credit reset
    (anti-oscillation), one-rung steps, shift cooldown 3, stage ladder ×6 w/ separate accumulator
    (threshold 3), 60-cell CONSENT_MATRIX → 7 consent modes + difficulty/resistance/prose tables.
  - D2 ruling said hybrid: ArcTrack canonical, consent-mode a derived read. Both specs are now fully
    recovered; Phase C is design-assembly, not research.
- **Chronicler-lite**: the deterministic auto-canon layer (NAI shipped; chronicler-p3.md;
  Era-1 `chronicler.js`). Core: **state-diff, 0-LLM** (watermark over append-logs + fingerprint over
  current state), NET-only growth facts ("Lucy reached G-cup"), overlap-coefficient anti-dup,
  accept/decline/skip modal with **commit-on-accept** (dismiss ≠ decline), 2000-char compaction with
  header validation, undo-lockstep snapshot singleton. Evidence it's the right approach: Era-2's
  off-the-shelf VectFox **taxonomy-collapsed** (every BE event tagged `[relationship_change]`; domain
  capture never worked), and the Era-2 team independently re-derived the deterministic-bridge plan.
  Our reducer + beLog make this *easier* here than in any prior era. Decision: worth a milestone-ledger
  + lorebook-canon writer in Aventuras?
- **Skills / Judge depth**: 8 BRP skills (rank 0–10) on d100 + skillRank·5 (+catalyst_potency·2 for
  catalysis), six outcome bands by margin, DIFFICULTY_BASE 30/50/70/90/110, location-privacy modifiers
  (private −10 / public +15 / magical −10), Catalyst-Mastery methods (Channeling swingy crit≥16 vs
  Binding safe always-+1, potency-scaled mastery gain). Only matters if Ben wants a protagonist
  progression layer; otherwise our d20+intensity stands.
- **Wardrobe state machine**: fits → straining → torn per garment (Era-1 ActionRule-executed;
  ST `wardrobe_strain` 0–100 gauge; `describeStrainProse` ladder). We have only the static
  clothing-reality rung.

## §5 Image side

**Headline (verified):** Aventuras reaches the bridge only via the A1111 provider; the entire modern
surface has no caller:

- `POST /image` + **StructuredImageSpec**: per-character `tier_index/build/breast_shape/heights/…`,
  `be_moments` (button_pop, shirt_rip, bra_snap, swimsuit_fail, dress_split, clothes_burst,
  mid_expansion, hands_clutch, shock, pleasure, strain, embarrassed — a direct match for `lastGrowth`),
  `intimate_moments` (14 acts), `location` (14 curated settings + lighting), `regional: true`
  per-character conditioning for multi-subject shots, style presets, hires-fix.
- **Identity route = B1's server half DONE**: `pose_face_anchor_b64` + OpenPose strength + FaceID
  weights ("body-hold", validated across builds; bridge README: caller side is the remaining work).
  Plus 5 more routing branches (colorize, styled-IPA ± img2img, IPA-only, img2img-only).
- **`/image/sequence` = B2's machinery DONE**: multi-tier growth still-sets, shared seed, body-hold.
- `/image/build` dry-run (cheap spec→prompt preview), `/comfyui/free` VRAM eviction.
- **Video (ruled OUT v1, parked):** `POST /animate/growth` — one call → full growth clip
  (start/end tier, clothed_growth|clothed_burst|nude_reveal|subtle, Atlas or local Wan 2.2). Exists,
  finished, waiting for v2.
- **Proposal:** one new Aventuras image provider ("si-bridge") speaking `/image` + spec. Reframes
  B1/B2 from research to a caller-side build; adds moments/locations/regional for free.
- Cautions from the archaeology: the old UIE export held **three unsynced tier numbers** for the same
  character in one file — when we adopt specs, the engine's tier stays the only writer, `tier_index`
  is always derived at send time. Bridge-side `tier_to_cup_tag` is its own 7-band ladder (fine — it's
  derived from tier; do not also send band words). HandRefiner exists only as a GUI preset, not
  reachable via HTTP (flag for B2). Image-quality playbook: size ceiling `huge` for texture coherence,
  strain-tag recipes, `(deep cleavage:1.2)` not `between breasts` (phantom-object bug), matte skin,
  hand-detailer = biggest fix. The `quality-upgrade/` corpus (~115 files incl. TIER-LADDER / HYPER-BAND
  / OPENPOSE-BODY-HOLD reports) is prior B2 work — reuse, don't re-run.

## §6 C6 pack content to mine (not rewrite)

From the old rule text and Megumin's live presets:

- Four-phase growth scaffold (Anticipation → Onset → Peak → Aftermath) + POV layering.
- Commit discipline: "Never narrate a change you do not commit; never commit a change the prose did
  not earn."
- Anti-pattern list (understating scale, ignored physics, generic body language, summarized growth,
  auto-resizing clothing) — **rewritten metric**; the US-sizing clause is dead per Ben's ruling.
- Growth-authorization gate rewritten against OUR machinery: growth only when the [BODY STATE] block's
  directive says so (replaces the NAI [JUDGE DIRECTIVE] language the imported rules still cite).
- Narrator/character voice separation + the BE carve-out (omniscient voice may describe any subject's
  body/growth/strain as environment; never a roster character's inner monologue).
- One-sensory-channel-per-beat rotation (`TOUCH/WEIGHT/SOUND_VOCAB`, 5–6 bands × 3 variants) + scene-
  scope limiter ("advance the scene a single step and stop" — added after day-spanning auto-completes).
- Megumin craft rules (live-tested): entry-point rotation hard rule (never open with narration twice
  running), anti-repetition (no descriptors reused from the last two turns), proportional response,
  grounded-metaphor budget, physical-laws enforcement, camera-only solo physicality, the **anti-cliché
  denylists** (banned phrases + banned words — a battle-tested erotic-register slop filter), RAW
  VOCALIZATION block (involuntary sound palette, muffle-attempt framing), npc_inner_chatter subtext
  layer, Scene-Phase self-pacing governor ("3 Climax turns running → force a breather").
  **License:** Megumin is CC BY-NC 4.0 — verbatim ports carry a file-header credit.
- Style-inject-twice pattern (high-priority far block + low-priority near-generation reinforcement).
- "Trajectory, not state" framing for deterministic shifts (render the felt vector, not a declaration).

## §7 Data-quality & engineering flags

- **Bust-formula provenance — RESOLVED.** Era-1 `body.js:6–14` warns the NAIscript bust formula once
  overstated ~1.5–2×. The NAI-era audit shows that correction landed *inside* the NAI line (2π-wrap
  fixed during the rebuild, tier-6 94→83 cm) — `v0.4.7` ships the corrected math, and our
  `BUST_CM_CURVES` were baked from v0.4.7's `compute_body_snapshot`. Sanity: t47 natural empty ≈102 cm
  (the buggy wrap would read ~200 cm). No action.
- **Do not copy the ST 3d20 roll** (`(((r1*r2+r3)%20)+20)%20+1`) — documented non-uniform. Our FNV-1a
  d20 stands.
- **All inherited numeric constants are unvalidated** (D5 standing ruling): NAI's own decay grace
  shipped 12 vs its design doc's 4 because measured event cadence was 4–13× sparser than assumed;
  ST's growth-pace target was never pinned (the calibration playtest never ran). Re-derive in play.
- **Advisory → deterministic upgrade:** Era-2's stage gates / DC formulas / jealousy deltas were
  prompted convention only (schema clamped ranges; nothing enforced deltas). Porting any of them into
  our reducer strengthens them beyond what ever ran.
- **Band-vocabulary reconciliation:** four historical vocabularies coexist (NAI prose, UIE 0–35 ladder,
  card booru map, visual-descriptor bridge tags) and none match the bridge's 7-band `tier_to_cup_tag`.
  Ours is the canonical 51-band table; anything else is derived-at-send. Watch for stale vocab in
  imported story content.
- **Zod-strips lesson (recurred here, already handled):** classifier fields ride the schema-extension
  mechanism + `.passthrough()` in bodyStateSchema — keep that discipline for `beConditions` etc.
- **Universal image-entry-point grounding:** every image path must carry BE state, not just the
  dedicated button — Aventuras' agentic path renders markerless today (doc 34 C7, still open).
- **Licensing:** Megumin CC BY-NC 4.0 (attribute verbatim ports); VectFox / ST-Prompt-Template
  AGPL-3.0 (reimplement ideas, don't port code); MVU core MIT.

## §8 Explicitly NOT gaps (deliberate absences — don't chase)

- No arousal scalar existed in NAI (ours is new); no tier regression/decay ever existed (tier_index had
  one write site); no lactation-onset rule engine (fill was continuous from creation).
- Dead-schema fields in NAI (never read): growth_trajectory, wardrobe_threshold_tier→clothing_fits,
  advancement_marks, active_effects, prepared_substances, catalyst_susceptibility (cosmetic only),
  consent_mode_override (manual-only).
- Ancestor-rejected with rationale: layered GLM auto-memory, free-text relationship tracking (severs
  the consent matrix), the d6 #tag skill system (second dice system), the ~493-line GLM NPC-drama
  engine, Mythic's background-regenerate dance, per-run GLM fact budgets.
- NAI bridge transport (two-userscript Worker wire-tap, envelope handshake, poll tolerances) — existed
  only because the NAI sandbox had no network. Aventuras has HTTP; replicate nothing.
- Era-2 dropped fluids entirely and shipped no BE toggle (always-on via card) — baseline is ahead on
  both.

## §9 Inventory register (where everything lives — re-derive detail from source)

**NAI era** (`code/be-story-engine/`, all in `dist/ambrosia-v0.4.7.naiscript` unless noted):
Judge d100/BRP ~4380–4605 · consent/skills tables ~1917–2036 · harem dynamics ~4939–5100 ·
Oracle ~4722–5238 · body-math depth ~928–2035 + 6257–6350 · the weld ~2430–2610 · entity
tree/quests/clothing ~2610–3005 · SE ingestion ~3005–3215 · image/video pipeline ~3295–3720 +
`companion/ambrosia-companion.user.js` · pressure escalator ~6099–6260 · guardrails/directives
~5240–5750 · drift detectors ~6257–6350 · late-block splice ~5753–6100 · Chronicler ~6360–6930 ·
config front-matter (15 knobs). Timing constants: Oracle 3-turn/50%, TTLs J6/R8/A5/Ar4, decay grace 12
(OFF), shift cooldown 3, growth cooldown 2, Chronicler 2000 words, SE rescan 5.

**ST era** (`code/ambrosia-st/`): MVU field catalog + reconciler `st-content/be-module/lucy-scheme.js`
· advisory game math `be-mechanics.mjs` (ArcTrack 157–165/140–206, mastery 208–251, jealousy 253–336,
coupling 338–355, DC 31–51) · stage/DC rule text `st-content/be-module/BE-MODULE.md` · sandbox graph
`be-sandbox.mjs` · Era-1 engine `legacy/extension/modules/` (judge/harem/pressure/oracle/chronicler/
narration/world/arcs/body/jsonish) · Megumin live presets `~/Applications/SillyTavern/data/default-user/
extensions/Megumin-Suite/` + `settings.json → profiles["Lucy.png"]` · design corpus research/20–27,
harem-dynamics-17, chronicler-p3, live-audit-v0.3.21 · deferred-register: docs 31/31a/31b/34/35 +
STATUS.md roadmap (P1 Part E never ran; P2–P4 never started).

**Bundles/bridge:** NAI story export + worldinfo + cards `_inbox/lucys-milk-migration/` (KSE cache
holds orphaned "Marigold"/"Elara" bust charts — ask Ben if wanted) · image playbook + presets + B2
corpus `_inbox/BE-imagegen-handoff-v2/` (HandRefiner GUI-only; "LTX2" preset is a mislabeled Wan
duplicate) · bridge `~/dev/si-animator-bridge` (`INTEGRATION.md`, `src/models.py:386–638`,
`src/main.py` 31 routes; shim `_apply_be_cup_dial` main.py:1650–1671) · UIE modules
`code/universal-immersion-engine/src/modules/` (sprites/expressions selection algorithm, Reality
Engine scene graph, auto background gen — conceptual ports only).
