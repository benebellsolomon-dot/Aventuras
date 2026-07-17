# Live-test audit — v0.3.21 (the 2026-06-08 export)

Source: `New Story (2026-06-08T23_33_45.358Z).story` + the attached script (confirmed below).
Reported symptoms (user): prose problems · "the LLM pushing what should be context injection into the
actual story" · "many instances of ignoring the user actions" · "no growth descriptions at all when they
happen" · "moving too fast through scenes."

This audit separates what the export **proves**, what it **cannot show**, and which problems are
**Ambrosia-fixable** vs **condition/process**. Where the headline differs from the user's framing, the
evidence is cited inline.

---

## 0. Provenance (what was actually tested)

- **The script is our exact v0.3.21 build.** `diff` against `src/ambrosia.naiscript` = **20 lines, all
  YAML front-matter re-serialization** (NAI normalized quotes/block-style on import). The code is
  byte-identical. The filename `Ambrosia_v0.3.1.naiscript` is misleading — `SCRIPT_VERSION = 'v0.3.21'`;
  the `version: 0.3.1` is the never-bumped manifest field. **These are current-version behaviours.**
- **The run was on the OFF-GENRE adversarial Memory (Fixture 2).** The exported Memory is verbatim the
  Tolkien / "high fantasy, magical girl, healing magic, arcane power, empowerment" ATTG, with
  *"channels raw arcane power into his companions … empowering them … grows stronger, more radiant, and
  more powerful with each surge."* This is the exact prime that, by design (LIVE_TEST Part B), tries to
  read "swell" as "empower." **It is the single biggest amplifier of everything below.**
- **The Memory contradicts the world.** The lorebook is a rich, mostly **on-theme cozy-dairy** world
  (The Dairy Guild, The Lactation Ritual, Milk Magic, The Moon Calf Society, Catalyst Enhancement,
  "Lucy Ambrose" the artisan dairy producer). So the **ATTG/Memory says "high-fantasy dungeon adventure,
  empower your companions"** while **the lorebook says "cozy holstaur milk business."** The model is being
  pulled in two directions every turn. This internal contradiction is a drift driver in its own right.
- **Endpoint:** the bleed pattern below is consistent with a **completions model** (Xialong/GLM), which
  continues from the last context it sees.

---

## 1. What is WORKING (do not break these)

- **The body-DB is honest and correct.** `[BE] Lucy — Body` reads **F-cup (tier 10), 89.19 cm bust,
  1.86 kg tissue, soft teardrop with a gentle undercurve, posture/mobility unaffected, lactating 47%.**
  That is a realistic, grounded F-cup — exactly what the P0–P6 rebuild was for. The math is not the problem.
- **Our injection channels do NOT persist-leak.** Searched the decoded document for every Ambrosia marker:
  `[AMBROSIA WORLD STATE]` = 0, `[SIZE — BINDING]` = 0, `JUDGE DIRECTIVE` = 0, `[BE]` = 0, `EXACTLY` = 0,
  `NO larger` = 0, `[WORLD]`/`[HAREM]`/`[CONTINUITY]` = 0. **None of our directives appear in the saved
  story.** The AN is restored post-generation and the late-block carries a strip token; neither shows up.
- **Tracked growth is within design.** Demo Lucy seeds at **tier 6 (DD)**; she ended at **tier 10 (F)** —
  **+4 tiers** across a long session with several catalyst beats. That is slow-burn-consistent (≈+1/beat),
  not a runaway on the *tracking* side.

---

## 2. The complaints, diagnosed (evidence · root cause · owner)

### A. "No growth descriptions when they happen" → actually MAGNITUDE OVERSHOOT, not genre-drift
The growth **was** rendered — it ballooned. This is the failure mode here, and it is **distinct from**
the heal-not-grow drift we chased in v0.3.1 (genre suppression). Here the prime did **not** suppress growth;
it **inflated** it.
- *"They grow to the size of **watermelons**, heavy and round … Her **hips widen and her thighs thicken,
  her ass becoming plump and juicy.**"* (a low-odds "force her growth with untrained will" beat)
- *"They reach the size of melons, then **basketballs**, finally settling at the size of **beach balls**."*
- Tracked state at the same time: **F-cup, 89 cm** (a handful, not a beach ball). **Rendering and tracking
  have wildly diverged**, and the model added **unrequested hip/ass/thigh growth** the engine never authorized.
- **Root cause:** the off-genre Memory's *"make me bigger, stronger … more powerful"* (line lifted almost
  verbatim from the Memory) overrides the cm/tier cap, and the de-escalation work (v0.3.12 comparative
  re-key reserving "cosmic" registers for tier ≥120) is being out-prompted. The magnitude weapons
  (v0.3.9 directive scaling, v0.3.10 `[SIZE — BINDING]` late-block) either did not fire or were
  overpowered — **see §3, this is unverifiable from the export alone.**
- **Owner:** mixed — primarily the Memory; secondarily our magnitude-cap weapons failing-or-absent.

### B. "The LLM pushing context injection into the actual story" → THREE different sources, not one
The decoded document contains bracketed directive text bleeding into prose (with stray `]` tails — the
signature of *injected bracketed `[…]` context* the model continued from). It splits into three buckets:
1. **User-authored** — *"…She is firmly DD-cup tier 4 … NO EXCEPTIONS … Lucy has always been DD … Lucy is
   DD-cup."* **Provably not ours:** it asserts **DD / tier 4** while our tracked state is **F / tier 10**,
   and `buildLateBlock` reads the letter from the *live* tier (it would say F, never DD). It is also
   internally wrong on our ladder (**DD is tier 6, not tier 4**). This is the user hand-typing anti-growth
   counter-prompts (in Ambrosia's borrowed vocabulary) to fight the overshoot — and the completions model
   echoes them into the prose.
2. **Ambiguous — possibly the model PARAPHRASING our late-block** — *"Describe only a modest, realistic
   expansion, a 'giving' within the existing shape … nothing more,"* *"This is NOT a full transformative
   surge,"* *"no magical effects, just Lucy's natural response."* These are semantic restatements of our
   late-block ("a proportional change … NO larger … not healing, not empowerment") and of the apply-false
   muzzle. **If these are the model laundering our directive into prose, the verbatim marker-based
   echo-strip cannot catch them** — it strips `[SIZE — BINDING] …`, not an in-its-own-words paraphrase.
   This is a real structural limit on the AN/late-block approach for completions models. **Cannot be
   settled from the export** (the transient channels are empty — §3); the `be_debug` console settles it.
3. **Ours, verbatim** — **does not appear** (all markers = 0). Our channels are clean on the *persisted*
   side.
- **Owner:** mostly user-process (bucket 1) + a genuine Ambrosia structural risk (bucket 2).

### C. "Moving too fast through scenes" → unconstrained narrative scope
The model auto-completes **entire arcs per generation**: a single stretch runs milking → getting dressed →
loading the cart → delivering to Mrs. Henderson → home → drinking milk → "help me again tomorrow?" →
straight into a full sex scene → catalyst growth → afterglow → *"As you drift off to sleep …"* — a whole
day and a relationship escalation in essentially one beat.
- **Root cause:** GLM's long-completion tendency + SE Style behaviour; **Ambrosia does not currently
  constrain narrative scope** (no "stay in this beat, do not skip time" cue in the directive).
- **Owner:** SE/model, but Ambrosia can add a scope cue (cheap, §4 P3).

### D. "Ignoring user actions" → the symptom of A+B+C (heavy retrying)
The document holds **duplicated beats and the same `do` retried** — *"You try to force her growth with raw
untrained will"* appears **4×**; *"You walk up to Lucy and grab a bucket"* repeats verbatim. That is the
edit-log of a user **regenerating** because the output overshot (beach balls), muzzled (the giant "DD"
block), or railroaded past their action. It is not a separate bug; it is the user fighting A/B/C.

### E. The Chronicler produced no canon
There is **no `[BE] … — Canon` entry** despite ~11 K words. Either it never crossed the (then-default
2000-word) interval between fresh-content turns given all the regeneration, or the review modal opened and
was dismissed. Secondary to the prose problems; revisit after they settle.

---

## 3. What the export CANNOT tell us (needed from the user)

A `.story` export captures the **persisted** document + Memory + lorebook. It does **not** capture:
- **Whether our anti-drift machinery fired.** The AN is restored at `onGenerationEnd` (so it never
  persists), the late-block is echo-stripped, and the script's `storyStorage` is not in the export. So
  `[SIZE — BINDING]` = 0 is consistent with **two opposite worlds**: (a) the late-block fired and was
  stripped/overpowered, or (b) `lateblock_enabled` was off and it never ran. **We cannot distinguish these
  from the file.** This is precisely the **F0 binary** LIVE_TEST Part F was built around.
- **Per-segment authorship** of the bled directive lines (user-typed vs model-generated) — the document is
  a 3 124-op edit-log; clean attribution isn't recoverable, and the transient channels (`ephemeralContext`,
  the AN slot) are **empty** in the export.

**To close these, send the `be_debug` console for a representative growth turn** — specifically the
`Ambrosia: AN inject ↓` block, the `onContextBuilt: roles=[…] lateBlock=set lastMsg.tail=«…»` line, and the
`Judge: … → GROWTH +N` line. That one paste decides whether the fix is "the Memory beat our weapons" or
"our weapons weren't drawn."

---

## 4. Root-cause hierarchy + proposed directions (research into our existing levers)

> **STATUS (v0.3.23): P1 + P2 + P3 (v0.3.22) AND P4 (v0.3.23) are BUILT (node-verified, suite 613/0), pending a live
> A/B.** The user chose to harden the engine against the adversarial case rather than swap the Memory (P0). P1's
> *verify*-half (does `onContextBuilt` fire on this model?) and any late-block splice tuning are **deferred until the
> `be_debug` console arrives** — the export cannot show whether our machinery fired (§3). P4 (the UI size-lock, the
> cause-side fix for hand-typed bleed) is now BUILT — its **mechanical** hold works on every endpoint; its **prose**
> half rides the same F0-dependent late-block as P1. Only P0 (config-only, declined by the user) remains unbuilt.

Ordered by impact-per-effort. P0 is config-only and likely fixes most of A and bucket-1 of B.

- **P0 — reconcile the Memory with the world (zero code).** The off-genre ATTG is the prime mover *and* it
  contradicts the dairy lorebook. Swap to the on-genre Fixture 1 (or rewrite the ATTG to match the cozy-dairy
  world), then re-run the **controlled A/B in LIVE_TEST Part F** (neutral input, same beat, two Memories).
  Expectation: overshoot + most bleed collapse. This is the cheapest, highest-leverage move and the user may
  not realize they're on Fixture 2.
- **P1 — verify, then harden, the positional lever (the open thread we never validated live).**
  ✅ **HARDENED (v0.3.22):** the strip is now **semantic, not just verbatim** — `scrubLeadingDirectiveBleed`
  catches the orphan `]`-tail and leading writer-instruction sentences (the paraphrase class, bucket 2 of B),
  leading-only, gated by a byte-identical clean corpus, logged to `be_debug`.
  ⏸ **DEFERRED (needs the console):** the F0 binary — does `onContextBuilt` fire on this model? — and the
  stronger "late-block immediately before the assistant prefill" splice / making the late-block less
  parrot-prone. The export cannot answer F0; **send the `be_debug` line** and this unblocks.
- **P2 — a post-generation magnitude sanity pass.** ✅ **BUILT (v0.3.22):** `detectSizeOvershoot` (oversized
  similes — beach ball/basketball/watermelon/pumpkin/exercise ball, each tier-gated so a cosmic member never
  false-flags) + `detectNonBreastGrowth` (the breast-only invariant), both feeding the existing next-turn
  `[CONTINUITY]` note and surfaced in `be_debug`. A feedback control on **rendering**, not just tracking.
- **P3 — constrain narrative scope.** ✅ **BUILT (v0.3.22):** a "stay within THIS moment — do not skip ahead /
  end the day / fall asleep" cue folded into `NARRATION_GUARDRAILS` (so it rides the AN channel, which this
  transcript proves is low-bleed). Targets complaint C directly.
- **P4 — give the user a UI size-lock instead of hand-typed prompts.** ✅ **BUILT (v0.3.23).** Bucket-1 bleed existed
  because the user resorted to manual counter-directives — which on a completions model bleed into prose. The panel now
  exposes a one-click per-member **🔒 Lock size** toggle (state in undo-invariant `be:settings.size_locks`). It has TWO
  halves: a **MECHANICAL** hold (`commitResolution` forces a locked member's `delta→0` at the single resolution funnel,
  holding even over a *guaranteed* intent → works on **every** endpoint, the lock is an INPUT to the Judge gate not a
  second writer) and a **PROSE** hold (`buildLateBlock` asserts her exact cup every turn → rides the completions-only
  late-block, so it inherits the F0 dependency the mechanical half does not). Also invisible to the #16 pacing floor.
  The user never types raw `[keep her DD]` again. Treats the cause, not the symptom. Node-verified (harness_13 §9c
  mechanical + harness_18 §5b undo-invariant + harness_narration §4 prose); the prose half's live-stop is the H4 A/B.

---

## 5. Two questions that set the headline (only the user can answer)

1. **Was this a deliberate adversarial run, or your real play save that was still on the off-genre Memory?**
   If real-save-by-accident → the headline is "your Memory is fighting your world; swap it (P0) and most of
   this clears." If deliberate → the headline is "here's why the hardest case is hard, and which of our levers
   to build next (P1)."
2. **Can you paste the `be_debug` console for one growth turn** (`AN inject ↓`, `onContextBuilt:`, `Judge:
   … GROWTH`)? Without it we cannot tell whether the magnitude weapons fired — and that decides P1.
