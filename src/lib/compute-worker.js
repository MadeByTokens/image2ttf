/**
 * Web Worker for heavy computations.
 * Handles: grid detection, column re-detection, thumbnail generation, tracing.
 * Keeps the main thread free for UI responsiveness.
 */
import { autoDetectGrid, detectColumns, cropCell } from './segmentation.js';
import { smoothnessToOpts } from './tracing.js';
import { traceCell, computeSpaceWidth, normalizeBaselines } from './glyph-utils.js';
import { redetectColumnsForRows } from './redetect-columns.js';

let aborted = false;

self.onmessage = async function (e) {
  const { id, type, payload } = e.data;

  if (type === 'abort') {
    aborted = true;
    return;
  }

  aborted = false;

  try {
    switch (type) {
      case 'detectGrid': {
        const imageData = new ImageData(
          new Uint8ClampedArray(payload.dataBuffer),
          payload.width, payload.height
        );
        const grid = autoDetectGrid(imageData, payload.opts);
        self.postMessage({ id, type: 'result', result: grid });
        break;
      }

      case 'redetectColumns': {
        const imageData = new ImageData(
          new Uint8ClampedArray(payload.dataBuffer),
          payload.width, payload.height
        );
        const result = redetectColumnsForRows(imageData, payload.rows, payload.opts, () => aborted);
        if (result === null) {
          self.postMessage({ id, type: 'aborted' });
        } else {
          self.postMessage({ id, type: 'result', result });
        }
        break;
      }

      case 'generateThumbnails': {
        const sourceCanvas = new OffscreenCanvas(payload.width, payload.height);
        const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(payload.dataBuffer), payload.width, payload.height),
          0, 0
        );
        const flatCells = payload.cells.flat();
        const total = Math.min(flatCells.length, payload.charMap.length);
        const thumbs = [];

        for (let i = 0; i < total; i++) {
          if (aborted) { self.postMessage({ id, type: 'aborted' }); return; }
          try {
            const cropped = cropCell(sourceCanvas, flatCells[i]);
            thumbs.push({
              char: payload.charMap[i],
              empty: cropped.empty,
              imageData: cropped.empty ? null : cropped.imageData,
              index: i
            });
          } catch (err) {
            console.warn('[compute-worker] Thumbnail crop failed for cell', i, ':', err);
            thumbs.push({ char: payload.charMap[i], empty: true, imageData: null, index: i });
          }
          if (i % 5 === 0) {
            self.postMessage({ id, type: 'progress', current: i + 1, total });
          }
        }
        self.postMessage({ id, type: 'result', result: { thumbnails: thumbs } });
        break;
      }

      case 'trace': {
        const sourceCanvas = new OffscreenCanvas(payload.width, payload.height);
        const sctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        sctx.putImageData(
          new ImageData(new Uint8ClampedArray(payload.dataBuffer), payload.width, payload.height),
          0, 0
        );
        const flatCells = payload.cells.flat();
        const charMap = payload.charMap;
        const total = Math.min(flatCells.length, charMap.length);
        const refHeight = Math.max(...flatCells.map(c => c.h));
        const tracingOpts = payload.detail != null
          ? smoothnessToOpts(payload.detail) : {};
        const smoothing = payload.smoothing ?? 0;
        const entries = []; // [{char, commands, width}]

        for (let i = 0; i < total; i++) {
          if (aborted) { self.postMessage({ id, type: 'aborted' }); return; }

          const cell = flatCells[i];
          const char = charMap[i];
          if (!char || char === ' ') { continue; }

          try {
            const result = traceCell(sourceCanvas, cell, refHeight, tracingOpts, smoothing);
            if (result) {
              entries.push({ char, commands: result.commands, width: result.width });
            }
          } catch (err) {
            // Skip failed glyphs
          }

          // Progress every cell
          self.postMessage({ id, type: 'progress', current: i + 1, total });
        }

        // Normalize baselines so all characters align consistently
        normalizeBaselines(entries);

        // Auto-generate space width
        const spaceWidth = computeSpaceWidth(entries, payload.spaceWidthPercent ?? 60);
        entries.push({ char: ' ', commands: [], width: spaceWidth });

        self.postMessage({ id, type: 'result', result: { entries } });
        break;
      }
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message });
  }
};
