// Packing a drawing into a URL, so a shape can be sent to someone as a link.
//
// The budget is a few hundred URL characters, which rules out JSON. Instead the
// path is resampled to a fixed point count, normalised into a unit box, and
// each coordinate quantised to 12 bits -- three bytes per point, base64url'd.
// At canvas sizes, 1/4096 of the bounding box is well under a pixel, so the
// quantisation is invisible.

import { bounds, resample } from './resample.js';

const POINTS = 220;
const QUANTUM = 4095;

/** @param {{x: number, y: number}[]} points @returns {string} */
export function encodePath(points) {
  const path = resample(points, POINTS, { close: false });
  const box = bounds(path);
  if (!box) return '';

  // One scale for both axes, so the aspect ratio survives the round trip.
  const span = Math.max(box.width, box.height);
  const scale = span === 0 ? 0 : QUANTUM / span;

  const bytes = new Uint8Array(path.length * 3);
  path.forEach((point, i) => {
    const x = Math.round((point.x - box.minX) * scale);
    const y = Math.round((point.y - box.minY) * scale);

    bytes[i * 3] = x >> 4;
    bytes[i * 3 + 1] = ((x & 0xf) << 4) | (y >> 8);
    bytes[i * 3 + 2] = y & 0xff;
  });

  return toBase64Url(bytes);
}

/**
 * @param {string} text
 * @returns {{x: number, y: number}[] | null} points in a unit-ish box, or null
 *   if the string is not a path this version wrote
 */
export function decodePath(text) {
  try {
    const bytes = fromBase64Url(text);
    if (bytes.length === 0 || bytes.length % 3 !== 0) return null;

    const points = [];
    for (let i = 0; i < bytes.length; i += 3) {
      const x = (bytes[i] << 4) | (bytes[i + 1] >> 4);
      const y = ((bytes[i + 1] & 0xf) << 8) | bytes[i + 2];
      points.push({ x: x / QUANTUM, y: y / QUANTUM });
    }

    return points;
  } catch {
    return null;
  }
}

/** Read a shared path out of the current URL, if there is one. */
export function pathFromLocation(location = window.location) {
  const match = /[#&?]p=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
  return match ? decodePath(match[1]) : null;
}

/** A shareable absolute URL for a path. */
export function linkForPath(points, location = window.location) {
  const encoded = encodePath(points);
  return `${location.origin}${location.pathname}#p=${encoded}`;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(text) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}
