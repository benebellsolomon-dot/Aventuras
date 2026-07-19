/**
 * SI Bridge Image Provider (Spec 2)
 *
 * Speaks the si-animator-bridge's native async API:
 * - submit: POST /image  ({ spec } structured, or { prompt } fallback)
 * - poll:   GET  /image/{job_id}   (upscaling is non-terminal)
 * - result: GET  /image/{job_id}/result?format=png  (binary)
 * - models: GET  /models (connectivity check; the bridge owns routing)
 *
 * `workflow` is deliberately omitted from the request: the bridge auto-routes
 * (BE specs with tier >= 22 or any be_moment land on Illustrious, standard
 * specs on the Krea2 base). Auth is X-API-Key — never Authorization: Bearer.
 * The A1111 shim path (a1111.ts pointed at the bridge) stays as fallback.
 *
 * B1 identity-anchor extension point: POST /image also accepts
 * pose_face_anchor_b64 + FaceID/OpenPose weights (server half shipped). Caller
 * support means storing a per-character anchor render and adding it to the
 * request body here — nothing else in this file changes.
 */

import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerateOptions,
  ImageGenerateResult,
  ImageModelInfo,
} from './types'
import { imageFetch, imageGetFetch } from './fetchAdapter'

const DEFAULT_BASE_URL = 'http://127.0.0.1:8001'
const DEFAULT_JOB_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 2500
// Status polls get a short per-request timeout (a hung poll must not eat the
// whole job budget) and transient poll failures are tolerated — the bridge is
// still rendering; only this many CONSECUTIVE failures abandon the job.
const POLL_REQUEST_TIMEOUT_MS = 30_000
const MAX_CONSECUTIVE_POLL_FAILURES = 3
const CAMPAIGN_ID = 'aventuras'
const ABORT_MESSAGE = 'Image generation aborted'
// The shim's `__betier_<N>__` marker (sizeBandMarker.ts). Native /image does NOT
// parse it — only /sdapi does — so the prompt path translates it to the request's
// be_tier_index field (same cup ladder) and strips it from the render prompt.
// Reached via the spec-less fallback, the DB Retry replay, and non-BE stories.
const BE_TIER_MARKER = /__betier_(\d+)__\s*,?\s*/
// The bridge validates width/height into this range (models.py ImageGenRequest).
const MIN_DIMENSION = 512
const MAX_DIMENSION = 2048

const AUTO_MODEL: ImageModelInfo = {
  id: 'bridge-auto',
  name: 'Bridge auto-routing',
  description: 'The bridge picks the pipeline (Krea2 / Illustrious) from the request itself.',
  supportsSizes: [],
  supportsImg2Img: false,
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(ABORT_MESSAGE))
      return
    }
    // onAbort closes over `timer` before its declaration line; abort events
    // cannot dispatch synchronously inside this block, so the read is safe.
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error(ABORT_MESSAGE))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function parseDimensions(size: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)$/.exec((size || '').trim())
  if (!match) return null
  const clamp = (n: number) => Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, n))
  return { width: clamp(Number(match[1])), height: clamp(Number(match[2])) }
}

export function createSiBridgeProvider(config: ImageProviderConfig): ImageProvider {
  const baseUrl = config.baseUrl?.trim().replace(/\/$/, '') || DEFAULT_BASE_URL
  // Job deadline: never below the image default — the registry passes the LLM
  // timeout, which users tune for text snappiness, and an upscaled bridge job
  // can legitimately run 90s+. Raising the LLM timeout still extends this.
  // isFinite also guards NaN from a corrupted setting (NaN deadline never trips).
  const configuredTimeout = Number.isFinite(config.timeoutMs) ? (config.timeoutMs as number) : 0
  const timeoutMs = Math.max(configuredTimeout, DEFAULT_JOB_TIMEOUT_MS)

  const authHeaders = (): Record<string, string> =>
    config.apiKey ? { 'X-API-Key': config.apiKey } : {}

  return {
    id: 'si-bridge',
    name: 'SI Bridge',

    async generate(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
      const { prompt, size, signal, spec } = options

      let body: Record<string, unknown>
      if (spec) {
        body = { spec, campaign_id: CAMPAIGN_ID }
      } else {
        const marker = BE_TIER_MARKER.exec(prompt)
        body = marker
          ? {
              prompt: prompt.replace(BE_TIER_MARKER, '').trim(),
              be_tier_index: Number(marker[1]),
            }
          : { prompt }
      }
      // FaceID/OpenPose identity-hold (Spec 4 B1) — coexists with the spec:
      // the bridge routes onto the openpose_faceid workflow while the spec
      // still drives tier sizing.
      if (options.poseFaceAnchor) {
        body.pose_face_anchor_b64 = options.poseFaceAnchor
        if (options.faceidWeight !== undefined) body.faceid_weight = options.faceidWeight
        if (options.openposeStrength !== undefined) body.openpose_strength = options.openposeStrength
      }
      const dimensions = parseDimensions(size)
      if (dimensions) {
        body.width = dimensions.width
        body.height = dimensions.height
      }

      const submitResponse = await imageFetch({
        url: `${baseUrl}/image`,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
        signal,
        serviceId: 'si-bridge-image',
      })
      const submitData = (await submitResponse.json().catch(() => null)) as {
        job_id?: unknown
      } | null
      const jobId = submitData?.job_id
      if (typeof jobId !== 'string' || !jobId) throw new Error('No job_id in bridge response')
      // Defense-in-depth: the id is server-supplied — never let it reshape the URL.
      const jobPath = encodeURIComponent(jobId)

      const deadline = Date.now() + timeoutMs
      let consecutiveFailures = 0
      for (;;) {
        if (signal?.aborted) throw new Error(ABORT_MESSAGE)
        if (Date.now() >= deadline) {
          throw new Error(`Bridge render timed out after ${Math.round(timeoutMs / 1000)}s`)
        }

        let status: { status?: string; error?: string } | null = null
        try {
          const statusResponse = await imageGetFetch(`${baseUrl}/image/${jobPath}`, authHeaders(), {
            signal,
            timeoutMs: POLL_REQUEST_TIMEOUT_MS,
            serviceId: 'si-bridge-status',
          })
          status = (await statusResponse.json()) as { status?: string; error?: string }
          consecutiveFailures = 0
        } catch (error) {
          if (signal?.aborted) throw new Error(ABORT_MESSAGE)
          consecutiveFailures += 1
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`Bridge status polling failed repeatedly: ${message}`)
          }
        }
        if (status?.status === 'complete') break
        if (status?.status === 'failed') {
          throw new Error(status.error || 'Bridge render failed')
        }
        // queued / running / upscaling — and any future status — are non-terminal
        await abortableSleep(POLL_INTERVAL_MS, signal)
      }

      const resultResponse = await imageGetFetch(
        `${baseUrl}/image/${jobPath}/result?format=png`,
        authHeaders(),
        { signal, serviceId: 'si-bridge-result' },
      )
      const base64 = arrayBufferToBase64(await resultResponse.arrayBuffer())
      if (!base64) throw new Error('Empty image data in bridge result')

      return { base64 }
    },

    async listModels(apiKey?: string): Promise<ImageModelInfo[]> {
      try {
        const key = apiKey || config.apiKey
        const headers: Record<string, string> = key ? { 'X-API-Key': key } : {}
        // Connectivity/auth check; the response enumerates workflows, not
        // caller-selectable models — the bridge owns routing.
        await imageGetFetch(`${baseUrl}/models`, headers, { serviceId: 'si-bridge-models' })
        return [AUTO_MODEL]
      } catch {
        return []
      }
    },
  }
}
