import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: funciona en GitHub Pages o en cualquier subcarpeta.
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
  },
});
