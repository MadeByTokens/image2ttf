/**
 * Shared glyph utility functions extracted from pipeline.js, compute-worker.js, and Preview.svelte.
 * Eliminates 3-way code duplication for glyph width computation, space width, and cell tracing.
 */
import { cropCell } from './segmentation.js';
import { traceGlyph, svgPathToOpentypePath, cleanupPaths, smoothnessToOpts } from './tracing.js';
import { EM_SQUARE } from './constants.js';

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
 * Trace a single cell: crop → trace → scale → cleanup → compute width.
 * @param {HTMLCanvasElement|OffscreenCanvas} sourceCanvas - source image canvas
 * @param {object} cell - cell rectangle {x, y, w, h}
 * @param {number} refHeight - reference height for uniform scaling
 * @param {object} [tracingOpts] - options for imagetracerjs
 * @returns {{commands: Array, width: number}|null} glyph data or null if empty/failed
 */
export function traceCell(sourceCanvas, cell, refHeight, tracingOpts = {}) {
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

  const width = computeGlyphWidth(cleaned);
  return { commands: cleaned, width };
}
