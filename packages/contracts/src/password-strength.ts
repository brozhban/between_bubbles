/**
 * Проверка пароля на компрометацию (ТЗ §13).
 *
 * Список намеренно короткий: он едет и в браузер, поэтому в него взяты пароли из верхушки
 * публичных утечек — те, что подбираются первой сотней попыток. Полный список из миллионов
 * строк в бандл не положить, а онлайн-проверка (k-anonymity у Have I Been Pwned) добавила бы
 * в регистрацию внешний вызов с собственными отказами и задержками. Правила ниже ловят ещё и
 * очевидные вариации вроде «password2024», которых в голом списке нет.
 */

const COMMON_PASSWORDS = new Set([
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwertyui',
  'qwerty123',
  'password',
  'passw0rd',
  'pa$$word',
  'iloveyou',
  'admin',
  'administrator',
  'welcome',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'batman',
  'trustno1',
  'letmein',
  'whatever',
  'starwars',
  'computer',
  'internet',
  'freedom',
  'shadow',
  'master',
  'michael',
  'jennifer',
  'jordan',
  'hunter',
  'ranger',
  'soccer',
  'charlie',
  'liverpool',
  'chelsea',
  'arsenal',
  'pokemon',
  'nintendo',
  'samsung',
  'google',
  'facebook',
  'security',
  'changeme',
  'default',
  'secret',
  'qazwsx',
  'zaq12wsx',
  'asdfgh',
  'asdfghjk',
  'zxcvbn',
  'zxcvbnm',
  '1q2w3e4r',
  '1qaz2wsx',
  'qwertzui',
  'йцукен',
  'йцукенг',
  'пароль',
  'привет',
  'любовь',
  'солнышко',
  'наташа',
  'сергей',
  'андрей',
  'марина',
  'россия',
  'спартак',
  'зенит',
  'динамо',
  'wine',
  'winelover',
  'between',
  'bubbles',
  'betweenbubbles',
  'dneviniq',
  'дневиник',
])

/** Пароли этой длины и короче не пропускает уже минимальная длина, но правило зависит от неё. */
const MIN_MEANINGFUL_STEM = 4

export function isCompromisedPassword(password: string): boolean {
  const normalized = password.trim().toLowerCase()
  if (normalized === '') return false

  if (COMMON_PASSWORDS.has(normalized)) return true

  // «password1», «qwerty2024», «admin!!!» — тот же пароль с приписанным хвостом.
  const stem = normalized.replace(/[\d!@#$%^&*_.\-+=]+$/, '')
  if (stem.length >= MIN_MEANINGFUL_STEM && COMMON_PASSWORDS.has(stem)) return true

  if (isSingleRepeatedCharacter(normalized)) return true
  if (isKeyboardOrAlphabetRun(normalized)) return true

  return false
}

/** «aaaaaaaa», «11111111». */
function isSingleRepeatedCharacter(value: string): boolean {
  return /^(.)\1+$/.test(value)
}

/**
 * «12345678», «abcdefgh», «qwertyui» и те же последовательности задом наперёд.
 *
 * Соседние коды символов ловят только цифры и алфавит; клавиатурные ряды, которые обещало
 * имя функции, по кодам не соседствуют вовсе — «qwerty» их проверку проходил. Поэтому
 * ряды заданы явно: это несколько строк, и они точнее любой арифметики по кодам.
 */
const KEYBOARD_ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'йцукенгшщзхъ',
  'фывапролджэ',
  'ячсмитьбю',
  '1234567890',
]

function isKeyboardOrAlphabetRun(value: string): boolean {
  if (value.length < 4) return false

  const lowercase = value.toLowerCase()
  const isCharCodeRun = (step: 1 | -1) =>
    [...lowercase].every(
      (character, index) =>
        index === 0 || character.charCodeAt(0) === lowercase.charCodeAt(index - 1) + step,
    )

  if (isCharCodeRun(1) || isCharCodeRun(-1)) return true

  return KEYBOARD_ROWS.some((row) => {
    const reversed = [...row].reverse().join('')
    return row.includes(lowercase) || reversed.includes(lowercase)
  })
}
