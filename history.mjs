const dayMs = 86_400_000;
const cacheKey = "waitaha-water-level-history-v1";
const gapMs = 2 * 3_600_000;

function retain(history, now) {
  return Object.fromEntries(Object.entries(history).flatMap(([id, entries]) => {
    if (!Array.isArray(entries)) return [];
    const recent = entries.filter(point => Array.isArray(point) &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
      point[0] >= now - dayMs && point[0] <= now);
    return recent.length ? [[id, recent]] : [];
  }));
}

export function readHistory(now = Date.now()) {
  try {
    return retain(JSON.parse(localStorage.getItem(cacheKey)) ?? {}, now);
  } catch {
    return {};
  }
}

export function recordLevels(history, stations, now = Date.now()) {
  const next = retain(history, now);
  for (const station of stations) {
    const { SITENUMBER: id, Last_sample: time, Current_stage_height_m: level } = station;
    if (!Number.isFinite(time) || !Number.isFinite(level) || time < now - dayMs || time > now) continue;
    const points = new Map(next[id] ?? []);
    points.set(time, level);
    next[id] = [...points.entries()].sort((a, b) => a[0] - b[0]);
  }
  try { localStorage.setItem(cacheKey, JSON.stringify(next)); } catch { /* Retain in memory. */ }
  return next;
}

export function chartSegments(points) {
  const segments = [];
  let prior = -Infinity;
  for (const point of points) {
    if (point[0] - prior >= gapMs) segments.push([]);
    segments.at(-1).push(point);
    prior = point[0];
  }
  return segments;
}

export function plotLevel(canvas, points, now) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const left = 54, right = 470, top = 14, bottom = 135;
  const levels = points.map(([, level]) => level);
  const min = Math.min(...levels), max = Math.max(...levels);
  const padding = Math.max((max - min) * 0.12, 0.005);
  const low = min - padding, high = max + padding;
  const x = time => left + (time - (now - dayMs)) / dayMs * (right - left);
  const y = level => bottom - (level - low) / (high - low) * (bottom - top);
  ctx.font = "13px system-ui";
  ctx.fillStyle = "#465d71";
  ctx.strokeStyle = "#d7e1ea";
  ctx.lineWidth = 1;
  for (const value of [low, (low + high) / 2, high]) {
    const height = y(value);
    ctx.textAlign = "right";
    ctx.fillText(value.toFixed(2) + " m", left - 6, height + 4);
    ctx.beginPath();
    ctx.moveTo(left, height);
    ctx.lineTo(right, height);
    ctx.stroke();
  }
  const clock = new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland"
  });
  for (const [index, hours] of [24, 12, 0].entries()) {
    const time = now - hours * 3_600_000;
    ctx.textAlign = ["left", "center", "right"][index];
    ctx.fillText(clock.format(time), x(time), bottom + 21);
  }
  for (const segment of chartSegments(points)) {
    const [first] = segment;
    const last = segment.at(-1);
    ctx.beginPath();
    ctx.moveTo(x(first[0]), y(first[1]));
    for (const [time, level] of segment.slice(1)) ctx.lineTo(x(time), y(level));
    ctx.strokeStyle = "#0369a1";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.lineTo(x(last[0]), bottom);
    ctx.lineTo(x(first[0]), bottom);
    ctx.closePath();
    ctx.fillStyle = "#0369a122";
    ctx.fill();
    if (segment.length === 1 || last === points.at(-1)) {
      ctx.beginPath();
      ctx.arc(x(last[0]), y(last[1]), 4, 0, Math.PI * 2);
      ctx.fillStyle = "#0369a1";
      ctx.fill();
    }
  }
}
