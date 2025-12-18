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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
