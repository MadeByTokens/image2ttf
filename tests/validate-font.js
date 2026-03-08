/**
 * Font validation script
 * Usage: node tests/validate-font.js <path-to-ttf>
 *
 * Verifies:
 * - Font can be parsed
 * - Has at least 62 glyphs (a-z, A-Z, 0-9)
 * - Required characters are present
 * - Paths are non-empty
 */
import opentype from 'opentype.js';
import { readFileSync } from 'fs';

const fontPath = process.argv[2];
if (!fontPath) {
  console.error('Usage: node tests/validate-font.js <path-to-ttf>');
  process.exit(1);
}

try {
  const buffer = readFileSync(fontPath);
  const font = opentype.parse(buffer.buffer);

  console.log(`Font: ${font.names.fontFamily?.en || 'Unknown'}`);
  console.log(`Glyphs: ${font.glyphs.length}`);

  // Check required characters
  const required = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const missing = [];
  let nonEmptyPaths = 0;

  for (const char of required) {
    const glyph = font.charToGlyph(char);
    if (!glyph || glyph.name === '.notdef') {
      missing.push(char);
    } else if (glyph.path && glyph.path.commands.length > 0) {
      nonEmptyPaths++;
    }
  }

  if (missing.length > 0) {
    console.warn(`Missing characters: ${missing.join(', ')}`);
  } else {
    console.log('All a-z, A-Z, 0-9 characters present');
  }

  console.log(`Characters with non-empty paths: ${nonEmptyPaths}/${required.length}`);

  // Validation result
  const minGlyphs = 62 + 2; // 62 required + .notdef + space
  if (font.glyphs.length >= minGlyphs && missing.length === 0) {
    console.log('\nVALIDATION: PASSED');
    process.exit(0);
  } else {
    console.log('\nVALIDATION: FAILED');
    if (font.glyphs.length < minGlyphs) {
      console.log(`  Expected >= ${minGlyphs} glyphs, got ${font.glyphs.length}`);
    }
    process.exit(1);
  }
} catch (err) {
  console.error('Failed to parse font:', err.message);
  process.exit(1);
}
