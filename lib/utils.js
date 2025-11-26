// Утилиты для форматирования

export function normalizeUTCDate(dateString) {
  if (!dateString) return null
  // Если строка уже содержит 'Z' или '+', возвращаем как есть
  if (dateString.includes('Z') || dateString.includes('+') || dateString.includes('-', 10)) {
    return dateString
  }
  // Если нет указания часового пояса, добавляем 'Z' (UTC)
  return dateString + 'Z'
}

export function formatTimeAgo(dateString) {
  if (!dateString) return 'недавно'
  
  const normalizedDateString = normalizeUTCDate(dateString)
  if (!normalizedDateString) return 'недавно'
  
  const date = new Date(normalizedDateString)
  
  if (isNaN(date.getTime())) {
    return 'недавно'
  }
  
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  
  if (diffMs < 0) {
    return 'только что'
  }
  
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMins < 1) return 'только что'
  if (diffMins < 60) {
    const mins = diffMins
    if (mins === 1 || (mins > 20 && mins % 10 === 1)) return `${mins} минуту назад`
    if ((mins >= 2 && mins <= 4) || (mins > 20 && mins % 10 >= 2 && mins % 10 <= 4)) return `${mins} минуты назад`
    return `${mins} минут назад`
  }
  if (diffHours < 24) {
    const hours = diffHours
    if (hours === 1 || (hours > 20 && hours % 10 === 1)) return `${hours} час назад`
    if ((hours >= 2 && hours <= 4) || (hours > 20 && hours % 10 >= 2 && hours % 10 <= 4)) return `${hours} часа назад`
    return `${hours} часов назад`
  }
  if (diffDays < 7) {
    const days = diffDays
    if (days === 1 || (days > 20 && days % 10 === 1)) return `${days} день назад`
    if ((days >= 2 && days <= 4) || (days > 20 && days % 10 >= 2 && days % 10 <= 4)) return `${days} дня назад`
    return `${days} дней назад`
  }
  if (diffWeeks < 4) {
    const weeks = diffWeeks
    if (weeks === 1) return `${weeks} неделю назад`
    if (weeks >= 2 && weeks <= 4) return `${weeks} недели назад`
    return `${weeks} недель назад`
  }
  if (diffMonths < 12) {
    const months = diffMonths
    if (months === 1) return `${months} месяц назад`
    if (months >= 2 && months <= 4) return `${months} месяца назад`
    return `${months} месяцев назад`
  }
  
  const years = Math.floor(diffDays / 365)
  if (years === 1) return `${years} год назад`
  if (years >= 2 && years <= 4) return `${years} года назад`
  return `${years} лет назад`
}

export function escapeHtml(str = "") {
  if (!str) return ""
  // Простая функция экранирования HTML для React
  const div = typeof document !== 'undefined' ? document.createElement("div") : null
  if (div) {
    div.textContent = str
    return div.innerHTML
  }
  // Fallback для SSR
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

