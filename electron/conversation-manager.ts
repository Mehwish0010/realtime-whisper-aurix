/**
 * Conversation Orchestrator
 *
 * Coordinates the complete voice-to-voice conversation flow:
 * User speaks → STT → GPT-4 → TTS → Audio playback
 */

import { EventEmitter } from 'events'
import type { RealtimeSession } from './openai-realtime'
import { getConversationManager } from './openai-chat'
import { synthesizeSpeech, isInitialized as isTTSInitialized } from './inworld-tts'

export type ConversationMode = 'continuous' | 'single-turn'
export type ConversationState = 'idle' | 'listening' | 'transcribing' | 'ai_thinking' | 'tts_generating' | 'ai_speaking'

interface ConversationOptions {
  mode?: ConversationMode
  systemPrompt?: string
  voiceId?: string
  modelId?: 'inworld-tts-1' | 'inworld-tts-1-max'
}

interface ConversationStatus {
  isActive: boolean
  currentState: ConversationState
  mode: ConversationMode
  processingResponse: boolean
}

/**
 * Orchestrates the complete conversation flow
 */
export class ConversationOrchestrator extends EventEmitter {
  private sttSession: RealtimeSession | null = null
  private isActive: boolean = false
  private currentState: ConversationState = 'idle'
  private mode: ConversationMode = 'continuous'
  private voiceId: string = ''
  private modelId: 'inworld-tts-1' | 'inworld-tts-1-max' = 'inworld-tts-1'
  private processingResponse: boolean = false
  private lastTranscription: string = ''
  private transcriptionTimeout: NodeJS.Timeout | null = null
  private speechStartTime: number = 0
  private speechCollectionDuration: number = 7000  // Collect speech for exactly 7 seconds, then mic OFF
  private speechCollectionTimer: NodeJS.Timeout | null = null
  private isCollectingSpeech: boolean = false  // Flag to prevent multiple simultaneous collections

  constructor() {
    super()
  }

  /**
   * Start the conversation with given options
   */
  async start(sttSession: RealtimeSession, options: ConversationOptions = {}): Promise<void> {
    if (this.isActive) {
      throw new Error('Conversation already active')
    }

    // Validate dependencies
    const chatManager = getConversationManager()
    if (!chatManager.isInitialized()) {
      throw new Error('Chat manager not initialized')
    }

    if (!isTTSInitialized()) {
      throw new Error('TTS not initialized')
    }

    this.sttSession = sttSession
    this.isActive = true
    this.mode = options.mode || 'continuous'
    this.voiceId = options.voiceId || ''
    this.modelId = options.modelId || 'inworld-tts-1'

    // Update system prompt if provided
    if (options.systemPrompt) {
      chatManager.setSystemPrompt(options.systemPrompt)
    }

    // Set up STT event listeners
    this.setupSTTListeners()

    this.setState('idle')
    console.log('Conversation orchestrator started in', this.mode, 'mode - Waiting for manual recording trigger')

    this.emit('started', { mode: this.mode })
  }

  /**
   * Stop the conversation
   */
  stop(): void {
    if (!this.isActive) {
      return
    }

    this.isActive = false
    this.setState('idle')
    this.processingResponse = false
    this.isCollectingSpeech = false  // Reset collection flag

    // Clear any pending timeouts
    if (this.transcriptionTimeout) {
      clearTimeout(this.transcriptionTimeout)
      this.transcriptionTimeout = null
    }

    if (this.speechCollectionTimer) {
      clearTimeout(this.speechCollectionTimer)
      this.speechCollectionTimer = null
    }

    // Remove STT listeners (done through session cleanup)
    this.sttSession = null

    console.log('Conversation orchestrator stopped')
    this.emit('stopped')
  }

  /**
   * Get current conversation status
   */
  getStatus(): ConversationStatus {
    return {
      isActive: this.isActive,
      currentState: this.currentState,
      mode: this.mode,
      processingResponse: this.processingResponse
    }
  }

  /**
   * Set up listeners for STT events
   */
  private setupSTTListeners(): void {
    if (!this.sttSession) return

    // When user stops speaking (for UI feedback only)
    this.sttSession.on('speech_stopped', () => {
      if (this.isActive && !this.processingResponse) {
        this.emit('user_stopped_speaking')
      }
    })

    // When transcription is ready
    this.sttSession.on('transcription', async (text: string) => {
      if (!this.isActive || this.processingResponse || !this.isCollectingSpeech) {
        console.log('Ignoring transcription - not active, processing, or not collecting')
        return
      }

      // Ignore empty or very short transcriptions
      if (!text || text.trim().length < 3) {
        console.log('Ignoring short transcription:', text)
        return
      }

      // Accumulate transcriptions (7-second timer will handle processing, then mic OFF)
      this.lastTranscription = text
      const elapsedTime = Date.now() - this.speechStartTime
      const remainingTime = Math.max(0, this.speechCollectionDuration - elapsedTime)

      console.log(`📝 Transcription: "${text}" | ⏱️ ${(elapsedTime/1000).toFixed(1)}s / 7s | 🎤 Mic turns off in ${(remainingTime/1000).toFixed(1)}s`)
    })

    // Handle errors
    this.sttSession.on('error', (error: any) => {
      console.error('STT error in conversation:', error)
      this.emit('error', new Error(`STT error: ${error.message || error}`))

      if (this.isActive) {
        this.processingResponse = false
        this.isCollectingSpeech = false  // Reset collection flag on STT error
        this.setState('idle')
      }
    })
  }

  /**
   * Handle user transcription and generate response
   */
  private async handleUserTranscription(transcription: string): Promise<void> {
    if (!this.isActive || this.processingResponse) {
      return
    }

    try {
      this.processingResponse = true
      this.speechStartTime = 0  // Reset speech timer

      // Clear the 8-second collection timer
      if (this.speechCollectionTimer) {
        clearTimeout(this.speechCollectionTimer)
        this.speechCollectionTimer = null
      }

      console.log('🔇 Microphone OFF - Processing transcription:', transcription)

      // Emit user spoke event
      this.emit('user_spoke', transcription)

      // Get AI response
      this.setState('ai_thinking')
      console.log('🤖 AI processing request...')
      const aiResponse = await this.generateAIResponse(transcription)

      if (!this.isActive) {
        // Conversation was stopped while waiting for response
        return
      }

      console.log('✅ AI response received:', aiResponse)
      this.emit('ai_response', aiResponse)

      // Convert to speech
      this.setState('tts_generating')
      console.log('🔊 Generating speech audio...')
      const audioBuffer = await this.generateSpeech(aiResponse)

      if (!this.isActive) {
        // Conversation was stopped while generating speech
        return
      }

      // Emit audio for playback
      this.setState('ai_speaking')
      console.log('🔊 Playing AI voice response...')
      this.emit('ai_audio', audioBuffer)

      // Wait a bit for audio to finish (estimated based on text length)
      const estimatedDuration = this.estimateAudioDuration(aiResponse)
      await this.wait(estimatedDuration)

      // Reset state
      this.processingResponse = false
      this.isCollectingSpeech = false  // Reset collection flag for next round
      this.lastTranscription = ''  // Clear transcription for next round

      // Always go to idle after completing a turn - user must manually trigger next recording
      if (this.isActive) {
        this.setState('idle')
        console.log('✅ Turn complete - Microphone OFF. Click button to record again.')
        this.emit('turn_complete')
      }
    } catch (error: any) {
      console.error('Error processing transcription:', error)
      this.emit('error', error)

      this.processingResponse = false
      this.isCollectingSpeech = false  // Reset collection flag on error
      this.lastTranscription = ''  // Clear transcription on error too
      if (this.isActive) {
        this.setState('idle')
      }
    }
  }

  /**
   * Generate AI response using GPT-4
   */
  private async generateAIResponse(userMessage: string): Promise<string> {
    const chatManager = getConversationManager()

    try {
      const response = await chatManager.sendMessage(userMessage)
      return response
    } catch (error: any) {
      console.error('GPT-4 response error:', error)
      throw new Error(`Failed to generate AI response: ${error.message}`)
    }
  }

  /**
   * Generate speech from text using TTS
   */
  private async generateSpeech(text: string): Promise<Buffer> {
    try {
      const options: any = {
        text,
        modelId: this.modelId
      }

      if (this.voiceId) {
        options.voiceId = this.voiceId
      }

      const audioBuffer = await synthesizeSpeech(options)
      return audioBuffer
    } catch (error: any) {
      console.error('TTS generation error:', error)
      throw new Error(`Failed to generate speech: ${error.message}`)
    }
  }

  /**
   * Set conversation state and emit event
   */
  private setState(state: ConversationState): void {
    this.currentState = state
    this.emit('state_changed', state)
    console.log('Conversation state:', state)
  }

  /**
   * Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Estimate audio duration based on text length
   * Rough estimate: ~150 words per minute = 2.5 words per second
   */
  private estimateAudioDuration(text: string): number {
    const wordCount = text.split(/\s+/).length
    const estimatedSeconds = (wordCount / 2.5) + 1  // Add 1 second buffer
    return estimatedSeconds * 1000  // Convert to milliseconds
  }

  /**
   * Manually start recording for 7 seconds (push-to-talk)
   */
  startRecording(): void {
    // Ignore if already collecting or processing
    if (!this.isActive || this.processingResponse || this.isCollectingSpeech) {
      console.log('⏭️ Ignoring start recording - already collecting or processing')
      return
    }

    this.isCollectingSpeech = true  // Mark as collecting
    this.speechStartTime = Date.now()  // Record when recording started
    this.lastTranscription = ''  // Clear previous transcription
    this.setState('listening')
    this.emit('user_speaking')
    console.log(`🎤 Microphone ON - Recording for ${this.speechCollectionDuration}ms (7 seconds)...`)

    // Set timer to automatically stop listening and process after 7 seconds
    if (this.speechCollectionTimer) {
      clearTimeout(this.speechCollectionTimer)
    }

    this.speechCollectionTimer = setTimeout(async () => {
      console.log('🔇 7 seconds elapsed - Microphone OFF, processing speech...')
      this.setState('transcribing')

      // Clear any pending transcription timeout
      if (this.transcriptionTimeout) {
        clearTimeout(this.transcriptionTimeout)
        this.transcriptionTimeout = null
      }

      // Wait up to 3 more seconds for transcription to arrive
      let attempts = 0
      const maxAttempts = 30 // 30 * 100ms = 3 seconds

      while (attempts < maxAttempts && (!this.lastTranscription || this.lastTranscription.trim().length === 0)) {
        await this.wait(100)
        attempts++
      }

      // Process whatever we collected
      if (this.lastTranscription && this.lastTranscription.trim().length > 0) {
        console.log('✅ Transcription received, processing...')
        await this.handleUserTranscription(this.lastTranscription)
      } else {
        console.log('⚠️ No speech collected after waiting, returning to idle...')
        this.isCollectingSpeech = false  // Reset flag if no speech collected
        this.setState('idle')
        this.emit('no_speech_detected')
      }
    }, this.speechCollectionDuration)
  }

  /**
   * Change conversation mode
   */
  setMode(mode: ConversationMode): void {
    this.mode = mode
    console.log('Conversation mode changed to:', mode)
    this.emit('mode_changed', mode)
  }

  /**
   * Update voice settings
   */
  setVoice(voiceId: string): void {
    this.voiceId = voiceId
    console.log('Voice changed to:', voiceId)
  }

  /**
   * Update TTS model
   */
  setModel(modelId: 'inworld-tts-1' | 'inworld-tts-1-max'): void {
    this.modelId = modelId
    console.log('TTS model changed to:', modelId)
  }
}

// Singleton instance
let orchestratorInstance: ConversationOrchestrator | null = null

export function getConversationOrchestrator(): ConversationOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ConversationOrchestrator()
  }
  return orchestratorInstance
}

export function resetConversationOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop()
    orchestratorInstance.removeAllListeners()
    orchestratorInstance = null
  }
}
