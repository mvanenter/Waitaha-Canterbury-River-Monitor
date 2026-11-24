import { feedUrl, fields, selectCanterbury, statusOf } from "./data.mjs";

const $ = selector => document.querySelector(selector);
const statuses = {
  all: ["All stations", "#142d42"], rising: ["Rising", "#a85b00"],
  falling: ["Falling", "#0369a1"], steady: ["No change", "#475569"],
  older: ["Readings 24+ hours old", "#334155"], missing: ["No trend data", "#75517a"]
};
const dateFormat = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short"
});
const numberFormat = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 2 });
const timeText = value => Number.isFinite(value) ? dateFormat.format(value) : "Not reported";
const numberText = value => Number.isFinite(value) ? numberFormat.format(value) : "Not reported";
const cacheKey = "waitaha-observations-v1";
let stations = [];
let filter = "all";
let lastFetch = null;
let boundary;
let refreshing = false;
let refreshFailed = false;

const map = L.map("map").setView([-43.55, 171.8], 7);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  maxZoom: 19
}).addTo(map);
const markers = L.layerGroup().addTo(map);
let regionLayer;
$("#reset").disabled = true;
$("#reset").addEventListener("click", () => map.fitBounds(regionLayer.getBounds(), { padding: [18, 18] }));

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value != null) node.textContent = value;
  if (className) node.className = className;
  return node;
}

function details(station) {
  const list = element("dl");
  const rows = [
    ["Last observed", timeText(station.Last_sample)],
    ["Water level (m)", numberText(station.Current_stage_height_m)],
    ["Current flow (m³/s)", numberText(station.Current_flow_m3s)],
    ["Hourly water-level change (mm)", numberText(station.Change_last_hour_mm)],
    ["7-day peak flow (m³/s)", numberText(station.Peak_flow_7_day)]
  ];
  for (const [label, value] of rows) {
    const row = element("div");
    row.append(element("dt", label), element("dd", value));
    list.append(row);
  }
  return list;
}

function pin(station, slot) {
  const select = $("#station-" + slot);
  select.value = String(station.SITENUMBER);
  renderComparison(slot);
}

function renderComparison(slot) {
  const id = $("#station-" + slot).value;
  const station = stations.find(row => String(row.SITENUMBER) === id);
  $("#details-" + slot).replaceChildren(station ? details(station) : element("p", "Choose a station.", "hint"));
}

function populateComparison() {
  const alphabetical = [...stations].sort((a, b) => a.SITENAME.localeCompare(b.SITENAME, "en-NZ"));
  for (const slot of ["a", "b"]) {
    const select = $("#station-" + slot);
    const prior = select.value;
    const placeholder = new Option("Choose a station", "");
    select.replaceChildren(placeholder, ...alphabetical.map(row => new Option(row.SITENAME, row.SITENUMBER)));
    select.value = alphabetical.some(row => String(row.SITENUMBER) === prior)
      ? prior : prior ? "" : (slot === "a" ? "1071105" : "69203");
    if (select.selectedIndex < 0) select.value = "";
    renderComparison(slot);
  }
}

function popup(station) {
  const panel = element("div");
  panel.append(element("strong", station.SITENAME), details(station));
  for (const slot of ["a", "b"]) {
    const button = element("button", "Pin as " + slot.toUpperCase());
    button.type = "button";
    button.addEventListener("click", () => pin(station, slot));
    panel.append(button);
  }
  return panel;
}

const countButtons = new Map();
const stationMarkers = new Map();
for (const [key, [label, tone]] of Object.entries(statuses)) {
  const button = element("button", null, "count");
  button.type = "button";
  button.style.setProperty("--tone", tone);
  const total = element("strong", "–");
  button.append(element("span", label), total);
  button.addEventListener("click", () => {
    filter = filter === key ? "all" : key;
    render();
  });
  countButtons.set(key, { button, total });
  $("#counts").append(button);
}

function render() {
  const bounds = map.getBounds();
  const now = Date.now();
  const counts = Object.fromEntries(Object.keys(statuses).map(key => [key, 0]));
  const visible = [];
  markers.clearLayers();
  stationMarkers.clear();
  for (const station of stations) {
    const position = [station.lat, station.lng];
    const status = statusOf(station, now);
    const [, tone] = statuses[status];
    if (bounds.contains(position)) {
      counts.all++;
      counts[status]++;
      if (filter === "all" || filter === status) visible.push({ station, status, tone });
    }
    if (filter !== "all" && filter !== status) continue;
    const marker = L.circleMarker(position, {
      radius: 5, color: tone, weight: 2,
      fillColor: tone, fillOpacity: ["missing", "older"].includes(status) ? 0 : 0.9
    });
    marker.bindPopup(() => popup(station), { autoPan: false }).addTo(markers);
    stationMarkers.set(station.SITENUMBER, marker);
  }
  for (const [key, { button, total }] of countButtons) {
    total.textContent = lastFetch === null ? "–" : counts[key];
    button.setAttribute("aria-pressed", String(filter === key));
  }
  $("#visible").textContent = `${counts.all} in view · ${stations.length} in Canterbury`;
  renderStationList(visible);
}

function renderStationList(visible) {
  const matches = visible.sort((a, b) => (a.station.Last_sample ?? 0) - (b.station.Last_sample ?? 0)
    || a.station.SITENAME.localeCompare(b.station.SITENAME));
  $("#stations").replaceChildren(...matches.map(({ station, status, tone }) => {
    const item = element("li");
    const dot = element("span", null, ["older", "missing"].includes(status) ? "dot hollow" : "dot");
    dot.style.setProperty("--tone", tone);
    dot.title = statuses[status][0];
    const button = element("button", station.SITENAME, "station-link");
    button.append(element("small", timeText(station.Last_sample)));
    button.addEventListener("click", () => {
      stationMarkers.get(station.SITENUMBER)?.openPopup();
    });
    item.append(dot, button);
    for (const slot of ["a", "b"]) {
      const letter = slot.toUpperCase();
      const control = element("button", letter, "pin");
      control.setAttribute("aria-label", `Pin ${station.SITENAME} as Station ${letter}`);
      control.addEventListener("click", () => pin(station, slot));
      item.append(control);
    }
    return item;
  }));
  if (!matches.length) {
    const message = !lastFetch ? "Awaiting readings."
      : "No matching stations in view.";
    $("#stations").append(element("li", message));
  }
}

function showHealth() {
  const feed = $("#feed");
  const time = lastFetch === null ? "" : timeText(lastFetch);
  feed.classList.toggle("warning", refreshFailed);
  feed.textContent = refreshFailed
    ? time ? `Refresh failed. Showing readings from ${time}.` : "Refresh failed. No saved readings are available."
    : time ? `Last successful refresh · ${time}` : "Connecting to the Environment Canterbury feed…";
}

async function refresh() {
  if (refreshing || !boundary) return;
  refreshing = true;
  $("#refresh").disabled = true;
  try {
    const params = new URLSearchParams({
      where: "1=1", outFields: fields.join(","), returnGeometry: "true", outSR: "4326", f: "json"
    });
    const response = await fetch(`${feedUrl}?${params}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`ECan HTTP ${response.status}`);
    const payload = await response.json();
    const next = selectCanterbury(payload, boundary);
    stations = next;
    lastFetch = Date.now();
    refreshFailed = false;
    try { localStorage.setItem(cacheKey, JSON.stringify({ payload, lastFetch })); } catch { /* In-memory fallback remains available. */ }
    populateComparison();
  } catch (error) {
    console.warn("Gauge refresh failed:", error);
    refreshFailed = true;
  } finally {
    refreshing = false;
    $("#refresh").disabled = false;
    showHealth();
    render();
  }
}

$("#refresh").addEventListener("click", refresh);
for (const slot of ["a", "b"]) $("#station-" + slot).addEventListener("change", () => renderComparison(slot));
map.on("moveend", render);

async function initialise() {
  let response;
  try {
    response = await fetch("boundary.geojson");
    if (!response.ok) throw new Error(`Boundary HTTP ${response.status}`);
    boundary = await response.json();
    if (boundary.features?.length !== 1) throw new Error("Expected one Canterbury boundary");
    regionLayer = L.geoJSON(boundary, {
      interactive: false, style: { color: "#8a5365", weight: 2, fill: false }
    }).addTo(map);
    $("#reset").disabled = false;
    $("#reset").click();
  } catch (error) {
    boundary = undefined;
    $("#feed").textContent = "Canterbury boundary unavailable. Reload the page to try again.";
    $("#feed").classList.add("warning");
    $("#refresh").disabled = true;
    console.warn(error);
    return;
  }
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached && Number.isFinite(cached.lastFetch)) {
      stations = selectCanterbury(cached.payload, boundary);
      lastFetch = cached.lastFetch;
      $("#feed").textContent = `Checking for new readings. Saved refresh · ${timeText(lastFetch)}.`;
      populateComparison();
      render();
    }
  } catch (error) {
    console.warn("Unable to restore cached readings:", error);
  }
  await refresh();
  setInterval(refresh, 5 * 60_000);
}
initialise();
