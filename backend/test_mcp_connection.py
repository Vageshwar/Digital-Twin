
import asyncio
from simple_mcp_client import run_mcp_tool

async def test():
    print("Testing MCP Connection...")
    # Test valid tool
    print("1. Testing github_search...")
    result = await run_mcp_tool("github_search", {"query": "auth"})
    print("Result:", result)
    
    # Test another valid tool
    print("\n2. Testing get_calendar_slots...")
    result_cal = await run_mcp_tool("get_calendar_slots", {"duration": 30})
    print("Result:", result_cal)

if __name__ == "__main__":
    asyncio.run(test())
