# Vageshwar's Twin (FounderOS)

## Inspiration
As founders/builders, we are constantly bombarded with context switching—investor emails, hiring candidates, code reviews, and scheduling nightmares. We asked ourselves: **"What if we could clone ourselves?"**

We didn't just want a chatbot; we wanted a **Digital Twin** that thinks like us, has access to our real-world tools, and protects our time. Neuralink isn't ready yet, so we built **FounderOS**.

## What it does
**Vageshwar's Twin** is an intelligent AI agent that acts as a gatekeeper and operator for your digital life.
*   **Persona mimicking**: Powered by **Featherless.ai (Llama 3.1)**, it adopts the founder's specific tone and decision-making style.
*   **Real-time Code Audits**: It can search your actual **GitHub** repositories (e.g., checking `middleware.ts` for auth logic) and answer technical questions with context.
*   **Gatekeeper for Time**: It connects to **Google Calendar** to check real-time availability and negotiate meeting slots without you opening a tab.
*   **Company Verification**: It vets incoming leads/companies to see if they are legitimate (e.g., funding stage, location).
*   **Emergency Line**: If something is truly urgent, it bypasses the chat and sends a high-priority alert to your phone via **Discord**.

## How we built it
We built a robust, decoupled 3-tier architecture:

1.  **The Interface (Frontend)**:
    *   built with **React** & **Tailwind CSS**.
    *   Features a custom **Audio Visualizer** that reacts to the AI's "voice" intensity.
    *   Cyberpunk/Terminal aesthetic to feel like a "command center."
2.  **The Brain (Backend)**:
    *   **FastAPI** (Python) server that manages the WebSocket connection.
    *   Integrates with **Featherless.ai** for low-latency inference.
    *   Acts as the **MCP Client**, translating user intent into tool execution commands.
3.  **The Hands (MCP Server)**:
    *   Built with **Node.js**, **Hono**, and the **LeanMCP SDK**.
    *   We moved away from simple mocks to **Real API Integrations**:
        *   **Octokit** for GitHub.
        *   **Google APIs** for Calendar.
        *   **Discord Webhooks** for alerts.
    *   Exposes a standard Model Context Protocol (MCP) endpoint over HTTP/SSE.

## Challenges we ran into
*   **The MCP Learning Curve**: Implementing the *Model Context Protocol* from scratch was complex. We initially faced stability issues with the raw SDK.
*   **Server Communication**: We migrated from a standard I/O subprocess model to a robust **HTTP/SSE architecture** (using Hono) to allow the MCP server to run independently and scale.
*   **Real-Time Auth**: configuring the Google Service Account to interact seamlessly with a personal calendar required some deep dives into GCP IAM permissions.

## Accomplishments that we're proud of
*   **True Agentry**: It's not just RAG; the AI decides *when* to use a tool. If you ask "How's my schedule?", it calls the calendar. If you say "Alert me", it calls Discord.
*   **LeanMCP Integration**: We successfully refactored our code to use the modern `@leanmcp/core` decorators, making our tool definitions clean and type-safe.
*   **The Vibe**: We spent time polishing the "Neural Link" aesthetic. The boot-up sequences, log streams, and visualizers make it feel like a piece of sci-fi tech.

## What we learned
*   **MCP is powerful**: Decoupling the "Brain" (LLM) from the "Tools" (MCP Server) is a game-changer. It allows us to swap out models (Llama, GPT-4, etc.) without breaking our tool integrations.
*   **Context is King**: Giving the AI access to the file system and live APIs transforms it from a "search engine" to a "co-worker."

## What's next for Digital Twin
*   **Voice Mode**: Adding Speech-to-Text and Text-to-Speech for a full "Iron Man / JARVIS" experience.
*   **Autonomous Mode**: Allowing the twin to run in the background, proactively checking emails and drafting replies without user input.
*   **More Integrations**: Linear (for issue tracking) and Slack (for team comms) are next on the list.
