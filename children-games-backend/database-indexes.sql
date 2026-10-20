-- 数据库索引优化脚本
-- 执行前请备份数据库

-- ============================================
-- 已有索引检查（这些索引已经在模型中定义）
-- ============================================

-- users 表
-- openid: UNIQUE (已在模型中定义)

-- game_progress 表
-- userId + gameId: UNIQUE (idx_game_progress_user_id_game_id)
-- userId + updatedAt: idx_gp_user_updated

-- user_playtime 表
-- userId + date: UNIQUE (idx_user_playtime_user_id_date)
-- date: idx_playtime_date

-- feedbacks 表
-- userId: idx_feedbacks_user_id
-- status: idx_feedbacks_status

-- battle_records 表
-- userId + createdAt: idx_battle_records_user_id_created_at

-- ============================================
-- 新增索引（优化常见查询）
-- ============================================

-- 1. users 表：为积分排行添加索引
CREATE INDEX idx_users_battle_chips ON users(battleChips DESC);

-- 2. users 表：为等级排行添加索引
CREATE INDEX idx_users_level ON users(level DESC);

-- 3. users 表：为星星排行添加索引
CREATE INDEX idx_users_total_stars ON users(totalStars DESC);

-- 4. game_progress 表：为按游戏查询排行添加索引
CREATE INDEX idx_game_progress_game_high_score ON game_progress(gameId, highScore DESC);

-- 5. battle_records 表：为按游戏类型查询添加索引
CREATE INDEX idx_battle_records_game_type ON battle_records(gameType, createdAt DESC);

-- 6. quiz_questions 表：为题库查询添加索引
CREATE INDEX idx_quiz_questions_difficulty ON quiz_questions(difficulty);
CREATE INDEX idx_quiz_questions_category ON quiz_questions(category);

-- ============================================
-- 查看索引
-- ============================================

-- 查看所有表的索引
-- SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
-- FROM information_schema.STATISTICS
-- WHERE TABLE_SCHEMA = 'children_games'
-- GROUP BY TABLE_NAME, INDEX_NAME
-- ORDER BY TABLE_NAME, INDEX_NAME;

-- ============================================
-- 回滚脚本（如需删除新增索引）
-- ============================================

-- DROP INDEX idx_users_battle_chips ON users;
-- DROP INDEX idx_users_level ON users;
-- DROP INDEX idx_users_total_stars ON users;
-- DROP INDEX idx_game_progress_game_high_score ON game_progress;
-- DROP INDEX idx_battle_records_game_type ON battle_records;
-- DROP INDEX idx_quiz_questions_difficulty ON quiz_questions;
-- DROP INDEX idx_quiz_questions_category ON quiz_questions;
