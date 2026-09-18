# Video Pipeline - one-click launcher (PowerShell)
$ErrorActionPreference = "Stop"

$Host.UI.RawUI.WindowTitle = "Video Pipeline"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host " ========================================"
Write-Host "  Video Pipeline - Silence Trim + Cartoon"
Write-Host " ========================================"
Write-Host ""

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] WSL not found. Install Ubuntu from Microsoft Store, then retry." -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

function ConvertTo-WslPath([string]$WinPath) {
    $resolved = (Resolve-Path -LiteralPath $WinPath).Path
    if ($resolved -match '^([A-Za-z]):\\(.*)$') {
        $drive = $Matches[1].ToLower()
        $rest = $Matches[2].Replace('\', '/')
        return "/mnt/$drive/$rest"
    }
    throw "Unsupported path format: $resolved"
}

try {
    $wslDir = ConvertTo-WslPath $PSScriptRoot
}
catch {
    Write-Host "[ERROR] Could not resolve WSL path for: $PSScriptRoot" -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}

Write-Host "[1/2] Opening browser at http://127.0.0.1:8765/ ..."
Start-Job {
    Start-Sleep -Seconds 3
    Start-Process "http://127.0.0.1:8765/"
} | Out-Null

Write-Host "[2/2] Starting WSL server - keep this window open."
Write-Host ""
Write-Host "  Drop a video in the browser window."
Write-Host "  Final output: d:\karm\video_tutorial\{name}_final.mp4"
Write-Host "  Press Ctrl+C here to stop the server."
Write-Host ""

try {
    wsl.exe bash "$wslDir/launch.sh"
    if ($LASTEXITCODE -ne 0) { throw "Server exited with code $LASTEXITCODE" }
    exit 0
}
catch {
    Write-Host ""
    Write-Host "[ERROR] Something went wrong: $_" -ForegroundColor Red
    Read-Host "Press Enter to close"
    exit 1
}
