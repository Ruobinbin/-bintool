import fs from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import pkg from './package.json'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  // 删除 'dist-electron' 目录
  fs.rmSync('dist-electron', { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [
      vue(),
      electron({
        main: {
          entry: 'electron/main/index.ts',
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: 'dist-electron/main',
              rollupOptions: {
                // 一些第三方 Node.js 库可能无法被 Vite 正确构建，特别是 `C/C++` 插件，
                // 我们可以使用 `external` 来排除它们以确保它们能正确工作。
                // 其他需要将它们放在 `dependencies` 中以确保在应用构建后它们被收集到 `app.asar` 中。
                // 当然，这不是绝对的，只是这种方式相对简单。 :)
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        preload: {
          input: 'electron/preload/index.ts',
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined, // #332
              minify: isBuild,
              outDir: 'dist-electron/preload',
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? pkg.dependencies : {}),
              },
            },
          },
        },
        // 为渲染进程填充 Electron 和 Node.js API。
        // 如果你想在渲染进程中使用 Node.js，主进程需要启用 `nodeIntegration`。
        // 参见 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    clearScreen: false,
    build: {
      rollupOptions: {
        input: {
          index: path.join(__dirname, 'index.html'),
          novel: path.join(__dirname, 'src/novel/novel.html'),
        },
      },
    },
  }
})