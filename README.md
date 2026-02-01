# Vageshwar's Twin (FounderOS)

A Digital Twin application powered by **Featherless.ai**, **LeanMCP**, **FastAPI**, and **React**. This project creates an AI assistant that mimics the founder's persona, manages calendar slots, verifies companies, and sends priority alerts via Discord.

## 🚀 Features

- **Digital Twin Persona**: Uses Featherless.ai (Llama 3.1 8B) to mimic the founder.
- **MCP Tools**:
  - **GitHub Search**: Real-time repository search using Octokit.
  - **Calendar Management**: Checks availability using Google Calendar API.
  - **Company Verification**: Mock/Real verification logic.
  - **Discord Alerts**: Sends high-priority messages to the founder's phone.
- **Interactive UI**: Cyberpunk/Terminal-chic React frontend with an Audio Visualizer.

---

## 🛠️ Prerequisites

- **Node.js** (v18+)
- **Python** (v3.9+)
- **Google Cloud Service Account** (for Calendar)
- **GitHub Personal Access Token**
- **Discord Webhook URL**
- **Featherless.ai API Key**

---

## ⚙️ Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ai-vibe-hackthon
```

### 2. Backend Setup (Brain)
The backend handles the AI logic and communicates with the MCP server.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Configuration (`backend/.env`):**
Create a `.env` file in the `backend` folder:
```ini
# Get this from https://featherless.ai
FEATHERLESS_API_KEY=your_featherless_api_key_here
```

**Run Backend:**
```bash
uvicorn main:app --reload --port 8000
```

### 3. MCP Server Setup (Tools)
The MCP server executes real-world actions (GitHub, Calendar, Discord).

```bash
cd mcp-server
npm install
```

**Configuration (`mcp-server/.env`):**
Create a `.env` file in the `mcp-server` folder:
```ini
# GitHub Personal Access Token (Repo scope)
GITHUB_TOKEN=your_github_token

# Discord Webhook URL (Channel Settings > Integrations > Webhooks)
DISCORD_WEBHOOK=your_discord_webhook_url

# Path to your Google Service Account JSON (relative to mcp-server root)
GOOGLE_KEY_PATH=google_key.json
```

**Google Calendar Setup:**
1.  Place your Service Account JSON file in `mcp-server/google_key.json`.
2.  Share your Google Calendar with the Service Account email address.

**Run MCP Server:**
```bash
npm run build
npm start
```
*Server runs on port 3000.*

### 4. Frontend Setup (Interface)
The React application for interacting with the Twin.

```bash
cd frontend
npm install
npm run dev
```
*Access via http://localhost:5173*

---

## 🎨 Customizing Your Twin

To make this *your* twin, modify the following:

### 1. The Persona (System Prompt)
Edit `backend/main.py`:
```python
SYSTEM_PROMPT = """You are [YOUR NAME], [YOUR TITLE].
You exist in a sleek, Cyberpunk interface.
Current Objective: [YOUR GOAL].
Style: [YOUR SPEAKING STYLE]."""
```

### 2. Branding (Frontend)
Edit `frontend/src/App.tsx` and `frontend/src/components/Chat.tsx`:
- Change **"VAGESHWAR'S TWIN"** to **"[YOUR_NAME]'S TWIN"**.
- Update colors in `frontend/tailwind.config.js` or `index.css`.

### 3. Tools (MCP Server)
Edit `mcp-server/src/index.ts` to change logic or add new tools.
- **Calendar**: The current logic lists events for "today". You can customize the time range.
- **Company Search**: Currently has a demo override for "TechFlow". Remove it for pure real-world usage.

---

## 🔗 Architecture

- **Frontend**: React + Vite (Port 5173) -> WebSockets -> **Backend**
- **Backend**: FastAPI (Port 8000) -> HTTP/SSE -> **MCP Server**
- **MCP Server**: Hono + LeanMCP (Port 3000) -> **External APIs**

## 📜 License
MIT
