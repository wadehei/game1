import js from '@eslint/js'
import ts from 'typescript-eslint'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier/recommended'

export default [
  // Base configs
  js.configs.recommended,
  ...ts.configs.recommended,

  // Prettier integration (must be last)
  prettier,

  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      'tests/**/*.mjs',
    ],
  },

  // TypeScript files config
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: ts.parser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Disable rules that conflict with Prettier
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Sequelize 惯用法：interface XxxAttributes extends InferAttributes<Xxx> {} 空接口扩展
      '@typescript-eslint/no-empty-object-type': 'off',

      // TS 编译器已覆盖这些检查，交给 tsc
      'no-undef': 'off',
      'no-unused-vars': 'off',

      // Node.js specific
      'no-console': 'warn',
      'no-process-exit': 'warn',
    },
  },

  // JavaScript files config
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },

  // Custom rules
  {
    rules: {
      // General
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',

      // Error handling
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
    },
  },
]
