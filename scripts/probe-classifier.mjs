// Phase-1 classifier schema-compliance probe scorer (research/37 Phase 1, folds
// research/34 §C8). READ-ONLY: scores the live DB's persisted classification
// results against the acceptance gate — ≥10 BE turns, 100% parseable, 0
// refusals, no malformed items. Run any time during/after the Lucy playtest:
//
//   node scripts/probe-classifier.mjs [storyTitleSubstring=Lucy]
//
// Measurement limits (accepted for a read-only phase): the stored
// classificationResult is the zod-PARSED output, and beEvents/beStates carry
// `.default([])` — a model that silently DROPS a whole field is stored as [],
// indistinguishable from a legitimate empty turn. What this script can catch:
// hard failures (refusal/non-JSON → no world_state_delta on the entry),
// malformed items that slipped past coercion, and the dry-turn rate for Ben to
// eyeball against what actually happened in each scene.
import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DB_PATH = join(homedir(), 'Library/Application Support/com.karelian.aventura/aventura.db')
const GATE_MIN_TURNS = 10
const BE_EVENT_KINDS = new Set(['catalyst', 'contact', 'milking', 'attempt', 'stabilize'])
const BE_ATTITUDES = new Set(['craving', 'accepting', 'conflicted', 'fearful', 'resentful'])

const titleQuery = process.argv[2] ?? 'Lucy'
const db = new DatabaseSync(`file:${DB_PATH}?mode=ro`, { readOnly: true })

const story = db
  .prepare('SELECT id, title, current_branch_id FROM stories WHERE title LIKE ?')
  .get(`%${titleQuery}%`)
if (!story) {
  console.error(`No story matching "${titleQuery}"`)
  process.exit(1)
}

// Current-branch narration entries; the opening (min position) is never classified.
const entries = db
  .prepare(
    `SELECT id, position, created_at, world_state_delta FROM story_entries
     WHERE story_id = ? AND type = 'narration'
       AND (branch_id IS NULL OR branch_id = ?)
     ORDER BY position`,
  )
  .all(story.id, story.current_branch_id)
const classifiable = entries.slice(1)

const failures = []
const itemErrors = []
let dryTurns = 0
const kindCounts = {}
const outcomeCounts = {}
const trajectory = []

function auditEvent(item, entryTag) {
  if (typeof item.character !== 'string' || item.character.length === 0)
    itemErrors.push(`${entryTag} beEvent bad character: ${JSON.stringify(item)}`)
  if (!BE_EVENT_KINDS.has(item.kind))
    itemErrors.push(`${entryTag} beEvent bad kind: ${JSON.stringify(item.kind)}`)
  if (typeof item.intensity !== 'number' || item.intensity < 1 || item.intensity > 3)
    itemErrors.push(`${entryTag} beEvent bad intensity: ${JSON.stringify(item.intensity)}`)
  kindCounts[item.kind] = (kindCounts[item.kind] ?? 0) + 1
}

function auditState(item, entryTag) {
  if (typeof item.character !== 'string' || item.character.length === 0)
    itemErrors.push(`${entryTag} beState bad character: ${JSON.stringify(item)}`)
  if (item.attitude !== undefined && !BE_ATTITUDES.has(item.attitude))
    itemErrors.push(`${entryTag} beState bad attitude: ${JSON.stringify(item.attitude)}`)
  for (const field of ['arousal', 'fluidFill']) {
    const v = item[field]
    if (v !== undefined && (typeof v !== 'number' || v < 0 || v > 100))
      itemErrors.push(`${entryTag} beState bad ${field}: ${JSON.stringify(v)}`)
  }
}

for (const entry of classifiable) {
  const when = new Date(entry.created_at).toISOString().slice(0, 16)
  const entryTag = `[${entry.id.slice(0, 8)} ${when}]`
  const delta = entry.world_state_delta ? JSON.parse(entry.world_state_delta) : null
  const result = delta?.classificationResult
  if (!result) {
    failures.push(entryTag)
    continue
  }
  const beEvents = Array.isArray(result.beEvents) ? result.beEvents : []
  const beStates = Array.isArray(result.beStates) ? result.beStates : []
  if (beEvents.length === 0 && beStates.length === 0) dryTurns += 1
  beEvents.forEach((e) => auditEvent(e, entryTag))
  beStates.forEach((s) => auditState(s, entryTag))
  for (const rec of delta.beLog ?? []) {
    outcomeCounts[rec.outcome] = (outcomeCounts[rec.outcome] ?? 0) + 1
    trajectory.push(
      `${when} ${rec.character} ${rec.kind}→${rec.outcome}` +
        ` tier ${rec.tierAfter}${rec.note ? ` (${rec.note})` : ''}`,
    )
  }
}

const parsed = classifiable.length - failures.length
const parseRate = classifiable.length ? ((100 * parsed) / classifiable.length).toFixed(1) : 'n/a'
const gate =
  classifiable.length >= GATE_MIN_TURNS && failures.length === 0 && itemErrors.length === 0

console.log(`Story: ${story.title} (${story.id.slice(0, 8)})`)
console.log(`Classifiable narration turns: ${classifiable.length} (gate needs ≥${GATE_MIN_TURNS})`)
console.log(`Parsed (world_state_delta present): ${parsed}/${classifiable.length} = ${parseRate}%`)
console.log(`Hard failures (refusal/non-JSON — no delta): ${failures.length}`)
failures.forEach((f) => console.log(`  FAIL ${f}`))
console.log(`Malformed items: ${itemErrors.length}`)
itemErrors.forEach((e) => console.log(`  BAD  ${e}`))
console.log(`Dry turns (beEvents+beStates both empty): ${dryTurns}`)
console.log(`beEvent kinds: ${JSON.stringify(kindCounts)}`)
console.log(`Reducer outcomes (beLog): ${JSON.stringify(outcomeCounts)}`)
console.log('\nCadence trajectory (for D5 pacing notes):')
trajectory.forEach((t) => console.log(`  ${t}`))
console.log(
  `\nGATE: ${gate ? 'PASS' : classifiable.length < GATE_MIN_TURNS ? `PENDING (${classifiable.length}/${GATE_MIN_TURNS} turns)` : 'FAIL'}`,
)
