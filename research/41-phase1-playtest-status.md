# 41 — Phase 1 Lucy playtest: instrumentation + live status

**Date:** 2026-07-18 · **Basis:** research/37 Phase 1 checklist (E14, research/34) + the
2026-07-18 handoff. Read-only instrumentation session running alongside Ben's live play.

## Environment verified (this session)

- App: `0.7.6-be.6` installed in /Applications and **running during instrumentation**
  (process name is `aventura`, lowercase — `osascript … contains "Aventuras"` is a FALSE
  NEGATIVE; use `pgrep -x aventura`. Graceful quit by bundle name still works:
  `osascript -e 'quit app "Aventuras"'`).
- Gates: 99/99 vitest, `npm run check` 0 errors, `npm run lint` 0 errors (Node 22).
- si-animator-bridge healthy (`/health` ok, ComfyUI connected, 4090 up).
- All DB access this session: read-only (`file:…?mode=ro`), per the standing constraint.

## Open decisions from the handoff — resolved in play

- **Lucy's tier: 47.** Live `bodyState`: tier 47, waist 65 / hips 80, shape natural,
  fluidType milk. The 2026-07-17 19:04Z turn logged tier 6; every turn from 05:37Z on
  logs 47 — Ben raised it in the panel between sessions, matching the long-standing lean.
- **Tissue density: keep 0.95** by default (non-blocking; no churn unless Ben reopens it).

## Probe instrumentation

`scripts/probe-classifier.mjs` (NEW) — scores the C8 schema-compliance gate from
persisted `world_state_delta.classificationResult`, read-only, runnable mid-play:

```
node scripts/probe-classifier.mjs [storyTitleSubstring=Lucy]
```

Reports: classifiable turns vs the ≥10 gate · parse rate (a refusal/non-JSON
classification saves NO delta, so missing-delta = hard failure) · malformed
beEvents/beStates items · dry-turn rate · beLog cadence trajectory for D5.
Known limit: zod `.default([])` masks whole-field drops as empty arrays — catching those
needs raw-response logging, out of scope for a read-only phase.

## Probe verdict — GATE PASS (final: 11 turns)

- **14/14 turns · 100% parseable · 0 refusals · 0 malformed · 0 dry. GATE: PASS**
  (crossed the ≥10 threshold at 02:00 local and stayed clean through the session).
- **Classifier ruling per the probe: keep `x-ai/grok-4.3`.** No swap to GLM-5.2 —
  the C8 concern was Grok-*fast*, and 4.3 held the extended schema perfectly.
- beEvent kinds: milking ×11, contact ×10; the classifier grounded attitude/arousal/
  fluidFill on every eventful turn.
- **Reducer outcome taxonomy nearly fully exercised live**: 25 none / 4 partial /
  2 fail / 1 success / 2 cooldown / 1 critical — only `muzzled` (lock) unseen, the
  lock never engaged. Cooldown verified muzzling correctly both times it was armed.

## E14 checklist scoreboard

| Check | Status |
|---|---|
| Seed Lucy at ruled tier + waist/hips | ✅ tier 47, 65/80 |
| Classifier schema probe (≥10 turns, 100%/0/0) | ✅ PASS at 10/10 — grok-4.3 confirmed |
| `__betier_N__` reaches bridge on inline image | ✅ `__betier_45__` on krea2 prompts (tier 47 → hyper anchor 45, correct per the sizeBandMarker table) |
| [BODY STATE] metric block honored in prose | 🟡 Ben eyeballs during play (prompt not persisted) |
| Growth beat end-to-end (event → roll → GROWTH directive) | ✅ engine side, TWICE: 05:55Z success (roll 12 @i2, 47→48) and 05:58Z **critical** (roll 16 @i3, 48→50); lastGrowth staged/cleared and cooldowns armed/muzzled exactly per pipeline design. ⚠ prose side: see the adherence finding below |
| C7 agentic-path markerless probe | 🟡 only inline-path images so far (all markered); needs one agentic image to confirm the gap |
| Peak-scene truncation at narrator maxTokens | 🟡 Ben eyeballs (see config notes) |

## Config deltas since the handoff (live DB, read-only)

- **Fixed by Ben:** `Images` preset now `z-ai/glm-4.7` (was the dead `~x-ai/grok-latest`);
  narrator `max_tokens` 8192 → **16384**.
- **Still broken:** `Memory & Context` preset still `~x-ai/grok-latest` (serves
  memory/chapterQuery/timelineFill — those roles 404 silently; fix in Settings →
  Generation, e.g. repoint to `x-ai/grok-4.3`).
- **Still risky:** `actionChoices` still rides the DeepSeek-v4-pro `suggestions` preset
  (structured output on a banned-for-structured model).
- Narrator 16384 is above the old 8192 but below the ST-era ≥24k recommendation — watch
  long Peak scenes for truncation before raising further.

## ⚠ Finding (root-caused): lore cosmology outranks the [BODY STATE] growth directive

The play-time check "narrator honors the [BODY STATE] block" produced the session's
best finding — initially read as a raw adherence failure, then root-caused live:

**The evidence sequence.** Four delta-2 criticals landed during the session (47→48→50→
52→54). The render turns split cleanly:

- **06:01Z (50-tier directive): TOTAL MISS** — 2.3k chars, zero growth prose, only
  ambient "swollen" description. This was PRE-climax.
- **05:57Z (delta-1): ambiguous** — tissue-tremor language, maybe compliant-at-subtle.
  Also pre-climax.
- **06:12Z + 06:14Z (52- and 54-tier directives): CLEAR RENDERS** — "*Growing*… flesh
  pushing against your hand", "visibly broader… stretch marks appearing in real time",
  "tissue has thickened, restructured itself… new territory claimed centimeter by
  centimeter". Both POST-climax.

**Root cause.** The story's always-injected lore entry "Lucy — Growth Catalyst (BE
mechanic)" rules: *"Only the internal-climax catalyst drives growth — not arousal
alone, not milk volume"* and *"her breasts slowly expand — a little fuller each time,
never instant."* The engine, meanwhile, rolls growth on `contact` events. When a
pre-climax contact crit staged a growth directive, the directive contradicted story
canon — and the narrator (GLM-5.2) resolved the conflict in canon's favor and rendered
nothing. The moment the canon catalyst actually occurred (06:08Z climax scene — which
the classifier filed as `contact @i3`, not `catalyst`), the very next two directives
rendered fully. GLM's adherence is fine **when instructions don't conflict**; the block
loses precedence fights with always-on lore.

**Register note:** even the successful renders came at the lore's "slow, tectonic"
register, not the delta-2 directive's "dramatic surge" — lore wins on register too.

**Implications (feed Phase 2/3 specs):**
1. **Spec 3 `beGrowthCosmology` is load-bearing, not flavor** — and it must thread into
   the CLASSIFIER instructions too (`buildBeEventInstructions`), so this story's
   climax-catalyst maps to kind `catalyst` instead of `contact`. Amendment candidate:
   per-story growth-eligible event kinds in `BeStoryConfig` (here: catalyst-only), so
   the reducer never lands canon-illegal growth in the first place.
2. **Spec 3 Task 5 genre-rules pack needs an explicit precedence clause**: the [BODY
   STATE] block is the sole growth authority; lore describes mechanism/flavor, never
   timing or magnitude. (The imported-rules retirement in Task 6 is the same class of
   fix; this fresh Lucy story has only 3 lore entries, no legacy [BE] rules.)
3. **Zero-code unblock available now (Ben's canon, Ben's call):** edit the Growth
   Catalyst lore entry to defer timing to the engine (drop "Only the internal-climax
   catalyst drives growth" and "never instant", or append "the [BODY STATE] block
   announces when growth lands; render it when it says so").
4. Task 6 omission detector still worthwhile (would have flagged the 06:01 miss), but
   the narrator-challenger case (Sonnet 5 / Fable 5) is WEAKENED — GLM adhered once the
   contradiction resolved. Fix the instruction contract before judging the model.

## Shipped in response: the cosmology + precedence package (0.7.6-be.7)

Ben's ruling ("follow your recommendation then implement") → built the same session,
TDD'd (115 tests green) and adversarially reviewed (3 lenses; all actionable findings
fixed — toggle race, settings-garbage hardening ×2 — the rest dispositioned below):

1. **[BODY STATE] precedence sentence** in the block preamble ("THIS BLOCK WINS" over
   lore on growth timing/cause/speed) — reaches every prompt path, including
   custom-pack and customSystemPrompt stories.
2. **Genre-rules block** (`be/genre-rules.ts` → `beGenreRules` template var → both
   narrative templates): growth-authorization precedence, four-phase render scaffold,
   commit discipline, sensory rotation, metric rule; interpolates the two new
   per-story fields. Default-pack templates auto-reseed on next launch. *Known
   limit:* custom packs and customSystemPrompt stories don't render this block (the
   precedence sentence in #1 still reaches them).
3. **Classifier cosmology threading**: `buildBeEventInstructions(beGrowthCosmology)` —
   the story's driving act now maps to kind `catalyst` instead of generic `contact`.
4. **`growthEligibleKinds` config**: reducer gains the `ineligible` outcome — kinds
   outside the story's eligible set never roll, so canon-illegal growth can't land.
   Gate deliberately precedes lock/cooldown. *D5 note:* exclude `ineligible` records
   from cadence statistics.
5. **Settings-tab UI** (shown when beMode): Growth Cosmology, Pacing Flavor, and
   Growth-Eligible Events toggles. Wizard-side fields deferred to full Spec 3.

**To activate for the Lucy story** (Settings → Story, after installing be.7): set
Growth Cosmology ≈ "Only Ben's climax inside Lucy drives her growth — a little fuller
each time"; optionally toggle Growth-Eligible Events to Catalyst-only for strict
canon. With the precedence contract in place, the Growth Catalyst lore entry can stay
as-is.

## Phase 2 Spec 1 shipped (0.7.6-be.8)

Ben's "continue with the plan" → the full quick-wins batch, TDD'd (177 tests, 78 new)
and adversarially reviewed (3 Opus lenses; every actionable finding fixed pre-commit):

- **Pinned 9-step reducer pipeline** (decay → cooldown → pending-land → softState →
  passive fill → events w/ anticipation split → pressure/pity → conditions → drift).
- **Fluid registry + passive fill** (milk/mana/arcane/ambrosia; density threads into
  carried mass). **Anticipation two-beat** (≥2 deltas split; ONSET + SURGING
  directives). **Growth-pressure escalator** (dry beats bank pressure; pity-fire at
  85; `ineligible` never accrues). **Conditions writer** (classifier `beConditions`,
  derived-first Engorged, rendered in the block). **Drift detection** (3 Era-1
  detectors + the research/41 omission detector → next-turn [CONTINUITY] notes).
  **Support axis** (buoyancy suppresses hang) + **interaction milestones** (authentic
  13-row NAI table; "Next size milestone (NOT yet true …)" line). **Store tick-path**
  (present-only, config from settings).

**Review rulings baked in (the important design decisions):**
1. **Overfill couples through growthFactor ALONE** — a neutral fluid (milk, gf 0)
   saturates and converges (no writes, no growth); only growth-fluids feed the
   intentional FIL loop. Fixes the probe-confirmed default-config runaway (+1 tier
   every ~3-6 turns for any full un-milked bystander, forever).
2. **Off-screen bodies never change size unseen** — `ticksEnabled` (present-only)
   holds fill/pressure/pity AND the pending-land while a character is absent; time
   (decay, cooldown) still passes. Staged growth waits for her return.
3. **[CONTINUITY] notes carry their own imperative** (no blanket "correct silently" —
   it contradicted the omission note's "render it now") and name no absolute sizes
   (they staled between detection and render).
4. Directive coherence: mid-split renders GROWTH SURGING (owns the ONSET pairing);
   genre rules got the staged-onset carve-out; subtle clamp is "no further this beat".
5. Hardening: prototype-chain-safe registry lookups (hasOwn ×4 sites), NaN-proof
   growthPressure (a NaN silently nuked the whole record via the all-or-nothing
   parse), pressure cap 170, ttl cap 99, Engorged survives the condition cap.

**Deferred:** sensitivity/bounce/cleavage ladder bake (extract-ladder2.mjs extension —
additive flavor, own session) · wizard-side BE fields (full Spec 3) · known-limit
notes from the reviews: `readBodyState`'s all-or-nothing parse is pre-existing tech
debt (any future NaN-class bug = silent record loss); cup-mention detector is
uppercase-only by design ("a cup of tea"); ttl:0 ≡ ttl:1 off-by-one is harmless.

## Early pacing observations (D5 feed)

At tier 47 with intensity-2/3 contact events, it took SEVEN attempts to land one growth
(1 success / 4 partial / 2 fail — roll 12 finally landing at 05:55Z, ~20 min of continuous
escalation); meanwhile the milking loop cycles fill 60→90→0 repeatedly. Under Phase 2's
escalator the six dry attempts would have banked ~72 pressure — a pity fire just before
the natural success. Reads as: cadence is starved at high tier exactly where the
growth-pressure escalator (Spec 1 Task 5) and passive fill (Task 2) intervene — playtest
evidence supports building the quick-wins batch with the pressure escalator first.

## P3 shipped — Spec 2 si-bridge native provider (2026-07-19, 0.7.6-be.12)

The engine now speaks the bridge's native structured API: `si-bridge` provider
(async submit→poll→binary result), `StructuredImageSpec` assembly from engine
bodyState at BOTH inline call sites (streaming tracker + manual/batch service),
scene inference (intimacy gate with one-step context escalation; 14-key curated
location mapper), and the `__betier_N__`→`be_tier_index` translation on the
prompt-fallback path. **Task 5 calibration verdict: identity mapping** — the
app tier scalar and bridge tier_index are the same 0-51 cup-band ladder (full
band-table agreement verified against deployed-truth source; the "three ladders
disagree" concern is resolved). Full deviation log: research/37 Spec 2
§"Shipped". Review: 3-lens adversarial pass (security/concurrency/edge-case,
27 findings triaged) + a fix-diff pass (8 findings, 4 fixed); gates 217 vitest /
0 check / 0 lint. Setup note for Ben: the si-bridge ImageProfile needs the PC's
real X-API-Key — native endpoints reject keyless (NOAUTH covers /sdapi/* only).

## V2a shipped — sprite-engine foundation (2026-07-19, 0.7.6-be.13)

Spec 4 sub-phase V2a: the 35-cell selection core (`be/sprite.ts` — engorged >
growth-shock > flushed > attitude precedence, band-representative tiers,
boundary-safe appearance hash, deterministic seeds), migration 036
(`character_sprites` cache + anchor columns), provider-agnostic
`spriteProfileId` slot, the FaceID seam (`pose_face_anchor_b64` + weights), and
the anchor lifecycle UI (generate at seed tier → approve → stale-on-appearance-
change) in CharacterPanel. 3-lens review found one live HIGH (retry-restore
wiped approved anchors via addCharacter's column list — fixed) + COW two-phase
persist fix + cell-invariant guards. Gates: 238 vitest / 0 check / 0 lint.
**Ben setup:** Settings → Images → Characters tab → pick a Sprite Profile
(SI Bridge recommended), then per-NPC Generate + Approve in the character
panel. No VN-visible change until V2b (matting + generation + VnView layer).

## V2b shipped — sprites live on the VN stage (2026-07-19, 0.7.6-be.15)

Full sprite pipeline: swappable matting boundary (native Rust `sprite_finish` —
ort + CoreML + isnet-anime, matte→resize→WEBP in one command; pass-through when
the model is absent), lazy per-band generation (5 cells sequential, needed cell
first, shared deterministic seed, FaceID anchor when approved+current and not
krea2-pinned, wholesale stale-hash invalidation), BackgroundImagePhase renders
backgrounds in inline mode when sprites are active, VnView cutout layer with
overlap crossfade + last-known→portrait→spinner fallback. The 168MB
isnet-anime model is INSTALLED at app-data/models/isnet-anime.onnx (Ben-
approved download; Apache-2.0; survives redeploys). be.14 also shipped
pipeline pinning (profile model = bridge-auto/krea2/illustrious — Ben's
style-consistency ask; krea2 pins ride prompt+be_tier_index because the
bridge cannot distinguish a pinned krea2_image from the default).
**Smoke test:** enter VN view in the Lucy story — first band takes ~2.5 min
to fill (needed cell first), then crossfades on band/expression changes.
**Verify in play:** matting edge quality on hair · FaceID expression
distinctness at faceid_weight 0.55 (OD#S4) · seed-tier anchor identity-hold.
**Remaining: V2c** — NARR/DIALOG dialogue format + speaking/dimmed
highlighting (research/37 Spec 4).

## Fidelity arc + two-layer appearance (2026-07-19, be.16-be.19)

Ben's playtest exposed a fidelity chain, fixed in four releases: be.16
(identity_tags — the bridge consumes appearance_excerpt ONLY for skin tone;
sentence-intact scene_tags; clothing rides scenes) · be.17 (portraits + analyzed
scenes get the full engine treatment — the C7 markerless gap closed; portrait
tier from bodyState or descriptor sniff) · be.18 (classifier no longer
overwrites canonical descriptors — root cause of "renders a different
character": Lucy's descriptors held transient scene state, 'holstaur' only in
her description) · be.19 (**Ben's ruling: two-layer appearance** —
`visualDescriptors` = canonical baseline, user-owned, identity rendering +
sprite hash; NEW `currentVisualDescriptors` (migration 037) receives classifier
tracking for ALL story types, feeds scene analysis, never identity; panel shows
the tracked look with Adopt-as-baseline / Clear; portraits render FULL BODY).
Ben still needs to hand-restore Lucy's canonical descriptors once, then
regenerate portrait + anchor (sprite sets rebuild via the hash change).
