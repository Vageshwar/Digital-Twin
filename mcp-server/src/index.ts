import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolResult,
  Tool,
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

// ---------------------------------------------------------------------------
// Load .env relative to THIS file's location, not process.cwd().
// After tsc compiles, this file lives at dist/index.js.
// .env sits one level up at the project root, so we go ../
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenvConfig({ path: resolve(__dirname, "..", ".env") });

import { githubSearch } from "./tools/github.js";
import { getCalendarSlots } from "./tools/calendar.js";
import { sendDiscordAlert } from "./tools/discord.js";

// ---------------------------------------------------------------------------
// Tool definitions (schema that the MCP client sees)
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  {
    name: "github_search",
    description:
      "Search Vageshwar's GitHub repositories and codebase for a given technology, library, or concept. " +
      "Returns matching repository names, file paths, and code snippets as proof of experience. " +
      "Use this whenever someone asks about technical skills, projects, or coding experience.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The technology, library, framework, or concept to search for. " +
            'Examples: "Next.js authentication", "React hooks", "PostgreSQL", "AWS Lambda".',
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_calendar_slots",
    description:
      "Check Vageshwar's Google Calendar and return available meeting time slots. " +
      "Looks at the next 48 hours and filters to working hours (9 AM – 6 PM IST). " +
      "Use this when someone asks about availability or wants to schedule a meeting.",
    inputSchema: {
      type: "object",
      properties: {
        duration: {
          type: "number",
          description: "Desired meeting duration in minutes. Common values: 15, 30, 60.",
        },
      },
      required: ["duration"],
    },
  },
  {
    name: "send_discord_alert",
    description:
      "Send a high-priority notification to Vageshwar's Discord channel. " +
      "Triggers automatically when a high-value event is detected — such as a recruiter expressing serious interest, " +
      "a meeting being discussed, or an investor making an inquiry. " +
      "Use this to escalate important leads so Vageshwar is notified in real time.",
    inputSchema: {
      type: "object",
      properties: {
        visitor_name: {
          type: "string",
          description: "Name of the visitor or recruiter.",
        },
        company: {
          type: "string",
          description: "Company or organization the visitor is from.",
        },
        message: {
          type: "string",
          description:
            "A short summary of what happened in the conversation — e.g. 'Visitor expressed interest in scheduling a technical screen.'",
        },
      },
      required: ["visitor_name", "company", "message"],
    },
  },
];

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "vageshwar-twin-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ---------------------------------------------------------------------------
// Tool listing handler
// ---------------------------------------------------------------------------

server.setRequestHandler(
  ListToolsRequestSchema,
  async () => {
    return { tools: TOOLS };
  }
);

// ---------------------------------------------------------------------------
// Tool call handler — routes to the correct function
// ---------------------------------------------------------------------------

server.setRequestHandler(
  CallToolRequestSchema,
  async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;

    console.log(`[MCP] Tool called: ${name}`, { args });

    switch (name) {
      // -----------------------------------------------------------
      // GitHub search
      // -----------------------------------------------------------
      case "github_search": {
        const query = args?.query as string;
        if (!query) {
          return {
            content: [{ type: "text", text: "ERROR: 'query' argument is required." }],
            isError: true,
          };
        }
        return await githubSearch(query);
      }

      // -----------------------------------------------------------
      // Calendar slots
      // -----------------------------------------------------------
      case "get_calendar_slots": {
        const duration = args?.duration as number;
        if (!duration || duration <= 0) {
          return {
            content: [{ type: "text", text: "ERROR: 'duration' argument must be a positive number (minutes)." }],
            isError: true,
          };
        }
        return await getCalendarSlots(duration);
      }

      // -----------------------------------------------------------
      // Discord alert
      // -----------------------------------------------------------
      case "send_discord_alert": {
        const visitorName = (args?.visitor_name as string) || "Unknown";
        const company = (args?.company as string) || "Unknown";
        const message = (args?.message as string) || "";
        return await sendDiscordAlert(visitorName, company, message);
      }

      // -----------------------------------------------------------
      // Unknown tool
      // -----------------------------------------------------------
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }
);

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("[MCP] Vageshwar Twin MCP Server running on stdio.");
}

main().catch((err) => {
  console.error("[MCP] Failed to start:", err);
  process.exit(1);
});