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
    const wrappedCallback = (progress) => {
      console.log('Raw progress data:', progress);
      
      // Only report .onnx file loading progress
      if (progress?.file?.includes('model_q4f16.onnx')) {
        const modelName = TextGenerationPipeline.model_id.split('/').pop();
        // Only send progress for actual loading updates
        if (progress.status === 'progress') {
          const loaded = progress.loaded || 0;
          self.postMessage({
            status: 'progress',
            loaded,
            modelName
          });
        } else if (progress.status === 'done') {
          self.postMessage({
            status: 'progress_complete',
            modelName
          });
        }
      }
    };

    if (!this.tokenizer) {
      console.log('Loading tokenizer...');
      this.tokenizer = await AutoTokenizer.from_pretrained(this.model_id);
    }

    if (!this.model) {
      const modelName = this.model_id.split('/').pop();
      self.postMessage({
        status: 'loading',
        modelName,
        data: `Loading ${modelName}...`
      });
      
      this.model = await AutoModelForCausalLM.from_pretrained(this.model_id, {
        dtype: "q4f16",
        device: "webgpu",
        progress_callback: wrappedCallback,
      });
    }

    return [this.tokenizer, this.model];
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

async function load() {
  self.postMessage({
    status: "loading",
    data: "Initializing model loading...",
  });

  // Load the pipeline and save it for future use
  const [tokenizer, model] = await TextGenerationPipeline.getInstance();

  // Warm up the model
  const inputs = tokenizer("a");
  await model.generate({ ...inputs, max_new_tokens: 1 });

  self.postMessage({ 
    status: "ready"
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
