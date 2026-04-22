[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$IncludeDocker,
  [switch]$IncludeWindowsComponentCleanup,
  [switch]$SkipRecycleBin
)

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-FreeBytes {
  $drive = New-Object System.IO.DriveInfo("C")
  return $drive.AvailableFreeSpace
}

function Format-Size([long]$Bytes) {
  if ($Bytes -ge 1GB) {
    return ("{0:N2} GB" -f ($Bytes / 1GB))
  }

  if ($Bytes -ge 1MB) {
    return ("{0:N2} MB" -f ($Bytes / 1MB))
  }

  return ("{0:N0} B" -f $Bytes)
}

function Clear-DirectoryContents {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "[skip] $Path (not found)"
    return
  }

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  if ([string]::IsNullOrWhiteSpace($resolved)) {
    Write-Host "[skip] $Path (cannot resolve)"
    return
  }

  Write-Host "[clean] $resolved"
  Get-ChildItem -LiteralPath $resolved -Force -ErrorAction SilentlyContinue | ForEach-Object {
    if ($PSCmdlet.ShouldProcess($_.FullName, "Remove")) {
      try {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
      } catch {
        Write-Host ("[warn] failed: " + $_.FullName)
      }
    }
  }
}

function Clear-IfExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (Test-Path -LiteralPath $Path) {
    Clear-DirectoryContents -Path $Path
  }
}

function Invoke-DockerCleanup {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) {
    Write-Host "[skip] docker not found"
    return
  }

  if ($PSCmdlet.ShouldProcess("Docker builder cache", "docker builder prune -a -f")) {
    docker builder prune -a -f | Out-Host
  }

  if ($PSCmdlet.ShouldProcess("Dangling Docker images", "docker image prune -f")) {
    docker image prune -f | Out-Host
  }
}

function Invoke-WindowsComponentCleanup {
  if ($PSCmdlet.ShouldProcess("Windows component store", "DISM StartComponentCleanup")) {
    Dism.exe /Online /Cleanup-Image /StartComponentCleanup | Out-Host
  }
}

$before = Get-FreeBytes
Write-Host ("C: free before: " + (Format-Size $before))

$paths = @(
  "$env:LOCALAPPDATA\Temp",
  "C:\Windows\Temp",
  "C:\Windows\SoftwareDistribution\Download",
  "$env:LOCALAPPDATA\npm-cache",
  "$env:LOCALAPPDATA\pip\Cache",
  "$env:APPDATA\Code\CachedExtensionVSIXs",
  "$env:APPDATA\Code\Crashpad",
  "$env:APPDATA\Code\logs",
  "$env:APPDATA\Code\Cache",
  "$env:APPDATA\Code\CachedData",
  "$env:APPDATA\Code\GPUCache",
  "$env:APPDATA\Code\Code Cache",
  "$env:APPDATA\Code\DawnGraphiteCache",
  "$env:APPDATA\Code\DawnWebGPUCache",
  "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Cache",
  "$env:USERPROFILE\.m2\repository",
  "$env:USERPROFILE\.cargo\registry",
  "$env:USERPROFILE\.nuget\packages"
)

foreach ($path in $paths) {
  Clear-IfExists -Path $path
}

$jetbrainsRoots = Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\JetBrains" -Force -Directory -ErrorAction SilentlyContinue
foreach ($root in $jetbrainsRoots) {
  foreach ($child in @("caches", "index", "log", "jcef_cache", "tmp", "global-model-cache")) {
    Clear-IfExists -Path (Join-Path $root.FullName $child)
  }
}

if (-not $SkipRecycleBin) {
  try {
    if ($PSCmdlet.ShouldProcess("Recycle Bin (C:)", "Clear-RecycleBin")) {
      Clear-RecycleBin -DriveLetter C -Force -ErrorAction Stop
    }
  } catch {
    Write-Host "[warn] failed to clear recycle bin"
  }
}

if ($IncludeDocker) {
  Invoke-DockerCleanup
}

if ($IncludeWindowsComponentCleanup) {
  if (-not (Test-IsAdministrator)) {
    Write-Host "[warn] Windows component cleanup requires administrator privileges"
  } else {
    Invoke-WindowsComponentCleanup
  }
}

$after = Get-FreeBytes
$released = $after - $before

Write-Host ("C: free after : " + (Format-Size $after))
Write-Host ("Released      : " + (Format-Size $released))
