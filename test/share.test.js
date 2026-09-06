import test from 'node:test';
import assert from 'node:assert/strict';

import { decodePath, encodePath, linkForPath, pathFromLocation } from '../src/share.js';
import { bounds, fitTo, resample } from '../src/resample.js';

const circle = (count, radiusX, radiusY) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return { x: 500 + radiusX * Math.cos(angle), y: 300 + radiusY * Math.sin(angle) };
  });

/** Distance from a point to the nearest point on a polyline. */
const distanceToPath = (point, path) => {
  let best = Infinity;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;

    const along =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));

    best = Math.min(best, Math.hypot(point.x - (a.x + dx * along), point.y - (a.y + dy * along)));
  }

  return best;
};

test('a path survives the round trip to within a fraction of a pixel', () => {
  const original = circle(300, 180, 90);
  const decoded = decodePath(encodePath(original));

  // Measured as distance to the original curve, not point against point.
  // Resampling is periodic, so the decoded path is one step shorter than the
  // original and the two are not parameterised identically -- but they are the
  // same shape, and that is what the link has to preserve.
  const box = { width: 400, height: 400, padding: 0.1 };
  const before = fitTo(original, box);
  const after = fitTo(decoded, box);

  let worst = 0;
  for (const point of after) worst = Math.max(worst, distanceToPath(point, before));

  assert.ok(worst < 0.5, `worst deviation was ${worst.toFixed(3)}px across a 400px box`);
});

test('the decoded path is a full lap, not a fragment', () => {
  const original = circle(300, 150, 150);
  const decoded = resample(decodePath(encodePath(original)), 64, { close: true });

  // A closed loop's samples should be evenly spread all the way round, so no
  // two neighbours are far apart even across the join.
  const steps = decoded.map((point, i) => {
    const next = decoded[(i + 1) % decoded.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });

  const longest = Math.max(...steps);
  const shortest = Math.min(...steps);
  assert.ok(longest / shortest < 1.05, `steps ranged ${shortest} to ${longest}`);
});

test('aspect ratio survives quantisation', () => {
  const wide = circle(200, 200, 50);
  const box = bounds(decodePath(encodePath(wide)));

  assert.ok(
    Math.abs(box.width / box.height - 4) < 0.01,
    `expected a 4:1 box, got ${(box.width / box.height).toFixed(3)}:1`,
  );
});

test('the encoding stays short enough to live in a URL', () => {
  const encoded = encodePath(circle(4000, 300, 300));

  assert.ok(encoded.length < 1000, `${encoded.length} characters is too long for a link`);
  assert.match(encoded, /^[A-Za-z0-9\-_]+$/, 'must be URL-safe without escaping');
});

test('a degenerate path encodes without blowing up', () => {
  const dot = Array.from({ length: 10 }, () => ({ x: 7, y: 7 }));
  const decoded = decodePath(encodePath(dot));

  assert.equal(decoded.length, 220);
  for (const point of decoded) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }

  assert.equal(encodePath([]), '');
});

test('garbage decodes to null rather than throwing', () => {
  assert.equal(decodePath('not-valid-base64!!'), null);
  assert.equal(decodePath(''), null);
  // Six base64 characters carry four bytes, which cannot be whole points.
  assert.equal(decodePath('AAAAAA'), null, 'a byte count that is not a multiple of three');
  // Four characters carry exactly three bytes: one legitimate point.
  assert.equal(decodePath('AAAA').length, 1);
});

test('links carry the path in the hash and read back out of it', () => {
  const original = circle(150, 120, 120);
  const link = linkForPath(original, {
    origin: 'https://example.github.io',
    pathname: '/fourier-signature/',
  });

  assert.ok(link.startsWith('https://example.github.io/fourier-signature/#p='));

  const recovered = pathFromLocation({ hash: link.slice(link.indexOf('#')) });
  assert.equal(recovered.length, 220);
});

test('a location with no path yields nothing', () => {
  assert.equal(pathFromLocation({ hash: '' }), null);
  assert.equal(pathFromLocation({ hash: '#about' }), null);
});
