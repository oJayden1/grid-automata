import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
