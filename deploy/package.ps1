$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir  = "cloudflow-deploy-$timestamp"
$outputZip  = "cloudflow-deploy-$timestamp.zip"

Write-Host "[1/4] Build frontend..." -ForegroundColor Cyan
Remove-Item -Recurse -Force frontend\dist -ErrorAction SilentlyContinue
Set-Location frontend
npm install
npm run build
Set-Location ..

if (-not (Test-Path "frontend\dist\index.html")) {
    Write-Host "[ERROR] Frontend build failed - no dist/index.html" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] Prepare deploy files..." -ForegroundColor Cyan
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

# Backend source (Docker build will compile)
Copy-Item -Recurse backend\package.json        "$outputDir\backend\"
Copy-Item -Recurse backend\package-lock.json   "$outputDir\backend\"
Copy-Item -Recurse backend\tsconfig.json       "$outputDir\backend\"
Copy-Item -Recurse backend\prisma              "$outputDir\backend\prisma"
Copy-Item -Recurse backend\src                 "$outputDir\backend\src"
Copy-Item -Recurse backend\worker              "$outputDir\backend\worker"

# Frontend pre-built dist
Copy-Item -Recurse frontend\dist               "$outputDir\frontend\dist"

Write-Host "[3/4] Package to zip..." -ForegroundColor Cyan
Remove-Item -Force $outputZip -ErrorAction SilentlyContinue
Compress-Archive -Path $outputDir -DestinationPath $outputZip -Force

Write-Host "[4/4] Cleanup..." -ForegroundColor Green
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
