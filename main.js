// Initialize the worker
const worker = new Worker('worker.js', { type: 'module' });
console.log('Web Worker initialized');

// UI Elements
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
const estimatedTime = document.getElementById('estimated-time');

// Helper function to format time
function formatTime(ms) {
    if (ms < 1000) return 'less than a second';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`;
}

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

// Add a message to the chat
function addMessage(content, isUser = false) {
    console.log(`Adding ${isUser ? 'user' : 'assistant'} message:`, content);
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${isUser ? 'justify-end' : 'justify-start'}`;

    const messageBubble = document.createElement('div');
    messageBubble.className = `max-w-[70%] p-3 rounded-lg ${isUser ? 'bg-blue-500 text-white' : 'bg-gray-100'
        }`;
    messageBubble.textContent = content;

    messageDiv.appendChild(messageBubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
            if (typeof progress === 'number') {
                console.log('Model loading progress:', progress + '%');
                const roundedProgress = Math.round(progress);
                modelProgress.style.width = `${progress}%`;
                modelPercent.textContent = `${roundedProgress}%`;
                if (data.timeRemaining) {
                    estimatedTime.textContent = `${formatTime(data.timeRemaining)} remaining`;
                }
                if (data.stage) {
                    loadingText.textContent = `Loading ${data.stage}...`;
                }
            }
            break;

        case 'ready':
            console.log('Components loaded successfully');
            loadingText.textContent = 'Ready to chat!';
            estimatedTime.textContent = 'Loading complete';
            setTimeout(hideLoading, 1500);
            break;

        case 'start':
            console.log('Starting new generation');
            currentAssistantMessage = '';
            // Show "Generating..." message
            addMessage('Generating...', false);
            break;

        case 'update':
            // Just log the tokens but don't update UI
            if (output) {
                console.log('Token generated:', output);
            }
            break;

        case 'complete':
            console.log('Generation complete, final output:', output);
            if (output) {
                const lastMessage = chatMessages.lastElementChild.querySelector('div');
                if (lastMessage) {
                    // Replace "Generating..." with the final output
                    lastMessage.textContent = output;
                }
                currentAssistantMessage = output;
                messages.push({ role: "assistant", content: output });
            }
            stopButton.classList.add('hidden');
            sendButton.disabled = false;
            userInput.disabled = false;
            break;
    }
});

// Start initialization
initialize();
