import { useState, useRef, useEffect } from 'react'
import './App.css'
import './electron.d'

interface OpenAIStatus {
  success: boolean
  initialized: boolean
  apiKey: string | null
}

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [status, setStatus] = useState('Checking OpenAI status...')
  const [openaiStatus, setOpenaiStatus] = useState<OpenAIStatus | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [lastLatency, setLastLatency] = useState<number | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const speechStopTimeRef = useRef<number | null>(null)

  // Check OpenAI status on mount
  useEffect(() => {
    checkOpenAIStatus()

    // Set up listeners only once
    const electronAPI = (window as any).electronAPI
    if (!electronAPI) return

    // Create handler functions
    const handleTranscription = (text: string) => {
      console.log('📝 Received transcription:', text)

      // Calculate latency
      if (speechStopTimeRef.current) {
        const latency = Date.now() - speechStopTimeRef.current
        setLastLatency(latency)
        console.log(`⏱️ Total latency from speech stop to transcription: ${latency}ms`)
      }

      setTranscription(prev => {
        // Avoid duplicates by checking if text already exists
        if (prev.includes(text)) return prev
        return prev + ' ' + text
      })
    }

    const handleSpeechStarted = () => {
      console.log('🎤 Speech detected')
      setIsSpeaking(true)
    }

    const handleSpeechStopped = () => {
      console.log('⏸️  Speech ended')
      setIsSpeaking(false)
      speechStopTimeRef.current = Date.now()
    }

    const handleError = (error: string) => {
      console.error('❌ Realtime error:', error)
      setStatus(`Error: ${error}`)
    }

    // Set up listeners
    electronAPI.onRealtimeTranscription(handleTranscription)
    electronAPI.onRealtimeSpeechStarted(handleSpeechStarted)
    electronAPI.onRealtimeSpeechStopped(handleSpeechStopped)
    electronAPI.onRealtimeError(handleError)

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
        setStatus('✅ Ready for live transcription with OpenAI')
      } else {
        setStatus('⚠️ OpenAI API key not configured')
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

      console.log('✅ Realtime session started')

      // IMPORTANT: Wait 2 seconds for session to be fully ready
      console.log('⏳ Waiting for session to stabilize...')
      setStatus('⏳ Preparing microphone...')
      await new Promise(resolve => setTimeout(resolve, 2000))

      setStatus('🎤 Live transcription active - Speak now!')

      // Request microphone access
      console.log('🎤 Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      console.log('✅ Microphone stream obtained:', stream)
      console.log('Audio tracks:', stream.getAudioTracks())
      streamRef.current = stream

      // Create audio context for processing
      console.log('🔊 Creating AudioContext...')
      const audioContext = new AudioContext({ sampleRate: 24000 })
      audioContextRef.current = audioContext
      console.log('AudioContext state:', audioContext.state)

      // Resume audio context if suspended (required for some browsers)
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
        console.log('AudioContext resumed')
      }

      const source = audioContext.createMediaStreamSource(stream)
      console.log('✅ MediaStreamSource created')

      // Use ScriptProcessorNode temporarily for debugging
      // (Will replace with AudioWorklet once we verify mic works)
      console.log('🔧 Creating ScriptProcessorNode (temporary for debugging)...')
      const bufferSize = 4096
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1)
      processorRef.current = processor as any
      console.log('✅ ScriptProcessorNode created')

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
          console.log('📊 Audio level:', rms.toFixed(4))
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

      console.log('🔗 Connecting audio nodes...')
      source.connect(processor)
      processor.connect(audioContext.destination)
      console.log('✅ Audio pipeline connected')

      setIsRecording(true)
      setTranscription('')

      console.log('🎙️ Microphone connected, streaming audio...')
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
          (processorRef.current as any).onaudioprocess = null
          processorRef.current.disconnect()
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
      setStatus('✅ Live transcription stopped')

      console.log('✅ Stopped successfully')
    } catch (error) {
      console.error('Stop error:', error)
      setStatus(`Error stopping: ${(error as Error).message}`)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>AURIX Voice Assistant</h1>
        <p className="subtitle">🎙️ OpenAI Realtime - Live Transcription</p>
        {openaiStatus && (
          <p className="api-status" style={{
            color: openaiStatus.initialized ? '#4CAF50' : '#ff9800',
            fontSize: '14px',
            marginTop: '5px'
          }}>
            {openaiStatus.initialized ? '● Connected' : '○ Not Configured'}
          </p>
        )}
      </header>

      <main className="main-content">
        <div className="status-bar">
          <div className={`status-indicator ${isRecording && isSpeaking ? 'recording' : isRecording ? 'ready' : 'idle'}`}>
            {isRecording && isSpeaking && <span className="pulse"></span>}
          </div>
          <p className="status-text">{status}</p>
        </div>

        <div className="controls">
          {!isRecording ? (
            <button
              className="record-button"
              onClick={startLiveTranscription}
              disabled={!openaiStatus?.initialized}
              style={{
                opacity: !openaiStatus?.initialized ? 0.5 : 1,
                cursor: !openaiStatus?.initialized ? 'not-allowed' : 'pointer'
              }}
            >
              <svg className="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <span>Start Live Transcription</span>
            </button>
          ) : (
            <button
              className="stop-button"
              onClick={stopLiveTranscription}
            >
              <svg className="stop-icon" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              <span>Stop Transcription</span>
            </button>
          )}
        </div>

        {isRecording && (
          <div>
            <div className="live-indicator" style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              margin: '20px 0',
              padding: '15px',
              backgroundColor: isSpeaking ? '#e8f5e9' : '#f5f5f5',
              borderRadius: '8px',
              border: `2px solid ${isSpeaking ? '#4CAF50' : '#ddd'}`,
              transition: 'all 0.3s ease'
            }}>
              <span style={{ fontSize: '24px' }}>
                {isSpeaking ? '🎤' : '⏸️'}
              </span>
              <span style={{ fontWeight: 'bold', color: isSpeaking ? '#4CAF50' : '#666' }}>
                {isSpeaking ? 'Listening...' : 'Waiting for speech...'}
              </span>
            </div>

            <div style={{
              margin: '10px 0',
              padding: '15px',
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              border: '1px solid #ddd'
            }}>
              <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
                🎚️ Microphone Level: {(audioLevel * 100).toFixed(1)}%
              </div>
              <div style={{
                width: '100%',
                height: '20px',
                backgroundColor: '#ddd',
                borderRadius: '10px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(audioLevel * 100, 100)}%`,
                  height: '100%',
                  backgroundColor: audioLevel > 0.1 ? '#4CAF50' : audioLevel > 0.05 ? '#ff9800' : '#f44336',
                  transition: 'width 0.1s ease',
                  borderRadius: '10px'
                }}></div>
              </div>
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                {audioLevel < 0.01 ? '⚠️ No audio detected - check microphone' : audioLevel < 0.05 ? '⚠️ Audio very low' : '✅ Good audio level'}
              </div>
            </div>

            {lastLatency !== null && (
              <div style={{
                margin: '10px 0',
                padding: '10px 15px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                border: '1px solid #2196F3',
                fontSize: '13px',
                color: '#0d47a1'
              }}>
                ⏱️ <strong>Last transcription latency:</strong> {lastLatency}ms
                <span style={{ marginLeft: '10px', fontSize: '11px', color: '#666' }}>
                  ({(lastLatency / 1000).toFixed(2)}s after you stopped speaking)
                </span>
              </div>
            )}
          </div>
        )}

        {isRecording && (
          <div className="waveform">
            <div className="wave-bar" style={{ animationPlayState: isSpeaking ? 'running' : 'paused' }}></div>
            <div className="wave-bar" style={{ animationPlayState: isSpeaking ? 'running' : 'paused' }}></div>
            <div className="wave-bar" style={{ animationPlayState: isSpeaking ? 'running' : 'paused' }}></div>
            <div className="wave-bar" style={{ animationPlayState: isSpeaking ? 'running' : 'paused' }}></div>
            <div className="wave-bar" style={{ animationPlayState: isSpeaking ? 'running' : 'paused' }}></div>
          </div>
        )}

        <div className="transcription-box" style={{
          minHeight: '300px',
          maxHeight: '500px',
          overflowY: 'auto',
          border: '2px solid #4CAF50',
          backgroundColor: '#f5f5f5',
          padding: '20px',
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <h3 style={{ color: '#4CAF50', marginBottom: '15px' }}>
            Live Transcription:
          </h3>
          <div className="transcription-text" style={{
            fontSize: '18px',
            lineHeight: '1.8',
            color: '#333',
            minHeight: '100px',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
          }}>
            {transcription || (isRecording ? '(Listening... speak into your microphone)' : '(Click "Start Live Transcription" to begin...)')}
          </div>
        </div>

        {!openaiStatus?.initialized && (
          <div className="warning-box" style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            color: '#856404'
          }}>
            <strong>⚠️ Setup Required:</strong>
            <p>Please add your OpenAI API key to the .env file:</p>
            <code style={{
              display: 'block',
              marginTop: '10px',
              padding: '10px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              fontSize: '14px'
            }}>
              OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
            </code>
            <p style={{ marginTop: '10px', fontSize: '14px' }}>
              Get your API key from: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>https://platform.openai.com/api-keys</a>
            </p>
            <p style={{ marginTop: '10px', fontSize: '13px', fontStyle: 'italic' }}>
              Then restart the app with: <code>npm run electron:dev</code>
            </p>
          </div>
        )}

        {openaiStatus?.initialized && (
          <div className="info-box" style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196F3',
            borderRadius: '8px',
            color: '#0d47a1',
            fontSize: '14px'
          }}>
            <strong>💡 How it works:</strong>
            <ul style={{ marginTop: '10px', marginBottom: 0, paddingLeft: '20px' }}>
              <li>Transcription appears in real-time as you speak</li>
              <li>Green indicator shows when speech is detected</li>
              <li>No need to stop recording - transcription updates live</li>
              <li>Uses OpenAI's Realtime API with WebSocket streaming</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
