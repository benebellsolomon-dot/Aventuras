/** Tests for scene inference (Spec 2 Task 6): intimacy keyword gate + curated-location mapper. */
import { describe, expect, test } from 'vitest'
import { combineSceneIntimacy, inferSceneIntimacy, inferBridgeLocation } from './sceneInference'

describe('inferSceneIntimacy', () => {
  test('defaults to clean', () => {
    expect(inferSceneIntimacy('They walked through the market discussing the harvest.')).toBe(
      'clean',
    )
    expect(inferSceneIntimacy('')).toBe('clean')
  })

  test('detects suggestive wardrobe/tension vocabulary', () => {
    expect(inferSceneIntimacy('Her shirt strains, buttons pulling tight over her cleavage.')).toBe(
      'suggestive',
    )
    expect(inferSceneIntimacy('She stood in her underwear, hesitating.')).toBe('suggestive')
  })

  test('detects nudity', () => {
    expect(inferSceneIntimacy('She stood naked in the moonlight.')).toBe('nude')
    expect(inferSceneIntimacy('Topless, she waded into the spring.')).toBe('nude')
  })

  test('explicit outranks nude when both appear', () => {
    expect(inferSceneIntimacy('Naked, she rode him until orgasm overtook her.')).toBe('explicit')
  })

  test('word boundaries: benign words do not trigger', () => {
    expect(inferSceneIntimacy('A brand new bracelet from the brasserie.')).toBe('clean')
    expect(inferSceneIntimacy('Under the circumstances, the cocktail party went well.')).toBe(
      'clean',
    )
  })

  test('ambiguous action/idiom vocabulary stays clean', () => {
    expect(inferSceneIntimacy('The climax of the battle came at dawn.')).toBe('clean')
    expect(inferSceneIntimacy('She was riding her bike along the shore.')).toBe('clean')
    expect(inferSceneIntimacy('He mounted his horse and rode her hard toward town.')).toBe('clean')
    expect(inferSceneIntimacy('Visible to the naked eye.')).toBe('clean')
    expect(inferSceneIntimacy('A same-sex couple ran the bakery.')).toBe('clean')
    expect(inferSceneIntimacy('Cock the hammer and wait.')).toBe('clean')
    expect(inferSceneIntimacy('The cock crowed at dawn.')).toBe('clean')
    expect(inferSceneIntimacy('A fighting cock strutted in the ring.')).toBe('clean')
    expect(inferSceneIntimacy('Naked aggression flashed in his eyes.')).toBe('clean')
    expect(inferSceneIntimacy('The thrusters fired and the ship lurched.')).toBe('clean')
    expect(inferSceneIntimacy('There was nothing on TV tonight.')).toBe('clean')
    expect(inferSceneIntimacy('The cumbersome cumulative paperwork piled up.')).toBe('clean')
  })

  test('common explicit vocabulary trips the explicit tier', () => {
    for (const phrase of [
      'She gives him a blowjob under the desk.',
      'cumming across her chest',
      'His penis pressed against her.',
      'His erection strained his trousers.',
      'They switched to doggystyle.',
      'His shaft slid between her breasts.',
      'eating her out on the counter',
      'a creampie dripping down her thigh',
    ]) {
      expect(inferSceneIntimacy(phrase)).toBe('explicit')
    }
  })
})

describe('combineSceneIntimacy', () => {
  test('narrative context raises the scene by one step at most', () => {
    expect(combineSceneIntimacy('clean', 'explicit')).toBe('suggestive')
    expect(combineSceneIntimacy('clean', 'nude')).toBe('suggestive')
    expect(combineSceneIntimacy('suggestive', 'explicit')).toBe('nude')
    expect(combineSceneIntimacy('nude', 'explicit')).toBe('explicit')
  })

  test('a scene at or above its context keeps its own rating', () => {
    expect(combineSceneIntimacy('explicit', 'clean')).toBe('explicit')
    expect(combineSceneIntimacy('nude', 'nude')).toBe('nude')
    expect(combineSceneIntimacy('clean', 'clean')).toBe('clean')
  })
})

describe('inferBridgeLocation', () => {
  test('maps free text to curated keys', () => {
    expect(inferBridgeLocation('Lucy leaning on the kitchen counter')).toBe('kitchen')
    expect(inferBridgeLocation('steam rising off the hot spring')).toBe('onsen')
    expect(inferBridgeLocation('sunlight through the classroom windows')).toBe('classroom')
    expect(inferBridgeLocation('sprawled on the couch with a book')).toBe('living_room')
    expect(inferBridgeLocation('waves rolling up the beach')).toBe('beach')
  })

  test('more specific keys win over general ones', () => {
    expect(inferBridgeLocation('the love hotel room was dim')).toBe('love_hotel')
    expect(inferBridgeLocation('the locker room after practice')).toBe('locker_room')
  })

  test('returns null on no match (never forces a wrong key)', () => {
    expect(inferBridgeLocation('drifting through the asteroid field')).toBeNull()
    expect(inferBridgeLocation('')).toBeNull()
  })

  test('bare "car" mentions do not imply an in-car scene', () => {
    expect(inferBridgeLocation('she waved as the car drove off down the lane')).toBeNull()
    expect(inferBridgeLocation('cramped together in the back seat of the car')).toBe('car')
  })

  test('idiomatic sub-word uses do not map to locations', () => {
    expect(inferBridgeLocation('a pool of blood spread across the floor')).toBeNull()
    expect(inferBridgeLocation('a shower of arrows fell on the ramparts')).toBeNull()
    expect(inferBridgeLocation('they were not out of the woods yet')).toBeNull()
    expect(inferBridgeLocation('a line outside the post office')).toBeNull()
    expect(inferBridgeLocation('lying on the bed of the truck')).toBeNull()
  })
})
