/**
 * Hash-based Agent API for image2ttf.
 *
 * Allows AI agents (or any programmatic caller) to drive the full pipeline
 * via URL hash parameters and/or window.__image2ttf.
 *
 * === URL Formats ===
 *
 * Strategy A (URL-only):
 *   #api/generate?imageUrl=<url>&fontName=MyFont&detail=5&smoothing=2&spaceWidth=60
 *
 * Strategy B (JS-driven):
 *   #api/ready
 *   then call: window.__image2ttf.run({ image: 'data:image/png;base64,...', fontName: 'X' })
 *
 * Strategy C (inline base64 in hash):
 *   #api/generate?imageData=<base64>&fontName=MyFont
 *
 * === Status Channels ===
 *   1. document.title  — "api:<state>" or "api:tracing 12/88"
 *   2. DOM #api-status  — same text
 *   3. window.__image2ttf.status/progress/total/message
 *   4. console.log('__API__:<state>:<detail>')
 */

import { detectGridAsync, runTracingAsync, abortCompute } from './compute.js';
import { createFont, injectGposTable, injectKernTable, buildKernPairs, downloadFont } from './font-builder.js';
import { DEFAULT_CHAR_LAYOUT, DEFAULT_CHARSET } from './constants.js';
import { createLogger } from './logger.js';

const logger = createLogger('api');

// ── State exposed on window.__image2ttf ─────────────────

const apiState = {
  status: 'idle',       // idle | loading | detecting | tracing | building | done | error
  progress: 0,
  total: 0,
  message: '',
  fontBlobUrl: null,
  fontArrayBuffer: null,
  glyphCount: 0,
  fontName: '',

  // Commands
  run: runPipeline,
  abort: abortPipeline,
};

/** Install window.__image2ttf and return the state object */
export function initApi() {
  if (typeof window !== 'undefined') {
    window.__image2ttf = apiState;
  }
  return apiState;
}

// ── Hash parsing ────────────────────────────────────────

/**
 * Parse #api/{action}?{params} from location.hash.
 * Returns null if the hash is not an API call.
 * @returns {{ action: string, params: Record<string, string> } | null}
 */
export function parseApiHash() {
  if (typeof location === 'undefined') return null;
  const hash = location.hash;
  if (!hash.startsWith('#api/')) return null;

  const withoutPrefix = hash.slice(5); // remove '#api/'
  const qIdx = withoutPrefix.indexOf('?');
  const action = qIdx >= 0 ? withoutPrefix.slice(0, qIdx) : withoutPrefix;
  const paramStr = qIdx >= 0 ? withoutPrefix.slice(qIdx + 1) : '';

  const params = {};
  if (paramStr) {
    for (const pair of paramStr.split('&')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx >= 0) {
        params[decodeURIComponent(pair.slice(0, eqIdx))] = decodeURIComponent(pair.slice(eqIdx + 1));
      }
    }
  }

  return { action, params };
}

/**
 * Check if the current URL hash indicates API mode.
 */
export function isApiMode() {
  return parseApiHash() !== null;
}

// ── Status reporting (multi-channel) ────────────────────

function setStatus(status, message = '', progress = 0, total = 0) {
  apiState.status = status;
  apiState.message = message || status;
  apiState.progress = progress;
  apiState.total = total;

  // Channel 1: document.title
  const titleMsg = total > 0 ? `api:${status} ${progress}/${total}` : `api:${status}`;
  if (typeof document !== 'undefined') {
    document.title = titleMsg;
  }

  // Channel 2: DOM element
  if (typeof document !== 'undefined') {
    const el = document.getElementById('api-status');
    if (el) el.textContent = message || titleMsg;
  }

  // Channel 3: window.__image2ttf (already set above on apiState)

  // Channel 4: console
  logger.info(`__API__:${status}:${message || ''}`);
  if (typeof console !== 'undefined') {
    console.log(`__API__:${titleMsg}`);
  }
}

// ── Image loading ───────────────────────────────────────

/**
 * Load an image from a URL or data URI into an HTMLCanvasElement.
 * @param {string} src — URL, data URI, or blob URL
 * @returns {Promise<HTMLCanvasElement>}
 */
function loadImageToCanvas(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error(`Failed to load image from: ${src.slice(0, 100)}...`));
    img.src = src;
  });
}

// ── Pipeline ────────────────────────────────────────────

let running = false;

/**
 * Run the full pipeline: load image → detect grid → trace glyphs → build font.
 *
 * @param {object} opts
 * @param {string} opts.image — URL, data URI (data:image/png;base64,...), or blob URL
 * @param {string} [opts.fontName='MyHandwriting']
 * @param {number} [opts.detail=5] — 1-10
 * @param {number} [opts.smoothing=2] — 0-5
 * @param {number} [opts.spaceWidth=60] — space width as % of avg lowercase width
 * @param {string[]} [opts.charset] — character layout, one string per row
 * @param {boolean} [opts.autoDownload=false] — trigger browser download when done
 * @returns {Promise<{ fontBlobUrl: string, fontArrayBuffer: ArrayBuffer, glyphCount: number }>}
 */
export async function runPipeline(opts = {}) {
  if (running) throw new Error('Pipeline already running. Call abort() first.');
  running = true;

  const {
    image,
    fontName = 'MyHandwriting',
    detail = 5,
    smoothing = 2,
    spaceWidth = 60,
    charset,
    autoDownload = false,
  } = opts;

  apiState.fontName = fontName;

  try {
    // ── 1. Load image ──
    if (!image) throw new Error('No image provided. Pass image as URL or data URI.');
    setStatus('loading', 'Loading image...');
    const canvas = await loadImageToCanvas(image);
    logger.info(`Image loaded: ${canvas.width}x${canvas.height}`);

    // ── 2. Detect grid ──
    setStatus('detecting', 'Detecting character grid...');

    const charLayout = charset && charset.length > 0 ? charset : DEFAULT_CHAR_LAYOUT;
    const hints = {
      expectedRows: charLayout.length,
      expectedColsPerRow: charLayout.map(r => r.length),
    };

    const grid = await detectGridAsync(canvas, hints);
    if (!grid || grid.cells.length === 0) {
      throw new Error('Grid detection failed: no character rows found.');
    }

    const flatCells = grid.cells.flat();
    const charsetFlat = charLayout.flatMap(r => r.split(''));
    const charMap = charsetFlat.slice(0, flatCells.length);
    while (charMap.length < flatCells.length) charMap.push('?');

    logger.info(`Grid detected: ${grid.cells.length} rows, ${flatCells.length} cells`);

    // ── 3. Trace glyphs ──
    setStatus('tracing', 'Tracing glyphs...', 0, flatCells.length);

    const glyphMap = await runTracingAsync(
      canvas,
      grid.cells,
      charMap,
      { detail, smoothing, spaceWidthPercent: spaceWidth },
      (current, total) => setStatus('tracing', `Tracing glyphs... ${current}/${total}`, current, total)
    );

    logger.info(`Traced ${glyphMap.size} glyphs`);

    // ── 4. Build font ──
    setStatus('building', 'Building font...');

    const font = createFont(glyphMap, { familyName: fontName });
    let buffer = font.toArrayBuffer();

    // No kerning pairs in API mode (could be added later)
    const blob = new Blob([buffer], { type: 'font/ttf' });
    const blobUrl = URL.createObjectURL(blob);

    // ── 5. Expose results ──
    apiState.fontBlobUrl = blobUrl;
    apiState.fontArrayBuffer = buffer;
    apiState.glyphCount = glyphMap.size;

    setStatus('done', `Done — ${glyphMap.size} glyphs`);

    // Auto-download if requested
    if (autoDownload) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${fontName.replace(/[^a-zA-Z0-9_-]/g, '_')}.ttf`;
      a.click();
    }

    return { fontBlobUrl: blobUrl, fontArrayBuffer: buffer, glyphCount: glyphMap.size };
  } catch (err) {
    if (err.message === 'Aborted') {
      setStatus('error', 'Aborted by user');
    } else {
      setStatus('error', err.message);
    }
    throw err;
  } finally {
    running = false;
  }
}

/**
 * Abort a running pipeline.
 */
export function abortPipeline() {
  abortCompute();
  running = false;
  setStatus('error', 'Aborted');
}

// ── Auto-run from hash params ───────────────────────────

/**
 * If the URL hash contains #api/generate?..., auto-run the pipeline.
 * If it contains #api/ready, just initialize and wait for run() calls.
 * @returns {Promise<void>}
 */
export async function autoRunFromHash() {
  const parsed = parseApiHash();
  if (!parsed) return;

  initApi();

  if (parsed.action === 'ready') {
    setStatus('idle', 'Ready — call window.__image2ttf.run({...})');
    return;
  }

  if (parsed.action === 'generate') {
    const { imageUrl, imageData, fontName, detail, smoothing, spaceWidth, charset, autoDownload } = parsed.params;

    // Determine image source
    let image = null;
    if (imageData) {
      // Base64 data passed directly in hash
      image = imageData.startsWith('data:') ? imageData : `data:image/png;base64,${imageData}`;
    } else if (imageUrl) {
      image = imageUrl;
    } else if (typeof window !== 'undefined' && window.__image2ttf_input) {
      // Agent pre-set the image via JS
      image = window.__image2ttf_input;
    }

    const charsetArray = charset ? charset.split('|') : undefined;

    try {
      await runPipeline({
        image,
        fontName: fontName || 'MyHandwriting',
        detail: detail ? parseInt(detail) : 5,
        smoothing: smoothing ? parseInt(smoothing) : 2,
        spaceWidth: spaceWidth ? parseInt(spaceWidth) : 60,
        charset: charsetArray,
        autoDownload: autoDownload === 'true' || autoDownload === '1',
      });
    } catch (err) {
      // Error already reported via setStatus
      logger.error('Auto-run failed:', err);
    }
  }
}
