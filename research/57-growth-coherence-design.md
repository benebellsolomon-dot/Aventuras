# Growth Coherence — design record (playtest rounds 3–8, 2026-08-20)

One live playtest session exposed, seam by seam, every place where the player's
dice, the BE engine, the narration, the panel, and the images could disagree
about whether growth happened. This doc records the resulting design as one
system, because the individual fixes only make sense together. Commits
`805044b4`..`dd1a2f34`.

## The principle: one player-visible roll, one truth

Resolve-then-narrate already made the RPG check the pre-narration truth. But
growth had FOUR extra places where truth could silently fork:

1. **A second hidden dice layer.** The reducer rolled its own per-event growth
   probability after the check succeeded — "successful roll, no stats."
2. **Missing channels.** Only formal spell casts produced growth events; a
   free-text "channel essence into her" had no path at all in a catalyst-only
   story (essence spent, nothing possible).
3. **Fragile LLM tagging.** The channel depended on the tagger emitting
   `growthIntent` AND `targetCharacter` AND the classifier filling
   `presentCharacterNames` — any one omission silently disabled it (or the
   whole engine, in the presence case).
4. **A verdict the narrator never saw.** The reducer's gates (cooldown, cap,
   lock) run AFTER narration — a correctly-blocked growth still narrated as an
   eruption.

## The pieces

- **`guaranteed` events (r3/r4):** cast growth and promoted check-backed growth
  skip the reducer's probability roll — the RPG check was the dice. Set only by
  `translateSpellEffects` (casts) and `promoteGrowthIntent` (checks); the
  classifier cannot inject it (zod strips). Every other gate still binds.
- **Check-backed channel (r4):** `growthIntent` on the check → target's
  classifier growth events promoted in place to guaranteed catalyst (band-
  scaled via the cast code path — the two channels share intensity logic and
  cannot drift); synthesized at base intensity 2 when the classifier proposed
  none; fail band suppresses one mirror per source.
- **Degradation ladders for every LLM-tagged field (r5/r6/r7):**
  - missing target → inferred when exactly ONE present body-state girl
    (`targetInferred` provenance; two girls → honest refusal);
  - empty `presentCharacterNames` → `effectivePresence` = explicit list ∪
    event-referenced characters ∪ check target; empty → all tracked girls
    (include-when-in-doubt — a hiccup must not switch the engine off);
  - unknown `spellId` → DROPPED, resolves as a normal skill check (the refusal
    auto-failed mis-tagged mundane actions with fake nat-0 records; `spellId`
    now appears on records only for known spells, keeping cast consumers inert).
- **Pre-flight verdict (r8):** the reducer is pure, so CheckPhase computes what
  it WILL decide (`previewGuaranteedGrowth`: replays cooldown tick + metered
  pending-land, then the gates in reducer order; shared `growthBankHeadroom`)
  and `[CHECK RESULT]` tells the narrator: lands (silent) / banks ("size does
  NOT visibly change this scene") / at cap / blocked. Narration writes truth.
- **Crit pierce + earned banking (r8, Ben's ruling):** crit-band guaranteed
  growth punches through cooldown (explicit `critPierce`, never inferred from
  intensity; cap/lock still bind); success/partial on cooldown BANK into the
  existing pendingGrowth meter (`outcome: 'banked'`, not a dry beat — no pity
  double-dip) and land as the cooldown clears. Ambient blocked growth still
  drops (pacing). A crit never buys nothing.
- **Presentation can't out-vote the engine:**
  - images (r5): breast-size tags are whitelist-and-INJECT — any breast-mention
    tag from the writer dies unless on a curated act/anatomy whitelist, and the
    engine's band word + sanctioned anchor is injected at a fixed post-action
    slot (blacklist-filtering lost to phrasing variance in one round; the
    placement bug was the writer emitting NO size vocab → downstream grounding
    appended the band word past the CLIP window);
  - prose (r8): `growth_magnitude` drift arm — room-filling/wall-pressing
    claims sanctioned ≥2 rungs above her apparent tier on the shared anchor
    ladder (`imageSizeAnchorRung` — prose and images read one table) ride
    `[CONTINUITY]` back to her real band next turn.
- **Honest refusal UI (r7):** insufficient-essence renders "⬡ not enough
  essence", outcome "Not attempted" — never a 0 on a d20. `unknownSpellDropped`
  gets a footnote. cm displays show "(N cm dry)" because `bustCm` includes milk
  fill by design (a drain can visually outweigh a tier gain).
- **Act-reliability backstop (r7):** the writer must declare `actInProgress`;
  a true declaration whose action block has no act-family tag (exact-match
  predicate — "after sex" cannot satisfy it) or misses an implied male count
  gets ONE corrective retry; best-effort adoption; generation never fails over
  validation.

## Meta-lessons (earned the hard way)

1. **Deterministic composition beats template pleading.** Every image fix that
   held was code-side (compose order, injection, validation-retry); every
   template-only fix regressed within a round or two of model variance.
2. **Every LLM-tagged field needs a degradation path** — drop, infer, or union;
   never an auto-fail, never a silent disable.
3. **Two dice layers must collapse to one player-visible roll**, and anything
   the narrator is told must already be true (pre-flight what you can).
4. **Blacklists lose to phrasing variance; whitelist-and-inject cannot be
   dodged.**
5. **Template changes require the manual `SERVICE_TEMPLATE_SYNC_VERSION` bump**
   (v8 at session end) — verified live via `settings.service_template_sync_version`.
6. **Parallel agents in one worktree must not use `git stash`** (one stash to
   isolate type errors briefly wiped a sibling agent's edits; both recovered;
   verify-tree-then-commit caught it).

## Open knobs (playtest-gated, research/51 W4 territory)

Essence economy (costs 1–2/cast vs +2 per 6h regen — pool drains fast in
active play), DC rubric under the new easy bias, growth pacing now that crits
pierce (if too fast, tune DC/essence cost — never re-add a second roll), the
banked-growth meter rate (`MAX_GROWTH_LAND_PER_TURN`).
