const { contextBridge, ipcRenderer } = require('electron')

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // OpenAI transcription methods
  transcribeAudio: (audioPath: string) => ipcRenderer.invoke('transcribe-audio', audioPath),
  getTempPath: () => ipcRenderer.invoke('get-temp-path'),
  saveAndTranscribe: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('save-and-transcribe', audioBuffer),
  openaiStatus: () => ipcRenderer.invoke('openai-status'),

  // Realtime streaming methods
  realtimeStart: () => ipcRenderer.invoke('realtime-start'),
  realtimeSendAudio: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('realtime-send-audio', audioBuffer),
  realtimeCommit: () => ipcRenderer.invoke('realtime-commit'),
  realtimeStop: () => ipcRenderer.invoke('realtime-stop'),
  realtimeStatus: () => ipcRenderer.invoke('realtime-status'),

  // Realtime event listeners
  onRealtimeTranscription: (callback: (text: string) => void) => {
    ipcRenderer.on('realtime-transcription', (_event: any, text: string) => callback(text))
  },
  onRealtimeSpeechStarted: (callback: () => void) => {
    ipcRenderer.on('realtime-speech-started', () => callback())
  },
  onRealtimeSpeechStopped: (callback: () => void) => {
    ipcRenderer.on('realtime-speech-stopped', () => callback())
  },
  onRealtimeError: (callback: (error: string) => void) => {
    ipcRenderer.on('realtime-error', (_event: any, error: string) => callback(error))
  },

  // TTS methods
  ttsSynthesize: (text: string, options?: any) => ipcRenderer.invoke('tts-synthesize', text, options),
  ttsStatus: () => ipcRenderer.invoke('tts-status'),

  // Chat methods
  chatSendMessage: (message: string) => ipcRenderer.invoke('chat-send-message', message),
  chatClearHistory: () => ipcRenderer.invoke('chat-clear-history'),
  chatGetHistory: () => ipcRenderer.invoke('chat-get-history'),
  chatSetSystemPrompt: (prompt: string) => ipcRenderer.invoke('chat-set-system-prompt', prompt),

  // Conversation orchestrator methods
  conversationStart: (options?: any) => ipcRenderer.invoke('conversation-start', options),
  conversationStop: () => ipcRenderer.invoke('conversation-stop'),
  conversationStatus: () => ipcRenderer.invoke('conversation-status'),
  conversationStartRecording: () => ipcRenderer.invoke('conversation-start-recording'),

  // Conversation event listeners
  onUserSpoke: (callback: (text: string) => void) => {
    ipcRenderer.on('conversation-user-spoke', (_event: any, text: string) => callback(text))
  },
  onAIResponse: (callback: (text: string) => void) => {
    ipcRenderer.on('conversation-ai-response', (_event: any, text: string) => callback(text))
  },
  onAIAudio: (callback: (audioBuffer: ArrayBuffer) => void) => {
    ipcRenderer.on('conversation-ai-audio', (_event: any, buffer: ArrayBuffer) => callback(buffer))
  },
  onConversationStateChanged: (callback: (state: string) => void) => {
    ipcRenderer.on('conversation-state-changed', (_event: any, state: string) => callback(state))
  },
  onConversationError: (callback: (error: string) => void) => {
    ipcRenderer.on('conversation-error', (_event: any, error: string) => callback(error))
  },
  onConversationStopped: (callback: () => void) => {
    ipcRenderer.on('conversation-stopped', () => callback())
  },
  onConversationTurnComplete: (callback: () => void) => {
    ipcRenderer.on('conversation-turn-complete', () => callback())
  },
  onConversationNoSpeech: (callback: () => void) => {
    ipcRenderer.on('conversation-no-speech', () => callback())
  }
})
