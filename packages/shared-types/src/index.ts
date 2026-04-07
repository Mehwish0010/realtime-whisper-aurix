/**
 * Shared TypeScript types for Aurix monorepo
 * Used by both desktop app and any future web apps
 */

// Deepgram Types
export interface DeepgramConfig {
  apiKey: string;
  model?: string;
  language?: string;
}

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

export interface TTSConfig {
  voice: string;
  model?: string;
}

// Groq Types
export interface GroqConfig {
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  message: string;
  role: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// RAG Types
export interface SearchQuery {
  query: string;
  limit?: number;
  scoreThreshold?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, any>;
}

export interface DocumentUpload {
  content: string;
  metadata?: Record<string, any>;
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Configuration Types
export interface AppConfig {
  deepgram: DeepgramConfig;
  groq: GroqConfig;
  apiUrl: string;
}

// Audio Types
export interface AudioConfig {
  sampleRate: number;
  channels: number;
  encoding: string;
}

// Firebase Types
export interface FirebaseConfig {
  projectId: string;
  privateKey?: string;
  clientEmail?: string;
}
