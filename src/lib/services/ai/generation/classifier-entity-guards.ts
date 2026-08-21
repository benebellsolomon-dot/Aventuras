/**
 * Entity-routing plausibility guards for the world-state classifier.
 *
 * The schema can only say that `newCharacters[].name` is a string — it cannot
 * say that the string is a person. A provider that fills the JSON by POSITION
 * instead of by key (D5 playtest, research/63: GLM 5.2 on NanoGPT) produces a
 * result that parses cleanly yet routes a quest into `newCharacters`, a
 * four-sentence event into a location name, `scene.timeProgression`'s
 * "minutes" into `scene.currentLocationName`, and a known location into
 * `itemUpdates`. Nothing downstream questioned it, so every world panel filled
 * with junk rows.
 *
 * This is the accept-time guard (the normalizeBullet discipline from
 * worldsim/chekhov.ts): each entity must be cheaply plausible FOR ITS TYPE or
 * it is dropped with a recorded reason — never silently (rejects are logged in
 * dev and persisted on the result as `_guardRejects`, which rides into the
 * entry's worldStateDelta), never by failing the whole turn
 * (truncate-not-reject, research/62). It runs at the classifier seam (so the
 * persisted delta and the image/translation consumers see only accepted
 * entities) AND at the top of `applyClassificationResult` (so no store caller
 * can bypass it). Both calls are idempotent and pure.
 *
 * Rules, cheapest-first (review outcome in research/63 — every rule below
 * exists to catch an observed or demonstrated misroute while sparing the
 * legitimate names the review surfaced: "St. Mary's Hospital for the Infirm",
 * "Ally", "Na", "Revelation", CJK names, long epithet names):
 *  - HARD vocabulary (time words, status enums, JSON literals) can never be a
 *    name in any case or decoration — applies even to KNOWN names, so a junk
 *    "minutes" row can never be re-targeted as current.
 *  - SOFT vocabulary (beat types, item locations, relationship words) is a
 *    field-shift artifact only in its exact lowercase enum form ("quest"),
 *    while "Ally"/"Revelation" capitalized are names; known same-type updates
 *    bypass it entirely.
 *  - shape: a name is short (80 chars / 12 words; 30 chars when it has no
 *    spaces — a CJK paragraph), contains a letter, is not a time phrase, and is
 *    not sentence-shaped (a terminal mark mid-string after a non-abbreviation
 *    word, or any CJK terminal).
 *  - relationship-is-beat-type: a "character" whose relationship is
 *    quest/plot_point/event/… is a story beat that was routed into characters.
 *  - cross-type collision: a NEW location/item/beat that exactly names a KNOWN
 *    entity of another type is mis-routed ("The Kitchen" as an item). New
 *    characters collide only with beat titles — a person named exactly like a
 *    known place or object is rare but real (a sword-spirit "Dawn") and losing
 *    the character is the most consequential false positive.
 *  - paired rejection: a name rejected from a `new*` array is also rejected from
 *    the matching `*Updates` array (the update handler would stub the row).
 *  - Updates whose name matches a KNOWN same-type entity pass the shape and
 *    collision rules (the row exists; long user-created names stay updatable);
 *    unknown update names would create a stub, so they are held to the
 *    new-entity bar. `scene.currentLocationName` gets the same known-location
 *    bypass for shape rules only.
 *  - leaked enums are scrubbed OUT of prose fields (a description of "active",
 *    a relationship of "pending") on new entries and update `changes` alike —
 *    the field is dropped, never the row.
 *  - `scene.presentCharacterNames` drops entries that fail the name rules, so a
 *    single junk string can't suppress the presence fallback.
 */

import type {
  ClassificationResult,
  ClassifierEntityReject,
  GuardedEntityKind,
} from '../sdk/schemas/classifier'

export type { ClassifierEntityReject, GuardedEntityKind }

export const ENTITY_NAME_MAX = 80
export const ENTITY_NAME_MAX_WORDS = 12
/** A name with no spaces at all (CJK, a single token) is a paragraph long before 80 chars. */
export const SPACELESS_NAME_MAX = 30

const TIME_TOKENS = ['none', 'minutes', 'hours', 'days']
const STATUS_TOKENS = ['active', 'inactive', 'deceased', 'pending', 'completed', 'failed']
const LITERAL_TOKENS = ['true', 'false', 'null', 'undefined', 'n/a']
const BEAT_TYPE_TOKENS = ['milestone', 'quest', 'revelation', 'event', 'plot_point', 'plot point']
const ITEM_LOCATION_TOKENS = ['inventory', 'worn', 'ground']
const RELATIONSHIP_TOKENS = ['friend', 'enemy', 'ally', 'neutral', 'unknown', 'self']

/** Never a name, in any case: pure field-shift artifacts. */
const HARD_VOCABULARY = new Set([...TIME_TOKENS, ...STATUS_TOKENS, ...LITERAL_TOKENS])
/** A field-shift artifact only in exact lowercase enum form ("quest"); "Ally"/"Revelation" are names. */
const SOFT_VOCABULARY = new Set([
  ...BEAT_TYPE_TOKENS,
  ...ITEM_LOCATION_TOKENS,
  ...RELATIONSHIP_TOKENS,
])
/** A prose field (description, relationship, item location) holding one of these is a leaked enum. */
const PROSE_LEAK_VOCABULARY = new Set([
  ...TIME_TOKENS,
  ...STATUS_TOKENS,
  ...LITERAL_TOKENS,
  ...BEAT_TYPE_TOKENS,
])
const BEAT_TYPE_SET = new Set(BEAT_TYPE_TOKENS)

/**
 * Time routed into a name field: a bare unit ("minutes", "Hours"), an indefinite
 * quantity ("a few minutes", "several days pass"), or a definite/numbered span
 * WITH a qualifier ("two hours ago", "the days after"). "Seven Days", "Ten
 * Years" and "The Hours" stay — ordinary deadline-quest titles.
 */
const TIME_UNIT = '(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)'
const TIME_UNIT_OR_MOMENT = `(?:${TIME_UNIT}|moments?)`
const TIME_QUALIFIER = '(?:\\s+(?:later|ago|pass(?:es|ed)?|earlier|before|after))'
const TIME_PHRASE = new RegExp(
  `^(?:${TIME_UNIT}${TIME_QUALIFIER}?` +
    `|(?:a|an|about|some|several|few|a few|couple(?: of)?)\\s+${TIME_UNIT_OR_MOMENT}${TIME_QUALIFIER}?` +
    `|(?:the|next|that|those|these|many|two|three|four|five|six|seven|eight|nine|ten)\\s+${TIME_UNIT_OR_MOMENT}${TIME_QUALIFIER})$`,
  'i',
)
/** Words a terminal period legitimately follows inside a name (initials are handled separately). */
const ABBREVIATIONS = new Set([
  'st',
  'mt',
  'ft',
  'mr',
  'mrs',
  'ms',
  'mx',
  'dr',
  'prof',
  'fr',
  'sr',
  'jr',
  'sgt',
  'lt',
  'capt',
  'cpl',
  'col',
  'gen',
  'maj',
  'cmdr',
  'adm',
  'pvt',
  'rev',
  'hon',
  'no',
  'inc',
  'ltd',
  'co',
  'bros',
  'ave',
  'blvd',
  'rd',
  'vs',
  'etc',
  'ca',
  'esq',
  'pt',
])
const MID_TERMINAL = /([\p{L}\p{N}'’]+)[.!?]\s+\S/gu
/** CJK terminals AND clause punctuation — a name never contains these; a sentence does. */
const CJK_TERMINAL = /[。！？、，；：]/u
/** Invisible format chars (soft hyphen, bidi, ZWSP, word joiner, BOM, tag block); ZWJ/ZWNJ kept — load-bearing in emoji/Indic/Persian text. */
const FORMAT_CHARS =
  /[\u00ad\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\u{e0000}-\u{e007f}]/gu
const EDGE_PUNCTUATION = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu
const HAS_LETTER = /\p{L}/u

export interface KnownEntityNames {
  characters: ReadonlySet<string>
  locations: ReadonlySet<string>
  items: ReadonlySet<string>
  storyBeats: ReadonlySet<string>
}

export interface GuardedClassification<T extends ClassificationResult = ClassificationResult> {
  result: T
  rejects: ClassifierEntityReject[]
}

/** Whitespace-collapsed, format-char-free form used for every CHECK (never written back). */
const normalizeName = (value: unknown): string =>
  typeof value === 'string' ? value.replace(FORMAT_CHARS, '').replace(/\s+/g, ' ').trim() : ''
const lower = (value: string): string => value.toLowerCase()
/** Vocabulary key: normalized, edge punctuation stripped ("minutes." → "minutes"). */
const vocabKey = (name: string): string => name.replace(EDGE_PUNCTUATION, '')
const toLowerSet = (names: Iterable<string>): ReadonlySet<string> =>
  new Set(Array.from(names, (n) => lower(normalizeName(n))).filter((n) => n !== ''))

/** Build the known-name sets from the store's (or classifier context's) entity arrays. */
export function knownEntityNames(input: {
  characters: ReadonlyArray<{ name: string }>
  locations: ReadonlyArray<{ name: string }>
  items: ReadonlyArray<{ name: string }>
  storyBeats: ReadonlyArray<{ title: string }>
}): KnownEntityNames {
  return {
    characters: toLowerSet(input.characters.map((c) => c.name)),
    locations: toLowerSet(input.locations.map((l) => l.name)),
    items: toLowerSet(input.items.map((i) => i.name)),
    storyBeats: toLowerSet(input.storyBeats.map((b) => b.title)),
  }
}

const isHardVocabulary = (name: string): boolean => HARD_VOCABULARY.has(lower(vocabKey(name)))
/** Soft tokens only count in their exact lowercase enum form. */
const isSoftVocabulary = (name: string): boolean => SOFT_VOCABULARY.has(vocabKey(name))

function isSentenceShaped(name: string): boolean {
  if (CJK_TERMINAL.test(name)) return true
  const words = name.split(' ')
  if (words.length < 3) return false
  // A trailing mark is tolerated ("Ye Olde Shoppe of Wonders."): only MID-string
  // marks after a non-abbreviation, non-initial word read as a sentence boundary.
  for (const match of name.matchAll(MID_TERMINAL)) {
    const before = lower(match[1].replace(/[’']/g, ''))
    if (before.length > 1 && !ABBREVIATIONS.has(before)) return true
  }
  return false
}

/** Why a NORMALIZED name can't be an entity name at all (kind-independent). */
function shapeReason(name: string, includeSoftVocabulary: boolean): string | null {
  if (name === '') return 'empty'
  if (name.length > ENTITY_NAME_MAX) return `too-long (${name.length}>${ENTITY_NAME_MAX})`
  if (isHardVocabulary(name)) return 'schema-vocabulary'
  if (includeSoftVocabulary && isSoftVocabulary(name)) return 'schema-vocabulary'
  if (!HAS_LETTER.test(name)) return 'no-letters'
  if (TIME_PHRASE.test(vocabKey(name))) return 'time-phrase'
  if (!name.includes(' ') && name.length > SPACELESS_NAME_MAX) {
    return `too-long (${name.length}>${SPACELESS_NAME_MAX} spaceless)`
  }
  const words = name.split(' ').length
  if (words > ENTITY_NAME_MAX_WORDS) return `too-many-words (${words}>${ENTITY_NAME_MAX_WORDS})`
  if (isSentenceShaped(name)) return 'sentence-shaped'
  return null
}

type CrossType = keyof KnownEntityNames
const CROSS_TYPE_LABEL: Record<CrossType, string> = {
  characters: 'names-a-known-character',
  locations: 'names-a-known-location',
  items: 'names-a-known-item',
  storyBeats: 'names-a-known-story-beat',
}

function collisionReason(
  name: string,
  known: KnownEntityNames,
  against: ReadonlyArray<CrossType>,
): string | null {
  const key = lower(name)
  for (const type of against) {
    if (known[type].has(key)) return CROSS_TYPE_LABEL[type]
  }
  return null
}

const isProseLeak = (value: unknown): boolean =>
  typeof value === 'string' &&
  (value.trim() === '' || PROSE_LEAK_VOCABULARY.has(lower(vocabKey(normalizeName(value)))))

/** Drop (never rewrite) prose fields that hold a leaked enum token; same object when clean. */
function scrubLeaks<T extends object>(entry: T, fields: ReadonlyArray<keyof T & string>): T {
  const leaked = fields.filter(
    (f) => f in entry && isProseLeak((entry as Record<string, unknown>)[f]),
  )
  if (leaked.length === 0) return entry
  const out = { ...(entry as Record<string, unknown>) }
  for (const f of leaked) delete out[f]
  return out as T
}

interface EntityRule {
  kind: Exclude<GuardedEntityKind, 'currentLocation' | 'presentCharacter'>
  /** Types a NEW entity of this kind may not share a name with. */
  collidesWith: ReadonlyArray<CrossType>
  /** The same-type known set (update names found here bypass soft vocabulary, shape and collision). */
  own: CrossType
}

const CHARACTER_RULE: EntityRule = {
  kind: 'character',
  collidesWith: ['storyBeats'],
  own: 'characters',
}
const LOCATION_RULE: EntityRule = {
  kind: 'location',
  collidesWith: ['characters', 'items', 'storyBeats'],
  own: 'locations',
}
const ITEM_RULE: EntityRule = {
  kind: 'item',
  collidesWith: ['characters', 'locations', 'storyBeats'],
  own: 'items',
}
const BEAT_RULE: EntityRule = {
  kind: 'storyBeat',
  collidesWith: ['characters', 'locations', 'items'],
  own: 'storyBeats',
}

/** Reason a NEW entity (or an update that would stub one) is implausible for its kind. */
function newEntityReason(name: string, rule: EntityRule, known: KnownEntityNames): string | null {
  return shapeReason(name, true) ?? collisionReason(name, known, rule.collidesWith)
}

/** Known-name bypass: an existing same-type entity only has to clear the hard vocabulary. */
function updateReason(name: string, rule: EntityRule, known: KnownEntityNames): string | null {
  if (name === '') return 'empty'
  if (isHardVocabulary(name)) return 'schema-vocabulary'
  if (known[rule.own].has(lower(name))) return null
  return newEntityReason(name, rule, known)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const asArray = <T>(value: unknown): ReadonlyArray<T> =>
  Array.isArray(value) ? (value as T[]) : []

interface FilterOutcome<T> {
  kept: T[]
  /** Lowercased normalized names of rejected entries (for paired rejection). */
  rejectedNames: Set<string>
}

/**
 * Generic array pass: each entry is checked on its NORMALIZED name key but kept
 * verbatim (the store matches raw stored names — rewriting would split an
 * existing "The  Kitchen" row into a duplicate). `kind` labels the reject.
 */
function filterEntries<T extends object>(
  entries: ReadonlyArray<T>,
  field: string,
  kind: GuardedEntityKind,
  nameKey: keyof T & string,
  reasonFor: (name: string, entry: T) => string | null,
  rejects: ClassifierEntityReject[],
  scrub: (entry: T) => T = (e) => e,
): FilterOutcome<T> {
  const kept: T[] = []
  const rejectedNames = new Set<string>()
  for (const entry of entries) {
    if (!isRecord(entry)) {
      rejects.push({ kind, field, name: String(entry), reason: 'malformed-entry' })
      continue
    }
    const raw = entry[nameKey]
    const name = normalizeName(raw)
    const reason = typeof raw !== 'string' ? 'not-a-string' : reasonFor(name, entry)
    if (reason) {
      rejects.push({ kind, field, name: name || String(raw), reason })
      if (name !== '') rejectedNames.add(lower(name))
    } else {
      kept.push(scrub(entry))
    }
  }
  return { kept, rejectedNames }
}

const sameEntries = <T>(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])

/**
 * Drop implausibly-routed entities from a classification result. Pure: returns
 * the SAME object when nothing was rejected or scrubbed, otherwise a shallow
 * copy with the affected arrays/fields replaced (extension arrays, runtime-var
 * defs and every other key pass through untouched). Rejects are returned AND
 * appended to `result._guardRejects` on the copy so they persist with the turn.
 */
export function guardClassifierEntities<T extends ClassificationResult>(
  result: T,
  known: KnownEntityNames,
): GuardedClassification<T> {
  const rejects: ClassifierEntityReject[] = []
  type EntryUpdates = ClassificationResult['entryUpdates']
  type Scene = ClassificationResult['scene']
  const eu: EntryUpdates = isRecord(result.entryUpdates)
    ? result.entryUpdates
    : ({} as EntryUpdates)
  const scene: Scene = isRecord(result.scene)
    ? result.scene
    : { currentLocationName: null, presentCharacterNames: [], timeProgression: 'none' }
  const arr = <K extends keyof EntryUpdates>(key: K): ReadonlyArray<EntryUpdates[K][number]> =>
    asArray(eu[key])

  const pairedReason =
    (rejectedNew: Set<string>, reasonFor: (name: string) => string | null) =>
    (name: string): string | null =>
      rejectedNew.has(lower(name)) ? 'paired-new-entry-rejected' : reasonFor(name)

  // Characters
  const newCharacters = filterEntries(
    arr('newCharacters'),
    'newCharacters',
    'character',
    'name',
    (name, c) =>
      typeof c.relationship === 'string' && BEAT_TYPE_SET.has(lower(normalizeName(c.relationship)))
        ? 'relationship-is-beat-type'
        : newEntityReason(name, CHARACTER_RULE, known),
    rejects,
    (c) => scrubLeaks(c, ['description', 'relationship']),
  )
  const characterUpdates = filterEntries(
    arr('characterUpdates'),
    'characterUpdates',
    'character',
    'name',
    pairedReason(newCharacters.rejectedNames, (name) => updateReason(name, CHARACTER_RULE, known)),
    rejects,
    (u) =>
      isRecord(u.changes) && isProseLeak(u.changes.relationship)
        ? { ...u, changes: scrubLeaks(u.changes, ['relationship']) }
        : u,
  )

  // Locations
  const newLocations = filterEntries(
    arr('newLocations'),
    'newLocations',
    'location',
    'name',
    (name) => newEntityReason(name, LOCATION_RULE, known),
    rejects,
    (l) => scrubLeaks(l, ['description']),
  )
  const locationUpdates = filterEntries(
    arr('locationUpdates'),
    'locationUpdates',
    'location',
    'name',
    pairedReason(newLocations.rejectedNames, (name) => updateReason(name, LOCATION_RULE, known)),
    rejects,
    (u) => {
      if (!isRecord(u.changes)) return u
      const scrubbed = scrubLeaks(u.changes, ['description', 'descriptionAddition'])
      return scrubbed === u.changes ? u : { ...u, changes: scrubbed }
    },
  )

  // Items
  const newItems = filterEntries(
    arr('newItems'),
    'newItems',
    'item',
    'name',
    (name) => newEntityReason(name, ITEM_RULE, known),
    rejects,
    (i) => scrubLeaks(i, ['description', 'location']),
  )
  const itemUpdates = filterEntries(
    arr('itemUpdates'),
    'itemUpdates',
    'item',
    'name',
    pairedReason(newItems.rejectedNames, (name) => updateReason(name, ITEM_RULE, known)),
    rejects,
    (u) => {
      if (!isRecord(u.changes)) return u
      const scrubbed = scrubLeaks(u.changes, ['location'])
      return scrubbed === u.changes ? u : { ...u, changes: scrubbed }
    },
  )

  // Story beats
  const newStoryBeats = filterEntries(
    arr('newStoryBeats'),
    'newStoryBeats',
    'storyBeat',
    'title',
    (title) => newEntityReason(title, BEAT_RULE, known),
    rejects,
    (b) => scrubLeaks(b, ['description']),
  )
  const storyBeatUpdates = filterEntries(
    arr('storyBeatUpdates'),
    'storyBeatUpdates',
    'storyBeat',
    'title',
    pairedReason(newStoryBeats.rejectedNames, (title) => updateReason(title, BEAT_RULE, known)),
    rejects,
    (u) => {
      if (!isRecord(u.changes)) return u
      const scrubbed = scrubLeaks(u.changes, ['description'])
      return scrubbed === u.changes ? u : { ...u, changes: scrubbed }
    },
  )

  // scene.currentLocationName: a place name or null. Hard vocabulary has no
  // bypass — "minutes" must never be (re-)targeted as current; a KNOWN location
  // skips the shape rules (long user-named places stay reachable).
  const rawCurrent = scene.currentLocationName
  let currentLocationName: string | null | undefined = rawCurrent
  if (rawCurrent !== null && rawCurrent !== undefined) {
    const name = normalizeName(rawCurrent)
    let reason: string | null
    if (typeof rawCurrent !== 'string') reason = 'not-a-string'
    else if (isHardVocabulary(name) || name === '')
      reason = name === '' ? 'empty' : 'schema-vocabulary'
    else if (known.locations.has(lower(name))) reason = null
    else
      reason =
        shapeReason(name, true) ??
        collisionReason(name, known, ['characters', 'items', 'storyBeats'])
    if (reason) {
      rejects.push({
        kind: 'currentLocation',
        field: 'scene.currentLocationName',
        name: name || String(rawCurrent),
        reason,
      })
      currentLocationName = null
    }
  }

  // scene.presentCharacterNames: drop junk entries (a single junk string would
  // otherwise suppress the presence engine's "everyone tracked" fallback).
  const rawPresent = asArray<unknown>(scene.presentCharacterNames)
  const presentCharacterNames: string[] = []
  for (const entry of rawPresent) {
    const name = normalizeName(entry)
    let reason: string | null
    if (typeof entry !== 'string') reason = 'not-a-string'
    else if (name === '') reason = 'empty'
    else if (isHardVocabulary(name)) reason = 'schema-vocabulary'
    else if (known.characters.has(lower(name))) reason = null
    else reason = shapeReason(name, true)
    if (reason) {
      rejects.push({
        kind: 'presentCharacter',
        field: 'scene.presentCharacterNames',
        name: name || String(entry),
        reason,
      })
    } else {
      presentCharacterNames.push(entry as string)
    }
  }

  // A slot whose source was not an array is rebuilt too (the store dereferences
  // every array unconditionally), hence the identity check against the raw slot.
  const changed = <K extends keyof EntryUpdates>(kept: ReadonlyArray<unknown>, key: K): boolean =>
    !Array.isArray(eu[key]) || !sameEntries(kept, arr(key))
  const arraysChanged =
    eu !== result.entryUpdates ||
    changed(newCharacters.kept, 'newCharacters') ||
    changed(characterUpdates.kept, 'characterUpdates') ||
    changed(newLocations.kept, 'newLocations') ||
    changed(locationUpdates.kept, 'locationUpdates') ||
    changed(newItems.kept, 'newItems') ||
    changed(itemUpdates.kept, 'itemUpdates') ||
    changed(newStoryBeats.kept, 'newStoryBeats') ||
    changed(storyBeatUpdates.kept, 'storyBeatUpdates')
  const sceneChanged =
    scene !== result.scene ||
    currentLocationName !== rawCurrent ||
    !Array.isArray(scene.presentCharacterNames) ||
    !sameEntries(presentCharacterNames, rawPresent)

  if (!arraysChanged && !sceneChanged && rejects.length === 0) return { result, rejects }

  const guarded: T = {
    ...result,
    entryUpdates: arraysChanged
      ? {
          ...eu,
          newCharacters: newCharacters.kept,
          characterUpdates: characterUpdates.kept,
          newLocations: newLocations.kept,
          locationUpdates: locationUpdates.kept,
          newItems: newItems.kept,
          itemUpdates: itemUpdates.kept,
          newStoryBeats: newStoryBeats.kept,
          storyBeatUpdates: storyBeatUpdates.kept,
        }
      : result.entryUpdates,
    scene: sceneChanged ? { ...scene, currentLocationName, presentCharacterNames } : result.scene,
  }
  if (rejects.length > 0) guarded._guardRejects = [...(result._guardRejects ?? []), ...rejects]
  return { result: guarded, rejects }
}
