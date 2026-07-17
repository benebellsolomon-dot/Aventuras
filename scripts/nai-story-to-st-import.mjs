#!/usr/bin/env node
/**
 * Convert a NovelAI .story export into Aventuras-importable artifacts:
 *   1. <slug>.chat.jsonl      — SillyTavern chat (Aventuras "ST Import Wizard" format:
 *                               header line, then {is_user, is_system, mes} per line)
 *   2. <slug>.worldinfo.json  — SillyTavern World Info (Aventuras lorebook import)
 *
 * Decoding: content.document is a msgpackr stream (record ext 0x72) with NovelAI's
 * custom extensions (20/30/31/40/41) layered on top — registered here as transparent
 * wrappers since we only need sections/order/text.
 *
 * User-vs-AI classification: NAI's editor annotates model-generated text with
 * origin spans (section.meta["1"]). Sections with NO spans were human-typed →
 * user turns. (A handful of model-echoed inputs land as narration; harmless.)
 *
 * Usage: node scripts/nai-story-to-st-import.mjs <path/to/export.story> [outDir]
 * Requires: msgpackr (devDependency of this repo).
 */

import fs from 'node:fs'
import path from 'node:path'
import * as msgpackr from 'msgpackr'

const NAI_CUSTOM_EXTS = [20, 30, 31, 40, 41]
// NAI-script tooling entries that are meaningless outside NovelAI/SE — do not migrate.
const SKIP_LORE_ENTRIES = new Set(['BE: Authoring Guidance', 'BE: Managed Blocks Off-Limits'])

function decodeDocument(b64) {
  const unpackr = new msgpackr.Unpackr({ mapsAsObjects: false, int64AsType: 'number' })
  for (const type of NAI_CUSTOM_EXTS) {
    msgpackr.addExtension({
      type,
      unpack(data) {
        try {
          return { __ext: type, v: unpackr.unpack(data) }
        } catch {
          return { __ext: type, raw: Buffer.from(data).toString('hex') }
        }
      },
    })
  }
  const values = unpackr.unpackMultiple(Buffer.from(b64, 'base64'))
  const root = values.find(
    (v) => v && typeof v === 'object' && !Array.isArray(v) && v.sections !== undefined,
  )
  if (!root) throw new Error('no document root (sections/order) found in msgpackr stream')
  return root
}

function sectionIsUserTyped(section) {
  const spans = section?.meta?.get?.(1) ?? section?.meta?.[1] ?? []
  return !Array.isArray(spans) || spans.length === 0
}

function toChatJsonl(story, doc) {
  const meta = story.metadata ?? {}
  const header = {
    user_name: 'Ben',
    character_name: meta.title || 'Imported Story',
    create_date: new Date(meta.createdAt ?? Date.now()).toISOString(),
  }
  const lines = [JSON.stringify(header)]
  let users = 0
  let narrations = 0
  const sections = doc.sections instanceof Map ? doc.sections : new Map(Object.entries(doc.sections))
  for (const id of doc.order) {
    const section = sections.get(id) ?? sections.get(String(id))
    const text = (section?.text ?? '').trimEnd()
    if (!text.trim()) continue
    const isUser = sectionIsUserTyped(section)
    isUser ? users++ : narrations++
    lines.push(JSON.stringify({ is_user: isUser, is_system: false, mes: text }))
  }
  return { jsonl: lines.join('\n') + '\n', users, narrations }
}

function stEntryDefaults(uid) {
  return {
    uid,
    key: [],
    keysecondary: [],
    comment: '',
    content: '',
    constant: false,
    vectorized: false,
    selective: true,
    selectiveLogic: 0,
    addMemo: true,
    order: 100,
    position: 0,
    disable: false,
    ignoreBudget: false,
    excludeRecursion: false,
    preventRecursion: false,
    matchPersonaDescription: false,
    matchCharacterDescription: false,
    matchCharacterPersonality: false,
    matchCharacterDepthPrompt: false,
    matchScenario: false,
    matchCreatorNotes: false,
    delayUntilRecursion: 0,
    probability: 100,
    useProbability: true,
    depth: 4,
    outletName: '',
    group: '',
    groupOverride: false,
    groupWeight: 100,
    scanDepth: null,
    caseSensitive: null,
    matchWholeWords: null,
    useGroupScoring: null,
    automationId: '',
    role: null,
    sticky: null,
    cooldown: null,
    delay: null,
    triggers: [],
    displayIndex: uid,
    characterFilter: { isExclude: false, names: [], tags: [] },
  }
}

function toWorldInfo(story) {
  const lorebook = story.content?.lorebook ?? { entries: [] }
  const categories = new Map((lorebook.categories ?? []).map((c) => [c.id, c.name]))
  const entries = {}
  let uid = 0
  let skipped = 0
  for (const e of lorebook.entries ?? []) {
    const name = e.displayName ?? ''
    if (SKIP_LORE_ENTRIES.has(name)) {
      skipped++
      continue
    }
    const category = categories.get(e.category)
    const constant = !!(e.forceActivation ?? e.alwaysOn)
    entries[String(uid)] = {
      ...stEntryDefaults(uid),
      key: (e.keys ?? []).filter(Boolean),
      comment: category ? `${name} [${category}]` : name,
      content: e.text ?? '',
      constant,
      selective: !constant,
      disable: e.enabled === false,
      order: 100 + uid,
    }
    uid++
  }
  return {
    worldInfo: { entries, name: `${story.metadata?.title ?? 'Imported'} — Lorebook` },
    count: uid,
    skipped,
  }
}

const storyPath = process.argv[2]
if (!storyPath) {
  console.error('usage: node scripts/nai-story-to-st-import.mjs <export.story> [outDir]')
  process.exit(2)
}
const outDir = process.argv[3] ?? path.dirname(storyPath)
fs.mkdirSync(outDir, { recursive: true })

const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'))
const slug = (story.metadata?.title ?? 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-')
const doc = decodeDocument(story.content.document)

const chat = toChatJsonl(story, doc)
const chatPath = path.join(outDir, `${slug}.chat.jsonl`)
fs.writeFileSync(chatPath, chat.jsonl)
console.log(`chat:     ${chatPath} (${chat.users} user turns, ${chat.narrations} narration)`)

const { worldInfo, count, skipped } = toWorldInfo(story)
const worldPath = path.join(outDir, `${slug}.worldinfo.json`)
fs.writeFileSync(worldPath, JSON.stringify(worldInfo, null, 2))
console.log(`lorebook: ${worldPath} (${count} entries, ${skipped} NAI-tooling entries skipped)`)
