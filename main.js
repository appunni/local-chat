// Initialize the worker
const worker = new Worker('worker.js', { type: 'module' });
console.log('Web Worker initialized');

// UI Elements
const loadingDiv = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const progressBar = document.getElementById('progress-bar');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const stopButton = document.getElementById('stop-button');

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
    const { status, data, output, phase, progress, loaded, total, timeRemaining, elapsedTime, totalLoadTime, message } = e.data;
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
            loadingText.innerHTML = getLoadingMessage(e.data);
            if (typeof progress === 'number') {
                progressBar.style.width = `${progress}%`;
            }
            // Add phase-specific styling
            updateLoadingPhase(phase);
            break;

        case 'progress':
            if (typeof progress === 'number') {
                console.log('Loading progress:', progress + '%');
                progressBar.style.width = `${progress}%`;
                loadingText.innerHTML = getLoadingMessage(e.data);
            }
            break;

        case 'ready':
            console.log('Model ready for chat:', message);
            loadingText.innerHTML = `<span class="text-green-500">${message}</span>`;
            setTimeout(hideLoading, 1500); // Show completion message briefly
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

// Helper function to format loading messages with progress details
function getLoadingMessage(data) {
    const { phase, data: statusText, progress, loaded, total, timeRemaining, elapsedTime } = data;
    
    let message = `<div class="space-y-1">`;
    
    // Phase indicator
    const phases = {
        'initialization': '🚀 Initialization',
        'downloading': '📥 Downloading',
        'compilation': '⚙️ Compilation',
        'warmup': '🔥 Warm-up'
    };
    
    message += `<div class="font-bold">${phases[phase] || 'Loading'}</div>`;
    message += `<div>${statusText}</div>`;
    
    // Add progress details for downloading phase
    if (phase === 'downloading' && loaded && total) {
        message += `<div class="text-sm text-gray-600">
            ${loaded} / ${total} (${progress}%)<br>
            ${timeRemaining ? `⏱️ ~${timeRemaining} min remaining` : ''}
            ${elapsedTime ? `(${elapsedTime}s elapsed)` : ''}
        </div>`;
    }
    
    message += '</div>';
    return message;
}

// Update loading phase styling
function updateLoadingPhase(phase) {
    // Remove all previous phase classes
    progressBar.classList.remove(
        'bg-blue-500',   // initialization
        'bg-green-500',  // downloading
        'bg-yellow-500', // compilation
        'bg-purple-500'  // warmup
    );
    
    // Add new phase-specific class
    switch (phase) {
        case 'initialization':
            progressBar.classList.add('bg-blue-500');
            break;
        case 'downloading':
            progressBar.classList.add('bg-green-500');
            break;
        case 'compilation':
            progressBar.classList.add('bg-yellow-500');
            break;
        case 'warmup':
            progressBar.classList.add('bg-purple-500');
            break;
    }
}

// Start initialization
initialize();
