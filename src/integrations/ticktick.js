import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

function cleanTag(tag) {
  return String(tag || '').replace(/^#/, '')
}

async function tickTickRequest(path, options = {}) {
  try {
    const response = await fetch(`${env.TICKTICK_API_URL}${path}`, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${env.TICKTICK_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`TickTick API ${response.status}: ${body}`)
    }

    if (response.status === 204) return null

    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch (error) {
    logger.error('Erro na API do TickTick', { path, error })
    throw error
  }
}

export async function createTickTickTask({ title, content, dueDate, tags = [] }) {
  const body = {
    title,
    content: content || undefined,
    dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
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
