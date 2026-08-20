import { database } from '$lib/services/database'
import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates'
import { hashContent } from './hash'
import { getBundledPack } from './bundled'
import type { PresetPack, FullPack } from './types'

/**
 * Bump this when a SERVICE-category template's code baseline changes and the fix
 * should reach existing custom packs. Service templates sync from code to every
 * pack ONCE per version (see syncServiceTemplatesIfStale) — NOT every startup, so
 * a user's own edit to a service template survives normal restarts and is only
 * overwritten on a deliberate version bump. Log the reason on each bump:
 *   1 — 2026-08-19: classifier now lists present characters (presentCharacterNames).
 */
// 2 — 2026-08-19: risk-assess DC guidance biased to easy + booru scene-prompt
//     writer template reach existing custom-pack stories (e.g. wizard-generated).
// 3 — 2026-08-20: booru writer emits ordered SECTIONS (action-first assembly,
//     flat tag runs, ~60-tag budget) — fixes SDXL 77-token truncation dropping
//     the whole scene block (live failure: bed paizuri rendered as hallway
//     shirt-lift). Template must reach every pack.
// 4 — 2026-08-20: booru writer takes the faceless protagonist-POV form for a
//     "you" male (bad male anatomy in two-person explicit scenes) and identity
//     extraction now REQUIRES hair length + style (live banks omitted them).
// 5 — 2026-08-20: per-character EMOTION layer — the booru writer now fills a
//     REQUIRED "expressions" run per person (curated danbooru expression
//     vocabulary, arousal ladder gated on the explicit rating) and the prose
//     analysis template names the character's own emotional state. Expression
//     only reached images by accident before.
// 6 — 2026-08-20: booru writer's "action" field is now act-first — an ongoing
//     sex act must be tagged with its full Danbooru family BEFORE any
//     event-of-the-moment tags (live failure: a paizuri beat with breast growth
//     came back as growth tags only, dropping the act).
// 7 — 2026-08-20: risk-assess template teaches the new `growthIntent` flag, so a
//     free-text "channel more essence into her" action can grow her through the
//     check instead of dying as a non-eligible classifier `attempt`.
// 8 — 2026-08-20: booru writer declares actInProgress (mechanical act-tag
//     validation + one corrective retry — template compliance alone kept
//     dropping the ongoing act from explicit beats).
const SERVICE_TEMPLATE_SYNC_VERSION = 8
const SERVICE_TEMPLATE_SYNC_KEY = 'service_template_sync_version'

/**
 * Pack Service
 *
 * Business logic for preset pack management.
 * Handles default pack initialization, pack creation (copies from default),
 * template modification detection, and safe pack deletion.
 *
 * All database operations are delegated to DatabaseService.
 * This service adds the business rules on top.
 */
class PackService {
  private initialized = false

  /**
   * Initialize the pack system.
   * Call on app startup after database is ready.
   * - Ensures default pack exists
   * - Seeds templates from PROMPT_TEMPLATES if missing
   * - Adds any new templates from app updates
   * Idempotent: safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    let defaultPack = await database.getDefaultPack()

    if (!defaultPack) {
      // Create default pack if missing (first run)
      defaultPack = await database.createPack({
        id: 'default-pack',
        name: 'Default',
        description: 'Built-in prompt templates shipped with Aventura',
        author: 'Aventuras',
        isDefault: true,
      })
    }

    // Check existing templates
    const existingTemplates = await database.getPackTemplates('default-pack')
    const existingIds = new Set(existingTemplates.map((t) => t.templateId))

    // Build lookup of existing templates by templateId for quick access
    const existingByTemplateId = new Map(existingTemplates.map((t) => [t.templateId, t]))

    // Seed or update templates from PROMPT_TEMPLATES
    for (const template of PROMPT_TEMPLATES) {
      // Seed system prompt content
      if (!existingIds.has(template.id)) {
        await database.setPackTemplateContent('default-pack', template.id, template.content)
      }
      // Seed user content (if template has it)
      const userContentId = `${template.id}-user`
      if (template.userContent && !existingIds.has(userContentId)) {
        await database.setPackTemplateContent('default-pack', userContentId, template.userContent)
      }
    }

    // Refresh existing default-pack templates when code baseline changes.
    // For each existing template, if its content_hash doesn't match the new code baseline,
    // update it -- UNLESS the user has customized it (content doesn't match any known baseline).
    // Since we can't track old baselines, we accept the tradeoff: default pack templates
    // are auto-updated to match code changes. Users who need custom templates should use
    // custom packs (which are never auto-updated).
    await this.refreshDefaultPackTemplates(existingByTemplateId)

    // Service-category templates (classifier, suggestions, memory, etc.) are
    // internal machinery that was frozen-copied into every custom pack at creation
    // and never updated, so code fixes (e.g. the classifier's present-character
    // guidance) never reached existing custom-pack stories. Sync them across ALL
    // packs — but only ONCE per SERVICE_TEMPLATE_SYNC_VERSION bump, never on every
    // startup, so a user's own service-template edit survives normal restarts.
    await this.syncServiceTemplatesIfStale()

    this.initialized = true
  }

  /**
   * Get all preset packs.
   */
  async getAllPacks(): Promise<PresetPack[]> {
    return database.getAllPacks()
  }

  /**
   * Get a single pack by ID.
   */
  async getPack(id: string): Promise<PresetPack | null> {
    return database.getPack(id)
  }

  /**
   * Load a pack with all its templates and variables.
   */
  async getFullPack(packId: string): Promise<FullPack | null> {
    const pack = await database.getPack(packId)
    if (!pack) return null

    const [templates, variables, runtimeVariables] = await Promise.all([
      database.getPackTemplates(packId),
      database.getPackVariables(packId),
      database.getRuntimeVariables(packId),
    ])

    return { pack, templates, variables, runtimeVariables }
  }

  /** Create a new pack seeded from the pristine PROMPT_TEMPLATES baseline. */
  async createPack(name: string, description?: string, author?: string): Promise<PresetPack> {
    const packId = crypto.randomUUID()

    // Create pack metadata
    const pack = await database.createPack({
      id: packId,
      name,
      description: description ?? null,
      author: author ?? null,
      isDefault: false,
    })

    // Seed templates from code baseline (not from the database default-pack, which may be modified)
    for (const template of PROMPT_TEMPLATES) {
      await database.setPackTemplateContent(packId, template.id, template.content)
      if (template.userContent) {
        await database.setPackTemplateContent(packId, `${template.id}-user`, template.userContent)
      }
    }

    // No custom variables copied — new packs start clean

    return pack
  }

  /**
   * Create a pack from a bundled definition: baseline templates with the
   * bundle's transforms applied, plus its custom and runtime variables.
   * The result is a normal user pack (never auto-refreshed).
   */
  async createBundledPack(bundleId: string, nameOverride?: string): Promise<PresetPack> {
    const bundle = getBundledPack(bundleId)
    if (!bundle) throw new Error(`Unknown bundled pack: ${bundleId}`)

    const packId = crypto.randomUUID()
    const pack = await database.createPack({
      id: packId,
      name: nameOverride?.trim() || bundle.name,
      description: bundle.description,
      author: bundle.author,
      isDefault: false,
    })

    for (const template of PROMPT_TEMPLATES) {
      const transform = bundle.templateTransforms[template.id]
      const content = transform ? transform(template.content) : template.content
      await database.setPackTemplateContent(packId, template.id, content)
      if (template.userContent) {
        await database.setPackTemplateContent(packId, `${template.id}-user`, template.userContent)
      }
    }

    for (const variable of bundle.customVariables) {
      await database.createPackVariable(packId, variable)
    }

    for (const runtimeVariable of bundle.runtimeVariables) {
      await database.createRuntimeVariable(packId, runtimeVariable)
    }

    return pack
  }

  /**
   * Update pack metadata (name, description, author).
   */
  async updatePack(
    id: string,
    updates: { name?: string; description?: string | null; author?: string | null },
  ): Promise<void> {
    await database.updatePack(id, updates)
  }

  /** Delete a pack. Default pack and packs in use by stories cannot be deleted. */
  async deletePack(packId: string): Promise<{ deleted: boolean; reason?: string }> {
    const pack = await database.getPack(packId)
    if (!pack) return { deleted: false, reason: 'Pack not found' }
    if (pack.isDefault) return { deleted: false, reason: 'Cannot delete the default pack' }

    const canDelete = await database.canDeletePack(packId)
    if (!canDelete) {
      return {
        deleted: false,
        reason: 'Pack is in use by one or more stories. Reassign stories first.',
      }
    }

    await database.deletePack(packId)
    return { deleted: true }
  }

  /**
   * Check if a template in a pack has been modified from the default baseline.
   * Compares the pack template's content hash against the hash of the default content.
   */
  async isTemplateModified(packId: string, templateId: string): Promise<boolean> {
    const packTemplate = await database.getPackTemplate(packId, templateId)
    if (!packTemplate) return false

    // Find default baseline content
    const defaultContent = this.getDefaultContent(templateId)
    if (defaultContent === null) return false

    const defaultHash = await hashContent(defaultContent)
    return packTemplate.contentHash !== defaultHash
  }

  /**
   * Get modification status for all templates in a pack.
   * Returns a map of templateId -> isModified.
   */
  async getModifiedTemplates(packId: string): Promise<Map<string, boolean>> {
    const templates = await database.getPackTemplates(packId)
    const result = new Map<string, boolean>()

    for (const template of templates) {
      const defaultContent = this.getDefaultContent(template.templateId)
      if (defaultContent === null) {
        result.set(template.templateId, false)
        continue
      }
      const defaultHash = await hashContent(defaultContent)
      result.set(template.templateId, template.contentHash !== defaultHash)
    }

    return result
  }

  /** Reset a template to the default baseline content. */
  async resetTemplate(packId: string, templateId: string): Promise<boolean> {
    const defaultContent = this.getDefaultContent(templateId)
    if (defaultContent === null) return false

    await database.setPackTemplateContent(packId, templateId, defaultContent)
    return true
  }

  /**
   * Refresh default pack templates whose code baseline has changed.
   * Only updates templates that haven't been user-modified from their PREVIOUS baseline.
   * Since we can't distinguish "user modified old baseline" from "code changed, user didn't touch",
   * we update all default-pack templates to the current code baseline. Users who customize templates
   * should use custom packs (which are never auto-updated).
   */
  private async refreshDefaultPackTemplates(
    existingByTemplateId: Map<string, { templateId: string; contentHash: string }>,
  ): Promise<void> {
    for (const template of PROMPT_TEMPLATES) {
      // Check system prompt content
      const existing = existingByTemplateId.get(template.id)
      if (existing) {
        const newHash = await hashContent(template.content)
        if (existing.contentHash !== newHash) {
          await database.setPackTemplateContent('default-pack', template.id, template.content)
        }
      }

      // Check user content
      if (template.userContent) {
        const userContentId = `${template.id}-user`
        const existingUser = existingByTemplateId.get(userContentId)
        if (existingUser) {
          const newUserHash = await hashContent(template.userContent)
          if (existingUser.contentHash !== newUserHash) {
            await database.setPackTemplateContent(
              'default-pack',
              userContentId,
              template.userContent,
            )
          }
        }
      }
    }
  }

  /**
   * Sync SERVICE-category templates from code into ALL packs ONCE per
   * SERVICE_TEMPLATE_SYNC_VERSION. Version-gated (a stored settings key) so it runs
   * only after a deliberate bump, NOT every startup — that every-startup behavior
   * silently reverted user edits to service templates in custom packs (research/54
   * CR-2). Between bumps, a user's own service-template edit survives restarts.
   */
  private async syncServiceTemplatesIfStale(): Promise<void> {
    const stored = Number((await database.getSetting(SERVICE_TEMPLATE_SYNC_KEY)) ?? '0')
    if (Number.isFinite(stored) && stored >= SERVICE_TEMPLATE_SYNC_VERSION) return

    await this.syncServiceTemplatesAllPacks()
    await database.setSetting(SERVICE_TEMPLATE_SYNC_KEY, String(SERVICE_TEMPLATE_SYNC_VERSION))
  }

  /**
   * One-time sync body: for every SERVICE-category template, seed it into any pack
   * missing it (research/54 CR-2b) and update packs whose stored hash differs from
   * code. Code baseline hashes are computed once, outside the pack loop (CR-2/L-9).
   */
  private async syncServiceTemplatesAllPacks(): Promise<void> {
    const serviceTemplates = PROMPT_TEMPLATES.filter((t) => t.category === 'service')
    if (serviceTemplates.length === 0) return

    // Precompute code-baseline hashes once (not per pack).
    const baselines = await Promise.all(
      serviceTemplates.map(async (t) => ({
        id: t.id,
        content: t.content,
        contentHash: await hashContent(t.content),
        userContentId: t.userContent ? `${t.id}-user` : null,
        userContent: t.userContent ?? null,
        userContentHash: t.userContent ? await hashContent(t.userContent) : null,
      })),
    )

    const packs = await database.getAllPacks()
    for (const pack of packs) {
      const existing = await database.getPackTemplates(pack.id)
      const byId = new Map(existing.map((t) => [t.templateId, t]))

      for (const b of baselines) {
        const cur = byId.get(b.id)
        // Seed missing OR update a stale copy.
        if (!cur || cur.contentHash !== b.contentHash) {
          await database.setPackTemplateContent(pack.id, b.id, b.content)
        }

        if (b.userContentId && b.userContent !== null) {
          const curUser = byId.get(b.userContentId)
          if (!curUser || curUser.contentHash !== b.userContentHash) {
            await database.setPackTemplateContent(pack.id, b.userContentId, b.userContent)
          }
        }
      }
    }
  }

  /**
   * Get the default baseline content for a template ID.
   * Handles both system prompt (template.id) and user message (template.id + '-user') patterns.
   */
  private getDefaultContent(templateId: string): string | null {
    // Check for user content template (e.g., 'adventure-user')
    if (templateId.endsWith('-user')) {
      const baseId = templateId.replace(/-user$/, '')
      const template = PROMPT_TEMPLATES.find((t) => t.id === baseId)
      return template?.userContent ?? null
    }

    // System prompt content
    const template = PROMPT_TEMPLATES.find((t) => t.id === templateId)
    return template?.content ?? null
  }
}

/** Singleton pack service instance */
export const packService = new PackService()
