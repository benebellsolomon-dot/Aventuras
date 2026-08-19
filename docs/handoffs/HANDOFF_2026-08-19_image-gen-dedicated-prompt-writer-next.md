# Handoff — Image-gen Phase 1+2 SHIPPED; NEXT = dedicated booru prompt-writer

Written 2026-08-19. Worktree **`aventuras-image-gen-quality-372ac2`**, branch **`master`**,
HEAD `03e6c767` (pushed to public origin/master — this branch is LIVE). Full design +
implementation record: **`research/55-image-gen-identity-anchoring-design.md`** (read it first).

## NEXT = build a dedicated booru image-prompt-writer (approved direction)

**Problem (measured, not theoretical).** In inline mode the NARRATION LLM is asked to embed a
`<pic prompt="...">` booru-tag block mid-story. Even on a fresh turn, WITH the booru instructions
AND a populated identity bank in front of it, the narration model (Ben runs `deepseek-v4-pro`)
writes **prose**, not danbooru tags — e.g. `"sensual, medium shot, one young woman on a bed, bare,
fair skin, blonde hair hiding her face... curls into a fetal position. Moonlight cuts through drawn
curtains..."`. A booru model (`wai-illustrious-sdxl`) cannot adhere to prose, so it ignores the
intended pose/scene → wrong positioning, scene-not-followed, off anatomy. The LLM-fed approach
(the whole point of Phase 1b's identity blocks + `<pic>` instructions) is **insufficient for Ben's
narration model**. Confirmed: the image model + dialect detection are CORRECT (`wai-illustrious`
matches the booru regex; `NarrativeService.ts:666` resolves it via the NanoGPT image profile). The
identity extraction WORKS — Amelia's bank is `1girl, blonde hair, golden eyes, fair skin, slim, wide
hips, young adult...` (verified in the live DB). The failure is purely the narration LLM writing prose.

**Approved fix (Ben chose the fuller option over lighter "deterministic injection"):** stop relying
on the narration LLM for the image prompt. Add a **dedicated, focused LLM call** that converts the
scene → a proper booru TAG prompt: copies the present characters' locked `imageTags` banks verbatim,
sets the count tag (`1girl`/`2girls`/...) and shot type, uses current clothing/location, per-character
spatial-anchor sentences for multi-subject. Because that call's ONLY job is the tag prompt, it
complies — and the booru model then gets tags it can follow.

### Build plan / where to hook
- The app ALREADY has the machinery: the **analyzed path** — `ImageAnalysisService`
  (`serviceFactory.createImageAnalysisService()`) + `runAnalyzedImageGeneration` (`ai/index.ts`,
  `assembleInlineImage` called at ~`ai/index.ts:1092`) + the prose template `image-prompt-analysis`
  (`prompts/templates/image.ts:44-117`). It's a dedicated prompt-writer, but its template is PROSE
  and it IGNORES `imageTags` (identity banks) and does NOT switch to booru for a booru model
  (Phase 1b non-goal #5 — the parity gap). Make a **booru variant**: a booru dialect template (reuse
  the dossier/format rules already in the `image-tag-bank-generation` template + `NarrativeService`
  `INLINE_IMAGE_INSTRUCTIONS_BOORU`), fed each present character's `imageTags` + `currentVisualDescriptors`
  clothing + scene location, selected by `detectPromptDialect(imageModel)`.
- Decide the inline wiring: keep the `<pic>` tag as the PLACEMENT signal but REPLACE its prompt
  content with the dedicated writer's output (in `InlineImageTracker`/`InlineImageService` →
  `assembleInlineImage`), OR run the writer per image. The writer should use the **`promptModel` /
  `promptProfileId`** settings that already exist on `systemServicesSettings.imageGeneration` (a
  fast, format-following model — non-thinking `deepseek-v4-pro` is fine; keep it OFF the narration model).
- Reuse what's built: `aspectRatio.ts` `pickImageSize` (Phase 2), the merged negatives (`dialect.ts`
  `mergeNegativePrompt`), `parsesPromptWeighting` gating, `resolveIdentityTags`/`extractIdentity`.

### Alternative if the writer proves heavy: deterministic injection (the "lighter" option Ben passed on)
In `assembleInlineImage` booru branch, deterministically prepend each tagged character's `imageTags`
bank + the count tag. Guarantees identity + count but leaves the scene/pose as LLM prose — fixes
"who" not "what pose". Fall back here only if the dedicated writer stalls.

## What shipped this session (all on master, pushed) — see research/55 for detail
Phase 1a (F/G/E: negatives merge, emphasis gate, clothing/location reinforcement), Phase 1b
(A/B unified `extractIdentity` + bank non-clobber, C creation-hygiene, D review-gated backfill),
Phase 2 (`aspectRatio.ts`), template reconciliation (`extractIdentity` renders the user-editable
`image-tag-bank-generation` template). Adversarial review caught + fixed two data-loss ship-blockers
(baseline wipe → `mergeIdentityBaseline`; D clobbering live `currentVisualDescriptors` → D writes
baseline only). 759 tests, check 0, eslint clean. Commit range `fb5daba4..03e6c767`.

## Watch-outs
- **PERF GOTCHA (bit Ben, cost 10 min):** `extractIdentity` (and the new writer, if it reuses that
  preset) rides the **"Image Gen" (`imageGeneration`) service preset** (Settings→Generation→Agent
  Profiles). Ben's was `deepseek-v4-pro:thinking` (a reasoning model) → ~5 min PER call → backfill
  unusable. He fixed it by switching that preset to a non-thinking model. DURABLE FIX still pending:
  repoint `extractIdentity` to the `classification` preset + parallelize `runIdentityBackfill`
  (currently serial). Give the dedicated writer a FAST non-thinking model by default.
- **Sprite anchors:** applying a bank changes `spriteAppearanceHash` → invalidates approved anchors
  (the backfill modal warns). The writer only affects the PROMPT, not the hash — fine.
- **Data writes get the adversarial review** (baseline/current/imageTags mutations) per Ben's
  standing discipline — the writer is prompt-only so lower risk, but keep the habit.
- `image-tag-bank-generation` template is now the identity-extraction prompt (id kept for pack refs);
  don't confuse it with `image-prompt-analysis` (the analyzed-path scene prompt template you'll fork).

## State / logistics
- **master is pushed to public `origin/master`** (`git push https://github.com/benebellsolomon-dot/Aventuras.git master`
  — push URL is DISABLED by design; use the explicit-URL form, leave the guard). A new handoff/build
  commit is NOT pushed — push only when Ben authorizes.
- `npm run tauri dev` was left RUNNING in this worktree (:1420). Restart flow: `pkill -f "target/debug/aventura";
  pkill -f "tauri dev"; lsof -ti:1420 | xargs kill`, then `npm run tauri dev`.
- **CR-1 (turn atomicity) is DONE but UNPUSHED** on a separate divergent branch
  (`claude/hardening-done-cr1-next-3f63ed`, commit `951ec2bc`, worktree `hardening-done-cr1-next-3f63ed`).
  Lands via a real merge into master (not a FF), with its own review.
- Ben's live DB: `~/Library/Application Support/com.karelian.aventura/aventura.db` (read-only probe
  with `sqlite3 "file:$DB?mode=ro"`). Amelia+Elara have banks; other 11 characters don't (backfill
  only ran for 2). Image model `wai-illustrious-sdxl` (NanoGPT profile).

## Verify
Fresh: `npm ci` → `npx svelte-kit sync` → `npx vitest run` (759) → `npm run check` (0) → `npx eslint .`.
Pre-push hook runs check+lint (blocked once on pre-existing prettier errors — fixed in `03e6c767`).
Real test of any prompt-writer change: play a fresh turn with Amelia present, expand the `<pic>` prompt,
confirm it opens with her locked tags in proper booru format.
