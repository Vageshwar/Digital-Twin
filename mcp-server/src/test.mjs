/**
 * test.mjs — Manual test runner for the LeanMCP HTTP server.
 *
 * Prerequisites:
 *   1. Have a .env file in this directory with your tokens/keys
 *   2. In one terminal:   npm install && npm run dev
 *   3. In another:        node test.mjs [filter]
 *
 * Usage:
 *   node test.mjs            → runs tools/list, then all three tools
 *   node test.mjs github     → runs only github_search
 *   node test.mjs calendar   → runs only get_calendar_slots
 *   node test.mjs discord    → runs only send_discord_alert
 *   node test.mjs list       → runs only tools/list
 */

const BASE = "http://localhost:3001/mcp";
const filter = process.argv[2] || "all";

// ---------------------------------------------------------------------------
// Core: POST to /mcp and return parsed JSON
// ---------------------------------------------------------------------------
let _id = 0;
async function mcp(method, params = {}) {
  const body = { jsonrpc: "2.0", id: ++_id, method, params };
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // SSE response: extract JSON from the "data:" line
  if (contentType.includes("text/event-stream")) {
    const raw = await res.text();
    const dataLine = raw.split("\n").find((line) => line.startsWith("data: "));
    if (!dataLine) throw new Error("SSE response had no data: line");
    return JSON.parse(dataLine.slice(6)); // strip "data: " prefix
  }

  // Plain JSON response
  return res.json();
}

// ---------------------------------------------------------------------------
// Pretty-print a tool result
// ---------------------------------------------------------------------------
function printResult(result) {
  // JSON-RPC error
  if (result.error) {
    console.log("❌ Error:", result.error.message);
    return;
  }

  // Unwrap JSON-RPC envelope → the actual tool result is in result.result
  const inner = result.result || result;

  // Shape A: { content: [{ type: "text", text: "..." }] }  (MCP standard)
  if (inner.content && Array.isArray(inner.content)) {
    console.log("✅ Result:");
    for (const block of inner.content) {
      if (block.type === "text") console.log(block.text);
    }
    return;
  }

  // Shape B: bare string (if LeanMCP passes it through directly)
  if (typeof inner === "string") {
    console.log("✅ Result:");
    console.log(inner);
    return;
  }

  // Fallback: dump whatever we got so we can see the actual shape
  console.log("✅ Raw result:");
  console.log(JSON.stringify(inner, null, 2));
}

// ---------------------------------------------------------------------------
// Wrapper: call a tool, print inputs + output
// ---------------------------------------------------------------------------
async function callTool(name, args) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔧 Calling: ${name}`);
  console.log(`   Args: ${JSON.stringify(args)}`);
  console.log("=".repeat(60));

  try {
    const result = await mcp("tools/call", { name, arguments: args });
    printResult(result);
  } catch (err) {
    console.log(`❌ Exception: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. tools/list — always run unless a specific tool was requested
// ---------------------------------------------------------------------------
if (filter === "all" || filter === "list") {
  console.log("\n📋 Fetching registered tools...");
  try {
    const { tools } = await mcp("tools/list");
    console.log("   Registered tools:");
    for (const tool of tools) {
      console.log(`     • ${tool.name} — ${tool.description}`);
    }
  } catch (err) {
    console.log(`❌ tools/list failed: ${err.message}`);
    console.log("   Is the server running? (npm run dev)");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 2. Run tools based on filter
// ---------------------------------------------------------------------------
if (filter === "all" || filter === "github") {
  await callTool("github_search", { query: "React" });
}

if (filter === "all" || filter === "calendar") {
  await callTool("get_calendar_slots", { durationMinutes: 30 });
}

if (filter === "all" || filter === "discord") {
  await callTool("send_discord_alert", {
    visitorName: "Test User",
    company: "Test Company",
    message: "🧪 Automated test ping from test.mjs. Safe to ignore.",
  });
}

console.log("\n✅ Done.");
