# Local Chat

A browser-based chat application that runs a local LLM (Large Language Model) directly in your browser using WebGPU acceleration. Built with transformers.js, this application downloads and runs the SmolLM2-1.7B-Instruct model locally, ensuring privacy as all chat interactions happen entirely in your browser without any server communication.

## Key Features
- 🚀 Runs entirely in the browser - no server required
- 🔒 Complete privacy - all processing happens locally
- ⚡ WebGPU acceleration for fast inference
- 📝 Streaming responses for real-time interaction
- ⏹️ Ability to interrupt ongoing generations
- 📊 Progress tracking for model loading
- 💻 Clean, responsive UI with Tailwind CSS

## Live Demo
Try out the live demo at [https://appunni.github.io/local-chat/](https://appunni.github.io/local-chat/)

## Technical Architecture
- **Frontend**: HTML + JavaScript + Tailwind CSS
- **Model**: HuggingFaceTB/SmolLM2-1.7B-Instruct via transformers.js
- **Processing**: Web Workers for non-blocking model operations
- **Acceleration**: WebGPU for hardware-accelerated inference

## Prerequisites
- A modern browser with WebGPU support (e.g., Chrome 113+)
- Sufficient RAM for model loading (approximately 2GB)
- A GPU for hardware acceleration (recommended)

## Project Structure
- `index.html`: Main HTML file containing the chat interface and Tailwind CSS integration
- `main.js`: Core application logic handling UI interactions and Web Worker communication
- `worker.js`: Web Worker implementation for model operations and text generation

## Implementation Details

### Model Integration
The application uses transformers.js to load and run the SmolLM2-1.7B-Instruct model:
- Implements lazy loading using a Singleton pattern
- Uses quantization (q4f16) for efficient memory usage
- Utilizes WebGPU for hardware acceleration
- Maintains a key-values cache for efficient conversation history processing

### Chat Features
- **Streaming Responses**: Real-time token generation display
- **Interrupt Capability**: Can stop generation mid-stream
- **Progress Tracking**: Visual feedback during model loading
- **Chat History**: Maintains conversation context for coherent responses
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS

### Performance Optimizations
- Web Worker implementation for non-blocking UI
- WebGPU acceleration for model inference
- Key-values caching for faster responses
- Token streaming for immediate feedback
- Model quantization for reduced memory usage

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/appunni/local-chat.git
   cd local-chat
   ```

2. Start a local server (e.g., using Python):
   ```bash
   python3 -m http.server
   ```

3. Open [http://localhost:8000](http://localhost:8000) in your WebGPU-enabled browser.

## Usage Guide
1. When first opened, the application will download and load the model (progress is displayed)
2. Once loaded, the chat interface becomes active
3. Type your message and press Send or hit Enter
4. The model will stream its response in real-time
5. You can click the Stop button to interrupt generation at any time

## Technical Considerations
- The model is downloaded on first use (approximately 800MB)
- Initial loading time depends on internet speed and system capabilities
- WebGPU support is required for hardware acceleration
- Performance may vary based on GPU capabilities

## Browser Compatibility
- Chrome 113+ with WebGPU enabled
- Other browsers: Check WebGPU support status at [WebGPU Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)

## Privacy Note
All processing happens locally in your browser. The application only connects to the internet to:
1. Download the model files (first use only)
2. Load required JavaScript libraries (transformers.js and Tailwind CSS)

## Acknowledgments
This project was created by 'vibe coding' with the assistance of:
- GitHub Copilot - AI pair programming assistant
- Cline - AI development assistant
