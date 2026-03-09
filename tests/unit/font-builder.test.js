import { describe, it, expect } from 'vitest';
import { buildGlyph, createFont, applyGlyphAdjustments } from '../../src/lib/font-builder.js';
import opentype from 'opentype.js';

describe('font-builder', () => {
  describe('applyGlyphAdjustments', () => {
    it('should return unchanged data when no adjustments', () => {
      const commands = [{ type: 'M', x: 10, y: 20 }, { type: 'Z' }];
      const result = applyGlyphAdjustments(commands, 500, null);
      expect(result.commands).toBe(commands); // same reference
      expect(result.width).toBe(500);
    });

    it('should return unchanged data when all zeros', () => {
      const commands = [{ type: 'M', x: 10, y: 20 }, { type: 'Z' }];
      const result = applyGlyphAdjustments(commands, 500, { baseline: 0, bearingLeft: 0, bearingRight: 0 });
      expect(result.commands).toBe(commands);
      expect(result.width).toBe(500);
    });

    it('should shift X by bearingLeft and Y by baseline', () => {
      const commands = [
        { type: 'M', x: 100, y: 200 },
        { type: 'L', x: 300, y: 400 },
        { type: 'Z' }
      ];
      const result = applyGlyphAdjustments(commands, 500, { baseline: 50, bearingLeft: 30, bearingRight: 0 });
      expect(result.commands[0].x).toBe(130);
      expect(result.commands[0].y).toBe(250);
      expect(result.commands[1].x).toBe(330);
      expect(result.commands[1].y).toBe(450);
      expect(result.width).toBe(530); // 500 + 30
    });

    it('should adjust width by bearingLeft + bearingRight', () => {
      const commands = [{ type: 'M', x: 10, y: 20 }, { type: 'Z' }];
      const result = applyGlyphAdjustments(commands, 500, { baseline: 0, bearingLeft: 20, bearingRight: 40 });
      expect(result.width).toBe(560);
    });

    it('should clamp width to zero minimum', () => {
      const commands = [{ type: 'M', x: 10, y: 20 }, { type: 'Z' }];
      const result = applyGlyphAdjustments(commands, 50, { baseline: 0, bearingLeft: -100, bearingRight: -100 });
      expect(result.width).toBe(0);
    });

    it('should handle quadratic and cubic curve control points', () => {
      const commands = [
        { type: 'Q', x1: 50, y1: 100, x: 200, y: 300 },
        { type: 'C', x1: 10, y1: 20, x2: 30, y2: 40, x: 50, y: 60 }
      ];
      const result = applyGlyphAdjustments(commands, 400, { baseline: 10, bearingLeft: 5, bearingRight: 0 });
      expect(result.commands[0]).toEqual({ type: 'Q', x1: 55, y1: 110, x: 205, y: 310 });
      expect(result.commands[1]).toEqual({ type: 'C', x1: 15, y1: 30, x2: 35, y2: 50, x: 55, y: 70 });
    });
  });

  describe('buildGlyph', () => {
    it('should create a glyph with the correct unicode', () => {
      const commands = [
        { type: 'M', x: 100, y: 0 },
        { type: 'L', x: 500, y: 0 },
        { type: 'L', x: 500, y: 700 },
        { type: 'L', x: 100, y: 700 },
        { type: 'Z' }
      ];

      const glyph = buildGlyph('A', commands, 600);
      expect(glyph.unicode).toBe(65); // 'A'
      expect(glyph.advanceWidth).toBe(600);
      expect(glyph.path.commands.length).toBeGreaterThan(0);
    });
  });

  describe('createFont', () => {
    it('should create a valid font with glyphs', () => {
      const glyphMap = new Map();

      // Add a few test glyphs
      const squarePath = [
        { type: 'M', x: 100, y: 0 },
        { type: 'L', x: 500, y: 0 },
        { type: 'L', x: 500, y: 700 },
        { type: 'L', x: 100, y: 700 },
        { type: 'Z' }
      ];

      glyphMap.set('A', { commands: squarePath, width: 600 });
      glyphMap.set('B', { commands: squarePath, width: 600 });
      glyphMap.set('C', { commands: squarePath, width: 600 });

      const font = createFont(glyphMap, { familyName: 'TestFont' });

      expect(font).toBeDefined();
      expect(font.names.fontFamily.en).toBe('TestFont');
      // .notdef + space + A + B + C = 5 glyphs
      expect(font.glyphs.length).toBe(5);
    });

    it('should apply glyph adjustments when building font', () => {
      const glyphMap = new Map();
      glyphMap.set('A', {
        commands: [
          { type: 'M', x: 100, y: 0 },
          { type: 'L', x: 500, y: 0 },
          { type: 'L', x: 500, y: 700 },
          { type: 'L', x: 100, y: 700 },
          { type: 'Z' }
        ],
        width: 600
      });

      const font = createFont(glyphMap, {
        familyName: 'AdjTest',
        glyphAdjustments: { 'A': { baseline: 50, bearingLeft: 30, bearingRight: 20 } }
      });

      // .notdef + space + A = 3
      expect(font.glyphs.length).toBe(3);
      const glyphA = font.glyphs.get(2);
      expect(glyphA.advanceWidth).toBe(650); // 600 + 30 + 20
      // First moveTo should be shifted: x 100+30=130, y 0+50=50
      const firstCmd = glyphA.path.commands[0];
      expect(firstCmd.x).toBe(130);
      expect(firstCmd.y).toBe(50);
    });

    it('should produce a valid TTF buffer', () => {
      const glyphMap = new Map();
      glyphMap.set('x', {
        commands: [
          { type: 'M', x: 0, y: 0 },
          { type: 'L', x: 400, y: 700 },
          { type: 'L', x: 400, y: 0 },
          { type: 'Z' }
        ],
        width: 500
      });

      const font = createFont(glyphMap);
      const buffer = font.toArrayBuffer();

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Parse it back
      const parsed = opentype.parse(buffer);
      expect(parsed.glyphs.length).toBeGreaterThanOrEqual(3); // .notdef + space + x
    });
  });
});
