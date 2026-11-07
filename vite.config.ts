import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Rutas relativas: funciona en GitHub Pages o en cualquier subcarpeta.
  base: './',
  build:
    mode === 'claude'
      ? {
          // Versión para claude.ai: todo en un solo archivo JS y CSS que luego
          // se mete dentro de una única página HTML (scripts/build-claude.mjs).
          outDir: 'dist-claude',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          modulePreload: false,
        }
      : {},
  test: {
    include: ['src/**/*.test.ts'],
  },
}));
