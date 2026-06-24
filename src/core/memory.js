import { appendRow, readSheet } from '../integrations/sheets.js'
import { compactText, normalizeText } from '../utils/formatter.js'
import { logger } from '../utils/logger.js'

const MEMORY_SHEET = 'memoria'

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function loadMemoryRows(limit = 20) {
  try {
    const rows = await readSheet(MEMORY_SHEET)
    const dataRows = rows.filter((row) => row[0] && row[0] !== 'timestamp')
    return dataRows.slice(Math.max(dataRows.length - limit, 0))
  } catch (error) {
    logger.warn('Não foi possível carregar a memória', { error })
    return []
  }
}

export function formatMemoryContext(rows = []) {
  if (!rows.length) return 'Sem contexto recente salvo.'

  return rows
    .map(([timestamp, tipo, conteudo]) => `- ${timestamp} [${tipo}] ${compactText(conteudo, 240)}`)
    .join('\n')
}

export async function appendMemory(tipo, conteudo) {
  await appendRow(MEMORY_SHEET, [new Date().toISOString(), tipo, conteudo])
}

export async function savePendingTask(task) {
  const id = task.id || `pending-${Date.now()}`
  const pendingTask = {
    id,
    ...task,
    aguardando: 'contexto',
    createdAt: new Date().toISOString()
  }

  await appendMemory('pending_task', JSON.stringify(pendingTask))
  return pendingTask
}

export async function resolvePendingTask(id) {
  await appendMemory('pending_task_resolved', JSON.stringify({
    id,
    resolvedAt: new Date().toISOString()
  }))
}

export async function getLatestPendingTask() {
  const rows = await loadMemoryRows(100)
  const resolvedIds = new Set()

  for (const [, tipo, conteudo] of [...rows].reverse()) {
    if (tipo === 'pending_task_resolved') {
      const payload = parseJson(conteudo)
      if (payload?.id) resolvedIds.add(payload.id)
      continue
    }

    if (tipo === 'pending_task') {
      const payload = parseJson(conteudo)
      if (payload?.id && !resolvedIds.has(payload.id)) {
        return payload
      }
    }
  }

  return null
}

export async function searchMemoryRows(query, limit = 5) {
  const rows = await loadMemoryRows(200)
  const terms = normalizeText(query).split(/\s+/).filter(Boolean)

  if (!terms.length) return []

  return rows
    .filter(([, tipo]) => !String(tipo).startsWith('pending_task'))
    .filter(([, , conteudo]) => {
      const normalized = normalizeText(conteudo)
      return terms.every((term) => normalized.includes(term))
    })
    .slice(-limit)
    .reverse()
}
