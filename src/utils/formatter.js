export function formatCurrency(value) {
  const amount = Number(value) || 0

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export function todayISODate(timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

export function currentMonth(timeZone = 'America/Sao_Paulo') {
  return todayISODate(timeZone).slice(0, 7)
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
