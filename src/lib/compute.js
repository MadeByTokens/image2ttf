/**
 * Manages a Web Worker for heavy computations.
 * Provides async API with abort support.
 * Falls back to main-thread execution if workers are unavailable.
 */
import { autoDetectGrid, detectColumns, cropCell } from './segmentation.js';

let worker = null;
let nextId = 0;
const pending = new Map();
let workerFailed = false;

function getWorker() {
  if (workerFailed) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./compute-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { id, type, result, error, current, total } = e.data;
        const entry = pending.get(id);
        if (!entry) return;
        if (type === 'result') {
          entry.resolve(result);
          pending.delete(id);
        } else if (type === 'error') {
          entry.reject(new Error(error));
          pending.delete(id);
        } else if (type === 'aborted') {
          entry.reject(new Error('Aborted'));
          pending.delete(id);
        } else if (type === 'progress' && entry.onProgress) {
          entry.onProgress(current, total);
        }
      };
      worker.onerror = () => {
        workerFailed = true;
        worker = null;
        for (const [, entry] of pending) {
          entry.reject(new Error('Worker failed'));
        }
        pending.clear();
      };
    } catch {
      workerFailed = true;
      return null;
    }
  }
  return worker;
}

function sendToWorker(type, payload, onProgress) {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) return reject(new Error('Worker unavailable'));
    const id = nextId++;
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, type, payload });
  });
}

/** Abort all pending computations by terminating the worker */
export function abortCompute() {
  if (worker) {
    worker.terminate();
    worker = null;
    for (const [, entry] of pending) {
      entry.reject(new Error('Aborted'));
    }
    pending.clear();
  }
}

/** Detect grid from canvas image data */
export async function detectGridAsync(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    return await sendToWorker('detectGrid', {
      dataBuffer: imageData.data.buffer,
      width: canvas.width,
      height: canvas.height,
      opts
    });
  } catch (err) {
    if (err.message === 'Aborted') throw err;
    // Fallback to main thread
    console.warn('Worker fallback for detectGrid:', err.message);
    const freshData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return autoDetectGrid(freshData, opts);
  }
}

/** Re-detect columns keeping existing rows */
export async function redetectColumnsAsync(canvas, rows, opts = {}) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    return await sendToWorker('redetectColumns', {
      dataBuffer: imageData.data.buffer,
      width: canvas.width,
      height: canvas.height,
      rows: JSON.parse(JSON.stringify(rows)), // deep clone for worker
      opts
    });
  } catch (err) {
    if (err.message === 'Aborted') throw err;
    // Fallback to main thread
    console.warn('Worker fallback for redetectColumns:', err.message);
    const freshData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const newCells = [];
    for (let i = 0; i < rows.length; i++) {
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
      const cols = detectColumns(freshData, { start: clipTop, end: clipBottom }, opts);
      newCells.push(cols.map(col => ({
        x: col.start, y: row.start,
        w: col.end - col.start, h: row.end - row.start,
        baseline: row.baseline
      })));
    }
    return { rows, cells: newCells };
  }
}

/** Generate thumbnails for all cells */
export async function generateThumbnailsAsync(canvas, cells, charMap, onProgress) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    const result = await sendToWorker('generateThumbnails', {
      dataBuffer: imageData.data.buffer,
      width: canvas.width,
      height: canvas.height,
      cells: JSON.parse(JSON.stringify(cells)),
      charMap: [...charMap]
    }, onProgress);
    return result.thumbnails;
  } catch (err) {
    if (err.message === 'Aborted') throw err;
    // Fallback to main thread
    console.warn('Worker fallback for generateThumbnails:', err.message);
    const flatCells = cells.flat();
    const thumbs = [];
    for (let i = 0; i < flatCells.length && i < charMap.length; i++) {
      try {
        const cropped = cropCell(canvas, flatCells[i]);
        thumbs.push({
          char: charMap[i],
          empty: cropped.empty,
          imageData: cropped.empty ? null : cropped.imageData,
          index: i
        });
      } catch {
        thumbs.push({ char: charMap[i], empty: true, imageData: null, index: i });
      }
    }
    return thumbs;
  }
}

/** Run tracing pipeline in worker */
export async function runTracingAsync(canvas, cells, charMap, opts = {}, onProgress) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  try {
    const result = await sendToWorker('trace', {
      dataBuffer: imageData.data.buffer,
      width: canvas.width,
      height: canvas.height,
      cells: JSON.parse(JSON.stringify(cells)),
      charMap: [...charMap],
      smoothness: opts.smoothness,
      spaceWidthPercent: opts.spaceWidthPercent
    }, onProgress);

    // Convert entries array back to Map
    const glyphMap = new Map();
    for (const entry of result.entries) {
      glyphMap.set(entry.char, { commands: entry.commands, width: entry.width });
    }
    return glyphMap;
  } catch (err) {
    if (err.message === 'Aborted') throw err;
    // Fallback to main-thread pipeline
    console.warn('Worker fallback for tracing:', err.message);
    const { runTracing } = await import('./pipeline.js');
    return runTracing(cells, charMap, canvas, onProgress, opts);
  }
}
