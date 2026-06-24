import { getAllTickTickTasks, completeTickTickTask, createTickTickTask } from '../integrations/ticktick.js'
import { resolvePendingTask, savePendingTask } from '../core/memory.js'
import { normalizeText, todayISODate } from '../utils/formatter.js'

const CONTEXT_KEYWORDS = {
  '#fc': [
    'pfarma',
    'farma conde',
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

function isToday(dateValue) {
  if (!dateValue) return false
  return String(dateValue).startsWith(todayISODate())
}

function isThisWeek(dateValue) {
  if (!dateValue) return false

  const dueDate = new Date(dateValue)
  const now = new Date()
  const sevenDays = 7 * 24 * 60 * 60 * 1000

  return dueDate >= new Date(todayISODate()) && dueDate.getTime() - now.getTime() <= sevenDays
}

function inferDueDate(text = '') {
  const normalized = normalizeText(text)

  if (normalized.includes('hoje')) {
    return todayISODate()
  }

  if (normalized.includes('amanha')) {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    return date.toISOString().slice(0, 10)
  }

  return null
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
  const dueDate = params.dueDate || params.due_date || params.data || inferDueDate(`${title || ''} ${originalMessage}`)

  if (!title) {
    return 'Me diz o título da tarefa que você quer criar.'
  }

  if (!tag) {
    await savePendingTask({
      title,
      content,
      dueDate,
      originalMessage
    })

    return askContextQuestion()
  }

  await createTickTickTask({
    title,
    content,
    dueDate,
    tags: [tag]
  })

  const meta = TAG_META[tag] || { emoji: '📌', label: tag }

  return [
    '✅ *Tarefa criada*',
    `- ${title}`,
    `- Contexto: ${meta.emoji} ${meta.label}`,
    dueDate ? `- Data: ${dueDate}` : null
  ].filter(Boolean).join('\n')
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

  const normalizedIdentifier = normalizeText(identifier)
  const tasks = (await getAllTickTickTasks()).filter(isPending)
  const found = tasks.find((task) => {
    return task.id === identifier || normalizeText(task.title).includes(normalizedIdentifier)
  })

  if (!found) {
    return `Não encontrei uma tarefa pendente parecida com *${identifier}*.`
  }

  await completeTickTickTask({
    projectId: found.projectId,
    taskId: found.id
  })

  return `✅ Tarefa concluída: *${found.title}*`
}
