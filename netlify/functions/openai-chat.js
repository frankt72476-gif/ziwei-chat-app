// netlify/functions/openai-chat.js
// Drop-in replacement (fixes EN button returning Chinese)
//
// ✅ Key fixes:
// - Accept BOTH frontend params: outputLanguage (preferred) and displayLang (legacy)
// - Make server language authoritative (strong hard rules)
// - Keep your existing anchoring + Ziwei decision-support rules
// - Preserve Responses API roles/content types and robust output_text extraction
// - Keep caps + message sanitization + CORS + OPTIONS

export async function handler(event) {
  // CORS (optional but helpful for local/dev; harmless on Netlify)
  const baseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  try {
    // Handle preflight quickly
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: baseHeaders, body: "" };
    }

    // Only allow POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: baseHeaders,
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
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
      typeof body.temperature === "number" ? body.temperature : 0.6;

    const contextPacket =
      typeof body.contextPacket === "string" ? body.contextPacket : "";

    const messages = Array.isArray(body.messages) ? body.messages : [];

    // ✅ Language selection (FIX):
    // Frontend currently sends: outputLanguage ("zh" | "en")
    // Your old backend expected: displayLang
    // => support both, with outputLanguage taking precedence.
    const rawLang = (
    typeof body.outputLanguage === "string" && body.outputLanguage.trim()
        ? body.outputLanguage
        : typeof body.displayLang === "string" && body.displayLang.trim()
        ? body.displayLang
        : "zh"
    ).toLowerCase();


    const displayLang =
      rawLang === "en" || rawLang === "english"
        ? "en"
        : rawLang === "zh" ||
          rawLang === "tc" ||
          rawLang === "zh-tw" ||
          rawLang.includes("繁") ||
          rawLang.includes("中")
        ? "zh"
        : "zh";

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

    // ===== Language blocks (server-authoritative) =====
    // NOTE: These are HARD rules. The backend must win even if frontend prompts conflict.
    const LANGUAGE_BLOCK_ZH = [
      "【語言規則（硬性）】",
      "- 使用者可用英文或中文輸入（任何形式），你都要理解。",
      "- 你必須永遠用繁體中文回覆。",
      "- 不得使用簡體中文；不得用英文回覆。",
      "",
    ].join("\n");

    const LANGUAGE_BLOCK_EN = [
  "ENGLISH STYLE (HARD RULES — follow strictly)",
   // ✅ ADD THESE LINES HERE (TOP, VERY IMPORTANT)
  "- First line MUST restate the selected time target in friendly, natural English.",
  "- Do NOT mention modes, layers, or technical terms.",
  "- Example:",
  "  'I’m reading this based on the year you selected (target date: 2026-11-10).'",

  "",
  "- Write like a real person giving a fortune-style reading (warm, natural).",
  "- DO NOT sound like a report, consultant, or academic summary.",
  "- DO NOT use business/management phrases like: 'leverage points', 'optimize', 'resource allocation', 'pricing strategy', 'manage X'.",
  "- Keep it conversational and simple. Short sentences. Short paragraphs.",
  "",
  "TERMS (HARD RULES)",
  "- Do NOT use Ziwei/DouShu jargon (no 宮位名, no 流年/大限/命宮/財帛/官祿/遷移, etc.).",
  "- You MAY use light symbolic phrasing like: 'the stars around money…', 'the stars around health…', 'this phase highlights…'.",
  "- If you must explain a concept, do it in ONE short plain-English sentence and move on.",
  "",
  "TRANSLATION GUIDANCE (use these everyday words)",
  "- Money themes: money flow, financial pressure, stability, overspending, unexpected expenses, income ups/downs.",
  "- Career themes: direction, workload, recognition, responsibilities, feeling stuck vs moving forward.",
  "- Relationships: support, trust, expectations, boundaries, feeling misunderstood, teamwork.",
  "- Health/energy: stress load, burnout, recovery, sleep, energy level.",
  "- External opportunities: new doors, new people, exposure, travel/movement, changes in environment.",
  "",
  "TONE",
  "- Keep the fortune-telling feel, but grounded and human.",
  "- Avoid fatalistic 'you are doomed' language. Use: 'likely', 'tends to', 'watch for'.",
].join("\n");


    // ===== Main instructions =====
    // Keep your prior rules; just make sure language block is included and correct.
    const instructions = [
      "你是紫微斗數（紫微斗數）分析助手，但此產品定位是「結構化因果分析／決策輔助」，不是傳統算命。",
      "",
      displayLang === "en" ? LANGUAGE_BLOCK_EN : LANGUAGE_BLOCK_ZH,
      "【資料來源（硬性）】",
      "- 你會收到 contextPacket（Data tab 產物），它是本次排盤與層級選擇的唯一事實來源。",
      "- 若 contextPacket 已包含命盤資料，絕對不要再要求使用者提供生日/時辰/性別。",
      "- 不得臆測或自行補齊命盤資料；不確定就以 contextPacket 為準。",
      "",
      "【層級規則（硬性）】",
      "- 本命為基底。",
      "- 主導層最多一層：只允許「大限」或「流年」其中之一作主導（依 contextPacket 顯示為準）。",
      "- 流月/流日只作「應期參考」：可以提節奏，但不得主導、不得輸出格局、不得把它當作主因。",
      "",
      "【時間錨定／指代消歧（硬性；修正 'this year/this 大限' 混淆）】",
      "- contextPacket 內會包含「【時間錨點】」區塊（selected_mode / selected_target / solarDate 等）。",
      "- 使用者說「今年 / this year」：一律解讀為『本次已選定的流年（selected target 的流年）』，不是現實日曆的當下年份。",
      "- 使用者說「這個大限 / this 大限」：一律解讀為『本次已選定的大限』。",
      "- 使用者說「本月」：一律解讀為『本次已選定的流月』；說「今天」：一律解讀為『本次已選定的流日』。",
      "- 只有當使用者非常明確提到現實時間（例如：2026、現在、真實當下、current year/now）才視為現實日曆；此時不得偷換概念，必須提醒使用者目前選定的 target 並建議切換選項。",
      "",
      "【必做：每次回覆開頭都要重述『本次選定目標』（硬性）】",
      "- 每一次回覆的第一段，必須用一句話明確重述使用者目前選定的模式與目標（來自 contextPacket 的【模式/目標/時間錨點】）。",
      "- 這句話必須出現在每次回覆開頭（不可省略）。",
      "",
      "【Focus Palace（焦點宮位）對使用者隱藏（硬性）】",
      "- 不要要求使用者選擇或理解任何『焦點宮位/官祿宮/財帛宮』等術語。",
      "- 你可以在內部根據使用者問題推斷分析角度（事業/金錢/合作/感情/健康/壓力等），但對外只能用「角度/面向」描述。",
      "- 全篇回答固定使用同一個角度，除非使用者明確要求改角度。",
      "",
      "【輸出格式／風格】",
      "- 口吻自然、口語、好讀；避免宿命、避免空泛雞湯。",
      "- 若使用者語氣顯示焦慮/挫折/壓力，先用一句話承接情緒，再進入結論。",
      "- 先給 2–4 個重點結論（可用條列）。",
      "- 再用『因果鏈』說明：源頭→承受→傳導方式（祿/權/科/忌）→表徵/症狀。",
      "- 明確區分：不可調整點 vs 可調整點（策略槓桿/行動/節奏管理）。",
      "- 若需要假設，請明說你在假設什麼。",
      "",
      "【結論層（加分項；要『敢講』但要有護欄）】",
      "- 結論不能只是重述技術分析；必須把分析翻成生活語言，提出 3–6 個最可能的現實情境/原因。",
      "- 主動排序：指出最可能的 1–2 個，並簡述為何更像。",
      "",
      "【未來情境描繪（必做；畫面感）】",
      "- 在結論最後，以『本次選定的時間範圍』為基準，用 1–2 個短段落描繪接下來可能會看到的生活畫面。",
      "- 至少給兩個對照畫面：維持現狀 vs 從最可能的可調整點下手。",
      "- 使用『很可能會看到…』『多半會演變成…』語氣，提醒這是推演不是預言。",
      "",
      "【延續性】",
      "- 追問要延續前文，不要自相矛盾；若因模式/目標已變更，需明確指出『基準已更新』。",
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
              "Context packet（紫微結構化資料；含時間錨點）。請以此為唯一事實來源：\n\n" +
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
      return {
        statusCode: resp.status,
        headers: baseHeaders,
        body: JSON.stringify({ error: "OpenAI error", detail: raw }),
      };
    }

    const data = JSON.parse(raw);

    // ✅ Robustly extract assistant text
    function extractOutputText(d) {
      if (typeof d?.output_text === "string" && d.output_text.trim()) {
        return d.output_text.trim();
      }

      const out = d?.output;
      if (!Array.isArray(out)) return "";

      const chunks = [];

      for (const item of out) {
        if (item?.type === "message" && Array.isArray(item?.content)) {
          for (const c of item.content) {
            if (c?.type === "output_text" && typeof c.text === "string") {
              chunks.push(c.text);
              continue;
            }
            if (typeof c?.text === "string") chunks.push(c.text);
          }
        }

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
      headers: baseHeaders,
      body: JSON.stringify({
        error: "Unhandled server error",
        message: err?.message || String(err),
      }),
    };
  }
}
