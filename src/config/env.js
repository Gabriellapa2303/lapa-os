import 'dotenv/config'

const requiredEnv = [
  'EVOLUTION_API_URL',
  'EVOLUTION_API_KEY',
  'EVOLUTION_INSTANCE',
  'OWNER_PHONE',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_SERVICE_ACCOUNT_B64',
  'GOOGLE_SHEETS_ID',
  'TICKTICK_ACCESS_TOKEN',
  'REDIS_URL'
]

function readEnv(name, fallback = '') {
  return process.env[name] || fallback
}

function readPort() {
  const port = Number(readEnv('PORT', '3000'))
  return Number.isInteger(port) && port > 0 ? port : 3000
}

const missing = requiredEnv.filter((name) => !process.env[name])
const nodeEnv = readEnv('NODE_ENV', 'development')

if (missing.length > 0) {
  const message = `Variáveis de ambiente ausentes: ${missing.join(', ')}`

  if (nodeEnv === 'production') {
    throw new Error(message)
  }

  console.warn(`[env] ${message}`)
}

export const env = Object.freeze({
  PORT: readPort(),
  NODE_ENV: nodeEnv,
  TZ: readEnv('TZ', 'America/Sao_Paulo'),
  APP_TIMEZONE: readEnv('APP_TIMEZONE', readEnv('TZ', 'America/Sao_Paulo')),
  EVOLUTION_API_URL: readEnv('EVOLUTION_API_URL'),
  EVOLUTION_API_KEY: readEnv('EVOLUTION_API_KEY'),
  EVOLUTION_INSTANCE: readEnv('EVOLUTION_INSTANCE'),
  OWNER_PHONE: readEnv('OWNER_PHONE'),
  GROQ_API_KEY: readEnv('GROQ_API_KEY'),
  GROQ_AUDIO_MODEL: readEnv('GROQ_AUDIO_MODEL', 'whisper-large-v3-turbo'),
  GEMINI_API_KEY: readEnv('GEMINI_API_KEY'),
  GOOGLE_SERVICE_ACCOUNT_B64: readEnv('GOOGLE_SERVICE_ACCOUNT_B64'),
  GOOGLE_SHEETS_ID: readEnv('GOOGLE_SHEETS_ID'),
  TICKTICK_ACCESS_TOKEN: readEnv('TICKTICK_ACCESS_TOKEN'),
  REDIS_URL: readEnv('REDIS_URL', 'redis://localhost:6379'),
  TICKTICK_API_URL: readEnv('TICKTICK_API_URL', 'https://api.ticktick.com/open/v1')
})
