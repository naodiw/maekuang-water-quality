const GROUP_META = {
  kuang:       { label: "แม่น้ำกวง",            color: "#0ea5e9" },
  maekha:      { label: "คลองแม่ข่า",           color: "#7c3aed" },
  beforeafter: { label: "จุดก่อน-หลังโรงงาน",   color: "#d97706" },
};

const RIVER = {
  color: "#0ea5e9",     // body
  glow: "#38bdf8",      // halo
  flow: "#f0f9ff",      // moving dashes (convey flow direction)
};

const MAEKHA = {
  color: "#7c3aed",     // body (matches MK markers)
  glow: "#a78bfa",      // halo
  flow: "#f5f3ff",      // moving dashes
};

// ประเภทแหล่งน้ำผิวดิน (ประกาศ กก.วล. ฉบับที่ 8 พ.ศ. 2537) — จัดจาก DO และ BOD
// รายตัวอย่าง: ค่าของครั้งนั้น · รายจุด: DO เปอร์เซ็นไทล์ 20 + BOD เปอร์เซ็นไทล์ 80 ของทุกครั้ง
// ค่า "<x" ใช้ค่าขีดจำกัด x (เหมือนสไลด์สรุปผล ศวภ.น.)
const CLASS_STD = [
  { cls: 2, doMin: 6.0, bodMax: 1.5 },
  { cls: 3, doMin: 4.0, bodMax: 2.0 },
  { cls: 4, doMin: 2.0, bodMax: 4.0 },
];
const CLASS_META = {
  2: { color: "#2E7D5B", ink: "#fff", use: "อุปโภคบริโภค (ฆ่าเชื้อ + ปรับปรุงทั่วไป) · อนุรักษ์สัตว์น้ำ · ประมง · ว่ายน้ำ" },
  3: { color: "#155E8A", ink: "#fff", use: "อุปโภคบริโภค (ฆ่าเชื้อ + ปรับปรุงพิเศษ) · การเกษตร" },
  4: { color: "#F5A65B", ink: "#3D1405", use: "อุปโภคบริโภค (ฆ่าเชื้อ + ปรับปรุงพิเศษ) · การอุตสาหกรรม" },
  5: { color: "#A11D17", ink: "#fff", use: "การคมนาคม" },
};

function classOf(doV, bodV) {
  if (doV == null || bodV == null) return null;
  for (const c of CLASS_STD) if (doV >= c.doMin && bodV <= c.bodMax) return c.cls;
  return 5;
}

function percentile(xs, q) {
  const a = xs.slice().sort((x, y) => x - y);
  const k = (a.length - 1) * q, f = Math.floor(k), c = Math.min(f + 1, a.length - 1);
  return a[f] + (a[c] - a[f]) * (k - f);
}

function sampleClass(r) { return r ? classOf(numOf(r.DO), numOf(r.BOD)) : null; }

// ประเภทรายจุดทั้งปี
function pointClass(code) {
  const rows = (state.results[code] || []).filter((r) => numOf(r.DO) != null && numOf(r.BOD) != null);
  if (!rows.length) return null;
  const do20 = percentile(rows.map((r) => numOf(r.DO)), 0.2);
  const bod80 = percentile(rows.map((r) => numOf(r.BOD)), 0.8);
  return { cls: classOf(do20, bod80), do20, bod80, n: rows.length };
}

function classBadge(c, text) {
  if (!c) return "";
  const m = CLASS_META[c];
  return `<span class="cbadge" style="background:${m.color};color:${m.ink}">${text || `ประเภท ${c}`}</span>`;
}

const PARAM_LABEL = {
  pH: "pH", Turb: "ความขุ่น", Cond: "การนำไฟฟ้า", Sal: "ความเค็ม", DO: "DO",
  Temp: "อุณหภูมิ", BOD: "BOD", COD: "COD", SS: "SS", TDS: "TDS", TKN: "TKN", "Cl-": "คลอไรด์",
};

// จุดก่อน-หลังโรงงาน: เลขคี่ = ก่อน, เลขคู่ = หลัง (KAB01/02, P13/14, PB05/06 ...)
function pairOf(code) {
  const m = code.match(/^(\D+)(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  const isBefore = n % 2 === 1;
  const other = m[1] + String(isBefore ? n + 1 : n - 1).padStart(m[2].length, "0");
  return isBefore ? { before: code, after: other } : { before: other, after: code };
}

const state = {
  points: [],
  results: {},          // code -> [{date, pH, DO, BOD, ...}] sorted by date
  units: {},
  landmarks: [],
  river: null,          // array of [lat,lng]
  facts: null,          // river_facts.json (click → popup)
  factories: [],        // factories.json — โรงงาน DIW ≤1 กม. จากแม่น้ำ
  monitored: [],        // โรงงานที่จุดเก็บน้ำก่อน-หลังคร่อมอยู่
  factoryLayers: [],
  showFactories: true,
  map: null,
  markers: {},
  selected: null,
  filter: "all",
  months: [],           // ["2025-10", ...] รอบเก็บตัวอย่าง (รายเดือน)
  monthIdx: -1,         // รอบที่เลือกบน timeline
  playTimer: null,
};

const els = {
  groupFilter: document.querySelector("#groupFilter"),
  selectedTitle: document.querySelector("#selectedTitle"),
  selectedBody: document.querySelector("#selectedBody"),
  siteList: document.querySelector("#siteList"),
  listCount: document.querySelector("#listCount"),
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

async function init() {
  const [data, rivers, otherRivers, reservoir, maekha, facts, factories, results] = await Promise.all([
    fetch("data.json?v=3").then((r) => r.json()),
    fetch("rivers.geojson?v=4").then((r) => r.json()).catch(() => null),
    fetch("rivers_other.geojson?v=2").then((r) => r.json()).catch(() => null),
    fetch("reservoir.geojson?v=1").then((r) => r.json()).catch(() => null),
    fetch("maekha.geojson?v=1").then((r) => r.json()).catch(() => null),
    fetch("river_facts.json?v=1").then((r) => r.json()).catch(() => null),
    fetch("factories.json?v=2").then((r) => r.json()).catch(() => null),
    fetch("results.json?v=2").then((r) => r.json()).catch(() => null),
  ]);
  if (results) { state.results = results.results || {}; state.units = results.units || {}; }
  state.months = [...new Set(Object.values(state.results).flat().map((r) => r.date.slice(0, 7)))].sort();
  state.monthIdx = state.months.length - 1;
  state.points = (data.points || []).filter((p) => p.latitude && p.longitude);
  state.landmarks = data.landmarks || [];
  state.facts = facts;
  state.factories = (factories && factories.factories) || [];
  state.monitored = (factories && factories.monitored) || [];
  setupMap();
  if (otherRivers) addOtherRivers(otherRivers);   // subtle background rivers
  if (reservoir) addReservoir(reservoir);         // Mae Kuang reservoir (water body)
  if (maekha) addFlowRiver(maekha, MAEKHA, "คลองแม่ข่า", "maekha");  // prominent Mae Kha canal
  if (rivers) addRiver(rivers);                    // prominent Mae Kuang (upper + middle + lower)
  addFactories();                                  // DIW factories ≤1 km from rivers
  addMonitoredFactories();                         // factories bracketed by before/after water points
  addLandmarks();                                  // source + dam markers
  buildFilters();
  addMarkers();
  setupTimeline();
  render();
  fitToVisible();
  setupLegend();
  fillLegendIcons();                               // isometric factory icons in legend
  state.map.on("zoomend", updateFactoryScale);     // shrink factory markers when zoomed out
  updateFactoryScale();
}

// Legend: expanded on desktop, collapsible (default closed) on mobile
function setupLegend() {
  const legend = document.getElementById("legend");
  if (!legend) return;
  const sync = () => { legend.open = window.innerWidth > 820; };
  sync();
  window.addEventListener("resize", sync);
}

function setupMap() {
  state.map = L.map("map", { zoomControl: false }).setView([18.7, 99.0], 11);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  // panes (low → high): reservoir < factories < other rivers < connector < prominent Mae Kuang
  state.map.createPane("reservoir");
  state.map.getPane("reservoir").style.zIndex = 330;
  state.map.createPane("factories");
  state.map.getPane("factories").style.zIndex = 335;
  state.map.createPane("riverOther");
  state.map.getPane("riverOther").style.zIndex = 340;
  state.map.createPane("maekha");
  state.map.getPane("maekha").style.zIndex = 348;
  state.map.createPane("river");
  state.map.getPane("river").style.zIndex = 350;

  // Expandable popups: when the <details> inside a popup toggles, recompute the
  // popup size/anchor so Leaflet re-lays-out and keeps it on screen.
  state.map.on("popupopen", (e) => {
    const det = e.popup.getElement()?.querySelector("details.rpop-more");
    if (!det || det._wired) return;
    det._wired = true;
    det.addEventListener("toggle", () => {
      const rpop = det.closest(".rpop");
      if (rpop) rpop.classList.toggle("is-open", det.open);  // drives width + body visibility
      // Resize/reposition WITHOUT popup.update() — that re-renders the HTML string
      // and would reset the <details> back to collapsed.
      const p = e.popup;
      if (p._updateLayout) p._updateLayout();
      if (p._updatePosition) p._updatePosition();
      if (det.open && p._adjustPan) p._adjustPan();
    });
  });
}

function groupColor(group) {
  return (GROUP_META[group] || {}).color || "#697386";
}

// ---------- River facts (click → popup) ----------
// Reduce an OSM/label name to its core token so aliases match one fact entry
// e.g. "แม่น้ำกวง" / "น้ำแม่กวง" → "กวง" ; "ลำน้ำแม่ทา" → "ทา" ; "คลองแม่ข่า" → "ข่า"
function coreName(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/^(ลำน้ำแม่|คลองแม่|ห้วยแม่|แม่น้ำ|น้ำแม่|ลำน้ำ|คลอง|ห้วย|น้ำ|แม่)/, "");
}

// Return a fact object for a waterway name, or null if we have none
function factFor(name) {
  const rivers = (state.facts && state.facts.rivers) || {};
  return rivers[coreName(name)] || null;
}

// Build clean popup HTML. `fact` may be a full entry or a minimal {title,...}
// Collapsed by default (compact header) — expands to full details on tap.
function buildRiverPopup(fact) {
  const accent = fact.accent || "#1478a8";
  const stats = (fact.stats || [])
    .map(([k, v]) => `<div class="rpop-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
    .join("");
  const metaSrc = (state.facts && state.facts.meta && state.facts.meta.source) || "";
  const src = fact.source !== undefined ? fact.source : metaSrc;  // per-card override
  const hasDetail = !!(fact.blurb || stats || fact.note);
  const body = `
      ${fact.blurb ? `<p class="rpop-blurb">${escapeHtml(fact.blurb)}</p>` : ""}
      ${stats ? `<dl class="rpop-stats">${stats}</dl>` : ""}
      ${fact.note ? `<p class="rpop-note">${escapeHtml(fact.note)}</p>` : ""}
      ${src ? `<p class="rpop-src">ที่มา: ${escapeHtml(src)}</p>` : ""}`;
  const head = `
      <div class="rpop-head">
        ${fact.kind ? `<span class="rpop-kind">${escapeHtml(fact.kind)}</span>` : ""}
        <h3 class="rpop-title">${escapeHtml(fact.title || "")}</h3>
        ${fact.subtitle ? `<p class="rpop-sub">${escapeHtml(fact.subtitle)}</p>` : ""}
      </div>`;
  // No detail → just the compact header. Has detail → collapsible <details>.
  if (!hasDetail) return `<div class="rpop rpop-compact" style="--accent:${accent}">${head}</div>`;
  return `
    <div class="rpop" style="--accent:${accent}">
      <details class="rpop-more">
        <summary class="rpop-summary">${head}<span class="rpop-toggle">ดูข้อมูล</span></summary>
        <div class="rpop-body">${body}</div>
      </details>
    </div>`;
}

// Attach a fact popup to a layer. Uses a real fact when available; otherwise a
// minimal card for named waterways (all lie in the Ping basin here).
function bindRiverPopup(layer, name, fallbackAccent) {
  const fact = factFor(name);
  const clean = String(name || "").trim();
  if (!fact && !clean) return; // unnamed stream → no popup, keep tooltip only
  const entry = fact || {
    kind: "ลำน้ำ",
    title: clean,
    subtitle: "ลำน้ำในพื้นที่ลุ่มน้ำปิง",
    accent: fallbackAccent || "#2f88c2",
  };
  layer.bindPopup(buildRiverPopup(entry), {
    className: "river-popup",
    maxWidth: 280,
    closeButton: true,
    autoPanPadding: [24, 24],
  });
}

// ---------- Other rivers (background, no animation, hover shows name) ----------
function addOtherRivers(geojson) {
  const base = { color: "#2f88c2", weight: 2.6, opacity: 0.85, lineCap: "round", lineJoin: "round" };

  // visible base line
  L.geoJSON(geojson, { pane: "riverOther", interactive: false, style: base }).addTo(state.map);

  // transparent wide hit layer — easy hover, shows name + highlight glow
  L.geoJSON(geojson, {
    pane: "riverOther",
    style: { color: "#0e6ba8", weight: 12, opacity: 0 },
    onEachFeature: (f, layer) => {
      const rawName = (f.properties && f.properties.name) || "";
      layer.bindTooltip(rawName || "สายน้ำ (ไม่ระบุชื่อ)", { sticky: true, direction: "top", className: "river-tip" });
      layer.on("mouseover", () => layer.setStyle({ opacity: 0.9, weight: 6 }));
      layer.on("mouseout", () => layer.setStyle({ opacity: 0 }));
      bindRiverPopup(layer, rawName, "#2f88c2");   // click → fact card (named only)
    },
  }).addTo(state.map);
}

// ---------- Reservoir (อ่างเก็บน้ำแม่กวง) ----------
function addReservoir(geojson) {
  const layer = L.geoJSON(geojson, {
    pane: "reservoir",
    style: { color: "#38bdf8", weight: 1.5, opacity: 0.7, fillColor: "#7dd3fc", fillOpacity: 0.5 },
  }).bindTooltip("อ่างเก็บน้ำแม่กวง", { sticky: true, direction: "top", className: "river-tip" })
    .addTo(state.map);
  const dam = state.facts && state.facts.reservoir;
  if (dam) layer.bindPopup(buildRiverPopup(dam), { className: "river-popup", maxWidth: 280, autoPanPadding: [24, 24] });
}

// ---------- Generic prominent flowing waterway (glow + body + animated flow) ----------
function addFlowRiver(geojson, colors, label, paneName) {
  const lines = geojson.features
    .filter((f) => f.geometry?.type === "LineString")
    .map((f) => f.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
  if (!lines.length) return [];
  const pane = { pane: paneName, lineCap: "round", lineJoin: "round" };
  const deco = { ...pane, interactive: false };  // visuals don't grab clicks

  for (const line of lines) {
    // 1) soft outer glow
    L.polyline(line, { ...deco, color: colors.glow, weight: 18, opacity: 0.18 }).addTo(state.map);
    // 2) main body
    L.polyline(line, { ...deco, color: colors.color, weight: 6, opacity: 0.75 }).addTo(state.map);
    // 3) animated downstream flow dashes (each part ordered source -> downstream)
    L.polyline(line, {
      ...deco, color: colors.flow, weight: 3, opacity: 0.95,
      dashArray: "10 20", className: "river-flow",
    }).addTo(state.map);
    // 4) transparent wide hit line on top — hover shows name, click shows facts
    const hit = L.polyline(line, { ...pane, color: colors.color, weight: 16, opacity: 0 })
      .bindTooltip(label, { sticky: true, direction: "top", className: "river-tip" })
      .addTo(state.map);
    bindRiverPopup(hit, label, colors.color);
  }
  return lines;
}

// ---------- River (prominent Mae Kuang — upper + middle + lower parts) ----------
function addRiver(geojson) {
  const lines = addFlowRiver(geojson, RIVER, "แม่น้ำกวง", "river");
  state.river = lines.flat();
}

// ---------- DIW factories (≤1 km from แม่น้ำกวง / คลองแม่ข่า) ----------
// Isometric factory marker — 3 shades per face (top light, right base, left dark),
// coloured per type via CSS vars --cl/--c/--cd. Chimney reuses the same shades.
const FACTORY_SVG = `<svg viewBox="0 0 48 48" class="iso-fac" aria-hidden="true">
  <polygon class="iso-left"  points="14,7.5 19,10 19,20 14,17.5"/>
  <polygon class="iso-right" points="19,10 24,7.5 24,17.5 19,20"/>
  <polygon class="iso-top"   points="19,5 24,7.5 19,10 14,7.5"/>
  <polygon class="iso-left"  points="6,24 24,34 24,44 6,34"/>
  <polygon class="iso-right" points="24,34 42,24 42,34 24,44"/>
  <polygon class="iso-top"   points="24,14 42,24 24,34 6,24"/>
  <polygon class="iso-win" points="29,30.5 33,32.5 33,35 29,33"/>
  <polygon class="iso-win" points="35,27.5 39,29.5 39,32 35,30"/>
</svg>`;

const FACTORY_COLORS = {
  kuang:     { c: "#1478a8", cl: "#6fb0cf", cd: "#0e5b7e" },
  maekha:    { c: "#7c3aed", cl: "#a482f0", cd: "#571fae" },
  monitored: { c: "#d97706", cl: "#f0a94a", cd: "#a85a03" },
};
function isoStyle(k) {
  const x = FACTORY_COLORS[k] || FACTORY_COLORS.kuang;
  return `--c:${x.c};--cl:${x.cl};--cd:${x.cd}`;
}

// Factory markers shrink when zoomed out (via CSS var --fscale on #map)
function factoryScaleForZoom(z) {
  if (z >= 14) return 1;
  if (z >= 13) return 0.88;
  if (z >= 12) return 0.74;
  if (z >= 11) return 0.62;
  if (z >= 10) return 0.52;
  return 0.44;
}
function updateFactoryScale() {
  const el = document.getElementById("map");
  if (el && state.map) el.style.setProperty("--fscale", factoryScaleForZoom(state.map.getZoom()));
}

// Fill legend factory swatches with the isometric icon (matches map markers)
function fillLegendIcons() {
  document.querySelectorAll(".legend-iso[data-fico]").forEach((el) => {
    el.setAttribute("style", isoStyle(el.dataset.fico));
    el.innerHTML = FACTORY_SVG;
  });
}

function buildFactoryPopup(f) {
  const riverLabel = f.nearRiver === "maekha" ? "คลองแม่ข่า" : "แม่น้ำกวง";
  const accent = f.nearRiver === "maekha" ? "#7c3aed" : "#1478a8";
  const fact = {
    kind: "โรงงาน DIW",
    title: f.name || f.operator || "(ไม่ระบุชื่อ)",
    subtitle: f.business || "",
    accent,
    blurb: f.address || "",
    stats: [
      ["ทะเบียน", f.oldreg || f.fid || "—"],
      ["ผู้ประกอบการ", f.operator || "—"],
      ["แรงม้า", f.hp ? `${f.hp} HP` : "—"],
      ["คนงาน", f.workers ? `${f.workers} คน` : "—"],
      ["เงินทุน", f.capital ? `${Number(f.capital).toLocaleString("th-TH")} บาท` : "—"],
      [`ห่าง${riverLabel}`, `${(f.distanceM / 1000).toFixed(2)} กม.`],
    ],
    note: "",
    source: "กรมโรงงานอุตสาหกรรม (DIW)",
  };
  return buildRiverPopup(fact);
}

function addFactories() {
  for (const f of state.factories) {
    if (!f.latitude || !f.longitude) continue;
    const kind = f.nearRiver === "maekha" ? "maekha" : "kuang";
    const m = L.marker([f.latitude, f.longitude], {
      pane: "factories",
      icon: L.divIcon({
        className: "",
        html: `<div class="factory-pin" style="${isoStyle(kind)}">${FACTORY_SVG}</div>`,
        iconSize: [32, 32], iconAnchor: [16, 29],
      }),
    });
    m.bindTooltip(`${f.name || f.operator} · ห่างน้ำ ${(f.distanceM / 1000).toFixed(2)} กม.`,
      { direction: "top", offset: [0, -10] });
    m.bindPopup(buildFactoryPopup(f), { className: "river-popup", maxWidth: 280, autoPanPadding: [24, 24] });
    if (state.showFactories) m.addTo(state.map);
    state.factoryLayers.push(m);
  }
  const toggle = document.getElementById("factoryToggle");
  const count = document.getElementById("factoryCount");
  if (count) count.textContent = state.factories.length;
  if (toggle) {
    const sync = () => {
      toggle.classList.toggle("is-active", state.showFactories);
      toggle.setAttribute("aria-pressed", String(state.showFactories));
      for (const m of state.factoryLayers) {
        if (state.showFactories) { if (!state.map.hasLayer(m)) m.addTo(state.map); }
        else if (state.map.hasLayer(m)) m.remove();
      }
    };
    toggle.addEventListener("click", () => { state.showFactories = !state.showFactories; sync(); });
    sync();
  }
}

// ---------- Monitored factories (จุดเก็บน้ำก่อน-หลังคร่อมอยู่) ----------
function buildMonitoredPopup(f) {
  const stats = [
    ["กิจการ", f.business || "—"],
    ["ที่ตั้ง", f.address || "—"],
    ["จุดตรวจ", `${f.beforeCode} (ก่อน) → ${f.afterCode} (หลัง)`],
    ["ลำน้ำที่ตรวจ", f.river || "—"],
  ];
  if (f.hp) stats.push(["แรงม้า", `${f.hp} HP`]);
  if (f.workers) stats.push(["คนงาน", `${f.workers} คน`]);
  if (f.capital) stats.push(["เงินทุน", `${Number(f.capital).toLocaleString("th-TH")} บาท`]);
  if (f.oldreg) stats.push(["ทะเบียน", f.oldreg]);
  return buildRiverPopup({
    kind: "โรงงานตรวจก่อน-หลัง",
    title: f.name,
    subtitle: `น้ำถูกเก็บตัวอย่างก่อน–หลังไหลผ่านโรงงานนี้`,
    accent: "#d97706",
    source: f.source && f.source.indexOf("ประมาณ") >= 0 ? "กรมโรงงานอุตสาหกรรม (พิกัดโดยประมาณ)" : "กรมโรงงานอุตสาหกรรม (DIW)",
    blurb: f.source && f.source.indexOf("ประมาณ") >= 0 ? "⚠ ตำแหน่งโดยประมาณ (ไม่พบพิกัดจริงในฐาน DIW)" : "",
    stats,
    note: "",
  });
}

function addMonitoredFactories() {
  for (const f of state.monitored) {
    if (!f.latitude || !f.longitude) continue;
    const m = L.marker([f.latitude, f.longitude], {
      pane: "factories",
      zIndexOffset: 300,
      icon: L.divIcon({
        className: "",
        html: `<div class="factory-pin fm-monitored" style="${isoStyle("monitored")}">${FACTORY_SVG}</div>`,
        iconSize: [40, 40], iconAnchor: [20, 36],
      }),
    });
    m.bindTooltip(`${f.name} · ตรวจก่อน-หลัง (${f.beforeCode}/${f.afterCode})`,
      { direction: "top", offset: [0, -12] });
    m.bindPopup(buildMonitoredPopup(f), { className: "river-popup", maxWidth: 280, autoPanPadding: [24, 24] });
    if (state.showFactories) m.addTo(state.map);
    state.factoryLayers.push(m);
  }
}

// ---------- Landmarks: source + dam ----------
function addLandmarks() {
  const icons = {
    source: { emoji: "🏔️", cls: "lm-source" },
    dam: { emoji: "🏞️", cls: "lm-dam" },
  };
  for (const lm of state.landmarks || []) {
    if (!lm.latitude || !lm.longitude) continue;
    const meta = icons[lm.type] || { emoji: "📍", cls: "" };
    L.marker([lm.latitude, lm.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="landmark ${meta.cls}">${meta.emoji}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
      }),
      zIndexOffset: 500,
    }).bindTooltip(lm.name, { direction: "top", offset: [0, -10], className: "river-tip" })
      .addTo(state.map);
  }
}

// ---------- Filters ----------
function buildFilters() {
  const counts = {};
  for (const p of state.points) counts[p.group] = (counts[p.group] || 0) + 1;
  const options = [{ key: "all", label: "ทั้งหมด", count: state.points.length }];
  for (const key of Object.keys(GROUP_META)) {
    if (counts[key]) options.push({ key, label: GROUP_META[key].label, count: counts[key] });
  }
  els.groupFilter.innerHTML = options.map((o) => `
    <button type="button" class="segmented-button ${o.key === state.filter ? "is-active" : ""}"
      role="radio" aria-checked="${o.key === state.filter}" data-filter="${o.key}">
      ${escapeHtml(o.label)}<span class="cnt">${o.count}</span>
    </button>`).join("");
  els.groupFilter.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      buildFilters(); render(); updateTimelineUI(); fitToVisible();
    });
  });
}

// ---------- Markers ----------
function addMarkers() {
  for (const p of state.points) {
    const marker = L.marker([p.latitude, p.longitude], { icon: pinIcon(p) });
    marker.bindTooltip(`${p.code} · ${p.name}`, { direction: "top", offset: [0, -8] });
    marker.on("click", () => selectPoint(p.code));
    marker.addTo(state.map);
    state.markers[p.code] = marker;
  }
}

function pinIcon(p) {
  const st = pointStatus(p.code);
  const active = p.code === state.selected ? " is-active" : "";
  return L.divIcon({
    className: "",
    html: `<div class="pin pin-${p.group} st-${st}${active}" style="background:${groupColor(p.group)}"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });
}

function refreshPins() {
  for (const p of state.points) state.markers[p.code]?.setIcon(pinIcon(p));
}

// ---------- Timeline (แถบเลื่อนตามรอบเก็บตัวอย่าง) ----------
const TH_MONTH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function fmtMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return `${TH_MONTH[m - 1]} ${y + 543}`;
}

function currentMonth() { return state.months[state.monthIdx] || null; }

function rowForMonth(code, ym = currentMonth()) {
  if (!ym) return null;
  return (state.results[code] || []).find((r) => r.date.startsWith(ym)) || null;
}

// c2..c5 = ประเภทของตัวอย่างในรอบที่เลือก · none = ไม่มีการเก็บในรอบนี้
function pointStatus(code) {
  const c = sampleClass(rowForMonth(code));
  return c ? `c${c}` : "none";
}

function setupTimeline() {
  const box = document.getElementById("timeline");
  if (!box) return;
  if (!state.months.length) { box.remove(); return; }
  const range = box.querySelector("#tlRange");
  range.max = state.months.length - 1;
  range.value = state.monthIdx;
  box.querySelector("#tlTicks").innerHTML = state.months.map((ym, i) => {
    const hasBA = state.points.some((p) => p.group === "beforeafter" && rowForMonth(p.code, ym));
    return `<button type="button" class="tl-tick" data-i="${i}" title="${fmtMonth(ym)}">
      <span>${TH_MONTH[Number(ym.slice(5)) - 1]}</span>${hasBA ? '<i class="tl-ba" title="มีผลจุดก่อน-หลังโรงงาน"></i>' : ""}
    </button>`;
  }).join("");
  range.addEventListener("input", () => { stopPlay(); setMonth(Number(range.value)); });
  box.querySelectorAll(".tl-tick").forEach((b) =>
    b.addEventListener("click", () => { stopPlay(); setMonth(Number(b.dataset.i)); }));
  box.querySelector("#tlPlay").addEventListener("click", () => (state.playTimer ? stopPlay() : startPlay()));
  updateTimelineUI();
}

function setMonth(i) {
  state.monthIdx = Math.max(0, Math.min(state.months.length - 1, i));
  updateTimelineUI();
  refreshPins();
  render();
  if (state.selected) renderSelected();
}

function startPlay() {
  if (state.monthIdx >= state.months.length - 1) setMonth(0);
  const b = document.getElementById("tlPlay");
  b.classList.add("is-playing");
  b.setAttribute("aria-label", "หยุด");
  state.playTimer = setInterval(() => {
    if (state.monthIdx >= state.months.length - 1) return stopPlay();
    setMonth(state.monthIdx + 1);
  }, 1300);
}

function stopPlay() {
  clearInterval(state.playTimer);
  state.playTimer = null;
  const b = document.getElementById("tlPlay");
  if (b) { b.classList.remove("is-playing"); b.setAttribute("aria-label", "เล่นต่อเนื่อง"); }
}

function updateTimelineUI() {
  const box = document.getElementById("timeline");
  if (!box || !state.months.length) return;
  const ym = currentMonth();
  box.querySelector("#tlRange").value = state.monthIdx;
  box.querySelectorAll(".tl-tick").forEach((b) => b.classList.toggle("is-active", Number(b.dataset.i) === state.monthIdx));
  const pts = state.points.filter((p) => isVisible(p) && rowForMonth(p.code));
  const counts = {};
  for (const p of pts) { const c = sampleClass(rowForMonth(p.code)); counts[c] = (counts[c] || 0) + 1; }
  const dates = [...new Set(pts.map((p) => rowForMonth(p.code).date))].sort().map(fmtDate);
  box.querySelector("#tlLabel").textContent = `รอบ ${fmtMonth(ym)}`;
  box.querySelector("#tlDates").textContent = dates.length ? `เก็บ ${dates.join(", ")}` : "กลุ่มนี้ไม่ได้เก็บในรอบนี้";
  box.querySelector("#tlStat").innerHTML = [2, 3, 4, 5].filter((c) => counts[c])
    .map((c) => classBadge(c, `ป.${c} · ${counts[c]}`)).join("");
}

function isVisible(p) {
  return state.filter === "all" || p.group === state.filter;
}

function render() {
  for (const p of state.points) {
    const m = state.markers[p.code];
    if (isVisible(p)) { if (!state.map.hasLayer(m)) m.addTo(state.map); }
    else if (state.map.hasLayer(m)) m.remove();
  }
  const visible = state.points.filter(isVisible);
  els.listCount.textContent = `${visible.length} จุด`;
  els.siteList.innerHTML = visible.map((p) => `
    <button type="button" class="site-item ${p.code === state.selected ? "is-active" : ""}" data-code="${p.code}">
      <span class="sdot" style="background:${groupColor(p.group)}"></span>
      <span class="sstat st-${pointStatus(p.code)}"></span>
      <span class="stext">
        <span class="scode">${escapeHtml(p.code)}</span>
        <span class="sname">${escapeHtml(p.name)}</span>
      </span>
    </button>`).join("");
  els.siteList.querySelectorAll("[data-code]").forEach((btn) => {
    btn.addEventListener("click", () => selectPoint(btn.dataset.code));
  });
}

function selectPoint(code) {
  state.selected = code;
  const p = state.points.find((x) => x.code === code);
  if (!p) return;
  refreshPins();
  renderSelected();
  render();
  state.map.setView([p.latitude, p.longitude], Math.max(state.map.getZoom(), 14), { animate: true });
}

function bindPairTabs() {
  if (els.selectedBody._pairBound) return;
  els.selectedBody._pairBound = true;
  els.selectedBody.addEventListener("click", (e) => {
    const t = e.target.closest(".ptab");
    if (t && Number(t.dataset.month) >= 0) { stopPlay(); setMonth(Number(t.dataset.month)); }
  });
}

function renderSelected() {
  bindPairTabs();
  const p = state.points.find((x) => x.code === state.selected);
  if (!p) return;
  els.selectedTitle.textContent = `${p.code} · ${p.groupLabel}`;
  els.selectedBody.innerHTML = `
    <p>${escapeHtml(p.name)}</p>
    <div class="kv"><b>กลุ่ม</b><span class="tag" style="background:${groupColor(p.group)}">${escapeHtml(p.groupLabel)}</span></div>
    <div class="kv"><b>พิกัด</b><span>${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</span></div>
    <div class="kv"><b>DMS</b><span>${escapeHtml(p.dms || "")}</span></div>
    <div class="kv"><b></b><a href="https://www.google.com/maps?q=${p.latitude},${p.longitude}" target="_blank" rel="noopener">เปิดใน Google Maps ↗</a></div>
    ${resultsHtml(p.code)}`;
}

// ---------- ผลตรวจคุณภาพน้ำ ----------
function numOf(v) {
  if (v == null) return null;
  if (typeof v === "object" && "lt" in v) return v.lt;
  return typeof v === "number" ? v : null;
}

function fmtVal(v) {
  if (v == null) return "–";
  if (typeof v === "object" && "lt" in v) return `<${v.lt}`;
  return String(v);
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][m - 1];
  return `${d} ${mon} ${String(y + 543).slice(2)}`;
}

function resultsHtml(code) {
  const rows = state.results[code];
  if (!rows || !rows.length) return "";
  const ym = currentMonth();
  const cur = ym ? rowForMonth(code, ym) : rows[rows.length - 1];
  // ถ้ารอบนี้ไม่มีการเก็บ แสดงรอบก่อนหน้าที่ใกล้ที่สุด (หรือรอบแรก)
  const latest = cur || rows.filter((r) => r.date.slice(0, 7) < ym).pop() || rows[0];
  const pc = pointClass(code);

  // ---- ประเภทแหล่งน้ำทั้งปี (เหมือนสไลด์สรุป) ----
  let yearHtml = "";
  if (pc) {
    const m = CLASS_META[pc.cls];
    const dist = {};
    for (const r of rows) { const c = sampleClass(r); if (c) dist[c] = (dist[c] || 0) + 1; }
    const bar = [2, 3, 4, 5].filter((c) => dist[c]).map((c) =>
      `<span style="flex:${dist[c]};background:${CLASS_META[c].color};color:${CLASS_META[c].ink}" title="ประเภท ${c}: ${dist[c]} ครั้ง">${dist[c] / pc.n >= 0.12 ? c : ""}</span>`).join("");
    yearHtml = `
      <div class="yclass">
        <div class="ybig" style="background:${m.color};color:${m.ink}">
          <span class="ylab">ประเภทแหล่งน้ำ</span><span class="ynum">${pc.cls}</span>
        </div>
        <div class="yinfo">
          <div class="ystats"><span>DO P20 <b>${pc.do20.toFixed(2)}</b></span><span>BOD P80 <b>${pc.bod80.toFixed(2)}</b></span><span class="yunit">mg/L · ${pc.n} ครั้ง</span></div>
          <div class="ybar">${bar}</div>
          <p class="yuse">ใช้ประโยชน์: ${m.use}</p>
        </div>
      </div>
      ${pc.n < 6 ? `<p class="std-note warn">มีผลเพียง ${pc.n} ครั้ง — ใช้ดูแนวโน้มเท่านั้น</p>` : ""}`;
  }

  // ---- ค่าของรอบที่เลือก ----
  const sc = sampleClass(latest);
  const tileKeys = ["DO", "BOD", "pH", "COD", "SS", "Turb", "TDS"];
  tileKeys.push(latest.TKN != null ? "TKN" : latest["Cl-"] != null ? "Cl-" : "Temp");
  const tiles = tileKeys.map((k) => {
    const c = k === "DO" ? classOf(numOf(latest.DO), -1) : k === "BOD" ? classOf(Infinity, numOf(latest.BOD)) : null;
    const style = c ? ` style="border-color:${CLASS_META[c].color};box-shadow:inset 0 3px 0 ${CLASS_META[c].color}"` : "";
    return `<div class="rtile"${style}>
      <span class="rlabel">${PARAM_LABEL[k]}${c ? ` <em>ป.${c}</em>` : ""}</span>
      <span class="rval">${escapeHtml(fmtVal(latest[k]))}</span>
      <span class="runit">${escapeHtml(state.units[k] || "")}</span>
    </div>`;
  }).join("");

  const hist = rows.slice().reverse().map((r) => `
    <tr class="${r === latest ? "is-cur" : ""}"><td>${fmtDate(r.date)}</td><td>${classBadge(sampleClass(r), String(sampleClass(r) || "–"))}</td><td>${escapeHtml(fmtVal(r.DO))}</td><td>${escapeHtml(fmtVal(r.BOD))}</td><td>${escapeHtml(fmtVal(r.pH))}</td><td>${escapeHtml(fmtVal(r.COD))}</td><td>${escapeHtml(fmtVal(r.SS))}</td></tr>`).join("");

  return `
    <div class="results">
      ${pairHtml(code)}
      ${yearHtml}
      <div class="results-head">
        <b>${cur ? `รอบ ${fmtMonth(ym)}` : "รอบนี้ไม่ได้เก็บ"}</b>
        <span>${cur ? "" : "แสดงรอบ "}${fmtDate(latest.date)} ${classBadge(sc)}</span>
      </div>
      <div class="rtiles ${cur ? "" : "is-stale"}">${tiles}</div>
      <details class="history">
        <summary>ผลย้อนหลัง ${rows.length} ครั้ง</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>วันที่</th><th>ประเภท</th><th>DO</th><th>BOD</th><th>pH</th><th>COD</th><th>SS</th></tr></thead>
          <tbody>${hist}</tbody>
        </table></div>
      </details>
      <p class="std-note">จัดประเภทตามมาตรฐานคุณภาพน้ำผิวดิน (กก.วล. 2537) จาก DO และ BOD ·
        ประเภทแหล่งน้ำ = DO P20 (80% ของครั้งที่ตรวจมี DO สูงกว่าค่านี้) และ BOD P80 (80% มี BOD ต่ำกว่าค่านี้) ·
        ค่า "&lt;" ใช้ค่าขีดจำกัด · ยังไม่รวม coliform และ NH₃-N</p>
    </div>`;
}

// ---------- ก่อน → หลังโรงงาน: กราฟ dumbbell รายพารามิเตอร์ ----------
const PAIR_PARAMS = ["DO", "BOD", "COD", "SS", "Turb", "Cond", "TDS", "Cl-", "pH"];
const SEV = {
  hi:     { color: "#A11D17", ink: "#fff",    label: "แย่ลงชัด" },
  mid:    { color: "#F5A65B", ink: "#3D1405", label: "แย่ลง" },
  same:   { color: "#94A3B8", ink: "#fff",    label: "ใกล้เคียง" },
  better: { color: "#155E8A", ink: "#fff",    label: "ดีขึ้น" },
};

// เกณฑ์เดียวกับสไลด์: แย่ลงชัด = เพิ่ม ≥2 เท่า หรือ DO ลด ≥2 · แย่ลง = 1.5–2 เท่า หรือ DO ลด 1–2
function pairSeverity(k, b, a) {
  const nb = numOf(b), na = numOf(a);
  if (nb == null || na == null) return null;
  if (k === "DO") {
    const d = na - nb;
    const level = d <= -2 ? "hi" : d <= -1 ? "mid" : d >= 1 ? "better" : "same";
    return { level, text: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)}` };
  }
  if (k === "pH") {
    const d = na - nb;
    return { level: Math.abs(d) >= 1 ? "mid" : "same", text: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d).toFixed(1)}` };
  }
  if (typeof b === "object" && typeof a === "object") return { level: "same", text: "<LOQ" };
  if (nb <= 0) return null;
  const r = na / nb;
  const level = r >= 2 ? "hi" : r >= 1.5 ? "mid" : r <= 1 / 1.5 ? "better" : "same";
  return { level, text: `×${r >= 10 ? r.toFixed(0) : r.toFixed(1)}` };
}

function pairRounds(pair) {
  const B = state.results[pair.before] || [], A = state.results[pair.after] || [];
  return B.map((b) => ({ b, a: A.find((x) => x.date === b.date) })).filter((x) => x.a);
}

function factoryForPair(pair) {
  return (state.monitored || []).find((f) => f.beforeCode === pair.before || f.afterCode === pair.after) || null;
}

function pairHtml(code) {
  const p = state.points.find((x) => x.code === code);
  if (!p || p.group !== "beforeafter") return "";
  const pair = pairOf(code);
  const rounds = pairRounds(pair);
  if (!rounds.length) return "";
  const ym = currentMonth() || "";
  // รอบที่แสดง = ตาม timeline ถ้ามี ไม่งั้นรอบก่อนหน้าที่ใกล้สุด หรือรอบแรก
  const sel = rounds.find((r) => r.b.date.startsWith(ym))
    || rounds.filter((r) => r.b.date.slice(0, 7) < ym).pop() || rounds[0];

  const sevOf = (r) => PAIR_PARAMS.map((k) => pairSeverity(k, r.b[k], r.a[k])).filter(Boolean);
  const tabs = rounds.map((r) => {
    const sv = sevOf(r);
    const hi = sv.filter((x) => x.level === "hi").length, mid = sv.filter((x) => x.level === "mid").length;
    const idx = state.months.indexOf(r.b.date.slice(0, 7));
    return `<button type="button" class="ptab ${r === sel ? "is-active" : ""}" data-month="${idx}">
      <b>${fmtDate(r.b.date)}</b>
      <span>${hi ? `<i style="background:${SEV.hi.color}">${hi}</i>` : ""}${mid ? `<i style="background:${SEV.mid.color};color:${SEV.mid.ink}">${mid}</i>` : ""}${!hi && !mid ? `<i style="background:${SEV.same.color}">–</i>` : ""}</span>
    </button>`;
  }).join("");

  const rows = PAIR_PARAMS.map((k) => {
    const b = sel.b[k], a = sel.a[k];
    const sv = pairSeverity(k, b, a);
    if (!sv) return "";
    const nb = numOf(b), na = numOf(a);
    const max = Math.max(nb, na) * 1.12 || 1;
    const xb = (nb / max) * 100, xa = (na / max) * 100;
    const c = SEV[sv.level];
    const lo = Math.min(xb, xa), w = Math.abs(xa - xb);
    const vcol = sv.level === "same" ? "var(--ink)" : sv.level === "mid" ? "#b45309" : c.color;
    return `<div class="db-row" title="${PARAM_LABEL[k] || k}: ก่อน ${fmtVal(b)} → หลัง ${fmtVal(a)} ${state.units[k] || ""}">
      <span class="db-lab">${PARAM_LABEL[k] || k}<small>${escapeHtml(state.units[k] || "")}</small></span>
      <span class="db-track">
        <i class="db-line" style="left:${lo}%;width:${w}%;background:${c.color}"></i>
        <i class="db-dot db-before" style="left:${xb}%"></i>
        <i class="db-dot db-after" style="left:${xa}%;background:${c.color}"></i>
        ${w < 16
          ? `<em class="db-v db-vc" style="left:${Math.min(Math.max((xa + xb) / 2, 18), 82)}%">${escapeHtml(fmtVal(b))} → <b style="color:${vcol}">${escapeHtml(fmtVal(a))}</b></em>`
          : `<em class="db-v db-vb" style="left:${xb}%">${escapeHtml(fmtVal(b))}</em>
        <em class="db-v db-va" style="left:${xa}%;color:${vcol}">${escapeHtml(fmtVal(a))}</em>`}
      </span>
      <span class="db-chg" style="background:${c.color};color:${c.ink}">${escapeHtml(sv.text)}</span>
    </div>`;
  }).join("");

  const sv = sevOf(sel);
  const count = (l) => sv.filter((x) => x.level === l).length;
  const f = factoryForPair(pair);
  return `
    <div class="pairviz">
      <div class="pv-head">
        <b>ก่อน ${pair.before} → หลัง ${pair.after}</b>
        ${f ? `<span>${escapeHtml(f.name)}${f.river ? ` · ${escapeHtml(f.river)}` : ""}</span>` : ""}
      </div>
      <div class="ptabs">${tabs}</div>
      <div class="pv-sum">${["hi", "mid", "better", "same"].filter((l) => count(l)).map((l) =>
        `<span style="background:${SEV[l].color};color:${SEV[l].ink}">${SEV[l].label} ${count(l)}</span>`).join("")}</div>
      <div class="db-legend"><span><i class="db-dot db-before"></i>ก่อนโรงงาน</span><span><i class="db-dot db-after" style="background:${SEV.hi.color}"></i>หลังโรงงาน</span><span class="db-legend-r">เปลี่ยนแปลง</span></div>
      <div class="db">${rows}</div>
      <p class="std-note">×เท่า = หลัง ÷ ก่อน · DO/pH = หลัง − ก่อน · แดง = เพิ่ม ≥2 เท่า หรือ DO ลด ≥2 mg/L ·
        ส้ม = 1.5–2 เท่า หรือ DO ลด 1–2 · น้ำเงิน = ดีขึ้น · แต่ละแถวใช้สเกลของตัวเอง · ค่า "&lt;" ใช้ค่าขีดจำกัด · &lt;LOQ = ต่ำกว่าค่าที่วัดได้ทั้งก่อนและหลัง</p>
    </div>`;
}

function fitToVisible() {
  const visible = state.points.filter(isVisible);
  const pts = visible.map((p) => [p.latitude, p.longitude]);
  // include river extent when showing all / แม่น้ำกวง
  if (state.river && (state.filter === "all" || state.filter === "kuang")) {
    for (const c of state.river) pts.push(c);
  }
  if (!pts.length) return;
  state.map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 14 });
}

init();
