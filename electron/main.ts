import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import { initializeOpenAI, transcribeAudio, isInitialized, getStatus } from './openai-stt.js'
import { createRealtimeSession, getRealtimeSession, disconnectRealtime } from './openai-realtime.js'

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
          "connect-src 'self' https://api.openai.com wss://api.openai.com; " +
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
app.whenReady().then(() => {
  // Initialize OpenAI first
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey || apiKey === 'your-api-key-here') {
    console.error('WARNING: OPENAI_API_KEY not set in .env file')
    console.error('Please add your OpenAI API key to the .env file')
  } else {
    try {
      initializeOpenAI(apiKey)
      console.log('OpenAI initialized successfully')
    } catch (error) {
      console.error('Failed to initialize OpenAI:', error)
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

// OpenAI IPC Handlers

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

// Check OpenAI status
ipcMain.handle('openai-status', async () => {
  const status = getStatus()
  return {
    success: true,
    ...status
  }
})

// Transcribe audio file
ipcMain.handle('transcribe-audio', async (_event, audioPath: string) => {
  try {
    console.log('Received transcription request for:', audioPath)

    if (!isInitialized()) {
      throw new Error('OpenAI not initialized. Please check your API key in .env file.')
    }

    const text = await transcribeAudio(audioPath)

    // Clean up the temp file after transcription
    try {
      await fs.unlink(audioPath)
      console.log('Cleaned up temp file:', audioPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError)
    }

    return {
      success: true,
      text: text
    }
  } catch (error: any) {
    console.error('Transcription error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
})

// Save audio buffer and transcribe
ipcMain.handle('save-and-transcribe', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    console.log('Received audio buffer, size:', audioBuffer.byteLength, 'bytes')

    if (!isInitialized()) {
      throw new Error('OpenAI not initialized. Please check your API key in .env file.')
    }

    // Save audio buffer to temp file
    const timestamp = Date.now()
    const filename = `recording_${timestamp}.webm`
    const audioPath = await saveAudioFile(audioBuffer, filename)
    console.log('Saved audio file to:', audioPath)

    // Transcribe the audio
    const text = await transcribeAudio(audioPath)

    // Clean up the temp file
    try {
      await fs.unlink(audioPath)
      console.log('Cleaned up temp file:', audioPath)
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError)
    }

    return {
      success: true,
      text: text
    }
  } catch (error: any) {
    console.error('Save and transcribe error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    }
  }
})

// Realtime Streaming IPC Handlers

// Start realtime session
ipcMain.handle('realtime-start', async () => {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey || apiKey === 'your-api-key-here') {
      throw new Error('OpenAI API key not configured')
    }

    // Stop any existing session first
    const existingSession = getRealtimeSession()
    if (existingSession) {
      console.log('Stopping existing session...')
      disconnectRealtime()
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log('Starting realtime session...')
    const session = createRealtimeSession(apiKey)

    // Set up event listeners
    session.on('transcription', (text: string) => {
      console.log('Realtime transcription:', text)
      if (mainWindow) {
        mainWindow.webContents.send('realtime-transcription', text)
      }
    })

    session.on('speech_started', () => {
      console.log('Speech started')
      if (mainWindow) {
        mainWindow.webContents.send('realtime-speech-started')
      }
    })

    session.on('speech_stopped', () => {
      console.log('Speech stopped')
      if (mainWindow) {
        mainWindow.webContents.send('realtime-speech-stopped')
      }
    })

    session.on('error', (error: any) => {
      console.error('Realtime error:', error)
      if (mainWindow) {
        mainWindow.webContents.send('realtime-error', error.message || 'Unknown error')
      }
    })

    await session.connect()

    return {
      success: true,
      message: 'Realtime session started'
    }
  } catch (error: any) {
    console.error('Failed to start realtime session:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// Send audio chunk to realtime session
ipcMain.handle('realtime-send-audio', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    const session = getRealtimeSession()

    if (!session) {
      throw new Error('Realtime session not started')
    }

    if (!session.getConnectionStatus()) {
      // Silently skip if not connected yet
      return { success: true }
    }

    const buffer = Buffer.from(audioBuffer)
    session.sendAudio(buffer)

    return { success: true }
  } catch (error: any) {
    // Don't log errors for every failed send attempt
    return {
      success: false,
      error: error.message
    }
  }
})

// Commit audio buffer (trigger transcription)
ipcMain.handle('realtime-commit', async () => {
  try {
    const session = getRealtimeSession()

    if (!session) {
      throw new Error('Realtime session not started')
    }

    session.commitAudio()

    return { success: true }
  } catch (error: any) {
    console.error('Failed to commit audio:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// Stop realtime session
ipcMain.handle('realtime-stop', async () => {
  try {
    console.log('Stopping realtime session...')
    disconnectRealtime()

    return {
      success: true,
      message: 'Realtime session stopped'
    }
  } catch (error: any) {
    console.error('Failed to stop realtime session:', error)
    return {
      success: false,
      error: error.message
    }
  }
})

// Get realtime status
ipcMain.handle('realtime-status', async () => {
  const session = getRealtimeSession()
  return {
    success: true,
    connected: session ? session.getConnectionStatus() : false
  }
})

console.log('AURIX Voice Assistant - OpenAI STT Integration Ready')
