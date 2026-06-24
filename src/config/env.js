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

function readBoolean(name, fallback = false) {
  const value = readEnv(name, String(fallback)).toLowerCase()
  return ['1', 'true', 'yes', 'sim', 'on'].includes(value)
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
  OPENROUTER_ENABLED: readBoolean('OPENROUTER_ENABLED', Boolean(process.env.OPENROUTER_API_KEY)),
  OPENROUTER_API_KEY: readEnv('OPENROUTER_API_KEY'),
  OPENROUTER_FREE_ONLY: readBoolean('OPENROUTER_FREE_ONLY', true),
  OPENROUTER_MODEL: readEnv('OPENROUTER_MODEL', 'openrouter/free'),
  OPENROUTER_FREE_FALLBACK_MODEL: readEnv('OPENROUTER_FREE_FALLBACK_MODEL', 'openrouter/free'),
  OPENROUTER_FREE_FALLBACK_MODELS: readEnv('OPENROUTER_FREE_FALLBACK_MODELS', 'openrouter/free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,qwen/qwen3-next-80b-a3b-instruct:free,nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-oss-20b:free'),
  OPENROUTER_SITE_URL: readEnv('OPENROUTER_SITE_URL', 'https://central-lapaos.oopleb.easypanel.host'),
  OPENROUTER_APP_NAME: readEnv('OPENROUTER_APP_NAME', 'Lapa OS'),
  GEMINI_API_KEY: readEnv('GEMINI_API_KEY'),
  GOOGLE_SERVICE_ACCOUNT_B64: readEnv('GOOGLE_SERVICE_ACCOUNT_B64'),
  GOOGLE_SHEETS_ID: readEnv('GOOGLE_SHEETS_ID'),
  TICKTICK_ACCESS_TOKEN: readEnv('TICKTICK_ACCESS_TOKEN'),
  REDIS_URL: readEnv('REDIS_URL', 'redis://localhost:6379'),
  TICKTICK_API_URL: readEnv('TICKTICK_API_URL', 'https://api.ticktick.com/open/v1')
})
