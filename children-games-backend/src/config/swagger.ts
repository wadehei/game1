import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '儿童游戏乐园 API',
      version: '1.0.0',
      description: '儿童游戏乐园后端 API 文档',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: '开发环境',
      },
      {
        url: 'https://game.985211.icu',
        description: '生产环境',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT 认证令牌',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: '错误信息',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              example: 1,
            },
            nickname: {
              type: 'string',
              example: '小明',
            },
            avatar: {
              type: 'string',
              example: '/avatars/1.png',
            },
          },
        },
        GameProgress: {
          type: 'object',
          properties: {
            gameId: {
              type: 'string',
              example: 'match3',
            },
            currentLevel: {
              type: 'integer',
              example: 5,
            },
            highScore: {
              type: 'integer',
              example: 1000,
            },
            stars: {
              type: 'integer',
              example: 15,
            },
            levelStars: {
              type: 'object',
              additionalProperties: {
                type: 'integer',
              },
              example: { '1': 3, '2': 2, '3': 1 },
            },
            achievements: {
              type: 'array',
              items: {
                type: 'string',
              },
              example: ['first_win', 'combo_master'],
            },
          },
        },
        DailyTask: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              format: 'date',
              example: '2026-10-20',
            },
            playedGames: {
              type: 'integer',
              example: 3,
            },
            goal: {
              type: 'integer',
              example: 5,
            },
            completed: {
              type: 'boolean',
              example: false,
            },
            reward: {
              type: 'integer',
              example: 50,
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
