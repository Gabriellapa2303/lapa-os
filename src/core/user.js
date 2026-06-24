import { env } from '../config/env.js'
import { execute, query } from '../integrations/mysql.js'
import { normalizePhone } from '../utils/formatter.js'

let cachedOwnerUser

export async function getOwnerUser() {
  if (cachedOwnerUser) return cachedOwnerUser

  const phone = normalizePhone(env.OWNER_PHONE)

  await execute(
    `INSERT INTO app_users (display_name, whatsapp_phone, timezone, active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       timezone = VALUES(timezone),
       active = 1`,
    ['Gabriel Lapa', phone, env.APP_TIMEZONE]
  )

  const rows = await query(
    `SELECT id, display_name AS displayName, whatsapp_phone AS whatsappPhone, timezone
     FROM app_users
     WHERE whatsapp_phone = ?
     LIMIT 1`,
    [phone]
  )

  cachedOwnerUser = rows[0]
  return cachedOwnerUser
}
