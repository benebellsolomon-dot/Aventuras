import path from 'node:path'
import { defineConfig, searchForWorkspaceRoot } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST

// Git worktrees under .claude/worktrees/ share the main checkout's node_modules,
// which sits outside the worktree's workspace root — allow serving from it.
const fsAllow = [searchForWorkspaceRoot(process.cwd())]
const worktreeMatch = process.cwd().match(/^(.*)\/\.claude\/worktrees\/[^/]+$/)
if (worktreeMatch) {
  fsAllow.push(path.join(worktreeMatch[1], 'node_modules'))
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), sveltekit()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    fs: {
      allow: fsAllow,
    },
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}))
