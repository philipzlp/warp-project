# Headcount and Runway Planner

Note: This README shows setup directions and an overview of my project. See @Design Notes.txt for my design decisions. 

## Getting Started

### Prerequisites

- **Node.js** (v16 or higher) and **npm** installed on your system
- (Optional) **Ollama** for AI features (see AI Insights section below)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/philipzlp/warp-project
   cd warp-project
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the application:**

   **Run both frontend and backend together:**
   ```bash
   npm run dev:all
   ```

4. **Open in browser:**
   - Frontend: http://localhost:5173 (or the port shown in terminal)
   - Backend API: http://localhost:3000

### Quick Start (Without AI Features)

The app works without Ollama! You can:
- Create and customize headcount plans
- View burn rate calculations and runway visualizations
- Export scenarios to PDF
- Share scenarios via URL

AI features (insights and predictions) require Ollama setup (see below).

## Features

- Drag-and-drop interface to plan hiring scenarios
- Real-time burn rate calculations
- Cash runway visualization
- AI-powered insights using Ollama (local LLM)
- Export scenarios to PDF
- Shareable scenario URLs

## AI Insights (Ollama)

This app can generate AI-written **summary**, **risks**, and **suggestions** for headcount planning scenarios using Ollama (a local LLM).

### Setup (Optional - for AI Features)

1. **Install Ollama:**
   - Download from https://ollama.ai
   - Install and start Ollama (it runs automatically after installation)

2. **Pull a model:**
   ```bash
   ollama pull llama3.2
   ```
   (You can use any model: `llama3.2`, `mistral`, `phi3`, etc.)

3. **Ensure backend server is running:**
   - The backend server must be running for AI features to work
   - Use `npm run dev:server` or `npm run dev:all`

### How to use AI Features

1. Ensure Ollama is installed and running (`ollama serve`)
2. Ensure the backend server is running (`npm run dev:server`)
3. Open the app in your browser
4. Click **Generate Insights** in the UI (utility mode) or **Predict Outcome** (viral mode)

### Architecture

- **Frontend:** React + Vite (default port: 5173)
- **Backend:** Express server (`server.js`) running on port 3000
- **Proxy:** Vite automatically proxies `/api/*` requests to the backend
- **AI:** Ollama local LLM (default: `llama3.2`, runs on port 11434)

### Configuration

You can customize the Ollama setup via environment variables:

```bash
# In your .env file or environment
OLLAMA_URL=http://localhost:11434  # Default Ollama URL
OLLAMA_MODEL=llama3.2               # Model to use
PORT=3000                            # Backend server port
```

### Notes

- The backend server must be running for AI insights to work
- Ollama must be installed and running (`ollama serve`)
- The model must be pulled before use (`ollama pull <model-name>`)
- All AI processing happens locally - no API keys or external services needed!
- The app works without Ollama - you just won't have AI features

### Troubleshooting

**Port already in use:**
- If port 3000 is taken, set `PORT=3001 npm run dev:server` (or another port)
- If port 5173 is taken, Vite will automatically use the next available port

**AI features not working:**
- Ensure Ollama is running: `ollama serve`
- Ensure backend server is running: `npm run dev:server`
- Check that you've pulled a model: `ollama pull llama3.2`
- Check browser console for errors

**Dependencies issues:**
- Delete `node_modules` and `package-lock.json`, then run `npm install` again

## Viral Mode - Take Off or Crash Prediction

In **Viral Mode**, you can get an AI-powered prediction on whether your startup will "take off" or "crash":

### How to Use

1. **Switch to Viral Mode**: Click the "🚀 Viral Mode" button in the top right

2. **Enter Company Summary**: 
   - Type a brief description of your company (max 100 characters)
   - Example: "AI-powered SaaS platform for small businesses"
   - The character counter will show you how many characters you've used

3. **Set Up Your Financial Plan**:
   - Enter your starting cash amount
   - Add hires and expenses using the drag-and-drop interface
   - Configure your projection period (6-60 months)

4. **Get Prediction**: 
   - Click the "🔮 Predict Outcome" button
   - The AI will analyze your company summary and financial situation
   - You'll receive:
     - **Prediction**: TAKE OFF 🚀 or CRASH 💥
     - **Confidence Level**: HIGH, MEDIUM, or LOW
     - **Reasoning**: A brief explanation of the prediction

### Requirements

- Backend server must be running (`npm run dev:server`)
- Ollama must be installed and running (`ollama serve`)
- Model must be pulled (`ollama pull llama3.2`)

The prediction feature uses the same Ollama setup as the AI insights feature.
