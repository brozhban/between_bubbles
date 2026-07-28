import { describe, expect, test } from 'bun:test'

import { isCompromisedPassword, passwordSchema } from './index'

describe('password strength (ТЗ §13)', () => {
  test('отбивает пароли из верхушки утечек и их очевидные вариации', () => {
    for (const password of [
      'password',
      'PassWord',
      'password1',
      'password2024',
      'qwerty123',
      'admin!!!',
      'пароль',
      'aaaaaaaa',
      '12345678',
      'abcdefgh',
      '87654321',
      // Своё же название продукта — первое, что подставит человек, и первое, что переберут.
      'betweenbubbles',
    ]) {
      expect(isCompromisedPassword(password)).toBe(true)
    }
  })

  test('пропускает пароли, которых в списке нет', () => {
    for (const password of [
      'quiet-cellar-42',
      'saperavi-mukhrani',
      'подвал-с-бочками',
      'p4ssword-but-longer',
      '1234abcd5678',
    ]) {
      expect(isCompromisedPassword(password)).toBe(false)
    }
  })

  test('схема пароля отбивает и короткие, и скомпрометированные', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false)
    expect(passwordSchema.safeParse('password123').success).toBe(false)
    expect(passwordSchema.safeParse('quiet-cellar-42').success).toBe(true)
  })
})
