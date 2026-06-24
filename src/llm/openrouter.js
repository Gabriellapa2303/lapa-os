import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_FREE_MODELS = [
  'openrouter/free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-20b:free'
]

export function isOpenRouterEnabled() {
  return Boolean(env.OPENROUTER_API_KEY) && env.OPENROUTER_ENABLED
}

function isFreeModel(model = '') {
  const value = String(model).trim()
  return value === 'openrouter/free' || value.endsWith(':free')
}

function splitModelList(value = '') {
  return String(value)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
}

function uniqueModels(models = []) {
  return [...new Set(models.filter(Boolean))]
}

function resolveOpenRouterModels() {
  const configuredModel = String(env.OPENROUTER_MODEL || '').trim()
  const fallbackModels = [
    env.OPENROUTER_FREE_FALLBACK_MODEL,
    ...splitModelList(env.OPENROUTER_FREE_FALLBACK_MODELS),
    ...DEFAULT_FREE_MODELS
  ]

  if (!env.OPENROUTER_FREE_ONLY) {
    return uniqueModels([configuredModel, ...fallbackModels])
  }

  if (isFreeModel(configuredModel)) {
    return uniqueModels([configuredModel, ...fallbackModels].filter(isFreeModel))
  }

  logger.warn('Modelo OpenRouter pago bloqueado; usando fallback gratuito', {
    configuredModel,
    fallbackModels
  })

  return uniqueModels(fallbackModels.filter(isFreeModel))
}

function buildOpenRouterBody({ model, systemPrompt, userMessage }) {
  return JSON.stringify({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ]
  })
}

export async function askOpenRouter({ systemPrompt, userMessage }) {
  if (!isOpenRouterEnabled()) {
    throw new Error('OpenRouter nao configurado')
  }

  const models = resolveOpenRouterModels()
  let lastError

  for (const model of models) {
    if (env.OPENROUTER_FREE_ONLY && !isFreeModel(model)) {
      logger.warn('Modelo OpenRouter ignorado por nao ser gratuito', { model })
      continue
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': env.OPENROUTER_SITE_URL,
          'X-OpenRouter-Title': env.OPENROUTER_APP_NAME
        },
        body: buildOpenRouterBody({ model, systemPrompt, userMessage })
      })

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`OpenRouter API ${response.status}: ${body}`)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || '{}'
    } catch (error) {
      lastError = error
      logger.warn('Modelo OpenRouter falhou; tentando fallback', {
        model,
        error
      })
    }
  }

  logger.error('Todos os modelos OpenRouter falharam', {
    models,
    error: lastError
  })

  throw lastError || new Error('Nenhum modelo OpenRouter gratuito disponivel')
}
