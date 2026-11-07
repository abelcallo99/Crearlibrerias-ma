# Instalador de gma2-mcp + Canalia para Windows
#
# Prepara el PC donde esta grandMA2 onPC para que Claude lo controle:
#   1. Busca grandMA2 onPC.
#   2. Instala uv y Python 3.12 si faltan.
#   3. Descarga gma2-mcp (MCP de codigo abierto, Apache 2.0) e instala sus dependencias.
#   4. Lo registra en Claude Desktop y, si esta instalado, en Claude Code.
#   5. Copia los XML de prueba de Canalia a la libreria de onPC.
#   6. Comprueba si onPC acepta conexiones Telnet.
#
# Uso, en PowerShell (no hace falta ser administrador):
#   irm https://raw.githubusercontent.com/abelcallo99/Crearlibrerias-ma/claude/magical-goodall-ji9z2x/windows/instalar.ps1 | iex
#
# Se puede ejecutar otra vez sin problema: lo que ya esta hecho se salta.
# El archivo es solo ASCII a proposito: Windows PowerShell 5.1 lee mal los
# acentos de un .ps1 en UTF-8 sin BOM.

function Install-Gma2Mcp {
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'  # la barra de progreso hace muy lentas las descargas en PowerShell 5.1
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    if ($PSVersionTable.PSVersion.Major -lt 6) {
        # Evita que Windows PowerShell 5.1 escriba las listas del JSON como {"value": [...], "Count": n}.
        Remove-TypeData System.Array -ErrorAction SilentlyContinue
    }

    # Version de gma2-mcp revisada (rama dev, 2026-06-29).
    $Gma2Commit = '35fea2a6ef231716ad623abb1f8d7b138a4afdc8'
    $Gma2Dir = Join-Path $env:USERPROFILE 'gma2-mcp'
    $RepoRaw = 'https://raw.githubusercontent.com/abelcallo99/Crearlibrerias-ma/claude/magical-goodall-ji9z2x'
    $Ejemplos = @(
        'ejemplo@par_led_18x10_rgbw@8ch.xml',
        'ejemplo@beam_230@16ch.xml',
        'ejemplo@barra_led_4_secciones_rgb@14ch.xml'
    )
    # onPC en este mismo PC, con el usuario y la clave de fabrica.
    $McpEnv = [ordered]@{
        GMA_HOST     = '127.0.0.1'
        GMA_PORT     = '30000'
        GMA_USER     = 'administrator'
        GMA_PASSWORD = 'admin'
    }
    $McpArgs = @('--directory', $Gma2Dir, 'run', 'python', '-m', 'src.server')
    $Pendiente = New-Object System.Collections.Generic.List[string]

    function Write-Paso($texto) { Write-Host ''; Write-Host "== $texto" -ForegroundColor Cyan }
    function Write-Ok($texto) { Write-Host "   OK  $texto" -ForegroundColor Green }
    function Write-Aviso($texto) { Write-Host "   !!  $texto" -ForegroundColor Yellow }

    # ------------------------------------------------------------------ 1
    Write-Paso '1/6  grandMA2 onPC'
    $MaRoot = 'C:\ProgramData\MA Lighting Technologies\grandma'
    $MaVersiones = @()
    if (Test-Path $MaRoot) {
        $MaVersiones = @(Get-ChildItem $MaRoot -Directory -Filter 'gma2_V_*' | Sort-Object Name)
    }
    if ($MaVersiones.Count -gt 0) {
        foreach ($v in $MaVersiones) { Write-Ok "Encontrado: $($v.FullName)" }
    } else {
        Write-Aviso "No encuentro grandMA2 onPC en $MaRoot"
        $Pendiente.Add('Instalar grandMA2 onPC y ejecutar otra vez este instalador para copiar los XML de prueba.')
    }

    # ------------------------------------------------------------------ 2
    Write-Paso '2/6  uv y Python 3.12'
    $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
    if (-not $uvCmd) {
        Write-Host '   Instalando uv (instalador oficial de astral.sh)...'
        powershell -NoProfile -ExecutionPolicy ByPass -Command 'irm https://astral.sh/uv/install.ps1 | iex'
        foreach ($d in @((Join-Path $env:USERPROFILE '.local\bin'), (Join-Path $env:USERPROFILE '.cargo\bin'))) {
            if ((Test-Path (Join-Path $d 'uv.exe')) -and ($env:Path -notlike "*$d*")) { $env:Path = "$d;$env:Path" }
        }
        $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
    }
    if (-not $uvCmd) {
        Write-Aviso 'No pude instalar uv. Cierra PowerShell, abrelo de nuevo y vuelve a ejecutar el instalador.'
        return
    }
    $Uv = $uvCmd.Source
    Write-Ok "uv: $Uv"
    & $Uv python install 3.12
    if ($LASTEXITCODE -ne 0) { Write-Aviso 'uv no pudo instalar Python 3.12. Copia el error de arriba.'; return }
    Write-Ok 'Python 3.12 listo'

    # ------------------------------------------------------------------ 3
    Write-Paso '3/6  gma2-mcp'
    if (Test-Path (Join-Path $Gma2Dir 'src\server.py')) {
        Write-Ok "Ya estaba descargado en $Gma2Dir"
    } else {
        if (Test-Path $Gma2Dir) {
            $viejo = "$Gma2Dir.viejo-$(Get-Date -Format yyyyMMdd-HHmmss)"
            Move-Item $Gma2Dir $viejo
            Write-Aviso "Habia una carpeta gma2-mcp incompleta; la movi a $viejo"
        }
        $zip = Join-Path $env:TEMP "gma2-mcp-$Gma2Commit.zip"
        $tmp = Join-Path $env:USERPROFILE "gma2-mcp-descarga"
        Write-Host '   Descargando gma2-mcp de GitHub...'
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/chienchuanw/gma2-mcp/archive/$Gma2Commit.zip" -OutFile $zip
        if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
        Expand-Archive -Path $zip -DestinationPath $tmp -Force
        # El ZIP trae una carpeta gma2-mcp-<commit>; se mueve entera (con .python-version) a su sitio.
        $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
        Move-Item $src.FullName $Gma2Dir
        Remove-Item $tmp, $zip -Recurse -Force
        Write-Ok "Descargado en $Gma2Dir"
    }
    Write-Host '   Instalando dependencias (uv sync)...'
    & $Uv --directory $Gma2Dir sync
    if ($LASTEXITCODE -ne 0) { Write-Aviso 'uv sync fallo. Copia el error de arriba.'; return }
    Write-Ok 'Dependencias instaladas'

    # ------------------------------------------------------------------ 4
    Write-Paso '4/6  Registrar el MCP en Claude'
    $carpetas = @()
    $normal = Join-Path $env:APPDATA 'Claude'
    if (Test-Path $normal) { $carpetas += $normal }
    # Claude Desktop instalado desde Microsoft Store guarda su configuracion en otra carpeta:
    $tienda = Join-Path $env:LOCALAPPDATA 'Packages'
    if (Test-Path $tienda) {
        $carpetas += @(Get-ChildItem $tienda -Directory -Filter 'Claude*' -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'LocalCache\Roaming\Claude' } |
            Where-Object { Test-Path $_ })
    }
    if ($carpetas.Count -eq 0) {
        New-Item -ItemType Directory -Force -Path $normal | Out-Null
        $carpetas = @($normal)
        Write-Aviso 'No encuentro Claude Desktop; dejo la configuracion lista para cuando lo instales.'
    }

    foreach ($dir in $carpetas) {
        $cfg = Join-Path $dir 'claude_desktop_config.json'
        $obj = New-Object PSObject
        if (Test-Path $cfg) {
            $texto = [IO.File]::ReadAllText($cfg)
            if ($texto.Trim()) {
                try { $obj = $texto | ConvertFrom-Json }
                catch {
                    Write-Aviso "No puedo leer $cfg (el JSON tiene errores). No lo toco."
                    $Pendiente.Add("Registrar gma2 a mano en $cfg (ver docs\grandma2-mcp-windows.md del repo).")
                    continue
                }
            }
            $copia = "$cfg.copia-$(Get-Date -Format yyyyMMdd-HHmmss)"
            Copy-Item $cfg $copia
            Write-Ok "Copia de seguridad: $copia"
        }
        if (-not ($obj.PSObject.Properties.Name -contains 'mcpServers') -or $null -eq $obj.mcpServers) {
            $obj | Add-Member -NotePropertyName mcpServers -NotePropertyValue (New-Object PSObject) -Force
        }
        $servidor = [pscustomobject]@{
            command = $Uv
            args    = $McpArgs
            env     = [pscustomobject]$McpEnv
        }
        $obj.mcpServers | Add-Member -NotePropertyName gma2 -NotePropertyValue $servidor -Force
        # Sin BOM: Claude Desktop no lee un JSON que empieza con BOM.
        [IO.File]::WriteAllText($cfg, ($obj | ConvertTo-Json -Depth 32), (New-Object Text.UTF8Encoding $false))
        Write-Ok "Claude Desktop: gma2 registrado en $cfg"
    }

    if (Get-Command claude -ErrorAction SilentlyContinue) {
        $ErrorActionPreference = 'Continue'
        & claude mcp remove gma2 --scope user 2>$null | Out-Null
        $envArgs = @()
        foreach ($k in $McpEnv.Keys) { $envArgs += @('-e', "$k=$($McpEnv[$k])") }
        & claude mcp add gma2 --scope user @envArgs -- $Uv @McpArgs
        $codigo = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($codigo -eq 0) { Write-Ok 'Claude Code: gma2 registrado' }
        else { Write-Aviso 'Claude Code no acepto el registro; mira el mensaje de arriba.' }
    } else {
        Write-Host '   (Claude Code no esta instalado; solo se registra en Claude Desktop.)'
    }

    # ------------------------------------------------------------------ 5
    Write-Paso '5/6  XML de prueba de Canalia en la libreria de onPC'
    if ($MaVersiones.Count -eq 0) {
        Write-Aviso 'Me lo salto porque no hay grandMA2 onPC.'
    } else {
        $local = $null
        if ($PSScriptRoot) {
            $candidato = Join-Path (Split-Path $PSScriptRoot -Parent) 'ejemplos'
            if (Test-Path $candidato) { $local = $candidato }
        }
        foreach ($v in $MaVersiones) {
            $lib = Join-Path $v.FullName 'library'
            New-Item -ItemType Directory -Force -Path $lib | Out-Null
            foreach ($f in $Ejemplos) {
                $destino = Join-Path $lib $f
                if ($local) {
                    Copy-Item (Join-Path $local $f) $destino -Force
                } else {
                    Invoke-WebRequest -UseBasicParsing -Uri ("$RepoRaw/ejemplos/" + [Uri]::EscapeDataString($f)) -OutFile $destino
                }
            }
            Write-Ok "3 XML copiados en $lib"
        }
    }

    # ------------------------------------------------------------------ 6
    Write-Paso '6/6  Telnet de onPC (puerto 30000)'
    $abierto = $false
    $tcp = New-Object Net.Sockets.TcpClient
    try {
        $intento = $tcp.BeginConnect('127.0.0.1', 30000, $null, $null)
        if ($intento.AsyncWaitHandle.WaitOne(2000) -and $tcp.Connected) { $abierto = $true }
    } catch { } finally { $tcp.Close() }
    if ($abierto) {
        Write-Ok 'onPC acepta conexiones Telnet'
    } else {
        Write-Aviso 'onPC no responde en el puerto 30000 (esta cerrado o tiene Telnet desactivado).'
        $Pendiente.Add('Abrir grandMA2 onPC con un show y activar Telnet: Setup > Console > Global Settings > Telnet = Login Enabled.')
    }

    # ------------------------------------------------------------------ fin
    $Pendiente.Add('Cerrar Claude Desktop del todo (tambien el icono junto al reloj) y abrirlo otra vez.')
    $Pendiente.Add('Pedirle a Claude: "Lista los fixtures del show de grandMA2".')
    Write-Host ''
    Write-Host '== Listo. Solo falta esto:' -ForegroundColor Cyan
    $i = 1
    foreach ($p in $Pendiente) { Write-Host "   $i. $p"; $i++ }
    Write-Host ''
}

try {
    Install-Gma2Mcp
} catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Copia este mensaje y pasaselo a Claude.' -ForegroundColor Red
}
