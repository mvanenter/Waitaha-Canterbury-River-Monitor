import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { statusOf } from "../data.mjs";

test("zero hourly change is distinct from missing data", () => {
  const now = Date.UTC(2026, 10, 25);
  assert.equal(statusOf({ Last_sample: now, Change_last_hour_mm: 0 }, now), "steady");
  assert.equal(statusOf({ Last_sample: now, Change_last_hour_mm: null }, now), "missing");
});

test("the 24-hour cutoff is inclusive", () => {
  const now = Date.UTC(2026, 10, 25);
  const station = { Last_sample: now - 86_400_000, Change_last_hour_mm: 5 };
  assert.equal(statusOf(station, now), "older");
  assert.equal(statusOf({ ...station, Last_sample: station.Last_sample + 1 }, now), "rising");
});

test("an invalid refresh keeps the last good station rows and shows a warning", async t => {
  class Element {
    children = [];
    style = { setProperty() {} };
    classList = { toggle() {}, add() {} };
    value = "";
    events = new Map();
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(name, handler) { this.events.set(name, handler); }
    click() { return this.events.get("click")?.(); }
    setAttribute() {}
  }

  // Use the actual HTML IDs so a broken startup selector fails this test.
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => ["#" + id, new Element()]));
  const map = {
    setView() { return this; },
    fitBounds() {},
    on() {},
    getBounds() { return { contains: () => true }; }
  };
  const leafletLayer = {
    addTo() { return this; }, getBounds() {}, clearLayers() {},
    bindPopup() { return this; }, bindTooltip() { return this; }
  };
  const boundary = JSON.parse(readFileSync(new URL("../boundary.geojson", import.meta.url)));
  let invalid = false;
  const payload = { features: [{
    attributes: { SITENUMBER: 66204, SITENAME: "Ashley Gorge", Last_sample: Date.now(),
      Change_last_hour_mm: 0, Current_flow_m3s: 0, Current_stage_height_m: 0 },
    geometry: { x: 172.126, y: -43.236 }
  }] };

  const globals = {
    document: { querySelector: selector => nodes.get(selector) ?? null, createElement: () => new Element() },
    L: { map: () => map, tileLayer: () => leafletLayer, layerGroup: () => leafletLayer,
      geoJSON: () => leafletLayer, circleMarker: () => leafletLayer },
    Option: class { constructor(label, value) { Object.assign(this, { label, value }); } },
    localStorage: { getItem: () => null, setItem() {} },
    fetch: async url => ({ ok: true, json: async () => url === "boundary.geojson"
      ? boundary : invalid ? { error: { message: "Test feed error" } } : payload }),
    setInterval: () => 0
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  t.mock.method(console, "warn", () => {});

  await import("../app.js");
  await setImmediate();
  const feed = nodes.get("#feed");
  const readings = nodes.get("#stations");
  const firstName = () => readings.children[0]?.children[1]?.textContent;
  assert.match(feed.textContent, /^Last successful refresh/);
  assert.equal(firstName(), "Ashley Gorge");

  readings.children[0].children[2].click();
  const levelCard = nodes.get("#details-a").children[0].children[0];
  assert.equal(levelCard.children[1].textContent, "0 m");
  assert.match(levelCard.children[2].textContent, /^No water-level change/);

  invalid = true;
  await nodes.get("#refresh").click();
  assert.match(feed.textContent, /^Refresh failed\. Showing readings/);
  assert.equal(firstName(), "Ashley Gorge");
  assert.equal(nodes.get("#refresh").disabled, false);
});
