import { describe, it, expect, vi } from 'vitest';
import { runTracing } from '../../src/lib/pipeline.js';
import { createCanvas } from 'canvas';

/** Create a test canvas with black squares at given positions */
function makeTestCanvas(width, height, blocks) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'black';
  for (const { x, y, w, h } of blocks) {
    ctx.fillRect(x, y, w, h);
  }
  return canvas;
}

describe('pipeline', () => {
  describe('runTracing', () => {
    it('should trace black squares into glyph entries', async () => {
      const canvas = makeTestCanvas(300, 60, [
        { x: 5, y: 5, w: 40, h: 40 },
        { x: 105, y: 5, w: 40, h: 40 },
        { x: 205, y: 5, w: 40, h: 40 },
      ]);

      const cells = [[
        { x: 0, y: 0, w: 80, h: 60 },
        { x: 100, y: 0, w: 80, h: 60 },
        { x: 200, y: 0, w: 80, h: 60 },
      ]];
      const charMap = ['A', 'B', 'C'];

      const glyphMap = await runTracing(cells, charMap, canvas);

      expect(glyphMap.size).toBeGreaterThanOrEqual(3); // A, B, C + space
      expect(glyphMap.has('A')).toBe(true);
      expect(glyphMap.has('B')).toBe(true);
      expect(glyphMap.has('C')).toBe(true);

      // Each glyph should have non-empty commands
      for (const ch of ['A', 'B', 'C']) {
        const data = glyphMap.get(ch);
        expect(data.commands.length).toBeGreaterThan(0);
        expect(data.width).toBeGreaterThan(0);
      }
    });

    it('should auto-generate space glyph with correct width', async () => {
      const canvas = makeTestCanvas(200, 60, [
        { x: 5, y: 5, w: 40, h: 40 },
        { x: 105, y: 5, w: 40, h: 40 },
      ]);

      const cells = [[
        { x: 0, y: 0, w: 80, h: 60 },
        { x: 100, y: 0, w: 80, h: 60 },
      ]];
      const charMap = ['a', 'b'];

      const glyphMap = await runTracing(cells, charMap, canvas, () => {}, {
        spaceWidthPercent: 60
      });

      expect(glyphMap.has(' ')).toBe(true);
      const spaceData = glyphMap.get(' ');
      expect(spaceData.commands.length).toBe(0);
      expect(spaceData.width).toBeGreaterThan(0);
    });

    it('should use fallback space width when no lowercase glyphs', async () => {
      const canvas = makeTestCanvas(200, 60, [
        { x: 5, y: 5, w: 40, h: 40 },
        { x: 105, y: 5, w: 40, h: 40 },
      ]);

      const cells = [[
        { x: 0, y: 0, w: 80, h: 60 },
        { x: 100, y: 0, w: 80, h: 60 },
      ]];
      const charMap = ['A', 'B'];

      const glyphMap = await runTracing(cells, charMap, canvas, () => {}, {
        spaceWidthPercent: 60
      });

      expect(glyphMap.has(' ')).toBe(true);
      // Fallback: EM_SQUARE * 0.3 * spacePercent / 0.6 = 1000 * 0.3 * 0.6/0.6 = 300
      expect(glyphMap.get(' ').width).toBe(300);
    });

    it('should fire onProgress callback', async () => {
      const canvas = makeTestCanvas(200, 60, [
        { x: 5, y: 5, w: 40, h: 40 },
      ]);

      const cells = [[
        { x: 0, y: 0, w: 80, h: 60 },
      ]];
      const charMap = ['A'];
      const progressCalls = [];

      await runTracing(cells, charMap, canvas, (current, total) => {
        progressCalls.push({ current, total });
      });

      expect(progressCalls.length).toBeGreaterThan(0);
      // Last call should be (total, total)
      const last = progressCalls[progressCalls.length - 1];
      expect(last.current).toBe(last.total);
    });

    it('should skip empty cells without error', async () => {
      const canvas = makeTestCanvas(200, 60, [
        // Only first cell has content
        { x: 5, y: 5, w: 40, h: 40 },
      ]);

      const cells = [[
        { x: 0, y: 0, w: 80, h: 60 },
        { x: 100, y: 0, w: 80, h: 60 }, // empty cell
      ]];
      const charMap = ['A', 'B'];

      const glyphMap = await runTracing(cells, charMap, canvas);

      expect(glyphMap.has('A')).toBe(true);
      // B might be missing since cell is empty
      expect(glyphMap.has(' ')).toBe(true); // space always added
    });

    it('should skip space characters in charMap', async () => {
      const canvas = makeTestCanvas(200, 60, [
        { x: 5, y: 5, w: 40, h: 40 },
        { x: 105, y: 5, w: 40, h: 40 },
      ]);

      const cells = [[
        { x: 0, y: 0, w: 80, h: 60 },
        { x: 100, y: 0, w: 80, h: 60 },
      ]];
      const charMap = [' ', 'A'];

      const glyphMap = await runTracing(cells, charMap, canvas);

      // Space should be auto-generated, not traced from a cell
      expect(glyphMap.has(' ')).toBe(true);
      expect(glyphMap.get(' ').commands.length).toBe(0);
    });
  });
});
