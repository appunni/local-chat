import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/+esm";

/**
 * Generic LLM Worker - A reusable web worker for running language models in the browser
 * 
 * Features:
 * - Model-agnostic: Configure any HuggingFace model
 * - Multiple modes: Chat conversations or single responses
 * - Configurable generation parameters
 * - Progress tracking with detailed reporting
 * - Session management for conversation history
 * - Robust error handling and recovery
 * 
 * Usage:
 * - Initialize with model configuration
 * - Use in chat mode for conversations or single mode for one-off responses
 * - Supports streaming responses with real-time token generation
 */

// Default model configurations
const DEFAULT_MODELS = {
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
};

// Default generation parameters
const DEFAULT_GENERATION_CONFIG = {
  do_sample: true,
  temperature: 0.7,
  top_p: 0.9,
  max_new_tokens: 1024,
  repetition_penalty: 1.1
};

// Default system message for chat mode
const DEFAULT_SYSTEM_MESSAGE = {
  role: "system",
  content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
};

/**
 * WebGPU feature detection
 */
async function checkWebGPUSupport() {
  try {
    if (!navigator.gpu) {
      throw new Error("WebGPU is not supported in this browser");
    }
    
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU is not supported (no adapter found)");
    }
    
    return { supported: true, adapter };
  } catch (error) {
    return { supported: false, error: error.message };
  }
}

/**
 * Singleton class for managing model loading and inference
 */
class GenericLLMPipeline {
  constructor() {
    this.tokenizer = null;
    this.model = null;
    this.config = null;
    this.sessionHistory = new Map(); // Store multiple conversation sessions
    this.currentSessionId = null;
  }

  /**
   * Initialize the pipeline with a model configuration
   */
  async initialize(modelConfig, progressCallback = null) {
    this.config = {
      ...DEFAULT_GENERATION_CONFIG,
      ...modelConfig
    };

    // Resolve model configuration
    if (typeof modelConfig.model === 'string' && DEFAULT_MODELS[modelConfig.model]) {
      this.modelInfo = DEFAULT_MODELS[modelConfig.model];
    } else if (modelConfig.model && typeof modelConfig.model === 'object') {
      this.modelInfo = modelConfig.model;
    } else {
      throw new Error("Invalid model configuration");
    }

    const wrappedCallback = (progress) => {
      if (progressCallback && progress?.file?.includes('.onnx')) {
        const loaded = progress.loaded || 0;
        const total = this.modelInfo.size;
        const percentage = Math.min((loaded / total) * 100, 100);
        
        progressCallback({
          status: progress.status,
          loaded,
          total,
          percentage: Math.round(percentage),
          modelName: this.modelInfo.id.split('/').pop(),
          file: progress.file
        });
      }
    };

    // Load tokenizer
    if (!this.tokenizer) {
      this.tokenizer = await AutoTokenizer.from_pretrained(this.modelInfo.id);
    }

    // Load model
    if (!this.model) {
      this.model = await AutoModelForCausalLM.from_pretrained(this.modelInfo.id, {
        dtype: this.modelInfo.dtype || "q4f16",
        device: this.modelInfo.device || "webgpu",
        progress_callback: wrappedCallback,
      });
    }

    return { tokenizer: this.tokenizer, model: this.model };
  }

  /**
   * Create or get a conversation session
   */
  getSession(sessionId = 'default', systemMessage = null) {
    if (!this.sessionHistory.has(sessionId)) {
      const initialMessage = systemMessage || DEFAULT_SYSTEM_MESSAGE;
      this.sessionHistory.set(sessionId, {
        messages: [initialMessage],
        pastKeyValues: null,
        createdAt: Date.now()
      });
    }
    return this.sessionHistory.get(sessionId);
  }

  /**
   * Clear a conversation session
   */
  clearSession(sessionId = 'default') {
    if (this.sessionHistory.has(sessionId)) {
      this.sessionHistory.delete(sessionId);
    }
  }

  /**
   * Generate text in chat mode (maintains conversation history)
   */
  async generateChat(options = {}) {
    const {
      message,
      sessionId = 'default',
      systemMessage = null,
      streamCallback = null,
      tokenCallback = null,
      generationConfig = {}
    } = options;

    if (!this.model || !this.tokenizer) {
      throw new Error("Model not initialized. Call initialize() first.");
    }

    // Get or create session
    const session = this.getSession(sessionId, systemMessage);
    
    // Add user message to session
    session.messages.push({ role: "user", content: message });

    // Generate response
    const response = await this._generate(
      session.messages,
      session.pastKeyValues,
      { ...this.config, ...generationConfig },
      streamCallback,
      tokenCallback
    );

    // Add assistant response to session and update cache
    session.messages.push({ role: "assistant", content: response.text });
    session.pastKeyValues = response.pastKeyValues;

    return {
      text: response.text,
      sessionId,
      messageCount: session.messages.length,
      tokensPerSecond: response.tokensPerSecond
    };
  }

  /**
   * Generate text in single mode (no conversation history)
   */
  async generateSingle(options = {}) {
    const {
      prompt,
      systemMessage = null,
      streamCallback = null,
      tokenCallback = null,
      generationConfig = {}
    } = options;

    if (!this.model || !this.tokenizer) {
      throw new Error("Model not initialized. Call initialize() first.");
    }

    // Create temporary message array
    const messages = [];
    if (systemMessage) {
      messages.push({ role: "system", content: systemMessage });
    }
    messages.push({ role: "user", content: prompt });

    // Generate response without caching
    const response = await this._generate(
      messages,
      null, // No cached key values for single mode
      { ...this.config, ...generationConfig },
      streamCallback,
      tokenCallback
    );

    return {
      text: response.text,
      tokensPerSecond: response.tokensPerSecond
    };
  }

  /**
   * Internal method to handle text generation
   */
  async _generate(messages, pastKeyValues, config, streamCallback, tokenCallback) {
    const inputs = this.tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    });

    let startTime;
    let numTokens = 0;
    let generatedText = '';

    const tokenCallbackFunction = () => {
      startTime ??= performance.now();
      if (numTokens++ > 0 && tokenCallback) {
        const tps = (numTokens / (performance.now() - startTime)) * 1000;
        tokenCallback({ tokensPerSecond: tps, tokenCount: numTokens });
      }
    };

    const streamCallbackFunction = (output) => {
      generatedText += output;
      if (streamCallback) {
        streamCallback({ 
          token: output, 
          fullText: generatedText,
          tokenCount: numTokens 
        });
      }
    };

    const streamer = new TextStreamer(this.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: streamCallbackFunction,
      token_callback_function: tokenCallbackFunction,
    });

    const stoppingCriteria = new InterruptableStoppingCriteria();
    this.currentStoppingCriteria = stoppingCriteria;

    const result = await this.model.generate({
      ...inputs,
      past_key_values: pastKeyValues,
      ...config,
      streamer,
      stopping_criteria: stoppingCriteria,
      return_dict_in_generate: true,
    });

    // Clean up the final output
    const decoded = this.tokenizer.batch_decode(result.sequences, {
      skip_special_tokens: true,
    });
    
    const finalText = decoded[0].split('assistant\n').pop()?.trim() || generatedText;
    const finalTps = startTime ? (numTokens / (performance.now() - startTime)) * 1000 : 0;

    return {
      text: finalText,
      pastKeyValues: result.past_key_values,
      tokensPerSecond: finalTps
    };
  }

  /**
   * Interrupt current generation
   */
  interrupt() {
    if (this.currentStoppingCriteria) {
      this.currentStoppingCriteria.interrupt();
    }
  }

  /**
   * Get available models
   */
  static getAvailableModels() {
    return DEFAULT_MODELS;
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId = 'default') {
    const session = this.sessionHistory.get(sessionId);
    if (!session) return null;
    
    return {
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      hasPastKeyValues: !!session.pastKeyValues
    };
  }
}

// Global pipeline instance
const pipeline = new GenericLLMPipeline();

// Message handlers
const messageHandlers = {
  /**
   * Check WebGPU support
   */
  async check() {
    try {
      const support = await checkWebGPUSupport();
      if (support.supported) {
        self.postMessage({
          type: 'check',
          status: 'success',
          data: { webgpuSupported: true }
        });
      } else {
        throw new Error(support.error);
      }
    } catch (error) {
      self.postMessage({
        type: 'check',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Initialize the model
   */
  async initialize(config) {
    try {
      self.postMessage({
        type: 'initialize',
        status: 'loading',
        data: { message: 'Initializing model...' }
      });

      const progressCallback = (progress) => {
        self.postMessage({
          type: 'initialize',
          status: 'progress',
          data: progress
        });
      };

      await pipeline.initialize(config, progressCallback);

      // Warm up the model
      const inputs = pipeline.tokenizer("Hello");
      await pipeline.model.generate({ ...inputs, max_new_tokens: 1 });

      self.postMessage({
        type: 'initialize',
        status: 'ready',
        data: { 
          message: 'Model ready for inference',
          modelInfo: pipeline.modelInfo
        }
      });
    } catch (error) {
      self.postMessage({
        type: 'initialize',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Generate text in chat mode
   */
  async generateChat(options) {
    try {
      self.postMessage({
        type: 'generateChat',
        status: 'start',
        data: { sessionId: options.sessionId || 'default' }
      });

      const streamCallback = (data) => {
        self.postMessage({
          type: 'generateChat',
          status: 'streaming',
          data
        });
      };

      const tokenCallback = (data) => {
        self.postMessage({
          type: 'generateChat',
          status: 'token_stats',
          data
        });
      };

      const result = await pipeline.generateChat({
        ...options,
        streamCallback,
        tokenCallback
      });

      self.postMessage({
        type: 'generateChat',
        status: 'complete',
        data: result
      });
    } catch (error) {
      self.postMessage({
        type: 'generateChat',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Generate text in single mode
   */
  async generateSingle(options) {
    try {
      self.postMessage({
        type: 'generateSingle',
        status: 'start',
        data: {}
      });

      const streamCallback = (data) => {
        self.postMessage({
          type: 'generateSingle',
          status: 'streaming',
          data
        });
      };

      const tokenCallback = (data) => {
        self.postMessage({
          type: 'generateSingle',
          status: 'token_stats',
          data
        });
      };

      const result = await pipeline.generateSingle({
        ...options,
        streamCallback,
        tokenCallback
      });

      self.postMessage({
        type: 'generateSingle',
        status: 'complete',
        data: result
      });
    } catch (error) {
      self.postMessage({
        type: 'generateSingle',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Interrupt current generation
   */
  async interrupt() {
    try {
      pipeline.interrupt();
      self.postMessage({
        type: 'interrupt',
        status: 'success',
        data: { message: 'Generation interrupted' }
      });
    } catch (error) {
      self.postMessage({
        type: 'interrupt',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Clear session
   */
  async clearSession(options = {}) {
    try {
      const sessionId = options.sessionId || 'default';
      pipeline.clearSession(sessionId);
      self.postMessage({
        type: 'clearSession',
        status: 'success',
        data: { sessionId, message: 'Session cleared' }
      });
    } catch (error) {
      self.postMessage({
        type: 'clearSession',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Get session info
   */
  async getSessionInfo(options = {}) {
    try {
      const sessionId = options.sessionId || 'default';
      const info = pipeline.getSessionInfo(sessionId);
      self.postMessage({
        type: 'getSessionInfo',
        status: 'success',
        data: { sessionId, info }
      });
    } catch (error) {
      self.postMessage({
        type: 'getSessionInfo',
        status: 'error',
        data: { error: error.message }
      });
    }
  },

  /**
   * Get available models
   */
  async getModels() {
    try {
      const models = GenericLLMPipeline.getAvailableModels();
      self.postMessage({
        type: 'getModels',
        status: 'success',
        data: { models }
      });
    } catch (error) {
      self.postMessage({
        type: 'getModels',
        status: 'error',
        data: { error: error.message }
      });
    }
  }
};

// Listen for messages from the main thread
self.addEventListener("message", async (event) => {
  const { type, data = {} } = event.data;

  if (messageHandlers[type]) {
    await messageHandlers[type](data);
  } else {
    self.postMessage({
      type: 'error',
      status: 'error',
      data: { error: `Unknown message type: ${type}` }
    });
  }
});

// Export for potential module usage
export { GenericLLMPipeline, DEFAULT_MODELS, DEFAULT_GENERATION_CONFIG };
