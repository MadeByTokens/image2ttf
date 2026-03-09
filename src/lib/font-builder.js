import opentype from 'opentype.js';
import { EM_SQUARE, ASCENDER, DESCENDER } from './constants.js';
import { FontBuildError } from './errors.js';

/**
 * Apply per-glyph adjustments (baseline shift, left/right bearing) to path commands.
 * @param {Array} commands - opentype path commands
 * @param {number} width - original advance width
 * @param {{ baseline?: number, bearingLeft?: number, bearingRight?: number }} adjustments
 * @returns {{ commands: Array, width: number }}
 */
export function applyGlyphAdjustments(commands, width, adjustments) {
  if (!adjustments) return { commands, width };
  const { baseline = 0, bearingLeft = 0, bearingRight = 0 } = adjustments;
  if (baseline === 0 && bearingLeft === 0 && bearingRight === 0) {
    return { commands, width };
  }

  const newCommands = commands.map(cmd => {
    const c = { ...cmd };
    if ('x' in c) c.x += bearingLeft;
    if ('x1' in c) c.x1 += bearingLeft;
    if ('x2' in c) c.x2 += bearingLeft;
    if ('y' in c) c.y += baseline;
    if ('y1' in c) c.y1 += baseline;
    if ('y2' in c) c.y2 += baseline;
    return c;
  });

  return { commands: newCommands, width: Math.max(0, width + bearingLeft + bearingRight) };
}

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
    descender = DESCENDER,
    glyphAdjustments = {}
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

    const adj = glyphAdjustments[char];
    const { commands, width } = applyGlyphAdjustments(
      data.commands || [], data.width || unitsPerEm * 0.6, adj
    );
    const glyph = buildGlyph(char, commands, width);
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
 * Inject a GPOS table with kern feature into a font ArrayBuffer.
 * Browsers use GPOS (not kern) for CFF-based OpenType fonts (which opentype.js produces).
 * Builds a PairPosFormat1 subtable under a 'kern' feature.
 *
 * @param {ArrayBuffer} fontBuffer - the font binary from font.toArrayBuffer()
 * @param {Array<{left: number, right: number, value: number}>} pairs - glyph index pairs + kerning value
 * @returns {ArrayBuffer} new font binary with GPOS table
 */
export function injectGposTable(fontBuffer, pairs) {
  if (!pairs || pairs.length === 0) return fontBuffer;

  const src = new DataView(fontBuffer);
  const numTables = src.getUint16(4);
  const HEADER = 12;
  const REC = 16;

  // Check if GPOS table already exists
  for (let i = 0; i < numTables; i++) {
    const tag = src.getUint32(HEADER + i * REC);
    if (tag === 0x47504F53) return fontBuffer; // 'GPOS' already present
  }

  // Group pairs by left glyph, sort within groups by right glyph
  const grouped = new Map();
  for (const p of pairs) {
    if (!grouped.has(p.left)) grouped.set(p.left, []);
    grouped.get(p.left).push({ right: p.right, value: p.value });
  }
  const sortedLeftGlyphs = [...grouped.keys()].sort((a, b) => a - b);
  for (const [, list] of grouped) list.sort((a, b) => a.right - b.right);

  const N = sortedLeftGlyphs.length;

  // --- Calculate sizes ---
  // Fixed structure: GPOS header(10) + ScriptList(20) + FeatureList(14) + LookupList header(12) = 56
  const FIXED = 56;

  // PairPos subtable header: posFormat(2) + coverageOffset(2) + vf1(2) + vf2(2) + pairSetCount(2) + offsets(N*2)
  const subtableHeader = 10 + N * 2;

  // PairSets: for each left glyph, count(2) + pairs * (secondGlyph(2) + value(2))
  let totalPairSetBytes = 0;
  const pairSetSizes = [];
  for (const lg of sortedLeftGlyphs) {
    const sz = 2 + grouped.get(lg).length * 4;
    pairSetSizes.push(sz);
    totalPairSetBytes += sz;
  }

  // Coverage: format(2) + count(2) + glyphs(N*2)
  const coverageSize = 4 + N * 2;

  const gposLen = FIXED + subtableHeader + totalPairSetBytes + coverageSize;
  const gposPad = (gposLen + 3) & ~3;

  // --- Build GPOS binary ---
  const gposBuf = new ArrayBuffer(gposPad);
  const g = new DataView(gposBuf);
  let o = 0;

  // GPOS Header (offset 0)
  g.setUint16(o, 1); o += 2;     // majorVersion
  g.setUint16(o, 0); o += 2;     // minorVersion
  g.setUint16(o, 10); o += 2;    // scriptListOffset
  g.setUint16(o, 30); o += 2;    // featureListOffset
  g.setUint16(o, 44); o += 2;    // lookupListOffset

  // ScriptList (offset 10, 20 bytes)
  g.setUint16(o, 1); o += 2;                               // scriptCount
  g.setUint32(o, 0x44464C54); o += 4;                      // 'DFLT'
  g.setUint16(o, 8); o += 2;                               // scriptOffset (from ScriptList)
  // Script (offset 18)
  g.setUint16(o, 4); o += 2;                               // defaultLangSysOffset (from Script)
  g.setUint16(o, 0); o += 2;                               // langSysCount
  // DefaultLangSys (offset 22)
  g.setUint16(o, 0); o += 2;                               // lookupOrderOffset
  g.setUint16(o, 0xFFFF); o += 2;                          // requiredFeatureIndex
  g.setUint16(o, 1); o += 2;                               // featureIndexCount
  g.setUint16(o, 0); o += 2;                               // featureIndices[0]

  // FeatureList (offset 30, 14 bytes)
  g.setUint16(o, 1); o += 2;                               // featureCount
  g.setUint32(o, 0x6B65726E); o += 4;                      // 'kern'
  g.setUint16(o, 8); o += 2;                               // featureOffset (from FeatureList)
  // Feature (offset 38)
  g.setUint16(o, 0); o += 2;                               // featureParamsOffset
  g.setUint16(o, 1); o += 2;                               // lookupCount
  g.setUint16(o, 0); o += 2;                               // lookupListIndices[0]

  // LookupList (offset 44)
  g.setUint16(o, 1); o += 2;                               // lookupCount
  g.setUint16(o, 4); o += 2;                               // lookupOffsets[0] (from LookupList)
  // Lookup (offset 48)
  g.setUint16(o, 2); o += 2;                               // lookupType = PairPos
  g.setUint16(o, 0); o += 2;                               // lookupFlag
  g.setUint16(o, 1); o += 2;                               // subtableCount
  g.setUint16(o, 8); o += 2;                               // subtableOffsets[0] (from Lookup)

  // PairPosFormat1 (offset 56)
  const subtableStart = o;
  g.setUint16(o, 1); o += 2;                               // posFormat
  // coverageOffset — fill after we know where coverage lands
  const coverageOffsetPos = o;
  o += 2;                                                    // placeholder for coverageOffset
  g.setUint16(o, 0x0004); o += 2;                          // valueFormat1 = XAdvance
  g.setUint16(o, 0x0000); o += 2;                          // valueFormat2 = none
  g.setUint16(o, N); o += 2;                               // pairSetCount

  // PairSet offsets (from subtable start)
  let pairSetOffset = subtableHeader; // first PairSet after header
  for (let i = 0; i < N; i++) {
    g.setUint16(o, pairSetOffset); o += 2;
    pairSetOffset += pairSetSizes[i];
  }

  // PairSets
  for (let i = 0; i < N; i++) {
    const pairList = grouped.get(sortedLeftGlyphs[i]);
    g.setUint16(o, pairList.length); o += 2;               // pairValueCount
    for (const p of pairList) {
      g.setUint16(o, p.right); o += 2;                     // secondGlyph
      g.setInt16(o, p.value); o += 2;                      // value1 (XAdvance)
    }
  }

  // Coverage table (format 1)
  const coverageStart = o - subtableStart;
  g.setUint16(coverageOffsetPos, coverageStart);            // patch coverageOffset
  g.setUint16(o, 1); o += 2;                               // coverageFormat
  g.setUint16(o, N); o += 2;                               // glyphCount
  for (const lg of sortedLeftGlyphs) {
    g.setUint16(o, lg); o += 2;                             // glyphArray
  }

  // Checksum
  let checksum = 0;
  for (let i = 0; i < gposPad; i += 4) {
    checksum = (checksum + g.getUint32(i)) >>> 0;
  }

  // Splice GPOS into SFNT (same pattern as injectKernTable)
  const newNum = numTables + 1;
  const oldRecEnd = HEADER + numTables * REC;
  const newRecEnd = HEADER + newNum * REC;
  const newSize = fontBuffer.byteLength + REC + gposPad;
  const dst = new ArrayBuffer(newSize);
  const dv = new DataView(dst);
  const dstArr = new Uint8Array(dst);
  const srcArr = new Uint8Array(fontBuffer);

  dv.setUint32(0, src.getUint32(0));
  dv.setUint16(4, newNum);
  const tp2 = Math.pow(2, Math.floor(Math.log2(newNum)));
  dv.setUint16(6, tp2 * 16);
  dv.setUint16(8, Math.floor(Math.log2(tp2)));
  dv.setUint16(10, newNum * 16 - tp2 * 16);

  for (let i = 0; i < numTables; i++) {
    const s = HEADER + i * REC;
    dv.setUint32(s, src.getUint32(s));
    dv.setUint32(s + 4, src.getUint32(s + 4));
    dv.setUint32(s + 8, src.getUint32(s + 8) + REC);
    dv.setUint32(s + 12, src.getUint32(s + 12));
  }

  const gposRecOff = HEADER + numTables * REC;
  const gposDataOff = fontBuffer.byteLength + REC;
  dv.setUint32(gposRecOff, 0x47504F53);      // 'GPOS'
  dv.setUint32(gposRecOff + 4, checksum);
  dv.setUint32(gposRecOff + 8, gposDataOff);
  dv.setUint32(gposRecOff + 12, gposLen);

  dstArr.set(srcArr.subarray(oldRecEnd), newRecEnd);
  dstArr.set(new Uint8Array(gposBuf), gposDataOff);

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

  // Inject kerning tables if pairs provided
  if (kerningMap && Object.keys(kerningMap).length > 0) {
    const pairs = buildKernPairs(font, kerningMap);
    if (pairs.length > 0) {
      buffer = injectGposTable(buffer, pairs);
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
