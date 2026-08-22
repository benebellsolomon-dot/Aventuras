/**
 * Risk Assess Service (research/47 Step 5)
 *
 * The free-text pre-pass of the resolve-then-narrate check pipeline: a small
 * structured call that decides whether a typed player action warrants a skill
 * check (and which skill/DC/essence cost). Tagged choices skip this entirely —
 * the tag wins. Callers skip it too when beMode is off or the action is not an
 * adventure `do` action.
 */

import { BaseAIService } from '../BaseAIService'
import { ContextBuilder } from '$lib/services/context'
import { createLogger } from '$lib/log'
import { riskAssessResultSchema, type RiskAssessResult } from '../sdk/schemas/riskassess'
import { withDefaultDc } from '../sdk/schemas/tolerant-fields'

const log = createLogger('RiskAssess')

const NOT_RISKY: RiskAssessResult = { risky: false }

export class RiskAssessService extends BaseAIService {
  constructor(serviceId: string) {
    super(serviceId)
  }

  /**
   * Assess one typed action. Fails safe: any error → not risky (the turn
   * proceeds unchecked rather than blocked).
   */
  async assess(storyId: string, userActionText: string): Promise<RiskAssessResult> {
    try {
      const ctx = await ContextBuilder.forStory(storyId)
      ctx.add({ userActionText })
      const { system, user: prompt } = await ctx.render('risk-assess')
      // BaseAIService.generate widens the tolerant (preprocess/catch) fields to
      // `unknown`; the schema's own z.infer matches RiskAssessResult (test-pinned).
      const result = (await this.generate(
        riskAssessResultSchema,
        system,
        prompt,
        'risk-assess',
      )) as RiskAssessResult
      // A skill without a dc is still a check (default-LOW DC); a "risky"
      // verdict with no usable skill cannot resolve — treat as safe.
      const verdict = withDefaultDc(result)
      if (!verdict.risky) return verdict
      if (!verdict.skill || !verdict.dc) return NOT_RISKY
      return verdict
    } catch (error) {
      log('risk assess failed — treating action as not risky', { error })
      return NOT_RISKY
    }
  }
}
