// Updated main.js to use the new generic LLM worker
// This demonstrates how to migrate from the old worker to the new generic one

// Initialize the generic worker
const worker = new Worker('generic-llm-worker.js', { type: 'module' });
console.log('Generic LLM Worker initialized');

// UI Elements
const modelInfo = document.getElementById('model-info');
const chatInterface = document.getElementById('chat-interface');
const loadModelButton = document.getElementById('load-model');
const loadingDiv = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const stopButton = document.getElementById('stop-button');

// Progress tracking elements
const modelProgress = document.getElementById('model-progress');
const modelPercent = document.getElementById('model-percent');
const bytesLoaded = document.getElementById('bytes-loaded');

// Model configuration - can be easily changed
const MODEL_CONFIG = {
  model: 'smollm2-1.7b', // Use predefined model identifier
  temperature: 0.7,
  top_p: 0.9,
  max_new_tokens: 1024,
  repetition_penalty: 1.1
};

// Session management
const sessionId = 'main-chat';
let isGenerating = false;

// Initialize the application
async function initialize() {
  console.log('Initializing chat application with generic worker...');
  showLoading();
  
  // Check WebGPU support first
  worker.postMessage({ type: 'check' });
  
  // Initialize the model
  worker.postMessage({ 
    type: 'initialize', 
    data: MODEL_CONFIG 
  });
}

function showLoading() {
  console.log('Showing loading UI');
  loadingDiv.classList.remove('hidden');
  userInput.disabled = true;
  sendButton.disabled = true;
}

function hideLoading() {
  console.log('Hiding loading UI');
  loadingDiv.classList.add('hidden');
  userInput.disabled = false;
  sendButton.disabled = false;
}

// Scroll chat to bottom
function scrollToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 100);
}

// Add a message to the chat
function addMessage(content, isUser = false) {
  console.log(`Adding ${isUser ? 'user' : 'assistant'} message:`, content);
  const messageDiv = document.createElement('div');
  messageDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;

  const messageBubble = document.createElement('div');
  messageBubble.className = `max-w-[70%] p-3 rounded-lg ${isUser ? 'bg-blue-500 text-white' : 'bg-gray-100'}`;
  messageBubble.style.whiteSpace = 'pre-wrap';
  messageBubble.textContent = content;

  messageDiv.appendChild(messageBubble);
  chatMessages.appendChild(messageDiv);
  scrollToBottom();
  
  return messageBubble; // Return reference for streaming updates
}

// Handle form submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message || isGenerating) return;

  console.log('User submitted message:', message);

  // Add user message to chat
  addMessage(message, true);

  // Clear input and show stop button
  userInput.value = '';
  stopButton.classList.remove('hidden');
  sendButton.disabled = true;
  userInput.disabled = true;
  isGenerating = true;

  // Send message to worker using new chat mode
  worker.postMessage({
    type: 'generateChat',
    data: {
      message: message,
      sessionId: sessionId,
      // Optional: can override generation config per message
      generationConfig: {
        temperature: 0.7 // Could make this user-configurable
      }
    }
  });
});

// Handle stop button
stopButton.addEventListener('click', () => {
  console.log('User requested to stop generation');
  worker.postMessage({ type: 'interrupt' });
});

// Handle worker messages
let currentMessageBubble = null;
let currentMessage = '';

worker.addEventListener('message', (e) => {
  const { type, status, data } = e.data;
  console.log('Received worker message:', { type, status, data });

  // Handle different message types
  switch (type) {
    case 'check':
      handleCheckResponse(status, data);
      break;
    case 'initialize':
      handleInitializeResponse(status, data);
      break;
    case 'generateChat':
      handleChatResponse(status, data);
      break;
    case 'interrupt':
      handleInterruptResponse(status, data);
      break;
    default:
      console.warn('Unknown message type:', type);
  }
});

function handleCheckResponse(status, data) {
  if (status === 'error') {
    console.error('WebGPU check failed:', data.error);
    loadingText.textContent = 'Error: ' + data.error;
    // Could show fallback options here
  } else if (status === 'success') {
    console.log('WebGPU supported:', data.webgpuSupported);
  }
}

function handleInitializeResponse(status, data) {
  switch (status) {
    case 'loading':
      loadingDiv.classList.remove('hidden');
      loadingText.textContent = data.message;
      break;
      
    case 'progress':
      loadingDiv.classList.remove('hidden');
      const { loaded, total, percentage, modelName } = data;
      
      // Update progress UI
      if (percentage !== undefined) {
        modelProgress.style.width = `${percentage}%`;
        modelPercent.textContent = `${percentage}%`;
      }
      
      if (loaded !== undefined) {
        const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
        bytesLoaded.textContent = `${loadedMB} MB loaded`;
      }
      
      if (modelName) {
        loadingText.textContent = `Loading ${modelName}...`;
      }
      break;
      
    case 'ready':
      console.log('Model loaded successfully');
      loadingText.textContent = 'Ready to chat!';
      bytesLoaded.textContent = 'Loading complete';
      setTimeout(hideLoading, 1500);
      break;
      
    case 'error':
      console.error('Model initialization failed:', data.error);
      loadingText.textContent = 'Error: ' + data.error;
      hideLoading();
      break;
  }
}

function handleChatResponse(status, data) {
  switch (status) {
    case 'start':
      console.log('Starting new generation for session:', data.sessionId);
      currentMessage = '';
      currentMessageBubble = addMessage('', false); // Add empty message bubble
      break;
      
    case 'streaming':
      // Update the message bubble with streaming content
      if (currentMessageBubble && data.fullText !== undefined) {
        currentMessage = data.fullText;
        currentMessageBubble.textContent = currentMessage;
        scrollToBottom();
      }
      break;
      
    case 'token_stats':
      // Could display performance stats in UI
      console.log('Tokens per second:', data.tokensPerSecond);
      break;
      
    case 'complete':
      console.log('Generation complete');
      console.log('Final response:', data.text);
      console.log('Performance:', data.tokensPerSecond, 'tokens/sec');
      
      // Ensure final message is displayed
      if (currentMessageBubble) {
        currentMessageBubble.textContent = data.text;
      }
      
      // Reset UI state
      stopButton.classList.add('hidden');
      sendButton.disabled = false;
      userInput.disabled = false;
      isGenerating = false;
      break;
      
    case 'error':
      console.error('Generation error:', data.error);
      if (currentMessageBubble) {
        currentMessageBubble.textContent = 'Error: ' + data.error;
        currentMessageBubble.className = currentMessageBubble.className.replace('bg-gray-100', 'bg-red-100');
      }
      
      // Reset UI state
      stopButton.classList.add('hidden');
      sendButton.disabled = false;
      userInput.disabled = false;
      isGenerating = false;
      break;
  }
}

function handleInterruptResponse(status, data) {
  console.log('Generation interrupted');
  if (currentMessageBubble) {
    currentMessageBubble.textContent = currentMessage + ' [Interrupted]';
  }
  
  // Reset UI state
  stopButton.classList.add('hidden');
  sendButton.disabled = false;
  userInput.disabled = false;
  isGenerating = false;
}

// Add load model button click handler
loadModelButton.addEventListener('click', () => {
  console.log('Starting model initialization...');
  modelInfo.classList.add('hidden');
  chatInterface.classList.remove('hidden');
  initialize();
});

// Optional: Add session management features
function clearChat() {
  // Clear UI
  chatMessages.innerHTML = '';
  
  // Clear worker session
  worker.postMessage({ 
    type: 'clearSession', 
    data: { sessionId: sessionId } 
  });
  
  console.log('Chat cleared');
}

// Optional: Add model switching functionality
function switchModel(newModelId) {
  const newConfig = {
    ...MODEL_CONFIG,
    model: newModelId
  };
  
  showLoading();
  worker.postMessage({ 
    type: 'initialize', 
    data: newConfig 
  });
}

// Optional: Get session information
function getSessionInfo() {
  worker.postMessage({ 
    type: 'getSessionInfo', 
    data: { sessionId: sessionId } 
  });
}

// Export functions for potential use in HTML or other modules
window.chatApp = {
  clearChat,
  switchModel,
  getSessionInfo
};
