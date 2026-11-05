import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import viteCompression from 'vite-plugin-compression';
import path from 'path';

// 构建分析模式：ANALYZE=true npm run build 生成 dist/stats.html
const isAnalyze = process.env.ANALYZE === 'true';

export default defineConfig(async ({ mode }) => ({
  // CDN 部署：通过 VITE_CDN_URL 环境变量指定静态资源前缀
  base: process.env.VITE_CDN_URL || '/',
  plugins: [
    vue(),
    // gzip 预压缩（>1KB 的文件生成 .gz）
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
    // brotli 预压缩（>1KB 的文件生成 .br）
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
    // 构建产物分析（仅 ANALYZE=true 时生成 stats.html）
    ...(isAnalyze
      ? [
          (await import('rollup-plugin-visualizer')).default({
            open: false,
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  // 生产构建移除 console 和 debugger
  esbuild: {
    drop: ['console', 'debugger'],
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      // 对战房间 WebSocket
      '/ws': {
        target: 'http://localhost:3002',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vue 核心生态
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const ext = path.extname(assetInfo.name || '').slice(1);
          return `assets/${ext || 'other'}/[name]-[hash].[ext]`;
        },
      },
    },
  },
}));
