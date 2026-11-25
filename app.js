import { readHistory, recordLevels, plotLevel } from "./history.mjs";
import { comparisonLink, feedUrl, fields, selectCanterbury, statusOf } from "./data.mjs";

const $ = selector => document.querySelector(selector);
const statuses = {
  all: ["All stations", "#142d42"], rising: ["Rising", "#a85b00"],
  falling: ["Falling", "#0369a1"], steady: ["No change", "#475569"],
  older: ["Readings 24+ hours old", "#334155"], missing: ["No trend data", "#75517a"]
};
const dateFormat = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short"
});
const ageFormat = new Intl.RelativeTimeFormat("en-NZ");
const slots = ["a", "b"];
const requestedPins = new URLSearchParams(globalThis.location?.search);
const pinSelection = { a: requestedPins.get("a") ?? "1071105", b: requestedPins.get("b") ?? "69203" };
const numberFormat = new Intl.NumberFormat("en-NZ", { maximumFractionDigits: 2 });
const timeText = value => Number.isFinite(value) ? dateFormat.format(value) : "Not reported";
const numberText = value => Number.isFinite(value) ? numberFormat.format(value) : "Not reported";
const cacheKey = "waitaha-observations-v1";
let stations = [];
let levelHistory = readHistory();
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

function observationText(value, now = Date.now()) {
  if (!Number.isFinite(value)) return "Not reported";
  if (value > now) return timeText(value);
  const minutes = Math.floor((now - value) / 60_000);
  const age = minutes >= 1440 ? ageFormat.format(-Math.floor(minutes / 1440), "day")
    : minutes >= 60 ? ageFormat.format(-Math.floor(minutes / 60), "hour")
    : minutes > 0 ? ageFormat.format(-minutes, "minute") : "just now";
  return `${timeText(value)} · Observed ${age}`;
}

function selectedStation(slot) {
  const id = $("#station-" + slot).value;
  return stations.find(row => String(row.SITENUMBER) === id);
}

function levelChart(station) {
  const now = Date.now();
  const points = (levelHistory[station.SITENUMBER] ?? []).filter(
    ([time]) => time >= now - 86_400_000 && time <= now);
  const section = element("section", null, "level-chart");
  section.append(element("h3", "Water level over the past 24 hours"));
  section.append(element("p", "Checks for new readings automatically every 5 minutes while this page is open. Refresh readings is optional."));
  if (points.length < 2) {
    section.append(element("p", "The chart appears once this browser has saved two readings with different observation times."));
    return section;
  }
  const canvas = element("canvas");
  canvas.width = 480;
  canvas.height = 165;
  canvas.setAttribute("role", "img");
  const first = points[0], last = points.at(-1);
  canvas.setAttribute("aria-label",
    `Water level at ${station.SITENAME}. First saved reading: ${first[1]} metres at ${timeText(first[0])}. Latest saved reading: ${last[1]} metres at ${timeText(last[0])}.`);
  plotLevel(canvas, points, now);
  const coveredMinutes = Math.round((last[0] - first[0]) / 60_000);
  const hours = Math.floor(coveredMinutes / 60);
  const minutes = coveredMinutes % 60;
  const span = hours ? `${hours} h ${minutes} min` : `${minutes} min`;
  section.append(canvas, element("p",
    `${points.length} readings saved in this browser · ${span} from first to last · NZ local time`));
  return section;
}

function waterLevelReading(station) {
  const reading = element("div", null, "level-reading");
  const level = station.Current_stage_height_m;
  const change = station.Change_last_hour_mm;
  const changeText = !Number.isFinite(change) ? "Hourly change not reported"
    : change === 0 ? "No water-level change in the last hour"
    : `${change > 0 ? "Rose" : "Fell"} ${numberText(Math.abs(change))} mm in the hour before this reading`;
  const observed = Number.isFinite(station.Last_sample)
    ? observationText(station.Last_sample) : "Observation time not reported";
  reading.append(
    element("span", "Water level", "level-label"),
    element("strong", Number.isFinite(level) ? `${numberText(level)} m` : "Not reported", "level-value"),
    element("span", changeText, "level-context"),
    element("span", observed, "level-context")
  );

  return reading;
}

function details(station) {
  const detailsPanel = element("div");
  const list = element("dl");
  const rows = [
    ["Current flow (m³/s)", numberText(station.Current_flow_m3s)],
    ["7-day peak flow (m³/s)", numberText(station.Peak_flow_7_day)]
  ];
  for (const [label, value] of rows) {
    const row = element("div");
    row.append(element("dt", label), element("dd", value));
    list.append(row);
  }
  detailsPanel.append(waterLevelReading(station), levelChart(station), list);
  return detailsPanel;
}

function pin(station, slot) {
  const select = $("#station-" + slot);
  select.value = String(station.SITENUMBER);
  pinSelection[slot] = select.value;
  render();
}

function renderComparison(slot) {
  const station = selectedStation(slot);
  $("#details-" + slot).replaceChildren(station ? details(station) : element("p", "Choose a station.", "hint"));
}

function populateComparison() {
  const alphabetical = [...stations].sort((a, b) => a.SITENAME.localeCompare(b.SITENAME, "en-NZ"));
  for (const slot of slots) {
    const select = $("#station-" + slot);
    const prior = pinSelection[slot];
    const placeholder = new Option("Choose a station", "");
    select.replaceChildren(placeholder, ...alphabetical.map(row => new Option(row.SITENAME, row.SITENUMBER)));
    select.value = alphabetical.some(row => String(row.SITENUMBER) === prior)
      ? prior : "";
    if (select.selectedIndex < 0) select.value = "";
  }
}

function popup(station) {
  const panel = element("div", null, "gauge-popup-summary");
  const actions = element("div", null, "gauge-popup-actions");
  panel.append(element("strong", station.SITENAME), waterLevelReading(station), actions);
  for (const slot of slots) {
    const button = element("button", "Pin as " + slot.toUpperCase());
    button.type = "button";
    button.addEventListener("click", () => pin(station, slot));
    actions.append(button);
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

function render({ redrawMarkers = true } = {}) {
  const bounds = map.getBounds();
  const now = Date.now();
  const counts = Object.fromEntries(Object.keys(statuses).map(key => [key, 0]));
  const visible = [];
  const pinned = new Map();
  const hasSelection = slots.some(slot => selectedStation(slot));
  $("#share-comparison").disabled = $("#copy-results").disabled = !hasSelection;
  for (const slot of slots) {
    const station = selectedStation(slot);
    $("#pinned-" + slot).textContent = station?.SITENAME ?? "Choose a station";
    if (station) {
      const id = station.SITENUMBER;
      pinned.set(id, [...(pinned.get(id) ?? []), slot.toUpperCase()]);
    }
    renderComparison(slot);
  }
  if (redrawMarkers) {
    markers.clearLayers();
    stationMarkers.clear();
  }
  for (const station of stations) {
    const position = [station.lat, station.lng];
    const status = statusOf(station, now);
    const [, tone] = statuses[status];
    if (bounds.contains(position)) {
      counts.all++;
      counts[status]++;
      if (filter === "all" || filter === status) visible.push({ station, status, tone });
    }
    if (!redrawMarkers || (filter !== "all" && filter !== status)) continue;
    const marker = L.circleMarker(position, {
      radius: 5, color: tone, weight: 2,
      fillColor: tone, fillOpacity: ["missing", "older"].includes(status) ? 0 : 0.9
    });
    marker.bindPopup(() => popup(station), {
      className: "gauge-popup", maxWidth: 225, minWidth: 145,
      maxHeight: 165, autoPan: true, autoPanPadding: [12, 12]
    }).addTo(markers);
    const labels = pinned.get(station.SITENUMBER);
    if (labels) {
      marker.bindTooltip(labels.join(" / "), {
        permanent: true, direction: "top", offset: [0, -4], className: "comparison-badge"
      });
    }
    stationMarkers.set(station.SITENUMBER, marker);
  }
  for (const [key, { button, total }] of countButtons) {
    total.textContent = lastFetch === null ? "–" : counts[key];
    button.setAttribute("aria-pressed", String(filter === key));
  }
  $("#visible").textContent = `${counts.all} in view · ${stations.length} in Canterbury`;
  renderStationList(visible, now);
}

function renderStationList(visible, now) {
  const matches = visible.sort((a, b) => (a.station.Last_sample ?? 0) - (b.station.Last_sample ?? 0)
    || a.station.SITENAME.localeCompare(b.station.SITENAME));
  $("#stations").replaceChildren(...matches.map(({ station, status, tone }) => {
    const item = element("li");
    const dot = element("span", null, ["older", "missing"].includes(status) ? "dot hollow" : "dot");
    dot.style.setProperty("--tone", tone);
    dot.title = statuses[status][0];
    const button = element("button", station.SITENAME, "station-link");
    button.append(element("small", observationText(station.Last_sample, now)));
    button.addEventListener("click", () => {
      stationMarkers.get(station.SITENUMBER)?.openPopup();
    });
    item.append(dot, button);
    for (const slot of slots) {
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
    levelHistory = recordLevels(levelHistory, next);
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
for (const slot of slots) {
  $("#station-" + slot).addEventListener("change", event => {
    pinSelection[slot] = event.target.value;
    render();
  });
}

async function copyComparison(text, label) {
  const fallback = $("#comparison-copy");
  try {
    await navigator.clipboard.writeText(text);
    fallback.hidden = true;
    $("#share-status").textContent = `${label} copied.`;
  } catch {
    fallback.value = text;
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    $("#share-status").textContent = `Press Ctrl+C to copy the selected ${label.toLowerCase()}.`;
  }
}

$("#share-comparison").addEventListener("click", () =>
  copyComparison(comparisonLink(location.href, $("#station-a").value, $("#station-b").value), "Comparison link"));

$("#copy-results").addEventListener("click", () => {
  const unit = (value, suffix) => Number.isFinite(value) ? `${numberText(value)} ${suffix}` : "Not reported";
  const sections = ["Waitaha Canterbury River Monitor", "Source: Environment Canterbury (provisional observations). Times shown in New Zealand local time."];
  for (const slot of slots) {
    const station = selectedStation(slot);
    if (!station) continue;
    sections.push([
      `Station ${slot.toUpperCase()} · ${station.SITENAME}`,
      `Last observed: ${timeText(station.Last_sample)}`,
      `Water level: ${unit(station.Current_stage_height_m, "m")}`,
      `Water-level change in the preceding hour: ${unit(station.Change_last_hour_mm, "mm")}`,
      `Current flow: ${unit(station.Current_flow_m3s, "m³/s")}`,
      `7-day peak flow: ${unit(station.Peak_flow_7_day, "m³/s")}`
    ].join("\n"));
  }
  return copyComparison(sections.join("\n\n"), "Comparison results");
});

// Keep the open pop-up attached when Leaflet pans to make room for it.
map.on("moveend", () => render({ redrawMarkers: false }));

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
