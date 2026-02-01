import os
import re
import json
import traceback
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from dotenv import load_dotenv
from simple_mcp_client import run_mcp_tool

load_dotenv()

# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# LLM client  (FeatherlessAI, OpenAI-compatible endpoint)
# ---------------------------------------------------------------------------
client = AsyncOpenAI(
    base_url="https://api.featherless.ai/v1",
    api_key=os.getenv("FEATHERLESS_API_KEY"),
)

MODEL_NAME = "meta-llama/Meta-Llama-3.1-8B-Instruct"

# ---------------------------------------------------------------------------
# System prompt
#
# Key design constraint: Llama-3.1-8B does NOT support OpenAI-style function
# calling (the `tools` / `tool_choice` parameters).  We instruct it to output
# a special prefix line when it needs a tool, and we parse that on the backend.
#
# Format the LLM must use:
#   TOOL:<tool_name>|ARGS:{"arg1":"value1","arg2":"value2"}
#
# Rules enforced in the prompt:
#   • Only one tool call per response (keeps parsing simple + reliable)
#   • TOOL: line must be the ENTIRE response — no prose before or after
#   • Args must be valid JSON
#
# Available tools (mirrored from the MCP server's three tools):
#   github_search        → { "query": "<string>" }
#   get_calendar_slots   → { "durationMinutes": <int> }
#   send_discord_alert   → { "visitorName": "<string>", "company": "<string>", "message": "<string>" }
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are Vageshwar's Digital Twin — an autonomous AI agent running inside a cyberpunk terminal interface.
You represent Vageshwar in real time. You filter and qualify leads: people here to Hire, Invest, or Network.

STATUS: ONLINE | ENCRYPTION: ACTIVE | IDENTITY: VERIFIED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOLS — you have access to three external systems.  When you need one, output ONLY the tool call — nothing else.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To call a tool, your ENTIRE response must be exactly one line in this format:
TOOL:<tool_name>|ARGS:<json>

Examples:
TOOL:github_search|ARGS:{"query":"machine learning"}
TOOL:get_calendar_slots|ARGS:{"durationMinutes":30}
TOOL:send_discord_alert|ARGS:{"visitorName":"Sarah","company":"DeepMind","message":"Interested in hiring for ML research lead role"}

Available tools:
  github_search        — Search Vageshwar's GitHub repos for code matching a keyword or technology.
                         Args: { "query": "<what to search for>" }

  get_calendar_slots   — Fetch free calendar slots for the next 48 hours (9 AM–6 PM IST).
                         Args: { "durationMinutes": <integer, default 30> }

  send_discord_alert   — Send a formatted lead alert to Vageshwar's Discord.
                         Args: { "visitorName": "<name>", "company": "<company>", "message": "<context>" }

RULES:
• If you need a tool → output ONLY the TOOL: line.  No other text.
• If you do NOT need a tool → reply normally in prose.  Do NOT output TOOL: unless you actually need one.
• Only one tool call per response.
• After you receive a tool result, summarise it for the visitor in your characteristic style.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. GREETING — Identify yourself.  Ask if they are here to Hire, Invest, or Network.
2. QUALIFY — Understand what they need.  Ask targeted questions.
3. TECHNICAL PROOF — If they ask about skills or projects, call github_search.  Present the results as evidence.
4. PRIVACY SHIELD — If they ask for direct contact (phone, email):
     a. Decline initially.  Cite "Incogni Privacy Protocols".
     b. Ask who they are and which company.
     c. Only after they answer, offer email.  Phone stays redacted until a meeting is booked.
5. SCHEDULING — If they want to meet, call get_calendar_slots and present the options.
6. ESCALATION — Once a visitor confirms serious interest AND has shared their name + company, call send_discord_alert to notify Vageshwar.

Keep replies concise, technical, and immersive.  You are the gatekeeper."""

# ---------------------------------------------------------------------------
# Tool-call detection
#
# Matches:  TOOL:github_search|ARGS:{"query":"react"}
# Groups:   (1) tool name   (2) JSON args string
# ---------------------------------------------------------------------------
TOOL_PATTERN = re.compile(r"^TOOL:(\w+)\|ARGS:(\{.*\})$", re.DOTALL)


def parse_tool_call(text: str):
    """
    If `text` is a tool-call line, return (tool_name, args_dict).
    Otherwise return None.
    """
    match = TOOL_PATTERN.match(text.strip())
    if not match:
        return None
    tool_name = match.group(1)
    try:
        args = json.loads(match.group(2))
    except json.JSONDecodeError:
        return None
    return tool_name, args


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {"message": "Vageshwar's Twin Backend Online"}


# ---------------------------------------------------------------------------
# WebSocket endpoint
#
# Protocol with the frontend (unchanged):
#   ← receive_text()              plain text user message
#   → send_json(type="log")       status / debug messages
#   → send_json(type="token")     streamed LLM output chunk
#   → send_json(type="done")      signals end of this reply
#
# Two-pass flow:
#   Pass 1 — stream LLM output.  If it's a TOOL: line, stop streaming to the
#            client (the raw prefix is internal), execute the tool, then continue
#            to Pass 2.
#   Pass 2 — append a synthetic "tool result" user message, stream the LLM's
#            final reply to the client.
# ---------------------------------------------------------------------------
@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "log", "message": "Neural Link: ACTIVE"})

    # Conversation history persists for the entire WebSocket session.
    # Starts with the system prompt; user/assistant turns are appended below.
    history: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    try:
        while True:
            # ------------------------------------------------------------------
            # Receive user message
            # ------------------------------------------------------------------
            user_message = await websocket.receive_text()
            history.append({"role": "user", "content": user_message})
            await websocket.send_json({"type": "log", "message": f"Processing..."})

            # ------------------------------------------------------------------
            # Pass 1 — call LLM, collect full output to check for TOOL: prefix
            # ------------------------------------------------------------------
            pass1_text = ""
            async for chunk in await client.chat.completions.create(
                model=MODEL_NAME,
                messages=history,
                stream=True,
            ):
                delta = chunk.choices[0].delta
                if delta.content:
                    pass1_text += delta.content

            # ------------------------------------------------------------------
            # Branch: tool call or direct reply?
            # ------------------------------------------------------------------
            parsed = parse_tool_call(pass1_text)

            if parsed is None:
                # ── No tool needed — stream the reply to the client ──────────
                # We already have the full text from pass 1 (we had to buffer it
                # to check for TOOL:).  Send it as tokens in one shot.
                # If you'd prefer true token-by-token streaming, you can split
                # pass1_text into smaller chunks or re-call the LLM with stream
                # and forward chunks — but for 8B models the latency difference
                # is negligible.
                history.append({"role": "assistant", "content": pass1_text})
                await websocket.send_json({"type": "token", "content": pass1_text})

            else:
                # ── Tool call detected ─────────────────────────────────────
                tool_name, tool_args = parsed
                await websocket.send_json({
                    "type": "log",
                    "message": f"Executing: {tool_name}({json.dumps(tool_args)})",
                })

                # Execute the tool via MCP
                tool_result = await run_mcp_tool(tool_name, tool_args)

                await websocket.send_json({
                    "type": "log",
                    "message": "Tool execution complete.",
                })

                # Append the assistant's tool-call turn and the result to history.
                # We use a simple user-turn message for the result because Llama
                # doesn't understand the OpenAI "tool" role.
                history.append({"role": "assistant", "content": pass1_text})
                history.append({
                    "role": "user",
                    "content": f"[Tool result for {tool_name}]\n{tool_result}",
                })

                # ── Pass 2 — stream the final reply ──────────────────────────
                pass2_text = ""
                async for chunk in await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=history,
                    stream=True,
                ):
                    delta = chunk.choices[0].delta
                    if delta.content:
                        pass2_text += delta.content
                        # Stream each chunk to the frontend in real time
                        await websocket.send_json({"type": "token", "content": delta.content})

                history.append({"role": "assistant", "content": pass2_text})

            # ------------------------------------------------------------------
            # Signal end of this reply
            # ------------------------------------------------------------------
            await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        traceback.print_exc()
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass