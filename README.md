# Local Chat

A demo project showcasing how to use transformers.js to run Large Language Models directly in the browser. This implementation demonstrates key features of transformers.js by running the SmolLM2-1.7B-Instruct model locally with WebGPU acceleration. The project serves as a practical example of building browser-based LLM applications with features like real-time response streaming, generation interruption, and progress tracking.

Built with HTML, JavaScript, and Tailwind CSS, this privacy-focused chat application processes everything locally on your device. The project demonstrates efficient browser-based LLM integration using Web Workers for non-blocking operations. Created by 'vibe coding' with assistance from GitHub Copilot and Cline.

## Demo
Try out the live demo at [https://appunni.github.io/local-chat/](https://appunni.github.io/local-chat/)

## Project Structure
- `index.html`: Main HTML file containing the chat interface
- `main.js`: Core application logic handling UI interactions
- `worker.js`: Web Worker implementation for model operations

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

3. Open [http://localhost:8000](http://localhost:8000) in your WebGPU-enabled browser (Chrome 113+).
