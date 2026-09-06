// Turning a hand-drawn stroke into something the DFT can actually use.

/**
 * Resample a polyline to `count` points spaced evenly by arc length.
 *
 * This is the step that decides whether the finished animation looks right.
 * Pointer events fire on a clock, not on a ruler: a fast flick lays down four
 * sparse points while a slow curl lays down eighty. Feeding that straight to
 * the DFT tells it those eighty points took twenty times as long, so the pen
 * tip sprints through the flick and crawls through the curl. Respacing by
 * distance discards the drawing's timing and keeps only its shape.
 *
 * Sampling is periodic in both modes: the output stops one step short of the
 * end of the path, because the sample after the last one is understood to be
 * the first one again. That is what the DFT needs, and it means an open path
 * comes back very slightly shorter than it went in -- by one step out of
 * `count`, which is why callers should compare shapes rather than arc lengths.
 *
 * @param {{x: number, y: number}[]} points raw input
 * @param {number} count samples to produce
 * @param {{close?: boolean}} options append the segment back to the start
 * @returns {{x: number, y: number}[]} exactly `count` points
 */
export function resample(points, count, { close = true } = {}) {
  const path = dedupe(points);

  if (path.length === 0) return [];
  if (path.length === 1) {
    return Array.from({ length: count }, () => ({ ...path[0] }));
  }

  // The DFT treats its input as one period of a periodic signal, so the sample
  // after the last one is the first one. Closing the path explicitly spreads
  // that jump over a real segment instead of leaving a discontinuity, which is
  // what causes the ringing you see when an open drawing is left unclosed.
  const working = close ? [...path, { ...path[0] }] : path;

  const cumulative = [0];
  for (let i = 1; i < working.length; i++) {
    const dx = working[i].x - working[i - 1].x;
    const dy = working[i].y - working[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }

  const total = cumulative[cumulative.length - 1];
  if (total === 0) {
    return Array.from({ length: count }, () => ({ ...path[0] }));
  }

  const step = total / count;
  const output = [];
  let segment = 0;

  for (let i = 0; i < count; i++) {
    const target = i * step;

    // Segments are visited in order, so this pointer only ever moves forward.
    while (segment < working.length - 2 && cumulative[segment + 1] < target) {
      segment++;
    }

    const spanStart = cumulative[segment];
    const spanLength = cumulative[segment + 1] - spanStart;
    const fraction = spanLength === 0 ? 0 : (target - spanStart) / spanLength;

    const a = working[segment];
    const b = working[segment + 1];
    output.push({
      x: a.x + (b.x - a.x) * fraction,
      y: a.y + (b.y - a.y) * fraction,
    });
  }

  return output;
}

/**
 * Drop points that repeat the previous one. Zero-length segments are harmless
 * to draw but they make the arc-length walk divide by zero.
 */
function dedupe(points) {
  const output = [];

  for (const point of points) {
    const previous = output[output.length - 1];
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      output.push({ x: point.x, y: point.y });
    }
  }

  return output;
}

/** Axis-aligned bounding box, or null for an empty path. */
export function bounds(points) {
  if (points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Scale and translate a path to sit centred in a box, preserving aspect ratio.
 * Presets are authored in whatever coordinates were convenient; this puts them
 * on the canvas.
 */
export function fitTo(points, { width, height, padding = 0.1 }) {
  const box = bounds(points);
  if (!box) return [];

  const available = Math.min(width, height) * (1 - padding * 2);
  const span = Math.max(box.width, box.height);
  const scale = span === 0 ? 1 : available / span;

  const centreX = (box.minX + box.maxX) / 2;
  const centreY = (box.minY + box.maxY) / 2;

  return points.map(({ x, y }) => ({
    x: (x - centreX) * scale + width / 2,
    y: (y - centreY) * scale + height / 2,
  }));
}
