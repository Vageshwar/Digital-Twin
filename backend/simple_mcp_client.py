import json
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
# Points to the deployed LeanMCP endpoint.  Override with env var for local dev.
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "https://vageshwar-twin.leanmcp.app/mcp")

# Monotonic counter so every JSON-RPC request gets a unique id.
_rpc_id = 0


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
async def run_mcp_tool(tool_name: str, arguments: dict) -> str:
    """
    Call a single tool on the LeanMCP server and return the result as a string.

    LeanMCP uses Streamable HTTP:
      - Single POST to /mcp
      - JSON-RPC 2.0 body
      - Response is either plain JSON or an SSE stream with one data: line
        containing the JSON-RPC response.

    Returns the tool's text output on success, or an error string on failure.
    """
    global _rpc_id
    _rpc_id += 1

    payload = {
        "jsonrpc": "2.0",
        "id": _rpc_id,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                MCP_SERVER_URL,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    # LeanMCP requires the client to advertise SSE support
                    "Accept": "application/json, text/event-stream",
                },
            )

            if response.status_code != 200:
                return f"MCP HTTP {response.status_code}: {response.text}"

            # -------------------------------------------------------------------
            # Parse response — could be plain JSON or SSE
            # -------------------------------------------------------------------
            content_type = response.headers.get("content-type", "")

            if "text/event-stream" in content_type:
                # SSE: find the "data: " line and parse it
                rpc = _parse_sse(response.text)
            else:
                rpc = response.json()

            # -------------------------------------------------------------------
            # Unwrap JSON-RPC → tool result
            # -------------------------------------------------------------------
            if "error" in rpc:
                error_msg = f"MCP error: {rpc['error'].get('message', rpc['error'])}"
                print(f"[MCP Client] Error: {error_msg}")
                return error_msg

            result = rpc.get("result", {})
            print(f"[MCP Client] Raw result type: {type(result)}")
            print(f"[MCP Client] Raw result: {json.dumps(result, indent=2) if not isinstance(result, str) else result[:200]}")

            # Handle different response formats:
            # 1. Plain string (new format from updated tools)
            if isinstance(result, str):
                print(f"[MCP Client] Returning plain string: {result[:100]}...")
                return result
            
            # 2. Object with 'content' array (old MCP format)
            content_blocks = result.get("content", [])
            if content_blocks and isinstance(content_blocks, list):
                # Grab the first text block
                for block in content_blocks:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block["text"]
                        print(f"[MCP Client] Returning from content block: {text[:100]}...")
                        return text
            
            # 3. Fallback: stringify whatever we got
            fallback = json.dumps(result)
            print(f"[MCP Client] Fallback stringify: {fallback[:100]}...")
            return fallback

    except Exception as e:
        error_msg = f"MCP tool execution failed: {str(e)}"
        print(f"[MCP Client] Exception: {error_msg}")
        import traceback
        traceback.print_exc()
        return error_msg


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _parse_sse(raw: str) -> dict:
    """
    Extract the JSON object from an SSE response body.
    SSE format:
        event: message
        data: {"jsonrpc":"2.0","id":1,"result":{...}}
    We just need the data: line.
    """
    for line in raw.split("\n"):
        if line.startswith("data: "):
            return json.loads(line[6:])
    raise ValueError("SSE response contained no data: line")