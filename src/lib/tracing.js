import ImageTracer from 'imagetracerjs';
import { EM_SQUARE } from './constants.js';

/**
 * Map a smoothness value (1-10) to imagetracerjs tracing options.
 * 1 = precise/detailed (many short segments), 10 = very smooth (fewer, longer curves)
 *
 * For B&W handwriting, smoothness comes from HIGHER ltres/qtres values
 * (more tolerance = fewer path nodes = smoother curves). Blur is always off
 * because blurring B&W images creates stairstepping artifacts after requantization.
 */
export function smoothnessToOpts(smoothness = 5) {
  const s = Math.max(1, Math.min(10, smoothness));
  const t = (s - 1) / 9; // 0..1
  // ltres: 0.5 → 5.0 (higher = more aggressive line simplification = smoother)
  const ltres = Math.round((0.5 + t * 4.5) * 1000) / 1000;
  // qtres: 0.5 → 3.0 (higher = more tolerance in curve fitting = smoother)
  const qtres = Math.round((0.5 + t * 2.5) * 1000) / 1000;
  return {
    ltres,
    qtres,
    rightangleenhance: s < 4,
    blurradius: 0, // never blur B&W — causes stairstepping artifacts
    pathomit: Math.round(2 + t * 6), // 2 → 8 (higher smoothness = remove more small noise)
  };
}

/**
 * Trace a black-and-white ImageData into SVG path strings
 * Returns an array of SVG path data strings (d attributes)
 */
export function traceGlyph(imageData, options = {}) {
  const defaultOptions = {
    // Tracing parameters tuned for handwriting
    ltres: 1,        // line threshold
    qtres: 1,        // quadratic spline threshold
    pathomit: 4,     // ignore paths shorter than this
    colorsampling: 0, // disable color sampling (B&W)
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    blurradius: 0,
    blurdelta: 20,
    strokewidth: 0,
    scale: 1,
    roundcoords: 2,
    ...options
  };

  // imagetracerjs expects an ImageData-like object
  const svgString = ImageTracer.imagedataToSVG(imageData, defaultOptions);

  // Parse paths with their fill colors — only keep dark-filled paths
  const paths = [];
  const pathRegex = /fill="rgb\((\d+),(\d+),(\d+)\)"[^>]*\bd="([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(svgString)) !== null) {
    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);
    const d = match[4].trim();

    // Only keep dark-colored paths (the actual character ink)
    // Skip white/light paths (background negative space)
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    if (brightness < 128 && d && d !== 'M 0 0') {
      paths.push(d);
    }
  }

  return paths;
}

/**
 * Parse an SVG path d attribute into an array of commands
 */
function parseSVGPath(d) {
  const commands = [];
  const regex = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
  let match;

  while ((match = regex.exec(d)) !== null) {
    const type = match[1];
    const argsStr = match[2].trim();
    const args = argsStr ? argsStr.split(/[\s,]+/).map(Number) : [];
    commands.push({ type, args });
  }

  return commands;
}

/**
 * Convert SVG path data to opentype.js Path commands
 * Scales and flips Y axis to match font coordinate system
 *
 * @param {string|string[]} svgPathData - SVG path d-attribute(s)
 * @param {number} sourceWidth - width of the (trimmed) glyph image
 * @param {number} sourceHeight - height of the (trimmed) glyph image
 * @param {number} emSquare - em square size
 * @param {object} [metrics] - optional cell metrics for uniform scaling
 * @param {number} [metrics.cellHeight] - original cell height (row height) for uniform scale
 * @param {number} [metrics.trimOffsetY] - Y offset of trimmed region within the cell
 * @param {number} [metrics.baselineInCell] - baseline position in pixels from cell top
 */
export function svgPathToOpentypePath(svgPathData, sourceWidth, sourceHeight, emSquare = EM_SQUARE, metrics = {}) {
  const { cellHeight, trimOffsetY = 0, baselineInCell } = metrics;
  const commands = [];

  // When cellHeight is provided, scale uniformly based on cell height
  // so all characters in a row preserve their relative sizes
  const refSize = cellHeight || Math.max(sourceWidth, sourceHeight);
  const scale = emSquare / refSize;

  // Left-align with small side bearing (not centered — centering creates
  // huge LSB for narrow glyphs like 'l', causing spacing issues)
  const sideBearing = emSquare * 0.05;
  const offsetX = sideBearing;

  // Baseline-relative vertical positioning.
  // baselineInCell: pixels from cell top to baseline (default: 75% of refSize).
  // All cells align at fontBaselineY regardless of cell height.
  const blInCell = baselineInCell ?? (refSize * 0.75);
  const fontBaselineY = emSquare * 0.10;

  function tx(x) { return Math.round((x * scale + offsetX) * 100) / 100; }
  function ty(y) {
    const cellY = trimOffsetY + y;
    const distFromBaseline = cellY - blInCell;
    return Math.round((fontBaselineY - distFromBaseline * scale) * 100) / 100;
  }

  let curX = 0, curY = 0;

  for (const pathD of (Array.isArray(svgPathData) ? svgPathData : [svgPathData])) {
    const parsed = parseSVGPath(pathD);

    for (const cmd of parsed) {
      const { type, args } = cmd;

      switch (type) {
        case 'M':
          for (let i = 0; i < args.length; i += 2) {
            curX = args[i]; curY = args[i + 1];
            if (i === 0) {
              commands.push({ type: 'M', x: tx(curX), y: ty(curY) });
            } else {
              commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
            }
          }
          break;

        case 'm':
          for (let i = 0; i < args.length; i += 2) {
            curX += args[i]; curY += args[i + 1];
            if (i === 0) {
              commands.push({ type: 'M', x: tx(curX), y: ty(curY) });
            } else {
              commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
            }
          }
          break;

        case 'L':
          for (let i = 0; i < args.length; i += 2) {
            curX = args[i]; curY = args[i + 1];
            commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
          }
          break;

        case 'l':
          for (let i = 0; i < args.length; i += 2) {
            curX += args[i]; curY += args[i + 1];
            commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
          }
          break;

        case 'H':
          curX = args[0];
          commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
          break;

        case 'h':
          curX += args[0];
          commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
          break;

        case 'V':
          curY = args[0];
          commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
          break;

        case 'v':
          curY += args[0];
          commands.push({ type: 'L', x: tx(curX), y: ty(curY) });
          break;

        case 'Q':
          for (let i = 0; i < args.length; i += 4) {
            const cx = args[i], cy = args[i + 1];
            curX = args[i + 2]; curY = args[i + 3];
            commands.push({
              type: 'Q',
              x1: tx(cx), y1: ty(cy),
              x: tx(curX), y: ty(curY)
            });
          }
          break;

        case 'q':
          for (let i = 0; i < args.length; i += 4) {
            const cx = curX + args[i], cy = curY + args[i + 1];
            curX += args[i + 2]; curY += args[i + 3];
            commands.push({
              type: 'Q',
              x1: tx(cx), y1: ty(cy),
              x: tx(curX), y: ty(curY)
            });
          }
          break;

        case 'C':
          for (let i = 0; i < args.length; i += 6) {
            const c1x = args[i], c1y = args[i + 1];
            const c2x = args[i + 2], c2y = args[i + 3];
            curX = args[i + 4]; curY = args[i + 5];
            commands.push({
              type: 'C',
              x1: tx(c1x), y1: ty(c1y),
              x2: tx(c2x), y2: ty(c2y),
              x: tx(curX), y: ty(curY)
            });
          }
          break;

        case 'c':
          for (let i = 0; i < args.length; i += 6) {
            const c1x = curX + args[i], c1y = curY + args[i + 1];
            const c2x = curX + args[i + 2], c2y = curY + args[i + 3];
            curX += args[i + 4]; curY += args[i + 5];
            commands.push({
              type: 'C',
              x1: tx(c1x), y1: ty(c1y),
              x2: tx(c2x), y2: ty(c2y),
              x: tx(curX), y: ty(curY)
            });
          }
          break;

        case 'Z':
        case 'z':
          commands.push({ type: 'Z' });
          break;
      }
    }
  }

  // Fix winding direction — TTF needs clockwise outer contours
  return fixWinding(commands);
}

/**
 * Calculate signed area of a path to determine winding direction
 */
function signedArea(commands) {
  let area = 0;
  let startX = 0, startY = 0;
  let prevX = 0, prevY = 0;

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        startX = cmd.x; startY = cmd.y;
        prevX = cmd.x; prevY = cmd.y;
        break;
      case 'L':
        area += (prevX - cmd.x) * (prevY + cmd.y);
        prevX = cmd.x; prevY = cmd.y;
        break;
      case 'Q':
        // Approximate with line for area calculation
        area += (prevX - cmd.x) * (prevY + cmd.y);
        prevX = cmd.x; prevY = cmd.y;
        break;
      case 'C':
        area += (prevX - cmd.x) * (prevY + cmd.y);
        prevX = cmd.x; prevY = cmd.y;
        break;
      case 'Z':
        area += (prevX - startX) * (prevY + startY);
        prevX = startX; prevY = startY;
        break;
    }
  }
  return area / 2;
}

/**
 * Ray-casting point-in-polygon test
 */
function pointInContour(px, py, contour) {
  let inside = false;
  let prevX = 0, prevY = 0, startX = 0, startY = 0;

  for (const cmd of contour) {
    if (cmd.type === 'M') {
      startX = cmd.x; startY = cmd.y;
      prevX = cmd.x; prevY = cmd.y;
      continue;
    }

    let testX, testY;
    if (cmd.type === 'Z') {
      testX = startX; testY = startY;
    } else {
      testX = cmd.x; testY = cmd.y;
    }

    if ((prevY > py) !== (testY > py)) {
      const ix = prevX + (py - prevY) / (testY - prevY) * (testX - prevX);
      if (px < ix) inside = !inside;
    }

    if (cmd.type !== 'Z') { prevX = testX; prevY = testY; }
    else { prevX = startX; prevY = startY; }
  }
  return inside;
}

/**
 * Split commands into individual contours and fix winding direction
 *
 * TrueType convention (Y-up coordinate system):
 *   - Outer contours: clockwise → signedArea < 0 (trapezoidal formula)
 *   - Inner contours (holes): counter-clockwise → signedArea > 0
 *
 * Uses point-in-polygon containment to handle glyphs with multiple
 * disconnected ink regions (i, j, !, :, %, etc.)
 */
function fixWinding(commands) {
  const contours = [];
  let current = [];

  for (const cmd of commands) {
    current.push(cmd);
    if (cmd.type === 'Z') {
      contours.push(current);
      current = [];
    }
  }
  if (current.length > 0) contours.push(current);
  if (contours.length === 0) return commands;

  // Compute area for each contour, sort by absolute area descending
  const contourData = contours.map(c => ({ contour: c, area: signedArea(c) }));
  contourData.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  // Determine nesting depth via point-in-polygon containment
  // Even depth = outer (CW, area < 0), odd depth = hole (CCW, area > 0)
  const fixed = [];
  for (let i = 0; i < contourData.length; i++) {
    const { contour, area } = contourData[i];
    const firstPt = contour.find(c => c.type === 'M');
    if (!firstPt) { fixed.push(...contour); continue; }

    // Count how many larger contours contain this one
    let depth = 0;
    for (let j = 0; j < i; j++) {
      if (pointInContour(firstPt.x, firstPt.y, contourData[j].contour)) {
        depth++;
      }
    }

    const shouldBeCW = depth % 2 === 0; // outer = CW (area < 0)
    const isCW = area < 0;

    if (shouldBeCW !== isCW) {
      fixed.push(...reverseContour(contour));
    } else {
      fixed.push(...contour);
    }
  }

  return fixed;
}

/**
 * Reverse a contour's direction
 */
function reverseContour(commands) {
  if (commands.length === 0) return commands;

  // Extract points in order
  const points = [];
  for (const cmd of commands) {
    if (cmd.type !== 'Z') {
      points.push(cmd);
    }
  }

  if (points.length === 0) return commands;

  // Rebuild in reverse
  const reversed = [];
  reversed.push({ type: 'M', x: points[points.length - 1].x, y: points[points.length - 1].y });

  for (let i = points.length - 1; i > 0; i--) {
    const prev = points[i - 1];
    const curr = points[i];

    if (curr.type === 'L' || curr.type === 'M') {
      reversed.push({ type: 'L', x: prev.x, y: prev.y });
    } else if (curr.type === 'Q') {
      reversed.push({
        type: 'Q',
        x1: curr.x1, y1: curr.y1,
        x: prev.x, y: prev.y
      });
    } else if (curr.type === 'C') {
      reversed.push({
        type: 'C',
        x1: curr.x2, y1: curr.y2,
        x2: curr.x1, y2: curr.y1,
        x: prev.x, y: prev.y
      });
    }
  }

  reversed.push({ type: 'Z' });
  return reversed;
}

/**
 * Apply Chaikin's corner-cutting algorithm to smooth path commands.
 * Each iteration replaces sharp corners with smoother curves by inserting
 * points at 25% and 75% along each segment. Converges to a B-spline.
 *
 * @param {Array} commands - opentype path commands (M/L/Q/C/Z)
 * @param {number} iterations - number of smoothing iterations (0 = no change)
 * @returns {Array} smoothed path commands
 */
export function chaikinSmooth(commands, iterations = 0) {
  if (iterations <= 0 || commands.length === 0) return commands;

  // Split into contours
  const contours = [];
  let current = [];
  for (const cmd of commands) {
    current.push(cmd);
    if (cmd.type === 'Z') {
      contours.push(current);
      current = [];
    }
  }
  if (current.length > 0) contours.push(current);

  const result = [];
  for (const contour of contours) {
    result.push(...smoothContour(contour, iterations));
  }
  return result;
}

function smoothContour(contour, iterations) {
  // Extract vertex positions (endpoints only — Q/C control points are skipped)
  let points = [];
  for (const cmd of contour) {
    if (cmd.type !== 'Z' && cmd.x !== undefined && cmd.y !== undefined) {
      points.push({ x: cmd.x, y: cmd.y });
    }
  }

  if (points.length < 3) return contour; // can't smooth a triangle or less

  const closed = contour[contour.length - 1]?.type === 'Z';

  for (let iter = 0; iter < iterations; iter++) {
    points = chaikinIteration(points, closed);
  }

  // Rebuild as M + L... + Z
  const result = [];
  if (points.length > 0) {
    result.push({ type: 'M', x: points[0].x, y: points[0].y });
    for (let i = 1; i < points.length; i++) {
      result.push({ type: 'L', x: points[i].x, y: points[i].y });
    }
    if (closed) result.push({ type: 'Z' });
  }
  return result;
}

function chaikinIteration(points, closed) {
  if (points.length < 2) return points;
  const n = points.length;
  const result = [];

  if (closed) {
    for (let i = 0; i < n; i++) {
      const p0 = points[i];
      const p1 = points[(i + 1) % n];
      result.push({
        x: Math.round((0.75 * p0.x + 0.25 * p1.x) * 100) / 100,
        y: Math.round((0.75 * p0.y + 0.25 * p1.y) * 100) / 100
      });
      result.push({
        x: Math.round((0.25 * p0.x + 0.75 * p1.x) * 100) / 100,
        y: Math.round((0.25 * p0.y + 0.75 * p1.y) * 100) / 100
      });
    }
  } else {
    result.push(points[0]);
    for (let i = 0; i < n - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      result.push({
        x: Math.round((0.75 * p0.x + 0.25 * p1.x) * 100) / 100,
        y: Math.round((0.75 * p0.y + 0.25 * p1.y) * 100) / 100
      });
      result.push({
        x: Math.round((0.25 * p0.x + 0.75 * p1.x) * 100) / 100,
        y: Math.round((0.25 * p0.y + 0.75 * p1.y) * 100) / 100
      });
    }
    result.push(points[n - 1]);
  }

  return result;
}

/**
 * Remove noise paths (very small paths)
 */
export function cleanupPaths(pathCommands, minArea = 50) {
  // Split into contours and remove tiny ones
  const contours = [];
  let current = [];

  for (const cmd of pathCommands) {
    current.push(cmd);
    if (cmd.type === 'Z') {
      contours.push(current);
      current = [];
    }
  }
  if (current.length > 0) contours.push(current);

  const cleaned = [];
  for (const contour of contours) {
    const area = Math.abs(signedArea(contour));
    if (area >= minArea) {
      cleaned.push(...contour);
    }
  }

  return cleaned;
}
