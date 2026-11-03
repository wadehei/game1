-- 审计日志表
-- 记录管理员操作，用于安全审计和问题追踪
-- 保留策略：90 天（由定时任务清理）

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `admin_id` INT NOT NULL DEFAULT 0 COMMENT '管理员ID（预留字段，当前系统无管理员表，可为空或默认值）',
  `action` VARCHAR(50) NOT NULL COMMENT '审计动作: admin.login, user.update, user.delete, user.chips.adjust, level.config.update, question.create/update/delete, feedback.reply',
  `target_type` VARCHAR(50) DEFAULT NULL COMMENT '目标类型: user, level, question, feedback, settings',
  `target_id` INT DEFAULT NULL COMMENT '目标ID',
  `details` JSON DEFAULT NULL COMMENT '操作详情（请求参数、变更内容等）',
  `ip_address` VARCHAR(45) DEFAULT NULL COMMENT '客户端IP地址',
  `user_agent` TEXT DEFAULT NULL COMMENT '客户端User-Agent',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  INDEX `idx_admin_id` (`admin_id`),
  INDEX `idx_action` (`action`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志表';
