import Groq from 'groq-sdk'
import fs from 'fs'
import path from 'path'

let groq: Groq | null = null

/**
 * Initialize Groq client with API key
 */
export function initializeGroq(apiKey: string): void {
  if (!apiKey || apiKey === 'your-groq-api-key-here') {
    throw new Error('Please set a valid GROQ_API_KEY in your .env file')
  }

  groq = new Groq({
    apiKey: apiKey
  })

  console.log('Groq client initialized successfully')
}

/**
 * Check if Groq is initialized
 */
export function isInitialized(): boolean {
  return groq !== null
}

/**
 * Transcribe audio file using Groq Whisper API with retry logic
 * @param audioPath - Path to the audio file (supports mp3, mp4, mpeg, mpga, m4a, wav, webm)
 * @param language - Language code (optional, auto-detect if not provided)
 * @returns Transcription text
 */
export async function transcribeAudio(
  audioPath: string,
  language?: string
): Promise<string> {
  if (!groq) {
    throw new Error('Groq client not initialized. Please call initializeGroq first.')
  }

  const maxRetries = 3
  let lastError: any = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Starting Groq Whisper transcription (attempt ${attempt}/${maxRetries}) for:`, audioPath)

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

      console.log('Calling Groq Whisper API...')
      console.log('Parameters: model=whisper-large-v3-turbo, language=en, temperature=0.0')

      // Call Groq Whisper API with FORCED English language and strong prompt
      const transcription = await groq.audio.transcriptions.create({
        file: audioStream as any,
        model: 'whisper-large-v3-turbo',
        language: 'en',  // FORCE English - do not auto-detect
        response_format: 'text',
        temperature: 0.0,
        prompt: 'The following is a conversation in English. Hello, how are you? Yes, I am speaking English. What can I help you with today?'
      })

      console.log('Transcription successful!')
      console.log('Transcription text:', transcription)
      console.log('Transcription length:', transcription.length, 'characters')

      if (transcription.length < 5) {
        console.warn('Warning: Transcription is very short, may not have captured full speech')
      }

      return transcription || 'No speech detected'
    } catch (error: any) {
      console.error(`Groq transcription error (attempt ${attempt}/${maxRetries}):`, error)
      lastError = error

      if (error.status === 401 || error.error?.error?.code === 'invalid_api_key') {
        throw new Error('Invalid Groq API key. Please check your .env file.')
      } else if (error.status === 429) {
        // Rate limit - retry with exponential backoff
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 2000 // 4s, 8s, 16s
          console.log(`⚠️ Rate limit hit. Waiting ${waitTime / 1000}s before retry ${attempt + 1}/${maxRetries}...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        throw new Error('Groq API rate limit exceeded. Please wait a moment and try again.')
      } else if (error.status === 500 || error.status === 503) {
        // Server error - retry
        if (attempt < maxRetries) {
          const waitTime = 2000
          console.log(`Server error. Waiting ${waitTime / 1000}s before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        throw new Error('Groq API server error. Please try again later.')
      }

      throw new Error(`Transcription failed: ${error.message}`)
    }
  }

  // If we get here, all retries failed
  throw new Error(`Transcription failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`)
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
  if (!groq) {
    throw new Error('Groq client not initialized. Please call initializeGroq first.')
  }

  try {
    console.log('Starting Groq transcription with options:', options)

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`)
    }

    // Create a read stream for the audio file
    const audioStream = fs.createReadStream(audioPath)

    // Call Groq Whisper API with verbose response - FORCE English
    const transcription = await groq.audio.transcriptions.create({
      file: audioStream as any,
      model: 'whisper-large-v3-turbo',
      language: 'en',  // FORCE English
      prompt: options?.prompt || 'The following is a conversation in English. Hello, how are you? Yes, I am speaking English.',
      temperature: options?.temperature || 0,
      response_format: 'verbose_json'
    })

    console.log('Transcription successful:', transcription)

    return {
      text: (transcription as any).text || 'No speech detected',
      language: (transcription as any).language
    }
  } catch (error: any) {
    console.error('Groq transcription error:', error)

    if (error.status === 401 || error.error?.error?.code === 'invalid_api_key') {
      throw new Error('Invalid Groq API key. Please check your .env file.')
    } else if (error.status === 429) {
      throw new Error('Groq API rate limit exceeded. Please try again later.')
    }

    throw new Error(`Transcription failed: ${error.message}`)
  }
}

/**
 * Get Groq API status
 */
export function getStatus(): { initialized: boolean; apiKey: string | null } {
  return {
    initialized: groq !== null,
    apiKey: groq ? 'Set (hidden)' : null
  }
}
