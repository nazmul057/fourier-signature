// Canvas plumbing: correct pixel density, and pointer capture that survives a
// finger sliding off the edge.

/**
 * Size the canvas backing store to the device's real pixels while letting all
 * drawing code keep working in CSS pixels.
 *
 * Skipping this is why so many canvas demos look soft on a laptop screen: a
 * 1200-CSS-pixel canvas has a 1200-pixel backing store that the browser then
 * stretches across 2400 physical pixels.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {(size: {width: number, height: number}) => void} [onResize]
 * @returns {{ctx: CanvasRenderingContext2D, size: {width: number, height: number}}}
 */
export function setupCanvas(canvas, onResize) {
  const ctx = canvas.getContext('2d');
  const size = { width: 0, height: 0 };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const ratio = window.devicePixelRatio || 1;
    size.width = rect.width;
    size.height = rect.height;

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    // Assigning width or height resets the context, so the scale goes on after.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    onResize?.(size);
  };

  new ResizeObserver(resize).observe(canvas);
  resize();

  return { ctx, size };
}

/**
 * Track one stroke at a time and report the points as they arrive.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   onStart?: (points: {x: number, y: number}[]) => void,
 *   onMove?: (points: {x: number, y: number}[]) => void,
 *   onEnd?: (points: {x: number, y: number}[]) => void,
 * }} handlers
 */
export function trackDrawing(canvas, { onStart, onMove, onEnd } = {}) {
  let points = [];
  let drawing = false;

  const positionOf = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (event) => {
    // Ignore right- and middle-clicks, and any second finger mid-stroke.
    if (drawing || (event.pointerType === 'mouse' && event.button !== 0)) return;

    drawing = true;
    points = [positionOf(event)];
    canvas.setPointerCapture(event.pointerId);
    onStart?.(points);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;

    // A 240Hz stylus generates several positions per frame; the browser hands
    // them over as one event with the intermediate samples attached. Using them
    // makes fast strokes noticeably less angular.
    const batch = event.getCoalescedEvents ? event.getCoalescedEvents() : [event];
    for (const sample of batch) points.push(positionOf(sample));

    onMove?.(points);
  });

  const finish = () => {
    if (!drawing) return;
    drawing = false;
    onEnd?.(points);
  };

  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('lostpointercapture', finish);
}
