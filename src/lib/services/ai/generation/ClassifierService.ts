import { generateStructured } from '../sdk/generate'
/**
 * Classifier Service
 *
 * Extracts world state from narrative responses (characters, locations, items, story beats).
 * Uses the Vercel AI SDK for structured output with Zod schema validation.
 *
 * NOTE: For classifier output types (CharacterUpdate, NewCharacter, etc.),
 * import directly from '$lib/services/ai/sdk/schemas/classifier'.
 *
 * Prompt generation flows through ContextBuilder + Liquid templates.
 */

import type {
  Story,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  TimeTracker,
} from '$lib/types'
import { BaseAIService } from '../BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import { database } from '$lib/services/database'
import { createLogger } from '$lib/log'
import { stripPicTags } from '$lib/utils/inlineImageParser'
import { stripThoughtTags } from '$lib/utils/thoughtTagParser'
import {
  classificationResultSchema,
  clampNumber,
  type ClassificationResult,
} from '../sdk/schemas/classifier'
import { buildExtendedClassificationSchema } from '../sdk/schemas/runtime-variables'
import { buildBeEventInstructions, extendClassificationSchemaWithBeEvents } from '$lib/services/be'
import {
  buildAgendaInstructions,
  buildChekhovInstructions,
  buildGmNotesInstructions,
  extendClassificationSchemaWithAgendas,
  extendClassificationSchemaWithChekhov,
  extendClassificationSchemaWithGmNotes,
  findSelfCharacter,
  readChekhovState,
  readGmNotebook,
} from '$lib/services/worldsim'
import type { RuntimeVariable, RuntimeEntityType } from '$lib/services/packs/types'
import {
  buildTitlesInstructions,
  extendClassificationSchemaWithTitles,
  sheetOrDefault,
  sheetTitles,
} from '$lib/services/rpg'
import { boundClassifierExtensionArrays } from './classifier-bounds'
import { guardClassifierEntities, knownEntityNames } from './classifier-entity-guards'

const log = createLogger('Classifier')

/**
 * Context for classification.
 */
export interface ClassificationContext {
  storyId: string
  story: Story
  narrativeResponse: string
  userAction: string
  existingCharacters: Character[]
  existingLocations: Location[]
  existingItems: Item[]
  existingStoryBeats: StoryBeat[]
}

/**
 * Service that classifies narrative responses to extract world state changes.
 */
export class ClassifierService extends BaseAIService {
  private chatHistoryTruncation: number

  constructor(serviceId: string, chatHistoryTruncation: number = 100) {
    super(serviceId)
    this.chatHistoryTruncation = chatHistoryTruncation
  }

  /**
   * Classify a narrative response to extract world state changes.
   * When the story's pack defines runtime variables, the schema is dynamically
   * extended to include inline runtime variable extraction in the same LLM pass.
   */
  async classify(
    context: ClassificationContext,
    visibleEntries?: StoryEntry[],
    currentStoryTime?: TimeTracker | null,
  ): Promise<ClassificationResult> {
    log('classify', {
      narrativeLength: context.narrativeResponse.length,
      existingCharacters: context.existingCharacters.length,
      existingLocations: context.existingLocations.length,
      existingItems: context.existingItems.length,
      existingStoryBeats: context.existingStoryBeats.length,
    })

    const mode = context.story.mode ?? 'adventure'

    // Load runtime variable definitions for the story's pack (if any)
    let runtimeVars: RuntimeVariable[] = []
    let runtimeVarsByType: Record<string, RuntimeVariable[]> = {}
    const packId = await database.getStoryPackId(context.storyId)
    if (packId) {
      runtimeVars = await database.getRuntimeVariables(packId)
      runtimeVarsByType = this.groupByEntityType(runtimeVars)
    }

    // Build the schema: extended with inline vars if runtime variables exist, else base
    let schema =
      runtimeVars.length > 0
        ? buildExtendedClassificationSchema(runtimeVarsByType)
        : classificationResultSchema

    // BE stories additionally extract transformation events (schema-extension only —
    // ad-hoc fields would be stripped by Zod)
    const beMode = context.story.settings?.beMode === true
    if (beMode) {
      const extended = extendClassificationSchemaWithBeEvents(schema)
      if (extended === schema) {
        log('WARNING: beEvents schema extension no-op — BE extraction disabled this turn')
      }
      schema = extended
    }

    // Agenda stories additionally extract off-screen goal proposals (research/61,
    // same schema-extension contract as beEvents).
    const agendaMode = context.story.settings?.npcAgendas === true
    if (agendaMode) {
      const extended = extendClassificationSchemaWithAgendas(schema)
      if (extended === schema) {
        log(
          'WARNING: agendaProposals schema extension no-op — agenda extraction disabled this turn',
        )
      }
      schema = extended
    }

    // Chekhov stories additionally observe narrative debt: new setups and
    // paid-off ones (research/62, same schema-extension contract). The active
    // bullet list lives on the SELF character's metadata and renders into the
    // instructions so resolutions can reference real ids. No protagonist ⇒
    // the whole engine is inert — including this extension: the store pass
    // would drop the output unread, so extending would only spend tokens
    // (review lens 3).
    const chekhovSelf =
      context.story.settings?.chekhovGun === true
        ? findSelfCharacter(context.existingCharacters)
        : null
    const chekhovMode = chekhovSelf !== null
    let chekhovBullets: ReturnType<typeof readChekhovState> = null
    if (chekhovMode) {
      chekhovBullets = readChekhovState(chekhovSelf.metadata)
      const extended = extendClassificationSchemaWithChekhov(schema)
      if (extended === schema) {
        log('WARNING: narrativeDebt schema extension no-op — chekhov extraction disabled this turn')
      }
      schema = extended
    }

    // E5 GM's Notebook (research/65): same host rule and extension contract
    // as chekhov — the active notes render so drops can name real ids.
    const notebookSelf =
      context.story.settings?.gmNotebook === true
        ? findSelfCharacter(context.existingCharacters)
        : null
    const notebookMode = notebookSelf !== null
    let notebookNotes: ReturnType<typeof readGmNotebook> = null
    if (notebookMode) {
      notebookNotes = readGmNotebook(notebookSelf.metadata)
      const extended = extendClassificationSchemaWithGmNotes(schema)
      if (extended === schema) {
        log('WARNING: gmNotes schema extension no-op — notebook extraction disabled this turn')
      }
      schema = extended
    }

    // E7 earned titles (research/65): needs the RPG sheet, which only the BE
    // story turn writes — so the extension is gated on beMode too.
    const titlesSelf =
      context.story.settings?.rpgTitles === true && context.story.settings?.beMode === true
        ? findSelfCharacter(context.existingCharacters)
        : null
    const titlesMode = titlesSelf !== null
    if (titlesMode) {
      const extended = extendClassificationSchemaWithTitles(schema)
      if (extended === schema) {
        log('WARNING: titlesEarned schema extension no-op — title extraction disabled this turn')
      }
      schema = extended
    }

    // Format existing entities for the prompt
    const existingCharacters = this.formatExistingCharacters(context.existingCharacters)
    const existingLocations = context.existingLocations.map((l) => l.name).join(', ') || '(none)'
    const existingItems = context.existingItems.map((i) => i.name).join(', ') || '(none)'
    const existingBeats = this.formatExistingBeats(context.existingStoryBeats)

    // Build chat history block if entries provided
    const chatHistoryBlock = visibleEntries
      ? this.buildChatHistoryBlock(visibleEntries, currentStoryTime)
      : ''

    // Build time info
    const currentTimeInfo = currentStoryTime
      ? `Current story time: Year ${currentStoryTime.years}, Day ${currentStoryTime.days}, ${String(currentStoryTime.hours).padStart(2, '0')}:${String(currentStoryTime.minutes).padStart(2, '0')}`
      : ''

    // Build custom variable instructions for the prompt. BE event instructions
    // piggyback on the same template slot, so no classifier-template edit is needed.
    const customVariableInstructions = [
      runtimeVars.length > 0 ? this.buildCustomVarInstructions(runtimeVarsByType) : '',
      beMode ? buildBeEventInstructions(context.story.settings?.beGrowthCosmology) : '',
      agendaMode ? buildAgendaInstructions() : '',
      chekhovMode ? buildChekhovInstructions(chekhovBullets?.bullets ?? []) : '',
      notebookMode ? buildGmNotesInstructions(notebookNotes?.notes ?? []) : '',
      titlesMode ? buildTitlesInstructions(sheetTitles(sheetOrDefault(titlesSelf.metadata))) : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    // Create ContextBuilder from story -- auto-populates mode, pov, tense, genre, etc.
    const ctx = await ContextBuilder.forStory(context.storyId)

    // Add all runtime variables explicitly via ctx.add()
    ctx.add({
      genre: context.story.genre ? `Genre: ${context.story.genre}` : '',
      mode,
      entityCounts: `${context.existingCharacters.length} characters, ${context.existingLocations.length} locations, ${context.existingItems.length} items`,
      currentTimeInfo,
      chatHistoryBlock,
      inputLabel: mode === 'creative-writing' ? 'Author Direction' : 'Player Action',
      userAction: stripThoughtTags(stripPicTags(context.userAction)),
      narrativeResponse: stripThoughtTags(stripPicTags(context.narrativeResponse)),
      existingCharacters,
      existingLocations,
      existingItems,
      existingBeats,
      storyBeatTypes: 'milestone, quest, revelation, event, plot_point',
      itemLocationOptions: 'inventory, worn, ground, or specific location name',
      defaultItemLocation: 'inventory',
      sceneLocationDesc: 'Name of current location if identifiable, null otherwise',
      customVariableInstructions,
    })

    // Render through the classifier template
    const { system, user: prompt } = await ctx.render('classifier')

    try {
      const rawResult = (await generateStructured(
        {
          presetId: this.presetId,
          schema,
          system,
          prompt,
        },
        'classifier',
      )) as ClassificationResult

      const bound = boundClassifierExtensionArrays(rawResult as unknown as Record<string, unknown>)
      if (Object.keys(bound.overflow).length > 0) {
        log(
          'extension arrays over engine caps — extractors keep the first valid cap-N',
          bound.overflow,
        )
      }
      // Entity-routing plausibility guard (research/63): a provider that fills
      // the JSON by position parses cleanly yet routes quests into characters and
      // time words into currentLocationName. Drop those here so the persisted
      // delta and the image/translation consumers only ever see accepted
      // entities; applyClassificationResult re-runs the same (idempotent) guard.
      const guarded = guardClassifierEntities(
        bound.result as unknown as ClassificationResult,
        knownEntityNames({
          characters: context.existingCharacters,
          locations: context.existingLocations,
          items: context.existingItems,
          storyBeats: context.existingStoryBeats,
        }),
      )
      if (guarded.rejects.length > 0) {
        log('entity guard dropped implausibly-routed entities', guarded.rejects)
      }
      const result = guarded.result

      // Post-process: clamp number values to min/max constraints
      if (runtimeVars.length > 0) {
        this.clampRuntimeVarNumbers(result, runtimeVarsByType)
      }

      // Attach runtime variable definitions for use by applyClassificationResult
      if (runtimeVars.length > 0) {
        result._runtimeVarDefs = runtimeVars
      }

      log('classify complete', {
        beEvents: beMode ? (result.beEvents?.length ?? 0) : undefined,
        characterUpdates: result.entryUpdates.characterUpdates.length,
        newCharacters: result.entryUpdates.newCharacters.length,
        locationUpdates: result.entryUpdates.locationUpdates.length,
        newLocations: result.entryUpdates.newLocations.length,
        itemUpdates: result.entryUpdates.itemUpdates.length,
        newItems: result.entryUpdates.newItems.length,
        storyBeatUpdates: result.entryUpdates.storyBeatUpdates.length,
        newStoryBeats: result.entryUpdates.newStoryBeats.length,
        timeProgression: result.scene.timeProgression,
        hasRuntimeVars: runtimeVars.length > 0,
      })

      return result
    } catch (error) {
      log('classify failed', error)
      // Return empty result on failure
      return {
        entryUpdates: {
          characterUpdates: [],
          locationUpdates: [],
          itemUpdates: [],
          storyBeatUpdates: [],
          newCharacters: [],
          newLocations: [],
          newItems: [],
          newStoryBeats: [],
        },
        scene: {
          currentLocationName: null,
          presentCharacterNames: [],
          timeProgression: 'none',
        },
      }
    }
  }

  /**
   * Group runtime variables by entity type.
   */
  private groupByEntityType(vars: RuntimeVariable[]): Record<string, RuntimeVariable[]> {
    return vars.reduce(
      (acc, v) => {
        if (!acc[v.entityType]) acc[v.entityType] = []
        acc[v.entityType].push(v)
        return acc
      },
      {} as Record<string, RuntimeVariable[]>,
    )
  }

  /**
   * Build the prompt instruction block describing custom variables to track.
   * Grouped by entity type for clarity.
   */
  private buildCustomVarInstructions(varsByType: Record<string, RuntimeVariable[]>): string {
    const ENTITY_TYPE_LABELS: Record<RuntimeEntityType, { updates: string; new: string }> = {
      character: { updates: 'character updates', new: 'new characters' },
      location: { updates: 'location updates', new: 'new locations' },
      item: { updates: 'item updates', new: 'new items' },
      story_beat: { updates: 'story beat updates', new: 'new story beats' },
    }

    const sections: string[] = []

    for (const [entityType, vars] of Object.entries(varsByType)) {
      if (vars.length === 0) continue
      const labels = ENTITY_TYPE_LABELS[entityType as RuntimeEntityType]
      if (!labels) continue

      const varLines = vars.map((v) => {
        let line = `- ${v.variableName}`
        const parts: string[] = []

        // Type description
        if (v.variableType === 'number') {
          let numDesc = 'number'
          if (v.minValue !== undefined && v.maxValue !== undefined) {
            numDesc = `number ${v.minValue}-${v.maxValue}`
          } else if (v.minValue !== undefined) {
            numDesc = `number >= ${v.minValue}`
          } else if (v.maxValue !== undefined) {
            numDesc = `number <= ${v.maxValue}`
          }
          parts.push(numDesc)
        } else if (v.variableType === 'enum' && v.enumOptions?.length) {
          parts.push(`enum: ${v.enumOptions.map((o) => o.value).join('|')}`)
        } else {
          parts.push('text')
        }

        // Required vs optional
        parts.push(
          v.defaultValue !== undefined && v.defaultValue !== null ? 'optional' : 'required',
        )

        // Default value
        if (v.defaultValue !== undefined && v.defaultValue !== null) {
          parts.push(`default: ${v.defaultValue}`)
        }

        line += ` (${parts.join(', ')})`
        if (v.description) line += `: ${v.description}`
        return line
      })

      sections.push(
        `For ${labels.updates}/${labels.new}, include these as direct fields alongside standard fields:\n${varLines.join('\n')}`,
      )
    }

    if (sections.length === 0) return ''

    return `## Custom Variables to Track\n${sections.join('\n\n')}`
  }

  /**
   * Post-process: clamp number-type runtime variable values to min/max constraints.
   * Walks through all entity updates/new entities and clamps inline number values.
   */
  private clampRuntimeVarNumbers(
    result: ClassificationResult,
    varsByType: Record<string, RuntimeVariable[]>,
  ): void {
    const numberDefs = new Map<string, RuntimeVariable>()
    for (const vars of Object.values(varsByType)) {
      for (const v of vars) {
        if (v.variableType === 'number' && (v.minValue !== undefined || v.maxValue !== undefined)) {
          numberDefs.set(v.variableName, v)
        }
      }
    }

    if (numberDefs.size === 0) return

    // Clamp inline number values on an object
    const clampInlineVars = (obj: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(obj)) {
        const def = numberDefs.get(key)
        if (def && typeof value === 'number') {
          obj[key] = clampNumber(value, def.minValue, def.maxValue)
        }
      }
    }

    // Walk all entity types — vars are inline on changes/entity objects
    for (const update of result.entryUpdates.characterUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newCharacters) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
    for (const update of result.entryUpdates.locationUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newLocations) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
    for (const update of result.entryUpdates.itemUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newItems) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
    for (const update of result.entryUpdates.storyBeatUpdates) {
      clampInlineVars(update.changes as unknown as Record<string, unknown>)
    }
    for (const entity of result.entryUpdates.newStoryBeats) {
      clampInlineVars(entity as unknown as Record<string, unknown>)
    }
  }

  /**
   * Format existing characters for the prompt.
   */
  private formatExistingCharacters(characters: Character[]): string {
    if (characters.length === 0) return '(none)'

    return characters
      .map((c) => {
        let entry = `- ${c.name}`
        if (c.relationship) entry += ` (${c.relationship})`
        if (c.status && c.status !== 'active') entry += ` [${c.status}]`
        if (c.visualDescriptors && Object.keys(c.visualDescriptors).length > 0) {
          entry += `\n  Appearance: ${this.formatVisualDescriptors(c.visualDescriptors)}`
        }
        return entry
      })
      .join('\n')
  }

  /**
   * Format visual descriptors object into a readable string.
   */
  private formatVisualDescriptors(descriptors: Character['visualDescriptors']): string {
    if (!descriptors) return ''

    const parts: string[] = []
    if (descriptors.face) parts.push(`Face: ${descriptors.face}`)
    if (descriptors.hair) parts.push(`Hair: ${descriptors.hair}`)
    if (descriptors.eyes) parts.push(`Eyes: ${descriptors.eyes}`)
    if (descriptors.build) parts.push(`Build: ${descriptors.build}`)
    if (descriptors.clothing) parts.push(`Clothing: ${descriptors.clothing}`)
    if (descriptors.accessories) parts.push(`Accessories: ${descriptors.accessories}`)
    if (descriptors.distinguishing) parts.push(`Distinguishing: ${descriptors.distinguishing}`)

    return parts.join(', ')
  }

  /**
   * Format existing story beats for the prompt.
   */
  private formatExistingBeats(beats: StoryBeat[]): string {
    const activeBeats = beats.filter((b) => b.status === 'active' || b.status === 'pending')
    if (activeBeats.length === 0) return '(none)'

    return activeBeats
      .map((b) => {
        let entry = `- "${b.title}" [${b.status}]`
        if (b.description) entry += `: ${b.description}`
        return entry
      })
      .join('\n')
  }

  /**
   * Build chat history block for context.
   */
  private buildChatHistoryBlock(entries: StoryEntry[], _currentTime?: TimeTracker | null): string {
    if (entries.length === 0) return ''

    const recentEntries = entries.slice(-this.chatHistoryTruncation)

    const formatted = recentEntries
      .map((e) => {
        const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATIVE]'
        let timeInfo = ''
        if (e.metadata?.timeStart) {
          const t = e.metadata.timeStart
          timeInfo = ` (at Y${t.years}D${t.days} ${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')})`
        }
        // Always strip pic and thought tags for classification to avoid confusion
        const cleanContent = stripThoughtTags(stripPicTags(e.content))
        return `${prefix}${timeInfo} ${cleanContent.slice(0, 500)}${cleanContent.length > 500 ? '...' : ''}`
      })
      .join('\n\n')

    return `## Recent Chat History\n${formatted}\n`
  }
}
