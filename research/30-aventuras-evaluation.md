# 30 — Aventuras evaluation: systems, SI-bridge wiring, and BE-story fit

**Date:** 2026-07-16 · **App:** Aventuras v0.7.6 (current latest, pub 2026-06-10) ·
**Repo:** https://github.com/AventurasTeam/Aventuras (AGPL-3.0, Tauri) · bundle id `com.karelian.aventura`
**Context:** Ben downloaded Aventuras as a candidate replacement for the SillyTavern + UIE
(universal-immersion-engine) stack. Two goals: (1) wire it to the **si-animator-bridge**
(`http://100.100.142.29:8001`, the 4090/ComfyUI image server), (2) evaluate its systems for
BE-story use (the ambrosia-st project).

Evidence basis: direct inspection of the installed app's SQLite DB
(`~/Library/Application Support/com.karelian.aventura/aventura.db` — schema, settings, and the
shipped `default-pack` templates), the app binary, the live bridge over Tailscale (including
an end-to-end test render), and a source-level dive of the public repo (§8).

---

## 1. TL;DR

- Aventuras is a **native story engine with real state primitives** — per-entity typed runtime
  variables, per-message world-state deltas, snapshots, checkpoints, and copy-on-write branching.
  Structurally it is much closer to what ambrosia-st built on MVU than UIE ever was.
- **Wiring to the SI bridge is ZERO-CODE.** v0.7.6 — Ben's exact build — is the release that
  added a native **A1111/Forge/KoboldCPP image provider** (`POST {baseUrl}/sdapi/v1/txt2img`,
  user-configurable base URL, requests via Tauri's native HTTP client so no CORS applies).
  The deployed bridge already serves `/sdapi/v1/*` on the tailnet with no-auth enabled
  (verified live, including an end-to-end test render — §5). Point the provider at
  `http://100.100.142.29:8001` and it works.
- **Image gen is LLM-mediated**: an editable "image-prompt-analysis" template turns narrative
  into ≤500-char English prose prompts; 9 provider backends exist (a1111, comfyui incl.
  custom-workflow upload, openai-compatible w/ custom base URL, nanogpt, openrouter, chutes,
  pollinations, google, zhipu — no NovelAI).
- **Runtime variables are automated, not just UI fields**: pack-defined per-character stats are
  merged into the per-turn Classifier's extraction schema and clamped to min/max — a genuine
  AI-maintained per-turn writer for a BE cup-tier stat (pacing is LLM-inferred though; no
  deterministic escalator).
- Biggest BE gaps: **no user scripting/extension surface at all** (confirmed at source level),
  the default one-character-per-image policy, and no place for deterministic body math — the
  ladder stays server-side in the bridge (recommended, and already the standing decision).

## 2. Identity

| | |
|---|---|
| App | Aventuras — AI interactive-fiction desktop app (Adventure + Creative Writing modes) |
| Version installed | 0.7.6 (== latest release; Tauri updater at `AventurasTeam/Aventuras/releases/latest/download/latest.json`) |
| Stack | Tauri 2 (Rust) + embedded webview frontend; SQLite via tauri_plugin_sql (`aventura.db`, WAL); plugins: sql/http/fs/opener |
| License | AGPL-3.0, open source |
| Install state | `/Applications/Aventuras.app` (Ben had already installed + launched it; OpenRouter profile configured in-app; no stories created yet) |
| LLM support | Any OpenAI-compatible gateway (OpenRouter configured; NanoGPT, llama.cpp, LM Studio, etc.) |

## 3. System inventory (all verified against the live DB unless noted)

### 3.1 Story core
- `stories` → `story_entries` (typed entries, `parent_id`, `position`, per-entry `metadata`,
  `reasoning`, `original_input`, **`world_state_delta`**, `suggested_actions`).
- **Chapters**: auto-summarization with retrieval metadata (keywords/characters/locations/
  plot_threads/emotional_tone, start/end in-story time, future `arc_id`).
- **Checkpoints**: named deep-copy snapshots of entries+characters+locations+items+beats+
  chapters+time+lorebook — a *save-state* system.
- **Branches**: copy-on-write (`cow_branches`, `cow_tombstones`, `branch_entity_snapshots`,
  per-branch world state) — cheap alternate timelines. Together with checkpoints this is the
  R3/undo story from the NAI era, but native and first-class.
- **Time tracker**: in-story time as a tracked dimension (chapter time fields, snapshots).

### 3.2 Lorebook & world state
- `entries` = unified lorebook (character/location/item/faction/concept/event) with:
  `description`, **`hidden_info`** (AI-only secrets), `aliases`, **JSON `state` +
  `adventure_state`/`creative_state`**, injection policy (`always|keyword|never` + priority),
  mention tracking, `created_by user|ai|import`, per-branch overrides, soft delete.
- Separate quick-access world tables: `characters` (with **`visual_descriptors` JSON — feeds
  image prompts**, plus `portrait`), `locations`, `items`, `story_beats`
  (pending/triggered/resolved), all branch-aware.
- `world_state_snapshots` per entry position — the queryable state timeline.
- **Autonomous lore management**: an agentic service (default GLM-5-class model, up to 50
  iterations) that maintains entries from the narrative; per-entry blacklist to opt out.
  This is a native VectFox/Chronicler analogue.

### 3.3 The packs system (the moddability surface)
- `preset_packs` → `pack_templates`: **every system prompt ships as an editable minijinja
  template** (75 templates in `default-pack`: `adventure` (~7.3k chars), `creative-writing`
  (~10k), classifier, lore-management, image-prompt-analysis, image styles, wizard, translation…).
- `pack_variables`: pack-level config variables (typed, defaults, enums) referenced by templates.
- **`pack_runtime_variables`**: per-entity-type (**character/location/item/story_beat**) typed
  live variables — `text|number|enum`, min/max, default, color/icon/pinned UI metadata.
  Default pack ships zero → this is an open authoring surface. **This is the natural home for
  a BE stat ladder** (e.g. `cup_tier` number on characters).
- `runtime_variables` migration + `pack_variable_extensions` → values tracked per story at runtime.
- Templates confirm injection points: genre/tone/setting/themes slots, POV/tense switches,
  `[LOREBOOK CONTEXT]` canonical block, `visualProseMode` / `inlineImageMode` instruction
  slots, story-time block.

### 3.4 Service mesh (per-service model routing, all user-configurable)
`classifier`, `lorebookClassifier`, `memory`, `suggestions`, `actionChoices`, `styleReviewer`
(interval-triggered prose QA), `loreManagement`, `interactiveVault`, `agenticRetrieval`,
`timelineFill`, `chapterQuery`, `entryRetrieval`, **`imageGeneration`**, `tts`,
`characterCardImport` — each with its own model/temperature/reasoning-effort and an optional
dedicated API profile. (Ben has these on OpenRouter: grok-fast for classify/memory, deepseek for
suggestions, GLM-5 for agentic.)

### 3.5 Vaults & import
- `character_vault` / `lorebook_vault` / `scenario_vault`: cross-story libraries with tags,
  provenance, and an **LLM-assisted import** path (`character-card-import` template) —
  SillyTavern V1/V2 cards (JSON + PNG) supported; lorebook import JSON/YAML/ST format.
- `vault_assistant_conversations` — an in-app assistant for vault curation.
- Full-story import: ⏳ §8.

## 4. Image generation system

**Pipeline (from DB + shipped templates):**
```
narrative entry ──▶ image-prompt-analysis (LLM, editable template, own model setting)
                      │  extracts ≤ maxImagesPerMessage visual moments
                      │  emits: prompt (<500 chars, English prose, style-block appended),
                      │         sourceText (verbatim anchor), sceneType, priority
                      ▼
                provider call via an API profile (per-type: inline / portrait /
                reference / background profileIds; sizes per type; styleId template)
                      ▼
                embedded_images (b64 in DB, keyed to story entry + sourceText)
                character portraits (characters.portrait; portrait template)
                background_images (per checkpoint/branch scene backdrop, blurrable)
```

- Styles are **pack templates** (`image-style-soft-anime|semi-realistic|photorealistic`) —
  short prose blocks the analysis LLM must weave into every prompt. Fully editable/addable.
- `image-portrait-generation` composes from `{{visualDescriptors}}` + style → **whatever
  maintains `visual_descriptors` controls how characters render** (the BE hook, §6).
- Default policy in the analysis template: **ONE character per image** (identity-consistency
  rationale), no character names in prompts, prompts in English.
- Settings today: `styleId: image-style-soft-anime`, inline 1024×1024, portraits 512×512,
  backgrounds 1280×720 (blur 2), max 3 images/message, `promptModel` unset.
**Confirmed provider layer (source-verified, see §8):** 9 backends in
`src/lib/services/ai/image/providers/registry.ts` — `nanogpt, openai, openrouter, chutes,
pollinations, google, zhipu, comfyui, a1111` (no NovelAI). The **A1111 provider**
(`providers/a1111.ts`, added in v0.7.6 — Ben's exact build) sends
`POST {baseUrl}/sdapi/v1/txt2img` with body
`{prompt, negative_prompt, width, height, steps, cfg_scale, sampler_name, batch_size:1,
n_iter:1, seed, scheduler?, override_settings:{sd_model_checkpoint}}`, auth
`Authorization: Bearer <apiKey>`, models/samplers/schedulers fetched from
`/sdapi/v1/sd-models|samplers|schedulers`. Per-profile knobs: steps/cfg/sampler/scheduler/
negativePrompt. Image profiles = `{id, name, providerType, apiKey, baseUrl, model,
providerOptions, createdAt}` stored plaintext under settings key `image_profiles`.
**Every request goes through Tauri's native HTTP client** (`fetchAdapter.ts` →
`@tauri-apps/plugin-http`) with an unrestricted URL capability scope — **no CORS, no
mixed-content, LAN/tailnet URLs just work**. The ComfyUI provider (custom API-format workflow
upload with auto-detected prompt/seed/output nodes) is a viable direct-to-`:8188` fallback but
bypasses the bridge recipe/queue — not recommended.

## 5. SI-bridge wiring plan

### 5.1 Current bridge state (verified live 2026-07-16)
- `GET /health` over tailnet: **ok, ComfyUI connected**, 4090 visible (btw. flagged
  `busy_with_other_workload` — something else was on the GPU).
- The **A1111 compat shim is deployed and live**: `GET /sdapi/v1/options` → 200; gated no-op
  `POST /sdapi/v1/options` → **200 without any credentials** ⇒ `BRIDGE_COMPAT_ALLOW_NOAUTH`
  is enabled (trusted tailnet). Native `/image` spec path still requires `X-API-Key`
  (key lives on the PC: `%LOCALAPPDATA%\si-animator-bridge\current_api_key.txt`; not present
  on this Mac).
- ⚠ Deployment drift: the deployed shim reports checkpoint **`krea2`**, while the Mac clone
  (`~/dev/si-animator-bridge`, branch `path-b-image-endpoint`) says `illustrious_xl` — the PC
  repo is ahead of the Mac clone. **No SSH path to the PC** (port 22 closed, no tailscale CLI
  on the Mac), so any bridge change = author on the Mac clone → Ben pulls/deploys on the PC.
- Existing precedent to copy: `compat_txt2img` (main.py ~1674) — sync A1111 shape over the
  async `/image` pipeline, sampler-map, `__betier_<N>__` prompt marker → tier-ladder LoRAs,
  connect stubs for options/models/samplers.

### 5.2 Wiring verdict: option A — zero code (RESOLVED + VERIFIED)

Aventuras v0.7.6 has a native A1111 provider (§4), the bridge serves the A1111 dialect, and
tailnet no-auth is on. **End-to-end proof (2026-07-16):** a `POST /sdapi/v1/txt2img` with the
exact Aventuras request shape (incl. its `Authorization: Bearer …` header) returned HTTP 200
in **34.2s** with a clean full-recipe 832×1216 render.

**In-app configuration (Settings → image generation):**
1. Add an image profile → provider **AUTOMATIC1111 / Forge**.
2. Base URL: `http://100.100.142.29:8001` · API key: **any NON-empty string** (e.g.
   `tailnet-noauth`). The bridge ignores it under tailnet no-auth, but the app's
   `hasRequiredCredentials()` guard (`imageUtils.ts`) refuses portrait/image generation on an
   empty key for a1111 profiles — only `pollinations`/`comfyui` are allowed keyless (an
   upstream inconsistency: the a1111 provider itself omits the header when the key is empty).
3. Connect/refresh models → it will list one checkpoint (currently titled `krea2`) — pick it.
   **CORRECTED (PNG workflow metadata, 2026-07-16 eve):** the deployed shim routes to the
   **Krea 2 turbo workflow** (`krea2_turbo_fp8_scaled` + **Qwen3-VL-4B abliterated text
   encoder**) — NOT WAI-illustrious. Consequences: natural-language prose is the native
   prompt dialect (booru weight syntax/artist tags are noise to an LLM-class encoder);
   the shim strips SDXL `embedding:` refs from negatives; and `__betier_<N>__` maps to
   **size phrases** server-side ("huge breasts, heavy bust"), not LoRAs — so banded size
   VOCABULARY in prompts is the working cup dial.
4. Leave sampler `DPM++ 2M Karras` (mapped), steps ~28, cfg 5; leave the profile's negative
   prompt empty → the bridge substitutes its tuned house negative.
5. Set this profile as the `imageGeneration` service profile (inline images); portraits /
   backgrounds / reference can point at the same profile.

**Auth caveat (future-proofing):** Aventuras sends `Bearer`; the bridge's compat auth accepts
only `X-API-Key` or HTTP Basic. Irrelevant while `BRIDGE_COMPAT_ALLOW_NOAUTH` is on, but if
that is ever turned off, add ~3 lines to `verify_compat_auth` to accept
`Authorization: Bearer <key>` (author in the Mac clone, deploy on the PC).

### 5.3 BE size control through the shim
The A1111 shim zeroes body-size LoRAs when no `__betier_<N>__` marker is present, so
prompt-words alone ("huge breasts") ride the base model but not the tier ladder. To get
ladder-exact sizes from Aventuras, the marker must reach the prompt. Candidate carriers, in
increasing ambition (see §6): a maintained `visual_descriptors` token, a style-template line,
or a runtime-variable reference in a cloned image-prompt-analysis template. The source dive
confirmed runtime variables are extracted+clamped per turn by the Classifier and surfaced in
play (`RuntimeVariableDisplay.svelte`); what's NOT yet confirmed is whether the image-prompt-
analysis template can interpolate them directly — the 5-minute smoke test in §10 closes that.
Fallback: prose-driven sizing only — acceptable through ~`huge`, weak in the gigantic/hyper
band.

## 6. BE-story utilization map (Ambrosia ⇄ Aventuras)

| Ambrosia concept (NAI/ST eras) | Aventuras primitive | Fit |
|---|---|---|
| Body state (cup tier, fullness, conditions) | `pack_runtime_variables` on `character` (number/enum, min/max) — **auto-extracted per turn by the Classifier, clamped to bounds**, values land in `characters.metadata`; manual editor UI too | ★★★ native, typed, AI-maintained |
| Single-writer law / schema-validated commits (MVU) | pack runtime vars are merged into the Classifier's **Zod** extraction schema (`ai/sdk/schemas/runtime-variables.ts`) + clamped — a real validation layer, though pacing/DC logic is LLM-inferred, not engine-enforced | ★★½ closest thing to MVU we've seen native |
| R3 undo / retry-safety | checkpoints (deep snapshots) + CoW branches + per-entry state timeline | ★★★ first-class |
| Chronicler / VectFox canon | chapter summarization + agentic loreManagement (50-iter) + `hidden_info` | ★★★ native analogue |
| Genre rules / Judge directives ([BE] lorebook rules) | cloned pack: extend `adventure`/`creative-writing` templates + always-inject lorebook entries | ★★★ templates are fully editable |
| Growth-beat pacing (#16 pressure floor) | `story_beats` (pending/triggered/resolved) + template guidance; no deterministic engine | ★★ LLM-enforced, not engine-enforced |
| Image tier lockstep (`__betier__` → slider/hyper LoRAs) | via §5.3 carriers into the shim | ★★ pending template/runtime-var reach |
| Character art identity (bridgeIdentity, FaceID) | `visual_descriptors` + portrait reference images (`referenceProfileId`, reference size) | ★★ good; reference-image use ⏳ |
| Scene backdrops (UIE bg images) | `background_images` per checkpoint/branch + blur | ★★★ native |
| Harem co-presence | world `characters` + relationships; but default image policy = one char/image | ★★ prose fine; imagery needs template edit or bridge `regional` |
| Deterministic body math (bust_cm, ptosis, milk) | none in-app | ★ keep server-side in the bridge (it already owns the ladder + beyond-ZZ measurements) |

**Proposed shape of "Ambrosia on Aventuras":** a cloned **BE preset pack** (templates +
variables) + runtime variables on characters (`cup_tier`, `fullness`, `shape`,
`magical_support`…) + always-inject `[BE]` lorebook entries + the lore agent instructed (via
its editable template) to keep body state and `visual_descriptors` in lockstep after growth
beats + all rendering through the SI bridge. The deterministic spine (tier math, measurements)
stays in the bridge where it already lives; Aventuras carries narrative state and pacing.

## 7. Lucy's Milk migration path

In Downloads today: `Lucys-Milk.uie.story.package.json` (UIE settings/characters/party export —
inspected: no chat log, databank empty), `Lucy's Milk (…).story` (NovelAI export, 2026-07-15),
`lucy-world-images.json` (32 MB UIE image-world blob), `bg_dairy_room.png`.

- **Characters:** import `ambrosia-st` `Lucy.png` / `Zaria.png` cards via the ST card importer
  (LLM-assisted mapping into the character vault). Re-seed BE fields as runtime variables.
- **Lore:** export/adapt the BE-module lorebook rules → Aventuras lorebook import (ST format
  accepted); set `[BE]` rules to `always` injection.
- **Prose: a real path exists** — Aventuras has a full **SillyTavern chat import wizard**
  (`stChatImporter.ts` + `STImportWizard.svelte`; `.jsonl` only: line 0 header, then
  `{is_user, is_system, mes}` → user_action/narration; wizard steps: upload → characters →
  world/lore → style → review). Two routes: (a) import the actual ambrosia-st Lucy chats from
  the live ST instance's `.jsonl` files; (b) for the NAI-era `Lucy's Milk .story`, write a
  ~30-line converter `.story → ST .jsonl` and go through the same wizard. **No NovelAI
  importer exists** (confirmed), and full-story JSON import is Aventuras's own round-trip
  schema only.
- **UIE package:** no importer, as expected — treat as reference only. Images: regenerate via
  the bridge rather than porting UIE's blobs.
- **✅ DONE (2026-07-16): the import bundle is staged** at
  `_inbox/lucys-milk-migration/aventuras-import/` (sanitized Lucy card + 23-entry ST
  worldinfo from the .story's LIVE lorebook incl. the 4 constant `BE:` rules + the full
  601-message chat.jsonl). Generated by `scripts/nai-story-to-st-import.mjs` (NAI msgpackr
  document decoder; user-vs-AI classified by origin-span absence). Ben's fork of the app:
  `Projects/gaming/Aventuras` (`be-patches` @ v0.7.6, github.com/benebellsolomon-dot/Aventuras).

## 8. Source-dive findings (repo, 2026-07-16)

Read directly from `AventurasTeam/Aventuras` master (~30 files via raw.githubusercontent.com);
key results not already folded into §4/§5/§7:

- **Project**: created 2026-01; original solo dev `unkarelian` (bundle id `com.karelian.aventura`),
  current top committer `munimunigamer`; 161★, active (commits on master today), **no Discord**
  — GitHub Discussions is the community hub. v0.7.6 (Jun 10) is still the latest release;
  master carries unreleased work.
- **Release cadence** (~2–5 weeks): v0.7.0 Mar 1 (AI-SDK migration, vault assistant, prompt
  redesign) · v0.7.2 OpenRouter image gen · v0.7.3-pre ST import wizard · v0.7.4 Google AI +
  **ComfyUI custom workflows** · v0.7.5 mobile · **v0.7.6 A1111/Forge/KoboldCPP provider**.
- **Image internals**: all providers behind `ImageProviderConfig {apiKey, baseUrl?,
  providerOptions?, timeoutMs?}`; requests via `@tauri-apps/plugin-http` (native, CORS-free,
  `http://*:*` capability scope). NanoGPT = `POST nano-gpt.com/api/v1/images/generations`
  (img2img via `imageDataUrl`); OpenAI provider honors custom `baseUrl` and does
  `images/generations` + `images/edits` (FormData reference conditioning).
  `characters.portrait` is used as an **img2img/reference conditioning** source for
  consistency (migration 012).
- **Lore agent**: `LoreManagementService.ts` = Vercel-AI-SDK tool-loop (default
  `maxIterations: 3` in code; Ben's settings show 50) that auto-approves its own entry
  create/updates. Built-in `Entry.state` shapes are **hardcoded** (character:
  `{isPresent, lastSeenLocation, currentDisposition, relationship{level,status,history},
  knownFacts[], revealedSecrets[]}`) — NOT user-extensible; custom state must ride
  **runtime variables** (§3.3) or entry text.
- **Runtime-variable lifecycle** (the BE-critical trace): pack-defined vars are merged into
  the **Classifier's** Zod output schema per turn (`ai/sdk/schemas/runtime-variables.ts`,
  `(range: min–max)` in the field description, `clampNumber` post-extraction in
  `ClassifierService.ts`); values persist into `characters.metadata` (high-confidence
  inference — no dedicated column exists); surfaced in play via `RuntimeVariableDisplay.svelte`.
  NOT yet traced: the exact injection of current values back into the next narrative prompt,
  and template-level interpolation into image prompts — see §10 smoke test.
- **Extensibility: none.** No plugin/scripting/webhook/custom-JS surface anywhere in the
  689-file tree. Packs + templates + variables are the entire customization surface (data,
  not code).
- **Security note**: image-profile API keys are stored **plaintext** in `settings`
  (`image_profiles` JSON). Non-issue for the bridge (no key on tailnet); don't park real cloud
  keys there casually.

## 9. Risks / open questions

- **No scripting/extension surface (confirmed)**: everything customizable is template/variable
  level; anything requiring code (deterministic math, custom UI panels) must live outside the
  app. This is the biggest step down from ST/UIE — offset by much stronger native state.
- **Growth pacing is LLM-inferred**: the Classifier writes runtime-variable values with no
  pressure-accrual/cooldown engine (nothing like #16's pacing floor). Mitigations: pacing
  rules in the cloned narrative/classifier templates + `story_beats` as milestones; accept
  softer guarantees than the NAI engine gave.
- **Reference/background paths NEED a valid cloud key** (learned live 2026-07-16): with
  Reference Mode on and portraits present, inline `<pic>` renders switch to the
  `referenceProfileId` profile (OpenRouter/gemini here) — a bad key fails ALL scene images
  with `Image API error 401: Missing Authentication header` (OpenRouter's exact malformed-
  Bearer text; fingerprint-verified). Ben's first setup had the BRIDGE URL pasted into the
  Nano Banana profile's API-key field. Quirks worth knowing: the failed row's `model` column
  records the MAIN profile's model (misleading), and **Retry always re-renders through the
  MAIN profile** (`retryImageGeneration` ignores the reference path) — an accidental but
  useful bridge fallback. Backgrounds route via `backgroundProfileId` and fail silently on
  the same bad key.
- **≤500-char prose prompts** + one-char-per-image default: workable via template edits, but
  the booru-stack house recipe gets squeezed; the bridge shim can compensate (it owns
  quality/negative stacks server-side).
- **Deployment drift** on the bridge (PC ahead of Mac clone, `krea2` default) — reconcile
  before adding compat endpoints; no remote path to the PC from this Mac.
- Adult-content posture of Aventuras's default templates/models is untested here (NSFW BE
  content worked fine on ST with the same models; the app is provider-agnostic so this is a
  model choice, not an app gate — but the shipped templates' tone should be checked in play).
- Single-track community packs: sharing a BE pack publicly would ride the packs system (fine);
  AGPL only matters if we fork the app itself (avoid — keep compat on the bridge).

## 10. Recommended next steps

1. **[Ben, ~1 min] Wire it**: in Aventuras, add the A1111 image profile per §5.2 (base URL
   `http://100.100.142.29:8001`) and set it as the image-generation profile. (The endpoint +
   request shape are already verified end-to-end; the app was running during setup, so the
   profile couldn't be pre-written into the DB safely from outside.)
2. **[5 min] Runtime-variable smoke test**: define one number var (e.g. `cup_tier`, 0–60,
   default 6) on `character`, play 2–3 turns with a growth beat, then inspect
   `characters.metadata` in `aventura.db` and check whether the value shows up in the next
   generation's context — closes the two untraced gaps in §8.
3. **Author the BE preset pack** (clone `default-pack`): BE genre rules into
   `adventure`/`creative-writing`; a booru-leaning `image-style-illustrious-be` style
   template (+ decide on the `__betier__` carrier per §5.3); relax one-char-per-image for
   harem shots if wanted; add pacing guidance to the classifier/lore templates.
4. **Import the cast**: Lucy/Zaria ST cards → character vault; BE lorebook rules → lorebook
   (ST format), `always` injection; regenerate portraits via the bridge (portraits also feed
   img2img reference conditioning).
5. **Migrate Lucy's Milk prose** via the ST-chat wizard (§7) — write the tiny
   `.story → .jsonl` converter if the NAI text (rather than the ST chats) is the desired canon.
6. **Tier sweep live-test** through the app (flat → hyper) before committing to the marker
   carrier; compare against `research/29`'s ladder renders.
7. Optional bridge hardening (Mac clone → Ben deploys): accept `Bearer` in
   `verify_compat_auth`; reconcile the Mac clone with the PC deployment before ANY bridge
   code change (PC is ahead — `krea2`).
