export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'America/Sao_Paulo'

export function formatCurrency(value) {
  const amount = Number(value) || 0

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

function getDateParts(date = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)

  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

export function todayISODate(timeZone = DEFAULT_TIMEZONE) {
  const byType = getDateParts(new Date(), timeZone)
  return `${byType.year}-${byType.month}-${byType.day}`
}

export function currentMonth(timeZone = DEFAULT_TIMEZONE) {
  return todayISODate(timeZone).slice(0, 7)
}

export function todayISODateFromDate(date, timeZone = DEFAULT_TIMEZONE) {
  const byType = getDateParts(date, timeZone)
  return `${byType.year}-${byType.month}-${byType.day}`
}

export function addDaysToISODate(dateValue, days = 0, timeZone = DEFAULT_TIMEZONE) {
  const [year, month, day] = String(dateValue || todayISODate(timeZone)).split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0))

  return todayISODateFromDate(date, timeZone)
}

export function saoPauloDateTimeToISOString(dateValue, timeValue = '09:00') {
  const [year, month, day] = String(dateValue).split('-').map(Number)
  const [hour = 9, minute = 0] = String(timeValue || '09:00').split(':').map(Number)

  // Sao Paulo no longer observes DST, so scheduling can be converted as UTC-03.
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute, 0)).toISOString()
}

export function extractTime(text = '') {
  const match = String(text).match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)?\b/i)

  if (!match) return null

  const hour = match[1].padStart(2, '0')
  const minute = (match[2] || '00').padStart(2, '0')
  return `${hour}:${minute}`
}

export function normalizeText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function normalizePhone(phone = '') {
  return String(phone).replace(/\D/g, '')
}

export function compactText(text = '', maxLength = 1200) {
  const value = String(text).replace(/\s+/g, ' ').trim()

  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

export function formatErrorMessage() {
  return '⚠️ Não consegui processar isso agora. Já registrei o erro nos logs.'
}
