import { routeLLM } from './router.js'
import { appendMemory, formatMemoryContext, getLatestPendingTask, loadMemoryRows } from './memory.js'
import { askGroq } from '../llm/groq.js'
import { askGemini, downloadImageAsBase64 } from '../llm/gemini.js'
import { sendWhatsAppText } from '../integrations/whatsapp.js'
import { addExpense, addRecurrence, getBalance, getBudget, getMonthSummary, getReport } from '../handlers/financeHandler.js'
import { completeTask, createTask, createTaskFromPending, listByTag, listToday, detectContext } from '../handlers/taskHandler.js'
import { saveMemory, searchMemory } from '../handlers/memoryHandler.js'
import { compactText, formatErrorMessage, normalizeText } from '../utils/formatter.js'
import { logger } from '../utils/logger.js'

function buildSystemPrompt(memoryContext) {
  return `
Você é o Lapa OS, o assistente pessoal e segundo cérebro do seu dono.

Você conhece tudo sobre ele:
- Desenvolvedor fullstack, backend-focused, ~3 anos de experiência
- Trabalha na Farma Conde (sistema PFarma) e tem a Centrya (consultoria solo)
- Co-fundou a Bicego Hub (software odontológico)
- Projetos ativos: ClaudIA, CondeMais, AfiliadoBot, Pulso, JurIA
- Stack preferido: Node.js, PHP, MySQL, Docker, n8n, Evolution API
- Mora em São José dos Campos, SP
- Corre e joga vôlei
- Cursando Análise e Desenvolvimento de Sistemas na UNIVAP

Suas ferramentas disponíveis:
- task: criar/listar/completar tarefas e eventos no TickTick (sempre com tag de contexto)
- finance: registrar gastos, consultar saldo, ver orçamento (Google Sheets)
- memory: salvar/buscar informações importantes
- report: gerar relatório financeiro mensal

Regras de tarefas:
- #pessoal -> vida pessoal (saúde, compras, família, treino, corrida, vôlei)
- #centrya -> consultoria Centrya, Bicego Hub e clientes
- #fc -> Farma Conde, PFarma e projetos internos (ClaudIA, CondeMais, AfiliadoBot, JurIA, Pulso)

Ao criar tarefa, detecte o contexto automaticamente. Se ambíguo, retorne task.create sem tag.
Responda sempre em português, direto, objetivo e adequado para WhatsApp.

Retorne somente JSON válido neste formato:
{
  "tool": "task|finance|memory|report|none",
  "action": "create|listToday|listByTag|complete|addExpense|addRecurrence|getMonthSummary|getBalance|getBudget|getReport|save|search|reply",
  "params": {},
  "reply": "texto opcional quando tool=none"
}

Para imagem de nota fiscal, extraia valor, categoria, descrição, conta se houver e retorne finance.addExpense.
Para listByTag use params.tag com "#fc", "#centrya" ou "#pessoal".
Para completar tarefa, use params.identifier.

Contexto recente:
${memoryContext}
`.trim()
}

function parseIntent(text) {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')

    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }

    throw new Error(`Resposta do LLM não é JSON: ${text}`)
  }
}

function normalizeIntent(intent = {}) {
  let tool = intent.tool || intent.intent || 'none'
  let action = intent.action || 'reply'

  if (String(tool).includes('.')) {
    const [parsedTool, parsedAction] = String(tool).split('.')
    tool = parsedTool
    action = parsedAction || action
  }

  if (String(action).includes('.')) {
    const [parsedTool, parsedAction] = String(action).split('.')
    tool = parsedTool
    action = parsedAction
  }

  return {
    tool: String(tool).toLowerCase(),
    action: String(action),
    params: intent.params || {},
    reply: intent.reply
  }
}

function extractAmount(message) {
  const match = String(message).match(/(?:r\$\s*)?(-?\d+(?:[.,]\d{1,2})?)/i)
  return match ? match[1] : null
}

function cleanTaskTitle(message) {
  return String(message)
    .replace(/^(cria|criar|adiciona|adicionar)\s+(uma\s+)?tarefa\s*/i, '')
    .replace(/^tarefa:\s*/i, '')
    .replace(/^lembra\s+de\s+/i, '')
    .trim()
}

function fallbackIntent(message, hasImage) {
  const normalized = normalizeText(message)

  if (hasImage) {
    return {
      tool: 'none',
      action: 'reply',
      reply: 'Recebi a imagem, mas não consegui extrair os dados automaticamente agora.'
    }
  }

  if (/^(lembra que|memoriza|salva na memoria)/.test(normalized)) {
    return {
      tool: 'memory',
      action: 'save',
      params: {
        tipo: 'fato',
        conteudo: message.replace(/^(lembra que|memoriza|salva na memória|salva na memoria)\s*/i, '').trim()
      }
    }
  }

  if (normalized.includes('o que voce sabe') || normalized.includes('procura na memoria')) {
    return {
      tool: 'memory',
      action: 'search',
      params: { query: message }
    }
  }

  if (normalized.includes('saldo')) {
    return { tool: 'finance', action: 'getBalance', params: {} }
  }

  if (normalized.includes('orcamento')) {
    return { tool: 'finance', action: 'getBudget', params: {} }
  }

  if (normalized.includes('resumo financeiro') || normalized.includes('relatorio financeiro')) {
    return { tool: 'finance', action: 'getReport', params: {} }
  }

  if (normalized.includes('quanto gastei') || normalized.includes('gastos do mes')) {
    return { tool: 'finance', action: 'getMonthSummary', params: {} }
  }

  if (normalized.includes('todo mes') || normalized.includes('recorrencia')) {
    return {
      tool: 'finance',
      action: 'addRecurrence',
      params: {
        value: extractAmount(message),
        desc: message
      }
    }
  }

  if (/^(gastei|paguei|comprei)/.test(normalized)) {
    return {
      tool: 'finance',
      action: 'addExpense',
      params: {
        value: extractAmount(message),
        desc: message
      }
    }
  }

  if (normalized.includes('tarefas de hoje')) {
    return { tool: 'task', action: 'listToday', params: {} }
  }

  if (normalized.includes('farma conde') || normalized.includes('pfarma')) {
    return { tool: 'task', action: 'listByTag', params: { tag: '#fc' } }
  }

  if (normalized.includes('centrya') || normalized.includes('bicego')) {
    return { tool: 'task', action: 'listByTag', params: { tag: '#centrya' } }
  }

  if (normalized.includes('tarefas pessoais')) {
    return { tool: 'task', action: 'listByTag', params: { tag: '#pessoal' } }
  }

  if (normalized.startsWith('conclui') || normalized.startsWith('completei')) {
    return {
      tool: 'task',
      action: 'complete',
      params: {
        identifier: message.replace(/^(conclui|completei|concluir)\s+(a\s+)?tarefa\s*/i, '').trim()
      }
    }
  }

  if (/^(cria|criar|adiciona|adicionar)\s+(uma\s+)?tarefa/.test(normalized) || normalized.startsWith('tarefa:') || normalized.startsWith('lembra de')) {
    return {
      tool: 'task',
      action: 'create',
      params: {
        title: cleanTaskTitle(message),
        tag: detectContext(message)
      }
    }
  }

  return {
    tool: 'none',
    action: 'reply',
    reply: 'Entendi. Quer que eu transforme isso em tarefa, gasto ou memória?'
  }
}

async function callLLM({ message, hasImage, imageBase64, mimeType }) {
  const memoryRows = await loadMemoryRows(20)
  const systemPrompt = buildSystemPrompt(formatMemoryContext(memoryRows))
  const provider = routeLLM(message, hasImage)

  if (provider === 'gemini') {
    const response = await askGemini({
      systemPrompt,
      userMessage: message || 'Analise a imagem enviada.',
      imageBase64,
      mimeType
    })

    return parseIntent(response)
  }

  const response = await askGroq({
    systemPrompt,
    userMessage: message
  })

  return parseIntent(response)
}

async function executeIntent(intent, originalMessage) {
  const normalized = normalizeIntent(intent)
  const { tool, action, params, reply } = normalized

  if (tool === 'finance') {
    if (action === 'addExpense') return addExpense(params)
    if (action === 'addRecurrence') return addRecurrence(params)
    if (action === 'getMonthSummary') return getMonthSummary(params)
    if (action === 'getBalance') return getBalance(params)
    if (action === 'getBudget') return getBudget(params)
    if (action === 'getReport') return getReport(params)
  }

  if (tool === 'report') {
    return getReport(params)
  }

  if (tool === 'task') {
    if (action === 'create') return createTask(params, originalMessage)
    if (action === 'listToday') return listToday(params)
    if (action === 'listByTag') return listByTag(params.tag, params)
    if (action === 'complete') return completeTask(params.identifier || params.id || params.title)
  }

  if (tool === 'memory') {
    if (action === 'save') return saveMemory(params)
    if (action === 'search') return searchMemory(params)
  }

  return reply || 'Entendi.'
}

async function prepareImage({ imageUrl, imageBase64, mimeType }) {
  if (imageBase64) {
    return {
      imageBase64,
      mimeType: mimeType || 'image/jpeg'
    }
  }

  if (!imageUrl) {
    return {
      imageBase64: null,
      mimeType: null
    }
  }

  const downloaded = await downloadImageAsBase64(imageUrl)
  return {
    imageBase64: downloaded.data,
    mimeType: downloaded.mimeType
  }
}

export async function handleIncomingMessage(payload) {
  const message = payload.message || ''
  const hasImage = Boolean(payload.imageUrl || payload.imageBase64)

  try {
    logger.info('Processando mensagem recebida', {
      phone: payload.phone,
      hasImage,
      message: compactText(message, 120)
    })

    const pendingTask = await getLatestPendingTask()

    if (pendingTask) {
      const reply = await createTaskFromPending(message, pendingTask)
      await appendMemory('conversa', `Usuário: ${message}\nLapa OS: ${reply}`)
      await sendWhatsAppText(payload.phone, reply)
      return reply
    }

    const image = await prepareImage(payload)
    let intent

    try {
      intent = await callLLM({
        message,
        hasImage,
        imageBase64: image.imageBase64,
        mimeType: image.mimeType
      })
    } catch (error) {
      logger.warn('LLM falhou; usando fallback determinístico', { error })
      intent = fallbackIntent(message, hasImage)
    }

    const reply = await executeIntent(intent, message)
    await appendMemory('conversa', `Usuário: ${message || '[imagem]'}\nLapa OS: ${reply}`)
    await sendWhatsAppText(payload.phone, reply)

    return reply
  } catch (error) {
    logger.error('Erro ao processar mensagem', { error })

    const reply = formatErrorMessage()
    await sendWhatsAppText(payload.phone, reply).catch((sendError) => {
      logger.error('Falha ao avisar usuário sobre erro', { sendError })
    })

    throw error
  }
}
