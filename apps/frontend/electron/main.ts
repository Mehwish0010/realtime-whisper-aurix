import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import Groq from 'groq-sdk';
import { db } from '../src/lib/firebase-admin.ts';
import { initializeDeepgram, getDeepgramInstance, transcribeAudioFile } from './deepgram-stt.js';
import { createGroqConversationManager, getGroqConversationManager } from './groq-chat.js';
import {
  initializeDeepgramTTS,
  getDeepgramTTSInstance,
  synthesizeSpeech,
  AURA_VOICES,
  type AuraVoice,
} from './deepgram-tts.js';
import firebaseAdmin from 'firebase-admin';
import { initializeEmbeddingService, getEmbeddingService } from './embedding-service.js';
import {
  initializeVectorService,
  initializeVectorCollections,
  getVectorService,
} from './vector-service.js';
import {
  initializeRetrievalService,
  isRetrievalReady,
  indexConversationMessage,
  indexDocument,
  indexDocuments,
  search as retrievalSearch,
  searchDocumentation,
  buildContextPrompt,
} from './retrieval-service.js';
import { getVSCodeBridge } from './vscode-bridge.js';
import { AGENT_TOOLS, AGENT_SYSTEM_PROMPT, AGENT_MODEL } from './agent-tools.js';

const { firestore } = firebaseAdmin;

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
    title: 'AURIX Voice Assistant',
    icon: path.join(__dirname, '../public/vite.svg'),
  });

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
            "connect-src 'self' https://api.deepgram.com wss://api.deepgram.com https://api.groq.com ws://localhost:9877; " +
            "font-src 'self'; " +
            "worker-src 'self' blob:;",
        ],
      },
    });
  });

  // Handle permission requests
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      console.log('Permission requested:', permission);
      if (permission === 'media') {
        callback(true); // Allow microphone access
      } else {
        callback(false);
      }
    },
  );

  // Load app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();

    // Suppress console warnings from development tools
    mainWindow.webContents.on('console-message', (event, _level, message) => {
      if (message.includes('React DevTools') || message.includes('react-devtools')) {
        event.preventDefault();
      }
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Initialize Deepgram STT
  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

  if (!deepgramApiKey || deepgramApiKey === 'your-deepgram-api-key-here') {
    console.warn('WARNING: DEEPGRAM_API_KEY not set in .env file');
    console.warn('Deepgram STT/TTS will not be available');
    console.warn('Get your API key from: https://console.deepgram.com/');
  } else {
    try {
      // Initialize STT
      const deepgram = initializeDeepgram(deepgramApiKey);
      await deepgram.initialize();
      console.log('Deepgram STT initialized successfully');

      // Initialize TTS with Perseus voice (natural male)
      initializeDeepgramTTS(deepgramApiKey, 'perseus');
      console.log('Deepgram TTS initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
    }
  }

  // Initialize Groq Chat
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey || groqApiKey === 'your-groq-api-key-here') {
    console.warn('WARNING: GROQ_API_KEY not set in .env file');
    console.warn('Groq Chat will not be available');
    console.warn('Get your API key from: https://console.groq.com/keys');
  } else {
    try {
      // Create Groq client for chat
      const groqClient = new Groq({ apiKey: groqApiKey });

      // Initialize Groq chat manager
      createGroqConversationManager(groqClient, {
        systemPrompt:
          'You are a helpful voice assistant. Provide clear, concise, and friendly responses.',
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        maxTokens: 1000,
      });
      console.log('Groq chat manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Groq:', error);
    }
  }

  // Initialize RAG pipeline (embedding â†’ vector â†’ retrieval)
  try {
    const cohereApiKey = process.env.COHERE_API_KEY;
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;

    if (cohereApiKey) {
      initializeEmbeddingService(cohereApiKey);
      initializeVectorService(qdrantUrl, qdrantApiKey || undefined);
      await initializeVectorCollections();
      initializeRetrievalService();
      console.log('RAG pipeline initialized successfully');
    } else {
      console.warn('WARNING: COHERE_API_KEY not set â€” RAG pipeline disabled');
    }
  } catch (error) {
    console.error('Failed to initialize RAG pipeline (non-fatal):', error);
  }

  // Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Helper function to get temp directory path
async function getTempDir(): Promise<string> {
  const tempDir = path.join(app.getPath('userData'), 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

// Helper function to save audio buffer to file
async function saveAudioFile(audioBuffer: ArrayBuffer, filename: string): Promise<string> {
  const tempDir = await getTempDir();
  const filePath = path.join(tempDir, filename);
  const buffer = Buffer.from(audioBuffer);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

// Deepgram IPC Handlers

// Get temp path
ipcMain.handle('get-temp-path', async () => {
  try {
    const tempDir = await getTempDir();
    return tempDir;
  } catch (error) {
    console.error('Error getting temp path:', error);
    return app.getPath('temp');
  }
});

// Check Deepgram status
ipcMain.handle('deepgram-status', async () => {
  const deepgram = getDeepgramInstance();
  if (!deepgram) {
    return {
      success: false,
      error: 'Deepgram not initialized',
    };
  }
  const status = deepgram.getStatus();
  return {
    success: true,
    ...status,
  };
});

// Transcribe audio file (Deepgram)
ipcMain.handle('deepgram-transcribe-audio', async (_event, audioPath: string) => {
  try {
    console.log('Received Deepgram transcription request for:', audioPath);

    const deepgram = getDeepgramInstance();
    if (!deepgram) {
      throw new Error('Deepgram not initialized. Please check your API key in .env file.');
    }

    const result = await transcribeAudioFile(audioPath);

    // Clean up the temp file after transcription
    try {
      await fs.unlink(audioPath);
      console.log('Cleaned up temp file:', audioPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError);
    }

    return {
      success: true,
      text: result.transcript,
      confidence: result.confidence,
      words: result.words,
    };
  } catch (error: any) {
    console.error('Deepgram transcription error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
});

// Save audio buffer and transcribe (Deepgram)
ipcMain.handle('deepgram-save-and-transcribe', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    console.log('Received audio buffer for Deepgram, size:', audioBuffer.byteLength, 'bytes');

    const deepgram = getDeepgramInstance();
    if (!deepgram) {
      throw new Error('Deepgram not initialized. Please check your API key in .env file.');
    }

    // Validate audio buffer size
    if (audioBuffer.byteLength < 1000) {
      throw new Error('Audio file too small. Recording may have failed. Please try again.');
    }

    console.log('Audio buffer validated:', audioBuffer.byteLength, 'bytes');

    // Save audio buffer to temp file
    const timestamp = Date.now();
    const filename = `recording_${timestamp}.webm`;
    const audioPath = await saveAudioFile(audioBuffer, filename);
    console.log('Saved audio file to:', audioPath);

    // Transcribe the audio
    console.log('¤ Starting Deepgram transcription...');
    const result = await transcribeAudioFile(audioPath);
    console.log(' Transcription result:', result.transcript);
    console.log('Š Confidence:', (result.confidence * 100).toFixed(1) + '%');

    try {
      await db
        .collection('users')
        .doc('userId')
        .collection('conversations')
        .doc('conversationId')
        .collection('messages')
        .add({
          role: 'user',
          userInput: result.transcript,
          createdAt: firestore.FieldValue.serverTimestamp(),
        });

      console.log('Saved to database successfully');
    } catch (error) {
      console.log('Failed to save in database: ', error);
    }

    // Clean up the temp file
    try {
      await fs.unlink(audioPath);
      console.log('Cleaned up temp file:', audioPath);
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError);
    }

    return {
      success: true,
      text: result.transcript,
      confidence: result.confidence,
      words: result.words,
    };
  } catch (error: any) {
    console.error(' Deepgram save and transcribe error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
});

// Deepgram Live Streaming IPC Handlers

// Start live transcription session
ipcMain.handle('deepgram-live-start', async () => {
  try {
    console.log('Starting Deepgram live transcription...');

    const deepgram = getDeepgramInstance();
    if (!deepgram) {
      throw new Error('Deepgram not initialized. Please check your API key in .env file.');
    }

    // Set up event listeners
    deepgram.on('transcript', (result: any) => {
      console.log(' Live transcription:', result.transcript);
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-transcript', {
          transcript: result.transcript,
          confidence: result.confidence,
          isFinal: result.isFinal,
          words: result.words,
        });
      }
    });

    deepgram.on('speechStarted', () => {
      console.log('¤ Speech started');
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-speech-started');
      }
    });

    deepgram.on('utteranceEnd', () => {
      console.log('š Utterance ended');
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-utterance-end');
      }
    });

    deepgram.on('error', (error: any) => {
      console.error('Deepgram error:', error);
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-error', error.message || 'Unknown error');
      }
    });

    deepgram.on('connected', () => {
      console.log(' Deepgram live session connected');
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-connected');
      }
    });

    deepgram.on('closed', () => {
      console.log(' Deepgram live session closed');
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-closed');
      }
    });

    await deepgram.startLiveTranscription();

    return {
      success: true,
      message: 'Deepgram live transcription started',
    };
  } catch (error: any) {
    console.error(' Failed to start live transcription:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Send audio chunk to live session
ipcMain.handle('deepgram-send-audio', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    const deepgram = getDeepgramInstance();
    if (!deepgram) {
      throw new Error('Deepgram not initialized');
    }

    const buffer = Buffer.from(audioBuffer);
    deepgram.sendAudio(buffer);

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

// Stop live transcription session
ipcMain.handle('deepgram-live-stop', async () => {
  try {
    console.log(' Stopping Deepgram live transcription...');

    const deepgram = getDeepgramInstance();
    if (!deepgram) {
      throw new Error('Deepgram not initialized');
    }

    await deepgram.stopLiveTranscription();

    return {
      success: true,
      message: 'Deepgram live transcription stopped',
    };
  } catch (error: any) {
    console.error('Failed to stop live transcription:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// Chat IPC Handlers (using Groq)

ipcMain.handle('chat-send-message', async (_event, message: string) => {
  try {
    console.log('Chat message received:', message);

    const chatManager = getGroqConversationManager();

    if (!chatManager.isInitialized()) {
      throw new Error('Groq chat manager not initialized.');
    }

    // RAG: retrieve relevant context and prepend to message
    let augmentedMessage = message;
    if (isRetrievalReady()) {
      try {
        const results = await retrievalSearch(message, 'userId', 5);
        const contextPrompt = buildContextPrompt(results);
        if (contextPrompt) {
          augmentedMessage = contextPrompt + message;
          console.log(`RAG: injected ${results.length} context results`);
        }
      } catch (ragError) {
        console.warn('RAG retrieval failed (non-fatal):', ragError);
      }
    }

    const response = await chatManager.sendMessage(augmentedMessage);

    // RAG: index user message and AI response
    if (isRetrievalReady()) {
      try {
        const convId = 'conversationId';
        const msgTimestamp = String(Date.now());
        await Promise.all([
          indexConversationMessage({
            content: message,
            userId: 'userId',
            conversationId: convId,
            messageId: `user-${msgTimestamp}`,
            role: 'user',
          }),
          indexConversationMessage({
            content: response,
            userId: 'userId',
            conversationId: convId,
            messageId: `aurix-${msgTimestamp}`,
            role: 'aurix',
          }),
        ]);
        console.log('RAG: indexed user message and AI response');
      } catch (indexError) {
        console.warn('RAG indexing failed (non-fatal):', indexError);
      }
    }

    await db
      .collection('users')
      .doc('userId')
      .collection('conversations')
      .doc('conversationId')
      .collection('messages')
      .add({
        role: 'aurix',
        aurixResponse: response,
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

    console.log('Aurix response is successfully saved in database');

    return {
      success: true,
      response: response,
    };
  } catch (error: any) {
    console.error('Chat error:', error);
    console.log('Error saving aurix response in database');
    return {
      success: false,
      error: error.message || 'Unknown chat error occurred',
    };
  }
});

ipcMain.handle('chat-clear-history', async () => {
  try {
    const chatManager = getGroqConversationManager();
    chatManager.clearHistory();

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('Clear history error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('chat-get-history', async () => {
  try {
    const chatManager = getGroqConversationManager();
    const history = chatManager.getHistory();

    return {
      success: true,
      history: history,
    };
  } catch (error: any) {
    console.error('Get history error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('chat-set-system-prompt', async (_event, prompt: string) => {
  try {
    const chatManager = getGroqConversationManager();
    chatManager.setSystemPrompt(prompt);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('Set system prompt error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

// TTS IPC Handlers (using Deepgram Aura)

ipcMain.handle('tts-synthesize', async (_event, text: string) => {
  try {
    console.log('Š TTS request:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    const tts = getDeepgramTTSInstance();
    if (!tts || !tts.isInitialized()) {
      throw new Error('Deepgram TTS not initialized');
    }

    const audioBuffer = await synthesizeSpeech(text);
    console.log(' TTS audio generated:', audioBuffer.length, 'bytes');

    // Return as ArrayBuffer for the renderer
    return {
      success: true,
      audio: audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength,
      ),
    };
  } catch (error: any) {
    console.error(' TTS error:', error);
    return {
      success: false,
      error: error.message || 'TTS synthesis failed',
    };
  }
});

ipcMain.handle('tts-set-voice', async (_event, voice: string) => {
  try {
    const tts = getDeepgramTTSInstance();
    if (!tts) {
      throw new Error('Deepgram TTS not initialized');
    }

    tts.setVoice(voice as AuraVoice);
    console.log(' TTS voice changed to:', voice);

    return { success: true, voice };
  } catch (error: any) {
    console.error(' TTS set voice error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('tts-get-voices', async () => {
  try {
    return {
      success: true,
      voices: AURA_VOICES,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('tts-status', async () => {
  const tts = getDeepgramTTSInstance();
  if (!tts || !tts.isInitialized()) {
    return {
      success: false,
      error: 'Deepgram TTS not initialized',
    };
  }
  return {
    success: true,
    initialized: true,
    voice: tts.getVoice(),
  };
});

// Retrieval IPC Handlers

ipcMain.handle(
  'retrieval-search',
  async (_event, query: string, userId?: string, limit?: number) => {
    try {
      if (!isRetrievalReady()) {
        return { success: false, error: 'Retrieval service not available' };
      }
      const results = await retrievalSearch(query, userId || 'userId', limit || 5);
      return { success: true, results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle('retrieval-search-docs', async (_event, query: string, limit?: number) => {
  try {
    if (!isRetrievalReady()) {
      return { success: false, error: 'Retrieval service not available' };
    }
    const results = await searchDocumentation(query, limit || 5);
    return { success: true, results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  'retrieval-index-document',
  async (_event, params: { content: string; source: string; title: string }) => {
    try {
      if (!isRetrievalReady()) {
        return { success: false, error: 'Retrieval service not available' };
      }
      await indexDocument(params);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle(
  'retrieval-index-documents',
  async (_event, paramsList: { content: string; source: string; title: string }[]) => {
    try {
      if (!isRetrievalReady()) {
        return { success: false, error: 'Retrieval service not available' };
      }
      await indexDocuments(paramsList);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle('retrieval-status', async () => {
  return {
    success: true,
    available: isRetrievalReady(),
    embeddingService: getEmbeddingService() !== null,
    vectorService: getVectorService() !== null,
  };
});

// VS Code Agent IPC Handlers

ipcMain.handle('vscode-connect', async () => {
  try {
    const bridge = getVSCodeBridge();
    await bridge.connect();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('vscode-disconnect', async () => {
  try {
    const bridge = getVSCodeBridge();
    bridge.disconnect();
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('vscode-status', async () => {
  const bridge = getVSCodeBridge();
  return { success: true, connected: bridge.isConnected() };
});

ipcMain.handle('agent-execute-task', async (_event, message: string) => {
  try {
    const bridge = getVSCodeBridge();
    if (!bridge.isConnected()) {
      throw new Error(
        'VS Code extension not connected. Please open VS Code and ensure the Aurix extension is running.',
      );
    }

    const chatManager = getGroqConversationManager();
    if (!chatManager.isInitialized()) {
      throw new Error('Groq chat not initialized.');
    }

    // Save original config, clear history, switch to agent mode
    const originalConfig = chatManager.getConfig();
    chatManager.clearHistory();
    chatManager.setSystemPrompt(AGENT_SYSTEM_PROMPT);
    chatManager.updateConfig({ model: AGENT_MODEL });

    const steps: Array<{ tool: string; args: any; result: any }> = [];

    const response = await chatManager.sendAgentMessage(
      message,
      AGENT_TOOLS,
      async (toolName, args) => {
        // Execute tool via VS Code bridge
        const result = await bridge.sendCommand(toolName, args);

        // Notify renderer about the step in real-time
        if (mainWindow) {
          mainWindow.webContents.send('agent-step', {
            tool: toolName,
            args,
            result,
            timestamp: Date.now(),
          });
        }

        return result;
      },
      (step) => {
        steps.push(step);
      },
    );

    // Restore original config
    chatManager.setSystemPrompt(originalConfig.systemPrompt || '');
    chatManager.updateConfig({ model: originalConfig.model });

    return {
      success: true,
      response,
      steps,
    };
  } catch (error: any) {
    console.error('Agent execution error:', error);
    return { success: false, error: error.message };
  }
});

console.log('AURIX Voice Assistant - Deepgram STT + TTS + Groq Chat Integration Ready');
