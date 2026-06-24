import mysql from 'mysql2/promise'
import { env } from '../config/env.js'

let pool

function hasExplicitMysqlConfig() {
  return Boolean(
    process.env.MYSQL_HOST ||
      process.env.MYSQL_USER ||
      process.env.MYSQL_PASSWORD ||
      process.env.MYSQL_DATABASE
  )
}

function buildPoolConfig() {
  const baseConfig = {
    waitForConnections: true,
    connectionLimit: env.MYSQL_CONNECTION_LIMIT,
    connectTimeout: env.MYSQL_CONNECT_TIMEOUT_MS,
    multipleStatements: false,
    decimalNumbers: true,
    dateStrings: true
  }

  if (env.DATABASE_URL && !hasExplicitMysqlConfig()) {
    return {
      uri: env.DATABASE_URL,
      ...baseConfig,
      ssl: env.MYSQL_SSL ? {} : undefined
    }
  }

  return {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
    ...baseConfig,
    ssl: env.MYSQL_SSL ? {} : undefined
  }
}

export function getDbPool() {
  if (!pool) {
    pool = mysql.createPool(buildPoolConfig())
  }

  return pool
}

export async function query(sql, params = []) {
  const [rows] = await getDbPool().query(sql, params)
  return rows
}

export async function execute(sql, params = []) {
  const [result] = await getDbPool().execute(sql, params)
  return result
}

export async function closeDbPool() {
  if (!pool) return
  await pool.end()
  pool = null
}
