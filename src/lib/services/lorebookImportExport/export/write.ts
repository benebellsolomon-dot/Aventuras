/**
 * File writing and export orchestration
 */

import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { LorebookExportOptions } from '../types'
import { exportToAventura, exportToSillyTavern, exportToText } from './formats'
import { getFormatInfo } from './metadata'

async function saveFile(content: string, defaultPath: string): Promise<boolean> {
  try {
    const filePath = await save({
      defaultPath,
      filters: [
        { name: 'Aventura Lorebook', extensions: ['json'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    })

    if (!filePath) return false

    await writeTextFile(filePath, content)
    return true
  } catch (error) {
    console.error('[LorebookExporter] Failed to save file:', error)
    throw error
  }
}

export async function exportLorebook(options: LorebookExportOptions): Promise<boolean> {
  const { format, filename } = options

  // M-6 (research/54): learned spells are a runtime persistence artifact linked to a
  // character's knownSpells — they must not ride a LOREBOOK export. Re-importing a
  // file containing a `type:'spell'` entry recreates it with no knownSpells link (an
  // orphan), and the sillytavern/aventura formats would otherwise dump it verbatim
  // (only exportToText already skips it). Full-story backup export is a separate path
  // and keeps spells for a complete snapshot. Filtered here so every format agrees.
  const entries = options.entries.filter((e) => e.type !== 'spell')

  if (entries.length === 0) {
    throw new Error('No entries to export')
  }

  let content: string
  const baseFilename = filename ?? `lorebook-${new Date().toISOString().split('T')[0]}`
  const extension = getFormatInfo(format).extension

  switch (format) {
    case 'aventura':
      content = exportToAventura(entries)
      break
    case 'sillytavern':
      content = exportToSillyTavern(entries, baseFilename)
      break
    case 'text':
      content = exportToText(entries)
      break
  }

  return await saveFile(content, baseFilename + extension)
}
