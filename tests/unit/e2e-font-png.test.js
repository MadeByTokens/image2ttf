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
          EM_SQUARE
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
      const RENDER_SIZE = 64;
      const MIN_IOU = 0.10; // Minimum acceptable IoU (tracing + rasterization introduces loss)
      const flatCells = grid.cells.flat();
      let checked = 0;
      let passed = 0;
      const failures = [];

      for (let i = 0; i < Math.min(flatCells.length, charMap.length); i++) {
        const char = charMap[i];
        if (!char || char === ' ' || !glyphMap.has(char)) continue;

        const cell = flatCells[i];
        const cropped = cropCell(sourceCanvas, cell);
        if (cropped.empty) continue;

        // Get source mask
        const sourceMask = toBinaryMask(cropped.imageData, 128);
        const srcW = cropped.imageData.width;
        const srcH = cropped.imageData.height;
        const sourceResized = resizeMask(sourceMask, srcW, srcH, RENDER_SIZE, RENDER_SIZE);

        // If source has almost no ink, skip (probably a detection artifact)
        if (countInk(sourceResized) < 5) continue;

        // Render glyph from font
        const glyph = parsedFont.charToGlyph(char);
        const rendered = rasterizeGlyph(glyph, RENDER_SIZE);
        if (!rendered) continue;

        const renderedMask = toBinaryMask(rendered, 128);

        // Both should have some ink
        if (countInk(renderedMask) < 2) continue;

        const iou = computeIoU(sourceResized, renderedMask);
        checked++;

        if (iou >= MIN_IOU) {
          passed++;
        } else {
          failures.push({ char, iou: iou.toFixed(3) });
        }
      }

      // Report failures for debugging
      if (failures.length > 0) {
        console.warn(
          `IoU failures (${failures.length}/${checked}):`,
          failures.slice(0, 10).map(f => `"${f.char}": ${f.iou}`).join(', ')
        );
      }

      // At least 50% of checked glyphs should pass the IoU threshold
      const passRate = checked > 0 ? passed / checked : 0;
      expect(passRate, `Only ${passed}/${checked} glyphs passed IoU >= ${MIN_IOU}`).toBeGreaterThan(0.5);
    });

    it('average IoU across all glyphs should exceed minimum quality', () => {
      const RENDER_SIZE = 64;
      const flatCells = grid.cells.flat();
      let totalIoU = 0;
      let count = 0;

      for (let i = 0; i < Math.min(flatCells.length, charMap.length); i++) {
        const char = charMap[i];
        if (!char || char === ' ' || !glyphMap.has(char)) continue;

        const cell = flatCells[i];
        const cropped = cropCell(sourceCanvas, cell);
        if (cropped.empty) continue;

        const sourceMask = toBinaryMask(cropped.imageData, 128);
        const srcW = cropped.imageData.width;
        const srcH = cropped.imageData.height;
        const sourceResized = resizeMask(sourceMask, srcW, srcH, RENDER_SIZE, RENDER_SIZE);
        if (countInk(sourceResized) < 5) continue;

        const glyph = parsedFont.charToGlyph(char);
        const rendered = rasterizeGlyph(glyph, RENDER_SIZE);
        if (!rendered) continue;

        const renderedMask = toBinaryMask(rendered, 128);
        if (countInk(renderedMask) < 2) continue;

        totalIoU += computeIoU(sourceResized, renderedMask);
        count++;
      }

      const avgIoU = count > 0 ? totalIoU / count : 0;
      console.log(`Average IoU across ${count} glyphs: ${avgIoU.toFixed(3)}`);

      // Average IoU should be at least 0.15 (accounting for tracing/rasterization loss)
      expect(avgIoU).toBeGreaterThan(0.15);
    });
  });
});
