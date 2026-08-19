/**
 * Cross-derivation canary (31a lesson 1 + research/38 C5): one canonical scalar,
 * every derived view must move together — and no band's literal claims may
 * contradict the mass/volume spine. This is the test class that would have
 * caught both the NAI-era "circumference disagreed with weight by 2x" bug and
 * the research/38 bust-channel miscalibration.
 */
import { describe, expect, test } from 'vitest'
import { COMPARATIVE_BANDS } from './ladder-data'
import { bandIndex, comparative, cupLetter } from './ladder'
import { bodyRow, bustDiffCm, dryKgPerSide } from './measurements'
import { tissueVolMlPerSide } from './curves'
import { groundingFacts } from './derive'

const SWEEP_MAX = 300

// Canonical letter order for monotonicity ranking (curves.ts ladder + saturations).
const LETTER_ORDER = [
  'A',
  'B',
  'C',
  'D',
  'DD',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  'ZZ',
  'ZZ+',
]

describe('derivation monotonicity across the full sweep', () => {
  test('cup letters never regress as tier climbs', () => {
    const order = new Map(LETTER_ORDER.map((cup, i) => [cup, i]))
    let last = -1
    for (let tier = 0; tier <= SWEEP_MAX; tier++) {
      const idx = order.get(cupLetter(tier))
      expect(idx).toBeDefined()
      expect(idx as number).toBeGreaterThanOrEqual(last)
      last = idx as number
    }
  })

  test('bust diff grows strictly with tier for EVERY shape (geometry-audit defect 1: the gravity_defying dip)', () => {
    for (const shape of ['natural', 'firm', 'gravity_defying'] as const) {
      for (let tier = 1; tier <= SWEEP_MAX; tier++) {
        expect(bustDiffCm(tier, shape, 0)).toBeGreaterThan(bustDiffCm(tier - 1, shape, 0))
      }
    }
  })

  test('standing-tape shape order holds at every tier: gravity_defying > firm > natural (defects 2-3)', () => {
    for (let tier = 0; tier <= SWEEP_MAX; tier += 3) {
      const natural = bustDiffCm(tier, 'natural', 0)
      const firm = bustDiffCm(tier, 'firm', 0)
      const gd = bustDiffCm(tier, 'gravity_defying', 0)
      expect(gd).toBeGreaterThan(firm)
      expect(firm).toBeGreaterThan(natural)
    }
  })

  test('fill widens the diff monotonically at every tier (defect 5: no lost engorgement across the blend)', () => {
    for (let tier = 0; tier <= 60; tier += 2) {
      expect(bustDiffCm(tier, 'natural', 50)).toBeGreaterThan(bustDiffCm(tier, 'natural', 0))
      expect(bustDiffCm(tier, 'natural', 100)).toBeGreaterThan(bustDiffCm(tier, 'natural', 50))
    }
  })

  test('band index never regresses as tier climbs', () => {
    let last = -1
    for (let tier = 0; tier <= SWEEP_MAX; tier++) {
      const idx = bandIndex(tier)
      expect(idx).toBeGreaterThanOrEqual(last)
      last = idx
    }
  })

  test('comparative prose only changes at increasing tiers (band walk is one-directional)', () => {
    let lastDescription = comparative(0)
    let changes = 0
    const seen = new Set([lastDescription])
    for (let tier = 1; tier <= SWEEP_MAX; tier++) {
      const description = comparative(tier)
      if (description !== lastDescription) {
        // A band left behind must never come back.
        expect(seen.has(description)).toBe(false)
        seen.add(description)
        lastDescription = description
        changes++
      }
    }
    expect(changes).toBeGreaterThanOrEqual(40) // all 51 bands minus the sparse top rows
  })

  test('every tier yields non-empty facts from every derivation', () => {
    for (let tier = 0; tier <= SWEEP_MAX; tier += 7) {
      expect(cupLetter(tier)).toBeTruthy()
      expect(comparative(tier)).toBeTruthy()
      for (const shape of ['natural', 'firm', 'gravity_defying'] as const) {
        const facts = groundingFacts(tier, shape)
        expect(facts.posture).toBeTruthy()
        expect(facts.mobility).toBeTruthy()
        expect(facts.clothing).toBeTruthy()
      }
    }
  })

  test('magical support diverges from natural at every large size', () => {
    // Baked NAI moment-model rows: exact wording is generated, so assert
    // structure. At extreme tiers the burden rungs may converge, but the hang
    // channel ('' for gravity_defying, populated for natural) always diverges.
    for (const tier of [26, 39, 82, 200]) {
      const supported = groundingFacts(tier, 'gravity_defying')
      const natural = groundingFacts(tier, 'natural')
      const burdenDiffers =
        supported.posture !== natural.posture || supported.mobility !== natural.mobility
      const hangDiffers = bodyRow(tier, 'gravity_defying').hang !== bodyRow(tier, 'natural').hang
      expect(burdenDiffers || hangDiffers).toBe(true)
    }
  })
})

describe('cross-channel claims vs the mass/volume spine (research/38 C5, the #39 canary)', () => {
  // Bands making a literal mass claim ("outweighs her torso") must carry the
  // mass to back it: torso ≈ 45% of the 57 kg reference frame, poetic factor 2.
  test('"outweighs her torso" bands carry torso-scale mass', () => {
    const torsoKg = 0.45 * 57
    const claims = COMPARATIVE_BANDS.filter((b) => /outweighs?\s[^.]*torso/i.test(b.description))
    expect(claims.length).toBeGreaterThan(0)
    for (const band of claims) {
      const tier = Number.isFinite(band.tierMax) ? band.tierMax : SWEEP_MAX
      expect(dryKgPerSide(tier)).toBeGreaterThanOrEqual(torsoKg / 2)
    }
  })

  // Head-comparison bands must sit within an order of magnitude of a real head
  // (~4.5 L) — generous poetic bounds, but they catch curve-vs-prose drift.
  test('head-comparison bands sit near head volume', () => {
    const headMl = 4500
    const mentions = COMPARATIVE_BANDS.filter((b) => /(her|a|human) head/i.test(b.description))
    expect(mentions.length).toBeGreaterThan(0)
    for (const band of mentions) {
      const tier = Number.isFinite(band.tierMax) ? band.tierMax : SWEEP_MAX
      const vol = tissueVolMlPerSide(tier)
      expect(vol).toBeGreaterThanOrEqual(headMl / 10)
      expect(vol).toBeLessThanOrEqual(headMl * 12)
    }
  })

  // The one hard real-world anchor (research/38): Norma Stitz's measured 178 cm
  // bust on a 109 cm band at ~19 L/side (≈ tier 82). If the projection curve
  // drifts off this pin, the bust channel is lying again.
  test('the Norma Stitz anchor holds', () => {
    expect(109 + bustDiffCm(82, 'natural', 0)).toBeCloseTo(178, 0)
  })
})

// ---- Phase 2 golden canary (research/48 Step 10): a full-turn fixture ----
// A girl with two quirks takes a growth event, a bond event, and an exposure
// event in ONE reduce. Asserts the exact end state so any accidental
// step-order change in the reducer pipeline surfaces here first.
import { DEFAULT_BE_STORY_CONFIG } from './constants'
import { defaultBodyState } from './metadata'
import { reduceCharacterBody } from './reducer'

describe('Phase 2 full-turn canary', () => {
  test('quirked girl: growth + bond + exposure in one reduce', () => {
    const state = {
      ...defaultBodyState(6),
      quirks: ['fast_metabolizer', 'devoted_heart'],
      bond: 40,
      dependence: 58,
      beatsSinceExposure: 2,
    }
    const config = { ...DEFAULT_BE_STORY_CONFIG, enabled: true, passiveFillEnabled: false }
    // Seed chosen so the (i2 → fast_metabolizer i3) catalyst roll succeeds:
    // seededRoll('p2-canary:0') = 14; i3 total 18 = critical (delta 2 splits).
    const { state: next, log } = reduceCharacterBody(
      state,
      [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      config,
      'p2-canary',
      'Mira',
      undefined,
      {
        bondEvents: [{ character: 'Mira', direction: 'warm', intensity: 2 }],
        exposureEvents: [{ character: 'Mira', intensity: 2 }],
      },
    )
    // Pin the observed goldens (harvested at implementation time; identical
    // forever after — do NOT update to make a refactor pass).
    expect({
      tier: next.tier,
      pendingGrowth: next.pendingGrowth ?? null,
      bond: next.bond,
      dependence: next.dependence,
      beatsSinceExposure: next.beatsSinceExposure,
      attitude: next.attitude ?? null,
      cooldown: next.cooldown,
      kinds: log.map((r) => r.kind),
    }).toMatchInlineSnapshot(`
      {
        "attitude": "craving",
        "beatsSinceExposure": 0,
        "bond": 45,
        "cooldown": 2,
        "dependence": 62,
        "kinds": [
          "catalyst",
          "bond",
          "exposure",
          "mood",
        ],
        "pendingGrowth": null,
        "tier": 7,
      }
    `)
  })
})

// ---- Phase 3 golden canary (research/49 Step 9): a full-turn lactation fixture ----
// An actively-lactating heavy-supply pressure_prone girl at high fill takes one
// milking event in ONE reduce. Asserts the exact end state, log kinds, and
// milkYield so any step-order or supply-math change surfaces here first.
describe('Phase 3 full-turn canary', () => {
  test('pressure_prone lactating girl: milking at high fill in one reduce', () => {
    const state = {
      ...defaultBodyState(20),
      quirks: ['pressure_prone'],
      lactation: { active: true, supplyTier: 2, beatsSinceMilked: 1, demandBeats: 1 },
      fluids: { fillPercent: 80, fluidType: 'milk' },
    }
    const config = { ...DEFAULT_BE_STORY_CONFIG, enabled: true }
    const result = reduceCharacterBody(
      state,
      [{ character: 'Nyra', kind: 'milking', intensity: 2 }],
      config,
      'p3-canary',
      'Nyra',
    )
    // Pin the observed goldens (harvested at implementation time; identical
    // forever after — do NOT update to make a refactor pass).
    expect({
      lactation: result.state.lactation,
      fillPercent: result.state.fluids.fillPercent,
      conditionLabels: result.state.conditions.map((c) => c.label),
      milkYield: result.milkYield ?? null,
      kinds: result.log.map((r) => r.kind),
      tier: result.state.tier,
    }).toMatchInlineSnapshot(`
      {
        "conditionLabels": [],
        "fillPercent": 16,
        "kinds": [
          "fill",
          "milking",
          "supply",
        ],
        "lactation": {
          "active": true,
          "beatsSinceMilked": 0,
          "chronicBeats": 1,
          "demandBeats": 0,
          "supplyTier": 3,
        },
        "milkYield": {
          "drainedPercent": 80,
          "units": 14,
        },
        "tier": 20,
      }
    `)
  })
})

// ---- Phase 4 golden canary (research/50 Step 9): a full spell-cast turn ----
// A success-band cast of a growth + supply_surge spell on an actively-lactating
// girl. translateSpellEffects → reduceCharacterBody in one reduce: the growth
// catalyst lands through the normal gates and the surge raises supply, all
// deterministic off the seed. Pins the effect→reducer integration.
import { translateSpellEffects } from './effects'

describe('Phase 4 full-cast canary', () => {
  test('success cast (growth + supply_surge) lands through the reducer', () => {
    const state = {
      ...defaultBodyState(15),
      lactation: { active: true, supplyTier: 1, beatsSinceMilked: 1, demandBeats: 0 },
      fluids: { fillPercent: 20, fluidType: 'milk' },
    }
    const config = { ...DEFAULT_BE_STORY_CONFIG, enabled: true }
    const cast = translateSpellEffects(
      [
        { kind: 'growth', intensity: 2 },
        { kind: 'supply_surge', intensity: 1 },
      ],
      'success',
      'Vale',
    )
    const result = reduceCharacterBody(state, cast.events, config, 'p4-canary', 'Vale', undefined, {
      supplyDelta: cast.supplyDelta,
    })
    expect({
      tier: result.state.tier,
      supplyTier: result.state.lactation?.supplyTier,
      castEvents: cast.events,
      castSupplyDelta: cast.supplyDelta,
      kinds: result.log.map((r) => r.kind),
      catalystOutcomes: result.log.filter((r) => r.kind === 'catalyst').map((r) => r.outcome),
    }).toMatchInlineSnapshot(`
      {
        "castEvents": [
          {
            "character": "Vale",
            "intensity": 2,
            "kind": "catalyst",
          },
        ],
        "castSupplyDelta": 1,
        "catalystOutcomes": [
          "fail",
        ],
        "kinds": [
          "fill",
          "catalyst",
          "supply",
        ],
        "supplyTier": 2,
        "tier": 15,
      }
    `)
  })
})
