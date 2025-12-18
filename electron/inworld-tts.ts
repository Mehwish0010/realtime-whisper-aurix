/**
 * Inworld.ai Text-to-Speech Integration
 *
 * This module handles text-to-speech conversion using the Inworld.ai API.
 * It supports voice customization, text chunking for long inputs, and
 * returns audio data in various formats (MP3, OGG_OPUS, WAV).
 */

interface InworldConfig {
  workspaceId: string
  apiKey: string
  apiSecret: string
  defaultVoice?: string
  defaultModel?: 'inworld-tts-1' | 'inworld-tts-1-max'
}

interface TTSOptions {
  text: string
  voiceId?: string
  modelId?: 'inworld-tts-1' | 'inworld-tts-1-max'
  audioConfig?: {
    audioEncoding?: 'LINEAR16' | 'MP3' | 'OGG_OPUS' | 'ALAW' | 'MULAW' | 'FLAC'
    bitRate?: number
    sampleRateHertz?: number
    speakingRate?: number
  }
  temperature?: number
}

interface TTSResponse {
  audioContent: string  // base64 encoded audio
  timestampInfo?: any
}

let inworldConfig: InworldConfig | null = null
let authHeader: string | null = null

/**
 * Initialize Inworld TTS with API credentials
 */
export function initializeInworld(config: InworldConfig): void {
  if (!config.workspaceId || !config.apiKey || !config.apiSecret) {
    throw new Error('Please set INWORLD_WORKSPACE_ID, INWORLD_API_KEY, and INWORLD_API_SECRET in your .env file')
  }

  inworldConfig = {
    ...config,
    defaultVoice: config.defaultVoice || 'inworld-tts-1-default',
    defaultModel: config.defaultModel || 'inworld-tts-1'
  }

  // Create Basic Auth header: Base64(workspaceId:apiKey:apiSecret)
  const credentials = `${config.workspaceId}:${config.apiKey}:${config.apiSecret}`
  authHeader = 'Basic ' + Buffer.from(credentials).toString('base64')

  console.log('Inworld TTS client initialized successfully')
}

/**
 * Check if Inworld TTS is initialized
 */
export function isInitialized(): boolean {
  return inworldConfig !== null && authHeader !== null
}

/**
 * Get Inworld TTS status
 */
export function getStatus(): { initialized: boolean; voiceId: string | null; model: string | null } {
  return {
    initialized: isInitialized(),
    voiceId: inworldConfig?.defaultVoice || null,
    model: inworldConfig?.defaultModel || null
  }
}

/**
 * Chunk text into segments of max 2000 characters
 * Splits on sentence boundaries to maintain natural speech
 */
function chunkText(text: string, maxChunkSize: number = 1900): string[] {
  if (text.length <= maxChunkSize) {
    return [text]
  }

  const chunks: string[] = []
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]
  let currentChunk = ''

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxChunkSize) {
      currentChunk += sentence
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }
      currentChunk = sentence
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks.length > 0 ? chunks : [text]
}

/**
 * Synthesize speech from text using Inworld.ai API
 */
export async function synthesizeSpeech(options: TTSOptions): Promise<Buffer> {
  if (!inworldConfig || !authHeader) {
    throw new Error('Inworld TTS client not initialized. Please call initializeInworld first.')
  }

  try {
    console.log('Starting Inworld TTS synthesis for text length:', options.text.length)

    // Chunk text if it exceeds 2000 characters
    const textChunks = chunkText(options.text)
    console.log(`Text split into ${textChunks.length} chunk(s)`)

    const audioBuffers: Buffer[] = []

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i]
      console.log(`Processing chunk ${i + 1}/${textChunks.length} (${chunk.length} chars)`)

      const requestBody = {
        text: chunk,
        voiceId: options.voiceId || inworldConfig.defaultVoice,
        modelId: options.modelId || inworldConfig.defaultModel,
        audioConfig: options.audioConfig || {
          audioEncoding: 'MP3',
          bitRate: 128000,
          sampleRateHertz: 48000,
          speakingRate: 1.0
        },
        temperature: options.temperature !== undefined ? options.temperature : 1.1
      }

      const response = await fetch('https://api.inworld.ai/tts/v1/voice', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Inworld API error:', response.status, errorText)

        if (response.status === 401) {
          throw new Error('Invalid Inworld credentials. Please check your .env file.')
        } else if (response.status === 429) {
          throw new Error('Inworld API rate limit exceeded. Please try again later.')
        } else if (response.status === 400) {
          throw new Error(`Inworld API bad request: ${errorText}`)
        } else {
          throw new Error(`Inworld API error (${response.status}): ${errorText}`)
        }
      }

      const data: TTSResponse = await response.json()

      if (!data.audioContent) {
        throw new Error('No audio content received from Inworld API')
      }

      // Convert base64 to Buffer
      const audioBuffer = Buffer.from(data.audioContent, 'base64')
      audioBuffers.push(audioBuffer)

      console.log(`Chunk ${i + 1} synthesized: ${audioBuffer.length} bytes`)
    }

    // If multiple chunks, concatenate them
    const finalBuffer = audioBuffers.length === 1
      ? audioBuffers[0]
      : Buffer.concat(audioBuffers)

    console.log('TTS synthesis successful! Total audio size:', finalBuffer.length, 'bytes')

    return finalBuffer
  } catch (error: any) {
    console.error('Inworld TTS synthesis error:', error)

    if (error.message.includes('fetch')) {
      throw new Error('Network error connecting to Inworld API. Please check your internet connection.')
    }

    throw error
  }
}

/**
 * Synthesize speech with simplified interface (text-only)
 */
export async function synthesizeText(text: string): Promise<Buffer> {
  return synthesizeSpeech({ text })
}

/**
 * Get available voices (placeholder - would need to implement voice listing API)
 */
export function getAvailableVoices(): string[] {
  // This would typically call Inworld's voice listing API
  // For now, return a default list
  return [
    'inworld-tts-1-default',
    'en-US-female-1',
    'en-US-male-1',
    'en-GB-female-1',
    'en-GB-male-1'
  ]
}

/**
 * Set default voice for all future syntheses
 */
export function setDefaultVoice(voiceId: string): void {
  if (inworldConfig) {
    inworldConfig.defaultVoice = voiceId
    console.log('Default voice set to:', voiceId)
  }
}

/**
 * Set default model for all future syntheses
 */
export function setDefaultModel(modelId: 'inworld-tts-1' | 'inworld-tts-1-max'): void {
  if (inworldConfig) {
    inworldConfig.defaultModel = modelId
    console.log('Default model set to:', modelId)
  }
}
