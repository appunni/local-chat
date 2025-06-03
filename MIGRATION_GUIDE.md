# Migration Guide: From Original Worker to Generic LLM Worker

This guide helps you migrate from the original `worker.js` to the new `generic-llm-worker.js`.

## Key Differences

### Architecture Changes

| Aspect | Original Worker | Generic Worker |
|--------|----------------|----------------|
| **Model Loading** | Hardcoded SmolLM2-1.7B | Configurable models |
| **Use Cases** | Chat only | Chat + Single responses |
| **Session Management** | Single conversation | Multiple sessions |
| **Message Format** | Simple status/data | Structured type/status/data |
| **Configuration** | Fixed parameters | Configurable generation params |
| **Error Handling** | Basic | Enhanced with detailed errors |

### API Changes

#### Initialization

**Original:**
```javascript
worker.postMessage({ type: 'load' });
```

**New:**
```javascript
worker.postMessage({ 
  type: 'initialize', 
  data: { 
    model: 'smollm2-1.7b',
    temperature: 0.7,
    max_new_tokens: 1024
  } 
});
```

#### Text Generation

**Original:**
```javascript
// Only supported chat with message array
worker.postMessage({ 
  type: 'generate', 
  data: messages 
});
```

**New:**
```javascript
// Chat mode
worker.postMessage({ 
  type: 'generateChat', 
  data: { 
    message: 'Hello',
    sessionId: 'chat1',
    systemMessage: 'You are helpful'
  } 
});

// Single response mode (NEW)
worker.postMessage({ 
  type: 'generateSingle', 
  data: { 
    prompt: 'Explain quantum computing',
    systemMessage: 'You are a teacher'
  } 
});
```

#### Response Handling

**Original:**
```javascript
worker.addEventListener('message', (e) => {
  const { status, output, data } = e.data;
  
  switch (status) {
    case 'loading':
      handleLoading(data);
      break;
    case 'progress':
      handleProgress(e.data.loaded);
      break;
    case 'ready':
      handleReady();
      break;
    case 'start':
      handleStart();
      break;
    case 'token':
      handleToken(output);
      break;
    case 'complete':
      handleComplete(output);
      break;
    case 'error':
      handleError(data);
      break;
  }
});
```

**New:**
```javascript
worker.addEventListener('message', (e) => {
  const { type, status, data } = e.data;
  
  switch (type) {
    case 'initialize':
      handleInitialize(status, data);
      break;
    case 'generateChat':
    case 'generateSingle':
      handleGeneration(status, data);
      break;
    case 'getSessionInfo':
      handleSessionInfo(status, data);
      break;
  }
});

function handleGeneration(status, data) {
  switch (status) {
    case 'start':
      handleStart();
      break;
    case 'streaming':
      handleToken(data.token, data.fullText);
      break;
    case 'complete':
      handleComplete(data.text, data.tokensPerSecond);
      break;
    case 'error':
      handleError(data.error);
      break;
  }
}
```

## Step-by-Step Migration

### Step 1: Update Worker File

Replace `worker.js` with `generic-llm-worker.js` or update your worker import:

```javascript
// OLD
const worker = new Worker('worker.js', { type: 'module' });

// NEW
const worker = new Worker('generic-llm-worker.js', { type: 'module' });
```

### Step 2: Update Initialization Code

**Before:**
```javascript
function initialize() {
  worker.postMessage({ type: 'check' });
  worker.postMessage({ type: 'load' });
}
```

**After:**
```javascript
function initialize() {
  worker.postMessage({ type: 'check' });
  worker.postMessage({ 
    type: 'initialize',
    data: {
      model: 'smollm2-1.7b', // or your preferred model
      temperature: 0.7,
      top_p: 0.9,
      max_new_tokens: 1024
    }
  });
}
```

### Step 3: Update Message Sending

**Before:**
```javascript
// Had to manage message history manually
let messages = [
  { role: "system", content: "You are helpful" },
  { role: "user", content: userMessage }
];

worker.postMessage({
  type: 'generate',
  data: messages
});
```

**After:**
```javascript
// Option 1: Use chat mode (automatic history management)
worker.postMessage({
  type: 'generateChat',
  data: {
    message: userMessage,
    sessionId: 'main-chat' // optional
  }
});

// Option 2: Use single mode (no history)
worker.postMessage({
  type: 'generateSingle',
  data: {
    prompt: userMessage,
    systemMessage: 'You are helpful'
  }
});
```

### Step 4: Update Response Handling

**Before:**
```javascript
worker.addEventListener('message', (e) => {
  const { status, output } = e.data;
  
  if (status === 'token' && output) {
    currentMessage += output;
    updateUI(currentMessage);
  } else if (status === 'complete') {
    finalizeMesage(output);
  }
});
```

**After:**
```javascript
worker.addEventListener('message', (e) => {
  const { type, status, data } = e.data;
  
  if (type === 'generateChat' || type === 'generateSingle') {
    if (status === 'streaming') {
      // More data available
      updateUI(data.fullText); // Complete text so far
      // or handle individual tokens: data.token
    } else if (status === 'complete') {
      finalizeMessage(data.text);
      console.log(`Generated at ${data.tokensPerSecond} tokens/sec`);
    }
  }
});
```

### Step 5: Add New Features (Optional)

#### Multiple Sessions
```javascript
// Create different chat contexts
function startCodingSession() {
  worker.postMessage({
    type: 'generateChat',
    data: {
      message: 'Help me with JavaScript',
      sessionId: 'coding',
      systemMessage: 'You are a senior developer'
    }
  });
}

function startCreativeSession() {
  worker.postMessage({
    type: 'generateChat',
    data: {
      message: 'Tell me a story',
      sessionId: 'creative',
      systemMessage: 'You are a storyteller'
    }
  });
}
```

#### Session Management
```javascript
// Clear a session
worker.postMessage({
  type: 'clearSession',
  data: { sessionId: 'coding' }
});

// Get session info
worker.postMessage({
  type: 'getSessionInfo',
  data: { sessionId: 'coding' }
});
```

#### Dynamic Model Switching
```javascript
function switchToFasterModel() {
  worker.postMessage({
    type: 'initialize',
    data: {
      model: 'smollm2-360m', // Smaller, faster model
      max_new_tokens: 256
    }
  });
}
```

## Complete Migration Example

Here's a complete before/after example:

### Original Implementation
```javascript
const worker = new Worker('worker.js', { type: 'module' });
let messages = [{ role: "system", content: "You are helpful" }];
let currentResponse = '';

function sendMessage(userMessage) {
  messages.push({ role: "user", content: userMessage });
  worker.postMessage({ type: 'generate', data: messages });
}

worker.addEventListener('message', (e) => {
  switch (e.data.status) {
    case 'ready':
      enableChat();
      break;
    case 'token':
      currentResponse += e.data.output;
      updateDisplay(currentResponse);
      break;
    case 'complete':
      messages.push({ role: "assistant", content: e.data.output });
      finalizeResponse();
      break;
  }
});

// Initialize
worker.postMessage({ type: 'load' });
```

### New Implementation
```javascript
const worker = new Worker('generic-llm-worker.js', { type: 'module' });
const sessionId = 'main-chat';

function sendMessage(userMessage) {
  worker.postMessage({
    type: 'generateChat',
    data: {
      message: userMessage,
      sessionId: sessionId
    }
  });
}

worker.addEventListener('message', (e) => {
  const { type, status, data } = e.data;
  
  if (type === 'initialize') {
    if (status === 'ready') {
      enableChat();
    }
  } else if (type === 'generateChat') {
    switch (status) {
      case 'streaming':
        updateDisplay(data.fullText);
        break;
      case 'complete':
        finalizeResponse(data.text);
        console.log(`Speed: ${data.tokensPerSecond} tokens/sec`);
        break;
    }
  }
});

// Initialize with configuration
worker.postMessage({
  type: 'initialize',
  data: {
    model: 'smollm2-1.7b',
    temperature: 0.7,
    max_new_tokens: 1024
  }
});
```

## Benefits of Migration

1. **Flexibility**: Support for multiple models and use cases
2. **Better Performance**: Optimized loading and generation
3. **Session Management**: Multiple conversation contexts
4. **Enhanced API**: More structured and predictable
5. **Error Handling**: Better error reporting and recovery
6. **Future-Proof**: Easier to extend and maintain

## Common Migration Issues

### Issue 1: Progress Tracking Changed
**Problem**: Progress percentages don't work
**Solution**: Update progress handling to use new data structure:

```javascript
// OLD
if (e.data.status === 'progress') {
  updateProgress(e.data.loaded);
}

// NEW
if (type === 'initialize' && status === 'progress') {
  updateProgress(data.percentage, data.loaded, data.total);
}
```

### Issue 2: Message History Lost
**Problem**: Conversation context is lost
**Solution**: Use chat mode instead of single mode:

```javascript
// Don't use 'generateSingle' for conversations
// Use 'generateChat' to maintain history
```

### Issue 3: Token Streaming Different
**Problem**: Token handling changed
**Solution**: Use the new streaming format:

```javascript
// OLD
if (status === 'token') {
  handleToken(output);
}

// NEW
if (status === 'streaming') {
  handleToken(data.token); // Individual token
  handleFullText(data.fullText); // Complete text so far
}
```

## Testing Your Migration

1. **Test Model Loading**: Verify initialization works
2. **Test Basic Chat**: Send a few messages
3. **Test Interruption**: Verify stop functionality
4. **Test Error Handling**: Check error scenarios
5. **Test Performance**: Compare token generation speed

## Need Help?

- Check the examples in the `examples/` folder
- Review the complete API documentation in `GENERIC_WORKER_README.md`
- Look at the updated `main-updated.js` for a complete implementation
