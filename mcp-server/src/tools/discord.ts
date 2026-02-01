import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordPayload {
  content: string;
  embeds: DiscordEmbed[];
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function sendDiscordAlert(
  visitorName: string,
  company: string,
  message: string
): Promise<CallToolResult> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL!;

  if (!webhookUrl) {
    return {
      content: [
        { type: "text", text: "ERROR: DISCORD_WEBHOOK_URL not set." },
      ],
      isError: true,
    };
  }

  try {
    // ---------------------------------------------------------------------------
    // Build the embed payload
    // ---------------------------------------------------------------------------
    const payload: DiscordPayload = {
      content: "🚨 **High-Value Lead Alert**",
      embeds: [
        {
          title: "🚨 New Lead Notification",
          description: message || "A high-value visitor interaction was detected.",
          color: 0xff4500, // OrangeRed — eye-catching
          fields: [
            {
              name: "👤 Visitor",
              value: visitorName || "Unknown",
              inline: true,
            },
            {
              name: "🏢 Company",
              value: company || "Not specified",
              inline: true,
            },
            {
              name: "⏰ Time",
              value: new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              }),
              inline: true,
            },
          ],
          footer: {
            text: "Vageshwar's Digital Twin — Automated Alert",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // ---------------------------------------------------------------------------
    // POST to Discord webhook
    // ---------------------------------------------------------------------------
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Discord returns 204 on success, sometimes 200
    if (res.status === 204 || res.status === 200) {
      return {
        content: [
          {
            type: "text",
            text: `✅ Discord alert sent successfully. Vageshwar has been notified about ${visitorName} from ${company}.`,
          },
        ],
      };
    }

    // If not success, read the error body
    const errorBody = await res.text();
    return {
      content: [
        {
          type: "text",
          text: `Discord webhook returned HTTP ${res.status}: ${errorBody}`,
        },
      ],
      isError: true,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: "text", text: `Discord alert error: ${message}` },
      ],
      isError: true,
    };
  }
}
