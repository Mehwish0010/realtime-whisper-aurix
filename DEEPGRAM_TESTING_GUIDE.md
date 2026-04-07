# Deepgram STT Testing Guide

## Overview

This application has been configured to use **Deepgram** for Speech-to-Text (STT) and **Groq** for AI chat responses.

## Architecture

```
User Speech → Deepgram STT → Groq Chat (LLaMA 3.3) → Text Response
```

**Key Components:**
-  **Deepgram STT** - Real-time and file-based transcription with confidence scores
-  **Groq Chat** - AI responses using LLaMA 3.3 70B model
-  **TTS Removed** - No text-to-speech output
-  **Old STT Removed** - GrowWhisper and OpenAI Whisper removed

## Setup

### 1. Get API Keys

You need TWO API keys:

#### Deepgram API Key
1. Go to [https://console.deepgram.com/](https://console.deepgram.com/)
2. Sign up or log in
3. Create a new API key
4. Copy the API key

#### Groq API Key
1. Go to [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign up or log in
3. Create a new API key
4. Copy the API key

### 2. Configure Environment Variables

Edit the `.env` file in the project root:

```bash
# Deepgram API Configuration
DEEPGRAM_API_KEY=your-deepgram-api-key-here

# Groq API Configuration
GROQ_API_KEY=your-groq-api-key-here
```

Replace the placeholder values with your actual API keys.

### 3. Install Dependencies (Already Done)

Dependencies have been installed. If you need to reinstall:

```bash
npm install
```

## Running the Application

### Development Mode

```bash
npm run electron:dev
```

This will:
1. Start the Vite development server
2. Launch the Electron application
3. Open Chrome DevTools automatically

### Production Build

```bash
npm run electron:build
```

## Testing Deepgram STT

### Test 1: File-Based Transcription

The application provides file-based transcription via IPC handlers:

**IPC Handlers:**
- `deepgram-transcribe-audio` - Transcribe an audio file
- `deepgram-save-and-transcribe` - Save audio buffer and transcribe

**Expected Output:**
```javascript
{
  success: true,
  text: "transcribed text here",
  confidence: 0.95,  // 0.0 to 1.0
  words: [
    {
      word: "hello",
      confidence: 0.98,
      start: 0.0,
      end: 0.5
    },
    // ... more words
  ]
}
```

### Test 2: Live Streaming Transcription

For real-time streaming transcription:

**IPC Handlers:**
- `deepgram-live-start` - Start live transcription session
- `deepgram-send-audio` - Send audio chunks (Buffer)
- `deepgram-live-stop` - Stop live transcription session

**Events from Main to Renderer:**
- `deepgram-transcript` - Transcription result
- `deepgram-speech-started` - Speech detection started
- `deepgram-utterance-end` - Utterance ended
- `deepgram-connected` - Connection established
- `deepgram-closed` - Connection closed
- `deepgram-error` - Error occurred

**Example Flow:**
```javascript
// 1. Start live session
await window.electron.invoke('deepgram-live-start')

// 2. Send audio chunks
const audioChunk = new ArrayBuffer(...)
await window.electron.invoke('deepgram-send-audio', audioChunk)

// 3. Listen for transcriptions
window.electron.on('deepgram-transcript', (data) => {
  console.log('Transcript:', data.transcript)
  console.log('Confidence:', data.confidence)
  console.log('Is Final:', data.isFinal)
})

// 4. Stop when done
await window.electron.invoke('deepgram-live-stop')
```

### Test 3: Status Check

Check if Deepgram is initialized:

```javascript
const status = await window.electron.invoke('deepgram-status')
console.log(status)
// {
//   success: true,
//   initialized: true,
//   connected: false,  // live session status
//   avgLatency: null   // average latency in ms
// }
```

## Testing Groq Chat

**IPC Handlers:**
- `chat-send-message` - Send message to AI
- `chat-clear-history` - Clear conversation history
- `chat-get-history` - Get conversation messages
- `chat-set-system-prompt` - Update system prompt

**Example:**
```javascript
// Send a message
const response = await window.electron.invoke('chat-send-message', 'Hello, how are you?')
console.log(response.response)

// Get chat history
const history = await window.electron.invoke('chat-get-history')
console.log(history.history)
```

## Monitoring & Debugging

### Console Output

When running in development mode, you'll see detailed logs:

**Deepgram Initialization:**
```
 Deepgram initialized successfully
```

**Groq Initialization:**
```
 Groq chat manager initialized successfully
```

**Transcription Logs:**
```
� Received Deepgram transcription request for: C:\...\recording_123.webm
 Starting Deepgram transcription...
 Transcription result: Hello, world!
 Confidence: 95.5%
�  Cleaned up temp file
```

**Live Streaming Logs:**
```
  Starting Deepgram live transcription...
 Deepgram live session connected
 Live transcription: Hello
� Utterance ended
 Latency: 150ms
```

### Confidence Color Coding

Transcriptions are color-coded by confidence in the console:

- **Green** (90-100%): High confidence
- **Yellow** (80-90%): Good confidence
- **Orange** (70-80%): Lower confidence
- **Red** (≤69%): Low confidence

### Error Handling

Common errors and solutions:

**Error: "Deepgram not initialized"**
- Check that your `DEEPGRAM_API_KEY` is set in `.env`
- Restart the application

**Error: "Deepgram API key is required"**
- Make sure `.env` file exists in the project root
- Verify the API key is not set to `your-deepgram-api-key-here`

**Error: "Audio file too small"**
- Recording failed or audio buffer is empty
- Check microphone permissions
- Ensure audio is being captured properly

## Latency Testing

### File-Based Transcription
- Expected latency: **200-500ms** for small files
- Depends on file size and network speed

### Live Streaming Transcription
- Expected latency: **100-300ms** (sub-second)
- Real-time with interim results
- Final results may take slightly longer

### Monitoring Latency

The Deepgram implementation logs latency automatically:

```
 Latency: 150ms
 Average latency: 175.50ms over 10 transcriptions
```

## Troubleshooting

### No Audio Detected

1. Check microphone permissions in Windows settings
2. Verify CSP headers allow media access (already configured)
3. Test microphone in browser DevTools

### Low Confidence Scores

1. Improve microphone quality
2. Reduce background noise
3. Speak clearly and at normal pace
4. Check audio format is supported (webm, wav, mp3, etc.)

### Connection Errors

1. Check internet connection
2. Verify API key is valid
3. Check Deepgram account has credits
4. Review CSP headers include `https://api.deepgram.com` and `wss://api.deepgram.com`

## API Key Security

**Important:**
-  `.env` is already in `.gitignore`
-  Never commit API keys to version control
-  Use `.env.example` for sharing configuration templates
-  Do not share your `.env` file

## What Was Removed

The following components were removed during migration:

### Removed STT Implementations:
-  `electron/groq-stt.ts` - Groq Whisper STT (replaced by Deepgram)
-  `electron/openai-stt.ts` - OpenAI Whisper STT
-  `electron/openai-realtime.ts` - OpenAI Realtime WebSocket STT

### Removed TTS Implementation:
-  `electron/inworld-tts.ts` - Inworld TTS

### Removed Chat Implementation:
-  `electron/openai-chat.ts` - OpenAI GPT chat

### Removed IPC Handlers:
-  `transcribe-audio` (OpenAI)
-  `save-and-transcribe` (OpenAI)
-  `groq-transcribe-audio`
-  `groq-save-and-transcribe`
-  `realtime-start`
-  `realtime-send-audio`
-  `realtime-commit`
-  `realtime-stop`
-  `realtime-status`
-  `tts-synthesize`
-  `tts-status`
-  `conversation-*` handlers (orchestrator removed)

### Removed Dependencies:
-  `groq-sdk` (chat still uses Groq, just not STT)
-  `openai`

## Next Steps

1. **Test file transcription** - Use the UI to record and transcribe audio
2. **Test live streaming** - Enable real-time transcription mode
3. **Monitor latency** - Check console logs for response times
4. **Test confidence scores** - Verify accuracy with different audio quality
5. **Test chat integration** - Send transcriptions to Groq chat

## Support

- **Deepgram Docs:** [https://developers.deepgram.com/](https://developers.deepgram.com/)
- **Groq Docs:** [https://console.groq.com/docs](https://console.groq.com/docs)
- **Deepgram Models:** Nova-2 (default), Flux (optional)
- **Groq Model:** LLaMA 3.3 70B Versatile

## Performance Metrics

### Expected Performance:
- **Deepgram STT Latency:** 100-300ms (live), 200-500ms (file)
- **Groq Chat Latency:** 500-1500ms (varies by response length)
- **Total E2E Latency:** < 2 seconds (speech → transcription → AI response)

---

**Status:**  Ready for testing!

Make sure to replace the API keys in `.env` before running the application.
