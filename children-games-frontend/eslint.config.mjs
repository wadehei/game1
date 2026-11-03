import js from '@eslint/js'
import ts from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier/recommended'

export default [
  // Base configs
  js.configs.recommended,
  ...ts.configs.recommended,
  ...vue.configs['flat/recommended'],

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
    ],
  },

  // Vue files config
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // 与 TS 块保持一致的宽松级别（.vue 里的 <script> 也适用）
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      // 对战组件以共享 reactive events 袋作为事件通道，写入 props 对象属性是有意设计（类型化改造时治理）
      'vue/no-mutating-props': 'warn',
    },
  },

  // TypeScript files config
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: ts.parser,
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

      // TS 编译器（vue-tsc）已覆盖这些检查，交给 tsc
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },

  // JavaScript files config（tests/*.mjs 等节点脚本）
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
      // Vue specific
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'vue/require-default-prop': 'warn',
      'vue/attribute-hyphenation': ['error', 'always'],

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
]
