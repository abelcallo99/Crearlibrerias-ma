<p align="center">
  <img src="docs/banner.svg" alt="Canalia: librerías grandMA2 desde una foto del manual" width="720">
</p>

**Canalia** crea librerías (fixture types) de **grandMA2** a partir de una foto de la tabla DMX del manual de un aparato.

Haces una foto a la tabla de canales, la IA (Claude) la lee, revisas los canales en una tabla editable y descargas el XML listo para importar en la consola o en grandMA2 onPC.

El nombre viene de *canales*: la tabla DMX del manual es una lista de canales, y Canalia la convierte en una librería para la consola. El logo representa lo mismo: las filas de la hoja del manual salen de la página convertidas en faders.

## Cómo funciona

1. **Foto del manual.** Sube una o varias fotos (o el PDF) de la tabla DMX. En el móvil, el botón «Hacer foto» abre la cámara.
2. **Revisa los canales.** La IA devuelve cada modo DMX con sus canales, el canal fine de 16 bit, el atributo de grandMA2, el valor por defecto y los rangos DMX (ruedas de color, gobos, estrobo, programas…). Todo se puede corregir. Canalia avisa de canales repetidos, atributos duplicados y rangos raros.
3. **Descarga.** Un archivo XML por modo, con el nombre de la librería de MA: `fabricante@aparato@modo.xml`.

También puedes **crear un aparato a mano** o **ver un ejemplo** sin API key.

## Usarlo

Hay dos versiones con la misma interfaz:

| | Lectura de la foto | Descarga |
| --- | --- | --- |
| **En claude.ai** | Con tu cuenta de Claude, sin API key | Un ZIP con los XML |
| **Web normal** (GitHub Pages o tu ordenador) | Con tu API key de Anthropic | Los XML directamente; también admite PDF |

### En claude.ai

Canalia está publicada como página de claude.ai: <https://claude.ai/artifact/9STLEqs1iHisZoPBKbHEXE>

- Al pulsar «Leer con Claude», claude.ai pide permiso la primera vez y la lectura gasta el uso de tu propio plan de Claude.
- El enlace es privado hasta que su dueño lo comparte desde el menú *Share* de la página. Cada persona que lo abra lee con su propia cuenta.
- Las páginas de claude.ai no pueden guardar archivos `.xml`, así que la descarga es un ZIP con los XML dentro.
- Solo admite fotos o capturas (JPG, PNG, WebP), no PDF. claude.ai reduce cada imagen, así que Canalia corta las fotos grandes en tiras que se solapan para que la letra pequeña se siga leyendo.

Para regenerar esa página después de cambiar el código: `npm run build:claude` crea `dist-claude/canalia.html`, que se vuelve a publicar en la misma dirección.

### En la web

El workflow `.github/workflows/deploy.yml` publica la app en GitHub Pages cada vez que se hace push a `main`. Para activarlo: en GitHub, *Settings → Pages → Build and deployment → Source: GitHub Actions*.

### En tu ordenador

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # pruebas del generador XML y de la lectura con IA
npm run build    # genera la web estática en dist/
npm run build:claude  # genera la página de claude.ai en dist-claude/canalia.html
```

### API key de Anthropic

La lectura de la foto usa el modelo `claude-opus-5-5` de Anthropic con visión. Necesitas tu propia API key, que puedes crear en [console.anthropic.com](https://console.anthropic.com/settings/keys).

- La clave se introduce en la app («Añadir API key») y la petición sale directamente de tu navegador a `api.anthropic.com`. No pasa por ningún otro servidor.
- Si marcas «Recordar en este navegador», se guarda en el `localStorage` de ese navegador. Si usas un ordenador compartido, no la marques.
- Cada lectura cuesta unos céntimos de dólar (depende del número de fotos y de canales). La app muestra el coste aproximado después de cada lectura.
- La petición tiene activada la reserva automática del servidor (`fallbacks: "default"`): si el modelo rechazara la petición por sus filtros de seguridad, la API la reintenta con otro modelo.

## Importar en grandMA2

1. Copia el XML en un USB, en la carpeta `gma2/library`. En grandMA2 onPC, la carpeta es `C:\ProgramData\MA Lighting Technologies\grandma\gma2_V_<versión>\library`.
2. En la consola: *Setup → Patch & Fixture Schedule → Add New Fixtures → Fixture Type → Import* y elige el archivo en la librería de usuario.
3. Abre el fixture type en el **Fixture Type Editor** y compruébalo antes de usarlo en un show.

**Controlar onPC con Claude.** [`docs/grandma2-mcp-windows.md`](docs/grandma2-mcp-windows.md) explica cómo conectar Claude con grandMA2 onPC mediante el MCP [gma2-mcp](https://github.com/chienchuanw/gma2-mcp). El instalador [`windows/instalar.ps1`](windows/instalar.ps1) lo deja listo con un solo comando.

## Qué genera

El XML sigue la estructura de los fixture types que exporta una grandMA2 3.9.60. Se ha comparado con exportaciones reales de consolas.

- **Un fixture type por modo DMX.**
- **Canales de 16 bit** con `coarse` y `fine`. Pan y tilt se centran en 32767.5, y el recorrido en grados se pasa a `physfrom`/`physto`.
- **Rangos del manual** como *channel sets* (nombre + valores DMX). En canales de 16 bit los rangos de 8 bit se pasan a 16 bit.
- **Barras LED y aparatos con píxeles**: los canales con número de *celda* 1, 2, 3… se agrupan en módulos e instancias, como hace grandMA2 con los aparatos multicelda.

### Atributos

| En Canalia | Atributo grandMA2 | Preset type |
| --- | --- | --- |
| Dimmer | `DIM` | Dimmer |
| Pan / Tilt | `PAN`, `TILT` | Position |
| Velocidad pan/tilt | `POSITIONMSPEED` | Control |
| Rojo, Verde, Azul | `COLORRGB1`, `COLORRGB2`, `COLORRGB3` | Color |
| Blanco, Ámbar, UV | `COLORRGB5`, `COLORRGB4`, `COLORRGB6` | Color |
| Cian, Magenta, Amarillo (CMY) | `COLORRGB1`, `COLORRGB2`, `COLORRGB3` invertidos | Color |
| CTO | `CTO` | Color |
| Ruedas de color | `COLOR1`, `COLOR2` | Color |
| Macros de color y su velocidad | `COLORMIXER`, `COLORMIXMACRORATE` | Color |
| Ruedas de gobos y su rotación | `GOBO1`, `GOBO1_POS`, `GOBO2`, `GOBO2_POS` | Gobo |
| Rueda de efectos | `EFFECTWHEEL` | Beam |
| Shutter / estrobo | `SHUTTER` | Beam |
| Iris, prisma, rotación de prisma, frost | `IRIS`, `PRISMA1`, `PRISMA1_POS`, `FROST` | Beam |
| Programas internos y su velocidad | `EFFECTMACROS`, `EFFECTSPEED` | Beam |
| Zoom, foco | `ZOOM`, `FOCUS` | Focus |
| Control / reset | `FIXTUREGLOBALRESET` | Control |
| Modo (auto, sonido…) | `MODE` | Control |
| Curva de dimmer | `DIMMERCURVE` | Control |
| Sin función | `DUMMY` | Control |

## Límites que conviene conocer

- **Revisa siempre el resultado.** La IA puede leer mal un número si la foto está borrosa. Las notas de la lectura señalan las dudas, pero comprueba los valores DMX con el manual.
- **Ruedas de color y gobos** se generan como *channel sets* con nombre, sin definir los slots de la rueda (`Wheels` va vacío, igual que en muchas librerías exportadas). Si quieres los colores de cada slot en la consola, añádelos en el Fixture Type Editor.
- **Ámbar, UV y CMY**: el mapeo a `COLORRGB4`, `COLORRGB6` y a RGB invertido es el habitual en grandMA2, pero conviene comprobar la mezcla de color en la consola con esos aparatos.
- Solo genera fixture types de **grandMA2**, no de grandMA3 ni GDTF.

## Estructura del código

| Archivo | Qué hace |
| --- | --- |
| `src/catalog.ts` | Catálogo de atributos de grandMA2 (atributo, feature, preset type, nombres). |
| `src/ma2xml.ts` | Generador y validación del XML de grandMA2. |
| `src/reading.ts` | Instrucciones de lectura y limpieza de la respuesta de la IA (comunes a las dos versiones). |
| `src/extract.ts` | Lectura con la API de Anthropic y tu API key (versión web). |
| `src/claudeRuntime.ts` | Lectura con tu cuenta de Claude y descarga en ZIP (versión de claude.ai). |
| `src/zip.ts` | ZIP sin compresión para la descarga en claude.ai. |
| `src/image.ts` | Redimensiona las fotos en el navegador antes de enviarlas. |
| `src/main.ts`, `src/styles.css` | Interfaz web. |
| `public/logo.svg`, `docs/banner.svg` | Logo y banner. |

---

Canalia no está afiliada a MA Lighting. grandMA2 es una marca de MA Lighting Technology GmbH.
