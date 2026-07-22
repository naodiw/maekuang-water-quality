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

const state = {
  points: [],
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
  const [data, rivers, otherRivers, reservoir, maekha, facts, factories] = await Promise.all([
    fetch("data.json?v=3").then((r) => r.json()),
    fetch("rivers.geojson?v=4").then((r) => r.json()).catch(() => null),
    fetch("rivers_other.geojson?v=2").then((r) => r.json()).catch(() => null),
    fetch("reservoir.geojson?v=1").then((r) => r.json()).catch(() => null),
    fetch("maekha.geojson?v=1").then((r) => r.json()).catch(() => null),
    fetch("river_facts.json?v=1").then((r) => r.json()).catch(() => null),
    fetch("factories.json?v=1").then((r) => r.json()).catch(() => null),
  ]);
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
  render();
  fitToVisible();
  setupLegend();
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
  const src = (state.facts && state.facts.meta && state.facts.meta.source) || "";
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
const FACTORY_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V11l5 3V11l5 3V8l5 3V5h2v16H3z"/><rect x="5" y="16" width="2" height="3"/><rect x="10" y="16" width="2" height="3"/><rect x="15" y="16" width="2" height="3"/></svg>`;

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
  };
  return buildRiverPopup(fact);
}

function addFactories() {
  for (const f of state.factories) {
    if (!f.latitude || !f.longitude) continue;
    const cls = f.nearRiver === "maekha" ? "fm-maekha" : "";
    const m = L.marker([f.latitude, f.longitude], {
      pane: "factories",
      icon: L.divIcon({
        className: "",
        html: `<div class="factory-pin ${cls}">${FACTORY_SVG}</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
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
        html: `<div class="factory-pin fm-monitored">${FACTORY_SVG}</div>`,
        iconSize: [26, 26], iconAnchor: [13, 13],
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
      buildFilters(); render(); fitToVisible();
    });
  });
}

// ---------- Markers ----------
function addMarkers() {
  for (const p of state.points) {
    const marker = L.marker([p.latitude, p.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="pin pin-${p.group}" style="background:${groupColor(p.group)}"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      }),
    });
    marker.bindTooltip(`${p.code} · ${p.name}`, { direction: "top", offset: [0, -8] });
    marker.on("click", () => selectPoint(p.code));
    marker.addTo(state.map);
    state.markers[p.code] = marker;
  }
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
  for (const [c, m] of Object.entries(state.markers)) {
    const pin = m.getElement()?.querySelector(".pin");
    if (pin) pin.classList.toggle("is-active", c === code);
  }
  els.selectedTitle.textContent = `${p.code} · ${p.groupLabel}`;
  els.selectedBody.innerHTML = `
    <p>${escapeHtml(p.name)}</p>
    <div class="kv"><b>กลุ่ม</b><span class="tag" style="background:${groupColor(p.group)}">${escapeHtml(p.groupLabel)}</span></div>
    <div class="kv"><b>พิกัด</b><span>${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}</span></div>
    <div class="kv"><b>DMS</b><span>${escapeHtml(p.dms || "")}</span></div>
    <div class="kv"><b></b><a href="https://www.google.com/maps?q=${p.latitude},${p.longitude}" target="_blank" rel="noopener">เปิดใน Google Maps ↗</a></div>`;
  render();
  state.map.setView([p.latitude, p.longitude], Math.max(state.map.getZoom(), 14), { animate: true });
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
