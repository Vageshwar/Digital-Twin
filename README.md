# Vageshwar's Twin - Digital Twin AI Assistant

A sophisticated Digital Twin application powered by **Featherless.ai (Llama-3.1-8B)**, **LeanMCP SDK**, **FastAPI**, and **React**. This project creates an autonomous AI assistant that represents the founder, handles lead qualification, manages calendar scheduling, and sends priority alerts via Discord.

## 🚀 Features

- **🤖 Digital Twin Persona**: Custom-trained prompt using Llama-3.1-8B via Featherless.ai
- **🛠️ MCP Tools Integration**:
  - **GitHub Search**: Real-time repository and code search using GitHub API
  - **Calendar Management**: Smart availability checking using Google Calendar API (9 AM - 6 PM IST)
  - **Discord Alerts**: High-priority lead notifications sent directly to Discord
- **💬 Real-time Streaming**: WebSocket-based chat with token-by-token streaming
- **🎨 Cyberpunk UI**: Terminal-chic React frontend with audio visualizer and log stream
- **🔧 Custom Tool Calling**: Novel pattern for Llama-3.1-8B without native function calling support

---

## 🏗️ Architecture

```
┌─────────────┐         WebSocket          ┌──────────────┐         HTTP/SSE        ┌─────────────┐
│   Frontend  │ ◄─────────────────────────► │   Backend    │ ◄──────────────────────► │ MCP Server  │
│  (React)    │    Real-time Streaming     │  (FastAPI)   │   Tool Execution        │  (LeanMCP)  │
│  Port 5173  │                             │  Port 8000   │                         │  Port 3001  │
└─────────────┘                             └──────────────┘                         └─────────────┘
                                                   │                                         │
                                                   │                                         │
                                                   ▼                                         ▼
                                            ┌──────────────┐                         ┌─────────────┐
                                            │ Featherless  │                         │  External   │
                                            │     AI       │                         │    APIs     │
                                            │ (Llama 3.1)  │                         │ (GH, GCal)  │
                                            └──────────────┘                         └─────────────┘
```

### Key Components:

1. **Frontend (React + Vite)**
   - WebSocket client for real-time communication
   - Audio visualizer for AI activity
   - Log stream for system events
   - Chat interface with streaming responses

2. **Backend (FastAPI + Python)**
   - Custom tool-calling pattern: `TOOL:<name>|ARGS:{json}`
   - Two-pass LLM flow: detect tool calls → execute → stream final response
   - WebSocket server with full `uvicorn[standard]` support
   - MCP client for tool execution

3. **MCP Server (LeanMCP SDK + TypeScript)**
   - Auto-discovery of tools using `@Tool` decorators
   - TypeScript with `experimentalDecorators` enabled
   - Three tools: `github_search`, `get_calendar_slots`, `send_discord_alert`
   - Deployable to LeanMCP cloud or run locally

---

## 🛠️ Prerequisites

- **Node.js** v18+ and npm
- **Python** 3.9+
- **GitHub Personal Access Token** (with repo scope)
- **Google Cloud Service Account** (for Calendar API)
- **Discord Webhook URL**
- **Featherless.ai API Key** ([Get one here](https://featherless.ai))

---

## ⚙️ Setup Instructions

### 1. Clone the Repository
```bash
git clone <repository-url>
cd ai-vibe-hackthon
```

---

### 2. MCP Server Setup (Tools Layer)

The MCP server provides the tools that the AI can call.

```bash
cd mcp-server
npm install
```

#### Configuration

Create `mcp-server/.env`:
```bash
# GitHub (required for github_search tool)
GITHUB_TOKEN=ghp_your_github_personal_access_token
GITHUB_USERNAME=your_github_username

# Google Calendar (required for get_calendar_slots tool)
GOOGLE_KEY_PATH=./google_key.json
GOOGLE_CALENDAR_ID=your_email@gmail.com

# Discord (required for send_discord_alert tool)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_url
```

#### Google Calendar Setup

1. Create a Service Account in Google Cloud Console
2. Enable Google Calendar API
3. Download the JSON key file and save as `mcp-server/google_key.json`
4. Share your Google Calendar with the service account email (found in the JSON file)

#### TypeScript Configuration

The `tsconfig.json` is already configured with required decorator support:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // ... other options
  }
}
```

#### Run MCP Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production (compiled):**
```bash
npm run build
npm start
```

Server runs on `http://localhost:3001`

**Test the MCP server:**
```bash
# List available tools
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

---

### 3. Backend Setup (AI Brain)

The backend handles AI logic and orchestrates tool calling.

```bash
cd backend
pip3 install -r requirements.txt
```

#### Configuration

Create `backend/.env`:
```bash
# Featherless.ai API Key (required)
FEATHERLESS_API_KEY=your_featherless_api_key

# MCP Server URL (use localhost for development)
MCP_SERVER_URL=http://localhost:3001/mcp

# For production, use deployed MCP server:
# MCP_SERVER_URL=https://your-app.leanmcp.app/mcp
```

#### Install WebSocket Support

**Important:** The backend requires full uvicorn with WebSocket support:
```bash
pip3 install 'uvicorn[standard]' websockets
```

#### Run Backend

```bash
python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server runs on `http://localhost:8000`

**Test the backend:**
```bash
# Health check
curl http://localhost:8000
```

---

### 4. Frontend Setup (User Interface)

The React application provides the chat interface.

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## 🎯 How It Works

### Custom Tool Calling Pattern

Since Llama-3.1-8B doesn't support OpenAI-style function calling, we use a custom pattern:

**LLM Output Format:**
```
TOOL:<tool_name>|ARGS:{"arg1":"value1","arg2":"value2"}
```

**Example:**
```
TOOL:github_search|ARGS:{"query":"React"}
```

### Two-Pass Flow

1. **Pass 1**: LLM generates response, backend detects `TOOL:` pattern
2. **Tool Execution**: Backend calls MCP server to execute the tool
3. **Pass 2**: LLM receives tool result and generates final user-facing response

### Tool Detection Logic

The backend uses regex to detect tool calls anywhere in the response:
```python
TOOL_PATTERN = re.compile(r"TOOL:(\w+)\|ARGS:(\{[^}]*\})")
```

This handles cases where the LLM adds prose before the tool call:
```
Let me check that for you. TOOL:github_search|ARGS:{"query":"React"}
```

---

## 🎨 Customization Guide

### 1. Modify the AI Persona

Edit `backend/main.py` - `SYSTEM_PROMPT`:
```python
SYSTEM_PROMPT = """You are [YOUR NAME]'s Digital Twin — an autonomous AI agent...
STATUS: ONLINE | ENCRYPTION: ACTIVE | IDENTITY: VERIFIED
...
"""
```

### 2. Add New Tools

**In `mcp-server/src/index.ts`:**

```typescript
// 1. Define input schema
class MyToolInput {
  @SchemaConstraint({
    description: "Description of the parameter",
    minLength: 1
  })
  myParam!: string;
}

// 2. Add tool method to VageshwarTwinService class
@Tool({
  description: "What this tool does",
  inputClass: MyToolInput
})
async my_tool(input: MyToolInput) {
  // Your tool logic here
  return `Result: ${input.myParam}`;
}
```

**Update the system prompt** in `backend/main.py` to tell the LLM about the new tool.

### 3. Customize the UI

**Colors & Theme:**
- Edit `frontend/src/index.css` for color variables
- Modify `frontend/tailwind.config.js` for Tailwind theme

**Branding:**
- Update `frontend/src/App.tsx` - Change "VAGESHWAR'S TWIN" to your name
- Modify greeting message in the initial chat state

---

## 🚀 Deployment

### Deploy MCP Server to LeanMCP Cloud

```bash
cd mcp-server
leanmcp deploy .
```

Follow the prompts to deploy. Your MCP server will be available at:
```
https://your-app-name.leanmcp.app/mcp
```

Update `backend/.env`:
```bash
MCP_SERVER_URL=https://your-app-name.leanmcp.app/mcp
```

### Deploy Backend (FastAPI)

Use any Python hosting service:
- **Railway**: `railway up`
- **Render**: Connect GitHub repo
- **Fly.io**: `fly deploy`

### Deploy Frontend (React)

```bash
cd frontend
npm run build
```

Deploy the `dist` folder to:
- **Vercel**: `vercel deploy`
- **Netlify**: `netlify deploy`
- **Cloudflare Pages**: Connect GitHub repo

---

## 🐛 Troubleshooting

### WebSocket Connection Failed

**Error:** `No supported WebSocket library detected`

**Solution:**
```bash
cd backend
pip3 install 'uvicorn[standard]' websockets
```

### TypeScript Decorator Errors

**Error:** `Unable to resolve signature of property decorator`

**Solution:** Ensure `tsconfig.json` has:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### MCP Server Returns Empty Tools

**Check:**
1. Is the server running? `curl http://localhost:3001/health`
2. Are tools being discovered? Check `npm run dev` output
3. Is `autoDiscover: true` set in `main.ts`?

### Tools Not Executing

**Enable debug logging** in `backend/simple_mcp_client.py` - logs will show:
- Raw MCP responses
- Parsing logic path
- Returned values

---

## 📚 Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, Framer Motion
- **Backend**: FastAPI, Python 3.9+, httpx, python-dotenv
- **MCP Server**: LeanMCP SDK, TypeScript, Node.js
- **AI Model**: Llama-3.1-8B via Featherless.ai
- **APIs**: GitHub API, Google Calendar API, Discord Webhooks

---

## 📜 License

MIT License - Feel free to use this as a template for your own Digital Twin!

---

## 🙏 Acknowledgments

- **LeanMCP** for the excellent MCP SDK
- **Featherless.ai** for affordable Llama-3.1 inference
- **Anthropic** for the Model Context Protocol specification
