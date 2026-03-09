import { describe, it, expect } from 'vitest';
import { createFont, injectKernTable, injectGposTable, buildKernPairs } from '../../src/lib/font-builder.js';
import opentype from 'opentype.js';

/** Create a minimal font with a few glyphs for kern testing */
function makeTestFont(chars = 'AV') {
  const glyphMap = new Map();
  const squarePath = [
    { type: 'M', x: 100, y: 0 },
    { type: 'L', x: 500, y: 0 },
    { type: 'L', x: 500, y: 700 },
    { type: 'L', x: 100, y: 700 },
    { type: 'Z' }
  ];
  for (const ch of chars) {
    glyphMap.set(ch, { commands: squarePath, width: 600 });
  }
  glyphMap.set(' ', { commands: [], width: 300 });
  return createFont(glyphMap, { familyName: 'KernTest' });
}

describe('font-builder kern', () => {
  describe('injectKernTable', () => {
    it('should return original buffer when pairs is empty', () => {
      const font = makeTestFont();
      const buf = font.toArrayBuffer();
      const result = injectKernTable(buf, []);
      expect(result).toBe(buf);
    });

    it('should return original buffer when pairs is null', () => {
      const font = makeTestFont();
      const buf = font.toArrayBuffer();
      const result = injectKernTable(buf, null);
      expect(result).toBe(buf);
    });

    it('should inject a single kern pair and parse it back', () => {
      const font = makeTestFont('AV');
      const buf = font.toArrayBuffer();

      const leftIdx = font.charToGlyphIndex('A');
      const rightIdx = font.charToGlyphIndex('V');
      expect(leftIdx).toBeGreaterThan(0);
      expect(rightIdx).toBeGreaterThan(0);

      const pairs = [{ left: leftIdx, right: rightIdx, value: -80 }];
      const newBuf = injectKernTable(buf, pairs);

      expect(newBuf.byteLength).toBeGreaterThan(buf.byteLength);

      // Parse back and check kerning value
      const parsed = opentype.parse(newBuf);
      const kernValue = parsed.getKerningValue(leftIdx, rightIdx);
      expect(kernValue).toBe(-80);
    });

    it('should handle multiple pairs and round-trip correctly', () => {
      const font = makeTestFont('AVTO');
      const buf = font.toArrayBuffer();

      const pairs = [
        { left: font.charToGlyphIndex('A'), right: font.charToGlyphIndex('V'), value: -80 },
        { left: font.charToGlyphIndex('T'), right: font.charToGlyphIndex('O'), value: -40 },
        { left: font.charToGlyphIndex('A'), right: font.charToGlyphIndex('T'), value: -60 },
      ];
      const newBuf = injectKernTable(buf, pairs);
      const parsed = opentype.parse(newBuf);

      expect(parsed.getKerningValue(
        font.charToGlyphIndex('A'), font.charToGlyphIndex('V')
      )).toBe(-80);
      expect(parsed.getKerningValue(
        font.charToGlyphIndex('T'), font.charToGlyphIndex('O')
      )).toBe(-40);
      expect(parsed.getKerningValue(
        font.charToGlyphIndex('A'), font.charToGlyphIndex('T')
      )).toBe(-60);
    });

    it('should sort pairs by (left << 16) | right', () => {
      const font = makeTestFont('AVTO');
      const buf = font.toArrayBuffer();

      // Provide pairs in unsorted order
      const aIdx = font.charToGlyphIndex('A');
      const vIdx = font.charToGlyphIndex('V');
      const tIdx = font.charToGlyphIndex('T');
      const oIdx = font.charToGlyphIndex('O');

      const pairs = [
        { left: tIdx, right: oIdx, value: -40 },
        { left: aIdx, right: vIdx, value: -80 },
        { left: aIdx, right: tIdx, value: -60 },
      ];
      const newBuf = injectKernTable(buf, pairs);

      // Should still parse correctly (internal sorting doesn't affect API)
      const parsed = opentype.parse(newBuf);
      expect(parsed.getKerningValue(aIdx, vIdx)).toBe(-80);
      expect(parsed.getKerningValue(tIdx, oIdx)).toBe(-40);
    });

    it('should not inject a second kern table if one already exists', () => {
      const font = makeTestFont('AV');
      const buf = font.toArrayBuffer();
      const pairs = [{ left: font.charToGlyphIndex('A'), right: font.charToGlyphIndex('V'), value: -80 }];

      const first = injectKernTable(buf, pairs);
      const second = injectKernTable(first, pairs);
      // Should return the same buffer since kern already exists
      expect(second).toBe(first);
    });
  });

  describe('injectGposTable', () => {
    it('should return original buffer when pairs is empty', () => {
      const font = makeTestFont();
      const buf = font.toArrayBuffer();
      expect(injectGposTable(buf, [])).toBe(buf);
      expect(injectGposTable(buf, null)).toBe(buf);
    });

    it('should inject GPOS table and produce a larger buffer', () => {
      const font = makeTestFont('AV');
      const buf = font.toArrayBuffer();
      const leftIdx = font.charToGlyphIndex('A');
      const rightIdx = font.charToGlyphIndex('V');
      const pairs = [{ left: leftIdx, right: rightIdx, value: -80 }];
      const newBuf = injectGposTable(buf, pairs);

      expect(newBuf.byteLength).toBeGreaterThan(buf.byteLength);

      // Verify GPOS table tag exists in new buffer
      const dv = new DataView(newBuf);
      const numTables = dv.getUint16(4);
      let hasGpos = false;
      for (let i = 0; i < numTables; i++) {
        if (dv.getUint32(12 + i * 16) === 0x47504F53) hasGpos = true;
      }
      expect(hasGpos).toBe(true);
    });

    it('should produce a parseable font with kerning via GPOS', () => {
      const font = makeTestFont('AV');
      const buf = font.toArrayBuffer();
      const leftIdx = font.charToGlyphIndex('A');
      const rightIdx = font.charToGlyphIndex('V');
      const pairs = [{ left: leftIdx, right: rightIdx, value: -80 }];
      const newBuf = injectGposTable(buf, pairs);

      // opentype.js should be able to parse it and read kerning from GPOS
      const parsed = opentype.parse(newBuf);
      const kernValue = parsed.getKerningValue(leftIdx, rightIdx);
      expect(kernValue).toBe(-80);
    });

    it('should handle multiple pairs across different left glyphs', () => {
      const font = makeTestFont('AVTO');
      const buf = font.toArrayBuffer();
      const pairs = [
        { left: font.charToGlyphIndex('A'), right: font.charToGlyphIndex('V'), value: -80 },
        { left: font.charToGlyphIndex('T'), right: font.charToGlyphIndex('O'), value: -40 },
        { left: font.charToGlyphIndex('A'), right: font.charToGlyphIndex('T'), value: -60 },
      ];
      const newBuf = injectGposTable(buf, pairs);
      const parsed = opentype.parse(newBuf);

      expect(parsed.getKerningValue(
        font.charToGlyphIndex('A'), font.charToGlyphIndex('V')
      )).toBe(-80);
      expect(parsed.getKerningValue(
        font.charToGlyphIndex('T'), font.charToGlyphIndex('O')
      )).toBe(-40);
      expect(parsed.getKerningValue(
        font.charToGlyphIndex('A'), font.charToGlyphIndex('T')
      )).toBe(-60);
    });

    it('should not inject a second GPOS table if one exists', () => {
      const font = makeTestFont('AV');
      const buf = font.toArrayBuffer();
      const pairs = [{ left: font.charToGlyphIndex('A'), right: font.charToGlyphIndex('V'), value: -80 }];
      const first = injectGposTable(buf, pairs);
      const second = injectGposTable(first, pairs);
      expect(second).toBe(first);
    });
  });

  describe('buildKernPairs', () => {
    it('should map char pairs to correct glyph indices', () => {
      const font = makeTestFont('AV');
      const pairs = buildKernPairs(font, { 'AV': -80 });

      expect(pairs.length).toBe(1);
      expect(pairs[0].left).toBe(font.charToGlyphIndex('A'));
      expect(pairs[0].right).toBe(font.charToGlyphIndex('V'));
      expect(pairs[0].value).toBe(-80);
    });

    it('should exclude zero-value pairs', () => {
      const font = makeTestFont('AV');
      const pairs = buildKernPairs(font, { 'AV': 0 });
      expect(pairs.length).toBe(0);
    });

    it('should exclude pairs with unknown characters', () => {
      const font = makeTestFont('AV');
      const pairs = buildKernPairs(font, { 'XY': -50 });
      expect(pairs.length).toBe(0);
    });

    it('should handle multiple pairs', () => {
      const font = makeTestFont('AVTO');
      const pairs = buildKernPairs(font, { 'AV': -80, 'TO': -40 });

      expect(pairs.length).toBe(2);
      // Verify values match
      const avPair = pairs.find(p => p.left === font.charToGlyphIndex('A'));
      const toPair = pairs.find(p => p.left === font.charToGlyphIndex('T'));
      expect(avPair.value).toBe(-80);
      expect(toPair.value).toBe(-40);
    });
  });
});
