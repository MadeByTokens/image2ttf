import opentype from 'opentype.js';
import { EM_SQUARE, ASCENDER, DESCENDER } from './constants.js';
import { FontBuildError } from './errors.js';

/**
 * Build a single opentype.Glyph from path commands
 */
export function buildGlyph(char, pathCommands, advanceWidth = EM_SQUARE * 0.6) {
  const path = new opentype.Path();

  for (const cmd of pathCommands) {
    switch (cmd.type) {
      case 'M':
        path.moveTo(cmd.x, cmd.y);
        break;
      case 'L':
        path.lineTo(cmd.x, cmd.y);
        break;
      case 'Q':
        path.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
        break;
      case 'C':
        path.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        break;
      case 'Z':
        path.closePath();
        break;
    }
  }

  return new opentype.Glyph({
    name: char === ' ' ? 'space' : char,
    unicode: char.charCodeAt(0),
    advanceWidth,
    path
  });
}

/**
 * Create a complete TTF font from a glyph map
 * @param {Map<string, {commands: Array, width: number}>} glyphMap - char -> path data
 * @param {object} options - font metadata
 */
export function createFont(glyphMap, options = {}) {
  try {
    return _createFontInner(glyphMap, options);
  } catch (err) {
    if (err instanceof FontBuildError) throw err;
    throw new FontBuildError(err.message || 'Unknown font build error');
  }
}

function _createFontInner(glyphMap, options = {}) {
  const {
    familyName = 'MyHandwriting',
    styleName = 'Regular',
    unitsPerEm = EM_SQUARE,
    ascender = ASCENDER,
    descender = DESCENDER
  } = options;

  // .notdef glyph (required)
  // Outer contour: CW in Y-up (TrueType convention for filled regions)
  const notdefPath = new opentype.Path();
  notdefPath.moveTo(100, 0);
  notdefPath.lineTo(500, 0);
  notdefPath.lineTo(500, 700);
  notdefPath.lineTo(100, 700);
  notdefPath.closePath();
  // Inner cutout: CCW in Y-up (TrueType convention for holes)
  notdefPath.moveTo(150, 50);
  notdefPath.lineTo(150, 650);
  notdefPath.lineTo(450, 650);
  notdefPath.lineTo(450, 50);
  notdefPath.closePath();

  const notdefGlyph = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 650,
    path: notdefPath
  });

  // Space glyph — use width from glyphMap if available (computed from lowercase avg)
  const spaceData = glyphMap.get(' ');
  const spaceGlyph = new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: spaceData?.width || unitsPerEm * 0.3,
    path: new opentype.Path()
  });

  // Build all glyphs from the map
  const glyphs = [notdefGlyph, spaceGlyph];
  const seenUnicodes = new Set([0, 32]);

  for (const [char, data] of glyphMap) {
    const unicode = char.charCodeAt(0);
    if (seenUnicodes.has(unicode)) continue;
    seenUnicodes.add(unicode);

    const glyph = buildGlyph(
      char,
      data.commands || [],
      data.width || unitsPerEm * 0.6
    );
    glyphs.push(glyph);
  }

  const font = new opentype.Font({
    familyName,
    styleName,
    unitsPerEm,
    ascender,
    descender,
    glyphs
  });

  return font;
}

/**
 * Inject a kern table into a TTF ArrayBuffer.
 * opentype.js doesn't support writing kern tables, so we manually build
 * the binary kern table and splice it into the SFNT structure.
 *
 * @param {ArrayBuffer} fontBuffer - the TTF binary from font.toArrayBuffer()
 * @param {Array<{left: number, right: number, value: number}>} pairs - glyph index pairs + kerning value
 * @returns {ArrayBuffer} new TTF binary with kern table
 */
export function injectKernTable(fontBuffer, pairs) {
  if (!pairs || pairs.length === 0) return fontBuffer;

  const src = new DataView(fontBuffer);
  const numTables = src.getUint16(4);
  const HEADER = 12;
  const REC = 16;

  // Check if kern table already exists
  for (let i = 0; i < numTables; i++) {
    const tag = src.getUint32(HEADER + i * REC);
    if (tag === 0x6B65726E) return fontBuffer; // 'kern' already present
  }

  // Sort pairs by (left << 16) | right
  const sorted = [...pairs].sort((a, b) =>
    ((a.left << 16) | a.right) - ((b.left << 16) | b.right)
  );
  const n = sorted.length;

  // Build kern table: header(4) + subtable header(10) + pairs(6*n)
  const subtableLen = 14 + n * 6;
  const kernLen = 4 + subtableLen;
  const kernPad = (kernLen + 3) & ~3;
  const kernBuf = new ArrayBuffer(kernPad);
  const kv = new DataView(kernBuf);
  let o = 0;
  kv.setUint16(o, 0); o += 2;           // version
  kv.setUint16(o, 1); o += 2;           // nTables
  kv.setUint16(o, 0); o += 2;           // subtable version
  kv.setUint16(o, subtableLen); o += 2;  // subtable length
  kv.setUint16(o, 0x0001); o += 2;      // coverage: horizontal
  kv.setUint16(o, n); o += 2;           // nPairs
  const p2 = n > 0 ? Math.pow(2, Math.floor(Math.log2(n))) : 0;
  kv.setUint16(o, p2 * 6); o += 2;      // searchRange
  kv.setUint16(o, p2 > 0 ? Math.floor(Math.log2(p2)) : 0); o += 2; // entrySelector
  kv.setUint16(o, n * 6 - p2 * 6); o += 2; // rangeShift
  for (const pair of sorted) {
    kv.setUint16(o, pair.left); o += 2;
    kv.setUint16(o, pair.right); o += 2;
    kv.setInt16(o, pair.value); o += 2;
  }

  // Checksum for kern table
  let checksum = 0;
  for (let i = 0; i < kernPad; i += 4) {
    checksum = (checksum + kv.getUint32(i)) >>> 0;
  }

  // Build new buffer: insert one 16-byte record, shift table data, append kern
  const newNum = numTables + 1;
  const oldRecEnd = HEADER + numTables * REC;
  const newRecEnd = HEADER + newNum * REC;
  const newSize = fontBuffer.byteLength + REC + kernPad;
  const dst = new ArrayBuffer(newSize);
  const dv = new DataView(dst);
  const dstArr = new Uint8Array(dst);
  const srcArr = new Uint8Array(fontBuffer);

  // Header
  dv.setUint32(0, src.getUint32(0)); // sfVersion
  dv.setUint16(4, newNum);
  const tp2 = Math.pow(2, Math.floor(Math.log2(newNum)));
  dv.setUint16(6, tp2 * 16);
  dv.setUint16(8, Math.floor(Math.log2(tp2)));
  dv.setUint16(10, newNum * 16 - tp2 * 16);

  // Copy existing records, shifting offsets by 16
  for (let i = 0; i < numTables; i++) {
    const s = HEADER + i * REC;
    const d = HEADER + i * REC;
    dv.setUint32(d, src.getUint32(s));       // tag
    dv.setUint32(d + 4, src.getUint32(s + 4)); // checksum
    dv.setUint32(d + 8, src.getUint32(s + 8) + REC); // offset + 16
    dv.setUint32(d + 12, src.getUint32(s + 12)); // length
  }

  // Kern record at end of directory
  const kernRecOff = HEADER + numTables * REC;
  const kernDataOff = fontBuffer.byteLength + REC;
  dv.setUint32(kernRecOff, 0x6B65726E);     // 'kern'
  dv.setUint32(kernRecOff + 4, checksum);
  dv.setUint32(kernRecOff + 8, kernDataOff);
  dv.setUint32(kernRecOff + 12, kernLen);

  // Copy existing table data (shifted by 16 to account for new record)
  dstArr.set(srcArr.subarray(oldRecEnd), newRecEnd);

  // Append kern data
  dstArr.set(new Uint8Array(kernBuf), kernDataOff);

  return dst;
}

/**
 * Build kerning pairs array from a char-pair map for kern table injection.
 * @param {opentype.Font} font - the font object (for charToGlyphIndex)
 * @param {Object} kerningMap - e.g. { "AV": -80, "To": -40 }
 * @returns {Array<{left: number, right: number, value: number}>}
 */
export function buildKernPairs(font, kerningMap) {
  const pairs = [];
  for (const [pairStr, value] of Object.entries(kerningMap)) {
    if (pairStr.length !== 2 || value === 0) continue;
    const left = font.charToGlyphIndex(pairStr[0]);
    const right = font.charToGlyphIndex(pairStr[1]);
    if (left > 0 && right > 0) {
      pairs.push({ left, right, value: Math.round(value) });
    }
  }
  return pairs;
}

/**
 * Trigger download of the font as a TTF file
 */
export function downloadFont(font, filename = 'handwriting.ttf', kerningMap = null) {
  let buffer = font.toArrayBuffer();

  // Inject kern table if kerning pairs provided
  if (kerningMap && Object.keys(kerningMap).length > 0) {
    const pairs = buildKernPairs(font, kerningMap);
    if (pairs.length > 0) {
      buffer = injectKernTable(buffer, pairs);
    }
  }

  if (typeof window !== 'undefined') {
    const blob = new Blob([buffer], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return buffer;
}
