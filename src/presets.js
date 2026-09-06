// Shapes to fall back on, so the page has something moving the moment it loads.
//
// Each one is a closed parametric curve sampled densely; `fitTo` scales it onto
// whatever canvas it lands on, so the units here are arbitrary.

const TAU = Math.PI * 2;

const sample = (curve, count = 480) =>
  Array.from({ length: count }, (_, i) => curve((i / count) * TAU));

/** A polygon, sampled along its edges so corners stay sharp. */
const polygon = (vertices, perEdge = 60) => {
  const points = [];

  for (let i = 0; i < vertices.length; i++) {
    const from = vertices[i];
    const to = vertices[(i + 1) % vertices.length];

    for (let step = 0; step < perEdge; step++) {
      const f = step / perEdge;
      points.push({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f });
    }
  }

  return points;
};

const starVertices = (points = 5, outer = 1, inner = 0.4) =>
  Array.from({ length: points * 2 }, (_, i) => {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (points * 2)) * TAU - Math.PI / 2;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });

export const presets = [
  {
    id: 'signature',
    name: 'Signature',
    // A closed scrawl built from a handful of harmonics. It loops back on
    // itself the way handwriting does, which is the case worth showing: smooth
    // everywhere, so it converges fast and looks good at low term counts.
    build: () =>
      sample((t) => ({
        x:
          Math.cos(t) +
          0.52 * Math.cos(3 * t + 1.1) +
          0.26 * Math.cos(5 * t + 2.4) +
          0.13 * Math.cos(9 * t + 0.3),
        y:
          0.62 * Math.sin(t) +
          0.44 * Math.sin(2 * t + 0.6) +
          0.21 * Math.sin(4 * t + 1.9) +
          0.09 * Math.sin(7 * t + 0.4),
      })),
  },
  {
    id: 'heart',
    name: 'Heart',
    build: () =>
      sample((t) => ({
        x: 16 * Math.sin(t) ** 3,
        // Negated because canvas y grows downward and this curve was written
        // for maths axes.
        y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
      })),
  },
  {
    id: 'star',
    name: 'Star',
    build: () => polygon(starVertices()),
  },
  {
    id: 'square',
    name: 'Square',
    // The interesting one. A square's corners are discontinuities in the
    // derivative, so the series needs a lot of terms and overshoots at every
    // corner until it gets them -- Gibbs ringing, visible with the slider low.
    build: () =>
      polygon([
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
      ]),
  },
  {
    id: 'figure-eight',
    name: 'Figure eight',
    build: () => sample((t) => ({ x: Math.cos(t), y: Math.sin(2 * t) / 2 })),
  },
];

export const presetById = (id) => presets.find((preset) => preset.id === id);
