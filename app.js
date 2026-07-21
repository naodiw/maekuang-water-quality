const GROUP_META = {
  kuang:       { label: "แม่น้ำกวง",            color: "#1478a8" },
  maekha:      { label: "คลองแม่ข่า",           color: "#7c3aed" },
  beforeafter: { label: "จุดก่อน-หลังโรงงาน",   color: "#d97706" },
};

const state = {
  points: [],
  map: null,
  markers: {},      // code -> L.marker
  selected: null,
  filter: "all",    // "all" | group key
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
  const data = await fetch("data.json?v=1").then((r) => r.json());
  state.points = (data.points || []).filter((p) => p.latitude && p.longitude);
  setupMap();
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
}

function groupColor(group) {
  return (GROUP_META[group] || {}).color || "#697386";
}

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
      buildFilters();
      render();
      fitToVisible();
    });
  });
}

function addMarkers() {
  for (const p of state.points) {
    const marker = L.marker([p.latitude, p.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="pin" style="background:${groupColor(p.group)}"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
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
  // markers visibility
  for (const p of state.points) {
    const m = state.markers[p.code];
    if (isVisible(p)) {
      if (!state.map.hasLayer(m)) m.addTo(state.map);
    } else if (state.map.hasLayer(m)) {
      m.remove();
    }
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

  // marker highlight
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
  if (!visible.length) return;
  const bounds = L.latLngBounds(visible.map((p) => [p.latitude, p.longitude]));
  state.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
}

init();
