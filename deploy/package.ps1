$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir  = "cloudflow-deploy-$timestamp"
$outputZip  = "cloudflow-deploy-$timestamp.zip"

Write-Host "[1/5] Build frontend..." -ForegroundColor Cyan
Remove-Item -Recurse -Force frontend\dist -ErrorAction SilentlyContinue
Set-Location frontend
npm install
npm run build
Set-Location ..

if (-not (Test-Path "frontend\dist\index.html")) {
    Write-Host "[ERROR] Frontend build failed - no dist/index.html" -ForegroundColor Red
    exit 1
}

Write-Host "[2/5] Build backend..." -ForegroundColor Cyan
Remove-Item -Recurse -Force backend\dist -ErrorAction SilentlyContinue
Set-Location backend
npm install
npm run build
Set-Location ..

if (-not (Test-Path "backend\dist\src\main.js")) {
    Write-Host "[ERROR] Backend build failed - no dist/src/main.js" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] Prepare deploy files..." -ForegroundColor Cyan
Remove-Item -Recurse -Force $outputDir -ErrorAction SilentlyContinue

# Directory structure
New-Item -ItemType Directory -Force "$outputDir\deploy\nginx"  | Out-Null
New-Item -ItemType Directory -Force "$outputDir\backend"       | Out-Null
New-Item -ItemType Directory -Force "$outputDir\frontend\dist" | Out-Null

# Deploy configs
Copy-Item deploy\docker-compose.yml   "$outputDir\deploy\"
Copy-Item deploy\Dockerfile.backend   "$outputDir\deploy\"
Copy-Item deploy\Dockerfile.worker    "$outputDir\deploy\"
Copy-Item deploy\Dockerfile.frontend  "$outputDir\deploy\"
Copy-Item deploy\nginx\nginx.conf     "$outputDir\deploy\nginx\"
Copy-Item deploy\.env.example         "$outputDir\deploy\"
Copy-Item deploy\DEPLOY.md            "$outputDir\deploy\"

# Backend pre-built artifacts (docker only installs production deps)
Copy-Item -Recurse backend\package.json        "$outputDir\backend\"
Copy-Item -Recurse backend\package-lock.json   "$outputDir\backend\"
Copy-Item -Recurse backend\prisma              "$outputDir\backend\prisma"
Copy-Item -Recurse backend\dist                "$outputDir\backend\dist"

# Frontend pre-built dist
Copy-Item -Recurse frontend\dist               "$outputDir\frontend\dist"

Write-Host "[4/5] Package to zip..." -ForegroundColor Cyan
Remove-Item -Force $outputZip -ErrorAction SilentlyContinue
Compress-Archive -Path $outputDir -DestinationPath $outputZip -Force

Write-Host "[5/5] Cleanup..." -ForegroundColor Green
Remove-Item -Recurse -Force $outputDir

$sizeMB = [math]::Round((Get-Item $outputZip).Length / 1048576, 1)
Write-Host ""
Write-Host "  File: $outputZip ($sizeMB MB)"
Write-Host ""
Write-Host "  # Copy to target server, then:"
Write-Host "  unzip $outputZip -d /opt/cloudflow"
Write-Host "  cd /opt/cloudflow/cloudflow-deploy-$timestamp"
Write-Host "  cp deploy/.env.example deploy/.env"
Write-Host "  vi deploy/.env  # configure DATABASE_URL, REDIS_URL"
Write-Host "  docker compose -f deploy/docker-compose.yml up -d --build"
