import WebSocket from 'ws'
import { EventEmitter } from 'events'

let realtimeSession: RealtimeSession | null = null

interface RealtimeConfig {
  apiKey: string
  model?: string
  voice?: string
  instructions?: string
}

export class RealtimeSession extends EventEmitter {
  private ws: WebSocket | null = null
  private apiKey: string
  private model: string
  private isConnected: boolean = false
  private audioQueue: string[] = []
  private sessionId: string | null = null
  private speechStartTime: number | null = null
  private speechStopTime: number | null = null

  constructor(config: RealtimeConfig) {
    super()
    this.apiKey = config.apiKey
    this.model = config.model || 'gpt-4o-realtime-preview-2024-12-17'
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Connecting to OpenAI Realtime API...')

        const url = `wss://api.openai.com/v1/realtime?model=${this.model}`

        this.ws = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        })

        this.ws.on('open', () => {
          console.log('Connected to OpenAI Realtime API')
          this.isConnected = true

          // Configure session for transcription
          this.sendEvent({
            type: 'session.update',
            session: {
              modalities: ['text'],
              instructions: 'You are a speech-to-text transcription assistant. Transcribe all audio in English. Only output the transcribed text, nothing else.',
              voice: 'alloy',
              input_audio_format: 'pcm16',
              input_audio_transcription: {
                model: 'whisper-1',
                language: 'en'
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.3,
                prefix_padding_ms: 300,
                silence_duration_ms: 700
              },
              temperature: 0.6,
              max_response_output_tokens: 4096
            }
          })

          this.emit('connected')
          resolve()
        })

        this.ws.on('message', (data: WebSocket.Data) => {
          try {
            const event = JSON.parse(data.toString())
            this.handleServerEvent(event)
          } catch (error) {
            console.error('Error parsing server message:', error)
          }
        })

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error)
          this.emit('error', error)
          reject(error)
        })

        this.ws.on('close', () => {
          console.log('WebSocket connection closed')
          this.isConnected = false
          this.emit('disconnected')
        })

      } catch (error) {
        console.error('Failed to connect:', error)
        reject(error)
      }
    })
  }

  private handleServerEvent(event: any) {
    console.log('Received event:', event.type)

    switch (event.type) {
      case 'session.created':
        this.sessionId = event.session.id
        console.log('Session created:', this.sessionId)
        this.emit('session_created', event.session)
        break

      case 'session.updated':
        console.log('Session updated')
        this.emit('session_updated', event.session)
        break

      case 'conversation.item.input_audio_transcription.completed':
        const transcript = event.transcript || ''
        const transcriptionTime = this.speechStopTime ? Date.now() - this.speechStopTime : 0
        console.log(`Transcription completed in ${transcriptionTime}ms:`, transcript)
        if (transcript.trim()) {
          this.emit('transcription', transcript)
        }
        this.speechStartTime = null
        this.speechStopTime = null
        break

      case 'conversation.item.input_audio_transcription.failed':
        console.error('Transcription failed:', event.error)
        this.emit('error', event.error)
        break

      case 'input_audio_buffer.speech_started':
        this.speechStartTime = Date.now()
        console.log('Speech started (VAD detected) at', new Date().toLocaleTimeString())
        this.emit('speech_started')
        break

      case 'input_audio_buffer.speech_stopped':
        this.speechStopTime = Date.now()
        const speechDuration = this.speechStartTime ? this.speechStopTime - this.speechStartTime : 0
        console.log(`Speech stopped (VAD detected) - Duration: ${speechDuration}ms`)
        this.emit('speech_stopped')
        // Automatically commit audio and request transcription when speech stops
        this.commitAudio()
        break

      case 'input_audio_buffer.committed':
        console.log('Audio buffer committed')
        break

      case 'response.done':
        console.log('Response completed (ignored)')
        // Don't emit anything - we only want transcriptions, not AI responses
        break

      case 'response.text.delta':
        console.log('Text delta (ignored):', event.delta)
        // Don't emit - we only want transcriptions
        break

      case 'response.text.done':
        console.log('Full text (ignored):', event.text)
        // Don't emit - we only want transcriptions from input audio
        break

      case 'error':
        // Ignore harmless "buffer too small" errors (happens during silence)
        if (event.error?.code === 'input_audio_buffer_commit_empty') {
          // This is expected when there's silence - just ignore it
          break
        }
        console.error('Server error:', event.error)
        this.emit('error', event.error)
        break

      default:
        // Log ALL events for debugging
        console.log('Other event:', event.type, JSON.stringify(event).substring(0, 200))
    }
  }

  sendAudio(audioData: Buffer): void {
    if (!this.isConnected || !this.ws) {
      // Silently skip if not connected
      return
    }

    try {
      // Convert to base64
      const base64Audio = audioData.toString('base64')

      // Send audio append event
      this.sendEvent({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      })
    } catch (error) {
      console.error('Error sending audio:', error)
    }
  }

  commitAudio(): void {
    if (!this.isConnected || !this.ws) {
      return
    }

    // Just commit the audio buffer
    // Transcription will happen automatically due to input_audio_transcription config
    this.sendEvent({
      type: 'input_audio_buffer.commit'
    })
  }

  clearAudioBuffer(): void {
    if (!this.isConnected || !this.ws) {
      return
    }

    this.sendEvent({
      type: 'input_audio_buffer.clear'
    })
  }

  private sendEvent(event: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready, queuing event:', event.type)
      return
    }

    try {
      this.ws.send(JSON.stringify(event))
    } catch (error) {
      console.error('Error sending event:', error)
    }
  }

  disconnect(): void {
    if (this.ws) {
      console.log('Disconnecting from OpenAI Realtime API...')
      this.ws.close()
      this.ws = null
      this.isConnected = false
    }
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }
}

// Module exports
export function createRealtimeSession(apiKey: string): RealtimeSession {
  realtimeSession = new RealtimeSession({ apiKey })
  return realtimeSession
}

export function getRealtimeSession(): RealtimeSession | null {
  return realtimeSession
}

export function disconnectRealtime(): void {
  if (realtimeSession) {
    realtimeSession.disconnect()
    realtimeSession = null
  }
}
