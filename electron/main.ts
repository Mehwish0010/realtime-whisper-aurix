import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import Groq from 'groq-sdk'
import { initializeDeepgram, getDeepgramInstance, transcribeAudioFile } from './deepgram-stt.js'
import { createGroqConversationManager, getGroqConversationManager } from './groq-chat.js'
import { initializeDeepgramTTS, getDeepgramTTSInstance, synthesizeSpeech, AURA_VOICES, type AuraVoice } from './deepgram-tts.js'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    },
    title: 'AURIX Voice Assistant',
    icon: path.join(__dirname, '../public/vite.svg')
  })

  // Set Content Security Policy
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "media-src 'self' blob: mediastream:; " +
          "connect-src 'self' https://api.deepgram.com wss://api.deepgram.com https://api.groq.com; " +
          "font-src 'self'; " +
          "worker-src 'self' blob:;"
        ]
      }
    })
  })

  // Handle permission requests
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('Permission requested:', permission)
    if (permission === 'media') {
      callback(true) // Allow microphone access
    } else {
      callback(false)
    }
  })

  // Load app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()

    // Suppress console warnings from development tools
    mainWindow.webContents.on('console-message', (event, level, message) => {
      if (message.includes('React DevTools') || message.includes('react-devtools')) {
        event.preventDefault()
      }
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// App lifecycle
app.whenReady().then(async () => {
  // Initialize Deepgram STT
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY

  if (!deepgramApiKey || deepgramApiKey === 'your-deepgram-api-key-here') {
    console.warn('WARNING: DEEPGRAM_API_KEY not set in .env file')
    console.warn('Deepgram STT/TTS will not be available')
    console.warn('Get your API key from: https://console.deepgram.com/')
  } else {
    try {
      // Initialize STT
      const deepgram = initializeDeepgram(deepgramApiKey)
      await deepgram.initialize()
      console.log('Deepgram STT initialized successfully')

      // Initialize TTS with Perseus voice (natural male)
      initializeDeepgramTTS(deepgramApiKey, 'perseus')
      console.log('Deepgram TTS initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error)
    }
  }

  // Initialize Groq Chat
  const groqApiKey = process.env.GROQ_API_KEY

  if (!groqApiKey || groqApiKey === 'your-groq-api-key-here') {
    console.warn('WARNING: GROQ_API_KEY not set in .env file')
    console.warn('Groq Chat will not be available')
    console.warn('Get your API key from: https://console.groq.com/keys')
  } else {
    try {
      // Create Groq client for chat
      const groqClient = new Groq({ apiKey: groqApiKey })

      // Initialize Groq chat manager
      createGroqConversationManager(groqClient, {
        systemPrompt: 'You are a helpful voice assistant. Provide clear, concise, and friendly responses.',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        maxTokens: 1000
      })
      console.log('Groq chat manager initialized successfully')
    } catch (error) {
      console.error('Failed to initialize Groq:', error)
    }
  }

  // Create window
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Helper function to get temp directory path
async function getTempDir(): Promise<string> {
  const tempDir = path.join(app.getPath('userData'), 'temp')
  await fs.mkdir(tempDir, { recursive: true })
  return tempDir
}

// Helper function to save audio buffer to file
async function saveAudioFile(audioBuffer: ArrayBuffer, filename: string): Promise<string> {
  const tempDir = await getTempDir()
  const filePath = path.join(tempDir, filename)
  const buffer = Buffer.from(audioBuffer)
  await fs.writeFile(filePath, buffer)
  return filePath
}

// Deepgram IPC Handlers

// Get temp path
ipcMain.handle('get-temp-path', async () => {
  try {
    const tempDir = await getTempDir()
    return tempDir
  } catch (error) {
    console.error('Error getting temp path:', error)
    return app.getPath('temp')
  }
})

// Check Deepgram status
ipcMain.handle('deepgram-status', async () => {
  const deepgram = getDeepgramInstance()
  if (!deepgram) {
    return {
      success: false,
      error: 'Deepgram not initialized'
    }
  }
  const status = deepgram.getStatus()
  return {
    success: true,
    ...status
  }
})

// Transcribe audio file (Deepgram)
ipcMain.handle('deepgram-transcribe-audio', async (_event, audioPath: string) => {
  try {
    console.log('Received Deepgram transcription request for:', audioPath)

    const deepgram = getDeepgramInstance()
    if (!deepgram) {
      throw new Error('Deepgram not initialized. Please check your API key in .env file.')
    }

    const result = await transcribeAudioFile(audioPath)

    // Clean up the temp file after transcription
    try {
      await fs.unlink(audioPath)
      console.log('Cleaned up temp file:', audioPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError)
    }

    return {
      success: true,
      text: result.transcript,
      confidence: result.confidence,
      words: result.words
    }
  } catch (error: any) {
    console.error('Deepgram transcription error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
})

// Save audio buffer and transcribe (Deepgram)
ipcMain.handle('deepgram-save-and-transcribe', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    console.log('Received audio buffer for Deepgram, size:', audioBuffer.byteLength, 'bytes')

    const deepgram = getDeepgramInstance()
    if (!deepgram) {
      throw new Error('Deepgram not initialized. Please check your API key in .env file.')
    }

    // Validate audio buffer size
    if (audioBuffer.byteLength < 1000) {
      throw new Error('Audio file too small. Recording may have failed. Please try again.')
    }

    console.log('Audio buffer validated:', audioBuffer.byteLength, 'bytes')

    // Save audio buffer to temp file
    const timestamp = Date.now()
    const filename = `recording_${timestamp}.webm`
    const audioPath = await saveAudioFile(audioBuffer, filename)
    console.log('Saved audio file to:', audioPath)

    // Transcribe the audio
    console.log('🎤 Starting Deepgram transcription...')
    const result = await transcribeAudioFile(audioPath)
    console.log('📝 Transcription result:', result.transcript)
    console.log('📊 Confidence:', (result.confidence * 100).toFixed(1) + '%')

    // Clean up the temp file
    try {
      await fs.unlink(audioPath)
      console.log('Cleaned up temp file:', audioPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError)
    }

    return {
      success: true,
      text: result.transcript,
      confidence: result.confidence,
      words: result.words
    }
  } catch (error: any) {
    console.error(' Deepgram save and transcribe error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
})

// Deepgram Live Streaming IPC Handlers

// Start live transcription session
ipcMain.handle('deepgram-live-start', async () => {
  try {
    console.log('Starting Deepgram live transcription...')

    const deepgram = getDeepgramInstance()
    if (!deepgram) {
      throw new Error('Deepgram not initialized. Please check your API key in .env file.')
    }

    // Set up event listeners
    deepgram.on('transcript', (result: any) => {
      console.log(' Live transcription:', result.transcript)
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-transcript', {
          transcript: result.transcript,
          confidence: result.confidence,
          isFinal: result.isFinal,
          words: result.words
        })
      }
    })

    deepgram.on('speechStarted', () => {
      console.log('🎤 Speech started')
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-speech-started')
      }
    })

    deepgram.on('utteranceEnd', () => {
      console.log('🔚 Utterance ended')
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-utterance-end')
      }
    })

    deepgram.on('error', (error: any) => {
      console.error('Deepgram error:', error)
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-error', error.message || 'Unknown error')
      }
    })

    deepgram.on('connected', () => {
      console.log(' Deepgram live session connected')
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-connected')
      }
    })

    deepgram.on('closed', () => {
      console.log(' Deepgram live session closed')
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-closed')
      }
    })

    await deepgram.startLiveTranscription()

    return {
      success: true,
      message: 'Deepgram live transcription started'
    }
  } catch (error: any) {
    console.error(' Failed to start live transcription:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// Send audio chunk to live session
ipcMain.handle('deepgram-send-audio', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    const deepgram = getDeepgramInstance()
    if (!deepgram) {
      throw new Error('Deepgram not initialized')
    }

    const buffer = Buffer.from(audioBuffer)
    deepgram.sendAudio(buffer)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})

// Stop live transcription session
ipcMain.handle('deepgram-live-stop', async () => {
  try {
    console.log(' Stopping Deepgram live transcription...')

    const deepgram = getDeepgramInstance()
    if (!deepgram) {
      throw new Error('Deepgram not initialized')
    }

    await deepgram.stopLiveTranscription()

    return {
      success: true,
      message: 'Deepgram live transcription stopped'
    }
  } catch (error: any) {
    console.error('Failed to stop live transcription:', error)
    return {
      success: false,
      error: error.message
    }
  }
})


// Chat IPC Handlers (using Groq)

ipcMain.handle('chat-send-message', async (_event, message: string) => {
  try {
    console.log('Chat message received:', message)

    const chatManager = getGroqConversationManager()

    if (!chatManager.isInitialized()) {
      throw new Error('Groq chat manager not initialized.')
    }

    const response = await chatManager.sendMessage(message)

    return {
      success: true,
      response: response
    }
  } catch (error: any) {
    console.error('Chat error:', error)
    return {
      success: false,
      error: error.message || 'Unknown chat error occurred'
    }
  }
})

ipcMain.handle('chat-clear-history', async () => {
  try {
    const chatManager = getGroqConversationManager()
    chatManager.clearHistory()

    return {
      success: true
    }
  } catch (error: any) {
    console.error('Clear history error:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('chat-get-history', async () => {
  try {
    const chatManager = getGroqConversationManager()
    const history = chatManager.getHistory()

    return {
      success: true,
      history: history
    }
  } catch (error: any) {
    console.error('Get history error:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('chat-set-system-prompt', async (_event, prompt: string) => {
  try {
    const chatManager = getGroqConversationManager()
    chatManager.setSystemPrompt(prompt)

    return {
      success: true
    }
  } catch (error: any) {
    console.error('Set system prompt error:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// TTS IPC Handlers (using Deepgram Aura)

ipcMain.handle('tts-synthesize', async (_event, text: string) => {
  try {
    console.log('🔊 TTS request:', text.substring(0, 50) + (text.length > 50 ? '...' : ''))

    const tts = getDeepgramTTSInstance()
    if (!tts || !tts.isInitialized()) {
      throw new Error('Deepgram TTS not initialized')
    }

    const audioBuffer = await synthesizeSpeech(text)
    console.log(' TTS audio generated:', audioBuffer.length, 'bytes')

    // Return as ArrayBuffer for the renderer
    return {
      success: true,
      audio: audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength)
    }
  } catch (error: any) {
    console.error(' TTS error:', error)
    return {
      success: false,
      error: error.message || 'TTS synthesis failed'
    }
  }
})

ipcMain.handle('tts-set-voice', async (_event, voice: string) => {
  try {
    const tts = getDeepgramTTSInstance()
    if (!tts) {
      throw new Error('Deepgram TTS not initialized')
    }

    tts.setVoice(voice as AuraVoice)
    console.log(' TTS voice changed to:', voice)

    return { success: true, voice }
  } catch (error: any) {
    console.error(' TTS set voice error:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('tts-get-voices', async () => {
  try {
    return {
      success: true,
      voices: AURA_VOICES
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    }
  }
})

ipcMain.handle('tts-status', async () => {
  const tts = getDeepgramTTSInstance()
  if (!tts || !tts.isInitialized()) {
    return {
      success: false,
      error: 'Deepgram TTS not initialized'
    }
  }
  return {
    success: true,
    initialized: true,
    voice: tts.getVoice()
  }
})

console.log('AURIX Voice Assistant - Deepgram STT + TTS + Groq Chat Integration Ready')
