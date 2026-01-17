// netlify/functions/openai-chat.js

export async function handler(event) {
  try {
    // Only allow POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    // CORS (optional but helpful for local/dev; harmless on Netlify)
    const baseHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    // Handle preflight quickly
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: baseHeaders, body: "" };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: baseHeaders,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
      };
    }

    // Parse body
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: baseHeaders,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const model =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "gpt-4.1-mini";

    const temperature =
      typeof body.temperature === "number" ? body.temperature : 0.5;

    const contextPacket =
      typeof body.contextPacket === "string" ? body.contextPacket : "";
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // ✅ Cap contextPacket to keep requests under limits
    const MAX_CONTEXT_CHARS = 24000; // adjust if you want
    const contextPacketCapped =
      contextPacket.length > MAX_CONTEXT_CHARS
        ? contextPacket.slice(0, MAX_CONTEXT_CHARS) +
          "\n\n(…truncated for length…)"
        : contextPacket;

    // Validate + normalize incoming chat history
    const safeMessages = messages
      .filter((m) => m && typeof m === "object")
      .map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "",
      }))
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          m.content.trim().length > 0
      )
      .slice(-40);

    // ✅ Enforce Traditional Chinese output (but accept any input language)
    // System instructions go in `instructions` (cleaner for Responses API)
    const instructions = [
      "You are a Ziwei DouShu (紫微斗數) interpretation assistant.",
      "",
      "Language rule (must follow):",
      "- The user may write in English or Chinese (any form). You must understand it.",
      "- Always reply in Traditional Chinese (繁體中文).",
      "- Never use Simplified Chinese. Never reply in English.",
      "",
      "Style / tone:",
      "- Write like a helpful, warm human consultant（自然、口語、好讀）.",
      "- Give the conclusion first (2–4 key takeaways), then details if helpful.",
      "- Use short paragraphs and bullet points when it improves readability.",
      "- Avoid overly technical jargon unless the user explicitly asks for it.",
      "- If you assume something, state it plainly.",
      "",
      "Rules (must follow):",
      "- 本命為基底；主導層最多一層（大限或流年）。",
      "- 流月/流日只作『應期參考』：可以提，但不主導、不輸出格局。",
      "- Use the provided Context packet as the source of truth for chart data.",
      "- If contextPacket already contains chart data, do NOT ask for birth info again.",

      "",
      "When answering:",
      "- Start with 2–4 key takeaways (結論先行).",
      "- Then give practical advice / action steps (可做什麼).",
      "- For follow-ups, keep continuity with what was said previously.",
    ].join("\n");

    // ✅ Build Responses API input with correct content types by role
    const input = [];

    // Context packet injected as a USER input_text turn (if present)
    if (contextPacketCapped.trim()) {
      input.push({
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Context packet (structured Ziwei data). Use it as the source of truth:\n\n" +
              contextPacketCapped,
          },
        ],
      });
    }

    // Chat history: user => input_text, assistant => output_text
    for (const m of safeMessages) {
      if (m.role === "user") {
        input.push({
          role: "user",
          content: [{ type: "input_text", text: m.content }],
        });
      } else if (m.role === "assistant") {
        input.push({
          role: "assistant",
          content: [{ type: "output_text", text: m.content }],
        });
      }
    }

    // Call OpenAI Responses API
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        temperature,
      }),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      // Return a clean error payload (frontend can parse detail)
      return {
        statusCode: resp.status,
        headers: baseHeaders,
        body: JSON.stringify({ error: "OpenAI error", detail: raw }),
      };
    }

    const data = JSON.parse(raw);

    // ✅ Robustly extract assistant text
    function extractOutputText(d) {
      // Common convenience field
      if (typeof d?.output_text === "string" && d.output_text.trim()) {
        return d.output_text.trim();
      }

      // Newer structured outputs
      const out = d?.output;
      if (!Array.isArray(out)) return "";

      const chunks = [];

      for (const item of out) {
        // Most common: item.type === "message"
        if (item?.type === "message" && Array.isArray(item?.content)) {
          for (const c of item.content) {
            if (c?.type === "output_text" && typeof c.text === "string") {
              chunks.push(c.text);
              continue;
            }
            // loose fallback: if it looks like text, capture it
            if (typeof c?.text === "string") chunks.push(c.text);
          }
        }

        // Some variants
        if (typeof item?.output_text === "string") chunks.push(item.output_text);
        if (typeof item?.content?.text === "string") chunks.push(item.content.text);
      }

      return chunks.join("\n").trim();
    }

    const text = extractOutputText(data);
    const usage = data.usage || null;

    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({ text, usage }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Unhandled server error",
        message: err?.message || String(err),
      }),
    };
  }
}