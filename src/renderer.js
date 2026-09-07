// All the canvas drawing lives here. Nothing in this file knows what a Fourier
// coefficient is -- it is handed points and joints and draws them.

export const THEME = {
  ground: '#0d121c',
  original: 'rgba(148, 163, 184, 0.45)',
  ink: 'rgba(226, 232, 240, 0.9)',
  circle: 'rgba(148, 176, 214, 0.22)',
  spoke: 'rgba(190, 214, 240, 0.5)',
  trail: '#38bdf8',
  trailGlow: 'rgba(56, 189, 248, 0.18)',
  tip: '#fbbf24',
  // Deliberately not cyan or amber: the highlight has to be findable among a
  // trail and a pen tip that are already using those.
  highlight: '#f472b6',
};

export function clear(ctx, size) {
  ctx.fillStyle = THEME.ground;
  ctx.fillRect(0, 0, size.width, size.height);
}

/**
 * Stroke a polyline.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} points
 * @param {{color?: string, width?: number, dash?: number[], closed?: boolean}} [options]
 */
export function drawPath(ctx, points, options = {}) {
  if (points.length < 2) return;

  const { color = THEME.ink, width = 1, dash = [], closed = false } = options;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(dash);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (closed) ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw the chain: one circle per term, each centred on the previous joint, with
 * a spoke out to the next one.
 *
 * Every circle shares a style, so they all go into a single path and a single
 * stroke call. With 500 terms on screen the difference between that and 500
 * separate strokes is the difference between 60fps and a slideshow.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} joints from `chain()`
 */
export function drawEpicycles(ctx, joints) {
  if (joints.length < 2) return;

  ctx.save();
  ctx.lineWidth = 1;

  ctx.strokeStyle = THEME.circle;
  ctx.beginPath();
  for (let i = 0; i < joints.length - 1; i++) {
    const centre = joints[i];
    const radius = Math.hypot(joints[i + 1].x - centre.x, joints[i + 1].y - centre.y);

    // Below about half a pixel a circle is just a smudge on the trail.
    if (radius < 0.5) continue;

    // moveTo before each arc, or the canvas joins one circle to the next.
    ctx.moveTo(centre.x + radius, centre.y);
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
  }
  ctx.stroke();

  ctx.strokeStyle = THEME.spoke;
  ctx.beginPath();
  for (let i = 0; i < joints.length - 1; i++) {
    ctx.moveTo(joints[i].x, joints[i].y);
    ctx.lineTo(joints[i + 1].x, joints[i + 1].y);
  }
  ctx.stroke();

  ctx.restore();
}

/**
 * Pick one circle out of the chain and make it findable.
 *
 * Most of the chain is circles too small to point at, so this draws more than
 * the circle itself: the spoke, a dot on the joint, and -- when the circle is
 * smaller than the dot -- a locator ring around it. Without that last part,
 * hovering a high-frequency term highlights something invisible.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} joints from `chain()`
 * @param {number} index which term, counting from zero
 */
export function drawHighlight(ctx, joints, index) {
  if (index < 0 || index >= joints.length - 1) return;

  const centre = joints[index];
  const tip = joints[index + 1];
  const radius = Math.hypot(tip.x - centre.x, tip.y - centre.y);

  ctx.save();
  ctx.strokeStyle = THEME.highlight;
  ctx.lineWidth = 1.5;

  if (radius >= 0.5) {
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(centre.x, centre.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  ctx.fillStyle = THEME.highlight;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 2.5, 0, Math.PI * 2);
  ctx.fill();

  if (radius < 14) {
    ctx.setLineDash([2, 3]);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw the part of the reconstruction the pen has reached so far.
 *
 * The outline is precomputed for the whole cycle, so this is a slice rather
 * than a buffer of past frames: the trail is exact, independent of frame rate,
 * and correct the instant the term slider moves.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}[]} outline
 * @param {number} drawn how many leading points to show
 */
export function drawTrail(ctx, outline, drawn) {
  const visible = Math.min(Math.max(drawn, 0), outline.length);
  if (visible < 2) return;

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < visible; i++) ctx.lineTo(outline[i].x, outline[i].y);

  // A wide translucent pass under a thin bright one reads as a glow without
  // paying for shadowBlur, which is the single most expensive thing on canvas.
  ctx.strokeStyle = THEME.trailGlow;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.strokeStyle = THEME.trail;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.restore();
}

/** The pen tip: the end of the chain, and the thing actually doing the drawing. */
export function drawTip(ctx, point) {
  ctx.save();

  ctx.fillStyle = THEME.tip;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
