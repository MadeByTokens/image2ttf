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
export async function runTracing(grid, charMap, sourceCanvas, onProgress = () => {}, opts = {}) {
  const glyphMap = new Map();
  const flatCells = grid.flat();
  const total = Math.min(flatCells.length, charMap.length);

  // Use a single reference height (max row height) for uniform scaling across all rows.
  // This ensures uppercase and lowercase maintain correct relative sizes.
  const refHeight = Math.max(...flatCells.map(c => c.h));

  for (let i = 0; i < total; i++) {
    const cell = flatCells[i];
    const char = charMap[i];

    if (!char || char === ' ') continue;

    try {
      const cropped = cropCell(sourceCanvas, cell);

      if (cropped.empty) {
        continue;
      }

      const svgPaths = traceGlyph(cropped.imageData);

      if (svgPaths.length === 0) continue;

      // Use refHeight for all glyphs so scaling is uniform across rows
      const commands = svgPathToOpentypePath(
        svgPaths,
        cropped.imageData.width,
        cropped.imageData.height,
        EM_SQUARE,
        { cellHeight: refHeight, trimOffsetY: cropped.trimRect.y + (cell.h < refHeight ? 0 : 0) }
      );

      const cleaned = cleanupPaths(commands);

      if (cleaned.length > 0) {
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

    if (i % 3 === 0) {
      onProgress(i + 1, total);
      await new Promise(r =>
        typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(r) : setTimeout(r, 0)
      );
    }
  }

  // Auto-generate space width from average lowercase advance width
  const spacePercent = (opts.spaceWidthPercent ?? 60) / 100;
  const lowercaseWidths = [];
  for (const [char, data] of glyphMap) {
    if (char >= 'a' && char <= 'z') {
      lowercaseWidths.push(data.width);
    }
  }
  const spaceWidth = lowercaseWidths.length > 0
    ? Math.round(lowercaseWidths.reduce((s, w) => s + w, 0) / lowercaseWidths.length * spacePercent)
    : Math.round(EM_SQUARE * 0.3 * spacePercent / 0.6);
  glyphMap.set(' ', { commands: [], width: spaceWidth });

  onProgress(total, total);
  return glyphMap;
}
