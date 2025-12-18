

### Step 1: Verify Node.js Installation ✓

You already have Node.js v22.12.0 installed!

```bash
node --version  # v22.12.0
```

---

### Step 2: Install FFmpeg (Required)

FFmpeg is needed to convert audio formats.

#### Windows Installation:

**Option A: Using Chocolatey (Recommended)**
```bash
choco install ffmpeg
```

**Option B: Manual Installation**
1. Download from: https://ffmpeg.org/download.html#build-windows
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to System PATH
4. Verify:
   ```bash
   ffmpeg -version
   ```

---

### Step 3: Download Whisper.cpp

#### Option A: Download Pre-built Binary (Easiest)

1. Go to: https://github.com/ggerganov/whisper.cpp/releases

2. Download the latest Windows release (e.g., `whisper-bin-win-x64.zip`)

3. Extract and copy `main.exe` or `whisper.exe` to:
   ```
   C:\coqui-aurix\my-aurix\whisper\whisper.exe
   ```

#### Option B: Build from Source (Advanced)

```bash
# Clone repository
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp

# Build (requires Visual Studio or MinGW)
mkdir build
cd build
cmake ..
cmake --build . --config Release

# Copy executable
copy Release\main.exe ..\whisper\whisper.exe
```

---

### Step 4: Download Whisper Model

Create models directory:
```bash
mkdir whisper\models
cd whisper\models
```

Download base model (recommended):
```bash
# Using PowerShell
Invoke-WebRequest -Uri "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin" -OutFile "ggml-base.bin"

# Or using curl (if installed)
curl -L -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
```

#### Model Options:

| Model | Size | Download Link |
|-------|------|---------------|
| tiny | 75 MB | https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin |
| **base** | **142 MB** | **https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin** |
| small | 466 MB | https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin |

---

### Step 5: Verify Folder Structure

Your project should look like this:

```
my-aurix/
├── electron/
│   ├── main.ts
│   ├── preload.ts
│   └── whisper.ts
├── whisper/
│   ├── whisper.exe        ← Download this
│   ├── models/
│   │   └── ggml-base.bin  ← Download this
│   └── temp/
├── src/
│   ├── App.tsx
│   ├── App.css
│   └── main.tsx
├── package.json
└── ARCHITECTURE.md
```

---

### Step 6: Test Whisper Installation

```bash
cd whisper
.\whisper.exe --help
```

You should see usage information.

Test with sample audio:
```bash
.\whisper.exe -m models\ggml-base.bin -f test.wav
```

---

### Step 7: Run AURIX in Development Mode

```bash
# Stop any running dev server
# Then run Electron app
npm run dev
```

Open in browser or Electron will launch automatically.

---

### Step 8: Grant Microphone Permission

When you click "Start Recording":
- Browser/Electron will ask for microphone permission
- Click "Allow"

---

## Troubleshooting

### Error: "ffmpeg not found"

**Solution:**
```bash
# Verify FFmpeg installation
ffmpeg -version

# If not found, add to PATH or reinstall
```

### Error: "Whisper binary not found"

**Solution:**
- Ensure `whisper.exe` exists in `whisper/` folder
- Check file path: `C:\coqui-aurix\my-aurix\whisper\whisper.exe`

### Error: "Model not found"

**Solution:**
- Verify model exists: `whisper\models\ggml-base.bin`
- Re-download if needed

### Recording doesn't work

**Solution:**
- Grant microphone permission
- Check if mic is connected
- Test in browser: chrome://settings/content/microphone

### Slow transcription

**Solution:**
- Use `tiny` or `base` model instead of `large`
- Process shorter audio clips (< 30 seconds)

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Run Electron app
npm run electron:dev

# Build production app
npm run electron:build

# Lint code
npm run lint
```

---

## Testing the Complete Flow

1. **Click "Start Recording"**
2. **Speak clearly** into your microphone
3. **Click "Stop Recording"**
4. Wait for transcription (status will show "Transcribing...")
5. See result in transcription box

---

## What Happens Behind the Scenes

```
User clicks Record
    ↓
Microphone captures audio
    ↓
Save as recording.webm
    ↓
FFmpeg converts to recording.wav (16kHz mono)
    ↓
Whisper.cpp transcribes wav file
    ↓
Display transcription in UI
```

---

## Performance Tips

1. **Use base model** for best speed/accuracy balance
2. **Keep recordings under 30 seconds** for faster processing
3. **Speak clearly** and minimize background noise
4. **Close other heavy apps** when running

---

## Next Steps

Once everything works:

- [ ] Customize UI colors in `src/App.css`
- [ ] Add voice commands detection
- [ ] Implement export transcriptions feature
- [ ] Add multi-language support
- [ ] Build standalone installer

---

## Download Links Summary

| Resource | Link |
|----------|------|
| **FFmpeg** | https://ffmpeg.org/download.html |
| **Whisper.cpp Releases** | https://github.com/ggerganov/whisper.cpp/releases |
| **Base Model (142MB)** | https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin |
| **Tiny Model (75MB)** | https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin |

---

## Support

If you encounter issues:

1. Check ARCHITECTURE.md for detailed information
2. Verify all prerequisites are installed
3. Check console logs for errors
4. Ensure folder structure matches exactly

---

**Ready to build offline voice AI! 🎤🤖**
