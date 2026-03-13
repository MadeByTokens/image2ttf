#!/usr/bin/env node
/**
 * Generate a handwriting-style example image for image2ttf.
 *
 * Layout (5 rows, well-spaced, all rows fill similar width):
 *   Row 1: a b c d e f g h i j k l m
 *   Row 2: n o p q r s t u v w x y z
 *   Row 3: A B C D E F G H I J K L M
 *   Row 4: N O P Q R S T U V W X Y Z
 *   Row 5: @ ! 1 2 3 4 5 6 7 8 9 0 $ . , ' " - ( ) : ;
 *
 * Uses Comic Sans for a handwritten feel, with subtle random offsets
 * and a warm off-white lined-paper background.
 */

import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----- Layout config -----
const rows = [
  'abcdefghijklm'.split(''),
  'nopqrstuvwxyz'.split(''),
  'ABCDEFGHIJKLM'.split(''),
  'NOPQRSTUVWXYZ'.split(''),
  "@!1234567890$.,'\"-():;".split(''),
];

const fontSize = 32;
const cellH = 56;        // height per row (room for ascenders/descenders)
const marginX = 30;      // left margin
const marginTop = 28;    // top margin before first row
const rowGap = 12;       // extra gap between rows

// Content width that all rows share — each row adapts cell width to fill it
const contentW = 680;

// Seeded PRNG for reproducibility (simple LCG)
let seed = 42;
function rand() {
  seed = (seed * 1664525 + 1013904223) & 0xffffffff;
  return (seed >>> 0) / 0xffffffff;
}
function jitter(max) {
  return (rand() - 0.5) * 2 * max;
}

// ----- Canvas sizing -----
const canvasW = marginX * 2 + contentW;
const canvasH = marginTop + rows.length * (cellH + rowGap) + 16;

const canvas = createCanvas(canvasW, canvasH);
const ctx = canvas.getContext('2d');

// ----- Background: warm off-white -----
ctx.fillStyle = '#f5f0e8';
ctx.fillRect(0, 0, canvasW, canvasH);

// ----- Ruled lines (one per row, like notebook paper) -----
ctx.strokeStyle = '#d0ccc4';
ctx.lineWidth = 1;
for (let i = 0; i < rows.length; i++) {
  const y = marginTop + (i + 1) * (cellH + rowGap) - rowGap / 2 - 4;
  ctx.beginPath();
  ctx.moveTo(marginX - 10, y);
  ctx.lineTo(canvasW - marginX + 10, y);
  ctx.stroke();
}

// ----- Draw characters -----
ctx.fillStyle = '#1a1a2e';
ctx.textBaseline = 'alphabetic';

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  const cellW = contentW / row.length; // adapt per row
  const baselineY = marginTop + (r + 1) * (cellH + rowGap) - rowGap / 2 - 10;

  for (let c = 0; c < row.length; c++) {
    const ch = row[c];

    // Slight per-character variation in size, position, and rotation
    const size = fontSize + jitter(2);
    const dx = jitter(2);
    const dy = jitter(3);
    const angle = jitter(0.04); // radians

    ctx.save();
    const x = marginX + c * cellW + cellW / 2 + dx;
    const y = baselineY + dy;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `${size}px "Comic Sans MS"`;
    ctx.fillText(ch, -ctx.measureText(ch).width / 2, 0);
    ctx.restore();
  }
}

// ----- Write file -----
const outPath = resolve(__dirname, '..', 'public', 'font_test.png');
const buf = canvas.toBuffer('image/png');
writeFileSync(outPath, buf);
console.log(`Wrote ${buf.length} bytes → ${outPath}  (${canvasW}×${canvasH})`);
