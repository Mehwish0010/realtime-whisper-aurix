# AURIX Voice Assistant - Whisper.cpp Setup Script
# Run this with: powershell -ExecutionPolicy Bypass -File setup-whisper.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AURIX Voice Assistant Setup" -ForegroundColor Cyan
Write-Host "  Whisper.cpp + Model Downloader" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Create directories
Write-Host "[1/4] Creating directories..." -ForegroundColor Yellow
$whisperDir = "whisper"
$modelsDir = "whisper\models"
$tempDir = "whisper\temp"

if (-not (Test-Path $whisperDir)) {
    New-Item -ItemType Directory -Path $whisperDir | Out-Null
}
if (-not (Test-Path $modelsDir)) {
    New-Item -ItemType Directory -Path $modelsDir | Out-Null
}
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}
Write-Host "   Directories created!" -ForegroundColor Green

# Check FFmpeg
Write-Host ""
Write-Host "[2/4] Checking FFmpeg installation..." -ForegroundColor Yellow
try {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-String "ffmpeg version" | Select-Object -First 1
    Write-Host "   FFmpeg found: $ffmpegVersion" -ForegroundColor Green
} catch {
    Write-Host "   WARNING: FFmpeg not found!" -ForegroundColor Red
    Write-Host "   Install FFmpeg from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    Write-Host "   Or use Chocolatey: choco install ffmpeg" -ForegroundColor Yellow
}

# Download Whisper.cpp binary
Write-Host ""
Write-Host "[3/4] Downloading Whisper.cpp..." -ForegroundColor Yellow
$whisperExe = "$whisperDir\whisper.exe"

if (Test-Path $whisperExe) {
    Write-Host "   Whisper.exe already exists!" -ForegroundColor Green
    $overwrite = Read-Host "   Overwrite? (y/n)"
    if ($overwrite -ne "y") {
        Write-Host "   Skipping whisper.exe download" -ForegroundColor Yellow
        $skipWhisper = $true
    }
}

if (-not $skipWhisper) {
    Write-Host "   Please download whisper.cpp manually from:" -ForegroundColor Cyan
    Write-Host "   https://github.com/ggerganov/whisper.cpp/releases" -ForegroundColor Cyan
    Write-Host "   Extract and place the executable as: $whisperExe" -ForegroundColor Cyan
    Write-Host ""
    $continue = Read-Host "   Have you placed whisper.exe? (y/n)"
    if ($continue -ne "y") {
        Write-Host "   Setup incomplete. Run this script again after downloading." -ForegroundColor Red
        exit
    }
}

# Download Whisper model
Write-Host ""
Write-Host "[4/4] Downloading Whisper model..." -ForegroundColor Yellow

# Model selection
Write-Host "   Available models:" -ForegroundColor Cyan
Write-Host "   1. tiny  (75 MB)  - Fastest, lower accuracy" -ForegroundColor White
Write-Host "   2. base  (142 MB) - Recommended" -ForegroundColor Green
Write-Host "   3. small (466 MB) - Better accuracy" -ForegroundColor White
$modelChoice = Read-Host "   Select model (1/2/3) [default: 2]"

if ([string]::IsNullOrEmpty($modelChoice)) {
    $modelChoice = "2"
}

$modelName = switch ($modelChoice) {
    "1" { "ggml-tiny.bin" }
    "3" { "ggml-small.bin" }
    default { "ggml-base.bin" }
}

$modelPath = "$modelsDir\$modelName"
$modelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$modelName"

if (Test-Path $modelPath) {
    Write-Host "   Model $modelName already exists!" -ForegroundColor Green
} else {
    Write-Host "   Downloading $modelName..." -ForegroundColor Yellow
    Write-Host "   This may take a few minutes..." -ForegroundColor Cyan

    try {
        Invoke-WebRequest -Uri $modelUrl -OutFile $modelPath -UseBasicParsing
        Write-Host "   Model downloaded successfully!" -ForegroundColor Green
    } catch {
        Write-Host "   ERROR: Failed to download model!" -ForegroundColor Red
        Write-Host "   Please download manually from: $modelUrl" -ForegroundColor Yellow
        Write-Host "   Save as: $modelPath" -ForegroundColor Yellow
    }
}

# Verify setup
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$allGood = $true

if (Test-Path $whisperExe) {
    Write-Host "   Whisper.exe: OK" -ForegroundColor Green
} else {
    Write-Host "   Whisper.exe: MISSING" -ForegroundColor Red
    $allGood = $false
}

if (Test-Path $modelPath) {
    $modelSize = (Get-Item $modelPath).Length / 1MB
    Write-Host "   Model file: OK ($([math]::Round($modelSize, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "   Model file: MISSING" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""
if ($allGood) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Setup Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Run: npm install" -ForegroundColor White
    Write-Host "2. Run: npm run dev" -ForegroundColor White
    Write-Host "3. Open the app and start recording!" -ForegroundColor White
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  Setup Incomplete" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please complete missing steps above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
