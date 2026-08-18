# Fork build notes (be-patches)

This is Ben's fork; `be-patches` carries local fixes on top of the `v0.7.6` tag.
Upstream: https://github.com/AventurasTeam/Aventuras

## Build

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"   # MUST be Node 22 — see below
npm install
npx tauri build --bundles app
# artifact: src-tauri/target/release/bundle/macos/Aventuras.app
```

**Node 22 is required** (what upstream CI uses — `.github/workflows/release.yml` on master).
On Node 26, `vite build` dies with `Maximum call stack size exceeded` while its
`import.meta.url` asset scanner tokenizes `node_modules/harper.js/dist/harper.js`
(~24 MB, inlined wasm). `--stack-size` and `commonjsOptions.exclude` do not help.

## Fork deltas vs upstream v0.7.6

- `fix:` quote-aware `<pic>` attribute parsing (`matchAttribute` in
  `src/lib/utils/inlineImageParser.ts`) — upstream truncated prompts at the first
  apostrophe inside double quotes. Upstream-PR candidate.
- Inline image instructions require full character re-description per prompt
  (`NarrativeService.ts`).
- Self-updater disabled (`tauri.conf.json`: no `plugins.updater`,
  `createUpdaterArtifacts: false`, version `0.7.6-be.21`) so upstream releases can't
  overwrite local patches. The Settings "check for updates" button errors — expected.
  To take an upstream release: fetch upstream, rebase `be-patches`, rebuild.
- **Transformation engine** (`src/lib/services/be/`): deterministic body-state reducer
  over a canonical size `tier`, classifier event extraction, `[BODY STATE]`/`[BE GENRE
  RULES]` prompt injection, banded sprite engine. Opt-in per story (`beMode`).
- **Content controls** (`StorySettings`): `contentRating` (standard/mature/explicit) and
  Liquid `postHistoryInstructions`, injected in the narrative pipeline
  (`NarrativeService.ts`, `contentGuidelines.ts`).
- **Bundled prompt packs** (`src/lib/services/packs/bundled/`): `createBundledPack` +
  "Start from" selector; ships a Breast Expansion starter pack.
- **Per-character image identity**: `imageTags` bank (migration 038) overrides derived
  identity tags; `loraConfig` (migration 039) adds trigger words + tier-scaled LoRA.
  Applied across all image paths via the shared `image/inlineAssembly.ts`.
- **Anti-bleed multi-character image prompts** (inline image instructions in
  `NarrativeService.ts`).
- Tests: Vitest suite added (`npm test`).

> Note: `be-patches` has been merged into local `master` (merge commit; not pushed —
> `origin`/`upstream` push URLs are intentionally `DISABLED`).
