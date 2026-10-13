-- 数据库初始化脚本
-- 使用前请先创建数据库：CREATE DATABASE children_games CHARACTER SET utf8mb4;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `openid` varchar(100) NOT NULL COMMENT '用户唯一标识',
  `nickname` varchar(50) NOT NULL DEFAULT '小朋友' COMMENT '昵称',
  `avatar` varchar(500) DEFAULT '' COMMENT '头像URL',
  `total_stars` int unsigned NOT NULL DEFAULT '0' COMMENT '总星星数',
  `level` int unsigned NOT NULL DEFAULT '1' COMMENT '玩家等级',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- 游戏进度表
CREATE TABLE IF NOT EXISTS `game_progress` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户ID',
  `game_id` varchar(50) NOT NULL COMMENT '游戏ID: memory/fruit/puzzle/balloon/tank',
  `current_level` int unsigned NOT NULL DEFAULT '1' COMMENT '当前关卡',
  `high_score` int unsigned NOT NULL DEFAULT '0' COMMENT '最高分',
  `stars` int unsigned NOT NULL DEFAULT '0' COMMENT '该游戏获得的星星总数（各关星级之和）',
  `levelStars` text COMMENT '每关最佳星级JSON对象，如 {"1":3,"2":2}',
  `achievements` text COMMENT '成就JSON数组',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_game` (`user_id`,`game_id`),
  KEY `idx_game_id` (`game_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='游戏进度表';

-- 关卡配置表
CREATE TABLE IF NOT EXISTS `level_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `game_id` varchar(50) NOT NULL COMMENT '游戏ID',
  `level` int unsigned NOT NULL COMMENT '关卡编号',
  `config` text NOT NULL COMMENT '关卡配置JSON',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_game_level` (`game_id`,`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='关卡配置表';

-- 每日任务表
CREATE TABLE IF NOT EXISTS `daily_tasks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL COMMENT '用户ID',
  `date` varchar(10) NOT NULL COMMENT '日期 YYYY-MM-DD',
  `completed_games` int unsigned NOT NULL DEFAULT '0' COMMENT '已完成游戏数',
  `task_reward` int unsigned NOT NULL DEFAULT '0' COMMENT '已领取奖励',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_date` (`user_id`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='每日任务表';

SET FOREIGN_KEY_CHECKS = 1;

-- 插入默认关卡配置
-- 记忆翻牌 20关
INSERT INTO `level_configs` (`game_id`, `level`, `config`) VALUES
('memory', 1, '{"pairs":2,"timeLimit":60}'),
('memory', 2, '{"pairs":2,"timeLimit":58}'),
('memory', 3, '{"pairs":3,"timeLimit":56}'),
('memory', 4, '{"pairs":3,"timeLimit":54}'),
('memory', 5, '{"pairs":4,"timeLimit":52}')
ON DUPLICATE KEY UPDATE `config` = VALUES(`config`);

-- 接水果 30关
INSERT INTO `level_configs` (`game_id`, `level`, `config`) VALUES
('fruit', 1, '{"speed":2.15,"bombRate":0.058,"targetScore":65,"lives":3}'),
('fruit', 2, '{"speed":2.3,"bombRate":0.066,"targetScore":80,"lives":3}'),
('fruit', 3, '{"speed":2.45,"bombRate":0.074,"targetScore":95,"lives":3}')
ON DUPLICATE KEY UPDATE `config` = VALUES(`config`);

-- 拼图游戏 25关
INSERT INTO `level_configs` (`game_id`, `level`, `config`) VALUES
('puzzle', 1, '{"gridSize":3,"timeLimit":178}'),
('puzzle', 2, '{"gridSize":3,"timeLimit":176}'),
('puzzle', 3, '{"gridSize":3,"timeLimit":174}')
ON DUPLICATE KEY UPDATE `config` = VALUES(`config`);

-- 打气球 30关
INSERT INTO `level_configs` (`game_id`, `level`, `config`) VALUES
('balloon', 1, '{"spawnRate":1175,"moveSpeed":1.08,"targetScore":125,"specialRate":0.105}'),
('balloon', 2, '{"spawnRate":1150,"moveSpeed":1.16,"targetScore":150,"specialRate":0.11}'),
('balloon', 3, '{"spawnRate":1125,"moveSpeed":1.24,"targetScore":175,"specialRate":0.115}')
ON DUPLICATE KEY UPDATE `config` = VALUES(`config`);

-- 坦克大战 25关
INSERT INTO `level_configs` (`game_id`, `level`, `config`) VALUES
('tank', 1, '{"enemyCount":3,"enemySpeed":1.1,"enemyFireRate":0.32,"bossLevel":false,"bossHP":0}'),
('tank', 2, '{"enemyCount":4,"enemySpeed":1.2,"enemyFireRate":0.34,"bossLevel":false,"bossHP":0}'),
('tank', 3, '{"enemyCount":5,"enemySpeed":1.3,"enemyFireRate":0.36,"bossLevel":false,"bossHP":0}'),
('tank', 4, '{"enemyCount":6,"enemySpeed":1.4,"enemyFireRate":0.38,"bossLevel":false,"bossHP":0}'),
('tank', 5, '{"enemyCount":7,"enemySpeed":1.5,"enemyFireRate":0.4,"bossLevel":true,"bossHP":15}')
ON DUPLICATE KEY UPDATE `config` = VALUES(`config`);
