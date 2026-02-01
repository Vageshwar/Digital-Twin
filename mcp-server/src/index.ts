import { Tool, SchemaConstraint, Optional } from "@leanmcp/core";
import { google } from "googleapis";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ===========================================================================
// INPUT SCHEMAS
// ===========================================================================

class GithubSearchInput {
  @SchemaConstraint({
    description: "What to search for — a keyword, language, topic, or repo name",
    minLength: 1
  })
  query!: string;
}

class CalendarSlotsInput {
  @Optional()
  @SchemaConstraint({
    description: "Meeting duration in minutes (default 30)",
    default: 30
  })
  durationMinutes?: number;
}

class DiscordAlertInput {
  @SchemaConstraint({
    description: "Name of the visitor or candidate",
    minLength: 1
  })
  visitorName!: string;

  @SchemaConstraint({
    description: "Company or organisation the visitor is from",
    minLength: 1
  })
  company!: string;

  @Optional()
  @SchemaConstraint({
    description: "Extra context to include in the alert (optional)"
  })
  message?: string;
}

// ===========================================================================
// GITHUB HELPERS
// ===========================================================================

interface GHRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
}

interface GHSearchItem {
  path: string;
  repository: { full_name: string };
  html_url: string;
}

interface GHFileContent {
  content?: string;
  path: string;
  html_url: string;
}

function githubHeaders(): Record<string, string> {
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "VageshwarTwinMCP",
  };
}

function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf-8");
}

function truncateCode(code: string, maxLines = 40): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  const head = lines.slice(0, 20).join("\n");
  const tail = lines.slice(lines.length - 15).join("\n");
  return `${head}\n\n  ... (${lines.length - 35} lines omitted) ...\n\n${tail}`;
}

async function fallbackRepoSearch(query: string, username: string): Promise<string> {
  const reposUrl =
    `https://api.github.com/users/${username}/repos` +
    `?type=owner&sort=updated&per_page=30`;

  const reposRes = await fetch(reposUrl, { headers: githubHeaders() });
  if (!reposRes.ok) {
    return `Could not fetch repos: HTTP ${reposRes.status}`;
  }

  const repos = (await reposRes.json()) as GHRepo[];
  const q = query.toLowerCase();

  const matched = repos
    .filter((r) => {
      const haystack = [r.full_name, r.description || "", r.language || ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 4);

  if (matched.length === 0) {
    return `No repositories found matching "${query}" for user ${username}.`;
  }

  const results: string[] = [];
  for (const repo of matched) {
    let readmeSnippet = "";
    const readmeRes = await fetch(
      `https://api.github.com/repos/${repo.full_name}/readme`,
      { headers: githubHeaders() }
    );
    if (readmeRes.ok) {
      const readmeData = (await readmeRes.json()) as GHFileContent;
      if (readmeData.content) {
        readmeSnippet = truncateCode(decodeBase64(readmeData.content), 20);
      }
    }

    results.push(
      `📂 ${repo.full_name}\n` +
      `📝 ${repo.description || "No description"}\n` +
      `🔧 Language: ${repo.language || "Not specified"}\n` +
      `🔗 ${repo.html_url}\n` +
      (readmeSnippet ? `\nREADME:\n\`\`\`\n${readmeSnippet}\n\`\`\`` : "")
    );
  }

  return `🔍 Repos matching "${query}":\n\n` + results.join("\n\n---\n\n");
}

// ===========================================================================
// GOOGLE CALENDAR HELPERS
// ===========================================================================

let _cachedClient: ReturnType<typeof google.calendar> | null = null;

function getCalendarClient(): ReturnType<typeof google.calendar> {
  if (_cachedClient) return _cachedClient;

  let keyFile: Record<string, unknown>;

  if (process.env.GOOGLE_KEY_CONTENT) {
    keyFile = JSON.parse(process.env.GOOGLE_KEY_CONTENT);
  } else if (process.env.GOOGLE_KEY_PATH) {
    const keyPath = resolve(process.env.GOOGLE_KEY_PATH);
    if (!existsSync(keyPath)) {
      throw new Error(
        `GOOGLE_KEY_PATH is set to "${keyPath}" but the file does not exist. ` +
        `Set GOOGLE_KEY_CONTENT instead for production.`
      );
    }
    keyFile = JSON.parse(readFileSync(keyPath, "utf-8"));
  } else {
    throw new Error(
      "Neither GOOGLE_KEY_CONTENT nor GOOGLE_KEY_PATH is set."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  _cachedClient = google.calendar({ version: "v3", auth });
  return _cachedClient;
}

function computeFreeSlots(
  busy: Array<{ start: Date; end: Date }>,
  windowStart: Date,
  windowEnd: Date,
  durationMs: number
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());
  let cursor = windowStart.getTime();

  for (const block of busy) {
    const blockStart = block.start.getTime();
    const blockEnd = block.end.getTime();

    if (blockStart - cursor >= durationMs) {
      let t = cursor;
      while (t + durationMs <= blockStart) {
        slots.push({ start: new Date(t), end: new Date(t + durationMs) });
        t += 30 * 60 * 1000;
      }
    }
    if (blockEnd > cursor) cursor = blockEnd;
  }

  if (windowEnd.getTime() - cursor >= durationMs) {
    let t = cursor;
    while (t + durationMs <= windowEnd.getTime()) {
      slots.push({ start: new Date(t), end: new Date(t + durationMs) });
      t += 30 * 60 * 1000;
    }
  }

  return slots;
}

// ===========================================================================
// SERVICE CLASS — all tools in one place, auto-discovered by LeanMCP
// ===========================================================================

export class VageshwarTwinService {

  // -------------------------------------------------------------------------
  // TOOL 1: github_search
  // -------------------------------------------------------------------------
  @Tool({
    description:
      "Search Vageshwar's GitHub repos for code, READMEs, and projects matching a keyword. " +
      "Use this when a visitor asks about specific projects, technologies, or past work.",
    inputClass: GithubSearchInput
  })
  async github_search(input: GithubSearchInput) {
    const username = process.env.GITHUB_USERNAME!;
    const token = process.env.GITHUB_TOKEN!;

    if (!token || !username) {
      return "ERROR: GITHUB_TOKEN or GITHUB_USERNAME not set in environment.";
    }

    try {
      const searchUrl =
        `https://api.github.com/search/code` +
        `?q=${encodeURIComponent(input.query)}+user:${encodeURIComponent(username)}` +
        `&per_page=5`;

      const searchRes = await fetch(searchUrl, { headers: githubHeaders() });

      if (!searchRes.ok) {
        return await fallbackRepoSearch(input.query, username);
      }

      const searchData = (await searchRes.json()) as {
        total_count: number;
        items: GHSearchItem[];
      };

      if (searchData.total_count === 0 || searchData.items.length === 0) {
        return await fallbackRepoSearch(input.query, username);
      }

      const snippets: string[] = [];
      for (const item of searchData.items.slice(0, 3)) {
        const fileUrl =
          `https://api.github.com/repos/${item.repository.full_name}/contents/${item.path}`;
        const fileRes = await fetch(fileUrl, { headers: githubHeaders() });
        if (!fileRes.ok) continue;

        const fileData = (await fileRes.json()) as GHFileContent;
        if (!fileData.content) continue;

        const code = decodeBase64(fileData.content);
        snippets.push(
          `📂 ${item.repository.full_name} → ${item.path}\n` +
          `🔗 ${item.html_url}\n` +
          `\`\`\`\n${truncateCode(code)}\n\`\`\``
        );
      }

      if (snippets.length === 0) {
        return await fallbackRepoSearch(input.query, username);
      }

      return `🔍 GitHub search results for "${input.query}":\n\n` + snippets.join("\n\n---\n\n");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `GitHub search error: ${message}`;
    }
  }

  // -------------------------------------------------------------------------
  // TOOL 2: get_calendar_slots
  // -------------------------------------------------------------------------
  @Tool({
    description:
      "Fetch Vageshwar's free calendar slots for the next 48 hours during working hours (9 AM – 6 PM IST). " +
      "Use this when a visitor expresses interest in scheduling a call or interview.",
    inputClass: CalendarSlotsInput
  })
  async get_calendar_slots(input: CalendarSlotsInput) {
    const calendarId = process.env.GOOGLE_CALENDAR_ID!;
    const duration = input.durationMinutes || 30;

    if (!calendarId) {
      return "ERROR: GOOGLE_CALENDAR_ID not set.";
    }

    try {
      const calendar = getCalendarClient();
      const now = new Date();
      const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      const response = await calendar.events.list({
        calendarId,
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.data.items || [];
      const busy: Array<{ start: Date; end: Date }> = [];
      for (const event of events) {
        if (!event.start?.dateTime || !event.end?.dateTime) continue;
        busy.push({
          start: new Date(event.start.dateTime),
          end: new Date(event.end.dateTime),
        });
      }

      const durationMs = duration * 60 * 1000;
      const allSlots = computeFreeSlots(busy, now, windowEnd, durationMs);

      // Filter to 9 AM – 6 PM IST only
      const workingSlots = allSlots.filter((slot) => {
        const hour = parseInt(
          slot.start.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            hour: "numeric",
            hour12: false,
          }),
          10
        );
        return hour >= 9 && hour < 18;
      });

      // Pick up to 6 spread across the window
      const step = Math.max(1, Math.floor(workingSlots.length / 6));
      const suggestions: Array<{ start: Date; end: Date }> = [];
      for (let i = 0; i < workingSlots.length && suggestions.length < 6; i += step) {
        suggestions.push(workingSlots[i]);
      }

      if (suggestions.length === 0) {
        return `No available ${duration}-minute slots in the next 48 hours (9 AM – 6 PM IST). Calendar is fully booked.`;
      }

      const formatted = suggestions.map((s, i) => {
        const dayLabel = s.start.toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata", weekday: "long", month: "short", day: "numeric",
        });
        const startTime = s.start.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
        });
        const endTime = s.end.toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
        });
        return `  ${i + 1}. ${dayLabel} — ${startTime} to ${endTime} IST`;
      });

      return `📅 Available ${duration}-minute slots (next 48 hours, working hours IST):\n\n` + formatted.join("\n");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Calendar error: ${message}`;
    }
  }

  // -------------------------------------------------------------------------
  // TOOL 3: send_discord_alert
  // -------------------------------------------------------------------------
  @Tool({
    description:
      "Send a formatted alert to Vageshwar's Discord channel when a high-value lead or interview candidate engages. " +
      "Use this when a visitor shares their name and company and expresses serious interest.",
    inputClass: DiscordAlertInput
  })
  async send_discord_alert(input: DiscordAlertInput) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL!;

    if (!webhookUrl) {
      return "ERROR: DISCORD_WEBHOOK_URL not set.";
    }

    try {
      const payload = {
        content: "🚨 **High-Value Lead Alert**",
        embeds: [{
          title: "🚨 New Lead Notification",
          description: input.message || "A high-value visitor interaction was detected.",
          color: 0xff4500,
          fields: [
            { name: "👤 Visitor", value: input.visitorName || "Unknown", inline: true },
            { name: "🏢 Company", value: input.company || "Not specified", inline: true },
            {
              name: "⏰ Time",
              value: new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "short", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit", hour12: true,
              }),
              inline: true,
            },
          ],
          footer: { text: "Vageshwar's Digital Twin — Automated Alert" },
          timestamp: new Date().toISOString(),
        }]
      };

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 204 || res.status === 200) {
        return `✅ Discord alert sent successfully. Vageshwar has been notified about ${input.visitorName} from ${input.company}.`;
      }

      const errorBody = await res.text();
      return `Discord webhook returned HTTP ${res.status}: ${errorBody}`;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return `Discord alert error: ${message}`;
    }
  }
}