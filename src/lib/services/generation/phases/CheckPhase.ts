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
import { readBodyState } from '$lib/services/be'
import {
  buildTargetCheckModifiers,
  resolveCheck,
  sheetOrDefault,
  type CheckRecord,
  type RpgSheet,
  type SkillId,
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
    // Checks resolve player deeds: 'do' actions and free-form input (which may
    // describe deeds). say/think/story-direction turns are always safe.
    if (actionType !== 'do' && actionType !== 'free') return null

    const protagonist = context.worldState.characters.find((c) => c.relationship === 'self')
    if (!protagonist) return null
    const sheet: RpgSheet = sheetOrDefault(protagonist.metadata)

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
    // Note: because the tag only applies on a text match, an edited input
    // drops the target (and its modifiers) along with the tag — re-assessed.
    let targetName = tagApplies ? choiceTag!.targetCharacter : undefined
    // Spell cast marker (Phase 4, research/50 R3): carried onto the record so
    // the store applies the spell's effects and the turn log marks it a cast.
    // v1 casts are UI-initiated with authoritative skill/dc/essenceCost already
    // filled from the spell entry, so CheckPhase needs no DB resolution here.
    let spellId = tagApplies ? choiceTag!.spellId : undefined
    // Growth-intent marker: the action's stated purpose is to grow/transform the
    // target. Threaded exactly like spellId (tag or verdict, dropped on an edited
    // input) — the store turns it into deterministic growth on a landed band.
    let growthIntent = tagApplies ? choiceTag!.growthIntent === true : false

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
        targetName = verdict.targetCharacter
        spellId = verdict.spellId
        growthIntent = verdict.growthIntent === true
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

    // Target girl (research/48 R5): case-insensitive, never the protagonist;
    // no match or no bodyState → no modifiers (Phase-1 behavior exactly). The
    // seed is untouched by targeting — modifiers shift the bonus, not the roll.
    const target = targetName
      ? context.worldState.characters.find(
          (c) => c.relationship !== 'self' && c.name.toLowerCase() === targetName!.toLowerCase(),
        )
      : undefined
    const targetState = target ? readBodyState(target.metadata) : null
    const modifiers = buildTargetCheckModifiers(targetState, skill as SkillId)

    const record: CheckRecord = {
      ...resolveCheck({
        seed: `${story.id}:${context.userAction.entryId}:check`,
        sheet,
        skill,
        dc,
        action: context.userAction.content,
        essenceCost,
        modifiers,
        ...(spellId ? { spellId } : {}),
      }),
      ...(target ? { target: target.name, targetId: target.id } : {}),
      // spellId is NOT re-applied here: resolveCheck owns it, and it keeps the
      // marker only for a spell the sheet actually knows. Re-adding it would
      // resurrect an unknown-spell tag the resolver deliberately dropped.
      // NOT gated on a resolved target any more. The tagger is an LLM and drops
      // `targetCharacter` intermittently on turns it tagged growth for (live
      // failure: a crit channel, essence spent, zero growth, because the flag was
      // discarded here). Both tags landing together is too fragile a contract, so
      // the flag now travels untargeted and the STORE resolves the subject — it
      // knows who is in the scene and who carries body state, and it applies
      // nothing when zero or several girls could have been meant. That guard, not
      // this one, is what keeps untargeted "grow the room" nonsense inert.
      ...(growthIntent ? { growthIntent: true } : {}),
    }
    log('check resolved', {
      skill,
      dc,
      nat: record.nat,
      total: record.total,
      band: record.band,
      ...(record.unknownSpellDropped ? { unknownSpellDropped: true, taggedSpellId: spellId } : {}),
    })

    yield { type: 'check_resolved', record }
    yield { type: 'phase_complete', phase: 'check', result: record } satisfies PhaseCompleteEvent
    return record
  }
}
