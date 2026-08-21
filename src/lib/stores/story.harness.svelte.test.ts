/**
 * Store harness foundation (CR-1 prerequisite, research/54).
 *
 * Proves the runes StoryStore can be instantiated and DRIVEN through a real write
 * path with a recording DB mock. This is the base the CR-1 turn-atomicity tests
 * build on (drive applyClassificationResult with tracking ON, fail the delta write,
 * assert all-or-nothing once the turn is wrapped in a transaction).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { readBodyState, relOf, writeBodyState, defaultBodyState } from '$lib/services/be'
import { readNpcAgenda, writeNpcAgenda, type NpcAgenda } from '$lib/services/worldsim'
import { defaultRpgSheet } from '$lib/services/rpg'

import {
  makeCharacter,
  makeClassificationResult,
  makeDbRecorder,
  makeGirlWithBodyState,
  makeProtagonist,
  makeSettings,
  makeStory,
  makeUi,
  type DbRecorder,
} from './__harness__/storeHarness'

const db = makeDbRecorder()
const settingsMock = makeSettings()
const uiMock = makeUi()

vi.mock('$lib/services/database', () => ({ database: db.database }))
vi.mock('$lib/services/rollbackService', () => ({ rollbackService: {} }))
vi.mock('$lib/services/ai', () => ({ aiService: {} }))
vi.mock('$lib/services/grammar', () => ({ grammarService: {} }))
vi.mock('$lib/services/lorebookImportExport', () => ({ LorebookImportExport: {} }))
vi.mock('$lib/services/tokenizer', () => ({ countTokens: () => 0 }))
vi.mock('./settings.svelte', () => ({ settings: settingsMock }))
vi.mock('./ui.svelte', () => ({ ui: uiMock }))

const { story } = await import('./story.svelte')

/** A learned growth spell + the cast CheckRecord that fires it (Phase 4 shapes). */
const SPELL_ID = 'spell-verdant-swell'

const growthSpellEntry = () => ({
  id: SPELL_ID,
  storyId: 's1',
  name: 'Verdant Swell',
  type: 'spell',
  description: 'A transmutation that coaxes a body into blooming.',
  state: {
    type: 'spell',
    school: 'transmutation',
    essenceCost: 1,
    dc: 12,
    effects: [{ kind: 'growth', intensity: 2 }],
    revealed: true,
  },
  branchId: null,
})

/** The live failure's numbers: DC 12, total 15, band success. */
const castCheckRecord = (targetId: string) => ({
  action: 'cast Verdant Swell at Amelia',
  skill: 'transmutation',
  dc: 12,
  nat: 9,
  bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
  bonus: 6,
  total: 15,
  margin: 3,
  band: 'success',
  essenceSpent: 1,
  spellId: SPELL_ID,
  target: 'Amelia',
  targetId,
})

// Reset the mutable pieces of the shared singleton between tests.
function reset(recorder: DbRecorder) {
  recorder.calls.length = 0
  // failOn installs a persistent failure on the shared recorder — clear it, or a
  // later test inherits the previous one's mid-turn write failure.
  recorder.clearAllFailures()
  story.currentStory = makeStory() as never
  story.characters = [] as never
  story.locations = [] as never
  story.items = [] as never
  story.storyBeats = [] as never
  story.entries = [] as never
  story.chapters = [] as never
  story.branches = [] as never
  // Spell casts resolve against this — a leaked entry would let a later test cast.
  story.lorebookEntries = [] as never
}

describe('store harness — drive a real write path (CR-1 foundation)', () => {
  beforeEach(() => {
    settingsMock.experimentalFeatures.stateTracking = false
    settingsMock.experimentalFeatures.rollbackOnDelete = false
    reset(db)
  })

  it('applyClassificationResult drives a character update through database.updateCharacter', async () => {
    story.characters = [makeCharacter('Aria')] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    await story.applyClassificationResult(result as never, 'entry-1')

    expect(db.methodsCalled()).toContain('updateCharacter')
    // The in-memory character reflects the new trait.
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits).toContain('brave')
  })

  it('buffers entity writes then the delta inside a write batch, flushed by commitWriteBatch (CR-1 seam)', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    const beginIdx = methods.indexOf('beginWriteBatch')
    const charWriteIdx = methods.indexOf('updateCharacter')
    const deltaWriteIdx = methods.indexOf('updateStoryEntry')
    const commitIdx = methods.indexOf('commitWriteBatch')
    // The whole turn is bracketed: beginWriteBatch → entity write → delta write
    // (last) → commitWriteBatch (atomic flush). No abort on the happy path.
    expect(beginIdx).toBeGreaterThanOrEqual(0)
    expect(charWriteIdx).toBeGreaterThan(beginIdx)
    expect(deltaWriteIdx).toBeGreaterThan(charWriteIdx)
    expect(commitIdx).toBeGreaterThan(deltaWriteIdx)
    expect(methods).not.toContain('abortWriteBatch')
  })

  it('CR-1 atomicity: a failed batch flush (commitWriteBatch) rolls the whole turn back and reports rolled_back', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // The atomic flush throws (the Rust transaction failed / rolled back). Every
    // write was buffered, so nothing persisted.
    db.failOn('commitWriteBatch')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // The turn opened a batch, buffered the entity + delta writes, then the flush
    // failed → abort + in-memory revert.
    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('commitWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(applied).toEqual({ applied: false, reason: 'rolled_back' })
    // Aria still exists (snapshot restore, not a wipe) and does NOT carry the
    // un-persisted trait.
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria).toBeDefined()
    expect(aria?.traits ?? []).not.toContain('brave')
  })

  it('CR-1 atomicity: a logic/write error inside the turn aborts before the flush', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // A write throws during the turn. In transactional mode wrapUpdate rethrows on
    // the first failure instead of swallowing it, aborting before commit.
    db.failOn('updateCharacter')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // Aborted before the delta write and before the flush; batch discarded.
    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('updateStoryEntry')
    expect(methods).not.toContain('commitWriteBatch')
    expect(applied).toEqual({ applied: false, reason: 'rolled_back' })
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
  })

  it('CR-1 atomicity: a failed delta write (updateStoryEntry) rolls the whole turn back', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // The delta is the LAST write in the turn; it has no local try/catch, so its
    // failure must propagate out of runWrites and abort before the flush.
    db.failOn('updateStoryEntry')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('updateCharacter') // buffered, never flushed
    expect(methods).toContain('updateStoryEntry')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('commitWriteBatch')
    expect(applied).toEqual({ applied: false, reason: 'rolled_back' })
    // Both the entity mutation and the in-memory delta are reverted.
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
    expect(story.entries.find((e) => e.id === 'entry-1')).toBeUndefined()
  })

  it('CR-1 atomicity: a beMode turn rolls the engine writes back on a failed flush', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const protagonist = makeProtagonist('Rowan')
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [protagonist, girl] as never
    // Pre-turn values the rollback must restore: no RPG sheet yet (the turn's
    // creation grant writes one) and her seeded body state (the reducer grows it).
    const protagonistMetadataBefore = protagonist.metadata
    const girlMetadataBefore = structuredClone(girl.metadata)

    // A catalyst event drives the BE reducer; the protagonist's sheet write comes
    // from applyRpgTurn's one-time starting grant. Both run inside runWrites.
    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    db.failOn('commitWriteBatch')
    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // The engine did write (buffered) — then the flush failed and the turn aborted.
    const methods = db.methodsCalled()
    expect(methods).toContain('updateCharacter')
    expect(methods).toContain('commitWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(applied).toEqual({ applied: false, reason: 'rolled_back' })
    // Both engine mutations reverted to their pre-turn values.
    expect(story.characters.find((c) => c.name === 'Rowan')?.metadata).toEqual(
      protagonistMetadataBefore,
    )
    expect(story.characters.find((c) => c.name === 'Mira')?.metadata).toEqual(girlMetadataBefore)
  })

  it('beMode without a failure commits the engine writes (control for the rollback case)', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [makeProtagonist('Rowan'), girl] as never
    const girlMetadataBefore = structuredClone(girl.metadata)

    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    expect(applied).toEqual({ applied: true })
    expect(db.methodsCalled()).toContain('commitWriteBatch')
    expect(db.methodsCalled()).not.toContain('abortWriteBatch')
    // The protagonist now carries a sheet (creation grant) and Mira's body state moved
    // — i.e. the rollback case above really did undo two persisted-looking changes.
    expect(story.characters.find((c) => c.name === 'Rowan')?.metadata).toHaveProperty('rpgSheet')
    expect(story.characters.find((c) => c.name === 'Mira')?.metadata).not.toEqual(
      girlMetadataBefore,
    )
  })

  it('D-4: a tracking-OFF turn is atomic too — a mid-turn write failure rolls it back', async () => {
    // Tracking off means no delta, but the turn's writes (including the whole
    // BE/RPG engine when beMode is on) still commit all-or-nothing.
    settingsMock.experimentalFeatures.stateTracking = false
    story.characters = [makeCharacter('Aria')] as never
    db.failOn('updateCharacter')

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    expect(methods).toContain('beginWriteBatch')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('commitWriteBatch')
    // No delta write: tracking is off, so there is nothing delta-side to persist.
    expect(methods).not.toContain('updateStoryEntry')
    expect(applied).toEqual({ applied: false, reason: 'rolled_back' })
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
  })

  it('D-4: beMode with tracking OFF runs the engine atomically — a failed flush reverts sheet and body state', async () => {
    // The literal D-4 finding: beMode + stateTracking off used to run the whole
    // engine (essence, growth, grant) best-effort with swallowed failures. Now
    // it rides the same batch: flush failure reverts BOTH engine mutations.
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const protagonist = makeProtagonist('Rowan')
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [protagonist, girl] as never
    const protagonistMetadataBefore = protagonist.metadata
    const girlMetadataBefore = structuredClone(girl.metadata)

    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    db.failOn('commitWriteBatch')
    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    const methods = db.methodsCalled()
    expect(methods).toContain('updateCharacter')
    expect(methods).toContain('abortWriteBatch')
    expect(methods).not.toContain('updateStoryEntry')
    expect(applied).toEqual({ applied: false, reason: 'rolled_back' })
    expect(story.characters.find((c) => c.name === 'Rowan')?.metadata).toEqual(
      protagonistMetadataBefore,
    )
    expect(story.characters.find((c) => c.name === 'Mira')?.metadata).toEqual(girlMetadataBefore)
  })

  it('D-11: an unparseable stored rpgSheet is left byte-identical — the RPG turn is skipped', async () => {
    // The pre-D-11 shape: readRpgSheet returned null for this blob, so applyRpgTurn
    // treated the protagonist as sheet-less and persisted defaults + the creation
    // grant over it (level, knownSpells, awardedMilestones, spent points gone).
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const corrupt = { rpgSheet: { level: 'three', knownSpells: ['verdant-swell'] } }
    const protagonist = makeProtagonist('Rowan', { metadata: corrupt })
    const girl = makeGirlWithBodyState('Mira')
    story.characters = [protagonist, girl] as never
    const corruptJson = JSON.stringify(corrupt)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = makeClassificationResult({
      beEvents: [{ character: 'Mira', kind: 'catalyst', intensity: 2 }],
      scene: { presentCharacterNames: ['Mira'] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // The turn itself commits — only the protagonist's sheet write is skipped.
    expect(applied).toEqual({ applied: true })
    expect(db.methodsCalled()).toContain('commitWriteBatch')
    // No character write touched the protagonist at all…
    const protagonistWrites = db.calls.filter(
      (c) => c.method === 'updateCharacter' && c.args[0] === protagonist.id,
    )
    expect(protagonistWrites).toEqual([])
    // …and the stored blob is untouched, not replaced by a fresh granted sheet.
    const rowan = story.characters.find((c) => c.name === 'Rowan')
    expect(JSON.stringify(rowan?.metadata)).toBe(corruptJson)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Rowan'))
    warn.mockRestore()
    // The rest of the engine still ran: Mira's body state moved and was written.
    expect(db.calls.some((c) => c.method === 'updateCharacter' && c.args[0] === girl.id)).toBe(true)
  })

  it('a successful cast grows the target — no second, hidden growth roll', async () => {
    // The live failure this fixes: the player cast a growth spell at Amelia, the
    // check SUCCEEDED (DC 12, total 15), the narration described her growing —
    // and then the reducer's own d20 rolled a 1, so her tier never moved. The
    // story restricted growth to catalyst-only, making the cast the sole growth
    // channel, so the mismatch was player-visible every time.
    //
    // ENTRY_ID is load-bearing: the reducer seed is `${storyId}:${entryId}:${id}`,
    // and this one rolls a 1 — the literal live failure. The control half of the
    // test proves it, so the cast half cannot pass on a lucky roll.
    const ENTRY_ID = 'entry-4'
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const protagonist = () =>
      makeProtagonist('Rowan', {
        metadata: { rpgSheet: { ...defaultRpgSheet(), knownSpells: [SPELL_ID] } },
      })
    story.lorebookEntries = [growthSpellEntry()] as never

    // Control: the SAME catalyst event as ambient classifier output, no cast. It
    // still rolls, and on this seed it still fails — nothing lands.
    const ambientGirl = makeGirlWithBodyState('Amelia')
    story.characters = [protagonist(), ambientGirl] as never
    const tierBefore = readBodyState(ambientGirl.metadata as Record<string, unknown>)?.tier ?? 0
    await story.applyClassificationResult(
      makeClassificationResult({
        beEvents: [{ character: 'Amelia', kind: 'catalyst', intensity: 2 }],
        scene: { presentCharacterNames: ['Amelia'] },
      }) as never,
      ENTRY_ID,
    )
    expect(
      readBodyState(
        story.characters.find((c) => c.name === 'Amelia')?.metadata as Record<string, unknown>,
      )?.tier,
    ).toBe(tierBefore)

    // The cast: the classifier proposes NOTHING (the cast is the only growth
    // channel), the same losing seed applies — and the growth lands anyway.
    const castGirl = makeGirlWithBodyState('Amelia')
    story.characters = [protagonist(), castGirl] as never
    const applied = await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
      ENTRY_ID,
      castCheckRecord(castGirl.id as string) as never,
    )

    expect(applied).toEqual({ applied: true })
    const after = readBodyState(
      story.characters.find((c) => c.name === 'Amelia')?.metadata as Record<string, unknown>,
    )
    expect(after?.tier).toBe(tierBefore + 1)
    // lastGrowth is what drives the next turn's growth-narration directive — the
    // stats and the prose now agree in both directions.
    expect(after?.lastGrowth).toEqual({ delta: 1, tierBefore })
  })

  it('a fizzled (fail-band) cast still applies nothing', async () => {
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const girl = makeGirlWithBodyState('Amelia')
    story.characters = [
      makeProtagonist('Rowan', {
        metadata: { rpgSheet: { ...defaultRpgSheet(), knownSpells: [SPELL_ID] } },
      }),
      girl,
    ] as never
    story.lorebookEntries = [growthSpellEntry()] as never
    const tierBefore = readBodyState(girl.metadata as Record<string, unknown>)?.tier ?? 0

    const result = makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } })
    await story.applyClassificationResult(result as never, 'entry-1', {
      ...castCheckRecord('char-amelia'),
      band: 'fail',
      total: 7,
      margin: -5,
    } as never)

    // Guaranteed growth rides a SUCCESSFUL check only; a fizzle translates to no
    // effects at all (essence is still spent by the RPG layer).
    expect(
      readBodyState(
        story.characters.find((c) => c.name === 'Amelia')?.metadata as Record<string, unknown>,
      )?.tier,
    ).toBe(tierBefore)
  })

  it('replay guard: re-applying an entry that already has a delta is a no-op', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Aria')] as never
    // The entry already carries a delta — i.e. the turn already committed once.
    story.entries = [{ id: 'entry-1', worldStateDelta: { previousState: {} } }] as never

    const result = makeClassificationResult({
      entryUpdates: { characterUpdates: [{ name: 'Aria', changes: { newTraits: ['brave'] } }] },
    })

    const applied = await story.applyClassificationResult(result as never, 'entry-1')

    // Nothing was written and no stateful mutation ran — the guard returned early.
    // D-7: reported as 'replay', NOT 'rolled_back' — the caller skips the tail
    // either way but only messages the user about a genuine rollback.
    expect(applied).toEqual({ applied: false, reason: 'replay' })
    expect(db.methodsCalled()).not.toContain('updateCharacter')
    expect(db.methodsCalled()).not.toContain('beginWriteBatch')
    const aria = story.characters.find((c) => c.name === 'Aria')
    expect(aria?.traits ?? []).not.toContain('brave')
  })
})

/**
 * Check-backed growth (the SECOND "successful roll, no stats" live failure).
 *
 * The player typed "Channel more essence to push her size even further". It got
 * check-tagged (channeling, target Amelia, DC 14 → SUCCESS, 2 essence spent) but
 * mapped to no known spell, so computeSpellCast produced nothing and the turn's
 * only growth was the classifier's mirrored `attempt` event — which this story
 * discards, being catalyst-only. Essence paid, check succeeded, narration
 * described her growing, engine did nothing.
 */
describe('store harness — check-backed growth (growthIntent)', () => {
  /** The live story's cosmology: catalyst is the ONLY growth-eligible kind. */
  const CATALYST_ONLY = { beMode: true, beGrowthEligibleKinds: ['catalyst'] }

  /** The live failure's numbers, minus the spell that never existed. */
  const channelRecord = (overrides: Record<string, unknown> = {}) => ({
    action: 'Channel more essence to push her size even further',
    skill: 'channeling',
    dc: 14,
    nat: 11,
    bonusBreakdown: { attribute: 0, ranks: 0, modifiers: [] },
    bonus: 5,
    total: 16,
    margin: 2,
    band: 'success',
    essenceSpent: 2,
    target: 'Amelia',
    targetId: 'char-amelia',
    ...overrides,
  })

  const tierOf = (name: string): number | undefined =>
    readBodyState(
      story.characters.find((c) => c.name === name)?.metadata as Record<string, unknown>,
    )?.tier

  const growthRows = (): Array<Record<string, unknown>> => {
    const call = db.calls.find((c) => c.method === 'updateStoryEntry')
    const delta = (
      call?.args[1] as { worldStateDelta?: { beLog?: Array<Record<string, unknown>> } }
    )?.worldStateDelta
    return (delta?.beLog ?? []).filter((row) => row.kind === 'catalyst' || row.kind === 'attempt')
  }

  beforeEach(() => reset(db))

  it('the live failure, fixed: a successful growth action grows her even though the classifier only offered a non-eligible `attempt`', async () => {
    // ENTRY_ID is load-bearing twice over: `s1:entry-4:char-amelia:0` is the seed
    // that rolls a 1, so nothing can land here by luck.
    const ENTRY_ID = 'entry-4'
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never

    const scene = () =>
      makeClassificationResult({
        beEvents: [{ character: 'Amelia', kind: 'attempt', intensity: 2 }],
        scene: { presentCharacterNames: ['Amelia'] },
      })

    // CONTROL — the exact live turn: same successful check, same classifier
    // output, no growthIntent. The `attempt` is not growth-eligible, so it never
    // even rolls, and the player watches a successful, paid-for roll do nothing.
    const control = makeGirlWithBodyState('Amelia')
    story.characters = [makeProtagonist('Rowan'), control] as never
    const tierBefore = readBodyState(control.metadata as Record<string, unknown>)?.tier ?? 0
    await story.applyClassificationResult(scene() as never, ENTRY_ID, channelRecord() as never)
    expect(tierOf('Amelia')).toBe(tierBefore)

    // THE FIX — one flag different. The check already WAS the dice, so the
    // mirrored event is promoted to a guaranteed catalyst and lands.
    const target = makeGirlWithBodyState('Amelia')
    story.characters = [makeProtagonist('Rowan'), target] as never
    const applied = await story.applyClassificationResult(
      scene() as never,
      ENTRY_ID,
      channelRecord({ growthIntent: true }) as never,
    )

    expect(applied).toEqual({ applied: true })
    expect(tierOf('Amelia')).toBe(tierBefore + 1)
  })

  it('synthesizes growth when the classifier proposed none at all for her', async () => {
    // Under-reporting is the other half of the live failure: a classifier that
    // emits nothing must not nullify a successful, paid-for growth action.
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
    const girl = makeGirlWithBodyState('Amelia')
    story.characters = [makeProtagonist('Rowan'), girl] as never
    const tierBefore = readBodyState(girl.metadata as Record<string, unknown>)?.tier ?? 0

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
      'entry-4',
      channelRecord({ growthIntent: true }) as never,
    )

    expect(tierOf('Amelia')).toBe(tierBefore + 1)
  })

  it('a never-seeded target is seeded by the synthesized event, then grown', async () => {
    // A girl introduced this same turn carries no bodyState. The synthesized
    // event is a real event, so she takes the normal auto-seed path first and
    // the growth lands on top of it — nothing is silently dropped.
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
    story.characters = [makeProtagonist('Rowan'), makeCharacter('Amelia')] as never
    expect(readBodyState(story.characters[1].metadata as Record<string, unknown>)).toBeNull()

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
      'entry-4',
      channelRecord({ growthIntent: true }) as never,
    )

    const after = readBodyState(
      story.characters.find((c) => c.name === 'Amelia')?.metadata as Record<string, unknown>,
    )
    expect(after).not.toBeNull()
    expect(after?.lastGrowth?.delta).toBe(1)
  })

  it('a FAILED growth action suppresses the classifier growth that would otherwise have landed', async () => {
    // `s1:entry-0:char-amelia:0` rolls 13 — an ambient catalyst at intensity 2
    // lands here, which is what makes this a real suppression test.
    const ENTRY_ID = 'entry-0'
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const scene = () =>
      makeClassificationResult({
        beEvents: [{ character: 'Amelia', kind: 'catalyst', intensity: 2 }],
        scene: { presentCharacterNames: ['Amelia'] },
      })
    const failed = channelRecord({ band: 'fail', total: 9, margin: -5 })

    // CONTROL: the same failed check with no growth intent — the classifier's
    // catalyst is an independent cause and still rolls, and still lands.
    const control = makeGirlWithBodyState('Amelia')
    story.characters = [makeProtagonist('Rowan'), control] as never
    const tierBefore = readBodyState(control.metadata as Record<string, unknown>)?.tier ?? 0
    await story.applyClassificationResult(scene() as never, ENTRY_ID, failed as never)
    expect(tierOf('Amelia')).toBe(tierBefore + 1)

    // With growth intent, that same event is the FAILED attempt's own mirror —
    // narration says she did not grow, so the engine must not grow her either.
    const suppressed = makeGirlWithBodyState('Amelia')
    story.characters = [makeProtagonist('Rowan'), suppressed] as never
    await story.applyClassificationResult(scene() as never, ENTRY_ID, {
      ...failed,
      growthIntent: true,
    } as never)
    expect(tierOf('Amelia')).toBe(tierBefore)
  })

  it('a successful check WITHOUT growthIntent leaves ambient growth rolling exactly as before', async () => {
    const ENTRY_ID = 'entry-0'
    settingsMock.experimentalFeatures.stateTracking = false
    story.currentStory = makeStory({ settings: { beMode: true } }) as never
    const girl = makeGirlWithBodyState('Amelia')
    story.characters = [makeProtagonist('Rowan'), girl] as never
    const tierBefore = readBodyState(girl.metadata as Record<string, unknown>)?.tier ?? 0

    await story.applyClassificationResult(
      makeClassificationResult({
        beEvents: [{ character: 'Amelia', kind: 'catalyst', intensity: 2 }],
        scene: { presentCharacterNames: ['Amelia'] },
      }) as never,
      ENTRY_ID,
      channelRecord() as never,
    )

    // Same +1 the seeded roll always produced: an unflagged check changes nothing.
    expect(tierOf('Amelia')).toBe(tierBefore + 1)
  })

  it('a cast turn is untouched: growthIntent never double-promotes on top of the spell', async () => {
    // A CRIT cast of an intensity-1 growth spell, chosen because it makes the
    // double-application VISIBLE: the cast scales 1 → 2, and a promotion running
    // on top would re-scale that 2 → 3 (a different roll band, a different beLog
    // note, and a staged anticipation split). Deep-equal on the growth rows is
    // therefore a real assertion, not a tautology.
    const ENTRY_ID = 'entry-4'
    const weakSpell = () => {
      const entry = growthSpellEntry()
      return { ...entry, state: { ...entry.state, effects: [{ kind: 'growth', intensity: 1 }] } }
    }
    const critCast = (targetId: string) => ({
      ...castCheckRecord(targetId),
      band: 'crit',
      total: 22,
      margin: 10,
    })
    const protagonist = () =>
      makeProtagonist('Rowan', {
        metadata: { rpgSheet: { ...defaultRpgSheet(), knownSpells: [SPELL_ID] } },
      })

    // CAST ONLY (the HEAD~1 behavior this must preserve byte-for-byte).
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
    const castOnly = makeGirlWithBodyState('Amelia')
    story.characters = [protagonist(), castOnly] as never
    story.lorebookEntries = [weakSpell()] as never
    const tierBefore = readBodyState(castOnly.metadata as Record<string, unknown>)?.tier ?? 0
    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
      ENTRY_ID,
      critCast(castOnly.id as string) as never,
    )
    const castOnlyTier = tierOf('Amelia')
    const castOnlyRows = growthRows()
    const castOnlyPending = readBodyState(
      story.characters.find((c) => c.name === 'Amelia')?.metadata as Record<string, unknown>,
    )?.pendingGrowth
    expect(castOnlyTier).toBe(tierBefore + 1)
    expect(castOnlyRows).toHaveLength(1)
    expect(castOnlyRows[0].note).toContain('@i2')

    // CAST + growthIntent: the store's guard hands the turn to the cast path
    // alone, so the girl gets ONE guaranteed growth event at the cast's own
    // intensity — not a second one, and not a re-scaled one.
    reset(db)
    settingsMock.experimentalFeatures.stateTracking = true
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
    const both = makeGirlWithBodyState('Amelia')
    story.characters = [protagonist(), both] as never
    story.lorebookEntries = [weakSpell()] as never
    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
      ENTRY_ID,
      { ...critCast(both.id as string), growthIntent: true } as never,
    )

    expect(tierOf('Amelia')).toBe(castOnlyTier)
    expect(growthRows()).toEqual(castOnlyRows)
    expect(
      readBodyState(
        story.characters.find((c) => c.name === 'Amelia')?.metadata as Record<string, unknown>,
      )?.pendingGrowth,
    ).toEqual(castOnlyPending)
  })

  it('multi-girl scene: promotion touches the target only — the other girl keeps her own ambient roll', async () => {
    // `s1:entry-0:char-brielle:0` rolls 11, so Brielle's ambient catalyst lands
    // on its own merits. Amelia's growth can only come from the promotion (her
    // `attempt` is not eligible in this story).
    const ENTRY_ID = 'entry-0'
    settingsMock.experimentalFeatures.stateTracking = false
    const scene = () =>
      makeClassificationResult({
        beEvents: [
          { character: 'Amelia', kind: 'attempt', intensity: 2 },
          { character: 'Brielle', kind: 'catalyst', intensity: 2 },
        ],
        scene: { presentCharacterNames: ['Amelia', 'Brielle'] },
      })

    // CONTROL: no growth intent — Brielle grows, Amelia does not.
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
    const cAmelia = makeGirlWithBodyState('Amelia')
    const cBrielle = makeGirlWithBodyState('Brielle')
    story.characters = [makeProtagonist('Rowan'), cAmelia, cBrielle] as never
    const ameliaBefore = readBodyState(cAmelia.metadata as Record<string, unknown>)?.tier ?? 0
    const brielleBefore = readBodyState(cBrielle.metadata as Record<string, unknown>)?.tier ?? 0
    await story.applyClassificationResult(scene() as never, ENTRY_ID, channelRecord() as never)
    expect(tierOf('Amelia')).toBe(ameliaBefore)
    const brielleControlTier = tierOf('Brielle')
    expect(brielleControlTier).toBe(brielleBefore + 1)

    // With growth intent aimed at Amelia: she now grows, and Brielle's outcome is
    // identical to the control — her events and her roll were never touched.
    story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
    story.characters = [
      makeProtagonist('Rowan'),
      makeGirlWithBodyState('Amelia'),
      makeGirlWithBodyState('Brielle'),
    ] as never
    await story.applyClassificationResult(
      scene() as never,
      ENTRY_ID,
      channelRecord({ growthIntent: true }) as never,
    )
    expect(tierOf('Amelia')).toBe(ameliaBefore + 1)
    expect(tierOf('Brielle')).toBe(brielleControlTier)
  })

  describe('untagged target — the sole-candidate fallback', () => {
    /**
     * The second live failure: the tagger emitted `growthIntent` but no
     * `targetCharacter` on a crit, so the record reached the store with no
     * subject and the channel did nothing at all.
     */
    const untargeted = (overrides: Record<string, unknown> = {}) =>
      channelRecord({ growthIntent: true, target: undefined, targetId: undefined, ...overrides })

    /** The persisted checkLog row — the honest record of who was affected. */
    const checkLogRows = (): Array<Record<string, unknown>> => {
      const call = db.calls.find((c) => c.method === 'updateStoryEntry')
      const delta = (
        call?.args[1] as { worldStateDelta?: { checkLog?: Array<Record<string, unknown>> } }
      )?.worldStateDelta
      return delta?.checkLog ?? []
    }

    it('one present girl: the untagged growth check resolves to her and grows her', async () => {
      // Same seed as the live-failure test — `s1:entry-4:char-amelia:0` rolls a 1,
      // so only the promotion can produce growth here.
      const ENTRY_ID = 'entry-4'
      settingsMock.experimentalFeatures.stateTracking = true
      story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
      const girl = makeGirlWithBodyState('Amelia')
      story.characters = [makeProtagonist('Rowan'), girl] as never
      const tierBefore = readBodyState(girl.metadata as Record<string, unknown>)?.tier ?? 0

      await story.applyClassificationResult(
        makeClassificationResult({
          beEvents: [{ character: 'Amelia', kind: 'attempt', intensity: 2 }],
          scene: { presentCharacterNames: ['Amelia'] },
        }) as never,
        ENTRY_ID,
        untargeted() as never,
      )

      expect(tierOf('Amelia')).toBe(tierBefore + 1)
      // The log names her, and marks that the ENGINE picked her, not the tagger.
      expect(checkLogRows()).toHaveLength(1)
      expect(checkLogRows()[0]).toMatchObject({
        target: 'Amelia',
        targetId: 'char-amelia',
        targetInferred: true,
      })
    })

    it('an unreadable presence list still resolves the only tracked girl in the story', async () => {
      // The classifier intermittently returns an empty presence list; falling back
      // to the whole tracked cast (be/presence.ts bias) keeps the channel working.
      settingsMock.experimentalFeatures.stateTracking = false
      story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
      const girl = makeGirlWithBodyState('Amelia')
      story.characters = [makeProtagonist('Rowan'), girl] as never
      const tierBefore = readBodyState(girl.metadata as Record<string, unknown>)?.tier ?? 0

      await story.applyClassificationResult(
        makeClassificationResult({ scene: { presentCharacterNames: [] } }) as never,
        'entry-4',
        untargeted() as never,
      )

      expect(tierOf('Amelia')).toBe(tierBefore + 1)
    })

    it('two present girls: nothing is promoted — ambiguous targeting must not guess', async () => {
      const ENTRY_ID = 'entry-4'
      settingsMock.experimentalFeatures.stateTracking = true
      story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
      const amelia = makeGirlWithBodyState('Amelia')
      const brielle = makeGirlWithBodyState('Brielle')
      story.characters = [makeProtagonist('Rowan'), amelia, brielle] as never
      const ameliaBefore = readBodyState(amelia.metadata as Record<string, unknown>)?.tier ?? 0
      const brielleBefore = readBodyState(brielle.metadata as Record<string, unknown>)?.tier ?? 0

      await story.applyClassificationResult(
        makeClassificationResult({
          beEvents: [{ character: 'Amelia', kind: 'attempt', intensity: 2 }],
          scene: { presentCharacterNames: ['Amelia', 'Brielle'] },
        }) as never,
        ENTRY_ID,
        untargeted() as never,
      )

      expect(tierOf('Amelia')).toBe(ameliaBefore)
      expect(tierOf('Brielle')).toBe(brielleBefore)
      // The record stays honestly targetless rather than naming a guess.
      expect(checkLogRows()[0].target).toBeUndefined()
      expect(checkLogRows()[0].targetInferred).toBeUndefined()
    })

    it('two tracked girls but only one in the scene: presence picks her out', async () => {
      settingsMock.experimentalFeatures.stateTracking = false
      story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
      const amelia = makeGirlWithBodyState('Amelia')
      const brielle = makeGirlWithBodyState('Brielle')
      story.characters = [makeProtagonist('Rowan'), amelia, brielle] as never
      const ameliaBefore = readBodyState(amelia.metadata as Record<string, unknown>)?.tier ?? 0
      const brielleBefore = readBodyState(brielle.metadata as Record<string, unknown>)?.tier ?? 0

      await story.applyClassificationResult(
        makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
        'entry-4',
        untargeted() as never,
      )

      expect(tierOf('Amelia')).toBe(ameliaBefore + 1)
      expect(tierOf('Brielle')).toBe(brielleBefore)
    })

    it('a FAILED untagged growth action suppresses the sole girl’s classifier growth', async () => {
      // `s1:entry-0:char-amelia:0` rolls 13, so the ambient catalyst genuinely
      // lands without the suppression — same control the tagged-target test uses.
      const ENTRY_ID = 'entry-0'
      settingsMock.experimentalFeatures.stateTracking = false
      story.currentStory = makeStory({ settings: { beMode: true } }) as never
      const scene = () =>
        makeClassificationResult({
          beEvents: [{ character: 'Amelia', kind: 'catalyst', intensity: 2 }],
          scene: { presentCharacterNames: ['Amelia'] },
        })
      const failed = { band: 'fail', total: 9, margin: -5 }

      const control = makeGirlWithBodyState('Amelia')
      story.characters = [makeProtagonist('Rowan'), control] as never
      const tierBefore = readBodyState(control.metadata as Record<string, unknown>)?.tier ?? 0
      await story.applyClassificationResult(
        scene() as never,
        ENTRY_ID,
        channelRecord(failed) as never,
      )
      expect(tierOf('Amelia')).toBe(tierBefore + 1)

      const suppressed = makeGirlWithBodyState('Amelia')
      story.characters = [makeProtagonist('Rowan'), suppressed] as never
      await story.applyClassificationResult(scene() as never, ENTRY_ID, untargeted(failed) as never)
      expect(tierOf('Amelia')).toBe(tierBefore)
    })

    it('a tagged target is never re-resolved or marked inferred', async () => {
      settingsMock.experimentalFeatures.stateTracking = true
      story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
      story.characters = [
        makeProtagonist('Rowan'),
        makeGirlWithBodyState('Amelia'),
        makeGirlWithBodyState('Brielle'),
      ] as never

      await story.applyClassificationResult(
        makeClassificationResult({
          scene: { presentCharacterNames: ['Amelia', 'Brielle'] },
        }) as never,
        'entry-4',
        channelRecord({ growthIntent: true }) as never,
      )

      expect(checkLogRows()[0]).toMatchObject({ target: 'Amelia', targetId: 'char-amelia' })
      expect(checkLogRows()[0].targetInferred).toBeUndefined()
    })

    it('an untargeted CAST is untouched: no inference, no growth', async () => {
      // Casts require their own tagged target (research/50 R10) — the fallback
      // must not hand one to a narrative-only cast through the back door.
      settingsMock.experimentalFeatures.stateTracking = true
      story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
      story.characters = [
        makeProtagonist('Rowan', {
          metadata: { rpgSheet: { ...defaultRpgSheet(), knownSpells: [SPELL_ID] } },
        }),
        makeGirlWithBodyState('Amelia'),
      ] as never
      story.lorebookEntries = [growthSpellEntry()] as never
      const tierBefore = tierOf('Amelia')

      await story.applyClassificationResult(
        makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
        'entry-4',
        {
          ...castCheckRecord('char-amelia'),
          target: undefined,
          targetId: undefined,
          growthIntent: true,
        } as never,
      )

      expect(tierOf('Amelia')).toBe(tierBefore)
      expect(checkLogRows()[0].targetInferred).toBeUndefined()
      expect(checkLogRows()[0].target).toBeUndefined()
    })

    /**
     * The third live failure: the scene classifier returned
     * `presentCharacterNames: []` on a turn whose own beEvents named Amelia. The
     * raw presence read meant BOTH consumers degraded at once — the reducer
     * processed nobody (no events, no ticks, empty beLog) and the target fallback
     * saw the whole tracked cast (two candidates) and refused to infer. One
     * hiccup, entire engine off. `effectivePresence` unions the referenced names
     * back in, so the same turn resolves to exactly Amelia.
     */
    describe('effective presence — the empty presence list', () => {
      /** Every reducer outcome row on the delta, not just the growth ones. */
      const beLogRows = (): Array<Record<string, unknown>> => {
        const call = db.calls.find((c) => c.method === 'updateStoryEntry')
        const delta = (
          call?.args[1] as { worldStateDelta?: { beLog?: Array<Record<string, unknown>> } }
        )?.worldStateDelta
        return delta?.beLog ?? []
      }

      const bodyWritesFor = (characterId: string): number =>
        db.calls.filter((c) => c.method === 'updateCharacter' && c.args[0] === characterId).length

      /** The live cast: a big girl and a small one, both engine-tracked. */
      const twoGirls = () => {
        story.currentStory = makeStory({ settings: CATALYST_ONLY }) as never
        story.characters = [
          makeProtagonist('Rowan'),
          makeGirlWithBodyState('Amelia', {}, 24),
          makeGirlWithBodyState('Elara', {}, 6),
        ] as never
      }

      it('an empty presence list with beEvents naming one girl: she ticks, the check resolves to her, the other is untouched', async () => {
        settingsMock.experimentalFeatures.stateTracking = true
        twoGirls()

        await story.applyClassificationResult(
          makeClassificationResult({
            // `attempt` is not growth-eligible in this story, so the tier move can
            // only come from the promoted (guaranteed) catalyst.
            beEvents: [{ character: 'Amelia', kind: 'attempt', intensity: 2 }],
            scene: { presentCharacterNames: [] },
          }) as never,
          'entry-4',
          untargeted() as never,
        )

        // The engine did not sit the turn out.
        expect(beLogRows().length).toBeGreaterThan(0)
        expect(
          beLogRows().some((row) => row.character === 'Amelia' && row.kind === 'catalyst'),
        ).toBe(true)
        expect(tierOf('Amelia')).toBe(25)
        // …and it picked her by name rather than guessing between two girls.
        expect(checkLogRows()[0]).toMatchObject({
          target: 'Amelia',
          targetId: 'char-amelia',
          targetInferred: true,
        })
        // Elara was never referenced: no growth, no rows, no write.
        expect(tierOf('Elara')).toBe(6)
        expect(beLogRows().every((row) => row.character !== 'Elara')).toBe(true)
        expect(bodyWritesFor('char-elara')).toBe(0)
      })

      it('control — BOTH girls referenced: two candidates, so nothing is inferred, but both still tick', async () => {
        settingsMock.experimentalFeatures.stateTracking = true
        twoGirls()

        await story.applyClassificationResult(
          makeClassificationResult({
            beEvents: [{ character: 'Amelia', kind: 'attempt', intensity: 2 }],
            bondEvents: [{ character: 'Elara', direction: 'warm', intensity: 1 }],
            scene: { presentCharacterNames: [] },
          }) as never,
          'entry-4',
          untargeted() as never,
        )

        // Ambiguous targeting still refuses to guess — no promotion for either.
        expect(tierOf('Amelia')).toBe(24)
        expect(tierOf('Elara')).toBe(6)
        expect(checkLogRows()[0].target).toBeUndefined()
        expect(checkLogRows()[0].targetInferred).toBeUndefined()
        // The engine still ran for both: a refused inference is not a dead turn.
        expect(bodyWritesFor('char-amelia')).toBe(1)
        expect(bodyWritesFor('char-elara')).toBe(1)
      })

      it('nothing named at all: the whole tracked cast ticks rather than nobody', async () => {
        settingsMock.experimentalFeatures.stateTracking = false
        twoGirls()

        await story.applyClassificationResult(
          makeClassificationResult({ scene: { presentCharacterNames: [] } }) as never,
          'entry-4',
        )

        expect(bodyWritesFor('char-amelia')).toBe(1)
        expect(bodyWritesFor('char-elara')).toBe(1)
        // A passive tick moves fill/mood, never size.
        expect(tierOf('Amelia')).toBe(24)
        expect(tierOf('Elara')).toBe(6)
      })

      it('an explicit presence list still narrows: the absent girl neither ticks nor competes', async () => {
        settingsMock.experimentalFeatures.stateTracking = true
        twoGirls()

        await story.applyClassificationResult(
          makeClassificationResult({ scene: { presentCharacterNames: ['Amelia'] } }) as never,
          'entry-4',
          untargeted() as never,
        )

        expect(checkLogRows()[0]).toMatchObject({ target: 'Amelia', targetInferred: true })
        expect(tierOf('Amelia')).toBe(25)
        expect(tierOf('Elara')).toBe(6)
        expect(bodyWritesFor('char-elara')).toBe(0)
      })
    })
  })
})

describe('store harness — off-screen agendas (E4, research/61)', () => {
  beforeEach(() => {
    settingsMock.experimentalFeatures.stateTracking = false
    settingsMock.experimentalFeatures.rollbackOnDelete = false
    reset(db)
    story.currentStory = makeStory({ settings: { npcAgendas: true } }) as never
  })

  const agendaOf = (name: string): NpcAgenda | null => {
    const char = story.characters.find((c) => c.name === name)
    return readNpcAgenda((char?.metadata as Record<string, unknown> | null) ?? null)
  }

  /** A prior classified narration entry — the presence history the active cast reads. */
  const priorNarration = (id: string, names: string[]) => ({
    id,
    type: 'narration',
    worldStateDelta: {
      classificationResult: { scene: { presentCharacterNames: names } },
    },
  })

  const mundane = (overrides: Partial<NpcAgenda> = {}): NpcAgenda => ({
    goal: 'making her usual rounds',
    kind: 'mundane',
    step: 0,
    maxSteps: 3,
    ...overrides,
  })

  it('toggle off: no agenda machinery runs at all', async () => {
    story.currentStory = makeStory({ settings: {} }) as never
    story.characters = [makeCharacter('Mira'), makeCharacter('Nyssa')] as never
    story.entries = [priorNarration('p1', ['Mira', 'Nyssa'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Nyssa'] } }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toBeNull()
  })

  it('backfills a deterministic mundane agenda for an off-screen active-cast girl; present girls get none', async () => {
    story.characters = [makeCharacter('Mira'), makeCharacter('Nyssa')] as never
    story.entries = [priorNarration('p1', ['Mira', 'Nyssa'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Nyssa'] } }) as never,
      'entry-1',
    )

    const mira = agendaOf('Mira')
    expect(mira).toMatchObject({ kind: 'mundane', step: 0 })
    expect(agendaOf('Nyssa')).toBeNull()
  })

  it('accepts a proposal into an empty slot; an ACTIVE non-mundane agenda is never overwritten (it ticks instead)', async () => {
    story.characters = [
      makeCharacter('Mira'),
      makeCharacter('Nyssa', {
        metadata: writeNpcAgenda(null, mundane({ kind: 'research', goal: 'deep in the archive' })),
      }),
      makeCharacter('Opal'),
    ] as never
    story.entries = [priorNarration('p1', ['Mira', 'Nyssa', 'Opal'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({
        scene: { presentCharacterNames: ['Opal'] },
        agendaProposals: [
          {
            character: 'Mira',
            goal: 'visiting her sister',
            kind: 'travel',
            maxSteps: 2,
            destination: 'the harbor town',
          },
          {
            character: 'Nyssa',
            goal: 'this must not land',
            kind: 'reconcile',
            maxSteps: 4,
          },
        ],
      }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toEqual({
      goal: 'visiting her sister',
      kind: 'travel',
      step: 0,
      maxSteps: 2,
      destination: 'the harbor town',
      done: false,
    })
    // Nyssa's active non-mundane agenda survived the proposal and advanced one step.
    expect(agendaOf('Nyssa')).toMatchObject({ kind: 'research', step: 1 })
  })

  it('a grounded proposal replaces a stale ACTIVE mundane agenda', async () => {
    story.characters = [
      makeCharacter('Mira', { metadata: writeNpcAgenda(null, mundane({ step: 1 })) }),
      makeCharacter('Opal'),
    ] as never
    story.entries = [priorNarration('p1', ['Mira', 'Opal'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({
        scene: { presentCharacterNames: ['Opal'] },
        agendaProposals: [
          { character: 'Mira', goal: 'chasing the rumor', kind: 'research', maxSteps: 3 },
        ],
      }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toMatchObject({ kind: 'research', goal: 'chasing the rumor', step: 0 })
  })

  it('a classifier presence hiccup pauses the off-screen world — no ticks, and finished slots are NOT cleared', async () => {
    story.characters = [
      makeCharacter('Mira', { metadata: writeNpcAgenda(null, mundane({ step: 1 })) }),
      makeCharacter('Nyssa', {
        metadata: writeNpcAgenda(null, mundane({ kind: 'research', step: 3, done: true })),
      }),
    ] as never
    story.entries = [priorNarration('p1', ['Mira', 'Nyssa'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: [] } }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toMatchObject({ step: 1 })
    // The BE fallback would call everyone "present"; the agenda pass must not
    // read that as an on-screen return and delete her finished agenda.
    expect(agendaOf('Nyssa')).toMatchObject({ kind: 'research', done: true })
  })

  it('a finished agenda refreshes to a mundane one on the next off-screen turn, keeping her whereabouts', async () => {
    story.characters = [
      makeCharacter('Mira', {
        metadata: writeNpcAgenda(
          null,
          mundane({ kind: 'travel', step: 2, maxSteps: 2, done: true, location: 'the harbor' }),
        ),
      }),
      makeCharacter('Opal'),
    ] as never
    story.entries = [priorNarration('p1', ['Mira', 'Opal'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Opal'] } }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toMatchObject({ kind: 'mundane', step: 0, location: 'the harbor' })
  })

  it('a solo beat (empty presence, real classify) still ticks and accepts proposals', async () => {
    // The classifier legitimately returns an empty presence list when the
    // protagonist is alone — that must read as "everyone is off-screen", not
    // as a failed classify (fix-diff HIGH: the first-cut pause swallowed the
    // departure proposal, the highest-value input the feature consumes).
    story.characters = [
      makeCharacter('Mira'),
      makeCharacter('Nyssa', {
        metadata: writeNpcAgenda(null, mundane({ kind: 'research', step: 0, maxSteps: 3 })),
      }),
    ] as never
    story.entries = [priorNarration('p1', ['Mira', 'Nyssa'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({
        scene: { presentCharacterNames: [] },
        agendaProposals: [
          {
            character: 'Mira',
            goal: 'off to the harbor',
            kind: 'travel',
            maxSteps: 2,
            destination: 'the harbor',
          },
        ],
      }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toMatchObject({ kind: 'travel', goal: 'off to the harbor' })
    expect(agendaOf('Nyssa')).toMatchObject({ kind: 'research', step: 1 })
  })

  it('a girl outside the active cast freezes: no tick, no backfill, no write', async () => {
    story.characters = [
      makeCharacter('Mira', { metadata: writeNpcAgenda(null, mundane({ step: 1 })) }),
      makeCharacter('Petra'),
      makeCharacter('Opal'),
    ] as never
    // No presence history at all — the active cast is only this turn's signal.
    story.entries = [] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Opal'] } }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toMatchObject({ step: 1 }) // unticked
    expect(agendaOf('Petra')).toBeNull() // no backfill
  })

  it('reconcile completion feeds the rel engine as banked warmth — sparks land, the cadence stays frozen', async () => {
    story.currentStory = makeStory({ settings: { npcAgendas: true, beMode: true } }) as never
    const reconcile = mundane({
      kind: 'reconcile',
      goal: 'working up to an apology',
      step: 1,
      maxSteps: 2,
    })
    story.characters = [
      makeCharacter('Mira', {
        metadata: writeNpcAgenda(
          writeBodyState(null, { ...defaultBodyState(), quirks: [] }),
          reconcile,
        ),
      }),
    ] as never
    story.entries = [priorNarration('p1', ['Mira'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Someone Else'] } }) as never,
      'entry-1',
    )

    expect(agendaOf('Mira')).toMatchObject({ kind: 'reconcile', step: 2, done: true })
    const state = readBodyState(
      (story.characters.find((c) => c.name === 'Mira')?.metadata as Record<string, unknown>) ??
        null,
    )
    const rel = relOf(state!)
    // Warm intensity 2 → +2 sparks, banked; ct frozen (off-screen, ticksEnabled
    // false) so nothing converts and bond holds at the default.
    expect(rel.sparks).toBe(2)
    expect(rel.ct).toBe(0)
    expect(rel.bond).toBe(4)
  })

  it('travel completion rewrites her whereabouts; her return clears the finished slot', async () => {
    const travel = mundane({
      kind: 'travel',
      goal: 'traveling to the harbor',
      step: 1,
      maxSteps: 2,
      destination: 'the harbor',
    })
    story.characters = [
      makeCharacter('Mira', { metadata: writeNpcAgenda(null, travel) }),
      makeCharacter('Opal'),
    ] as never
    story.entries = [priorNarration('p1', ['Mira', 'Opal'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Opal'] } }) as never,
      'entry-1',
    )
    expect(agendaOf('Mira')).toMatchObject({ done: true, location: 'the harbor' })

    // She walks back on-screen: the finished slot clears (arrival fired).
    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Mira', 'Opal'] } }) as never,
      'entry-2',
    )
    expect(agendaOf('Mira')).toBeNull()
  })

  it('agenda writes ride the turn batch: buffered before the delta, committed atomically', async () => {
    settingsMock.experimentalFeatures.stateTracking = true
    story.characters = [makeCharacter('Mira'), makeCharacter('Opal')] as never
    story.entries = [priorNarration('p1', ['Mira', 'Opal'])] as never

    await story.applyClassificationResult(
      makeClassificationResult({ scene: { presentCharacterNames: ['Opal'] } }) as never,
      'entry-1',
    )

    const methods = db.methodsCalled()
    const charWriteIdx = methods.indexOf('updateCharacter')
    const deltaWriteIdx = methods.indexOf('updateStoryEntry')
    const commitIdx = methods.indexOf('commitWriteBatch')
    expect(charWriteIdx).toBeGreaterThanOrEqual(0)
    expect(deltaWriteIdx).toBeGreaterThan(charWriteIdx)
    expect(commitIdx).toBeGreaterThan(deltaWriteIdx)
    expect(agendaOf('Mira')).not.toBeNull()
  })
})
