# Controlar grandMA2 onPC con Claude (Windows)

Esta guía conecta Claude con grandMA2 onPC en el mismo ordenador, usando el MCP de código abierto [gma2-mcp](https://github.com/chienchuanw/gma2-mcp) (licencia Apache 2.0). Claude manda órdenes a la línea de comandos de grandMA2 por Telnet: crear grupos, presets, cues, ejecutores, patch…

Todo esto se hace **en el PC donde está grandMA2 onPC**. Una sesión de Claude en la nube no puede llegar a tu onPC.

> No lo he podido probar en Windows desde aquí. Si algún paso falla, copia el mensaje de error exacto.

## 1. Activar Telnet en grandMA2 onPC

1. Abre grandMA2 onPC y crea o carga un show.
2. Ve a *Setup → Console → Global Settings* y pon **Telnet** en **Login Enabled**.

El usuario por defecto es `administrator` con contraseña `admin`. El puerto de órdenes es el **30000**.

## 2. Instalar Claude en el PC

Usa una de estas dos opciones:

- **Claude Desktop**: descárgalo de <https://claude.ai/download> e inicia sesión.
- **Claude Code**: la versión de terminal. Sirve para que Claude instale cosas y ejecute órdenes en tu PC por ti.

## 3. Instalar uv y Python 3.12

Abre PowerShell y ejecuta:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Cierra y vuelve a abrir PowerShell. Después:

```powershell
uv python install 3.12
```

## 4. Descargar gma2-mcp

Con Git instalado:

```powershell
cd $HOME
git clone https://github.com/chienchuanw/gma2-mcp
cd gma2-mcp
uv sync
```

Sin Git: descarga el ZIP desde la página del proyecto (*Code → Download ZIP*), descomprímelo en `C:\Users\<tu usuario>\gma2-mcp` y ejecuta `uv sync` dentro de esa carpeta.

## 5. Registrar el MCP

### En Claude Desktop

Abre (o crea) el archivo `%APPDATA%\Claude\claude_desktop_config.json` y pon esto, cambiando la ruta por la tuya (en JSON las barras invertidas van dobles):

```json
{
  "mcpServers": {
    "gma2": {
      "command": "uv",
      "args": ["--directory", "C:\\Users\\TU_USUARIO\\gma2-mcp", "run", "python", "-m", "src.server"],
      "env": {
        "GMA_HOST": "127.0.0.1",
        "GMA_PORT": "30000",
        "GMA_USER": "administrator",
        "GMA_PASSWORD": "admin"
      }
    }
  }
}
```

Cierra Claude Desktop del todo (también desde la bandeja del sistema) y vuelve a abrirlo.

### En Claude Code

```powershell
claude mcp add gma2 -e GMA_HOST=127.0.0.1 -e GMA_USER=administrator -e GMA_PASSWORD=admin -- uv --directory C:\Users\TU_USUARIO\gma2-mcp run python -m src.server
```

## 6. Probar

Con grandMA2 onPC abierto, pídele a Claude: «Lista los fixtures del show de grandMA2». Si responde con la lista (aunque esté vacía), la conexión funciona.

## Siguiente paso: el patch

El plan de universos está en [`patch/plan-universos.csv`](../patch/plan-universos.csv): 55 aparatos en 4 universos, sin solapes. Para parchearlos hace falta antes el fixture type de cada aparato, que se crea con Canalia a partir de la tabla DMX de su manual.
