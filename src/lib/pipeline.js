import { cropCell } from './segmentation.js';
import { traceGlyph, svgPathToOpentypePath, cleanupPaths } from './tracing.js';
import { EM_SQUARE } from './constants.js';

/**
 * Run the full tracing pipeline for all grid cells
 * @param {Array<Array<{x,y,w,h}>>} grid - 2D array of cell rectangles
 * @param {string[]} charMap - flat array of characters corresponding to cells
 * @param {HTMLCanvasElement} sourceCanvas - the source image canvas
 * @param {function} onProgress - callback(current, total)
 * @returns {Promise<Map<string, {commands: Array, width: number}>>}
 */
export async function runTracing(grid, charMap, sourceCanvas, onProgress = () => {}) {
  const glyphMap = new Map();
  const flatCells = grid.flat();
  const total = Math.min(flatCells.length, charMap.length);

  for (let i = 0; i < total; i++) {
    const cell = flatCells[i];
    const char = charMap[i];

    if (!char || char === ' ') continue;

    try {
      const cropped = cropCell(sourceCanvas, cell);

      if (cropped.empty) {
        // Empty cell — skip
        continue;
      }

      // Trace the cropped glyph
      const svgPaths = traceGlyph(cropped.imageData);

      if (svgPaths.length === 0) continue;

      // Convert to opentype path commands, using cell height for uniform scaling
      const commands = svgPathToOpentypePath(
        svgPaths,
        cropped.imageData.width,
        cropped.imageData.height,
        EM_SQUARE,
        { cellHeight: cell.h, trimOffsetY: cropped.trimRect.y }
      );

      // Clean up noise
      const cleaned = cleanupPaths(commands);

      if (cleaned.length > 0) {
        // Calculate advance width based on glyph bounds
        let minX = Infinity, maxX = -Infinity;
        for (const cmd of cleaned) {
          if (cmd.x !== undefined) {
            minX = Math.min(minX, cmd.x);
            maxX = Math.max(maxX, cmd.x);
          }
        }
        const width = maxX > minX ? maxX - minX + EM_SQUARE * 0.15 : EM_SQUARE * 0.5;

        glyphMap.set(char, { commands: cleaned, width: Math.min(width, EM_SQUARE) });
      }
    } catch (err) {
      console.warn(`Failed to trace glyph for "${char}":`, err);
    }

    // Yield to UI every few glyphs
    if (i % 3 === 0) {
      onProgress(i + 1, total);
      await new Promise(r =>
        typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(r) : setTimeout(r, 0)
      );
    }
  }

  onProgress(total, total);
  return glyphMap;
}
