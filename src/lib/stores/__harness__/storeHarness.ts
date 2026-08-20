/**
 * Store test harness (CR-1 prerequisite, research/54).
 *
 * The reactive stores are `.svelte.ts` runes modules; the "svelte" vitest project
 * (see vitest.config.ts) compiles them so they can be instantiated in a test. This
 * module provides the reusable scaffolding the CR-1 atomicity tests need:
 *  - `makeDbRecorder()` — a Proxy-based `database` mock that records every call and
 *    lets a chosen method throw (to simulate a mid-turn write failure).
 *  - builders for the minimal Story / Character / ClassificationResult shapes.
 *
 * vi.mock() wiring stays in the test file (it is hoisted); this module supplies the
 * implementations and fixtures those mocks return.
 */

export interface DbCall {
  method: string
  args: unknown[]
}

export interface DbRecorder {
  /** The mock object to hand to `vi.mock('$lib/services/database', () => ({ database }))`. */
  database: Record<string, (...args: unknown[]) => Promise<unknown>>
  /** Every method call, in order. */
  calls: DbCall[]
  /** Force `method` to reject with `error` on its next (and every) call. */
  failOn: (method: string, error?: Error) => void
  /** Clear a previously-installed failure. */
  clearFailure: (method: string) => void
  /** Convenience: names of write methods invoked, in order. */
  methodsCalled: () => string[]
}

// Read methods return an empty list; everything else resolves undefined. Single-row
// getters (getStory, getCharacter, …) are not auto-defaulted — override per test if a
// method under test reads one back.
const LIST_DEFAULT = /^get[A-Z].*s$/ // getCharacters, getLocations, getEntries, …

/**
 * Build a `database` mock that records calls and can be told to fail a given method.
 * Any method name works (Proxy) so tests never enumerate the ~40-method surface.
 */
export function makeDbRecorder(): DbRecorder {
  const calls: DbCall[] = []
  const failures = new Map<string, Error>()

  const database = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return undefined // not a thenable
        // Two batch-state readers need real values, not the generic
        // resolves-undefined stub: `isBatchOpen()` is SYNC and a Promise would be
        // truthy at every call site, and `waitForBatchClose()` is awaited before a
        // re-read, so it must settle. Neither is recorded — they are reads.
        if (prop === 'isBatchOpen') return () => false
        if (prop === 'waitForBatchClose') return () => Promise.resolve()
        // Every method (including the CR-1 batch API — beginWriteBatch,
        // commitWriteBatch, abortWriteBatch — and the entity writes) is recorded
        // and resolves undefined, unless failOn(method) is set for it. The store
        // drives its own control flow (begin → buffered writes → commit → catch →
        // in-memory rollback); the harness models a flush/write failure with
        // failOn('commitWriteBatch') or failOn('updateCharacter').
        return (...args: unknown[]) => {
          calls.push({ method: prop, args })
          const failure = failures.get(prop)
          if (failure) return Promise.reject(failure)
          if (LIST_DEFAULT.test(prop)) return Promise.resolve([])
          return Promise.resolve(undefined)
        }
      },
    },
  ) as DbRecorder['database']

  return {
    database,
    calls,
    failOn: (method, error) => failures.set(method, error ?? new Error(`mock failure: ${method}`)),
    clearFailure: (method) => failures.delete(method),
    methodsCalled: () => calls.map((c) => c.method),
  }
}

/** Minimal experimentalFeatures block for the settings mock. */
export function makeSettings(overrides: Record<string, boolean> = {}) {
  return {
    experimentalFeatures: {
      stateTracking: false,
      rollbackOnDelete: false,
      lightweightBranches: false,
      ...overrides,
    },
    // No preset assigned ⇒ creation-time identity hygiene (fired fire-and-forget
    // for every new character) short-circuits to a clean no-op instead of
    // reaching a missing settings surface and rejecting.
    getServicePresetId: () => null,
  }
}

/** Minimal ui mock — the store calls showToast on a swallowed write failure. */
export function makeUi() {
  return {
    showToast: () => {},
    isGenerating: false,
    clearRetryBackup: () => {},
    setPendingCheckRecord: () => {},
  }
}

type AnyRecord = Record<string, unknown>

export function makeCharacter(name: string, overrides: AnyRecord = {}): AnyRecord {
  return {
    id: `char-${name.toLowerCase()}`,
    storyId: 's1',
    name,
    status: 'active',
    relationship: 'ally',
    traits: [],
    visualDescriptors: {},
    description: '',
    metadata: null,
    branchId: null,
    ...overrides,
  }
}

export function makeStory(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 's1',
    title: 'Test Story',
    currentBranchId: null,
    timeTracker: null,
    settings: {},
    ...overrides,
  }
}

/** A ClassificationResult with all arrays empty; pass `entryUpdates`/`scene` overrides. */
export function makeClassificationResult(overrides: AnyRecord = {}): AnyRecord {
  const entryUpdates = {
    characterUpdates: [],
    locationUpdates: [],
    itemUpdates: [],
    storyBeatUpdates: [],
    newCharacters: [],
    newLocations: [],
    newItems: [],
    newStoryBeats: [],
    ...((overrides.entryUpdates as AnyRecord) ?? {}),
  }
  const scene = {
    currentLocationName: null,
    presentCharacterNames: [],
    timeProgression: 'none',
    ...((overrides.scene as AnyRecord) ?? {}),
  }
  return { entryUpdates, scene }
}
