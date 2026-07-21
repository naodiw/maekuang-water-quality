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

const state = {
  points: [],
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
  const [data, rivers, otherRivers] = await Promise.all([
    fetch("data.json?v=2").then((r) => r.json()),
    fetch("rivers.geojson?v=2").then((r) => r.json()).catch(() => null),
    fetch("rivers_other.geojson?v=1").then((r) => r.json()).catch(() => null),
  ]);
  state.points = (data.points || []).filter((p) => p.latitude && p.longitude);
  setupMap();
  if (otherRivers) addOtherRivers(otherRivers);   // subtle background rivers
  if (rivers) addRiver(rivers);                    // prominent Mae Kuang (on top)
  buildFilters();
  addMarkers();
  render();
  fitToVisible();
}

function setupMap() {
  state.map = L.map("map", { zoomControl: false }).setView([18.7, 99.0], 11);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(state.map);

  // panes: other rivers (subtle) sit below the prominent Mae Kuang, both above tiles / below markers
  state.map.createPane("riverOther");
  state.map.getPane("riverOther").style.zIndex = 340;
  state.map.createPane("river");
  state.map.getPane("river").style.zIndex = 350;
}

function groupColor(group) {
  return (GROUP_META[group] || {}).color || "#697386";
}

// ---------- Other rivers (subtle background, no animation) ----------
function addOtherRivers(geojson) {
  L.geoJSON(geojson, {
    pane: "riverOther",
    interactive: false,
    style: { color: "#6ba6cc", weight: 1.8, opacity: 0.55, lineCap: "round", lineJoin: "round" },
  }).addTo(state.map);
}

// ---------- River (prominent Mae Kuang) ----------
function addRiver(geojson) {
  const feat = geojson.features.find((f) => f.geometry?.type === "LineString");
  if (!feat) return;
  const line = feat.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  state.river = line;
  const pane = { pane: "river", lineCap: "round", lineJoin: "round" };

  // 1) soft outer glow
  L.polyline(line, { ...pane, color: RIVER.glow, weight: 18, opacity: 0.18 }).addTo(state.map);
  // 2) main body
  L.polyline(line, { ...pane, color: RIVER.color, weight: 6, opacity: 0.75 }).addTo(state.map);
  // 3) animated downstream flow dashes (start -> end = north -> south)
  //    the moving dashes convey flow direction on their own — no arrow markers
  L.polyline(line, {
    ...pane, color: RIVER.flow, weight: 3, opacity: 0.95,
    dashArray: "10 20", className: "river-flow",
  }).addTo(state.map);
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
