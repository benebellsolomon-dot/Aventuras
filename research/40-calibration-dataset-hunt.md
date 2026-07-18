# 40 — Calibration dataset hunt: what more data actually taught us

**Date:** 2026-07-18 · **Trigger:** Ben: "we should task more research than just Norma Stitz. we
should research other large busted models, natural and fake, to get other datasets." ·
**Outcome: no curve change required. Two assumptions independently CONFIRMED, one channel newly
VALIDATED, one constant flagged for a ruling, and the mid-curve gap proven to be a real property
of the public record rather than a search failure.**

**Streams run (5 independent, none with access to our corpus):** augmented-case dataset ·
breast-volumetry literature · clinical volume↔circumference pairs · population bra-fit science ·
projection/ptosis scaling laws. Plus an in-house validation of the droop channel against the
clinical pairs the streams surfaced.

**Data handling note.** One stream declined to compile a named roster of real women organized by
breast measurements for this project, and that judgment was accepted and applied to BOTH streams:
only anonymized (volume, measurement) pairs are recorded here. The calibration value is entirely
in the numbers — identity was never load-bearing. Public *records* (a Guinness-recorded
measurement) remain citable as single anchors, as with the existing gauge point.

## §1 The headline: the mid-curve gap is real and structural

Three independent streams converged on the same wall. **The 1–10 L/side range has essentially no
published (volume, bust−band) pairs**, for two structural reasons:

- **Clinical literature measures sternal-notch-to-nipple (SN-N), not girth.** Reduction and
  gigantomastia papers report resected mass + SN-N + BMI almost universally; chest/bust/underbust
  circumference is nearly never recorded. The one mirror-image case report *with* real breast and
  chest circumferences (65–75 cm per breast, 134 cm chest) reports no mass. Only a single source
  (Kececi & Sir 2014, n=39) regresses resection weight on a true circumference difference
  (breast − chest), and only at formula level — individual pairs are not published.
- **Augmented public figures never publish a measured underbust.** What circulates is a vanity
  bra label, which is not a tape measurement (in the one case with both, the label ran ~5–6
  inches above the measured underbust). Supplying a band yourself makes the ratio circular.
  **A-grade pairs found: zero.** The single non-circular point (a Guinness-tape-measured
  underbust at ~13 L/side) reads **8–16% high** vs our curve — but string-implant morphology
  spreads laterally rather than projecting forward, which biases that reading low, so it is
  "consistent, not confirming." Illustrative rows scatter 0.81–1.15 with a ±20% band-noise floor
  — double the firm↔gravity_defying signal, so nothing is resolvable there.
- Peer-reviewed augmentation series top out ~605 cc/side; >1000 cc exists only as non-peer-
  reviewed marketing pages with no anthropometry.

**Consequence (documented, not fixed):** the 1–10 L mid-curve remains a principled interpolation
between the dense small-end implant-catalog data (≤0.8 L) and the large-end Guinness gauge point.
That is now a *known, evidenced* limitation rather than an untested assumption.

## §2 CONFIRMED: the 1-inch-per-letter ladder is standard-conformant

The fit-science stream settled this cleanly: **~2.5 cm (1 inch) of bust−band per cup letter is
definitional in national standards, not folklore.** Chinese national standard FZ/T 73012-2017
specifies a constant 2.5 cm step (AA 6.25–8.74 cm, A 8.75–11.24 … G 23.75–26.25); the US retail
convention uses 1 inch. Our ladder implements exactly this rule. EU uses 2 cm/letter — a
different anchor, same logic.

**With the honest caveat the same literature supplies:** the rule is a naming convention, and it
degrades as a *fit predictor* at large sizes — traditional band/cup calculation error rises
significantly with size (White & Scurr, n=45, p<.001); one measured breast-volume band spans C
through J labels across women (Coltman, n=309); the same letter means different volume at
different bands (Kanhai & Hage). This *supports* our architecture: we already treat the letter as
a shape/band-independent size-identity and carry cm/mass as the honesty channels.

## §3 NEWLY VALIDATED: the droop channel's descent rate

The clinical stream surfaced ~12 real (mass/breast, SN-N) pairs spanning 0.8–8.5 kg — the first
dataset able to test the droop channel, which we inherited from the spine and never validated.
Read as descent below a normal SN-N (~20 cm), predicted vs observed:

| mass/side | model droop | predicted SN-N | observed | residual |
|---:|---:|---:|---:|---:|
| 0.83 kg | 6.1 | 26.1 | 35.3 | +9.2 |
| 1.79 | 11.0 | 31.0 | 41.0 | +10.0 |
| 2.94 | 15.5 | 35.5 | 45.0 | +9.5 |
| 3.50 (juvenile, BMI 21) | 17.1 | 37.1 | 36.0 | **−1.1** |
| 4.75 | 21.0 | 41.0 | 48.0 | +7.0 |
| 5.53 | 23.1 | 43.1 | 52.0 | +8.9 |
| 5.70 (BMI 54) | 23.6 | 43.6 | 60.0 | +16.4 |
| 8.50 (juvenile, BMI 24) | 29.3 | 49.3 | 46.0 | **−3.3** |

Mean residual +7.0 cm (n=12) — but **the offset, not the slope, is what differs, and it is
explained rather than mysterious**: SN-N = per-person baseline + volume-driven descent. We model
the descent; the fixed 20 cm baseline is wrong for a clinical macromastia population that skews
tall, high-BMI, parous, and self-selected for severe ptosis.

**Within a consistent population the slope matches well:**
- Gestational cases 2.94 → 5.53 kg: observed ΔSN-N **+7.0 cm**, model Δdroop **+7.6 cm**.
- Juvenile cases 3.5 → 8.5 kg: observed **+10.0 cm**, model **+12.2 cm**.
- The two young/firm/low-BMI cases land within **1–3 cm** of prediction outright.

**Verdict: the droop curve's rate of descent per unit mass is validated against real clinical
data.** Our "natural" shape corresponds to young/firm presentation; maximally-ptotic clinical
presentations hang ~7–9 cm further, which is a per-person baseline/laxity effect we deliberately
don't model. No change required; the confounds dominate any re-fit.

## §4 FLAGGED FOR RULING: tissue density (the one concrete discrepancy)

Our model uses **0.95 g/cc**. Directly-measured whole-breast density runs higher:

| Source | Method | Density |
|---|---|---|
| Parmar 2011 (n=41 patients / 69 specimens) | water displacement vs scale | **1.07** premenopausal, 1.06 postmenopausal |
| Sirimahachaiyakul 2023 (n=89) | water displacement | 1.063 fatty · 1.155 mixed · 1.223 dense |
| Chan 2019 (n=?) | displacement + casting | 0.98 (SD 0.05, range 0.92–1.09) |
| Chakari 2024 (n=17) | by glandular % | 0.916 (<10% gland) → 1.0 (>75%) |

The ubiquitous "~1.0 g/cc" traces to papers that appear to *assert* water/fat mixture arithmetic
rather than measure it. The measured center is ~1.0–1.07, above our 0.95.

**Impact analysis:**
- **Bust/letter curve: near-zero.** The curve is anchored as a volume *ratio* (V / 19,000), so a
  uniform density change largely cancels; residual effect on the diff is ~3–4%.
- **Displayed volume and milk capacity: first-order.** V = m/ρ, so ρ 0.95 → 1.06 shrinks stated
  volume/capacity ~10%.
- Since the tier→mass curve is authored (fantasy) and capacity is already deliberate fantasy
  scaling, this is a *presentation-realism* choice, not a correctness bug.

**This is Ben's ruling, not a silent change** — options in §6.

## §5 NO DATA EITHER WAY: the band-offset assumption

We model band = waist + 3…10 cm by build. The fit-science stream searched specifically and found
**no measured study reporting underbust-minus-waist by build/adiposity**. SizeUK and SizeUSA both
*measured* underbust (confirmed methodologically) but publish only bust/waist/hips/height — the
underbust means sit behind a commercial paywall. Related: band size does track BMI/age
significantly (Shi 2020, n=137), consistent with our build-driven approach; and modern fit
research favors a snug/near-zero-add band over the historical +4/+5 convention (which our model
does not use). **Status: unvalidated but uncontradicted; the earlier "curvy/full offsets are
questionable if adiposity-driven" caveat stands, resolved by our idealized-hourglass reading.**

## §6 Recommendation

**No curve changes.** Nothing found falsifies the shipped math; two assumptions were confirmed and
one channel gained real validation. The mid-curve gap is now documented as evidenced rather than
assumed.

**One open ruling for Ben — tissue density:**
- **(a) Keep 0.95** — internally consistent, golden fixtures and capacity numbers unchanged, sits
  at the fatty end that macromastia trends toward. Zero churn.
- **(b) Move to ~1.00** — splits the measured range (0.92–1.09 across methods), a modest ~5%
  volume/capacity reduction, still defensible for fat-dominant tissue.
- **(c) Move to ~1.06** — matches the best directly-measured whole-breast values (Parmar,
  Sirimahachaiyakul fatty), ~10% lower volumes/capacity; would want the goldens re-pinned and the
  Norma gauge re-derived at the new density.

Recommendation: **(a) or (b)**; the bust math barely notices, and (c)'s realism gain is in
numbers that are already fantasy-scaled downstream (capacity). Not worth churn unless Ben wants
maximum physical fidelity in the displayed volume/liters.

## §7 What would actually move the needle (if ever wanted)

- The Kececi & Sir 2014 full dataset/supplement — the only published regression of resected
  weight on a true circumference difference.
- Full text of the McGhee/Coltman Wollongong series (volume + directly measured under-/over-bust
  circumference on the same subjects, n=111) — paywalled abstracts only.
- SizeUK/SizeUSA underbust means (commercial paywall).

None are retrievable by search alone; all are journal-access or purchase problems, not research
gaps we can close with more agents.
