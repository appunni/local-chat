import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.0/+esm";

/**
 * Helper function to perform feature detection for WebGPU
 */
async function check() {
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("WebGPU is not supported (no adapter found)");
    }
  } catch (e) {
    self.postMessage({
      status: "error",
      data: e.toString(),
    });
  }
}

/**
 * This class uses the Singleton pattern to enable lazy-loading of the pipeline
 */
class TextGenerationPipeline {
  static model_id = "HuggingFaceTB/SmolLM2-1.7B-Instruct";

  static async getInstance(progress_callback = null) {
    this.tokenizer ??= AutoTokenizer.from_pretrained(this.model_id, {
      progress_callback,
    });

    this.model ??= AutoModelForCausalLM.from_pretrained(this.model_id, {
      dtype: "q4f16",
      device: "webgpu",
      progress_callback,
    });

    return Promise.all([this.tokenizer, this.model]);
  }
}

const stopping_criteria = new InterruptableStoppingCriteria();

let past_key_values_cache = null;
async function generate(messages) {
  // Retrieve the text-generation pipeline.
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();

  const inputs = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    return_dict: true,
  });

  let startTime;
  let numTokens = 0;
  let tps;

  const token_callback_function = () => {
    startTime ??= performance.now();
    if (numTokens++ > 0) {
      tps = (numTokens / (performance.now() - startTime)) * 1000;
    }
  };

  const callback_function = (output) => {
    // Only log tokens for debugging
    console.log('Token generated:', output);
  };

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function,
    token_callback_function,
  });

  // Tell the main thread we are starting
  self.postMessage({ status: "start" });

  const { past_key_values, sequences } = await model.generate({
    ...inputs,
    past_key_values: past_key_values_cache,
    do_sample: true,
    temperature: 0.7,
    top_p: 0.9,
    max_new_tokens: 1024,
    streamer,
    stopping_criteria,
    return_dict_in_generate: true,
  });
  past_key_values_cache = past_key_values;

  const decoded = tokenizer.batch_decode(sequences, {
    skip_special_tokens: true,
  });

  // Clean up the final output to get just the assistant's response
  const finalOutput = decoded[0].split('assistant\n').pop()?.trim() || decoded[0];

  // Send the complete output
  self.postMessage({
    status: "complete",
    output: finalOutput,
  });
}

// Track loading start time and phases
let loadStartTime = 0;
const TOTAL_MODEL_SIZE = 1.7 * 1024 * 1024 * 1024; // 1.7GB in bytes

function calculateTimeRemaining(loaded, total, elapsedMs) {
  const bytesPerMs = loaded / elapsedMs;
  const remainingBytes = total - loaded;
  const remainingMs = remainingBytes / bytesPerMs;
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  return remainingMinutes;
}

function formatBytes(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Byte';
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

async function load() {
  loadStartTime = performance.now();
  
  // Phase 1: Initialization
  self.postMessage({
    status: "loading",
    phase: "initialization",
    data: "Initializing model loading...",
    progress: 0,
    totalSize: formatBytes(TOTAL_MODEL_SIZE)
  });

  // Load the pipeline and save it for future use.
  const [tokenizer, model] = await TextGenerationPipeline.getInstance((progress) => {
    const elapsedMs = performance.now() - loadStartTime;
    
    // Handle progress updates with safety checks
    if (progress?.status === "progress" && progress?.data) {
      try {
        // Safely access data with fallbacks
        const loaded = progress.data?.loaded ?? 0;
        const total = progress.data?.total ?? TOTAL_MODEL_SIZE;
        const percent = Math.round((loaded / total) * 100);
        const remainingMinutes = loaded > 0 ? calculateTimeRemaining(loaded, total, elapsedMs) : null;
        
        self.postMessage({
          status: "progress",
          phase: "downloading",
          data: "Downloading model weights...",
          loaded: formatBytes(loaded),
          total: formatBytes(total),
          progress: percent,
          timeRemaining: remainingMinutes,
          elapsedTime: Math.round(elapsedMs / 1000)
        });
      } catch (error) {
        console.error('Error processing progress data:', error);
        // Send a basic progress update on error
        self.postMessage({
          status: "progress",
          phase: "downloading",
          data: "Downloading model weights...",
          progress: 0
        });
      }
    }
  });

  // Phase 2: Compilation
  self.postMessage({
    status: "loading",
    phase: "compilation",
    data: "Compiling shaders...",
    progress: 0
  });

  // Run model with dummy input to compile shaders
  const inputs = tokenizer("a");
  
  // Phase 3: Warm-up
  self.postMessage({
    status: "loading",
    phase: "warmup",
    data: "Warming up model...",
    progress: 50
  });
  
  await model.generate({ ...inputs, max_new_tokens: 1 });
  
  // Completion
  const totalTime = Math.round((performance.now() - loadStartTime) / 1000);
  self.postMessage({ 
    status: "ready",
    totalLoadTime: totalTime,
    message: `Model loaded successfully in ${totalTime} seconds`
  });
}

// Listen for messages from the main thread
self.addEventListener("message", async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case "check":
      check();
      break;

    case "load":
      load();
      break;

    case "generate":
      stopping_criteria.reset();
      generate(data);
      break;

    case "interrupt":
      stopping_criteria.interrupt();
      break;

    case "reset":
      past_key_values_cache = null;
      stopping_criteria.reset();
      break;
  }
});
