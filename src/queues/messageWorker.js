import { Worker } from 'bullmq'
import { handleIncomingMessage } from '../core/brain.js'
import { logger } from '../utils/logger.js'
import { createRedisConnection, MESSAGE_QUEUE_NAME } from './messageQueue.js'

export function createMessageWorker() {
  const worker = new Worker(
    MESSAGE_QUEUE_NAME,
    async (job) => {
      await handleIncomingMessage(job.data)
    },
    {
      connection: createRedisConnection(),
      concurrency: 2
    }
  )

  worker.on('completed', (job) => {
    logger.info('Job de mensagem concluído', { jobId: job.id })
  })

  worker.on('failed', (job, error) => {
    logger.error('Job de mensagem falhou', {
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error
    })
  })

  worker.on('error', (error) => {
    logger.error('Erro no worker BullMQ', { error })
  })

  return worker
}
