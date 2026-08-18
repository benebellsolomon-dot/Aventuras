/**
 * CheckPhase — RPG skill-check resolution (research/47 Step 6).
 *
 * Runs between pre and retrieval: resolve-then-narrate. A tagged choice wins
 * outright (no model call); untagged free-text `do` actions get one small
 * risk-assess call; everything else skips. Resolution itself is the pure
 * resolveCheck — deterministic off `${storyId}:${entryId}:check`.
 *
 * NO WRITES here: the record travels through narration (immutable prompt
 * block) to StoryStore.applyRpgTurn, which owns the sheet write at
 * classification time. Aborting after narration therefore costs nothing.
 */

import { createLogger } from '$lib/log'
import type { ActionChoice } from '$lib/services/ai/sdk/schemas/actionchoices'
import type { RiskAssessResult } from '$lib/services/ai/sdk/schemas/riskassess'
import {
  defaultRpgSheet,
  readRpgSheet,
  resolveCheck,
  type CheckRecord,
  type RpgSheet,
} from '$lib/services/rpg'
import type { ActionInputType } from '$lib/types'
import type {
  AbortedEvent,
  GenerationContext,
  GenerationEvent,
  PhaseCompleteEvent,
  PhaseStartEvent,
} from '../types'

const log = createLogger('CheckPhase')

export interface CheckDependencies {
  /** Free-text pre-pass (RiskAssessService.assess). Fails safe to not-risky. */
  assessRisk: (storyId: string, actionText: string) => Promise<RiskAssessResult>
}

export interface CheckInput {
  context: GenerationContext
  actionType: ActionInputType
  /** The clicked choice's tag, when this turn came from an action choice. */
  choiceTag: ActionChoice | null
}

export class CheckPhase {
  constructor(private deps: CheckDependencies) {}

  async *execute(input: CheckInput): AsyncGenerator<GenerationEvent, CheckRecord | null> {
    const { context, actionType, choiceTag } = input
    const story = context.story

    if (story.settings?.beMode !== true) return null
    // Checks resolve player DEEDS; say/think/story-direction turns are safe.
    if (actionType !== 'do' && actionType !== 'free') return null

    const protagonist = context.worldState.characters.find((c) => c.relationship === 'self')
    if (!protagonist) return null
    const sheet: RpgSheet = readRpgSheet(protagonist.metadata) ?? defaultRpgSheet()

    yield { type: 'phase_start', phase: 'check' } satisfies PhaseStartEvent

    // The tag wins only when it matches what was actually submitted — an
    // edited input is a different action and gets re-assessed.
    const tagApplies =
      choiceTag?.skill !== undefined &&
      choiceTag?.dc !== undefined &&
      (choiceTag.text === context.userAction.rawInput ||
        choiceTag.text === context.userAction.content)

    let skill = tagApplies ? choiceTag!.skill : undefined
    let dc = tagApplies ? choiceTag!.dc : undefined
    let essenceCost = tagApplies ? (choiceTag!.essenceCost ?? 0) : 0

    if (!tagApplies) {
      if (context.abortSignal?.aborted) {
        yield { type: 'aborted', phase: 'check' } satisfies AbortedEvent
        return null
      }
      const verdict = await this.deps.assessRisk(story.id, context.userAction.content)
      if (verdict.risky && verdict.skill && verdict.dc) {
        skill = verdict.skill
        dc = verdict.dc
        essenceCost = verdict.essenceCost ?? 0
      }
    }

    if (!skill || !dc) {
      yield { type: 'phase_complete', phase: 'check', result: null } satisfies PhaseCompleteEvent
      return null
    }

    if (context.abortSignal?.aborted) {
      yield { type: 'aborted', phase: 'check' } satisfies AbortedEvent
      return null
    }

    const record = resolveCheck({
      seed: `${story.id}:${context.userAction.entryId}:check`,
      sheet,
      skill,
      dc,
      action: context.userAction.content,
      essenceCost,
    })
    log('check resolved', { skill, dc, nat: record.nat, total: record.total, band: record.band })

    yield { type: 'check_resolved', record }
    yield { type: 'phase_complete', phase: 'check', result: record } satisfies PhaseCompleteEvent
    return record
  }
}
