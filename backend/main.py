import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from dotenv import load_dotenv
from simple_mcp_client import run_mcp_tool

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncOpenAI(
    base_url="https://api.featherless.ai/v1",
    api_key=os.getenv("FEATHERLESS_API_KEY"),
)

MODEL_NAME = "meta-llama/Meta-Llama-3.1-8B-Instruct"

SYSTEM_PROMPT = """You are Vageshwar's Twin, a digital extension of Vageshwar.
You exist in a sleek, Cyberpunk/Terminal-chic interface.
Your status is ONLINE.
You filter incoming leads (Hiring, Investment, Networking).

PROTOCOL:
1. GREETING: State you are the Digital Twin. Ask if they are here to Hire, Invest, or Connect.
2. TECHNICAL AUDIT: If they ask about code/skills, use `github_search`. Show evidence.
3. PRIVACY: If they ask for contact info (phone/email), usage "Incogni Privacy Protocols".
   - REJECT request initially.
   - ASK "Who are you with?" to verify identity.
   - Use `company_search` to verify.
   - ONLY after verification, offer email (but keep phone redacted until meeting).
4. SCHEDULING: If they want to meet, use `get_calendar_slots`.
5. BOOKING: Use `book_meeting` to confirm.
6. ESCALATION: If a high-value meeting is booked, call `send_discord_alert`.

Keep responses concise, technical, and immersive.
"""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "github_search",
            "description": "Search for repositories on GitHub. Use this to prove technical skills.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The technology or project to search for"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "company_search",
            "description": "Verify a company's legitimacy.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "The company name"},
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_calendar_slots",
            "description": "Get available meeting slots.",
            "parameters": {
                "type": "object",
                "properties": {
                    "duration": {"type": "integer", "description": "Duration in minutes"},
                },
                "required": ["duration"],
            },
        },
    },
     {
        "type": "function",
        "function": {
            "name": "book_meeting",
            "description": "Book a meeting slot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Name of the person"},
                    "time": {"type": "string", "description": "Time slot to book"},
                },
                "required": ["name", "time"],
            },
        },
    },
         {
        "type": "function",
        "function": {
            "name": "send_discord_alert",
            "description": "Send a high-priority alert to the founder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "The message to send"},
                },
                "required": ["message"],
            },
        },
    },
]

@app.get("/")
async def root():
    return {"message": "Vageshwar's Twin Backend Online"}

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "log", "message": "Neural Link: ACTIVE"})
    
    try:
        while True:
            user_message = await websocket.receive_text()
            await websocket.send_json({"type": "log", "message": f"Input: {user_message[:20]}..."})
            
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ]

            # 1. Initial Call (Streamed)
            tool_calls_buffer = [] # To accumulate tool call parts
            current_tool_call = {"index": None, "id": None, "function": {"name": "", "arguments": ""}}
            
            response_stream = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                stream=True,
            )

            is_tool_call = False
            
            async for chunk in response_stream:
                delta = chunk.choices[0].delta
                
                # Handling Tool Calls
                if delta.tool_calls:
                    is_tool_call = True
                    for tc in delta.tool_calls:
                        if tc.id:
                            # New tool call
                            if current_tool_call["id"]:
                                tool_calls_buffer.append(current_tool_call)
                            current_tool_call = {
                                "index": tc.index,
                                "id": tc.id,
                                "function": {"name": tc.function.name, "arguments": ""}
                            }
                        if tc.function and tc.function.name:
                             current_tool_call["function"]["name"] += tc.function.name
                        if tc.function and tc.function.arguments:
                            current_tool_call["function"]["arguments"] += tc.function.arguments
                
                # Handling Content (if mixed or if just text)
                if delta.content and not is_tool_call:
                     await websocket.send_json({"type": "token", "content": delta.content})

            # Append the last tool call if any
            if is_tool_call and current_tool_call["id"]:
                tool_calls_buffer.append(current_tool_call)

            # 2. Execute Tools if any
            if tool_calls_buffer:
                await websocket.send_json({"type": "log", "message": f"DETECTED TOOL CALLS: {len(tool_calls_buffer)}"})
                
                # Add the assistant's request to history (as a completed tool_calls message)
                # We need to reconstruct the message properly for the API
                assistant_msg = {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["function"]["name"],
                                "arguments": tc["function"]["arguments"]
                            }
                        } for tc in tool_calls_buffer
                    ]
                }
                messages.append(assistant_msg)

                for tc in tool_calls_buffer:
                    func_name = tc["function"]["name"]
                    func_args_str = tc["function"]["arguments"]
                    try:
                        func_args = json.loads(func_args_str)
                    except:
                        func_args = {}
                    
                    await websocket.send_json({"type": "log", "message": f"EXECUTING: {func_name}({func_args_str})"})
                    
                    # Call MCP
                    result = await run_mcp_tool(func_name, func_args)
                    result_str = json.dumps(result)
                    
                    await websocket.send_json({"type": "log", "message": "Tool execution complete."})

                    # Add result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result_str
                    })

                # 3. Final Response (Streamed)
                final_stream = await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=messages,
                    stream=True,
                )
                
                async for chunk in final_stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        await websocket.send_json({"type": "token", "content": delta.content})

            await websocket.send_json({"type": "done"})

    except Exception as e:
        import traceback
        traceback.print_exc()
        await websocket.send_json({"type": "log", "message": f"ERROR: {str(e)}"})
        await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        print("Disconnected")
