import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

function findDeepValue(value, keyNames) {
  if (!value || typeof value !== 'object') return null

  for (const [key, child] of Object.entries(value)) {
    if (keyNames.includes(key) && typeof child === 'string' && child.trim()) {
      return child
    }
  }

  for (const child of Object.values(value)) {
    const found = findDeepValue(child, keyNames)
    if (found) return found
  }

  return null
}

export async function getEvolutionMediaBase64({ messageId, messageKey, convertToMp4 = false }) {
  if (!messageId && !messageKey?.id) {
    throw new Error('messageId ausente para buscar mídia na Evolution API')
  }

  const body = {
    message: {
      key: messageKey || { id: messageId }
    },
    convertToMp4
  }

  try {
    const response = await fetch(joinUrl(env.EVOLUTION_API_URL, `/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Evolution media ${response.status}: ${text}`)
    }

    const data = await response.json()
    const base64 = findDeepValue(data, ['base64', 'media', 'data'])
    const mimeType = findDeepValue(data, ['mimetype', 'mimeType'])

    if (!base64) {
      throw new Error('Evolution API não retornou base64 da mídia')
    }

    return {
      base64,
      mimeType: mimeType || (convertToMp4 ? 'audio/mp4' : 'audio/ogg')
    }
  } catch (error) {
    logger.error('Erro ao buscar mídia descriptografada na Evolution API', {
      messageId: messageId || messageKey?.id,
      error
    })
    throw error
  }
}
