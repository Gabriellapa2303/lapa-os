import { getAllTickTickTasks, completeTickTickTask, createTickTickTask, deleteTickTickTask } from '../integrations/ticktick.js'
import { resolvePendingTask, savePendingTask } from '../core/memory.js'
import { addDaysToISODate, extractTime, normalizeText, todayISODate, todayISODateFromDate } from '../utils/formatter.js'
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
    '1️⃣ 💊 Farma Conde',
    '2️⃣ 🏢 Centrya',
    '3️⃣ 🏠 Pessoal'
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

function taskHasTag(task, tag) {
  const clean = cleanTag(tag)
  const expected = clean.replace(/^#/, '')
  const tags = task.tags || []

  return tags.some((taskTag) => {
    const normalized = String(taskTag).replace(/^#/, '')
    return normalized === expected
  })
}

function isPending(task) {
  return Number(task.status || 0) !== 2 && !task.completedTime
}

function cleanTaskIdentifier(identifier = '') {
  return normalizeText(identifier)
    .replace(/^(cancela|cancelar|cancele|cancelei|deleta|deletar|delete|apaga|apagar|exclui|excluir|remove|remover|conclui|completei|concluir|finaliza|finalizar)\s+/i, '')
    .replace(/^(a|o|as|os|uma|um|essa|esse|isso|isto|esta|este|aquela|aquele)\s+/i, '')
    .replace(/\b(tarefa|agenda|evento)\b/g, '')
    .replace(/\b(que|q)\s+(vai|tem|tera|ter[aá])\b.*$/i, '')
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
  if (task.id === identifier) return 100

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

async function findPendingTask(identifier) {
  const tasks = (await getAllTickTickTasks()).filter(isPending)
  const matches = tasks
    .map((task) => ({
      task,
      score: scoreTaskMatch(task, identifier)
    }))
    .filter((match) => match.score >= 40)
    .sort((a, b) => b.score - a.score)

  return matches[0]?.task || null
}

function isToday(dateValue) {
  if (!dateValue) return false
  return todayISODateFromDate(new Date(dateValue)) === todayISODate()
}

function isThisWeek(dateValue) {
  if (!dateValue) return false

  const dueDate = new Date(dateValue)
  const today = new Date(`${todayISODate()}T00:00:00-03:00`)
  const sevenDays = 7 * 24 * 60 * 60 * 1000

  return dueDate >= today && dueDate.getTime() - today.getTime() <= sevenDays
}

const WEEKDAY_MAP = {
  domingo: 0, segunda: 1, 'segunda-feira': 1, terca: 2, 'terça': 2, 'terca-feira': 2, 'terça-feira': 2,
  quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4,
  sexta: 5, 'sexta-feira': 5, sabado: 6, 'sábado': 6
}

function nextWeekday(targetDay) {
  const today = new Date()
  const todayDay = today.getDay()
  let diff = targetDay - todayDay
  if (diff <= 0) diff += 7
  return addDaysToISODate(todayISODate(), diff)
}

function inferDue(text = '') {
  const normalized = normalizeText(text)
  const time = extractTime(text)
  let date = null

  if (normalized.includes('hoje')) {
    date = todayISODate()
  } else if (normalized.includes('amanha') || normalized.includes('amanhã')) {
    date = addDaysToISODate(todayISODate(), 1)
  } else if (normalized.includes('semana que vem') || normalized.includes('proxima semana') || normalized.includes('próxima semana')) {
    date = addDaysToISODate(todayISODate(), 7)
  } else {
    // Detecta dia da semana: "sexta", "na quinta", "segunda às 10h"
    for (const [name, dayNum] of Object.entries(WEEKDAY_MAP)) {
      if (normalized.includes(name)) {
        date = nextWeekday(dayNum)
        break
      }
    }
  }

  return {
    dueDate: date,
    dueTime: time
  }
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
    sections.push(...groups[tag].map((task) => `- ${task.title}`))
    sections.push('')
  }

  if (groups.outros.length) {
    sections.push('📌 *Outros*')
    sections.push(...groups.outros.map((task) => `- ${task.title}`))
    sections.push('')
  }

  sections.push(`Total: ${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}`)

  return `${title}\n\n${sections.join('\n').trim()}`
}

export async function createTask(params = {}, originalMessage = '') {
  const title = params.title || params.titulo || params.name
  const content = params.content || params.descricao || params.description || ''
  const tag = params.tag ? cleanTag(params.tag) : detectContext(`${title || ''} ${content} ${originalMessage}`)
  const inferredDue = inferDue(`${title || ''} ${content} ${originalMessage}`)
  const dueDate = params.dueDate || params.due_date || params.data || inferredDue.dueDate
  const dueTime = params.dueTime || params.due_time || params.hora || inferredDue.dueTime

  if (!title) {
    return 'Me diz o título da tarefa que você quer criar.'
  }

  if (!tag) {
    await savePendingTask({
      title,
      content,
      dueDate,
      dueTime,
      originalMessage
    })

    return askContextQuestion()
  }

  await createTickTickTask({
    title,
    content,
    dueDate,
    dueTime,
    tags: [tag]
  })

  const meta = TAG_META[tag] || { emoji: '📌', label: tag }

  return [
    '✅ *Tarefa criada*',
    `- ${title}`,
    `- Contexto: ${meta.emoji} ${meta.label}`,
    dueDate ? `- Data: ${dueDate}${dueTime ? ` ${dueTime}` : ''}` : null
  ].filter(Boolean).join('\n')
}

export async function createTasks(items = [], originalMessage = '') {
  if (!Array.isArray(items) || !items.length) {
    return 'Me diz quais tarefas você quer criar.'
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
    tag
  }, pendingTask.originalMessage)

  await resolvePendingTask(pendingTask.id)
  return reply
}

export async function listToday() {
  const tasks = (await getAllTickTickTasks())
    .filter(isPending)
    .filter((task) => isToday(task.dueDate))

  return formatGroupedTasks('📋 *Tarefas de hoje*', tasks)
}

export async function listByTag(tag, options = {}) {
  const selectedTag = cleanTag(tag)
  let tasks = (await getAllTickTickTasks())
    .filter((task) => taskHasTag(task, selectedTag))

  if (options.status === 'pending') {
    tasks = tasks.filter(isPending)
  }

  if (options.period === 'week' || options.periodo === 'semana') {
    tasks = tasks.filter((task) => isThisWeek(task.dueDate))
  }

  const meta = TAG_META[selectedTag] || { emoji: '📌', label: selectedTag }
  return formatGroupedTasks(`${meta.emoji} *Tarefas - ${meta.label}*`, tasks)
}

export async function completeTask(identifier) {
  if (!identifier) {
    return 'Qual tarefa você quer concluir?'
  }

  const found = await findPendingTask(identifier)

  if (!found) {
    return `Não encontrei uma tarefa pendente parecida com *${identifier}*.`
  }

  logger.info('Concluindo tarefa TickTick', {
    identifier,
    title: found.title,
    projectId: found.projectId,
    taskId: found.id
  })

  await completeTickTickTask({
    projectId: found.projectId,
    taskId: found.id
  })

  return `✅ Tarefa concluída: *${found.title}*`
}

export async function deleteTask(identifier, actionLabel = 'removida') {
  if (!identifier) {
    return 'Qual tarefa você quer remover?'
  }

  const found = await findPendingTask(identifier)

  if (!found) {
    return `Não encontrei uma tarefa pendente parecida com *${identifier}*.`
  }

  logger.info('Removendo tarefa TickTick', {
    identifier,
    actionLabel,
    title: found.title,
    projectId: found.projectId,
    taskId: found.id
  })

  await deleteTickTickTask({
    projectId: found.projectId,
    taskId: found.id
  })

  return `🗑️ Tarefa ${actionLabel}: *${found.title}*`
}

export async function cancelTask(identifier) {
  return deleteTask(identifier, 'cancelada')
}
