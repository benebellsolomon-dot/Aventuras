/**
 * Action Choices Service
 *
 * Generates action choices for adventure mode gameplay.
 * Uses the Vercel AI SDK for structured output with Zod schema validation.
 *
 * Prompt generation flows through ContextBuilder + Liquid templates.
 */

import { stripThoughtTags } from '$lib/utils/thoughtTagParser'
import type { StoryEntry, Entry, Character, Location, Item, StoryBeat } from '$lib/types'
import { BaseAIService } from '../BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import { createLogger } from '$lib/log'
import { actionChoicesResultSchema, type ActionChoice } from '../sdk/schemas/actionchoices'
import { withDefaultDc } from '../sdk/schemas/tolerant-fields'
import { sanitizeActionChoices, stripGrowthIntent } from './action-choice-hygiene'
import { database } from '$lib/services/database'
import { growthGateRequired } from '$lib/services/be'

const log = createLogger('ActionChoices')

export interface ActionChoicesContext {
  storyId?: string
  narrativeResponse: string
  userAction: string
  recentEntries: StoryEntry[]
  protagonistName: string
  protagonistDescription?: string | null
  mode: string
  pov: string
  tense: string
  currentLocation?: Location | null
  presentCharacters?: Character[]
  inventory?: Item[]
  activeQuests?: StoryBeat[]
  lorebookEntries?: Entry[]
}

/**
 * Service that generates action choices for adventure mode.
 */
export class ActionChoicesService extends BaseAIService {
  constructor(serviceId: string) {
    super(serviceId)
  }

  /**
   * Generate action choices based on current narrative context.
   */
  async generateChoices(context: ActionChoicesContext): Promise<ActionChoice[]> {
    log('generateChoices called', {
      narrativeLength: context.narrativeResponse.length,
      recentEntriesCount: context.recentEntries.length,
      protagonist: context.protagonistName,
      hasStoryId: !!context.storyId,
    })

    // Format recent context
    const recentContext = context.recentEntries
      .slice(-5)
      .map(
        (e) =>
          `[${e.type === 'user_action' ? 'ACTION' : 'NARRATIVE'}]: ${stripThoughtTags(e.content)}`,
      )
      .join('\n\n')

    // Format current location
    const currentLocation = context.currentLocation?.name ?? 'Unknown'

    // Format NPCs present (exclude self)
    const npcsPresent =
      context.presentCharacters
        ?.filter((c) => c.relationship !== 'self')
        .map((c) => c.name)
        .join(', ') || 'None'

    // Format inventory
    const inventory = context.inventory?.map((i) => i.name).join(', ') || 'None'

    // Format active quests (pending or active, not completed or failed)
    const activeQuests =
      context.activeQuests
        ?.filter((q) => q.status === 'pending' || q.status === 'active')
        .map((q) => `• ${q.title}${q.description ? `: ${q.description}` : ''}`)
        .join('\n') || 'None'

    // Format lorebook context
    let lorebookContext = ''
    if (context.lorebookEntries && context.lorebookEntries.length > 0) {
      const entryDescriptions = context.lorebookEntries
        .slice(0, 10)
        .map((e) => {
          let desc = `• ${e.name} (${e.type})`
          if (e.description) {
            desc += `: ${e.description.substring(0, 100)}${e.description.length > 100 ? '...' : ''}`
          }
          return desc
        })
        .join('\n')
      lorebookContext = `\n## World Context\n${entryDescriptions}\n`
    }

    // Protagonist description
    const protagonistDescription = context.protagonistDescription
      ? ` (${context.protagonistDescription})`
      : ''

    // Style guidance based on recent user actions
    const userActions = context.recentEntries.filter((e) => e.type === 'user_action').slice(-3)
    let styleGuidance = ''
    if (userActions.length > 0) {
      const avgLength =
        userActions.reduce((sum, e) => sum + e.content.length, 0) / userActions.length
      if (avgLength < 30) {
        styleGuidance =
          "\n## Style: Match the player's TERSE style - keep choices short and punchy (under 10 words each).\n"
      } else if (avgLength > 100) {
        styleGuidance =
          "\n## Style: Match the player's DETAILED style - include specific details in each choice.\n"
      }
    }

    // POV instruction
    const povInstruction =
      context.pov === 'first'
        ? 'Use first person (I, me, my) for all action choices.'
        : context.pov === 'second' || context.pov === 'hybrid'
          ? 'Use second person (you, your) for all action choices.'
          : 'Use third person for all action choices.'

    // Length instruction
    const lengthInstruction = 'Keep each choice concise but specific - typically 5-15 words.'

    // Create ContextBuilder -- use forStory when storyId available
    let ctx: ContextBuilder
    if (context.storyId) {
      ctx = await ContextBuilder.forStory(context.storyId)
    } else {
      ctx = new ContextBuilder()
      ctx.add({
        mode: context.mode,
        pov: context.pov,
        tense: context.tense,
        protagonistName: context.protagonistName,
      })
    }

    // Add runtime variables for template rendering
    ctx.add({
      narrativeResponse: context.narrativeResponse,
      recentContext,
      currentLocation,
      npcsPresent,
      inventory,
      activeQuests,
      lorebookContext,
      protagonistDescription,
      styleGuidance,
      povInstruction,
      lengthInstruction,
    })

    // Render through the action-choices template
    const { system, user: prompt } = await ctx.render('action-choices')

    // No local catch: a failed call must PROPAGATE so PostGenerationPhase's
    // non-fatal error event fires and the UI can say so. The old return-[]
    // swallow made a broken model on the Suggestions preset indistinguishable
    // from "no choices this turn" — the feature just silently vanished
    // (D5 playtest finding).
    const result = await this.generate(actionChoicesResultSchema, system, prompt, 'action-choices')

    log('Action choices generated:', result.choices.length)
    const raw = result.choices as ActionChoice[]
    const kept = sanitizeActionChoices(raw)
    if (kept.length < raw.length) {
      log('Dropped degenerate action choices', {
        dropped: raw.filter((c) => !kept.includes(c)).map((c) => c.text),
      })
    }
    // Absolute growth rule (research/66): in a cosmology story growth is never an
    // action — a growthIntent the model set anyway is stripped deterministically
    // (the check still resolves as an ordinary check; casts still bank).
    const gateRequired = context.storyId
      ? growthGateRequired((await database.getStory(context.storyId))?.settings)
      : false
    return kept
      .slice(0, 4)
      .map((choice) => (gateRequired && choice.growthIntent ? stripGrowthIntent(choice) : choice))
      .map(withDefaultDc)
  }
}
