import { describe, it, expect } from 'vitest';
import { traceGlyph, svgPathToOpentypePath, cleanupPaths } from '../../src/lib/tracing.js';
import { createCanvas, ImageData } from 'canvas';

describe('tracing', () => {
  describe('traceGlyph', () => {
    it('should trace a black square into SVG paths', () => {
      // Create a simple black square on white background
      const canvas = createCanvas(50, 50);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 50, 50);
      ctx.fillStyle = 'black';
      ctx.fillRect(10, 10, 30, 30);

      const imageData = ctx.getImageData(0, 0, 50, 50);
      const paths = traceGlyph(imageData);

      expect(paths.length).toBeGreaterThan(0);
      // Should contain path commands
      expect(paths[0]).toMatch(/[MLQCZmlqcz]/);
    });

    it('should return empty for blank image', () => {
      const canvas = createCanvas(30, 30);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 30, 30);

      const imageData = ctx.getImageData(0, 0, 30, 30);
      const paths = traceGlyph(imageData);

      expect(paths.length).toBe(0);
    });
  });

  describe('svgPathToOpentypePath', () => {
    it('should convert SVG path to opentype commands', () => {
      const svgPaths = ['M 10 10 L 40 10 L 40 40 L 10 40 Z'];
      const commands = svgPathToOpentypePath(svgPaths, 50, 50, 1000);

      expect(commands.length).toBeGreaterThan(0);

      // Should have M, L, and Z commands
      const types = commands.map(c => c.type);
      expect(types).toContain('M');
      expect(types).toContain('L');
      expect(types).toContain('Z');
    });

    it('should scale coordinates to em square', () => {
      const svgPaths = ['M 0 0 L 50 0 L 50 50 L 0 50 Z'];
      const commands = svgPathToOpentypePath(svgPaths, 50, 50, 1000);

      // All coordinates should be within 0-1000 range (with some margin for offset)
      for (const cmd of commands) {
        if (cmd.x !== undefined) {
          expect(cmd.x).toBeGreaterThanOrEqual(-200);
          expect(cmd.x).toBeLessThanOrEqual(1200);
        }
        if (cmd.y !== undefined) {
          expect(cmd.y).toBeGreaterThanOrEqual(-200);
          expect(cmd.y).toBeLessThanOrEqual(1200);
        }
      }
    });
  });

  describe('cleanupPaths', () => {
    it('should remove very small paths', () => {
      // A tiny path (area < 50) and a large path
      const commands = [
        // Small path
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 1, y: 0 },
        { type: 'L', x: 1, y: 1 },
        { type: 'L', x: 0, y: 1 },
        { type: 'Z' },
        // Large path
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 100, y: 0 },
        { type: 'L', x: 100, y: 100 },
        { type: 'L', x: 0, y: 100 },
        { type: 'Z' },
      ];

      const cleaned = cleanupPaths(commands, 50);
      // Should keep only the large path
      const moveCount = cleaned.filter(c => c.type === 'M').length;
      expect(moveCount).toBe(1);
    });
  });
});
