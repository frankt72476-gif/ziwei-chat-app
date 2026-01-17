const APP_VERSION = "v1.0";

import "./style.css";
import { astro } from "iztro";
import logoUrl from "./assets/ziwei-logo.png";

/**
 * Logo handling (robust)
 * - We set src AFTER innerHTML exists.
 * - Also compute a URL() fallback for bundlers that behave oddly.
 */
const logoHref = new URL("./assets/ziwei-logo.png", import.meta.url).href;

/* ========= Storage ========= */
const KEY = "zw_profiles";
const loadProfiles = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const saveProfiles = (p) => localStorage.setItem(KEY, JSON.stringify(p));

/* ========= Date helpers (FIX: timezone / lunar boundary issues) ========= */
function makeSafeLocalNoonDateFromYMD(ymdStr) {
  const [y, m, d] = String(ymdStr).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
function makeSafeLocalNoonDateFromYM(ymStr) {
  const [y, m] = String(ymStr).split("-").map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, 15, 12, 0, 0, 0);
}
function parseYMD(s) {
  const [yy, mm, dd] = String(s).split("-").map(Number);
  if (!yy || !mm || !dd) return null;
  return new Date(yy, mm - 1, dd);
}
function addYears(dateObj, years) {
  const d = new Date(dateObj);
  d.setFullYear(d.getFullYear() + years);
  return d;
}
function ymd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function getSelectedMode() {
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : "life";
}

/* ========= Helpers ========= */
const palaceName = (h, i) => h?.palaceNames?.[i] || `宮位#${i}`;
const flowByPalace = (h) =>
  (h?.stars || []).map((arr, i) => ({
    palaceIndex: i,
    palaceName: palaceName(h, i),
    stars: (arr || []).map((s) => s.name),
  }));

/* ========= Natal stars ========= */
function natalAllStars(astrolabe) {
  return astrolabe.palaces.map((p) => ({
    palaceIndex: p.index,
    palaceName: p.name,
    major: (p.majorStars || []).map((s) => s.name),
    minor: (p.minorStars || []).map((s) => s.name),
    adjective: (p.adjectiveStars || []).map((s) => s.name),
  }));
}
function fmtStarsLine(title, items) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  return `${title}：${list.join("、")}`;
}
function prettyNatalStars(natalStarsAll) {
  return natalStarsAll
    .map((p) => {
      const major = fmtStarsLine("主", p.major);
      const minor = fmtStarsLine("辅/煞", p.minor);
      const adj = fmtStarsLine("杂", p.adjective);
      const parts = [major, minor, adj].filter(Boolean).join(" ｜ ");
      return `${p.palaceName}：${parts || "（無）"}`;
    })
    .join("\n");
}
function natalMajorStars(astrolabe) {
  return astrolabe.palaces.map((p) => ({
    palaceIndex: p.index,
    palaceName: p.name,
    majorStars: (p.majorStars || []).map((s) => s.name),
  }));
}
function prettyFlowStarsByPalace(flowArr, label) {
  return (
    flowArr
      .filter((p) => (p.stars || []).length)
      .map((p) => `${p.palaceName}：${p.stars.join("、")}`)
      .join("\n") || `（${label}：無流耀）`
  );
}

/* ========= 四化 flights ========= */
function mutagenFlightsFromPalace(palace) {
  const targets = palace?.mutagedPlaces?.() || [];
  if (Array.isArray(targets) && targets.length && targets[0]?.name) {
    return {
      禄: targets[0]?.name || "（無）",
      权: targets[1]?.name || "（無）",
      科: targets[2]?.name || "（無）",
      忌: targets[3]?.name || "（無）",
    };
  }
  return { 禄: "（無）", 权: "（無）", 科: "（無）", 忌: "（無）" };
}
function natalMutagenFlights(astrolabe) {
  const palaceNames = (astrolabe?.palaces || []).map((p) => p.name);
  return palaceNames.map((name) => {
    const p = astrolabe.palace(name);
    return { palace: name, flies: mutagenFlightsFromPalace(p) };
  });
}
function scopeMutagenFlights(horoscope, scope, palaceNames) {
  if (!palaceNames || !palaceNames.length) return null;
  return palaceNames.map((name) => {
    const p = horoscope.palace(name, scope);
    return { palace: name, flies: mutagenFlightsFromPalace(p) };
  });
}
function prettyMutagenFlights(rows, title) {
  if (!rows) return `（${title}：無資料）`;
  if (!Array.isArray(rows)) return `（${title}：非陣列）\n${JSON.stringify(rows, null, 2)}`;
  return rows
    .map((r) => {
      const f = r.flies || {};
      return `${r.palace}：禄→${f["禄"]}  权→${f["权"]}  科→${f["科"]}  忌→${f["忌"]}`;
    })
    .join("\n");
}

/* ========= Palace utilities ========= */
function mod12(n) {
  return ((n % 12) + 12) % 12;
}
function threeFourIndices(i) {
  const opp = mod12(i + 6);
  const a = mod12(i + 4);
  const b = mod12(i + 8);
  return [i, opp, a, b];
}
function palaceNameByNatalIndex(astrolabe, idx) {
  return astrolabe?.palaces?.[idx]?.name || `宮位#${idx}`;
}

/* ========= Correct “落在哪一宮” helpers ========= */
function scopeMingPalaceIndex(h, scope) {
  const idx = Number(h?.[scope]?.index);
  return Number.isFinite(idx) ? idx : null;
}
function scopeMingPalaceName(astrolabe, h, scope) {
  const idx = scopeMingPalaceIndex(h, scope);
  if (idx === null) return "N/A";
  return palaceNameByNatalIndex(astrolabe, idx);
}

/* ========= Focus extraction ========= */
function extractFocusedPalacesFromMut(rows) {
  const s = new Set();
  if (!Array.isArray(rows)) return s;

  for (const r of rows) {
    if (r?.palace) s.add(r.palace);
    const f = r?.flies || {};
    for (const k of ["禄", "权", "科", "忌"]) {
      const v = f[k];
      if (v && v !== "（無）") s.add(v);
    }
  }
  return s;
}

/* ========= Incoming Top receivers ========= */
function computeIncomingTop(rows) {
  if (!Array.isArray(rows)) return [];
  const cnt = new Map();
  for (const r of rows) {
    const f = r?.flies || {};
    for (const k of ["禄", "权", "科", "忌"]) {
      const v = f[k];
      if (!v || v === "（無）") continue;
      cnt.set(v, (cnt.get(v) || 0) + 1);
    }
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]);
}
function prettyIncomingTopLine(prefix, rows) {
  const top = computeIncomingTop(rows);
  if (!top.length) return `${prefix}：（無）`;
  return `${prefix}：${top.slice(0, 8).map(([k, v]) => `${k}(${v})`).join("、")}`;
}

/* ========= 四化星名：只讀 iztro scope.mutagen（不推天干、不猜） ========= */
function getScopeMutagenList(h, scope) {
  const list = h?.[scope]?.mutagen;
  if (!Array.isArray(list) || list.length < 4) return null;
  return [String(list[0]), String(list[1]), String(list[2]), String(list[3])]; // [禄,权,科,忌]
}
function findStarPalace(natalStarsAll, starName) {
  for (const p of natalStarsAll) {
    const all = [...(p.major || []), ...(p.minor || []), ...(p.adjective || [])];
    if (all.includes(starName)) return p.palaceName;
  }
  return "（未找到）";
}
function prettyMutagenStarNames(title, mutagenList, natalStarsAll) {
  if (!mutagenList) return `（${title}：天干/四化星名取不到 → 不顯示四化星名）`;
  const [l, q, k, j] = mutagenList;
  return [
    `禄：${l}（落${findStarPalace(natalStarsAll, l)}）`,
    `权：${q}（落${findStarPalace(natalStarsAll, q)}）`,
    `科：${k}（落${findStarPalace(natalStarsAll, k)}）`,
    `忌：${j}（落${findStarPalace(natalStarsAll, j)}）`,
  ].join("\n");
}

/* ========= 自化 ========= */
function selfMutagenMarks(rows, title = "自化", starNameHintText = null) {
  // starNameHintText is unused now; we keep signature minimal and stable
  if (!Array.isArray(rows)) return `（${title}：無資料）`;

  const out = [];
  for (const r of rows) {
    const f = r?.flies || {};
    const self = [];
    if (f["禄"] === r.palace) self.push("自化禄");
    if (f["权"] === r.palace) self.push("自化权");
    if (f["科"] === r.palace) self.push("自化科");
    if (f["忌"] === r.palace) self.push("自化忌");
    if (!self.length) continue;

    out.push(`${r.palace}：${self.join("、")}`);
  }

  return out.length ? out.join("\n") : `（${title}：無自化）`;
}

/* ========= Overlay narrative (minimal, correct) ========= */
function overlayNarrativeNatalToScope(astrolabe, horoscope, scope, scopeRows) {
  const idx = Number(horoscope?.[scope]?.index);
  const ming = Number.isFinite(idx) ? palaceNameByNatalIndex(astrolabe, idx) : "N/A";
  const tfNames = Number.isFinite(idx)
    ? threeFourIndices(idx).map((j) => palaceNameByNatalIndex(astrolabe, j))
    : [];

  const focusFromMut = Array.from(extractFocusedPalacesFromMut(scopeRows));
  const focus = Array.from(new Set([...tfNames, ...focusFromMut]));

  return [
    `【本命 → ${scope}】`,
    `此層命宫落點：${ming}`,
    `命宫三方四正：${tfNames.length ? tfNames.join("、") : "（無）"}`,
    `此層四化/焦點宮位（合併）：${focus.length ? focus.join("、") : "（無）"}`,
  ].join("\n");
}

/* ========= Decadal helpers ========= */
function getDecadalRangeFromPalace(pal) {
  const r = pal?.decadal?.range;
  if (!Array.isArray(r) || r.length < 2) return null;

  const startAge = Math.trunc(Number(r[0]));
  const endAge = Math.trunc(Number(r[1]));
  if (!Number.isFinite(startAge) || !Number.isFinite(endAge)) return null;
  if (startAge < 0 || endAge < 0 || endAge < startAge) return null;

  return [startAge, endAge];
}
function buildDecadalOptionsFromAstrolabe(astrolabe, birthDateStr, selectEl) {
  const birth = parseYMD(birthDateStr);
  if (!birth) {
    selectEl.innerHTML = `<option value="">(invalid birth date)</option>`;
    return;
  }

  selectEl.innerHTML = "";

  const pals = astrolabe?.palaces || [];
  pals.forEach((pal, i) => {
    const r = getDecadalRangeFromPalace(pal);
    if (!r) return;

    const [startAge, endAge] = r;
    const rep = addYears(birth, Math.max(0, startAge - 1));
    const repStr = ymd(rep);

    const opt = document.createElement("option");
    opt.value = String(i);
    const pname = pal?.name || `宮位#${i}`;

    opt.textContent = `${startAge}–${endAge}｜${pname}`;
    opt.dataset.date = repStr;
    opt.dataset.startAge = String(startAge);
    opt.dataset.endAge = String(endAge);

    selectEl.appendChild(opt);
  });

  if (!selectEl.options.length) {
    const sample = astrolabe?.palaces?.[0];
    const keys = sample ? Object.keys(sample) : [];
    selectEl.innerHTML = `<option value="">
(no decadal data found;
palace[0].decadal=${JSON.stringify(sample?.decadal)};
keys: ${keys.slice(0, 20).join(", ")})
</option>`;
  }
}
function buildYearOptions(profile, yearsForward = 80) {
  const dob = parseYMD(profile.date);
  if (!dob) return [];

  const birthYear = dob.getFullYear();
  const start = birthYear;
  const end = birthYear + yearsForward;

  const out = [];
  for (let y = start; y <= end; y++) {
    const age = y - birthYear;
    out.push({
      year: y,
      label: `Age ${age} (${y})`,
      date: `${y}-${String(dob.getMonth() + 1).padStart(2, "0")}-${String(dob.getDate()).padStart(2, "0")}`,
    });
  }
  return out;
}

/* ========= 格局判定：本地規則集（約 20 個高頻/高impact） =========
   註：這是「程式規則版」— 只在條件明確時輸出。
*/
function palaceObjByName(astrolabe, name) {
  return (astrolabe?.palaces || []).find((p) => p?.name === name) || null;
}
function hasMajor(palObj, star) {
  return (palObj?.majorStars || []).some((s) => s?.name === star);
}
function majorSetInPalaces(astrolabe, palaceNames) {
  const s = new Set();
  for (const pn of palaceNames) {
    const p = palaceObjByName(astrolabe, pn);
    for (const st of p?.majorStars || []) s.add(st.name);
  }
  return s;
}
function minorSetInPalaces(astrolabe, palaceNames) {
  const s = new Set();
  for (const pn of palaceNames) {
    const p = palaceObjByName(astrolabe, pn);
    for (const st of p?.minorStars || []) s.add(st.name);
  }
  return s;
}
function adjSetInPalaces(astrolabe, palaceNames) {
  const s = new Set();
  for (const pn of palaceNames) {
    const p = palaceObjByName(astrolabe, pn);
    for (const st of p?.adjectiveStars || []) s.add(st.name);
  }
  return s;
}
function getNatalMingIndex(astrolabe) {
  return (astrolabe?.palaces || []).findIndex((p) => p?.name === "命宫");
}
function tfNamesByIndex(astrolabe, idx) {
  if (!Number.isFinite(idx) || idx < 0) return [];
  return threeFourIndices(idx).map((j) => palaceNameByNatalIndex(astrolabe, j));
}

function detectPatterns({
  layerLabel,
  astrolabe,
  natalStarsAll,
  tfPalaceNames,
  mutagenList, // [禄,权,科,忌] or null
}) {
  const out = [];

  const maj = majorSetInPalaces(astrolabe, tfPalaceNames);
  const min = minorSetInPalaces(astrolabe, tfPalaceNames);
  const adj = adjSetInPalaces(astrolabe, tfPalaceNames);

  const hasAll = (...stars) => stars.every((x) => maj.has(x));
  const hasAny = (...stars) => stars.some((x) => maj.has(x));
  const hasMinorAny = (...stars) => stars.some((x) => min.has(x));
  const hasAdjAny = (...stars) => stars.some((x) => adj.has(x));

  // 1) 三奇嘉會：命三方四正內 會集 化祿/化權/化科
  if (mutagenList) {
    const [l, q, k] = mutagenList;
    const palL = findStarPalace(natalStarsAll, l);
    const palQ = findStarPalace(natalStarsAll, q);
    const palK = findStarPalace(natalStarsAll, k);
    const ok = [palL, palQ, palK].every((pn) => tfPalaceNames.includes(pn));
    if (ok) out.push(`三奇嘉會（禄=${l}落${palL}；权=${q}落${palQ}；科=${k}落${palK}）`);
  }

  // 2) 紫府同宮（簡化）：紫微+天府 同宮坐命（多數說法寅申更佳；此處只做“同宮坐命”）
  {
    const ming = palaceObjByName(astrolabe, "命宫");
    if (hasMajor(ming, "紫微") && hasMajor(ming, "天府")) out.push("紫府同宮（紫微天府同坐命宮）");
  }

  // 3) 機月同梁（程式版）：天機/太陰/天同/天梁 四星皆在命三方四正
  if (hasAll("天机", "太阴", "天同", "天梁")) out.push("機月同梁（四星齊會命三方四正）");

  // 4) 文星拱命：文昌/文曲 在命三方四正（通常看昌曲會命）
  if (hasMinorAny("文昌", "文曲") || hasAny("文昌", "文曲")) out.push("文星拱命（昌/曲會命三方四正）");

  // 5) 左右拱命：左輔/右弼 在命三方四正
  if (hasMinorAny("左辅", "右弼") || hasAny("左辅", "右弼")) {
    if ((min.has("左辅") || maj.has("左辅")) && (min.has("右弼") || maj.has("右弼"))) out.push("左右拱命（左輔右弼齊會）");
    else out.push("左右拱命（左/右之一會命）");
  }

  // 6) 魁鉞拱命：天魁/天鉞 在命三方四正
  if (hasMinorAny("天魁", "天钺") || hasAny("天魁", "天钺")) {
    if ((min.has("天魁") || maj.has("天魁")) && (min.has("天钺") || maj.has("天钺"))) out.push("魁鉞拱命（天魁天鉞齊會）");
    else out.push("魁鉞拱命（魁/鉞之一會命）");
  }

  // 7) 祿馬交馳（程式提醒版）：祿存 + 天马 同在命三方四正
  if ((min.has("禄存") || maj.has("禄存")) && (min.has("天马") || maj.has("天马"))) out.push("祿馬交馳（祿存+天馬會命三方四正）");

  // 8) 火貪 / 鈴貪（程式版）：貪狼同宮遇火星/鈴星（檢查全盤每宮）
  {
    const pals = astrolabe?.palaces || [];
    for (const p of pals) {
      const hasTan = (p?.majorStars || []).some((s) => s.name === "贪狼");
      if (!hasTan) continue;
      const hasHuo = (p?.minorStars || []).some((s) => s.name === "火星") || (p?.adjectiveStars || []).some((s) => s.name === "火星");
      const hasLing = (p?.minorStars || []).some((s) => s.name === "铃星") || (p?.adjectiveStars || []).some((s) => s.name === "铃星");
      if (hasHuo) out.push(`火貪（貪狼同宮遇火星：${p.name}）`);
      if (hasLing) out.push(`鈴貪（貪狼同宮遇鈴星：${p.name}）`);
    }
  }

  // 9) 化忌入命/官/財/遷（規則提醒）：忌落這幾個宮
  if (mutagenList) {
    const [, , , j] = mutagenList;
    const palJ = findStarPalace(natalStarsAll, j);
    if (["命宫", "官禄", "财帛", "迁移"].includes(palJ)) out.push(`化忌重點（忌=${j}落${palJ}）`);
  }

  // 10) 雙祿（提醒版）：禄存 + 化禄 同在命三方四正（需 mutagenList）
  if (mutagenList) {
    const [l] = mutagenList;
    const palL = findStarPalace(natalStarsAll, l);
    const hasLuCun = min.has("禄存") || maj.has("禄存");
    if (hasLuCun && tfPalaceNames.includes(palL)) out.push(`雙祿（祿存會化祿：化禄=${l}落${palL}）`);
  }

  // 11) 日月同照（簡化）：太陽+太陰 都在命三方四正
  if (hasAll("太阳", "太阴")) out.push("日月同照（太陽太陰同會命三方四正）");

  // 12) 紫微系提醒：紫微會命三方四正
  if (maj.has("紫微")) out.push("紫微入局（紫微會命三方四正）");

  // 13) 天府系提醒：天府會命三方四正
  if (maj.has("天府")) out.push("天府入局（天府會命三方四正）");

  // 14) 殺破狼提醒：七殺/破軍/貪狼 會命三方四正
  {
    const sp = ["七杀", "破军", "贪狼"].filter((x) => maj.has(x));
    if (sp.length >= 2) out.push(`殺破狼（${sp.join("、")}會命三方四正）`);
    else if (sp.length === 1) out.push(`殺系入局（${sp[0]}會命三方四正）`);
  }

  // 15) 昌曲齊會（提醒版）
  if ((min.has("文昌") || maj.has("文昌")) && (min.has("文曲") || maj.has("文曲"))) out.push("昌曲齊會（文昌文曲同會）");

  // 16) 左右魁鉞齊（提醒版）
  {
    const l = min.has("左辅") || maj.has("左辅");
    const r = min.has("右弼") || maj.has("右弼");
    const k = min.has("天魁") || maj.has("天魁");
    const y = min.has("天钺") || maj.has("天钺");
    if (l && r && (k || y)) out.push("左右魁鉞（左右+魁/鉞加會）");
  }

  // 17) 空劫沖破（提醒版）
  {
    const hasKong = hasMinorAny("地空") || hasAdjAny("天空");
    const hasJie = hasMinorAny("地劫");
    if (hasKong && hasJie) out.push("空劫同會（地空/天空 + 地劫）");
    else if (hasKong) out.push("見空（地空/天空會命三方四正）");
    else if (hasJie) out.push("見劫（地劫會命三方四正）");
  }

  // 18) 羊陀火鈴（提醒版）
  {
    const sha = ["擎羊", "陀罗", "火星", "铃星"].filter((x) => min.has(x) || maj.has(x) || adj.has(x));
    if (sha.length >= 2) out.push(`煞曜夾/會（${sha.slice(0, 4).join("、")}）`);
  }

  // 19) 化祿入財（提醒版）
  if (mutagenList) {
    const [l] = mutagenList;
    const palL = findStarPalace(natalStarsAll, l);
    if (palL === "财帛") out.push(`化祿入財（禄=${l}落财帛）`);
  }

  // 20) 化權入官（提醒版）
  if (mutagenList) {
    const [, q] = mutagenList;
    const palQ = findStarPalace(natalStarsAll, q);
    if (palQ === "官禄") out.push(`化權入官（权=${q}落官禄）`);
  }

  // De-dup
  const uniq = Array.from(new Set(out));
  return uniq.map((s) => `${layerLabel}｜${s}`);
}
function prettyPatterns(title, patterns, max = 10) {
  if (!patterns || !patterns.length) return `（${title}：未匹配；或此層未啟用格局判定）`;
  const shown = patterns.slice(0, max);
  const rest = patterns.length - shown.length;
  const body = shown.map((x) => `- ${x}`).join("\n");
  return rest > 0 ? `${body}\n（其餘 ${rest} 項略）` : body;
}

/* ========= UI (Mobile-first + Steps + Tabs) ========= */
document.querySelector("#app").innerHTML = `
<style>
  :root{
    --bg:#0b0c10;
    --panel:#161820;
    --panel2:#10121a;
    --ink:#eee;
    --muted:rgba(255,255,255,0.72);
    --border:rgba(255,255,255,0.10);
    --border2:rgba(255,255,255,0.14);
    --btn:#2b2f3a;
    --good:#22c55e;
    --chat-primary: #8f7cff;          /* main purple */
    --chat-primary-bg: rgba(143,124,255,0.18);
    --chat-primary-border: rgba(143,124,255,0.45);

  }

  .wrap{
    position:relative;
    width:min(980px, 100%);
    margin:10px auto;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
    color:var(--ink);
    background:var(--bg);
    border:1px solid rgba(255,255,255,0.08);
    border-radius:16px;
    overflow:hidden;
    box-shadow: 0 16px 40px rgba(0,0,0,0.45);
  }

  /* Mobile: edge-to-edge feel */
  @media (max-width: 520px){
    .wrap{
      margin:0;
      border-radius:0;
      border-left:none; border-right:none;
      min-height:100vh;
    }
  }

  .bgGlow{
    position:absolute; inset:0;
    background:
      radial-gradient(circle at 20% 30%, rgba(140,120,255,0.18), rgba(0,0,0,0) 45%),
      radial-gradient(circle at 75% 20%, rgba(255,190,90,0.12), rgba(0,0,0,0) 42%),
      radial-gradient(circle at 70% 75%, rgba(90,220,255,0.12), rgba(0,0,0,0) 45%),
      linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.00));
    pointer-events:none;
  }
  .watermark{
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    transform:rotate(-14deg);
    opacity:0.05;
    font-weight:800;
    letter-spacing:10px;
    font-size:min(72px, 12vw);
    color:#fff;
    pointer-events:none;
    user-select:none;
  }

  .inner{ position:relative; padding:14px; }
  @media (min-width: 640px){ .inner{ padding:18px; } }

  .header{
    display:flex; gap:12px; align-items:center; margin-bottom:8px;
  }
  .logo{
    width:52px; height:52px;
    border-radius:14px;
    object-fit:contain;
    padding:6px;
    background:#0f1117;
    border:1px solid rgba(255,255,255,0.10);
    box-shadow: 0 10px 24px rgba(0,0,0,0.35);
    display:block;
    flex:0 0 auto;
  }
  .hTitle{ margin:0; font-size:22px; color:#fff; }
  .hSub{ margin:4px 0 0 0; color:rgba(255,255,255,0.75); font-size:13px; }

  .stepTitleRow{
    display:flex; align-items:center; gap:10px;
    margin:52px 0 10px 0;
  }
  @media (min-width: 640px){
    .stepTitleRow{ margin-top:60px; }
  }
  .stepBadge{
    width:28px; height:28px;
    border-radius:999px;
    display:inline-flex;
    align-items:center; justify-content:center;
    background: rgba(34,197,94,0.12);
    border: 2px solid var(--good);
    color: #d1fae5;
    font-weight:900;
    flex:0 0 auto;
  }
  .stepTitle{
    margin:0;
    font-size:16px;
    color:#fff;
    font-weight:900;
    letter-spacing:0.2px;
  }

  .panel{
    padding:12px;
    border:1px solid var(--border);
    border-radius:12px;
    background:var(--panel);
  }

  .label{
    display:block;
    font-weight:800;
    margin-bottom:6px;
    color:#fff;
    font-size:13px;
  }

  input, select, textarea, button{
    font-family:inherit;
    font-size:16px; /* iOS: prevent zoom on focus */
  }

  .field{
    width:100%;
    background:#0f1117;
    color:#eee;
    border:1px solid var(--border);
    border-radius:12px;
    padding:11px 12px;
    }
  select.field{
    background:#12141b;
  }

  /* Make Label + Birthday shorter (not full width) */
  #label, #date {
    width: 96%;
    margin-right: auto;
  }
@media (max-width: 520px){
  #label, #date {
    width: 91%;
    margin-right: auto;
  }
}

  .row2{
    display:grid;
    grid-template-columns: 1fr;
    gap:10px;
  }
  .row3{
    display:grid;
    grid-template-columns: 1fr 1fr 120px;
    gap:10px;
    align-items:end;
    margin-top:10px;
  }
  @media (max-width: 520px){
    .row2{ grid-template-columns: 1fr; }
    .row3{ grid-template-columns: 1fr; }
  }

  .saveBtn{
    width:100%;
    background: var(--btn);
    color:#fff;
    border:1px solid rgba(255,255,255,0.12);
    border-radius:12px;
    padding:11px 12px;
    cursor:pointer;
    font-weight:800;
  }

  .divider{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:12px;
    margin:6px 0;
    color:rgba(255,255,255,0.65);
    font-weight:900;
    letter-spacing:2px;
  }
  .dividerLine{
    height:1px; flex:1; background:rgba(255,255,255,0.10)
  }

  .pickWrap{
    position:relative;
    width:100%;
  }
  .deleteBtn{
    position:absolute;
    right:6px;
    bottom:6px;
    padding:7px 10px;
    border-radius:10px;
    border:1px solid #444;
    background:#222;
    color:#bbb;
    cursor:not-allowed;
    font-size:12px;
    font-weight:800;
  }

  .hint{
    margin-top:8px;
    color:rgba(255,255,255,0.68);
    font-size:12px;
    line-height:1.35;
  }

/* Tabs */
.tabs{
  display:flex;
  gap:8px;
  margin-top:10px;
}
.tabBtn{
  flex:1;
  padding:10px 12px;
  border-radius:999px;
  border:1px solid var(--border2);
  background:#0f1117;
  color:rgba(255,255,255,0.80);
  font-weight:900;
  cursor:pointer;
}
.tabBtn.active{
  background: rgba(140,120,255,0.14);
  border-color: rgba(140,120,255,0.32);
  color:#fff;
}
/* ===================== */
/* Primary Chat Tab      */
/* ===================== */

.tabBtn.chatPrimary {
  background: rgba(143,124,255,0.22);
  border-color: rgba(143,124,255,0.55);
  color: #ffffff;
  box-shadow:
    0 0 0 1px rgba(143,124,255,0.35),
    0 6px 18px rgba(143,124,255,0.25);
  font-weight: 900;
}

.tabBtn.chatPrimary:hover {
  background: rgba(143,124,255,0.32);
  border-color: rgba(143,124,255,0.75);
}

.tabBtn.chatPrimary.active {
  background: rgba(143,124,255,0.38);
  border-color: rgba(143,124,255,0.9);
  box-shadow:
    0 0 0 1px rgba(143,124,255,0.6),
    0 8px 22px rgba(143,124,255,0.35);
}
/* ===================== */
/* Chat layout & bubbles */
/* ===================== */

#paneChat {
  text-align: left;
}

.chatLog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;   /* prevents centering */
  text-align: left;
}

.chatBubble {
  max-width: 92%;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: #0f1117;
  line-height: 1.35;
  white-space: pre-wrap;
  text-align: left;
}

.chatBubble.user {
  margin-left: auto;
}

.chatBubble.assistant {
  margin-right: auto;
}
.chatRow{
  display:flex;
}
.chatRow.user{ justify-content:flex-end; }
.chatRow.assistant{ justify-content:flex-start; }

.chatMeta{
  font-size:12px;
  opacity:0.75;
  font-weight:900;
  margin-bottom:6px;
}
.chatText{
  white-space:pre-wrap;
}


  .tabPane{
    margin-top:10px;
  }

  .copyRow{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    margin-top:10px;
  }
  .copyBtn{
    background: var(--btn);
    color:#fff;
    border:1px solid rgba(255,255,255,0.12);
    border-radius:12px;
    padding:11px 14px;
    cursor:pointer;
    font-weight:900;
    width:100%;
  }
  @media (min-width: 640px){
    .copyBtn{ width:auto; }
  }

  pre{
    white-space:pre-wrap;
    border:1px solid var(--border);
    border-radius:12px;
    background:var(--panel2);
    color:#eee;
    padding:12px;
    margin-top:10px;
    font-size:13px;
    line-height:1.35;
  }

  /* Confirm modal + toast unchanged */
</style>

<div class="wrap">
  <div class="bgGlow" aria-hidden="true"></div>
  <div class="watermark" aria-hidden="true">紫微斗數</div>

  <div class="inner">
    <div class="header">
      <img id="appLogo" class="logo" alt="紫微斗數" />
      <div>
        <h2 class="hTitle">紫微斗數排盤</h2>
        <p class="hSub">結構化摘要（貼給 ChatGPT）</p>
      </div>
    </div>

    <!-- STEP 1 -->
    <div class="stepTitleRow">
      <span class="stepBadge">1</span>
      <h3 class="stepTitle">命主</h3>
    </div>

    <div style="display:flex; flex-direction:column; gap:12px">
      <div>
        <label class="label">選擇命主資料</label>
        <div class="pickWrap">
          <select id="pick" class="field" style="padding-right:94px"></select>
          <button id="deletePick" class="deleteBtn" disabled>Delete</button>
        </div>
      </div>

      <div class="divider">
        <div class="dividerLine"></div>
        <div style="font-size:16px">OR</div>
        <div class="dividerLine"></div>
      </div>

      <div class="panel">
        <div style="font-weight:900; margin-bottom:10px; color:#fff">建立新命主資料</div>

        <div class="row2">
          <input id="label" class="field" placeholder="Label (e.g. Son)" />
          <input id="date" class="field" placeholder="YYYY-MM-DD" />
        </div>

        <div class="row3">
          <select id="shichen" class="field">
            <option value="0">子 (23:00–00:59)</option>
            <option value="1">丑 (01:00–02:59)</option>
            <option value="2">寅 (03:00–04:59)</option>
            <option value="3">卯 (05:00–06:59)</option>
            <option value="4">辰 (07:00–08:59)</option>
            <option value="5">巳 (09:00–10:59)</option>
            <option value="6">午 (11:00–12:59)</option>
            <option value="7">未 (13:00–14:59)</option>
            <option value="8">申 (15:00–16:59)</option>
            <option value="9">酉 (17:00–18:59)</option>
            <option value="10">戌 (19:00–20:59)</option>
            <option value="11">亥 (21:00–22:59)</option>
          </select>

          <select id="gender" class="field">
            <option value="male">male</option>
            <option value="female">female</option>
          </select>

          <button id="save" class="saveBtn">Save</button>
        </div>

        <div class="hint">
          (確認命主資料正確 - Make sure desired profile is shown in the 選擇命主資料 dropdown menu.  If not, please reselect)
        </div>
      </div>
    </div>

    <!-- STEP 2 -->
    <div class="stepTitleRow">
      <span class="stepBadge">2</span>
      <h3 class="stepTitle">選擇分析時間範圍</h3>
    </div>

    <div class="panel">
      <label style="display:flex; align-items:center; justify-content:flex-start; gap:10px; margin:8px 0; font-weight:700">

        <input type="radio" name="mode" value="life" checked />
        Option 1: 人生整體運勢
      </label>
      <label style="display:flex; align-items:center; justify-content:flex-start; gap:10px; margin:8px 0; font-weight:700">

        <input type="radio" name="mode" value="decadal" />
        Option 2: 大限
      </label>
      <label style="display:flex; align-items:center; justify-content:flex-start; gap:10px; margin:8px 0; font-weight:700">

        <input type="radio" name="mode" value="year" />
        Option 3: 流年
      </label>
      <label style="display:flex; align-items:center; justify-content:flex-start; gap:10px; margin:8px 0; font-weight:700">

        <input type="radio" name="mode" value="month" />
        Option 4: 流月
      </label>
      <label style="display:flex; align-items:center; justify-content:flex-start; gap:10px; margin:8px 0; font-weight:700">

        <input type="radio" name="mode" value="date" />
        Option 5: 流日
      </label>
    </div>

    <div id="row-decadal" style="display:none;margin:10px 0">
      <label class="label">Choose 大限</label>
      <select id="decadalPick" class="field"></select>
    </div>

    <div id="row-year" style="display:none;margin:10px 0">
      <label class="label">Choose 流年</label>
      <select id="yearPick" class="field"></select>
    </div>

    <div id="row-month" style="display:none;margin:10px 0">
      <label class="label">Choose 流月 (YYYY-MM)</label>
      <input id="month" class="field" placeholder="YYYY-MM" />
    </div>

    <div id="row-date" style="display:none;margin:10px 0">
      <label class="label">Choose 流日 (YYYY-MM-DD)</label>
      <input id="target" class="field" placeholder="YYYY-MM-DD" />
    </div>

    <!-- STEP 3 -->
    <div class="stepTitleRow">
      <span class="stepBadge">3</span>
      <div>
        <h3 class="stepTitle" style="margin:0">What would you like to know</h3>
        <div style="margin-top:4px; color:rgba(255,255,255,0.75); font-size:13px">
          你想了解什麼？
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button id="tabChat" class="tabBtn chatPrimary active" type="button">Chat</button>
      <button id="tabData" class="tabBtn" type="button">Data</button>
    </div>

<!-- Chat Tab -->
<div id="paneChat" class="tabPane">

  <!-- Context (still used by your Data packet) -->
  
  <!-- Credit meter -->
  <div style="display:flex;justify-content:flex-end;margin-top:8px">
    <div id="creditMeter" style="
      font-size:12px;
      color:rgba(255,255,255,0.72);
      border:1px solid rgba(255,255,255,0.12);
      padding:6px 10px;
      border-radius:999px;
      background:#0f1117;
      font-weight:900;
    ">Credit: 0%</div>
  </div>
  
  <!-- Composer -->
  <div style="margin-top:10px; display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap">
    <textarea id="chatInput" rows="2" class="field" style="flex:1; min-width:220px"
      placeholder="Ask a question… (e.g., 這次比賽策略？/ 今年升學？/ 感情？)"></textarea>

    <button id="chatSend" class="saveBtn" style="width:auto; padding:11px 16px">Send</button>
    <button id="chatClear" class="saveBtn" style="width:auto; padding:11px 16px; background:#222; border-color:#444">Clear</button>
  </div>
  
  <!-- Chat log -->
  <div id="chatLog" style="
    margin-top:10px;
    border:1px solid rgba(255,255,255,0.10);
    background:#10121a;
    border-radius:12px;
    padding:10px;
    min-height:220px;
    max-height:48vh;
    overflow:auto;
    display:flex;
    flex-direction:column;
    gap:10px;
  "></div>

  <div id="chatStatus" class="hint" style="margin-top:8px">
    Tip: mode changes regenerate Data and will auto-refresh the last assistant reply.
  </div>
</div>


    <!-- Data Tab -->
    <div id="paneData" class="tabPane" style="display:none">
      <div class="copyRow">
        <button id="copy" class="copyBtn">Copy for ChatGPT</button>
      </div>

      <pre id="out"></pre>
    </div>
  </div>

  <!-- Confirm delete modal -->
  <div id="confirmModal" style="
    display:none;
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.65);
    align-items:center;
    justify-content:center;
    z-index:9999;
  ">
    <div style="
      width:min(520px, calc(100% - 24px));
      background:#111;
      border:1px solid #333;
      border-radius:14px;
      padding:18px;
      box-shadow:0 12px 40px rgba(0,0,0,0.6);
    ">
      <div style="font-size:16px;font-weight:900;margin-bottom:10px;color:#fff">
        Are you sure you want to delete the selected chart?
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button id="confirmNo" style="
          padding:10px 14px;border-radius:12px;border:1px solid #444;
          background:#222;color:#fff;cursor:pointer;font-weight:900
        ">No</button>

        <button id="confirmYes" style="
          padding:10px 14px;border-radius:12px;border:1px solid #7a2b2b;
          background:#5a1d1d;color:#fff;cursor:pointer;font-weight:900
        ">Yes</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" style="
    display:none;
    position:fixed;
    left:50%;
    bottom:24px;
    transform:translateX(-50%);
    background:#111;
    border:1px solid #333;
    color:#fff;
    padding:10px 14px;
    border-radius:999px;
    z-index:10000;
    box-shadow:0 10px 30px rgba(0,0,0,0.6);
    font-weight:900;
  ">Selected chart deleted!</div>
  <!-- Footer -->
  <div style="
    margin-top:16px;
    padding:10px 0;
    text-align:center;
    font-size:12px;
    color:rgba(255,255,255,0.55);
    border-top:1px solid rgba(255,255,255,0.08);
  ">
    Ziwei Helper · <span id="appVersion"></span>
  </div>

  </div>
`;

/**
 * IMPORTANT: Set logo src AFTER innerHTML exists.
 * Use import URL first, fallback to URL().href.
 */
const logoImg = document.getElementById("appLogo");
if (logoImg) {
  logoImg.src = logoUrl || logoHref;
  logoImg.onerror = () => {
    console.warn("Logo failed to load via import. Falling back to URL().");
    logoImg.onerror = null;
    logoImg.src = logoHref;
  };
}
const versionEl = document.getElementById("appVersion");
if (versionEl) versionEl.textContent = APP_VERSION;


/* ========= DOM ========= */
const out = document.getElementById("out");
const pick = document.getElementById("pick");
const deletePickBtn = document.getElementById("deletePick");
const confirmModal = document.getElementById("confirmModal");
const confirmYes = document.getElementById("confirmYes");
const confirmNo = document.getElementById("confirmNo");
const toast = document.getElementById("toast");

const label = document.getElementById("label");
const date = document.getElementById("date");
const gender = document.getElementById("gender");
const monthInput = document.getElementById("month");
const target = document.getElementById("target");
const decadalPick = document.getElementById("decadalPick");
const yearPick = document.getElementById("yearPick");
const rowDecadal = document.getElementById("row-decadal");
const rowYear = document.getElementById("row-year");
const rowMonth = document.getElementById("row-month");
const rowDate = document.getElementById("row-date");

const tabChat = document.getElementById("tabChat");
const tabData = document.getElementById("tabData");
const paneChat = document.getElementById("paneChat");
const paneData = document.getElementById("paneData");

let profiles = loadProfiles();
let lastPacket = "";
let toastTimer = null;
/* ========= Chat + Cost Tracking ========= */

// Local chat storage
const CHAT_KEY = "zw_chat_sessions_v1";
const COST_KEY = "zw_cost_v1";

function loadChatStore() {
  return JSON.parse(localStorage.getItem(CHAT_KEY) || "{}");
}
function saveChatStore(store) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(store));
}

function loadCost() {
  return JSON.parse(localStorage.getItem(COST_KEY) || '{"usd":0,"rollovers":0}');
}
function saveCost(c) {
  localStorage.setItem(COST_KEY, JSON.stringify(c));
}

// Pricing: update these if you want more accurate estimates.
// (Placeholders; safe defaults.)
const COST_PER_1M_INPUT = 0.20;   // USD per 1M input tokens (placeholder)
const COST_PER_1M_OUTPUT = 0.80;  // USD per 1M output tokens (placeholder)
const CREDIT_USD = 10.0;

// UI elems (exist after template render)
const chatLogEl = document.getElementById("chatLog");
const chatInputEl = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSend");
const chatClearBtn = document.getElementById("chatClear");
const chatStatusEl = document.getElementById("chatStatus");
const creditMeterEl = document.getElementById("creditMeter");

function currentSessionKey() {
  // Session is per: selected profile + mode + targetStr (so year/month/date changes become a new session)
  const idx = Number(pick.value);
  const p = Number.isFinite(idx) ? profiles[idx] : null;
  if (!p) return "no_profile";

  const mode = getSelectedMode();

  // Mirror your target selection logic
  let t = "";
  if (mode === "life") t = "life";
  else if (mode === "decadal") t = decadalPick?.selectedOptions?.[0]?.dataset?.date || "";
  else if (mode === "year") t = yearPick?.selectedOptions?.[0]?.dataset?.date || "";
  else if (mode === "month") t = (monthInput?.value || "").trim();
  else t = (target?.value || "").trim();

  return [
    "p",
    p.label, p.date, String(p.time), p.gender,
    "mode", mode,
    "t", t || "(unset)"
  ].join("|");
}

function getSessionMessages() {
  const store = loadChatStore();
  const key = currentSessionKey();
  return Array.isArray(store[key]) ? store[key] : [];
}

function setSessionMessages(msgs) {
  const store = loadChatStore();
  const key = currentSessionKey();
  store[key] = msgs;
  saveChatStore(store);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderChat() {
  if (!chatLogEl) return;
  const msgs = getSessionMessages();

  if (!msgs.length) {
    chatLogEl.className = "chatLog";
    chatLogEl.innerHTML = `<div style="color:rgba(255,255,255,0.65);font-size:13px">
      No messages yet. Ask something below.
    </div>`;
    return;
  }

  chatLogEl.className = "chatLog";

  chatLogEl.innerHTML = msgs
    .map((m) => {
      const isUser = m.role === "user";
      const label = isUser ? "You" : "Assistant";
      const roleClass = isUser ? "user" : "assistant";

      return `
        <div class="chatRow ${roleClass}">
          <div class="chatBubble ${roleClass}">
            <div class="chatMeta">${label}</div>
            <div class="chatText">${escapeHtml(m.content)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}


function setChatStatus(text) {
  if (chatStatusEl) chatStatusEl.textContent = text;
}

function updateCreditUI() {
  const c = loadCost();
  // rollovers simulate "rebill when cross $10"
  const spendThisCycle = c.usd % CREDIT_USD;
  const pct = Math.min(100, Math.round((spendThisCycle / CREDIT_USD) * 100));
  if (creditMeterEl) creditMeterEl.textContent = `Credit: ${pct}%`;
}

function addUsageCost(usage) {
  if (!usage || typeof usage !== "object") return;

  // Responses API usage can be: { input_tokens, output_tokens, total_tokens }
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);

  const usd =
    (inputTokens / 1_000_000) * COST_PER_1M_INPUT +
    (outputTokens / 1_000_000) * COST_PER_1M_OUTPUT;

  const c = loadCost();
  const before = c.usd || 0;
  const after = before + usd;

  // rollover counting (optional)
  const beforeCycles = Math.floor(before / CREDIT_USD);
  const afterCycles = Math.floor(after / CREDIT_USD);
  c.usd = after;
  c.rollovers = (c.rollovers || 0) + Math.max(0, afterCycles - beforeCycles);

  saveCost(c);
  updateCreditUI();
}

async function callGpt(messages) {
  const resp = await fetch("/.netlify/functions/openai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      contextPacket: lastPacket || "",
      messages,
    }),
  });

  const raw = await resp.text();

  // ✅ Better error extraction (shows the real reason)
  if (!resp.ok) {
    let msg = raw;
    try {
      const j = JSON.parse(raw);
      // prefer OpenAI detail; fallback to {error}
      msg = j?.detail
        ? (typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail))
        : (j?.error || raw);
    } catch {}
    throw new Error(msg);
  }

  const data = JSON.parse(raw);
  return data; // { text, usage }
}


// Send a user message and get assistant reply
let isSending = false;
async function sendChatMessage(userText) {
  if (isSending) return;
  const text = (userText || "").trim();
  if (!text) return;

  if (!lastPacket || !lastPacket.trim()) {
    setChatStatus("Please generate Data first: select a saved chart (Step 1).");
    setActiveTab("data");
    return;
  }

  isSending = true;
  setChatStatus("Sending…");

  const msgs = getSessionMessages();
  msgs.push({ role: "user", content: text });
  setSessionMessages(msgs);
  renderChat();

  try {
    const data = await callGpt(msgs);
    const reply = (data?.text || "").trim() || "(no response)";
    msgs.push({ role: "assistant", content: reply });
    setSessionMessages(msgs);
    renderChat();
    addUsageCost(data?.usage);
    setChatStatus("Done.");
  } catch (e) {
    setChatStatus("GPT call failed.");
    alert("GPT call failed:\n" + (e?.message || String(e)));
  } finally {
    isSending = false;
  }
}

// Auto-refresh last assistant reply when packet changes
let autoRefreshTimer = null;
async function autoRefreshLastAssistant() {
  if (isSending) return;

  const msgs = getSessionMessages();
  if (!msgs.length) return;

  // Need at least: user -> assistant (or just user)
  const lastUserIdx = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "user") return i;
    return -1;
  })();
  if (lastUserIdx < 0) return;

  // Recompute assistant answer to the last user message using updated packet,
  // replacing the last assistant message if it exists after that user turn.
  const cut = msgs.slice(0, lastUserIdx + 1);

  isSending = true;
  setChatStatus("Mode changed: refreshing answer with updated Data…");

  try {
    const data = await callGpt(cut);
    const reply = (data?.text || "").trim() || "(no response)";

    // If last message is assistant, replace it; else append.
    let newMsgs = msgs.slice();
    const lastIsAssistant = newMsgs.length && newMsgs[newMsgs.length - 1].role === "assistant";

    if (lastIsAssistant) {
      newMsgs[newMsgs.length - 1] = {
        role: "assistant",
        content: reply + "\n\n(Updated due to mode/target/context change)",
      };
    } else {
      newMsgs.push({
        role: "assistant",
        content: reply + "\n\n(Updated due to mode/target/context change)",
      });
    }

    setSessionMessages(newMsgs);
    renderChat();
    addUsageCost(data?.usage);
    setChatStatus("Updated.");
  } catch (e) {
    setChatStatus("Auto-refresh failed.");
    console.warn("Auto-refresh failed:", e);
  } finally {
    isSending = false;
  }
}

function scheduleAutoRefresh(ms = 250) {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  autoRefreshTimer = setTimeout(() => {
    autoRefreshLastAssistant();
  }, ms);
}

/* ===== ADD THIS RIGHT HERE (IMMEDIATELY AFTER scheduleAutoRefresh) ===== */

// Chat send / clear
chatSendBtn.onclick = () => {
  const text = (chatInputEl.value || "").trim();
  if (!text) return;
  chatInputEl.value = "";
  sendChatMessage(text);
};

chatClearBtn.onclick = () => {
  if (!confirm("Clear chat for this session?")) return;
  setSessionMessages([]);
  renderChat();
  setChatStatus("Cleared.");
};

// Enter to send (Shift+Enter = newline)
chatInputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatSendBtn.click();
  }
});

/* ========= Tabs ========= */
function setActiveTab(which) {
  const isChat = which === "chat";
  tabChat.classList.toggle("active", isChat);
  tabData.classList.toggle("active", !isChat);
  paneChat.style.display = isChat ? "block" : "none";
  paneData.style.display = isChat ? "none" : "block";
}
tabChat.onclick = () => setActiveTab("chat");
tabData.onclick = () => setActiveTab("data");

/* ========= Delete UI helpers ========= */
function setDeleteEnabled(enabled) {
  deletePickBtn.disabled = !enabled;

  if (enabled) {
    deletePickBtn.style.cursor = "pointer";
    deletePickBtn.style.color = "#fff";
    deletePickBtn.style.background = "#5a1d1d";
    deletePickBtn.style.borderColor = "#7a2b2b";
  } else {
    deletePickBtn.style.cursor = "not-allowed";
    deletePickBtn.style.color = "#bbb";
    deletePickBtn.style.background = "#222";
    deletePickBtn.style.borderColor = "#444";
  }
}
function openConfirmModal() {
  confirmModal.style.display = "flex";
}
function closeConfirmModal() {
  confirmModal.style.display = "none";
}
function showToast(msg, ms = 3000) {
  toast.textContent = msg;
  toast.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, ms);
}

/* ========= UI wiring ========= */
function refresh(selectIndex = null) {
  if (!profiles.length) {
    pick.innerHTML = `<option value="" selected>(No saved charts)</option>`;
    pick.value = "";
    setDeleteEnabled(false);
    return;
  }

  pick.innerHTML =
    `<option value="">(Select a saved chart)</option>` +
    profiles.map((p, i) => `<option value="${i}">${p.label} (${p.date}, t=${p.time})</option>`).join("");

  if (selectIndex !== null && Number.isFinite(selectIndex) && profiles[selectIndex]) {
    pick.value = String(selectIndex);
    pick.dispatchEvent(new Event("change"));
  } else {
    pick.value = "";
    setDeleteEnabled(false);
  }
}
function updateModeUI() {
  const mode = getSelectedMode();
  rowDecadal.style.display = mode === "decadal" ? "block" : "none";
  rowYear.style.display = mode === "year" ? "block" : "none";
  rowMonth.style.display = mode === "month" ? "block" : "none";
  rowDate.style.display = mode === "date" ? "block" : "none";
}
function rebuildAsksForSelectedProfile() {
  const idx = Number(pick.value);
  const p = Number.isFinite(idx) ? profiles[idx] : null;
  if (!p) return;

  const a = astro.astrolabeBySolarDate(p.date, Number(p.time), p.gender);
  buildDecadalOptionsFromAstrolabe(a, p.date, decadalPick);

  const yrs = buildYearOptions(p, 80);
  yearPick.innerHTML = yrs.map((y, i) => `<option value="${i}" data-date="${y.date}">${y.label}</option>`).join("");
}

/* ========= buildAnalysis / renderHuman / renderPacket ========= */
function buildAnalysis({ profile, mode, targetStr, targetDate, ctx }) {
  const a = astro.astrolabeBySolarDate(profile.date, Number(profile.time), profile.gender);
  const natalStarsAll = natalAllStars(a);
  const natalStarsMajor = natalMajorStars(a);
  const natalMut = natalMutagenFlights(a);
  const natalSelf = selfMutagenMarks(natalMut, "本命自化");

  const palaceNames = a.palaces.map((pp) => pp.name);

  const h = mode === "life" ? null : a.horoscope(targetDate);

  // scopes
  const decadalMut = h ? scopeMutagenFlights(h, "decadal", palaceNames) : null;
  const yearlyMut = h ? scopeMutagenFlights(h, "yearly", palaceNames) : null;

  let monthlyMut = null;
  let dailyMut = null;
  if (h && (mode === "month" || mode === "date")) {
    try {
      monthlyMut = scopeMutagenFlights(h, "monthly", palaceNames);
    } catch {
      monthlyMut = { note: "monthly scope not available in this iztro version" };
    }
  }
  if (h && mode === "date") {
    try {
      dailyMut = scopeMutagenFlights(h, "daily", palaceNames);
    } catch {
      dailyMut = { note: "daily scope not available in this iztro version" };
    }
  }

  // flow stars
  const decadalFlow = h && h.decadal ? flowByPalace(h.decadal) : null;
  const yearlyFlow = h && h.yearly ? flowByPalace(h.yearly) : null;
  const monthlyFlow = h && h.monthly ? flowByPalace(h.monthly) : null;
  const dailyFlow = h && h.daily ? flowByPalace(h.daily) : null;

  // mutagen star names (no guessing)
  const decadalMutagenList = h ? getScopeMutagenList(h, "decadal") : null;
  const yearlyMutagenList = h ? getScopeMutagenList(h, "yearly") : null;
  const monthlyMutagenList = h ? getScopeMutagenList(h, "monthly") : null;
  const dailyMutagenList = h ? getScopeMutagenList(h, "daily") : null;

  // dominance mapping
  const dominantScope = mode === "decadal" ? "decadal" : mode === "year" || mode === "month" || mode === "date" ? "yearly" : null;
  const dominantLabel = dominantScope === "decadal" ? "大限" : dominantScope === "yearly" ? "流年" : null;

  const dominantMut = dominantScope === "decadal" ? decadalMut : dominantScope === "yearly" ? yearlyMut : null;
  const dominantFlow = dominantScope === "decadal" ? decadalFlow : dominantScope === "yearly" ? yearlyFlow : null;
  const dominantMutagenList = dominantScope === "decadal" ? decadalMutagenList : dominantScope === "yearly" ? yearlyMutagenList : null;

  // tf names for patterns
  const natalMingIdx = getNatalMingIndex(a);
  const natalTF = tfNamesByIndex(a, natalMingIdx);

  const domIdx = h && dominantScope ? scopeMingPalaceIndex(h, dominantScope) : null;
  const domTF = domIdx === null ? [] : tfNamesByIndex(a, domIdx);

  const decIdx = h ? scopeMingPalaceIndex(h, "decadal") : null;
  const decTF = decIdx === null ? [] : tfNamesByIndex(a, decIdx);

  // patterns: natal always; dominant only one; decadal background only for year/month/date
  const natalPatterns = detectPatterns({
    layerLabel: "本命（基底）",
    astrolabe: a,
    natalStarsAll,
    tfPalaceNames: natalTF,
    mutagenList: null, // 本命四化星名在 iztro 不一定以 mutagen 提供；不猜 → 先不做三奇等四化型格局
  });

  const dominantPatterns = dominantScope
    ? detectPatterns({
        layerLabel: `當前主導（${dominantLabel}）`,
        astrolabe: a,
        natalStarsAll,
        tfPalaceNames: domTF,
        mutagenList: dominantMutagenList,
      })
    : [];

  const decadalBgPatterns =
    h && (mode === "year" || mode === "month" || mode === "date")
      ? detectPatterns({
          layerLabel: "背景（大限）",
          astrolabe: a,
          natalStarsAll,
          tfPalaceNames: decTF,
          mutagenList: decadalMutagenList,
        })
      : [];

  // overlay
  const overlayText =
    h && dominantScope && Array.isArray(dominantMut)
      ? overlayNarrativeNatalToScope(a, h, dominantScope, dominantMut)
      : "（此模式不指定時間點；無層級重疊）";

  return {
    profile,
    mode,
    targetStr,
    targetDate,
    ctx,

    astrolabe: a,
    horoscope: h,

    natal: {
      starsAll: natalStarsAll,
      starsMajor: natalStarsMajor,
      mut: natalMut,
      self: natalSelf,
      patterns: natalPatterns,
      incomingTop: computeIncomingTop(natalMut),
      prettyStars: prettyNatalStars(natalStarsAll),
      prettyMut: prettyMutagenFlights(natalMut, "本命四化"),
    },

    dominant: {
      scope: dominantScope,
      label: dominantLabel,
      mut: dominantMut,
      flow: dominantFlow,
      mutagenList: dominantMutagenList,
      patterns: dominantPatterns,
    },

    backgroundDecadal:
      h && (mode === "year" || mode === "month" || mode === "date")
        ? {
            mut: decadalMut,
            flow: decadalFlow,
            mutagenList: decadalMutagenList,
            patterns: decadalBgPatterns,
          }
        : null,

    timingRef:
      h && (mode === "month" || mode === "date")
        ? {
            monthly: {
              mut: monthlyMut,
              flow: monthlyFlow,
              mutagenList: monthlyMutagenList,
            },
            daily:
              mode === "date"
                ? {
                    mut: dailyMut,
                    flow: dailyFlow,
                    mutagenList: dailyMutagenList,
                  }
                : null,
          }
        : null,

    overlayText,
  };
}

function renderHuman(A) {
  const L = [];
  const p = A.profile;
  const h = A.horoscope;

  L.push(`【命盤】${p.label}`);
  L.push(`出生：${p.date}  time_index=${p.time}`);
  L.push(`【模式】${A.mode}`);
  L.push(`【目標】${A.mode === "life" ? "life" : A.targetStr}`);

  if (h) {
    L.push(`【iztro solarDate】${h?.solarDate || "N/A"}`);
    L.push(`【iztro lunarDate】${h?.lunarDate || "N/A"}`);
    if (A.mode === "decadal" || A.mode === "year" || A.mode === "month" || A.mode === "date") {
      L.push(`【大限命宮落點】${scopeMingPalaceName(A.astrolabe, h, "decadal")} (index=${h?.decadal?.index ?? "N/A"})`);
    }
    if (A.mode === "year" || A.mode === "month" || A.mode === "date") {
      L.push(`【流年命宮落點】${scopeMingPalaceName(A.astrolabe, h, "yearly")} (index=${h?.yearly?.index ?? "N/A"})`);
    }
    if (A.mode === "month" || A.mode === "date") {
      L.push(`【流月命宮落點】${scopeMingPalaceName(A.astrolabe, h, "monthly")} (index=${h?.monthly?.index ?? "N/A"})`);
    }
    if (A.mode === "date") {
      L.push(`【流日命宮落點】${scopeMingPalaceName(A.astrolabe, h, "daily")} (index=${h?.daily?.index ?? "N/A"})`);
    }
  }
  L.push("");

  // Natal base
  L.push("【本命（基底）】");
  L.push(prettyPatterns("本命格局（程式規則版）", A.natal.patterns, 12));
  L.push("");

  L.push("【本命星曜（好讀版）】");
  L.push(A.natal.prettyStars);
  L.push("");

  L.push("【本命四化（好讀版：飞化）】");
  L.push(A.natal.prettyMut);
  L.push("");

  L.push("【本命自化】");
  L.push(A.natal.self);
  L.push("");

  L.push(prettyIncomingTopLine("【本命：四化落點 Top 接收宮位】", A.natal.mut));
  L.push("");

  // Background decadal for year/month/date (include 大限格局 here, labeled background)
  if (A.backgroundDecadal) {
    L.push("【背景（大限；框架/環境；不作主導）】");
    L.push(prettyPatterns("大限格局（背景；程式規則版）", A.backgroundDecadal.patterns, 12));
    L.push("");

    L.push("【大限四化（背景：飞化）】");
    L.push(prettyMutagenFlights(A.backgroundDecadal.mut, "大限四化"));
    L.push("");

    L.push("【大限四化星名（禄/权/科/忌；落宮）】");
    L.push(prettyMutagenStarNames("大限四化星名", A.backgroundDecadal.mutagenList, A.natal.starsAll));
    L.push("");

    L.push(prettyIncomingTopLine("【大限（背景）：四化落點 Top 接收宮位】", A.backgroundDecadal.mut));
    L.push("");

    if (Array.isArray(A.backgroundDecadal.flow)) {
      L.push("【大限（背景）：流耀（按宮位）】");
      L.push(prettyFlowStarsByPalace(A.backgroundDecadal.flow, "大限"));
      L.push("");
    }
  }

  // Dominant layer (one only)
  if (A.dominant.scope) {
    L.push(`【當前主導（${A.dominant.label}）】`);
    L.push(prettyPatterns(`${A.dominant.label}格局（主導；程式規則版）`, A.dominant.patterns, 12));
    L.push("");

    L.push(`【當前主導（${A.dominant.label}）：四化（好讀版：飞化）】`);
    L.push(prettyMutagenFlights(A.dominant.mut, `${A.dominant.label}四化`));
    L.push("");

    L.push(`【當前主導（${A.dominant.label}）：四化星名（禄/权/科/忌；落宮）】`);
    L.push(prettyMutagenStarNames(`${A.dominant.label}四化星名`, A.dominant.mutagenList, A.natal.starsAll));
    L.push("");

    L.push(prettyIncomingTopLine(`【當前主導（${A.dominant.label}）：四化落點 Top 接收宮位】`, A.dominant.mut));
    L.push("");

    if (Array.isArray(A.dominant.flow)) {
      L.push(`【當前主導（${A.dominant.label}）：流耀（按宮位）】`);
      L.push(prettyFlowStarsByPalace(A.dominant.flow, A.dominant.label));
      L.push("");
    }
  }

  // Timing reference: monthly/daily tables only (Option B)
  if (A.timingRef?.monthly) {
    L.push("【應期參考（流月；不作主導；不輸出格局）】");
    L.push("【流月四化（飞化）】");
    L.push(Array.isArray(A.timingRef.monthly.mut) ? prettyMutagenFlights(A.timingRef.monthly.mut, "流月四化") : JSON.stringify(A.timingRef.monthly.mut, null, 2));
    L.push("");
    L.push("【流月四化星名（禄/权/科/忌；落宮）】");
    L.push(prettyMutagenStarNames("流月四化星名", A.timingRef.monthly.mutagenList, A.natal.starsAll));
    L.push("");
  }
  if (A.timingRef?.daily) {
    L.push("【應期參考（流日；不作主導；不輸出格局）】");
    L.push("【流日四化（飞化）】");
    L.push(Array.isArray(A.timingRef.daily.mut) ? prettyMutagenFlights(A.timingRef.daily.mut, "流日四化") : JSON.stringify(A.timingRef.daily.mut, null, 2));
    L.push("");
    L.push("【流日四化星名（禄/权/科/忌；落宮）】");
    L.push(prettyMutagenStarNames("流日四化星名", A.timingRef.daily.mutagenList, A.natal.starsAll));
    L.push("");
  }

  if (A.mode !== "life") {
    L.push("【層級宮位重疊（本命 → 當前主導）】");
    L.push(A.overlayText);
    L.push("");
  }


  return L.join("\n");
}

function renderPacket(A) {
  // “Copy for ChatGPT”: JSON-heavy packet, but follows your dominance rules.
  const lp = [];
  const p = A.profile;

  lp.push(`【命盤】${p.label}`);
  lp.push(`出生：${p.date}  time_index=${p.time}`);
  lp.push(`【模式】${A.mode}`);
  lp.push(`【目標】${A.mode === "life" ? "life" : A.targetStr}`);
  lp.push("");

  lp.push("【本命（基底）格局（程式規則版）】");
  lp.push(JSON.stringify(A.natal.patterns, null, 2));
  lp.push("");

  lp.push("【本命星曜（JSON：主星/辅星/杂耀）】");
  lp.push(JSON.stringify(A.natal.starsAll, null, 2));
  lp.push("");

  lp.push("【本命四化（JSON：飞化）】");
  lp.push(JSON.stringify(A.natal.mut, null, 2));
  lp.push("");

  lp.push("【本命自化（文字）】");
  lp.push(A.natal.self);
  lp.push("");

  // Background decadal for year/month/date
  if (A.backgroundDecadal) {
    lp.push("【背景（大限）格局（程式規則版）】");
    lp.push(JSON.stringify(A.backgroundDecadal.patterns, null, 2));
    lp.push("");

    lp.push("【大限四化（JSON：飞化；背景）】");
    lp.push(JSON.stringify(A.backgroundDecadal.mut, null, 2));
    lp.push("");

    lp.push("【大限四化星名（JSON；背景）】");
    lp.push(JSON.stringify(A.backgroundDecadal.mutagenList, null, 2));
    lp.push("");

    if (Array.isArray(A.backgroundDecadal.flow)) {
      lp.push("【大限流耀（按宮位 JSON；背景）】");
      lp.push(JSON.stringify(A.backgroundDecadal.flow, null, 2));
      lp.push("");
    }
  }

  // Dominant layer
  if (A.dominant.scope) {
    lp.push(`【當前主導（${A.dominant.label}）格局（程式規則版）】`);
    lp.push(JSON.stringify(A.dominant.patterns, null, 2));
    lp.push("");

    lp.push(`【當前主導（${A.dominant.label}）四化（JSON：飞化）】`);
    lp.push(JSON.stringify(A.dominant.mut, null, 2));
    lp.push("");

    lp.push(`【當前主導（${A.dominant.label}）四化星名（JSON）】`);
    lp.push(JSON.stringify(A.dominant.mutagenList, null, 2));
    lp.push("");

    if (Array.isArray(A.dominant.flow)) {
      lp.push(`【當前主導（${A.dominant.label}）流耀（按宮位 JSON）】`);
      lp.push(JSON.stringify(A.dominant.flow, null, 2));
      lp.push("");
    }
  }

  // Timing reference tables only (Option B)
  if (A.timingRef?.monthly) {
    lp.push("【應期參考：流月四化（JSON：飞化）】");
    lp.push(JSON.stringify(A.timingRef.monthly.mut, null, 2));
    lp.push("");
    lp.push("【應期參考：流月四化星名（JSON）】");
    lp.push(JSON.stringify(A.timingRef.monthly.mutagenList, null, 2));
    lp.push("");
  }
  if (A.timingRef?.daily) {
    lp.push("【應期參考：流日四化（JSON：飞化）】");
    lp.push(JSON.stringify(A.timingRef.daily.mut, null, 2));
    lp.push("");
    lp.push("【應期參考：流日四化星名（JSON）】");
    lp.push(JSON.stringify(A.timingRef.daily.mutagenList, null, 2));
    lp.push("");
  }

  if (A.mode !== "life") {
    lp.push("【層級宮位重疊（本命 → 當前主導）】");
    lp.push(A.overlayText);
    lp.push("");
  }


  return lp.join("\n");
}

/* ========= Auto-generate (debounced) ========= */
let genTimer = null;
function scheduleGenerate(ms = 250) {
  if (genTimer) clearTimeout(genTimer);
  genTimer = setTimeout(() => {
    generateNow();
  }, ms);
}

function generateNow() {
  try {
    if (!profiles.length) {
      out.textContent = "Please save a chart first (Step 1).";
      return;
    }

    const idx = Number(pick.value);
    const p = Number.isFinite(idx) ? profiles[idx] : null;
    if (!p) {
      out.textContent = "Please select a saved chart first (Step 1).";
      return;
    }

    const mode = getSelectedMode();
    const ctx = ""; // no longer used; chat box is the real input

    out.textContent = "Generating...";

    let t = "";
    let tDate = null;

    if (mode === "life") {
      // No target date
    } else if (mode === "decadal") {
      const opt = decadalPick?.selectedOptions?.[0];
      t = opt?.dataset?.date || "";
      tDate = t ? makeSafeLocalNoonDateFromYMD(t) : null;
    } else if (mode === "year") {
      const opt = yearPick?.selectedOptions?.[0];
      t = opt?.dataset?.date || "";
      tDate = t ? makeSafeLocalNoonDateFromYMD(t) : null;
    } else if (mode === "month") {
      const m = (monthInput?.value || "").trim();
      t = m;
      tDate = /^\d{4}-\d{2}$/.test(m) ? makeSafeLocalNoonDateFromYM(m) : null;
    } else {
      t = (target?.value || "").trim();
      tDate = /^\d{4}-\d{2}-\d{2}$/.test(t) ? makeSafeLocalNoonDateFromYMD(t) : null;
    }

    if (mode !== "life") {
      if (!t) {
        out.textContent =
          mode === "decadal"
            ? "Please choose a 大限 first."
            : mode === "year"
            ? "Please choose a 流年 first."
            : mode === "month"
            ? "Please enter a 流月 (YYYY-MM) first."
            : "Please enter a 流日 (YYYY-MM-DD) first.";
        return;
      }

      if (!tDate || Number.isNaN(tDate.getTime())) {
        out.textContent = mode === "month" ? "Invalid month. Please use YYYY-MM." : "Invalid date. Please use YYYY-MM-DD.";
        return;
      }
    }

    const A = buildAnalysis({
      profile: p,
      mode,
      targetStr: t,
      targetDate: tDate,
      ctx,
    });

out.textContent = renderHuman(A);
lastPacket = renderPacket(A);

// If user already has a chat going, refresh the last assistant answer
// using the updated packet (mode/target/context changes).
scheduleAutoRefresh(200);

  } catch (err) {
    out.textContent =
      "Generate failed:\n" +
      (err?.message || String(err)) +
      "\n\n(If you open F12 Console, you can see the full stack trace.)";
    console.error(err);
  }
}

/* initial paint */
refresh(null);
updateModeUI();
out.textContent = "Select a saved chart (Step 1) to auto-generate results.";

renderChat();
updateCreditUI();

/* ========= Events ========= */
document.querySelectorAll('input[name="mode"]').forEach((r) => {
  r.addEventListener("change", () => {
    updateModeUI();
    scheduleGenerate(0);

    // ✅ ADD THESE TWO LINES
    renderChat();
    updateCreditUI();
  });
});

pick.addEventListener("change", () => {
  const idx = Number(pick.value);
  const p = Number.isFinite(idx) ? profiles[idx] : null;
  const hasSelection = !!p;

  setDeleteEnabled(hasSelection);

  if (hasSelection) {
    rebuildAsksForSelectedProfile();
    scheduleGenerate(0);
    setActiveTab("data");

    // ✅ ADD THESE TWO LINES
    renderChat();
    updateCreditUI();
  } else {
    out.textContent = "";
  }
});
decadalPick.addEventListener("change", () => {
  scheduleGenerate(0);
  renderChat();
});
yearPick.addEventListener("change", () => {
  scheduleGenerate(0);
  renderChat();
});
monthInput.addEventListener("input", () => {
  scheduleGenerate(250);
  renderChat();
});
target.addEventListener("input", () => {
  scheduleGenerate(250);
  renderChat();
});

/* ========= Actions ========= */
document.getElementById("save").onclick = () => {
  const shichen = document.getElementById("shichen").value;

  const newLabel = (label.value || "").trim();
  const newDate = (date.value || "").trim();
  const newGender = gender.value;

  if (!newLabel || !newDate) {
    out.textContent = "Please enter Label + Date before saving.";
    setActiveTab("data");
    return;
  }

  profiles.unshift({
    label: newLabel,
    date: newDate,
    time: Number(shichen),
    gender: newGender,
  });

  saveProfiles(profiles);

  refresh(0);

  out.textContent = "New chart saved and selected.";
  updateModeUI();
  setActiveTab("data");
  scheduleGenerate(0);
};

deletePickBtn.onclick = () => {
  const idx = Number(pick.value);
  const p = Number.isFinite(idx) ? profiles[idx] : null;
  if (!p) {
    setDeleteEnabled(false);
    return;
  }
  openConfirmModal();
};

confirmNo.onclick = () => {
  closeConfirmModal();
};

confirmYes.onclick = () => {
  const idx = Number(pick.value);
  const p = Number.isFinite(idx) ? profiles[idx] : null;

  closeConfirmModal();

  if (!p) {
    setDeleteEnabled(false);
    return;
  }

  profiles.splice(idx, 1);
  saveProfiles(profiles);

  refresh(null);
  rebuildAsksForSelectedProfile();
  updateModeUI();

  setDeleteEnabled(false);
  showToast("Selected chart deleted!", 3000);

  out.textContent = profiles.length ? "Select a saved chart (Step 1) to auto-generate results." : "Please save a chart first (Step 1).";
  setActiveTab("data");
};

document.getElementById("copy").onclick = async () => {
  await navigator.clipboard.writeText(lastPacket || "");
  alert("Copied");
};