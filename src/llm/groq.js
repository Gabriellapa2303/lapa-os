import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export async function askGroq({ systemPrompt, userMessage }) {
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
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
      throw new Error(`Groq API ${response.status}: ${body}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || '{}'
  } catch (error) {
    logger.error('Erro ao chamar Groq', { error })
    throw error
  }
}
