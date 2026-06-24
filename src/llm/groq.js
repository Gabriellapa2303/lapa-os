import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_AUDIO_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'

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

function stripBase64Prefix(value = '') {
  return String(value).replace(/^data:[^;]+;base64,/i, '')
}

function extensionFromMimeType(mimeType = '') {
  const clean = String(mimeType).split(';')[0].toLowerCase()

  if (clean.includes('mpeg') || clean.includes('mp3')) return 'mp3'
  if (clean.includes('mp4') || clean.includes('m4a')) return 'm4a'
  if (clean.includes('wav')) return 'wav'
  if (clean.includes('webm')) return 'webm'
  if (clean.includes('ogg') || clean.includes('opus')) return 'ogg'

  return 'ogg'
}

export async function downloadAudioAsBuffer(audioUrl) {
  try {
    const response = await fetch(audioUrl, {
      headers: env.EVOLUTION_API_KEY ? { apikey: env.EVOLUTION_API_KEY } : undefined
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Download de áudio ${response.status}: ${body}`)
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || 'audio/ogg'
    }
  } catch (error) {
    logger.error('Erro ao baixar áudio', { audioUrl, error })
    throw error
  }
}

export async function transcribeGroqAudio({ audioBase64, audioUrl, mimeType = 'audio/ogg' }) {
  try {
    let buffer = null
    let resolvedMimeType = mimeType

    if (audioBase64) {
      buffer = Buffer.from(stripBase64Prefix(audioBase64), 'base64')
    } else if (audioUrl) {
      const downloaded = await downloadAudioAsBuffer(audioUrl)
      buffer = downloaded.buffer
      resolvedMimeType = downloaded.mimeType || mimeType
    }

    if (!buffer?.length) {
      throw new Error('Áudio vazio ou ausente para transcrição')
    }

    const formData = new FormData()
    const extension = extensionFromMimeType(resolvedMimeType)
    formData.append('file', new Blob([buffer], { type: resolvedMimeType }), `audio.${extension}`)
    formData.append('model', env.GROQ_AUDIO_MODEL)
    formData.append('language', 'pt')
    formData.append('response_format', 'json')

    const response = await fetch(GROQ_AUDIO_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`
      },
      body: formData
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Groq áudio ${response.status}: ${body}`)
    }

    const data = await response.json()
    return data.text || ''
  } catch (error) {
    logger.error('Erro ao transcrever áudio no Groq', { error })
    throw error
  }
}
