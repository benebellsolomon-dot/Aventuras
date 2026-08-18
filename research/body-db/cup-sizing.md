# Ambrosia Body-DB Audit — Dimension: Cup-Size Systems & the Letter Ladder

**Date:** 2026-06-07
**Scope:** the cup-letter ladder and bust-circumference mapping in `src/ambrosia.naiscript`
(`tier_index_to_letter` ~506, `tier_letter_to_index` ~530, `bust_cm` ~581,
`BUILD_BAND_OFFSET` ~272, `SHAPE_CIRC_FACTOR` ~265), a verbatim port of alpha52.
**Repro:** `research/body-db/_cup_check.mjs` (verbatim-extracted engine functions +
a candidate repair + the real cross-system reference, run in Node).
**Relationship to prior work:** extends `research/body-math-audit.md`, which covered
cup/bust−band/weight/volume in the US realistic range only. This report adds the full
**cross-system** letter mapping (US/UK/EU/JP/FR/AU), makes the band-dependence of volume
**systematic**, builds the **acceptance test** against a real bra calculator, and designs
the **fantasy** extension of the ladder.

---

## TL;DR — KEEP / FIX / REBUILD

| Component | Call | One line |
|---|---|---|
| `tier_index → letter` **ordering** (A, AA, B, BB…) | **FIX (one cell) + clarify** | Only **AA is wrong** (it sits *above* A; every real system puts AA *below* A). The rest is a synthetic, UK-flavoured doubling that is *ordered* fine but *spaced* wrong. |
| Ladder **cadence** (2 tiers per labeled cup, half-step = doubled letter) | **REBUILD the semantics** | The label is **linear in tier** and tracks **no** physical axis. A "half-step" of letter buys a *constant* ≈1 cm of bust−band but a *growing* (60→228 cc) wedge of volume. Doubled letters (DD, FF, GG…) are **full** cups in UK, not half. |
| `bust_cm` circumference term | **REBUILD (structural)** — confirms prior audit | `bust − band = 2π·proj·cov·circ ≈ 4.08·proj`. Real is ≈ **2·proj**. ~1.8–2× too big in A–G. Acceptance test **fails at every tier (0/18)**. |
| `BUILD_BAND_OFFSET` (band = waist + offset) | **KEEP** | Band model is sound; offsets (3–10 cm) are plausible. (Side effect: the 27" band makes every body read as a *bigger* letter than a 34-anchored chart — see §3.) |
| `tier_letter_to_index` parser | **KEEP (with the AA caveat)** | Clean, lossless inverse of the ladder; only inherits the AA inversion. |
| **Displayed letter source** | **REBUILD** | Derive the on-screen cup from the (repaired) **bust−band**, not from a fixed linear map of tier. Once `bust_cm` is repaired, bust−band *is* the definition of cup and becomes equivalent to a volume anchor. |
| **Fantasy ladder** (Z gateway, Z-prefix cycles → `ZA`, `ZZA`, `ZZZY`) | **REBUILD** | `Z` is overloaded (terminal *and* multiplier); `ZA`(52) reads as smaller than `ZZ`(51); magnitude is unreadable; never hands off to the scale metaphors the prose already uses. |

**Headline conflict with the prior audit:** the prior audit said the label runs "~2 cups
behind volume." On the engine's narrow **27" band**, that is **understated** — by volume the
tier-6 "D" body is a real **F** (≈+3 UK steps), because the same cc on a smaller band is a
bigger letter (sister-size law). See §3 and §5.

---

## 1. What the engine actually does (confirmed by running it)

### 1.1 The ladder (`tier_index_to_letter`)
`tier_index` is an **integer** where **even = single letter, odd = the same letter doubled**:

```
0:A 1:AA 2:B 3:BB 4:C 5:CC 6:D 7:DD 8:E 9:EE 10:F 11:FF 12:G 13:GG …
… 48:Y 49:YY 50:Z 51:ZZ 52:ZA 53:ZAA 54:ZB … 100:ZY 101:ZYY 102:ZZA … 200:ZZZY …
```

So the design intent is **2 tiers = one "cup", and the doubled letter is the half-step**
(A → **AA** → B). Two structural facts fall straight out:

- **`AA` is bigger than `A`.** In *every* real system (US, UK, EU, JP, AU) **AA is the
  *smallest* cup, below A** (JP even has AAA below AA). The engine inverts this for the single
  pair A/AA. This is the one genuine ordering bug.
- **The doubled letters above C (DD, FF, GG, HH, JJ…) are read as *half*-steps** here. In
  real **UK** sizing those are **full** cups (D→DD→E→F→FF→G→GG is one cup per step). So the
  engine's *ordering* of doubled letters matches UK, but its *cadence* (half vs full) does not,
  and it invents doubles UK never uses (**BB, CC, EE**).

### 1.2 `bust_cm`
```
band       = waist + BUILD_BAND_OFFSET[build]            // curvy +8 → 69 cm @ waist 61
proj       = bust_projection_cm(...)                     // cube-root-of-volume geometry (sound)
coverage   = min(0.95, 0.5 + 0.002·tier)                 // ≈0.5 low, → 0.95 at tier 225
circFactor = SHAPE_CIRC_FACTOR[shape]                    // natural 1.30 / firm 1.0 / gd 0.80
bust_cm    = band + 2π·proj·coverage·circFactor
```
Added bust−band at natural/low tier = `2π·proj·0.5·1.30 ≈ 4.08·proj` — the structurally
broken term (prior audit §4; re-confirmed numerically in §5 here).

### 1.3 The three "size" signals are pinned to different things
| Signal | Grows like | Source |
|---|---|---|
| **tier_letter** | **linear** in tier (2 tiers / cup) | `tier_index_to_letter` |
| **bust−band** (cup's real definition) | **~tier^0.67** (sublinear: ∝ projection ∝ ∛volume) | `bust_cm` |
| **volume / weight** | **quadratic** in tier | `weight_per_side_kg` |

Three different growth laws cannot all label the same axis. The label is glued to *tier*, the
one quantity with no physical meaning. **That is the answer to "is the ladder coherent?": no —
because it is pinned to tier, not to a measured axis.** (See Table 3, §5.)

---

## 2. Real-world cup sizing across systems (cited)

### 2.1 The one shared axis: cup = (bust − underbust)
Across **all** systems the **band** is the underbust circumference and the **cup letter is a
function of the *difference* (bust − underbust)** — *not* of absolute volume. The difference is
(approximately) band-independent; this is why a calculator only needs two tape measurements.
[Wikipedia *Bra size*; calculator.net; Breakout Bras]

**Increment per cup:**

| System | bust−band per cup | Letter style |
|---|---|---|
| **US** | **1 inch (2.54 cm)** | A B C D **DD DDD** then single letters G H I J K… (no doubles past DDD) |
| **UK** | **1 inch (2.54 cm)** | A B C D **DD E F FF G GG H HH J JJ K KK…** ("I" skipped; consonants doubled) |
| **EU / EN-13402** | **2 cm** | uniform single letters AA A B C D E F G H… (no doubles, no skips) |
| **FR / BE / ES** | **2 cm** (cups = EU) | EU letters; **band number = EU band + 15** |
| **JP / JIS L4006** | **2.5 cm** | **AAA AA A B C D E F G H** (single letters; cup often printed *before* band, e.g. `B75`) |
| **AU / NZ** | **2 cm** | starts on UK labels through DD, then switches to **EU single letters** (F G H…); band = dress number |
| **IT** | 2.5 cm (some now 2 cm) | numbered cups in some brands |

Sources: cup = difference & 1"/cup (US/UK): [bra-calculator.com/size-charts](https://bra-calculator.com/size-charts/),
[calculator.net](https://www.calculator.net/bra-size-calculator.html),
[Breakout Bras](https://www.breakoutbras.com/pages/conversion-chart);
EU 2 cm & band rounded to nearest 5 cm, FR = EU+15: [Wikipedia *Bra size*](https://en.wikipedia.org/wiki/Bra_size);
JP/JIS 2.5 cm + AAA/AA below A: [bra-calculator JP](https://bra-calculator.com/bra-size-calculators-by-country/japan-bra-size-calculator/),
[Wikipedia *Bra size*]; UK sequence: [thelingerieadvisor.com](https://thelingerieadvisor.com/bra-cup-size-chart/),
[Wikipedia *Bra size*]; AU switch to EU labels: [Wikipedia *Bra size*].

### 2.2 The definitive cross-system table, keyed on bust−band (the shared axis)
Per **inch** of (bust − band), the letter in each system (the payoff: same difference, different
letter past D). US/UK share band; FR/BE/ES share these cups but renumber the band (+15).

| bust−band | cm | **US** | **UK** | **EU / FR / AU** | **JP** (2.5 cm/cup) |
|--:|--:|:--|:--|:--|:--|
| <1″ | <2.5 | AA | AA | AA | AAA/AA |
| 1″ | 2.5 | A | A | A | A |
| 2″ | 5.1 | B | B | B | A/B |
| 3″ | 7.6 | C | C | C | B |
| 4″ | 10.2 | D | D | D | C |
| 5″ | 12.7 | **DD** | **DD** | **E** | D |
| 6″ | 15.2 | DDD / F | **E** | **F** | E |
| 7″ | 17.8 | G | **F** | G | F |
| 8″ | 20.3 | H | **FF** | H | G |
| 9″ | 22.9 | I | **G** | I | H |
| 10″ | 25.4 | J | **GG** | J | — |
| 11″ | 27.9 | K | H | K | — |
| 12″ | 30.5 | L | HH | L | — |
| 13″ | 33.0 | M | J | M | — |
| 14″ | 35.6 | N | JJ | N | — |

Table from [Breakout Bras](https://www.breakoutbras.com/pages/conversion-chart) (US/UK/EU rows),
cross-checked against [calculator.net]. **Caveat — UK is not internally standardized past D/F:**
calculator.net maps 7″→**F**, 9″→**G** (skipping the second F/G double earlier), whereas Breakout
Bras maps 7″→**FF**, 9″→**GG**. Real UK brand charts genuinely disagree by ~one step in the
F–H region. This real-world ambiguity is itself license for the engine to pick *one* regular
convention and stick to it (see §7).

### 2.3 Volume per cup — **band-dependent** (must fix a reference band)
Cup letter is a difference; **volume per letter depends on the band** (a wider torso under the
same letter holds more). The sister-size law makes this exact:

> **34C = 32D = 30DD = 36B** — *same cup volume, smaller band ⇒ bigger letter.*
> A D-cup holds ~**400–500 cc** on a **32** band but ~**700–800 cc** on a **38** band.
> [billysbras.com; bra-calculator.com cup visuals]

So any cc↔letter table must **state its band**. Reference table at a **34 band** (1 mL = 1 cc),
from HauteFlair's published chart, extended by the 34-band implant cadence:

| Cup (34 band) | AA | A | B | C | D | DD | E | F | G | H |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| **cc / breast** | 180 | 230 | 290 | 340 | 400 | 460 | 510 | 580 | 650 | 720 |

- **Increment ≈ +175 cc/cup at a 34 band, +160 cc at 32, ~+150 cc at 28–30, +185–200 cc at 36–40.**
  [pacificaplasticsurgery.com; multiple implant-sizing surgeons] Independent rule of thumb:
  "**~150–200 cc ≈ one cup**." [Dr. Killeen; Lawrence Park PS]
- Peer-reviewed: cup letter alone is a **poor** weight/volume predictor — **sister-size band +
  BMI** predict breast weight better than the letter (Aesthetic Surgery Journal 2025, UCLA;
  PMC12448591, cited in prior audit). I.e. the *same letter* spans a wide cc range across bands.

**Definitive realistic reference (bust−band ↔ UK/US cup ↔ cc per breast @ 34 band):**

| bust−band | UK | US | cc/breast @34 |
|--:|:--|:--|--:|
| 2.5 cm (1″) | A | A | 230 |
| 5.1 (2″) | B | B | 290 |
| 7.6 (3″) | C | C | 340 |
| 10.2 (4″) | D | D | 400 |
| 12.7 (5″) | DD | DD | 460 |
| 15.2 (6″) | E | DDD/F | 510 |
| 17.8 (7″) | F | G | 580 |
| 20.3 (8″) | FF | H | 650 |
| 22.9 (9″) | G | I | 720 |
| 25.4 (10″) | GG | J | ~800 |

---

## 3. The band trap (why this engine reads even bigger than its numbers)

The engine's default curvy frame has **band = 69 cm = 27.2″** — a *very* small band. Every
cc↔letter chart above is anchored to a **34″** band. By the sister-size law, a fixed cc on a
**27″** band is **2–3 letters larger** than on a 34″ band ("what is one cup on a 40″ band is
nearly three cups on a 30″ band" — prior audit §3.3). So:

- The volume column in Table 1 (§5), computed against the **34-band** chart, *already* shows the
  bodies running ahead of their label — and on the engine's *own* 27″ band they would read
  **even higher**.
- **This is the precise sense in which the prior audit's "~2 cups behind volume" is understated.**
  Tier-6 "D" = 613 cc/side → **F at 34**, and **~G–H at 27″**. The label "D" is ~3–4 UK steps low
  *by volume on its own band*.

(The band model itself is fine — see §6. The trap is the interaction of a small band with a
volume-quadratic that was tuned without re-anchoring the letter.)

---

## 4. The bra-calculator acceptance test

A real calculator does: measure bust + underbust → `band = underbust`,
`cup = round((bust − band) / 2.54)″ → letter`. **Acceptance criterion:** feed the engine's *own*
`bust_cm` and band back through that rule; the result should equal `tier_index_to_letter(tier)`.

**Result (Table 2, §5): the current engine fails at every single tier (0 / 18).** Because
`bust_cm` inflates bust−band ~2× (so the recovered letter is far too big) *and* the ladder is
offset, the two errors do not cancel — at tier 0 ("A") the recovered cup is already **DD (US) /
DD (UK)**; at tier 6 ("D") it is **J (US) / GG (UK)**.

With the **repaired** `bust_cm` (§7), the recovered UK letter lands in the **C–DD** band across
realistic tiers and the calculator round-trips *coherently* (bust−band, projection and volume all
describe one object) — though it still won't equal the *current label*, because the label ladder
must also be re-anchored (the two fixes are independent and both required).

---

## 5. The numbers (verbatim engine, run in Node)

Frame: waist 61, height 165, build **curvy** (band **69 cm**), shape **natural**. Volume column
anchored to a **34″** band chart (so it *understates* how big these read on the 27″ band, §3).
Full output in `research/body-db/_cup_check.mjs`.

### Table 1 — three-way divergence, current vs repaired `bust_cm`
| tier | label | vol/side cc | cup-by-vol (UK@34) | **cur** b−b cm | cup-by-(b−b) UK | **rep** b−b cm | cup-by-(b−b) UK |
|--:|:--|--:|:--|--:|:--|--:|:--|
| 0 | A | 189 | A | 12.7 | **DD** | 7.1 | C |
| 2 | B | 314 | B | 16.9 | F | 9.4 | D |
| 4 | C | 455 | DD | 20.7 | FF | 11.5 | DD |
| 6 | **D** | 613 | **F** | 25.1 | **GG** | 13.8 | **DD** |
| 8 | E | 787 | GG | 29.5 | HH | 16.1 | E |
| 10 | F | 979 | HH | 34.0 | J | 18.4 | F |
| 13 | GG | 1298 | KK | 40.8 | KK | 21.8 | G |
| 20 | K | 2189 | >KK | 59.5 | >KK | 31.0 | HH |
| 27 | NN | 3287 | >KK | 73.3 | >KK | 37.3 | K |
| 40 | U | 5874 | >KK | 99.0 | >KK | 48.1 | >KK |
| 50 | Z | 8347 | >KK | 119.6 | >KK | 56.1 | >KK |

Read tier 6: label **D**, volume says **F**, current circumference says **GG**, repaired
circumference says **DD**. Three signals, ~4 cups apart, gaps non-constant.

### Table 2 — acceptance test (recovered cup vs engine label)
| tier | label | cur→US | cur→UK | match? | rep→UK | matches vol? |
|--:|:--|:--|:--|:--:|:--|:--:|
| 0 | A | DD | DD | ✗ | C | ✗ |
| 2 | B | G | F | ✗ | D | ✗ |
| 4 | C | H | FF | ✗ | DD | ✓ |
| 6 | D | J | GG | ✗ | DD | ✗ |
| 8 | E | L | HH | ✗ | E | ✗ |
| 13 | GG | P | KK | ✗ | G | ✗ |
| 40 | U | >P | >KK | ✗ | >KK | ✓ |

Current: **0/18 match.** Repaired bust_cm round-trips *physically* but still won't match the
*label* (ladder must be re-anchored too).

### Table 3 — cadence: what one tier-step actually buys
| step | letters | Δ(b−b) cur cm | Δ(b−b) rep cm | Δvol cc |
|:--|:--|--:|--:|--:|
| 0→1 | A→AA | 2.10 | 1.15 | 60 |
| 6→7 | D→DD | 2.20 | 1.15 | 85 |
| 13→14 | GG→H | 2.74 | 1.38 | 115 |
| 20→21 | K→KK | 1.99 | 0.92 | 144 |
| 40→41 | U→UU | 2.24 | 0.92 | 228 |

The label advances at a *constant* rate; bust−band advances ~constant (≈2 cm cur / ≈1 cm rep);
volume advances *4×* faster at U than at A. **No single axis is being labeled.** (Note the rep
cadence dips to ~0.9 cm at tier 20+: projection's ∛-growth plus the `flattenFactor` cap flatten
the bust−band curve into the fantasy range — by design fine, but it means a *repaired* bust−band
alone compresses high-tier letters; see §7 for why the fantasy ladder should switch to a volume/
scale anchor there.)

---

## 6. Per-component verdicts

### 6.1 `tier_index_to_letter` ordering — **FIX one cell, then clarify semantics**
- **Bug:** `AA` (index 1) sits **above** `A` (index 0). Universal convention: **AA < A**. Fix by
  either (a) making index 0 = AA, 1 = A, 2 = B… (shift), or (b) dropping AA from the growth
  ladder entirely and starting at A (cleanest — AA/AAA are *below-baseline* cups a growth RPG
  rarely starts beneath).
- **Ordering above C is OK** (DD, FF, GG… ascend correctly, UK-style). **Cadence is the problem**
  (next item), not order.

### 6.2 Ladder cadence — **REBUILD the semantics**
- Decide what a half-step *is*. Two coherent options:
  1. **Drop half-steps; 1 tier = 1 full cup**, letters run the **UK** sequence
     `A B C D DD E F FF G GG H HH J JJ K KK L…`. Doubled letters become **full** cups (correct
     UK meaning), `BB/CC/EE` disappear, `I` is skipped. Simple, real, legible.
  2. **Keep half-steps but rename them** — a half-cup is `D⁺` / `D½` / `D–E`, not `DD`. Reserve
     doubled letters for their real (full-cup) UK meaning. More granular, still legible.
- **Recommended: option 1** for the displayed letter (granularity lives in tier_index + the prose
  ladder already). It makes the letter mean exactly what a bra label means.

### 6.3 `bust_cm` — **REBUILD (structural)** — *confirms prior audit*
`2π·proj·cov·circ ≈ 4.08·proj` vs real **≈2·proj**. Acceptance test fails everywhere. Repair in
§7. (Independent re-derivation here agrees with body-math-audit.md §4 to the decimal.)

### 6.4 `BUILD_BAND_OFFSET` / band model — **KEEP**
band = waist + offset (3–10 cm) is plausible underbust modeling. *But document the band trap:*
the 27″ curvy band makes 34-anchored cup charts read 2–3 letters high. If the product wants
displayed letters to feel "normal," either widen the default band or (better) derive the letter
from bust−band on *that* band so it's internally honest regardless.

### 6.5 `tier_letter_to_index` — **KEEP**
Lossless inverse; clean Z-prefix parsing. Inherits only the AA inversion and whatever ladder
cadence is chosen. If §6.1/§6.2 change the ladder, regenerate this in lockstep (it's already
written as the exact inverse, so that's mechanical).

### 6.6 Displayed-letter source — **REBUILD**
Stop reading the letter from a linear tier map. **Derive it from (repaired) bust−band**:
`cup = letterFromBustBand(bust_cm − band)`. Once `bust_cm` is physical, bust−band *is* the cup
definition, so this is simultaneously the volume-honest answer (they converge). This **nuances
the prior audit's "anchor the letter to volume"**: anchor it to **repaired bust−band**, which —
post-fix — equals the volume anchor but is the *primary* real-world definition and needs no cc
table at runtime.

---

## 7. Recommended canonical mapping

### 7.1 Realistic range (tiers ≈ 0–20, cups A–K) — reproduce a bra calculator
**(a) Repair `bust_cm`** so bust−band ≈ 2·projection:
```js
const SHAPE_CIRC_SPREAD = { natural: 1.15, firm: 1.0, gravity_defying: 0.85 }; // small spread, NOT 2π
function bust_cm(tier, waist, height, shape, build) {
  const proj = bust_projection_cm(tier, height, shape, /*lact*/false, 0);
  const band = waist + (BUILD_BAND_OFFSET[build] ?? 5);
  return band + 2 * proj * (SHAPE_CIRC_SPREAD[shape] ?? 1.0);
}
```
This yields tier-6 bust−band ≈ **13.8 cm → UK DD / US DD**, in line with weight (582 g/side ≈
DD–E on a normal band) and projection (6 cm). Calibrate the small spread so A–K matches the §2.4
anchor table; let it diverge only above ~K.

**(b) Derive the displayed letter from bust−band** with the UK ladder (§2.2), or US if preferred:
```js
function cupFromBustBand_cm(diff_cm, system='UK') {
  const inch = Math.round(diff_cm / 2.54);
  const UK = ['AA','A','B','C','D','DD','E','F','FF','G','GG','H','HH','J','JJ','K','KK','L'];
  const US = ['AA','A','B','C','D','DD','DDD','G','H','I','J','K','L','M','N','O','P','Q'];
  const t = system === 'US' ? US : UK;
  return inch <= 0 ? 'AA' : (inch < t.length ? t[inch] : t[t.length-1] + '+');
}
```

**Acceptance target:** for tiers 0–20, `cupFromBustBand_cm(bust_cm − band)` should equal a
standard calculator's result on the same two measurements, *and* agree (within one step) with the
cc→cup lookup at that band. This is the realistic-range pass/fail.

### 7.2 Fantasy range (tiers ≳ 20, past K) — coherent by design
**Critique of the current scheme.** `Z` is **overloaded**: it is both the terminal of the base
cycle (index 50 = `Z`, 51 = `ZZ`) **and** a prefix multiplier (`ZA`=52, `ZZA`=102…). Consequences:
- **`ZA`(52) reads as smaller than `ZZ`(51)** — the prefix flips meaning mid-stream.
- Magnitude is **unreadable**: nobody can rank `ZZZY`(200) vs `ZZZZE`(260) at a glance.
- It **never hands off** to the scale metaphors the *prose* already deploys ("room-filling,"
  "building-scale," comparative band tier_max 200 = "Infinity"). The letter ladder and the prose
  ladder describe the same body in two unrelated languages.

**Recommended fantasy design — split the responsibility:**

1. **Through ~K (tier ~20):** real UK letters from bust−band (above).
2. **K → end of single letters (tier ~20–48):** continue UK doubling `KK L LL M MM … Y YY`,
   **one cup per 2 cm of bust−band**, with bust−band switched to a **constant cm-per-cup cadence**
   (don't let the ∛-projection curve compress it — see Table 3 note). Pick a fantasy cadence and
   hold it: e.g. **+3 cm bust−band per full cup** past K (a touch faster than real 2.5 cm, signals
   "beyond human" while staying legible). This keeps letters monotone and readable.
3. **Beyond Y (tier ≳ 48): switch to a *named scale*, not stacked Z's.** Replace `ZA / ZZA /
   ZZZY` with tiers tied to the **volume / comparative** axis the prose already uses, e.g.
   `Z` then `Z+1, Z+2 …` or named bands **`Beyond-Z · "head-sized"`, `"torso-sized"`,
   `"furniture-scale"`, `"room-scale"`, `"building-scale"`**. Map these to the existing
   `COMPARATIVE_DESCRIPTIONS` `tier_max` breakpoints (58/82/120/165/200/∞) so the letter and the
   prose finally agree. This is more on-genre ("environmental scale") *and* more readable than
   `ZZZZZE`.

**Why a volume/scale anchor past K, not bust−band:** in the fantasy range volume is quadratic
while bust−band (∝∛volume) flattens — a letter glued to bust−band would *slow down* exactly when
the fantasy wants it to *accelerate*. Anchoring the top of the ladder to volume/comparative tiers
keeps "each cup is a visibly bigger leap" true, which is the whole point of the genre.

### 7.3 Internal-consistency check the engine should ship
A tiny self-test (extend `_cup_check.mjs`): for tiers 0–20, assert
`|cupFromBustBand(bust_cm−band) − cupFromVolume(vol, band)| ≤ 1 step`. If it ever exceeds 1, the
circumference and volume models have drifted apart again. (Today that assertion fails by 3–4 cups
at tier 6 — it is the canary the current build is missing.)

---

## 8. Conflicts & agreements with the prior audit (`body-math-audit.md`)

| Topic | Prior audit | This report |
|---|---|---|
| `bust_cm` ~2× too big in A–G | ✅ stated | ✅ **confirmed** to the decimal (independent extraction) |
| Label runs "~2 cups behind volume" | stated | **understated** — on the 27″ band it's ~3–4 UK steps (§3); the "~2" implicitly assumed a 34 band |
| "Anchor the letter to volume" | recommended | **refined** → anchor to **repaired bust−band** (the primary real definition; equals the volume anchor post-repair, needs no runtime cc table) |
| Band model fine | ✅ | ✅ + flagged the **band trap** (small band inflates the perceived letter) |
| Cross-system letters | US-only | **added** UK/EU/JP/FR/AU + the per-inch divergence table (§2.2) |
| Half-step / AA semantics | not examined | **AA inverts** the universal AA<A; doubled letters are UK-ordered but spaced as half-cups (should be full); `BB/CC/EE` are inventions (§1, §6) |
| Fantasy ladder | "leave alone, fantasy-by-design" | **examined & rebuild-recommended** — fantasy *sizes* are fine, but the **Z-prefix naming** is overloaded/unreadable and never meets the prose; redesign to named scales (§7.2) |

**Net:** the prior audit's structural verdict on `bust_cm` holds and is reinforced. This report
adds three things it didn't cover: (1) the cross-system letter reference and the band-dependence
of volume made systematic, (2) a concrete pass/fail acceptance test that the current build fails
0/18, and (3) a fantasy-ladder redesign that ties the letter to the scale metaphors the prose
already uses.

---

## Appendix — sources
- Cup = bust−band; 1″/cup (US/UK); cross-system per-inch table:
  [bra-calculator.com/size-charts](https://bra-calculator.com/size-charts/) ·
  [calculator.net bra-size](https://www.calculator.net/bra-size-calculator.html) ·
  [breakoutbras.com conversion-chart](https://www.breakoutbras.com/pages/conversion-chart)
- UK sequence (AA A B C D DD E F FF G GG H HH J JJ K…), "I" skipped:
  [thelingerieadvisor.com/bra-cup-size-chart](https://thelingerieadvisor.com/bra-cup-size-chart/) ·
  [en.wikipedia.org/wiki/Bra_size](https://en.wikipedia.org/wiki/Bra_size)
- EU/EN-13402 2 cm per cup, band rounded to nearest 5 cm; FR/BE/ES band = EU+15; AU switches to EU
  labels; JP/JIS 2.5 cm with AAA/AA below A: [en.wikipedia.org/wiki/Bra_size] ·
  [bra-calculator.com Japan calculator](https://bra-calculator.com/bra-size-calculators-by-country/japan-bra-size-calculator/)
- US↔UK divergence past D (US 34DD = UK 34E; US 34DDD = UK 34F):
  [thelingerieadvisor.com/uk-vs-us-bra-sizes](https://thelingerieadvisor.com/uk-vs-us-bra-sizes/) ·
  [bra-calculator.com/size-charts]
- Volume per cup / cc-per-cup / band dependence / sister sizes:
  [billysbras.com bra-size-cup-size-volume](https://billysbras.com/blogs/billys-bra-blog/understanding-the-relationship-between-bra-size-cup-size-and-breast-volume) ·
  [pacificaplasticsurgery.com implant-ccs-cup-sizes](https://www.pacificaplasticsurgery.com/blog/breast-implant-ccs-relate-cup-sizes/) ·
  [drkilleen.com how-many-cc-in-a-cup-size](https://drkilleen.com/blog/how-many-cc-in-a-cup-size) ·
  HauteFlair 34-band cc table (via prior audit) · Aesthetic Surgery Journal 2025 / PMC12448591 (sister-size + BMI > letter)
- Engine computations: `research/body-db/_cup_check.mjs` (verbatim-extracted alpha52/Ambrosia
  functions + candidate repair, run in Node).
