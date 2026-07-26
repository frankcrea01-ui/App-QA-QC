import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rutaDe = (relativa) => fileURLToPath(new URL(relativa, import.meta.url));

export default defineConfig({
  // Solo el renderer se empaqueta: el proceso principal corre en Node y usa
  // require() directamente, sin pasar por Vite.
  root: rutaDe('./src/renderer'),
  base: './',
  plugins: [react()],
  build: {
    outDir: rutaDe('./dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
