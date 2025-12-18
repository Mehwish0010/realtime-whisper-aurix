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
  }
})
