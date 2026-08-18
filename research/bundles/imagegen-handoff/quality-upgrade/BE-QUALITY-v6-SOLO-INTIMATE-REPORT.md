# v6 Solo/Intimate BE Pipeline — Round Synthesis Report

## (1) VERDICT

**Mean overall: v5 = 5.43 → v6 = 6.21** (7 cells; +0.79 net).

| Count | Cells |
|---|---|
| **Improved (5)** | v6_01 (5→6), v6_02 (4→5), v6_04 supine (4→7), arched-back (6→7), v6_07 lying_back (7→7.5) |
| **Same (1)** | v6_05 lying_side (6→6) |
| **Regressed (1)** | v6_03 growth_intimate (6→5) |

Every cell improved on its **target mechanic** score (7/7 targets up). One cell (v6_03) regressed on **overall** image quality despite a target gain, driven by a new right-hand malformation. The round is a net win with one quality-vs-mechanic tradeoff to watch.

---

## (2) PER-MECHANIC TABLE

| Cell | Mechanic | Target v5→v6 | Verdict | Did the mechanic land? |
|---|---|---|---|---|
| **v6_01** | Hand-on-breast contact deformation | 3→6 | improved | **Yes.** Fingertips sink with compression dimples, contact-shadow troughs, inter-finger bulge; sphere silhouette broken at the hands. Right hand cleaner than left. |
| **v6_02** | Contact deformation + areola visibility | 2→5 | improved | **Yes, both halves.** Real indentation + inter-finger bulge + contact shadow; areola now exposed above fingers (v5 fully occluded). Capped by mushy/fused finger anatomy. |
| **v6_03** | Contact coherence + growth/burst | 3→6 | improved (target) / overall −1 | **Half.** Contact deformation lands (indentation, inter-finger mounding, underbreast squash). **Burst/growth does NOT** — no stretch, tear, or motion. Right hand malformed → overall 6→5. |
| **v6_04** | Supine lateral drape vs rigid spheres | 2→7 | improved | **Yes — strongest result.** Lateral splay, central canyon collapses to shallow valley, apex lower, nipple axes diverge outward. Genuine pose-driven drape. |
| **v6_05** | Side-lying lateral pool/drape | 3→4 | **same** | **No.** Framing more lateral but tissue mechanic fails: no down-side spread/flatten, no mattress-contact shadow. Cupping hand pushes geometry back to sphere. |
| **v6_06** | Arched-back coherence + navel landmark | 3→8 | improved | **Yes.** Genuine lumbar extension, hip-roll, convex belly; navel rendered, midline-correct, with abdominal compression. Lower-torso/groin junction still weak. |
| **v6_07** | Supine gravity spread/drape | 5.5→7 | improved | **Yes, partial.** Lateral splay, softer cleavage, undersides follow ribcage; matte+navel clean. Tissue doesn't fully flatten — retains forward projection. |

---

## (3) THE TWO CRUX QUESTIONS

### CRUX 1 — Did hand-on-breast contact deformation start working? (v6_01 / v6_02 / v6_03)

**YES — the core mechanic is now functional across all three contact cells.** This is the headline v6 result. The contact-deformation prompt block + the hotter contact-fed hand detailer (denoise 0.4→0.55) converted v5's flat-decal-on-rigid-sphere failure into genuine physical contact in every cell:

- **v6_01 (3→6):** fingertips sink with compression dimples, **darker contact shadow in the troughs**, soft tissue wells up between adjacent fingers, sphere silhouette broken near the grip.
- **v6_02 (2→5):** same indentation + inter-finger bulge + contact shadow, **and** the areola-visibility half landed (cups from below, QA target exposed above fingers — v5 hard-failed with both nipples capped).
- **v6_03 (3→6 target):** fingertips depress tissue, soft-tissue mounds between splayed fingers, underbreast squash where palm meets tissue.

**Evidence it's real, not cosmetic:** the displaced medial flesh breaks the perfect-sphere outline at the contact zone in v6_01/02, and v6_03 shows pose-driven shape asymmetry from "support-from-below." These are volume changes, not shadow halos.

**Caveat — partial, hand-quality-limited:** the deformation is a believable *grip-with-indentation*, not yet a *deep physical squeeze*. Three consistent shortfalls: (a) no skin-tension/stretch lines radiating from the grip; (b) underbaked pressure shadow on the upper breast; (c) **finger render quality is now the binding constraint** — left-hand contact is shallower/decal-like in v6_01, fingers are mushy/fused in v6_02, and v6_03's right hand is outright malformed (ambiguous finger count, blob fingertips), dragging that cell's overall below v5.

**Verdict: mechanic CONFIRMED working; finger anatomy is the new ceiling.**

### CRUX 2 — Did reclining gravity become reliable? (v6_04 / v6_05 / v6_07)

**PARTIALLY — supine (back-lying) is now reliable; side-lying still fails.** Split by sub-pose:

- **Supine — RELIABLE.** Both back-lying cells delivered the target mechanic. **v6_04 (2→7)** is the round's strongest result: lateral splay, the deep central cleavage canyon collapses into a shallow soft valley, lower apex, nipple/areola axes diverge outward — the correct supine tell. **v6_07 (5.5→7)** independently confirms: right breast falls outward toward arm/mattress, softer medial cleavage, undersides follow the ribcage. Two cells, same pose, same directional spread-and-drape = reliable.
- **Side-lying — STILL FAILS. v6_05 (3→4, "same").** The only non-improving gravity cell. Framing is more genuinely lateral, but the **core lateral-pool mechanic does not fire**: no spread/flatten of the down-side breast against the mattress, no asymmetric lower-wider drape signature, no bedding-contact shadow. The cupping hand actively pushes geometry back toward an upright sphere.

**Evidence:** supine improvements are corroborated across two independent cells with the same directional signature (canyon collapse + outward axis divergence), which is why it reads as reliable rather than lucky. Side-lying's failure is mechanistically explained — the supporting hand reintroduces sphericity, and the down-side/mattress interface (the actual pool surface) gets no contact treatment.

**Verdict: supine gravity RELIABLE; side-lying gravity UNSOLVED.**

---

## (4) CONVERGENCE CALL

Three mechanics remain unresolved after this targeted prompt+detailer round. Classified by fixability:

| Unresolved mechanic | Cells | Fixable via prompt/setting? | Call |
|---|---|---|---|
| **Finger anatomy quality** (mushy/fused/malformed digits capping confirmed contact) | v6_01 (L hand), v6_02, v6_03 (R hand) | **Borderline → STRUCTURAL.** Detailer denoise tuning has hit diminishing returns; 0.55 fixed displacement but not digit coherence. | **v7: hand-region inpaint / MeshGraphormer or DWPose-hand ControlNet on the detailer pass.** |
| **Side-lying lateral pool** | v6_05 | **No.** Prompt tags produced framing only, not tissue mechanic, across the round. Hand re-spheres the geometry; mattress interface untreated. | **v7: depth/OpenPose ControlNet for the recline plane + regional treatment of the down-side/mattress contact.** |
| **Growth/burst depiction** | v6_03 | **No.** Zero burst signal (no stretch/tear/motion) from prompt alone; it's a temporal/event mechanic a single still + tag block can't carry. | **v7: structural — burst/strain LoRA or a two-image strain→release approach.** Out of scope for solo-intimate still pipeline. |

**Mechanics that ARE converged (prompt-tunable, no structure needed):** supine drape (v6_04/07 — ship as-is), arched-back + navel (v6_06 — ship), and the contact-*deformation* mechanic itself (v6_01/02/03 — the displacement works; only the hand *rendering* needs structural help).

### RECOMMENDATION: **CONDITIONAL STOP — ship v6 solo-intimate settings now; open a narrow v7.**

**SHIP v6 as the solo-intimate baseline.** The round's primary targets landed: hand-on-breast contact deformation now works (P1 ✓), supine gravity is reliable across two cells (P2 ✓ for back-lying), pose coherence + navel landmark works (P3 ✓), and anti-clone/matte negatives introduced no new dropout/matte artifacts (P4/P5 ✓). Mean overall is up and 5/7 cells improved.

**Open a narrow v7 for exactly two structural changes** (do NOT spend another prompt-only round on these — they are demonstrated prompt-resistant):

1. **Hand-region ControlNet/inpaint** (DWPose-hand or MeshGraphormer, applied on the detailer pass). *Justified by v6_03's overall regression (6→5) and the finger-quality ceiling on v6_01/v6_02.* This is the highest-value v7 item: the contact mechanic is already working, so fixing digit coherence directly unlocks the scores the displacement already earned.
2. **Recline-plane ControlNet (depth/OpenPose) + down-side/mattress regional contact** for side-lying. *Justified solely by v6_05* (the only flat gravity cell). Supine needs none of this — keep it prompt-only.

**Explicitly de-scope** growth/burst from the solo-intimate still pipeline (v6_03). It's an event/temporal mechanic; a single still cannot carry it without a dedicated strain LoRA or multi-image approach. Don't let it block the v6 ship.

---

## (5) CONSOLIDATED SOLO/INTIMATE PLAYBOOK ADDITIONS

Fold these landed blocks into the solo-intimate playbook:

**A. Hand-on-breast contact deformation (CONFIRMED — v6_01/02/03)**
- Prompt block: contact-deformation tags — `fingers sinking into breast, fingertip indentation, soft tissue bulging between fingers, contact shadow under fingers, breast deformation, grip compression`.
- Detailer: **hand detailer denoise 0.4 → 0.55**, fed the **contact prompt as its wildcard/positive** (not a generic hand prompt). This is the change that produced displacement instead of decal.
- For areola-QA cells: add `cupping from below, areola visible above fingers` to keep the QA target exposed (v6_02 — prevents the v5 both-nipples-capped hard fail).
- Known ceiling: digit rendering. Until v7 hand-ControlNet lands, expect one weaker hand per render.

**B. Supine / back-lying gravity (CONFIRMED RELIABLE — v6_04/07)**
- Pose-conditioned drape tags: `lying on back, supine, breasts spreading to sides, breasts falling outward, flattened at apex, nipples pointing outward/diverging`.
- **Drop deep-cleavage tags on reclining cells** (collapses the impossible vertical canyon into a shallow valley — this is what fixed v6_04).
- Supine negatives: `(deep cleavage:1.2), breasts projecting upward, rigid spheres, gravity-defying`.
- Add `navel` + matte skin tags — keeps abdomen defined and avoids plastic specular blowout (v6_07).

**C. Arched-back + lower-torso landmarks (CONFIRMED — v6_06)**
- `(arched back:1.3)` produced genuine lumbar extension (was a flat slump in v5).
- `navel` landmark tag renders a correctly-placed midline umbilicus with abdominal compression — add whenever lower torso is visible and not occluded.

**D. Anti-clone / anti-dropout / matte (CONFIRMED clean — P4/P5)**
- Matte-skin negatives held: no plasticky highlight blowout in v6_04/07; no new clone/dropout artifacts introduced anywhere in the round.

**Do NOT add to the playbook (prompt-resistant — defer to v7 structural):**
- Side-lying lateral pool (v6_05) — tags yield framing only, not tissue mechanic.
- Growth/burst event (v6_03) — no still-image tag block carries it.