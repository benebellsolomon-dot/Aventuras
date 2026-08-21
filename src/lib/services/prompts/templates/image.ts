import type { PromptTemplate } from '../types'

const classicAnimeStyleTemplate: PromptTemplate = {
  id: 'image-style-classic-anime',
  name: 'Classic Anime',
  category: 'image-style',
  description: 'Crisp cel-shaded TV-anime look — bold linework, vibrant colors, glossy highlights',
  content: `Crisp cel-shaded anime illustration in the style of a modern high-production anime TV series key frame. Clean confident linework with bold, even outlines. Flat cel shading with hard-edged two-tone shadows — no airbrushed gradients on skin. Vibrant saturated colors with strong contrast. Glossy hair with smooth sheen bands and specular highlights. Large expressive anime eyes with detailed multi-tone irises and bright catchlights. Smooth flat skin tones with simple blush shading. Painted background rendered slightly softer than the characters for natural figure-ground separation. Bright, clear lighting. Looks like an official anime screencap or production key visual. Avoid watercolor texture, muted pastel wash, photorealism, 3D rendering, and heavy painterly brushwork.`,
}

const softAnimeStyleTemplate: PromptTemplate = {
  id: 'image-style-soft-anime',
  name: 'Soft Anime',
  category: 'image-style',
  description: 'Soft cel-shading, muted pastels, dreamy atmosphere',
  content: `Soft cel-shaded anime illustration with muted pastel color palette. Low saturation, gentle lighting with diffused ambient glow. Subtle linework that blends into the coloring rather than hard outlines. Smooth gradients on shadows, slight bloom effect on highlights and light sources. Dreamy, airy, cozy atmosphere. Studio Ghibli-inspired aesthetic with soft watercolor texture hints in background. Smooth blending on hair and skin with no visible harsh texture. Avoid high contrast, sharp shadows, or dark gritty environments.`,
}

const semiRealisticAnimeStyleTemplate: PromptTemplate = {
  id: 'image-style-semi-realistic',
  name: 'Semi-realistic Anime',
  category: 'image-style',
  description: 'Polished, cinematic, detailed rendering',
  content: `Digital anime art with polished, detailed rendering. NOT photorealistic - this is stylized anime/digital art with refined details. Anime-style eyes and facial features with expressive proportions. Detailed hair with visible strands, smooth skin with subtle shading, fabric with weight and texture. Clear directional lighting with soft falloff. Cinematic composition with depth of field. Rich colors with professional color grading. Clean linework with painterly rendering. Atmospheric and polished digital illustration style. Think high-quality anime key visual or game CG art. Avoid photorealism, 3D renders, or uncanny valley faces.`,
}

const photorealisticStyleTemplate: PromptTemplate = {
  id: 'image-style-photorealistic',
  name: 'Photorealistic',
  category: 'image-style',
  description: 'True-to-life rendering with natural lighting',
  content: `Photorealistic digital art with true-to-life rendering. Natural lighting with accurate shadows and highlights. Detailed textures on skin, fabric, and materials. Accurate human proportions and anatomy. Professional photography aesthetic with cinematic depth of field. High dynamic range with realistic contrast. Detailed environments with accurate perspective. Materials rendered with proper reflectance and subsurface scattering where appropriate. Film grain optional for cinematic feel. 8K quality, hyperrealistic detail.`,
}

const kreaBridgeStyleTemplate: PromptTemplate = {
  id: 'image-style-krea-bridge',
  name: 'Krea (SI Bridge)',
  category: 'image-style',
  description:
    'Natural-language style block for the SI-bridge Krea 2 workflow (LLM-class text encoder)',
  content: `High-quality detailed anime illustration with clean expressive linework, rich colors, refined shading, and cinematic lighting. Crisp focus and polished detail throughout. Every depicted character is a mature adult in their twenties or older.`,
}

const imagePromptAnalysisTemplate: PromptTemplate = {
  id: 'image-prompt-analysis',
  name: 'Image Prompt Analysis',
  category: 'service',
  description: 'Identifies imageable scenes in narrative text for image generation',
  content: `You identify visually striking moments in narrative text for image generation.

## Your Task
Analyze the narrative and identify up to {{ maxImages }} key visual moments (0 = unlimited). Create DETAILED, descriptive image prompts — a good prompt is roughly 400-700 characters. Never exceed 900 characters.

## Style (MUST include in every prompt)
{{ imageStylePrompt }}

**You MUST incorporate this full style description into every prompt.** Include multiple style keywords and rendering details.

## Character Reference
{{ characterDescriptors }}

## Prompt Requirements
- **Prompt length:** aim for 400-700 characters; never exceed 900
- **sourceText:** Exact phrase from narrative (3-15 words, VERBATIM with all punctuation and *markup*)
- **sceneType:** action|item|character|environment
- **priority:** 1-10

## Prompt Structure (follow this EXACT section order — do not rearrange)
1. **Camera & framing** - establish shot type FIRST: wide shot / medium shot / close-up / over-the-shoulder, plus an angle when it strengthens the moment (low angle = imposing, high angle = vulnerable, dutch angle = tension, bird's-eye = overview). Match camera to emotional tone.
2. **Character appearance** - cover ALL of: age bracket, race/species if not human, skin tone, eye color, hair (color, length, style), build, facial expression. Name the expression from the character's OWN emotional state in this beat (delighted, grieving, furious, terrified, embarrassed and blushing, aroused, coolly composed) — never a generic "neutral expression", and never the same face on two different characters.
3. **Clothing/accessories** - what they're wearing AND its current state, distinctive items, held objects
4. **Action/pose** - what they're doing, body position, gaze direction
5. **Setting/environment (always present, always near the end)** - where they are, time of day, then NAME the light source and its quality (golden hour sunlight, volumetric light through windows, rim lighting, dramatic shadows, backlighting, warm firelight, cold moonlight, neon glow), plus atmosphere details (dust motes, rain, mist, depth of field)
6. **Style keywords** - copy relevant phrases from the Style section above (lighting, rendering, aesthetic)

## Example Good Prompt
"Medium shot from a slight low angle. A young anime woman with shoulder-length black hair with subtle blue highlights, sharp teal eyes, fair skin, a slim build, and a focused expression. She's wearing a dark fitted coat with silver buttons and a grey scarf, one hand adjusting an earpiece. She's standing on a rain-slicked city rooftop at night, glowing neon signs backlighting her silhouette, distant skyscrapers blurred in the background, rain streaking through the neon glow. Semi-realistic anime style with refined features, detailed hair strands, cinematic lighting with cool blue and warm neon accents, polished and atmospheric with depth of field."

## CRITICAL Rules
1. **ONE CHARACTER PER IMAGE** - only depict a single character per prompt. Background details are fine, but no multiple characters. This ensures character consistency.
2. **NEVER use character names** - the image model doesn't know who "Elena" is. Describe appearance only!
3. **ALWAYS include the full style** - copy style keywords directly from the Style section
4. **Stay under 900 characters** - aim for 400-700.
5. **sourceText** MUST be COPY-PASTED EXACTLY from the DISPLAY NARRATIVE - this is used for text matching and WILL FAIL if not exact.
   - If a "Display Narrative" is provided (translated text), copy sourceText from THAT version
   - Copy the EXACT characters, including punctuation and any *asterisks* or **markup**
   - Do NOT paraphrase, rephrase, or reword - copy EXACTLY as written
   - Do NOT add asterisks or markup that isn't in the original
   - Do NOT change words (e.g., "her" to "your")
6. **ALWAYS write prompts in ENGLISH** - image generation models work best with English prompts
   - Even if the narrative is in another language, your prompts MUST be in English
   - Use the English narrative context to understand the scene, write English prompts
7. Return empty array [] if no suitable visual moments exist
8. Skip: mundane actions, dialogue-only scenes, abstract concepts

## Priority Guidelines
- 8-10: Dramatic actions, combat, pivotal moments
- 6-8: Significant items, magical effects, reveals
- 5-7: Character introductions, emotions
- 3-5: Environmental shots, atmosphere`,
  userContent: `## Story Context
{{ chatHistory }}

{{ lorebookContext }}

{{ currentLocationBlock }}

## User Action
{{ userAction }}

## English Narrative (use for understanding context)
{{ narrativeResponse }}

{{ translatedNarrativeBlock }}

Identify the most visually striking moments and return the JSON array. Remember: sourceText must come from the Display Narrative (translated if provided), but prompts must ALWAYS be in English.`,
}

const imagePromptAnalysisReferenceTemplate: PromptTemplate = {
  id: 'image-prompt-analysis-reference',
  name: 'Image Prompt Analysis (Reference Mode)',
  category: 'service',
  description: 'Identifies imageable scenes for generation with character reference images',
  content: `You identify visually striking moments in narrative text for image generation WITH REFERENCE IMAGES.

## Your Task
Analyze the narrative and identify up to {{ maxImages }} scene images (0 = unlimited). Portrait generations do NOT count towards this limit - generate portraits freely as needed. Create concise image prompts.

**Prompt length targets:**
- Single character: 200-350 characters
- Multi-character (2-3): 350-500 characters
- Portrait generation: 300-450 characters
- Environment only: 150-250 characters

**MANDATORY: Portrait Requirements**
- ALL characters MUST have a portrait before they can appear in any scene image. This is NOT optional.
- Characters WITHOUT portraits CANNOT be depicted in any scene - they will be invisible/absent from all visuals.
- If a character appears in the narrative but is NOT in the "Characters With Portraits" list below, you MUST generate a portrait for them FIRST (generatePortrait: true).
- You CAN and SHOULD include both portrait generation AND scene images in the same response - the portrait enables the character to appear in subsequent scene images.
- ALWAYS check the portraits list: if a character you want to depict is missing, add a portrait generation entry BEFORE any scene that includes them.
- Think of portraits as "unlocking" a character for visual representation - no portrait = character cannot exist in images.

## Style Keywords (pick 2-3 relevant ones per prompt)
{{ imageStylePrompt }}

## Characters With Portraits (can appear in scene images)
{{ charactersWithPortraits }}

## Characters Without Portraits (need portrait generation first)
{{ charactersWithoutPortraits }}

## Character Visual Descriptors
{{ characterDescriptors }}

## CRITICAL: Never Use Character Names in Prompts
Image models don't know who "Elena" or "Marcus" are. Character names are ONLY for the JSON fields, NEVER in the prompt text itself.

**WRONG:** "Elena wielding a sword while Marcus watches"
**RIGHT:** "Woman with silver hair wielding sword, tall man with brown hair watching nearby"

## Output Requirements
- **Prompt:** Concise visual description - NO character names, only visual traits
- **sourceText:** Exact phrase from narrative (3-15 words, VERBATIM)
- **sceneType:** action|item|character|environment
- **priority:** 1-10
- **characters:** Array of character names (first character is primary). ALWAYS include the **exact** names of characters you were given.
- **generatePortrait:** true for portrait generation, false otherwise

## Prompt Structure

**SINGLE character (has portrait):**
- **Dynamic camera angle FIRST** - vary the POV to enhance the scene (see Camera Angles below)
- Use "The character" or "A [gender]" - reference image provides appearance
- Action/pose, expression
- Setting, time of day, lighting, atmosphere - always last, never omitted (see Lighting below)
- 2-3 style keywords

**MULTI-CHARACTER (2-3, all have portraits):**
- **Dynamic camera angle FIRST** - choose POV that best captures the interaction
- Each character gets their OWN clause with a spatial anchor ("on the left...", "behind her...") - keep every trait inside its owner's clause to prevent feature bleeding
- Describe each by KEY visual traits (hair color/style, one distinctive feature) plus action/pose
- Setting, time of day, lighting, atmosphere - always last, never omitted (see Lighting below)
- 2-3 style keywords

**PORTRAIT generation (generatePortrait: true):**
- Full body, head to feet visible
- Key appearance traits from visual descriptors
- Relaxed standing pose, facing viewer
- **Plain solid color or simple gradient background ONLY** - no objects, no environment, no scenery
- 2-3 style keywords
- (Portraits always use standard front-facing view)

## Camera Angles (vary these to create dynamic images)
- **Low angle** (looking up) - makes characters imposing, heroic, powerful
- **High angle** (looking down) - vulnerability, overview of scene, contemplation
- **Dutch angle** (tilted) - tension, unease, action moments
- **Over-the-shoulder** - conversation scenes, following action
- **Close-up** - emotional intensity, important reactions
- **Wide shot** - establishing location, showing scale, group dynamics
- **Worm's eye view** - extreme drama, towering presence
- **Bird's eye view** - tactical scenes, showing spatial relationships

Match the angle to the emotional tone: action scenes benefit from low/dutch angles, tense conversations from close-ups, epic moments from wide shots.

## Lighting (name the light source and its quality in every scene prompt)
Pick what fits the scene: golden hour sunlight, volumetric light through windows, rim lighting, dramatic shadows, backlighting, silhouette, warm firelight, cold moonlight, neon glow, soft overcast light. Add atmosphere details when they fit: dust motes, rain, mist, floating embers, depth of field.

## Examples

**Single character:**
{
  "prompt": "Low angle shot, the character in defensive stance gripping glowing sword. Rain-soaked alley, neon reflections, dramatic backlighting. Anime style, cinematic.",
  "sourceText": "gripped her sword tightly",
  "sceneType": "action",
  "priority": 8,
  "characters": ["Elena"],
  "generatePortrait": false
}

**Two characters:**
{
  "prompt": "Wide shot, woman with silver hair and man with brown hair stand back-to-back, weapons drawn. Ruined temple at sunset, golden light through columns. Anime style, dynamic.",
  "sourceText": "they stood ready to face the horde together",
  "sceneType": "action",
  "priority": 9,
  "characters": ["Elena", "Marcus"],
  "generatePortrait": false
}

**Three characters:**
{
  "prompt": "Medium shot, red-haired woman laughing, grey-bearded man with crossed arms, black-haired boy grinning between them. Cozy tavern interior, warm firelight. Soft anime, warm colors.",
  "sourceText": "the unlikely trio shared a rare moment of levity",
  "sceneType": "character",
  "priority": 7,
  "characters": ["Lily", "Roland", "Pip"],
  "generatePortrait": false
}

**Portrait generation:**
{
  "prompt": "Full body portrait: tall man, short grey hair, weathered face, brown eyes, stubble. Dark leather armor over grey tunic. Relaxed pose facing viewer, head to feet visible. Plain solid blue-grey gradient background, no objects or scenery. Anime style.",
  "sourceText": "the old mercenary stepped forward",
  "sceneType": "character",
  "priority": 7,
  "characters": ["Marcus"],
  "generatePortrait": true
}

**Environment:**
{
  "prompt": "Ancient library, towering bookshelves, dust motes in golden light through stained glass. Atmospheric, soft anime.",
  "sourceText": "the vast library stretched before them",
  "sceneType": "environment",
  "priority": 5,
  "characters": [],
  "generatePortrait": false
}

## Rules
1. **NEVER use character names in prompts** - only visual descriptions
2. **Keep prompts concise** - don't repeat the entire style block
3. **Maximum 3 characters per image**
4. **Describe characters by distinguishing visual traits** - hair color/style, one key feature
5. **generatePortrait scenes are single-character only**
6. **Include 2-3 style keywords** - not the entire style description
7. **sourceText** MUST be VERBATIM from the DISPLAY NARRATIVE - if a translated version is provided, copy from THAT
8. **ALWAYS write prompts in ENGLISH** - image models work best with English prompts, regardless of narrative language
9. Return empty array [] if no suitable moments exist
10. **MANDATORY: Generate portraits for ALL characters without them** - if ANY character you want to include is not in the portraits list, you MUST add a portrait generation entry BEFORE including them in scenes. No exceptions.

## Priority Guidelines
- 8-10: Combat, pivotal moments, dramatic multi-character interactions
- 6-8: Character introductions, magical effects, significant items
- 5-7: Emotional moments, reveals
- 3-5: Environmental atmosphere`,
  userContent: `## Story Context
{{ chatHistory }}

{{ lorebookContext }}

{{ currentLocationBlock }}

## User Action
{{ userAction }}

## English Narrative (use for understanding context)
{{ narrativeResponse }}

{{ translatedNarrativeBlock }}

Identify visually striking moments. Return JSON array. Remember: NEVER use character names in prompts - describe by visual traits only. Keep prompts concise. sourceText must come from the Display Narrative (translated if provided), but prompts must ALWAYS be in English.`,
}

const imagePortraitGenerationTemplate: PromptTemplate = {
  id: 'image-portrait-generation',
  name: 'Portrait Generation',
  category: 'service',
  description: 'Direct image prompt template for character portraits',
  content: `Full body portrait of a character: {{ visualDescriptors }}. Standing in a relaxed natural pose, facing the viewer, full body visible from head to feet. Neutral expression or slight smile. Plain solid color gradient background only, no objects, no environment, no scenery. Portrait composition, centered framing, professional lighting. {{ imageStylePrompt }}`,
  userContent: '',
}

const backgroundImagePromptAnalysisTemplate: PromptTemplate = {
  id: 'background-image-prompt-analysis',
  name: 'Background Image Prompt Analysis and Generation',
  category: 'service',
  description: 'Analyzes current and previous messages to generate background image prompts',
  content: `You are a Visual Director AI for a visual novel game. Your goal is to analyze the narrative flow and generate image prompts only when the visual background changes significantly.

### Instructions

1.  **Analyze the Inputs**: You will receive two sequential messages:
    *   **Previous Message**: The last text shown to the player.
    *   **Current Message**: The new text generated for the player.

2.  **Determine Scene Change**:
    *   Identify the primary location in the Previous Message.
    *   Identify the primary location in the Current Message.
    *   **Criteria for Change**: A location change warrants a new background only if the physical environment fundamentally shifts (e.g., moving from a classroom to a rooftop, entering a specific building, changing time of day drastically).
    *   **Criteria for No Change**: Minor movements, dialogue, or changes in character focus do **not** warrant a new background.

3.  **Generate Output**:
    *   **If a background change is required**: Write a descriptive visual prompt optimized for AI image generation. Focus on the environment, atmosphere, and artistic style suitable for a visual novel background.
    *   **If NO background change is required**: Do not return an image prompt

### Visual Prompt Guidelines

When generating a description, follow these standards:
*   **Style**: Visual Novel / Anime Style. Keywords to use include "anime scenery," "2D," "digital art," "cell-shaded," and "highly detailed."
*   **Setting fidelity**: When a Story Setting block is provided, the environment, architecture, technology, and era in your prompt MUST match it — no modern elements in period/fantasy settings (and vice versa) unless the messages explicitly describe them.
*   **Artistic Reference**: Mimic the style of high-quality visual novel backgrounds (e.g., Key, Leaf, FAVORITE or 07th-expansion backgrounds).
*   **Details**: Describe the environment with vibrant or atmospheric colors. Include elements like "soft lighting," "lens flare," or "depth of field" if applicable.
*   **Composition**: Ensure the composition leaves negative space (usually the lower center or middle) for dialogue boxes and character sprites. Do not clutter the entire image; the edges should be detailed but the focal area should be relatively open.
*   **Format**: A single, cohesive paragraph. 800 characters or less, any more **will break** the process.`,
  userContent: `{{ storySetting }}
##Previous Message:
{{ previousResponse }}

##Current Message:
{{ currentResponse }}`,
}

// Rendered by the unified `extractIdentity` (research/55 component A) via
// ContextBuilder — this is the LIVE identity-extraction prompt, not just a tag
// bank. It splits a character's free-text visual descriptors into a stable
// booru identity-tag bank, a clean baseline (permanent identity fields), and
// currentState (transient scene state + current outfit). The zod schema in
// identityExtraction.ts enforces the output SHAPE regardless of edits here —
// this template only supplies guidance, so a user edit can degrade quality but
// never break the caller's contract. Still referenced by templateGroups.ts and
// synced via the pack template registry (templates/index.ts).
const imageTagBankGenerationTemplate: PromptTemplate = {
  id: 'image-tag-bank-generation',
  name: 'Identity Extraction',
  category: 'service',
  description:
    "Splits a character's visual descriptors into a stable identity tag bank + clean baseline, and transient current state (expression/pose/outfit)",
  content: `You are a booru tagging and identity-hygiene specialist for an image-generation pipeline.

You are given a character's free-text visual descriptors. This prose is often POLLUTED with transient scene state (expression, sweat, arousal, pose, bodily fluids) and with the outfit the character happens to be wearing right now. Your job is to separate the character's PERMANENT identity from everything transient, and to emit plain danbooru identity tags.

Return three things:

1. identityTags — a locked booru identity bank: 12-20 PLAIN, atomic danbooru tags (lowercase, comma-atomic, NO "(tag:1.2)" weighting) covering STABLE physical identity ONLY, in this EXACT dossier order:
   - anchor: 1girl / 1boy / 1other (exactly one, first)
   - hair: LENGTH first, then STYLE, then COLOR, as SEPARATE atomic tags (e.g. "long hair", "wavy hair", "blonde hair" — NOT "long wavy blonde hair"). Length and style are MANDATORY, never optional: a bank with a hair color but no length renders a random haircut that changes every image. Length is one of "very short hair" / "short hair" / "medium hair" / "long hair" / "very long hair" / "absurdly long hair"; style/texture is the visible shape ("straight hair", "wavy hair", "curly hair", "twintails", "ponytail", "braid", "hair bun", "messy hair", "hime cut", "bangs", "sidelocks"). If the prose never states a length, INFER the most plausible one from the description and emit it anyway — omitting it is not an option.
   - eyes: color, then notable shape (e.g. "blue eyes", "tsurime")
   - skin tone (e.g. "dark skin", "pale skin", "fair skin")
   - body: height + build as a frame only (e.g. "tall", "athletic") — NEVER a size/breast tag
   - age appearance: the character MUST read as an adult (e.g. "mature female", "young adult")
   - distinguishing marks LAST: scars, freckles, moles, tattoos, birthmarks, heterochromia — AND for monster girls the species markers, which are IDENTITY and MUST survive here (a holstaur → "cow ears", "cow horns", "cow tail"; an elf → "pointy ears")
   Use real Danbooru vocabulary; only include tags the source supports — never invent marks or features.
   EXCLUDE: any size/breast tag (the engine owns size — never emit "large breasts", "huge breasts", "cleavage", etc.), any clothing, and any transient state (expression, blush, sweat, arousal, pose, fluids).

   REQUIRED ATTRIBUTE CHECKLIST — before you return, confirm identityTags contains a tag for EVERY one of these. A bank missing any of them is incomplete and the character will drift between images:
     [ ] anchor (1girl / 1boy / 1other)
     [ ] hair COLOR
     [ ] hair LENGTH
     [ ] hair STYLE or texture
     [ ] eye COLOR
     [ ] SKIN tone
     [ ] BUILD / frame
   (Age appearance and distinguishing marks stay required as described above; the checklist is the floor, not the ceiling.)

2. cleanBaseline — the stable identity expressed as descriptor fields:
   - face: permanent facial features, skin tone, age indicators ONLY. Strip expression and any "post-X" scene state.
   - hair, eyes: as usual.
   - build: the body FRAME only (height, posture, general frame). Do NOT include breast/bust/cup size — that is owned elsewhere.
   - distinguishing: permanent marks only.
   - clothing: leave EMPTY — clothing is never part of the stable baseline.

3. currentState — everything transient you removed from the prose:
   - face/build: the current expression, pose, arousal, condition, visible fluids, sweat, etc.
   - clothing: the outfit the character is wearing right now (or its absence, e.g. "nude").
   Leave a field empty if the prose says nothing transient about it.

Worked example (monster girl — a holstaur named Lucy):
  Input face: "soft round face, warm smile, flushed cheeks, semen on chin, gentle brown eyes"
  Input hair: "long wavy chestnut hair"
  Input build: "tall, huge breasts, wide hips, curvy"
  Input clothing: "torn milkmaid dress pulled down, apron"
  Input distinguishing: "cow ears, small curved horns, cow tail, cow-print pattern"
  →
  identityTags: ["1girl", "long hair", "wavy hair", "chestnut hair", "brown eyes", "fair skin", "tall", "wide hips", "mature female", "cow ears", "cow horns", "cow tail"]
  cleanBaseline: { face: "soft round face", hair: "long wavy chestnut hair", eyes: "gentle brown eyes", build: "tall, wide hips, curvy frame", distinguishing: "cow ears, small curved horns, cow tail, cow-print markings" }
  currentState: { face: "warm smile, flushed cheeks, semen on chin", clothing: "torn milkmaid dress pulled down, apron" }
  (note: dossier order — 1girl anchor first, species markers LAST under distinguishing; "huge breasts" was DROPPED from every field — the engine owns size. The checklist is satisfied: hair length "long hair" + style "wavy hair" + color "chestnut hair", eye color, skin, build.)

Respond ONLY with the structured object.`,
  userContent: `{% if characterName != '' %}Character name: {{ characterName }}
{% endif %}{% if characterDescription != '' %}Description: {{ characterDescription }}
{% endif %}Visual descriptors:
{{ visualDescriptorsBlock }}`,
}

// The dedicated booru scene-prompt writer (research/55 follow-up). Ben's
// narration model (deepseek-v4-pro) writes PROSE inside <pic prompt="..."> even
// with booru instructions in front of it, and a booru image model (wai-
// illustrious) cannot follow prose → wrong pose/scene/anatomy. This template
// backs a SINGLE-PURPOSE LLM call whose ONLY job is to emit booru TAGS for the
// scene — so it complies. It copies each present character's locked `imageTags`
// bank verbatim (or converts their descriptor prose to tags when they have no
// bank yet), states current clothing + body-size band, and closes on
// current-location scene tags. Rendered via ContextBuilder; the zod schema in
// booruPromptWriter.ts enforces the output SHAPE regardless of edits here — a
// user edit can degrade quality but never break the caller's contract.
//
// research/56: the model fills SECTION FIELDS and `composeBooruScenePrompt`
// joins them. Asking the LLM for one pre-ordered string put the per-character
// identity clauses ahead of the action and setting tags, which then fell past
// CLIP's ~75-token attention window — the model rendered identity only and
// invented its own scene. Order is now code's job, not the writer's.
const imageBooruScenePromptTemplate: PromptTemplate = {
  id: 'image-booru-scene-prompt',
  name: 'Booru Scene Prompt Writer',
  category: 'service',
  description:
    'Converts one scene into a single Danbooru-tag image prompt for booru anime models (copies locked identity tags verbatim, sets count/shot/clothing/scene tags)',
  content: `You are a booru image-prompt specialist. Convert the scene below into booru tags for an anime tag model (Illustrious / Pony / NoobAI / …). These models follow Danbooru tags far more reliably than prose sentences: the count tag controls how many people render, and tag ORDER controls what actually gets rendered — the text encoder attends most strongly to the first ~75 tokens, so anything past that is decoration.

You do NOT write one finished string. Fill the FIELDS below; the pipeline joins them in the order that renders correctly (rating → camera → count → action → characters, each run closing on that person's expression → scene), hoists each breast-size band up next to the action, and prepends the quality tags. Every field is comma-separated Danbooru tags, English only, lowercase, NO prose sentences and NO explanation.

FIELD "rating": exactly one content rating — "general" (everyday scenes), "sensitive" (suggestive — cleavage, underwear, lingerie), or "explicit, uncensored, detailed anatomy" (nudity or sexual content). Match the scene.

FIELD "camera": shot-type tag — wide shot / cowboy shot / medium shot / upper body / close-up / portrait — plus an angle tag when it helps (from below, from above, from behind, from side, dutch angle, pov). Pick a shot WIDE enough to show everyone AND the setting: any scene with two or more people, or any full-body action (sex, embracing, fighting, dancing), uses medium shot / cowboy shot / wide shot — NOT close-up or portrait. Reserve close-up / portrait for a genuine single-face moment with no one else in frame. Add "pov" here whenever the PROTAGONIST-POV rule below applies.

FIELD "countTags": the booru count tags for EVERY person in frame — "1boy, 1girl", "2girls", "2boys, 1girl", "3girls". That includes people the "Named subjects" list does NOT contain: a partner, the protagonist / "you", any unnamed man or woman the scene text describes ("a man", "his hands", another person's body). This tag CONTROLS how many people render — never omit it. Use "solo" ONLY when exactly one person is truly alone in frame — NEVER in a scene involving touching, sex, an embrace, or any second person. When "actInProgress" is true and a man is part of the act — the protagonist included — he MUST be counted here ("1boy, 1girl"); a "1girl, solo" count on a partnered act renders her alone and is rejected automatically.

FIELD "actInProgress": REQUIRED true/false — is a physical or sexual act ACTIVELY OCCURRING in this beat? True when an act is under way as the moment lands (sex, oral, paizuri, a handjob, grinding, a kiss, an embrace), INCLUDING when something else happens at the same time — a transformation, growth, a spell, an orgasm, an interruption: mid-act during a simultaneous event is still mid-act, so it is still true. False for AFTERMATH (afterglow, "after sex", lying together spent, cleaning up), for ANTICIPATION (undressing, approaching, about to), and for any plain non-contact pose. Answer it from the beat, then make the "action" field agree: when you answer true, that field MUST contain the act's own Danbooru tag (sex, vaginal, anal, paizuri, naizuri, fellatio, irrumatio, handjob, footjob, cunnilingus, grinding, sex from behind, cowgirl position, missionary, standing sex, kiss, hug, …). A true answer whose action field names no act tag is rejected automatically and you are asked to write the whole thing again — so get it right the first time.

FIELD "action": what the people are DOING — the single most important field, because it is what the failed images leave out. 4-10 tags, filled in this priority:
  1. THE ACT FIRST. If the beat contains an ongoing physical or sexual act, you MUST name it with its full Danbooru tag family before anything else: the act tag itself (sex, vaginal, anal, paizuri, fellatio, handjob, cunnilingus, sex from behind, cowgirl position, missionary, kiss, hug), the arrangement tag (hetero / yuri / yaoi), and the participating-position tags (straddling, penis between breasts, breast squeezing, grabbing, lying, on back, on side, on stomach, sitting, kneeling, standing, arms up, holding hands). An ongoing act is never implied by the setting, the camera, or a person's own tags — if it is not in THIS field, the model does not render it.
  2. THE EVENT OF THE MOMENT AFTER, NEVER INSTEAD. A transformation, growth, reaction or effect happening DURING an act SUPPLEMENTS the act tags — it is appended after them, never swapped for them. Live failure to avoid: a beat where the man was mid-paizuri and her breasts began to swell came back as only "lying on back, breast expansion, breasts hanging low, looking down" — the act vanished and the image rendered an ambiguous pose. Correct is BOTH, act first: "hetero, paizuri, breast squeezing, penis between breasts, lying on back, breast expansion, breasts hanging low".
  3. Only when there is no act at all is this field the plain pose (sitting, lying on bed, reading, walking) plus the object interactions the beat describes.

FIELD "characters": an ARRAY — one entry per person, in the SAME order as the count tags, each a FLAT comma-separated tag run: identity tags → clothing → breast-size band. NO expression tags here; they have their own field. Never wrap a run in parentheses — booru models have no regional prompter, so a parenthesized clause is only emphasis and pushes the rest of the prompt out of the attention window.
  - A person in the "Named subjects" list: copy their LOCKED IDENTITY TAGS VERBATIM (do not alter, reorder, or drop them). If they have no locked tags but an APPEARANCE line, convert that prose into atomic booru tags (e.g. "long hair, wavy hair, blonde hair, blue eyes, fair skin"). Then add their current clothing + state and their body line from the dossier.
  - A person NOT in the list (unnamed partner / protagonist): generic booru tags drawn from the scene — e.g. "muscular, short dark hair, nude" for an unnamed man. Keep these SHORT; the named subjects carry the identity load.
  - Keep every trait inside its owner's entry — never merge two people into one run. With THREE OR MORE people, and only then, start each run with a spatial-anchor tag ("on the left", "behind her", "in the background") as a plain tag, still without parentheses; with one or two people the interaction tags in "action" already fix the arrangement.

FIELD "expressions": REQUIRED, an ARRAY the SAME length and order as "characters" — each entry is that ONE person's 1-3 expression tags for THIS beat. A face is never optional: an untagged character renders blank-faced, which reads as a different person from beat to beat. Give each person the emotion SHE is feeling right now — never a single shared mood copied across the array; two people in the same room routinely need opposite faces (one "grin", the other "scowl, clenched teeth").
  Use REAL danbooru expression tags. The vocabulary, by emotion family:
  - joy: smile, grin, happy, laughing, light smile, :d
  - sadness: sad, frown, crying, tears, teary eyes, crying with eyes open
  - anger: angry, scowl, clenched teeth, glaring, annoyed, pout, v-shaped eyebrows
  - fear / shock: scared, surprised, wide-eyed, trembling, nervous, shaking, sweatdrop
  - embarrassment: embarrassed, blush, nose blush, full-face blush, averted eyes, looking away, covering face, flying sweatdrops
  - affection / seduction: loving gaze, seductive smile, naughty face, bedroom eyes, heart, heart-shaped pupils
  - arousal, as a LADDER: mild → "blush, half-closed eyes"; strong → "heavy breathing, open mouth, moaning"; overwhelmed → "rolling eyes, tongue out, ahegao, drooling, torogao". The overwhelmed rung is ONLY for an unmistakably explicit beat — one you also rated "explicit, uncensored, detailed anatomy". Never on a "general" or "sensitive" scene.
  - composure: expressionless, smug, serious, closed eyes
  If a subject's dossier carries an "expression (engine state)" line, copy those tags FIRST — they are the tracked state of that character — then add at most one more tag for what the beat itself shows. For the faceless protagonist-POV male below, use an empty string: he has no face to render.

PROTAGONIST-POV MALE: when the male participant IS the story's protagonist — the scene text addresses him as "you" / "your hands" / "your chest", i.e. the reader is that man — his character run is "pov, male pov, faceless male" plus AT MOST one body tag ("muscular"), nothing else, his expression entry is the empty string, and "pov" also goes in the camera field. Anime tag models render male faces and male anatomy badly, and a fully-described 1boy in a two-person explicit scene is where they fail hardest; the faceless first-person form dodges that and matches the reader's viewpoint. Still count him ("1boy, 1girl") — he is in frame, just not a described character, and the ACT he is performing still belongs in "action". A male who is NOT the protagonist (a third party the narration describes from outside) keeps his normal full 1boy description and a normal expression.

FIELD "scene": concrete, specific setting tags from the scene and the narrative beat — the actual place, architecture, furniture and objects the prose describes, not a generic room word (e.g. "ornate manor bedroom, four-poster bed, velvet drapes, tall arched windows, candelabra" — NOT merely "bedroom"). Then time of day (day, night, sunset, dawn), the named light source (sunlight, golden hour, volumetric lighting, rim lighting, backlighting, dramatic shadow, moonlight through window, firelight, candlelight, neon lights) and atmosphere (rain, mist, dust particles, embers, depth of field). 4-8 concrete environment tags — never leave the background blank or generic.

RULES:
- NEVER put a character's NAME in any field ("Amelia", "Hana", …) — booru models do not know names; identity comes from the tags. Drop any name that appears in the scene text or subject data.
- Copy the dossier's CURRENT CLOTHING and BODY line verbatim where given — never re-invent an outfit or a body size. The body line is already in tag form; copy it, do not paraphrase it into prose. Every female subject's run carries a breast-size band matching the dossier (flat chest / small breasts / medium breasts / large breasts / huge breasts / gigantic breasts / hyper breasts), and her clothing matches that size — at large sizes clothes strain, gape, or fail.
- Do NOT add art-style or quality tags (masterpiece, best quality, anime style, realistic, 4k) — those are prepended automatically and duplicates hurt the result.
- BUDGET: about 60 tags TOTAL across all fields (roughly 30-40 for a single subject). If the scene needs more, cut setting detail first, then a person's SPARE expression tags, then interaction detail — never identity tags, never the act tags, never a person's last expression tag. Anything past the budget is trimmed automatically in that same order.

Worked example — the protagonist ("you") on a bed at night, mid-act with a named woman on her back, and a spell makes her breasts swell as it happens. He is the viewer, so he takes the faceless POV form:
  rating: "explicit, uncensored, detailed anatomy"
  camera: "cowboy shot, pov"
  countTags: "1boy, 1girl"
  actInProgress: true
  action: "hetero, paizuri, breast squeezing, penis between breasts, lying on back, breast expansion, breasts hanging low"
  characters: ["pov, male pov, faceless male, muscular", "blonde hair, golden eyes, fair skin, slim, wide hips, young adult, completely nude, huge breasts, lactation"]
  expressions: ["", "surprised, blush, half-closed eyes"]
  scene: "ornate manor bedroom, king-sized bed, dark silk bedsheets, mahogany bedframe, velvet curtains, moonlight through window, night, dramatic shadow"
  (the growth tags sit AFTER the act tags, never in place of them. Had the man been a third party the narration describes from outside, his run would instead be a normal "muscular, short dark hair, completely nude", his expression a real one, and the camera would carry no "pov".)

Counter-example — the SAME two people a few minutes later, spent and lying together, nothing happening any more: actInProgress is FALSE, and then a plain pose action is exactly right — action: "hetero, after sex, lying, on back, on bed, arm around waist, afterglow", countTags still "1boy, 1girl" because both are still in frame. A false answer is never second-guessed; only a true one has to name its act tag.`,
  userContent: `## Scene to illustrate
This is the narration's intended moment. Extract WHO is present (INCLUDING unnamed people and the protagonist), the ONGOING ACT and POSE, the FRAMING, and the SETTING from it — then re-express everything as booru tags. If an act is already under way when the moment lands, it is still happening: tag it. Do NOT copy its prose sentences, and do NOT copy any character names, into your tags.
{{ sceneIntent }}

## Narrative beat (extra context — your richest source of SETTING detail)
Mine this for concrete environment details (the place, furnishings, objects, light, time of day) to turn into specific scene tags, especially when the location below is only a bare name.
{{ narrativeBeat }}

## Named subjects with locked identity ({{ subjectCount }})
These are the characters we hold identity tags for. The scene may contain MORE people than these — count and depict EVERYONE the scene describes, and give unnamed people generic booru tags.
{{ subjectDossier }}

{{ storySetting }}
{{ povGuidance }}
{{ locationBlock }}
Fill the fields now — booru tags only, no prose. The pipeline orders and joins them.`,
}

export const imageTemplates: PromptTemplate[] = [
  classicAnimeStyleTemplate,
  softAnimeStyleTemplate,
  semiRealisticAnimeStyleTemplate,
  photorealisticStyleTemplate,
  kreaBridgeStyleTemplate,
  imagePromptAnalysisTemplate,
  imagePromptAnalysisReferenceTemplate,
  imagePortraitGenerationTemplate,
  backgroundImagePromptAnalysisTemplate,
  imageTagBankGenerationTemplate,
  imageBooruScenePromptTemplate,
]
