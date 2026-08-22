# Absolute growth rule — cosmology trigger gate (2026-08-22, Ben's ruling)

## The failure (live, story d97724f2 "Amelia of Evermere")
- Turn 45 (19:52Z) was pure dialogue ("why would you want your breasts larger?"). The classifier (kimi-k3) filed it as `beEvents: [{milking i2}, {catalyst i2}]`; the reducer rolled 9 @i3 (fast_metabolizer +1) → **+1 tier**. The cosmology reads "Player's Semen when ejaculated during sex or paizuri" — nothing of the sort happened. Turn 41 (belt undone) had been `catalyst i3` too (roll 3, partial).
- Same looseness: the `milking` event was a re-report of an EARLIER drain ("You drained one side") → phantom "drained to 0%, +3 units".
- Root cause: the only growth gate was "the classifier emitted an event of an eligible kind". `beGrowthCosmology` was a prompt HINT (which kind to file the act under), never a condition the engine checked. Ben: *"the BE module has different toggles and states for what causes breast growth; this should always be absolute, no other ways exist, and it should always be followed."*

## The rule
When a story states a growth cosmology, **no growth channel lands unless the story's driving act completed on the page this turn**, for that character. Channels covered: classifier growth events of every kind (catalyst/contact/attempt), guaranteed cast events (`translateSpellEffects`), check-backed growth (`promoteGrowthIntent`, synthesized catalyst), the pity fire (pressure holds at the wall), chronic lactation growth (beats stay banked). Banked `pendingGrowth` earned on an earlier *triggered* turn still lands as the cooldown clears. Stories WITHOUT a cosmology keep the legacy kinds gate, byte-identical.

## Mechanism (whitelist-and-verify, the research/57 lesson applied to the classifier)
- Classifier extension `growthTriggers: [{character, evidence}]` (no hard `.max()`; extractor caps at MAX_BE_EVENTS_PER_TURN, evidence sliced to `BE_TRIGGER_EVIDENCE_MAX` 240; bounded again in classifier-bounds). Instruction lives inside the cosmology block of `buildBeEventInstructions` — absent cosmology = unchanged prompt.
- `be/trigger.ts`: `growthGateRequired(settings)` (cosmology non-empty), `normalizeEvidenceText` (strip `<pic>`/`<thought>` blocks — a description or an inner voice is not the act — then all tags, decode entities, flatten curly quotes/dashes/ellipsis, collapse whitespace, lowercase), `verifyGrowthTriggers(triggers, narrative)` → set of normalized names whose quote (≥ 12 chars) is a literal substring of the normalized finalized narration.
- Store `applyBeEvents`: computes the verified set once per turn from `narrativeContent` (the same finalized text drift reads), logs `growth triggers {proposed, verified}` (dev-log signature), passes `extras.growthGate = {requireTrigger, triggered}` per girl into the pure reducer.
- Reducer: step 6 gate right after the kinds gate (outcome `ineligible`, note `cosmology trigger not observed in this response` = `GROWTH_TRIGGER_BLOCK_NOTE`; not a dry beat → no pity pressure); chronic-supply and pity-fire branches log `… held (…)` and keep their counters.
- Pre-flight verdict: with a cosmology, `lands`/`blocked_recovery` become `conditional` → `[CHECK RESULT]` tells the narrator growth lands ONLY if the act completes on the page, else her size does not change. Cap/lock verdicts stand.
- Settings copy (WritingStyleFields): the cosmology field is labelled as the absolute rule.

## What this does NOT make deterministic
The engine still cannot read prose. The classifier can still quote a true sentence that is not the act (any 12-char verbatim substring passes), or miss a real completion (paraphrase instead of quote → growth withheld). The verify step removes the cheapest failure (asserting growth from talk/recall — the quote must exist), and the failure direction flips to "missed growth" which Ben prefers to phantom growth. Review findings + hardening below.

## Verify live (probe + DB)
`research/_d5_knobs_probe.py`; beLog rows `kind: catalyst … outcome: ineligible … note: cosmology trigger not observed` on talk turns; `classificationResult.growthTriggers` on act turns with a quote that is really in `story_entries.content`; tier moves only on those. Dev log `growth triggers {proposed, verified}`.

## Follow-ups recorded (not done here)
- `milking` (and other non-growth) events re-reported from recalled text → same evidence-quote pattern could gate them (optional `evidence` per event; drop on mismatch). Not done: would drop legit events when the model omits the field.
- Memory / "forgot last turn", HTML render failure, ignored DC: no stored turn showed them (19:22Z turn was regenerated away). Capture the turn next time.
