import { execute, query } from '../integrations/mysql.js'
import { getOwnerUser } from '../core/user.js'
import { currentMonth, formatCurrency, normalizeText, todayISODate } from '../utils/formatter.js'

function parseMoney(value) {
  if (typeof value === 'number') return value

  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')

  return Number(normalized) || 0
}

function normalizeDate(value) {
  const raw = String(value || todayISODate()).trim()
  return raw.includes('T') ? raw.slice(0, 10) : raw.slice(0, 10)
}

function monthRange(month = currentMonth()) {
  const [year, monthNumber] = String(month).split('-').map(Number)
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`
  const next = new Date(Date.UTC(year, monthNumber, 1, 12, 0, 0))
  const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`

  return { start, end }
}

function categoryCode(value = 'Outros') {
  const code = normalizeText(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()

  return code || 'OUTROS'
}

function detectCategory(text = '') {
  const normalized = normalizeText(text)

  if (/(almoco|janta|restaurante|mercado|ifood|comida|alimentacao)/.test(normalized)) return 'Alimentacao'
  if (/(uber|99|gasolina|onibus|transporte|carro|estacionamento)/.test(normalized)) return 'Transporte'
  if (/(medico|farmacia|remedio|consulta|saude)/.test(normalized)) return 'Saude'
  if (/(celular|internet|software|assinatura|servico|servidor)/.test(normalized)) return 'Servicos'
  if (/(cartao|nubank|bradesco|itau|picpay|fatura)/.test(normalized)) return 'Cartao'

  return 'Outros'
}

async function ensureCategory(name, type = 'expense') {
  const categoryName = name || 'Outros'
  const code = categoryCode(categoryName)

  await execute(
    `INSERT INTO finance_categories (code, name, category_type, active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       active = 1`,
    [code, categoryName, type]
  )

  const rows = await query(
    `SELECT id, name
     FROM finance_categories
     WHERE code = ?
     LIMIT 1`,
    [code]
  )

  return rows[0]
}

async function ensureAccount(userId, name) {
  const accountName = String(name || '').trim()
  if (!accountName) return null

  await execute(
    `INSERT INTO finance_accounts (user_id, name, account_type, opening_balance, active)
     VALUES (?, ?, 'other', 0, 1)
     ON DUPLICATE KEY UPDATE active = 1`,
    [userId, accountName]
  )

  const rows = await query(
    `SELECT id, name
     FROM finance_accounts
     WHERE user_id = ? AND name = ?
     LIMIT 1`,
    [userId, accountName]
  )

  return rows[0]
}

export async function addExpense(params = {}) {
  const owner = await getOwnerUser()
  const value = parseMoney(params.value ?? params.valor ?? params.amount)
  const description = params.desc || params.descricao || params.description || 'Gasto'
  const categoryName = params.category || params.categoria || detectCategory(description)
  const accountName = params.account || params.conta || ''
  const date = normalizeDate(params.date || params.data)
  const attachment = params.attachment || params.anexo || ''
  const amount = Math.abs(value)

  if (!amount) {
    return 'Nao consegui identificar o valor do gasto.'
  }

  const category = await ensureCategory(categoryName, 'expense')
  const account = await ensureAccount(owner.id, accountName)

  await execute(
    `INSERT INTO finance_transactions
       (user_id, account_id, category_id, transaction_type, status, movement_date, description, amount, attachment_url, source)
     VALUES (?, ?, ?, 'expense', 'paid', ?, ?, ?, ?, 'whatsapp')`,
    [owner.id, account?.id || null, category.id, date, description, amount, attachment || null]
  )

  return [
    '💸 *Gasto registrado*',
    `- Valor: ${formatCurrency(amount)}`,
    `- Categoria: ${category.name}`,
    `- Descricao: ${description}`,
    account?.name ? `- Conta: ${account.name}` : null
  ].filter(Boolean).join('\n')
}

export async function addRecurrence(params = {}) {
  const owner = await getOwnerUser()
  const value = parseMoney(params.value ?? params.valor ?? params.amount)
  const description = params.desc || params.descricao || params.description || 'Recorrencia'
  const categoryName = params.category || params.categoria || detectCategory(description)
  const accountName = params.account || params.conta || ''
  const dueDay = Math.min(Math.max(Number(params.day || params.dia_vencimento || params.dueDay || 1), 1), 31)
  const amount = Math.abs(value)

  if (!amount) {
    return 'Nao consegui identificar o valor da recorrencia.'
  }

  const category = await ensureCategory(categoryName, 'expense')
  const account = await ensureAccount(owner.id, accountName)

  await execute(
    `INSERT INTO finance_recurrences
       (user_id, account_id, category_id, recurrence_type, description, amount, frequency, due_day, start_month, active)
     VALUES (?, ?, ?, 'expense', ?, ?, 'monthly', ?, ?, 1)`,
    [owner.id, account?.id || null, category.id, description, amount, dueDay, `${currentMonth()}-01`]
  )

  return [
    '🔁 *Recorrencia registrada*',
    `- ${description}`,
    `- Valor: ${formatCurrency(amount)}`,
    `- Vencimento: dia ${dueDay}`
  ].join('\n')
}

export async function getMonthSummary(params = {}) {
  const owner = await getOwnerUser()
  const month = params.month || params.mes || currentMonth()
  const range = monthRange(month)
  const rows = await query(
    `SELECT COALESCE(c.name, 'Outros') AS category, SUM(t.amount) AS amount
     FROM finance_transactions t
     LEFT JOIN finance_categories c ON c.id = t.category_id
     WHERE t.user_id = ?
       AND t.transaction_type = 'expense'
       AND t.status <> 'cancelled'
       AND t.movement_date >= ?
       AND t.movement_date < ?
     GROUP BY COALESCE(c.name, 'Outros')
     ORDER BY amount DESC`,
    [owner.id, range.start, range.end]
  )

  if (!rows.length) {
    return `📊 Nenhum gasto registrado em *${month}*.`
  }

  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
  const lines = rows.map((row) => `- ${row.category}: ${formatCurrency(row.amount)}`)

  return [
    `📊 *Gastos de ${month}*`,
    '',
    ...lines,
    '',
    `*Total:* ${formatCurrency(total)}`
  ].join('\n')
}

export async function getBalance() {
  const owner = await getOwnerUser()
  const rows = await query(
    `SELECT
       a.name,
       a.opening_balance +
       COALESCE(SUM(
         CASE
           WHEN t.status = 'cancelled' THEN 0
           WHEN t.transaction_type IN ('income', 'convenio') THEN t.amount
           WHEN t.transaction_type IN ('expense', 'investment') THEN -t.amount
           ELSE t.amount
         END
       ), 0) AS balance
     FROM finance_accounts a
     LEFT JOIN finance_transactions t ON t.account_id = a.id
     WHERE a.user_id = ? AND a.active = 1
     GROUP BY a.id, a.name, a.opening_balance
     ORDER BY a.name`,
    [owner.id]
  )

  if (!rows.length) {
    return 'Nao encontrei contas ativas no banco.'
  }

  const lines = rows.map((row) => `- ${row.name}: ${formatCurrency(row.balance)}`)
  return `💰 *Saldo por conta*\n\n${lines.join('\n')}`
}

export async function getBudget(params = {}) {
  const owner = await getOwnerUser()
  const month = params.month || params.mes || currentMonth()
  const range = monthRange(month)
  const budgets = await query(
    `SELECT
       c.name AS category,
       b.limit_amount AS limitAmount,
       COALESCE(SUM(t.amount), 0) AS spent
     FROM finance_periods p
     JOIN finance_budgets b ON b.period_id = p.id
     JOIN finance_categories c ON c.id = b.category_id
     LEFT JOIN finance_transactions t
       ON t.user_id = p.user_id
      AND t.category_id = b.category_id
      AND t.transaction_type = 'expense'
      AND t.status <> 'cancelled'
      AND t.movement_date >= ?
      AND t.movement_date < ?
     WHERE p.user_id = ?
       AND p.period_month = ?
     GROUP BY c.name, b.limit_amount
     ORDER BY c.name`,
    [range.start, range.end, owner.id, range.start]
  )

  if (!budgets.length) {
    return `Nao encontrei orcamento configurado para *${month}*.`
  }

  const lines = budgets.map((budget) => {
    const remaining = Number(budget.limitAmount || 0) - Number(budget.spent || 0)
    return `- ${budget.category}: ${formatCurrency(budget.spent)} / ${formatCurrency(budget.limitAmount)} (${formatCurrency(remaining)} livre)`
  })

  return `🎯 *Orcamento de ${month}*\n\n${lines.join('\n')}`
}

export async function getReport(params = {}) {
  const month = params.month || params.mes || currentMonth()
  const [summary, budget] = await Promise.all([
    getMonthSummary({ month }),
    getBudget({ month }).catch(() => null)
  ])

  return [
    `📈 *Resumo financeiro - ${month}*`,
    '',
    summary,
    budget ? `\n${budget}` : null
  ].filter(Boolean).join('\n')
}
