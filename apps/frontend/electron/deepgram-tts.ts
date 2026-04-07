import { createClient } from '@deepgram/sdk';

// Available Deepgram Aura voices
export const AURA_VOICES = {
  // Female voices
  asteria: 'aura-asteria-en', // American female
  luna: 'aura-luna-en', // American female
  stella: 'aura-stella-en', // American female
  athena: 'aura-athena-en', // British female
  hera: 'aura-hera-en', // American female
  // Male voices
  orion: 'aura-orion-en', // American male
  arcas: 'aura-arcas-en', // American male
  perseus: 'aura-perseus-en', // American male
  angus: 'aura-angus-en', // Irish male
  orpheus: 'aura-orpheus-en', // American male
  helios: 'aura-helios-en', // British male
  zeus: 'aura-zeus-en', // American male
} as const;

export type AuraVoice = keyof typeof AURA_VOICES;

interface DeepgramTTSConfig {
  apiKey: string;
  voice?: AuraVoice;
}

class DeepgramTTS {
  private client: ReturnType<typeof createClient> | null = null;
  private apiKey: string = '';
  private voice: string = AURA_VOICES.orion; // Default to Orion (natural male voice)

  initialize(config: DeepgramTTSConfig) {
    this.apiKey = config.apiKey;
    this.client = createClient(config.apiKey);
    if (config.voice) {
      this.voice = AURA_VOICES[config.voice];
    }
    console.log('Deepgram TTS initialized with voice:', this.voice);
  }

  setVoice(voice: AuraVoice) {
    this.voice = AURA_VOICES[voice];
    console.log('TTS voice changed to:', this.voice);
  }

  getVoice(): string {
    return this.voice;
  }

  getAvailableVoices(): typeof AURA_VOICES {
    return AURA_VOICES;
  }

  async synthesize(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('Deepgram TTS not initialized');
    }

    console.log('Synthesizing speech:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

    const response = await fetch(`https://api.deepgram.com/v1/speak?model=${this.voice}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Deepgram TTS error: ${response.status} - ${error}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('TTS audio generated:', buffer.length, 'bytes');
    return buffer;
  }

  isInitialized(): boolean {
    return this.client !== null;
  }
}

// Singleton instance
let ttsInstance: DeepgramTTS | null = null;

export function initializeDeepgramTTS(apiKey: string, voice?: AuraVoice): DeepgramTTS {
  ttsInstance = new DeepgramTTS();
  ttsInstance.initialize({ apiKey, voice });
  return ttsInstance;
}

export function getDeepgramTTSInstance(): DeepgramTTS | null {
  return ttsInstance;
}

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  if (!ttsInstance) {
    throw new Error('Deepgram TTS not initialized');
  }
  return ttsInstance.synthesize(text);
}
