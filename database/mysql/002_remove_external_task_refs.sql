-- Lapa OS v2 - remove task/agenda remnants from external providers.

USE lapaos;

UPDATE tasks
SET source = 'import'
WHERE source = 'ticktick';

ALTER TABLE tasks
  MODIFY COLUMN source ENUM('whatsapp', 'manual', 'import') NOT NULL DEFAULT 'whatsapp';

SET @has_idx = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'tasks'
    AND index_name = 'idx_tasks_external'
);
SET @sql = IF(@has_idx > 0, 'ALTER TABLE tasks DROP INDEX idx_tasks_external', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_external_provider = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tasks'
    AND column_name = 'external_provider'
);
SET @sql = IF(@has_external_provider > 0, 'ALTER TABLE tasks DROP COLUMN external_provider', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_external_id = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'tasks'
    AND column_name = 'external_id'
);
SET @sql = IF(@has_external_id > 0, 'ALTER TABLE tasks DROP COLUMN external_id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
