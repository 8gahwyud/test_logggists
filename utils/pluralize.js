/**
 * Плюрализация для слова "заказ"
 * @param {number} count - количество
 * @returns {string} - правильная форма слова
 */
export function pluralizeOrder(count) {
  const num = Math.abs(count)
  const lastDigit = num % 10
  const lastTwoDigits = num % 100

  // Исключения для 11-14
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'заказов'
  }

  // 1, 21, 31, 41, ... - "заказ"
  if (lastDigit === 1) {
    return 'заказ'
  }

  // 2, 3, 4, 22, 23, 24, ... - "заказа"
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'заказа'
  }

  // Остальные - "заказов"
  return 'заказов'
}

/**
 * Плюрализация для слова "отклик"
 * @param {number} count - количество
 * @returns {string} - правильная форма слова
 */
export function pluralizeResponse(count) {
  const num = Math.abs(count)
  const lastDigit = num % 10
  const lastTwoDigits = num % 100

  // Исключения для 11-14
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'откликов'
  }

  // 1, 21, 31, 41, ... - "отклик"
  if (lastDigit === 1) {
    return 'отклик'
  }

  // 2, 3, 4, 22, 23, 24, ... - "отклика"
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'отклика'
  }

  // Остальные - "откликов"
  return 'откликов'
}

/**
 * Плюрализация для слова "человек"
 * @param {number} count - количество
 * @returns {string} - правильная форма слова
 */
export function pluralizePerson(count) {
  const num = Math.abs(count)
  const lastDigit = num % 10
  const lastTwoDigits = num % 100

  // Исключения для 11-14
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'человек'
  }

  // 1, 21, 31, 41, ... - "человек"
  if (lastDigit === 1) {
    return 'человек'
  }

  // 2, 3, 4, 22, 23, 24, ... - "человека"
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'человека'
  }

  // Остальные - "человек"
  return 'человек'
}

/**
 * Плюрализация для слова "час"
 * @param {number} count - количество
 * @returns {string} - правильная форма слова
 */
export function pluralizeHour(count) {
  const num = Math.abs(count)
  const lastDigit = num % 10
  const lastTwoDigits = num % 100

  // Исключения для 11-14
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'часов'
  }

  // 1, 21, 31, 41, ... - "час"
  if (lastDigit === 1) {
    return 'час'
  }

  // 2, 3, 4, 22, 23, 24, ... - "часа"
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'часа'
  }

  // Остальные - "часов"
  return 'часов'
}

