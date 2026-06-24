import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export function isOpenRouterEnabled() {
  return Boolean(env.OPENROUTER_API_KEY) && env.OPENROUTER_ENABLED
}

function isFreeModel(model = '') {
  return String(model).trim().endsWith(':free')
}

function resolveOpenRouterModel() {
  const configuredModel = String(env.OPENROUTER_MODEL || '').trim()

  if (!env.OPENROUTER_FREE_ONLY) {
    return configuredModel
  }

  if (isFreeModel(configuredModel)) {
    return configuredModel
  }

  logger.warn('Modelo OpenRouter pago bloqueado; usando fallback gratuito', {
    configuredModel,
    fallbackModel: env.OPENROUTER_FREE_FALLBACK_MODEL
  })

  return env.OPENROUTER_FREE_FALLBACK_MODEL
}

export async function askOpenRouter({ systemPrompt, userMessage }) {
  if (!isOpenRouterEnabled()) {
    throw new Error('OpenRouter não configurado')
  }

  const model = resolveOpenRouterModel()

  if (env.OPENROUTER_FREE_ONLY && !isFreeModel(model)) {
    throw new Error(`OPENROUTER_FREE_ONLY ativo, mas o modelo não é gratuito: ${model}`)
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
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`OpenRouter API ${response.status}: ${body}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || '{}'
  } catch (error) {
    logger.error('Erro ao chamar OpenRouter', {
      model,
      error
    })
    throw error
  }
}
