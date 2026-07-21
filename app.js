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
  const [data, rivers, otherRivers, reservoir, maekha] = await Promise.all([
    fetch("data.json?v=3").then((r) => r.json()),
    fetch("rivers.geojson?v=4").then((r) => r.json()).catch(() => null),
    fetch("rivers_other.geojson?v=2").then((r) => r.json()).catch(() => null),
    fetch("reservoir.geojson?v=1").then((r) => r.json()).catch(() => null),
    fetch("maekha.geojson?v=1").then((r) => r.json()).catch(() => null),
  ]);
  state.points = (data.points || []).filter((p) => p.latitude && p.longitude);
  state.landmarks = data.landmarks || [];
  setupMap();
  if (otherRivers) addOtherRivers(otherRivers);   // subtle background rivers
  if (reservoir) addReservoir(reservoir);         // Mae Kuang reservoir (water body)
  if (maekha) addFlowRiver(maekha, MAEKHA, "คลองแม่ข่า", "maekha");  // prominent Mae Kha canal
  if (rivers) addRiver(rivers);                    // prominent Mae Kuang (upper + middle + lower)
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

  // panes (low → high): reservoir < other rivers < connector < prominent Mae Kuang
  state.map.createPane("reservoir");
  state.map.getPane("reservoir").style.zIndex = 330;
  state.map.createPane("riverOther");
  state.map.getPane("riverOther").style.zIndex = 340;
  state.map.createPane("maekha");
  state.map.getPane("maekha").style.zIndex = 348;
  state.map.createPane("river");
  state.map.getPane("river").style.zIndex = 350;
}

function groupColor(group) {
  return (GROUP_META[group] || {}).color || "#697386";
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
      const name = (f.properties && f.properties.name) || "สายน้ำ (ไม่ระบุชื่อ)";
      layer.bindTooltip(name, { sticky: true, direction: "top", className: "river-tip" });
      layer.on("mouseover", () => layer.setStyle({ opacity: 0.9, weight: 6 }));
      layer.on("mouseout", () => layer.setStyle({ opacity: 0 }));
    },
  }).addTo(state.map);
}

// ---------- Reservoir (อ่างเก็บน้ำแม่กวง) ----------
function addReservoir(geojson) {
  L.geoJSON(geojson, {
    pane: "reservoir",
    style: { color: "#38bdf8", weight: 1.5, opacity: 0.7, fillColor: "#7dd3fc", fillOpacity: 0.5 },
  }).bindTooltip("อ่างเก็บน้ำแม่กวง", { sticky: true, direction: "top", className: "river-tip" })
    .addTo(state.map);
}

// ---------- Generic prominent flowing waterway (glow + body + animated flow) ----------
function addFlowRiver(geojson, colors, label, paneName) {
  const lines = geojson.features
    .filter((f) => f.geometry?.type === "LineString")
    .map((f) => f.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
  if (!lines.length) return [];
  const pane = { pane: paneName, lineCap: "round", lineJoin: "round" };

  for (const line of lines) {
    // 1) soft outer glow
    L.polyline(line, { ...pane, color: colors.glow, weight: 18, opacity: 0.18 }).addTo(state.map);
    // 2) main body (hover shows name)
    L.polyline(line, { ...pane, color: colors.color, weight: 6, opacity: 0.75 })
      .bindTooltip(label, { sticky: true, direction: "top", className: "river-tip" })
      .addTo(state.map);
    // 3) animated downstream flow dashes (each part ordered source -> downstream)
    L.polyline(line, {
      ...pane, color: colors.flow, weight: 3, opacity: 0.95,
      dashArray: "10 20", className: "river-flow",
    }).addTo(state.map);
  }
  return lines;
}

// ---------- River (prominent Mae Kuang — upper + middle + lower parts) ----------
function addRiver(geojson) {
  const lines = addFlowRiver(geojson, RIVER, "แม่น้ำกวง", "river");
  state.river = lines.flat();
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
