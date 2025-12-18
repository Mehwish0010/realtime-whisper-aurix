// AudioWorklet processor for capturing audio data
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.bufferSize = 4096
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]

    if (input.length > 0) {
      const inputChannel = input[0]

      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i]

        // When buffer is full, send it to main thread
        if (this.bufferIndex >= this.bufferSize) {
          // Calculate audio level (RMS)
          let sum = 0
          for (let j = 0; j < this.bufferSize; j++) {
            sum += this.buffer[j] * this.buffer[j]
          }
          const rms = Math.sqrt(sum / this.bufferSize)

          // Convert Float32 to Int16 (PCM16)
          const pcm16 = new Int16Array(this.bufferSize)
          for (let j = 0; j < this.bufferSize; j++) {
            const s = Math.max(-1, Math.min(1, this.buffer[j]))
            pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }

          // Send to main thread
          this.port.postMessage({
            audio: pcm16,
            level: rms
          })

          this.bufferIndex = 0
        }
      }
    }

    return true
  }
}

registerProcessor('audio-processor', AudioProcessor)
