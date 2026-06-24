import { env } from '../config/env.js'

function canUseOpenRouter() {
  return env.OPENROUTER_ENABLED && Boolean(env.OPENROUTER_API_KEY)
}

// Mensagens com prefixo explícito de contexto são tarefas simples — Groq resolve bem
function hasContextPrefix(message = '') {
  return /^(pessoal|fc|farma|farma conde|centrya|bicego)\s*:/i.test(message.trim())
}

function shouldUseOpenRouter(message = '') {
  if (!canUseOpenRouter()) return false
  if (hasContextPrefix(message)) return false

  const lower = message.toLowerCase()

  if (message.length > 280) return true
  if (lower.includes('planeja') || lower.includes('planejamento')) return true
  if (lower.includes('analisa') || lower.includes('analise') || lower.includes('análise')) return true
  if (lower.includes('estrategia') || lower.includes('estratégia')) return true
  if (lower.includes('decide') || lower.includes('prioriza')) return true
  if (lower.includes('resume') || lower.includes('resumo')) return true
  if (lower.includes('explica') || lower.includes('explique')) return true

  return false
}

export function routeLLM(message = '', hasImage = false) {
  if (hasImage) return 'gemini'

  const lower = message.toLowerCase()

  // Relatório: prefere OpenRouter, fallback Gemini
  if (lower.includes('relatório') || lower.includes('relatorio')) {
    return canUseOpenRouter() ? 'openrouter' : 'gemini'
  }

  if (shouldUseOpenRouter(message)) return 'openrouter'

  // Mensagens longas sem OpenRouter vão pro Gemini (mais capaz que Groq em contexto longo)
  if (message.length > 400 && !canUseOpenRouter()) return 'gemini'

  return 'groq'
}
