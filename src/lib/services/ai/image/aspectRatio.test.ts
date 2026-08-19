import { describe, it, expect } from 'vitest'
import { pickImageSize, SQUARE_SIZE, PORTRAIT_SIZE, LANDSCAPE_SIZE } from './aspectRatio'

const BOORU_MODEL = 'wai-illustrious-sdxl'
const PROSE_MODEL = 'flux-kontext'

describe('pickImageSize', () => {
  it('picks landscape for multi-subject scenes regardless of prompt wording', () => {
    expect(
      pickImageSize({
        prompt: 'two people talking in a cafe',
        subjectCount: 2,
        model: BOORU_MODEL,
        fallback: SQUARE_SIZE,
      }),
    ).toBe(LANDSCAPE_SIZE)

    expect(
      pickImageSize({
        prompt: 'a crowd scene',
        subjectCount: 3,
        model: BOORU_MODEL,
        fallback: SQUARE_SIZE,
      }),
    ).toBe(LANDSCAPE_SIZE)
  })

  it('picks landscape for wide/establishing/scenery/landscape cues', () => {
    for (const prompt of [
      'a wide shot of the town square',
      'establishing shot of the castle',
      'scenery of rolling hills',
      'a beautiful landscape at dusk',
    ]) {
      expect(
        pickImageSize({ prompt, subjectCount: 1, model: BOORU_MODEL, fallback: SQUARE_SIZE }),
      ).toBe(LANDSCAPE_SIZE)
    }
  })

  it('picks tall portrait for full-body cues', () => {
    for (const prompt of [
      'full body shot of the knight',
      'cowboy shot, hand on hip',
      'full-length view of her outfit',
      'standing in the doorway',
      'from below, looking up at her',
      'from above, a dramatic angle',
    ]) {
      expect(
        pickImageSize({ prompt, subjectCount: 1, model: BOORU_MODEL, fallback: SQUARE_SIZE }),
      ).toBe(PORTRAIT_SIZE)
    }
  })

  it('picks tall portrait for close-up/upper-body cues', () => {
    for (const prompt of [
      'close-up of her eyes',
      'closeup on his face',
      'upper body, arms crossed',
      'a formal portrait',
      'bust shot against the wall',
      'headshot in the studio',
      'her face lit by candlelight',
      'from side, looking away',
    ]) {
      expect(
        pickImageSize({ prompt, subjectCount: 1, model: BOORU_MODEL, fallback: SQUARE_SIZE }),
      ).toBe(PORTRAIT_SIZE)
    }
  })

  it('falls back to the configured size when no cue matches', () => {
    expect(
      pickImageSize({
        prompt: 'a girl smiling in a garden',
        subjectCount: 1,
        model: BOORU_MODEL,
        fallback: SQUARE_SIZE,
      }),
    ).toBe(SQUARE_SIZE)
    expect(
      pickImageSize({
        prompt: 'a girl smiling in a garden',
        subjectCount: 0,
        model: BOORU_MODEL,
        fallback: '832x1216',
      }),
    ).toBe('832x1216')
  })

  it('is case-insensitive on the prompt', () => {
    expect(
      pickImageSize({
        prompt: 'FULL BODY shot, dramatic lighting',
        subjectCount: 1,
        model: BOORU_MODEL,
        fallback: SQUARE_SIZE,
      }),
    ).toBe(PORTRAIT_SIZE)
  })

  it('returns the fallback unchanged for non-booru (prose) models regardless of cues', () => {
    expect(
      pickImageSize({
        prompt: 'full body shot of two people',
        subjectCount: 2,
        model: PROSE_MODEL,
        fallback: SQUARE_SIZE,
      }),
    ).toBe(SQUARE_SIZE)
    expect(
      pickImageSize({
        prompt: 'a wide establishing shot',
        subjectCount: 1,
        model: undefined,
        fallback: '999x999',
      }),
    ).toBe('999x999')
  })

  it('gives subject-count precedence over shot-type cues (multi-subject wins even with a close-up cue)', () => {
    expect(
      pickImageSize({
        prompt: 'close-up portrait of two friends',
        subjectCount: 2,
        model: BOORU_MODEL,
        fallback: SQUARE_SIZE,
      }),
    ).toBe(LANDSCAPE_SIZE)
  })
})
