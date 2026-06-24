import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '../config/env.js'

export const MESSAGE_QUEUE_NAME = 'whatsapp-messages'

export function createRedisConnection() {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null
  })
}

export const queueConnection = createRedisConnection()

export const messageQueue = new Queue(MESSAGE_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 500
  }
})

export const queueEvents = new QueueEvents(MESSAGE_QUEUE_NAME, {
  connection: createRedisConnection()
})

export async function enqueueMessage(payload) {
  return messageQueue.add('incoming-whatsapp-message', payload)
}
