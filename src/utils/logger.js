function serializeMeta(meta) {
  if (!meta) return ''
  if (meta instanceof Error) {
    return ` ${meta.stack || meta.message}`
  }

  try {
    return ` ${JSON.stringify(meta, (key, value) => {
      if (value instanceof Error) {
        return {
          message: value.message,
          stack: value.stack
        }
      }
      return value
    })}`
  } catch {
    return ` ${String(meta)}`
  }
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${serializeMeta(meta)}`

  if (level === 'error') {
    console.error(line)
    return
  }

  if (level === 'warn') {
    console.warn(line)
    return
  }

  console.log(line)
}

export const logger = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      write('debug', message, meta)
    }
  }
}
