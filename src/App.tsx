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
  const [, setStatus] = useState('Checking OpenAI status...')
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIStatus | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState<string>('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [conversationActive, setConversationActive] = useState(false)
  const [conversationState, setConversationState] = useState<ConversationState>('idle')
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
  const [isInitializing, setIsInitializing] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // Check OpenAI status on mount
  useEffect(() => {
    checkOpenAIStatus()
    listMicrophones()
  }, [])

  const listMicrophones = async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const devices = await navigator.mediaDevices.enumerateDevices()
      const mics = devices.filter(device => device.kind === 'audioinput')
      console.log('🎤 Available microphones:', mics)
      setAvailableMics(mics)
      if (mics.length > 0 && !selectedMicId) {
        setSelectedMicId(mics[0].deviceId)
        console.log('📍 Default mic selected:', mics[0].label)
      }
    } catch (error) {
      console.error('Error listing microphones:', error)
    }
  }

  const testMicrophone = async () => {
    try {
      console.log('🧪 Testing microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true
      })

      const track = stream.getAudioTracks()[0]
      console.log('✅ Microphone connected:', track.label)
      console.log('📊 Settings:', track.getSettings())

      // Create audio context to check levels
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 256

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      console.log('🔊 Speak into your microphone for 3 seconds...')
      let maxLevel = 0
      const testInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length
        const level = Math.round(average)
        if (level > maxLevel) maxLevel = level
        console.log('Current level:', level, '| Max:', maxLevel)
      }, 100)

      setTimeout(() => {
        clearInterval(testInterval)
        stream.getTracks().forEach(t => t.stop())
        audioContext.close()
        if (maxLevel > 10) {
          console.log('✅ SUCCESS! Microphone is working. Max level:', maxLevel)
          alert(`✅ Microphone working! Max level: ${maxLevel}`)
        } else {
          console.log('❌ FAILED! No audio detected. Max level:', maxLevel)
          alert('❌ No audio detected! Check Windows microphone settings.')
        }
      }, 3000)

    } catch (error) {
      console.error('❌ Mic test error:', error)
      alert('Error: ' + (error as Error).message)
    }
  }

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


  const startConversation = async () => {
    if (isInitializing || conversationActive) {
      console.log('Already initializing or active, skipping...')
      return
    }

    try {
      setIsInitializing(true)
      console.log('Starting simple voice conversation (non-realtime)...')

      setConversationActive(true)
      setConversationHistory([])
      setConversationState('idle')
      setStatus('Ready - Click microphone to speak')
      console.log('Conversation ready - using standard Whisper + GPT-4 + TTS')
    } catch (error) {
      console.error('Conversation start error:', error)
      setStatus(`Error: ${(error as Error).message}`)
    } finally {
      setIsInitializing(false)
    }
  }

  const stopConversation = async () => {
    try {
      console.log('Stopping voice conversation...')

      // Stop any ongoing recording
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      setConversationActive(false)
      setConversationState('idle')
      setIsRecording(false)
      setStatus('Voice conversation stopped')
      console.log('Conversation stopped successfully')
    } catch (error) {
      console.error('Conversation stop error:', error)
      setStatus(`Error: ${(error as Error).message}`)
    }
  }

  const startManualRecording = async () => {
    try {
      console.log('Starting 5-second recording with optimized approach...')
      setConversationState('listening')
      setStatus('Recording for 5 seconds - Speak now!')

      // Request microphone access with specific constraints
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId ? {
          deviceId: { exact: selectedMicId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          sampleRate: 48000
        } : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          sampleRate: 48000
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      // Log audio track info for debugging
      const audioTrack = stream.getAudioTracks()[0]
      console.log(' Microphone stream obtained')
      console.log(' Audio track settings:', audioTrack.getSettings())
      console.log(' Audio track label:', audioTrack.label)
      console.log(' Audio track enabled:', audioTrack.enabled)
      console.log(' Audio track muted:', audioTrack.muted)
      console.log(' Audio track ready state:', audioTrack.readyState)

      // Check if the track is actually active
      if (audioTrack.readyState !== 'live') {
        throw new Error(' Microphone track is not live. Please check your microphone connection.')
      }

      if (audioTrack.muted) {
        console.warn(' WARNING: Microphone track is muted!')
      }

      // Set up audio visualization to monitor levels
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      // Resume audio context if suspended (required by browser security)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log(' Audio context resumed')
      }

      console.log(' Audio context state:', audioContextRef.current.state)

      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.3

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      console.log(' Audio source connected to analyser')

      const frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount)
      const timeDomainData = new Uint8Array(analyserRef.current.fftSize)

      // Monitor audio level during recording
      let levelInterval: ReturnType<typeof setInterval> | null = null
      let maxAudioLevel = 0
      const checkAudioLevel = () => {
        if (analyserRef.current) {
          // Check both frequency and time domain data
          analyserRef.current.getByteFrequencyData(frequencyData)
          analyserRef.current.getByteTimeDomainData(timeDomainData)

          const frequencyAvg = frequencyData.reduce((a, b) => a + b) / frequencyData.length

          // Calculate RMS (Root Mean Square) from time domain for better accuracy
          let sum = 0
          for (let i = 0; i < timeDomainData.length; i++) {
            const normalized = (timeDomainData[i] - 128) / 128
            sum += normalized * normalized
          }
          const rms = Math.sqrt(sum / timeDomainData.length)
          const rmsLevel = Math.round(rms * 100)

          const roundedLevel = Math.max(Math.round(frequencyAvg), rmsLevel)
          setAudioLevel(roundedLevel)
          if (roundedLevel > maxAudioLevel) {
            maxAudioLevel = roundedLevel
          }
          console.log('🎤 Audio level:', roundedLevel, '(freq:', Math.round(frequencyAvg), 'rms:', rmsLevel + ') | Max:', maxAudioLevel)
        }
      }

      levelInterval = setInterval(checkAudioLevel, 100)
      console.log('✅ Audio monitoring started - Speak now!')

      // Wait 500ms before starting recording
      await new Promise(resolve => setTimeout(resolve, 500))
      console.log('Audio monitoring active, max level so far:', maxAudioLevel)

      // Create MediaRecorder with specific options
      const options = { mimeType: 'audio/webm;codecs=opus' }
      const mediaRecorder = new MediaRecorder(stream, options)
      const audioChunks: Blob[] = []

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available, size:', event.data.size)
        if (event.data.size > 0) {
          audioChunks.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing...')
        console.log('Total chunks collected:', audioChunks.length)
        setConversationState('transcribing')
        setStatus('Processing speech...')

        try {
          // Create audio blob
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' })
          const audioBuffer = await audioBlob.arrayBuffer()

          console.log('Audio recorded, size:', audioBuffer.byteLength, 'bytes')
          console.log('Audio blob size:', audioBlob.size, 'bytes')
          console.log('Max audio level during recording:', maxAudioLevel)

          if (maxAudioLevel === 0) {
            console.warn('⚠️ Warning: Audio level was 0 during recording. Microphone may be muted in Windows.')
            console.warn('⚠️ If transcription is incorrect, check Windows Sound Settings > Input volume')
          }

          const electronAPI = (window as any).electronAPI

          // Step 1: Transcribe with Groq Whisper (with retry)
          setStatus('Transcribing speech... (this may take a moment)')
          const transcriptResult = await electronAPI.groqSaveAndTranscribe(audioBuffer)
          if (!transcriptResult.success || !transcriptResult.text) {
            const errorMsg = transcriptResult.error || 'Transcription failed'

            // Check if it's a rate limit error
            if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
              throw new Error('⚠️ Groq rate limit reached. Please wait a moment and try again.')
            }

            throw new Error(errorMsg)
          }

          const userText = transcriptResult.text.trim()
          console.log('📝 Transcription received:', userText)
          console.log('📝 Transcription length:', userText.length, 'characters')

          if (!userText || userText.length < 2) {
            console.warn('⚠️ Warning: Transcription is very short or empty')
          }

          setConversationHistory(prev => [...prev, { type: 'user', text: userText, timestamp: Date.now() }])

          // Step 2: Get GPT-4 response
          setConversationState('ai_thinking')
          setStatus('AI is thinking...')
          const chatResult = await electronAPI.chatSendMessage(userText)
          if (!chatResult.success || !chatResult.response) {
            throw new Error(chatResult.error || 'Failed to get AI response')
          }

          const aiResponse = chatResult.response
          console.log('AI response:', aiResponse)
          setConversationHistory(prev => [...prev, { type: 'ai', text: aiResponse, timestamp: Date.now() }])

          // Step 3: Generate speech with TTS
          setConversationState('tts_generating')
          setStatus('Generating voice...')
          const ttsResult = await electronAPI.ttsSynthesize(aiResponse)
          if (!ttsResult.success || !ttsResult.audio) {
            throw new Error(ttsResult.error || 'TTS failed')
          }

          // Step 4: Play audio
          setConversationState('ai_speaking')
          setStatus('AI is speaking...')
          await playAIAudio(ttsResult.audio)

          // Done
          setConversationState('idle')
          setStatus('Ready - Click microphone to speak again')
          console.log('Turn complete')
        } catch (error: any) {
          console.error('Processing error:', error)
          setStatus(`Error: ${error.message}`)
          setConversationState('idle')
        } finally {
          // Clean up interval
          if (levelInterval) {
            clearInterval(levelInterval)
            console.log('🛑 Audio monitoring stopped')
          }
          // Clean up stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
          }
          setAudioLevel(0)
        }
      }

      // Start recording with timeslice to collect data chunks
      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      console.log('Recording started with state:', mediaRecorder.state)

      // Stop after 5 seconds
      setTimeout(() => {
        console.log('Timeout reached, stopping recording. State:', mediaRecorder.state)
        if (levelInterval) {
          clearInterval(levelInterval)
          console.log('🛑 Audio monitoring stopped (timeout)')
        }
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop()
          setIsRecording(false)
        }
      }, 5000)

      console.log('Recording initiated')
    } catch (error: any) {
      console.error('Recording error:', error)
      setStatus(`Error: ${error.message}`)
      setConversationState('idle')
    }
  }

  const playAIAudio = async (audioBuffer: ArrayBuffer): Promise<void> => {
    return new Promise((resolve, reject) => {
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

        // Set up event handlers
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          console.log('AI audio playback finished')
          resolve()
        }

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl)
          console.error('Audio playback error:', error)
          reject(error)
        }

        // Play audio
        audio.play()
        console.log('Playing AI audio response')
      } catch (error) {
        console.error('Audio playback error:', error)
        reject(error)
      }
    })
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
        {/* Microphone Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '14px', color: '#666', display: 'block', marginBottom: '8px' }}>
            Select Microphone:
          </label>
          <select
            value={selectedMicId}
            onChange={(e) => setSelectedMicId(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              fontSize: '14px',
              cursor: 'pointer',
              marginBottom: '10px'
            }}
          >
            {availableMics.map(mic => (
              <option key={mic.deviceId} value={mic.deviceId}>
                {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <button
            onClick={testMicrophone}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            🧪 Test Microphone (3 sec)
          </button>
        </div>

        {/* Audio Level Indicator */}
        {conversationState === 'listening' && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
              Audio Level: {audioLevel > 10 ? '🔊' : '🔇'} {audioLevel}
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#eee',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(audioLevel * 2, 100)}%`,
                height: '100%',
                backgroundColor: audioLevel > 10 ? '#4CAF50' : '#f44336',
                transition: 'width 0.1s'
              }} />
            </div>
          </div>
        )}

        {/* Status Indicator */}
        <div style={{
          marginBottom: '30px',
          fontSize: '18px',
          color: '#666',
          fontWeight: '600',
          minHeight: '28px'
        }}>
          {!openaiStatus?.initialized && ' Setting up...'}
          {openaiStatus?.initialized && isInitializing && ' Initializing...'}
          {openaiStatus?.initialized && !isInitializing && !conversationActive && ' Click to start'}
          {openaiStatus?.initialized && !isInitializing && conversationActive && conversationState === 'idle' && '🎤 Click to record'}
          {conversationState === 'listening' && ' Recording... (5 seconds)'}
          {conversationState === 'transcribing' && ' Processing speech...'}
          {conversationState === 'ai_thinking' && ' AI thinking...'}
          {conversationState === 'tts_generating' && ' TTS'}
          {conversationState === 'ai_speaking' && ' AI responding...'}
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
