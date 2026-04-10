import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { db } from '../src/lib/firebase-admin.ts';
import { initializeDeepgram, getDeepgramInstance } from './deepgram-stt.js';
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

const BACKEND_URL = 'http://localhost:8000';
let currentTTSVoice = 'aura-perseus-en';
let mainWindow: BrowserWindow | null = null;

/** Extract a human-readable error string from a backend JSON response body */
async function extractBackendError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') return body.detail;
    if (body?.detail) return JSON.stringify(body.detail);
    return fallback;
  } catch {
    return fallback;
  }
}

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
            "connect-src 'self' https://api.deepgram.com wss://api.deepgram.com https://api.groq.com ws://localhost:9877 http://localhost:8000; " +
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
      // Initialize STT (live streaming still uses direct WebSocket)
      const deepgram = initializeDeepgram(deepgramApiKey);
      await deepgram.initialize();
      console.log('Deepgram STT initialized successfully (live streaming)');
    } catch (error) {
      console.error('Failed to initialize Deepgram:', error);
    }
  }

  // Initialize RAG pipeline (embedding → vector → retrieval)
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
      console.warn('WARNING: COHERE_API_KEY not set — RAG pipeline disabled');
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

// Check Deepgram status (via backend health)
ipcMain.handle('deepgram-status', async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    if (!response.ok) throw new Error('Backend not reachable');
    const data = (await response.json()) as { status: string };
    return {
      success: true,
      initialized: data.status === 'healthy',
      status: data.status,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Backend not reachable',
    };
  }
});

// Transcribe audio file (via backend)
ipcMain.handle('deepgram-transcribe-audio', async (_event, audioPath: string) => {
  try {
    console.log('Received transcription request for:', audioPath);

    const audioData = await fs.readFile(audioPath);
    const formData = new FormData();
    formData.append('file', new Blob([audioData]), path.basename(audioPath));

    const response = await fetch(`${BACKEND_URL}/api/v1/deepgram/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = (await response.json()) as { detail?: string };
      throw new Error(err.detail || 'Transcription failed');
    }

    const result = (await response.json()) as { transcript: string; confidence: number; words: any[] };

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
    console.error('Transcription error:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
});

// Save audio buffer and transcribe (via backend)
ipcMain.handle('deepgram-save-and-transcribe', async (_event, audioBuffer: ArrayBuffer) => {
  try {
    console.log('Received audio buffer, size:', audioBuffer.byteLength, 'bytes');

    // Validate audio buffer size
    if (audioBuffer.byteLength < 1000) {
      throw new Error('Audio file too small. Recording may have failed. Please try again.');
    }

    // Send to backend for transcription
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), `recording_${Date.now()}.webm`);

    const response = await fetch(`${BACKEND_URL}/api/v1/deepgram/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = (await response.json()) as { detail?: string };
      throw new Error(err.detail || 'Transcription failed');
    }

    const result = (await response.json()) as { transcript: string; confidence: number; words: any[] };
    console.log('Transcription result:', result.transcript);
    console.log('Confidence:', ((result.confidence ?? 0) * 100).toFixed(1) + '%');

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

    return {
      success: true,
      text: result.transcript,
      confidence: result.confidence,
      words: result.words,
    };
  } catch (error: any) {
    console.error('Save and transcribe error:', error);
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
      console.log('� Speech started');
      if (mainWindow) {
        mainWindow.webContents.send('deepgram-speech-started');
      }
    });

    deepgram.on('utteranceEnd', () => {
      console.log('� Utterance ended');
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

    // Send to backend (backend manages history)
    const backendResponse = await fetch(`${BACKEND_URL}/api/v1/groq/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: augmentedMessage }),
    });

    if (!backendResponse.ok) {
      const errorMsg = await extractBackendError(backendResponse, 'Chat request failed');
      console.error('Backend chat error:', backendResponse.status, errorMsg);
      throw new Error(errorMsg);
    }

    const data = (await backendResponse.json()) as { message: string; role: string; usage?: any };
    const response = data.message;

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
    const response = await fetch(`${BACKEND_URL}/api/v1/groq/chat/history`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const errorMsg = await extractBackendError(response, 'Failed to clear history');
      throw new Error(errorMsg);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Clear history error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('chat-get-history', async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/groq/chat/history`);

    if (!response.ok) {
      const errorMsg = await extractBackendError(response, 'Failed to get history');
      throw new Error(errorMsg);
    }

    const data = (await response.json()) as { history: any[] };
    return { success: true, history: data.history };
  } catch (error: any) {
    console.error('Get history error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('chat-set-system-prompt', async (_event, prompt: string) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/groq/chat/system-prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorMsg = await extractBackendError(response, 'Failed to set system prompt');
      throw new Error(errorMsg);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Set system prompt error:', error);
    return { success: false, error: error.message };
  }
});

// TTS IPC Handlers (using Deepgram Aura)

ipcMain.handle('tts-synthesize', async (_event, text: string) => {
  try {
    console.log('TTS request:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    const response = await fetch(`${BACKEND_URL}/api/v1/deepgram/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: currentTTSVoice }),
    });

    if (!response.ok) {
      const err = (await response.json()) as { detail?: string };
      throw new Error(err.detail || 'TTS synthesis failed');
    }

    const audioArrayBuffer = await response.arrayBuffer();
    console.log('TTS audio received:', audioArrayBuffer.byteLength, 'bytes');

    return {
      success: true,
      audio: audioArrayBuffer,
    };
  } catch (error: any) {
    console.error('TTS error:', error);
    return {
      success: false,
      error: error.message || 'TTS synthesis failed',
    };
  }
});

ipcMain.handle('tts-set-voice', async (_event, voice: string) => {
  try {
    currentTTSVoice = voice;
    console.log('TTS voice changed to:', voice);
    return { success: true, voice };
  } catch (error: any) {
    console.error('TTS set voice error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('tts-get-voices', async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/deepgram/voices`);
    if (!response.ok) throw new Error('Failed to fetch voices');
    const data = (await response.json()) as { voices: string[] };
    return {
      success: true,
      voices: data.voices,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('tts-status', async () => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    if (!response.ok) throw new Error('Backend not reachable');
    return {
      success: true,
      initialized: true,
      voice: currentTTSVoice,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Backend not reachable',
    };
  }
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

    // Set agent system prompt on backend before starting
    await fetch(`${BACKEND_URL}/api/v1/groq/chat/system-prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: AGENT_SYSTEM_PROMPT }),
    });

    // Clear history for fresh agent session
    await fetch(`${BACKEND_URL}/api/v1/groq/chat/history`, { method: 'DELETE' });

    const steps: Array<{ tool: string; args: any; result: any }> = [];

    // Step 1: Send initial agent message to backend
    let agentResponse = await fetch(`${BACKEND_URL}/api/v1/groq/chat/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tools: AGENT_TOOLS }),
    });

    if (!agentResponse.ok) {
      const errorMsg = await extractBackendError(agentResponse, 'Agent request failed');
      throw new Error(errorMsg);
    }

    let result = (await agentResponse.json()) as {
      type: string;
      response?: string;
      tool_calls?: Array<{ id: string; name: string; arguments: any }>;
    };

    // Step 2-5: Loop until final text response
    while (result.type === 'tool_calls' && result.tool_calls) {
      const toolResults: Array<{ tool_call_id: string; result: any }> = [];

      // Execute each tool call via VS Code bridge
      for (const toolCall of result.tool_calls) {
        let toolResult: any;
        try {
          toolResult = await bridge.sendCommand(toolCall.name, toolCall.arguments);
        } catch (err: any) {
          toolResult = { error: err.message };
        }

        // Track step
        const step = { tool: toolCall.name, args: toolCall.arguments, result: toolResult };
        steps.push(step);

        // Notify renderer about the step in real-time
        if (mainWindow) {
          mainWindow.webContents.send('agent-step', {
            tool: toolCall.name,
            args: toolCall.arguments,
            result: toolResult,
            timestamp: Date.now(),
          });
        }

        toolResults.push({ tool_call_id: toolCall.id, result: toolResult });
      }

      // Submit tool results back to backend
      agentResponse = await fetch(`${BACKEND_URL}/api/v1/groq/chat/agent/tool-results`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_results: toolResults }),
      });

      if (!agentResponse.ok) {
        const errorMsg = await extractBackendError(agentResponse, 'Agent tool results submission failed');
        throw new Error(errorMsg);
      }

      result = (await agentResponse.json()) as {
        type: string;
        response?: string;
        tool_calls?: Array<{ id: string; name: string; arguments: any }>;
      };
    }

    // Restore default system prompt
    await fetch(`${BACKEND_URL}/api/v1/groq/chat/system-prompt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'You are a helpful voice assistant. Provide clear, concise, and friendly responses.',
      }),
    });

    return {
      success: true,
      response: result.response || 'Done.',
      steps,
    };
  } catch (error: any) {
    console.error('Agent execution error:', error);
    return { success: false, error: error.message };
  }
});

console.log('AURIX Voice Assistant - Deepgram STT + TTS + Groq Chat Integration Ready');
