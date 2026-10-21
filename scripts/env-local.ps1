<#
  .DESCRIPTION
    Aplica as variaveis de ambiente que mantem o toolchain do LensClick no disco D:,
    evitando escrita no SSD (C:).

  .USAGE
    powershell -ExecutionPolicy Bypass -File scripts\env-local.ps1

  .NOTES
    Idempotente: pode ser executado quantas vezes for preciso.
    Requer uma sessao nova do terminal (ou do app) para a herdanca de variaveis
    ter efeito nos processos ja em execucao.

    Contexto: o projeto nao tem dependencias de runtime, mas o toolchain de
    desenvolvimento (Node, npm, Playwright, wrangler e o proprio OpenCode)
    escreve cache, logs e temporarios. Sem estas variaveis, tudo cai em
    %TEMP%, %LOCALAPPDATA% e %APPDATA% (C:).
#>
[CmdletBinding()]
param(
  [string]$Drive = 'D:',
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Write-Status($msg) { if (-not $Quiet) { Write-Host $msg } }

$root = $Drive
$map = [ordered]@{
  # Node.js portable e o cache/prefixo do npm
  'NPM_CONFIG_CACHE'        = "$root\npm-cache"
  'NPM_CONFIG_PREFIX'       = "$root\nodejs"
  # Temporarios do sistema (wrangler, esbuild, node, playwright)
  'TEMP'                    = "$root\temp"
  'TMP'                     = "$root\temp"
  # Navegadores do Playwright (evita ~600 MB em %LOCALAPPDATA%)
  'PLAYWRIGHT_BROWSERS_PATH' = "$root\playwright-browsers"
  # Config global do git (inclui user.name, user.email e safe.directory)
  'GIT_CONFIG_GLOBAL'       = "$root\gitconf\config"
}

# Os diretorios XDG so podem ser apontados para o D: DEPOIS que os dados
# tiverem sido migrados. Aponte-los antes faria o OpenCode iniciar com um
# banco de dados vazio e perder as sessoes existentes.
$xdg = [ordered]@{
  'XDG_DATA_HOME'   = "$root\opencode\data"
  'XDG_CONFIG_HOME' = "$root\opencode\config"
  'XDG_STATE_HOME'  = "$root\opencode\state"
  'XDG_CACHE_HOME'  = "$root\opencode\cache"
}
$xdgMigrated = $false
$dbCandidate = "$root\opencode\data\opencode\opencode.db"
if (Test-Path $dbCandidate) {
  # O banco migrado tem dezenas de MB. Um esqueleto vazio de pastas nao conta.
  $xdgMigrated = ((Get-Item $dbCandidate).Length -gt 1MB)
}

foreach ($dir in @(
  "$root\npm-cache", "$root\nodejs", "$root\temp", "$root\playwright-browsers",
  "$root\opencode\data", "$root\opencode\config", "$root\opencode\state",
  "$root\opencode\cache", "$root\gitconf"
)) {
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

foreach ($key in $map.Keys) {
  $current = [Environment]::GetEnvironmentVariable($key, 'User')
  if ($current -ne $map[$key]) {
    [Environment]::SetEnvironmentVariable($key, $map[$key], 'User')
    Set-Item -Path "Env:$key" -Value $map[$key]
    Write-Status "  definido: $key = $($map[$key])"
  } else {
    Write-Status "  ja correto: $key"
  }
}

if ($xdgMigrated) {
  foreach ($key in $xdg.Keys) {
    $current = [Environment]::GetEnvironmentVariable($key, 'User')
    if ($current -ne $xdg[$key]) {
      [Environment]::SetEnvironmentVariable($key, $xdg[$key], 'User')
      Set-Item -Path "Env:$key" -Value $xdg[$key]
      Write-Status "  definido: $key = $($xdg[$key])"
    } else {
      Write-Status "  ja correto: $key"
    }
  }
} else {
  Write-Status ''
  Write-Status '  AVISO: os dados do OpenCode ainda estao no C:.'
  Write-Status '  XDG_* NAO foi alterado de proposito: aponta-lo antes da migracao faria'
  Write-Status '  o OpenCode iniciar com um banco vazio e perder as sessoes existentes.'
  Write-Status '  Para migrar: feche o app OpenCode e execute D:\opencode\opencode-migrate.ps1'
}

# O Node precisa estar no PATH do usuario.
$nodeDir = "$root\nodejs"
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not $userPath) { $userPath = '' }
if ($userPath -notlike "*$nodeDir*") {
  [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $nodeDir).TrimStart(';'), 'User')
  Write-Status "  PATH do usuario: incluido $nodeDir"
} else {
  Write-Status "  PATH do usuario: $nodeDir ja presente"
}

Write-Status ''
Write-Status 'Ambiente pronto. Abra um novo terminal para que a herdanca valha.'
Write-Status "Verificacao: node -> $(Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)"
