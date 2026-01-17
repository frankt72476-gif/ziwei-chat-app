// netlify/functions/openai-chat.js
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "text/plain" },
        body: "Method Not Allowed",
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/plain" },
        body: "Missing OPENAI_API_KEY",
      };
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/plain" },
        body: "Invalid JSON body",
      };
    }

    const model =
      typeof payload.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : "gpt-4.1-mini";

    const contextPacket = typeof payload.contextPacket === "string" ? payload.contextPacket : "";
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    const ctx = contextPacket.slice(0, 120000);

    const instructions =
      "You are a helpful Ziwei DouShu assistant. Use the chart data packet below as authoritative context.\n\n" +
      "CHART DATA PACKET:\n" +
      ctx;

    const input = messages.map((m) => ({
      role: m?.role === "assistant" ? "assistant" : "user",
      content: [{ type: "text", text: String(m?.content ?? "") }],
    }));

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
        temperature: 0.4,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return {
        statusCode: resp.status,
        headers: { "Content-Type": "text/plain" },
        body: errText,
      };
    }

    const data = await resp.json();

    // 1) Prefer explicit output_text parts (per docs)
    const parts = [];
    for (const item of data?.output || []) {
      if (item?.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && typeof c.text === "string") {
            parts.push(c.text);
          }
        }
      }
    }
    const extracted = parts.join("\n").trim();

    // 2) Fallback: aggregated output_text if present
    const aggregated =
      typeof data?.output_text === "string" ? data.output_text.trim() : "";

    const finalText = aggregated || extracted;

    // 3) If still empty, return debug info so we can see the shape
    if (!finalText) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "",
          debug: {
            has_output: Array.isArray(data?.output),
            output_len: Array.isArray(data?.output) ? data.output.length : null,
            output_item_types: Array.isArray(data?.output)
              ? data.output.map((x) => x?.type).slice(0, 10)
              : null,
            first_message_content: Array.isArray(data?.output)
              ? (data.output.find((x) => x?.type === "message")?.content || null)
              : null,
            has_output_text: typeof data?.output_text === "string",
          },
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: finalText }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: e?.message || String(e) }),
    };
  }
};
