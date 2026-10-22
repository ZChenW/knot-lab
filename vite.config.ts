import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'web' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'web' ? 'dist-web' : 'dist' },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
}));
