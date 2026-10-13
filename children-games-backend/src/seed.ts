import { LevelConfig } from './models';
import { sequelize, testConnection } from './config/database';
import { initModels } from './models';

// 生成默认关卡配置
async function seedLevelConfigs() {
  try {
    await testConnection();
    await initModels();

    console.log('开始初始化关卡配置...');

    // 记忆翻牌关卡
    for (let i = 1; i <= 20; i++) {
      await LevelConfig.findOrCreate({
        where: { gameId: 'memory', level: i },
        defaults: {
          gameId: 'memory',
          level: i,
          config: JSON.stringify({
            pairs: Math.min(2 + Math.floor(i / 3), 8),
            timeLimit: Math.max(60 - i, 30),
          }),
        },
      });
    }

    // 接水果关卡
    for (let i = 1; i <= 30; i++) {
      await LevelConfig.findOrCreate({
        where: { gameId: 'fruit', level: i },
        defaults: {
          gameId: 'fruit',
          level: i,
          config: JSON.stringify({
            speed: 2 + i * 0.15,
            bombRate: Math.min(0.05 + i * 0.008, 0.2),
            targetScore: 50 + i * 15,
            lives: 3,
          }),
        },
      });
    }

    // 拼图游戏关卡
    for (let i = 1; i <= 25; i++) {
      await LevelConfig.findOrCreate({
        where: { gameId: 'puzzle', level: i },
        defaults: {
          gameId: 'puzzle',
          level: i,
          config: JSON.stringify({
            gridSize: Math.min(3 + Math.floor(i / 5), 6),
            timeLimit: Math.max(180 - i * 2, 60),
          }),
        },
      });
    }

    // 打气球关卡
    for (let i = 1; i <= 30; i++) {
      await LevelConfig.findOrCreate({
        where: { gameId: 'balloon', level: i },
        defaults: {
          gameId: 'balloon',
          level: i,
          config: JSON.stringify({
            spawnRate: Math.max(1200 - i * 25, 400),
            moveSpeed: 1 + i * 0.08,
            targetScore: 100 + i * 25,
            specialRate: Math.min(0.1 + i * 0.005, 0.2),
          }),
        },
      });
    }

    // 坦克大战关卡
    for (let i = 1; i <= 25; i++) {
      await LevelConfig.findOrCreate({
        where: { gameId: 'tank', level: i },
        defaults: {
          gameId: 'tank',
          level: i,
          config: JSON.stringify({
            enemyCount: 3 + Math.floor(i * 0.8),
            enemySpeed: 1 + i * 0.1,
            enemyFireRate: Math.min(0.3 + i * 0.02, 0.8),
            bossLevel: i % 5 === 0,
            bossHP: i % 5 === 0 ? 10 + i : 0,
          }),
        },
      });
    }

    console.log('✅ 关卡配置初始化完成');
    process.exit(0);
  } catch (error) {
    console.error('初始化失败:', error);
    process.exit(1);
  }
}

seedLevelConfigs();
