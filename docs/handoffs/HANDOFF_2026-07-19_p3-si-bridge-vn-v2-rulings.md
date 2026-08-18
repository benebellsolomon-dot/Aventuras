---
generated_at: 2026-07-19T18:56:11Z
goal: "P3: Spec 2 si-bridge native provider (the engine phase that unlocks VN v2 sprites) + collect Ben's transparency + anchor rulings; fold in any further VN v1.x playtest feedback"
---

# Handoff — 2026-07-19

> A fresh agent reads this to continue the work.
> Do not duplicate artifacts (PRDs, plans, ADRs, commits, diffs).
> Reference them by path or URL.

## Goal of next session

P3: Spec 2 si-bridge native provider (the engine phase that unlocks VN v2 sprites) +
collect Ben's transparency + anchor rulings; fold in any further VN v1.x playtest
feedback.

## State of play

_Git context (auto-included from config)._

- Branch: `be-patches`
- Last commit: `4babe320 fix(vn): v1.2 — theme-matched panels, choices swap the textbox instead of stacking`
- Dirty files: 0 — **never `git push` without Ben saying so**

**Project:** the BE story engine + VN game engine inside Ben's Aventuras fork
(`Projects/gaming/Aventuras`, the permanent line). Adult creative project; treat the
domain as technical material. **Ben's standing ruling: Aventuras evolves into a
VN-style game engine for BE RPG adventures** — the live phase order is the table in
`research/37` §"Roadmap revision (2026-07-19)".

**Done (this session, all on `be-patches`):**

- **Phase 1 playtest gate PASSED** — classifier ruled: keep `x-ai/grok-4.3` (probe
  18/18 clean); growth chain verified live twice. Scoreboard + findings:
  `research/41`. Rerunnable scorer: `scripts/probe-classifier.mjs`.
- **Missed-growth root cause** (always-on lore outranked the [BODY STATE] directive)
  → the be.7 cosmology/precedence package (`e1430d8b`).
- **Phase 2 Spec 1 SHIPPED be.8** (`aa1c1569`): pinned 9-step reducer pipeline, fluid
  registry + passive fill, anticipation two-beat, pressure escalator, conditions
  writer, drift detection incl. the omission detector, support axis, NAI milestone
  ladder, present-only ticks. Review rulings (overfill via growthFactor ONLY;
  `ticksEnabled` holds all off-screen size change): `research/41` §"Spec 1 shipped".
- **VN research + plan integration**: `research/42` (architecture) +
  `research/bundles/pixelsaga/MECHANICS.md` (source-verified reference; its
  NARR/DIALOG grammar is V2's proven dialogue format). Build phases:
  `research/37` Part III (V1–V4 + RPG brief R).
- **VN V1 SHIPPED + three playtest-feedback rounds** → be.9/10/11 (`4c6b5540`,
  `3841035d`, `4babe320`): `src/lib/components/story/VnView.svelte` — scene layer
  from inline images (they ARE the scene art in inline mode; bg gen is suppressed by
  the pipeline), sticky presence across empty classifier reads, theme-token panels,
  ADV click-through with streaming hold-back, choices swap the textbox.
  **0.7.6-be.11 is installed and running.**
- Gates at handoff: 177 vitest (10 files), `npm run check` 0 errors, `npm run lint`
  0 errors.

**In flight / next:**

- **P3 = Spec 2, the si-bridge native provider** — full file-level spec in
  `research/37` Part II "Spec 2". Do **Task 5's `POST /image/build` dry-run
  calibration EARLY**: three ladders disagree (engine bandIndex / krea nouns /
  illustrious tier_index) and sprites + growth clips both hang off that one seam.
- **Provider-agnostic ruling (Ben, 2026-07-19)**: image/sprite generation binds to
  configurable ImageProfile slots; external services (NanoGPT, OpenRouter image
  models) must work beside si-bridge — note in `research/37` Part III V2.
- VN v1.x: Ben is playtesting; more screenshot feedback likely. Working loop: fix →
  gates → bump version → build → idle-deploy.
- V2 (banded sprites) stays gated on P3 + the transparency ruling.

**Standing constraints (violating these has caused real damage):**

- Never write the app's SQLite DB while Aventuras runs; read-only is fine. **Process
  detection: `pgrep -x aventura`** (the osascript name check false-negatives).
  Read-only sqlite hits CANTOPEN(14) when the app's pool has idle-closed (no -shm on
  disk; the sandbox can't create one) — judge idle-vs-playing by the db file mtime.
- Deploy chain (proven ~6× this session): backup DB → `osascript -e 'quit app
  "Aventuras"'` → `npx tauri build --bundles app` → `ditto` to /Applications →
  relaunch → verify version. Deploy only when the app is quit OR the DB is idle
  >10 min.
- Builds need Node 22: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.
- Handoff-plugin scripts need `/opt/homebrew/bin/python3.11` (system python3 is 3.9).
- House review rule: engine/persistence diffs get the 3-lens adversarial pass before
  commit — it caught shipping blockers twice this session (default-config growth
  runaway; the self-contradicting [CONTINUITY] tail).
- The shell cwd can reset between commands — `cd` to the repo explicitly.

## Open decisions

- **Transparency (gates V2 sprites) — Ben rules.** Bridge has no matting/RGBA output
  (verified). Options: (a) bridge-side matting node — favored; generation-side
  matting is the industry norm (pixelsaga's `removeBackground: true`) and Ben deploys
  bridge changes himself · (b) app-side WASM background removal · (c) keep V1's
  portrait-card standees — Ben has now SEEN this style live; his verdict sets urgency.
- **Sprite anchor source** (V2): reuse `Character.portrait` as the FaceID anchor vs a
  dedicated approved anchor render; re-anchor policy on appearance change.
- **`bridgeTierIndex` mapping** (P3 Task 5): decided by the `/image/build` dry-run,
  not opinion — same discipline as the classifier probe.
- **RPG layer** (`research/37` Part III §R): needs its own brainstorm session (the
  body IS the character sheet). Do not spec before Ben rules.
- Two Settings items still Ben's: `Memory & Context` preset still points at the dead
  slug `~x-ai/grok-latest`; actionChoices still rides the DeepSeek-backed suggestions
  preset.
- Narrator challenger (Sonnet/Fable): PARKED — the adherence miss root-caused to an
  instruction conflict, not the model; revisit only if drift recurs post-be.7.

## Skills to use

- `tdd-workflow` — Spec 2's provider + sceneInference are pure testable units with a
  written test plan (`research/37` Part II Spec 2); the 177-test engine pattern is
  established.
- `engineering:code-review` — the house 3-lens adversarial pass for the provider
  (network/timeout/abort paths); review the fix diff too, not just findings.
- `verify` — provider verification is behavioral: a real render through the bridge
  (`GET /health` first; base URL in the `si-animator-bridge` memory; A1111 shim stays
  as fallback).
- `handoff:cs-handoff` — refresh before context runs out, not mid-P3.

## Artifacts

- Live plan + P3's full spec + VN track: `Projects/gaming/Aventuras/research/37-implementation-plan.md`
- VN architecture + open-decision detail: `Projects/gaming/Aventuras/research/42-visual-novel-mode.md`
- pixelsaga mechanics reference: `Projects/gaming/Aventuras/research/bundles/pixelsaga/MECHANICS.md`
- Playtest log + everything shipped this arc: `Projects/gaming/Aventuras/research/41-phase1-playtest-status.md`
- The VN view: `Projects/gaming/Aventuras/src/lib/components/story/VnView.svelte`
- BE engine (177 tests green): `Projects/gaming/Aventuras/src/lib/services/be/`
- Classifier probe scorer: `Projects/gaming/Aventuras/scripts/probe-classifier.mjs`
- Bridge contract: `~/dev/si-animator-bridge/INTEGRATION.md` (local clone STALE —
  GitHub `benebellsolomon-dot/si-animator-bridge@main` is deployed truth; no SSH to
  the PC, Ben deploys bridge-side changes himself). Base URL + auth: the
  `si-animator-bridge` memory file.
- Live DB (read-only while running): `~/Library/Application Support/com.karelian.aventura/aventura.db`;
  latest backup `aventura.db.20260719-145359.bak` <!-- handoff:allow secret --> (timestamp suffix, not PII)
- Build/deploy notes: `Projects/gaming/Aventuras/BUILDING-NOTES.md`

---

_Inspired by Matt Pocock's handoff (MIT). See README for full credit._
