import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const GEMINI_MODEL = 'gemini-2.0-flash'

function geminiUrl() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`
}

export async function downloadImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl, {
      headers: env.EVOLUTION_API_KEY ? { apikey: env.EVOLUTION_API_KEY } : undefined
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Download de imagem ${response.status}: ${body}`)
    }

    const mimeType = response.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await response.arrayBuffer())

    return {
      mimeType,
      data: buffer.toString('base64')
    }
  } catch (error) {
    logger.error('Erro ao baixar imagem para Gemini', { imageUrl, error })
    throw error
  }
}

export async function askGemini({ systemPrompt, userMessage, imageBase64, mimeType = 'image/jpeg' }) {
  const parts = [{ text: userMessage }]

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType,
        data: imageBase64
      }
    })
  }

  try {
    const response = await fetch(geminiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        },
        contents: [
          {
            role: 'user',
            parts
          }
        ]
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Gemini API ${response.status}: ${body}`)
    }

    const data = await response.json()
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '{}'
  } catch (error) {
    logger.error('Erro ao chamar Gemini', { error })
    throw error
  }
}
