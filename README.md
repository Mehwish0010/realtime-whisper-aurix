# AURIX Voice Assistant 🎤🤖

**100% Offline Speech-to-Text Desktop Application**


AURIX is a privacy-focused voice assistant built with Electron, React, SOX, and whisper.cpp for completely offline speech recognition.

---

## Features

✅ **100% Offline** - No internet required, no API costs
✅ **Privacy First** - Your voice never leaves your device
✅ **Fast & Lightweight** - Uses SOX + whisper.cpp C++ engine
✅ **Direct WAV Recording** - SOX records directly in Whisper format (no conversion needed!)
✅ **Cross-Platform** - Works on Windows, macOS, Linux
✅ **Beautiful UI** - Modern React interface with animations
✅ **Easy Setup** - Automated setup scripts included

---

## Quick Start

### 1. Prerequisites

- **Node.js 22+** (already installed ✓)
- **SOX (Sound eXchange)** - [Download here](https://sourceforge.net/projects/sox/files/sox/)
- **Git** (optional)

#### Installing SOX on Windows

**Option 1: Download Binary**
1. Download SOX from https://sourceforge.net/projects/sox/files/sox/
2. Extract `sox.exe` from the archive
3. Place it in `C:\coqui-aurix\my-aurix\bin\sox.exe`

**Option 2: Using Chocolatey**
```powershell
choco install sox.portable
# Then copy sox.exe to your project:
copy "C:\ProgramData\chocolatey\lib\sox.portable\tools\sox.exe" "C:\coqui-aurix\my-aurix\bin\"
```

### 2. Setup Whisper.cpp

Run the automated setup script:

```powershell
powershell -ExecutionPolicy Bypass -File setup-whisper.ps1
```

Or follow manual steps in [SETUP_GUIDE.md](SETUP_GUIDE.md)

### 3. Install Dependencies

```bash
npm install
```

### 4. Run the App

```bash
# Development mode
npm run dev

# Electron app
npm run electron:dev
```

---

## How It Works

```
Microphone → SOX Recording (16kHz WAV) → Whisper.cpp → Text
```

1. **Record** - Click mic button to start SOX recording
2. **Direct WAV** - SOX records directly at 16kHz, mono (no conversion needed!)
3. **Transcribe** - Whisper.cpp processes audio offline
4. **Display** - Transcription appears instantly

### Why SOX Instead of MediaRecorder?

**Old Approach (MediaRecorder):**
```
Browser API → WebM → FFmpeg Conversion → WAV → Whisper
```

**New Approach (SOX):**
```
SOX → WAV (ready for Whisper) → Whisper
```

**Benefits:**
- ✅ No FFmpeg dependency needed
- ✅ Records directly in Whisper's format (16kHz, mono, 16-bit)
- ✅ Lower latency
- ✅ More consistent audio quality
- ✅ Better system audio access

---

## Project Structure

```
my-aurix/
├── electron/           # Electron main process
│   ├── main.ts        # App entry point
│   ├── preload.ts     # IPC bridge
│   ├── sox.ts         # SOX audio recording
│   └── whisper.ts     # Whisper.cpp integration
├── src/               # React UI
│   ├── App.tsx        # Main component
│   └── App.css        # Styles
├── bin/               # External binaries
│   └── sox.exe        # SOX audio recorder
├── whisper/           # Whisper.cpp binaries
│   ├── whisper.exe    # Speech-to-text engine
│   ├── models/        # AI models
│   └── temp/          # Temporary audio files
└── ARCHITECTURE.md    # Detailed documentation
```

---

## Documentation

- **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Complete setup instructions
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture & data flow
- **setup-whisper.ps1** - Automated setup script

---

## Available Scripts

```bash
# Development
npm run dev              # Start Vite dev server
npm run electron:dev     # Run Electron in dev mode

# Production
npm run build            # Build for production
npm run electron:build   # Create distributable app

# Code Quality
npm run lint             # Run ESLint
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Framework | Electron 39+ |
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite 7 |
| Audio Recording | SOX (Sound eXchange) |
| Speech Recognition | whisper.cpp |

---

## Requirements

### System Requirements
- **OS**: Windows 10+, macOS 10.15+, or Linux
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 500MB for app + models

### Software Requirements
- Node.js 22.12.0+
- SOX (sound recording)
- Whisper.cpp binary
- Base model (142MB)

---

## Screenshots

**Main Interface**
Voice assistant with real-time recording status

**Transcription View**
Displays converted text with waveform visualization

---

## Whisper Models

| Model | Size | Speed | Accuracy | Recommended For |
|-------|------|-------|----------|-----------------|
| tiny | 75 MB | ⭐⭐⭐⭐⭐ | ⭐⭐ | Quick testing |
| **base** | **142 MB** | **⭐⭐⭐⭐** | **⭐⭐⭐⭐** | **Production use** |
| small | 466 MB | ⭐⭐⭐ | ⭐⭐⭐⭐ | Higher accuracy |

---

## Privacy & Security

🔒 **No Data Collection** - Zero telemetry or tracking
🔒 **Offline Processing** - All computation happens locally
🔒 **No External APIs** - No third-party services
🔒 **Open Source** - Fully auditable codebase

---

## Troubleshooting

### SOX not found
```bash
# Windows (Chocolatey)
choco install sox.portable

# Manually: Download from https://sourceforge.net/projects/sox/files/
# Place sox.exe in: C:\coqui-aurix\my-aurix\bin\sox.exe

# Verify SOX works
sox --version
```

### Whisper binary missing
Download from [whisper.cpp releases](https://github.com/ggerganov/whisper.cpp/releases) and place in `whisper/` folder

### Model not found
Run setup script or download manually:
```powershell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -OutFile "whisper\models\ggml-base.bin"
```

### Recording fails / No audio captured
1. Check microphone permissions in Windows Settings
2. Verify SOX can access your microphone: `sox -d test.wav trim 0 5`
3. Make sure no other app is using the microphone

---

## Roadmap

- [ ] Multi-language support
- [ ] Voice command detection
- [ ] Export transcriptions (TXT, JSON)
- [ ] Dark/Light theme toggle
- [ ] Keyboard shortcuts
- [ ] Custom wake word
- [ ] Background noise reduction

---

## Contributing

Contributions welcome! Please read the architecture docs first.

---

## License

MIT License - Free for personal and commercial use

---

## Acknowledgments

- [SOX (Sound eXchange)](http://sox.sourceforge.net/) - Audio recording and processing
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) by ggerganov
- [OpenAI Whisper](https://github.com/openai/whisper) - Original model
- [Electron](https://www.electronjs.org/) - Desktop framework
- [React](https://react.dev/) - UI library

---

## Support

For issues and questions:
1. Check [SETUP_GUIDE.md](SETUP_GUIDE.md)
2. Review [ARCHITECTURE.md](ARCHITECTURE.md)
3. Open a GitHub issue

---

**Built with ❤️ by your success partner**
