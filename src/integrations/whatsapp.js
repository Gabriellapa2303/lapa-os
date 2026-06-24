import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { normalizePhone } from '../utils/formatter.js'

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export async function sendWhatsAppText(phone, text) {
  const number = normalizePhone(phone)

  if (!number) {
    throw new Error('Número de WhatsApp inválido')
  }

  try {
    const response = await fetch(joinUrl(env.EVOLUTION_API_URL, `/message/sendText/${env.EVOLUTION_INSTANCE}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number,
        text,
        delay: 1200,
        linkPreview: false
      })
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Evolution API ${response.status}: ${body}`)
    }
  } catch (error) {
    logger.error('Erro ao enviar mensagem no WhatsApp', { phone: number, error })
    throw error
  }
}
