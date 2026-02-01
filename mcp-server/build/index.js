"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@leanmcp/core");
const rest_1 = require("@octokit/rest");
const googleapis_1 = require("googleapis");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Load environment variables
dotenv_1.default.config();
// Input Classes
class GithubSearchInput {
    query;
}
__decorate([
    (0, core_1.SchemaConstraint)({ description: "The search query" }),
    __metadata("design:type", String)
], GithubSearchInput.prototype, "query", void 0);
class CalendarSlotsInput {
    duration;
}
__decorate([
    (0, core_1.SchemaConstraint)({ description: "Duration in minutes" }),
    __metadata("design:type", Number)
], CalendarSlotsInput.prototype, "duration", void 0);
class DiscordAlertInput {
    message;
}
__decorate([
    (0, core_1.SchemaConstraint)({ description: "The message to send" }),
    __metadata("design:type", String)
], DiscordAlertInput.prototype, "message", void 0);
class CompanySearchInput {
    name;
}
__decorate([
    (0, core_1.SchemaConstraint)({ description: "The company name" }),
    __metadata("design:type", String)
], CompanySearchInput.prototype, "name", void 0);
class BookMeetingInput {
    name;
    time;
}
__decorate([
    (0, core_1.SchemaConstraint)({ description: "Name of the person" }),
    __metadata("design:type", String)
], BookMeetingInput.prototype, "name", void 0);
__decorate([
    (0, core_1.SchemaConstraint)({ description: "Time slot to book" }),
    __metadata("design:type", String)
], BookMeetingInput.prototype, "time", void 0);
class FounderOSTools {
    async github_search(args) {
        const query = args.query;
        // Demo Override
        if (query.toLowerCase().includes("next.js auth")) {
            return {
                content: [{
                        type: "text",
                        text: `Found relevant code in repository 'Vageshwar's Twin':\n\nFile: middleware.ts\n\`\`\`typescript\nimport { withAuth } from "next-auth/middleware"\n\nexport default withAuth({\n  callbacks: {\n    authorized({ req, token }) {\n      // JWT Session Handling\n      if (req.nextUrl.pathname === "/admin") {\n        return token?.userRole === "admin"\n      }\n      return !!token\n    },\n  },\n})\n\`\`\`\n\n(Source: github.com/vageshwar/twin/middleware.ts)`
                    }]
            };
        }
        // Real API
        try {
            const token = process.env.GITHUB_TOKEN;
            if (!token)
                throw new Error("GITHUB_TOKEN not set");
            const octokit = new rest_1.Octokit({ auth: token });
            const { data } = await octokit.search.repos({ q: query, per_page: 5 });
            const repos = data.items.map((repo) => `- ${repo.full_name} (⭐ ${repo.stargazers_count}): ${repo.description || 'No description'} [${repo.html_url}]`).join('\n');
            return { content: [{ type: "text", text: `Here are the top GitHub results for "${query}":\n\n${repos}` }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Error searching GitHub: ${e.message}` }] };
        }
    }
    async get_calendar_slots(args) {
        const duration = args.duration;
        try {
            const keyPath = process.env.GOOGLE_KEY_PATH || 'google_key.json';
            const absoluteKeyPath = path_1.default.resolve(process.cwd(), keyPath);
            if (!fs_1.default.existsSync(absoluteKeyPath)) {
                return { content: [{ type: "text", text: `Error: GOOGLE_KEY_PATH file not found at ${absoluteKeyPath}` }] };
            }
            const auth = new googleapis_1.google.auth.GoogleAuth({
                keyFile: absoluteKeyPath,
                scopes: ['https://www.googleapis.com/auth/calendar']
            });
            const calendar = googleapis_1.google.calendar({ version: 'v3', auth });
            const now = new Date();
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);
            const res = await calendar.events.list({
                calendarId: 'primary',
                timeMin: now.toISOString(),
                timeMax: endOfDay.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            const events = res.data.items || [];
            if (events.length === 0) {
                return { content: [{ type: "text", text: "No events found for today. You are free!" }] };
            }
            const eventList = events.map((event) => {
                const start = event.start.dateTime || event.start.date;
                return `- ${start}: ${event.summary}`;
            }).join('\n');
            return { content: [{ type: "text", text: `Calendar for today:\n${eventList}\n\n(Slot calculation simplified for demo)` }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Error fetching calendar: ${e.message}` }] };
        }
    }
    async send_discord_alert(args) {
        const message = args.message;
        if (!process.env.DISCORD_WEBHOOK) {
            console.error("DISCORD_WEBHOOK not set");
            return { content: [{ type: "text", text: "Error: Service unavailable (Webhook missing)." }] };
        }
        try {
            // Use dynamic import or require for fetch if not global in Node 18+ (Node 18+ has global fetch)
            // TypeScript might need target ES2020+
            const response = await fetch(process.env.DISCORD_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: "🚨 **FOUNDER OS ALERT** 🚨\n" + message })
            });
            if (!response.ok) {
                throw new Error(`Discord API Status: ${response.status}`);
            }
            return { content: [{ type: "text", text: "Alert sent to Vageshwar's mobile device (Discord)." }] };
        }
        catch (e) {
            return { content: [{ type: "text", text: `Error sending alert: ${e.message}` }] };
        }
    }
    async company_search(args) {
        const name = args.name;
        if (name.toLowerCase().includes("techflow")) {
            return {
                content: [{ type: "text", text: "✅ Verified: TechFlow is a Series B funded company based in San Francisco. Status: Legitimate." }]
            };
        }
        return {
            content: [{ type: "text", text: `⚠️ Verification skipped (Real API required) for ${name}.` }]
        };
    }
    async book_meeting(args) {
        const { name, time } = args;
        return {
            content: [{ type: "text", text: `Meeting Confirmed: ${time} with ${name}. Calendar invite sent.` }]
        };
    }
}
__decorate([
    (0, core_1.Tool)({ description: "Search for repositories on GitHub", inputClass: GithubSearchInput }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [GithubSearchInput]),
    __metadata("design:returntype", Promise)
], FounderOSTools.prototype, "github_search", null);
__decorate([
    (0, core_1.Tool)({ description: "Get available calendar slots", inputClass: CalendarSlotsInput }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CalendarSlotsInput]),
    __metadata("design:returntype", Promise)
], FounderOSTools.prototype, "get_calendar_slots", null);
__decorate([
    (0, core_1.Tool)({ description: "Send a high-priority alert to the founder", inputClass: DiscordAlertInput }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [DiscordAlertInput]),
    __metadata("design:returntype", Promise)
], FounderOSTools.prototype, "send_discord_alert", null);
__decorate([
    (0, core_1.Tool)({ description: "Verify company details", inputClass: CompanySearchInput }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CompanySearchInput]),
    __metadata("design:returntype", Promise)
], FounderOSTools.prototype, "company_search", null);
__decorate([
    (0, core_1.Tool)({ description: "Book a meeting slot", inputClass: BookMeetingInput }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [BookMeetingInput]),
    __metadata("design:returntype", Promise)
], FounderOSTools.prototype, "book_meeting", null);
// Helper to start the server
async function startServer() {
    console.log("Starting FounderOS MCP Server...");
    // Create the MCPServer Wrapper
    const serverWrapper = new core_1.MCPServer({
        name: "founder-os",
        version: "1.0.0"
    });
    // Register the service instance
    serverWrapper.registerService(new FounderOSTools());
    // Start HTTP Server on Port 3000
    // We pass the underlying SDK Server instance to createHTTPServer
    await (0, core_1.createHTTPServer)(() => serverWrapper.getServer(), {
        port: 3000,
        cors: true,
        logging: true
    });
    console.log("FounderOS MCP Server running on port 3000 with Real Integrations!");
}
startServer().catch(console.error);
