export function routeLLM(message = '', hasImage = false) {
  if (hasImage) return 'gemini'

  if (message.length > 500) return 'gemini'

  const lower = message.toLowerCase()
  if (lower.includes('relatório') || lower.includes('relatorio')) return 'gemini'

  return 'groq'
}
