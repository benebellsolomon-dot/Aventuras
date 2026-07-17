import { defineConfig } from 'vitest/config'

// Standalone vitest config (deliberately NOT reusing vite.config: the SvelteKit
// plugin needs a synced .svelte-kit dir and a Tauri env; the BE engine's pure-TS
// unit tests need neither). Svelte-component testing, if it ever arrives, gets its
// own project entry here.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
