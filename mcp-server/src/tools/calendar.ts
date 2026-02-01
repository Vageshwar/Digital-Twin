import { google } from "googleapis";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the service account credentials and return an authenticated Google
 * Calendar client.  Caches the client so we only read the file + sign a
 * token once per process lifetime.
 *
 * Credential resolution order:
 *   1. GOOGLE_KEY_CONTENT — the entire service account JSON as a string.
 *      This is what LeanMCP (and any env-only deployment) uses, because
 *      there is no filesystem to drop a file into.
 *   2. GOOGLE_KEY_PATH   — a file path to the JSON file.
 *      This is what local development uses.
 */
let _cachedClient: ReturnType<typeof google.calendar> | null = null;

function getCalendarClient(): ReturnType<typeof google.calendar> {
  if (_cachedClient) return _cachedClient;

  let keyFile: Record<string, unknown>;

  if (process.env.GOOGLE_KEY_CONTENT) {
    // Production path: full JSON string in an env var
    keyFile = JSON.parse(process.env.GOOGLE_KEY_CONTENT);
  } else if (process.env.GOOGLE_KEY_PATH) {
    // Local dev path: read from file
    const keyPath = resolve(process.env.GOOGLE_KEY_PATH);
    if (!existsSync(keyPath)) {
      throw new Error(
        `GOOGLE_KEY_PATH is set to "${keyPath}" but the file does not exist. ` +
        `Either fix the path or set GOOGLE_KEY_CONTENT with the JSON contents instead.`
      );
    }
    keyFile = JSON.parse(readFileSync(keyPath, "utf-8"));
  } else {
    throw new Error(
      "Neither GOOGLE_KEY_CONTENT nor GOOGLE_KEY_PATH is set. " +
      "Set one of them in your .env file."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: keyFile,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  _cachedClient = google.calendar({ version: "v3", auth });
  return _cachedClient;
}

/**
 * Convert a JS Date to IST (UTC+5:30) and return a readable string.
 */
function toIST(date: Date): string {
  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Given a sorted list of busy intervals and a search window, compute all
 * free slots of exactly `durationMs` milliseconds.
 *
 * We walk through the window in steps.  Between each pair of consecutive
 * busy periods (or between window-start/end and a busy period) we check
 * whether there's enough gap for a meeting.
 */
function computeFreeSlots(
  busy: Array<{ start: Date; end: Date }>,
  windowStart: Date,
  windowEnd: Date,
  durationMs: number
): Array<{ start: Date; end: Date }> {
  const slots: Array<{ start: Date; end: Date }> = [];

  // Sort busy periods by start time
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  let cursor = windowStart.getTime();

  for (const block of busy) {
    const blockStart = block.start.getTime();
    const blockEnd = block.end.getTime();

    // Gap between cursor and this block's start
    if (blockStart - cursor >= durationMs) {
      // There's room — emit slots at 30-min increments within the gap
      let t = cursor;
      while (t + durationMs <= blockStart) {
        slots.push({
          start: new Date(t),
          end: new Date(t + durationMs),
        });
        t += 30 * 60 * 1000; // step by 30 min
      }
    }

    // Move cursor past this block
    if (blockEnd > cursor) {
      cursor = blockEnd;
    }
  }

  // Gap after the last busy block until window end
  if (windowEnd.getTime() - cursor >= durationMs) {
    let t = cursor;
    while (t + durationMs <= windowEnd.getTime()) {
      slots.push({
        start: new Date(t),
        end: new Date(t + durationMs),
      });
      t += 30 * 60 * 1000;
    }
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function getCalendarSlots(
  durationMinutes: number
): Promise<CallToolResult> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID!;

  if (!calendarId || !process.env.GOOGLE_KEY_PATH) {
    return {
      content: [
        {
          type: "text",
          text: "ERROR: GOOGLE_CALENDAR_ID or GOOGLE_KEY_PATH not set.",
        },
      ],
      isError: true,
    };
  }

  try {
    const calendar = getCalendarClient();

    // Search window: next 48 hours from now
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // But we only want to suggest slots during reasonable working hours
    // IST 9:00 AM – 6:00 PM.  We'll filter the generated slots afterward.

    const response = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: windowEnd.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    // Build busy intervals from events
    const busy: Array<{ start: Date; end: Date }> = [];
    for (const event of events) {
      // Skip all-day events (they have date, not dateTime)
      if (!event.start?.dateTime || !event.end?.dateTime) continue;

      busy.push({
        start: new Date(event.start.dateTime),
        end: new Date(event.end.dateTime),
      });
    }

    // Compute free slots
    const durationMs = durationMinutes * 60 * 1000;
    const allSlots = computeFreeSlots(busy, now, windowEnd, durationMs);

    // Filter to working hours only (9 AM – 6 PM IST)
    // We do this by converting each slot to IST hours and checking the range.
    const workingSlots = allSlots.filter((slot) => {
      const istHour = slot.start.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        hour12: false,
      });
      const hour = parseInt(istHour, 10);
      return hour >= 9 && hour < 18;
    });

    // Return at most 6 suggestions, spread across the window
    // Pick every Nth slot so we don't flood them with 30-min-apart options
    const step = Math.max(1, Math.floor(workingSlots.length / 6));
    const suggestions: Array<{ start: Date; end: Date }> = [];
    for (let i = 0; i < workingSlots.length && suggestions.length < 6; i += step) {
      suggestions.push(workingSlots[i]);
    }

    if (suggestions.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No available ${durationMinutes}-minute slots found in the next 48 hours during working hours (9 AM – 6 PM IST). ` +
                  `The calendar is fully booked or the requested duration doesn't fit any gaps.`,
          },
        ],
      };
    }

    // Format output
    const formatted = suggestions.map((s, i) => {
      const dayLabel = s.start.toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        month: "short",
        day: "numeric",
      });
      const startTime = s.start.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      const endTime = s.end.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
      return `  ${i + 1}. ${dayLabel} — ${startTime} to ${endTime} IST`;
    });

    return {
      content: [
        {
          type: "text",
          text:
            `📅 Available ${durationMinutes}-minute slots (next 48 hours, working hours IST):\n\n` +
            formatted.join("\n"),
        },
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: "text", text: `Calendar error: ${message}` },
      ],
      isError: true,
    };
  }
}