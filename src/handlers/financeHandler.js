import { appendRow, readSheet } from '../integrations/sheets.js'
import { currentMonth, formatCurrency, normalizeText, todayISODate } from '../utils/formatter.js'

function parseMoney(value) {
  if (typeof value === 'number') return value

  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.')

  return Number(normalized) || 0
}

function dataRows(rows) {
  return rows.filter((row) => row[0] && normalizeText(row[0]) !== 'data' && normalizeText(row[0]) !== 'categoria')
}

function readExpense(row) {
  return {
    data: row[0],
    valor: parseMoney(row[1]),
    categoria: row[2] || 'Outros',
    descricao: row[3] || '',
    conta: row[4] || '',
    recorrente: row[5] === true || String(row[5]).toLowerCase() === 'true',
    anexo: row[6] || ''
  }
}

function readAccount(row) {
  return {
    nome: row[0],
    tipo: row[1] || '',
    saldoInicial: parseMoney(row[2]),
    ativa: String(row[3] ?? 'true').toLowerCase() !== 'false'
  }
}

function detectCategory(text = '') {
  const normalized = normalizeText(text)

  if (/(almoco|janta|restaurante|mercado|ifood|comida|alimentacao)/.test(normalized)) return 'Alimentação'
  if (/(uber|99|gasolina|onibus|transporte|carro|estacionamento)/.test(normalized)) return 'Transporte'
  if (/(medico|farmacia|remedio|consulta|saude)/.test(normalized)) return 'Saúde'
  if (/(celular|internet|software|assinatura|servico)/.test(normalized)) return 'Serviços'
  if (/(cartao|nubank|bradesco|fatura)/.test(normalized)) return 'Cartão'

  return 'Outros'
}

function groupExpensesByCategory(expenses) {
  const grouped = new Map()

  for (const expense of expenses) {
    const current = grouped.get(expense.categoria) || 0
    grouped.set(expense.categoria, current + Math.abs(expense.valor))
  }

  return [...grouped.entries()].sort((a, b) => b[1] - a[1])
}

export async function addExpense(params = {}) {
  const value = parseMoney(params.value ?? params.valor ?? params.amount)
  const description = params.desc || params.descricao || params.description || 'Gasto'
  const category = params.category || params.categoria || detectCategory(description)
  const account = params.account || params.conta || ''
  const date = params.date || params.data || todayISODate()
  const amount = -Math.abs(value)
  const recurring = Boolean(params.recurring || params.recorrente)
  const attachment = params.attachment || params.anexo || ''

  if (!amount) {
    return 'Não consegui identificar o valor do gasto.'
  }

  await appendRow('gastos', [date, amount, category, description, account, recurring, attachment])

  return [
    '💸 *Gasto registrado*',
    `- Valor: ${formatCurrency(Math.abs(amount))}`,
    `- Categoria: ${category}`,
    `- Descrição: ${description}`,
    account ? `- Conta: ${account}` : null
  ].filter(Boolean).join('\n')
}

export async function addRecurrence(params = {}) {
  const value = parseMoney(params.value ?? params.valor ?? params.amount)
  const description = params.desc || params.descricao || params.description || 'Recorrência'
  const category = params.category || params.categoria || detectCategory(description)
  const dueDay = Number(params.day || params.dia_vencimento || params.dueDay || 1)
  const amount = -Math.abs(value)

  if (!amount) {
    return 'Não consegui identificar o valor da recorrência.'
  }

  await appendRow('recorrencias', [description, amount, category, dueDay, true])

  return [
    '🔁 *Recorrência registrada*',
    `- ${description}`,
    `- Valor: ${formatCurrency(Math.abs(amount))}`,
    `- Vencimento: dia ${dueDay}`
  ].join('\n')
}

export async function getMonthSummary(params = {}) {
  const month = params.month || params.mes || currentMonth()
  const rows = await readSheet('gastos')
  const expenses = dataRows(rows)
    .map(readExpense)
    .filter((expense) => expense.data?.startsWith(month))

  if (!expenses.length) {
    return `📊 Nenhum gasto registrado em *${month}*.`
  }

  const total = expenses.reduce((sum, expense) => sum + Math.abs(expense.valor), 0)
  const lines = groupExpensesByCategory(expenses)
    .map(([category, amount]) => `- ${category}: ${formatCurrency(amount)}`)

  return [
    `📊 *Gastos de ${month}*`,
    '',
    ...lines,
    '',
    `*Total:* ${formatCurrency(total)}`
  ].join('\n')
}

export async function getBalance() {
  const [accountRows, expenseRows] = await Promise.all([
    readSheet('contas'),
    readSheet('gastos')
  ])

  const accounts = dataRows(accountRows).map(readAccount).filter((account) => account.ativa)
  const expenses = dataRows(expenseRows).map(readExpense)

  if (!accounts.length) {
    return 'Não encontrei contas ativas na planilha.'
  }

  const lines = accounts.map((account) => {
    const movement = expenses
      .filter((expense) => normalizeText(expense.conta) === normalizeText(account.nome))
      .reduce((sum, expense) => sum + expense.valor, 0)

    return `- ${account.nome}: ${formatCurrency(account.saldoInicial + movement)}`
  })

  return `💰 *Saldo por conta*\n\n${lines.join('\n')}`
}

export async function getBudget(params = {}) {
  const month = params.month || params.mes || currentMonth()
  const [budgetRows, expenseRows] = await Promise.all([
    readSheet('orcamento'),
    readSheet('gastos')
  ])

  const budgets = dataRows(budgetRows).map((row) => ({
    categoria: row[0],
    limite: parseMoney(row[1]),
    mes: row[2]
  })).filter((budget) => budget.mes === month)

  const expenses = dataRows(expenseRows)
    .map(readExpense)
    .filter((expense) => expense.data?.startsWith(month))

  if (!budgets.length) {
    return `Não encontrei orçamento configurado para *${month}*.`
  }

  const lines = budgets.map((budget) => {
    const spent = expenses
      .filter((expense) => normalizeText(expense.categoria) === normalizeText(budget.categoria))
      .reduce((sum, expense) => sum + Math.abs(expense.valor), 0)

    const remaining = budget.limite - spent
    return `- ${budget.categoria}: ${formatCurrency(spent)} / ${formatCurrency(budget.limite)} (${formatCurrency(remaining)} livre)`
  })

  return `🎯 *Orçamento de ${month}*\n\n${lines.join('\n')}`
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
