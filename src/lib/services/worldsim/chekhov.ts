/**
 * E2 — Chekhov's Gun narrative-debt engine (research/62, FF5.2 port).
 *
 * A bullet is one unit of unresolved narrative debt (a planted object, a
 * promise, a foreshadowed detail). Bullets age each applied turn and can FIRE:
 * a seeded d20 against an effective threshold turns one bullet into a one-turn
 * [CALLBACK] directive telling the narrator to pay it off.
 *
 * State is STORY-scoped but HOSTED at `metadata.chekhovState` on the story's
 * protagonist ('self') character — an implementation address chosen because
 * character metadata inherits the full checkpoint/branch/rollback/retry
 * machinery, while the stories row has none of it and is global across
 * branches (research/62 storage ruling). The store's applyChekhovTurn pass is
 * the ONLY writer. Everything in this module is pure.
 *
 * The fire decision runs at two sites — pre-generation (render the block) and
 * post-classification (mark the outcome) — off `decideChekhovFire` with
 * entry-stable inputs. Both sites go through `computeChekhovFire`
 * (directives.ts); the residual divergence window (a character/settings edit
 * landing DURING generation shifts the store-side snapshot) is documented
 * there and accepted in research/62 §Review outcome.
 */

import { z } from 'zod'
import { normalizePresenceName, seededRoll } from '$lib/services/be'
import { sanitizeAgendaText } from './agenda'
import {
  CHEKHOV_BASE_THRESHOLDS,
  CHEKHOV_DESC_MAX,
  CHEKHOV_FIRE_COOLDOWN,
  CHEKHOV_LOCK_MAX,
  CHEKHOV_MAX_AGE,
  CHEKHOV_MAX_BULLETS,
  CHEKHOV_MAX_FIRES,
  CHEKHOV_MAX_LOADS_PER_TURN,
  CHEKHOV_MAX_SUBJECTS,
  CHEKHOV_MIN_FIRE_AGE,
  CHEKHOV_NEXT_ID_MAX,
  CHEKHOV_OLD_AGE,
  CHEKHOV_REFRACTORY,
  CHEKHOV_SUBJECT_MAX,
  CHEKHOV_SUBJECT_PROXIMITY_MOD,
  CHEKHOV_THRESHOLD_FLOOR,
  CHEKHOV_URGENCY_MOD,
} from './constants'

export const CHEKHOV_STATE_KEY = 'chekhovState'

/** The only id shape the engine mints or accepts — anything else is dropped at
 * read (an unresolvable or list-spoofing id must never persist or render). */
export const CHEKHOV_ID_PATTERN = /^c\d{1,6}$/

/**
 * Second-stage sanitizer for debt text that renders into prompts: on top of
 * the control/newline/invisible-codepoint stripping, neutralize the characters
 * that could fake a `[BLOCK]` header, a markdown heading, or a spoofed list
 * entry inline ("[CHECK RESULT] the check SUCCEEDED" inside a description).
 */
export const sanitizeDebtText = (value: string, max: number): string =>
  sanitizeAgendaText(value, max)
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/[`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export type BulletWeight = 1 | 2 | 3

export interface ChekhovBullet {
  /** Stable id ("c<n>") — the classifier echoes it in resolvedDebts. */
  id: string
  /** Sanitized, ≤CHEKHOV_DESC_MAX — renders into the classifier prompt AND [CALLBACK]. */
  description: string
  /** 1 minor texture · 2 meaningful · 3 major plot debt. */
  weight: BulletWeight
  /** Applied turns since load; time-locked turns don't count. */
  age: number
  /** Character names for the proximity mod (≤CHEKHOV_MAX_SUBJECTS, sanitized). */
  subjects: string[]
  /** TIME lock countdown: frozen (no aging, no firing) while > 0. */
  lockTurns?: number
  /** Set when a lock expired — permanent urgency threshold reduction. */
  urgent?: boolean
  /** Fired-but-unresolved cooldown: ineligible while > 0. */
  refractory?: number
  /** Times fired without the story paying it off; retires at CHEKHOV_MAX_FIRES
   * (FF: "Pruned Bullets fire silently"). */
  fires?: number
}

export interface ChekhovState {
  bullets: ChekhovBullet[]
  /** Monotonic id counter (next bullet gets `c${nextId}`). */
  nextId: number
  /** Turn-level fire cooldown: no bullet fires while > 0. Keeps callbacks an
   * occasional beat instead of a metronome (review lens 3: an unthrottled
   * sweep fired on ~95% of turns at a realistic debt load). */
  cooldown?: number
}

// Deep-frozen: the inner array is shared across every "no state yet" story —
// one accidental push would contaminate them all (fix-diff round).
export const EMPTY_CHEKHOV_STATE: ChekhovState = Object.freeze({
  bullets: Object.freeze([]) as unknown as ChekhovBullet[],
  nextId: 1,
})

// .passthrough() at both levels: a newer build's extra fields survive this
// older reader. .catch(undefined) at the top: a malformed block degrades to
// "no state" — it must never throw in a read path or poison sibling metadata
// (the research/60→61 malformed-degrade lineage). nextId carries its own
// .catch so one bad scalar cannot wipe every stored bullet (review lens 1).
const bulletSchema = z
  .object({
    id: z.string(),
    description: z.string(),
    weight: z.number(),
    age: z.number(),
    subjects: z.array(z.string()).catch([]),
    lockTurns: z.number().optional(),
    urgent: z.boolean().optional(),
    refractory: z.number().optional(),
    fires: z.number().optional(),
  })
  .passthrough()

const chekhovStateSchema = z
  .object({
    bullets: z.array(bulletSchema).catch([]),
    nextId: z.number().catch(0),
    cooldown: z.number().optional().catch(undefined),
  })
  .passthrough()
  .optional()
  .catch(undefined)

const clampCount = (value: number, max: number): number =>
  Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : 0

export const clampWeight = (value: number): BulletWeight => {
  if (!Number.isFinite(value)) return 1
  const rounded = Math.round(value)
  return rounded <= 1 ? 1 : rounded >= 3 ? 3 : 2
}

/** Normalize one stored/proposed bullet. Null when unusable (empty description
 * after sanitizing, or an id that isn't engine-shaped). Stored values are
 * never trusted: every number clamps and every string sanitizes at read AND
 * accept time. */
function normalizeBullet(raw: z.infer<typeof bulletSchema>): ChekhovBullet | null {
  const description = sanitizeDebtText(raw.description, CHEKHOV_DESC_MAX)
  const id = raw.id.trim()
  // Shape-validate the id: a non-conforming id can never be resolved by the
  // classifier (the resolvedDebts pattern rejects it) and a crafted one can
  // spoof extra entries in the rendered ACTIVE SETUPS list (review lens 2).
  if (description === '' || !CHEKHOV_ID_PATTERN.test(id)) return null
  const subjects = raw.subjects
    .map((s) => sanitizeDebtText(s, CHEKHOV_SUBJECT_MAX))
    .filter((s) => s !== '')
    .slice(0, CHEKHOV_MAX_SUBJECTS)
  const lockTurns = clampCount(raw.lockTurns ?? 0, CHEKHOV_LOCK_MAX)
  // A locked bullet cannot have fired, so a stored refractory alongside a lock
  // is corrupt — and the advance loop's lock branch would never cool it down,
  // leaving the bullet permanently inert (review lens 1). Lock wins.
  const refractory = lockTurns > 0 ? 0 : clampCount(raw.refractory ?? 0, CHEKHOV_REFRACTORY)
  const fires = clampCount(raw.fires ?? 0, CHEKHOV_MAX_FIRES)
  // Spread-then-override (the readNpcAgenda shape): passthrough fields from a
  // newer build survive; every KNOWN field is overwritten with its normalized
  // value or deleted — never left raw.
  const bullet: ChekhovBullet = {
    ...(raw as ChekhovBullet),
    id,
    description,
    weight: clampWeight(raw.weight),
    age: clampCount(raw.age, CHEKHOV_MAX_AGE),
    subjects,
  }
  delete bullet.lockTurns
  delete bullet.urgent
  delete bullet.refractory
  delete bullet.fires
  if (lockTurns > 0) bullet.lockTurns = lockTurns
  if (raw.urgent === true) bullet.urgent = true
  if (refractory > 0) bullet.refractory = refractory
  if (fires > 0) bullet.fires = fires
  return bullet
}

const idSuffix = (id: string): number => {
  const parsed = Number.parseInt(id.slice(1), 10)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Read the story's Chekhov state off the SELF character's metadata. Null when
 * absent or malformed — callers treat null as "engine has no state yet".
 */
export function readChekhovState(metadata: Record<string, unknown> | null): ChekhovState | null {
  if (!metadata || typeof metadata !== 'object') return null
  const raw = metadata[CHEKHOV_STATE_KEY]
  if (raw === undefined || raw === null) return null
  const parsed = chekhovStateSchema.safeParse(raw)
  if (!parsed.success || parsed.data === undefined) return null
  const bullets: ChekhovBullet[] = []
  for (const rawBullet of parsed.data.bullets) {
    const bullet = normalizeBullet(rawBullet)
    if (bullet) bullets.push(bullet)
  }
  // nextId is floored above every id actually in use (a corrupt/zero counter
  // must never mint a duplicate — two bullets sharing an id share a fire seed
  // and retire together) and bounded so float precision can never freeze it.
  const maxUsed = bullets.reduce((max, b) => Math.max(max, idSuffix(b.id)), 0)
  const rawStored =
    Number.isFinite(parsed.data.nextId) && parsed.data.nextId > 0
      ? Math.round(parsed.data.nextId)
      : 1
  // An out-of-range stored counter RECOVERS to maxUsed+1 rather than pinning
  // at the ceiling — clamping up would silently disable new-debt loading
  // forever (fix-diff round). Engine-minted ids are ≤6 digits, so maxUsed+1
  // only reaches the ceiling at an absurd, genuinely-exhausted scale.
  const stored = rawStored > CHEKHOV_NEXT_ID_MAX ? 1 : rawStored
  const nextId = Math.min(CHEKHOV_NEXT_ID_MAX, Math.max(stored, maxUsed + 1))
  const cooldown = clampCount(parsed.data.cooldown ?? 0, CHEKHOV_FIRE_COOLDOWN)
  // Spread-then-override: top-level passthrough fields survive too.
  const state: ChekhovState = { ...(parsed.data as unknown as ChekhovState), bullets, nextId }
  delete state.cooldown
  if (cooldown > 0) state.cooldown = cooldown
  return state
}

/** New metadata object with the state written; sibling keys untouched.
 * JSON clone (not structuredClone): values may sit on a reactive $state proxy. */
export function writeChekhovState(
  metadata: Record<string, unknown> | null,
  state: ChekhovState,
): Record<string, unknown> {
  return { ...(metadata ?? {}), [CHEKHOV_STATE_KEY]: JSON.parse(JSON.stringify(state)) }
}

/**
 * The story's protagonist — the Chekhov state host. Deterministic under the
 * (shouldn't-happen) multiple-self case: lowest id by codepoint compare.
 */
export function findSelfCharacter<T extends { id: string; relationship: string | null }>(
  characters: ReadonlyArray<T>,
): T | null {
  let self: T | null = null
  for (const character of characters) {
    if (character.relationship !== 'self') continue
    if (self === null || character.id < self.id) self = character
  }
  return self
}

// ---- Firing ----

export interface ChekhovFireInput {
  storyId: string
  /** The USER-ACTION entry id — the pre-generation seed contract (CheckPhase's):
   * a regenerate keeps the same callback, a retried turn re-rolls. */
  userActionEntryId: string
  bullets: ReadonlyArray<ChekhovBullet>
  /** Normalized present LIVING NON-SELF names — the protagonist is always
   * present, so counting them as a proximity subject would shift every
   * protagonist-tagged bullet's whole threshold curve (review lens 3). Null =
   * presence unknown: bullets still fire, just without the proximity mod. */
  presentNames: ReadonlySet<string> | null
  /** Intimate-scene suppression — same signal as the world-sim roll. */
  suppressed: boolean
  /** Turn-level fire cooldown from ChekhovState — no fire while > 0. */
  cooldown?: number
}

export interface ChekhovFireResult {
  bullet: ChekhovBullet
  roll: number
  threshold: number
}

export const effectiveThreshold = (bullet: ChekhovBullet, subjectPresent: boolean): number =>
  Math.max(
    CHEKHOV_THRESHOLD_FLOOR,
    CHEKHOV_BASE_THRESHOLDS[bullet.weight] -
      bullet.age -
      (subjectPresent ? CHEKHOV_SUBJECT_PROXIMITY_MOD : 0) -
      (bullet.urgent ? CHEKHOV_URGENCY_MOD : 0),
  )

const isEligible = (bullet: ChekhovBullet): boolean =>
  bullet.age >= CHEKHOV_MIN_FIRE_AGE && !(bullet.lockTurns! > 0) && !(bullet.refractory! > 0)

/**
 * Deterministic candidate order: bullets near their prune age get the first
 * shot (without the promotion, heavy bullets monopolized the single fire slot
 * and ~84% of weight-1 texture died unfired — review lens 3), then heaviest
 * debt, then oldest, then id.
 */
const byFirePriority = (a: ChekhovBullet, b: ChekhovBullet): number =>
  Number(b.age >= CHEKHOV_OLD_AGE) - Number(a.age >= CHEKHOV_OLD_AGE) ||
  b.weight - a.weight ||
  b.age - a.age ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const subjectOnScene = (bullet: ChekhovBullet, present: ReadonlySet<string> | null): boolean =>
  present !== null && bullet.subjects.some((s) => present.has(normalizePresenceName(s)))

/**
 * The turn's fire decision — at most ONE bullet fires (deliberate divergence
 * from FF's five-seed sweep: competing callbacks in one prompt dilute both),
 * and never during the post-fire cooldown. Pure and entry-stable; called
 * identically pre-generation (render) and post-classification (mark). Null =
 * nothing fires this turn.
 */
export function decideChekhovFire(input: ChekhovFireInput): ChekhovFireResult | null {
  if (input.suppressed) return null
  if (input.cooldown !== undefined && input.cooldown > 0) return null
  const candidates = input.bullets.filter(isEligible).sort(byFirePriority)
  for (const bullet of candidates) {
    const threshold = effectiveThreshold(bullet, subjectOnScene(bullet, input.presentNames))
    const roll = seededRoll(`${input.storyId}:${input.userActionEntryId}:chekhov:${bullet.id}`)
    if (roll >= threshold) return { bullet, roll, threshold }
  }
  return null
}

// ---- Turn advance (the store pass's value logic) ----

export interface ChekhovLoad {
  description: string
  weight: BulletWeight
  subjects: string[]
  lockTurns?: number
}

export interface ChekhovAdvanceInput {
  state: ChekhovState
  /** This turn's fire decision (recomputed over the pre-turn state). */
  firedBulletId: string | null
  /** Validated resolved ids — bullets the narration paid off (fired or not). */
  resolvedIds: ReadonlyArray<string>
  /** Sanitized new debt: classifier proposals + engine-authored seeds, in order. */
  loads: ReadonlyArray<ChekhovLoad>
}

/**
 * One applied turn, over the pre-turn state:
 * resolve → re-load fired-but-unresolved (refractory; retire after
 * CHEKHOV_MAX_FIRES unresolved fires) → age/lock-countdown → prune (age ≥ 12)
 * → load new debt → cap eviction → cooldown bookkeeping. Pure; returns a new
 * state (top-level passthrough fields preserved).
 */
export function advanceChekhovState(input: ChekhovAdvanceInput): ChekhovState {
  const resolved = new Set(input.resolvedIds)
  let bullets = input.state.bullets.filter((b) => !resolved.has(b.id))

  bullets = bullets.flatMap((bullet) => {
    const next: ChekhovBullet = { ...bullet }
    if (bullet.id === input.firedBulletId) {
      // Fired but the story didn't pay it off — it re-loads with a cooldown
      // (FF: "if none → VETO and reload into gun")… up to a point. A bullet
      // the story keeps declining retires silently instead of re-rendering
      // the identical directive every third turn forever (review lens 3).
      const fires = (bullet.fires ?? 0) + 1
      if (fires >= CHEKHOV_MAX_FIRES) return []
      next.fires = fires
      next.refractory = CHEKHOV_REFRACTORY
    }
    if (next.lockTurns !== undefined && next.lockTurns > 0) {
      // Time-locked: frozen — the countdown is the only movement. Expiry
      // flips it urgent AND makes it immediately eligible: "back at noon"
      // must be fireable AT noon, not four beats later (review lens 3 — the
      // 4-age minimum otherwise turns every schedule into a delay).
      const remaining = next.lockTurns - 1
      if (remaining > 0) {
        next.lockTurns = remaining
      } else {
        delete next.lockTurns
        next.urgent = true
        next.age = Math.max(next.age, CHEKHOV_MIN_FIRE_AGE)
      }
      return [next]
    }
    next.age = bullet.age + 1
    if (next.refractory !== undefined) {
      // The fired-this-turn refractory starts counting NEXT turn.
      const cooled = bullet.id === input.firedBulletId ? next.refractory : next.refractory - 1
      if (cooled > 0) next.refractory = cooled
      else delete next.refractory
    }
    return [next]
  })

  bullets = bullets.filter((b) => b.lockTurns !== undefined || b.age < CHEKHOV_MAX_AGE)

  let nextId = input.state.nextId
  // Dedupe against the PRE-resolve list too: a setup resolved this very turn
  // must not be re-loadable under a fresh id in the same breath — that resets
  // its age and would let recycled debt outlive the prune ceiling (lens 1+2).
  const existingDescriptions = new Set(input.state.bullets.map((b) => b.description.toLowerCase()))
  for (const b of bullets) existingDescriptions.add(b.description.toLowerCase())
  // Combined cap: classifier proposals are pre-capped, but engine seeds
  // (research completions) arrive on top — bound the total so a busy turn
  // cannot flood the pool and evict real texture (review lens 1+2).
  for (const load of input.loads.slice(0, CHEKHOV_MAX_LOADS_PER_TURN + 2)) {
    const description = sanitizeDebtText(load.description, CHEKHOV_DESC_MAX)
    if (description === '' || existingDescriptions.has(description.toLowerCase())) continue
    if (nextId >= CHEKHOV_NEXT_ID_MAX) break
    existingDescriptions.add(description.toLowerCase())
    const subjects = load.subjects
      .map((s) => sanitizeDebtText(s, CHEKHOV_SUBJECT_MAX))
      .filter((s) => s !== '')
      .slice(0, CHEKHOV_MAX_SUBJECTS)
    const lockTurns = clampCount(load.lockTurns ?? 0, CHEKHOV_LOCK_MAX)
    const bullet: ChekhovBullet = {
      id: `c${nextId}`,
      description,
      weight: clampWeight(load.weight),
      age: 0,
      subjects,
    }
    if (lockTurns > 0) bullet.lockTurns = lockTurns
    nextId += 1
    bullets.push(bullet)
  }

  // Capacity: evict lightest, then oldest (FF: "prune the oldest/lowest weight").
  if (bullets.length > CHEKHOV_MAX_BULLETS) {
    const evictionOrder = [...bullets].sort(
      (a, b) => a.weight - b.weight || b.age - a.age || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    const evicted = new Set(
      evictionOrder.slice(0, bullets.length - CHEKHOV_MAX_BULLETS).map((b) => b.id),
    )
    bullets = bullets.filter((b) => !evicted.has(b.id))
  }

  // Spread the input state: top-level passthrough fields must survive the
  // round trip (dropping them destroyed forward-compat AND made the store's
  // value-identity skip permanently false — one write per turn, review 1+2+3).
  const result: ChekhovState = { ...input.state, bullets, nextId }
  const cooldown = input.firedBulletId
    ? CHEKHOV_FIRE_COOLDOWN
    : Math.max(0, (input.state.cooldown ?? 0) - 1)
  delete result.cooldown
  if (cooldown > 0) result.cooldown = cooldown
  return result
}

/** The engine-authored seed for a completed research agenda (the FF coupling:
 * "research/investigate: Plant Chekhov seed"). Inputs are already sanitized
 * (goal at agenda accept/read; name from the character row) but the seed is
 * re-sanitized at load like every other. */
export function researchSeed(characterName: string, goal: string): ChekhovLoad {
  return {
    description: `${characterName} learned something while ${goal}`,
    weight: 2,
    subjects: [characterName],
  }
}

// ---- [CALLBACK] block rendering ----

export const CALLBACK_HEADER = '[CALLBACK — an earlier thread resurfaces]'

/** Render the fired bullet as a one-turn narrator directive. The description
 * is re-sanitized at render — this is an exported prompt surface and "never
 * trust stored values" applies even though every current caller passes a
 * read-normalized bullet. */
export function buildCallbackBlock(bullet: ChekhovBullet): string {
  return `${CALLBACK_HEADER}
Earlier in this story: ${sanitizeDebtText(bullet.description, CHEKHOV_DESC_MAX)}
Weave this back into the scene now, naturally and concretely — as a payoff, a return, or a consequence. Let it feel deliberate, never announced. If no elegant opening exists this beat, let it pass unremarked; it will find another moment.`
}
