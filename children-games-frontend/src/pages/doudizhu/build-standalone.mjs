/**
 * 斗地主干净的单文件 HTML 构建脚本
 * 借鉴 claude-opus-5-5-demo 的方式，将所有资源内联到单个 HTML 文件
 *
 * 使用方法：
 *   node build-standalone.mjs
 *
 * 产物：
 *   dist/doudizhu-standalone.html - 可直接打开的单文件游戏
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_DIR = path.join(__dirname, 'dist');
const HTML_TEMPLATE = path.join(__dirname, 'standalone-template.html');

async function build() {
  console.log('🃏 构建斗地主干净单文件版本...\n');

  // 确保输出目录存在
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // 使用 esbuild 打包所有 JS
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'index.vue')],
    bundle: true,
    minify: true,
    sourcemap: false,
    write: false,
    format: 'esm',
    target: 'es2020',
    platform: 'browser',
    // 内联所有资源为 data URL
    loader: {
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.jpeg': 'dataurl',
      '.gif': 'dataurl',
      '.svg': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      '.ttf': 'dataurl',
    },
    // 外部依赖（不打包 Vue 等大型库，使用 CDN）
    external: ['vue', 'vue-router', 'pinia'],
    // 定义全局变量
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [
      // Vue 单文件组件支持
      {
        name: 'vue-loader',
        setup(build) {
          build.onLoad({ filter: /\.vue$/ }, async (args) => {
            const content = fs.readFileSync(args.path, 'utf-8');

            // 简单的 Vue SFC 解析
            const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
            const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
            const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/);

            const template = templateMatch ? templateMatch[1].trim() : '';
            const script = scriptMatch ? scriptMatch[1].trim() : '';
            const style = styleMatch ? styleMatch[1].trim() : '';

            // 转换为可执行的 JS
            const js = `
              const template = ${JSON.stringify(template)};
              ${script.replace(/export default/, 'const component =')}
              component.template = template;
              ${style ? `component.styles = ${JSON.stringify(style)};` : ''}
              export default component;
            `;

            return { contents: js, loader: 'ts' };
          });
        },
      },
    ],
  });

  if (result.errors.length > 0) {
    console.error('❌ 构建失败:', result.errors);
    process.exit(1);
  }

  const bundledJs = result.outputFiles?.[0]?.text || '';
  const jsSize = (Buffer.byteLength(bundledJs) / 1024).toFixed(2);

  console.log(`✅ JS 打包完成: ${jsSize} KB`);

  // 生成 HTML
  const html = generateHTML(bundledJs);
  const htmlPath = path.join(OUT_DIR, 'doudizhu-standalone.html');

  fs.writeFileSync(htmlPath, html);
  const htmlSize = (Buffer.byteLength(html) / 1024).toFixed(2);

  console.log(`✅ HTML 生成完成: ${htmlSize} KB`);
  console.log(`\n📦 产物位置: ${htmlPath}`);
  console.log('\n🎮 可直接在浏览器中打开游玩！');
}

function generateHTML(js) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>斗地主 - 儿童游戏乐园</title>
  <meta name="description" content="适合儿童的斗地主游戏，锻炼思维能力">

  <!-- PWA 支持 -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#2e7d32">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }

    #app {
      width: 100%;
      height: 100%;
    }

    /* 加载状态 */
    .loading {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #2e7d32 0%, #1b5e20 100%);
      color: white;
    }

    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-text {
      margin-top: 16px;
      font-size: 16px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="loading">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载中...</div>
    </div>
  </div>

  <!-- Vue 3 CDN (生产版本) -->
  <script src="https://unpkg.com/vue@3.4.21/dist/vue.global.prod.js"></script>

  <!-- 游戏代码 -->
  <script type="module">
    ${js}
  </script>
</body>
</html>`;
}

build().catch((err) => {
  console.error('❌ 构建出错:', err);
  process.exit(1);
});
