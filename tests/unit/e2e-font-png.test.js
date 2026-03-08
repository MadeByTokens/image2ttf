import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { createCanvas, loadImage, ImageData } from 'canvas';
import { autoDetectGrid, cropCell } from '../../src/lib/segmentation.js';
import { traceGlyph, svgPathToOpentypePath, cleanupPaths } from '../../src/lib/tracing.js';
import { createFont } from '../../src/lib/font-builder.js';
import { DEFAULT_CHARSET, EM_SQUARE } from '../../src/lib/constants.js';
import opentype from 'opentype.js';

const FONT_PNG_PATH = resolve(import.meta.dirname, '../../font.png');
const fontPngExists = existsSync(FONT_PNG_PATH);

// Skip entire suite if font.png is missing (CI, fresh clone)
const describeIfFontPng = fontPngExists ? describe : describe.skip;

/**
 * Rasterize an opentype glyph to a binary canvas (black pixels = ink)
 */
function rasterizeGlyph(glyph, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size, size);

  // Draw the glyph path scaled to fit the canvas
  const path = glyph.getPath(0, size * 0.8, size);
  const pathData = path.toPathData(2);
  if (!pathData || pathData.length === 0) return null;

  // Use opentype's draw method
  ctx.fillStyle = 'black';
  path.fill = 'black';
  path.draw(ctx);

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Extract binary mask (array of 0/1) from ImageData using a threshold
 */
function toBinaryMask(imageData, threshold = 128) {
  const { data, width, height } = imageData;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    mask[i] = gray < threshold ? 1 : 0;
  }
  return mask;
}

/**
 * Resize a binary mask to target dimensions using nearest-neighbor
 */
function resizeMask(mask, srcW, srcH, dstW, dstH) {
  const resized = new Uint8Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(Math.floor(x * srcW / dstW), srcW - 1);
      const srcY = Math.min(Math.floor(y * srcH / dstH), srcH - 1);
      resized[y * dstW + x] = mask[srcY * srcW + srcX];
    }
  }
  return resized;
}

/**
 * Compute Intersection over Union (IoU) between two binary masks
 */
function computeIoU(maskA, maskB) {
  if (maskA.length !== maskB.length) throw new Error('Mask size mismatch');
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < maskA.length; i++) {
    if (maskA[i] || maskB[i]) union++;
    if (maskA[i] && maskB[i]) intersection++;
  }
  return union === 0 ? 0 : intersection / union;
}

/**
 * Count dark pixels in a binary mask
 */
function countInk(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) count++;
  }
  return count;
}

/**
 * Find the bounding box of ink pixels in a mask
 */
function inkBoundingBox(mask, w, h) {
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Crop a mask to its ink bounding box
 */
function cropMask(mask, srcW, srcH) {
  const bb = inkBoundingBox(mask, srcW, srcH);
  if (!bb) return { mask: new Uint8Array(0), w: 0, h: 0 };
  const cropped = new Uint8Array(bb.w * bb.h);
  for (let y = 0; y < bb.h; y++) {
    for (let x = 0; x < bb.w; x++) {
      cropped[y * bb.w + x] = mask[(bb.y + y) * srcW + (bb.x + x)];
    }
  }
  return { mask: cropped, w: bb.w, h: bb.h };
}

/**
 * Normalize a mask: crop to ink bounding box, then resize to target size.
 * This removes position/alignment differences so we compare shape only.
 */
function normalizeMask(imageData, targetSize, threshold = 128) {
  const raw = toBinaryMask(imageData, threshold);
  const { mask: cropped, w: cw, h: ch } = cropMask(raw, imageData.width, imageData.height);
  if (cw === 0 || ch === 0) return null;
  return resizeMask(cropped, cw, ch, targetSize, targetSize);
}


describeIfFontPng('End-to-end: font.png pipeline', () => {
  let imageData;
  let sourceCanvas;
  let grid;
  let charMap;

  beforeAll(async () => {
    const img = await loadImage(FONT_PNG_PATH);
    sourceCanvas = createCanvas(img.width, img.height);
    const ctx = sourceCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    imageData = ctx.getImageData(0, 0, img.width, img.height);
  });

  describe('Grid detection on font.png', () => {
    it('should detect at least 3 rows', () => {
      grid = autoDetectGrid(imageData);
      expect(grid.rows.length).toBeGreaterThanOrEqual(3);
    });

    it('should detect at least 40 total cells', () => {
      const totalCells = grid.cells.flat().length;
      expect(totalCells).toBeGreaterThanOrEqual(40);
    });

    it('should have cells with reasonable dimensions', () => {
      const flatCells = grid.cells.flat();
      for (const cell of flatCells) {
        expect(cell.w).toBeGreaterThan(2);
        expect(cell.h).toBeGreaterThan(10);
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.w).toBeLessThanOrEqual(imageData.width + 1);
        expect(cell.y + cell.h).toBeLessThanOrEqual(imageData.height + 1);
      }
    });

    it('cells should not overlap significantly within a row', () => {
      for (const row of grid.cells) {
        const sorted = [...row].sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = sorted[i - 1].x + sorted[i - 1].w;
          const currStart = sorted[i].x;
          // Allow up to 3px overlap (sub-pixel rounding)
          expect(currStart).toBeGreaterThanOrEqual(prevEnd - 3);
        }
      }
    });
  });

  describe('Cell cropping', () => {
    it('most cells should have ink (non-empty)', () => {
      const flatCells = grid.cells.flat();
      charMap = DEFAULT_CHARSET.slice(0, flatCells.length);
      let nonEmpty = 0;
      for (const cell of flatCells) {
        const cropped = cropCell(sourceCanvas, cell);
        if (!cropped.empty) nonEmpty++;
      }
      // At least 80% of cells should have content
      const ratio = nonEmpty / flatCells.length;
      expect(ratio).toBeGreaterThan(0.8);
    });
  });

  describe('Tracing and font generation', () => {
    let glyphMap;
    let font;
    let parsedFont;

    it('should trace glyphs for most detected cells', () => {
      glyphMap = new Map();
      const flatCells = grid.cells.flat();
      const total = Math.min(flatCells.length, charMap.length);
      const refHeight = Math.max(...flatCells.map(c => c.h));
      let traced = 0;

      for (let i = 0; i < total; i++) {
        const cell = flatCells[i];
        const char = charMap[i];
        if (!char || char === ' ') continue;

        const cropped = cropCell(sourceCanvas, cell);
        if (cropped.empty) continue;

        const svgPaths = traceGlyph(cropped.imageData);
        if (svgPaths.length === 0) continue;

        const commands = svgPathToOpentypePath(
          svgPaths,
          cropped.imageData.width,
          cropped.imageData.height,
          EM_SQUARE,
          { cellHeight: refHeight, trimOffsetY: cropped.trimRect.y }
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
          traced++;
        }
      }

      // At least 70% of characters should trace successfully
      expect(traced / total).toBeGreaterThan(0.7);
      expect(glyphMap.size).toBeGreaterThan(0);
    });

    it('should build a valid font from traced glyphs', () => {
      font = createFont(glyphMap, { familyName: 'TestHandwriting' });
      expect(font).toBeDefined();
      expect(font.glyphs.length).toBeGreaterThanOrEqual(glyphMap.size + 2); // +notdef+space
    });

    it('font should serialize to TTF and parse back', () => {
      const buffer = font.toArrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(100);

      parsedFont = opentype.parse(buffer);
      expect(parsedFont).toBeDefined();
      expect(parsedFont.glyphs.length).toBe(font.glyphs.length);
    });

    it('parsed font should contain all expected characters', () => {
      for (const [char] of glyphMap) {
        const glyph = parsedFont.charToGlyph(char);
        expect(glyph, `Missing glyph for "${char}"`).toBeDefined();
        expect(glyph.name, `Glyph for "${char}" mapped to .notdef`).not.toBe('.notdef');
      }
    });

    it('each glyph path should have non-trivial commands', () => {
      for (const [char] of glyphMap) {
        const glyph = parsedFont.charToGlyph(char);
        expect(
          glyph.path.commands.length,
          `Glyph "${char}" has empty path`
        ).toBeGreaterThan(2);
      }
    });

    it('rendered glyphs should visually resemble the source cells (IoU check)', () => {
      const NORM_SIZE = 32; // Normalize both to 32x32 bounding-box crops
      const MIN_IOU = 0.20;
      const flatCells = grid.cells.flat();
      let checked = 0;
      let passed = 0;
      let totalIoU = 0;
      const failures = [];

      for (let i = 0; i < Math.min(flatCells.length, charMap.length); i++) {
        const char = charMap[i];
        if (!char || char === ' ' || !glyphMap.has(char)) continue;

        const cell = flatCells[i];
        const cropped = cropCell(sourceCanvas, cell);
        if (cropped.empty) continue;

        // Normalize source: crop to ink bbox, resize to NORM_SIZE
        const sourceNorm = normalizeMask(cropped.imageData, NORM_SIZE);
        if (!sourceNorm || countInk(sourceNorm) < 3) continue;

        // Render glyph from font
        const glyph = parsedFont.charToGlyph(char);
        const rendered = rasterizeGlyph(glyph, 64);
        if (!rendered) continue;

        // Normalize rendered: crop to ink bbox, resize to NORM_SIZE
        const renderedNorm = normalizeMask(rendered, NORM_SIZE);
        if (!renderedNorm || countInk(renderedNorm) < 2) continue;

        const iou = computeIoU(sourceNorm, renderedNorm);
        checked++;
        totalIoU += iou;

        if (iou >= MIN_IOU) {
          passed++;
        } else {
          failures.push({ char, iou: iou.toFixed(3) });
        }
      }

      if (failures.length > 0) {
        console.warn(
          `IoU failures (${failures.length}/${checked}):`,
          failures.slice(0, 10).map(f => `"${f.char}": ${f.iou}`).join(', ')
        );
      }

      const avgIoU = checked > 0 ? totalIoU / checked : 0;
      console.log(`Average IoU across ${checked} glyphs: ${avgIoU.toFixed(3)} (bbox-normalized ${NORM_SIZE}x${NORM_SIZE})`);

      // At least 60% of glyphs should pass the per-glyph threshold
      const passRate = checked > 0 ? passed / checked : 0;
      expect(passRate, `Only ${passed}/${checked} glyphs passed IoU >= ${MIN_IOU}`).toBeGreaterThan(0.6);

      // Average IoU should be meaningful now that we're comparing shapes
      expect(avgIoU).toBeGreaterThan(0.30);
    });
  });
});
