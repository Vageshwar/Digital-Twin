
import asyncio
import json
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

MCP_SERVER_URL = "http://localhost:3000"

async def run_mcp_tool(tool_name: str, arguments: dict):
    """
    Connects to the MCP HTTP Server, executes the tool, and returns the result.
    Uses SSE for receiving responses and POST for sending requests.
    """
    url_sse = f"{MCP_SERVER_URL}/sse"
    url_messages = f"{MCP_SERVER_URL}/messages"
    
    # JSON-RPC Request
    request_id = 1
    rpc_request = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        },
        "id": request_id
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. Start SSE Connection
            async with client.stream("GET", url_sse) as response:
                if response.status_code != 200:
                    return {"error": f"Failed to connect to MCP SSE: {response.status_code}"}

                # 2. Send Tool Call (once SSE is established)
                # We do this concurrently or just after connection?
                # The SSE stream blocks the code block.
                # We need to send the POST request while listening.
                
                # To handle this in a simple script without complex Tasks, 
                # we can send the POST request in a separate task, 
                # OR just assume the connection is good and send it (but we are in a context manager).
                
                # We need to read from stream until we get our response.
                
                # send the request payload
                post_task = asyncio.create_task(client.post(url_messages, json=rpc_request))
                
                # Read SSE stream
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    
                    if line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                            # Check if this is our response
                            if isinstance(data, dict) and data.get("id") == request_id:
                                # Found our response!
                                # Wait for post to finish just in case (it should use the same client pool or different?)
                                # httpx client is locked? No, AsyncClient handles concurrent.
                                await post_task 
                                
                                if "result" in data:
                                    return data["result"]
                                elif "error" in data:
                                    return {"error": data["error"]}
                                else:
                                    return data
                                    
                        except json.JSONDecodeError:
                            continue
                            
                    # Check timeout or break if too long?
                    # The httpx timeout applies to connection.
                    
    except Exception as e:
        return {"error": f"MCP Tool Execution Failed: {str(e)}"}

    return {"error": "No response received from MCP server"}
