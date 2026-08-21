# Handoff — Growth-coherence chain SHIPPED (playtest rounds 3–8); Ben still testing

Written 2026-08-20 session close. Supersedes
`HANDOFF_2026-08-20_cr1-dbacklog-image-iteration.md` (which covers the morning:
CR-1 landing + D-backlog + image rounds 1–3). **Read `research/57-growth-coherence-design.md`
first** — it is the design record for everything after that handoff.

## State

- **master == be-patches == `dd1a2f34`**, live app running it (:1420),
  `SERVICE_TEMPLATE_SYNC_VERSION` = **8** (verified in the live DB).
- Suite **1099**, svelte-check 0, eslint 0 errors, cargo check clean.
- **NOTHING pushed to origin** (Ben-gated; explicit-URL push only).
- Local-only `CLAUDE.md` at the main checkout root (+ `.claude/verify.sh`) —
  created this session via /project-init; gitignored ON PURPOSE (public fork).

## What shipped after the previous handoff (rounds 4–8, one commit each)

`b26c466b` check-backed growth channel + engine-band size sanitizer ·
`2653ef8d` whitelist-inject size composition + inferred growth target ·
`f3e7c3ce` effectivePresence derivation · `ded3ab39` unknown-spell degrade +
honest refusal cards + dry-cm split + actInProgress validation-retry ·
`dd1a2f34` pre-flight growth verdict + crit pierce + earned banking +
growth_magnitude drift arm. Full rationale, rulings, and meta-lessons:
research/57. Ben's rulings on record: **crits punch through cooldown**;
success/partial bank; the back-to-back pacing concern was testing-only.

## Verified working in live play (Ben's reports)

Identity banks hold the look; scene/act composition (with the act-validation
retry); engine-injected size at true band; guaranteed growth lands (tier
24→25 observed); unknown-spell mis-tags roll as normal checks; Visual Prose
banners were diagnosed as the narration model using its licensed HTML styling
(a story setting, not a bug — toggle in Writing Style or steer via style
instructions).

## Open at close

- **Ben continues testing** rounds 7–8 behavior: crit pierce, banked growth
  paying out, verdict-honest narration, act reliability, expression saliency.
  Diagnose failures from the live DB (stored prompts in `embedded_images`,
  deltas in `story_entries` — the loop that worked all day).
- **Balance knobs** (playtest-gated, research/51 W4): essence economy (1–2 per
  cast vs +2/6h regen), DC rubric, growth pacing post-pierce, bank meter rate.
- **D-2/D-2b** (world-panel + story-switch gating during turns) — Ben's UX
  call; rest of the research/56 backlog is documented there.
- `be/reducer.ts` is 849 lines (>800 guideline) — deliberate: the pipeline
  stays one function for determinism.
- Elara's identity bank exists but most other characters are bank-less —
  backfill modal is Ben-driven; new-character banks auto-extract with the
  hair-length-mandatory template.
- Classification preset now kimi-k3 (Ben switched); temperature slider locked
  by global Advanced Request Settings → Manual Mode (harmless).

## Watch-outs (in addition to CLAUDE.md gotchas)

- Template changes NEVER reach packs without the manual
  `SERVICE_TEMPLATE_SYNC_VERSION` bump; verify via
  `settings.service_template_sync_version` post-restart.
- Parallel agents in ONE worktree: forbid `git stash` (wiped a sibling's
  edits once this session; recovered).
- `git -C <main> merge --ff-only HEAD` resolves HEAD in the MAIN repo — always
  pass the explicit sha when landing.
- The image debugging loop: read the ACTUAL stored prompt from
  `embedded_images` read-only; negatives are recomputed, not stored.

## Verify

`npx vitest run` (1099) → `npm run check` (0) → `npx eslint .` (0 errors) →
`cargo check` in src-tauri. App from MAIN checkout: `npm run tauri dev`;
`.claude/verify.sh` is the fast Stop-hook gate.
