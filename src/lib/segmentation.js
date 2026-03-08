import {
  DARK_PIXEL_THRESHOLD,
  ROW_DENSITY_THRESHOLD,
  COL_DENSITY_THRESHOLD,
  MIN_ROW_HEIGHT,
  MIN_COL_WIDTH,
  MIN_GAP_FRACTION
} from './constants.js';

/**
 * Get grayscale value for a pixel in ImageData
 */
function getGray(data, idx) {
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
}

/**
 * Compute horizontal projection — count of dark pixels per row
 */
function horizontalProjection(imageData, threshold = DARK_PIXEL_THRESHOLD) {
  const { data, width, height } = imageData;
  const projection = new Array(height).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = getGray(data, idx);
      const alpha = data[idx + 3];
      if (gray < threshold && alpha > 128) {
        projection[y]++;
      }
    }
  }
  return projection;
}

/**
 * Compute vertical projection — count of dark pixels per column
 */
function verticalProjection(imageData, startRow, endRow, threshold = DARK_PIXEL_THRESHOLD) {
  const { data, width } = imageData;
  const projection = new Array(width).fill(0);

  for (let y = startRow; y < endRow; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = getGray(data, idx);
      const alpha = data[idx + 3];
      if (gray < threshold && alpha > 128) {
        projection[x]++;
      }
    }
  }
  return projection;
}

/**
 * Find contiguous runs of "content" in a projection array
 */
function findRuns(projection, threshold, minSize) {
  const runs = [];
  let inRun = false;
  let start = 0;

  for (let i = 0; i < projection.length; i++) {
    if (projection[i] > threshold && !inRun) {
      inRun = true;
      start = i;
    } else if (projection[i] <= threshold && inRun) {
      inRun = false;
      if (i - start >= minSize) {
        runs.push({ start, end: i });
      }
    }
  }
  if (inRun && projection.length - start >= minSize) {
    runs.push({ start, end: projection.length });
  }
  return runs;
}

/**
 * Merge runs that are too close together (gap < minGap)
 */
function mergeCloseRuns(runs, minGap) {
  if (runs.length <= 1) return runs;
  const merged = [{ ...runs[0] }];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    if (runs[i].start - prev.end < minGap) {
      prev.end = runs[i].end;
    } else {
      merged.push({ ...runs[i] });
    }
  }
  return merged;
}

/**
 * Detect row boundaries in the image
 */
export function detectRows(imageData) {
  const { width } = imageData;
  const hProj = horizontalProjection(imageData);
  const threshold = width * ROW_DENSITY_THRESHOLD;
  let rows = findRuns(hProj, threshold, MIN_ROW_HEIGHT);

  // Merge rows that are very close (lined paper artifacts)
  if (rows.length > 0) {
    const avgHeight = rows.reduce((s, r) => s + (r.end - r.start), 0) / rows.length;
    rows = mergeCloseRuns(rows, avgHeight * MIN_GAP_FRACTION);
  }

  return rows;
}

/**
 * Detect column boundaries within a single row
 */
export function detectColumns(imageData, rowBound) {
  const vProj = verticalProjection(imageData, rowBound.start, rowBound.end);
  const rowHeight = rowBound.end - rowBound.start;
  const threshold = rowHeight * COL_DENSITY_THRESHOLD;
  let cols = findRuns(vProj, threshold, MIN_COL_WIDTH);

  // Merge close columns
  if (cols.length > 0) {
    const avgWidth = cols.reduce((s, c) => s + (c.end - c.start), 0) / cols.length;
    cols = mergeCloseRuns(cols, avgWidth * MIN_GAP_FRACTION);
  }

  return cols;
}

/**
 * Auto-detect the full grid of character cells
 * Returns { rows: [{start, end}], cells: [[{x, y, w, h}]] }
 */
export function autoDetectGrid(imageData) {
  const rows = detectRows(imageData);
  const cells = [];

  for (const row of rows) {
    const cols = detectColumns(imageData, row);
    const rowCells = cols.map(col => ({
      x: col.start,
      y: row.start,
      w: col.end - col.start,
      h: row.end - row.start
    }));
    cells.push(rowCells);
  }

  return { rows, cells };
}

/**
 * Crop a single cell from a canvas, threshold to B&W, and trim whitespace
 */
export function cropCell(sourceCanvas, rect) {
  const { x, y, w, h } = rect;

  // Extract the cell region
  const cellCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : createTempCanvas(w, h);
  const ctx = cellCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);

  // Threshold to black & white
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const gray = getGray(data, idx);
      if (gray < DARK_PIXEL_THRESHOLD) {
        // Dark pixel — make pure black
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 255;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
        hasContent = true;
      } else {
        // Light pixel — make pure white
        data[idx] = 255;
        data[idx + 1] = 255;
        data[idx + 2] = 255;
        data[idx + 3] = 255;
      }
    }
  }

  if (!hasContent) {
    return { canvas: cellCanvas, imageData, trimRect: { x: 0, y: 0, w, h }, empty: true };
  }

  // Trim to bounding box with small padding
  const pad = 2;
  const tx = Math.max(0, minX - pad);
  const ty = Math.max(0, minY - pad);
  const tw = Math.min(w - tx, maxX - minX + 1 + pad * 2);
  const th = Math.min(h - ty, maxY - minY + 1 + pad * 2);

  const trimmedCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(tw, th)
    : createTempCanvas(tw, th);
  const trimCtx = trimmedCanvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
  trimCtx.drawImage(cellCanvas, tx, ty, tw, th, 0, 0, tw, th);

  return {
    canvas: trimmedCanvas,
    imageData: trimCtx.getImageData(0, 0, tw, th),
    trimRect: { x: tx, y: ty, w: tw, h: th },
    empty: false
  };
}

/**
 * Helper to create a canvas in Node.js (tests) or browser
 */
function createTempCanvas(w, h) {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  // Node.js with canvas package
  if (typeof globalThis.createCanvas === 'function') {
    return globalThis.createCanvas(w, h);
  }
  throw new Error('No canvas implementation available');
}
