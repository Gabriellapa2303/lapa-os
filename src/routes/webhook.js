import { Router } from 'express'
import { env } from '../config/env.js'
import { enqueueMessage } from '../queues/messageQueue.js'
import { normalizePhone } from '../utils/formatter.js'
import { logger } from '../utils/logger.js'

const router = Router()

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

function extractMessageText(message = {}) {
  return firstDefined(
    message.conversation,
    message.extendedTextMessage?.text,
    message.imageMessage?.caption,
    message.audioMessage?.caption,
    message.videoMessage?.caption,
    message.documentMessage?.caption,
    message.documentWithCaptionMessage?.message?.documentMessage?.caption,
    ''
  )
}

function isMimeType(value, prefix) {
  return String(value || '').toLowerCase().startsWith(prefix)
}

function extractImage(body = {}, message = {}) {
  const imageMessage = firstDefined(
    message.imageMessage,
    message.documentWithCaptionMessage?.message?.imageMessage,
    body.data?.message?.imageMessage,
    body.message?.imageMessage
  )
  const mimeType = firstDefined(
    imageMessage?.mimetype,
    imageMessage?.mimeType,
    body.data?.mimetype,
    body.mimeType,
    ''
  )

  if (!imageMessage && !isMimeType(mimeType, 'image/')) {
    return {
      imageUrl: null,
      imageBase64: null,
      mimeType: null
    }
  }

  return {
    imageUrl: firstDefined(
      imageMessage?.url,
      body.data?.mediaUrl,
      body.data?.message?.mediaUrl,
      body.mediaUrl,
      body.imageUrl
    ),
    imageBase64: firstDefined(
      imageMessage?.base64,
      body.data?.base64,
      body.data?.message?.base64,
      body.base64
    ),
    mimeType: firstDefined(
      mimeType,
      'image/jpeg'
    )
  }
}

function extractAudio(body = {}, message = {}) {
  const audioMessage = firstDefined(
    message.audioMessage,
    body.data?.message?.audioMessage,
    body.message?.audioMessage
  )
  const mimeType = firstDefined(
    audioMessage?.mimetype,
    audioMessage?.mimeType,
    body.data?.mimetype,
    body.mimeType,
    ''
  )

  if (!audioMessage && !isMimeType(mimeType, 'audio/')) {
    return {
      audioUrl: null,
      audioBase64: null,
      audioMimeType: null
    }
  }

  return {
    audioUrl: firstDefined(
      audioMessage?.url,
      body.data?.mediaUrl,
      body.data?.message?.mediaUrl,
      body.mediaUrl,
      body.audioUrl
    ),
    audioBase64: firstDefined(
      audioMessage?.base64,
      body.data?.base64,
      body.data?.message?.base64,
      body.base64
    ),
    audioMimeType: firstDefined(
      mimeType,
      'audio/ogg'
    )
  }
}

function parseWebhook(body = {}) {
  const data = body.data || body
  const key = data.key || body.key || {}
  const message = data.message || body.message || {}
  const remoteJid = firstDefined(key.remoteJid, data.remoteJid, body.remoteJid, data.sender, body.sender)
  const phone = normalizePhone(String(remoteJid || '').split('@')[0])
  const image = extractImage(body, message)
  const audio = extractAudio(body, message)

  return {
    phone,
    message: extractMessageText(message),
    imageUrl: image.imageUrl,
    imageBase64: image.imageBase64,
    mimeType: image.mimeType,
    audioUrl: audio.audioUrl,
    audioBase64: audio.audioBase64,
    audioMimeType: audio.audioMimeType,
    messageId: firstDefined(key.id, data.messageId, body.messageId),
    fromMe: Boolean(key.fromMe)
  }
}

router.post('/webhook/whatsapp', async (req, res) => {
  const parsed = parseWebhook(req.body)
  const ownerPhone = normalizePhone(env.OWNER_PHONE)

  if (!parsed.phone || parsed.phone !== ownerPhone) {
    logger.warn('Webhook ignorado: remetente não autorizado', {
      phone: parsed.phone,
      messageId: parsed.messageId
    })

    return res.status(200).json({
      ok: true,
      ignored: true
    })
  }

  if (!parsed.message && !parsed.imageUrl && !parsed.imageBase64 && !parsed.audioUrl && !parsed.audioBase64) {
    logger.warn('Webhook ignorado: sem texto, imagem ou áudio', { messageId: parsed.messageId })

    return res.status(200).json({
      ok: true,
      ignored: true
    })
  }

  try {
    const job = await enqueueMessage({
      ...parsed,
      receivedAt: new Date().toISOString()
    })

    return res.status(200).json({
      ok: true,
      queued: true,
      jobId: job.id
    })
  } catch (error) {
    logger.error('Erro ao enfileirar webhook', { error })

    return res.status(500).json({
      ok: false,
      error: 'queue_error'
    })
  }
})

export default router
