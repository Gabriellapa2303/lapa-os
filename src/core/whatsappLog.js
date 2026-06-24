import { execute } from '../integrations/mysql.js'
import { getOwnerUser } from './user.js'
import { logger } from '../utils/logger.js'

function messageTypeFromPayload(payload = {}) {
  if (payload.hasAudio || payload.audioUrl || payload.audioBase64) return 'audio'
  if (payload.imageUrl || payload.imageBase64) return 'image'
  return 'text'
}

async function safeLog(fn) {
  try {
    return await fn()
  } catch (error) {
    logger.warn('Falha ao gravar log de WhatsApp no MySQL', { error })
    return null
  }
}

export async function recordIncomingWhatsAppMessage(payload = {}) {
  return safeLog(async () => {
    const owner = await getOwnerUser()
    const result = await execute(
      `INSERT INTO whatsapp_messages
         (user_id, direction, provider_message_id, message_type, body, media_url, media_mime_type, processed_status, received_at)
       VALUES (?, 'inbound', ?, ?, ?, ?, ?, 'queued', ?)`,
      [
        owner.id,
        payload.messageId || null,
        messageTypeFromPayload(payload),
        payload.message || null,
        payload.imageUrl || payload.audioUrl || null,
        payload.mimeType || payload.audioMimeType || null,
        payload.receivedAt ? String(payload.receivedAt).slice(0, 19).replace('T', ' ') : null
      ]
    )

    return result.insertId
  })
}

export async function updateIncomingWhatsAppMessage(id, fields = {}) {
  if (!id) return null

  return safeLog(async () => {
    const updates = []
    const params = []

    if (fields.processedStatus) {
      updates.push('processed_status = ?')
      params.push(fields.processedStatus)
    }

    if (fields.errorMessage !== undefined) {
      updates.push('error_message = ?')
      params.push(fields.errorMessage)
    }

    if (fields.transcription !== undefined) {
      updates.push('transcription = ?')
      params.push(fields.transcription)
    }

    if (fields.intent !== undefined) {
      updates.push('intent_json = ?')
      params.push(JSON.stringify(fields.intent))
    }

    if (!updates.length) return null

    params.push(id)
    return execute(
      `UPDATE whatsapp_messages
       SET ${updates.join(', ')}
       WHERE id = ?`,
      params
    )
  })
}

export async function recordOutgoingWhatsAppMessage({ text, providerMessageId = null } = {}) {
  return safeLog(async () => {
    const owner = await getOwnerUser()

    await execute(
      `INSERT INTO whatsapp_messages
         (user_id, direction, provider_message_id, message_type, body, processed_status, sent_at)
       VALUES (?, 'outbound', ?, 'text', ?, 'processed', NOW())`,
      [owner.id, providerMessageId, text || null]
    )
  })
}
