// GENERATED FILE — do not edit by hand. Regenerate via scripts/extract-ladder.mjs (v1 tables)
// then scripts/extract-ladder2.mjs (v2 measurement/label channels appended) from be-story-engine
// dist/ambrosia-v0.4.7.naiscript (the final validated NAI-era tables; see research/31a §2.2 and
// research/ladder-reanchor-proposal.md). Cup letters are NOT baked here anymore — they derive at
// runtime from the corrected bust-diff closed-form (research/38 C4; curves.ts).
// ⚠ Calibration note (research/34): these NAI band-word boundaries differ from the deployed
// bridge's _KREA_TIER_NOUNS anchors by roughly one band in the upper range. Prose uses THIS
// table; image marker emission stays band-word-driven (sizeBandMarker.ts) until the
// cross-calibration is ruled.

/** Size-only comparative prose, 51 bands, tier_max-keyed (nearest band at or above tier). */
export const COMPARATIVE_BANDS: ReadonlyArray<{
  readonly tierMax: number
  readonly description: string
}> = [
  {
    tierMax: 0,
    description:
      'a soft, rounded handful — a gentle weight that fills a cupped palm, warm and smooth, drawing a clear curve beneath her top',
  },
  {
    tierMax: 1,
    description:
      'a comfortable handful, round and warm, filling a hand with soft give and pressing a smooth swell into her clothes',
  },
  {
    tierMax: 2,
    description:
      'a full handful that more than fills a cupped palm, soft and rounded, with enough weight to settle into a waiting hand',
  },
  {
    tierMax: 3,
    description:
      'a generous handful brimming over the edge of a hand, their warm fullness drawing a clean, full line beneath her clothes',
  },
  {
    tierMax: 4,
    description:
      'overfilling a cupped hand now — soft, warm and round, with a pleasing heft that presses outward against fabric',
  },
  {
    tierMax: 5,
    description:
      'a ripe, rounded fullness more than a hand can hold, each its own soft, warm shape, firm and yielding under the fingertips',
  },
  {
    tierMax: 6,
    description:
      'full and rounded, a satisfying soft weight that more than fills a hand and presses warmly against the front of her top',
  },
  {
    tierMax: 7,
    description:
      'more than a handful — full and heavy, each filling a hand to overflowing with a soft, warm weight that rounds out her top',
  },
  {
    tierMax: 8,
    description:
      'a generous rounded weight that spills past a gripping hand, pressing a clear, full curve into whatever she wears',
  },
  {
    tierMax: 9,
    description:
      'large and full now — each overflows a cupped hand, a soft heavy warmth that deepens the line of her cleavage',
  },
  {
    tierMax: 10,
    description:
      'full and heavy, a soft pillowy weight that spills well past a gripping hand, drawing a warm valley between them',
  },
  {
    tierMax: 11,
    description:
      'voluptuous and weighty — too full for one hand to hold, their soft heaviness tugging at the neckline of her top',
  },
  {
    tierMax: 12,
    description:
      'heavy and rounded, each a warm mass a single hand can no longer contain, their weight a steady, pleasant pull on her shoulders',
  },
  {
    tierMax: 13,
    description:
      'large enough that cradling one takes both hands, their soft heavy fullness filling out every garment she owns',
  },
  {
    tierMax: 14,
    description:
      'a generous both-hands weight apiece, heavy enough to feel by evening, full and warm and impossible to overlook',
  },
  {
    tierMax: 15,
    description:
      'their heaviness hard to ignore now — each a soft, full globe heavy enough to pull steadily at her shoulders',
  },
  {
    tierMax: 16,
    description:
      'each a heavy mass wider than a spread hand, full and warm, their weight drawing her neckline into a deep valley',
  },
  {
    tierMax: 17,
    description:
      'full and substantial — her arms move around them now, each a soft heavy globe of warm, dense flesh',
  },
  {
    tierMax: 18,
    description:
      'heavy enough to reshape her silhouette, each a warm, dense mass that strains the seams of anything fitted',
  },
  {
    tierMax: 19,
    description:
      'so full and heavy her arms no longer fall straight at her sides, each a warm, dense mass always present to her',
  },
  {
    tierMax: 20,
    description:
      'as wide as both her hands pressed together, each a swollen, heavy weight that is a constant presence on her frame',
  },
  {
    tierMax: 21,
    description:
      'ripe and burdensome, each a heavy weight she is always aware of, dense and full beneath any garment',
  },
  {
    tierMax: 22,
    description:
      'each a heavy, warm weight that has become the center of her balance, dense and full and demanding of every garment',
  },
  {
    tierMax: 23,
    description:
      'each as heavy as a full waterskin, their dense warmth a steady burden that draws her shoulders into a faint bow',
  },
  {
    tierMax: 24,
    description:
      'enormous — each more than her forearms can gather, a soft heavy bulk present in every motion she makes',
  },
  {
    tierMax: 25,
    description:
      'swelling toward the size of her own head, each too weighty to bear up for long, a relentless, patient fullness',
  },
  {
    tierMax: 26,
    description:
      'each the size of her head now, a steady burden that draws her shoulders forward, their warm bulk impossible to ignore',
  },
  {
    tierMax: 27,
    description:
      'impossible to hold up without support, each a deep mound of dense flesh that claims her whole chest and upper body',
  },
  {
    tierMax: 29,
    description:
      'larger than her head and inescapable, each a heavy bulk that dictates how she holds herself',
  },
  {
    tierMax: 31,
    description:
      'each a ponderous globe broader than her head, a warm heavy mass her arms can no longer fold over',
  },
  {
    tierMax: 33,
    description:
      'vast and overwhelming — each more than she can lift on her own, a dense immensity that drapes across her forearms',
  },
  {
    tierMax: 35,
    description:
      'each grown too wide for her arms to encircle, their weight curving her spine forward, broader than her head and still climbing',
  },
  {
    tierMax: 37,
    description:
      'staggering — each a great cushion of warm flesh heavier than she can raise, their bulk reshaping how she carries herself',
  },
  {
    tierMax: 39,
    description:
      'she can no longer rise without bracing against them, each a massive weight pressing outward, broader than her shoulders',
  },
  {
    tierMax: 41,
    description:
      'immense — neither can be lifted by a single arm, each a vast warm mass grown as broad as her own torso',
  },
  {
    tierMax: 43,
    description:
      'to sit she needs a wide, low seat to bear their immensity — each a heavy bulk broader than her hips',
  },
  {
    tierMax: 45,
    description:
      'monumental, each broader and heavier than her head, their joined weight a fixed anchor she carries everywhere',
  },
  {
    tierMax: 47,
    description:
      'each a tower of warm flesh past any solo lifting, broader than her torso — less a part of her than the bulk she carries before her',
  },
  {
    tierMax: 49,
    description:
      'past anything her frame was built to bear, each spanning wider than her shoulders, a dense immensity that dwarfs the rest of her',
  },
  {
    tierMax: 51,
    description:
      'each heavier than she can raise and broader than her own body — far and away the greatest part of her',
  },
  {
    tierMax: 58,
    description:
      'each a vast, dense weight that comes to rest on whatever surface is beneath her by sheer size, larger than her torso',
  },
  {
    tierMax: 66,
    description:
      'colossal — each broader than her shoulders and heavier than her whole torso, a warm immensity she must arrange around herself to sit',
  },
  {
    tierMax: 74,
    description:
      'titanic, each wider than she is across and heavier than the rest of her body combined, a weight that governs her every motion',
  },
  {
    tierMax: 82,
    description:
      'each a breathing immensity broader than her shoulders and heavier than her whole frame — gigantic past any ordinary scale, yet still warm flesh she carries on her own body',
  },
  {
    tierMax: 92,
    description:
      'each outweighs her torso now, a vast warm bulk so large that shifting one takes both her arms and the whole of her balance',
  },
  {
    tierMax: 105,
    description:
      'her own body has become the smaller part of her — each a swollen mass that outweighs her, dense and warm and immense',
  },
  {
    tierMax: 120,
    description:
      'each a soft mountain of warm flesh that fills the space a great chair would occupy, the furniture beneath her groaning at the weight',
  },
  {
    tierMax: 140,
    description:
      'furniture buckles and floors bow beneath them — each claims the footprint of a wide seat, pressing outward against the walls of any small room',
  },
  {
    tierMax: 165,
    description:
      'she can neither see past them nor reach around them — each is the whole of her forward horizon, vast and warm and inescapable',
  },
  {
    tierMax: 200,
    description:
      'room-filling — they press against every wall, the soft bulk seeking out every corner, the architecture itself straining to contain their weight',
  },
  {
    tierMax: Infinity,
    description:
      'vast beyond any mortal scale — each a swollen continent of living flesh that swallows the furniture and floods the room entire, her own small body a forgotten origin within their immensity',
  },
]

/** Prose band-word thresholds (NAI tierToCupTag convention). */
export const BAND_WORD_THRESHOLDS: ReadonlyArray<{
  readonly minTier: number
  readonly word: string
}> = [
  {
    minTier: 0,
    word: 'flat chest',
  },
  {
    minTier: 1,
    word: 'small breasts',
  },
  {
    minTier: 4,
    word: 'medium breasts',
  },
  {
    minTier: 14,
    word: 'large breasts',
  },
  {
    minTier: 22,
    word: 'huge breasts',
  },
  {
    minTier: 30,
    word: 'gigantic breasts',
  },
  {
    minTier: 40,
    word: 'hyper breasts',
  },
]

// ── D4 depth-(b) measurement channels (research/35 §3) — generated by extract-ladder2.mjs ──
// Baked by driving the v0.4.7 compute_body_snapshot at the reference frame
// (H=165, build 'average'); label text is verbatim NAI. Runtime code implements
// only the two 1-D curves from MEASUREMENT_CONSTANTS; everything else is lookup.

/** The exact NAI curve constants (weight quadratic, capacity, body-weight estimate). */
export const MEASUREMENT_CONSTANTS = {
  baseWeightConst: 0.18,
  baseWeightLinear: 0.055,
  baseWeightQuad: 0.002,
  tissueDensityKgPerCm3: 0.00095,
  milkFraction: 0.4,
  milkDensity: 1.03,
  refHeightCm: 165,
  bodyWeightHeightFactor: 0.4,
  bodyWeightHeightOffset: 8,
  buildWeightMods: {
    petite: -8,
    slim: -4,
    average: 0,
    curvy: 4,
    athletic: 3,
    full: 8,
  },
} as const

/** Per-shape body rows: posture/mobility/clothing + shape descriptor + hang phrase (minTier thresholds). */
export const BODY_ROWS_BY_SHAPE: Readonly<
  Record<
    'natural' | 'firm' | 'gravity_defying',
    ReadonlyArray<{
      readonly minTier: number
      readonly posture: string
      readonly mobility: string
      readonly clothing: string
      readonly shape: string
      readonly hang: string
    }>
  >
> = {
  natural: [
    {
      minTier: 0,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape:
        'perky and buoyant, sitting high with a firm forward curve and only the faintest underswell',
      hang: '',
    },
    {
      minTier: 4,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: '',
    },
    {
      minTier: 9,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 14,
      posture: 'noticeable forward lean',
      mobility: 'mild encumbrance',
      clothing: 'standard fits with strain',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 15,
      posture: 'noticeable forward lean',
      mobility: 'mild encumbrance',
      clothing: 'standard fits with strain',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 16,
      posture: 'pronounced forward arch',
      mobility: 'encumbered, support recommended',
      clothing: 'requires custom',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 19,
      posture: 'profound permanent arch',
      mobility: 'significantly encumbered',
      clothing: 'custom only',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 24,
      posture: 'spine bowed under weight',
      mobility: 'requires support for sustained activity',
      clothing: 'bespoke / specialty only',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 30,
      posture: 'structurally dominated',
      mobility: 'mobility severely limited',
      clothing: 'impossible to clothe conventionally',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 31,
      posture: 'structurally dominated',
      mobility: 'mobility severely limited',
      clothing: 'impossible to clothe conventionally',
      shape: 'pendulous, hanging low under their own weight, nipples drawn downward',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 38,
      posture: 'body secondary to breasts',
      mobility: 'essentially immobile without aid',
      clothing: 'draped or wrapped only',
      shape: 'pendulous, hanging low under their own weight, nipples drawn downward',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 42,
      posture: 'body secondary to breasts',
      mobility: 'essentially immobile without aid',
      clothing: 'draped or wrapped only',
      shape: 'pendulous, hanging low under their own weight, nipples drawn downward',
      hang: 'hanging to her lap, their undersides meeting her thighs when she sits',
    },
    {
      minTier: 49,
      posture: 'vestigial beneath their mass',
      mobility: 'stationary',
      clothing: 'nothing conceals them',
      shape: 'pendulous, hanging low under their own weight, nipples drawn downward',
      hang: 'hanging to her lap, their undersides meeting her thighs when she sits',
    },
    {
      minTier: 62,
      posture: 'vestigial beneath their mass',
      mobility: 'stationary',
      clothing: 'nothing conceals them',
      shape: 'deeply pendulous, the bulk pulled steeply downward, hanging far below the crease',
      hang: 'hanging to her lap, their undersides meeting her thighs when she sits',
    },
    {
      minTier: 69,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'deeply pendulous, the bulk pulled steeply downward, hanging far below the crease',
      hang: 'hanging to her lap, their undersides meeting her thighs when she sits',
    },
    {
      minTier: 75,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'deeply pendulous, the bulk pulled steeply downward, hanging far below the crease',
      hang: 'hanging past her lap toward her knees when she sits',
    },
    {
      minTier: 122,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'deeply pendulous, the bulk pulled steeply downward, hanging far below the crease',
      hang: 'hanging to her knees, filling her lap when she is seated',
    },
    {
      minTier: 208,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'deeply pendulous, the bulk pulled steeply downward, hanging far below the crease',
      hang: 'hanging past her knees, their undersides reaching the floor when she kneels',
    },
  ],
  firm: [
    {
      minTier: 0,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 1,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape:
        'perky and buoyant, sitting high with a firm forward curve and only the faintest underswell',
      hang: '',
    },
    {
      minTier: 12,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: '',
    },
    {
      minTier: 14,
      posture: 'noticeable forward lean',
      mobility: 'mild encumbrance',
      clothing: 'standard fits with strain',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: '',
    },
    {
      minTier: 17,
      posture: 'pronounced forward arch',
      mobility: 'encumbered, support recommended',
      clothing: 'requires custom',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: '',
    },
    {
      minTier: 22,
      posture: 'profound permanent arch',
      mobility: 'significantly encumbered',
      clothing: 'custom only',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: '',
    },
    {
      minTier: 25,
      posture: 'profound permanent arch',
      mobility: 'significantly encumbered',
      clothing: 'custom only',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 28,
      posture: 'spine bowed under weight',
      mobility: 'requires support for sustained activity',
      clothing: 'bespoke / specialty only',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 35,
      posture: 'structurally dominated',
      mobility: 'mobility severely limited',
      clothing: 'impossible to clothe conventionally',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: 'their lowest curve resting against her upper belly',
    },
    {
      minTier: 40,
      posture: 'structurally dominated',
      mobility: 'mobility severely limited',
      clothing: 'impossible to clothe conventionally',
      shape: 'full and natural, settling into a soft teardrop with a gentle undercurve beneath',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 43,
      posture: 'body secondary to breasts',
      mobility: 'essentially immobile without aid',
      clothing: 'draped or wrapped only',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 56,
      posture: 'vestigial beneath their mass',
      mobility: 'stationary',
      clothing: 'nothing conceals them',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging to her navel, their soft weight against her belly',
    },
    {
      minTier: 73,
      posture: 'vestigial beneath their mass',
      mobility: 'stationary',
      clothing: 'nothing conceals them',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging to her lap, their undersides meeting her thighs when she sits',
    },
    {
      minTier: 79,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging to her lap, their undersides meeting her thighs when she sits',
    },
    {
      minTier: 139,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'heavy and settled, their weight drawing them into a low, soft hang',
      hang: 'hanging past her lap toward her knees when she sits',
    },
    {
      minTier: 196,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'pendulous, hanging low under their own weight, nipples drawn downward',
      hang: 'hanging past her lap toward her knees when she sits',
    },
    {
      minTier: 240,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape: 'pendulous, hanging low under their own weight, nipples drawn downward',
      hang: 'hanging to her knees, filling her lap when she is seated',
    },
  ],
  gravity_defying: [
    {
      minTier: 0,
      posture: 'unaffected',
      mobility: 'unaffected',
      clothing: 'standard fits',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 17,
      posture: 'noticeable forward lean',
      mobility: 'mild encumbrance',
      clothing: 'standard fits with strain',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 22,
      posture: 'pronounced forward arch',
      mobility: 'encumbered, support recommended',
      clothing: 'requires custom',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 28,
      posture: 'profound permanent arch',
      mobility: 'significantly encumbered',
      clothing: 'custom only',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 36,
      posture: 'spine bowed under weight',
      mobility: 'requires support for sustained activity',
      clothing: 'bespoke / specialty only',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 45,
      posture: 'structurally dominated',
      mobility: 'mobility severely limited',
      clothing: 'impossible to clothe conventionally',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 55,
      posture: 'body secondary to breasts',
      mobility: 'essentially immobile without aid',
      clothing: 'draped or wrapped only',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 71,
      posture: 'vestigial beneath their mass',
      mobility: 'stationary',
      clothing: 'nothing conceals them',
      shape:
        'gravity-defying — held high and proud, projecting forward with no sag, nipples level or tilted upward',
      hang: '',
    },
    {
      minTier: 89,
      posture: 'vestigial beneath their mass',
      mobility: 'stationary',
      clothing: 'nothing conceals them',
      shape:
        'perky and buoyant, sitting high with a firm forward curve and only the faintest underswell',
      hang: '',
    },
    {
      minTier: 99,
      posture: 'body exists only as origin',
      mobility: 'immobile — she IS her breasts',
      clothing: 'irrelevant',
      shape:
        'perky and buoyant, sitting high with a firm forward curve and only the faintest underswell',
      hang: '',
    },
  ],
}

/** Weight-feel label ladder (NAI weightRef), keyed on kg per side. */
export const WEIGHT_FEEL_THRESHOLDS: ReadonlyArray<{
  readonly minKgPerSide: number
  readonly text: string
}> = [
  {
    minKgPerSide: 0,
    text: '',
  },
  {
    minKgPerSide: 0.5,
    text: 'a pleasant, noticeable heft',
  },
  {
    minKgPerSide: 1,
    text: 'heavy enough to ache when unsupported',
  },
  {
    minKgPerSide: 3,
    text: 'too heavy to hold up with one hand',
  },
  {
    minKgPerSide: 7,
    text: 'heavier than she can comfortably lift',
  },
  {
    minKgPerSide: 15,
    text: 'impossible to carry without support',
  },
  {
    minKgPerSide: 30,
    text: 'her body strains beneath their mass',
  },
  {
    minKgPerSide: 60,
    text: 'each outweighs her entire torso',
  },
]

/** Proportion label ladder (NAI bodyPctNote), keyed on breast-mass % of body weight. */
export const PROPORTION_THRESHOLDS: ReadonlyArray<{
  readonly minPct: number
  readonly text: string
}> = [
  {
    minPct: 0,
    text: '',
  },
  {
    minPct: 3,
    text: 'a noticeable presence on her frame',
  },
  {
    minPct: 8,
    text: 'they are becoming more of her',
  },
  {
    minPct: 15,
    text: 'she carries as much breast as body',
  },
  {
    minPct: 25,
    text: 'she is more breast than woman now',
  },
  {
    minPct: 40,
    text: 'her body exists only to carry them',
  },
  {
    minPct: 60,
    text: 'they ARE her — her body is an afterthought beneath their mass',
  },
]

/** Fluid-pressure (skin tension) ladder keyed on fill percent — verified tier-independent. */
export const SKIN_TENSION_THRESHOLDS: ReadonlyArray<{
  readonly minFillPercent: number
  readonly text: string
}> = [
  {
    minFillPercent: 0,
    text: 'skin soft, supple, and fully accommodated to her size',
  },
  {
    minFillPercent: 50,
    text: 'skin stretched smooth and taut, faint veins visible beneath the surface',
  },
  {
    minFillPercent: 90,
    text: 'skin drum-tight with internal pressure, hot to the touch, aching for relief',
  },
]

/** Droop / hang depth (cm) per tier, per shape, at empty and 100% fill — index = tier, saturating at the last entry. */
export const DROOP_CM_CURVES: Readonly<
  Record<
    'natural' | 'firm' | 'gravity_defying',
    { readonly empty: ReadonlyArray<number>; readonly full: ReadonlyArray<number> }
  >
> = {
  natural: {
    empty: [
      1.6, 2.1, 2.5, 3, 3.5, 4, 4.5, 5.1, 5.6, 6.1, 6.7, 7.2, 7.7, 8.3, 8.8, 9.4, 9.9, 10.5, 11,
      11.6, 12.2, 12.7, 13.3, 13.8, 14.4, 14.9, 15.5, 16, 16.6, 17.1, 17.7, 18.2, 18.8, 19.3, 19.9,
      20.4, 21, 21.5, 22, 22.6, 23.1, 23.6, 24.1, 24.7, 25.2, 25.7, 26.2, 26.7, 27.3, 27.8, 28.3,
      28.8, 29.3, 29.8, 30.3, 30.8, 31.3, 31.8, 32.3, 32.8, 33.3, 33.7, 34.2, 34.7, 35.2, 35.7,
      36.1, 36.6, 37.1, 37.6, 38, 38.5, 39, 39.4, 39.9, 40.3, 40.8, 41.2, 41.7, 42.2, 42.6, 43.1,
      43.5, 43.9, 44.4, 44.8, 45.3, 45.7, 46.1, 46.6, 47, 47.4, 47.9, 48.3, 48.7, 49.1, 49.6, 50,
      50.4, 50.8, 51.3, 51.7, 52.1, 52.5, 52.9, 53.3, 53.7, 54.1, 54.5, 54.9, 55.4, 55.8, 56.2,
      56.6, 57, 57.4, 57.7, 58.1, 58.5, 58.9, 59.3, 59.7, 60.1, 60.5, 60.9, 61.3, 61.6, 62, 62.4,
      62.8, 63.2, 63.6, 63.9, 64.3, 64.7, 65.1, 65.4, 65.8, 66.2, 66.5, 66.9, 67.3, 67.7, 68, 68.4,
      68.7, 69.1, 69.5, 69.8, 70.2, 70.6, 70.9, 71.3, 71.6, 72, 72.3, 72.7, 73.1, 73.4, 73.8, 74.1,
      74.5, 74.8, 75.2, 75.5, 75.9, 76.2, 76.6, 76.9, 77.2, 77.6, 77.9, 78.3, 78.6, 79, 79.3, 79.6,
      80, 80.3, 80.6, 81, 81.3, 81.6, 82, 82.3, 82.6, 83, 83.3, 83.6, 84, 84.3, 84.6, 85, 85.3,
      85.6, 85.9, 86.3, 86.6, 86.9, 87.2, 87.6, 87.9, 88.2, 88.5, 88.8, 89.2, 89.5, 89.8, 90.1,
      90.4, 90.8, 91.1, 91.4, 91.7, 92, 92.3, 92.6, 93, 93.3, 93.6, 93.9, 94.2, 94.5, 94.8, 95.1,
      95.4, 95.7, 96.1, 96.4, 96.7, 97, 97.3, 97.6, 97.9, 98.2, 98.5, 98.8, 99.1, 99.4, 99.7, 100,
      100.3, 100.6, 100.9, 101.2, 101.5, 101.8, 102.1, 102.4, 102.7, 103, 103.3, 103.6, 103.9,
      104.2, 104.5, 104.8, 105.1, 105.4, 105.6, 105.9, 106.2, 106.5, 106.8, 107.1, 107.4, 107.7,
      108, 108.3, 108.5, 108.8, 109.1, 109.4, 109.7, 110, 110.3, 110.6, 110.8, 111.1, 111.4, 111.7,
      112, 112.3, 112.5, 112.8, 113.1, 113.4, 113.7, 114, 114.2, 114.5, 114.8, 115.1, 115.4, 115.6,
      115.9, 116.2, 116.5, 116.7, 117, 117.3,
    ],
    full: [
      1.8, 2.3, 2.8, 3.4, 3.9, 4.5, 5.1, 5.7, 6.3, 6.8, 7.4, 8.1, 8.7, 9.3, 9.9, 10.5, 11.1, 11.7,
      12.4, 13, 13.6, 14.2, 14.8, 15.5, 16.1, 16.7, 17.3, 17.9, 18.6, 19.2, 19.8, 20.4, 21, 21.6,
      22.2, 22.8, 23.4, 24, 24.6, 25.2, 25.8, 26.4, 27, 27.6, 28.2, 28.8, 29.3, 29.9, 30.5, 31.1,
      31.6, 32.2, 32.8, 33.3, 33.9, 34.4, 35, 35.6, 36.1, 36.7, 37.2, 37.7, 38.3, 38.8, 39.4, 39.9,
      40.4, 41, 41.5, 42, 42.5, 43.1, 43.6, 44.1, 44.6, 45.1, 45.6, 46.1, 46.7, 47.2, 47.7, 48.2,
      48.7, 49.2, 49.7, 50.1, 50.6, 51.1, 51.6, 52.1, 52.6, 53.1, 53.5, 54, 54.5, 55, 55.5, 55.9,
      56.4, 56.9, 57.3, 57.8, 58.3, 58.7, 59.2, 59.6, 60.1, 60.6, 61, 61.5, 61.9, 62.4, 62.8, 63.3,
      63.7, 64.2, 64.6, 65, 65.5, 65.9, 66.4, 66.8, 67.2, 67.7, 68.1, 68.5, 69, 69.4, 69.8, 70.2,
      70.7, 71.1, 71.5, 71.9, 72.4, 72.8, 73.2, 73.6, 74, 74.4, 74.9, 75.3, 75.7, 76.1, 76.5, 76.9,
      77.3, 77.7, 78.1, 78.5, 78.9, 79.3, 79.7, 80.1, 80.5, 80.9, 81.3, 81.7, 82.1, 82.5, 82.9,
      83.3, 83.7, 84.1, 84.5, 84.9, 85.2, 85.6, 86, 86.4, 86.8, 87.2, 87.6, 87.9, 88.3, 88.7, 89.1,
      89.5, 89.8, 90.2, 90.6, 91, 91.3, 91.7, 92.1, 92.5, 92.8, 93.2, 93.6, 93.9, 94.3, 94.7, 95,
      95.4, 95.8, 96.1, 96.5, 96.9, 97.2, 97.6, 98, 98.3, 98.7, 99, 99.4, 99.7, 100.1, 100.5, 100.8,
      101.2, 101.5, 101.9, 102.2, 102.6, 102.9, 103.3, 103.6, 104, 104.3, 104.7, 105, 105.4, 105.7,
      106.1, 106.4, 106.8, 107.1, 107.5, 107.8, 108.1, 108.5, 108.8, 109.2, 109.5, 109.9, 110.2,
      110.5, 110.9, 111.2, 111.5, 111.9, 112.2, 112.6, 112.9, 113.2, 113.6, 113.9, 114.2, 114.6,
      114.9, 115.2, 115.6, 115.9, 116.2, 116.5, 116.9, 117.2, 117.5, 117.9, 118.2, 118.5, 118.8,
      119.2, 119.5, 119.8, 120.1, 120.5, 120.8, 121.1, 121.4, 121.8, 122.1, 122.4, 122.7, 123,
      123.4, 123.7, 124, 124.3, 124.6, 125, 125.3, 125.6, 125.9, 126.2, 126.5, 126.9, 127.2, 127.5,
      127.8, 128.1, 128.4, 128.7, 129, 129.4, 129.7, 130, 130.3, 130.6, 130.9, 131.2,
    ],
  },
  firm: {
    empty: [
      1, 1.3, 1.6, 1.9, 2.2, 2.5, 2.8, 3.1, 3.4, 3.8, 4.1, 4.4, 4.8, 5.1, 5.4, 5.8, 6.1, 6.4, 6.8,
      7.1, 7.5, 7.8, 8.2, 8.5, 8.8, 9.2, 9.5, 9.9, 10.2, 10.5, 10.9, 11.2, 11.5, 11.9, 12.2, 12.5,
      12.8, 13.2, 13.5, 13.8, 14.1, 14.5, 14.8, 15.1, 15.4, 15.7, 16, 16.4, 16.7, 17, 17.3, 17.6,
      17.9, 18.2, 18.5, 18.8, 19.1, 19.4, 19.7, 20, 20.3, 20.6, 20.9, 21.2, 21.4, 21.7, 22, 22.3,
      22.6, 22.9, 23.1, 23.4, 23.7, 24, 24.3, 24.5, 24.8, 25.1, 25.4, 25.6, 25.9, 26.2, 26.4, 26.7,
      27, 27.2, 27.5, 27.7, 28, 28.3, 28.5, 28.8, 29, 29.3, 29.5, 29.8, 30.1, 30.3, 30.6, 30.8,
      31.1, 31.3, 31.6, 31.8, 32, 32.3, 32.5, 32.8, 33, 33.3, 33.5, 33.7, 34, 34.2, 34.5, 34.7,
      34.9, 35.2, 35.4, 35.6, 35.9, 36.1, 36.3, 36.6, 36.8, 37, 37.2, 37.5, 37.7, 37.9, 38.2, 38.4,
      38.6, 38.8, 39.1, 39.3, 39.5, 39.7, 39.9, 40.2, 40.4, 40.6, 40.8, 41, 41.3, 41.5, 41.7, 41.9,
      42.1, 42.3, 42.5, 42.8, 43, 43.2, 43.4, 43.6, 43.8, 44, 44.2, 44.5, 44.7, 44.9, 45.1, 45.3,
      45.5, 45.7, 45.9, 46.1, 46.3, 46.5, 46.7, 46.9, 47.1, 47.3, 47.5, 47.7, 47.9, 48.1, 48.3,
      48.5, 48.7, 48.9, 49.1, 49.3, 49.5, 49.7, 49.9, 50.1, 50.3, 50.5, 50.7, 50.9, 51.1, 51.3,
      51.5, 51.7, 51.9, 52.1, 52.3, 52.5, 52.6, 52.8, 53, 53.2, 53.4, 53.6, 53.8, 54, 54.2, 54.4,
      54.5, 54.7, 54.9, 55.1, 55.3, 55.5, 55.7, 55.9, 56, 56.2, 56.4, 56.6, 56.8, 57, 57.1, 57.3,
      57.5, 57.7, 57.9, 58.1, 58.2, 58.4, 58.6, 58.8, 59, 59.2, 59.3, 59.5, 59.7, 59.9, 60, 60.2,
      60.4, 60.6, 60.8, 60.9, 61.1, 61.3, 61.5, 61.6, 61.8, 62, 62.2, 62.4, 62.5, 62.7, 62.9, 63,
      63.2, 63.4, 63.6, 63.7, 63.9, 64.1, 64.3, 64.4, 64.6, 64.8, 65, 65.1, 65.3, 65.5, 65.6, 65.8,
      66, 66.1, 66.3, 66.5, 66.7, 66.8, 67, 67.2, 67.3, 67.5, 67.7, 67.8, 68, 68.2, 68.3, 68.5,
      68.7, 68.8, 69, 69.2, 69.3, 69.5, 69.7, 69.8, 70, 70.2, 70.3,
    ],
    full: [
      1.1, 1.4, 1.7, 2.1, 2.4, 2.8, 3.1, 3.5, 3.8, 4.2, 4.6, 4.9, 5.3, 5.7, 6.1, 6.5, 6.8, 7.2, 7.6,
      8, 8.4, 8.7, 9.1, 9.5, 9.9, 10.3, 10.6, 11, 11.4, 11.8, 12.1, 12.5, 12.9, 13.3, 13.6, 14,
      14.4, 14.7, 15.1, 15.5, 15.8, 16.2, 16.5, 16.9, 17.2, 17.6, 17.9, 18.3, 18.6, 19, 19.3, 19.7,
      20, 20.4, 20.7, 21, 21.4, 21.7, 22, 22.4, 22.7, 23, 23.3, 23.7, 24, 24.3, 24.6, 24.9, 25.3,
      25.6, 25.9, 26.2, 26.5, 26.8, 27.1, 27.4, 27.8, 28.1, 28.4, 28.7, 29, 29.3, 29.6, 29.9, 30.2,
      30.5, 30.7, 31, 31.3, 31.6, 31.9, 32.2, 32.5, 32.8, 33.1, 33.3, 33.6, 33.9, 34.2, 34.5, 34.7,
      35, 35.3, 35.6, 35.8, 36.1, 36.4, 36.7, 36.9, 37.2, 37.5, 37.7, 38, 38.3, 38.5, 38.8, 39.1,
      39.3, 39.6, 39.9, 40.1, 40.4, 40.6, 40.9, 41.2, 41.4, 41.7, 41.9, 42.2, 42.4, 42.7, 42.9,
      43.2, 43.4, 43.7, 43.9, 44.2, 44.4, 44.7, 44.9, 45.2, 45.4, 45.7, 45.9, 46.2, 46.4, 46.6,
      46.9, 47.1, 47.4, 47.6, 47.8, 48.1, 48.3, 48.6, 48.8, 49, 49.3, 49.5, 49.7, 50, 50.2, 50.4,
      50.7, 50.9, 51.1, 51.4, 51.6, 51.8, 52, 52.3, 52.5, 52.7, 53, 53.2, 53.4, 53.6, 53.9, 54.1,
      54.3, 54.5, 54.7, 55, 55.2, 55.4, 55.6, 55.9, 56.1, 56.3, 56.5, 56.7, 57, 57.2, 57.4, 57.6,
      57.8, 58, 58.3, 58.5, 58.7, 58.9, 59.1, 59.3, 59.5, 59.8, 60, 60.2, 60.4, 60.6, 60.8, 61,
      61.2, 61.4, 61.7, 61.9, 62.1, 62.3, 62.5, 62.7, 62.9, 63.1, 63.3, 63.5, 63.7, 63.9, 64.1,
      64.3, 64.5, 64.8, 65, 65.2, 65.4, 65.6, 65.8, 66, 66.2, 66.4, 66.6, 66.8, 67, 67.2, 67.4,
      67.6, 67.8, 68, 68.2, 68.4, 68.6, 68.8, 69, 69.2, 69.4, 69.6, 69.8, 69.9, 70.1, 70.3, 70.5,
      70.7, 70.9, 71.1, 71.3, 71.5, 71.7, 71.9, 72.1, 72.3, 72.5, 72.7, 72.9, 73, 73.2, 73.4, 73.6,
      73.8, 74, 74.2, 74.4, 74.6, 74.8, 74.9, 75.1, 75.3, 75.5, 75.7, 75.9, 76.1, 76.3, 76.4, 76.6,
      76.8, 77, 77.2, 77.4, 77.6, 77.7, 77.9, 78.1, 78.3, 78.5, 78.7,
    ],
  },
  gravity_defying: {
    empty: [
      0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.8, 0.8, 0.9, 0.9, 1, 1.1, 1.1, 1.2,
      1.2, 1.3, 1.4, 1.4, 1.5, 1.6, 1.6, 1.7, 1.7, 1.8, 1.9, 1.9, 2, 2, 2.1, 2.2, 2.2, 2.3, 2.3,
      2.4, 2.4, 2.5, 2.6, 2.6, 2.7, 2.7, 2.8, 2.8, 2.9, 3, 3, 3.1, 3.1, 3.2, 3.2, 3.3, 3.3, 3.4,
      3.4, 3.5, 3.6, 3.6, 3.7, 3.7, 3.8, 3.8, 3.9, 3.9, 4, 4, 4.1, 4.1, 4.2, 4.2, 4.3, 4.3, 4.4,
      4.4, 4.5, 4.5, 4.6, 4.6, 4.7, 4.7, 4.8, 4.8, 4.9, 4.9, 4.9, 5, 5, 5.1, 5.1, 5.2, 5.2, 5.3,
      5.3, 5.4, 5.4, 5.4, 5.5, 5.5, 5.6, 5.6, 5.7, 5.7, 5.8, 5.8, 5.8, 5.9, 5.9, 6, 6, 6.1, 6.1,
      6.1, 6.2, 6.2, 6.3, 6.3, 6.4, 6.4, 6.4, 6.5, 6.5, 6.6, 6.6, 6.6, 6.7, 6.7, 6.8, 6.8, 6.9, 6.9,
      6.9, 7, 7, 7.1, 7.1, 7.1, 7.2, 7.2, 7.2, 7.3, 7.3, 7.4, 7.4, 7.4, 7.5, 7.5, 7.6, 7.6, 7.6,
      7.7, 7.7, 7.7, 7.8, 7.8, 7.9, 7.9, 7.9, 8, 8, 8, 8.1, 8.1, 8.2, 8.2, 8.2, 8.3, 8.3, 8.3, 8.4,
      8.4, 8.5, 8.5, 8.5, 8.6, 8.6, 8.6, 8.7, 8.7, 8.7, 8.8, 8.8, 8.8, 8.9, 8.9, 9, 9, 9, 9.1, 9.1,
      9.1, 9.2, 9.2, 9.2, 9.3, 9.3, 9.3, 9.4, 9.4, 9.4, 9.5, 9.5, 9.5, 9.6, 9.6, 9.6, 9.7, 9.7, 9.7,
      9.8, 9.8, 9.8, 9.9, 9.9, 9.9, 10, 10, 10, 10.1, 10.1, 10.1, 10.2, 10.2, 10.2, 10.3, 10.3,
      10.3, 10.4, 10.4, 10.4, 10.5, 10.5, 10.5, 10.6, 10.6, 10.6, 10.7, 10.7, 10.7, 10.8, 10.8,
      10.8, 10.9, 10.9, 10.9, 11, 11, 11, 11, 11.1, 11.1, 11.1, 11.2, 11.2, 11.2, 11.3, 11.3, 11.3,
      11.4, 11.4, 11.4, 11.5, 11.5, 11.5, 11.5, 11.6, 11.6, 11.6, 11.7, 11.7, 11.7, 11.8, 11.8,
      11.8, 11.9, 11.9, 11.9, 11.9, 12, 12, 12, 12.1, 12.1, 12.1, 12.2, 12.2, 12.2, 12.2, 12.3,
      12.3, 12.3, 12.4, 12.4, 12.4, 12.4, 12.5, 12.5, 12.5, 12.6,
    ],
    full: [
      0.2, 0.2, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.7, 0.7, 0.8, 0.9, 0.9, 1, 1.1, 1.1, 1.2, 1.3, 1.3,
      1.4, 1.5, 1.5, 1.6, 1.7, 1.7, 1.8, 1.9, 1.9, 2, 2.1, 2.1, 2.2, 2.3, 2.3, 2.4, 2.5, 2.5, 2.6,
      2.7, 2.7, 2.8, 2.9, 2.9, 3, 3.1, 3.1, 3.2, 3.2, 3.3, 3.4, 3.4, 3.5, 3.6, 3.6, 3.7, 3.7, 3.8,
      3.9, 3.9, 4, 4, 4.1, 4.2, 4.2, 4.3, 4.3, 4.4, 4.4, 4.5, 4.6, 4.6, 4.7, 4.7, 4.8, 4.8, 4.9,
      4.9, 5, 5.1, 5.1, 5.2, 5.2, 5.3, 5.3, 5.4, 5.4, 5.5, 5.5, 5.6, 5.6, 5.7, 5.7, 5.8, 5.8, 5.9,
      5.9, 6, 6, 6.1, 6.1, 6.2, 6.2, 6.3, 6.3, 6.4, 6.4, 6.5, 6.5, 6.6, 6.6, 6.7, 6.7, 6.8, 6.8,
      6.9, 6.9, 7, 7, 7.1, 7.1, 7.2, 7.2, 7.3, 7.3, 7.3, 7.4, 7.4, 7.5, 7.5, 7.6, 7.6, 7.7, 7.7,
      7.8, 7.8, 7.8, 7.9, 7.9, 8, 8, 8.1, 8.1, 8.2, 8.2, 8.2, 8.3, 8.3, 8.4, 8.4, 8.5, 8.5, 8.5,
      8.6, 8.6, 8.7, 8.7, 8.8, 8.8, 8.8, 8.9, 8.9, 9, 9, 9, 9.1, 9.1, 9.2, 9.2, 9.3, 9.3, 9.3, 9.4,
      9.4, 9.5, 9.5, 9.5, 9.6, 9.6, 9.7, 9.7, 9.7, 9.8, 9.8, 9.9, 9.9, 9.9, 10, 10, 10.1, 10.1,
      10.1, 10.2, 10.2, 10.3, 10.3, 10.3, 10.4, 10.4, 10.4, 10.5, 10.5, 10.6, 10.6, 10.6, 10.7,
      10.7, 10.8, 10.8, 10.8, 10.9, 10.9, 10.9, 11, 11, 11.1, 11.1, 11.1, 11.2, 11.2, 11.2, 11.3,
      11.3, 11.3, 11.4, 11.4, 11.5, 11.5, 11.5, 11.6, 11.6, 11.6, 11.7, 11.7, 11.8, 11.8, 11.8,
      11.9, 11.9, 11.9, 12, 12, 12, 12.1, 12.1, 12.1, 12.2, 12.2, 12.3, 12.3, 12.3, 12.4, 12.4,
      12.4, 12.5, 12.5, 12.5, 12.6, 12.6, 12.6, 12.7, 12.7, 12.7, 12.8, 12.8, 12.8, 12.9, 12.9,
      12.9, 13, 13, 13.1, 13.1, 13.1, 13.2, 13.2, 13.2, 13.3, 13.3, 13.3, 13.4, 13.4, 13.4, 13.5,
      13.5, 13.5, 13.6, 13.6, 13.6, 13.7, 13.7, 13.7, 13.8, 13.8, 13.8, 13.9, 13.9, 13.9, 14, 14,
      14, 14.1,
    ],
  },
}

/** Golden snapshot fixtures at anchor tiers (natural, empty, reference frame) for canaries. */
export const GOLDEN_MEASUREMENTS = [
  {
    tier: 13,
    dryTotalKg: 2.47,
    capacityTotalMl: 1038.3,
    bodyPct: 4.1,
    droopCm: 8.3,
  },
  {
    tier: 31,
    dryTotalKg: 7.61,
    capacityTotalMl: 3205.9,
    bodyPct: 11.6,
    droopCm: 18.2,
  },
  {
    tier: 47,
    dryTotalKg: 14.37,
    capacityTotalMl: 6048.8,
    bodyPct: 19.9,
    droopCm: 26.7,
  },
] as const
