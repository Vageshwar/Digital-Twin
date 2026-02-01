/**
 * test.mjs — Manual test runner for the MCP server.
 *
 * Usage:
 *   node test.mjs            → runs all three tools
 *   node test.mjs github     → runs only github_search
 *   node test.mjs calendar   → runs only get_calendar_slots
 *   node test.mjs discord    → runs only send_discord_alert
 *
 * This spawns `node dist/index.js` as a child process, connects to it
 * over stdio using the official MCP SDK client, and calls tools against it.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ---------------------------------------------------------------------------
// Which tools to run
// ---------------------------------------------------------------------------
const filter = process.argv[2] || "all"; // "all" | "github" | "calendar" | "discord"

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------
const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
});

const client = new Client(
  { name: "test-client", version: "1.0.0" },
  { capabilities: {} }
);

await client.connect(transport);
console.log("✅ Connected to MCP server\n");

// ---------------------------------------------------------------------------
// 1. List tools (always run this first — confirms the server registered them)
// ---------------------------------------------------------------------------
const listResult = await client.listTools();

console.log("📋 Registered tools:");
for (const tool of listResult.tools) {
  console.log(`   • ${tool.name}`);
}
console.log("");

// ---------------------------------------------------------------------------
// Helper to call a tool and pretty-print the result
// ---------------------------------------------------------------------------
async function callTool(name, args) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔧 Calling: ${name}`);
  console.log(`   Args: ${JSON.stringify(args)}`);
  console.log("=".repeat(60));

  try {
    const result = await client.callTool({ name, arguments: args });

    if (result.isError) {
      console.log("❌ Tool returned an error:");
      for (const block of result.content) {
        if (block.type === "text") console.log(`   ${block.text}`);
      }
    } else {
      console.log("✅ Result:");
      for (const block of result.content) {
        if (block.type === "text") console.log(block.text);
      }
    }
  } catch (err) {
    console.log(`❌ Exception: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Run tools based on filter
// ---------------------------------------------------------------------------

if (filter === "all" || filter === "github") {
  await callTool("github_search", { query: "React" });
}

if (filter === "all" || filter === "calendar") {
  await callTool("get_calendar_slots", { duration: 30 });
}

if (filter === "all" || filter === "discord") {
  // Use a clearly fake/test payload so it's obvious in your Discord channel
  await callTool("send_discord_alert", {
    visitor_name: "Test User",
    company: "Test Company",
    message: "🧪 This is an automated test ping from test.mjs. Safe to ignore.",
  });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
await client.close();
console.log("\n✅ All tests done. Connection closed.");
