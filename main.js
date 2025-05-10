// Initialize the worker but don't load model automatically
const worker = new Worker('worker.js', { type: 'module' });
console.log('Web Worker initialized');

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

// Model size in bytes (1.7B model is roughly 1.1 GB)
const MODEL_SIZE = 1.1 * 1024 * 1024 * 1024;

// Chat history with system message
let messages = [{
    role: "system",
    content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
}];

// Check WebGPU support and load the model
async function initialize() {
    console.log('Initializing chat application...');
    showLoading();
    worker.postMessage({ type: 'check' });
    worker.postMessage({ type: 'load' });
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
    messageBubble.style.whiteSpace = 'pre-wrap';  // Add this line to preserve whitespace
    messageBubble.textContent = content;

    messageDiv.appendChild(messageBubble);
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Handle form submission
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = userInput.value.trim();
    if (!message) return;

    console.log('User submitted message:', message);
    console.log('Current message history:', messages);

    // Add user message to chat
    addMessage(message, true);
    messages.push({ role: "user", content: message });

    // Clear input and show stop button
    userInput.value = '';
    stopButton.classList.remove('hidden');
    sendButton.disabled = true;
    userInput.disabled = true;

    // Send message to worker
    console.log('Sending message to worker for generation');
    worker.postMessage({
        type: 'generate',
        data: messages
    });
});

// Handle stop button
stopButton.addEventListener('click', () => {
    worker.postMessage({ type: 'interrupt' });
});

// Handle worker messages
let currentAssistantMessage = '';
worker.addEventListener('message', (e) => {
    const { status, data, output, type, progress } = e.data;
    console.log('Received worker message:', e.data);

    switch (status) {
        case 'error':
            console.error('Error from worker:', data);
            loadingText.textContent = 'Error: ' + data;
            hideLoading();
            sendButton.disabled = false;
            userInput.disabled = false;
            break;

        case 'loading':
            console.log('Loading status:', data);
            loadingDiv.classList.remove('hidden');
            loadingText.textContent = data;
            break;

        case 'progress':
            loadingDiv.classList.remove('hidden');
            const loaded = e.data.loaded || 0;
            if (loaded > 0) { // Only update if we have valid loaded bytes
                // Calculate and update progress
                const progress = Math.min((loaded / MODEL_SIZE) * 100, 100);
                const roundedProgress = Math.round(progress);
                modelProgress.style.width = `${progress}%`;
                modelPercent.textContent = `${roundedProgress}%`;
                
                // Update loaded size
                const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
                bytesLoaded.textContent = `${loadedMB} MB loaded`;
            }
            
            // Update model name if provided
            if (e.data.modelName && loadingText) {
                loadingText.textContent = `Loading ${e.data.modelName}`;
            }
            break;

        case 'progress_complete':
            // Keep progress at 100%
            modelProgress.style.width = '100%';
            modelPercent.textContent = '100%';
            bytesLoaded.textContent = `${(MODEL_SIZE / (1024 * 1024)).toFixed(1)} MB loaded`;
            if (e.data.modelName) {
                loadingText.textContent = `Loading ${e.data.modelName} complete`;
            }
            break;

        case 'ready':
            console.log('Components loaded successfully');
            loadingText.textContent = 'Ready to chat!';
            bytesLoaded.textContent = 'Loading complete';
            setTimeout(hideLoading, 1500);
            break;

        case 'start':
            console.log('Starting new generation');
            currentAssistantMessage = '';
            // Add an empty message div that we'll update with tokens
            addMessage('', false);
            break;

        case 'token':
            if (output) {
                currentAssistantMessage += output;
                const lastMessage = chatMessages.lastElementChild.querySelector('div');
                if (lastMessage) {
                    lastMessage.textContent = currentAssistantMessage;
                    scrollToBottom();
                }
            }
            break;

        case 'complete':
            console.log('Generation complete');
            // No need to update UI since we've been streaming
            messages.push({ role: "assistant", content: currentAssistantMessage });
            stopButton.classList.add('hidden');
            sendButton.disabled = false;
            userInput.disabled = false;
            break;
    }
});

// Add load model button click handler
loadModelButton.addEventListener('click', () => {
    console.log('Starting model initialization...');
    modelInfo.classList.add('hidden');
    chatInterface.classList.remove('hidden');
    initialize();
});
