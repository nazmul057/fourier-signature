import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze, chain, dft, evaluate } from '../src/dft.js';

const close = (actual, expected, tolerance, message) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${message}: expected ${expected}, got ${actual}`,
  );

test('every term reconstructs the original samples exactly', () => {
  const N = 64;
  const points = Array.from({ length: N }, (_, k) => ({
    x: 80 * Math.cos((3 * k * Math.PI) / N) + 12 * Math.sin((7 * k * Math.PI) / N) + 300,
    y: 45 * Math.sin((5 * k * Math.PI) / N) - 20 * Math.cos((2 * k * Math.PI) / N) + 150,
  }));

  const { center, terms } = analyze(points);

  for (let k = 0; k < N; k++) {
    const tip = evaluate(center, terms, terms.length, k / N);
    close(tip.x, points[k].x, 1e-9, `x at sample ${k}`);
    close(tip.y, points[k].y, 1e-9, `y at sample ${k}`);
  }
});

test('a circle collapses to a single term at its own radius', () => {
  const N = 128;
  const radius = 70;
  const origin = { x: 400, y: 220 };
  const points = Array.from({ length: N }, (_, k) => ({
    x: origin.x + radius * Math.cos((2 * Math.PI * k) / N),
    y: origin.y + radius * Math.sin((2 * Math.PI * k) / N),
  }));

  const { center, terms } = analyze(points);

  close(center.x, origin.x, 1e-9, 'centre x is the centroid');
  close(center.y, origin.y, 1e-9, 'centre y is the centroid');

  assert.equal(terms[0].freq, 1, 'one full turn per cycle');
  close(terms[0].amp, radius, 1e-9, 'radius');
  close(terms[1].amp, 0, 1e-9, 'every other term is empty');
});

test('a clockwise circle lands on a negative frequency', () => {
  const N = 128;
  const points = Array.from({ length: N }, (_, k) => ({
    x: 50 * Math.cos((-2 * Math.PI * k) / N),
    y: 50 * Math.sin((-2 * Math.PI * k) / N),
  }));

  const { terms } = analyze(points);

  assert.equal(terms[0].freq, -1, 'upper-half bins must read as negative');
});

test('bins above the midpoint map to negative frequencies', () => {
  const N = 8;
  const points = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

  assert.deepEqual(
    dft(points).map((term) => term.freq),
    [0, 1, 2, 3, 4, -3, -2, -1],
  );
});

test('terms arrive sorted by descending amplitude', () => {
  const N = 32;
  const points = Array.from({ length: N }, (_, k) => ({
    x: 10 * Math.cos((2 * Math.PI * k) / N) + 90 * Math.cos((6 * Math.PI * k) / N),
    y: 40 * Math.sin((2 * Math.PI * k) / N),
  }));

  const { terms } = analyze(points);

  for (let i = 1; i < terms.length; i++) {
    assert.ok(terms[i - 1].amp >= terms[i].amp, `term ${i} is out of order`);
  }
});

test('the frequency-zero coefficient is kept out of the term list', () => {
  const N = 16;
  const points = Array.from({ length: N }, (_, k) => ({
    x: 100 + Math.cos((2 * Math.PI * k) / N),
    y: 250 + Math.sin((2 * Math.PI * k) / N),
  }));

  const { center, terms } = analyze(points);

  assert.equal(terms.length, N - 1);
  assert.ok(!terms.some((term) => term.freq === 0));
  close(center.x, 100, 1e-9, 'centroid x');
  close(center.y, 250, 1e-9, 'centroid y');
});

test('the chain hangs off the centre and ends at the pen tip', () => {
  const N = 32;
  const points = Array.from({ length: N }, (_, k) => ({
    x: 200 + 60 * Math.cos((2 * Math.PI * k) / N),
    y: 200 + 25 * Math.sin((4 * Math.PI * k) / N),
  }));

  const { center, terms } = analyze(points);
  const joints = chain(center, terms, 5, 0.3);

  assert.equal(joints.length, 6, 'one joint per term, plus the anchor');
  assert.deepEqual(joints[0], center);

  const tip = evaluate(center, terms, 5, 0.3);
  close(joints.at(-1).x, tip.x, 1e-12, 'tip x');
  close(joints.at(-1).y, tip.y, 1e-12, 'tip y');

  // Every joint sits exactly one radius from the one before it.
  for (let i = 1; i < joints.length; i++) {
    const span = Math.hypot(joints[i].x - joints[i - 1].x, joints[i].y - joints[i - 1].y);
    close(span, terms[i - 1].amp, 1e-9, `joint ${i} sits on its circle`);
  }
});

test('asking for more terms than exist is not an error', () => {
  const N = 16;
  const points = Array.from({ length: N }, (_, k) => ({ x: k, y: k * k }));
  const { center, terms } = analyze(points);

  assert.equal(chain(center, terms, 999, 0.5).length, terms.length + 1);
});
