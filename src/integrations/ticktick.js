import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { extractTime, saoPauloDateTimeToISOString } from '../utils/formatter.js'

function cleanTag(tag) {
  return String(tag || '').replace(/^#/, '')
}

function sanitizeAccessToken(token) {
  return String(token || '')
    .trim()
    .replace(/&quot;$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim()
}

function redactToken(value) {
  return String(value || '').replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, '[redacted-token]')
}

async function tickTickRequest(path, options = {}) {
  const accessToken = sanitizeAccessToken(env.TICKTICK_ACCESS_TOKEN)

  try {
    const response = await fetch(`${env.TICKTICK_API_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`TickTick API ${response.status}: ${redactToken(body)}`)
    }

    if (response.status === 204) return null

    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    logger.error('Erro na API do TickTick', { path, error })
    throw error
  }
}

function formatDueDate(dueDate, dueTime, title = '', content = '') {
  if (!dueDate) return undefined

  if (String(dueDate).includes('T')) return new Date(dueDate).toISOString()

  const time = dueTime || extractTime(`${title} ${content}`) || '09:00'
  return saoPauloDateTimeToISOString(dueDate, time)
}

export async function createTickTickTask({ title, content, dueDate, dueTime, tags = [] }) {
  const body = {
    title,
    content: content || undefined,
    dueDate: formatDueDate(dueDate, dueTime, title, content),
    timeZone: env.APP_TIMEZONE,
    tags: tags.map(cleanTag).filter(Boolean)
  }

  return tickTickRequest('/task', {
    method: 'POST',
    body
  })
}

export async function getTickTickProjects() {
  return tickTickRequest('/project')
}

export async function getAllTickTickTasks() {
  const projects = await getTickTickProjects()
  const tasks = []

  for (const project of projects || []) {
    const data = await tickTickRequest(`/project/${project.id}/data`)

    for (const task of data?.tasks || []) {
      tasks.push({
        ...task,
        projectId: task.projectId || project.id,
        projectName: project.name
      })
    }
  }

  return tasks
}

export async function completeTickTickTask({ projectId, taskId }) {
  return tickTickRequest(`/project/${projectId}/task/${taskId}/complete`, {
    method: 'POST'
  })
}
