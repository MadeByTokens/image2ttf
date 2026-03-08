import { describe, it, expect } from 'vitest';
import { detectRows, detectColumns, autoDetectGrid, cropCell } from '../../src/lib/segmentation.js';
import { createCanvas, ImageData } from 'canvas';

/**
 * Create a synthetic test image with dark blocks arranged in a grid
 */
function createTestImage(width, height, blocks) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // Draw dark blocks
  ctx.fillStyle = 'black';
  for (const { x, y, w, h } of blocks) {
    ctx.fillRect(x, y, w, h);
  }

  return {
    canvas,
    imageData: ctx.getImageData(0, 0, width, height)
  };
}

describe('segmentation', () => {
  describe('detectRows', () => {
    it('should detect rows of dark pixels', () => {
      // 3 rows of content at y=10-30, y=50-70, y=90-110
      const { imageData } = createTestImage(200, 120, [
        { x: 10, y: 10, w: 180, h: 20 },
        { x: 10, y: 50, w: 180, h: 20 },
        { x: 10, y: 90, w: 180, h: 20 },
      ]);

      const rows = detectRows(imageData);
      expect(rows.length).toBe(3);
      // Each row should roughly span the dark region
      expect(rows[0].start).toBeLessThanOrEqual(12);
      expect(rows[0].end).toBeGreaterThanOrEqual(28);
    });

    it('should return empty array for blank image', () => {
      const { imageData } = createTestImage(100, 100, []);
      const rows = detectRows(imageData);
      expect(rows.length).toBe(0);
    });
  });

  describe('detectColumns', () => {
    it('should detect columns within a row', () => {
      // 3 columns in one row
      const { imageData } = createTestImage(200, 40, [
        { x: 10, y: 5, w: 30, h: 30 },
        { x: 80, y: 5, w: 30, h: 30 },
        { x: 150, y: 5, w: 30, h: 30 },
      ]);

      const cols = detectColumns(imageData, { start: 0, end: 40 });
      expect(cols.length).toBe(3);
    });
  });

  describe('autoDetectGrid', () => {
    it('should detect a 2x3 grid', () => {
      // 2 rows, 3 columns each
      const { imageData } = createTestImage(200, 100, [
        // Row 1
        { x: 10, y: 10, w: 20, h: 20 },
        { x: 80, y: 10, w: 20, h: 20 },
        { x: 150, y: 10, w: 20, h: 20 },
        // Row 2
        { x: 10, y: 60, w: 20, h: 20 },
        { x: 80, y: 60, w: 20, h: 20 },
        { x: 150, y: 60, w: 20, h: 20 },
      ]);

      const grid = autoDetectGrid(imageData);
      expect(grid.rows.length).toBe(2);
      expect(grid.cells.length).toBe(2);
      expect(grid.cells[0].length).toBe(3);
      expect(grid.cells[1].length).toBe(3);
    });
  });

  describe('cropCell', () => {
    it('should crop and threshold a cell', () => {
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'black';
      ctx.fillRect(30, 30, 40, 40);

      const result = cropCell(canvas, { x: 0, y: 0, w: 100, h: 100 });
      expect(result.empty).toBe(false);
      expect(result.trimRect.w).toBeLessThan(100);
      expect(result.trimRect.h).toBeLessThan(100);
    });

    it('should detect empty cells', () => {
      const canvas = createCanvas(50, 50);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 50, 50);

      const result = cropCell(canvas, { x: 0, y: 0, w: 50, h: 50 });
      expect(result.empty).toBe(true);
    });
  });
});
