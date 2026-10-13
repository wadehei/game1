-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: children_games
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `daily_tasks`
--

DROP TABLE IF EXISTS `daily_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_tasks` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `userId` int unsigned NOT NULL COMMENT '用户ID',
  `date` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '日期 YYYY-MM-DD',
  `completedGames` int unsigned NOT NULL DEFAULT '0' COMMENT '已完成游戏数',
  `taskReward` int unsigned NOT NULL DEFAULT '0' COMMENT '已领取奖励',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `daily_tasks_user_id_date` (`userId`,`date`),
  CONSTRAINT `daily_tasks_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_tasks`
--

LOCK TABLES `daily_tasks` WRITE;
/*!40000 ALTER TABLE `daily_tasks` DISABLE KEYS */;
INSERT INTO `daily_tasks` VALUES (1,1,'2026-10-13',1,0,'2026-10-13 03:34:36','2026-10-13 03:34:36'),(2,2,'2026-10-13',3,10,'2026-10-13 03:38:05','2026-10-13 03:40:37'),(3,3,'2026-10-13',1,0,'2026-10-13 03:39:56','2026-10-13 03:39:56'),(4,4,'2026-10-13',1,0,'2026-10-13 03:44:41','2026-10-13 03:44:41'),(5,6,'2026-10-13',1,0,'2026-10-13 04:12:35','2026-10-13 04:12:35');
/*!40000 ALTER TABLE `daily_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `game_progress`
--

DROP TABLE IF EXISTS `game_progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `game_progress` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `userId` int unsigned NOT NULL COMMENT '用户ID',
  `gameId` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '游戏ID: memory/fruit/puzzle/balloon/tank',
  `currentLevel` int unsigned NOT NULL DEFAULT '1' COMMENT '当前关卡',
  `highScore` int unsigned NOT NULL DEFAULT '0' COMMENT '最高分',
  `stars` int unsigned NOT NULL DEFAULT '0' COMMENT '该游戏获得的星星总数（各关星级之和）',
  `levelStars` text COLLATE utf8mb4_unicode_ci COMMENT '每关最佳星级JSON对象，如 {"1":3,"2":2}',
  `achievements` text COLLATE utf8mb4_unicode_ci COMMENT '成就JSON数组',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `game_progress_user_id_game_id` (`userId`,`gameId`),
  CONSTRAINT `game_progress_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `game_progress`
--

LOCK TABLES `game_progress` WRITE;
/*!40000 ALTER TABLE `game_progress` DISABLE KEYS */;
INSERT INTO `game_progress` VALUES (1,1,'memory',1,2,3,'{\"1\":3}','[]','2026-10-13 03:34:36','2026-10-13 03:34:36'),(2,2,'memory',7,3,20,'{\"1\":3,\"2\":3,\"3\":3,\"4\":3,\"5\":3,\"6\":3,\"7\":2}','[]','2026-10-13 03:38:05','2026-10-13 03:39:34'),(3,3,'memory',1,3,3,'{\"1\":3}','[]','2026-10-13 03:39:56','2026-10-13 03:39:56'),(4,2,'balloon',1,125,1,'{\"1\":1}','[]','2026-10-13 03:40:06','2026-10-13 03:40:06'),(5,2,'math',2,15,6,'{\"1\":3,\"2\":3}','[]','2026-10-13 03:40:37','2026-10-13 03:40:55'),(6,4,'memory',6,2,15,'{\"1\":3,\"2\":3,\"3\":3,\"4\":3,\"5\":1,\"6\":2}','[]','2026-10-13 03:44:41','2026-10-13 03:46:00'),(7,6,'tank',1,1,3,'{\"1\":3}','[]','2026-10-13 04:12:35','2026-10-13 04:12:35');
/*!40000 ALTER TABLE `game_progress` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `level_configs`
--

DROP TABLE IF EXISTS `level_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `level_configs` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `gameId` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '游戏ID',
  `level` int unsigned NOT NULL COMMENT '关卡编号',
  `config` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关卡配置JSON',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `level_configs_game_id_level` (`gameId`,`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `level_configs`
--

LOCK TABLES `level_configs` WRITE;
/*!40000 ALTER TABLE `level_configs` DISABLE KEYS */;
/*!40000 ALTER TABLE `level_configs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `openid` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户唯一标识',
  `nickname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '小朋友' COMMENT '昵称',
  `avatar` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT '' COMMENT '头像URL',
  `totalStars` int unsigned NOT NULL DEFAULT '0' COMMENT '总星星数',
  `level` int unsigned NOT NULL DEFAULT '1' COMMENT '玩家等级',
  `achievements` text COLLATE utf8mb4_unicode_ci COMMENT '已解锁成就ID JSON数组',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `openid` (`openid`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'family_1791862438014','ssh','🦊',3,1,'[\"first_win\"]','2026-10-13 03:33:58','2026-10-13 03:34:36'),(2,'family_1791862669965','mhc','🌟',37,3,'[\"first_win\",\"star_10\",\"star_30\",\"daily_done\"]','2026-10-13 03:37:49','2026-10-13 03:40:55'),(3,'family_1791862787442','sg','🦄',3,1,'[\"first_win\"]','2026-10-13 03:39:47','2026-10-13 03:39:56'),(4,'family_1791863067434','llz','🦊',15,2,'[\"first_win\",\"star_10\"]','2026-10-13 03:44:27','2026-10-13 03:46:00'),(5,'family_1791863168472','sg','🌟',0,1,'[]','2026-10-13 03:46:08','2026-10-13 03:46:08'),(6,'family_1791864747691','lyf','🐼',3,1,'[\"first_win\"]','2026-10-13 04:12:27','2026-10-13 04:12:35');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-13 13:57:40
