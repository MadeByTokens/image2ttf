import { describe, it, expect } from 'vitest';
import { computeGlyphWidth, computeSpaceWidth, traceCell, normalizeBaselines, commandsToSvgPath } from '../../src/lib/glyph-utils.js';
import { EM_SQUARE, ASCENDER } from '../../src/lib/constants.js';
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

  describe('normalizeBaselines', () => {
    function makeEntry(char, minY, maxY) {
      return {
        char,
        commands: [
          { type: 'M', x: 100, y: maxY },
          { type: 'L', x: 500, y: maxY },
          { type: 'L', x: 500, y: minY },
          { type: 'L', x: 100, y: minY },
          { type: 'Z' }
        ],
        width: 550
      };
    }

    it('should align non-descender characters to median min-Y', () => {
      const entries = [
        makeEntry('a', 100, 500),  // min-Y = 100
        makeEntry('b', 100, 700),  // min-Y = 100
        makeEntry('c', 100, 500),  // min-Y = 100
        makeEntry('r', 130, 500),  // min-Y = 130 (written higher)
        makeEntry('o', 95, 500),   // min-Y = 95
      ];

      normalizeBaselines(entries);

      // After normalization, all should have min-Y = median (100)
      for (const entry of entries) {
        let minY = Infinity;
        for (const cmd of entry.commands) {
          if (cmd.y !== undefined) minY = Math.min(minY, cmd.y);
        }
        expect(minY).toBeCloseTo(100, 0);
      }
    });

    it('should shift descender chars by average correction', () => {
      const entries = [
        makeEntry('a', 100, 500),
        makeEntry('b', 100, 700),
        makeEntry('c', 110, 500),  // 10 above target
        makeEntry('g', -50, 500),  // descender — should get average shift
      ];

      const gMinYBefore = -50;
      normalizeBaselines(entries);

      // 'g' should be shifted by average correction of non-descender chars
      let gMinY = Infinity;
      for (const cmd of entries[3].commands) {
        if (cmd.y !== undefined) gMinY = Math.min(gMinY, cmd.y);
      }
      // Average shift of a,b,c: (0 + 0 + -10)/3 ≈ -3.33
      // g min-Y should be roughly -50 + (-3.33) = -53.33
      expect(gMinY).toBeCloseTo(gMinYBefore + (100 - 100 + 100 - 100 + 100 - 110) / 3, 0);
    });

    it('should skip normalization with fewer than 3 reference chars', () => {
      const entries = [
        makeEntry('a', 120, 500),
        makeEntry('g', -50, 500),  // descender, not a reference
      ];

      normalizeBaselines(entries);

      // Should be unchanged — only 1 reference char
      let aMinY = Infinity;
      for (const cmd of entries[0].commands) {
        if (cmd.y !== undefined) aMinY = Math.min(aMinY, cmd.y);
      }
      expect(aMinY).toBe(120);
    });

    it('should handle empty entries array', () => {
      const entries = [];
      normalizeBaselines(entries); // should not throw
      expect(entries.length).toBe(0);
    });
  });

  describe('commandsToSvgPath', () => {
    it('should convert M/L/Z commands with Y-flip', () => {
      const commands = [
        { type: 'M', x: 0, y: 100 },
        { type: 'L', x: 500, y: 100 },
        { type: 'L', x: 500, y: 700 },
        { type: 'L', x: 0, y: 700 },
        { type: 'Z' }
      ];
      const d = commandsToSvgPath(commands);
      // Y should be flipped: ASCENDER - y
      expect(d).toContain(`M0 ${ASCENDER - 100}`);
      expect(d).toContain('Z');
    });

    it('should handle Q and C commands', () => {
      const commands = [
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 50, y1: 100, x: 100, y: 0 },
        { type: 'C', x1: 150, y1: 100, x2: 200, y2: 100, x: 250, y: 0 },
        { type: 'Z' }
      ];
      const d = commandsToSvgPath(commands);
      expect(d).toContain('Q');
      expect(d).toContain('C');
    });
  });
});
