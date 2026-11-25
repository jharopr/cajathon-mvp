$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
npm ci
if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación Node' }
if (-not (Test-Path -LiteralPath '.env')) {
    $demoConfig = Get-Content -LiteralPath '.env.example' -Raw
    $demoToken = [guid]::NewGuid().ToString('N')
    $demoConfig.Replace('DEMO_COORDINATOR_TOKEN=', "DEMO_COORDINATOR_TOKEN=$demoToken") | Set-Content -LiteralPath '.env' -Encoding utf8
}
docker compose up -d --wait db
if ($LASTEXITCODE -ne 0) { throw 'Inicia Docker Desktop y vuelve a ejecutar setup.ps1' }
npm run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Fallaron las migraciones' }
npm run db:seed
if ($LASTEXITCODE -ne 0) { throw 'Falló el seed' }
npm run data:export
Write-Host 'Listo. Configura GEMINI_API_KEY en .env. Ejecuta npm run dev.'

