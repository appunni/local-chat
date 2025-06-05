import './style.css'
import type { 
  WorkerMessage, 
  ChatGenerationResult, 
  ProgressData,
  StreamData,
  TokenStats
} from './types'

// UI Elements
let worker: Worker | null = null
let currentSessionId = 'default'
let isModelLoaded = false

// DOM elements
const app = document.querySelector<HTMLDivElement>('#app')!

// Create the UI
function createUI() {
  app.innerHTML = `
    <div class="min-h-screen p-6">
      <div class="max-w-4xl mx-auto">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Generic LLM Worker Example
          </h1>
          <p class="text-gray-600 dark:text-gray-300">
            Demonstrating in-browser AI chat using HuggingFace Transformers
          </p>
        </div>

        <!-- Status Section -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">System Status</h2>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">WebGPU Support:</span>
              <span id="webgpu-status" class="px-2 py-1 rounded text-sm bg-gray-100 dark:bg-gray-700">
                Checking...
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-700 dark:text-gray-300">Model Status:</span>
              <span id="model-status" class="px-2 py-1 rounded text-sm bg-gray-100 dark:bg-gray-700">
                Not loaded
              </span>
            </div>
            <div id="progress-container" class="hidden">
              <div class="flex items-center justify-between mb-2">
                <span class="text-gray-700 dark:text-gray-300">Loading Progress:</span>
                <span id="progress-percentage" class="text-sm text-gray-600 dark:text-gray-400">0%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div id="progress-bar" class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
              </div>
              <div id="progress-details" class="text-xs text-gray-500 dark:text-gray-400 mt-1"></div>
            </div>
          </div>
        </div>

        <!-- Model Selection -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Model Selection</h2>
          <div class="flex gap-4 items-center">
            <select id="model-select" class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="smollm2-360m">SmolLM2 360M (Lightweight - 300MB)</option>
              <option value="smollm2-1.7b">SmolLM2 1.7B (Balanced - 1.1GB)</option>
            </select>
            <button id="load-model-btn" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              Load Model
            </button>
          </div>
        </div>

        <!-- Mode Selection -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Generation Mode</h2>
          <div class="flex gap-4">
            <label class="flex items-center">
              <input type="radio" name="mode" value="chat" checked class="mr-2 text-blue-600">
              <span class="text-gray-700 dark:text-gray-300">Chat Mode (Conversation)</span>
            </label>
            <label class="flex items-center">
              <input type="radio" name="mode" value="single" class="mr-2 text-blue-600">
              <span class="text-gray-700 dark:text-gray-300">Single Response</span>
            </label>
          </div>
        </div>

        <!-- Chat Interface -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6">
          <div class="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Chat Interface</h2>
          </div>
          
          <!-- Messages -->
          <div id="messages-container" class="h-96 overflow-y-auto p-6 space-y-4">
            <div class="text-center text-gray-500 dark:text-gray-400">
              Load a model to start chatting...
            </div>
          </div>

          <!-- Input -->
          <div class="p-6 border-t border-gray-200 dark:border-gray-700">
            <div class="flex gap-3">
              <input 
                type="text" 
                id="message-input" 
                placeholder="Type your message..." 
                class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                disabled
              >
              <button 
                id="send-btn" 
                class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled
              >
                Send
              </button>
              <button 
                id="clear-btn" 
                class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md transition-colors"
              >
                Clear
              </button>
            </div>
            <div id="generation-stats" class="mt-2 text-sm text-gray-500 dark:text-gray-400 hidden">
              <span id="tokens-per-second"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

// Initialize the worker
function initWorker() {
  worker = new Worker(new URL('./generic-llm-worker.ts', import.meta.url), { type: 'module' })
  
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, status, data } = event.data
    
    switch (type) {
      case 'check':
        handleWebGPUCheck(status, data)
        break
      case 'initialize':
        handleModelInit(status, data)
        break
      case 'generateChat':
        handleChatGeneration(status, data)
        break
      case 'generateSingle':
        handleSingleGeneration(status, data)
        break
      case 'clearSession':
        console.log('Session cleared:', data)
        break
      default:
        console.log('Unknown worker message:', event.data)
    }
  }

  worker.onerror = (error) => {
    console.error('Worker error:', error)
    updateModelStatus('Error', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200')
  }

  // Check WebGPU support
  worker.postMessage({ type: 'check' })
}

// Handle WebGPU support check
function handleWebGPUCheck(status: string, data: any) {
  const statusEl = document.getElementById('webgpu-status')!
  
  if (status === 'success') {
    statusEl.textContent = 'Supported ✓'
    statusEl.className = 'px-2 py-1 rounded text-sm bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  } else {
    statusEl.textContent = 'Not supported ✗'
    statusEl.className = 'px-2 py-1 rounded text-sm bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    console.error('WebGPU not supported:', data.error)
  }
}

// Handle model initialization
function handleModelInit(status: string, data: any) {
  const progressContainer = document.getElementById('progress-container')!
  const progressBar = document.getElementById('progress-bar')!
  const progressPercentage = document.getElementById('progress-percentage')!
  const progressDetails = document.getElementById('progress-details')!
  const loadBtn = document.getElementById('load-model-btn') as HTMLButtonElement
  
  switch (status) {
    case 'loading':
      updateModelStatus('Loading...', 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200')
      progressContainer.classList.remove('hidden')
      loadBtn.disabled = true
      break
      
    case 'progress':
      const progress = data as ProgressData
      progressBar.style.width = `${progress.percentage}%`
      progressPercentage.textContent = `${progress.percentage}%`
      progressDetails.textContent = `Loading ${progress.modelName}: ${progress.file}`
      break
      
    case 'ready':
      updateModelStatus('Ready ✓', 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200')
      progressContainer.classList.add('hidden')
      loadBtn.disabled = false
      isModelLoaded = true
      enableChatInterface()
      clearMessages()
      addMessage('system', 'Model loaded successfully! You can now start chatting.')
      break
      
    case 'error':
      updateModelStatus('Error ✗', 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200')
      progressContainer.classList.add('hidden')
      loadBtn.disabled = false
      console.error('Model initialization error:', data.error)
      break
  }
}

// Handle chat generation
function handleChatGeneration(status: string, data: any) {
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement
  const statsEl = document.getElementById('generation-stats')!
  const tokensEl = document.getElementById('tokens-per-second')!
  
  switch (status) {
    case 'start':
      sendBtn.disabled = true
      sendBtn.textContent = 'Generating...'
      addMessage('assistant', '', true) // Add placeholder for streaming
      break
      
    case 'streaming':
      const streamData = data as StreamData
      updateLastMessage(streamData.fullText)
      break
      
    case 'token_stats':
      const tokenStats = data as TokenStats
      tokensEl.textContent = `${tokenStats.tokensPerSecond.toFixed(1)} tokens/sec`
      statsEl.classList.remove('hidden')
      break
      
    case 'complete':
      const result = data as ChatGenerationResult
      sendBtn.disabled = false
      sendBtn.textContent = 'Send'
      updateLastMessage(result.text)
      console.log('Generation complete:', result)
      break
      
    case 'error':
      sendBtn.disabled = false
      sendBtn.textContent = 'Send'
      addMessage('system', `Error: ${data.error}`)
      console.error('Generation error:', data.error)
      break
  }
}

// Handle single generation
function handleSingleGeneration(status: string, data: any) {
  // Similar to chat generation but without session management
  handleChatGeneration(status, data)
}

// UI Helper functions
function updateModelStatus(text: string, className: string) {
  const statusEl = document.getElementById('model-status')!
  statusEl.textContent = text
  statusEl.className = `px-2 py-1 rounded text-sm ${className}`
}

function enableChatInterface() {
  const messageInput = document.getElementById('message-input') as HTMLInputElement
  const sendBtn = document.getElementById('send-btn') as HTMLButtonElement
  
  messageInput.disabled = false
  sendBtn.disabled = false
}

function addMessage(role: 'user' | 'assistant' | 'system', content: string, isStreaming = false) {
  const messagesContainer = document.getElementById('messages-container')!
  
  const messageDiv = document.createElement('div')
  messageDiv.className = `flex ${role === 'user' ? 'justify-end' : 'justify-start'}`
  
  const roleStyles = {
    user: 'bg-blue-600 text-white',
    assistant: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white',
    system: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
  }
  
  messageDiv.innerHTML = `
    <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${roleStyles[role]} ${isStreaming ? 'opacity-70' : ''}">
      <div class="text-sm font-medium mb-1 capitalize">${role}</div>
      <div class="message-content">${content}</div>
      ${isStreaming ? '<div class="animate-pulse">▋</div>' : ''}
    </div>
  `
  
  messagesContainer.appendChild(messageDiv)
  messagesContainer.scrollTop = messagesContainer.scrollHeight
}

function updateLastMessage(content: string) {
  const messagesContainer = document.getElementById('messages-container')!
  const lastMessage = messagesContainer.lastElementChild
  if (lastMessage) {
    const contentEl = lastMessage.querySelector('.message-content')!
    contentEl.textContent = content
  }
}

function clearMessages() {
  const messagesContainer = document.getElementById('messages-container')!
  messagesContainer.innerHTML = ''
}

// Event handlers
function setupEventListeners() {
  const loadBtn = document.getElementById('load-model-btn')!
  const sendBtn = document.getElementById('send-btn')!
  const clearBtn = document.getElementById('clear-btn')!
  const messageInput = document.getElementById('message-input') as HTMLInputElement
  
  loadBtn.addEventListener('click', () => {
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement
    const selectedModel = modelSelect.value
    
    worker?.postMessage({
      type: 'initialize',
      data: { model: selectedModel }
    })
  })
  
  sendBtn.addEventListener('click', sendMessage)
  
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })
  
  clearBtn.addEventListener('click', () => {
    if (isModelLoaded) {
      worker?.postMessage({
        type: 'clearSession',
        data: { sessionId: currentSessionId }
      })
    }
    clearMessages()
  })
}

function sendMessage() {
  const messageInput = document.getElementById('message-input') as HTMLInputElement
  const message = messageInput.value.trim()
  
  if (!message || !isModelLoaded) return
  
  const modeInputs = document.querySelectorAll('input[name="mode"]') as NodeListOf<HTMLInputElement>
  const selectedMode = Array.from(modeInputs).find(input => input.checked)?.value || 'chat'
  
  addMessage('user', message)
  messageInput.value = ''
  
  if (selectedMode === 'chat') {
    worker?.postMessage({
      type: 'generateChat',
      data: {
        message,
        sessionId: currentSessionId,
        generationConfig: {
          max_new_tokens: 512,
          temperature: 0.7,
          top_p: 0.9
        }
      }
    })
  } else {
    worker?.postMessage({
      type: 'generateSingle',
      data: {
        prompt: message,
        generationConfig: {
          max_new_tokens: 512,
          temperature: 0.7,
          top_p: 0.9
        }
      }
    })
  }
}

// Initialize the application
function init() {
  createUI()
  setupEventListeners()
  initWorker()
}

// Start the app
init()
