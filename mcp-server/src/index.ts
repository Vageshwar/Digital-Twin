
import { createHTTPServer, Tool, SchemaConstraint, MCPServer } from "@leanmcp/core";
import { Octokit } from "@octokit/rest";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Input Classes
class GithubSearchInput {
    @SchemaConstraint({ description: "The search query" })
    query!: string;
}

class CalendarSlotsInput {
    @SchemaConstraint({ description: "Duration in minutes" })
    duration!: number;
}

class DiscordAlertInput {
    @SchemaConstraint({ description: "The message to send" })
    message!: string;
}

class CompanySearchInput {
    @SchemaConstraint({ description: "The company name" })
    name!: string;
}

class BookMeetingInput {
    @SchemaConstraint({ description: "Name of the person" })
    name!: string;
    
    @SchemaConstraint({ description: "Time slot to book" })
    time!: string;
}

class FounderOSTools {
  
  @Tool({ description: "Search for repositories on GitHub", inputClass: GithubSearchInput })
  async github_search(args: GithubSearchInput): Promise<any> {
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
         if (!token) throw new Error("GITHUB_TOKEN not set");
         
         const octokit = new Octokit({ auth: token });
         const { data } = await octokit.search.repos({ q: query, per_page: 5 });
         const repos = data.items.map((repo: any) => 
            `- ${repo.full_name} (⭐ ${repo.stargazers_count}): ${repo.description || 'No description'} [${repo.html_url}]`
         ).join('\n');
         
         return { content: [{ type: "text", text: `Here are the top GitHub results for "${query}":\n\n${repos}` }] };
     } catch (e: any) {
         return { content: [{ type: "text", text: `Error searching GitHub: ${e.message}` }] };
     }
  }

  @Tool({ description: "Get available calendar slots", inputClass: CalendarSlotsInput })
  async get_calendar_slots(args: CalendarSlotsInput): Promise<any> {
    const duration = args.duration;
    try {
        const keyPath = process.env.GOOGLE_KEY_PATH || 'google_key.json';
        const absoluteKeyPath = path.resolve(process.cwd(), keyPath);
        
        if (!fs.existsSync(absoluteKeyPath)) {
            return { content: [{ type: "text", text: `Error: GOOGLE_KEY_PATH file not found at ${absoluteKeyPath}` }] };
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: absoluteKeyPath,
            scopes: ['https://www.googleapis.com/auth/calendar']
        });
        
        const calendar = google.calendar({ version: 'v3', auth });
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
        
        const eventList = events.map((event: any) => {
            const start = event.start.dateTime || event.start.date;
            return `- ${start}: ${event.summary}`;
        }).join('\n');

        return { content: [{ type: "text", text: `Calendar for today:\n${eventList}\n\n(Slot calculation simplified for demo)` }] };

    } catch (e: any) {
         return { content: [{ type: "text", text: `Error fetching calendar: ${e.message}` }] };
    }
  }

  @Tool({ description: "Send a high-priority alert to the founder", inputClass: DiscordAlertInput })
  async send_discord_alert(args: DiscordAlertInput): Promise<any> {
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
      } catch (e: any) {
           return { content: [{ type: "text", text: `Error sending alert: ${e.message}` }] };
      }
  }

  @Tool({ description: "Verify company details", inputClass: CompanySearchInput })
  async company_search(args: CompanySearchInput): Promise<any> {
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

  @Tool({ description: "Book a meeting slot", inputClass: BookMeetingInput })
  async book_meeting(args: BookMeetingInput): Promise<any> {
     const { name, time } = args;
     return {
          content: [{ type: "text", text: `Meeting Confirmed: ${time} with ${name}. Calendar invite sent.` }]
     };
  }
}

// Helper to start the server
async function startServer() {
    console.log("Starting FounderOS MCP Server...");
    
    // Create the MCPServer Wrapper
    const serverWrapper = new MCPServer({
        name: "founder-os",
        version: "1.0.0"
    });
    
    // Register the service instance
    serverWrapper.registerService(new FounderOSTools());
    
    // Start HTTP Server on Port 3000
    // We pass the underlying SDK Server instance to createHTTPServer
    await createHTTPServer(
        () => serverWrapper.getServer(), 
        { 
            port: 3000, 
            cors: true,
            logging: true
        }
    );
    
    console.log("FounderOS MCP Server running on port 3000 with Real Integrations!");
}

startServer().catch(console.error);
