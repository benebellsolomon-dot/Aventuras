/**
 * BE engine — core types (Phase A).
 *
 * Design: ambrosia-st research/31 (decision doc; D1 unbounded sub-cup tier scalar,
 * D3 events→deterministic reducer). The canonical scalar is `tier`; cup letter, band
 * words, comparative prose, and grounding facts are ALWAYS derived, never stored
 * (research/31a §1.1, lesson 1).
 *
 * Deliberate divergence from the 31 sketch (logged per 31a lesson 7): BodyState
 * carries `cooldown` — the reducer's between-growth-beats gate (31a §3.4) must
 * persist across turns, so it is state, not reducer-local.
 */

export type BodyShape = 'natural' | 'firm' | 'gravity_defying'

export interface BodyCondition {
  label: string
  note?: string
  /** Remaining turns; undefined = persistent until explicitly removed. */
  ttl?: number
}

export interface BodyFluids {
  /** 0-100. Fill/drain ticks arrive in Phase B; Phase A only drains via milking events. */
  fillPercent: number
  fluidType: string
}

export interface PendingGrowth {
  delta: number
  source: string
}

export interface BodyBaseline {
  heightCm?: number
  build?: string
  /** Waist/hips in cm — stored anatomy (no tier relationship to derive them from). */
  waistCm?: number
  hipsCm?: number
  /** Overrides the height/build estimate when set (proportion honesty anchor). */
  bodyWeightKg?: number
}

/** How she feels about transforming (the genre's five, from the [BE] rules). */
export type TransformationAttitude =
  | 'craving'
  | 'accepting'
  | 'conflicted'
  | 'fearful'
  | 'resentful'

export interface BodyState {
  /** THE canonical size scalar (unbounded above per D1; >= 0). */
  tier: number
  shape: BodyShape
  fluids: BodyFluids
  /** Explicit transient allow-list (research/31 §2.1). */
  conditions: BodyCondition[]
  /** The size-lock: freezes growth and overrides even guaranteed triggers (31a §3.6). */
  locked: boolean
  /** Beats remaining before the next growth-eligible beat (31a §3.4 cooldown). */
  cooldown: number
  baseline?: BodyBaseline
  /** Two-beat anticipation carrier (Phase B). */
  pendingGrowth?: PendingGrowth
  /**
   * Set when growth landed THIS turn, cleared by the next reduce — drives the
   * magnitude-scaled narration directive (31a §3.5) for exactly one narration.
   */
  lastGrowth?: { delta: number; tierBefore: number }
  /**
   * Soft emotional states — classifier-proposed and clamped (LLM-set tier of the
   * single-writer spectrum; transformation attitude only, NOT the D2 relationship
   * model, which stays deferred to Phase C).
   */
  attitude?: TransformationAttitude
  /** Arousal 0-100 (soft state; feeds prose mood + image expression cues). */
  arousal?: number
  /** Growth-pressure escalator accumulator (Spec 1 Task 5; 0-capped, resets on fire). */
  growthPressure?: number
  /** One-turn drift-correction carrier (Spec 1 Task 6; cleared by the next reduce). */
  driftNote?: { note: string }
  /**
   * Relationship/trust track 0-100 (research/46 §2.3 — the D2 model, ruled in
   * as Phase 2). Read through tracks.ts bondOf() so an unset field defaults
   * without an eager write.
   */
  bond?: number
  /** Catalyst dependence/addiction track 0-100 (research/46 §2.3). */
  dependence?: number
  /**
   * Mechanical trait ids assigned deterministically at seed time (quirks.ts).
   * Stored as strings so unknown future ids survive an older reader; narrowed
   * at read time via readQuirks().
   */
  quirks?: string[]
  /** Beats since her last exposure event — the withdrawal clock (research/48 R8). */
  beatsSinceExposure?: number
}

/** Classifier-extracted event kinds (research/31 §2.2). The LLM proposes EVENTS, not values. */
export type BeEventKind = 'catalyst' | 'contact' | 'milking' | 'attempt' | 'stabilize'

export interface BeEvent {
  /** Character name as the classifier saw it; resolution to an id happens at the apply site. */
  character: string
  kind: BeEventKind
  /** 1 (incidental) — 3 (scene-defining). Clamped by the reducer. */
  intensity: number
}

/**
 * Classifier-proposed soft-state read for one character this turn. All fields
 * optional — the model reports only what the scene evidenced. Applied by the
 * reducer with clamps; fluidFill is set BEFORE drain events resolve.
 */
export interface BeSoftState {
  character: string
  attitude?: TransformationAttitude
  arousal?: number
  fluidFill?: number
}

/**
 * Classifier-proposed bond movement (research/48 Step 4). Direction is a named
 * enum, not a signed number — strain must be a first-class choice the model
 * makes, and coercion can't sign-flip it.
 */
export interface BondEvent {
  character: string
  direction: 'warm' | 'strain'
  /** 1 (a small moment) — 3 (scene-defining). Clamped by the reducer. */
  intensity: number
}

/** Classifier-proposed catalyst exposure (dependence intake) for one character. */
export interface ExposureEvent {
  character: string
  /** 1 (trace dose) — 3 (heavy/prolonged). Clamped by the reducer. */
  intensity: number
}

export type GrowthOutcome =
  | 'critical'
  | 'success'
  | 'partial'
  | 'fail'
  | 'muzzled'
  | 'cooldown'
  | 'ineligible'
  | 'none'

/**
 * One instrumentation record per handled event (research/34 D11): rides the entry's
 * world_state_delta so retries/branches can't pollute cadence data.
 */
export interface BeLogRecord {
  character: string
  kind:
    | BeEventKind
    | 'decay'
    | 'seed'
    | 'mood'
    | 'fill'
    | 'pressure'
    | 'pending'
    | 'bond'
    | 'exposure'
    | 'withdrawal'
  outcome: GrowthOutcome
  delta: number
  tierAfter: number
  note?: string
}

/** Output-side drift finding (Spec 1 Task 6; produced by drift.ts, consumed by the reducer). */
export interface DriftFinding {
  kind: 'cup_contradiction' | 'size_overshoot' | 'non_breast_growth' | 'growth_omitted'
  note: string
}

/** Per-story BE configuration (grows into the story-creation BE definition, research/34 §6a). */
export interface BeStoryConfig {
  enabled: boolean
  /** Story ceiling posture: null = open-ended (D1); a number hard-caps tier. */
  sizeCapTier: number | null
  /** Beats between growth-eligible beats. Reference default in constants.ts (D5: re-derive). */
  growthCooldownBeats: number
  /**
   * Which growth kinds may land growth in this story (cosmology alignment,
   * research/41: canon-illegal growth must never roll). Undefined = all.
   */
  growthEligibleKinds?: ReadonlyArray<BeEventKind>
  /** The story's fluid — FLUID_REGISTRY key (mirrors settings.beFluidType). */
  fluidType: string
  /** Per-turn passive fill tick (Spec 1 Task 2); the FIL loop's intake side. */
  passiveFillEnabled: boolean
}

export interface ReducerResult {
  state: BodyState
  log: BeLogRecord[]
}

/** Grounding facts derived for prose honesty (D4-thin; see derive.ts). */
export interface GroundingFacts {
  posture: string
  mobility: string
  clothing: string
}
