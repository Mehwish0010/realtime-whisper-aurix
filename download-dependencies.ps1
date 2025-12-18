# AURIX - Download All Dependencies Script
# This script downloads FFmpeg, Whisper.cpp, and Whisper model

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AURIX Complete Dependencies Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ErrorActionPreference = "Stop"

# Create directories
Write-Host "[1/4] Creating directories..." -ForegroundColor Yellow
$whisperDir = "whisper"
$modelsDir = "whisper\models"
$tempDir = "whisper\temp"
$binDir = "bin"

@($whisperDir, $modelsDir, $tempDir, $binDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ | Out-Null
    }
}
Write-Host "   Directories created!" -ForegroundColor Green

# Download FFmpeg
Write-Host ""
Write-Host "[2/4] Downloading FFmpeg..." -ForegroundColor Yellow

$ffmpegZip = "bin\ffmpeg.zip"
$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"

if (-not (Test-Path "bin\ffmpeg.exe")) {
    try {
        Write-Host "   Downloading FFmpeg from GitHub..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing

        Write-Host "   Extracting FFmpeg..." -ForegroundColor Cyan
        Expand-Archive -Path $ffmpegZip -DestinationPath "bin\temp" -Force

        # Find and copy ffmpeg.exe
        $ffmpegExe = Get-ChildItem -Path "bin\temp" -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
        if ($ffmpegExe) {
            Copy-Item $ffmpegExe.FullName -Destination "bin\ffmpeg.exe"
            Write-Host "   FFmpeg downloaded successfully!" -ForegroundColor Green
        }

        # Cleanup
        Remove-Item "bin\temp" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $ffmpegZip -Force -ErrorAction SilentlyContinue

    } catch {
        Write-Host "   ERROR: Failed to download FFmpeg automatically" -ForegroundColor Red
        Write-Host "   Please download manually from: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    }
} else {
    Write-Host "   FFmpeg already exists!" -ForegroundColor Green
}

# Download Whisper.cpp
Write-Host ""
Write-Host "[3/4] Downloading Whisper.cpp..." -ForegroundColor Yellow

$whisperExe = "$whisperDir\whisper.exe"

if (-not (Test-Path $whisperExe)) {
    Write-Host "   Attempting to download whisper.cpp..." -ForegroundColor Cyan

    # Try to download from GitHub releases
    try {
        $whisperUrl = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip"
        $whisperZip = "whisper\whisper.zip"

        Invoke-WebRequest -Uri $whisperUrl -OutFile $whisperZip -UseBasicParsing
        Expand-Archive -Path $whisperZip -DestinationPath "whisper\temp" -Force

        # Find main.exe or whisper.exe
        $whisperBinary = Get-ChildItem -Path "whisper\temp" -Filter "main.exe" -Recurse | Select-Object -First 1
        if ($whisperBinary) {
            Copy-Item $whisperBinary.FullName -Destination $whisperExe
            Write-Host "   Whisper.cpp downloaded successfully!" -ForegroundColor Green
        }

        Remove-Item "whisper\temp" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $whisperZip -Force -ErrorAction SilentlyContinue

    } catch {
        Write-Host "   Could not auto-download whisper.cpp" -ForegroundColor Yellow
        Write-Host "   Please download manually:" -ForegroundColor Cyan
        Write-Host "   1. Visit: https://github.com/ggerganov/whisper.cpp/releases" -ForegroundColor White
        Write-Host "   2. Download Windows binary (whisper-bin-x64.zip)" -ForegroundColor White
        Write-Host "   3. Extract and rename 'main.exe' to 'whisper.exe'" -ForegroundColor White
        Write-Host "   4. Place in: $whisperExe" -ForegroundColor White
    }
} else {
    Write-Host "   Whisper.exe already exists!" -ForegroundColor Green
}

# Download Whisper Model
Write-Host ""
Write-Host "[4/4] Downloading Whisper model..." -ForegroundColor Yellow

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
    Write-Host "   Downloading $modelName (this may take a few minutes)..." -ForegroundColor Yellow

    try {
        # Download with progress
        $webClient = New-Object System.Net.WebClient
        $webClient.DownloadFile($modelUrl, $modelPath)

        Write-Host "   Model downloaded successfully!" -ForegroundColor Green
    } catch {
        Write-Host "   ERROR: Failed to download model!" -ForegroundColor Red
        Write-Host "   Please download manually:" -ForegroundColor Yellow
        Write-Host "   URL: $modelUrl" -ForegroundColor Cyan
        Write-Host "   Save as: $modelPath" -ForegroundColor Cyan
    }
}

# Verification
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Verification" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$allGood = $true

if (Test-Path "bin\ffmpeg.exe") {
    Write-Host "   FFmpeg: OK" -ForegroundColor Green
} else {
    Write-Host "   FFmpeg: MISSING" -ForegroundColor Red
    $allGood = $false
}

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
    Write-Host "  All Dependencies Installed!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Run: npm run dev" -ForegroundColor White
    Write-Host "2. Click 'Start Recording' and speak" -ForegroundColor White
    Write-Host "3. Click 'Stop Recording' to transcribe" -ForegroundColor White
    Write-Host ""
    Write-Host "Your offline voice assistant is ready! 🎤🤖" -ForegroundColor Green
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
