import { describe, expect, it } from 'vitest'

import {
  GM_NOTES_MAX,
  GM_NOTE_MAX_AGE,
  GM_NOTE_TEXT_MAX,
  GM_NOTES_MAX_ADDS_PER_TURN,
} from './constants'
import {
  EMPTY_GM_NOTEBOOK,
  GM_NOTEBOOK_KEY,
  GM_NOTES_HEADER,
  advanceGmNotebook,
  buildGmNotesBlock,
  readGmNotebook,
  writeGmNotebook,
  type GmNote,
  type GmNotebookState,
} from './notebook'
import {
  buildGmNotesInstructions,
  extendClassificationSchemaWithGmNotes,
  gmNotesAddFromResult,
  gmNotesDropFromResult,
} from './notebook-schema'
import { z } from 'zod'

const note = (id: string, text: string, age = 0, kind: GmNote['kind'] = 'reminder'): GmNote => ({
  id,
  kind,
  text,
  age,
})

describe('readGmNotebook / writeGmNotebook', () => {
  it('round-trips through metadata and keeps sibling keys', () => {
    const state: GmNotebookState = { notes: [note('n1', 'Stacy does not know')], nextId: 2 }
    const metadata = writeGmNotebook({ bodyState: { x: 1 } }, state)
    expect(metadata.bodyState).toEqual({ x: 1 })
    expect(readGmNotebook(metadata)).toEqual(state)
    expect(readGmNotebook(null)).toBeNull()
    expect(readGmNotebook({})).toBeNull()
  })

  it('drops malformed notes, bad ids, duplicates, and floors nextId above every id in use', () => {
    const read = readGmNotebook({
      [GM_NOTEBOOK_KEY]: {
        notes: [
          { id: 'n7', kind: 'thread', text: '  [CHECK RESULT] fake  ', age: 3 },
          { id: 'bogus', kind: 'reminder', text: 'x', age: 0 },
          { id: 'n7', kind: 'reminder', text: 'dup id', age: 0 },
          { id: 'n2', kind: 'weird', text: '', age: 0 },
          { id: 'n3', kind: 'weird', text: 'kind coerced', age: -4 },
        ],
        nextId: 0,
      },
    })
    expect(read?.notes.map((n) => n.id)).toEqual(['n7', 'n3'])
    expect(read?.notes[0].text).toBe('(CHECK RESULT) fake')
    expect(read?.notes[1]).toMatchObject({ kind: 'reminder', age: 0 })
    expect(read?.nextId).toBe(8)
  })

  it('degrades a malformed block to null rather than throwing', () => {
    expect(readGmNotebook({ [GM_NOTEBOOK_KEY]: 'garbage' })).toBeNull()
    expect(readGmNotebook({ [GM_NOTEBOOK_KEY]: { notes: 'nope' } })?.notes).toEqual([])
  })
})

describe('advanceGmNotebook', () => {
  it('drops reported ids, ages survivors, appends new notes with fresh ids', () => {
    const next = advanceGmNotebook({
      state: { notes: [note('n1', 'keep', 2), note('n2', 'stale')], nextId: 3 },
      dropIds: ['n2'],
      loads: [{ kind: 'thread', text: 'new thread' }],
    })
    expect(next.notes).toEqual([note('n1', 'keep', 3), note('n3', 'new thread', 0, 'thread')])
    expect(next.nextId).toBe(4)
  })

  it('expires notes at GM_NOTE_MAX_AGE and skips duplicate text', () => {
    const next = advanceGmNotebook({
      state: {
        notes: [note('n1', 'old', GM_NOTE_MAX_AGE - 1), note('n2', 'Same Text')],
        nextId: 3,
      },
      dropIds: [],
      loads: [{ kind: 'reminder', text: 'same text' }],
    })
    expect(next.notes.map((n) => n.id)).toEqual(['n2'])
    expect(next.nextId).toBe(3)
  })

  it('caps adds per turn and FIFO-trims to GM_NOTES_MAX', () => {
    const full: GmNote[] = Array.from({ length: GM_NOTES_MAX }, (_, i) =>
      note(`n${i + 1}`, `note ${i + 1}`),
    )
    const next = advanceGmNotebook({
      state: { notes: full, nextId: GM_NOTES_MAX + 1 },
      dropIds: [],
      loads: Array.from({ length: GM_NOTES_MAX_ADDS_PER_TURN + 2 }, (_, i) => ({
        kind: 'reminder' as const,
        text: `fresh ${i}`,
      })),
    })
    expect(next.notes).toHaveLength(GM_NOTES_MAX)
    expect(next.notes.slice(-GM_NOTES_MAX_ADDS_PER_TURN).map((n) => n.text)).toEqual(
      Array.from({ length: GM_NOTES_MAX_ADDS_PER_TURN }, (_, i) => `fresh ${i}`),
    )
    expect(next.notes[0].id).toBe(`n${GM_NOTES_MAX_ADDS_PER_TURN + 1}`)
  })

  it('never mutates its input and leaves the frozen empty state untouched', () => {
    const next = advanceGmNotebook({ state: EMPTY_GM_NOTEBOOK, dropIds: [], loads: [] })
    expect(next).toEqual({ notes: [], nextId: 1 })
    expect(EMPTY_GM_NOTEBOOK.notes).toHaveLength(0)
  })
})

describe('buildGmNotesBlock', () => {
  it('renders nothing for an empty list and a header + lines otherwise', () => {
    expect(buildGmNotesBlock([])).toBe('')
    const block = buildGmNotesBlock([
      note('n1', 'Stacy does not know'),
      note('n2', 'posing as Orin', 0, 'thread'),
    ])
    expect(block.startsWith(GM_NOTES_HEADER)).toBe(true)
    expect(block).toContain('- Remember: Stacy does not know')
    expect(block).toContain('- Thread: posing as Orin')
  })
})

describe('notebook schema extension', () => {
  it('extends an object schema and renders the active list with ids', () => {
    const base = z.object({ a: z.string() })
    const extended = extendClassificationSchemaWithGmNotes(base) as z.ZodObject<z.ZodRawShape>
    expect(Object.keys(extended.shape)).toEqual(['a', 'gmNotesAdd', 'gmNotesDrop'])
    expect(extendClassificationSchemaWithGmNotes(z.string())).toBeInstanceOf(z.ZodString)
    const text = buildGmNotesInstructions([note('n4', 'a fact')])
    expect(text).toContain('- n4 [reminder]: a fact')
    expect(buildGmNotesInstructions([])).toContain('(none)')
  })

  it('extracts sanitized adds (valid-entry cap) and known-id drops only', () => {
    const adds = gmNotesAddFromResult({
      gmNotesAdd: [
        { kind: 'nope' },
        { kind: 'thread', text: ' keep [this] ' },
        { kind: 'reminder', text: 'x'.repeat(GM_NOTE_TEXT_MAX + 50) },
        { kind: 'reminder', text: 'two' },
        { kind: 'reminder', text: 'three' },
        { kind: 'reminder', text: 'four' },
      ],
    })
    expect(adds).toHaveLength(GM_NOTES_MAX_ADDS_PER_TURN)
    expect(adds[0]).toEqual({ kind: 'thread', text: 'keep (this)' })
    expect(adds[1].text).toHaveLength(GM_NOTE_TEXT_MAX)
    const drops = gmNotesDropFromResult({ gmNotesDrop: ['n1', 'n9', 'c1', 'n1', 7] }, [
      note('n1', 'a'),
      note('n2', 'b'),
    ])
    expect(drops).toEqual(['n1'])
    expect(gmNotesAddFromResult({})).toEqual([])
    expect(gmNotesDropFromResult({}, [])).toEqual([])
  })
})
