import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,ts}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'src/main.ts',
        'src/env.d.ts',
      ],
    },
    deps: {
      inline: ['@vue/test-utils'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@children-games/shared': resolve(__dirname, '../packages/shared/src'),
    },
  },
});
