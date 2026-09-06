// Discrete Fourier transform over a closed 2D path.
//
// A point {x, y} is read as the complex number x + iy. That is the whole trick:
// once a drawing is a sequence of complex numbers, its Fourier coefficients are
// literally circles -- each one has a radius (amplitude), a starting angle
// (phase) and a rotation speed (frequency).

/**
 * Forward DFT.
 *
 * X[n] = (1/N) * sum_k z[k] * e^(-2*pi*i*n*k/N)
 *
 * Deliberately the naive O(N^2) form. At N = 512 this is ~260k complex
 * multiplies and runs in a couple of milliseconds, once, when the user lifts
 * the pen. An FFT would buy nothing here and cost the reader the formula.
 *
 * @param {{x: number, y: number}[]} points uniformly sampled, one full period
 * @returns {Term[]} one entry per frequency bin, in bin order
 */
export function dft(points) {
  const N = points.length;
  const spectrum = [];

  for (let n = 0; n < N; n++) {
    let re = 0;
    let im = 0;

    for (let k = 0; k < N; k++) {
      const angle = (-2 * Math.PI * n * k) / N;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // (x + iy)(cos + i sin)
      re += points[k].x * cos - points[k].y * sin;
      im += points[k].x * sin + points[k].y * cos;
    }

    re /= N;
    im /= N;

    spectrum.push({
      freq: signedFrequency(n, N),
      re,
      im,
      amp: Math.hypot(re, im),
      phase: Math.atan2(im, re),
    });
  }

  return spectrum;
}

/**
 * Bins in the upper half of the spectrum are negative frequencies -- circles
 * that spin clockwise. Reading bin 400 of 512 as "+400" instead of "-112"
 * produces a chain that flies apart, so this mapping is not optional.
 */
function signedFrequency(n, N) {
  return n <= N / 2 ? n : n - N;
}

/**
 * Transform a path and split the result into the pieces the animation needs.
 *
 * The freq-0 coefficient is the mean of every sample -- the drawing's centroid.
 * It does not rotate, so it is not an epicycle: it is the fixed point the whole
 * chain hangs from. Keeping it out of `terms` means the term slider counts
 * actual circles.
 *
 * `terms` is sorted by descending amplitude so that adding terms adds detail in
 * the order a human would: biggest, most structural circle first. Sorting by
 * frequency instead makes the slider feel dead for its first half.
 *
 * @returns {{center: {x: number, y: number}, terms: Term[]}}
 */
export function analyze(points) {
  const spectrum = dft(points);
  const dc = spectrum.find((term) => term.freq === 0);

  return {
    center: { x: dc.re, y: dc.im },
    terms: spectrum
      .filter((term) => term.freq !== 0)
      .sort((a, b) => b.amp - a.amp),
  };
}

/**
 * Walk the epicycle chain at time t and return every joint along it.
 *
 * Each term contributes a vector of length `amp` at angle `2*pi*freq*t + phase`,
 * drawn from where the previous one ended. The last joint is the pen tip -- the
 * point that traces the reconstruction.
 *
 * @param {{x: number, y: number}} center
 * @param {Term[]} terms
 * @param {number} count how many terms to include
 * @param {number} t position in the cycle, in [0, 1)
 * @returns {{x: number, y: number}[]} count + 1 joints, starting at `center`
 */
export function chain(center, terms, count, t) {
  const joints = [{ x: center.x, y: center.y }];
  let { x, y } = center;

  const used = Math.min(count, terms.length);
  for (let i = 0; i < used; i++) {
    const term = terms[i];
    const angle = 2 * Math.PI * term.freq * t + term.phase;
    x += term.amp * Math.cos(angle);
    y += term.amp * Math.sin(angle);
    joints.push({ x, y });
  }

  return joints;
}

/**
 * The pen tip alone, without allocating the joints. Used to precompute the
 * reconstructed outline, where only the traced curve matters.
 */
export function evaluate(center, terms, count, t) {
  let { x, y } = center;

  const used = Math.min(count, terms.length);
  for (let i = 0; i < used; i++) {
    const term = terms[i];
    const angle = 2 * Math.PI * term.freq * t + term.phase;
    x += term.amp * Math.cos(angle);
    y += term.amp * Math.sin(angle);
  }

  return { x, y };
}

/**
 * @typedef {object} Term
 * @property {number} freq signed rotations per cycle
 * @property {number} re
 * @property {number} im
 * @property {number} amp circle radius
 * @property {number} phase starting angle, radians
 */
