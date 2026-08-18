# Aventuras

## Overview

Aventuras is a desktop and mobile interactive fiction application offering multiple story modes (Adventure Mode, Creative Writing Mode), deep AI integration via major providers, an advanced Memory System, dynamic Lorebook, and an autonomous Lore Management Agent. The app provides a robust set of writing tools and world tracking features, ensuring contextually rich and coherent AI-generated narratives.

It also includes a customizable prompt-pack system, per-story content controls, multi-provider image generation with per-character visual consistency, and an optional adult transformation engine — all described below.

## Features

### Story Modes

- **Adventure Mode** - Interactive fiction with multiple-choice actions and world tracking
- **Creative Writing Mode** - Freeform collaborative writing with AI-generated suggestions
- **POV Options** - First, second, or third person perspective
- **Tense Control** - Past or present tense narrative style

### AI Integration

- Use any OpenAI-compatible gateway or provider like OpenRouter, NanoGPT, llama.cpp, LM Studio, and more
- Streaming responses with real-time text generation
- Configurable models, temperature, and token limits
- Extended thinking/reasoning support with configurable effort levels
- API profiles for saving multiple configurations

### Memory System

- Automatic chapter summarization to manage context windows
- Configurable token thresholds and chapter buffers
- Manual chapter creation and resummarization
- AI-powered memory retrieval for relevant past events
- Chapter metadata tracking (keywords, characters, locations, plot threads)
- In-story time tracking per chapter

### Lorebook

- Unified entry system for characters, locations, items, factions, concepts, and events
- Dynamic state tracking (relationships, inventory, discoveries)
- Keyword-based and relevance-based context injection
- Hidden information and secrets system
- Aliases for flexible entry referencing
- Import/export support (JSON, YAML, SillyTavern format)
- SillyTavern character card import (V1/V2 JSON and PNG)
- AI-assisted autonomous lore management agent

### Writing Tools

- Local grammar checking powered by Harper.js (WebAssembly)
- AI-powered style analysis for repetitive words and phrases
- Action suggestions that match player writing style
- Persistent action suggestions between sessions

### World Tracking

- Character relationships and dispositions with portrait support
- Location visits and changes with automatic discovery
- Inventory management with equipment tracking
- Quest/story beat progression (milestones, revelations, plot points)
- In-story time tracking (years, days, hours, minutes)
- Collapsible UI cards for all world elements

### Templates

- Built-in genre templates (fantasy, sci-fi, mystery, horror, slice of life)
- Custom template creation with system prompts
- Initial state configuration (protagonist, locations, items)
- Opening scene text support

### Prompt Packs

- Preset packs bundle the narrative/system prompt templates (LiquidJS) used for generation, assignable per story
- Custom pack variables and per-entity runtime variables (character/location/item/story-beat) surfaced in prompts
- Per-story custom system prompt override (Liquid-enabled), with a live variable reference
- Import/export packs as `.prompt.json`
- "Start from" a bundled starter pack when creating a pack (see the Transformation Engine below)

### Content & Narrative Control

- **Content rating** per story (standard / mature / explicit) that injects matching content guidance into the narrative prompt
- **Post-history instructions** — Liquid-enabled directives injected after the story history, immediately before generation (the strongest steering position)
- Per-story POV, tense, tone, and writing-style controls

### Image Generation

- Embedded inline images (`<pic>` tags), AI-detected "agentic" scene illustration, character portraits, and background images
- Structured prompt build order (rating → camera → character count → isolated per-character descriptions → environment) with **anti-bleed multi-character rules** (count tag, per-character clauses with spatial anchors)
- Automatic **prompt dialect** per model: Danbooru tags + quality prefix + default and size-aware negative prompts for anime tag models (Illustrious/Pony/NoobAI), natural language for LLM-encoder models
- **Per-character image-tag bank** — curated (or AI-generated from the character description) physical-only identity tags that lock a character's look across every generated image
- **Per-character LoRA** — trigger words injected into prompts (all providers) plus a LoRA file whose weight can scale with the transformation tier (ComfyUI)
- Character portraits and sprite anchors as img2img references for visual consistency (ComfyUI runs them through a bundled IPAdapter identity workflow)
- Multiple providers: ComfyUI, A1111/Forge, OpenAI, Google, OpenRouter, NanoGPT, Chutes, Zhipu, Pollinations (any LoRA-capable local backend supported through ComfyUI)
- Visual-novel sprite engine (banded per-character sprite sets with expression cells) and optional visual-prose (HTML/CSS) output
- Selectable art styles (Classic Anime default), configurable image sizes, and per-task profiles (main / portrait / reference / sprite)

### Transformation Engine (Adult, Optional)

An opt-in, per-story engine for adult transformation-themed (breast-expansion) storytelling. Disabled by default; enable it in Story Settings.

- Deterministic body-state reducer: the classifier proposes transformation **events** each turn and a reducer applies them, keeping a canonical size **tier** as the single source of truth (cup letters, bands, and prose are derived, never stored)
- Gated growth with cooldown, growth-pressure, size-lock, and per-story growth cosmology/pacing
- Soft states (transformation attitude, arousal, fluids) proposed by the classifier and clamped
- `[BODY STATE]` and `[BE GENRE RULES]` blocks injected into the narrative prompt so the engine (not world lore) is the authority on when and how much growth happens
- Frame baseline (height/build) auto-seeded from character descriptions; frame weight, band, and measurements derive from it
- Size grounding for images (exact-tier bridge markers, body-relative size anchors above band saturation, graduated engorgement cues, size-aware negative prompts), banded sprite sets, and tier-scaled LoRA weighting all read from the engine
- A bundled **"Breast Expansion (NSFW)"** prompt pack (a prose-craft companion) can be created from the "Start from" option in the pack creator

### Save and Restore

- Named checkpoints with full state snapshots
- Retry system for undoing actions and generating alternatives
- Character and time state preservation on retry

### Network Sync

- Local network sync between devices
- QR code connection for easy pairing
- Push/pull stories between devices
- Server mode for sharing stories

### UI Customization

- Multiple themes (dark, light, light solarized, retro console, fallen down)
- Custom font selection (system or Google fonts)
- Adjustable text size (small, medium, large)
- Word count display toggle

### Cross-Platform

- Desktop (Windows, macOS, Linux)
- Android (APK)
- iOS (planned)

## Installation

### Download Pre-built Binaries

Pre-compiled binaries are available on the [Releases](https://github.com/AventurasTeam/Aventuras/releases) page:

| Platform | Download                                  |
| -------- | ----------------------------------------- |
| Windows  | `aventuras_x.x.x_x64-setup.exe`           |
| macOS    | `aventuras_x.x.x_x64.dmg`                 |
| Linux    | `aventuras_x.x.x_amd64.deb` / `.AppImage` |
| Android  | `aventuras-release.apk`                   |

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Frontend Framework**: SvelteKit 2
- **State Management**: Svelte 5 runes (`$state`, `$derived`, `$props`)
- **Backend Framework**: Tauri 2 (Desktop/Android via Rust)
- **Styling**: Tailwind CSS, shadcn-svelte
- **Database**: SQLite (via `@tauri-apps/plugin-sql`)
- **AI**: OpenAI-compatible APIs (OpenRouter, AI SDK), Local NLP via Harper.js (WASM)
- **Package Manager**: npm

## Development

### Requirements

- Node.js 18+
- Rust (latest stable)
- (Optional) Android SDK, NDK, Java 17+ for Android builds

### Setup & Run Commands

```bash
# Clone the repository
git clone https://github.com/AventurasTeam/Aventuras.git
cd aventuras

# Install dependencies
npm install

# Start Tauri development window (Desktop)
# Hot-reloading is fully supported for all Svelte/TypeScript code changes
npx tauri dev
```

### Scripts

Available `npm run` scripts:

- `build`: Build for production
- `check`: Run `svelte-check` (type checking)
- `check:watch`: Watch mode type checking
- `test`: Run the unit test suite (`vitest run`)
- `test:watch`: Run tests in watch mode (`vitest`)
- `tauri`: Tauri CLI commands
- `release`: Run release script (`node scripts/release.js`)
- `lint`: Run ESLint
- `lint:fix`: Fix ESLint issues
- `format`: Format code with Prettier

### Tests

Unit tests run on **Vitest** (`npm test`). Coverage is focused on the pure engine and
image-pipeline logic — the transformation reducer/ladder/drift, prompt assembly, LoRA
binding, identity-tag resolution, and sprite hashing.

```bash
npm test          # run once
npm run test:watch  # watch mode
```

### Environment Variables

- TODO: Document any required or optional environment variables (e.g., specific build or deployment variables).
- **API Keys**: Configured primarily via the UI (Settings -> API Settings).

### Project Structure

```text
aventuras/
├── src/                  # SvelteKit frontend source
│   ├── routes/           # SvelteKit pages (+page.svelte, +layout.svelte)
│   ├── lib/              # Shared application logic and components
│   │   ├── components/   # UI components (PascalCase.svelte)
│   │   ├── services/     # Business logic classes/modules (AI, DB, etc.)
│   │   ├── stores/       # Svelte stores (*.svelte.ts for runes)
│   │   ├── types/        # TypeScript types
│   │   └── utils/        # Utility functions
├── src-tauri/            # Rust backend
│   ├── gen/android/      # Android scaffold files (DO NOT OVERWRITE)
│   ├── src/              # Rust source code
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── static/               # Static web assets
├── scripts/              # Build and utility scripts
├── package.json          # Node dependencies and scripts
```

### Building Release Binaries

<details>
<summary>Click to expand build instructions</summary>

#### Building Desktop

```bash
npx tauri build
```

#### Building Android

**IMPORTANT**: The Android project scaffold (`src-tauri/gen/android/`) is tracked in git.
**Do NOT run `npx tauri android init`** as it will overwrite customizations.

```bash
# Dev build + deploy to device/emulator
npx tauri android dev

# Release build (unsigned APK)
npx tauri android build
```

The unsigned APK will be at:

```text
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

#### Signing APK

```bash
# Create keystore (first time only)
keytool -genkey -v -keystore release.keystore -alias myalias -keyalg RSA -keysize 2048 -validity 10000

# Align APK
zipalign -v 4 app-universal-release-unsigned.apk app-aligned.apk

# Sign APK
apksigner sign --ks release.keystore --ks-key-alias myalias --out app-release.apk app-aligned.apk
```

</details>

## Acknowledgments

- [Tauri](https://tauri.app/) - Desktop/mobile app framework
- [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [OpenRouter](https://openrouter.ai/) - LLM API aggregator
- [Harper](https://writewithharper.com/) - Grammar checking
- [Lucide](https://lucide.dev/) - Icon library

## License

AGPL-3.0
