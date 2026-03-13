import { smoothnessToOpts } from './tracing.js';
import { createLogger } from './logger.js';
import { traceCell, computeSpaceWidth, normalizeBaselines } from './glyph-utils.js';

const logger = createLogger('pipeline');

/**
 * Run the full tracing pipeline for all grid cells
 * @param {Array<Array<{x,y,w,h}>>} grid - 2D array of cell rectangles
 * @param {string[]} charMap - flat array of characters corresponding to cells
 * @param {HTMLCanvasElement} sourceCanvas - the source image canvas
 * @param {function} onProgress - callback(current, total)
 * @returns {Promise<Map<string, {commands: Array, width: number}>>}
 */
export async function runTracing(grid, charMap, sourceCanvas, onProgress = () => {}, opts = {}) {
  const glyphMap = new Map();
  const flatCells = grid.flat();
  const total = Math.min(flatCells.length, charMap.length);

  // Use a single reference height (max row height) for uniform scaling across all rows.
  // This ensures uppercase and lowercase maintain correct relative sizes.
  const refHeight = Math.max(...flatCells.map(c => c.h));
  const tracingOpts = opts.detail != null ? smoothnessToOpts(opts.detail) : {};
  const smoothing = opts.smoothing ?? 0;

  for (let i = 0; i < total; i++) {
    const cell = flatCells[i];
    const char = charMap[i];

    if (!char || char === ' ') continue;

    try {
      const result = traceCell(sourceCanvas, cell, refHeight, tracingOpts, smoothing);
      if (result) {
        glyphMap.set(char, result);
      }
    } catch (err) {
      logger.warn(`Failed to trace glyph for "${char}":`, err);
    }

    if (i % 3 === 0) {
      onProgress(i + 1, total);
      await new Promise(r =>
        typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(r) : setTimeout(r, 0)
      );
    }
  }

  // Normalize baselines so all characters align consistently
  const glyphEntries = [...glyphMap.entries()].map(([char, data]) => ({ char, commands: data.commands, width: data.width }));
  normalizeBaselines(glyphEntries);
  for (const entry of glyphEntries) {
    glyphMap.set(entry.char, { commands: entry.commands, width: entry.width });
  }

  // Auto-generate space width from average lowercase advance width
  const entries = glyphEntries.map(e => ({ char: e.char, width: e.width }));
  const spaceWidth = computeSpaceWidth(entries, opts.spaceWidthPercent ?? 60);
  glyphMap.set(' ', { commands: [], width: spaceWidth });

  onProgress(total, total);
  return glyphMap;
}
