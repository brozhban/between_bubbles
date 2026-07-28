import { describe, expect, test } from 'bun:test'

import {
  DUPLICATE_SIMILARITY_THRESHOLD,
  findDuplicate,
  looksLikeSpam,
  nameSimilarity,
  normalizeStoreName,
} from './store-matching'

describe('normalizeStoreName', () => {
  test('lowercases, trims, collapses spaces and drops punctuation', () => {
    expect(normalizeStoreName('  Good-Will,  Wine   Shop!  ')).toBe('good will wine shop')
    expect(normalizeStoreName('«Винотека»')).toBe('винотека')
  })

  test('maps trivially different spellings onto the same key', () => {
    expect(normalizeStoreName('Spar')).toBe(normalizeStoreName('  SPAR '))
    expect(normalizeStoreName('2 Nabiji')).toBe(normalizeStoreName('2-Nabiji'))
  })
})

describe('nameSimilarity', () => {
  test('scores an exact normalized match as 1', () => {
    expect(nameSimilarity('Goodwill', 'goodwill')).toBe(1)
  })

  test('scores a typo above the duplicate threshold', () => {
    expect(nameSimilarity('Goodwill', 'Godwill')).toBeGreaterThanOrEqual(
      DUPLICATE_SIMILARITY_THRESHOLD,
    )
  })

  test('scores unrelated names below the duplicate threshold', () => {
    expect(nameSimilarity('Goodwill', 'Carrefour')).toBeLessThan(DUPLICATE_SIMILARITY_THRESHOLD)
  })
})

describe('findDuplicate', () => {
  test('returns the closest candidate above the threshold', () => {
    const result = findDuplicate('Goodwil', [
      { id: '1', name: 'Carrefour' },
      { id: '2', name: 'Goodwill' },
      { id: '3', name: 'Good' },
    ])

    expect(result?.id).toBe('2')
  })

  test('returns null when nothing is close enough', () => {
    expect(findDuplicate('Nikora', [{ id: '1', name: 'Carrefour' }])).toBeNull()
  })
})

describe('looksLikeSpam', () => {
  test('rejects links and markup in a store name', () => {
    expect(looksLikeSpam('buy at http://spam.example')).toBe(true)
    expect(looksLikeSpam('<b>Goodwill</b>')).toBe(true)
    expect(looksLikeSpam('Goodwill')).toBe(false)
  })
})
