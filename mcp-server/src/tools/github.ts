import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GHRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  updated_at: string;
}

interface GHSearchItem {
  path: string;
  repository: { full_name: string };
  html_url: string;
}

interface GHFileContent {
  content?: string; // base64 encoded
  path: string;
  html_url: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function githubHeaders(): Record<string, string> {
  console.log(process.env.GITHUB_TOKEN)
  return {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "VageshwarTwinMCP",
  };
}

/**
 * Decode a base64 string returned by GitHub's file API.
 * GitHub returns the content split into 60-char lines joined by \n.
 */
function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf-8");
}

/**
 * Truncate a code string to roughly `maxLines` lines.
 * If it's longer, we show the first few and last few lines with an ellipsis.
 */
function truncateCode(code: string, maxLines = 40): string {
  const lines = code.split("\n");
  if (lines.length <= maxLines) return code;
  const head = lines.slice(0, 20).join("\n");
  const tail = lines.slice(lines.length - 15).join("\n");
  return `${head}\n\n  ... (${lines.length - 35} lines omitted) ...\n\n${tail}`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function githubSearch(query: string): Promise<CallToolResult> {
  const username = process.env.GITHUB_USERNAME!;
  const token = process.env.GITHUB_TOKEN!;

  if (!token || !username) {
    return {
      content: [
        {
          type: "text",
          text: "ERROR: GITHUB_TOKEN or GITHUB_USERNAME not set in environment.",
        },
      ],
      isError: true,
    };
  }

  try {
    // ---------------------------------------------------------------
    // Step 1: Search code across user's repos
    // GitHub code search endpoint: GET /search/code
    // We scope to the user's repos with "user:<username>" qualifier.
    // ---------------------------------------------------------------
    const searchUrl =
      `https://api.github.com/search/code` +
      `?q=${encodeURIComponent(query)}+user:${encodeURIComponent(username)}` +
      `&per_page=5`;

    const searchRes = await fetch(searchUrl, { headers: githubHeaders() });
    console.log(searchRes);

    if (!searchRes.ok) {
      // GitHub rate-limits unauthenticated or overused searches.
      // Fall back to listing repos and searching filenames instead.
      return await fallbackRepoSearch(query, username);
    }

    const searchData = (await searchRes.json()) as {
      total_count: number;
      items: GHSearchItem[];
    };

    if (searchData.total_count === 0 || searchData.items.length === 0) {
      return await fallbackRepoSearch(query, username);
    }

    // ---------------------------------------------------------------
    // Step 2: For each matching file, fetch its content
    // ---------------------------------------------------------------
    const snippets: string[] = [];

    for (const item of searchData.items.slice(0, 3)) {
      // item.repository.full_name = "username/reponame"
      // item.path = relative file path inside the repo
      const fileUrl =
        `https://api.github.com/repos/${item.repository.full_name}/contents/${item.path}`;

      const fileRes = await fetch(fileUrl, { headers: githubHeaders() });
      if (!fileRes.ok) continue;

      const fileData = (await fileRes.json()) as GHFileContent;
      if (!fileData.content) continue;

      const code = decodeBase64(fileData.content);
      const truncated = truncateCode(code);

      snippets.push(
        `📂 ${item.repository.full_name} → ${item.path}\n` +
          `🔗 ${item.html_url}\n` +
          `\`\`\`\n${truncated}\n\`\`\``
      );
    }

    if (snippets.length === 0) {
      return await fallbackRepoSearch(query, username);
    }

    return {
      content: [
        {
          type: "text",
          text:
            `🔍 GitHub search results for "${query}":\n\n` +
            snippets.join("\n\n---\n\n"),
        },
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `GitHub search error: ${message}` }],
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback: list repos + match by name/description/language
// ---------------------------------------------------------------------------
// This fires when the code search endpoint is unavailable (rate limit, etc).
// It lists the user's repos and returns ones whose name, description, or
// language match the query. Less granular but still useful.
// ---------------------------------------------------------------------------

async function fallbackRepoSearch(
  query: string,
  username: string
): Promise<CallToolResult> {
  const reposUrl =
    `https://api.github.com/users/${username}/repos` +
    `?type=owner&sort=updated&per_page=30`;

  const reposRes = await fetch(reposUrl, { headers: githubHeaders() });
  if (!reposRes.ok) {
    return {
      content: [
        {
          type: "text",
          text: `Could not fetch repos: HTTP ${reposRes.status}`,
        },
      ],
      isError: true,
    };
  }

  const repos = (await reposRes.json()) as GHRepo[];
  const q = query.toLowerCase();

  // Score each repo: match on name, description, language, or topics
  const matched = repos
    .filter((r) => {
      const haystack = [
        r.full_name,
        r.description || "",
        r.language || "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 4);

  if (matched.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No repositories found matching "${query}" for user ${username}.`,
        },
      ],
    };
  }

  // For each matched repo, try to fetch the README for context
  const results: string[] = [];

  for (const repo of matched) {
    let readmeSnippet = "";

    const readmeUrl = `https://api.github.com/repos/${repo.full_name}/readme`;
    const readmeRes = await fetch(readmeUrl, { headers: githubHeaders() });
    if (readmeRes.ok) {
      const readmeData = (await readmeRes.json()) as GHFileContent;
      if (readmeData.content) {
        const readme = decodeBase64(readmeData.content);
        readmeSnippet = truncateCode(readme, 20);
      }
    }

    results.push(
      `📂 ${repo.full_name}\n` +
        `📝 ${repo.description || "No description"}\n` +
        `🔧 Language: ${repo.language || "Not specified"}\n` +
        `🔗 ${repo.html_url}\n` +
        (readmeSnippet
          ? `\nREADME:\n\`\`\`\n${readmeSnippet}\n\`\`\``
          : "")
    );
  }

  return {
    content: [
      {
        type: "text",
        text:
          `🔍 Repos matching "${query}":\n\n` + results.join("\n\n---\n\n"),
      },
    ],
  };
}