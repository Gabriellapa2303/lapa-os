import { appendMemory, searchMemoryRows } from '../core/memory.js'
import { compactText } from '../utils/formatter.js'

export async function saveMemory({ tipo = 'fato', conteudo }) {
  if (!conteudo) {
    return 'Me diz exatamente o que você quer que eu memorize.'
  }

  await appendMemory(tipo, conteudo)
  return `🧠 Memória salva: ${compactText(conteudo, 180)}`
}

export async function searchMemory({ query }) {
  if (!query) {
    return 'Sobre qual assunto você quer que eu procure na memória?'
  }

  const rows = await searchMemoryRows(query)

  if (!rows.length) {
    return `Não encontrei nada salvo sobre *${query}*.`
  }

  const lines = rows.map(([timestamp, tipo, conteudo]) => `- ${timestamp} [${tipo}] ${conteudo}`)
  return `🧠 *Memória sobre ${query}*\n\n${lines.join('\n')}`
}
