/**
 * Web Worker for heavy computations.
 * Handles: grid detection, column re-detection, thumbnail generation, tracing.
 * Keeps the main thread free for UI responsiveness.
 */
import { autoDetectGrid, detectColumns, cropCell } from './segmentation.js';
import { traceGlyph, svgPathToOpentypePath, cleanupPaths, smoothnessToOpts } from './tracing.js';
import { EM_SQUARE } from './constants.js';

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
        const { rows, opts } = payload;
        const newCells = [];
        for (let i = 0; i < rows.length; i++) {
          if (aborted) { self.postMessage({ id, type: 'aborted' }); return; }
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
        self.postMessage({ id, type: 'result', result: { rows, cells: newCells } });
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
          } catch {
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
        const tracingOpts = payload.smoothness != null
          ? smoothnessToOpts(payload.smoothness) : {};
        const entries = []; // [{char, commands, width}]

        for (let i = 0; i < total; i++) {
          if (aborted) { self.postMessage({ id, type: 'aborted' }); return; }

          const cell = flatCells[i];
          const char = charMap[i];
          if (!char || char === ' ') { continue; }

          try {
            const cropped = cropCell(sourceCanvas, cell);
            if (cropped.empty) continue;

            const svgPaths = traceGlyph(cropped.imageData, tracingOpts);
            if (svgPaths.length === 0) continue;

            const commands = svgPathToOpentypePath(
              svgPaths,
              cropped.imageData.width,
              cropped.imageData.height,
              EM_SQUARE,
              { cellHeight: refHeight, trimOffsetY: cropped.trimRect.y }
            );
            const cleaned = cleanupPaths(commands);
            if (cleaned.length === 0) continue;

            let minX = Infinity, maxX = -Infinity;
            for (const cmd of cleaned) {
              if (cmd.x !== undefined) {
                minX = Math.min(minX, cmd.x);
                maxX = Math.max(maxX, cmd.x);
              }
            }
            const width = maxX > minX ? maxX - minX + EM_SQUARE * 0.15 : EM_SQUARE * 0.5;
            entries.push({ char, commands: cleaned, width: Math.min(width, EM_SQUARE) });
          } catch (err) {
            // Skip failed glyphs
          }

          // Progress every cell
          self.postMessage({ id, type: 'progress', current: i + 1, total });
        }

        // Auto-generate space width
        const spacePercent = (payload.spaceWidthPercent ?? 60) / 100;
        const lowercaseWidths = entries
          .filter(e => e.char >= 'a' && e.char <= 'z')
          .map(e => e.width);
        const spaceWidth = lowercaseWidths.length > 0
          ? Math.round(lowercaseWidths.reduce((s, w) => s + w, 0) / lowercaseWidths.length * spacePercent)
          : Math.round(EM_SQUARE * 0.3 * spacePercent / 0.6);
        entries.push({ char: ' ', commands: [], width: spaceWidth });

        self.postMessage({ id, type: 'result', result: { entries } });
        break;
      }
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message });
  }
};
