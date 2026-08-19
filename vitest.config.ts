import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// Standalone vitest config (deliberately NOT reusing vite.config: the SvelteKit
// plugin needs a synced .svelte-kit dir and a Tauri env; the BE engine's pure-TS
// unit tests need neither).
//
// Two projects:
//  - "unit"  — the pure-TS suite (*.test.ts), node env, no Svelte compilation.
//  - "svelte" — runes-aware suite (*.svelte.test.ts) for the reactive stores. The
//    plain @sveltejs/vite-plugin-svelte compiles `.svelte.ts` runes (no SvelteKit
//    env needed); store deps are mocked per-test so only the store under test
//    actually compiles. This is the store test harness the CR-1 work needs.
const alias = { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) }

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.svelte.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [svelte({ compilerOptions: { runes: true } })],
        resolve: { alias, conditions: ['browser'] },
        test: {
          name: 'svelte',
          include: ['src/**/*.svelte.test.ts'],
          // node env: a runes *class* needs only signals (no DOM). Store deps are
          // mocked, so nothing mounts a component.
          environment: 'node',
        },
      },
    ],
  },
})
