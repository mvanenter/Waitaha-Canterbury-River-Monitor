import assert from "node:assert/strict";
import { test } from "node:test";
import { chartSegments, recordLevels } from "../history.mjs";

const now = Date.UTC(2026, 10, 25);
const hour = 3_600_000;

test("history keeps measured levels, deduplicates timestamps and trims the window", () => {
  const station = (time, level) => ({ SITENUMBER: 7, Last_sample: time, Current_stage_height_m: level });
  const initial = { 7: [[now - 25 * hour, 1], [now - hour, 2]] };
  const result = recordLevels(initial,
    [station(now - hour, 2.1), station(now, 0), station(now + hour, 3), station(now - 100, null)], now);
  assert.deepEqual(result, { 7: [[now - hour, 2.1], [now, 0]] });
});

test("the line breaks after a gap of two hours or more", () => {
  const points = [[now - 4 * hour, 1], [now - 3 * hour, 2], [now - hour, 3]];
  assert.deepEqual(chartSegments(points), [points.slice(0, 2), points.slice(2)]);
});
