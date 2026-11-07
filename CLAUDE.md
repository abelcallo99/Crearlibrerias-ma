# Contexto del proyecto para Claude

Este archivo resume lo que se ha hecho y decidido hasta ahora, para que cualquier sesión de Claude (sobre todo una que corra **en el PC del usuario**, junto a grandMA2 onPC) siga el trabajo sin preguntar de nuevo lo ya respondido.

El usuario escribe en español (Perú), en mensajes cortos y a menudo desde el móvil, y quiere que se avance rápido. Responde en español.

## Qué es

**Canalia** crea librerías (fixture types) de **grandMA2** a partir de una foto de la tabla DMX del manual de un aparato. Detalles de uso, atributos y límites en el [README](README.md).

Decisiones del usuario (no volver a preguntarlas):

- **Nombre:** Canalia (de *canales*). Subtítulo: «Librerías grandMA2 desde una foto del manual».
- **Plataforma:** web en el navegador.
- **Lectura de la foto:** IA con visión (Claude).
- **Logo:** hoja de manual cuyas filas salen convertidas en faders ámbar, fondo oscuro de consola (`public/logo.svg`, `docs/banner.svg`).

## Estado

- Código completo en `src/`; `npm test` pasa (11 pruebas) y `npm run build` compila.
- Versión publicada en claude.ai, sin API key: <https://claude.ai/artifact/9STLEqs1iHisZoPBKbHEXE>. Se regenera con `npm run build:claude` (`dist-claude/canalia.html`) y se vuelve a publicar en la misma dirección.
- `ejemplos/`: tres XML de prueba para importar en onPC (ver `ejemplos/LEEME.md`).
- `docs/grandma2-mcp-windows.md`: guía para conectar Claude con grandMA2 onPC por Telnet usando [gma2-mcp](https://github.com/chienchuanw/gma2-mcp).
- `patch/plan-universos.csv`: plan de patch del usuario (ver abajo).

**Sin comprobar todavía:**

- La lectura con una cuenta o API key reales y una foto de verdad (solo se probó simulando la respuesta).
- La importación de los XML en una grandMA2 real.
- La guía del MCP en Windows. La ruta de Telnet (*Setup → Console → Global Settings → Telnet: Login Enabled*) es de memoria.

## El equipo del usuario

Tiene grandMA2 onPC instalado en un PC con Windows y quiere que Claude trabaje directamente en ese PC. Su plan de patch (leído de una foto de su hoja) son **55 aparatos de 11 tipos en 4 universos**, sin solapes:

| Universo | Aparato | Cantidad | DMX inicial | Canales |
|---|---|---|---|---|
| 1 | Tachos | 8 | 1, 9 … 57 | 8 |
| 1 | Stormys | 10 | 65, 104 … 416 | 39 |
| 2 | Cabeza 7R | 7 | 1, 17 … 97 | 16 |
| 2 | Cabeza 9RA | 1 | 113 | 16 |
| 2 | Cabeza 250W | 2 | 129, 153 | 24 |
| 2 | Cabeza Europro | 10 | 177, 201 … 393 | 24 |
| 2 | Cops | 1 | 417 | 24 |
| 3 | Matrix | 4 | 1, 76, 151, 226 | 75 |
| 3 | Mini Grut | 6 | 301, 322 … 406 | 21 |
| 4 | Largos | 4 | 1, 89, 177, 265 | 88 |
| 4 | Triángulos | 2 | 353, 417 | 64 |

## Pendiente

1. **Duda abierta:** en la hoja, los triángulos 3 a 6 del universo 4 aparecen con DMX 481 y sin canales. Con 64 canales, el 3.º ya no cabría en ese universo. ¿Son solo 2 triángulos, o los otros 4 van en otro universo?
2. **Fotos de las tablas DMX** de los 11 tipos (el modo que usa cada uno). Empezar por los que más se repiten: Stormys, Cabeza Europro, Tachos y Cabeza 7R. Con cada foto se genera su fixture type.
3. **Patch automático** (ofrecido, sin confirmar): que Canalia genere el patch completo de los 55 aparatos a partir de `patch/plan-universos.csv`, o hacerlo con el MCP de grandMA2.

## En el PC del usuario (Windows)

Orden sugerido para una sesión local:

1. Comprobar que grandMA2 onPC abre y crear un show de prueba.
2. Seguir `docs/grandma2-mcp-windows.md`: activar Telnet, instalar `uv` y Python 3.12, descargar gma2-mcp y registrarlo. Probar con «lista los fixtures del show».
3. Copiar `ejemplos/*.xml` a la carpeta `library` de onPC (`C:\ProgramData\MA Lighting Technologies\grandma\gma2_V_<versión>\library`), importarlos y anotar cualquier error exacto para corregir `src/ma2xml.ts`.
4. Con las librerías reales hechas, parchear según `patch/plan-universos.csv`.

## Comandos

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev           # http://localhost:5173
npm test
npm run build         # web estática en dist/
npm run build:claude  # página de claude.ai en dist-claude/canalia.html
```
