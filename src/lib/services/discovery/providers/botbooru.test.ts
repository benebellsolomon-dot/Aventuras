import { beforeEach, describe, expect, it, vi } from 'vitest'

const corsFetch = vi.fn()
vi.mock('../utils', () => ({ corsFetch: (...args: unknown[]) => corsFetch(...args) }))

import {
  BOTBOORU_BASE,
  BotbooruProvider,
  buildQuery,
  lorebookToCard,
  postToCard,
  previewUrl,
  rankTags,
} from './botbooru'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const tag = (name: string, category = 'General', id = 1) => ({ id, name, category })

const samplePost = {
  id: 74973,
  filename: 'd5da9237.png',
  card_image_revision: 2,
  character_name: 'Eve',
  tags: [
    tag('female'),
    tag('sfw', 'Auto'),
    tag('multiple_greetings', 'Auto'),
    tag('elf'),
    tag('fantasy', 'Scenarios'),
    tag('jadesiaomaster', 'Writer'),
    tag('scenario', 'Meta'),
  ],
  views: 95,
  downloads: 19,
  favorite_count: 3,
  creator_notes_excerpt: 'A guild healer…',
  description_excerpt: '# Basic Information',
  tagline: '',
}

describe('botbooru helpers', () => {
  it('builds preview URLs with the revision cache-buster', () => {
    expect(previewUrl('a b.png', 320, 2)).toBe(`${BOTBOORU_BASE}/images/preview/320/a%20b.png?v=2`)
    expect(previewUrl('a.png', 640)).toBe(`${BOTBOORU_BASE}/images/preview/640/a.png`)
    expect(previewUrl('', 320)).toBe('')
  })

  it('folds tags into the space-separated q token list', () => {
    expect(buildQuery('elf mage', ['size difference', 'rpg'])).toBe('elf mage size_difference rpg')
    expect(buildQuery('  ', [])).toBe('')
    expect(buildQuery(undefined, undefined)).toBe('')
  })

  it('ranks content tags by frequency and drops housekeeping tags', () => {
    const posts = [
      { ...samplePost, tags: [tag('elf'), tag('female'), tag('sfw', 'Auto')] },
      { ...samplePost, tags: [tag('female'), tag('nsfw', 'Auto'), tag('someone', 'Writer')] },
    ]
    expect(rankTags(posts)).toEqual(['female', 'elf'])
  })
})

describe('postToCard', () => {
  it('maps a post to a DiscoveryCard, hiding auto/writer/meta tags', () => {
    const card = postToCard(samplePost)
    expect(card).toMatchObject({
      id: '74973',
      name: 'Eve',
      creator: 'jadesiaomaster',
      description: 'A guild healer…',
      source: 'botbooru',
      type: 'character',
      nsfw: false,
      tags: ['female', 'elf', 'fantasy'],
      stats: { downloads: 19, views: 95, rating: 3 },
    })
    expect(card.avatarUrl).toBe(`${BOTBOORU_BASE}/images/preview/320/d5da9237.png?v=2`)
    expect(card.imageUrl).toBe(`${BOTBOORU_BASE}/images/preview/640/d5da9237.png?v=2`)
  })

  it('flags nsfw/nsfl auto-tags', () => {
    expect(postToCard({ ...samplePost, tags: [tag('nsfw', 'Auto')] }).nsfw).toBe(true)
    expect(postToCard({ ...samplePost, tags: [tag('nsfl', 'Auto')] }).nsfw).toBe(true)
  })

  it('maps a lorebook to a DiscoveryCard keyed by its public number', () => {
    const card = lorebookToCard({
      id: 39992,
      number: 91,
      title: 'Touhou',
      content_rating: 'sfw',
      tagline: 'Exhaustive Touhou lore',
      cover_image_filename: 'lb_e9a4.webp',
      uploader_username: 'Edward',
      downloads: 69,
      favorite_count: 5,
      toc: ['Reisen', 'Eirin'],
    })
    expect(card).toMatchObject({
      id: '91',
      name: 'Touhou',
      creator: 'Edward',
      type: 'lorebook',
      nsfw: false,
      tags: ['Reisen', 'Eirin'],
      avatarUrl: `${BOTBOORU_BASE}/images/lb_e9a4.webp`,
    })
  })
})

describe('BotbooruProvider', () => {
  const provider = new BotbooruProvider()

  beforeEach(() => corsFetch.mockReset())

  it('searches /posts/ with sort/limit/offset/q and paginates by total', async () => {
    corsFetch.mockResolvedValue(jsonResponse({ total: 100, posts: [samplePost] }))

    const result = await provider.search(
      { query: 'elf', tags: ['rpg'], page: 2, limit: 48, sort: 'new', nsfw: false },
      'character',
    )

    const url = new URL(corsFetch.mock.calls[0][0] as string)
    expect(url.origin + url.pathname).toBe(`${BOTBOORU_BASE}/posts/`)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sort: 'latest',
      limit: '48',
      offset: '48',
      q: 'elf rpg',
      sfw_only: 'true',
    })
    expect(result.cards).toHaveLength(1)
    expect(result.hasMore).toBe(true)
    expect(result.nextPage).toBe(3)
  })

  it('reports no more pages once the offset reaches total', async () => {
    corsFetch.mockResolvedValue(jsonResponse({ total: 30, posts: [] }))
    const result = await provider.search({ query: '', page: 1, limit: 48 }, 'character')
    expect(result.hasMore).toBe(false)
    expect(result.nextPage).toBeUndefined()
  })

  it('searches /api/lorebooks for the lorebook type', async () => {
    corsFetch.mockResolvedValue(
      jsonResponse({ total: 1, items: [{ id: 1, number: 7, title: 'X' }] }),
    )
    const result = await provider.search({ query: 'x' }, 'lorebook')
    expect(String(corsFetch.mock.calls[0][0])).toContain(`${BOTBOORU_BASE}/api/lorebooks?`)
    expect(result.cards[0]).toMatchObject({ id: '7', type: 'lorebook' })
  })

  it('throws on a non-OK search response', async () => {
    corsFetch.mockResolvedValue(jsonResponse({ detail: 'nope' }, 429))
    await expect(provider.search({ query: 'x' }, 'character')).rejects.toThrow('429')
  })

  it('downloads the chara PNG for characters and world-info JSON for lorebooks', async () => {
    const character = postToCard(samplePost)
    const lorebook = lorebookToCard({ id: 1, number: 91, title: 'T' })
    expect(await provider.getDownloadUrl(character)).toBe(`${BOTBOORU_BASE}/download/png/74973`)
    expect(await provider.getDownloadUrl(lorebook)).toBe(
      `${BOTBOORU_BASE}/api/lorebooks/91/download.json`,
    )
  })

  it('surfaces the server detail message when a download is refused', async () => {
    corsFetch.mockResolvedValue(jsonResponse({ detail: 'Download limit reached' }, 429))
    await expect(provider.downloadCard(postToCard(samplePost))).rejects.toThrow(
      'Download limit reached',
    )
  })

  it('merges /post/{id} details into the card and keeps the original on failure', async () => {
    const card = postToCard({ ...samplePost, tags: [] })
    corsFetch.mockResolvedValueOnce(
      jsonResponse({ uploader_name: 'LuxusBolt', creator_notes: 'Full notes', first_mes: 'Hi' }),
    )
    const full = await provider.getCardDetails(card)
    expect(full.creator).toBe('LuxusBolt')
    expect(full.description).toBe('Full notes')
    expect(full.raw.first_mes).toBe('Hi')

    corsFetch.mockResolvedValueOnce(jsonResponse({ detail: 'gone' }, 404))
    expect(await provider.getCardDetails(card)).toBe(card)
  })

  it('derives tag suggestions from the most-downloaded posts', async () => {
    corsFetch.mockResolvedValue(
      jsonResponse({
        total: 1,
        posts: [{ ...samplePost, tags: [tag('elf'), tag('sfw', 'Auto')] }],
      }),
    )
    const tags = await provider.getTags()
    expect(String(corsFetch.mock.calls[0][0])).toContain('sort=downloads')
    expect(tags).toEqual(['elf'])
  })
})
