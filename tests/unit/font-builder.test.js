import { describe, it, expect } from 'vitest';
import { buildGlyph, createFont } from '../../src/lib/font-builder.js';
import opentype from 'opentype.js';

describe('font-builder', () => {
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
