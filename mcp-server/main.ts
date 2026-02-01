import dotenv from "dotenv";
import { createHTTPServer } from "@leanmcp/core";

dotenv.config();

console.log("Starting vageshwar-twin-mcp MCP Server...");

// Auto-discover tools from src directory
await createHTTPServer({
  name: "vageshwar-twin-mcp",
  version: "1.0.0",
  port: 3001,
  cors: true,
  logging: true,
  autoDiscover: true,
  mcpDir: "./src"
});

console.log("vageshwar-twin-mcp MCP Server is running on port 3001");