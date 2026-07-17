// Extract the validated NAI v0.4.7 ladder tables by evaluating the naiscript in a
// stubbed sandbox, then emit a generated TypeScript data file for the Aventuras fork.
import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const SRC = '/Users/benjaminsolomon/Projects/code/be-story-engine/dist/ambrosia-v0.4.7.naiscript'
const src = readFileSync(SRC, 'utf8')

// Catch-all sandbox: any unknown global resolves to a permissive no-op proxy so the
// script's NAI api calls / hook registrations don't crash function definition.
const noop = new Proxy(function () {}, {
  get: (t, p) => (p === Symbol.toPrimitive ? () => '' : noop),
  apply: () => noop,
  construct: () => noop,
})
const base = { console: { log: () => {}, warn: () => {}, error: () => {} }, Math, JSON, Number, String, Object, Array, Boolean, RegExp, Date, Symbol, parseInt, parseFloat, isFinite, isNaN, Infinity, NaN, undefined }
const sandbox = new Proxy(base, {
  has: () => true, // make every identifier resolve through the proxy (with-like semantics)
  get: (t, p) => (p in t ? t[p] : p === Symbol.unscopables ? undefined : noop),
  set: (t, p, v) => ((t[p] = v), true),
})
const context = vm.createContext(sandbox)
// Top-level const/let in a vm script are lexically scoped, not global properties — capture
// them from inside the same script via an epilogue assignment (lands on base via the set trap).
const epilogue = `\n;var __CAPTURE__ = { COMPARATIVE_DESCRIPTIONS, tierToCupTag, tier_index_to_letter, tier_letter_to_index, UK_CUP_LADDER };`
try {
  vm.runInContext(src + epilogue, context, { filename: 'ambrosia-v0.4.7.naiscript', timeout: 30_000 })
} catch (err) {
  console.error('script eval ended with (tolerated if functions captured):', err.message)
}

const cap = base.__CAPTURE__
if (!cap) throw new Error('capture epilogue never ran — script threw before completion')
const need = ['COMPARATIVE_DESCRIPTIONS', 'tierToCupTag', 'tier_index_to_letter', 'tier_letter_to_index', 'UK_CUP_LADDER']
for (const n of need) {
  if (cap[n] === undefined || cap[n] === noop) throw new Error(`missing after eval: ${n}`)
}
const { COMPARATIVE_DESCRIPTIONS, tierToCupTag, tier_index_to_letter, tier_letter_to_index, UK_CUP_LADDER } = cap

// 1) Comparative bands: [{tierMax, description}] — verify shape + count (last row may be Infinity)
const comparatives = COMPARATIVE_DESCRIPTIONS.map((b) => ({ tierMax: Number(b.tier_max), description: String(b.description) }))
const badBand = comparatives.find((b) => (!Number.isFinite(b.tierMax) && b.tierMax !== Infinity) || !b.description)
if (comparatives.length < 40 || badBand) {
  throw new Error(`comparative table shape unexpected: len=${comparatives.length} bad=${JSON.stringify(badBand)}`)
}
// Serialize with an Infinity-preserving printer (JSON.stringify would null it).
const printBands = (rows) =>
  '[\n' + rows.map((b) => `  { tierMax: ${b.tierMax === Infinity ? 'Infinity' : b.tierMax}, description: ${JSON.stringify(b.description)} },`).join('\n') + '\n]'

// 2) Cup letters: evaluate tier_index_to_letter over 0..300, compress into thresholds
const letters = []
let prev = null
for (let t = 0; t <= 300; t++) {
  const L = String(tier_index_to_letter(t))
  if (L !== prev) { letters.push({ minTier: t, cup: L }); prev = L }
}

// 3) Band words: evaluate tierToCupTag over 0..60, compress into thresholds
const bands = []
prev = null
for (let t = 0; t <= 60; t++) {
  const w = String(tierToCupTag(t))
  if (w !== prev) { bands.push({ minTier: t, word: w }); prev = w }
}

// 4) Letter → tier reverse anchors for every ladder letter (seed-from-card support)
const letterToTier = {}
for (const L of new Set(UK_CUP_LADDER)) {
  const t = tier_letter_to_index(String(L))
  if (t != null && Number.isFinite(Number(t))) letterToTier[String(L)] = Number(t)
}

const gen = `// GENERATED FILE — do not edit by hand. Regenerate via the ambrosia-st session scratchpad
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
export const COMPARATIVE_BANDS: ReadonlyArray<{ readonly tierMax: number; readonly description: string }> = ${printBands(comparatives)}

/** Cup letter thresholds (minTier → letter), saturating at the last entry. */
export const CUP_LETTER_THRESHOLDS: ReadonlyArray<{ readonly minTier: number; readonly cup: string }> = ${JSON.stringify(letters, null, 2)}

/** Prose band-word thresholds (NAI tierToCupTag convention). */
export const BAND_WORD_THRESHOLDS: ReadonlyArray<{ readonly minTier: number; readonly word: string }> = ${JSON.stringify(bands, null, 2)}

/** Cup letter → canonical tier anchor (NAI tier_letter_to_index), for card seeding. */
export const LETTER_TO_TIER: Readonly<Record<string, number>> = ${JSON.stringify(letterToTier, null, 2)}
`
const OUT = '/Users/benjaminsolomon/Projects/gaming/Aventuras/src/lib/services/be/ladder-data.ts'
writeFileSync(OUT, gen)
console.log('bands:', comparatives.length, '| letter thresholds:', letters.length, '| band words:', bands.length, '| letter anchors:', Object.keys(letterToTier).length)
console.log('spot: t0=', tier_index_to_letter(0), '| t13=', tier_index_to_letter(13), '| t50=', tier_index_to_letter(50), '| t82=', tier_index_to_letter(82), '| t92=', tier_index_to_letter(92), '| t200=', tier_index_to_letter(200))
console.log('G anchor reverse:', tier_letter_to_index('G'), '| Z:', tier_letter_to_index('Z'), '| X:', tier_letter_to_index('X'))
