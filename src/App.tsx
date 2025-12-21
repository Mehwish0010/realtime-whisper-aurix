import { useState, useRef, useEffect } from 'react'
import './App.css'
import './electron.d'

interface OpenAIStatus {
  success: boolean
  initialized: boolean
  apiKey: string | null
}

interface ConversationMessage {
  type: 'user' | 'ai'
  text: string
  timestamp: number
}

type ConversationState = 'idle' | 'listening' | 'transcribing' | 'ai_thinking' | 'tts_generating' | 'ai_speaking'

function App() {
  const [, setIsRecording] = useState(false)
  const [, setTranscription] = useState('')
  const [, setStatus] = useState('Checking OpenAI status...')
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIStatus | null>(null)
  const [, setIsSpeaking] = useState(false)
  const [, setAudioLevel] = useState(0)
  const [, setLastLatency] = useState<number | null>(null)
  const [conversationActive, setConversationActive] = useState(false)
  const [conversationState, setConversationState] = useState<ConversationState>('idle')
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [isInitializing, setIsInitializing] = useState(false)

  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const speechStopTimeRef = useRef<number | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // Check OpenAI status on mount
  useEffect(() => {
    checkOpenAIStatus()

    // Set up listeners only once
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    // Create handler functions for STT
    const handleTranscription = (text: string) => {
      console.log('Received transcription:', text)

      // Calculate latency
      if (speechStopTimeRef.current) {
        const latency = Date.now() - speechStopTimeRef.current
        setLastLatency(latency)
        console.log(`Total latency from speech stop to transcription: ${latency}ms`)
      }

      setTranscription(prev => {
        // Avoid duplicates by checking if text already exists
        if (prev.includes(text)) return prev
        return prev + ' ' + text
      })
    }

    const handleSpeechStarted = () => {
      console.log('Speech detected')
      setIsSpeaking(true)
    }

    const handleSpeechStopped = () => {
      console.log('Speech ended')
      setIsSpeaking(false)
      speechStopTimeRef.current = Date.now()
    }

    const handleError = (error: string) => {
      console.error('Realtime error:', error)
      setStatus(`Error: ${error}`)
    }

    // Set up STT listeners
    electronAPI.onRealtimeTranscription(handleTranscription)
    electronAPI.onRealtimeSpeechStarted(handleSpeechStarted)
    electronAPI.onRealtimeSpeechStopped(handleSpeechStopped)
    electronAPI.onRealtimeError(handleError)

    // Set up conversation event listeners
    electronAPI.onUserSpoke((text: string) => {
      console.log('User spoke:', text)
      setConversationHistory(prev => [...prev, { type: 'user', text, timestamp: Date.now() }])
    })

    electronAPI.onAIResponse((text: string) => {
      console.log('AI response:', text)
      setConversationHistory(prev => [...prev, { type: 'ai', text, timestamp: Date.now() }])
    })

    electronAPI.onAIAudio((audioBuffer: ArrayBuffer) => {
      console.log('AI audio received, size:', audioBuffer.byteLength)
      playAIAudio(audioBuffer)
    })

    electronAPI.onConversationStateChanged((state: string) => {
      console.log('Conversation state changed:', state)
      setConversationState(state as ConversationState)
    })

    electronAPI.onConversationError((error: string) => {
      console.error('Conversation error:', error)
      setStatus(`Conversation error: ${error}`)
    })

    electronAPI.onConversationStopped(() => {
      console.log('Conversation ended')
      setConversationActive(false)
      setConversationState('idle')
      setIsRecording(false)
      setIsSpeaking(false)
      setStatus('Conversation stopped - Click Start to begin new conversation')
    })

    electronAPI.onConversationTurnComplete(() => {
      console.log('Turn complete - Ready for next recording')
      setConversationState('idle')
      setIsSpeaking(false)
      setStatus('Turn complete - Click Record button for next interaction')
    })

    electronAPI.onConversationNoSpeech(() => {
      console.log('No speech detected in 7 seconds')
      setConversationState('idle')
      setStatus('No speech detected - Click Record button to try again')
    })

    // Cleanup is handled by Electron IPC - no need to return cleanup function
  }, [])

  const checkOpenAIStatus = async () => {
    try {
      const electronAPI = (window as any).electronAPI
      if (!electronAPI || typeof electronAPI.openaiStatus !== 'function') {
        setStatus('Error: Not running in Electron mode')
        return
      }

      const result: OpenAIStatus = await electronAPI.openaiStatus()
      setOpenaiStatus(result)

      if (result.initialized) {
        setStatus('Ready for live transcription with OpenAI')
      } else {
        setStatus('OpenAI API key not configured')
      }
    } catch (error) {
      console.error('Failed to check OpenAI status:', error)
      setStatus('Error checking OpenAI status')
    }
  }

  const startLiveTranscription = async () => {
    try {
      console.log('Starting live transcription...')

      // Check if OpenAI is initialized
      if (!openaiStatus?.initialized) {
        setStatus('Error: OpenAI API key not configured')
        return
      }

      const electronAPI = (window as any).electronAPI
      if (!electronAPI) {
        setStatus('Error: Not running in Electron mode')
        return
      }

      // Start realtime session
      setStatus('Connecting to OpenAI...')
      const result = await electronAPI.realtimeStart()

      if (!result.success) {
        throw new Error(result.error || 'Failed to start realtime session')
      }

      console.log('Realtime session started')

      // IMPORTANT: Wait 2 seconds for session to be fully ready
      console.log('Waiting for session to stabilize...')
      setStatus('Preparing microphone...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      setStatus('Live transcription active - Speak now!')

      // Request microphone access
      console.log('Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      console.log('Microphone stream obtained:', stream)
      console.log('Audio tracks:', stream.getAudioTracks())
      streamRef.current = stream

      // Create audio context for processing
      console.log('Creating AudioContext...')
      const audioContext = new AudioContext({ sampleRate: 24000 })
      audioContextRef.current = audioContext
      console.log('AudioContext state:', audioContext.state)

      // Resume audio context if suspended (required for some browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
        console.log('AudioContext resumed')
      }

      const source = audioContext.createMediaStreamSource(stream)
      console.log('MediaStreamSource created')

      // Use ScriptProcessorNode temporarily for debugging
      // (Will replace with AudioWorklet once we verify mic works)
      console.log('Creating ScriptProcessorNode (temporary for debugging)...')
      const bufferSize = 4096
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)
      processorRef.current = processor as any
      console.log('ScriptProcessorNode created')

      let frameCount = 0
      processor.onaudioprocess = async (e) => {
        const inputData = e.inputBuffer.getChannelData(0)

        // Calculate audio level (RMS)
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)

        // Log every 30 frames (~1 second at 4096 buffer)
        if (frameCount++ % 30 === 0) {
          console.log('Audio level:', rms.toFixed(4))
        }

        // Update audio level for visualization
        setAudioLevel(rms)

        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        // Send to OpenAI
        try {
          await electronAPI.realtimeSendAudio(pcm16.buffer)
        } catch (error) {
          console.error('Failed to send audio:', error)
        }
      }

      console.log('Connecting audio nodes...')
      source.connect(processor)
      processor.connect(audioContext.destination)
      console.log('Audio pipeline connected')

      setIsRecording(true)
      setTranscription('')

      console.log('Microphone connected, streaming audio...')
    } catch (error) {
      console.error('Recording error:', error)
      setStatus(`Error: ${(error as Error).message}`)
      stopLiveTranscription()
    }
  }

  const stopLiveTranscription = async () => {
    try {
      console.log('Stopping live transcription...')

      // Stop audio processing
      if (processorRef.current) {
        if ('port' in processorRef.current) {
          // AudioWorkletNode
          processorRef.current.disconnect()
        } else {
          // ScriptProcessorNode
          const processor = processorRef.current as any
          processor.onaudioprocess = null
          processor.disconnect()
        }
        processorRef.current = null
      }

      if (audioContextRef.current) {
        await audioContextRef.current.close()
        audioContextRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      // Stop realtime session
      const electronAPI = (window as any).electronAPI
      if (electronAPI) {
        await electronAPI.realtimeStop()
      }

      setIsRecording(false)
      setIsSpeaking(false)
      setAudioLevel(0)
      setStatus('Live transcription stopped')

      console.log('Stopped successfully')
    } catch (error) {
      console.error('Stop error:', error)
      setStatus(`Error stopping: ${(error as Error).message}`)
    }
  }

  const startConversation = async () => {
    if (isInitializing || conversationActive) {
      console.log('Already initializing or active, skipping...')
      return
    }

    try {
      setIsInitializing(true)
      console.log('Starting full voice conversation...')

      const electronAPI = (window as any).electronAPI

      // First start the STT session
      await startLiveTranscription()

      // Wait a bit for STT to be ready
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Start conversation orchestrator
      const result = await electronAPI.conversationStart({
        mode: 'single-turn',
        systemPrompt: 'You are a helpful voice assistant. Provide clear, concise, and friendly responses suitable for voice conversation.'
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to start conversation')
      }

      setConversationActive(true)
      setConversationHistory([])
      setStatus('Ready - Click microphone to speak')
      console.log('Conversation started successfully')
    } catch (error) {
      console.error('Conversation start error:', error)
      setStatus(`Error: ${(error as Error).message}`)
      stopLiveTranscription()
    } finally {
      setIsInitializing(false)
    }
  }

  const stopConversation = async () => {
    try {
      console.log('Stopping voice conversation...')

      const electronAPI = (window as any).electronAPI
      await electronAPI.conversationStop()

      // Stop STT session
      await stopLiveTranscription()

      setConversationActive(false)
      setConversationState('idle')
      setStatus('Voice conversation stopped')
      console.log('Conversation stopped successfully')
    } catch (error) {
      console.error('Conversation stop error:', error)
      setStatus(`Error: ${(error as Error).message}`)
    }
  }

  const startManualRecording = async () => {
    try {
      console.log('Starting manual 7-second recording...')

      const electronAPI = (window as any).electronAPI
      const result = await electronAPI.conversationStartRecording()

      if (!result.success) {
        throw new Error(result.error || 'Failed to start recording')
      }

      setStatus('Recording for 7 seconds - Speak now!')
      console.log('Manual recording started successfully')
    } catch (error) {
      console.error('Manual recording start error:', error)
      setStatus(`Error: ${(error as Error).message}`)
    }
  }

  const playAIAudio = async (audioBuffer: ArrayBuffer) => {
    try {
      // Create blob from buffer (Inworld TTS returns MP3 format)
      const blob = new Blob([audioBuffer], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(blob)

      // Create or reuse audio element
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio()
      }

      const audio = audioPlayerRef.current
      audio.src = audioUrl
      audio.volume = 1.0

      // Play audio
      await audio.play()
      console.log('Playing AI audio response')

      // Clean up URL after playback
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        console.log('AI audio playback finished')
      }
    } catch (error) {
      console.error('Audio playback error:', error)
    }
  }


  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Title */}
      <div style={{
        textAlign: 'center',
        marginBottom: '40px'
      }}>
        <h1 style={{
          fontSize: '48px',
          fontWeight: '700',
          color: 'white',
          margin: '0 0 10px 0',
          textShadow: '0 2px 10px rgba(0,0,0,0.2)'
        }}>
          AURIX
        </h1>
        <p style={{
          fontSize: '18px',
          color: 'rgba(255,255,255,0.9)',
          margin: 0
        }}>
          Voice Assistant
        </p>
      </div>

      {/* Main Card */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '24px',
        padding: '40px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        maxWidth: '600px',
        width: '100%',
        textAlign: 'center'
      }}>
        {/* Status Indicator */}
        <div style={{
          marginBottom: '30px',
          fontSize: '18px',
          color: '#666',
          fontWeight: '600',
          minHeight: '28px'
        }}>
          {!openaiStatus?.initialized && '⚠️ Setting up...'}
          {openaiStatus?.initialized && isInitializing && '🔄 Initializing...'}
          {openaiStatus?.initialized && !isInitializing && !conversationActive && '👆 Click to start'}
          {openaiStatus?.initialized && !isInitializing && conversationActive && conversationState === 'idle' && '🎤 Click to record'}
          {conversationState === 'listening' && '🔴 Recording... (7 seconds)'}
          {conversationState === 'transcribing' && ' Processing speech...'}
          {conversationState === 'ai_thinking' && ' AI thinking...'}
          {conversationState === 'tts_generating' && ' Creating voice...'}
          {conversationState === 'ai_speaking' && ' AI speaking...'}
        </div>

        {/* Main Button */}
        <button
          onClick={() => {
            if (!conversationActive && !isInitializing) {
              startConversation()
            } else if (conversationActive && conversationState === 'idle') {
              startManualRecording()
            }
          }}
          disabled={!openaiStatus?.initialized || isInitializing || (conversationActive && conversationState !== 'idle')}
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            border: 'none',
            background: !openaiStatus?.initialized
              ? '#ccc'
              : conversationState === 'listening'
              ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
              : (conversationState === 'idle' || !conversationActive)
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : '#e0e0e0',
            color: 'white',
            fontSize: '80px',
            cursor: (openaiStatus?.initialized && (conversationState === 'idle' || !conversationActive)) ? 'pointer' : 'not-allowed',
            boxShadow: (conversationState === 'idle' || !conversationActive) && openaiStatus?.initialized
              ? '0 10px 40px rgba(102, 126, 234, 0.4)'
              : conversationState === 'listening'
              ? '0 10px 40px rgba(240, 147, 251, 0.4), 0 0 0 20px rgba(240, 147, 251, 0.1), 0 0 0 40px rgba(240, 147, 251, 0.05)'
              : 'none',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            animation: conversationState === 'listening' ? 'pulse 1.5s infinite' : 'none'
          }}
          onMouseOver={(e) => {
            if (openaiStatus?.initialized && (conversationState === 'idle' || !conversationActive)) {
              e.currentTarget.style.transform = 'scale(1.05)'
            }
          }}
          onMouseOut={(e) => {
            if (openaiStatus?.initialized && (conversationState === 'idle' || !conversationActive)) {
              e.currentTarget.style.transform = 'scale(1)'
            }
          }}
        >
          🎙️
        </button>

        {/* Small End Conversation Button */}
        {conversationActive && (
          <button
            onClick={stopConversation}
            style={{
              marginTop: '20px',
              padding: '8px 20px',
              borderRadius: '20px',
              border: 'none',
              backgroundColor: '#f5f5f5',
              color: '#999',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#e0e0e0'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5'
            }}
          >
            End Session
          </button>
        )}

        {/* Latest Exchange - Only show most recent user input and AI output */}
        {conversationHistory.length > 0 && (
          <div style={{
            marginTop: '40px',
            textAlign: 'left',
            padding: '10px'
          }}>
            {/* User Input */}
            {(() => {
              const lastUserMsg = [...conversationHistory].reverse().find(msg => msg.type === 'user')
              return lastUserMsg && (
                <div style={{
                  marginBottom: '20px'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: '#999',
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    YOU SAID:
                  </div>
                  <div style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    fontSize: '16px',
                    lineHeight: '1.6'
                  }}>
                    {lastUserMsg.text}
                  </div>
                </div>
              )
            })()}

            {/* AI Output */}
            {(() => {
              const lastAIMsg = [...conversationHistory].reverse().find(msg => msg.type === 'ai')
              return lastAIMsg && (
                <div>
                  <div style={{
                    fontSize: '12px',
                    color: '#999',
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    AI RESPONSE:
                  </div>
                  <div style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    backgroundColor: '#f5f5f5',
                    color: '#333',
                    fontSize: '16px',
                    lineHeight: '1.6'
                  }}>
                    {lastAIMsg.text}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* Setup Warning */}
        {!openaiStatus?.initialized && (
          <div style={{
            marginTop: '30px',
            padding: '20px',
            backgroundColor: '#fff3cd',
            borderRadius: '12px',
            fontSize: '13px',
            color: '#856404',
            textAlign: 'left'
          }}>
            <strong>⚠️ Setup Required</strong>
            <p style={{ margin: '10px 0 0 0' }}>
              Please configure your OpenAI API key in the .env file
            </p>
          </div>
        )}
      </div>

      {/* Pulse Animation */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}
      </style>
    </div>
  )
}

export default App
