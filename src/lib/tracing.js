import ImageTracer from 'imagetracerjs';
import { EM_SQUARE } from './constants.js';

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
 */
export function svgPathToOpentypePath(svgPathData, sourceWidth, sourceHeight, emSquare = EM_SQUARE) {
  const commands = [];
  const scale = emSquare / Math.max(sourceWidth, sourceHeight);
  // Center horizontally
  const offsetX = (emSquare - sourceWidth * scale) / 2;
  // Flip Y: font coords have Y going up, SVG has Y going down
  // Place baseline at ~20% from bottom (descender region)
  const baselineOffset = emSquare * 0.15;

  function tx(x) { return Math.round((x * scale + offsetX) * 100) / 100; }
  function ty(y) { return Math.round((emSquare - y * scale - baselineOffset) * 100) / 100; }

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
 * Split commands into individual contours and fix winding direction
 *
 * TrueType convention (Y-up coordinate system):
 *   - Outer contours: clockwise → signedArea < 0 (trapezoidal formula)
 *   - Inner contours (holes): counter-clockwise → signedArea > 0
 */
function fixWinding(commands) {
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

  if (contours.length === 0) return commands;

  // Compute area for each contour and sort by absolute area (largest = outer)
  const contourData = contours.map(c => ({ contour: c, area: signedArea(c) }));
  contourData.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));

  // Largest contour = outer → must be clockwise (area < 0 in Y-up trapezoidal formula)
  // Smaller contours = inner holes → must be counter-clockwise (area > 0)
  const fixed = [];
  for (let i = 0; i < contourData.length; i++) {
    const { contour, area } = contourData[i];
    const isOuter = i === 0;

    if (isOuter && area > 0) {
      // Outer contour is CCW — reverse to CW
      fixed.push(...reverseContour(contour));
    } else if (!isOuter && area < 0) {
      // Inner contour is CW — reverse to CCW
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
