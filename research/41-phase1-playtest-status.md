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

## ⚠ Finding: narrator growth-directive adherence is weak (the GLM tiebreaker check)

The roadmap's play-time check "narrator honors the [BODY STATE] block" now has data,
and it points at a miss:

- **Delta-1 directive (05:57Z turn):** prompt carried "grew one increment… narrate as
  subtle strain and warmth." Prose rendered tissue-tremor/tension language — *arguably*
  compliant at the demanded subtle register. Verdict: ambiguous.
- **Delta-2 directive (06:01Z turn): MISS.** Prompt carried the critical's "grew
  significantly… Dramatic register is earned: render the surge with full weight and
  spatial consequence." The 2.3k-char response rendered NO surge — only ambient
  "swollen, milk-slick flesh" state description. DB-verified provenance: `lastGrowth
  {delta 2, tierBefore 48}` was live at prompt time and cleared by that turn's reduce.
- Caveat: block-in-prompt isn't persisted, so "directive reached the prompt" is inferred
  from the state machine, not observed. No reason to doubt it (the block is injected
  unconditionally in beMode), but noted.

Implications: (1) narrator-challenger evaluation (Sonnet 5 / Fable 5, permissiveness
unverified) moves from "if drift appears" to "warranted on current evidence" — one miss
in one dramatic opportunity, so collect 2–3 more landed growths before switching.
(2) **Phase 2 Task 6 scope amendment candidate:** the drift detectors catch
*contradictions* but nothing catches *omissions* — consider a growth-render check
(lastGrowth staged but next prose contains zero growth language → CONTINUITY reminder
the following turn). Playtest-derived; would have fired here.

## Early pacing observations (D5 feed)

At tier 47 with intensity-2/3 contact events, it took SEVEN attempts to land one growth
(1 success / 4 partial / 2 fail — roll 12 finally landing at 05:55Z, ~20 min of continuous
escalation); meanwhile the milking loop cycles fill 60→90→0 repeatedly. Under Phase 2's
escalator the six dry attempts would have banked ~72 pressure — a pity fire just before
the natural success. Reads as: cadence is starved at high tier exactly where the
growth-pressure escalator (Spec 1 Task 5) and passive fill (Task 2) intervene — playtest
evidence supports building the quick-wins batch with the pressure escalator first.
