import opentype from 'opentype.js';
import { EM_SQUARE, ASCENDER, DESCENDER } from './constants.js';

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
  const {
    familyName = 'MyHandwriting',
    styleName = 'Regular',
    unitsPerEm = EM_SQUARE,
    ascender = ASCENDER,
    descender = DESCENDER
  } = options;

  // .notdef glyph (required)
  const notdefPath = new opentype.Path();
  notdefPath.moveTo(100, 0);
  notdefPath.lineTo(100, 700);
  notdefPath.lineTo(500, 700);
  notdefPath.lineTo(500, 0);
  notdefPath.closePath();
  // Inner cutout
  notdefPath.moveTo(150, 50);
  notdefPath.lineTo(450, 50);
  notdefPath.lineTo(450, 650);
  notdefPath.lineTo(150, 650);
  notdefPath.closePath();

  const notdefGlyph = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: 650,
    path: notdefPath
  });

  // Space glyph
  const spaceGlyph = new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: unitsPerEm * 0.3,
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
 * Trigger download of the font as a TTF file
 */
export function downloadFont(font, filename = 'handwriting.ttf') {
  const buffer = font.toArrayBuffer();

  if (typeof window !== 'undefined') {
    const blob = new Blob([buffer], { type: 'font/ttf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Delay revocation so the browser can start the download
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return buffer;
}
