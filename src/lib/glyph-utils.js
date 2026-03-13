/**
 * Shared glyph utility functions extracted from pipeline.js, compute-worker.js, and Preview.svelte.
 * Eliminates 3-way code duplication for glyph width computation, space width, and cell tracing.
 */
import { cropCell } from './segmentation.js';
import { traceGlyph, svgPathToOpentypePath, cleanupPaths, chaikinSmooth, smoothnessToOpts } from './tracing.js';
import { EM_SQUARE, ASCENDER } from './constants.js';

/**
 * Compute the advance width of a glyph from its path commands.
 * @param {Array} commands - opentype path commands
 * @param {number} emSquare - em square size
 * @returns {number} advance width, clamped to emSquare
 */
export function computeGlyphWidth(commands, emSquare = EM_SQUARE) {
  let minX = Infinity, maxX = -Infinity;
  for (const cmd of commands) {
    if (cmd.x !== undefined) {
      minX = Math.min(minX, cmd.x);
      maxX = Math.max(maxX, cmd.x);
    }
  }
  const width = maxX > minX ? maxX - minX + emSquare * 0.15 : emSquare * 0.5;
  return Math.min(width, emSquare);
}

/**
 * Compute the space character width from traced glyph entries.
 * @param {Array<{char: string, width: number}>} entries - traced glyph entries
 * @param {number} spaceWidthPercent - space width as percentage (e.g. 60)
 * @param {number} emSquare - em square size
 * @returns {number} space width in font units
 */
export function computeSpaceWidth(entries, spaceWidthPercent = 60, emSquare = EM_SQUARE) {
  const spacePercent = spaceWidthPercent / 100;
  const lowercaseWidths = entries
    .filter(e => e.char >= 'a' && e.char <= 'z')
    .map(e => e.width);

  return lowercaseWidths.length > 0
    ? Math.round(lowercaseWidths.reduce((s, w) => s + w, 0) / lowercaseWidths.length * spacePercent)
    : Math.round(emSquare * 0.3 * spacePercent / 0.6);
}

/**
 * Trace a single cell: crop → trace → scale → cleanup → smooth → compute width.
 * @param {HTMLCanvasElement|OffscreenCanvas} sourceCanvas - source image canvas
 * @param {object} cell - cell rectangle {x, y, w, h}
 * @param {number} refHeight - reference height for uniform scaling
 * @param {object} [tracingOpts] - options for imagetracerjs
 * @param {number} [smoothing=0] - Chaikin corner-cutting iterations (0 = none)
 * @returns {{commands: Array, width: number}|null} glyph data or null if empty/failed
 */
export function traceCell(sourceCanvas, cell, refHeight, tracingOpts = {}, smoothing = 0) {
  const cropped = cropCell(sourceCanvas, cell);
  if (cropped.empty) return null;

  const svgPaths = traceGlyph(cropped.imageData, tracingOpts);
  if (svgPaths.length === 0) return null;

  // Compute baseline position within cell (pixels from cell top)
  const baselineInCell = cell.baseline != null
    ? cell.baseline - cell.y
    : cell.h * 0.75;

  const commands = svgPathToOpentypePath(
    svgPaths,
    cropped.imageData.width,
    cropped.imageData.height,
    EM_SQUARE,
    { cellHeight: refHeight, trimOffsetY: cropped.trimRect.y, baselineInCell }
  );
  const cleaned = cleanupPaths(commands);
  if (cleaned.length === 0) return null;

  const smoothed = chaikinSmooth(cleaned, smoothing);
  const width = computeGlyphWidth(smoothed);
  return { commands: smoothed, width };
}

// Characters whose bottom sits on the baseline (used for normalization reference)
const BASELINE_REFS = new Set(
  'abcdefhiklmnorstuvwxzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')
);

/**
 * Normalize glyph baselines so all baseline-sitting characters align consistently.
 *
 * After tracing, characters written slightly above/below the row baseline end up
 * at different Y positions in font coordinates. This function:
 * 1. Finds the min-Y (bottom in Y-up coords) for each reference character
 *    (a-z sans descenders, A-Z, 0-9)
 * 2. Computes the median min-Y as the target baseline
 * 3. Shifts each reference character individually to align its bottom to the target
 * 4. Shifts descender/punctuation characters by the average correction
 *
 * @param {Array<{char: string, commands: Array, width: number}>} entries
 */
export function normalizeBaselines(entries) {
  // Compute min-Y for each entry
  const entryMinY = new Map();
  const refMinYs = [];

  for (const entry of entries) {
    if (entry.char === ' ' || !entry.commands?.length) continue;
    let minY = Infinity;
    for (const cmd of entry.commands) {
      if (cmd.y !== undefined) minY = Math.min(minY, cmd.y);
    }
    if (minY === Infinity) continue;
    entryMinY.set(entry, minY);
    if (BASELINE_REFS.has(entry.char)) refMinYs.push(minY);
  }

  if (refMinYs.length < 3) return; // not enough reference data

  // Median min-Y of reference characters = target baseline
  refMinYs.sort((a, b) => a - b);
  const mid = Math.floor(refMinYs.length / 2);
  const targetY = refMinYs.length % 2 === 1
    ? refMinYs[mid]
    : (refMinYs[mid - 1] + refMinYs[mid]) / 2;

  // Average shift for non-reference characters
  let shiftSum = 0, shiftCount = 0;
  for (const [entry, minY] of entryMinY) {
    if (BASELINE_REFS.has(entry.char)) {
      shiftSum += targetY - minY;
      shiftCount++;
    }
  }
  const avgShift = shiftCount > 0 ? shiftSum / shiftCount : 0;

  // Apply per-character shifts
  for (const [entry, minY] of entryMinY) {
    const shift = BASELINE_REFS.has(entry.char) ? targetY - minY : avgShift;
    if (Math.abs(shift) < 1) continue;

    entry.commands = entry.commands.map(cmd => {
      const c = { ...cmd };
      if ('y' in c) c.y = Math.round((c.y + shift) * 100) / 100;
      if ('y1' in c) c.y1 = Math.round((c.y1 + shift) * 100) / 100;
      if ('y2' in c) c.y2 = Math.round((c.y2 + shift) * 100) / 100;
      return c;
    });
  }
}

/**
 * Convert opentype path commands to an SVG path string (Y-flipped for display).
 * Shared by GlyphGallery and CharMap adjustment dialog.
 */
export function commandsToSvgPath(commands) {
  const fy = (y) => ASCENDER - y;
  let d = '';
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M': d += `M${cmd.x} ${fy(cmd.y)} `; break;
      case 'L': d += `L${cmd.x} ${fy(cmd.y)} `; break;
      case 'Q': d += `Q${cmd.x1} ${fy(cmd.y1)} ${cmd.x} ${fy(cmd.y)} `; break;
      case 'C': d += `C${cmd.x1} ${fy(cmd.y1)} ${cmd.x2} ${fy(cmd.y2)} ${cmd.x} ${fy(cmd.y)} `; break;
      case 'Z': d += 'Z '; break;
    }
  }
  return d.trim();
}
