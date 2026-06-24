import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export function isOpenRouterEnabled() {
  return Boolean(env.OPENROUTER_API_KEY) && env.OPENROUTER_ENABLED
}

export async function askOpenRouter({ systemPrompt, userMessage }) {
  if (!isOpenRouterEnabled()) {
    throw new Error('OpenRouter não configurado')
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
        model: env.OPENROUTER_MODEL,
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
      model: env.OPENROUTER_MODEL,
      error
    })
    throw error
  }
}
