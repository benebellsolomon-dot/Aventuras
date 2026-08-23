import type { DiscoveryCard, DiscoveryProvider, SearchOptions, SearchResult } from '../types'
import { corsFetch } from '../utils'

// Botbooru (botbooru.com) — a booru-style archive of character cards and lorebooks.
// Endpoints reverse-engineered from the site's own gallery JS (ui.js / lorebooks.js):
//   GET /posts/?q=&sort=&limit=&offset=&sfw_only=   → { total, posts[] }
//   GET /post/{id}                                   → full post (definition, greetings, lorebook…)
//   GET /download/png/{id}                           → chara_card_v2 PNG
//   GET /images/preview/{320|640}/{filename}         → webp thumbnail
//   GET /api/lorebooks?q=&sort=&limit=&offset=       → { total, items[] }
//   GET /api/lorebooks/{number}/download.json        → SillyTavern world-info JSON
// The server rate-limits downloads per IP (60/min); the UI does one download per click so
// we stay well under it.
export const BOTBOORU_BASE = 'https://botbooru.com'

const DEFAULT_LIMIT = 48
// Preview sizes the server accepts (anything else → 400 "Invalid preview size").
const THUMB_SIZE_SMALL = 320
const THUMB_SIZE_GALLERY = 640
// Tag suggestions are sampled from the most-downloaded cards (the full tag list is ~25k entries).
const TAG_SAMPLE_POSTS = 100
const TAG_SUGGESTION_LIMIT = 100
const TAG_CACHE_TTL_MS = 10 * 60 * 1000

// Auto-tags the site applies from its own content rating; not useful as user-facing tags.
const RATING_TAGS = new Set(['sfw', 'nsfw', 'nsfl'])
// Tag categories that carry provenance rather than content.
const HIDDEN_TAG_CATEGORIES = new Set(['Auto', 'Writer', 'Meta'])

type CardType = 'character' | 'lorebook' | 'scenario'

interface BotbooruTag {
  id: number
  name: string
  category: string
}

interface BotbooruPost {
  id: number
  filename: string
  card_image_revision?: number
  character_name: string
  tags: BotbooruTag[]
  views?: number
  downloads?: number
  favorite_count?: number
  creator_notes_excerpt?: string
  description_excerpt?: string
  tagline?: string
  uploader_name?: string
}

interface BotbooruLorebook {
  id: number
  number: number
  title: string
  content_rating?: string
  tagline?: string
  first_entry_snippet?: string
  entry_count?: number
  cover_image_filename?: string | null
  uploader_username?: string
  downloads?: number
  favorite_count?: number
  toc?: string[]
}

let cachedTags: string[] | null = null
let cachedTagsAt = 0

const SORT_MAP: Record<NonNullable<SearchOptions['sort']>, string> = {
  popular: 'downloads',
  new: 'latest',
  // Botbooru has no alphabetical sort; fall back to most-downloaded.
  name: 'downloads',
}

export function previewUrl(filename: string, size: number, revision?: number): string {
  if (!filename) return ''
  const base = `${BOTBOORU_BASE}/images/preview/${size}/${encodeURIComponent(filename)}`
  return revision ? `${base}?v=${revision}` : base
}

/** Botbooru's `q` is a space-separated token list matched against names and tags. */
export function buildQuery(query: string | undefined, tags: string[] | undefined): string {
  return [query?.trim() || '', ...(tags || []).map((t) => t.trim().replace(/\s+/g, '_'))]
    .filter(Boolean)
    .join(' ')
}

/** Content tags across a set of posts, most frequent first. */
export function rankTags(posts: BotbooruPost[]): string[] {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.tags || []) {
      if (HIDDEN_TAG_CATEGORIES.has(tag.category) || RATING_TAGS.has(tag.name)) continue
      counts.set(tag.name, (counts.get(tag.name) || 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([n]) => n)
}

export function postToCard(post: BotbooruPost): DiscoveryCard {
  const tags = post.tags || []
  const writer = tags.find((t) => t.category === 'Writer')?.name
  const visibleTags = tags
    .filter((t) => !HIDDEN_TAG_CATEGORIES.has(t.category) && !RATING_TAGS.has(t.name))
    .map((t) => t.name)
  const nsfw = tags.some((t) => t.name === 'nsfw' || t.name === 'nsfl')

  return {
    id: String(post.id),
    name: post.character_name || 'Unknown',
    creator: writer || post.uploader_name || 'Unknown',
    description: post.tagline || post.creator_notes_excerpt || post.description_excerpt || '',
    avatarUrl: previewUrl(post.filename, THUMB_SIZE_SMALL, post.card_image_revision),
    imageUrl: previewUrl(post.filename, THUMB_SIZE_GALLERY, post.card_image_revision),
    tags: visibleTags,
    stats: {
      downloads: post.downloads || 0,
      views: post.views || 0,
      rating: post.favorite_count || 0,
    },
    source: 'botbooru',
    type: 'character',
    nsfw,
    raw: post,
  }
}

export function lorebookToCard(lb: BotbooruLorebook): DiscoveryCard {
  const cover = lb.cover_image_filename
    ? `${BOTBOORU_BASE}/images/${encodeURIComponent(lb.cover_image_filename)}`
    : ''
  return {
    id: String(lb.number),
    name: lb.title || 'Untitled lorebook',
    creator: lb.uploader_username || 'Unknown',
    description: lb.tagline || lb.first_entry_snippet || '',
    avatarUrl: cover,
    imageUrl: cover,
    tags: (lb.toc || []).slice(0, 12),
    stats: {
      downloads: lb.downloads || 0,
      rating: lb.favorite_count || 0,
    },
    source: 'botbooru',
    type: 'lorebook',
    nsfw: lb.content_rating !== 'sfw',
    raw: lb,
  }
}

export class BotbooruProvider implements DiscoveryProvider {
  id = 'botbooru'
  name = 'Botbooru'
  icon = `${BOTBOORU_BASE}/favicon.ico`
  supports: CardType[] = ['character', 'lorebook', 'scenario']

  async search(options: SearchOptions, type: CardType): Promise<SearchResult> {
    const page = options.page || 1
    const limit = options.limit || DEFAULT_LIMIT
    const params = new URLSearchParams({
      sort: SORT_MAP[options.sort || 'popular'],
      limit: String(limit),
      offset: String((page - 1) * limit),
    })
    const q = buildQuery(options.query, options.tags)
    if (q) params.set('q', q)
    if (options.nsfw === false) params.set('sfw_only', 'true')

    const url =
      type === 'lorebook'
        ? `${BOTBOORU_BASE}/api/lorebooks?${params}`
        : `${BOTBOORU_BASE}/posts/?${params}`
    console.log('[Botbooru] Searching:', url)

    const response = await corsFetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok) {
      throw new Error(`Botbooru API error: ${response.status}`)
    }
    const data = await response.json()

    const cards: DiscoveryCard[] =
      type === 'lorebook'
        ? ((data.items || []) as BotbooruLorebook[]).map(lorebookToCard)
        : ((data.posts || []) as BotbooruPost[]).map(postToCard)

    const total = Number(data.total || 0)
    const hasMore = page * limit < total
    return { cards, hasMore, nextPage: hasMore ? page + 1 : undefined }
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    if (card.type === 'lorebook') {
      return `${BOTBOORU_BASE}/api/lorebooks/${card.id}/download.json`
    }
    return `${BOTBOORU_BASE}/download/png/${card.id}`
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    const url = await this.getDownloadUrl(card)
    console.log('[Botbooru] Downloading:', url)
    const response = await corsFetch(url, {
      headers: { Accept: card.type === 'lorebook' ? 'application/json' : 'image/png' },
    })
    if (!response.ok) {
      // The server returns {detail} with the real reason (rate limit, geo block, …).
      const detail = await response
        .json()
        .then((d) => d?.detail)
        .catch(() => null)
      throw new Error(detail || `Failed to download card: ${response.status}`)
    }
    return await response.blob()
  }

  async getCardDetails(card: DiscoveryCard): Promise<DiscoveryCard> {
    if (card.type === 'lorebook') return card
    try {
      const response = await corsFetch(`${BOTBOORU_BASE}/post/${card.id}`, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        console.warn(`[Botbooru] Failed to fetch details for ${card.id}: ${response.status}`)
        return card
      }
      const full = await response.json()
      return {
        ...card,
        creator: card.creator !== 'Unknown' ? card.creator : full.uploader_name || card.creator,
        description: full.tagline || full.creator_notes || full.description || card.description,
        raw: { ...card.raw, ...full },
      }
    } catch (error) {
      console.error('[Botbooru] Error fetching details:', error)
      return card
    }
  }

  async getTags(): Promise<string[]> {
    if (cachedTags && Date.now() - cachedTagsAt < TAG_CACHE_TTL_MS) return cachedTags
    try {
      // /tags/ is a ~2.5 MB dump with no limit param, so derive suggestions from the
      // most-downloaded cards instead — the same trick the Chub provider uses.
      const params = new URLSearchParams({ sort: 'downloads', limit: String(TAG_SAMPLE_POSTS) })
      const response = await corsFetch(`${BOTBOORU_BASE}/posts/?${params}`, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return cachedTags || []
      const data = await response.json()
      cachedTags = rankTags((data.posts || []) as BotbooruPost[]).slice(0, TAG_SUGGESTION_LIMIT)
      cachedTagsAt = Date.now()
      return cachedTags
    } catch (error) {
      console.warn('[Botbooru] Failed to fetch tags:', error)
      return cachedTags || []
    }
  }
}
