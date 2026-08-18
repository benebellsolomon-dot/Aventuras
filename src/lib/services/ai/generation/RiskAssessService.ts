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
      const result = await this.generate(riskAssessResultSchema, system, prompt, 'risk-assess')
      // A "risky" verdict without a usable skill/dc cannot resolve — treat as safe.
      if (!result.risky || !result.skill || !result.dc) return result.risky ? NOT_RISKY : result
      return result
    } catch (error) {
      log('risk assess failed — treating action as not risky', { error })
      return NOT_RISKY
    }
  }
}
