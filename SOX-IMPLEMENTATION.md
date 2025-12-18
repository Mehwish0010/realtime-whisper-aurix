# SOX Implementation Summary

## What Was Done

I successfully replaced MediaRecorder API with SOX (Sound eXchange) for audio recording in the AURIX Voice Assistant application.

---

## Changes Made

### 1. Created SOX Recording Module (`electron/sox.ts`)

**Purpose**: Handle audio recording using SOX binary

**Key Functions**:
- `startRecording(outputPath)` - Starts SOX recording to a WAV file
- `stopRecording()` - Stops recording and returns the output path
- `isRecording()` - Checks if currently recording

**SOX Configuration**:
```bash
sox -d -r 16000 -c 1 -b 16 -t wav output.wav
```
- `-d` = Default microphone input
- `-r 16000` = Sample rate 16kHz (Whisper requirement)
- `-c 1` = Mono channel (Whisper requirement)
- `-b 16` = 16-bit depth
- `-t wav` = Output format WAV

---

### 2. Updated Electron Main Process (`electron/main.ts`)

**Added**:
- Import SOX functions
- Three new IPC handlers:
  - `sox-start-recording` - Starts SOX recording
  - `sox-stop-recording` - Stops recording and transcribes
  - `sox-is-recording` - Checks recording status

**Flow**:
1. Frontend requests recording start
2. Backend creates temp directory
3. SOX starts recording to `sox_recording_[timestamp].wav`
4. When stopped, file is transcribed by Whisper
5. Temp file is cleaned up

---

### 3. Updated Preload Script (`electron/preload.ts`)

**Added to electronAPI**:
```typescript
soxStartRecording: () => ipcRenderer.invoke('sox-start-recording')
soxStopRecording: () => ipcRenderer.invoke('sox-stop-recording')
soxIsRecording: () => ipcRenderer.invoke('sox-is-recording')
```

---

### 4. Updated React UI (`src/App.tsx`)

**Removed**:
- MediaRecorder logic
- Browser microphone permission requests
- Audio chunking system
- Streaming transcript listeners

**Replaced with**:
- Simple `startRecording()` that calls `soxStartRecording()`
- Simple `stopRecording()` that calls `soxStopRecording()` and displays result

**UI Changes**:
- Changed subtitle to "SOX + Whisper.cpp - Direct WAV Recording"
- Changed button text from "Start/Stop Streaming" to "Start/Stop Recording"
- Changed title from "Live Transcription" to "Transcription"
- Updated status messages

---

### 5. Updated TypeScript Definitions (`src/electron.d.ts`)

**Added**:
```typescript
soxStartRecording: () => Promise<{ success: boolean; outputPath?: string; error?: string }>
soxStopRecording: () => Promise<{ success: boolean; text?: string; error?: string }>
soxIsRecording: () => Promise<{ isRecording: boolean }>
```

---

### 6. Updated README.md

**Changes**:
- Replaced FFmpeg references with SOX
- Added SOX installation instructions (Windows)
- Updated "How It Works" section
- Added "Why SOX Instead of MediaRecorder?" section
- Updated Tech Stack table
- Updated Software Requirements
- Updated Troubleshooting section
- Added SOX to Acknowledgments

---

### 7. Created bin Directory

Created `C:\coqui-aurix\my-aurix\bin\` for SOX binary placement

---

## File Structure After Changes

```
my-aurix/
├── electron/
│   ├── main.ts         ✅ Updated (added SOX IPC handlers)
│   ├── preload.ts      ✅ Updated (added SOX API)
│   ├── sox.ts          🆕 NEW FILE (SOX recording logic)
│   └── whisper.ts      (unchanged)
├── src/
│   ├── App.tsx         ✅ Updated (replaced MediaRecorder with SOX)
│   ├── electron.d.ts   ✅ Updated (added SOX types)
│   └── App.css         (unchanged)
├── bin/                🆕 NEW DIRECTORY
│   └── sox.exe         ⚠️ USER NEEDS TO ADD THIS
├── whisper/
│   ├── whisper.exe
│   └── models/
└── README.md           ✅ Updated (SOX documentation)
```

---

## Architecture Comparison

### OLD (MediaRecorder + FFmpeg):
```
User clicks mic
  ↓
Browser MediaRecorder starts
  ↓
Audio chunks captured (WebM format)
  ↓
Sent to main process
  ↓
Saved as .webm file
  ↓
FFmpeg converts WebM → WAV (16kHz, mono)
  ↓
Whisper.cpp transcribes WAV
  ↓
Result sent to frontend
```

### NEW (SOX):
```
User clicks mic
  ↓
Main process starts SOX
  ↓
SOX records directly to WAV (16kHz, mono)
  ↓
User clicks stop
  ↓
Whisper.cpp transcribes WAV (no conversion!)
  ↓
Result sent to frontend
```

---

## Benefits

1. **No Conversion Step** - SOX records directly in Whisper's format
2. **No FFmpeg Dependency** - One less external tool to manage
3. **Better Audio Quality** - Direct system audio access
4. **Lower Latency** - Eliminates conversion time
5. **Simpler Code** - Removed chunking/streaming complexity

---

## What User Needs to Do

### Step 1: Install SOX

**Option A: Chocolatey (Recommended)**
```powershell
choco install sox.portable
copy "C:\ProgramData\chocolatey\lib\sox.portable\tools\sox.exe" "C:\coqui-aurix\my-aurix\bin\"
```

**Option B: Manual Download**
1. Download from https://sourceforge.net/projects/sox/files/sox/
2. Extract `sox.exe` from archive
3. Place in `C:\coqui-aurix\my-aurix\bin\sox.exe`

### Step 2: Test the App

```bash
cd C:\coqui-aurix\my-aurix
npm run electron:dev
```

### Step 3: Verify SOX is Working

Click "Start Recording" and speak. Click "Stop Recording" and wait for transcription.

If you get "SOX not found" error:
- Check `C:\coqui-aurix\my-aurix\bin\sox.exe` exists
- Try running `sox --version` from command line

---

## Testing Checklist

- [ ] SOX binary placed in `bin/sox.exe`
- [ ] App starts without errors
- [ ] "Start Recording" button works
- [ ] Status shows "🎤 Recording... Speak now!"
- [ ] Waveform animation shows during recording
- [ ] "Stop Recording" button works
- [ ] Status shows "⏳ Processing... Please wait"
- [ ] Transcription appears after processing
- [ ] Temp files are cleaned up (check userData/temp folder)

---

## Troubleshooting

### "Failed to start recording: spawn ENOENT"
- SOX binary not found
- Make sure `sox.exe` is in `C:\coqui-aurix\my-aurix\bin\`

### "No audio captured" / Empty transcription
- Check microphone permissions in Windows Settings
- Try recording a test file: `sox -d test.wav trim 0 5`
- Make sure no other app is using the microphone

### SOX process doesn't stop
- The app sends SIGINT to SOX (graceful stop)
- After 2 seconds, it sends SIGKILL (force stop)

---

## Code Flow Diagram

```
┌─────────────────────────────────────────────┐
│         React UI (App.tsx)                   │
│  ┌─────────────────────────────────────┐    │
│  │ User clicks "Start Recording"       │    │
│  │ Calls: soxStartRecording()          │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │ IPC
┌─────────────────▼───────────────────────────┐
│    Electron Main (main.ts)                   │
│  ┌─────────────────────────────────────┐    │
│  │ Receives: sox-start-recording       │    │
│  │ Creates temp file path              │    │
│  │ Calls: startRecording(path)         │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         SOX Module (sox.ts)                  │
│  ┌─────────────────────────────────────┐    │
│  │ Spawns: sox -d -r 16000 -c 1 ...   │    │
│  │ Recording starts                     │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
                  │
                  │ User speaks...
                  │
┌─────────────────▼───────────────────────────┐
│         React UI (App.tsx)                   │
│  ┌─────────────────────────────────────┐    │
│  │ User clicks "Stop Recording"        │    │
│  │ Calls: soxStopRecording()           │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │ IPC
┌─────────────────▼───────────────────────────┐
│    Electron Main (main.ts)                   │
│  ┌─────────────────────────────────────┐    │
│  │ Receives: sox-stop-recording        │    │
│  │ Calls: stopRecording()              │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         SOX Module (sox.ts)                  │
│  ┌─────────────────────────────────────┐    │
│  │ Sends SIGINT to SOX process         │    │
│  │ Returns WAV file path               │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│    Electron Main (main.ts)                   │
│  ┌─────────────────────────────────────┐    │
│  │ Calls: transcribeAudio(wavPath)     │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│    Whisper Module (whisper.ts)               │
│  ┌─────────────────────────────────────┐    │
│  │ Runs: whisper.exe -m model -f wav   │    │
│  │ Returns transcription text           │    │
│  └──────────────┬──────────────────────┘    │
└─────────────────┼───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         React UI (App.tsx)                   │
│  ┌─────────────────────────────────────┐    │
│  │ Displays transcription result        │    │
│  │ Cleans up temp file                  │    │
│  └─────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

---

## Summary

All code has been successfully modified to use SOX instead of MediaRecorder API. The app now:

1. Uses SOX for direct WAV recording (16kHz, mono, 16-bit)
2. Eliminates the need for FFmpeg conversion
3. Has simpler, cleaner code
4. Provides faster transcription (no conversion step)

**Next step**: Install SOX binary and test the application!
