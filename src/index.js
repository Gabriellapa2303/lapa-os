import express from 'express'
import { env } from './config/env.js'
import healthRoutes from './routes/health.js'
import webhookRoutes from './routes/webhook.js'
import { createMessageWorker } from './queues/messageWorker.js'
import { messageQueue, queueConnection, queueEvents } from './queues/messageQueue.js'
import { closeDbPool } from './integrations/mysql.js'
import { logger } from './utils/logger.js'

const app = express()

app.use(express.json({ limit: '15mb' }))
app.use(healthRoutes)
app.use(webhookRoutes)

app.use((error, req, res, next) => {
  logger.error('Erro inesperado no Express', { error })
  res.status(500).json({
    ok: false,
    error: 'internal_error'
  })
})

const worker = createMessageWorker()

const server = app.listen(env.PORT, () => {
  logger.info(`Lapa OS rodando na porta ${env.PORT}`)
})

async function shutdown(signal) {
  logger.info(`Encerrando Lapa OS (${signal})`)

  server.close(async () => {
    await worker.close()
    await messageQueue.close()
    await queueEvents.close()
    await queueConnection.quit()
    await closeDbPool()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export { app }
