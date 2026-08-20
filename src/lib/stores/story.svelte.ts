import type {
  Story,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  Chapter,
  Checkpoint,
  Branch,
  MemoryConfig,
  StoryMode,
  StorySettings,
  Entry,
  TimeTracker,
  EmbeddedImage,
  PersistentCharacterSnapshot,
  WorldStateDelta,
  WorldStateSnapshot,
  CharacterBeforeState,
  LocationBeforeState,
  ItemBeforeState,
  StoryBeatBeforeState,
} from '$lib/types'
import { database } from '$lib/services/database'
import { rollbackService } from '$lib/services/rollbackService'
import { ui } from './ui.svelte'
import { settings } from './settings.svelte'
import {
  DEFAULT_BE_STORY_CONFIG,
  INTERACTION_MILESTONES,
  assignQuirks,
  beConditionsFromResult,
  beEventsFromResult,
  beSoftStatesFromResult,
  bondEventsFromResult,
  coerceEffectTags,
  dedupeForCast,
  defaultBodyState,
  exposureEventsFromResult,
  detectDrift,
  findMilkItem,
  lactationOf,
  measurements,
  milkItemMetadata,
  milkItemName,
  qualityFromBand,
  parseGrowthEligibleKinds,
  promoteGrowthIntent,
  readBodyState,
  reduceCharacterBody,
  seedBaselineFromText,
  sniffTierFromText,
  translateSpellEffects,
  writeBodyState,
  type BeEvent,
  type BeLogRecord,
  type BeSoftState,
  type BodyCondition,
  type BodyState,
  type BondEvent,
  type ExposureEvent,
  type MilkQuality,
} from '$lib/services/be'
import {
  ALCHEMY_MILK_BONUS_INTENSITY,
  ESSENCE_REGEN_PER_PERIOD,
  applyLevelGrants,
  checkRecordTargets,
  crossingKey,
  defaultRpgSheet,
  detectRpgDrift,
  essenceMax,
  isStoredRpgSheetInvalid,
  periodIndex,
  readRpgSheet,
  sheetOrDefault,
  withStartingGrant,
  writeRpgSheet,
  type CheckBand,
  type CheckRecord,
} from '$lib/services/rpg'
import { buildSpellEntryData, type SpellGeneration } from '$lib/services/ai/sdk/schemas/spell'
import { extractInlineCustomVars } from '$lib/services/ai/sdk/schemas/runtime-variables'
import type { ClassificationResult } from '$lib/services/ai/sdk/schemas/classifier'
import type { RuntimeVariable } from '$lib/services/packs/types'
import { DEFAULT_MEMORY_CONFIG } from '$lib/services/ai/generation/MemoryService'
import { LorebookImportExport } from '$lib/services/lorebookImportExport'
import { countTokens } from '$lib/services/tokenizer'
import type { STChatMessage } from '$lib/services/stChatImporter'
import {
  eventBus,
  emitStoryLoaded,
  emitModeChanged,
  emitStateUpdated,
  emitChapterCreated,
  type CheckpointCreatedEvent,
  type StoryCreatedEvent,
} from '$lib/services/events'
import { applyIdentityHygiene } from '$lib/services/ai/image/identityHygiene'
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
import { aiService } from '$lib/services/ai'
import { createLogger } from '$lib/log'
import { grammarService } from '$lib/services/grammar'

const log = createLogger('StoryStore')

/**
 * Max concurrent creation-time identity-hygiene extractions (D-13). Each is one
 * LLM call; a crowd scene creating many characters would otherwise fire them all
 * at once against the provider.
 */
const IDENTITY_HYGIENE_CONCURRENCY = 2

/**
 * Merge LLM-extracted inline runtime vars into entity metadata.runtimeVars.
 * Values are keyed by defId (RuntimeVariable.id), NOT variableName,
 * so renames only change the definition -- stored values follow automatically.
 *
 * @param existingMetadata - Current entity metadata (may be null)
 * @param inlineVars - LLM-extracted vars keyed by variableName (from extractInlineCustomVars)
 * @param defsByName - Lookup from variableName to RuntimeVariable definition
 * @returns Updated metadata with runtimeVars merged
 */
function mergeRuntimeVars(
  existingMetadata: Record<string, unknown> | null,
  inlineVars: Record<string, unknown> | undefined,
  defsByName: Map<string, RuntimeVariable>,
): Record<string, unknown> {
  if (!inlineVars || Object.keys(inlineVars).length === 0) {
    return existingMetadata ?? {}
  }

  const base = existingMetadata ?? {}
  const runtimeVars = { ...((base.runtimeVars as Record<string, unknown>) ?? {}) }

  for (const [key, value] of Object.entries(inlineVars)) {
    const def = defsByName.get(key)
    if (def) {
      runtimeVars[def.id] = { variableName: def.variableName, v: value }
    }
  }

  return { ...base, runtimeVars }
}

/**
 * Outcome of `applyClassificationResult` (D-7).
 *
 * `applied: false` used to be a bare boolean, which collapsed three very
 * different endings into one value: a genuine rollback (the turn's writes were
 * discarded — the user should be told and offered Retry), a replay skip (the
 * entry already committed once, so its tail work already ran), and "no story
 * loaded". The caller gates the post-turn tail on `applied` and messages the
 * user only on `rolled_back`.
 */
export type ClassificationApplyOutcome =
  | { applied: true }
  | { applied: false; reason: 'rolled_back' | 'replay' | 'no_story' }

// Story Store using Svelte 5 runes
class StoryStore {
  // Current active story
  currentStory = $state<Story | null>(null)
  entries = $state<StoryEntry[]>([])
  currentBgImage = $state<string | null>(null)

  // Lorebook entries (per design doc section 3.2)
  lorebookEntries = $state<Entry[]>([])

  // World state for current story
  characters = $state<Character[]>([])
  locations = $state<Location[]>([])
  items = $state<Item[]>([])
  storyBeats = $state<StoryBeat[]>([])

  // Memory system
  chapters = $state<Chapter[]>([])
  checkpoints = $state<Checkpoint[]>([])

  // Branching system
  branches = $state<Branch[]>([])

  // Story library
  allStories = $state<Story[]>([])

  // Performance caches - avoid O(n) recalculations on every access
  private _cachedWordCount: number = 0
  private _wordCountDirty = $state(true)
  private _cachedLastChapterEndIndex: number = 0
  private _lastChapterEndIndexDirty: boolean = true
  private _lastChaptersLength: number = 0
  private _lastEntriesLength: number = 0

  // Entry ID to index map for O(1) lookups
  private _entryIdToIndex: Map<string, number> = new Map()

  // Retry operation lock - prevents editing during retry restore
  private _isRetryInProgress = $state(false)

  // Public getter to check if retry is in progress
  get isRetryInProgress(): boolean {
    return this._isRetryInProgress
  }

  // Derived states
  get currentLocation(): Location | undefined {
    return this.locations.find((l) => l.current)
  }

  get activeCharacters(): Character[] {
    return this.characters.filter((c) => c.status === 'active')
  }

  get protagonist(): Character | undefined {
    return this.characters.find((c) => c.relationship === 'self')
  }

  get pov(): 'first' | 'second' | 'third' {
    const mode = this.currentStory?.mode ?? 'adventure'
    const stored = this.currentStory?.settings?.pov ?? null
    // For creative-writing mode, respect the user's stored POV choice
    // (wizard allows selecting first, second, or third person)
    if (stored) {
      return stored
    }
    // Default based on mode
    if (mode === 'creative-writing') {
      return 'third'
    }
    return 'first'
  }

  get tense(): 'past' | 'present' {
    const mode = this.currentStory?.mode ?? 'adventure'
    const stored = this.currentStory?.settings?.tense ?? null
    if (mode === 'creative-writing') {
      return 'past'
    }
    return stored ?? 'present'
  }

  get inventoryItems(): Item[] {
    return this.items.filter((i) => i.location === 'inventory')
  }

  get equippedItems(): Item[] {
    return this.items.filter((i) => i.equipped)
  }

  get pendingQuests(): StoryBeat[] {
    return this.storyBeats.filter((b) => b.status === 'pending' || b.status === 'active')
  }

  get lastUserActionId(): string | null {
    // Search from the end for efficiency
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (this.entries[i].type === 'user_action') {
        return this.entries[i].id
      }
    }
    return null
  }

  get wordCount(): number {
    // Use cached value if available, recalculate only when dirty
    if (this._wordCountDirty) {
      this._cachedWordCount = this.entries.reduce((count, entry) => {
        return count + entry.content.split(/\s+/).filter(Boolean).length
      }, 0)
      this._wordCountDirty = false
    }
    return this._cachedWordCount
  }

  /**
   * Invalidate word count cache - call when entries are added/removed/modified
   */
  private invalidateWordCountCache(): void {
    this._wordCountDirty = true
  }

  get memoryConfig(): MemoryConfig {
    return this.currentStory?.memoryConfig || DEFAULT_MEMORY_CONFIG
  }

  get storyMode(): StoryMode {
    return this.currentStory?.mode || 'adventure'
  }

  get timeTracker(): TimeTracker {
    return this.currentStory?.timeTracker || { years: 0, days: 0, hours: 0, minutes: 0 }
  }

  /**
   * Get chapters filtered by current branch and its lineage.
   * Includes main branch chapters plus any ancestor/current branch chapters.
   */
  get currentBranchChapters(): Chapter[] {
    const currentBranchId = this.currentStory?.currentBranchId ?? null

    // If on main branch, only return chapters with null branchId
    if (currentBranchId === null) {
      return this.chapters.filter((ch) => ch.branchId === null)
    }

    const lineage = this.buildBranchLineage(currentBranchId)
    if (lineage.length === 0) {
      return this.chapters.filter((ch) => ch.branchId === null)
    }

    const lineageIds = new Set(lineage.map((branch) => branch.id))
    return this.chapters.filter((ch) => ch.branchId === null || lineageIds.has(ch.branchId))
  }

  get lastChapterEndIndex(): number {
    // Use branch-filtered chapters for this computation
    const branchChapters = this.currentBranchChapters
    if (branchChapters.length === 0) return 0

    // Check if cache is valid - invalidate if chapters or entries changed
    const chaptersChanged = this.chapters.length !== this._lastChaptersLength
    const entriesChanged = this.entries.length !== this._lastEntriesLength

    if (chaptersChanged || entriesChanged || this._lastChapterEndIndexDirty) {
      this._lastChaptersLength = this.chapters.length
      this._lastEntriesLength = this.entries.length
      this._cachedLastChapterEndIndex = this._computeLastChapterEndIndex()
      this._lastChapterEndIndexDirty = false
    }

    return this._cachedLastChapterEndIndex
  }

  /**
   * Rebuild the entry ID to index map for O(1) lookups.
   * Called when entries array changes significantly.
   */
  private rebuildEntryIdIndex(): void {
    this._entryIdToIndex.clear()
    for (let i = 0; i < this.entries.length; i++) {
      this._entryIdToIndex.set(this.entries[i].id, i)
    }
  }

  /**
   * Compute lastChapterEndIndex - internal implementation.
   * Uses branch-filtered chapters for correct branch awareness.
   */
  private _computeLastChapterEndIndex(): number {
    // Use branch-filtered chapters
    const branchChapters = this.currentBranchChapters
    if (branchChapters.length === 0) return 0

    // Rebuild index map if needed
    if (this._entryIdToIndex.size !== this.entries.length) {
      this.rebuildEntryIdIndex()
    }

    // Sort chapters by number to ensure we get the actual last chapter for this branch
    const sortedChapters = [...branchChapters].sort((a, b) => a.number - b.number)
    const lastChapter = sortedChapters[sortedChapters.length - 1]

    // Use O(1) map lookup instead of O(n) find + indexOf
    const endIndex = this._entryIdToIndex.get(lastChapter.endEntryId)
    if (endIndex !== undefined) {
      return endIndex + 1
    }

    // Fallback: if endEntryId references a deleted entry, estimate based on entry counts
    log('Warning: Chapter endEntryId not found, using fallback calculation', {
      chapterId: lastChapter.id,
      chapterNumber: lastChapter.number,
      endEntryId: lastChapter.endEntryId,
    })

    // Sum up all branch chapter entry counts as a fallback estimate
    const totalChapterEntries = sortedChapters.reduce((sum, ch) => sum + ch.entryCount, 0)
    return Math.min(totalChapterEntries, this.entries.length)
  }

  /**
   * Invalidate lastChapterEndIndex cache - call when chapters change
   */
  private invalidateChapterCache(): void {
    this._lastChapterEndIndexDirty = true
    this._entryIdToIndex.clear() // Force rebuild on next access
  }

  get messagesSinceLastChapter(): number {
    return this.entries.length - this.lastChapterEndIndex
  }

  /**
   * Calculate token count since last chapter.
   * Uses stored token count (accurate) or calculates via tokenizer for legacy entries.
   */
  get tokensSinceLastChapter(): number {
    const visibleEntries = this.entries.slice(this.lastChapterEndIndex)
    return visibleEntries.reduce((total, entry) => {
      // Use stored token count if available
      if (entry.metadata?.tokenCount) {
        return total + entry.metadata.tokenCount
      }
      // Fallback for legacy entries without stored token count
      return total + countTokens(entry.content)
    }, 0)
  }

  /**
   * Get token count for entries outside the buffer (eligible for summarization).
   * Returns 0 if no entries exist outside the buffer.
   */
  get tokensOutsideBuffer(): number {
    const bufferSize = this.memoryConfig.chapterBuffer
    const visibleEntries = this.entries.slice(this.lastChapterEndIndex)

    // If all visible entries are within the buffer, nothing to summarize
    if (visibleEntries.length <= bufferSize) {
      return 0
    }

    // Count tokens for entries outside the buffer
    // Note: slice(0, -0) returns [] in JavaScript, so we need to handle bufferSize === 0 specially
    const entriesOutsideBuffer =
      bufferSize === 0 ? visibleEntries : visibleEntries.slice(0, -bufferSize)
    return entriesOutsideBuffer.reduce((total, entry) => {
      if (entry.metadata?.tokenCount) {
        return total + entry.metadata.tokenCount
      }
      // Fallback for legacy entries without stored token count
      return total + countTokens(entry.content)
    }, 0)
  }

  /**
   * Get entries that are NOT part of any chapter (visible in context).
   * These are entries after the last chapter's endEntryId.
   * Per design doc section 3.1.2: summarized entries should be excluded from context.
   */
  get visibleEntries(): StoryEntry[] {
    if (this.chapters.length === 0) {
      // No chapters yet, all entries are visible
      return this.entries
    }
    // Return only entries after the last chapter
    return this.entries.slice(this.lastChapterEndIndex)
  }

  /**
   * Check if a specific entry has been summarized into a chapter.
   * Uses O(1) map lookup for performance.
   */
  isEntrySummarized(entryId: string): boolean {
    // Ensure index map is up to date
    if (this._entryIdToIndex.size !== this.entries.length) {
      this.rebuildEntryIdIndex()
    }
    const entryIndex = this._entryIdToIndex.get(entryId)
    if (entryIndex === undefined) return false
    return entryIndex < this.lastChapterEndIndex
  }

  /**
   * Validate chapter integrity and repair issues.
   * Called after loading a story to ensure chapter data is consistent.
   * Returns true if repairs were made.
   */
  private async validateChapterIntegrity(): Promise<boolean> {
    if (this.chapters.length === 0) return false

    let repairsMade = false
    const entryIdSet = new Set(this.entries.map((e) => e.id))
    const chaptersToDelete: string[] = []

    // Sort chapters by number for proper validation
    const sortedChapters = [...this.chapters].sort((a, b) => a.number - b.number)

    for (const chapter of sortedChapters) {
      const hasValidStart = entryIdSet.has(chapter.startEntryId)
      const hasValidEnd = entryIdSet.has(chapter.endEntryId)

      if (!hasValidStart || !hasValidEnd) {
        log('Chapter has invalid entry references, marking for deletion', {
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          hasValidStart,
          hasValidEnd,
          startEntryId: chapter.startEntryId,
          endEntryId: chapter.endEntryId,
        })
        chaptersToDelete.push(chapter.id)
        repairsMade = true
      }
    }

    // Delete invalid chapters from database and local state
    for (const chapterId of chaptersToDelete) {
      try {
        await database.deleteChapter(chapterId)
        log('Deleted invalid chapter:', chapterId)
      } catch (error) {
        log('Failed to delete invalid chapter:', chapterId, error)
      }
    }

    if (chaptersToDelete.length > 0) {
      this.chapters = this.chapters.filter((ch) => !chaptersToDelete.includes(ch.id))
      // Invalidate chapter cache after deletions
      this.invalidateChapterCache()
    }

    // Ensure chapters are sorted by number
    this.chapters = [...this.chapters].sort((a, b) => a.number - b.number)

    if (repairsMade) {
      log('Chapter integrity validation complete', {
        deletedChapters: chaptersToDelete.length,
        remainingChapters: this.chapters.length,
      })
    }

    return repairsMade
  }

  private resetStoryState(): void {
    this.currentStory = null
    this.entries = []
    this.characters = []
    this.locations = []
    this.items = []
    this.storyBeats = []
    this.chapters = []
    this.checkpoints = []
    this.lorebookEntries = []
    this.invalidateWordCountCache()
    this.invalidateChapterCache()
    grammarService.clearEntityWords()
  }

  // Close the current story and reset state
  closeStory(): void {
    this.resetStoryState()
    this.currentBgImage = null
    this.branches = []
    log('Story closed')
  }

  // Load all stories for library view
  async loadAllStories(): Promise<void> {
    this.allStories = await database.getAllStories()
  }

  // Load a specific story with all its data
  async loadStory(storyId: string): Promise<void> {
    const story = await database.getStory(storyId)
    if (!story) {
      throw new Error(`Story not found: ${storyId}`)
    }

    // Clean up any orphaned embedded_images before loading
    // (fixes FK constraint issues from older data)
    await database.cleanupOrphanedEmbeddedImages()
    // Sprite-cache orphan sweep (belt-and-suspenders beside the FK cascade)
    await database.cleanupOrphanedSprites()

    this.currentStory = story
    this.currentBgImage = await database.getBackgroundForBranch(storyId, story.currentBranchId)

    // Load branch-independent data first
    const [characters, locations, items, storyBeats, checkpoints, lorebookEntries, branches] =
      await Promise.all([
        database.getCharacters(storyId),
        database.getLocations(storyId),
        database.getItems(storyId),
        database.getStoryBeats(storyId),
        database.getCheckpoints(storyId),
        database.getEntries(storyId),
        database.getBranches(storyId),
      ])

    this.characters = characters
    this.locations = locations
    this.items = items
    this.storyBeats = storyBeats
    this.checkpoints = checkpoints
    this.lorebookEntries = lorebookEntries
    this.branches = branches

    // Import entity names into spell checker so they are not flagged as errors
    const entityNames = [
      ...characters.map((c) => c.name),
      ...locations.map((l) => l.name),
      ...items.map((i) => i.name),
      ...lorebookEntries.map((e) => e.name),
      ...lorebookEntries.flatMap((e) => e.aliases ?? []),
    ].filter(Boolean)
    grammarService.importEntityWords(entityNames)

    // Load entries and chapters based on current branch
    await this.reloadEntriesForCurrentBranch()

    // Reset all caches after loading
    this.invalidateWordCountCache()
    this.invalidateChapterCache()

    log('Story loaded', {
      id: storyId,
      mode: story.mode,
      entries: this.entries.length,
      lorebookEntries: lorebookEntries.length,
      chapters: this.chapters.length,
      checkpoints: checkpoints.length,
      branches: branches.length,
      currentBranchId: story.currentBranchId,
    })

    // Load persisted activation data for this story (stickiness tracking)
    await ui.loadActivationData(storyId)

    // Clear stale lorebook retrieval from previous story to prevent cross-story contamination
    ui.setLastLorebookRetrieval(null)

    // Set current story ID for retry backup tracking
    ui.setCurrentRetryStoryId(storyId)

    // Load retry state from DB if we don't have an in-memory backup for this story
    if (story.retryState) {
      ui.loadRetryBackupFromPersistent(storyId, story.retryState)
    }

    // Load style review state from DB
    ui.loadStyleReviewState(storyId, story.styleReviewState)

    // Validate and repair chapter integrity (handles orphaned references)
    await this.validateChapterIntegrity()

    // Load persisted action choices for adventure mode
    if (story.mode === 'adventure') {
      await ui.loadActionChoices(storyId)
    }

    // Load persisted suggestions for creative-writing mode
    if (story.mode === 'creative-writing') {
      await ui.loadSuggestions(storyId)
    }

    // Set mobile-friendly defaults (close sidebar, etc.)
    ui.setMobileDefaults()

    // Emit event
    emitStoryLoaded(storyId, story.mode)
  }

  // Create a new story
  async createStory(
    title: string,
    templateId?: string,
    genre?: string,
    mode: StoryMode = 'adventure',
  ): Promise<Story> {
    const storyData = await database.createStory({
      id: crypto.randomUUID(),
      title,
      description: null,
      genre: genre ?? null,
      templateId: templateId ?? null,
      mode,
      settings: null,
      memoryConfig: DEFAULT_MEMORY_CONFIG,
      retryState: null,
      styleReviewState: null,
      timeTracker: null,
      currentBranchId: null,
      currentBgImage: null,
    })

    this.allStories = [storyData, ...this.allStories]

    // Emit event
    eventBus.emit<StoryCreatedEvent>({ type: 'StoryCreated', storyId: storyData.id, mode })

    return storyData
  }

  /**
   * Import a SillyTavern chat into the current story, replacing all existing
   * main-branch entries. The current story must be loaded before calling this.
   */
  async importSTChat(messages: STChatMessage[]): Promise<void> {
    if (!this.currentStory) {
      throw new Error('No story loaded')
    }

    const storyId = this.currentStory.id

    // Branches fork off main-branch entries via fork_entry_id.
    // Deleting all main-branch entries would leave every branch with a
    // dangling FK reference — block the import if any branches exist.
    if (this.branches.length > 0) {
      throw new Error(
        `Cannot import: this story has ${this.branches.length} branch${this.branches.length === 1 ? '' : 'es'}. ` +
          'Delete all branches before importing a SillyTavern chat.',
      )
    }

    // Wipe all existing main-branch entries
    await database.clearStoryEntries(storyId)

    // Build entry objects up front, then bulk-insert in batches
    // (O(n/50) IPC calls instead of O(n))
    const entries: Omit<StoryEntry, 'createdAt'>[] = messages.map((msg, i) => ({
      id: crypto.randomUUID(),
      storyId,
      type: msg.type,
      content: msg.content,
      parentId: null,
      position: i,
      metadata: { source: 'sillytavern_import' },
      branchId: null,
    }))
    await database.bulkInsertStoryEntries(entries)

    // Bump the story's updatedAt so the library view reflects the import
    await database.updateStory(storyId, {})
    this.currentStory.updatedAt = Date.now()

    // Reload entries into the store
    await this.reloadEntriesForCurrentBranch()
  }

  /**
   * Trigger suggested-action generation after a SillyTavern import.
   * Called by the modal once the user has made their world-state choice,
   * so generation doesn't start before that dialog is resolved.
   */
  triggerSuggestionsAfterImport(): void {
    this.restoreSuggestedActionsAfterDelete()
  }

  /**
   * Reset mutable world state after a SillyTavern chat import.
   * Clears locations, items, story beats, and the time tracker.
   * Characters and lorebook entries are intentionally preserved.
   */
  async resetWorldStateAfterImport(): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')
    await database.resetWorldStateForImport(this.currentStory.id)
    this.locations = []
    this.items = []
    this.storyBeats = []
    this.currentStory = { ...this.currentStory, timeTracker: null }
  }

  // Add a new story entry
  // The optional id parameter allows pre-generating the entry ID before streaming starts,
  // which is needed for inline image generation during streaming
  async addEntry(
    type: StoryEntry['type'],
    content: string,
    metadata?: StoryEntry['metadata'],
    reasoning?: string,
    id?: string,
  ): Promise<StoryEntry> {
    if (!this.currentStory) {
      throw new Error('No story loaded')
    }

    // Count tokens for accurate auto-summarize threshold detection
    const tokenCount = countTokens(content)

    // Capture current story time as timeStart for this entry
    // timeEnd defaults to timeStart; for narration entries, timeEnd is updated after classification
    const timeStart = this.currentStory.timeTracker
      ? { ...this.currentStory.timeTracker }
      : { years: 0, days: 0, hours: 0, minutes: 0 }
    const timeEnd = { ...timeStart }

    const position = await database.getNextEntryPosition(
      this.currentStory.id,
      this.currentStory.currentBranchId,
    )
    const entry = await database.addStoryEntry({
      id: id ?? crypto.randomUUID(),
      storyId: this.currentStory.id,
      type,
      content,
      parentId: null,
      position,
      metadata: { ...metadata, tokenCount, timeStart, timeEnd },
      branchId: this.currentStory.currentBranchId,
      reasoning,
    })

    this.entries = [...this.entries, entry]

    // Invalidate caches
    this.invalidateWordCountCache()
    this.invalidateChapterCache()

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {})

    return entry
  }

  // Update a story entry
  async updateEntry(entryId: string, content: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Prevent editing during any generation or retry restore to avoid race conditions
    // Silently return - UI should disable buttons using ui.isGenerating
    if (this._isRetryInProgress || ui.isGenerating) {
      log('Edit blocked - generation or retry in progress')
      return
    }

    const existingEntry = this.entries.find((e) => e.id === entryId)
    if (!existingEntry) throw new Error('Entry not found')

    // Prevent modifying inherited entries on a branch
    // An entry is inherited if its branchId doesn't match the current branch
    const currentBranchId = this.currentStory.currentBranchId
    if ((existingEntry.branchId ?? null) !== currentBranchId) {
      throw new Error(
        'Cannot edit inherited entries. This entry belongs to ' +
          (existingEntry.branchId === null ? 'the main branch' : 'a parent branch') +
          '. Create new content on this branch instead.',
      )
    }

    // Recalculate token count when content changes
    const tokenCount = countTokens(content)
    const updatedMetadata = { ...existingEntry.metadata, tokenCount }

    await database.updateStoryEntry(entryId, { content, metadata: updatedMetadata })
    this.entries = this.entries.map((e) =>
      e.id === entryId ? { ...e, content, metadata: updatedMetadata } : e,
    )

    // Invalidate word count cache (content changed)
    this.invalidateWordCountCache()

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {})
  }

  /**
   * Restore suggested actions from the new last narration entry after time-travel (delete).
   * Returns true if saved actions were found and restored, false if regeneration is needed.
   */
  private restoreSuggestedActionsAfterDelete(): boolean {
    if (!this.currentStory) return false

    // Find the new last narration entry (actions attach to narration entries)
    const lastNarration = [...this.entries].reverse().find((e) => e.type === 'narration')

    const storyMode = this.storyMode
    const storyId = this.currentStory.id

    if (lastNarration) {
      const restored = ui.restoreSuggestedActionsFromEntry(
        storyMode,
        lastNarration.suggestedActions,
        storyId,
      )
      if (restored) {
        log('Restored suggested actions from entry at position', lastNarration.position)
        return true
      }
    }

    // No saved actions found — clear current ones so stale actions don't persist
    if (storyMode === 'adventure') {
      ui.clearActionChoices(storyId)
    } else {
      ui.clearSuggestions(storyId)
    }
    // Request auto-regeneration from the UI component
    ui.suggestionsRegenerationNeeded = true
    log('No saved suggested actions found after delete — requesting regeneration')
    return false
  }

  /**
   * Common cleanup logic after an entry is deleted.
   * Restores suggested actions from the new last narration entry and invalidates the retry backup.
   */
  private postDeleteCleanup(): void {
    this.restoreSuggestedActionsAfterDelete()
    ui.clearRetryBackup(true)
  }

  // Delete a story entry
  async deleteEntry(entryId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Prevent deleting during any generation or retry restore to avoid race conditions
    // Silently return - UI should disable buttons using ui.isGenerating
    if (this._isRetryInProgress || ui.isGenerating) {
      log('Delete blocked - generation or retry in progress')
      return
    }

    const existingEntry = this.entries.find((e) => e.id === entryId)
    if (!existingEntry) throw new Error('Entry not found')

    // Prevent deleting inherited entries on a branch
    // An entry is inherited if its branchId doesn't match the current branch
    const currentBranchId = this.currentStory.currentBranchId
    if ((existingEntry.branchId ?? null) !== currentBranchId) {
      throw new Error(
        'Cannot delete inherited entries. This entry belongs to ' +
          (existingEntry.branchId === null ? 'the main branch' : 'a parent branch') +
          '. You can only delete entries created on the current branch.',
      )
    }

    // Check if this entry is a fork point for any branch
    const branchUsingEntry = this.branches.find((b) => b.forkEntryId === entryId)
    if (branchUsingEntry) {
      throw new Error(
        `Cannot delete this entry because it is the fork point for branch "${branchUsingEntry.name}". ` +
          `Delete the branch first if you want to remove this entry.`,
      )
    }

    // Phase 2: Rollback on delete — cascade delete from this position with world state undo
    const rollbackEnabled =
      settings.experimentalFeatures.stateTracking && settings.experimentalFeatures.rollbackOnDelete

    if (rollbackEnabled) {
      log('Rollback-on-delete: cascading from position', existingEntry.position)

      // Run rollback to undo world state changes for this entry and all after it
      const rollbackSummary = await rollbackService.rollbackFromPosition(
        this.currentStory.id,
        currentBranchId ?? null,
        existingEntry.position,
        this.entries,
      )

      log('Rollback summary:', rollbackSummary)

      // H-1: if any world-state undo failed, the rollback is PARTIAL — some entities
      // are still in their post-turn state. Deleting the entries now would destroy the
      // deltas needed to retry, stranding those mutations permanently. Abort instead and
      // surface the failure; the deltas survive, and the idempotent rollback can be
      // re-run (a fresh delete attempt) once the underlying cause clears.
      if (rollbackSummary.failures.length > 0) {
        const failedNames = rollbackSummary.failures
          .map((f) => `${f.operation} ${f.entityType}${f.id ? ` ${f.id}` : ''}`)
          .join(', ')
        console.error('[StoryStore] Partial rollback — aborting delete:', rollbackSummary.failures)
        throw new Error(
          `Couldn't fully undo world-state changes for this entry (${rollbackSummary.failures.length} step(s) failed: ${failedNames}). ` +
            `The entry was kept so nothing is left in a half-undone state — try deleting again.`,
        )
      }

      // Now cascade-delete entries from this position onward (skip rollback — already done)
      await this.deleteEntriesFromPosition(existingEntry.position, { skipRollback: true })

      // Reload all entities from DB to ensure in-memory state is consistent
      await this.reloadEntriesForCurrentBranch()

      // Also reload time tracker from the story record
      const freshStory = await database.getStory(this.currentStory.id)
      if (freshStory) {
        this.currentStory = { ...this.currentStory, timeTracker: freshStory.timeTracker }
      }

      this.postDeleteCleanup()

      return
    }

    // Legacy behavior: delete just this one entry (no world state changes)
    await database.deleteStoryEntry(entryId)
    this.entries = this.entries.filter((e) => e.id !== entryId)

    // Invalidate caches
    this.invalidateWordCountCache()
    this.invalidateChapterCache()

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {})

    this.postDeleteCleanup()
  }

  /**
   * Update an entry's timeEnd metadata after classification applies time progression.
   * Called after applyClassificationResult to record the story time after the entry's events.
   */
  async updateEntryTimeEnd(entryId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const entry = this.entries.find((e) => e.id === entryId)
    if (!entry) {
      log('updateEntryTimeEnd: Entry not found', entryId)
      return
    }

    // Capture current story time as timeEnd
    const timeEnd = this.currentStory.timeTracker
      ? { ...this.currentStory.timeTracker }
      : { years: 0, days: 0, hours: 0, minutes: 0 }

    const updatedMetadata = { ...entry.metadata, timeEnd }

    await database.updateStoryEntry(entryId, { metadata: updatedMetadata })
    this.entries = this.entries.map((e) =>
      e.id === entryId ? { ...e, metadata: updatedMetadata } : e,
    )

    log('Entry timeEnd updated', { entryId, timeEnd })
  }

  /**
   * Update an entry's reasoning content and persist to database.
   */
  async updateEntryReasoning(entryId: string, reasoning: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === entryId)
    if (!entry) return

    // Update in-memory state
    this.entries = this.entries.map((e) => (e.id === entryId ? { ...e, reasoning } : e))

    // Persist to database
    await database.updateStoryEntry(entryId, { reasoning })
  }

  /**
   * Refresh a single entry from the database to pick up changes made directly.
   * Used when background processes update entries (e.g., translation).
   */
  async refreshEntry(entryId: string): Promise<void> {
    const updatedEntry = await database.getStoryEntry(entryId)
    if (!updatedEntry) return

    // Update in-memory state
    this.entries = this.entries.map((e) => (e.id === entryId ? updatedEntry : e))
  }

  /**
   * Update the current background image for the story and persist to database.
   */
  async updateCurrentBackgroundImage(imageData: string | null): Promise<void> {
    if (!this.currentStory) return

    log('Updating background image...', { hasData: !!imageData })
    this.currentBgImage = imageData

    // Keep the currentStory object in sync to prevent any potential inconsistency.
    // The in-place write is deliberate: `saveBackground` is a direct write that
    // commits independently of any open turn batch, so the new value must NOT be
    // captured (and later reverted) by a turn's rollback snapshot — reassigning
    // the whole object would leave a rolled-back turn showing a stale image that
    // disagrees with the DB, and would wake every $effect keyed on currentStory.
    // $state's deep proxy keeps this targeted mutation reactive.
    this.currentStory.currentBgImage = imageData

    await database.saveBackground(
      this.currentStory.id,
      this.currentStory.currentBranchId,
      null,
      imageData,
    )
    log('Background image updated and persisted')
  }

  /**
   * Refresh world state (characters, locations, items, story beats) from the database.
   * Used when background processes update translations.
   */
  async refreshWorldState(): Promise<void> {
    if (!this.currentStory) return

    // Never read-and-reassign the store arrays mid-turn (CR-1): reads bypass the
    // write buffer, so a refresh while a turn's batch is open would replace them
    // with PRE-batch rows and drop the turn's uncommitted changes. Defer rather
    // than skip — this is the only path that surfaces background translations
    // into memory, so dropping it would hide them until a story reload. Waiting
    // for commit/abort yields post-turn truth.
    // Loop: a new batch can open between a waiter resolving and our reads.
    await database.whenBatchIdle()
    // The user may have closed or switched stories while we waited.
    if (!this.currentStory) return

    const storyId = this.currentStory.id
    const branchId = this.currentStory.currentBranchId

    let characters: Character[]
    let locations: Location[]
    let items: Item[]
    let storyBeats: StoryBeat[]

    if (branchId && settings.experimentalFeatures.lightweightBranches) {
      const currentBranch = this.branches.find((b) => b.id === branchId)
      if (currentBranch?.snapshotComplete) {
        // Snapshot isolation: branch has its own complete entity set
        ;[characters, locations, items, storyBeats] = await Promise.all([
          database.getCharactersForBranch(storyId, branchId),
          database.getLocationsForBranch(storyId, branchId),
          database.getItemsForBranch(storyId, branchId),
          database.getStoryBeatsForBranch(storyId, branchId),
        ])
      } else {
        // Legacy COW: resolve through lineage (pre-snapshot branches)
        const lineage = this.buildBranchLineage(branchId)
        ;[characters, locations, items, storyBeats] = await Promise.all([
          database.getCharactersResolved(storyId, lineage),
          database.getLocationsResolved(storyId, lineage),
          database.getItemsResolved(storyId, lineage),
          database.getStoryBeatsResolved(storyId, lineage),
        ])
      }
    } else if (branchId) {
      // Legacy branch: direct loading
      ;[characters, locations, items, storyBeats] = await Promise.all([
        database.getCharactersForBranch(storyId, branchId),
        database.getLocationsForBranch(storyId, branchId),
        database.getItemsForBranch(storyId, branchId),
        database.getStoryBeatsForBranch(storyId, branchId),
      ])
    } else {
      // Main branch — only load entities with null branch_id
      ;[characters, locations, items, storyBeats] = await Promise.all([
        database.getCharactersForBranch(storyId, null),
        database.getLocationsForBranch(storyId, null),
        database.getItemsForBranch(storyId, null),
        database.getStoryBeatsForBranch(storyId, null),
      ])
    }

    this.characters = characters
    this.locations = locations
    this.items = items
    this.storyBeats = storyBeats

    // Filter out tombstoned entities when COW is enabled
    // (COW resolution already handles this for branch paths, but main branch loads raw data)
    if (settings.experimentalFeatures.lightweightBranches) {
      this.characters = this.characters.filter((c) => !c.deleted)
      this.locations = this.locations.filter((l) => !l.deleted)
      this.items = this.items.filter((i) => !i.deleted)
      this.storyBeats = this.storyBeats.filter((b) => !b.deleted)
    }

    log('World state refreshed', {
      characters: characters.length,
      locations: locations.length,
      items: items.length,
      storyBeats: storyBeats.length,
    })
  }

  /**
   * Delete all entries from a given position onward.
   * Used for entry-only retry restore (persistent retry).
   */
  async deleteEntriesFromPosition(
    position: number,
    options?: { skipRollback?: boolean },
  ): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Phase 2: Rollback world state before deleting entries
    // Skip if caller already performed rollback (e.g. deleteEntry)
    const rollbackEnabled =
      !options?.skipRollback &&
      settings.experimentalFeatures.stateTracking &&
      settings.experimentalFeatures.rollbackOnDelete

    if (rollbackEnabled) {
      try {
        const rollbackSummary = await rollbackService.rollbackFromPosition(
          this.currentStory.id,
          this.currentStory.currentBranchId ?? null,
          position,
          this.entries,
        )
        log('Rollback before deleteEntriesFromPosition:', rollbackSummary)
      } catch (error) {
        console.error('[StoryStore] Rollback failed, proceeding with entry deletion:', error)
      }
    }

    // Find entries to delete (position >= the given position)
    const entriesToDelete = this.entries.filter((e) => e.position >= position)
    const entryIdsToDelete = new Set(entriesToDelete.map((e) => e.id))

    log('Deleting entries from position', {
      position,
      entriesToDelete: entriesToDelete.length,
      totalEntries: this.entries.length,
    })

    // Find chapters that reference any of the entries being deleted
    // (chapters have foreign keys to start_entry_id and end_entry_id)
    const chaptersToDelete = this.chapters.filter(
      (ch) => entryIdsToDelete.has(ch.startEntryId) || entryIdsToDelete.has(ch.endEntryId),
    )

    if (chaptersToDelete.length > 0) {
      log('Deleting chapters that reference entries being deleted', {
        chaptersToDelete: chaptersToDelete.length,
        chapterNumbers: chaptersToDelete.map((ch) => ch.number),
      })

      // Delete chapters first (to satisfy foreign key constraints)
      for (const chapter of chaptersToDelete) {
        await database.deleteChapter(chapter.id)
      }
      this.chapters = this.chapters.filter((ch) => !chaptersToDelete.some((d) => d.id === ch.id))
    }

    // Delete embedded images for entries being deleted
    // (explicit deletion to ensure cleanup even if CASCADE isn't working)
    for (const entry of entriesToDelete) {
      await database.deleteEmbeddedImagesForEntry(entry.id)
    }

    // Now delete entries from database
    if (entriesToDelete.length > 0) {
      await database.deleteStoryEntries(Array.from(entryIdsToDelete))
    }

    // Update in-memory state
    this.entries = this.entries.filter((e) => e.position < position)

    // Invalidate caches
    this.invalidateWordCountCache()
    this.invalidateChapterCache()

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {})

    // Restore suggested actions from the new last narration entry
    this.restoreSuggestedActionsAfterDelete()
  }

  /**
   * Delete entities that were created after the backup.
   * Used for persistent retry restore to remove AI-extracted entities.
   * Compares current entity IDs against the saved ID lists and deletes any not in the lists.
   * NOTE: Lorebook entries are NOT included as they are independent of retry operations
   * (they are based on permanent chapters, not current chat).
   */
  async deleteEntitiesCreatedAfterBackup(savedIds: {
    characterIds: string[]
    locationIds: string[]
    itemIds: string[]
    storyBeatIds: string[]
    embeddedImageIds?: string[]
  }): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const characterIdsSet = new Set(savedIds.characterIds)
    const locationIdsSet = new Set(savedIds.locationIds)
    const itemIdsSet = new Set(savedIds.itemIds)
    const storyBeatIdsSet = new Set(savedIds.storyBeatIds)
    const embeddedImageIdsSet = new Set(savedIds.embeddedImageIds ?? [])

    // Find entities to delete (not in saved lists)
    const charactersToDelete = this.characters.filter((c) => !characterIdsSet.has(c.id))
    const locationsToDelete = this.locations.filter((l) => !locationIdsSet.has(l.id))
    const itemsToDelete = this.items.filter((i) => !itemIdsSet.has(i.id))
    const storyBeatsToDelete = this.storyBeats.filter((sb) => !storyBeatIdsSet.has(sb.id))

    // Embedded images are not in memory - fetch from database to find ones to delete
    // Note: Many embedded images may already be deleted via CASCADE when entries are deleted
    const currentEmbeddedImages = await database.getEmbeddedImagesForStory(this.currentStory.id)
    const embeddedImagesToDelete = savedIds.embeddedImageIds
      ? currentEmbeddedImages.filter((ei) => !embeddedImageIdsSet.has(ei.id))
      : []

    log('Deleting entities created after backup', {
      characters: charactersToDelete.length,
      locations: locationsToDelete.length,
      items: itemsToDelete.length,
      storyBeats: storyBeatsToDelete.length,
      embeddedImages: embeddedImagesToDelete.length,
    })

    // Delete from database
    for (const character of charactersToDelete) {
      await database.deleteCharacter(character.id)
    }
    for (const location of locationsToDelete) {
      await database.deleteLocation(location.id)
    }
    for (const item of itemsToDelete) {
      await database.deleteItem(item.id)
    }
    for (const storyBeat of storyBeatsToDelete) {
      await database.deleteStoryBeat(storyBeat.id)
    }
    for (const embeddedImage of embeddedImagesToDelete) {
      await database.deleteEmbeddedImage(embeddedImage.id)
    }

    // Update in-memory state
    this.characters = this.characters.filter((c) => characterIdsSet.has(c.id))
    this.locations = this.locations.filter((l) => locationIdsSet.has(l.id))
    this.items = this.items.filter((i) => itemIdsSet.has(i.id))
    this.storyBeats = this.storyBeats.filter((sb) => storyBeatIdsSet.has(sb.id))

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {})
  }

  // ===== COW (Copy-on-Write) Branch Helpers =====

  /**
   * Check if we're currently on a COW-enabled branch.
   * Returns true if on a non-main branch with lightweightBranches enabled.
   */
  private isCowBranch(): boolean {
    return !!this.currentStory?.currentBranchId && settings.experimentalFeatures.lightweightBranches
  }

  /**
   * Ensure a character is owned by the current branch (COW).
   * If the character is inherited from a parent branch, creates an override.
   * Returns the owned character (either the original or the new override).
   */
  private async cowCharacter(entity: Character): Promise<{ entity: Character; wasCowed: boolean }> {
    const branchId = this.currentStory?.currentBranchId
    if (
      !branchId ||
      entity.branchId === branchId ||
      !settings.experimentalFeatures.lightweightBranches
    ) {
      return { entity, wasCowed: false }
    }

    const override: Character = {
      ...entity,
      id: crypto.randomUUID(),
      branchId,
      overridesId: entity.overridesId ?? entity.id,
    }
    await database.addCharacter(override)
    this.characters = this.characters.map((c) => (c.id === entity.id ? override : c))
    log(
      'COW: Created character override',
      override.name,
      override.id,
      '→ overrides',
      override.overridesId,
    )
    return { entity: override, wasCowed: true }
  }

  /**
   * Ensure a location is owned by the current branch (COW).
   */
  private async cowLocation(entity: Location): Promise<{ entity: Location; wasCowed: boolean }> {
    const branchId = this.currentStory?.currentBranchId
    if (
      !branchId ||
      entity.branchId === branchId ||
      !settings.experimentalFeatures.lightweightBranches
    ) {
      return { entity, wasCowed: false }
    }

    const override: Location = {
      ...entity,
      id: crypto.randomUUID(),
      branchId,
      overridesId: entity.overridesId ?? entity.id,
    }
    await database.addLocation(override)
    this.locations = this.locations.map((l) => (l.id === entity.id ? override : l))
    log(
      'COW: Created location override',
      override.name,
      override.id,
      '→ overrides',
      override.overridesId,
    )
    return { entity: override, wasCowed: true }
  }

  /**
   * Ensure an item is owned by the current branch (COW).
   */
  private async cowItem(entity: Item): Promise<{ entity: Item; wasCowed: boolean }> {
    const branchId = this.currentStory?.currentBranchId
    if (
      !branchId ||
      entity.branchId === branchId ||
      !settings.experimentalFeatures.lightweightBranches
    ) {
      return { entity, wasCowed: false }
    }

    const override: Item = {
      ...entity,
      id: crypto.randomUUID(),
      branchId,
      overridesId: entity.overridesId ?? entity.id,
    }
    await database.addItem(override)
    this.items = this.items.map((i) => (i.id === entity.id ? override : i))
    log(
      'COW: Created item override',
      override.name,
      override.id,
      '→ overrides',
      override.overridesId,
    )
    return { entity: override, wasCowed: true }
  }

  /**
   * Ensure a story beat is owned by the current branch (COW).
   */
  private async cowStoryBeat(entity: StoryBeat): Promise<{ entity: StoryBeat; wasCowed: boolean }> {
    const branchId = this.currentStory?.currentBranchId
    if (
      !branchId ||
      entity.branchId === branchId ||
      !settings.experimentalFeatures.lightweightBranches
    ) {
      return { entity, wasCowed: false }
    }

    const override: StoryBeat = {
      ...entity,
      id: crypto.randomUUID(),
      branchId,
      overridesId: entity.overridesId ?? entity.id,
    }
    await database.addStoryBeat(override)
    this.storyBeats = this.storyBeats.map((b) => (b.id === entity.id ? override : b))
    log(
      'COW: Created story beat override',
      override.title,
      override.id,
      '→ overrides',
      override.overridesId,
    )
    return { entity: override, wasCowed: true }
  }

  /**
   * Ensure a lorebook entry is owned by the current branch (COW).
   */
  private async cowLorebookEntry(entity: Entry): Promise<{ entity: Entry; wasCowed: boolean }> {
    const branchId = this.currentStory?.currentBranchId
    if (
      !branchId ||
      entity.branchId === branchId ||
      !settings.experimentalFeatures.lightweightBranches
    ) {
      return { entity, wasCowed: false }
    }

    const now = Date.now()
    const override: Entry = {
      ...entity,
      id: crypto.randomUUID(),
      branchId,
      overridesId: entity.overridesId ?? entity.id,
      updatedAt: now,
    }
    await database.addEntry(override)
    this.lorebookEntries = this.lorebookEntries.map((e) => (e.id === entity.id ? override : e))
    log(
      'COW: Created lorebook entry override',
      override.name,
      override.id,
      '→ overrides',
      override.overridesId,
    )
    return { entity: override, wasCowed: true }
  }

  // Add a character
  async addCharacter(
    name: string,
    description?: string,
    relationship?: string,
  ): Promise<Character> {
    if (!this.currentStory) throw new Error('No story loaded')

    const character: Character = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      description: description ?? null,
      relationship: relationship ?? null,
      traits: [],
      status: 'active',
      metadata: null,
      visualDescriptors: {},
      portrait: null,
      branchId: this.currentStory.currentBranchId,
    }

    await database.addCharacter(character)
    this.characters = [...this.characters, character]
    return character
  }

  // Update an existing character (except protagonist swap)
  async updateCharacter(id: string, updates: Partial<Character>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Fall back to the COW override: a two-phase writer (e.g. the sprite-anchor
    // service persisting generating→ready) captures the pre-COW id; the first
    // write's cowCharacter remaps it, and the second write must still land.
    const existing =
      this.characters.find((c) => c.id === id) ?? this.characters.find((c) => c.overridesId === id)
    if (!existing) throw new Error('Character not found')

    if (updates.relationship !== undefined) {
      if (updates.relationship === 'self' && existing.relationship !== 'self') {
        throw new Error('Use setProtagonist to assign a protagonist')
      }
      if (existing.relationship === 'self' && updates.relationship !== 'self') {
        throw new Error('Swap protagonists before changing the current one')
      }
    }

    // COW: ensure entity is owned by current branch before updating
    const { entity: owned } = await this.cowCharacter(existing)
    await database.updateCharacter(owned.id, updates)
    this.characters = this.characters.map((c) => (c.id === owned.id ? { ...c, ...updates } : c))
  }

  // Delete a character (protagonist cannot be deleted)
  async deleteCharacter(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.characters.find((c) => c.id === id)
    if (!existing) throw new Error('Character not found')
    if (existing.relationship === 'self') {
      throw new Error('Swap protagonists before deleting the current one')
    }

    if (settings.experimentalFeatures.lightweightBranches) {
      // COD: tombstone instead of hard-deleting to preserve row for sibling/child branches
      if (existing.branchId === this.currentStory.currentBranchId) {
        // Entity is owned by current branch (or main) — mark deleted in place
        await database.markCharacterDeleted(id)
      } else {
        // Entity is inherited from another branch — create tombstone override
        const { entity: owned } = await this.cowCharacter(existing)
        await database.markCharacterDeleted(owned.id)
      }
    } else {
      await database.deleteCharacter(id)
    }
    this.characters = this.characters.filter((c) => c.id !== id)
  }

  // Add a location
  async addLocation(name: string, description?: string, makeCurrent = false): Promise<Location> {
    if (!this.currentStory) throw new Error('No story loaded')

    const location: Location = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      description: description ?? null,
      visited: makeCurrent,
      current: makeCurrent,
      connections: [],
      metadata: null,
      branchId: this.currentStory.currentBranchId,
    }

    await database.addLocation(location)

    if (makeCurrent) {
      // Update other locations to not be current
      this.locations = this.locations.map((l) => ({ ...l, current: false }))
    }

    this.locations = [...this.locations, location]
    return location
  }

  // Update a location's details
  async updateLocation(id: string, updates: Partial<Location>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.locations.find((l) => l.id === id)
    if (!existing) throw new Error('Location not found')

    // COW: ensure entity is owned by current branch before updating
    const { entity: owned } = await this.cowLocation(existing)

    if (updates.current === true) {
      if (this.isCowBranch()) {
        // COW-aware: targeted updates instead of blanket clear
        const prevCurrent = this.locations.find((l) => l.current && l.id !== owned.id)
        if (prevCurrent) {
          const { entity: ownedPrev } = await this.cowLocation(prevCurrent)
          await database.updateLocation(ownedPrev.id, { current: false })
          this.locations = this.locations.map((l) =>
            l.id === ownedPrev.id ? { ...l, current: false } : l,
          )
        }
        await database.updateLocation(owned.id, { ...updates, visited: true })
        this.locations = this.locations.map((l) =>
          l.id === owned.id ? { ...l, ...updates, current: true, visited: true } : l,
        )
      } else {
        await database.setCurrentLocation(this.currentStory.id, owned.id)
        this.locations = this.locations.map((l) => ({
          ...l,
          current: l.id === owned.id,
          visited: l.id === owned.id ? true : l.visited,
        }))
      }
    } else {
      await database.updateLocation(owned.id, updates)
      this.locations = this.locations.map((l) => (l.id === owned.id ? { ...l, ...updates } : l))
    }
  }

  // Set current location
  async setCurrentLocation(locationId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    if (this.isCowBranch()) {
      // COW-aware: targeted updates instead of blanket clear
      const target = this.locations.find((l) => l.id === locationId)
      const prevCurrent = this.locations.find((l) => l.current && l.id !== locationId)

      if (target) {
        const { entity: ownedTarget } = await this.cowLocation(target)
        await database.updateLocation(ownedTarget.id, { current: true, visited: true })
        this.locations = this.locations.map((l) =>
          l.id === ownedTarget.id ? { ...l, current: true, visited: true } : l,
        )
      }
      if (prevCurrent) {
        const { entity: ownedPrev } = await this.cowLocation(prevCurrent)
        await database.updateLocation(ownedPrev.id, { current: false })
        this.locations = this.locations.map((l) =>
          l.id === ownedPrev.id ? { ...l, current: false } : l,
        )
      }
    } else {
      await database.setCurrentLocation(this.currentStory.id, locationId)
      this.locations = this.locations.map((l) => ({
        ...l,
        current: l.id === locationId,
        visited: l.id === locationId ? true : l.visited,
      }))
    }
  }

  // Toggle location visited status
  async toggleLocationVisited(locationId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const location = this.locations.find((l) => l.id === locationId)
    if (!location) throw new Error('Location not found')

    const newVisited = !location.visited
    await database.updateLocation(locationId, { visited: newVisited })
    this.locations = this.locations.map((l) =>
      l.id === locationId ? { ...l, visited: newVisited } : l,
    )
    log('Location visited toggled:', location.name, newVisited)
  }

  // Delete a location
  async deleteLocation(locationId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const location = this.locations.find((l) => l.id === locationId)
    if (!location) throw new Error('Location not found')

    if (settings.experimentalFeatures.lightweightBranches) {
      if (location.branchId === this.currentStory.currentBranchId) {
        await database.markLocationDeleted(locationId)
      } else {
        const { entity: owned } = await this.cowLocation(location)
        await database.markLocationDeleted(owned.id)
      }
    } else {
      await database.deleteLocation(locationId)
    }
    this.locations = this.locations.filter((l) => l.id !== locationId)
    log('Location deleted:', location.name)
  }

  // Add an item to inventory
  async addItem(name: string, description?: string, quantity = 1): Promise<Item> {
    if (!this.currentStory) throw new Error('No story loaded')

    const item: Item = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      description: description ?? null,
      quantity,
      equipped: false,
      location: 'inventory',
      metadata: null,
      branchId: this.currentStory.currentBranchId,
    }

    await database.addItem(item)
    this.items = [...this.items, item]
    return item
  }

  // Update an existing item
  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.items.find((i) => i.id === id)
    if (!existing) throw new Error('Item not found')

    // COW: ensure entity is owned by current branch before updating
    const { entity: owned } = await this.cowItem(existing)
    await database.updateItem(owned.id, updates)
    this.items = this.items.map((i) => (i.id === owned.id ? { ...i, ...updates } : i))
  }

  // Delete an item
  async deleteItem(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.items.find((i) => i.id === id)
    if (!existing) throw new Error('Item not found')

    if (settings.experimentalFeatures.lightweightBranches) {
      if (existing.branchId === this.currentStory.currentBranchId) {
        await database.markItemDeleted(id)
      } else {
        const { entity: owned } = await this.cowItem(existing)
        await database.markItemDeleted(owned.id)
      }
    } else {
      await database.deleteItem(id)
    }
    this.items = this.items.filter((i) => i.id !== id)
  }

  // Add a story beat
  async addStoryBeat(
    title: string,
    type: StoryBeat['type'],
    description?: string,
  ): Promise<StoryBeat> {
    if (!this.currentStory) throw new Error('No story loaded')

    const beat: StoryBeat = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      title,
      description: description ?? null,
      type,
      status: 'pending',
      triggeredAt: null,
      resolvedAt: null,
      metadata: null,
      branchId: this.currentStory.currentBranchId,
    }

    await database.addStoryBeat(beat)
    this.storyBeats = [...this.storyBeats, beat]
    return beat
  }

  // Update a story beat
  async updateStoryBeat(id: string, updates: Partial<StoryBeat>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.storyBeats.find((b) => b.id === id)
    if (!existing) throw new Error('Story beat not found')

    const resolvedUpdates: Partial<StoryBeat> = { ...updates }
    if (updates.status) {
      if (updates.status === 'completed' || updates.status === 'failed') {
        if (updates.resolvedAt === undefined) {
          resolvedUpdates.resolvedAt = Date.now()
        }
      } else if (updates.resolvedAt === undefined) {
        resolvedUpdates.resolvedAt = null
      }
    }

    // COW: ensure entity is owned by current branch before updating
    const { entity: owned } = await this.cowStoryBeat(existing)
    await database.updateStoryBeat(owned.id, resolvedUpdates)
    this.storyBeats = this.storyBeats.map((b) =>
      b.id === owned.id ? { ...b, ...resolvedUpdates } : b,
    )
  }

  // Delete a story beat
  async deleteStoryBeat(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.storyBeats.find((b) => b.id === id)
    if (!existing) throw new Error('Story beat not found')

    if (settings.experimentalFeatures.lightweightBranches) {
      if (existing.branchId === this.currentStory.currentBranchId) {
        await database.markStoryBeatDeleted(id)
      } else {
        const { entity: owned } = await this.cowStoryBeat(existing)
        await database.markStoryBeatDeleted(owned.id)
      }
    } else {
      await database.deleteStoryBeat(id)
    }
    this.storyBeats = this.storyBeats.filter((b) => b.id !== id)
  }

  // Swap the protagonist to another character, updating the old label
  async setProtagonist(newCharacterId: string, previousRelationshipLabel?: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const currentProtagonist = this.characters.find((c) => c.relationship === 'self') ?? null
    const newProtagonist = this.characters.find((c) => c.id === newCharacterId)
    if (!newProtagonist) throw new Error('Character not found')

    if (currentProtagonist?.id === newCharacterId) return

    let label: string | null = null
    if (currentProtagonist) {
      label = previousRelationshipLabel?.trim() ?? null
      if (!label || label.toLowerCase() === 'self') {
        throw new Error('Provide a relationship label for the previous protagonist')
      }
      // COW: ensure old protagonist is owned by current branch
      const { entity: ownedOld } = await this.cowCharacter(currentProtagonist)
      await database.updateCharacter(ownedOld.id, { relationship: label })
    }

    // COW: ensure new protagonist is owned by current branch
    const { entity: ownedNew } = await this.cowCharacter(newProtagonist)
    await database.updateCharacter(ownedNew.id, { relationship: 'self' })

    this.characters = this.characters.map((c) => {
      if (
        currentProtagonist &&
        (c.overridesId === currentProtagonist.overridesId ||
          c.overridesId === currentProtagonist.id ||
          c.id === currentProtagonist.id)
      ) {
        // Find the current in-memory version that replaced the old protagonist
        if (c.relationship !== 'self') return c
        return { ...c, relationship: label! }
      }
      if (c.id === ownedNew.id) {
        return { ...c, relationship: 'self' }
      }
      return c
    })
  }

  // ===== Lorebook Entry CRUD Methods =====

  private invalidateRetrievalCache() {
    ui.setLastRetrievalResult(null)
  }

  /**
   * Add a new lorebook entry.
   * @param entryData - Entry data. branchId is optional and defaults to current branch.
   */
  async addLorebookEntry(
    entryData: Omit<Entry, 'id' | 'storyId' | 'createdAt' | 'updatedAt' | 'branchId'> & {
      branchId?: string | null
    },
  ): Promise<Entry> {
    if (!this.currentStory) throw new Error('No story loaded')

    const now = Date.now()
    const entry: Entry = {
      ...entryData,
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      createdAt: now,
      updatedAt: now,
      // Use provided branchId or default to current branch
      branchId: entryData.branchId ?? this.currentStory.currentBranchId,
    }

    await database.addEntry(entry)
    this.lorebookEntries = [...this.lorebookEntries, entry]
    this.invalidateRetrievalCache()
    log('Lorebook entry added:', entry.name)
    return entry
  }

  /**
   * Learn a (validated, generated) spell (RPG Phase 4, research/50 R6). Two
   * persistence surfaces: the spell becomes a `type:'spell'` lorebook Entry AND
   * its id is pushed into the protagonist's knownSpells. They must move together
   * — so a failure on the sheet write DELETES the just-created entry, leaving no
   * orphaned entry and no phantom knownSpell (the R6 rollback hazard). Direct
   * action like Rest / point-spend — not a narrative turn.
   */
  async learnSpell(gen: SpellGeneration): Promise<Entry> {
    if (!this.currentStory) throw new Error('No story loaded')
    const protagonist = this.characters.find((c) => c.relationship === 'self')
    if (!protagonist) throw new Error('No protagonist to learn the spell')
    // D-11: refuse before creating the entry — sheetOrDefault would silently
    // rebuild an unparseable stored sheet from defaults and persist it.
    if (isStoredRpgSheetInvalid(protagonist.metadata)) {
      throw new Error('RPG sheet data is invalid — spell not learned')
    }

    const entry = await this.addLorebookEntry(buildSpellEntryData(gen))
    try {
      const sheet = sheetOrDefault(protagonist.metadata)
      if (!sheet.knownSpells.includes(entry.id)) {
        const nextSheet = { ...sheet, knownSpells: [...sheet.knownSpells, entry.id] }
        await this.updateCharacter(protagonist.id, {
          metadata: writeRpgSheet(protagonist.metadata, nextSheet),
        })
      }
      log('Spell learned:', entry.name, entry.id)
      return entry
    } catch (err) {
      // Sheet write failed — remove the orphan entry so no phantom spell remains.
      // If the compensating delete ALSO fails, surface it: an orphaned spell
      // Entry (no knownSpells reference) is now in the lorebook and must be
      // cleaned up manually. The prompt layer tolerates it (stale ids are skipped).
      await this.deleteLorebookEntry(entry.id).catch((delErr) =>
        log('learnSpell: orphan cleanup FAILED, entry left in lorebook', {
          entryId: entry.id,
          delErr,
        }),
      )
      throw err
    }
  }

  async addLorebookEntries(
    entriesData: Omit<Entry, 'id' | 'storyId' | 'createdAt' | 'updatedAt' | 'branchId'>[],
  ): Promise<number> {
    if (!this.currentStory) throw new Error('No story loaded')
    if (entriesData.length === 0) return 0

    const now = Date.now()
    const branchId = this.currentStory.currentBranchId
    const storyId = this.currentStory.id
    const entries: Entry[] = entriesData.map((entryData) => ({
      ...entryData,
      id: crypto.randomUUID(),
      storyId,
      createdAt: now,
      updatedAt: now,
      branchId,
    }))

    await database.bulkInsertEntries(entries)
    this.lorebookEntries = [...this.lorebookEntries, ...entries]
    this.invalidateRetrievalCache()
    log('Lorebook entries bulk added:', entries.length)
    return entries.length
  }

  /**
   * Update a lorebook entry.
   */
  async updateLorebookEntry(id: string, updates: Partial<Entry>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const existing = this.lorebookEntries.find((e) => e.id === id)
    if (!existing) throw new Error('Lorebook entry not found')

    // COW: ensure entity is owned by current branch before updating
    const { entity: owned } = await this.cowLorebookEntry(existing)

    const updatesWithTimestamp = {
      ...updates,
      updatedAt: Date.now(),
    }

    await database.updateEntry(owned.id, updatesWithTimestamp)
    this.lorebookEntries = this.lorebookEntries.map((e) =>
      e.id === owned.id ? { ...e, ...updatesWithTimestamp } : e,
    )
    this.invalidateRetrievalCache()
    log('Lorebook entry updated:', owned.id)
  }

  /**
   * Delete a lorebook entry.
   */
  async deleteLorebookEntry(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    if (settings.experimentalFeatures.lightweightBranches) {
      const existing = this.lorebookEntries.find((e) => e.id === id)
      if (existing) {
        if (existing.branchId === this.currentStory.currentBranchId) {
          await database.markEntryDeleted(id)
        } else {
          const { entity: owned } = await this.cowLorebookEntry(existing)
          await database.markEntryDeleted(owned.id)
        }
      } else {
        await database.deleteEntry(id)
      }
    } else {
      await database.deleteEntry(id)
    }
    this.lorebookEntries = this.lorebookEntries.filter((e) => e.id !== id)
    this.invalidateRetrievalCache()
    log('Lorebook entry deleted:', id)
  }

  /**
   * Delete multiple lorebook entries (bulk operation).
   */
  async deleteLorebookEntries(ids: string[]): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    if (settings.experimentalFeatures.lightweightBranches) {
      // COD: process each entry individually for correct tombstone handling
      for (const id of ids) {
        const existing = this.lorebookEntries.find((e) => e.id === id)
        if (existing) {
          if (existing.branchId === this.currentStory.currentBranchId) {
            await database.markEntryDeleted(id)
          } else {
            const { entity: owned } = await this.cowLorebookEntry(existing)
            await database.markEntryDeleted(owned.id)
          }
        } else {
          await database.deleteEntry(id)
        }
      }
    } else {
      await Promise.all(ids.map((id) => database.deleteEntry(id)))
    }
    this.lorebookEntries = this.lorebookEntries.filter((e) => !ids.includes(e.id))
    this.invalidateRetrievalCache()
    log('Lorebook entries deleted:', ids.length)
  }

  /**
   * Get a single lorebook entry by ID.
   */
  getLorebookEntry(id: string): Entry | undefined {
    return this.lorebookEntries.find((e) => e.id === id)
  }

  /**
   * Helper to wrap entity updates in try-catch with toast notifications.
   * Prevents database errors from breaking the entire classification pipeline.
   */
  private classificationErrors = 0
  /**
   * True while applyClassificationResult runs inside the turn transaction.
   * Since D-4 BOTH turn paths (tracking on and tracking off) run inside
   * `runTurnTransaction`, so this is set for every turn write: a single
   * entity-write failure aborts the whole turn and the batch rolls back
   * (all-or-nothing). The 3-strike swallow below is therefore unreachable from
   * a turn; it is kept as the guard for any future non-turn wrapUpdate caller.
   */
  private transactionalTurn = false

  /**
   * Shared identity-hygiene work pool (D-13): ids queue here and at most
   * IDENTITY_HYGIENE_CONCURRENCY workers drain it, globally across turns.
   */
  private identityHygieneQueue: string[] = []
  private identityHygieneWorkers = 0

  private async wrapUpdate(label: string, entityName: string, fn: () => Promise<void>) {
    try {
      await fn()
      this.classificationErrors = 0
    } catch (err) {
      console.error(`[StoryStore] ${label} failed for ${entityName}:`, err)
      ui.showToast(`${label} failed: ${entityName}`, 'warning')
      // CR-1: inside a transactional turn the first failure aborts everything —
      // rethrow so the batch is discarded rather than committing a partial turn.
      if (this.transactionalTurn) throw err
      // Dead in practice since D-4 (every turn is transactional and no non-turn
      // caller exists today — audited 2026-08-20). Retained purely as a guard
      // should a non-transactional caller ever appear.
      this.classificationErrors++
      if (this.classificationErrors >= 3) {
        const count = this.classificationErrors
        this.classificationErrors = 0
        throw new Error(`Classification pipeline aborted after ${count} consecutive failures`)
      }
    }
  }

  /**
   * Run one turn's writes as a single all-or-nothing batch (CR-1, widened to the
   * tracking-off path by D-4).
   *
   * `runWrites` buffers every DB write (see database.beginWriteBatch);
   * `commitWriteBatch` flushes them in ONE real transaction on a dedicated single
   * connection (Rust exec_batch_tx). A throw — a logic error in runWrites, or a
   * failed flush that SQLite rolled back — leaves nothing persisted, and we revert
   * the in-memory arrays to their pre-turn snapshot. Immutable-update discipline
   * (every mutation reassigns this.x = this.x.map/.filter/[...], never in-place)
   * makes the captured references an exact revert matching the rolled-back DB.
   *
   * Returns true when the batch committed, false when the turn rolled back.
   */
  private async runTurnTransaction(runWrites: () => Promise<void>): Promise<boolean> {
    const snapshot = {
      currentStory: this.currentStory,
      characters: this.characters,
      locations: this.locations,
      items: this.items,
      storyBeats: this.storyBeats,
      entries: this.entries,
    }
    // Begin OUTSIDE the try (and before the flag): if a batch is already open —
    // a second turn entering while this one runs — the throw must propagate
    // untouched, because the catch below would abort the OTHER turn's batch and
    // revert this turn's snapshot against writes it never made. Retranslate it
    // first: the raw message surfaces verbatim in a story system entry.
    try {
      database.beginWriteBatch()
    } catch (error) {
      console.error('[StoryStore] beginWriteBatch refused — a turn is still saving:', error)
      throw new Error('Previous turn is still saving — wait a moment and retry', { cause: error })
    }
    this.transactionalTurn = true
    try {
      await runWrites()
      await database.commitWriteBatch()
    } catch (error) {
      database.abortWriteBatch()
      console.error('[StoryStore] Turn rolled back — no world-state changes applied:', error)
      this.currentStory = snapshot.currentStory
      this.characters = snapshot.characters
      this.locations = snapshot.locations
      this.items = snapshot.items
      this.storyBeats = snapshot.storyBeats
      this.entries = snapshot.entries
      ui.showToast('World changes could not be saved and were rolled back', 'error')
      return false
    } finally {
      this.transactionalTurn = false
    }
    return true
  }

  /**
   * Apply classification results to update world state.
   * This is Phase 4 of the processing pipeline per design doc.
   *
   * Returns whether the turn's world-state changes were durably persisted:
   * `{ applied: true }` on a committed turn (tracking on or off — both are
   * transactional since D-4), and
   * `{ applied: false, reason }` when the turn rolled back (CR-1) or was
   * skipped. The caller uses this to gate downstream work (image gen,
   * translation, and the whole post-turn tail) that assumes the world advanced,
   * and to tell the user which of the three endings happened (D-7).
   */
  async applyClassificationResult(
    result: ClassificationResult,
    entryId?: string,
    checkRecord: CheckRecord | null = null,
  ): Promise<ClassificationApplyOutcome> {
    if (!this.currentStory) {
      log('applyClassificationResult: No story loaded, skipping')
      return { applied: false, reason: 'no_story' }
    }

    // CR-1 replay guard: a delta already recorded for this entry means the turn
    // already committed (post-CR-1 the delta is written last, inside the turn
    // transaction — it exists iff every write landed). Re-running would overwrite
    // the good delta with a degraded one and double-apply stateful engine effects
    // (essence spend, body growth). With the turn now atomic there is never a
    // partial-persist to reconcile, so the safe replay semantics are: skip.
    if (entryId) {
      const existingDelta = this.entries.find((e) => e.id === entryId)?.worldStateDelta
      if (existingDelta) {
        log('applyClassificationResult: delta already exists for entry, skipping (replay guard)', {
          entryId,
        })
        return { applied: false, reason: 'replay' }
      }
    }

    log('applyClassificationResult called', {
      characterUpdates: result.entryUpdates.characterUpdates.length,
      locationUpdates: result.entryUpdates.locationUpdates.length,
      itemUpdates: result.entryUpdates.itemUpdates.length,
      storyBeatUpdates: result.entryUpdates.storyBeatUpdates.length,
      newCharacters: result.entryUpdates.newCharacters.length,
      newLocations: result.entryUpdates.newLocations.length,
      newItems: result.entryUpdates.newItems.length,
      newStoryBeats: result.entryUpdates.newStoryBeats.length,
      scene: result.scene,
    })

    const storyId = this.currentStory.id
    const trackingEnabled = settings.experimentalFeatures.stateTracking && !!entryId

    // Extract runtime variable definitions attached by ClassifierService (if any)
    const runtimeVarDefs: RuntimeVariable[] | undefined = result._runtimeVarDefs
    const defsByName = new Map<string, RuntimeVariable>(
      runtimeVarDefs?.map((d) => [d.variableName, d]) ?? [],
    )

    // Phase 1: Capture before-state for entities that will be modified
    const charactersBefore: CharacterBeforeState[] = []
    const locationsBefore: LocationBeforeState[] = []
    const itemsBefore: ItemBeforeState[] = []
    const storyBeatsBefore: StoryBeatBeforeState[] = []
    const createdCharacterIds: string[] = []
    const createdLocationIds: string[] = []
    const createdItemIds: string[] = []
    const createdStoryBeatIds: string[] = []
    // IDs of characters BRAND-NEW this turn (not COW clones). Drives deferred
    // creation-time identity hygiene (research/55 C); createdCharacterIds also
    // collects COW clones of existing characters, whose baseline must NOT be
    // rewritten, so the two lists are kept separate.
    const newlyCreatedCharacterIds: string[] = []
    let currentLocationIdBefore: string | null = null
    let timeTrackerBefore: TimeTracker | null = null

    if (trackingEnabled) {
      // Snapshot current location
      const currentLoc = this.locations.find((l) => l.current)
      currentLocationIdBefore = currentLoc?.id ?? null

      // Snapshot time tracker
      timeTrackerBefore = this.currentStory.timeTracker
        ? { ...this.currentStory.timeTracker }
        : null

      // Snapshot characters that will be updated
      for (const update of result.entryUpdates.characterUpdates) {
        const existing = this.characters.find(
          (c) => c.name.toLowerCase() === update.name.toLowerCase(),
        )
        if (existing) {
          charactersBefore.push({
            id: existing.id,
            name: existing.name,
            status: existing.status,
            relationship: existing.relationship,
            traits: [...existing.traits],
            visualDescriptors: { ...existing.visualDescriptors },
            currentVisualDescriptors: existing.currentVisualDescriptors
              ? { ...existing.currentVisualDescriptors }
              : null,
            metadata: existing.metadata ? { ...existing.metadata } : null,
          })
        }
      }

      // Snapshot locations that will be updated
      for (const update of result.entryUpdates.locationUpdates) {
        const existing = this.locations.find(
          (l) => l.name.toLowerCase() === update.name.toLowerCase(),
        )
        if (existing) {
          locationsBefore.push({
            id: existing.id,
            name: existing.name,
            visited: existing.visited,
            current: existing.current,
            description: existing.description,
            metadata: existing.metadata ? { ...existing.metadata } : null,
          })
        }
      }

      // Snapshot items that will be updated
      for (const update of result.entryUpdates.itemUpdates) {
        const existing = this.items.find((i) => i.name.toLowerCase() === update.name.toLowerCase())
        if (existing) {
          itemsBefore.push({
            id: existing.id,
            name: existing.name,
            quantity: existing.quantity,
            equipped: existing.equipped,
            location: existing.location,
            metadata: existing.metadata ? { ...existing.metadata } : null,
          })
        }
      }

      // Snapshot story beats that will be updated
      for (const update of result.entryUpdates.storyBeatUpdates) {
        const existing = this.storyBeats.find(
          (b) => b.title.toLowerCase() === update.title.toLowerCase(),
        )
        if (existing) {
          storyBeatsBefore.push({
            id: existing.id,
            title: existing.title,
            status: existing.status,
            description: existing.description,
            resolvedAt: existing.resolvedAt ?? null,
            metadata: existing.metadata ? { ...existing.metadata } : null,
          })
        }
      }

      // Also snapshot locations that might be affected by currentLocationName scene change
      if (result.scene.currentLocationName) {
        const locationName = result.scene.currentLocationName.toLowerCase()
        const loc = this.locations.find((l) => l.name.toLowerCase() === locationName)
        if (loc && !locationsBefore.some((lb) => lb.id === loc.id)) {
          locationsBefore.push({
            id: loc.id,
            name: loc.name,
            visited: loc.visited,
            current: loc.current,
            description: loc.description,
            metadata: loc.metadata ? { ...loc.metadata } : null,
          })
        }
      }
    }

    // beLog/checkLog live in method scope: runWrites assigns them and the
    // post-commit hasChanges block below reads them.
    let beLog: BeLogRecord[] = []
    let checkLog: CheckRecord[] = []

    // CR-1: the turn's entity/engine writes + the delta write are wrapped so
    // they commit all-or-nothing. Defined as a closure so it can run either
    // inside withTransaction (tracking on) or directly (legacy path).
    const runWrites = async (): Promise<void> => {
      if (!this.currentStory) return
      // Apply character updates
      for (const update of result.entryUpdates.characterUpdates) {
        await this.wrapUpdate('Update character', update.name, async () => {
          let existing = this.characters.find(
            (c) => c.name.toLowerCase() === update.name.toLowerCase(),
          )

          // If character doesn't exist yet, create it first
          if (!existing) {
            const newCharData = result.entryUpdates.newCharacters.find(
              (nc) => nc.name.toLowerCase() === update.name.toLowerCase(),
            )
            log('Creating character from update (not found):', update.name)
            const charMetadata: Record<string, unknown> = { source: 'classifier' }
            if (newCharData) {
              const newCharInlineVars = extractInlineCustomVars(
                newCharData as unknown as Record<string, unknown>,
                defsByName,
              )
              if (Object.keys(newCharInlineVars).length > 0) {
                Object.assign(charMetadata, mergeRuntimeVars(null, newCharInlineVars, defsByName))
              }
            }
            const character: Character = {
              id: crypto.randomUUID(),
              storyId,
              name: newCharData?.name ?? update.name,
              description: newCharData?.description ?? null,
              relationship: newCharData?.relationship ?? null,
              traits: newCharData?.traits ?? [],
              visualDescriptors: newCharData?.visualDescriptors ?? {},
              status: (newCharData?.status as Character['status']) ?? 'active',
              metadata: charMetadata,
              portrait: null,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addCharacter(character)
            this.characters = [...this.characters, character]
            if (trackingEnabled) createdCharacterIds.push(character.id)
            newlyCreatedCharacterIds.push(character.id)
            existing = character
          }

          if (existing) {
            log('Updating character:', update.name, update.changes)
            const changes: Partial<Character> = {}
            if (update.changes.status) changes.status = update.changes.status
            if (update.changes.relationship) {
              if (existing.relationship === 'self') {
                // Preserve protagonist relationship; only set via explicit swap.
              } else if (update.changes.relationship !== 'self') {
                changes.relationship = update.changes.relationship
              }
            }
            if (update.changes.newTraits?.length || update.changes.removeTraits?.length) {
              let traits = [...existing.traits]
              if (update.changes.removeTraits?.length) {
                const toRemove = new Set(update.changes.removeTraits.map((t) => t.toLowerCase()))
                traits = traits.filter((t) => !toRemove.has(t.toLowerCase()))
              }
              if (update.changes.newTraits?.length) {
                traits = [...traits, ...update.changes.newTraits]
              }
              const traitMap = new Map(traits.map((t) => [t.toLowerCase(), t]))
              changes.traits = Array.from(traitMap.values())
            }
            // Visual descriptor updates land on the story-tracked CURRENT look —
            // never the canonical baseline (Ben's two-layer ruling 2026-07-19).
            // The classifier proposes transient scene state ("hair spread across
            // soaked linens", scene clothing, size prose); writing it over the
            // baseline destroyed the identity that portraits/anchors/sprites
            // render from and thrashed the sprite appearance hash. The baseline
            // is user-owned; "Adopt as baseline" in the panel promotes tracked
            // changes deliberately.
            if (
              update.changes.visualDescriptors &&
              Object.keys(update.changes.visualDescriptors).length > 0
            ) {
              changes.currentVisualDescriptors = update.changes.visualDescriptors
            }
            // Merge inline runtime variable values into metadata if present
            const charInlineVars = extractInlineCustomVars(
              update.changes as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(charInlineVars).length > 0) {
              changes.metadata = mergeRuntimeVars(existing.metadata, charInlineVars, defsByName)
            }
            // COW: ensure entity is owned by current branch before updating
            const { entity: ownedChar, wasCowed: charWasCowed } = await this.cowCharacter(existing)
            await database.updateCharacter(ownedChar.id, changes)
            this.characters = this.characters.map((c) =>
              c.id === ownedChar.id ? { ...c, ...changes } : c,
            )
            // If COW'd, track override as created (rollback = delete override)
            if (charWasCowed && trackingEnabled) {
              createdCharacterIds.push(ownedChar.id)
              const idx = charactersBefore.findIndex((cb) => cb.id === existing.id)
              if (idx !== -1) charactersBefore.splice(idx, 1)
            }
          }
        })
      }

      // Apply location updates
      for (const update of result.entryUpdates.locationUpdates) {
        await this.wrapUpdate('Update location', update.name, async () => {
          let existing = this.locations.find(
            (l) => l.name.toLowerCase() === update.name.toLowerCase(),
          )

          // If location doesn't exist yet, create it first
          if (!existing) {
            // Check if newLocations has data for this name
            const newLocData = result.entryUpdates.newLocations.find(
              (nl) => nl.name.toLowerCase() === update.name.toLowerCase(),
            )
            log('Creating location from update (not found):', update.name)
            const locMetadata: Record<string, unknown> = { source: 'classifier' }
            if (newLocData) {
              const newLocInlineVars = extractInlineCustomVars(
                newLocData as unknown as Record<string, unknown>,
                defsByName,
              )
              if (Object.keys(newLocInlineVars).length > 0) {
                Object.assign(locMetadata, mergeRuntimeVars(null, newLocInlineVars, defsByName))
              }
            }
            const location: Location = {
              id: crypto.randomUUID(),
              storyId,
              name: newLocData?.name ?? update.name,
              description: newLocData?.description ?? null,
              visited: newLocData?.visited ?? false,
              current: newLocData?.current ?? false,
              connections: [],
              metadata: locMetadata,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addLocation(location)
            this.locations = [...this.locations, location]
            if (trackingEnabled) createdLocationIds.push(location.id)
            existing = location
          }

          if (existing) {
            log('Updating location:', update.name, update.changes)
            const changes: Partial<Location> = {}
            if (update.changes.visited !== undefined) changes.visited = update.changes.visited
            if (update.changes.description) {
              changes.description = update.changes.description
            }
            if (update.changes.descriptionAddition) {
              const addition = update.changes.descriptionAddition.trim()
              if (addition) {
                changes.description =
                  (changes.description ?? existing.description)
                    ? `${changes.description ?? existing.description} ${addition}`
                    : addition
              }
            }
            // Merge inline runtime variable values into metadata if present
            const locInlineVars = extractInlineCustomVars(
              update.changes as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(locInlineVars).length > 0) {
              changes.metadata = mergeRuntimeVars(existing.metadata, locInlineVars, defsByName)
            }

            // COW: ensure entity is owned by current branch before updating
            const { entity: ownedLoc, wasCowed: locWasCowed } = await this.cowLocation(existing)

            if (update.changes.current === true) {
              changes.visited = true
              if (this.isCowBranch()) {
                // COW-aware: targeted updates instead of blanket clear
                const prevCurrent = this.locations.find((l) => l.current && l.id !== ownedLoc.id)
                if (prevCurrent) {
                  const { entity: ownedPrev, wasCowed: prevWasCowed } =
                    await this.cowLocation(prevCurrent)
                  await database.updateLocation(ownedPrev.id, { current: false })
                  this.locations = this.locations.map((l) =>
                    l.id === ownedPrev.id ? { ...l, current: false } : l,
                  )
                  if (prevWasCowed && trackingEnabled) {
                    createdLocationIds.push(ownedPrev.id)
                    const prevIdx = locationsBefore.findIndex((lb) => lb.id === prevCurrent.id)
                    if (prevIdx !== -1) locationsBefore.splice(prevIdx, 1)
                  }
                }
                await database.updateLocation(ownedLoc.id, { ...changes, current: true })
                this.locations = this.locations.map((l) =>
                  l.id === ownedLoc.id ? { ...l, ...changes, current: true, visited: true } : l,
                )
              } else {
                await database.setCurrentLocation(storyId, ownedLoc.id)
                if (Object.keys(changes).length > 0) {
                  await database.updateLocation(ownedLoc.id, changes)
                }
                this.locations = this.locations.map((l) => {
                  if (l.id === ownedLoc.id) {
                    return { ...l, ...changes, current: true, visited: true }
                  }
                  return { ...l, current: false }
                })
              }
              if (locWasCowed && trackingEnabled) {
                createdLocationIds.push(ownedLoc.id)
                const idx = locationsBefore.findIndex((lb) => lb.id === existing.id)
                if (idx !== -1) locationsBefore.splice(idx, 1)
              }
              return
            }

            if (update.changes.current === false) changes.current = false
            if (Object.keys(changes).length === 0) {
              // Even if no changes, track COW if it happened
              if (locWasCowed && trackingEnabled) {
                createdLocationIds.push(ownedLoc.id)
                const idx = locationsBefore.findIndex((lb) => lb.id === existing.id)
                if (idx !== -1) locationsBefore.splice(idx, 1)
              }
              return
            }
            await database.updateLocation(ownedLoc.id, changes)
            this.locations = this.locations.map((l) =>
              l.id === ownedLoc.id ? { ...l, ...changes } : l,
            )
            if (locWasCowed && trackingEnabled) {
              createdLocationIds.push(ownedLoc.id)
              const idx = locationsBefore.findIndex((lb) => lb.id === existing.id)
              if (idx !== -1) locationsBefore.splice(idx, 1)
            }
          }
        })
      }

      // Apply item updates
      for (const update of result.entryUpdates.itemUpdates) {
        await this.wrapUpdate('Update item', update.name, async () => {
          let existing = this.items.find((i) => i.name.toLowerCase() === update.name.toLowerCase())

          // If item doesn't exist yet, create it first
          if (!existing) {
            const newItemData = result.entryUpdates.newItems.find(
              (ni) => ni.name.toLowerCase() === update.name.toLowerCase(),
            )
            log('Creating item from update (not found):', update.name)
            const itemMetadata: Record<string, unknown> = { source: 'classifier' }
            if (newItemData) {
              const newItemInlineVars = extractInlineCustomVars(
                newItemData as unknown as Record<string, unknown>,
                defsByName,
              )
              if (Object.keys(newItemInlineVars).length > 0) {
                Object.assign(itemMetadata, mergeRuntimeVars(null, newItemInlineVars, defsByName))
              }
            }
            const item: Item = {
              id: crypto.randomUUID(),
              storyId,
              name: newItemData?.name ?? update.name,
              description: newItemData?.description ?? null,
              quantity: newItemData?.quantity ?? 1,
              equipped: false,
              location: newItemData?.location ?? 'inventory',
              metadata: itemMetadata,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addItem(item)
            this.items = [...this.items, item]
            if (trackingEnabled) createdItemIds.push(item.id)
            existing = item
          }

          if (existing) {
            log('Updating item:', update.name, update.changes)
            const changes: Partial<Item> = {}
            if (update.changes.quantity !== undefined) changes.quantity = update.changes.quantity
            if (update.changes.equipped !== undefined) changes.equipped = update.changes.equipped
            if (update.changes.location) changes.location = update.changes.location
            // Merge inline runtime variable values into metadata if present
            const itemInlineVars = extractInlineCustomVars(
              update.changes as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(itemInlineVars).length > 0) {
              changes.metadata = mergeRuntimeVars(existing.metadata, itemInlineVars, defsByName)
            }
            // COW: ensure entity is owned by current branch before updating
            const { entity: ownedItem, wasCowed: itemWasCowed } = await this.cowItem(existing)
            await database.updateItem(ownedItem.id, changes)
            this.items = this.items.map((i) => (i.id === ownedItem.id ? { ...i, ...changes } : i))
            if (itemWasCowed && trackingEnabled) {
              createdItemIds.push(ownedItem.id)
              const idx = itemsBefore.findIndex((ib) => ib.id === existing.id)
              if (idx !== -1) itemsBefore.splice(idx, 1)
            }
          }
        })
      }

      // Apply story beat updates (mark as completed/failed)
      for (const update of result.entryUpdates.storyBeatUpdates) {
        await this.wrapUpdate('Update story beat', update.title, async () => {
          let existing = this.storyBeats.find(
            (b) => b.title.toLowerCase() === update.title.toLowerCase(),
          )

          // If story beat doesn't exist yet, create it first
          if (!existing) {
            const newBeatData = result.entryUpdates.newStoryBeats.find(
              (nb) => nb.title.toLowerCase() === update.title.toLowerCase(),
            )
            log('Creating story beat from update (not found):', update.title)
            const beatMetadata: Record<string, unknown> = { source: 'classifier' }
            if (newBeatData) {
              const newBeatInlineVars = extractInlineCustomVars(
                newBeatData as unknown as Record<string, unknown>,
                defsByName,
              )
              if (Object.keys(newBeatInlineVars).length > 0) {
                Object.assign(beatMetadata, mergeRuntimeVars(null, newBeatInlineVars, defsByName))
              }
            }
            const beat: StoryBeat = {
              id: crypto.randomUUID(),
              storyId,
              title: newBeatData?.title ?? update.title,
              description: newBeatData?.description ?? null,
              type: newBeatData?.type ?? 'event',
              status: newBeatData?.status ?? 'active',
              triggeredAt: Date.now(),
              metadata: beatMetadata,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addStoryBeat(beat)
            this.storyBeats = [...this.storyBeats, beat]
            if (trackingEnabled) createdStoryBeatIds.push(beat.id)
            existing = beat
          }

          if (existing) {
            log('Updating story beat:', update.title, update.changes)
            const changes: Partial<StoryBeat> = {}
            if (update.changes.status) {
              changes.status = update.changes.status
              // Set resolvedAt timestamp when completing or failing
              if (update.changes.status === 'completed' || update.changes.status === 'failed') {
                changes.resolvedAt = Date.now()
              }
            }
            if (update.changes.description) changes.description = update.changes.description
            // Merge inline runtime variable values into metadata if present
            const beatInlineVars = extractInlineCustomVars(
              update.changes as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(beatInlineVars).length > 0) {
              changes.metadata = mergeRuntimeVars(existing.metadata, beatInlineVars, defsByName)
            }
            // COW: ensure entity is owned by current branch before updating
            const { entity: ownedBeat, wasCowed: beatWasCowed } = await this.cowStoryBeat(existing)
            await database.updateStoryBeat(ownedBeat.id, changes)
            this.storyBeats = this.storyBeats.map((b) =>
              b.id === ownedBeat.id ? { ...b, ...changes } : b,
            )
            if (beatWasCowed && trackingEnabled) {
              createdStoryBeatIds.push(ownedBeat.id)
              const idx = storyBeatsBefore.findIndex((sb) => sb.id === existing.id)
              if (idx !== -1) storyBeatsBefore.splice(idx, 1)
            }
          }
        })
      }

      // Add new characters (check for duplicates)
      for (const newChar of result.entryUpdates.newCharacters) {
        await this.wrapUpdate('Add character', newChar.name, async () => {
          const exists = this.characters.some(
            (c) => c.name.toLowerCase() === newChar.name.toLowerCase(),
          )
          if (!exists) {
            log('Adding new character:', newChar.name)
            const charMetadata: Record<string, unknown> = { source: 'classifier' }
            const newCharInlineVars = extractInlineCustomVars(
              newChar as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(newCharInlineVars).length > 0) {
              Object.assign(charMetadata, mergeRuntimeVars(null, newCharInlineVars, defsByName))
            }
            const character: Character = {
              id: crypto.randomUUID(),
              storyId,
              name: newChar.name,
              description: newChar.description ?? null,
              relationship: newChar.relationship ?? null,
              traits: newChar.traits ?? [],
              visualDescriptors: newChar.visualDescriptors ?? {},
              status: 'active',
              metadata: charMetadata,
              portrait: null,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addCharacter(character)
            this.characters = [...this.characters, character]
            if (trackingEnabled) createdCharacterIds.push(character.id)
            newlyCreatedCharacterIds.push(character.id)
          }
        })
      }

      // Handle scene.currentLocationName - update current location if specified
      // Runs before newLocations so stubs are available for merging
      if (result.scene.currentLocationName) {
        await this.wrapUpdate('Set scene location', result.scene.currentLocationName, async () => {
          const locationName = result.scene.currentLocationName!.toLowerCase()
          let currentLoc = this.locations.find((l) => l.name.toLowerCase() === locationName)

          // If location doesn't exist yet, create a stub
          if (!currentLoc) {
            log(
              'Creating stub location from scene.currentLocationName:',
              result.scene.currentLocationName,
            )
            const stubLocation: Location = {
              id: crypto.randomUUID(),
              storyId,
              name: result.scene.currentLocationName!,
              description: null,
              visited: true,
              current: false,
              connections: [],
              metadata: { source: 'classifier' },
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addLocation(stubLocation)
            this.locations = [...this.locations, stubLocation]
            if (trackingEnabled) createdLocationIds.push(stubLocation.id)
            currentLoc = stubLocation
          }

          if (currentLoc && !currentLoc.current) {
            log('Setting current location from scene:', currentLoc.name)
            if (this.isCowBranch()) {
              // COW-aware: targeted updates
              const { entity: ownedTarget, wasCowed: targetWasCowed } =
                await this.cowLocation(currentLoc)
              const prevCurrent = this.locations.find((l) => l.current && l.id !== ownedTarget.id)
              if (prevCurrent) {
                const { entity: ownedPrev, wasCowed: prevWasCowed } =
                  await this.cowLocation(prevCurrent)
                await database.updateLocation(ownedPrev.id, { current: false })
                this.locations = this.locations.map((l) =>
                  l.id === ownedPrev.id ? { ...l, current: false } : l,
                )
                if (prevWasCowed && trackingEnabled) {
                  createdLocationIds.push(ownedPrev.id)
                  const idx = locationsBefore.findIndex((lb) => lb.id === prevCurrent.id)
                  if (idx !== -1) locationsBefore.splice(idx, 1)
                }
              }
              await database.updateLocation(ownedTarget.id, { current: true, visited: true })
              this.locations = this.locations.map((l) =>
                l.id === ownedTarget.id ? { ...l, current: true, visited: true } : l,
              )
              if (targetWasCowed && trackingEnabled) {
                createdLocationIds.push(ownedTarget.id)
                const idx = locationsBefore.findIndex((lb) => lb.id === currentLoc!.id)
                if (idx !== -1) locationsBefore.splice(idx, 1)
              }
            } else {
              await database.setCurrentLocation(storyId, currentLoc.id)
              this.locations = this.locations.map((l) => ({
                ...l,
                current: l.id === currentLoc!.id,
                visited: l.id === currentLoc!.id ? true : l.visited,
              }))
            }
          }
        })
      }

      // Add new locations (check for duplicates, merge into recently created)
      for (const newLoc of result.entryUpdates.newLocations) {
        await this.wrapUpdate('Add location', newLoc.name, async () => {
          const existing = this.locations.find(
            (l) => l.name.toLowerCase() === newLoc.name.toLowerCase(),
          )
          if (existing && createdLocationIds.includes(existing.id)) {
            // Merge into location created earlier in this classification run
            // (e.g. stub from scene.currentLocationName or from update handler)
            log('Merging new location into recently created:', newLoc.name)
            const changes: Partial<Location> = {}
            if (newLoc.description && !existing.description) {
              changes.description = newLoc.description
            }
            if (newLoc.visited !== undefined && newLoc.visited !== existing.visited) {
              changes.visited = newLoc.visited
            }
            if (newLoc.current && !existing.current) {
              changes.current = true
              changes.visited = true
            }
            // Merge inline runtime variable values into metadata if present
            const newLocInlineVars = extractInlineCustomVars(
              newLoc as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(newLocInlineVars).length > 0) {
              changes.metadata = mergeRuntimeVars(existing.metadata, newLocInlineVars, defsByName)
            }
            if (Object.keys(changes).length > 0) {
              await database.updateLocation(existing.id, changes)
              this.locations = this.locations.map((l) =>
                l.id === existing.id ? { ...l, ...changes } : l,
              )
            }
          } else if (!existing) {
            log('Adding new location:', newLoc.name)
            // If this is the current location, unset others first
            if (newLoc.current) {
              if (this.isCowBranch()) {
                // COW-aware: targeted unset of previous current
                const prevCurrent = this.locations.find((l) => l.current)
                if (prevCurrent) {
                  const { entity: ownedPrev } = await this.cowLocation(prevCurrent)
                  await database.updateLocation(ownedPrev.id, { current: false })
                  this.locations = this.locations.map((l) =>
                    l.id === ownedPrev.id ? { ...l, current: false } : l,
                  )
                }
              } else {
                this.locations = this.locations.map((l) => ({ ...l, current: false }))
                for (const l of this.locations) {
                  await database.updateLocation(l.id, { current: false })
                }
              }
            }
            const locMetadata: Record<string, unknown> = { source: 'classifier' }
            const newLocInlineVars = extractInlineCustomVars(
              newLoc as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(newLocInlineVars).length > 0) {
              Object.assign(locMetadata, mergeRuntimeVars(null, newLocInlineVars, defsByName))
            }
            const location: Location = {
              id: crypto.randomUUID(),
              storyId,
              name: newLoc.name,
              description: newLoc.description ?? null,
              visited: newLoc.visited ?? false,
              current: newLoc.current ?? false,
              connections: [],
              metadata: locMetadata,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addLocation(location)
            this.locations = [...this.locations, location]
            if (trackingEnabled) createdLocationIds.push(location.id)
          }
        })
      }

      // Add new items (check for duplicates)
      for (const newItem of result.entryUpdates.newItems) {
        await this.wrapUpdate('Add item', newItem.name, async () => {
          const exists = this.items.some((i) => i.name.toLowerCase() === newItem.name.toLowerCase())
          if (!exists) {
            log('Adding new item:', newItem.name)
            const itemMetadata: Record<string, unknown> = { source: 'classifier' }
            const newItemInlineVars = extractInlineCustomVars(
              newItem as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(newItemInlineVars).length > 0) {
              Object.assign(itemMetadata, mergeRuntimeVars(null, newItemInlineVars, defsByName))
            }
            const item: Item = {
              id: crypto.randomUUID(),
              storyId,
              name: newItem.name,
              description: newItem.description ?? null,
              quantity: newItem.quantity ?? 1,
              equipped: false,
              location: newItem.location ?? 'inventory',
              metadata: itemMetadata,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addItem(item)
            this.items = [...this.items, item]
            if (trackingEnabled) createdItemIds.push(item.id)
          }
        })
      }

      // Add new story beats (check for duplicates)
      for (const newBeat of result.entryUpdates.newStoryBeats) {
        await this.wrapUpdate('Add story beat', newBeat.title, async () => {
          const exists = this.storyBeats.some(
            (b) => b.title.toLowerCase() === newBeat.title.toLowerCase(),
          )
          if (!exists) {
            log('Adding new story beat:', newBeat.title)
            const beatMetadata: Record<string, unknown> = { source: 'classifier' }
            const newBeatInlineVars = extractInlineCustomVars(
              newBeat as unknown as Record<string, unknown>,
              defsByName,
            )
            if (Object.keys(newBeatInlineVars).length > 0) {
              Object.assign(beatMetadata, mergeRuntimeVars(null, newBeatInlineVars, defsByName))
            }
            const beat: StoryBeat = {
              id: crypto.randomUUID(),
              storyId,
              title: newBeat.title,
              description: newBeat.description ?? null,
              type: newBeat.type ?? 'event',
              status: newBeat.status ?? 'active',
              triggeredAt: Date.now(),
              metadata: beatMetadata,
              branchId: this.currentStory?.currentBranchId ?? null,
            }
            await database.addStoryBeat(beat)
            this.storyBeats = [...this.storyBeats, beat]
            if (trackingEnabled) createdStoryBeatIds.push(beat.id)
          }
        })
      }

      // Apply time progression from scene data
      if (result.scene.timeProgression && result.scene.timeProgression !== 'none') {
        await this.applyTimeProgression(result.scene.timeProgression)
      }

      // BE engine (Phase A): deterministic body-state reduction. Runs after every
      // entity loop and BEFORE the delta is built/saved so its writes are
      // rollback-visible (research/31 §2.2). beLog/checkLog are declared in the
      // method scope above so hasChanges can still read them after the transaction.
      if (this.currentStory.settings?.beMode === true) {
        // Growth-intent target resolution happens ONCE, here, before either
        // consumer: an untargeted growth check whose subject is unambiguous gets
        // her filled in, so the reducer, the sheet apply and the persisted
        // checkLog all agree on who this action was aimed at.
        const resolvedCheck = this.withInferredGrowthTarget(checkRecord, result)
        const beResult = await this.applyBeEvents(
          result,
          entryId,
          trackingEnabled,
          charactersBefore,
          createdCharacterIds,
          // Read-only here (milk quality, research/49 R8) — applyRpgTurn stays the
          // single writer of the check's effects.
          resolvedCheck,
          itemsBefore,
          createdItemIds,
        )
        beLog = beResult.beLog
        // RPG layer: protagonist sheet apply (essence/regen/leveling/drift) —
        // after the girls' reducer, before the delta, same rollback contract.
        checkLog = await this.applyRpgTurn(
          resolvedCheck,
          entryId,
          trackingEnabled,
          charactersBefore,
          createdCharacterIds,
          timeTrackerBefore,
          beResult.crossings,
        )
      }

      // Phase 1: Save world state delta on the entry. CR-1: this is the LAST write
      // inside the turn transaction — no local try/catch, so a failure here
      // propagates and rolls the whole turn back (no half-applied, un-rollbackable
      // state). maybeCreateAutoSnapshot moved out to run only after a durable commit.
      if (trackingEnabled && entryId) {
        const delta: WorldStateDelta = {
          classificationResult: result as unknown as Record<string, unknown>,
          previousState: {
            characters: charactersBefore,
            locations: locationsBefore,
            items: itemsBefore,
            storyBeats: storyBeatsBefore,
            currentLocationId: currentLocationIdBefore,
            timeTracker: timeTrackerBefore,
          },
          createdEntities: {
            characterIds: createdCharacterIds,
            locationIds: createdLocationIds,
            itemIds: createdItemIds,
            storyBeatIds: createdStoryBeatIds,
          },
          ...(beLog.length > 0 ? { beLog } : {}),
          ...(checkLog.length > 0 ? { checkLog } : {}),
        }

        await database.updateStoryEntry(entryId, { worldStateDelta: delta })
        // Update in-memory entry
        this.entries = this.entries.map((e) =>
          e.id === entryId ? { ...e, worldStateDelta: delta } : e,
        )

        log('World state delta saved for entry', {
          entryId,
          updatedCharacters: charactersBefore.length,
          updatedLocations: locationsBefore.length,
          updatedItems: itemsBefore.length,
          updatedStoryBeats: storyBeatsBefore.length,
          createdCharacters: createdCharacterIds.length,
          createdLocations: createdLocationIds.length,
          createdItems: createdItemIds.length,
          createdStoryBeats: createdStoryBeatIds.length,
        })
      }
    }

    // D-4: BOTH paths run the turn's writes as one all-or-nothing batch. Tracking
    // off used to run them bare and best-effort (wrapUpdate swallowing failures,
    // no atomicity) even though the BE/RPG engine writes through the same closure
    // whenever beMode is on. The only remaining differences are delta-side: the
    // delta write inside runWrites is already gated on `trackingEnabled` (nothing
    // to write with tracking off), the replay guard above keys on entryId/delta,
    // and the auto-snapshot only makes sense for a tracked turn.
    const committed = await this.runTurnTransaction(runWrites)
    if (!committed) return { applied: false, reason: 'rolled_back' }
    if (trackingEnabled && entryId) {
      // Auto-snapshot only after the turn durably committed.
      await this.maybeCreateAutoSnapshot(entryId)
    }

    log('applyClassificationResult complete', {
      characters: this.characters.length,
      locations: this.locations.length,
      items: this.items.length,
      storyBeats: this.storyBeats.length,
    })

    // Emit state updated event if there were any changes
    const hasChanges =
      beLog.length > 0 ||
      checkLog.length > 0 ||
      result.entryUpdates.newCharacters.length > 0 ||
      result.entryUpdates.newLocations.length > 0 ||
      result.entryUpdates.newItems.length > 0 ||
      result.entryUpdates.newStoryBeats.length > 0 ||
      result.entryUpdates.characterUpdates.length > 0 ||
      result.entryUpdates.locationUpdates.length > 0 ||
      result.entryUpdates.itemUpdates.length > 0 ||
      result.entryUpdates.storyBeatUpdates.length > 0

    if (hasChanges) {
      emitStateUpdated({
        characters:
          result.entryUpdates.newCharacters.length + result.entryUpdates.characterUpdates.length,
        locations:
          result.entryUpdates.newLocations.length + result.entryUpdates.locationUpdates.length,
        items: result.entryUpdates.newItems.length + result.entryUpdates.itemUpdates.length,
        storyBeats:
          result.entryUpdates.newStoryBeats.length + result.entryUpdates.storyBeatUpdates.length,
      })
    }

    // Creation-time identity hygiene (research/55 C). Deferred + best-effort:
    // fired AFTER the turn durably committed (a rolled-back turn returns false
    // above and never reaches here) and NOT awaited, so the extra LLM extraction
    // never adds latency to the turn or narration. Runs only for brand-new
    // characters (never updates); each call swallows its own errors.
    // D-13: the hygiene output (imageTags bank + cleaned descriptors) feeds
    // EVERY image surface — inline/agentic scenes AND the beMode sprite/portrait
    // paths, which render regardless of imageGenerationMode. Skip only when
    // nothing consumes it: images off AND beMode off. Unset mode defaults to
    // 'agentic' to match the generation pipeline's own default, and currentStory
    // is re-read optionally — the user can close the story during the awaits
    // above. The rest run through a small concurrency cap so a crowd scene does
    // not fire N LLM calls at once.
    const settingsNow = this.currentStory?.settings
    const nothingConsumesHygiene =
      (settingsNow?.imageGenerationMode ?? 'agentic') === 'none' && !settingsNow?.beMode
    if (!nothingConsumesHygiene) {
      this.runIdentityHygieneBatch(newlyCreatedCharacterIds)
    }

    return { applied: true }
  }

  /**
   * Fire-and-forget the turn's identity-hygiene calls with a concurrency cap
   * (D-13). Returns synchronously — the turn never waits on the chain — while a
   * crowd scene's N new characters drain through at most
   * IDENTITY_HYGIENE_CONCURRENCY LLM extractions at a time. Per-call error
   * semantics are unchanged: each rejection is warned about and the queue
   * continues.
   */
  private runIdentityHygieneBatch(characterIds: string[]): void {
    if (characterIds.length === 0) return
    // The queue and worker count are INSTANCE state so the cap is global, not
    // per-turn — overlapping turns (or a turn plus a retry) share one pool
    // instead of each spawning their own.
    this.identityHygieneQueue.push(...characterIds)

    const worker = async (): Promise<void> => {
      try {
        for (;;) {
          const characterId = this.identityHygieneQueue.shift()
          if (characterId === undefined) return
          // Contractually never-throws, but an unhandled rejection here would be
          // invisible — keep a guard so a contract break shows up as a warning.
          await this.runIdentityHygiene(characterId).catch((error) =>
            console.warn('[StoryStore] Identity hygiene failed:', error),
          )
        }
      } finally {
        this.identityHygieneWorkers--
      }
    }

    while (
      this.identityHygieneWorkers < IDENTITY_HYGIENE_CONCURRENCY &&
      this.identityHygieneWorkers < this.identityHygieneQueue.length
    ) {
      this.identityHygieneWorkers++
      void worker()
    }
  }

  /**
   * Deferred, best-effort creation-time identity hygiene for one freshly-created
   * character (research/55 C). Re-resolves the character from the live store (it
   * may have been updated — or COW-remapped — later in the same turn), then runs
   * the extraction + hygiene split, persisting through the COW-safe update path.
   * Fire-and-forget: never awaited in the turn, never throws.
   */
  private async runIdentityHygiene(characterId: string): Promise<void> {
    // Resolve the live character by id, with the COW override fallback. Passed as
    // a thunk so applyIdentityHygiene can re-resolve AFTER the LLM extraction (FIX
    // 3) — the character may have been updated or COW-remapped during the call.
    const resolve = () =>
      this.characters.find((c) => c.id === characterId) ??
      this.characters.find((c) => c.overridesId === characterId)
    const character = resolve()
    if (!character) return
    await applyIdentityHygiene(character, resolve, (id, updates) =>
      this.persistIdentityHygiene(id, updates),
    )
  }

  /**
   * Persist one identity-hygiene patch: immutable in-memory update plus a DIRECT
   * database write. Deliberately NOT `this.updateCharacter` — hygiene fires after
   * its own turn commits, so by the time the LLM extraction returns the NEXT
   * turn's write batch may be open, and going through the buffered path would
   * sweep this write into that unrelated transaction (CR-1 invariant).
   *
   * Two guards replace the COW step the buffered path used to provide. A missing
   * id means the store moved on (story switched mid-extraction) and the caller's
   * snapshot is stale — throw rather than write a phantom row;
   * `applyIdentityHygiene` catches. A character that a COW would have to clone
   * (same test as `cowCharacter`: it belongs to a different branch than the one
   * now current) is skipped rather than cloned — the clone routes through the
   * buffered write path, and hygiene is one-shot best-effort, so silently
   * updating a parent branch's row is the only outcome we must avoid.
   */
  private async persistIdentityHygiene(id: string, updates: Partial<Character>): Promise<void> {
    const existing = this.characters.find((c) => c.id === id)
    if (!existing) throw new Error(`Character not found: ${id}`)

    const branchId = this.currentStory?.currentBranchId
    if (
      branchId &&
      existing.branchId !== branchId &&
      settings.experimentalFeatures.lightweightBranches
    ) {
      log('Identity hygiene skipped — character belongs to another branch', id, existing.branchId)
      return
    }

    this.characters = this.characters.map((c) => (c.id === id ? { ...c, ...updates } : c))
    await database.updateCharacterDirect(id, updates)
  }

  /**
   * The girl a check targeted, or undefined. Prefer the resolved `targetId`
   * (Phase 5 D2) so two same-named girls don't collide; fall back to the name for
   * legacy records that predate targetId. Never the protagonist — she is the
   * catalyst, not a subject.
   */
  private resolveCheckTarget(checkRecord: CheckRecord): Character | undefined {
    // Routed through checkRecordTargets so the id-then-name rule lives in exactly
    // one place (it is also the milk-yield suppression's matcher below).
    return this.characters.find(
      (c) => c.relationship !== 'self' && checkRecordTargets(checkRecord, c.id, c.name),
    )
  }

  /**
   * Fill an untagged growth-intent check's target from the scene, or leave the
   * record exactly as it came.
   *
   * The check-tagger is an LLM: it emitted `growthIntent` without
   * `targetCharacter` on a live crit, which used to mean no target, no promotion,
   * essence spent and zero growth. Requiring TWO tags to land together is the
   * fragility; a scene with exactly one possible subject does not need the second
   * one. Candidates use the notion the reducer loop already uses one level down —
   * a non-protagonist who is scene-present (this turn's classifier presence list)
   * and already carries body state. Presence that reads as unknown (the
   * classifier intermittently returns an empty list, or names only untracked
   * extras) degrades to the whole tracked cast, matching be/presence.ts's
   * include-when-in-doubt bias; that only ever widens the candidate set, so it
   * can turn an inference OFF, never on.
   *
   * Zero or several candidates → untouched, so nothing is promoted and nothing is
   * suppressed: ambiguous targeting must not guess between girls. Cast turns are
   * untouched too (`computeSpellCast` owns those and requires its own tagged
   * target). The resolved target is written back onto the record so the persisted
   * checkLog names who was actually affected, with `targetInferred` marking that
   * the engine — not the tagger — chose her.
   */
  private withInferredGrowthTarget(
    checkRecord: CheckRecord | null,
    result: ClassificationResult,
  ): CheckRecord | null {
    if (!checkRecord || checkRecord.growthIntent !== true) return checkRecord
    if (checkRecord.spellId) return checkRecord
    if (checkRecord.target || checkRecord.targetId) return checkRecord

    const tracked = this.characters.filter(
      (c) => c.relationship !== 'self' && readBodyState(c.metadata) !== null,
    )
    const presentNames = new Set(
      (result.scene?.presentCharacterNames ?? []).map((name) => name.trim().toLowerCase()),
    )
    const present = tracked.filter((c) => presentNames.has(c.name.trim().toLowerCase()))
    const candidates = present.length > 0 ? present : tracked
    if (candidates.length !== 1) return checkRecord

    const [target] = candidates
    log('growth-intent target inferred from a single-candidate scene', {
      target: target.name,
      band: checkRecord.band,
    })
    return { ...checkRecord, target: target.name, targetId: target.id, targetInferred: true }
  }

  /**
   * Check-backed growth intent → the target this turn's growth promotion applies
   * to (see be/effects.ts `promoteGrowthIntent` for what promotion does).
   *
   * The target is whatever the record carries by the time it reaches here: either
   * the tagger's `targetCharacter` or the sole-candidate fill from
   * `withInferredGrowthTarget`. Still null-on-no-target — an ambiguous scene
   * neither promotes nor suppresses.
   *
   * Returns null on a CAST turn even when the flag is set: `computeSpellCast`
   * already owns that turn's growth through the same guaranteed channel plus its
   * own dedupe budget, so running both would grow her twice. This is the explicit
   * interaction guard — a cast turn's behavior is unchanged by this feature, in
   * every band (a fizzled cast keeps its existing "applies nothing, suppresses
   * nothing" semantics rather than gaining suppression through the back door).
   *
   * An unknown/unlearned spell never reaches here as a landed band either:
   * resolveCheck refuses it with band 'fail' before rolling.
   */
  private computeGrowthIntent(
    checkRecord: CheckRecord | null,
  ): { targetId: string; targetName: string; band: CheckBand } | null {
    if (checkRecord?.growthIntent !== true) return null
    if (checkRecord.spellId) return null
    const target = this.resolveCheckTarget(checkRecord)
    if (!target) return null
    return { targetId: target.id, targetName: target.name, band: checkRecord.band }
  }

  /**
   * Spell cast → engine effects (Phase 4, research/50 R4/R5). When this turn's
   * check was a cast (spellId set) and the band landed (non-fail), resolve the
   * spell entry and translate its EffectTag[] into reducer inputs for the target
   * girl. Returns null when the cast applies no BE effects — a fizzle (fail
   * band), an unknown/unlearned spell (a stat_invention signal, not an effect),
   * or an untargeted cast (v1 effects require a girl, R10). Essence is spent by
   * applyRpgTurn regardless; this method never touches the sheet.
   */
  private computeSpellCast(checkRecord: CheckRecord | null): {
    targetId: string
    events: BeEvent[]
    bondEvents: BondEvent[]
    exposureEvents: ExposureEvent[]
    softConditions: BodyCondition[]
    softState?: BeSoftState
    supplyDelta: number
  } | null {
    if (!checkRecord?.spellId || checkRecord.band === 'fail') return null
    // Defense-in-depth: only a KNOWN spell casts. An unknown spellId is refused
    // here and flagged by the stat_invention detector, never applied.
    const protagonist = this.characters.find((c) => c.relationship === 'self')
    const known = protagonist ? sheetOrDefault(protagonist.metadata).knownSpells : []
    if (!known.includes(checkRecord.spellId)) return null
    const entry = this.lorebookEntries.find(
      (e) => e.id === checkRecord.spellId && e.type === 'spell',
    )
    if (!entry || entry.state.type !== 'spell') return null
    // v1: effects act on a girl (research/50 R10). No target → narrative-only cast.
    const target = this.resolveCheckTarget(checkRecord)
    if (!target) return null
    // Alchemy-milk empowerment (research/50 R11, non-consuming v1): an alchemy-
    // school cast lands +1 intensity while a prime/rich milk unit sits in the
    // inventory — her milk makes a stronger catalyst. No decrement in v1.
    const milkBonus =
      checkRecord.skill === 'alchemy' &&
      this.items.some(
        (i) =>
          i.location === 'inventory' &&
          i.quantity > 0 &&
          (i.metadata?.quality === 'prime' || i.metadata?.quality === 'rich'),
      )
        ? ALCHEMY_MILK_BONUS_INTENSITY
        : 0
    const translation = translateSpellEffects(
      coerceEffectTags(entry.state.effects),
      checkRecord.band,
      target.name,
      milkBonus,
    )
    // Nothing applicable translated (e.g. every effect was dropped as out-of-vocab
    // by coerceEffectTags on a corrupt/legacy spell) → no cast, so the target is
    // not force-seeded and the [CHECK RESULT] cast directive stays honest.
    const empty =
      translation.events.length === 0 &&
      translation.bondEvents.length === 0 &&
      translation.exposureEvents.length === 0 &&
      translation.softConditions.length === 0 &&
      translation.softState === undefined &&
      translation.supplyDelta === 0
    if (empty) return null
    return { targetId: target.id, ...translation }
  }

  /**
   * BE engine (Phase A): run the deterministic body-state reducer for every
   * non-protagonist character carrying (or gaining) bodyState, feeding it this
   * turn's classifier-extracted events. This is the ONLY production caller of
   * reduceCharacterBody — single-writer as code (research/31 §2.2). Mutates the
   * caller's before-state arrays so BE-only changes are rollback-visible
   * (31b §3.3 widened capture). Returns the outcome log for the delta.
   */
  private async applyBeEvents(
    result: ClassificationResult,
    entryId: string | undefined,
    trackingEnabled: boolean,
    charactersBefore: CharacterBeforeState[],
    createdCharacterIds: string[],
    checkRecord: CheckRecord | null,
    // Required, not defaulted: an omitted array would silently collect
    // un-rollbackable item writes into a throwaway, with no signal at all.
    itemsBefore: ItemBeforeState[],
    createdItemIds: string[],
  ): Promise<{ beLog: BeLogRecord[]; crossings: string[] }> {
    const beLog: BeLogRecord[] = []
    // Milestone crossings this turn (`${characterId}:${massKg}`) — the RPG
    // layer's leveling trigger (research/47 Step 8).
    const crossings: string[] = []
    const storyId = this.currentStory?.id
    if (!storyId) return { beLog, crossings }
    // No entry means no delta carrier AND no stable roll seed — skip rather than
    // resolve with a degenerate constant seed. (The sole production caller always
    // passes an entry id; a retried turn gets a NEW entry id and re-rolls by design.)
    if (!entryId) {
      log('applyBeEvents: no entryId, skipping BE reduction this apply')
      return { beLog, crossings }
    }

    const events = beEventsFromResult(result as unknown as Record<string, unknown>)
    const softStates = beSoftStatesFromResult(result as unknown as Record<string, unknown>)
    const softConditions = beConditionsFromResult(result as unknown as Record<string, unknown>)
    const bondEvents = bondEventsFromResult(result as unknown as Record<string, unknown>)
    const exposureEvents = exposureEventsFromResult(result as unknown as Record<string, unknown>)

    // Group events by resolved character (same case-insensitive matching as the entity loops).
    const eventsByCharacterId = new SvelteMap<string, typeof events>()
    for (const event of events) {
      const target = this.characters.find(
        (c) => c.name.toLowerCase() === event.character.toLowerCase(),
      )
      if (!target) continue
      if (target.relationship === 'self') continue // the protagonist is the catalyst, not a subject
      const bucket = eventsByCharacterId.get(target.id) ?? []
      bucket.push(event)
      eventsByCharacterId.set(target.id, bucket)
    }
    // Soft-state reads resolve the same way; last read wins per character.
    const softStateByCharacterId = new SvelteMap<string, BeSoftState>()
    for (const soft of softStates) {
      const target = this.characters.find(
        (c) => c.name.toLowerCase() === soft.character.toLowerCase(),
      )
      if (!target || target.relationship === 'self') continue
      softStateByCharacterId.set(target.id, soft)
    }
    // Track events resolve the same way (research/48 Step 5).
    const bondEventsByCharacterId = new SvelteMap<string, BondEvent[]>()
    for (const event of bondEvents) {
      const target = this.characters.find(
        (c) => c.name.toLowerCase() === event.character.toLowerCase(),
      )
      if (!target || target.relationship === 'self') continue
      const bucket = bondEventsByCharacterId.get(target.id) ?? []
      bucket.push(event)
      bondEventsByCharacterId.set(target.id, bucket)
    }
    const exposureEventsByCharacterId = new SvelteMap<string, ExposureEvent[]>()
    for (const event of exposureEvents) {
      const target = this.characters.find(
        (c) => c.name.toLowerCase() === event.character.toLowerCase(),
      )
      if (!target || target.relationship === 'self') continue
      const bucket = exposureEventsByCharacterId.get(target.id) ?? []
      bucket.push(event)
      exposureEventsByCharacterId.set(target.id, bucket)
    }
    // Classifier-proposed conditions resolve the same way (Spec 1 Task 4).
    const conditionsByCharacterId = new SvelteMap<string, BodyCondition[]>()
    for (const condition of softConditions) {
      const target = this.characters.find(
        (c) => c.name.toLowerCase() === condition.character.toLowerCase(),
      )
      if (!target || target.relationship === 'self') continue
      const bucket = conditionsByCharacterId.get(target.id) ?? []
      bucket.push({
        label: condition.label,
        ...(condition.note !== undefined ? { note: condition.note } : {}),
        ...(condition.ttl !== undefined ? { ttl: condition.ttl } : {}),
      })
      conditionsByCharacterId.set(target.id, bucket)
    }

    // Spell cast effects (Phase 4, research/50 R5/R9): engine-authored effects
    // merge into the target's buckets and are AUTHORITATIVE — the classifier's
    // duplicate same-kind events for that girl are dropped so a cast-grown girl
    // does not grow twice (spell growth prose would otherwise re-propose it).
    const supplyDeltaByCharacterId = new SvelteMap<string, number>()
    const spellCast = this.computeSpellCast(checkRecord)
    if (spellCast) {
      const id = spellCast.targetId
      // R9 dedupe (pure helper): drop the classifier's spell-superseded same-kind
      // events for this girl, then append the spell events in a stable order so
      // the reducer's index-seeded growth rolls replay identically on undo/retry.
      const keptClassifierEvents = dedupeForCast(
        eventsByCharacterId.get(id) ?? [],
        spellCast.events,
      )
      eventsByCharacterId.set(id, [...keptClassifierEvents, ...spellCast.events])
      // Bond / exposure: APPEND the spell's shift to the classifier's (both are
      // legitimate — the spell is mechanical, the classifier read the prose), and
      // the reducer's per-turn velocity caps bound the total. Replacing would drop
      // a genuine same-turn opposite movement for this girl (review finding).
      if (spellCast.bondEvents.length > 0) {
        bondEventsByCharacterId.set(id, [
          ...(bondEventsByCharacterId.get(id) ?? []),
          ...spellCast.bondEvents,
        ])
      }
      if (spellCast.exposureEvents.length > 0) {
        exposureEventsByCharacterId.set(id, [
          ...(exposureEventsByCharacterId.get(id) ?? []),
          ...spellCast.exposureEvents,
        ])
      }
      // Conditions are additive — the reducer merges derived-first and caps at 6.
      if (spellCast.softConditions.length > 0) {
        conditionsByCharacterId.set(id, [
          ...(conditionsByCharacterId.get(id) ?? []),
          ...spellCast.softConditions,
        ])
      }
      // Fill-set softState: the spell's absolute write wins.
      if (spellCast.softState) softStateByCharacterId.set(id, spellCast.softState)
      if (spellCast.supplyDelta > 0) supplyDeltaByCharacterId.set(id, spellCast.supplyDelta)
    }

    // Check-backed growth WITHOUT a spell: an action whose stated purpose was to
    // grow the target, tagged and paid for, must land through the same guaranteed
    // channel a cast uses — and must suppress the classifier's mirror when it
    // failed. Mutually exclusive with the cast block above (computeGrowthIntent
    // returns null whenever spellId is set), so growth is never promoted twice.
    // Touches ONE character's bucket: a second girl growing ambiently on the same
    // turn keeps her own events and her own rolls.
    const growthIntent = this.computeGrowthIntent(checkRecord)
    if (growthIntent) {
      eventsByCharacterId.set(
        growthIntent.targetId,
        promoteGrowthIntent(
          eventsByCharacterId.get(growthIntent.targetId) ?? [],
          growthIntent.band,
          growthIntent.targetName,
        ),
      )
    }

    // Present-only tick gating (Spec 1 Task 9 ruling): the passive fill/pressure
    // tick runs for characters the classifier placed in the scene.
    const presentNames = new Set(
      (result.scene?.presentCharacterNames ?? []).map((name) => name.trim().toLowerCase()),
    )
    // Finalized narrative for output-side drift detection (Spec 1 Task 6).
    const narrativeContent = this.entries.find((e) => e.id === entryId)?.content ?? ''

    // Config from story settings (research/41 + Spec 1 Task 9): the eligible-kinds
    // gate keeps canon-illegal growth from ever rolling; the story fluid drives
    // the registry tick; unset settings keep the defaults.
    const eligibleKinds = parseGrowthEligibleKinds(
      this.currentStory?.settings?.beGrowthEligibleKinds,
    )
    const settingsFluid = this.currentStory?.settings?.beFluidType
    const config = {
      ...DEFAULT_BE_STORY_CONFIG,
      enabled: true,
      ...(typeof settingsFluid === 'string' && settingsFluid.trim()
        ? { fluidType: settingsFluid.trim() }
        : {}),
      ...(eligibleKinds ? { growthEligibleKinds: eligibleKinds } : {}),
    }

    for (const character of this.characters) {
      if (character.relationship === 'self') continue
      const charEvents = eventsByCharacterId.get(character.id) ?? []
      const charSoftState = softStateByCharacterId.get(character.id)
      const charConditions = conditionsByCharacterId.get(character.id)
      const charBondEvents = bondEventsByCharacterId.get(character.id) ?? []
      const charExposureEvents = exposureEventsByCharacterId.get(character.id) ?? []
      const charSupplyDelta = supplyDeltaByCharacterId.get(character.id) ?? 0
      const isPresent = presentNames.has(character.name.toLowerCase())
      let state = readBodyState(character.metadata)

      // Auto-seed on a character's first event: tier sniffed from her own
      // description/build when possible, module default otherwise. The panel is
      // the correction surface for a wrong sniff.
      const pendingLog: BeLogRecord[] = []
      let seeded = false
      if (!state) {
        // Soft reads alone don't seed; events do — and a spell cast on a
        // never-seeded girl seeds her too, so its event-less effects (bond,
        // dependence, condition/check_debuff, supply_surge, fill:set) are not
        // silently dropped against a freshly-introduced target (research/50 review).
        if (charEvents.length === 0 && character.id !== spellCast?.targetId) continue
        const sniffSource = [
          character.visualDescriptors?.build ?? '',
          character.description ?? '',
        ].join('\n')
        const sniffedTier = sniffTierFromText(sniffSource)
        state = {
          ...defaultBodyState(sniffedTier ?? undefined, this.currentStory?.settings?.beFluidType),
          // Quirks are identity: keyed on story+character ONLY (never entryId,
          // or a retry rerolls her personality — research/48 R3).
          quirks: assignQuirks(`${storyId}:${character.id}:quirks`),
        }
        // Frame baseline (height/build) parsed from the same text feeds the
        // band/frame-weight math; the panel's baseline editor still wins later.
        const seededBaseline = seedBaselineFromText(sniffSource)
        if (seededBaseline) state = { ...state, baseline: seededBaseline }
        seeded = true
        pendingLog.push({
          character: character.name,
          kind: 'seed',
          outcome: 'none',
          delta: 0,
          tierAfter: state.tier,
          note: `${sniffedTier !== null ? 'tier sniffed from descriptors' : 'default tier'}; quirks: ${state.quirks?.join(', ')}`,
        })
      } else if (state.quirks === undefined) {
        // Lazy backfill for pre-Phase-2 saves: same seed → same quirks, and the
        // undefined guard makes it idempotent across replays. Must happen
        // BEFORE the reduce or the first post-upgrade turn applies no quirk
        // effects while the prompt already advertises them.
        state = { ...state, quirks: assignQuirks(`${storyId}:${character.id}:quirks`) }
        seeded = true // force the write even if the reduce is otherwise a no-op
        pendingLog.push({
          character: character.name,
          kind: 'seed',
          outcome: 'none',
          delta: 0,
          tierAfter: state.tier,
          note: `quirks assigned: ${state.quirks?.join(', ')}`,
        })
      } else if (
        !isPresent &&
        charEvents.length === 0 &&
        !charSoftState &&
        !charConditions &&
        charBondEvents.length === 0 &&
        charExposureEvents.length === 0 &&
        charSupplyDelta === 0 &&
        state.cooldown === 0 &&
        !state.lastGrowth &&
        !state.pendingGrowth &&
        !state.driftNote &&
        // A lactating girl is never "settled": her supply counters keep moving,
        // and a milking/induction event must always reach the reducer
        // (research/49 Step 4). The no-op-write guard below still suppresses
        // the write when nothing actually changed.
        lactationOf(state)?.active !== true &&
        state.conditions.every((c) => c.ttl === undefined)
      ) {
        // Absent, untargeted, and fully settled: skip the no-op write. Present
        // seeded characters reduce EVERY turn now (Spec 1 fill/pressure tick),
        // so this narrow skip is the only remaining short-circuit.
        continue
      }

      // Output-side drift (Spec 1 Task 6): compare the finalized prose against
      // the PRE-reduce state — what the narrator's [BODY STATE] block showed.
      const driftFindings =
        isPresent && narrativeContent ? detectDrift(narrativeContent, character.name, state) : []

      const seed = `${storyId}:${entryId}:${character.id}`
      const {
        state: nextState,
        log: reducerLog,
        milkYield,
      } = reduceCharacterBody(state, charEvents, config, seed, character.name, charSoftState, {
        // Present-only ruling: off-screen characters keep time but never
        // change size unseen (fill/pressure/pity/pending all held). Events
        // imply presence even when the classifier's scene list misses her.
        ticksEnabled: isPresent || charEvents.length > 0,
        ...(charConditions ? { softConditions: charConditions } : {}),
        ...(driftFindings.length > 0 ? { driftFindings } : {}),
        ...(charBondEvents.length > 0 ? { bondEvents: charBondEvents } : {}),
        ...(charExposureEvents.length > 0 ? { exposureEvents: charExposureEvents } : {}),
        ...(charSupplyDelta > 0 ? { supplyDelta: charSupplyDelta } : {}),
      })
      pendingLog.push(...reducerLog)

      // Milk becomes inventory (research/49 R7). Declared here because BOTH the
      // no-op-write path and the normal path have to bottle it: a drain is real
      // even on the (rare) turn whose reduced state stringifies identically.
      const bottleMilkYield = async (): Promise<void> => {
        if (!milkYield) return
        await this.applyMilkYield({
          character,
          state: nextState,
          units: milkYield.units,
          checkRecord,
          fluidType: config.fluidType,
          trackingEnabled,
          itemsBefore,
          createdItemIds,
          beLog,
          entryId,
        })
      }

      // A targeted-but-muzzled (locked/cooldown) character can come out unchanged:
      // keep her outcome records for the cadence log, skip the no-op write and the
      // before-state churn.
      const stateChanged = seeded || JSON.stringify(nextState) !== JSON.stringify(state)
      if (!stateChanged) {
        beLog.push(...pendingLog)
        // Defensive only: a non-empty milkYield implies the fill dropped, so
        // this path should never carry one — but if it ever does (no body
        // write to gate behind), the milk still left her, so it still bottles.
        await bottleMilkYield()
        continue
      }

      // Milestone crossings: carried mass passing an interaction threshold this
      // turn. Seeding is not a crossing — her starting size was not earned.
      // M-4 (research/54): compute them here but do NOT commit to `crossings`
      // until the body write actually lands — a swallowed write failure must not
      // award a permanent protagonist milestone for mass that never persisted.
      const turnCrossings: string[] = []
      if (!seeded) {
        const massBefore = measurements(state).nowTotalKg
        const massAfter = measurements(nextState).nowTotalKg
        for (const milestone of INTERACTION_MILESTONES) {
          if (massBefore < milestone.massKg && massAfter >= milestone.massKg) {
            turnCrossings.push(crossingKey(character.id, milestone.massKg))
          }
        }
      }

      // Widened before-state capture: the reducer touches characters the
      // classifier never flagged, and rollback must cover them too.
      this.captureCharacterBeforeState(
        character,
        trackingEnabled,
        charactersBefore,
        createdCharacterIds,
      )

      // Since D-4 every turn is transactional, so a wrapUpdate failure RETHROWS
      // and rolls the whole turn back — when the await below returns, the write
      // landed and this flag is always true. It is kept (with the flag-last
      // discipline) as a guard for any future non-transactional wrapUpdate mode,
      // where a swallowed failure must not let downstream steps infer success.
      let bodyWriteLanded = false
      await this.wrapUpdate('BE body state', character.name, async () => {
        const { entity: ownedChar, wasCowed } = await this.cowCharacter(character)
        const metadata = writeBodyState(ownedChar.metadata, nextState)
        await database.updateCharacter(ownedChar.id, { metadata })
        this.characters = this.characters.map((c) =>
          c.id === ownedChar.id ? { ...c, metadata } : c,
        )
        // Log only after the write landed — a swallowed failure must not leave
        // phantom growth records in the cadence log.
        beLog.push(...pendingLog)
        if (wasCowed && trackingEnabled) {
          createdCharacterIds.push(ownedChar.id)
          const idx = charactersBefore.findIndex((cb) => cb.id === character.id)
          if (idx !== -1) charactersBefore.splice(idx, 1)
        }
        bodyWriteLanded = true
      })

      // Milk becomes inventory (research/49 R7) — ONLY after her body state
      // actually landed. A swallowed body-write failure leaves her fill
      // un-drained in the database, so bottling anyway would duplicate the
      // milk on every retry of the same turn. Milestone crossings commit on the
      // same gate (M-4): no persisted growth ⇒ no earned milestone.
      if (bodyWriteLanded) {
        crossings.push(...turnCrossings)
        await bottleMilkYield()
      }
    }

    return { beLog, crossings }
  }

  /**
   * Turn one turn's expressed milk into inventory (research/49 R7/R8): quality
   * comes from THIS turn's Milking check against THIS girl, then the units
   * stack onto her existing row of that quality or create a new one. Both paths
   * ride the existing delta machinery (`ItemBeforeState` on a bump,
   * `createdEntities.itemIds` on a create), so undo is inherited rather than
   * re-implemented.
   *
   * REPLAY SAFETY: the quantity stack is the only non-idempotent write in the
   * pipeline, so every yield stamps `lastYieldEntryId` on the stack and a
   * second yield for the SAME entry is refused. A retried turn mints a new
   * entry id, so retries still yield by design.
   */
  private async applyMilkYield(input: {
    character: Character
    state: BodyState
    units: number
    checkRecord: CheckRecord | null
    fluidType: string
    trackingEnabled: boolean
    itemsBefore: ItemBeforeState[]
    createdItemIds: string[]
    beLog: BeLogRecord[]
    /** This turn's entry id — the replay key stamped onto the milk stack. */
    entryId: string
  }): Promise<void> {
    const { character, state, units, checkRecord, trackingEnabled, beLog, entryId } = input
    const storyId = this.currentStory?.id
    if (!storyId) return

    // An unaffordable check never happened: no essence was spent, so no
    // milking occurred, so nothing is bottled. Falling through to the ungraded
    // `plain` path would make failing to AFFORD a check out-yield failing it.
    // A record with NO resolved target still suppresses — the LLM omitting
    // `targetCharacter` must not turn an unaffordable milking into free milk;
    // only a check explicitly targeting a DIFFERENT girl leaves this one alone.
    if (
      checkRecord?.insufficientEssence === true &&
      checkRecord.skill === 'milking' &&
      // No target named → suppresses for everyone; otherwise only the resolved
      // target (by id, name fallback — Phase 5 D2) is suppressed.
      ((!checkRecord.target && !checkRecord.targetId) ||
        checkRecordTargets(checkRecord, character.id, character.name))
    ) {
      beLog.push({
        character: character.name,
        kind: 'yield',
        outcome: 'fail',
        delta: 0,
        tierAfter: state.tier,
        note: 'not enough essence — the milking never happened',
      })
      return
    }

    // Only a milking check against THIS girl grades her milk; anything else
    // (no check, someone else's check, another skill) is ungraded `plain`.
    const graded =
      checkRecord &&
      checkRecord.skill === 'milking' &&
      !checkRecord.insufficientEssence &&
      checkRecordTargets(checkRecord, character.id, character.name)
        ? checkRecord.band
        : null
    const quality: MilkQuality | null = qualityFromBand(graded)
    if (!quality) {
      // A botched check yields nothing even though the scene evidenced
      // expression — the dice say it went wrong. Log why, write nothing.
      beLog.push({
        character: character.name,
        kind: 'yield',
        outcome: 'fail',
        delta: 0,
        tierAfter: state.tier,
        note: 'milking botched — nothing worth keeping',
      })
      return
    }

    const existing = findMilkItem(this.items, character.id, quality)
    // Same entry already bottled into this stack: a replayed apply must not
    // re-stack the units (the retry path mints a new entry id and so passes).
    if (existing && existing.metadata?.lastYieldEntryId === entryId) {
      log('applyMilkYield: entry already yielded into this stack, skipping', {
        entryId,
        itemId: existing.id,
      })
      return
    }
    await this.wrapUpdate('Milk yield', character.name, async () => {
      if (existing) {
        if (
          trackingEnabled &&
          !input.createdItemIds.includes(existing.id) &&
          !input.itemsBefore.some((ib) => ib.id === existing.id)
        ) {
          input.itemsBefore.push({
            id: existing.id,
            name: existing.name,
            quantity: existing.quantity,
            equipped: existing.equipped,
            location: existing.location,
            metadata: existing.metadata ? { ...existing.metadata } : null,
          })
        }
        const { entity: ownedItem, wasCowed } = await this.cowItem(existing)
        const quantity = ownedItem.quantity + units
        // Merge, never replace: milkOf/quality (the stack's identity) and any
        // runtimeVars must survive the stamp.
        const metadata = { ...(ownedItem.metadata ?? {}), lastYieldEntryId: entryId }
        await database.updateItem(ownedItem.id, { quantity, metadata })
        this.items = this.items.map((i) =>
          i.id === ownedItem.id ? { ...i, quantity, metadata } : i,
        )
        if (wasCowed && trackingEnabled) {
          input.createdItemIds.push(ownedItem.id)
          const idx = input.itemsBefore.findIndex((ib) => ib.id === existing.id)
          if (idx !== -1) input.itemsBefore.splice(idx, 1)
        }
      } else {
        const item: Item = {
          id: crypto.randomUUID(),
          storyId,
          name: milkItemName(character.name, input.fluidType),
          description: `${quality} ${input.fluidType} expressed from ${character.name}.`,
          quantity: units,
          equipped: false,
          location: 'inventory',
          metadata: {
            source: 'be-engine',
            ...milkItemMetadata(character.id, quality),
            lastYieldEntryId: entryId,
          },
          branchId: this.currentStory?.currentBranchId ?? null,
        }
        await database.addItem(item)
        this.items = [...this.items, item]
        if (trackingEnabled) input.createdItemIds.push(item.id)
      }
      // Log only after the write landed (same discipline as the body write).
      beLog.push({
        character: character.name,
        kind: 'yield',
        outcome: 'success',
        delta: units,
        tierAfter: state.tier,
        note: `+${units} unit${units === 1 ? '' : 's'} of ${input.fluidType} (${quality})`,
      })
    })
  }

  /**
   * RPG layer (research/47 Step 8): the ONLY writer of the protagonist's
   * rpgSheet during a turn. Applies, in order: check essence spend →
   * time-period regen → milestone level grants → one-turn drift note. Runs
   * right after applyBeEvents (which owns every non-self row and skips self;
   * this method owns the self row exclusively) and BEFORE the delta is built,
   * so the write is rollback-visible via the protagonist's before-state.
   *
   * The check RESOLVED before narration (CheckPhase) but is WRITTEN here, at
   * classification time — an abort after narration costs no essence and logs
   * nothing, mirroring applyBeEvents' no-entryId skip. Do not move this spend
   * pre-narration: it would break rollback and the single-writer rule.
   */
  /**
   * Rollback capture shared by applyBeEvents and applyRpgTurn: push a
   * character's before-state once, unless it was created this turn.
   */
  private captureCharacterBeforeState(
    character: Character,
    trackingEnabled: boolean,
    charactersBefore: CharacterBeforeState[],
    createdCharacterIds: string[],
  ): void {
    if (
      !trackingEnabled ||
      createdCharacterIds.includes(character.id) ||
      charactersBefore.some((cb) => cb.id === character.id)
    ) {
      return
    }
    charactersBefore.push({
      id: character.id,
      name: character.name,
      status: character.status,
      relationship: character.relationship,
      traits: [...character.traits],
      visualDescriptors: { ...character.visualDescriptors },
      currentVisualDescriptors: character.currentVisualDescriptors
        ? { ...character.currentVisualDescriptors }
        : null,
      metadata: character.metadata ? { ...character.metadata } : null,
    })
  }

  private async applyRpgTurn(
    checkRecord: CheckRecord | null,
    entryId: string | undefined,
    trackingEnabled: boolean,
    charactersBefore: CharacterBeforeState[],
    createdCharacterIds: string[],
    timeTrackerBefore: TimeTracker | null,
    crossings: string[],
  ): Promise<CheckRecord[]> {
    // Logs nothing on the skip paths — a checkLog row asserts "this spend
    // landed", which would be false here (mirrors applyBeEvents' skip).
    if (!this.currentStory || !entryId) return []
    const protagonist = this.characters.find((c) => c.relationship === 'self')
    if (!protagonist) return []
    // D-11: a stored sheet that fails validation is NOT "no sheet yet". Falling
    // through would rebuild from defaults + the creation grant and persist it,
    // destroying the stored level, spells, milestones and spent points. Skip the
    // whole RPG turn (same "nothing to do" result as the no-protagonist path)
    // and leave the blob untouched for repair.
    if (isStoredRpgSheetInvalid(protagonist.metadata)) {
      console.warn(
        `[StoryStore] RPG turn skipped for ${protagonist.name}: the stored rpgSheet failed validation and was left untouched`,
      )
      return []
    }

    const storedSheet = readRpgSheet(protagonist.metadata)
    // Baseline for the change check is the STORED sheet (pre-grant), so applying
    // the one-time creation grant to a sheet that predates it counts as a change
    // and persists — otherwise the grant would re-derive on every read forever.
    const sheetBeforeJson = storedSheet ? JSON.stringify(storedSheet) : null
    let sheet = withStartingGrant(storedSheet ?? defaultRpgSheet())

    // 1. Essence spend from the resolved check (never below zero; an
    //    insufficient-essence record spent nothing by construction).
    if (checkRecord && checkRecord.essenceSpent > 0 && !checkRecord.insufficientEssence) {
      sheet = {
        ...sheet,
        essence: {
          ...sheet.essence,
          current: Math.max(0, sheet.essence.current - checkRecord.essenceSpent),
        },
      }
    }

    // 2. Milestone level grants (idempotent via awardedMilestones). Grants run
    //    BEFORE regen so a same-turn level-up raises the max the regen clamps
    //    against — otherwise the player is shorted the difference.
    sheet = applyLevelGrants(sheet, crossings).sheet

    // 3. Time-period regen: +2 per 6h period crossed this turn, clamped to max.
    if (timeTrackerBefore && this.currentStory.timeTracker) {
      const periods = periodIndex(this.currentStory.timeTracker) - periodIndex(timeTrackerBefore)
      if (periods > 0) {
        sheet = {
          ...sheet,
          essence: {
            ...sheet.essence,
            current: Math.min(
              essenceMax(sheet.level),
              sheet.essence.current + periods * ESSENCE_REGEN_PER_PERIOD,
            ),
          },
        }
      }
    }

    // 4. Drift: previous turn's note expires; this turn's findings (if any)
    //    ride BOTH carriers — the record (roll-card tag) and the sheet
    //    ([CONTINUITY] prompt line next turn).
    const narrativeContent = this.entries.find((e) => e.id === entryId)?.content ?? ''
    const findings = detectRpgDrift(narrativeContent, sheet, checkRecord)
    const nextDriftNote =
      findings.length > 0 ? { note: findings.map((f) => f.note).join(' ') } : undefined
    if (sheet.driftNote || nextDriftNote) {
      sheet = { ...sheet }
      if (nextDriftNote) sheet.driftNote = nextDriftNote
      else delete sheet.driftNote
    }
    const recordOut: CheckRecord | null = checkRecord
      ? findings.length > 0
        ? { ...checkRecord, drift: findings }
        : checkRecord
      : null

    const sheetChanged = storedSheet === null || JSON.stringify(sheet) !== sheetBeforeJson
    if (sheetChanged) {
      this.captureCharacterBeforeState(
        protagonist,
        trackingEnabled,
        charactersBefore,
        createdCharacterIds,
      )

      await this.wrapUpdate('RPG sheet', protagonist.name, async () => {
        const { entity: owned, wasCowed } = await this.cowCharacter(protagonist)
        const metadata = writeRpgSheet(owned.metadata, sheet)
        await database.updateCharacter(owned.id, { metadata })
        this.characters = this.characters.map((c) => (c.id === owned.id ? { ...c, metadata } : c))
        if (wasCowed && trackingEnabled) {
          createdCharacterIds.push(owned.id)
          const idx = charactersBefore.findIndex((cb) => cb.id === protagonist.id)
          if (idx !== -1) charactersBefore.splice(idx, 1)
        }
      })
    }

    return recordOut ? [recordOut] : []
  }

  // Clear current story (when switching or closing)
  clearCurrentStory(): void {
    this.resetStoryState()

    // Clear current retry story ID (backups are kept per-story)
    ui.setCurrentRetryStoryId(null)

    // Clear all generation caches (style review, retrieval, lorebook debug)
    ui.clearGenerationCaches()
  }

  // Update story mode
  async setStoryMode(mode: StoryMode): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    await database.updateStory(this.currentStory.id, { mode })
    this.currentStory = { ...this.currentStory, mode }
    log('Story mode updated:', mode)

    // Emit event
    emitModeChanged(mode)
  }

  // Update memory configuration
  async setMemoryConfig(config: MemoryConfig): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    await database.updateStory(this.currentStory.id, { memoryConfig: config })
    this.currentStory = { ...this.currentStory, memoryConfig: config }
    log('Memory config updated:', config)
  }

  // Add a chapter
  async addChapter(chapter: Chapter): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    await database.addChapter(chapter)
    this.chapters = [...this.chapters, chapter]

    // Invalidate chapter cache
    this.invalidateChapterCache()

    log('Chapter added:', chapter.number, chapter.title)

    // Emit event
    emitChapterCreated(chapter.id, chapter.number, chapter.title)
  }

  // Get the next chapter number from the database (handles deletions correctly)
  async getNextChapterNumber(): Promise<number> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Use branch-filtered chapters to determine next chapter number
    // this.chapters is already filtered to current branch view (inherited + branch-specific)
    if (this.chapters.length === 0) {
      return 1
    }

    // Find the maximum chapter number in the current branch view
    const maxNumber = Math.max(...this.chapters.map((ch) => ch.number))
    return maxNumber + 1
  }

  // Update a chapter's summary
  async updateChapterSummary(chapterId: string, summary: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    await database.updateChapter(chapterId, { summary })
    this.chapters = this.chapters.map((ch) => (ch.id === chapterId ? { ...ch, summary } : ch))
    log('Chapter summary updated:', chapterId)
  }

  // Update a chapter with multiple fields
  async updateChapter(chapterId: string, updates: Partial<Chapter>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    await database.updateChapter(chapterId, updates)
    this.chapters = this.chapters.map((ch) => (ch.id === chapterId ? { ...ch, ...updates } : ch))
    log('Chapter updated:', chapterId, updates)
  }

  // Get entries for a specific chapter
  // Uses O(1) map lookups for performance
  getChapterEntries(chapter: Chapter): StoryEntry[] {
    // Ensure index map is up to date
    if (this._entryIdToIndex.size !== this.entries.length) {
      this.rebuildEntryIdIndex()
    }
    const startIdx = this._entryIdToIndex.get(chapter.startEntryId)
    const endIdx = this._entryIdToIndex.get(chapter.endEntryId)
    if (startIdx === undefined || endIdx === undefined) return []
    return this.entries.slice(startIdx, endIdx + 1)
  }

  // Delete a chapter
  async deleteChapter(chapterId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    await database.deleteChapter(chapterId)
    this.chapters = this.chapters.filter((ch) => ch.id !== chapterId)

    // Invalidate chapter cache
    this.invalidateChapterCache()

    log('Chapter deleted:', chapterId)
  }

  // Update memory configuration (partial updates)
  async updateMemoryConfig(updates: Partial<MemoryConfig>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const newConfig = { ...this.memoryConfig, ...updates }
    await database.updateStory(this.currentStory.id, { memoryConfig: newConfig })
    this.currentStory = { ...this.currentStory, memoryConfig: newConfig }
    log('Memory config updated via updateMemoryConfig:', updates)
  }

  // Update story settings (partial updates)
  async updateStorySettings(updates: Partial<StorySettings>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const newSettings = { ...(this.currentStory.settings ?? {}), ...updates }
    await database.updateStory(this.currentStory.id, { settings: newSettings })
    this.currentStory = { ...this.currentStory, settings: newSettings }
    log('Story settings updated via updateStorySettings:', updates)
  }

  /**
   * Normalize time values, converting overflow/underflow between units.
   * Handles both positive overflow (60 min → 1 hour) and negative underflow (borrowing).
   * 60 minutes → 1 hour, 24 hours → 1 day, 365 days → 1 year
   */
  private normalizeTime(time: TimeTracker): TimeTracker {
    let { years, days, hours, minutes } = time

    // Handle negative minutes by borrowing from hours
    while (minutes < 0 && hours > 0) {
      hours -= 1
      minutes += 60
    }

    // Handle negative hours by borrowing from days
    while (hours < 0 && days > 0) {
      days -= 1
      hours += 24
    }

    // Handle negative days by borrowing from years
    while (days < 0 && years > 0) {
      years -= 1
      days += 365
    }

    // Clamp any remaining negatives to 0 (can't have negative time)
    years = Math.max(0, years)
    days = Math.max(0, days)
    hours = Math.max(0, hours)
    minutes = Math.max(0, minutes)

    // Normalize overflow: minutes to hours
    if (minutes >= 60) {
      hours += Math.floor(minutes / 60)
      minutes = minutes % 60
    }

    // Normalize overflow: hours to days
    if (hours >= 24) {
      days += Math.floor(hours / 24)
      hours = hours % 24
    }

    // Normalize overflow: days to years
    if (days >= 365) {
      years += Math.floor(days / 365)
      days = days % 365
    }

    return { years, days, hours, minutes }
  }

  // Set time tracker directly
  async setTimeTracker(time: TimeTracker): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const normalized = this.normalizeTime(time)
    await database.saveTimeTracker(this.currentStory.id, normalized)
    this.currentStory = { ...this.currentStory, timeTracker: normalized }
    log('Time tracker set:', normalized)
  }

  // Update time tracker with partial values (adds to current time)
  async addTime(updates: Partial<TimeTracker>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    const current = this.timeTracker
    const newTime: TimeTracker = {
      years: current.years + (updates.years ?? 0),
      days: current.days + (updates.days ?? 0),
      hours: current.hours + (updates.hours ?? 0),
      minutes: current.minutes + (updates.minutes ?? 0),
    }

    const normalized = this.normalizeTime(newTime)
    await database.saveTimeTracker(this.currentStory.id, normalized)
    this.currentStory = { ...this.currentStory, timeTracker: normalized }
    log('Time added:', updates, '→', normalized)
  }

  /**
   * Apply time progression from classifier result.
   * Adds a default amount based on the progression type.
   */
  async applyTimeProgression(progression: 'none' | 'minutes' | 'hours' | 'days'): Promise<void> {
    if (progression === 'none') return

    // Default increments for each progression type
    const increments: Record<string, Partial<TimeTracker>> = {
      minutes: { minutes: 15 }, // ~15 minutes for minor actions
      hours: { hours: 2 }, // ~2 hours for moderate time passage
      days: { days: 1 }, // 1 day for significant time jumps
    }

    const increment = increments[progression]
    if (increment) {
      await this.addTime(increment)
    }
  }

  /**
   * Restore or clear the story time tracker from a snapshot.
   * Undefined means "skip", null means "clear".
   */
  async restoreTimeTrackerSnapshot(snapshot: TimeTracker | null | undefined): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')
    if (snapshot === undefined) return

    if (snapshot === null) {
      await database.clearTimeTracker(this.currentStory.id)
      this.currentStory = { ...this.currentStory, timeTracker: null }
      log('Time tracker cleared from snapshot')
      return
    }

    const normalized = this.normalizeTime(snapshot)
    await database.saveTimeTracker(this.currentStory.id, normalized)
    this.currentStory = { ...this.currentStory, timeTracker: normalized }
    log('Time tracker restored from snapshot:', normalized)
  }

  /**
   * Phase 1: Maybe create an automatic world state snapshot.
   * Called after saving a delta. Creates a snapshot every N entries (configured interval).
   */
  private async maybeCreateAutoSnapshot(entryId: string): Promise<void> {
    if (!this.currentStory) return
    if (!settings.experimentalFeatures.stateTracking) return

    const entry = this.entries.find((e) => e.id === entryId)
    if (!entry) return

    const interval = settings.experimentalFeatures.autoSnapshotInterval
    if (interval <= 0) return

    // Only snapshot at interval boundaries
    if (entry.position % interval !== 0) return

    const branchId = this.currentStory.currentBranchId ?? null

    try {
      const snapshot: WorldStateSnapshot = {
        id: crypto.randomUUID(),
        storyId: this.currentStory.id,
        branchId,
        entryId,
        entryPosition: entry.position,
        charactersSnapshot: this.characters.map((c) => ({ ...c })),
        locationsSnapshot: this.locations.map((l) => ({ ...l })),
        itemsSnapshot: this.items.map((i) => ({ ...i })),
        storyBeatsSnapshot: this.storyBeats.map((b) => ({ ...b })),
        lorebookEntriesSnapshot: this.lorebookEntries.map((e) => ({ ...e })),
        timeTrackerSnapshot: this.currentStory.timeTracker
          ? { ...this.currentStory.timeTracker }
          : null,
        createdAt: Date.now(),
      }

      await database.createWorldStateSnapshot(snapshot)
      log('Auto-snapshot created at position', entry.position)
    } catch (error) {
      console.error('[StoryStore] Failed to create auto-snapshot:', error)
      // Non-fatal
    }
  }

  // Create a manual chapter at a specific entry index
  async createManualChapter(endEntryIndex: number): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Find the start index (after the last chapter or beginning)
    const startIndex = this.lastChapterEndIndex

    // Validate the end index
    if (endEntryIndex <= startIndex || endEntryIndex > this.entries.length) {
      throw new Error('Invalid entry index for chapter creation')
    }

    // Get the entries for this chapter
    const chapterEntries = this.entries.slice(startIndex, endEntryIndex)
    if (chapterEntries.length === 0) {
      throw new Error('No entries to create chapter from')
    }

    // Get previous chapters for context (branch-filtered)
    const previousChapters = [...this.currentBranchChapters].sort((a, b) => a.number - b.number)

    // Import aiService dynamically to avoid circular dependency
    const { aiService } = await import('$lib/services/ai')

    // Generate summary with previous chapters as context
    const chapterData = await aiService.summarizeChapter(
      chapterEntries,
      previousChapters,
      this.currentStory?.mode ?? 'adventure',
      this.pov,
      this.tense,
    )

    // Get the next chapter number
    const chapterNumber = await this.getNextChapterNumber()

    // Extract time range from entries' metadata
    const firstEntry = chapterEntries[0]
    const lastEntry = chapterEntries[chapterEntries.length - 1]
    const startTime = firstEntry.metadata?.timeStart ?? null
    const endTime = lastEntry.metadata?.timeEnd ?? null

    // Create the chapter
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      number: chapterNumber,
      title: chapterData.title || null,
      startEntryId: chapterEntries[0].id,
      endEntryId: chapterEntries[chapterEntries.length - 1].id,
      entryCount: chapterEntries.length,
      summary: chapterData.summary,
      startTime,
      endTime,
      keywords: chapterData.keywords,
      characters: chapterData.characters,
      locations: chapterData.locations,
      plotThreads: chapterData.plotThreads,
      emotionalTone: chapterData.emotionalTone || null,
      branchId: this.currentStory.currentBranchId,
      createdAt: Date.now(),
    }

    await this.addChapter(chapter)
    log('Manual chapter created:', chapter.number, chapter.title)
  }

  // Create a checkpoint (snapshot of current state)
  async createCheckpoint(name: string): Promise<Checkpoint> {
    if (!this.currentStory) throw new Error('No story loaded')

    const lastEntry = this.entries[this.entries.length - 1]
    if (!lastEntry) throw new Error('No entries to checkpoint')

    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      lastEntryId: lastEntry.id,
      lastEntryPreview: lastEntry.content.substring(0, 100),
      entryCount: this.entries.length,
      entriesSnapshot: [...this.entries],
      charactersSnapshot: [...this.characters],
      locationsSnapshot: [...this.locations],
      itemsSnapshot: [...this.items],
      storyBeatsSnapshot: [...this.storyBeats],
      chaptersSnapshot: [...this.chapters],
      timeTrackerSnapshot: this.currentStory.timeTracker
        ? { ...this.currentStory.timeTracker }
        : null,
      lorebookEntriesSnapshot: [...this.lorebookEntries],
      createdAt: Date.now(),
    }

    await database.createCheckpoint(checkpoint)
    this.checkpoints = [checkpoint, ...this.checkpoints]

    // Save current background for this checkpoint
    if (this.currentBgImage) {
      log('Saving background for checkpoint:', name)
      await database.saveBackground(
        this.currentStory.id,
        this.currentStory.currentBranchId,
        checkpoint.id,
        this.currentBgImage,
      )
    }

    log('Checkpoint created:', name)

    // Emit event
    eventBus.emit<CheckpointCreatedEvent>({
      type: 'CheckpointCreated',
      checkpointId: checkpoint.id,
      name,
    })

    return checkpoint
  }

  /**
   * @deprecated Checkpoint restoration is no longer supported.
   * Use createBranchFromCheckpoint() instead to explore alternate timelines.
   * This prevents data loss issues when restoring across branches.
   */
  async restoreCheckpoint(_checkpointId: string): Promise<void> {
    throw new Error(
      'Checkpoint restoration is no longer supported. ' +
        'To explore alternate paths, create a new branch from a checkpoint instead.',
    )
  }

  // Delete a checkpoint
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await database.deleteCheckpoint(checkpointId)
    this.checkpoints = this.checkpoints.filter((cp) => cp.id !== checkpointId)
    log('Checkpoint deleted:', checkpointId)
  }

  // ===== Branch Management =====

  /**
   * Get the current branch, or null if on the main branch (for legacy stories)
   */
  get currentBranch(): Branch | null {
    if (!this.currentStory?.currentBranchId) return null
    return this.branches.find((b) => b.id === this.currentStory!.currentBranchId) ?? null
  }

  /**
   * Create a new branch from an existing checkpoint.
   * Only entries with checkpoints can be branched from.
   */
  async createBranchFromCheckpoint(
    name: string,
    forkEntryId: string,
    checkpointId: string,
  ): Promise<Branch> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Verify the checkpoint exists in memory
    const checkpoint = this.checkpoints.find((cp) => cp.id === checkpointId)
    if (!checkpoint) {
      throw new Error('Checkpoint not found in memory')
    }

    // Verify the checkpoint matches the fork entry
    if (checkpoint.lastEntryId !== forkEntryId) {
      throw new Error('Checkpoint does not match fork entry')
    }

    // Verify all foreign key references exist in the database
    const dbCheckpoint = await database.getCheckpoint(checkpointId)
    if (!dbCheckpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found in database`)
    }

    const dbEntry = await database.getStoryEntry(forkEntryId)
    if (!dbEntry) {
      throw new Error(`Fork entry ${forkEntryId} not found in database`)
    }

    const dbStory = await database.getStory(this.currentStory.id)
    if (!dbStory) {
      throw new Error(`Story ${this.currentStory.id} not found in database`)
    }

    // Determine parent branch (current branch, or null for main)
    // IMPORTANT: Ensure it's explicitly null, not undefined
    const parentBranchId = this.currentStory.currentBranchId ?? null

    // If there's a parent branch, verify it exists
    if (parentBranchId !== null) {
      const dbParentBranch = await database.getBranch(parentBranchId)
      if (!dbParentBranch) {
        throw new Error(`Parent branch ${parentBranchId} not found in database`)
      }
    }

    // Create the branch
    const branch: Branch = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      parentBranchId,
      forkEntryId,
      checkpointId,
      createdAt: Date.now(),
    }

    await database.addBranch(branch)
    this.branches = [...this.branches, branch]

    // Inherit background from checkpoint
    const checkpointBg = await database.getBackgroundForCheckpoint(
      this.currentStory.id,
      checkpointId,
    )
    if (checkpointBg) {
      log('Inheriting background from checkpoint for new branch:', branch.name)
      await database.saveBackground(this.currentStory.id, branch.id, null, checkpointBg)
    }

    // Copy world state from checkpoint into database with the new branch_id
    // This ensures the branch has its own copy of the world state at the fork point
    if (settings.experimentalFeatures.lightweightBranches) {
      // Snapshot isolation: copy all entities from checkpoint into the new branch.
      // Each branch gets its own complete entity set for full isolation.
      log('COW branch: copying entity snapshot for branch isolation')

      // Copy characters
      for (const char of checkpoint.charactersSnapshot) {
        const branchChar: Character = {
          ...char,
          id: crypto.randomUUID(),
          branchId: branch.id,
          overridesId: null,
        }
        await database.addCharacter(branchChar)
      }

      // Copy locations — remap connection IDs to new location IDs
      const locationIdMap = new SvelteMap<string, string>()
      for (const loc of checkpoint.locationsSnapshot) {
        locationIdMap.set(loc.id, crypto.randomUUID())
      }
      for (const loc of checkpoint.locationsSnapshot) {
        const newId = locationIdMap.get(loc.id)!
        const branchLoc: Location = {
          ...loc,
          id: newId,
          branchId: branch.id,
          overridesId: null,
          connections: loc.connections.map((connId) => locationIdMap.get(connId) ?? connId),
        }
        await database.addLocation(branchLoc)
      }

      // Copy items — remap location IDs to the new branch's locations
      for (const item of checkpoint.itemsSnapshot) {
        const remappedLocation =
          item.location === 'inventory'
            ? 'inventory'
            : (locationIdMap.get(item.location) ?? item.location)
        const branchItem: Item = {
          ...item,
          id: crypto.randomUUID(),
          branchId: branch.id,
          overridesId: null,
          location: remappedLocation,
        }
        await database.addItem(branchItem)
      }

      // Copy story beats
      for (const beat of checkpoint.storyBeatsSnapshot) {
        const branchBeat: StoryBeat = {
          ...beat,
          id: crypto.randomUUID(),
          branchId: branch.id,
          overridesId: null,
        }
        await database.addStoryBeat(branchBeat)
      }

      // Copy lorebook entries
      if (checkpoint.lorebookEntriesSnapshot) {
        for (const entry of checkpoint.lorebookEntriesSnapshot) {
          const branchEntry: Entry = {
            ...entry,
            id: crypto.randomUUID(),
            branchId: branch.id,
            overridesId: null,
          }
          await database.addEntry(branchEntry)
        }
      }

      // Mark branch as snapshot-complete so loading uses direct queries (no lineage resolution)
      await database.setBranchSnapshotComplete(branch.id)
      this.branches = this.branches.map((b) =>
        b.id === branch.id ? { ...b, snapshotComplete: true } : b,
      )

      log('COW branch: entity snapshot complete', {
        characters: checkpoint.charactersSnapshot.length,
        locations: checkpoint.locationsSnapshot.length,
        items: checkpoint.itemsSnapshot.length,
        storyBeats: checkpoint.storyBeatsSnapshot.length,
        lorebookEntries: checkpoint.lorebookEntriesSnapshot?.length ?? 0,
      })

      // Create a world state snapshot at the fork point for rollback support
      if (settings.experimentalFeatures.stateTracking) {
        try {
          const snapshot: WorldStateSnapshot = {
            id: crypto.randomUUID(),
            storyId: this.currentStory.id,
            branchId: branch.id,
            entryId: forkEntryId,
            entryPosition: dbEntry.position,
            charactersSnapshot: checkpoint.charactersSnapshot,
            locationsSnapshot: checkpoint.locationsSnapshot,
            itemsSnapshot: checkpoint.itemsSnapshot,
            storyBeatsSnapshot: checkpoint.storyBeatsSnapshot,
            lorebookEntriesSnapshot: checkpoint.lorebookEntriesSnapshot,
            timeTrackerSnapshot: checkpoint.timeTrackerSnapshot ?? null,
            createdAt: Date.now(),
          }
          await database.createWorldStateSnapshot(snapshot)
          log('COW branch: created fork-point snapshot')
        } catch (error) {
          console.error('[StoryStore] Failed to create fork-point snapshot:', error)
        }
      }
    } else {
      // Legacy path: full copy of all entities from checkpoint
      log('Copying world state from checkpoint to branch:', branch.name)

      // Copy characters
      for (const char of checkpoint.charactersSnapshot) {
        const branchChar: Character = { ...char, id: crypto.randomUUID(), branchId: branch.id }
        await database.addCharacter(branchChar)
      }

      // Copy locations - need to remap connection IDs to new location IDs
      const locationIdMap = new SvelteMap<string, string>() // old ID -> new ID
      for (const loc of checkpoint.locationsSnapshot) {
        const newId = crypto.randomUUID()
        locationIdMap.set(loc.id, newId)
      }
      for (const loc of checkpoint.locationsSnapshot) {
        const newId = locationIdMap.get(loc.id)!
        const branchLoc: Location = {
          ...loc,
          id: newId,
          branchId: branch.id,
          // Remap connections to use new location IDs
          connections: loc.connections.map((connId) => locationIdMap.get(connId) ?? connId),
        }
        await database.addLocation(branchLoc)
      }

      // Copy items (remap location IDs to the new branch's locations)
      for (const item of checkpoint.itemsSnapshot) {
        const remappedLocation =
          item.location === 'inventory'
            ? 'inventory'
            : (locationIdMap.get(item.location) ?? item.location)
        const branchItem: Item = {
          ...item,
          id: crypto.randomUUID(),
          branchId: branch.id,
          location: remappedLocation,
        }
        await database.addItem(branchItem)
      }

      // Copy story beats
      for (const beat of checkpoint.storyBeatsSnapshot) {
        const branchBeat: StoryBeat = { ...beat, id: crypto.randomUUID(), branchId: branch.id }
        await database.addStoryBeat(branchBeat)
      }

      // Copy lorebook entries (if snapshot exists)
      if (checkpoint.lorebookEntriesSnapshot) {
        for (const entry of checkpoint.lorebookEntriesSnapshot) {
          const branchEntry: Entry = { ...entry, id: crypto.randomUUID(), branchId: branch.id }
          await database.addEntry(branchEntry)
        }
      }
    }

    // Switch to the new branch (skip restore since we just populated the world state)
    await this.switchBranch(branch.id, true)

    // Reload the world state from database to get the copied items into memory
    await this.reloadEntriesForCurrentBranch()

    // Restore time tracker from checkpoint
    if (checkpoint.timeTrackerSnapshot) {
      this.currentStory = {
        ...this.currentStory!,
        timeTracker: { ...checkpoint.timeTrackerSnapshot },
      }
      await database.updateStory(this.currentStory!.id, {
        timeTracker: checkpoint.timeTrackerSnapshot,
      })
      log('Time tracker restored from checkpoint:', checkpoint.timeTrackerSnapshot)
    }

    log('Branch created:', name, 'from checkpoint:', checkpointId, {
      characters: checkpoint.charactersSnapshot.length,
      locations: checkpoint.locationsSnapshot.length,
      items: checkpoint.itemsSnapshot.length,
      storyBeats: checkpoint.storyBeatsSnapshot.length,
      lorebookEntries: checkpoint.lorebookEntriesSnapshot?.length ?? 0,
    })
    return branch
  }

  private buildBranchLineage(branchId: string): Branch[] {
    const lineage: Branch[] = []
    let current: Branch | null = this.branches.find((b) => b.id === branchId) ?? null
    const visited = new SvelteSet<string>()

    while (current) {
      if (visited.has(current.id)) break
      visited.add(current.id)
      lineage.unshift(current)
      const parentId = current.parentBranchId
      if (!parentId) break
      current = this.branches.find((b) => b.id === parentId) ?? null
    }

    return lineage
  }

  private async getForkEntryPositions(
    lineage: Branch[],
  ): Promise<SvelteMap<string, number | null>> {
    const entries = await Promise.all(
      lineage.map((branch) => database.getStoryEntry(branch.forkEntryId)),
    )
    const positions = new SvelteMap<string, number | null>()
    entries.forEach((entry, index) => {
      positions.set(lineage[index].id, entry?.position ?? null)
    })
    return positions
  }

  private getCheckpointBranchId(checkpoint: Checkpoint): string | null {
    const lastEntry = checkpoint.entriesSnapshot.find((e) => e.id === checkpoint.lastEntryId)
    return lastEntry?.branchId ?? null
  }

  /**
   * Switch to a different branch.
   * This reloads entries from the database filtered by the target branch.
   * NO data is deleted - branches coexist in the database with different branch_ids.
   * @param branchId - The branch to switch to (null for main branch)
   * @param skipReload - If true, skip reloading entries (used when creating new branch from current state)
   */
  async switchBranch(branchId: string | null, skipReload: boolean = false): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Validate branch exists (if not null)
    if (branchId !== null) {
      const branch = this.branches.find((b) => b.id === branchId)
      if (!branch) throw new Error('Branch not found')
    }

    // Update story's current branch in database
    await database.setStoryCurrentBranch(this.currentStory.id, branchId)
    this.currentStory = { ...this.currentStory, currentBranchId: branchId }

    // Reload entries from database if not skipping
    // When creating a new branch, we skip because we're already at the correct state
    if (!skipReload) {
      await this.reloadEntriesForCurrentBranch()
    }

    // Invalidate caches
    this.invalidateWordCountCache()
    this.invalidateChapterCache()

    // Reload background from database for the branch
    this.currentBgImage = await database.getBackgroundForBranch(this.currentStory.id, branchId)

    // Restore suggested actions from the new branch's last narration entry
    // Without this, stale actions from the previous branch persist in the UI
    this.restoreSuggestedActionsAfterDelete()

    log('Switched to branch:', branchId ?? 'main')
  }

  /**
   * Reload entries and world state from database for the current branch.
   * World state is now persisted per-branch in the database via branch_id columns.
   * - For main branch: loads only items with null branch_id
   * - For other branches: loads inherited items (null branch_id) + branch-specific items
   */
  private async reloadEntriesForCurrentBranch(): Promise<void> {
    if (!this.currentStory) return

    const branchId = this.currentStory.currentBranchId

    if (branchId === null) {
      // Main branch: load all data with null branch_id
      const [entries, chapters, characters, locations, items, storyBeats, lorebookEntries] =
        await Promise.all([
          database.getStoryEntriesForBranch(this.currentStory.id, null),
          database.getChaptersForBranch(this.currentStory.id, null),
          database.getCharactersForBranch(this.currentStory.id, null),
          database.getLocationsForBranch(this.currentStory.id, null),
          database.getItemsForBranch(this.currentStory.id, null),
          database.getStoryBeatsForBranch(this.currentStory.id, null),
          database.getEntriesForBranch(this.currentStory.id, null),
        ])

      this.entries = entries
      this.chapters = chapters
      this.characters = characters
      this.locations = locations
      this.items = items
      this.storyBeats = storyBeats
      this.lorebookEntries = lorebookEntries

      // Filter out tombstoned entities when COW is enabled
      if (settings.experimentalFeatures.lightweightBranches) {
        this.characters = this.characters.filter((c) => !c.deleted)
        this.locations = this.locations.filter((l) => !l.deleted)
        this.items = this.items.filter((i) => !i.deleted)
        this.storyBeats = this.storyBeats.filter((b) => !b.deleted)
        this.lorebookEntries = this.lorebookEntries.filter((e) => !e.deleted)
      }
    } else {
      // Non-main branch: load entries across branch lineage (main -> ancestors -> current)
      const lineage = this.buildBranchLineage(branchId)
      if (lineage.length === 0) return

      const forkPositions = await this.getForkEntryPositions(lineage)
      const rootForkPosition = forkPositions.get(lineage[0].id)

      const inheritedEntries = await database.getStoryEntriesForBranch(
        this.currentStory.id,
        null,
        rootForkPosition ?? undefined,
      )

      const branchEntries: StoryEntry[] = []
      for (let i = 0; i < lineage.length; i++) {
        const branch = lineage[i]
        const childForkPosition =
          i < lineage.length - 1 ? forkPositions.get(lineage[i + 1].id) : undefined
        const entries = await database.getStoryEntriesForBranch(
          this.currentStory.id,
          branch.id,
          childForkPosition ?? undefined,
        )
        branchEntries.push(...entries)
      }

      this.entries = [...inheritedEntries, ...branchEntries].sort((a, b) => a.position - b.position)

      const entryPositions = new SvelteMap<string, number>()
      for (const entry of this.entries) {
        entryPositions.set(entry.id, entry.position)
      }

      const chapters: Chapter[] = []
      const mainChapters = await database.getChaptersForBranch(this.currentStory.id, null)
      if (rootForkPosition === null || rootForkPosition === undefined) {
        chapters.push(...mainChapters)
      } else {
        chapters.push(
          ...mainChapters.filter((ch) => {
            const endPosition = entryPositions.get(ch.endEntryId)
            return endPosition !== undefined && endPosition <= rootForkPosition
          }),
        )
      }

      for (let i = 0; i < lineage.length; i++) {
        const branch = lineage[i]
        const childForkPosition =
          i < lineage.length - 1 ? forkPositions.get(lineage[i + 1].id) : undefined
        const branchChapters = await database.getChaptersForBranch(this.currentStory.id, branch.id)
        if (childForkPosition === null || childForkPosition === undefined) {
          chapters.push(...branchChapters)
        } else {
          chapters.push(
            ...branchChapters.filter((ch) => {
              const endPosition = entryPositions.get(ch.endEntryId)
              return endPosition !== undefined && endPosition <= childForkPosition
            }),
          )
        }
      }

      this.chapters = chapters.sort((a, b) => a.number - b.number)

      // Load world state from database
      // COW branches use resolved loading (walks lineage), legacy branches use direct loading
      let characters: Character[]
      let locations: Location[]
      let items: Item[]
      let storyBeats: StoryBeat[]
      let lorebookEntries: Entry[]

      if (settings.experimentalFeatures.lightweightBranches) {
        const currentBranchInfo = this.branches.find((b) => b.id === branchId)
        if (currentBranchInfo?.snapshotComplete) {
          // Snapshot isolation: branch has its own complete entity set
          ;[characters, locations, items, storyBeats, lorebookEntries] = await Promise.all([
            database.getCharactersForBranch(this.currentStory.id, branchId),
            database.getLocationsForBranch(this.currentStory.id, branchId),
            database.getItemsForBranch(this.currentStory.id, branchId),
            database.getStoryBeatsForBranch(this.currentStory.id, branchId),
            database.getEntriesForBranch(this.currentStory.id, branchId),
          ])
          // Filter out tombstoned entities
          characters = characters.filter((c) => !c.deleted)
          locations = locations.filter((l) => !l.deleted)
          items = items.filter((i) => !i.deleted)
          storyBeats = storyBeats.filter((b) => !b.deleted)
          lorebookEntries = lorebookEntries.filter((e) => !e.deleted)
          log('Snapshot isolation: loaded entities for branch:', branchId, {
            characters: characters.length,
            locations: locations.length,
            items: items.length,
            storyBeats: storyBeats.length,
            lorebookEntries: lorebookEntries.length,
          })
        } else {
          // Legacy COW: resolve through lineage (pre-snapshot branches)
          ;[characters, locations, items, storyBeats, lorebookEntries] = await Promise.all([
            database.getCharactersResolved(this.currentStory.id, lineage),
            database.getLocationsResolved(this.currentStory.id, lineage),
            database.getItemsResolved(this.currentStory.id, lineage),
            database.getStoryBeatsResolved(this.currentStory.id, lineage),
            database.getLorebookEntriesResolved(this.currentStory.id, lineage),
          ])
          log('COW: Resolved world state through lineage for branch:', branchId, {
            lineageDepth: lineage.length,
            characters: characters.length,
            locations: locations.length,
            items: items.length,
            storyBeats: storyBeats.length,
            lorebookEntries: lorebookEntries.length,
          })
        }
      } else {
        // Legacy path: direct branch loading (entities were fully copied at branch creation)
        ;[characters, locations, items, storyBeats, lorebookEntries] = await Promise.all([
          database.getCharactersForBranch(this.currentStory.id, branchId),
          database.getLocationsForBranch(this.currentStory.id, branchId),
          database.getItemsForBranch(this.currentStory.id, branchId),
          database.getStoryBeatsForBranch(this.currentStory.id, branchId),
          database.getEntriesForBranch(this.currentStory.id, branchId),
        ])
      }

      this.characters = characters
      this.locations = locations
      this.items = items
      this.storyBeats = storyBeats
      this.lorebookEntries = lorebookEntries

      // Get the current branch name from lineage for logging
      const currentBranch = lineage[lineage.length - 1]
      log('Loaded world state for branch:', currentBranch?.name ?? branchId, {
        characters: characters.length,
        locations: locations.length,
        items: items.length,
        storyBeats: storyBeats.length,
        lorebookEntries: lorebookEntries.length,
      })
    }

    // Restore time tracker from the last entry's metadata
    await this.restoreTimeFromLastEntry()
  }

  /**
   * Restore time tracker from the last entry's timeEnd metadata.
   * Called after loading entries for a branch to ensure time consistency.
   */
  private async restoreTimeFromLastEntry(): Promise<void> {
    if (!this.currentStory || this.entries.length === 0) return

    const lastEntry = this.entries[this.entries.length - 1]
    const timeEnd = lastEntry.metadata?.timeEnd

    if (timeEnd && typeof timeEnd === 'object') {
      const newTime = timeEnd as TimeTracker
      // Only update if different to avoid unnecessary DB writes
      const current = this.currentStory.timeTracker
      if (
        !current ||
        current.years !== newTime.years ||
        current.days !== newTime.days ||
        current.hours !== newTime.hours ||
        current.minutes !== newTime.minutes
      ) {
        this.currentStory = { ...this.currentStory, timeTracker: newTime }
        await database.updateStory(this.currentStory.id, { timeTracker: newTime })
        log('Time tracker restored from last entry:', newTime)
      }
    }
  }

  /**
   * Rename a branch.
   */
  async renameBranch(branchId: string, newName: string): Promise<void> {
    await database.updateBranch(branchId, { name: newName })
    this.branches = this.branches.map((b) => (b.id === branchId ? { ...b, name: newName } : b))
    log('Branch renamed:', branchId, 'to', newName)
  }

  /**
   * Delete a branch.
   * Cannot delete the main branch (null), the current branch, or branches with children.
   */
  async deleteBranch(branchId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Cannot delete current branch
    if (this.currentStory.currentBranchId === branchId) {
      throw new Error('Cannot delete the current branch')
    }

    // Cannot delete branches that have child branches
    const childBranches = this.branches.filter((b) => b.parentBranchId === branchId)
    if (childBranches.length > 0) {
      const childNames = childBranches.map((b) => `"${b.name}"`).join(', ')
      throw new Error(
        `Cannot delete this branch because it has child branches: ${childNames}. ` +
          `Delete the child branches first.`,
      )
    }

    // Delete associated checkpoints first
    const checkpointsToDelete = this.checkpoints.filter(
      (checkpoint) => this.getCheckpointBranchId(checkpoint) === branchId,
    )
    await Promise.all(checkpointsToDelete.map((cp) => database.deleteCheckpoint(cp.id)))
    this.checkpoints = this.checkpoints.filter(
      (checkpoint) => this.getCheckpointBranchId(checkpoint) !== branchId,
    )

    // Delete the branch from database
    await database.deleteBranch(branchId)

    // Update in-memory state: remove deleted branch
    // Note: We already checked that there are no child branches, so no reparenting needed
    this.branches = this.branches.filter((b) => b.id !== branchId)

    log('Branch deleted:', branchId)
  }

  /**
   * Get the total entry count for a branch including inherited history.
   */
  async getBranchEntryCount(branchId: string | null): Promise<number> {
    if (!this.currentStory) return 0

    if (branchId === null) {
      const entries = await database.getStoryEntriesForBranch(this.currentStory.id, null)
      return entries.length
    }

    const lineage = this.buildBranchLineage(branchId)
    if (lineage.length === 0) return 0

    const forkPositions = await this.getForkEntryPositions(lineage)
    const rootForkPosition = forkPositions.get(lineage[0].id)

    let count = 0
    const mainEntries = await database.getStoryEntriesForBranch(
      this.currentStory.id,
      null,
      rootForkPosition ?? undefined,
    )
    count += mainEntries.length

    for (let i = 0; i < lineage.length; i++) {
      const branch = lineage[i]
      const childForkPosition =
        i < lineage.length - 1 ? forkPositions.get(lineage[i + 1].id) : undefined
      const entries = await database.getStoryEntriesForBranch(
        this.currentStory.id,
        branch.id,
        childForkPosition ?? undefined,
      )
      count += entries.length
    }

    return count
  }

  /**
   * Get the branch tree structure for UI display.
   * Returns branches organized by parent-child relationships.
   */
  getBranchTree(): { branch: Branch | null; children: Branch[] }[] {
    // Build tree starting from root (null parent = main branch children)
    const rootBranches = this.branches.filter((b) => b.parentBranchId === null)
    const tree: { branch: Branch | null; children: Branch[] }[] = []

    // Main branch (implicit)
    tree.push({
      branch: null, // null represents main branch
      children: rootBranches,
    })

    // Add all branches with their children
    for (const branch of this.branches) {
      const children = this.branches.filter((b) => b.parentBranchId === branch.id)
      tree.push({ branch, children })
    }

    return tree
  }

  /**
   * Restore story state from a retry backup.
   * Used by the "retry last message" feature to restore state before a user action
   * and allow regeneration.
   */
  async restoreFromRetryBackup(backup: {
    entries: StoryEntry[]
    characters: Character[]
    locations: Location[]
    items: Item[]
    storyBeats: StoryBeat[]
    lorebookEntries?: Entry[] // Optional - lorebook entries persist across retry operations
    embeddedImages: EmbeddedImage[]
    timeTracker?: TimeTracker | null
    entryCountBeforeAction: number
  }): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded')

    // Lock editing during retry restore to prevent race conditions
    this._isRetryInProgress = true
    log('Retry restore started - editing locked')

    try {
      // Debug: Log character visual descriptors before restore
      const currentCharDescriptors = this.characters.map((c) => ({
        name: c.name,
        visualDescriptors: c.visualDescriptors,
      }))
      const backupCharDescriptors = backup.characters.map((c) => ({
        name: c.name,
        visualDescriptors: c.visualDescriptors,
      }))
      log('RESTORE DEBUG - Before restore:', {
        currentCharDescriptors,
        backupCharDescriptors,
      })

      // Determine entries to delete (those added since the backup)
      const entriesToDelete = this.entries.filter(
        (e) => e.position >= backup.entryCountBeforeAction,
      )
      const entryIdsToDelete = entriesToDelete.map((e) => e.id)

      log('Restoring from retry backup...', {
        entriesCount: backup.entries.length,
        currentEntriesCount: this.entries.length,
        entriesToDelete: entryIdsToDelete.length,
        embeddedImagesCount: backup.embeddedImages.length,
      })

      // Restore to database (branch-aware: only delete/restore world state for current branch)
      await database.restoreRetryBackup(
        entryIdsToDelete,
        this.currentStory.id,
        this.currentStory.currentBranchId,
        backup.characters,
        backup.locations,
        backup.items,
        backup.storyBeats,
      )

      // Reload from database using branch-aware method for clean state
      await this.reloadEntriesForCurrentBranch()

      // Debug: Log what we got back from database
      const dbCharDescriptors = this.characters.map((c) => ({
        name: c.name,
        visualDescriptors: c.visualDescriptors,
      }))
      log('RESTORE DEBUG - After DB reload:', {
        dbCharDescriptors,
      })

      // Invalidate caches after state restore
      this.invalidateWordCountCache()
      this.invalidateChapterCache()

      // Debug: Verify memory state matches
      const finalCharDescriptors = this.characters.map((c) => ({
        name: c.name,
        visualDescriptors: c.visualDescriptors,
      }))
      log('RESTORE DEBUG - Final state:', {
        finalCharDescriptors,
      })

      // Restore time tracker if provided (null clears)
      await this.restoreTimeTrackerSnapshot(backup.timeTracker)

      log('Retry backup restored', {
        entries: this.entries.length,
        characters: this.characters.length,
        locations: this.locations.length,
        embeddedImages: backup.embeddedImages.length,
      })
    } finally {
      // Always unlock editing when restore completes or fails
      this._isRetryInProgress = false
      log('Retry restore completed - editing unlocked')
    }
  }

  /**
   * Lock editing during retry operations.
   * Used by persistent restore path that doesn't call restoreFromRetryBackup.
   */
  lockRetryInProgress(): void {
    this._isRetryInProgress = true
    log('Retry operation locked - editing disabled')
  }

  /**
   * Unlock editing after retry operations complete.
   * Used by persistent restore path that doesn't call restoreFromRetryBackup.
   */
  unlockRetryInProgress(): void {
    this._isRetryInProgress = false
    log('Retry operation unlocked - editing enabled')
  }

  /**
   * Restore character state fields from persistent retry snapshots.
   * Used for retry restores that don't have full state snapshots.
   */
  async restoreCharacterSnapshots(snapshots?: PersistentCharacterSnapshot[]): Promise<void> {
    log('restoreCharacterSnapshots called', {
      hasCurrentStory: !!this.currentStory,
      snapshotsCount: snapshots?.length ?? 0,
      snapshots: snapshots?.map((s) => ({ id: s.id, visualDescriptors: s.visualDescriptors })),
      currentCharacters: this.characters.map((c) => ({
        id: c.id,
        name: c.name,
        visualDescriptors: c.visualDescriptors,
      })),
    })

    if (!this.currentStory || !snapshots || snapshots.length === 0) {
      log('restoreCharacterSnapshots: early return - no story or no snapshots')
      return
    }

    const snapshotById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]))
    const updates: Array<{ id: string; updates: Partial<Character> }> = []

    for (const character of this.characters) {
      const snapshot = snapshotById.get(character.id)
      if (!snapshot) continue

      let relationship = snapshot.relationship ?? character.relationship
      if (character.relationship === 'self' && relationship !== 'self') {
        relationship = 'self'
      }

      updates.push({
        id: character.id,
        updates: {
          traits: snapshot.traits ?? [],
          status: snapshot.status ?? character.status,
          relationship,
          visualDescriptors: snapshot.visualDescriptors ?? {},
          portrait: snapshot.portrait,
          // D7 (research/31): restore metadata (runtimeVars/bodyState) when the
          // snapshot carried it. Old persisted snapshots predate the field —
          // leave current metadata alone rather than wiping it.
          ...(snapshot.metadata !== undefined ? { metadata: snapshot.metadata } : {}),
        },
      })
    }

    for (const update of updates) {
      await database.updateCharacter(update.id, update.updates)
    }

    this.characters = this.characters.map((character) => {
      const snapshot = snapshotById.get(character.id)
      if (!snapshot) return character

      let relationship = snapshot.relationship ?? character.relationship
      if (character.relationship === 'self' && relationship !== 'self') {
        relationship = 'self'
      }

      return {
        ...character,
        traits: snapshot.traits ?? character.traits,
        status: snapshot.status ?? character.status,
        relationship,
        visualDescriptors: snapshot.visualDescriptors ?? character.visualDescriptors,
        portrait: snapshot.portrait, // Use snapshot value directly (null means no portrait)
        // D7: mirror the DB restore — without this the persistent-retry path leaves
        // stale post-generation metadata (runtimeVars/bodyState) in memory, and the
        // next apply would compound on the un-rolled-back value.
        ...(snapshot.metadata !== undefined ? { metadata: snapshot.metadata } : {}),
      }
    })

    log('restoreCharacterSnapshots complete', {
      updatedCount: updates.length,
      finalCharacters: this.characters.map((c) => ({
        id: c.id,
        name: c.name,
        visualDescriptors: c.visualDescriptors,
      })),
    })
  }

  // Delete a story
  async deleteStory(storyId: string): Promise<void> {
    await database.deleteStory(storyId)
    this.allStories = this.allStories.filter((s) => s.id !== storyId)

    if (this.currentStory?.id === storyId) {
      this.clearCurrentStory()
    }
  }

  /**
   * Create a new story from wizard data.
   * This handles the full initialization from the setup wizard including
   * dynamically generated settings, protagonist, characters, and opening scene.
   */
  async createStoryFromWizard(data: {
    title: string
    genre: string
    description?: string
    mode: StoryMode
    settings: {
      pov: 'first' | 'second' | 'third'
      tense: 'past' | 'present'
      tone?: string
      themes?: string[]
      visualProseMode?: boolean
      imageGenerationMode?: 'none' | 'agentic' | 'inline'
      backgroundImagesEnabled?: boolean
      referenceMode?: boolean
    }
    protagonist: Partial<Character>
    startingLocation: Partial<Location>
    initialItems: Partial<Item>[]
    openingScene: string
    characters: Partial<Character>[]
    importedEntries?: LorebookImportExport.ImportedEntry[]
    // Translation data (optional)
    translations?: {
      language: string
      openingScene?: string
      protagonist?: {
        name?: string
        description?: string
        traits?: string[]
        visualDescriptors?: string[]
      }
      startingLocation?: { name?: string; description?: string }
      characters?: {
        [originalName: string]: {
          name?: string
          description?: string
          relationship?: string
          traits?: string[]
          visualDescriptors?: string[]
        }
      }
    }
  }): Promise<Story> {
    log('createStoryFromWizard called', {
      title: data.title,
      genre: data.genre,
      mode: data.mode,
      pov: data.settings.pov,
      visualProseMode: data.settings.visualProseMode,
      imageGenerationMode: data.settings.imageGenerationMode,
      backgroundImagesEnabled: data.settings.backgroundImagesEnabled,
      referenceMode: data.settings.referenceMode,
    })

    // Create the base story with custom system prompt stored in settings
    const storyData = await database.createStory({
      id: crypto.randomUUID(),
      title: data.title,
      description: data.description ?? null,
      genre: data.genre,
      templateId: 'wizard-generated',
      mode: data.mode,
      settings: {
        pov: data.settings.pov,
        tense: data.settings.tense,
        tone: data.settings.tone,
        themes: data.settings.themes,
        visualProseMode: data.settings.visualProseMode,
        imageGenerationMode: data.settings.imageGenerationMode,
        backgroundImagesEnabled: data.settings.backgroundImagesEnabled,
        referenceMode: data.settings.referenceMode,
      },
      memoryConfig: DEFAULT_MEMORY_CONFIG,
      retryState: null,
      styleReviewState: null,
      timeTracker: null,
      currentBranchId: null,
      currentBgImage: null,
    })

    this.allStories = [storyData, ...this.allStories]
    const storyId = storyData.id

    this.currentStory = storyData

    // Add protagonist
    if (data.protagonist.name) {
      const protagonistTranslation = data.translations?.protagonist
      const protagonist: Character = {
        id: crypto.randomUUID(),
        storyId,
        name: data.protagonist.name,
        description: data.protagonist.description ?? null,
        relationship: 'self',
        traits: data.protagonist.traits ?? [],
        status: 'active',
        metadata: { source: 'wizard' },
        visualDescriptors: data.protagonist.visualDescriptors ?? {},
        portrait: data.protagonist.portrait ?? null,
        branchId: null, // New stories start on main branch
        translatedName: protagonistTranslation?.name ?? null,
        translatedDescription: protagonistTranslation?.description ?? null,
        translatedTraits: protagonistTranslation?.traits ?? null,
        translatedVisualDescriptors: undefined, // Translations not supported for structured visual descriptors yet
        translationLanguage: protagonistTranslation ? (data.translations?.language ?? null) : null,
      }
      await database.addCharacter(protagonist)
      log('Added protagonist:', protagonist.name)
    }

    // Add starting location
    if (data.startingLocation.name) {
      const locationTranslation = data.translations?.startingLocation
      log('Starting location translation data:', {
        hasTranslations: !!data.translations,
        hasStartingLocation: !!locationTranslation,
        translatedName: locationTranslation?.name,
        translatedDesc: locationTranslation?.description?.substring(0, 50),
      })
      const location: Location = {
        id: crypto.randomUUID(),
        storyId,
        name: data.startingLocation.name,
        description: data.startingLocation.description ?? null,
        visited: true,
        current: true,
        connections: [],
        metadata: { source: 'wizard' },
        branchId: null, // New stories start on main branch
        translatedName: locationTranslation?.name ?? null,
        translatedDescription: locationTranslation?.description ?? null,
        translationLanguage: locationTranslation ? (data.translations?.language ?? null) : null,
      }
      log('Location object being stored:', {
        name: location.name,
        translatedName: location.translatedName,
        translatedDesc: location.translatedDescription?.substring(0, 50),
        translationLanguage: location.translationLanguage,
      })
      await database.addLocation(location)
      log(
        'Added starting location:',
        location.name,
        'with translation:',
        !!location.translatedDescription,
      )
    }

    // Add initial items
    for (const itemData of data.initialItems) {
      if (!itemData.name) continue
      const item: Item = {
        id: crypto.randomUUID(),
        storyId,
        name: itemData.name,
        description: itemData.description ?? null,
        quantity: itemData.quantity ?? 1,
        equipped: itemData.equipped ?? false,
        location: itemData.location ?? 'inventory',
        metadata: { source: 'wizard' },
        branchId: null, // New stories start on main branch
      }
      await database.addItem(item)
    }

    // Add supporting characters
    for (const charData of data.characters) {
      if (!charData.name) continue
      const charTranslation = data.translations?.characters?.[charData.name]
      const character: Character = {
        id: crypto.randomUUID(),
        storyId,
        name: charData.name,
        description: charData.description ?? null,
        relationship: charData.relationship ?? null,
        traits: charData.traits ?? [],
        status: 'active',
        metadata: { source: 'wizard' },
        visualDescriptors: charData.visualDescriptors ?? {},
        portrait: charData.portrait ?? null,
        branchId: null, // New stories start on main branch
        translatedName: charTranslation?.name ?? null,
        translatedDescription: charTranslation?.description ?? null,
        translatedRelationship: charTranslation?.relationship ?? null,
        translatedTraits: charTranslation?.traits ?? null,
        translatedVisualDescriptors: undefined, // Translations not supported for structured visual descriptors yet
        translationLanguage: charTranslation ? (data.translations?.language ?? null) : null,
      }
      await database.addCharacter(character)
      log('Added supporting character:', character.name)
    }

    // Add opening scene as first narration entry
    let openingEntry: StoryEntry | undefined = undefined
    if (data.openingScene) {
      const tokenCount = countTokens(data.openingScene)
      const baseTime = storyData.timeTracker ?? { years: 0, days: 0, hours: 0, minutes: 0 }
      openingEntry = await database.addStoryEntry({
        id: crypto.randomUUID(),
        storyId,
        type: 'narration',
        content: data.openingScene,
        parentId: null,
        position: 0,
        metadata: {
          source: 'wizard',
          tokenCount,
          timeStart: { ...baseTime },
          timeEnd: { ...baseTime },
        },
        branchId: null,
        translatedContent: data.translations?.openingScene ?? null,
        translationLanguage: data.translations?.openingScene
          ? (data.translations?.language ?? null)
          : null,
      })
      log('Added opening scene')
    }

    // Add imported lorebook entries
    if (data.importedEntries && data.importedEntries.length > 0) {
      const entries = LorebookImportExport.convertToEntries(data.importedEntries, 'import')
      for (const entryData of entries) {
        const entry: Entry = {
          ...entryData,
          id: crypto.randomUUID(),
          storyId,
        }
        await database.addEntry(entry)
      }
      log('Added imported entries:', data.importedEntries.length)
    }

    // Generate background image from opening scene
    if (data.openingScene && openingEntry && storyData.settings?.backgroundImagesEnabled) {
      aiService.analyzeBackgroundChangeAndGenerateImage(
        storyId,
        [openingEntry],
        this.updateCurrentBackgroundImage.bind(this),
      )
      log('Generated background image')
    }

    // Emit event
    eventBus.emit<StoryCreatedEvent>({ type: 'StoryCreated', storyId, mode: data.mode })

    log('Story created from wizard:', storyId)
    return storyData
  }
}

export const story = new StoryStore()
