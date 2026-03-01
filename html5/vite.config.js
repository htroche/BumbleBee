import { defineConfig } from 'vite';

export default defineConfig({
  base: '/BumbleBee/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
  },
});
