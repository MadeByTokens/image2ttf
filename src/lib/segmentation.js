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
 * Find the deepest valley (local minimum) in a projection slice.
 * Returns the split point, or -1 if no good valley exists.
 */
function findValley(projection, start, end, minDepthRatio = 0.4) {
  const slice = projection.slice(start, end);
  const peak = Math.max(...slice);
  if (peak === 0) return -1;

  // Smooth the projection to avoid noise valleys
  const smoothed = new Array(slice.length).fill(0);
  const radius = Math.max(1, Math.floor(slice.length / 20));
  for (let i = 0; i < slice.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(slice.length - 1, i + radius); j++) {
      sum += slice[j];
      count++;
    }
    smoothed[i] = sum / count;
  }

  // Don't split near edges — only look at the middle 80%
  const margin = Math.floor(slice.length * 0.1);
  let minVal = Infinity;
  let minIdx = -1;
  for (let i = margin; i < slice.length - margin; i++) {
    if (smoothed[i] < minVal) {
      minVal = smoothed[i];
      minIdx = i;
    }
  }

  // Only split if the valley is deep enough relative to the peak
  if (minIdx >= 0 && minVal < peak * (1 - minDepthRatio)) {
    return start + minIdx;
  }
  return -1;
}

/**
 * Recursively split rows by finding valleys in the horizontal projection.
 * Handles cases where lined paper noise merges distinct text rows into one run.
 */
function splitRowsByValley(rows, hProj, minRowH = MIN_ROW_HEIGHT) {
  const result = [];
  for (const row of rows) {
    const h = row.end - row.start;
    // Only try splitting rows tall enough to contain two sub-rows
    if (h >= minRowH * 2) {
      const splitY = findValley(hProj, row.start, row.end);
      if (splitY > 0 && splitY - row.start >= minRowH && row.end - splitY >= minRowH) {
        // Recurse on each half in case there are multiple sub-rows
        const upper = { start: row.start, end: splitY };
        const lower = { start: splitY, end: row.end };
        result.push(...splitRowsByValley([upper], hProj, minRowH));
        result.push(...splitRowsByValley([lower], hProj, minRowH));
        continue;
      }
    }
    result.push(row);
  }
  return result;
}

/**
 * Detect row boundaries in the image
 */
export function detectRows(imageData, opts = {}) {
  const {
    darkPixelThreshold = DARK_PIXEL_THRESHOLD,
    rowDensityThreshold = ROW_DENSITY_THRESHOLD,
    minRowHeight = MIN_ROW_HEIGHT,
    minGapFraction = MIN_GAP_FRACTION
  } = opts;
  const { width } = imageData;
  const hProj = horizontalProjection(imageData, darkPixelThreshold);
  const threshold = width * rowDensityThreshold;
  let rows = findRuns(hProj, threshold, minRowHeight);

  // Merge rows that are very close (lined paper artifacts)
  if (rows.length > 0) {
    const avgHeight = rows.reduce((s, r) => s + (r.end - r.start), 0) / rows.length;
    rows = mergeCloseRuns(rows, avgHeight * minGapFraction);
  }

  // Split rows that contain valleys (e.g. lined paper merges distinct text rows)
  rows = splitRowsByValley(rows, hProj, minRowHeight);

  // Filter out noise rows — require peak projection to exceed 2% of image width
  const peakThreshold = width * 0.02;
  rows = rows.filter(row => {
    const peak = Math.max(...hProj.slice(row.start, row.end));
    return peak >= peakThreshold;
  });

  return rows;
}

/**
 * Detect column boundaries within a single row
 */
export function detectColumns(imageData, rowBound, opts = {}) {
  const {
    darkPixelThreshold = DARK_PIXEL_THRESHOLD,
    colDensityThreshold = COL_DENSITY_THRESHOLD,
    minColWidth = MIN_COL_WIDTH,
    minGapFraction = MIN_GAP_FRACTION
  } = opts;
  const vProj = verticalProjection(imageData, rowBound.start, rowBound.end, darkPixelThreshold);
  const rowHeight = rowBound.end - rowBound.start;
  const threshold = rowHeight * colDensityThreshold;
  let cols = findRuns(vProj, threshold, minColWidth);

  // Merge close columns
  if (cols.length > 0) {
    const avgWidth = cols.reduce((s, c) => s + (c.end - c.start), 0) / cols.length;
    cols = mergeCloseRuns(cols, avgWidth * minGapFraction);
  }

  return cols;
}

/**
 * Auto-detect the full grid of character cells
 * Returns { rows: [{start, end, baseline}], cells: [[{x, y, w, h}]] }
 *
 * Each row gets a baseline (where characters "sit"), computed as ~75% down
 * from the row top. Column detection uses baseline midpoints as clip bounds
 * to avoid false positives from descenders/ascenders overlapping into
 * adjacent rows.
 */
export function autoDetectGrid(imageData, opts = {}) {
  const rows = detectRows(imageData, opts);

  // Add baselines to rows (~75% down from top, leaving room for descenders)
  for (const row of rows) {
    row.baseline = Math.round(row.start + (row.end - row.start) * 0.75);
  }

  // Compute clip bounds for column detection using baseline midpoints
  const cells = [];
  for (let i = 0; i < rows.length; i++) {
    const clipTop = i > 0
      ? Math.round((rows[i - 1].baseline + rows[i].baseline) / 2)
      : rows[i].start;
    const clipBottom = i < rows.length - 1
      ? Math.round((rows[i].baseline + rows[i + 1].baseline) / 2)
      : rows[i].end;

    // Detect columns using clipped bounds (avoids overlap interference)
    const clipBound = { start: clipTop, end: clipBottom };
    const cols = detectColumns(imageData, clipBound, opts);

    // Cell bboxes use full row extent but carry baseline for overlap filtering
    const rowCells = cols.map(col => ({
      x: col.start,
      y: rows[i].start,
      w: col.end - col.start,
      h: rows[i].end - rows[i].start,
      baseline: rows[i].baseline
    }));
    cells.push(rowCells);
  }

  return { rows, cells };
}

/**
 * Crop a single cell from a canvas, threshold to B&W, and trim whitespace
 */
export function cropCell(sourceCanvas, rect) {
  // Round coordinates to integers to avoid anti-aliasing artifacts
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));

  // Extract the cell region
  const cellCanvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : createTempCanvas(w, h);
  const ctx = cellCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);

  // Threshold to black & white
  // Use a more lenient threshold than grid detection (which needs to
  // ignore noise) — here we want to capture light ink like pencil strokes
  // and thin characters like apostrophes, commas, periods
  const cropThreshold = Math.min(200, Math.round(DARK_PIXEL_THRESHOLD * 1.6));
  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  let hasContent = false;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const gray = getGray(data, idx);
      if (gray < cropThreshold) {
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

  // Baseline-aware filtering: remove disconnected ink from adjacent rows
  if (rect.baseline != null && hasContent) {
    const baselineLocal = Math.round(rect.baseline - y);
    // Primary zone: top of cell to baseline + small margin (catches round bottoms)
    const margin = Math.round(Math.max(5, baselineLocal * 0.1));
    const primaryBottom = Math.min(h, baselineLocal + margin);

    // Flood fill from dark pixels in primary zone to find connected content
    const keep = new Uint8Array(w * h);
    const stack = [];

    for (let py = 0; py < primaryBottom; py++) {
      for (let px = 0; px < w; px++) {
        const pos = py * w + px;
        if (data[pos * 4] === 0 && !keep[pos]) {
          stack.push(pos);
          while (stack.length > 0) {
            const cur = stack.pop();
            if (keep[cur]) continue;
            keep[cur] = 1;
            const cx = cur % w;
            const cy = (cur - cx) / w;
            for (let ddy = -1; ddy <= 1; ddy++) {
              for (let ddx = -1; ddx <= 1; ddx++) {
                if (ddx === 0 && ddy === 0) continue;
                const nx = cx + ddx, ny = cy + ddy;
                if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                  const npos = ny * w + nx;
                  if (!keep[npos] && data[npos * 4] === 0) {
                    stack.push(npos);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Mask out dark pixels not connected to primary zone and recompute bounds
    hasContent = false;
    minX = w; minY = h; maxX = 0; maxY = 0;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const idx = (py * w + px) * 4;
        if (data[idx] === 0) {
          if (!keep[py * w + px]) {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = 255;
          } else {
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
            hasContent = true;
          }
        }
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
