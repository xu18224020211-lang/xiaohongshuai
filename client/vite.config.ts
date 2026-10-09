import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  /**
   * 部署基础路径。
   * - 默认 '/'：适用于本地开发、以及部署在域名根目录
   * - 部署到子目录时（如 https://www.1510ad.com/test/）设为 '/test/'
   *
   * 通过环境变量 VITE_BASE_PATH 注入，例如：
   *   VITE_BASE_PATH=/test/ npm run build
   */
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
