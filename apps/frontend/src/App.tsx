import { useState, useRef, useEffect } from 'react';
import './App.css';
import './electron.d';

interface DeepgramStatus {
  success: boolean;
  initialized: boolean;
  connected: boolean;
  avgLatency: number | null;
}

interface ConversationMessage {
  type: 'user' | 'ai';
  text: string;
  timestamp: number;
}

type ConversationState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'ai_thinking'
  | 'tts_generating'
  | 'ai_speaking';

function App() {
  const [, setIsRecording] = useState(false);
  const [, setStatus] = useState('Checking Deepgram status...');
  const [deepgramStatus, setDeepgramStatus] = useState<DeepgramStatus | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [conversationActive, setConversationActive] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>('idle');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);

  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);

  // Agent mode state
  const [agentMode, setAgentMode] = useState(false);
  const [vscodeConnected, setVscodeConnected] = useState(false);
  const [agentSteps, setAgentSteps] = useState<
    Array<{ tool: string; args: any; result: any; timestamp: number }>
  >([]);

  // Check Deepgram status on mount
  useEffect(() => {
    checkDeepgramStatus();
    listMicrophones();

    // Load voices for Web Speech API
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log('� Available TTS voices:', voices.length);
      };
    }

    // Listen for agent steps
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onAgentStep) {
      electronAPI.onAgentStep(
        (step: { tool: string; args: any; result: any; timestamp: number }) => {
          setAgentSteps((prev) => [...prev, step]);
        },
      );
    }
  }, []);

  const listMicrophones = async () => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((device) => device.kind === 'audioinput');
      console.log('� Available microphones:', mics);
      setAvailableMics(mics);
      if (mics.length > 0 && !selectedMicId) {
        setSelectedMicId(mics[0].deviceId);
        console.log('� Default mic selected:', mics[0].label);
      }
    } catch (error) {
      console.error('Error listing microphones:', error);
    }
  };

  const testMicrophone = async () => {
    try {
      console.log('� Testing microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
      });

      const track = stream.getAudioTracks()[0];
      console.log('Microphone connected:', track.label);
      console.log('� Settings:', track.getSettings());

      // Create audio context to check levels
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      console.log('� Speak into your microphone for 3 seconds...');
      let maxLevel = 0;
      const testInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        const level = Math.round(average);
        if (level > maxLevel) maxLevel = level;
        console.log('Current level:', level, '| Max:', maxLevel);
      }, 100);

      setTimeout(() => {
        clearInterval(testInterval);
        stream.getTracks().forEach((t) => t.stop());
        audioContext.close();
        if (maxLevel > 10) {
          console.log('SUCCESS! Microphone is working. Max level:', maxLevel);
          alert(`Microphone working! Max level: ${maxLevel}`);
        } else {
          console.log('FAILED! No audio detected. Max level:', maxLevel);
          alert('No audio detected! Check Windows microphone settings.');
        }
      }, 3000);
    } catch (error) {
      console.error('Mic test error:', error);
      alert('Error: ' + (error as Error).message);
    }
  };

  const checkDeepgramStatus = async () => {
    try {
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI || typeof electronAPI.deepgramStatus !== 'function') {
        setStatus('Error: Not running in Electron mode');
        return;
      }

      const result: DeepgramStatus = await electronAPI.deepgramStatus();
      setDeepgramStatus(result);

      if (result.initialized) {
        setStatus('Ready for live transcription with Deepgram + Groq');
      } else {
        setStatus('Deepgram API key not configured');
      }
    } catch (error) {
      console.error('Failed to check Deepgram status:', error);
      setStatus('Error checking Deepgram status');
    }
  };

  const speakText = async (text: string): Promise<void> => {
    if (!ttsEnabled) {
      console.log('TTS disabled, skipping speech');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        speechSynthesisRef.current = utterance;

        // Configure voice settings
        utterance.rate = 1.0; // Normal speed
        utterance.pitch = 1.0; // Normal pitch
        utterance.volume = 1.0; // Full volume

        // Get available voices and select a good English voice
        const voices = window.speechSynthesis.getVoices();
        const englishVoice =
          voices.find(
            (voice) =>
              voice.lang.startsWith('en-') &&
              (voice.name.includes('Google') || voice.name.includes('Microsoft')),
          ) || voices.find((voice) => voice.lang.startsWith('en-'));

        if (englishVoice) {
          utterance.voice = englishVoice;
          console.log('� Using voice:', englishVoice.name);
        }

        utterance.onstart = () => {
          console.log('� Started speaking');
          setConversationState('ai_speaking');
        };

        utterance.onend = () => {
          console.log('Finished speaking');
          setConversationState('idle');
          resolve();
        };

        utterance.onerror = (event) => {
          console.error('Speech error:', event.error);
          setConversationState('idle');
          reject(new Error(`Speech synthesis error: ${event.error}`));
        };

        console.log('� Speaking AI response...');
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('Speech synthesis failed:', error);
        setConversationState('idle');
        reject(error);
      }
    });
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    if (conversationState === 'ai_speaking') {
      setConversationState('idle');
    }
  };

  const toggleAgentMode = async () => {
    const electronAPI = (window as any).electronAPI;
    if (!agentMode) {
      // Turning on — connect to VS Code
      try {
        const result = await electronAPI.vscodeConnect();
        if (result.success) {
          setVscodeConnected(true);
          setAgentMode(true);
          setAgentSteps([]);
          console.log('Agent mode ON — VS Code connected');
        } else {
          alert(
            'Failed to connect to VS Code: ' +
              (result.error || 'Unknown error') +
              '\n\nMake sure VS Code is open with the Aurix extension installed.',
          );
        }
      } catch (error: any) {
        alert('Failed to connect to VS Code: ' + error.message);
      }
    } else {
      // Turning off
      try {
        await electronAPI.vscodeDisconnect();
      } catch {
        // ignore
      }
      setVscodeConnected(false);
      setAgentMode(false);
      console.log('Agent mode OFF');
    }
  };

  const startConversation = async () => {
    if (isInitializing || conversationActive) {
      console.log('Already initializing or active, skipping...');
      return;
    }

    try {
      setIsInitializing(true);
      console.log('Starting simple voice conversation (non-realtime)...');

      setConversationActive(true);
      setConversationHistory([]);
      setConversationState('idle');
      setStatus('Ready - Click microphone to speak');
      console.log('Conversation ready - using Deepgram STT + Groq LLaMA');
    } catch (error) {
      console.error('Conversation start error:', error);
      setStatus(`Error: ${(error as Error).message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopConversation = async () => {
    try {
      console.log('Stopping voice conversation...');

      // Stop any ongoing speech
      stopSpeaking();

      // Stop any ongoing recording
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      setConversationActive(false);
      setConversationState('idle');
      setIsRecording(false);
      setStatus('Voice conversation stopped');
      console.log('Conversation stopped successfully');
    } catch (error) {
      console.error('Conversation stop error:', error);
      setStatus(`Error: ${(error as Error).message}`);
    }
  };

  const startManualRecording = async () => {
    try {
      console.log('Starting 5-second recording with optimized approach...');
      setConversationState('listening');
      setStatus('Recording for 5 seconds - Speak now!');

      // Request microphone access with specific constraints
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId
          ? {
              deviceId: { exact: selectedMicId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: true,
              sampleRate: 48000,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: true,
              sampleRate: 48000,
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Log audio track info for debugging
      const audioTrack = stream.getAudioTracks()[0];
      console.log(' Microphone stream obtained');
      console.log(' Audio track settings:', audioTrack.getSettings());
      console.log(' Audio track label:', audioTrack.label);
      console.log(' Audio track enabled:', audioTrack.enabled);
      console.log(' Audio track muted:', audioTrack.muted);
      console.log(' Audio track ready state:', audioTrack.readyState);

      // Check if the track is actually active
      if (audioTrack.readyState !== 'live') {
        throw new Error(' Microphone track is not live. Please check your microphone connection.');
      }

      if (audioTrack.muted) {
        console.warn(' WARNING: Microphone track is muted!');
      }

      // Set up audio visualization to monitor levels
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      // Resume audio context if suspended (required by browser security)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log(' Audio context resumed');
      }

      console.log(' Audio context state:', audioContextRef.current.state);

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.3;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      console.log(' Audio source connected to analyser');

      const frequencyData = new Uint8Array(analyserRef.current.frequencyBinCount);
      const timeDomainData = new Uint8Array(analyserRef.current.fftSize);

      // Monitor audio level during recording
      let levelInterval: ReturnType<typeof setInterval> | null = null;
      let maxAudioLevel = 0;
      const checkAudioLevel = () => {
        if (analyserRef.current) {
          // Check both frequency and time domain data
          analyserRef.current.getByteFrequencyData(frequencyData);
          analyserRef.current.getByteTimeDomainData(timeDomainData);

          const frequencyAvg = frequencyData.reduce((a, b) => a + b) / frequencyData.length;

          // Calculate RMS (Root Mean Square) from time domain for better accuracy
          let sum = 0;
          for (let i = 0; i < timeDomainData.length; i++) {
            const normalized = (timeDomainData[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / timeDomainData.length);
          const rmsLevel = Math.round(rms * 100);

          const roundedLevel = Math.max(Math.round(frequencyAvg), rmsLevel);
          setAudioLevel(roundedLevel);
          if (roundedLevel > maxAudioLevel) {
            maxAudioLevel = roundedLevel;
          }
          console.log(
            '� Audio level:',
            roundedLevel,
            '(freq:',
            Math.round(frequencyAvg),
            'rms:',
            rmsLevel + ') | Max:',
            maxAudioLevel,
          );
        }
      };

      levelInterval = setInterval(checkAudioLevel, 100);
      console.log('Audio monitoring started - Speak now!');

      // Wait 500ms before starting recording
      await new Promise((resolve) => setTimeout(resolve, 500));
      console.log('Audio monitoring active, max level so far:', maxAudioLevel);

      // Create MediaRecorder with specific options
      const options = { mimeType: 'audio/webm;codecs=opus' };
      const mediaRecorder = new MediaRecorder(stream, options);
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available, size:', event.data.size);
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing...');
        console.log('Total chunks collected:', audioChunks.length);
        setConversationState('transcribing');
        setStatus('Processing speech...');

        try {
          // Create audio blob
          const audioBlob = new Blob(audioChunks, {
            type: 'audio/webm;codecs=opus',
          });
          const audioBuffer = await audioBlob.arrayBuffer();

          console.log('Audio recorded, size:', audioBuffer.byteLength, 'bytes');
          console.log('Audio blob size:', audioBlob.size, 'bytes');
          console.log('Max audio level during recording:', maxAudioLevel);

          if (maxAudioLevel === 0) {
            console.warn(
              ' Warning: Audio level was 0 during recording. Microphone may be muted in Windows.',
            );
            console.warn(
              ' If transcription is incorrect, check Windows Sound Settings > Input volume',
            );
          }

          const electronAPI = (window as any).electronAPI;

          // Step 1: Transcribe with Deepgram
          setStatus('Transcribing speech with Deepgram...');
          const transcriptResult = await electronAPI.deepgramSaveAndTranscribe(audioBuffer);
          if (!transcriptResult.success || !transcriptResult.text) {
            const errorMsg = transcriptResult.error || 'Transcription failed';
            throw new Error(errorMsg);
          }

          const userText = transcriptResult.text.trim();
          const confidence = transcriptResult.confidence || 0;
          console.log('� Transcription received:', userText);
          console.log('� Confidence:', (confidence * 100).toFixed(1) + '%');
          console.log('� Transcription length:', userText.length, 'characters');

          if (!userText || userText.length < 2) {
            console.warn(' Warning: Transcription is very short or empty');
          }

          setConversationHistory((prev) => [
            ...prev,
            { type: 'user', text: userText, timestamp: Date.now() },
          ]);

          // Step 2: Get AI response (agent mode or regular chat)
          let aiResponse: string;

          if (agentMode) {
            setConversationState('ai_thinking');
            setStatus('Agent is working in VS Code...');

            // Auto-reconnect if disconnected
            const statusCheck = await electronAPI.vscodeStatus();
            if (!statusCheck.connected) {
              setStatus('Reconnecting to VS Code...');
              const reconnect = await electronAPI.vscodeConnect();
              if (!reconnect.success) {
                throw new Error(
                  'VS Code not connected. Open VS Code with Aurix extension and try again.',
                );
              }
              setVscodeConnected(true);
            }

            const agentResult = await electronAPI.agentExecuteTask(userText);
            if (!agentResult.success || !agentResult.response) {
              throw new Error(agentResult.error || 'Agent execution failed');
            }
            aiResponse = agentResult.response;
            console.log('� Agent response:', aiResponse, 'Steps:', agentResult.steps?.length || 0);
          } else {
            setConversationState('ai_thinking');
            setStatus('AI is thinking (Groq LLaMA 3.3)...');
            const chatResult = await electronAPI.chatSendMessage(userText);
            if (!chatResult.success || !chatResult.response) {
              throw new Error(chatResult.error || 'Failed to get AI response');
            }
            aiResponse = chatResult.response;
            console.log('� AI response:', aiResponse);
          }
          setConversationHistory((prev) => [
            ...prev,
            { type: 'ai', text: aiResponse, timestamp: Date.now() },
          ]);

          // Step 3: Speak the AI response
          if (ttsEnabled) {
            setStatus('AI is speaking...');
            await speakText(aiResponse);
          }

          // Done
          setConversationState('idle');
          setStatus('Ready - Click microphone to speak again');
          console.log('Turn complete');
        } catch (error: any) {
          console.error('Processing error:', error);
          setStatus(`Error: ${error.message}`);
          setConversationState('idle');
        } finally {
          // Clean up interval
          if (levelInterval) {
            clearInterval(levelInterval);
            console.log('� Audio monitoring stopped');
          }
          // Clean up stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          setAudioLevel(0);
        }
      };

      // Start recording with timeslice to collect data chunks
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      console.log('Recording started with state:', mediaRecorder.state);

      // Stop after 5 seconds
      setTimeout(() => {
        console.log('Timeout reached, stopping recording. State:', mediaRecorder.state);
        if (levelInterval) {
          clearInterval(levelInterval);
          console.log('� Audio monitoring stopped (timeout)');
        }
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 5000);

      console.log('Recording initiated');
    } catch (error: any) {
      console.error('Recording error:', error);
      setStatus(`Error: ${error.message}`);
      setConversationState('idle');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Title */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: '40px',
        }}
      >
        <h1
          style={{
            fontSize: '48px',
            fontWeight: '700',
            color: 'white',
            margin: '0 0 10px 0',
            textShadow: '0 2px 10px rgba(0,0,0,0.2)',
          }}
        >
          AURIX
        </h1>
        <p
          style={{
            fontSize: '18px',
            color: 'rgba(255,255,255,0.9)',
            margin: 0,
          }}
        >
          Voice Assistant
        </p>
      </div>

      {/* Main Card */}
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '24px',
          padding: '40px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          maxWidth: '600px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Microphone Selector */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              fontSize: '14px',
              color: '#666',
              display: 'block',
              marginBottom: '8px',
            }}
          >
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
              marginBottom: '10px',
            }}
          >
            {availableMics.map((mic) => (
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
              fontWeight: '500',
              marginBottom: '10px',
            }}
          >
            � Test Microphone (3 sec)
          </button>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: ttsEnabled ? '#4CAF50' : '#9E9E9E',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.3s ease',
            }}
          >
            {ttsEnabled ? '� Voice Response: ON' : '� Voice Response: OFF'}
          </button>
          <button
            onClick={toggleAgentMode}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: agentMode ? '#FF9800' : '#9E9E9E',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.3s ease',
              marginTop: '6px',
            }}
          >
            {agentMode
              ? `Agent Mode: ON ${vscodeConnected ? '(VS Code Connected)' : '(Connecting...)'}`
              : 'Agent Mode: OFF'}
          </button>
        </div>

        {/* Audio Level Indicator */}
        {conversationState === 'listening' && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
              Audio Level: {audioLevel > 10 ? '�' : '�'} {audioLevel}
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#eee',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(audioLevel * 2, 100)}%`,
                  height: '100%',
                  backgroundColor: audioLevel > 10 ? '#4CAF50' : '#f44336',
                  transition: 'width 0.1s',
                }}
              />
            </div>
          </div>
        )}

        {/* Status Indicator */}
        <div
          style={{
            marginBottom: '30px',
            fontSize: '18px',
            color: '#666',
            fontWeight: '600',
            minHeight: '28px',
          }}
        >
          {!deepgramStatus?.initialized && 'Setting up...'}
          {deepgramStatus?.initialized && isInitializing && '� Initializing...'}
          {deepgramStatus?.initialized &&
            !isInitializing &&
            !conversationActive &&
            '� Click to start'}
          {deepgramStatus?.initialized &&
            !isInitializing &&
            conversationActive &&
            conversationState === 'idle' &&
            '� Click to record'}
          {conversationState === 'listening' && '� Recording... (5 seconds)'}
          {conversationState === 'transcribing' && '� Processing with Deepgram...'}
          {conversationState === 'ai_thinking' && '� Groq AI thinking...'}
          {conversationState === 'ai_speaking' && '� AI speaking...'}
        </div>

        {/* Main Button */}
        <button
          onClick={() => {
            if (!conversationActive && !isInitializing) {
              startConversation();
            } else if (conversationActive && conversationState === 'idle') {
              startManualRecording();
            }
          }}
          disabled={
            !deepgramStatus?.initialized ||
            isInitializing ||
            (conversationActive && conversationState !== 'idle')
          }
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            border: 'none',
            background: !deepgramStatus?.initialized
              ? '#ccc'
              : conversationState === 'listening'
                ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
                : conversationState === 'idle' || !conversationActive
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : '#e0e0e0',
            color: 'white',
            fontSize: '80px',
            cursor:
              deepgramStatus?.initialized && (conversationState === 'idle' || !conversationActive)
                ? 'pointer'
                : 'not-allowed',
            boxShadow:
              (conversationState === 'idle' || !conversationActive) && deepgramStatus?.initialized
                ? '0 10px 40px rgba(102, 126, 234, 0.4)'
                : conversationState === 'listening'
                  ? '0 10px 40px rgba(240, 147, 251, 0.4), 0 0 0 20px rgba(240, 147, 251, 0.1), 0 0 0 40px rgba(240, 147, 251, 0.05)'
                  : 'none',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            animation: conversationState === 'listening' ? 'pulse 1.5s infinite' : 'none',
          }}
          onMouseOver={(e) => {
            if (
              deepgramStatus?.initialized &&
              (conversationState === 'idle' || !conversationActive)
            ) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseOut={(e) => {
            if (
              deepgramStatus?.initialized &&
              (conversationState === 'idle' || !conversationActive)
            ) {
              e.currentTarget.style.transform = 'scale(1)';
            }
          }}
        >
          �
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
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#e0e0e0';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            End Session
          </button>
        )}

        {/* Latest Exchange - Only show most recent user input and AI output */}
        {conversationHistory.length > 0 && (
          <div
            style={{
              marginTop: '40px',
              textAlign: 'left',
              padding: '10px',
            }}
          >
            {/* User Input */}
            {(() => {
              const lastUserMsg = [...conversationHistory]
                .reverse()
                .find((msg) => msg.type === 'user');
              return (
                lastUserMsg && (
                  <div
                    style={{
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#999',
                        marginBottom: '8px',
                        fontWeight: '600',
                      }}
                    >
                      YOU SAID:
                    </div>
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        fontSize: '16px',
                        lineHeight: '1.6',
                      }}
                    >
                      {lastUserMsg.text}
                    </div>
                  </div>
                )
              );
            })()}

            {/* AI Output */}
            {(() => {
              const lastAIMsg = [...conversationHistory].reverse().find((msg) => msg.type === 'ai');
              return (
                lastAIMsg && (
                  <div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#999',
                        marginBottom: '8px',
                        fontWeight: '600',
                      }}
                    >
                      AI RESPONSE:
                    </div>
                    <div
                      style={{
                        padding: '16px 20px',
                        borderRadius: '12px',
                        backgroundColor: '#f5f5f5',
                        color: '#333',
                        fontSize: '16px',
                        lineHeight: '1.6',
                      }}
                    >
                      {lastAIMsg.text}
                    </div>
                  </div>
                )
              );
            })()}
          </div>
        )}

        {/* Agent Steps Panel */}
        {agentMode && agentSteps.length > 0 && (
          <div
            style={{
              marginTop: '20px',
              textAlign: 'left',
              padding: '16px',
              backgroundColor: '#FFF8E1',
              borderRadius: '12px',
              border: '1px solid #FFE082',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#F57F17',
                marginBottom: '12px',
                fontWeight: '700',
              }}
            >
              AGENT ACTIONS:
            </div>
            {agentSteps
              .filter((step, index, arr) => {
                // Deduplicate: keep only the latest step per file path
                if (!step.args?.path) return true;
                const lastIndex = arr.findLastIndex(
                  (s) => s.args?.path === step.args?.path && s.tool === step.tool,
                );
                return lastIndex === index;
              })
              .map((step, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  marginBottom: '8px',
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#F57F17',
                    minWidth: '18px',
                  }}
                >
                  {index + 1}.
                </span>
                <div>
                  <div style={{ fontWeight: '600', color: '#333' }}>
                    {step.tool.replace('_', ' ')}
                  </div>
                  <div
                    style={{
                      color: '#888',
                      fontSize: '11px',
                      marginTop: '2px',
                    }}
                  >
                    {step.args?.path ||
                      step.args?.command ||
                      JSON.stringify(step.args).slice(0, 60)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Setup Warning */}
        {!deepgramStatus?.initialized && (
          <div
            style={{
              marginTop: '30px',
              padding: '20px',
              backgroundColor: '#fff3cd',
              borderRadius: '12px',
              fontSize: '13px',
              color: '#856404',
              textAlign: 'left',
            }}
          >
            <strong> Setup Required</strong>
            <p style={{ margin: '10px 0 0 0' }}>
              Please configure your Deepgram and Groq API keys in the .env file
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
  );
}

export default App;
