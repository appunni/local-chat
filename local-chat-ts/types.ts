/**
 * Type definitions for Generic LLM Worker
 */

// Message types for chat conversations
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Model configuration interface
export interface ModelConfig {
  id: string;
  dtype: string;
  device: string;
  size: number;
  description: string;
}

// Generation configuration interface
export interface GenerationConfig {
  do_sample?: boolean;
  temperature?: number;
  top_p?: number;
  max_new_tokens?: number;
  repetition_penalty?: number;
}

// Progress data for model loading
export interface ProgressData {
  status: string;
  loaded: number;
  total: number;
  percentage: number;
  modelName: string;
  file: string;
}

// Streaming data for real-time responses
export interface StreamData {
  token: string;
  fullText: string;
  tokenCount: number;
}

// Token statistics
export interface TokenStats {
  tokensPerSecond: number;
  tokenCount: number;
}

// Session information
export interface SessionInfo {
  messageCount: number;
  createdAt: number;
  hasPastKeyValues: boolean;
}

// Session data structure
export interface SessionData {
  messages: Message[];
  pastKeyValues: any;
  createdAt: number;
}

// WebGPU support check result
export interface WebGPUSupport {
  supported: boolean;
  adapter?: any;
  error?: string;
}

// Chat generation options
export interface ChatGenerationOptions {
  message: string;
  sessionId?: string;
  systemMessage?: string;
  streamCallback?: (data: StreamData) => void;
  tokenCallback?: (data: TokenStats) => void;
  generationConfig?: GenerationConfig;
}

// Single generation options
export interface SingleGenerationOptions {
  prompt: string;
  systemMessage?: string;
  streamCallback?: (data: StreamData) => void;
  tokenCallback?: (data: TokenStats) => void;
  generationConfig?: GenerationConfig;
}

// Model initialization options
export interface ModelInitializationOptions {
  model: string | ModelConfig;
  [key: string]: any;
}

// Generation result interfaces
export interface ChatGenerationResult {
  text: string;
  sessionId: string;
  messageCount: number;
  tokensPerSecond: number;
}

export interface SingleGenerationResult {
  text: string;
  tokensPerSecond: number;
}

// Internal generation result
export interface InternalGenerationResult {
  text: string;
  pastKeyValues: any;
  tokensPerSecond: number;
}

// Worker message types
export type WorkerMessageType = 
  | 'check'
  | 'initialize'
  | 'generateChat'
  | 'generateSingle'
  | 'interrupt'
  | 'clearSession'
  | 'getSessionInfo'
  | 'getModels'
  | 'error';

// Worker message status
export type WorkerMessageStatus = 
  | 'success'
  | 'error'
  | 'loading'
  | 'progress'
  | 'ready'
  | 'start'
  | 'streaming'
  | 'token_stats'
  | 'complete';

// Worker message structure
export interface WorkerMessage {
  type: WorkerMessageType;
  status: WorkerMessageStatus;
  data: any;
}

// Worker event data
export interface WorkerEventData {
  type: WorkerMessageType;
  data?: any;
}
