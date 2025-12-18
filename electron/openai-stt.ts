import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

let openai: OpenAI | null = null

/**
 * Initialize OpenAI client with API key
 */
export function initializeOpenAI(apiKey: string): void {
  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error('Please set a valid OPENAI_API_KEY in your .env file')
  }

  openai = new OpenAI({
    apiKey: apiKey
  })

  console.log('OpenAI client initialized successfully')
}

/**
 * Check if OpenAI is initialized
 */
export function isInitialized(): boolean {
  return openai !== null
}

/**
 * Transcribe audio file using OpenAI Whisper API
 * @param audioPath - Path to the audio file (supports mp3, mp4, mpeg, mpga, m4a, wav, webm)
 * @param language - Language code (optional, auto-detect if not provided)
 * @returns Transcription text
 */
export async function transcribeAudio(
  audioPath: string,
  language?: string
): Promise<string> {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Please call initializeOpenAI first.')
  }

  try {
    console.log('Starting OpenAI transcription for:', audioPath)

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`)
    }

    // Get file stats
    const stats = fs.statSync(audioPath)
    console.log('File size:', stats.size, 'bytes')
    console.log('File format:', path.extname(audioPath))

    if (stats.size === 0) {
      throw new Error('Audio file is empty')
    }

    if (stats.size < 1000) {
      console.warn('Warning: Audio file very small, transcription may be inaccurate')
    }

    // Create a read stream for the audio file
    const audioStream = fs.createReadStream(audioPath)

    console.log('Calling OpenAI Whisper API...')
    console.log('Parameters: model=whisper-1, language=en, temperature=0.0')

    // Call OpenAI Whisper API with enhanced parameters
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: language || 'en',
      response_format: 'text',
      temperature: 0.0
    })

    console.log('Transcription successful!')
    console.log('Transcription text:', transcription)
    console.log('Transcription length:', transcription.length, 'characters')

    if (transcription.length < 5) {
      console.warn('Warning: Transcription is very short, may not have captured full speech')
    }

    return transcription || 'No speech detected'
  } catch (error: any) {
    console.error('OpenAI transcription error:', error)

    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your .env file.')
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.')
    } else if (error.status === 500) {
      throw new Error('OpenAI API server error. Please try again later.')
    }

    throw new Error(`Transcription failed: ${error.message}`)
  }
}

/**
 * Transcribe audio with additional options
 * @param audioPath - Path to the audio file
 * @param options - Transcription options
 * @returns Transcription result with metadata
 */
export async function transcribeWithOptions(
  audioPath: string,
  options?: {
    language?: string
    prompt?: string
    temperature?: number
  }
): Promise<{ text: string; language?: string }> {
  if (!openai) {
    throw new Error('OpenAI client not initialized. Please call initializeOpenAI first.')
  }

  try {
    console.log('Starting OpenAI transcription with options:', options)

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`)
    }

    // Create a read stream for the audio file
    const audioStream = fs.createReadStream(audioPath)

    // Call OpenAI Whisper API with verbose response
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      language: options?.language,
      prompt: options?.prompt,
      temperature: options?.temperature || 0,
      response_format: 'verbose_json'
    })

    console.log('Transcription successful:', transcription)

    return {
      text: transcription.text || 'No speech detected',
      language: (transcription as any).language
    }
  } catch (error: any) {
    console.error('OpenAI transcription error:', error)

    if (error.status === 401) {
      throw new Error('Invalid OpenAI API key. Please check your .env file.')
    } else if (error.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.')
    }

    throw new Error(`Transcription failed: ${error.message}`)
  }
}

/**
 * Get OpenAI API status
 */
export function getStatus(): { initialized: boolean; apiKey: string | null } {
  return {
    initialized: openai !== null,
    apiKey: openai ? 'Set (hidden)' : null
  }
}
