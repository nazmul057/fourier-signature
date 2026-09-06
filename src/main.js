import { analyze, chain, evaluate } from './dft.js';
import { setupCanvas, trackDrawing } from './input.js';
import { presets } from './presets.js';
import { bounds, fitTo, resample } from './resample.js';
import { clear, drawEpicycles, drawPath, drawTip, drawTrail, THEME } from './renderer.js';
import { linkForPath, pathFromLocation } from './share.js';

/** Samples fed to the DFT. Also the number of terms it can produce. */
const SAMPLES = 512;
/** Resolution of the precomputed reconstruction the trail is drawn from. */
const OUTLINE = 720;
/** Points compared against the original when measuring fit error. */
const ERROR_SAMPLES = 128;
/** Seconds for one full lap at 1x. */
const LAP_SECONDS = 6;

const el = {
  canvas: document.getElementById('stage'),
  hint: document.getElementById('hint'),
  terms: document.getElementById('terms'),
  termsValue: document.getElementById('terms-value'),
  speed: document.getElementById('speed'),
  speedValue: document.getElementById('speed-value'),
  play: document.getElementById('play'),
  clear: document.getElementById('clear'),
  record: document.getElementById('record'),
  share: document.getElementById('share'),
  showCircles: document.getElementById('show-circles'),
  showOriginal: document.getElementById('show-original'),
  closePath: document.getElementById('close-path'),
  presets: document.getElementById('presets'),
  status: document.getElementById('status'),
  readoutTerms: document.getElementById('readout-terms'),
  readoutSamples: document.getElementById('readout-samples'),
  readoutError: document.getElementById('readout-error'),
};

const state = {
  /** The path as authored: preset units, unit box, or canvas pixels. */
  source: [],
  /** Whether `source` should be rescaled onto the canvas (presets, shared links). */
  fit: false,
  /** `source` in canvas pixels. */
  path: [],
  /** `path` respaced to SAMPLES points -- what the DFT actually saw. */
  samples: [],
  center: { x: 0, y: 0 },
  terms: [],
  termCount: 1,
  outline: [],
  error: 0,
  t: 0,
  playing: true,
  speed: 1,
  mode: 'empty', // 'empty' | 'drawing' | 'playing'
  stroke: [],
  needsRebuild: false,
};

const { ctx, size } = setupCanvas(el.canvas, () => {
  // Presets and shared paths are authored in their own coordinates, so they get
  // refitted whenever the canvas changes shape. A drawing the user made in
  // canvas pixels is left exactly where they put it.
  if (state.fit && state.source.length > 0) loadPath(state.source, { fit: true });
});

/* Path loading ------------------------------------------------------------ */

function loadPath(source, { fit = false } = {}) {
  state.source = source;
  state.fit = fit;
  state.path = fit ? fitTo(source, { width: size.width, height: size.height, padding: 0.12 }) : source;

  analysePath();
  state.mode = 'playing';
  state.t = 0;
  el.hint.hidden = true;
}

/** Respace the path, transform it, and rebuild everything downstream. */
function analysePath() {
  state.samples = resample(state.path, SAMPLES, { close: el.closePath.checked });

  const { center, terms } = analyze(state.samples);
  state.center = center;
  state.terms = terms;

  applyTermSlider();
}

function reset() {
  state.source = [];
  state.path = [];
  state.samples = [];
  state.terms = [];
  state.outline = [];
  state.mode = 'empty';
  state.t = 0;
  el.hint.hidden = false;
  markPresetActive(null);
  updateReadout();
}

/* Terms ------------------------------------------------------------------- */

// The slider is squared before it becomes a term count. Everything interesting
// happens in the first few dozen terms -- a linear slider spends its top half
// adding circles too small to see.
const termsFromSlider = (value, max) => {
  if (max === 0) return 0;
  const fraction = (value / 1000) ** 2;
  return Math.max(1, Math.min(max, Math.round(1 + fraction * (max - 1))));
};

function applyTermSlider() {
  state.termCount = termsFromSlider(Number(el.terms.value), state.terms.length);
  el.termsValue.textContent = state.terms.length
    ? `${state.termCount} / ${state.terms.length}`
    : '—';
  state.needsRebuild = true;
}

/**
 * Precompute the reconstruction for the current term count, and measure how far
 * it lands from the drawing.
 */
function rebuild() {
  state.needsRebuild = false;

  if (state.terms.length === 0) {
    state.outline = [];
    state.error = 0;
    updateReadout();
    return;
  }

  state.outline = Array.from({ length: OUTLINE }, (_, i) =>
    evaluate(state.center, state.terms, state.termCount, i / OUTLINE),
  );

  // RMS distance at a subset of the original sample positions. Cheap enough to
  // recompute on every slider frame, and it turns "looks about right" into a
  // number that visibly falls as terms are added.
  const stride = Math.max(1, Math.floor(SAMPLES / ERROR_SAMPLES));
  let total = 0;
  let counted = 0;

  for (let k = 0; k < state.samples.length; k += stride) {
    const tip = evaluate(state.center, state.terms, state.termCount, k / state.samples.length);
    total += (tip.x - state.samples[k].x) ** 2 + (tip.y - state.samples[k].y) ** 2;
    counted++;
  }

  state.error = counted === 0 ? 0 : Math.sqrt(total / counted);
  updateReadout();
}

function updateReadout() {
  el.readoutTerms.textContent = state.terms.length
    ? `${state.termCount} / ${state.terms.length}`
    : '—';
  el.readoutSamples.textContent = state.samples.length || '—';
  el.readoutError.textContent = state.terms.length ? `${state.error.toFixed(2)} px` : '—';
}

/* Drawing ----------------------------------------------------------------- */

trackDrawing(el.canvas, {
  onStart: () => {
    state.mode = 'drawing';
    state.stroke = [];
    el.hint.hidden = true;
    markPresetActive(null);
  },
  onMove: (points) => {
    state.stroke = points;
  },
  onEnd: (points) => {
    const box = bounds(points);
    const tooSmall = points.length < 6 || !box || Math.max(box.width, box.height) < 16;

    if (tooSmall) {
      // A tap or a twitch, not a drawing. Go back to whatever was on screen.
      state.mode = state.terms.length > 0 ? 'playing' : 'empty';
      el.hint.hidden = state.terms.length > 0;
      state.stroke = [];
      return;
    }

    loadPath(points.map((point) => ({ ...point })), { fit: false });
    state.stroke = [];
    setStatus(`${state.terms.length} circles from ${points.length} captured points`);
  },
});

/* Animation --------------------------------------------------------------- */

let lastFrame = performance.now();

function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  if (state.needsRebuild) rebuild();

  // Advance by wall-clock time, not per frame: a 120Hz display would otherwise
  // run the animation at double speed.
  if (state.playing && state.mode === 'playing' && state.terms.length > 0) {
    state.t = (state.t + (elapsed * state.speed) / LAP_SECONDS) % 1;
  }

  render();
  requestAnimationFrame(frame);
}

function render() {
  clear(ctx, size);

  if (state.mode === 'drawing') {
    drawPath(ctx, state.stroke, { color: THEME.ink, width: 2 });
    return;
  }

  if (state.terms.length === 0) return;

  if (el.showOriginal.checked) {
    drawPath(ctx, state.samples, { color: THEME.original, width: 1, dash: [4, 4], closed: true });
  }

  const tip = el.showCircles.checked
    ? drawChain()
    : evaluate(state.center, state.terms, state.termCount, state.t);

  drawTrail(ctx, state.outline, Math.floor(state.t * OUTLINE) + 1);
  drawTip(ctx, tip);
}

function drawChain() {
  const joints = chain(state.center, state.terms, state.termCount, state.t);
  drawEpicycles(ctx, joints);
  return joints[joints.length - 1];
}

/* Controls ---------------------------------------------------------------- */

el.terms.addEventListener('input', applyTermSlider);

el.speed.addEventListener('input', () => {
  state.speed = Number(el.speed.value) / 100;
  el.speedValue.textContent = `${state.speed.toFixed(2)}×`;
});

el.play.addEventListener('click', () => {
  state.playing = !state.playing;
  el.play.textContent = state.playing ? 'Pause' : 'Play';
});

el.clear.addEventListener('click', reset);

for (const toggle of [el.showCircles, el.showOriginal]) {
  toggle.addEventListener('change', render);
}

el.closePath.addEventListener('change', () => {
  if (state.path.length > 0) analysePath();
});

el.share.addEventListener('click', async () => {
  if (state.path.length === 0) {
    setStatus('Draw something first.');
    return;
  }

  const link = linkForPath(state.path);
  history.replaceState(null, '', `#p=${link.split('#p=')[1]}`);

  try {
    await navigator.clipboard.writeText(link);
    setStatus('Link copied — the drawing travels in the URL.');
  } catch {
    setStatus('Copy failed, but the URL bar now holds the drawing.');
  }
});

/* Presets ----------------------------------------------------------------- */

for (const preset of presets) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset';
  button.textContent = preset.name;
  button.dataset.preset = preset.id;
  button.setAttribute('aria-pressed', 'false');

  button.addEventListener('click', () => {
    loadPath(preset.build(), { fit: true });
    markPresetActive(preset.id);
    setStatus('');
  });

  el.presets.append(button);
}

function markPresetActive(id) {
  for (const button of el.presets.children) {
    button.setAttribute('aria-pressed', String(button.dataset.preset === id));
  }
}

/* Recording --------------------------------------------------------------- */

let recorder = null;

el.record.addEventListener('click', () => {
  if (recorder) {
    recorder.stop();
    return;
  }

  if (!el.canvas.captureStream || typeof MediaRecorder === 'undefined') {
    setStatus('This browser cannot record the canvas.');
    return;
  }

  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(
    (type) => MediaRecorder.isTypeSupported?.(type),
  );

  if (!mimeType) {
    setStatus('No supported WebM encoder here.');
    return;
  }

  const chunks = [];
  recorder = new MediaRecorder(el.canvas.captureStream(60), { mimeType });

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  recorder.addEventListener('stop', () => {
    const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fourier-signature.webm';
    link.click();
    URL.revokeObjectURL(url);

    recorder = null;
    el.record.textContent = 'Record';
    el.record.setAttribute('aria-pressed', 'false');
    setStatus('Saved fourier-signature.webm');
  });

  recorder.start();
  el.record.textContent = 'Stop';
  el.record.setAttribute('aria-pressed', 'true');
  setStatus('Recording…');
});

/* Status line ------------------------------------------------------------- */

let statusTimer = 0;

function setStatus(message) {
  el.status.textContent = message;
  clearTimeout(statusTimer);
  if (message) statusTimer = setTimeout(() => (el.status.textContent = ''), 4000);
}

/* Boot -------------------------------------------------------------------- */

state.speed = Number(el.speed.value) / 100;
el.speedValue.textContent = `${state.speed.toFixed(2)}×`;

const shared = pathFromLocation();

if (shared) {
  loadPath(shared, { fit: true });
  setStatus('Loaded a drawing from the link.');
} else {
  loadPath(presets[0].build(), { fit: true });
  markPresetActive(presets[0].id);
}

requestAnimationFrame(frame);
