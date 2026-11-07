// Construye la versión de Canalia para claude.ai: una sola página HTML con el
// CSS y el JS dentro (claude.ai no carga archivos de otros servidores).
import { build } from 'vite';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = 'dist-claude';
await build({ mode: 'claude', logLevel: 'warn' });

const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const js = files.filter((f) => f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));
if (js.length !== 1 || css.length !== 1) {
  throw new Error(`Se esperaba 1 JS y 1 CSS, hay: ${files.join(', ')}`);
}
const script = readFileSync(join(assets, js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = readFileSync(join(assets, css[0]), 'utf8').replace(/<\/style/gi, '<\\/style');

const page = `<title>Canalia</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Crea librerías (fixture types) de grandMA2 a partir de una foto de la tabla DMX del manual.">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${style}</style>
<div id="app"></div>
<script type="module">${script}</script>
`;
writeFileSync(join(outDir, 'canalia.html'), page);
console.log(`${join(outDir, 'canalia.html')}: ${(page.length / 1024).toFixed(1)} KB`);
