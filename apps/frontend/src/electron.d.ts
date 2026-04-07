// Type definitions for Electron API
export interface ElectronAPI {
  // Deepgram transcription methods
  deepgramStatus: () => Promise<{
    success: boolean;
    initialized: boolean;
    connected: boolean;
    avgLatency: number | null;
    error?: string;
  }>;
  deepgramTranscribeAudio: (
    audioPath: string,
  ) => Promise<{ success: boolean; text?: string; confidence?: number; error?: string }>;
  deepgramSaveAndTranscribe: (
    audioBuffer: ArrayBuffer,
  ) => Promise<{ success: boolean; text?: string; confidence?: number; error?: string }>;
  deepgramSendAudio: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
  deepgramLiveStart: () => Promise<{ success: boolean; message?: string; error?: string }>;
  deepgramLiveStop: () => Promise<{ success: boolean; message?: string; error?: string }>;

  // OpenAI transcription methods
  transcribeAudio: (
    audioPath: string,
  ) => Promise<{ success: boolean; text?: string; error?: string }>;
  getTempPath: () => Promise<string>;
  saveAndTranscribe: (
    audioBuffer: ArrayBuffer,
  ) => Promise<{ success: boolean; text?: string; error?: string }>;
  openaiStatus: () => Promise<{ success: boolean; initialized: boolean; apiKey: string | null }>;

  // Groq transcription methods
  groqTranscribeAudio: (
    audioPath: string,
  ) => Promise<{ success: boolean; text?: string; error?: string }>;
  groqSaveAndTranscribe: (
    audioBuffer: ArrayBuffer,
  ) => Promise<{ success: boolean; text?: string; error?: string }>;
  groqStatus: () => Promise<{ success: boolean; initialized: boolean; apiKey: string | null }>;

  // Realtime streaming methods
  realtimeStart: () => Promise<{ success: boolean; message?: string; error?: string }>;
  realtimeSendAudio: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
  realtimeCommit: () => Promise<{ success: boolean; error?: string }>;
  realtimeStop: () => Promise<{ success: boolean; message?: string; error?: string }>;
  realtimeStatus: () => Promise<{ success: boolean; connected: boolean }>;

  // Realtime event listeners
  onRealtimeTranscription: (callback: (text: string) => void) => void;
  onRealtimeSpeechStarted: (callback: () => void) => void;
  onRealtimeSpeechStopped: (callback: () => void) => void;
  onRealtimeError: (callback: (error: string) => void) => void;
  onRealtimeRateLimit: (
    callback: (info: { retryCount: number; maxRetries: number; cooldownMs: number }) => void,
  ) => void;

  // TTS methods (Deepgram Aura)
  ttsSynthesize: (
    text: string,
  ) => Promise<{ success: boolean; audio?: ArrayBuffer; error?: string }>;
  ttsSetVoice: (voice: string) => Promise<{ success: boolean; voice?: string; error?: string }>;
  ttsGetVoices: () => Promise<{
    success: boolean;
    voices?: Record<string, string>;
    error?: string;
  }>;
  ttsStatus: () => Promise<{
    success: boolean;
    initialized?: boolean;
    voice?: string;
    error?: string;
  }>;

  // Chat methods
  chatSendMessage: (
    message: string,
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  chatClearHistory: () => Promise<{ success: boolean; error?: string }>;
  chatGetHistory: () => Promise<{ success: boolean; history?: any[]; error?: string }>;
  chatSetSystemPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>;

  // Retrieval methods
  retrievalSearch: (
    query: string,
    userId?: string,
    limit?: number,
  ) => Promise<{ success: boolean; results?: any[]; error?: string }>;
  retrievalSearchDocs: (
    query: string,
    limit?: number,
  ) => Promise<{ success: boolean; results?: any[]; error?: string }>;
  retrievalIndexDocument: (params: {
    content: string;
    source: string;
    title: string;
  }) => Promise<{ success: boolean; error?: string }>;
  retrievalIndexDocuments: (
    paramsList: { content: string; source: string; title: string }[],
  ) => Promise<{ success: boolean; error?: string }>;
  retrievalStatus: () => Promise<{
    success: boolean;
    available?: boolean;
    embeddingService?: boolean;
    vectorService?: boolean;
  }>;

  // Conversation orchestrator methods
  conversationStart: (
    options?: any,
  ) => Promise<{ success: boolean; message?: string; error?: string }>;
  conversationStop: () => Promise<{ success: boolean; message?: string; error?: string }>;
  conversationStatus: () => Promise<{
    success: boolean;
    isActive?: boolean;
    currentState?: string;
  }>;
  conversationStartRecording: () => Promise<{ success: boolean; message?: string; error?: string }>;

  // Conversation event listeners
  onUserSpoke: (callback: (text: string) => void) => void;
  onAIResponse: (callback: (text: string) => void) => void;
  onAIAudio: (callback: (audioBuffer: ArrayBuffer) => void) => void;
  onConversationStateChanged: (callback: (state: string) => void) => void;
  onConversationError: (callback: (error: string) => void) => void;
  onConversationStopped: (callback: () => void) => void;
  onConversationTurnComplete: (callback: () => void) => void;
  onConversationNoSpeech: (callback: () => void) => void;

  // Deepgram event listeners
  onDeepgramTranscript: (callback: (data: any) => void) => void;
  onDeepgramSpeechStarted: (callback: () => void) => void;
  onDeepgramSpeechEnded: (callback: () => void) => void;

  // VS Code Agent methods
  vscodeConnect: () => Promise<{ success: boolean; error?: string }>;
  vscodeDisconnect: () => Promise<{ success: boolean; error?: string }>;
  vscodeStatus: () => Promise<{ success: boolean; connected: boolean }>;
  agentExecuteTask: (message: string) => Promise<{
    success: boolean;
    response?: string;
    steps?: Array<{ tool: string; args: any; result: any }>;
    error?: string;
  }>;

  // Agent event listeners
  onAgentStep: (
    callback: (step: { tool: string; args: any; result: any; timestamp: number }) => void,
  ) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
