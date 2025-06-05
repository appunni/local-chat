import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "@huggingface/transformers";

import type {
  ModelConfig,
  GenerationConfig,
  Message,
  ProgressData,
  StreamData,
  TokenStats,
  SessionInfo,
  SessionData,
  WebGPUSupport,
  ChatGenerationOptions,
  SingleGenerationOptions,
  ModelInitializationOptions,
  ChatGenerationResult,
  SingleGenerationResult,
  InternalGenerationResult,
  WorkerMessageType,
  WorkerMessage,
  WorkerEventData,
} from "./types";

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
 * - Full TypeScript support with comprehensive type safety
 * 
 * Usage:
 * - Initialize with model configuration
 * - Use in chat mode for conversations or single mode for one-off responses
 * - Supports streaming responses with real-time token generation
 */

// Extend Navigator interface for WebGPU support
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<any>;
    };
  }
}

// Default model configurations
const DEFAULT_MODELS: Record<string, ModelConfig> = {
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
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  do_sample: true,
  temperature: 0.7,
  top_p: 0.9,
  max_new_tokens: 1024,
  repetition_penalty: 1.1
};

// Default system message for chat mode
const DEFAULT_SYSTEM_MESSAGE: Message = {
  role: "system",
  content: "You are a helpful AI assistant. Provide clear, concise, and accurate responses."
};

/**
 * WebGPU feature detection
 */
async function checkWebGPUSupport(): Promise<WebGPUSupport> {
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
    return { 
      supported: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Singleton class for managing model loading and inference
 */
class GenericLLMPipeline {
  public tokenizer: any = null;
  public model: any = null;
  public modelInfo: ModelConfig | null = null;
  private config: GenerationConfig | null = null;
  private sessionHistory = new Map<string, SessionData>();
  private currentStoppingCriteria: any = null;

  /**
   * Initialize the pipeline with a model configuration
   */
  async initialize(
    modelConfig: ModelInitializationOptions, 
    progressCallback?: (progress: ProgressData) => void
  ): Promise<{ tokenizer: any; model: any }> {
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

    const wrappedCallback = (progress: any) => {
      if (progressCallback && progress?.file?.includes('.onnx')) {
        const loaded = progress.loaded || 0;
        const total = this.modelInfo!.size;
        const percentage = Math.min((loaded / total) * 100, 100);
        
        progressCallback({
          status: progress.status,
          loaded,
          total,
          percentage: Math.round(percentage),
          modelName: this.modelInfo!.id.split('/').pop() || '',
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
        dtype: (this.modelInfo.dtype || "q4f16") as any,
        device: (this.modelInfo.device || "webgpu") as any,
        progress_callback: wrappedCallback,
      });
    }

    return { tokenizer: this.tokenizer, model: this.model };
  }

  /**
   * Create or get a conversation session
   */
  getSession(sessionId = 'default', systemMessage?: string): SessionData {
    if (!this.sessionHistory.has(sessionId)) {
      const initialMessage = systemMessage 
        ? { role: "system" as const, content: systemMessage }
        : DEFAULT_SYSTEM_MESSAGE;
      
      this.sessionHistory.set(sessionId, {
        messages: [initialMessage],
        pastKeyValues: null,
        createdAt: Date.now()
      });
    }
    return this.sessionHistory.get(sessionId)!;
  }

  /**
   * Clear a conversation session
   */
  clearSession(sessionId = 'default'): void {
    if (this.sessionHistory.has(sessionId)) {
      this.sessionHistory.delete(sessionId);
    }
  }

  /**
   * Generate text in chat mode (maintains conversation history)
   */
  async generateChat(options: ChatGenerationOptions): Promise<ChatGenerationResult> {
    const {
      message,
      sessionId = 'default',
      systemMessage,
      streamCallback,
      tokenCallback,
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
      { ...this.config!, ...generationConfig },
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
  async generateSingle(options: SingleGenerationOptions): Promise<SingleGenerationResult> {
    const {
      prompt,
      systemMessage,
      streamCallback,
      tokenCallback,
      generationConfig = {}
    } = options;

    if (!this.model || !this.tokenizer) {
      throw new Error("Model not initialized. Call initialize() first.");
    }

    // Create temporary message array
    const messages: Message[] = [];
    if (systemMessage) {
      messages.push({ role: "system", content: systemMessage });
    }
    messages.push({ role: "user", content: prompt });

    // Generate response without caching
    const response = await this._generate(
      messages,
      null, // No cached key values for single mode
      { ...this.config!, ...generationConfig },
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
  private async _generate(
    messages: Message[], 
    pastKeyValues: any, 
    config: GenerationConfig, 
    streamCallback?: (data: StreamData) => void, 
    tokenCallback?: (data: TokenStats) => void
  ): Promise<InternalGenerationResult> {
    const inputs = this.tokenizer.apply_chat_template(messages, {
      add_generation_prompt: true,
      return_dict: true,
    });

    let startTime: number | undefined;
    let numTokens = 0;
    let generatedText = '';

    const tokenCallbackFunction = () => {
      startTime ??= performance.now();
      if (numTokens++ > 0 && tokenCallback) {
        const tps = (numTokens / (performance.now() - startTime!)) * 1000;
        tokenCallback({ tokensPerSecond: tps, tokenCount: numTokens });
      }
    };

    const streamCallbackFunction = (output: string) => {
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
  interrupt(): void {
    if (this.currentStoppingCriteria) {
      this.currentStoppingCriteria.interrupt();
    }
  }

  /**
   * Get available models
   */
  static getAvailableModels(): Record<string, ModelConfig> {
    return DEFAULT_MODELS;
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId = 'default'): SessionInfo | null {
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

// Message handlers with proper typing
const messageHandlers: Partial<Record<WorkerMessageType, (data?: any) => Promise<void>>> = {
  /**
   * Check WebGPU support
   */
  async check(): Promise<void> {
    try {
      const support = await checkWebGPUSupport();
      if (support.supported) {
        self.postMessage({
          type: 'check',
          status: 'success',
          data: { webgpuSupported: true }
        } as WorkerMessage);
      } else {
        throw new Error(support.error);
      }
    } catch (error) {
      self.postMessage({
        type: 'check',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Initialize the model
   */
  async initialize(config: ModelInitializationOptions): Promise<void> {
    try {
      self.postMessage({
        type: 'initialize',
        status: 'loading',
        data: { message: 'Initializing model...' }
      } as WorkerMessage);

      const progressCallback = (progress: ProgressData) => {
        self.postMessage({
          type: 'initialize',
          status: 'progress',
          data: progress
        } as WorkerMessage);
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
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'initialize',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Generate text in chat mode
   */
  async generateChat(options: ChatGenerationOptions): Promise<void> {
    try {
      self.postMessage({
        type: 'generateChat',
        status: 'start',
        data: { sessionId: options.sessionId || 'default' }
      } as WorkerMessage);

      const streamCallback = (data: StreamData) => {
        self.postMessage({
          type: 'generateChat',
          status: 'streaming',
          data
        } as WorkerMessage);
      };

      const tokenCallback = (data: TokenStats) => {
        self.postMessage({
          type: 'generateChat',
          status: 'token_stats',
          data
        } as WorkerMessage);
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
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'generateChat',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Generate text in single mode
   */
  async generateSingle(options: SingleGenerationOptions): Promise<void> {
    try {
      self.postMessage({
        type: 'generateSingle',
        status: 'start',
        data: {}
      } as WorkerMessage);

      const streamCallback = (data: StreamData) => {
        self.postMessage({
          type: 'generateSingle',
          status: 'streaming',
          data
        } as WorkerMessage);
      };

      const tokenCallback = (data: TokenStats) => {
        self.postMessage({
          type: 'generateSingle',
          status: 'token_stats',
          data
        } as WorkerMessage);
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
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'generateSingle',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Interrupt current generation
   */
  async interrupt(): Promise<void> {
    try {
      pipeline.interrupt();
      self.postMessage({
        type: 'interrupt',
        status: 'success',
        data: { message: 'Generation interrupted' }
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'interrupt',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Clear session
   */
  async clearSession(options: { sessionId?: string } = {}): Promise<void> {
    try {
      const sessionId = options.sessionId || 'default';
      pipeline.clearSession(sessionId);
      self.postMessage({
        type: 'clearSession',
        status: 'success',
        data: { sessionId, message: 'Session cleared' }
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'clearSession',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Get session info
   */
  async getSessionInfo(options: { sessionId?: string } = {}): Promise<void> {
    try {
      const sessionId = options.sessionId || 'default';
      const info = pipeline.getSessionInfo(sessionId);
      self.postMessage({
        type: 'getSessionInfo',
        status: 'success',
        data: { sessionId, info }
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'getSessionInfo',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  },

  /**
   * Get available models
   */
  async getModels(): Promise<void> {
    try {
      const models = GenericLLMPipeline.getAvailableModels();
      self.postMessage({
        type: 'getModels',
        status: 'success',
        data: { models }
      } as WorkerMessage);
    } catch (error) {
      self.postMessage({
        type: 'getModels',
        status: 'error',
        data: { error: error instanceof Error ? error.message : String(error) }
      } as WorkerMessage);
    }
  }
};

// Listen for messages from the main thread
self.addEventListener("message", async (event: MessageEvent<WorkerEventData>) => {
  const { type, data = {} } = event.data;

  if (messageHandlers[type]) {
    await messageHandlers[type]!(data);
  } else {
    self.postMessage({
      type: 'error',
      status: 'error',
      data: { error: `Unknown message type: ${type}` }
    } as WorkerMessage);
  }
});

// Export for potential module usage
export { GenericLLMPipeline, DEFAULT_MODELS, DEFAULT_GENERATION_CONFIG };
