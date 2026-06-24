import { routeLLM } from './router.js'
import { appendMemory, formatMemoryContext, getLatestPendingTask, loadMemoryRows } from './memory.js'
import { askGroq, transcribeGroqAudio } from '../llm/groq.js'
import { askGemini, downloadImageAsBase64 } from '../llm/gemini.js'
import { askOpenRouter, isOpenRouterEnabled } from '../llm/openrouter.js'
import { sendWhatsAppText } from '../integrations/whatsapp.js'
import { getEvolutionMediaBase64 } from '../integrations/evolutionMedia.js'
import { addExpense, addRecurrence, getBalance, getBudget, getMonthSummary, getReport } from '../handlers/financeHandler.js'
import { cancelTask, completeTask, createTask, createTasks, createTaskFromPending, deleteTask, listByTag, listToday, detectContext } from '../handlers/taskHandler.js'
import { saveMemory, searchMemory } from '../handlers/memoryHandler.js'
import { compactText, formatErrorMessage, formatLocalDateTime, normalizeText } from '../utils/formatter.js'
import { logger } from '../utils/logger.js'

function buildSystemPrompt(memoryContext) {
  const current = formatLocalDateTime()

  return `
Você é o Lapa OS, o assistente pessoal e segundo cérebro do Gabriel Lapa.

Você não é um assistente genérico. Você conhece o Gabriel profundamente e age como um parceiro inteligente que já sabe o contexto antes de ele explicar.

## Quem é o Gabriel

- Desenvolvedor fullstack, foco em backend, ~3 anos de experiência
- Mora em São José dos Campos, SP, Brasil
- Trabalha na Farma Conde como desenvolvedor do PFarma, sistema interno de BI e operações
- Tem a Centrya, sua consultoria solo de software para PMEs brasileiras
- Co-fundou a Bicego Hub, software para o setor odontológico
- Cursa Análise e Desenvolvimento de Sistemas na UNIVAP
- Pratica corrida e vôlei
- Gosta de construir produtos polidos que não parecem feitos por IA
- Tem interesse em SaaS, renda passiva e automações

## Stack do Gabriel

- Backend: Node.js, PHP 8.2 procedural, MySQL, SQL Server
- Frontend: Bootstrap 5, jQuery, ECharts, DataTables, React PWA
- Infra: Docker, EasyPanel, n8n, Evolution API
- IA: Claude, Gemini, Groq, Ollama
- Outros: BullMQ, Redis, PostgreSQL

## Projetos ativos

- ClaudIA: IA de vendas no WhatsApp para a Farma Conde, com Node.js, Ollama, GPT-4o e Evolution API
- CondeMais: CRM para PFarma, módulo de clientes, segmentação e dashboard
- AfiliadoBot: automação de afiliados no WhatsApp, Mercado Livre e Evolution API
- JurIA: análise de contratos com IA para PFarma, PHP, Gemma e GPT-4o
- Pulso: Personal OS pessoal, React PWA, Node.js e MySQL
- Centrya: site institucional e identidade de marca da consultoria

## Ferramentas disponíveis

Use ferramentas quando o Gabriel pedir ou quando a intenção for clara.

task -> TickTick
Gerencia tarefas e compromissos com data/hora.
Sempre aplica uma tag de contexto:
- #pessoal: vida pessoal, saúde, compras, família, corrida, vôlei
- #centrya: Centrya, Bicego Hub, clientes, propostas
- #fc: Farma Conde, PFarma, ClaudIA, CondeMais, AfiliadoBot, JurIA

Palavras-chave por contexto:
- #fc: pfarma, farma conde, claudia, condemais, afiliadobot, juria, pulso, deploy, pr, sql, relatório, dashboard, php, sistema
- #centrya: centrya, bicego, hub, cliente, proposta, freelance, consultoria, contrato, apresentação
- #pessoal: comprar, médico, academia, treino, correr, vôlei, família, mercado, dentista, carro, banco

Se o contexto for ambíguo ao criar tarefa, retorne task.create sem tag para o sistema perguntar:
"Isso é *pessoal*, *Centrya* ou *Farma Conde*?"

finance -> Google Sheets
Registra e consulta dados financeiros:
- registrar gasto com valor, categoria, descrição e conta
- consultar saldo, orçamento e gastos do mês
- gerar relatório mensal
- cadastrar recorrências, parcelas e assinaturas

Categorias padrão:
Alimentação, Transporte, Moradia, Saúde, Lazer, Serviços, Cartão, Outros

memory -> Google Sheets
Salva e busca informações importantes na memória do Lapa OS.
Também recebe o contexto recente da conversa.

report -> relatório financeiro
Gera relatório financeiro mensal.

## Regras de comportamento

- Seja direto, objetivo e sem enrolação
- Sem formalidades desnecessárias; trate o Gabriel como parceiro, não como chefe
- Use português brasileiro natural, sem exagero de gírias
- Respostas curtas por padrão, exceto relatórios
- Nunca comece com "Claro!", "Ótimo!", "Com certeza!" ou frase de efeito vazia

## Formatação para WhatsApp

- Use *negrito* para destacar o que importa
- Use emojis com moderação e propósito, não como decoração
- Use listas com - para múltiplos itens
- Nunca use markdown complexo como tabelas, títulos markdown ou blocos longos

## Exemplos de resposta final

Tarefa criada:
✅ Tarefa criada
📌 *Revisar PR do ClaudIA*
🏷️ Farma Conde

Gasto registrado:
✅ Gasto registrado
💸 R$ 85,00 — Alimentação
📝 Almoço no restaurante
💳 Nubank

Listagem de tarefas do dia:
📋 *Suas tarefas de hoje*

💊 *Farma Conde*
- Revisar PR do ClaudIA
- Deploy CondeMais

🏢 *Centrya*
- Enviar proposta cliente X

🏠 *Pessoal*
- Comprar tênis
- Ir ao médico 17h

Total: 5 tarefas

Relatório financeiro mensal:
📊 *Junho 2026*

💰 Saldo: R$ 3.240,00

📉 *Gastos*
🍔 Alimentação  R$ 890
🚗 Transporte   R$ 340
🏠 Moradia      R$ 1.200
🎯 Lazer        R$ 180

Total: R$ 2.610

## Fluxo de decisão

Ao receber uma mensagem, siga esta ordem:
1. Se há tarefa pendente de confirmação de contexto, resolva primeiro
2. Se tem imagem, use extração visual para dados financeiros
3. Se é sobre finanças, use finance
4. Se é sobre tarefa ou compromisso, use task
5. Se é pergunta geral, responda com seu conhecimento sobre o Gabriel
6. Se é ambíguo, pergunte de forma curta e direta

## Capacidades e limites

Você sabe:
- criar, listar, cancelar, deletar e completar tarefas no TickTick com contexto certo
- registrar gastos, recorrências e consultar finanças no Sheets
- ler foto de nota fiscal e extrair valor/estabelecimento
- dar resumo financeiro do mês com comparativo
- listar tarefas do dia agrupadas por contexto
- perguntar o contexto quando ambíguo antes de agir

Você não tem acesso a e-mails.
Você não acessa a internet para buscar informações.
Você não executa código.

## Contrato técnico obrigatório

Agora em ${current.timeZone}: ${current.date} ${current.time} (${current.isoDate}).
Datas e horários devem usar America/Sao_Paulo.

Você está classificando a intenção para o backend. Retorne somente JSON válido, sem markdown e sem texto fora do JSON.

Formato:
{
  "tool": "task|finance|memory|report|none",
  "action": "create|createMany|listToday|listByTag|complete|cancel|delete|addExpense|addRecurrence|getMonthSummary|getBalance|getBudget|getReport|save|search|reply",
  "params": {},
  "reply": "texto opcional quando tool=none"
}

Ações:
- task.create: {"title":"", "tag":"#pessoal|#centrya|#fc", "dueDate":"YYYY-MM-DD", "dueTime":"HH:mm"}
- task.createMany: {"items":[{"title":"", "tag":"#pessoal|#centrya|#fc", "dueDate":"YYYY-MM-DD", "dueTime":"HH:mm"}]}
- task.listToday
- task.listByTag: {"tag":"#pessoal|#centrya|#fc"}
- task.complete: {"identifier":""}
- task.cancel: {"identifier":""}
- task.delete: {"identifier":""}
- finance.addExpense: {"value":"", "category":"", "desc":"", "account":""}
- finance.addRecurrence: {"value":"", "category":"", "desc":"", "account":""}
- finance.getMonthSummary, finance.getBalance, finance.getBudget, finance.getReport
- memory.save: {"tipo":"fato", "conteudo":""}
- memory.search: {"query":""}
- none.reply: use quando for resposta geral sem ferramenta

Regras técnicas:
- Se houver mais de uma tarefa/evento na mesma mensagem, use task.createMany
- Concluir/finalizar/marcar como feito = task.complete
- Cancelar/cancele = task.cancel
- Deletar/apagar/remover/excluir = task.delete
- Para completar, cancelar ou deletar, params.identifier deve ser o alvo limpo, sem o verbo de comando
- Se contexto de tarefa for ambíguo ao criar, omita tag
- Para imagem de nota/recibo, extraia gasto e use finance.addExpense

## Contexto da conversa atual

${memoryContext}
`.trim()
}

function buildCompactSystemPrompt(memoryContext) {
  return buildSystemPrompt(memoryContext)
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

const MUTATING_TASK_ACTIONS = new Set([
  'create',
  'createmany',
  'complete',
  'completetask',
  'done',
  'cancel',
  'canceltask',
  'delete',
  'deletetask',
  'remove',
  'removetask',
  'excluir'
])

function getIntentActions(intent) {
  if (Array.isArray(intent)) return intent
  if (Array.isArray(intent?.actions)) return intent.actions
  return intent ? [intent] : []
}

function isMutatingTaskIntent(intent) {
  return getIntentActions(intent).some((item) => {
    const normalized = normalizeIntent(item)
    return normalized.tool === 'task' && MUTATING_TASK_ACTIONS.has(String(normalized.action).toLowerCase())
  })
}

function looksLikeTaskMutationMessage(message = '') {
  const normalized = normalizeText(message)

  return /^(cria|criar|adiciona|adicionar)\s+(uma\s+)?(tarefa|agenda|evento)\b/.test(normalized) ||
    normalized.startsWith('tarefa:') ||
    normalized.startsWith('lembra de') ||
    /^(conclui|completei|concluir|finaliza|finalizar)\b/.test(normalized) ||
    /^(cancela|cancelar|cancele|cancelei)\b/.test(normalized) ||
    /^(deleta|deletar|delete|apaga|apagar|exclui|excluir|remove|remover)\b/.test(normalized)
}

function summarizeIntentActions(intent) {
  return getIntentActions(intent).map((item) => {
    const normalized = normalizeIntent(item)
    return `${normalized.tool}.${String(normalized.action).toLowerCase()}`
  })
}

function buildTaskValidationPrompt() {
  const current = formatLocalDateTime()

  return `
Voce e o validador de acoes do Lapa OS antes de executar comandos no TickTick.
Agora em ${current.timeZone}: ${current.date} ${current.time} (${current.isoDate}).

Entrada: mensagem original do usuario e o JSON gerado pelo Groq.
Saida: somente JSON valido, sem markdown.

Formato:
{
  "valid": true,
  "intent": {"tool":"task|finance|memory|report|none","action":"...","params":{},"reply":""},
  "reason": "curto"
}

Regras:
- Revise apenas a interpretacao. Nao execute nada.
- Preserve a intencao do usuario e corrija o JSON do Groq quando necessario.
- Para criar/adicionar/agendar/lembra de tarefa ou evento, use task.create ou task.createMany.
- Para concluir/finalizar/marcar como feito, use task.complete.
- Para cancelar/cancele, use task.cancel.
- Para deletar/apagar/remover/excluir, use task.delete.
- Para task.complete, task.cancel e task.delete, params.identifier deve ser o alvo limpo, sem o verbo de comando.
- Para task.create/createMany, preserve titulo, tag, dueDate YYYY-MM-DD e dueTime HH:mm quando estiverem claros.
- Tags validas: #pessoal, #centrya, #fc. Se o contexto for ambiguo, omita tag.
- Datas e horarios sempre usam America/Sao_Paulo.
- Se a acao puder mexer na tarefa errada ou a mensagem estiver ambigua, retorne valid=false e intent tool=none/action=reply pedindo confirmacao curta.
- Se o JSON do Groq ja estiver correto e seguro, devolva o mesmo intent.
`.trim()
}

function buildValidationUserMessage(message, intent) {
  return [
    'Mensagem original:',
    message || '[vazia]',
    '',
    'JSON do Groq:',
    JSON.stringify(intent)
  ].join('\n')
}

function getValidatedIntentResponse(validation, fallbackIntent) {
  if (validation?.valid === false) {
    const blockedIntent = validation.intent && typeof validation.intent === 'object' ? validation.intent : {
      tool: 'none',
      action: 'reply',
      params: {}
    }

    return {
      ...blockedIntent,
      tool: blockedIntent.tool || 'none',
      action: blockedIntent.action || 'reply',
      params: blockedIntent.params || {},
      reply: blockedIntent.reply || validation.reply || 'Antes de mexer no TickTick, me confirma exatamente qual tarefa?'
    }
  }

  const candidate = validation?.intent || validation?.correctedIntent || validation?.finalIntent || validation

  if (!candidate || (candidate.valid !== undefined && !candidate.tool && !candidate.actions && !Array.isArray(candidate))) {
    return fallbackIntent
  }

  return candidate
}

async function validateGroqTaskIntent(intent, message) {
  if ((!isMutatingTaskIntent(intent) && !looksLikeTaskMutationMessage(message)) || !isOpenRouterEnabled()) return intent

  try {
    logger.info('Validando acao de tarefa do Groq no OpenRouter', {
      actions: summarizeIntentActions(intent)
    })

    const response = await askOpenRouter({
      systemPrompt: buildTaskValidationPrompt(),
      userMessage: buildValidationUserMessage(message, intent)
    })
    const validation = parseIntent(response)
    const reviewedIntent = getValidatedIntentResponse(validation, intent)

    logger.info('OpenRouter validou acao de tarefa', {
      valid: validation?.valid,
      reason: validation?.reason,
      actions: summarizeIntentActions(reviewedIntent)
    })

    return reviewedIntent || intent
  } catch (error) {
    logger.warn('Falha ao validar acao no OpenRouter; usando resposta do Groq', { error })
    return intent
  }
}

function extractAmount(message) {
  const match = String(message).match(/(?:r\$\s*)?(-?\d+(?:[.,]\d{1,2})?)/i)
  return match ? match[1] : null
}

function cleanTaskTitle(message) {
  return String(message)
    .replace(/^(cria|criar|adiciona|adicionar)\s+(uma\s+)?(tarefa|agenda|evento)\s*/i, '')
    .replace(/^tarefa:\s*/i, '')
    .replace(/^lembra\s+de\s+/i, '')
    .trim()
}

function cleanTaskSegment(segment) {
  return String(segment)
    .replace(/\btag\s+(farmaconde|farma conde|fc|centrya|pessoal)\b/ig, '')
    .replace(/^\s*e\s+/i, '')
    .trim()
}

function buildMultiTaskFallback(message) {
  const body = cleanTaskTitle(message)
  const parts = body
    .split(/\s*[,;]\s*/)
    .map(cleanTaskSegment)
    .filter(Boolean)

  if (parts.length < 2) return null

  const tag = detectContext(message)

  return {
    tool: 'task',
    action: 'createMany',
    params: {
      items: parts.map((title) => ({
        title,
        tag
      }))
    }
  }
}

function isDateTimeQuestion(message = '') {
  const normalized = normalizeText(message)
  const asksDate = /\b(que|qual)\s+(dia|data)\b/.test(normalized) || normalized.includes('dia e hoje') || normalized.includes('data de hoje')
  const asksTime = /\b(que|qual)\s+(hora|horas|horario)\b/.test(normalized) ||
    /\b(hora|horas|horario)\s+(agora|atual)\b/.test(normalized) ||
    normalized === 'hora' ||
    normalized === 'horas' ||
    normalized.includes('data e hora')

  return asksDate || asksTime
}

function buildDateTimeReply() {
  const current = formatLocalDateTime()

  return `Hoje é ${current.date} e agora são ${current.time}.`
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

  if (isDateTimeQuestion(message)) {
    return {
      tool: 'none',
      action: 'reply',
      reply: buildDateTimeReply()
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

  if (/^(conclui|completei|concluir|finaliza|finalizar)\b/.test(normalized)) {
    return {
      tool: 'task',
      action: 'complete',
      params: {
        identifier: message
          .replace(/^(conclui|completei|concluir|finaliza|finalizar)\s+/i, '')
          .trim()
      }
    }
  }

  if (/^(cancela|cancelar|cancele|cancelei)\b/.test(normalized)) {
    return {
      tool: 'task',
      action: 'cancel',
      params: {
        identifier: message
          .replace(/^(cancela|cancelar|cancele|cancelei)\s+/i, '')
          .trim()
      }
    }
  }

  if (/^(deleta|deletar|delete|apaga|apagar|exclui|excluir|remove|remover)\b/.test(normalized)) {
    return {
      tool: 'task',
      action: 'delete',
      params: {
        identifier: message
          .replace(/^(deleta|deletar|delete|apaga|apagar|exclui|excluir|remove|remover)\s+/i, '')
          .trim()
      }
    }
  }

  if (/^(cria|criar|adiciona|adicionar)\s+(uma\s+)?(tarefa|agenda|evento)/.test(normalized) || normalized.startsWith('tarefa:') || normalized.startsWith('lembra de')) {
    const multiTask = buildMultiTaskFallback(message)
    if (multiTask) return multiTask

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
  const memoryRows = await loadMemoryRows(5)
  const systemPrompt = buildCompactSystemPrompt(formatMemoryContext(memoryRows))
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

  if (provider === 'openrouter') {
    const response = await askOpenRouter({
      systemPrompt,
      userMessage: message
    })

    return parseIntent(response)
  }

  let response

  try {
    response = await askGroq({
      systemPrompt,
      userMessage: message
    })
  } catch (error) {
    if (!isOpenRouterEnabled()) throw error

    logger.warn('Groq falhou; tentando OpenRouter', { error })
    response = await askOpenRouter({
      systemPrompt,
      userMessage: message
    })

    return parseIntent(response)
  }

  return validateGroqTaskIntent(parseIntent(response), message)
}

async function executeIntent(intent, originalMessage) {
  const actions = Array.isArray(intent) ? intent : intent?.actions

  if (Array.isArray(actions)) {
    const replies = []

    for (const actionIntent of actions) {
      replies.push(await executeIntent(actionIntent, originalMessage))
    }

    return replies.filter(Boolean).join('\n\n')
  }

  const normalized = normalizeIntent(intent)
  const { tool, action, params, reply } = normalized
  const actionKey = String(action).toLowerCase()

  if (tool === 'finance') {
    if (actionKey === 'addexpense') return addExpense(params)
    if (actionKey === 'addrecurrence') return addRecurrence(params)
    if (actionKey === 'getmonthsummary') return getMonthSummary(params)
    if (actionKey === 'getbalance') return getBalance(params)
    if (actionKey === 'getbudget') return getBudget(params)
    if (actionKey === 'getreport') return getReport(params)
  }

  if (tool === 'report') {
    return getReport(params)
  }

  if (tool === 'task') {
    if (actionKey === 'create') return createTask(params, originalMessage)
    if (actionKey === 'createmany') return createTasks(params.items || params.tasks, originalMessage)
    if (actionKey === 'listtoday') return listToday(params)
    if (actionKey === 'listbytag') return listByTag(params.tag, params)
    if (actionKey === 'complete' || actionKey === 'completetask' || actionKey === 'done') return completeTask(params.identifier || params.id || params.title)
    if (actionKey === 'cancel' || actionKey === 'canceltask') return cancelTask(params.identifier || params.id || params.title)
    if (actionKey === 'delete' || actionKey === 'deletetask' || actionKey === 'remove' || actionKey === 'removetask' || actionKey === 'excluir') return deleteTask(params.identifier || params.id || params.title)
  }

  if (tool === 'memory') {
    if (actionKey === 'save') return saveMemory(params)
    if (actionKey === 'search') return searchMemory(params)
  }

  return reply || 'Entendi.'
}

async function safeAppendMemory(tipo, conteudo) {
  try {
    await appendMemory(tipo, conteudo)
  } catch (error) {
    logger.error('Falha ao salvar histórico na memória; mantendo resposta ao usuário', { error })
  }
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

async function prepareAudio({ audioUrl, audioBase64, audioMimeType, messageId, messageKey }) {
  if (!audioUrl && !audioBase64 && !messageId && !messageKey?.id) return null

  let resolvedAudioBase64 = audioBase64
  let resolvedMimeType = audioMimeType || 'audio/ogg'

  if (!resolvedAudioBase64 && (messageId || messageKey?.id)) {
    const media = await getEvolutionMediaBase64({
      messageId,
      messageKey,
      convertToMp4: false
    })

    resolvedAudioBase64 = media.base64
    resolvedMimeType = media.mimeType || resolvedMimeType
  }

  const text = await transcribeGroqAudio({
    audioUrl: resolvedAudioBase64 ? null : audioUrl,
    audioBase64: resolvedAudioBase64,
    mimeType: resolvedMimeType
  })

  return text.trim()
}

export async function handleIncomingMessage(payload) {
  let message = payload.message || ''
  const hasImage = Boolean(payload.imageUrl || payload.imageBase64)
  const hasAudio = Boolean(payload.hasAudio || payload.audioUrl || payload.audioBase64)

  try {
    logger.info('Processando mensagem recebida', {
      phone: payload.phone,
      hasImage,
      hasAudio,
      message: compactText(message, 120)
    })

    if (hasAudio) {
      let transcription = null

      try {
        transcription = await prepareAudio(payload)
      } catch (error) {
        logger.error('Falha ao transcrever áudio; respondendo sem retry', { error })

        const reply = 'Não consegui entender esse áudio. Pode reenviar ou mandar em texto?'
        await safeAppendMemory('conversa', `Usuário: [áudio não transcrito]\nLapa OS: ${reply}`)
        await sendWhatsAppText(payload.phone, reply)
        return reply
      }

      if (transcription) {
        message = [message, transcription].filter(Boolean).join('\n')
        logger.info('Áudio transcrito', {
          phone: payload.phone,
          transcription: compactText(transcription, 180)
        })
      }
    }

    if (isDateTimeQuestion(message)) {
      const reply = buildDateTimeReply()
      await safeAppendMemory('conversa', `Usuário: ${message}\nLapa OS: ${reply}`)
      await sendWhatsAppText(payload.phone, reply)
      return reply
    }

    const pendingTask = await getLatestPendingTask()

    if (pendingTask) {
      const reply = await createTaskFromPending(message, pendingTask)
      await safeAppendMemory('conversa', `Usuário: ${message}\nLapa OS: ${reply}`)
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
    await safeAppendMemory('conversa', `Usuário: ${message || '[imagem]'}\nLapa OS: ${reply}`)
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
