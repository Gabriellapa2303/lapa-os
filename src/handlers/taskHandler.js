import { execute, query } from '../integrations/mysql.js'
import { getOwnerUser } from '../core/user.js'
import { resolvePendingTask, savePendingTask } from '../core/memory.js'
import { addDaysToISODate, DEFAULT_TIMEZONE, extractTime, normalizeText, todayISODate } from '../utils/formatter.js'
import { logger } from '../utils/logger.js'

const CONTEXT_KEYWORDS = {
  '#fc': [
    'pfarma',
    'farma conde',
    'farmaconde',
    'claudia',
    'condemais',
    'afiliadobot',
    'juria',
    'pulso',
    'deploy',
    'pull request',
    'pr ',
    'sql',
    'relatorio',
    'dashboard',
    'easypanel',
    'php',
    'sistema',
    'servidor'
  ],
  '#centrya': [
    'centrya',
    'bicego',
    'hub',
    'cliente',
    'proposta',
    'freelance',
    'consultoria',
    'contrato',
    'reuniao cliente',
    'apresentacao'
  ],
  '#pessoal': [
    'comprar',
    'medico',
    'academia',
    'treino',
    'correr',
    'volei',
    'familia',
    'pessoal',
    'mercado',
    'farmacia',
    'dentista',
    'carro',
    'casa',
    'banco',
    'personal'
  ]
}

const TAG_META = {
  '#fc': { emoji: '💊', label: 'Farma Conde' },
  '#centrya': { emoji: '🏢', label: 'Centrya' },
  '#pessoal': { emoji: '🏠', label: 'Pessoal' }
}

export function detectContext(message = '') {
  const lower = normalizeText(message)

  for (const [tag, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return tag
    }
  }

  return null
}

export function askContextQuestion() {
  return [
    'Qual contexto dessa tarefa?',
    '',
    '1. 💊 Farma Conde',
    '2. 🏢 Centrya',
    '3. 🏠 Pessoal'
  ].join('\n')
}

export function parseContextChoice(message = '') {
  const value = normalizeText(message)

  if (/^(1|fc|farma|farma conde|pfarma)$/.test(value)) return '#fc'
  if (/^(2|centrya|bicego|cliente)$/.test(value)) return '#centrya'
  if (/^(3|pessoal|vida pessoal|casa)$/.test(value)) return '#pessoal'

  return detectContext(message)
}

function cleanTag(tag) {
  const value = String(tag || '').trim()
  return value.startsWith('#') ? value : `#${value}`
}

function contextCode(tag) {
  return cleanTag(tag).replace(/^#/, '')
}

function isPending(task) {
  return task.status === 'pending'
}

function cleanTaskIdentifier(identifier = '') {
  return normalizeText(identifier)
    .replace(/^(cancela|cancelar|cancele|cancelei|deleta|deletar|delete|apaga|apagar|exclui|excluir|remove|remover|conclui|completei|concluir|finaliza|finalizar)\s+/i, '')
    .replace(/^(a|o|as|os|uma|um|essa|esse|isso|isto|esta|este|aquela|aquele)\s+/i, '')
    .replace(/\b(tarefa|agenda|evento)\b/g, '')
    .replace(/\b(que|q)\s+(vai|tem|tera|ter[aã¡])\b.*$/i, '')
    .replace(/\b(hoje|amanha|amanah|as|às|ao|aos)\b.*$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeTaskText(value = '') {
  const ignored = new Set(['a', 'o', 'as', 'os', 'um', 'uma', 'essa', 'esse', 'isso', 'isto', 'esta', 'este', 'aquela', 'aquele', 'com', 'de', 'da', 'do', 'das', 'dos', 'para', 'pra', 'que', 'vai', 'ter', 'tera', 'tarefa', 'agenda', 'evento', 'cancela', 'cancelar', 'deleta', 'delete', 'apaga', 'exclui', 'remove', 'conclui', 'hoje', 'amanha', 'amanah'])

  return cleanTaskIdentifier(value)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !ignored.has(word))
}

function scoreTaskMatch(task, identifier) {
  if (String(task.id) === String(identifier)) return 100

  const taskTitle = normalizeText(task.title)
  const cleanIdentifier = cleanTaskIdentifier(identifier)

  if (!cleanIdentifier) return 0
  if (taskTitle === cleanIdentifier) return 95
  if (taskTitle.includes(cleanIdentifier) || cleanIdentifier.includes(taskTitle)) return 85

  const words = tokenizeTaskText(identifier)
  if (!words.length) return 0

  const hits = words.filter((word) => taskTitle.includes(word)).length
  return Math.round((hits / words.length) * 80)
}

function dbDateTimeFromParts(dateValue, timeValue = '09:00') {
  if (!dateValue) return null

  if (String(dateValue).includes('T')) {
    return formatDateObjectToDb(new Date(dateValue))
  }

  const [hour = '09', minute = '00'] = String(timeValue || '09:00').split(':')
  return `${String(dateValue).slice(0, 10)} ${String(hour).padStart(2, '0')}:${String(minute || '00').padStart(2, '0')}:00`
}

function formatDateObjectToDb(date, timeZone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}:${byType.second}`
}

function addMinutesToDbDateTime(value, minutes) {
  const isoLike = `${String(value).replace(' ', 'T')}-03:00`
  return formatDateObjectToDb(new Date(new Date(isoLike).getTime() + minutes * 60 * 1000))
}

function inferDue(text = '') {
  const normalized = normalizeText(text)
  const time = extractTime(text)
  let date = null

  if (normalized.includes('hoje')) {
    date = todayISODate()
  }

  if (!date && normalized.includes('amanha')) {
    date = addDaysToISODate(todayISODate(), 1)
  }

  return {
    dueDate: date,
    dueTime: time
  }
}

function isCalendarIntent(text = '') {
  return /\b(agenda|evento|reuniao|compromisso|call|consulta)\b/.test(normalizeText(text))
}

function resolveSchedule(params = {}, title = '', content = '', originalMessage = '') {
  const baseText = `${title} ${content} ${originalMessage}`
  const inferredDue = inferDue(baseText)
  const startDate = params.startDate || params.start_date || params.dataInicio || params.inicioData
  const startTime = params.startTime || params.start_time || params.horaInicio || params.inicioHora
  const dueDate = params.dueDate || params.due_date || params.endDate || params.end_date || params.data || inferredDue.dueDate
  const dueTime = params.dueTime || params.due_time || params.endTime || params.end_time || params.hora || inferredDue.dueTime
  let startAt = startDate ? dbDateTimeFromParts(startDate, startTime || dueTime || '09:00') : null
  let dueAt = dueDate ? dbDateTimeFromParts(dueDate, dueTime || startTime || '09:00') : null

  if (!startAt && dueAt && dueTime && isCalendarIntent(baseText)) {
    startAt = dueAt
    dueAt = addMinutesToDbDateTime(startAt, 60)
  }

  return {
    startAt,
    dueAt,
    isAllDay: Boolean(params.isAllDay || params.diaInteiro)
  }
}

async function getContextId(tag) {
  const code = contextCode(tag)

  await execute(
    `INSERT INTO task_contexts (code, label, active)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE active = 1`,
    [code, TAG_META[`#${code}`]?.label || code]
  )

  const rows = await query(
    `SELECT id
     FROM task_contexts
     WHERE code = ?
     LIMIT 1`,
    [code]
  )

  return rows[0]?.id || null
}

function readTask(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    contextCode: row.context_code,
    contextLabel: row.context_label,
    startAt: row.start_at,
    dueAt: row.due_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at
  }
}

async function getPendingTasks() {
  const owner = await getOwnerUser()
  const rows = await query(
    `SELECT
       t.id,
       t.title,
       t.content,
       t.status,
       t.start_at,
       t.due_at,
       t.completed_at,
       t.cancelled_at,
       c.code AS context_code,
       c.label AS context_label
     FROM tasks t
     LEFT JOIN task_contexts c ON c.id = t.context_id
     WHERE t.user_id = ?
       AND t.status = 'pending'
     ORDER BY COALESCE(t.start_at, t.due_at, t.created_at), t.id`,
    [owner.id]
  )

  return rows.map(readTask)
}

async function findPendingTask(identifier) {
  const tasks = (await getPendingTasks()).filter(isPending)
  const matches = tasks
    .map((task) => ({
      task,
      score: scoreTaskMatch(task, identifier)
    }))
    .filter((match) => match.score >= 40)
    .sort((a, b) => b.score - a.score)

  return matches[0]?.task || null
}

function taskHasTag(task, tag) {
  return task.contextCode === contextCode(tag)
}

function formatTaskTime(task) {
  const value = task.startAt || task.dueAt
  if (!value) return ''

  const time = String(value).slice(11, 16)
  return time ? ` (${time})` : ''
}

function formatGroupedTasks(title, tasks) {
  if (!tasks.length) {
    return `${title}\n\nNenhuma tarefa encontrada.`
  }

  const groups = {
    '#fc': [],
    '#centrya': [],
    '#pessoal': [],
    outros: []
  }

  for (const task of tasks) {
    const tag = ['#fc', '#centrya', '#pessoal'].find((candidate) => taskHasTag(task, candidate))
    groups[tag || 'outros'].push(task)
  }

  const sections = []

  for (const tag of ['#fc', '#centrya', '#pessoal']) {
    if (!groups[tag].length) continue

    const meta = TAG_META[tag]
    sections.push(`${meta.emoji} *${meta.label}*`)
    sections.push(...groups[tag].map((task) => `- ${task.title}${formatTaskTime(task)}`))
    sections.push('')
  }

  if (groups.outros.length) {
    sections.push('📌 *Outros*')
    sections.push(...groups.outros.map((task) => `- ${task.title}${formatTaskTime(task)}`))
    sections.push('')
  }

  sections.push(`Total: ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}`)

  return `${title}\n\n${sections.join('\n').trim()}`
}

export async function createTask(params = {}, originalMessage = '') {
  const owner = await getOwnerUser()
  const title = params.title || params.titulo || params.name
  const content = params.content || params.descricao || params.description || ''
  const tag = params.tag ? cleanTag(params.tag) : detectContext(`${title || ''} ${content} ${originalMessage}`)

  if (!title) {
    return 'Me diz o titulo da tarefa que voce quer criar.'
  }

  const schedule = resolveSchedule(params, title, content, originalMessage)

  if (!tag) {
    await savePendingTask({
      title,
      content,
      dueDate: params.dueDate || params.due_date || params.data,
      dueTime: params.dueTime || params.due_time || params.hora,
      startDate: params.startDate || params.start_date,
      startTime: params.startTime || params.start_time,
      originalMessage
    })

    return askContextQuestion()
  }

  const contextId = await getContextId(tag)

  const result = await execute(
    `INSERT INTO tasks
       (user_id, context_id, title, content, status, priority, start_at, due_at, timezone, is_all_day, source)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, 'whatsapp')`,
    [
      owner.id,
      contextId,
      title,
      content || null,
      Number(params.priority || params.prioridade || 0),
      schedule.startAt,
      schedule.dueAt,
      DEFAULT_TIMEZONE,
      schedule.isAllDay ? 1 : 0
    ]
  )

  logger.info('Tarefa criada no MySQL', {
    taskId: result.insertId,
    title,
    context: tag
  })

  const meta = TAG_META[tag] || { emoji: '📌', label: tag }

  return [
    '✅ *Tarefa criada*',
    `- ${title}`,
    `- Contexto: ${meta.emoji} ${meta.label}`,
    schedule.startAt ? `- Inicio: ${schedule.startAt}` : null,
    schedule.dueAt ? `- Prazo: ${schedule.dueAt}` : null
  ].filter(Boolean).join('\n')
}

export async function createTasks(items = [], originalMessage = '') {
  if (!Array.isArray(items) || !items.length) {
    return 'Me diz quais tarefas voce quer criar.'
  }

  const replies = []

  for (const item of items) {
    replies.push(await createTask(item, originalMessage))
  }

  return replies.join('\n\n')
}

export async function createTaskFromPending(message, pendingTask) {
  const tag = parseContextChoice(message)

  if (!tag) {
    return askContextQuestion()
  }

  const reply = await createTask({
    title: pendingTask.title,
    content: pendingTask.content,
    dueDate: pendingTask.dueDate,
    dueTime: pendingTask.dueTime,
    startDate: pendingTask.startDate,
    startTime: pendingTask.startTime,
    tag
  }, pendingTask.originalMessage)

  await resolvePendingTask(pendingTask.id)
  return reply
}

export async function listToday() {
  const owner = await getOwnerUser()
  const rows = await query(
    `SELECT
       t.id,
       t.title,
       t.content,
       t.status,
       t.start_at,
       t.due_at,
       t.completed_at,
       t.cancelled_at,
       c.code AS context_code,
       c.label AS context_label
     FROM tasks t
     LEFT JOIN task_contexts c ON c.id = t.context_id
     WHERE t.user_id = ?
       AND t.status = 'pending'
       AND DATE(COALESCE(t.start_at, t.due_at)) = ?
     ORDER BY COALESCE(t.start_at, t.due_at), t.id`,
    [owner.id, todayISODate()]
  )

  return formatGroupedTasks('📋 *Tarefas de hoje*', rows.map(readTask))
}

export async function listByTag(tag, options = {}) {
  const owner = await getOwnerUser()
  const selectedTag = cleanTag(tag)
  const code = contextCode(selectedTag)
  const params = [owner.id, code]
  let periodFilter = ''

  if (options.period === 'week' || options.periodo === 'semana') {
    periodFilter = 'AND COALESCE(t.start_at, t.due_at) >= NOW() AND COALESCE(t.start_at, t.due_at) < DATE_ADD(NOW(), INTERVAL 7 DAY)'
  }

  const rows = await query(
    `SELECT
       t.id,
       t.title,
       t.content,
       t.status,
       t.start_at,
       t.due_at,
       t.completed_at,
       t.cancelled_at,
       c.code AS context_code,
       c.label AS context_label
     FROM tasks t
     LEFT JOIN task_contexts c ON c.id = t.context_id
     WHERE t.user_id = ?
       AND c.code = ?
       AND t.status = 'pending'
       ${periodFilter}
     ORDER BY COALESCE(t.start_at, t.due_at, t.created_at), t.id`,
    params
  )

  const meta = TAG_META[selectedTag] || { emoji: '📌', label: selectedTag }
  return formatGroupedTasks(`${meta.emoji} *Tarefas - ${meta.label}*`, rows.map(readTask))
}

export async function completeTask(identifier) {
  if (!identifier) {
    return 'Qual tarefa voce quer concluir?'
  }

  const found = await findPendingTask(identifier)

  if (!found) {
    return `Nao encontrei uma tarefa pendente parecida com *${identifier}*.`
  }

  await execute(
    `UPDATE tasks
     SET status = 'completed',
         completed_at = NOW()
     WHERE id = ?`,
    [found.id]
  )

  return `✅ Tarefa concluida: *${found.title}*`
}

export async function deleteTask(identifier, actionLabel = 'removida') {
  if (!identifier) {
    return 'Qual tarefa voce quer remover?'
  }

  const found = await findPendingTask(identifier)

  if (!found) {
    return `Nao encontrei uma tarefa pendente parecida com *${identifier}*.`
  }

  const nextStatus = actionLabel === 'cancelada' ? 'cancelled' : 'deleted'
  const timestampColumn = actionLabel === 'cancelada' ? 'cancelled_at' : 'deleted_at'

  await execute(
    `UPDATE tasks
     SET status = ?,
         ${timestampColumn} = NOW()
     WHERE id = ?`,
    [nextStatus, found.id]
  )

  return `🗑️ Tarefa ${actionLabel}: *${found.title}*`
}

export async function cancelTask(identifier) {
  return deleteTask(identifier, 'cancelada')
}
