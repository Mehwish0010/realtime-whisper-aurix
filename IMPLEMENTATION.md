# AURIX Voice Assistant - Complete Implementation Guide

## 🎯 Overview
This document details the complete implementation of the AURIX offline voice assistant, including all fixes and configurations needed to make speech-to-text transcription work.

---

## 📋 Table of Contents
1. [Dependencies Setup](#1-dependencies-setup)
2. [Preload Script Fix](#2-preload-script-fix)
3. [Microphone Permission Handling](#3-microphone-permission-handling)
4. [Audio Processing Pipeline](#4-audio-processing-pipeline)
5. [Whisper Output Parsing](#5-whisper-output-parsing)
6. [Final Architecture](#6-final-architecture)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Dependencies Setup

### 1.1 Required Dependencies

**NPM Packages (Already in package.json):**
```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "electron": "^39.2.7",
    "vite": "^7.2.4",
    "vite-plugin-electron": "^0.29.0",
    "typescript": "~5.9.3"
  }
}
```

**External Dependencies:**
1. **FFmpeg** - Audio format conversion
2. **Whisper.cpp** - Speech recognition engine
3. **Whisper Base Model** - AI model file (142MB)

### 1.2 Download and Install Dependencies

**FFmpeg (184MB):**
```bash
# Downloaded from GitHub
https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip

# Extracted to:
my-aurix/bin/ffmpeg.exe
```

**Whisper.cpp (111KB):**
```bash
# Downloaded from GitHub releases
https://github.com/ggerganov/whisper.cpp/releases/download/v1.5.4/whisper-bin-x64.zip

# Extracted main.exe and renamed to:
my-aurix/whisper/whisper.exe
```

**Whisper Base Model (142MB):**
```bash
# Downloaded from HuggingFace
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# Saved to:
my-aurix/whisper/models/ggml-base.bin
```

### 1.3 File Structure
```
my-aurix/
├── bin/
│   └── ffmpeg.exe          (184MB - audio converter)
├── whisper/
│   ├── whisper.exe         (111KB - speech engine)
│   ├── models/
│   │   └── ggml-base.bin   (142MB - AI model)
│   └── temp/               (temporary audio files)
├── electron/
│   ├── main.ts             (Electron main process)
│   ├── preload.ts          (IPC bridge - FIXED)
│   └── whisper.ts          (Whisper integration)
└── src/
    └── App.tsx             (React UI)
```

---

## 2. Preload Script Fix

### 2.1 Problem
The preload script was using ES6 `import` syntax, which caused this error:
```
SyntaxError: Cannot use import statement outside a module
```

### 2.2 Solution
Changed from ES6 imports to CommonJS `require`:

**File: `electron/preload.ts`**
```typescript
// ❌ BEFORE (ES6 - doesn't work)
import { contextBridge, ipcRenderer } from 'electron'

// ✅ AFTER (CommonJS - works)
const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  transcribeAudio: (audioPath: string) => ipcRenderer.invoke('transcribe-audio', audioPath),
  getTempPath: () => ipcRenderer.invoke('get-temp-path'),
  saveAndTranscribe: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('save-and-transcribe', audioBuffer)
})
```

### 2.3 Why This Fix Works
- Electron preload scripts run in Node.js context
- They need CommonJS format (`require`/`module.exports`)
- ES6 modules (`import`/`export`) don't work in preload context

---

## 3. Microphone Permission Handling

### 3.1 Problem
Browser wasn't requesting microphone permission, resulting in silent audio recordings.

### 3.2 Solution
Added automatic permission handler in main process:

**File: `electron/main.ts`**
```typescript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'AURIX Voice Assistant',
    icon: path.join(__dirname, '../public/vite.svg')
  })

  // ✅ Handle permission requests automatically
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission)
    if (permission === 'media') {
      callback(true) // Allow microphone access
    } else {
      callback(false)
    }
  })

  // ... rest of window setup
}
```

### 3.3 Enhanced Audio Capture Settings

**File: `src/App.tsx`**
```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,    // Reduce echo
    noiseSuppression: true,    // Reduce background noise
    autoGainControl: true      // Normalize volume
  }
})
```

---

## 4. Audio Processing Pipeline

### 4.1 Complete Audio Flow

```
User Speaks → Microphone → MediaRecorder → WebM Blob → IPC → Main Process
                                                                    ↓
                                                          Save to disk (WebM)
                                                                    ↓
                                                          FFmpeg converts to WAV
                                                                    ↓
                                                          Whisper.cpp processes
                                                                    ↓
                                                          Text output → UI
```

### 4.2 IPC Handler Implementation

**File: `electron/main.ts`**
```typescript
ipcMain.handle('save-and-transcribe', async (event, audioBuffer: ArrayBuffer) => {
  try {
    const fs = await import('fs/promises')

    // Create temp directory
    const tempDir = path.join(app.getPath('userData'), 'temp')
    await fs.mkdir(tempDir, { recursive: true })

    // Save audio file
    const timestamp = Date.now()
    const audioPath = path.join(tempDir, `recording_${timestamp}.webm`)
    await fs.writeFile(audioPath, Buffer.from(audioBuffer))

    // Log file size for debugging
    const fileStats = await fs.stat(audioPath)
    console.log('Audio saved to:', audioPath)
    console.log('File size:', fileStats.size, 'bytes')

    if (fileStats.size < 1000) {
      console.error('WARNING: Audio file is very small - likely silent')
    }

    // Transcribe
    const transcription = await transcribeAudio(audioPath)

    // Clean up
    try {
      await fs.unlink(audioPath)
    } catch (err) {
      console.warn('Could not delete temp file:', err)
    }

    return { success: true, text: transcription }
  } catch (error) {
    console.error('Save and transcribe error:', error)
    return { success: false, error: (error as Error).message }
  }
})
```

### 4.3 FFmpeg Audio Conversion

**File: `electron/whisper.ts`**
```typescript
const FFMPEG_PATH = path.join(process.cwd(), 'bin', 'ffmpeg.exe')

async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  console.log('Converting audio to WAV format...')

  try {
    const args = [
      '-i', inputPath,
      '-ar', '16000',      // Sample rate 16kHz (Whisper requirement)
      '-ac', '1',          // Mono channel
      '-c:a', 'pcm_s16le', // 16-bit PCM format
      '-y',                // Overwrite output
      outputPath
    ]

    await execFileAsync(FFMPEG_PATH, args)
    console.log('Audio conversion successful')
  } catch (error) {
    throw new Error(`FFmpeg conversion failed: ${(error as Error).message}`)
  }
}
```

---

## 5. Whisper Output Parsing

### 5.1 Problem
Whisper.cpp outputs colored text with ANSI escape codes:
```
[38;5;220m Hello[0m[38;5;196m Aur[0m[38;5;196miks[0m
```

The parser was filtering out everything, resulting in "No speech detected".

### 5.2 Solution
Strip ANSI color codes before parsing:

**File: `electron/whisper.ts`**
```typescript
async function transcribeAudio(audioPath: string): Promise<string> {
  // ... setup code ...

  const args = [
    '-m', MODEL_PATH,
    '-f', wavPath,
    '-l', 'en',          // Language: English
    '-t', '4',           // Threads
    '--no-timestamps'    // No timestamps in output
  ]

  const { stdout, stderr } = await execFileAsync(WHISPER_PATH, args, {
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  })

  // ✅ Remove ANSI color codes
  const cleanOutput = stdout.replace(/\x1b\[[0-9;]*m/g, '')

  const lines = cleanOutput.split('\n')
  const transcriptionLines = lines.filter(line =>
    line.trim() &&
    !line.includes('whisper_') &&
    !line.includes('system_info') &&
    !line.includes('model_load') &&
    !line.includes('main:') &&
    !line.includes('sampling') &&
    line.length > 0
  )

  const transcription = transcriptionLines.join(' ').trim()
  console.log('Transcription complete:', transcription)

  // Clean up WAV file
  if (audioPath !== wavPath) {
    await fs.unlink(wavPath).catch(() => {})
  }

  return transcription || 'No speech detected'
}
```

### 5.3 ANSI Code Regex Explanation
```typescript
/\x1b\[[0-9;]*m/g
```
- `\x1b` - ESC character
- `\[` - Opening bracket
- `[0-9;]*` - Any number of digits and semicolons
- `m` - End marker
- `g` - Global flag (replace all occurrences)

---

## 6. Final Architecture

### 6.1 Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                         │
│                                                         │
│  ┌──────────────┐         ┌──────────────────────┐    │
│  │   Renderer   │  IPC    │    Main Process      │    │
│  │   (React)    │◄───────►│   (Node.js)          │    │
│  │              │         │                      │    │
│  │ - UI         │         │ - File System        │    │
│  │ - Recording  │         │ - FFmpeg             │    │
│  │ - Display    │         │ - Whisper.cpp        │    │
│  └──────────────┘         └──────────────────────┘    │
│         │                           │                  │
│         │ Audio Blob                │                  │
│         └───────────────────────────┘                  │
└─────────────────────────────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │   Dependencies   │
          │                  │
          │ • FFmpeg         │
          │ • Whisper.exe    │
          │ • Model file     │
          └──────────────────┘
```

### 6.2 Data Flow

1. **User clicks "Start Recording"**
   - `App.tsx` requests microphone access
   - `MediaRecorder` starts capturing audio

2. **User clicks "Stop Recording"**
   - `MediaRecorder` stops
   - Audio chunks combined into Blob
   - Blob converted to ArrayBuffer

3. **IPC Communication**
   - ArrayBuffer sent to main process via `electronAPI.saveAndTranscribe()`

4. **Main Process Processing**
   - ArrayBuffer saved as WebM file
   - FFmpeg converts WebM → WAV (16kHz mono)

5. **Whisper Processing**
   - Whisper.cpp processes WAV file
   - Outputs transcription with color codes

6. **Text Parsing**
   - ANSI codes stripped
   - Clean text extracted
   - Returned to renderer

7. **UI Update**
   - Transcription displayed in text box

### 6.3 Key Files and Responsibilities

| File | Purpose | Key Functions |
|------|---------|---------------|
| `electron/main.ts` | Main process | Window creation, IPC handlers, permissions |
| `electron/preload.ts` | IPC bridge | Exposes `electronAPI` to renderer |
| `electron/whisper.ts` | Whisper integration | Audio conversion, transcription |
| `src/App.tsx` | UI + Recording | MediaRecorder, audio capture, display |
| `bin/ffmpeg.exe` | Audio converter | WebM → WAV conversion |
| `whisper/whisper.exe` | Speech engine | WAV → Text transcription |
| `whisper/models/ggml-base.bin` | AI model | Speech recognition weights |

---

## 7. Troubleshooting

### 7.1 Common Issues and Solutions

#### Issue: "No speech detected"
**Causes:**
- Microphone not capturing audio
- Audio file too quiet
- ANSI codes not being stripped

**Solutions:**
1. Check Windows microphone settings (volume at 80-100%)
2. Test microphone in Windows Settings → Sound → Input
3. Verify audio blob size is > 10,000 bytes
4. Check ANSI stripping regex is applied

#### Issue: "Preload script error"
**Cause:** Using ES6 imports in preload

**Solution:** Use CommonJS `require()` instead

#### Issue: "Permission denied"
**Cause:** Microphone permission not granted

**Solution:** Add permission handler in `main.ts`

#### Issue: "FFmpeg not found"
**Cause:** Incorrect path or file missing

**Solution:**
```typescript
const FFMPEG_PATH = path.join(process.cwd(), 'bin', 'ffmpeg.exe')
```

### 7.2 Debugging Tips

**Check audio file size:**
```typescript
const fileStats = await fs.stat(audioPath)
console.log('File size:', fileStats.size, 'bytes')
```

**Check microphone access:**
```typescript
console.log('Audio tracks:', stream.getAudioTracks())
console.log('Track settings:', stream.getAudioTracks()[0]?.getSettings())
```

**Check whisper output:**
```typescript
console.log('Full whisper output:', stdout)
console.log('Whisper stderr:', stderr)
```

### 7.3 Performance Optimization

**Whisper Processing Time:**
- Typical: 5-15 seconds for 5-second audio
- Depends on CPU (uses 4 threads by default)

**Audio Quality vs Speed:**
```
Model     Size      Speed    Accuracy
tiny      75MB      ⭐⭐⭐⭐⭐   ⭐⭐
base      142MB     ⭐⭐⭐⭐     ⭐⭐⭐⭐  (Recommended)
small     466MB     ⭐⭐⭐       ⭐⭐⭐⭐⭐
```

---

## 8. Final Configuration Summary

### 8.1 Environment Variables
```
VITE_DEV_SERVER_URL=http://localhost:5173
```

### 8.2 Required Paths
```
bin/ffmpeg.exe                          ✅
whisper/whisper.exe                     ✅
whisper/models/ggml-base.bin            ✅
whisper/temp/                           ✅ (auto-created)
```

### 8.3 Scripts
```json
{
  "scripts": {
    "dev": "vite",
    "electron:dev": "vite --mode electron",
    "electron:build": "tsc -b && vite build && electron-builder",
    "build": "tsc -b && vite build"
  }
}
```

### 8.4 Running the App
```bash
# Development mode
npm run electron:dev

# The app will:
# 1. Start Vite dev server
# 2. Open Electron window
# 3. Load React UI
# 4. Enable microphone recording
# 5. Process speech with Whisper.cpp
```

---

## 9. Success Criteria ✅

The app is working when:
- ✅ Electron window opens
- ✅ "Start Recording" button appears
- ✅ Microphone access granted automatically
- ✅ Audio blob size > 10,000 bytes
- ✅ FFmpeg converts WebM → WAV successfully
- ✅ Whisper.cpp processes audio (logs show processing)
- ✅ Transcription appears in text box
- ✅ Text matches what was spoken

---

## 10. Credits and Resources

**Technologies Used:**
- [Electron](https://www.electronjs.org/) - Desktop framework
- [React](https://react.dev/) - UI library
- [Vite](https://vitejs.dev/) - Build tool
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) - Speech recognition
- [FFmpeg](https://ffmpeg.org/) - Audio processing

**Key Libraries:**
- `vite-plugin-electron` - Electron integration
- `MediaRecorder API` - Browser audio capture
- `contextBridge` - Secure IPC communication

---

## 11. Next Steps / Future Enhancements

**Potential Improvements:**
- [ ] Multi-language support (change `-l en` parameter)
- [ ] Voice activity detection (stop recording automatically)
- [ ] Real-time transcription (stream audio)
- [ ] Export transcriptions to file
- [ ] Custom wake word detection
- [ ] Background noise reduction
- [ ] Dark mode UI

---

