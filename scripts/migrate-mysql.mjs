import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import mysql from 'mysql2/promise'

const migrationPath = process.argv[2] || path.resolve('database/mysql/001_init_v2.sql')

function readBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(value).toLowerCase())
}

function connectionConfig() {
  const connectTimeout = Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 10000)

  if (process.env.DATABASE_URL) {
    return {
      uri: process.env.DATABASE_URL,
      multipleStatements: true,
      connectTimeout
    }
  }

  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'admin',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'central',
    multipleStatements: true,
    connectTimeout,
    ssl: readBoolean(process.env.MYSQL_SSL) ? {} : undefined
  }
}

async function run() {
  const sql = await fs.readFile(migrationPath, 'utf8')
  const connection = await mysql.createConnection(connectionConfig())

  try {
    await connection.query(sql)
    console.log(`MySQL migration applied: ${migrationPath}`)
  } finally {
    await connection.end()
  }
}

run().catch((error) => {
  console.error(`MySQL migration failed: ${error.message}`)
  process.exit(1)
})
