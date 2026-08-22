/**
 * Single dispatch the three generation seams call: the booru writer for
 * booru-dialect models, the prose writer for LLM-encoder models. Each is a
 * no-op for the other dialect, so the pair is safe to chain.
 */
import { resolveBooruScenePrompt, type ResolveBooruSceneInput } from './booruPromptWriter'
import { resolveProseScenePrompt } from './prosePromptWriter'

export type ResolveSceneInput = ResolveBooruSceneInput

export async function resolveScenePrompt(input: ResolveSceneInput): Promise<string> {
  const booru = await resolveBooruScenePrompt(input)
  return resolveProseScenePrompt({ ...input, scenePrompt: booru })
}
