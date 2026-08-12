import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Electron は file:// でページを開く。絶対パスだと読み込めないので相対にする。
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
  // ビルド成果物を拾わせない。tsc が出した .js 版のテストが二重に走り、
  // 「同じテストが落ちる」という紛らわしい失敗になったため。
  test: { include: ['src/**/*.test.ts'], exclude: ['dist/**', 'dist-electron/**', 'node_modules/**'] },
})
