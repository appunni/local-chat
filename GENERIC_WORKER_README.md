# Generic LLM Worker

A reusable, configurable web worker for running language models in the browser with WebGPU acceleration.

## Features

- **Model Agnostic**: Configure any HuggingFace model
- **Multiple Modes**: Chat conversations or single responses  
- **Session Management**: Multiple conversation sessions
- **Streaming Support**: Real-time token generation
- **Progress Tracking**: Detailed loading progress
- **WebGPU Detection**: Automatic capability checking
- **Configurable Parameters**: Temperature, top_p, max_tokens, etc.
- **Error Handling**: Robust error reporting and recovery

## Quick Start

### Basic Setup

```javascript
// Initialize the worker
const worker = new Worker('generic-llm-worker.js', { type: 'module' });

// Configure the model
const modelConfig = {
  model: 'smollm2-1.7b', // Use predefined model
  temperature: 0.7,
  top_p: 0.9,
  max_new_tokens: 512
};

// Initialize the model
worker.postMessage({
  type: 'initialize',
  data: modelConfig
});
```

### Chat Mode (Conversation)

```javascript
// Send a chat message
worker.postMessage({
  type: 'generateChat',
  data: {
    message: "Hello, how are you?",
    sessionId: "user123", // Optional: default is 'default'
    systemMessage: "You are a helpful assistant", // Optional
    generationConfig: { temperature: 0.8 } // Optional overrides
  }
});

// Handle responses
worker.addEventListener('message', (e) => {
  const { type, status, data } = e.data;
  
  if (type === 'generateChat') {
    switch (status) {
      case 'start':
        console.log('Generation started');
        break;
      case 'streaming':
        console.log('Token:', data.token);
        console.log('Full text so far:', data.fullText);
        break;
      case 'complete':
        console.log('Final response:', data.text);
        console.log('Tokens per second:', data.tokensPerSecond);
        break;
      case 'error':
        console.error('Error:', data.error);
        break;
    }
  }
});
```

### Single Mode (One-off responses)

```javascript
// Generate a single response
worker.postMessage({
  type: 'generateSingle',
  data: {
    prompt: "Explain quantum computing in simple terms",
    systemMessage: "You are a science teacher", // Optional
    generationConfig: { max_new_tokens: 256 } // Optional
  }
});

// Handle response (similar to chat mode)
worker.addEventListener('message', (e) => {
  if (e.data.type === 'generateSingle' && e.data.status === 'complete') {
    console.log('Response:', e.data.data.text);
  }
});
```

## API Reference

### Message Types

#### `initialize`
Initialize the model with configuration.

```javascript
worker.postMessage({
  type: 'initialize',
  data: {
    model: 'smollm2-1.7b', // or custom model config
    temperature: 0.7,      // Optional: generation temperature
    top_p: 0.9,           // Optional: nucleus sampling
    max_new_tokens: 1024, // Optional: max tokens to generate
    repetition_penalty: 1.1 // Optional: repetition penalty
  }
});
```

**Responses:**
- `status: 'loading'` - Model loading started
- `status: 'progress'` - Loading progress update
- `status: 'ready'` - Model ready for inference
- `status: 'error'` - Initialization failed

#### `generateChat`
Generate text in chat mode (maintains conversation history).

```javascript
worker.postMessage({
  type: 'generateChat',
  data: {
    message: string,           // Required: user message
    sessionId?: string,        // Optional: session identifier
    systemMessage?: string,    // Optional: system message override
    generationConfig?: object  // Optional: generation parameter overrides
  }
});
```

**Responses:**
- `status: 'start'` - Generation started
- `status: 'streaming'` - Token being streamed
- `status: 'token_stats'` - Performance statistics
- `status: 'complete'` - Generation finished
- `status: 'error'` - Generation failed

#### `generateSingle`
Generate text in single mode (no conversation history).

```javascript
worker.postMessage({
  type: 'generateSingle',
  data: {
    prompt: string,            // Required: input prompt
    systemMessage?: string,    // Optional: system message
    generationConfig?: object  // Optional: generation parameter overrides
  }
});
```

**Responses:** Same as `generateChat`

#### `interrupt`
Stop current generation.

```javascript
worker.postMessage({
  type: 'interrupt'
});
```

#### `clearSession`
Clear conversation history for a session.

```javascript
worker.postMessage({
  type: 'clearSession',
  data: {
    sessionId?: string // Optional: session to clear (default: 'default')
  }
});
```

#### `getSessionInfo`
Get information about a conversation session.

```javascript
worker.postMessage({
  type: 'getSessionInfo',
  data: {
    sessionId?: string // Optional: session to query (default: 'default')
  }
});
```

#### `check`
Check WebGPU support.

```javascript
worker.postMessage({
  type: 'check'
});
```

#### `getModels`
Get list of available predefined models.

```javascript
worker.postMessage({
  type: 'getModels'
});
```

### Model Configuration

#### Predefined Models

```javascript
// Available predefined models
{
  'smollm2-1.7b': {
    id: "HuggingFaceTB/SmolLM2-1.7B-Instruct",
    dtype: "q4f16",
    device: "webgpu", 
    size: 1.1 * 1024 * 1024 * 1024, // 1.1GB
    description: "SmolLM2 1.7B - Efficient chat model"
  },
  'smollm2-360m': {
    id: "HuggingFaceTB/SmolLM2-360M-Instruct",
    dtype: "q4f16",
    device: "webgpu",
    size: 0.3 * 1024 * 1024 * 1024, // 300MB  
    description: "SmolLM2 360M - Lightweight chat model"
  }
}
```

#### Custom Model Configuration

```javascript
const customModelConfig = {
  model: {
    id: "microsoft/DialoGPT-medium",
    dtype: "q4f16",
    device: "webgpu",
    size: 500 * 1024 * 1024, // 500MB
    description: "Custom DialoGPT model"
  },
  temperature: 0.8,
  max_new_tokens: 256
};
```

### Generation Parameters

```javascript
const generationConfig = {
  do_sample: true,          // Enable sampling
  temperature: 0.7,         // Randomness (0.0 = deterministic, 1.0 = very random)
  top_p: 0.9,              // Nucleus sampling threshold
  max_new_tokens: 1024,    // Maximum tokens to generate
  repetition_penalty: 1.1   // Penalty for repetitive text
};
```

## Advanced Usage

### Multiple Sessions

```javascript
// Chat with different personas/contexts
worker.postMessage({
  type: 'generateChat', 
  data: {
    message: "Help me with coding",
    sessionId: "coding-session",
    systemMessage: "You are a senior software engineer"
  }
});

worker.postMessage({
  type: 'generateChat',
  data: {
    message: "Tell me a story", 
    sessionId: "creative-session",
    systemMessage: "You are a creative storyteller"
  }
});
```

### Progress Tracking

```javascript
worker.addEventListener('message', (e) => {
  if (e.data.type === 'initialize' && e.data.status === 'progress') {
    const { loaded, total, percentage, modelName } = e.data.data;
    console.log(`Loading ${modelName}: ${percentage}% (${loaded}/${total} bytes)`);
    
    // Update progress bar
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}%`;
  }
});
```

### Error Handling

```javascript
worker.addEventListener('message', (e) => {
  if (e.data.status === 'error') {
    console.error('Worker error:', e.data.data.error);
    
    // Handle specific error types
    if (e.data.data.error.includes('WebGPU')) {
      showWebGPUErrorMessage();
    } else if (e.data.data.error.includes('Model not initialized')) {
      reinitializeModel();
    }
  }
});
```

## Migration Guide

### From Original worker.js

If you're migrating from the original `worker.js`, here are the key changes:

#### Old API:
```javascript
// Old way
worker.postMessage({ type: 'load' });
worker.postMessage({ type: 'generate', data: messages });
```

#### New API:
```javascript
// New way
worker.postMessage({ 
  type: 'initialize', 
  data: { model: 'smollm2-1.7b' } 
});

worker.postMessage({ 
  type: 'generateChat', 
  data: { message: 'Hello' } 
});
```

#### Response Handling:
```javascript
// Old way
worker.addEventListener('message', (e) => {
  const { status, output } = e.data;
  if (status === 'token') {
    handleToken(output);
  }
});

// New way  
worker.addEventListener('message', (e) => {
  const { type, status, data } = e.data;
  if (type === 'generateChat' && status === 'streaming') {
    handleToken(data.token);
    handleFullText(data.fullText);
  }
});
```

## Examples

See the `examples/` directory for complete implementation examples:
- `chat-example.html` - Complete chat application
- `single-response-example.html` - Single response generator
- `multi-session-example.html` - Multiple conversation sessions
- `custom-model-example.html` - Using custom models

## Browser Compatibility

- Chrome 113+ (WebGPU support required)
- Edge 113+ (WebGPU support required)
- Firefox: Experimental WebGPU support
- Safari: Not yet supported

## Performance Tips

1. **Model Selection**: Use smaller models (360M) for faster loading and inference
2. **Session Management**: Clear unused sessions to free memory
3. **Generation Parameters**: Lower `max_new_tokens` for faster responses
4. **Caching**: The worker caches models and conversation history automatically

## Troubleshooting

### Common Issues

1. **WebGPU not supported**: Check browser compatibility and enable WebGPU flags if needed
2. **Model loading fails**: Check network connection and model availability
3. **Slow performance**: Try smaller models or adjust generation parameters
4. **Memory issues**: Clear sessions and reduce `max_new_tokens`

### Debug Mode

Enable debug logging:
```javascript
// Add to worker initialization
const modelConfig = {
  model: 'smollm2-1.7b',
  debug: true // This will enable detailed logging
};
```
