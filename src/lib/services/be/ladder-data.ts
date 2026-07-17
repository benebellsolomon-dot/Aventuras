// GENERATED FILE — do not edit by hand. Regenerate via the ambrosia-st session scratchpad
// extract-ladder.mjs from be-story-engine dist/ambrosia-v0.4.7.naiscript (the final validated
// NAI-era tables; see ambrosia-st research/31a §2.2 and research/ladder-reanchor-proposal.md).
// Cup letters were baked by executing the NAI tier_index_to_letter (which rides the validated
// body math) — a static snapshot per decision D4-thin; if the D4 research rules "port the
// physics", replace this table with the live functions.
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

/** Cup letter thresholds (minTier → letter), saturating at the last entry. */
export const CUP_LETTER_THRESHOLDS: ReadonlyArray<{
  readonly minTier: number
  readonly cup: string
}> = [
  {
    minTier: 0,
    cup: 'C',
  },
  {
    minTier: 2,
    cup: 'D',
  },
  {
    minTier: 4,
    cup: 'DD',
  },
  {
    minTier: 7,
    cup: 'E',
  },
  {
    minTier: 9,
    cup: 'F',
  },
  {
    minTier: 11,
    cup: 'FF',
  },
  {
    minTier: 13,
    cup: 'G',
  },
  {
    minTier: 14,
    cup: 'GG',
  },
  {
    minTier: 16,
    cup: 'H',
  },
  {
    minTier: 18,
    cup: 'HH',
  },
  {
    minTier: 19,
    cup: 'J',
  },
  {
    minTier: 20,
    cup: 'JJ',
  },
  {
    minTier: 22,
    cup: 'K',
  },
  {
    minTier: 23,
    cup: 'KK',
  },
  {
    minTier: 24,
    cup: 'L',
  },
  {
    minTier: 26,
    cup: 'LL',
  },
  {
    minTier: 27,
    cup: 'M',
  },
  {
    minTier: 28,
    cup: 'MM',
  },
  {
    minTier: 29,
    cup: 'N',
  },
  {
    minTier: 30,
    cup: 'NN',
  },
  {
    minTier: 31,
    cup: 'O',
  },
  {
    minTier: 32,
    cup: 'OO',
  },
  {
    minTier: 33,
    cup: 'P',
  },
  {
    minTier: 34,
    cup: 'PP',
  },
  {
    minTier: 35,
    cup: 'Q',
  },
  {
    minTier: 36,
    cup: 'QQ',
  },
  {
    minTier: 37,
    cup: 'R',
  },
  {
    minTier: 38,
    cup: 'RR',
  },
  {
    minTier: 39,
    cup: 'S',
  },
  {
    minTier: 40,
    cup: 'SS',
  },
  {
    minTier: 41,
    cup: 'TT',
  },
  {
    minTier: 42,
    cup: 'U',
  },
  {
    minTier: 43,
    cup: 'UU',
  },
  {
    minTier: 44,
    cup: 'V',
  },
  {
    minTier: 45,
    cup: 'VV',
  },
  {
    minTier: 46,
    cup: 'WW',
  },
  {
    minTier: 47,
    cup: 'X',
  },
  {
    minTier: 48,
    cup: 'XX',
  },
  {
    minTier: 49,
    cup: 'YY',
  },
  {
    minTier: 50,
    cup: 'Z',
  },
  {
    minTier: 51,
    cup: 'ZZ',
  },
  {
    minTier: 52,
    cup: 'ZZ+',
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

/** Cup letter → canonical tier anchor (NAI tier_letter_to_index), for card seeding. */
export const LETTER_TO_TIER: Readonly<Record<string, number>> = {
  AA: 0,
  A: 0,
  B: 0,
  C: 1,
  D: 3,
  DD: 5,
  E: 8,
  F: 10,
  FF: 12,
  G: 13,
  GG: 15,
  H: 17,
  HH: 18,
  J: 19,
  JJ: 21,
  K: 22,
  KK: 23,
  L: 25,
  LL: 26,
  M: 27,
  MM: 28,
  N: 29,
  NN: 30,
  O: 31,
  OO: 32,
  P: 33,
  PP: 34,
  Q: 35,
  QQ: 36,
  R: 37,
  RR: 38,
  S: 39,
  SS: 40,
  T: 40,
  TT: 41,
  U: 42,
  UU: 43,
  V: 44,
  VV: 45,
  W: 45,
  WW: 46,
  X: 47,
  XX: 48,
  Y: 48,
  YY: 49,
  Z: 50,
  ZZ: 51,
}

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

/** Bust circumference (cm) per tier, per shape, at empty and 100% fill — index = tier, saturating at the last entry. */
export const BUST_CM_CURVES: Readonly<
  Record<
    'natural' | 'firm' | 'gravity_defying',
    { readonly empty: ReadonlyArray<number>; readonly full: ReadonlyArray<number> }
  >
> = {
  natural: {
    empty: [
      73.2, 74.3, 75.4, 76.5, 77.6, 78.7, 79.8, 80.9, 82, 83.2, 84.3, 85.5, 86.7, 87.9, 89.4, 90.7,
      91.6, 92.1, 92.4, 92.8, 93.2, 93.6, 93.9, 94.3, 94.6, 95, 95.3, 95.7, 96, 96.3, 96.7, 97,
      97.3, 97.6, 97.9, 98.2, 98.5, 98.8, 99.1, 99.4, 99.7, 100, 100.3, 100.6, 100.9, 101.1, 101.4,
      101.7, 102, 102.2, 102.5, 102.8, 103, 103.3, 103.6, 103.8, 104.1, 104.4, 104.6, 104.9, 105.1,
      105.4, 105.6, 105.9, 106.2, 106.4, 106.7, 106.9, 107.2, 107.4, 107.7, 107.9, 108.1, 108.4,
      108.6, 108.9, 109.1, 109.4, 109.6, 109.8, 110.1, 110.3, 110.6, 110.8, 111, 111.3, 111.5,
      111.7, 112, 112.2, 112.4, 112.7, 112.9, 113.1, 113.4, 113.6, 113.8, 114, 114.3, 114.5, 114.7,
      115, 115.2, 115.4, 115.6, 115.9, 116.1, 116.3, 116.5, 116.7, 117, 117.2, 117.4, 117.6, 117.9,
      118.1, 118.3, 118.5, 118.7, 118.9, 119.2, 119.4, 119.6, 119.8, 120, 120.2, 120.5, 120.7,
      120.9, 121.1, 121.3, 121.5, 121.7, 122, 122.2, 122.4, 122.6, 122.8, 123, 123.2, 123.4, 123.7,
      123.9, 124.1, 124.3, 124.5, 124.7, 124.9, 125.1, 125.3, 125.5, 125.7, 125.9, 126.1, 126.3,
      126.6, 126.8, 127, 127.2, 127.4, 127.6, 127.8, 128, 128.2, 128.4, 128.6, 128.8, 129, 129.2,
      129.4, 129.6, 129.8, 130, 130.2, 130.4, 130.6, 130.8, 131, 131.2, 131.4, 131.6, 131.8, 132,
      132.2, 132.4, 132.6, 132.8, 133, 133.2, 133.4, 133.6, 133.8, 133.9, 134.1, 134.3, 134.5,
      134.7, 134.9, 135.1, 135.3, 135.5, 135.7, 135.9, 136.1, 136.3, 136.5, 136.7, 136.8, 137,
      137.2, 137.4, 137.6, 137.8, 138, 138.2, 138.4, 138.6, 138.7, 138.9, 139.1, 139.3, 139.5,
      139.7, 139.9, 140.1, 140.2, 140.4, 140.6, 140.8, 141, 141.2, 141.4, 141.6, 141.7, 141.9,
      142.1, 142.3, 142.5, 142.7, 142.8, 143, 143.2, 143.4, 143.6, 143.8, 143.9, 144.1, 144.3,
      144.5, 144.7, 144.9, 145, 145.2, 145.4, 145.6, 145.8, 146, 146.1, 146.3, 146.5, 146.7, 146.9,
      147, 147.2, 147.4, 147.6, 147.8, 147.9, 148.1, 148.3, 148.5, 148.6, 148.8, 149, 149.2, 149.4,
      149.5, 149.7, 149.9, 150.1, 150.2, 150.4, 150.6, 150.8, 150.9, 151.1, 151.3, 151.5, 151.7,
      151.8, 152, 152.2, 152.3, 152.5, 152.7, 152.9, 153, 153.2, 153.4, 153.6, 153.7,
    ],
    full: [
      75.3, 76.7, 78, 79.4, 80.7, 82.1, 83.4, 84.8, 86.2, 87.6, 89.1, 91, 92.3, 93.1, 93.6, 94.1,
      94.6, 95.1, 95.5, 96, 96.4, 96.8, 97.2, 97.6, 98, 98.4, 98.8, 99.2, 99.6, 100, 100.3, 100.7,
      101, 101.4, 101.7, 102.1, 102.4, 102.7, 103.1, 103.4, 103.7, 104, 104.4, 104.7, 105, 105.3,
      105.6, 105.9, 106.2, 106.5, 106.8, 107.1, 107.4, 107.7, 108, 108.3, 108.6, 108.9, 109.2,
      109.5, 109.8, 110.1, 110.4, 110.6, 110.9, 111.2, 111.5, 111.8, 112, 112.3, 112.6, 112.9,
      113.1, 113.4, 113.7, 114, 114.2, 114.5, 114.8, 115, 115.3, 115.6, 115.8, 116.1, 116.4, 116.6,
      116.9, 117.2, 117.4, 117.7, 117.9, 118.2, 118.5, 118.7, 119, 119.2, 119.5, 119.7, 120, 120.3,
      120.5, 120.8, 121, 121.3, 121.5, 121.8, 122, 122.3, 122.5, 122.8, 123, 123.3, 123.5, 123.8,
      124, 124.3, 124.5, 124.7, 125, 125.2, 125.5, 125.7, 126, 126.2, 126.4, 126.7, 126.9, 127.2,
      127.4, 127.6, 127.9, 128.1, 128.4, 128.6, 128.8, 129.1, 129.3, 129.6, 129.8, 130, 130.3,
      130.5, 130.7, 131, 131.2, 131.4, 131.7, 131.9, 132.1, 132.4, 132.6, 132.8, 133.1, 133.3,
      133.5, 133.7, 134, 134.2, 134.4, 134.7, 134.9, 135.1, 135.3, 135.6, 135.8, 136, 136.2, 136.5,
      136.7, 136.9, 137.1, 137.4, 137.6, 137.8, 138, 138.3, 138.5, 138.7, 138.9, 139.2, 139.4,
      139.6, 139.8, 140, 140.3, 140.5, 140.7, 140.9, 141.1, 141.4, 141.6, 141.8, 142, 142.2, 142.4,
      142.7, 142.9, 143.1, 143.3, 143.5, 143.7, 144, 144.2, 144.4, 144.6, 144.8, 145, 145.3, 145.5,
      145.7, 145.9, 146.1, 146.3, 146.5, 146.7, 147, 147.2, 147.4, 147.6, 147.8, 148, 148.2, 148.4,
      148.6, 148.9, 149.1, 149.3, 149.5, 149.7, 149.9, 150.1, 150.3, 150.5, 150.7, 150.9, 151.1,
      151.3, 151.6, 151.8, 152, 152.2, 152.4, 152.6, 152.8, 153, 153.2, 153.4, 153.6, 153.8, 154,
      154.2, 154.4, 154.6, 154.8, 155, 155.2, 155.4, 155.6, 155.8, 156, 156.2, 156.4, 156.7, 156.9,
      157.1, 157.3, 157.5, 157.7, 157.9, 158.1, 158.3, 158.5, 158.7, 158.9, 159.1, 159.2, 159.4,
      159.6, 159.8, 160, 160.2, 160.4, 160.6, 160.8, 161, 161.2, 161.4, 161.6, 161.8, 162, 162.2,
      162.4, 162.6, 162.8, 163, 163.2, 163.4, 163.6, 163.8, 164, 164.2,
    ],
  },
  firm: {
    empty: [
      72.3, 73.5, 74.7, 75.8, 77, 78.2, 79.4, 80.6, 81.9, 83.1, 84.4, 85.7, 87, 88.3, 89.7, 90.7,
      91.4, 91.6, 91.7, 92.2, 92.6, 93.1, 93.5, 93.9, 94.4, 94.8, 95.2, 95.6, 96, 96.4, 96.8, 97.2,
      97.6, 98, 98.3, 98.7, 99.1, 99.4, 99.8, 100.2, 100.5, 100.9, 101.2, 101.6, 101.9, 102.3,
      102.6, 102.9, 103.3, 103.6, 104, 104.3, 104.6, 104.9, 105.3, 105.6, 105.9, 106.2, 106.5,
      106.9, 107.2, 107.5, 107.8, 108.1, 108.4, 108.7, 109, 109.3, 109.7, 110, 110.3, 110.6, 110.9,
      111.2, 111.5, 111.8, 112, 112.3, 112.6, 112.9, 113.2, 113.5, 113.8, 114.1, 114.4, 114.7,
      114.9, 115.2, 115.5, 115.8, 116.1, 116.4, 116.6, 116.9, 117.2, 117.5, 117.8, 118, 118.3,
      118.6, 118.9, 119.1, 119.4, 119.7, 120, 120.2, 120.5, 120.8, 121, 121.3, 121.6, 121.8, 122.1,
      122.4, 122.6, 122.9, 123.2, 123.4, 123.7, 124, 124.2, 124.5, 124.7, 125, 125.3, 125.5, 125.8,
      126, 126.3, 126.5, 126.8, 127.1, 127.3, 127.6, 127.8, 128.1, 128.3, 128.6, 128.8, 129.1,
      129.3, 129.6, 129.8, 130.1, 130.3, 130.6, 130.8, 131.1, 131.3, 131.6, 131.8, 132.1, 132.3,
      132.6, 132.8, 133, 133.3, 133.5, 133.8, 134, 134.3, 134.5, 134.7, 135, 135.2, 135.5, 135.7,
      135.9, 136.2, 136.4, 136.7, 136.9, 137.1, 137.4, 137.6, 137.8, 138.1, 138.3, 138.6, 138.8,
      139, 139.3, 139.5, 139.7, 140, 140.2, 140.4, 140.7, 140.9, 141.1, 141.4, 141.6, 141.8, 142,
      142.3, 142.5, 142.7, 143, 143.2, 143.4, 143.6, 143.9, 144.1, 144.3, 144.6, 144.8, 145, 145.2,
      145.5, 145.7, 145.9, 146.1, 146.4, 146.6, 146.8, 147, 147.2, 147.5, 147.7, 147.9, 148.1,
      148.4, 148.6, 148.8, 149, 149.2, 149.5, 149.7, 149.9, 150.1, 150.3, 150.6, 150.8, 151, 151.2,
      151.4, 151.6, 151.9, 152.1, 152.3, 152.5, 152.7, 152.9, 153.2, 153.4, 153.6, 153.8, 154,
      154.2, 154.4, 154.7, 154.9, 155.1, 155.3, 155.5, 155.7, 155.9, 156.1, 156.4, 156.6, 156.8,
      157, 157.2, 157.4, 157.6, 157.8, 158, 158.3, 158.5, 158.7, 158.9, 159.1, 159.3, 159.5, 159.7,
      159.9, 160.1, 160.3, 160.5, 160.7, 161, 161.2, 161.4, 161.6, 161.8, 162, 162.2, 162.4, 162.6,
      162.8, 163, 163.2, 163.4, 163.6, 163.8, 164, 164.2, 164.4, 164.6, 164.8, 165,
    ],
    full: [
      74.1, 75.5, 77, 78.4, 79.8, 81.3, 82.8, 84.2, 85.7, 87.2, 88.8, 90.4, 91.5, 92, 92.5, 93.1,
      93.7, 94.2, 94.7, 95.3, 95.8, 96.3, 96.8, 97.3, 97.7, 98.2, 98.7, 99.1, 99.6, 100, 100.5,
      100.9, 101.3, 101.8, 102.2, 102.6, 103, 103.4, 103.8, 104.2, 104.6, 105, 105.4, 105.8, 106.2,
      106.6, 107, 107.3, 107.7, 108.1, 108.5, 108.8, 109.2, 109.6, 109.9, 110.3, 110.6, 111, 111.4,
      111.7, 112.1, 112.4, 112.8, 113.1, 113.5, 113.8, 114.1, 114.5, 114.8, 115.2, 115.5, 115.8,
      116.2, 116.5, 116.8, 117.2, 117.5, 117.8, 118.2, 118.5, 118.8, 119.1, 119.5, 119.8, 120.1,
      120.4, 120.8, 121.1, 121.4, 121.7, 122, 122.3, 122.7, 123, 123.3, 123.6, 123.9, 124.2, 124.5,
      124.8, 125.1, 125.4, 125.7, 126.1, 126.4, 126.7, 127, 127.3, 127.6, 127.9, 128.2, 128.5,
      128.8, 129.1, 129.4, 129.7, 129.9, 130.2, 130.5, 130.8, 131.1, 131.4, 131.7, 132, 132.3,
      132.6, 132.9, 133.2, 133.4, 133.7, 134, 134.3, 134.6, 134.9, 135.2, 135.4, 135.7, 136, 136.3,
      136.6, 136.9, 137.1, 137.4, 137.7, 138, 138.2, 138.5, 138.8, 139.1, 139.4, 139.6, 139.9,
      140.2, 140.5, 140.7, 141, 141.3, 141.5, 141.8, 142.1, 142.4, 142.6, 142.9, 143.2, 143.4,
      143.7, 144, 144.2, 144.5, 144.8, 145, 145.3, 145.6, 145.8, 146.1, 146.4, 146.6, 146.9, 147.2,
      147.4, 147.7, 148, 148.2, 148.5, 148.7, 149, 149.3, 149.5, 149.8, 150, 150.3, 150.6, 150.8,
      151.1, 151.3, 151.6, 151.8, 152.1, 152.3, 152.6, 152.9, 153.1, 153.4, 153.6, 153.9, 154.1,
      154.4, 154.6, 154.9, 155.1, 155.4, 155.6, 155.9, 156.1, 156.4, 156.6, 156.9, 157.1, 157.4,
      157.6, 157.9, 158.1, 158.4, 158.6, 158.9, 159.1, 159.4, 159.6, 159.9, 160.1, 160.3, 160.6,
      160.8, 161.1, 161.3, 161.6, 161.8, 162, 162.3, 162.5, 162.8, 163, 163.3, 163.5, 163.7, 164,
      164.2, 164.5, 164.7, 164.9, 165.2, 165.4, 165.7, 165.9, 166.1, 166.4, 166.6, 166.8, 167.1,
      167.3, 167.6, 167.8, 168, 168.3, 168.5, 168.7, 169, 169.2, 169.4, 169.7, 169.9, 170.1, 170.4,
      170.6, 170.8, 171.1, 171.3, 171.5, 171.8, 172, 172.2, 172.5, 172.7, 172.9, 173.1, 173.4,
      173.6, 173.8, 174.1, 174.3, 174.5, 174.8, 175, 175.2, 175.4, 175.7, 175.9, 176.1, 176.3,
      176.6, 176.8,
    ],
  },
  gravity_defying: {
    empty: [
      71.3, 72.7, 73.9, 75.2, 76.5, 77.7, 79, 80.3, 81.6, 82.9, 84.2, 85.6, 87, 88.4, 89.7, 90.6,
      91.2, 91.3, 91.4, 91.9, 92.5, 93, 93.6, 94.1, 94.6, 95.1, 95.7, 96.2, 96.7, 97.2, 97.7, 98.1,
      98.6, 99.1, 99.6, 100, 100.5, 101, 101.4, 101.9, 102.3, 102.8, 103.2, 103.7, 104.1, 104.5,
      105, 105.4, 105.8, 106.3, 106.7, 107.1, 107.5, 107.9, 108.4, 108.8, 109.2, 109.6, 110, 110.4,
      110.8, 111.2, 111.6, 112, 112.4, 112.8, 113.1, 113.5, 113.9, 114.3, 114.7, 115.1, 115.4,
      115.8, 116.2, 116.6, 117, 117.3, 117.7, 118.1, 118.4, 118.8, 119.2, 119.5, 119.9, 120.2,
      120.6, 121, 121.3, 121.7, 122, 122.4, 122.7, 123.1, 123.4, 123.8, 124.1, 124.5, 124.8, 125.2,
      125.5, 125.9, 126.2, 126.6, 126.9, 127.2, 127.6, 127.9, 128.2, 128.6, 128.9, 129.2, 129.6,
      129.9, 130.2, 130.6, 130.9, 131.2, 131.6, 131.9, 132.2, 132.5, 132.9, 133.2, 133.5, 133.8,
      134.2, 134.5, 134.8, 135.1, 135.4, 135.7, 136.1, 136.4, 136.7, 137, 137.3, 137.6, 137.9,
      138.3, 138.6, 138.9, 139.2, 139.5, 139.8, 140.1, 140.4, 140.7, 141, 141.3, 141.6, 142, 142.3,
      142.6, 142.9, 143.2, 143.5, 143.8, 144.1, 144.4, 144.7, 145, 145.3, 145.6, 145.8, 146.1,
      146.4, 146.7, 147, 147.3, 147.6, 147.9, 148.2, 148.5, 148.8, 149.1, 149.4, 149.7, 149.9,
      150.2, 150.5, 150.8, 151.1, 151.4, 151.7, 152, 152.2, 152.5, 152.8, 153.1, 153.4, 153.7,
      153.9, 154.2, 154.5, 154.8, 155.1, 155.3, 155.6, 155.9, 156.2, 156.5, 156.7, 157, 157.3,
      157.6, 157.8, 158.1, 158.4, 158.7, 158.9, 159.2, 159.5, 159.8, 160, 160.3, 160.6, 160.9,
      161.1, 161.4, 161.7, 161.9, 162.2, 162.5, 162.8, 163, 163.3, 163.6, 163.8, 164.1, 164.4,
      164.6, 164.9, 165.2, 165.4, 165.7, 166, 166.2, 166.5, 166.7, 167, 167.3, 167.5, 167.8, 168.1,
      168.3, 168.6, 168.8, 169.1, 169.4, 169.6, 169.9, 170.1, 170.4, 170.7, 170.9, 171.2, 171.4,
      171.7, 172, 172.2, 172.5, 172.7, 173, 173.2, 173.5, 173.7, 174, 174.3, 174.5, 174.8, 175,
      175.3, 175.5, 175.8, 176, 176.3, 176.5, 176.8, 177, 177.3, 177.5, 177.8, 178, 178.3, 178.5,
      178.8, 179, 179.3, 179.5, 179.8, 180, 180.3, 180.5, 180.8, 181, 181.3, 181.5, 181.8, 182,
      182.2,
    ],
    full: [
      72.9, 74.4, 76, 77.5, 79, 80.5, 82, 83.6, 85.1, 86.7, 88.3, 89.8, 90.8, 91.2, 91.7, 92.4,
      93.1, 93.7, 94.4, 95, 95.6, 96.2, 96.8, 97.4, 98, 98.6, 99.2, 99.7, 100.3, 100.9, 101.4, 102,
      102.5, 103, 103.6, 104.1, 104.6, 105.1, 105.6, 106.1, 106.7, 107.2, 107.7, 108.1, 108.6,
      109.1, 109.6, 110.1, 110.6, 111, 111.5, 112, 112.5, 112.9, 113.4, 113.8, 114.3, 114.7, 115.2,
      115.7, 116.1, 116.5, 117, 117.4, 117.9, 118.3, 118.7, 119.2, 119.6, 120, 120.5, 120.9, 121.3,
      121.7, 122.2, 122.6, 123, 123.4, 123.8, 124.2, 124.7, 125.1, 125.5, 125.9, 126.3, 126.7,
      127.1, 127.5, 127.9, 128.3, 128.7, 129.1, 129.5, 129.9, 130.3, 130.7, 131, 131.4, 131.8,
      132.2, 132.6, 133, 133.4, 133.7, 134.1, 134.5, 134.9, 135.3, 135.6, 136, 136.4, 136.8, 137.1,
      137.5, 137.9, 138.2, 138.6, 139, 139.3, 139.7, 140.1, 140.4, 140.8, 141.2, 141.5, 141.9,
      142.2, 142.6, 143, 143.3, 143.7, 144, 144.4, 144.7, 145.1, 145.4, 145.8, 146.1, 146.5, 146.8,
      147.2, 147.5, 147.9, 148.2, 148.6, 148.9, 149.3, 149.6, 149.9, 150.3, 150.6, 151, 151.3,
      151.6, 152, 152.3, 152.7, 153, 153.3, 153.7, 154, 154.3, 154.7, 155, 155.3, 155.7, 156, 156.3,
      156.6, 157, 157.3, 157.6, 158, 158.3, 158.6, 158.9, 159.3, 159.6, 159.9, 160.2, 160.6, 160.9,
      161.2, 161.5, 161.8, 162.2, 162.5, 162.8, 163.1, 163.4, 163.7, 164.1, 164.4, 164.7, 165,
      165.3, 165.6, 165.9, 166.3, 166.6, 166.9, 167.2, 167.5, 167.8, 168.1, 168.4, 168.7, 169.1,
      169.4, 169.7, 170, 170.3, 170.6, 170.9, 171.2, 171.5, 171.8, 172.1, 172.4, 172.7, 173, 173.3,
      173.6, 173.9, 174.2, 174.5, 174.8, 175.1, 175.4, 175.7, 176, 176.3, 176.6, 176.9, 177.2,
      177.5, 177.8, 178.1, 178.4, 178.7, 179, 179.3, 179.6, 179.9, 180.2, 180.5, 180.8, 181.1,
      181.3, 181.6, 181.9, 182.2, 182.5, 182.8, 183.1, 183.4, 183.7, 184, 184.2, 184.5, 184.8,
      185.1, 185.4, 185.7, 186, 186.2, 186.5, 186.8, 187.1, 187.4, 187.7, 188, 188.2, 188.5, 188.8,
      189.1, 189.4, 189.7, 189.9, 190.2, 190.5, 190.8, 191.1, 191.3, 191.6, 191.9, 192.2, 192.5,
      192.7, 193, 193.3, 193.6, 193.8, 194.1, 194.4, 194.7, 194.9, 195.2, 195.5, 195.8, 196,
    ],
  },
}

/** Golden snapshot fixtures at anchor tiers (natural, empty, reference frame) for canaries. */
export const GOLDEN_MEASUREMENTS = [
  {
    tier: 13,
    letter: 'G',
    dryTotalKg: 2.47,
    capacityTotalMl: 1038.3,
    bodyPct: 4.1,
    bustCm: 87.94,
  },
  {
    tier: 31,
    letter: 'O',
    dryTotalKg: 7.61,
    capacityTotalMl: 3205.9,
    bodyPct: 11.6,
    bustCm: 96.99,
  },
  {
    tier: 47,
    letter: 'X',
    dryTotalKg: 14.37,
    capacityTotalMl: 6048.8,
    bodyPct: 19.9,
    bustCm: 101.69,
  },
] as const
