/**
 * DatabaseService write-batch buffering (CR-1).
 *
 * Proves the turn-atomicity plumbing: the turn's own writes are buffered and
 * flushed atomically via the Rust `exec_batch_tx` command, while background
 * image/sprite/portrait writes bypass an open batch (the cross-batch
 * contamination fix). Uses a fake tauri Database that records execute() calls
 * and a fake `invoke` that records the flushed batch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface ExecCall {
  sql: string
  params: unknown[]
}

// Records every execute() that actually reaches the DB (i.e. was NOT buffered).
const executed: ExecCall[] = []
// Records the statements handed to exec_batch_tx on flush.
const invoked: { cmd: string; args: unknown }[] = []

const fakeDb = {
  execute: (sql: string, params: unknown[] = []) => {
    executed.push({ sql, params })
    return Promise.resolve({ rowsAffected: 1, lastInsertId: 0 })
  },
  select: () => Promise.resolve([]),
  close: () => Promise.resolve(),
}

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: () => Promise.resolve(fakeDb) },
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args: unknown) => {
    invoked.push({ cmd, args })
    return Promise.resolve(undefined)
  },
}))

const { database } = await import('./database')

/** Non-PRAGMA statements that actually hit the DB (init runs 3 PRAGMAs). */
function realWrites(): ExecCall[] {
  return executed.filter((c) => !c.sql.trim().toUpperCase().startsWith('PRAGMA'))
}
function flushedStatements(): { sql: string; params: unknown[] }[] {
  const last = invoked.at(-1)
  return (last?.args as { statements: { sql: string; params: unknown[] }[] })?.statements ?? []
}

describe('DatabaseService write batch (CR-1)', () => {
  beforeEach(async () => {
    await database.init() // idempotent; runs the PRAGMAs once
    executed.length = 0
    invoked.length = 0
    database.abortWriteBatch() // ensure no batch leaked from a prior test
  })

  it('buffers turn writes and flushes them via exec_batch_tx (not executed inline)', async () => {
    database.beginWriteBatch()
    await database.updateCharacter('char-1', { status: 'active' })
    await database.updateStoryEntry('entry-1', { worldStateDelta: null })

    // Nothing hit the DB directly while buffering.
    expect(realWrites()).toHaveLength(0)
    expect(invoked).toHaveLength(0)

    await database.commitWriteBatch()

    // One atomic flush carrying both statements.
    expect(invoked).toHaveLength(1)
    expect(invoked[0].cmd).toBe('exec_batch_tx')
    const stmts = flushedStatements()
    expect(stmts).toHaveLength(2)
    expect(stmts[0].sql).toMatch(/UPDATE characters/i)
    expect(stmts[1].sql).toMatch(/UPDATE story_entries|UPDATE entries/i)
  })

  it('background image/sprite/portrait writes BYPASS an open batch (contamination fix)', async () => {
    database.beginWriteBatch()
    // A turn write — buffered.
    await database.updateCharacter('char-1', { status: 'active' })
    // Background writes that can complete mid-turn — must execute immediately.
    await database.updateCharacterPortrait('char-1', 'data:image/png;base64,AAAA')
    await database.createEmbeddedImage({
      id: 'img-1',
      storyId: 's1',
      entryId: 'e1',
      sourceText: 't',
      prompt: 'p',
      styleId: null,
      model: 'm',
      imageData: 'd',
      width: 1,
      height: 1,
      status: 'complete',
      errorMessage: null,
    } as never)

    // The background writes hit the DB directly despite the open batch...
    const direct = realWrites()
    expect(direct.some((c) => /UPDATE characters SET portrait/i.test(c.sql))).toBe(true)
    expect(direct.some((c) => /INSERT INTO embedded_images/i.test(c.sql))).toBe(true)
    // ...and were NOT swept into the batch.
    await database.commitWriteBatch()
    const stmts = flushedStatements()
    expect(stmts.every((s) => !/embedded_images|SET portrait/i.test(s.sql))).toBe(true)
    // Only the turn write was flushed.
    expect(stmts).toHaveLength(1)
    expect(stmts[0].sql).toMatch(/UPDATE characters SET status/i)
  })

  it('abortWriteBatch discards buffered writes without flushing', async () => {
    database.beginWriteBatch()
    await database.updateCharacter('char-1', { status: 'active' })
    database.abortWriteBatch()

    expect(realWrites()).toHaveLength(0)
    expect(invoked).toHaveLength(0)

    // A subsequent write (no batch open) executes normally.
    await database.updateCharacter('char-2', { status: 'active' })
    expect(realWrites()).toHaveLength(1)
  })
})
