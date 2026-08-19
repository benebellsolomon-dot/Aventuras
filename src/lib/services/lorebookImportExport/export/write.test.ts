// ---- exportLorebook: learned spells never ride a lorebook export (M-6) ----
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Entry } from '$lib/types'

let written = ''
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(async () => '/tmp/out.json'),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(async (_path: string, content: string) => {
    written = content
  }),
}))

const { exportLorebook } = await import('./write')

const entry = (id: string, type: Entry['type'], name: string): Entry =>
  ({
    id,
    type,
    name,
    description: `${name} desc`,
    injection: { mode: 'keyword', keywords: [], priority: 100 },
  }) as unknown as Entry

describe('exportLorebook — spell filtering (M-6)', () => {
  beforeEach(() => {
    written = ''
  })

  it('drops type:spell entries from the aventura export', async () => {
    const entries = [
      entry('c1', 'character', 'Aria'),
      entry('s1', 'spell', 'Fireball'),
      entry('l1', 'location', 'Keep'),
    ]

    await exportLorebook({ format: 'aventura', entries })

    const parsed = JSON.parse(written) as Entry[]
    expect(parsed.map((e) => e.name)).toEqual(['Aria', 'Keep'])
    expect(parsed.some((e) => e.type === 'spell')).toBe(false)
  })

  it('drops spells from the sillytavern export too', async () => {
    const entries = [entry('s1', 'spell', 'Fireball'), entry('c1', 'character', 'Aria')]

    await exportLorebook({ format: 'sillytavern', entries })

    expect(written).not.toContain('Fireball')
    expect(written).toContain('Aria')
  })

  it('throws when the only entries were spells (nothing left to export)', async () => {
    await expect(
      exportLorebook({ format: 'aventura', entries: [entry('s1', 'spell', 'Fireball')] }),
    ).rejects.toThrow(/No entries/)
  })
})
