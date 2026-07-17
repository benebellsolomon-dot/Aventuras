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
