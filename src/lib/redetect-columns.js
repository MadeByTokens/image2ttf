/**
 * Shared redetect-columns logic extracted from compute-worker.js and compute.js.
 * Uses baseline midpoints as clip bounds when re-detecting columns.
 */
import { detectColumns } from './segmentation.js';

/**
 * Re-detect columns for all rows using baseline-aware clipping.
 * @param {ImageData} imageData - full image data
 * @param {Array<{start: number, end: number, baseline?: number}>} rows - row boundaries
 * @param {object} opts - detection options (colDensityThreshold, minColWidth, etc.)
 * @param {function} [isAborted] - optional callback returning true if operation should abort
 * @returns {{rows: Array, cells: Array}|null} result or null if aborted
 */
export function redetectColumnsForRows(imageData, rows, opts = {}, isAborted = () => false) {
  const newCells = [];
  for (let i = 0; i < rows.length; i++) {
    if (isAborted()) return null;
    const row = rows[i];
    if (row.baseline == null) {
      row.baseline = Math.round(row.start + (row.end - row.start) * 0.75);
    }
    const clipTop = i > 0
      ? Math.round((rows[i - 1].baseline + row.baseline) / 2)
      : row.start;
    const clipBottom = i < rows.length - 1
      ? Math.round((row.baseline + rows[i + 1].baseline) / 2)
      : row.end;
    const cols = detectColumns(imageData, { start: clipTop, end: clipBottom }, opts);
    newCells.push(cols.map(col => ({
      x: col.start, y: row.start,
      w: col.end - col.start, h: row.end - row.start,
      baseline: row.baseline
    })));
  }
  return { rows, cells: newCells };
}
