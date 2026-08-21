# 60 — FF5.2 Phase 2: unified BOND/Sparks/Grudge relationship engine

**Date:** 2026-08-20 · **Parent:** research/58 (D2 ruling: UNIFY — one relationship number) · **Basis:** full bond-consumer sweep (this session) + research/48 as-built spec.

## Design

### New state (be/types.ts)

`BodyState.rel?: RelationshipState` — `{ bond, sparks, grudge, ct, warmed }`:
- `bond` −5..+20 (THE relationship number; FF scale, negative = hostility the old 0–100 scale could not express)
- `sparks` ≥0 affection accumulator; `grudge` ≥0 resentment accumulator
- `ct` interaction-turn counter driving conversion cadences (increments only when `ticksEnabled` — off-screen girls don't fade, matching research/48's off-screen rule)
- `warmed` — true if a warm event landed since the last sparks check (drives faithful FF fade semantics)

**Presence of `rel` marks the new format.** Legacy `bond` 0–100 converts lazily on read: **`floor(bond / 5)`** (0→0, 44→8, 45→9, 69→13, 70→14, 89→17, 90→18, 100→20). Floor, not round — the review (F2/R-3, found independently by all three lenses) showed rounding shifted every band edge down ~2 legacy points, silently unlocking intimate gates for saves at old bond 38–44. With floor + bands at 4/9/14/18 and gates at 9/14, **no existing save changes stance or gate access on load**. Old scale's 0 was a wary stranger, not an enemy, so it maps to 0; the negative band is new space. No eager writes (research/48 risk-7 ruling stands); the reducer writes `rel` the first time anything moves, leaving the legacy `bond` field frozen as dead data (`@deprecated`, pre-migration snapshots roll back cleanly) — `rel` is authoritative once present. `BOND_DEFAULT` 20 → `rel` default bond **4** (stays "warming").

### Bands, gates, modifiers (converted + extended)

| Surface | Old (0–100) | New (−5..+20) |
|---|---|---|
| stances (tracks.ts) | wary<20, warming 20–44, bonded 45–69, deeply 70–89, devoted ≥90 | **hostile ≤−3, cold −2..−1**, wary 0..3, warming 4..8, bonded 9..13, deeply bonded 14..17, devoted ≥18 — exact floor-conversions of the legacy edges |
| check modifier | −2 / 0 / +1 / +2 / +3 | hostile −4, cold −2, wary −2, warming 0, bonded +1, deeply +2, devoted +3 (still sign-inverted onto bonus per R4) |
| gates (gating.ts) | 45 ×3, 70 ×2 | **9** ×3 (intimate_handling, induce_lactation, milking), **14** ×2 (advanced_catalyst — still `|| dependence ≥ 35` on the unchanged 0–100 dependence scale; deep_ritual — still `&& dependence ≥ 60`) |
| skittish off-switch (modifiers.ts) | bond < 50 | bond < **10** (floor(50/5) — off at legacy 50 exactly, as before) |

FF's stricter physical gates (+4 hug / +8 hand-holding / +14 kiss / +18 full intimacy) do NOT become new hard locks — that would lock content shipped at old-45. They become per-stance behavioral blurbs in the harem block instead.

### Turn math (tracks.ts `applyRelationshipTurn`, replaces `applyBondEvents`)
*(As-built, post-adversarial-review — the review round changed every numbered item below; see §Review outcome.)*

Per reduce, from `bondEvents` (classifier + spell-cast):
1. **Warm** events: sparks gain = intensity 1 → +1, intensity ≥2 → +2; `devoted_heart` folds +1 per event AND raises the per-turn cap from **2 to 3** (R-6: fold alone was inert — the cap equaled the base gain). A warm event of intensity ≥2 also **repairs 1 grudge** (R-7: apology scenes must actually work). Sets `warmed`.
2. **Strain** events: grudge +1 (capped +1/turn); only **scene-defining strain (intensity 3)** moves bond directly (−1, capped −2/turn). R-1: the drafted −1/−2 at intensity 2/3 was a negativity ratchet (−2/turn vs +1/5-turns could floor a bonded girl in 7 turns); sustained conflict now damages through grudge boil-over instead. Direct bond RAISES never happen — conversion only.
3. **Potent** events (spell-authored via `translateSpellEffects`, `BondEvent.potent` — classifier can never set it, Zod strips unknown keys): cap-exempt and doubled (warm i≥2 potent = +4 sparks). R-2: without this, a check-earned charm spell was a guaranteed no-op.
4. **Cadence** (only when `ticksEnabled` and the engine is active): `ct += 1`; the stall decision reads the grudge level **snapshotted at the check** (R-4: reading post-boil-over grudge made grudge 5 outperform grudge 4). At `ct % 3 == 0`: grudge ≥5 → bond −1, grudge reset; else decay −1. At `ct % 5 == 0`: sparks ≥7 AND snapshot-grudge < 3 → bond +1, **sparks −= 7 keeping the remainder** (R-5: banked warmth pays out over later checks, never burned); grudge ≥3 blocks conversion and sparks hold; else if not `warmed` this cycle sparks fade −1; `warmed` clears at the check. Both checks can fire the same turn; `conversions` reports each.
5. Clamp bond to [−5, +20]. Log `kind:'bond'` records with sparks/grudge/bond movement in `note`.

### File-level changes

1. **be/constants.ts** — replace the R6 bond constants: `REL_BOND_MIN −5`, `REL_BOND_MAX 20`, `REL_BOND_DEFAULT 4`, `LEGACY_BOND_DIVISOR 5`, `MAX_SPARKS_GAIN_PER_TURN 2`, `MAX_GRUDGE_GAIN_PER_TURN 1`, `MAX_DIRECT_BOND_LOSS_PER_TURN 2`, `SPARKS_CONVERT_THRESHOLD 7`, `SPARKS_CHECK_PERIOD 5`, `GRUDGE_CONVERT_THRESHOLD 5`, `GRUDGE_CHECK_PERIOD 3`, `GRUDGE_STALL_THRESHOLD 3`. Delete `MAX_BOND_DELTA_PER_TURN`, `BOND_DELTA_PER_INTENSITY`, `BOND_DEFAULT`. Dependence constants untouched.
2. **be/types.ts** — `RelationshipState`; deprecation note on legacy `bond?`.
3. **be/tracks.ts** — `relOf(state)` (lazy conversion), `bondOf` = `relOf(state).bond` (every consumer keeps compiling), `clampBond`, new `bondStance` bands (+`hostile`/`cold` in `BondStance`), new `bondCheckModifier` table, `applyRelationshipTurn`, `stanceBlurb(stance)` (FF tier behavior + physical-gate guidance text). `clampTrack` stays for dependence.
4. **be/metadata.ts** — zod: keep legacy `bond` `.min(0).max(100)` (old saves must parse), add `rel` object schema (bond −5..20, sparks/grudge/ct nonneg ints, warmed bool, `.optional()`).
5. **be/reducer.ts** step 8 — replace the `applyBondEvents` block with `applyRelationshipTurn` (cadence gated on `ticksEnabled`); write `...(rel !== undefined ? { rel } : {})` in final assembly; drop the `bond` spread (legacy field no longer written, only read).
6. **be/context.ts** `buildHaremStateBlock` — stance + `stanceBlurb`; surface grudge ≥3 as "carrying a grudge — warmth is not landing until it is repaired"; sparks stay invisible; inclusion gate `state.bond !== undefined` → `state.rel !== undefined || state.bond !== undefined`.
7. **be/index.ts** — export the new names; remove `applyBondEvents`.
8. **rpg/gating.ts** — thresholds 8/14 + requirement strings.
9. **rpg/modifiers.ts** — new modifier table via `bondCheckModifier`; skittish `< 10`.
10. **ai/image/expressionTags.ts** — raw-read guard becomes `rel ?? bond` presence; `hostile` → `glaring`, extremes otherwise as today.
11. **UI**: `GirlStatusCard.svelte` — bar width `((bond + 5) / 25) * 100`%, label `{stance} · {bond >= 0 ? '+' : ''}{bond}`, grudge chip when ≥3, sparks pips (n/7) as a subtle affinity hint; `HaremGirlRow.svelte` — same label form.
12. **Tests** — rewrite `tracks.test.ts` (bands, modifier table, conversion math incl. 0/44/45/69/70/89/90/100 legacy mapping, cadence goldens, grudge stall, warmed-fade, clamp); update `tracks-reducer.test.ts`, `gating.test.ts` (7/8 and 13/14 boundary pairs), `modifiers.test.ts` (skittish at exactly 10), `context.test.ts`, `expressionTags.test.ts`, `context-builder.test.ts` fixtures; **deliberately re-harvest `canary.test.ts`** (documented as a real behavior change, not a refactor-pass); new migration cases: legacy-only state reads converted, first write materializes `rel`, `rel` wins over stale legacy `bond`.

### Explicitly out of scope (Phase 2b+)
Story-wide relationships for non-BE stories (needs a classifier gate + apply path outside beMode); NPC↔NPC pairs; editor write-surface for rel (none exists today for bond either); Chekhov/agenda coupling.

### Risks
- **Golden canary re-harvest** must be reviewed by eye, not regenerated blindly.
- **Legacy 0–20 ambiguity** is resolved structurally (`rel` presence), never by value sniffing.
- **Blocked-conversion sparks hold** is a deliberate divergence from FF (halved-gains) — arithmetic-equivalent at +1 grants, better game feel (repair pays off).
- Adversarial multi-lens review mandatory before commit (persistence + reducer change).

## Review outcome (3-lens adversarial pass, 2026-08-20 — all lenses returned)

**Fixed same session:** F2/R-3 floor conversion + gates 9/14 + bands 4/9/14/18 (found by all three lenses — the rounding version silently unlocked gated content on save load); R-1 negativity ratchet (intensity-2 strain no longer hits bond directly); R-2 potent spell events; R-4 grudge-snapshot stall (monotone at joint checks, test-pinned); R-5 sparks remainder banking; R-6 devoted_heart cap+1; R-7 warm-repair mechanic; R-8 schema loosened (no min/max on rel.bond, defaulted counters — a strict bound could nuke a whole body state on parse; round-trip tests added); F1 bonded blurb no longer contradicts the gate table; F4 stance blurbs only for girls with actual relationship history; F5 cold→averted eyes; F9/F12 + lens-2 #5 UI threshold import and ± display; F10 hostile row renders red; F11/R-12 new-scale test coverage (modifiers rel path, metadata round-trips, ct=15 matrix, expression arms).

**Accepted as designed (documented, not changed):** F7/R-1-adjacent pacing — bond progression is now earned-only and ~4× slower than the old ±5/turn; that is FF's intended slow-burn and a D5 playtest-tunable (remainder banking + repair soften it). R-9 presence-fallback fade on classifier hiccup (pre-existing include-when-in-doubt bias; costs ≤1 spark per 5 ticks; presence ladder out of scope). R-10/F8 ct counts ACTIVE relationship turns and freezes while the engine sleeps (docs corrected to say so). R-11/lens-1 #4 write amplification while accumulators drain (bounded, and present girls already write via fill ticks). F13 warm intensity 2≡3 (strain distinguishes them; harmless asymmetry). F6 note: the "banked" language now matches behavior via R-5. Legacy `bond` field frozen forever (`@deprecated`) — clearing it would break pre-migration snapshot rollback.

**Verified clean by the lenses:** determinism/replay (pure, triple-guarded against double-apply, `warmed`-stranding proven unreachable by exhaustive BFS over 104k states), 20k-case schema fuzz (no reducer output can fail the parse), R4 sign contract, rollback/branch restore, off-screen semantics, no surviving 0-100 consumer.

### Fix-diff round (mandatory second pass on the fixes themselves)

The fix-diff reviewer found the first-cut fixes had introduced two HIGH regressions, both fixed and test-pinned same session:
- **HIGH-1 passive bond ratchet:** remainder-banking (R-5 fix) + cap-exempt potent events made the sparks bank unbounded, and a bank ≥7 converted to +1 bond every 5th tick with zero new warmth (simulated: 10 charm casts then 200 empty turns crossed the bonded gate). Fixed: `SPARKS_BANK_CAP = 2×threshold−1` — at most one conversion rides on the bank after warmth stops, then it fades (test: 60-turn drain simulation pins exactly 1 conversion).
- **HIGH-2 unreachable grudge:** the warm-repair (R-7 fix) cancelled the same turn's grudge gain (both capped at 1/turn), so any mixed warm+strain scene held grudge at 0 forever and the stall mechanic never engaged. Fixed: repair is void on turns with fresh strain — an apology mid-friction is not an apology (test: mixed scenes accumulate, pure-warm apology repairs).
- **MEDIUM-3:** `potent` was warm-only; a guaranteed curse was still a no-op. Fixed: potent strain = doubled cap-exempt grudge + direct loss from intensity 2 (within the per-turn loss cap).
- **MEDIUM-4:** a malformed `rel` (null/number/wrong types) still nuked the whole body state via the all-or-nothing parse. Fixed: `.catch(undefined)` — corrupt rel degrades to "no relationship history", the girl keeps her body.
- **MEDIUM-5:** harem-block behavior had no coverage. Fixed: blurb/bare-stance/grudge-line/rel-wins tests added.
- Accepted from this round: strain 1≡2 mechanically (intensity carries signal only at 3 — flattening noted, D5-tunable); devoted_heart fold not applying to potent events (spell power is the spell's); stale comments corrected (store append-path, ReducerExtras). Plan-step divergences superseded by this section: step 4's strict zod bounds, step 11's sparks pips (not implemented) and `>= 0` sign (code uses `> 0` so bond 0 renders bare).

Final gate after both rounds: suite 1147, svelte-check 0, eslint 0 errors.
