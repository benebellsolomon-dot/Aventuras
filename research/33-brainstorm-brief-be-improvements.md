# 33 — Brainstorm brief: where can Aventuras improve for BE stories?

**Purpose:** the prep sheet for a dedicated brainstorm session (Ben + agent) on improving
Aventuras as a BE-story platform — wider than the already-designed BE engine, which is its own
gated track (research/31). Nothing here is decided; this brief seeds the discussion so the
session starts generating instead of re-researching.

**Required reading first:** `docs/handoffs/HANDOFF_2026-07-17_aventuras-era-start.md` →
`research/INDEX.md` → skim 31 (design), 32 (image accuracy). Check whether Ben annotated 31.

---

## Seeded topics (with context pointers)

### A. The BE engine track (anchor — status, not brainstorm)
Phase A is designed and gated on Ben's iteration of research/31. The brainstorm should treat the
engine as *coming* and ask what AROUND it needs to exist. If Ben's edits to 31 land during the
session, capture rulings on D2/D4/D5/D7 there, not here.

### B. Image generation (research/32 closed the app side; what's next)
1. **Identity consistency** — the #1 open gap: wire img2img/reference through the bridge shim
   (bridge-side; `krea2_image_img2img.json` exists, unreachable). Then: should Reference Mode
   re-route from gemini to the bridge? What anchors identity — portraits, a per-character seed
   bank, or the old FaceID path for Illustrious renders?
2. **The hyper-scale ceiling** — rebal buys ~1 notch; true hyper needs bridge work (BE-dial LoRA
   rework, or route tier ≥ N to the Illustrious tier-LoRA pipeline). Which path, and does the
   app need to know?
3. **Growth sequences** — the bridge has `POST /animate/growth` (one-call BE growth CLIPS,
   monotonic, with facial reactions). Aventuras has no video surface at all. Inline video for
   growth beats: worth a fork feature? (Video-in-story is a big UX + storage question.)
4. **Backgrounds** — still routed to gemini with a visual-novel prompt. Move to the bridge?
   Does the Krea graph do environment-only shots well?
5. **Portrait lifecycle** — portraits are static; when the engine changes a tier, should
   portraits auto-regenerate (cost/cadence?), version per tier, or stay manual?

### C. Prompt/pack layer (no code needed — content authoring)
6. **The BE preset pack** — clone default-pack: genre rules into `adventure`/`creative-writing`
   (the four constant [BE] worldinfo rules already import per-story; a pack bakes them
   platform-level), classifier guidance, lore-agent "trust structured state over
   narrative-scanning" hardening (31a §7.2), magnitude-scaled narration language (31a §3.5).
7. **Agentic-mode alignment** — the agentic image-analysis template still writes generic prose
   and enforces one-character-per-image; inline mode got all the tuning. Align or deprecate for
   BE stories?
8. **Runtime-variable smoke test** (research/30 §10.2) — still unrun; it validates the
   classifier feedback loop the engine design leans on. Cheap, do it live in the session.

### D. Systems & UX
9. **Legible-RPG surface** — Ben's locked decision. Beyond the planned character-panel BE
   section: growth-beat toasts? A stat sidebar? Milestone markers in the story feed?
   (The old NAI panel + ST gilded-tome UI are prior art.)
10. **Checkpoint UX for growth milestones** — checkpoints are manual; auto-checkpoint on stage
    advance ("before the Peak scene") would make growth arcs safely explorable with branches.
11. **Pacing instrumentation** — D5 requires measured turn cadence before re-deriving pressure
    constants; what's the lightest event-log (world_state_delta already exists as a carrier)?
12. **Harem/co-presence** (Phase C, D2 pending) — what does simultaneous-harem UX look like in
    Aventuras (present-character chips? per-character catalysts colliding in one scene?).

### E. Content & migration
13. **Zaria + the Yue setting pack** — second character + second world; exercises Setting Packs
    and the multi-character story wizard.
14. **The Lucy playtest** — the imported 601-message story on the marker build: does resumed
    canon hold? Do the chapter system + lore agent digest the backlog sanely?

### F. Fork strategy
15. **Upstream contributions** — parser fix + wizard-descriptors fix are clean PRs; the a1111
    keyless-allowlist bug is a clean issue. Contributing keeps rebases cheap and buys goodwill.
16. **Rebase cadence** — upstream master moves (unreleased work exists past v0.7.6). When to
    rebase be-patches, and what's the conflict exposure (story.svelte.ts is the hot file — 31b §8.3)?

## Questions the brainstorm should answer

1. Priority order across B–F for the next 2–3 work sessions (the engine track runs on its own
   gate).
2. Which bridge-side items Ben wants to do on the PC soon (they unlock B1/B2/B4).
3. Video (B3): in or out for v1?
4. Pack vs per-story authoring (C6): where do BE genre rules canonically live?
5. What does "done enough to just PLAY for a while" look like — the minimum set after which Ben
   stops building and runs the Lucy campaign?
