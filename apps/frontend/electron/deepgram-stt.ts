import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { EventEmitter } from 'events';
import * as fs from 'fs';

interface DeepgramSTTConfig {
  apiKey: string;
  model?: string;
  language?: string;
  encoding?: string;
  sampleRate?: number;
  interimResults?: boolean;
}

interface TranscriptionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  words?: Array<{
    word: string;
    confidence: number;
    start: number;
    end: number;
  }>;
}

export class DeepgramSTT extends EventEmitter {
  private client: any;
  private connection: any;
  private config: DeepgramSTTConfig;
  private isInitialized: boolean = false;
  private isConnected: boolean = false;
  private latencyLog: Array<{ timestamp: number; latency: number }> = [];

  constructor(config: DeepgramSTTConfig) {
    super();
    this.config = {
      model: 'nova-2',
      language: 'en',
      encoding: 'linear16',
      sampleRate: 16000,
      interimResults: true,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    try {
      this.client = createClient(this.config.apiKey);
      this.isInitialized = true;
      console.log(' Deepgram client initialized successfully');
    } catch (error) {
      console.error(' Failed to initialize Deepgram client:', error);
      throw error;
    }
  }

  async startLiveTranscription(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Deepgram client not initialized. Call initialize() first.');
    }

    try {
      this.connection = this.client.listen.live({
        model: this.config.model,
        language: this.config.language,
        encoding: this.config.encoding,
        sample_rate: this.config.sampleRate,
        interim_results: this.config.interimResults,
        smart_format: true,
        punctuate: true,
        utterance_end_ms: 1000,
        vad_events: true,
      });

      // Set up event handlers
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log(' Deepgram connection opened - Ready for audio!');
        this.isConnected = true;
        this.emit('connected');
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const startTime = Date.now();

        if (data.channel?.alternatives?.[0]) {
          const alternative = data.channel.alternatives[0];
          const result: TranscriptionResult = {
            transcript: alternative.transcript,
            confidence: alternative.confidence,
            isFinal: data.is_final || false,
            words: alternative.words?.map((word: any) => ({
              word: word.word,
              confidence: word.confidence,
              start: word.start,
              end: word.end,
            })),
          };

          // Calculate latency
          const latency = Date.now() - startTime;
          this.latencyLog.push({ timestamp: Date.now(), latency });

          // Log transcription with confidence color coding
          if (result.transcript) {
            const confidenceColor = this.getConfidenceColor(result.confidence);
            const finalIndicator = result.isFinal ? 'âœ“' : 'â‹¯';
            console.log(
              `${finalIndicator} ¤ ${result.transcript} ${confidenceColor}(${(result.confidence * 100).toFixed(1)}%)${this.resetColor()}`,
            );

            // Log word-level confidence if available
            if (result.words && result.words.length > 0) {
              const coloredWords = result.words.map((word) => {
                const color = this.getConfidenceColor(word.confidence);
                return `${color}${word.word}(${(word.confidence * 100).toFixed(0)}%)${this.resetColor()}`;
              });
              console.log(`    ${coloredWords.join(' | ')}`);
            }

            // Log latency
            console.log(`    Latency: ${latency}ms`);

            this.emit('transcript', result);
          }
        }
      });

      this.connection.on(LiveTranscriptionEvents.Metadata, (data: any) => {
        console.log('Š Metadata:', data);
        this.emit('metadata', data);
      });

      this.connection.on(LiveTranscriptionEvents.UtteranceEnd, (data: any) => {
        console.log('š Utterance ended');
        this.emit('utteranceEnd', data);
      });

      this.connection.on(LiveTranscriptionEvents.SpeechStarted, (data: any) => {
        console.log('™ Speech started');
        this.emit('speechStarted', data);
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('Œ Connection closed');
        this.isConnected = false;
        this.emit('closed');
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error(' Deepgram error:', error);
        this.emit('error', error);
      });

      console.log('™ Live transcription started');
    } catch (error) {
      console.error(' Failed to start live transcription:', error);
      throw error;
    }
  }

  sendAudio(audioData: Buffer): void {
    if (!this.isConnected || !this.connection) {
      console.warn(' Cannot send audio: Not connected to Deepgram');
      return;
    }

    try {
      this.connection.send(audioData);
    } catch (error) {
      console.error(' Failed to send audio:', error);
      this.emit('error', error);
    }
  }

  async stopLiveTranscription(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.finish();
        console.log('‘ Live transcription stopped');

        // Log average latency
        if (this.latencyLog.length > 0) {
          const avgLatency =
            this.latencyLog.reduce((sum, log) => sum + log.latency, 0) / this.latencyLog.length;
          console.log(
            `Š Average latency: ${avgLatency.toFixed(2)}ms over ${this.latencyLog.length} transcriptions`,
          );
          this.latencyLog = [];
        }
      } catch (error) {
        console.error(' Error stopping transcription:', error);
      }
      this.connection = null;
      this.isConnected = false;
    }
  }

  async transcribeFile(audioPath: string): Promise<TranscriptionResult> {
    if (!this.isInitialized) {
      throw new Error('Deepgram client not initialized. Call initialize() first.');
    }

    try {
      console.log(` Transcribing file: ${audioPath}`);

      // Read the audio file
      const audioBuffer = fs.readFileSync(audioPath);

      // Transcribe using prerecorded API
      const { result, error } = await this.client.listen.prerecorded.transcribeFile(audioBuffer, {
        model: this.config.model,
        language: this.config.language,
        smart_format: true,
        punctuate: true,
      });

      if (error) {
        throw error;
      }

      const alternative = result.results?.channels[0]?.alternatives[0];
      if (!alternative) {
        throw new Error('No transcription result returned');
      }

      const transcriptionResult: TranscriptionResult = {
        transcript: alternative.transcript,
        confidence: alternative.confidence,
        isFinal: true,
        words: alternative.words?.map((word: any) => ({
          word: word.word,
          confidence: word.confidence,
          start: word.start,
          end: word.end,
        })),
      };

      console.log(` Transcription: ${transcriptionResult.transcript}`);
      console.log(`   Confidence: ${(transcriptionResult.confidence * 100).toFixed(1)}%`);

      return transcriptionResult;
    } catch (error) {
      console.error(' Failed to transcribe file:', error);
      throw error;
    }
  }

  getStatus(): {
    initialized: boolean;
    connected: boolean;
    avgLatency: number | null;
  } {
    const avgLatency =
      this.latencyLog.length > 0
        ? this.latencyLog.reduce((sum, log) => sum + log.latency, 0) / this.latencyLog.length
        : null;

    return {
      initialized: this.isInitialized,
      connected: this.isConnected,
      avgLatency,
    };
  }

  private getConfidenceColor(confidence: number): string {
    if (confidence >= 0.9) return '\x1b[92m'; // GREEN
    if (confidence >= 0.8) return '\x1b[93m'; // YELLOW
    if (confidence >= 0.7) return '\x1b[91m'; // ORANGE (using red as fallback)
    return '\x1b[31m'; // RED
  }

  private resetColor(): string {
    return '\x1b[0m';
  }
}

// Singleton instance
let deepgramSTT: DeepgramSTT | null = null;

export function initializeDeepgram(apiKey: string): DeepgramSTT {
  if (!apiKey) {
    throw new Error('Deepgram API key is required');
  }

  deepgramSTT = new DeepgramSTT({ apiKey });
  return deepgramSTT;
}

export function getDeepgramInstance(): DeepgramSTT | null {
  return deepgramSTT;
}

export async function transcribeAudioFile(audioPath: string): Promise<TranscriptionResult> {
  if (!deepgramSTT) {
    throw new Error('Deepgram not initialized. Call initializeDeepgram() first.');
  }

  if (!deepgramSTT.getStatus().initialized) {
    await deepgramSTT.initialize();
  }

  return deepgramSTT.transcribeFile(audioPath);
}
