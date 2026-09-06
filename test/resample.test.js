import test from 'node:test';
import assert from 'node:assert/strict';

import { bounds, fitTo, resample } from '../src/resample.js';

const spacings = (points) =>
  points
    .slice(1)
    .map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));

test('an open line is split into equal steps', () => {
  const output = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5, { close: false });

  assert.deepEqual(
    output.map((point) => point.x),
    [0, 2, 4, 6, 8],
  );
});

test('unevenly sampled input comes out evenly spaced', () => {
  // The shape is a straight line; the input just dawdles at the start and
  // sprints at the end, exactly like a real pointer stroke.
  const input = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 40, y: 0 },
  ];

  const output = resample(input, 8, { close: false });

  for (const spacing of spacings(output)) {
    assert.ok(Math.abs(spacing - 5) < 1e-9, `expected steps of 5, saw ${spacing}`);
  }
});

test('closing the loop walks the last segment back to the start', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  const output = resample(square, 8, { close: true });

  assert.equal(output.length, 8);
  for (const spacing of spacings(output)) {
    assert.ok(Math.abs(spacing - 5) < 1e-9, `perimeter of 40 over 8 samples, saw ${spacing}`);
  }

  // The closing segment is sampled too, so the last point stops one step short
  // of home rather than landing on it.
  const gap = Math.hypot(output.at(-1).x - output[0].x, output.at(-1).y - output[0].y);
  assert.ok(Math.abs(gap - 5) < 1e-9, 'the wrap-around is one step wide');
});

test('the requested count is always what comes back', () => {
  const path = Array.from({ length: 7 }, (_, i) => ({ x: i * 3, y: Math.sin(i) }));

  for (const count of [1, 2, 13, 64, 512]) {
    assert.equal(resample(path, count).length, count);
  }
});

test('degenerate input does not produce NaN', () => {
  const stationary = Array.from({ length: 20 }, () => ({ x: 5, y: 5 }));
  const output = resample(stationary, 16);

  assert.equal(output.length, 16);
  for (const point of output) {
    assert.deepEqual(point, { x: 5, y: 5 });
  }

  assert.deepEqual(resample([], 8), []);
  assert.equal(resample([{ x: 1, y: 2 }], 4).length, 4);
});

test('repeated points are dropped before measuring', () => {
  const withDuplicates = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 8, y: 0 },
  ];

  const output = resample(withDuplicates, 4, { close: false });

  assert.deepEqual(
    output.map((point) => point.x),
    [0, 2, 4, 6],
  );
});

test('bounds measures the box', () => {
  const box = bounds([{ x: -2, y: 4 }, { x: 6, y: -1 }, { x: 0, y: 0 }]);

  assert.deepEqual(box, { minX: -2, minY: -1, maxX: 6, maxY: 4, width: 8, height: 5 });
  assert.equal(bounds([]), null);
});

test('fitTo centres a path in the box and keeps its aspect ratio', () => {
  const wide = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }];
  const output = fitTo(wide, { width: 400, height: 400, padding: 0.1 });

  const box = bounds(output);
  assert.ok(Math.abs(box.width - 320) < 1e-9, 'the long axis fills the padded box');
  assert.ok(Math.abs(box.height - 160) < 1e-9, 'aspect ratio survives');
  assert.ok(Math.abs((box.minX + box.maxX) / 2 - 200) < 1e-9, 'centred horizontally');
  assert.ok(Math.abs((box.minY + box.maxY) / 2 - 200) < 1e-9, 'centred vertically');
});
