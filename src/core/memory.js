import { execute, query } from '../integrations/mysql.js'
import { getOwnerUser } from './user.js'
import { compactText, normalizeText } from '../utils/formatter.js'
import { logger } from '../utils/logger.js'

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toMemoryType(tipo = 'fact') {
  const normalized = normalizeText(tipo)

  if (normalized === 'conversa' || normalized === 'conversation') return 'conversation'
  if (normalized === 'fato' || normalized === 'fact') return 'fact'
  if (normalized === 'pending task') return 'pending_task'
  if (normalized === 'pending task resolved') return 'pending_task_resolved'
  if (normalized === 'pending_task' || normalized === 'pending_task_resolved') return normalized
  if (normalized === 'nota' || normalized === 'note') return 'note'

  return 'fact'
}

export async function loadMemoryRows(limit = 20) {
  try {
    const owner = await getOwnerUser()
    const rows = await query(
      `SELECT created_at AS timestamp, memory_type AS tipo, content AS conteudo
       FROM memories
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [owner.id, Number(limit)]
    )

    return rows
      .reverse()
      .map((row) => [row.timestamp, row.tipo, row.conteudo])
  } catch (error) {
    logger.warn('Nao foi possivel carregar a memoria do MySQL', { error })
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
  const owner = await getOwnerUser()

  await execute(
    `INSERT INTO memories (user_id, memory_type, content)
     VALUES (?, ?, ?)`,
    [owner.id, toMemoryType(tipo), conteudo]
  )
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

export async function searchMemoryRows(queryText, limit = 5) {
  const rows = await loadMemoryRows(200)
  const terms = normalizeText(queryText).split(/\s+/).filter(Boolean)

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
