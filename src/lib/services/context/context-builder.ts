/**
 * ContextBuilder
 *
 * Flat variable store + template renderer. Services add variables
 * via .add(), then render templates via .render(). Variables accumulate
 * across services -- all templates can access all variables.
 *
 * External templates (image styles, lorebook tools) don't use ContextBuilder.
 * Services fetch those directly from the pack and inject data programmatically.
 */

import { database } from '$lib/services/database'
import { templateEngine } from '$lib/services/templates/engine'
import { createLogger } from '$lib/log'
import {
  buildBeGenreRules,
  bondOf,
  buildBeStateBlock,
  buildHaremStateBlock,
  dependenceOf,
  lactationOf,
  readBodyState,
  selectScenePresent,
  type BeStateEntry,
  growthGateRequired,
  beStoryConfigFromSettings,
  previewActGrowth,
  coerceEffectTags,
} from '$lib/services/be'
import {
  buildCheckTaggingInstruction,
  buildGatedActionsInstruction,
  buildPlayerSheetBlock,
  buildPlayerSheetSummary,
  sheetOrDefault,
  type GateInput,
} from '$lib/services/rpg'
import type { RenderResult } from './types'
import type {
  Branch,
  Character,
  Entry,
  Location,
  Item,
  StoryBeat,
  Story,
  StoryEntry,
} from '$lib/types'
import type { RuntimeVariable, RuntimeVarsMap } from '$lib/services/packs/types'

const log = createLogger('ContextBuilder')

/**
 * Raw entries pulled for the BE scene-presence read. A turn is roughly one user
 * action plus one narration, so this comfortably covers the presence lookback
 * (10 narration entries) without loading the whole story.
 */
const BE_PRESENCE_ENTRY_FETCH = 30

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Length guidance text for the story templates' Format section (research/59
 * step 2). 'medium' preserves each mode's legacy hardcoded wording so stories
 * with unset settings render an unchanged prompt. Narrative-template-only, so
 * NarrativeService.buildPrompts adds it (matching contentGuidelines), not
 * forStory — that also keeps the no-story fallback path covered.
 */
export function responseLengthGuidance(
  length: 'short' | 'medium' | 'long' | undefined,
  mode: string,
): string {
  if (mode === 'creative-writing') {
    switch (length) {
      case 'short':
        return 'Around 250 words per response'
      case 'long':
        return '600-900 words per response'
      default:
        return 'Up to 500 words per response'
    }
  }
  switch (length) {
    case 'short':
      return 'Around 150 words per response'
    case 'long':
      return '400-600 words per response, across 4-8 paragraphs'
    default:
      return 'Around 250 words per response'
  }
}

/**
 * Candidate names the pending user action names outright, case-insensitively
 * and on word boundaries (so "Mira" does not match "Miranda's letter").
 */
function namesMentionedIn(text: string, candidates: ReadonlyArray<{ name: string }>): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  return candidates
    .filter((c) => c.name.trim().length > 0)
    .filter((c) => new RegExp(`\\b${escapeRegExp(c.name.trim())}\\b`, 'i').test(trimmed))
    .map((c) => c.name)
}

export class ContextBuilder {
  private context: Record<string, any> = {}
  private packId: string = 'default-pack'

  constructor(packId?: string) {
    if (packId) this.packId = packId
  }

  /**
   * Convenience factory: create a ContextBuilder pre-populated from a story.
   * Loads story settings, protagonist, location, time, and pack custom variables.
   *
   * `actionText` is THIS turn's pending user action. It is optional (every
   * service prompt but the narrative one has none) and only feeds scene
   * presence: a character the player addresses by name is in the scene now,
   * even though the previous narration's presence list predates her return.
   */
  static async forStory(
    storyId: string,
    packIdOverride?: string,
    actionText: string = '',
  ): Promise<ContextBuilder> {
    const story = await database.getStory(storyId)
    if (!story) {
      log('forStory: story not found', { storyId })
      return new ContextBuilder()
    }

    const packId = packIdOverride || (await database.getStoryPackId(storyId)) || 'default-pack'
    const builder = new ContextBuilder(packId)

    // Load story data into context
    builder.add({
      mode: story.mode || 'adventure',
      pov: story.settings?.pov || 'second',
      tense: story.settings?.tense || 'present',
      genre: story.genre || '',
      tone: story.settings?.tone || '',
      themes: story.settings?.themes?.join(', ') || '',
      settingDescription: story.description || '',
      visualProseMode: story.settings?.visualProseMode || false,
      inlineImageMode: story.settings?.imageGenerationMode === 'inline',
      contentRating: story.settings?.contentRating || 'standard',
    })

    // Protagonist
    const characters = await database.getCharacters(storyId)
    const protagonist = characters.find((c) => c.relationship === 'self')
    builder.add({
      protagonistName: protagonist?.name || 'the protagonist',
      protagonistDescription: protagonist?.description || '',
    })

    // Current location
    const locations = await database.getLocations(storyId)
    const currentLocation = locations.find((l) => l.current)
    builder.add({ currentLocation: currentLocation?.name || '' })

    // Story time
    if (story.timeTracker) {
      const t = story.timeTracker
      builder.add({
        storyTime: `Year ${t.years + 1}, Day ${t.days + 1}, ${t.hours} hours ${t.minutes} minutes`,
      })
    }

    // Pack custom variable defaults
    await builder.loadCustomVariables()

    // Override pack variable defaults with story-specific values
    const storyVarValues = await database.getStoryCustomVariables(story.id)
    if (storyVarValues) {
      builder.add(storyVarValues)
    }

    // Runtime variable values from entities
    const items = await database.getItems(storyId)
    const storyBeats = await database.getStoryBeats(storyId)
    await builder.loadRuntimeVariableContext(characters, locations, items, storyBeats, protagonist)

    // BE engine: the body-state narrative block (empty string for non-BE stories)
    await builder.loadBeStateContext(story, characters, protagonist, actionText)
    // BE engine: the static genre-rules pack (research/41 precedence contract)
    builder.loadBeGenreRules(story)
    // RPG layer: player sheet block + service summaries (empty strings when off).
    // Spell entries resolve knownSpells ids → display names for the sheet block.
    // Only fetched when the protagonist actually knows spells — a non-caster
    // (the common case) skips the per-turn read entirely.
    const hasSpells =
      story.settings?.beMode === true &&
      !!protagonist &&
      sheetOrDefault(protagonist.metadata).knownSpells.length > 0
    const spellEntries = hasSpells
      ? (await database.getEntries(storyId)).filter((e) => e.type === 'spell')
      : []
    builder.loadRpgSheetContext(story, protagonist ?? null, characters, spellEntries)

    log('forStory complete', {
      storyId,
      packId,
      contextKeys: Object.keys(builder.context).length,
      storyVarOverrides: storyVarValues ? Object.keys(storyVarValues).length : 0,
    })
    return builder
  }

  /**
   * Merge variables into context. Returns this for chaining.
   */
  add(data: Record<string, any>): this {
    Object.assign(this.context, data)
    return this
  }

  /**
   * Render a template from the active pack through LiquidJS.
   */
  async render(templateId: string): Promise<RenderResult> {
    log('render', { templateId, packId: this.packId })

    const systemTemplate = await database.getPackTemplate(this.packId, templateId)
    if (!systemTemplate) {
      log('WARNING: system template not found', { templateId, packId: this.packId })
    }
    const userTemplate = await database.getPackTemplate(this.packId, `${templateId}-user`)
    if (!userTemplate) {
      log('WARNING: user template not found', {
        templateId: `${templateId}-user`,
        packId: this.packId,
      })
    }

    const systemResult = systemTemplate?.content
      ? templateEngine.render(systemTemplate.content, this.context)
      : ''
    if (systemResult === null) {
      log('ERROR: system template render failed, using raw content', { templateId })
    }
    const userResult = userTemplate?.content
      ? templateEngine.render(userTemplate.content, this.context)
      : ''
    if (userResult === null) {
      log('ERROR: user template render failed, using raw content', { templateId })
    }

    return {
      system: systemResult ?? systemTemplate?.content ?? '',
      user: userResult ?? userTemplate?.content ?? '',
    }
  }

  /**
   * Get a copy of the current context. Useful for debugging.
   */
  getContext(): Record<string, any> {
    return { ...this.context }
  }

  /**
   * Get the active pack ID.
   */
  getPackId(): string {
    return this.packId
  }

  /**
   * Load custom variable defaults from the active pack.
   * Only sets variables not already in context.
   */
  private async loadCustomVariables(): Promise<void> {
    try {
      const variables = await database.getPackVariables(this.packId)
      for (const v of variables) {
        if (!(v.variableName in this.context)) {
          this.context[v.variableName] = v.defaultValue ?? ''
        }
      }
    } catch (error) {
      log('loadCustomVariables failed', { packId: this.packId, error })
    }
  }

  /**
   * Build the `beStateBlock` context variable for BE-mode stories: engine-tracked
   * body state rendered as the authoritative narrative block (be/context.ts owns
   * the wording). Empty string when beMode is off or nothing carries bodyState.
   *
   * Scoped to the current scene: a full body-state block for every tracked girl
   * in the story — including ones nowhere near the scene — was pure token bloat.
   * Presence comes from the classifier signal already persisted on narration
   * entries (be/presence.ts); when it can't be read, everyone is included.
   */
  private async loadBeStateContext(
    story: Story,
    characters: Character[],
    protagonist?: Character,
    actionText: string = '',
  ): Promise<void> {
    try {
      let beStateBlock = ''
      if (story.settings?.beMode === true) {
        // Cosmology stories (research/66 §magnitude): tell the narrator, per
        // girl, exactly what the act grows her by THIS scene — the same numbers
        // the reducer will apply if the classifier's trigger verifies.
        const gateRequired = growthGateRequired(story.settings)
        const beConfig = gateRequired ? beStoryConfigFromSettings(story.settings) : null
        const entries: BeStateEntry[] = []
        for (const character of characters) {
          const state = readBodyState(character.metadata)
          if (!state) continue
          if (beConfig && character.relationship !== 'self') {
            // ONE derivation with the reducer (previewActGrowth) — the same cm,
            // tiers and mode the act will apply. A locked girl gets no line: her
            // SIZE LOCKED line already says it all (the act is muzzled).
            const act = previewActGrowth(beConfig, state)
            entries.push({
              name: character.name,
              state,
              ...(act.mode === 'locked'
                ? {}
                : {
                    actGrowth: {
                      cm: act.cm,
                      tierAfter: act.tierAfter,
                      bankedCm: act.bankedCm,
                      mode: act.mode,
                    },
                  }),
            })
          } else {
            entries.push({ name: character.name, state })
          }
        }
        const onBranch = await this.loadPresenceEntries(story)
        // The PC is always in her own scene; so is anyone the player just named
        // in her action — presence otherwise comes from the PREVIOUS narration,
        // so a girl re-entering the scene would lose her [BODY STATE] block on
        // the exact turn she is addressed.
        const scoped = selectScenePresent(entries, onBranch, {
          alwaysInclude: [
            ...(protagonist ? [protagonist.name] : []),
            ...namesMentionedIn(actionText, entries),
          ],
        })
        // [HAREM STATE] concatenates AFTER [BODY STATE] (research/48 R9): no
        // template edit, and the cache prefix stays byte-identical.
        beStateBlock = [buildBeStateBlock(scoped), buildHaremStateBlock(scoped)]
          .filter(Boolean)
          .join('\n\n')
      }
      this.add({ beStateBlock })
    } catch (error) {
      log('loadBeStateContext failed', { error })
      this.add({ beStateBlock: '' })
    }
  }

  /**
   * Recent entries that actually happened in THIS branch's scene, oldest first.
   *
   * Branches share one position space, so the raw recent-entry fetch mixes in
   * sibling-branch narration — presence for a scene that never happened here.
   * This resolves the branch lineage the way reloadEntriesForCurrentBranch
   * does: an ancestor's (or main's) entries count only up to the position its
   * child forked at, and only lineage branches count at all.
   */
  private async loadPresenceEntries(story: Story): Promise<StoryEntry[]> {
    const recent = await database.getRecentStoryEntries(story.id, BE_PRESENCE_ENTRY_FETCH)
    const branchId = story.currentBranchId ?? null
    if (branchId === null) return recent.filter((e) => e.branchId === null)

    const branches = await database.getBranches(story.id)
    const lineage: Branch[] = []
    const visited = new Set<string>()
    let current = branches.find((b) => b.id === branchId) ?? null
    while (current) {
      if (visited.has(current.id)) break
      visited.add(current.id)
      lineage.unshift(current)
      const parentId: string | null = current.parentBranchId
      current = parentId ? (branches.find((b) => b.id === parentId) ?? null) : null
    }
    // Unknown branch record: keep only entries this branch owns rather than
    // guessing at inheritance — an over-narrow presence list degrades to
    // "include everyone", an over-wide one narrates the wrong scene.
    if (lineage.length === 0) return recent.filter((e) => e.branchId === branchId)

    const forkEntries = await Promise.all(
      lineage.map((branch) => database.getStoryEntry(branch.forkEntryId)),
    )
    // Position cap per lineage member: everything before the point its child
    // diverged. The current branch (last) is uncapped.
    const capByBranchId = new Map<string | null, number | undefined>()
    capByBranchId.set(null, forkEntries[0]?.position)
    lineage.forEach((branch, i) => {
      capByBranchId.set(
        branch.id,
        i < lineage.length - 1 ? forkEntries[i + 1]?.position : undefined,
      )
    })

    return recent.filter((entry) => {
      if (!capByBranchId.has(entry.branchId)) return false
      const cap = capByBranchId.get(entry.branchId)
      return cap === undefined || entry.position <= cap
    })
  }

  /**
   * Build the `beGenreRules` context variable: the static BE narration contract
   * (growth-authorization precedence, render scaffold), with per-story cosmology
   * and pacing interpolated. Empty string when beMode is off.
   */
  private loadBeGenreRules(story: Story): void {
    try {
      const settings = story.settings
      const beGenreRules =
        settings?.beMode === true
          ? buildBeGenreRules({
              growthCosmology: settings.beGrowthCosmology,
              pacingFlavor: settings.bePacingFlavor,
            })
          : ''
      this.add({ beGenreRules })
    } catch (error) {
      log('loadBeGenreRules failed', { error })
      this.add({ beGenreRules: '' })
    }
  }

  /**
   * RPG layer (research/47 Step 7): `playerSheetBlock` for the narrative system
   * prompt plus `playerSheetSummary`/`checkTaggingInstruction` for service
   * templates (action choices, risk assess). All empty strings when beMode is
   * off or there is no protagonist. A BE story whose protagonist has no stored
   * sheet yet renders the deterministic default — the layer works from turn 1.
   */
  private loadRpgSheetContext(
    story: Story,
    protagonist: Character | null,
    characters: Character[] = [],
    spellEntries: Entry[] = [],
  ): void {
    try {
      let playerSheetBlock = ''
      let playerSheetSummary = ''
      let checkTaggingInstruction = ''
      if (story.settings?.beMode === true && protagonist) {
        const sheet = sheetOrDefault(protagonist.metadata)
        // Resolve knownSpells ids → compact display strings (name · school · cost),
        // preserving learn order; a stale id (entry deleted) is silently skipped.
        const spellById = new Map(spellEntries.map((e) => [e.id, e]))
        // Absolute growth rule (research/66): in a cosmology story growth spells
        // are not offered — growth comes only from the act (casts bank into it).
        const offerGrowth = !growthGateRequired(story.settings)
        const knownSpellDisplays = sheet.knownSpells.flatMap((id) => {
          const entry = spellById.get(id)
          if (!entry || entry.state.type !== 'spell') return []
          // Pure-growth spells are not offered; a mixed spell (growth + a
          // condition, say) stays listed — its other effects are still real
          // and its growth half banks into her next act.
          if (!offerGrowth) {
            const effects = coerceEffectTags(entry.state.effects)
            if (effects.length > 0 && effects.every((effect) => effect.kind === 'growth')) return []
          }
          return [`${entry.name} (${entry.state.school}, ⬡${entry.state.essenceCost})`]
        })
        playerSheetBlock = buildPlayerSheetBlock(
          sheet,
          protagonist.name,
          knownSpellDisplays,
          story.settings?.rpgTitles === true,
        )
        playerSheetSummary = buildPlayerSheetSummary(sheet)
        // Gated interactions (research/48 Step 8) append into the SAME var
        // (R9: no template edits).
        const gateInputs: GateInput[] = []
        for (const character of characters) {
          if (character.relationship === 'self') continue
          const state = readBodyState(character.metadata)
          if (!state) continue
          // Lactation gates (research/49 Step 4) read the same block the
          // reducer writes — offers and engine state can never disagree.
          const lactation = lactationOf(state)
          gateInputs.push({
            name: character.name,
            bond: bondOf(state),
            dependence: dependenceOf(state),
            quirks: state.quirks ?? [],
            lactationActive: lactation?.active === true,
            supplyTier: lactation?.supplyTier ?? 0,
          })
        }
        checkTaggingInstruction = [
          buildCheckTaggingInstruction(
            sheet,
            story.settings?.rpgCheckTaggingRate === 'frequent' ? 'frequent' : 'sparing',
            { offerGrowth },
          ),
          buildGatedActionsInstruction(gateInputs),
        ]
          .filter(Boolean)
          .join('\n\n')
      }
      this.add({ playerSheetBlock, playerSheetSummary, checkTaggingInstruction })
    } catch (error) {
      log('loadRpgSheetContext failed', { error })
      this.add({ playerSheetBlock: '', playerSheetSummary: '', checkTaggingInstruction: '' })
    }
  }

  /**
   * Load runtime variable values from story entities and add formatted text blocks
   * to the context. Each entity type gets a separate variable:
   *   runtimeVars_characters, runtimeVars_locations, runtimeVars_items,
   *   runtimeVars_storyBeats, runtimeVars_protagonist
   *
   * Format per entity: "EntityName: VarLabel = value, VarLabel = value"
   * Empty string when no runtime variables are defined or no values exist.
   */
  private async loadRuntimeVariableContext(
    characters: Character[],
    locations: Location[],
    items: Item[],
    storyBeats: StoryBeat[],
    protagonist: Character | undefined,
  ): Promise<void> {
    try {
      const defs = await database.getRuntimeVariables(this.packId)
      if (defs.length === 0) {
        this.add({
          runtimeVars_characters: '',
          runtimeVars_locations: '',
          runtimeVars_items: '',
          runtimeVars_storyBeats: '',
          runtimeVars_protagonist: '',
        })
        return
      }

      // Group definitions by entity type for fast lookup
      const defsByType: Record<string, RuntimeVariable[]> = {}
      for (const d of defs) {
        if (!defsByType[d.entityType]) defsByType[d.entityType] = []
        defsByType[d.entityType].push(d)
      }

      const formatEntities = (
        entities: Array<{ name: string; metadata: Record<string, unknown> | null }>,
        entityType: string,
      ): string => {
        const typeDefs = defsByType[entityType]
        if (!typeDefs || typeDefs.length === 0) return ''

        const lines: string[] = []
        for (const entity of entities) {
          const runtimeVars = (entity.metadata as Record<string, unknown> | null)?.runtimeVars as
            | RuntimeVarsMap
            | undefined
          if (!runtimeVars) continue

          const pairs: string[] = []
          for (const def of typeDefs) {
            const entry = runtimeVars[def.id]
            if (entry && entry.v != null && entry.v !== '') {
              pairs.push(`${def.displayName} = ${entry.v}`)
            }
          }
          if (pairs.length > 0) {
            lines.push(`${entity.name}: ${pairs.join(', ')}`)
          }
        }
        return lines.join('\n')
      }

      // Format entity name helper for story beats (uses title instead of name)
      const beatsWithName = storyBeats.map((b) => ({
        name: b.title,
        metadata: b.metadata,
      }))

      const runtimeVarsCharacters = formatEntities(characters, 'character')
      const runtimeVarsLocations = formatEntities(locations, 'location')
      const runtimeVarsItems = formatEntities(items, 'item')
      const runtimeVarsStoryBeats = formatEntities(beatsWithName, 'story_beat')

      // Protagonist-specific: filter to just the protagonist
      let runtimeVarsProtagonist = ''
      if (protagonist) {
        runtimeVarsProtagonist = formatEntities([protagonist], 'character')
      }

      this.add({
        runtimeVars_characters: runtimeVarsCharacters,
        runtimeVars_locations: runtimeVarsLocations,
        runtimeVars_items: runtimeVarsItems,
        runtimeVars_storyBeats: runtimeVarsStoryBeats,
        runtimeVars_protagonist: runtimeVarsProtagonist,
      })

      log('loadRuntimeVariableContext', {
        packId: this.packId,
        defCount: defs.length,
        hasCharVars: runtimeVarsCharacters.length > 0,
        hasLocVars: runtimeVarsLocations.length > 0,
        hasItemVars: runtimeVarsItems.length > 0,
        hasBeatVars: runtimeVarsStoryBeats.length > 0,
        hasProtagonistVars: runtimeVarsProtagonist.length > 0,
      })
    } catch (error) {
      log('loadRuntimeVariableContext failed', { packId: this.packId, error })
      this.add({
        runtimeVars_characters: '',
        runtimeVars_locations: '',
        runtimeVars_items: '',
        runtimeVars_storyBeats: '',
        runtimeVars_protagonist: '',
      })
    }
  }
}
