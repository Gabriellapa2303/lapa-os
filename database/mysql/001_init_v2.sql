-- Lapa OS v2 - MySQL schema
-- Source model: WhatsApp-first personal OS with finance, tasks/agenda,
-- memory and conversation history persisted in MySQL.

CREATE DATABASE IF NOT EXISTS lapaos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lapaos;

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS app_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name VARCHAR(120) NOT NULL,
  whatsapp_phone VARCHAR(32) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_users_whatsapp_phone (whatsapp_phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  provider_message_id VARCHAR(191) NULL,
  queue_job_id VARCHAR(80) NULL,
  message_type ENUM('text', 'audio', 'image', 'document', 'system') NOT NULL DEFAULT 'text',
  body TEXT NULL,
  transcription TEXT NULL,
  media_url TEXT NULL,
  media_mime_type VARCHAR(120) NULL,
  intent_json JSON NULL,
  processed_status ENUM('queued', 'processed', 'failed', 'ignored') NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  received_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_whatsapp_messages_user_created (user_id, created_at),
  KEY idx_whatsapp_messages_provider (provider_message_id),
  CONSTRAINT fk_whatsapp_messages_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS memories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  memory_type ENUM('fact', 'conversation', 'pending_task', 'pending_task_resolved', 'note') NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_memories_user_type_created (user_id, memory_type, created_at),
  FULLTEXT KEY ft_memories_content (content),
  CONSTRAINT fk_memories_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_contexts (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  label VARCHAR(80) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_contexts_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  context_id SMALLINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NULL,
  status ENUM('pending', 'completed', 'cancelled', 'deleted') NOT NULL DEFAULT 'pending',
  priority TINYINT UNSIGNED NOT NULL DEFAULT 0,
  start_at DATETIME NULL,
  due_at DATETIME NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  is_all_day TINYINT(1) NOT NULL DEFAULT 0,
  reminders_json JSON NULL,
  repeat_rule VARCHAR(255) NULL,
  source ENUM('whatsapp', 'manual', 'import') NOT NULL DEFAULT 'whatsapp',
  completed_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_user_status_due (user_id, status, due_at),
  KEY idx_tasks_user_start (user_id, start_at),
  KEY idx_tasks_context (context_id),
  FULLTEXT KEY ft_tasks_title_content (title, content),
  CONSTRAINT fk_tasks_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_tasks_context
    FOREIGN KEY (context_id) REFERENCES task_contexts (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(60) NOT NULL,
  payload JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_task_audit_log_task_created (task_id, created_at),
  CONSTRAINT fk_task_audit_log_task
    FOREIGN KEY (task_id) REFERENCES tasks (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  category_type ENUM('expense', 'income', 'convenio', 'balance', 'investment', 'shared', 'other') NOT NULL DEFAULT 'expense',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_categories_code (code),
  KEY idx_finance_categories_type (category_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  account_type ENUM('checking', 'credit_card', 'cash', 'investment', 'other') NOT NULL DEFAULT 'other',
  opening_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_accounts_user_name (user_id, name),
  CONSTRAINT fk_finance_accounts_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_periods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  period_month DATE NOT NULL,
  label VARCHAR(120) NOT NULL,
  plan_status ENUM('planned', 'actual', 'forecast') NOT NULL DEFAULT 'forecast',
  source_label VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_periods_user_month_status (user_id, period_month, plan_status),
  CONSTRAINT fk_finance_periods_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_monthly_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  period_id BIGINT UNSIGNED NOT NULL,
  item_type ENUM('expense', 'income', 'convenio', 'balance', 'investment', 'shared', 'adjustment', 'note') NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  name VARCHAR(180) NOT NULL,
  amount DECIMAL(12,2) NULL,
  note TEXT NULL,
  block_name VARCHAR(80) NULL,
  source_sheet_name VARCHAR(120) NULL,
  source_cell VARCHAR(20) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_finance_monthly_items_period_type (period_id, item_type),
  KEY idx_finance_monthly_items_user_name (user_id, name),
  CONSTRAINT fk_finance_monthly_items_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_monthly_items_period
    FOREIGN KEY (period_id) REFERENCES finance_periods (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_monthly_items_category
    FOREIGN KEY (category_id) REFERENCES finance_categories (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NULL,
  category_id BIGINT UNSIGNED NULL,
  source_message_id BIGINT UNSIGNED NULL,
  transaction_type ENUM('expense', 'income', 'convenio', 'investment', 'transfer', 'adjustment') NOT NULL,
  status ENUM('planned', 'pending', 'paid', 'cancelled') NOT NULL DEFAULT 'paid',
  movement_date DATE NOT NULL,
  due_date DATE NULL,
  paid_at DATETIME NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  installments_total SMALLINT UNSIGNED NULL,
  installment_number SMALLINT UNSIGNED NULL,
  note TEXT NULL,
  attachment_url TEXT NULL,
  source ENUM('whatsapp', 'manual', 'import', 'recurrence') NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_finance_transactions_user_date (user_id, movement_date),
  KEY idx_finance_transactions_user_type_date (user_id, transaction_type, movement_date),
  KEY idx_finance_transactions_category (category_id),
  KEY idx_finance_transactions_account (account_id),
  CONSTRAINT fk_finance_transactions_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_transactions_account
    FOREIGN KEY (account_id) REFERENCES finance_accounts (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_finance_transactions_category
    FOREIGN KEY (category_id) REFERENCES finance_categories (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_finance_transactions_source_message
    FOREIGN KEY (source_message_id) REFERENCES whatsapp_messages (id)
    ON DELETE SET NULL,
  CONSTRAINT chk_finance_transactions_amount_non_negative
    CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_recurrences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NULL,
  category_id BIGINT UNSIGNED NULL,
  recurrence_type ENUM('expense', 'income', 'convenio', 'investment') NOT NULL DEFAULT 'expense',
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  frequency ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL DEFAULT 'monthly',
  due_day TINYINT UNSIGNED NULL,
  start_month DATE NOT NULL,
  end_month DATE NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_finance_recurrences_user_active (user_id, active),
  CONSTRAINT fk_finance_recurrences_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_recurrences_account
    FOREIGN KEY (account_id) REFERENCES finance_accounts (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_finance_recurrences_category
    FOREIGN KEY (category_id) REFERENCES finance_categories (id)
    ON DELETE SET NULL,
  CONSTRAINT chk_finance_recurrences_amount_non_negative
    CHECK (amount >= 0),
  CONSTRAINT chk_finance_recurrences_due_day
    CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_budgets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  period_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  limit_amount DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_budgets_period_category (period_id, category_id),
  CONSTRAINT fk_finance_budgets_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_budgets_period
    FOREIGN KEY (period_id) REFERENCES finance_periods (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_budgets_category
    FOREIGN KEY (category_id) REFERENCES finance_categories (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_finance_budgets_limit_non_negative
    CHECK (limit_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_convenio_members (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  default_amount DECIMAL(12,2) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_convenio_members_user_name (user_id, name),
  CONSTRAINT fk_finance_convenio_members_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_convenio_values (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id BIGINT UNSIGNED NOT NULL,
  member_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_convenio_values_period_member (period_id, member_id),
  CONSTRAINT fk_finance_convenio_values_period
    FOREIGN KEY (period_id) REFERENCES finance_periods (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_finance_convenio_values_member
    FOREIGN KEY (member_id) REFERENCES finance_convenio_members (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_finance_convenio_values_amount_non_negative
    CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  source_file_name VARCHAR(255) NOT NULL,
  source_sheet_name VARCHAR(120) NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_finance_import_batches_user_imported (user_id, imported_at),
  CONSTRAINT fk_finance_import_batches_user
    FOREIGN KEY (user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS finance_import_cells (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_batch_id BIGINT UNSIGNED NOT NULL,
  sheet_name VARCHAR(120) NOT NULL,
  cell_ref VARCHAR(20) NOT NULL,
  row_num INT NOT NULL,
  col_name VARCHAR(8) NOT NULL,
  raw_value TEXT NULL,
  normalized_value VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_finance_import_cells_batch_cell (import_batch_id, sheet_name, cell_ref),
  KEY idx_finance_import_cells_row (import_batch_id, row_num),
  CONSTRAINT fk_finance_import_cells_batch
    FOREIGN KEY (import_batch_id) REFERENCES finance_import_batches (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE OR REPLACE VIEW v_finance_monthly_summary AS
SELECT
  user_id,
  DATE_FORMAT(movement_date, '%Y-%m-01') AS period_month,
  transaction_type,
  status,
  SUM(amount) AS total_amount,
  COUNT(*) AS total_transactions
FROM finance_transactions
GROUP BY user_id, DATE_FORMAT(movement_date, '%Y-%m-01'), transaction_type, status;

CREATE OR REPLACE VIEW v_tasks_agenda AS
SELECT
  t.id,
  t.user_id,
  c.code AS context_code,
  c.label AS context_label,
  t.title,
  t.status,
  t.priority,
  t.start_at,
  t.due_at,
  t.timezone,
  t.is_all_day,
  t.repeat_rule,
  t.created_at,
  t.updated_at
FROM tasks t
LEFT JOIN task_contexts c ON c.id = t.context_id
WHERE t.status IN ('pending', 'completed', 'cancelled');

INSERT INTO task_contexts (code, label)
VALUES
  ('pessoal', 'Pessoal'),
  ('centrya', 'Centrya'),
  ('fc', 'Farma Conde')
ON DUPLICATE KEY UPDATE
  label = VALUES(label),
  active = 1;

INSERT INTO finance_categories (code, name, category_type)
VALUES
  ('CONVENIO', 'Convenio', 'expense'),
  ('PSICOLOGA', 'Psicologa', 'expense'),
  ('FACULDADE', 'Faculdade', 'expense'),
  ('CELULAR', 'Celular', 'expense'),
  ('CASAMENTO', 'Casamento', 'expense'),
  ('CARTAO_1', 'Cartao - 1', 'expense'),
  ('CARTAO_2', 'Cartao - 2', 'expense'),
  ('CARTAO_BRCARD', 'Cartao BRCard', 'expense'),
  ('CARTAO_ITAU', 'Cartao Itau', 'expense'),
  ('CARTAO_PICPAY', 'Cartao PicPay', 'expense'),
  ('VIVO', 'Vivo', 'expense'),
  ('CABELO', 'Cabelo', 'expense'),
  ('DAS', 'DAS', 'expense'),
  ('DIZIMO', 'Dizimo', 'expense'),
  ('MOTINHA', 'Motinha', 'expense'),
  ('CARRO', 'Carro', 'expense'),
  ('SEGURO', 'Seguro', 'expense'),
  ('SERVIDOR', 'Servidor', 'expense'),
  ('INVESTIMENTO', 'Investimento', 'investment'),
  ('SALARIO', 'Salario', 'income'),
  ('RENDA_EXTRA', 'Renda extra', 'income'),
  ('SALDO', 'Saldo', 'balance'),
  ('VI_EU', 'Vi + Eu', 'shared'),
  ('OUTROS', 'Outros', 'other')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category_type = VALUES(category_type),
  active = 1;
