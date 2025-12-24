

import Groq from 'groq-sdk'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp?: number
}

interface ChatConfig {
  systemPrompt?: string
  model?: string
  temperature?: number
  maxTokens?: number
  maxHistoryLength?: number
}

class GroqConversationManager {
  private groq: Groq | null = null
  private conversationHistory: ChatMessage[] = []
  private config: ChatConfig = {
    systemPrompt: 'You are a helpful voice assistant. Provide clear, concise, and friendly responses.',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxTokens: 1000,
    maxHistoryLength: 20
  }


  initialize(groq: Groq, config?: Partial<ChatConfig>): void {
    this.groq = groq
    if (config) {
      this.config = { ...this.config, ...config }
    }

    // Initialize with system prompt
    this.conversationHistory = [{
      role: 'system',
      content: this.config.systemPrompt!,
      timestamp: Date.now()
    }]

    console.log('Groq chat manager initialized with', this.config.model)
    console.log('System prompt:', this.config.systemPrompt)
  }

  /**
   * Check if chat is initialized
   */
  isInitialized(): boolean {
    return this.groq !== null
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(userMessage: string): Promise<string> {
    if (!this.groq) {
      throw new Error('Groq chat not initialized. Please call initialize first.')
    }

    try {
      console.log('User message:', userMessage)
      console.log('Current history length:', this.conversationHistory.length)

      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage,
        timestamp: Date.now()
      })

      // Trim history if it exceeds max length (keep system prompt)
      this.trimHistory()

      // Prepare messages for API
      const messages = this.conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      console.log('Sending to Groq:', this.config.model)
      console.log('Messages count:', messages.length)

      // Call Groq API
      const completion = await this.groq.chat.completions.create({
        model: this.config.model!,
        messages: messages as any,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })

      const assistantResponse = completion.choices[0]?.message?.content || 'I apologize, but I could not generate a response.'

      console.log('Assistant response:', assistantResponse)
      console.log('Tokens used:', completion.usage)

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantResponse,
        timestamp: Date.now()
      })

      return assistantResponse
    } catch (error: any) {
      console.error('Groq chat error:', error)

      if (error.status === 401) {
        throw new Error('Invalid Groq API key. Please check your .env file.')
      } else if (error.status === 429) {
        throw new Error('Groq API rate limit exceeded. Please try again in a moment.')
      } else if (error.status === 400) {
        throw new Error(`Invalid request: ${error.message}`)
      } else if (error.code === 'context_length_exceeded') {
        // Clear history and retry
        console.log('Context length exceeded, clearing history and retrying')
        this.clearHistory()
        return this.sendMessage(userMessage)
      }

      throw new Error(`Chat error: ${error.message}`)
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): ChatMessage[] {
    return this.conversationHistory
  }

  /**
   * Clear conversation history (keeps system prompt)
   */
  clearHistory(): void {
    const systemMessage = this.conversationHistory.find(msg => msg.role === 'system')
    this.conversationHistory = systemMessage ? [systemMessage] : []
    console.log('Conversation history cleared')
  }

  /**
   * Set system prompt (replaces existing one)
   */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt

    // Update system message in history
    const systemMsgIndex = this.conversationHistory.findIndex(msg => msg.role === 'system')
    if (systemMsgIndex >= 0) {
      this.conversationHistory[systemMsgIndex] = {
        role: 'system',
        content: prompt,
        timestamp: Date.now()
      }
    } else {
      // Add system message at the beginning
      this.conversationHistory.unshift({
        role: 'system',
        content: prompt,
        timestamp: Date.now()
      })
    }

    console.log('System prompt updated:', prompt)
  }

  /**
   * Get current configuration
   */
  getConfig(): ChatConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ChatConfig>): void {
    this.config = { ...this.config, ...config }
    console.log('Chat configuration updated:', config)
  }

  /**
   * Trim conversation history to maxHistoryLength
   * Keeps system prompt and removes oldest user/assistant pairs
   */
  private trimHistory(): void {
    const maxLength = this.config.maxHistoryLength!

    if (this.conversationHistory.length <= maxLength) {
      return
    }

    // Keep system prompt (first message) and most recent messages
    const systemMessage = this.conversationHistory[0]
    const recentMessages = this.conversationHistory.slice(-maxLength + 1)

    this.conversationHistory = [systemMessage, ...recentMessages]

    console.log(`History trimmed to ${this.conversationHistory.length} messages`)
  }

  /**
   * Get conversation summary (for debugging)
   */
  getSummary(): { totalMessages: number; userMessages: number; assistantMessages: number } {
    const userMessages = this.conversationHistory.filter(m => m.role === 'user').length
    const assistantMessages = this.conversationHistory.filter(m => m.role === 'assistant').length

    return {
      totalMessages: this.conversationHistory.length,
      userMessages,
      assistantMessages
    }
  }
}

// Export singleton instance
let groqConversationManager: GroqConversationManager | null = null

export function getGroqConversationManager(): GroqConversationManager {
  if (!groqConversationManager) {
    groqConversationManager = new GroqConversationManager()
  }
  return groqConversationManager
}

export function createGroqConversationManager(groq: Groq, config?: Partial<ChatConfig>): GroqConversationManager {
  groqConversationManager = new GroqConversationManager()
  groqConversationManager.initialize(groq, config)
  return groqConversationManager
}

export function resetGroqConversationManager(): void {
  groqConversationManager = null
}
