import { env } from '../config/env.js'

function canUseOpenRouter() {
  return env.OPENROUTER_ENABLED && Boolean(env.OPENROUTER_API_KEY)
}

function shouldUseOpenRouter(message = '') {
  if (!canUseOpenRouter()) return false

  const lower = message.toLowerCase()

  if (message.length > 280) return true
  if (lower.includes('planeja') || lower.includes('planejamento')) return true
  if (lower.includes('analisa') || lower.includes('analise') || lower.includes('análise')) return true
  if (lower.includes('estrategia') || lower.includes('estratégia')) return true
  if (lower.includes('decide') || lower.includes('prioriza')) return true

  return false
}

export function routeLLM(message = '', hasImage = false) {
  if (hasImage) return 'gemini'

  const lower = message.toLowerCase()

  if (lower.includes('relatório') || lower.includes('relatorio')) return canUseOpenRouter() ? 'openrouter' : 'gemini'
  if (shouldUseOpenRouter(message)) return 'openrouter'
  if (message.length > 500) return 'gemini'

  return 'groq'
}
