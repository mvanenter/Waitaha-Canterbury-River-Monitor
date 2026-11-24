export const feedUrl = "https://gis1.ecan.govt.nz/arcgis/rest/services/Public/WaterQualityandMonitoring/FeatureServer/12/query";
export const fields = ["SITENUMBER", "SITENAME", "Last_sample", "Current_stage_height_m", "Current_flow_m3s", "Change_last_hour_mm", "Peak_flow_7_day"];
const day = 86_400_000;

export function statusOf(station, now = Date.now()) {
  const { Last_sample: time, Change_last_hour_mm: change } = station;
  if (!Number.isFinite(time) || time > now) return "missing";
  if (now - time >= day) return "older";
  if (!Number.isFinite(change)) return "missing";
  if (change > 0) return "rising";
  if (change < 0) return "falling";
  return "steady";
}

function ringPosition([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    if (Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-12 &&
        x >= Math.min(ax, bx) && x <= Math.max(ax, bx) &&
        y >= Math.min(ay, by) && y <= Math.max(ay, by)) return 0;
    if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
  }
  return inside ? 1 : -1;
}

export function inRegion(point, boundary) {
  return boundary.features.some(({ geometry }) => {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some(([outer, ...holes]) =>
      ringPosition(point, outer) >= 0 && holes.every(hole => ringPosition(point, hole) <= 0));
  });
}

export function selectCanterbury(payload, boundary) {
  if (!Array.isArray(payload.features) || payload.exceededTransferLimit || payload.error) {
    throw new Error("Incomplete or invalid gauge response");
  }
  const sites = new Map();
  for (const { attributes, geometry } of payload.features) {
    if (!attributes || !geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y) ||
        !Number.isFinite(attributes.SITENUMBER) || !attributes.SITENAME ||
        !inRegion([geometry.x, geometry.y], boundary)) continue;
    const next = { ...attributes, lng: geometry.x, lat: geometry.y };
    const previous = sites.get(next.SITENUMBER);
    if (!previous || (next.Last_sample ?? -Infinity) > (previous.Last_sample ?? -Infinity)) {
      sites.set(next.SITENUMBER, next);
    }
  }
  if (!sites.size) throw new Error("The feed returned no Canterbury stations");
  return [...sites.values()];
}
