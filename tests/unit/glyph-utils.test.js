import { describe, it, expect } from 'vitest';
import { computeGlyphWidth, computeSpaceWidth, traceCell } from '../../src/lib/glyph-utils.js';
import { EM_SQUARE } from '../../src/lib/constants.js';
import { createCanvas } from 'canvas';

describe('glyph-utils', () => {
  describe('computeGlyphWidth', () => {
    it('should compute width from x-coordinates plus padding', () => {
      const commands = [
        { type: 'M', x: 100, y: 0 },
        { type: 'L', x: 500, y: 0 },
        { type: 'L', x: 500, y: 700 },
        { type: 'L', x: 100, y: 700 },
        { type: 'Z' }
      ];
      const width = computeGlyphWidth(commands);
      // (500 - 100) + 1000 * 0.15 = 400 + 150 = 550
      expect(width).toBe(550);
    });

    it('should return fallback for commands with no x coordinates', () => {
      const commands = [{ type: 'Z' }];
      const width = computeGlyphWidth(commands);
      expect(width).toBe(EM_SQUARE * 0.5);
    });

    it('should clamp to emSquare', () => {
      const commands = [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 2000, y: 0 },
        { type: 'Z' }
      ];
      const width = computeGlyphWidth(commands);
      expect(width).toBe(EM_SQUARE);
    });
  });

  describe('computeSpaceWidth', () => {
    it('should compute from lowercase average width', () => {
      const entries = [
        { char: 'a', width: 400 },
        { char: 'b', width: 500 },
        { char: 'c', width: 300 },
      ];
      const width = computeSpaceWidth(entries, 60);
      // avg = 400, * 0.6 = 240
      expect(width).toBe(240);
    });

    it('should use fallback when no lowercase entries', () => {
      const entries = [
        { char: 'A', width: 600 },
        { char: 'B', width: 500 },
      ];
      const width = computeSpaceWidth(entries, 60);
      // Fallback: 1000 * 0.3 * 0.6/0.6 = 300
      expect(width).toBe(300);
    });

    it('should scale with spaceWidthPercent', () => {
      const entries = [
        { char: 'a', width: 400 },
        { char: 'b', width: 400 },
      ];
      // 50%: avg 400 * 0.5 = 200
      expect(computeSpaceWidth(entries, 50)).toBe(200);
      // 100%: avg 400 * 1.0 = 400
      expect(computeSpaceWidth(entries, 100)).toBe(400);
    });
  });

  describe('traceCell', () => {
    it('should trace a black square cell into glyph data', () => {
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'black';
      ctx.fillRect(20, 20, 60, 60);

      const result = traceCell(canvas, { x: 0, y: 0, w: 100, h: 100 }, 100);

      expect(result).not.toBeNull();
      expect(result.commands.length).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
    });

    it('should return null for empty cell', () => {
      const canvas = createCanvas(50, 50);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 50, 50);

      const result = traceCell(canvas, { x: 0, y: 0, w: 50, h: 50 }, 50);
      expect(result).toBeNull();
    });
  });
});
