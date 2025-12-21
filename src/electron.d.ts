// Type definitions for Electron API
export interface ElectronAPI {
  // OpenAI transcription methods
  transcribeAudio: (audioPath: string) => Promise<{ success: boolean; text?: string; error?: string }>
  getTempPath: () => Promise<string>
  saveAndTranscribe: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; text?: string; error?: string }>
  openaiStatus: () => Promise<{ success: boolean; initialized: boolean; apiKey: string | null }>

  // Realtime streaming methods
  realtimeStart: () => Promise<{ success: boolean; message?: string; error?: string }>
  realtimeSendAudio: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>
  realtimeCommit: () => Promise<{ success: boolean; error?: string }>
  realtimeStop: () => Promise<{ success: boolean; message?: string; error?: string }>
  realtimeStatus: () => Promise<{ success: boolean; connected: boolean }>

  // Realtime event listeners
  onRealtimeTranscription: (callback: (text: string) => void) => void
  onRealtimeSpeechStarted: (callback: () => void) => void
  onRealtimeSpeechStopped: (callback: () => void) => void
  onRealtimeError: (callback: (error: string) => void) => void

  // TTS methods
  ttsSynthesize: (text: string, options?: any) => Promise<{ success: boolean; audio?: ArrayBuffer; error?: string }>
  ttsStatus: () => Promise<{ success: boolean; initialized: boolean }>

  // Chat methods
  chatSendMessage: (message: string) => Promise<{ success: boolean; response?: string; error?: string }>
  chatClearHistory: () => Promise<{ success: boolean; error?: string }>
  chatGetHistory: () => Promise<{ success: boolean; history?: any[]; error?: string }>
  chatSetSystemPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>

  // Conversation orchestrator methods
  conversationStart: (options?: any) => Promise<{ success: boolean; message?: string; error?: string }>
  conversationStop: () => Promise<{ success: boolean; message?: string; error?: string }>
  conversationStatus: () => Promise<{ success: boolean; isActive?: boolean; currentState?: string }>
  conversationStartRecording: () => Promise<{ success: boolean; message?: string; error?: string }>

  // Conversation event listeners
  onUserSpoke: (callback: (text: string) => void) => void
  onAIResponse: (callback: (text: string) => void) => void
  onAIAudio: (callback: (audioBuffer: ArrayBuffer) => void) => void
  onConversationStateChanged: (callback: (state: string) => void) => void
  onConversationError: (callback: (error: string) => void) => void
  onConversationStopped: (callback: () => void) => void
  onConversationTurnComplete: (callback: () => void) => void
  onConversationNoSpeech: (callback: () => void) => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
