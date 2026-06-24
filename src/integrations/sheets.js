import { google } from 'googleapis'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

let sheetsClient

function decodeServiceAccount() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_B64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_B64 não configurado')
  }

  const json = Buffer.from(env.GOOGLE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
  return JSON.parse(json)
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient

  const credentials = decodeServiceAccount()
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SHEETS_SCOPE]
  })

  sheetsClient = google.sheets({ version: 'v4', auth })
  return sheetsClient
}

export async function getValues(range) {
  try {
    const client = await getSheetsClient()
    const response = await client.spreadsheets.values.get({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range
    })

    return response.data.values || []
  } catch (error) {
    logger.error('Erro ao ler Google Sheets', { range, error })
    throw error
  }
}

export async function appendRow(sheetName, row) {
  try {
    const client = await getSheetsClient()
    await client.spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row]
      }
    })
  } catch (error) {
    logger.error('Erro ao adicionar linha no Google Sheets', { sheetName, error })
    throw error
  }
}

export async function appendRows(sheetName, rows) {
  if (!rows.length) return

  try {
    const client = await getSheetsClient()
    await client.spreadsheets.values.append({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows
      }
    })
  } catch (error) {
    logger.error('Erro ao adicionar linhas no Google Sheets', { sheetName, error })
    throw error
  }
}

export async function readSheet(sheetName) {
  return getValues(`${sheetName}!A:Z`)
}
